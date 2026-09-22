import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLang } from '../contexts/LanguageContext';
import { getAuthErrorCode, getAuthErrorField, translateAuthError } from '../lib/authError';
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
  const [fieldErrors, setFieldErrors] = useState<{
    username?: string;
    password?: string;
    confirm?: string;
  }>({});
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  // Clear one field's error as soon as the user edits it — same
  // pattern as LoginPage. The error must always reflect the
  // current value, not the last submitted one.
  function clearField(key: 'username' | 'password' | 'confirm') {
    if (fieldErrors[key]) {
      setFieldErrors((f) => ({ ...f, [key]: undefined }));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (password !== confirm) {
      // Client-side mismatch is the most common error on this
      // page — put it on the confirm field so the visual + the
      // aria link both target the same input.
      setFieldErrors({ confirm: t('auth.errors.passwordMismatch') });
      return;
    }

    setBusy(true);
    try {
      await register(username, password, displayName || undefined);
      navigate(from, { replace: true });
    } catch (err) {
      const code = getAuthErrorCode(err);
      const field = code ? getAuthErrorField(code) : null;
      const message = translateAuthError(err, t);
      if (field) {
        setFieldErrors({ [field]: message });
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.panel}>
        <div className={styles.heading}>
          <h1>{t('auth.register.title')}</h1>
          <p className="muted">{t('auth.register.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <div>
            <label className="label" htmlFor="username">{t('auth.username')}</label>
            <input
              id="username"
              className={`input ${fieldErrors.username ? 'input--error' : ''}`}
              type="text"
              autoComplete="username"
              autoFocus
              required
              minLength={3}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                clearField('username');
              }}
              placeholder={t('auth.placeholder.name')}
              aria-invalid={fieldErrors.username ? true : undefined}
              aria-describedby={fieldErrors.username ? 'reg-username-err' : undefined}
            />
            {fieldErrors.username ? (
              <p className={styles.fieldError} id="reg-username-err" role="alert">
                {fieldErrors.username}
              </p>
            ) : null}
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
              className={`input ${fieldErrors.password ? 'input--error' : ''}`}
              type="password"
              autoComplete="new-password"
              required
              minLength={4}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearField('password');
              }}
              placeholder={t('auth.placeholder.password')}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? 'reg-password-err' : undefined}
            />
            {fieldErrors.password ? (
              <p className={styles.fieldError} id="reg-password-err" role="alert">
                {fieldErrors.password}
              </p>
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="confirm">{t('auth.confirmPassword')}</label>
            <input
              id="confirm"
              className={`input ${fieldErrors.confirm ? 'input--error' : ''}`}
              type="password"
              autoComplete="new-password"
              required
              minLength={4}
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                clearField('confirm');
              }}
              placeholder={t('auth.placeholder.password')}
              aria-invalid={fieldErrors.confirm ? true : undefined}
              aria-describedby={fieldErrors.confirm ? 'reg-confirm-err' : undefined}
            />
            {fieldErrors.confirm ? (
              <p className={styles.fieldError} id="reg-confirm-err" role="alert">
                {fieldErrors.confirm}
              </p>
            ) : null}
          </div>

          {error ? (
            <div className={styles.error} role="alert">
              {error}
            </div>
          ) : null}

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
