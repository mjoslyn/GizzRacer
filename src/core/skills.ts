import { clamp, seededRandom } from './math';
import { pointAt } from '../tracks/spline';
import type { Track } from '../tracks/track';

/**
 * Story mode's skill games: one stands between each chapter's race and its
 * boss. Four are played on a card over the game (ui/skillScreen.ts); the
 * Deadstick Landing is flown on a track. This is their rules and draws,
 * kept pure so they can be tested. `level` is the chapter, 0..2.
 */

export type SkillKind = 'riff' | 'nonagon' | 'banana' | 'horology' | 'deadstick' | 'mindfuzz';
export const SKILL_KINDS: readonly SkillKind[] = ['riff', 'nonagon', 'banana', 'horology', 'deadstick', 'mindfuzz'];

export const SKILLS: Record<SkillKind, { name: string; intro: string; howTo: string }> = {
  riff: {
    name: 'Play the Riff',
    intro: 'A King Gizzard song lives or dies on its riff. This one comes round four times: play it back without dropping it.',
    howTo: 'Press each lane as its note hits the gold line: arrow keys or D F J K, or tap the lane',
  },
  nonagon: {
    name: 'Nonagon Infinity',
    intro: 'Nine sides, one loop, and it never ends. Watch the lights go round the nonagon, then play them back.',
    howTo: 'Watch the lights, then press them back in order: keys 1 to 9 (or arrows and Enter), or tap the sides',
  },
  banana: {
    name: 'The Flying Microtonal Banana',
    intro: 'The banana plays between the notes. Tune your string to the drone: when the wobble stops, you are there.',
    howTo: 'Tune until the ring stops wobbling: left and right a little, up and down a lot, Enter locks it in',
  },
  horology: {
    name: 'Horology',
    intro: 'Time is a loop too, and it is slipping. Stop the hand inside the mark before it gets away.',
    howTo: 'Press Space or Enter (or tap) while the hand is inside the gold mark',
  },
  mindfuzz: {
    name: 'The Mind Fuzz Suite',
    intro: "I'm In Your Mind Fuzz runs four songs into one. Play the suite through: read the mind, find the arrow that is not there, line up the cellophane, then ride the fuzz.",
    howTo: 'Four movements, pass three: arrow keys or WASD for the arrows, Space for the rest, or tap',
  },
  deadstick: {
    name: 'Deadstick Landing',
    intro: 'Engine dead, glider out. Hit the ramp, hop on the lip to open the wings, and put it down in the ring.',
    howTo: 'Hop as you hit the ramp to open the glider; up climbs, down dives. Land in the ring',
  },
};

const lv = <T>(list: readonly T[], level: number): T => list[clamp(Math.round(level), 0, list.length - 1)];

/**
 * Exactly what to do to pass a game at a level, with its real numbers: for
 * the card before it (story mode's, and Skill Games' difficulty screen).
 */
export function skillRules(kind: SkillKind, level: number): string {
  switch (kind) {
    case 'riff': {
      const r = makeRiff(1, level);
      return `Notes fall down four lanes. As each reaches the gold line, press its lane: the arrow keys or D F J K, or tap the lane. After a one-bar count-in the riff plays four times at ${r.bpm} bpm. Hit ${Math.round(r.need * 100)}% of the notes to pass; every two presses with no note there cost one.`;
    }
    case 'nonagon': {
      const g = makeNonagon(1, level);
      return `The nine sides light up one at a time. When they stop, press them back in the same order: keys 1 to 9 (or arrows and Enter), or tap the sides. It starts with ${NONAGON_FIRST} lights and adds one each round. Play back all ${g.seq.length} to pass; one wrong side and it's over.`;
    }
    case 'banana': {
      const g = makeBanana(1, level);
      return `Two notes play: the drone and your string. Tune your string until the yellow ring stops wobbling, then lock it in. Left and right move it a little, up and down a lot, Enter locks (or tap the buttons). Get ${BANANA_NEED} of ${BANANA_ROUNDS} strings within ${g.tolerance} cents of the drone, ${BANANA_TIME} seconds each.`;
    }
    case 'horology': {
      const g = makeHorology(1, level);
      return `A hand sweeps round the clock. Press Space or Enter (or tap) while it's inside the gold mark. ${HOROLOGY_ROUNDS} tries, the mark shrinking and the hand speeding up each time; land ${g.need} of them.`;
    }
    case 'mindfuzz': {
      const g = makeSuite(1, level);
      return `Four movements; pass ${SUITE_NEED}. One: an arrow flashes in the eye for ${g.mind.flash} seconds: press that arrow (or tap its pad), ${g.mind.need} of ${g.mind.arrows.length}. Two: three arrows show: press the missing fourth within ${g.notMind.time} seconds, ${g.notMind.need} of ${g.notMind.missing.length}. Three: two sheets slide: press Space (or tap) when they overlap, ${g.cellophane.need} of ${g.cellophane.sheets.length}. Four: tap Space (or tap) to push the needle up and hold it in the gold band for ${g.fuzz.need} seconds out of ${g.fuzz.time}.`;
    }
    case 'deadstick':
      return `Drive at the ramp ahead and hop (Shift or Space, or DRIFT on touch) as you hit it to open the glider. In the air, Up climbs and carries you further, Down dives and brings you down sooner (on touch, drag up or down). Come down inside the gold ring, ${deadstickRadius(level)} m from its middle, within ${DEADSTICK_SHOTS} shots.`;
  }
}

