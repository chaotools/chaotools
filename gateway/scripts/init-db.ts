/**
 * 数据库初始化脚本
 */

import { initDatabase, runMigrations, db } from '../src/services/db';
import { initTeamTable } from '../src/services/team';
import { initAnalyticsTable } from '../src/services/analytics';
import { initUserTable } from '../src/services/user';
import { initBillingTable } from '../src/services/billing';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

async function seed() {
  console.log('🌱 Seeding database...\n');

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error(
      'ADMIN_PASSWORD environment variable is required. ' +
      'Generate a strong one and pass it before running db:init.'
    );
  }

  // 初始化表结构
  initDatabase();
  initTeamTable();
  initAnalyticsTable();
  initUserTable();
  initBillingTable();
  runMigrations();

  // 创建 owner 用户
  const ownerPassword = await bcrypt.hash(adminPassword, 10);
  const ownerId = randomUUID();

  try {
    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role)
      VALUES (?, ?, ?, ?, 'owner')
    `).run(ownerId, 'Chaotools Owner', 'admin@chaotools.tech', ownerPassword);

    console.log('✅ Created owner user: admin@chaotools.tech');
  } catch (err: any) {
    if (err.message.includes('UNIQUE')) {
      console.log('ℹ️  Owner user already exists');
    } else {
      throw err;
    }
  }

  // 创建示例工具
  const sampleTools = [
    {
      id: randomUUID(),
      name: 'JSON 格式化',
      slug: 'json-formatter',
      description: 'JSON 数据格式化、压缩、校验',
      categories: JSON.stringify(['dev']),
      tags: JSON.stringify(['json', '格式化', '开发']),
    },
    {
      id: randomUUID(),
      name: '颜色转换器',
      slug: 'color-converter',
      description: 'HEX、RGB、HSL 颜色互转',
      categories: JSON.stringify(['dev', 'convert']),
      tags: JSON.stringify(['颜色', 'HEX', 'RGB']),
    },
    {
      id: randomUUID(),
      name: '正则测试',
      slug: 'regex-tester',
      description: '在线正则表达式测试工具',
      categories: JSON.stringify(['dev']),
      tags: JSON.stringify(['正则', 'regex', '测试']),
    },
  ];

  const now = new Date().toISOString();

  for (const tool of sampleTools) {
    try {
      db.prepare(`
        INSERT INTO tools (
          id, name, slug, description, owner_id, owner_type,
          visibility, status, categories, tags, tech_entry, tech_version,
          pricing_type, created_at, updated_at, published_at
        ) VALUES (?, ?, ?, ?, ?, 'owner', 'public', 'published', ?, ?, '/tools/placeholder', '1.0.0', 'free', ?, ?, ?)
      `).run(
        tool.id, tool.name, tool.slug, tool.description,
        ownerId, tool.categories, tool.tags, now, now, now
      );
      console.log(`✅ Created tool: ${tool.name}`);
    } catch (err: any) {
      if (err.message.includes('UNIQUE')) {
        console.log(`ℹ️  Tool "${tool.name}" already exists`);
      } else {
        throw err;
      }
    }
  }

  console.log('\n✨ Database seeded successfully!');
  console.log('\n📝 Default credentials:');
  console.log('   Email: admin@chaotools.tech');
  console.log('   Password: (set via ADMIN_PASSWORD env)');
}

seed().catch(console.error);
