import { BoardItem, Point } from '../../types/board';

export type ImageResolver = (assetId: string) => HTMLImageElement | undefined;
export function textLines(ctx: CanvasRenderingContext2D, item: BoardItem): string[] {
  const lines: string[] = [];
  for (const paragraph of (item.text ?? '').split('\n')) {
    let line = '';
    for (const character of paragraph) {
      if (ctx.measureText(line + character).width > Math.max(10, item.width - 24)) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
    lines.push(line);
  }
  return lines;
}
function drawText(ctx: CanvasRenderingContext2D, item: BoardItem) {
  if (!item.text) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(item.x, item.y, item.width, item.height);
  ctx.clip();
  ctx.fillStyle = item.type === 'sticky' ? '#24332e' : item.color;
  ctx.font = '16px sans-serif';
  textLines(ctx, item)
    .slice(0, Math.ceil(item.height / 22))
    .forEach((line, index) => {
      ctx.fillText(line, item.x + 12, item.y + 28 + index * 22);
    });
  ctx.restore();
}

function drawPath(ctx: CanvasRenderingContext2D, points: Point[]) {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.stroke();
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, 1, 0, 2 * Math.PI);
    ctx.fill();
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, points: Point[]) {
  drawPath(ctx, points);
  if (points.length < 2) return;
  const [start, end] = points;
  if (start.x === end.x && start.y === end.y) return;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = 12;
  ctx.beginPath();
  ctx.moveTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(end.x, end.y);
  ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawBox(ctx: CanvasRenderingContext2D, item: BoardItem) {
  const fill = item.type === 'sticky' ? (item.fillColor ?? '#f9e7a1') : item.fillColor;
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(item.x, item.y, item.width, item.height);
  }
  ctx.strokeRect(item.x, item.y, item.width, item.height);
  drawText(ctx, item);
}
function drawImage(ctx: CanvasRenderingContext2D, item: BoardItem, imageFor?: ImageResolver) {
  const image = item.assetId ? imageFor?.(item.assetId) : undefined;
  if (image) ctx.drawImage(image, item.x, item.y, item.width, item.height);
  else {
    ctx.fillStyle = '#e4e9e5';
    ctx.fillRect(item.x, item.y, item.width, item.height);
  }
}

export function drawItem(ctx: CanvasRenderingContext2D, item: BoardItem, imageFor?: ImageResolver) {
  ctx.save();
  ctx.strokeStyle = item.color;
  ctx.fillStyle = item.color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (item.type) {
    case 'pen':
      drawPath(ctx, item.points ?? []);
      break;
    case 'arrow':
      drawArrow(ctx, item.points ?? []);
      break;
    case 'circle':
      ctx.beginPath();
      ctx.ellipse(
        item.x + item.width / 2,
        item.y + item.height / 2,
        item.width / 2,
        item.height / 2,
        0,
        0,
        2 * Math.PI,
      );
      if (item.fillColor) {
        ctx.fillStyle = item.fillColor;
        ctx.fill();
      }
      ctx.stroke();
      drawText(ctx, item);
      break;
    case 'text':
      drawText(ctx, item);
      break;
    case 'image':
      drawImage(ctx, item, imageFor);
      break;
    case 'frame':
      ctx.setLineDash([10, 6]);
      drawBox(ctx, item);
      break;
    default:
      drawBox(ctx, item);
  }
  ctx.restore();
}

function drawSelection(ctx: CanvasRenderingContext2D, item: BoardItem) {
  const x = item.x - 6;
  const y = item.y - 6;
  const width = item.width + 12;
  const height = item.height + 12;
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, width, height);
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(x, y, width, height);
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(item.x + item.width - 5, item.y + item.height - 5, 10, 10);
  ctx.strokeRect(item.x + item.width - 5, item.y + item.height - 5, 10, 10);
  ctx.restore();
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  items: BoardItem[],
  draft: BoardItem | null,
  selectedId: string | null,
  imageFor?: ImageResolver,
) {
  const visibleItems = items.map((item) => (item.id === draft?.id ? draft : item));
  if (draft && !items.some((item) => item.id === draft.id)) visibleItems.push(draft);
  visibleItems.forEach((item) => drawItem(ctx, item, imageFor));
  const selected = visibleItems.find((item) => item.id === selectedId);
  if (selected) drawSelection(ctx, selected);
}
