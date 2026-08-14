import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough';
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'chaotools-gateway-')), 'test.db');

const { app, initializeGateway } = await import('../src/app.ts');
initializeGateway();

test('health endpoint reports a live process', async () => {
  const response = await app.request('/health');
  assert.equal(response.status, 200);
  const body = await response.json() as { status: string; timestamp: string };
  assert.equal(body.status, 'ok');
  assert.ok(body.timestamp);
});

test('ready endpoint verifies the SQLite connection', async () => {
  const response = await app.request('/ready');
  assert.equal(response.status, 200);
  const body = await response.json() as { status: string; database: string };
  assert.deepEqual(body, { status: 'ready', database: 'ok' });
});

test('unknown endpoints use the stable error envelope', async () => {
  const response = await app.request('/does-not-exist');
  assert.equal(response.status, 404);
  const body = await response.json() as { success: boolean; error: { code: string } };
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'NOT_FOUND');
});
