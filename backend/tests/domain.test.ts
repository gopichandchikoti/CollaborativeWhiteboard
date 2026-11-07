import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as Y from 'yjs';
import { Storage } from '../src/storage';
import { Boards } from '../src/boards';
import { applyValidated, decodeUpdate, encodeUpdate, validateDocument } from '../src/collaboration/documents';
import { item } from './helpers';

afterEach(() => {
  delete process.env.WHITEBOARD_DB;
});
function setup() {
  const storage = new Storage();
  const boards = new Boards(storage);
  const userId = randomUUID();
  const workspace = randomUUID();
  storage.run('INSERT INTO users VALUES(?,?,?,?)', userId, 'fixture@example.test', 'Fixture', 'unused-test-hash');
  storage.run('INSERT INTO workspaces VALUES(?,?,?)', workspace, 'Fixture', userId);
  return {
    storage,
    boards,
    board: boards.create(userId, workspace, 'Durable board'),
  };
}
it('persists updates across an actual database close/reopen and rolls back failed transactions', () => {
  process.env.WHITEBOARD_DB = join(mkdtempSync(join(tmpdir(), 'whiteboard-restore-')), 'durable.sqlite');
  const { storage, boards, board } = setup();
  const doc = new Y.Doc();
  const note = item();
  doc.getMap('items').set(note.id, note);
  applyValidated(new Y.Doc(), Y.encodeStateAsUpdate(doc), board.id, boards);
  expect(() =>
    storage.transaction(() => {
      storage.run('DELETE FROM boards');
      throw new Error('rollback');
    }),
  ).toThrow('rollback');
  storage.onModuleDestroy();
  const reopened = new Storage();
  const persisted = new Boards(reopened).snapshot(board.id);
  const restored = new Y.Doc();
  Y.applyUpdate(restored, persisted ?? new Uint8Array());
  expect(restored.getMap('items').get(note.id)).toEqual(note);
  reopened.onModuleDestroy();
});
it('rejects newer databases rather than changing their schema', () => {
  process.env.WHITEBOARD_DB = join(mkdtempSync(join(tmpdir(), 'whiteboard-version-')), 'version.sqlite');
  const storage = new Storage();
  storage.db.exec('PRAGMA user_version=99');
  storage.onModuleDestroy();
  expect(() => new Storage()).toThrow('newer');
});
it('creates a durable default data directory and returns safe missing snapshots', () => {
  const directory = mkdtempSync(join(tmpdir(), 'whiteboard-default-'));
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(directory);
  const storage = new Storage();
  const boards = new Boards(storage);
  expect(boards.snapshot('missing')).toBeUndefined();
  expect(boards.generation('missing')).toBe(0);
  storage.onModuleDestroy();
  cwd.mockRestore();
});
it('validates update encoding, roots, identities, object limits, assets and document growth', () => {
  process.env.WHITEBOARD_DB = ':memory:';
  const { storage, boards, board } = setup();
  expect(decodeUpdate(encodeUpdate(new Uint8Array([1, 2, 3])))).toEqual(new Uint8Array([1, 2, 3]));
  expect(() => decodeUpdate('!!')).toThrow();
  expect(() => decodeUpdate('a'.repeat(2800001))).toThrow();
  const doc = new Y.Doc();
  doc.getMap('unexpected').set('x', 1);
  expect(() => validateDocument(doc, board.id, boards)).toThrow();
  doc.getMap('items');
  expect(() => validateDocument(doc, board.id, boards)).toThrow();
  const images = new Y.Doc();
  const image = { ...item(), type: 'image', assetId: undefined };
  images.getMap('items').set(image.id, image);
  expect(() => validateDocument(images, board.id, boards)).toThrow();
  images.getMap('items').set(image.id, { ...image, assetId: randomUUID() });
  expect(() => validateDocument(images, board.id, boards)).toThrow();
  const large = new Y.Doc();
  const entries = large.getMap('items');
  large.transact(() => {
    for (let index = 0; index < 5001; index++) {
      const note = item();
      entries.set(note.id, note);
    }
  });
  expect(() => validateDocument(large, board.id, boards)).toThrow();
  const bloated = new Y.Doc();
  const notes = bloated.getMap('items');
  bloated.transact(() => {
    for (let index = 0; index < 600; index++) {
      const note = { ...item(), text: 'a'.repeat(4000) };
      notes.set(note.id, note);
    }
  });
  expect(() => validateDocument(bloated, board.id, boards)).toThrow();
  const valid = new Y.Doc();
  validateDocument(valid, board.id, boards);
  storage.onModuleDestroy();
});
