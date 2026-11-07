import { BoardItem } from '../types/board';
export function compareItems(first: BoardItem, second: BoardItem) {
  const layer = (first.zIndex ?? 0) - (second.zIndex ?? 0);
  if (layer) return layer;
  if (first.id === second.id) return 0;
  return first.id < second.id ? -1 : 1;
}
