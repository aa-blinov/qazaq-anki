---
name: qazaq-anki
description: Warm paper-and-clay system. Editorial serif (Source Serif 4) for Kazakh content, neutral sans (Inter) for everything else; one terracotta accent; one warm ground.
source: src/styles/global.css
colors:
  # Keys are the real custom property names in src/styles/global.css, not
  # invented slugs: an agent generating a screen must emit variables that
  # resolve. Descriptive names for each live in .impeccable/design.json
  # under extensions.colorMeta.<key>.displayName. Values are the LIGHT theme,
  # which is the default; dark values are in the same file under colorMeta.
  #
  # 35 entries, and that count is the contract: every one of them is
  # referenced by at least one `var()` in src/ or landing/. A token defined
  # in global.css but referenced nowhere does NOT belong here — an agent
  # that "discovers" it would emit a live-looking variable with no contract
  # behind it. (--surface-hover is currently in exactly that position; see
  # the Drift section at the foot of this file.)
  bg: "#FAF7F2"
  surface: "#FFFFFF"
  surface-2: "#F2EEE6"
  surface-3: "#E9E3D6"
  text: "#1F1E1B"
  text-strong: "#0E0D0B"
  text-muted: "#6B6862"
  border: "#E8E2D2"
  border-strong: "#D7CFBE"
  accent: "#C96442"
  accent-solid: "#A8522F"
  accent-hover: "#A8522F"
  accent-soft: "#F4E4D6"
  accent-ink: "#5B2A14"
  accent-fg: "#FAF7F2"
  # A second accent surface for callers that need the clay fill without the
  # ink pairing — the hero CTA and the "due now" stat tile. It is a lighter
  # clay than --accent-solid, so it is a surface, never a text background.
  accent-strong: "#A8522F"
  ok: "#5A7D3F"
  warn: "#B68A1B"
  warn-text: "#7A5E10"
  # The soft amber wash behind a warning callout, and the ink that sits on
  # it. Split like --accent-solid/--accent-fg: the wash is a surface, the
  # fg is the only colour text on it may use.
  warn-soft: "#F4EAC7"
  warn-fg: "#1F1E1B"
  danger: "#B54141"
  # The wash behind a destructive callout, an error field glow, and the
  # error-boundary panel.
  danger-soft: "#F5DDDD"
  # The four grade inks. Each is the foreground for its grade's *pressed*
  # fill, and each inverts in dark mode because the pressed fill inverts
  # with the theme. A grade button at rest is never tinted — see the
  # Commitment Rule in Colors.
  again-text: "#A03333"
  again-fill: "#B54141"
  again-ink: "#FFFFFF"
  hard-text: "#7A5E10"
  hard-fill: "#B68A1B"
  hard-ink: "#1F1E1B"
  good-text: "#4E6E36"
  good-fill: "#5A7D3F"
  good-ink: "#FFFFFF"
  easy-text: "#96492A"
  easy-fill: "#A8522F"
  easy-ink: "#FAF7F2"
typography:
  display:
    fontFamily: "'Source Serif 4', 'Iowan Old Style', 'Apple Garamond', Georgia, 'Times New Roman', serif"
    fontSize: "2.4rem"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-0.015em"
  title:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif"
    fontSize: "1.5rem"
    lineHeight: 1.25
    fontWeight: 600
  lead:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif"
    fontSize: "1.15rem"
    lineHeight: 1.6
    fontWeight: 400
  body:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif"
    fontSize: "1rem"
    lineHeight: 1.55
    fontWeight: 400
  # The ramp has seven steps, and body/label alone skipped two of them:
  # --text-small (0.95rem) and --text-meta (0.85rem) are the most-used sizes
  # in the product — every button, nav link, level pill, stat caption and
  # card sub-line resolves to one of the two. Leaving them out of the
  # frontmatter made a documented role look like a hardcoded size.
  small:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif"
    fontSize: "0.95rem"
    lineHeight: 1.5
    fontWeight: 500
  meta:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif"
    fontSize: "0.85rem"
    lineHeight: 1.45
    fontWeight: 500
  label:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif"
    fontSize: "0.78rem"
    lineHeight: 1.35
    fontWeight: 500
    letterSpacing: "0.02em"
  # Mono is a real role in this system, not a costume: it carries the
  # install commands on the landing, the keyboard-shortcut chips, and
  # the `--font-mono` token the app uses for code and measurement. It
  # was missing here, so the detector flagged every legitimate use.
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
    fontSize: "0.92rem"
    lineHeight: 1.6
    fontWeight: 400
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "999px"
components:
  # Sub-tokens are limited to the 8 props Stitch's schema accepts
  # (backgroundColor, textColor, typography, rounded, padding, size, height,
  # width). Shadows, focus rings and transitions do not fit here — they are in
  # the sidecar and in the Components section below.
  button-primary:
    backgroundColor: "{colors.accent-solid}"
    textColor: "{colors.accent-fg}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "38px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "38px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "36px 40px"
  rating-again:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.again-text}"
    rounded: "{rounded.md}"
    height: "56px"
  rating-good:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.good-text}"
    rounded: "{rounded.md}"
    height: "56px"
  rating-good-hover:
    backgroundColor: "{colors.good-fill}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    height: "56px"
---

# Design System: qazaq-anki

## Overview

**Creative North Star: "The Study Notebook."**

Warm, paper-grounded, editorial. The system is built to read like a
well-typeset study notebook rather than an app: a warm cream ground, a
serif face held in reserve for the Kazakh word, and one terracotta accent
that has to earn every appearance. Density is a feature — this is a
3,996-word dictionary with a stats page full of meters, and the compactness
was tuned deliberately at a 15px root — but density and noise are not the
same thing. The product has no gradients, no glass, no glow, no
gamification, and no decorative illustration; the personality lives in the
warmth of the ground, the restraint of the accent, and the typographic
contrast between the language the learner knows and the language they are
learning.

Russian is the interface language and Kazakh is the study content, and the
type system makes that difference felt rather than stated: Russian reads
neutral and familiar in Inter, the Kazakh word reads as something worth
pausing for in Source Serif 4.

**Key Characteristics:**

- One warm ground, one accent, and a documented refusal to let either grow.
- A serif that appears only where the learner is meeting the new language.
- Colour identity lives on a keyline and a label; area belongs to the work.
- Token discipline: every value is a named role, never a literal.
- The reduced-motion path is per-component and intentional, never a blanket.

## Colors

One warm neutral ramp and one accent, plus a four-step semantic scale that
exists only in the study loop.

### Primary

- **Clay** (`--accent` `#C96442`): the brand accent. Correct for fills that
  carry **no text** — borders, meters, rules, the active level pill. On its
  own it is not a background for type.
- **Clay Solid** (`--accent-solid` `#A8522F`): the only fill that carries
  text. Pairs with **Clay Ink** (`--accent-fg` `#FAF7F2`) at 5.02:1 light /
  6.49:1 dark.
