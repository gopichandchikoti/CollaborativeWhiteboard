import { z } from 'zod';
import { BoardItem } from '../types/board';
import { api } from './api';
import { bounds } from '../components/Canvas/viewport';
import { drawScene, textLines } from '../components/Canvas/rendering';
import { imageFor, loadBoardImages } from '../components/Canvas/images';
import { compareItems } from './order';

const itemSchema = z.object({
  id: z.string(),
  type: z.enum(['rectangle', 'circle', 'sticky', 'arrow', 'pen', 'text', 'frame', 'image']),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  color: z.string(),
  fillColor: z.string().optional(),
  text: z.string().optional(),
  points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  assetId: z.string().optional(),
  zIndex: z.number().optional(),
});
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[char] ?? char,
  );
function download(blob: Blob, title: string, extension: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0, 80)}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportBoard(boardId: string, title: string, format: 'png' | 'svg') {
  const data = await api(`boards/${boardId}/export`, z.object({ items: z.array(itemSchema) }), 'POST');
  const items = data.items.sort(compareItems);
  await loadBoardImages(boardId, items);
  const box = bounds(items);
  const canvas = document.createElement('canvas');
  const scale = Math.min(2, 4096 / (box.width + 64), 4096 / (box.height + 64));
  canvas.width = Math.ceil((box.width + 64) * scale);
  canvas.height = Math.ceil((box.height + 64) * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  if (format === 'svg') {
    const content = items.map((item) => svgItem(item, boardId, ctx)).join('');
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x - 32} ${box.y - 32} ` +
      `${box.width + 64} ${box.height + 64}"><rect x="${box.x - 32}" y="${box.y - 32}" ` +
      `width="${box.width + 64}" height="${box.height + 64}" fill="white"/>${content}</svg>`;
    download(new Blob([svg], { type: 'image/svg+xml' }), title, 'svg');
    return;
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.translate(32 - box.x, 32 - box.y);
  drawScene(ctx, items, null, null, (id) => imageFor(boardId, id));
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => (value ? resolve(value) : reject())),
  );
  download(blob, title, 'png');
}
function svgItem(item: BoardItem, boardId: string, ctx: CanvasRenderingContext2D) {
  const { x, y, width, height } = item;
  const stroke = `stroke="${escape(item.color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const fill = escape(item.fillColor ?? defaultFill(item));
  let shape = '';
  if (item.type === 'circle')
    shape =
      `<ellipse cx="${x + width / 2}" cy="${y + height / 2}" ` +
      `rx="${width / 2}" ry="${height / 2}" fill="${fill}" ${stroke}/>`;
  else if (item.type === 'pen' || item.type === 'arrow') shape = svgPath(item, stroke);
  else if (item.type === 'image') shape = svgImage(item, boardId);
  else if (item.type !== 'text')
    shape =
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" ` +
      `fill="${fill}" ${stroke} ${item.type === 'frame' ? 'stroke-dasharray="10 6"' : ''}/>`;
  if (!item.text) return shape;
  ctx.font = '16px sans-serif';
  const text = textLines(ctx, item)
    .slice(0, Math.ceil(height / 22))
    .map(
      (line, index) =>
        `<text x="${x + 12}" y="${y + 28 + index * 22}" fill="${escape(item.type === 'sticky' ? '#24332e' : item.color)}" ` +
        `font-size="16" font-family="sans-serif">${escape(line)}</text>`,
    )
    .join('');
  return (
    `${shape}<clipPath id="clip-${escape(item.id)}"><rect x="${x}" y="${y}" width="${width}" ` +
    `height="${height}"/></clipPath><g clip-path="url(#clip-${escape(item.id)})">${text}</g>`
  );
}
function svgPath(item: BoardItem, stroke: string) {
  const points = item.points ?? [];
  if (!points.length) return '';
  if (points.length === 1)
    return `<circle cx="${points[0].x}" cy="${points[0].y}" r="1" fill="${escape(item.color)}"/>`;
  let path = `<polyline points="${points.map((point) => `${point.x},${point.y}`).join(' ')}" fill="none" ${stroke}/>`;
  if (item.type !== 'arrow' || points.length < 2) return path;
  const [start, end] = points;
  if (start.x === end.x && start.y === end.y) return path;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = [angle - Math.PI / 6, angle + Math.PI / 6].map((value) => ({
    x: end.x - 12 * Math.cos(value),
    y: end.y - 12 * Math.sin(value),
  }));
  path +=
    `<polyline points="${head[0].x},${head[0].y} ${end.x},${end.y} ${head[1].x},${head[1].y}" ` +
    `fill="none" ${stroke}/>`;
  return path;
}
function svgImage(item: BoardItem, boardId: string) {
  const image = item.assetId ? imageFor(boardId, item.assetId) : undefined;
  if (!image) throw new Error('invalidAsset');
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext('2d')?.drawImage(image, 0, 0);
  return (
    `<image x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" ` +
    `preserveAspectRatio="none" href="${canvas.toDataURL('image/png')}"/>`
  );
}

function defaultFill(item: BoardItem) {
  return item.type === 'sticky' ? '#f9e7a1' : 'none';
}
