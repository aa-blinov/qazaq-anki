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
| `--accent` | `#C96442` | Brand accent — fills that carry **no text** (borders, meters, rules) |
| `--accent-hover` | `#A8522F` | Hover state on accent |
| `--accent-soft` | `#F4E4D6` | Accent fill, soft tag background |
| `--accent-solid` | `#A8522F` | Fill for accent surfaces that **carry text** |
| `--accent-fg` | `#FAF7F2` | Ink for text on `--accent-solid` |
| `--ok` | `#5A7D3F` | Success |
| `--warn` | `#B68A1B` | Warning — fill only |
| `--warn-text` | `#8A6A12` | Warning used as **text** |
| `--warn-fg` | `#1F1E1B` | Ink for text on `--warn` |
| `--danger` | `#B54141` | Error / destructive |

### Ink on filled surfaces — the rule that matters

`--accent` is mid-tone. White on it is **3.65:1** and `--text` on it is
**4.27:1** — neither reaches the 4.5:1 AA floor for body-sized labels, so
**no ink works on bare `--accent`**. The system therefore splits the role:

| Pair | Light | Dark | Contrast |
|---|---|---|---|
| `--accent-solid` + `--accent-fg` | `#A8522F` + `#FAF7F2` | `#E08662` + `#1A1916` | 5.02:1 / 6.49:1 |

The dark theme flips direction rather than value: its `--accent` is already a
light tint, so the ink becomes the dark ground. Same two tokens, opposite
direction.

**Use the pair together or not at all.** `var(--accent)` alone is correct for
fills with no text. Any rule that puts text on an accent surface must set
`background: var(--accent-solid); color: var(--accent-fg)`.

`--accent-ink` is **not** the text-on-accent token. On `--accent-solid` it
measures 3.01:1 in light and 1.92:1 in dark. It exists for accent-on-neutral
pairing (accent text, neutral background), which is a different job.

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

## Naming

Every custom property is defined in `src/styles/global.css` and used by its
exact name. There is one convention, and it is the one in that file:

`--surface`, `--surface-2/3`, `--text`, `--text-muted`, `--text-subtle`,
`--border`, `--accent*`, `--ok*`, `--warn*`, `--danger*`, `--font-*`,
`--radius-*`, `--shadow-*`.

**Do not reference a token that is not defined there.** A `var(--name, #fallback)`
for an undefined `--name` silently resolves to the fallback, which is how this
codebase accumulated twelve phantom tokens across three competing conventions
(`--ink*`, `--color-*`, `--surface-0/1`) before they were collapsed. Where a
fallback is genuinely wanted for a caller-supplied override, the token still has
to exist here first.

A quick check after touching CSS:

```bash
node -e 'const fs=require("fs"),p=require("path");
const w=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?w(p.join(d,e.name)):[p.join(d,e.name)]);
const f=w("src").filter(x=>x.endsWith(".css")),d=new Set(),u=new Set();
for(const x of f){const t=fs.readFileSync(x,"utf8");
for(const m of t.matchAll(/(--[a-z0-9-]+)\s*:/g))d.add(m[1]);
for(const m of t.matchAll(/var\(\s*(--[a-z0-9-]+)/g))u.add(m[1]);}
const bad=[...u].filter(x=>!d.has(x));
console.log(bad.length?bad:"all tokens resolve");'
```

## Motion

### The tokens

Four durations and three curves, all in `src/styles/global.css`. The app
had twelve hardcoded durations (`0.06s` … `1.4s`) and six different easing
curves spread across twenty-three files, and the curve most of them used
was the CSS `ease` keyword — a browser default nobody had chosen.

| Token | Value | The job |
|---|---|---|
| `--dur-press` | 100ms | The control acknowledging the finger. Under 150ms this reads as physical; longer and the button feels like it is lagging the hand. |
| `--dur-fast` | 140ms | A routine state change: hover, colour, a row settling. The workhorse. |
| `--dur-base` | 220ms | An overlay or a state swap: a modal, a toast, the scrim. |
| `--dur-slow` | 420ms | The authored moment, on the study loop. Reserved on purpose — if everything is 400ms, nothing is. |

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Every arrival. Exponential deceleration: fast at the start, settled at the end — how a thing that was travelling comes to rest. |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Loops that go out and come back (skeleton shimmer, audio pulse). |
| `--ease-linear` | `linear` | Continuous rotation only. Any easing on a spinner reads as stutter. |

