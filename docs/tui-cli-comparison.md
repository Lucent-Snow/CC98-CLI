# TUI 与 CLI 功能对照

CLI 面向脚本和精确调用，默认输出 JSON。TUI 面向日常浏览，把多个接口组合成连续阅读和操作体验。

## 阅读入口

| 功能 | TUI | CLI |
|------|-----|-----|
| 十大 | 左栏“十大” | `cc98 forum index` |
| 最新帖子 | “新帖 / 最新” | `cc98 topic new` |
| 随机帖子 | “新帖 / 随机” | `cc98 topic random` |
| 推荐帖子 | “新帖 / 推荐” | `cc98 topic recommendation` |
| 关注版面 | “关注 / 版面” | `cc98 me` 后按版面调用 `cc98 board <id>` |
| 关注用户动态 | “关注 / 用户” | `cc98 user moment` |
| 收藏更新 | “关注 / 追踪” | `cc98 user favorite-updates` |
| 版面列表 | 左栏“版面” | `cc98 forum boards` |
| 版面帖子 | 进入版面 | `cc98 board <id>` |
| 帖子详情 | 选中主题后 Enter 或 `l` | `cc98 topic <id>` |
| 通知 | 左栏“通知” | `cc98 notice system` / `at` / `reply` |
| 私信 | 左栏“消息” | `cc98 message recent` / `history` |
| 当前用户 | 左栏“我的” | `cc98 me` |
| 用户资料 | 用户详情弹窗 | `cc98 user profile <id>` |
| 浏览历史 | “我的”入口 | `cc98 user browse-history` |
| 收藏分组 | “我的”入口 | `cc98 user favorite-groups` |

## 搜索

| 功能 | TUI | CLI |
|------|-----|-----|
| 搜索帖子 | `/` 后选择“帖子” | `cc98 search <keyword>` 或 `cc98 topic search <keyword>` |
| 搜索用户 | `/` 后选择“用户” | `cc98 user search <name>` |
| 搜索当前内容 | `/` 后选择“内容” | TUI 本地搜索当前已加载内容 |

## 写入操作

| 功能 | TUI | CLI |
|------|-----|-----|
| 签到 | “我的”页面 | `cc98 me signin` |
| 收藏主题 | 帖子 `o` 菜单 | `cc98 topic favorite add <id>` |
| 取消收藏主题 | 帖子 `o` 菜单 | `cc98 topic favorite remove <id>` |
| 收藏版面 | 列表 `o` 菜单 | `cc98 board favorite add <id>` |
| 取消收藏版面 | 列表 `o` 菜单 | `cc98 board favorite remove <id>` |
| 关注用户 | 用户详情 `f` | `cc98 user follow <id>` |
| 取消关注用户 | 用户详情 `f` | `cc98 user unfollow <id>` |
| 发私信 | 用户详情 `m` | `cc98 message send <user-id> <content>` |
| 回帖 | 帖子 `R` | `cc98 topic reply <topic-id> <content>` |
| 发帖 | CLI | `cc98 topic create <board-id> <title> <content>` |
| 点赞/踩 | 帖子 `o` 菜单 | `cc98 post like <post-id>` / `dislike` |

## 快捷键

| 上下文 | 键 | 功能 |
|--------|----|------|
| 全局 | `j/k` 或 `↑/↓` | 上下移动 |
| 全局 | `l/→/Enter` | 进入或打开 |
| 全局 | `h/←/Esc` | 返回或关闭 |
| 全局 | `/` | 搜索 |
| 全局 | `o` | 打开操作菜单 |
| 全局 | `?` | 帮助 |
| 全局 | `q` | 退出 |
| 列表 | `Tab` / `Shift+Tab` | 切换标签 |
| 可换批列表 | `r` | 换一批或刷新 |
| 帖子详情 | `j/k` | 逐行滚动 |
| 帖子详情 | `{` / `}` | 上一页 / 下一页 |
| 帖子详情 | `[` / `]` | 上一楼 / 下一楼 |
| 帖子详情 | 数字 + `g` | 跳页 |
| 帖子详情 | 数字 + `G` | 跳楼 |
| 帖子详情 | `R` | 回复 |
| 帖子详情 | `o` | 楼层 / 用户 / 帖子操作菜单；图片打开在楼层菜单 |
| 搜索内容 | `n/N` | 下一个 / 上一个匹配 |
