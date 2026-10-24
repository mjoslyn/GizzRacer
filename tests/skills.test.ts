import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/inputFrame';
import { Race } from '../src/core/race';
import {
  BANANA_ROUNDS,
  DEADSTICK_LAUNCH,
  DEADSTICK_RUNUP,
  HOROLOGY_ROUNDS,
  NONAGON_FIRST,
  NONAGON_SIDES,
  RIFF_GOOD,
  RIFF_LANES,
  RIFF_OK,
  horologyHit,
  makeBanana,
  makeHorology,
  makeNonagon,
  makeRiff,
  planDeadstick,
  riffJudge,
  riffPasses,
  SKILL_KINDS,
  skillRules,
  deadstickRadius,
  SUITE_ARROWS,
  SUITE_MOVES,
  SUITE_NEED,
  fuzzStep,
  makeSuite,
  sheetAt,
  sheetOverlap,
  CASTLE_SPEEDUP,
  FISH_ROUNDS,
  ROBOT_PUSH,
  ROBOT_STILL,
  SNAKE_START,
  castleDrop,
  castleSlide,
  fishJudge,
  makeCastle,
  makeFishing,
  makeRobot,
  makeSnake,
  placeMouse,
  robotMood,
  robotStep,
  snakeReverse,
  snakeStart,
  snakeStep,
  type Cell,
} from '../src/core/skills';
import { ACTS } from '../src/core/story';
import { respawnKart } from '../src/physics/kart';
import { RACERS } from '../src/physics/racers';
import { TRACK_LIST } from '../src/tracks/index';
import { Track } from '../src/tracks/track';

describe('skill rules', () => {
  it('every game says exactly what to do at every level, with its real targets', () => {
    for (const kind of SKILL_KINDS) for (let level = 0; level < 3; level++) expect(skillRules(kind, level).length, kind).toBeGreaterThan(80);
    expect(skillRules('riff', 0)).toContain(`${Math.round(makeRiff(1, 0).need * 100)}%`);
    expect(skillRules('nonagon', 2)).toContain(`all ${makeNonagon(1, 2).seq.length}`);
    expect(skillRules('banana', 1)).toContain(`${makeBanana(1, 1).tolerance} cents`);
    expect(skillRules('horology', 2)).toContain(`land ${makeHorology(1, 2).need}`);
    expect(skillRules('mindfuzz', 0)).toContain(`${makeSuite(1, 0).fuzz.need} seconds`);
    expect(skillRules('deadstick', 2)).toContain(`${deadstickRadius(2)} m`);
  });
});

describe('play the riff', () => {
  it('plays the bar four times, in time, in the lanes, faster by chapter', () => {
    const easy = makeRiff(5, 0);
    const hard = makeRiff(5, 2);
    expect(hard.bpm).toBeGreaterThan(easy.bpm);
    for (const r of [easy, hard]) {
      expect(r.notes.length % 4).toBe(0);
      for (const n of r.notes) {
        expect(n.lane).toBeGreaterThanOrEqual(0);
        expect(n.lane).toBeLessThan(RIFF_LANES);
        expect(n.t).toBeLessThan(r.length);
      }
      for (let i = 1; i < r.notes.length; i++) expect(r.notes[i].t).toBeGreaterThan(r.notes[i - 1].t);
    }
  });

  it('judges presses by how close they land', () => {
    expect(riffJudge(1, 1 + RIFF_GOOD / 2)).toBe('good');
    expect(riffJudge(1, 1 - (RIFF_GOOD + RIFF_OK) / 2)).toBe('ok');
    expect(riffJudge(1, 1 + RIFF_OK * 1.5)).toBe(null);
  });

  it('passes on enough notes, and mashing does not pay', () => {
    const r = makeRiff(9, 1);
    const n = r.notes.length;
    expect(riffPasses(r, n, 0)).toBe(true);
    expect(riffPasses(r, Math.ceil(n * r.need), 0)).toBe(true);
    expect(riffPasses(r, n, n)).toBe(false);
  });
});

describe('nonagon infinity', () => {
  it('a loop longer than the first round, on the nine sides, never the same side twice running', () => {
    for (let level = 0; level < 3; level++) {
      const g = makeNonagon(level + 3, level);
      expect(g.seq.length).toBeGreaterThan(NONAGON_FIRST);
      g.seq.forEach((s, i) => {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(NONAGON_SIDES);
        if (i) expect(s).not.toBe(g.seq[i - 1]);
      });
    }
  });
});

