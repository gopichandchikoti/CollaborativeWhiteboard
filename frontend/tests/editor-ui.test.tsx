import './ui-setup';
import { UISocket } from './ui-setup';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BoardEditor } from '../src/components/BoardEditor';
import { BoardPanel } from '../src/components/BoardPanels';
import { ShareDialog } from '../src/components/ShareDialog';
import { BoardMenu } from '../src/components/BoardMenus';
import { CompactBoard } from '../src/components/CompactBoard';
import { fixtureApi, user, board } from './ui-fixtures';
import { createCanvas } from '@napi-rs/canvas';
async function click(element: Element) {
  await act(async () => {
    fireEvent.click(element);
  });
}
it('confirms compaction before requesting it and lets users cancel', async () => {
  const { fetcher } = fixtureApi();
  const done = vi.fn();
  render(<CompactBoard boardId={board.id} onDone={done} />);
  await click(screen.getByRole('button', { name: 'Compact saved board' }));
  await click(screen.getByRole('button', { name: 'Close' }));
  expect(done).not.toHaveBeenCalled();
  await click(screen.getByRole('button', { name: 'Compact saved board' }));
  await click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Compact saved board' }));
  await waitFor(() => expect(done).toHaveBeenCalled());
  expect(fetcher.mock.calls.some((call) => String(call[0]).endsWith('/compact'))).toBe(true);
});

