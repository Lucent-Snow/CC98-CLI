// 组件工具函数

import { stripAnsi } from "../ansi.js";

// 截断字符串到指定宽度
export function fit(value: string, width: number): string {
  const stripped = stripAnsi(value);
  const strippedWidth = cellWidth(stripped);
  
  if (strippedWidth <= width) {
    return value + " ".repeat(Math.max(0, width - strippedWidth));
  }

  let out = "";
  let used = 0;
  for (let index = 0; index < value.length;) {
    if (value[index] === "\x1b") {
      const end = findEscapeEnd(value, index);
      out += value.slice(index, end);
      index = end;
      continue;
    }

    const codePoint = value.codePointAt(index);
    const char = codePoint === undefined ? value[index] : String.fromCodePoint(codePoint);
    const charWidth = charCellWidth(char);
    if (used + charWidth > width) {
      break;
    }
    out += char;
    used += charWidth;
    index += char.length;
  }

  return out;
}

// 计算字符串的显示宽度
export function cellWidth(value: string): number {
  let width = 0;
  for (const char of stripAnsi(value)) {
    width += charCellWidth(char);
  }
  return width;
}

// 计算单个字符的显示宽度
export function charCellWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code === 0) {
    return 0;
  }
  if (
    code >= 0x1100 &&
    (code <= 0x115f ||
      code === 0x2329 ||
      code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6))
  ) {
    return 2;
  }
  return 1;
}

// 创建空白行
export function blank(count: number, width: number): string[] {
  return Array.from({ length: count }, () => " ".repeat(width));
}

function findEscapeEnd(value: string, start: number): number {
  const next = value[start + 1];
  if (next === "]") {
    const bel = value.indexOf("\x07", start + 2);
    const st = value.indexOf("\x1b\\", start + 2);
    return firstTerminator(value.length, bel >= 0 ? bel + 1 : -1, st >= 0 ? st + 2 : -1);
  }
  if (next === "_" || next === "P") {
    const st = value.indexOf("\x1b\\", start + 2);
    return st >= 0 ? st + 2 : value.length;
  }
  if (next === "[") {
    for (let index = start + 2; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code >= 0x40 && code <= 0x7e) {
        return index + 1;
      }
    }
  }
  return Math.min(value.length, start + 2);
}

function firstTerminator(fallback: number, ...positions: number[]): number {
  const found = positions.filter((position) => position >= 0);
  return found.length > 0 ? Math.min(...found) : fallback;
}
