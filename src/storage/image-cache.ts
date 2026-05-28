import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { getCacheDir } from "./paths.js";

export interface ImageCacheOptions {
  cacheDir?: string;
  maxAge?: number; // 缓存过期时间（毫秒），默认 7 天
}

export class ImageCache {
  private readonly cacheDir: string;
  private readonly maxAge: number;

  constructor(options: ImageCacheOptions = {}) {
    this.cacheDir = options.cacheDir ?? join(getCacheDir(), "images");
    this.maxAge = options.maxAge ?? 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  /**
   * 获取图片的本地缓存路径
   */
  getCachePath(url: string): string {
    const hash = createHash("sha256").update(url).digest("hex");
    const ext = this.getExtension(url);
    return join(this.cacheDir, `${hash}${ext}`);
  }

  /**
   * 检查图片是否已缓存且未过期
   */
  async isCached(url: string): Promise<boolean> {
    const cachePath = this.getCachePath(url);
    try {
      const fileStat = await stat(cachePath);
      const age = Date.now() - fileStat.mtimeMs;
      return age < this.maxAge;
    } catch {
      return false;
    }
  }

  /**
   * 获取缓存的图片路径，如果不存在则下载
   * @returns 本地文件路径
   */
  async getOrDownload(url: string): Promise<string> {
    const cachePath = this.getCachePath(url);

    // 检查缓存
    if (await this.isCached(url)) {
      return cachePath;
    }

    // 下载图片
    await this.download(url, cachePath);
    return cachePath;
  }

  /**
   * 下载图片到指定路径
   */
  async download(url: string, destPath: string): Promise<void> {
    // 确保目录存在
    await mkdir(this.cacheDir, { recursive: true, mode: 0o700 });

    // 下载
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`download failed: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    await writeFile(destPath, Buffer.from(buffer), { mode: 0o600 });
  }

  /**
   * 从 URL 推断文件扩展名
   */
  private getExtension(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const ext = extname(pathname).toLowerCase();

      // 常见图片格式
      if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"].includes(ext)) {
        return ext;
      }

      // 默认使用 .jpg
      return ".jpg";
    } catch {
      return ".jpg";
    }
  }
}

// 单例
let defaultCache: ImageCache | undefined;

export function getImageCache(): ImageCache {
  if (!defaultCache) {
    defaultCache = new ImageCache();
  }
  return defaultCache;
}
