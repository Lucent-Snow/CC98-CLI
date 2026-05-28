import { VpnStore } from "../../storage/vpn-store.js";
import { WebVpnService } from "../../api/webvpn.js";
import { promptText, promptPassword } from "../prompt.js";

export async function vpnCommand(args: string[]): Promise<void> {
  const [subCommand, ...rest] = args;

  if (!subCommand || subCommand === "--help" || subCommand === "-h") {
    printVpnHelp();
    return;
  }

  switch (subCommand) {
    case "login":
      await vpnLogin(rest);
      break;
    case "logout":
      await vpnLogout();
      break;
    case "status":
      await vpnStatus();
      break;
    case "test":
      await vpnTest();
      break;
    case "mode":
      await vpnMode(rest);
      break;
    default:
      throw new Error(`unknown vpn subcommand: ${subCommand}. Run "cc98 vpn --help" for usage.`);
  }
}

async function vpnLogin(args: string[]): Promise<void> {
  const store = new VpnStore();
  const config = await store.getConfig();

  // 获取用户名
  let username = args[0] || config.username;
  if (!username) {
    username = await promptText("浙大通行证用户名: ");
    if (!username) {
      console.error("用户名不能为空");
      return;
    }
  }

  // 获取密码
  let password = args[1];
  if (!password) {
    password = await promptPassword("浙大通行证密码: ");
    if (!password) {
      console.error("密码不能为空");
      return;
    }
  }

  console.log("正在登录 WebVPN...");

  const vpn = new WebVpnService();
  const result = await vpn.login(username, password);

  if (result.needConfirm) {
    console.log("需要确认登录（可能在其他设备已登录）");
    const confirm = await promptText("是否确认登录？(y/N): ");
    if (confirm.toLowerCase() === "y") {
      const confirmResult = await vpn.confirmLogin();
      if (confirmResult.success) {
        console.log("✅ WebVPN 登录成功");
        await store.saveSession(username, vpn.getCookies());
      } else {
        console.error("❌ 确认登录失败:", confirmResult.message);
        return;
      }
    } else {
      console.log("已取消登录");
      return;
    }
  } else if (result.success) {
    console.log("✅ WebVPN 登录成功");
    await store.saveSession(username, vpn.getCookies());
  } else {
    console.error("❌ WebVPN 登录失败:", result.message);
    return;
  }

  // 测试连接
  console.log("\n测试 WebVPN 连接...");
  vpn.enabled = true;
  const testResponse = await vpn.fetch("https://api.cc98.org/config/index");
  if (testResponse.ok) {
    console.log("✅ WebVPN 连接正常");
  } else {
    console.error("❌ WebVPN 连接失败:", testResponse.status);
  }
}

async function vpnLogout(): Promise<void> {
  const store = new VpnStore();
  const config = await store.getConfig();

  if (!config.username) {
    console.log("未配置 WebVPN");
    return;
  }

  const vpn = new WebVpnService();
  await vpn.logout();

  await store.clear();
  console.log("✅ 已清除 WebVPN 配置");
}

async function vpnStatus(): Promise<void> {
  const store = new VpnStore();
  const config = await store.getConfig();

  console.log("WebVPN 状态:");
  console.log(`  模式: ${config.mode}`);
  console.log(`  用户名: ${config.username || "未配置"}`);
  console.log(`  会话: ${config.cookies ? "已保存" : "未登录"}`);
  if (config.loggedInAt) {
    console.log(`  登录时间: ${config.loggedInAt}`);
  }

  if (config.username) {
    console.log("\n测试连接...");
    const vpn = new WebVpnService(config.cookies);
    const inCampus = await vpn.checkNetwork();
    console.log(`  校园网: ${inCampus ? "是" : "否"}`);

    if (!inCampus && config.mode !== "direct") {
      console.log("  提示: 不在校园网内，WebVPN 将自动启用");
    }
  }
}

async function vpnTest(): Promise<void> {
  console.log("测试 WebVPN 连接...\n");

  const vpn = new WebVpnService();

  // 1. 检测校园网
  console.log("1. 检测校园网...");
  const inCampus = await vpn.checkNetwork();
  console.log(`   结果: ${inCampus ? "在校园网内" : "不在校园网内"}`);

  if (inCampus) {
    console.log("\n当前在校园网内，无需使用 WebVPN");
    console.log("可以直接访问 CC98 API");
    return;
  }

  // 2. 测试 WebVPN 访问
  console.log("\n2. 测试 WebVPN 访问...");
  vpn.enabled = true;

  const store = new VpnStore();
  const config = await store.getConfig();

  if (config.username && config.cookies) {
    console.log(`   使用账号: ${config.username}`);
    vpn.loadCookies(config.cookies);
    const response = await vpn.fetch("https://api.cc98.org/config/index");
    console.log(`   API 访问: ${response.ok ? "成功" : `失败 ${response.status}`}`);
  } else if (config.username) {
    console.log(`   已配置账号: ${config.username}`);
    console.log("   未保存有效会话，请运行 'cc98 vpn login' 重新登录");
  } else {
    console.log("   未配置 WebVPN 账号");
    console.log("   请运行 'cc98 vpn login' 配置");
  }
}

async function vpnMode(args: string[]): Promise<void> {
  const store = new VpnStore();
  const mode = args[0];

  if (!mode) {
    const config = await store.getConfig();
    console.log(`当前模式: ${config.mode}`);
    console.log("\n可用模式:");
    console.log("  auto   - 自动检测校园网，非校园网自动使用 WebVPN");
    console.log("  vpn    - 强制使用 WebVPN");
    console.log("  direct - 强制直连（不使用 WebVPN）");
    console.log("\n用法: cc98 vpn mode <mode>");
    return;
  }

  if (!["auto", "vpn", "direct"].includes(mode)) {
    console.error(`无效的模式: ${mode}`);
    console.error("可用模式: auto, vpn, direct");
    return;
  }

  await store.saveMode(mode as "auto" | "vpn" | "direct");
  console.log(`✅ 已设置模式: ${mode}`);
}

function printVpnHelp(): void {
  console.log(`cc98 vpn - WebVPN 管理

Usage:
  cc98 vpn login [username] [password]   登录 WebVPN
  cc98 vpn logout                        注销 WebVPN
  cc98 vpn status                        查看状态
  cc98 vpn test                          测试连接
  cc98 vpn mode [auto|vpn|direct]        设置模式

Options:
  -h, --help                             显示帮助

说明:
  WebVPN 用于在非校园网环境下访问 CC98。
  登录需要使用浙大通行证账号密码。
  
模式:
  auto   - 自动检测校园网，非校园网自动使用 WebVPN（默认）
  vpn    - 强制使用 WebVPN
  direct - 强制直连（不使用 WebVPN）
`);
}
