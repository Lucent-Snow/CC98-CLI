# CC98 API 参考

## 认证

### OAuth2 Password Grant

```
POST https://openid.cc98.org/connect/token
Content-Type: application/x-www-form-urlencoded

username=<username>&password=<password>
&client_id=9a1fd200-8687-44b1-4c20-08d50a96e5cd
&client_secret=8b53f727-08e2-4509-8857-e34bf92b27f2
&grant_type=password
&scope=cc98-api openid offline_access
```

响应:
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### Token 刷新

```
POST https://openid.cc98.org/connect/token
Content-Type: application/x-www-form-urlencoded

refresh_token=<refresh_token>
&client_id=...
&client_secret=...
&grant_type=refresh_token
&scope=cc98-api openid offline_access
```

## API 端点

所有需要认证的端点都需要在 Header 中添加：
```
Authorization: Bearer <access_token>
```

### 用户

| 端点 | 方法 | 说明 |
|------|------|------|
| `/me` | GET | 当前用户信息 |
| `/user/{id}` | GET | 用户资料 |
| `/user/basic?id=1&id=2` | GET | 批量用户基本信息 |
| `/user/name/{name}` | GET | 按昵称搜索用户 |
| `/me/unread-count` | GET | 未读消息计数 |
| `/me/follower?from=0&size=10` | GET | 粉丝列表 |
| `/me/followee?from=0&size=10` | GET | 关注列表 |
| `/me/followee/topic?from=0&size=20&order=0` | GET | 关注动态 |
| `/me/browsing-record?from=0&size=11` | GET | 浏览历史 |

### 主题

| 端点 | 方法 | 说明 |
|------|------|------|
| `/topic/{id}` | GET | 主题详情 |
| `/topic/{id}/post?from=0&size=10` | GET | 主题帖子（分页） |
| `/topic/{id}/isfavorite` | GET | 是否收藏 |
| `/topic/{id}/vote` | GET | 投票信息 |
| `/topic/new?from=0&size=20` | GET | 最新主题 |
| `/topic/random-recent?size=10` | GET | 随机主题 |
| `/topic/search?keyword=xxx&from=0&size=20` | GET | 搜索主题 |
| `/topic/me/favorite?from=0&size=11&order=1&groupid=0` | GET | 收藏主题 |
| `/topic/basic?id=1&id=2` | GET | 批量主题基本信息 |
| `/topic/best/board/{id}?from=0&size=20` | GET | 版面精华帖 |

### 版面

| 端点 | 方法 | 说明 |
|------|------|------|
| `/board/all` | GET | 所有版面（按分区） |
| `/board/{id}` | GET | 版面信息 |
| `/board/{id}/topic?from=0&size=20` | GET | 版面主题列表 |

### 消息

| 端点 | 方法 | 说明 |
|------|------|------|
| `/message/recent-contact-users?from=0&size=10` | GET | 最近联系人 |
| `/message/user/{id}?from=0&size=10` | GET | 与用户的聊天记录 |

### 通知

| 端点 | 方法 | 说明 |
|------|------|------|
| `/notification/system?from=0&size=10` | GET | 系统通知 |
| `/notification/at?from=0&size=10` | GET | @通知 |
| `/notification/reply?from=0&size=10` | GET | 回复通知 |

### 帖子

| 端点 | 方法 | 说明 |
|------|------|------|
| `/post/{id}/like` | GET | 帖子评分状态 |
| `/post/rating-reason?type=0` | GET | 评分原因列表 |

### 配置

| 端点 | 方法 | 说明 |
|------|------|------|
| `/config/index` | GET | 论坛首页配置（含十大热帖） |

### 卡片统计

| 端点 | 方法 | 说明 |
|------|------|------|
| `https://card.cc98.org/api/collection/stat` | GET | 全站统计 |

## 分页参数

大部分列表接口支持分页：
- `from`: 起始位置（从 0 开始）
- `size`: 每页数量

## 错误响应

401 时返回：
```json
{
  "error": "invalid_token",
  "error_description": "..."
}
```

其他错误：
```json
{
  "message": "..."
}
```
