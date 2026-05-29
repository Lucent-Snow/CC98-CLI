import { checkForUpdate } from "../update.js";
import { appVersion } from "../version.js";
import type { TokenStore } from "../storage/token-store.js";
import { getImageCache } from "../storage/image-cache.js";
import type { CachedCc98Client } from "./cached-client.js";
import { getKeybindingManager, type KeybindingManager } from "./keybindings.js";
import { navItems, settingsItems } from "./navigation.js";
import { getStatus } from "./state/store.js";
import type { ContentItem, MenuItem, NoticeType, TuiState, ViewId } from "./state/types.js";
import {
  asArray,
  asNumber,
  asObject,
  chatItem,
  chatMessageItems,
  flattenBoards,
  genericItem,
  historyItem,
  isAbortError,
  jsonPreviewLines,
  loadChatUserNames,
  mapLimit,
  noticeItem,
  overviewStats,
  topicItem,
  unreadStats,
  userItem
} from "./helpers.js";
import {
  appendTopicPosts,
  buildTopicReader,
  currentTopicPost,
  findTopicPostByFloor,
  jumpRelativeTopicFloor,
  getTopicPageInfo,
  jumpToPage,
  jumpToFloor,
  jumpToLastPage,
  FLOORS_PER_PAGE
} from "./topic-reader.js";

type RenderFn = () => void;
type CloseFn = () => void;
type SignalFn = () => AbortSignal;

export class TuiController {
  private loadVersion = 0;
  private readonly keybindings: KeybindingManager;

  constructor(
    private readonly state: TuiState,
    private readonly client: CachedCc98Client,
    private readonly tokenStore: TokenStore,
    private readonly render: RenderFn,
    private readonly close: CloseFn,
    private readonly nextSignal: SignalFn,
    private readonly abortCurrent: () => void
  ) {
    this.keybindings = getKeybindingManager();
  }

  async load(force = false): Promise<void> {
    const version = ++this.loadVersion;
    const signal = this.nextSignal();
    const nav = navItems[this.state.navIndex] ?? navItems[0];
    this.state.viewTitle = nav.label;
    this.state.loading = true;
    this.state.error = undefined;
    this.state.itemIndex = 0;
    this.state.scroll = 0;
    this.state.mode = nav.id === "settings" && this.state.mode === "settings" ? "settings" : "list";
    if (this.state.mode === "settings") {
      this.state.focus = "content";
    }
    this.state.items = [];
    this.state.stats = [];
    this.state.topic = undefined;
    this.state.parentList = undefined;
    this.state.currentBoard = undefined;
    this.state.currentChat = undefined;
    this.render();

    try {
      // 加载快捷键配置
      await this.keybindings.load();
      this.state.account = await this.tokenStore.getCurrentAccountName();
      const next = await this.loadView(nav.id, force, signal);
      if (version !== this.loadVersion) return;
      this.state.viewTitle = next.title;
      this.state.items = next.items;
      this.state.stats = next.stats;
      if (next.overview) {
        this.state.overview = next.overview;
      }
      this.state.status = next.status ?? "";
    } catch (error) {
      if (isAbortError(error) || version !== this.loadVersion) return;
      this.state.error = error instanceof Error ? error.message : String(error);
      this.state.items = [];
      this.state.stats = [];
    } finally {
      if (version === this.loadVersion) {
        this.state.loading = false;
        this.render();
      }
    }
  }

  handleKey(key: string): void {
    if (this.state.inputMode) {
      this.handleInputKey(key);
      return;
    }
    if (this.keybindings.matches(key, "quit")) {
      this.close();
      return;
    }
    if (this.keybindings.matches(key, "help")) {
      this.state.modal = this.state.modal === "help" ? null : "help";
      this.render();
      return;
    }
    if (this.state.modal) {
      this.handleModalKey(key);
      return;
    }
    if (this.state.mode === "topic") {
      this.handleTopicKey(key);
      return;
    }
    if (this.state.mode === "settings") {
      this.handleSettingsKey(key);
      return;
    }
    if (this.state.focus === "nav") {
      this.handleNavKey(key);
      return;
    }
    this.handleContentKey(key);
  }

  private handleInputKey(key: string): void {
    if (this.keybindings.matches(key, "inputCancel")) {
      this.state.inputMode = false;
      this.state.inputValue = "";
      this.render();
      return;
    }
    if (this.keybindings.matches(key, "inputConfirm")) {
      this.state.inputCallback?.(this.state.inputValue);
      return;
    }
    if (this.keybindings.matches(key, "inputBackspace")) {
      this.state.inputValue = this.state.inputValue.slice(0, -1);
      this.render();
      return;
    }
    if (key.length === 1 && key >= " ") {
      this.state.inputValue += key;
      this.render();
    }
  }

  private handleModalKey(key: string): void {
    if (this.state.modal === "help" || this.state.modal === "info") {
      // 帮助/信息弹窗：任意键关闭
      this.closeModal();
      return;
    }
    if (this.state.modal === "search") {
      this.handleSearchKey(key);
      return;
    }
    if (this.state.modal === "user") {
      this.handleUserModalKey(key);
      return;
    }
    if (this.state.modal === "menu") {
      this.handleMenuKey(key);
    }
  }

  private handleSearchKey(key: string): void {
    if (this.keybindings.matches(key, "searchClose")) {
      this.state.modal = null;
      this.state.searchQuery = "";
      this.render();
      return;
    }
    if (this.keybindings.matches(key, "searchToggleMode")) {
      this.state.searchMode = this.state.searchMode === "topics" ? "users" : "topics";
      this.state.searchResults = [];
      this.state.itemIndex = 0;
      this.render();
      return;
    }
    if (this.keybindings.matches(key, "searchNext") && this.state.searchResults.length > 0) {
      this.state.itemIndex = Math.min(this.state.searchResults.length - 1, this.state.itemIndex + 1);
      this.render();
      return;
    }
    if (this.keybindings.matches(key, "searchPrev") && this.state.searchResults.length > 0) {
      this.state.itemIndex = Math.max(0, this.state.itemIndex - 1);
      this.render();
      return;
    }
    if (this.keybindings.matches(key, "searchExecute")) {
      const selected = this.state.searchResults[this.state.itemIndex];
      if (selected) {
        // 有选中项：打开
        this.state.modal = null;
        void this.activateContentItem(selected, this.nextSignal());
      } else if (this.state.searchQuery.trim()) {
        // 无选中项：执行搜索
        void this.performSearch(this.nextSignal());
      }
      return;
    }
    if (key === "\x7f") {
      this.state.searchQuery = this.state.searchQuery.slice(0, -1);
      this.state.searchResults = [];
      this.state.itemIndex = 0;
      this.render();
      return;
    }
    if (key.length === 1 && key >= " ") {
      this.state.searchQuery += key;
      this.state.searchResults = [];
      this.state.itemIndex = 0;
      this.render();
    }
  }

