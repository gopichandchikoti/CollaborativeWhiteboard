import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import * as Y from 'yjs';
import { Auth } from '../auth';
import { Boards } from '../boards';
import { User, editable, idSchema } from '../contracts';
import { localRequestAllowed, origins } from '../request-policy';
import { applyValidated, decodeUpdate, encodeUpdate } from './documents';
import { MAX_PEERS, sendBounded } from './socket-policy';

interface Peer {
  socket: WebSocket;
  request: IncomingMessage;
  user: User;
  boardId: string;
  id: string;
  cursor: { x: number; y: number } | null;
  count: number;
  expires: number;
}
interface Room {
  doc: Y.Doc;
  peers: Set<Peer>;
}
const messageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('update'),
    data: z.string(),
    id: z.number().int().nonnegative(),
    generation: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('presence'),
    x: z.number().finite().min(-1000000).max(1000000),
    y: z.number().finite().min(-1000000).max(1000000),
  }),
]);

@Injectable()
export class CollaborationGateway implements OnModuleDestroy {
  private readonly rooms = new Map<string, Room>();
  private server?: WebSocketServer;
  private timer?: ReturnType<typeof setInterval>;
  private readonly alive = new WeakSet<WebSocket>();
  constructor(
    @Inject(Auth) private readonly auth: Auth,
    @Inject(Boards) private readonly boards: Boards,
  ) {}
  attach(server: Server) {
    this.server = new WebSocketServer({
      server,
      path: '/collaboration',
      maxPayload: 2800000,
      perMessageDeflate: false,
      verifyClient: (info, done) => {
        try {
          const { boardId } = this.authorize(info.req);
          done((this.server?.clients.size ?? 0) < MAX_PEERS && (this.rooms.get(boardId)?.peers.size ?? 0) < 30, 403);
        } catch {
          done(false, 403);
        }
      },
    });
    this.server.on('connection', (socket, request) => this.connect(socket, request));
    this.server.on('error', () => console.error(JSON.stringify({ event: 'collaborationServerFailed' })));
    this.timer = setInterval(() => this.heartbeat(), 5000);
  }
  revalidate() {
    for (const room of this.rooms.values()) {
      for (const peer of room.peers) this.checkPeer(peer);
    }
  }
  heartbeat() {
    for (const room of this.rooms.values()) {
      for (const peer of room.peers) {
        if (!this.alive.delete(peer.socket)) peer.socket.terminate();
        else if (peer.socket.readyState === WebSocket.OPEN) peer.socket.ping();
      }
    }
    this.revalidate();
  }
  private checkPeer(peer: Peer) {
    try {
      this.auth.user(peer.request);
      this.boards.require(peer.boardId, peer.user.id);
      return true;
    } catch {
      peer.socket.close(4003, 'accessRevoked');
      return false;
    }
  }
  closeBoard(boardId: string) {
    const room = this.rooms.get(boardId);
    if (!room) return;
    this.rooms.delete(boardId);
    room.peers.forEach((peer) => peer.socket.close(4004, 'boardRestored'));
    room.doc.destroy();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.rooms.forEach((room) => {
      room.peers.forEach((peer) => peer.socket.close(1001));
      room.doc.destroy();
    });
    this.server?.close();
  }
  private connect(socket: WebSocket, request: IncomingMessage) {
    try {
      const { user, boardId, board } = this.authorize(request);
      const room = this.room(boardId);
      if (room.peers.size >= 30) throw new Error('capacity');
      const peer: Peer = {
        socket,
        request,
        user,
        boardId,
        id: crypto.randomUUID(),
        cursor: null,
        count: 0,
        expires: Date.now() + 1000,
      };
      room.peers.add(peer);
      this.alive.add(socket);
      socket.on('pong', () => this.alive.add(socket));
      sendBounded(
        socket,
        JSON.stringify({
          type: 'sync',
          data: encodeUpdate(Y.encodeStateAsUpdate(room.doc)),
          role: board.role,
          generation: this.boards.generation(boardId),
        }),
      );
      this.presence(room);
      socket.on('message', (data, binary) => this.message(peer, room, binary ? '' : data.toString()));
      socket.on('error', () => socket.close(1011));
      socket.on('close', () => this.disconnect(peer, room));
    } catch {
      socket.close(4003, 'accessDenied');
    }
  }
  private authorize(request: IncomingMessage) {
    if (!localRequestAllowed(request.headers)) throw new Error('requestBoundary');
    if (!origins.has(request.headers.origin ?? '')) throw new Error('origin');
    const user = this.auth.user(request);
    const boardId = idSchema.parse(new URL(request.url ?? '', 'http://localhost').searchParams.get('board'));
    return { user, boardId, board: this.boards.require(boardId, user.id) };
  }
  private room(boardId: string) {
    let room = this.rooms.get(boardId);
    if (!room) {
      const doc = new Y.Doc();
      const snapshot = this.boards.snapshot(boardId);
      if (snapshot) Y.applyUpdate(doc, snapshot);
      room = { doc, peers: new Set() };
      this.rooms.set(boardId, room);
    }
    return room;
  }
  private message(peer: Peer, room: Room, raw: string) {
    try {
      if (this.rooms.get(peer.boardId) !== room) throw new Error('staleRoom');
      this.auth.user(peer.request);
      const board = this.boards.require(peer.boardId, peer.user.id);
      if (peer.expires < Date.now()) {
        peer.count = 0;
        peer.expires = Date.now() + 1000;
      }
      if (++peer.count > 100) throw new Error('rate');
      const message = messageSchema.parse(JSON.parse(raw));
      if (message.type === 'presence') {
        peer.cursor = { x: message.x, y: message.y };
        this.presence(room);
        return;
      }
      if (!editable(board.role)) throw new Error('readOnly');
      if (message.generation !== this.boards.generation(peer.boardId)) throw new Error('staleGeneration');
      applyValidated(room.doc, decodeUpdate(message.data), peer.boardId, this.boards);
      this.broadcast(room, { type: 'update', data: message.data }, peer);
      sendBounded(peer.socket, JSON.stringify({ type: 'ack', id: message.id }));
    } catch {
      sendBounded(peer.socket, JSON.stringify({ type: 'error', code: 'updateRejected' }));
      peer.socket.close(4002, 'updateRejected');
    }
  }
  private disconnect(peer: Peer, room: Room) {
    room.peers.delete(peer);
    this.presence(room);
    if (!room.peers.size) {
      room.doc.destroy();
      if (this.rooms.get(peer.boardId) === room) this.rooms.delete(peer.boardId);
    }
  }
  private presence(room: Room) {
    this.broadcast(room, {
      type: 'presence',
      peers: [...room.peers].map((peer) => ({
        id: peer.id,
        userId: peer.user.id,
        name: peer.user.name,
        cursor: peer.cursor,
      })),
    });
  }
  private broadcast(room: Room, message: unknown, exclude?: Peer) {
    const data = JSON.stringify(message);
    room.peers.forEach((peer) => {
      if (peer !== exclude && this.checkPeer(peer)) sendBounded(peer.socket, data);
    });
  }
}
