import { Cc98Client } from "../api/client.js";
import { CacheStore } from "../storage/cache-store.js";

const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;

export class CachedCc98Client {
  constructor(
    private readonly client: Cc98Client,
    private readonly cache = new CacheStore()
  ) {}

  getForumIndex(force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet("forum:index", 30 * second, () => this.client.getForumIndex({ signal }), { force });
  }

  getUnreadCount(force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet("user:unread", 10 * second, () => this.client.getUnreadCount({ signal }), { force });
  }

  getAllBoards(force = false, signal?: AbortSignal): Promise<unknown> {
    return this.cache.getOrSet("forum:boards", 24 * hour, () => this.client.getAllBoards({ signal }), { force });
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
}
