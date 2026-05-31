// 状态管理

import type { TuiState } from "./types.js";
import { getTopicPageInfo } from "../topic-reader.js";

export function createInitialState(): TuiState {
  return {
    mode: "list",
    focus: "nav",
    navIndex: 0,
    itemIndex: 0,
    scroll: 0,
    loading: true,
    loadingMore: false,
    status: "",
    viewTitle: "新帖",
    items: [],
    stats: [],
    overview: [],
    listViewportCapacity: 0,
    modal: null,
    menuIndex: 0,
    menuItems: [],
    tabId: "default",
    tabs: [],
    searchMode: "topics",
    searchQuery: "",
    searchResults: [],
    searchScope: { label: "全站" },
    noticeType: "system",
    inputMode: false,
    inputPrompt: "",
    inputValue: "",
    infoLines: [],
    confirmCallback: undefined
  };
}

export function getStatus(state: TuiState): string {
  if (state.loading) {
    return "加载中...";
  }
  if (state.error) {
    return `错误: ${state.error}`;
  }
  if (state.inputMode) {
    return state.inputPrompt;
  }
  return state.status || getDefaultStatus(state);
}

function getDefaultStatus(state: TuiState): string {
  switch (state.mode) {
    case "topic":
      return getTopicStatus(state);
    case "settings":
      return "设置";
    case "user-detail":
      return "用户详情";
    default:
      if (state.currentBoard) {
        return `版面 #${state.currentBoard.boardId}`;
      }
      if (state.currentChat) {
        return "私信";
      }
      return state.focus === "nav" ? "导航" : "列表";
  }
}

function getTopicStatus(state: TuiState): string {
  const topic = state.topic;
  if (!topic) {
    return "帖子阅读";
  }
  const pageInfo = getTopicPageInfo(topic, topic.cursorLine);
  const loading = state.loadingMore ? " · 加载中" : "";
  return `${pageInfo.currentPage}/${pageInfo.totalPages} 页  ${pageInfo.currentFloor}/${pageInfo.totalFloors} 楼${loading}`;
}
