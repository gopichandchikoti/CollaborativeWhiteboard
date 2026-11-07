import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

@Injectable()
export class Storage implements OnModuleDestroy {
  readonly db: DatabaseSync;
  constructor() {
    const path = process.env.WHITEBOARD_DB ?? resolve('data', 'whiteboard.sqlite');
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    try {
      this.migrate();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  run(sql: string, ...values: SQLInputValue[]) {
    return this.db.prepare(sql).run(...values);
  }
  get<T>(sql: string, ...values: SQLInputValue[]) {
    return this.db.prepare(sql).get(...values) as T | undefined;
  }
  all<T>(sql: string, ...values: SQLInputValue[]) {
    return this.db.prepare(sql).all(...values) as T[];
  }
  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  onModuleDestroy() {
    this.db.close();
  }
  private migrate() {
    const version = this.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
    if (version > 1) throw new Error('Database schema is newer than this application');
    if (version === 1) return;
    this.transaction(() =>
      this.db.exec(`
      CREATE TABLE users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, hash TEXT NOT NULL);
      CREATE TABLE sessions(hash TEXT PRIMARY KEY, userId TEXT REFERENCES users(id) ON DELETE CASCADE, expires INTEGER);
      CREATE TABLE workspaces(id TEXT PRIMARY KEY, title TEXT NOT NULL, ownerId TEXT REFERENCES users(id));
      CREATE TABLE boards(id TEXT PRIMARY KEY, workspaceId TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
        ownerId TEXT REFERENCES users(id), title TEXT NOT NULL, updatedAt TEXT NOT NULL, snapshot BLOB,
        generation INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE access(boardId TEXT REFERENCES boards(id) ON DELETE CASCADE,
        userId TEXT REFERENCES users(id) ON DELETE CASCADE, role TEXT CHECK(role IN ('editor','commenter','viewer')),
        PRIMARY KEY(boardId,userId));
      CREATE TABLE invites(hash TEXT PRIMARY KEY, boardId TEXT REFERENCES boards(id) ON DELETE CASCADE,
        role TEXT CHECK(role IN ('editor','commenter','viewer')), expires INTEGER NOT NULL);
      CREATE TABLE assets(id TEXT PRIMARY KEY, boardId TEXT REFERENCES boards(id) ON DELETE CASCADE,
        mime TEXT NOT NULL, bytes BLOB NOT NULL);
      CREATE TABLE comments(id TEXT PRIMARY KEY, boardId TEXT REFERENCES boards(id) ON DELETE CASCADE,
        userId TEXT REFERENCES users(id), text TEXT NOT NULL, createdAt TEXT NOT NULL, resolved INTEGER DEFAULT 0);
      CREATE TABLE history(id TEXT PRIMARY KEY, boardId TEXT REFERENCES boards(id) ON DELETE CASCADE,
        title TEXT NOT NULL, createdAt TEXT NOT NULL, snapshot BLOB NOT NULL);
      CREATE TABLE events(id INTEGER PRIMARY KEY, boardId TEXT REFERENCES boards(id) ON DELETE CASCADE,
        userId TEXT REFERENCES users(id), action TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE INDEX board_workspace ON boards(workspaceId);
      CREATE INDEX access_user ON access(userId);
      CREATE INDEX assets_board ON assets(boardId);
      CREATE INDEX comments_board ON comments(boardId);
      CREATE INDEX history_board ON history(boardId);
      PRAGMA user_version=1;
    `),
    );
  }
}
