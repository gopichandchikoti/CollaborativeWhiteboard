import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const root = path.resolve(import.meta.dirname, '..');
export const stateDirectory = path.join(root, '.local-run');
export const statePath = path.join(stateDirectory, 'whiteboard-processes.json');
export function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
export function occupied(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}
export function launch(name, entry, workingDirectory, extraEnvironment = {}) {
  const output = fs.openSync(path.join(stateDirectory, `${name}.log`), 'a');
  const errors = fs.openSync(path.join(stateDirectory, `${name}.err.log`), 'a');
  const child = spawn(process.execPath, [entry], {
    cwd: workingDirectory,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', output, errors],
    env: { ...process.env, ...extraEnvironment },
  });
  fs.closeSync(output);
  fs.closeSync(errors);
  child.unref();
  if (!child.pid) throw new Error(`Could not launch ${name}`);
  return child.pid;
}
export async function healthy(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    if (!url.endsWith('health')) return true;
    const body = await response.json();
    return body.service === 'collaborative-whiteboard-backend';
  } catch {
    return false;
  }
}
export function readState() {
  if (!fs.existsSync(statePath)) return null;
  const value = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (
    value.root !== root ||
    !Number.isSafeInteger(value.backend) ||
    !Number.isSafeInteger(value.frontend) ||
    value.backend <= 0 ||
    value.frontend <= 0
  ) {
    throw new Error('Invalid local launcher state; refusing to control unknown processes');
  }
  return value;
}
export async function stop(state) {
  await verifyOwnership(state);
  for (const pid of [state.frontend, state.backend]) {
    if (alive(pid)) process.kill(pid, 'SIGTERM');
  }
  const deadline = Date.now() + 5000;
  while ([state.frontend, state.backend].some(alive) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if ([state.frontend, state.backend].some(alive))
    throw new Error('A task-owned service did not stop; inspect its PID');
}
export async function verifyOwnership(state) {
  const entries = [
    [state.backend, path.join(root, 'backend/dist/main.js')],
    [state.frontend, path.join(root, 'frontend/node_modules/vite/bin/vite.js')],
  ];
  for (const [pid, entry] of entries) {
    if (!alive(pid)) continue;
    let command;
    if (process.platform === 'win32') {
      const result = await promisify(execFile)(
        'powershell.exe',
        ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],
        { windowsHide: true },
      );
      command = result.stdout;
    } else command = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    if (!command.toLowerCase().includes(entry.toLowerCase()))
      throw new Error(`PID ${pid} is not this task's service; refusing to stop it.`);
  }
}
