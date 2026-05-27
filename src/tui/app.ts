import { Cc98Client } from "../api/client.js";
import { TokenStore } from "../storage/token-store.js";
import { checkForUpdate } from "../update.js";
import { appVersion } from "../version.js";
import { ansi, bg, fg, stripAnsi } from "./ansi.js";
import { CachedCc98Client } from "./cached-client.js";
import { Terminal } from "./terminal.js";
import { renderUbbToLines } from "./ubb-renderer.js";

type ViewId = "hot" | "new" | "boards" | "following" | "favorite" | "messages" | "notices" | "me" | "more" | "settings";
type FocusColumn = "nav" | "content";
type ModalType = "menu" | "help" | "search" | "user" | "info" | null;
type TabId = "default" | "posts" | "boards" | "chat" | "notices" | "history" | "followers" | "followees" | "favorites" | "signin" | "my-topics";
type SearchMode = "topics" | "users";
type NoticeType = "system" | "at" | "reply";

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
  userId?: number;
  action?: string;
  sortTime?: number;
}

interface TuiState {
  mode: "list" | "topic" | "settings" | "user-detail";
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
  modal: ModalType;
  menuIndex: number;
  menuItems: MenuItem[];
  tabId: TabId;
  tabs: { id: TabId; label: string }[];
  searchMode: SearchMode;
  searchQuery: string;
  searchResults: ContentItem[];
  userDetail?: UserDetailState;
  noticeType: NoticeType;
  inputMode: boolean;
  inputPrompt: string;
  inputValue: string;
  inputCallback?: (value: string) => void;
  infoTitle?: string;
  infoLines: string[];
}

interface UserDetailState {
  userId: number;
  name: string;
  level?: string;
  postCount?: number;
  fanCount?: number;
  followCount?: number;
  isFollowing?: boolean;
  recentTopics?: ContentItem[];
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
  posts: TopicPostEntry[];
  loaded: number;
  size: number;
  hasMore: boolean;
  imageCount: number;
  linkCount: number;
  floorInput: string;
}

interface TopicPostEntry {
  id?: number;
  userId?: number;
  floor?: number;
  author: string;
  time: string;
  likeCount: number;
  dislikeCount: number;
  rating?: string;
  preview: string;
  lineStart: number;
  lineEnd: number;
  imageCount: number;
  linkCount: number;
  images: string[];
  links: string[];
  lines: TopicLineEntry[];
}

interface TopicLineEntry {
  line: number;
  row: number;
  floor?: number;
  kind: "header" | "divider" | "text" | "quote" | "image" | "link" | "blank";
  text: string;
  imageIndex?: number;
  imageUrl?: string;
  linkIndex?: number;
  linkUrl?: string;
}

interface MenuItem {
  label: string;
  key: string;
  action: string;
}

const cc98Blue = fg(0, 130, 202);
const cc98BlueSoft = fg(94, 180, 232);
const cc98BlueBg = bg(0, 104, 176);
const white = fg(245, 250, 255);
const muted = fg(139, 152, 166);
const line = fg(52, 84, 112);
const danger = fg(245, 101, 101);
const ok = fg(91, 207, 140);

const mascotMini = [
  "  ▄▄▄ ▄▄▄ ▄███",
  " ██▀█████▀█▄ ██",
  "█▀  ▀   ▀ ██ ██",
  "█  ██▄█  █▄▄ ██",
  "██ ▀    ████▄██",
  " ▀██▄▄██████▀"
];

const navItems: NavItem[] = [
  { id: "hot", label: "十大", hint: "热门话题" },
  { id: "favorite", label: "收藏", hint: "版面帖子" },
  { id: "new", label: "最新", hint: "新帖流" },
  { id: "boards", label: "版面", hint: "所有分区" },
  { id: "following", label: "关注", hint: "用户动态" },
  { id: "messages", label: "消息", hint: "未读与私信" },
  { id: "notices", label: "通知", hint: "系统与回复" },
  { id: "me", label: "我的", hint: "当前账号" },
  { id: "more", label: "更多", hint: "只读内容" },
  { id: "settings", label: "设置", hint: "账号与配置" }
];

