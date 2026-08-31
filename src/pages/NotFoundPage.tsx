import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLang } from '../contexts/LanguageContext';

export function NotFoundPage() {
  const { t } = useLang();
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '80px 20px',
        maxWidth: 480,
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
      <Link to="/" className="btn">
        <ArrowLeft size={14} />
        {t('notFound.back')}
      </Link>
    </div>
  );
}
