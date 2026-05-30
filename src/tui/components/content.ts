// 中栏内容组件

import type { TuiState } from "../state/types.js";
import type { Component } from "./types.js";
import { ansi, bg, fg } from "../ansi.js";
import { fit, blank, cellWidth } from "./utils.js";

const cc98Blue = fg(0, 130, 202);
const cc98BlueSoft = fg(94, 180, 232);
const white = fg(245, 250, 255);
const muted = fg(139, 152, 166);
const line = fg(52, 84, 112);
const danger = fg(245, 101, 101);
const ok = fg(91, 207, 140);

export class Content implements Component {
  visible = true;

  render(state: TuiState, width: number, height: number): string[] {
    if (state.mode === "topic") {
      return this.renderTopic(state, width, height);
    }

    if (state.loading) {
      return this.renderLoading(state, width, height);
    }

    if (state.error) {
      return this.renderError(state, width, height);
    }

    return this.renderList(state, width, height);
  }

  private renderLoading(state: TuiState, width: number, height: number): string[] {
    return [
      `${cc98Blue}${ansi.bold} ${state.viewTitle}${ansi.reset}`,
      fit(`${muted} 正在加载...${ansi.reset}`, width),
      `${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`,
      `${muted} ${"· ".repeat(Math.max(1, Math.floor((width - 2) / 2))).slice(0, width - 1)}${ansi.reset}`
    ].concat(blank(height - 4, width)).slice(0, height);
  }

  private renderError(state: TuiState, width: number, height: number): string[] {
    return [
      `${cc98Blue}${ansi.bold} ${state.viewTitle}${ansi.reset}`,
      `${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`,
      `${danger} 请求失败${ansi.reset}`,
      fit(` ${state.error}`, width)
    ].concat(blank(height - 4, width)).slice(0, height);
  }

  private renderList(state: TuiState, width: number, height: number): string[] {
    const rows: string[] = [];
    rows.push(`${cc98Blue}${ansi.bold} ${state.viewTitle}${ansi.reset}`);
    rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);

    // 每项占2行（标题 + meta），计算可见容量
    const headerRows = 2; // 标题 + 分隔线
    const rowsPerItem = 2; // 标题行 + meta 行
    const footerRows = 1; // 底部信息
    const visibleCapacity = Math.max(1, Math.floor((height - headerRows - footerRows) / rowsPerItem));
    
    // 滚动逻辑：确保选中项可见
    if (state.itemIndex < state.scroll) {
      state.scroll = state.itemIndex;
    } else if (state.itemIndex >= state.scroll + visibleCapacity) {
      state.scroll = state.itemIndex - visibleCapacity + 1;
    }
    
    // 渲染可见项
    const visible = state.items.slice(state.scroll, state.scroll + visibleCapacity);
    for (let i = 0; i < visible.length; i++) {
      const itemValue = visible[i];
      const index = state.scroll + i;
      const active = index === state.itemIndex && (state.focus === "content" || state.mode === "settings");
      const prefix = active ? `${ok}●${ansi.reset}` : `${muted}•${ansi.reset}`;
      const title = fit(` ${itemValue.title}`, Math.max(10, width - 2));
      rows.push(active ? `${bg(5, 46, 74)}${prefix}${title}${ansi.reset}` : fit(`${prefix}${title}`, width));

      if (itemValue.meta && rows.length < height) {
        rows.push(fit(`  ${muted}${itemValue.meta}${ansi.reset}`, width));
      }
    }

    if (visible.length === 0) {
      rows.push(`${muted} 暂无数据${ansi.reset}`);
    }

    // 底部滚动指示器
    const remaining = state.items.length - state.scroll - visibleCapacity;
    if (remaining > 0 && rows.length < height) {
      rows.push(fit(`${muted}  ↓ 还有 ${remaining} 项${ansi.reset}`, width));
    }

