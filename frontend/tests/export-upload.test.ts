import './ui-setup';
import { afterEach, expect, it, vi } from 'vitest';
import { Canvas as NativeCanvas, createCanvas, Image as NativeImage } from '@napi-rs/canvas';
import { exportBoard } from '../src/lib/exports';
import { uploadImage } from '../src/lib/uploads';
import { templateItems } from '../src/lib/templates';
import { BoardItem } from '../src/types/board';
import { clearImages } from '../src/components/Canvas/images';

const note: BoardItem = {
  id: crypto.randomUUID(),
  type: 'sticky',
  x: -10,
  y: -20,
  width: 180,
  height: 100,
  text: '<script> & "quoted"',
  color: '#24332e',
};
const blobs: Blob[] = [];
function rasterSetup(items: BoardItem[] = [note]) {
  const image = createCanvas(10, 10);
  image.getContext('2d').fillRect(0, 0, 10, 10);
  vi.stubGlobal(
    'Image',
    class {
      constructor() {
        const instance = new NativeImage();
        const setter = Object.getOwnPropertyDescriptor(NativeImage.prototype, 'src')?.set;
        Object.defineProperty(instance, 'src', {
          set() {
            setter?.call(instance, image.toBuffer('image/png'));
          },
        });
        return instance;
      }
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
    const ctx = this.getContext('2d') as unknown as { canvas: NativeCanvas };
    callback(new Blob([Uint8Array.from(ctx.canvas.toBuffer('image/png'))], { type: 'image/png' }));
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
    const ctx = this.getContext('2d') as unknown as { canvas: NativeCanvas };
    return ctx.canvas.toDataURL('image/png');
  });
  URL.createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return 'blob:synthetic';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ items }))),
  );
}
function read(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}
afterEach(() => {
  blobs.length = 0;
  clearImages('export');
});
it('exports escaped vector content for every object type with private embedded raster images', async () => {
  const shapes: BoardItem[] = ['rectangle', 'circle', 'text', 'frame', 'pen', 'arrow'].map((type, index) => ({
    ...note,
    id: crypto.randomUUID(),
    type: type as BoardItem['type'],
    x: index * 200,
    fillColor: index % 2 ? '#ffffff' : undefined,
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 50 },
    ],
  }));
  shapes.push({ ...note, id: crypto.randomUUID(), type: 'image', assetId: 'private' });
  shapes.push({ ...note, id: crypto.randomUUID(), type: 'pen', points: [] });
  shapes.push({ ...note, id: crypto.randomUUID(), type: 'pen', points: [{ x: 1, y: 1 }] });
  shapes.push({
    ...note,
    id: crypto.randomUUID(),
    type: 'arrow',
    points: [
      { x: 1, y: 1 },
      { x: 1, y: 1 },
    ],
  });
  shapes.push({ ...note, id: crypto.randomUUID(), text: undefined });
  rasterSetup(shapes);
  await exportBoard('export', 'Team / sketch', 'svg');
  const svg = await read(blobs[0]);
  expect(svg).toContain('&lt;script&gt;');
  expect(svg).not.toContain('<script>');
  expect(svg).toContain('data:image/png;base64,');
  expect(svg).toContain('<ellipse');
  expect(svg).toContain('stroke-dasharray');
  expect(svg).toContain('<clipPath');
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(parsed.querySelector('parsererror')).toBeNull();
  await exportBoard('export', 'Team', 'png');
  expect(blobs[1].type).toBe('image/png');
  expect(blobs[1].size).toBeGreaterThan(100);
});
it('bounds empty and huge PNGs and reports missing canvas/blob failures', async () => {
  rasterSetup([]);
  await exportBoard('export', 'Empty', 'png');
  expect(blobs).toHaveLength(1);
  rasterSetup([{ ...note, width: 100000, height: 100000 }]);
  await exportBoard('export', 'Large', 'png');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  await expect(exportBoard('export', 'No canvas', 'png')).rejects.toThrow('Canvas unavailable');
});
it('validates images, converts uploads into private PNGs and closes decoded bitmaps on failure', async () => {
  const close = vi.fn();
  const source = createCanvas(80, 60);
  Object.defineProperties(source, { close: { value: close }, width: { value: 80 }, height: { value: 60 } });
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => source),
  );
  rasterSetup();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ assetId: 'private' }))),
  );
  const result = await uploadImage('export', new File(['synthetic'], 'test.png', { type: 'image/png' }));
  expect(result).toEqual({ assetId: 'private', width: 80, height: 60 });
  expect(close).toHaveBeenCalled();
  await expect(uploadImage('export', new File(['x'], 'unsafe.svg', { type: 'image/svg+xml' }))).rejects.toMatchObject({
    code: 'invalidImage',
  });
  await expect(
    uploadImage('export', new File([new Uint8Array(4194305)], 'large.png', { type: 'image/png' })),
  ).rejects.toThrow();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 9000, height: 10, close })),
  );
  await expect(uploadImage('export', new File(['x'], 'huge.png', { type: 'image/png' }))).rejects.toMatchObject({
    code: 'invalidImage',
  });
});
it('provides usable original retrospective and flow structures', () => {
  expect(templateItems('retro')).toHaveLength(3);
  const flow = templateItems('flow');
  expect(flow).toHaveLength(5);
  expect(flow.filter((item) => item.type === 'arrow')).toHaveLength(2);
});

it('encodes all string attributes in SVG exports even if a server response violates the color or ID contract', async () => {
  const attack = '"/><script>alert(1)</script><rect value="';
  rasterSetup([{ ...note, type: 'rectangle', id: attack, color: attack, fillColor: attack }]);
  await exportBoard('export', 'Untrusted attributes', 'svg');
  const svg = await read(blobs[0]);
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(parsed.querySelector('parsererror')).toBeNull();
  expect(parsed.querySelector('script')).toBeNull();
  expect(parsed.querySelectorAll('rect')).toHaveLength(3);
});
