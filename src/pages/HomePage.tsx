import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  BookMarked,
  HeartHandshake,
  NotebookPen,
  ArrowRight,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useProgress } from '../contexts/ProgressContext';
import { useLang } from '../contexts/LanguageContext';
import { MiniHeatmap } from '../components/MiniHeatmap';
import { api } from '../lib/api';
import {
  LEVELS,
  getCardsByLevel,
  getCardCount,
  getTotalCards,
  loadLevel,
  preloadAllLevels,
  type Card,
  type Level,
} from '../data/decks';
import { isDue } from '../lib/sm2';
import { makeProgressKey, type ProgressMap } from '../lib/progress';
import styles from './HomePage.module.css';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function levelTitle(lvl: Level, t: TFn): string {
  return t(`level.tier.${lvl.tier}`);
}

function levelDescription(lvl: Level, t: TFn): string {
  // The standard CEFR can-do statement for this level. Falls back
  // to the tier name if the level id isn't a CEFR tier (defensive —
  // shouldn't happen in practice).
  return t(`level.standard.${lvl.id}`) || t(`level.tier.${lvl.tier}`);
}

export function HomePage() {
  const { user } = useAuth();
  const { progress } = useProgress();
  const { t } = useLang();

  if (!user) {
    return <LandingPage t={t} />;
  }

  return <Dashboard user={user} progress={progress} t={t} />;
}

type T = (key: string, vars?: Record<string, string | number>) => string;

/* ------------------------------ Landing ------------------------------ */