describe('the flying microtonal banana', () => {
  it('every string starts well out of tune, and the tolerance tightens by chapter', () => {
    const g = makeBanana(4, 0);
    expect(g.starts).toHaveLength(BANANA_ROUNDS);
    for (const c of g.starts) expect(Math.abs(c)).toBeGreaterThan(g.tolerance * 3);
    expect(makeBanana(4, 2).tolerance).toBeLessThan(g.tolerance);
  });
});

describe('horology', () => {
  it('a mark is hit inside it and missed outside, across twelve too', () => {
    const r = { at: 0.98, width: 0.1, speed: 1 };
    expect(horologyHit(r, 0.98)).toBe(true);
    expect(horologyHit(r, 0.02)).toBe(true);
    expect(horologyHit(r, 0.1)).toBe(false);
    const g = makeHorology(2, 1);
    expect(g.rounds).toHaveLength(HOROLOGY_ROUNDS);
    expect(g.need).toBeLessThanOrEqual(HOROLOGY_ROUNDS);
  });
});

describe('the mind fuzz suite', () => {
  it('four movements in album order, pass three', () => {
    expect(SUITE_MOVES).toEqual(['mind', 'notMind', 'cellophane', 'fuzz']);
    expect(SUITE_NEED).toBe(3);
  });

  it('arrows on the four arrows, enough rounds to pass, and harder by chapter', () => {
    const easy = makeSuite(3, 0);
    const hard = makeSuite(3, 2);
    for (const g of [easy, hard]) {
      for (const a of [...g.mind.arrows, ...g.notMind.missing]) expect(a >= 0 && a < SUITE_ARROWS).toBe(true);
      expect(g.mind.need).toBeLessThanOrEqual(g.mind.arrows.length);
      expect(g.notMind.need).toBeLessThanOrEqual(g.notMind.missing.length);
      expect(g.cellophane.need).toBeLessThanOrEqual(g.cellophane.sheets.length);
      expect(g.fuzz.band[0]).toBeGreaterThan(0);
      expect(g.fuzz.band[1]).toBeLessThan(1);
    }
    expect(hard.mind.flash).toBeLessThan(easy.mind.flash);
    expect(hard.fuzz.band[1] - hard.fuzz.band[0]).toBeLessThan(easy.fuzz.band[1] - easy.fuzz.band[0]);
  });

  it('cellophane: sheets slide in view, and line up now and then', () => {
    const g = makeSuite(8, 1);
    expect(sheetOverlap(0.5, 0.5, 0.36)).toBe(1);
    expect(sheetOverlap(0.1, 0.9, 0.36)).toBe(0);
    for (const [a, b] of g.cellophane.sheets) {
      let best = 0;
      for (let t = 0; t < 8; t += 1 / 60) {
        const x = sheetAt(a, t);
        expect(x).toBeGreaterThanOrEqual(0.2 - 1e-9);
        expect(x).toBeLessThanOrEqual(0.8 + 1e-9);
        best = Math.max(best, sheetOverlap(x, sheetAt(b, t), 0.36));
      }
      expect(best).toBeGreaterThanOrEqual(g.cellophane.overlap);
    }
  });

  it('the fuzz can be held in the band by tapping when it falls low, and not without tapping', () => {
    for (let level = 0; level < 3; level++) {
      const g = makeSuite(level + 11, level);
      const [lo, hi] = g.fuzz.band;
      const play = (tapping: boolean) => {
        let st = { level: 0.2, v: 0 };
        let held = 0;
        let since = 1;
        for (let t = 0; t < g.fuzz.time; t += 1 / 60) {
          since += 1 / 60;
          // A player's rhythm: a tap when the needle drops under the middle of the band, no faster than five a second.
          const tap = tapping && st.level < (lo + hi) / 2 && st.v <= 0 && since > 0.2;
          if (tap) since = 0;
          st = fuzzStep(st.level, st.v, 1 / 60, tap);
          if (st.level >= lo && st.level <= hi) held += 1 / 60;
        }
        return held;
      };
      expect(play(true)).toBeGreaterThanOrEqual(g.fuzz.need);
      expect(play(false)).toBeLessThan(g.fuzz.need);
    }
  });
});

