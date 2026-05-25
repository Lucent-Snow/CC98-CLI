import { Cc98Client } from "../api/client.js";
import { TokenStore } from "../storage/token-store.js";
import { ansi, bg, fg, stripAnsi } from "./ansi.js";
import { CachedCc98Client } from "./cached-client.js";
import { Terminal } from "./terminal.js";
import { renderUbbToLines } from "./ubb-renderer.js";

type ViewId = "hot" | "new" | "boards" | "following" | "favorite" | "messages" | "me";
type FocusColumn = "nav" | "content";

interface NavItem {
  id: ViewId;
  label: string;
  hint: string;
}

interface ContentItem {
  title: string;
  meta?: string;
  detail?: string;
  topicId?: number;
  boardId?: number;
  chatUserId?: number;
  sortTime?: number;
}

interface TuiState {
  mode: "list" | "topic";
  focus: FocusColumn;
  navIndex: number;
  itemIndex: number;
  scroll: number;
  loading: boolean;
  loadingMore: boolean;
  status: string;
  error?: string;
  account?: string;
  viewTitle: string;
  items: ContentItem[];
  stats: ContentItem[];
  overview: ContentItem[];
  parentList?: ListSnapshot;
  currentBoard?: BoardListState;
  currentChat?: ChatListState;
  topic?: TopicReaderState;
}

interface ListSnapshot {
  title: string;
  items: ContentItem[];
  stats: ContentItem[];
  itemIndex: number;
  status: string;
}

interface BoardListState {
  boardId: number;
  title: string;
}

interface ChatListState {
  userId: number;
  title: string;
  loaded: number;
  size: number;
  hasMore: boolean;
}

interface TopicReaderState {
  topicId: number;
  title: string;
  meta: string;
  lines: string[];
  loaded: number;
  size: number;
  hasMore: boolean;
  imageCount: number;
  linkCount: number;
}

const cc98Blue = fg(0, 130, 202);
const cc98BlueSoft = fg(94, 180, 232);
const cc98BlueBg = bg(0, 104, 176);
const white = fg(245, 250, 255);
const muted = fg(139, 152, 166);
const line = fg(52, 84, 112);
const danger = fg(245, 101, 101);
const ok = fg(91, 207, 140);

const mascot = [
  "     ▄▄▄     ▄▄▄     ▄████▄███▄▄",
  "    ███▀█▄▄▄██▀██   ▀██  ██▄  ██▄▄▄",
  "   ▄██  ▀▀▀▀▀  ▀██▄  ████▀▀▀▀▀▀▀▀███▄",
  "  █▀             ██▄██▀            ▀██▄",
  " █▀               ███▀              ▀██▄",
  "██   ██ ██         ██          ████  ███",
  "██ ▄██▀ ▀▀ ▄▄█     ██          ▀  ▀  ███",
  "██▄ ▀      ▀▀      ██               ▄███",
  " ▀██▄▄              ███▄▄         ████▀",
  "   ▀██▀▄▄▄▄         ████▀         ▀██",
  "   ██▀ █▀▀█        ▄█████▄         ██▄",
  "  ▄██  █▄ ▀█▄▄▄▄   ████▀▄█▀        ██▀",
  "  ███▄▄ ▀▀▄█████▀▄▄█████▄▄▄   ▄▄▄▄▄██",
  "   ▀▀█████████████▀▀  ▀▀███████████▀"
];

const mascotCompact = [
  "    ▄▄▄   ▄▄▄    ▄███▄▀█▄▄",
  "   ██▀█████▀██  ▀█▄ ██▄▄███▄▄",
  "  ▄█▀  ▀    ▀██ ▄██▀▀ ▀▀▀ ▀▀██",
  " █▀           ███▀           ██▄",
  "█▀  ██▄█       ██        █▄▄  ██",
  "█  ▄█▀▀▀ ▄█    ██        ▀▀▀  ██",
  "██ ▀     ▀     ██▄          ▄▄██",
  " ▀██▄▄          ████       ███▀",
  "  ▄██▀▄█▄       ███▄        ██",
  "  ██  ▄ █▄ ▄   ████▀█       ██▀",
  " ▀██  ▀█▄████  ████▀▀       ██",
  "   ▀██▄███████▀▀ ▀▀███▄█████▀"
];

const navItems: NavItem[] = [
  { id: "hot", label: "十大", hint: "热门话题" },
  { id: "favorite", label: "收藏", hint: "版面帖子" },
  { id: "new", label: "最新", hint: "新帖流" },
  { id: "boards", label: "版面", hint: "所有分区" },
  { id: "following", label: "关注", hint: "用户动态" },
  { id: "messages", label: "消息", hint: "未读与私信" },
  { id: "me", label: "我的", hint: "当前账号" }
];

