import { checkForUpdate } from "../update.js";
import { appVersion } from "../version.js";
import { Cc98Client } from "../api/client.js";
import type { WebVpnOptions } from "../api/types.js";
import type { TokenStore } from "../storage/token-store.js";
import { getImageCache } from "../storage/image-cache.js";
import { SettingsStore } from "../storage/settings-store.js";
import type { CachedCc98Client } from "./cached-client.js";
import { getKeybindingManager, type KeybindingManager } from "./keybindings.js";
import { EMOJI_CATEGORIES, getEmojiArt, renderCc98Logo, renderEmojiCode } from "./emoji-renderer.js";
import { navItems, settingsItems } from "./navigation.js";
import { getStatus } from "./state/store.js";
import type { ContentItem, ListPagingState, MenuItem, NoticeType, TabId, TopicReaderState, TuiState, ViewId } from "./state/types.js";
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
  currentTopicLine,
  currentTopicPost,
  findTopicPostByFloor,
  getTopicPageInfo,
  jumpToPage,
  replaceTopicPosts,
  FLOORS_PER_PAGE
} from "./topic-reader.js";

interface TopicRestoreTarget {
  floor: number;
  lineOffset: number;
  loaded: number;
}

interface ListReturnState {
  itemIndex: number;
  scroll: number;
  paging?: ListPagingState;
}

type RenderFn = () => void;
type CloseFn = () => void;
type SignalFn = () => AbortSignal;

export class TuiController {
  private loadVersion = 0;
  private readonly keybindings: KeybindingManager;
  private readonly settingsStore = new SettingsStore();
  private updateChecked = false;
  private autoSigninChecked = false;
  private listReturnState?: ListReturnState;

  constructor(
    private readonly state: TuiState,
    private readonly client: CachedCc98Client,
    private readonly tokenStore: TokenStore,
    private readonly render: RenderFn,
    private readonly close: CloseFn,
    private readonly nextSignal: SignalFn,
    private readonly abortCurrent: () => void,
    private readonly webVpnOptions?: WebVpnOptions
  ) {
    this.keybindings = getKeybindingManager();
  }

