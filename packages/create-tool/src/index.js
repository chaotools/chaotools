/**
 * Create Tool CLI - 核心逻辑
 */

import { mkdirSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import kleur from 'kleur';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, 'templates');

const TEMPLATES = ['vanilla', 'react', 'vue'];
const VALID_NAME_REGEX = /^[a-z0-9-]+$/;

/**
 * 初始化一个新工具
 */
export async function init({ toolName, template = 'vanilla', targetDir = process.cwd() }) {
  // 验证名称
  if (!VALID_NAME_REGEX.test(toolName)) {
    throw new Error(
      `工具名称 "${toolName}" 不合法。\n` +
      `只能使用小写字母、数字和连字符 (a-z, 0-9, -)`
    );
  }

  // 验证模板
  if (!TEMPLATES.includes(template)) {
    throw new Error(
      `未知模板 "${template}"。\n` +
      `可用模板: ${TEMPLATES.join(', ')}`
    );
  }

  const toolDir = join(targetDir, toolName);

  // 检查目录是否存在
  if (existsSync(toolDir)) {
    throw new Error(`目录 "${toolDir}" 已存在`);
  }

  // 创建目录
  mkdirSync(toolDir, { recursive: true });

  // 复制模板
  const templateDir = join(TEMPLATES_DIR, template);
  cpSync(templateDir, toolDir, { recursive: true });

  // 更新 package.json 中的名称
  const pkgPath = join(toolDir, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    pkg.name = `@chaotools/${toolName}`;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  }

  // 生成 manifest.json
  const manifest = {
    id: toolName,
    name: toTitleCase(toolName),
    description: 'A Chaotools tool',
    version: '0.1.0',
    entry: 'index.html',
    author: '',
    repository: '',
  };
  writeFileSync(
    join(toolDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  // 成功提示
  console.log(`
${kleur.green('✅')} 工具 "${kleur.cyan(toolName)}" 创建成功!

${kleur.bold('📁 目录结构:')}
${listDir(toolDir, toolDir)}

${kleur.bold('🚀 开始开发:')}
  cd ${toolName}
  pnpm install
  pnpm dev

${kleur.bold('📝 manifest.json 配置:')}
  编辑 manifest.json 修改工具元信息

${kleur.bold('📚 文档:')}
  https://chaotools.tech/docs
`);
}

function toTitleCase(str) {
  return str
    .split('-')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function listDir(dir, base) {
  const items = [];
  const entries = [...new Set([
    ...readdirSync(dir).filter(f => !f.startsWith('.'))
  ])];

  for (const entry of entries.slice(0, 10)) {
    const fullPath = join(dir, entry);
    const rel = join('.', entry);
    if (existsSync(fullPath) && isDirectorySync(fullPath)) {
      items.push(`  ├── ${rel}/`);
    } else {
      items.push(`  ├── ${rel}`);
    }
  }

  if (entries.length > 10) {
    items.push(`  └── ... (${entries.length - 10} more files)`);
  }

  return items.join('\n');
}

function readdirSync(dir) {
  try {
    return [...new Set([
      ...require('fs').readdirSync(dir),
      ...require('fs').readdirSync(dir).flatMap(f => {
        const p = join(dir, f);
        if (require('fs').statSync(p).isDirectory()) {
          return require('fs').readdirSync(p).map(s => join(f, s));
        }
        return [];
      })
    ])];
  } catch {
    return [];
  }
}

function isDirectorySync(path) {
  try {
    return require('fs').statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function readFileSync(path, encoding) {
  return require('fs').readFileSync(path, encoding);
}
