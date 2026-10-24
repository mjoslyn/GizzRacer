import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/inputFrame';
import { Race } from '../src/core/race';
import {
  BANANA_ROUNDS,
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
} from '../src/core/skills';
import { ACTS } from '../src/core/story';
import { respawnKart } from '../src/physics/kart';
import { RACERS } from '../src/physics/racers';
import { TRACK_LIST } from '../src/tracks/index';
import { Track } from '../src/tracks/track';

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
      }
      if (flying && k.state.grounded) return { x: k.state.x, z: k.state.z };
    }
    return null;
  }

  for (const id of new Set(ACTS.flatMap((a) => a.launchTracks))) {
    it(`${id}: the ring is on the road, and a glide can reach it`, () => {
      const track = new Track(TRACK_LIST.find((t) => t.id === id)!.build());
      for (let seed = 1; seed <= 6; seed++) {
        const plan = planDeadstick(track, seed, 0)!;
        expect(plan).not.toBeNull();
        expect(track.locate(plan.target.x, plan.target.z, 100).onRoad).toBe(true);
      }
      const plan = planDeadstick(track, 1, 0)!;
      // Diving comes down short of the ring and climbing past it, so it can be hit.
      const short = fly(track, plan.launchS, -1)!;
      const long = fly(track, plan.launchS, 1)!;
      const from = track.respawnPose(plan.launchS);
      const dist = (p: { x: number; z: number }) => Math.hypot(p.x - from.x, p.z - from.z);
      const ring = dist(plan.target);
      expect(dist(short)).toBeLessThan(ring);
      expect(dist(long)).toBeGreaterThan(ring);
    });
  }
});