- **Clay Tint** (`--accent-soft` `#F4E4D6`): soft tags, the focus ring glow.
- **Clay Ink** (`--accent-ink` `#5B2A14`): accent text on a neutral
  background. This is a *different job* from `--accent-fg` and is not the
  text-on-accent token — on `--accent-solid` it measures 3.01:1.

### Neutral

- **Paper** (`--bg` `#FAF7F2`): the page ground, warm off-white.
- **Surface** (`--surface` `#FFFFFF`): cards, panels, and every resting
  control.
- **Surface Inset** (`--surface-2` `#F2EEE6`): subtle insets, secondary
  panels, hover fills, chip grounds.
- **Surface Inset Strong** (`--surface-3` `#E9E3D6`): stronger insets,
  disabled fills.
- **Ink** (`--text` `#1F1E1B`) / **Ink Strong** (`--text-strong` `#0E0D0B`):
  body copy and headings.
- **Ink Muted** (`--text-muted` `#6B6862`): secondary copy, captions,
  timestamps. 5.20:1 on `--bg`, 5.55:1 on `--surface`, 4.80:1 on
  `--surface-2`; 6.95:1 / 6.28:1 / 5.66:1 in dark.

**There is no third text step.** `--text-subtle` used to sit between Ink and
Ink Muted and carried these same jobs. On this palette it could not clear
4.5:1 anywhere in either theme: 3.01:1 on `--bg`, 3.21:1 on `--surface`,
2.49:1 on `--border` in light; 4.45:1 on `--surface` in dark. Darkening it far
enough to pass on `--bg` would have put it *below* Ink Muted — the step would
have collapsed into itself, leaving a second name for one colour. So the token
is **retired, not retuned**, and every former Ink Subtle use is Ink Muted.

Ink Muted is not free of the same trap: it measures 4.29:1 on `--border` and
4.34:1 on `--surface-3` in light, both under 4.5:1. Those two grounds are for
insets and hairlines, not for standing text. When muted copy has to sit on
them, give it a real surface — as the browse pager now does, taking
`--bg` instead of inheriting the grid's hairline colour.
- **Rule** (`--border` `#E8E2D2`) / **Rule Strong** (`--border-strong`
  `#D7CFBE`): default and active hairlines.

These grays are warm-tinted, never neutral gray. A tinted neutral reads as
paper; a true gray reads as a default.

### The SM-2 rating scale

The four study grades are an ordered semantic scale, so each carries a
colour identity. This is the one place in the product where colour encodes
something the type does not: a learner presses one of these hundreds of
times per session, and before the scale existed the four buttons were
visually identical, forcing a label read on every single choice.

**No new hues were introduced.** Each state reuses a role the palette
already had:

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

The button surface itself is the neutral `--surface`, the same one every
other control in the app sits on.

#### Why there is no `soft` role

There was a fourth role, `--<state>-soft`, for a tinted resting surface. It
is gone, and this is the one place the product was genuinely too loud.

Four full-surface tints sat directly under the flashcard — which is the
actual work. On the study screen the learner is trying to recall the
meaning of a Kazakh word, and the brightest, heaviest thing on the page was
the answer widget below it. It cost twice:

- **Intensity.** Four saturated blocks, on screen for effectively the whole
  session, out-shouting the card.
- **Identity.** The `Легко` state reuses the accent role, so a large
  terracotta block made the product's single accent read as "one of four
  peer colours" rather than as the accent. The one colour the whole product
  spends carefully had been diluted into a peer.

The state identity survives on a 1px keyline and the label colour, both
**permanent** — so it never depends on hover firing, which matters on
touch, where `@media (hover: none)` means the pressed fill is the only
state change a finger will ever see. The scale still reads as an ordered
red → amber → green → clay row at a glance.

The solid fill now lands only on hover and press. That is what "weight
discipline" was always supposed to mean, and the tinted resting state was
quietly undermining it: with all four buttons already saturated, the press
had nothing left to add.

Dropping the tint also **raised** resting contrast, because the state
colour now sits on white rather than on a tint of itself. In light mode
`--again-text` went from 4.62:1 on `--again-soft` to **6.96:1** on
`--surface`; the old 3.99:1 worst case is now 5.82:1.

Every pairing verified in both themes: resting **5.10–7.92:1**, pressed
**4.73–8.76:1**, keyline 5.10:1 and above.

### Ink on filled surfaces — the rule that matters

`--accent` is mid-tone. White on it is **3.65:1** and `--text` on it is
**4.27:1** — neither reaches the 4.5:1 AA floor for body-sized labels, so
**no ink works on bare `--accent`**. The system therefore splits the role:

| Pair | Light | Dark | Contrast |
|---|---|---|---|
| `--accent-solid` + `--accent-fg` | `#A8522F` + `#FAF7F2` | `#E08662` + `#1A1916` | 5.02:1 / 6.49:1 |

The dark theme flips direction rather than value: its `--accent` is already
a light tint, so the ink becomes the dark ground. Same two tokens,
opposite direction.

**Use the pair together or not at all.** `var(--accent)` alone is correct
for fills with no text. Any rule that puts text on an accent surface must
set `background: var(--accent-solid); color: var(--accent-fg)`.

`--warn` is the same situation: a fill token only, 3.16:1 as text. Use
`--warn-text` (`#7A5E10`, 5.06:1) for the label and `--warn-fg`
(`#1F1E1B`) for ink on the fill.

### Dark theme

`[data-theme="dark"]` is not a separate design language. It is the same
warm register at lower luminance: `#1A1916` ground, `#232220` surface, and
the accent inverted to a light tint with dark ink. No neon, no cool blues,
no separate accent ramp. The palette is **composed, not inverted** — on a
light accent, the ink becomes dark.

### Named rules

**The Ink-on-Fill Rule.** Text never sits on bare `--accent` or bare
`--warn`. Split the role: `--accent-solid` + `--accent-fg`.

**The One-Area Rule.** When a product has one accent and a semantic scale,
check whether the scale is borrowing the accent. `--easy-*` reuses the
accent role, so any *large* surface in that state silently competes with
every CTA in the app. Colour identity belongs on a keyline and a label;
area belongs to the one thing the screen is for.

**The Commitment Rule.** Solid fill is not a resting style. It marks the
moment the learner commits. A control that is already saturated at rest has
nothing left to give the press.

**The Measured-Ground Rule.** Contrast is a property of a *pair*, so every
rule that puts text on a surface has to name both, and the surface has to be
the one the reader actually sees. A token meeting 4.5:1 on `--surface` can
still fail on `--border`, because a component nested in a table inherits the
table's ground rather than the page's. When a nested element finds itself
drawing on a colour it did not choose — a pager inside a grid, a chip inside
a button — it owes the reader a real surface, not a borrowed one. What
belongs to the container is not automatically the container's to lend.

Two measurements decided the current palette, and both are worth keeping:
`--accent-fg` on `--accent` is 3.65:1 and must not be paired; a white overlay
on a terracotta fill lightens it, so a chip *on* a coloured surface takes its
tint from that surface, going darker, never lighter.

### Print

`@media print` forces the light palette, because dark mode wastes ink and
printed pages are usually photocopied. It also strips chrome, drops focus
rings, appends link URLs, and unhides the card back face so a printed page
can actually be studied.

