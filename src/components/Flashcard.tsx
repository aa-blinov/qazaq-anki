import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, RotateCcw, Volume2, VolumeX, Wand2 } from 'lucide-react';
import type { Card as CardData, Direction } from '../data/decks';
import type { Phase } from '../lib/sm2';
import { useLang } from '../contexts/LanguageContext';
import { getTtsSpeed, onTtsSpeedChange } from '../lib/tts-prefs';
import { getToken } from '../lib/api';
import {
  audioUrl,
  hasAudio,
  loadAudioManifest,
  markAudioAvailable,
  wordHash,
  type AudioLang,
} from '../lib/tts';
import { getCuratedExample } from '../data/examples';
import styles from './Flashcard.module.css';

interface FlashcardProps {
  card: CardData;
  revealed: boolean;
  /**
   * `true` once the user has flipped the card at least once for
   * the current card. The page uses this to decide whether to
   * show the "Показать ответ" button (no — the card is already
   * showing the back) or the rating row (yes — they're ready to
   * grade). The Flashcard itself only needs `revealed` for the
   * flip animation; `hasRevealed` is exposed so the back can show
   * a small "click to flip back" affordance even when the back is
   * already in front of the user.
   */
  hasRevealed: boolean;
  phase: Phase;
  direction: Direction;
  /**
   * Toggle the card between front and back. First call reveals
   * (front → back); subsequent calls flip back and forth without
   * resetting anything. Space/Enter and clicking the card both go
   * through this callback.
   */
  onFlip: () => void;
}

/**
 * Imperative handle for the parent (Study page). The page
 * calls `playKkTts()` from inside its own click handler so
 * the audio is allowed under the browser's autoplay policy
 * (a click on "Показать ответ" / Space is a user gesture).
 * `playKkTts()` always plays the Kazakh word — that's the
 * language the user is actually learning, and it's the word
 * they just produced in their head before flipping.
 */
export interface FlashcardHandle {
  playKkTts: () => void;
}

