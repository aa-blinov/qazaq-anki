# Қазақ Anki — Spaced-Repetition Flashcards for Kazakh

A free, offline-first, GitHub-Pages-ready web app for learning **Қазақ тілі** (Kazakh) with **Anki-style spaced repetition**. 500 hand-curated high-frequency words across the five CEFR levels A1, A2, B1, B2, C1.

> Modern TypeScript stack · React 19 · Vite 6 · SM-2 algorithm · bcrypt auth · localStorage · 110 KB gzipped.

---

## ✨ Features

- **500 real words** organized by CEFR level (A1 → C1) and thematic category — sourced from the public [Wordmastery 1000-most-common-Kazakh-words](https://wordmastery.org/kazakh/) list.
- **SM-2 spaced repetition** (the algorithm Anki uses), with 4 familiar rating buttons: *Again / Hard / Good / Easy*, plus keyboard shortcuts (1/2/3/4 and Space).
- **Per-user accounts** with bcrypt-hashed passwords — data isolation per username, no backend needed.
- **Everything stays in the browser** — your study progress, account and theme live in `localStorage`. No server, no tracking.
- **Light + dark theme**, responsive, accessible (keyboard, reduced-motion, focus styles).
- **Browse all cards** with search and level filters.
- **Stats page** with accuracy, mastery, and per-level progress bars.
- **Works on GitHub Pages** out of the box — `npm run deploy` and you're live.

---

## 🚀 Quick start

```bash
npm install
npm run dev        # http://localhost:5173/anki-qazaq/
```

Build for production:

```bash
npm run build      # → dist/
npm run preview    # serve dist/ locally
npm run deploy     # build + push dist/ to gh-pages branch
```

---

## 📦 Deploying to GitHub Pages

The repo is already wired for a project-page deploy at `https://<user>.github.io/anki-qazaq/`.

1. Push this repo to GitHub (default branch: `main` or `master`).
2. In your repo settings → **Pages** → Source: **GitHub Actions** (recommended) or **`gh-pages` branch** (created by `npm run deploy`).
3. If using the **`gh-pages` branch** flow, just run:

   ```bash
   npm run deploy
   ```

   This builds and pushes `dist/` to a `gh-pages` branch.

4. If using **GitHub Actions**, drop in the workflow below at `.github/workflows/deploy.yml`:

   ```yaml
   name: Deploy to GitHub Pages
   on:
     push:
       branches: [main]
   permissions:
     contents: read
     pages: write
     id-token: write
   jobs:
     build-deploy:
       runs-on: ubuntu-latest
       environment:
         name: github-pages
         url: ${{ steps.deploy.outputs.page_url }}
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20, cache: npm }
         - run: npm ci
         - run: npm run build
         - uses: actions/configure-pages@v5
         - uses: actions/upload-pages-artifact@v3
           with: { path: dist }
         - id: deploy
           uses: actions/deploy-pages@v4
   ```

> If you rename the repo, edit `base` in `vite.config.ts` (and any hard-coded links in the README) to match.

### Custom domain

If you serve from a custom domain (apex or subdomain), set `base: '/'` in `vite.config.ts` and add a `CNAME` file in `public/` containing your domain. Then re-deploy.

---

## 🧠 How learning works

When you start a study session, the app builds a queue of cards that are *due* (intervals expired or new) from the chosen CEFR level. For each card:

1. The Kazakh word + transliteration is shown.
2. You tap the card (or press **Space**) to flip and reveal the English meaning.
3. You rate yourself: **Again / Hard / Good / Easy** (or `1`/`2`/`3`/`4`).
4. The SM-2 algorithm schedules the next review — usually in 1, 6, or `previous × ease` days, with the ease factor adjusting to your performance.

Tap **All** in the study tabs to drill every card in the level regardless of due state.

---

## 🔐 A note on the "light auth"

There is no backend. Accounts and progress are stored in your browser's `localStorage`, keyed by username. Passwords are bcrypt-hashed (8 rounds) on the client before being stored. This is **convenience authentication, not security** — anyone with access to your browser profile can read the data. It's the right tradeoff for a single-user, local-first learning app deployed on static hosting. Don't put anything sensitive here.

You can reset your progress at any time from the **Stats** page.

---

## 🗂 Project structure

```
src/
  data/
    decks.json         # 500 cards by CEFR level (auto-generated, see below)
    decks.ts           # typed export
  lib/
    sm2.ts             # spaced-repetition algorithm
    auth.ts            # bcrypt registration / login
    storage.ts         # localStorage wrapper + SHA-256 helper
    progress.ts        # per-user progress map
  contexts/
    AuthContext.tsx    # current user
    ProgressContext.tsx# SM-2 grade + totals
    ThemeContext.tsx   # light / dark
  components/
    Layout.tsx         # header / nav / footer
    Flashcard.tsx      # flippable 3D card
    ProtectedRoute.tsx # redirect to /login when signed out
  pages/
    HomePage.tsx       # marketing + dashboard
    LoginPage.tsx
    RegisterPage.tsx
    DecksPage.tsx      # all 5 levels
    StudyPage.tsx      # main study session
    BrowsePage.tsx     # search 500 cards
    StatsPage.tsx      # KPIs + per-level mastery
    NotFoundPage.tsx
  styles/global.css    # design tokens + base
  App.tsx              # router
  main.tsx             # entry
```

### Refreshing the deck data

The 500 cards were generated by parsing the public Wordmastery PDFs (one per CEFR level). To re-generate:

1. Place the five `A1..C1` PDFs at `/tmp/kazakh-cards/`.
2. Run `python3 /tmp/kazakh-cards/parse_pdfs.py` — it writes `src/data/decks.json`.

Or just edit `decks.json` directly.

---

## ⌨️ Keyboard shortcuts (in study mode)

| Key             | Action                |
|-----------------|-----------------------|
| `Space` / `Enter` | Reveal the answer    |
| `1`             | Again (≤ 1d)          |
| `2`             | Hard                  |
| `3`             | Good                  |
| `4`             | Easy                  |

---

## 📄 Credits

- Vocabulary: [Wordmastery.org — 1000 most common Kazakh words (CEFR A1–C1)](https://wordmastery.org/kazakh/), used as a CC-style educational source.
- Spaced repetition: SM-2 algorithm (Wozniak, 1990).
- Design system: tokens defined in `src/styles/global.css`.

---

## 📝 License

MIT — do whatever you want, just don't claim you made it.