  async load(force = false): Promise<void> {
    const version = ++this.loadVersion;
    let shouldAutoSignin = false;
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
    this.state.listPaging = undefined;
    this.render();

    try {
      // 加载快捷键配置
      await this.keybindings.load();
      this.state.account = await this.tokenStore.getCurrentAccountName();

      // 异步检查更新（不阻塞主加载）
      if (!this.updateChecked) {
        this.updateChecked = true;
        void this.checkUpdate();
      }
      if (!this.autoSigninChecked) {
        this.autoSigninChecked = true;
        shouldAutoSignin = true;
      }
      const next = await this.loadView(nav.id, force, signal);
      if (version !== this.loadVersion) return;
      this.state.viewTitle = next.title;
      this.state.items = next.items;
      this.state.stats = next.stats;
      this.state.listPaging = next.paging;
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
        if (this.state.listPaging?.hasMore) {
          void this.ensureListWindowFilled(this.nextSignal());
        }
        if (shouldAutoSignin) {
          void this.runAutoSignin();
        }
      }
    }
  }

  handleKey(key: string): void {
    if (this.state.inputMode) {
      this.handleInputKey(key);
      return;
    }
    // 关闭更新通知（Esc 或任意键）
    if (this.state.updateAvailable?.isNew) {
      if (key === "\x1b" || key === "\r") {
        this.dismissUpdate();
        return;
      }
      // 其他按键也关闭更新通知，继续处理原按键动作
      this.dismissUpdate();
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
    if (this.state.modal === "help") {
      this.closeModal();
      return;
    }
    if (this.state.modal === "info") {
      // 如果有确认回调，确认键执行回调，其它键关闭。
      if (this.state.confirmCallback && this.keybindings.matches(key, "confirm")) {
        const callback = this.state.confirmCallback;
        this.state.confirmCallback = undefined;
        this.closeModal();
        callback();
        return;
      }
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
      this.closeSearch();
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
        this.restoreSearchOriginForActivation();
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
    if (this.keybindings.matches(key, "inputBackspace") && this.state.topic?.floorInput) {
      this.state.topic.floorInput = this.state.topic.floorInput.slice(0, -1);
      this.state.status = this.state.topic.floorInput ? `输入: ${this.state.topic.floorInput}` : "";
      this.render();
      return;
    }
    // 数字 + 跳页键：跳页
    if (this.keybindings.matches(key, "topicJumpPage") && this.state.topic?.floorInput) {
      const page = Number(this.state.topic.floorInput);
      this.state.topic.jumpTarget = { type: "page", value: page };
      this.state.topic.floorInput = "";
      this.state.status = `跳转到第 ${page} 页？${this.keybindings.formatActionKeys("confirm")} 确认  ${this.keybindings.formatActionKeys("back")} 取消`;
      this.render();
      return;
    }
    // 数字 + 跳楼键：跳楼
    if (this.keybindings.matches(key, "topicJumpFloor") && this.state.topic?.floorInput) {
      const floor = Number(this.state.topic.floorInput);
      this.state.topic.jumpTarget = { type: "floor", value: floor };
      this.state.topic.floorInput = "";
      this.state.status = `跳转到第 ${floor} 楼？${this.keybindings.formatActionKeys("confirm")} 确认  ${this.keybindings.formatActionKeys("back")} 取消`;
      this.render();
      return;
    }
    // 跳到最后一页
    if (this.keybindings.matches(key, "topicJumpLast") && !this.state.topic?.floorInput && this.state.topic) {
      const pageInfo = getTopicPageInfo(this.state.topic, this.state.topic.cursorLine);
      this.state.topic.jumpTarget = { type: "page", value: pageInfo.totalPages };
      this.state.status = `跳转到最后一页（第 ${pageInfo.totalPages} 页）？${this.keybindings.formatActionKeys("confirm")} 确认  ${this.keybindings.formatActionKeys("back")} 取消`;
      this.render();
      return;
    }
    // 确认跳转
    if (this.keybindings.matches(key, "confirm") && this.state.topic?.jumpTarget) {
      const target = this.state.topic.jumpTarget;
      this.state.topic.jumpTarget = undefined;
      this.state.status = "";
      if (target.type === "page") {
        void this.jumpToTopicPage(target.value, this.nextSignal());
      } else {
        void this.jumpToTopicFloor(target.value, this.nextSignal());
      }
      return;
    }
    // 取消跳转
    if (this.keybindings.matches(key, "back") && (this.state.topic?.floorInput || this.state.topic?.jumpTarget)) {
      this.state.topic.floorInput = "";
      this.state.topic.jumpTarget = undefined;
      this.state.status = "";
      this.render();
      return;
    }
    // ]：下一层
    if (this.keybindings.matches(key, "topicNextFloor") && this.state.topic) {
      void this.jumpRelativeFloor(1);
      return;
    }
    // [：上一层
    if (this.keybindings.matches(key, "topicPrevFloor") && this.state.topic) {
      void this.jumpRelativeFloor(-1);
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
      if (this.state.topic) {
        this.state.topic.cursorLine = Math.min(maxScroll, this.state.topic.cursorLine + 1);
      }
      this.state.status = "";
      this.render();
      void this.checkAutoLoad();
      return;
    }
    // k：上移
    if (this.keybindings.matches(key, "topicScrollUp")) {
      if (this.state.topic) {
        this.state.topic.cursorLine = Math.max(0, this.state.topic.cursorLine - 1);
      }
      this.state.status = "";
      this.render();
      return;
    }
    // r：刷新
    if (this.keybindings.matches(key, "topicRefresh") && this.state.topic) {
      void this.refreshCurrentTopic(this.nextSignal());
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
    // c：图片复制图片本体，链接复制 URL
    if (this.keybindings.matches(key, "topicCopyLink")) {
      const currentLine = this.getCurrentTopicLine();
      if (currentLine?.kind === "image" && currentLine.imageUrl) {
        void this.copyImageToClipboard(currentLine.imageUrl);
      } else if (currentLine?.kind === "link" && currentLine.linkUrl) {
        void this.copyToClipboard(currentLine.linkUrl);
      }
    }
  }

  private handleSettingsKey(key: string): void {
    const itemCount = this.state.items.length || settingsItems.length;
    if (this.keybindings.matches(key, "moveDown")) {
      this.state.itemIndex = Math.min(itemCount - 1, this.state.itemIndex + 1);
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
      void this.activateSetting(this.state.items[this.state.itemIndex] ?? settingsItems[this.state.itemIndex]);
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
    if ((key === "\t" || key === "\x1b[Z") && this.state.tabs.length > 1) {
      this.switchTab(key === "\x1b[Z" ? -1 : 1);
      return;
    }
    if (/^[1-9]$/.test(key) && this.state.tabs.length > 1) {
      this.switchTabToIndex(Number(key) - 1);
      return;
    }
    if (this.keybindings.matches(key, "listNext")) {
      const previousIndex = this.state.itemIndex;
      const shouldAdvanceAfterLoad = previousIndex >= this.state.items.length - 1;
      this.state.itemIndex = Math.min(Math.max(0, this.state.items.length - 1), this.state.itemIndex + 1);
      this.render();
      void this.checkListAutoLoad(shouldAdvanceAfterLoad ? previousIndex + 1 : undefined);
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

  private switchTab(delta: number): void {
    const current = Math.max(0, this.state.tabs.findIndex((tab) => tab.id === this.state.tabId));
    const next = (current + delta + this.state.tabs.length) % this.state.tabs.length;
    this.switchTabToIndex(next);
  }

  private switchTabToIndex(index: number): void {
    const tab = this.state.tabs[index];
    if (!tab || tab.id === this.state.tabId) return;
    this.state.tabId = tab.id;
    void this.load(true);
  }

  private leave(): void {
    this.abortCurrent();
    if (this.state.mode === "topic") {
      void this.leaveTopic();
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

  private rememberListReturnState(): void {
    if (this.state.mode !== "list") return;
    this.listReturnState = {
      itemIndex: this.state.itemIndex,
      scroll: this.state.scroll,
      paging: this.cloneListPaging(this.state.listPaging)
    };
  }

  private async leaveTopic(): Promise<void> {
    const listReturn = this.listReturnState;
    this.state.mode = "list";
    this.state.focus = "content";
    this.state.status = "";
    this.state.topic = undefined;

    if (listReturn) {
      this.state.itemIndex = Math.min(Math.max(0, this.state.items.length - 1), listReturn.itemIndex);
      this.state.listPaging = this.cloneListPaging(listReturn.paging);
      this.state.scroll = listReturn.paging?.anchorOnReturn ? this.state.itemIndex : listReturn.scroll;
      this.listReturnState = undefined;
    }

    this.render();
    if (this.state.listPaging?.anchorOnReturn) {
      await this.ensureListWindowFilled(this.nextSignal());
    }
  }

  private async ensureListWindowFilled(signal: AbortSignal): Promise<void> {
    const paging = this.state.listPaging;
    if (!paging?.hasMore || this.state.loadingMore) return;
    const capacity = Math.max(1, this.state.listViewportCapacity || 10);
    const targetLength = this.state.scroll + capacity;
    while (this.state.items.length < targetLength && paging.hasMore && !this.state.loadingMore) {
      const previousLength = this.state.items.length;
      await this.loadNextListPage(signal);
      if (this.state.items.length === previousLength) break;
    }
  }

  private async checkListAutoLoad(advanceToIndex?: number): Promise<void> {
    const paging = this.state.listPaging;
    if (!paging?.hasMore || this.state.loadingMore) return;
    const capacity = Math.max(1, this.state.listViewportCapacity || 10);
    const visibleEnd = this.state.scroll + capacity;
    if (this.state.items.length <= visibleEnd || this.state.itemIndex >= this.state.items.length - 2) {
      await this.loadNextListPage(this.nextSignal());
      if (advanceToIndex !== undefined && advanceToIndex < this.state.items.length) {
        this.state.itemIndex = advanceToIndex;
        this.state.status = "";
        this.render();
      }
    }
  }

  private async loadNextListPage(signal: AbortSignal): Promise<void> {
    const paging = this.state.listPaging;
    if (!paging?.hasMore || this.state.loadingMore) return;
    this.state.loadingMore = true;
    this.render();
    try {
      const nextItems = await this.fetchNextListPage(paging, signal);
      this.state.items.push(...nextItems);
      paging.loaded += nextItems.length;
      if (paging.kind !== "favorite-board-topics") {
        paging.hasMore = nextItems.length >= paging.size;
      }
      this.state.stats = this.state.stats.map((item) => {
        if (item.title === "版面主题" && paging.kind === "favorite-board-topics") {
          return { ...item, detail: `${paging.loaded} 条` };
        }
        if (["主题", "新帖流", "最新新帖", "关注用户", "收藏更新"].includes(item.title)) {
          return { ...item, detail: `${this.state.items.length} 条` };
        }
        return item;
      });
      this.state.status = paging.hasMore ? "已加载更多" : "已到底";
    } catch (error) {
      if (!isAbortError(error)) this.state.status = error instanceof Error ? error.message : "加载失败";
    } finally {
      this.state.loadingMore = false;
      this.render();
    }
  }

  private async fetchNextListPage(paging: ListPagingState, signal: AbortSignal): Promise<ContentItem[]> {
    if (paging.kind === "new-topics") {
      const topics = asArray(await this.client.getNewTopics(paging.loaded, paging.size, false, signal));
      return topics.map((topic) => topicItem(topic));
    }
    if (paging.kind === "followee-topics") {
      const topics = asArray(await this.client.getFolloweeTopics(paging.loaded, paging.size, false, signal));
      return topics.map((topic) => topicItem(topic));
    }
    if (paging.kind === "favorite-board-topics") {
      return this.fetchNextFavoriteBoardTopics(paging, signal);
    }
    const order = paging.kind === "favorite-updates" ? 1 : 0;
    const topics = asArray(await this.client.getFavoriteTopics(paging.loaded, paging.size, order, 0, false, signal));
    return topics.map((topic) => topicItem(topic));
  }

  private async fetchNextFavoriteBoardTopics(paging: ListPagingState, signal: AbortSignal): Promise<ContentItem[]> {
    const take = Math.max(1, Math.min(20, paging.size));
    if ((paging.buffer?.length ?? 0) >= take) {
      const items = paging.buffer?.splice(0, take) ?? [];
      paging.hasMore = (paging.buffer?.length ?? 0) > 0 || (paging.boardCursors?.some((cursor) => cursor.hasMore) ?? false);
      return items;
    }

    const cursors = paging.boardCursors?.filter((cursor) => cursor.hasMore) ?? [];
    if (cursors.length === 0) {
      const items = paging.buffer?.splice(0, take) ?? [];
      paging.hasMore = (paging.buffer?.length ?? 0) > 0;
      return items;
    }

    const batches = await mapLimit(cursors, 3, async (cursor) => {
      const topics = asArray(await this.client.getBoardTopics(cursor.boardId, cursor.loaded, cursor.size, false, false, signal));
      cursor.loaded += topics.length;
      cursor.hasMore = topics.length >= cursor.size;
      return topics.map((topic) => topicItem(topic, { title: cursor.title, boardId: cursor.boardId }));
    });

    const merged = [...(paging.buffer ?? []), ...batches.flat()]
      .sort((left, right) => (right.sortTime ?? 0) - (left.sortTime ?? 0));
    paging.buffer = merged;
    paging.hasMore = paging.buffer.length > 0 || cursors.some((cursor) => cursor.hasMore);
    return paging.buffer.splice(0, take);
  }

  private refresh(): void {
    if (this.state.mode === "topic" && this.state.topic) {
      void this.refreshCurrentTopic(this.nextSignal());
    } else if (this.state.currentBoard) {
      void this.openBoard(this.state.currentBoard.boardId, this.state.currentBoard.title, true, this.nextSignal(), false);
    } else if (this.state.currentChat) {
      void this.openChat(this.state.currentChat.userId, this.state.currentChat.title, true, this.nextSignal(), false);
    } else {
      void this.load(true);
    }
  }

  private openSearch(): void {
    this.state.modal = "search";
    this.state.searchOrigin = { itemIndex: this.state.itemIndex, scroll: this.state.scroll };
    this.state.searchQuery = "";
    this.state.searchResults = [];
    this.state.searchMode = "topics";
    this.state.searchScope = this.getSearchScope();
    this.state.itemIndex = 0;
    this.render();
  }

  private closeSearch(): void {
    const origin = this.state.searchOrigin;
    this.state.modal = null;
    this.state.searchOrigin = undefined;
    this.state.searchQuery = "";
    this.state.searchResults = [];
    if (origin) {
      this.state.itemIndex = origin.itemIndex;
      this.state.scroll = origin.scroll;
    }
    this.render();
  }

  private restoreSearchOriginForActivation(): void {
    const origin = this.state.searchOrigin;
    this.state.modal = null;
    this.state.searchOrigin = undefined;
    this.state.searchQuery = "";
    this.state.searchResults = [];
    if (origin) {
      this.state.itemIndex = origin.itemIndex;
      this.state.scroll = origin.scroll;
    }
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

  private setTabs(tabs: Array<{ id: TabId; label: string }>, defaultId: TabId): void {
    this.state.tabs = tabs;
    if (!tabs.some((tab) => tab.id === this.state.tabId)) {
      this.state.tabId = defaultId;
    }
  }

  private async loadView(view: ViewId, force: boolean, signal?: AbortSignal): Promise<{
    title: string;
    items: ContentItem[];
    stats: ContentItem[];
    overview?: ContentItem[];
    status?: string;
    paging?: ListPagingState;
  }> {
    if (view !== "new" && view !== "following") {
      this.setTabs([{ id: "default", label: "" }], "default");
    }
    switch (view) {
      case "hot": {
        this.setTabs([{ id: "default", label: "" }], "default");
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
          overview: overviewStats(indexObject, unreadObject),
          status: "十大：j/k 选择  Enter 打开  r 刷新"
        };
      }
      case "new": {
        this.setTabs([
          { id: "new-latest", label: "最新" },
          { id: "new-random", label: "随机" },
          { id: "new-recommendation", label: "推荐" }
        ], "new-latest");
        if (this.state.tabId === "new-recommendation") {
          const topics = asArray(await this.client.getRandomRecommendations(10, true, signal));
          return {
            title: "新帖 · 推荐",
            items: topics.map((topic) => topicItem(topic)),
            stats: [{ title: "推荐", detail: `${topics.length} 条` }],
            status: "新帖：Tab 切换  j/k 选择  Enter 打开  r 换一批"
          };
        }
        if (this.state.tabId === "new-random") {
          const topics = asArray(await this.client.getRandomTopics(20, true, signal));
          return {
            title: "新帖 · 随机",
            items: topics.map((topic) => topicItem(topic)),
            stats: [{ title: "随机新帖", detail: `${topics.length} 条` }],
            status: "新帖：Tab 切换  j/k 选择  Enter 打开  r 换一批"
          };
        }
        const size = 20;
        const topics = asArray(await this.client.getNewTopics(0, size, force, signal));
        return {
          title: "新帖 · 最新",
          items: topics.map((topic) => topicItem(topic)),
          stats: [{ title: "最新新帖", detail: `${topics.length} 条` }],
          status: "新帖：Tab 切换  j/k 选择  Enter 打开  r 刷新",
          paging: { kind: "new-topics", loaded: topics.length, size, hasMore: topics.length >= size, anchorOnReturn: true }
        };
      }
      case "boards": {
        this.setTabs([{ id: "default", label: "" }], "default");
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
        this.setTabs([
          { id: "follow-boards", label: "版面" },
          { id: "follow-users", label: "用户" },
          { id: "follow-favorites", label: "追踪" }
        ], "follow-boards");
        if (this.state.tabId === "follow-users") {
          const size = 20;
          const topics = asArray(await this.client.getFolloweeTopics(0, size, force, signal));
          return {
            title: "关注 · 用户",
            items: topics.map((topic) => topicItem(topic)),
            stats: [{ title: "关注用户", detail: `${topics.length} 条` }],
            status: "关注：Tab 切换  j/k 选择  Enter 打开  r 刷新",
            paging: { kind: "followee-topics", loaded: topics.length, size, hasMore: topics.length >= size, anchorOnReturn: true }
          };
        }
        if (this.state.tabId === "follow-favorites") {
          const size = 20;
          const topics = asArray(await this.client.getFavoriteTopics(0, size, 1, 0, force, signal));
          return {
            title: "关注 · 追踪",
            items: topics.map((topic) => topicItem(topic)),
            stats: [{ title: "收藏更新", detail: `${topics.length} 条` }],
            status: "关注：Tab 切换  j/k 选择  Enter 打开  r 刷新",
            paging: { kind: "favorite-updates", loaded: topics.length, size, hasMore: topics.length >= size, anchorOnReturn: true }
          };
        }
        return this.loadFavoriteBoardTopics(force, signal);
      }
      case "favorite": {
        this.setTabs([{ id: "default", label: "" }], "default");
        const [meRaw, sectionsRaw, topicFavorites] = await Promise.all([
          this.client.getMe(force, signal),
          this.client.getAllBoards(false, signal),
          this.client.getFavoriteTopics(0, 6, 1, 0, force, signal)
        ]);
        const customBoards = asArray(asObject(meRaw).customBoards).filter((id): id is number => typeof id === "number");
        const allBoards = flattenBoards(asArray(sectionsRaw));
        const boardById = new Map(allBoards.filter((board) => board.boardId !== undefined).map((board) => [board.boardId, board]));
        const boardPageSize = 5;
        const topicGroups = await mapLimit(customBoards, 3, async (boardId) => {
          const board = boardById.get(boardId);
          const topics = asArray(await this.client.getBoardTopics(boardId, 0, boardPageSize, false, force, signal));
          return { boardId, board, topics: topics.map((topic) => topicItem(topic, board)), hasMore: topics.length >= boardPageSize };
        });
        const boardTopics = topicGroups.flatMap((group) => group.topics).sort((left, right) => (right.sortTime ?? 0) - (left.sortTime ?? 0));
        const boardCursors = topicGroups.map((group) => ({
          boardId: group.boardId,
          title: group.board?.title ?? `#${group.boardId}`,
          loaded: group.topics.length,
          size: boardPageSize,
          hasMore: group.hasMore
        }));
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
          status: "收藏：j/k 选择  Enter 打开  h 返回  r 刷新",
          paging: {
            kind: "favorite-board-topics",
            loaded: boardTopics.length,
            size: Math.max(12, customBoards.length * boardPageSize),
            hasMore: boardCursors.some((cursor) => cursor.hasMore),
            anchorOnReturn: true,
            boardCursors
          }
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
        const [cacheStats, autoSignin] = await Promise.all([
          this.client.getCacheStats(),
          this.settingsStore.isAutoSigninEnabled()
        ]);
        return {
          title: "设置",
          items: this.renderSettingsItems(autoSignin),
          stats: [
            { title: "自动签到", detail: autoSignin ? "已开启" : "已关闭" },
            { title: "缓存", detail: `${cacheStats.fileCacheEntries} 文件` },
            { title: "版本", detail: `v${appVersion}` }
          ],
          status: "设置：j/k 选择  Enter 执行  h 返回"
        };
      }
    }
  }

  private async loadFavoriteBoardTopics(force: boolean, signal?: AbortSignal): Promise<{
    title: string;
    items: ContentItem[];
    stats: ContentItem[];
    status?: string;
    paging?: ListPagingState;
  }> {
    const [meRaw, sectionsRaw] = await Promise.all([
      this.client.getMe(force, signal),
      this.client.getAllBoards(false, signal)
    ]);
    const customBoards = asArray(asObject(meRaw).customBoards).filter((id): id is number => typeof id === "number");
    const allBoards = flattenBoards(asArray(sectionsRaw));
    const boardById = new Map(allBoards.filter((board) => board.boardId !== undefined).map((board) => [board.boardId, board]));
    const boardPageSize = 5;
    const topicGroups = await mapLimit(customBoards, 3, async (boardId) => {
      const board = boardById.get(boardId);
      const topics = asArray(await this.client.getBoardTopics(boardId, 0, boardPageSize, false, force, signal));
      return { boardId, board, topics: topics.map((topic) => topicItem(topic, board)), hasMore: topics.length >= boardPageSize };
    });
    const boardTopics = topicGroups.flatMap((group) => group.topics).sort((left, right) => (right.sortTime ?? 0) - (left.sortTime ?? 0));
    const boardCursors = topicGroups.map((group) => ({
      boardId: group.boardId,
      title: group.board?.title ?? `#${group.boardId}`,
      loaded: group.topics.length,
      size: boardPageSize,
      hasMore: group.hasMore
    }));

    return {
      title: "关注 · 版面",
      items: boardTopics,
      stats: [
        { title: "关注版面", detail: `${customBoards.length} 个` },
        { title: "版面主题", detail: `${boardTopics.length} 条` }
      ],
      status: "关注：Tab 切换  j/k 选择  Enter 打开  r 刷新",
      paging: {
        kind: "favorite-board-topics",
        loaded: boardTopics.length,
        size: Math.max(12, customBoards.length * boardPageSize),
        hasMore: boardCursors.some((cursor) => cursor.hasMore),
        anchorOnReturn: true,
        boardCursors
      }
    };
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
      void this.openCacheManager();
      return;
    }
    if (selected.meta === "pixel-logo") {
      this.openPixelLogo();
      return;
    }
    if (selected.meta === "emoji-preview") {
      this.openEmojiPreview();
      return;
    }
    if (selected.meta === "update") {
      void this.checkUpdate(true);
      return;
    }
    if (selected.meta === "account") {
      void this.openAccountSwitcher();
      return;
    }
    if (selected.meta === "auto-signin") {
      void this.toggleAutoSignin();
      return;
    }
    if (selected.meta === "logout") {
      void this.confirmLogout();
      return;
    }
    this.state.status = "功能开发中...";
    this.render();
  }

  private renderSettingsItems(autoSignin: boolean): ContentItem[] {
    return settingsItems.map((item) => {
      if (item.meta !== "auto-signin") {
        return { ...item };
      }
      return {
        ...item,
        title: `自动签到: ${autoSignin ? "开启" : "关闭"}`,
        detail: autoSignin
          ? "启动后为所有账号执行每日签到"
          : "默认关闭，启动时不自动签到"
      };
    });
  }

  private async toggleAutoSignin(): Promise<void> {
    const enabled = await this.settingsStore.isAutoSigninEnabled();
    const next = !enabled;
    await this.settingsStore.setAutoSigninEnabled(next);
    this.state.items = this.renderSettingsItems(next);
    this.state.stats = [
      { title: "自动签到", detail: next ? "已开启" : "已关闭" },
      ...this.state.stats.filter((item) => item.title !== "自动签到")
    ];
    this.state.status = next ? "已开启自动签到" : "已关闭自动签到";
    this.render();
  }

  private async runAutoSignin(): Promise<void> {
    const enabled = await this.settingsStore.isAutoSigninEnabled();
    if (!enabled) return;

    const accounts = await this.tokenStore.listAccounts();
    if (accounts.length === 0) return;

    let success = 0;
    let failed = 0;
    this.state.status = `自动签到: 0/${accounts.length}`;
    this.render();

    for (const account of accounts) {
      try {
        const tokenStore = this.tokenStore.withAccount(account.account);
        const client = new Cc98Client({ tokenStore, webVpn: this.webVpnOptions });
        if (this.webVpnOptions) {
          await client.initWebVpn();
        }
        await client.signin();
        success += 1;
      } catch {
        failed += 1;
      }

      this.state.status = `自动签到: ${success + failed}/${accounts.length}`;
      this.render();
    }

    this.state.status = failed > 0
      ? `自动签到完成: ${success} 成功，${failed} 失败`
      : `自动签到完成: ${success} 个账号`;
    this.render();
  }

  private async activateContentItem(selected: ContentItem, signal: AbortSignal): Promise<void> {
    if (selected.topicId !== undefined) {
      this.rememberListReturnState();
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
    // 账号切换
    if (selected.meta?.startsWith("account:")) {
      const accountName = selected.meta.slice(8);
      await this.switchAccount(accountName);
      return;
    }
    if (selected.meta?.startsWith("emoji-category:")) {
      this.openEmojiCategory(selected.meta.slice("emoji-category:".length));
      return;
    }
    if (selected.meta?.startsWith("emoji:")) {
      this.openEmojiDetail(selected.meta.slice("emoji:".length));
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

  private async openTopic(topicId: number, force: boolean, signal: AbortSignal, restore?: TopicRestoreTarget): Promise<void> {
    this.state.mode = "topic";
    this.state.loading = true;
    this.state.error = undefined;
    this.state.status = "";
    this.state.topic = undefined;
    this.state.scroll = 0;
    this.render();
    try {
      const from = restore ? Math.max(0, restore.floor - 1) : 0;
      const size = 10;
      const [topicRaw, postsRaw] = await Promise.all([
        this.client.getTopic(topicId, force, signal),
        this.client.getTopicPosts(topicId, from, size, force, signal)
      ]);
      this.state.topic = buildTopicReader(topicId, asObject(topicRaw), asArray(postsRaw), size, from);
      if (restore) this.restoreTopicPosition(restore);
      this.state.loading = false;
      this.state.status = "";
    } catch (error) {
      if (!isAbortError(error)) {
        this.state.error = error instanceof Error ? error.message : String(error);
        this.state.loading = false;
      }
    }
    this.render();

    // Start background image preloading so preview/open/copy can reuse the local cache.
    if (this.state.topic) {
      void this.preloadTopicImages(this.state.topic);
    }
  }

  private async refreshCurrentTopic(signal: AbortSignal): Promise<void> {
    const topic = this.state.topic;
    if (!topic) return;
    const restore = this.getTopicRestoreTarget(topic);
    await this.openTopic(topic.topicId, true, signal, restore);
  }

  private getTopicRestoreTarget(topic: TopicReaderState): TopicRestoreTarget {
    const post = currentTopicPost(topic, topic.cursorLine);
    return {
      floor: post?.floor ?? 1,
      lineOffset: post ? Math.max(0, topic.cursorLine - post.lineStart) : 0,
      loaded: topic.loaded
    };
  }

  private restoreTopicPosition(target: TopicRestoreTarget): void {
    const topic = this.state.topic;
    if (!topic) return;
    const post = findTopicPostByFloor(topic, target.floor);
    if (!post) return;
    topic.cursorLine = Math.min(post.lineEnd, post.lineStart + target.lineOffset);
    this.state.scroll = topic.cursorLine;
  }

  private async openBoard(boardId: number, title: string, force: boolean, signal: AbortSignal, pushParent = true): Promise<void> {
    if (pushParent) this.snapshotParent();
    this.state.loading = true;
    this.state.error = undefined;
    this.state.viewTitle = title;
    this.state.focus = "content";
    this.state.currentBoard = { boardId, title };
    this.state.listPaging = undefined;
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
    this.state.listPaging = undefined;
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

  private async checkAutoLoad(): Promise<void> {
    const topic = this.state.topic;
    if (!topic?.hasMore || this.state.loadingMore) return;
    const viewportRows = Math.max(1, topic.viewportRows);
    const viewportBottom = this.state.scroll + viewportRows;
    if (viewportBottom >= topic.lines.length) {
      void this.loadNextTopicPage(this.nextSignal(), true);
    }
  }

  private async jumpRelativeFloor(delta: number): Promise<void> {
    const topic = this.state.topic;
    if (!topic) return;
    const current = currentTopicPost(topic, topic.cursorLine);
    const currentFloor = current?.floor ?? 1;
    const targetFloor = currentFloor + delta;
    if (targetFloor < 1) return;
    const loaded = findTopicPostByFloor(topic, targetFloor);
    if (loaded) {
      topic.cursorLine = loaded.lineStart;
      this.state.status = "";
      this.render();
      if (delta > 0) void this.checkAutoLoad();
      return;
    }
    if (delta > 0 && topic.hasMore && !this.state.loadingMore) {
      await this.jumpToTopicFloor(targetFloor, this.nextSignal());
    }
  }

  private async jumpToNextPage(): Promise<void> {
    const topic = this.state.topic;
    if (!topic) return;
    const pageInfo = getTopicPageInfo(topic, topic.cursorLine);
    if (pageInfo.currentPage < pageInfo.totalPages) {
      await this.jumpToTopicPage(pageInfo.currentPage + 1, this.nextSignal());
    } else if (topic.hasMore && !this.state.loadingMore) {
      // 当前是最后一页，但还有更多内容，加载下一页
      await this.loadNextTopicPage(this.nextSignal());
      const newPageInfo = getTopicPageInfo(topic, topic.cursorLine);
      topic.cursorLine = jumpToPage(topic, newPageInfo.currentPage + 1);
      this.state.status = "";
      this.render();
    }
  }

  private async jumpToPrevPage(): Promise<void> {
    const topic = this.state.topic;
    if (!topic) return;
    const pageInfo = getTopicPageInfo(topic, topic.cursorLine);
    if (pageInfo.currentPage > 1) {
      await this.jumpToTopicPage(pageInfo.currentPage - 1, this.nextSignal());
    }
  }

  private async jumpToTopicPage(page: number, signal: AbortSignal): Promise<void> {
    const topic = this.state.topic;
    if (!topic) return;
    const pageInfo = getTopicPageInfo(topic, topic.cursorLine);
    if (page < 1 || page > pageInfo.totalPages) {
      this.state.status = `未找到第 ${page} 页`;
      this.render();
      return;
    }
    const targetFloor = (page - 1) * FLOORS_PER_PAGE + 1;
    if (!findTopicPostByFloor(topic, targetFloor)) {
      await this.loadTopicWindow(targetFloor, signal);
    }
    const post = findTopicPostByFloor(topic, targetFloor);
    if (post) {
      topic.cursorLine = post.lineStart;
      this.state.status = "";
    } else {
      this.state.status = `未找到第 ${page} 页`;
    }
    this.render();
  }

  private async loadTopicWindow(startFloor: number, signal: AbortSignal): Promise<void> {
    const topic = this.state.topic;
    if (!topic || this.state.loadingMore) return;
    const from = Math.max(0, startFloor - 1);
    this.state.loadingMore = true;
    this.render();
    try {
      const posts = asArray(await this.client.getTopicPosts(topic.topicId, from, topic.size, false, signal));
      replaceTopicPosts(topic, posts, from);
      topic.hasMore = from + posts.length < topic.totalFloors;
      this.state.scroll = 0;
      this.state.status = "";
      void this.preloadTopicImages(topic);
    } catch (error) {
      if (!isAbortError(error)) this.state.status = error instanceof Error ? error.message : "加载失败";
    } finally {
      this.state.loadingMore = false;
      this.render();
    }
  }

  private async loadNextTopicPage(signal: AbortSignal, quiet = false): Promise<void> {
    const topic = this.state.topic;
    if (!topic?.hasMore || this.state.loadingMore) return;
    this.state.loadingMore = true;
    if (!quiet) this.render();
    try {
      const posts = asArray(await this.client.getTopicPosts(topic.topicId, topic.loaded, topic.size, false, signal));
      appendTopicPosts(topic, posts);
      this.state.status = "";
      void this.preloadTopicImages(topic);
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
      topic.cursorLine = loaded.lineStart;
      this.state.status = "";
      this.render();
      return;
    }
    if (!findTopicPostByFloor(topic, floor)) {
      await this.loadTopicWindow(floor, signal);
    }
    const post = findTopicPostByFloor(topic, floor);
    topic.cursorLine = post?.lineStart ?? topic.cursorLine;
    this.state.status = post ? "" : `未找到 ${floor} 楼`;
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
        const size = 20;
        const topics = asArray(await this.client.getFavoriteTopics(0, size, order, 0, false, signal));
        this.openReadOnlyList(
          action === "favorite-updates" ? "收藏更新" : "收藏主题",
          topics.map((topic) => topicItem(topic)),
          [{ title: "主题", detail: `${topics.length}` }],
          { kind: action === "favorite-updates" ? "favorite-updates" : "favorite-topics", loaded: topics.length, size, hasMore: topics.length >= size, anchorOnReturn: true }
        );
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
    const post = currentTopicPost(topic, topic.cursorLine);
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
    const post = currentTopicPost(topic, topic.cursorLine);
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
    const post = currentTopicPost(topic, topic.cursorLine);
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
    return currentTopicLine(topic, topic.cursorLine);
  }

  /**
   * Preload images for topic in background
   * Images are cached and trigger re-render when ready
   */
  private async preloadTopicImages(topic: TopicReaderState): Promise<void> {
    const cache = getImageCache();
    const imagesToLoad = new Set<string>();

    // Collect all unique image URLs from posts
    for (const post of topic.posts) {
      for (const imageUrl of post.images) {
        if (imageUrl && !topic.imageCache.has(imageUrl) && !topic.imageLoading.has(imageUrl)) {
          imagesToLoad.add(imageUrl);
        }
      }
    }

    if (imagesToLoad.size === 0) return;

    // Load images in parallel with concurrency limit
    const urls = Array.from(imagesToLoad);
    const concurrency = 3;

    for (let i = 0; i < urls.length; i += concurrency) {
      // Check if topic is still the same (user might have navigated away)
      if (this.state.topic !== topic) break;

      const batch = urls.slice(i, i + concurrency);
      let shouldRender = false;
      const promises = batch.map(async (url) => {
        topic.imageLoading.add(url);
        try {
          const localPath = await cache.getOrDownload(url);
          topic.imageErrors.delete(url);
          topic.imageCache.set(url, localPath);
          shouldRender = true;
        } catch (error) {
          topic.imageErrors.set(url, error instanceof Error ? error.message : "下载失败");
          shouldRender = true;
        } finally {
          topic.imageLoading.delete(url);
        }
      });

      await Promise.all(promises);
      if (shouldRender && this.state.topic === topic) {
        this.render();
      }
    }
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
      const args = platform === "win32"
        ? ["/c", "start", "", localPath]
        : platform === "darwin"
          ? ["-a", "Preview", localPath]
          : [localPath];
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

  private async copyImageToClipboard(url: string): Promise<void> {
    this.state.status = "正在复制图片...";
    this.render();
    try {
      const cache = getImageCache();
      const localPath = await cache.getOrDownload(url);
      await this.copyImageFileToClipboard(localPath);
      this.state.status = "已复制图片到剪贴板";
      this.render();
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "复制图片失败";
      this.render();
    }
  }

  private async copyImageFileToClipboard(localPath: string): Promise<void> {
    const platform = process.platform;
    if (platform === "darwin") {
      await this.copyImageFileToClipboardMac(localPath);
      return;
    }
    if (platform === "win32") {
      const script = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "Add-Type -AssemblyName System.Drawing",
        "$image=[System.Drawing.Image]::FromFile($args[0])",
        "[System.Windows.Forms.Clipboard]::SetImage($image)",
        "$image.Dispose()"
      ].join("; ");
      await execFilePromise("powershell.exe", ["-NoProfile", "-Command", script, localPath]);
      return;
    }

    const mime = imageMimeType(localPath);
    await execFilePromise("xclip", ["-selection", "clipboard", "-t", mime, localPath]);
  }

  private async copyImageFileToClipboardMac(localPath: string): Promise<void> {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "cc98-image-"));
    const tiffPath = join(dir, "clipboard.tiff");

    try {
      await execFilePromise("sips", ["-s", "format", "tiff", localPath, "--out", tiffPath]);
      await execFilePromise("osascript", [
        "-e",
        `set the clipboard to (read (POSIX file ${appleScriptString(tiffPath)}) as TIFF picture)`
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
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

  private openPixelLogo(): void {
    this.state.modal = "info";
    this.state.infoTitle = "CC98 像素 Logo";
    this.state.infoLines = [
      ...renderCc98Logo().split("\n"),
      "",
      "来源: https://www.cc98.org/static/images/98LOGO.ico",
      "渲染: 24-bit ANSI 半块像素"
    ];
    this.render();
  }

  private openEmojiPreview(): void {
    const items: ContentItem[] = EMOJI_CATEGORIES.map((category) => ({
      title: `${category.label} (${category.codes.length})`,
      meta: `emoji-category:${category.id}`,
      detail: `来源目录: Assets/Emoji/${category.source} · ${category.codes[0]} - ${category.codes.at(-1)}`
    }));

    this.openReadOnlyList("表情包预览", items, EMOJI_CATEGORIES.map((category) => ({
      title: category.label,
      detail: `${category.codes.length} 个`
    })));
    this.state.status = "表情包预览：j/k 选择分类  Enter 进入  h 返回";
    this.render();
  }

  private openEmojiCategory(categoryId: string): void {
    const category = EMOJI_CATEGORIES.find((item) => item.id === categoryId);
    if (!category) {
      this.state.status = "未找到表情分类";
      this.render();
      return;
    }

    const items: ContentItem[] = category.codes.map((code) => {
      const art = getEmojiArt(code);
      return {
        title: `[${code}]`,
        meta: `emoji:${code}`,
        detail: art ? `${category.label} · ${art.width}x${art.height}px` : category.label
      };
    });

    this.openReadOnlyList(category.label, items, [
      { title: "分类", detail: category.label },
      { title: "数量", detail: `${category.codes.length} 个` },
      { title: "来源", detail: `Assets/Emoji/${category.source}` }
    ]);
    this.state.status = `${category.label}：j/k 选择  Enter 放大  h 返回分类`;
    this.render();
  }

  private openEmojiDetail(code: string): void {
    const art = getEmojiArt(code);
    const rendered = renderEmojiCode(code);
    if (!art || !rendered) {
      this.state.status = `未找到表情 [${code}]`;
      this.render();
      return;
    }
    this.state.modal = "info";
    this.state.infoTitle = `[${code}]`;
    this.state.infoLines = [
      ...rendered.split("\n"),
      "",
      `尺寸: ${art.width}x${art.height}px`,
      `颜色: ${art.palette.length}`
    ];
    this.render();
  }

  private async openAccountSwitcher(): Promise<void> {
    try {
      const accounts = (await this.tokenStore.listAccounts()).filter((account) => account.account !== "default");
      const currentAccount = await this.tokenStore.getCurrentAccountName();
      
      if (accounts.length === 0) {
        this.state.modal = "info";
        this.state.infoTitle = "切换账号";
        this.state.infoLines = ["暂无保存的账号", "", "请先登录账号。"];  
        this.render();
        return;
      }
      
      // 构建账号列表
      const items: ContentItem[] = accounts.map(account => ({
        title: account.displayName || account.username || account.account,
        meta: `account:${account.account}`,
        detail: `${account.account === currentAccount ? "✓ 当前" : "切换到此账号"}${account.userId ? ` · ID: ${account.userId}` : ""}`
      }));
      
      this.snapshotParent();
      this.state.viewTitle = "切换账号";
      this.state.items = items;
      this.state.stats = [{ title: "账号数", detail: `${accounts.length}` }];
      this.state.itemIndex = Math.max(0, accounts.findIndex(a => a.account === currentAccount));
      this.state.scroll = 0;
      this.state.focus = "content";
      this.state.mode = "list";
      this.state.status = "选择账号: j/k 选择  Enter 切换  h 返回";
      this.render();
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "读取账号失败";
      this.render();
    }
  }

  private async switchAccount(accountName: string): Promise<void> {
    try {
      await this.tokenStore.useAccount(accountName);
      this.state.status = `已切换到账号: ${accountName}`;
      this.state.parentList = undefined;
      this.state.mode = "list";
      this.state.focus = "nav";
      await this.load(true);
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "切换账号失败";
      this.render();
    }
  }

  private async confirmLogout(): Promise<void> {
    const account = await this.tokenStore.getCurrentAccountName();
    const lines = [
      `当前账号: ${account || "未知"}`,
      "",
      "退出登录将清除所有保存的账号信息。",
      "清除后需要重新登录。",
      "",
      `${this.keybindings.formatActionKeys("confirm")} 确认  ${this.keybindings.formatActionKeys("back")} 取消`
    ];
    
    this.state.modal = "info";
    this.state.infoTitle = "退出登录";
    this.state.infoLines = lines;
    this.state.confirmCallback = () => void this.performLogout();
    this.render();
  }

  private async performLogout(): Promise<void> {
    try {
      await this.tokenStore.clear();
      this.state.status = "已退出登录";
      this.state.parentList = undefined;
      this.state.mode = "list";
      this.state.focus = "nav";
      await this.load(true);
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "退出失败";
      this.render();
    }
  }

  private async openCacheManager(): Promise<void> {
    try {
      const stats = await this.client.getCacheStats();
      const cacheDir = "~/.cc98-cli/cache/";
      
      const lines = [
        `缓存目录: ${cacheDir}`,
        `文件数量: ${stats.fileCacheEntries}`,
        "",
        "缓存策略:",
        "  版面主题: 30s",
        "  版面信息: 24h",
        "  用户信息: 5min",
        "",
        "Enter 清理缓存  Esc 返回"
      ];
      
      this.state.modal = "info";
      this.state.infoTitle = "缓存管理";
      this.state.infoLines = lines;
      this.state.confirmCallback = () => void this.clearCache();
      this.render();
    } catch (error) {
      this.state.status = error instanceof Error ? error.message : "读取缓存信息失败";
      this.render();
    }
  }

  private async clearCache(): Promise<void> {
    try {
      await this.client.clearCache();
      this.state.status = "缓存已清理";
      await this.load(true);
    } catch {
      this.state.status = "缓存清理失败";
      this.render();
    }
  }

  private async openFriendUsers(type: "follower" | "followee", signal: AbortSignal): Promise<void> {
    const ids = asArray(await this.client.getFriendIds(type, 0, 20, false, signal)).filter((id): id is number => typeof id === "number");
    const users = asArray(await this.client.getUsers(ids, false, signal));
    this.openReadOnlyList(type === "follower" ? "粉丝列表" : "关注列表", users.map((user) => userItem(user)), [{ title: "用户", detail: `${users.length}` }]);
  }

  private openReadOnlyList(title: string, items: ContentItem[], stats: ContentItem[], paging?: ListPagingState): void {
    this.snapshotParent();
    this.state.viewTitle = title;
    this.state.items = items;
    this.state.stats = stats;
    this.state.listPaging = paging;
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
    this.state.parentList = {
      title: this.state.viewTitle,
      items: [...this.state.items],
      stats: [...this.state.stats],
      itemIndex: this.state.itemIndex,
      scroll: this.state.scroll,
      status: this.state.status,
      paging: this.cloneListPaging(this.state.listPaging),
      parent: this.state.parentList
    };
  }

  private restoreParentList(): void {
    const parent = this.state.parentList;
    if (!parent) return;
    this.state.viewTitle = parent.title;
    this.state.items = parent.items;
    this.state.stats = parent.stats;
    this.state.itemIndex = parent.itemIndex;
    this.state.scroll = parent.scroll;
    this.state.status = parent.status;
    this.state.listPaging = this.cloneListPaging(parent.paging);
    this.state.parentList = parent.parent;
    this.state.currentBoard = undefined;
    this.state.currentChat = undefined;
    this.state.topic = undefined;
    this.state.mode = "list";
    this.state.focus = "content";
    this.render();
  }

  private cloneListPaging(paging: ListPagingState | undefined): ListPagingState | undefined {
    if (!paging) return undefined;
    return {
      ...paging,
      boardCursors: paging.boardCursors?.map((cursor) => ({ ...cursor })),
      buffer: paging.buffer?.map((itemValue) => ({ ...itemValue }))
    };
  }

  private async checkUpdate(forceShow = false): Promise<void> {
    if (forceShow) {
      this.state.status = "正在检查 GitHub Release...";
      this.render();
    }

    try {
      const result = await checkForUpdate();
      if (!result.updateAvailable || !result.latest) {
        this.state.updateAvailable = undefined;
        if (forceShow) {
          this.state.status = result.message;
          this.render();
        }
        return;
      }

      const lastSeen = await this.settingsStore.getLastSeenVersion();
      const isNew = forceShow || lastSeen !== result.latest.version;

      this.state.updateAvailable = {
        version: result.latest.version,
        tagName: result.latest.tagName,
        url: result.latest.url,
        body: result.latest.body,
        isNew
      };

      if (forceShow) {
        this.state.status = result.message;
      }
      this.render();
    } catch (error) {
      if (forceShow) {
        this.state.status = error instanceof Error ? error.message : "检查更新失败";
        this.render();
      }
    }
  }

  dismissUpdate(): void {
    if (this.state.updateAvailable) {
      const version = this.state.updateAvailable.version;
      this.state.updateAvailable = undefined;
      this.render();
      void this.settingsStore.setLastSeenVersion(version).catch(() => {
        // 忽略已读状态写入失败，避免影响 TUI 操作。
      });
    }
  }
}

async function execFilePromise(command: string, args: string[]): Promise<void> {
  const { execFile } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    execFile(command, args, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function appleScriptString(value: string): string {
  return JSON.stringify(value);
}

function imageMimeType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}
