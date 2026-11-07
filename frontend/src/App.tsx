import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { api, ApiError, okSchema } from './lib/api';
import { Board, boardSchema, User, userSchema, Workspace, workspaceSchema } from './lib/contracts';
import { errorText, t } from './lib/content';
import { clearDrafts } from './lib/offline';
import { AuthScreen } from './components/AuthScreen';
import { Library } from './components/Library';
import { BoardEditor } from './components/BoardEditor';
import { ErrorNotice } from './components/ui';

export function App({ contentFallback = false }: { contentFallback?: boolean }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [boards, setBoards] = useState<Board[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [boardId, setBoardId] = useState(new URLSearchParams(location.search).get('board'));
  const [invitation, setInvitation] = useState(new URLSearchParams(location.hash.slice(1)).get('invite'));
  const identityGeneration = useRef(0);
  const refreshSequence = useRef(0);
  const changeUser = useCallback((nextUser: User | null) => {
    identityGeneration.current++;
    setBoards([]);
    setWorkspaces([]);
    setUser(nextUser);
  }, []);
  const refresh = useCallback(async () => {
    const generation = identityGeneration.current;
    const sequence = ++refreshSequence.current;
    const [nextBoards, nextWorkspaces] = await Promise.all([
      api('boards', z.array(boardSchema)),
      api('workspaces', z.array(workspaceSchema)),
    ]);
    if (generation !== identityGeneration.current || sequence !== refreshSequence.current) return;
    setBoards(nextBoards);
    setWorkspaces(nextWorkspaces);
  }, []);
  useEffect(() => {
    let active = true;
    api('auth/me', userSchema)
      .then((value) => {
        if (active) changeUser(value);
      })
      .catch((reason) => {
        if (active && !(reason instanceof ApiError && reason.status === 401)) setError(errorText(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [changeUser]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    refresh().catch((reason) => {
      if (active) setError(errorText(reason));
    });
    return () => {
      active = false;
    };
  }, [user, refresh]);
  function open(id: string | null) {
    history.pushState({}, '', id ? `?board=${encodeURIComponent(id)}` : '/');
    setBoardId(id);
    setError('');
  }
  useEffect(() => {
    const navigate = () => setBoardId(new URLSearchParams(location.search).get('board'));
    window.addEventListener('popstate', navigate);
    return () => window.removeEventListener('popstate', navigate);
  }, []);
  async function accept() {
    try {
      const board = await api('invites/accept', boardSchema, 'POST', { token: invitation });
      setInvitation(null);
      await refresh();
      open(board.id);
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  async function logout() {
    try {
      await api('auth/logout', okSchema, 'POST');
      changeUser(null);
      open(null);
      if (user) await clearDrafts(`${user.id}:`);
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  if (loading)
    return (
      <main className="loading-screen" role="status">
        {t('common.loading')}
      </main>
    );
  if (!user)
    return (
      <>
        <ErrorNotice message={error} />
        <AuthScreen onUser={changeUser} invitation={!!invitation} />
      </>
    );
  if (boardId)
    return (
      <BoardEditor
        key={`${user.id}:${boardId}`}
        boardId={boardId}
        user={user}
        onBack={() => {
          open(null);
          void refresh().catch((reason) => setError(errorText(reason)));
        }}
      />
    );
  return (
    <>
      {contentFallback && (
        <div className="info-notice" role="status">
          {t('error.contentLoad')}
          <a className="text-button" href="/">
            {t('common.retry')}
          </a>
        </div>
      )}
      {invitation && (
        <div className="invitation-banner">
          <span>{t('share.pending')}</span>
          <button
            className="primary-button"
            onClick={() => {
              void accept();
            }}
          >
            {t('share.accept')}
          </button>
        </div>
      )}
      <ErrorNotice message={error} />
      <Library
        user={user}
        boards={boards}
        workspaces={workspaces}
        onOpen={open}
        onRefresh={refresh}
        onLogout={() => {
          void logout();
        }}
      />
    </>
  );
}
