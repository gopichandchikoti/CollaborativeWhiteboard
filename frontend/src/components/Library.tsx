import { useState } from 'react';
import { ArrowUpRight, Layers3, LayoutGrid, LogOut, Plus, Search, Users, MoreHorizontal } from 'lucide-react';
import { api, okSchema } from '../lib/api';
import { Board, boardSchema, User, Workspace, workspaceSchema } from '../lib/contracts';
import { dateText, errorText, t } from '../lib/content';
import { ErrorNotice, IconButton } from './ui';
import { LibraryDialog, LibraryEdit } from './LibraryDialog';

interface LibraryProps {
  user: User;
  boards: Board[];
  workspaces: Workspace[];
  onOpen: (id: string) => void;
  onRefresh: () => Promise<void>;
  onLogout: () => void;
}
type Edit = LibraryEdit;
export function Library({ user, boards, workspaces, onOpen, onRefresh, onLogout }: LibraryProps) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const visible = boards.filter(
    (board) =>
      board.title.toLowerCase().includes(query.toLowerCase()) &&
      (filter === 'all' || (filter === 'shared' ? board.role !== 'owner' : board.workspaceId === filter)),
  );
  async function save() {
    if (!edit) return;
    setPending(true);
    setError('');
    try {
      const resource = edit.type === 'board' ? 'boards' : 'workspaces';
      if (edit.remove) await api(`${resource}/${edit.id}`, okSchema, 'DELETE');
      else if (edit.id) await api(`${resource}/${edit.id}`, okSchema, 'PATCH', { title: edit.title });
      else if (edit.type === 'workspace') await api(resource, workspaceSchema, 'POST', { title: edit.title });
      else {
        const workspaceId = workspaces.some((workspace) => workspace.id === filter) ? filter : workspaces[0]?.id;
        const board = await api(resource, boardSchema, 'POST', { title: edit.title, workspaceId });
        await onRefresh();
        setEdit(null);
        onOpen(board.id);
        return;
      }
      await onRefresh();
      setEdit(null);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="library">
      <aside className="library-sidebar">
        <a className="brand" href="/">
          <Layers3 size={24} />
          {t('app.shortName')}
        </a>
        <div className="workspace-label">
          <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{user.name}</strong>
            <span className="small-copy">{t('library.workspace')}</span>
          </div>
        </div>
        <nav aria-label={t('library.title')}>
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            <LayoutGrid size={18} />
            {t('library.all')}
            <span>{boards.length}</span>
          </button>
          <button className={filter === 'shared' ? 'active' : ''} onClick={() => setFilter('shared')}>
            <Users size={18} />
            {t('library.shared')}
          </button>
          <div className="sidebar-caption">
            {t('library.workspace')}
            <IconButton label={t('library.newWorkspace')} onClick={() => setEdit({ type: 'workspace', title: '' })}>
              <Plus size={16} />
            </IconButton>
          </div>
          {workspaces.map((workspace) => (
            <div className="workspace-row" key={workspace.id}>
              <button className={filter === workspace.id ? 'active' : ''} onClick={() => setFilter(workspace.id)}>
                <span className="workspace-dot" />
                {workspace.title}
              </button>
              <IconButton
                label={`${t('common.rename')} ${workspace.title}`}
                onClick={() => setEdit({ type: 'workspace', id: workspace.id, title: workspace.title })}
              >
                <MoreHorizontal size={16} />
              </IconButton>
            </div>
          ))}
        </nav>
        <button className="sign-out" onClick={onLogout}>
          <LogOut size={18} />
          {t('auth.signOut')}
        </button>
      </aside>
      <section className="library-content">
        <header className="library-top">
          <span className="small-copy">{t('app.name')}</span>
          <label className="search">
            <Search size={17} />
            <input
              aria-label={t('library.search')}
              placeholder={t('library.search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </header>
        <div className="library-heading">
          <div>
            <span className="eyebrow">{t('app.tagline')}</span>
            <h1>{t('library.title')}</h1>
            <p className="muted">{t('library.subtitle')}</p>
          </div>
          <button className="primary-button" onClick={() => setEdit({ type: 'board', title: t('library.untitled') })}>
            <Plus size={18} />
            {t('library.newBoard')}
          </button>
        </div>
        <ErrorNotice message={error} />
        <div className="board-grid">
          {visible.map((board, index) => (
            <article className="board-card" key={board.id}>
              <button
                className={`board-preview preview-${index % 3}`}
                aria-label={t('library.open', { name: board.title })}
                onClick={() => onOpen(board.id)}
              >
                <span className="mini-note" />
                <span className="mini-note" />
                <span className="mini-note" />
                <ArrowUpRight size={20} />
              </button>
              <div className="board-card-info">
                <button className="board-name" onClick={() => onOpen(board.id)}>
                  {board.title}
                </button>
                {board.role === 'owner' && (
                  <IconButton
                    label={`${t('board.settings')} ${board.title}`}
                    onClick={() => setEdit({ type: 'board', id: board.id, title: board.title })}
                  >
                    <MoreHorizontal size={19} />
                  </IconButton>
                )}
                <p>
                  {t('library.updated', { date: dateText(board.updatedAt) })}
                  <span>{t(`role.${board.role}`)}</span>
                </p>
              </div>
            </article>
          ))}
        </div>
        {!visible.length && (
          <div className="empty-library">
            <Layers3 size={40} />
            <h2>{t(query ? 'library.noResults' : 'library.empty')}</h2>
            <p>{t('library.emptyHelp')}</p>
          </div>
        )}
      </section>
      {edit && <LibraryDialog edit={edit} setEdit={setEdit} error={error} pending={pending} save={save} />}
    </main>
  );
}
