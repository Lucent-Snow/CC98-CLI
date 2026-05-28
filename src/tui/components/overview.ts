// 概览区组件

import type { TuiState } from "../state/types.js";
import type { Component } from "./types.js";
import { fg, ansi } from "../ansi.js";
import { fit } from "./utils.js";

const cc98BlueSoft = fg(94, 180, 232);
const danger = fg(245, 101, 101);
const muted = fg(139, 152, 166);

export class Overview implements Component {
  visible = true;

  render(state: TuiState, width: number, height: number): string[] {
    const rows: string[] = [];
    
    if (state.overview.length === 0) {
      rows.push(fit(`${muted} 加载中...`, width));
      return rows.slice(0, height);
    }
    
    const parts: string[] = [];
    for (const entry of state.overview) {
      const value = entry.detail ?? "-";
      // 未读数大于 0 时用红色高亮
      if (entry.title === "未读" && value !== "0") {
        parts.push(`${entry.title} ${danger}${value}${ansi.reset}`);
      } else {
        parts.push(`${entry.title} ${value}`);
      }
    }
    
    rows.push(fit(`${cc98BlueSoft} ${parts.join("  ")}`, width));

    return rows.slice(0, height);
  }
}