Loop *periods* (the shimmer's 1.4s cycle, the spinners' 1s turn) stay
literal. They are cycle lengths, not transition durations, and folding
them into the ramp would mean inventing a token for a number that only
two rules use.

**An entrance earns its full length; an exit uses `--dur-press`,** because
leaving should be quicker than arriving.

### The focal moment: the card lands

The study screen is the product, and it runs about twenty cards a session.
Each card used to arrive with a 320ms `opacity` + `translateY(6px)`
fade-and-rise — the generic entrance every generated card UI ships with,
and it also collided with the crossfade underneath it, since the same
element was both arriving and swapping.

It now **lands.** The surface is opaque on frame one: a card that fades in
reads as an overlay floating above the page, a card whose shadow tightens
onto it reads as contact with the page. `box-shadow` runs wide-and-soft →
`--shadow-md` over `--dur-slow`, with a 1.5% scale as the last of the
descent. `cardLand` lives on `.face`, because that is where the shadow is.

### Everything else

Meters — `.progressFill`, `.topicProgressFill`, `.fill` — animate
`transform: scaleX()` with `transform-origin: left center`, never `width`.
A width animation forces synchronous layout every frame and these bars sit
on the study loop. The inline style sets `scaleX(0..1)`; the CSS supplies
`width: 100%` and the transition. The mastery rings sweep
`stroke-dashoffset` the same way.

Each module carries its own `prefers-reduced-motion` override, because
class names in CSS modules are hashed and a global rule cannot reach them.

### The blanket that was switched off

`global.css` used to end with:

```css
*, *::before, *::after {
  animation-duration: 0.001ms !important;
  transition-duration: 0.001ms !important;
  ...
}
```

Its `@media (prefers-reduced-motion: reduce)` opening line had been
deleted, leaving a stray `}` at the end of the file and the rule itself at
the top level. An `!important` declaration at the top level beats every
normal declaration in the cascade regardless of specificity — so this was
not a reduced-motion path at all. It was turning off **every transition and
animation in the app, for every user, on every device**, and no motion
token in the stylesheet could have overridden it.

It is gone, and blanket-off was the wrong behaviour as well as the wrong
implementation: reduced motion means fewer and gentler animations, not the
removal of feedback. A hover that snaps instead of crossfading, a toast
that appears with no arrival, a progress bar that teleports — those cost
real information, and a learner on this app studies for twenty minutes at a
stretch.

The reduced path is per-component and intentional:

| Component | What is reduced | What survives |
|---|---|---|
| `Flashcard` | card land, audio pulse, synth spinner | the face crossfade (opacity only) |
| `AddCardModal`, `OnboardingModal`, `ConfirmDialog`, `StatsPage` dialog | the 8px rise and the 2% scale | the opacity fade |
| `StatsPage`, `StudyPage` toasts | the 8px rise | the opacity fade |
| `StatsPage`, `HomePage`, `StudyPage`, `EaseHistogram` | bar sweeps | the filled value |
| `LevelMasteryRings` | ring sweeps | the arc |
| `SettingsPage`, `Flashcard` | both infinite loops | colour, `disabled`, and the `aria-label` that names the state |
| `TopicSelect` | the chevron half-turn | `[aria-expanded]` |
| `global.css` | the skip link slide-in | — |

Colour and opacity transitions are deliberately left alone everywhere else.
They carry state and confirmation, and have no spatial component to
trigger a vestibular response.

The one shared piece is `@keyframes arrive-fade` — opacity in, opacity
out, no travel — used by all four overlay types. CSS Modules localises
literal animation names, so a module that names a keyframe it does not
declare ends up referencing a hashed name that does not exist and the
animation silently does not run. The modules therefore reach it through
`var(--anim-arrive)`, which the localiser leaves alone.

### Two paths that were unreachable

The browse list's edit and delete buttons sit at `opacity: 0` and fade in
on row hover — the right call for a list you mostly read. It was, however,
only ever hover:

- **Keyboard.** A tab stop at `opacity: 0` is still a tab stop, so focus
  landed on a button with nothing drawn on it, and a keyboard user could
  tab the whole word list and never know the actions existed.
- **Touch.** `@media (hover: none)` has no hover to fire, so on a phone
  there was no way at all to edit or delete a card you had added.

