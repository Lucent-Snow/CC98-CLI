// 概览区组件

import type { TuiState } from "../state/types.js";
import type { Component } from "./types.js";
import { fg } from "../ansi.js";
import { fit } from "./utils.js";

const cc98BlueSoft = fg(94, 180, 232);
const line = fg(52, 84, 112);

export class Overview implements Component {
  visible = true;

  render(state: TuiState, width: number, height: number): string[] {
    const rows: string[] = [];
    const summary = state.overview.length > 0
      ? state.overview.map((entry) => `${entry.title} ${entry.detail ?? "-"}`).join("  ")
      : "全站概览会在读取十大时更新";
    rows.push(fit(`${cc98BlueSoft} ${summary}`, width));

    if (height > 1) {
      rows.push(`${line}${"─".repeat(width)}`);
    }

    return rows.slice(0, height);
  }
}