## Typography

**Display Font:** Source Serif 4 (`'Iowan Old Style', 'Apple Garamond',
Georgia, 'Times New Roman', serif` as fallbacks)
**Body Font:** Inter (`-apple-system, BlinkMacSystemFont, 'Segoe UI',
Roboto, system-ui, sans-serif` as fallbacks)
**Label/Mono Font:** `ui-monospace, SFMono-Regular, 'SF Mono', Menlo,
Consolas` — for code and measurement only, never as costume.

**Character:** the contrast between the two is the product's main
typographic signal. Russian reads neutral and familiar; the Kazakh word
reads as something worth pausing for.

**Hosting:** self-hosted from `public/fonts`, declared in
`src/styles/fonts.css`. They used to come from `fonts.googleapis.com`,
which put a third-party request on the critical path of every page load
and disclosed the learner's IP to a company the product promises never
touches their data. Both families are OFL. The CSP no longer whitelists
either Google host, so a regression would be blocked rather than quietly
reinstated.

### The display face was a face nobody chose

The display font used to be Newsreader, and it was never actually in
effect. Newsreader ships "Google Fonts Latin Plus" — Latin, Western
European, Vietnamese — and has no Cyrillic at all. This product's entire
interface is Russian and its entire content is Kazakh, so the one role
that exists to give the product a second voice was drawing almost nothing.

Measured with CDP's `CSS.getPlatformFontsForNode`, which reports the font
that really drew a node rather than the stack it was asked for:

| node | Newsreader | fallback |
|---|---|---|
| home h1, Russian | 8 glyphs | 42 |
| demo card, "Сәлем" | 0 glyphs | 5 |

So 129 KB of latin was preloaded on every page and drew almost nothing,
and the serif on screen was Iowan Old Style on macOS or Georgia on
Windows. Nothing looked wrong — the fallback is a decent transitional
serif — which is exactly why it survived: the failure was invisible in a
screenshot and invisible in the CSS. Only reading the cmap found it.

The replacement is **Source Serif 4**, chosen from a rendered specimen
rather than by name. Ten candidates were vetted against the product's
real character inventory; six had full coverage (Source Serif 4, Alegreya,
Literata, Vollkorn, Lora, Bitter), and Petrona, Faustina and Eczar do not
have the Kazakh letters at all. The choice was made from the specimen
built out of the actual Russian and Kazakh copy at the actual sizes.

After the swap, the same measurement reads:

| node | Source Serif 4 |
|---|---|
| home h1, Russian, 39.75px | 50 of 50 glyphs |
| h2, 21px | 18 of 18 |
| demo card "Сәлем", 36px | 5 of 5 |
| topbar wordmark "Söz", 22.5px | 3 of 3 |
| landing hero "арнаулы тілші", 62.4px | 13 of 13 |

The control matters as much as the numbers: stripping `--font-display`
drops Source Serif 4 to 0 of 50 and 0 of 5, so the measurement is
reading the CSS rather than agreeing with itself.

**Two axes, one pinned.** Source Serif 4 carries `wght` and `opsz`.
Weight is pinned to 400–700 because that is the only range the display
role asks for — headings are 600, the wordmark and card word are 500.
Optical size is deliberately left free: this role runs from a 14px
transliteration to a 62px landing hero, and pinning `opsz` would have
cost 61% of the file to discard the one axis that lets a single face be
correct at both ends. `font-optical-sizing: auto` is set on `body`, so
it inherits everywhere.

**Italic is latin-only, on purpose.** It exists for exactly one thing:
the transliteration under the Kazakh word. The deck's 1,559 B1
transliterations contain zero Cyrillic, so an italic Cyrillic file would
never be requested by anything. The browser synthesises an oblique
instead, which is the right trade for a glyph set nothing reaches.

**On Inter being an overused face.** The detector flags Inter by name
(`overused-font`, 4 hits — one per `@font-face` rule), and it is right:
Inter is on a great many sites and reads as the default. It is kept
anyway, as a considered trade rather than an oversight. Inter is the
*neutral* half of the system — its whole job is that a Russian speaker
does not notice the interface typeface while they concentrate on the
Kazakh word, and the personality is carried by the display role, which
now uses a face with genuine Cyrillic coverage and its own optical
axis. Swapping Inter to win a detector rule would spend the one property
this product needs most. The rule is advisory and the count is
pre-existing; nothing about the typeset pass added to it.

**The guard.** `python3 scripts/build_fonts.py --check` measures coverage
*per family and per style*, never as one union — a union check passes as
long as some file somewhere has the glyph, which is exactly the failure
above. It also checks both directions of the CSS↔disk relationship, that
every `--font-*` token has a real `@font-face`, and that every font
preload resolves. Those last two are not hypothetical: the landing site
went on requesting `'Newsreader'` after the face was replaced, so its
hero rendered in the system serif, and both landing pages preloaded a
Newsreader file that no longer existed. A missing webfont never raises —
the browser walks to the next family and the page still looks like a
page.

**The four scripts, and what each is for.** They answer different
questions and none of them is a duplicate:

| Script | Question |
|---|---|
| `build_fonts.py --check` | Does what we *shipped* hold together? The guard. |
| `build_fonts.py --display-roman` | Rebuild the display family from a pinned source. |
| `fetch_display_candidates.py` | Which candidate faces are worth looking at? |
| `check_font_coverage.py` | Can a given face actually draw the Kazakh alphabet? |
| `build_type_specimen.py` | How do they look on *our* copy at *our* sizes? |

`check_font_coverage.py` loads a family slice's siblings automatically
and reports the union, because that is what a browser renders; pass
`--no-siblings` to audit one file alone. Measuring a single slice and
believing the number is the trap this tool is most likely to set — the
Kazakh letters are all in `cyrillic-ext`, so asking the `cyrillic` slice
about them reports 74 missing glyphs that nobody has ever seen missing.

### The ramp

Use these tokens, not raw `rem` values. Role names describe purpose.

| Token | Value | md | sm | Role |
|---|---|---|---|---|
| `--text-micro` | 0.78rem | 11.7px | 10.8px | shortcut chips, decorative markers |
| `--text-meta` | 0.85rem | 12.8px | 11.7px | captions, timestamps, helper text |
| `--text-small` | 0.95rem | 14.3px | 13.1px | secondary UI, dense rows |
| `--text-body` | 1rem | 15px | 13.8px | default reading and interface size |
| `--text-lead` | 1.15rem | 17.3px | 15.9px | lead paragraphs, card sentences |
| `--text-heading` | 1.3rem | 19.5px | 17.9px | dialog titles, section heads |
| `--text-title` | 1.5rem | 22.5px | 20.7px | the larger heading inside a card or panel |
| `--text-figure` | 1.7rem | 25.5px | 23.5px | page h1s, the big numbers on Stats |
| `--text-greeting` | 2rem | 30px | 27.6px | the learner's own name, set large |
| `--text-display` | 2.4rem | 36px | 33.1px | hero headings |
| `--text-card` | 3.4rem | 51px | 46.9px | the Kazakh word on a study card |