Both now have the treatment the stats KPI tile already had: `:focus-visible`
alongside `:hover`, and a permanent 75% under `(hover: none)`.

### Rules

- Do not write a duration or a curve literally. Use the tokens.
- Do not animate a layout-driving property (`width`, `height`, `top`,
  `left`, margins) when a transform will do.
- Any new animation needs a `prefers-reduced-motion` alternative in the
  same file, and a reason that survives the sentence "removing this
  would lose nothing".
- The mobile nav drawer still hard-cuts open and closed. Not yet addressed.

## Callouts

Error, hint, and toast surfaces use a 1px `border-left` at most, tinted with the
matching semantic token, over a `--*-soft` or `--surface-2` fill. A thicker
colored left rule is a recognisable generated-UI signature and carries no
information the fill and text colour do not already carry.

## The SM-2 rating scale

The four study grades are an ordered semantic scale, so each carries a colour
identity. This is the one place in the product where colour encodes something
the type does not: a learner presses one of these hundreds of times per session,
and before the scale existed the four buttons were visually identical, forcing a
label read on every single choice.

**No new hues were introduced.** Each state reuses a role the palette already
had — `danger`, `warn`, `ok`, `accent` — given a job in the study loop:

| Grade | Role | Resting label | Light | Dark |
|---|---|---|---|---|
| Снова | danger | red | `#A03333` | `#DA7474` |
| Трудно | warn | amber | `#7A5E10` | `#D9B25B` |
| Хорошо | ok | green | `#4E6E36` | `#9CC074` |
| Легко | accent | clay | `#96492A` | `#E08662` |

Three roles per state, because they are three different jobs:

- `--<state>-text` — resting label **and** resting keyline
- `--<state>-fill` — pressed / hovered fill
- `--<state>-ink` — pressed label

The button surface itself is the neutral `--surface`, the same one every other
control in the app sits on.

### Why there is no `soft` role

There was a fourth role, `--<state>-soft`, for a tinted resting surface. It is
gone, and this is the one place the product was genuinely too loud.

Four full-surface tints sat directly under the flashcard — which is the actual
work. On the study screen the learner is trying to recall the meaning of a
Kazakh word, and the brightest, heaviest thing on the page was the answer
widget sitting below it. It cost twice:

- **Intensity.** Four saturated blocks, on screen for effectively the whole
  session, out-shouting the card.
- **Identity.** The `Легко` state reuses the accent role, so a large terracotta
  block made the product's single accent read as "one of four peer colours"
  rather than as the accent. The one colour the whole product spends carefully
  had been diluted into a peer.

The state identity survives on a 1px keyline and the label colour, both
**permanent** — so it never depends on hover firing, which matters on touch,
where `@media (hover: none)` means the pressed fill is the only state change a
finger will ever see. The scale still reads as an ordered red → amber → green →
clay row at a glance.

The solid fill now lands only on hover and press. That is what "weight
discipline" was always supposed to mean, and the tinted resting state was quietly
undermining it: with all four buttons already saturated, the press had nothing
left to add.

Dropping the tint also **raised** resting contrast, because the state colour now
sits on white rather than on a tint of itself. In light mode `--again-text`
went from 4.62:1 on `--again-soft` to **6.96:1** on `--surface`; the old 3.99:1
worst case is now 5.82:1.

Every pairing verified in both themes: resting **5.10–7.92:1**, pressed
**4.73–8.76:1**, keyline 5.10:1 and above.

**Colour is never the only cue.** The Russian label and the 1–4 keyboard
shortcut are always present on every button.

Implementation: `data-grade` carries the SM-2 grade key; CSS selects
`.ratingBtn[data-grade='…']`. Do not add per-state class names in the component —
the attribute keeps the grade in one place.

## What a "quieter" pass found

A pass to reduce intensity looked at every surface — home, study, browse, stats,
settings — in both themes, and this design is already restrained: one warm
ground, one accent, no gradients, no glass, no glow, no gamification, and four
earlier passes that each removed noise rather than adding it.

The intensity was not distributed. It was concentrated in one place, and that
place was the SM-2 rating row.

**Deliberately left alone:**

- **The study filter stack.** Three full-width bordered selects above the card
  is the most box-like thing on the screen, and it does out-weigh the card
  visually. It is not an oversight: `StudyPage.module.css` states the controls
  stretch to the full column width "so they read as form fields, not toolbar
  chips," and a full-width field is a stronger control affordance than a narrow
  chip. Quieting it would trade usability for a preference.
