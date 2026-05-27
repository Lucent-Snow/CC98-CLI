import { ansi, bg, fg, stripAnsi } from "./ansi.js";
import { Header, Overview, Sidebar, Content, StatusBar, fit, blank } from "./components/index.js";
import { navItems } from "./navigation.js";
import type { TopicReaderState, TuiState } from "./state/types.js";
import { currentTopicLine, currentTopicPost, lineKindLabel } from "./topic-reader.js";

const cc98Blue = fg(0, 130, 202);
const cc98BlueSoft = fg(94, 180, 232);
const white = fg(245, 250, 255);
const muted = fg(139, 152, 166);
const line = fg(52, 84, 112);
const danger = fg(245, 101, 101);
const ok = fg(91, 207, 140);

const header = new Header();
const overview = new Overview();
const sidebar = new Sidebar();
const content = new Content();
const statusBar = new StatusBar();

export function draw(state: TuiState, size: { columns: number; rows: number }): string {
  const width = Math.max(60, size.columns);
  const height = Math.max(20, size.rows);
  const sidebarWidth = width < 90 ? 14 : 18;
  const rightWidth = width < 78 ? 0 : Math.min(42, Math.max(34, Math.floor(width * 0.30)));
  const mainWidth = width - sidebarWidth - rightWidth - (rightWidth > 0 ? 2 : 1);
  const overviewHeight = height < 24 ? 1 : 2;
  const bodyHeight = height - 4 - overviewHeight;
  const lines: string[] = [];

  lines.push(header.render(state, width));
  lines.push(`${line}${"─".repeat(width)}${ansi.reset}`);
  lines.push(...overview.render(state, width, overviewHeight));

  const sidebarLines = sidebar.render(state, sidebarWidth, bodyHeight);
  const mainLines = content.render(state, mainWidth, bodyHeight);
  const rightLines = rightWidth > 0 ? drawRight(state, rightWidth, bodyHeight) : [];

  for (let row = 0; row < bodyHeight; row += 1) {
    const parts = [
      fit(sidebarLines[row] ?? "", sidebarWidth),
      `${line}│${ansi.reset}`,
      fit(mainLines[row] ?? "", mainWidth)
    ];
    if (rightWidth > 0) {
      parts.push(`${line}│${ansi.reset}`, fit(rightLines[row] ?? "", rightWidth));
    }
    lines.push(parts.join(""));
  }

  lines.push(`${line}${"─".repeat(width)}${ansi.reset}`);
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
    return drawTopicRight(state.topic, state.scroll, width, height);
  }
  if (state.focus === "nav") {
    return drawNavRight(state, width, height);
  }
  return drawItemRight(state, width, height);
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

  if (rows.length < height) rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);
  if (rows.length < height) rows.push(`${muted} j/k 切换栏目${ansi.reset}`);
  if (rows.length < height) rows.push(`${muted} l/Enter 进入内容${ansi.reset}`);
  if (rows.length < height) rows.push(`${muted} r 刷新当前栏目${ansi.reset}`);
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
  return overlay(baseLines, width, height, Math.min(54, width - 4), [
    `${cc98Blue}${ansi.bold}快捷键帮助${ansi.reset}`,
    "",
    "导航: j/k 上下  h/l 返回/进入  Enter 确认",
    "全局: / 搜索  r 刷新  o 菜单  ? 帮助  q 退出",
    "帖子: j/k 滚动  n 下一页  s 收藏  l 赞  d 踩",
    "帖子: u 用户  [/ ] 楼层  数字+Enter 跳转",
    "",
    `${muted}Esc / ? / Enter 关闭${ansi.reset}`
  ]);
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
    `${muted}Esc / Enter 关闭${ansi.reset}`
  ]);
}

function drawSearchModal(baseLines: string[], state: TuiState, width: number, height: number): string {
  const rows = [
    `${cc98Blue}${ansi.bold}搜索${ansi.reset}`,
    "",
    `模式: ${state.searchMode === "topics" ? "● 帖子  ○ 用户" : "○ 帖子  ● 用户"}  Tab 切换`,
    `> ${state.searchQuery}${state.loading ? " ..." : "_"}`,
    ""
  ];

  for (const item of state.searchResults.slice(0, Math.max(0, height - 12))) {
    rows.push(`${item.title}`);
    if (item.meta) rows.push(`${muted}${item.meta}${ansi.reset}`);
  }
  if (state.searchResults.length === 0 && state.searchQuery && !state.loading) rows.push(`${muted}无结果${ansi.reset}`);
  rows.push("", `${muted}Enter 搜索/打开  Esc 关闭${ansi.reset}`);
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