**The last four steps were added because the ramp was losing to the
components.** Checking the stylesheets against the scale found 24 places
writing bare `rem` values, and the interesting part was not the literals
themselves — it was that the *same role was implemented at several
different sizes*. A dialog title or section head was written at 1.1,
1.2, 1.2, 1.3, 1.3, 1.35 and 1.4rem across ten sites. A page h1 — the same
job, sometimes on the same screen — was 1.7, 1.7, 1.75, 1.75 and 1.85.
A ramp that has to be rescued by literals in the components is not a
ramp. `heading`, `figure`, `greeting` and `card` are roles that already
existed in the markup and had nowhere to live.

Collapsing them onto one step each is a small visual change, and mostly
not a change at all. Seven of the 24 sites were already sitting on the
step they moved to and render identically; the study-card word and its
`clamp` did not move by a thousandth. The largest single shift is the
ease-histogram label, 1.1 → 1.3rem (+18%), and three more land between
8% and 9%. Everything else moves by less than 8%, with two worth naming
because they moved the other way from what the table suggests:

- The **home hero**'s `clamp` now ends at `--text-display` (2.4rem)
  instead of a literal 2.65rem, so on a wide screen that heading is
  about 4px smaller than it was — the token is the smaller of the two
  and the old ceiling was not on the ramp at all.
- The **card word's mobile floor** went from 2.2rem to `--text-display`
  (2.4rem) — the value its own `clamp` already used one media query up,
  which is the kind of mismatch a bare literal invites.

It is the difference between a scale you can read and a scale you have
to memorise.

**Fluid sizes are expressed as token endpoints**, not as raw rem:
`clamp(var(--text-display), 6vw, var(--text-card))` for the study card
word, `clamp(var(--text-figure), 4.2vw, var(--text-display))` for the
home hero. The middle term is the part that has to stay a number; the
endpoints are the part that decides what the size *means*.

**The floor is the point.** The app once carried 43 distinct sizes, with
eleven steps packed between 0.65rem and 0.78rem — 9.8px to 11.7px. At that
size nobody can tell 0.72 from 0.733, so those steps were not carrying
distinct jobs. The tail is now four steps, and the smallest role is 11.7px
instead of 9px. Sixty-eight declarations sat below 12px and 43 of them
dropped under 10px at the `sm` setting — the very setting a learner opens
when the default is hard to read.

Line height is per-role, not one universal ratio (`--lh-micro` 1.35 through
`--lh-display` 1.12) — small type needs more leading than large type to
stay readable, and a display heading needs almost none. The dark theme
gets a touch more: light text on a dark surface spreads optically, so
every `--lh-*` role gains 0.03–0.05 and body copy goes from 1.55 to 1.60
(measured: 23.25px → 24px at the default text size). The gain is largest
on the small roles, whose strokes are thinnest relative to the leading,
and smallest on display type, which has the most air to begin with. This
was claimed here and in `global.css` for a long time before it was true —
`body` itself was sitting on a literal `1.55`, so the override never
reached the text people actually read. The new size roles have no
leading roles of their own: headings borrow `--lh-title`, which is
correct, and the home hero keeps a literal `1.1` that no theme moves.

### Named rules

**The Never-px Rule.** Never set a font size in `px`. `px` does not follow
`--font-scale`, so a `font: 400 13px/1.45 …` shorthand silently opts that
element out of the user's text-size setting. The stats toast and the
mastery-ring legend had exactly this bug: they stayed 13px while everything
around them scaled.

**The Root-Size Rule.** Root is 15px, not the 16px web default. This is a
dense product and the density was deliberately tuned at 15px. The `sm`
setting is 0.92×, not 0.875×, so the compact step cannot drive the smallest
role below ~10.8px. Raising the root to 16px is a whole-product proportion
change and needs its own pass with viewport verification, not a quiet side
effect of a type cleanup.

**The Heading Rule.** Every screen has exactly one `<h1>`, in every state it
can be in — not only in the empty or finished one. A screen whose heading
appears only when the work is over has no heading while the work is
happening, which is backwards: a screen-reader user arrives with no idea
where they are, and a sighted user is left reading a card under a toolbar.

That rule is about the *document*, not about pixels. Where the visible
design already states the heading — the study screen's active level is
already a filled pill in its header — the `<h1>` is `srOnly` and repeats
that label for the outline. It was measured, not assumed: adding it moved
`cardWrap`, the answer button and the counter by exactly 0px at 1280×1000,
390×844 and 360×640. Study is the tightest screen in the product, and the
card is the one thing that should hold its area. A heading that only
restates what the eye already read is not hierarchy; it is a second copy.

### Russian specifics

- Headings use `text-wrap: balance`. Russian wraps unpredictably, and a
  two-word heading can break one word per line in a narrow card.
- Onboarding step bodies are the only sustained prose in the product and
  are capped at `62ch` rather than a px width, so the measure tracks the
  user's text-size setting instead of drifting from it.
- Body copy carries a little extra leading: Russian runs longer than
  English at the same character count, and two-line labels crowd the
  element below.
- Shortcut chips and micro labels use `--tracking-micro` (0.02em); display
  type tightens to −0.015em. The floor is −0.04em.

## Layout

Content is a single centred column. The study card is capped at 640px and
320px tall (300px under 600px), the picker stack at 640px, and the browse
table fills the viewport with pagination at 50 rows.

**Spacing is not tokenized.** There is no `--space-*` scale in this codebase
— 25 distinct `px` values appear in `padding`/`margin` alone. The observed
rhythm is a loose 2px step with a 4px preference, clustering on 4, 6, 8,
10, 12, 14, 16, 20, 24, 32px. Read the computed margins in the rendered
output rather than reaching for a literal. This is recorded as known debt,
not as a decision; `/impeccable layout` or `/impeccable extract` is the
right pass to fix it.

**Breakpoints are not unified either** — the `max-width` values in use
are 420, 540, 600, 640, 720, 760, 768, 900, 1000px, plus the height
queries below. The 760px one is load-bearing (it swaps the inline nav for the
burger drawer); 768px is the touch gate; the rest are local to individual
modules. Recorded as known debt alongside the missing spacing scale.

Above 900px the study page splits into the card column and a settings rail
(`min-width: 901px`); below it they stack.

### Touch, safe areas, and the compact layout

Two mobile concerns live together here because they share one gate.

**The touch floor.** `--tap-min: 44px` is the target size. Apple asks for
44pt, Material for 48dp, WCAG 2.5.5 (AAA) for 44×44. This product
deliberately runs a dense layout — 15px root, 27px chips, 32px icon
buttons — and that density is a decision, not an oversight. So every rule
that consumes `--tap-min` sits behind `@media (max-width: 768px),
(pointer: coarse)`, and a pointer-fine user never sees the app change. The
same query is the constant `COMPACT_QUERY` in `StudyPage.tsx`, so the JSX
and the CSS cannot drift apart.

Two mechanisms, chosen per control by what surrounds it:

