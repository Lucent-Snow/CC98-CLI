// 布局组件 - 使用正确的 Unicode 框绘制

import type { TuiState } from "../state/types.js";
import { ansi, bg, fg } from "../ansi.js";
import { fit, cellWidth } from "./utils.js";
import { BOX, BOX_ROUNDED } from "../borders.js";
import { navItems } from "../navigation.js";

// 颜色常量
const cc98Blue = fg(0, 130, 202);
const cc98BlueSoft = fg(94, 180, 232);
const cc98BlueBg = bg(0, 104, 176);
const white = fg(245, 250, 255);
const muted = fg(139, 152, 166);
const line = fg(52, 84, 112);
const danger = fg(245, 101, 101);
const ok = fg(91, 207, 140);

// 使用圆角框样式
const style = BOX_ROUNDED;

// 绘制完整的三栏布局
export function drawThreeColumnLayout(
  state: TuiState,
  width: number,
  height: number,
  sidebarWidth: number,
  rightWidth: number
): string[] {
  const lines: string[] = [];
  const mainWidth = width - sidebarWidth - rightWidth - 2;
  const overviewHeight = 1;
  const bodyHeight = height - 4 - overviewHeight;

  // 1. 顶部标题栏
  lines.push(drawHeader(state, width));

  // 2. 顶部连接线
  if (rightWidth > 0) {
    lines.push(
      line +
      style.topLeft +
      style.horizontal.repeat(sidebarWidth - 2) +
      style.teeDown +
      style.horizontal.repeat(mainWidth - 2) +
      style.teeDown +
      style.horizontal.repeat(rightWidth - 2) +
      style.topRight +
      ansi.reset
    );
  } else {
    lines.push(
      line +
      style.topLeft +
      style.horizontal.repeat(sidebarWidth - 2) +
      style.teeDown +
      style.horizontal.repeat(mainWidth - 2) +
      style.topRight +
      ansi.reset
    );
  }

  // 3. 概览区
  lines.push(...drawOverview(state, width, overviewHeight));

  // 4. 分隔线
  if (rightWidth > 0) {
    lines.push(
      line +
      style.teeRight +
      style.horizontal.repeat(sidebarWidth - 2) +
      style.cross +
      style.horizontal.repeat(mainWidth - 2) +
      style.cross +
      style.horizontal.repeat(rightWidth - 2) +
      style.teeLeft +
      ansi.reset
    );
  } else {
    lines.push(
      line +
      style.teeRight +
      style.horizontal.repeat(sidebarWidth - 2) +
      style.cross +
      style.horizontal.repeat(mainWidth - 2) +
      style.teeLeft +
      ansi.reset
    );
  }

  // 5. 主内容区
  const sidebarLines = drawSidebar(state, sidebarWidth, bodyHeight);
  const mainLines = drawMainContent(state, mainWidth, bodyHeight);
  const rightLines = rightWidth > 0 ? drawRightPanel(state, rightWidth, bodyHeight) : [];

  for (let row = 0; row < bodyHeight; row++) {
    const parts = [
      line + style.vertical + ansi.reset,
      fit(sidebarLines[row] ?? "", sidebarWidth - 2),
      line + style.vertical + ansi.reset,
      fit(mainLines[row] ?? "", mainWidth - 2),
    ];

    if (rightWidth > 0) {
      parts.push(
        line + style.vertical + ansi.reset,
        fit(rightLines[row] ?? "", rightWidth - 2),
        line + style.vertical + ansi.reset
      );
    } else {
      parts.push(line + style.vertical + ansi.reset);
    }

    lines.push(parts.join(""));
  }

  // 6. 底部连接线
  if (rightWidth > 0) {
    lines.push(
      line +
      style.bottomLeft +
      style.horizontal.repeat(sidebarWidth - 2) +
      style.teeUp +
      style.horizontal.repeat(mainWidth - 2) +
      style.teeUp +
      style.horizontal.repeat(rightWidth - 2) +
      style.bottomRight +
      ansi.reset
    );
  } else {
    lines.push(
      line +
      style.bottomLeft +
      style.horizontal.repeat(sidebarWidth - 2) +
      style.teeUp +
      style.horizontal.repeat(mainWidth - 2) +
      style.bottomRight +
      ansi.reset
    );
  }

  // 7. 状态栏
  lines.push(drawStatusBar(state, width));

  return lines.slice(0, height);
}

// 绘制顶部标题栏
function drawHeader(state: TuiState, width: number): string {
  const account = state.account ? `@${state.account}` : "未登录";
  const title = ` CC98 ${state.viewTitle} `;
  const padding = Math.max(1, width - cellWidth(title) - cellWidth(account));
  return `${cc98BlueBg}${white}${ansi.bold}${fit(`${title}${" ".repeat(padding)}${account}`, width)}${ansi.reset}`;
}

