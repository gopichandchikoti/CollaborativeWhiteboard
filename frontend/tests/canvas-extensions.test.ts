import { afterEach, describe, expect, it, vi } from 'vitest';
import { bounds, fitViewport, resizeItem, visibleInViewport, worldPoint } from '../src/components/Canvas/viewport';
import { drawItem, drawScene, textLines } from '../src/components/Canvas/rendering';
import { clearImages, imageFor, loadBoardImages } from '../src/components/Canvas/images';
import { BoardItem } from '../src/types/board';

const item: BoardItem = { id: 'test', type: 'rectangle', x: 10, y: 20, width: 100, height: 80, color: '#24332e' };
function context() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillText: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    ellipse: vi.fn(),
    setLineDash: vi.fn(),
    drawImage: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 8 }),
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  clearImages('test-board');
});
describe('viewport and transforms', () => {
  it('converts coordinates and preserves path geometry through resizing', () => {
    expect(worldPoint({ x: 100, y: 60 }, { x: 20, y: 10, scale: 2 })).toEqual({ x: 40, y: 25 });
    const path = {
      ...item,
      points: [
        { x: 10, y: 20 },
        { x: 110, y: 100 },
      ],
    };
    expect(resizeItem(path, { x: 210, y: 180 }).points).toEqual([
      { x: 10, y: 20 },
      { x: 210, y: 180 },
    ]);
    expect(resizeItem({ ...item, width: 0, height: 0 }, { x: 5, y: 5 })).toMatchObject({ width: 20, height: 20 });
    expect(resizeItem(item, { x: 1000000, y: 1000000 }).width).toBe(100000);
  });
  it('fits bounds, empty boards, and culls offscreen objects at different zoom levels', () => {
    expect(bounds([])).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(bounds([item, { ...item, x: -20, y: -40 }])).toEqual({ x: -20, y: -40, width: 130, height: 140 });
    expect(fitViewport([item], 1000, 800).scale).toBe(1.5);
    expect(fitViewport([item], 160, 240).scale).toBe(0.1);
    expect(visibleInViewport(item, { x: 0, y: 0, scale: 1 }, 800, 600)).toBe(true);
    expect(visibleInViewport(item, { x: -2000, y: -2000, scale: 1 }, 800, 600)).toBe(false);
  });
});
describe('rendering additional object types', () => {
  it('wraps text, clips it, and renders all supported shapes, paths and placeholders', () => {
    const raw = context();
    const ctx = raw as unknown as CanvasRenderingContext2D;
    expect(textLines(ctx, { ...item, text: 'First\nSecond paragraph that wraps', width: 55 }).length).toBeGreaterThan(
      3,
    );
    for (const type of ['text', 'sticky', 'rectangle', 'circle', 'frame', 'pen', 'arrow', 'image'] as const) {
      drawItem(ctx, { ...item, type, text: 'Text\nMore text', points: [] });
    }
    drawItem(ctx, { ...item, type: 'sticky', fillColor: '#ffffff' });
    drawItem(ctx, { ...item, type: 'rectangle', fillColor: '#ffffff' });
    drawItem(ctx, { ...item, type: 'pen', points: [{ x: 1, y: 1 }] });
    drawItem(ctx, {
      ...item,
      type: 'arrow',
      points: [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
    });
    drawItem(ctx, {
      ...item,
      type: 'arrow',
      points: [
        { x: 1, y: 1 },
        { x: 20, y: 20 },
      ],
    });
    const image = {} as HTMLImageElement;
    drawItem(ctx, { ...item, type: 'image', assetId: 'asset' }, () => image);
    expect(raw.drawImage).toHaveBeenCalledWith(image, 10, 20, 100, 80);
    expect(raw.fillText).toHaveBeenCalled();
    expect(raw.clip).toHaveBeenCalled();
    drawScene(ctx, [item], { ...item, x: 40 }, item.id);
    drawScene(ctx, [], { ...item, id: 'draft' }, 'none');
    drawScene(ctx, [item], null, null);
  });
});
describe('private image cache', () => {
  it('deduplicates in-flight loads and releases board-specific images', async () => {
    const pending: { onload?: () => void; src: string }[] = [];
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        onload?: () => void;
        constructor() {
          pending.push(this);
        }
      },
    );
    const asset = { ...item, type: 'image' as const, assetId: 'private' };
    const first = loadBoardImages('test-board', [asset]);
    const second = loadBoardImages('test-board', [asset]);
    expect(pending).toHaveLength(1);
    expect(pending[0].src).toContain('/api/boards/test-board/assets/private');
    pending[0].onload?.();
    await first;
    await second;
    await loadBoardImages('test-board', [asset]);
    expect(pending).toHaveLength(1);
    expect(imageFor('test-board', 'private')).toBeTruthy();
    clearImages('other');
    clearImages('test-board');
    expect(imageFor('test-board', 'private')).toBeUndefined();
  });
  it('reports image failures and allows retry', async () => {
    vi.stubGlobal(
      'Image',
      class {
        onerror?: () => void;
        set src(_value: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    await expect(loadBoardImages('test-board', [{ ...item, assetId: 'missing' }])).rejects.toThrow('invalidAsset');
    await expect(loadBoardImages('test-board', [{ ...item, assetId: 'missing' }])).rejects.toThrow();
  });
});
