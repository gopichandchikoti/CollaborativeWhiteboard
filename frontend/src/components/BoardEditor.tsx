import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Board, boardSchema, User } from '../lib/contracts';
import { errorText, t } from '../lib/content';
import { BoardConnection } from '../lib/collaboration';
import { clearImages } from './Canvas/images';
import { BoardSession } from './BoardSession';
import { ErrorNotice } from './ui';
export function BoardEditor({ boardId, user, onBack }: { boardId: string; user: User; onBack: () => void }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [connection, setConnection] = useState<BoardConnection | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let current: BoardConnection | undefined;
    api(`boards/${boardId}`, boardSchema)
      .then((value) => {
        if (!active) return;
        setBoard(value);
        current = new BoardConnection(boardId, user.id, value.role);
        setConnection(current);
        void current.start();
      })
      .catch((reason) => {
        if (active) setError(errorText(reason));
      });
    return () => {
      active = false;
      current?.stop();
      clearImages(boardId);
    };
  }, [boardId, user.id, attempt]);
  if (error)
    return (
      <main className="loading-screen">
        <ErrorNotice message={error} />
        <button
          className="primary-button"
          onClick={() => {
            setError('');
            setAttempt((value) => value + 1);
          }}
        >
          {t('common.retry')}
        </button>
        <button className="text-button" onClick={onBack}>
          {t('board.back')}
        </button>
      </main>
    );
  if (!board || !connection)
    return (
      <main className="loading-screen" role="status">
        {t('common.loading')}
      </main>
    );
  return (
    <BoardSession
      board={board}
      connection={connection}
      onBack={onBack}
      onRename={(title) => setBoard({ ...board, title })}
    />
  );
}
