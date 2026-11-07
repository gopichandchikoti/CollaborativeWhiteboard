import { Dispatch, SetStateAction } from 'react';
import { t } from '../lib/content';
import { ErrorNotice, Modal } from './ui';
export type LibraryEdit = { type: 'board' | 'workspace'; id?: string; title: string; remove?: boolean };
interface Props {
  edit: LibraryEdit;
  setEdit: Dispatch<SetStateAction<LibraryEdit | null>>;
  error: string;
  pending: boolean;
  save: () => Promise<void>;
}
export function LibraryDialog({ edit, setEdit, error, pending, save }: Props) {
  return (
    <Modal
      title={t(
        edit.remove
          ? 'common.delete'
          : edit.id
            ? 'common.rename'
            : edit.type === 'board'
              ? 'library.newBoard'
              : 'library.newWorkspace',
      )}
      onClose={() => setEdit(null)}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {edit.remove ? (
          <p>{t('common.confirmDelete', { name: edit.title })}</p>
        ) : (
          <label>
            {t('common.name')}
            <input
              autoFocus
              required
              maxLength={100}
              value={edit.title}
              onChange={(event) => setEdit({ ...edit, title: event.target.value })}
            />
          </label>
        )}
        <ErrorNotice message={error} />
        <div className="modal-actions">
          {edit.id && !edit.remove && (
            <button type="button" className="danger text-button" onClick={() => setEdit({ ...edit, remove: true })}>
              {t('common.delete')}
            </button>
          )}
          <button type="button" className="secondary-button" onClick={() => setEdit(null)}>
            {t('common.cancel')}
          </button>
          <button className={edit.remove ? 'danger-button' : 'primary-button'} disabled={pending}>
            {t(pending ? 'common.working' : edit.remove ? 'common.delete' : 'common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
