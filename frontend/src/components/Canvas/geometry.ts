import { BoardItem, DrawingTool, Point } from '../../types/board';

export function createDraft(type: DrawingTool, color: string, start: Point): BoardItem {
  return {
    id: crypto.randomUUID(),
    type,
    color,
    x: start.x,
    y: start.y,
    width: 0,
    height: 0,
    text: undefined,
    points: type === 'pen' || type === 'arrow' ? [start] : undefined,
  };
}

export function updateDraft(item: BoardItem, start: Point, end: Point): BoardItem {
  if (item.type === 'pen') {
    const points = item.points?.length ? item.points : [start];
    const last = points[points.length - 1];
    if (last.x === end.x && last.y === end.y) return item;
    const x = Math.min(item.x, end.x);
    const y = Math.min(item.y, end.y);
    return {
      ...item,
      x,
      y,
      width: Math.max(item.x + item.width, end.x) - x,
      height: Math.max(item.y + item.height, end.y) - y,
      points: [...points, end],
    };
  }
  return {
    ...item,
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
    points: item.type === 'arrow' ? [start, end] : undefined,
  };
}

export function finishDraft(item: BoardItem): BoardItem {
  if (item.width || item.height || item.type === 'pen' || item.type === 'arrow') return item;
  return { ...item, width: 120, height: item.type === 'circle' ? 120 : 100 };
}

export function moveItem(item: BoardItem, delta: Point): BoardItem {
  return {
    ...item,
    x: item.x + delta.x,
    y: item.y + delta.y,
    points: item.points?.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y })),
  };
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - start.x - fraction * dx, point.y - start.y - fraction * dy);
}

function hitPath(points: Point[], point: Point): boolean {
  if (points.length === 1) return distanceToSegment(point, points[0], points[0]) <= 8;
  return points.some((end, index) => index > 0 && distanceToSegment(point, points[index - 1], end) <= 8);
}

export function hitItem(item: BoardItem, point: Point): boolean {
  if (item.type === 'pen' || item.type === 'arrow') return hitPath(item.points ?? [], point);
  if (item.type === 'circle') {
    const dx = (point.x - item.x - item.width / 2) / (item.width / 2 + 6);
    const dy = (point.y - item.y - item.height / 2) / (item.height / 2 + 6);
    return dx * dx + dy * dy <= 1;
  }
  return (
    point.x >= item.x - 6 &&
    point.x <= item.x + item.width + 6 &&
    point.y >= item.y - 6 &&
    point.y <= item.y + item.height + 6
  );
}

export function findItemAt(items: BoardItem[], point: Point): BoardItem | undefined {
  for (let index = items.length - 1; index >= 0; index--) {
    if (hitItem(items[index], point)) return items[index];
  }
  return undefined;
}
