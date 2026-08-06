/**
 * 统计分析服务
 */

import { db } from './db';
import { randomUUID } from 'crypto';

// 初始化分析表
export function initAnalyticsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS page_views (
      id TEXT PRIMARY KEY,
      tool_id TEXT,
      user_id TEXT,
      session_id TEXT,
      referrer TEXT,
      user_agent TEXT,
      country TEXT,
      city TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_usage (
      id TEXT PRIMARY KEY,
      tool_id TEXT NOT NULL,
      user_id TEXT,
      session_id TEXT,
      action TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      tool_id TEXT,
      views INTEGER DEFAULT 0,
      usages INTEGER DEFAULT 0,
      unique_users INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(date, tool_id)
    )
  `);

  // 索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_page_views_tool ON page_views(tool_id);
    CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at);
    CREATE INDEX IF NOT EXISTS idx_tool_usage_tool ON tool_usage(tool_id);
    CREATE INDEX IF NOT EXISTS idx_tool_usage_created ON tool_usage(created_at);
  `);
}

// 记录页面访问
export function recordPageView(data: {
  toolId?: string;
  userId?: string;
  sessionId?: string;
  referrer?: string;
  userAgent?: string;
}): void {
  const toolId = data.toolId ? String(data.toolId).slice(0, 100) : null;
  const sessionId = data.sessionId ? String(data.sessionId).slice(0, 100) : null;
  const referrer = data.referrer ? String(data.referrer).slice(0, 2000) : null;
  const userAgent = data.userAgent ? String(data.userAgent).slice(0, 500) : null;
  db.prepare(`
    INSERT INTO page_views (id, tool_id, user_id, session_id, referrer, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    toolId,
    data.userId || null,
    sessionId,
    referrer,
    userAgent
  );
}

// 记录工具使用
export function recordToolUsage(data: {
  toolId: string;
  userId?: string;
  sessionId?: string;
  action: string;
  metadata?: Record<string, unknown>;
}): void {
  const toolId = String(data.toolId).slice(0, 100);
  const action = String(data.action).slice(0, 50);
  const sessionId = data.sessionId ? String(data.sessionId).slice(0, 100) : null;
  const metadata = data.metadata ? JSON.stringify(data.metadata).slice(0, 4000) : null;
  db.prepare(`
    INSERT INTO tool_usage (id, tool_id, user_id, session_id, action, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    toolId,
    data.userId || null,
    sessionId,
    action,
    metadata
  );
}

// 获取工具统计
export function getToolStats(toolId: string, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  // 页面浏览
  const views = db.prepare(`
    SELECT COUNT(*) as count FROM page_views
    WHERE tool_id = ? AND date(created_at) >= ?
  `).get(toolId, startDateStr) as any;

  // 使用次数
  const usages = db.prepare(`
    SELECT COUNT(*) as count FROM tool_usage
    WHERE tool_id = ? AND date(created_at) >= ?
  `).get(toolId, startDateStr) as any;

  // 独立用户
  const uniqueUsers = db.prepare(`
    SELECT COUNT(DISTINCT user_id) as count FROM tool_usage
    WHERE tool_id = ? AND user_id IS NOT NULL AND date(created_at) >= ?
  `).get(toolId, startDateStr) as any;

  return {
    views: views?.count || 0,
    usages: usages?.count || 0,
    uniqueUsers: uniqueUsers?.count || 0,
  };
}

// 获取每日统计
export function getDailyStats(toolId?: string, days = 7) {
  const stats: Record<string, { date: string; views: number; usages: number }> = {};

  // 初始化日期
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    stats[dateStr] = { date: dateStr, views: 0, usages: 0 };
  }

  // 查询页面浏览
  const query1 = toolId
    ? `SELECT date(created_at) as date, COUNT(*) as count FROM page_views WHERE tool_id = ? GROUP BY date(created_at)`
    : `SELECT date(created_at) as date, COUNT(*) as count FROM page_views GROUP BY date(created_at)`;

  const viewsRows = toolId
    ? db.prepare(query1).all(toolId)
    : db.prepare(query1).all();

  for (const row of viewsRows as any[]) {
    const dateStr = row.date;
    if (stats[dateStr]) {
      stats[dateStr].views = row.count;
    }
  }

  // 查询使用次数
  const query2 = toolId
    ? `SELECT date(created_at) as date, COUNT(*) as count FROM tool_usage WHERE tool_id = ? GROUP BY date(created_at)`
    : `SELECT date(created_at) as date, COUNT(*) as count FROM tool_usage GROUP BY date(created_at)`;

  const usageRows = toolId
    ? db.prepare(query2).all(toolId)
    : db.prepare(query2).all();

  for (const row of usageRows as any[]) {
    const dateStr = row.date;
    if (stats[dateStr]) {
      stats[dateStr].usages = row.count;
    }
  }

  return Object.values(stats).sort((a, b) => a.date.localeCompare(b.date));
}

// 获取热门工具
export function getTopTools(limit = 10, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  const rows = db.prepare(`
    SELECT
      tool_id,
      COUNT(*) as views,
      SUM(CASE WHEN action = 'use' THEN 1 ELSE 0 END) as usages
    FROM (
      SELECT tool_id, 'view' as action FROM page_views WHERE date(created_at) >= ?
      UNION ALL
      SELECT tool_id, action FROM tool_usage WHERE date(created_at) >= ?
    )
    WHERE tool_id IS NOT NULL
    GROUP BY tool_id
    ORDER BY views DESC
    LIMIT ?
  `).all(startDateStr, startDateStr, limit);

  return rows;
}

// 获取总览统计
export function getOverviewStats() {
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7);

  // 今日浏览
  const todayViews = db.prepare(`
    SELECT COUNT(*) as count FROM page_views WHERE date(created_at) = ?
  `).get(today) as any;

  // 本月浏览
  const monthViews = db.prepare(`
    SELECT COUNT(*) as count FROM page_views WHERE strftime('%Y-%m', created_at) = ?
  `).get(thisMonth) as any;

  // 总工具数
  const totalTools = db.prepare(`
    SELECT COUNT(*) as count FROM tools WHERE status = 'published'
  `).get() as any;

  // 总用户数
  const totalUsers = db.prepare(`
    SELECT COUNT(*) as count FROM users
  `).get() as any;

  // 活跃用户 (本月)
  const activeUsers = db.prepare(`
    SELECT COUNT(DISTINCT user_id) as count FROM tool_usage
    WHERE user_id IS NOT NULL AND strftime('%Y-%m', created_at) = ?
  `).get(thisMonth) as any;

  return {
    todayViews: todayViews?.count || 0,
    monthViews: monthViews?.count || 0,
    totalTools: totalTools?.count || 0,
    totalUsers: totalUsers?.count || 0,
    activeUsers: activeUsers?.count || 0,
  };
}
