# Yazi 参考文档

> 项目地址: https://github.com/sxyazi/yazi
> 本文件记录 Yazi 的架构和设计，供 CC98-CLI TUI 开发参考。

## 项目概览

- **技术栈**: Rust / ratatui / Lua 插件
- **定位**: 终端文件管理器，高性能、可扩展
- **特点**: 全异步 I/O、组件化架构、层级渲染、声明式快捷键

## 核心设计

### 1. 组件层级系统

Yazi 使用分层渲染架构，组件按优先级从低到高渲染：

```
Layer::Mgr      (最底层)  主管理器
Layer::Tasks              任务面板
Layer::Spot               聚焦面板
Layer::Pick               选择器
Layer::Input              输入框
Layer::Confirm            确认框
Layer::Help               帮助面板
Layer::Cmp                补全面板
Layer::Which    (最顶层)  快捷键提示
```

**渲染顺序**：
```rust
fn render(self, area: Rect, buf: &mut Buffer) {
    // 1. 主管理器（底层）
    mgr::Preview::new(self.core).render(area, buf);
    mgr::Modal::new(self.core).render(area, buf);

    // 2. 任务面板
    if self.core.tasks.visible {
        tasks::Tasks::new(self.core).render(area, buf);
    }

    // 3. 聚焦面板
    if self.core.active().spot.visible() {
        spot::Spot::new(self.core).render(area, buf);
    }

    // ... 其他组件 ...

    // 9. 快捷键提示（最顶层）
    if self.core.which.active {
        which::Which::new(self.core).render(area, buf);
    }
}
```

**层优先级判断**：
```rust
pub fn layer(&self) -> Layer {
    if self.which.active {
        Layer::Which        // 最高优先级
    } else if self.cmp.visible {
        Layer::Cmp
    } else if self.help.visible {
        Layer::Help
    } else if self.confirm.visible {
        Layer::Confirm
    } else if self.input.visible {
        Layer::Input
    } else if self.pick.visible {
        Layer::Pick
    } else if self.active().spot.visible() {
        Layer::Spot
    } else if self.tasks.visible {
        Layer::Tasks
    } else {
        Layer::Mgr          // 最低优先级
    }
}
```

### 2. 状态管理

**核心状态结构**：
```rust
pub struct Core {
    pub mgr:     Mgr,      // 主管理器
    pub tasks:   Tasks,    // 任务面板
    pub pick:    Pick,     // 选择器
    pub input:   Input,    // 输入框
    pub confirm: Confirm,  // 确认框
    pub help:    Help,     // 帮助面板
    pub cmp:     Cmp,      // 补全面板
    pub which:   Which,    // 快捷键提示
    pub notify:  Notify,   // 通知
}
```

**可见性控制**：每个组件都有 `visible` 属性
```rust
pub struct Tasks {
    pub visible: bool,
    // ...
}

pub struct Input {
    pub visible: bool,
    // ...
}
```

### 3. 快捷键系统

**配置格式** (TOML)：
```toml
[mgr]
keymap = [
    { on = "j", run = "arrow next", desc = "Next file" },
    { on = "k", run = "arrow prev", desc = "Previous file" },
    { on = ["g", "g"], run = "arrow top", desc = "Go to top" },
    { on = "l", run = "enter", desc = "Enter the child directory" },
    { on = "h", run = "leave", desc = "Back to the parent directory" },
]

[input]
keymap = [
    { on = "<C-c>", run = "close", desc = "Cancel input" },
    { on = "<Enter>", run = "close --submit", desc = "Submit input" },
    { on = "<Esc>", run = "escape", desc = "Back to normal mode" },
]
```

**快捷键结构**：
```rust
pub struct Chord {
    pub on:    Vec<Key>,      // 触发按键
    pub run:   Vec<Action>,   // 执行动作
    pub desc:  String,        // 描述
    pub r#for: Platform,      // 平台限制
}
```

**按层级组织**：
```rust
pub struct Keymap {
    pub mgr:     KeymapRules<{ Layer::Mgr as u8 }>,
    pub tasks:   KeymapRules<{ Layer::Tasks as u8 }>,
    pub spot:    KeymapRules<{ Layer::Spot as u8 }>,
    pub pick:    KeymapRules<{ Layer::Pick as u8 }>,
    pub input:   KeymapRules<{ Layer::Input as u8 }>,
    pub confirm: KeymapRules<{ Layer::Confirm as u8 }>,
    pub help:    KeymapRules<{ Layer::Help as u8 }>,
    pub cmp:     KeymapRules<{ Layer::Cmp as u8 }>,
}
```

### 4. 事件系统

**事件循环**：
```rust
pub(crate) async fn serve() -> Result<()> {
    let mut app = Self::make(term)?;
    app.bootstrap()?;

    let mut rx = Event::take();
    loop {
        if let Some(t) = app.next_render.take() {
            select! {
                _ = sleep(t) => {
                    app.render(app.need_render == 2)?;
                }
                r = app.drain(&mut rx) => if !r? {
                    break;
                }
            }
        } else if !app.drain(&mut rx).await? {
            break;
        }
    }
    Ok(())
}
```

