import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LanguageContext';
import { translateAuthError } from '../lib/authError';
import { Logo } from '../components/Logo';
import styles from './Auth.module.css';

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLang();
  const from = (location.state as { from?: string } | null)?.from || '/';

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError(t('auth.errors.passwordMismatch'));
      return;
    }

    setBusy(true);
    try {
      await register(username, password, displayName || undefined);
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
          <h1>{t('auth.register.title')}</h1>
          <p className="muted">{t('auth.register.subtitle')}</p>
        </div>

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
              minLength={3}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('auth.placeholder.name')}
            />
          </div>

          <div>
            <label className="label" htmlFor="displayName">
              {t('auth.displayName')}
            </label>
            <input
              id="displayName"
              className="input"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('auth.placeholder.displayName')}
            />
          </div>

          <div>
            <label className="label" htmlFor="password">{t('auth.password')}</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              minLength={4}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.placeholder.password')}
            />
          </div>

          <div>
            <label className="label" htmlFor="confirm">{t('auth.confirmPassword')}</label>
            <input
              id="confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              minLength={4}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t('auth.placeholder.password')}
            />
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}

          <p className={styles.notice}>
            {t('auth.localNotice')}
          </p>

          <button type="submit" className="btn btn--lg" disabled={busy}>
            {busy ? '…' : t('auth.createAccount')}
          </button>
        </form>

        <p className={styles.footer}>
          {t('auth.haveAccount')} <Link to="/login">{t('auth.signIn')}</Link>
        </p>
      </div>
    </div>
  );
}
