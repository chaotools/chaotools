/**
 * 认证服务
 */

import { db } from './db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes, createHash } from 'crypto';
import type { UserContext, JwtPayload, LoginRequest, RegisterRequest } from '../types';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is required. ' +
    'Generate one: openssl rand -hex 64'
  );
}
// 短时效访问令牌：即使被 XSS 窃取，15 分钟内即失效
const JWT_EXPIRES_IN = '15m';
// 长效刷新令牌：仅存于 httpOnly Cookie，服务端可撤销
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

export interface AuthResult {
  success: boolean;
  user?: UserContext;
  token?: string;
  error?: string;
}

// 创建用户
export async function createUser(data: RegisterRequest): Promise<AuthResult> {
  try {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(data.email);
    if (existing) {
      return { success: false, error: 'Email already registered' };
    }

    const id = randomUUID();
    const passwordHash = await bcrypt.hash(data.password, 10);
    const role = 'public'; // 默认普通用户

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, data.name, data.email, passwordHash, role);

    const user: UserContext = { id, name: data.name, email: data.email, role };

    return {
      success: true,
      user,
      token: signToken(user),
    };
  } catch (err) {
    console.error('Create user error:', err);
    return { success: false, error: 'Failed to create user' };
  }
}

// 登录
export async function login(data: LoginRequest): Promise<AuthResult> {
  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(data.email) as any;
    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }

    const valid = await bcrypt.compare(data.password, user.password_hash);
    if (!valid) {
      return { success: false, error: 'Invalid credentials' };
    }

    const userContext: UserContext = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    return {
      success: true,
      user: userContext,
      token: signToken(userContext),
    };
  } catch (err) {
    console.error('Login error:', err);
    return { success: false, error: 'Login failed' };
  }
}

// 验证 token
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

// 签发访问令牌
function signToken(user: UserContext): string {
  return jwt.sign(
    { sub: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// 签发访问令牌（供刷新路由使用）
export function signAccessToken(user: UserContext): string {
  return signToken(user);
}

// ---------- 刷新令牌 ----------

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function cleanupExpiredRefreshTokens(): void {
  db.prepare("DELETE FROM refresh_tokens WHERE expires_at < datetime('now')").run();
}

export function createRefreshToken(userId: string): string {
  const raw = randomBytes(48).toString('hex');
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
  db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, hashToken(raw), expiresAt);
  cleanupExpiredRefreshTokens();
  return raw;
}

// 校验并轮换刷新令牌；返回新令牌与其所属用户
export function rotateRefreshToken(raw: string): { raw: string; userId: string } | null {
  const row = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?')
    .get(hashToken(raw)) as any;
  if (!row || row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  // 轮换：撤销旧令牌，签发新令牌，缩短被窃取后的可用窗口
  db.prepare('UPDATE refresh_tokens SET revoked_at = datetime(\'now\') WHERE id = ?').run(row.id);
  const newRaw = randomBytes(48).toString('hex');
  const newId = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
  db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(newId, row.user_id, hashToken(newRaw), expiresAt);

  return { raw: newRaw, userId: row.user_id };
}

export function revokeRefreshToken(raw: string): void {
  db.prepare('UPDATE refresh_tokens SET revoked_at = datetime(\'now\') WHERE token_hash = ?')
    .run(hashToken(raw));
}

// 获取用户
export function getUserById(id: string): UserContext | null {
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id) as any;
  return user || null;
}

// 检查是否是 owner
export function isOwner(userId: string): boolean {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as any;
  return user?.role === 'owner';
}