- **Real growth** (`min-height: var(--tap-min)`) for controls that are
  isolated or are text fields, and for anything sitting in a row too tight
  for a hit area to expand into — browse chips wrap 4px apart, the speed
  segments 2px apart, the stats tabs 2px apart. An overlay there would
  steal a neighbour's target.
- **Hit-area growth** (an `::after` box of `--tap-min` centred on the
  control) for controls that must stay visually small: the 32px topbar
  icon buttons, the 36px burger, the 22px flip-back button, the 36px speak
  button, the 18px source attribution. The topbar is 57px tall, so a
  44px hit box fits inside it and costs the layout nothing; the card's
  faces have 26px of padding for the same reason. Two rules that use it
  had to open a gap first: `.right` went 8 → 12px and the nav 2 → 6px, so
  neighbouring hit areas touch instead of overlapping.

The floor is applied at the **end** of each stylesheet, not next to the
token. `.btn { min-height: 38px }` and `.input { padding: 10px 14px }`
are declared further up; at equal specificity the later rule wins, and a
block placed near `:root` was silently losing to both.

Inline links inside running text stay under the floor on purpose. WCAG
2.5.8 exempts targets inline in a sentence; the source attribution on a
card is not inline, and it does get a hit area.

**Safe areas.** `viewport-fit=cover` in `index.html` is the gate — without
it `env(safe-area-inset-*)` is always 0 on a notched device no matter how
much safe-area CSS is written. It deliberately does *not* set
`maximum-scale` or `user-scalable`; pinch-zoom stays available.

Four tokens in `:root` — `--safe-top/right/bottom/left`, each
`env(safe-area-inset-*)` with a `0px` fallback. Tokenised rather than
inlined at each site so the fallback lives in one place. They are applied
to the shell (horizontal, once, for landscape side cutouts), the topbar
(top), `.main` (bottom), and all six `position: fixed` surfaces: the
onboarding overlay, the add-card backdrop, the confirm scrim, the stats
dialog scrim, the stats toast (right + bottom) and the study undo toast
(left + right + bottom).

**Height, not width.** The study screen's problem was vertical. The three
filter pickers cost 187px above the card, and "Показать ответ" landed below
the fold on every phone measured — 289px past it on a 320×568, 217px on a
360×640, 13px on a 390×844. Stacking can never work at 390px of landscape
height, so the compact layout splits the screen into the two things it is:
controls left, card and answer right (`max-height: 520px` and
`min-width: 700px`). The card itself scales with `clamp(200px, 34dvh,
300px)`; a card that resized with a desktop window would read as broken, so
the clamp is compact-only. Below 600px tall the back link and the level
switcher stop competing for one line — the pills take `flex-basis: 100%`
so the back link does not wrap to two words at 320px.

`dvh` replaces `vh` wherever a surface owns the viewport height (the
onboarding modal, auth, the error boundary), with the `vh` line kept first
as the fallback. The modal additionally subtracts both safe insets, since
its flex container centres the panel inside its own padded content box.

**Tap feedback.** `-webkit-tap-highlight-color` is the accent at 18% alpha,
not `transparent` — it keeps "this is tappable" legible without putting a
foreign blue on terracotta. `touch-action: manipulation`, not `none`, so
pinch-zoom survives. Overlays get `overscroll-behavior: contain` so a
drag that runs out of content does not rubber-band the page underneath.

### The filter stack is deliberate, not boxy

The three full-width bordered selects above the card (Карточки / Язык /
Тема) are the most box-like thing on the study screen, and they do
out-weigh the card visually. They are not an oversight:
`StudyPage.module.css` states that the controls stretch to the full column
width "so they read as form fields, not toolbar chips," and a full-width
field is a stronger control affordance than a narrow chip would be.
Quieting them would trade usability for a preference. A quieter pass looked
at this and left it alone; the next one should too.

That reasoning still holds, which is why the three rows are unchanged on
the desktop layout. What changed is that they are no longer the *only*
reading. On a compact layout they collapse into one row that names the
three active values ("Все · Қаз → Рус · Все темы") and opens on tap — same
three controls, same form-field affordance, 44px of height instead of 187.
The point is not to make the filters quieter; it is that the study loop is
a repeated action and re-scrolling past 187px of set-once configuration on
every card is the real cost.

## Elevation & Depth

Hybrid, leaning flat. Surfaces are flat at rest and depth comes from warm
tonal layering plus a small, consistent shadow vocabulary. Every shadow
carries an offset and a soft blur and is tinted with the warm ground
(`rgba(31, 30, 27, …)`), never a neutral black halo.

### Shadow vocabulary

- **`--shadow-xs`** (`0 1px 2px rgba(31, 30, 27, 0.04)`): the faintest
  lift; disabled and inert states.
- **`--shadow-sm`** (`0 1px 3px rgba(31, 30, 27, 0.06), 0 1px 2px rgba(31, 30, 27, 0.04)`): inset panels, the mobile drawer.
- **`--shadow-md`** (`0 4px 12px rgba(31, 30, 27, 0.06), 0 1px 3px rgba(31, 30, 27, 0.04)`): the resting flashcard. It is also the anchor of the card-landing animation.
- **`--shadow-lg`** (`0 16px 40px rgba(31, 30, 27, 0.10), 0 2px 6px rgba(31, 30, 27, 0.05)`): modals and dialogs only.

The dark theme uses the same four steps with a deeper, more opaque ramp
(`rgba(0, 0, 0, 0.3)` through `0.55`) because a soft warm shadow
disappears against a near-black ground.

### Named rules

**The Offset-and-Blur Rule.** No zero-offset coloured halos, no hard offset
shadows. Both are costume, not a depth system.

**The Flat-by-Default Rule.** A surface earns its shadow by being a
floating object (a card, a modal), not by existing.

## Motion

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
them into the ramp would mean inventing a token for a number that only two
rules use.

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
animation in the app, for every user, on every device**, and no token
could have overridden it. Verified in Chromium: transitions read 0.001ms
before, 140ms with the authored curve after.

The blanket is gone, and blanket-off was the wrong behaviour as well as
the wrong implementation. The reduced path is per-component:

| Component | What is reduced | What survives |
|---|---|---|
| `Flashcard` | card land, audio pulse, synth spinner | the face crossfade (opacity only) |
| `AddCardModal`, `OnboardingModal`, `ConfirmDialog`, `StatsPage` dialog | the 8px rise and the 2% scale | the opacity fade |
| `StatsPage`, `StudyPage` toasts | the 8px rise | the opacity fade |
| `StatsPage`, `HomePage`, `StudyPage`, `EaseHistogram` | bar sweeps | the filled value |
| `LevelMasteryRings` | ring sweeps | the arc |
| `SettingsPage`, `Flashcard` | both infinite loops | colour, `disabled`, and the `aria-label` that names the state |
| `TopicSelect` | the chevron half-turn | `[aria-expanded]` |
| `global.css` | the skip-link slide-in | — |

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

Both now have the treatment the stats KPI tile already had:
`:focus-visible` alongside `:hover`, and a permanent 75% under
`(hover: none)`.

