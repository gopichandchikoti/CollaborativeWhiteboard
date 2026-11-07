import fs from 'node:fs';
import { statePath, readState, stop } from './local-processes.mjs';
async function main() {
  const state = readState();
  if (!state) {
    console.log('No task-owned local services are recorded.');
    return;
  }
  await stop(state);
  fs.unlinkSync(statePath);
  console.log('Stopped the recorded whiteboard services.');
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