- **The `A1` level pill.** Solid accent, but it marks the *active filter*. With
  the rating row no longer competing, it is the only solid accent mass on the
  screen and it means exactly one thing.
- **The stats page.** The accent appears on the rings and the histogram as one
  systematic use across a whole screen, not as scattered highlights.
- **The palette itself.** Quieter is not greyer. The warm ground and the
  terracotta are the product's identity; desaturating them would produce a
  different, less specific product.
- **Type, motion, spacing.** The typeset and animate passes landed on this
  code minutes ago and both measured correct.

The general rule this surfaced: when a product has one accent and a semantic
scale, check whether the scale is borrowing the accent. `--easy-*` reuses the
accent role, so any *large* surface in that state silently competes with every
CTA in the app. Colour identity belongs on a keyline and a label; area belongs
to the one thing the screen is for.

## Type

Two families, both loaded from Google Fonts with `display=swap` and four
weights each: **Inter** for interface, **Newsreader** for the Kazakh word and
headings. The contrast between them is the product's main typographic signal —
Russian reads neutral and familiar, Kazakh reads as something worth pausing for.

### The ramp

Use these tokens, not raw `rem` values. Role names describe purpose.

| Token | Value | md | sm | Role |
|---|---|---|---|---|
| `--text-micro` | 0.78rem | 11.7px | 10.8px | shortcut chips, decorative markers |
| `--text-meta` | 0.85rem | 12.8px | 11.7px | captions, timestamps, helper text |
| `--text-small` | 0.95rem | 14.3px | 13.1px | secondary UI, dense rows |
| `--text-body` | 1rem | 15px | 13.8px | default reading and interface size |
| `--text-lead` | 1.15rem | 17.3px | 15.9px | lead paragraphs, card sentences |
| `--text-title` | 1.5rem | 22.5px | 20.7px | section headings |
| `--text-display` | 2.4rem | 36px | 33.1px | page and hero headings |

**The floor is the point.** The app once carried 43 distinct sizes, with eleven
steps packed between 0.65rem and 0.78rem — 9.8px to 11.7px. At that size nobody
can tell 0.72 from 0.733, so those steps were not carrying distinct jobs. The
tail is now four steps, and the smallest role is 11.7px instead of 9px.

Line height is per-role, not one universal ratio (`--lh-micro` 1.35 through
`--lh-display` 1.12) — small type needs more leading than large type to stay
readable, and a display heading needs almost none.

**Never set a font size in `px`.** `px` does not follow `--font-scale`, so a
`font: 400 13px/1.45 …` shorthand silently opts that element out of the user's
text-size setting. The stats toast and the mastery-ring legend had exactly this
bug: they stayed 13px while everything around them scaled.

### Root size

Root is 15px, not the 16px web default. This is a dense product — a
3,996-row word list and a stats page full of meters — and that density was
deliberately tuned at 15px. The `sm` setting is 0.92×, not 0.875×, so the
compact step cannot drive the smallest role below ~10.8px. Raising the root to
16px is a whole-product proportion change and needs its own pass with
viewport verification, not a quiet side effect of a type cleanup.

### Russian specifics

- Headings use `text-wrap: balance`. Russian wraps unpredictably, and a
  two-word heading can break one word per line in a narrow card.
- Onboarding step bodies are the only sustained prose in the product and are
  capped at `62ch` rather than a px width, so the measure tracks the user's
  text-size setting instead of drifting from it.
- Body copy carries a little extra leading: Russian runs longer than English
  at the same character count, and two-line labels crowd the element below.

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
| Reduced motion | Per-component, with intentional alternatives — see [Motion](#motion) |

## What this file does not cover yet

- Sound design (TTS playback and waveform feedback).
- Touch and gesture design on narrow screens — the responsive layout
  exists but no documented breakpoint map.
- Print layout beyond forced palette.
- The mobile nav drawer opens and closes with no transition at all. It is
  the only navigation on narrow screens and the only overlay in the app
  that does not use the shared arrival vocabulary.
- The undo toast overlaps the "Показать ответ" button on the study screen
  at desktop width. A layout collision rather than a motion one, but it is
  part of why the toast's arrival is easy to miss.
