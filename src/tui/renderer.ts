import { ansi, bg, fg, moveTo, stripAnsi } from "./ansi.js";
import { Header, Overview, Sidebar, Content, StatusBar, fit, blank } from "./components/index.js";
import { navItems } from "./navigation.js";
import type { TopicReaderState, TuiState } from "./state/types.js";
import { currentTopicLine, currentTopicPost, lineKindLabel } from "./topic-reader.js";
import { getKeybindingManager, type KeybindingAction } from "./keybindings.js";
import { BOX_ROUNDED } from "./borders.js";
import { EMOJI_CATEGORIES, getEmojiArt, renderEmojiCode } from "./emoji-renderer.js";
import { getImageDimensionsSync, renderLocalImageSync } from "./image-renderer.js";
import { detectTerminalCapabilities, supportsInlineImages } from "./terminal-capabilities.js";

const cc98Blue = fg(0, 130, 202);
const cc98BlueSoft = fg(94, 180, 232);
const white = fg(245, 250, 255);
const muted = fg(139, 152, 166);
const line = fg(52, 84, 112);
const danger = fg(245, 101, 101);
const ok = fg(91, 207, 140);
const box = BOX_ROUNDED;

const header = new Header();
const overview = new Overview();
const sidebar = new Sidebar();
const content = new Content();
const statusBar = new StatusBar();
const keybindings = getKeybindingManager();
const imagePreviewMarker = "\x00cc98-image-preview\x00";

export function draw(state: TuiState, size: { columns: number; rows: number }): string {
  const width = Math.max(60, size.columns);
  const height = Math.max(20, size.rows);
  const sidebarWidth = width < 90 ? 14 : 18;
  const rightWidth = width < 78 ? 0 : Math.min(42, Math.max(34, Math.floor(width * 0.30)));
  const mainWidth = width - sidebarWidth - rightWidth - (rightWidth > 0 ? 2 : 1);
  const overviewHeight = 1; // overview 现在只返回一行数据
  // 计算主体区域高度：总高度 - header - top border - overview - separator - bottom border - status bar
  const bodyHeight = height - 5 - overviewHeight;
  const lines: string[] = [];

  lines.push(header.render(state, width));

  // 顶部连接线
  if (rightWidth > 0) {
    lines.push(
      line +
      box.topLeft +
      box.horizontal.repeat(sidebarWidth - 2) +
      box.teeDown +
      box.horizontal.repeat(mainWidth - 2) +
      box.teeDown +
      box.horizontal.repeat(rightWidth - 2) +
      box.topRight +
      ansi.reset
    );
  } else {
    lines.push(
      line +
      box.topLeft +
      box.horizontal.repeat(sidebarWidth - 2) +
      box.teeDown +
      box.horizontal.repeat(mainWidth - 2) +
      box.topRight +
      ansi.reset
    );
  }

  lines.push(...overview.render(state, width, overviewHeight));

  // 分隔线
  if (rightWidth > 0) {
    lines.push(
      line +
      box.teeRight +
      box.horizontal.repeat(sidebarWidth - 2) +
      box.cross +
      box.horizontal.repeat(mainWidth - 2) +
      box.cross +
      box.horizontal.repeat(rightWidth - 2) +
      box.teeLeft +
      ansi.reset
    );
  } else {
    lines.push(
      line +
      box.teeRight +
      box.horizontal.repeat(sidebarWidth - 2) +
      box.cross +
      box.horizontal.repeat(mainWidth - 2) +
      box.teeLeft +
      ansi.reset
    );
  }

  const sidebarLines = sidebar.render(state, sidebarWidth, bodyHeight);
  const mainLines = content.render(state, mainWidth - 2, bodyHeight);
  const rightLines = rightWidth > 0 ? drawRight(state, rightWidth, bodyHeight) : [];
  const overlays: string[] = [];
  const bodyStartRow = 5;
  const rightContentColumn = sidebarWidth + mainWidth;

  for (let row = 0; row < bodyHeight; row += 1) {
    const rawRightLine = rightLines[row] ?? "";
    const imagePreview = rawRightLine.startsWith(imagePreviewMarker)
      ? rawRightLine.slice(imagePreviewMarker.length)
      : undefined;
    const parts = [
      line + box.vertical + ansi.reset,
      fit(sidebarLines[row] ?? "", sidebarWidth - 2),
      line + box.vertical + ansi.reset,
      fit(mainLines[row] ?? "", mainWidth - 2)
    ];
    if (rightWidth > 0) {
      if (imagePreview !== undefined) {
        overlays.push(`${moveTo(bodyStartRow + row, rightContentColumn)}${imagePreview}`);
      }
      parts.push(
        line + box.vertical + ansi.reset,
        fit(imagePreview === undefined ? rawRightLine : "", rightWidth - 2),
        line + box.vertical + ansi.reset
      );
    } else {
      parts.push(line + box.vertical + ansi.reset);
    }
    lines.push(parts.join(""));
  }

  // 底部连接线
  if (rightWidth > 0) {
    lines.push(
      line +
      box.bottomLeft +
      box.horizontal.repeat(sidebarWidth - 2) +
      box.teeUp +
      box.horizontal.repeat(mainWidth - 2) +
      box.teeUp +
      box.horizontal.repeat(rightWidth - 2) +
      box.bottomRight +
      ansi.reset
    );
  } else {
    lines.push(
      line +
      box.bottomLeft +
      box.horizontal.repeat(sidebarWidth - 2) +
      box.teeUp +
      box.horizontal.repeat(mainWidth - 2) +
      box.bottomRight +
      ansi.reset
    );
  }

  lines.push(statusBar.render(state, width));

  let output = lines.slice(0, height).join("\n");
  if (state.modal === "help") output = drawHelpModal(lines, width, height);
  if (state.modal === "menu") output = drawMenuModal(lines, state, width, height);
  if (state.modal === "info") output = drawInfoModal(lines, state, width, height);
  if (state.modal === "search") output = drawSearchModal(lines, state, width, height);
  if (state.modal === "user") output = drawUserDetailModal(lines, state, width, height);
  if (state.modal === null && overlays.length > 0) {
    output += overlays.join("") + moveTo(height, 1);
  }
  return output;
}

