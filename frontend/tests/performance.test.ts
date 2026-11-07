import { expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { drawScene } from '../src/components/Canvas/rendering';
import { visibleInViewport } from '../src/components/Canvas/viewport';
import { BoardItem } from '../src/types/board';
it('culls and renders a 1200-object board within the local native-canvas frame budget', () => {
  const canvas = createCanvas(1200, 800);
  const ctx = canvas.getContext('2d');
  const items: BoardItem[] = Array.from({ length: 1200 }, (_, index) => ({
    id: String(index),
    type: 'sticky',
    x: (index % 40) * 200,
    y: Math.floor(index / 40) * 150,
    width: 180,
    height: 120,
    color: '#24332e',
    text: `Synthetic object ${index}`,
  }));
  const frames: number[] = [];
  const initialHeap = process.memoryUsage().heapUsed;
  for (let index = 0; index < 120; index++) {
    const start = performance.now();
    const viewport = { x: -index * 17, y: -index * 5, scale: 0.8 + (index % 5) * 0.1 };
    ctx.resetTransform();
    ctx.clearRect(0, 0, 1200, 800);
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.scale, viewport.scale);
    const visible = items.filter((item) => visibleInViewport(item, viewport, 1200, 800));
    drawScene(ctx as unknown as CanvasRenderingContext2D, visible, null, null);
    frames.push(performance.now() - start);
  }
  frames.sort((a, b) => a - b);
  const p95 = frames[Math.floor(frames.length * 0.95)];
  process.stdout.write(
    JSON.stringify({
      benchmark: 'native-canvas-1200',
      p95Ms: Number(p95.toFixed(2)),
      heapDeltaMiB: Number(((process.memoryUsage().heapUsed - initialHeap) / 1048576).toFixed(2)),
    }) + '\n',
  );
  expect(p95).toBeLessThan(32);
  expect(items).toHaveLength(1200);
});
