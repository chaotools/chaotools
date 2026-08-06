# 数据分析

## 概述

Chaotools 内置了数据分析功能，帮助你了解工具的使用情况。

## 数据模型

### 页面浏览 (page_views)

记录用户访问工具页面的情况。

| 字段 | 说明 |
|------|------|
| id | 唯一 ID |
| tool_id | 工具 ID |
| user_id | 用户 ID (登录用户) |
| session_id | 会话 ID |
| referrer | 来源页面 |
| user_agent | 浏览器信息 |
| created_at | 访问时间 |

### 工具使用 (tool_usage)

记录用户使用工具的情况。

| 字段 | 说明 |
|------|------|
| id | 唯一 ID |
| tool_id | 工具 ID |
| user_id | 用户 ID (登录用户) |
| session_id | 会话 ID |
| action | 操作类型 |
| metadata | 附加数据 (JSON) |
| created_at | 使用时间 |

### 每日统计 (daily_stats)

聚合的每日统计数据。

## API 端点

### 记录页面访问

```
POST /analytics/page-view
```

**请求体:**
```json
{
  "toolId": "json-formatter",
  "sessionId": "sess_xxx",
  "referrer": "https://chaotools.tech",
  "userAgent": "Mozilla/5.0..."
}
```

### 记录工具使用

```
POST /analytics/tool-use
Authorization: Bearer <token>
```

**请求体:**
```json
{
  "toolId": "json-formatter",
  "action": "format",
  "sessionId": "sess_xxx",
  "metadata": {
    "inputSize": 1024,
    "outputSize": 2048
  }
}
```

### 获取工具统计

```
GET /analytics/tools/:id/stats?days=30
Authorization: Bearer <token>
```

**响应:**
```json
{
  "success": true,
  "data": {
    "views": 1234,
    "usages": 567,
    "uniqueUsers": 89,
    "daily": [
      { "date": "2026-04-01", "views": 100, "usages": 50 },
      { "date": "2026-04-02", "views": 120, "usages": 60 }
    ]
  }
}
```

### 获取概览统计

```
GET /analytics/overview
Authorization: Bearer <token>
```

**响应:**
```json
{
  "success": true,
  "data": {
    "todayViews": 456,
    "monthViews": 12345,
    "totalTools": 10,
    "totalUsers": 256,
    "activeUsers": 89,
    "topTools": [...],
    "recentDaily": [...]
  }
}
```

### 获取热门工具

```
GET /analytics/top-tools?limit=10&days=7
Authorization: Bearer <token>
```

## 前端集成

### 记录页面访问

```html
<script>
  // 生成会话 ID
  const sessionId = localStorage.getItem('chaotools_session') ||
    'sess_' + Math.random().toString(36).slice(2);

  localStorage.setItem('chaotools_session', sessionId);

  // 记录访问
  fetch('/api/analytics/page-view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toolId: 'json-formatter',
      sessionId: sessionId,
      referrer: document.referrer,
      userAgent: navigator.userAgent
    })
  });
</script>
```

### 记录工具使用

```html
<script>
  async function recordUsage(action, metadata = {}) {
    const res = await fetch('/api/analytics/tool-use', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getToken()
      },
      body: JSON.stringify({
        toolId: 'json-formatter',
        action: action,
        metadata: metadata
      })
    });
  }

  // 使用
  recordUsage('format', { inputSize: 1024 });
</script>
```

## 分析维度

### 1. 工具维度

- 各工具的浏览量/使用量
- 工具使用趋势
- 热门工具排名

### 2. 时间维度

- 每日/每周/每月趋势
- 高峰时段分析
- 环比/同比增长

### 3. 用户维度

- 活跃用户数
- 新增用户数
- 用户留存

### 4. 来源维度

- 直接访问 vs 搜索引擎
- 热门来源页面
- 社交媒体来源

## 隐私考虑

- 不记录用户敏感信息
- 会话 ID 是匿名的
- IP 地址不记录
- 可选择禁用分析