function drawRight(state: TuiState, width: number, height: number): string[] {
  if (state.mode === "topic" && state.topic) {
    return drawTopicRight(state.topic, state.topic.cursorLine, width, height);
  }
  // 新版本更新通知（首次显示）
  if (state.updateAvailable?.isNew) {
    return drawUpdateRight(state.updateAvailable, width, height);
  }
  if (state.focus === "nav") {
    return drawNavRight(state, width, height);
  }
  return drawItemRight(state, width, height);
}

function drawUpdateRight(update: { tagName: string; url: string; body: string }, width: number, height: number): string[] {
  const rows: string[] = [];
  const updateFg = fg(255, 200, 50);
  
  rows.push(`${updateFg}${ansi.bold} ⬆ 新版本可用${ansi.reset}`);
  rows.push(`${cc98Blue}${ansi.bold} ${update.tagName}${ansi.reset}`);
  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);
  
  // 显示更新内容（截取前几行）
  const bodyLines = update.body.split("\n").filter(l => l.trim()).slice(0, 6);
  for (const lineText of bodyLines) {
    if (rows.length >= height - 3) break;
    rows.push(`${muted} ${lineText.slice(0, width - 4)}${ansi.reset}`);
  }
  
  rows.push("");
  rows.push(`${muted} Esc 关闭  任意键隐藏${ansi.reset}`);
  
  return rows.concat(blank(height - rows.length, width)).slice(0, height);
}

