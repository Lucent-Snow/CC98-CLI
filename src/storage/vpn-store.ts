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
  password?: string;
  cookies?: Record<string, string>;
  loggedInAt?: string;
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

  /** Save WebVPN credentials without exposing them in command output. */
  async saveCredentials(username: string, password: string): Promise<void> {
    const config = await this.getConfig();
    await this.saveConfig({
      ...config,
      mode: config.mode ?? "auto",
      username,
      password,
    });
  }

  /** Save WebVPN credentials and the current session cookies. */
  async saveSession(username: string, password: string, cookies: Record<string, string>): Promise<void> {
    const config = await this.getConfig();
    await this.saveConfig({
      ...config,
      mode: config.mode ?? "auto",
      username,
      password,
      cookies,
      loggedInAt: new Date().toISOString(),
    });
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
  if (
    typeof value !== "object" ||
    value === null ||
    !("mode" in value) ||
    typeof (value as VpnConfig).mode !== "string" ||
    !["auto", "vpn", "direct"].includes((value as VpnConfig).mode)
  ) {
    return false;
  }

  const config = value as VpnConfig;
  return (config.username === undefined || typeof config.username === "string") &&
    (config.password === undefined || typeof config.password === "string") &&
    (config.cookies === undefined || (
      typeof config.cookies === "object" &&
      config.cookies !== null &&
      Object.values(config.cookies).every((cookie) => typeof cookie === "string")
    ));
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "ENOENT";
}
