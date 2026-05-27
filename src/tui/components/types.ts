// 组件类型定义

import type { TuiState } from "../state/types.js";

// 组件接口
export interface Component {
  // 是否可见
  visible: boolean;

  // 渲染组件
  render(state: TuiState, width: number, height: number): string | string[];
}

// 布局区域
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 组件层级
export type Layer =
  | "content"   // 主内容
  | "overview"  // 概览区
  | "sidebar"   // 左栏导航
  | "right"     // 右栏信息
  | "status"    // 底部状态栏
  | "menu"      // 菜单
  | "search"    // 搜索
  | "user"      // 用户详情
  | "help"      // 帮助
  | "info"      // 信息
  | "input"     // 输入框
  | "which";    // 快捷键提示

// 组件配置
export interface ComponentConfig {
  layer: Layer;
  visible: boolean;
}
