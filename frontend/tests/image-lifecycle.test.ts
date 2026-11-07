import { afterEach, expect, it, vi } from 'vitest';
import { clearImages, imageFor, loadBoardImages } from '../src/components/Canvas/images';
import { BoardItem } from '../src/types/board';

afterEach(() => {
  clearImages('private');
  vi.unstubAllGlobals();
});

it('deduplicates loads and prevents late image completions from repopulating a cleared private cache', async () => {
  const created: HTMLImageElement[] = [];
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';
      removeAttribute = vi.fn();
      constructor() {
        created.push(this as unknown as HTMLImageElement);
      }
    },
  );
  const item: BoardItem = {
    id: crypto.randomUUID(),
    type: 'image',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    color: '#000000',
    assetId: 'asset',
  };
  const first = loadBoardImages('private', [item]);
  const duplicate = loadBoardImages('private', [item]);
  expect(created).toHaveLength(1);
  const lateCompletion = created[0].onload;
  const lateFailure = created[0].onerror;
  clearImages('private');
  await Promise.all([first, duplicate]);
  const next = loadBoardImages('private', [item]);
  lateCompletion?.call(created[0], new Event('load'));
  lateFailure?.call(created[0], new Event('error'));
  expect(imageFor('private', 'asset')).toBeUndefined();
  created[1].onload?.call(created[1], new Event('load'));
  await next;
  expect(imageFor('private', 'asset')).toBe(created[1]);
  await loadBoardImages('private', [item]);
  expect(created).toHaveLength(2);
});
