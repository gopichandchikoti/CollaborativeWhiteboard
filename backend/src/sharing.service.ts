import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { digest } from './auth';
import { Boards } from './boards';
import { roleSchema, Role } from './contracts';
import { parse } from './validation';
@Injectable()
export class SharingService {
  constructor(@Inject(Boards) private readonly boards: Boards) {}
  members(actorId: string, id: string) {
    this.boards.require(id, actorId, ['owner']);
    return this.boards.store.all(
      `SELECT u.id,u.name,u.email,a.role FROM access a
      JOIN users u ON u.id=a.userId WHERE a.boardId=? ORDER BY u.name`,
      id,
    );
  }
  invite(actorId: string, id: string, body: unknown) {
    this.boards.require(id, actorId, ['owner']);
    const { role } = parse(z.object({ role: roleSchema }), body);
    const token = randomBytes(32).toString('hex');
    this.boards.store.transaction(() => {
      this.boards.store.run('DELETE FROM invites WHERE expires<=?', Date.now());
      const [count] = this.boards.store.all<{ count: number }>(
        'SELECT COUNT(*) AS count FROM invites WHERE boardId=?',
        id,
      );
      if (count.count >= 100) throw new BadRequestException('limitReached');
      this.boards.store.run('INSERT INTO invites VALUES(?,?,?,?)', digest(token), id, role, Date.now() + 604800000);
      this.boards.audit(id, actorId, 'inviteCreated');
    });
    return { token, expiresAt: new Date(Date.now() + 604800000).toISOString() };
  }
  accept(actorId: string, body: unknown) {
    const { token } = parse(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }), body);
    return this.boards.store.transaction(() => {
      const invite = this.boards.store.get<{ boardId: string; role: Role }>(
        'SELECT boardId,role FROM invites WHERE hash=? AND expires>?',
        digest(token),
        Date.now(),
      );
      if (!invite) throw new BadRequestException('inviteExpired');
      const board = this.boards.store.get<{ ownerId: string }>('SELECT ownerId FROM boards WHERE id=?', invite.boardId);
      if (!board) throw new BadRequestException('inviteExpired');
      if (board.ownerId === actorId) throw new BadRequestException('alreadyOwner');
      const existing = this.boards.store.get(
        'SELECT userId FROM access WHERE boardId=? AND userId=?',
        invite.boardId,
        actorId,
      );
      const [count] = this.boards.store.all<{ count: number }>(
        'SELECT COUNT(*) AS count FROM access WHERE boardId=?',
        invite.boardId,
      );
      if (!existing && count.count >= 100) throw new BadRequestException('limitReached');
      this.boards.store.run(
        'INSERT INTO access VALUES(?,?,?) ON CONFLICT(boardId,userId) DO UPDATE SET role=excluded.role',
        invite.boardId,
        actorId,
        invite.role,
      );
      this.boards.store.run('DELETE FROM invites WHERE hash=?', digest(token));
      this.boards.audit(invite.boardId, actorId, 'inviteAccepted');
      return this.boards.require(invite.boardId, actorId);
    });
  }
  role(actorId: string, id: string, userId: string, body: unknown) {
    this.boards.require(id, actorId, ['owner']);
    const { role } = parse(z.object({ role: roleSchema }), body);
    return this.boards.store.transaction(() => {
      this.boards.store.run('UPDATE access SET role=? WHERE boardId=? AND userId=?', role, id, userId);
      this.boards.audit(id, actorId, 'roleChanged');
      return { ok: true };
    });
  }
  revoke(actorId: string, id: string, userId: string) {
    this.boards.require(id, actorId, ['owner']);
    return this.boards.store.transaction(() => {
      this.boards.store.run('DELETE FROM access WHERE boardId=? AND userId=?', id, userId);
      this.boards.audit(id, actorId, 'accessRevoked');
      return { ok: true };
    });
  }
}
