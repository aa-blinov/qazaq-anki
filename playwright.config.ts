import { defineConfig, devices } from '@playwright/test';

/**
 * Test infrastructure is fully isolated from the dev server:
 *
 *   dev environment (npm run dev):
 *     Vite  5173  →  API 3001  →  data/qazaq.sqlite
 *
 *   e2e suite  (npm run e2e):
 *     Vite  5174  →  API 3011  →  data/test.sqlite  (removed on teardown)
 *
 * The dev API and dev DB are NEVER touched during a test run — the
 * test server is a separate process with its own env vars
 * (DB_PATH, PORT) and its own SQLite file. `globalSetup` wipes the
 * test DB before each run, `globalTeardown` removes it after, so the
 * suite always starts and ends clean.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.mjs',
  globalTeardown: './e2e/global-teardown.mjs',
  fullyParallel: false,           // E2E against a single dev server, keep it simple
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 8000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The `chromium-headless-shell` revision that ships with
        // playwright 1.62.1 (r1234) wasn't fully installed in this
        // contributor's environment — point at the chrome-headless-
        // shell binary from the newer r1243 build that's already on
        // disk. Override via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        // when running elsewhere (CI, another dev machine).
        //
        // On CI the env var is unset and Playwright uses the
        // version it just installed via
        // `npx playwright install --with-deps chromium`.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : {},
      },
    },
  ],
  webServer: [
    {
      // Test API on a separate port so the dev API (:3001) keeps
      // running and the developer's active session is untouched.
      command: 'node server.js',
      port: 3011,
      env: {
        PORT: '3011',
        DB_PATH: 'server/data/test.sqlite',
        // Keep the dev API free of CORS drama by mirroring the
        // dev config. The test Vite (below) and the test API are
        // both on localhost, so same-origin via the proxy.
      },
      reuseExistingServer: false,   // always spin up a clean instance
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Test Vite on a separate port. We pass VITE_API_PROXY so
      // Vite forwards /api/* to the test API on 3011, not the dev
      // 3001. The dev Vite (on 5173) is unaffected.
      command: 'VITE_API_PROXY=http://localhost:3011 npx vite --port 5174 --strictPort',
      port: 5174,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
