import { CacheStore } from "../../storage/cache-store.js";

export async function cacheCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case undefined:
    case "--help":
    case "-h":
    case "help":
      printCacheHelp();
      return;

    case "stats": {
      const cache = new CacheStore();
      const stats = await cache.getStats();
      console.log(JSON.stringify(stats, null, 2));
      return;
    }

    case "cleanup": {
      const cache = new CacheStore();
      const result = await cache.cleanupFileCache();
      console.log(JSON.stringify({
        action: "cleanup",
        removed: result.removed,
        kept: result.kept
      }, null, 2));
      return;
    }

    case "clear": {
      const target = rest[0] ?? "all";
      const cache = new CacheStore();

      switch (target) {
        case "all":
          await cache.clearAll();
          console.log(JSON.stringify({ action: "clear", target: "all" }, null, 2));
          return;
        case "memory":
          cache.clearMemory();
          console.log(JSON.stringify({ action: "clear", target: "memory" }, null, 2));
          return;
        case "file":
          await cache.clearFileCache();
          console.log(JSON.stringify({ action: "clear", target: "file" }, null, 2));
          return;
        default:
          throw new Error(`unknown cache clear target: ${target}. Use "all", "memory", or "file".`);
      }
    }

    default:
      throw new Error(`unknown cache command: ${subcommand}. Run "cc98 cache --help" for usage.`);
  }
}

function printCacheHelp(): void {
  console.log(`cc98 cache

Usage:
  cc98 cache stats          Show cache statistics
  cc98 cache cleanup        Remove expired cache entries
  cc98 cache clear [target] Clear cache (default: all)

Clear targets:
  all                       Clear both memory and file cache
  memory                    Clear memory cache only
  file                      Clear file cache only

Options:
  -h, --help                Show this help
`);
}
