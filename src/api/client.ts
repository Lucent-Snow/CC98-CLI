import { endpoints } from "./endpoints.js";
import type { AuthToken, ClientOptions, JsonObject, WebVpnOptions } from "./types.js";
import { WebVpnService } from "./webvpn.js";

const passwordClientId = "9a1fd200-8687-44b1-4c20-08d50a96e5cd";
const passwordClientSecret = "8b53f727-08e2-4509-8857-e34bf92b27f2";

interface RequestOptions {
  signal?: AbortSignal;
}

interface TokenRefreshResult {
  accessToken: string;
  refreshToken?: string;
}

export class Cc98Client {
  private readonly tokenStore: ClientOptions["tokenStore"];
  private readonly webVpn?: WebVpnService;
  private readonly webVpnOptions?: WebVpnOptions;
  private refreshPromise: Promise<TokenRefreshResult | null> | null = null;

  constructor(options: ClientOptions) {
    this.tokenStore = options.tokenStore;
    this.webVpnOptions = options.webVpn;
    
    // 如果配置了 WebVPN，初始化服务
    if (options.webVpn) {
      this.webVpn = new WebVpnService(options.webVpn.cookies);
    }
  }

  /**
   * 初始化 WebVPN（如果需要）
   * 应在启动时调用
   */
  async initWebVpn(): Promise<void> {
    if (!this.webVpn || !this.webVpnOptions) return;

    const mode = this.webVpnOptions.mode || "auto";

    if (mode === "direct") {
      // 强制直连模式，不启用 WebVPN
      return;
    }

    if (mode === "vpn") {
      // 强制 VPN 模式
      this.webVpn.enabled = true;
      if (this.webVpnOptions.credentials) {
        const result = await this.webVpn.login(
          this.webVpnOptions.credentials.username,
          this.webVpnOptions.credentials.password
        );
        if (!result.success) {
          console.error("WebVPN login failed:", result.message);
        }
      }
      if (!this.webVpn.isLoggedIn) {
        console.error("WebVPN is enabled but not logged in. Run \"cc98 vpn login\" first.");
      }
      return;
    }

    // auto 模式：检测是否在校园网
    const inCampus = await this.webVpn.checkNetwork();
    if (!inCampus) {
      // 不在校园网，尝试使用 WebVPN
      this.webVpn.enabled = true;
      if (this.webVpnOptions.credentials) {
        const result = await this.webVpn.login(
          this.webVpnOptions.credentials.username,
          this.webVpnOptions.credentials.password
        );
        if (!result.success) {
          console.error("WebVPN login failed:", result.message);
        }
      }
      if (!this.webVpn.isLoggedIn) {
        this.webVpn.enabled = false;
        console.error("WebVPN is needed but not logged in. Run \"cc98 vpn login\" first.");
      }
    }
  }

  /**
   * 获取 WebVPN 状态
   */
  getWebVpnStatus(): { enabled: boolean; loggedIn: boolean } | undefined {
    return this.webVpn?.getStatus();
  }

  async loginWithPassword(username: string, password: string): Promise<{ accessToken: string; refreshToken?: string }> {
    const body = new URLSearchParams({
      username,
      password,
      client_id: passwordClientId,
      client_secret: passwordClientSecret,
      grant_type: "password",
      scope: "cc98-api openid offline_access"
    });

    const token = await this.request<AuthToken>(endpoints.auth.token, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    }, false);

