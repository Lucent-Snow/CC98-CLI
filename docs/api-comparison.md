# CC98 API 接入对照

本文记录 CC98-CLI 已接入的主要 CC98 API。CLI 侧以 `src/api/endpoints.ts` 和 `src/api/client.ts` 为准。

## 认证与基础

| 功能 | 接口 | CLI 命令 |
|------|------|----------|
| OAuth 登录 | `POST /connect/token` | `cc98 login` |
| Token 刷新 | `POST /connect/token` | 自动刷新 |
| 首页配置 / 十大 | `GET /config/index` | `cc98 forum index` |
| 所有版面 | `GET /Board/all` | `cc98 forum boards` |
| 全站统计 | `GET card.cc98.org/api/collection/stat` | `cc98 forum card-stat` |

## 用户与消息

| 功能 | 接口 | CLI 命令 |
|------|------|----------|
| 当前用户 | `GET /me` | `cc98 me` |
| 签到 | `POST /me/signin` | `cc98 me signin` |
| 用户资料 | `GET /user/{id}` | `cc98 user profile <id>` |
| 批量基本信息 | `GET /user/basic?id=...` | `cc98 user basic <ids...>` |
| 批量详细信息 | `GET /user?id=...` | `cc98 user list <ids...>` |
| 搜索用户 | `GET /user/name/{name}` | `cc98 user search <name>` |
| 粉丝列表 | `GET /me/follower?from=&size=` | `cc98 user followers` |
| 关注列表 | `GET /me/followee?from=&size=` | `cc98 user followees` |
| 关注用户动态 | `GET /me/followee/topic?from=&size=&order=0` | `cc98 user moment` |
| 关注 / 取消关注 | `PUT/DELETE /me/followee/{id}` | `cc98 user follow <id>` / `unfollow <id>` |
| 收藏更新 | `GET /topic/me/favorite?from=&size=&order=1` | `cc98 user favorite-updates` |
| 收藏夹列表 | `GET /me/favorite-topic-group` | `cc98 user favorite-groups` |
| 浏览历史 | `GET /me/browsing-record?from=&size=` | `cc98 user browse-history` |
| 未读计数 | `GET /me/unread-count` | `cc98 user unread` / `cc98 message unread` |
| 最近联系人 | `GET /message/recent-contact-users?from=&size=` | `cc98 message recent` |
| 私信历史 | `GET /message/user/{id}?from=&size=` | `cc98 message history <user-id>` |
| 发送私信 | `POST /message` | `cc98 message send <user-id> <content>` |
| 通知列表 | `GET /notification/{type}?from=&size=` | `cc98 notice system` / `at` / `reply` |

## 主题与帖子

| 功能 | 接口 | CLI 命令 |
|------|------|----------|
| 主题详情 | `GET /topic/{id}` | `cc98 topic <id> --meta` |
| 主题回复 | `GET /Topic/{id}/post?from=&size=` | `cc98 topic <id> --posts` |
| 主题详情和回复 | 上述两个接口组合 | `cc98 topic <id>` |
| 发帖 | `POST /board/{id}/topic` | `cc98 topic create <board-id> <title> <content>` |
| 回帖 | `POST /topic/{id}/post` | `cc98 topic reply <topic-id> <content>` |
| 最新帖子 | `GET /topic/new?from=&size=` | `cc98 topic new` |
| 随机帖子 | `GET /topic/random-recent?size=` | `cc98 topic random` |
| 随机推荐 | `GET /topic/random-recommendation?size=` | `cc98 topic recommendation` |
| 搜索帖子 | `GET /topic/search?keyword=&from=&size=` | `cc98 search <keyword>` / `cc98 topic search <keyword>` |
| 收藏帖子列表 | `GET /topic/me/favorite?from=&size=&order=&groupid=` | `cc98 topic favorite` |
| 添加收藏 | `PUT /me/favorite/{id}?groupid=` | `cc98 topic favorite add <topic-id>` |
| 取消收藏 | `DELETE /me/favorite/{id}` | `cc98 topic favorite remove <topic-id>` |
| 是否收藏 | `GET /topic/{id}/isfavorite` | `cc98 topic is-favorite <topic-id>` |
| 投票信息 | `GET /topic/{id}/vote` | `cc98 topic vote <topic-id>` |
| 批量基本信息 | `GET /topic/basic?id=...` | `cc98 topic basic <ids...>` |
| 用户最近帖子 | `GET /me/recent-topic` / `/user/{id}/recent-topic` | `cc98 topic recent` |
| 点赞 / 踩 | `PUT /post/{id}/like` | `cc98 post like <post-id>` / `dislike` |
| 点赞状态 | `GET /post/{id}/like` | `cc98 post reaction-state <post-id>` |
| 评分原因 | `GET /post/rating-reason?type=` | `cc98 post rate-reasons <type>` |

## 版面

| 功能 | 接口 | CLI 命令 |
|------|------|----------|
| 版面信息 | `GET /board/{id}` | `cc98 board info <id>` |
| 版面帖子 | `GET /board/{id}/topic?from=&size=` | `cc98 board <id>` / `cc98 board topics <id>` |
| 版面精华帖 | `GET /topic/best/board/{id}?from=&size=` | `cc98 board topics <id> --best` |
| 收藏版面 | `PUT /me/custom-board/{id}` | `cc98 board favorite add <id>` |
| 取消收藏版面 | `DELETE /me/custom-board/{id}` | `cc98 board favorite remove <id>` |
