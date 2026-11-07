import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Copy, Link, UserMinus } from 'lucide-react';
import { api, okSchema } from '../lib/api';
import { memberSchema } from '../lib/contracts';
import { t } from '../lib/content';
import { useTask } from '../lib/useTask';
import { ErrorNotice, IconButton, Modal } from './ui';

export function ShareDialog({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const [role, setRole] = useState('editor');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [members, setMembers] = useState<z.infer<typeof memberSchema>[]>([]);
  const { pending, error, run } = useTask();
  const refresh = useCallback(async () => {
    setMembers(await api(`boards/${boardId}/members`, z.array(memberSchema)));
  }, [boardId]);
  useEffect(() => {
    run(refresh);
  }, [refresh, run]);
  return (
    <Modal title={t('share.title')} onClose={onClose}>
      <p className="muted">{t('share.description')}</p>
      <label>
        {t('share.role')}
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          {(['editor', 'commenter', 'viewer'] as const).map((value) => (
            <option key={value} value={value}>
              {t(`role.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <button
        className="primary-button full-width"
        disabled={pending}
        onClick={() =>
          run(async () => {
            const invite = await api(
              `boards/${boardId}/invites`,
              z.object({ token: z.string(), expiresAt: z.string() }),
              'POST',
              { role },
            );
            setLink(`${location.origin}/#invite=${invite.token}`);
            setCopied(false);
          })
        }
      >
        <Link size={18} />
        {t('share.create')}
      </button>
      {link && (
        <div className="copy-link">
          <input aria-label={t('share.link')} value={link} readOnly onFocus={(event) => event.target.select()} />
          <IconButton
            label={t(copied ? 'share.copied' : 'share.copy')}
            onClick={() =>
              run(async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              })
            }
          >
            <Copy size={18} />
          </IconButton>
        </div>
      )}
      <h3>{t('share.members')}</h3>
      {!members.length && <p className="small-copy">{t('share.noMembers')}</p>}
      {members.map((member) => (
        <div className="member-row" key={member.id}>
          <span className="avatar">{member.name.slice(0, 1)}</span>
          <div className="member-name">
            <strong>{member.name}</strong>
            <span className="small-copy">{member.email}</span>
          </div>
          <select
            aria-label={`${t('share.role')} ${member.name}`}
            value={member.role}
            disabled={pending}
            onChange={(event) => {
              const value = event.target.value;
              run(async () => {
                await api(`boards/${boardId}/members/${member.id}`, okSchema, 'POST', { role: value });
                await refresh();
              });
            }}
          >
            {(['editor', 'commenter', 'viewer'] as const).map((value) => (
              <option key={value} value={value}>
                {t(`role.${value}`)}
              </option>
            ))}
          </select>
          <IconButton
            label={t('share.revoke', { name: member.name })}
            disabled={pending}
            onClick={() =>
              run(async () => {
                await api(`boards/${boardId}/members/${member.id}`, okSchema, 'DELETE');
                await refresh();
              })
            }
          >
            <UserMinus size={17} />
          </IconButton>
        </div>
      ))}
      <ErrorNotice message={error} />
    </Modal>
  );
}
