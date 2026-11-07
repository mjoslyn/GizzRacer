import { describe, expect, it } from 'vitest';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { COUNTDOWN, DRAG_MAX, RUBBER_BAND_MAX, Race, ordinal } from '../src/core/race';
import { FIELD_SIZE, RACERS } from '../src/physics/racers';
import { buildRattlesnakeRun } from '../src/tracks/rattlesnakeRun';
import { TRACK_LIST } from '../src/tracks/index';
import { pointAt } from '../src/tracks/spline';
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
    expect(race.karts.map((k) => k.position).sort((a, b) => a - b)).toEqual(RACERS.slice(0, FIELD_SIZE).map((_, i) => i + 1));
    expect(race.karts[0].position).toBe(1);
  });

  it('CPUs ahead of the player hold back a little, scaled by how far ahead, and only CPUs', () => {
    const race = cpuRace();
    const me = race.addKart(RACERS[FIELD_SIZE], '100cc', null);
    race.focus = me;
    for (const k of race.karts) k.distance = 0;
    const lead = race.karts[0];
    lead.distance = 300;
    race.karts[2].distance = -100;
    race.step(PHYSICS_DT, []);
    // The leader, well ahead of the player: the full drag, and no trailing boost (it leads).
    expect(lead.params.topSpeed).toBeCloseTo(lead.baseParams.topSpeed * (1 - DRAG_MAX), 6);
    // The player's own kart is never touched, and a kart behind the player gets no drag.
    expect(me.params.topSpeed).toBeCloseTo(me.baseParams.topSpeed, 6);
    expect(race.karts[2].params.topSpeed).toBeGreaterThanOrEqual(race.karts[2].baseParams.topSpeed);
    // Just ahead: a fraction of it.
    lead.distance = 60;
    race.step(PHYSICS_DT, []);
    expect(lead.params.topSpeed).toBeCloseTo(lead.baseParams.topSpeed * (1 - DRAG_MAX * 0.4), 6);
    // No focus (attract mode, online): nobody holds back.
    race.focus = null;
    race.step(PHYSICS_DT, []);
    expect(lead.params.topSpeed).toBeCloseTo(lead.baseParams.topSpeed, 6);
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

  it('a CPU put back after a fall drives on: the ground it lost falling is not counted against it as being wedged', () => {
    const race = cpuRace('100cc');
    for (let t = 0; t < COUNTDOWN + 8; t += PHYSICS_DT) race.step(PHYSICS_DT, []);
    const k = race.karts[0];
    // Gone wide off the road and on along beside it a way (the stuck clock running, the ground it'll lose
    // going back to its checkpoint already against it), then over the edge: a fall.
    const here = pointAt(track.spline, k.progressS);
    Object.assign(k.state, { x: here.x - here.tz * 60, z: here.z + here.tx * 60, y: -6, vy: 0, grounded: false });
    k.stuckTime = 5;
    k.gained = -300;
    let falls = 0;
    for (let t = 0; t < 3 && !falls; t += PHYSICS_DT) {
      race.step(PHYSICS_DT, []);
      if (k.respawned) falls++;
    }
    expect(falls).toBe(1);
    let again = 0;
    for (let t = 0; t < 10; t += PHYSICS_DT) {
      race.step(PHYSICS_DT, []);
      if (k.respawned) again++;
    }
    expect(again).toBe(0);
  });

  it('a CPU dropped onto the road a long way back (knocked off a deck onto the road below) drives on from there', () => {
    const race = cpuRace('100cc');
    for (let t = 0; t < COUNTDOWN + 20; t += PHYSICS_DT) race.step(PHYSICS_DT, []);
    const k = race.karts[0];
    const back = track.respawnPose(k.progressS - 300);
    Object.assign(k.state, { x: back.x, y: back.y, groundY: back.y, z: back.z, heading: back.heading, vy: 0, grounded: true, trackHint: -1 });
    k.stuckTime = 2;
    let respawns = 0;
    for (let t = 0; t < 10; t += PHYSICS_DT) {
      race.step(PHYSICS_DT, []);
      if (k.respawned) respawns++;
    }
    expect(respawns).toBe(0);
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

  it("ends where it stands at the song's end: everyone finishes at once, in the order they're in", () => {
    const race = new Race(track, 1, true, 1_000_000);
    for (const r of RACERS.slice(0, FIELD_SIZE)) race.addKart(r, '100cc', CPU_SKILL['100cc']);
    for (let t = 0; t < COUNTDOWN + 20; t += PHYSICS_DT) race.step(PHYSICS_DT, []);
    const order = [...race.karts].sort((a, b) => a.position - b.position);
    race.endNow();
    expect(race.results).toEqual(order);
    expect(race.karts.map((k) => k.position).sort((a, b) => a - b)).toEqual(order.map((_, i) => i + 1));
    for (const k of race.karts) expect(k.finishTime).toBe(race.time);
  });

  it('formats positions', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});

describe.each(TRACK_LIST.map((t) => [t.name, t.build] as const))('%s with a full CPU field', (_name, build) => {
  it('every CPU laps it with items and hazards on, and no more than a fall or two', () => {
    const race = new Race(new Track(build()), 3);
    for (const r of RACERS.slice(0, FIELD_SIZE)) race.addKart(r, '100cc', CPU_SKILL['100cc']);
    // Falls the track causes: a kart knocked off a jump by an item in the last few seconds is the item's doing.
    let respawns = 0;
    const hitAt = new Map<unknown, number>();
    for (let t = 0; t < COUNTDOWN + 200 && race.karts.some((k) => k.laps.lap < 1); t += PHYSICS_DT) {
      race.step(PHYSICS_DT, []);
      for (const e of race.events) if (e.type === 'hit') hitAt.set(e.kart, race.time);
      respawns += race.karts.filter((k) => k.respawned && race.time - (hitAt.get(k) ?? -Infinity) > 3).length;
    }
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(1);
    expect(respawns).toBeLessThanOrEqual(2);
  });
});
