import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { BoardConnection } from '../src/lib/collaboration';
import { clearDrafts, readDraft, writeDraft } from '../src/lib/offline';
it('does not label pending offline content saved when editing permission is downgraded during reconnect', async () => {
  const value = connection();
  await value.start();
  value.set(note);
  sockets[0].receive({ type: 'sync', data: encode(new Y.Doc()), role: 'viewer', generation: 0 });
  expect(value.snapshot().role).toBe('viewer');
  expect(value.snapshot().status).toBe('restored');
  expect(sockets[0].sent.some((message) => message.type === 'update')).toBe(false);
});
it('discards a rejected device draft explicitly and cannot resurrect it during teardown', async () => {
  const value = connection();
  await value.start();
  sockets[0].receive({ type: 'sync', data: encode(new Y.Doc()), role: 'owner', generation: 0 });
  value.set(note);
  await writeDraft({ key: 'account:board', data: Y.encodeStateAsUpdate(value.doc), generation: 0 });
  sockets[0].receive({ type: 'error', code: 'updateRejected' });
  await value.discardDraft();
  value.stop();
  connections.pop();
  expect(await readDraft('account:board')).toBeUndefined();
});
it('assigns new layers, preserves edits and orders legacy records with missing layers', async () => {
  const value = connection();
  await value.start();
  sockets[0].receive({ type: 'sync', data: encode(new Y.Doc()), role: 'owner', generation: 0 });
  value.set({ ...note, id: 'explicit', zIndex: 3 });
  value.set(note);
  expect(value.items.get(note.id)?.zIndex).toBe(4);
  value.set({ ...note, text: 'Edited' });
  expect(value.items.get(note.id)?.zIndex).toBe(4);
  value.doc.transact(() => value.items.set('legacy', { ...note, id: 'legacy' }), 'remote');
  value.set({ ...note, id: 'legacy' });
  expect(value.items.get('legacy')?.zIndex).toBe(5);
  value.add([{ ...note, id: 'new-template' }]);
  expect(value.items.get('new-template')?.zIndex).toBe(6);
});
const sockets: Socket[] = [];
class Socket {
  static OPEN = 1;
  readyState = 1;
  sent: Record<string, unknown>[] = [];
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  constructor(readonly url: string) {
    sockets.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  receive(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}
const encode = (doc: Y.Doc) => btoa(String.fromCharCode(...Y.encodeStateAsUpdate(doc)));
const note = { id: 'note', type: 'sticky' as const, x: 0, y: 0, width: 100, height: 100, color: '#24332e' };
let connections: BoardConnection[] = [];
function connection(role: 'owner' | 'viewer' = 'owner') {
  const value = new BoardConnection('board', 'account', role);
  connections.push(value);
  return value;
}
beforeEach(async () => {
  sockets.length = 0;
  await clearDrafts('account:');
  vi.stubGlobal('WebSocket', Socket);
});
afterEach(() => {
  connections.forEach((value) => value.stop());
  connections = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('hydrates, saves, acknowledges, tracks presence and keeps undo local', async () => {
  const value = connection();
  const changed = vi.fn();
  const unsubscribe = value.subscribe(changed);
  await value.start();
  const socket = sockets[0];
  socket.receive({ type: 'sync', data: encode(new Y.Doc()), role: 'owner', generation: 0 });
  expect(value.snapshot().status).toBe('saved');
  value.set(note);
  expect(value.snapshot().status).toBe('saving');
  expect(value.snapshot().canUndo).toBe(true);
  socket.receive({ type: 'ack', id: 1 });
  expect(value.snapshot().status).toBe('saved');
  value.add([{ ...note, id: 'second', zIndex: -1 }]);
  expect(value.snapshot().items[0].id).toBe('second');
  value.remove('second');
  value.undo.undo();
  value.undo.redo();
  value.presence({ x: 20, y: 30 });
  value.presence({ x: 21, y: 31 });
  expect(socket.sent.filter((packet) => packet.type === 'presence')).toHaveLength(1);
  socket.receive({ type: 'presence', peers: [{ id: 'p', userId: 'other', name: 'Other', cursor: null }] });
  expect(value.snapshot().peers).toHaveLength(1);
  const remote = new Y.Doc();
  remote.getMap('items').set('remote', { ...note, id: 'remote' });
  socket.receive({ type: 'update', data: encode(remote) });
  expect(value.snapshot().items.some((item) => item.id === 'remote')).toBe(true);
  socket.receive({ type: 'ack', id: 0 });
  expect(value.snapshot().status).toBe('saving');
  expect(changed).toHaveBeenCalled();
  unsubscribe();
});
it('reconciles durable device drafts after offline editing and refuses stale restored generations', async () => {
  const doc = new Y.Doc();
  doc.getMap('items').set(note.id, note);
  await writeDraft({ key: 'account:board', data: Y.encodeStateAsUpdate(doc), generation: 0 });
  const value = connection();
  await value.start();
  sockets[0].receive({ type: 'sync', data: encode(new Y.Doc()), role: 'owner', generation: 0 });
  expect(sockets[0].sent[0].type).toBe('update');
  vi.useFakeTimers();
  sockets[0].onerror?.();
  sockets[0].close();
  expect(value.snapshot().status).toBe('offline');
  value.set({ ...note, text: 'Kept offline' });
  await vi.advanceTimersByTimeAsync(2000);
  expect(sockets).toHaveLength(2);
  sockets[1].receive({ type: 'sync', data: encode(new Y.Doc()), role: 'owner', generation: 1 });
  expect(value.snapshot().status).toBe('restored');
  const count = value.snapshot().items.length;
  value.add([{ ...note, id: 'blocked' }]);
  value.remove('note');
  value.set(note);
  expect(value.snapshot().items).toHaveLength(count);
});
it.each([4002, 4003, 4004])('stops automatic retries for terminal close %s', async (code) => {
  const value = connection();
  await value.start();
  sockets[0].close(code);
  expect(['error', 'denied', 'restored']).toContain(value.snapshot().status);
});
it('does not write through viewer roles and surfaces invalid server packets', async () => {
  const value = connection('viewer');
  await value.start();
  sockets[0].receive({ type: 'sync', data: encode(new Y.Doc()), role: 'viewer', generation: 0 });
  value.set(note);
  value.add([note]);
  value.remove(note.id);
  expect(value.snapshot().items).toHaveLength(0);
  sockets[0].receive({ type: 'error', code: 'updateRejected' });
  expect(value.snapshot().status).toBe('error');
  sockets[0].receive({ type: 'unknown' });
  expect(value.snapshot().status).toBe('error');
});
it('reports unavailable backup storage and tolerates stopping before hydration finishes', async () => {
  vi.stubGlobal('indexedDB', {
    open() {
      throw new Error('denied');
    },
  });
  const value = connection();
  await value.start();
  sockets[0].close();
  expect(value.snapshot().status).toBe('cacheError');
  const stopped = connection();
  const start = stopped.start();
  stopped.stop();
  connections.pop();
  await start;
});
it('reports failed durable backup writes without allowing edits after a terminal access change', async () => {
  const value = connection();
  await value.start();
  sockets[0].receive({ type: 'sync', data: encode(new Y.Doc()), role: 'owner', generation: 0 });
  vi.stubGlobal('indexedDB', {
    open() {
      throw new Error('denied');
    },
  });
  vi.useFakeTimers();
  value.set(note);
  await vi.advanceTimersByTimeAsync(200);
  expect(value.snapshot().status).toBe('cacheError');
  sockets[0].close(4004);
  await vi.advanceTimersByTimeAsync(200);
  expect(value.snapshot().status).toBe('restored');
  const count = value.snapshot().items.length;
  value.set({ ...note, id: 'not-allowed' });
  expect(value.snapshot().items).toHaveLength(count);
});
