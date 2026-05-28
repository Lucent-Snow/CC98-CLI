export interface AuthToken {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

export interface WebVpnOptions {
  /** WebVPN 模式: auto=自动检测, vpn=强制使用, direct=强制直连 */
  mode?: "auto" | "vpn" | "direct";
  /** WebVPN 登录凭据（浙大通行证） */
  credentials?: {
    username: string;
    password: string;
  };
}

export interface ClientOptions {
  tokenStore: {
    getAccessToken(): Promise<string | undefined>;
    getRefreshToken(): Promise<string | undefined>;
    getCurrentAccount?(): Promise<{ account: string; refreshToken?: string } | undefined>;
    save(tokens: { accessToken: string; refreshToken?: string }): Promise<void>;
    saveAccount?(account: string, tokens: { accessToken: string; refreshToken?: string }): Promise<unknown>;
  };
  /** WebVPN 配置 */
  webVpn?: WebVpnOptions;
}

export type JsonObject = Record<string, unknown>;