  private handleUserModalKey(key: string): void {
    if (key === "\x1b" || key === "u") {
      // Esc 或 u 关闭用户详情
      this.closeModal();
      return;
    }
    if (key === "f" && this.state.userDetail) {
      void this.toggleFollow();
      return;
    }
    if (key === "m" && this.state.userDetail) {
      const user = this.state.userDetail;
      this.state.inputMode = true;
      this.state.inputPrompt = `发送私信给 ${user.name}: `;
      this.state.inputValue = "";
      this.state.inputCallback = (value) => {
        this.state.inputMode = false;
        this.state.inputValue = "";
        if (value.trim()) {
          void this.sendPrivateMessage(user.userId, value.trim());
        } else {
          this.render();
        }
      };
      this.render();
    }
  }

  private handleMenuKey(key: string): void {
    if (this.keybindings.matches(key, "menuNext")) {
      this.state.menuIndex = Math.min(Math.max(0, this.state.menuItems.length - 1), this.state.menuIndex + 1);
      this.render();
      return;
    }
    if (this.keybindings.matches(key, "menuPrev")) {
      this.state.menuIndex = Math.max(0, this.state.menuIndex - 1);
      this.render();
      return;
    }
    if (this.keybindings.matches(key, "menuClose")) {
      this.state.modal = null;
      this.render();
      return;
    }
    if (this.keybindings.matches(key, "menuExecute")) {
      // Enter 或 l 执行选中项
      const selected = this.state.menuItems[this.state.menuIndex];
      this.state.modal = null;
      if (selected?.action === "refresh") void this.refresh();
      if (selected?.action === "back") this.leave();
      this.render();
    }
  }

  private handleTopicKey(key: string): void {
    // 数字输入：收集跳转目标
    if (/^\d$/.test(key) && this.state.topic) {
      this.state.topic.floorInput = `${this.state.topic.floorInput}${key}`.slice(0, 6);
      this.state.status = `输入: ${this.state.topic.floorInput}`;
      this.render();
      return;
    }
    // 退格：删除输入
    if (key === "\x7f" && this.state.topic?.floorInput) {
      this.state.topic.floorInput = this.state.topic.floorInput.slice(0, -1);
      this.state.status = this.state.topic.floorInput ? `输入: ${this.state.topic.floorInput}` : getStatus(this.state);
      this.render();
      return;
    }
    // g：跳页
    if (key === "g" && this.state.topic?.floorInput) {
      const page = Number(this.state.topic.floorInput);
      this.state.topic.jumpTarget = { type: "page", value: page };
      this.state.topic.floorInput = "";
      this.state.status = `跳转到第 ${page} 页？Enter 确认  Esc 取消`;
      this.render();
      return;
    }
    // G：跳楼
    if (key === "G" && this.state.topic?.floorInput) {
      const floor = Number(this.state.topic.floorInput);
      this.state.topic.jumpTarget = { type: "floor", value: floor };
      this.state.topic.floorInput = "";
      this.state.status = `跳转到第 ${floor} 楼？Enter 确认  Esc 取消`;
      this.render();
      return;
    }
    // G（无数字）：跳到最后一页
    if (key === "G" && !this.state.topic?.floorInput && this.state.topic) {
      const pageInfo = getTopicPageInfo(this.state.topic, this.state.scroll);
      this.state.topic.jumpTarget = { type: "page", value: pageInfo.totalPages };
      this.state.status = `跳转到最后一页（第 ${pageInfo.totalPages} 页）？Enter 确认  Esc 取消`;
      this.render();
      return;
    }
    // Enter：确认跳转
    if (key === "\r" && this.state.topic?.jumpTarget) {
      const target = this.state.topic.jumpTarget;
      this.state.topic.jumpTarget = undefined;
      if (target.type === "page") {
        void this.jumpToTopicPage(target.value, this.nextSignal());
      } else {
        void this.jumpToTopicFloor(target.value, this.nextSignal());
      }
      return;
    }
    // Esc：取消跳转
    if (key === "\x1b" && (this.state.topic?.floorInput || this.state.topic?.jumpTarget)) {
      this.state.topic.floorInput = "";
      this.state.topic.jumpTarget = undefined;
      this.state.status = getStatus(this.state);
      this.render();
      return;
    }
    // ]：下一层
    if (this.keybindings.matches(key, "topicNextFloor") && this.state.topic) {
      this.state.scroll = jumpRelativeTopicFloor(this.state.topic, this.state.scroll, 1);
      this.state.status = this.getTopicStatus();
      this.render();
      void this.checkAutoLoad();
      return;
    }
    // [：上一层
    if (this.keybindings.matches(key, "topicPrevFloor") && this.state.topic) {
      this.state.scroll = jumpRelativeTopicFloor(this.state.topic, this.state.scroll, -1);
      this.state.status = this.getTopicStatus();
      this.render();
      return;
    }
    // }：下一页
    if (this.keybindings.matches(key, "topicNextPage") && this.state.topic) {
      void this.jumpToNextPage();
      return;
    }
    // {：上一页
    if (this.keybindings.matches(key, "topicPrevPage") && this.state.topic) {
      void this.jumpToPrevPage();
      return;
    }
    // h/Esc：返回
    if (this.keybindings.matches(key, "back")) {
      this.leave();
      return;
    }
    // j：下移
    if (this.keybindings.matches(key, "topicScrollDown")) {
      const maxScroll = Math.max(0, (this.state.topic?.lines.length ?? 0) - 1);
      this.state.scroll = Math.min(maxScroll, this.state.scroll + 1);
      this.state.status = this.getTopicStatus();
      this.render();
      void this.checkAutoLoad();
      return;
    }
    // k：上移
    if (this.keybindings.matches(key, "topicScrollUp")) {
      this.state.scroll = Math.max(0, this.state.scroll - 1);
      this.state.status = this.getTopicStatus();
      this.render();
      return;
    }
    // r：刷新
    if (this.keybindings.matches(key, "topicRefresh") && this.state.topic) {
      void this.openTopic(this.state.topic.topicId, true, this.nextSignal());
      return;
    }
    // s：收藏
    if (this.keybindings.matches(key, "topicFavorite")) void this.toggleFavorite();
    // l：点赞
    if (this.keybindings.matches(key, "topicLike")) void this.reactToCurrentPost(true);
    // d：踩
    if (this.keybindings.matches(key, "topicDislike")) void this.reactToCurrentPost(false);
    // u：查看用户
    if (this.keybindings.matches(key, "topicUser")) void this.showCurrentUser(this.nextSignal());
    // v：查看投票
    if (this.keybindings.matches(key, "topicVote")) void this.showTopicVote(this.nextSignal());
    // a：查看评价
    if (this.keybindings.matches(key, "topicReaction")) void this.showPostReactionState(this.nextSignal());
    // o：打开图片/菜单
    if (this.keybindings.matches(key, "topicOpenImage")) {
      const currentLine = this.getCurrentTopicLine();
      if (currentLine?.kind === "image" && currentLine.imageUrl) {
        void this.openImage(currentLine.imageUrl);
      } else {
        this.openMenu();
      }
    }
    // c：复制链接
    if (this.keybindings.matches(key, "topicCopyLink")) {
      const currentLine = this.getCurrentTopicLine();
      if (currentLine?.kind === "image" && currentLine.imageUrl) {
        void this.copyToClipboard(currentLine.imageUrl);
      } else if (currentLine?.kind === "link" && currentLine.linkUrl) {
        void this.copyToClipboard(currentLine.linkUrl);
      }
    }
  }

