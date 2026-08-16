/**
 * Gateway 类型扩展
 */

import type { Tool, User, UserRole } from '@chaotools/types';
export type { Tool, User, UserRole } from '@chaotools/types';

export interface AppEnv {
  Variables: { user: UserContext };
}

// 用户上下文
export interface UserContext {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

// JWT payload
export interface JwtPayload {
  sub: string;      // user id
  name: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// 登录请求
export interface LoginRequest {
  email: string;
  password: string;
}

// 注册请求
export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

// 工具创建请求
export interface CreateToolRequest {
  name: string;
  slug: string;
  description: string;
  longDescription?: string;
  visibility: 'private' | 'team' | 'public';
  categories: string[];
  tags: string[];
  tech: {
    entry: string;
    version: string;
    repository?: string;
  };
  pricing?: {
    type: 'free' | 'freemium' | 'paid';
    price?: number;
  };
}

// 工具更新请求
export interface UpdateToolRequest extends Omit<Partial<CreateToolRequest>, 'tech' | 'pricing'> {
  tech?: Partial<CreateToolRequest['tech']>;
  pricing?: Partial<NonNullable<CreateToolRequest['pricing']> >;
  status?: 'draft' | 'review' | 'published' | 'deprecated';
  review?: {
    reviewer: string;
    status: 'pending' | 'approved' | 'rejected';
    feedback?: string;
  };
}

// API 响应
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
}
