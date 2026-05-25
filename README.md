# CC98 CLI

CC98 的命令行客户端，包含 CLI 和 TUI。

- 直接运行 `cc98`：进入终端界面。
- 带参数运行 `cc98 <command>`：执行 CLI，默认输出 JSON。
- 当前主要面向读取场景，TUI 会尽量按需加载和缓存，减少请求。

## 安装

需要 Node.js 20+。

```bash
npm install -g cc98-cli
```

## 登录

```bash
cc98 login
```

多账号：

```bash
cc98 account list
cc98 account use <name>
cc98 --account <name> me
```

## TUI

```bash
cc98
```

常用按键：

```text
j/k 或 ↑/↓        移动
h/l 或 ←/→        左右切换
Enter             打开选中项
Esc/Backspace     返回上一级
n 或 Space        加载下一页
r                 刷新
q                 退出
```

## CLI

CLI 默认输出 JSON，适合配合 `jq` 或脚本使用。

```bash
cc98 me
cc98 topic <topic-id>
cc98 board <board-id>
cc98 search <keyword>
cc98 message recent
```

查看完整命令：

```bash
cc98 --help
cc98 topic --help
cc98 user --help
```

## 本地数据

登录信息和缓存保存在：

```text
~/.cc98-cli/
```

## 开发

```bash
npm install
npm run check
npm run build
node dist/main.js
```

## License

MIT
