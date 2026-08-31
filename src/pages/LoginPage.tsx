import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LanguageContext';
import { translateAuthError } from '../lib/authError';
import { api } from '../lib/api';
import { Logo } from '../components/Logo';
import styles from './Auth.module.css';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLang();
  const from = (location.state as { from?: string } | null)?.from || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Recovery flow is a sub-view inside the login panel — when
  // the user clicks "Forgot password" we hide the password field
  // and walk them through the two-step recovery flow.
  const [mode, setMode] = useState<'login' | 'recover-start' | 'recover-verify'>('login');

  if (user) return <Navigate to={from} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(translateAuthError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.panel}>
        <div className={styles.heading}>
          <div className={styles.mark}>
            <Logo size="lg" />
          </div>
          <h1>{t('auth.login.title')}</h1>
          <p className="muted">{t('auth.login.subtitle')}</p>
        </div>

        {mode === 'login' ? (
          <>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div>
                <label className="label" htmlFor="username">{t('auth.username')}</label>
                <input
                  id="username"
                  className="input"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('auth.placeholder.name')}
                />
              </div>

              <div>
                <label className="label" htmlFor="password">{t('auth.password')}</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.placeholder.password')}
                />
              </div>

              {error ? <div className={styles.error}>{error}</div> : null}

              <button type="submit" className="btn btn--lg" disabled={busy}>
                {busy ? '…' : t('auth.signIn')}
              </button>
            </form>

            <p className={styles.footer}>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => {
                  setError(null);
                  setMode('recover-start');
                }}
              >
                {t('auth.recover.link')}
              </button>
              {' · '}
              {t('auth.noAccount')}{' '}
              <Link to="/register">{t('auth.register')}</Link>
            </p>
          </>
        ) : mode === 'recover-start' ? (
          <RecoverStart
            initialUsername={username}
            onCancel={() => {
              setError(null);
              setMode('login');
            }}
            onSent={() => setMode('recover-verify')}
            t={t}
          />
        ) : (
          <RecoverVerify
            initialUsername={username}
            onCancel={() => {
              setError(null);
              setMode('login');
            }}
            onDone={() => {
              // After a successful reset, jump back to the login
              // form and let the user type the new password.
              setError(null);
              setPassword('');
              setMode('login');
            }}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

function RecoverStart({
  initialUsername,
  onCancel,
  onSent,
  t,
}: {
  initialUsername: string;
  onCancel: () => void;
  onSent: () => void;
  t: (k: string) => string;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.auth.recoverStart(username);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.form}>
      <p className={styles.hint}>{t('auth.recover.startHint')}</p>
      <div>
        <label className="label" htmlFor="recover-username">{t('auth.username')}</label>
        <input
          id="recover-username"
          className="input"
          type="text"
          autoComplete="username"
          autoFocus
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
      <div className={styles.formRow}>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          {t('auth.recover.cancel')}
        </button>
        <button type="submit" className="btn btn--lg" disabled={busy}>
          {busy ? '…' : t('auth.recover.sendCode')}
        </button>
      </div>
    </form>
  );
}

function RecoverVerify({
  initialUsername,
  onCancel,
  onDone,
  t,
}: {
  initialUsername: string;
  onCancel: () => void;
  onDone: () => void;
  t: (k: string) => string;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.auth.recoverVerify(username, code, newPassword);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.form}>
      <p className={styles.hint}>{t('auth.recover.verifyHint')}</p>
      <div>
        <label className="label" htmlFor="verify-username">{t('auth.username')}</label>
        <input
          id="verify-username"
          className="input"
          type="text"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor="verify-code">{t('auth.recover.codeLabel')}</label>
        <input
          id="verify-code"
          className="input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]{6}"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
      </div>
      <div>
        <label className="label" htmlFor="verify-password">{t('auth.recover.newPassword')}</label>
        <input
          id="verify-password"
          className="input"
          type="password"
          autoComplete="new-password"
          minLength={4}
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
      <div className={styles.formRow}>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          {t('auth.recover.cancel')}
        </button>
        <button type="submit" className="btn btn--lg" disabled={busy}>
          {busy ? '…' : t('auth.recover.reset')}
        </button>
      </div>
    </form>
  );
}
