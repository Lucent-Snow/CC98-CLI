import { endpoints } from "./endpoints.js";
import type { AuthToken, ClientOptions, JsonObject } from "./types.js";

const passwordClientId = "9a1fd200-8687-44b1-4c20-08d50a96e5cd";
const passwordClientSecret = "8b53f727-08e2-4509-8857-e34bf92b27f2";

interface RequestOptions {
  signal?: AbortSignal;
}

export class Cc98Client {
  private readonly tokenStore: ClientOptions["tokenStore"];

  constructor(options: ClientOptions) {
    this.tokenStore = options.tokenStore;
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

  async getCardStat(): Promise<unknown> {
    return this.request<unknown>(endpoints.forum.cardStat);
  }

  async getUserProfile(userId: number): Promise<unknown> {
    return this.request<unknown>(endpoints.user.profile(userId));
  }

  async getBasicUsers(ids: number[], options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.basic(ids), { signal: options.signal });
  }

  async getUsers(ids: number[]): Promise<unknown> {
    return this.request<unknown>(endpoints.user.list(ids));
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

  async getFavoriteGroups(): Promise<unknown> {
    return this.request<unknown>(endpoints.user.favoriteGroups);
  }

  async getRecentChats(from = 0, size = 10, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.recentChats(from, size), { signal: options.signal });
  }

  async getChatHistory(userId: number, from = 0, size = 10, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.chatHistory(userId, from, size), { signal: options.signal });
  }

  async searchUsers(name: string): Promise<unknown> {
    return this.request<unknown>(endpoints.user.search(name));
  }

  async getUnreadCount(options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.user.unread, { signal: options.signal });
  }

  async getNotices(type: "system" | "at" | "reply", from = 0, size = 10): Promise<unknown> {
    return this.request<unknown>(endpoints.user.notices(type, from, size));
  }

  async getBrowseHistory(from = 0, size = 11): Promise<unknown> {
    return this.request<unknown>(endpoints.user.browseHistory(from, size));
  }

  async getTopic(topicId: number, options: RequestOptions = {}): Promise<JsonObject> {
    return this.request<JsonObject>(endpoints.topic.info(topicId), { signal: options.signal });
  }

  async getTopicPosts(topicId: number, from = 0, size = 10, options: RequestOptions = {}): Promise<JsonObject[]> {
    return this.request<JsonObject[]>(endpoints.topic.posts(topicId, from, size), { signal: options.signal });
  }

  async isTopicFavorite(topicId: number): Promise<unknown> {
    return this.request<unknown>(endpoints.topic.isFavorite(topicId));
  }

  async getNewTopics(from = 0, size = 20, options: RequestOptions = {}): Promise<unknown> {
    return this.request<unknown>(endpoints.topic.newTopics(from, size), { signal: options.signal });
  }

  async getRandomTopics(size = 10): Promise<unknown> {
    return this.request<unknown>(endpoints.topic.randomTopics(size));
  }

  async getFavoriteTopics(from = 0, size = 11, order = 1, groupId = 0): Promise<unknown> {
    return this.request<unknown>(endpoints.topic.favoriteTopics(from, size, order, groupId));
  }

  async getTopicVote(topicId: number): Promise<unknown> {
    return this.request<unknown>(endpoints.topic.vote(topicId));
  }

  async getBasicTopics(ids: number[]): Promise<unknown> {
    return this.request<unknown>(endpoints.topic.basic(ids));
  }

  async getRecentTopics(userId: number | undefined, from = 0, size = 11): Promise<unknown> {
    return this.request<unknown>(endpoints.topic.recent(userId, from, size));
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

  async searchTopics(keyword: string, from = 0, size = 20): Promise<unknown> {
    return this.request<unknown>(endpoints.topic.search(keyword, from, size));
  }

  async getPostReactionState(postId: number): Promise<unknown> {
    return this.request<unknown>(endpoints.post.reactionState(postId));
  }

  async getPostRateReasons(type: number): Promise<unknown> {
    return this.request<unknown>(endpoints.post.rateReasons(type));
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

    const response = await fetch(url, {
      ...init,
      headers
    });

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
