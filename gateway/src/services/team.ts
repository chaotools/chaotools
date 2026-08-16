/**
 * 团队服务 - 团队成员管理
 */

import { db } from './db';
import { randomUUID } from 'crypto';
import type { UserRole } from '@chaotools/types';

// 团队表
export function initTeamTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member' CHECK(role IN ('owner', 'member')),
      joined_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(team_id, user_id)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
  `);
}

// 团队信息
export interface Team {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
}

// 团队成员
export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: 'owner' | 'member';
  joinedAt: Date;
}

/**
 * 创建团队
 */
export function createTeam(name: string, ownerId: string): Team | null {
  const id = randomUUID();
  const now = new Date().toISOString();

  try {
    // 创建团队
    db.prepare(`
      INSERT INTO teams (id, name, owner_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, ownerId, now, now);

    // 创建者自动成为 owner 成员
    db.prepare(`
      INSERT INTO team_members (id, team_id, user_id, role, joined_at)
      VALUES (?, ?, ?, 'owner', ?)
    `).run(randomUUID(), id, ownerId, now);

    return {
      id,
      name,
      ownerId,
      createdAt: new Date(now),
    };
  } catch (err) {
    console.error('Create team error:', err);
    return null;
  }
}

/**
 * 获取用户的团队列表
 */
export function getUserTeams(userId: string): Team[] {
  const rows = db.prepare(`
    SELECT t.id, t.name, t.owner_id, t.created_at
    FROM teams t
    INNER JOIN team_members tm ON t.id = tm.team_id
    WHERE tm.user_id = ?
    ORDER BY t.created_at DESC
  `).all(userId) as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: new Date(row.created_at),
  }));
}

/**
 * 获取团队成员列表
 */
export function getTeamMembers(teamId: string): TeamMember[] {
  const rows = db.prepare(`
    SELECT tm.id, tm.team_id, tm.user_id, tm.role, tm.joined_at,
           u.name as user_name, u.email as user_email
    FROM team_members tm
    INNER JOIN users u ON tm.user_id = u.id
    WHERE tm.team_id = ?
    ORDER BY tm.role DESC, tm.joined_at ASC
  `).all(teamId) as any[];

  return rows.map(row => ({
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    role: row.role,
    joinedAt: new Date(row.joined_at),
  }));
}

export function teamExists(teamId: string): boolean {
  return Boolean(db.prepare('SELECT id FROM teams WHERE id = ?').get(teamId));
}

export function getUserIdByEmail(email: string): string | null {
  const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase()) as { id: string } | undefined;
  return row?.id || null;
}

/**
 * 添加团队成员
 */
export function addTeamMember(
  teamId: string,
  userId: string,
  role: 'member' = 'member'
): boolean {
  try {
    // 检查用户是否已是成员
    const existing = db.prepare(`
      SELECT id FROM team_members WHERE team_id = ? AND user_id = ?
    `).get(teamId, userId);

    if (existing) {
      return false; // 已是成员
    }

    db.prepare(`
      INSERT INTO team_members (id, team_id, user_id, role, joined_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(randomUUID(), teamId, userId, role);

    return true;
  } catch (err) {
    console.error('Add team member error:', err);
    return false;
  }
}

/**
 * 移除团队成员
 */
export function removeTeamMember(teamId: string, userId: string): boolean {
  // 不能移除 owner
  const member = db.prepare(`
    SELECT role FROM team_members WHERE team_id = ? AND user_id = ?
  `).get(teamId, userId) as any;

  if (!member) {
    return false;
  }

  if (member.role === 'owner') {
    return false; // 不能移除 owner
  }

  db.prepare(`
    DELETE FROM team_members WHERE team_id = ? AND user_id = ?
  `).run(teamId, userId);

  return true;
}

/**
 * 检查用户是否是团队成员
 */
export function isTeamMember(teamId: string, userId: string): boolean {
  const member = db.prepare(`
    SELECT id FROM team_members WHERE team_id = ? AND user_id = ?
  `).get(teamId, userId);

  return !!member;
}

/**
 * 检查用户是否是团队 owner
 */
export function isTeamOwner(teamId: string, userId: string): boolean {
  const member = db.prepare(`
    SELECT role FROM team_members WHERE team_id = ? AND user_id = ? AND role = 'owner'
  `).get(teamId, userId);

  return !!member;
}

/**
 * 获取用户的所有团队 ID
 */
export function getUserTeamIds(userId: string): string[] {
  const rows = db.prepare(`
    SELECT team_id FROM team_members WHERE user_id = ?
  `).all(userId) as any[];

  return rows.map(row => row.team_id);
}

/**
 * 检查工具是否对用户可见 (团队成员可以看团队工具)
 */
export function canUserAccessTeamTool(
  toolOwnerId: string,
  userId: string,
  toolVisibility: string
): boolean {
  // 如果不是团队工具，不需要检查
  if (toolVisibility !== 'team') {
    return toolVisibility === 'public';
  }

  // TODO: 实现团队逻辑
  // 目前假设 owner 就是唯一的团队
  // 后续需要扩展：工具可以属于某个团队
  const member = db.prepare(`
    SELECT tm.id
    FROM teams t
    INNER JOIN team_members tm ON tm.team_id = t.id
    WHERE t.owner_id = ? AND tm.user_id = ?
    LIMIT 1
  `).get(toolOwnerId, userId);
  return Boolean(member);
}