// 绘制概览区
function drawOverview(state: TuiState, width: number, height: number): string[] {
  const rows: string[] = [];
  const summary = state.overview.length > 0
    ? state.overview.map((entry) => `${entry.title} ${entry.detail ?? "-"}`).join("  ")
    : "全站概览会在读取十大时更新";
  rows.push(fit(`${cc98BlueSoft} ${summary}`, width));

  return rows.slice(0, height);
}

// 绘制左侧导航
function drawSidebar(state: TuiState, width: number, height: number): string[] {
  const rows: string[] = [];
  const navItems = [
    { id: "hot", label: "十大", hint: "热门话题" },
    { id: "favorite", label: "收藏", hint: "版面帖子" },
    { id: "new", label: "最新", hint: "新帖流" },
    { id: "boards", label: "版面", hint: "所有分区" },
    { id: "following", label: "关注", hint: "用户动态" },
    { id: "messages", label: "消息", hint: "未读与私信" },
    { id: "notices", label: "通知", hint: "系统与回复" },
    { id: "me", label: "我的", hint: "当前账号" },
    { id: "settings", label: "设置", hint: "账号与配置" }
  ];

  for (let index = 0; index < height; index++) {
    const nav = navItems[index];
    if (!nav) {
      rows.push(" ".repeat(width));
      continue;
    }

    const active = index === state.navIndex;
    const focused = state.focus === "nav";
    const label = ` ${nav.label}`;
    const hint = width > 14 ? ` ${nav.hint}` : "";
    const text = fit(`${label}${hint}`, width);

    if (active && focused) {
      rows.push(`${bg(0, 130, 202)}${white}${text}${ansi.reset}`);
    } else if (active) {
      rows.push(`${bg(5, 46, 74)}${cc98BlueSoft}${text}${ansi.reset}`);
    } else {
      rows.push(`${cc98Blue}${label}${ansi.reset}${muted}${fit(hint, Math.max(0, width - cellWidth(label)))}${ansi.reset}`);
    }
  }

  return rows;
}

// 绘制主内容区
function drawMainContent(state: TuiState, width: number, height: number): string[] {
  if (state.mode === "topic") {
    return drawTopicContent(state, width, height);
  }

  if (state.loading) {
    return drawLoadingContent(state, width, height);
  }

  if (state.error) {
    return drawErrorContent(state, width, height);
  }

  return drawListContent(state, width, height);
}

// 绘制加载中内容
function drawLoadingContent(state: TuiState, width: number, height: number): string[] {
  const rows: string[] = [];
  rows.push(`${cc98Blue}${ansi.bold} ${state.viewTitle}${ansi.reset}`);
  rows.push(fit(`${muted} 正在加载...${ansi.reset}`, width));
  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);
  rows.push(`${muted} ${"· ".repeat(Math.max(1, Math.floor((width - 2) / 2))).slice(0, width - 1)}${ansi.reset}`);

  while (rows.length < height) {
    rows.push(" ".repeat(width));
  }

  return rows.slice(0, height);
}

// 绘制错误内容
function drawErrorContent(state: TuiState, width: number, height: number): string[] {
  const rows: string[] = [];
  rows.push(`${cc98Blue}${ansi.bold} ${state.viewTitle}${ansi.reset}`);
  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);
  rows.push(`${danger} 请求失败${ansi.reset}`);
  rows.push(fit(` ${state.error}`, width));

  while (rows.length < height) {
    rows.push(" ".repeat(width));
  }

  return rows.slice(0, height);
}

// 绘制列表内容
function drawListContent(state: TuiState, width: number, height: number): string[] {
  const rows: string[] = [];
  rows.push(`${cc98Blue}${ansi.bold} ${state.viewTitle}${ansi.reset}`);
  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);

  const visibleCapacity = Math.max(1, Math.floor(Math.max(1, height - 3) / 3));
  if (state.itemIndex < state.scroll) {
    state.scroll = state.itemIndex;
  } else if (state.itemIndex >= state.scroll + visibleCapacity) {
    state.scroll = state.itemIndex - visibleCapacity + 1;
  }

  const visible = state.items.slice(state.scroll);
  visible.forEach((itemValue, offset) => {
    if (rows.length >= height) {
      return;
    }
    const index = state.scroll + offset;
    const active = index === state.itemIndex && (state.focus === "content" || state.mode === "settings");
    const prefix = active ? `${ok}●${ansi.reset}` : `${muted}•${ansi.reset}`;
    const title = fit(` ${itemValue.title}`, Math.max(10, width - 2));
    rows.push(active ? `${bg(5, 46, 74)}${prefix}${title}${ansi.reset}` : fit(`${prefix}${title}`, width));

    if (itemValue.meta && rows.length < height) {
      rows.push(fit(`  ${muted}${itemValue.meta}${ansi.reset}`, width));
    }
  });

  if (visible.length === 0) {
    rows.push(`${muted} 暂无数据${ansi.reset}`);
  }

  while (rows.length < height) {
    rows.push(" ".repeat(width));
  }

  return rows.slice(0, height);
}

