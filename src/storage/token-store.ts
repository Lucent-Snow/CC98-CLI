import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getTokenFilePath } from "./paths.js";

export interface AccountRecord {
  account: string;
  userId?: number;
  username?: string;
  displayName?: string;
  accessToken: string;
  refreshToken?: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredTokens {
  current?: string;
  accounts: Record<string, AccountRecord>;
}

interface LegacyTokens {
  accessToken?: string;
  refreshToken?: string;
}

export class TokenStore {
  private readonly filePath: string;
  private account?: string;

  constructor(filePath = getTokenFilePath(), account?: string) {
    this.filePath = filePath;
    this.account = account;
  }

  withAccount(account: string | undefined): TokenStore {
    return new TokenStore(this.filePath, account);
  }

  async getAccessToken(): Promise<string | undefined> {
    return (await this.getCurrentAccount())?.accessToken;
  }

  async getRefreshToken(): Promise<string | undefined> {
    return (await this.getCurrentAccount())?.refreshToken;
  }

  async save(tokens: { accessToken: string; refreshToken?: string }): Promise<void> {
    const account = this.account ?? "default";
    await this.saveAccount(account, tokens);
  }

  async saveAccount(
    account: string,
    tokens: {
      accessToken: string;
      refreshToken?: string;
      userId?: number;
      username?: string;
      displayName?: string;
    }
  ): Promise<AccountRecord> {
    const state = await this.read();
    const now = new Date().toISOString();
    const previous = state.accounts[account];
    const record: AccountRecord = {
      account,
      userId: tokens.userId ?? previous?.userId,
      username: tokens.username ?? previous?.username,
      displayName: tokens.displayName ?? previous?.displayName,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? previous?.refreshToken,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    };

    state.accounts[account] = record;
    state.current = account;
    await this.write(state);
    this.account = account;
    return record;
  }

  async getCurrentAccount(): Promise<AccountRecord | undefined> {
    const state = await this.read();
    const account = this.resolveAccountName(state);
    return account ? state.accounts[account] : undefined;
  }

  async getCurrentAccountName(): Promise<string | undefined> {
    const state = await this.read();
    return this.resolveAccountName(state);
  }

  async listAccounts(): Promise<AccountRecord[]> {
    const state = await this.read();
    return Object.values(state.accounts).sort((left, right) =>
      left.account.localeCompare(right.account)
    );
  }

  async useAccount(account: string): Promise<AccountRecord> {
    const state = await this.read();
    const record = state.accounts[account];
    if (!record) {
      throw new Error(`account not found: ${account}`);
    }

    state.current = account;
    await this.write(state);
    this.account = account;
    return record;
  }

  async removeAccount(account: string): Promise<void> {
    const state = await this.read();
    if (!state.accounts[account]) {
      throw new Error(`account not found: ${account}`);
    }

    delete state.accounts[account];
    if (state.current === account) {
      state.current = Object.keys(state.accounts)[0];
    }
    await this.write(state);
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }

  private resolveAccountName(state: StoredTokens): string | undefined {
    if (this.account) {
      if (!state.accounts[this.account]) {
        throw new Error(`account not found: ${this.account}`);
      }
      return this.account;
    }

    const envAccount = process.env.CC98_ACCOUNT;
    if (envAccount) {
      if (!state.accounts[envAccount]) {
        throw new Error(`account not found: ${envAccount}`);
      }
      return envAccount;
    }

    if (state.current && state.accounts[state.current]) {
      return state.current;
    }

    const accountNames = Object.keys(state.accounts);
    if (accountNames.length === 1) {
      return accountNames[0];
    }

    if (accountNames.length > 1) {
      throw new Error("multiple accounts found. Run \"cc98 account use <account>\" or pass \"--account <account>\".");
    }

    return undefined;
  }

  private async read(): Promise<StoredTokens> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (isStoredTokens(parsed)) {
        return parsed;
      }

      if (isLegacyTokens(parsed)) {
        const migrated = legacyToStoredTokens(parsed);
        await this.write(migrated);
        return migrated;
      }

      return emptyTokens();
    } catch (error: unknown) {
      if (isFileNotFound(error)) {
        return emptyTokens();
      }
      throw error;
    }
  }

  private async write(tokens: StoredTokens): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    await writeFile(this.filePath, `${JSON.stringify(tokens, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    await chmod(this.filePath, 0o600);
  }
}

function emptyTokens(): StoredTokens {
  return {
    accounts: {}
  };
}

function legacyToStoredTokens(value: LegacyTokens & { accessToken: string }): StoredTokens {
  const now = new Date().toISOString();
  return {
    current: "default",
    accounts: {
      default: {
        account: "default",
        accessToken: value.accessToken,
        refreshToken: value.refreshToken,
        createdAt: now,
        updatedAt: now
      }
    }
  };
}

function isStoredTokens(value: unknown): value is StoredTokens {
  return typeof value === "object" &&
    value !== null &&
    "accounts" in value &&
    typeof value.accounts === "object" &&
    value.accounts !== null;
}

function isLegacyTokens(value: unknown): value is LegacyTokens & { accessToken: string } {
  return typeof value === "object" &&
    value !== null &&
    "accessToken" in value &&
    typeof value.accessToken === "string";
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT";
}
