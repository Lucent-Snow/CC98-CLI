import { Cc98Client } from "../api/client.js";
import { CacheStore } from "../storage/cache-store.js";

const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;

export class CachedCc98Client {
  readonly cache: CacheStore;

  constructor(
    private readonly client: Cc98Client,
    cache?: CacheStore
  ) {
    this.cache = cache ?? new CacheStore();
  }

  getForumIndex(force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet("forum:index", 30 * second, () => this.client.getForumIndex({ signal }), { force });
  }

  getUnreadCount(force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet("user:unread", 10 * second, () => this.client.getUnreadCount({ signal }), { force });
  }

  getAllBoards(force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet("forum:boards", 24 * hour, () => this.client.getAllBoards({ signal }), { force });
  }

  getCardStat(force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet("forum:card-stat", 5 * minute, () => this.client.getCardStat({ signal }), { force });
  }

  getBoardInfo(boardId: number, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(`board:info:${boardId}`, 24 * hour, () => this.client.getBoardInfo(boardId, { signal }), { force });
  }

  getBoardTopics(boardId: number, from = 0, size = 20, best = false, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(
      `board:topics:${boardId}:${from}:${size}:${best ? "best" : "normal"}`,
      30 * second,
      () => this.client.getBoardTopics(boardId, from, size, best, { signal }),
      { force }
    );
  }

  getNewTopics(from = 0, size = 12, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(`topic:new:${from}:${size}`, 20 * second, () => this.client.getNewTopics(from, size, { signal }), { force });
  }

  getFolloweeTopics(from = 0, size = 12, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(`user:followee-topic:${from}:${size}`, 30 * second, () => this.client.getMoment(from, size, { signal }), { force });
  }

  getFavoriteUpdates(from = 0, size = 12, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(`user:favorite-updates:${from}:${size}`, 15 * second, () => this.client.getFavoriteUpdates(from, size, { signal }), { force });
  }

  getRecentChats(from = 0, size = 10, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(`message:recent:${from}:${size}`, 15 * second, () => this.client.getRecentChats(from, size, { signal }), { force });
  }

  getChatHistory(userId: number, from = 0, size = 10, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(
      `message:history:${userId}:${from}:${size}`,
      15 * second,
      () => this.client.getChatHistory(userId, from, size, { signal }),
      { force }
    );
  }