// 绘制帖子内容
function drawTopicContent(state: TuiState, width: number, height: number): string[] {
  const rows: string[] = [];

  if (state.loading && (!state.topic || state.topic.lines.length === 0)) {
    rows.push(`${cc98Blue} 正在打开帖子...${ansi.reset}`);
    rows.push("");
    rows.push(`${muted} 只加载第一页，不预取未读楼层。${ansi.reset}`);

    while (rows.length < height) {
      rows.push(" ".repeat(width));
    }
    return rows.slice(0, height);
  }

  if (state.error) {
    rows.push(`${danger} 读取帖子失败${ansi.reset}`);
    rows.push(fit(` ${state.error}`, width));
    rows.push("");
    rows.push(`${muted} h/Esc 返回列表${ansi.reset}`);

    while (rows.length < height) {
      rows.push(" ".repeat(width));
    }
    return rows.slice(0, height);
  }

  const topic = state.topic;
  if (!topic) {
    return Array(height).fill(" ".repeat(width));
  }

  rows.push(`${cc98Blue}${ansi.bold} ${topic.title}${ansi.reset}`);
  rows.push(fit(`${muted} ${topic.meta}${ansi.reset}`, width));
  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);

  const viewport = Math.max(0, height - rows.length - 1);
  const maxScroll = Math.max(0, topic.lines.length - viewport);
  state.scroll = Math.min(state.scroll, maxScroll);
  const body = topic.lines.slice(state.scroll, state.scroll + viewport);

  for (const bodyLine of body) {
    if (bodyLine.startsWith("[image ")) {
      rows.push(fit(`${cc98BlueSoft}${bodyLine}${ansi.reset}`, width));
    } else if (bodyLine.startsWith("│ ")) {
      rows.push(fit(`${muted}${bodyLine}${ansi.reset}`, width));
    } else if (/^#\d+ /.test(bodyLine)) {
      rows.push(fit(`${ok}${bodyLine}${ansi.reset}`, width));
    } else {
      rows.push(fit(` ${bodyLine}`, width));
    }
  }

  const pageInfo = topic.hasMore
    ? `已载入 ${topic.loaded} 楼，n 下一页`
    : `已载入 ${topic.loaded} 楼，已到底`;
  rows.push(fit(`${muted}${pageInfo}${state.loadingMore ? " · 加载中" : ""}${ansi.reset}`, width));

  while (rows.length < height) {
    rows.push(" ".repeat(width));
  }

  return rows.slice(0, height);
}

// 绘制右侧面板
function drawRightPanel(state: TuiState, width: number, height: number): string[] {
  if (state.mode === "topic" && state.topic) {
    return drawTopicRight(state.topic, state.scroll, width, height);
  }

  if (state.focus === "nav") {
    return drawNavRight(state, width, height);
  }

  return drawItemRight(state, width, height);
}

// 绘制导航右侧面板
function drawNavRight(state: TuiState, width: number, height: number): string[] {
  const rows: string[] = [];
  const nav = navItems[state.navIndex];

  rows.push(`${cc98Blue}${ansi.bold} ${nav?.label ?? ""}${ansi.reset}`);
  rows.push(`${muted} ${nav?.hint ?? ""}${ansi.reset}`);
  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);

  for (const stat of state.stats) {
    if (rows.length >= height) break;
    rows.push(`${muted} ${stat.title}${ansi.reset}`);
    if (stat.detail) {
      rows.push(`${cc98BlueSoft} ${stat.detail}${ansi.reset}`);
    }
  }

  // 删除快捷键提示，只保留统计信息
  while (rows.length < height) {
    rows.push(" ".repeat(width));
  }

  return rows.slice(0, height);
}

