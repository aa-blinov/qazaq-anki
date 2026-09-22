import { useLang } from '../contexts/LanguageContext';
import type { ServerStats } from '../lib/api';
import styles from './EaseHistogram.module.css';

type EaseKey = keyof ServerStats['ease'];

interface Bucket {
  key: EaseKey;
  labelKey: string;
  range: string;
}

/**
 * Anki's ease factor floats between 1.3 (Anki floor) and ~3.5
 * (cards the user gets right almost always). Most cards cluster
 * around 2.0–3.0; the long tail on either side is interesting
 * because it surfaces the cards the SM-2 scheduler thinks are
 * exceptionally easy or exceptionally hard.
 *
 * Visual choice: horizontal bars, not vertical columns. With
 * only 5 buckets a vertical chart reads like "is this a
 * histogram or a Likert scale?" — horizontal bars make it
 * obvious at a glance that the X axis is count, not category.
 */
export function EaseHistogram({ stats }: { stats: ServerStats }) {
  const { t } = useLang();
  const buckets: Bucket[] = [
    { key: 'lt1.5', labelKey: 'stats.ease.bucketLt1_5', range: '< 1.5' },
    { key: '1.5-2.0', labelKey: 'stats.ease.bucket15_20', range: '1.5–2.0' },
    { key: '2.0-2.5', labelKey: 'stats.ease.bucket20_25', range: '2.0–2.5' },
    { key: '2.5-3.0', labelKey: 'stats.ease.bucket25_30', range: '2.5–3.0' },
    { key: 'gt3.0', labelKey: 'stats.ease.bucketGt3', range: '> 3.0' },
  ];

  const counts = buckets.map((b) => stats.ease[b.key]);
  const total = counts.reduce((a, b) => a + b, 0);
  // Width baseline is the largest count so the biggest bar reaches
  // 100% of the row width. A zero-count bucket shows nothing.
  const max = Math.max(1, ...counts);

  if (total === 0) {
    // Hide the whole section when the user hasn't reviewed any
    // cards yet — an empty histogram with all-zero bars would
    // just be noise.
    return null;
  }

  return (
    <section className={styles.wrap} aria-labelledby="ease-hist-title">
      <header className={styles.head}>
        <h2 id="ease-hist-title" className={styles.title}>
          {t('stats.ease.title')}
        </h2>
        <p className="muted">{t('stats.ease.subtitle')}</p>
      </header>
      <ul className={styles.bars}>
        {buckets.map((b) => {
          const n = stats.ease[b.key];
          const pct = (n / max) * 100;
          return (
            <li key={b.key} className={styles.row}>
              <span className={styles.range}>{b.range}</span>
              <span className={styles.track} aria-hidden="true">
                <span
                  className={styles.fill}
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className={styles.count}>{n.toLocaleString()}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}