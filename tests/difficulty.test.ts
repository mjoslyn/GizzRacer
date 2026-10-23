import { describe, expect, it } from 'vitest';
import { CPU_DIFFICULTIES, CPU_SKILL, DIFFICULTY_PACE, withDifficulty, type CpuDifficulty } from '../src/ai/cpuDriver';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { Race, TOUCH_CPU_PACE } from '../src/core/race';
import { ASSIST_NORMAL, ASSIST_TOUCH } from '../src/physics/steerAssist';
import { RACERS } from '../src/physics/racers';
import { TRACK_LIST } from '../src/tracks/index';
import { Track } from '../src/tracks/track';

const tracks = [0, 4, 9, 13].map((i) => new Track(TRACK_LIST[i].build()));
const track = tracks[0];

/**
 * A CPU's average lap at a difficulty: one-lap races, a parked player (the
 * focus the CPUs race against) and one CPU, over a few tracks and racers,
 * since one lap alone is as much luck as pace.
 */
function lap(d: CpuDifficulty, pace = DIFFICULTY_PACE[d]): number {
  let sum = 0;
  let n = 0;
  for (const t of tracks) {
    for (const ri of [1, 9]) {
      const race = new Race(t, 7, false, 1);
      const player = race.addKart(RACERS[0], '150cc', null);
      const cpu = race.addKart(RACERS[ri], '150cc', withDifficulty(CPU_SKILL['150cc'], d));
      race.focus = player;
      race.cpuPace = pace;
      race.time = 0;
      for (let time = 0; time < 200 && cpu.finishTime === null; time += PHYSICS_DT) race.step(PHYSICS_DT, [NEUTRAL_INPUT]);
      expect(cpu.finishTime, `${d} ${t.def.id}`).not.toBe(null);
      sum += cpu.finishTime!;
      n++;
    }
  }
  return sum / n;
}

describe('CPU difficulty', () => {
  it('Normal is the class as it was; Easy is softer and Hard sharper on every count', () => {
    for (const engine of ['50cc', '100cc', '150cc', '200cc'] as const) {
      const base = CPU_SKILL[engine];
      expect(withDifficulty(base, 'normal')).toBe(base);
      const easy = withDifficulty(base, 'easy');
      const hard = withDifficulty(base, 'hard');
      expect(easy.speedCap).toBeLessThan(base.speedCap);
      expect(easy.driftChance).toBeLessThan(base.driftChance);
      expect(easy.maxTier).toBeLessThanOrEqual(base.maxTier);
      expect(easy.maxTier).toBeGreaterThanOrEqual(1);
      expect(easy.itemIq).toBeLessThan(base.itemIq);
      expect(hard.speedCap).toBeGreaterThanOrEqual(base.speedCap);
      expect(hard.driftChance).toBeGreaterThanOrEqual(base.driftChance);
      expect(hard.maxTier).toBeLessThanOrEqual(4);
      expect(hard.wander).toBeLessThan(base.wander);
      expect(hard.itemIq).toBeLessThanOrEqual(1);
    }
    expect(CPU_DIFFICULTIES.map((d) => DIFFICULTY_PACE[d])).toEqual([...CPU_DIFFICULTIES.map((d) => DIFFICULTY_PACE[d])].sort());
  });

  it('a CPU laps slowest on Easy and fastest on Hard', () => {
    const easy = lap('easy');
    const normal = lap('normal');
    const hard = lap('hard');
    expect(easy).toBeGreaterThan(normal);
    expect(hard).toBeLessThan(normal);
  });

  it('against a player on touch the CPUs are slower still, and the pace never touches the player', () => {
    expect(lap('normal', TOUCH_CPU_PACE)).toBeGreaterThan(lap('normal'));
    const race = new Race(track, 1, false, 1);
    const player = race.addKart(RACERS[0], '150cc', null);
    race.addKart(RACERS[1], '150cc', CPU_SKILL['150cc']);
    race.focus = player;
    race.cpuPace = 0.5;
    race.time = 0;
    race.step(PHYSICS_DT, [NEUTRAL_INPUT]);
    expect(player.params.topSpeed).toBe(player.baseParams.topSpeed);
  });

  it('smart steering is firmer on touch', () => {
    expect(ASSIST_TOUCH.openPush).toBeGreaterThan(ASSIST_NORMAL.openPush);
    expect(ASSIST_TOUCH.wallPush).toBeGreaterThan(ASSIST_NORMAL.wallPush);
    expect(ASSIST_TOUCH.lookAhead).toBeGreaterThan(ASSIST_NORMAL.lookAhead);
    expect(ASSIST_TOUCH.alignMax).toBeGreaterThan(ASSIST_NORMAL.alignMax);
  });
});
