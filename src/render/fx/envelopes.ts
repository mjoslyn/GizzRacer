import type { Detail } from '../detail';

/**
 * The effects' budgets and the shapes their motion follows over time: pure
 * numbers, tested in tests/fx.test.ts.
 */

/** Live particles each layer may hold, and how much of each burst is spawned, by detail level. Low is for phones. */
export const FX_BUDGET: Record<Detail, { add: number; alpha: number; scale: number }> = {
  high: { add: 1100, alpha: 640, scale: 1 },
  medium: { add: 800, alpha: 460, scale: 0.75 },
  low: { add: 420, alpha: 240, scale: 0.45 },
};

/** How many of a burst of `n` to spawn at `scale`: never none of something asked for. */
export function burstCount(n: number, scale: number): number {
  if (n <= 0) return 0;
  return Math.max(1, Math.round(n * scale));
}

/** A damped wobble that starts at 0, kicks out and rings down: squash and stretch, a head's whip. */
export function ring(t: number, freq: number, decay: number): number {
  if (t < 0) return 0;
  return Math.exp(-decay * t) * Math.sin(freq * t);
}

/** Ease out, cubic, 0..1. */
export function easeOut(u: number): number {
  const v = 1 - Math.min(1, Math.max(0, u));
  return 1 - v * v * v;
}

/** 0..1 up and back down over 0..1, sharp in and slow out: a flash. */
export function flashCurve(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  return u < 0.15 ? u / 0.15 : (1 - (u - 0.15) / 0.85) ** 2;
}

/**
 * A dropped item's warning before it arms: a blink that quickens as the
 * moment comes (on or off). `left` is the seconds to arming, `of` the whole wait.
 */
export function armBlink(left: number, of: number, time: number): boolean {
  if (left <= 0) return false;
  const u = 1 - left / Math.max(1e-6, of);
  const rate = 6 + u * 18;
  return Math.sin(time * rate * Math.PI * 2) > -0.2;
}

/** Where a tossed item is along its arc (0..1 of the way, and its height over the line between), `u` 0..1 of the toss. */
export function tossArc(u: number, height: number): [along: number, lift: number] {
  const v = Math.min(1, Math.max(0, u));
  return [easeOut(v), Math.sin(v * Math.PI) * height];
}

/** A thud's loudness from the speed two karts met at (m/s of impulse): nothing for a nudge, full by a hard ram. */
export function thudLevel(impulse: number): number {
  return Math.min(1, Math.max(0, (impulse - 3) / 9));
}

/** The camera's nudge from a bump, metres: grows with the hit and tops out. */
export function nudgeFor(impulse: number): number {
  return Math.min(0.35, Math.max(0, impulse - 3) * 0.04);
}
