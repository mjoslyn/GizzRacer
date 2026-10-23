import { Ribbon, type BoostPad, type Launcher, type TrackDef } from './track';

/**
 * Layout extras laid over every hand-built track from its geometry, so each
 * gets a few more moments a lap without redrawing it:
 *
 * - Rhythm humps on the long flat straights: a sharp-topped rise (the
 *   generator's own shape) that karts fly off, a trick for anyone who hops
 *   the crest and a bump in the road for anyone who doesn't.
 * - Apex pads: a boost pad on the inside of the longest bends, so the tight
 *   line through a hairpin pays and a wide one costs.
 * - A slalom on the longest straight of a track too hilly for a hump:
 *   three pads staggered left, right, left, so the straight is a line to
 *   thread rather than a rest.
 * - Launchers: a ramp across the whole road on the lip of each jump, so
 *   the leap is a glide, and on a track with no jump one on its longest
 *   clear straight, with room past it to come down.
 *
 * Nothing goes near a junction, a jump (a launcher aside), a bridge (a
 * launcher may), a kicker, an item row, a pad, a hazard or the grid. Pure,
 * so the tests pin where things land.
 */
export const HUMP_RAMP = 20;
export const HUMP_HEIGHT = 1.5;
/** A straight needs this much flat, clear road for a hump. */
const HUMP_RUN = 70;
const HUMPS_MAX = 3;
/** Builder metres of clearance kept from anything else on the road. */
const CLEAR = 30;
/** Keep off the grid and the run to the line. */
const START_CLEAR = 40;
const FINISH_CLEAR = 90;
/** Straight enough for a hump (rad/m). */
const STRAIGHT = 0.012;
/** A bend worth a pad turns at least this far at this curvature. */
const BEND_CURVATURE = 0.03;
const BEND_TURN = (60 * Math.PI) / 180;
const PADS_MAX = 2;
export const PAD_LENGTH = 7;
export const PAD_HALF_WIDTH = 1.7;
/** The slalom: three pads this far apart, this far either side of the middle. */
export const SLALOM_STEP = 15;
const SLALOM_RUN = 60;
const SLALOM_SIDE = 0.42;
/** A launcher: this long, ending this far short of a jump's gap, across the road but this far in from its edges. */
export const LAUNCHER_LENGTH = 6;
const LAUNCHER_LIP = 0.5;
const LAUNCHER_EDGE = 0.5;
const LAUNCHERS_MAX = 2;
/**
 * On a track with no jump: a launcher on level road this far into a
 * straight, with this much straight past it to climb out over and this much
 * clear road past it to come down on, bends and all (the glider steers).
 */
const LAUNCH_LEAD = 15;
const LAUNCH_CLIMB = 25;
const LAUNCH_RUN = 95;
/** Over this much road before it, the approach may fall no steeper than this grade, or a kart flies over the launcher. */
const LAUNCH_APPROACH = 30;
const LAUNCH_FALL = 0.06;

interface Span {
  from: number;
  to: number;
}

/** Builder-unit ranges nothing may be placed over; a launcher (`decks` false) may go on a deck or into low gravity. */
function blocked(def: TrackDef, decks = true): Span[] {
  const spans: Span[] = [];
  const at = (s: number, r = CLEAR) => spans.push({ from: s - r, to: s + r });
  for (const b of def.branches) {
    at(b.mainFrom, CLEAR + 10);
    at(b.mainTo, CLEAR + 10);
  }
  for (const [a, b] of def.main.gaps) spans.push({ from: a - CLEAR, to: b + CLEAR });
  for (const row of def.itemBoxes) if (row.ribbon === undefined || row.ribbon < 0) at(row.s);
  for (const p of def.boostPads) at(p.s + p.length / 2);
  for (const lm of def.landmarks) if (lm.ribbon < 0) at(lm.s);
  // Hazards fixed to a spot keep their clearance; ones that roam a stretch (snakes, fish, goblins) share the road with a hump happily.
  for (const h of def.hazards) {
    const hz = h as { at?: number[]; s?: number };
    if (hz.at) for (const s of hz.at) at(s);
    if (hz.s !== undefined) at(hz.s);
  }
  // Bridges and low gravity keep their own character; kickers and dives are height keys and are found by flatness.
  if (decks) for (const sec of def.main.sections) if (sec.bridge || (sec.gravity !== undefined && sec.gravity < 1)) spans.push({ from: sec.from - 10, to: sec.to + 10 });
  spans.push({ from: -Infinity, to: START_CLEAR });
  spans.push({ from: def.main.length - FINISH_CLEAR, to: Infinity });
  return spans;
}

const free = (spans: Span[], from: number, to: number) => spans.every((b) => to < b.from || from > b.to);

/**
 * The road runs even along [from, to]: a straight line in height between
 * its ends, within `tol`, so a kicker, a dive or a crest is never inside
 * the stretch. A gentle constant slope passes; a hump sits on it.
 */
