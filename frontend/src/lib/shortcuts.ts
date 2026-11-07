import { BoardConnection } from './collaboration';
import { BoardItem, ToolType } from '../types/board';
import { moveItem } from '../components/Canvas/geometry';

interface ShortcutContext {
  connection: BoardConnection;
  selected?: BoardItem;
  writable: boolean;
  selectTool: (tool: ToolType) => void;
  clear: () => void;
  escape: () => void;
}
function undo(event: KeyboardEvent, context: ShortcutContext) {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || !context.writable) return false;
  event.preventDefault();
  if (event.shiftKey) context.connection.undo.redo();
  else context.connection.undo.undo();
  return true;
}
function transform(event: KeyboardEvent, context: ShortcutContext) {
  const { selected, writable, connection } = context;
  if (!selected || !writable) return false;
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    connection.remove(selected.id);
    context.clear();
    return true;
  }
  const arrows: Record<string, { x: number; y: number }> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
  };
  const direction = arrows[event.key];
  if (!direction) return false;
  event.preventDefault();
  const delta = event.shiftKey ? 10 : 1;
  connection.set(moveItem(selected, { x: direction.x * delta, y: direction.y * delta }));
  return true;
}
function toolShortcut(event: KeyboardEvent, context: ShortcutContext) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const tools: Record<string, ToolType> = {
    v: 'select',
    h: 'pan',
    r: 'rectangle',
    o: 'circle',
    s: 'sticky',
    t: 'text',
    a: 'arrow',
    p: 'pen',
    f: 'frame',
  };
  const tool = tools[event.key.toLowerCase()];
  if (!tool) return;
  if (context.writable || tool === 'select' || tool === 'pan') context.selectTool(tool);
}
export function boardShortcut(event: KeyboardEvent, context: ShortcutContext) {
  const target = event.target;
  if (target instanceof HTMLElement && (target.matches('input,textarea,select') || target.isContentEditable)) return;
  if (document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape') {
    context.escape();
    return;
  }
  if (undo(event, context)) return;
  if (transform(event, context)) return;
  toolShortcut(event, context);
}
