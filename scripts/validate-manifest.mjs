import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath = resolve(root, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (!manifest || !Array.isArray(manifest.tools) || !Array.isArray(manifest.categories)) {
  throw new Error('manifest.json must contain tools and categories arrays');
}

const ids = new Set();
const failures = [];
const serviceEntries = new Set(['/lhb-analyzer/', '/audio-trimmer/']);
for (const tool of manifest.tools) {
  if (!tool || typeof tool.id !== 'string' || !tool.id.trim()) failures.push('tool without id');
  if (ids.has(tool.id)) failures.push(`duplicate tool id: ${tool.id}`);
  ids.add(tool.id);
  if (!tool.tech || typeof tool.tech.entry !== 'string') {
    failures.push(`${tool.id}: missing tech.entry`);
    continue;
  }

  const entry = tool.tech.entry;
  if (entry.startsWith('/')) {
    const localPath = resolve(root, entry.slice(1));
    if (!existsSync(localPath) && !serviceEntries.has(entry)) failures.push(`${tool.id}: missing entry ${entry}`);
    if (existsSync(localPath) && localPath.endsWith('.html')) {
      const html = readFileSync(localPath, 'utf8');
      if (!html.includes(`data-tool-id="${tool.id}"`) && !html.includes(`data-tool-id='${tool.id}'`)) {
        failures.push(`${tool.id}: entry is missing data-tool-id`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `✖ ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`✓ manifest valid (${manifest.tools.length} tools, ${ids.size} unique ids)`);
