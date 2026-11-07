import { vi } from 'vitest';
import { Board, User, Workspace } from '../src/lib/contracts';
export const user: User = { id: 'owner', name: 'Synthetic Owner', email: 'owner@example.test' };
export const workspace: Workspace = { id: 'workspace', title: 'Synthetic workspace', ownerId: user.id };
export const board: Board = {
  id: 'board',
  title: 'Synthetic board',
  ownerId: user.id,
  workspaceId: workspace.id,
  updatedAt: '2026-11-07T12:00:00Z',
  role: 'owner',
};
export function fixtureApi() {
  const state = {
    user: user as User | null,
    boards: [board],
    workspaces: [workspace],
    comments: [] as Record<string, unknown>[],
    history: [] as Record<string, unknown>[],
    members: [] as Record<string, unknown>[],
    errors: new Map<string, string>(),
  };
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('/api/', '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const error = state.errors.get(`${method} ${path}`);
    if (error) return new Response(JSON.stringify({ code: error }), { status: error === 'readOnly' ? 403 : 400 });
    let value: unknown = { ok: true };
    if (path === 'auth/me') {
      if (!state.user) return new Response(JSON.stringify({ code: 'signInRequired' }), { status: 401 });
      value = state.user;
    } else if (path === 'auth/login' || path === 'auth/register') value = user;
    else if (path === 'boards')
      value = method === 'POST' ? { ...board, id: 'new-board', title: body.title } : state.boards;
    else if (path === 'workspaces')
      value = method === 'POST' ? { ...workspace, id: 'new-workspace', title: body.title } : state.workspaces;
    else if (path === 'invites/accept') value = board;
    else if (/^boards\/[^/]+$/.test(path) && method === 'GET')
      value = state.boards.find((value) => value.id === path.split('/')[1]) ?? board;
    else if (path.endsWith('/invites')) value = { token: 'a'.repeat(64), expiresAt: '2026-11-14T12:00:00Z' };
    else if (path.endsWith('/members')) value = state.members;
    else if (path.endsWith('/comments')) {
      if (method === 'POST')
        state.comments.push({
          id: 'comment',
          boardId: board.id,
          userId: user.id,
          name: user.name,
          text: body.text,
          createdAt: board.updatedAt,
          resolved: 0,
        });
      else value = state.comments;
    } else if (path.includes('/comments/') && method === 'DELETE')
      state.comments.forEach((value) => {
        value.resolved = 1;
      });
    else if (path.endsWith('/history')) {
      if (method === 'POST') state.history.push({ id: 'checkpoint', title: body.title, createdAt: board.updatedAt });
      else value = state.history;
    } else if (path.endsWith('/export')) value = { items: [] };
    else if (path.endsWith('/assets')) value = { assetId: 'image' };
    return new Response(JSON.stringify(value));
  });
  vi.stubGlobal('fetch', fetcher);
  return { state, fetcher };
}