function drawNavRight(state: TuiState, width: number, height: number): string[] {
  const rows: string[] = [];
  const nav = navItems[state.navIndex];

  rows.push(`${cc98Blue}${ansi.bold} ${nav?.label ?? ""}${ansi.reset}`);
  rows.push(`${muted} ${nav?.hint ?? ""}${ansi.reset}`);
  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);

  for (const stat of state.stats) {
    if (rows.length >= height) break;
    rows.push(`${muted} ${stat.title}${ansi.reset}`);
    if (stat.detail && rows.length < height) {
      rows.push(`${cc98BlueSoft} ${stat.detail}${ansi.reset}`);
    }
  }

  // 删除快捷键提示，只保留统计信息
  return rows.concat(blank(height - rows.length, width)).slice(0, height);
}

function drawItemRight(state: TuiState, width: number, height: number): string[] {
  const selected = state.items[state.itemIndex];
  if (!selected) {
    return blank(height, width);
  }
  if (selected.meta?.startsWith("emoji:")) {
    return drawEmojiRight(selected.meta.slice("emoji:".length), width, height);
  }
  if (selected.meta?.startsWith("emoji-category:")) {
    return drawEmojiCategoryRight(selected.meta.slice("emoji-category:".length), width, height);
  }
  const rows: string[] = [];
  rows.push(`${cc98Blue}${ansi.bold} ${selected.title}${ansi.reset}`);
  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);
  if (selected.meta) rows.push(`${muted} ${selected.meta}${ansi.reset}`);
  if (selected.detail) rows.push(`${cc98BlueSoft} ${selected.detail}${ansi.reset}`);
  if (selected.topicId !== undefined) rows.push(`${muted} 主题 #${selected.topicId}${ansi.reset}`);
  if (selected.boardId !== undefined) rows.push(`${muted} 版面 #${selected.boardId}${ansi.reset}`);
  if (selected.userId !== undefined) rows.push(`${muted} 用户 #${selected.userId}${ansi.reset}`);
  
  // 添加帖子元信息（如果有）
  if (selected.sortTime) {
    const date = new Date(selected.sortTime);
    const timeStr = date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    rows.push(`${muted} 时间: ${timeStr}${ansi.reset}`);
  }
  
  return rows.concat(blank(height - rows.length, width)).slice(0, height);
}

function drawEmojiRight(code: string, width: number, height: number): string[] {
  const art = getEmojiArt(code);
  const rendered = renderEmojiCode(code);
  if (!art || !rendered) {
    return [`${danger} 未找到 [${code}]${ansi.reset}`].concat(blank(height - 1, width)).slice(0, height);
  }

  const category = EMOJI_CATEGORIES.find((item) => item.codes.includes(code));
  const rows: string[] = [];
  rows.push(`${cc98Blue}${ansi.bold} [${code}]${ansi.reset}`);
  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);
  rows.push(`${muted} 分类: ${category?.label ?? "未知"}${ansi.reset}`);
  rows.push(`${muted} 尺寸: ${art.width}x${art.height}px${ansi.reset}`);
  rows.push(`${muted} 颜色: ${art.palette.length}${ansi.reset}`);
  rows.push("");
  rows.push(...rendered.split("\n"));
  rows.push("");
  rows.push(`${muted}Enter 放大预览${ansi.reset}`);
  return rows.concat(blank(height - rows.length, width)).slice(0, height);
}

function drawEmojiCategoryRight(id: string, width: number, height: number): string[] {
  const category = EMOJI_CATEGORIES.find((item) => item.id === id);
  if (!category) {
    return blank(height, width);
  }
  const rows = [
    `${cc98Blue}${ansi.bold} ${category.label}${ansi.reset}`,
    `${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`,
    `${muted} 来源: Assets/Emoji/${category.source}${ansi.reset}`,
    `${muted} 数量: ${category.codes.length}${ansi.reset}`,
    `${muted} 范围: ${category.codes[0]} - ${category.codes.at(-1)}${ansi.reset}`,
    "",
    `${muted}继续向下选择具体表情${ansi.reset}`
  ];
  return rows.concat(blank(height - rows.length, width)).slice(0, height);
}

