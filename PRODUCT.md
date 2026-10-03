# Product

<!-- impeccable:product-schema 1 -->

> **Reviewed 2026-10-03.** The `[inferred]` facts written by the `init` session
> were checked against the code and put to the product owner; the three that
> shaped the product's framing were decided rather than guessed:
>
> - **Audience** — the owner plus anyone who runs the server for themselves,
>   not one named individual.
> - **Deployment** — self-hosted only. The `VITE_API_URL` example that had
>   been left pointing at Render was removed from `src/lib/api.ts`, because a
>   product that calls itself self-hosted should not carry a hosted-platform
>   URL in a comment.
> - **Positioning** — the difference is honest graded content, data on your own
>   machine, and no telemetry. Not the absence of accounts, which is a false
>   claim: the app cannot study at all without one.
>
> This file previously said study data lives in `localStorage` and the server
> is optional. That was false, it was written as Product Principle 1, and it
> survived here after the same claim was removed from `README.md` in `fd0230e`.
> Six further false claims were found while rewriting it: the Node version, two
> non-existent server endpoints, an `ipa` field on the cards that does not
> exist, and a pending dark-mode contrast check that CI already performs. Each
> correction below names the code it was checked against, because a product
> document that cannot be checked is how the first one got in.

## Platform

web

## Stack

React 19 + Vite 6 + TypeScript SPA on the client; Node.js 22 (`Dockerfile.web`
pins `node:22-bookworm-slim`) + Express + bcryptjs + sql.js + adm-zip on the
server. The static bundle builds to `dist/`; the API runs separately,
self-hosted. MIT license, public repo at `aa-blinov/qazaq-anki`.

## Users

The owner, and anyone who has deployed the server for themselves. The project
began for one named learner, and that is still the sharpest description of who
this is for — but it is not a constraint on the code, and the account system,
per-user isolation and the Docker path are all built for the second reader.
A design constraint of one real person is not a market; treating it as one
would be inventing a cohort that does not exist yet.

There is no marketing or acquisition surface. The demo at
`aa-blinov.github.io/qazaq-anki/` is a landing page that says the app needs an
API and gives the two commands that bring the real thing up — it exists so a
stranger who lands on the repo from GitHub is not asked to register against a
static host and conclude the app is broken.

## Product Purpose

A free, self-hosted spaced-repetition app for learning Kazakh across the five
CEFR levels A1, A2, B1, B2, C1 (3,996 words). Each account is a private island
in a SQLite file on the machine running the server; passwords are bcrypt hashes
server-side and the browser never receives one. Success means a learner can
open the app, study a daily batch, and come back the next day to a review queue
that the SM-2 algorithm has already prepared.

## Positioning

The difference is not the absence of accounts — the app cannot function without
one. It is three things that are each checkable:

- **Honest CEFR-graded content.** 3,996 words with per-card provenance and
  licensing in `src/data/SOURCES.md`, and a pipeline that regenerates the deck
  from the source PDFs. Crowd-sourced decks are variable quality and usually
  have no provenance at all.
- **Data on your own machine.** The database is a file on a disk you chose.
  There is no service to sign up for, and nothing to delete except the file.
- **No telemetry.** Not as a policy statement — as a consequence. Fonts are
  self-hosted specifically so that loading a page does not disclose the
  learner's IP to a third-party CDN, and every other asset is local too.

The interface is Russian-only by design. A learner who reads Russian does not
get told, in English, that they are at A0 in their own first language.

## Operating Context

The learner opens the app on a phone or laptop — often the same account on both
via the username and password. Daily ritual: open → review queue (SM-2
scheduled cards) → optional new cards → close.

**The Express server is required, not optional.** It serves the account, the
SM-2 schedules, the review log, the preferences blob and the statistics;
`ProgressContext` reads progress from `/api/progress` on load and writes it back
through the review endpoints. A static host can serve the bundle but not the API
it calls, which is the whole reason the GitHub Pages deployment is a landing
page and not the app. Self-hosted via `docker compose up -d --build`, which
brings up the API, the web container and TTS together on `:8080`.

## Capabilities and Constraints

- 3,996 words across five decks: `a1.json`, `a2.json`, `b1.json`, `b2.json`,
  `c1.json` under `src/data/decks/`, lazily imported per level so a session
  downloads only the deck it opens. 712 / 693 / 1,559 / 449 / 583.
- SM-2 algorithm with four rating buttons (Again / Hard / Good / Easy) and
  keyboard shortcuts (1 / 2 / 3 / 4 / Space). A card becomes a "leech" at 8
  lapses. Defaults: 20 new cards and 50 reviews per day.
- Per-user accounts with bcrypt-hashed passwords at 10 rounds
  (`server/auth.js`). One username is one island in the `users` table, not in
  the browser. The browser persists exactly four keys: `aq:token` (the session)
  plus `aq:theme`, `aq:fontSize` and `aq:ttsSpeed`. Even the "have I seen this
  tour" flags are not among them — `OnboardingContext` keeps those in React
  state and reconciles with the `users.onboardingSeen` column, with no
  localStorage copy at all.