describe('rattlesnake', () => {
  it('moves, eats and grows, and crashes into the wall or its own tail', () => {
    const body = snakeStart(12);
    expect(body).toHaveLength(SNAKE_START);
    const head = body[0];
    const ahead: Cell = [head[0] + 1, head[1]];
    const ate = snakeStep(body, 0, ahead, 12);
    expect(ate.ate).toBe(true);
    expect(ate.body).toHaveLength(SNAKE_START + 1);
    expect(ate.body[0]).toEqual(ahead);
    const moved = snakeStep(body, 0, null, 12);
    expect(moved.body).toHaveLength(SNAKE_START);
    expect(snakeStep([[11, 5]], 0, null, 12).crash).toBe('wall');
    expect(snakeStep([[0, 0]], 3, null, 12).crash).toBe('wall');
    // A loop of five turning into its own middle bites; into the tail's cell, which moves on, it doesn't.
    const loop: Cell[] = [[2, 2], [2, 3], [3, 3], [3, 2], [3, 1], [2, 1]];
    expect(snakeStep(loop, 0, null, 12).crash).toBe('tail');
    expect(snakeStep(loop.slice(0, 5).concat([[2, 1]]), 3, null, 12).crash).toBe(null);
    expect(snakeReverse(0, 2)).toBe(true);
    expect(snakeReverse(1, 0)).toBe(false);
  });

  it('a mouse always goes on a free cell, and enough room to eat them all', () => {
    const body = snakeStart(12);
    for (let r = 0; r < 1; r += 0.01) {
      const m = placeMouse(body, 12, r)!;
      expect(body.some(([x, y]) => x === m[0] && y === m[1])).toBe(false);
    }
    expect(placeMouse([[0, 0]], 1, 0.5)).toBeNull();
    for (let level = 0; level < 3; level++) {
      const g = makeSnake(1, level);
      expect(SNAKE_START + g.need).toBeLessThan(g.grid * g.grid / 3);
    }
    expect(makeSnake(1, 2).step).toBeLessThan(makeSnake(1, 0).step);
  });
});

describe('robot stop', () => {
  /** Plays a run: holding on `hold(mood, into)`. Returns whether the robot was reached, and the catches. */
  function play(seed: number, level: number, hold: (mood: string, into: number) => boolean) {
    const g = makeRobot(seed, level);
    let pos = 0;
    let v = 0;
    let caught = 0;
    let caughtIn = -1;
    for (let t = 0; t < g.time; t += 1 / 60) {
      const m = robotMood(g, t);
      const frozen = m.mood === 'watching' && caughtIn === m.index;
      ({ pos, v } = robotStep(pos, v, hold(m.mood, m.into) && !frozen, 1 / 60));
      if (frozen) v = 0;
      if (m.mood === 'watching' && v > ROBOT_STILL && caughtIn !== m.index) {
        caughtIn = m.index;
        caught++;
        pos = Math.max(0, pos - ROBOT_PUSH);
        v = 0;
        if (caught >= g.catches) return { reached: false, caught };
      }
      if (pos >= 1) return { reached: true, caught };
    }
    return { reached: false, caught };
  }
  const REACT = 0.25;

  it('a player who lets go a reaction after it starts to turn gets there in time, never caught', () => {
    for (let level = 0; level < 3; level++)
      for (let seed = 1; seed <= 40; seed++) {
        const run = play(seed, level, (mood, into) => mood === 'away' || ((mood === 'turning' || mood === 'twitch') && into < REACT));
        expect(run, `seed ${seed} level ${level}`).toEqual({ reached: true, caught: 0 });
      }
  });

  it('holding on regardless is caught', () => {
    for (let level = 0; level < 3; level++) expect(play(3, level, () => true).reached).toBe(false);
  });

  it('only the harder chapters fake a turn', () => {
    expect(makeRobot(2, 0).moods.some((m) => m.mood === 'twitch')).toBe(false);
    expect(makeRobot(2, 2).moods.some((m) => m.mood === 'twitch')).toBe(true);
  });
});

describe('fishing for fishies', () => {
  it('nibbles come before the bite, and a strike counts only after it', () => {
    for (let level = 0; level < 3; level++) {
      const g = makeFishing(level + 4, level);
      expect(g.rounds).toHaveLength(FISH_ROUNDS);
      expect(g.need).toBeLessThanOrEqual(FISH_ROUNDS);
      expect(g.nibbleDepth).toBeLessThan(1);
      for (const r of g.rounds) {
        expect(r.nibbles.length).toBeGreaterThan(0);
        for (const n of r.nibbles) expect(n).toBeLessThan(r.bite);
        expect(fishJudge(r, g.window, r.nibbles[0], r.nibbles[0])).toBe('spooked');
        expect(fishJudge(r, g.window, r.bite + g.window / 2, r.bite + g.window / 2)).toBe('hooked');
        expect(fishJudge(r, g.window, null, r.bite)).toBe(null);
        expect(fishJudge(r, g.window, null, r.bite + g.window + 0.01)).toBe('away');
      }
    }
    expect(makeFishing(1, 2).window).toBeLessThan(makeFishing(1, 0).window);
  });
});