### Rules

- Do not write a duration or a curve literally. Use the tokens.
- Do not animate a layout-driving property (`width`, `height`, `top`,
  `left`, margins) when a transform will do.
- Any new animation needs a `prefers-reduced-motion` alternative in the
  same file, and a reason that survives the sentence "removing this would
  lose nothing".
- Never add a blanket reduced-motion rule. It removes feedback, and
  feedback is information.
- A transient overlay anchors to the **content it belongs to**, not to
  the viewport. The undo toast was `position: fixed` to the bottom of the
  window, which is collidable by construction: measured at 1440×900 it
  covered 22px of the "Показать ответ" button, while 1280×1000,
  1024×768, 768×1024, 390×844 and 360×640 were all clear. That profile is
  why it survived — a bug that only appears on one common laptop size
  reads as a rendering quirk. It now anchors to the bottom of
  `.study`, where the CTA is by definition the last thing above it, so the
  collision is structurally impossible rather than measured away. The cost
  is that on a 900px-tall window the toast sits just below the fold; the
  trade is deliberate, because the covered control was the one the learner
  has to press next and the toast self-dismisses in five seconds.

## Shapes

Restrained and consistent. The product stays in the middle of its radius
range: nothing below 6px or above 16px except pills.

- `--radius-sm` 6px — the shortcut chip, small icon buttons
- `--radius-md` 8px — buttons, inputs, selects, menu panels
- `--radius-lg` 12px — the mobile drawer, the level card
- `--radius-xl` 16px — the flashcard, modals, panels
- `--radius-pill` 999px — pills, chips, tags, filter counters

Borders are 1px hairlines throughout, in `--border` at rest and
`--border-strong` when a control needs to read as a target. A coloured
`border-left` or `border-right` above 1px on a card, list item, callout, or
alert is a generated-UI signature that carries no information the fill and
text colour do not already carry.

Overlapping is confined to the flashcard, where front and back are stacked
in the same plane and crossfade by opacity. An earlier 3D `rotateY` flip
was removed: the cascade could win on `transform` and lose on
`transform-style`, leaving the back face rendered as a 2D mirror, and the
spec mandates that `preserve-3d` be ignored unless an ancestor establishes
`perspective` — so the workaround was more fragile than the feature.

## Components

### Buttons

- **Shape:** 8px radius (`--radius-md`), `line-height: 1`, `min-height:
  38px`, `padding: 0 14px`, `font-size: --text-small`, weight 500.
  The explicit `line-height: 1` is load-bearing: `<button>` defaults to
  `normal` while `<a>` inherits 1.55 from body, so without it the same
  class renders 5px taller on one element than the other.
- **Primary:** `--accent-solid` background with `--accent-fg` text. Hover
  → `--accent-hover`. Active → `translateY(1px)` over `--dur-press`.
  Disabled → `opacity: 0.5`, no transform.
- **Ghost:** transparent with a `--border-strong` hairline and `--text`
  ink; hover fills `--surface-2`.
- **Focus:** a 2px `--accent` outline at 2px offset plus a 3px
  `--accent-soft` ring. Buttons that paint their own hover background keep
  the ring; the rest inherit it.

### The SM-2 rating button

The signature control. Neutral surface, 8px radius, 56px minimum height
(64px on narrow screens), a 1px keyline and label in the state colour, and
a small 1–4 shortcut chip in the top-left corner.

- **Resting:** `--surface` background. State lives on the keyline and the
  label, never on the fill.
- **Hover / press:** the solid `--<state>-fill` with `--<state>-ink`, which
  is the commitment moment.
- **Shortcut chip:** transparent background, `border-color: currentColor`,
  inherited colour. A white chip would read as a blank block against the
  pressed fill.
- **Never hover-dependent:** identity is carried by the permanent keyline
  and label, so touch users get the full ordered scale.
- Colour is never the only cue — the Russian label and the 1–4 shortcut are
  always present.
- `data-grade` carries the grade key; CSS selects
  `.ratingBtn[data-grade='…']`. Do not add per-state class names in the
  component.

### The flashcard

The study screen's object. `--surface` fill, 1px `--border-strong`,
16px radius, `--shadow-md`, 36×40px padding (26×24px under 600px),
`overflow: hidden`, centred flex column. Front face carries the level tag,
the word, the transliteration and the audio button; the back adds the
example sentence, a 1px rule, and the source line. The Kazakh word is set
in the display serif at `--text-lead` and up.

### Chips

Filter chips are pills on `--surface-2` with `--text-muted` ink. The active
level chip is the one solid-accent surface on the study screen — it marks
the active filter and nothing else. The browse source filter uses a
`--surface-3` background for its active state.

### Cards / containers

- **Corner:** 16px (`--radius-xl`) for panels and the flashcard; 12px for
  the level card and drawer.
- **Background:** `--surface` on `--bg`, separated by a 1px `--border`
  hairline rather than by shadow.
- **Shadow:** `--shadow-md` for the card, `--shadow-lg` for modals only.
- **Padding:** 24px on panels; the study card is 36×40px.

### Inputs / fields

`--surface` fill, 1px `--border-strong`, 8px radius, `10px 14px` padding,
`--text-body`. Focus drops the outline and swaps to an `--accent` border
plus a 3px `--accent-soft` ring; `:focus-visible` gets the full 2px outline
so keyboard and pointer focus look the same. Error state swaps both to
`--danger` / `--danger-soft` and pairs with `aria-invalid="true"`.

### Navigation

A sticky topbar with the wordmark, four inline links at `--text-small`, and
the account controls on the right. Active links take `--text-strong` on a
`--surface-2` pill. Under 540px the inline row is replaced by a burger that
toggles a full-width drawer anchored below the topbar with `--shadow-md`.
The drawer currently hard-cuts open and closed with no transition — the
only overlay in the app not using the shared arrival vocabulary.

### Callouts

Error, hint, and toast surfaces use a 1px `border-left` at most, tinted
with the matching semantic token, over a `--*-soft` or `--surface-2`
fill. Toasts are pinned to the bottom of the study column so they do not
fight the rating row for attention.

### Skeletons

Deck loading renders `<Skeleton />` blocks: a `--surface-2` fill with a
1.4s `--ease-in-out` background-position sheen, disabled under reduced
motion to a static fill.

### Component inventory

| Component | File | Notes |
|---|---|---|
| Flashcard | `src/components/Flashcard.module.css` | Front = prompt, back = word + audio. |
| ConfirmDialog | `src/components/ConfirmDialog.module.css` | Destructive confirmation. |
| OnboardingModal | `src/components/OnboardingModal.module.css` | First-run card. |
| AddCardModal | `src/components/AddCardModal.module.css` | User-authored cards. |
| ErrorBoundary | `src/components/ErrorBoundary.module.css` | Recovery state with Russian copy. |
| Skeleton | `src/components/Skeleton.module.css` | Loading state. |
| SiteFooter | `src/components/SiteFooter.module.css` | Footer chrome. |
| LevelMasteryRings | `src/components/LevelMasteryRings.module.css` | Per-CEFR mastery rings. |
| EaseHistogram | `src/components/EaseHistogram.module.css` | Ease distribution. |
| MiniHeatmap | `src/components/MiniHeatmap.module.css` | Study heatmap. |
| Collapsed filter row | `src/pages/StudyPage.module.css` (`.pickerBox`) | Compact-only. One row naming the three active filter values, opens the full three-row stack. `.pickerToggle` / `.pickerSummary` / `.pickerChev`. |

