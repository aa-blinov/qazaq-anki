# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The client is a React 19 and Vite 6 SPA in TypeScript. The server is Node.js 22, pinned by `node:22-bookworm-slim` in the container images, running Express with bcryptjs, sql.js and adm-zip. The static bundle builds to `dist/`; the API runs separately and is self-hosted. The repository is public and MIT-licensed at `aa-blinov/qazaq-anki`.

The stack was checked against the code and put to the product owner before this file was written. Three answers shaped the framing and were decided rather than guessed: the audience, the deployment model, and the positioning below.

## Users

The owner, and anyone who has deployed the server for themselves. The project began for one named learner, and that is still the sharpest description of who this is for, but it is not a constraint on the code. The account system, the per-user isolation and the Docker path are all built for the second reader.

A design constraint of one real person is not a market, and treating it as one would invent a cohort that does not exist yet.

There is no marketing or acquisition surface. The demo at `aa-blinov.github.io/qazaq-anki/` is a landing page that says the app needs an API and gives the two commands that bring the real thing up. It exists so a stranger who lands on the repository from GitHub is not asked to register against a static host and conclude the app is broken.

## Product Purpose

A free, self-hosted spaced-repetition app for learning Kazakh across the five CEFR levels A1, A2, B1, B2 and C1, which is 3,996 words. Each account is a private island in a SQLite file on the machine running the server; passwords are bcrypt hashes server-side and the browser never receives one.

Success for the learner means opening the app, working through a daily batch and coming back the next day to a review queue the SM-2 algorithm has already prepared. Success for the product means the data stays on that disk, and the interface never asks the learner to sign up for anything.

## Positioning

The difference from a neighbouring flashcard app is three things, each of them checkable:

- **Honest CEFR-graded content.** 3,996 words with per-card provenance and licensing in `src/data/SOURCES.md`, and a pipeline that regenerates the deck from the source PDFs. Crowd-sourced decks vary in quality and usually carry no provenance at all.
- **Data on your own machine.** The database is a file on a disk you chose. There is no service to sign up for, and nothing to delete except the file.
- **No telemetry.** Not as a policy statement, but as a consequence. The fonts are self-hosted so that loading a page does not disclose the learner's IP to a third-party CDN, and every other asset is local too.

The claim is not that the app has no accounts. It cannot study at all without one, and a comparison built on that would be false.

The interface is Russian-only by design. A learner who reads Russian does not get told, in English, that they are at A0 in their own first language.

Deployment is self-hosted only, and that was decided rather than assumed. A `VITE_API_URL` example that had been left pointing at a hosted platform was removed from `src/lib/api.ts`, because a product that calls itself self-hosted should not carry a hosted-platform URL in a comment.

## Operating Context

The learner opens the app on a phone or a laptop, often the same account on both, signing in with a username and a password. The daily ritual is short: open, work through the review queue the scheduler prepared, take on new cards if there is appetite, close.

**The Express server is required, not optional.** It serves the account, the SM-2 schedules, the review log, the preferences blob and the statistics. `ProgressContext` reads progress from `/api/progress` on load and writes it back through the review endpoints. A static host can serve the bundle but not the API it calls, which is the whole reason the GitHub Pages deployment is a landing page and not the app.

Self-hosting runs through Docker Compose, which brings up the API, the web container and the TTS service together on port 8080. The `prod` profile adds Caddy for TLS and a container that takes an hourly snapshot of the SQLite file. Both need the admin token file that [DEPLOY.md](DEPLOY.md) describes.

## Capabilities and Constraints

Confirmed by the code:

- 3,996 words across five decks: `a1.json`, `a2.json`, `b1.json`, `b2.json` and `c1.json` under `src/data/decks/`, lazily imported per level so a session downloads only the deck it opens. 712 / 693 / 1,559 / 449 / 583, in 34 topics.
- The SM-2 algorithm with four rating buttons (Again / Hard / Good / Easy) and keyboard shortcuts (1 / 2 / 3 / 4 / Space). A card becomes a leech at 8 lapses. The defaults are 20 new cards and 50 reviews per day, and the mastering interval is 21 days.
- Per-user accounts with bcrypt-hashed passwords at 10 rounds, in `auth.js`. One username is one island in the `users` table. The browser persists exactly four keys: `aq:token`, `aq:theme`, `aq:fontSize` and `aq:ttsSpeed`. Even the "have I seen this tour" flags are not among them; `OnboardingContext` keeps those in React state and reconciles them with the `users.onboardingSeen` column.
- Password recovery through `/api/recover/start` and `/api/recover/verify`, password change, and a sign-out that deletes the session row server-side rather than forgetting the token.
- Light and dark theme, set synchronously by `public/theme-init.js` to avoid a flash of the wrong theme, responsive, keyboard-operable, with four interface text scales.
- Pre-generated pronunciation for every word in two voices, `kk_KZ-issai-high` for Kazakh and `ru_RU-denis-medium` for Russian: 7,473 lossless FLAC files, 168 MB, under `public/audio/{kk,ru}/` with per-language manifests fetched lazily, per language, when a speak button first mounts. A word with no clip falls through to `POST /api/tts/synthesize`, which writes a FLAC beside the pre-generated ones and returns its URL, so the two sources stay in the same format.
- Other server endpoints, verified against `server.js`: `/api/stats`, `/api/activity`, `/api/retention`, `/api/review-log`, `/api/daily`, `/api/preferences`, `/api/onboarding[/:screen]`, `/api/cards`, `/api/import`, `/api/export`, `/api/reset`, `/api/health`, and the two admin routes `/api/admin/backup-now` and `/api/admin/checkpoint`.
- A statistics page with accuracy, day-to-day retention, mastery rings per CEFR level, an ease histogram, a 13-week activity heatmap, a 7-week heatmap on the home page and per-topic progress.
- Anki `.apkg` import and export, and a JSON backup of the progress and the review log.
- No telemetry, no analytics, no third-party requests. The only external URLs in the tree are documentation links in comments and content-attribution records.