// ---- Play the Riff ----

export const RIFF_LANES = 4;
/** Hit windows either side of a note, seconds. */
export const RIFF_GOOD = 0.09;
export const RIFF_OK = 0.18;
/** Bars of count-in before the first note. */
export const RIFF_COUNT_IN = 1;

export interface RiffNote {
  /** Seconds from the start of the count-in. */
  t: number;
  lane: number;
}

export interface Riff {
  bpm: number;
  notes: RiffNote[];
  /** Share of the notes to land (every two strays take one off) to pass. */
  need: number;
  /** Seconds the whole thing runs, the count-in and a beat after the last note included. */
  length: number;
}

/**
 * A one-bar riff on eighth notes, a random walk across the lanes, played
 * four times: as written, again, varied, and as written to finish. A little
 * faster and busier by chapter, never much: it's a skill stage, not a test.
 */
export function makeRiff(seed: number, level: number): Riff {
  const rand = seededRandom(seed);
  const bpm = lv([80, 88, 96], level);
  const eighth = 30 / bpm;
  const fill = lv([0.4, 0.48, 0.55], level);
  const bar: (number | null)[] = [];
  let lane = Math.floor(rand() * RIFF_LANES);
  for (let i = 0; i < 8; i++) {
    // The downbeat always sounds; the rest by the chapter's fill.
    if (i === 0 || rand() < fill) {
      bar.push(lane);
      const step = rand() < 0.5 ? -1 : 1;
      lane = (lane + step + RIFF_LANES) % RIFF_LANES;
    } else bar.push(null);
  }
  const varied = bar.map((l, i) => (l !== null && i >= 4 ? (l + 2) % RIFF_LANES : l));
  const notes: RiffNote[] = [];
  const start = RIFF_COUNT_IN * 8 * eighth;
  [bar, bar, varied, bar].forEach((b, n) =>
    b.forEach((l, i) => {
      if (l !== null) notes.push({ t: start + (n * 8 + i) * eighth, lane: l });
    }),
  );
  return { bpm, notes, need: lv([0.6, 0.65, 0.7], level), length: start + 32 * eighth + 2 * eighth };
}

/** How a press lands on a note: 'good', 'ok', or null for nowhere near. */
export function riffJudge(noteT: number, pressT: number): 'good' | 'ok' | null {
  const d = Math.abs(noteT - pressT);
  return d <= RIFF_GOOD ? 'good' : d <= RIFF_OK ? 'ok' : null;
}

/** Whether a riff's played well enough: hits less half the strays, as a share of the notes. */
export function riffPasses(riff: Riff, hits: number, strays: number): boolean {
  return Math.max(0, hits - Math.floor(strays / 2)) >= Math.ceil(riff.notes.length * riff.need);
}

// ---- Nonagon Infinity ----

export const NONAGON_SIDES = 9;
export const NONAGON_FIRST = 3;

export interface NonagonGame {
  /** The full loop; round n plays the first NONAGON_FIRST + n of it. */
  seq: number[];
  /** Seconds each light shows for. */
  beat: number;
}

