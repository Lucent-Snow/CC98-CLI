// TUI 辅助函数

import type { ContentItem } from "./state/types.js";
import type { CachedCc98Client } from "./cached-client.js";

// 辅助函数
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function item(title: string, value: unknown, meta?: string): ContentItem {
  return {
    title,
    meta,
    detail: value === undefined || value === null ? "-" : String(value)
  };
}

export function topicItem(value: unknown, fallbackBoard?: ContentItem): ContentItem {
  const topic = asObject(value);
  const nestedTopic = asObject(topic.topic ?? topic.Topic);
  const source = Object.keys(nestedTopic).length > 0 ? nestedTopic : topic;
  const topicId = asNumber(source.id ?? source.Id ?? topic.topicId ?? topic.TopicId);
  const boardId = asNumber(source.boardId ?? source.BoardId ?? topic.boardId ?? topic.BoardId) ?? fallbackBoard?.boardId;
  const boardName = topic.boardName ?? topic.BoardName ?? source.boardName ?? source.BoardName ?? fallbackBoard?.title;
  return {
    title: normalizeInline(String(source.title ?? source.Title ?? topic.title ?? topic.Title ?? `#${topicId ?? ""}`)),
    meta: [
      boardName,
      source.userName ?? source.UserName ?? source.authorName ?? topic.userName ?? topic.UserName ?? topic.authorName,
      source.replyCount !== undefined ? `${source.replyCount} 回复` : topic.replyCount !== undefined ? `${topic.replyCount} 回复` : undefined,
      source.hitCount !== undefined ? `${source.hitCount} 浏览` : topic.hitCount !== undefined ? `${topic.hitCount} 浏览` : undefined
    ].filter(Boolean).join(" · "),
    detail: normalizeInline(String(source.lastPostContent ?? source.content ?? topic.lastPostContent ?? topic.content ?? "")) || undefined,
    topicId,
    boardId,
    sortTime: timestampOf(source.lastPostTime ?? source.updateTime ?? source.time ?? source.createTime ?? topic.lastPostTime ?? topic.updateTime ?? topic.time)
  };
}

export function userItem(value: unknown): ContentItem {
  const user = asObject(value);
  const userId = asNumber(user.id ?? user.Id ?? user.userId ?? user.UserId);
  return {
    title: normalizeInline(String(user.name ?? user.Name ?? user.userName ?? user.UserName ?? (userId !== undefined ? `#${userId}` : "用户"))),
    meta: [
      userId !== undefined ? `#${userId}` : undefined,
      user.postCount !== undefined ? `${user.postCount} 帖` : undefined,
      user.levelTitle ?? user.groupName
    ].filter(Boolean).join(" · "),
    detail: normalizeInline(String(user.introduction ?? user.signature ?? user.Signature ?? "")) || undefined,
    userId
  };
}

export function genericItem(value: unknown, fallbackTitle: string): ContentItem {
  if (typeof value === "string") {
    return { title: normalizeInline(value) };
  }
  const obj = asObject(value);
  return {
    title: normalizeInline(String(obj.title ?? obj.Title ?? obj.name ?? obj.Name ?? fallbackTitle)),
    meta: normalizeInline(String(obj.meta ?? obj.detail ?? obj.description ?? "")) || undefined,
    detail: normalizeInline(String(obj.detail ?? obj.content ?? "")) || undefined
  };
}

export function noticeItem(value: unknown): ContentItem {
  const obj = asObject(value);
  const id = asNumber(obj.id ?? obj.Id);
  const title = String(obj.title ?? obj.Title ?? obj.content ?? `#${id ?? "?"}`);
  const timeValue = obj.time ?? obj.Time ?? obj.createTime;
  const time = typeof timeValue === "string" ? timeValue.replace("T", " ").slice(0, 16) : "";
  const content = normalizeInline(String(obj.content ?? obj.Content ?? "")).slice(0, 70);

  return {
    title,
    meta: [time, content].filter(Boolean).join(" · "),
    topicId: asNumber(obj.topicId ?? obj.TopicId),
    userId: asNumber(obj.userId ?? obj.UserId)
  };
}

export function historyItem(value: unknown): ContentItem {
  const itemValue = asObject(value);
  const topic = asObject(itemValue.topic ?? itemValue.Topic);
  const source = Object.keys(topic).length > 0 ? topic : itemValue;
  const id = asNumber(source.id ?? source.Id ?? itemValue.topicId ?? itemValue.TopicId);
  const timeValue = itemValue.time ?? itemValue.Time ?? itemValue.lastTime;
  const time = typeof timeValue === "string" ? timeValue.replace("T", " ").slice(0, 16) : undefined;

  return {
    title: normalizeInline(String(source.title ?? source.Title ?? `#${id ?? "?"}`)),
    meta: [topicItem(source).meta, time !== undefined ? `浏览 ${time}` : undefined].filter(Boolean).join(" · "),
    topicId: id
  };
}

