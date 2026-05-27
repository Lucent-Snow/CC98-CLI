# Yazi 参考文档

> 项目地址: https://github.com/sxyazi/yazi
> 本文件记录 Yazi 的架构、设计哲学和产品打磨细节，供 CC98-CLI TUI 开发参考。

## 项目概览

- **技术栈**: Rust / ratatui / Lua 插件
- **定位**: 终端文件管理器，高性能、可扩展
- **特点**: 全异步 I/O、组件化架构、层级渲染、声明式快捷键

## 设计哲学

### 1. 渐进式披露 (Progressive Disclosure)

Yazi 遵循"先简后繁"原则，避免信息过载：

**快捷键提示 (Which)**：
- 初始状态不显示任何提示
- 按下前缀键后才显示候选快捷键
- 多列布局（1-3列）根据候选数量自动调整
- 底部遮罩背景突出提示内容

```rust
// Which 组件渲染逻辑
pub fn render(self, area: Rect, buf: &mut Buffer) {
    let which = &self.core.which;
    if which.silent { return; }  // 静默模式不渲染

    let cols = THEME.which.cols.get() as usize;
    let height = area.height.min(which.cands.len().div_ceil(cols) as u16 + PADDING_Y * 2);
    // 底部对齐，遮罩背景
    let area = Rect {
        y: area.height.saturating_sub(height + PADDING_Y * 2),
        // ...
    };
}
```

**帮助页面**：
- 按 `?` 打开完整快捷键列表
- 支持实时过滤（输入关键词筛选）
- 三列布局：按键 | 命令 | 描述
- 高亮当前选中行

### 2. 视觉一致性 (Visual Consistency)

**圆角边框**：所有弹窗组件使用 `BorderType::Rounded`

```rust
Block::bordered()
    .border_type(BorderType::Rounded)
    .border_style(THEME.confirm.border.get())
    .title(confirm.title.clone().style(THEME.confirm.title.get()))
    .title_alignment(Alignment::Center)
```

**统一的弹窗位置系统**：
```rust
pub enum Origin {
    TopLeft, TopCenter, TopRight,
    BottomLeft, BottomCenter, BottomRight,
    Center,
    Hovered,  // 相对于光标位置
}

pub struct Position {
    pub origin: Origin,
    pub offset: Offset,
}
```

**深色/浅色主题**：
- 自动检测终端模式
- 细粒度样式配置（每个组件独立主题）
- 文件类型图标系统（500+ 图标映射）

### 3. 即时反馈 (Immediate Feedback)

**输入框多模式**：
```rust
pub enum InputMode {
    Normal,   // 命令模式
    Insert,   // 插入模式（默认）
    Replace,  // 替换模式
}
```

**光标形状随模式变化**：
```rust
pub fn cursor_shape(&self) -> CursorStyle {
    match self.mode() {
        M::Normal if YAZI.input.cursor_blink => CursorStyle::BlinkingBlock,
        M::Normal if !YAZI.input.cursor_blink => CursorStyle::SteadyBlock,
        M::Insert if YAZI.input.cursor_blink => CursorStyle::BlinkingBar,
        M::Insert if !YAZI.input.cursor_blink => CursorStyle::SteadyBar,
        M::Replace if YAZI.input.cursor_blink => CursorStyle::BlinkingUnderline,
        M::Replace if !YAZI.input.cursor_blink => CursorStyle::SteadyUnderline,
    }
}
```

**通知动画**：
- 滑入效果（percent 字段控制位置）
- 自动消失（timeout 设置）
- 分级样式（Info/Warn/Error）

```rust
pub struct Message {
    pub title:   String,
    pub content: String,
    pub level:   MessageLevel,
    pub timeout: Duration,
    pub instant: Instant,
    pub percent: u8,  // 动画进度 0-100
}
```

### 4. 空间效率 (Space Efficiency)

**自适应布局**：
- 窄终端自动隐藏侧边栏
- 弹窗根据内容自动调整高度
- 列表内容超出时显示滚动条

**通知位置优化**：
```rust
pub fn available(area: Rect) -> Rect {
    let chunks = Layout::horizontal([Constraint::Fill(1), Constraint::Min(80)]).split(area);
    let chunks = Layout::vertical([Constraint::Fill(1), Constraint::Max(1)]).split(chunks[1]);
    chunks[0]  // 右下角显示
}
```

**进度条位置**：
```rust
pub struct Layout {
    pub current:  Rect,   // 当前面板
    pub preview:  Rect,   // 预览面板
    pub progress: Rect,   // 进度条（独立区域）
}
```

### 5. 键盘优先 (Keyboard-First)

**Vim 风格快捷键**：
```toml
[mgr]
keymap = [
    { on = "j", run = "arrow next", desc = "Next file" },
    { on = "k", run = "arrow prev", desc = "Previous file" },
    { on = ["g", "g"], run = "arrow top", desc = "Go to top" },
    { on = "l", run = "enter", desc = "Enter the child directory" },
    { on = "h", run = "leave", desc = "Back to the parent directory" },
]
```

