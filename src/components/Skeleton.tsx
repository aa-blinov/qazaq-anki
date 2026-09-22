import styles from './Skeleton.module.css';

interface SkeletonProps {
  /**
   * Tailwind-style shape presets. `text` is the default — a
   * single-line bar matching the body text height. `title` is
   * taller (h2-ish). `card` is a multi-line block.
   *
   * Width defaults to 100% — pass a number/string to override
   * (e.g. width="60%" or width={120} for a px value).
   */
  variant?: 'text' | 'title' | 'card' | 'block';
  width?: number | string;
  /** Optional extra class for layout / spacing. */
  className?: string;
  /** Number of stacked text lines when `variant === 'card'`. */
  lines?: number;
}

/**
 * Loading skeleton — a flat, low-contrast bar that holds the
 * page's shape while data is in flight. Replaces the bare
 * "..." text that used to be the only loading affordance.
 *
 * Animation: a soft horizontal sheen (background-position)
 * that's CSS-only — no React state, no JS timer. Disabled
 * under prefers-reduced-motion (the bar still appears, just
 * static).
 */
export function Skeleton({
  variant = 'text',
  width,
  className,
  lines = 3,
}: SkeletonProps) {
  const w = typeof width === 'number' ? `${width}px` : width;
  if (variant === 'card') {
    return (
      <div className={`${styles.card} ${className ?? ''}`} aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
          <span
            key={i}
            className={styles.line}
            style={{
              width: i === lines - 1 ? '65%' : w ?? '100%',
            }}
          />
        ))}
      </div>
    );
  }
  const cls = `${styles.bar} ${
    variant === 'title' ? styles.barTitle : variant === 'block' ? styles.barBlock : ''
  } ${className ?? ''}`;
  return (
    <span
      className={cls}
      style={w ? { width: w } : undefined}
      aria-hidden="true"
    />
  );
}
