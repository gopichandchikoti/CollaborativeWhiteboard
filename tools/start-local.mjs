import fs from 'node:fs';
import path from 'node:path';
import {
  root,
  stateDirectory,
  statePath,
  launch,
  occupied,
  healthy,
  readState,
  alive,
  stop,
  verifyOwnership,
} from './local-processes.mjs';

async function main() {
  const previous = readState();
  const ports = await Promise.all([occupied(5603), occupied(5604)]);
  if (ports.some(Boolean)) {
    if (previous) await verifyOwnership(previous);
    if (
      previous &&
      alive(previous.frontend) &&
      alive(previous.backend) &&
      (await healthy('http://localhost:5603/api/health')) &&
      (await healthy('http://localhost:5603'))
    ) {
      console.log('Whiteboard is running: http://localhost:5603');
      return;
    }
    throw new Error('Port 5603 or 5604 is occupied. Inspect the listener; no existing service was stopped.');
  }
  const backendEntry = path.join(root, 'backend/dist/main.js');
  const frontendEntry = path.join(root, 'frontend/node_modules/vite/bin/vite.js');
  if (!fs.existsSync(backendEntry) || !fs.existsSync(frontendEntry))
    throw new Error('Install dependencies and build backend first.');
  fs.mkdirSync(stateDirectory, { recursive: true });
  const backend = launch('backend', backendEntry, path.join(root, 'backend'), {
    PORT: '5604',
    WHITEBOARD_DB: path.join(root, 'backend/data/whiteboard.sqlite'),
    NODE_ENV: 'development',
  });
  const frontend = launch('frontend', frontendEntry, path.join(root, 'frontend'));
  const state = {
    root,
    backend,
    frontend,
    startedAt: new Date().toISOString(),
  };
  try {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (!alive(backend) || !alive(frontend)) throw new Error('A local service exited before readiness.');
      if ((await healthy('http://localhost:5603/api/health')) && (await healthy('http://localhost:5603'))) {
        fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 2));
        fs.renameSync(`${statePath}.tmp`, statePath);
        console.log('Whiteboard is running: http://localhost:5603');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Readiness deadline exceeded. Inspect .local-run logs for diagnosis.');
  } catch (error) {
    await stop(state);
    throw error;
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