  private handleSettingsKey(key: string): void {
    if (this.keybindings.matches(key, "moveDown")) {
      this.state.itemIndex = Math.min(settingsItems.length - 1, this.state.itemIndex + 1);
      this.render();
      return;
    }
    if (this.keybindings.matches(key, "moveUp")) {
      this.state.itemIndex = Math.max(0, this.state.itemIndex - 1);
      this.render();
      return;
    }
    if (this.keybindings.matches(key, "back")) {
      this.state.mode = "list";
      this.state.focus = "nav";
      this.state.status = getStatus(this.state);
      this.render();
      return;
    }
    if (this.keybindings.matches(key, "confirm") || this.keybindings.matches(key, "moveRight")) {
      void this.activateSetting(settingsItems[this.state.itemIndex]);
    }
  }

  private handleNavKey(key: string): void {
    if (this.keybindings.matches(key, "moveDown")) {
      this.state.navIndex = Math.min(navItems.length - 1, this.state.navIndex + 1);
      void this.load();
      return;
    }
    if (this.keybindings.matches(key, "moveUp")) {
      this.state.navIndex = Math.max(0, this.state.navIndex - 1);
      void this.load();
      return;
    }
    if (this.keybindings.matches(key, "confirm") || this.keybindings.matches(key, "moveRight")) {
      if (!this.state.loading && this.state.items.length > 0) {
        if (navItems[this.state.navIndex]?.id === "settings") this.state.mode = "settings";
        this.state.focus = "content";
        this.state.itemIndex = 0;
        this.state.status = getStatus(this.state);
        this.render();
      }
      return;
    }
    if (this.keybindings.matches(key, "refresh")) void this.load(true);
  }

  private handleContentKey(key: string): void {
    if (this.keybindings.matches(key, "listNext")) {
      this.state.itemIndex = Math.min(Math.max(0, this.state.items.length - 1), this.state.itemIndex + 1);
      this.render();
      return;
    }
    if (this.keybindings.matches(key, "listPrev")) {
      this.state.itemIndex = Math.max(0, this.state.itemIndex - 1);
      this.render();
      return;
    }
    if (this.keybindings.matches(key, "listBack")) {
      this.leave();
      return;
    }
    if (this.keybindings.matches(key, "listOpen")) {
      const selected = this.state.items[this.state.itemIndex];
      if (selected) {
        void this.activateContentItem(selected, this.nextSignal());
      } else {
        this.state.status = "当前条目不可进入";
        this.render();
      }
      return;
    }
    if (this.keybindings.matches(key, "listRefresh")) void this.refresh();
    if (this.keybindings.matches(key, "search")) this.openSearch();
    if (this.keybindings.matches(key, "menu")) this.openMenu();
  }

  private leave(): void {
    this.abortCurrent();
    if (this.state.mode === "topic") {
      this.state.mode = "list";
      this.state.focus = "content";
      this.state.status = "";
      this.render();
      return;
    }
    if (this.state.parentList) {
      this.restoreParentList();
      this.render();
      return;
    }
    this.state.focus = "nav";
    this.state.status = "";
    this.render();
  }

  private refresh(): void {
    if (this.state.currentBoard) {
      void this.openBoard(this.state.currentBoard.boardId, this.state.currentBoard.title, true, this.nextSignal(), false);
    } else if (this.state.currentChat) {
      void this.openChat(this.state.currentChat.userId, this.state.currentChat.title, true, this.nextSignal(), false);
    } else {
      void this.load(true);
    }
  }

  private openSearch(): void {
    this.state.modal = "search";
    this.state.searchQuery = "";
    this.state.searchResults = [];
    this.state.searchMode = "topics";
    this.state.searchScope = this.getSearchScope();
    this.state.itemIndex = 0;
    this.render();
  }

