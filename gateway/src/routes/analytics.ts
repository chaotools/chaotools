/**
 * 统计路由
 */

import { Hono } from 'hono';
import {
  recordPageView,
  recordToolUsage,
  getToolStats,
  getDailyStats,
  getTopTools,
  getOverviewStats,
} from '../services/analytics';
import { getToolById } from '../services/tools';
import { isOwner } from '../services/auth';
import { optionalAuthMiddleware, authMiddleware } from '../middleware/auth';
import type { UserContext } from '../types';

const analytics = new Hono();

// 记录页面访问 (公开)
analytics.post('/page-view', optionalAuthMiddleware, async (c) => {
  const body = await c.req.json();

  if (body.toolId !== undefined && (typeof body.toolId !== 'string' || body.toolId.length > 100)) {
    return c.json({ success: false, error: { code: 'INVALID_PARAMS', message: 'Invalid toolId' } }, 400);
  }
  if (body.sessionId !== undefined && (typeof body.sessionId !== 'string' || body.sessionId.length > 100)) {
    return c.json({ success: false, error: { code: 'INVALID_PARAMS', message: 'Invalid sessionId' } }, 400);
  }
  if (body.referrer !== undefined && (typeof body.referrer !== 'string' || body.referrer.length > 2000)) {
    return c.json({ success: false, error: { code: 'INVALID_PARAMS', message: 'Invalid referrer' } }, 400);
  }
  if (body.userAgent !== undefined && (typeof body.userAgent !== 'string' || body.userAgent.length > 500)) {
    return c.json({ success: false, error: { code: 'INVALID_PARAMS', message: 'Invalid userAgent' } }, 400);
  }

  recordPageView({
    toolId: body.toolId,
    userId: body.userId,
    sessionId: body.sessionId,
    referrer: body.referrer,
    userAgent: body.userAgent,
  });

  return c.json({ success: true });
});

// 记录工具使用 (需认证)
analytics.post('/tool-use', optionalAuthMiddleware, async (c) => {
  const user = c.get('user') as UserContext;
  const body = await c.req.json();

  if (!body.toolId || !body.action) {
    return c.json({
      success: false,
      error: { code: 'INVALID_PARAMS', message: 'toolId and action are required' },
    }, 400);
  }

  recordToolUsage({
    toolId: body.toolId,
    userId: user?.id,
    sessionId: body.sessionId,
    action: body.action,
    metadata: body.metadata,
  });

  return c.json({ success: true });
});

// 获取工具统计 (需认证)
analytics.get('/tools/:id/stats', authMiddleware, async (c) => {
  const { id } = c.req.param();
  const user = c.get('user') as UserContext;
  const days = parseInt(c.req.query('days') || '30', 10);

  const tool = getToolById(id);
  if (!tool) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Tool not found' } }, 404);
  }
  if (!isOwner(user.id) && tool.owner?.id !== user.id) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only tool owner can view stats' } }, 403);
  }

  const stats = getToolStats(id, days);
  const daily = getDailyStats(id, days);

  return c.json({
    success: true,
    data: {
      ...stats,
      daily,
    },
  });
});

// 获取概览统计 (需认证)
analytics.get('/overview', authMiddleware, async (c) => {
  const user = c.get('user') as UserContext;
  if (!isOwner(user.id)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Owner only' } }, 403);
  }
  const stats = getOverviewStats();
  const topTools = getTopTools(10, 7);
  const recentDaily = getDailyStats(undefined, 7);

  return c.json({
    success: true,
    data: {
      ...stats,
      topTools,
      recentDaily,
    },
  });
});

// 获取热门工具 (需认证)
analytics.get('/top-tools', authMiddleware, async (c) => {
  const user = c.get('user') as UserContext;
  if (!isOwner(user.id)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Owner only' } }, 403);
  }
  const limit = parseInt(c.req.query('limit') || '10', 10);
  const days = parseInt(c.req.query('days') || '7', 10);

  const topTools = getTopTools(limit, days);

  return c.json({
    success: true,
    data: topTools,
  });
});

export { analytics as analyticsRouter };
