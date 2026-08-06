/**
 * 认证路由
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { login, createUser } from '../services/auth';

const auth = new Hono();

const LOGIN_WINDOW = 15 * 60 * 1000;
const LOGIN_MAX = 10;
const loginAttempts = new Map<string, { count: number; reset: number }>();
const REGISTER_WINDOW = 15 * 60 * 1000;
const REGISTER_MAX = 5;
const registerAttempts = new Map<string, { count: number; reset: number }>();

function clientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

function checkLoginRate(c: Context, email: string): boolean {
  const key = `${clientIp(c)}:${email.toLowerCase()}`;
  const now = Date.now();
  const rec = loginAttempts.get(key) || { count: 0, reset: now + LOGIN_WINDOW };
  if (now > rec.reset) {
    rec.count = 0;
    rec.reset = now + LOGIN_WINDOW;
  }
  rec.count++;
  loginAttempts.set(key, rec);
  return rec.count <= LOGIN_MAX;
}

function clearLoginRate(c: Context, email: string): void {
  loginAttempts.delete(`${clientIp(c)}:${email.toLowerCase()}`);
}

function checkRegisterRate(c: Context): boolean {
  const key = clientIp(c);
  const now = Date.now();
  const rec = registerAttempts.get(key) || { count: 0, reset: now + REGISTER_WINDOW };
  if (now > rec.reset) {
    rec.count = 0;
    rec.reset = now + REGISTER_WINDOW;
  }
  rec.count++;
  registerAttempts.set(key, rec);
  return rec.count <= REGISTER_MAX;
}

// 登录
auth.post('/login', zValidator('json', z.object({
  email: z.string().email(),
  password: z.string().min(6),
})), async (c) => {
  const body = c.req.valid('json');

  if (!checkLoginRate(c, body.email)) {
    return c.json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many login attempts, please try later' },
    }, 429);
  }

  const result = await login(body);

  if (!result.success) {
    return c.json({ success: false, error: { code: 'AUTH_FAILED', message: result.error } }, 401);
  }

  clearLoginRate(c, body.email);
  return c.json({
    success: true,
    data: {
      user: result.user,
      token: result.token,
    },
  });
});

// 注册
auth.post('/register', zValidator('json', z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
})), async (c) => {
  const body = c.req.valid('json');

  if (!checkRegisterRate(c)) {
    return c.json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many registration attempts, please try later' },
    }, 429);
  }

  const result = await createUser(body);

  if (!result.success) {
    return c.json({ success: false, error: { code: 'REGISTRATION_FAILED', message: result.error } }, 400);
  }

  return c.json({
    success: true,
    data: {
      user: result.user,
      token: result.token,
    },
  }, 201);
});

export { auth as authRouter };