**事件分发**：
```rust
fn dispatch(&mut self, event: Event) -> Result<()> {
    Dispatcher::new(self).dispatch(event);

    self.need_render = NEED_RENDER.load(Ordering::Relaxed);
    if self.need_render == 0 {
        return Ok(());
    }

    self.next_render = Duration::from_millis(10).checked_sub(self.last_render.elapsed());
    if self.next_render.is_none() {
        self.render(self.need_render == 2)?;
    }

    Ok(())
}
```

### 5. 渲染优化

**增量渲染**：
```rust
pub(crate) fn render(&mut self, partial: bool) -> Result<Data> {
    if partial {
        return self.render_partially();
    }

    // 全量渲染
    let frame = term.draw(|f| {
        f.render_widget(Root::new(&self.core), f.area());
    })?;

    // 碰撞检测
    if COLLISION.load(Ordering::Relaxed) {
        Self::patch(frame);
    }

    succ!();
}
```

**差异检测**：
```rust
fn patch(frame: CompletedFrame) {
    let mut new = Buffer::empty(frame.area);
    for y in new.area.top()..new.area.bottom() {
        for x in new.area.left()..new.area.right() {
            let cell = &frame.buffer[(x, y)];
            if cell.skip {
                new[(x, y)] = cell.clone();
            }
            new[(x, y)].set_skip(!cell.skip);
        }
    }

    let patches = frame.buffer.diff(&new);
    RatermBackend::new(&mut *TTY.lockout()).draw(patches.into_iter()).ok();
}
```

## 布局系统

**布局配置**：
```rust
pub struct Layout {
    pub current:  Rect,   // 当前面板
    pub preview:  Rect,   // 预览面板
    pub progress: Rect,   // 进度条
}
```

**响应式设计**：根据终端大小自动调整布局

## Which 组件（快捷键提示）

**设计特点**：
- 显示在底部
- 多列布局（1-3 列）
- 支持自定义样式
- 自动计算高度

```rust
impl Widget for Which<'_> {
    fn render(self, area: Rect, buf: &mut Buffer) {
        let which = &self.core.which;
        if which.silent {
            return;
        }

        let cols = THEME.which.cols.get() as usize;
        let height = area.height.min(which.cands.len().div_ceil(cols) as u16 + PADDING_Y * 2);
        let area = Rect {
            x: PADDING_X.min(area.width),
            y: area.height.saturating_sub(height + PADDING_Y * 2),
            width: area.width.saturating_sub(PADDING_X * 2),
            height,
        };

        // 多列布局
        let chunks = layout::Layout::horizontal(match cols {
            1 => &[Ratio(1, 1)][..],
            2 => &[Ratio(1, 2), Ratio(1, 2)],
            _ => &[Ratio(1, 3), Ratio(1, 3), Ratio(1, 3)],
        }).split(area);

        // 渲染候选键
        for y in 0..area.height {
            for (x, chunk) in chunks.iter().enumerate() {
                let Some(cand) = which.cands.get(y as usize * cols + x) else {
                    break;
                };
                Cand::new(cand, which.times).render(Rect { y: chunk.y + y + 1, height: 1, ..*chunk }, buf);
            }
        }
    }
}
```

## 对比 CC98-CLI TUI

| 方面 | Yazi | CC98-CLI TUI |
|------|------|--------------|
| 组件化 | ✅ 完全组件化 | ⚠️ 部分组件化 |
| 层级系统 | ✅ 9 层 | ⚠️ 2 层 |
| 状态管理 | ✅ 分离状态 | ⚠️ 单一状态 |
| 快捷键配置 | ✅ TOML 声明式 | ⚠️ 代码硬编码 |
| 渲染优化 | ✅ 增量渲染 | ❌ 全量重绘 |
| 事件系统 | ✅ 异步事件循环 | ⚠️ 同步处理 |

## 借鉴建议

### 1. 组件层级系统（已借鉴）

```typescript
// CC98-CLI TUI 层级
type Layer =
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
```

### 2. 声明式快捷键（已借鉴）

```typescript
// CC98-CLI TUI 快捷键配置
interface KeyBinding {
  key: string;           // 触发按键
  action: string;        // 动作名称
  desc: string;          // 描述
  mode: KeyMode;         // 模式
  params?: Record<string, string>;  // 参数
}

// 按模式组织
type Keymap = Record<KeyMode, KeyBinding[]>;
```

### 3. 可见性控制（已借鉴）

```typescript
// 每个组件都有 visible 属性
interface Component {
  visible: boolean;
  render(state: TuiState, width: number, height: number): string | string[];
}
```

### 4. 动作系统（已借鉴）

```typescript
// 动作定义
interface ActionDef {
  name: string;          // 动作名称
  fn: ActionFn;          // 动作函数
  desc: string;          // 描述
}

// 动作注册
registerAction({
  name: "arrow",
  fn: (state, params) => {
    const direction = params?.direction || "next";
    // ...
  },
  desc: "移动光标"
});
```

## 设计原则

1. **组件独立**: 每个组件都是独立的模块，可以独立渲染和管理状态
2. **层级清晰**: 组件按层级渲染，后渲染的覆盖先渲染的
3. **可见性控制**: 每个组件都有 `visible` 属性控制是否显示
4. **声明式配置**: 快捷键使用配置文件，易于修改
5. **动作分离**: 动作和快捷键分离，便于复用和组合

## 参考资料

- [Yazi 官方文档](https://yazi-rs.github.io/docs)
- [Yazi 源码](https://github.com/sxyazi/yazi)
- [ratatui 文档](https://ratatui.rs)
