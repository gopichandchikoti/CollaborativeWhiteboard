import { useState } from 'react';
import { Download, LayoutTemplate, Trash2 } from 'lucide-react';
import { Board } from '../lib/contracts';
import { api, okSchema } from '../lib/api';
import { t } from '../lib/content';
import { exportBoard } from '../lib/exports';
import { useTask } from '../lib/useTask';
import { ErrorNotice, Modal } from './ui';
import { CompactBoard } from './CompactBoard';

export type Menu = 'share' | 'export' | 'settings' | 'help' | 'templates';
interface MenuProps {
  menu: Exclude<Menu, 'share'>;
  board: Board;
  onClose: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  onTemplate: (type: 'retro' | 'flow') => void;
  saved: boolean;
}
export function BoardMenu(props: MenuProps) {
  const { menu, board, onClose, onDelete, onRename, onTemplate, saved } = props;
  const [title, setTitle] = useState(board.title);
  const [remove, setRemove] = useState(false);
  const { pending, error, run } = useTask();
  const heading = {
    settings: 'board.settings',
    templates: 'template.title',
    help: 'board.help',
    export: 'board.export',
  } as const;
  return (
    <Modal title={t(heading[menu])} onClose={onClose}>
      {menu === 'export' && (
        <>
          <p className="muted">{t('export.description')}</p>
          {(['png', 'svg'] as const).map((format) => (
            <button
              key={format}
              className="secondary-button full-width"
              disabled={pending || !saved}
              onClick={() =>
                run(async () => {
                  await exportBoard(board.id, board.title, format);
                })
              }
            >
              <Download size={18} />
              {t(`export.${format}`)}
            </button>
          ))}
        </>
      )}
      {menu === 'help' && <p className="shortcut-copy">{t('board.shortcuts')}</p>}
      {menu === 'templates' && (
        <div className="template-options">
          {(['retro', 'flow'] as const).map((type) => (
            <button
              className="template-button"
              key={type}
              onClick={() => {
                onTemplate(type);
                onClose();
              }}
            >
              <LayoutTemplate size={24} />
              {t(`template.${type}`)}
            </button>
          ))}
        </div>
      )}
      {menu === 'settings' && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              if (remove) {
                await api(`boards/${board.id}`, okSchema, 'DELETE');
                onDelete();
              } else {
                await api(`boards/${board.id}`, okSchema, 'PATCH', { title });
                onRename(title);
                onClose();
              }
            });
          }}
        >
          {remove ? (
            <p>{t('common.confirmDelete', { name: board.title })}</p>
          ) : (
            <label>
              {t('common.name')}
              <input value={title} required maxLength={100} onChange={(event) => setTitle(event.target.value)} />
            </label>
          )}
          <div className="modal-actions">
            {!remove && (
              <button type="button" className="text-button danger" onClick={() => setRemove(true)}>
                <Trash2 size={16} />
                {t('common.delete')}
              </button>
            )}
            <button className={remove ? 'danger-button' : 'primary-button'} disabled={pending}>
              {t(remove ? 'common.delete' : 'common.save')}
            </button>
          </div>
        </form>
      )}
      {menu === 'settings' && <CompactBoard boardId={board.id} onDone={onClose} />}
      <ErrorNotice message={error} />
    </Modal>
  );
}
