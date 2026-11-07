import { useState } from 'react';
import { ConnectionStatus } from '../lib/collaboration';
import { t } from '../lib/content';
import { useTask } from '../lib/useTask';
import { ErrorNotice, Modal } from './ui';

interface Props {
  status: ConnectionStatus;
  discard: () => Promise<void>;
  onDone: () => void;
}
export function BoardRecovery({ status, discard, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useTask();
  if (status !== 'error') return null;
  return (
    <>
      <button className="secondary-button recovery-action" onClick={() => setOpen(true)}>
        {t('board.recover')}
      </button>
      {open && (
        <Modal title={t('board.recover')} onClose={() => setOpen(false)}>
          <p>{t('board.recoverHelp')}</p>
          <ErrorNotice message={error} />
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </button>
            <button
              className="danger-button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await discard();
                  onDone();
                })
              }
            >
              {t('board.discardDraft')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
