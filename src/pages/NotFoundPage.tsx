import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, BarChart3, Play } from 'lucide-react';
import { useLang } from '../contexts/LanguageContext';

export function NotFoundPage() {
  const { t } = useLang();
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '56px 20px 80px',
        maxWidth: 520,
        margin: '0 auto',
      }}
    >
      <h1
        style={{
          fontSize: '2rem',
          marginBottom: 8,
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          letterSpacing: '-0.02em',
        }}
      >
        {t('notFound.title')}
      </h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        {t('notFound.body')}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
        <Link to="/" className="btn">
          <ArrowLeft size={14} />
          {t('notFound.back')}
        </Link>
      </div>
      {/* Helpful shortcuts — without these, a 404 is a dead end.
         * Show the three screens the user is most likely trying to
         * reach when they type a wrong URL. Same <Link> styling as
         * the rest of the app so the visual hierarchy stays flat. */}
      <p className="muted" style={{ fontSize: '0.82rem', marginBottom: 12 }}>
        {t('notFound.suggestionsLabel')}
      </p>
      <nav
        aria-label={t('notFound.suggestionsLabel')}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          justifyContent: 'center',
        }}
      >
        <Link to="/study/a1" className="btn btn--ghost btn--sm">
          <Play size={13} aria-hidden="true" />
          {t('notFound.suggestStudy')}
        </Link>
        <Link to="/browse" className="btn btn--ghost btn--sm">
          <BookOpen size={13} aria-hidden="true" />
          {t('notFound.suggestBrowse')}
        </Link>
        <Link to="/stats" className="btn btn--ghost btn--sm">
          <BarChart3 size={13} aria-hidden="true" />
          {t('notFound.suggestStats')}
        </Link>
      </nav>
    </div>
  );
}