describe('crumbling castle', () => {
  it('a stone slides across the stage and back', () => {
    const g = makeCastle(3, 1);
    let lo = 1;
    let hi = 0;
    for (let t = 0; t < 10; t += 1 / 60) {
      const x = castleSlide(t, g.speed, g.width, g.phases[0]);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1 - g.width + 1e-9);
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    expect(lo).toBeLessThan(0.02);
    expect(hi).toBeGreaterThan(1 - g.width - 0.02);
  });

  it('what hangs over crumbles; a square drop keeps its width', () => {
    expect(castleDrop({ x: 0.3, w: 0.4 }, 0.31)).toEqual({ x: 0.3, w: 0.4, square: true });
    const right = castleDrop({ x: 0.3, w: 0.4 }, 0.4);
    expect(right.x).toBeCloseTo(0.4);
    expect(right.w).toBeCloseTo(0.3);
    const left = castleDrop({ x: 0.3, w: 0.4 }, 0.2);
    expect(left.x).toBeCloseTo(0.3);
    expect(left.w).toBeCloseTo(0.3);
    expect(castleDrop({ x: 0.3, w: 0.4 }, 0.75).w).toBe(0);
  });

  it('square drops build it all, and dropping off by a little every time does not', () => {
    for (let level = 0; level < 3; level++) {
      const g = makeCastle(5, level);
      let top = { x: (1 - g.width) / 2, w: g.width };
      for (let f = 0; f < g.floors; f++) top = castleDrop(top, top.x);
      expect(top.w).toBe(g.width);
      top = { x: (1 - g.width) / 2, w: g.width };
      for (let f = 0; f < g.floors; f++) top = castleDrop(top, top.x + 0.06);
      expect(top.w).toBeLessThan(0.005);
    }
    expect(CASTLE_SPEEDUP).toBeGreaterThan(1);
  });
});

describe('deadstick landing', () => {
  /** Flies one shot off the run-up: a trick at the lip, then `pitch` held. Returns where it came down. */
  function fly(track: Track, launchS: number, pitch: number) {
    const race = new Race(track, 1, false, 3);
    const k = race.addKart(RACERS[0], '150cc', null);
    k.assist = true;
    race.time = 0.01;
    const pose = track.respawnPose(launchS - DEADSTICK_RUNUP);
    respawnKart(k.state, pose.x, pose.y, pose.z, pose.heading);
    k.state.speed = k.params.topSpeed;
    let flying = false;
    let press = false;
    for (let i = 0; i < 60 * 12; i++) {
      const [ev] = race.step(1 / 60, [{ ...NEUTRAL_INPUT, throttle: 1, pitch: flying ? pitch : 0, drift: press, driftPressed: press }]);
      press = false;
      if (ev.launched) {
        flying = true;
        press = true;
        // The Deadstick Landing's harder throw (game.ts).
        k.state.vy *= DEADSTICK_LAUNCH.lift;
        k.state.speed *= DEADSTICK_LAUNCH.speed;
      }
      if (flying && k.state.grounded) return { x: k.state.x, z: k.state.z };
    }
    return null;
  }

  for (const id of new Set(ACTS.flatMap((a) => a.launchTracks))) {
    it(`${id}: the ring is a long flight out on solid ground, and a glide can reach it`, () => {
      const track = new Track(TRACK_LIST.find((t) => t.id === id)!.build());
      const from = track.respawnPose(planDeadstick(track, 1, 0)!.launchS);
      for (let seed = 1; seed <= 6; seed++) {
        const plan = planDeadstick(track, seed, 0)!;
        expect(plan).not.toBeNull();
        expect(Math.hypot(plan.target.x - from.x, plan.target.z - from.z)).toBeGreaterThan(120);
        expect(plan.target.y).toBeGreaterThan(from.y - 20);
      }
      const plan = planDeadstick(track, 1, 0)!;
      // Diving all the way comes down short of the ring and floating past it, so it can be hit.
      const short = fly(track, plan.launchS, -1)!;
      const long = fly(track, plan.launchS, 0)!;
      const dist = (p: { x: number; z: number }) => Math.hypot(p.x - from.x, p.z - from.z);
      const ring = dist(plan.target);
      expect(dist(short)).toBeLessThan(ring);
      expect(dist(long)).toBeGreaterThan(ring);
    });
  }
});
