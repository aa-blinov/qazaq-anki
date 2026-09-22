import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { useLang } from '../contexts/LanguageContext';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort error boundary. Catches uncaught render errors
 * anywhere in the tree (e.g. a card object coming back from the
 * server missing a required field) and shows a recovery panel
 * instead of an empty white screen.
 *
 * We deliberately keep this thin:
 *   - Shows the error message in dev, a generic one in prod.
 *   - Offers "Reload the page" + "Back to home" as recovery.
 *   - Logs to console so the user can copy it for a bug report.
 *
 * React's `componentDidCatch` is the only place we get the
 * error object — there's no `useErrorBoundary` hook equivalent
 * for catching render-phase errors in function components.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to the console so a developer (or the user, when
    // filing a bug) can see the full stack and the React
    // component stack. We don't push to an external service —
    // this is a self-hosted app with no telemetry by design.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorPanel error={this.state.error} onReset={this.reset} />;
  }
}

/**
 * Shown by ErrorBoundary once it catches an error. Lives in
 * its own component so it can pull i18n via useLang() — hooks
 * aren't available inside class component render() output,
 * but a function component re-renders fine after the
 * boundary's state flip.
 */
function ErrorPanel({ error, onReset }: { error: Error; onReset: () => void }) {
  const { t } = useLang();
  // Show the real message in dev (so a developer can see it
  // at a glance). In prod we hide it — a raw Error.message can
  // leak server paths / SQL fragments depending on the bug.
  const isDev = import.meta.env.DEV;
  return (
    <div className={styles.wrap} role="alert">
      <div className={styles.panel}>
        <div className={styles.icon} aria-hidden="true">
          <AlertTriangle size={28} strokeWidth={1.6} />
        </div>
        <h1 className={styles.title}>{t('error.boundary.title')}</h1>
        <p className={styles.body}>{t('error.boundary.body')}</p>
        {isDev && error.message ? (
          <pre className={styles.detail}>{error.message}</pre>
        ) : null}
        <div className={styles.actions}>
          <button type="button" className="btn btn--ghost" onClick={onReset}>
            <RotateCcw size={14} aria-hidden="true" />
            {t('error.boundary.retry')}
          </button>
          <a href="/" className="btn">
            <Home size={14} aria-hidden="true" />
            {t('error.boundary.home')}
          </a>
        </div>
      </div>
    </div>
  );
}
