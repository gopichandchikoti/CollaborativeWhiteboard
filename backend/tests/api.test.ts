import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Y from 'yjs';
import { createApplication } from '../src/main';
import { Board, User, Workspace } from '../src/contracts';
import { Boards } from '../src/boards';
import { Storage } from '../src/storage';
import { CollaborationGateway } from '../src/collaboration/collaboration.gateway';
import { connect, item, origin, packet, waitUntil } from './helpers';

let app: INestApplication;
let base = '';
let owner = '';
let editor = '';
let stranger = '';
let workspace: Workspace;
let editorUser: User;
async function request(path: string, cookie = owner, method = 'GET', body?: unknown, customOrigin = origin) {
  return fetch(`${base}/${path}`, {
    method,
    headers: {
      cookie,
      origin: customOrigin,
      'Content-Type': 'application/json',
      'X-Whiteboard-Request': '1',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function json<T>(response: Response) {
  return (await response.json()) as T;
}
async function createBoard() {
  const response = await request('boards', owner, 'POST', {
    title: 'Integration board',
    workspaceId: workspace.id,
  });
  expect(response.status).toBe(201);
  return json<Board>(response);
}
async function share(boardId: string, role = 'editor') {
  const invite = await json<{ token: string }>(await request(`boards/${boardId}/invites`, owner, 'POST', { role }));
  const response = await request('invites/accept', editor, 'POST', invite);
  expect(response.status).toBe(201);
  return invite;
}
beforeAll(async () => {
  process.env.WHITEBOARD_DB = join(mkdtempSync(join(tmpdir(), 'whiteboard-api-')), 'test.sqlite');
  app = await createApplication();
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  for (const name of ['Owner', 'Editor', 'Stranger']) {
    const response = await request('auth/register', '', 'POST', {
      name,
      email: `${name}@example.test`,
      password: 'Synthetic-test-password-123',
    });
    expect(response.status).toBe(201);
    const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
    if (name === 'Owner') owner = cookie;
    if (name === 'Editor') {
      editor = cookie;
      editorUser = await json<User>(response);
    }
    if (name === 'Stranger') stranger = cookie;
  }
  workspace = (await json<Workspace[]>(await request('workspaces')))[0];
});
afterAll(async () => {
  await app.close();
  delete process.env.WHITEBOARD_DB;
});

describe('identity and HTTP boundaries', () => {
  it('rejects ambiguous or malformed session cookies on HTTP and WebSocket connections', async () => {
    const token = owner.split('=')[1];
    for (const cookie of [
      `${owner}; ${owner}`,
      `whiteboard_session=bad; ${owner}`,
      `whiteboard_session=${token}bad`,
      `${owner}; whiteboard_session =bad`,
      `${owner}; whiteboard_session`,
    ]) {
      expect((await request('auth/me', cookie)).status).toBe(401);
    }
    expect((await fetch(`${base}/auth/me`)).status).toBe(401);
    const board = await createBoard();
    const peer = await connect(base, board.id, `${owner}; ${owner}`);
    await waitUntil(() => peer.socket.readyState === 3);
    expect(peer.messages.some((message) => message.type === 'sync')).toBe(false);
  });
  it('requires authentication and rejects forged origins', async () => {
    expect((await request('boards', '')).status).toBe(401);
    expect((await request('boards', owner, 'POST', {}, 'http://untrusted.test')).status).toBe(403);
    const response = await fetch(`${base}/boards`, {
      method: 'POST',
      headers: { cookie: owner, origin },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });
  it('validates enrollment, duplicate accounts and login without exposing hashes', async () => {
    expect((await request('auth/register', '', 'POST', {})).status).toBe(400);
    expect(
      (
        await request('auth/register', '', 'POST', {
          name: 'Other',
          email: 'owner@example.test',
          password: 'Synthetic-test-password-123',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request('auth/login', '', 'POST', {
          email: 'nobody@example.test',
          password: 'Synthetic-test-password-123',
        })
      ).status,
    ).toBe(401);
    expect((await request('auth/login', '', 'POST', {})).status).toBe(401);
    const response = await request('auth/login', '', 'POST', {
      email: 'OWNER@example.test',
      password: 'Synthetic-test-password-123',
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(await response.json()).not.toHaveProperty('hash');
    expect((await request('auth/me')).status).toBe(200);
  });
  it('revokes a session on logout', async () => {
    const response = await request('auth/login', '', 'POST', {
      email: 'stranger@example.test',
      password: 'Synthetic-test-password-123',
    });
    const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect((await request('auth/logout', cookie, 'POST')).status).toBe(201);
    expect((await request('auth/me', cookie)).status).toBe(401);
  });
  it('serves health and sanitized failures', async () => {
    expect((await request('health', '')).status).toBe(200);
    expect(
      (
        await request('boards', owner, 'POST', {
          title: '',
          workspaceId: workspace.id,
        })
      ).status,
    ).toBe(400);
  });
});
describe('workspace and board resources', () => {
  it('creates, renames and deletes only owned workspaces', async () => {
    const created = await json<Workspace>(await request('workspaces', owner, 'POST', { title: 'Second workspace' }));
    expect(
      (
        await request(`workspaces/${created.id}`, stranger, 'PATCH', {
          title: 'Forbidden',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`workspaces/${created.id}`, owner, 'PATCH', {
          title: 'Renamed',
        })
      ).status,
    ).toBe(200);
    expect((await request(`workspaces/${created.id}`, owner, 'DELETE')).status).toBe(200);
  });
  it('enforces private board reads, updates, deletion and workspace ownership', async () => {
    const board = await createBoard();
    expect((await json<Board[]>(await request('boards'))).some((value) => value.id === board.id)).toBe(true);
    expect((await json<Board[]>(await request('boards', stranger))).some((value) => value.id === board.id)).toBe(false);
    expect((await request(`boards/${board.id}`, stranger)).status).toBe(404);
    expect(
      (
        await request('boards', stranger, 'POST', {
          title: 'Invalid',
          workspaceId: workspace.id,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`boards/${board.id}`, owner, 'PATCH', {
          title: 'Renamed board',
        })
      ).status,
    ).toBe(200);
    expect((await json<Board>(await request(`boards/${board.id}`))).title).toBe('Renamed board');
    expect((await request(`boards/${board.id}`, stranger, 'DELETE')).status).toBe(404);
    expect((await request(`boards/${board.id}`, owner, 'DELETE')).status).toBe(200);
    expect((await request(`boards/${board.id}`)).status).toBe(404);
  });
});
describe('sharing and isolation', () => {
  it('creates one-use invites, restricts owner actions, changes roles and revokes access', async () => {
    const board = await createBoard();
    const invite = await share(board.id);
    expect((await request('invites/accept', editor, 'POST', invite)).status).toBe(400);
    expect((await request(`boards/${board.id}/members`, editor)).status).toBe(403);
    expect((await request(`boards/${board.id}/members`)).status).toBe(200);
    expect((await request(`boards/${board.id}`, editor, 'PATCH', { title: 'No' })).status).toBe(403);
    expect(
      (await request(`boards/${board.id}/members/${editorUser.id}`, owner, 'POST', { role: 'viewer' })).status,
    ).toBe(201);
    expect((await json<Board>(await request(`boards/${board.id}`, editor))).role).toBe('viewer');
    expect((await request(`boards/${board.id}/members/${editorUser.id}`, owner, 'DELETE')).status).toBe(200);
    expect((await request(`boards/${board.id}`, editor)).status).toBe(404);
  });
  it('rejects expired invitations and owner self-acceptance', async () => {
    const board = await createBoard();
    const invite = await json<{ token: string }>(
      await request(`boards/${board.id}/invites`, owner, 'POST', {
        role: 'viewer',
      }),
    );
    expect((await request('invites/accept', owner, 'POST', invite)).status).toBe(400);
    app.get(Storage).run('UPDATE invites SET expires=0');
    expect((await request('invites/accept', editor, 'POST', invite)).status).toBe(400);
  });
});
describe('durable realtime document', () => {
  it('reclaims peers that stop answering protocol heartbeats', async () => {
    const board = await createBoard();
    const quiet = await connect(base, board.id, owner, { autoPong: false });
    const ping = new Promise<void>((resolve) => quiet.socket.once('ping', () => resolve()));
    const gateway = app.get(CollaborationGateway);
    gateway.heartbeat();
    await ping;
    gateway.heartbeat();
    await waitUntil(() => quiet.socket.readyState === 3);
  });
  it('bounds total collaboration connections across rooms', async () => {
    const peers: Awaited<ReturnType<typeof connect>>[] = [];
    const boards = await Promise.all(Array.from({ length: 5 }, () => createBoard()));
    try {
      for (let count = 0; count < 128; count++) {
        const peer = await connect(base, boards[Math.floor(count / 30)].id, owner);
        peers.push(peer);
        await waitUntil(() => peer.messages.some((message) => message.type === 'sync'));
        if (count === 29) {
          const roomExcess = await connect(base, boards[0].id, owner);
          await waitUntil(() => roomExcess.socket.readyState === 3);
          expect(roomExcess.messages.some((message) => message.type === 'sync')).toBe(false);
        }
      }
      const excess = await connect(base, boards[4].id, owner);
      peers.push(excess);
      await waitUntil(() => excess.socket.readyState === 3);
      expect(excess.messages.some((message) => message.type === 'sync')).toBe(false);
    } finally {
      peers.forEach((peer) => peer.socket.close());
      await waitUntil(() => peers.every((peer) => peer.socket.readyState === 3));
    }
  });
  it('attributes presence to the session, disconnects revoked users, and limits update storms', async () => {
    const board = await createBoard();
    await share(board.id);
    const peer = await connect(base, board.id, editor);
    peer.socket.send(JSON.stringify({ type: 'presence', x: 20, y: 30 }));
    await waitUntil(() => peer.messages.filter((message) => message.type === 'presence').length >= 2);
    expect(JSON.stringify(peer.messages)).toContain('Editor');
    await request(`boards/${board.id}/members/${editorUser.id}`, owner, 'DELETE');
    await waitUntil(() => peer.socket.readyState === 3);
    const storm = await connect(base, board.id, owner);
    for (let index = 0; index < 103; index++) storm.socket.send(JSON.stringify({ type: 'presence', x: index, y: 0 }));
    await waitUntil(() => storm.socket.readyState === 3);
  });
  it('converges across two clients, persists, reconnects, and keeps local undo scoped', async () => {
    const board = await createBoard();
    await share(board.id);
    const first = await connect(base, board.id, owner);
    const second = await connect(base, board.id, editor);
    await waitUntil(
      () =>
        first.messages.some((value) => value.type === 'sync') && second.messages.some((value) => value.type === 'sync'),
    );
    const a = new Y.Doc();
    const b = new Y.Doc();
    const note = item();
    const other = item();
    const undo = new Y.UndoManager(a.getMap('items'), {
      trackedOrigins: new Set(['local']),
    });
    a.transact(() => a.getMap('items').set(note.id, note), 'local');
    first.socket.send(packet(a));
    await waitUntil(() => first.messages.some((value) => value.type === 'ack'));
    const remote = second.messages.find((value) => value.type === 'update');
    expect(remote).toBeTruthy();
    Y.applyUpdate(b, Buffer.from(remote?.data ?? '', 'base64'));
    b.getMap('items').set(other.id, other);
    second.socket.send(packet(b));
    await waitUntil(() => second.messages.some((value) => value.type === 'ack'));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b), 'remote');
    undo.undo();
    expect(a.getMap('items').has(other.id)).toBe(true);
    expect(a.getMap('items').has(note.id)).toBe(false);
    first.socket.send(packet(a, 2));
    await waitUntil(() => first.messages.some((value) => value.type === 'ack' && value.id === 2));
    first.socket.close();
    second.socket.close();
    await waitUntil(() => first.socket.readyState === 3 && second.socket.readyState === 3);
    const next = await connect(base, board.id, owner);
    await waitUntil(() => next.messages.some((value) => value.type === 'sync'));
    const reloaded = new Y.Doc();
    Y.applyUpdate(reloaded, Buffer.from(next.messages[0].data, 'base64'));
    expect([...reloaded.getMap('items').keys()]).toEqual([other.id]);
    next.socket.close();
    expect(app.get(Boards).snapshot(board.id)?.byteLength).toBeGreaterThan(0);
  });
  it('rejects anonymous, foreign-origin and unauthorized sockets', async () => {
    const board = await createBoard();
    for (const [cookie, selectedOrigin] of [
      ['', origin],
      [stranger, origin],
      [owner, 'http://foreign.test'],
    ]) {
      const peer = await connect(base, board.id, cookie, selectedOrigin);
      await waitUntil(() => peer.socket.readyState === 3);
      expect(peer.socket.readyState).toBe(3);
    }
  });
  it('denies viewer writes, invalid objects and stale generations', async () => {
    const board = await createBoard();
    await share(board.id, 'viewer');
    const doc = new Y.Doc();
    const value = item();
    doc.getMap('items').set(value.id, value);
    const viewer = await connect(base, board.id, editor);
    viewer.socket.send(packet(doc));
    await waitUntil(() => viewer.socket.readyState === 3);
    expect(viewer.messages.some((message) => message.type === 'error')).toBe(true);
    const invalid = await connect(base, board.id, owner);
    doc.getMap('items').set('invalid', { type: 'script' });
    invalid.socket.send(packet(doc));
    await waitUntil(() => invalid.socket.readyState === 3);
    const stale = await connect(base, board.id, owner);
    stale.socket.send(packet(new Y.Doc(), 2, 9));
    await waitUntil(() => stale.socket.readyState === 3);
    expect(app.get(Boards).snapshot(board.id)).toBeNull();
  });
});
