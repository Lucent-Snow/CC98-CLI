import { CC98_LOGO_ART, EMOJI_ART, type PixelArt } from "./emoji-art.js";

const reset = "\x1b[0m";
const transparent = ".";

export { CC98_LOGO_ART };

export interface EmojiCategory {
  readonly id: string;
  readonly label: string;
  readonly source: string;
  readonly codes: readonly string[];
}

export const EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  makeCategory("ac-white", "AC 娘", "ac-white", (code) => /^ac\d{2,4}$/.test(code)),
  makeCategory("CC98", "CC98 专属", "CC98", (code) => /^cc98\d{2}$/.test(code)),
  makeCategory("em", "经典表情", "em", (code) => /^em\d{2}$/.test(code)),
  makeCategory("ms", "雀魂/麻将", "ms", (code) => /^ms\d{2}$/.test(code)),
  makeCategory("tb", "贴吧系", "tb", (code) => /^tb\d{2}$/.test(code)),
];

export function isEmojiCode(code: string): boolean {
  return normalizeEmojiCode(code) in EMOJI_ART;
}

export function getEmojiArt(code: string): PixelArt | undefined {
  return EMOJI_ART[normalizeEmojiCode(code)];
}

export function renderEmojiCode(code: string): string | undefined {
  const normalized = normalizeEmojiCode(code);
  const art = EMOJI_ART[normalized];
  return art ? renderPixelArt(art) : undefined;
}

export function renderCc98Logo(): string {
  return renderPixelArt(CC98_LOGO_ART);
}

export function normalizeEmojiCode(code: string): string {
  return code.trim().toLowerCase();
}

function makeCategory(id: string, label: string, source: string, match: (code: string) => boolean): EmojiCategory {
  return {
    id,
    label,
    source,
    codes: Object.keys(EMOJI_ART).filter(match).sort(compareEmojiCode),
  };
}

function compareEmojiCode(left: string, right: string): number {
  const leftParts = splitEmojiCode(left);
  const rightParts = splitEmojiCode(right);
  if (leftParts.prefix !== rightParts.prefix) {
    return leftParts.prefix.localeCompare(rightParts.prefix);
  }
  return leftParts.number - rightParts.number;
}

function splitEmojiCode(code: string): { prefix: string; number: number } {
  const match = code.match(/^([a-z]+)(\d+)$/i);
  return match ? { prefix: match[1].toLowerCase(), number: Number(match[2]) } : { prefix: code, number: 0 };
}

export function renderPixelArt(art: PixelArt): string {
  const output: string[] = [];
  for (let y = 0; y < art.height; y += 2) {
    const upper = art.rows[y] ?? "";
    const lower = art.rows[y + 1] ?? "";
    let line = "";
    for (let x = 0; x < art.width; x += 1) {
      const upperColor = colorAt(art, upper[x]);
      const lowerColor = colorAt(art, lower[x]);
      if (upperColor && lowerColor) {
        line += `${reset}${fg(upperColor)}${bg(lowerColor)}▀`;
      } else if (upperColor) {
        line += `${reset}${fg(upperColor)}▀`;
      } else if (lowerColor) {
        line += `${reset}${fg(lowerColor)}▄`;
      } else {
        line += `${reset} `;
      }
    }
    output.push(`${line}${reset}`);
  }
  return output.join("\n");
}

function colorAt(art: PixelArt, value: string | undefined): string | undefined {
  if (!value || value === transparent) return undefined;
  const index = decodeIndex(value);
  return art.palette[index];
}

function decodeIndex(value: string): number {
  const code = value.codePointAt(0) ?? 0;
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 90) return code - 65 + 10;
  if (code >= 97 && code <= 122) return code - 97 + 36;
  if (value === "+") return 62;
  if (value === "-") return 63;
  return -1;
}

function fg(color: string): string {
  const { r, g, b } = parseColor(color);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function bg(color: string): string {
  const { r, g, b } = parseColor(color);
  return `\x1b[48;2;${r};${g};${b}m`;
}

function parseColor(color: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(color.slice(0, 2), 16),
    g: parseInt(color.slice(2, 4), 16),
    b: parseInt(color.slice(4, 6), 16),
  };
}
