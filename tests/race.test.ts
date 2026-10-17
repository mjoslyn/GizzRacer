import { describe, expect, it } from 'vitest';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { COUNTDOWN, RUBBER_BAND_MAX, Race, ordinal } from '../src/core/race';
import { FIELD_SIZE, RACERS } from '../src/physics/racers';
import { buildRattlesnakeRun } from '../src/tracks/rattlesnakeRun';
import { TRACK_LIST } from '../src/tracks/index';
import { Track } from '../src/tracks/track';

const track = new Track(buildRattlesnakeRun());

function cpuRace(engine: '50cc' | '100cc' | '150cc' = '100cc') {
  const race = new Race(track);
  for (const r of RACERS.slice(0, FIELD_SIZE)) race.addKart(r, engine, CPU_SKILL[engine]);
  return race;
}

describe('race', () => {
  it('holds everyone on the grid during the countdown', () => {
    const race = cpuRace();
    const start = race.karts.map((k) => [k.state.x, k.state.z]);
    for (let t = 0; t < COUNTDOWN - 0.1; t += PHYSICS_DT) race.step(PHYSICS_DT, []);
    race.karts.forEach((k, i) => {
      expect(Math.hypot(k.state.x - start[i][0], k.state.z - start[i][1])).toBeLessThan(0.5);
    });
  });

  it('ranks karts 1..n with the grid order at the start', () => {
    const race = cpuRace();
    expect(race.karts.map((k) => k.position).sort()).toEqual(RACERS.slice(0, FIELD_SIZE).map((_, i) => i + 1));
    expect(race.karts[0].position).toBe(1);
  });

  it('gives trailing CPUs extra top speed, never the leader', () => {
    const race = cpuRace();
    race.karts[5].distance -= 400;
    race.step(PHYSICS_DT, []);
    const leader = race.karts.find((k) => k.position === 1)!;
    expect(leader.params.topSpeed).toBeCloseTo(leader.baseParams.topSpeed, 6);
    const last = race.karts[5];
    expect(last.params.topSpeed).toBeCloseTo(last.baseParams.topSpeed * (1 + RUBBER_BAND_MAX), 1);
  });

  it('bumps push overlapping karts apart, the light one further', () => {
    const race = new Race(track);
    const golem = race.addKart(RACERS.find((r) => r.id === 'fuzz-golem')!, '100cc', null);
    const gila = race.addKart(RACERS.find((r) => r.id === 'gila-rider')!, '100cc', null);
    gila.state.x = golem.state.x + 1;
    gila.state.z = golem.state.z;
    const g0 = { x: golem.state.x, z: golem.state.z };
    const l0 = { x: gila.state.x, z: gila.state.z };
    race.step(PHYSICS_DT, [NEUTRAL_INPUT, NEUTRAL_INPUT]);
    const dGolem = Math.hypot(golem.state.x - g0.x, golem.state.z - g0.z);
    const dGila = Math.hypot(gila.state.x - l0.x, gila.state.z - l0.z);
    expect(Math.hypot(gila.state.x - golem.state.x, gila.state.z - golem.state.z)).toBeGreaterThan(1.9);
    expect(dGila).toBeGreaterThan(dGolem);
  });

  it('a field of CPUs all complete a lap without getting stuck or falling', () => {
    const race = cpuRace('100cc');
    const respawns = race.karts.map(() => 0);
    for (let t = 0; t < COUNTDOWN + 180 && race.karts.some((k) => k.laps.lap < 1); t += PHYSICS_DT) {
      race.step(PHYSICS_DT, []);
      race.karts.forEach((k, i) => k.respawned && respawns[i]++);
    }
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(1);
    expect(respawns.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1);
    // CPUs should be quick: a 1.9 km lap well under two minutes.
    for (const k of race.karts) expect(k.lapTimes[0]).toBeLessThan(110);
  });

  it('150cc CPUs out-drive 50cc ones', () => {
    const lapTime = (engine: '50cc' | '150cc') => {
      const race = cpuRace(engine);
      const k = race.karts[0];
      for (let t = 0; t < COUNTDOWN + 200 && k.laps.lap < 1; t += PHYSICS_DT) race.step(PHYSICS_DT, []);
      return k.lapTimes[0];
    };
    expect(lapTime('150cc')).toBeLessThan(lapTime('50cc'));
  });

  it('formats positions', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});

describe.each(TRACK_LIST.map((t) => [t.name, t.build] as const))('%s with a full CPU field', (_name, build) => {
  it('every CPU laps it with items and hazards on, and no more than a fall or two', () => {
    const race = new Race(new Track(build()), 3);
    for (const r of RACERS.slice(0, FIELD_SIZE)) race.addKart(r, '100cc', CPU_SKILL['100cc']);
    let respawns = 0;
    for (let t = 0; t < COUNTDOWN + 200 && race.karts.some((k) => k.laps.lap < 1); t += PHYSICS_DT) {
      race.step(PHYSICS_DT, []);
      respawns += race.karts.filter((k) => k.respawned).length;
    }
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(1);
    expect(respawns).toBeLessThanOrEqual(2);
  });
});
