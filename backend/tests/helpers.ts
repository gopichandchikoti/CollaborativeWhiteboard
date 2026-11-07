import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { randomUUID } from 'node:crypto';
import { BoardItem } from '../src/contracts';
export const origin = 'http://localhost:5603';
export const item = (): BoardItem => ({
  id: randomUUID(),
  type: 'sticky',
  x: 100,
  y: 100,
  width: 120,
  height: 100,
  text: 'Synthetic test note',
  color: '#24332e',
});
export function packet(doc: Y.Doc, id = 1, generation = 0) {
  return JSON.stringify({
    type: 'update',
    data: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
    id,
    generation,
  });
}
export interface Message {
  type: string;
  data: string;
  id: number;
  generation: number;
  peers: unknown[];
}
export async function connect(
  base: string,
  boardId: string,
  cookie: string,
  options: string | { origin?: string; autoPong?: boolean } = origin,
) {
  const customOrigin = typeof options === 'string' ? options : (options.origin ?? origin);
  const socket = new WebSocket(`${base.replace('http:', 'ws:')}/collaboration?board=${boardId}`, {
    headers: { cookie, origin: customOrigin },
    autoPong: typeof options === 'string' ? true : (options.autoPong ?? true),
  });
  const messages: Message[] = [];
  socket.on('message', (data) => messages.push(JSON.parse(data.toString()) as Message));
  await new Promise<void>((resolve, reject) => {
    let refused = false;
    socket.once('open', resolve);
    socket.once('unexpected-response', (_request, response) => {
      refused = response.statusCode === 403;
      response.resume();
      socket.terminate();
      if (refused) resolve();
      else reject(new Error('Unexpected handshake response'));
    });
    socket.once('error', (error) => {
      if (!refused) reject(error);
    });
  });
  return { socket, messages };
}
export async function waitUntil(check: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Condition deadline exceeded');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
