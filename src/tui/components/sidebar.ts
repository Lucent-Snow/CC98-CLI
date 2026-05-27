// 左栏导航组件

import type { TuiState, NavItem } from "../state/types.js";
import type { Component } from "./types.js";
import { ansi, bg, fg } from "../ansi.js";
import { fit, cellWidth } from "./utils.js";

const cc98Blue = fg(0, 130, 202);
const cc98BlueSoft = fg(94, 180, 232);
const white = fg(245, 250, 255);
const muted = fg(139, 152, 166);

const navItems: NavItem[] = [
  { id: "hot", label: "十大", hint: "热门话题" },
  { id: "favorite", label: "收藏", hint: "版面帖子" },
  { id: "new", label: "最新", hint: "新帖流" },
  { id: "boards", label: "版面", hint: "所有分区" },
  { id: "following", label: "关注", hint: "用户动态" },
  { id: "messages", label: "消息", hint: "未读与私信" },
  { id: "notices", label: "通知", hint: "系统与回复" },
  { id: "me", label: "我的", hint: "当前账号" },
  { id: "more", label: "更多", hint: "只读内容" },
  { id: "settings", label: "设置", hint: "账号与配置" }
];

export class Sidebar implements Component {
  visible = true;

  render(state: TuiState, width: number, height: number): string[] {
    const rows: string[] = [];
    
    // 计算滚动窗口：确保选中项可见
    const total = navItems.length;
    let offset = 0;
    if (total > height) {
      // 选中项在窗口中间偏上
      offset = Math.max(0, state.navIndex - Math.floor(height / 3));
      // 不超过最大偏移
      offset = Math.min(offset, total - height);
    }
    
    for (let row = 0; row < height; row += 1) {
      const index = offset + row;
      const nav = navItems[index];
      if (!nav) {
        rows.push(" ".repeat(width));
        continue;
      }

      const active = index === state.navIndex;
      const focused = state.focus === "nav";
      const label = ` ${nav.label}`;
      const hint = width > 16 ? ` ${nav.hint}` : "";
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
}
