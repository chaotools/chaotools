/**
 * 商业化服务 - 付费工具和订阅
 */

import { db } from './db';
import { randomUUID } from 'crypto';

// 初始化账单表
export function initBillingTable() {
  // 订阅表
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'cancelled', 'expired', 'trial')),
      current_period_start TEXT NOT NULL,
      current_period_end TEXT NOT NULL,
      cancel_at_period_end INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 订阅计划表
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL,
      interval TEXT DEFAULT 'month' CHECK(interval IN ('month', 'year', 'lifetime')),
      features TEXT,
      limits TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // 工具购买表
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      price INTEGER NOT NULL,
      status TEXT DEFAULT 'completed' CHECK(status IN ('pending', 'completed', 'refunded')),
      payment_method TEXT,
      payment_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (tool_id) REFERENCES tools(id)
    )
  `);

  // 支付记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('subscription', 'purchase')),
      reference_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'CNY',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed', 'refunded')),
      payment_method TEXT,
      external_payment_id TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
  `);

  // 插入默认计划
  insertDefaultPlans();
}

function insertDefaultPlans() {
  const existingPlans = db.prepare('SELECT COUNT(*) as count FROM plans').get() as any;
  if (existingPlans.count > 0) return;

  const plans = [
    {
      id: 'free',
      name: '免费版',
      description: '使用公开工具',
      price: 0,
      interval: 'lifetime',
      features: JSON.stringify(['使用公开工具']),
      limits: JSON.stringify({ toolsPerDay: 100 }),
    },
    {
      id: 'pro-monthly',
      name: 'Pro 月付',
      description: '高级功能，按月付费',
      price: 2990,
      interval: 'month',
      features: JSON.stringify(['使用所有工具', '优先客服', '无限制使用']),
      limits: JSON.stringify({ toolsPerDay: -1 }),
    },
    {
      id: 'pro-yearly',
      name: 'Pro 年付',
      description: '高级功能，按年付费 (省20%)',
      price: 29900,
      interval: 'year',
      features: JSON.stringify(['使用所有工具', '优先客服', '无限制使用', '年度报表']),
      limits: JSON.stringify({ toolsPerDay: -1 }),
    },
  ];

  for (const plan of plans) {
    db.prepare(`
      INSERT INTO plans (id, name, description, price, interval, features, limits)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(plan.id, plan.name, plan.description, plan.price, plan.interval, plan.features, plan.limits);
  }
}

// ============ 订阅相关 ============

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: 'active' | 'cancelled' | 'expired' | 'trial';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  interval: 'month' | 'year' | 'lifetime';
  features: string[];
  limits: {
    toolsPerDay: number; // -1 表示无限制
  };
}

/**
 * 获取所有可用计划
 */
export function getPlans(): Plan[] {
  const rows = db.prepare('SELECT * FROM plans WHERE is_active = 1').all() as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    interval: row.interval,
    features: JSON.parse(row.features || '[]'),
    limits: JSON.parse(row.limits || '{}'),
  }));
}

/**
 * 获取用户当前订阅
 */
export function getUserSubscription(userId: string): Subscription | null {
  const row = db.prepare(`
    SELECT * FROM subscriptions WHERE user_id = ? AND status IN ('active', 'trial')
    ORDER BY created_at DESC LIMIT 1
  `).get(userId) as any;

  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    status: row.status,
    currentPeriodStart: new Date(row.current_period_start),
    currentPeriodEnd: new Date(row.current_period_end),
    cancelAtPeriodEnd: !!row.cancel_at_period_end,
  };
}

/**
 * 创建订阅
 */
export function createSubscription(
  userId: string,
  planId: string,
  periodStart: Date,
  periodEnd: Date
): Subscription | null {
  const id = randomUUID();

  try {
    db.prepare(`
      INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end)
      VALUES (?, ?, ?, 'active', ?, ?)
    `).run(id, userId, planId, periodStart.toISOString(), periodEnd.toISOString());

    return getUserSubscription(userId);
  } catch (err) {
    console.error('Create subscription error:', err);
    return null;
  }
}

/**
 * 取消订阅
 */
export function cancelSubscription(userId: string): boolean {
  try {
    db.prepare(`
      UPDATE subscriptions
      SET cancel_at_period_end = 1, status = 'cancelled', updated_at = datetime('now')
      WHERE user_id = ? AND status = 'active'
    `).run(userId);
    return true;
  } catch (err) {
    console.error('Cancel subscription error:', err);
    return false;
  }
}

/**
 * 检查用户是否可以访问付费工具
 */
export function canAccessPaidTool(userId: string): boolean {
  const subscription = getUserSubscription(userId);
  if (!subscription) return false;

  // 检查是否过期
  if (new Date() > subscription.currentPeriodEnd) {
    return false;
  }

  return true;
}

// ============ 购买相关 ============

export interface Purchase {
  id: string;
  userId: string;
  toolId: string;
  toolName: string;
  price: number;
  status: 'pending' | 'completed' | 'refunded';
  createdAt: Date;
}

/**
 * 获取用户购买记录
 */
export function getUserPurchases(userId: string): Purchase[] {
  const rows = db.prepare(`
    SELECT * FROM purchases WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId) as any[];

  return rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    toolId: row.tool_id,
    toolName: row.tool_name,
    price: row.price,
    status: row.status,
    createdAt: new Date(row.created_at),
  }));
}

