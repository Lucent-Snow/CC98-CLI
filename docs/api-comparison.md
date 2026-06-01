# CC98 API 接口对比

> 更新时间：2026-05-31

本文记录 CC98-CLI 当前接入状态。CLI 侧以 `src/api/endpoints.ts` 和 `src/api/client.ts` 为准。

## 认证与基础

| 功能 | 接口 | CC98-CLI | 说明 |
|------|------|----------|------|
| OAuth 登录 | `POST /connect/token` | ✅ | Password Grant |
| Token 刷新 | `POST /connect/token` | ✅ | 并发刷新去重 |
| 所有版面 | `GET /Board/all` | ✅ | `forum boards` |
| 首页配置/十大 | `GET /config/index` | ✅ | `forum index` |
| 全站统计 | `GET card.cc98.org/api/collection/stat` | ✅ | `forum card-stat` |
| 抽卡/销毁卡牌 | `card.cc98.org` 游戏接口 | ❌ | 不做 |
| 上传文件 | `POST /file` | ⏳ | 待定 |

## 用户与消息

### 读取

| 功能 | 接口 | CLI 命令 | 状态 |
|------|------|----------|------|
| 当前用户 | `GET /me` | `me` | ✅ |
| 用户资料 | `GET /user/{id}` | `user profile <id>` | ✅ |
| 批量基本信息 | `GET /user/basic?id=...` | `user basic <ids...>` | ✅ |
| 批量详细信息 | `GET /user?id=...` | `user list <ids...>` | ✅ |
| 搜索用户 | `GET /user/name/{name}` | `user search <name>` | ✅ |
| 粉丝列表 | `GET /me/follower?from=&size=` | `user followers` | ✅ |
| 关注列表 | `GET /me/followee?from=&size=` | `user followees` | ✅ |
| 关注用户动态 | `GET /me/followee/topic?from=&size=&order=0` | `user moment` | ✅ |
| 收藏更新 | `GET /topic/me/favorite?from=&size=&order=1` | `user favorite-updates` | ✅ |
| 收藏夹列表 | `GET /me/favorite-topic-group` | `user favorite-groups` | ✅ |
| 浏览历史 | `GET /me/browsing-record?from=&size=` | `user browse-history` | ✅ |
| 未读计数 | `GET /me/unread-count` | `user unread` / `message unread` | ✅ |
| 最近联系人 | `GET /message/recent-contact-users?from=&size=` | `message recent` | ✅ |
| 私信历史 | `GET /message/user/{id}?from=&size=` | `message history <user-id>` | ✅ |
| 通知列表 | `GET /notification/{type}?from=&size=` | `notice system/at/reply` | ✅ |

### 写入

| 功能 | 接口 | CLI 命令 | 状态 |
|------|------|----------|------|
| 签到 | `POST /me/signin` | `me signin` | ✅ |
| 关注/取消关注 | `PUT/DELETE /me/followee/{id}` | `user follow/unfollow <id>` | ✅ |
| 发私信 | `POST /message` | `message send <user-id> <content>` | ✅ |
| 转账 | `POST /me/transfer-wealth` | - | ❌ 不做 |
| 开启/关闭浏览历史 | `PUT /me/browsing-history?enabled=` | - | ⏳ 待定 |

## 主题与帖子

### 读取

| 功能 | 接口 | CLI 命令 | 状态 |
|------|------|----------|------|
| 主题详情 | `GET /topic/{id}` | `topic <id> --meta` | ✅ |
| 主题回复 | `GET /Topic/{id}/post?from=&size=` | `topic <id> --posts` | ✅ |
| 主题详情+回复 | 上述两个接口组合 | `topic <id>` | ✅ |
| 是否收藏 | `GET /topic/{id}/isfavorite` | `topic is-favorite <id>` | ✅ |
| 投票信息 | `GET /topic/{id}/vote` | `topic vote <id>` | ✅ |
| 最新帖子 | `GET /topic/new?from=&size=` | `topic new` | ✅ |
| 随机帖子 | `GET /topic/random-recent?size=` | `topic random` | ✅ |
| 随机推荐 | `GET /topic/random-recommendation?size=` | `topic recommendation` | ✅ |
| 搜索帖子 | `GET /topic/search?keyword=&from=&size=` | `topic search` / `search` | ✅ |
| 收藏帖子 | `GET /topic/me/favorite?from=&size=&order=&groupid=` | `topic favorite` | ✅ |
| 批量基本信息 | `GET /topic/basic?id=...` | `topic basic <ids...>` | ✅ |
| 用户最近帖子 | `GET /me/recent-topic` / `/user/{id}/recent-topic` | `topic recent` | ✅ |
| 版面精华帖 | `GET /topic/best/board/{id}?from=&size=` | `board topics <id> --best` | ✅ |

### 写入

| 功能 | 接口 | CLI 命令 | 状态 |
|------|------|----------|------|
| 发帖 | `POST /board/{id}/topic` | `topic create <board-id> <title> <content>` | ✅ |
| 回帖 | `POST /topic/{id}/post` | `topic reply <topic-id> <content>` | ✅ |
| 添加收藏 | `PUT /me/favorite/{id}?groupid=` | `topic favorite add <topic-id>` | ✅ |
| 取消收藏 | `DELETE /me/favorite/{id}` | `topic favorite remove <topic-id>` | ✅ |
| 点赞/踩 | `POST /post/{id}/like` | `post like/dislike <post-id>` | ✅ |
| 编辑帖子 | `PUT /post/{id}` | - | ❌ 暂不实现 |
| 评分 | `POST /post/{id}/rating-v2` | - | ❌ 暂不实现 |

## 版面

| 功能 | 接口 | CLI 命令 | 状态 |
|------|------|----------|------|
| 版面信息 | `GET /board/{id}` | `board info <id>` | ✅ |
| 版面帖子 | `GET /board/{id}/topic?from=&size=` | `board <id>` / `board topics <id>` | ✅ |
| 版面精华帖 | `GET /topic/best/board/{id}?from=&size=` | `board topics <id> --best` | ✅ |
| 收藏/取消版面 | `PUT/DELETE /me/custom-board/{id}` | `board favorite add/remove <id>` | ✅ |

## 汇总

| 类别 | 状态 |
|------|------|
| 主要读取接口 | ✅ 已覆盖 |
| 核心写入接口 | ✅ 已覆盖 |
| TUI 日常浏览接口 | ✅ 已覆盖，详见 [tui-cli-comparison.md](tui-cli-comparison.md) |
| 暂不实现 | 抽卡、销毁卡牌、转账、评分、编辑帖子 |
| 待定 | 上传文件、浏览历史开关 |
