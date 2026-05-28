// 底部状态栏组件

import type { TuiState } from "../state/types.js";
import type { Component } from "./types.js";
import { fg } from "../ansi.js";
import { fit, cellWidth } from "./utils.js";
import { getStatus } from "../state/store.js";

const muted = fg(139, 152, 166);
const cc98Blue = fg(0, 130, 202);

export class StatusBar implements Component {
  visible = true;

  render(state: TuiState, width: number): string {
    if (state.inputMode) {
      return fit(`${cc98Blue} ${state.inputPrompt}${state.inputValue}`, width);
    }
    const left = getStatus(state);
    const right = this.getKeyHints(state);
    const padding = Math.max(1, width - cellWidth(left) - cellWidth(right) - 2);
    return fit(`${muted} ${left}${" ".repeat(padding)}${right} `, width);
  }

  private getKeyHints(state: TuiState): string {
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
}
