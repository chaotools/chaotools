/**
 * 商业化路由 - 订阅和付费
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  getPlans,
  getUserSubscription,
  createSubscription,
  cancelSubscription,
  getUserPurchases,
  createPurchase,
  checkToolAccess,
  getToolPricing,
  createPayment,
  updatePaymentStatus,
  getUserPayments,
} from '../services/billing';
import type { UserContext } from '../types';

const billing = new Hono();

// ============ 计划 ============

// 获取可用计划
billing.get('/plans', async (c) => {
  const plans = getPlans();
  return c.json({
    success: true,
    data: plans,
  });
});

// 获取我的订阅
billing.get('/subscription', async (c) => {
  const user = c.get('user') as UserContext;
  const subscription = getUserSubscription(user.id);

  return c.json({
    success: true,
    data: subscription,
  });
});

// 订阅计划
billing.post('/subscribe', zValidator('json', z.object({
  planId: z.string(),
})), async (c) => {
  const user = c.get('user') as UserContext;
  const body = c.req.valid('json');

  const plans = getPlans();
  const plan = plans.find(p => p.id === body.planId);

  if (!plan) {
    return c.json({
      success: false,
      error: { code: 'PLAN_NOT_FOUND', message: 'Plan not found' },
    }, 404);
  }

  // 计算订阅周期
  const now = new Date();
  let periodEnd: Date;

  if (plan.interval === 'month') {
    periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  } else if (plan.interval === 'year') {
    periodEnd = new Date(now);
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd = new Date('2099-12-31');
  }

  // 创建支付记录
  const payment = createPayment(user.id, 'subscription', body.planId, plan.price, 'wechat');

  if (!payment) {
    return c.json({
      success: false,
      error: { code: 'PAYMENT_FAILED', message: 'Failed to create payment' },
    }, 500);
  }

  // 支付网关接入前不自动完成订单，避免“模拟支付成功”绕过付费
  return c.json({
    success: true,
    data: {
      payment,
      status: 'pending',
      message: 'Payment pending: 接入支付网关后完成',
    },
  });
});

// 取消订阅
billing.post('/subscription/cancel', async (c) => {
  const user = c.get('user') as UserContext;

  const success = cancelSubscription(user.id);

  if (!success) {
    return c.json({
      success: false,
      error: { code: 'CANCEL_FAILED', message: 'Failed to cancel subscription' },
    }, 500);
  }

  return c.json({
    success: true,
    message: 'Subscription will be cancelled at the end of the current period',
  });
});

// ============ 购买 ============

// 获取我的购买记录
billing.get('/purchases', async (c) => {
  const user = c.get('user') as UserContext;
  const purchases = getUserPurchases(user.id);

  return c.json({
    success: true,
    data: purchases,
  });
});

// 购买工具
billing.post('/purchase', zValidator('json', z.object({
  toolId: z.string(),
})), async (c) => {
  const user = c.get('user') as UserContext;
  const body = c.req.valid('json');

  // 检查是否已购买
  if (checkToolAccess(user.id, body.toolId).hasAccess) {
    return c.json({
      success: false,
      error: { code: 'ALREADY_PURCHASED', message: 'You already own this tool' },
    }, 400);
  }

  // 获取工具定价
  const pricing = getToolPricing(body.toolId);

  if (pricing.type === 'free') {
    return c.json({
      success: false,
      error: { code: 'FREE_TOOL', message: 'This tool is free' },
    }, 400);
  }

  // 创建支付记录
  const payment = createPayment(user.id, 'purchase', body.toolId, pricing.price!, 'wechat');

  if (!payment) {
    return c.json({
      success: false,
      error: { code: 'PAYMENT_FAILED', message: 'Failed to create payment' },
    }, 500);
  }

  // 支付网关接入前不自动完成订单，避免“模拟支付成功”绕过付费
  return c.json({
    success: true,
    data: {
      payment,
      status: 'pending',
      message: 'Payment pending: 接入支付网关后完成',
    },
  });
});

// ============ 工具访问 ============

// 检查工具访问权限
billing.get('/tools/:id/access', async (c) => {
  const user = c.get('user') as UserContext;
  const { id } = c.req.param();

  const result = checkToolAccess(user?.id, id);

  return c.json({
    success: true,
    data: result,
  });
});

// 获取工具定价
billing.get('/tools/:id/pricing', async (c) => {
  const { id } = c.req.param();

  const pricing = getToolPricing(id);

  return c.json({
    success: true,
    data: pricing,
  });
});

// ============ 支付记录 ============

// 获取我的支付记录
billing.get('/payments', async (c) => {
  const user = c.get('user') as UserContext;
  const payments = getUserPayments(user.id);

  return c.json({
    success: true,
    data: payments,
  });
});

// 支付回调 (支付网关调用)
billing.post('/webhook/payment', zValidator('json', z.object({
  paymentId: z.string(),
  status: z.enum(['completed', 'failed', 'refunded']),
  externalPaymentId: z.string().optional(),
})), async (c) => {
  const body = c.req.valid('json');

  const success = updatePaymentStatus(
    body.paymentId,
    body.status,
    body.externalPaymentId
  );

  if (!success) {
    return c.json({
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update payment' },
    }, 500);
  }

  return c.json({ success: true });
});

export { billing as billingRouter };
