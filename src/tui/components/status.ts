// 底部状态栏组件

import type { TuiState } from "../state/types.js";
import type { Component } from "./types.js";
import { fg } from "../ansi.js";
import { fit, cellWidth } from "./utils.js";
import { getStatus } from "../state/store.js";
import { getKeybindingManager, type KeybindingAction } from "../keybindings.js";

const muted = fg(139, 152, 166);
const cc98Blue = fg(0, 130, 202);

export class StatusBar implements Component {
  visible = true;
  private readonly keybindings = getKeybindingManager();

  render(state: TuiState, width: number): string {
    if (state.inputMode) {
      return fit(`${cc98Blue} ${state.inputPrompt}${state.inputValue}`, width);
    }
    const left = this.getStatusWithUpdate(state);
    const right = this.getKeyHints(state);
    const padding = Math.max(1, width - cellWidth(left) - cellWidth(right) - 2);
    return fit(`${muted} ${left}${" ".repeat(padding)}${right} `, width);
  }

  private getStatusWithUpdate(state: TuiState): string {
    const status = getStatus(state);
    if (state.updateAvailable) {
      const updateHint = `⬆ ${state.updateAvailable.tagName}`;
      return status ? `${status}  ${updateHint}` : updateHint;
    }
    return status;
  }

  private getKeyHints(state: TuiState): string {
    if (state.modal === "search") {
      return `${this.keys("searchExecute")} 搜索/打开  ${this.keys("searchToggleMode")} 切换  ${this.keys("searchClose")} 关闭`;
    }
    if (state.modal === "menu") {
      return `${this.keys("menuNext")}/${this.keys("menuPrev")} 移动  ${this.keys("menuExecute")} 执行  ${this.keys("menuClose")} 关闭`;
    }
    if (state.modal === "user") {
      return "f 关注  m 私信  u 关闭";
    }
    if (state.mode === "topic") {
      return `${this.keys("topicScrollDown")}/${this.keys("topicScrollUp")} 滚动  ${this.keys("topicNextPage")}/${this.keys("topicPrevPage")} 翻页  ${this.keys("topicNextFloor")}/${this.keys("topicPrevFloor")} 楼层  ${this.keys("back")} 返回`;
    }
    if (state.mode === "settings") {
      return `${this.keys("moveDown")}/${this.keys("moveUp")} 选择  ${this.keys("confirm")} 执行  ${this.keys("back")} 返回`;
    }
    if (state.tabs.length > 1) {
      return `${this.keys("listNext")}/${this.keys("listPrev")} 选择  Tab 切换  ${this.keys("listOpen")} 打开  ${this.keys("listRefresh")} 刷新  ${this.keys("search")} 搜索`;
    }
    if (state.currentChat) {
      return `${this.keys("listNext")}/${this.keys("listPrev")} 滚动  ${this.keys("listBack")} 返回  ${this.keys("listRefresh")} 刷新`;
    }
    return state.focus === "nav"
      ? `${this.keys("moveDown")}/${this.keys("moveUp")} 切换  ${this.keys("confirm")} 进入  ${this.keys("refresh")} 刷新  ${this.keys("search")} 搜索  ${this.keys("help")} 帮助  ${this.keys("quit")} 退出`
      : `${this.keys("listNext")}/${this.keys("listPrev")} 选择  ${this.keys("listOpen")} 打开  ${this.keys("listBack")} 返回  ${this.keys("listRefresh")} 刷新  ${this.keys("search")} 搜索  ${this.keys("help")} 帮助`;
  }

  private keys(action: KeybindingAction): string {
    return this.keybindings.formatActionKeys(action);
  }
}
