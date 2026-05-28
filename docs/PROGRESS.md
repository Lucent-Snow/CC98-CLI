# CC98-CLI 项目进度

> 更新时间：2026-05-28

## 总览

| 方向 | 进度 | 状态 |
|------|------|------|
| 方向一：CLI 能力补全 | 85% | ✅ 核心完成 |
| 方向二：TUI 功能接入 | 75% | ✅ 核心完成，P2 待做 |
| 方向三：产品打磨 | 30% | 🔄 内容渲染完成，体验继续打磨 |
| WebVPN 支持 | ✅ | 非校园网访问已实现 |

---

## 方向一：CLI 能力补全

**目标**：实现所有 CC98 API 的读写能力

### 读取功能

| 功能 | 状态 | 说明 |
|------|------|------|
| `me` | ✅ | 当前用户信息 |
| `forum index` | ✅ | 首页配置 |
| `forum boards` | ✅ | 所有版面 |
| `board <id>` | ✅ | 版面帖子 |
| `topic <id>` | ✅ | 帖子详情 |
| `user profile <id>` | ✅ | 用户资料 |
| `user search <name>` | ✅ | 搜索用户 |
| `user followers/followees` | ✅ | 粉丝/关注列表 |
| `user moment` | ✅ | 关注动态 |
| `user favorite-updates` | ✅ | 收藏更新 |
| `user favorite-groups` | ✅ | 收藏夹列表 |
| `user unread` | ✅ | 未读消息数 |
| `user browse-history` | ✅ | 浏览历史 |
| `message unread` | ✅ | 未读消息数 |
| `message recent` | ✅ | 最近联系人 |
| `message history <userId>` | ✅ | 私信历史 |
| `notice system/at/reply` | ✅ | 通知列表 |
| `search <keyword>` | ✅ | 搜索帖子 |
| `topic new` | ✅ | 最新帖子 |
| `topic random` | ✅ | 随机帖子 |
| `topic recent` | ✅ | 最近帖子 |
| `topic favorite` | ✅ | 收藏帖子列表 |
| `topic is-favorite` | ✅ | 是否收藏 |
| `topic vote` | ✅ | 投票信息 |
| `post reaction-state` | ✅ | 点赞状态 |
| `post rate-reasons` | ✅ | 评分原因 |

**读取完成率：26/26 = 100%** ✅

### 写入功能

| 功能 | 状态 | 测试 |
|------|------|------|
| `me signin` - 签到 | ✅ | ✅ 通过 |
| `message send` - 发私信 | ✅ | ✅ 通过 |
| `topic favorite add/remove` - 收藏帖子 | ✅ | ✅ 通过 |
| `board favorite add/remove` - 收藏版面 | ✅ | ✅ 通过 |
| `user follow/unfollow` - 关注/取消关注 | ✅ | ✅ 通过 |
| `topic create` - 发帖 | ✅ | ⚠️ 不测试 |
| `topic reply` - 回帖 | ✅ | ⚠️ 不测试 |
| `post like/dislike` - 点赞/踩 | ✅ | ⚠️ 不测试 |
| `post rate` - 评分 | ❌ | 暂不实现 |
| `post edit` - 编辑帖子 | ❌ | 暂不实现 |

**写入完成率：8/10 = 80%**（2 项暂不实现）

---

## 方向二：TUI 功能接入

**目标**：将 CLI 功能合理接入 TUI

### P0 核心功能

| 功能 | 状态 | 快捷键 |
|------|------|--------|
| 搜索帖子/用户 | ✅ | `/` |
| 用户详情页 | ✅ | `u` |
| 签到 | ✅ | "我的"页面 |
| 收藏帖子 | ✅ | `s` |
| 关注用户 | ✅ | `f` |

**P0 完成率：5/5 = 100%** ✅

### P1 消息增强

| 功能 | 状态 | 说明 |
|------|------|------|
| 通知列表（系统/@/回复） | ✅ | 通知视图入口 |
| 发私信 | ✅ | 用户详情按 `m` |
| 点赞/踩 | ✅ | 帖子详情按 `l/d` |
| 收藏版面 | ❌ | 版面列表按 `s` |

**P1 完成率：3/4 = 75%**

