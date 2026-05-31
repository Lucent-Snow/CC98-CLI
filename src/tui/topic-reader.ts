import { renderUbbToLines } from "./ubb-renderer.js";
import type { TopicLineEntry, TopicPostEntry, TopicReaderState } from "./state/types.js";
import { asArray, asNumber, asObject, normalizeInline } from "./helpers.js";
import { stripAnsi } from "./ansi.js";

const topicWidth = 72;

export function buildTopicReader(topicId: number, topic: Record<string, unknown>, posts: unknown[], size: number, from = 0): TopicReaderState {
  const title = String(topic.title ?? `主题 #${topicId}`);
  const replyCount = asNumber(topic.replyCount);
  const hitCount = asNumber(topic.hitCount);
  const boardName = String(topic.boardName ?? "");
  const totalFloors = Math.max(posts.length, replyCount !== undefined ? replyCount + 1 : posts.length);
  const meta = [
    boardName || undefined,
    replyCount !== undefined ? `${replyCount} 回复` : undefined,
    hitCount !== undefined ? `${hitCount} 浏览` : undefined
  ].filter(Boolean).join(" · ");
  const rendered = renderPosts(posts, 0, from);

  return {
    topicId,
    title,
    meta,
    lines: rendered.lines,
    posts: rendered.posts,
    loaded: from + posts.length,
    size,
    totalFloors,
    viewportRows: 0,
    cursorLine: 0,
    hasMore: posts.length >= size && from + posts.length < totalFloors,
    imageCount: rendered.imageCount,
    linkCount: rendered.linkCount,
    floorInput: "",
    jumpTarget: undefined,
    imageCache: new Map(),
    imageLoading: new Set(),
    imageErrors: new Map()
  };
}

export function appendTopicPosts(topic: TopicReaderState, posts: unknown[]): void {
  const rendered = renderPosts(posts, topic.lines.length, topic.loaded);
  topic.lines.push(...rendered.lines);
  topic.posts.push(...rendered.posts);
  topic.loaded += posts.length;
  topic.hasMore = posts.length >= topic.size && topic.loaded < topic.totalFloors;
  topic.imageCount += rendered.imageCount;
  topic.linkCount += rendered.linkCount;
}

export function replaceTopicPosts(topic: TopicReaderState, posts: unknown[], from: number): void {
  const rendered = renderPosts(posts, 0, from);
  topic.lines = rendered.lines;
  topic.posts = rendered.posts;
  topic.loaded = from + posts.length;
  topic.hasMore = posts.length >= topic.size && topic.loaded < topic.totalFloors;
  topic.imageCount = rendered.imageCount;
  topic.linkCount = rendered.linkCount;
  topic.floorInput = "";
  topic.jumpTarget = undefined;
  topic.cursorLine = 0;
}

export function currentTopicPost(topic: TopicReaderState, scroll: number): TopicPostEntry | undefined {
  return topic.posts.find((post) => scroll >= post.lineStart && scroll <= post.lineEnd);
}

export function currentTopicLine(topic: TopicReaderState, scroll: number): TopicLineEntry | undefined {
  for (const post of topic.posts) {
    const line = post.lines.find((entry) => entry.line === scroll);
    if (line) {
      return line;
    }
  }
  return undefined;
}

export function findTopicPostByFloor(topic: TopicReaderState, floor: number): TopicPostEntry | undefined {
  return topic.posts.find((post) => post.floor === floor);
}

// 页码相关常量
export const FLOORS_PER_PAGE = 10;

export interface TopicPageInfo {
  currentPage: number;
  totalPages: number;
  currentFloor: number;
  totalFloors: number;
}

export function getTopicPageInfo(topic: TopicReaderState, scroll: number): TopicPageInfo {
  const current = currentTopicPost(topic, scroll);
  const currentFloor = current?.floor ?? 1;
  const totalFloors = Math.max(topic.totalFloors, topic.posts.length > 0 ? topic.posts[topic.posts.length - 1].floor ?? topic.posts.length : 0);
  const currentPage = Math.ceil(currentFloor / FLOORS_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(totalFloors / FLOORS_PER_PAGE));
  return { currentPage, totalPages, currentFloor, totalFloors };
}

export function jumpToPage(topic: TopicReaderState, page: number): number {
  const targetFloor = (page - 1) * FLOORS_PER_PAGE + 1;
  const post = findTopicPostByFloor(topic, targetFloor);
  return post?.lineStart ?? 0;
}

