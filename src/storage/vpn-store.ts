import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getConfigDir } from "./paths.js";
import { join } from "node:path";

export interface VpnCredentials {
  username: string;
  password: string;
}

export interface VpnConfig {
  mode: "auto" | "vpn" | "direct";
  username?: string;
  // 密码不持久化，每次需要时输入
}

const VPN_CONFIG_FILE = "vpn.json";

export class VpnStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? join(getConfigDir(), VPN_CONFIG_FILE);
  }

  /**
   * 获取 VPN 配置
   */
  async getConfig(): Promise<VpnConfig> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (isVpnConfig(parsed)) {
        return parsed;
      }
      return { mode: "auto" };
    } catch (error: unknown) {
      if (isFileNotFound(error)) {
        return { mode: "auto" };
      }
      throw error;
    }
  }

  /**
   * 保存 VPN 配置
   */
  async saveConfig(config: VpnConfig): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    await writeFile(this.filePath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(this.filePath, 0o600);
  }

  /**
   * 保存 VPN 用户名（密码不保存）
   */
  async saveUsername(username: string): Promise<void> {
    const config = await this.getConfig();
    config.username = username;
    await this.saveConfig(config);
  }

  /**
   * 保存 VPN 模式
   */
  async saveMode(mode: VpnConfig["mode"]): Promise<void> {
    const config = await this.getConfig();
    config.mode = mode;
    await this.saveConfig(config);
  }

  /**
   * 清除 VPN 配置
   */
  async clear(): Promise<void> {
    const { rm } = await import("node:fs/promises");
    await rm(this.filePath, { force: true });
  }
}

function isVpnConfig(value: unknown): value is VpnConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    "mode" in value &&
    typeof (value as VpnConfig).mode === "string" &&
    ["auto", "vpn", "direct"].includes((value as VpnConfig).mode)
  );
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "ENOENT";
}
