// Inline image rendering for supported terminals
// Supports iTerm2 Inline Images Protocol and Kitty Graphics Protocol

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { getImageCache } from "../storage/image-cache.js";
import { detectTerminalCapabilities, getImageProtocol, type ImageProtocol } from "./terminal-capabilities.js";

export interface ImageRenderOptions {
  /** Maximum width in terminal columns */
  maxWidth?: number;
  /** Maximum height in terminal rows */
  maxHeight?: number;
  /** Whether to preserve aspect ratio (default: true) */
  preserveAspectRatio?: boolean;
}

export interface RenderedImage {
  /** The ANSI escape sequence to display the image */
  escapeSequence: string;
  /** Number of terminal rows the image occupies */
  rows: number;
  /** Number of terminal columns the image occupies */
  cols: number;
  /** Original image width (if detectable) */
  originalWidth?: number;
  /** Original image height (if detectable) */
  originalHeight?: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export function getImageDimensionsSync(filePath: string): ImageDimensions | undefined {
  try {
    const data = readFileSync(filePath);
    return parseImageDimensions(data);
  } catch {
    return undefined;
  }
}

/**
 * Render a local image file to an ANSI escape sequence
 */
export async function renderLocalImage(
  filePath: string,
  options: ImageRenderOptions = {}
): Promise<RenderedImage | null> {
  const protocol = getImageProtocol();
  if (!isSupportedProtocol(protocol)) return null;

  try {
    const data = await readFile(filePath);
    return renderImageData(protocol, filePath, data, options);
  } catch {
    return null;
  }
}

/**
 * Render a cached local image synchronously for the TUI render path.
 */
export function renderLocalImageSync(
  filePath: string,
  options: ImageRenderOptions = {}
): RenderedImage | null {
  const protocol = getImageProtocol();
  if (!isSupportedProtocol(protocol)) return null;

  try {
    const data = readFileSync(filePath);
    return renderImageData(protocol, filePath, data, options);
  } catch {
    return null;
  }
}

/**
 * Render image from URL (download if needed, then render)
 */
export async function renderImageFromUrl(
  url: string,
  options: ImageRenderOptions = {}
): Promise<RenderedImage | null> {
  const protocol = getImageProtocol();
  if (!isSupportedProtocol(protocol)) return null;

  try {
    const cache = getImageCache();
    const localPath = await cache.getOrDownload(url);
    return renderLocalImage(localPath, options);
  } catch {
    return null;
  }
}

/**
 * iTerm2 Inline Images Protocol
 * @see https://iterm2.com/documentation-images.html
 */
function renderImageData(
  protocol: ImageProtocol,
  filePath: string,
  data: Buffer,
  options: ImageRenderOptions
): RenderedImage | null {
  switch (protocol) {
    case "iterm2":
      return wrapForTerminal(renderIterm2(data.toString("base64"), options));
    case "kitty":
      return wrapForTerminal(renderKitty(filePath, options));
    case "sixel":
      return renderSixel(filePath, options);
    default:
      return null;
  }
}

function renderIterm2(base64: string, options: ImageRenderOptions): RenderedImage {
  const params: string[] = [];

  // Preserve aspect ratio
  if (options.preserveAspectRatio !== false) {
    params.push("preserveAspectRatio=1");
  }

  // iTerm2 is most reliable when width/height are passed as pixels.
  // Estimate from terminal cells so layout can still reserve text rows.
  if (options.maxWidth) {
    params.push(`width=${Math.max(1, Math.floor(options.maxWidth * 8))}px`);
  }

  if (options.maxHeight) {
    params.push(`height=${Math.max(1, Math.floor(options.maxHeight * 18))}px`);
  }

  // Inline=1 means display in terminal (not as a separate window)
  params.push("inline=1");

  const paramStr = params.join(";");

  // OSC 1337 ; File=<params> : <base64-data> BEL
  const escapeSequence = `\x1b]1337;File=${paramStr}:${base64}\x07`;

  // Estimate rows based on maxWidth (assuming 2:1 char aspect ratio)
  const rows = options.maxHeight ?? Math.ceil((options.maxWidth ?? 40) * 0.5);
  const cols = options.maxWidth ?? 40;

  return { escapeSequence, rows, cols };
}

/**
 * Kitty Graphics Protocol
 * @see https://sw.kovidgoyal.net/kitty/graphics-protocol/
 */
function renderKitty(filePath: string, options: ImageRenderOptions): RenderedImage {
  // Use file transfer so Kitty can decode PNG/JPEG/GIF/WebP/SVG itself.
  let controlData = "a=t,t=f";

  if (options.maxWidth) {
    controlData += `,c=${Math.max(1, Math.floor(options.maxWidth))}`; // columns
  }
  if (options.maxHeight) {
    controlData += `,r=${Math.max(1, Math.floor(options.maxHeight))}`; // rows
  }

  const pathData = Buffer.from(filePath, "utf8").toString("base64");
  const escapeSequence = `\x1b_G${controlData};${pathData}\x1b\\`;
  const rows = options.maxHeight ?? Math.ceil((options.maxWidth ?? 40) * 0.5);
  const cols = options.maxWidth ?? 40;

  return { escapeSequence, rows, cols };
}

function renderSixel(filePath: string, options: ImageRenderOptions): RenderedImage | null {
  const cols = Math.max(1, Math.floor(options.maxWidth ?? 24));
  const rows = Math.max(1, Math.floor(options.maxHeight ?? 7));
  const widthPx = cols * 8;

  const img2sixel = spawnSync("img2sixel", ["-w", String(widthPx), filePath], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  });
  if (img2sixel.status === 0 && img2sixel.stdout) {
    return wrapForTerminal({ escapeSequence: img2sixel.stdout, rows, cols });
  }

