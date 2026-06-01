import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getConfigDir } from "./paths.js";

interface Settings {
  lastSeenVersion?: string;
  autoSignin?: boolean;
  drafts?: {
    topicReplies?: Record<string, string>;
  };
}

export class SettingsStore {
  private readonly filePath: string;
  private cache: Settings | null = null;
  private saveChain: Promise<void> = Promise.resolve();

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

  async getTopicReplyDraft(topicId: number): Promise<string> {
    const settings = await this.load();
    return settings.drafts?.topicReplies?.[String(topicId)] ?? "";
  }

  async setTopicReplyDraft(topicId: number, content: string): Promise<void> {
    const settings = await this.load();
    settings.drafts ??= {};
    settings.drafts.topicReplies ??= {};
    const key = String(topicId);

    if (content.trim()) {
      settings.drafts.topicReplies[key] = content;
    } else {
      delete settings.drafts.topicReplies[key];
      if (Object.keys(settings.drafts.topicReplies).length === 0) {
        delete settings.drafts.topicReplies;
      }
      if (Object.keys(settings.drafts).length === 0) {
        delete settings.drafts;
      }
    }

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
    const content = JSON.stringify(settings, null, 2) + "\n";
    this.saveChain = this.saveChain.then(async () => {
      await mkdir(join(this.filePath, ".."), { recursive: true });
      await writeFile(this.filePath, content, "utf-8");
    });
    await this.saveChain;
  }
}
