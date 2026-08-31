import { useEffect, useState } from 'react';
import { Check, Loader2, LogOut, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { useLang } from '../contexts/LanguageContext';
import { SCHEDULER_DEFAULTS } from '../lib/scheduler-config';
import {
  getTtsSpeed,
  setTtsSpeed,
  TTS_SPEED_OPTIONS,
  type TtsSpeed,
} from '../lib/tts-prefs';
import styles from './SettingsPage.module.css';

/**
 * User-facing settings. The page grew from a single
 * "Daily limits" card into a small control panel:
 *
 *  - Daily limits  — new cards / day, daily review goal
 *  - Audio         — TTS playback speed
 *  - Account       — change password, sign out
 *  - About         — short explainer on SM-2 + leeches
 *
 * Theme, font-size and contrast already live in the topbar;
 * adding them here would just duplicate controls. The "language
 * switcher" the audit suggested is intentionally absent — the
 * project is Russian-only by design (the user is a Kazakh
 * learner, Russian scaffolding is the whole point).
 */
export function SettingsPage() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useLang();
  const initial = user?.preferences ?? {};
  const [newPerDay, setNewPerDay] = useState<number>(
    typeof initial.newCardsPerDay === 'number'
      ? initial.newCardsPerDay
      : SCHEDULER_DEFAULTS.newCardsPerDay,
  );
  const [goalReviews, setGoalReviews] = useState<number>(
    typeof initial.dailyGoalReviews === 'number'
      ? initial.dailyGoalReviews
      : SCHEDULER_DEFAULTS.dailyGoalReviews,
  );
  const [saving, setSaving] = useState<'new' | 'goal' | null>(null);
  const [saved, setSaved] = useState<'new' | 'goal' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // TTS speed is stored in localStorage (not on the server) because
  // it's a presentation preference tied to the device's audio
  // setup, not the user's data. Initialise from storage; update
  // both storage and live `<audio>` elements via setTtsSpeed.
  const [ttsSpeed, setTtsSpeedState] = useState<TtsSpeed>(getTtsSpeed());
  const onSpeedChange = (next: TtsSpeed) => {
    setTtsSpeed(next);
    setTtsSpeedState(next);
  };

  // If the user record loads later (e.g. token refresh), seed the
  // controls with the latest values from the server.
  useEffect(() => {
    if (!user?.preferences) return;
    if (typeof user.preferences.newCardsPerDay === 'number') {
      setNewPerDay(user.preferences.newCardsPerDay);
    }
    if (typeof user.preferences.dailyGoalReviews === 'number') {
      setGoalReviews(user.preferences.dailyGoalReviews);
    }
  }, [user?.preferences]);

  // Reset the "saved" tick after a short delay so it doesn't linger.
  useEffect(() => {
    if (saved === null) return;
    const id = window.setTimeout(() => setSaved(null), 1500);
    return () => window.clearTimeout(id);
  }, [saved]);

  async function saveNewPerDay(next: number) {
    setSaving('new');
    setError(null);
    try {
      await api.preferences.set({ newCardsPerDay: next });
      setSaved('new');
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  async function saveGoalReviews(next: number) {
    setSaving('goal');
    setError(null);
    try {
      await api.preferences.set({ dailyGoalReviews: next });
      setSaved('goal');
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  // --- Change password ---
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState<
    | { kind: 'ok' | 'err'; text: string }
    | null
  >(null);
  const [pwFormKey, setPwFormKey] = useState(0); // bump to reset <input> values
  const MIN_PW = 8;

  async function submitChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMessage(null);
    if (newPw.length < MIN_PW) {
      setPwMessage({ kind: 'err', text: t('settings.account.passwordTooShort') });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMessage({ kind: 'err', text: t('settings.account.passwordMismatch') });
      return;
    }
    setPwSaving(true);
    try {
      await api.auth.changePassword(oldPw, newPw);
      setPwMessage({ kind: 'ok', text: t('settings.account.passwordChanged') });
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
      setPwFormKey((k) => k + 1);
    } catch (err) {
      setPwMessage({ kind: 'err', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setPwSaving(false);
    }
  }

  // --- Sign out (two-tap like the Reset progress button) ---
  const [confirmLogout, setConfirmLogout] = useState(false);
  async function doLogout() {
    try {
      await logout();
      navigate('/login');
    } catch {
      // Even if the server logout fails, the local token is
      // cleared by `logout()` in the auth context — navigate
      // away so the user lands on the login page.
      navigate('/login');
    }
  }

  return (
    <div className={styles.page}>
      <h1>{t('settings.title')}</h1>
      <p className={styles.lede}>{t('settings.lede')}</p>

      <section className={styles.card}>
        <h2>{t('settings.daily.title')}</h2>
        <p className={styles.hint}>{t('settings.daily.hint')}</p>

        <NumberStepper
          id="newPerDay"
          label={t('settings.daily.newLabel')}
          min={0}
          max={200}
          value={newPerDay}
          onChange={setNewPerDay}
          onCommit={saveNewPerDay}
          saving={saving === 'new'}
          saved={saved === 'new'}
          testId="settings-new-per-day"
        />

        <NumberStepper
          id="goalReviews"
          label={t('settings.daily.goalLabel')}
          min={1}
          max={500}
          value={goalReviews}
          onChange={setGoalReviews}
          onCommit={saveGoalReviews}
          saving={saving === 'goal'}
          saved={saved === 'goal'}
          testId="settings-daily-goal"
        />
      </section>

      <section className={styles.card}>
        <h2>{t('settings.audio.title')}</h2>
        <p className={styles.hint}>{t('settings.audio.hint')}</p>
        <div className={styles.row} data-testid="settings-tts-speed">
          <label className={styles.rowLabel}>{t('settings.audio.speedLabel')}</label>
          <div className={styles.speedGroup} role="radiogroup" aria-label={t('settings.audio.speedLabel')}>
            {TTS_SPEED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={ttsSpeed === opt.value}
                className={`${styles.speedBtn} ${ttsSpeed === opt.value ? styles.speedBtnActive : ''}`}
                onClick={() => onSpeedChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <h2>{t('settings.account.title')}</h2>
        {user ? (
          <p className={styles.accountName}>
            {t('settings.account.signedInAs', { name: user.username })}
          </p>
        ) : null}
        <p className={styles.hint}>{t('settings.account.hint')}</p>

        <form className={styles.pwForm} onSubmit={submitChangePassword} key={pwFormKey}>
          <label className={styles.pwField}>
            <span>{t('settings.account.passwordOld')}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              required
            />
          </label>
          <label className={styles.pwField}>
            <span>{t('settings.account.passwordNew')}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              required
              minLength={MIN_PW}
            />
          </label>
          <label className={styles.pwField}>
            <span>{t('settings.account.passwordConfirm')}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
              minLength={MIN_PW}
            />
          </label>
          {pwMessage ? (
            <p
              className={pwMessage.kind === 'ok' ? styles.pwOk : styles.pwErr}
              role={pwMessage.kind === 'err' ? 'alert' : 'status'}
            >
              {pwMessage.text}
            </p>
          ) : null}
          <button
            type="submit"
            className="btn btn--lg"
            disabled={pwSaving}
          >
            {pwSaving ? (
              <Loader2 size={16} className={styles.spinner} aria-hidden="true" />
            ) : (
              <KeyRound size={16} aria-hidden="true" />
            )}
            {t('settings.account.changePassword')}
          </button>
        </form>

        <div className={styles.logoutRow}>
          <button
            type="button"
            className={`btn ${confirmLogout ? 'btn--danger' : 'btn--ghost'}`}
            onClick={() => {
              if (confirmLogout) {
                void doLogout();
              } else {
                setConfirmLogout(true);
              }
            }}
            aria-label={t('settings.account.logout')}
          >
            <LogOut size={16} aria-hidden="true" />
            {confirmLogout ? t('settings.account.logoutConfirm') : t('settings.account.logout')}
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <h2>{t('settings.about.title')}</h2>
        <p className={styles.hint}>{t('settings.about.text')}</p>
        <ul className={styles.aboutList}>
          <li>
            <strong>{t('settings.about.sm2.label')}:</strong>{' '}
            {t('settings.about.sm2.text')}
          </li>
          <li>
            <strong>{t('settings.about.leech.label')}:</strong>{' '}
            {t('settings.about.leech.text')}
          </li>
        </ul>
      </section>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface NumberStepperProps {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
  onCommit: (n: number) => void | Promise<void>;
  saving: boolean;
  saved: boolean;
  testId?: string;
}

function NumberStepper({
  id,
  label,
  min,
  max,
  value,
  onChange,
  onCommit,
  saving,
  saved,
  testId,
}: NumberStepperProps) {
  const { t } = useLang();
  return (
    <div className={styles.row} data-testid={testId}>
      <label htmlFor={id} className={styles.rowLabel}>
        {label}
      </label>
      <div className={styles.control}>
        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => {
            const next = Math.max(min, value - 1);
            onChange(next);
            void onCommit(next);
          }}
          disabled={value <= min || saving}
          aria-label={t('settings.daily.decrement', { label })}
        >
          −
        </button>
        <input
          id={id}
          type="number"
          className={styles.numInput}
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              onChange(min);
              return;
            }
            const n = Number(raw);
            if (Number.isFinite(n)) {
              const clamped = Math.max(min, Math.min(max, Math.floor(n)));
              onChange(clamped);
            }
          }}
          onBlur={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) return;
            const clamped = Math.max(min, Math.min(max, Math.floor(n)));
            if (clamped !== value) {
              onChange(clamped);
              void onCommit(clamped);
            } else {
              // Re-commit even if unchanged so users can re-save
              // without fiddling the number (handy for "reset to
              // default" feeling).
              void onCommit(clamped);
            }
          }}
        />
        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => {
            const next = Math.min(max, value + 1);
            onChange(next);
            void onCommit(next);
          }}
          disabled={value >= max || saving}
          aria-label={t('settings.daily.increment', { label })}
        >
          +
        </button>
        {saving ? (
          <Loader2
            size={16}
            className={styles.spinner}
            aria-label={t('settings.saving')}
          />
        ) : saved ? (
          <Check
            size={16}
            className={styles.checkmark}
            aria-label={t('settings.saved')}
          />
        ) : null}
      </div>
    </div>
  );
}
