/**
 * Chaotools Gateway - API 服务入口
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';

// 路由
import { toolsRouter } from './routes/tools';
import { authRouter } from './routes/auth';
import { registryRouter } from './routes/registry';
import { teamsRouter } from './routes/teams';
import { analyticsRouter } from './routes/analytics';
import { usersRouter } from './routes/users';
import { billingRouter, billingWebhook } from './routes/billing';

// 服务
import { initDatabase } from './services/db';
import { initTeamTable } from './services/team';
import { initAnalyticsTable } from './services/analytics';
import { initUserTable } from './services/user';
import { initBillingTable } from './services/billing';

// 中间件
import { authMiddleware, type UserContext } from './middleware/auth';

// 初始化数据库
initDatabase();
initTeamTable();
initAnalyticsTable();
initUserTable();
initBillingTable();

const app = new Hono<{ Variables: { user: UserContext } }>();

// 全局中间件
app.use('*', logger());
app.use('*', cors({
  origin: process.env.CORS_ORIGIN || 'https://chaotools.tech',
  credentials: true,
}));

// 健康检查
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 公开路由
app.route('/auth', authRouter);
app.route('/registry', registryRouter);
// 支付回调：公开路由（支付网关无 JWT），用共享密钥签名校验
app.route('/billing', billingWebhook);

// 需认证的路由
app.use('/tools/*', authMiddleware);
app.route('/tools', toolsRouter);
app.use('/teams/*', authMiddleware);
app.route('/teams', teamsRouter);
// analytics routes handle auth per-route (public page-view, optional tool-use, auth-required stats)
app.route('/analytics', analyticsRouter);
app.use('/users/*', authMiddleware);
app.route('/users', usersRouter);
app.use('/billing/*', authMiddleware);
app.route('/billing', billingRouter);

// 错误处理
app.onError((err, c) => {
  console.error('Gateway Error:', err);
  return c.json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  }, 500);
});

// 404
app.notFound((c) => {
  return c.json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  }, 404);
});

// 启动服务器
const port = parseInt(process.env.PORT || '3001', 10);

console.log(`
╔═══════════════════════════════════════════╗
║        Chaotools Gateway v0.1.0           ║
║        你的工具，你做主                     ║
╚═══════════════════════════════════════════╝
  Listening on http://localhost:${port}
`);

serve({
  fetch: app.fetch,
  port,
  hostname: '127.0.0.1',
});

export default app;