  const chafa = spawnSync("chafa", [`--size=${cols}x${rows}`, "--format=sixels", filePath], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  });
  if (chafa.status === 0 && chafa.stdout) {
    return wrapForTerminal({ escapeSequence: chafa.stdout, rows, cols });
  }

  return null;
}

function wrapForTerminal(image: RenderedImage): RenderedImage {
  const capabilities = detectTerminalCapabilities();
  if (!capabilities.passthrough) {
    return image;
  }
  return {
    ...image,
    escapeSequence: wrapTmuxPassthrough(image.escapeSequence)
  };
}

function wrapTmuxPassthrough(sequence: string): string {
  return `\x1bPtmux;${sequence.replace(/\x1b/g, "\x1b\x1b")}\x1b\\`;
}

function isSupportedProtocol(protocol: ImageProtocol): protocol is "iterm2" | "kitty" | "sixel" {
  return protocol === "iterm2" || protocol === "kitty" || protocol === "sixel";
}

function parseImageDimensions(data: Buffer): ImageDimensions | undefined {
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return {
      width: data.readUInt32BE(16),
      height: data.readUInt32BE(20)
    };
  }

  if (data.length >= 10 && data.toString("ascii", 0, 3) === "GIF") {
    return {
      width: data.readUInt16LE(6),
      height: data.readUInt16LE(8)
    };
  }

  if (data.length >= 12 && data.readUInt16BE(0) === 0xffd8) {
    return parseJpegDimensions(data);
  }

  if (data.length >= 30 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") {
    return parseWebpDimensions(data);
  }

  return undefined;
}

function parseJpegDimensions(data: Buffer): ImageDimensions | undefined {
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    if (offset + 2 > data.length) {
      break;
    }
    const length = data.readUInt16BE(offset);
    if (length < 2 || offset + length > data.length) {
      break;
    }
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: data.readUInt16BE(offset + 3),
        width: data.readUInt16BE(offset + 5)
      };
    }
    offset += length;
  }
  return undefined;
}

function parseWebpDimensions(data: Buffer): ImageDimensions | undefined {
  const type = data.toString("ascii", 12, 16);
  if (type === "VP8 " && data.length >= 30) {
    return {
      width: data.readUInt16LE(26) & 0x3fff,
      height: data.readUInt16LE(28) & 0x3fff
    };
  }
  if (type === "VP8L" && data.length >= 25) {
    const bits = data.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    };
  }
  if (type === "VP8X" && data.length >= 30) {
    return {
      width: readUInt24LE(data, 24) + 1,
      height: readUInt24LE(data, 27) + 1
    };
  }
  return undefined;
}

function readUInt24LE(data: Buffer, offset: number): number {
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
}

/**
 * Generate a placeholder text for terminals that don't support images
 */
export function getImagePlaceholder(url: string, index: number): string {
  // Shorten URL for display
  let shortUrl = url;
  try {
    const parsed = new URL(url);
    const fileName = parsed.pathname.split("/").filter(Boolean).at(-1) ?? "";
    shortUrl = `${parsed.host}/${fileName}`;
  } catch {
    // Keep original if URL parsing fails
  }

  return `[image ${index}] ${shortUrl}`;
}

/**
 * Generate help text for image actions
 */
export function getImageActions(): string {
  return `          o 打开  c 复制图片`;
}
