// 快捷键绑定系统

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

// 快捷键动作定义
export type KeybindingAction =
  // 导航
  | "moveUp"
  | "moveDown"
  | "moveLeft"
  | "moveRight"
  | "confirm"
  | "back"
  // 全局
  | "search"
  | "refresh"
  | "menu"
  | "help"
  | "quit"
  // 帖子阅读
  | "topicScrollUp"
  | "topicScrollDown"
  | "topicNextPage"
  | "topicPrevPage"
  | "topicNextFloor"
  | "topicPrevFloor"
  | "topicJumpPage"
  | "topicJumpFloor"
  | "topicJumpLast"
  | "topicFavorite"
  | "topicLike"
  | "topicDislike"
  | "topicUser"
  | "topicVote"
  | "topicReaction"
  | "topicOpenImage"
  | "topicCopyLink"
  | "topicRefresh"
  // 列表
  | "listNext"
  | "listPrev"
  | "listOpen"
  | "listBack"
  | "listRefresh"
  // 搜索
  | "searchToggleMode"
  | "searchNext"
  | "searchPrev"
  | "searchExecute"
  | "searchClose"
  // 菜单
  | "menuNext"
  | "menuPrev"
  | "menuExecute"
  | "menuClose"
  // 输入
  | "inputConfirm"
  | "inputCancel"
  | "inputBackspace";

// 默认快捷键配置
export interface KeybindingConfig {
  [action: string]: string[];
}

// 默认快捷键映射
export const DEFAULT_KEYBINDINGS: KeybindingConfig = {
  // 导航
  moveUp: ["k", "\x1b[A"],
  moveDown: ["j", "\x1b[B"],
  moveLeft: ["h", "\x1b[D"],
  moveRight: ["l", "\x1b[C"],
  confirm: ["\r"],
  back: ["h", "\x1b[D", "\x1b"],
  // 全局
  search: ["/"],
  refresh: ["r"],
  menu: ["o"],
  help: ["?"],
  quit: ["q", "\u0003"],
  // 帖子阅读
  topicScrollUp: ["k", "\x1b[A"],
  topicScrollDown: ["j", "\x1b[B"],
  topicNextPage: ["}"],
  topicPrevPage: ["{"],
  topicNextFloor: ["]"],
  topicPrevFloor: ["["],
  topicJumpPage: ["g"],
  topicJumpFloor: ["G"],
  topicJumpLast: ["G"],
  topicFavorite: ["s"],
  topicLike: ["l"],
  topicDislike: ["d"],
  topicUser: ["u"],
  topicVote: ["v"],
  topicReaction: ["a"],
  topicOpenImage: ["o"],
  topicCopyLink: ["c"],
  topicRefresh: ["r"],
  // 列表
  listNext: ["j", "\x1b[B"],
  listPrev: ["k", "\x1b[A"],
  listOpen: ["l", "\x1b[C", "\r"],
  listBack: ["h", "\x1b[D"],
  listRefresh: ["r"],
  // 搜索
  searchToggleMode: ["\t"],
  searchNext: ["j", "\x1b[B"],
  searchPrev: ["k", "\x1b[A"],
  searchExecute: ["\r"],
  searchClose: ["\x1b", "/"],
  // 菜单
  menuNext: ["j", "\x1b[B"],
  menuPrev: ["k", "\x1b[A"],
  menuExecute: ["\r", "l"],
  menuClose: ["\x1b", "o"],
  // 输入
  inputConfirm: ["\r"],
  inputCancel: ["\x1b"],
  inputBackspace: ["\x7f"]
};

// 快捷键管理器
export class KeybindingManager {
  private config: KeybindingConfig;
  private configPath: string;
  private loaded = false;

  constructor() {
    this.config = { ...DEFAULT_KEYBINDINGS };
    this.configPath = join(homedir(), ".cc98-cli", "keybindings.json");
  }

  // 加载配置文件
  async load(): Promise<void> {
    try {
      const content = await readFile(this.configPath, "utf-8");
      const userConfig = JSON.parse(content) as KeybindingConfig;
      this.config = this.mergeConfig(DEFAULT_KEYBINDINGS, userConfig);
      this.loaded = true;
    } catch {
      // 文件不存在或解析失败，使用默认配置
      this.config = { ...DEFAULT_KEYBINDINGS };
      this.loaded = true;
    }
  }