  private getSearchScope(): { label: string; boardId?: number } {
    // 根据当前位置确定搜索范围
    if (this.state.currentBoard) {
      return { label: this.state.currentBoard.title, boardId: this.state.currentBoard.boardId };
    }
    return { label: "全站" };
  }

  private openMenu(): void {
    this.state.modal = "menu";
    this.state.menuItems = this.getMenuItems();
    this.state.menuIndex = 0;
    this.render();
  }

  private getMenuItems(): MenuItem[] {
    if (this.state.mode === "topic") {
      return [
        { label: "刷新", key: "r", action: "refresh" },
        { label: "返回列表", key: "h", action: "back" }
      ];
    }
    if (this.state.mode === "list") {
      const items = [{ label: "刷新", key: "r", action: "refresh" }];
      if (this.state.currentBoard) items.push({ label: "返回版面列表", key: "h", action: "back" });
      return items;
    }
    return [];
  }

  private closeModal(): void {
    this.state.modal = null;
    this.state.infoTitle = undefined;
    this.state.infoLines = [];
    this.state.userDetail = undefined;
    this.render();
  }

  private async loadView(view: ViewId, force: boolean, signal?: AbortSignal): Promise<{
    title: string;
    items: ContentItem[];
    stats: ContentItem[];
    overview?: ContentItem[];
    status?: string;
  }> {
    switch (view) {
      case "hot": {
        const [index, unread] = await Promise.all([
          this.client.getForumIndex(force, signal),
          this.client.getUnreadCount(force, signal)
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
        const topics = asArray(await this.client.getNewTopics(0, 12, force, signal));
        return { title: "最新", items: topics.map((topic) => topicItem(topic)), stats: [{ title: "新帖流", detail: `${topics.length} 条` }] };
      }
      case "boards": {
        const sections = asArray(await this.client.getAllBoards(force, signal));
        const boards = flattenBoards(sections);
        return {
          title: "版面",
          items: boards.slice(0, 24),
          stats: [{ title: "分区", detail: `${sections.length}` }, { title: "版面", detail: `${boards.length}` }],
          status: "版面：j/k 选择  Enter 进入版面  h 返回  r 刷新"
        };
      }
      case "following": {
        const topics = asArray(await this.client.getFolloweeTopics(0, 12, force, signal));
        return {
          title: "关注",
          items: topics.map((topic) => topicItem(topic)),
          stats: [{ title: "关注动态", detail: `${topics.length} 条` }, { title: "缓存", detail: "30s" }],
          status: "关注：j/k 选择  Enter 打开帖子  h 返回  r 刷新"
        };
      }
      case "favorite": {
        const [meRaw, sectionsRaw, topicFavorites] = await Promise.all([
          this.client.getMe(force, signal),
          this.client.getAllBoards(false, signal),
          this.client.getFavoriteTopics(0, 6, 1, 0, force, signal)
        ]);
        const customBoards = asArray(asObject(meRaw).customBoards).filter((id): id is number => typeof id === "number");
        const allBoards = flattenBoards(asArray(sectionsRaw));
        const boardById = new Map(allBoards.filter((board) => board.boardId !== undefined).map((board) => [board.boardId, board]));
        const topicGroups = await mapLimit(customBoards, 3, async (boardId) => {
          const board = boardById.get(boardId);
          const topics = asArray(await this.client.getBoardTopics(boardId, 0, 3, false, force, signal));
          return topics.map((topic) => topicItem(topic, board));
        });
        const boardTopics = topicGroups.flat().sort((left, right) => (right.sortTime ?? 0) - (left.sortTime ?? 0)).slice(0, 12);
        return {
          title: "收藏",
          items: [
            { title: "收藏主题", meta: "topic/me/favorite", detail: "查看收藏夹主题列表", action: "favorite-topics" },
            { title: "收藏更新", meta: "topic/me/favorite?order=1", detail: "查看收藏主题更新", action: "favorite-updates" },
            { title: "收藏分组", meta: "me/favorite-topic-group", detail: "查看收藏夹分组", action: "favorite-groups" },
            ...asArray(topicFavorites).slice(0, 6).map((topic) => topicItem(topic)),
            ...boardTopics
          ],
          stats: [
            { title: "收藏版面", detail: `${customBoards.length} 个` },
            { title: "收藏主题", detail: `${asArray(topicFavorites).length} 条` },
            { title: "版面主题", detail: `${boardTopics.length} 条` }
          ],
          status: "收藏：j/k 选择  Enter 打开  h 返回  r 刷新"
        };
      }
      case "messages": {
        const [unread, recent] = await Promise.all([
          this.client.getUnreadCount(force, signal),
          this.client.getRecentChats(0, 10, force, signal)
        ]);
        const chats = asArray(recent);
        const names = await loadChatUserNames(this.client, chats, force, signal);
        return {
          title: "消息",
          items: chats.length > 0 ? chats.map((chat) => chatItem(chat, names)) : [{ title: "暂无最近私信", meta: "recent-contact-users" }],
          stats: unreadStats(asObject(unread)),
          status: "消息：j/k 选择  Enter 打开会话  h 返回  r 刷新"
        };
      }
      case "notices": {
        const unread = asObject(await this.client.getUnreadCount(force, signal));
        return {
          title: "通知",
          items: [
            { title: "系统通知", meta: `${unread.systemCount ?? 0} 未读`, detail: "查看系统通知列表", action: "notices:system" },
            { title: "@ 通知", meta: `${unread.atCount ?? 0} 未读`, detail: "查看提到我的通知", action: "notices:at" },
            { title: "回复通知", meta: `${unread.replyCount ?? 0} 未读`, detail: "查看回复我的通知", action: "notices:reply" }
          ],
          stats: unreadStats(unread),
          status: "通知：j/k 选择  Enter 打开列表  h 返回  r 刷新"
        };
      }
      case "me": {
        const [me, cacheStats] = await Promise.all([this.client.getMe(force, signal), this.client.getCacheStats()]);
        const meObject = asObject(me);
        return {
          title: "我的",
          items: [
            { title: String(meObject.name ?? "当前账号"), meta: `#${meObject.id ?? "?"}`, detail: String(meObject.levelTitle ?? meObject.groupName ?? ""), userId: asNumber(meObject.id) },
            { title: "我的最近主题", meta: "me/recent-topic", detail: "查看自己最近发布或回复的主题", action: "recent-topics" },
            { title: "浏览历史", meta: "me/browsing-record", detail: "查看最近浏览过的主题", action: "browse-history" },
            { title: "粉丝列表", meta: "me/follower", detail: "查看关注我的用户", action: "followers" },
            { title: "关注列表", meta: "me/followee", detail: "查看我关注的用户", action: "followees" },
            { title: "随机主题", meta: "topic/random-recent", detail: "随机读取一组最近主题", action: "random-topics" },
            { title: "每日签到", meta: "me/signin", detail: "执行签到", action: "signin" }
          ],
          stats: [
            { title: "登录状态", detail: "已登录" },
            { title: "缓存", detail: `${cacheStats.fileCacheEntries} 文件` }
          ],
          status: "我的：j/k 选择  Enter 打开  h 返回  r 刷新"
        };
      }
      case "settings": {
        const cacheStats = await this.client.getCacheStats();
        return {
          title: "设置",
          items: [...settingsItems],
          stats: [{ title: "缓存", detail: `${cacheStats.fileCacheEntries} 文件` }, { title: "版本", detail: `v${appVersion}` }],
          status: "设置：j/k 选择  Enter 执行  h 返回"
        };
      }
    }
  }

  private async activateSetting(selected: ContentItem | undefined): Promise<void> {
    if (!selected) return;
    if (selected.meta === "help") {
      this.state.modal = "help";
      this.render();
      return;
    }
    if (selected.meta === "keybindings") {
      void this.openKeybindingEditor();
      return;
    }
    if (selected.meta === "cache") {
      this.state.status = "正在清理缓存...";
      this.render();
      try {
        await this.client.clearCache();
        this.state.status = "缓存已清理";
        await this.load(true);
      } catch {
        this.state.status = "缓存清理失败";
        this.render();
      }
      return;
    }
    if (selected.meta === "update") {
      this.state.status = "正在检查 GitHub Release...";
      this.render();
      try {
        const result = await checkForUpdate();
        this.state.status = result.message;
      } catch (error) {
        this.state.status = error instanceof Error ? error.message : "检查更新失败";
      }
      this.render();
      return;
    }
    this.state.status = selected.meta === "logout" ? "退出登录功能开发中..." : "账号切换功能开发中...";
    this.render();
  }

  private async activateContentItem(selected: ContentItem, signal: AbortSignal): Promise<void> {
    if (selected.topicId !== undefined) {
      await this.openTopic(selected.topicId, false, signal);
      return;
    }
    if (selected.boardId !== undefined) {
      await this.openBoard(selected.boardId, selected.title, false, signal);
      return;
    }
    if (selected.chatUserId !== undefined) {
      await this.openChat(selected.chatUserId, selected.title, false, signal);
      return;
    }
    if (selected.userId !== undefined) {
      await this.showUserDetailById(selected.userId, signal);
      return;
    }
    if (selected.action?.startsWith("notices:")) {
      await this.openNoticeList(selected.action.split(":")[1] as NoticeType, signal);
      return;
    }
    if (selected.action) {
      await this.runReadOnlyAction(selected.action, signal);
      return;
    }
    this.state.status = "当前条目不可进入";
    this.render();
  }

  private async openTopic(topicId: number, force: boolean, signal: AbortSignal): Promise<void> {
    this.state.mode = "topic";
    this.state.loading = true;
    this.state.error = undefined;
    this.state.status = "";
    this.state.topic = undefined;
    this.state.scroll = 0;
    this.render();
    try {
      const [topicRaw, postsRaw] = await Promise.all([
        this.client.getTopic(topicId, force, signal),
        this.client.getTopicPosts(topicId, 0, 10, force, signal)
      ]);
      this.state.topic = buildTopicReader(topicId, asObject(topicRaw), asArray(postsRaw), 10);
      this.state.loading = false;
      this.state.status = "";
    } catch (error) {
      if (!isAbortError(error)) {
        this.state.error = error instanceof Error ? error.message : String(error);
        this.state.loading = false;
      }
    }
    this.render();
  }

  private async openBoard(boardId: number, title: string, force: boolean, signal: AbortSignal, pushParent = true): Promise<void> {
    if (pushParent) this.snapshotParent();
    this.state.loading = true;
    this.state.error = undefined;
    this.state.viewTitle = title;
    this.state.focus = "content";
    this.state.currentBoard = { boardId, title };
    this.state.itemIndex = 0;
    this.state.scroll = 0;
    this.render();
    try {
      const topics = asArray(await this.client.getBoardTopics(boardId, 0, 20, false, force, signal));
      this.state.items = topics.map((topic) => topicItem(topic, { title, boardId }));
      this.state.stats = [{ title: "主题", detail: `${topics.length} 条` }];
      this.state.status = `版面 ${title}: j/k 选择  Enter 打开帖子  h 返回`;
    } catch (error) {
      if (!isAbortError(error)) this.state.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.state.loading = false;
      this.render();
    }
  }

  private async openChat(userId: number, title: string, force: boolean, signal: AbortSignal, pushParent = true): Promise<void> {
    if (pushParent) this.snapshotParent();
    this.state.loading = true;
    this.state.error = undefined;
    this.state.viewTitle = `私信: ${title}`;
    this.state.focus = "content";
    this.state.itemIndex = 0;
    this.state.scroll = 0;
    this.render();
    try {
      const messages = asArray(await this.client.getChatHistory(userId, 0, 10, force, signal));
      this.state.items = chatMessageItems(messages, title, userId);
      this.state.currentChat = { userId, title, loaded: messages.length, size: 10, hasMore: messages.length >= 10 };
      this.state.stats = [{ title: "会话", detail: title }, { title: "消息", detail: `${messages.length}` }];
      this.state.status = "私信：n 加载更多  h 返回";
    } catch (error) {
      if (!isAbortError(error)) this.state.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.state.loading = false;
      this.render();
    }
  }

  private async loadNextChatPage(signal: AbortSignal): Promise<void> {
    const chat = this.state.currentChat;
    if (!chat?.hasMore || this.state.loadingMore) return;
    this.state.loadingMore = true;
    this.render();
    try {
      const messages = asArray(await this.client.getChatHistory(chat.userId, chat.loaded, chat.size, false, signal));
      this.state.items.push(...chatMessageItems(messages, chat.title, chat.userId));
      chat.loaded += messages.length;
      chat.hasMore = messages.length >= chat.size;
      this.state.status = chat.hasMore ? "已加载更多私信" : "已到底";
    } catch (error) {
      if (!isAbortError(error)) this.state.status = error instanceof Error ? error.message : "加载失败";
    } finally {
      this.state.loadingMore = false;
      this.render();
    }
  }

  private getTopicStatus(): string {
    const topic = this.state.topic;
    if (!topic) return "";
    const pageInfo = getTopicPageInfo(topic, this.state.scroll);
    const loading = this.state.loadingMore ? " · 加载中" : "";
    return `${pageInfo.currentPage}/${pageInfo.totalPages} 页  ${pageInfo.currentFloor}/${pageInfo.totalFloors} 楼${loading}`;
  }

  private async checkAutoLoad(): Promise<void> {
    const topic = this.state.topic;
    if (!topic?.hasMore || this.state.loadingMore) return;
    // 当滚动到倒数第 3 行时，自动加载下一页
    const remaining = topic.lines.length - this.state.scroll;
    if (remaining <= 3) {
      void this.loadNextTopicPage(this.nextSignal(), true);
    }
  }

  private async jumpToNextPage(): Promise<void> {
    const topic = this.state.topic;
    if (!topic) return;
    const pageInfo = getTopicPageInfo(topic, this.state.scroll);
    if (pageInfo.currentPage < pageInfo.totalPages) {
      this.state.scroll = jumpToPage(topic, pageInfo.currentPage + 1);
      this.state.status = this.getTopicStatus();
      this.render();
      void this.checkAutoLoad();
    } else if (topic.hasMore && !this.state.loadingMore) {
      // 当前是最后一页，但还有更多内容，加载下一页
      await this.loadNextTopicPage(this.nextSignal());
      const newPageInfo = getTopicPageInfo(topic, this.state.scroll);
      this.state.scroll = jumpToPage(topic, newPageInfo.currentPage + 1);
      this.state.status = this.getTopicStatus();
      this.render();
    }
  }

  private async jumpToPrevPage(): Promise<void> {
    const topic = this.state.topic;
    if (!topic) return;
    const pageInfo = getTopicPageInfo(topic, this.state.scroll);
    if (pageInfo.currentPage > 1) {
      this.state.scroll = jumpToPage(topic, pageInfo.currentPage - 1);
      this.state.status = this.getTopicStatus();
      this.render();
    }
  }

  private async jumpToTopicPage(page: number, signal: AbortSignal): Promise<void> {
    const topic = this.state.topic;
    if (!topic) return;
    // 如果目标页未加载，需要加载到该页
    const targetFloor = (page - 1) * FLOORS_PER_PAGE + 1;
    while (topic.hasMore && !findTopicPostByFloor(topic, targetFloor)) {
      await this.loadNextTopicPage(signal, true);
    }
    const post = findTopicPostByFloor(topic, targetFloor);
    if (post) {
      this.state.scroll = post.lineStart;
      this.state.status = this.getTopicStatus();
    } else {
      this.state.status = `未找到第 ${page} 页`;
    }
    this.render();
  }

  private async loadNextTopicPage(signal: AbortSignal, quiet = false): Promise<void> {
    const topic = this.state.topic;
    if (!topic?.hasMore || this.state.loadingMore) return;
    this.state.loadingMore = true;
    if (!quiet) this.render();
    try {
      const posts = asArray(await this.client.getTopicPosts(topic.topicId, topic.loaded, topic.size, false, signal));
      appendTopicPosts(topic, posts);
      this.state.status = topic.hasMore ? "已加载下一页" : "已到底";
    } catch (error) {
      if (!isAbortError(error)) this.state.status = error instanceof Error ? error.message : "加载失败";
    } finally {
      this.state.loadingMore = false;
      this.render();
    }
  }

  private async jumpToTopicFloor(floor: number, signal: AbortSignal): Promise<void> {
    const topic = this.state.topic;
    if (!topic) return;
    const loaded = findTopicPostByFloor(topic, floor);
    if (loaded) {
      this.state.scroll = loaded.lineStart;
      this.state.status = getStatus(this.state);
      this.render();
      return;
    }
    while (topic.hasMore && !findTopicPostByFloor(topic, floor)) {
      await this.loadNextTopicPage(signal, true);
    }
    const post = findTopicPostByFloor(topic, floor);
    this.state.scroll = post?.lineStart ?? this.state.scroll;
    this.state.status = post ? getStatus(this.state) : `未找到 ${floor} 楼`;
    this.render();
  }

  private async runReadOnlyAction(action: string, signal: AbortSignal): Promise<void> {
    switch (action) {
      case "random-topics": {
        const topics = asArray(await this.client.getRandomTopics(10, true, signal));
        this.openReadOnlyList("随机主题", topics.map((topic) => topicItem(topic)), [{ title: "主题", detail: `${topics.length}` }]);
        return;
      }
      case "recent-topics": {
        const topics = asArray(await this.client.getRecentTopics(undefined, 0, 11, false, signal));
        this.openReadOnlyList("我的最近主题", topics.map((topic) => topicItem(topic)), [{ title: "主题", detail: `${topics.length}` }]);
        return;
      }
      case "browse-history": {
        const topics = asArray(await this.client.getBrowseHistory(0, 11, false, signal));
        this.openReadOnlyList("浏览历史", topics.map((topic) => historyItem(topic)), [{ title: "记录", detail: `${topics.length}` }]);
        return;
      }
      case "favorite-topics":
      case "favorite-updates": {
        const order = action === "favorite-updates" ? 1 : 0;
        const topics = asArray(await this.client.getFavoriteTopics(0, 11, order, 0, false, signal));
        this.openReadOnlyList(action === "favorite-updates" ? "收藏更新" : "收藏主题", topics.map((topic) => topicItem(topic)), [{ title: "主题", detail: `${topics.length}` }]);
        return;
      }
      case "favorite-groups": {
        const groups = asArray(await this.client.getFavoriteGroups(false, signal));
        this.openReadOnlyList("收藏分组", groups.map((group) => genericItem(group, "收藏分组")), [{ title: "分组", detail: `${groups.length}` }]);
        return;
      }
      case "followers":
      case "followees": {
        await this.openFriendUsers(action === "followers" ? "follower" : "followee", signal);
        return;
      }
      case "card-stat": {
        const stat = await this.client.getCardStat(false, signal);
        this.state.modal = "info";
        this.state.infoTitle = "全站统计";
        this.state.infoLines = jsonPreviewLines(stat);
        this.render();
        return;
      }
      case "rate-reasons:0":
      case "rate-reasons:1": {
        const type = action.endsWith(":1") ? 1 : 0;
        const reasons = asArray(await this.client.getPostRateReasons(type, false, signal));
        this.openReadOnlyList(type === 1 ? "评分原因: 管理" : "评分原因: 普通", reasons.map((reason) => genericItem(reason, "评分原因")), [{ title: "原因", detail: `${reasons.length}` }]);
        return;
      }
      case "signin": {
        await this.signin();
        return;
      }
    }
    this.state.status = "暂不支持该入口";
    this.render();
  }

  private async openNoticeList(type: NoticeType, signal: AbortSignal): Promise<void> {
    const notices = asArray(await this.client.getNotices(type, 0, 10, false, signal));
    const titleMap: Record<NoticeType, string> = { system: "系统通知", at: "@ 通知", reply: "回复通知" };
    this.openReadOnlyList(titleMap[type], notices.map((notice) => noticeItem(notice)), [{ title: "通知", detail: `${notices.length}` }]);
  }

  private async performSearch(signal: AbortSignal): Promise<void> {
    const query = this.state.searchQuery.trim();
    if (!query) return;
    this.state.loading = true;
    this.render();
    try {
      const results = this.state.searchMode === "topics"
        ? this.filterSearchTopicScope(asArray(await this.client.searchTopics(query, 0, 20, true, signal)).map((topic) => topicItem(topic)))
        : asArray(await this.client.searchUsers(query, true, signal)).map((user) => userItem(user));
      this.state.searchResults = results;
      this.state.itemIndex = 0;
    } catch (error) {
      if (!isAbortError(error)) this.state.status = error instanceof Error ? error.message : "搜索失败";
    } finally {
      this.state.loading = false;
      this.render();
    }
  }

  private filterSearchTopicScope(items: ContentItem[]): ContentItem[] {
    const boardId = this.state.searchScope.boardId;
    if (boardId === undefined) {
      return items;
    }
    return items.filter((item) => item.boardId === boardId);
  }

  private async toggleFavorite(): Promise<void> {
    const topic = this.state.topic;
    if (!topic) return;
    try {
      const isFavorite = await this.client.isTopicFavorite(topic.topicId, true);
      if (isFavorite) {
        await this.client.removeFavorite(topic.topicId);
        this.state.status = "已取消收藏";
      } else {
        await this.client.addFavorite(topic.topicId);
        this.state.status = "已收藏";
      }
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "收藏操作失败";
    }
    this.render();
  }

  private async reactToCurrentPost(isLike: boolean): Promise<void> {
    const topic = this.state.topic;
    if (!topic) return;
    const post = currentTopicPost(topic, this.state.scroll);
    if (!post?.id) {
      this.state.status = "当前楼层没有可操作的帖子 ID";
      this.render();
      return;
    }
    try {
      await this.client.reactToPost(post.id, isLike);
      this.state.status = isLike ? "已点赞" : "已踩";
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "操作失败";
    }
    this.render();
  }

  private async showCurrentUser(signal: AbortSignal): Promise<void> {
    const topic = this.state.topic;
    if (!topic) return;
    const post = currentTopicPost(topic, this.state.scroll);
    if (!post?.userId) {
      this.state.status = "当前楼层没有用户 ID";
      this.render();
      return;
    }
    await this.showUserDetailById(post.userId, signal);
  }

  private async showUserDetailById(userId: number, signal: AbortSignal): Promise<void> {
    this.state.status = "正在读取用户信息...";
    this.render();
    try {
      const [profileRaw, recentRaw] = await Promise.all([
        this.client.getUserProfile(userId, false, signal),
        this.client.getRecentTopics(userId, 0, 5, false, signal)
      ]);
      const profile = asObject(profileRaw);
      this.state.userDetail = {
        userId,
        name: String(profile.name ?? `#${userId}`),
        level: String(profile.levelTitle ?? profile.groupName ?? ""),
        postCount: asNumber(profile.postCount),
        fanCount: asNumber(profile.fanCount),
        followCount: asNumber(profile.followCount),
        isFollowing: Boolean(profile.isFollowing),
        recentTopics: asArray(recentRaw).map((topic) => topicItem(topic))
      };
      this.state.modal = "user";
      this.state.status = getStatus(this.state);
    } catch (error) {
      if (!isAbortError(error)) this.state.status = error instanceof Error ? error.message : "读取用户失败";
    }
    this.render();
  }

  private async showTopicVote(signal: AbortSignal): Promise<void> {
    const topic = this.state.topic;
    if (!topic) return;
    try {
      const vote = await this.client.getTopicVote(topic.topicId, false, signal);
      this.state.modal = "info";
      this.state.infoTitle = "投票信息";
      this.state.infoLines = jsonPreviewLines(vote);
    } catch (error) {
      if (!isAbortError(error)) this.state.status = error instanceof Error ? error.message : "读取投票失败";
    }
    this.render();
  }

  private async showPostReactionState(signal: AbortSignal): Promise<void> {
    const topic = this.state.topic;
    if (!topic) return;
    const post = currentTopicPost(topic, this.state.scroll);
    if (!post?.id) return;
    try {
      const state = await this.client.getPostReactionState(post.id, true, signal);
      this.state.modal = "info";
      this.state.infoTitle = "楼层评价";
      this.state.infoLines = jsonPreviewLines(state);
    } catch (error) {
      if (!isAbortError(error)) this.state.status = error instanceof Error ? error.message : "读取评价失败";
    }
    this.render();
  }

  private async toggleFollow(): Promise<void> {
    const user = this.state.userDetail;
    if (!user) return;
    try {
      if (user.isFollowing) {
        await this.client.unfollowUser(user.userId);
        user.isFollowing = false;
        this.state.status = "已取消关注";
      } else {
        await this.client.followUser(user.userId);
        user.isFollowing = true;
        this.state.status = "已关注";
      }
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "关注操作失败";
    }
    this.render();
  }

  private async sendPrivateMessage(userId: number, content: string): Promise<void> {
    try {
      await this.client.sendMessage(userId, content);
      this.state.status = "私信已发送";
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "发送失败";
    }
    this.render();
  }

  private getCurrentTopicLine(): import("./state/types.js").TopicLineEntry | undefined {
    const topic = this.state.topic;
    if (!topic) return undefined;
    for (const post of topic.posts) {
      const line = post.lines.find((entry) => entry.line === this.state.scroll);
      if (line) return line;
    }
    return undefined;
  }

  private async openImage(url: string): Promise<void> {
    this.state.status = "正在下载图片...";
    this.render();
    try {
      const cache = getImageCache();
      const localPath = await cache.getOrDownload(url);
      this.state.status = `已缓存: ${localPath}`;
      this.render();
      // 用系统默认程序打开图片
      const { execFile } = await import("node:child_process");
      const platform = process.platform;
      const command = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
      const args = platform === "win32" ? ["/c", "start", "", localPath] : [localPath];
      execFile(command, args, (error) => {
        if (error) {
          this.state.status = `打开失败: ${error.message}`;
          this.render();
        }
      });
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "图片下载失败";
      this.render();
    }
  }

  private async copyToClipboard(text: string): Promise<void> {
    try {
      const { spawn } = await import("node:child_process");
      const platform = process.platform;
      const command = platform === "win32" ? "clip" : platform === "darwin" ? "pbcopy" : "xclip";
      const args = platform === "linux" ? ["-selection", "clipboard"] : [];
      const child = spawn(command, args);
      child.stdin.end(text);
      child.on("error", () => {
        this.state.status = "复制失败";
        this.render();
      });
      child.on("close", (code) => {
        this.state.status = code === 0 ? "已复制到剪贴板" : "复制失败";
        this.render();
      });
    } catch {
      this.state.status = "复制失败";
      this.render();
    }
  }

  private async signin(): Promise<void> {
    this.state.status = "正在签到...";
    this.render();
    try {
      const result = await this.client.signin();
      this.state.modal = "info";
      this.state.infoTitle = "签到结果";
      this.state.infoLines = jsonPreviewLines(result);
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "签到失败";
    }
    this.render();
  }

  private async openKeybindingEditor(): Promise<void> {
    // 显示快捷键配置信息
    const config = this.keybindings.getConfig();
    const lines: string[] = [
      "快捷键配置文件: ~/.cc98-cli/keybindings.json",
      "",
      "当前配置:"
    ];
    
    // 显示主要快捷键
    const mainActions = [
      "moveUp", "moveDown", "moveLeft", "moveRight", "confirm", "back",
      "search", "refresh", "menu", "help", "quit",
      "topicNextPage", "topicPrevPage", "topicNextFloor", "topicPrevFloor",
      "topicJumpPage", "topicJumpFloor", "topicJumpLast"
    ];
    
    for (const action of mainActions) {
      const keys = config[action] ?? [];
      const desc = this.keybindings.getActionDescription(action as any);
      const keyStr = keys.map(k => this.keybindings.formatKey(k)).join("/");
      lines.push(`  ${desc}: ${keyStr}`);
    }
    
    lines.push("", "编辑配置文件后重启生效。", "", "按 Esc 返回设置");
    
    this.state.modal = "info";
    this.state.infoTitle = "快捷键设置";
    this.state.infoLines = lines;
    this.render();
  }

  private async openFriendUsers(type: "follower" | "followee", signal: AbortSignal): Promise<void> {
    const ids = asArray(await this.client.getFriendIds(type, 0, 20, false, signal)).filter((id): id is number => typeof id === "number");
    const users = asArray(await this.client.getUsers(ids, false, signal));
    this.openReadOnlyList(type === "follower" ? "粉丝列表" : "关注列表", users.map((user) => userItem(user)), [{ title: "用户", detail: `${users.length}` }]);
  }

  private openReadOnlyList(title: string, items: ContentItem[], stats: ContentItem[]): void {
    this.snapshotParent();
    this.state.viewTitle = title;
    this.state.items = items;
    this.state.stats = stats;
    this.state.itemIndex = 0;
    this.state.scroll = 0;
    this.state.focus = "content";
    this.state.currentBoard = undefined;
    this.state.currentChat = undefined;
    this.state.topic = undefined;
    this.state.mode = "list";
    this.state.status = `${title}: j/k 选择  Enter 打开  h 返回`;
    this.render();
  }

  private snapshotParent(): void {
    if (!this.state.parentList) {
      this.state.parentList = {
        title: this.state.viewTitle,
        items: [...this.state.items],
        stats: [...this.state.stats],
        itemIndex: this.state.itemIndex,
        status: this.state.status
      };
    }
  }

  private restoreParentList(): void {
    const parent = this.state.parentList;
    if (!parent) return;
    this.state.viewTitle = parent.title;
    this.state.items = parent.items;
    this.state.stats = parent.stats;
    this.state.itemIndex = parent.itemIndex;
    this.state.status = parent.status;
    this.state.parentList = undefined;
    this.state.currentBoard = undefined;
    this.state.currentChat = undefined;
    this.state.topic = undefined;
    this.state.mode = "list";
    this.state.focus = "content";
    this.state.scroll = 0;
  }
}