const settingsItems: ContentItem[] = [
  { title: "切换账号", meta: "account", detail: "选择或管理登录账号" },
  { title: "检查更新", meta: "update", detail: "检查 CC98-CLI 新版本" },
  { title: "缓存管理", meta: "cache", detail: "查看和清理本地缓存" },
  { title: "快捷键帮助", meta: "help", detail: "查看所有可用快捷键" },
  { title: "退出登录", meta: "logout", detail: "清除本地登录信息" }
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
    status: "",
    viewTitle: "十大",
    items: [],
    stats: [],
    overview: [],
    modal: null,
    menuIndex: 0,
    menuItems: [],
    tabId: "default",
    tabs: [],
    searchMode: "topics",
    searchQuery: "",
    searchResults: [],
    noticeType: "system",
    inputMode: false,
    inputPrompt: "",
    inputValue: "",
    infoLines: []
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
        state.mode = nav.id === "settings" && state.mode === "settings" ? "settings" : "list";
        if (state.mode === "settings") {
          state.focus = "content";
        }
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
          state.status = next.status ?? getStatus(state);
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

      // Helper to get menu items for current context
      const getMenuItems = (): MenuItem[] => {
        const items: MenuItem[] = [];
        if (state.mode === "topic") {
          items.push({ label: "刷新", key: "r", action: "refresh" });
          items.push({ label: "返回列表", key: "h", action: "back" });
        } else if (state.mode === "list") {
          items.push({ label: "刷新", key: "r", action: "refresh" });
          if (state.currentBoard) {
            items.push({ label: "返回版面列表", key: "h", action: "back" });
          }
        }
        return items;
      };

      const offKey = terminal.onKey((key) => {
        // Input mode
        if (state.inputMode) {
          if (key === "\x1b") {
            state.inputMode = false;
            state.inputValue = "";
            render();
            return;
          }
          if (key === "\r") {
            if (state.inputCallback) {
              state.inputCallback(state.inputValue);
            }
            return;
          }
          if (key === "\x7f") {
            state.inputValue = state.inputValue.slice(0, -1);
            render();
            return;
          }
          if (key.length === 1 && key >= " ") {
            state.inputValue += key;
            render();
            return;
          }
          return;
        }

        // Global: Ctrl+C or q to quit
        if (key === "\u0003" || key === "q") {
          close();
          return;
        }

        // Global: ? for help
        if (key === "?") {
          state.modal = state.modal === "help" ? null : "help";
          render();
          return;
        }

        // Handle modal states
        if (state.modal === "help") {
          if (key === "h" || key === "\x1b[D" || key === "\x1b" || key === "?" || key === "\r") {
            state.modal = null;
            render();
          }
          return;
        }

        if (state.modal === "search") {
          if (key === "\x1b") {
            state.modal = null;
            state.searchQuery = "";
            render();
            return;
          }
          if (key === "\t") {
            state.searchMode = state.searchMode === "topics" ? "users" : "topics";
            state.searchResults = [];
            state.itemIndex = 0;
            render();
            return;
          }
          if ((key === "j" || key === "\x1b[B") && state.searchResults.length > 0) {
            state.itemIndex = Math.min(state.searchResults.length - 1, state.itemIndex + 1);
            render();
            return;
          }
          if ((key === "k" || key === "\x1b[A") && state.searchResults.length > 0) {
            state.itemIndex = Math.max(0, state.itemIndex - 1);
            render();
            return;
          }
          if (key === "\r") {
            const selected = state.searchResults[state.itemIndex];
            if (selected) {
              state.modal = null;
              void activateContentItem(client, state, selected, render, nextSignal());
            } else if (state.searchQuery.trim()) {
              void performSearch(client, state, render, nextSignal());
            }
            return;
          }
          if (key === "\x7f") {
            state.searchQuery = state.searchQuery.slice(0, -1);
            state.searchResults = [];
            state.itemIndex = 0;
            render();
            return;
          }
          if (key.length === 1 && key >= " ") {
            state.searchQuery += key;
            state.searchResults = [];
            state.itemIndex = 0;
            render();
            return;
          }
          return;
        }

        if (state.modal === "info") {
          if (key === "h" || key === "\x1b[D" || key === "\x1b" || key === "\r" || key === "q") {
            state.modal = null;
            state.infoTitle = undefined;
            state.infoLines = [];
            render();
          }
          return;
        }

        if (state.modal === "user") {
          if (key === "\x1b") {
            state.modal = null;
            state.userDetail = undefined;
            render();
            return;
          }
          if (key === "f" && state.userDetail) {
            void toggleFollow(client, state, render);
            return;
          }
          if (key === "m" && state.userDetail) {
            state.inputMode = true;
            state.inputPrompt = `发送私信给 ${state.userDetail.name}: `;
            state.inputValue = "";
            state.inputCallback = (value: string) => {
              if (value.trim() && state.userDetail) {
                void sendPrivateMessage(client, state, state.userDetail.userId, value.trim(), render);
              }
              state.inputMode = false;
              state.inputValue = "";
              render();
            };
            render();
            return;
          }
          return;
        }

        if (state.modal === "menu") {
          if (key === "j" || key === "\x1b[B") {
            state.menuIndex = Math.min(state.menuItems.length - 1, state.menuIndex + 1);
            render();
            return;
          }
          if (key === "k" || key === "\x1b[A") {
            state.menuIndex = Math.max(0, state.menuIndex - 1);
            render();
            return;
          }
          if (key === "\r" || key === "l" || key === "\x1b[C") {
            const selected = state.menuItems[state.menuIndex];
            state.modal = null;
            if (selected?.action === "refresh") {
              void load(true);
            } else if (selected?.action === "back") {
              if (state.mode === "topic") {
                currentAbort?.abort();
                state.mode = "list";
                state.focus = "content";
                state.status = getStatus(state);
                render();
              } else if (state.parentList) {
                currentAbort?.abort();
                restoreParentList(state);
                render();
              }
            }
            return;
          }
          if (key === "h" || key === "\x1b[D" || key === "\x1b" || key === "o") {
            state.modal = null;
            render();
            return;
          }
          return;
        }

        // Topic mode
        if (state.mode === "topic") {
          if (/^\d$/.test(key) && state.topic) {
            state.topic.floorInput = `${state.topic.floorInput}${key}`.slice(0, 6);
            state.status = `跳转到 ${state.topic.floorInput} 楼：Enter 确认  Esc 取消`;
            render();
            return;
          }
          if (key === "\x7f" && state.topic?.floorInput) {
            state.topic.floorInput = state.topic.floorInput.slice(0, -1);
            state.status = state.topic.floorInput
              ? `跳转到 ${state.topic.floorInput} 楼：Enter 确认  Esc 取消`
              : getStatus(state);
            render();
            return;
          }
          if (key === "\r" && state.topic?.floorInput) {
            const floor = Number(state.topic.floorInput);
            state.topic.floorInput = "";
            if (Number.isInteger(floor) && floor > 0) {
              void jumpToTopicFloor(client, state, floor, render, nextSignal());
            }
            return;
          }
          if ((key === "]" || key === "】") && state.topic) {
            jumpRelativeTopicFloor(state, 1);
            state.status = getStatus(state);
            render();
            return;
          }
          if ((key === "[" || key === "【") && state.topic) {
            jumpRelativeTopicFloor(state, -1);
            state.status = getStatus(state);
            render();
            return;
          }
          if (key === "h" || key === "\x1b[D") {
            currentAbort?.abort();
            state.mode = "list";
            state.focus = "content";
            state.status = getStatus(state);
            render();
            return;
          }
          if (key === "\x1b" && state.topic?.floorInput) {
            state.topic.floorInput = "";
            state.status = getStatus(state);
            render();
            return;
          }
          if (key === "j" || key === "\x1b[B") {
            const maxScroll = Math.max(0, (state.topic?.lines.length ?? 0) - 1);
            const wasAtEnd = state.scroll >= maxScroll;
            state.scroll = Math.min(maxScroll, state.scroll + 1);
            render();
            if (wasAtEnd && state.topic?.hasMore && !state.loadingMore) {
              void loadNextTopicPage(client, state, render, nextSignal(), true);
            }
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
          if (key === "s" && state.topic) {
            void toggleFavorite(client, state, render);
            return;
          }
          if (key === "l" && state.topic) {
            void reactToCurrentPost(client, state, true, render);
            return;
          }
          if (key === "d" && state.topic) {
            void reactToCurrentPost(client, state, false, render);
            return;
          }
          if (key === "u" && state.topic) {
            void showUserDetail(client, state, render, nextSignal());
            return;
          }
          if (key === "v" && state.topic) {
            void showTopicVote(client, state, render, nextSignal());
            return;
          }
          if (key === "a" && state.topic) {
            void showPostReactionState(client, state, render, nextSignal());
            return;
          }
          if (key === "o") {
            state.modal = "menu";
            state.menuItems = getMenuItems();
            state.menuIndex = 0;
            render();
            return;
          }
          return;
        }

        // Settings mode
        if (state.mode === "settings") {
          if (key === "j" || key === "\x1b[B") {
            state.itemIndex = Math.min(settingsItems.length - 1, state.itemIndex + 1);
            render();
            return;
          }
          if (key === "k" || key === "\x1b[A") {
            state.itemIndex = Math.max(0, state.itemIndex - 1);
            render();
            return;
          }
          if (key === "h" || key === "\x1b[D") {
            state.mode = "list";
            state.focus = "nav";
            state.status = getStatus(state);
            render();
            return;
          }
          if (key === "l" || key === "\x1b[C" || key === "\r") {
            const selected = settingsItems[state.itemIndex];
            if (selected?.meta === "help") {
              state.modal = "help";
              render();
            } else if (selected?.meta === "cache") {
              state.status = "正在清理缓存...";
              render();
              void client.clearCache().then(() => {
                state.status = "缓存已清理";
                void load(true);
              }).catch(() => {
                state.status = "缓存清理失败";
                render();
              });
            } else if (selected?.meta === "logout") {
              state.status = "退出登录功能开发中...";
              render();
            } else if (selected?.meta === "account") {
              state.status = "账号切换功能开发中...";
              render();
            } else if (selected?.meta === "update") {
              state.status = "正在检查 GitHub Release...";
              render();
              void checkForUpdate().then((result) => {
                state.status = result.message;
                render();
              }).catch((error: unknown) => {
                state.status = error instanceof Error ? error.message : "检查更新失败";
                render();
              });
            }
            return;
          }
          return;
        }

        // Nav focus
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
          if (key === "l" || key === "\x1b[C") {
            if (!state.loading && state.items.length > 0) {
              if (navItems[state.navIndex]?.id === "settings") {
                state.mode = "settings";
              }
              state.focus = "content";
              state.status = getStatus(state);
              render();
            }
            return;
          }
          if (key === "\r") {
            if (!state.loading && state.items.length > 0) {
              if (navItems[state.navIndex]?.id === "settings") {
                state.mode = "settings";
              }
              state.focus = "content";
              state.itemIndex = 0;
              state.status = getStatus(state);
              render();
            }
            return;
          }
          if (key === "r") {
            void load(true);
            return;
          }
          return;
        }

        // Content focus
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
        if (key === "h" || key === "\x1b[D") {
          if (state.parentList) {
            currentAbort?.abort();
            restoreParentList(state);
            render();
          } else {
            currentAbort?.abort();
            state.focus = "nav";
            state.status = getStatus(state);
            render();
          }
          return;
        }
        if (key === "\x1b") {
          if (state.parentList) {
            currentAbort?.abort();
            restoreParentList(state);
            render();
          } else {
            currentAbort?.abort();
            state.focus = "nav";
            state.status = getStatus(state);
            render();
          }
          return;
        }
        if (key === "l" || key === "\x1b[C") {
          const selected = state.items[state.itemIndex];
          if (selected) {
            void activateContentItem(client, state, selected, render, nextSignal());
            return;
          }
          state.status = "当前条目不可进入";
          render();
          return;
        }
        if (key === "\r") {
          const selected = state.items[state.itemIndex];
          if (selected) {
            void activateContentItem(client, state, selected, render, nextSignal());
            return;
          }
          state.status = "当前条目不可进入";
          render();
          return;
        }
        if ((key === "n" || key === " ") && state.currentChat) {
          void loadNextChatPage(client, state, render, nextSignal());
          return;
        }
        if (key === "r") {
          if (state.currentBoard) {
            void openBoard(client, state, state.currentBoard.boardId, state.currentBoard.title, render, true, nextSignal(), false);
            return;
          }
          if (state.currentChat) {
            void openChat(client, state, state.currentChat.userId, state.currentChat.title, render, true, nextSignal(), false);
            return;
          }
          void load(true);
          return;
        }
        if (key === "/") {
          state.modal = "search";
          state.searchQuery = "";
          state.searchResults = [];
          state.searchMode = "topics";
          render();
          return;
        }
        if (key === "o") {
          state.modal = "menu";
          state.menuItems = getMenuItems();
          state.menuIndex = 0;
          render();
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
    posts: [],
    loaded: 0,
    size: 10,
    hasMore: true,
    imageCount: 0,
    linkCount: 0,
    floorInput: ""
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
    state.items = [
      { title: "精华帖", meta: `board #${boardId}`, detail: "查看本版精华主题", action: `board-best:${boardId}` },
      ...topics.map((topic) => topicItem(topic))
    ];
    state.stats = [
      { title: "版面", detail: `#${boardId}` },
      { title: "主题", detail: `${topics.length} 条` },
      { title: "缓存", detail: "topics 30s" }
    ];
    state.status = "版面帖子：j/k 选择  l 打开帖子  h 返回  r 刷新";
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
  signal?: AbortSignal,
  advanceAfterLoad = false
): Promise<void> {
  if (!state.topic || state.loadingMore || !state.topic.hasMore) {
    return;
  }

  state.loadingMore = true;
  state.status = "正在加载下一页...";
  render();

  try {
    const posts = asArray(await client.getTopicPosts(state.topic.topicId, state.topic.loaded, state.topic.size, false, signal));
    const next = renderPosts(posts, Math.max(36, currentTopicWidthEstimate()), state.topic.lines.length);
    state.topic.lines.push(...next.lines);
    state.topic.posts.push(...next.posts);
    state.topic.imageCount += next.imageCount;
    state.topic.linkCount += next.linkCount;
    state.topic.loaded += posts.length;
    state.topic.hasMore = posts.length === state.topic.size;
    if (advanceAfterLoad && posts.length > 0) {
      state.scroll = Math.min(Math.max(0, state.topic.lines.length - 1), state.scroll + 1);
    }
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
    posts: rendered.posts,
    loaded: posts.length,
    size,
    hasMore: posts.length === size,
    imageCount: rendered.imageCount,
    linkCount: rendered.linkCount,
    floorInput: ""
  };
}

function renderPosts(posts: unknown[], width: number, lineOffset = 0): {
  lines: string[];
  posts: TopicPostEntry[];
  imageCount: number;
  linkCount: number;
} {
  const lines: string[] = [];
  const entries: TopicPostEntry[] = [];
  let imageCount = 0;
  let linkCount = 0;

  posts.forEach((postRaw) => {
    const post = asObject(postRaw);
    const lineStart = lineOffset + lines.length;
    const postLines: TopicLineEntry[] = [];
    const floorNumber = asNumber(post.floor);
    const floor = floorNumber !== undefined ? `#${floorNumber}` : "#?";
    const user = asObject(post.user ?? post.User);
    const userId = asNumber(post.userId ?? post.UserId ?? user.id ?? user.Id);
    const author = String(post.userName ?? post.UserName ?? user.name ?? user.Name ?? "匿名");
    const time = typeof post.time === "string" ? post.time.replace("T", " ").slice(0, 16) : "";
    const likeCount = asNumber(post.likeCount) ?? 0;
    const dislikeCount = asNumber(post.dislikeCount) ?? 0;
    const like = likeCount > 0 ? ` · ${likeCount} 赞` : "";
    const push = (
      text: string,
      kind: TopicLineEntry["kind"],
      extra: Partial<TopicLineEntry> = {}
    ) => {
      const line = lineOffset + lines.length;
      lines.push(text);
      postLines.push({
        line,
        row: postLines.length,
        floor: floorNumber,
        kind,
        text,
        ...extra
      });
    };

    push(`${floor} ${author}${time ? ` · ${time}` : ""}${like}`, "header");
    push("─".repeat(Math.max(8, width)), "divider");

    const content = typeof post.content === "string" ? post.content : "";
    const rendered = renderUbbToLines(content, width);
    rendered.lines.forEach((renderedLine) => {
      const imageIndex = parseBracketIndex(renderedLine, "image");
      const linkIndex = parseBracketIndex(renderedLine, "link");
      const kind = renderedLine.trim() === ""
        ? "blank"
        : imageIndex !== undefined
          ? "image"
          : linkIndex !== undefined
            ? "link"
            : renderedLine.startsWith("│ ")
              ? "quote"
              : "text";
      push(renderedLine, kind, {
        imageIndex,
        imageUrl: imageIndex !== undefined ? rendered.images[imageIndex - 1] : undefined,
        linkIndex,
        linkUrl: linkIndex !== undefined ? rendered.links[linkIndex - 1] : undefined
      });
    });
    push("", "blank");
    const preview = rendered.lines.find((value) =>
      value.trim() &&
      !value.startsWith("[image ") &&
      !value.startsWith("[link ")
    ) ?? "";
    entries.push({
      id: asNumber(post.id),
      userId,
      floor: floorNumber,
      author,
      time,
      likeCount,
      dislikeCount,
      rating: formatRating(post),
      preview,
      lineStart,
      lineEnd: lineOffset + lines.length - 1,
      imageCount: rendered.images.length,
      linkCount: rendered.links.length,
      images: rendered.images,
      links: rendered.links,
      lines: postLines
    });
    imageCount += rendered.images.length;
    linkCount += rendered.links.length;
  });

  return { lines, posts: entries, imageCount, linkCount };
}

async function jumpToTopicFloor(
  client: CachedCc98Client,
  state: TuiState,
  floor: number,
  render: () => void,
  signal?: AbortSignal
): Promise<void> {
  const topic = state.topic;
  if (!topic) {
    return;
  }

  const loaded = findTopicPostByFloor(topic, floor);
  if (loaded) {
    state.scroll = loaded.lineStart;
    state.status = getStatus(state);
    render();
    return;
  }

  const from = Math.floor((floor - 1) / topic.size) * topic.size;
  state.loadingMore = true;
  state.status = `正在读取 ${floor} 楼...`;
  render();

  try {
    const posts = asArray(await client.getTopicPosts(topic.topicId, from, topic.size, false, signal));
    const next = renderPosts(posts, Math.max(36, currentTopicWidthEstimate()), topic.lines.length);
    topic.lines.push(...next.lines);
    topic.posts.push(...next.posts);
    topic.posts.sort((left, right) => (left.floor ?? 0) - (right.floor ?? 0));
    topic.imageCount += next.imageCount;
    topic.linkCount += next.linkCount;
    topic.loaded = Math.max(topic.loaded, from + posts.length);
    topic.hasMore = posts.length === topic.size;
    const target = findTopicPostByFloor(topic, floor);
    if (target) {
      state.scroll = target.lineStart;
      state.status = getStatus(state);
    } else {
      state.status = `未找到 ${floor} 楼`;
    }
  } catch (error) {
    if (!isAbortError(error)) {
      state.error = error instanceof Error ? error.message : String(error);
    }
  } finally {
    state.loadingMore = false;
    render();
  }
}

function jumpRelativeTopicFloor(state: TuiState, delta: number): void {
  const topic = state.topic;
  if (!topic || topic.posts.length === 0) {
    return;
  }
  const current = currentTopicPost(topic, state.scroll);
  const currentIndex = current ? topic.posts.indexOf(current) : 0;
  const next = topic.posts[Math.min(topic.posts.length - 1, Math.max(0, currentIndex + delta))];
  if (next) {
    state.scroll = next.lineStart;
  }
}

function findTopicPostByFloor(topic: TopicReaderState, floor: number): TopicPostEntry | undefined {
  return topic.posts.find((entry) => entry.floor === floor);
}

function currentTopicPost(topic: TopicReaderState, scroll: number): TopicPostEntry | undefined {
  return topic.posts.find((entry) => scroll >= entry.lineStart && scroll <= entry.lineEnd) ??
    [...topic.posts].reverse().find((entry) => entry.lineStart <= scroll) ??
    topic.posts[0];
}

function currentTopicLine(topic: TopicReaderState, scroll: number): TopicLineEntry | undefined {
  const post = currentTopicPost(topic, scroll);
  if (!post) {
    return undefined;
  }
  return post.lines.find((entry) => entry.line === scroll) ??
    post.lines.find((entry) => entry.line > scroll && entry.kind !== "blank") ??
    post.lines.at(-1);
}

function lineKindLabel(kind: TopicLineEntry["kind"]): string {
  switch (kind) {
    case "header":
      return "楼层标题";
    case "divider":
      return "分隔线";
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

function parseBracketIndex(value: string, label: "image" | "link"): number | undefined {
  const match = new RegExp(`\\[${label} (\\d+)`).exec(value);
  return match ? Number(match[1]) : undefined;
}

function formatRating(post: Record<string, unknown>): string | undefined {
  const value = post.rating ?? post.ratingCount ?? post.wealth ?? post.score;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
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
        status: "版面：j/k 选择  l 进入版面  h 返回  r 刷新"
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
        status: "关注：j/k 选择  l 打开帖子  h 返回  r 刷新"
      };
    }
    case "favorite": {
      const [meRaw, sectionsRaw, topicFavorites] = await Promise.all([
        client.getMe(force, signal),
        client.getAllBoards(false, signal),
        client.getFavoriteTopics(0, 6, 1, 0, force, signal)
      ]);
      const customBoards = asArray(asObject(meRaw).customBoards).filter((id): id is number => typeof id === "number");
      const allBoards = flattenBoards(asArray(sectionsRaw));
      const boardById = new Map(allBoards.filter((board) => board.boardId !== undefined).map((board) => [board.boardId, board]));
      const topicGroups = await mapLimit(customBoards, 3, async (boardId) => {
        const board = boardById.get(boardId);
        const topics = asArray(await client.getBoardTopics(boardId, 0, 3, false, force, signal));
        return topics.map((topic) => topicItem(topic, board));
      });
      const boardTopics = topicGroups.flat().sort((left, right) => (right.sortTime ?? 0) - (left.sortTime ?? 0)).slice(0, 12);
      const items = [
        { title: "收藏主题", meta: "topic/me/favorite", detail: "打开收藏夹主题列表", action: "favorite-topics" },
        { title: "收藏分组", meta: "me/favorite-topic-group", detail: "查看收藏夹分组", action: "favorite-groups" },
        ...asArray(topicFavorites).slice(0, 6).map((topic) => topicItem(topic)),
        ...boardTopics
      ];
      return {
        title: "收藏",
        items,
        stats: [
          { title: "收藏版面", detail: `${customBoards.length} 个` },
          { title: "收藏主题", detail: `${asArray(topicFavorites).length} 条` },
          { title: "版面主题", detail: `${boardTopics.length} 条` },
          { title: "缓存", detail: "boards 24h / topics 30s" }
        ],
        status: "收藏：j/k 选择  l 打开  h 返回  r 刷新"
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
        status: "消息：j/k 选择  l 打开会话  h 返回  r 刷新"
      };
    }
    case "notices": {
      const unread = asObject(await client.getUnreadCount(force, signal));
      return {
        title: "通知",
        items: [
          { title: "系统通知", meta: `${unread.systemCount ?? 0} 未读`, detail: "查看系统通知列表", action: "notices:system" },
          { title: "@ 通知", meta: `${unread.atCount ?? 0} 未读`, detail: "查看提到我的通知", action: "notices:at" },
          { title: "回复通知", meta: `${unread.replyCount ?? 0} 未读`, detail: "查看回复我的通知", action: "notices:reply" }
        ],
        stats: unreadStats(unread),
        status: "通知：j/k 选择  l 打开列表  h 返回  r 刷新"
      };
    }
    case "me": {
      const [me, cacheStats] = await Promise.all([
        client.getMe(force, signal),
        client.getCacheStats()
      ]);
      const meObject = asObject(me);
      return {
        title: "我的",
        items: [
          item("昵称", meObject.name),
          item("用户 ID", meObject.id),
          item("等级", meObject.levelTitle ?? meObject.groupName),
          item("发帖数", meObject.postCount),
          item("财富", meObject.wealth),
          item("签到", "Enter 执行", "signin"),
          { title: "我的最近主题", meta: "me/recent-topic", detail: "查看自己最近发布或回复的主题", action: "recent-topics" },
          { title: "浏览历史", meta: "me/browsing-record", detail: "查看最近浏览过的主题", action: "browse-history" },
          { title: "我的粉丝", meta: `${meObject.fanCount ?? "-"} 人`, detail: "查看粉丝列表", action: "followers" },
          { title: "我的关注", meta: `${meObject.followCount ?? "-"} 人`, detail: "查看关注列表", action: "followees" },
          item("关注", meObject.followCount),
          item("粉丝", meObject.fanCount)
        ],
        stats: [
          { title: "登录状态", detail: "已登录" }
        ]
      };
    }
    case "more": {
      return {
        title: "更多",
        items: [
          { title: "随机主题", meta: "topic/random-recent", detail: "随机读取一组最近主题", action: "random-topics" },
          { title: "我的最近主题", meta: "me/recent-topic", detail: "查看自己最近发布或回复的主题", action: "recent-topics" },
          { title: "浏览历史", meta: "me/browsing-record", detail: "查看最近浏览过的主题", action: "browse-history" },
          { title: "收藏主题", meta: "topic/me/favorite", detail: "查看收藏夹主题", action: "favorite-topics" },
          { title: "收藏更新", meta: "topic/me/favorite?order=1", detail: "查看收藏主题更新", action: "favorite-updates" },
          { title: "收藏分组", meta: "me/favorite-topic-group", detail: "查看收藏夹分组", action: "favorite-groups" },
          { title: "粉丝列表", meta: "me/follower", detail: "查看关注我的用户", action: "followers" },
          { title: "关注列表", meta: "me/followee", detail: "查看我关注的用户", action: "followees" },
          { title: "全站统计", meta: "card.cc98.org/api/collection/stat", detail: "查看论坛全站统计", action: "card-stat" },
          { title: "评分原因: 普通", meta: "post/rating-reason?type=0", detail: "查看普通评分原因", action: "rate-reasons:0" },
          { title: "评分原因: 管理", meta: "post/rating-reason?type=1", detail: "查看管理评分原因", action: "rate-reasons:1" }
        ],
        stats: [
          { title: "只读入口", detail: "11 个" },
          { title: "写入", detail: "不含发帖/回帖" }
        ],
        status: "更多：j/k 选择  l 打开只读内容  h 返回  r 刷新"
      };
    }
    case "settings": {
      const cacheStats = await client.getCacheStats();
      return {
        title: "设置",
        items: settingsItems,
        stats: [
          { title: "缓存", detail: `${cacheStats.fileCacheEntries} 文件` },
          { title: "版本", detail: `v${appVersion}` }
        ],
        status: "设置：j/k 选择  l 执行  h 返回"
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
      fit(sidebar[row] ?? "", sidebarWidth),
      `${line}│${ansi.reset}`,
      fit(main[row] ?? "", mainWidth)
    ];

    if (rightWidth > 0) {
      parts.push(`${line}│${ansi.reset}`, fit(right[row] ?? "", rightWidth));
    }

    lines.push(parts.join(""));
  }

  lines.push(`${line}${"─".repeat(width)}${ansi.reset}`);
  lines.push(drawStatusBar(state, width));

  // Draw modal overlays
  if (state.modal === "help") {
    return drawHelpModal(lines, width, height);
  }
  if (state.modal === "menu") {
    return drawMenuModal(lines, state, width, height);
  }
  if (state.modal === "search") {
    return drawSearchModal(lines, state, width, height);
  }
  if (state.modal === "user") {
    return drawUserDetailModal(lines, state, width, height);
  }
  if (state.modal === "info") {
    return drawInfoModal(lines, state, width, height);
  }

  return lines.slice(0, height).join("\n");
}

function header(width: number, state: TuiState): string {
  const account = state.account ? `@${state.account}` : "未登录";
  const title = ` CC98 ${state.viewTitle} `;
  const padding = Math.max(1, width - cellWidth(title) - cellWidth(account));
  return `${cc98BlueBg}${white}${ansi.bold}${fit(`${title}${" ".repeat(padding)}${account}`, width)}${ansi.reset}`;
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
    const active = index === state.itemIndex && (state.focus === "content" || state.mode === "settings");
    const prefix = active ? `${ok}●${ansi.reset}` : `${muted}•${ansi.reset}`;
    const title = fit(` ${itemValue.title}`, Math.max(10, width - 2));
    rows.push(active ? `${bg(5, 46, 74)}${prefix}${title}${ansi.reset}` : fit(`${prefix}${title}`, width));

    if (itemValue.meta && rows.length < height) {
      rows.push(fit(`  ${muted}${itemValue.meta}${ansi.reset}`, width));
    }
    // Note: detail is shown in right panel, not here
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

function drawStatusBar(state: TuiState, width: number): string {
  if (state.inputMode) {
    return fit(`${cc98Blue} ${state.inputPrompt}${state.inputValue}${ansi.reset}`, width);
  }
  const left = getStatus(state);
  const right = getKeyHints(state);
  const padding = Math.max(1, width - cellWidth(left) - cellWidth(right) - 2);
  return fit(`${muted} ${left}${" ".repeat(padding)}${right} `, width);
}

function getKeyHints(state: TuiState): string {
  const hints: string[] = [];

  hints.push("j/k ↑↓ 移动");
  hints.push("h← 返回");
  hints.push("l→ 进入");
  hints.push("Enter 确认");

  if (state.mode === "topic") {
    hints.push("s 收藏");
    hints.push("l 赞");
    hints.push("d 踩");
    hints.push("u 用户");
    hints.push("v 投票");
    hints.push("a 状态");
    hints.push("n 下页");
    hints.push("【/】楼层");
    hints.push("数字跳楼");
  } else if (state.currentChat) {
    hints.push("n 更多");
  }

  hints.push("/ 搜索");
  hints.push("r 刷新");
  hints.push("o 操作");
  hints.push("? 帮助");
  hints.push("q 退出");

  return hints.join(" ");
}

function drawHelpModal(baseLines: string[], width: number, height: number): string {
  const modalWidth = Math.min(50, width - 4);
  const modalHeight = Math.min(22, height - 4);
  const startRow = Math.floor((height - modalHeight) / 2);
  const startCol = Math.floor((width - modalWidth) / 2);

  const helpContent = [
    "",
    `${cc98Blue}${ansi.bold} 快捷键帮助${ansi.reset}`,
    "",
    " 导航",
    "   j/k, ↑/↓    上下移动",
    "   l, →        进入下一层",
    "   h, ←        返回上一层",
    "   Enter       确认/执行",
    "",
    " 全局",
    "   /           搜索",
    "   ?           显示/关闭帮助",
    "   r           刷新当前视图",
    "   n, Space    加载更多",
    "   o           打开操作菜单",
    "   q           退出程序",
    "",
    " 帖子详情",
    "   s           收藏/取消收藏",
    "   l           点赞",
    "   d           踩",
    "   u           查看用户",
    "   v           查看投票",
    "   a           查看点赞状态",
    "   【/】       上/下楼层",
    "   数字+Enter  跳转楼层",
    "",
    " 按任意键关闭"
  ];

  const result = [...baseLines];
  for (let i = 0; i < modalHeight && i < helpContent.length; i++) {
    const row = startRow + i;
    if (row >= 0 && row < result.length) {
      const line = helpContent[i] ?? "";
      const padded = fit(line, modalWidth);
      const bgStr = i === 0 || i === modalHeight - 1 ? `${line}${"─".repeat(modalWidth)}${ansi.reset}` : `${bg(5, 46, 74)}${padded}${ansi.reset}`;
      const before = result[row].slice(0, startCol);
      const after = " ".repeat(Math.max(0, width - startCol - modalWidth));
      result[row] = `${before}${bgStr}${after}`;
    }
  }

  return result.slice(0, height).join("\n");
}

function drawMenuModal(baseLines: string[], state: TuiState, width: number, height: number): string {
  const modalWidth = Math.min(30, width - 4);
  const modalHeight = state.menuItems.length + 4;
  const startRow = Math.floor((height - modalHeight) / 2);
  const startCol = Math.floor((width - modalWidth) / 2);

  const result = [...baseLines];

  // Title
  const titleRow = startRow;
  if (titleRow >= 0 && titleRow < result.length) {
    const title = fit(`${cc98Blue}${ansi.bold} 操作菜单${ansi.reset}`, modalWidth);
    result[titleRow] = replaceAt(result[titleRow], startCol, `${bg(5, 46, 74)}${title}${ansi.reset}`);
  }

  // Separator
  const sepRow = startRow + 1;
  if (sepRow >= 0 && sepRow < result.length) {
    result[sepRow] = replaceAt(result[sepRow], startCol, `${line}${"─".repeat(modalWidth)}${ansi.reset}`);
  }

  // Menu items
  state.menuItems.forEach((item, i) => {
    const row = startRow + 2 + i;
    if (row >= 0 && row < result.length) {
      const active = i === state.menuIndex;
      const label = ` ${item.label}`;
      const key = `[${item.key}]`;
      const padding = Math.max(0, modalWidth - label.length - key.length - 1);
      const content = `${label}${" ".repeat(padding)}${key}`;
      const styled = active
        ? `${bg(0, 130, 202)}${white}${fit(content, modalWidth)}${ansi.reset}`
        : `${bg(5, 46, 74)}${fit(content, modalWidth)}${ansi.reset}`;
      result[row] = replaceAt(result[row], startCol, styled);
    }
  });

  return result.slice(0, height).join("\n");
}

function replaceAt(str: string, index: number, replacement: string): string {
  const before = str.slice(0, index);
  const afterWidth = Math.max(0, cellWidth(str) - index - cellWidth(replacement));
  const after = " ".repeat(afterWidth);
  return `${before}${replacement}${after}`;
}

function drawInfoModal(baseLines: string[], state: TuiState, width: number, height: number): string {
  const modalWidth = Math.min(72, width - 4);
  const modalHeight = Math.min(Math.max(10, state.infoLines.length + 5), height - 4);
  const startRow = Math.floor((height - modalHeight) / 2);
  const startCol = Math.floor((width - modalWidth) / 2);
  const content = [
    "",
    `${cc98Blue}${ansi.bold} ${state.infoTitle ?? "详情"}${ansi.reset}`,
    "",
    ...state.infoLines.flatMap((value) => wrapText(value, modalWidth - 2).map((row) => ` ${row}`)),
    "",
    ` ${muted}Esc/Enter 关闭${ansi.reset}`
  ];

  const result = [...baseLines];
  for (let i = 0; i < modalHeight && i < content.length; i++) {
    const row = startRow + i;
    if (row >= 0 && row < result.length) {
      const padded = fit(content[i] ?? "", modalWidth);
      result[row] = replaceAt(result[row], startCol, `${bg(5, 46, 74)}${padded}${ansi.reset}`);
    }
  }

  return result.slice(0, height).join("\n");
}

function drawRight(state: TuiState, width: number, height: number): string[] {
  if (state.mode === "topic" && state.topic) {
    return drawTopicRight(state.topic, state.scroll, width, height);
  }

  if (state.focus === "nav") {
    return drawNavRight(state, width, height);
  }

  return drawItemRight(state, width, height);
}

function drawNavRight(state: TuiState, width: number, height: number): string[] {
  const rows: string[] = [];
  const nav = navItems[state.navIndex];
  rows.push(...mascotMini.map((row) => fit(`${white}${row}${ansi.reset}`, width)));
  rows.push(`${line}${"─".repeat(width)}${ansi.reset}`);
  rows.push(fit(`${cc98Blue}${ansi.bold} ${nav.label}${ansi.reset}`, width));
  rows.push(fit(`${muted} ${nav.hint}${ansi.reset}`, width));
  rows.push(`${line}${"─".repeat(width)}${ansi.reset}`);

  if (state.loading) {
    rows.push(fit(`${muted} 正在读取栏目...${ansi.reset}`, width));
  } else if (state.error) {
    rows.push(fit(`${danger} 栏目读取失败${ansi.reset}`, width));
    rows.push(fit(` ${state.error}`, width));
  } else {
    rows.push(fit(`${muted} 当前内容${ansi.reset}`, width));
    rows.push(fit(`${cc98BlueSoft} ${state.items.length} 项${ansi.reset}`, width));
    if (state.stats.length > 0) {
      rows.push(`${line}${"─".repeat(width)}${ansi.reset}`);
      state.stats.slice(0, 5).forEach((stat) => {
        rows.push(fit(`${muted} ${stat.title}${ansi.reset}`, width));
        rows.push(fit(`${cc98BlueSoft} ${stat.detail ?? "-"}${ansi.reset}`, width));
      });
    }
  }

  rows.push(`${line}${"─".repeat(width)}${ansi.reset}`);
  rows.push(fit(`${muted} j/k 切换栏目${ansi.reset}`, width));
  rows.push(fit(`${muted} l/Enter 进入内容${ansi.reset}`, width));
  rows.push(fit(`${muted} r 刷新当前栏目${ansi.reset}`, width));
  return rows.concat(blank(height - rows.length, width)).slice(0, height);
}

function drawItemRight(state: TuiState, width: number, height: number): string[] {
  const rows: string[] = [];
  const selected = state.items[state.itemIndex];

  if (!selected) {
    rows.push(fit(`${muted} 暂无选中项${ansi.reset}`, width));
    return rows.concat(blank(height - rows.length, width)).slice(0, height);
  }

  rows.push(fit(`${cc98Blue}${ansi.bold} ${selected.title}${ansi.reset}`, width));
  if (selected.meta) {
    wrapText(selected.meta, width - 2).slice(0, 3).forEach((row) => {
      rows.push(fit(`${muted} ${row}${ansi.reset}`, width));
    });
  }
  rows.push(`${line}${"─".repeat(width)}${ansi.reset}`);

  if (selected.detail) {
    wrapText(selected.detail, width - 2).slice(0, Math.max(0, height - rows.length - 8)).forEach((row) => {
      rows.push(fit(` ${row}`, width));
    });
  } else {
    rows.push(fit(`${muted} 没有摘要内容${ansi.reset}`, width));
  }

  rows.push(`${line}${"─".repeat(width)}${ansi.reset}`);
  if (selected.topicId !== undefined) {
    rows.push(fit(`${muted} 主题 #${selected.topicId}${ansi.reset}`, width));
    if (selected.boardId !== undefined) {
      rows.push(fit(`${muted} 版面 #${selected.boardId}${ansi.reset}`, width));
    }
    rows.push(fit(`${cc98BlueSoft} l 打开阅读${ansi.reset}`, width));
  } else if (selected.boardId !== undefined) {
    rows.push(fit(`${muted} 版面 #${selected.boardId}${ansi.reset}`, width));
    rows.push(fit(`${cc98BlueSoft} l 读取主题${ansi.reset}`, width));
  } else if (selected.chatUserId !== undefined) {
    rows.push(fit(`${muted} 用户 #${selected.chatUserId}${ansi.reset}`, width));
    rows.push(fit(`${cc98BlueSoft} l 打开会话${ansi.reset}`, width));
  } else if (selected.userId !== undefined) {
    rows.push(fit(`${muted} 用户 #${selected.userId}${ansi.reset}`, width));
    rows.push(fit(`${cc98BlueSoft} l 查看用户${ansi.reset}`, width));
  } else if (selected.action !== undefined || selected.meta === "signin") {
    rows.push(fit(`${cc98BlueSoft} l/Enter 执行${ansi.reset}`, width));
  } else if (state.mode === "settings") {
    rows.push(fit(`${cc98BlueSoft} l/Enter 执行${ansi.reset}`, width));
  }

  return rows.concat(blank(height - rows.length, width)).slice(0, height);
}

function drawTopicRight(topic: TopicReaderState, scroll: number, width: number, height: number): string[] {
  const rows: string[] = [];
  const post = currentTopicPost(topic, scroll);
  const lineEntry = currentTopicLine(topic, scroll);
  rows.push(fit(`${cc98Blue}${ansi.bold} ${topic.title}${ansi.reset}`, width));
  if (topic.meta) {
    wrapText(topic.meta, width - 2).slice(0, 2).forEach((row) => {
      rows.push(fit(`${muted} ${row}${ansi.reset}`, width));
    });
  }
  rows.push(`${line}${"─".repeat(width)}${ansi.reset}`);

  if (post) {
    const floor = post.floor !== undefined ? `${post.floor} 楼` : "未知楼层";
    rows.push(fit(`${cc98BlueSoft} ${floor}${ansi.reset}`, width));
    rows.push(fit(`${muted} ${post.author}${post.time ? ` · ${post.time}` : ""}${ansi.reset}`, width));
    rows.push(fit(`${muted} 赞 ${post.likeCount}  踩 ${post.dislikeCount}${post.rating ? `  评分 ${post.rating}` : ""}${ansi.reset}`, width));
    rows.push(`${line}${"─".repeat(width)}${ansi.reset}`);

    if (lineEntry) {
      rows.push(fit(`${muted} 当前行 ${lineEntry.row + 1}/${post.lines.length}${ansi.reset}`, width));
      rows.push(fit(`${cc98BlueSoft} ${lineKindLabel(lineEntry.kind)}${ansi.reset}`, width));
      if (lineEntry.imageUrl) {
        rows.push(fit(`${muted} 图片 ${lineEntry.imageIndex}${ansi.reset}`, width));
        wrapText(lineEntry.imageUrl, width - 2).slice(0, 2).forEach((row) => rows.push(fit(` ${row}`, width)));
      } else if (lineEntry.linkUrl) {
        rows.push(fit(`${muted} 链接 ${lineEntry.linkIndex}${ansi.reset}`, width));
        wrapText(lineEntry.linkUrl, width - 2).slice(0, 2).forEach((row) => rows.push(fit(` ${row}`, width)));
      } else if (lineEntry.text.trim()) {
        wrapText(lineEntry.text, width - 2).slice(0, 3).forEach((row) => rows.push(fit(` ${row}`, width)));
      }
    }

    rows.push(`${line}${"─".repeat(width)}${ansi.reset}`);
    rows.push(fit(`${muted} 本楼 图片 ${post.imageCount}  链接 ${post.linkCount}${ansi.reset}`, width));
  }

  const hot = topic.posts
    .filter((entry) => entry.likeCount > 0)
    .sort((left, right) => right.likeCount - left.likeCount)
    .slice(0, 3);
  if (hot.length > 0 && rows.length < height - 5) {
    rows.push(`${line}${"─".repeat(width)}${ansi.reset}`);
    rows.push(fit(`${cc98Blue}${ansi.bold} 热门回复${ansi.reset}`, width));
    hot.forEach((entry) => {
      rows.push(fit(`${muted} #${entry.floor ?? "?"} ${entry.author} · ${entry.likeCount} 赞${ansi.reset}`, width));
      if (entry.preview) {
        rows.push(fit(` ${truncate(entry.preview, width - 2)}`, width));
      }
    });
  }

  rows.push(`${line}${"─".repeat(width)}${ansi.reset}`);
  rows.push(fit(`${muted} j/k 行滚动  【/】楼层切换${ansi.reset}`, width));
  rows.push(fit(`${muted} 数字+Enter 跳楼  n 下一页${ansi.reset}`, width));
  if (topic.floorInput) {
    rows.push(fit(`${ok} 跳转：${topic.floorInput} 楼${ansi.reset}`, width));
  }
  return rows.concat(blank(height - rows.length, width)).slice(0, height);
}

function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;

  for (const char of text) {
    const charW = charCellWidth(char);
    if (currentWidth + charW > maxWidth) {
      lines.push(current);
      current = char;
      currentWidth = charW;
    } else {
      current += char;
      currentWidth += charW;
    }
  }
  if (current) {
    lines.push(current);
  }

  return lines;
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
  const nestedTopic = asObject(topic.topic ?? topic.Topic);
  const source = Object.keys(nestedTopic).length > 0 ? nestedTopic : topic;
  const topicId = asNumber(source.id ?? source.Id ?? topic.topicId ?? topic.TopicId);
  const boardId = asNumber(source.boardId ?? source.BoardId) ?? fallbackBoard?.boardId;
  const boardName = topic.boardName ?? topic.BoardName ?? fallbackBoard?.title;
  return {
    title: String(source.title ?? source.Title ?? topic.title ?? topic.Title ?? `#${topicId ?? ""}`),
    meta: [
      boardName,
      source.userName ?? source.authorName ?? topic.userName ?? topic.authorName,
      source.replyCount !== undefined ? `${source.replyCount} 回复` : topic.replyCount !== undefined ? `${topic.replyCount} 回复` : undefined,
      source.hitCount !== undefined ? `${source.hitCount} 浏览` : topic.hitCount !== undefined ? `${topic.hitCount} 浏览` : undefined
    ]
      .filter(Boolean)
      .join(" · "),
    detail: normalizeInline(String(source.lastPostContent ?? source.content ?? topic.lastPostContent ?? topic.content ?? "")) || undefined,
    topicId,
    boardId,
    sortTime: timestampOf(source.lastPostTime ?? source.updateTime ?? source.time ?? source.createTime ?? topic.lastPostTime ?? topic.updateTime ?? topic.time)
  };
}

function userItem(value: unknown): ContentItem {
  const user = asObject(value);
  const userId = asNumber(user.id ?? user.Id ?? user.userId ?? user.UserId);
  return {
    title: String(user.name ?? user.Name ?? user.userName ?? user.UserName ?? (userId !== undefined ? `#${userId}` : "用户")),
    meta: [
      userId !== undefined ? `#${userId}` : undefined,
      user.postCount !== undefined ? `${user.postCount} 帖` : undefined,
      user.levelTitle ?? user.groupName
    ].filter(Boolean).join(" · "),
    detail: normalizeInline(String(user.introduction ?? user.signature ?? user.Signature ?? "")) || undefined,
    userId
  };
}

function genericItem(value: unknown, fallbackTitle: string): ContentItem {
  const object = asObject(value);
  const id = asNumber(object.id ?? object.Id ?? object.groupId ?? object.GroupId);
  const title = String(object.name ?? object.Name ?? object.title ?? object.Title ?? object.reason ?? object.Reason ?? (id !== undefined ? `#${id}` : fallbackTitle));
  const detail = normalizeInline(String(object.description ?? object.content ?? object.Content ?? object.message ?? object.Message ?? JSON.stringify(value)));
  return {
    title,
    meta: id !== undefined ? `#${id}` : undefined,
    detail
  };
}

function noticeItem(value: unknown): ContentItem {
  const notice = asObject(value);
  const topic = asObject(notice.topic ?? notice.Topic);
  const topicId = asNumber(notice.topicId ?? notice.TopicId ?? topic.id ?? topic.Id);
  const time = typeof notice.time === "string"
    ? notice.time.replace("T", " ").slice(0, 16)
    : typeof notice.createTime === "string"
      ? notice.createTime.replace("T", " ").slice(0, 16)
      : undefined;
  return {
    title: String(notice.title ?? notice.Title ?? notice.type ?? notice.Type ?? topic.title ?? "通知"),
    meta: [time, topicId !== undefined ? `主题 #${topicId}` : undefined].filter(Boolean).join(" · "),
    detail: normalizeInline(String(notice.content ?? notice.Content ?? notice.message ?? notice.Message ?? "")) || undefined,
    topicId
  };
}

function historyItem(value: unknown): ContentItem {
  const itemValue = topicItem(value);
  const history = asObject(value);
  const time = history.time ?? history.Time ?? history.lastViewTime ?? history.LastViewTime ?? history.createTime;
  return {
    ...itemValue,
    meta: [itemValue.meta, time !== undefined ? `浏览 ${String(time).replace("T", " ").slice(0, 16)}` : undefined].filter(Boolean).join(" · ")
  };
}

async function loadFriendUsers(
  client: CachedCc98Client,
  type: "follower" | "followee",
  signal?: AbortSignal
): Promise<ContentItem[]> {
  const raw = asArray(await client.getFriendIds(type, 0, 20, false, signal));
  if (raw.length === 0) {
    return [];
  }
  if (raw.every((value) => asNumber(value) !== undefined)) {
    const ids = raw.map((value) => asNumber(value)).filter((id): id is number => id !== undefined);
    return asArray(await client.getBasicUsers(ids, false, signal)).map((user) => userItem(user));
  }
  return raw.map((user) => userItem(user));
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

function getStatus(state: TuiState): string {
  // Left part: context status
  let left = "";
  if (state.loading) {
    left = "加载中...";
  } else if (state.loadingMore) {
    left = "加载更多...";
  } else if (state.error) {
    left = "出错了";
  } else if (state.mode === "topic") {
    if (state.topic) {
      const post = currentTopicPost(state.topic, state.scroll);
      const line = currentTopicLine(state.topic, state.scroll);
      left = post
        ? `${post.floor ?? "?"} 楼 · 第 ${line ? line.row + 1 : 1} 行`
        : `${state.topic.loaded} 楼已加载`;
    }
  } else if (state.mode === "settings") {
    left = "设置";
  } else {
    left = `${state.items.length} 项`;
  }

  return left;
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
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return undefined;
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

// 新增功能函数

async function activateContentItem(
  client: CachedCc98Client,
  state: TuiState,
  selected: ContentItem,
  render: () => void,
  signal?: AbortSignal
): Promise<void> {
  if (selected.topicId !== undefined) {
    await openTopic(client, state, selected.topicId, render, false, signal);
    return;
  }
  if (selected.boardId !== undefined) {
    await openBoard(client, state, selected.boardId, selected.title, render, false, signal);
    return;
  }
  if (selected.chatUserId !== undefined) {
    await openChat(client, state, selected.chatUserId, selected.title, render, false, signal);
    return;
  }
  if (selected.userId !== undefined) {
    await showUserDetailById(client, state, selected.userId, render, signal);
    return;
  }
  if (selected.meta === "signin") {
    await signin(client, state, render);
    return;
  }
  if (selected.action) {
    await runReadOnlyAction(client, state, selected.action, render, signal);
    return;
  }

  state.status = "当前条目不可进入";
  render();
}

async function runReadOnlyAction(
  client: CachedCc98Client,
  state: TuiState,
  action: string,
  render: () => void,
  signal?: AbortSignal
): Promise<void> {
  if (action.startsWith("notices:")) {
    await openNoticeList(client, state, action.slice("notices:".length) as NoticeType, render, signal);
    return;
  }
  if (action === "favorite-topics") {
    await openReadOnlyList(client, state, "收藏主题", "正在读取收藏主题...", render, signal, async () => {
      const topics = asArray(await client.getFavoriteTopics(0, 20, 1, 0, false, signal));
      return {
        items: topics.map((topic) => topicItem(topic)),
        stats: [{ title: "收藏主题", detail: `${topics.length} 条` }],
        status: "收藏主题：j/k 选择  l 打开帖子  h 返回  r 刷新"
      };
    });
    return;
  }
  if (action === "favorite-updates") {
    await openReadOnlyList(client, state, "收藏更新", "正在读取收藏更新...", render, signal, async () => {
      const topics = asArray(await client.getFavoriteUpdates(0, 20, false, signal));
      return {
        items: topics.map((topic) => topicItem(topic)),
        stats: [{ title: "收藏更新", detail: `${topics.length} 条` }],
        status: "收藏更新：j/k 选择  l 打开帖子  h 返回"
      };
    });
    return;
  }
  if (action === "favorite-groups") {
    await openReadOnlyList(client, state, "收藏分组", "正在读取收藏分组...", render, signal, async () => {
      const groups = asArray(await client.getFavoriteGroups(false, signal));
      return {
        items: groups.map((group) => genericItem(group, "收藏分组")),
        stats: [{ title: "分组", detail: `${groups.length} 个` }],
        status: "收藏分组：j/k 查看  h 返回  r 刷新"
      };
    });
    return;
  }
  if (action === "followers" || action === "followees") {
    const type = action === "followers" ? "follower" : "followee";
    const title = action === "followers" ? "粉丝列表" : "关注列表";
    await openReadOnlyList(client, state, title, `正在读取${title}...`, render, signal, async () => {
      const users = await loadFriendUsers(client, type, signal);
      return {
        items: users,
        stats: [{ title, detail: `${users.length} 人` }],
        status: `${title}：j/k 选择  l 查看用户  h 返回  r 刷新`
      };
    });
    return;
  }
  if (action === "browse-history") {
    await openReadOnlyList(client, state, "浏览历史", "正在读取浏览历史...", render, signal, async () => {
      const records = asArray(await client.getBrowseHistory(0, 20, false, signal));
      return {
        items: records.map((record) => historyItem(record)),
        stats: [{ title: "浏览历史", detail: `${records.length} 条` }],
        status: "浏览历史：j/k 选择  l 打开帖子  h 返回  r 刷新"
      };
    });
    return;
  }
  if (action === "recent-topics") {
    await openReadOnlyList(client, state, "我的最近主题", "正在读取最近主题...", render, signal, async () => {
      const topics = asArray(await client.getRecentTopics(undefined, 0, 20, false, signal));
      return {
        items: topics.map((topic) => topicItem(topic)),
        stats: [{ title: "最近主题", detail: `${topics.length} 条` }],
        status: "最近主题：j/k 选择  l 打开帖子  h 返回  r 刷新"
      };
    });
    return;
  }
  if (action === "random-topics") {
    await openReadOnlyList(client, state, "随机主题", "正在读取随机主题...", render, signal, async () => {
      const topics = asArray(await client.getRandomTopics(20, false, signal));
      return {
        items: topics.map((topic) => topicItem(topic)),
        stats: [{ title: "随机主题", detail: `${topics.length} 条` }],
        status: "随机主题：j/k 选择  l 打开帖子  h 返回  r 刷新"
      };
    });
    return;
  }
  if (action === "card-stat") {
    state.status = "正在读取全站统计...";
    render();
    try {
      const stat = await client.getCardStat(false, signal);
      state.infoTitle = "全站统计";
      state.infoLines = jsonPreviewLines(stat);
      state.modal = "info";
    } catch (error) {
      state.status = `全站统计读取失败: ${error instanceof Error ? error.message : String(error)}`;
    }
    render();
    return;
  }
  if (action.startsWith("board-best:")) {
    const boardId = asNumber(action.slice("board-best:".length));
    if (boardId === undefined) return;
    await openReadOnlyList(client, state, "精华帖", "正在读取精华帖...", render, signal, async () => {
      const topics = asArray(await client.getBoardTopics(boardId, 0, 20, true, false, signal));
      return {
        items: topics.map((topic) => topicItem(topic)),
        stats: [{ title: "精华帖", detail: `${topics.length} 条` }],
        status: "精华帖：j/k 选择  l 打开帖子  h 返回"
      };
    });
    return;
  }
  if (action.startsWith("rate-reasons:")) {
    const type = Number(action.slice("rate-reasons:".length));
    await openReadOnlyList(client, state, `评分原因 ${type}`, "正在读取评分原因...", render, signal, async () => {
      const reasons = asArray(await client.getPostRateReasons(type, false, signal));
      return {
        items: reasons.map((reason) => genericItem(reason, "评分原因")),
        stats: [{ title: "评分原因", detail: `${reasons.length} 条` }],
        status: "评分原因：j/k 查看  h 返回"
      };
    });
  }
}

async function openReadOnlyList(
  client: CachedCc98Client,
  state: TuiState,
  title: string,
  loadingStatus: string,
  render: () => void,
  signal: AbortSignal | undefined,
  loadItems: () => Promise<{ items: ContentItem[]; stats: ContentItem[]; status: string }>
): Promise<void> {
  state.parentList = {
    title: state.viewTitle,
    items: state.items,
    stats: state.stats,
    itemIndex: state.itemIndex,
    status: state.status
  };
  state.mode = "list";
  state.focus = "content";
  state.loading = true;
  state.loadingMore = false;
  state.error = undefined;
  state.topic = undefined;
  state.currentBoard = undefined;
  state.currentChat = undefined;
  state.viewTitle = title;
  state.items = [];
  state.stats = [];
  state.itemIndex = 0;
  state.scroll = 0;
  state.status = loadingStatus;
  render();

  try {
    const loaded = await loadItems();
    state.items = loaded.items;
    state.stats = loaded.stats;
    state.status = loaded.status;
  } catch (error) {
    if (!isAbortError(error)) {
      state.error = error instanceof Error ? error.message : String(error);
      state.status = "读取失败；h 返回  r 重试";
    }
  } finally {
    state.loading = false;
    render();
  }
}

async function openNoticeList(
  client: CachedCc98Client,
  state: TuiState,
  type: NoticeType,
  render: () => void,
  signal?: AbortSignal
): Promise<void> {
  const title = type === "system" ? "系统通知" : type === "at" ? "@ 通知" : "回复通知";
  await openReadOnlyList(client, state, title, `正在读取${title}...`, render, signal, async () => {
    const notices = asArray(await client.getNotices(type, 0, 20, false, signal));
    return {
      items: notices.map((notice) => noticeItem(notice)),
      stats: [{ title, detail: `${notices.length} 条` }],
      status: `${title}：j/k 选择  l 打开关联帖子  h 返回  r 刷新`
    };
  });
}

async function performSearch(
  client: CachedCc98Client,
  state: TuiState,
  render: () => void,
  signal?: AbortSignal
): Promise<void> {
  const query = state.searchQuery.trim();
  if (!query) return;

  state.loading = true;
  state.searchResults = [];
  render();

  try {
    if (state.searchMode === "topics") {
      const results = asArray(await client.searchTopics(query, 0, 20, false, signal));
      state.searchResults = results.map((topic: any) => topicItem(topic));
    } else {
      const results = asArray(await client.searchUsers(query, false, signal));
      state.searchResults = results.map((user) => userItem(user));
    }
    state.itemIndex = 0;
    state.status = `找到 ${state.searchResults.length} 个结果`;
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    state.loading = false;
    render();
  }
}

async function toggleFavorite(
  client: CachedCc98Client,
  state: TuiState,
  render: () => void
): Promise<void> {
  if (!state.topic) return;

  try {
    const isFav = await client.isTopicFavorite(state.topic.topicId, false);
    if (isFav) {
      await client.removeFavorite(state.topic.topicId);
      state.status = "已取消收藏";
    } else {
      await client.addFavorite(state.topic.topicId);
      state.status = "已收藏";
    }
  } catch (error) {
    state.status = `收藏失败: ${error instanceof Error ? error.message : String(error)}`;
  }
  render();
}

async function reactToCurrentPost(
  client: CachedCc98Client,
  state: TuiState,
  isLike: boolean,
  render: () => void
): Promise<void> {
  if (!state.topic || state.topic.posts.length === 0) return;

  const currentPost = currentTopicPost(state.topic, state.scroll);
  if (!currentPost?.id) {
    state.status = "无法找到当前帖子";
    render();
    return;
  }

  try {
    await client.reactToPost(currentPost.id, isLike);
    state.status = isLike ? "已点赞" : "已踩";
  } catch (error) {
    state.status = `操作失败: ${error instanceof Error ? error.message : String(error)}`;
  }
  render();
}

async function showUserDetail(
  client: CachedCc98Client,
  state: TuiState,
  render: () => void,
  signal?: AbortSignal
): Promise<void> {
  if (!state.topic || state.topic.posts.length === 0) return;

  const currentPost = currentTopicPost(state.topic, state.scroll);
  if (!currentPost) return;

  const userId = currentPost.userId;
  if (!userId) {
    state.status = "无法获取用户信息";
    render();
    return;
  }

  await showUserDetailById(client, state, userId, render, signal);
}

async function showUserDetailById(
  client: CachedCc98Client,
  state: TuiState,
  userId: number,
  render: () => void,
  signal?: AbortSignal
): Promise<void> {
  if (!userId) {
    state.status = "无法获取用户信息";
    render();
    return;
  }

  state.loading = true;
  render();

  try {
    const profile = asObject(await client.getUserProfile(userId, false, signal));
    state.userDetail = {
      userId,
      name: String(profile.name ?? "未知用户"),
      level: String(profile.levelTitle ?? profile.groupName ?? ""),
      postCount: asNumber(profile.postCount),
      fanCount: asNumber(profile.fanCount),
      followCount: asNumber(profile.followCount),
      isFollowing: Boolean(profile.isFollowing)
    };

    // 获取最近帖子
    const topics = asArray(await client.getRecentTopics(userId, 0, 5, false, signal));
    state.userDetail.recentTopics = topics.map((t: any) => topicItem(t));

    state.modal = "user";
    state.status = "用户详情";
  } catch (error) {
    state.status = `获取用户信息失败: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    state.loading = false;
    render();
  }
}

async function showTopicVote(
  client: CachedCc98Client,
  state: TuiState,
  render: () => void,
  signal?: AbortSignal
): Promise<void> {
  if (!state.topic) return;

  state.status = "正在读取投票信息...";
  render();
  try {
    const vote = await client.getTopicVote(state.topic.topicId, false, signal);
    state.infoTitle = "投票信息";
    state.infoLines = jsonPreviewLines(vote);
    state.modal = "info";
  } catch (error) {
    state.status = `投票读取失败: ${error instanceof Error ? error.message : String(error)}`;
  }
  render();
}

async function showPostReactionState(
  client: CachedCc98Client,
  state: TuiState,
  render: () => void,
  signal?: AbortSignal
): Promise<void> {
  if (!state.topic) return;
  const currentPost = currentTopicPost(state.topic, state.scroll);
  if (!currentPost?.id) {
    state.status = "无法找到当前帖子";
    render();
    return;
  }

  state.status = "正在读取点赞状态...";
  render();
  try {
    const reaction = await client.getPostReactionState(currentPost.id, false, signal);
    state.infoTitle = `#${currentPost.floor ?? "?"} 点赞状态`;
    state.infoLines = jsonPreviewLines(reaction);
    state.modal = "info";
  } catch (error) {
    state.status = `点赞状态读取失败: ${error instanceof Error ? error.message : String(error)}`;
  }
  render();
}

function jsonPreviewLines(value: unknown): string[] {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.split("\n").slice(0, 18);
}

async function toggleFollow(
  client: CachedCc98Client,
  state: TuiState,
  render: () => void
): Promise<void> {
  if (!state.userDetail) return;

  try {
    if (state.userDetail.isFollowing) {
      await client.unfollowUser(state.userDetail.userId);
      state.userDetail.isFollowing = false;
      state.status = "已取消关注";
    } else {
      await client.followUser(state.userDetail.userId);
      state.userDetail.isFollowing = true;
      state.status = "已关注";
    }
  } catch (error) {
    state.status = `关注失败: ${error instanceof Error ? error.message : String(error)}`;
  }
  render();
}

async function sendPrivateMessage(
  client: CachedCc98Client,
  state: TuiState,
  userId: number,
  content: string,
  render: () => void
): Promise<void> {
  try {
    await client.sendMessage(userId, content);
    state.status = "消息已发送";
  } catch (error) {
    state.status = `发送失败: ${error instanceof Error ? error.message : String(error)}`;
  }
  render();
}

async function signin(
  client: CachedCc98Client,
  state: TuiState,
  render: () => void
): Promise<void> {
  try {
    const result = await client.signin();
    const wealth = typeof result === "number" ? result : 0;
    state.status = wealth > 0 ? `签到成功，获得 ${wealth} 米` : "签到成功";
  } catch (error) {
    state.status = `签到失败: ${error instanceof Error ? error.message : String(error)}`;
  }
  render();
}

// 搜索模态框
function drawSearchModal(baseLines: string[], state: TuiState, width: number, height: number): string {
  const modalWidth = Math.min(60, width - 4);
  const modalHeight = Math.min(20, height - 4);
  const startRow = Math.floor((height - modalHeight) / 2);
  const startCol = Math.floor((width - modalWidth) / 2);

  const resultCount = state.searchResults.length;
  const resultLabel = resultCount > 0 ? ` (${resultCount} 结果)` : "";

  const content: string[] = [
    "",
    `${cc98Blue}${ansi.bold} 搜索${ansi.reset}`,
    "",
    ` 模式: ${state.searchMode === "topics" ? "● 帖子  ○ 用户" : "○ 帖子  ● 用户"}  Tab 切换`,
    "",
    ` ${cc98Blue}▸${ansi.reset} ${state.searchQuery}${state.loading ? " ..." : "_"}${resultLabel}`,
    "",
  ];

  const maxResults = modalHeight - 10;
  for (let i = 0; i < Math.min(state.searchResults.length, maxResults); i++) {
    const item = state.searchResults[i];
    const marker = i === state.itemIndex ? ">" : " ";
    content.push(` ${marker} ${i + 1}. ${item.title}`);
    if (item.meta) {
      content.push(`    ${muted}${item.meta}${ansi.reset}`);
    }
  }

  if (state.searchResults.length === 0 && state.searchQuery && !state.loading) {
    content.push(` ${muted}无结果${ansi.reset}`);
  }

  content.push("");
  content.push(` ${muted}Enter 搜索/打开  j/k 选择  Esc 关闭  Tab 切换${ansi.reset}`);

  const result = [...baseLines];
  for (let i = 0; i < modalHeight && i < content.length; i++) {
    const row = startRow + i;
    if (row >= 0 && row < result.length) {
      const line = content[i] ?? "";
      const padded = fit(line, modalWidth);
      const bgStr = i === 0 || i === modalHeight - 1
        ? `${line}${"─".repeat(modalWidth)}${ansi.reset}`
        : `${bg(5, 46, 74)}${padded}${ansi.reset}`;
      const before = result[row].slice(0, startCol);
      const after = " ".repeat(Math.max(0, width - startCol - modalWidth));
      result[row] = `${before}${bgStr}${after}`;
    }
  }

  return result.slice(0, height).join("\n");
}

// 用户详情模态框
function drawUserDetailModal(baseLines: string[], state: TuiState, width: number, height: number): string {
  const modalWidth = Math.min(50, width - 4);
  const modalHeight = Math.min(18, height - 4);
  const startRow = Math.floor((height - modalHeight) / 2);
  const startCol = Math.floor((width - modalWidth) / 2);

  const user = state.userDetail;
  if (!user) {
    return baseLines.slice(0, height).join("\n");
  }

  const followLabel = user.isFollowing ? "已关注" : "未关注";
  const content: string[] = [
    "",
    `${cc98Blue}${ansi.bold} 用户详情${ansi.reset}`,
    "",
    ` 昵称: ${user.name}`,
    ` ID: #${user.userId}`,
  ];

  if (user.level) content.push(` 等级: ${user.level}`);
  if (user.postCount !== undefined) content.push(` 帖子: ${user.postCount}`);
  if (user.fanCount !== undefined) content.push(` 粉丝: ${user.fanCount}  关注: ${user.followCount ?? 0}`);
  content.push(` 状态: ${followLabel}`);
  content.push("");
  content.push(` ${cc98Blue}▸${ansi.reset} f 关注/取消关注  m 发私信`);
  content.push("");

  if (user.recentTopics && user.recentTopics.length > 0) {
    content.push(` ${cc98Blue}最近帖子${ansi.reset}`);
    for (const topic of user.recentTopics.slice(0, 3)) {
      content.push(` • ${topic.title}`);
    }
  }

  content.push("");
  content.push(` ${muted}Esc 关闭${ansi.reset}`);

  const result = [...baseLines];
  for (let i = 0; i < modalHeight && i < content.length; i++) {
    const row = startRow + i;
    if (row >= 0 && row < result.length) {
      const line = content[i] ?? "";
      const padded = fit(line, modalWidth);
      const bgStr = i === 0 || i === modalHeight - 1
        ? `${line}${"─".repeat(modalWidth)}${ansi.reset}`
        : `${bg(5, 46, 74)}${padded}${ansi.reset}`;
      const before = result[row].slice(0, startCol);
      const after = " ".repeat(Math.max(0, width - startCol - modalWidth));
      result[row] = `${before}${bgStr}${after}`;
    }
  }

  return result.slice(0, height).join("\n");
}
