import { describe, expect, it } from 'vitest';
import { ACTS, BOON_CHOICES, CLEAR_PLACE, RACES_PER_ACT, StoryRun } from '../src/core/story';
import { kartParams, RACERS } from '../src/physics/racers';
import { TRACK_LIST } from '../src/tracks/index';
import { generateTrack } from '../src/tracks/generator';

describe('story run', () => {
  it('runs every chapter: two generated races, then the boss on its own track', () => {
    const run = new StoryRun(7);
    const seen: { act: number; boss: boolean; gen: boolean }[] = [];
    while (!run.finished) {
      const r = run.race;
      seen.push({ act: r.act, boss: r.boss, gen: r.gen !== null });
      run.record(1, r.boss ? 2 : null);
      if (run.offer.length) run.take(run.offer[0]);
    }
    expect(seen).toHaveLength(ACTS.length * RACES_PER_ACT);
    for (const [i, s] of seen.entries()) {
      expect(s.act).toBe(Math.floor(i / RACES_PER_ACT));
      expect(s.boss).toBe(i % RACES_PER_ACT === RACES_PER_ACT - 1);
      expect(s.gen).toBe(!s.boss);
    }
  });

  it('wins after the last boss', () => {
    const run = new StoryRun(1);
    let out = '';
    while (!run.finished) {
      out = run.record(1, run.race.boss ? 3 : null);
      if (run.offer.length) run.take(run.offer[0]);
    }
    expect(out).toBe('won');
  });

  it('every boss track is a real track', () => {
    for (const a of ACTS) expect(TRACK_LIST.some((t) => t.id === a.boss.trackId)).toBe(true);
  });

  it('clears a race in the top places, and a boss race only ahead of the boss', () => {
    const run = new StoryRun(3);
    expect(run.passes(CLEAR_PLACE, null)).toBe(true);
    expect(run.passes(CLEAR_PLACE + 1, null)).toBe(false);
    expect(run.passes(2, 1)).toBe(false);
    expect(run.passes(1, 2)).toBe(true);
  });

  it('one miss ends the run', () => {
    const run = new StoryRun(5);
    expect(run.record(1, null)).toBe('cleared');
    run.take(run.offer[0]);
    expect(run.record(CLEAR_PLACE + 1, null)).toBe('over');
    expect(run.finished).toBe(true);
    expect(run.cleared).toBe(1);
  });

  it('offers three different boons after a clear, and takes only one of them', () => {
    const run = new StoryRun(11);
    expect(run.record(1, null)).toBe('cleared');
    expect(run.offer).toHaveLength(BOON_CHOICES);
    expect(new Set(run.offer).size).toBe(BOON_CHOICES);
    const pick = run.offer[1];
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
      run.cleared = act * RACES_PER_ACT + RACES_PER_ACT - 1;
      const own = RACERS.find((r) => r.id === ACTS[act].boss.racerId)!;
      expect(run.bossRacer(own).id).not.toBe(own.id);
      expect(run.bossRacer(own).name).toBe(ACTS[act].boss.name);
    }
  });

  it('builds every generated story track', () => {
    const run = new StoryRun(9);
    while (!run.finished) {
      const g = run.race.gen;
      if (g) expect(generateTrack(g).name).toBeTruthy();
      run.record(1, run.race.boss ? 2 : null);
      if (run.offer.length) run.take(run.offer[0]);
    }
  });
});