  getBasicUsers(ids: number[], force = false, signal?: AbortSignal): Promise<unknown> {
    const uniqueIds = [...new Set(ids)].sort((a, b) => a - b);
    if (uniqueIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.cache.getOrSet(`user:basic:${uniqueIds.join(",")}`, 10 * minute, () => this.client.getBasicUsers(uniqueIds, { signal }), { force });
  }

  getUsers(ids: number[], force = false, signal?: AbortSignal): Promise<unknown> {
    const uniqueIds = [...new Set(ids)].sort((a, b) => a - b);
    if (uniqueIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.cache.getOrSet(`user:list:${uniqueIds.join(",")}`, 5 * minute, () => this.client.getUsers(uniqueIds, { signal }), { force });
  }

  getMe(force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet("user:me", 60 * second, () => this.client.getMe({ signal }), { force });
  }

  getTopic(topicId: number, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(`topic:meta:${topicId}`, 60 * second, () => this.client.getTopic(topicId, { signal }), { force });
  }

  getTopicPosts(topicId: number, from = 0, size = 10, force = false, signal?: AbortSignal): Promise<unknown> {
    const ttl = from === 0 ? 60 * second : 10 * minute;
    return this.cache.getOrSet(
      `topic:posts:${topicId}:${from}:${size}`,
      ttl,
      () => this.client.getTopicPosts(topicId, from, size, { signal }),
      { force }
    );
  }

  getRandomTopics(size = 10, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(`topic:random:${size}`, 15 * second, () => this.client.getRandomTopics(size, { signal }), { force });
  }

  getFavoriteTopics(from = 0, size = 11, order = 1, groupId = 0, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(
      `topic:favorites:${from}:${size}:${order}:${groupId}`,
      30 * second,
      () => this.client.getFavoriteTopics(from, size, order, groupId, { signal }),
      { force }
    );
  }

  getTopicVote(topicId: number, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(`topic:vote:${topicId}`, 60 * second, () => this.client.getTopicVote(topicId, { signal }), { force });
  }

  getPostReactionState(postId: number, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(`post:reaction-state:${postId}`, 10 * second, () => this.client.getPostReactionState(postId, { signal }), { force });
  }

  getPostRateReasons(type: number, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(`post:rate-reasons:${type}`, 24 * hour, () => this.client.getPostRateReasons(type, { signal }), { force });
  }

  /**
   * Clear all caches (memory + file)
   */
  async clearCache(): Promise<void> {
    await this.cache.clearAll();
  }

  // 搜索

  async searchTopics(keyword: string, from = 0, size = 20, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(
      `search:topics:${keyword}:${from}:${size}`,
      30 * second,
      () => this.client.searchTopics(keyword, from, size, { signal }),
      { force }
    );
  }

  async searchUsers(name: string, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(
      `search:users:${name}`,
      30 * second,
      () => this.client.searchUsers(name, { signal }),
      { force }
    );
  }

  getFriendIds(type: "follower" | "followee", from = 0, size = 10, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(`user:${type}:${from}:${size}`, 60 * second, () => this.client.getFriendIds(type, from, size, { signal }), { force });
  }

  getFavoriteGroups(force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet("user:favorite-groups", 5 * minute, () => this.client.getFavoriteGroups({ signal }), { force });
  }

  getNotices(type: "system" | "at" | "reply", from = 0, size = 10, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(`notice:${type}:${from}:${size}`, 15 * second, () => this.client.getNotices(type, from, size, { signal }), { force });
  }

  getBrowseHistory(from = 0, size = 11, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(`user:browse-history:${from}:${size}`, 30 * second, () => this.client.getBrowseHistory(from, size, { signal }), { force });
  }

  // 收藏

  async isTopicFavorite(topicId: number, force = false, signal?: AbortSignal): Promise<boolean> {
    const result = await this.cache.getOrSet(
      `topic:is-favorite:${topicId}`,
      60 * second,
      () => this.client.isTopicFavorite(topicId, { signal }),
      { force }
    );
    return Boolean(result);
  }

  async addFavorite(topicId: number, groupId = 0): Promise<unknown> {
    const result = await this.client.addFavorite(topicId, groupId);
    this.cache.delete(`topic:is-favorite:${topicId}`);
    return result;
  }

  async removeFavorite(topicId: number): Promise<unknown> {
    const result = await this.client.removeFavorite(topicId);
    this.cache.delete(`topic:is-favorite:${topicId}`);
    return result;
  }

  // 点赞/踩

  async reactToPost(postId: number, isLike: boolean): Promise<unknown> {
    return this.client.reactToPost(postId, isLike);
  }

  // 用户

  async getUserProfile(userId: number, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(
      `user:profile:${userId}`,
      5 * minute,
      () => this.client.getUserProfile(userId, { signal }),
      { force }
    );
  }

  async getRecentTopics(userId: number | undefined, from = 0, size = 11, force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet(
      `user:recent-topics:${userId ?? "me"}:${from}:${size}`,
      30 * second,
      () => this.client.getRecentTopics(userId, from, size, { signal }),
      { force }
    );
  }

  async followUser(userId: number): Promise<unknown> {
    const result = await this.client.followUser(userId);
    this.cache.delete(`user:profile:${userId}`);
    return result;
  }

  async unfollowUser(userId: number): Promise<unknown> {
    const result = await this.client.unfollowUser(userId);
    this.cache.delete(`user:profile:${userId}`);
    return result;
  }

  // 私信

  async sendMessage(userId: number, content: string): Promise<unknown> {
    return this.client.sendMessage(userId, content);
  }

  // 签到

  async signin(): Promise<unknown> {
    return this.client.signin();
  }

  /**
   * Run cache cleanup and return statistics
   */
  async cleanupCache(): Promise<{ removed: number; kept: number }> {
    return this.cache.cleanupFileCache();
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    memoryEntries: number;
    inflightRequests: number;
    fileCacheEntries: number;
  }> {
    return this.cache.getStats();
  }
}
