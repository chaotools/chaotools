/**
 * 认证中间件
 */

import type { Context, Next } from 'hono';
import type { UserContext } from '../types';
import { verifyToken, getUserById } from '../services/auth';

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' },
    }, 401);
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);

  if (!payload) {
    return c.json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
    }, 401);
  }

  const user = getUserById(payload.sub);
  if (!user) {
    return c.json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'User not found' },
    }, 401);
  }

  c.set('user', user);
  await next();
}

// 可选认证中间件 - 不强制要求登录，但如果有 token 则解析
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyToken(token);

    if (payload) {
      const user = getUserById(payload.sub);
      if (user) {
        c.set('user', user);
      }
    }
  }

  await next();
}
