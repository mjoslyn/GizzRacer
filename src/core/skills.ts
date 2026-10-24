import { clamp, seededRandom } from './math';
import { pointAt } from '../tracks/spline';
import type { Track } from '../tracks/track';

/**
 * Story mode's skill games: one stands between each chapter's race and its
 * boss. All but one are played on a card over the game (ui/skillScreen.ts); the
 * Deadstick Landing is flown on a track. This is their rules and draws,
 * kept pure so they can be tested. `level` is the chapter, 0..2.
 */

export type SkillKind = 'riff' | 'nonagon' | 'banana' | 'horology' | 'deadstick' | 'mindfuzz' | 'rattlesnake' | 'robot' | 'fishies' | 'castle';
export const SKILL_KINDS: readonly SkillKind[] = ['riff', 'nonagon', 'banana', 'horology', 'deadstick', 'mindfuzz', 'rattlesnake', 'robot', 'fishies', 'castle'];

export const SKILLS: Record<SkillKind, { name: string; intro: string; howTo: string }> = {
  riff: {
    name: 'Play the Riff',
    intro: 'A King Gizzard song lives or dies on its riff. This one comes round four times: play it back without dropping it.',
    howTo: 'Press each lane while its note is in the gold band: arrow keys or D F J K, or tap the lane',
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
  rattlesnake: {
    name: 'Rattlesnake',
    intro: 'Rattlesnake, rattlesnake, rattles me. Slither round the field eating mice, growing with every one, and never bite your own rattle.',
    howTo: 'Steer with the arrow keys or WASD, or tap the side to turn to',
  },
  robot: {
    name: 'Robot Stop',
    intro: 'Robot stop, robot go. Creep up on the robot while it looks away, and be stock still by the time it turns round.',
    howTo: 'Hold Space (or hold a finger down) to creep forward; let go when the robot starts to turn',
  },
  fishies: {
    name: 'Fishing for Fishies',
    intro: "The fishies are nibbling, but they aren't biting yet. Wait for the bobber to go right under, then strike.",
    howTo: 'Press Space (or tap) when the bobber goes right under, never on a nibble',
  },
  castle: {
    name: 'Crumbling Castle',
    intro: 'Build the castle floor by floor. Each stone slides across the one below: drop it square, because whatever hangs over crumbles away.',
    howTo: 'Press Space (or tap) to drop the sliding stone onto the tower',
  },
  deadstick: {
    name: 'Deadstick Landing',
    intro: 'Engine dead, glider out. Hit the ramp, hop on the lip to open the wings, and put it down in the ring.',
    howTo: 'Hop as you hit the ramp; hold down to dive and come down sooner, steer to line up. Land in the ring',
  },
};

/**
 * Games played on a card, which show their rules on a card of their own
 * before they start (the Mind Fuzz Suite before each movement), so the
 * story card leaves them out. The Deadstick Landing is flown on a track,
 * and keeps its rules on the story card (and Skill Games' card before it).
 */
export const explainsItself = (kind: SkillKind): boolean => kind !== 'deadstick';

const lv = <T>(list: readonly T[], level: number): T => list[clamp(Math.round(level), 0, list.length - 1)];

/**
 * Exactly what to do to pass a game at a level, with its real numbers: for
 * the card before it.
 */
export function skillRules(kind: SkillKind, level: number): string {
  switch (kind) {
    case 'riff': {
      const r = makeRiff(1, level);
      return `Notes fall slowly down four lanes. While a note is in the gold band at the bottom, press its lane: the arrow keys or D F J K, or tap the lane. After a one-bar count-in the riff plays four times at ${r.bpm} bpm. Hit ${Math.round(r.need * 100)}% of the notes to pass; every two presses with no note there cost one.`;
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
    case 'rattlesnake': {
      const g = makeSnake(1, level);
      return `The snake never stops moving. Steer it with the arrow keys or WASD (or tap the side to turn to) across a ${g.grid} by ${g.grid} field, and eat the mice: each one makes it a cell longer and a touch quicker. Eat ${g.need} to pass; run into the wall or your own tail and it's over.`;
    }
    case 'robot': {
      const g = makeRobot(1, level);
      return `Hold Space (or hold a finger down) to creep toward the robot; let go and you stop. When its head starts to turn you have ${g.warn} seconds to be still: moving while it watches is a catch, which sends you back and freezes you until it looks away. Reach it within ${g.time} seconds${g.fakes ? ', and watch for it twitching without turning' : ''}; caught ${g.catches} times and you're out.`;
    }
    case 'fishies': {
      const g = makeFishing(1, level);
      return `${FISH_ROUNDS} fish come to the bobber. Each nibbles at it first (a little dip), then bites, pulling it right under. Press Space or Enter (or tap) within ${g.window} seconds of the bite to hook it; strike early, on a nibble, and the fish is gone. Hook ${g.need} of ${FISH_ROUNDS}.`;
    }
    case 'castle': {
      const g = makeCastle(1, level);
      return `A stone slides back and forth over the tower. Press Space or Enter (or tap) to drop it: whatever hangs over the floor below crumbles away, so the next stone is only as wide as what stayed. Drop it square and it keeps its width. Build ${g.floors} floors before the stones crumble to nothing; they slide faster as the castle rises.`;
    }
    case 'deadstick':
      return `Drive at the ramp ahead and hop (Shift or Space, or DRIFT on touch) as you hit it: it throws you high and opens the glider for a long flight. Left alone the glider floats past the ring; hold Down (on touch, drag down) to dive and come down sooner, and steer to line up. Land inside the gold ring, ${deadstickRadius(level)} m from its middle, within ${DEADSTICK_SHOTS} shots.`;
  }
}

// ---- Play the Riff ----

export const RIFF_LANES = 4;
/** Hit windows either side of a note, seconds. */
export const RIFF_GOOD = 0.13;
export const RIFF_OK = 0.25;
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

/** Exactly what to do in one movement of the suite, with its real numbers: for its card before it starts. */
export function suiteMoveRules(g: SuiteGame, move: SuiteMove): string {
  switch (move) {
    case 'mind':
      return `An arrow flashes in the eye for ${g.mind.flash} seconds, then it's gone. Press that arrow: the arrow keys or WASD, or tap its pad round the edge. Get ${g.mind.need} of ${g.mind.arrows.length} right.`;
    case 'notMind':
      return `Three of the four arrows show in the middle. Press the one that isn't there before the gold ring runs out (${g.notMind.time} seconds): the arrow keys or WASD, or tap its pad. Get ${g.notMind.need} of ${g.notMind.missing.length} right.`;
    case 'cellophane':
      return `Two see-through sheets slide back and forth. Press Space or Enter (or tap) when they lie over each other: one press a sheet. Line up ${g.cellophane.need} of ${g.cellophane.sheets.length}.`;
    case 'fuzz':
      return `Each press of Space or Enter (or tap) kicks the needle up, and it falls away between. Keep it in the gold band for ${g.fuzz.need} seconds in all, out of ${g.fuzz.time}.`;
  }
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

// ---- Rattlesnake ----

/** Cells the snake starts long. */
export const SNAKE_START = 3;
export type Cell = [number, number];
/** Right, down, left, up. */
export const SNAKE_DIRS: readonly Cell[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

export interface SnakeGame {
  /** Cells across the (square) field. */
  grid: number;
  /** Seconds a move at the start; each mouse eaten makes it SNAKE_SPEEDUP of that. */
  step: number;
  /** Mice to eat to pass. */
  need: number;
  seed: number;
}

export const SNAKE_SPEEDUP = 0.97;

export function makeSnake(seed: number, level: number): SnakeGame {
  return { grid: lv([12, 13, 14], level), step: lv([0.2, 0.17, 0.14], level), need: lv([10, 12, 14], level), seed };
}

/** The snake at the start: in the middle of the left half, heading right, head first. */
export function snakeStart(grid: number): Cell[] {
  const y = Math.floor(grid / 2);
  const x = Math.floor(grid / 3);
  return Array.from({ length: SNAKE_START }, (_, i): Cell => [x - i, y]);
}

/** Where the next mouse goes: a free cell, picked by `r` (0..1). */
export function placeMouse(body: readonly Cell[], grid: number, r: number): Cell | null {
  const taken = new Set(body.map(([x, y]) => y * grid + x));
  const free: number[] = [];
  for (let i = 0; i < grid * grid; i++) if (!taken.has(i)) free.push(i);
  if (!free.length) return null;
  const i = free[Math.min(free.length - 1, Math.floor(r * free.length))];
  return [i % grid, Math.floor(i / grid)];
}

/**
 * One move of the snake heading `dir` (an index into SNAKE_DIRS): it eats
 * the mouse and grows, or crashes into the wall or itself. The tail's
 * cell is free to move into, since the tail moves on as the head arrives.
 */
export function snakeStep(body: readonly Cell[], dir: number, mouse: Cell | null, grid: number): { body: Cell[]; ate: boolean; crash: 'wall' | 'tail' | null } {
  const [dx, dy] = SNAKE_DIRS[dir];
  const head: Cell = [body[0][0] + dx, body[0][1] + dy];
  if (head[0] < 0 || head[1] < 0 || head[0] >= grid || head[1] >= grid) return { body: [...body], ate: false, crash: 'wall' };
  const ate = mouse !== null && head[0] === mouse[0] && head[1] === mouse[1];
  const rest = ate ? body : body.slice(0, -1);
  if (rest.some(([x, y]) => x === head[0] && y === head[1])) return { body: [...body], ate: false, crash: 'tail' };
  return { body: [head, ...rest], ate, crash: null };
}

/** Whether `dir` turns straight back on `from`. */
export const snakeReverse = (from: number, dir: number): boolean => (from + 2) % 4 === dir;

// ---- Robot Stop ----

/** The robot's moods: its back turned, turning (time to stop), watching, or a twitch that turns back. */
export type RobotMood = 'away' | 'turning' | 'watching' | 'twitch';

export interface RobotGame {
  /** What the robot does, in turn, from the start. */
  moods: { mood: RobotMood; dur: number }[];
  /** Seconds it takes to turn: the time to stop. */
  warn: number;
  /** Seconds to reach it. */
  time: number;
  /** Catches that end it. */
  catches: number;
  fakes: boolean;
}

/** Share of the way the player creeps a second at full pace, and how quickly they get going and stop (a second). */
export const ROBOT_SPEED = 0.15;
export const ROBOT_ACCEL = 1.2;
export const ROBOT_BRAKE = 2;
/** Moving slower than this counts as stock still. */
export const ROBOT_STILL = 0.01;
/** How far a catch sends you back. */
export const ROBOT_PUSH = 0.2;

export function makeRobot(seed: number, level: number): RobotGame {
  const rand = seededRandom(seed);
  const warn = lv([0.7, 0.55, 0.45], level);
  const fake = lv([0, 0.25, 0.35], level);
  const moods: { mood: RobotMood; dur: number }[] = [];
  let t = 0;
  while (t < 90) {
    const away = 1 + rand() * lv([2, 1.6, 1.3], level);
    moods.push({ mood: 'away', dur: away });
    t += away;
    if (rand() < fake) {
      moods.push({ mood: 'twitch', dur: warn }, { mood: 'away', dur: 0.6 + rand() * 0.8 });
      t += warn + 1;
    }
    const watch = 0.8 + rand() * 1.2;
    moods.push({ mood: 'turning', dur: warn }, { mood: 'watching', dur: watch });
    t += warn + watch;
  }
  return { moods, warn, time: lv([32, 30, 28], level), catches: lv([3, 2, 2], level), fakes: fake > 0 };
}

/** What the robot's doing `t` seconds in, and how far into it (seconds). */
export function robotMood(g: RobotGame, t: number): { mood: RobotMood; into: number; index: number } {
  let at = 0;
  for (let i = 0; i < g.moods.length; i++) {
    const m = g.moods[i];
    if (t < at + m.dur) return { mood: m.mood, into: t - at, index: i };
    at += m.dur;
  }
  return { mood: 'away', into: t - at, index: g.moods.length };
}

/** One step of the player's creep: speeding up while held, braking when not. */
export function robotStep(pos: number, v: number, holding: boolean, dt: number): { pos: number; v: number } {
  const nv = holding ? Math.min(ROBOT_SPEED, v + ROBOT_ACCEL * dt) : Math.max(0, v - ROBOT_BRAKE * dt);
  return { pos: Math.min(1, pos + nv * dt), v: nv };
}

// ---- Fishing for Fishies ----

export const FISH_ROUNDS = 5;

export interface FishRound {
  /** When the fish nibbles, seconds into the round. */
  nibbles: number[];
  /** When it bites. */
  bite: number;
}

export interface FishingGame {
  rounds: FishRound[];
  /** Seconds after the bite to strike in. */
  window: number;
  need: number;
  /** How far down a nibble pulls the bobber (1 is right under, as a bite). */
  nibbleDepth: number;
}

export function makeFishing(seed: number, level: number): FishingGame {
  const rand = seededRandom(seed);
  const [lo, hi] = lv<[number, number]>([[1, 2], [2, 3], [2, 4]], level);
  const rounds = Array.from({ length: FISH_ROUNDS }, () => {
    const n = lo + Math.floor(rand() * (hi - lo + 1));
    const nibbles: number[] = [];
    let t = 1 + rand() * 1.5;
    for (let i = 0; i < n; i++) {
      nibbles.push(t);
      t += 0.6 + rand() * 1;
    }
    return { nibbles, bite: t + 0.3 + rand() * 1.4 };
  });
  return { rounds, window: lv([0.7, 0.55, 0.45], level), need: lv([3, 3, 4], level), nibbleDepth: lv([0.3, 0.4, 0.5], level) };
}

/** How a strike at `press` seconds into a round goes (null: no strike yet), or null while it's still to play for. */
export function fishJudge(r: FishRound, window: number, press: number | null, now: number): 'hooked' | 'spooked' | 'away' | null {
  if (press !== null) return press < r.bite ? 'spooked' : press <= r.bite + window ? 'hooked' : 'away';
  return now > r.bite + window ? 'away' : null;
}

// ---- Crumbling Castle ----

/** A drop this close to square snaps square, keeping its width. */
export const CASTLE_SNAP = 0.015;

export interface CastleGame {
  /** The first stone's width, a share of the stage. */
  width: number;
  floors: number;
  /** The first stone's speed, stage widths a second; each floor's is CASTLE_SPEEDUP faster. */
  speed: number;
  /** Where each floor's stone starts on its slide (0..1 round the back and forth). */
  phases: number[];
}

export const CASTLE_SPEEDUP = 1.05;

export function makeCastle(seed: number, level: number): CastleGame {
  const rand = seededRandom(seed);
  const floors = lv([8, 10, 12], level);
  return { width: lv([0.42, 0.38, 0.34], level), floors, speed: lv([0.45, 0.55, 0.65], level), phases: Array.from({ length: floors }, () => rand()) };
}

/** A sliding stone's left edge (0..1 - w) at `t` seconds: back and forth across the stage. */
export function castleSlide(t: number, speed: number, w: number, phase: number): number {
  const span = 1 - w;
  if (span <= 0) return 0;
  const u = (((phase + (t * speed) / (2 * span)) % 1) + 1) % 1;
  return span * (u < 0.5 ? u * 2 : 2 - u * 2);
}

/** A stone dropped at `x` (width `below.w`) onto `below`: what stays on the tower. */
export function castleDrop(below: { x: number; w: number }, x: number): { x: number; w: number; square: boolean } {
  if (Math.abs(x - below.x) <= CASTLE_SNAP) return { x: below.x, w: below.w, square: true };
  const left = Math.max(below.x, x);
  const right = Math.min(below.x + below.w, x + below.w);
  return { x: left, w: Math.max(0, right - left), square: false };
}

// ---- Deadstick Landing ----

export const DEADSTICK_SHOTS = 3;
/** Metres of run-up to the launcher. */
export const DEADSTICK_RUNUP = 70;
/** Seconds a shot has to get off the ramp and down. */
export const DEADSTICK_SHOT_TIME = 12;
/**
 * The Deadstick Landing's ramp throws harder than a race's: this much more
 * lift and speed off it, for a long flight (about 120 m diving all the way,
 * 160 m floating) before the ground comes up.
 */
export const DEADSTICK_LAUNCH = { lift: 1.4, speed: 1.15 };
/** How far straight on from the ramp the ring sits, metres: between a full dive and a float. */
export const DEADSTICK_RING: [number, number] = [128, 152];

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
  // Straight on from the ramp, the way the flight goes, not round the road's bends.
  const from = pointAt(track.spline, launchS);
  const ground = track.locate(from.x, from.z, 100).height;
  for (let i = 0; i < 40; i++) {
    const along = DEADSTICK_RING[0] + rand() * (DEADSTICK_RING[1] - DEADSTICK_RING[0]);
    const lateral = (rand() * 2 - 1) * 4;
    const x = from.x + from.tx * along - from.tz * lateral;
    const z = from.z + from.tz * along + from.tx * lateral;
    const loc = track.locate(x, z, 100);
    // Solid ground to land on, road or not: not the ramp, nor down a pit.
    if (loc.surface === 'launch' || !Number.isFinite(loc.height) || loc.height < ground - 20) continue;
    return { launchS, target: { x, y: loc.height, z }, radius: deadstickRadius(level) };
  }
  return null;
}