  // 保存配置文件
  async save(): Promise<void> {
    try {
      const dir = join(homedir(), ".cc98-cli");
      await mkdir(dir, { recursive: true });
      await writeFile(this.configPath, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (error) {
      throw new Error(`保存快捷键配置失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 合并配置（用户配置覆盖默认配置）
  private mergeConfig(defaults: KeybindingConfig, user: KeybindingConfig): KeybindingConfig {
    const merged = { ...defaults };
    for (const [action, keys] of Object.entries(user)) {
      if (action in defaults) {
        merged[action] = keys;
      }
    }
    return merged;
  }

  // 获取动作的快捷键
  getKeys(action: KeybindingAction): string[] {
    return this.config[action] ?? [];
  }

  // 检查按键是否匹配动作
  matches(key: string, action: KeybindingAction): boolean {
    const keys = this.getKeys(action);
    return keys.includes(key);
  }

  // 获取所有配置
  getConfig(): KeybindingConfig {
    return { ...this.config };
  }

  // 更新动作的快捷键
  updateAction(action: KeybindingAction, keys: string[]): void {
    this.config[action] = keys;
  }

  // 重置为默认配置
  resetToDefault(): void {
    this.config = { ...DEFAULT_KEYBINDINGS };
  }

  // 获取动作的描述
  getActionDescription(action: KeybindingAction): string {
    const descriptions: Record<KeybindingAction, string> = {
      moveUp: "上移",
      moveDown: "下移",
      moveLeft: "左移/返回",
      moveRight: "右移/进入",
      confirm: "确认",
      back: "返回/取消",
      search: "搜索",
      refresh: "刷新",
      menu: "菜单",
      help: "帮助",
      quit: "退出",
      topicScrollUp: "帖子上滚",
      topicScrollDown: "帖子下滚",
      topicNextPage: "下一页",
      topicPrevPage: "上一页",
      topicNextFloor: "下一层",
      topicPrevFloor: "上一层",
      topicJumpPage: "跳页",
      topicJumpFloor: "跳楼",
      topicJumpLast: "最后一页",
      topicFavorite: "收藏",
      topicLike: "点赞",
      topicDislike: "踩",
      topicUser: "查看用户",
      topicVote: "查看投票",
      topicReaction: "查看评价",
      topicOpenImage: "打开图片",
      topicCopyLink: "复制链接",
      topicRefresh: "刷新帖子",
      listNext: "列表下移",
      listPrev: "列表上移",
      listOpen: "打开",
      listBack: "返回",
      listRefresh: "刷新列表",
      searchToggleMode: "切换搜索模式",
      searchNext: "搜索结果下移",
      searchPrev: "搜索结果上移",
      searchExecute: "执行搜索",
      searchClose: "关闭搜索",
      menuNext: "菜单下移",
      menuPrev: "菜单上移",
      menuExecute: "执行菜单项",
      menuClose: "关闭菜单",
      inputConfirm: "确认输入",
      inputCancel: "取消输入",
      inputBackspace: "退格"
    };
    return descriptions[action] ?? action;
  }

  // 格式化按键显示
  formatKey(key: string): string {
    const specialKeys: Record<string, string> = {
      "\r": "Enter",
      "\x1b": "Esc",
      "\t": "Tab",
      "\x7f": "Backspace",
      "\u0003": "Ctrl+C",
      "\x1b[A": "↑",
      "\x1b[B": "↓",
      "\x1b[C": "→",
      "\x1b[D": "←"
    };
    return specialKeys[key] ?? key;
  }

  // 格式化动作的快捷键显示
  formatActionKeys(action: KeybindingAction): string {
    const keys = this.getKeys(action);
    return keys.map(k => this.formatKey(k)).join("/");
  }
}

// 单例实例
let instance: KeybindingManager | null = null;

export function getKeybindingManager(): KeybindingManager {
  if (!instance) {
    instance = new KeybindingManager();
  }
  return instance;
}
