import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createApplication } from '../backend/dist/main.js';
import { createServer, preview } from '../frontend/node_modules/vite/dist/node/index.js';

const root = path.resolve(import.meta.dirname, '..');
const previousDatabase = process.env.WHITEBOARD_DB;
process.env.WHITEBOARD_DB = ':memory:';
let app;
let dev;
let production;
let base;

function url(server) {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function checkPage(label) {
  const response = await fetch(base, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('permissions-policy') ?? '', /camera=\(\)/);
  const html = await response.text();
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(policy, 'The document itself must deliver CSP, independently of API response headers');
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'none'/);
  assert.doesNotMatch(policy, /unsafe-eval/);
  assert.doesNotMatch(policy.match(/script-src[^;]*/)?.[0] ?? '', /unsafe-inline/);
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'));
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (match[2].trim()) {
      const hash = createHash('sha256').update(match[2]).digest('base64');
      assert.ok(policy.includes(`'sha256-${hash}'`), 'Inline development bootstrap must have its exact hash');
    }
    const source = match[1].match(/src="([^"]+)"/)?.[1];
    if (source) assert.equal((await fetch(new URL(source, base))).status, 200);
  }
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, 'collaborative-whiteboard-backend');
  assert.equal((await fetch(`${base}/api/boards`)).status, 401);
  const denied = await fetch(`${base}/api/boards`, {
    method: 'POST',
    headers: { origin: 'http://hostile.test', 'x-whiteboard-request': '1' },
  });
  assert.equal(denied.status, 403);
  console.log(`${label}: HTML security policy, script delivery, proxy health and private/origin denial passed.`);
}

try {
  app = await createApplication();
  await app.listen(0, '127.0.0.1');
  const proxy = {
    '/api': { target: await app.getUrl(), rewrite: (value) => value.replace(/^\/api/, '') },
  };
  dev = await createServer({
    root: path.join(root, 'frontend'),
    clearScreen: false,
    server: { port: 0, proxy },
  });
  await dev.listen();
  base = url(dev.httpServer);
  await checkPage('Development server');
  await dev.close();
  dev = undefined;
  production = await preview({ root: path.join(root, 'frontend'), preview: { port: 0, proxy } });
  base = url(production.httpServer);
  await checkPage('Production build preview');
  const assets = fs.readdirSync(path.join(root, 'frontend/dist/assets'));
  assert.ok(!assets.some((name) => name.endsWith('.map')), 'Release assets must not contain source maps');
  console.log('Isolated HTTP smoke passed; this does not execute browser JavaScript or prove visual accessibility.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (production) await new Promise((resolve) => production.httpServer.close(resolve));
  await dev?.close();
  await app?.close();
  if (previousDatabase === undefined) delete process.env.WHITEBOARD_DB;
  else process.env.WHITEBOARD_DB = previousDatabase;
}
