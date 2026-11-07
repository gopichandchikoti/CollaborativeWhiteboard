import { BoardItem, Point, Viewport } from '../../types/board';

export function worldPoint(point: Point, viewport: Viewport): Point {
  return { x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale };
}
export function resizeItem(item: BoardItem, point: Point): BoardItem {
  const width = Math.max(20, Math.min(100000, point.x - item.x));
  const height = Math.max(20, Math.min(100000, point.y - item.y));
  return {
    ...item,
    width,
    height,
    points: item.points?.map((value) => ({
      x: item.x + ((value.x - item.x) * width) / (item.width || 1),
      y: item.y + ((value.y - item.y) * height) / (item.height || 1),
    })),
  };
}
export function bounds(items: BoardItem[]) {
  if (!items.length) return { x: 0, y: 0, width: 800, height: 600 };
  const left = Math.min(...items.map((item) => item.x));
  const top = Math.min(...items.map((item) => item.y));
  return {
    x: left,
    y: top,
    width: Math.max(1, ...items.map((item) => item.x + item.width - left)),
    height: Math.max(1, ...items.map((item) => item.y + item.height - top)),
  };
}
export function fitViewport(items: BoardItem[], width: number, height: number): Viewport {
  const box = bounds(items);
  const scale = Math.max(0.1, Math.min(1.5, (width - 160) / box.width, (height - 240) / box.height));
  return {
    x: (width - box.width * scale) / 2 - box.x * scale,
    y: (height - box.height * scale) / 2 - box.y * scale,
    scale,
  };
}
export function visibleInViewport(item: BoardItem, viewport: Viewport, width: number, height: number) {
  const start = worldPoint({ x: -30, y: -30 }, viewport);
  const end = worldPoint({ x: width + 30, y: height + 30 }, viewport);
  return item.x + item.width >= start.x && item.y + item.height >= start.y && item.x <= end.x && item.y <= end.y;
}
