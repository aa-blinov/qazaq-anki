---
name: qazaq-anki
description: Warm paper-and-clay system. Editorial serif (Newsreader) for Kazakh content, neutral sans (Inter) for everything else; one terracotta accent; one warm ground.
source: src/styles/global.css
---

# Design

This document records the **incumbent** visual system of qazaq-anki as it
ships today. Every value below mirrors `src/styles/global.css` verbatim —
that file is the source of truth; if a token changes there, update both.

## Visual world

Warm, paper-grounded, editorial. Reads like a well-typeset study notebook:
neutral cream surface, one terracotta accent that earns every use, and a
serif face reserved for the Kazakh word so the learner feels the difference
between the language they know and the language they are learning.

## Colors

### Light theme (`html` default)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#FAF7F2` | Page ground — warm off-white |
| `--surface` | `#FFFFFF` | Card / panel ground |
| `--surface-2` | `#F2EEE6` | Subtle inset, secondary panel |
| `--surface-3` | `#E9E3D6` | Stronger inset, disabled fills |
| `--text` | `#1F1E1B` | Body copy |
| `--text-strong` | `#0E0D0B` | Headings, important emphasis |
| `--text-muted` | `#6B6862` | Secondary copy |
| `--text-subtle` | `#948F86` | Captions, timestamps |
| `--border` | `#E8E2D2` | Default rule |
| `--border-strong` | `#D7CFBE` | Active rule |
| `--accent` | `#C96442` | Primary CTA, the one brand colour |
| `--accent-hover` | `#A8522F` | Hover state on accent |
| `--accent-soft` | `#F4E4D6` | Accent fill, soft tag background |
| `--accent-ink` | `#5B2A14` | Text on accent surface |
| `--ok` | `#5A7D3F` | Success |
| `--warn` | `#B68A1B` | Warning |
| `--danger` | `#B54141` | Error / destructive |

### Dark theme (`[data-theme="dark"]`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#1A1916` | Page ground — warm near-black |
| `--surface` | `#232220` | Panel ground |
| _others_ | _see source_ | Inverted ramps in the same warm register |

Dark mode is not a separate design language; it is the same warm register
at lower luminance. No neon, no cool blues, no separate accent ramp.

### Print

`@media print` forces the light palette because dark mode wastes ink and
printed pages are usually photocopied.

## Typography

- **Sans (UI):** Inter, with `-apple-system, BlinkMacSystemFont, 'Segoe UI',
  Roboto, system-ui` as platform fallbacks. UI copy, buttons, navigation,
  every label the learner reads in Russian.
- **Display (Kazakh content):** Newsreader, with `Iowan Old Style`,
  `Apple Garamond`, Georgia, `Times New Roman` as fallbacks. Used for the
  Kazakh word on a flashcard and for `.kazakh` class. The contrast between
  the two faces is the product's main typographic signal: Russian reads
  neutral and familiar, Kazakh reads as something worth pausing for.
- **Root size:** `15px * var(--font-scale)`. The user picks
  `sm | md | lg | xl`; the scale token lives in `theme-init.js`.
- **Type scale:** step ramp defined in `src/styles/global.css` — body, h1
  through h4, plus the `.kazakh` display size. Every literal `font-size`
  lands on a step.

## Geometry

- Radii: `--radius-sm` 6px, `--radius-md` 8px, `--radius-lg` 12px,
  `--radius-xl` 16px, `--radius-pill` 999px. The product stays in the
  middle of that range; nothing below 6px or above 16px except pills.
- Shadows: `--shadow-xs / sm / md / lg`, all warm-tinted
  (`rgba(31, 30, 27, …)`) with offset + blur. No zero-offset glow halos.
  No hard offset shadows.

## Spacing

Step-based scale; the detector in Impeccable (when hooked) will check
tight groups and generous separation — read the computed margins in the
rendered output, not the literal `--space-*` value.

## Components (current)

| Component | File | Notes |
|---|---|---|
| Flashcard | `src/components/Flashcard.module.css` | The study screen. Front = Russian prompt, back = Kazakh word with audio button. |
| Stats page | `src/components/LevelMasteryRings.module.css`, `EaseHistogram.module.css`, `MiniHeatmap.module.css` | Per-CEFR mastery rings, ease distribution, study heatmap. |
| Onboarding modal | `src/components/OnboardingModal.module.css` | First-run card. |
| Add-card modal | `src/components/AddCardModal.module.css` | User-authored cards. |
| Error boundary | `src/components/ErrorBoundary.module.css` | Recovery state with Russian copy. |
| Skeleton | `src/components/Skeleton.module.css` | Loading state. |
| Site footer | `src/components/SiteFooter.module.css` | Footer chrome. |

## Browser surfaces

- **Theme is applied synchronously** by `public/theme-init.js` in `<head>`
  before first paint, to avoid a light-flash-to-dark flicker on reload.
  Any future design hook or runtime must run *after* `theme-init.js`, never
  before it.
- **Text selection** colours are themed via CSS; default browser blue is
  replaced with the accent at low alpha.
- **Caret, scrollbars, focus rings, tabular numerals** must be themed from
  the palette — not left as platform defaults. Audit list:
  `::selection`, `::-webkit-scrollbar*`, `input { caret-color }`,
  `*:focus-visible`, `<table>` numerals.

## Anti-patterns already present (to retire, not to extend)

- **[inferred]** None observed on a quick read of the CSS. The accent is
  used sparingly, no gradient text, no glassmorphism, no hard offset
  shadows, no eyebrow labels. If a future change reintroduces any of
  these, the Impeccable detector (when installed) will flag it.

## State coverage (current)

| State | Coverage |
|---|---|
| Hover | Buttons + interactive rows |
| Disabled | Forms, ratings during submit |
| Loading | `<Skeleton />` for the deck load |
| Error | `<ErrorBoundary />` with Russian recovery copy |
| Empty | Empty-deck state on the Browse screen |
| Keyboard focus | Visible ring token applied via `:focus-visible` |
| Reduced motion | `@media (prefers-reduced-motion)` short-circuits animations |

## What this file does not cover yet

- Sound design (TTS playback and waveform feedback).
- Touch and gesture design on narrow screens — the responsive layout
  exists but no documented breakpoint map.
- Print layout beyond forced palette.