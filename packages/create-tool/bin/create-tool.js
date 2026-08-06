#!/usr/bin/env node

/**
 * Chaotools Create Tool CLI
 *
 * 使用方式:
 *   npx @chaotools/create-tool my-tool
 *   npx @chaotools/create-tool my-tool --template react
 */

import { init } from '../src/index.js';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    template: {
      type: 'string',
      short: 't',
      default: 'vanilla',
    },
    dir: {
      type: 'string',
      short: 'd',
      default: process.cwd(),
    },
    help: {
      type: 'boolean',
      short: 'h',
      default: false,
    },
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  console.log(`
╔═══════════════════════════════════════════╗
║        Chaotools Create Tool             ║
║        创建你的第一个工具                 ║
╚═══════════════════════════════════════════╝

用法:
  create-tool <tool-name> [选项]

参数:
  tool-name          工具名称 (英文, 只能用字母、数字、连字符)

选项:
  -t, --template     模板类型
                     - vanilla (默认)  纯 HTML/JS/CSS
                     - react           React 组件
                     - vue             Vue 组件
  -d, --dir         目标目录 (默认: 当前目录)
  -h, --help        显示帮助

示例:
  create-tool json-formatter
  create-tool my-tool --template react

文档: https://chaotools.tech/docs
`);
  process.exit(0);
}

const toolName = positionals[0];
const template = values.template;
const targetDir = values.dir;

init({ toolName, template, targetDir }).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