function drawTopicRight(topic: TopicReaderState, scroll: number, width: number, height: number): string[] {
  const rows: string[] = [];
  const post = currentTopicPost(topic, scroll);
  const topicLine = currentTopicLine(topic, scroll);

  rows.push(`${cc98Blue}${ansi.bold} 帖子信息${ansi.reset}`);
  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);
  if (post) {
    rows.push(`${muted} 楼层: #${post.floor ?? "?"}${ansi.reset}`);
    rows.push(`${muted} 作者: ${post.author}${ansi.reset}`);
    if (post.time) rows.push(`${muted} 时间: ${post.time}${ansi.reset}`);
    if (topicLine) rows.push(`${muted} 当前位置: ${lineKindLabel(topicLine.kind)}${ansi.reset}`);
    if (post.likeCount > 0) rows.push(`${ok} 赞: ${post.likeCount}${ansi.reset}`);
    if (post.dislikeCount > 0) rows.push(`${danger} 踩: ${post.dislikeCount}${ansi.reset}`);
    if (post.rating) rows.push(`${muted} 评分: ${post.rating}${ansi.reset}`);
    if (post.imageCount > 0) rows.push(`${muted} 图片: ${post.imageCount}${ansi.reset}`);
    if (post.linkCount > 0) rows.push(`${muted} 链接: ${post.linkCount}${ansi.reset}`);
  }

  if (topicLine?.kind === "image" && topicLine.imageUrl && rows.length < height - 4) {
    rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);
    rows.push(...drawImagePreview(topic, topicLine.imageUrl, width, Math.max(0, height - rows.length - 4)));
  }

  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);
  rows.push(`${muted} 当前: ${scroll + 1}/${topic.lines.length}${ansi.reset}`);
  rows.push(`${muted} 已加载: ${topic.loaded} 楼${ansi.reset}`);
  return rows.concat(blank(height - rows.length, width)).slice(0, height);
}

function drawImagePreview(topic: TopicReaderState, imageUrl: string, width: number, height: number): string[] {
  const rows: string[] = [];
  const cachedPath = topic.imageCache.get(imageUrl);

  rows.push(`${cc98Blue}${ansi.bold} 图片预览${ansi.reset}`);
  if (height <= 1) {
    return rows;
  }

  if (topic.imageErrors.has(imageUrl)) {
    rows.push(`${danger} 下载失败${ansi.reset}`);
    rows.push(`${muted} o 打开  c 复制图片${ansi.reset}`);
    return rows.slice(0, height);
  }

  if (!cachedPath) {
    rows.push(`${muted}${topic.imageLoading.has(imageUrl) ? " 加载中..." : " 等待缓存..."}${ansi.reset}`);
    rows.push(`${muted} o 打开  c 复制图片${ansi.reset}`);
    return rows.slice(0, height);
  }

  if (!supportsInlineImages()) {
    const capabilities = detectTerminalCapabilities();
    rows.push(`${muted} 当前终端未检测到图片协议${ansi.reset}`);
    rows.push(`${muted} TERM=${capabilities.term || "-"}${ansi.reset}`);
    rows.push(`${muted} o 打开  c 复制图片${ansi.reset}`);
    return rows.slice(0, height);
  }

  const previewSize = estimateRightPreviewSize(cachedPath, width, Math.max(1, height - 2));
  const rendered = renderLocalImageSync(cachedPath, {
    maxWidth: previewSize.cols,
    maxHeight: previewSize.rows
  });

  if (!rendered) {
    rows.push(`${muted} 当前协议无法渲染此图片${ansi.reset}`);
    rows.push(`${muted} o 打开  c 复制图片${ansi.reset}`);
    return rows.slice(0, height);
  }

  rows.push(`${imagePreviewMarker}${rendered.escapeSequence}`);
  rows.push(...blank(Math.max(0, previewSize.rows - 1), width));
  rows.push(`${muted} o 打开  c 复制图片${ansi.reset}`);
  return rows.slice(0, height);
}

