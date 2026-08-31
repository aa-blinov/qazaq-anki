// Compact activity heatmap for the Home page. Smaller than
// the Stats page's 13-week grid (we default to 7 weeks here
// so the Home page doesn't grow a 700px-tall panel), and
// with a simpler header (just a small "N reviews this
// period" line). The colour scale + day-by-day bucketing
// logic is the same as the Stats heatmap so the two views
// look consistent.
import { useMemo, useState } from 'react';
import styles from './MiniHeatmap.module.css';

interface DayStat {
  date: Date;
  key: string;
  reviews: number;
}

interface MiniHeatmapProps {
  // Daily review counts. The heatmap picks its window from
  // the last `weeks * 7` entries.
  days: DayStat[];
  weeks?: number;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function MiniHeatmap({ days, weeks = 7 }: MiniHeatmapProps) {
  // The cell the cursor is over (or null). Same single-div
  // tooltip pattern as the Stats heatmap — native `title`
  // has a 1s delay and looks terrible.
  const [hover, setHover] = useState<{
    cell: { key: string; date: Date; n: number; inFuture: boolean };
    x: number;
    y: number;
  } | null>(null);

  const totalDays = weeks * 7;
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const dow = (today.getDay() + 6) % 7; // 0 = Mon
  const rightmostMonday = useMemo(() => {
    const d = new Date(today);
    d.setDate(today.getDate() - dow);
    return d;
  }, [today]);
  const firstDate = useMemo(() => {
    const d = new Date(rightmostMonday);
    d.setDate(d.getDate() - (totalDays - 7));
    return d;
  }, [rightmostMonday, totalDays]);

  const byKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of days) m.set(d.key, d.reviews);
    return m;
  }, [days]);

  // Pick colour buckets based on the busiest day in the
  // window so the gradient looks similar whether the user
  // does 5 reviews/day or 200.
  const buckets = useMemo(() => {
    const max = Math.max(0, ...days.map((d) => d.reviews));
    if (max <= 0) return [1, 5, 15, 30];
    if (max < 5) return [1, 2, 3, 4];
    if (max < 20) return [1, 3, 6, 10];
    if (max < 60) return [5, 15, 30, 50];
    return [10, 30, 60, Math.ceil(max * 0.8)];
  }, [days]);

  function level(n: number): 0 | 1 | 2 | 3 | 4 {
    if (n <= 0) return 0;
    if (n < buckets[0]) return 1;
    if (n < buckets[1]) return 2;
    if (n < buckets[2]) return 3;
    return 4;
  }

  const cells = useMemo(() => {
    const out: Array<{
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
        out.push({
          key,
          date,
          n: inFuture ? 0 : byKey.get(key) ?? 0,
          inFuture,
        });
      }
    }
    return out;
  }, [weeks, firstDate, today, byKey]);

  const total = cells.reduce((acc, c) => acc + (c.inFuture ? 0 : c.n), 0);
  const active = cells.filter((c) => !c.inFuture && c.n > 0).length;

  return (
    <div className={styles.heatmapWrap}>
      {hover ? (
        <div
          className={styles.heatmapTooltip}
          style={{
            left: hover.x + 12,
            top: hover.y < 40 ? hover.y + 24 : hover.y - 36,
          }}
        >
          <div className={styles.heatmapTooltipDate}>
            {hover.cell.date.toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
            })}
          </div>
          <div className={styles.heatmapTooltipN}>
            {hover.cell.inFuture
              ? '—'
              : hover.cell.n === 0
                ? 'нет повторений'
                : hover.cell.n}
          </div>
        </div>
      ) : null}
      <div
        className={styles.heatmapGrid}
        role="grid"
        aria-label={`Активность за ${weeks} недель: ${total} повторений, ${active} активных дней`}
      >
        <div
          className={styles.heatmapCells}
          style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}
        >
          {cells.map((c) => (
            <div
              key={c.key}
              className={`${styles.heatmapCell} ${styles[`level${level(c.n)}`]} ${c.inFuture ? styles.heatmapCellFuture : ''}`}
              role="gridcell"
              aria-label={
                c.inFuture
                  ? c.date.toLocaleDateString()
                  : `${c.date.toLocaleDateString()}: ${c.n} повторений`
              }
              onMouseEnter={(e) =>
                setHover({
                  cell: c,
                  x: e.nativeEvent.offsetX,
                  y: e.nativeEvent.offsetY,
                })
              }
              onMouseMove={(e) =>
                setHover((prev) =>
                  prev && prev.cell.key === c.key
                    ? { ...prev, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }
                    : { cell: c, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY },
                )
              }
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
