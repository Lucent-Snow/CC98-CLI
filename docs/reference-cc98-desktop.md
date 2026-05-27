# CC98-Desktop 参考文档

> 项目地址: https://github.com/Ginsenvey/CC98-Desktop
> 本文件记录 CC98-Desktop 的架构和关键实现，供 CC98-CLI 开发参考。

## 项目概览

- **技术栈**: C# / WinUI3 / XAML / Windows App SDK
- **平台**: Windows 10/11 (x64, ARM64)
- **定位**: 桌面端论坛客户端，Fluent Design UI，触控友好

## 目录结构

```
CC98-Desktop/
├── Core/                   # 核心逻辑
│   ├── Authorize.cs        # 认证
│   ├── Endpoints.cs        # API 端点定义
│   ├── Kernel.cs           # 核心初始化
│   ├── OpenID.cs           # OAuth2 认证流程
│   ├── UserEx.cs           # 用户扩展方法
│   ├── UserExperience.cs   # 用户体验相关
│   └── Network/            # 网络层
│       ├── Coordinator.cs  # 请求协调器
│       ├── Http.cs         # HTTP 客户端
│       ├── Network.cs      # 网络状态管理
│       └── Crypto.cs       # 加密工具
├── Services/               # 服务层
│   ├── IndexCacheService.cs    # 首页数据缓存
│   ├── SectionCacheService.cs  # 分区数据缓存
│   ├── LocalStorage.cs         # 本地存储
│   ├── PasswordManager.cs      # 凭据管理
│   ├── GlobalService.cs        # 全局服务
│   ├── AppLog.cs               # 日志系统
│   └── Converters.cs           # 数据转换器
├── Views/                  # 页面视图
│   ├── MainWindow.xaml     # 主窗口（导航框架）
│   ├── Index.xaml          # 首页（十大热帖）
│   ├── Board.xaml          # 版面
│   ├── Topic.xaml          # 帖子详情
│   ├── Post.xaml           # 发帖/回帖
│   ├── Search.xaml         # 搜索
│   ├── Chat.xaml           # 私信
│   ├── Profile.xaml        # 个人资料
│   ├── Setting.xaml        # 设置
│   ├── Favorite.xaml       # 收藏
│   ├── Follow.xaml         # 关注动态
│   ├── Focus.xaml          # 焦点版面
│   ├── Discover.xaml       # 发现
│   ├── Section.xaml        # 分区
│   ├── Message.xaml        # 消息
│   ├── NoticeMsg.xaml      # 通知
│   ├── MediaViewer.xaml    # 媒体查看器
│   └── Game.xaml           # 小游戏
├── Controls/               # 自定义控件
│   ├── UbbTextBlock/       # UBB 渲染器（核心）
│   │   ├── Tokenizer/      # 词法分析
│   │   ├── Parser/         # 语法分析
│   │   └── Common/         # 渲染上下文
│   ├── Picture/            # 图片控件
│   ├── VideoPlayer/        # 视频播放器
│   ├── MusicPlayer/        # 音乐播放器
│   ├── CodeBlock/          # 代码块
│   ├── LatexBlock/         # LaTeX 渲染
│   ├── SmartImage/         # 智能图片加载
│   └── InfoFlower/         # 信息气泡
├── Objects/                # 数据模型
│   ├── Objects.cs          # 业务对象
│   ├── Base.cs             # 基类
│   ├── Enums.cs            # 枚举定义
│   └── NavigationEvent.cs  # 导航事件
└── Assets/                 # 资源文件
```

## 关键实现参考

### 1. API 端点 (Core/Endpoints.cs)

端点定义方式值得参考：
```csharp
public static class Topic
{
    public static string TopicInfo(int topicId) => $"{Base}/topic/{topicId}";
    public static string ReplyList(int topicId, int start) => $"{Base}/Topic/{topicId}/post?from={start}&size=10";
    public static string SearchTopic(string key, int start) => $"{Base}/topic/search?keyword={key}&from={start}&size=20";
}
```

**CC98-CLI 对比**: 我们用 `endpoints.ts` 对象字面量，更简洁。CC98-Desktop 用静态类方法，类型安全但冗长。

### 2. 缓存策略 (Services/IndexCacheService.cs)

首页数据缓存设计：
- 单例模式 (`IndexDataService.Instance`)
- JSON 文件缓存到 `LocalCacheFolder`
- 支持分区查询：`GetTopicPartitionAsync("hotTopic")`
- 缓存有效期检查：`IsCacheValidAsync(TimeSpan maxAge)`
- 统计数据单独提取：`ForumStatistics`

**CC98-CLI 对比**: 我们用通用的 `CacheStore`（LRU + 文件），更灵活。CC98-Desktop 针对首页数据做了专门优化。

