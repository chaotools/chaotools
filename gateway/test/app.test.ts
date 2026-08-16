import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough';
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'chaotools-gateway-')), 'test.db');

const { app, initializeGateway } = await import('../src/app.ts');
const { createUser, createRefreshToken, rotateRefreshToken } = await import('../src/services/auth.ts');
const { createPayment, getUserPurchases, updatePaymentStatus } = await import('../src/services/billing.ts');
const { db } = await import('../src/services/db.ts');
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

test('refresh tokens rotate once and replay revokes the token family', async () => {
  const result = await createUser({
    name: 'Refresh Test',
    email: '  refresh-test@example.com ',
    password: 'password1',
  });
  assert.equal(result.success, true);
  assert.equal(result.user?.email, 'refresh-test@example.com');

  const first = createRefreshToken(result.user!.id);
  const rotated = rotateRefreshToken(first);
  assert.ok(rotated);
  assert.equal(rotated.userId, result.user!.id);

  // Reusing a rotated token must fail instead of issuing another session.
  assert.equal(rotateRefreshToken(first), null);
  assert.equal(rotateRefreshToken(rotated.raw), null);
});

test('payment callbacks are idempotent and refunds revoke purchase access', async () => {
  const user = await createUser({
    name: 'Billing Test',
    email: 'billing-test@example.com',
    password: 'password1',
  });
  assert.equal(user.success, true);

  const toolId = 'billing-test-tool';
  db.prepare(`
    INSERT INTO tools (
      id, name, slug, description, owner_id, tech_entry, pricing_type, pricing_price,
      visibility, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'paid', ?, 'private', 'draft')
  `).run(toolId, 'Billing Test Tool', 'billing-test-tool', 'Test tool', user.user!.id, '/tools/billing-test/', 100);

  const payment = createPayment(user.user!.id, 'purchase', toolId, 100, 'wechat');
  assert.ok(payment);
  assert.equal(updatePaymentStatus(payment.id, 'completed', 'external-billing-1'), true);
  assert.equal(updatePaymentStatus(payment.id, 'completed', 'external-billing-1'), true);
  assert.equal(getUserPurchases(user.user!.id)[0]?.status, 'completed');

  assert.equal(updatePaymentStatus(payment.id, 'refunded', 'external-billing-1'), true);
  assert.equal(getUserPurchases(user.user!.id)[0]?.status, 'refunded');
});