export function makeNonagon(seed: number, level: number): NonagonGame {
  const rand = seededRandom(seed);
  const length = lv([5, 6, 7], level);
  const seq: number[] = [];
  for (let i = 0; i < length; i++) {
    // Never the same side twice running: it reads as one light.
    let side = Math.floor(rand() * NONAGON_SIDES);
    if (side === seq[i - 1]) side = (side + 1 + Math.floor(rand() * (NONAGON_SIDES - 1))) % NONAGON_SIDES;
    seq.push(side);
  }
  return { seq, beat: lv([0.55, 0.46, 0.38], level) };
}

// ---- The Flying Microtonal Banana ----

/** The drone to tune to, Hz. */
export const BANANA_DRONE = 220;
export const BANANA_ROUNDS = 3;
export const BANANA_NEED = 2;
/** Cents a fine and a coarse turn move the string. */
export const BANANA_FINE = 3;
export const BANANA_COARSE = 25;
/** Seconds before a string locks itself in. */
export const BANANA_TIME = 25;

export interface BananaGame {
  /** Where each string starts, cents off the drone. */
  starts: number[];
  /** How close (cents) counts as in tune. */
  tolerance: number;
}

export function makeBanana(seed: number, level: number): BananaGame {
  const rand = seededRandom(seed);
  const starts = Array.from({ length: BANANA_ROUNDS }, () => (rand() < 0.5 ? -1 : 1) * Math.round(80 + rand() * 140));
  return { starts, tolerance: lv([15, 12, 9], level) };
}

/** A string's pitch, `cents` off the drone. */
export const bananaHz = (cents: number): number => BANANA_DRONE * 2 ** (cents / 1200);

// ---- Horology ----

export const HOROLOGY_ROUNDS = 5;

export interface HorologyRound {
  /** The mark's middle and full width, turns (0..1, 0 at twelve). */
  at: number;
  width: number;
  /** Turns a second, signed: the hand runs back on the odd rounds. */
  speed: number;
}

export interface HorologyGame {
  rounds: HorologyRound[];
  need: number;
}

export function makeHorology(seed: number, level: number): HorologyGame {
  const rand = seededRandom(seed);
  const width = lv([50, 40, 32], level) / 360;
  const speed = lv([0.55, 0.7, 0.85], level);
  const rounds = Array.from({ length: HOROLOGY_ROUNDS }, (_, i) => ({
    at: 0.15 + rand() * 0.7,
    width: width * (1 - 0.08 * i),
    speed: (speed + 0.05 * i) * (i % 2 ? -1 : 1),
  }));
  return { rounds, need: lv([3, 4, 4], level) };
}

/** Whether a hand stopped at `angle` (turns) is inside a round's mark. */
export function horologyHit(r: HorologyRound, angle: number): boolean {
  const d = Math.abs(((angle - r.at + 1.5) % 1) - 0.5);
  return d <= r.width / 2;
}

// ---- The Mind Fuzz Suite ----

/** The suite's movements, in album order: one a song of I'm In Your Mind Fuzz's opening suite. */
export const SUITE_MOVES = ['mind', 'notMind', 'cellophane', 'fuzz'] as const;
export type SuiteMove = (typeof SUITE_MOVES)[number];
export const SUITE_NAMES: Record<SuiteMove, { song: string; how: string }> = {
  mind: { song: "I'm In Your Mind", how: 'An arrow flashes in the eye: press that arrow (or tap its pad)' },
  notMind: { song: "I'm Not In Your Mind", how: 'Three arrows show: press the missing fourth before the ring runs out' },
  cellophane: { song: 'Cellophane', how: 'Two sheets slide: press Space (or tap) when they overlap' },
  fuzz: { song: "I'm In Your Mind Fuzz", how: 'Tap Space (or tap) to push the needle up: keep it in the gold band' },
};
/** Movements to pass for the suite. */
export const SUITE_NEED = 3;
/** Arrows: left, down, up, right (as the riff's lanes). */
export const SUITE_ARROWS = 4;

