import { useState } from 'react';
import { api, okSchema } from '../lib/api';
import { t } from '../lib/content';
import { useTask } from '../lib/useTask';
import { ErrorNotice, Modal } from './ui';
export function CompactBoard({ boardId, onDone }: { boardId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useTask();
  return (
    <>
      <button type="button" className="secondary-button full-width" onClick={() => setOpen(true)}>
        {t('history.compact')}
      </button>
      {open && (
        <Modal title={t('history.compact')} onClose={() => setOpen(false)}>
          <p>{t('history.compactHelp')}</p>
          <ErrorNotice message={error} />
          <button
            className="primary-button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await api(`boards/${boardId}/compact`, okSchema, 'POST');
                setOpen(false);
                onDone();
              })
            }
          >
            {t('history.compact')}
          </button>
        </Modal>
      )}
    </>
  );
}