### 3. UBB 渲染器 (Controls/UbbTextBlock/)

完整的 UBB 解析管线：
```
UBB 源码 → Tokenizer → Parser → AST → RenderContext → XAML 输出
```

- **Tokenizer**: 词法分析，将 UBB 文本拆分为 Token
- **Parser**: 语法分析，构建 AST（TagNode, TextNode, LatexNode）
- **RenderContext**: 渲染上下文，控制样式和事件处理
- **EmojiRule**: 表情规则处理

**CC98-CLI 对比**: 我们的 `ubb-renderer.ts` 是简化版，输出纯文本。CC98-Desktop 的实现更完整，支持富文本渲染。

### 4. 页面架构 (Views/)

信息架构参考：
- **Index**: 首页（十大热帖 + 分区 + 统计）
- **Board**: 版面帖子列表
- **Topic**: 帖子详情 + 回复列表
- **Search**: 搜索面板
- **Chat**: 私信
- **Profile**: 个人资料
- **Favorite**: 收藏管理
- **Follow**: 关注动态
- **Setting**: 设置

**CC98-CLI 对比**: TUI 的导航项（十大、收藏、最新、版面、关注、消息、我的、设置）基本对应。

### 5. 认证流程 (Core/OpenID.cs)

OAuth2 流程：
- 使用 `PasswordVault` 存储凭据（Windows 安全存储）
- 支持 WebVPN 访问（外网环境）
- Token 刷新机制

**CC98-CLI 对比**: 我们用 JSON 文件存储 token，更简单但安全性较低。

## 可借鉴的设计

### 1. 首页数据分区

CC98-Desktop 将首页数据分为多个分区：
```csharp
public static class Partitions
{
    public const string HotTopic = "hotTopic";
    public const string SchoolEvent = "schoolEvent";
    public const string Academics = "academics";
    public const string Study = "study";
    public const string Emotion = "emotion";
    public const string FleaMarket = "fleaMarket";
    public const string FullTimeJob = "fullTimeJob";
    public const string PartTimeJob = "partTimeJob";
}
```

**建议**: TUI 首页可以参考这种分区展示。

### 2. 图片轮播查看

帖子中的图片支持轮播查看（类似微信）。

**建议**: TUI 可以实现图片列表 + 外部查看器打开。

### 3. 搜索面板

独立的搜索页面，支持关键词搜索。

**建议**: CLI 的 `search` 命令已经实现，TUI 可以添加搜索视图。

### 4. 信息气泡 (InfoFlower)

用户信息预览控件，悬停显示。

**建议**: TUI 可以在右栏显示用户信息摘要。

## API 端点对照表

| 功能 | CC98-Desktop | CC98-CLI |
|------|--------------|----------|
| 首页配置 | `Forum.Index()` | `endpoints.forum.index` |
| 所有版面 | `Forum.AllBoards()` | `endpoints.forum.allBoards` |
| 用户信息 | `User.UserProfile(isMe, userId)` | `endpoints.user.profile(userId)` |
| 帖子详情 | `Topic.TopicInfo(topicId)` | `endpoints.topic.info(topicId)` |
| 帖子回复 | `Topic.ReplyList(topicId, start)` | `endpoints.topic.posts(topicId, from, size)` |
| 搜索 | `Topic.SearchTopic(key, start)` | `endpoints.topic.search(keyword, from, size)` |
| 版面帖子 | `Board.TopicList(isBest, boardId, start)` | `endpoints.board.topics(boardId, from, size)` |
| 私信 | `User.ChatHistory(userId, start)` | `endpoints.user.chatHistory(userId, from, size)` |

## 差异总结

| 方面 | CC98-Desktop | CC98-CLI |
|------|--------------|----------|
| 技术栈 | C# / WinUI3 / XAML | TypeScript / Node.js |
| UI | Fluent Design GUI | 终端 TUI |
| 平台 | Windows only | 跨平台 |
| 缓存 | 针对首页专门优化 | 通用 LRU + 文件缓存 |
| UBB | 完整富文本渲染 | 简化纯文本渲染 |
| 认证 | PasswordVault (安全) | JSON 文件 (简单) |
| 代码量 | ~50k 行 | ~10k 行 |

## 设计灵感

1. **三栏布局**: CC98-Desktop 的 MainWindow 使用 NavigationView 侧边栏 + 内容区，TUI 的三栏布局（导航/内容/信息）是其终端版本
2. **分区展示**: 首页按主题分区（热帖、校园、学术等），TUI 可以参考
3. **图片处理**: 帖子内图片的展示方式（轮播、点击放大），TUI 可以用链接列表 + 外部打开
4. **缓存策略**: 首页数据缓存 5 分钟，版面数据实时刷新，这个策略值得参考
