# User stories

> Every story in this file is traceable to something in the codebase or to a
> decision recorded in `PRODUCT.md`. Nothing here was written from a product
> wish-list. Where a story is marked ◐ or ○, that is a gap I can point at in
> the code, not a placeholder for a future idea.
>
> Facts that came from reading the code are marked **[verified]**. Facts that
> came from project memory rather than from an interview are marked
> **[inferred]**, following the convention `PRODUCT.md` already uses. If you
> are not the intended learner of this product, the **[inferred]** lines are
> the ones to correct first.

## Read this first: one product document is out of date

`PRODUCT.md` still says:

> Each account is a private data island in `localStorage` — nothing is sent
> to the server unless the user opts in to the audio-sync endpoint.
>
> …**Local-first by default.** Study data lives in the browser; the server is
> optional.

Both are false, and they are load-bearing. The app registers and signs in
through Express; progress is read from `/api/progress` on every load and
written back through the review endpoints; there is a recovery flow, a
preferences blob, an activity log and per-card leech counters, all of them
server-side. The same claim was in `README.md` until commit `fd0230e`
removed it there.

`PRODUCT.md` is a drift record, so it was left alone rather than quietly
edited. But the stories below contradict it, deliberately: a story built on
a false premise is worse than no story. Reconciling the two is the open
item, not the stories.

---

## Personas

### P1 — The learner **[inferred]**

An adult whose first language is Russian, learning Қазақ тілі. Studies on a
phone, most days, in short sessions. Reads Russian fluently and does not
want to be addressed in English while learning a language whose alphabet
shares thirty of its letters with the one they already read. The app is
Russian-only by design — `setLang` in `src/contexts/LanguageContext.tsx`
is a deliberate no-op **[verified]** — so the Kazakh word is the only
Kazakh surface on screen.

`PRODUCT.md` names the project owner's wife as the primary user. That is
one real learner, and a design constraint of one real user is not a market.
These stories are written for that learner and for whoever holds the phone
after them.

### P2 — The person who runs the server **[verified]**

Whoever runs `docker compose up -d --build` on the machine that holds the
SQLite file. Usually the same household, occasionally not. They are not a
learner: they care that the stack comes up on one command, that the data
survives a restart, and that a full disk does not silently take the history
with it.

### P3 — A reader of the repository **[verified]**

`aa-blinov/qazaq-anki` is a public MIT repo. Someone lands on it from
GitHub, reads the README, and wants to know what the thing is, whether it
is honest about what it is not, and whether they can run it. They have no
account and no server. They are not a customer and must not be written for
as one — see the Landing story, which is the one surface built for them.

---

## Status key

| Mark | Meaning |
|---|---|
| ● | Shipped, and the behaviour is pinned by a test |
| ◐ | Shipped in part, or shipped without the acceptance criteria below being met |
| ○ | Not built. The story is the spec it would be built to |

---

## E1 — Getting in and staying in

The first gate. If this fails, nothing else in the product is reachable.

| | Story | Notes |
|---|---|---|
| ● | **As a** learner, **I want** to create an account with a username and password, **so that** my progress belongs to me and not to whoever used the device last. | `POST /auth/register`; bcrypt at 10 rounds on the server (`server/auth.js:29`). Username is validated by a regex shared with the server. |
| ● | **As a** returning learner, **I want** to sign in on a different device, **so that** I can study on my phone and my laptop without losing anything. | The session is an opaque token in `sessions`, sent as `Authorization: Bearer`. The browser keeps only `aq:token`. |
| ● | **As a** learner who forgot their password, **I want** a recovery flow, **so that** losing the password does not mean losing the history. | `/auth/recover/start` → `/auth/recover/verify`. The recovery code is bcrypt-hashed before it is written, so an injection cannot read it back. |
| ● | **As a** learner on a shared device, **I want** to sign out, **so that** the next person cannot read my history. | `POST /auth/logout` deletes the session row server-side; the token is not merely forgotten. |
| ● | **As a** learner who suspects someone else has my password, **I want** to change it, **so that** the old password stops working. | `POST /auth/change-password` replaces the hash and discards the old session. |

## E2 — The daily session

The loop the product exists for. Everything else is in service of doing
this and wanting to do it again tomorrow.

