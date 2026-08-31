/**
 * Per-screen first-run tour.
 *
 * The "have I seen this tour?" state is owned by `OnboardingContext`,
 * which reads from a dedicated `users.onboardingSeen` column on the
 * server. That column is the source of truth — the local cache
 * (`aq:onboarding:*` in localStorage) used to be the source and
 * was the cause of "the tour re-appeared after a fresh device"
 * bugs. Now we have a single source of truth, per-user, per-screen.
 *
 * Why we keep a local mirror at all: the optimistic `markSeen`
 * call closes the modal immediately, without waiting for the
 * server round-trip. The mirror is also what `/api/me` returns
 * on the next boot, so the first paint after login has the
 * correct answer and the modal doesn't flash open.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  X,
  ArrowRight,
  Repeat,
  GraduationCap,
  Search,
  Library,
  BarChart3,
  Layers,
} from 'lucide-react';
import { useLang } from '../contexts/LanguageContext';
import { useOnboarding, type TourScreen } from '../contexts/OnboardingContext';
import styles from './OnboardingModal.module.css';

export type { TourScreen };

/** Bump this when the content of any tour screen changes meaningfully.
 *  The value is informational only — we don't encode it in the
 *  seen key anymore, so changing it doesn't re-show old tours. */
export const ONBOARDING_VERSION = 2;

interface OnboardingModalProps {
  screen: TourScreen | null;
  /** Force the modal open regardless of the "seen" flag. The top
   *  bar's (i) button uses this to let a returning user re-read
   *  the tour. */
  forceOpen?: boolean;
  onClose?: () => void;
}

interface StepDef {
  num: string;
  icon: ReactNode;
  titleKey: string;
  bodyKey: string;
}

const SCREEN_CONTENT: Record<
  TourScreen,
  { titleKey: string; subtitleKey: string; steps: StepDef[] }
> = {
  study: {
    titleKey: 'onboarding.study.title',
    subtitleKey: 'onboarding.study.subtitle',
    steps: [
      {
        num: '1',
        icon: <ArrowRight size={16} aria-hidden="true" />,
        titleKey: 'onboarding.study.step1.title',
        bodyKey: 'onboarding.study.step1.body',
      },
      {
        num: '2',
        icon: <Repeat size={16} aria-hidden="true" />,
        titleKey: 'onboarding.study.step2.title',
        bodyKey: 'onboarding.study.step2.body',
      },
      {
        num: '3',
        icon: <GraduationCap size={16} aria-hidden="true" />,
        titleKey: 'onboarding.study.step3.title',
        bodyKey: 'onboarding.study.step3.body',
      },
    ],
  },
  browse: {
    titleKey: 'onboarding.browse.title',
    subtitleKey: 'onboarding.browse.subtitle',
    steps: [
      {
        num: '1',
        icon: <Search size={16} aria-hidden="true" />,
        titleKey: 'onboarding.browse.step1.title',
        bodyKey: 'onboarding.browse.step1.body',
      },
      {
        num: '2',
        icon: <Library size={16} aria-hidden="true" />,
        titleKey: 'onboarding.browse.step2.title',
        bodyKey: 'onboarding.browse.step2.body',
      },
    ],
  },
  stats: {
    titleKey: 'onboarding.stats.title',
    subtitleKey: 'onboarding.stats.subtitle',
    steps: [
      {
        num: '1',
        icon: <BarChart3 size={16} aria-hidden="true" />,
        titleKey: 'onboarding.stats.step1.title',
        bodyKey: 'onboarding.stats.step1.body',
      },
      {
        num: '2',
        icon: <Layers size={16} aria-hidden="true" />,
        titleKey: 'onboarding.stats.step2.title',
        bodyKey: 'onboarding.stats.step2.body',
      },
    ],
  },
};