function LandingPage({ t }: { t: T }) {
  // The hero counts come from the actual level JSONs. The first
  // render shows the build-time hints in `decks.json` (via
  // `getCardCount` / `getTotalCards` fall-through), and re-renders
  // with the live counts once `preloadAllLevels` populates the
  // cache. Normally the two numbers match — the hint IS the live
  // count, just frozen at build time — so the re-render is a
  // safety net for the rare case where the on-disk JSON and the
  // hint have drifted apart (e.g. someone hand-edited a JSON
  // without re-running `unify-topics`).
  const [, force] = useState(0);
  useEffect(() => {
    let cancelled = false;
    preloadAllLevels()
      .then(() => {
        if (!cancelled) force((n) => n + 1);
      })
      .catch((err) => console.warn('[HomePage] preload failed:', err));
    return () => {
      cancelled = true;
    };
  }, []);
  const total = getTotalCards();
  return (
    <div className={styles.landing}>
      <section className={styles.hero}>
        <h1 className={styles.title}>{t('landing.title')}</h1>
        <p className={styles.lede}>
          {t('landing.lede', { count: total })}
        </p>
        <div className={styles.heroCta}>
          <Link to="/register" className="btn btn--lg">
            {t('landing.ctaPrimary')}
            <ArrowRight size={16} />
          </Link>
          <Link to="/login" className="btn btn--ghost btn--lg">
            {t('landing.ctaSecondary')}
          </Link>
        </div>
      </section>

      <section className={styles.features}>
        <Feature
          icon={Clock}
          title={t('landing.feature.pace.title')}
          body={t('landing.feature.pace.body')}
        />
        <Feature
          icon={BookMarked}
          title={t('landing.feature.curated.title')}
          body={t('landing.feature.curated.body')}
        />
        <Feature
          icon={HeartHandshake}
          title={t('landing.feature.nopressure.title')}
          body={t('landing.feature.nopressure.body')}
        />
        <Feature
          icon={NotebookPen}
          title={t('landing.feature.own.title')}
          body={t('landing.feature.own.body')}
        />
      </section>

      <section className={styles.preview}>
        <header className={styles.previewHead}>
          <h2>{t('landing.preview.title')}</h2>
          <p className="muted">{t('landing.preview.subtitle')}</p>
        </header>
        <div className={styles.levelList}>
          {LEVELS.map((lvl) => (
            <article key={lvl.id} className={styles.previewRow}>
              <span className={styles.levelBadge}>{lvl.name}</span>
              <div className={styles.previewBody}>
                <h3>{levelTitle(lvl, t)}</h3>
                <p className="muted">{levelDescription(lvl, t)}</p>
              </div>
              <span className={styles.previewCount}>
                {t('home.previewCount', { count: getCardCount(lvl.id) })}
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <article className={styles.feature}>
      <Icon size={18} strokeWidth={1.6} className={styles.featureIcon} />
      <h3>{title}</h3>
      <p className="muted">{body}</p>
    </article>
  );
}

/* ----------------------------- Dashboard ----------------------------- */

function Dashboard({
  user,
  progress,
  t,
}: {
  user: { displayName: string; username: string };
  progress: ProgressMap;
  t: T;
}) {
  // Same lazy-load concern as the Study page: `getCardsByLevel` is backed
  // by a cache that's only populated when the user opens a study session.
  // Eagerly hydrate all five levels on mount so the "X / N learned" bars
  // are correct from the first render even when the user signs in and
  // lands on the dashboard without ever opening a deck.
  const [loaded, setLoaded] = useState<Record<string, Card[]>>({});
  useEffect(() => {
    let cancelled = false;
    Promise.all(LEVELS.map((l) => loadLevel(l.id))).then((results) => {
      if (cancelled) return;
      const map: Record<string, Card[]> = {};
      LEVELS.forEach((l, i) => (map[l.id] = results[i]));
      setLoaded(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Mini activity heatmap data. We fetch from /api/activity
  // (SQL-side bucketing, much faster than walking the
  // in-memory reviewLog on Home) and fold the per-grade
  // buckets into a single per-day count. Skipping this on
  // brand-new accounts where there's no activity to show
  // — the section is gated on `heatmapDays.length > 0`
  // further down.
  const [heatmapDays, setHeatmapDays] = useState<
    Array<{ date: Date; key: string; reviews: number }>
  >([]);
  useEffect(() => {
    let cancelled = false;
    void api
      .activity(49)
      .then((res) => {
        if (cancelled) return;
        // Fold (day, grade) buckets → (day, total). The heatmap
        // doesn't care about the grade breakdown.
        const byDay = new Map<string, number>();
        for (const e of res.events) {
          byDay.set(e.day, (byDay.get(e.day) ?? 0) + e.n);
        }
        const out: Array<{ date: Date; key: string; reviews: number }> = [];
        for (const [k, n] of byDay) {
          out.push({
            date: new Date(k + 'T00:00:00'),
            key: k,
            reviews: n,
          });
        }
        setHeatmapDays(out);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[home] activity fetch failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Phase-based counts per level. Progress is unified per card,
  // so a card has at most one schedule.
  const stats = LEVELS.map((lvl) => {
    const cards = loaded[lvl.id] ?? getCardsByLevel(lvl.id);
    let newC = 0;
    let dueC = 0;
    let learnedC = 0;
    for (const c of cards) {
      const s = progress[makeProgressKey(c.id)];
      if (!s) {
        newC++;
        continue;
      }
      // Single schedule per card. Determine its phase.
      if (s.phase === 'new') {
        newC++;
        continue;
      }
      learnedC++;
      if (isDue(s)) dueC++;
    }
    const mastery = cards.length > 0 ? Math.round((learnedC / cards.length) * 100) : 0;
    return { ...lvl, new: newC, due: dueC, learned: learnedC, mastery };
  });

  const totalDue = stats.reduce((acc, l) => acc + l.due, 0);
  const totalNew = stats.reduce((acc, l) => acc + l.new, 0);
  const totalLearned = stats.reduce((acc, l) => acc + l.learned, 0);
  const reviewedAny = totalLearned > 0;

  return (
    <div className={styles.dashboard}>
      <section className={styles.welcomeCard}>
        <span className={styles.welcomeKicker}>
          <Sparkles size={14} strokeWidth={1.8} />
          {t('dashboard.welcome')}
        </span>
        <h1 className={styles.welcomeTitle}>
          {t('dashboard.greeting', { name: user.displayName })}
        </h1>
        <p className={styles.welcomeSub}>
          {totalDue > 0
            ? t('dashboard.subtitleDue', { count: totalDue })
            : totalNew > 0
              ? t('dashboard.subtitleNew', { count: totalNew })
              : reviewedAny
                ? t('dashboard.subtitleCaughtUp')
                : t('dashboard.subtitleEmpty')}
        </p>
        {/* Primary CTA: when there's at least one card the user
            could be reviewing right now, the welcome card has a
            single next-action button. We don't show it on the
            "caught up" state (the user has done their work for
            today — nagging them with another button would be
            counterproductive) or on the brand-new state (the
            level grid below already has clickable rows).
            Routes: /study (no param) for the cross-level due
            queue, /study/level/a1 for the per-level fallback. */}
        {totalDue + totalNew > 0 ? (
          <Link
            to={totalDue > 0 ? '/study' : '/study/level/a1'}
            className={styles.welcomeCta}
          >
            {reviewedAny
              ? t('dashboard.cta.resume')
              : t('dashboard.cta.start')}
            <ArrowRight size={16} />
          </Link>
        ) : null}
      </section>

      <section>
        <header className={styles.sectionHead}>
          <h2>{t('dashboard.levels.title')}</h2>
        </header>
        <div className={styles.levelsList}>
          {stats.map((lvl) => (
            <Link
              key={lvl.id}
              to={`/study/level/${lvl.id}`}
              className={styles.levelRow}
              aria-label={t('home.aria.study', { level: lvl.name })}
            >
              <span className={styles.levelBadge}>{lvl.name}</span>
              <div className={styles.levelBody}>
                <div className={styles.levelTop}>
                  <h3>{levelTitle(lvl, t)}</h3>
                  <span className={styles.dueTag}>
                    {lvl.due > 0
                      ? t('dashboard.status.due', { count: lvl.due })
                      : lvl.new > 0
                        ? t('dashboard.status.new', { count: lvl.new })
                        : t('dashboard.status.caughtUp')}
                  </span>
                </div>
                <p className="muted">{levelDescription(lvl, t)}</p>
                <div className={styles.progressRow}>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${lvl.mastery}%` }}
                    />
                  </div>
                  <span className={styles.progressMeta}>
                    {t('dashboard.learned', { learned: lvl.learned, total: getCardCount(lvl.id) })}
                  </span>
                </div>
              </div>
              <ArrowRight
                size={16}
                className={styles.chevron}
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      </section>

      {/* "All due" panel — explicit entry point for the
          cross-level due queue. The welcome card above already
          offers the same destination via its CTA, but a
          user landing on Home mid-session wants to know WHERE
          their due cards are clustered, not just THAT they
          exist. A per-level breakdown also doubles as a
          "where should I drill?" hint (the level with the
          biggest backlog is the obvious next target).

          Only renders when there's at least one due card AND
          they span more than one level — if all due cards
          are on a single level, the row in the levels list
          above already highlights that, and the panel would
          be visual duplication. */}
      {totalDue > 0 && stats.filter((l) => l.due > 0).length > 1 ? (
        <section className={styles.dueOverview}>
          <header className={styles.dueOverviewHead}>
            <h2 className={styles.dueOverviewTitle}>
              {t('dashboard.dueOverview.title', { count: totalDue })}
            </h2>
            <p className="muted">
              {t('dashboard.dueOverview.subtitle')}
            </p>
          </header>
          <ul className={styles.dueBreakdown}>
            {stats
              .filter((l) => l.due > 0)
              .map((l) => (
                <li key={l.id} className={styles.dueRow}>
                  <Link
                    to={`/study/level/${l.id}`}
                    className={styles.dueRowLink}
                  >
                    <span className={styles.dueRowLevel}>{l.name}</span>
                    <span className={styles.dueRowCount}>
                      {t('dashboard.dueOverview.dueCount', { count: l.due })}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
          <Link to="/study" className={styles.dueOverviewCta}>
            {t('dashboard.dueOverview.studyAll')}
            <ArrowRight size={16} />
          </Link>
        </section>
      ) : null}

      {/* Mini activity heatmap — 7 weeks of review activity,
          shown on Home so the user has a "have I been showing
          up?" signal without having to click through to
          Stats. The same SQL-backed data feeds the full 90-day
          heatmap on Stats, just sliced to the most recent
          window so the Home card doesn't grow a 700px-tall
          panel. We pull from /api/activity?days=49 (a touch
          more than 7×7 to give the bucketing a buffer) and
          fold by day, ignoring the per-grade breakdown. */}
      {heatmapDays.length > 0 ? (
        <section className={styles.heatmapSection}>
          <header className={styles.sectionHead}>
            <h2>{t('dashboard.activity.title')}</h2>
            <Link to="/stats" className={styles.heatmapLink}>
              {t('dashboard.activity.openStats')}
              <ArrowRight size={14} />
            </Link>
          </header>
          <MiniHeatmap days={heatmapDays} weeks={7} />
        </section>
      ) : null}
    </div>
  );
}
