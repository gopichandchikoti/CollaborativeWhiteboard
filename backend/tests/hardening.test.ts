import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { request as httpRequest } from 'node:http';
import { gzipSync } from 'node:zlib';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { createApplication } from '../src/main';
import { Storage } from '../src/storage';
import { Auth, digest } from '../src/auth';
import { Boards } from '../src/boards';
import { SharingService } from '../src/sharing.service';
import { Board, User, Workspace } from '../src/contracts';
import { CollaborationGateway } from '../src/collaboration/collaboration.gateway';
import { localRequestAllowed } from '../src/request-policy';
import { connect, item, origin, packet, waitUntil } from './helpers';

let app: INestApplication;
let base = '';
let cookie = '';
let user: User;
let board: Board;
const credentials = { name: 'Hardening', email: 'hardening@example.test', password: 'Synthetic-long-password' };
async function call(path: string, method = 'GET', body?: unknown) {
  return fetch(`${base}/${path}`, {
    method,
    headers: { cookie, origin, 'content-type': 'application/json', 'x-whiteboard-request': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
beforeAll(async () => {
  process.env.WHITEBOARD_DB = ':memory:';
  app = await createApplication();
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  const response = await call('auth/register', 'POST', credentials);
  expect(response.status).toBe(201);
  cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  user = (await response.json()) as User;
  const workspaces = (await (await call('workspaces')).json()) as Workspace[];
  board = (await (await call('boards', 'POST', { workspaceId: workspaces[0].id, title: 'Hardening' })).json()) as Board;
});
afterAll(async () => {
  await app.close();
  delete process.env.WHITEBOARD_DB;
});

it('rejects hostile authorities, origins and cross-site metadata on reads and upgrades', async () => {
  for (const host of ['', 'evil.test:5604', 'localhost.evil.test', 'localhost:65536', '127.0.0.1:0', 'LOCALHOST'])
    expect(localRequestAllowed({ host })).toBe(false);
  expect(localRequestAllowed({ host: 'localhost' })).toBe(true);
  expect(localRequestAllowed({})).toBe(false);
  expect(localRequestAllowed({ host: '127.0.0.1:65535' })).toBe(true);
  expect(localRequestAllowed({ host: 'localhost', origin: 'null' })).toBe(false);
  expect(localRequestAllowed({ host: 'localhost', 'sec-fetch-site': 'cross-site' })).toBe(false);
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(`${base}/boards`, { headers: { host: 'evil.test', cookie } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('error', reject);
    request.end();
  });
  expect(status).toBe(403);
  const response = await fetch(`${base}/boards`, { headers: { cookie, origin: 'http://hostile.test' } });
  expect(response.status).toBe(403);
  const socket = new WebSocket(`${base.replace('http:', 'ws:')}/collaboration?board=${board.id}`, {
    headers: { cookie, origin, host: 'evil.test' },
  });
  const rejected = new Promise<number | undefined>((resolve, reject) => {
    socket.on('unexpected-response', (_request, response) => {
      response.resume();
      resolve(response.statusCode);
      socket.terminate();
    });
    socket.on('open', () => reject(new Error('Hostile upgrade admitted')));
    socket.on('error', () => undefined);
  });
  expect(await rejected).toBe(403);
});

it('returns sanitized 400/413/415 before controllers for malformed, oversized and compressed bodies', async () => {
  const headers = { cookie, origin, 'content-type': 'application/json', 'x-whiteboard-request': '1' };
  const malformed = await fetch(`${base}/boards`, { method: 'POST', headers, body: '{private-input' });
  expect(malformed.status).toBe(400);
  expect(await malformed.json()).toMatchObject({ code: 'invalidInput', requestId: expect.any(String) });
  const oversized = await call('boards', 'POST', { privateInput: 'x'.repeat(16384) });
  expect(oversized.status).toBe(413);
  expect(await oversized.json()).toMatchObject({ code: 'limitReached', requestId: expect.any(String) });
  const compressed = await fetch(`${base}/boards`, {
    method: 'POST',
    headers: { ...headers, 'content-encoding': 'gzip' },
    body: gzipSync('{}'),
  });
  expect(compressed.status).toBe(415);
  const charset = await fetch(`${base}/boards`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json; charset=unsupported' },
    body: '{}',
  });
  expect(charset.status).toBe(415);
});

it('keeps healthy peers alive across repeated authorization checks and closes logout sockets immediately', async () => {
  const response = await call('auth/login', 'POST', credentials);
  const session = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  const peer = await connect(base, board.id, session);
  const gateway = app.get(CollaborationGateway);
  gateway.revalidate();
  gateway.revalidate();
  expect(peer.socket.readyState).toBe(WebSocket.OPEN);
  await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: { cookie: session, origin, 'x-whiteboard-request': '1' },
  });
  await waitUntil(() => peer.socket.readyState === WebSocket.CLOSED);
});

it('rechecks silent recipients before sending private broadcasts after session expiry', async () => {
  const response = await call('auth/login', 'POST', credentials);
  const session = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  const expired = await connect(base, board.id, session);
  await waitUntil(() => expired.messages.some((message) => message.type === 'sync'));
  const count = expired.messages.length;
  app.get(Storage).run('UPDATE sessions SET expires=0 WHERE hash=?', digest(session.split('=')[1]));
  const active = await connect(base, board.id, cookie);
  await waitUntil(() => expired.socket.readyState === WebSocket.CLOSED);
  expect(expired.messages).toHaveLength(count);
  active.socket.close();
  await waitUntil(() => active.socket.readyState === WebSocket.CLOSED);
});

it('bounds live sessions per account and preserves the newest session', async () => {
  const auth = app.get(Auth);
  const tokens: string[] = [];
  for (let index = 0; index < 11; index++) tokens.push((await auth.login(credentials)).token);
  const store = app.get(Storage);
  expect(store.get<{ count: number }>('SELECT COUNT(*) AS count FROM sessions WHERE userId=?', user.id)?.count).toBe(
    10,
  );
  expect(store.get('SELECT hash FROM sessions WHERE hash=?', digest(tokens[0]))).toBeUndefined();
  expect(store.get('SELECT hash FROM sessions WHERE hash=?', digest(tokens[10]))).toBeTruthy();
  cookie = `whiteboard_session=${tokens[10]}`;
});

it('loads the restored generation immediately while older sockets are still closing', async () => {
  const store = app.get(Storage);
  const oldPeer = await connect(base, board.id, cookie);
  const doc = new Y.Doc();
  const note = item();
  doc.getMap('items').set(note.id, note);
  oldPeer.socket.send(packet(doc));
  await waitUntil(() => oldPeer.messages.some((message) => message.type === 'ack'));
  const delayed: (() => void)[] = [];
  const originalClose = WebSocket.prototype.close;
  const closing = vi.spyOn(WebSocket.prototype, 'close').mockImplementation(function (this: WebSocket, code, reason) {
    if (code === 4004) delayed.push(() => originalClose.call(this, code, reason));
    else originalClose.call(this, code, reason);
  });
  let nextPeer: Awaited<ReturnType<typeof connect>> | undefined;
  try {
    store.run('UPDATE boards SET snapshot=?,generation=1 WHERE id=?', new Uint8Array([0, 0]), board.id);
    app.get(CollaborationGateway).closeBoard(board.id);
    oldPeer.socket.send(packet(doc, 2, 1));
    await waitUntil(() => oldPeer.messages.some((message) => message.type === 'error'));
    nextPeer = await connect(base, board.id, cookie);
    const peer = nextPeer;
    await waitUntil(() => peer.messages.some((message) => message.type === 'sync'));
    const sync = peer.messages.find((message) => message.type === 'sync');
    const restored = new Y.Doc();
    Y.applyUpdate(restored, Buffer.from(sync?.data ?? '', 'base64'));
    expect(restored.getMap('items').size).toBe(0);
    expect(sync?.generation).toBe(1);
    delayed.forEach((close) => close());
    await waitUntil(() => oldPeer.socket.readyState === WebSocket.CLOSED);
    restored.getMap('items').set(note.id, note);
    peer.socket.send(packet(restored, 3, 1));
    await waitUntil(() => peer.messages.some((message) => message.type === 'ack' && message.id === 3));
    restored.destroy();
  } finally {
    closing.mockRestore();
    oldPeer.socket.terminate();
    nextPeer?.socket.terminate();
    doc.destroy();
  }
});

it('bounds pending invitations and membership without consuming a refused invitation', async () => {
  const store = app.get(Storage);
  const candidate = await app.get(Auth).register({ ...credentials, email: 'candidate@example.test' });
  const candidateCookie = `whiteboard_session=${candidate.token}`;
  store.transaction(() => {
    for (let index = 0; index < 100; index++) {
      const id = crypto.randomUUID();
      store.run('INSERT INTO users VALUES(?,?,?,?)', id, `${id}@example.test`, 'Synthetic member', 'unused-hash');
      store.run('INSERT INTO access VALUES(?,?,?)', board.id, id, 'viewer');
      store.run('INSERT INTO invites VALUES(?,?,?,?)', `fixture-${index}`, board.id, 'viewer', Date.now() + 60000);
    }
  });
  expect((await call(`boards/${board.id}/invites`, 'POST', { role: 'viewer' })).status).toBe(400);
  store.run('UPDATE invites SET expires=0 WHERE hash=?', 'fixture-0');
  const response = await call(`boards/${board.id}/invites`, 'POST', { role: 'viewer' });
  expect(response.status).toBe(201);
  const invitation = (await response.json()) as { token: string };
  const accept = () =>
    fetch(`${base}/invites/accept`, {
      method: 'POST',
      headers: { cookie: candidateCookie, origin, 'content-type': 'application/json', 'x-whiteboard-request': '1' },
      body: JSON.stringify(invitation),
    });
  expect((await accept()).status).toBe(400);
  expect(store.get('SELECT hash FROM invites WHERE hash=?', digest(invitation.token))).toBeTruthy();
  store.run(
    'DELETE FROM access WHERE boardId=? AND userId=(SELECT userId FROM access WHERE boardId=? LIMIT 1)',
    board.id,
    board.id,
  );
  expect((await accept()).status).toBe(201);
  store.run('DELETE FROM invites WHERE boardId=?', board.id);
  const next = await call(`boards/${board.id}/invites`, 'POST', { role: 'editor' });
  const updated = await fetch(`${base}/invites/accept`, {
    method: 'POST',
    headers: { cookie: candidateCookie, origin, 'content-type': 'application/json', 'x-whiteboard-request': '1' },
    body: JSON.stringify(await next.json()),
  });
  expect(updated.status).toBe(201);
});

it('rejects binary application messages and invalid WebSocket framing without crashing HTTP', async () => {
  const binary = await connect(base, board.id, cookie);
  binary.socket.send(JSON.stringify({ type: 'presence', x: 1, y: 2 }), { binary: true });
  await waitUntil(() => binary.socket.readyState === WebSocket.CLOSED);
  expect(binary.messages.some((message) => message.type === 'error')).toBe(true);
  const invalidFrame = await connect(base, board.id, cookie);
  invalidFrame.socket.send('{}', { mask: false });
  await waitUntil(() => invalidFrame.socket.readyState === WebSocket.CLOSED);
  expect((await call('health')).status).toBe(200);
});

it('rejects dangling legacy invitations and rolls back permission changes when audit persistence fails', () => {
  const store = app.get(Storage);
  const sharing = app.get(SharingService);
  const token = 'f'.repeat(64);
  store.db.exec('PRAGMA foreign_keys=OFF');
  store.run('INSERT INTO invites VALUES(?,?,?,?)', digest(token), crypto.randomUUID(), 'viewer', Date.now() + 10000);
  store.db.exec('PRAGMA foreign_keys=ON');
  expect(() => sharing.accept(user.id, { token })).toThrow('inviteExpired');
  const member = store.get<{ userId: string; role: string }>(
    'SELECT userId,role FROM access WHERE boardId=? LIMIT 1',
    board.id,
  );
  expect(member).toBeTruthy();
  if (!member) throw new Error('Missing fixture member');
  const audit = vi.spyOn(app.get(Boards), 'audit').mockImplementation(() => {
    throw new Error('Synthetic storage failure');
  });
  try {
    expect(() => sharing.role(user.id, board.id, member.userId, { role: 'commenter' })).toThrow(
      'Synthetic storage failure',
    );
    expect(store.get('SELECT role FROM access WHERE boardId=? AND userId=?', board.id, member.userId)).toEqual({
      role: member.role,
    });
    expect(() => sharing.revoke(user.id, board.id, member.userId)).toThrow('Synthetic storage failure');
    expect(store.get('SELECT role FROM access WHERE boardId=? AND userId=?', board.id, member.userId)).toEqual({
      role: member.role,
    });
  } finally {
    audit.mockRestore();
  }
});

it('handles occupied listening ports through a catchable failure and releases the failed application', async () => {
  const collision = await createApplication();
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    await expect(collision.listen(Number(new URL(base).port), '127.0.0.1')).rejects.toMatchObject({
      code: 'EADDRINUSE',
    });
    expect(log).toHaveBeenCalledWith(JSON.stringify({ event: 'collaborationServerFailed' }));
  } finally {
    await collision.close();
    log.mockRestore();
  }
  expect((await call('health')).status).toBe(200);
});
