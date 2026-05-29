import { ansi, bg, fg, stripAnsi } from "./ansi.js";
import { Header, Overview, Sidebar, Content, StatusBar, fit, blank } from "./components/index.js";
import { navItems } from "./navigation.js";
import type { TopicReaderState, TuiState } from "./state/types.js";
import { currentTopicLine, currentTopicPost, lineKindLabel } from "./topic-reader.js";
import { getKeybindingManager, type KeybindingAction } from "./keybindings.js";
import { BOX_ROUNDED } from "./borders.js";

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

  for (let row = 0; row < bodyHeight; row += 1) {
    const parts = [
      line + box.vertical + ansi.reset,
      fit(sidebarLines[row] ?? "", sidebarWidth - 2),
      line + box.vertical + ansi.reset,
      fit(mainLines[row] ?? "", mainWidth - 2)
    ];
    if (rightWidth > 0) {
      parts.push(
        line + box.vertical + ansi.reset,
        fit(rightLines[row] ?? "", rightWidth - 2),
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

  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);
  rows.push(`${muted} 当前: ${scroll + 1}/${topic.lines.length}${ansi.reset}`);
  rows.push(`${muted} 已加载: ${topic.loaded} 楼${ansi.reset}`);
  return rows.concat(blank(height - rows.length, width)).slice(0, height);
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

  for (const item of state.searchResults.slice(0, Math.max(0, height - 14))) {
    rows.push(`${item.title}`);
    if (item.meta) rows.push(`${muted}${item.meta}${ansi.reset}`);
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
