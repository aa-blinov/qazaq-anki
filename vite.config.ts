import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Different base for dev vs production.
// Dev (npm run dev)   → '/' so the dev server works at http://localhost:5173/
// Build (npm run build) → '/anki-qazaq/' so it deploys to https://<user>.github.io/anki-qazaq/
// Override the production base by setting VITE_BASE before `npm run build`.
const base: string =
  process.env.VITE_BASE ||
  (process.env.NODE_ENV === 'production' ? '/anki-qazaq/' : '/');

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base,
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
  server: {
    port: 5173,
    open: false,
    host: '0.0.0.0',
    // In dev we proxy /api/* to the local Node server so the
    // browser can call the backend without CORS or env juggling.
    // Override the target with VITE_API_PROXY when the server runs
    // on a different host/port.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  esbuild: mode === 'production' ? { drop: ['debugger'] } : undefined,
}));
