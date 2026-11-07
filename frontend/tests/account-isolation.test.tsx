import './ui-setup';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { fixtureApi, user, board, workspace } from './ui-fixtures';

it('ignores a previous account response that completes after sign-out and another sign-in', async () => {
  const { state, fetcher } = fixtureApi();
  let complete: ((value: Response) => void) | undefined;
  const obsolete = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  const nextUser = { ...user, id: 'other-account', email: 'other@example.test', name: 'Other account' };
  const nextBoard = { ...board, id: 'other-board', title: 'Other private board', ownerId: nextUser.id };
  let first = true;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/boards' && first) {
      first = false;
      return obsolete;
    }
    if (String(input) === '/api/auth/login') return new Response(JSON.stringify(nextUser));
    return fetcher(input, init);
  });
  render(<App />);
  await screen.findByRole('heading', { name: 'Your boards' });
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('heading', { name: 'Sign in' });
  state.boards = [nextBoard];
  state.workspaces = [{ ...workspace, id: 'other-space', ownerId: nextUser.id }];
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: nextUser.email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('button', { name: `Open ${nextBoard.title}` });
  await act(async () => {
    complete?.(new Response(JSON.stringify([board])));
  });
  expect(screen.queryByRole('button', { name: `Open ${board.title}` })).toBeNull();
  expect(screen.getByRole('button', { name: `Open ${nextBoard.title}` })).toBeTruthy();
});
