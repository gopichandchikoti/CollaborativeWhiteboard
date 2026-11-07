import './ui-setup';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BoardRecovery } from '../src/components/BoardRecovery';
it('requires confirmation before discarding an unsaved draft and shows a failed recovery', async () => {
  const discard = vi.fn(async () => undefined);
  const done = vi.fn();
  const view = render(<BoardRecovery status="saved" discard={discard} onDone={done} />);
  expect(screen.queryByRole('button')).toBeNull();
  view.rerender(<BoardRecovery status="error" discard={discard} onDone={done} />);
  fireEvent.click(screen.getByRole('button', { name: 'Recover saved board' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(discard).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Recover saved board' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  fireEvent.click(screen.getByRole('button', { name: 'Recover saved board' }));
  discard.mockRejectedValueOnce(new Error('Storage denied'));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Discard unsaved changes' }));
  });
  await screen.findByRole('alert');
  expect(done).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Discard unsaved changes' }));
  });
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
});