**多键序列支持**：
```rust
// Which 组件处理多键序列
pub fn r#type(&mut self, key: Key) -> bool {
    self.cands.retain(|c| c.on.len() > self.times && c.on[self.times] == key);
    self.times += 1;

    if self.cands.is_empty() {
        self.dismiss(None);
    } else if self.cands.len() == 1 {
        let chord = self.cands.remove(0);
        self.dismiss(Some(chord));
    }
    // ...
}
```

**输入框快捷键**（类似 Emacs）：
```toml
[input]
keymap = [
    { on = "<C-c>", run = "close", desc = "Cancel input" },
    { on = "<Enter>", run = "close --submit", desc = "Submit input" },
    { on = "<Esc>", run = "escape", desc = "Back to normal mode" },
    { on = "<C-a>", run = "move first", desc = "Move to start" },
    { on = "<C-e>", run = "move eol", desc = "Move to end" },
    { on = "<C-k>", run = "kill eol", desc = "Kill to end" },
]
```

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

## 产品打磨细节

### 1. 通知系统

**设计要点**：
- 右下角显示，不遮挡主要内容
- 滑入动画（percent 控制）
- 自动消失（timeout 设置）
- 最多显示 3 条
- 分级样式（Info/Warn/Error）

```rust
pub struct Message {
    pub title:   String,
    pub content: String,
    pub level:   MessageLevel,
    pub timeout: Duration,
    pub instant: Instant,
    pub percent: u8,  // 0-100，控制滑入动画
}

impl MessageLevel {
    pub fn icon(self) -> Arc<String> {
        match self {
            Self::Info => THEME.notify.icon_info.load_full(),
            Self::Warn => THEME.notify.icon_warn.load_full(),
            Self::Error => THEME.notify.icon_error.load_full(),
        }
    }
}
```

**主题配置**：
```toml
[notify]
title_info  = { fg = "green" }
title_warn  = { fg = "yellow" }
title_error = { fg = "red" }
icon_info   = ""
icon_warn   = ""
icon_error  = ""
```

### 2. 输入框系统

**多模式支持**：
- **Insert 模式**（默认）：光标为竖线，可输入文本
- **Normal 模式**：光标为方块，可执行命令
- **Replace 模式**：光标为下划线，替换文本

**光标形状变化**：
```rust
pub fn cursor_shape(&self) -> CursorStyle {
    match self.mode() {
        M::Normal if YAZI.input.cursor_blink => CursorStyle::BlinkingBlock,
        M::Normal if !YAZI.input.cursor_blink => CursorStyle::SteadyBlock,
        M::Insert if YAZI.input.cursor_blink => CursorStyle::BlinkingBar,
        M::Insert if !YAZI.input.cursor_blink => CursorStyle::SteadyBar,
        M::Replace if YAZI.input.cursor_blink => CursorStyle::BlinkingUnderline,
        M::Replace if !YAZI.input.cursor_blink => CursorStyle::SteadyUnderline,
    }
}
```

**高级功能**：
- 文本选择（选区高亮）
- 剪贴板集成（yank/paste）
- 密码遮蔽（obscure 模式）
- 实时输入事件（realtime 模式）
- 自动补全触发（completion 模式）

```rust
pub struct Input {
    pub snaps:      InputSnaps,    // 快照历史（支持撤销）
    pub limit:      usize,         // 显示宽度限制
    pub obscure:    bool,          // 密码遮蔽
    pub realtime:   bool,          // 实时输入事件
    pub completion: bool,          // 自动补全
}
```

### 3. 帮助系统

**设计要点**：
- 按 `?` 打开
- 三列布局：按键(20%) | 命令(30%) | 描述(50%)
- 实时过滤（输入关键词筛选）
- 高亮当前行
- 按层级显示快捷键

```rust
impl Help {
    pub fn filter_apply(&mut self) {
        let kw = self.in_filter.as_ref().map_or("", |i| i.value());

        if kw.is_empty() {
            self.keyword = String::new();
            self.bindings = KEYMAP.get(self.layer).iter().collect();
        } else if self.keyword != kw {
            self.keyword = kw.to_owned();
            self.bindings = KEYMAP.get(self.layer).iter().filter(|&c| c.contains(kw)).collect();
        }
    }
}
```

**主题配置**：
```toml
[help]
on      = { fg = "cyan" }      # 按键样式
run     = { fg = "magenta" }   # 命令样式
desc    = {}                    # 描述样式
hovered = { reversed = true, bold = true }  # 当前行高亮
footer  = { fg = "black", bg = "white" }    # 过滤输入框样式
```

### 4. 确认对话框

**设计要点**：
- 圆角边框
- 标题居中
- 内容区域支持滚动
- 按钮样式区分（Yes 高亮，No 普通）

