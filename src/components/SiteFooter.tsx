import { GitFork } from 'lucide-react';
import { useLang } from '../contexts/LanguageContext';
import styles from './SiteFooter.module.css';

/**
 * Small site footer — only shown on the public landing page. For
 * signed-in pages the topbar already carries the sign-out, so a
 * footer would just be visual noise. Renders GitHub link + project
 * tagline + a tiny copyright line. Wrapped in a <footer> element so
 * assistive tech can jump to it; the inner <nav> groups the links
 * for the same reason.
 */
export function SiteFooter() {
  const { t } = useLang();
  return (
    <footer className={styles.footer}>
      <nav aria-label={t('footer.aria')} className={styles.inner}>
        <a
          className={styles.link}
          href="https://github.com/aa-blinov/qazaq-anki"
          target="_blank"
          rel="noopener noreferrer"
        >
          <GitFork size={14} aria-hidden="true" />
          {t('footer.github')}
        </a>
        <span className={styles.copy}>
          © {new Date().getFullYear()} · {t('brand.name')}
        </span>
      </nav>
    </footer>
  );
}