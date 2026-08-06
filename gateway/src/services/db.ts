/**
 * 数据库服务
 */

import Database from 'better-sqlite3';
import { join } from 'path';

const DB_PATH = process.env.DATABASE_PATH || './data/chaotools.db';

// 确保目录存在
import { mkdirSync } from 'fs';
mkdirSync(join(DB_PATH, '..'), { recursive: true });

const db = new Database(DB_PATH);

// 启用 WAL 模式，提升并发性能
db.pragma('journal_mode = WAL');

// 初始化数据库
export function initDatabase() {
  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'public' CHECK(role IN ('owner', 'member', 'contributor', 'public')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // 工具表
  db.exec(`
    CREATE TABLE IF NOT EXISTS tools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      long_description TEXT,
      owner_id TEXT NOT NULL,
      owner_type TEXT DEFAULT 'owner' CHECK(owner_type IN ('owner', 'community')),
      visibility TEXT DEFAULT 'private' CHECK(visibility IN ('private', 'team', 'public')),
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'review', 'published', 'deprecated')),
      categories TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      tech_entry TEXT NOT NULL,
      tech_version TEXT DEFAULT '1.0.0',
      tech_repository TEXT,
      pricing_type TEXT DEFAULT 'free' CHECK(pricing_type IN ('free', 'freemium', 'paid')),
      pricing_price INTEGER,
      thumbnail TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      published_at TEXT,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )
  `);

  // 审核表
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      tool_id TEXT NOT NULL,
      reviewer_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      feedback TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      reviewed_at TEXT,
      FOREIGN KEY (tool_id) REFERENCES tools(id),
      FOREIGN KEY (reviewer_id) REFERENCES users(id)
    )
  `);

  // 贡献者表
  db.exec(`
    CREATE TABLE IF NOT EXISTS contributors (
      id TEXT PRIMARY KEY,
      tool_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'contributor' CHECK(role IN ('author', 'contributor')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tool_id) REFERENCES tools(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tools_owner ON tools(owner_id);
    CREATE INDEX IF NOT EXISTS idx_tools_slug ON tools(slug);
    CREATE INDEX IF NOT EXISTS idx_tools_status ON tools(status);
    CREATE INDEX IF NOT EXISTS idx_tools_visibility ON tools(visibility);
  `);

  console.log('✅ Database initialized');
}

export { db };
