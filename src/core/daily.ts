import { GEN_LAYOUT, GEN_THEMES, type GenParams } from '../tracks/generator';

/**
 * The daily track: the Track Generator's dials drawn from the date (UTC),
 * the same for everyone, so its leaderboard is a shared challenge that
 * changes every day. Pure, so the tests and the server agree on it.
 */
export function dailyKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** A small hash of the day, spread so neighbouring days land far apart. */
function dayHash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Murmur-style finalizer: the low bits of the FNV hash alone move together.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * The first day whose daily is laid round a shape (GEN_LAYOUT) rather than
 * the old rectangle: the dailies before it, and their boards, stay as they
 * were.
 */
export const DAILY_LAYOUT_FROM = '2026-11-10';

export function dailyParams(date = new Date()): GenParams {
  const key = dailyKey(date);
  const h = dayHash(key);
  const p: GenParams = {
    seed: h % 1_000_000_000,
    theme: GEN_THEMES[Math.floor(h / 7) % GEN_THEMES.length],
    // Never the plainest or the hardest: a daily should be a race, not a tutorial or a gauntlet.
    complexity: 2 + (Math.floor(h / 97) % 3),
    length: (['short', 'medium', 'long'] as const)[Math.floor(h / 13) % 3],
  };
  if (key >= DAILY_LAYOUT_FROM) p.layout = GEN_LAYOUT;
  return p;
}

/** The date as the picker prints it: "Thu 22 Oct". */
export function dailyLabel(date = new Date()): string {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
