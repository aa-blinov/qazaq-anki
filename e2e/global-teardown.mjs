// Playwright globalTeardown — runs once after the entire e2e suite.
//
// Removes the test SQLite file so the next run starts clean. We do
// not delete the parent `server/data/` directory because the dev
// server keeps its own `qazaq.sqlite` file there and we want to
// leave that alone.

import { existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = resolve(__dirname, '../server/data/test.sqlite');

export default async function globalTeardown() {
  if (existsSync(TEST_DB)) {
    unlinkSync(TEST_DB);
    // eslint-disable-next-line no-console
    console.log(`[e2e:teardown] removed ${TEST_DB}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[e2e:teardown] no test DB to remove (${TEST_DB})`);
  }
}
