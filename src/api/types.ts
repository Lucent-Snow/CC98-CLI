export interface AuthToken {
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

export interface ClientOptions {
  tokenStore: {
    getAccessToken(): Promise<string | undefined>;
    getRefreshToken(): Promise<string | undefined>;
  };
}

export type JsonObject = Record<string, unknown>;
