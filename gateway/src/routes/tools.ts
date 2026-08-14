/**
 * 工具路由
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  getPublicTools,
  getToolById,
  getToolBySlug,
  getMyTools,
  createTool,
  updateTool,
  deleteTool,
  submitForReview,
  reviewTool,
} from '../services/tools';
import { isOwner } from '../services/auth';
import type { UserContext } from '../types';

const tools = new Hono<AppEnv>();

// 获取 URL 参数
const getQuery = (c: Context<AppEnv>) => ({
  page: parseInt(c.req.query('page') || '1', 10),
  pageSize: parseInt(c.req.query('pageSize') || '20', 10),
});

// GET /tools - 获取我的工具列表
tools.get('/', async (c) => {
  const user = c.get('user') as UserContext;
  const myTools = getMyTools(user);

  return c.json({
    success: true,
    data: myTools,
  });
});

// POST /tools - 创建工具
tools.post('/', zValidator('json', z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  description: z.string().min(1),
  longDescription: z.string().optional(),
  visibility: z.enum(['private', 'team', 'public']),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  tech: z.object({
    entry: z.string(),
    version: z.string(),
    repository: z.string().optional(),
  }),
  pricing: z.object({
    type: z.enum(['free', 'freemium', 'paid']),
    price: z.number().optional(),
  }).optional(),
})), async (c) => {
  const user = c.get('user') as UserContext;
  const body = c.req.valid('json');

  try {
    const tool = createTool(body, user);
    return c.json({ success: true, data: tool }, 201);
  } catch (err: any) {
    return c.json({
      success: false,
      error: { code: 'CREATE_FAILED', message: err.message },
    }, 400);
  }
});

// GET /tools/:id - 获取单个工具
tools.get('/:id', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user') as UserContext;

  const tool = getToolBySlug(id) || getToolById(id);

  if (!tool) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Tool not found' },
    }, 404);
  }

  // 非公开/未发布工具仅限本人或平台 owner 查看
  const isPublicPublished =
    tool.visibility === 'public' && tool.status === 'published';
  if (!isPublicPublished && !isOwner(user.id) && tool.owner?.id !== user.id) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Tool is not public' },
    }, 403);
  }

  return c.json({
    success: true,
    data: tool,
  });
});

// PUT /tools/:id - 更新工具
tools.put('/:id', zValidator('json', z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().min(1).optional(),
  longDescription: z.string().optional(),
  visibility: z.enum(['private', 'team', 'public']).optional(),
  status: z.enum(['draft', 'review', 'published', 'deprecated']).optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  tech: z.object({
    entry: z.string().optional(),
    version: z.string().optional(),
    repository: z.string().optional(),
  }).optional(),
  pricing: z.object({
    type: z.enum(['free', 'freemium', 'paid']).optional(),
    price: z.number().optional(),
  }).optional(),
  review: z.object({
    reviewer: z.string(),
    status: z.enum(['pending', 'approved', 'rejected']),
    feedback: z.string().optional(),
  }).optional(),
})), async (c) => {
  const { id } = c.req.param();
  const user = c.get('user') as UserContext;
  const body = c.req.valid('json');

  try {
    const tool = updateTool(id, body, user);

    if (!tool) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tool not found' },
      }, 404);
    }

    return c.json({ success: true, data: tool });
  } catch (err: any) {
    return c.json({
      success: false,
      error: { code: 'UPDATE_FAILED', message: err.message },
    }, 403);
  }
});

// DELETE /tools/:id - 删除工具
tools.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user') as UserContext;

  try {
    const deleted = deleteTool(id, user);

    if (!deleted) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tool not found' },
      }, 404);
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({
      success: false,
      error: { code: 'DELETE_FAILED', message: err.message },
    }, 403);
  }
});

// POST /tools/:id/review - 提交审核
tools.post('/:id/review', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user') as UserContext;

  try {
    const tool = submitForReview(id, user);

    if (!tool) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tool not found' },
      }, 404);
    }

    return c.json({ success: true, data: tool });
  } catch (err: any) {
    return c.json({
      success: false,
      error: { code: 'REVIEW_FAILED', message: err.message },
    }, 400);
  }
});

// POST /tools/:id/approve - 审核通过 (仅 owner)
tools.post('/:id/approve', zValidator('json', z.object({
  feedback: z.string().optional(),
})), async (c) => {
  const { id } = c.req.param();
  const user = c.get('user') as UserContext;
  const body = c.req.valid('json');

  if (!isOwner(user.id)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Only owner can approve tools' },
    }, 403);
  }

  try {
    const tool = reviewTool(id, 'approved', body.feedback || '', user);

    if (!tool) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tool not found' },
      }, 404);
    }

    return c.json({ success: true, data: tool });
  } catch (err: any) {
    return c.json({
      success: false,
      error: { code: 'REVIEW_FAILED', message: err.message },
    }, 400);
  }
});

// POST /tools/:id/reject - 审核拒绝 (仅 owner)
tools.post('/:id/reject', zValidator('json', z.object({
  feedback: z.string(),
})), async (c) => {
  const { id } = c.req.param();
  const user = c.get('user') as UserContext;
  const body = c.req.valid('json');

  if (!isOwner(user.id)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Only owner can reject tools' },
    }, 403);
  }

  try {
    const tool = reviewTool(id, 'rejected', body.feedback, user);

    if (!tool) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tool not found' },
      }, 404);
    }

    return c.json({ success: true, data: tool });
  } catch (err: any) {
    return c.json({
      success: false,
      error: { code: 'REVIEW_FAILED', message: err.message },
    }, 400);
  }
});

export { tools as toolsRouter };
