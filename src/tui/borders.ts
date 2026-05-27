// Unicode 框绘制字符集

// 单线框
export const BOX = {
  // 角落
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",

  // 边框
  horizontal: "─",
  vertical: "│",

  // 连接符
  teeRight: "├",   // ├
  teeLeft: "┤",    // ┤
  teeDown: "┬",    // ┬
  teeUp: "┴",      // ┴
  cross: "┼",      // ┼
} as const;

// 双线框
export const BOX_DOUBLE = {
  topLeft: "╔",
  topRight: "╗",
  bottomLeft: "╚",
  bottomRight: "╝",

  horizontal: "═",
  vertical: "║",

  teeRight: "╠",
  teeLeft: "╣",
  teeDown: "╦",
  teeUp: "╩",
  cross: "╬",
} as const;

// 圆角框
export const BOX_ROUNDED = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",

  horizontal: "─",
  vertical: "│",

  teeRight: "├",
  teeLeft: "┤",
  teeDown: "┬",
  teeUp: "┴",
  cross: "┼",
} as const;

// 绘制水平线
export function horizontalLine(width: number, style = BOX): string {
  return style.horizontal.repeat(width);
}

// 绘制带标题的水平线
export function horizontalLineWithTitle(title: string, width: number, style = BOX): string {
  const titleLen = title.length;
  if (titleLen === 0) {
    return horizontalLine(width, style);
  }

  const leftLen = 2;
  const rightLen = Math.max(0, width - leftLen - titleLen - 2);
  return `${style.horizontal.repeat(leftLen)} ${title} ${style.horizontal.repeat(rightLen)}`;
}

// 绘制完整的边框
export function drawBorder(width: number, height: number, style = BOX): string[] {
  const lines: string[] = [];

  // 顶部边框
  lines.push(style.topLeft + horizontalLine(width - 2, style) + style.topRight);

  // 中间行
  for (let i = 0; i < height - 2; i++) {
    lines.push(style.vertical + " ".repeat(width - 2) + style.vertical);
  }

  // 底部边框
  lines.push(style.bottomLeft + horizontalLine(width - 2, style) + style.bottomRight);

  return lines;
}

// 绘制带标题的边框
export function drawBorderWithTitle(title: string, width: number, height: number, style = BOX): string[] {
  const lines: string[] = [];

  // 顶部边框（带标题）
  const titlePart = ` ${title} `;
  const remaining = width - 2 - titlePart.length;
  const leftDash = Math.max(1, Math.floor(remaining / 2));
  const rightDash = Math.max(1, remaining - leftDash);
  lines.push(style.topLeft + style.horizontal.repeat(leftDash) + titlePart + style.horizontal.repeat(rightDash) + style.topRight);

  // 中间行
  for (let i = 0; i < height - 2; i++) {
    lines.push(style.vertical + " ".repeat(width - 2) + style.vertical);
  }

  // 底部边框
  lines.push(style.bottomLeft + horizontalLine(width - 2, style) + style.bottomRight);

  return lines;
}

// 在指定位置绘制分隔线
export function drawSeparator(width: number, style = BOX): string {
  return style.horizontal.repeat(width);
}

// 绘制带连接符的分隔线
export function drawSeparatorWithConnectors(width: number, leftConnector: string, rightConnector: string, style = BOX): string {
  return leftConnector + style.horizontal.repeat(width - 2) + rightConnector;
}

// 绘制三栏布局的分隔线
export function drawThreeColumnSeparator(
  leftWidth: number,
  middleWidth: number,
  rightWidth: number,
  style = BOX
): string {
  return (
    style.teeDown +
    style.horizontal.repeat(leftWidth - 2) +
    style.cross +
    style.horizontal.repeat(middleWidth - 2) +
    style.cross +
    style.horizontal.repeat(rightWidth - 2) +
    style.teeDown
  );
}

// 绘制三栏布局的底部连接线
export function drawThreeColumnBottom(
  leftWidth: number,
  middleWidth: number,
  rightWidth: number,
  style = BOX
): string {
  return (
    style.teeUp +
    style.horizontal.repeat(leftWidth - 2) +
    style.cross +
    style.horizontal.repeat(middleWidth - 2) +
    style.cross +
    style.horizontal.repeat(rightWidth - 2) +
    style.teeUp
  );
}

// 绘制三栏布局的顶部连接线
export function drawThreeColumnTop(
  leftWidth: number,
  middleWidth: number,
  rightWidth: number,
  style = BOX
): string {
  return (
    style.topLeft +
    style.horizontal.repeat(leftWidth - 2) +
    style.teeDown +
    style.horizontal.repeat(middleWidth - 2) +
    style.teeDown +
    style.horizontal.repeat(rightWidth - 2) +
    style.topRight
  );
}

// 绘制垂直分隔线
export function drawVerticalSeparator(height: number, style = BOX): string[] {
  return Array(height).fill(style.vertical);
}

// 绘制带连接符的垂直分隔线
export function drawVerticalSeparatorWithConnectors(
  height: number,
  topConnector: string,
  bottomConnector: string,
  style = BOX
): string[] {
  const lines: string[] = [];
  lines.push(topConnector);
  for (let i = 0; i < height - 2; i++) {
    lines.push(style.vertical);
  }
  lines.push(bottomConnector);
  return lines;
}
