# CC98-CLI 文档

本目录只同步公开维护文档。参考项目摘录、临时产品分析、发布操作草稿等内容保留在本地，不进入仓库。

## 内容

- [架构设计](architecture.md)
- [API 参考](api.md)
- [API 对比](api-comparison.md)
- [TUI vs CLI 功能对比](tui-cli-comparison.md)
- [开发路线图](ROADMAP.md)
- [项目进度](PROGRESS.md)
- [缓存策略 ADR](decisions/001-cache-strategy.md)

## 当前 TUI 结构

TUI 已从早期单文件实现拆分为：

- `app.ts`: 终端生命周期和依赖组装
- `controller.ts`: 按键处理、异步加载、写操作和导航副作用
- `renderer.ts`: 三栏布局、模态框和组件组合
- `components/`: Header、Overview、Sidebar、Content、StatusBar
- `state/`: `TuiState` 类型和初始状态
- `topic-reader.ts`: 帖子内容、楼层、UBB 行数据构建
- `helpers.ts`: API 响应归一化和通用数据转换

## 快速链接

- [主 README](../README.md)
- [Changelog](../CHANGELOG.md)
- [GitHub Repository](https://github.com/Lucent-Snow/CC98-CLI)