export async function runTui(): Promise<void> {
  const terminal = new Terminal();
  const tokenStore = new TokenStore();
  const client = new CachedCc98Client(new Cc98Client({ tokenStore }));
  let exitRequested = false;
  const state: TuiState = {
    mode: "list",
    focus: "nav",
    navIndex: 0,
    itemIndex: 0,
    scroll: 0,
    loading: true,
    loadingMore: false,
    status: "左栏：j/k 选栏目  l/Enter 进入内容  r 刷新  q 退出",
    viewTitle: "十大",
    items: [],
    stats: [],
    overview: []
  };

  terminal.enter();

  try {
    await new Promise<void>((resolve) => {
      let closed = false;
      let loadVersion = 0;
      let currentAbort: AbortController | undefined;
      const nextSignal = () => {
        currentAbort?.abort();
        currentAbort = new AbortController();
        return currentAbort.signal;
      };
      const render = () => terminal.render(draw(state, terminal.size()));
      const load = async (force = false) => {
        const version = ++loadVersion;
        const signal = nextSignal();
        const nav = navItems[state.navIndex];
        state.viewTitle = nav.label;
        state.loading = true;
        state.error = undefined;
        state.itemIndex = 0;
        state.scroll = 0;
        state.mode = "list";
        state.items = [];
        state.stats = [];
        state.topic = undefined;
        state.parentList = undefined;
        state.currentBoard = undefined;
        state.currentChat = undefined;
        render();

        try {
          state.account = await tokenStore.getCurrentAccountName();
          const next = await loadView(client, nav.id, force, signal);
          if (closed || version !== loadVersion) {
            return;
          }
          state.viewTitle = next.title;
          state.items = next.items;
          state.stats = next.stats;
          if (next.overview) {
            state.overview = next.overview;
          }
          state.status = next.status ?? listStatus(state);
        } catch (error) {
          if (isAbortError(error)) {
            return;
          }
          if (closed || version !== loadVersion) {
            return;
          }
          state.error = error instanceof Error ? error.message : String(error);
          state.items = [];
          state.stats = [];
        } finally {
          if (!closed && version === loadVersion) {
            state.loading = false;
            render();
          }
        }
      };

      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        exitRequested = true;
        currentAbort?.abort();
        offKey();
        offResize();
        resolve();
      };

      const offResize = terminal.onResize(render);
      const offKey = terminal.onKey((key) => {
        if (key === "\u0003" || key === "q") {
          close();
          return;
        }

        if (state.mode === "topic") {
          if (key === "h" || key === "\x1b[D" || key === "\x1b" || key === "\x7f") {
            currentAbort?.abort();
            state.mode = "list";
            state.focus = "content";
            state.status = listStatus(state);
            render();
            return;
          }

          if (key === "j" || key === "\x1b[B") {
            state.scroll = Math.min(Math.max(0, (state.topic?.lines.length ?? 0) - 1), state.scroll + 1);
            render();
            return;
          }

          if (key === "k" || key === "\x1b[A") {
            state.scroll = Math.max(0, state.scroll - 1);
            render();
            return;
          }

          if (key === "n" || key === " ") {
            void loadNextTopicPage(client, state, render, nextSignal());
            return;
          }

          if (key === "r") {
            if (state.topic) {
              void openTopic(client, state, state.topic.topicId, render, true, nextSignal());
            }
            return;
          }

          return;
        }

        if (state.focus === "nav") {
          if (key === "j" || key === "\x1b[B") {
            state.navIndex = Math.min(navItems.length - 1, state.navIndex + 1);
            void load();
            return;
          }

          if (key === "k" || key === "\x1b[A") {
            state.navIndex = Math.max(0, state.navIndex - 1);
            void load();
            return;
          }

          if (key === "l" || key === "\x1b[C" || key === "\t" || key === "\r") {
            if (!state.loading && state.items.length > 0) {
              state.focus = "content";
              state.status = listStatus(state);
              render();
            }
            return;
          }

          if (key === "h" || key === "\x1b[D") {
            state.status = listStatus(state);
            render();
            return;
          }

          if (key === "r") {
            void load(true);
            return;
          }

          return;
        }

        if (key === "j" || key === "\x1b[B") {
          state.itemIndex = Math.min(Math.max(0, state.items.length - 1), state.itemIndex + 1);
          render();
          return;
        }

        if (key === "k" || key === "\x1b[A") {
          state.itemIndex = Math.max(0, state.itemIndex - 1);
          render();
          return;
        }

        if ((key === "\x7f" || key === "\x1b") && state.parentList) {
          currentAbort?.abort();
          restoreParentList(state);
          render();
          return;
        }

        if (key === "h" || key === "\x1b[D" || key === "\x1b") {
          currentAbort?.abort();
          state.focus = "nav";
          state.status = listStatus(state);
          render();
          return;
        }

        if (key === "l" || key === "\r" || key === "\x1b[C") {
          const selected = state.items[state.itemIndex];
          if (selected?.topicId !== undefined) {
            void openTopic(client, state, selected.topicId, render, false, nextSignal());
            return;
          }
          if (selected?.boardId !== undefined) {
            void openBoard(client, state, selected.boardId, selected.title, render, false, nextSignal());
            return;
          }
          if (selected?.chatUserId !== undefined) {
            void openChat(client, state, selected.chatUserId, selected.title, render, false, nextSignal());
            return;
          }
          state.status = "当前条目不可继续打开；h 返回左栏，j/k 继续选择";
          render();
          return;
        }

        if ((key === "n" || key === " ") && state.currentChat) {
          void loadNextChatPage(client, state, render, nextSignal());
          return;
        }

        if (key === "r") {
          if (state.currentBoard) {
            void openBoard(
              client,
              state,
              state.currentBoard.boardId,
              state.currentBoard.title,
              render,
              true,
              nextSignal(),
              false
            );
            return;
          }
          if (state.currentChat) {
            void openChat(client, state, state.currentChat.userId, state.currentChat.title, render, true, nextSignal(), false);
            return;
          }
          void load(true);
          return;
        }
      });

      render();
      void load();
    });
  } finally {
    terminal.exit();
    process.stdout.write("\n");
    if (exitRequested) {
      process.exit(0);
    }
  }
}

