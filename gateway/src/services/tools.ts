/**
 * 工具服务
 */

import { db } from './db';
import { randomUUID } from 'crypto';
import type { Tool, CreateToolRequest, UpdateToolRequest } from '../types';
import type { UserContext } from '../types';
import { isOwner } from './auth';

// 转换数据库行到 Tool 对象
function rowToTool(row: any): Tool {
  return {
    id: row.id,
    icon: row.icon || '',
    name: row.name,
    slug: row.slug,
    description: row.description,
    longDescription: row.long_description,
    owner: {
      id: row.owner_id,
      name: row.owner_name || 'Unknown',
      type: row.owner_type,
    },
    visibility: row.visibility,
    status: row.status,
    categories: JSON.parse(row.categories || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    tech: {
      entry: row.tech_entry,
      version: row.tech_version,
      repository: row.tech_repository,
    },
    pricing: {
      type: row.pricing_type,
      price: row.pricing_price,
    },
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    publishedAt: row.published_at ? new Date(row.published_at) : undefined,
  };
}

// 获取所有公开工具
export function getPublicTools(page = 1, pageSize = 20): { tools: Tool[]; total: number } {
  const offset = (page - 1) * pageSize;

  const rows = db.prepare(`
    SELECT t.*, u.name as owner_name
    FROM tools t
    LEFT JOIN users u ON t.owner_id = u.id
    WHERE t.visibility = 'public' AND t.status = 'published'
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(pageSize, offset) as any[];

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM tools WHERE visibility = 'public' AND status = 'published'
  `).get() as any;

  return {
    tools: rows.map(rowToTool),
    total: total.count,
  };
}

// 按 slug 获取工具
export function getToolBySlug(slug: string): Tool | null {
  const row = db.prepare(`
    SELECT t.*, u.name as owner_name
    FROM tools t
    LEFT JOIN users u ON t.owner_id = u.id
    WHERE t.slug = ?
  `).get(slug) as any;

  return row ? rowToTool(row) : null;
}

// 按 ID 获取工具
export function getToolById(id: string): Tool | null {
  const row = db.prepare(`
    SELECT t.*, u.name as owner_name
    FROM tools t
    LEFT JOIN users u ON t.owner_id = u.id
    WHERE t.id = ?
  `).get(id) as any;

  return row ? rowToTool(row) : null;
}

// 获取用户自己的工具
export function getMyTools(user: UserContext): Tool[] {
  const isOwnerUser = isOwner(user.id);

  if (!isOwnerUser) {
    const rows = db.prepare(`
      SELECT t.*, u.name as owner_name
      FROM tools t
      LEFT JOIN users u ON t.owner_id = u.id
      WHERE t.owner_id = ?
      ORDER BY t.created_at DESC
    `).all(user.id) as any[];
    return rows.map(rowToTool);
  }

  // owner 可以看所有工具
  const rows = db.prepare(`
    SELECT t.*, u.name as owner_name
    FROM tools t
    LEFT JOIN users u ON t.owner_id = u.id
    ORDER BY t.created_at DESC
  `).all() as any[];
  return rows.map(rowToTool);
}

// 创建工具
export function createTool(data: CreateToolRequest, user: UserContext): Tool | null {
  try {
    const id = randomUUID();
    const now = new Date().toISOString();

    // owner 发布的工具直接 published
    const isOwnerUser = isOwner(user.id);
    const status = isOwnerUser ? 'published' : 'draft';

    db.prepare(`
      INSERT INTO tools (
        id, name, slug, description, long_description,
        owner_id, owner_type, visibility, status,
        categories, tags, tech_entry, tech_version, tech_repository,
        pricing_type, pricing_price, created_at, updated_at, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name,
      data.slug,
      data.description,
      data.longDescription || null,
      user.id,
      isOwnerUser ? 'owner' : 'community',
      data.visibility,
      status,
      JSON.stringify(data.categories),
      JSON.stringify(data.tags),
      data.tech.entry,
      data.tech.version,
      data.tech.repository || null,
      data.pricing?.type || 'free',
      data.pricing?.price || null,
      now,
      now,
      isOwnerUser ? now : null
    );

    return getToolById(id);
  } catch (err: any) {
    if (err.message.includes('UNIQUE')) {
      throw new Error(`Tool with slug "${data.slug}" already exists`);
    }
    throw err;
  }
}

// 更新工具
export function updateTool(id: string, data: UpdateToolRequest, user: UserContext): Tool | null {
  const tool = getToolById(id);
  if (!tool) return null;

  // 权限检查
  const canEdit = tool.owner?.id === user.id || isOwner(user.id);
  if (!canEdit) {
    throw new Error('Permission denied');
  }

  const isOwnerUser = isOwner(user.id);
  const updates: string[] = [];
  const values: any[] = [];

  if (data.name) { updates.push('name = ?'); values.push(data.name); }
  if (data.slug) { updates.push('slug = ?'); values.push(data.slug); }
  if (data.description) { updates.push('description = ?'); values.push(data.description); }
  if (data.longDescription) { updates.push('long_description = ?'); values.push(data.longDescription); }
  if (data.visibility) {
    // 普通用户不能将工具设为 public/team（越权发布），只有平台 owner 可以
    if (!isOwnerUser && (data.visibility === 'public' || data.visibility === 'team')) {
      throw new Error('Only platform owner can make tools public or team-visible');
    }
    updates.push('visibility = ?');
    values.push(data.visibility);
  }
  if (data.status) {
    // 只有平台 owner 可以改状态（发布/审核/下架），普通作者不能自行发布
    if (!isOwnerUser) {
      throw new Error('Only platform owner can change tool status');
    }
    updates.push('status = ?');
    values.push(data.status);
  }
  if (data.categories) { updates.push('categories = ?'); values.push(JSON.stringify(data.categories)); }
  if (data.tags) { updates.push('tags = ?'); values.push(JSON.stringify(data.tags)); }
  if (data.tech) {
    if (data.tech.entry) { updates.push('tech_entry = ?'); values.push(data.tech.entry); }
    if (data.tech.version) { updates.push('tech_version = ?'); values.push(data.tech.version); }
    if (data.tech.repository !== undefined) { updates.push('tech_repository = ?'); values.push(data.tech.repository); }
  }
  if (data.pricing) {
    if (data.pricing.type) { updates.push('pricing_type = ?'); values.push(data.pricing.type); }
    if (data.pricing.price !== undefined) { updates.push('pricing_price = ?'); values.push(data.pricing.price); }
  }

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());

  if (isOwnerUser && data.status === 'published' && !tool.publishedAt) {
    updates.push('published_at = ?');
    values.push(new Date().toISOString());
  }

  values.push(id);

  db.prepare(`UPDATE tools SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  return getToolById(id);
}

// 删除工具
export function deleteTool(id: string, user: UserContext): boolean {
  const tool = getToolById(id);
  if (!tool) return false;

  const canDelete = tool.owner?.id === user.id || isOwner(user.id);
  if (!canDelete) {
    throw new Error('Permission denied');
  }

  db.prepare('DELETE FROM tools WHERE id = ?').run(id);
  return true;
}

// 提交审核
export function submitForReview(id: string, user: UserContext): Tool | null {
  const tool = getToolById(id);
  if (!tool) return null;

  if (tool.owner?.id !== user.id) {
    throw new Error('Only tool owner can submit for review');
  }

  db.prepare(`
    INSERT INTO reviews (id, tool_id, reviewer_id, status, created_at)
    VALUES (?, ?, ?, 'pending', datetime('now'))
  `).run(randomUUID(), id, user.id);

  db.prepare(`UPDATE tools SET status = 'review', updated_at = datetime('now') WHERE id = ?`).run(id);

  return getToolById(id);
}

// 审核工具
export function reviewTool(id: string, status: 'approved' | 'rejected', feedback: string, reviewer: UserContext): Tool | null {
  if (!isOwner(reviewer.id)) {
    throw new Error('Only owner can review tools');
  }

  const now = new Date().toISOString();
  const isApproved = status === 'approved';

  db.prepare(`
    UPDATE reviews
    SET status = ?, feedback = ?, reviewed_at = ?
    WHERE tool_id = ? AND status = 'pending'
    `).run(status, feedback, now, id);

  if (isApproved) {
    db.prepare(`
      UPDATE tools
      SET status = 'published', visibility = 'public', updated_at = ?, published_at = ?
      WHERE id = ?
    `).run(now, now, id);
  } else {
    db.prepare(`
      UPDATE tools
      SET status = 'draft', visibility = 'private', updated_at = ?, published_at = NULL
      WHERE id = ?
    `).run(now, id);
  }

  return getToolById(id);
}
