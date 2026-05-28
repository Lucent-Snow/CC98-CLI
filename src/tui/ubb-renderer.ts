// ANSI 转义码
const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  strikethrough: "\x1b[9m",
  // 前景色
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  // 亮色
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",
  // 特殊
  gray: "\x1b[90m",
} as const;

// CC98 颜色名到 ANSI 的映射
const COLOR_MAP: Record<string, string> = {
  // 基础颜色
  black: ANSI.black,
  red: ANSI.red,
  green: ANSI.green,
  yellow: ANSI.yellow,
  blue: ANSI.blue,
  magenta: ANSI.magenta,
  cyan: ANSI.cyan,
  white: ANSI.white,
  gray: ANSI.gray,
  grey: ANSI.gray,
  // 亮色
  orange: ANSI.brightRed,
  pink: ANSI.brightMagenta,
  purple: ANSI.magenta,
  // 其他常见颜色
  gold: ANSI.brightYellow,
  lime: ANSI.brightGreen,
  aqua: ANSI.brightCyan,
  teal: ANSI.cyan,
  navy: ANSI.blue,
  maroon: ANSI.red,
  olive: ANSI.yellow,
};

export interface RenderedPost {
  lines: string[];
  images: string[];
  links: string[];
}

export function renderUbbToLines(content: string, width: number): RenderedPost {
  const images: string[] = [];
  const links: string[] = [];
  let text = content.replace(/\r\n/g, "\n");

  // 1. 处理图片 [img]url[/img]
  text = text.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, (_match, url: string) => {
    const cleanUrl = url.trim();
    images.push(cleanUrl);
    const index = images.length;
    return `\n[image ${index}] ${shortUrl(cleanUrl)}\n          o 打开  c 复制链接\n`;
  });

  // 2. 处理链接 [url=...]text[/url] 和 [url]url[/url]
  text = text.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_match, url: string, label: string) => {
    const cleanUrl = url.trim();
    links.push(cleanUrl);
    return `${ANSI.underline}${ANSI.brightBlue}${stripUbb(label)}${ANSI.reset} ${ANSI.gray}[${links.length}]${ANSI.reset}`;
  });

  text = text.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_match, url: string) => {
    const cleanUrl = url.trim();
    links.push(cleanUrl);
    return `${ANSI.underline}${ANSI.brightBlue}${shortUrl(cleanUrl)}${ANSI.reset} ${ANSI.gray}[${links.length}]${ANSI.reset}`;
  });

  // 3. 处理引用 [quote]...[/quote] 和 [quote=author]...[/quote]
  text = text.replace(/\[quote(?:=([^\]]*))?\]([\s\S]*?)\[\/quote\]/gi, (_match, author: string, quoted: string) => {
    const prefix = author ? `${ANSI.gray}${stripUbb(author)} 说：${ANSI.reset}\n` : "";
    const lines = stripUbb(quoted).split("\n").map((line) => `${ANSI.gray}│ ${line}${ANSI.reset}`).join("\n");
    return `\n${prefix}${lines}\n`;
  });

  // 4. 处理代码块 [code]...[/code]
  text = text.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, (_match, code: string) => {
    const lines = code.split("\n").map((line) => `    ${line}`).join("\n");
    return `\n${ANSI.gray}${lines}${ANSI.reset}\n`;
  });

  // 5. 处理表情包 [acXX] [emXX] [cc98XX] [a:XXX] 等
  text = text.replace(/\[(ac\d{2,4})\]/gi, (_match, code: string) => {
    return `${ANSI.brightYellow}[${code}]${ANSI.reset}`;
  });
  text = text.replace(/\[(em\d{2})\]/gi, (_match, code: string) => {
    return `${ANSI.brightYellow}[${code}]${ANSI.reset}`;
  });
  text = text.replace(/\[(cc98\d{2})\]/gi, (_match, code: string) => {
    return `${ANSI.brightYellow}[${code}]${ANSI.reset}`;
  });
  text = text.replace(/\[(a:\d{3})\]/gi, (_match, code: string) => {
    return `${ANSI.brightYellow}[${code}]${ANSI.reset}`;
  });
  text = text.replace(/\[(tb\d{2})\]/gi, (_match, code: string) => {
    return `${ANSI.brightYellow}[${code}]${ANSI.reset}`;
  });

  // 6. 处理基本格式标签（转为 ANSI）
  text = text.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, (_match, content: string) => {
    return `${ANSI.bold}${content}${ANSI.reset}`;
  });
  text = text.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, (_match, content: string) => {
    return `${ANSI.italic}${content}${ANSI.reset}`;
  });
  text = text.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, (_match, content: string) => {
    return `${ANSI.underline}${content}${ANSI.reset}`;
  });
  text = text.replace(/\[(?:del|s)\]([\s\S]*?)\[\/(?:del|s)\]/gi, (_match, content: string) => {
    return `${ANSI.strikethrough}${content}${ANSI.reset}`;
  });

  // 7. 处理颜色 [color=xxx]...[/color]
  text = text.replace(/\[color=([^\]]+)\]([\s\S]*?)\[\/color\]/gi, (_match, color: string, content: string) => {
    const ansiColor = resolveColor(color.trim());
    return `${ansiColor}${content}${ANSI.reset}`;
  });

  // 8. 清理其他未处理的 UBB 标签
  text = stripRemainingUbb(text);

  // 9. 解码 HTML 实体
  text = decodeHtml(text);

  return {
    lines: wrapLines(text, width),
    images,
    links,
  };
}