async function openTopic(
  client: CachedCc98Client,
  state: TuiState,
  topicId: number,
  render: () => void,
  force = false,
  signal?: AbortSignal
): Promise<void> {
  state.mode = "topic";
  state.loading = true;
  state.loadingMore = false;
  state.error = undefined;
  state.scroll = 0;
  state.topic = {
    topicId,
    title: `#${topicId}`,
    meta: "",
    lines: [],
    loaded: 0,
    size: 10,
    hasMore: true,
    imageCount: 0,
    linkCount: 0
  };
  state.status = "正在打开帖子...";
  render();

  try {
    const [topicRaw, postsRaw] = await Promise.all([
      client.getTopic(topicId, force, signal),
      client.getTopicPosts(topicId, 0, 10, force, signal)
    ]);
    const topic = asObject(topicRaw);
    const posts = asArray(postsRaw);
    const reader = buildTopicReader(topicId, topic, posts, 10);
    state.topic = reader;
    state.viewTitle = reader.title;
    state.status = reader.hasMore
      ? "j/k 滚动  n/Space 下一页  h/Esc 返回  r 刷新"
      : "j/k 滚动  h/Esc 返回  r 刷新";
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    state.error = error instanceof Error ? error.message : String(error);
    state.status = state.parentList
      ? "版面读取失败；Esc/Backspace 返回版面列表  h 返回左栏  r 重试"
      : "版面读取失败；h 返回左栏  r 重试";
  } finally {
    state.loading = false;
    render();
  }
}

async function openBoard(
  client: CachedCc98Client,
  state: TuiState,
  boardId: number,
  boardTitle: string,
  render: () => void,
  force = false,
  signal?: AbortSignal,
  pushParent = true
): Promise<void> {
  if (pushParent) {
    state.parentList = {
      title: state.viewTitle,
      items: state.items,
      stats: state.stats,
      itemIndex: state.itemIndex,
      status: state.status
    };
  }

  state.mode = "list";
  state.focus = "content";
  state.loading = true;
  state.error = undefined;
  state.itemIndex = 0;
  state.scroll = 0;
  state.topic = undefined;
  state.currentChat = undefined;
  state.currentBoard = { boardId, title: boardTitle };
  state.viewTitle = boardTitle;
  state.items = [];
  state.stats = [
    { title: "版面", detail: `#${boardId}` },
    { title: "缓存", detail: "topics 30s" }
  ];
  state.status = "正在读取版面帖子...";
  render();

  try {
    const topics = asArray(await client.getBoardTopics(boardId, 0, 12, false, force, signal));
    state.items = topics.map((topic) => topicItem(topic));
    state.stats = [
      { title: "版面", detail: `#${boardId}` },
      { title: "主题", detail: `${topics.length} 条` },
      { title: "缓存", detail: "topics 30s" }
    ];
    state.status = "版面帖子：j/k 选择  l/Enter 打开帖子  Esc/Backspace 返回版面列表  h 返回左栏";
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.loading = false;
    render();
  }
}

async function openChat(
  client: CachedCc98Client,
  state: TuiState,
  userId: number,
  title: string,
  render: () => void,
  force = false,
  signal?: AbortSignal,
  pushParent = true
): Promise<void> {
  if (pushParent) {
    state.parentList = {
      title: state.viewTitle,
      items: state.items,
      stats: state.stats,
      itemIndex: state.itemIndex,
      status: state.status
    };
  }

  state.mode = "list";
  state.focus = "content";
  state.loading = true;
  state.error = undefined;
  state.itemIndex = 0;
  state.scroll = 0;
  state.topic = undefined;
  state.currentBoard = undefined;
  state.currentChat = { userId, title, loaded: 0, size: 10, hasMore: true };
  state.viewTitle = title;
  state.items = [];
  state.stats = [
    { title: "用户", detail: `#${userId}` },
    { title: "缓存", detail: "history 15s" }
  ];
  state.status = "正在读取私信...";
  render();

  try {
    const messages = asArray(await client.getChatHistory(userId, 0, 10, force, signal));
    state.items = chatMessageItems(messages, title, userId);
    state.currentChat.loaded = messages.length;
    state.currentChat.hasMore = messages.length === state.currentChat.size;
    state.itemIndex = Math.max(0, state.items.length - 1);
    state.stats = [
      { title: "用户", detail: `#${userId}` },
      { title: "消息", detail: `${messages.length} 条` },
      { title: "缓存", detail: "history 15s" }
    ];
    state.status = state.currentChat.hasMore
      ? "私信：j/k 滚动  n/Space 更早消息  Esc/Backspace 返回联系人  h 返回左栏"
      : "私信：j/k 滚动  Esc/Backspace 返回联系人  h 返回左栏";
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    state.error = error instanceof Error ? error.message : String(error);
    state.status = "私信读取失败；Esc/Backspace 返回联系人  h 返回左栏  r 重试";
  } finally {
    state.loading = false;
    render();
  }
}

