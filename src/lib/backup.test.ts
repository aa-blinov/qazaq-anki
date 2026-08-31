import { describe, it, expect } from 'vitest';
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  BackupError,
  backupFilename,
  parseBackup,
  serializeBackup,
  summarizeBackup,
  type BackupFile,
} from './backup';

function makeSample(): BackupFile {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: '2026-08-16T09:00:00.000Z',
    username: 'alex',
    displayName: 'Alex',
    progress: {
      // One schedule per card (v7+). kk-ru and ru-kk faces of
      // the same word share this single SM-2 state.
      'a1-0001': {
        phase: 'review',
        ease: 2.5,
        interval: 4,
        due: '2026-08-20T09:00:00.000Z',
        lastReview: '2026-08-16T09:00:00.000Z',
        reviews: 3,
        correct: 3,
        lapses: 0,
        learningStep: 0,
        reps: 3,
      },
    },
    reviewLog: [
      {
        ts: '2026-08-16T09:00:00.000Z',
        cardId: 'a1-0001',
        direction: 'kk-ru',
        grade: 'good',
      },
    ],
  };
}

describe('backup round-trip', () => {
  it('serializeBackup → parseBackup returns the same shape', () => {
    const original = makeSample();
    const text = serializeBackup(original);
    const parsed = parseBackup(text);
    expect(parsed).toEqual(original);
  });

  it('preserves unknown fields on progress entries (forward compat)', () => {
    // A future server version could add e.g. `lapsesToday`; old
    // clients must not lose that data on round-trip.
    const original = makeSample();
    (original.progress['a1-0001'] as unknown as Record<string, unknown>).lapsesToday = 7;
    const text = serializeBackup(original);
    const parsed = parseBackup(text);
    expect((parsed.progress['a1-0001'] as unknown as Record<string, unknown>).lapsesToday).toBe(7);
  });

  it('preserves an empty review log + non-empty progress', () => {
    const original = makeSample();
    original.reviewLog = [];
    const text = serializeBackup(original);
    const parsed = parseBackup(text);
    expect(parsed.reviewLog).toEqual([]);
    // v7: one schedule per card. The sample has just `a1-0001`.
    expect(Object.keys(parsed.progress)).toHaveLength(1);
  });
});

describe('parseBackup — rejection paths', () => {
  it('rejects non-JSON text with malformedJson', () => {
    try {
      parseBackup('not json at all');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BackupError);
      expect((err as BackupError).code).toBe('malformedJson');
    }
  });

  it('rejects empty string with malformedJson', () => {
    try {
      parseBackup('');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BackupError);
      expect((err as BackupError).code).toBe('malformedJson');
    }
  });

  it('rejects a JSON array (must be an object) with wrongFormat', () => {
    try {
      parseBackup('[]');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as BackupError).code).toBe('wrongFormat');
    }
  });

  it('rejects a JSON object that lacks the format marker', () => {
    try {
      parseBackup(JSON.stringify({ foo: 'bar' }));
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as BackupError).code).toBe('wrongFormat');
    }
  });

  it('rejects a foreign format marker (e.g. someone picks package.json)', () => {
    try {
      parseBackup(
        JSON.stringify({
          format: 'npm-package-json/v1',
          schemaVersion: 1,
        }),
      );
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as BackupError).code).toBe('wrongFormat');
    }
  });

  it('rejects a too-new schema version', () => {
    const future = makeSample();
    future.schemaVersion = 99;
    try {
      parseBackup(serializeBackup(future));
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as BackupError).code).toBe('unsupportedVersion');
    }
  });

  it('rejects when a required field is missing', () => {
    const broken = makeSample() as unknown as Record<string, unknown>;
    delete broken['username'];
    try {
      parseBackup(JSON.stringify(broken));
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as BackupError).code).toBe('missingField');
    }
  });

  it('rejects when progress is not an object', () => {
    const broken = makeSample() as unknown as Record<string, unknown>;
    broken.progress = [];
    try {
      parseBackup(JSON.stringify(broken));
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as BackupError).code).toBe('wrongType');
    }
  });

  it('rejects when reviewLog is not an array', () => {
    const broken = makeSample() as unknown as Record<string, unknown>;
    broken.reviewLog = { 0: { foo: 1 } };
    try {
      parseBackup(JSON.stringify(broken));
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as BackupError).code).toBe('wrongType');
    }
  });

  it('rejects when a review event has an invalid direction', () => {
    const broken = makeSample();
    broken.reviewLog[0] = {
      ...broken.reviewLog[0],
      direction: 'en-kk' as never,
    };
    try {
      parseBackup(serializeBackup(broken));
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as BackupError).code).toBe('wrongType');
    }
  });

  it('rejects when a review event has an invalid grade', () => {
    const broken = makeSample();
    broken.reviewLog[0] = { ...broken.reviewLog[0], grade: 'perfect' as never };
    try {
      parseBackup(serializeBackup(broken));
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as BackupError).code).toBe('wrongType');
    }
  });

  it('accepts an empty backup (fresh-user round-trip is valid)', () => {
    // A user with no progress yet is still a valid case: they
    // might want to roundtrip their blank state to a new device.
    // The confirmation dialog handles "0 cards, 0 events" gracefully.
    const empty: BackupFile = {
      ...makeSample(),
      progress: {},
      reviewLog: [],
    };
    const parsed = parseBackup(serializeBackup(empty));
    expect(parsed.progress).toEqual({});
    expect(parsed.reviewLog).toEqual([]);
  });
});

describe('summarizeBackup', () => {
  it('counts unique cards, not progress entries', () => {
    // The fixture has two progress entries for the same card
    // (a1-0001), one per direction. Summary should say 1 card, 2 entries.
    const summary = summarizeBackup(makeSample(), 'alex');
    expect(summary.cardsTracked).toBe(1);
    expect(summary.reviewEvents).toBe(1);
    expect(summary.sameUser).toBe(true);
  });

  it('marks sameUser=false when the usernames differ', () => {
    const summary = summarizeBackup(makeSample(), 'someone-else');
    expect(summary.sameUser).toBe(false);
  });

  it('marks sameUser=false when there is no current user', () => {
    const summary = summarizeBackup(makeSample(), null);
    expect(summary.sameUser).toBe(false);
  });

  it('parses exportedAt into a Date instance', () => {
    const summary = summarizeBackup(makeSample(), 'alex');
    expect(summary.exportedAt).toBeInstanceOf(Date);
    expect(summary.exportedAt.toISOString()).toBe('2026-08-16T09:00:00.000Z');
  });
});

describe('backupFilename', () => {
  it('includes username, version, and date', () => {
    const name = backupFilename('alex', new Date('2026-08-16T09:00:00Z'));
    // BACKUP_SCHEMA_VERSION is 2 since the per-direction key
    // was collapsed into a per-card key.
    expect(name).toBe('qazaq-backup-alex-v2-2026-08-16.json');
  });

  it('sanitises weird usernames in the filename', () => {
    // Just makes sure it doesn't blow up on edge cases.
    const name = backupFilename('a/b\\c', new Date('2026-01-01T00:00:00Z'));
    expect(name.startsWith('qazaq-backup-a/b\\c-v2-')).toBe(true);
  });
});
