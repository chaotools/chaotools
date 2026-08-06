/**
 * 认证服务
 */

import { db } from './db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import type { UserContext, JwtPayload, LoginRequest, RegisterRequest } from '../types';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is required. ' +
    'Generate one: openssl rand -hex 64'
  );
}
const JWT_EXPIRES_IN = '7d';

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

// 签发 token
function signToken(user: UserContext): string {
  return jwt.sign(
    { sub: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
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