Deliberately not true, and worth knowing before a change:

- The app is not signed, not published to a store, and has no native mobile build. The responsive web app is the only delivery surface.
- The server is not a hosted service. There is no shared deployment, and the trust boundary is the machine the server runs on.
- The GitHub Pages deployment is a landing page, not the app.

## Brand Commitments

- **Name:** Қазақ Anki / qazaq-anki. The bilingual naming is intentional: the code uses Latin, and the interface shows Kazakh where the user is studying it. The landing page carries a separate wordmark, "Söz", and the name in `package.json` is `anki-qazaq`.
- **Russian-only interface.** Every label, button, error message and empty state is in Russian. This is a deliberate scaffolding choice, and it is enforced in code: `setLang` in `src/contexts/LanguageContext.tsx` is a no-op and nothing in the interface calls it. An `en` dictionary exists for fallback safety and is unreachable.
- **Voice:** practical, warm, never gamified. The tone of the README carries through into the interface.
- **MIT licence and a public repository.** The code is meant to be read and forked.
- **No logo system, no mascot, no decorative illustration.** No brand-mark assets exist outside the favicon.

## Evidence on Hand

- `README.md` describes what the app does, the deployment paths and the screenshot index.
- `docs/USER-STORIES.md` holds 62 stories traced to the code that ships them: 56 marked done, 3 partial and 3 open.
- `docs/screenshots/desktop/` holds the desktop screenshots of the running app, generated by `scripts/capture-ui.mjs`.
- `src/data/decks/*.json` holds the content: 3,996 entries with the Kazakh word, the transliteration, the Russian translation and an example sentence for the 97 words that have one.
- `src/data/SOURCES.md` holds the per-card provenance, the licensing and the regeneration pipeline.
- `public/audio/{kk,ru}/manifest.json` holds the per-language audio availability sets.
- `dist/` holds the built static bundle.

This file was wrong once, and the correction is part of the evidence. It previously said that study data lives in `localStorage` and that the server is optional. Both claims were false, the first one was written as Product Principle 1, and it survived here after the same claim had already been removed from `README.md` in commit `fd0230e`. Six further false claims were found while rewriting it, among them the Node version, two server endpoints that do not exist, an `ipa` field on the cards that does not exist, and a pending dark-mode contrast check that CI already performs. Each correction above names the file it was checked against, because a product document that cannot be checked is how the first one got in.

Absent, and not to be invented: no testimonials, no press, no customer logos, no download counts and no usage numbers. The project has no way to count them, and a future session must not fabricate them.

## Product Principles

1. **The data is the learner's, on a machine they chose.** Progress lives in a SQLite file on the disk running the server, and a learner can export it to a file at any time. "Local-first" is not the claim and never was: the server is required, and pretending otherwise would have meant a static-host deploy where registration silently does not work.
2. **Scaffolding language is honest.** A learner who reads Russian must see Russian everywhere except the words they are learning. The Kazakh word is the only Kazakh surface.
3. **CEFR is the spine.** The levels, the mastery rings and the statistics are organised by CEFR band rather than by a topic of the week, and the deck structure follows.
4. **No ceremony, no gamification, no streak shaming.** Returning after a week off is a normal event rather than a failure state. A streak counter and a best-day counter were removed from the statistics page for that reason: they measured activity rather than learning, and made absence look like failure.
5. **Open by default.** The code is MIT, the content sources are documented, and the build is reproducible from a clean clone.

## Accessibility & Inclusion

- WCAG 2.1 AA is the target, and it is enforced rather than intended: `e2e/contrast.spec.ts` measures every text node on all five pages in both themes and fails CI below the floor.
- Keyboard-first. Every study action is reachable without a mouse, the global `:focus-visible` ring reaches every focusable element, and the numeric shortcuts are documented in the README. A sweep of all five pages found no control without an accessible name.
- `prefers-reduced-motion` is honoured in 13 of the 22 stylesheets rather than only in the global layer. The 9 without it are the ones that declare no animation, and the coverage is deliberately not a single global rule.
- Semantic HTML first, with ARIA only where the markup cannot express the role. Two role defects found in that pass were fixed rather than papered over: the two heatmaps announced `role="grid"` without implementing a grid, and two chart SVGs described themselves in English.
- Russian copy is readable at an 8th-grade level and the Kazakh uses real orthography. The transliteration is a separate field on the card, following the source lexicon's own scheme rather than IPA.
