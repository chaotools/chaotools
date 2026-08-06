/**
 * 用户路由 - 档案和设置
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  getUserProfile,
  updateUserProfile,
  getUserSettings,
  updateUserSettings,
  changePassword,
  getPublicUserInfo,
} from '../services/user';
import type { UserContext } from '../types';

const users = new Hono();

// 获取我的档案
users.get('/me/profile', async (c) => {
  const user = c.get('user') as UserContext;
  const profile = getUserProfile(user.id);

  return c.json({
    success: true,
    data: profile,
  });
});

// 更新我的档案
users.put('/me/profile', zValidator('json', z.object({
  displayName: z.string().optional(),
  bio: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  website: z.string().url().optional(),
  githubUsername: z.string().optional(),
  twitterUsername: z.string().optional(),
})), async (c) => {
  const user = c.get('user') as UserContext;
  const body = c.req.valid('json');

  const success = updateUserProfile(user.id, body);

  if (!success) {
    return c.json({
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update profile' },
    }, 500);
  }

  return c.json({
    success: true,
    data: getUserProfile(user.id),
  });
});

// 获取我的设置
users.get('/me/settings', async (c) => {
  const user = c.get('user') as UserContext;
  const settings = getUserSettings(user.id);

  return c.json({
    success: true,
    data: settings,
  });
});

// 更新我的设置
users.put('/me/settings', zValidator('json', z.object({
  theme: z.enum(['dark', 'light', 'auto']).optional(),
  language: z.string().optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
})), async (c) => {
  const user = c.get('user') as UserContext;
  const body = c.req.valid('json');

  const success = updateUserSettings(user.id, body);

  if (!success) {
    return c.json({
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update settings' },
    }, 500);
  }

  return c.json({
    success: true,
    data: getUserSettings(user.id),
  });
});

// 修改密码
users.post('/me/password', zValidator('json', z.object({
  oldPassword: z.string().min(6),
  newPassword: z.string().min(6),
})), async (c) => {
  const user = c.get('user') as UserContext;
  const body = c.req.valid('json');

  const result = changePassword(user.id, body.oldPassword, body.newPassword);

  if (!result.success) {
    return c.json({
      success: false,
      error: { code: 'CHANGE_PASSWORD_FAILED', message: result.error },
    }, 400);
  }

  return c.json({ success: true });
});

// 获取公开用户信息
users.get('/:id', async (c) => {
  const { id } = c.req.param();

  const userInfo = getPublicUserInfo(id);

  if (!userInfo) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'User not found' },
    }, 404);
  }

  return c.json({
    success: true,
    data: userInfo,
  });
});

export { users as usersRouter };