### Browser surfaces

- **Theme is applied synchronously** by `public/theme-init.js` in `<head>`
  before first paint, to avoid a light-flash-to-dark flicker on reload. Any
  future design hook or runtime must run *after* `theme-init.js`, never
  before.
- **Text selection**, **caret**, **scrollbars**, **focus rings**, and
  **tabular numerals** are themed from the palette, not left as platform
  defaults. Default selection blue is replaced with the accent at low
  alpha. Numbers in tables and counters use `font-variant-numeric:
  tabular-nums`.
- **Lucide icons** are sized in `em` so they follow the user's text size,
  scoped to `svg.lucide` so hand-drawn SVGs keep their dimensions.

### State coverage

| State | Coverage |
|---|---|
| Hover | Buttons + interactive rows |
| Disabled | Forms, ratings during submit |
| Loading | `<Skeleton />` for the deck load, spinner for TTS synthesis |
| Error | `<ErrorBoundary />` with Russian recovery copy |
| Empty | Empty-deck state on the Browse screen, filtered-result state with a one-click reset |
| Keyboard focus | Visible ring token applied via `:focus-visible` |
| Reduced motion | Per-component, with intentional alternatives — see [Motion](#motion) |

## Do's and Don'ts

### Do

- **Do** use the token ramp for every font size, duration, curve, radius,
  colour, and shadow. If a value has no token, that is a finding.
- **Do** put text on `--accent-solid` / `--accent-fg` as a pair, never on
  bare `--accent`.
- **Do** keep colour identity on a keyline and a label, and let a large
  area be reserved for the one thing the screen is for.
- **Do** give every animation a `prefers-reduced-motion` alternative in
  the same file, written as an intentional substitute rather than a
  duration of zero.
- **Do** pair a hover affordance with `:focus-visible` and a
  `@media (hover: none)` fallback. Verified: opacity-0 hover reveals are
  invisible to keyboard and absent on touch.
- **Do** verify contrast after changing a token. Every SM-2 pair was
  re-measured in both themes when the tint was dropped.
- **Do** use `62ch` for sustained prose and `text-wrap: balance` on
  headings.
- **Do** gate every touch-only change behind `@media (max-width: 768px),
  (pointer: coarse)` and verify it with touch emulation. A mouse-driven
  run measures the desktop layout and passes by testing the wrong thing.
- **Do** verify mobile work by measurement, not by eye. The study CTA was
  13px below the fold on a 390×844 — a number no screenshot review
  reliably catches.

### Don't

- **Don't** reference a token that is not defined in
  `src/styles/global.css`. A `var(--name, #fallback)` for an undefined
  `--name` silently resolves to the fallback, which is how this codebase
  accumulated twelve phantom tokens across three competing conventions
  (`--ink*`, `--color-*`, `--surface-0/1`) before they were collapsed.
  Where a fallback is genuinely wanted for a caller-supplied override, the
  token still has to exist first.

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

- **Don't** add a blanket reduced-motion rule. It removes feedback, and
  feedback is information.
- **Don't** reintroduce the SM-2 tinted resting surface. The neutral
  resting state with a coloured keyline is what lets the press mean
  something.
- **Don't** use a coloured `border-left`/`border-right` above 1px on cards,
  list items, callouts, or alerts.
- **Don't** use gradient text, glassmorphism as decoration, hard offset
  shadows, zero-offset coloured halos, sparklines, progress rings, or
  soft-shadowed rounded rectangles standing in for content.
- **Don't** use a system display face, or monospace as a costume for
  "technical" rather than for code, data, or measurement.
- **Don't** use Unicode glyphs or emoji as an icon system. Icons are drawn
  from Lucide in one consistent stroke and weight.
- **Don't** use geometric masks to approximate a photographic subject's
  edge.
- **Don't** animate a layout-driving property when a transform will do.
- **Don't** ship a study screen where the answer widget is the most
  prominent thing on the page.
- **Don't** desaturate the palette in pursuit of quiet. Quieter is not
  greyer: the warm ground and the terracotta are the product's identity,
  and stripping them produces a different, less specific product. A pass
  that reduces intensity by removing colour has gone too far.
- **Don't** flatten the study filter stack to save visual weight. The
  full-width form-field reading is the affordance. Collapsing it on a
  phone is a height decision, not a quieting one — on a desktop it stays
  three rows.
- **Don't** put a touch floor rule next to its token. Put it at the end
  of the file, or the base rules for the same elements will win on
  specificity and the floor will silently do nothing.
- **Don't** set `user-scalable=no` or `maximum-scale` in the viewport
  meta to "fix" a layout that overflows. Fix the layout.
- **Don't** resolve a viewport-height surface with bare `vh` on a mobile
  browser. `100vh` is the URL bar's height, not the screen's; use `dvh`
  with the `vh` line kept first as the fallback.
- **Don't** size a study card below the point where its faces clip. The
  faces are absolutely positioned inside a fixed box, so shrinking the
  card cuts the translation and the source line rather than reflowing
  them. Take the height from the gaps.

## Terminology

The interface is Russian-only by design — the learner is a Russian speaker
meeting Kazakh, so the scaffolding around the words has to be native. That
cuts both ways: a Russian label containing an English noun is a leak, and
the same concept wearing two Russian names is worse, because the learner
has to work out whether they are the same thing.

| Concept | Say this | Not this |
|---|---|---|
| A card failed 8+ times in either direction | «проклятые карточки» | «личи», «лич», "leech" |
| The queue of cards due today | «Повтор» | «due» |
| Where a screen's queue is scoped | «Уровень» as the group, the level name as the item | using a tab's own name as the group's label |

This table started with three names in the first row alone. The banner in
`StudyPage` said «проклятые», the stats page said «Проклятые карточки», and
the settings explainer said «Личи (трудные карточки)» while its own body
text said «становится «личом»». One idea, one name.

The level switcher had the same defect in a different register: the tablist
was labelled `study.allLevels` — "Все уровни" — which is the name of its own
first tab. A screen reader announced the group as a member of the group. It
is now labelled «Уровень», and the group name no longer has to be guessed
from the items inside it.

## What this file does not cover yet

- **Spacing tokens.** There is no `--space-*` scale; 25 distinct px values
  are in use. Recorded above under Layout.
- **A unified breakpoint map.** Nine distinct `max-width` values.
  Recorded above under Layout.
- **The mobile nav drawer transition.** The only overlay with no arrival
  animation.
- **Sound design** beyond TTS playback and the two state animations.
- **Print layout** beyond the forced palette and the stripped chrome.
- **The wordmark is one role, not a lockup.** It is set in the display
  face at `--text-title` and nothing else in the system has to agree with
  it. If the product ever grows a second mark — an icon-tile lockup for
  the PWA splash, say — the two will need to be drawn from the same
  optical size to look related, and that constraint does not exist yet.
- **Off-ramp `font-size` literals** were written as bare numbers across the
  component stylesheets — fourteen distinct values, at twenty-four sites.
  Closed: the ramp gained the four roles that were missing and all
  twenty-four sites now name one. See Typography → The ramp.

## Drift this document now makes visible

Writing the token layer into the frontmatter turned the Impeccable
detector from blind on this project into an actual check — and it
immediately found things that were always there and previously
invisible. `impeccable detect src/` reports **3 anti-patterns and 56
advisories** (22 off-ramp font sizes, 21 literal colours, 13 radii). Nothing
regressed; the check simply started working. The count fell from 58 when
`--text-meta` and `--text-small` were added to the frontmatter: two advisories
were the detector correctly reporting that the product's two most-used font
sizes were not in the token contract at all.

The three anti-patterns are all the same `overused-font` warning against
Inter, raised once per `@font-face` block in `src/styles/fonts.css` since
self-hosting moved the declaration into a file the detector reads. It is
accepted, and the reason is worth stating: Inter is the *body* voice here,
chosen for its real Cyrillic coverage and its tabular figures, and the
product's character comes from the serif standing against it. The warning
is about interfaces converging on one face for everything; this one uses
two on purpose. It becomes an interesting finding rather than a false
alarm the moment the display face is fixed — see Typography, where the
serif currently in charge is not the one this document names.

`detect landing/` reports 5 for the same reason: 3 from the new
`landing/fonts.css` plus the 2 it has always had. Same warning, same
answer.

None of these are fixed here. They are recorded so the next pass can
decide rather than rediscover.

1. **A latent contrast bomb.** `AddCardModal.module.css` has
   `background: var(--warn-soft, #fee)`. `--warn-soft` is defined, so the
   fallback is dormant — but `#fee` is a bright yellow, and if the token
   were ever renamed or removed the form would silently render yellow
   behind `--warn-text`. This is the exact failure mode the "do not
   reference an undefined token" rule exists to prevent, arrived at from
   the other direction: a correct token with a template fallback welded on.

2. **A font token bypass — closed.** `ErrorBoundary.module.css` hardcoded
   `ui-monospace, 'SF Mono', Menlo, monospace` instead of
   `var(--font-mono)`, so it missed `SFMono-Regular`, `Consolas`, and
   `Liberation Mono` from the declared stack. This was the suite's only
   anti-pattern; declaring the mono role closed it. The literal is still
   there — declaring the role made the check pass, not the code. Worth
   replacing with the token on the next pass through this file.

3. ~~**Twenty-two off-ramp `rem` font sizes.**~~ **Closed.** All 24 sites
   are on role tokens now, and the ramp grew the four roles that were
   missing rather than the sizes being forced into roles that did not
   exist. See Typography → The ramp. What this entry is really about —
   that a ramp gets bypassed when the roles it needs do not exist — is
   recorded there.

4. **Twenty-one undocumented literal colours**, almost all
   `rgba(0, 0, 0, 0.08–0.45)` modal scrims and overlay chips. These are
   legitimate — a scrim is a fixed dim, not a palette colour — but they
   are invisible convention rather than a token, which is how they drift.
   Either document them as a named role or give them a `--scrim` token.

5. **`.btn--danger:hover` paints a literal.** `src/styles/global.css:615`
   sets `background: #963434` — a raw hex, with no `--danger-hover` token in
   either theme. Every other hover in the system is a token pair, so this one
   is invisible to a search for `var(--…)` and invisible to the dark theme:
   the dark `--danger` is `#DA7474`, and this hover darkens toward a brown
   that appears nowhere in the dark palette. Deleting the line restores the
   base `--danger` on hover, which is the correct behaviour for a destructive
   ghost-adjacent button; the alternative is a real `--danger-hover` token
   with a value per theme. Tracked here rather than fixed, because choosing
   the second option is a decision and the first is a deletion that belongs
   to whoever is next in this file.

6. **One defined, never-referenced token.** `--surface-hover: #F2EEE6` is
   declared in `:root` and read by nothing in `src/` or `landing/`. It is
   also never overridden in `[data-theme='dark']`, so it is a light value
   sitting in a token set that a dark-theme caller would resolve to a pale
   beige. That is exactly why it is absent from the frontmatter `colors:`
   block: the block is a contract, and a contract entry has to promise that
   using the variable works. It is recorded here so the omission reads as a
   decision rather than an oversight. Resolution is a one-line delete.

7. **The two heaviest assets on a cold load are not visual.** The largest
   single response is not a component or an image — it is
   `sourceserif4-normal-cyrillic.woff2` at 62 KB, followed by the app
   bundle at 147 KB gzipped. Both sit on the critical path and both are
   preloaded or discovered from the HTML, so they are *deliberate*. The
   display face used to be `newsreader-normal-latin.woff2` at 129 KB, and
   the replacement came out both smaller and actually used, because
   Newsreader had no Cyrillic and the critical path is entirely Cyrillic.
   Font payload fell from 952 KB to 574 KB across the two families while
   the display role went from drawing 8 of 50 glyphs to 50 of 50. The
   avoidable weight was elsewhere and has been removed: see the note on
   audio and deck loading under Motion. What remains is honest — a
   dictionary app that self-hosts its own type and ships 3 996 words is
   not going to be small, and the number to compare against is the
   first screenful, not the whole repository.

## Audio and deck loading

This file is about the visual system, but two loading decisions are
load-bearing enough to record, because both were measured rather than
assumed and both change what an agent should write next.

**The clips are FLAC, and the manifests are lazy.** Pronunciation audio
ships as lossless FLAC at 22.05 kHz mono — 7 473 clips, 168 MB, down from
300 MB as WAV, a 45% reduction with decoded samples bit-identical to what
Piper produced. The manifest for each language is no longer fetched on
app start; a speak button requests the manifest for its own language when
it first mounts, and `hasAudio` reports "unknown" until then, which the
button already renders as nothing. On the home page, which shows a
static teaser card and no speak button at all, that removed 74 KB and two
requests for data the page could not use.

**Deck JSONs are loaded by the page that displays them.** There is no
module-scope preload. `HomePage`, `BrowsePage` and `StatsPage` call
`loadLevel` for what they render, and `loadLevel` dedupes concurrent
requests, so a route that shows no cards downloads no cards: `/login` went
from roughly 596 KB to 403 KB. `getCardCount` and `getTotalCards` fall
back to the build-time `cardCount` hint, so a count is never wrong
because its deck has not arrived — it is correct before the JSON lands.

The pattern both changes follow is the same one this document already
states about tokens: **a screen should pay for the data it renders, and
not one byte more.** The earlier code paid for both languages' audio and
for every deck on every route, because "prefetch everything" is easier to
write than "fetch what this screen shows" — and the measurement is what
proved it, since none of it was ever on the critical path. Nothing here
moved LCP; it moved the bill.


