import './ui-setup';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AuthScreen } from '../src/components/AuthScreen';
import { Library } from '../src/components/Library';
import { App } from '../src/App';
import { fixtureApi, user, board, workspace } from './ui-fixtures';

it('submits sign-in and registration, preserves validation errors and invitation context', async () => {
  const { state, fetcher } = fixtureApi();
  const onUser = vi.fn();
  render(<AuthScreen onUser={onUser} invitation />);
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: user.email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-password' } });
  state.errors.set('POST auth/login', 'invalidCredentials');
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('alert');
  expect(onUser).not.toHaveBeenCalled();
  state.errors.clear();
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: user.name } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(onUser).toHaveBeenCalledWith(user));
  expect(fetcher).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(onUser).toHaveBeenCalledTimes(2));
});
it('searches and filters boards, creates workspaces and boards, renames and confirms deletion', async () => {
  fixtureApi();
  const refresh = vi.fn(async () => undefined);
  const open = vi.fn();
  const logout = vi.fn();
  const shared = { ...board, id: 'shared', role: 'viewer' as const, title: 'Shared sketch' };
  render(
    <Library
      user={user}
      boards={[board, shared]}
      workspaces={[workspace]}
      onOpen={open}
      onRefresh={refresh}
      onLogout={logout}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Shared with you' }));
  expect(screen.queryByText(board.title)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^All boards/ }));
  fireEvent.change(screen.getByPlaceholderText('Find a board…'), { target: { value: 'missing' } });
  expect(screen.getByText('No boards match your search.')).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText('Find a board…'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: workspace.title }));
  fireEvent.click(screen.getByRole('button', { name: `Open ${board.title}` }));
  expect(open).toHaveBeenCalledWith(board.id);
  fireEvent.click(screen.getByRole('button', { name: 'New board' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New idea' } });
  fireEvent.submit(screen.getByLabelText('Name').closest('form')!);
  await waitFor(() => expect(open).toHaveBeenCalledWith('new-board'));
  fireEvent.click(screen.getByRole('button', { name: 'New workspace' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New space' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: `Rename ${workspace.title}` }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed space' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: `Board settings ${board.title}` }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(logout).toHaveBeenCalled();
});
it('surfaces create failures and restores focus when dialogs are cancelled', async () => {
  const { state } = fixtureApi();
  state.errors.set('POST boards', 'limitReached');
  render(
    <Library
      user={user}
      boards={[]}
      workspaces={[workspace]}
      onOpen={vi.fn()}
      onRefresh={vi.fn()}
      onLogout={vi.fn()}
    />,
  );
  const create = screen.getByRole('button', { name: 'New board' });
  create.focus();
  fireEvent.click(create);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findAllByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(document.activeElement).toBe(create);
  fireEvent.click(screen.getByRole('button', { name: 'New workspace' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
});
it('boots the account shell, accepts an invitation and signs out without retaining cached account state', async () => {
  const { state } = fixtureApi();
  state.user = null;
  window.history.replaceState({}, '', '/#invite=synthetic');
  render(<App />);
  await screen.findByRole('heading', { name: 'Sign in' });
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: user.email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('button', { name: 'Accept invitation' });
  fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
  await screen.findByRole('button', { name: 'Back to boards' });
  fireEvent.click(screen.getByRole('button', { name: 'Back to boards' }));
  await screen.findByRole('heading', { name: 'Your boards' });
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByRole('heading', { name: 'Sign in' });
  await act(async () => {
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
});
