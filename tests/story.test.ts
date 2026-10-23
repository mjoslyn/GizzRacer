import { describe, expect, it } from 'vitest';
import { ACTS, BOON_CHOICES, CLEAR_PLACE, SKILL_STAGE, STAGES_PER_ACT, START_LIVES, StoryRun } from '../src/core/story';
import { kartParams, RACERS } from '../src/physics/racers';
import { TRACK_LIST } from '../src/tracks/index';
import { generateTrack } from '../src/tracks/generator';

/** Clears every stage, taking the first boon offered. */
function clearAll(run: StoryRun, each: (run: StoryRun) => void = () => {}): string {
  let out = '';
  while (!run.finished) {
    each(run);
    out = run.record(true);
    if (run.offer.length) run.take(run.offer[0]);
  }
  return out;
}

describe('story run', () => {
  it('runs every chapter: two races, the skill game, then the boss', () => {
    const run = new StoryRun(7);
    const seen: string[] = [];
    clearAll(run, (r) => seen.push(`${r.race.act}:${r.race.kind}`));
    expect(seen).toHaveLength(ACTS.length * STAGES_PER_ACT);
    for (let a = 0; a < ACTS.length; a++) expect(seen.slice(a * STAGES_PER_ACT, (a + 1) * STAGES_PER_ACT)).toEqual([`${a}:race`, `${a}:race`, `${a}:skill`, `${a}:boss`]);
    expect(SKILL_STAGE).toBe(2);
  });

  it('wins after the last boss', () => {
    expect(clearAll(new StoryRun(1))).toBe('won');
  });

  it('plays a different skill game in each chapter', () => {
    for (let seed = 1; seed < 40; seed++) {
      const run = new StoryRun(seed);
      expect(new Set(run.skills).size).toBe(ACTS.length);
    }
  });

  it('every boss and launch track is a real track', () => {
    for (const a of ACTS) {
      expect(TRACK_LIST.some((t) => t.id === a.boss.trackId)).toBe(true);
      for (const id of a.launchTracks) expect(TRACK_LIST.some((t) => t.id === id)).toBe(true);
    }
  });

  it('clears a race in the top places, and a boss duel only ahead of the boss', () => {
    const run = new StoryRun(3);
    expect(run.passes(CLEAR_PLACE, null)).toBe(true);
    expect(run.passes(CLEAR_PLACE + 1, null)).toBe(false);
    expect(run.passes(2, 1)).toBe(false);
    expect(run.passes(1, 2)).toBe(true);
  });

  it('starts with one life: a miss ends the run', () => {
    const run = new StoryRun(5);
    expect(START_LIVES).toBe(1);
    expect(run.record(false)).toBe('over');
    expect(run.finished).toBe(true);
  });

  it('a spare life from Planet B restarts the same stage, the same track and game', () => {
    const run = new StoryRun(8);
    run.record(true);
    run.offer = ['planetB'];
    run.take('planetB');
    expect(run.lives).toBe(START_LIVES + 1);
    expect(run.boons).toEqual([]);
    const before = run.race;
    expect(run.record(false)).toBe('failed');
    expect(run.lives).toBe(START_LIVES);
    expect(run.race).toEqual(before);
    expect(run.record(false)).toBe('over');
  });

  it('a restarted chapter opener skips its card', () => {
    const run = new StoryRun(6);
    run.lives = 2;
    expect(run.actStart).toBe(true);
    run.record(false);
    expect(run.actStart).toBe(false);
  });

  it('offers three different boons after a clear, and takes only one of them', () => {
    const run = new StoryRun(11);
    expect(run.record(true)).toBe('cleared');
    expect(run.offer).toHaveLength(BOON_CHOICES);
    expect(new Set(run.offer).size).toBe(BOON_CHOICES);
    const pick = run.offer.find((b) => b !== 'planetB')!;
    run.take(pick);
    expect(run.boons).toEqual([pick]);
    expect(run.offer).toEqual([]);
    run.take(pick);
    expect(run.boons).toEqual([pick]);
  });

  it('stacks stat boons on the kart', () => {
    const run = new StoryRun(2);
    const base = kartParams(RACERS[0].stats, '150cc');
    run.boons.push('mindFuzz', 'mindFuzz', 'rattlesnake');
    const p = { ...base };
    run.applyBoons(p);
    expect(p.topSpeed).toBeCloseTo(base.topSpeed * 1.03 ** 2);
    expect(p.accel).toBeCloseTo(base.accel * 1.15);
    expect(p.mass).toBe(base.mass);
  });

  it('the latest item boon wins', () => {
    const run = new StoryRun(2);
    run.boons.push('figWasps', 'gammaKnife');
    expect(run.favour).toBe('keytarLaser');
  });

  it('never races the player against their own racer as the boss', () => {
    const run = new StoryRun(4);
    for (let act = 0; act < ACTS.length; act++) {
      run.cleared = act * STAGES_PER_ACT + STAGES_PER_ACT - 1;
      const own = RACERS.find((r) => r.id === ACTS[act].boss.racerId)!;
      expect(run.bossRacer(own).id).not.toBe(own.id);
      expect(run.bossRacer(own).name).toBe(ACTS[act].boss.name);
    }
  });

  it('builds every generated story track', () => {
    clearAll(new StoryRun(9), (r) => {
      const g = r.race.gen;
      if (g) expect(generateTrack(g).name).toBeTruthy();
    });
  });
});
