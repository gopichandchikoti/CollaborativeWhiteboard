import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import * as Y from 'yjs';
import { PNG } from 'pngjs';
import { Boards } from './boards';
import { Comment, titleSchema } from './contracts';
import { parse } from './validation';
@Injectable()
export class ContentService {
  constructor(@Inject(Boards) private readonly boards: Boards) {}
  upload(actorId: string, id: string, body: unknown) {
    this.boards.require(id, actorId, ['owner', 'editor']);
    const { data } = parse(
      z.object({
        data: z
          .string()
          .max(5600000)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
      }),
      body,
    );
    const bytes = Buffer.from(data, 'base64');
    if (!validPng(bytes)) throw new BadRequestException('invalidImage');
    const count = this.boards.store.get<{ count: number }>('SELECT COUNT(*) AS count FROM assets WHERE boardId=?', id);
    if ((count?.count ?? 0) >= 100) throw new BadRequestException('limitReached');
    const assetId = randomUUID();
    this.boards.store.run('INSERT INTO assets VALUES(?,?,?,?)', assetId, id, 'image/png', bytes);
    return { assetId };
  }
  asset(actorId: string, id: string, assetId: string) {
    this.boards.require(id, actorId);
    const asset = this.boards.store.get<{ bytes: Uint8Array }>(
      'SELECT bytes FROM assets WHERE boardId=? AND id=?',
      id,
      assetId,
    );
    if (!asset) throw new BadRequestException('invalidAsset');
    return Buffer.from(asset.bytes);
  }
  comments(actorId: string, id: string) {
    this.boards.require(id, actorId);
    return this.boards.store.all<Comment>(
      `SELECT c.*,u.name FROM comments c JOIN users u ON u.id=c.userId
      WHERE boardId=? ORDER BY createdAt DESC LIMIT 200`,
      id,
    );
  }
  comment(actorId: string, id: string, body: unknown) {
    this.boards.require(id, actorId, ['owner', 'editor', 'commenter']);
    const { text } = parse(z.object({ text: z.string().trim().min(1).max(2000) }), body);
    const count = this.boards.store.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM comments WHERE boardId=?',
      id,
    );
    if ((count?.count ?? 0) >= 200) throw new BadRequestException('limitReached');
    this.boards.store.run(
      'INSERT INTO comments VALUES(?,?,?,?,?,0)',
      randomUUID(),
      id,
      actorId,
      text,
      new Date().toISOString(),
    );
    return { ok: true };
  }
  resolveComment(actorId: string, id: string, commentId: string) {
    this.boards.require(id, actorId, ['owner', 'editor']);
    this.boards.store.run('UPDATE comments SET resolved=1 WHERE boardId=? AND id=?', id, commentId);
    return { ok: true };
  }
  history(actorId: string, id: string) {
    this.boards.require(id, actorId);
    return this.boards.store.all('SELECT id,title,createdAt FROM history WHERE boardId=? ORDER BY createdAt DESC', id);
  }
  checkpoint(actorId: string, id: string, body: unknown) {
    this.boards.require(id, actorId, ['owner', 'editor']);
    const { title } = parse(z.object({ title: titleSchema }), body);
    this.boards.store.transaction(() => {
      this.boards.store.run(
        'INSERT INTO history VALUES(?,?,?,?,?)',
        randomUUID(),
        id,
        title,
        new Date().toISOString(),
        this.boards.snapshot(id) ?? new Uint8Array([0, 0]),
      );
      this.boards.store.run(
        `DELETE FROM history WHERE boardId=? AND id NOT IN
        (SELECT id FROM history WHERE boardId=? ORDER BY createdAt DESC LIMIT 20)`,
        id,
        id,
      );
    });
    return { ok: true };
  }
  restore(actorId: string, id: string, snapshotId: string) {
    this.boards.require(id, actorId, ['owner']);
    const row = this.boards.store.get<{ snapshot: Uint8Array }>(
      'SELECT snapshot FROM history WHERE boardId=? AND id=?',
      id,
      snapshotId,
    );
    if (!row) throw new BadRequestException('notFound');
    this.replaceSnapshot(id, row.snapshot, actorId, 'historyRestored');

    return { ok: true };
  }
  compact(actorId: string, id: string) {
    this.boards.require(id, actorId, ['owner']);
    this.replaceSnapshot(id, this.boards.snapshot(id) ?? new Uint8Array([0, 0]), actorId, 'documentCompacted');

    return { ok: true };
  }
  private replaceSnapshot(id: string, snapshot: Uint8Array, userId: string, action: string) {
    const original = new Y.Doc();
    const compacted = new Y.Doc();
    try {
      Y.applyUpdate(original, snapshot);
      compacted.transact(() =>
        original.getMap('items').forEach((value, key) => compacted.getMap('items').set(key, value)),
      );
      this.boards.store.transaction(() => {
        this.boards.save(id, Y.encodeStateAsUpdate(compacted));
        this.boards.store.run('UPDATE boards SET generation=generation+1 WHERE id=?', id);
        this.boards.audit(id, userId, action);
      });
    } finally {
      original.destroy();
      compacted.destroy();
    }
  }
  export(actorId: string, id: string) {
    this.boards.require(id, actorId);
    this.boards.audit(id, actorId, 'export');
    const doc = new Y.Doc();
    try {
      const snapshot = this.boards.snapshot(id);
      if (snapshot) Y.applyUpdate(doc, snapshot);
      return { items: [...doc.getMap('items').values()] };
    } finally {
      doc.destroy();
    }
  }
}

function validPng(bytes: Buffer) {
  if (bytes.length < 45 || bytes.length > 4194304) return false;
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return false;
  if (bytes.subarray(12, 16).toString() !== 'IHDR') return false;
  if (bytes.subarray(-8, -4).toString() !== 'IEND') return false;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (![width, height].every((dimension) => dimension > 0 && dimension <= 4096)) return false;
  try {
    PNG.sync.read(bytes, { checkCRC: true });
    return true;
  } catch {
    return false;
  }
}