- Password recovery (`/api/recover/*`), password change, and sign-out that
  deletes the session row server-side rather than forgetting the token.
- Light + dark theme (set synchronously by `public/theme-init.js` to avoid
  FOUC), responsive, keyboard-operable, four interface text scales
  (sm / md / lg / xl).
- Pre-generated TTS audio per word in two voices (`kk_KZ-issai-high` for
  Kazakh, `ru_RU-denis-medium` for Russian): 7,473 lossless FLAC files, 168 MB,
  under `public/audio/{kk,ru}/` with per-language manifests fetched lazily, per
  language, when a speak button first mounts. Words with no clip fall through to
  `POST /api/tts/synthesize`, which writes a FLAC beside the pre-generated ones
  and returns its URL, so the two sources stay the same format.
- Other server endpoints, verified against `server.js`: `/api/stats`,
  `/api/activity`, `/api/retention`, `/api/review-log`, `/api/daily`,
  `/api/preferences`, `/api/onboarding[/:screen]`, `/api/import`, `/api/export`,
  `/api/health`, `/api/admin/backup-now`, `/api/admin/checkpoint`.
- Stats page with accuracy, day-to-day retention, mastery rings per CEFR level,
  an ease histogram, a 13-week activity heatmap and per-topic progress. The Home
  page carries a 7-week version of the same heatmap.
- No telemetry, no analytics, no third-party requests. The only external URLs
  in the tree are documentation links in comments and content-attribution
  records.
- No native mobile build. The responsive web app is the only delivery surface.

## Brand Commitments

- **Name:** Қазақ Anki / qazaq-anki. Bilingual naming is intentional; the code
  uses Latin, the UI surfaces Kazakh where the user is studying it.
- **Russian-only UI** — every label, button, error message and empty state is
  in Russian. This is a deliberate scaffolding choice, not an oversight, and it
  is enforced in code: `setLang` in `src/contexts/LanguageContext.tsx` is a
  no-op and nothing in the interface calls it. An `en` dictionary exists for
  fallback safety and is not reachable.
- **Voice:** practical, warm, never gamified. The README tone carries through the
  UI.
- **MIT license, public repo** — the code is meant to be read and forked.
- No logo system, no mascot, no decorative illustration — no brand-mark assets
  exist outside the favicon.

## Evidence on Hand

- `README.md` — feature list, deployment notes, screenshot index.
- `docs/USER-STORIES.md` — 62 stories, each traced to the code that ships it.
- `docs/screenshots/desktop/` — desktop screenshots of the running app.
- `src/data/decks/*.json` — the content: 3,996 entries with Kazakh, Russian
  translation, transliteration and an example sentence. There is no IPA field
  and no claim to one.
- `src/data/SOURCES.md` — per-card provenance, licensing and the regeneration
  pipeline.
- `public/audio/{kk,ru}/manifest.json` — per-language audio availability sets.
- `dist/` — the built static bundle.
- No user testimonials, no press, no customer logos. Future surfaces must not
  fabricate them.

## Product Principles

1. **The data is the learner's, on a machine they chose.** Progress lives in a
   SQLite file on the disk running the server, and a learner can export it to a
   file at any time. "Local-first" is not the claim and never was: the server is
   required, and pretending otherwise would have meant a static-host deploy
   where registration silently does not work.
2. **Scaffolding language is honest.** A learner who reads Russian must see
   Russian everywhere except the words they are learning. The Kazakh word is the
   only Kazakh surface.
3. **CEFR is the spine.** Levels, mastery rings and statistics are organised by
   CEFR band, not by topic-of-the-day. The deck structure reflects this.
4. **No ceremony, no gamification, no streak shaming.** Returning after a week
   off is a normal event, not a failure state. A streak counter and a
   best-day counter were removed from the Stats page for exactly this reason:
   they measured activity rather than learning, and made absence look like
   failure.
5. **Open by default.** Code is MIT, content sources are documented, the build
   is reproducible from a clean clone.

## Accessibility & Inclusion

- WCAG 2.1 AA is the target, and it is enforced rather than intended:
  `e2e/contrast.spec.ts` measures every text node on all five pages in **both**
  themes and fails CI below the floor. An earlier version of this file asked
  for a dark-mode contrast check that had not been made; the check exists.
- Keyboard-first. Every study action is reachable without a mouse, the global
  `:focus-visible` ring reaches every focusable element, and numeric shortcuts
  are documented in the README. A sweep of all five pages found no control
  without an accessible name.
- `prefers-reduced-motion` is honoured in 13 of the 22 stylesheets, rather
  than only in the global layer. The 9 without it are the ones that declare no
  animation, but the coverage is not a single global rule by design.
- Semantic HTML first; ARIA only where the markup cannot express the role. Two
  role defects found in this pass were fixed rather than papered over: the two
  heatmaps announced `role="grid"` without implementing a grid, and two chart
  SVGs described themselves in English.
- Russian copy readable at an 8th-grade level; Kazakh content uses real
  orthography. Transliteration is a separate field on the card and the source
  lexicon's own scheme, not IPA.
