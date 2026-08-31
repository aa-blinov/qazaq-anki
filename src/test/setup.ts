// Vitest setup: ensure a clean localStorage between tests.
import { beforeEach } from 'vitest';
import { _resetForTests } from '../lib/storage';

beforeEach(() => {
  _resetForTests();
});
