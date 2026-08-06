/**
 * 用户服务 - 用户档案和设置
 */

import { db } from './db';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

// 初始化用户表
export function initUserTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      display_name TEXT,
      bio TEXT,
      avatar_url TEXT,
      website TEXT,
      github_username TEXT,
      twitter_username TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      theme TEXT DEFAULT 'dark' CHECK(theme IN ('dark', 'light', 'auto')),
      language TEXT DEFAULT 'zh-CN',
      email_notifications INTEGER DEFAULT 1,
      push_notifications INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
}

// 用户档案
export interface UserProfile {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  website?: string;
  githubUsername?: string;
  twitterUsername?: string;
}

// 用户设置
export interface UserSettings {
  theme: 'dark' | 'light' | 'auto';
  language: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

/**
 * 获取用户档案
 */
export function getUserProfile(userId: string): UserProfile | null {
  const row = db.prepare(`
    SELECT display_name, bio, avatar_url, website, github_username, twitter_username
    FROM user_profiles WHERE user_id = ?
  `).get(userId) as any;

  if (!row) return null;

  return {
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    website: row.website,
    githubUsername: row.github_username,
    twitterUsername: row.twitter_username,
  };
}

/**
 * 更新用户档案
 */
export function updateUserProfile(userId: string, data: UserProfile): boolean {
  try {
    const existing = db.prepare('SELECT user_id FROM user_profiles WHERE user_id = ?').get(userId);

    if (existing) {
      // 更新
      db.prepare(`
        UPDATE user_profiles SET
          display_name = COALESCE(?, display_name),
          bio = COALESCE(?, bio),
          avatar_url = COALESCE(?, avatar_url),
          website = COALESCE(?, website),
          github_username = COALESCE(?, github_username),
          twitter_username = COALESCE(?, twitter_username),
          updated_at = datetime('now')
        WHERE user_id = ?
      `).run(
        data.displayName, data.bio, data.avatarUrl,
        data.website, data.githubUsername, data.twitterUsername,
        userId
      );
    } else {
      // 创建
      db.prepare(`
        INSERT INTO user_profiles (user_id, display_name, bio, avatar_url, website, github_username, twitter_username)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        data.displayName, data.bio, data.avatarUrl,
        data.website, data.githubUsername, data.twitterUsername
      );
    }

    return true;
  } catch (err) {
    console.error('Update profile error:', err);
    return false;
  }
}

/**
 * 获取用户设置
 */
export function getUserSettings(userId: string): UserSettings {
  const row = db.prepare(`
    SELECT theme, language, email_notifications, push_notifications
    FROM user_settings WHERE user_id = ?
  `).get(userId) as any;

  if (!row) {
    return {
      theme: 'dark',
      language: 'zh-CN',
      emailNotifications: true,
      pushNotifications: true,
    };
  }

  return {
    theme: row.theme,
    language: row.language,
    emailNotifications: !!row.email_notifications,
    pushNotifications: !!row.push_notifications,
  };
}

/**
 * 更新用户设置
 */
export function updateUserSettings(userId: string, data: Partial<UserSettings>): boolean {
  try {
    const existing = db.prepare('SELECT user_id FROM user_settings WHERE user_id = ?').get(userId);

    const updates: string[] = [];
    const values: any[] = [];

    if (data.theme !== undefined) {
      updates.push('theme = ?');
      values.push(data.theme);
    }
    if (data.language !== undefined) {
      updates.push('language = ?');
      values.push(data.language);
    }
    if (data.emailNotifications !== undefined) {
      updates.push('email_notifications = ?');
      values.push(data.emailNotifications ? 1 : 0);
    }
    if (data.pushNotifications !== undefined) {
      updates.push('push_notifications = ?');
      values.push(data.pushNotifications ? 1 : 0);
    }

    if (updates.length === 0) {
      return true;
    }

    updates.push('updated_at = datetime(\'now\')');
    values.push(userId);

    if (existing) {
      db.prepare(`UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`).run(...values);
    } else {
      const emailNotif =
        data.emailNotifications === undefined ? 1 : (data.emailNotifications ? 1 : 0);
      const pushNotif =
        data.pushNotifications === undefined ? 1 : (data.pushNotifications ? 1 : 0);
      db.prepare(`
        INSERT INTO user_settings (user_id, theme, language, email_notifications, push_notifications)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        userId,
        data.theme || 'dark',
        data.language || 'zh-CN',
        emailNotif,
        pushNotif
      );
    }

    return true;
  } catch (err) {
    console.error('Update settings error:', err);
    return false;
  }
}

/**
 * 获取用户贡献的工具
 */
export function getUserContributedTools(userId: string) {
  const tools = db.prepare(`
    SELECT t.*, c.role as contributor_role
    FROM tools t
    INNER JOIN contributors c ON t.id = c.tool_id
    WHERE c.user_id = ?
    ORDER BY c.created_at DESC
  `).all(userId);

  return tools;
}

/**
 * 更改密码
 */
export function changePassword(userId: string, oldPassword: string, newPassword: string): { success: boolean; error?: string } {
  try {
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as any;

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const valid = bcrypt.compareSync(oldPassword, user.password_hash);
    if (!valid) {
      return { success: false, error: 'Invalid old password' };
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newHash, userId);

    return { success: true };
  } catch (err) {
    console.error('Change password error:', err);
    return { success: false, error: 'Failed to change password' };
  }
}

/**
 * 获取公开用户信息
 */
export function getPublicUserInfo(userId: string) {
  const user = db.prepare(`
    SELECT id, name, role, created_at FROM users WHERE id = ?
  `).get(userId) as any;

  if (!user) return null;

  const profile = getUserProfile(userId);

  return {
    id: user.id,
    name: user.name,
    role: user.role,
    createdAt: user.created_at,
    profile,
  };
}
