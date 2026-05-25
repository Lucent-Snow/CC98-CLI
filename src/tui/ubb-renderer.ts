export interface RenderedPost {
  lines: string[];
  images: string[];
  links: string[];
}

export function renderUbbToLines(content: string, width: number): RenderedPost {
  const images: string[] = [];
  const links: string[] = [];
  let text = content.replace(/\r\n/g, "\n");

  text = text.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, (_match, url: string) => {
    const cleanUrl = url.trim();
    images.push(cleanUrl);
    const index = images.length;
    return `\n[image ${index}] ${shortUrl(cleanUrl)}\n          o 打开  c 复制链接  d 下载到缓存\n`;
  });

  text = text.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_match, url: string, label: string) => {
    const cleanUrl = url.trim();
    links.push(cleanUrl);
    return `${stripUbb(label)} [link ${links.length}: ${shortUrl(cleanUrl)}]`;
  });

  text = text.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_match, url: string) => {
    const cleanUrl = url.trim();
    links.push(cleanUrl);
    return `[link ${links.length}: ${shortUrl(cleanUrl)}]`;
  });

  text = text.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, (_match, quoted: string) => {
    return `\n${stripUbb(quoted).split("\n").map((line) => `│ ${line}`).join("\n")}\n`;
  });

  text = text.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, (_match, code: string) => {
    return `\n${code.split("\n").map((line) => `    ${line}`).join("\n")}\n`;
  });

  text = stripUbb(text);
  text = decodeHtml(text);

  return {
    lines: wrapLines(text, width),
    images,
    links
  };
}

function stripUbb(value: string): string {
  return value
    .replace(/\[(?:\/)?(?:b|i|u|size|color|align|email|del|s|sub|sup|h\d?)(?:=[^\]]*)?\]/gi, "")
    .replace(/\[[a-z0-9]+(?:=[^\]]*)?\]/gi, "")
    .replace(/\[\/[a-z0-9]+\]/gi, "");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
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
    for (const char of paragraph) {
      const nextWidth = charWidth(char);
      if (currentWidth + nextWidth > maxWidth) {
        lines.push(current);
        current = char;
        currentWidth = nextWidth;
      } else {
        current += char;
        currentWidth += nextWidth;
      }
    }
    lines.push(current);
  }

  return lines;
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
