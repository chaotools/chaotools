/**
 * 认证路由
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getConnInfo } from '@hono/node-server/conninfo';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomUUID } from 'crypto';
import {
  login,
  createUser,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  signAccessToken,
  REFRESH_TTL_MS,
} from '../services/auth';
import { getUserById } from '../services/auth';

const auth = new Hono<AppEnv>();

const REFRESH_COOKIE = 'chaotools_refresh';
const REFRESH_COOKIE_PATH = '/gateway/auth';

function setRefreshCookie(c: Context, token: string): void {
  setCookie(c, REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: Math.floor(REFRESH_TTL_MS / 1000),
  });
}

function clearRefreshCookie(c: Context): void {
  deleteCookie(c, REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

const LOGIN_WINDOW = 15 * 60 * 1000;
const LOGIN_MAX = 10;
const loginAttempts = new Map<string, { count: number; reset: number }>();
const REGISTER_WINDOW = 15 * 60 * 1000;
const REGISTER_MAX = 5;
const registerAttempts = new Map<string, { count: number; reset: number }>();
const CAPTCHA_REQ_WINDOW = 60 * 1000;
const CAPTCHA_REQ_MAX = 10;
const captchaRequests = new Map<string, { count: number; reset: number }>();

// 限流 Map 通用清理：删除已过期的记录，防止内存无限增长
function cleanupRateMaps(): void {
  const now = Date.now();
  for (const [key, rec] of loginAttempts) {
    if (now > rec.reset) loginAttempts.delete(key);
  }
  for (const [key, rec] of registerAttempts) {
    if (now > rec.reset) registerAttempts.delete(key);
  }
  for (const [key, rec] of captchaRequests) {
    if (now > rec.reset) captchaRequests.delete(key);
  }
}

// 注册验证码：内存存储，一次性使用，5 分钟过期
const CAPTCHA_TTL = 5 * 60 * 1000;
const CAPTCHA_MAX = 500; // 防止内存被刷爆
const captchaStore = new Map<string, { answer: number; expires: number }>();

function cleanupCaptchas(): void {
  const now = Date.now();
  for (const [id, rec] of captchaStore) {
    if (rec.expires < now) captchaStore.delete(id);
  }
}

// 生成一次性数学验证码（按 IP 限流，防止脚本刷题）
auth.get('/captcha', (c) => {
  cleanupRateMaps();
  cleanupCaptchas();

  const key = clientIp(c);
  const now = Date.now();
  const rec = captchaRequests.get(key) || { count: 0, reset: now + CAPTCHA_REQ_WINDOW };
  if (now > rec.reset) {
    rec.count = 0;
    rec.reset = now + CAPTCHA_REQ_WINDOW;
  }
  rec.count++;
  captchaRequests.set(key, rec);
  if (rec.count > CAPTCHA_REQ_MAX) {
    return c.json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many captcha requests, please try later' },
    }, 429);
  }

  const id = randomUUID();
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  captchaStore.set(id, { answer: a + b, expires: Date.now() + CAPTCHA_TTL });
  // 达到上限时拒绝新题（正常用户每 5 分钟最多要 10 道，500 足够）
  if (captchaStore.size > CAPTCHA_MAX) {
    captchaStore.delete(id);
    return c.json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many captchas, please try later' },
    }, 429);
  }
  return c.json({ success: true, data: { id, question: `${a} + ${b} = ?` } });
});

// 校验验证码（一次性：校验后立即作废）
function checkCaptcha(id: string, answer: string): boolean {
  const rec = captchaStore.get(id);
  if (!rec) return false;
  captchaStore.delete(id);
  if (Date.now() > rec.expires) return false;
  const parsed = parseInt(answer, 10);
  return Number.isFinite(parsed) && parsed === rec.answer;
}

function legacyClientIp(c: Context): string {
  // 优先信任 Nginx 写入的 X-Real-IP（真实客户端地址，客户端无法伪造）
  const realIp = c.req.header('x-real-ip');
  if (realIp) return realIp;

  // 直连场景：信任连接信息；X-Forwarded-For 只取最后一段（代理追加的），
  // 避免客户端伪造 XFF 绕过限流
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  try {
    const info = getConnInfo(c);
    return info.remote.address || 'unknown';
  } catch {
    return 'unknown';
  }
}

function clientIp(c: Context): string {
  let remoteAddress = 'unknown';
  try {
    const info = getConnInfo(c);
    remoteAddress = info.remote.address || 'unknown';
  } catch {
    // Some adapters do not expose connection information.
  }

  const isTrustedProxy = remoteAddress === '127.0.0.1' || remoteAddress === '::1';
  if (isTrustedProxy) {
    const realIp = c.req.header('x-real-ip')?.trim();
    if (realIp) return realIp;

    const xff = c.req.header('x-forwarded-for');
    if (xff) {
      const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) return parts[parts.length - 1];
    }
  }

  return remoteAddress;
}

function checkLoginRate(c: Context, email: string): boolean {
  cleanupRateMaps();
  const key = `${clientIp(c)}:${email.trim().toLowerCase()}`;
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
  loginAttempts.delete(`${clientIp(c)}:${email.trim().toLowerCase()}`);
}

function checkRegisterRate(c: Context): boolean {
  cleanupRateMaps();
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

// 登录（长度由 bcrypt 校验决定，注册端已强制复杂密码）
auth.post('/login', zValidator('json', z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
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
  setRefreshCookie(c, createRefreshToken(result.user!.id));
  return c.json({
    success: true,
    data: {
      user: result.user,
      token: result.token,
    },
  });
});

// 注册（需通过验证码，防止批量注册）
auth.post('/register', zValidator('json', z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8).regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'Password must contain both letters and numbers'),
  captchaId: z.string().min(1),
  captchaAnswer: z.string().min(1),
})), async (c) => {
  const body = c.req.valid('json');

  // 先做注册限流，再消耗验证码（避免被限流的用户每次都白拿一道题）
  if (!checkRegisterRate(c)) {
    return c.json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many registration attempts, please try later' },
    }, 429);
  }

  // 验证码校验（一次性）
  if (!checkCaptcha(body.captchaId, body.captchaAnswer)) {
    return c.json({
      success: false,
      error: { code: 'CAPTCHA_INVALID', message: '验证码错误或已过期' },
    }, 400);
  }

  const result = await createUser(body);

  if (!result.success) {
    return c.json({ success: false, error: { code: 'REGISTRATION_FAILED', message: 'Unable to create account' } }, 400);
  }

  setRefreshCookie(c, createRefreshToken(result.user!.id));
  return c.json({
    success: true,
    data: {
      user: result.user,
      token: result.token,
    },
  }, 201);
});

// 刷新访问令牌（读取 httpOnly Cookie，轮换刷新令牌）
auth.post('/refresh', async (c) => {
  const raw = getCookie(c, REFRESH_COOKIE);
  if (!raw) {
    return c.json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing refresh token' },
    }, 401);
  }

  const rotated = rotateRefreshToken(raw);
  if (!rotated) {
    clearRefreshCookie(c);
    return c.json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired refresh token' },
    }, 401);
  }

  const user = getUserById(rotated.userId);
  if (!user) {
    clearRefreshCookie(c);
    return c.json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'User not found' },
    }, 401);
  }

  setRefreshCookie(c, rotated.raw);

  return c.json({
    success: true,
    data: {
      user,
      token: signAccessToken(user),
    },
  });
});

// 登出（撤销刷新令牌并清除 Cookie）
auth.post('/logout', async (c) => {
  const raw = getCookie(c, REFRESH_COOKIE);
  if (raw) revokeRefreshToken(raw);
  clearRefreshCookie(c);
  return c.json({ success: true });
});

export { auth as authRouter };
