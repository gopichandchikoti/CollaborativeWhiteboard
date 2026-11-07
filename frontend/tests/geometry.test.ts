import { describe, expect, it } from 'vitest';
import {
  createDraft,
  findItemAt,
  finishDraft,
  hitItem,
  moveItem,
  updateDraft,
} from '../src/components/Canvas/geometry';
import { DrawingTool } from '../src/types/board';

const start = { x: 100, y: 100 };

function shape(type: DrawingTool = 'rectangle') {
  return updateDraft(createDraft(type, '#ef4444', start), start, { x: 300, y: 200 });
}

describe('geometry and hit detection', () => {
  it.each(['rectangle', 'circle', 'sticky', 'arrow'] as const)('normalizes %s drags in all directions', (type) => {
    for (const end of [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 0, y: 200 },
      { x: 200, y: 200 },
    ]) {
      const item = updateDraft(createDraft(type, '#ef4444', start), start, end);
      expect(item.x).toBe(Math.min(start.x, end.x));
      expect(item.y).toBe(Math.min(start.y, end.y));
      expect(item.width).toBe(100);
      expect(item.height).toBe(100);
    }
  });

  it('keeps all pen samples and computes bounds across direction changes', () => {
    let item = createDraft('pen', '#ef4444', start);
    item = updateDraft(item, start, { x: 50, y: 200 });
    item = updateDraft(item, start, { x: 300, y: 30 });
    expect(item).toMatchObject({ x: 50, y: 30, width: 250, height: 170 });
    expect(item.points).toHaveLength(3);
    expect(updateDraft(item, start, { x: 300, y: 30 }).points).toHaveLength(3);
  });

  it('retains a reverse arrow endpoint when moving it', () => {
    const item = updateDraft(createDraft('arrow', '#ef4444', start), start, { x: 0, y: 20 });
    const moved = moveItem(item, { x: 30, y: 40 });
    expect(moved.points).toEqual([
      { x: 130, y: 140 },
      { x: 30, y: 60 },
    ]);
    expect(item.points).toEqual([start, { x: 0, y: 20 }]);
  });

  it('starts a usable stroke if an item has no stored samples', () => {
    const pen = { ...createDraft('pen', 'black', start), points: [] };
    expect(updateDraft(pen, start, { x: 120, y: 140 }).points).toEqual([start, { x: 120, y: 140 }]);
  });

  it('gives clicked shapes default sizes while preserving dots and thin drags', () => {
    expect(finishDraft(createDraft('rectangle', 'black', start))).toMatchObject({ width: 120, height: 100 });
    expect(finishDraft(createDraft('circle', 'black', start))).toMatchObject({ width: 120, height: 120 });
    expect(finishDraft(createDraft('pen', 'black', start))).toMatchObject({ width: 0, height: 0 });
    expect(finishDraft(createDraft('arrow', 'black', start))).toMatchObject({ width: 0, height: 0 });
    const line = updateDraft(createDraft('rectangle', 'black', start), start, { x: 200, y: 100 });
    expect(finishDraft(line).height).toBe(0);
  });

  it('selects the topmost overlapping object without modifying paint order', () => {
    const bottom = shape();
    const top = shape('sticky');
    const items = [bottom, top];
    expect(findItemAt(items, { x: 150, y: 150 })).toBe(top);
    expect(findItemAt(items, { x: 500, y: 500 })).toBeUndefined();
    expect(items).toEqual([bottom, top]);
  });

  it('tests ellipses by their curved boundary rather than bounding-box corners', () => {
    const ellipse = shape('circle');
    expect(hitItem(ellipse, { x: 200, y: 150 })).toBe(true);
    expect(hitItem(ellipse, { x: 300, y: 150 })).toBe(true);
    expect(hitItem(ellipse, { x: 100, y: 100 })).toBe(false);
  });

  it('selects strokes near the actual line and ignores empty areas inside their bounds', () => {
    const pen = shape('pen');
    expect(hitItem(pen, { x: 200, y: 150 })).toBe(true);
    expect(hitItem(pen, { x: 200, y: 110 })).toBe(false);
    expect(hitItem(pen, { x: 400, y: 250 })).toBe(false);
    expect(hitItem(createDraft('pen', 'black', start), { x: 101, y: 100 })).toBe(true);
    expect(hitItem({ ...pen, points: [] }, start)).toBe(false);
    expect(hitItem({ ...pen, points: undefined }, start)).toBe(false);
    expect(hitItem({ ...pen, points: [start, start] }, start)).toBe(true);
  });
});