function even(ribbon: Ribbon, from: number, to: number, tol = 0.5, grade = 1.2): boolean {
  const h0 = ribbon.heightAtBuilder(from);
  const h1 = ribbon.heightAtBuilder(to);
  // Near level: a hump on a steep slope is a shelf, not a crest.
  if (Math.abs(h1 - h0) > grade) return false;
  for (let s = from; s <= to; s += 2) {
    const want = h0 + ((h1 - h0) * (s - from)) / (to - from);
    if (Math.abs(ribbon.heightAtBuilder(s) - want) > tol) return false;
  }
  return true;
}

/** The road drops away somewhere along [from, to] steeply enough to throw a kart off it: steeper than LAUNCH_FALL. */
function falls(ribbon: Ribbon, from: number, to: number): boolean {
  for (let s = from; s + 2 <= to; s += 2) if (ribbon.heightAtBuilder(s) - ribbon.heightAtBuilder(s + 2) > 2 * LAUNCH_FALL) return true;
  return false;
}

/** Straight stretches of the main road, in builder units. */
function straights(ribbon: Ribbon): Span[] {
  const sp = ribbon.spline;
  const out: Span[] = [];
  let start: number | null = null;
  for (let i = 0; i <= sp.count; i++) {
    const straightHere = i < sp.count && Math.abs(ribbon.curvature[i]) < STRAIGHT;
    const s = i < sp.count ? sp.dist[i] / ribbon.scale : ribbon.def.length;
    if (straightHere && start === null) start = s;
    if (!straightHere && start !== null) {
      out.push({ from: start, to: s });
      start = null;
    }
  }
  return out;
}

/** Bends of the main road: contiguous runs of real curvature, with the turn they make and which way. */
function bends(ribbon: Ribbon): { from: number; to: number; turn: number; sign: number }[] {
  const sp = ribbon.spline;
  const out: { from: number; to: number; turn: number; sign: number }[] = [];
  let start: number | null = null;
  let sign = 0;
  let turn = 0;
  for (let i = 0; i <= sp.count; i++) {
    const k = i < sp.count ? ribbon.curvature[i] : 0;
    const s = i < sp.count ? sp.dist[i] / ribbon.scale : ribbon.def.length;
    const bending = Math.abs(k) >= BEND_CURVATURE && (sign === 0 || Math.sign(k) === sign);
    if (bending) {
      if (start === null) {
        start = s;
        turn = 0;
      }
      sign = Math.sign(k);
      const ds = sp.length / (sp.closed ? sp.count : sp.count - 1);
      turn += Math.abs(k) * ds;
    } else if (start !== null) {
      out.push({ from: start, to: s, turn, sign });
      start = null;
      sign = 0;
      if (Math.abs(k) >= BEND_CURVATURE) {
        start = s;
        sign = Math.sign(k);
        turn = 0;
      }
    }
  }
  return out;
}

/** A hump's height keys over the road's own profile: two parabolic ramps meeting at a sharp crest (the generator's shape). */
export function humpKeys(a: number, base: (s: number) => number): [number, number][] {
  const keys: [number, number][] = [];
  const top = a + HUMP_RAMP;
  for (let s = a; s <= top; s += 2) keys.push([s, base(s) + HUMP_HEIGHT * ((s - a) / HUMP_RAMP) ** 2]);
  for (let s = top + 2; s < top + HUMP_RAMP; s += 2) keys.push([s, base(s) + HUMP_HEIGHT * (1 - (s - top) / HUMP_RAMP) ** 2]);
  keys.push([top + HUMP_RAMP, base(top + HUMP_RAMP)]);
  return keys;
}

