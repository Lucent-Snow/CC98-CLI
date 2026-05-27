# CC98 API 接口对比

> CC98-Desktop vs CC98-CLI 完整接口对比

## 认证 (OpenID)

| 功能 | CC98-Desktop | CC98-CLI | 状态 |
|------|--------------|----------|------|
| 获取令牌 | `POST /connect/token` | `POST /connect/token` | ✅ 已有 |

## 论坛 (Forum)

| 功能 | CC98-Desktop | CC98-CLI | 状态 |
|------|--------------|----------|------|
| 所有版面 | `GET /Board/all` | `GET /Board/all` | ✅ 已有 |
| 首页配置 | `GET /config/index` | `GET /config/index` | ✅ 已有 |
| 全站统计 | `GET /card.cc98.org/api/collection/stat` | `GET /card.cc98.org/api/collection/stat` | ✅ 已有 |
| 抽卡 | `GET /card.cc98.org/api/draw/{rule}` | - | ❌ 不做 |
| 销毁卡牌 | `GET /card.cc98.org/api/collection/all-rest` | - | ❌ 不做 |
| 上传文件 | `POST /file` | - | ⏳ 待定 |

## 用户 (User)

### 读取

| 功能 | CC98-Desktop | CC98-CLI | 状态 |
|------|--------------|----------|------|
| 当前用户 | `GET /me` | `GET /me` | ✅ 已有 |
| 用户资料 | `GET /user/{id}` | `GET /user/{id}` | ✅ 已有 |
| 批量基本信息 | `GET /user/basic?id=...` | `GET /user/basic?id=...` | ✅ 已有 |
| 批量详细信息 | `GET /user?id=...` | `GET /user?id=...` | ✅ 已有 |
| 搜索用户 | `GET /user/name/{name}` | `GET /user/name/{name}` | ✅ 已有 |
| 粉丝列表 | `GET /me/follower?from=&size=` | `GET /me/follower?from=&size=` | ✅ 已有 |
| 关注列表 | `GET /me/followee?from=&size=` | `GET /me/followee?from=&size=` | ✅ 已有 |
| 关注动态 | `GET /me/followee/topic?from=&size=&order=0` | `GET /me/followee/topic?from=&size=&order=0` | ✅ 已有 |
| 收藏夹列表 | `GET /me/favorite-topic-group` | `GET /me/favorite-topic-group` | ✅ 已有 |
| 最近联系人 | `GET /message/recent-contact-users?from=&size=` | `GET /message/recent-contact-users?from=&size=` | ✅ 已有 |
| 聊天历史 | `GET /message/user/{id}?from=&size=` | `GET /message/user/{id}?from=&size=` | ✅ 已有 |
| 未读消息数 | `GET /me/unread-count` | `GET /me/unread-count` | ✅ 已有 |
| 通知列表 | `GET /notification/{type}?from=&size=` | `GET /notification/{type}?from=&size=` | ✅ 已有 |
| 浏览历史 | `GET /me/browsing-record?from=&size=` | `GET /me/browsing-record?from=&size=` | ✅ 已有 |
| 签到 | `POST /me/signin` | - | ❌ 缺失 |

### 写入

| 功能 | CC98-Desktop | CC98-CLI | 状态 |
|------|--------------|----------|------|
| 关注/取消关注 | `PUT/DELETE /me/followee/{id}` | - | ❌ 缺失 |
| 转账 | `POST /me/transfer-wealth` | - | ❌ 不做 |
| 开启浏览历史 | `PUT /me/browsing-history?enabled=true` | - | ⏳ 待定 |

## 帖子 (Topic)

### 读取