### P2 高级功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 发帖/回帖 | ❌ | 需要文本编辑器 |
| 浏览历史 | ✅ | "我的"/"更多"入口 |
| 收藏夹分组 | ✅ | 收藏/"更多"入口 |

**P2 完成率：2/3 = 67%**

### TUI 整体进度

**总完成率：10/12 = 83%**

---

## 方向三：产品打磨

**目标**：优化交互体验

### 内容渲染

| 功能 | 状态 | 说明 |
|------|------|------|
| UBB 标签渲染 | ✅ | 支持 [b] [i] [u] [del] [color] [quote] [code] [url] |
| 图片打开 | ✅ | 按 o 下载+缓存+系统查看器打开 |
| 链接复制 | ✅ | 按 c 复制链接到剪贴板 |
| 表情包 | ⚠️ | 短期保持文字占位，长期计划预制 ASCII Art |

### WebVPN 支持

| 功能 | 状态 | 说明 |
|------|------|------|
| WebVPN 登录 | ✅ | 支持 CSRF token、确认登录 |
| URL 转换 | ✅ | AES-CFB 加密，与 CC98-Desktop 兼容 |
| 网络检查 | ✅ | 自动检测是否在校园网内 |
| API 请求 | ✅ | 通过 WebVPN 访问 CC98 API |

### 按键设计

| 功能 | 状态 | 说明 |
|------|------|------|
| 完整的 Vim 键位支持 | ⚠️ | 主流程已实现 |
| 快捷键自定义 | ❌ | 未开始 |
| 帮助文档完善 | ⚠️ | 基础完成 |

### 设置系统

| 功能 | 状态 | 说明 |
|------|------|------|
| 主题切换 | ❌ | 未开始 |
| 缓存策略配置 | ❌ | 未开始 |
| 通知设置 | ❌ | 未开始 |

### 体验优化

| 功能 | 状态 | 说明 |
|------|------|------|
| 加载状态优化 | ✅ | 控制器集中处理 loading/loadingMore |
| 错误处理完善 | ⚠️ | 基础完成 |
| 边界情况处理 | ⚠️ | Abort 和退出渲染已处理 |

**产品打磨完成率：~20%**

---

## 下一步建议

### 短期（1-2 天）

1. **TUI P1 完善**
   - 版面列表按 `s` 收藏版面
   - 消息视图可考虑合并私信/通知标签页

### 中期（3-5 天）

1. **产品打磨**
   - 帮助文档完善
   - 错误态和空态统一
   - 状态栏信息进一步压缩

2. **TUI P2 实现**
   - 发帖/回帖（需要文本编辑器）

### 长期（1 周+）

1. **产品打磨**
   - 主题切换系统
   - 快捷键自定义
   - 设置系统完善

---

## 文件清单

### 核心代码

```
src/
├── main.ts              # 入口
├── api/
│   ├── client.ts        # API 客户端（读写）
│   ├── endpoints.ts     # 端点定义
│   └── types.ts         # 类型定义
├── cli/
│   ├── router.ts        # 命令路由
│   └── commands/        # CLI 命令（全部完成）
├── tui/
│   ├── app.ts           # TUI 入口和终端生命周期
│   ├── cached-client.ts # 缓存客户端
│   ├── controller.ts    # 按键、导航、API 副作用
│   ├── renderer.ts      # 布局和模态框渲染
│   ├── components/      # TUI 组件
│   ├── state/           # TUI 状态类型和初始化
│   ├── navigation.ts    # 导航项和设置项
│   ├── helpers.ts       # 响应归一化
│   ├── topic-reader.ts  # 帖子楼层和 UBB 行索引
│   └── ...
└── storage/
    ├── token-store.ts   # Token 存储
    └── cache-store.ts   # 缓存存储
```

### 文档

```
docs/
├── README.md            # 文档入口
├── ROADMAP.md           # 开发路线图
├── PROGRESS.md          # 项目进度（本文件）
├── architecture.md      # 架构设计
├── api.md               # API 参考
├── api-comparison.md    # API 对比
├── tui-cli-comparison.md # TUI vs CLI 对比
├── reference-cc98-desktop.md # 参考项目
└── decisions/
    └── 001-cache-strategy.md # 缓存策略 ADR
```