    return rows.concat(blank(height - rows.length, width)).slice(0, height);
  }

  private renderTopic(state: TuiState, width: number, height: number): string[] {
    if (state.loading && (!state.topic || state.topic.lines.length === 0)) {
      return [
        `${cc98Blue} 正在打开帖子...${ansi.reset}`,
        "",
        `${muted} 只加载第一页，不预取未读楼层。${ansi.reset}`
      ].concat(blank(height - 3, width)).slice(0, height);
    }

    if (state.error) {
      return [
        `${danger} 读取帖子失败${ansi.reset}`,
        fit(` ${state.error}`, width),
        "",
        `${muted} h/Esc 返回列表${ansi.reset}`
      ].concat(blank(height - 4, width)).slice(0, height);
    }

    const topic = state.topic;
    if (!topic) {
      return blank(height, width);
    }

    const rows: string[] = [];
    rows.push(`${cc98Blue}${ansi.bold} ${topic.title}${ansi.reset}`);
    rows.push(fit(`${muted} ${topic.meta}${ansi.reset}`, width));
    rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);

    const viewport = Math.max(0, height - rows.length - 1);
    const maxScroll = Math.max(0, topic.lines.length - viewport);
    const maxCursor = Math.max(0, topic.lines.length - 1);
    topic.viewportRows = viewport;
    topic.cursorLine = Math.min(maxCursor, Math.max(0, topic.cursorLine));

    state.scroll = Math.min(maxScroll, topic.cursorLine);

    const body = topic.lines.slice(state.scroll, state.scroll + viewport);

    for (let offset = 0; offset < body.length; offset += 1) {
      const bodyLine = body[offset] ?? "";
      const lineIndex = state.scroll + offset;
      const isCursor = lineIndex === topic.cursorLine;
      let renderedLine: string;

      const topicLine = this.getTopicLine(topic, lineIndex);
      if (topicLine?.kind === "image" && topicLine.imageUrl) {
        const cachedPath = topic.imageCache.get(topicLine.imageUrl);
        const status = topic.imageErrors.has(topicLine.imageUrl)
          ? "下载失败"
          : topic.imageLoading.has(topicLine.imageUrl)
            ? "加载中"
            : cachedPath
              ? "已缓存"
              : undefined;
        renderedLine = `${cc98BlueSoft}${bodyLine}${status ? `  ${muted}${status}` : ""}${ansi.reset}`;
      } else if (bodyLine.startsWith("[image ")) {
        renderedLine = `${cc98BlueSoft}${bodyLine}${ansi.reset}`;
      } else if (bodyLine.startsWith("│ ")) {
        renderedLine = `${muted}${bodyLine}${ansi.reset}`;
      } else if (/^#\d+ /.test(bodyLine)) {
        renderedLine = `${ok}${bodyLine}${ansi.reset}`;
      } else {
        renderedLine = ` ${bodyLine}`;
      }
      rows.push(this.renderTopicLine(renderedLine, width, isCursor));
    }

    const pageInfo = topic.hasMore
      ? `已载入 ${topic.loaded} 楼`
      : `已载入 ${topic.loaded} 楼，已到底`;
    rows.push(fit(`${muted}${pageInfo}${state.loadingMore ? " · 加载中" : ""}${ansi.reset}`, width));
    return rows.concat(blank(height - rows.length, width)).slice(0, height);
  }

  private renderTopicLine(value: string, width: number, isCursor: boolean): string {
    if (!isCursor) {
      return fit(value, width);
    }
    const marker = `${ok}${ansi.bold}▶${ansi.reset}`;
    const contentWidth = Math.max(0, width - 1);
    const fitted = fit(value, contentWidth);
    const padding = Math.max(0, contentWidth - cellWidth(fitted));
    return `${fitted}${" ".repeat(padding)}${marker}`;
  }

  private getTopicLine(topic: NonNullable<TuiState["topic"]>, lineIndex: number) {
    for (const post of topic.posts) {
      if (lineIndex >= post.lineStart && lineIndex <= post.lineEnd) {
        return post.lines.find((entry) => entry.line === lineIndex);
      }
    }
    return undefined;
  }
}
