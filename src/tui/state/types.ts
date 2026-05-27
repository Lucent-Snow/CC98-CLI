// 状态类型定义

export type ViewId = "hot" | "new" | "boards" | "following" | "favorite" | "messages" | "notices" | "me" | "more" | "settings";
export type FocusColumn = "nav" | "content";
export type ModalType = "menu" | "help" | "search" | "user" | "info" | null;
export type TabId = "default" | "posts" | "boards" | "chat" | "notices" | "history" | "followers" | "followees" | "favorites" | "signin" | "my-topics";
export type SearchMode = "topics" | "users";
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
  userId?: number;
  action?: string;
  sortTime?: number;
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
  status: string;
}

export interface BoardListState {
  boardId: number;
  title: string;
}

export interface ChatListState {
  userId: number;
  title: string;
  loaded: number;
  size: number;
  hasMore: boolean;
}

export interface TopicReaderState {
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

  // 导航状态
  parentList?: ListSnapshot;
  currentBoard?: BoardListState;
  currentChat?: ChatListState;
  topic?: TopicReaderState;

  // 模态框状态
  modal: ModalType;
  menuIndex: number;
  menuItems: MenuItem[];
  tabId: TabId;
  tabs: { id: TabId; label: string }[];

  // 搜索状态
  searchMode: SearchMode;
  searchQuery: string;
  searchResults: ContentItem[];

  // 用户详情状态
  userDetail?: UserDetailState;

  // 通知状态
  noticeType: NoticeType;

  // 输入状态
  inputMode: boolean;
  inputPrompt: string;
  inputValue: string;
  inputCallback?: (value: string) => void;

  // 信息模态框状态
  infoTitle?: string;
  infoLines: string[];
}