    if (!token.access_token) {
      const reason = token.error_description ?? token.error ?? "login failed";
      throw new Error(reason);
    }

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token
    };
  }

  async getMe(options: RequestOptions = {}): Promise<JsonObject> {
    return this.request<JsonObject>(endpoints.user.me, { signal: options.signal });
  }

  async getMeWithAccessToken(accessToken: string): Promise<JsonObject> {
    return this.request<JsonObject>(endpoints.user.me, {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    }, false);
  }

  async getForumIndex(options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.forum.index, { signal: options.signal });
  }

  async getAllBoards(options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.forum.allBoards, { signal: options.signal });
  }

  async getCardStat(options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.forum.cardStat, { signal: options.signal });
  }

  async getUserProfile(userId: number, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.profile(userId), { signal: options.signal });
  }

  async getBasicUsers(ids: number[], options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.basic(ids), { signal: options.signal });
  }

  async getUsers(ids: number[], options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.list(ids), { signal: options.signal });
  }

  async getFriendIds(type: "follower" | "followee", from = 0, size = 10, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.friendIds(type, from, size), { signal: options.signal });
  }

  async getMoment(from = 0, size = 20, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.moment(from, size), { signal: options.signal });
  }

  async getFavoriteUpdates(from = 0, size = 20, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.favoriteUpdates(from, size), { signal: options.signal });
  }

  async getFavoriteGroups(options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.favoriteGroups, { signal: options.signal });
  }

  async getRecentChats(from = 0, size = 10, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.recentChats(from, size), { signal: options.signal });
  }

  async getChatHistory(userId: number, from = 0, size = 10, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.chatHistory(userId, from, size), { signal: options.signal });
  }

  async searchUsers(name: string, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.search(name), { signal: options.signal });
  }

  async getUnreadCount(options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.unread, { signal: options.signal });
  }

  async getNotices(type: "system" | "at" | "reply", from = 0, size = 10, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.notices(type, from, size), { signal: options.signal });
  }

  async getBrowseHistory(from = 0, size = 11, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.browseHistory(from, size), { signal: options.signal });
  }

  async getTopic(topicId: number, options: RequestOptions = {}): Promise<JsonObject> {
    return this.request<JsonObject>(endpoints.topic.info(topicId), { signal: options.signal });
  }

  async getTopicPosts(topicId: number, from = 0, size = 10, options: RequestOptions = {}): Promise<JsonObject[]> {
    return this.request<JsonObject[]>(endpoints.topic.posts(topicId, from, size), { signal: options.signal });
  }

  async isTopicFavorite(topicId: number, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.topic.isFavorite(topicId), { signal: options.signal });
  }

  async getNewTopics(from = 0, size = 20, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.topic.newTopics(from, size), { signal: options.signal });
  }

  async getRandomTopics(size = 10, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.topic.randomTopics(size), { signal: options.signal });
  }

  async getFavoriteTopics(from = 0, size = 11, order = 1, groupId = 0, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.topic.favoriteTopics(from, size, order, groupId), { signal: options.signal });
  }

  async getTopicVote(topicId: number, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.topic.vote(topicId), { signal: options.signal });
  }

  async getBasicTopics(ids: number[]): Promise<unknown> {
    return this.request<unknown>(endpoints.topic.basic(ids));
  }

  async getRecentTopics(userId: number | undefined, from = 0, size = 11, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.topic.recent(userId, from, size), { signal: options.signal });
  }

  async getBoardInfo(boardId: number, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.board.info(boardId), { signal: options.signal });
  }

  async getBoardTopics(boardId: number, from = 0, size = 20, best = false, options: RequestOptions = {}): Promise<unknown> {
    const endpoint = best
      ? endpoints.board.bestTopics(boardId, from, size)
      : endpoints.board.topics(boardId, from, size);
    return this.request<unknown>(endpoint, { signal: options.signal });
  }

  async searchTopics(keyword: string, from = 0, size = 20, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.topic.search(keyword, from, size), { signal: options.signal });
  }

  async getPostReactionState(postId: number, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.post.reactionState(postId), { signal: options.signal });
  }

  async getPostRateReasons(type: number, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.post.rateReasons(type), { signal: options.signal });
  }

  // 写入操作

  async createTopic(boardId: number, title: string, content: string, contentType = 0): Promise<unknown> {
    return this.request<unknown>(endpoints.write.createTopic(boardId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, content, contentType })
    });
  }

  async replyTopic(topicId: number, content: string, contentType = 0): Promise<unknown> {
    return this.request<unknown>(endpoints.write.replyTopic(topicId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, contentType })
    });
  }

  async addFavorite(topicId: number, groupId = 0): Promise<unknown> {
    return this.request<unknown>(endpoints.write.addFavorite(topicId, groupId), {
      method: "PUT"
    });
  }

  async removeFavorite(topicId: number): Promise<unknown> {
    return this.request<unknown>(endpoints.write.removeFavorite(topicId), {
      method: "DELETE"
    });
  }

  async addBoardFavorite(boardId: number): Promise<unknown> {
    return this.request<unknown>(endpoints.write.addBoardFavorite(boardId), {
      method: "PUT"
    });
  }

  async removeBoardFavorite(boardId: number): Promise<unknown> {
    return this.request<unknown>(endpoints.write.removeBoardFavorite(boardId), {
      method: "DELETE"
    });
  }

  async followUser(userId: number): Promise<unknown> {
    return this.request<unknown>(endpoints.write.followUser(userId), {
      method: "PUT"
    });
  }

  async unfollowUser(userId: number): Promise<unknown> {
    return this.request<unknown>(endpoints.write.unfollowUser(userId), {
      method: "DELETE"
    });
  }

  async sendMessage(userId: number, content: string): Promise<unknown> {
    return this.request<unknown>(endpoints.write.sendMessage, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ receiverId: userId, content })
    });
  }

  async signin(): Promise<unknown> {
    return this.request<unknown>(endpoints.write.signin, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify("")
    });
  }

  async reactToPost(postId: number, isLike: boolean): Promise<unknown> {
    return this.request<unknown>(endpoints.post.react(postId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(isLike ? "like" : "dislike")
    });
  }

  private async request<T>(url: string, init: RequestInit = {}, authorize = true): Promise<T> {
    const headers = new Headers(init.headers);

    if (authorize) {
      const token = await this.tokenStore.getAccessToken();
      if (!token) {
        throw new Error("not logged in. Run \"cc98 login\" first.");
      }
      headers.set("authorization", `Bearer ${token}`);
    }

    // 使用 WebVPN 或直接请求
    let response: Response;
    if (this.webVpn?.isEnabled) {
      response = await this.webVpn.fetch(url, {
        ...init,
        headers: Object.fromEntries(headers.entries())
      });
    } else {
      response = await fetch(url, {
        ...init,
        headers
      });
    }

    // Try to refresh token on 401
    if (response.status === 401 && authorize) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        headers.set("authorization", `Bearer ${refreshed.accessToken}`);
        if (this.webVpn?.isEnabled) {
          response = await this.webVpn.fetch(url, {
            ...init,
            headers: Object.fromEntries(headers.entries())
          });
        } else {
          response = await fetch(url, {
            ...init,
            headers
          });
        }
      }
    }

    const text = await response.text();
    const data = parseJson(text);

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("not logged in or token expired. Run \"cc98 login\".");
      }
      const detail = getErrorDetail(data) ?? text;
      throw new Error(`request failed: ${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
    }

    return data as T;
  }

  private async tryRefreshToken(): Promise<TokenRefreshResult | null> {
    // Deduplicate concurrent refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefreshToken();

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefreshToken(): Promise<TokenRefreshResult | null> {
    const account = await this.tokenStore.getCurrentAccount?.();
    const refreshToken = account ? account.refreshToken : await this.tokenStore.getRefreshToken();
    if (!refreshToken) {
      return null;
    }

    try {
      const body = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: passwordClientId,
        client_secret: passwordClientSecret,
        grant_type: "refresh_token",
        scope: "cc98-api openid offline_access"
      });

      const token = await this.request<AuthToken>(endpoints.auth.token, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body
      }, false);

      if (!token.access_token) {
        return null;
      }

      const result: TokenRefreshResult = {
        accessToken: token.access_token,
        refreshToken: token.refresh_token
      };

      if (account && this.tokenStore.saveAccount) {
        await this.tokenStore.saveAccount(account.account, result);
      } else {
        await this.tokenStore.save(result);
      }
      return result;
    } catch {
      return null;
    }
  }
}

function parseJson(text: string): unknown {
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getErrorDetail(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }

  if ("error_description" in data && typeof data.error_description === "string") {
    return data.error_description;
  }

  if ("message" in data && typeof data.message === "string") {
    return data.message;
  }

  if ("error" in data && typeof data.error === "string") {
    return data.error;
  }

  return JSON.stringify(data);
}
