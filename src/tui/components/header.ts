// 顶部标题栏组件

import type { TuiState } from "../state/types.js";
import type { Component } from "./types.js";
import { ansi, bg, fg } from "../ansi.js";
import { fit } from "./utils.js";

const cc98BlueBg = bg(0, 104, 176);
const white = fg(245, 250, 255);

export class Header implements Component {
  visible = true;

  render(state: TuiState, width: number): string {
    const account = state.account ? `@${state.account}` : "未登录";
    const title = ` CC98 ${state.viewTitle} `;
    const padding = Math.max(1, width - cellWidth(title) - cellWidth(account));
    return `${cc98BlueBg}${white}${ansi.bold}${fit(`${title}${" ".repeat(padding)}${account}`, width)}${ansi.reset}`;
  }
}

function cellWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (
      code >= 0x1100 &&
      (code <= 0x115f ||
        code === 0x2329 ||
        code === 0x232a ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe10 && code <= 0xfe19) ||
        (code >= 0xfe30 && code <= 0xfe6f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6))
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}