function draw(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
  fireEvent(canvas, event);
}
async function editor() {
  const back = vi.fn();
  const result = render(<BoardEditor boardId={board.id} user={user} onBack={back} />);
  await screen.findByText('All changes saved');
  return { ...result, back };
}
it('draws, edits, transforms, duplicates, orders, deletes, undoes and navigates structured objects', async () => {
  fixtureApi();
  const { container } = await editor();
  const canvas = container.querySelector('canvas')!;
  await click(screen.getByRole('button', { name: 'Sticky Note' }));
  draw(canvas, 'pointerdown', 200, 200);
  draw(canvas, 'pointermove', 400, 350);
  draw(canvas, 'pointerup', 400, 350);
  await screen.findByRole('complementary', { name: 'Selected object' });
  fireEvent.change(screen.getByLabelText('Object text'), { target: { value: 'A real idea' } });
  fireEvent.change(screen.getByLabelText('X position'), { target: { value: '210' } });
  await click(screen.getByRole('button', { name: 'Save' }));
  await click(screen.getByRole('button', { name: 'Color #31705a' }));
  await click(screen.getByRole('button', { name: 'Duplicate object' }));
  await click(screen.getByRole('button', { name: 'Bring to front' }));
  await click(screen.getByRole('button', { name: 'Send to back' }));
  fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
  fireEvent.keyDown(window, { key: 'ArrowUp' });
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
  await click(screen.getByRole('button', { name: 'Undo' }));
  await click(screen.getByRole('button', { name: 'Redo' }));
  await click(screen.getByRole('button', { name: 'Objects' }));
  const search = screen.getByPlaceholderText('Find an object…');
  fireEvent.change(search, { target: { value: 'missing' } });
  expect(screen.getByText('No objects yet.')).toBeTruthy();
  fireEvent.change(search, { target: { value: '' } });
  await click(screen.getAllByRole('button', { name: 'Select A real idea' })[0]);
  await click(screen.getByRole('button', { name: 'Close' }));
  await click(screen.getByRole('button', { name: 'Delete object' }));
  fireEvent.keyDown(window, { key: 'Escape' });
});
it('navigates tools, camera, presentation, help, panels, sharing and export', async () => {
  fixtureApi();
  const { back } = await editor();
  for (const key of ['r', 'v', 'h', 'o', 'p', 'f', 'a', 't', 's']) fireEvent.keyDown(window, { key });
  await click(screen.getByRole('button', { name: 'Zoom in' }));
  await click(screen.getByRole('button', { name: 'Zoom out' }));
  await click(screen.getByRole('button', { name: 'Reset view' }));
  await click(screen.getByRole('button', { name: 'Fit all objects' }));
  await click(screen.getByRole('button', { name: 'Presentation mode' }));
  await click(screen.getByRole('button', { name: 'Exit presentation' }));
  await click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
  fireEvent.keyDown(window, { key: 'r' });
  await click(screen.getByRole('button', { name: 'Close' }));
  await click(screen.getByRole('button', { name: 'Comments' }));
  await click(screen.getByRole('button', { name: 'Comments' }));
  await click(screen.getByRole('button', { name: 'History' }));
  await click(screen.getByRole('button', { name: 'Close' }));
  await click(screen.getByRole('button', { name: 'Share board' }));
  await screen.findByText('People with access');
  await click(screen.getByRole('button', { name: 'Close' }));
  await click(screen.getByRole('button', { name: 'Export' }));
  await click(screen.getByRole('button', { name: 'Close' }));
  await click(screen.getByRole('button', { name: 'Back to boards' }));
  expect(back).toHaveBeenCalled();
});
it('inserts real templates, handles live cursors and permission changes, and offers load recovery', async () => {
  const { state } = fixtureApi();
  const { unmount } = await editor();
  await click(screen.getByRole('button', { name: 'Start with a structure' }));
  await click(screen.getByRole('button', { name: 'Retrospective' }));
  await click(screen.getByRole('button', { name: 'Objects' }));
  await screen.findByRole('button', { name: 'Select What went well' });
  act(() =>
    UISocket.instances[0].receive({
      type: 'presence',
      peers: [
        { id: 'me', userId: user.id, name: user.name, cursor: null },
        { id: 'other', userId: 'other', name: 'Second editor', cursor: { x: 2, y: 3 } },
      ],
    }),
  );
  expect(screen.getByText('Second editor')).toBeTruthy();
  act(() => UISocket.instances[0].close(4003));
  await screen.findByText('Access changed · Reopen this board');
  unmount();
  state.errors.set(`GET boards/${board.id}`, 'notFound');
  const next = render(<BoardEditor boardId={board.id} user={user} onBack={vi.fn()} />);
  await screen.findByRole('alert');
  state.errors.clear();
  await click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('button', { name: 'Back to boards' });
  next.unmount();
});
it('lets viewers navigate and export while hiding mutation controls', async () => {
  const { state } = fixtureApi();
  state.boards[0] = { ...board, role: 'viewer' };
  UISocket.role = 'viewer';
  await editor();
  expect(screen.queryByRole('button', { name: 'Sticky Note' })).toBeNull();
  await click(screen.getByRole('button', { name: 'Pan' }));
  fireEvent.keyDown(window, { key: 'r' });
  fireEvent.keyDown(window, { key: 'h' });
  expect(screen.queryByRole('button', { name: 'Share board' })).toBeNull();
  expect(screen.getByText('You have Viewer access')).toBeTruthy();
});
it('posts, resolves, checkpoints and restores through the panel contracts', async () => {
  fixtureApi();
  const close = vi.fn();
  const props = { boardId: board.id, role: 'owner' as const, items: [], onClose: close, onSelect: vi.fn() };
  const view = render(<BoardPanel panel="comments" {...props} />);
  await screen.findByText('Start a conversation about this board.');
  fireEvent.change(screen.getByLabelText('Write a comment'), { target: { value: 'An actionable comment' } });
  await click(screen.getByRole('button', { name: 'Post comment' }));
  await screen.findByText('An actionable comment');
  await click(screen.getByRole('button', { name: 'Resolve comment' }));
  await screen.findByText('Resolved');
  view.rerender(<BoardPanel panel="history" {...props} />);
  await screen.findByText('Save a checkpoint to revisit this moment later.');
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Before changes' } });
  await click(screen.getByRole('button', { name: 'Save checkpoint' }));
  await screen.findByText('Before changes');
  await click(screen.getByRole('button', { name: 'Restore checkpoint' }));
  const dialog = screen.getByRole('dialog');
  await click(within(dialog).getByRole('button', { name: 'Restore checkpoint' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  view.rerender(<BoardPanel panel="history" {...props} role="viewer" />);
  expect(screen.queryByRole('button', { name: 'Save checkpoint' })).toBeNull();
});
it('creates and copies invitations, changes member roles and removes access', async () => {
  const { state, fetcher } = fixtureApi();
  const clipboard = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } });
  state.members = [{ ...user, id: 'member', name: 'Synthetic member', role: 'editor' }];
  const close = vi.fn();
  render(<ShareDialog boardId={board.id} onClose={close} />);
  await screen.findByText('Synthetic member');
  fireEvent.change(screen.getByLabelText('Invitation role'), { target: { value: 'viewer' } });
  await click(screen.getByRole('button', { name: 'Create invitation link' }));
  await screen.findByLabelText('Invitation link');
  fireEvent.focus(screen.getByLabelText('Invitation link'));
  await click(screen.getByRole('button', { name: 'Copy link' }));
  await waitFor(() => expect(clipboard).toHaveBeenCalled());
  await screen.findByRole('button', { name: 'Link copied' });
  fireEvent.change(screen.getByLabelText('Invitation role Synthetic member'), { target: { value: 'commenter' } });
  await waitFor(() =>
    expect(fetcher.mock.calls.some((call) => call[1]?.method === 'POST' && String(call[0]).endsWith('/member'))).toBe(
      true,
    ),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Remove access for Synthetic member' }).hasAttribute('disabled')).toBe(
      false,
    ),
  );
  await click(screen.getByRole('button', { name: 'Remove access for Synthetic member' }));
  await waitFor(() => expect(fetcher.mock.calls.some((call) => call[1]?.method === 'DELETE')).toBe(true));
});
it('renames and explicitly confirms board deletion; creates a flow template', async () => {
  fixtureApi();
  const close = vi.fn();
  const remove = vi.fn();
  const rename = vi.fn();
  const template = vi.fn();
  const props = { board, onClose: close, onDelete: remove, onRename: rename, onTemplate: template, saved: true };
  const view = render(<BoardMenu menu="settings" {...props} />);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed board' } });
  await click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(rename).toHaveBeenCalledWith('Renamed board'));
  await click(screen.getByRole('button', { name: 'Delete' }));
  await click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(remove).toHaveBeenCalled());
  view.rerender(<BoardMenu menu="templates" {...props} />);
  await click(screen.getByRole('button', { name: 'Simple flow' }));
  expect(template).toHaveBeenCalledWith('flow');
});
it('uploads a private raster through the editor and exposes failures without fabricating success', async () => {
  fixtureApi();
  const source = createCanvas(40, 30);
  Object.defineProperty(source, 'close', { value: vi.fn() });
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => source),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,aGVsbG8=');
  const { container } = await editor();
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
  await click(screen.getByRole('button', { name: 'Image' }));
  fireEvent.change(input, { target: { files: [] } });
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['x'], 'synthetic.png', { type: 'image/png' })] } });
  });
  await screen.findByRole('complementary', { name: 'Selected object' });
  expect(screen.queryByLabelText('Object text')).toBeNull();
  await click(screen.getByRole('button', { name: 'Save' }));
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(['x'], 'bad.svg', { type: 'image/svg+xml' })] } });
  });
  await screen.findByRole('alert');
});
