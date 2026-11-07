import { FormEvent, useState } from 'react';
import { ArrowUpRight, Layers3 } from 'lucide-react';
import { api } from '../lib/api';
import { User, userSchema } from '../lib/contracts';
import { errorText, t } from '../lib/content';
import { ErrorNotice } from './ui';

export function AuthScreen({ onUser, invitation }: { onUser: (user: User) => void; invitation: boolean }) {
  const [register, setRegister] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      const user = await api(`auth/${register ? 'register' : 'login'}`, userSchema, 'POST', {
        name: register ? data.get('name') : undefined,
        email: data.get('email'),
        password: data.get('password'),
      });
      onUser(user);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="auth-screen">
      <section className="auth-story">
        <a className="brand" href="/">
          <Layers3 size={25} />
          {t('app.name')}
        </a>
        <div>
          <span className="eyebrow">{t('auth.local')}</span>
          <h1>{t('auth.welcome')}</h1>
          <p>{t('auth.description')}</p>
          <div className="paper-illustration" aria-hidden="true">
            <span />
            <span />
            <span />
            <i />
            <i />
          </div>
        </div>
        <p className="small-copy">{t('app.tagline')}</p>
      </section>
      <section className="auth-form-wrap">
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          className="auth-form"
        >
          <h2>{t(register ? 'auth.register' : 'auth.signIn')}</h2>
          <p className="muted">{t('app.description')}</p>
          {invitation && <p className="info-notice">{t('share.pending')}</p>}
          {register && (
            <label>
              {t('auth.name')}
              <input name="name" autoComplete="name" required maxLength={60} />
            </label>
          )}
          <label>
            {t('auth.email')}
            <input name="email" type="email" autoComplete="email" required maxLength={254} />
          </label>
          <label>
            {t('auth.password')}
            <input
              name="password"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              required
              minLength={register ? 15 : 12}
              maxLength={128}
              aria-describedby="password-help"
            />
          </label>
          <p id="password-help" className="small-copy">
            {t('auth.passwordHelp', { minimum: register ? 15 : 12 })}
          </p>
          <ErrorNotice message={error} />
          <button className="primary-button" disabled={pending}>
            {t(pending ? 'common.working' : register ? 'auth.register' : 'auth.signIn')}
            <ArrowUpRight size={18} />
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setRegister(!register);
              setError('');
            }}
          >
            {t(register ? 'auth.signIn' : 'auth.register')}
          </button>
        </form>
      </section>
    </main>
  );
}