```rust
pub(crate) struct Buttons;

impl Widget for Buttons {
    fn render(self, area: Rect, buf: &mut Buffer) {
        let chunks = Layout::horizontal([Constraint::Fill(1), Constraint::Fill(1)]).split(area);
        let labels = THEME.confirm.btn_labels.load();

        Paragraph::new(Span::raw(&labels[0]).style(THEME.confirm.btn_yes.get()))
            .centered()
            .render(chunks[0], buf);
        Paragraph::new(Span::raw(&labels[1]).style(THEME.confirm.btn_no.get()))
            .centered()
            .render(chunks[1], buf);
    }
}
```

**主题配置**：
```toml
[confirm]
border     = { fg = "blue" }
title      = { fg = "blue" }
body       = {}
list       = {}
btn_yes    = { reversed = true }
btn_no     = {}
btn_labels = [ "  [Y]es  ", "  (N)o  " ]
```

### 5. Which 快捷键提示

**设计要点**：
- 底部弹出
- 多列布局（1-3列）
- 遮罩背景
- 渐进式按键匹配

```rust
pub fn r#type(&mut self, key: Key) -> bool {
    // 过滤不匹配的候选
    self.cands.retain(|c| c.on.len() > self.times && c.on[self.times] == key);
    self.times += 1;

    // 处理结果
    if self.cands.is_empty() {
        self.dismiss(None);  // 无匹配，关闭
    } else if self.cands.len() == 1 {
        let chord = self.cands.remove(0);
        self.dismiss(Some(chord));  // 唯一匹配，执行
    } else if let Some(i) = self.cands.iter().position(|c| c.on.len() == self.times) {
        let chord = self.cands.remove(i);
        self.dismiss(Some(chord));  // 完全匹配，执行
    }
    // 继续等待输入
}
```

**主题配置**：
```toml
[which]
cols            = 3
mask            = { bg = "black" }
cand            = { fg = "lightcyan" }
rest            = { fg = "darkgray" }
desc            = { fg = "lightmagenta" }
separator       = "  "
separator_style = { fg = "darkgray" }
```

### 6. 文件类型图标

**设计要点**：
- 500+ 文件扩展名图标
- 目录特殊图标
- 条件图标（orphan、link、exec 等）
- 自定义图标覆盖

```toml
[icon]
globs = []
dirs  = [
    { name = ".git", text = "", fg = "#00bcd4" },
    { name = ".github", text = "", fg = "#03a9f4" },
    # ...
]
files = [
    { name = ".gitignore", text = "", fg = "#f54d27" },
    { name = "Makefile", text = "", fg = "#6d8086" },
    # ...
]
exts = [
    { name = "rs", text = "", fg = "#dea584" },
    { name = "ts", text = "", fg = "#519aba" },
    # ...
]
conds = [
    { if = "orphan", text = "", fg = "#ffffff" },
    { if = "link", text = "", fg = "#9e9e9e" },
    { if = "exec", text = "", fg = "#8bc34a" },
    # ...
]
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

## 对比 CC98-CLI TUI

| 方面 | Yazi | CC98-CLI TUI | 差距分析 |
|------|------|--------------|----------|
| 组件化 | ✅ 完全组件化 | ⚠️ 部分组件化 | 需要拆分更多独立组件 |
| 层级系统 | ✅ 9 层 | ⚠️ 2 层 | 需要增加弹窗层级 |
| 状态管理 | ✅ 分离状态 | ⚠️ 单一状态 | 需要分离各组件状态 |
| 快捷键配置 | ✅ TOML 声明式 | ⚠️ 代码硬编码 | 需要配置化 |
| 渲染优化 | ✅ 增量渲染 | ❌ 全量重绘 | 需要实现增量渲染 |
| 事件系统 | ✅ 异步事件循环 | ⚠️ 同步处理 | 需要异步化 |
| 通知系统 | ✅ 动画+分级 | ❌ 无 | 需要实现 |
| 输入框模式 | ✅ 3种模式 | ❌ 无 | 需要实现 |
| 帮助过滤 | ✅ 实时过滤 | ❌ 无 | 需要实现 |
| 主题系统 | ✅ 深色/浅色 | ❌ 无 | 需要实现 |

## 借鉴建议

### 高优先级

1. **通知系统**
   - 右下角显示
   - 分级样式（Info/Warn/Error）
   - 自动消失

2. **帮助页面**
   - 三列布局
   - 实时过滤
   - 高亮当前行

3. **输入框模式**
   - Insert/Normal 模式
   - 光标形状变化

### 中优先级

4. **Which 快捷键提示**
   - 底部弹出
   - 多列布局
   - 渐进式匹配

5. **确认对话框**
   - 圆角边框
   - 按钮样式区分

6. **主题系统**
   - 深色/浅色模式
   - 细粒度样式配置

### 低优先级

7. **渲染优化**
   - 增量渲染
   - 差异检测

8. **文件图标**
   - 文件类型图标
   - 自定义图标

## 参考资料

- [Yazi 官方文档](https://yazi-rs.github.io/docs)
- [Yazi 源码](https://github.com/sxyazi/yazi)
- [ratatui 文档](https://ratatui.rs)
