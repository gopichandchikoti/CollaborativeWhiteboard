import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { IncomingMessage } from 'node:http';
import { Storage } from './storage';
import { accountSchema, registrationSchema, User } from './contracts';
import { hashPassword, verifyPassword } from './passwords';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class Auth {
  constructor(@Inject(Storage) private readonly store: Storage) {}
  async register(input: unknown) {
    const result = registrationSchema.safeParse(input);
    if (!result.success || !result.data.name) throw new BadRequestException('invalidAccount');
    const { email, password, name } = result.data;
    const hash = await hashPassword(password);
    const user: User = { id: randomUUID(), email, name };
    this.store.transaction(() => {
      if (this.store.get('SELECT id FROM users WHERE email=?', email)) throw new ConflictException('accountExists');
      this.store.run('INSERT INTO users VALUES(?,?,?,?)', user.id, email, name, hash);
      this.store.run('INSERT INTO workspaces VALUES(?,?,?)', randomUUID(), name, user.id);
    });
    return this.session(user);
  }
  async login(input: unknown) {
    const result = accountSchema.safeParse(input);
    if (!result.success) throw new UnauthorizedException('invalidCredentials');
    const row = this.store.get<User & { hash: string }>('SELECT * FROM users WHERE email=?', result.data.email);
    const fallback = `${'0'.repeat(32)}:${'0'.repeat(128)}`;
    const valid = await verifyPassword(result.data.password, row?.hash ?? fallback);
    if (!valid || !row) throw new UnauthorizedException('invalidCredentials');
    return this.session({ id: row.id, email: row.email, name: row.name });
  }
  user(request: IncomingMessage): User {
    const token = this.token(request);
    const user = this.store.get<User>(
      `SELECT u.id,u.email,u.name FROM users u
      JOIN sessions s ON s.userId=u.id WHERE s.hash=? AND s.expires>?`,
      digest(token),
      Date.now(),
    );
    if (!user) throw new UnauthorizedException('signInRequired');
    return user;
  }
  logout(request: IncomingMessage) {
    this.store.run('DELETE FROM sessions WHERE hash=?', digest(this.token(request)));
  }
  private token(request: IncomingMessage) {
    const entries = (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.split('=', 1)[0].trim() === 'whiteboard_session');
    if (entries.length !== 1) return '';
    const token = entries[0].slice(19);
    return /^[a-f0-9]{64}$/.test(token) ? token : '';
  }
  private session(user: User) {
    const token = randomBytes(32).toString('hex');
    this.store.transaction(() => {
      this.store.run('DELETE FROM sessions WHERE expires<=?', Date.now());
      this.store.run(
        `DELETE FROM sessions WHERE userId=? AND hash NOT IN
        (SELECT hash FROM sessions WHERE userId=? ORDER BY expires DESC, rowid DESC LIMIT 9)`,
        user.id,
        user.id,
      );
      this.store.run('INSERT INTO sessions VALUES(?,?,?)', digest(token), user.id, Date.now() + 86400000);
    });
    return { user, token };
  }
}
