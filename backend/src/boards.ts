import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Storage } from './storage';
import { Board, Role, Workspace } from './contracts';

@Injectable()
export class Boards {
  constructor(@Inject(Storage) readonly store: Storage) {}
  list(userId: string) {
    return this.store.all<Board>(
      `SELECT b.id,b.workspaceId,b.title,b.updatedAt,b.ownerId,
      CASE WHEN b.ownerId=? THEN 'owner' ELSE a.role END AS role FROM boards b
      LEFT JOIN access a ON a.boardId=b.id AND a.userId=? WHERE b.ownerId=? OR a.userId=?
      ORDER BY b.updatedAt DESC LIMIT 500`,
      userId,
      userId,
      userId,
      userId,
    );
  }
  workspaces(userId: string) {
    return this.store.all<Workspace>('SELECT * FROM workspaces WHERE ownerId=? ORDER BY title LIMIT 100', userId);
  }
  workspace(id: string, userId: string) {
    const row = this.store.get<Workspace>('SELECT * FROM workspaces WHERE id=? AND ownerId=?', id, userId);
    if (!row) throw new NotFoundException('notFound');
    return row;
  }
  createWorkspace(userId: string, title: string) {
    if (this.workspaces(userId).length >= 100) throw new BadRequestException('limitReached');
    const workspace = { id: randomUUID(), title, ownerId: userId };
    this.store.run('INSERT INTO workspaces VALUES(?,?,?)', workspace.id, title, userId);
    return workspace;
  }
  renameWorkspace(id: string, userId: string, title: string) {
    this.workspace(id, userId);
    this.store.run('UPDATE workspaces SET title=? WHERE id=?', title, id);
    return { ok: true };
  }
  deleteWorkspace(id: string, userId: string) {
    this.workspace(id, userId);
    this.store.run('DELETE FROM workspaces WHERE id=?', id);
    return { ok: true };
  }
  create(userId: string, workspaceId: string, title: string) {
    this.workspace(workspaceId, userId);
    // An aggregate without GROUP BY always returns one row; a missing row must fail closed.
    const [row] = this.store.all<{ count: number }>('SELECT COUNT(*) AS count FROM boards WHERE ownerId=?', userId);
    if (row.count >= 500) throw new BadRequestException('limitReached');
    const id = randomUUID();
    this.store.run(
      `INSERT INTO boards(id,workspaceId,ownerId,title,updatedAt) VALUES(?,?,?,?,?)`,
      id,
      workspaceId,
      userId,
      title,
      new Date().toISOString(),
    );
    return this.require(id, userId);
  }
  rename(id: string, userId: string, title: string) {
    this.require(id, userId, ['owner']);
    this.store.run('UPDATE boards SET title=?,updatedAt=? WHERE id=?', title, new Date().toISOString(), id);
    return { ok: true };
  }
  remove(id: string, userId: string) {
    this.require(id, userId, ['owner']);
    this.store.run('DELETE FROM boards WHERE id=?', id);
    return { ok: true };
  }
  require(id: string, userId: string, roles?: Role[]): Board {
    const board = this.store.get<Board>(
      `SELECT b.id,b.workspaceId,b.title,b.updatedAt,b.ownerId,
      CASE WHEN b.ownerId=? THEN 'owner' ELSE a.role END AS role FROM boards b
      LEFT JOIN access a ON a.boardId=b.id AND a.userId=? WHERE b.id=? AND (b.ownerId=? OR a.userId=?)`,
      userId,
      userId,
      id,
      userId,
      userId,
    );
    if (!board) throw new NotFoundException('notFound');
    if (roles && !roles.includes(board.role)) throw new ForbiddenException('readOnly');
    return board;
  }
  snapshot(id: string) {
    return this.store.get<{ snapshot: Uint8Array | null }>('SELECT snapshot FROM boards WHERE id=?', id)?.snapshot;
  }
  generation(id: string) {
    return this.store.get<{ generation: number }>('SELECT generation FROM boards WHERE id=?', id)?.generation ?? 0;
  }
  save(id: string, snapshot: Uint8Array) {
    this.store.run('UPDATE boards SET snapshot=?,updatedAt=? WHERE id=?', snapshot, new Date().toISOString(), id);
  }
  audit(boardId: string, userId: string, action: string) {
    this.store.run(
      'INSERT INTO events(boardId,userId,action,createdAt) VALUES(?,?,?,?)',
      boardId,
      userId,
      action,
      new Date().toISOString(),
    );
    this.store.run(
      `DELETE FROM events WHERE boardId=? AND id NOT IN
      (SELECT id FROM events WHERE boardId=? ORDER BY id DESC LIMIT 1000)`,
      boardId,
      boardId,
    );
  }
}