function estimateRightPreviewSize(filePath: string, width: number, maxRows: number): { cols: number; rows: number } {
  const maxCols = Math.max(8, width - 2);
  const clampedMaxRows = Math.max(4, Math.min(20, maxRows));
  const fallback = { cols: Math.min(maxCols, 32), rows: Math.min(clampedMaxRows, 12) };
  const dimensions = getImageDimensionsSync(filePath);

  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return fallback;
  }

  const cellWidthPx = 8;
  const cellHeightPx = 18;
  const naturalCols = Math.max(1, Math.ceil(dimensions.width / cellWidthPx));
  const naturalRows = Math.max(1, Math.ceil(dimensions.height / cellHeightPx));
  const scale = Math.min(1, maxCols / naturalCols, clampedMaxRows / naturalRows);

  return {
    cols: Math.max(8, Math.min(maxCols, Math.round(naturalCols * scale))),
    rows: Math.max(4, Math.min(clampedMaxRows, Math.round(naturalRows * scale)))
  };
}

function drawHelpModal(baseLines: string[], width: number, height: number): string {
  return overlay(baseLines, width, height, Math.min(60, width - 4), [
    `${cc98Blue}${ansi.bold}快捷键帮助${ansi.reset}`,
    "",
    `导航: ${keys("moveDown")}/${keys("moveUp")} 移动  ${keys("back")} 返回  ${keys("confirm")} 打开`,
    `全局: ${keys("search")} 搜索  ${keys("refresh")} 刷新  ${keys("menu")} 菜单  ${keys("help")} 帮助  ${keys("quit")} 退出`,
    `帖子: ${keys("topicScrollDown")}/${keys("topicScrollUp")} 滚动  ${keys("topicNextPage")}/${keys("topicPrevPage")} 翻页  ${keys("topicNextFloor")}/${keys("topicPrevFloor")} 楼层`,
    `帖子: 数字+${keys("topicJumpPage")} 跳页  数字+${keys("topicJumpFloor")} 跳楼  ${keys("topicJumpLast")} 最后`,
    `帖子: ${keys("topicFavorite")} 收藏  ${keys("topicLike")} 赞  ${keys("topicDislike")} 踩  ${keys("topicUser")} 用户`,
    `搜索: ${keys("searchNext")}/${keys("searchPrev")} 移动  ${keys("searchExecute")} 搜索/打开  ${keys("searchToggleMode")} 切换`,
    `菜单: ${keys("menuNext")}/${keys("menuPrev")} 移动  ${keys("menuExecute")} 执行  ${keys("menuClose")} 关闭`,
    "",
    `${muted}任意键关闭${ansi.reset}`
  ]);
}

function keys(action: KeybindingAction): string {
  return keybindings.formatActionKeys(action);
}

function drawMenuModal(baseLines: string[], state: TuiState, width: number, height: number): string {
  const rows = [`${cc98Blue}${ansi.bold}操作菜单${ansi.reset}`, ""];
  rows.push(...state.menuItems.map((item, index) => {
    const active = index === state.menuIndex;
    return `${active ? `${ok}●${ansi.reset}` : `${muted}•${ansi.reset}`} ${item.label}  ${muted}${item.key}${ansi.reset}`;
  }));
  if (state.menuItems.length === 0) rows.push(`${muted}暂无可用操作${ansi.reset}`);
  return overlay(baseLines, width, height, Math.min(34, width - 4), rows);
}

function drawInfoModal(baseLines: string[], state: TuiState, width: number, height: number): string {
  return overlay(baseLines, width, height, Math.min(68, width - 4), [
    `${cc98Blue}${ansi.bold}${state.infoTitle ?? "信息"}${ansi.reset}`,
    "",
    ...state.infoLines.slice(0, Math.max(1, height - 8)),
    "",
    `${muted}${keys("back")} / ${keys("confirm")} 关闭${ansi.reset}`
  ]);
}

