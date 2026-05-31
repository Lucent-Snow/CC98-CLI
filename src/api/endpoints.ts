const base = "https://api.cc98.org";
const oidc = "https://openid.cc98.org";
const card = "https://card.cc98.org";

export const endpoints = {
  auth: {
    token: `${oidc}/connect/token`
  },
  forum: {
    allBoards: `${base}/Board/all`,
    index: `${base}/config/index`,
    cardStat: `${card}/api/collection/stat`
  },
  user: {
    me: `${base}/me`,
    profile: (userId: number) => `${base}/user/${userId}`,
    basic: (ids: number[]) => `${base}/user/basic?${ids.map((id) => `id=${id}`).join("&")}`,
    list: (ids: number[]) => `${base}/user?${ids.map((id) => `id=${id}`).join("&")}`,
    friendIds: (type: "follower" | "followee", from = 0, size = 10) =>
      `${base}/me/${type}?from=${from}&size=${size}`,
    moment: (from = 0, size = 20) => `${base}/me/followee/topic?from=${from}&size=${size}&order=0`,
    favoriteUpdates: (from = 0, size = 20) => `${base}/topic/me/favorite?from=${from}&size=${size}&order=1`,
    favoriteGroups: `${base}/me/favorite-topic-group`,
    recentChats: (from = 0, size = 10) => `${base}/message/recent-contact-users?from=${from}&size=${size}`,
    chatHistory: (userId: number, from = 0, size = 10) =>
      `${base}/message/user/${userId}?from=${from}&size=${size}`,
    search: (name: string) => `${base}/user/name/${encodeURIComponent(name)}`,
    unread: `${base}/me/unread-count`,
    notices: (type: "system" | "at" | "reply", from = 0, size = 10) =>
      `${base}/notification/${type}?from=${from}&size=${size}`,
    browseHistory: (from = 0, size = 11) => `${base}/me/browsing-record?from=${from}&size=${size}`
  },
  board: {
    info: (boardId: number) => `${base}/board/${boardId}`,
    topics: (boardId: number, from = 0, size = 20) =>
      `${base}/board/${boardId}/topic?from=${from}&size=${size}`,
    bestTopics: (boardId: number, from = 0, size = 20) =>
      `${base}/topic/best/board/${boardId}?from=${from}&size=${size}`
  },
  topic: {
    info: (topicId: number) => `${base}/topic/${topicId}`,
    isFavorite: (topicId: number) => `${base}/topic/${topicId}/isfavorite`,
    posts: (topicId: number, from = 0, size = 10) =>
      `${base}/Topic/${topicId}/post?from=${from}&size=${size}`,
    newTopics: (from = 0, size = 20) => `${base}/topic/new?from=${from}&size=${size}`,
    randomTopics: (size = 10) => `${base}/topic/random-recent?size=${size}`,
    randomRecommendations: (size = 10) => `${base}/topic/random-recommendation?size=${size}`,
    search: (keyword: string, from = 0, size = 20) =>
      `${base}/topic/search?keyword=${encodeURIComponent(keyword)}&from=${from}&size=${size}`,
    favoriteTopics: (from = 0, size = 11, order = 1, groupId = 0) =>
      `${base}/topic/me/favorite?from=${from}&size=${size}&order=${order}&groupid=${groupId}`,
    vote: (topicId: number) => `${base}/topic/${topicId}/vote`,
    basic: (ids: number[]) => `${base}/topic/basic?${ids.map((id) => `id=${id}`).join("&")}`,
    recent: (userId: number | undefined, from = 0, size = 11) =>
      userId === undefined
        ? `${base}/me/recent-topic?from=${from}&size=${size}`
        : `${base}/user/${userId}/recent-topic?userid=${userId}&from=${from}&size=${size}`
  },
  post: {
    reactionState: (postId: number) => `${base}/post/${postId}/like`,
    rateReasons: (type: number) => `${base}/post/rating-reason?type=${type}`,
    react: (postId: number) => `${base}/post/${postId}/like`,
    edit: (postId: number) => `${base}/post/${postId}`
  },
  write: {
    // 帖子
    createTopic: (boardId: number) => `${base}/board/${boardId}/topic`,
    replyTopic: (topicId: number) => `${base}/topic/${topicId}/post`,
    // 收藏
    addFavorite: (topicId: number, groupId = 0) => `${base}/me/favorite/${topicId}?groupid=${groupId}`,
    removeFavorite: (topicId: number) => `${base}/me/favorite/${topicId}`,
    // 版面收藏
    addBoardFavorite: (boardId: number) => `${base}/me/custom-board/${boardId}`,
    removeBoardFavorite: (boardId: number) => `${base}/me/custom-board/${boardId}`,
    // 关注
    followUser: (userId: number) => `${base}/me/followee/${userId}`,
    unfollowUser: (userId: number) => `${base}/me/followee/${userId}`,
    // 私信
    sendMessage: `${base}/message`,
    // 签到
    signin: `${base}/me/signin`
  }
} as const;
