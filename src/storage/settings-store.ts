import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getConfigDir } from "./paths.js";

interface Settings {
  lastSeenVersion?: string;
  autoSignin?: boolean;
}

export class SettingsStore {
  private readonly filePath: string;
  private cache: Settings | null = null;

  constructor() {
    this.filePath = join(getConfigDir(), "settings.json");
  }

  async getLastSeenVersion(): Promise<string | undefined> {
    const settings = await this.load();
    return settings.lastSeenVersion;
  }

  async setLastSeenVersion(version: string): Promise<void> {
    const settings = await this.load();
    settings.lastSeenVersion = version;
    await this.save(settings);
  }

  async isAutoSigninEnabled(): Promise<boolean> {
    const settings = await this.load();
    return settings.autoSignin === true;
  }

  async setAutoSigninEnabled(enabled: boolean): Promise<void> {
    const settings = await this.load();
    settings.autoSignin = enabled;
    await this.save(settings);
  }

  private async load(): Promise<Settings> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.filePath, "utf-8");
      this.cache = JSON.parse(raw) as Settings;
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  private async save(settings: Settings): Promise<void> {
    this.cache = settings;
    await mkdir(join(this.filePath, ".."), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  }
}