| 功能 | CC98-Desktop | CC98-CLI | 状态 |
|------|--------------|----------|------|
| 帖子详情 | `GET /topic/{id}` | `GET /topic/{id}` | ✅ 已有 |
| 帖子回复 | `GET /Topic/{id}/post?from=&size=` | `GET /Topic/{id}/post?from=&size=` | ✅ 已有 |
| 是否收藏 | `GET /topic/{id}/isfavorite` | `GET /topic/{id}/isfavorite` | ✅ 已有 |
| 投票信息 | `GET /topic/{id}/vote` | `GET /topic/{id}/vote` | ✅ 已有 |
| 最新帖子 | `GET /topic/new?from=&size=` | `GET /topic/new?from=&size=` | ✅ 已有 |
| 随机帖子 | `GET /topic/random-recent?size=` | `GET /topic/random-recent?size=` | ✅ 已有 |
| 搜索帖子 | `GET /topic/search?keyword=&from=&size=` | `GET /topic/search?keyword=&from=&size=` | ✅ 已有 |
| 收藏帖子 | `GET /topic/me/favorite?from=&size=&order=&groupid=` | `GET /topic/me/favorite?from=&size=&order=&groupid=` | ✅ 已有 |
| 批量基本信息 | `GET /topic/basic?id=...` | `GET /topic/basic?id=...` | ✅ 已有 |
| 用户最近帖子 | `GET /me/recent-topic` 或 `/user/{id}/recent-topic` | `GET /me/recent-topic` 或 `/user/{id}/recent-topic` | ✅ 已有 |

### 写入

| 功能 | CC98-Desktop | CC98-CLI | 状态 |
|------|--------------|----------|------|
| 发帖 | `POST /board/{id}/topic` | - | ❌ 缺失 |
| 回帖 | `POST /topic/{id}/post` | - | ❌ 缺失 |
| 添加收藏 | `PUT /me/favorite/{id}?groupid=` | - | ❌ 缺移 |
| 取消收藏 | `DELETE /me/favorite/{id}` | - | ❌ 缺失 |

## 版面 (Board)

### 读取

| 功能 | CC98-Desktop | CC98-CLI | 状态 |
|------|--------------|----------|------|
| 版面信息 | `GET /board/{id}` | `GET /board/{id}` | ✅ 已有 |
| 版面帖子 | `GET /board/{id}/topic?from=&size=` | `GET /board/{id}/topic?from=&size=` | ✅ 已有 |
| 精华帖 | `GET /topic/best/board/{id}?from=&size=` | `GET /topic/best/board/{id}?from=&size=` | ✅ 已有 |

### 写入

| 功能 | CC98-Desktop | CC98-CLI | 状态 |
|------|--------------|----------|------|
| 收藏/取消版面 | `PUT/DELETE /me/custom-board/{id}` | - | ❌ 缺失 |

## 帖子 (Post)

### 读取

| 功能 | CC98-Desktop | CC98-CLI | 状态 |
|------|--------------|----------|------|
| 点赞状态 | `GET /post/{id}/like` | `GET /post/{id}/like` | ✅ 已有 |
| 评分原因 | `GET /post/rating-reason?type=` | `GET /post/rating-reason?type=` | ✅ 已有 |

### 写入

| 功能 | CC98-Desktop | CC98-CLI | 状态 |
|------|--------------|----------|------|
| 点赞/踩 | `POST /post/{id}/like` | - | ❌ 缺失 |
| 编辑帖子 | `PUT /post/{id}` | - | ❌ 缺失 |
| 评分 | `POST /post/{id}/rating-v2` | - | ❌ 缺失 |

---

## 汇总

### 已有接口（只读）
- 认证：1/1 ✅
- 论坛：3/6（抽卡、销毁、上传不做）
- 用户：14/16（签到、开启历史缺失）
- 帖子：10/10 ✅
- 版面：3/3 ✅
- 帖子读取：2/2 ✅

### 需要新增的写入接口

| 优先级 | 功能 | 方法 | 端点 |
|--------|------|------|------|
| P0 | 回帖 | POST | `/topic/{id}/post` |
| P0 | 发私信 | POST | `/message/user/{id}` |
| P0 | 发帖 | POST | `/board/{id}/topic` |
| P1 | 添加收藏 | PUT | `/me/favorite/{id}?groupid=` |
| P1 | 取消收藏 | DELETE | `/me/favorite/{id}` |
| P1 | 关注 | PUT | `/me/followee/{id}` |
| P1 | 取消关注 | DELETE | `/me/followee/{id}` |
| P1 | 点赞/踩 | POST | `/post/{id}/like` |
| P2 | 评分 | POST | `/post/{id}/rating-v2` |
| P2 | 编辑帖子 | PUT | `/post/{id}` |
| P2 | 签到 | POST | `/me/signin` |
| P2 | 收藏版面 | PUT | `/me/custom-board/{id}` |
| P2 | 取消收藏版面 | DELETE | `/me/custom-board/{id}` |

### 不做的接口
- 抽卡（游戏功能）
- 销毁卡牌（游戏功能）
- 转账（涉及金钱）