export async function loadChatUserNames(
  client: CachedCc98Client,
  chats: unknown[],
  force: boolean,
  signal?: AbortSignal
): Promise<Map<number, string>> {
  const ids = chats
    .map((chat) => asNumber(asObject(chat).userId ?? asObject(chat).UserId))
    .filter((id): id is number => id !== undefined);
  const users = asArray(await client.getBasicUsers(ids, force, signal));
  const entries = users.map((userRaw): [number, string] => {
    const user = asObject(userRaw);
    return [asNumber(user.id ?? user.Id) ?? 0, String(user.name ?? user.Name ?? "用户")];
  }).filter(([id]) => id !== 0);
  return new Map(entries);
}

export function chatItem(value: unknown, userNames: Map<number, string>): ContentItem {
  const obj = asObject(value);
  const userId = asNumber(obj.userId ?? obj.UserId);
  const name = userNames.get(userId ?? 0) ?? String(userId ?? "?");
  const lastMessage = normalizeInline(String(obj.lastMessage ?? obj.LastMessage ?? obj.content ?? ""));
  const timeValue = obj.time ?? obj.Time ?? obj.lastTime;
  const time = typeof timeValue === "string" ? timeValue.replace("T", " ").slice(0, 16) : "";

  return {
    title: name,
    meta: `${lastMessage} · ${time}`,
    chatUserId: userId
  };
}

export function chatMessageItems(messages: unknown[], otherName: string, otherUserId: number): ContentItem[] {
  return messages.map((msg) => {
    const obj = asObject(msg);
    const isMe = Boolean(obj.isMe ?? obj.IsMe);
    const content = normalizeInline(String(obj.content ?? obj.Content ?? ""));
    const timeValue = obj.time ?? obj.Time ?? obj.createTime;
    const time = typeof timeValue === "string" ? timeValue.replace("T", " ").slice(0, 16) : "";

    return {
      title: `${isMe ? "我" : otherName}: ${content}`,
      meta: time,
      chatUserId: otherUserId
    };
  });
}

export function unreadStats(value: Record<string, unknown>): ContentItem[] {
  return [
    { title: "系统", detail: String(asNumber(value.systemCount) ?? 0) },
    { title: "@", detail: String(asNumber(value.atCount) ?? 0) },
    { title: "回复", detail: String(asNumber(value.replyCount) ?? 0) }
  ];
}

export function overviewStats(index: Record<string, unknown>, unread: Record<string, unknown>): ContentItem[] {
  return [
    { title: "今日主题", detail: String(asNumber(index.todayTopicCount) ?? 0) },
    { title: "今日回复", detail: String(asNumber(index.todayCount) ?? 0) },
    { title: "在线", detail: String(asNumber(index.onlineUserCount) ?? 0) },
    { title: "用户", detail: String(asNumber(index.userCount) ?? 0) },
    { title: "未读", detail: String((asNumber(unread.systemCount) ?? 0) + (asNumber(unread.atCount) ?? 0) + (asNumber(unread.replyCount) ?? 0)) }
  ];
}

export async function mapLimit<T, R>(values: T[], limit: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index] as T);
    }
  };

  const workerCount = Math.max(1, Math.min(limit, values.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export function flattenBoards(sections: unknown[]): ContentItem[] {
  const boards: ContentItem[] = [];

  for (const section of sections) {
    const sectionObj = asObject(section);
    const sectionName = String(sectionObj.name ?? sectionObj.Name ?? sectionObj.title ?? sectionObj.Title ?? "分区");
    const candidates = [sectionObj.boards, sectionObj.Boards, sectionObj.children, sectionObj.Children, sectionObj.boardList];

    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) continue;
      for (const board of candidate) {
        const boardObj = asObject(board);
        const id = asNumber(boardObj.id ?? boardObj.Id);
        const todayCount = asNumber(boardObj.todayCount ?? boardObj.TodayCount);
        const topicCount = asNumber(boardObj.topicCount ?? boardObj.TopicCount);
        boards.push({
          title: normalizeInline(String(boardObj.name ?? boardObj.Name ?? boardObj.title ?? boardObj.Title ?? `#${id ?? "?"}`)),
          meta: [
            sectionName,
            id !== undefined ? `#${id}` : undefined,
            todayCount !== undefined ? `${todayCount} 今日` : undefined,
            topicCount !== undefined ? `${topicCount} 主题` : undefined
          ].filter(Boolean).join(" · "),
          detail: typeof boardObj.description === "string" ? boardObj.description : undefined,
          boardId: id
        });
      }
    }
  }

  return boards;
}

export function normalizeInline(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function timestampOf(value: unknown): number | undefined {
  if (typeof value === "string") {
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date.getTime();
  }
  return undefined;
}

export function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";

  for (const char of text) {
    if (current.length >= maxWidth) {
      lines.push(current);
      current = "";
    }
    current += char;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

export function truncate(value: string, width: number): string {
  if (value.length <= width) {
    return value;
  }
  return value.slice(0, width - 3) + "...";
}

export function jsonPreviewLines(value: unknown): string[] {
  try {
    const json = JSON.stringify(value, null, 2);
    return json.split("\n").slice(0, 10);
  } catch {
    return [String(value)];
  }
}
