/** Gateway production listener bootstrap. */

import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { app, createApp, initializeGateway } from './app';

function isMainModule(): boolean {
  return Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1];
}

if (isMainModule()) {
  initializeGateway();
  const port = Number.parseInt(process.env.PORT || '3001', 10);
  console.log(`Chaotools Gateway listening on http://127.0.0.1:${port}`);
  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' });
}

export { app, createApp, initializeGateway };
export default app;
