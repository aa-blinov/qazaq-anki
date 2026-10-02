import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

// @font-face blocks must be parsed before the rules that reference the
// families, so this import has to stay above global.css. The files are
// local (public/fonts) — see src/styles/fonts.css for why.
import './styles/fonts.css';
import './styles/global.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

// React Router's basename must match Vite's `base` (the prefix baked
// into index.html's asset paths). Without this, the production build
// (which sets base='/anki-qazaq/' for GitHub-Pages-style hosting)
// silently 404s on every route except the index: BrowserRouter
// thinks we're on `/`, but the assets and the URL the user typed
// both live under `/anki-qazaq/`, so the router never matches any
// declared route. The fallback from `try_files` in nginx just hands
// back index.html, which is what the user sees ("Страница не
// найдена").
//
// `import.meta.env.BASE_URL` is whatever was passed as `--base` to
// Vite (or via `VITE_BASE`). We strip the trailing slash that Vite
// always appends — BrowserRouter wants a path with no trailing
// slash, e.g. `/anki-qazaq` (or `''` for root).
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * Persistence now lives on the Node server (SQLite file under
 * `server/data/qazaq.sqlite`). The browser only holds the
 * session token in localStorage; every read/write goes through
 * `src/lib/api.ts`. So there is no client-side DB to warm up
 * before render — we just mount the React tree.
 *
 * The level JSONs (a1.json … c1.json) are loaded by the pages that
 * display them: HomePage, BrowsePage and StatsPage each call
 * `loadLevel` for what they need, and `loadLevel` dedupes concurrent
 * requests through an `inflight` map, so they share one fetch per
 * level. There is deliberately no module-scope preload here any more.
 *
 * It used to call `preloadAllLevels()` before rendering, and it was
 * pure duplication: every consumer above already loads what it reads.
 * What it actually bought was 193 KB of JSON on routes that display no
 * cards at all — /login, /register, /404 — and on the study screen,
 * which needs one level and was being handed all five. `getCardCount`
 * and `getTotalCards` already fall back to the build-time `cardCount`
 * hint in `decks.json` when a level is not in the cache, so a page
 * that has not loaded its decks yet renders correct numbers rather
 * than zeros.
 */

createRoot(rootEl).render(
  <StrictMode>
    {/* ErrorBoundary lives OUTSIDE the BrowserRouter so a router
        crash (e.g. malformed URL parsing) is still caught. The
        "Back to home" recovery link is just a plain <a href="/">,
        which the router has no say in. */}
    <ErrorBoundary>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
