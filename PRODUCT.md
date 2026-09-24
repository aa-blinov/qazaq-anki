# Product

<!-- impeccable:product-schema 1 -->

> Note from `init` session: this PRODUCT.md was written from the project README,
> the package.json scripts, the design tokens in `src/styles/global.css`, and
> the durable user-memory note that frames this as a personal project for the
> user's wife. Facts that came from user memory rather than direct interview
> are marked **[inferred]**. Please review and confirm or correct before the
> next surface work uses them as load-bearing.

## Platform

web

## Stack

React 19 + Vite 6 + TypeScript SPA on the client; Node.js 21 + Express +
bcryptjs + sql.js + adm-zip on the server. Static `dist/` ships to GitHub
Pages; the Node server runs separately (self-hosted). MIT license, public
repo at `aa-blinov/qazaq-anki`.

## Users

**[inferred]** Primary user is the project owner's wife, who is learning
Kazakh (Қазақ тілі) from a Russian-language baseline. The README and the
"Russian-only UI by design" constraint indicate the product is built for one
learner whose L1 scaffolding language is Russian. There is no marketing or
acquisition surface; the live demo at `aa-blinov.github.io/qazaq-anki/` exists
so a reviewer can try it without the local server. **[inferred]** No other
audiences are documented; future work must not invent cohorts.

## Product Purpose

A free, local-first spaced-repetition flashcard app for learning Kazakh
across the five CEFR levels A1, A2, B1, B2, C1 (3,996 curated words). Each
account is a private data island in `localStorage` — nothing is sent to the
server unless the user opts in to the audio-sync endpoint. Success means a
learner can open the app, study a daily batch, and come back the next day
to a review queue that the SM-2 algorithm has already prepared.

## Positioning

The product's meaningfully different mechanism is honest CEFR-graded content
combined with a real SM-2 implementation, no telemetry, and a Russian-only
interface that does not pretend the learner is at A0 in their own L1. Other
Anki-style apps either crowd-source content (variable quality), target
English-speaking learners, or push accounts and analytics. This one is
self-hosted, fully client-side for study data, and lets the learner read every
label in their scaffolding language.

## Operating Context

The learner opens the app on a phone or laptop — often the same account on
both via the username/password pair. Daily ritual: open → review queue (SM-2
scheduled cards) → optional new-card introduction → close. The Express
server is only needed for account creation and audio asset sync; it is not
required to study. Deployed through GitHub Pages for the static bundle;
self-hosted via `docker-compose` for the server side.

## Capabilities and Constraints

- 3,996 words across five decks: `a1.json`, `a2.json`, `b1.json`, `b2.json`,
  `c1.json` under `src/data/decks/`.
- SM-2 algorithm with four rating buttons (Again / Hard / Good / Easy) and
  keyboard shortcuts (1 / 2 / 3 / 4 / Space).
- Per-user accounts with bcrypt-hashed passwords; one username is one
  localStorage data island.
- Light + dark theme (set synchronously by `public/theme-init.js` to avoid
  FOUC), responsive, accessible (keyboard, `prefers-reduced-motion`, focus
  rings), four interface text scales (sm / md / lg / xl).
- Pre-generated TTS audio per word in two voices (`kk_KZ-issai-high` for
  Kazakh, `ru_RU-denis-medium` for Russian) shipped as static `.wav` files
  under `public/audio/{kk,ru}/`, with per-language manifests.
- Server endpoints for audio lazy-synthesis and per-deck metadata
  (`/api/audio`, `/api/deck-meta`, `/api/stats`).
- Stats page with accuracy, mastery rings per CEFR level, ease histogram,
  per-topic progress.
- No telemetry, no analytics, no external API calls.
- **[inferred]** No native mobile build; the responsive web app is the only
  delivery surface.

## Brand Commitments

- **Name:** Қазақ Anki / qazaq-anki. Bilingual naming is intentional; the
  code uses Latin, the UI surfaces Kazakh where the user is studying it.
- **Russian-only UI** — every label, button, error message, and empty state
  is in Russian. This is a deliberate scaffolding choice for the L1-Russian
  learner, not an oversight. **[inferred]** to be confirmed.
- **Voice:** practical, warm, never gamified. The README tone carries
  through the UI — feature lists read like a builder describing the app to
  another builder.
- **MIT license, public repo** — the code is meant to be read and forked.
- No logo system, no mascot, no decorative illustration. **[inferred]**
  confirmed by the absence of any brand-mark assets outside the favicon.

## Evidence on Hand

- `README.md` — full feature list, deployment notes, screenshot index.
- `docs/screenshots/desktop/` — desktop screenshots of the running app.
- `src/data/decks/*.json` — the actual content; 3,996 entries with Kazakh
  and Russian pairs, example sentences, IPA.
- `src/data/SOURCES.md` — cited word lists and licensing for each deck.
- `public/audio/{kk,ru}/manifest.json` — per-language audio availability
  sets (the exact words that have pre-generated audio).
- `dist/` — built static bundle deployed to GitHub Pages.
- No user testimonials, no press, no customer logos. Future surfaces must
  not fabricate them.

## Product Principles

1. **Local-first by default.** Study data lives in the browser; the server
   is optional. Anyone reading the network tab during a normal study
   session should see only the audio fetch and the optional manifest fetch.
2. **Scaffolding language is honest.** A learner who reads Russian must see
   Russian everywhere except the words they are learning. The Kazakh word
   is the only Kazakh surface.
3. **CEFR is the spine.** Levels, mastery rings, and stats are organised by
   CEFR band, not by topic-of-the-day. The deck structure reflects this.
4. **No ceremony, no gamification, no streak shaming.** Returning after a
   week off is a normal event, not a failure state.
5. **Open by default.** Code is MIT, content sources are documented, the
   build is reproducible from a clean clone.

## Accessibility & Inclusion

- WCAG 2.1 AA is the target (4.5:1 body contrast, 3:1 large text). The
  current warm palette (`#FAF7F2` ground, `#1F1E1B` text, `#C96442`
  accent) sits well above the threshold in light mode; dark mode
  (`#1A1916` ground) needs an actual contrast check against the muted
  text token before any surface change.
- Keyboard-first: all study actions reachable without a mouse, visible
  focus rings, numeric shortcuts documented in the README.
- `prefers-reduced-motion` respected by the existing animations.
- Semantic HTML first; ARIA only where the markup cannot express the role.
- Russian copy readable at an 8th-grade level; Kazakh content uses real
  orthography with explicit IPA where the spelling is ambiguous.