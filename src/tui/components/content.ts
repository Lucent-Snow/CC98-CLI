// 中栏内容组件

import type { TuiState } from "../state/types.js";
import type { Component } from "./types.js";
import { ansi, bg, fg } from "../ansi.js";
import { fit, blank } from "./utils.js";

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
    return rows.concat(blank(height - rows.length, width)).slice(0, height);
  }
}