| | Story | Notes |
|---|---|---|
| ● | **As a** learner, **I want** to open the app and see what is due today, **so that** I know what the session is. | Home shows a due breakdown and a daily goal ring. |
| ● | **As a** learner, **I want** to see a Kazakh word and recall its meaning before anything is revealed, **so that** the recall is the part that builds memory. | The card is a single control; nothing about the answer is in the DOM before the flip. |
| ● | **As a** learner who has recalled the answer, **I want** to flip with one action, **so that** rating a card takes one tap, not two. | Whole card is the control; the accessible name carries the word, not an instruction. |
| ● | **As a** learner, **I want** to rate how well I remembered — Again / Hard / Good / Easy — **so that** the scheduler brings back the right card at the right time. | SM-2, `src/lib/sm2.ts`. Four buttons. |
| ● | **As a** learner on a laptop, **I want** the whole session to work from the keyboard, **so that** a fifty-card session does not need fifty mouse movements. | `Space`/`Enter` reveal, `1`–`4` rate. Fixed in `51c3452`: the reveal shortcut used to swallow both keys from every other control on the page. |
| ● | **As a** learner studying one level, **I want** to drill that level's due cards, **so that** a session is bounded and finishable. | `/study/level/:levelId`. |
| ● | **As a** learner who wants volume, **I want** to drill every card in a level regardless of due state, **so that** I can review a topic I am about to be tested on. | The "All" queue. |

## E3 — Hearing the word

| | Story | Notes |
|---|---|---|
| ● | **As a** learner, **I want** to hear a Kazakh word spoken, **so that** I learn the sound and not only the spelling. | 7,473 pre-generated lossless FLAC clips, 168 MB, fetched one word at a time. |
| ● | **As a** learner, **I want** to hear the Russian side too, **so that** the translation is not the only thing I have to trust. | Two voices, `kk_KZ-issai-high` and `ru_RU-denis-medium`. |
| ● | **As a** learner, **I want** the button to tell me honestly when a word has no recording, **so that** I do not press it and wait for nothing. | Per-language manifests are fetched lazily, per language, on first mount. |
| ● | **As a** learner on a metered connection, **I want** audio to be lazy rather than bundled, **so that** the app is usable before 168 MB of audio has anything to do with it. | Manifest-then-clip, not a zip in the JS. |
| ● | **As a** learner with no clip for a word, **I want** the server to synthesise one on demand, **so that** coverage is not limited to the words someone happened to pre-generate. | `POST /api/tts/synthesize`, called from `src/components/Flashcard.tsx:411`. Note it is the one network call in the front-end that bypasses the `src/lib/api.ts` wrapper and calls `fetch` directly — a consistency wart, not a defect. |

## E4 — Knowing what is left

| | Story | Notes |
|---|---|---|
| ● | **As a** learner, **I want** to see how much of each level I have touched, **so that** I know whether A2 is behind me or ahead of me. | Home shows per-level rows; Stats shows mastery rings. |
| ● | **As a** learner, **I want** to see my recent activity as a heatmap, **so that** a gap in my week is visible instead of hypothetical. | Two implementations, 7 weeks on Home and 13 on Stats. Both now announce as a single image — see commit `2954357` and `fffa6b5`, the second of which exists because the first pass only found one of them. |
| ● | **As a** learner, **I want** the numbers on the home screen to be the same numbers the stats screen shows, **so that** the two pages do not contradict each other. | Both read `/api/activity` and `/api/stats`. |

## E5 — Measuring progress

The screen a learner opens to decide whether any of this is working.

| | Story | Notes |
|---|---|---|
| ● | **As a** learner, **I want** to see accuracy and totals, **so that** I have a summary without doing arithmetic. | Overview KPIs. |
| ● | **As a** learner, **I want** to see mastery per CEFR level as rings, **so that** "how far along am I" has a shape I can read at a glance. | Outer ring: opened at least once. Inner: interval ≥ 21 days. |
| ● | **As a** learner, **I want** to see day-to-day accuracy, **so that** a bad week is diagnosable. | 30-day retention, hidden below 10 reviews because a flat 100% line over three reviews reads as a bug. |
| ● | **As a** learner, **I want** to see per-topic progress, **so that** I can see which part of the vocabulary is thin. | Cards are grouped by `category` — 34 of them across the five levels. The deck files carry 230 topic slugs underneath that taxonomy, so "how many topics" has two honest answers depending on which level of the grouping you mean. |
| ● | **As a** learner, **I want** to see the cards I keep forgetting, **so that** I can deal with them specifically. | A card is a "leech" at 8 lapses (`SCHEDULER_DEFAULTS.leechThreshold`). |
| ● | **As a** learner, **I want** to reset one leech without losing the rest, **so that** I can clear a single blocker. | `POST /api/progress/reset/:cardId`. |
| ● | **As a** learner, **I want** to reset every leech at once, **so that** clearing them is one decision rather than forty. | `POST /api/progress/reset-leeches`. |
| ● | **As a** learner, **I want** to reset my whole progress, **so that** I can start clean after a long break. | `POST /api/reset`, behind a confirmation dialog that states the consequences first. |
| ◐ | **As a** learner with 34 topic categories, **I want** to filter the topic list, **so that** I can find "дом" without scrolling. | Topics are listed and searchable only through the Browse search, not as a filter on the Stats topic grid. |

