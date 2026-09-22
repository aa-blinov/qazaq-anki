/**
 * Type declarations for the plain-JS `deck-meta.js` module.
 *
 * The runtime is JS so it runs without a build step (the server
 * starts directly with `node server.js`). We declare the public
 * surface here so the test file and any TypeScript consumers get
 * proper types without needing the runtime to ship a `.ts` build.
 */
export const LEVELS: readonly ['A1', 'A2', 'B1', 'B2', 'C1'];

export type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export function loadDeckMeta(): void;

/** Returns the CEFR level for a cardId, or null if the card is
 *  not in the official starter set (e.g. user-added cards). */
export function cardLevelOf(cardId: string): Level | null;

/** Returns a fresh copy of `{ A1: count, A2: count, ... }` so
 *  callers can't mutate the cached state. */
export function totalCardsByLevel(): Record<Level, number>;