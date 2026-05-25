import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getCacheDir } from "./paths.js";

interface CacheEntry<T> {
  createdAt: number;
  expiresAt: number;
  value: T;
}

export class CacheStore {
  private readonly memory = new Map<string, CacheEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly cacheDir = getCacheDir()) {}

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
      return { hit: true, value: memoryEntry.value };
    }

    try {
      const raw = await readFile(this.pathFor(key), "utf8");
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (entry.expiresAt > now) {
        this.memory.set(key, entry);
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
    this.memory.set(key, entry);
    await mkdir(this.cacheDir, { recursive: true, mode: 0o700 });
    await writeFile(this.pathFor(key), `${JSON.stringify(entry)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
  }

  async delete(key: string): Promise<void> {
    this.memory.delete(key);
    await rm(this.pathFor(key), { force: true });
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
