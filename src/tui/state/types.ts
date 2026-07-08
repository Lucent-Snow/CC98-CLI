// 状态类型定义

export type ViewId = "hot" | "new" | "following" | "boards" | "favorite" | "messages" | "notices" | "me" | "settings";
export type FocusColumn = "nav" | "content";
export type ModalType = "menu" | "help" | "search" | "user" | "info" | null;
export type TabId = string;
export type SearchMode = "topics" | "users" | "content";
export type TopicSearchScope = "global" | "board";
export type NoticeType = "system" | "at" | "reply";

export interface NavItem {
  id: ViewId;
  label: string;
  hint: string;
}

export interface ContentItem {
  title: string;
  meta?: string;
  detail?: string;
  topicId?: number;
  boardId?: number;
  chatUserId?: number;
  messageId?: number;
  userId?: number;
  action?: string;
  sortTime?: number;
  searchTarget?: { kind: "list" | "topic"; index: number };
}

export interface ContentSearchState {
  query: string;
  matches: { kind: "list" | "topic"; index: number }[];
  index: number;
}

export interface MenuItem {
  label: string;
  key: string;
  action: string;
}

export interface UserDetailState {
  userId: number;
  name: string;
  level?: string;
  postCount?: number;
  fanCount?: number;
  followCount?: number;
  isFollowing?: boolean;
  recentTopics?: ContentItem[];
}

export interface ListSnapshot {
  title: string;
  items: ContentItem[];
  stats: ContentItem[];
  itemIndex: number;
  scroll: number;
  status: string;
  paging?: ListPagingState;
  parent?: ListSnapshot;
  tabs?: { id: string; label: string }[];
  tabId?: string;
}

export type ListPagingKind = "new-topics" | "board-topics" | "followee-topics" | "favorite-topics" | "favorite-updates" | "favorite-board-topics";

export interface FavoriteBoardPagingCursor {
  boardId: number;
  title: string;
  loaded: number;
  size: number;
  hasMore: boolean;
}

export interface ListPagingState {
  kind: ListPagingKind;
  loaded: number;
  size: number;
  hasMore: boolean;
  anchorOnReturn: boolean;
  boardCursors?: FavoriteBoardPagingCursor[];
  boardId?: number;
  boardTitle?: string;
  buffer?: ContentItem[];
  groupId?: number;
}

export interface BoardListState {
  boardId: number;
  title: string;
}

export interface ChatListState {
  userId: number;
  title: string;
  selfUserId?: number;
  loaded: number;
  size: number;
  hasMore: boolean;
  messageKeys: Set<string>;
}

export interface TopicJumpTarget {
  type: "page" | "floor";
  value: number;
}

export interface ComposeState {
  kind: "topic-reply" | "message-reply";
  targetId: number;
  title: string;
  value: string;
  active: boolean;
  persistDraft: boolean;
}

export interface TopicReaderState {
  topicId: number;
  title: string;
  meta: string;
  boardId?: number;
  boardTitle?: string;
  lines: string[];
  posts: TopicPostEntry[];
  loaded: number;
  size: number;
  totalFloors: number;
  viewportRows: number;
  cursorLine: number;
  hasMore: boolean;
  imageCount: number;
  linkCount: number;
  floorInput: string;
  jumpTarget?: TopicJumpTarget;
  /** Image URL -> local cache path mapping */
  imageCache: Map<string, string>;
  /** Set of image URLs currently being downloaded */
  imageLoading: Set<string>;
  /** Image URL -> last load error mapping */
  imageErrors: Map<string, string>;
}

export interface TopicPostEntry {
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

export interface SearchOriginState {
  itemIndex: number;
  scroll: number;
}

export interface SearchPagingState {
  query: string;
  mode: Exclude<SearchMode, "content">;
  from: number;
  size: number;
  hasMore: boolean;
}

export interface TopicLineEntry {
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

// 主状态接口
export interface TuiState {
  // 视图状态
  mode: "list" | "topic" | "settings" | "user-detail";
  focus: FocusColumn;
  navIndex: number;
  itemIndex: number;
  scroll: number;

  // 加载状态
  loading: boolean;
  loadingMore: boolean;
  status: string;
  error?: string;
  account?: string;

  // 视图数据
  viewTitle: string;
  items: ContentItem[];
  stats: ContentItem[];
  overview: ContentItem[];
  listViewportCapacity: number;

  // 导航状态
  parentList?: ListSnapshot;
  currentBoard?: BoardListState;
  currentChat?: ChatListState;
  topic?: TopicReaderState;
  listPaging?: ListPagingState;

  // 模态框状态
  modal: ModalType;
  menuTitle?: string;
  menuIndex: number;
  menuItems: MenuItem[];
  tabId: TabId;
  tabs: { id: TabId; label: string }[];

  // 搜索状态
  searchMode: SearchMode;
  topicSearchScope: TopicSearchScope;
  searchQuery: string;
  searchResults: ContentItem[];
  searchIndex: number;
  searchLoading: boolean;
  searchPaging?: SearchPagingState;
  searchScope: { label: string; boardId?: number };
  searchBoardScope?: { label: string; boardId: number };
  searchSubmitted: boolean;
  searchOrigin?: SearchOriginState;
  contentSearch?: ContentSearchState;

  // 用户详情状态
  userDetail?: UserDetailState;

  // 通知状态
  noticeType: NoticeType;

  // 输入状态
  inputMode: boolean;
  inputPrompt: string;
  inputValue: string;
  inputCallback?: (value: string) => void;
  compose?: ComposeState;

  // 信息模态框状态
  infoTitle?: string;
  infoLines: string[];
  confirmCallback?: () => void;  // 确认回调
  cancelCallback?: () => void;

  // 更新通知状态
  updateAvailable?: {
    version: string;
    tagName: string;
    url: string;
    body: string;
    isNew: boolean; // 是否是新版本（首次提醒）
  };
}