async function loadNextChatPage(
  client: CachedCc98Client,
  state: TuiState,
  render: () => void,
  signal?: AbortSignal
): Promise<void> {
  if (!state.currentChat || state.loadingMore || !state.currentChat.hasMore) {
    return;
  }

  state.loadingMore = true;
  state.status = "正在读取更早私信...";
  render();

  try {
    const chat = state.currentChat;
    const messages = asArray(await client.getChatHistory(chat.userId, chat.loaded, chat.size, false, signal));
    const olderItems = chatMessageItems(messages, chat.title, chat.userId);
    state.items = [...olderItems, ...state.items];
    state.itemIndex += olderItems.length;
    state.scroll += olderItems.length;
    chat.loaded += messages.length;
    chat.hasMore = messages.length === chat.size;
    state.stats = [
      { title: "用户", detail: `#${chat.userId}` },
      { title: "消息", detail: `${chat.loaded} 条` },
      { title: "缓存", detail: "history 15s" }
    ];
    state.status = chat.hasMore
      ? "私信：j/k 滚动  n/Space 更早消息  Esc/Backspace 返回联系人  h 返回左栏"
      : "已到最早私信；j/k 滚动  Esc/Backspace 返回联系人  h 返回左栏";
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    state.error = error instanceof Error ? error.message : String(error);
    state.status = "更早私信读取失败；n/Space 重试  Esc/Backspace 返回联系人";
  } finally {
    state.loadingMore = false;
    render();
  }
}

function restoreParentList(state: TuiState): void {
  if (!state.parentList) {
    return;
  }
  const parent = state.parentList;
  state.mode = "list";
  state.focus = "content";
  state.loading = false;
  state.loadingMore = false;
  state.error = undefined;
  state.topic = undefined;
  state.currentBoard = undefined;
  state.currentChat = undefined;
  state.parentList = undefined;
  state.viewTitle = parent.title;
  state.items = parent.items;
  state.stats = parent.stats;
  state.itemIndex = parent.itemIndex;
  state.status = parent.status;
}

async function loadNextTopicPage(
  client: CachedCc98Client,
  state: TuiState,
  render: () => void,
  signal?: AbortSignal
): Promise<void> {
  if (!state.topic || state.loadingMore || !state.topic.hasMore) {
    return;
  }

  state.loadingMore = true;
  state.status = "正在加载下一页...";
  render();

  try {
    const posts = asArray(await client.getTopicPosts(state.topic.topicId, state.topic.loaded, state.topic.size, false, signal));
    const next = renderPosts(posts, Math.max(36, currentTopicWidthEstimate()));
    state.topic.lines.push(...next.lines);
    state.topic.imageCount += next.imageCount;
    state.topic.linkCount += next.linkCount;
    state.topic.loaded += posts.length;
    state.topic.hasMore = posts.length === state.topic.size;
    state.status = state.topic.hasMore
      ? "j/k 滚动  n/Space 下一页  h/Esc 返回  r 刷新"
      : "已到最后一页  j/k 滚动  h/Esc 返回  r 刷新";
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.loadingMore = false;
    render();
  }
}

function currentTopicWidthEstimate(): number {
  return Number(process.env.COLUMNS) > 90 ? 56 : 44;
}

function buildTopicReader(topicId: number, topic: Record<string, unknown>, posts: unknown[], size: number): TopicReaderState {
  const title = String(topic.title ?? `#${topicId}`);
  const meta = [
    topic.userName,
    topic.replyCount !== undefined ? `${topic.replyCount} 回复` : undefined,
    topic.hitCount !== undefined ? `${topic.hitCount} 浏览` : undefined
  ].filter(Boolean).join(" · ");
  const rendered = renderPosts(posts, currentTopicWidthEstimate());

  return {
    topicId,
    title,
    meta,
    lines: rendered.lines,
    loaded: posts.length,
    size,
    hasMore: posts.length === size,
    imageCount: rendered.imageCount,
    linkCount: rendered.linkCount
  };
}

function renderPosts(posts: unknown[], width: number): { lines: string[]; imageCount: number; linkCount: number } {
  const lines: string[] = [];
  let imageCount = 0;
  let linkCount = 0;

  posts.forEach((postRaw) => {
    const post = asObject(postRaw);
    const floor = post.floor !== undefined ? `#${post.floor}` : "#?";
    const author = String(post.userName ?? "匿名");
    const time = typeof post.time === "string" ? post.time.replace("T", " ").slice(0, 16) : "";
    const like = post.likeCount !== undefined ? ` · ${post.likeCount} 赞` : "";
    lines.push(`${floor} ${author}${time ? ` · ${time}` : ""}${like}`);
    lines.push("─".repeat(Math.max(8, width)));

    const content = typeof post.content === "string" ? post.content : "";
    const rendered = renderUbbToLines(content, width);
    lines.push(...rendered.lines);
    lines.push("");
    imageCount += rendered.images.length;
    linkCount += rendered.links.length;
  });

  return { lines, imageCount, linkCount };
}

