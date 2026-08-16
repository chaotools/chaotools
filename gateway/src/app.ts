/**
 * Chaotools Gateway application.
 *
 * This module has no listener side effect, so it can be imported by tests.
 */

import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { toolsRouter } from './routes/tools';
import { authRouter } from './routes/auth';
import { registryRouter } from './routes/registry';
import { teamsRouter } from './routes/teams';
import { analyticsRouter } from './routes/analytics';
import { usersRouter } from './routes/users';
import { billingRouter, billingWebhook } from './routes/billing';

import { db, initDatabase, runMigrations } from './services/db';
import { initTeamTable } from './services/team';
import { initAnalyticsTable } from './services/analytics';
import { initUserTable } from './services/user';
import { initBillingTable } from './services/billing';
import { authMiddleware } from './middleware/auth';
import type { AppEnv } from './types';

export function initializeGateway(): void {
  initDatabase();
  initTeamTable();
  initAnalyticsTable();
  initUserTable();
  initBillingTable();
  runMigrations();
}

function readyResponse(c: Context<AppEnv>) {
  try {
    const result = db.pragma('quick_check', { simple: true });
    if (result !== 'ok') {
      return c.json({ status: 'not_ready', database: 'unhealthy' }, 503);
    }
    return c.json({ status: 'ready', database: 'ok' });
  } catch {
    return c.json({ status: 'not_ready', database: 'unavailable' }, 503);
  }
}

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', logger());
  app.use('*', cors({
    origin: process.env.CORS_ORIGIN || 'https://chaotools.tech',
    credentials: true,
  }));

  app.get('/health', (c) => c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));
  app.get('/ready', (c) => readyResponse(c));

  app.route('/auth', authRouter);
  app.route('/registry', registryRouter);
  app.route('/billing', billingWebhook);

  app.use('/tools/*', authMiddleware);
  app.route('/tools', toolsRouter);
  app.use('/teams/*', authMiddleware);
  app.route('/teams', teamsRouter);
  app.route('/analytics', analyticsRouter);
  app.use('/users/*', authMiddleware);
  app.route('/users', usersRouter);
  app.use('/billing/*', authMiddleware);
  app.route('/billing', billingRouter);

  app.onError((err, c) => {
    console.error('Gateway Error:', err);
    return c.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    }, 500);
  });

  app.notFound((c) => c.json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
  }, 404));

  return app;
}

export const app = createApp();