export function OnboardingModal({
  screen,
  forceOpen = false,
  onClose,
}: OnboardingModalProps) {
  const { t } = useLang();
  const { isSeen, markSeen } = useOnboarding();
  // `open` is the only thing the render actually depends on. We
  // drive it off an effect that always follows the latest
  // `isSeen(screen)` decision — no caching by "lastDecidedFor"
  // because that previously caused the modal to lock in its
  // decision before the server's view of the seen-map had loaded.
  // Following `isSeen` directly means the modal stays closed
  // during hydration and pops open (or stays closed) as soon as
  // the server's answer arrives.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!screen) {
      setOpen(false);
      return;
    }
    if (forceOpen) {
      // User explicitly asked to re-read the tour (e.g. the (i)
      // button). The modal stays open until they dismiss it
      // via the "Got it" / X / outside click. We don't
      // re-evaluate `isSeen` while forceOpen is on, so the user
      // can review the tour even for screens they've already
      // marked as seen.
      setOpen(true);
      return;
    }
    // Normal path: open iff the server says "not seen yet".
    // `isSeen` already returns true for the "still hydrating"
    // case, so the modal won't flash open before the user
    // record loads.
    setOpen(!isSeen(screen));
  }, [screen, forceOpen, isSeen]);

  if (!screen || !open) return null;

  const content = SCREEN_CONTENT[screen];

  // `markSeen: true`  — the user explicitly dismissed the tour
  //                     (clicked "Got it" or the close button).
  //                     This is the *only* path that mutates the
  //                     per-screen flag. We deliberately do NOT
  //                     mark on backdrop click so a user who
  //                     clicked outside by accident can re-open
  //                     the tour from the (i) button and not have
  //                     it silently swallowed.
  // `markSeen: false` — pure close. The user is reviewing the
  //                     tour from the (i) button. The flag stays
  //                     at its current value, and a future
  //                     navigation back to this screen won't re-
  //                     show the tour unless they also clear the
  //                     server-side flag (e.g. via a "reset
  //                     onboarding" admin tool — out of scope).
  const dismiss = (commit: boolean) => {
    if (commit) {
      void markSeen(screen);
    }
    setOpen(false);
    onClose?.();
  };

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      // Backdrop click just closes; does NOT mark as seen.
      onClick={() => dismiss(false)}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label={t('onboarding.cta.close')}
          // The X button DOES mark as seen — it's an explicit
          // "I'm done" gesture, just like the "Got it" CTA.
          onClick={() => dismiss(true)}
        >
          <X size={16} />
        </button>

        <header className={styles.head}>
          <span className={styles.kicker}>
            <GraduationCap size={14} aria-hidden="true" />
            {t(content.subtitleKey)}
          </span>
          <h2 id="onboarding-title" className={styles.title}>
            {t(content.titleKey)}
          </h2>
        </header>

        <div className={styles.steps}>
          {content.steps.map((s) => (
            <Step
              key={s.num}
              num={s.num}
              icon={s.icon}
              title={t(s.titleKey)}
              body={t(s.bodyKey)}
            />
          ))}
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className="btn btn--lg"
            onClick={() => dismiss(true)}
          >
            {t('onboarding.cta.start')}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Helper for the top bar: tells the caller whether the current screen
 *  has a tour, and what its TourScreen id is. */
export function tourScreenFromPath(pathname: string): TourScreen | null {
  if (pathname.startsWith('/study')) return 'study';
  if (pathname.startsWith('/browse')) return 'browse';
  if (pathname.startsWith('/stats')) return 'stats';
  return null;
}

function Step({
  num,
  icon,
  title,
  body,
}: {
  num: string;
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <article className={styles.step}>
      <span className={styles.stepNum}>{num}</span>
      <span className={styles.stepIcon} aria-hidden="true">
        {icon}
      </span>
      <div>
        <h3 className={styles.stepTitle}>{title}</h3>
        <p className={styles.stepBody}>{body}</p>
      </div>
    </article>
  );
}