export function lineKindLabel(kind: TopicLineEntry["kind"]): string {
  switch (kind) {
    case "header":
      return "楼层";
    case "divider":
      return "分隔";
    case "quote":
      return "引用";
    case "image":
      return "图片";
    case "link":
      return "链接";
    case "blank":
      return "空行";
    case "text":
      return "正文";
  }
}

export function parseBracketIndex(value: string, label: "image" | "link"): number | undefined {
  const match = value.match(new RegExp(`^\\[${label} (\\d+)\\]`));
  return match ? Number(match[1]) : undefined;
}

function parseLinkIndex(value: string): number | undefined {
  const plain = stripAnsi(value);
  const explicit = parseBracketIndex(plain, "link");
  if (explicit !== undefined) {
    return explicit;
  }
  const inline = plain.match(/\[(\d+)\]/);
  return inline ? Number(inline[1]) : undefined;
}

function renderPosts(posts: unknown[], lineOffset: number, floorOffset: number): {
  lines: string[];
  posts: TopicPostEntry[];
  imageCount: number;
  linkCount: number;
} {
  const lines: string[] = [];
  const entries: TopicPostEntry[] = [];
  let imageCount = 0;
  let linkCount = 0;

  for (const post of posts) {
    const obj = asObject(post);
    const floor = asNumber(obj.floor) ?? floorOffset + entries.length + 1;
    const author = String(obj.userName ?? asObject(obj.user).name ?? "匿名");
    const time = typeof obj.time === "string" ? obj.time.replace("T", " ").slice(0, 16) : "";
    const content = String(obj.content ?? "");
    const rendered = renderUbbToLines(content, { width: topicWidth });
    const postLines: TopicLineEntry[] = [];
    const start = lineOffset + lines.length;
    const header = `#${floor} ${author}${time ? ` · ${time}` : ""}`;

    lines.push(header);
    postLines.push({ line: lineOffset + lines.length - 1, row: 0, floor, kind: "header", text: header });
    lines.push("─".repeat(20));
    postLines.push({ line: lineOffset + lines.length - 1, row: 1, floor, kind: "divider", text: "" });

    for (const renderedLine of rendered.lines) {
      const kind = classifyLine(renderedLine);
      const imageIndex = kind === "image" ? parseBracketIndex(renderedLine, "image") : undefined;
      const linkIndex = kind === "link" ? parseLinkIndex(renderedLine) : undefined;
      const imageUrl = imageIndex !== undefined ? rendered.images[imageIndex - 1] : undefined;
      lines.push(renderedLine);
      postLines.push({
        line: lineOffset + lines.length - 1,
        row: postLines.length,
        floor,
        kind,
        text: renderedLine,
        imageIndex,
        imageUrl,
        linkIndex,
        linkUrl: linkIndex !== undefined ? rendered.links[linkIndex - 1] : undefined
      });
    }

    lines.push("");
    postLines.push({ line: lineOffset + lines.length - 1, row: postLines.length, floor, kind: "blank", text: "" });
    imageCount += rendered.images.length;
    linkCount += rendered.links.length;

    entries.push({
      id: asNumber(obj.id),
      userId: asNumber(obj.userId),
      floor,
      author,
      time,
      likeCount: asNumber(obj.likeCount) ?? 0,
      dislikeCount: asNumber(obj.dislikeCount) ?? 0,
      rating: formatRating(obj),
      preview: normalizeInline(stripAnsi(rendered.lines.join(" "))).slice(0, 80),
      lineStart: start,
      lineEnd: lineOffset + lines.length - 1,
      imageCount: rendered.images.length,
      linkCount: rendered.links.length,
      images: rendered.images,
      links: rendered.links,
      lines: postLines
    });
  }

  return { lines, posts: entries, imageCount, linkCount };
}

function classifyLine(line: string): TopicLineEntry["kind"] {
  const plain = stripAnsi(line);
  if (plain.startsWith("[image ")) {
    return "image";
  }
  if (plain.startsWith("[link ") || /\[\d+\]/.test(plain)) {
    return "link";
  }
  if (plain.startsWith("│ ")) {
    return "quote";
  }
  if (plain.trim() === "") {
    return "blank";
  }
  return "text";
}

function formatRating(post: Record<string, unknown>): string | undefined {
  const ratings = asArray(post.ratings);
  if (ratings.length > 0) {
    return `${ratings.length} 条评分`;
  }
  const rating = asNumber(post.rating);
  return rating !== undefined && rating !== 0 ? String(rating) : undefined;
}
