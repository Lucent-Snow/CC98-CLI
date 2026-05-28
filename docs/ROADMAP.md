# CC98-CLI 开发路线图

## 当前状态

| 层面 | 状态 | 说明 |
|------|------|------|
| CLI 读取 | ✅ 完整 | 主要读取命令已覆盖 |
| CLI 写入 | ✅ 核心完成 | 私信、发帖/回帖、收藏、关注、签到、点赞/踩已接入 |
| TUI 读取 | ✅ 核心完成 | 十大、最新、版面、关注、私信、通知、搜索、只读入口已接入 |
| TUI 写入 | ✅ 基础完成 | 签到、收藏主题、关注用户、发私信、点赞/踩已接入 |
| TUI 架构 | ✅ 已重构 | 入口、控制器、渲染、状态、组件、帖子阅读器已拆分 |

## 阶段一：CLI 能力补全

**目标**：实现所有 CC98 API 的读写能力

### 读取功能（补全）
- [x] `message recent` - 最近联系人
- [x] `message history <userId>` - 私信历史
- [x] `user search <name>` - 搜索用户
- [x] `notice at` - @通知
- [x] `notice reply` - 回复通知
- [x] `user followers` - 粉丝列表
- [x] `user followees` - 关注列表
- [x] `topic favorites` - 收藏列表
- [x] `board info <id>` - 版面详情

### 写入功能（新增）
- [x] `message send <userId> <content>` - 发私信 ✅ 测试通过
- [x] `topic create <boardId> <title> <content>` - 发帖 ⚠️ 不测试
- [x] `topic reply <topicId> <content>` - 回帖 ⚠️ 不测试
- [x] `topic favorite add/remove <topicId>` - 收藏/取消收藏 ✅ 测试通过
- [x] `user follow/unfollow <userId>` - 关注/取消关注 ✅ 测试通过
- [ ] `post rate <postId> <score>` - 评分 ❌ 暂不实现
- [ ] `post edit <postId> <content>` - 编辑帖子 ❌ 暂不实现
- [x] `me signin` - 签到 ✅ 测试通过
- [x] `board favorite add/remove <boardId>` - 收藏版面 ✅ 测试通过
- [x] `post like/dislike <postId>` - 点赞/踩 ⚠️ 不测试

## 阶段二：TUI 功能接入

**目标**：将 CLI 功能合理接入 TUI

详见 [tui-cli-comparison.md](tui-cli-comparison.md)

### 核心读取（P0）
- [x] 搜索帖子/用户（按 / 触发） ✅
- [x] 用户详情页（帖子详情按 u） ✅

### 核心写入（P0）
- [x] 签到（"我的"页面） ✅
- [x] 收藏帖子（帖子详情按 s） ✅
- [x] 关注用户（用户详情按 f） ✅

### 消息增强（P1）
- [x] 通知列表（系统/@/回复） ✅
- [x] 发私信（用户详情按 m） ✅
- [x] 点赞/踩（帖子详情按 l/d） ✅
- [ ] 收藏版面（版面列表按 s）

### 高级功能（P2）
- [ ] 发帖/回帖（需要文本编辑器）
- [x] 浏览历史 ✅
- [x] 收藏夹分组 ✅

### 架构维护
- [x] 拆分 TUI 单文件实现
- [x] 删除半成品无上下文 keymap/action 注册表
- [x] 将异步副作用集中到 `TuiController`
- [x] 将三栏布局和模态框集中到 `renderer.ts`
- [x] 将帖子楼层索引集中到 `topic-reader.ts`

## 阶段三：产品打磨

**目标**：优化交互体验

### 内容渲染
- [x] UBB 标签渲染（ANSI 转换）
- [x] 图片打开（下载+缓存+系统查看器）
- [x] 链接复制到剪贴板
- [ ] 表情包 ASCII Art 映射（长期计划）

### 网络访问
- [x] WebVPN 支持（非校园网访问）
- [x] WebVPN 自动检测和启用
- [x] WebVPN 配置选项 (`cc98 vpn mode`)
- [x] WebVPN 凭据存储
- [x] TUI 启动时网络检测

### 按键设计
- [x] 完整的 Vim 键位支持 ✅
- [x] 弹窗交互统一 ✅
- [x] 搜索上下文敏感 ✅
- [x] 帮助文档完善 ✅
- [ ] 快捷键自定义

### 设置系统
- [ ] 主题切换（dark/light/自定义）
- [ ] 缓存策略配置
- [ ] 通知设置

### 体验优化
- [x] 导航重构（删除“更多”） ✅
- [x] Overview 显示真实数据 ✅
- [x] 右栏精简（删除快捷键提示） ✅
- [x] 状态栏统一出口 ✅
- [ ] 加载状态优化
- [ ] 错误处理完善
- [ ] 边界情况处理

---

## 详细接口对比

见 [api-comparison.md](api-comparison.md)

### 写入接口优先级

| 优先级 | 功能 | 方法 | 端点 |
|--------|------|------|------|
| P0 | 回帖 | POST | `/topic/{id}/post` |
| P0 | 发私信 | POST | `/message/user/{id}` |
| P0 | 发帖 | POST | `/board/{id}/topic` |
| P1 | 添加收藏 | PUT | `/me/favorite/{id}` |
| P1 | 取消收藏 | DELETE | `/me/favorite/{id}` |
| P1 | 关注 | PUT | `/me/followee/{id}` |
| P1 | 取消关注 | DELETE | `/me/followee/{id}` |
| P1 | 点赞/踩 | POST | `/post/{id}/like` |
| P2 | 评分 | POST | `/post/{id}/rating-v2` |
| P2 | 编辑帖子 | PUT | `/post/{id}` |
| P2 | 签到 | POST | `/me/signin` |
| P2 | 收藏版面 | PUT | `/me/custom-board/{id}` |
| P2 | 取消收藏版面 | DELETE | `/me/custom-board/{id}` |

---

## 长期计划

### 表情包 ASCII Art 映射

**目标**：将 CC98 表情包（如 `[ac01]`）转换为 ASCII Art 显示

**支持的表情包格式**（来自 CC98-Desktop 源码）：

| 格式 | 示例 | 说明 |
|-----|------|------|
| `ac` + 2-4位数字 | `[ac01]`、`[ac06]` | AC娘表情 |
| `em` + 2位数字 | `[em01]` | 经典表情（GIF） |
| `cc98` + 2位数字 | `[cc9814]` | CC98专属表情 |
| `a:` + 3位数字 | `[a:008]` | 另一种格式 |
| 任意2字母 + 2位数字 | `[tb01]`、`[ms01]` | 贴吧/雀魂等 |

**实现方案**：

1. **预制映射表**：为常用表情包手动编写 ASCII Art
   ```typescript
   const EMOTICON_MAP: Record<string, string> = {
     "ac01": "  ╭───╮\n  │◠‿◠│\n  ╰───╯",
     "ac06": "  ╭───╮\n  │╥⌂╥│\n  ╰───╯",
     // ...
   };
   ```

2. **优先级**：先覆盖最常用的 10-20 个表情包

3. **回退策略**：没有映射的表情包保持 `[acXX]` 文字显示

**工作量**：约 50 行代码 + 映射表（需手动制作）

**参考资料**：
- CC98-Desktop 表情包资源：`Assets/Emoji/`
- 表情包规则：`Controls/UbbTextBlock/Common/EmojiRule.cs`