/**
 * 检查用户是否已购买某工具
 */
export function hasPurchasedTool(userId: string, toolId: string): boolean {
  const row = db.prepare(`
    SELECT id FROM purchases WHERE user_id = ? AND tool_id = ? AND status = 'completed'
  `).get(userId, toolId);

  return !!row;
}

/**
 * 创建购买记录
 */
export function createPurchase(
  userId: string,
  toolId: string,
  toolName: string,
  price: number
): Purchase | null {
  const id = randomUUID();

  try {
    db.prepare(`
      INSERT INTO purchases (id, user_id, tool_id, tool_name, price, status)
      VALUES (?, ?, ?, ?, ?, 'completed')
    `).run(id, userId, toolId, toolName, price);

    return {
      id,
      userId,
      toolId,
      toolName,
      price,
      status: 'completed',
      createdAt: new Date(),
    };
  } catch (err) {
    console.error('Create purchase error:', err);
    return null;
  }
}

/**
 * 获取工具定价
 */
export function getToolPricing(toolId: string): { type: 'free' | 'freemium' | 'paid'; price?: number } {
  const tool = db.prepare('SELECT pricing_type, pricing_price FROM tools WHERE id = ?').get(toolId) as any;

  if (!tool) {
    return { type: 'free' };
  }

  return {
    type: tool.pricing_type || 'free',
    price: tool.pricing_price || undefined,
  };
}

/**
 * 检查用户是否有权限使用工具
 */
export function checkToolAccess(userId: string, toolId: string): {
  hasAccess: boolean;
  reason?: string;
} {
  const pricing = getToolPricing(toolId);

  // 免费工具
  if (pricing.type === 'free') {
    return { hasAccess: true };
  }

  // 未登录用户不能使用付费工具
  if (!userId) {
    return { hasAccess: false, reason: '请先登录' };
  }

  // 付费工具 - 检查是否已购买
  if (hasPurchasedTool(userId, toolId)) {
    return { hasAccess: true };
  }

  // Freemium - 检查是否有订阅
  if (pricing.type === 'freemium') {
    if (canAccessPaidTool(userId)) {
      return { hasAccess: true };
    }
  }

  return {
    hasAccess: false,
    reason: pricing.type === 'paid' ? '需要购买此工具' : '需要升级到 Pro'
  };
}

// ============ 支付相关 ============

export interface Payment {
  id: string;
  userId: string;
  type: 'subscription' | 'purchase';
  referenceId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  paymentMethod?: string;
  externalPaymentId?: string;
  createdAt: Date;
}

/**
 * 创建支付记录
 */
