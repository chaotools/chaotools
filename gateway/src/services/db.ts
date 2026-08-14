/**
 * 数据库服务
 */

import Database from 'better-sqlite3';
import { dirname } from 'path';

export const DB_PATH = process.env.DATABASE_PATH || (
  process.env.NODE_ENV === 'production'
    ? '/home/ubuntu/chaotools-data/chaotools.db'
    : './data/chaotools.db'
);

// 确保目录存在
import { mkdirSync } from 'fs';
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// SQLite 生产并发与外键约束
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

// 启用 WAL 模式，提升并发性能
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'core_indexes_and_refresh_cleanup',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expiry ON refresh_tokens(expires_at);
      CREATE INDEX IF NOT EXISTS idx_tools_public_listing ON tools(status, visibility, updated_at);
      CREATE INDEX IF NOT EXISTS idx_reviews_tool_status ON reviews(tool_id, status);
    `,
  },
  {
    version: 2,
    name: 'refresh_token_families',
    sql: `
      ALTER TABLE refresh_tokens ADD COLUMN family_id TEXT;
      ALTER TABLE refresh_tokens ADD COLUMN replaced_by_id TEXT;
      ALTER TABLE refresh_tokens ADD COLUMN reuse_detected_at TEXT;
      UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL;
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
    `,
  },
  {
    version: 3,
    name: 'payment_entitlement_links',
    sql: `
      ALTER TABLE subscriptions ADD COLUMN payment_id TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_payment ON subscriptions(payment_id) WHERE payment_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_user_tool_completed
        ON purchases(user_id, tool_id) WHERE status = 'completed';
      CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(type, reference_id, status);
    `,
  },
];

export function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const current = db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as { version: number };
  const pending = migrations.filter((migration) => migration.version > current.version);
  if (pending.length === 0) return;

  const apply = db.transaction(() => {
    for (const migration of pending) {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
        .run(migration.version, migration.name);
    }
  });
  apply.immediate();
}

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

  // 刷新令牌表（httpOnly Cookie 长效登录用，服务端可撤销/轮换）
  db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
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