export interface SuiteGame {
  /** I'm In Your Mind: the arrow each round, and how long it shows. */
  mind: { arrows: number[]; flash: number; need: number };
  /** I'm Not In Your Mind: the missing arrow each round, and the seconds to answer. */
  notMind: { missing: number[]; time: number; need: number };
  /** Cellophane: each try's two sheets, as speeds (turns a second) and phases; the overlap to hit. */
  cellophane: { sheets: { speed: number; phase: number }[][]; overlap: number; need: number };
  /** I'm In Your Mind Fuzz: the band to hold the needle in, and the seconds in it to pass, out of `time`. */
  fuzz: { band: [number, number]; need: number; time: number };
}

export function makeSuite(seed: number, level: number): SuiteGame {
  const rand = seededRandom(seed);
  const arrow = () => Math.floor(rand() * SUITE_ARROWS);
  const width = lv([0.24, 0.21, 0.18], level);
  const low = 0.4 + rand() * 0.25;
  return {
    mind: { arrows: Array.from({ length: 5 }, arrow), flash: lv([0.75, 0.6, 0.5], level), need: 4 },
    notMind: { missing: Array.from({ length: 5 }, arrow), time: lv([3, 2.6, 2.2], level), need: 4 },
    cellophane: {
      sheets: Array.from({ length: 4 }, () => [0, 1].map((i) => ({ speed: (0.18 + rand() * 0.12) * (i ? -1 : 1), phase: rand() }))),
      overlap: lv([0.75, 0.8, 0.85], level),
      need: lv([2, 2, 3], level),
    },
    fuzz: { band: [low, low + width], need: lv([4, 5, 5.5], level), time: 12 },
  };
}

/** Where a cellophane sheet's middle is (0..1 across) at `t` seconds. */
export function sheetAt(s: { speed: number; phase: number }, t: number): number {
  return 0.5 + 0.3 * Math.sin((s.phase + s.speed * t) * Math.PI * 2);
}

/** How much two sheets of `width` (0..1) with middles at `a` and `b` cover each other, 0..1. */
export function sheetOverlap(a: number, b: number, width: number): number {
  return Math.max(0, width - Math.abs(a - b)) / width;
}

/** The fuzz needle: a tap kicks it up, the fuzz falls away under it. */
export const FUZZ_KICK = 0.4;
export const FUZZ_FALL = 0.8;

/** One step of the fuzz needle (`level` 0..1, `v` per second), with a tap or not. */
export function fuzzStep(level: number, v: number, dt: number, tapped: boolean): { level: number; v: number } {
  let nv = (tapped ? Math.max(v, 0) + FUZZ_KICK : v) - FUZZ_FALL * dt;
  let nl = level + nv * dt;
  if (nl <= 0) {
    nl = 0;
    nv = Math.max(0, nv);
  } else if (nl >= 1) {
    nl = 1;
    nv = Math.min(0, nv);
  }
  return { level: nl, v: nv };
}

// ---- Deadstick Landing ----

export const DEADSTICK_SHOTS = 3;
/** Metres of run-up to the launcher. */
export const DEADSTICK_RUNUP = 70;
/** Seconds a shot has to get off the ramp and down. */
export const DEADSTICK_SHOT_TIME = 12;

/** The ring's radius by chapter, metres. */
export function deadstickRadius(level: number): number {
  return lv([6, 5, 4.5], level);
}

export interface DeadstickPlan {
  /** Main-road distance (m, Track.length units) of the launcher's leading edge. */
  launchS: number;
  target: { x: number; y: number; z: number };
  radius: number;
}

/**
 * Where the ring goes: on the road between a plain glide and a full climb
 * past the launcher (about 55 to 90 m on), and off the line a little. Tries
 * other spots until one is on the road, not over a gap.
 */
export function planDeadstick(track: Track, seed: number, level: number): DeadstickPlan | null {
  const launcher = track.def.launchers?.[0];
  if (!launcher) return null;
  const rand = seededRandom(seed);
  const launchS = track.mainS(launcher.s);
  for (let i = 0; i < 40; i++) {
    const along = 55 + rand() * 35;
    const lateral = (rand() * 2 - 1) * 3.5;
    const p = pointAt(track.spline, launchS + along);
    const x = p.x - p.tz * lateral;
    const z = p.z + p.tx * lateral;
    const loc = track.locate(x, z, 100);
    if (!loc.onRoad || loc.surface === 'launch') continue;
    return { launchS, target: { x, y: loc.height, z }, radius: deadstickRadius(level) };
  }
  return null;
}
