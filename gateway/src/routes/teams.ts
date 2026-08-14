/**
 * 团队路由
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  getUserTeams,
  createTeam,
  getTeamMembers,
  addTeamMember,
  removeTeamMember,
  isTeamOwner,
} from '../services/team';
import { isOwner } from '../services/auth';
import type { UserContext } from '../types';

const teams = new Hono<AppEnv>();

// GET /teams - 获取我的团队
teams.get('/', async (c) => {
  const user = c.get('user') as UserContext;
  const userTeams = getUserTeams(user.id);

  return c.json({
    success: true,
    data: userTeams,
  });
});

// POST /teams - 创建团队
teams.post('/', zValidator('json', z.object({
  name: z.string().min(1).max(50),
})), async (c) => {
  const user = c.get('user') as UserContext;
  const body = c.req.valid('json');

  const team = createTeam(body.name, user.id);

  if (!team) {
    return c.json({
      success: false,
      error: { code: 'CREATE_FAILED', message: 'Failed to create team' },
    }, 400);
  }

  return c.json({
    success: true,
    data: team,
  }, 201);
});

// GET /teams/:id - 获取团队详情
teams.get('/:id', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user') as UserContext;

  const members = getTeamMembers(id);

  if (members.length === 0) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Team not found' },
    }, 404);
  }

  // 检查用户是否是团队成员
  const isMember = members.some(m => m.userId === user.id);

  if (!isMember && !isOwner(user.id)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Not a team member' },
    }, 403);
  }

  return c.json({
    success: true,
    data: { members },
  });
});

// POST /teams/:id/members - 添加成员
teams.post('/:id/members', zValidator('json', z.object({
  email: z.string().email(),
  role: z.enum(['member']).optional(),
})), async (c) => {
  const { id } = c.req.param();
  const user = c.get('user') as UserContext;
  const body = c.req.valid('json');

  // 只有团队 owner 或平台 owner 可以添加成员
  if (!isOwner(user.id) && !isTeamOwner(id, user.id)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Only owner can add members' },
    }, 403);
  }

  // TODO: 根据 email 查找用户
  // 目前先返回错误
  return c.json({
    success: false,
    error: { code: 'NOT_IMPLEMENTED', message: 'User lookup not implemented yet' },
  }, 501);
});

// DELETE /teams/:id/members/:userId - 移除成员
teams.delete('/:id/members/:userId', async (c) => {
  const { id, userId } = c.req.param();
  const user = c.get('user') as UserContext;

  // 只有团队 owner 或平台 owner 可以移除成员
  if (!isOwner(user.id) && !isTeamOwner(id, user.id)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Only owner can remove members' },
    }, 403);
  }

  const removed = removeTeamMember(id, userId);

  if (!removed) {
    return c.json({
      success: false,
      error: { code: 'REMOVE_FAILED', message: 'Cannot remove member' },
    }, 400);
  }

  return c.json({ success: true });
});

export { teams as teamsRouter };
