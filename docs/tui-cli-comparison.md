# TUI vs CLI 功能对比

> 更新时间：2026-06-02

## 覆盖结论

CLI 覆盖更完整，适合脚本和精确调用；TUI 覆盖日常浏览主链路，并把多个接口组合成连续阅读体验。0.5.2 后 TUI 搜索、菜单和基础写入入口已基本补齐。

## 主要入口对照

| 功能 | TUI | CLI | 说明 |
|------|-----|-----|------|
| 十大 | ✅ 左栏置顶 | ✅ `forum index` | TUI 保留独立入口 |
| 新帖：最新 | ✅ 新帖/最新 | ✅ `topic new` | 按时间分页，TUI 自动补页 |
| 新帖：随机 | ✅ 新帖/随机 | ✅ `topic random` | `r` 换一批，不做下滑补页 |
| 新帖：推荐 | ✅ 新帖/推荐 | ✅ `topic recommendation` | `r` 换一批，不做下滑补页 |
| 关注：版面 | ✅ 关注/版面 | ⚠️ `me` + `board <id>` | TUI 聚合关注版面帖子流，CLI 暂无单命令聚合 |
| 关注：用户 | ✅ 关注/用户 | ✅ `user moment` | 按时间分页，TUI 自动补页 |
| 关注：追踪 | ✅ 关注/追踪 | ✅ `user favorite-updates` / `topic favorite --order 1` | 收藏更新流 |
| 版面列表 | ✅ 版面 | ✅ `forum boards` | - |
| 版面帖子 | ✅ 进入版面 | ✅ `board <id>` | - |
| 帖子详情 | ✅ Enter/l | ✅ `topic <id>` | TUI 按需加载楼层窗口 |
| 通知 | ✅ 通知 | ✅ `notice system/at/reply` | TUI 按类型入口展示 |
| 私信 | ✅ 消息 | ✅ `message recent/history` | 私信对话回复待补 |
| 当前用户 | ✅ 我的 | ✅ `me` | - |
| 搜索帖子 | ✅ `/` | ✅ `search <keyword>` / `topic search` | TUI 支持全站/当前版面和分页继续加载 |
| 搜索用户 | ✅ `/` 后切换 | ✅ `user search <name>` | - |
| 搜索内容 | ✅ `/` 后切换 | - | 搜索中栏已加载内容，支持实时高亮和 `n/N` 跳转 |
| 用户资料 | ✅ 用户详情 | ✅ `user profile <id>` | - |
| 浏览历史 | ✅ 我的入口 | ✅ `user browse-history` | - |
| 收藏分组 | ✅ 我的入口 | ✅ `user favorite-groups` | - |
| 投票信息 | ✅ 帖子操作 | ✅ `topic vote` | - |
| 点赞状态 | ✅ 帖子操作 | ✅ `post reaction-state` | - |
| 评分原因 | ✅ 只读入口 | ✅ `post rate-reasons` | - |

## 写入能力对照

| 功能 | TUI | CLI | 说明 |
|------|-----|-----|------|
| 签到 | ✅ 我的 | ✅ `me signin` | - |
| 收藏主题 | ✅ 帖子 `s` | ✅ `topic favorite add/remove` | - |
| 关注用户 | ✅ 用户详情 `f` | ✅ `user follow/unfollow` | - |
| 发私信 | ✅ 用户详情 `m` | ✅ `message send` | 私信对话内回复待补 |
| 点赞/踩 | ✅ 帖子 `l/d` | ✅ `post like/dislike` | - |
| 收藏版面 | ✅ 操作菜单 | ✅ `board favorite add/remove` | - |
| 发帖 | ❌ | ✅ `topic create` | TUI 需要文本编辑器 |
| 回帖 | ✅ 帖子 `R` | ✅ `topic reply` | Markdown-only 基础回复 |

## 仍需补齐

| 差距 | 优先级 | 说明 |
|------|--------|------|
| TUI 发帖编辑器 | P1 | 复用回复编辑器，补发帖入口 |
| Markdown 预览/插入增强 | P1 | 回复/发帖编辑器补预览、表情、图片和链接插入 |
| CLI 聚合关注版面流 | P2 | TUI 已有聚合逻辑，CLI 可后续增加 `board following-topics` 类命令 |

## 快捷键要点

| 上下文 | 键 | 功能 |
|--------|----|------|
| 全局 | `j/k`、`h/l`、`Enter` | 移动、返回、进入 |
| 全局 | `/`、`?`、`q` | 搜索、帮助、退出 |
| 列表 | `Tab` / `Shift+Tab`、`1/2/3` | 切换标签 |
| 可换批列表 | `r` | 随机/推荐换一批 |
| 帖子详情 | `n/Space`、`gg/G`、`[` / `]` | 翻页、跳转、切楼层 |
| 帖子详情 | `s`、`l/d`、`R`、`u` | 收藏、赞踩、回复、查看用户 |
| 用户详情 | `f`、`m` | 关注、发私信 |
| 内容搜索 | `n/N`、`Esc` | 下一个/上一个匹配、清除高亮 |
