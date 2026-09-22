import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Moon,
  Sun,
  LogOut,
  Info,
  ALargeSmall,
  Home,
  BookOpen,
  BarChart3,
  Settings,
} from 'lucide-react';
import { Logo } from './Logo';
import { OnboardingModal, tourScreenFromPath } from './OnboardingModal';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useFontSize } from '../contexts/FontSizeContext';
import { useLang } from '../contexts/LanguageContext';
import { useOnboarding } from '../contexts/OnboardingContext';
import styles from './Layout.module.css';

export function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { fontSize, cycle } = useFontSize();
  const { t } = useLang();
  const location = useLocation();
  // The current screen's tour id, or null if this page has no tour.
  const screen = tourScreenFromPath(location.pathname);
  // Tour "have I seen this?" lookup. The (i) button is for
  // re-opening the tour on demand — pointless to surface it
  // for a tour the user has already seen once, so we hide it
  // until they re-trigger from elsewhere (e.g. a "Help" link,
  // or by clearing onboardingSeen in dev tools). Returning
  // users get a quieter header.
  const { isSeen } = useOnboarding();
  // When the user clicks the (i) icon in the top bar, we open the tour
  // for the current screen regardless of whether they've seen it.
  const [forceTour, setForceTour] = useState(false);

  return (
    <div className={styles.shell}>
      {/* Skip-link — invisible until it receives keyboard focus,
          then snaps into the top-left so a keyboard / screen-reader
          user can jump past the topbar straight into <main>. The
          href matches the `id` on the <main> element below so the
          browser scrolls focus to it. */}
      <a href="#main-content" className="skip">
        {t('nav.skipToContent')}
      </a>

      <header className={styles.header}>
        <Link to="/" className={styles.brand} aria-label={t('nav.homeAria')}>
          <Logo />
        </Link>

        {user ? (
          <nav className={styles.nav} aria-label={t('nav.primary')}>
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
              }
              title={t('nav.home')}
            >
              <Home size={16} aria-hidden="true" className={styles.navLinkIcon} />
              <span className={styles.navLinkLabel}>{t('nav.home')}</span>
            </NavLink>
            <NavLink
              to="/browse"
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
              }
              title={t('nav.browse')}
            >
              <BookOpen size={16} aria-hidden="true" className={styles.navLinkIcon} />
              <span className={styles.navLinkLabel}>{t('nav.browse')}</span>
            </NavLink>
            <NavLink
              to="/stats"
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
              }
              title={t('nav.stats')}
            >
              <BarChart3 size={16} aria-hidden="true" className={styles.navLinkIcon} />
              <span className={styles.navLinkLabel}>{t('nav.stats')}</span>
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
              }
              title={t('nav.settings')}
            >
              <Settings size={16} aria-hidden="true" className={styles.navLinkIcon} />
              <span className={styles.navLinkLabel}>{t('nav.settings')}</span>
            </NavLink>
          </nav>
        ) : (
          <div className={styles.navPlaceholder} />
        )}

        <div className={styles.right}>
          {user && screen && !isSeen(screen) ? (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setForceTour(true)}
              title={t('topbar.tour.tooltip')}
              aria-label={t('topbar.tour.aria')}
            >
              <Info size={15} />
            </button>
          ) : null}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={cycle}
            // The Aa icon stays at one fixed size — it would feel
            // weird for the "make text bigger" control itself to
            // jump on every click. The current cycle is surfaced
            // to assistive tech and on hover via the translated
            // aria-label / title (e.g. "Размер шрифта: крупный").
            aria-label={t('nav.fontSize', { size: t(`nav.fontSize.${fontSize}`) })}
            title={t('nav.fontSize', { size: t(`nav.fontSize.${fontSize}`) })}
          >
            <ALargeSmall size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={toggle}
            aria-label={t('nav.toggleTheme', {
              next: theme === 'light'
                ? t('nav.toggleTheme.next.dark')
                : t('nav.toggleTheme.next.light'),
            })}
            title={t('nav.toggleTheme', {
              next: theme === 'light'
                ? t('nav.toggleTheme.next.dark')
                : t('nav.toggleTheme.next.light'),
            })}
          >
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          {user ? (
            <>
              <div
                className={styles.userBubble}
                title={user.displayName ? `${user.displayName} (@${user.username})` : `@${user.username}`}
              >
                <span className={styles.userName}>@{user.username}</span>
              </div>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={logout}
                title={t('nav.signOut')}
                aria-label={t('nav.signOut')}
              >
                <LogOut size={14} />
              </button>
            </>
          ) : location.pathname !== '/login' && location.pathname !== '/register' ? (
            <Link to="/login" className="btn btn--sm">
              {t('nav.signIn')}
            </Link>
          ) : null}
        </div>
      </header>

      <main className={styles.main} id="main-content" tabIndex={-1}>
        <Outlet />
      </main>

      {/* Per-screen onboarding modal. Renders null on screens that have
          no tour (Landing / Login / Register / 404) and is closed by
          default unless the user has never seen it for the current
          screen, or the (i) button in the top bar set forceTour. */}
      {user && screen ? (
        <OnboardingModal
          screen={screen}
          forceOpen={forceTour}
          onClose={() => setForceTour(false)}
        />
      ) : null}
    </div>
  );
}