## E6 — Finding a specific word

| | Story | Notes |
|---|---|---|
| ● | **As a** learner who half-remembers a word, **I want** to search across all 3,996 cards, **so that** I can look it up without knowing which level it is in. | `/browse`, searches Kazakh, transliteration and both translations. |
| ● | **As a** learner, **I want** to narrow by CEFR level, **so that** a search result is not 400 cards of the wrong difficulty. | Level filter. |
| ● | **As a** learner, **I want** to add my own card, **so that** a word the deck is missing is not a dead end. | `POST /api/cards`, stored in `user_cards`, separate from the bundled set. |
| ● | **As a** learner, **I want** to delete or edit a card I added, **so that** a typo does not outlive me. | `PATCH` / `DELETE /api/cards/:id`. |
| ● | **As a** learner who already uses Anki, **I want** to import an `.apkg` deck, **so that** I do not re-type what I already have. | `POST /api/import`, `adm-zip`, Anki 2.1+. |

## E7 — Shaping the session

| | Story | Notes |
|---|---|---|
| ● | **As a** learner, **I want** to cap how many new cards I see per day, **so that** a free afternoon does not turn into 200 unfamiliar words. | Default 20, `newCardsPerDay` in the server-side preferences blob. |
| ● | **As a** learner, **I want** to set a daily review goal, **so that** the app has a notion of "done" for me. | Default 50 reviews. |
| ● | **As a** learner, **I want** to change the audio speed, **so that** the native voice is slow enough for me to catch every phoneme. | `aq:ttsSpeed` in `localStorage`, applied client-side. |
| ● | **As a** learner whose eyes tire, **I want** four text sizes, **so that** the card word is readable at arm's length. | sm / md / lg / xl, `aq:fontSize`. |
| ● | **As a** learner studying in the evening, **I want** a dark theme, **so that** the screen is not the brightest thing in the room. | `aq:theme`, set synchronously by `public/theme-init.js` to avoid a flash of light. |
| ● | **As a** learner, **I want** the app to explain how repetitions work, **so that** an interval I cannot predict does not look like a bug. | "Как работают повторения" in Settings. |

## E8 — Owning the data

The stories that exist because the repo is MIT and the data is a person's
learning history, not the company's.

| | Story | Notes |
|---|---|---|
| ● | **As a** learner, **I want** to export my progress to a file, **so that** my history is mine and survives the machine. | `aq-export/v1`, schema v2, reads v1 and v2. |
| ● | **As a** learner moving to a new machine, **I want** to import that file, **so that** I do not start from zero. | Round-trips cards and review events. |
| ● | **As a** learner, **I want** the import to tell me what it did before it does it, **so that** I do not overwrite good history with a bad file. | The dialog states the card and event counts first. |
| ● | **As a** learner, **I want** nobody else to be able to read my account, **so that** a shared machine does not become a shared history. | Passwords are bcrypt hashes server-side; the browser never receives one. |

## E9 — Being taught the app

| | Story | Notes |
|---|---|---|
| ● | **As a** learner opening the app for the first time, **I want** to be shown what the card does, **so that** I do not grade myself wrong on the first try. | Per-screen tour, `OnboardingModal`. |
| ● | **As a** learner who has already seen the tour, **I want** not to see it again, **so that** it does not become an obstacle. | Tracked per screen, per user, in the `users.onboardingSeen` column. |
| ● | **As a** learner who wants it again, **I want** to reopen the tour from Settings, **so that** forgetting where a control is is not a dead end. | "Помощь по странице". |
| ● | **As a** learner who skips the tour, **I want** to skip it without a modal blocking the app, **so that** the first screen is still the app. | Skip / later paths exist and are exercised by the e2e suite. |

## E10 — Running it (P2)

| | Story | Notes |
|---|---|---|
| ● | **As a** person running the server, **I want** one command that brings up the API, the web container and TTS, **so that** I do not have to know the topology. | `docker compose up -d --build` → `http://localhost:8080`. |
| ● | **As a** person running the server, **I want** my history to survive a restart, **so that** a reboot is not a data-loss event. | Named volume, not a container filesystem. |
| ◐ | **As a** person running the server, **I want** automatic backups of the SQLite file, **so that** a corrupted database is recoverable. | `backup/` and `POST /api/admin/backup-now` exist and nothing in the front-end calls them — the trigger is a human or a cron. The hourly schedule and the off-site half are documented in `DEPLOY.md` as a manual step. |
| ○ | **As a** person running the server, **I want** the stack to tell me which of its parts is unhealthy, **so that** I find out before a learner does. | `/api/health` returns ok/users/sessions, and nothing surfaces it. |
| ○ | **As a** person running the server, **I want** an upgrade path that does not risk the SQLite file, **so that** I can update without gambling the history. | Not written down anywhere a user would look. |