/** The humps, pads and launchers this track gets, without changing it. */
export function planEnrichment(def: TrackDef): { humps: number[]; pads: BoostPad[]; slalom: number | null; launchers: Launcher[] } {
  const ribbon = new Ribbon(def.main);
  const spans = blocked(def);
  const humps: number[] = [];
  const runs = straights(ribbon)
    .filter((r) => r.to - r.from >= HUMP_RUN)
    .sort((a, b) => b.to - b.from - (a.to - a.from));
  for (const r of runs) {
    if (humps.length >= HUMPS_MAX) break;
    // The clear, even window nearest the middle of the straight.
    const mid = (r.from + r.to) / 2 - HUMP_RAMP;
    const reach = (r.to - r.from) / 2;
    let found: number | null = null;
    for (let off = 0; off <= reach && found === null; off += 10) {
      for (const a of off === 0 ? [mid] : [mid - off, mid + off]) {
        const from = a - 8;
        const to = a + 2 * HUMP_RAMP + 8;
        if (from < r.from || to > r.to) continue;
        if (!free(spans, from, to) || !even(ribbon, from, to)) continue;
        if (!humps.every((h) => Math.abs(h - a) > HUMP_RUN)) continue;
        found = a;
        break;
      }
    }
    if (found === null) continue;
    humps.push(found);
    spans.push({ from: found - 8 - CLEAR, to: found + 2 * HUMP_RAMP + 8 + CLEAR });
  }
  const pads: BoostPad[] = [];
  const turns = bends(ribbon)
    .filter((b) => b.turn >= BEND_TURN)
    .sort((a, b) => b.turn - a.turn);
  for (const b of turns) {
    if (pads.length >= PADS_MAX) break;
    const mid = (b.from + b.to) / 2;
    const s = mid - PAD_LENGTH / 2;
    if (!free(spans, s - 10, s + PAD_LENGTH + 10) || !even(ribbon, s - 6, s + PAD_LENGTH + 6, 0.8, 3)) continue;
    const i = nearestIndex(ribbon, mid);
    const hw = ribbon.halfWidth[i];
    if (hw < 4.2) continue;
    // Inside of the bend: a left turn (positive curvature) has its inside on the left (negative lateral).
    const lateral = -b.sign * (hw - PAD_HALF_WIDTH - 0.9);
    pads.push({ s, length: PAD_LENGTH, lateral, halfWidth: PAD_HALF_WIDTH });
    spans.push({ from: s - CLEAR, to: s + PAD_LENGTH + CLEAR });
  }
  // No hump landed (a roller coaster of a track): a slalom on its longest straight instead.
  let slalom: number | null = null;
  if (!humps.length) {
    for (const r of straights(ribbon).sort((a, b) => b.to - b.from - (a.to - a.from))) {
      if (r.to - r.from < SLALOM_RUN) continue;
      const a = (r.from + r.to) / 2 - SLALOM_STEP - PAD_LENGTH / 2;
      const from = a - 6;
      const to = a + 2 * SLALOM_STEP + PAD_LENGTH + 6;
      if (from < r.from || to > r.to || !free(spans, from, to) || !even(ribbon, from, to, 0.8, 6)) continue;
      const hw = ribbon.halfWidth[nearestIndex(ribbon, a + SLALOM_STEP)];
      if (hw < 5) continue;
      for (let k = 0; k < 3; k++) pads.push({ s: a + k * SLALOM_STEP, length: PAD_LENGTH, lateral: (k % 2 === 0 ? -1 : 1) * hw * SLALOM_SIDE, halfWidth: PAD_HALF_WIDTH });
      slalom = a;
      break;
    }
  }
  // The launcher keeps clear of everything above but decks, and of the humps and pads just placed.
  const launchSpans = [...blocked(def, false), ...humps.map((a) => ({ from: a - 8 - CLEAR, to: a + 2 * HUMP_RAMP + 8 + CLEAR })), ...pads.map((p) => ({ from: p.s - CLEAR, to: p.s + p.length + CLEAR }))];
  return { humps, pads, slalom, launchers: planLaunchers(def, ribbon, launchSpans) };
}

/** The launchers a track gets (the generator's, which lays no other extras). */
export function launchersFor(def: TrackDef): Launcher[] {
  return planLaunchers(def, new Ribbon(def.main), blocked(def, false));
}

/** A launcher on the lip of each jump on the main road; with none, one on the longest clear straight. */
function planLaunchers(def: TrackDef, ribbon: Ribbon, spans: Span[]): Launcher[] {
  const across = (s: number): Launcher => {
    const hw = ribbon.halfWidth[nearestIndex(ribbon, s + LAUNCHER_LENGTH / 2)];
    return { s, length: LAUNCHER_LENGTH, lateral: 0, halfWidth: hw - LAUNCHER_EDGE };
  };
  const launchers = def.main.gaps.slice(0, LAUNCHERS_MAX).map(([from]) => across(from - LAUNCHER_LIP - LAUNCHER_LENGTH));
  if (launchers.length) return launchers;
  for (const r of straights(ribbon).sort((a, b) => b.to - b.from - (a.to - a.from))) {
    // As early in the straight as it's clear, for the most room to come down.
    for (let a = r.from + LAUNCH_LEAD; a + LAUNCHER_LENGTH + LAUNCH_CLIMB <= r.to; a += 5) {
      // The road past it may roll (the glide clears it); the launcher sits on level road, with no drop before it to fly over it from.
      if (!free(spans, a - 10, a + LAUNCH_RUN) || !even(ribbon, a - 6, a + LAUNCHER_LENGTH + 6, 0.3, 1) || falls(ribbon, a - LAUNCH_APPROACH, a + LAUNCHER_LENGTH)) continue;
      return [across(a)];
    }
  }
  return [];
}

function nearestIndex(ribbon: Ribbon, builderS: number): number {
  const sp = ribbon.spline;
  const target = builderS * ribbon.scale;
  let lo = 0;
  let hi = sp.count - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (sp.dist[m] < target) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** The track with its extras laid in. */
export function enrichTrack(def: TrackDef): TrackDef {
  const { humps, pads, launchers } = planEnrichment(def);
  if (!humps.length && !pads.length && !launchers.length) return def;
  let elevation = def.main.elevation.slice();
  const ribbon = new Ribbon(def.main);
  for (const a of humps) {
    const to = a + 2 * HUMP_RAMP;
    elevation = elevation.filter(([s]) => s < a || s > to);
    elevation.push(...humpKeys(a, (s) => ribbon.heightAtBuilder(s)));
  }
  elevation.sort((p, q) => p[0] - q[0]);
  return { ...def, main: { ...def.main, elevation }, boostPads: [...def.boostPads, ...pads], launchers: [...(def.launchers ?? []), ...launchers] };
}
