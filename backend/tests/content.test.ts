import { afterAll, beforeAll, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { createApplication } from '../src/main';
import { Board, User, Workspace } from '../src/contracts';
import { Storage } from '../src/storage';
import { PNG } from 'pngjs';
import * as Y from 'yjs';
import { connect, item, origin, packet, waitUntil } from './helpers';

let app: INestApplication;
let base = '';
let owner = '';
let viewer = '';
let user: User;
let board: Board;
function pngFixture() {
  const image = new PNG({ width: 1, height: 1 });
  image.data.fill(255);
  return PNG.sync.write(image);
}
async function call(path: string, method = 'GET', body?: unknown, cookie = owner) {
  return fetch(`${base}/${path}`, {
    method,
    headers: {
      cookie,
      origin,
      'X-Whiteboard-Request': '1',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function json<T>(response: Response) {
  return (await response.json()) as T;
}
beforeAll(async () => {
  process.env.WHITEBOARD_DB = ':memory:';
  app = await createApplication();
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  for (const name of ['ContentOwner', 'ContentViewer']) {
    const response = await call(
      'auth/register',
      'POST',
      {
        name,
        email: `${name}@example.test`,
        password: 'Long-synthetic-password',
      },
      '',
    );
    const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
    if (name === 'ContentOwner') owner = cookie;
    else {
      viewer = cookie;
      user = await json<User>(response);
    }
  }
  const workspace = (await json<Workspace[]>(await call('workspaces')))[0];
  board = await json<Board>(
    await call('boards', 'POST', {
      title: 'Content',
      workspaceId: workspace.id,
    }),
  );
  const invite = await (await call(`boards/${board.id}/invites`, 'POST', { role: 'viewer' })).json();
  await call('invites/accept', 'POST', invite, viewer);
});
afterAll(async () => {
  await app.close();
  delete process.env.WHITEBOARD_DB;
});

it('protects private raster uploads and validates signatures and bounds', async () => {
  const path = `boards/${board.id}/assets`;
  const png = pngFixture();
  expect((await call(path, 'POST', { data: png.toString('base64') }, viewer)).status).toBe(403);
  expect((await call(path, 'POST', { data: 'javascript' })).status).toBe(400);
  const result = await json<{ assetId: string }>(await call(path, 'POST', { data: png.toString('base64') }));
  const image = await call(`${path}/${result.assetId}`, 'GET', undefined, viewer);
  expect(image.status).toBe(200);
  expect(image.headers.get('content-type')).toContain('image/png');
  expect(Buffer.from(await image.arrayBuffer())).toEqual(png);
  expect((await call(`${path}/${result.assetId}`, 'GET', undefined, '')).status).toBe(401);
  expect((await call(`${path}/missing`)).status).toBe(400);
  const variants = [Buffer.alloc(20), Buffer.alloc(45), Buffer.from(png), Buffer.from(png), Buffer.from(png)];
  variants[2].write('WRNG', 12);
  variants[3].writeUInt32BE(5000, 16);
  variants[4].write('FAIL', png.length - 8);
  const invalidCrc = Buffer.from(png);
  invalidCrc[29] ^= 0xff;
  variants.push(invalidCrc);
  for (const bytes of variants) expect((await call(path, 'POST', { data: bytes.toString('base64') })).status).toBe(400);
});
it('allows commenters to post and editors to resolve, while viewers cannot mutate comments', async () => {
  const path = `boards/${board.id}/comments`;
  expect(await (await call(path)).json()).toEqual([]);
  expect((await call(path, 'POST', { text: 'Not allowed' }, viewer)).status).toBe(403);
  await call(`boards/${board.id}/members/${user.id}`, 'POST', {
    role: 'commenter',
  });
  expect((await call(path, 'POST', { text: 'A useful comment' }, viewer)).status).toBe(201);
  const comments = await json<{ id: string; resolved: number }[]>(await call(path));
  expect((await call(`${path}/${comments[0].id}`, 'DELETE', undefined, viewer)).status).toBe(403);
  expect((await call(`${path}/${comments[0].id}`, 'DELETE')).status).toBe(200);
  expect((await json<{ resolved: number }[]>(await call(path)))[0].resolved).toBe(1);
  expect((await call(path, 'POST', { text: '  ' })).status).toBe(400);
});
it('saves bounded checkpoints, exports canonical saved content and restores with a new generation', async () => {
  const path = `boards/${board.id}`;
  expect(await (await call(`${path}/history`)).json()).toEqual([]);
  await call(`${path}/history`, 'POST', { title: 'Empty' });
  const peer = await connect(base, board.id, owner);
  const doc = new Y.Doc();
  const note = item();
  doc.getMap('items').set(note.id, note);
  peer.socket.send(packet(doc));
  await waitUntil(() => peer.messages.some((message) => message.type === 'ack'));
  expect((await json<{ items: unknown[] }>(await call(`${path}/export`, 'POST'))).items).toHaveLength(1);
  expect((await call(`${path}/export`, 'POST', undefined, '')).status).toBe(401);
  expect((await call(`${path}/history`, 'POST', { title: 'No' }, viewer)).status).toBe(403);
  const snapshots = await json<{ id: string }[]>(await call(`${path}/history`));
  expect((await call(`${path}/history/missing/restore`, 'POST')).status).toBe(400);
  expect((await call(`${path}/history/${snapshots[0].id}/restore`, 'POST', undefined, viewer)).status).toBe(403);
  expect((await call(`${path}/history/${snapshots[0].id}/restore`, 'POST')).status).toBe(201);
  await waitUntil(() => peer.socket.readyState === 3);
  expect((await json<{ items: unknown[] }>(await call(`${path}/export`, 'POST'))).items).toEqual([]);
  for (let index = 0; index < 22; index++) await call(`${path}/history`, 'POST', { title: `Checkpoint ${index}` });
  expect((await json<unknown[]>(await call(`${path}/history`))).length).toBe(20);
  expect(
    app.get(Storage).get<{ generation: number }>('SELECT generation FROM boards WHERE id=?', board.id)?.generation,
  ).toBe(1);
});
it('compacts saved documents without losing objects and rejects non-owner compaction', async () => {
  const workspace = (await json<Workspace[]>(await call('workspaces')))[0];
  const empty = await json<Board>(await call('boards', 'POST', { title: 'Compact', workspaceId: workspace.id }));
  expect((await call(`boards/${empty.id}/compact`, 'POST')).status).toBe(201);
  expect((await call(`boards/${board.id}/compact`, 'POST', undefined, viewer)).status).toBe(403);
  const peer = await connect(base, board.id, owner);
  const doc = new Y.Doc();
  const note = item();
  doc.getMap('items').set(note.id, note);
  peer.socket.send(packet(doc, 1, 1));
  await waitUntil(() => peer.messages.some((message) => message.type === 'ack'));
  expect((await call(`boards/${board.id}/compact`, 'POST')).status).toBe(201);
  await waitUntil(() => peer.socket.readyState === 3);
  const result = await json<{ items: unknown[] }>(await call(`boards/${board.id}/export`, 'POST'));
  expect(result.items).toEqual([note]);
});
it('bounds assets, comments, workspaces and boards on the server', async () => {
  const store = app.get(Storage);
  const ownerUser = await json<User>(await call('auth/me'));
  const workspace = (await json<Workspace[]>(await call('workspaces')))[0];
  store.transaction(() => {
    for (let index = 0; index < 100; index++) {
      store.run('INSERT INTO assets VALUES(?,?,?,?)', crypto.randomUUID(), board.id, 'image/png', new Uint8Array());
      store.run('INSERT INTO workspaces VALUES(?,?,?)', crypto.randomUUID(), 'Bounded', ownerUser.id);
    }
    for (let index = 0; index < 200; index++)
      store.run(
        'INSERT INTO comments VALUES(?,?,?,?,?,0)',
        crypto.randomUUID(),
        board.id,
        ownerUser.id,
        'Bounded',
        new Date().toISOString(),
      );
    for (let index = 0; index < 500; index++)
      store.run(
        'INSERT INTO boards(id,workspaceId,ownerId,title,updatedAt) VALUES(?,?,?,?,?)',
        crypto.randomUUID(),
        workspace.id,
        ownerUser.id,
        'Bounded',
        new Date().toISOString(),
      );
  });
  const png = pngFixture().toString('base64');
  expect((await call(`boards/${board.id}/assets`, 'POST', { data: png })).status).toBe(400);
  expect((await call(`boards/${board.id}/comments`, 'POST', { text: 'Overflow' })).status).toBe(400);
  expect((await call('workspaces', 'POST', { title: 'Overflow' })).status).toBe(400);
  expect(
    (
      await call('boards', 'POST', {
        title: 'Overflow',
        workspaceId: workspace.id,
      })
    ).status,
  ).toBe(400);
});
