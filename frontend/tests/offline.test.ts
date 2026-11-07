import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { clearDrafts, readDraft, writeDraft } from '../src/lib/offline';
afterEach(() => {
  vi.unstubAllGlobals();
});
it('isolates cached CRDT state by account and board and deletes only the intended prefix', async () => {
  await writeDraft({ key: 'alice:one', data: new Uint8Array([1, 2]), generation: 3 });
  await writeDraft({ key: 'alice:two', data: new Uint8Array([3]), generation: 0 });
  await writeDraft({ key: 'bob:one', data: new Uint8Array([4]), generation: 2 });
  expect((await readDraft('alice:one'))?.generation).toBe(3);
  await clearDrafts('alice:');
  expect(await readDraft('alice:one')).toBeUndefined();
  expect(await readDraft('alice:two')).toBeUndefined();
  expect(Array.from((await readDraft('bob:one'))?.data ?? [])).toEqual([4]);
  await clearDrafts('bob:');
});
it('reports unavailable local storage rather than claiming a successful backup', async () => {
  vi.stubGlobal('indexedDB', {
    open() {
      throw new Error('storage denied');
    },
  });
  await expect(readDraft('x')).rejects.toThrow('storage denied');
  await expect(writeDraft({ key: 'x', data: new Uint8Array(), generation: null })).rejects.toThrow();
  await expect(clearDrafts('x')).rejects.toThrow();
});