async function loadView(client: CachedCc98Client, view: ViewId, force: boolean, signal?: AbortSignal): Promise<{
  title: string;
  items: ContentItem[];
  stats: ContentItem[];
  overview?: ContentItem[];
  status?: string;
}> {
  switch (view) {
    case "hot": {
      const [index, unread] = await Promise.all([
        client.getForumIndex(force, signal),
        client.getUnreadCount(force, signal)
      ]);
      const indexObject = asObject(index);
      const unreadObject = asObject(unread);
      const hotTopics = asArray(indexObject.hotTopic ?? indexObject.manualHotTopic);
      return {
        title: "十大",
        items: hotTopics.map((topic) => topicItem(topic)),
        stats: unreadStats(unreadObject),
        overview: overviewStats(indexObject, unreadObject)
      };
    }
    case "new": {
      const topics = asArray(await client.getNewTopics(0, 12, force, signal));
      return {
        title: "最新",
        items: topics.map((topic) => topicItem(topic)),
        stats: [{ title: "新帖流", detail: `${topics.length} 条` }]
      };
    }
    case "boards": {
      const sections = asArray(await client.getAllBoards(force, signal));
      const boards = flattenBoards(sections).slice(0, 14);
      return {
        title: "版面",
        items: boards,
        stats: [{ title: "分区", detail: `${sections.length}` }, { title: "版面", detail: `${flattenBoards(sections).length}` }],
        status: "版面：j/k 选择  l/Enter 读取该版主题  h 返回左栏  r 刷新"
      };
    }
    case "following": {
      const topics = asArray(await client.getFolloweeTopics(0, 12, force, signal));
      return {
        title: "关注",
        items: topics.map((topic) => topicItem(topic)),
        stats: [
          { title: "关注动态", detail: `${topics.length} 条` },
          { title: "缓存", detail: "30s" }
        ],
        status: "关注用户动态：j/k 选择  l/Enter 打开帖子  h 返回左栏  r 刷新"
      };
    }
    case "favorite": {
      const [meRaw, sectionsRaw] = await Promise.all([
        client.getMe(force, signal),
        client.getAllBoards(false, signal)
      ]);
      const customBoards = asArray(asObject(meRaw).customBoards).filter((id): id is number => typeof id === "number");
      const allBoards = flattenBoards(asArray(sectionsRaw));
      const boardById = new Map(allBoards.filter((board) => board.boardId !== undefined).map((board) => [board.boardId, board]));
      const topicGroups = await mapLimit(customBoards, 3, async (boardId) => {
        const board = boardById.get(boardId);
        const topics = asArray(await client.getBoardTopics(boardId, 0, 3, false, force, signal));
        return topics.map((topic) => topicItem(topic, board));
      });
      const items = topicGroups.flat().sort((left, right) => (right.sortTime ?? 0) - (left.sortTime ?? 0)).slice(0, 18);
      return {
        title: "收藏",
        items,
        stats: [
          { title: "收藏版面", detail: `${customBoards.length} 个` },
          { title: "主题", detail: `${items.length} 条` },
          { title: "缓存", detail: "boards 24h / topics 30s" }
        ],
        status: "收藏版面帖子：j/k 选择  l/Enter 打开帖子  h 返回左栏  r 刷新"
      };
    }
    case "messages": {
      const [unread, recent] = await Promise.all([
        client.getUnreadCount(force, signal),
        client.getRecentChats(0, 10, force, signal)
      ]);
      const unreadObject = asObject(unread);
      const chats = asArray(recent);
      const userNames = await loadChatUserNames(client, chats, force, signal);
      return {
        title: "消息",
        items: chats.length > 0 ? chats.map((chat) => chatItem(chat, userNames)) : [{ title: "暂无最近私信", meta: "recent-contact-users" }],
        stats: unreadStats(unreadObject),
        status: "私信联系人：j/k 选择  l/Enter 打开会话  h 返回左栏  r 刷新"
      };
    }
    case "me": {
      const me = asObject(await client.getMe(force, signal));
      return {
        title: "我的",
        items: [
          item("昵称", me.name),
          item("用户 ID", me.id),
          item("等级", me.levelTitle ?? me.groupName),
          item("发帖数", me.postCount),
          item("财富", me.wealth),
          item("关注", me.followCount),
          item("粉丝", me.fanCount)
        ],
        stats: [{ title: "登录状态", detail: "已登录" }]
      };
    }
  }
}

function draw(state: TuiState, size: { columns: number; rows: number }): string {
  const width = Math.max(60, size.columns);
  const height = Math.max(20, size.rows);
  const sidebarWidth = width < 90 ? 14 : 18;
  const rightWidth = width < 78 ? 0 : Math.min(42, Math.max(34, Math.floor(width * 0.30)));
  const mainWidth = width - sidebarWidth - rightWidth - (rightWidth > 0 ? 2 : 1);
  const overviewHeight = height < 24 ? 1 : 2;
  const bodyHeight = height - 4 - overviewHeight;
  const lines: string[] = [];

  lines.push(header(width, state));
  lines.push(`${line}${"─".repeat(width)}${ansi.reset}`);
  lines.push(...drawOverview(state, width, overviewHeight));

  const sidebar = drawSidebar(state, sidebarWidth, bodyHeight);
  const main = drawMain(state, mainWidth, bodyHeight);
  const right = rightWidth > 0 ? drawRight(state, rightWidth, bodyHeight) : [];

  for (let row = 0; row < bodyHeight; row += 1) {
    const parts = [
      sidebar[row] ?? " ".repeat(sidebarWidth),
      `${line}│${ansi.reset}`,
      main[row] ?? " ".repeat(mainWidth)
    ];

    if (rightWidth > 0) {
      parts.push(`${line}│${ansi.reset}`, right[row] ?? " ".repeat(rightWidth));
    }

    lines.push(parts.join(""));
  }

  lines.push(`${line}${"─".repeat(width)}${ansi.reset}`);
  lines.push(fit(`${muted}${state.status}${ansi.reset}`, width));
  return lines.slice(0, height).join("\n");
}