export function createPayment(
  userId: string,
  type: 'subscription' | 'purchase',
  referenceId: string,
  amount: number,
  paymentMethod?: string
): Payment | null {
  const id = randomUUID();

  try {
    db.prepare(`
      INSERT INTO payments (id, user_id, type, reference_id, amount, payment_method, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, userId, type, referenceId, amount, paymentMethod);

    return {
      id,
      userId,
      type,
      referenceId,
      amount,
      currency: 'CNY',
      status: 'pending',
      paymentMethod,
      createdAt: new Date(),
    };
  } catch (err) {
    console.error('Create payment error:', err);
    return null;
  }
}

export interface PaymentVerification {
  id: string;
  userId: string;
  type: 'subscription' | 'purchase';
  referenceId: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
}

export function getPaymentForWebhook(paymentId: string): PaymentVerification | null {
  const row = db.prepare(`
    SELECT id, user_id, type, reference_id, amount, status
    FROM payments
    WHERE id = ?
  `).get(paymentId) as {
    id: string;
    user_id: string;
    type: 'subscription' | 'purchase';
    reference_id: string;
    amount: number;
    status: 'pending' | 'completed' | 'failed' | 'refunded';
  } | undefined;

  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    referenceId: row.reference_id,
    amount: row.amount,
    status: row.status,
  };
}

/**
 * 更新支付状态
 */
export function updatePaymentStatus(
  paymentId: string,
  status: 'completed' | 'failed' | 'refunded',
  externalPaymentId?: string
): boolean {
  try {
    const update = db.transaction(() => {
      const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as {
        id: string;
        user_id: string;
        type: 'subscription' | 'purchase';
        reference_id: string;
        amount: number;
        status: 'pending' | 'completed' | 'failed' | 'refunded';
      } | undefined;

      if (!payment) return false;
      // Replaying the same callback is safe and does not create a second
      // entitlement. Other state transitions are deliberately rejected.
      if (payment.status === status) return true;
      if (payment.status !== 'pending') return false;

      const tool = payment.type === 'purchase'
        ? db.prepare('SELECT name FROM tools WHERE id = ?').get(payment.reference_id) as { name: string } | undefined
        : undefined;
      const plan = payment.type === 'subscription'
        ? db.prepare('SELECT interval FROM plans WHERE id = ? AND is_active = 1')
          .get(payment.reference_id) as { interval: 'month' | 'year' | 'lifetime' } | undefined
        : undefined;
      if (payment.type === 'purchase' && !tool) return false;
      if (payment.type === 'subscription' && !plan) return false;

      db.prepare(`
        UPDATE payments
        SET status = ?, external_payment_id = COALESCE(?, external_payment_id), updated_at = datetime('now')
        WHERE id = ? AND status = 'pending'
      `).run(status, externalPaymentId ?? null, paymentId);

      if (status === 'completed' && payment.type === 'purchase') {
        db.prepare(`
          INSERT OR IGNORE INTO purchases
            (id, user_id, tool_id, tool_name, price, status, payment_method, payment_id)
          VALUES (?, ?, ?, ?, ?, 'completed', 'wechat', ?)
        `).run(randomUUID(), payment.user_id, payment.reference_id, tool!.name, payment.amount, paymentId);
      }

      if (status === 'completed' && payment.type === 'subscription') {
        const periodStart = new Date();
        const periodEnd = new Date(periodStart);
        if (plan!.interval === 'month') periodEnd.setMonth(periodEnd.getMonth() + 1);
        else if (plan!.interval === 'year') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        else periodEnd.setFullYear(2099);

        db.prepare(`
          INSERT OR IGNORE INTO subscriptions
            (id, user_id, plan_id, status, current_period_start, current_period_end, payment_id)
          VALUES (?, ?, ?, 'active', ?, ?, ?)
        `).run(
          randomUUID(),
          payment.user_id,
          payment.reference_id,
          periodStart.toISOString(),
          periodEnd.toISOString(),
          paymentId
        );
      }

      return true;
    });

    return update.immediate();
  } catch (err) {
    console.error('Update payment status error:', err);
    return false;
  }
}

/**
 * 获取用户支付记录
 */
export function getUserPayments(userId: string): Payment[] {
  const rows = db.prepare(`
    SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC
  `).all(userId) as any[];

  return rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    referenceId: row.reference_id,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    paymentMethod: row.payment_method,
    externalPaymentId: row.external_payment_id,
    createdAt: new Date(row.created_at),
  }));
}
