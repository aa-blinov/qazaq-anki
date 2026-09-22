import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, ChevronDown, ChevronRight, Calendar, Download, Upload, X, AlertTriangle, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useProgress } from '../contexts/ProgressContext';
import { useLang } from '../contexts/LanguageContext';
import {
  LEVELS,
  getTotalCards,
  groupCardsByTopic,
  loadLevel,
  type Card,
  type Level,
} from '../data/decks';
import { SCHEDULE_CONFIG } from '../lib/sm2';
import {
  isCardSeen,
  isCardDue,
  seenCardIds,
  masteredCardCount,
} from '../lib/progress';
import { SCHEDULER_DEFAULTS } from '../lib/scheduler-config';
import { api } from '../lib/api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { pluralRu } from '../lib/plural-ru';
import {
  BackupError,
  backupFilename,
  parseBackup,
  serializeBackup,
  summarizeBackup,
  type BackupFile,
  type BackupSummary,
} from '../lib/backup';
import styles from './StatsPage.module.css';

type LoadedLevels = Record<string, Card[]>;

const DAY_MS = 86_400_000;
const ACTIVITY_WINDOW_DAYS = 30;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayKey(d: Date): string {
  // YYYY-MM-DD in local time. Avoids timezone surprises from toISOString.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface DayStat {
  date: Date;
  key: string;
  reviews: number;
  correct: number;
}

