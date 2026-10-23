import type { Ribbon } from './track';

/**
 * The bends of a road, for the HUD's next-turn indicator: pace notes, read
 * off the road's own curvature once per track.
 */
export interface Bend {
  /** Where it starts and ends, in spline metres along the ribbon. */
  from: number;
  to: number;
  /** Which way: -1 left, 1 right (steering's sign). */
  dir: -1 | 1;
  /** How far it turns, in degrees. */
  angle: number;
  /** 1 easy, 2 medium, 3 sharp, 4 hairpin. */
  severity: 1 | 2 | 3 | 4;
}

/** Curvature (rad/m) that counts as bending: a radius under about 125 m (the speedway's sweepers). */
const BEND_K = 0.008;
/** A bend this short a break in it, the same way, is one bend. */
const MERGE_GAP = 10;
/** Turns smaller than this (degrees) are a kink, not a bend. */
const MIN_ANGLE = 22;
/**
 * Severity is how tight it gets: its smallest radius (m) under each of these
 * reads one step sharper. A long turn (over LONG degrees) tight enough to be
 * a medium reads a step sharper still; a short flick (under SHORT) at most
 * a medium.
 */
const SEVERITY_RADII = [75, 42, 24] as const;
const LONG = 120;
const SHORT = 45;
/** How far ahead (m) the indicator looks, and how far from a bend's end it lets go of it for the next. */
export const TURN_AHEAD = 180;
const EXIT = 12;

/** Every bend of a ribbon, in order along it. */
export function findBends(ribbon: Ribbon): Bend[] {
  const sp = ribbon.spline;
  const step = sp.length / (sp.closed ? sp.count : sp.count - 1);
  const raw: { from: number; to: number; sign: number; turn: number; maxK: number }[] = [];
  let cur: (typeof raw)[number] | null = null;
  for (let i = 0; i < sp.count; i++) {
    const k = ribbon.curvature[i];
    const sign = Math.abs(k) >= BEND_K ? Math.sign(k) : 0;
    if (sign !== 0 && cur && cur.sign === sign) {
      cur.to = sp.dist[i] + step;
      cur.turn += Math.abs(k) * step;
      cur.maxK = Math.max(cur.maxK, Math.abs(k));
    } else if (sign !== 0) {
      const last = raw[raw.length - 1];
      // Picking up again the same way after a short break: the same bend.
      if (last && last.sign === sign && sp.dist[i] - last.to < MERGE_GAP && cur === null) {
        cur = last;
        cur.to = sp.dist[i] + step;
        cur.turn += Math.abs(k) * step;
        cur.maxK = Math.max(cur.maxK, Math.abs(k));
      } else {
        cur = { from: sp.dist[i], to: sp.dist[i] + step, sign, turn: Math.abs(k) * step, maxK: Math.abs(k) };
        raw.push(cur);
      }
    } else {
      cur = null;
    }
  }
  const bends: Bend[] = [];
  for (const b of raw) {
    const angle = (b.turn * 180) / Math.PI;
    if (angle < MIN_ANGLE) continue;
    const radius = 1 / b.maxK;
    let severity = 1 + SEVERITY_RADII.filter((r) => radius < r).length;
    if (angle > LONG && severity >= 2) severity = Math.min(4, severity + 1);
    if (angle < SHORT) severity = Math.min(2, severity);
    // Curvature is positive turning left; steering is positive right.
    bends.push({ from: b.from, to: b.to, dir: b.sign > 0 ? -1 : 1, angle: Math.round(angle), severity: severity as Bend['severity'] });
  }
  return bends;
}

/**
 * The bend to call at `progress` (spline metres along a loop of `length`):
 * the one the kart is in, until it's nearly through, else the next one
 * within `ahead`, with how far off its start is (0 inside it). Null on a
 * straight with nothing coming.
 */
export function nextBend(bends: readonly Bend[], length: number, progress: number, ahead = TURN_AHEAD): { bend: Bend; distance: number } | null {
  const wrap = (v: number) => ((v % length) + length) % length;
  let best: { bend: Bend; distance: number } | null = null;
  for (const bend of bends) {
    const toStart = wrap(bend.from - progress);
    const toEnd = wrap(bend.to - progress);
    // Inside it: its end comes before its start, going round.
    if (toEnd < toStart) {
      if (toEnd > EXIT) return { bend, distance: 0 };
      continue;
    }
    if (toStart <= ahead && (!best || toStart < best.distance)) best = { bend, distance: toStart };
  }
  return best;
}
