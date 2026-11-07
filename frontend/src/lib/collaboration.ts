import * as Y from 'yjs';
import { z } from 'zod';
import { BoardItem, Point } from '../types/board';
import { canEdit, Role, roleSchema } from './contracts';
import { clearDrafts, readDraft, writeDraft } from './offline';
import { compareItems } from './order';

const peerSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  cursor: z.object({ x: z.number(), y: z.number() }).nullable(),
});
const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sync'), data: z.string(), role: roleSchema, generation: z.number().int() }),
  z.object({ type: z.literal('update'), data: z.string() }),
  z.object({ type: z.literal('ack'), id: z.number() }),
  z.object({ type: z.literal('presence'), peers: z.array(peerSchema) }),
  z.object({ type: z.literal('error'), code: z.string() }),
]);
export type Peer = z.infer<typeof peerSchema>;
export type ConnectionStatus =
  'connecting' | 'saved' | 'saving' | 'offline' | 'error' | 'denied' | 'restored' | 'cacheError';
export interface BoardState {
  items: BoardItem[];
  peers: Peer[];
  status: ConnectionStatus;
  role: Role;
  canUndo: boolean;
  canRedo: boolean;
}
function encode(data: Uint8Array) {
  let value = '';
  for (let index = 0; index < data.length; index += 8192)
    value += String.fromCharCode(...data.subarray(index, index + 8192));
  return btoa(value);
}
function decode(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export class BoardConnection {
  readonly doc = new Y.Doc();
  readonly items = this.doc.getMap<BoardItem>('items');
  readonly undo = new Y.UndoManager(this.items, { trackedOrigins: new Set(['local']), captureTimeout: 0 });
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private backupTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private synced = false;
  private generation: number | null = null;
  private sequence = 0;
  private acknowledged = 0;
  private retries = 0;
  private lastPresence = 0;
  private cached = true;
  private terminal = false;
  private discardOnStop = false;
  private readonly listeners = new Set<() => void>();
  private state: BoardState;
  private readonly key: string;
  constructor(
    readonly boardId: string,
    readonly userId: string,
    role: Role,
  ) {
    this.key = `${userId}:${boardId}`;
    this.state = { items: [], peers: [], status: 'connecting', role, canUndo: false, canRedo: false };
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== 'remote') {
        this.sequence++;
        this.send(update);
      }
      this.changed();
      this.backup();
    });
    this.undo.on('stack-item-added', () => this.changed());
    this.undo.on('stack-item-popped', () => this.changed());
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  async start() {
    try {
      const cache = canEdit(this.state.role) ? await readDraft(this.key) : undefined;
      if (this.stopped) return;
      if (cache) {
        this.generation = cache.generation;
        Y.applyUpdate(this.doc, cache.data, 'remote');
        this.sequence++;
      }
    } catch {
      this.cached = false;
    }
    if (!this.stopped) this.connect();
  }
  set(item: BoardItem) {
    if (!canEdit(this.state.role) || this.blocked()) return;
    const current = this.items.get(item.id);
    const zIndex = item.zIndex ?? current?.zIndex ?? this.nextLayer();
    this.doc.transact(() => this.items.set(item.id, { ...item, zIndex }), 'local');
  }
  add(items: BoardItem[]) {
    if (!canEdit(this.state.role) || this.blocked()) return;
    let layer = this.nextLayer();
    this.doc.transact(
      () =>
        items.forEach((item) => {
          this.items.set(item.id, { ...item, zIndex: item.zIndex ?? layer++ });
        }),
      'local',
    );
  }
  remove(id: string) {
    if (!canEdit(this.state.role) || this.blocked()) return;
    this.doc.transact(() => this.items.delete(id), 'local');
  }
  presence(point: Point) {
    if (!this.synced || Date.now() - this.lastPresence < 70) return;
    this.lastPresence = Date.now();
    this.socket?.send(JSON.stringify({ type: 'presence', ...point }));
  }
  async discardDraft() {
    this.discardOnStop = true;
    if (this.backupTimer) clearTimeout(this.backupTimer);
    this.backupTimer = undefined;
    await clearDrafts(this.key);
  }
  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.backupTimer) {
      clearTimeout(this.backupTimer);
      this.persist();
    }
    this.socket?.close();
    this.undo.destroy();
    this.doc.destroy();
    this.listeners.clear();
  }
  private blocked() {
    return this.terminal;
  }
  private connect() {
    this.synced = false;
    this.status('connecting');
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(
      `${protocol}//${location.host}/collaboration?board=${encodeURIComponent(this.boardId)}`,
    );
    this.socket.onmessage = (event) => {
      try {
        this.receive(messageSchema.parse(JSON.parse(String(event.data))));
      } catch {
        this.status('error');
        this.socket?.close(4002);
      }
    };
    this.socket.onerror = () => this.status('offline');
    this.socket.onclose = (event) => this.closed(event.code);
  }
  private receive(message: z.infer<typeof messageSchema>) {
    if (message.type === 'presence') {
      this.state = { ...this.state, peers: message.peers };
      this.changed();
      return;
    }
    if (message.type === 'error') {
      this.status('error');
      return;
    }
    if (message.type === 'ack') {
      this.acknowledged = Math.max(this.acknowledged, message.id);
      this.status(this.acknowledged >= this.sequence ? 'saved' : 'saving');
      return;
    }
    if (message.type === 'sync') {
      this.sync(message);
      return;
    }
    Y.applyUpdate(this.doc, decode(message.data), 'remote');
  }
  private sync(message: { generation: number; role: Role; data: string }) {
    if (this.generation !== null && this.generation !== message.generation) {
      this.resetForRemoteChange();
      return;
    }
    this.generation = message.generation;
    this.state = { ...this.state, role: message.role };
    if (!canEdit(message.role) && this.sequence > this.acknowledged) {
      this.resetForRemoteChange();
      return;
    }
    this.synced = true;
    this.retries = 0;
    Y.applyUpdate(this.doc, decode(message.data), 'remote');
    if (canEdit(message.role) && this.sequence > this.acknowledged) this.send();
    else this.status('saved');
  }
  private resetForRemoteChange() {
    this.status('restored');
    void clearDrafts(this.key).catch(this.cacheFailure);
    this.socket?.close(4004);
  }
  private closed(code: number) {
    this.synced = false;
    if (this.stopped) return;
    if (code === 4003) {
      this.status('denied');
      return;
    }
    if (code === 4004) {
      this.status('restored');
      void clearDrafts(this.key).catch(this.cacheFailure);
      return;
    }
    if (code === 4002 || this.state.status === 'error') {
      this.status('error');
      return;
    }
    this.status('offline');
    const delay = Math.min(15000, 500 * 2 ** this.retries++) + Math.random() * 300;
    this.timer = setTimeout(() => this.connect(), delay);
  }
  private send(update = Y.encodeStateAsUpdate(this.doc)) {
    if (!this.synced || this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify({
        type: 'update',
        data: encode(update),
        id: this.sequence,
        generation: this.generation,
      }),
    );
    this.status('saving');
  }
  private status(status: ConnectionStatus) {
    if (['denied', 'restored', 'error'].includes(status)) this.terminal = true;
    this.state = { ...this.state, status: !this.cached && status === 'offline' ? 'cacheError' : status };
    this.changed();
  }
  private changed() {
    this.state = {
      ...this.state,
      items: [...this.items.values()].sort(compareItems),
      canUndo: this.undo.canUndo(),
      canRedo: this.undo.canRedo(),
    };
    this.listeners.forEach((listener) => listener());
  }
  private backup() {
    if (this.backupTimer) clearTimeout(this.backupTimer);
    this.backupTimer = setTimeout(() => this.persist(), 150);
  }
  private persist() {
    if (this.terminal || this.discardOnStop) return;
    const data = Y.encodeStateAsUpdate(this.doc);
    void writeDraft({ key: this.key, data, generation: this.generation }).catch(this.cacheFailure);
  }
  private cacheFailure = () => {
    this.cached = false;
    if (!this.stopped && !this.terminal) this.status('cacheError');
  };
  private nextLayer() {
    return Math.max(0, ...[...this.items.values()].map((item) => item.zIndex ?? 0)) + 1;
  }
}