// 绘制列表项右侧面板
function drawItemRight(state: TuiState, width: number, height: number): string[] {
  const rows: string[] = [];
  const selected = state.items[state.itemIndex];

  if (!selected) {
    return Array(height).fill(" ".repeat(width));
  }

  rows.push(`${cc98Blue}${ansi.bold} ${selected.title}${ansi.reset}`);
  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);

  if (selected.meta) {
    rows.push(`${muted} ${selected.meta}${ansi.reset}`);
  }
  if (selected.detail) {
    rows.push(`${cc98BlueSoft} ${selected.detail}${ansi.reset}`);
  }
  if (selected.topicId !== undefined) {
    rows.push(`${muted} 主题 #${selected.topicId}${ansi.reset}`);
  }
  if (selected.boardId !== undefined) {
    rows.push(`${muted} 版面 #${selected.boardId}${ansi.reset}`);
  }
  if (selected.userId !== undefined) {
    rows.push(`${muted} 用户 #${selected.userId}${ansi.reset}`);
  }
  if (selected.sortTime) {
    const date = new Date(selected.sortTime);
    const timeStr = date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    rows.push(`${muted} 时间: ${timeStr}${ansi.reset}`);
  }

  while (rows.length < height) {
    rows.push(" ".repeat(width));
  }

  return rows.slice(0, height);
}

// 绘制帖子右侧面板
function drawTopicRight(topic: any, scroll: number, width: number, height: number): string[] {
  const rows: string[] = [];
  const currentPost = topic.posts.find(
    (p: any) => scroll >= p.lineStart && scroll <= p.lineEnd
  );

  rows.push(`${cc98Blue}${ansi.bold} 帖子信息${ansi.reset}`);
  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);

  if (currentPost) {
    rows.push(`${muted} 楼层: #${currentPost.floor ?? "?"}${ansi.reset}`);
    rows.push(`${muted} 作者: ${currentPost.author}${ansi.reset}`);
    rows.push(`${muted} 时间: ${currentPost.time}${ansi.reset}`);
    if (currentPost.likeCount > 0) {
      rows.push(`${ok} 赞: ${currentPost.likeCount}${ansi.reset}`);
    }
    if (currentPost.dislikeCount > 0) {
      rows.push(`${danger} 踩: ${currentPost.dislikeCount}${ansi.reset}`);
    }
    if (currentPost.rating) {
      rows.push(`${muted} 评分: ${currentPost.rating}${ansi.reset}`);
    }
    if (currentPost.imageCount > 0) {
      rows.push(`${muted} 图片: ${currentPost.imageCount}${ansi.reset}`);
    }
    if (currentPost.linkCount > 0) {
      rows.push(`${muted} 链接: ${currentPost.linkCount}${ansi.reset}`);
    }
  }

  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);
  rows.push(`${muted} 当前: ${scroll + 1}/${topic.lines.length}${ansi.reset}`);
  rows.push(`${muted} 已加载: ${topic.loaded} 楼${ansi.reset}`);

  while (rows.length < height) {
    rows.push(" ".repeat(width));
  }

  return rows.slice(0, height);
}

// 绘制状态栏
function drawStatusBar(state: TuiState, width: number): string {
  const left = getStatus(state);
  const right = getKeyHints(state);
  const padding = Math.max(1, width - cellWidth(left) - cellWidth(right) - 2);
  return fit(`${muted} ${left}${" ".repeat(padding)}${right} `, width);
}

// 获取状态文本
function getStatus(state: TuiState): string {
  if (state.loading) {
    return "加载中...";
  }
  if (state.error) {
    return `错误: ${state.error}`;
  }
  if (state.inputMode) {
    return state.inputPrompt;
  }
  return state.status || getDefaultStatus(state);
}

// 获取默认状态文本
function getDefaultStatus(state: TuiState): string {
  switch (state.mode) {
    case "topic":
      return "帖子阅读";
    case "settings":
      return "设置";
    default:
      if (state.currentBoard) {
        return `版面 #${state.currentBoard.boardId}`;
      }
      if (state.currentChat) {
        return "私信";
      }
      return state.focus === "nav" ? "导航" : "列表";
  }
}

// 获取快捷键提示
function getKeyHints(state: TuiState): string {
  if (state.modal === "search") {
    return "Enter 搜索/打开  Tab 切换  / 关闭";
  }
  if (state.modal === "menu") {
    return "j/k 移动  Enter 执行  o 关闭";
  }
  if (state.modal === "user") {
    return "f 关注  m 私信  u 关闭";
  }
  if (state.mode === "topic") {
    return "j/k 滚动  n 下页  h 返回  s 收藏  l/d 赞踩  u 用户";
  }
  if (state.mode === "settings") {
    return "j/k 选择  Enter 执行  h 返回";
  }
  if (state.currentChat) {
    return "j/k 滚动  n 更多  h 返回  r 刷新";
  }
  return state.focus === "nav"
    ? "j/k 切换  Enter 进入  r 刷新  / 搜索  ? 帮助  q 退出"
    : "j/k 选择  Enter 打开  h 返回  r 刷新  / 搜索  ? 帮助  q 退出";
}
