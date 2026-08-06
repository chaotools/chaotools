/**
 * 工具注册表路由 (公开)
 */

import { Hono } from 'hono';
import { getPublicTools } from '../services/tools';

const registry = new Hono();

// GET /registry - 获取公开工具列表
registry.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') || '20', 10);

  const { tools, total } = getPublicTools(page, pageSize);

  return c.json({
    success: true,
    data: tools,
    pagination: {
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    },
  });
});

// GET /registry/categories - 获取所有分类
registry.get('/categories', async (c) => {
  // 后续从数据库读取
  const categories = [
    { id: 'dev', name: '开发工具', icon: '💻' },
    { id: 'fun', name: '趣味工具', icon: '🎮' },
    { id: 'convert', name: '转换工具', icon: '🔄' },
    { id: 'text', name: '文本处理', icon: '📝' },
  ];

  return c.json({
    success: true,
    data: categories,
  });
});

export { registry as registryRouter };
