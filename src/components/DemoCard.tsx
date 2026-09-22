import styles from './DemoCard.module.css';

interface DemoCardProps {
  kazakh: string;
  transliteration: string;
  russian: string;
  topic: string;
  level: string;
}

/**
 * Static preview of what a flashcard looks like. Used in the
 * landing-page hero so visitors see the actual UX without having
 * to register. This is NOT a real Flashcard — it doesn't flip, it
 * doesn't fetch TTS, it doesn't track progress. It's a marketing
 * prop. Keeping it tiny means the hero renders instantly and the
 * hero screenshot stays representative of the real product.
 *
 * Static "answer" copy sits dimmed under the front word to imply
 * the flip — the visitor already understands cards from Anki,
 * Duolingo, etc., so we don't need to animate it.
 */
export function DemoCard({ kazakh, transliteration, russian, topic, level }: DemoCardProps) {
  return (
    <div className={styles.demo} role="img" aria-label={`${kazakh} — ${russian}`}>
      <div className={styles.meta}>
        <span className={styles.level}>{level}</span>
        <span className={styles.topic}>{topic}</span>
      </div>
      <div className={styles.word}>{kazakh}</div>
      <div className={styles.translit}>{transliteration}</div>
      <div className={styles.divider} aria-hidden="true" />
      <div className={styles.answer}>
        <span className={styles.answerLabel}>Перевод</span>
        <span className={styles.answerText}>{russian}</span>
      </div>
    </div>
  );
}