function header(width: number, state: TuiState): string {
  const account = state.account ? `@${state.account}` : "未登录";
  const title = `${cc98BlueBg}${white}${ansi.bold} CC98 ${ansi.reset}${cc98BlueBg}${white} ${state.viewTitle} ${ansi.reset}`;
  const right = `${muted}${account}${ansi.reset}`;
  return fit(`${title}${" ".repeat(Math.max(1, width - cellWidth(title) - cellWidth(right)))}${right}`, width);
}

function drawOverview(state: TuiState, width: number, height: number): string[] {
  const rows: string[] = [];
  const summary = state.overview.length > 0
    ? state.overview.map((entry) => `${entry.title} ${entry.detail ?? "-"}`).join("  ")
    : "全站概览会在读取十大时更新";
  rows.push(fit(`${cc98BlueSoft} ${summary}${ansi.reset}`, width));

  if (height > 1) {
    rows.push(`${line}${"─".repeat(width)}${ansi.reset}`);
  }

  return rows.slice(0, height);
}

function drawSidebar(state: TuiState, width: number, height: number): string[] {
  const rows: string[] = [];
  for (let index = 0; index < height; index += 1) {
    const nav = navItems[index];
    if (!nav) {
      rows.push(" ".repeat(width));
      continue;
    }

    const active = index === state.navIndex;
    const focused = state.focus === "nav";
    const label = ` ${nav.label}`;
    const hint = width > 16 ? ` ${nav.hint}` : "";
    const text = fit(`${label}${hint}`, width);
    if (active && focused) {
      rows.push(`${bg(0, 130, 202)}${white}${text}${ansi.reset}`);
    } else if (active) {
      rows.push(`${bg(5, 46, 74)}${cc98BlueSoft}${text}${ansi.reset}`);
    } else {
      rows.push(`${cc98Blue}${label}${ansi.reset}${muted}${fit(hint, Math.max(0, width - cellWidth(label)))}${ansi.reset}`);
    }
  }
  return rows;
}

function drawMain(state: TuiState, width: number, height: number): string[] {
  if (state.mode === "topic") {
    return drawTopic(state, width, height);
  }

  if (state.loading) {
    return [
      `${cc98Blue}${ansi.bold} ${state.viewTitle}${ansi.reset}`,
      fit(`${muted} 正在加载...${ansi.reset}`, width),
      `${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`,
      `${muted} ${"· ".repeat(Math.max(1, Math.floor((width - 2) / 2))).slice(0, width - 1)}${ansi.reset}`
    ].concat(blank(height - 4, width)).slice(0, height);
  }

  if (state.error) {
    return [
      `${cc98Blue}${ansi.bold} ${state.viewTitle}${ansi.reset}`,
      `${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`,
      `${danger} 请求失败${ansi.reset}`,
      fit(` ${state.error}`, width)
    ].concat(blank(height - 4, width)).slice(0, height);
  }

  const rows: string[] = [];
  rows.push(`${cc98Blue}${ansi.bold} ${state.viewTitle}${ansi.reset}`);
  rows.push(fit(`${muted} ${state.focus === "content" ? "内容栏" : "按 l/Enter 进入内容栏"}${ansi.reset}`, width));
  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);

  const visibleCapacity = Math.max(1, Math.floor(Math.max(1, height - 3) / 3));
  if (state.itemIndex < state.scroll) {
    state.scroll = state.itemIndex;
  } else if (state.itemIndex >= state.scroll + visibleCapacity) {
    state.scroll = state.itemIndex - visibleCapacity + 1;
  }
  const visible = state.items.slice(state.scroll);
  visible.forEach((itemValue, offset) => {
    if (rows.length >= height) {
      return;
    }
    const index = state.scroll + offset;
    const active = index === state.itemIndex && state.focus === "content";
    const prefix = active ? `${ok}●${ansi.reset}` : `${muted}•${ansi.reset}`;
    const title = fit(` ${itemValue.title}`, Math.max(10, width - 2));
    rows.push(active ? `${bg(5, 46, 74)}${prefix}${title}${ansi.reset}` : fit(`${prefix}${title}`, width));

    if (itemValue.meta && rows.length < height) {
      rows.push(fit(`  ${muted}${itemValue.meta}${ansi.reset}`, width));
    }

    if (itemValue.detail && rows.length < height) {
      rows.push(fit(`  ${itemValue.detail}`, width));
    }
  });

  if (visible.length === 0) {
    rows.push(`${muted} 暂无数据${ansi.reset}`);
  }

  if (state.scroll + visibleCapacity < state.items.length && rows.length < height) {
    rows.push(fit(`${muted}  ↓ 还有 ${state.items.length - state.scroll - visibleCapacity} 项${ansi.reset}`, width));
  }

  return rows.concat(blank(height - rows.length, width)).slice(0, height);
}

