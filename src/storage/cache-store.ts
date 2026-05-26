import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getCacheDir } from "./paths.js";

interface CacheEntry<T> {
  createdAt: number;
  expiresAt: number;
  value: T;
}

interface CacheStoreOptions {
  /** Maximum number of entries in memory cache */
  maxMemoryEntries?: number;
  /** Maximum age in ms for file cache cleanup (default: 7 days) */
  maxFileAge?: number;
  /** Whether to run cleanup on init */
  cleanupOnInit?: boolean;
}

const DEFAULT_MAX_MEMORY_ENTRIES = 500;
const DEFAULT_MAX_FILE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

export class CacheStore {
  private readonly memory = new Map<string, CacheEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly accessOrder = new Map<string, number>(); // LRU tracking
  private accessCounter = 0;
  private readonly maxMemoryEntries: number;
  private readonly maxFileAge: number;
  private readonly cacheDir: string;

  constructor(
    cacheDir = getCacheDir(),
    options: CacheStoreOptions = {}
  ) {
    this.cacheDir = cacheDir;
    this.maxMemoryEntries = options.maxMemoryEntries ?? DEFAULT_MAX_MEMORY_ENTRIES;
    this.maxFileAge = options.maxFileAge ?? DEFAULT_MAX_FILE_AGE;

    if (options.cleanupOnInit !== false) {
      // Run cleanup in background, don't block constructor
      this.cleanupFileCache().catch(() => {
        // Ignore cleanup errors on init
      });
    }
  }

  async getOrSet<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>,
    options: { force?: boolean } = {}
  ): Promise<T> {
    if (!options.force) {
      const cached = await this.get<T>(key);
      if (cached.hit) {
        return cached.value;
      }

      const pending = this.inflight.get(key);
      if (pending) {
        return pending as Promise<T>;
      }
    }

    const promise = fetcher().then(async (value) => {
      await this.set(key, value, ttlMs);
      return value;
    }).finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise;
  }

  async get<T>(key: string): Promise<{ hit: true; value: T } | { hit: false }> {
    const now = Date.now();
    const memoryEntry = this.memory.get(key) as CacheEntry<T> | undefined;
    if (memoryEntry && memoryEntry.expiresAt > now) {
      this.touchEntry(key);
      return { hit: true, value: memoryEntry.value };
    }

    // Remove expired memory entry
    if (memoryEntry) {
      this.memory.delete(key);
      this.accessOrder.delete(key);
    }

    try {
      const raw = await readFile(this.pathFor(key), "utf8");
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (entry.expiresAt > now) {
        this.setMemoryEntry(key, entry);
        return { hit: true, value: entry.value };
      }
    } catch (error: unknown) {
      if (!isFileNotFound(error)) {
        throw error;
      }
    }

    return { hit: false };
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      createdAt: now,
      expiresAt: now + ttlMs,
      value
    };
    this.setMemoryEntry(key, entry);
    await mkdir(this.cacheDir, { recursive: true, mode: 0o700 });
    await writeFile(this.pathFor(key), `${JSON.stringify(entry)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
  }

  async delete(key: string): Promise<void> {
    this.memory.delete(key);
    this.accessOrder.delete(key);
    await rm(this.pathFor(key), { force: true });
  }

  /**
   * Clear all memory cache entries
   */
  clearMemory(): void {
    this.memory.clear();
    this.accessOrder.clear();
    this.accessCounter = 0;
  }

  /**
   * Clear all file cache entries
   */
  async clearFileCache(): Promise<void> {
    try {
      const files = await readdir(this.cacheDir);
      await Promise.all(
        files
          .filter((f) => f.endsWith(".json"))
          .map((f) => rm(join(this.cacheDir, f), { force: true }))
      );
    } catch (error: unknown) {
      if (!isFileNotFound(error)) {
        throw error;
      }
    }
  }

  /**
   * Clear everything (memory + file cache)
   */
  async clearAll(): Promise<void> {
    this.clearMemory();
    await this.clearFileCache();
  }

  /**
   * Remove expired entries from file cache
   */
  async cleanupFileCache(): Promise<{ removed: number; kept: number }> {
    let removed = 0;
    let kept = 0;

    try {
      const files = await readdir(this.cacheDir);
      const now = Date.now();

      const results = await Promise.allSettled(
        files
          .filter((f) => f.endsWith(".json"))
          .map(async (f) => {
            const filePath = join(this.cacheDir, f);

            try {
              // Check file modification time first (fast check)
              const fileStat = await stat(filePath);
              const fileAge = now - fileStat.mtimeMs;

              if (fileAge > this.maxFileAge) {
                await rm(filePath, { force: true });
                return "removed-by-age" as const;
              }

              // Check if cache entry is expired
              const raw = await readFile(filePath, "utf8");
              const entry = JSON.parse(raw) as CacheEntry<unknown>;

              if (entry.expiresAt <= now) {
                await rm(filePath, { force: true });
                return "removed-expired" as const;
              }

              return "kept" as const;
            } catch {
              // If we can't read/parse, remove it
              await rm(filePath, { force: true }).catch(() => {});
              return "removed-error" as const;
            }
          })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          if (result.value === "kept") {
            kept++;
          } else {
            removed++;
          }
        } else {
          removed++;
        }
      }
    } catch (error: unknown) {
      if (!isFileNotFound(error)) {
        throw error;
      }
    }

    return { removed, kept };
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    memoryEntries: number;
    inflightRequests: number;
    fileCacheEntries: number;
  }> {
    let fileCacheEntries = 0;

    try {
      const files = await readdir(this.cacheDir);
      fileCacheEntries = files.filter((f) => f.endsWith(".json")).length;
    } catch {
      // Ignore errors
    }

    return {
      memoryEntries: this.memory.size,
      inflightRequests: this.inflight.size,
      fileCacheEntries
    };
  }

  private setMemoryEntry(key: string, entry: CacheEntry<unknown>): void {
    // Evict LRU entries if we're at capacity
    if (this.memory.size >= this.maxMemoryEntries && !this.memory.has(key)) {
      this.evictLRU();
    }

    this.memory.set(key, entry);
    this.touchEntry(key);
  }

  private touchEntry(key: string): void {
    this.accessOrder.set(key, ++this.accessCounter);
  }

  private evictLRU(): void {
    // Find the entry with the smallest access counter
    let oldestKey: string | undefined;
    let oldestAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.memory.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
    }
  }

  private pathFor(key: string): string {
    const hash = createHash("sha256").update(key).digest("hex");
    return join(this.cacheDir, `${hash}.json`);
  }
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT";
}
