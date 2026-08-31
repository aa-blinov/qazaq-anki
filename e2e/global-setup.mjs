// Playwright globalSetup — runs once before the entire e2e suite.
//
// We DO NOT touch the dev database. Tests run against a dedicated
// SQLite file at `server/data/test.sqlite`, the test API server
// (started by Playwright's `webServer` config) reads from it, and
// the file is removed on teardown.
//
// Why: the dev server (port 3001) keeps running for `npm run dev`.
// During e2e runs the dev API stays on 3001, the test API takes
// 3011, and the Vite dev server keeps its port 5173. Nothing the
// tests do can corrupt the developer's active session.

import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = resolve(__dirname, '../server/data/test.sqlite');
const TEST_DB_DIR = dirname(TEST_DB);

export default async function globalSetup() {
  // Ensure the data/ directory exists (the test server creates the
  // DB file on first open, but it needs the parent dir to exist).
  if (!existsSync(TEST_DB_DIR)) {
    mkdirSync(TEST_DB_DIR, { recursive: true });
  }
  // Wipe a stale test DB from a previous run. The test API server
  // hasn't started yet at this point, so the file isn't held open.
  if (existsSync(TEST_DB)) {
    unlinkSync(TEST_DB);
    // eslint-disable-next-line no-console
    console.log(`[e2e:setup] removed stale ${TEST_DB}`);
  }
  // Print where the test DB will live so the operator can confirm.
  // eslint-disable-next-line no-console
  console.log(`[e2e:setup] test DB path: ${TEST_DB}`);
}
