import type { ContentItem, NavItem } from "./state/types.js";

export const navItems: readonly NavItem[] = [
  { id: "hot", label: "十大", hint: "热门话题" },
  { id: "favorite", label: "收藏", hint: "版面帖子" },
  { id: "new", label: "最新", hint: "新帖流" },
  { id: "boards", label: "版面", hint: "所有分区" },
  { id: "following", label: "关注", hint: "用户动态" },
  { id: "messages", label: "消息", hint: "未读与私信" },
  { id: "notices", label: "通知", hint: "系统与回复" },
  { id: "me", label: "我的", hint: "当前账号" },
  { id: "settings", label: "设置", hint: "账号与配置" }
];

export const settingsItems: readonly ContentItem[] = [
  { title: "切换账号", meta: "account", detail: "选择或管理登录账号" },
  { title: "检查更新", meta: "update", detail: "检查 CC98-CLI 新版本" },
  { title: "缓存管理", meta: "cache", detail: "查看和清理本地缓存" },
  { title: "CC98 像素 Logo", meta: "pixel-logo", detail: "查看终端像素化的 CC98 标识" },
  { title: "表情包预览", meta: "emoji-preview", detail: "按分类查看 365 个终端像素表情" },
  { title: "快捷键设置", meta: "keybindings", detail: "自定义快捷键绑定" },
  { title: "快捷键帮助", meta: "help", detail: "查看所有可用快捷键" },
  { title: "退出登录", meta: "logout", detail: "清除本地登录信息" }
];
