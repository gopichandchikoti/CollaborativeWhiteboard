import { expect, it } from 'vitest';
import { compareItems } from '../src/lib/order';
import { BoardItem } from '../src/types/board';
const shape = (id: string, zIndex?: number): BoardItem => ({
  id,
  zIndex,
  type: 'rectangle',
  color: '#24332e',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
});
it('produces the same paint/export order regardless of concurrent insertion order', () => {
  const records = [shape('b'), shape('a'), shape('front', 2), shape('back', -1)];
  const expected = ['back', 'a', 'b', 'front'];
  expect([...records].sort(compareItems).map((item) => item.id)).toEqual(expected);
  expect(
    [...records]
      .reverse()
      .sort(compareItems)
      .map((item) => item.id),
  ).toEqual(expected);
  expect(compareItems(records[0], records[0])).toBe(0);
});