function drawTopic(state: TuiState, width: number, height: number): string[] {
  if (state.loading && (!state.topic || state.topic.lines.length === 0)) {
    return [
      `${cc98Blue} 正在打开帖子...${ansi.reset}`,
      "",
      `${muted} 只加载第一页，不预取未读楼层。${ansi.reset}`
    ].concat(blank(height - 3, width)).slice(0, height);
  }

  if (state.error) {
    return [
      `${danger} 读取帖子失败${ansi.reset}`,
      fit(` ${state.error}`, width),
      "",
      `${muted} h/Esc 返回列表${ansi.reset}`
    ].concat(blank(height - 4, width)).slice(0, height);
  }

  const topic = state.topic;
  if (!topic) {
    return blank(height, width);
  }

  const rows: string[] = [];
  rows.push(`${cc98Blue}${ansi.bold} ${topic.title}${ansi.reset}`);
  rows.push(fit(`${muted} ${topic.meta}${ansi.reset}`, width));
  rows.push(`${line}${"─".repeat(Math.max(0, width - 1))}${ansi.reset}`);

  const viewport = Math.max(0, height - rows.length - 1);
  const maxScroll = Math.max(0, topic.lines.length - viewport);
  state.scroll = Math.min(state.scroll, maxScroll);
  const body = topic.lines.slice(state.scroll, state.scroll + viewport);

  for (const bodyLine of body) {
    if (bodyLine.startsWith("[image ")) {
      rows.push(fit(`${cc98BlueSoft}${bodyLine}${ansi.reset}`, width));
    } else if (bodyLine.startsWith("│ ")) {
      rows.push(fit(`${muted}${bodyLine}${ansi.reset}`, width));
    } else if (/^#\d+ /.test(bodyLine)) {
      rows.push(fit(`${ok}${bodyLine}${ansi.reset}`, width));
    } else {
      rows.push(fit(` ${bodyLine}`, width));
    }
  }

  const pageInfo = topic.hasMore
    ? `已载入 ${topic.loaded} 楼，n 下一页`
    : `已载入 ${topic.loaded} 楼，已到底`;
  rows.push(fit(`${muted}${pageInfo}${state.loadingMore ? " · 加载中" : ""}${ansi.reset}`, width));
  return rows.concat(blank(height - rows.length, width)).slice(0, height);
}