export function StatsPage() {
  const { user } = useAuth();
  const { progress, totalReviews, totalCorrect, totalLapses, reviewLog, reset } = useProgress();
  // Server-side aggregates: forecast (due in 7/30 days) and leech
  // count come from /api/stats. We don't recompute them client-
  // side because the SQL is faster and the response is small.
  const [serverStats, setServerStats] = useState<{
    due7: number;
    due30: number;
    leeches: number;
  } | null>(null);
  // Retention chart data: per-day accuracy over the last 30 days.
  // We pull from /api/retention because the SQL is much faster
  // than walking the in-memory reviewLog on every render.
  const [retention, setRetention] = useState<
    { day: string; n: number; correct: number; accuracy: number | null }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    if (!user) return () => {};
    api
      .stats()
      .then((s) => {
        if (cancelled) return;
        setServerStats({ due7: s.due7, due30: s.due30, leeches: s.leeches });
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[stats] server stats fetch failed:', err);
      });
    api
      .retention(30)
      .then((r) => {
        if (cancelled) return;
        setRetention(r.buckets);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[stats] retention fetch failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [user, totalLapses, reset]);
  const { t, tTopic } = useLang();
  const [confirmReset, setConfirmReset] = useState(false);
  const [loaded, setLoaded] = useState<LoadedLevels>({});
  // Confirmation modal for "Сбросить прогресс". Replaces the
  // two-tap gesture (which only changed the button label and
  // gave the user no idea of the scope). The modal shows the
  // exact count of cards that will be wiped plus the review
  // total, so the user can decide from real numbers.
  const [resetModalOpen, setResetModalOpen] = useState(false);
  // The Stats page used to be a single 3,600-px scroll: top KPIs,
  // forecast KPIs, 30-day bar, 90-day heatmap, retention chart,
  // leech list, ~60 topic cards, and the SM-2 parameters dump
  // (now collapsed). Split into three tabs so the user only sees
  // what they came for. Default to "Сводка" — the headline
  // numbers most users actually want.
  type StatsTab = 'overview' | 'activity' | 'topics';
  const [activeTab, setActiveTab] = useState<StatsTab>('overview');
  // Tab deep-link via ?tab=activity (etc.). Lets the leech KPI on
  // Сводка jump straight to the Активность tab where the leech
  // list actually lives. `replace` so the back button doesn't
  // dump the user into a tab history maze.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'activity' || tab === 'topics' || tab === 'overview') {
      setActiveTab(tab);
    }
  }, []);
  // Leech reset is a destructive per-card action — we want a
  // double-tap to confirm. The first click reveals the confirm
  // button, the second click actually wipes the card.
  const [resettingCardId, setResettingCardId] = useState<string | null>(null);
  // "Reset all leeches" — a destructive bulk action. Two-state
  // pattern: the first click reveals the confirm button, the
  // second click actually fires the request. This mirrors the
  // per-card reset pattern so the muscle memory transfers.
  const [resettingAllLeeches, setResettingAllLeeches] = useState(false);
  const handleLeechReset = async (cardId: string) => {
    try {
      await api.progress.reset(cardId);
      // Reload to pick up the wiped progress. We could surgically
      // remove the card from the in-memory map, but a full reload
      // is simpler and only happens once per reset.
      window.location.reload();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[stats] leech reset failed:', err);
    }
  };
  const handleResetAllLeeches = async () => {
    try {
      const result = await api.progress.resetLeeches();
      // eslint-disable-next-line no-console
      console.log('[stats] reset all leeches:', result);
      window.location.reload();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[stats] reset all leeches failed:', err);
      setResettingAllLeeches(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all(LEVELS.map((l) => loadLevel(l.id))).then((results) => {
      if (cancelled) return;
      const map: LoadedLevels = {};
      LEVELS.forEach((l, i) => (map[l.id] = results[i]));
      setLoaded(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Leech list: cards with `lapses >= 8` in either direction.
  // We look up the kazakh word and category from the loaded
  // levels so the user can see WHICH words are sticky. Reset
  // wipes the schedule for that card and the user sees it as
  // brand-new on the next Study session.
  const leechCards = useMemo(() => {
    const allLoaded: Card[] = Object.values(loaded).flat();
    if (allLoaded.length === 0) return [];
    const seen = new Set<string>();
    const out: Array<{
      cardId: string;
      card: Card | undefined;
      lapses: number;
    }> = [];
    // Progress is keyed by cardId (no `::direction`). One row per
    // card, so the seen-dedupe is a defensive nicety in case a
    // stale export with the old shape ever leaks through.
    for (const [k, s] of Object.entries(progress)) {
      if (typeof s.lapses !== 'number') continue;
      if (s.lapses < SCHEDULER_DEFAULTS.leechThreshold) continue;
      const cardId = k.includes('::') ? k.slice(0, k.lastIndexOf('::')) : k;
      if (seen.has(cardId)) continue;
      seen.add(cardId);
      const card = allLoaded.find((c) => c.id === cardId);
      out.push({ cardId, card, lapses: s.lapses });
    }
    out.sort((a, b) => b.lapses - a.lapses);
    return out;
  }, [progress, loaded]);

  const overall = useMemo(() => {
    // Per-card counts. Progress is now keyed by cardId only, so
    // `seenCardIds` / `masteredCardCount` agree one-to-one with
    // the keys of the progress map.
    const seenCount = seenCardIds(progress).size;
    const accuracy =
      totalReviews > 0
        ? Math.round((totalCorrect / totalReviews) * 100)
        : 0;
    const masteredCount = masteredCardCount(progress);
    return { seenCount, accuracy, masteredCount };
  }, [progress, totalReviews, totalCorrect]);

  // ---- Day-by-day stats ----
  // Buckets all review events into a per-day map, builds a rolling
  // 30-day window (today inclusive) and derives a streak counter
  // (consecutive days with ≥1 review, ending today or yesterday).
  const activity = useMemo(() => {
    const today = startOfDay(new Date());
    const byDay = new Map<string, { reviews: number; correct: number }>();
    for (const ev of reviewLog) {
      const d = startOfDay(new Date(ev.ts));
      const k = dayKey(d);
      const bucket = byDay.get(k) ?? { reviews: 0, correct: 0 };
      bucket.reviews += 1;
      if (ev.grade === 'good' || ev.grade === 'easy') bucket.correct += 1;
      byDay.set(k, bucket);
    }

    const days: DayStat[] = [];
    for (let i = ACTIVITY_WINDOW_DAYS - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY_MS);
      const k = dayKey(d);
      const bucket = byDay.get(k);
      days.push({
        date: d,
        key: k,
        reviews: bucket?.reviews ?? 0,
        correct: bucket?.correct ?? 0,
      });
    }

    // Streak: walk backwards from today; allow today to be 0 (user
    // hasn't studied yet today) but require yesterday to break the
    // chain.
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].reviews > 0) streak++;
      else if (i === days.length - 1) continue; // today can be empty
      else break;
    }

    // Best day: across the visible window (and the whole log if we
    // want — but keeping it limited keeps the message honest).
    let best = { date: days[0]?.date ?? today, reviews: 0 };
    for (const d of days) {
      if (d.reviews > best.reviews) best = { date: d.date, reviews: d.reviews };
    }
    const totalInWindow = days.reduce((acc, d) => acc + d.reviews, 0);
    const activeDays = days.filter((d) => d.reviews > 0).length;

    return { days, streak, best, totalInWindow, activeDays };
  }, [reviewLog]);

  const handleReset = () => {
    // Open the confirmation modal. The two-tap shortcut is gone —
    // it only changed the button label and the user had no idea
    // what they were about to delete. The modal shows the exact
    // count of cards + reviews that will be wiped, so the user
    // can decide from real numbers.
    setResetModalOpen(true);
  };

  const confirmResetNow = async () => {
    setResetModalOpen(false);
    await reset();
  };

  // Localised human error message for a `BackupError` thrown by
  // `parseBackup`. We translate by code (not by raw message) so the
  // UI can never accidentally render an internal error string.
  const backupErrorMessage = (err: BackupError): string => {
    switch (err.code) {
      case 'wrongFormat':
        return t('stats.data.importWrongFormat');
      case 'unsupportedVersion': {
        // Try to surface the version number from the file so the
        // user knows what to look for. Fall back to a generic
        // message if it isn't in the message text.
        const m = err.message.match(/v(\d+)/);
        return t('stats.data.importUnsupportedVersion', {
          version: m?.[1] ?? '?',
        });
      }
      case 'malformedJson':
      case 'missingField':
      case 'wrongType':
        return t('stats.data.importMalformed');
    }
  };

  // Export the user's full data (progress + log) as a structured
  // JSON file. The server's response is already in the canonical
  // `BackupFile` shape; we pass it through the serialiser so the
  // output is byte-identical to what the server emits (no
  // key-reordering, same indent, same field order).
  const handleExport = async () => {
    if (!user) return;
    try {
      const data = (await api.export.get()) as BackupFile;
      const blob = new Blob([serializeBackup(data)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFilename(user.username);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[stats] export failed:', err);
      alert(
        t('stats.data.importError', {
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  };

  // Two-stage import: (1) pick a file, validate it, show a
  // confirmation dialog with the file's contents; (2) on confirm,
  // push the parsed payload to the server. We never let raw text
  // reach the server — `parseBackup` is the contract enforcement
  // point.
  const [pendingImport, setPendingImport] = useState<{
    file: BackupFile;
    summary: BackupSummary;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const handleImport = () => {
    if (!user) return;
    setImportError(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      let text: string;
      try {
        text = await file.text();
      } catch (err) {
        setImportError(
          t('stats.data.importError', {
            reason: err instanceof Error ? err.message : String(err),
          }),
        );
        return;
      }
      try {
        const parsed = parseBackup(text);
        setPendingImport({
          file: parsed,
          summary: summarizeBackup(parsed, user.username),
        });
      } catch (err) {
        if (err instanceof BackupError) {
          setImportError(backupErrorMessage(err));
        } else {
          setImportError(
            t('stats.data.importError', {
              reason: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      }
    };
    input.click();
  };

  // Actually perform the import after the user confirms the
  // dialog. Reloads on success so the progress context re-pulls
  // the new state from the server.
  const confirmImport = async () => {
    if (!pendingImport) return;
    setImporting(true);
    try {
      const result = await api.export.send({
        progress: pendingImport.file.progress,
        reviewLog: pendingImport.file.reviewLog,
      });
      setPendingImport(null);
      setImporting(false);
      alert(
        t('stats.data.importSuccess', {
          cards: result.cards,
          events: result.events,
        }),
      );
      window.location.reload();
    } catch (err) {
      setImporting(false);
      setImportError(
        t('stats.data.importError', {
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  };

  const cancelImport = () => {
    setPendingImport(null);
    setImportError(null);
  };

  const topicGroups = useMemo(() => {
    type TopicRow = {
      level: Level;
      topic: string;
      total: number;
      learned: number;
      due: number;
    };
    const rows: TopicRow[] = [];
    for (const lvl of LEVELS) {
      const cards = loaded[lvl.id] ?? [];
      const groups = groupCardsByTopic(cards);
      for (const [topic, topicCards] of Object.entries(groups)) {
        // Per-card counts — a card is learned if EITHER direction
        // has a non-`new` schedule; due if EITHER direction is past
        // its due date. Same logic as the home dashboard and the
        // overall KPI tile at the top of the page.
        let learned = 0;
        let due = 0;
        for (const c of topicCards) {
          if (isCardSeen(c.id, progress)) learned++;
          if (isCardDue(c.id, progress)) due++;
        }
        rows.push({ level: lvl, topic, total: topicCards.length, learned, due });
      }
    }
    return rows;
  }, [loaded, progress]);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>{t('stats.title')}</h1>
          <p className="muted">
            {t('stats.signedInAs', { name: user?.username ?? '' })}
          </p>
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleExport}
            title={t('stats.data.export.tooltip')}
          >
            <Download size={14} />
            {t('stats.data.export')}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleImport}
            title={t('stats.data.import.tooltip')}
          >
            <Upload size={14} />
            {t('stats.data.import')}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleReset}
          >
            {t('stats.reset')}
          </button>
        </div>
      </header>

      <section className={styles.kpis}>
        <KPI
          label={t('stats.kpi.learned')}
          value={`${overall.seenCount} / ${getTotalCards().toLocaleString()}`}
          sub={t('stats.kpi.learnedSub', { percent: Math.round((overall.seenCount / getTotalCards()) * 100) })}
        />
        <KPI
          label={t('stats.kpi.reviews')}
          value={totalReviews.toLocaleString()}
          sub={t('stats.kpi.reviewsSub')}
        />
        <KPI
          label={t('stats.kpi.accuracy')}
          value={`${overall.accuracy}%`}
          sub={t('stats.kpi.accuracySub', { count: totalCorrect.toLocaleString() })}
        />
        <KPI
          label={t('stats.kpi.lapses')}
          value={totalLapses.toLocaleString()}
          sub={t('stats.kpi.lapsesSub')}
        />
      </section>

      {/* Forecast row — comes from /api/stats (SQL aggregate). The
          numbers are 7-day and 30-day windows for cards whose
          `due` timestamp falls in that range. "Leeches" is the
          same number the leech banner uses, so the user can
          see it without expanding that section. Hidden if the
          fetch hasn't resolved yet. */}
      {serverStats ? (
        <section className={styles.kpiRow}>
          <KPI
            label={t('stats.kpi.due7')}
            value={serverStats.due7.toLocaleString()}
            sub={t('stats.kpi.due7Sub')}
            // Due in the next 7 days lands at the cross-level
            // due queue, which is currently-due (a subset of
            // 7-day forecast). "Учить" is suppressed when the
            // number is 0 — clicking an empty KPI is just
            // friction. `to={null}` would be a cleaner signal
            // but KPI doesn't accept nullish today.
            to={serverStats.due7 > 0 ? '/study' : undefined}
          />
          <KPI
            label={t('stats.kpi.due30')}
            value={serverStats.due30.toLocaleString()}
            sub={t('stats.kpi.due30Sub')}
            to={serverStats.due30 > 0 ? '/study' : undefined}
          />
          <KPI
            label={t('stats.kpi.leeches')}
            value={serverStats.leeches.toLocaleString()}
            sub={t('stats.kpi.leechesSub')}
            // Leech list lives on the Активность tab; deep-link
            // there so the user lands next to the cards they
            // wanted to drill. No "study all leeches" filter
            // in the study queue yet — that would be a bigger
            // change, deferred.
            to={serverStats.leeches > 0 ? '/stats?tab=activity' : undefined}
          />
        </section>
      ) : null}

      {/* Tab bar — splits the rest of the page (activity + SM-2
          parameters + leech list + topic grid) into three
          focused views. The KPIs above stay always-on so the
          user can see the headline numbers regardless of which
          tab they have open. Default to "Сводка" so the first
          impression is the four big numbers + forecast, not
          the deep-dive activity charts. */}
      <div className={styles.tabBar} role="tablist" aria-label={t('stats.tab.overview')}>
        {(['overview', 'activity', 'topics'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-label={t(`stats.tab.${id}Aria`)}
            className={`${styles.tabButton} ${activeTab === id ? styles.tabButtonActive : ''}`}
            onClick={() => {
              setActiveTab(id);
              // Keep the URL in sync with the active tab so deep
              // links like /stats?tab=activity round-trip and so
              // the back button takes the user back to wherever
              // they came from. `replace` because tab switches
              // aren't a separate history entry.
              const url = new URL(window.location.href);
              if (id === 'overview') {
                url.searchParams.delete('tab');
              } else {
                url.searchParams.set('tab', id);
              }
              window.history.replaceState(null, '', url.toString());
            }}
          >
            {t(`stats.tab.${id}`)}
          </button>
        ))}
      </div>

      {/* Empty state for a brand-new account: the four KPIs above
          are all 0, the forecast row is 0/0/0, and the heatmap is
          an empty grid. Without an explicit hint the page looks
          broken. Show a single CTA pointing back to Home so the
          user can pick a level and start. Only renders on the
          Сводка tab and only when there's been no real activity
          yet (no reviews, no leeches, no due / new from
          /api/stats). Once any of those move off 0, the page
          reads as "low stats" and the empty card goes away. */}
      {activeTab === 'overview' &&
      totalReviews === 0 &&
      totalLapses === 0 &&
      (!serverStats || (serverStats.due7 + serverStats.due30 + serverStats.leeches === 0)) ? (
        <div className={styles.emptyCard} role="status">
          <p className={styles.emptyTitle}>{t('stats.empty.title')}</p>
          <p className={styles.emptyBody}>{t('stats.empty.body')}</p>
          <Link to="/" className={styles.emptyCta}>
            {t('stats.empty.cta')}
          </Link>
        </div>
      ) : null}

      {/* Overview tab gets its own 90-day heatmap + 30-day bar so
          the user has something to look at between the forecast
          row and the tab bar. The deeper charts (retention,
          SM-2 details, leech list) live in the Активность tab. */}
      {activeTab === 'overview' && totalReviews > 0 ? (
        <div className={styles.tabPanel} role="tabpanel">
          {/*
        Day-by-day activity — gives the user a real "have I been
        showing up?" signal. Three small KPIs (streak, best day, this
        window) plus a 30-day bar chart with today highlighted.
      */}
      <section className={styles.activityCard}>
        <header className={styles.activityHead}>
          <h2 className={styles.sectionTitle}>
            <Calendar size={18} strokeWidth={1.5} />
            {t('stats.activity.title')}
          </h2>
          <p className="muted">
            {t('stats.activity.subtitle', { days: ACTIVITY_WINDOW_DAYS })}
          </p>
        </header>

        <div className={styles.activityKpis}>
          <KPI
            label={t('stats.activity.streak')}
            value={t('stats.activity.streakValue', { count: activity.streak })}
            sub={
              activity.streak > 0
                ? t('stats.activity.streakSub')
                : t('stats.activity.streakSubZero')
            }
          />
          <KPI
            label={t('stats.activity.bestDay')}
            value={activity.best.reviews.toLocaleString()}
            sub={
              activity.best.reviews > 0
                ? t('stats.activity.bestDaySub', {
                    date: t('stats.activity.dateFormat', {
                      d: activity.best.date.getDate(),
                      m: t(`stats.activity.month.${activity.best.date.getMonth() + 1}`),
                    }),
                  })
                : t('stats.activity.bestDaySubZero')
            }
          />
          <KPI
            label={t('stats.activity.windowTotal')}
            value={activity.totalInWindow.toLocaleString()}
            sub={t('stats.activity.windowTotalSub', {
              count: activity.activeDays,
              active: activity.activeDays,
              total: ACTIVITY_WINDOW_DAYS,
            })}
          />
        </div>

        <ActivityChart days={activity.days} />
      </section>

      {/* 90-day heatmap. The bar chart above is good for spotting
          day-to-day trends; the heatmap is good for spotting
          "where have I been falling off?" patterns across weeks.
          Each square is one day, brighter = more reviews. */}
      <section className={styles.activityCard}>
        <header className={styles.activityHead}>
          <h2 className={styles.sectionTitle}>
            <Calendar size={18} strokeWidth={1.5} />
            {t('stats.heatmap.title')}
          </h2>
          <p className="muted">{t('stats.heatmap.subtitle')}</p>
        </header>
        <ActivityHeatmap days={activity.days} t={t} />
      </section>
        </div>
      ) : null}

      {activeTab === 'overview' ? null : (
        <div className={styles.tabPanel} role="tabpanel">
          {/*
        Day-by-day activity — gives the user a real "have I been
        showing up?" signal. Three small KPIs (streak, best day, this
        window) plus a 30-day bar chart with today highlighted.
      */}
      <section className={styles.activityCard}>
        <header className={styles.activityHead}>
          <h2 className={styles.sectionTitle}>
            <Calendar size={18} strokeWidth={1.5} />
            {t('stats.activity.title')}
          </h2>
          <p className="muted">
            {t('stats.activity.subtitle', { days: ACTIVITY_WINDOW_DAYS })}
          </p>
        </header>

        <div className={styles.activityKpis}>
          <KPI
            label={t('stats.activity.streak')}
            value={t('stats.activity.streakValue', { count: activity.streak })}
            sub={
              activity.streak > 0
                ? t('stats.activity.streakSub')
                : t('stats.activity.streakSubZero')
            }
          />
          <KPI
            label={t('stats.activity.bestDay')}
            value={activity.best.reviews.toLocaleString()}
            sub={
              activity.best.reviews > 0
                ? t('stats.activity.bestDaySub', {
                    date: t('stats.activity.dateFormat', {
                      d: activity.best.date.getDate(),
                      m: t(`stats.activity.month.${activity.best.date.getMonth() + 1}`),
                    }),
                  })
                : t('stats.activity.bestDaySubZero')
            }
          />
          <KPI
            label={t('stats.activity.windowTotal')}
            value={activity.totalInWindow.toLocaleString()}
            sub={t('stats.activity.windowTotalSub', {
              count: activity.activeDays,
              active: activity.activeDays,
              total: ACTIVITY_WINDOW_DAYS,
            })}
          />
        </div>

        <ActivityChart days={activity.days} />
      </section>

      {/* 90-day heatmap. The bar chart above is good for spotting
          day-to-day trends; the heatmap is good for spotting
          "where have I been falling off?" patterns across weeks.
          Each square is one day, brighter = more reviews. */}
      <section className={styles.activityCard}>
        <header className={styles.activityHead}>
          <h2 className={styles.sectionTitle}>
            <Calendar size={18} strokeWidth={1.5} />
            {t('stats.heatmap.title')}
          </h2>
          <p className="muted">{t('stats.heatmap.subtitle')}</p>
        </header>
        <ActivityHeatmap days={activity.days} t={t} />
      </section>

      {/* Retention chart — per-day accuracy. A reading of ~85% is
          the Anki-recommended sweet spot: high enough that the
          schedule is working, low enough that the intervals are
          pushing the user. Above 95% the user could afford to
          press Easy more often; below 80% the schedule is too
          aggressive. The data comes from /api/retention so the
          SQL does the bucketing. */}
      {/* Hide the retention chart when there are too few reviews
          to make the percentage meaningful. The Anki docs and
          our own copy flag < 80% as "schedule is too aggressive"
          — a label that's only honest once you have a real
          sample. With three reviews of 100% accuracy the chart
          would draw a flat 100% line at the top and the user
          would (rightly) wonder if the schedule is broken or
          the chart is broken. 10 is a soft threshold; below
          that we just don't show the section. */}
      {retention.reduce((acc, b) => acc + b.n, 0) >= 10 ? (
        <section className={styles.activityCard}>
          <header className={styles.activityHead}>
            <h2 className={styles.sectionTitle}>
              {t('stats.retention.title')}
            </h2>
            <p className="muted">{t('stats.retention.subtitle')}</p>
          </header>
          <RetentionChart buckets={retention} />
        </section>
      ) : null}

      <section className={styles.configCard}>
        {/* The scheduler config dumps eight internal SM-2 parameters
            (learning steps, graduating interval, fuzz, etc.) that
            are useful for nerds but useless — and intimidating — for
            someone who just wants to learn Kazakh. Collapse it by
            default behind a single "Show SM-2 parameters" toggle so
            the Stats page doesn't feel like an Anki config dump.
            Native <details> for accessibility + zero-JS toggle. */}
        <details>
          <summary className={styles.configSummary}>
            <span className={styles.configSummaryLabel}>
              {t('stats.config.toggle')}
            </span>
            <span className={styles.configSummaryHint} aria-hidden="true">
              <ChevronDown size={14} strokeWidth={1.75} />
            </span>
          </summary>
          <div className={styles.configBody}>
            <header>
              <h2 className={styles.configTitle}>{t('stats.config.title')}</h2>
              <p className="muted">{t('stats.config.subtitle')}</p>
            </header>
            <dl className={styles.configList}>
              <div className={styles.configItem}>
                <dt>{t('stats.config.learningSteps')}</dt>
                <dd>{SCHEDULE_CONFIG.learningStepsMin.map((m) => t('stats.config.minutes', { m })).join(' → ')}</dd>
              </div>
              <div className={styles.configItem}>
                <dt>{t('stats.config.graduatingInterval')}</dt>
                <dd>{t('stats.config.day', { n: SCHEDULE_CONFIG.graduatingIntervalDays })}</dd>
              </div>
              <div className={styles.configItem}>
                <dt>{t('stats.config.easyInterval')}</dt>
                <dd>{t('stats.config.days', { n: SCHEDULE_CONFIG.easyIntervalDays })}</dd>
              </div>
              <div className={styles.configItem}>
                <dt>{t('stats.config.relearningSteps')}</dt>
                <dd>{SCHEDULE_CONFIG.relearningStepsMin.map((m) => t('stats.config.minutes', { m })).join(' → ')}</dd>
              </div>
              <div className={styles.configItem}>
                <dt>{t('stats.config.hardMult')}</dt>
                <dd>{SCHEDULE_CONFIG.hardIntervalMultiplier}</dd>
              </div>
              <div className={styles.configItem}>
                <dt>{t('stats.config.easyBonus')}</dt>
                <dd>{SCHEDULE_CONFIG.easyBonus}</dd>
              </div>
              <div className={styles.configItem}>
                <dt>{t('stats.config.minMax')}</dt>
                <dd>{t('stats.config.minMaxValue', { min: SCHEDULE_CONFIG.minIntervalDays, max: SCHEDULE_CONFIG.maxIntervalDays })}</dd>
              </div>
              <div className={styles.configItem}>
                <dt>{t('stats.config.fuzz')}</dt>
                <dd>±{Math.round(SCHEDULE_CONFIG.fuzz * 100)}%</dd>
              </div>
            </dl>
          </div>
        </details>
      </section>

      {/* Leech list — cards the user keeps forgetting. Threshold
          matches the Anki default (8 lapses). One row per card
          with the kazakh word, the count, and a Reset button
          that wipes the schedule so the card comes back as
          brand-new. Hidden when there are no leeches. */}
      {leechCards.length > 0 ? (
        <section className={styles.leechCard}>
          <header className={styles.sectionHead}>
            <div className={styles.leechHeadText}>
              <h2 className={styles.sectionTitle}>
                <AlertTriangle size={18} strokeWidth={1.5} />
                {t('stats.leech.title')}
              </h2>
              <p className="muted">{t('stats.leech.subtitle', { count: leechCards.length })}</p>
            </div>
            {/* Bulk reset — visible when there's more than one
                leech, otherwise the per-row button is enough. Two-
                state confirm pattern, same as the per-row Reset. */}
            {leechCards.length > 1 ? (
              resettingAllLeeches ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--danger"
                  onClick={handleResetAllLeeches}
                  data-testid="reset-all-leeches-confirm"
                >
                  {t('stats.leech.confirmResetAll', { count: leechCards.length })}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setResettingAllLeeches(true)}
                  data-testid="reset-all-leeches"
                >
                  {t('stats.leech.resetAll')}
                </button>
              )
            ) : null}
          </header>
          <ul className={styles.leechList}>
            {leechCards.map(({ cardId, card, lapses }) => (
              <li key={cardId} className={styles.leechRow}>
                <div className={styles.leechWord}>
                  {card ? (
                    <>
                      <span className={styles.leechKk}>{card.kazakh}</span>
                      <span className={styles.leechRu}>
                        {card.translationRu || t('stats.leech.noTranslation')}
                      </span>
                    </>
                  ) : (
                    <span className={styles.leechKk}>{cardId}</span>
                  )}
                </div>
                <div className={styles.leechMeta}>
                  {t('stats.leech.lapses', { n: lapses })}
                </div>
                <div className={styles.leechActions}>
                  {resettingCardId === cardId ? (
                    <button
                      type="button"
                      className="btn btn--ghost btn--danger"
                      onClick={() => handleLeechReset(cardId)}
                    >
                      {t('stats.leech.confirmReset')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => setResettingCardId(cardId)}
                    >
                      {t('stats.leech.reset')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
        </div>
      )}

      {activeTab === 'topics' ? (
        <div className={styles.tabPanel} role="tabpanel">
      <section>
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>
            <Layers size={18} strokeWidth={1.5} />
            {t('stats.section.byTopic')}
          </h2>
          <p className="muted">
            {t('stats.section.byTopicSub', {
              // Derive the topic count from the freshly-loaded groups
              // rather than the static TOTAL_TOPICS — the global cache
              // is only primed after the first study session, so on a
              // cold visit this would otherwise render "0 тем на 5
              // уровнях".
              topics: topicGroups.length,
              levels: LEVELS.length,
            })}
          </p>
        </header>
        <TopicGroups groups={topicGroups} loaded={Object.keys(loaded).length > 0} t={t} tTopic={tTopic} />
      </section>
        </div>
      ) : null}

      {/*
        Import confirmation modal. Shown after the user picks a
        backup file and `parseBackup` accepts it. The dialog
        deliberately re-states the file's contents (username, date,
        card count) and the consequence ("replaces local data") so
        a wrong tap can't silently nuke progress.
      */}
      {pendingImport ? (
        <ImportConfirmDialog
          summary={pendingImport.summary}
          currentUsername={user?.username ?? null}
          importing={importing}
          onConfirm={confirmImport}
          onCancel={cancelImport}
          t={t}
        />
      ) : null}

      {importError ? (
        <div className={styles.toast} role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{importError}</span>
          <button
            type="button"
            className={styles.toastClose}
            onClick={() => setImportError(null)}
            aria-label="Закрыть"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {/*
        Reset-progress confirmation modal. Shows the exact
        count of cards that will be wiped plus the review total,
        so the user can decide from real numbers — not just
        "это удалит ваш прогресс" with no scope.
      */}
      <ConfirmDialog
        open={resetModalOpen}
        title={t('stats.resetDialog.title')}
        description={t('stats.resetDialog.body')}
        consequences={[
          {
            label: t('stats.resetDialog.cardsLabel'),
            value: pluralRu(
              overall.seenCount,
              t('stats.resetDialog.cardOne'),
              t('stats.resetDialog.cardFew'),
              t('stats.resetDialog.cardMany'),
            ),
          },
          {
            label: t('stats.resetDialog.reviewsLabel'),
            value: pluralRu(
              totalReviews,
              t('stats.resetDialog.reviewOne'),
              t('stats.resetDialog.reviewFew'),
              t('stats.resetDialog.reviewMany'),
            ),
          },
        ]}
        confirmLabel={t('stats.resetDialog.confirm')}
        cancelLabel={t('stats.resetDialog.cancel')}
        variant="danger"
        onConfirm={confirmResetNow}
        onCancel={() => setResetModalOpen(false)}
      />
    </div>
  );
}

/*
  Import-confirmation modal. Centered card on a soft scrim. The
  body summarises what's in the backup file, and if the file
  belongs to a different user we add a louder warning above the
  buttons. The Confirm button stays disabled while the network
  round-trip is in flight so a double-click can't double-submit.
*/
function ImportConfirmDialog({
  summary,
  currentUsername,
  importing,
  onConfirm,
  onCancel,
  t,
}: {
  summary: BackupSummary;
  currentUsername: string | null;
  importing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  // Format the exported-at date in the user's locale, falling back
  // to ISO if Intl.DateTimeFormat fails for some reason.
  const dateLabel = useMemo(() => {
    try {
      return summary.exportedAt.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return summary.exportedAt.toISOString();
    }
  }, [summary.exportedAt]);

  return (
    <div className={styles.dialogScrim} role="presentation" onClick={onCancel}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="import-confirm-title" className={styles.dialogTitle}>
          {t('stats.data.importConfirmTitle')}
        </h2>
        {!summary.sameUser && currentUsername ? (
          <div className={styles.dialogWarning} role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>
              {t('stats.data.importConfirmDifferentUser', {
                backupUser: summary.username,
                currentUser: currentUsername,
              })}
            </span>
          </div>
        ) : null}
        <pre className={styles.dialogBody}>
          {t('stats.data.importConfirmBody', {
            name: `${summary.displayName} (@${summary.username})`,
            date: dateLabel,
            cards: summary.cardsTracked.toLocaleString(),
            events: summary.reviewEvents.toLocaleString(),
          })}
        </pre>
        <div className={styles.dialogActions}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onCancel}
            disabled={importing}
          >
            {t('stats.data.importCancelButton')}
          </button>
          <button
            type="button"
            className="btn btn--lg"
            onClick={onConfirm}
            disabled={importing}
          >
            {t('stats.data.importConfirmButton')}
          </button>
        </div>
      </div>
    </div>
  );
}

/*
  Small 30-day bar chart. Pure SVG, no library. Bar height is
  proportional to the day's review count, scaled to the busiest day
  in the window. Today is rendered last with an accent colour and a
  small "today" label so the user can read the chart at a glance.
*/
function ActivityChart({ days }: { days: DayStat[] }) {
  const max = Math.max(1, ...days.map((d) => d.reviews));
  const W = 100; // viewBox units
  const H = 100;
  const padX = 0.5;
  const innerW = W - padX * 2;
  const barW = innerW / days.length;
  const todayKey = dayKey(new Date());

  // Tick marks for every 7th day so the user can orient themselves
  // without us printing 30 labels.
  const labelStep = 7;

  return (
    <div className={styles.chartWrap}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Daily reviews, last 30 days"
      >
        {days.map((d, i) => {
          const x = padX + i * barW;
          const h = (d.reviews / max) * (H - 6);
          const y = H - h;
          const isToday = d.key === todayKey;
          const empty = d.reviews === 0;
          return (
            <rect
              key={d.key}
              x={x + barW * 0.12}
              y={y}
              width={barW * 0.76}
              height={Math.max(0.4, h)}
              rx={0.6}
              className={
                empty
                  ? styles.chartBarEmpty
                  : isToday
                    ? styles.chartBarToday
                    : styles.chartBar
              }
            >
              <title>
                {d.reviews} {d.reviews === 1 ? 'review' : 'reviews'} ·{' '}
                {d.date.toLocaleDateString()}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className={styles.chartAxis}>
        {days.map((d, i) =>
          i % labelStep === 0 ? (
            <span
              key={d.key}
              className={styles.chartTick}
              style={{ left: `${((i + 0.5) / days.length) * 100}%` }}
            >
              {d.date.getDate()}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

/**
 * GitHub-style activity heatmap. One square per day for the
 * last `weeks` weeks (default 13 ≈ one quarter). Squares are
 * arranged in columns of 7 (one per weekday, Mon on top to
 * match the standard calendar grid); the rightmost column is
 * always "this week", so the user sees a familiar shape.
 *
 * The colour scale goes from empty (no reviews) to a deep
 * accent for the busiest day. We pick the threshold buckets
 * (1, 5, 15, 30+) based on the data so the gradient looks
 * similar whether the user does 5 reviews/day or 200.
 */
function ActivityHeatmap({
  days,
  weeks = 13,
  t,
}: {
  days: DayStat[];
  weeks?: number;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  // The cell the cursor is over (or null). Drives a custom
  // tooltip — the native `title` attribute has a long delay
  // (~1s on most browsers) and looks terrible, so we render
  // our own positioned div that appears instantly on hover.
  const [hover, setHover] = useState<{
    cell: { key: string; date: Date; n: number; inFuture: boolean };
    x: number;
    y: number;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Build a 7-row × N-column grid. Each column is a week
  // (Mon..Sun). The rightmost column may be partial (today is
  // somewhere in the middle of the week); we still render it
  // and let the squares before "today" stay empty.
  const totalDays = weeks * 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Walk back to the start of the week (Monday) for the
  // rightmost column, then back `totalDays` from there.
  const dow = (today.getDay() + 6) % 7; // 0 = Mon
  const rightmostMonday = new Date(today);
  rightmostMonday.setDate(today.getDate() - dow);
  const firstDate = new Date(rightmostMonday);
  firstDate.setDate(firstDate.getDate() - (totalDays - 7));

  // Map dayKey → count for O(1) lookup.
  const byKey = new Map<string, number>();
  for (const d of days) byKey.set(d.key, d.reviews);

  // Pick the colour buckets. Use a "natural" scale so the
  // gradient looks similar across activity levels.
  const max = Math.max(0, ...days.map((d) => d.reviews));
  const buckets: number[] = (() => {
    if (max <= 0) return [1, 5, 15, 30];
    if (max < 5) return [1, 2, 3, 4];
    if (max < 20) return [1, 3, 6, 10];
    if (max < 60) return [5, 15, 30, 50];
    return [10, 30, 60, Math.ceil(max * 0.8)];
  })();
  function level(n: number): 0 | 1 | 2 | 3 | 4 {
    if (n <= 0) return 0;
    if (n < buckets[0]) return 1;
    if (n < buckets[1]) return 2;
    if (n < buckets[2]) return 3;
    return 4;
  }

  // Build the 2D grid. The user's locale determines the first
  // day of the week — Russian / most of Europe use Monday.
  const cells: Array<{
    key: string;
    date: Date;
    n: number;
    inFuture: boolean;
  }> = [];
  for (let col = 0; col < weeks; col++) {
    for (let row = 0; row < 7; row++) {
      const date = new Date(firstDate);
      date.setDate(firstDate.getDate() + col * 7 + row);
      const key = dayKey(date);
      const inFuture = date.getTime() > today.getTime();
      cells.push({
        key,
        date,
        n: inFuture ? 0 : byKey.get(key) ?? 0,
        inFuture,
      });
    }
  }

  // Month labels along the top: print the first-letter of the
  // month at the first column where that month appears.
  const monthLabels: Array<{ col: number; label: string }> = [];
  let lastMonth = -1;
  for (let col = 0; col < weeks; col++) {
    const firstRow = cells[col * 7];
    const m = firstRow.date.getMonth();
    if (m !== lastMonth) {
      monthLabels.push({
        col,
        label: firstRow.date.toLocaleDateString(undefined, { month: 'short' }),
      });
      lastMonth = m;
    }
  }

  const total = days.reduce((acc, d) => acc + d.reviews, 0);
  const active = days.filter((d) => d.reviews > 0).length;

  return (
    <div className={styles.heatmapWrap} ref={wrapRef}>
      {hover ? (
        <HeatmapTooltip
          cell={hover.cell}
          x={hover.x}
          y={hover.y}
          t={t}
        />
      ) : null}
      <div className={styles.heatmapHeader}>
        <strong>{total.toLocaleString()}</strong>{' '}
        <span className="muted">
          {t('stats.heatmap.totalReviews', { count: total })}
        </span>
        <span className={styles.heatmapSep}>·</span>
        <strong>{active.toLocaleString()}</strong>{' '}
        <span className="muted">
          {t('stats.heatmap.activeDays', { count: active })}
        </span>
      </div>
      <div className={styles.heatmapGrid} role="grid" aria-label={t('stats.heatmap.aria')}>
        <div className={styles.heatmapMonths}>
          {monthLabels.map((m) => (
            <span
              key={m.col}
              className={styles.heatmapMonth}
              style={{ gridColumnStart: m.col + 2 }}
            >
              {m.label}
            </span>
          ))}
        </div>
        <div className={styles.heatmapBody}>
          <div className={styles.heatmapDays} aria-hidden="true">
            <span>{t('stats.heatmap.day.mon')}</span>
            <span>{t('stats.heatmap.day.wed')}</span>
            <span>{t('stats.heatmap.day.fri')}</span>
          </div>
          <div
            className={styles.heatmapCells}
            style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}
          >
            {cells.map((c) => (
              <div
                key={c.key}
                className={`${styles.heatmapCell} ${styles[`heatmapLevel${level(c.n)}`]} ${c.inFuture ? styles.heatmapCellFuture : ''}`}
                role="gridcell"
                aria-label={
                  c.inFuture
                    ? c.date.toLocaleDateString()
                    : t('stats.heatmap.cell', { n: c.n, date: c.date.toLocaleDateString() })
                }
                onMouseEnter={(e) => {
                  const wrap = wrapRef.current?.getBoundingClientRect();
                  if (!wrap) return;
                  setHover({
                    cell: c,
                    x: e.clientX - wrap.left,
                    y: e.clientY - wrap.top,
                  });
                }}
                onMouseMove={(e) => {
                  // Track the cursor so the tooltip follows it. We
                  // only re-render if the x/y actually moved by a
                  // pixel — otherwise we'd be churning state on
                  // every animation frame the browser fires.
                  const wrap = wrapRef.current?.getBoundingClientRect();
                  if (!wrap) return;
                  const x = e.clientX - wrap.left;
                  const y = e.clientY - wrap.top;
                  setHover((prev) =>
                    prev && prev.x === x && prev.y === y
                      ? prev
                      : { cell: c, x, y },
                  );
                }}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </div>
        </div>
      </div>
      <div className={styles.heatmapLegend} aria-hidden="true">
        <span className="muted">{t('stats.heatmap.less')}</span>
        <span className={`${styles.heatmapCell} ${styles.heatmapLevel0}`} />
        <span className={`${styles.heatmapCell} ${styles.heatmapLevel1}`} />
        <span className={`${styles.heatmapCell} ${styles.heatmapLevel2}`} />
        <span className={`${styles.heatmapCell} ${styles.heatmapLevel3}`} />
        <span className={`${styles.heatmapCell} ${styles.heatmapLevel4}`} />
        <span className="muted">{t('stats.heatmap.more')}</span>
      </div>
    </div>
  );
}

/**
 * Floating tooltip for a heatmap cell. Rendered absolutely
 * inside the heatmap wrap so it inherits the relative
 * positioning; we shift it by the cursor offset so it follows
 * the mouse. We keep the rendered content bilingual via `t`
 * because the cell date is locale-formatted by the browser.
 */
function HeatmapTooltip({
  cell,
  x,
  y,
  t,
}: {
  cell: { key: string; date: Date; n: number; inFuture: boolean };
  x: number;
  y: number;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  // Position the tooltip just above-and-right of the cursor
  // (so it doesn't get hidden under the cursor). When we're
  // near the top of the wrap, flip it below the cursor.
  const style: React.CSSProperties = {
    position: 'absolute',
    left: x + 12,
    top: y - 8,
    transform: y < 60 ? 'translateY(20px)' : 'translateY(-100%)',
    pointerEvents: 'none',
    zIndex: 50,
  };
  // `Intl` gives a nice full date in the user's locale.
  const dateLabel = cell.date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return (
    <div
      className={styles.heatmapTooltip}
      style={style}
      role="status"
      aria-live="polite"
    >
      {cell.inFuture ? (
        <span className={styles.tooltipMuted}>{dateLabel}</span>
      ) : (
        <>
          <span className={styles.tooltipCount}>
            {t('stats.heatmap.cellCount', { count: cell.n })}
          </span>
          <span className={styles.tooltipDate}>{dateLabel}</span>
        </>
      )}
    </div>
  );
}

function TopicGroups({
  groups,
  loaded,
  t,
  tTopic,
}: {
  groups: Array<{
    level: Level;
    topic: string;
    total: number;
    learned: number;
    due: number;
  }>;
  loaded: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
  tTopic: (englishName: string) => string;
}) {
  // Group rows by level
  const byLevel = new Map<string, typeof groups>();
  for (const g of groups) {
    const list = byLevel.get(g.level.id) ?? [];
    list.push(g);
    byLevel.set(g.level.id, list);
  }

  // Default: all CEFR levels expanded
  const [collapsed, setCollapsed] = useState<Set<string>>(
    new Set(),
  );

  const toggle = (levelId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(levelId)) next.delete(levelId);
      else next.add(levelId);
      return next;
    });
  };

  if (!loaded && groups.length === 0) {
    return <div className={styles.topicSkeleton}>…</div>;
  }

  return (
    <div className={styles.topicGroups}>
      {LEVELS.map((lvl) => {
        const rows = byLevel.get(lvl.id) ?? [];
        if (rows.length === 0) return null;
        const isCollapsed = collapsed.has(lvl.id);
        const totalCards = rows.reduce((acc, r) => acc + r.total, 0);
        const learned = rows.reduce((acc, r) => acc + r.learned, 0);
        const due = rows.reduce((acc, r) => acc + r.due, 0);
        const tierLabel = t(`level.tier.${lvl.tier}`);
        const levelMeta = t('stats.levelMeta', {
          topics: rows.length,
          learned: learned.toLocaleString(),
          total: totalCards.toLocaleString(),
        }) + (due > 0 ? t('stats.levelMeta.due', { count: due }) : '');
        return (
          <div key={lvl.id} className={styles.topicLevel}>
            <button
              type="button"
              className={styles.topicLevelHead}
              onClick={() => toggle(lvl.id)}
              aria-expanded={!isCollapsed}
            >
              <span className={styles.topicLevelIcon}>
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </span>
              <span className={styles.topicLevelBadge}>{lvl.name}</span>
              <span className={styles.topicLevelName}>{tierLabel}</span>
              <span className={styles.topicLevelMeta}>{levelMeta}</span>
            </button>
            {!isCollapsed ? (
              <div className={styles.topicGrid}>
                {rows.map((r) => {
                  const mastery = Math.round((r.learned / r.total) * 100);
                  const status =
                    r.due > 0
                      ? t('stats.topicStatus.due', { count: r.due })
                      : r.learned === r.total
                        ? t('stats.topicStatus.done')
                        : r.learned > 0
                          ? t('stats.topicStatus.percent', { percent: mastery })
                          : t('stats.topicStatus.new');
                  return (
                    <Link
                      key={`${r.level.id}-${r.topic}`}
                      to={`/study/level/${r.level.id}?topic=${encodeURIComponent(r.topic)}`}
                      className={styles.topicCard}
                    >
                      <div className={styles.topicCardTop}>
                        <span className={styles.topicName}>{tTopic(r.topic)}</span>
                        <span
                          className={`${styles.topicStatus} ${
                            r.due > 0 ? styles.topicStatusDue : ''
                          }`}
                        >
                          {status}
                        </span>
                      </div>
                      <div className={styles.topicProgressBar}>
                        <div
                          className={styles.topicProgressFill}
                          style={{ width: `${mastery}%` }}
                        />
                      </div>
                      <span className={styles.topicMeta}>
                        {t('stats.words.learned', {
                          count: r.total,
                          learned: r.learned,
                          total: r.total,
                        })}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function KPI({
  label,
  value,
  sub,
  to,
}: {
  label: string;
  value: string;
  sub: string;
  // When set, the whole tile becomes a Link. The arrow only
  // shows on hover/focus so static screenshots stay clean —
  // mobile users still get the affordance via the cursor
  // change and a small always-visible arrow at the bottom.
  to?: string;
}) {
  const body = (
    <>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>{value}</span>
      <span className={styles.kpiSub}>{sub}</span>
      {to ? (
        <span className={styles.kpiCta} aria-hidden="true">
          <ArrowRight size={14} />
        </span>
      ) : null}
    </>
  );
  if (!to) {
    return <div className={styles.kpi}>{body}</div>;
  }
  return (
    <Link to={to} className={`${styles.kpi} ${styles.kpiLink}`}>
      {body}
    </Link>
  );
}

/**
 * Per-day accuracy line chart. Each bucket is one day; the y
 * value is the success rate (0..1) for that day, or null when
 * there were no reviews. Days with no data render as gaps so
 * the line is honest about what we know.
 */
function RetentionChart({
  buckets,
}: {
  buckets: { day: string; n: number; correct: number; accuracy: number | null }[];
}) {
  if (buckets.length === 0) return null;
  const W = 100;
  const H = 40;
  const padX = 2;
  const padY = 4;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  // X: evenly spaced by index. Y: accuracy 0..1 mapped to
  // (padY + innerH) at the bottom and padY at the top.
  const xFor = (i: number) =>
    padX + (buckets.length === 1 ? innerW / 2 : (i / (buckets.length - 1)) * innerW);
  const yFor = (a: number) => padY + (1 - a) * innerH;
  const points = buckets
    .map((b, i) => (b.accuracy === null ? null : `${xFor(i)},${yFor(b.accuracy)}`))
    .filter((p): p is string => p !== null);
  return (
    <div className={styles.chartWrap}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Daily retention, last 30 days"
      >
        <line
          x1={padX}
          y1={yFor(0.95)}
          x2={padX + innerW}
          y2={yFor(0.95)}
          className={styles.retRef95}
        />
        <line
          x1={padX}
          y1={yFor(0.8)}
          x2={padX + innerW}
          y2={yFor(0.8)}
          className={styles.retRef80}
        />
        {points.length >= 2 ? (
          <polyline
            points={points.join(' ')}
            className={styles.retLine}
            fill="none"
          />
        ) : null}
        {buckets.map((b, i) =>
          b.accuracy === null ? null : (
            <circle
              key={b.day}
              cx={xFor(i)}
              cy={yFor(b.accuracy)}
              r={0.8}
              className={styles.retDot}
            >
              <title>
                {b.day}: {Math.round(b.accuracy * 100)}% ({b.correct}/{b.n})
              </title>
            </circle>
          ),
        )}
      </svg>
      <div className={styles.chartAxis}>
        <span className={styles.chartTick} style={{ left: '0%' }}>0%</span>
        <span className={styles.chartTick} style={{ left: '50%' }}>50%</span>
        <span className={styles.chartTick} style={{ left: '100%' }}>100%</span>
      </div>
    </div>
  );
}
