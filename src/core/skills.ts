import { clamp, seededRandom } from './math';
import { pointAt } from '../tracks/spline';
import type { Track } from '../tracks/track';

/**
 * Story mode's skill games: one stands between each chapter's race and its
 * boss. Four are played on a card over the game (ui/skillScreen.ts); the
 * Deadstick Landing is flown on a track. This is their rules and draws,
 * kept pure so they can be tested. `level` is the chapter, 0..2.
 */

export type SkillKind = 'riff' | 'nonagon' | 'banana' | 'horology' | 'deadstick';
export const SKILL_KINDS: readonly SkillKind[] = ['riff', 'nonagon', 'banana', 'horology', 'deadstick'];

export const SKILLS: Record<SkillKind, { name: string; intro: string; howTo: string }> = {
  riff: {
    name: 'Play the Riff',
    intro: 'A King Gizzard song lives or dies on its riff. This one comes round four times: play it back without dropping it.',
    howTo: 'Hit each lane as its note crosses the line: arrow keys or D F J K, or tap the lanes',
  },
  nonagon: {
    name: 'Nonagon Infinity',
    intro: 'Nine sides, one loop, and it never ends. Watch the lights go round the nonagon, then play them back.',
    howTo: 'Keys 1 to 9 or tap the sides (arrows and Enter work too). One slip and it is over',
  },
  banana: {
    name: 'The Flying Microtonal Banana',
    intro: 'The banana plays between the notes. Tune your string to the drone: when the wobble stops, you are there.',
    howTo: 'Left and right tune fine, up and down coarse, Enter locks it in. Three strings, get two',
  },
  horology: {
    name: 'Horology',
    intro: 'Time is a loop too, and it is slipping. Stop the hand inside the mark before it gets away.',
    howTo: 'Space, Enter or a tap stops the hand. Five tries, and the mark shrinks every time',
  },
  deadstick: {
    name: 'Deadstick Landing',
    intro: 'Engine dead, glider out. Hit the ramp, hop on the lip to open the wings, and put it down in the ring.',
    howTo: 'Hop on the ramp to glide; up climbs, down dives. Three shots to land in the ring',
  },
};

const lv = <T>(list: readonly T[], level: number): T => list[clamp(Math.round(level), 0, list.length - 1)];

// ---- Play the Riff ----

export const RIFF_LANES = 4;
/** Hit windows either side of a note, seconds. */
export const RIFF_GOOD = 0.07;
export const RIFF_OK = 0.13;
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
  /** Share of the notes to land (strays take one off) to pass. */
  need: number;
  /** Seconds the whole thing runs, the count-in and a beat after the last note included. */
  length: number;
}

/**
 * A one-bar riff on eighth notes, a random walk across the lanes, played
 * four times: as written, again, varied, and as written to finish. Faster
 * and busier by chapter.
 */
export function makeRiff(seed: number, level: number): Riff {
  const rand = seededRandom(seed);
  const bpm = lv([112, 126, 140], level);
  const eighth = 30 / bpm;
  const fill = lv([0.55, 0.62, 0.7], level);
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
  return { bpm, notes, need: lv([0.7, 0.75, 0.8], level), length: start + 32 * eighth + 2 * eighth };
}

/** How a press lands on a note: 'good', 'ok', or null for nowhere near. */
export function riffJudge(noteT: number, pressT: number): 'good' | 'ok' | null {
  const d = Math.abs(noteT - pressT);
  return d <= RIFF_GOOD ? 'good' : d <= RIFF_OK ? 'ok' : null;
}

/** Whether a riff's played well enough: hits less strays, as a share of the notes. */
export function riffPasses(riff: Riff, hits: number, strays: number): boolean {
  return Math.max(0, hits - strays) >= Math.ceil(riff.notes.length * riff.need);
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