// 解析颜色值
function resolveColor(color: string): string {
  // 先检查颜色名映射
  const lowerColor = color.toLowerCase();
  if (COLOR_MAP[lowerColor]) {
    return COLOR_MAP[lowerColor];
  }

  // 处理十六进制颜色 #RRGGBB 或 #RGB
  const hexMatch = color.match(/^#?([0-9a-f]{3,6})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `\x1b[38;2;${r};${g};${b}m`;
  }

  // 默认返回白色
  return ANSI.white;
}

// 清理剩余的 UBB 标签
function stripRemainingUbb(value: string): string {
  // 保留表情包代码
  const emoticonPlaceholders: string[] = [];
  const linkPlaceholders: string[] = [];
  let result = value;

  // 先将表情包代码替换为占位符
  result = result.replace(/\[(?:ac\d{2,4}|em\d{2}|cc98\d{2}|a:\d{3}|tb\d{2})\]/gi, (match) => {
    emoticonPlaceholders.push(match);
    return `__EMOTICON_${emoticonPlaceholders.length - 1}__`;
  });

  result = result.replace(/\[\d+\]/g, (match) => {
    linkPlaceholders.push(match);
    return `__LINK_${linkPlaceholders.length - 1}__`;
  });

  // 移除已知的 UBB 标签
  result = result
    .replace(/\[(?:\/)?(?:b|i|u|size|color|align|email|del|s|sub|sup|h\d?)(?:=[^\]]*)?\]/gi, "")
    .replace(/\[[a-z0-9]+(?:=[^\]]*)?\]/gi, "")
    .replace(/\[\/[a-z0-9]+\]/gi, "");

  // 恢复表情包代码
  for (let i = 0; i < emoticonPlaceholders.length; i++) {
    result = result.replace(`__EMOTICON_${i}__`, emoticonPlaceholders[i]);
  }
  for (let i = 0; i < linkPlaceholders.length; i++) {
    result = result.replace(`__LINK_${i}__`, linkPlaceholders[i]);
  }

  return result;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function wrapLines(value: string, width: number): string[] {
  const maxWidth = Math.max(20, width);
  const lines: string[] = [];

  for (const paragraph of value.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }

    let current = "";
    let currentWidth = 0;
    for (let index = 0; index < paragraph.length;) {
      if (paragraph[index] === "\x1b") {
        const end = findAnsiEnd(paragraph, index);
        current += paragraph.slice(index, end);
        index = end;
        continue;
      }

      const codePoint = paragraph.codePointAt(index);
      const char = codePoint === undefined ? paragraph[index] : String.fromCodePoint(codePoint);
      const nextWidth = charWidth(char);
      if (currentWidth + nextWidth > maxWidth) {
        lines.push(current);
        current = char;
        currentWidth = nextWidth;
      } else {
        current += char;
        currentWidth += nextWidth;
      }
      index += char.length;
    }
    lines.push(current);
  }

  return lines;
}

function findAnsiEnd(value: string, start: number): number {
  for (let index = start + 1; index < value.length; index += 1) {
    if (/[A-Za-z]/.test(value[index])) {
      return index + 1;
    }
  }
  return value.length;
}

function shortUrl(value: string): string {
  try {
    const url = new URL(value);
    const fileName = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    return `${url.host}/${fileName}`;
  } catch {
    return value;
  }
}

function stripUbb(value: string): string {
  return value
    .replace(/\[(?:\/)?(?:b|i|u|size|color|align|email|del|s|sub|sup|h\d?)(?:=[^\]]*)?\]/gi, "")
    .replace(/\[[a-z0-9]+(?:=[^\]]*)?\]/gi, "")
    .replace(/\[\/[a-z0-9]+\]/gi, "");
}

function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
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