function drawSearchModal(baseLines: string[], state: TuiState, width: number, height: number): string {
  const scopeLabel = state.searchScope?.label ?? "全站";
  const rows = [
    `${cc98Blue}${ansi.bold}搜索${ansi.reset}`,
    "",
    `范围: ${scopeLabel}`,
    `模式: ${state.searchMode === "topics" ? "● 帖子  ○ 用户" : "○ 帖子  ● 用户"}  Tab 切换`,
    `> ${state.searchQuery}${state.loading ? " ..." : "_"}`,
    ""
  ];

  const maxResults = Math.max(1, Math.floor((height - 14) / 2));
  const selectedIndex = Math.min(Math.max(0, state.itemIndex), Math.max(0, state.searchResults.length - 1));
  const resultStart = Math.max(0, Math.min(selectedIndex - maxResults + 1, state.searchResults.length - maxResults));
  const visibleResults = state.searchResults.slice(resultStart, resultStart + maxResults);
  for (let offset = 0; offset < visibleResults.length; offset += 1) {
    const item = visibleResults[offset];
    const index = resultStart + offset;
    const active = index === selectedIndex;
    const prefix = active ? `${ok}●${ansi.reset}` : `${muted}•${ansi.reset}`;
    rows.push(active ? `${bg(5, 46, 74)}${prefix} ${item.title}${ansi.reset}` : `${prefix} ${item.title}`);
    if (item.meta) rows.push(`${muted}  ${item.meta}${ansi.reset}`);
  }
  if (state.searchResults.length === 0 && state.searchQuery && !state.loading) rows.push(`${muted}无结果${ansi.reset}`);
  rows.push("", `${muted}Enter 搜索/打开  Tab 切换  / 关闭${ansi.reset}`);
  return overlay(baseLines, width, height, Math.min(62, width - 4), rows);
}

function drawUserDetailModal(baseLines: string[], state: TuiState, width: number, height: number): string {
  const user = state.userDetail;
  if (!user) {
    return baseLines.slice(0, height).join("\n");
  }
  const rows = [
    `${cc98Blue}${ansi.bold}用户详情${ansi.reset}`,
    "",
    `昵称: ${user.name}`,
    `ID: #${user.userId}`,
    user.level ? `等级: ${user.level}` : undefined,
    user.postCount !== undefined ? `帖子: ${user.postCount}` : undefined,
    user.fanCount !== undefined ? `粉丝: ${user.fanCount}  关注: ${user.followCount ?? 0}` : undefined,
    `状态: ${user.isFollowing ? "已关注" : "未关注"}`,
    "",
    `${muted}f 关注/取消关注  m 发私信  Esc 关闭${ansi.reset}`
  ].filter((value): value is string => typeof value === "string");
  if (user.recentTopics?.length) {
    rows.push("", `${cc98Blue}最近帖子${ansi.reset}`);
    rows.push(...user.recentTopics.slice(0, 3).map((topic) => topic.title));
  }
  return overlay(baseLines, width, height, Math.min(52, width - 4), rows);
}

function overlay(baseLines: string[], width: number, height: number, modalWidth: number, content: string[]): string {
  const modalHeight = Math.min(height - 4, content.length + 2);
  const startRow = Math.max(0, Math.floor((height - modalHeight) / 2));
  const startCol = Math.max(0, Math.floor((width - modalWidth) / 2));
  const result = [...baseLines];

  for (let index = 0; index < modalHeight; index += 1) {
    const row = startRow + index;
    if (row >= result.length) break;
    const raw = index === 0 || index === modalHeight - 1 ? "" : content[index - 1] ?? "";
    const padded = fit(raw, modalWidth);
    const block = `${bg(5, 46, 74)}${padded}${ansi.reset}`;
    result[row] = replaceCells(result[row] ?? "", startCol, modalWidth, block);
  }

  return result.slice(0, height).join("\n");
}

function replaceCells(value: string, start: number, width: number, replacement: string): string {
  const plain = stripAnsi(value);
  const before = plain.slice(0, start);
  const after = plain.slice(start + width);
  return `${before}${replacement}${after}`;
}
