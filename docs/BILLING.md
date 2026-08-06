# 商业化功能

## 概述

Chaotools 支持付费工具和订阅功能，帮助你将工具平台商业化。

## 定价模型

### 工具定价类型

| 类型 | 说明 | 访问方式 |
|------|------|---------|
| `free` | 免费工具 | 所有用户可用 |
| `freemium` | 基础免费，高级付费 | 订阅用户可用 |
| `paid` | 付费工具 | 需单独购买 |

### 订阅计划

| 计划 | 价格 | 功能 |
|------|------|------|
| Free | 免费 | 使用公开工具，每日 100 次 |
| Pro 月付 | ¥29.9/月 | 所有工具，无限制 |
| Pro 年付 | ¥299/年 | 所有工具，无限制，年度报表 |

## 数据模型

### subscriptions (订阅表)

| 字段 | 说明 |
|------|------|
| id | 订阅 ID |
| user_id | 用户 ID |
| plan_id | 计划 ID |
| status | 状态 (active, cancelled, expired, trial) |
| current_period_start | 当前周期开始时间 |
| current_period_end | 当前周期结束时间 |

### purchases (购买表)

| 字段 | 说明 |
|------|------|
| id | 购买记录 ID |
| user_id | 用户 ID |
| tool_id | 工具 ID |
| price | 价格 (分) |

### payments (支付表)

| 字段 | 说明 |
|------|------|
| id | 支付记录 ID |
| user_id | 用户 ID |
| type | 类型 (subscription, purchase) |
| amount | 金额 (分) |
| status | 状态 (pending, completed, failed, refunded) |

## API 端点

### 计划

```
GET /billing/plans
```

**响应:**
```json
{
  "success": true,
  "data": [
    {
      "id": "free",
      "name": "免费版",
      "price": 0,
      "features": ["使用公开工具"],
      "limits": { "toolsPerDay": 100 }
    },
    {
      "id": "pro-monthly",
      "name": "Pro 月付",
      "price": 2990,
      "interval": "month",
      "features": ["使用所有工具", "无限制使用"]
    }
  ]
}
```

### 订阅

```
GET /billing/subscription
Authorization: Bearer <token>

POST /billing/subscribe
Authorization: Bearer <token>
Body: { "planId": "pro-monthly" }

POST /billing/subscription/cancel
Authorization: Bearer <token>
```

### 购买

```
GET /billing/purchases
Authorization: Bearer <token>

POST /billing/purchase
Authorization: Bearer <token>
Body: { "toolId": "advanced-tool" }
```

### 工具访问

```
GET /billing/tools/:id/access
Authorization: Bearer <token>

GET /billing/tools/:id/pricing
```

### 支付记录

```
GET /billing/payments
Authorization: Bearer <token>

POST /billing/webhook/payment
Body: { "paymentId": "xxx", "status": "completed" }
```

## 支付流程

### 订阅流程

```
用户选择计划
    │
    ▼
创建支付记录 (pending)
    │
    ▼
调用支付网关 (微信/支付宝)
    │
    ▼
支付成功回调
    │
    ▼
更新支付状态 (completed)
    │
    ▼
创建订阅记录
```

### 购买工具流程

```
用户点击购买
    │
    ▼
检查是否已购买
    │
    ▼
创建支付记录 (pending)
    │
    ▼
调用支付网关
    │
    ▼
支付成功回调
    │
    ▼
更新支付状态 (completed)
    │
    ▼
创建购买记录
```

## 支付网关集成

### Webhook 处理

支付网关会在支付完成后发送回调。Chaotools 提供 Webhook 端点:

```
POST /billing/webhook/payment
```

你需要配置支付网关 (如微信支付、支付宝) 将回调发送到此端点。

### 验证签名

在生产环境中，应该验证支付回调的签名:

```typescript
// gateway/src/routes/billing.ts
POST /billing/webhook/payment
async (c) => {
  const body = c.req.json();

  // 验证签名
  const signature = c.req.header('X-Payment-Signature');
  if (!verifySignature(body, signature)) {
    return c.json({ success: false }, 400);
  }

  // 处理回调
  await updatePaymentStatus(body.paymentId, body.status);
  return c.json({ success: true });
}
```

## 前端集成

### 检查工具访问权限

```typescript
async function checkAccess(toolId: string) {
  const res = await fetch(`/api/billing/tools/${toolId}/access`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();

  if (!data.data.hasAccess) {
    // 显示购买弹窗
    showPurchaseModal(data.data.reason);
  }
}
```

### 订阅 Pro

```typescript
async function subscribe(planId: string) {
  const res = await fetch('/api/billing/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ planId })
  });

  const data = await res.json();

  if (data.success) {
    // 调用支付 SDK
    const payment = data.data.payment;
    // wx.chooseWXPay({ ... }) // 微信
    // AlipayJSBridge.call('tradePay', { ... }) // 支付宝
  }
}
```

## 隐私和合规

- 不存储完整银行卡信息
- 遵守 GDPR (欧盟通用数据保护条例)
- 支持用户删除账户和退款

## 下一步

1. 接入真实的支付网关 (微信/支付宝/Stripe)
2. 配置 Webhook 安全验证
3. 设置退款政策
4. 配置发票系统