## E11 — Reading and forking (P3)

| | Story | Notes |
|---|---|---|
| ● | **As a** reader, **I want** the README to tell me what the app really is, **so that** I can decide whether it is worth running. | 14 false claims removed in `fd0230e` — it had claimed there was no server at all. |
| ● | **As a** reader who has no server, **I want** a page that tells me so honestly, **so that** I do not register on a static host and conclude the app is broken. | The GitHub Pages landing says the app needs an API and gives the two commands. |
| ● | **As a** reader, **I want** to know where the words came from and under what licence, **so that** I can judge whether to fork the content. | `src/data/SOURCES.md`; per-card provenance in the deck JSON. |
| ● | **As a** forker, **I want** to regenerate the deck from source PDFs, **so that** I can add a level without hand-editing JSON. | `scripts/build-lexmin.mjs` + `scripts/unify-topics.mjs`. The old README pointed at a script in `/tmp` that was not in the repo. |
| ● | **As a** forker, **I want** the design system documented, **so that** a new screen matches the existing five. | `DESIGN.md`, regenerated against the code in `3c23ab0`. |
| ● | **As a** reader, **I want** a documented known-defects list, **so that** I do not mistake a recorded trade-off for a finished area. | DESIGN.md's "Left alone on purpose" — the honest record. |

## E12 — Non-goals

Not stories. Stated because a user story file that only says yes is a wish
list, and these are the lines the product has drawn on purpose.

- **No streaks, no leaderboards, no streak-shaming.** Coming back after a
  week off is a normal event, not a failure state. Recorded as principle 4
  in `PRODUCT.md`. Commit `ffa9431` removed a streak and a best-day counter
  from the Stats page for exactly this reason — they measured activity, not
  learning, and made absence look like failure.
- **No telemetry, no analytics, no third-party requests.** Fonts are
  self-hosted specifically so that loading a page does not disclose the
  learner's IP to a font CDN. Any new external call breaks this.
- **No English interface.** The dictionary has an `en` half, but no UI
  exposes it. Scaffolding in the learner's first language is the product.
- **No gamified surface, no mascot, no decorative illustration.**

---

## Where the stories and the code disagree

The most useful part of this file, and the reason the status column is not
decorative:

| Claim | Reality |
|---|---|
| `PRODUCT.md` "Capabilities" — server endpoints `/api/audio`, `/api/deck-meta`, `/api/stats` | `/api/stats` is real. The synthesis route is `POST /api/tts/synthesize`; there is no `/api/audio`. `/api/deck-meta` has no route either, though `server.js` imports four functions from `deck-meta.js` and uses them internally — so the module is live and the endpoint is not. |
| `PRODUCT.md` "Product Principles" §1 — study data lives in the browser, the server is optional | False. Progress is read from and written to the server on every session. The principle needs rewriting, not the code. |
| `PRODUCT.md` "Users" — no audiences beyond one learner | True today, and it is why almost every story above is about one person. If a second learner ever uses this, the multi-account and per-user isolation stories become load-bearing rather than incidental. |
| `PRODUCT.md` "Capabilities" — "one username is one localStorage data island" | False. Accounts live in the `users` table. |
| `PRODUCT.md` "Operating Context" — "the Express server is only needed for account creation and audio asset sync; it is not required to study" | False. Registration is one of several things that need it, but progress does too. |
| 20 distinct `max-width` breakpoints in `src/**/*.css` **[verified]** | Not a story, but it is a product smell: five screens cannot be checked for consistency by hand against twenty numbers. The stories in E4 and E5 all assume a layout that holds at each of them. |
| `Layout.module.css:286` promises a 90ms drawer animation | `.mobileNav` is `display: none` and nothing else. The comment describes a motion the app does not have. |
| `.btn--danger:hover` is a literal `#963434` | The one hard-coded colour left in the button system; the rest of the palette is tokens. |
| `var(--warn-soft, #fee)` in `AddCardModal.module.css` | A fallback colour chosen to be readable on white, used on a surface where it may not be. Latent contrast failure, only if the token is ever missing. |
| `window.location.reload()` ×3 | A full page reload to refresh state that an in-app state update would cover. Loses scroll position and any unsaved input, and on mobile throws away the app shell. |
