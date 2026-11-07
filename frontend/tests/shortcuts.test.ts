import { expect, it, vi } from 'vitest';
import { boardShortcut } from '../src/lib/shortcuts';
import { BoardConnection } from '../src/lib/collaboration';
it('supports keyboard editing while leaving form inputs, modal focus and read-only roles intact', () => {
  const remove = vi.fn();
  const set = vi.fn();
  const clear = vi.fn();
  const selectTool = vi.fn();
  const connection = { remove, set, undo: { undo: vi.fn(), redo: vi.fn() } } as unknown as BoardConnection;
  const context = {
    connection,
    selected: { id: 'note', type: 'sticky' as const, x: 10, y: 20, width: 100, height: 100, color: '#24332e' },
    writable: true,
    selectTool,
    clear,
    escape: vi.fn(),
  };
  boardShortcut(new KeyboardEvent('keydown', { key: 'Delete' }), context);
  expect(remove).toHaveBeenCalledWith('note');
  boardShortcut(new KeyboardEvent('keydown', { key: 'Backspace' }), context);
  expect(clear).toHaveBeenCalledTimes(2);
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])
    boardShortcut(new KeyboardEvent('keydown', { key, shiftKey: true }), context);
  expect(set).toHaveBeenCalledTimes(4);
  boardShortcut(new KeyboardEvent('keydown', { key: 'x', altKey: true }), context);
  boardShortcut(new KeyboardEvent('keydown', { key: 'r' }), { ...context, writable: false });
  expect(selectTool).not.toHaveBeenCalled();
  boardShortcut(new KeyboardEvent('keydown', { key: 'v' }), { ...context, writable: false });
  expect(selectTool).toHaveBeenCalledWith('select');
  const input = document.createElement('textarea');
  const event = new KeyboardEvent('keydown', { key: 'Delete' });
  Object.defineProperty(event, 'target', { value: input });
  boardShortcut(event, context);
  expect(remove).toHaveBeenCalledTimes(2);
});
