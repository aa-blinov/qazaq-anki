/**
 * TTS playback-speed preference. Stored in localStorage under
 * `aq:ttsSpeed` as a stringified float (default '1'). The value
 * is applied to every <audio> element created by the Flashcard
 * before play, so a Settings change takes effect on the next
 * spoken word.
 *
 * Settings page mutates this through `setTtsSpeed()` and
 * components re-read through `getTtsSpeed()`. We also fire a
 * 'tts-speed-changed' CustomEvent on `window` so that any
 * already-mounted <audio> elements (e.g. the current card's
 * speak button mid-playback) can pick up the new rate without
 * having to wait for the next card.
 */

const STORAGE_KEY = 'aq:ttsSpeed';
const DEFAULT = 1;
const ALLOWED = [0.75, 1, 1.25, 1.5] as const;

export type TtsSpeed = (typeof ALLOWED)[number];

function read(): TtsSpeed {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT;
    // Snap to the closest allowed step so a stray value like
    // "0.9" doesn't get applied — the user picked one of the
    // presets in the UI and we want to honour that choice.
    return ALLOWED.reduce((best, step) =>
      Math.abs(step - n) < Math.abs(best - n) ? step : best,
    );
  } catch {
    return DEFAULT;
  }
}

export function getTtsSpeed(): TtsSpeed {
  return read();
}

export function setTtsSpeed(speed: TtsSpeed): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(speed));
  } catch {
    // localStorage may be disabled (private mode, quota). The
    // change simply won't persist across reloads — the next
    // session will start with the default again.
  }
  // Notify any in-flight audio elements. We don't carry the
  // value in the event — listeners re-read via `getTtsSpeed()`
  // so the source of truth stays in localStorage.
  window.dispatchEvent(new CustomEvent('tts-speed-changed'));
}

/** Subscribe to speed changes. Returns an unsubscribe fn. */
export function onTtsSpeedChange(handler: () => void): () => void {
  const wrapped = () => handler();
  window.addEventListener('tts-speed-changed', wrapped);
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) handler();
  });
  return () => {
    window.removeEventListener('tts-speed-changed', wrapped);
  };
}

export const TTS_SPEED_OPTIONS: ReadonlyArray<{ value: TtsSpeed; label: string }> = [
  { value: 0.75, label: '0.75×' },
  { value: 1, label: '1×' },
  { value: 1.25, label: '1.25×' },
  { value: 1.5, label: '1.5×' },
];