function drawRight(state: TuiState, width: number, height: number): string[] {
  const rows: string[] = [];
  rows.push(`${cc98Blue}${ansi.bold} CC98${ansi.reset}`);
  const art = width < 40 ? mascotCompact : mascot;
  rows.push(...art.map((row) => fit(`${white}${row}${ansi.reset}`, width)));
  rows.push(`${line}${"─".repeat(width)}${ansi.reset}`);

  const stats = state.mode === "topic" && state.topic
    ? [
        { title: "楼层", detail: String(state.topic.loaded) },
        { title: "图片", detail: String(state.topic.imageCount) },
        { title: "链接", detail: String(state.topic.linkCount) },
        { title: "缓存", detail: "meta 60s / posts 60s-10m" }
      ]
    : state.stats;

  stats.slice(0, Math.max(0, height - rows.length)).forEach((stat) => {
    rows.push(fit(`${muted}${stat.title}${ansi.reset}`, width));
    if (stat.detail) {
      rows.push(fit(`${cc98BlueSoft}${stat.detail}${ansi.reset}`, width));
    }
  });

  const selected = state.mode === "list" ? state.items[state.itemIndex] : undefined;
  if (selected && height - rows.length >= 4) {
    while (height - rows.length > 4) {
      rows.push(" ".repeat(width));
    }
    rows.push(`${line}${"─".repeat(width)}${ansi.reset}`);
    rows.push(fit(`${muted}选中${ansi.reset}`, width));
    rows.push(fit(`${cc98BlueSoft}${selected.title}${ansi.reset}`, width));
    rows.push(fit(`${muted}${selected.meta ? `归属 ${selected.meta}` : selected.boardId ? `版面 #${selected.boardId}` : ""}${ansi.reset}`, width));
  }

  return rows.concat(blank(height - rows.length, width)).slice(0, height);
}

function item(title: string, value: unknown, meta?: string): ContentItem {
  return {
    title,
    meta,
    detail: value === undefined || value === null ? "-" : String(value)
  };
}

function topicItem(value: unknown, fallbackBoard?: ContentItem): ContentItem {
  const topic = asObject(value);
  const topicId = asNumber(topic.id ?? topic.Id);
  const boardId = asNumber(topic.boardId ?? topic.BoardId) ?? fallbackBoard?.boardId;
  const boardName = topic.boardName ?? topic.BoardName ?? fallbackBoard?.title;
  return {
    title: String(topic.title ?? topic.Title ?? `#${topicId ?? ""}`),
    meta: [
      boardName,
      topic.userName ?? topic.authorName,
      topic.replyCount !== undefined ? `${topic.replyCount} 回复` : undefined,
      topic.hitCount !== undefined ? `${topic.hitCount} 浏览` : undefined
    ]
      .filter(Boolean)
      .join(" · "),
    detail: typeof topic.lastPostContent === "string" ? topic.lastPostContent.replace(/\s+/g, " ") : undefined,
    topicId,
    boardId,
    sortTime: timestampOf(topic.lastPostTime ?? topic.updateTime ?? topic.time ?? topic.createTime)
  };
}

async function loadChatUserNames(client: CachedCc98Client, chats: unknown[], force: boolean, signal?: AbortSignal): Promise<Map<number, string>> {
  const ids = chats
    .map((chat) => asNumber(asObject(chat).userId ?? asObject(chat).UserId))
    .filter((id): id is number => id !== undefined);
  const users = asArray(await client.getBasicUsers(ids, force, signal));
  return new Map(users.map((userRaw) => {
    const user = asObject(userRaw);
    const id = asNumber(user.id ?? user.Id);
    const name = String(user.name ?? user.Name ?? (id !== undefined ? `#${id}` : "用户"));
    return [id, name] as const;
  }).filter((entry): entry is readonly [number, string] => entry[0] !== undefined));
}

function chatItem(value: unknown, userNames: Map<number, string>): ContentItem {
  const chat = asObject(value);
  const userId = asNumber(chat.userId ?? chat.UserId);
  const name = userId !== undefined ? userNames.get(userId) : undefined;
  return {
    title: String(name ?? chat.name ?? chat.userName ?? userId ?? "私信"),
    meta: userId !== undefined ? `user #${userId}` : undefined,
    detail: normalizeInline(String(chat.lastContent ?? chat.lastMessage ?? chat.content ?? "")),
    chatUserId: userId
  };
}

function chatMessageItems(messages: unknown[], otherName: string, otherUserId: number): ContentItem[] {
  return [...messages].reverse().map((messageRaw) => {
    const message = asObject(messageRaw);
    const receiverId = asNumber(message.receiverId ?? message.ReceiverId);
    const isMine = receiverId === otherUserId;
    const time = typeof message.time === "string"
      ? message.time.replace("T", " ").slice(0, 16)
      : "";
    const content = normalizeInline(String(message.content ?? message.Content ?? ""));
    return {
      title: isMine ? `我 -> ${otherName}` : `${otherName} -> 我`,
      meta: [time, receiverId !== undefined ? `receiver #${receiverId}` : undefined].filter(Boolean).join(" · "),
      detail: content || "(空消息)"
    };
  });
}

function unreadStats(value: Record<string, unknown>): ContentItem[] {
  return [
    item("系统", value.systemCount),
    item("@", value.atCount),
    item("回复", value.replyCount),
    item("私信", value.messageCount)
  ];
}

function overviewStats(index: Record<string, unknown>, unread: Record<string, unknown>): ContentItem[] {
  const unreadTotal = ["systemCount", "atCount", "replyCount", "messageCount"].reduce((total, key) => {
    const value = unread[key];
    return total + (typeof value === "number" ? value : 0);
  }, 0);
  return [
    item("今日主题", index.todayTopicCount),
    item("今日回复", index.todayCount),
    item("在线", index.onlineUserCount),
    item("用户", index.userCount),
    item("未读", unreadTotal)
  ];
}

async function mapLimit<T, R>(values: T[], limit: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function listStatus(state: TuiState): string {
  if (state.currentBoard) {
    return "版面帖子：j/k 选择  l/Enter 打开帖子  Esc/Backspace 返回版面列表  h 返回左栏";
  }
  if (state.currentChat) {
    return state.currentChat.hasMore
      ? "私信：j/k 滚动  n/Space 更早消息  Esc/Backspace 返回联系人  h 返回左栏"
      : "私信：j/k 滚动  Esc/Backspace 返回联系人  h 返回左栏";
  }
  if (state.focus === "nav") {
    return "左栏：j/k 选栏目  l/Enter 进入内容  r 刷新  q 退出";
  }
  return "内容：j/k 选择  l/Enter 打开帖子/版面/私信  h 返回左栏  r 刷新  q 退出";
}

function flattenBoards(sections: unknown[]): ContentItem[] {
  const boards: ContentItem[] = [];
  for (const section of sections) {
    const sectionObject = asObject(section);
    const sectionName = String(sectionObject.name ?? sectionObject.title ?? "分区");
    const candidates = [sectionObject.boards, sectionObject.children, sectionObject.boardList];
    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }
      for (const board of candidate) {
        const boardObject = asObject(board);
        boards.push({
          title: String(boardObject.name ?? boardObject.title ?? `#${boardObject.id ?? ""}`),
          meta: `${sectionName}${boardObject.id !== undefined ? ` · #${boardObject.id}` : ""}`,
          detail: typeof boardObject.description === "string" ? boardObject.description : undefined,
          boardId: typeof boardObject.id === "number" ? boardObject.id : undefined
        });
      }
    }
  }
  return boards;
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeInline(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function timestampOf(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function blank(count: number, width: number): string[] {
  return Array.from({ length: Math.max(0, count) }, () => " ".repeat(width));
}

function fit(value: string, width: number): string {
  const truncated = truncate(value, width);
  return `${truncated}${" ".repeat(Math.max(0, width - cellWidth(truncated)))}`;
}

function truncate(value: string, width: number): string {
  let out = "";
  let used = 0;
  let inEscape = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\x1b") {
      inEscape = true;
      out += char;
      continue;
    }

    if (inEscape) {
      out += char;
      if (/[A-Za-z]/.test(char)) {
        inEscape = false;
      }
      continue;
    }

    const charWidth = charCellWidth(char);
    if (used + charWidth > width) {
      break;
    }
    out += char;
    used += charWidth;
  }

  return out;
}

function cellWidth(value: string): number {
  let width = 0;
  for (const char of stripAnsi(value)) {
    width += charCellWidth(char);
  }
  return width;
}

function charCellWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code === 0) {
    return 0;
  }
  if (
    code >= 0x1100 &&
    (code <= 0x115f ||
      code === 0x2329 ||
      code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6))
  ) {
    return 2;
  }
  return 1;
}
