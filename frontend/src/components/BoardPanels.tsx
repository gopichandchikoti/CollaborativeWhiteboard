import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Check, RotateCcw, X } from 'lucide-react';
import { BoardItem } from '../types/board';
import { api, okSchema } from '../lib/api';
import { canEdit, commentSchema, historySchema, Role } from '../lib/contracts';
import { dateText, errorText, t } from '../lib/content';
import { useTask } from '../lib/useTask';
import { ErrorNotice, IconButton, Modal } from './ui';

export type Panel = 'objects' | 'comments' | 'history';
interface PanelProps {
  panel: Panel;
  boardId: string;
  role: Role;
  items: BoardItem[];
  onClose: () => void;
  onSelect: (id: string) => void;
}
export function BoardPanel(props: PanelProps) {
  return (
    <aside className="board-panel" aria-label={t(`board.${props.panel}`)}>
      <div className="panel-heading">
        <h2>{t(`board.${props.panel}`)}</h2>
        <IconButton label={t('common.close')} onClick={props.onClose}>
          <X size={18} />
        </IconButton>
      </div>
      {props.panel === 'objects' ? (
        <ObjectsPanel items={props.items} onSelect={props.onSelect} />
      ) : (
        <RemotePanel key={`${props.boardId}:${props.panel}`} {...props} />
      )}
    </aside>
  );
}
function ObjectsPanel({ items, onSelect }: { items: BoardItem[]; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const visible = items.filter((item) =>
    `${t(`tool.${item.type}`)} ${item.text ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <input
        aria-label={t('objects.search')}
        placeholder={t('objects.search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="object-list">
        {visible.map((item) => (
          <li key={item.id}>
            <button
              aria-label={t('objects.select', { name: item.text || t(`tool.${item.type}`) })}
              onClick={() => onSelect(item.id)}
            >
              <span className="object-swatch" style={{ background: item.fillColor ?? item.color }} />
              <span>{item.text || t(`tool.${item.type}`)}</span>
            </button>
          </li>
        ))}
      </ul>
      {!visible.length && <p className="small-copy">{t('objects.empty')}</p>}
    </>
  );
}
function RemotePanel({ panel, boardId, role }: PanelProps) {
  const [comments, setComments] = useState<z.infer<typeof commentSchema>[]>([]);
  const [history, setHistory] = useState<z.infer<typeof historySchema>[]>([]);
  const [text, setText] = useState('');
  const [loadError, setLoadError] = useState('');
  const [restore, setRestore] = useState<string | null>(null);
  const { pending, error, run } = useTask();
  const refresh = useCallback(async () => {
    if (panel === 'comments') setComments(await api(`boards/${boardId}/comments`, z.array(commentSchema)));
    else setHistory(await api(`boards/${boardId}/history`, z.array(historySchema)));
  }, [panel, boardId]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        await refresh();
        if (active) setLoadError('');
      } catch (reason) {
        if (active) setLoadError(errorText(reason));
      }
      if (active)
        timer = setTimeout(() => {
          void poll();
        }, 5000);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [refresh]);
  function submit() {
    run(async () => {
      await api(
        `boards/${boardId}/${panel}`,
        okSchema,
        'POST',
        panel === 'comments'
          ? { text }
          : { title: text.trim() || t('history.default', { date: dateText(new Date().toISOString()) }) },
      );
      setText('');
      await refresh();
    });
  }
  const writable = panel === 'comments' ? role !== 'viewer' : canEdit(role);
  return (
    <>
      <ErrorNotice message={error || loadError} />
      {writable && <PanelForm panel={panel} text={text} setText={setText} pending={pending} submit={submit} />}
      {panel === 'comments' ? (
        <>
          {!comments.length && <p className="small-copy">{t('comments.empty')}</p>}
          {comments.map((comment) => (
            <article className={`comment ${comment.resolved ? 'resolved' : ''}`} key={comment.id}>
              <div>
                <strong>{comment.name}</strong>
                <span className="small-copy">{dateText(comment.createdAt)}</span>
              </div>
              <p>{comment.text}</p>
              {!!comment.resolved && <span className="small-copy">{t('comments.resolved')}</span>}
              {!comment.resolved && canEdit(role) && (
                <button
                  className="text-button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      await api(`boards/${boardId}/comments/${comment.id}`, okSchema, 'DELETE');
                      await refresh();
                    })
                  }
                >
                  <Check size={15} />
                  {t('comments.resolve')}
                </button>
              )}
            </article>
          ))}
        </>
      ) : (
        <>
          {!history.length && <p className="small-copy">{t('history.empty')}</p>}
          {history.map((entry) => (
            <article className="history-entry" key={entry.id}>
              <div>
                <strong>{entry.title}</strong>
                <span className="small-copy">{dateText(entry.createdAt)}</span>
              </div>
              {role === 'owner' && (
                <IconButton label={t('history.restore')} onClick={() => setRestore(entry.id)}>
                  <RotateCcw size={17} />
                </IconButton>
              )}
            </article>
          ))}
        </>
      )}
      {restore && (
        <Modal title={t('history.restore')} onClose={() => setRestore(null)}>
          <p>{t('common.confirmRestore')}</p>
          <button
            className="danger-button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await api(`boards/${boardId}/history/${restore}/restore`, okSchema, 'POST');
                setRestore(null);
              })
            }
          >
            {t('history.restore')}
          </button>
        </Modal>
      )}
    </>
  );
}

function PanelForm({
  panel,
  text,
  setText,
  pending,
  submit,
}: {
  panel: Panel;
  text: string;
  setText: (text: string) => void;
  pending: boolean;
  submit: () => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label>
        {t(panel === 'comments' ? 'comments.text' : 'common.name')}
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={panel === 'comments' ? 2000 : 100}
          required={panel === 'comments'}
          rows={panel === 'comments' ? 3 : 1}
        />
      </label>
      <button className="primary-button full-width" disabled={pending}>
        {t(panel === 'comments' ? 'comments.post' : 'history.save')}
      </button>
    </form>
  );
}
