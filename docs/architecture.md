# Architecture

How `qazaq-anki` is put together.

## The shape

Three processes and one data file. The front end is a React 19 SPA built by
Vite 6, the API is an Express process on Node 22 that owns a SQLite file
through sql.js, and the pronunciation comes from a Piper service that
synthesises a word on demand.

```
browser (React 19 SPA)
  |
  |  /api/*  (same origin, nginx reverse proxy)
  v
Express API (server.js)  ---->  SQLite file via sql.js (qazaq.sqlite)
  |
  |  POST /api/tts/synthesize
  v
Piper TTS service (:8000)  ---->  public/audio/<lang>/<hash>.flac
```

nginx serves the built bundle and proxies `/api/*` to the API. That keeps
the browser on one origin, so there is no CORS in the picture and no
cookie, and therefore no CSRF surface.

| Module | What it holds |
| --- | --- |
| `src/data/decks.json` | The manifest: five levels, their tier, their topics and the card count. |
| `src/data/decks/{a1..c1}.json` | The cards, one file per level. Generated, never edited by hand. |
| `src/data/decks.ts` | The `Card` type and `loadLevel()`, which imports a level lazily so Vite splits the bundle per deck. |
| `src/lib/sm2.ts` | The scheduler: the card phases, the four grades, the fuzz, the migration from the old state shape. |
| `src/lib/api.ts` | The only module that talks to the server. |
| `src/lib/storage.ts` | The localStorage wrapper, with an in-memory fallback for private mode. |
| `src/lib/tts.ts` | The audio URL builder and the per-language manifest loader. |
| `src/contexts/` | Auth, progress, theme, font size, language, onboarding and user cards. |
| `src/pages/` | Home, Login, Register, Study, Browse, Stats, Settings. |
| `src/components/` | The flashcard, the level mastery rings, the ease histogram, the heatmaps, the modals and the pickers. |
| `src/i18n/ru.ts`, `src/i18n/en.ts` | The interface dictionaries. The English one is a fallback and is unreachable in the interface. |
| `server.js` | The API: 35 route handlers under `/api`. |
| `auth.js` | Registration, login, sessions, the password change and the recovery codes. |
| `db.js` | The sql.js database, the schema and the migrations that run on boot. |
| `cards.js` | The user-added cards. |
| `apkg.js` | The Anki package import and export. |
| `deck-meta.js` | The card id to level map the server builds at boot for the per-level statistics. |
| `ratelimit.js` | The in-memory fixed-window limiter. |
| `scripts/` | The deck parser, the topic unifier, the TTS generator and the screenshot capture. |
| `landing/` | The static landing page, in Russian and English. |

## The data flow

A review is the path through the whole system, and every other request is
a variation on it.

```
the browser
  |  POST /api/review  { cardId, grade }
  v
the API
  |  the SM-2 scheduler in src/lib/sm2.ts computes the next state
  |  (the client sends the grade, the server stores the outcome)
  v
progress + review_log  ->  the SQLite file
  |
  |  GET /api/progress
  v
the browser's ProgressContext
```

The progress does not live in the browser. `ProgressContext` reads it from
`/api/progress` on load and writes it back through the review endpoints,
so clearing the site data costs a re-login rather than a history.

The vocabulary is loaded per deck rather than up front. `loadLevel()` in
`src/data/decks.ts` imports a level lazily, so a route that shows no cards
downloads no cards, and the login page went from roughly 596 KB to 403 KB
when that changed.

The audio is fetched one word at a time. A per-language manifest lists the
SHA-1 hashes of the words that have a clip, the speak button appears once
the manifest for that language has arrived, and the clip itself is a static
file served by nginx with a one-year immutable cache header.

## The data

One SQLite file holds everything: the accounts, the sessions, the progress,
the review log, the user-added cards, the daily statistics and the recovery
codes. The schema is created and migrated by `db.js` when the database is
opened, so a new deployment starts from an empty file and becomes current
without a migration step of its own.

The path comes from `DB_PATH`, and it is resolved relative to the working
directory, so a bare `npm run server` writes into `data/` at the repository
root. The container sets `DB_PATH=/data/qazaq.sqlite` for a named volume.

The decks are a different kind of data. `src/data/decks/{a1..c1}.json` is
the output of `scripts/build-lexmin.mjs` and `scripts/unify-topics.mjs`,
and it is committed. The provenance and the licensing of every card are in
`src/data/SOURCES.md`.

## Decisions worth knowing about

### The database is one file

The API owns the database through sql.js, so the whole database is a single
file that can be copied, backed up or deleted. The cost is that the file is
held in memory and written back, which is why the backup job calls the
checkpoint endpoint first: the snapshot is then a coherent file rather than
a main file with a dirty write-ahead log beside it.

### The session token travels in a header

Registration and login mint an opaque token, store it in the `sessions`
table and return it. The client sends it as `Authorization: Bearer <token>`
on every request. There is no cookie, so there is nothing for a cross-site
request to ride on. It is the one piece of session state the browser
persists, alongside the theme, the font size and the pronunciation speed.

### The interface is Russian only

`setLang` in `src/contexts/LanguageContext.tsx` is a no-op and nothing calls
it. The English dictionary exists so that a missing key falls back instead
of blanking the interface, and the test in `src/i18n/i18n.test.ts` checks
that every Russian key has an English twin, that no value is empty, and
that every plural base carries the one, the few and the many forms.

### The card counts are pinned by a test

`src/data/decks.test.ts` holds the card count of every level, the id
format, the topic slugs and the uniqueness of the ids. A card added by
hand also needs its `cardCount` in `src/data/decks.json` bumped to match,
and the test is what says so.

### The audio file name is a hash of the word

`src/lib/tts.ts` computes SHA-1 by hand and takes the first 16 hex
characters, and it has to agree with `word_hash` in
`scripts/generate_tts.py`. The URL therefore ignores case and punctuation,
and the same word always maps to the same file.

### The API is required

Accounts, progress, the review log, the preferences and the statistics are
all server-side. A front end served without an API is a page where nothing
works, and the landing page says so in both languages rather than
pretending otherwise.

## Boundaries

- **`src/lib/api.ts` is the only module that talks to the server.** A
  component that wants data calls it and does not build a URL.
- **`src/lib/sm2.ts` holds the scheduler and nothing else.** The phases,
  the four grades and the fuzz are one pure module, so they can be tested
  without a browser or a server.
- **The API modules at the repository root are the ones that run.**
  `server/server.js` and `server/db.js` are older copies that nothing
  starts. `npm run server`, the CI smoke job and the Playwright config all
  use the root `server.js`, and `server/Dockerfile` copies it from there.
- **Every SQL statement is prepared.** No string is concatenated into
  `db.exec()`, apart from the fixed migration strings in `db.js`.
- **The API keeps four runtime dependencies**, `bcryptjs`, `cors`,
  `express` and `sql.js`, plus `adm-zip` for the Anki import. The security
  headers are written by hand in `server.js` and in `deploy/nginx.conf`.
- **No third-party requests.** The fonts are self-hosted, so loading a page
  does not disclose the learner's address to a CDN.
- **The vocabulary is never edited by hand.** The source is the lexicon
  and the taxonomy script; a change regenerates the decks.
