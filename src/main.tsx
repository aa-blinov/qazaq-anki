import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { preloadAllLevels } from './data/decks';
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
 * The level JSONs (a1.json … c1.json) are lazy-loaded on demand,
 * but the home page and the browse page need the per-level
 * counts on first paint. We kick off a fire-and-forget preload
 * so the cache is warm by the time the user reads the lede
 * (typically 100–200ms in dev, near-instant from the disk
 * cache in prod). The first render falls back to the build-time
 * `cardCount` hint in `decks.json` if the cache isn't ready
 * yet, so the user never sees "0".
 */
preloadAllLevels().catch((err) => {
  // The pre-load is a progressive enhancement — if it fails (e.g.
  // a corrupt JSON), the level still loads on demand when the
  // user opens a study session. Log but don't crash.
  console.warn('[main] preloadAllLevels failed:', err);
});

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
