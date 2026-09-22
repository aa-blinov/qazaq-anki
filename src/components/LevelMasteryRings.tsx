import { useLang } from '../contexts/LanguageContext';
import type { ServerStats } from '../lib/api';
import styles from './LevelMasteryRings.module.css';

interface RingProps {
  level: string;
  total: number;
  learned: number;
  mastered: number;
  etaDays: number | null;
  etaDone: boolean;
}

/**
 * One circular progress ring — a single CEFR level's mastery.
 *
 * Two concentric strokes:
 *   • Outer (track + fill): % of cards the user has touched at
 *     least once. This is "I've seen this".
 *   • Inner (track + fill): % of cards in long-term review
 *     (interval ≥ 21d). This is "I actually own this".
 *
 * Two layers because "I've seen it once" and "I reliably
 * remember it a month from now" are very different achievements
 * and conflating them makes the rings feel less honest.
 */
function Ring({ level, total, learned, mastered, etaDays, etaDone }: RingProps) {
  const { t } = useLang();
  const size = 96;
  const stroke = 8;
  const innerStroke = 5;
  const r = (size - stroke) / 2;
  const innerR = r - stroke - 4 - innerStroke / 2;
  const c = 2 * Math.PI * r;
  const ci = 2 * Math.PI * innerR;

  const seenPct = total > 0 ? learned / total : 0;
  const masteredPct = total > 0 ? mastered / total : 0;
  // Cap visible fill at 100% even if the data has a bug (>100%).
  // The number still shows the raw count so the user can spot
  // the discrepancy, but the ring never lies about being full.
  const seenOffset = c * (1 - Math.min(1, seenPct));
  const masteredOffset = ci * (1 - Math.min(1, masteredPct));

  // Eta label: "X дн" / "готово" / "…". Three states keep the
  // ring honest: a real estimate, a "you're done", and an
  // explicit "I don't know yet". We use an ellipsis rather than
  // a dash so the placeholder reads as "to be determined"
  // instead of as a stylistic hyphen.
  const etaLabel = etaDone
    ? t('stats.levels.done')
    : etaDays === null
    ? '…'
    : t('stats.levels.etaDays', { days: etaDays });

  return (
    <div className={styles.ring} data-level={level}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className={styles.svg}
        role="img"
        aria-label={t('stats.levels.ariaRing', {
          level,
          learned,
          total,
          mastered,
        })}
      >
        {/* Outer ring — "seen at least once" */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={styles.track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={styles.fill}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={seenOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        {/* Inner ring — "mastered (interval ≥ 21d)" */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={innerR}
          className={styles.trackInner}
          strokeWidth={innerStroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={innerR}
          className={styles.fillInner}
          strokeWidth={innerStroke}
          strokeDasharray={ci}
          strokeDashoffset={masteredOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className={styles.center}>
        <div className={styles.level}>{level}</div>
        <div className={styles.percent}>
          {Math.round(seenPct * 100)}
          <span className={styles.percentSign}>%</span>
        </div>
        <div className={styles.eta}>{etaLabel}</div>
      </div>
    </div>
  );
}

/**
 * Five mastery rings (A1..C1) in canonical order. The component
 * renders nothing for an empty `stats` (the parent waits for the
 * server fetch to land before swapping it in).
 */
export function LevelMasteryRings({ stats }: { stats: ServerStats }) {
  const { t } = useLang();
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
  const totalLearned = levels.reduce((acc, l) => acc + stats.levels[l].learned, 0);
  const totalCards = levels.reduce((acc, l) => acc + stats.levels[l].total, 0);

  return (
    <section className={styles.wrap} aria-labelledby="level-rings-title">
      <header className={styles.head}>
        <h2 id="level-rings-title" className={styles.title}>
          {t('stats.levels.title')}
        </h2>
        <p className="muted">
          {t('stats.levels.subtitle', {
            learned: totalLearned.toLocaleString(),
            total: totalCards.toLocaleString(),
          })}
        </p>
      </header>
      <div className={styles.row}>
        {levels.map((lvl) => {
          const stat = stats.levels[lvl];
          const eta = stats.eta[lvl];
          return (
            <Ring
              key={lvl}
              level={lvl}
              total={stat.total}
              learned={stat.learned}
              mastered={stat.mastered}
              etaDays={eta.days}
              etaDone={eta.done}
            />
          );
        })}
      </div>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotOuter}`} aria-hidden="true" />
          {t('stats.levels.legendSeen')}
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotInner}`} aria-hidden="true" />
          {t('stats.levels.legendMastered')}
        </span>
      </div>
    </section>
  );
}