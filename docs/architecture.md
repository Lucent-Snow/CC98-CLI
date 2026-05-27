# 架构设计

## 整体架构

CC98-CLI 采用分层架构，各层职责清晰，依赖方向严格控制。

```
┌─────────────┐     ┌─────────────┐
│     CLI     │     │     TUI     │
└──────┬──────┘     └──────┬──────┘
       │                   │
       └─────────┬─────────┘
                 │
          ┌──────┴──────┐
          │   Storage   │
          └──────┬──────┘
                 │
          ┌──────┴──────┐
          │     API     │
          └─────────────┘
```

## 模块边界

### api/
- **职责**: CC98 HTTP 客户端，OAuth2 认证，token 自动刷新
- **依赖**: 无（纯 HTTP 客户端）
- **被依赖**: cli/, tui/

### storage/
- **职责**: 本地持久化（token 多账号、LRU 缓存）
- **依赖**: 无（纯文件操作）
- **被依赖**: cli/, tui/

### cli/
- **职责**: CLI 命令实现，JSON 输出
- **依赖**: api/, storage/
- **被依赖**: main.ts

### tui/
- **职责**: 终端 UI，状态机，渲染
- **依赖**: api/（通过 cached-client）, storage/
- **被依赖**: main.ts
- **内部结构**:
  - `app.ts`: 终端生命周期、依赖组装、退出清理
  - `controller.ts`: 键盘事件、视图加载、导航、搜索、写操作副作用
  - `renderer.ts`: 三栏布局、模态框、组件组合
  - `components/`: Header、Overview、Sidebar、Content、StatusBar
  - `state/`: TUI 状态类型、初始状态、默认状态文案
  - `navigation.ts`: 左栏导航和设置项配置
  - `topic-reader.ts`: 帖子正文、楼层索引、UBB 行数据构建
  - `helpers.ts`: API 响应归一化和列表项转换

### 禁止的依赖
- cli/ ←→ tui/（两者是平行的消费者，不能互相引用）

## 关键设计决策

### 1. Token 存储（多账号）
- 文件: `~/.cc98-cli/tokens.json`
- 支持多账号，通过 `--account` 或 `CC98_ACCOUNT` 环境变量切换
- 文件权限 0o600，仅 owner 可读写

### 2. 缓存策略
- 两级缓存: LRU 内存 + 文件持久化
- TTL 在 CachedCc98Client 中硬编码（topics 30s, boards 24h）
- 后台自动清理过期条目
- SHA-256 哈希文件名

### 3. Token 刷新
- 401 时自动尝试 refresh_token
- 并发去重：多个请求同时 401 只触发一次刷新
- 刷新失败则提示重新登录

### 4. TUI 状态机与控制器
- 状态集中在 `TuiState`，由 `state/store.ts` 创建初始状态
- 视图模式: `list`, `topic`, `settings`, `user-detail`
- 焦点管理: nav ↔ content
- 父列表快照支持返回导航
- 模态框系统: help, menu, search, user, info
- `TuiController` 持有 `client`, `tokenStore`, `render`, `AbortController` 等运行时上下文，负责所有会产生副作用的动作
- 渲染组件不直接发请求；数据加载和写操作不散落在组件里

### 5. UBB 渲染
- CC98 使用 UBB 代码（非 HTML）
- 自定义解析器: `ubb-renderer.ts`
- 支持: 图片、链接、引用、加粗、斜体等
- `topic-reader.ts` 在 UBB 渲染结果上建立楼层和行索引，供滚动、跳楼层、右栏信息使用

## API 端点

| 服务 | 基础 URL |
|------|----------|
| OAuth | `https://openid.cc98.org` |
| API | `https://api.cc98.org` |
| 卡片统计 | `https://card.cc98.org` |

## 数据存储

```
~/.cc98-cli/
├── tokens.json    # OAuth token（多账号）
└── cache/         # 文件缓存
    └── *.json     # SHA-256 哈希文件名
```

遵循 XDG 规范：如设置 `XDG_CONFIG_HOME`，则使用 `$XDG_CONFIG_HOME/cc98-cli/`