export const Flashcard = forwardRef<FlashcardHandle, FlashcardProps>(
function Flashcard({
  card,
  revealed,
  hasRevealed,
  phase,
  direction,
  onFlip,
}: FlashcardProps, ref) {
  // Force re-mount when card id changes so the flip animation re-runs cleanly
  const [instanceId, setInstanceId] = useState(0);
  useEffect(() => {
    setInstanceId((i) => i + 1);
  }, [card.id]);

  // Refs onto the two TTS buttons. We always auto-play the
  // KAZAKH one on reveal — that's the language the user is
  // learning. In `kk-ru` mode the Kazakh TTS sits on the
  // FRONT (it's the prompt), in `ru-kk` mode it sits on the
  // BACK (the answer). Either way, we know which TtsButton
  // holds the Kazakh pronunciation and reach for it from
  // the imperative handle below.
  const kkTtsRef = useRef<TtsButtonHandle | null>(null);
  useImperativeHandle(
    ref,
    () => ({ playKkTts: () => kkTtsRef.current?.play() }),
    [],
  );

  const isKkRu = direction === 'kk-ru';
  // Helper text in the right language
  const { t } = useLang();

  // FRONT shows the prompt — Kazakh for kk-ru, Russian for ru-kk.
  // BACK reveals the answer.
  const frontMain = isKkRu ? card.kazakh : card.translationRu;
  // Transliteration only matters for Kazakh (Cyrillic script the
  // learner is still getting used to). It shows up under the Kazakh
  // text and never under Russian text.
  //  - kk-ru front: Kazakh word → show transliteration (reading aid).
  //  - ru-kk front: Russian word → no transliteration.
  const frontSub = isKkRu ? card.transliteration : '';
  const frontPrompt = isKkRu
    ? t('card.front.kk') // 'Что это значит?'
    : t('card.front.ru'); // 'Как это сказать по-казахски?'

  const backMain = isKkRu ? card.translationRu : card.kazakh;
  // Same rule on the back: show transliteration only when the main
  // text is Kazakh (i.e. the ru-kk back, which reveals the Kazakh
  // answer and benefits from a pronunciation guide).
  const backSub = isKkRu ? '' : card.transliteration;

  // TTS button appears on BOTH sides of the card. The "front"
  // text is the prompt (Kazakh for kk-ru, Russian for ru-kk); the
  // "back" text is the answer (the other language). For words whose
  // audio is pre-generated (the 3,685 kk + 3,780 ru WAVs) the speak
  // button is shown immediately. For everything else (user-added
  // cards) we show a "Generate" affordance that calls
  // POST /api/tts/synthesize and, on success, swaps in the speak
  // button. While the manifest is still loading we render nothing —
  // the button would just flicker otherwise.
  //
  //  - kk-ru: front = Kazakh (kk audio),  back = Russian (ru audio)
  //  - ru-kk: front = Russian (ru audio), back = Kazakh  (kk audio)
  const frontTtsText = frontMain;
  const frontTtsLang: AudioLang = isKkRu ? 'kk' : 'ru';
  const backTtsText = backMain;
  const backTtsLang: AudioLang = isKkRu ? 'ru' : 'kk';

  // Defensive: ensure the manifest is loaded even if the top-level
  // effect in App.tsx hasn't fired yet (e.g. card shown before App
  // effect runs on first paint). Idempotent — already-resolved
  // promise is returned as-is. Both languages are kicked off in
  // parallel so the back of the card is ready to show its speak
  // button without an extra round trip.
  useEffect(() => {
    void loadAudioManifest('kk');
    void loadAudioManifest('ru');
  }, []);

  return (
    <div
      className={`${styles.scene} ${revealed ? styles.isRevealed : ''}`}
      onClick={onFlip}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onFlip();
        }
      }}
      aria-label={
        revealed
          ? t('card.aria.revealed')
          : hasRevealed
            ? t('card.aria.flippedBack')
            : t('card.aria.hidden')
      }
    >
      <div className={styles.cardInner} key={instanceId}>
        {/* FRONT — the prompt */}
        <div className={`${styles.face} ${styles.front}`}>
          <div className={styles.meta}>
            <span className={styles.levelTag}>{card.level}</span>
            <PhasePill phase={phase} t={t} />
          </div>
          <div className={styles.kazakhWordRow}>
            <div className={styles.kazakhWord}>{frontMain}</div>
          </div>
          {frontSub ? (
            <div className={styles.transliteration}>{frontSub}</div>
          ) : null}
          <div className={styles.hint}>
            {/* Bottom-of-card hint. Stays the prompt question on
                the front (the user needs to think). On the back
                the rotate-back icon in the meta row is the
                discoverability cue, so we don't add a second hint
                here — it would just be visual noise. */}
            {!revealed ? frontPrompt : ''}
          </div>
          {/* Speaker in the top-right corner. Lives outside the
              word row so the kazakh word stays centred (was on
              the right of the word before, which fought the
              eye for attention). */}
          {frontTtsText ? (
            <div className={styles.speakCorner}>
              <TtsButton
                ref={frontTtsLang === 'kk' ? kkTtsRef : undefined}
                text={frontTtsText}
                lang={frontTtsLang}
                t={t}
              />
            </div>
          ) : null}
        </div>

        {/* BACK — the answer */}
        <div
          className={`${styles.face} ${styles.back}`}
          aria-hidden={!revealed}
        >
          <div className={styles.meta}>
            <span className={styles.levelTag}>{card.level}</span>
            {/* "Flip back" affordance — only meaningful after the
                user has revealed the answer. A small icon button
                in the meta row gives the user a visible target
                even if they don't realise the whole card is
                clickable. The icon mirrors the rotate-back
                semantic; aria-label and a tooltip spell it out
                for screen readers. */}
            {hasRevealed ? (
              <button
                type="button"
                className={styles.flipBackBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onFlip();
                }}
                aria-label={t('study.flipBack')}
                title={t('study.flipBack')}
              >
                <RotateCcw size={14} aria-hidden="true" />
              </button>
            ) : (
              <PhasePill phase={phase} t={t} />
            )}
          </div>
          <div className={styles.kazakhWordRow}>
            <div className={styles.kazakhWordSmall}>{backMain}</div>
          </div>
          {backSub ? (
            <div className={styles.transliteration}>{backSub}</div>
          ) : null}
          <ExampleBlock card={card} t={t} />
          <div className={styles.answerRule} />
          <SourceLine card={card} t={t} />
          {backTtsText ? (
            <div className={styles.speakCorner}>
              <TtsButton
                ref={backTtsLang === 'kk' ? kkTtsRef : undefined}
                text={backTtsText}
                lang={backTtsLang}
                t={t}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

Flashcard.displayName = 'Flashcard';

/**
 * TTS state machine for a single Kazakh word.
 *
 *   loading    — manifest hasn't loaded yet → render nothing
 *   available  — pre-generated WAV exists → speak button
 *   missing    — manifest loaded, no WAV → "Generate" button
 *   generating — synthesize request in flight → spinner, disabled
 *   failed     — last attempt errored → "Try again" with tooltip
 *
 * The component owns one Audio element (created lazily on first
 * play) and re-uses it across re-renders and re-clicks. Click on
 * the speak button always stops propagation so it never flips the
 * card. Re-clicking the speak button restarts playback from 0.
 *
 * Exposes an imperative `play()` via forwardRef so the parent
 * (Study page) can trigger playback from inside its own click
 * handler — that's the only way to get around the browser
 * autoplay policy, which blocks `.play()` fired from a
 * useEffect if there was no recent user gesture.
 */
export interface TtsButtonHandle {
  play: () => void;
}

const TtsButton = forwardRef<TtsButtonHandle, {
  text: string;
  lang: AudioLang;
  t: (k: string) => string;
}>(function TtsButton({ text, lang, t }, ref) {
  const [manifestLoaded, setManifestLoaded] = useState(
    // The manifest module-load promise has likely resolved by the
    // time we mount, but the first render uses a synchronous
    // lookup that returns null while it's still in flight. We
    // re-render once it lands.
    false
  );
  const [playing, setPlaying] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hash = wordHash(text);
  const url = audioUrl(text, lang);
  const available = manifestLoaded && hasAudio(text, lang) === true;

  useEffect(() => {
    let cancelled = false;
    void loadAudioManifest(lang).then(() => {
      if (!cancelled) setManifestLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  // Lazily create one Audio element per card; cleans up on unmount.
  useEffect(() => {
    if (!audioRef.current) {
      const el = new Audio();
      el.preload = 'none';
      el.playbackRate = getTtsSpeed();
      audioRef.current = el;
      el.addEventListener('ended', () => setPlaying(false));
      el.addEventListener('error', () => {
        // The WAV disappeared from disk or 404'd for some other
        // reason. Drop back to the "generate" affordance so the
        // user can retry.
        setPlaying(false);
        setFailed(true);
      });
    }
    // Pick up speed changes from the Settings page even on the
    // currently-mounted audio element (next .play() will use it).
    // `playbackRate` is also reapplied inside `play()` for the
    // common case where Settings changed mid-playback.
    const off = onTtsSpeedChange(() => {
      if (audioRef.current) audioRef.current.playbackRate = getTtsSpeed();
    });
    return () => {
      off();
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  // Internal play. Called both from the speak-button click
  // (with a stopPropagation wrapper) and from the imperative
  // ref the parent uses to auto-play on card reveal. We keep
  // the audio element + .src + .playbackRate logic in one
  // place so the two callers can't drift.
  const doPlay = () => {
    const el = audioRef.current;
    if (!el || !url) return false;
    if (el.src !== new URL(url, window.location.href).href) {
      el.src = url;
    }
    // Re-apply the user-chosen speed on every play() so a
    // Settings change while the page is open takes effect on
    // the next spoken word without waiting for a re-render.
    el.playbackRate = getTtsSpeed();
    if (playing) {
      el.currentTime = 0;
      void el.play().catch(() => {
        setFailed(true);
        setPlaying(false);
      });
      return true;
    }
    setPlaying(true);
    setFailed(false);
    void el.play().catch(() => {
      setFailed(true);
      setPlaying(false);
    });
    return true;
  };

  // Expose `play()` to the parent (Study page) so it can
  // auto-play the audio on the first reveal. The parent's
  // click handler is a user gesture, which means `.play()`
  // inside the same synchronous tick is allowed even though
  // it would be blocked from a useEffect.
  useImperativeHandle(ref, () => ({ play: doPlay }), [doPlay]);

  const play = (e: React.MouseEvent) => {
    e.stopPropagation();
    doPlay();
    // Drop focus off the speak button so the next Space-bar
    // press bubbles up to the Study page's window keydown
    // handler and flips the card. Without this, the focused
    // button would re-trigger itself on every Space.
    e.currentTarget.blur();
  };

  const generate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setGenerating(true);
    setFailed(false);
    const token = getToken();
    try {
      const r = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text, lang }),
      });
      if (!r.ok) {
        // The server returns {error: "..."} with a stable code
        // (ttsServiceUnreachable / ttsServiceError / ttsTimeout
        // / emptyText / textTooLong / unsupportedLang / noToken
        // / invalidToken). We don't need to differentiate in the
        // UI — the "try again" affordance works for all of them.
        setFailed(true);
        return;
      }
      markAudioAvailable(hash, lang);
      // The button re-renders into the "available" branch on the
      // next React commit because the manifest is now a superset.
      // We don't auto-play — the user just asked to generate, not
      // to play. They can click again to hear it.
    } catch {
      setFailed(true);
    } finally {
      setGenerating(false);
    }
  };

  if (!manifestLoaded) return null;

  if (available && url) {
    return (
      <button
        type="button"
        className={styles.speakBtn}
        onClick={play}
        aria-label={t('card.audio.play')}
        title={t('card.audio.play')}
      >
        <Volume2
          size={18}
          strokeWidth={1.6}
          aria-hidden="true"
          className={playing ? styles.speakBtnPlaying : ''}
        />
        <span className={styles.speakBtnSrOnly}>{text}</span>
      </button>
    );
  }

  // Not yet generated — show the generate affordance. The icon
  // and label switch between "create" and "retry" depending on
  // whether the last attempt failed, so the user can tell at a
  // glance whether to expect a fresh try.
  return (
    <button
      type="button"
      className={`${styles.speakBtn} ${styles.speakBtnGenerate}`}
      onClick={generate}
      disabled={generating}
      aria-label={failed ? t('card.audio.retry') : t('card.audio.generate')}
      title={
        generating
          ? t('card.audio.generating')
          : failed
            ? t('card.audio.retry')
            : t('card.audio.generate')
      }
    >
      {generating ? (
        <Loader2
          size={16}
          strokeWidth={1.8}
          aria-hidden="true"
          className={styles.speakBtnSpin}
        />
      ) : failed ? (
        <VolumeX size={16} strokeWidth={1.6} aria-hidden="true" />
      ) : (
        <Wand2 size={16} strokeWidth={1.6} aria-hidden="true" />
      )}
      <span className={styles.speakBtnSrOnly}>{text}</span>
    </button>
  );
});

// Expose play() to the parent so it can trigger audio from
// inside its own click handler (the only way to satisfy the
// browser's autoplay policy). Without this, auto-play on
// reveal would silently fail on most browsers.
TtsButton.displayName = 'TtsButton';

function PhasePill({ phase, t }: { phase: Phase; t: (k: string) => string }) {
  if (phase === 'review') return null; // Review state is the default; no pill needed.
  const labelKey =
    phase === 'new'
      ? 'card.phase.new'
      : phase === 'learning'
        ? 'card.phase.learning'
        : 'card.phase.relearning';
  return (
    <span className={`${styles.phasePill} ${styles[`phase_${phase}`]}`}>
      {t(labelKey)}
    </span>
  );
}

/**
 * Provenance line. Shows a clickable "источник" link when a URL is
 * available, otherwise just the static text. License / attribution
 * are intentionally NOT rendered here — the per-card provenance is
 * documented in `SOURCES.md` and the link itself goes straight to
 * the source page, so users who care can find everything in one
 * click. Keeps the back of the card visually quiet.
 */
function SourceLine({
  card,
  t,
}: {
  card: CardData;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  if (card.sourceUrl) {
    return (
      <div className={styles.source}>
        <a
          className={styles.sourceLink}
          href={card.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('card.source.label')}
        </a>
      </div>
    );
  }
  return (
    <div className={styles.source}>
      <span className={styles.sourceLinkStatic}>{t('card.source.label')}</span>
    </div>
  );
}

/**
 * Optional Kazakh + Russian example sentence for the back of the card.
 *
 * Two sources, in priority order:
 *   1. `card.example` — explicit per-card Kazakh example (none
 *      populated today; reserved for future bulk additions).
 *   2. `getCuratedExample(kazakh)` — the hand-curated starter set
 *      in `src/data/examples.ts` (~80 of the most common A1 words).
 *
 * If neither has a match, the component renders nothing — the back
 * of the card stays clean instead of a half-filled placeholder.
 * Words not in the curated set still get a perfectly usable card;
 * missing examples are honest gaps, not stubs.
 */
function ExampleBlock({
  card,
  t,
}: {
  card: CardData;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  // Priority: explicit `card.example` first, then curated lookup.
  const kkExample = card.example?.trim() || getCuratedExample(card.kazakh)?.kk;
  const ruExample = getCuratedExample(card.kazakh)?.ru;
  if (!kkExample) return null;
  return (
    <div className={styles.example} aria-label={t('card.example.aria')}>
      <div className={styles.exampleKk}>{kkExample}</div>
      {ruExample ? (
        <div className={styles.exampleRu}>{ruExample}</div>
      ) : null}
    </div>
  );
}
