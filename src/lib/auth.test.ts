import { describe, it, expect } from 'vitest';
import { AuthError, isUserRecord, validateCredentials, type UserRecord } from './auth';

describe('validateCredentials', () => {
  it('normalises the username (trims + lowercases)', () => {
    const out = validateCredentials('  Alice  ', 'hunter2');
    expect(out.username).toBe('alice');
  });

  it('rejects empty usernames', () => {
    expect(() => validateCredentials('', 'hunter2')).toThrow(AuthError);
    expect(() => validateCredentials('   ', 'hunter2')).toThrow(AuthError);
  });

  it('rejects non-string usernames', () => {
    // Cast to any so we can exercise the runtime check on a non-string.
    // The function is typed as `(username: unknown, password: unknown)`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateCredentials(42 as any, 'hunter2')).toThrow(/required/i);
  });

  it('rejects too-short usernames', () => {
    expect(() => validateCredentials('ab', 'hunter2')).toThrow(/at least 3/);
  });

  it('rejects too-long usernames', () => {
    expect(() => validateCredentials('a'.repeat(33), 'hunter2')).toThrow(/at most 32/);
  });

  it('rejects usernames with invalid characters', () => {
    expect(() => validateCredentials('user name', 'hunter2')).toThrow();
    expect(() => validateCredentials('user@host', 'hunter2')).toThrow();
    expect(() => validateCredentials('héllo', 'hunter2')).toThrow();
  });

  it('rejects empty / too-short / too-long passwords', () => {
    expect(() => validateCredentials('alice', '')).toThrow(/required/i);
    expect(() => validateCredentials('alice', '123')).toThrow(/at least 4/);
    expect(() => validateCredentials('alice', 'a'.repeat(257))).toThrow(/at most 256/);
  });

  it('falls back to the username as the display name', () => {
    const out = validateCredentials('alice', 'hunter2');
    expect(out.displayName).toBe('alice');
  });
});

describe('isUserRecord', () => {
  const base: UserRecord = {
    id: 'id-1',
    username: 'alice',
    displayName: 'Alice',
    createdAt: '2020-01-01T00:00:00.000Z',
  };

  it('accepts a well-formed record', () => {
    expect(isUserRecord(base)).toBe(true);
  });

  it('accepts a record with a valid bcrypt hash', () => {
    expect(
      isUserRecord({ ...base, passwordHash: '$2a$10$432Lfxx0BfG4EZM5c.KSsOelmZKDB5FN3lDwdd56kKYEGlc9hw/ku' }),
    ).toBe(true);
  });

  it('rejects a record with a fake bcrypt prefix', () => {
    expect(isUserRecord({ ...base, passwordHash: 'plaintext' })).toBe(false);
  });

  it('rejects a record with a tampered username charset', () => {
    expect(isUserRecord({ ...base, username: 'has space' })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isUserRecord(null)).toBe(false);
    expect(isUserRecord('alice')).toBe(false);
    expect(isUserRecord(42)).toBe(false);
  });

  it('rejects records that are missing required fields', () => {
    const { id, ...rest } = base;
    expect(isUserRecord(rest)).toBe(false);
  });
});
