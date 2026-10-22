import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { FUZZ_BOOST } from '../src/items/items';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import {
  GAMMA_BOOST, GAMMA_EDGE, GAMMA_STAGES, HazardSystem, RAMP_LAUNCH, ROBOT_STAGES, VULTURE_BOOST, VULTURE_LIFT, VULTURE_STAGES, WAH_BOOST, WAH_SLOW, WAH_SPRING, WAH_STAGES, type HazardPose,
} from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams, type EngineClass } from '../src/physics/racers';
import { TRACK_SONGS, TRANSCRIBED } from '../src/audio/songs';
import { buildGammaKnife } from '../src/tracks/gammaKnife';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { buildPeopleVultures } from '../src/tracks/peopleVultures';
import { buildRobotStop } from '../src/tracks/robotStop';
import { buildWahWah } from '../src/tracks/wahWah';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

/** How a shortcut's jump is meant to go: who makes it, and who doesn't. */
interface JumpSpec {
  /** Engine class and boost seconds that every racer clears it with. */
  clears: [EngineClass, number][];
  /** Engine class and boost seconds that the first racer falls short with. */
  fails: [EngineClass, number][];
}

interface Case {
  name: string;
  /** The lap the shortcut is open on, when it isn't on every lap. */
  lap?: LapContext;
  build: () => TrackDef;
  branch: string;
  /** Branch arc length (m) at each end where it may still run alongside the main road. */
  junction: number;
  jump?: JumpSpec;
  /** Boost seconds given at the start of the timed runs (a pad at the mouth, say). */
  boost?: number;
}

const CASES: Case[] = [
  { name: 'Robot Stop', build: buildRobotStop, branch: 'The Open Door', junction: 40, lap: { lap: 2, lastLap: false } },
  { name: 'Gamma Knife', build: buildGammaKnife, branch: 'Pierced Through', junction: 40, lap: { lap: 2, lastLap: false } },
  { name: 'People-Vultures', build: buildPeopleVultures, branch: 'Carrion Bridge', junction: 40, lap: { lap: 2, lastLap: false } },
  { name: 'Wah Wah', build: buildWahWah, branch: 'Open Pedal', junction: 40, lap: { lap: 3, lastLap: true } },
];

describe('Nonagon Infinity Cup', () => {
  it('is four new tracks in album order, each with its own world and a lap and a final-lap song', () => {
    const cup = CUPS.find((c) => c.name === 'Nonagon Infinity Cup')!;
    expect(cup.tracks).toHaveLength(4);
    const defs = cup.tracks.map((t) => TRACK_LIST[t].build());
    expect(defs.map((d) => d.id)).toEqual(['robot-stop', 'gamma-knife', 'people-vultures', 'wah-wah']);
    expect(new Set(defs.map((d) => d.theme)).size).toBe(4);
    for (const d of defs) {
      expect(d.music.lap).toBe(d.id);
      expect(d.music.finalLap).toBe(`${d.id}-final-lap`);
      expect(TRACK_SONGS[d.id].album).toBe('Nonagon Infinity');
      expect(TRACK_SONGS[d.id].year).toBe(2016);
    }
    // The album's own order, so the cup loops the way the record does.
    expect(defs.map((d) => TRACK_SONGS[d.id].title)).toEqual(['Robot Stop', 'Gamma Knife', 'People-Vultures', 'Wah Wah']);
  });

  it('plays a remix transcribed from the band\'s own recording on every track, and leaves the Speedway its old Robot Stop', () => {
    for (const id of ['robot-stop', 'gamma-knife', 'people-vultures', 'wah-wah']) {
      expect(TRANSCRIBED[id].recording, id).toBe(TRACK_SONGS[id].title);
      expect(TRANSCRIBED[id].release).toMatch(/^Live In (Brussels '19|Chicago '23)$/);
    }
    expect(TRACK_SONGS['infinite-loop-speedway'].title).toBe('Robot Stop');
    expect(TRANSCRIBED['infinite-loop-speedway']).toBeUndefined();
  });
});

describe('Robot Stop: the factory where the line stops', () => {
  const def = buildRobotStop();
  const names = def.main.sections.map((s) => s.name);

  it('runs down the line, up the conveyor and off the top, through the press hall and the smelter trench to the door', () => {
    const order = ['Assembly Line', 'Loosen Up Esses', 'Conveyor Climb', 'Time to Drop', 'Press Hall', 'Smelter Trench', 'Scrapyard Leap', 'Nonagon Door'];
    const at = order.map((n) => names.indexOf(n));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('walls its halls in steel, and has robots marching across both', () => {
    for (const n of ['Press Hall', 'Smelter Trench']) expect(def.main.sections.find((s) => s.name === n)!.wallHeight).toBeGreaterThanOrEqual(5);
    const robots = def.hazards.filter((h) => h.kind === 'robots').flatMap((h) => ('at' in h ? h.at : []));
    expect(robots.length).toBeGreaterThanOrEqual(4);
    const hall = def.main.sections.find((s) => s.name === 'Press Hall')!;
    const trench = def.main.sections.find((s) => s.name === 'Smelter Trench')!;
    expect(robots.filter((s) => s >= hall.from && s <= hall.to).length).toBeGreaterThanOrEqual(2);
    expect(robots.filter((s) => s >= trench.from && s <= trench.to).length).toBeGreaterThanOrEqual(2);
  });

  it('climbs the conveyor to 14 m over the road it started on', () => {
    const track = new Track(def);
    const climb = def.main.sections.find((s) => s.name === 'Conveyor Climb')!;
    expect(track.main.heightAtBuilder(climb.to)).toBeCloseTo(14, 0);
    expect(climb.bridge).toBe(true);
  });
});

const first = RACERS[0];

describe.each(CASES.map((c) => [c.name, c] as const))('%s shortcut and kickers', (_name, c) => {
  const def = c.build();
  const track = new Track(def);
  const k = def.branches.findIndex((b) => b.name === c.branch);
  const bdef = def.branches[k];
  const branch = track.branches[k];

  it('has the shortcut, meeting the main road at both ends', () => {
    expect(k).toBeGreaterThanOrEqual(0);
    const sp = branch.spline;
    const ends: [number, number, number, number][] = [
      [sp.px[0], sp.pz[0], Math.atan2(sp.tx[0], sp.tz[0]), bdef.mainFrom],
      [sp.px[sp.count - 1], sp.pz[sp.count - 1], Math.atan2(sp.tx[sp.count - 1], sp.tz[sp.count - 1]), bdef.mainTo],
    ];
    for (const [x, z, h, s] of ends) {
      const p = pointAt(track.spline, track.mainS(s));
      expect(Math.hypot(x - p.x, z - p.z)).toBeLessThan(1);
      expect(Math.abs(wrapAngle(h - Math.atan2(p.tx, p.tz)))).toBeLessThan((3 * Math.PI) / 180);
    }
    for (const end of [bdef.sections[0], bdef.sections[bdef.sections.length - 1]]) expect(end.wallHeight ?? 0).toBe(0);
    for (const s of [bdef.mainFrom, bdef.mainTo]) {
      const sec = def.main.sections.find((q) => s >= q.from && s <= q.to)!;
      expect(sec.wallHeight ?? 0).toBe(0);
    }
  });

  it('keeps clear of the main road away from its junctions, and inside the bounds', () => {
    const sp = branch.spline;
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < c.junction || sp.dist[i] > sp.length - c.junction) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - track.main.halfWidthAt(hit) - branch.halfWidth[i], `branch s ${sp.dist[i].toFixed(0)}`).toBeGreaterThan(4);
    }
  });

  it('puts a row of double item boxes on the shortcut', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  if (c.jump) {
    const jumpSpec = c.jump;
    it('its jump is cleared at the speed it is built for, and failed without', () => {
      const gapStart = branch.scale * bdef.gaps[0][0];
      for (const [engine, boost] of jumpSpec.clears) {
        for (const r of RACERS) {
          const p = kartParams(r.stats, engine);
          expect(jump(track, gapStart - 20, k, p.topSpeed, boost, p), `${r.id} ${engine} boost ${boost}`).toBe('cleared');
        }
      }
      for (const [engine, boost] of jumpSpec.fails) {
        const p = kartParams(first.stats, engine);
        expect(jump(track, gapStart - 20, k, p.topSpeed, boost, p), `${engine} boost ${boost}`).toBe('fell');
      }
    });
  }

  it('a kart driving down the shortcut with a moderate boost reaches the rejoin', () => {
    // A Fuzz boost fired 30 m before the jump, if there is one.
    const p = kartParams(first.stats, '100cc');
    const boostAt = bdef.gaps.length ? branch.scale * bdef.gaps[0][0] - 30 : 0;
    const run = drive(track, branch, bdef.mainTo, p, FUZZ_BOOST, undefined, boostAt, c.lap);
    expect(run.fell).toBe(false);
    expect(run.time).toBeLessThan(20);
  });

  it('is quicker than the main line at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const viaBranch = drive(track, branch, bdef.mainTo, p, c.boost ?? 0, undefined, -Infinity, c.lap);
    const viaMain = drive(track, track.main, bdef.mainTo, p, c.boost ?? 0, bdef.mainFrom, -Infinity, c.lap);
    console.log(`${c.name}: ${c.branch} ${viaBranch.time.toFixed(2)} s, main line ${viaMain.time.toFixed(2)} s, saves ${(viaMain.time - viaBranch.time).toFixed(2)} s`);
    expect(viaBranch.fell).toBe(false);
    expect(viaMain.fell).toBe(false);
    expect(viaBranch.time).toBeLessThan(viaMain.time - 0.8);
    expect(viaBranch.time).toBeGreaterThan(viaMain.time - 2.5);
  });

  it('has trick kickers that launch a kart at 100cc and land it on the road', () => {
    const lips = kickerLips(def);
    expect(lips.length).toBeGreaterThanOrEqual(1);
    expect(lips.length).toBeLessThanOrEqual(3);
    const p = kartParams(first.stats, '100cc');
    for (const lip of lips) {
      const start = track.mainS(lip - 7 - 25);
      const pt = pointAt(track.spline, start);
      const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
      kart.y = kart.groundY = track.main.heightAt(start);
      kart.speed = p.topSpeed;
      let launched = false;
      let landed = false;
      let progress = start;
      // Low gravity floats a kart further, and off the smallest rise again: what matters is that it comes down on the road.
      for (let t = 0; t < 4 && !landed; t += PHYSICS_DT) {
        const ev = stepKart(kart, steerAlong(track.main, kart, progress), p, track, PHYSICS_DT);
        progress = nearestOnSpline(track.spline, kart.x, kart.z).s;
        launched ||= ev.launched;
        landed = launched && kart.grounded;
        expect(fallen(track, kart), `kicker at ${lip.toFixed(0)}`).toBe(false);
      }
      expect(launched, `kicker at ${lip.toFixed(0)}`).toBe(true);
      expect(landed).toBe(true);
      expect(track.locate(kart.x, kart.z, kart.y).onRoad).toBe(true);
    }
  });
});


/** The shortcuts that are only there on some laps, and what they are on the others. */
const LAP_ROADS: { name: string; build: () => TrackDef; branch: string; open: LapContext; shut: LapContext; shutIs: 'fall' | 'barred' }[] = [
  { name: 'Robot Stop', build: buildRobotStop, branch: 'The Open Door', open: { lap: 2, lastLap: false }, shut: { lap: 3, lastLap: true }, shutIs: 'barred' },
  { name: 'Gamma Knife', build: buildGammaKnife, branch: 'Pierced Through', open: { lap: 2, lastLap: false }, shut: { lap: 1, lastLap: false }, shutIs: 'fall' },
  { name: 'People-Vultures', build: buildPeopleVultures, branch: 'Carrion Bridge', open: { lap: 1, lastLap: false }, shut: { lap: 3, lastLap: true }, shutIs: 'fall' },
  { name: 'Wah Wah', build: buildWahWah, branch: 'Open Pedal', open: { lap: 3, lastLap: true }, shut: { lap: 2, lastLap: false }, shutIs: 'barred' },
];

describe.each(LAP_ROADS.map((c) => [c.name, c] as const))('%s: a road that comes and goes', (_name, c) => {
  const def = c.build();
  const track = new Track(def);
  const k = def.branches.findIndex((b) => b.name === c.branch);
  const branch = track.branches[k];
  const p = kartParams(first.stats, '150cc');

  it('is there on its lap: driven, it reaches the rejoin', () => {
    const run = drive(track, branch, def.branches[k].mainTo, p, 0, undefined, -Infinity, c.open);
    expect(run.fell).toBe(false);
    expect(run.time).toBeLessThan(20);
  });

  it(c.shutIs === 'fall' ? 'is gone on the other laps: drive on and you fall' : 'is barred on the other laps: you bounce off the bar', () => {
    const run = drive(track, branch, def.branches[k].mainTo, p, 0, undefined, -Infinity, c.shut);
    if (c.shutIs === 'fall') expect(run.fell).toBe(true);
    else {
      expect(run.fell).toBe(false);
      expect(run.time).toBe(Infinity);
    }
  });

  it('is always there for a lookup that names no lap', () => {
    const mid = pointAt(branch.spline, branch.spline.length / 2);
    expect(track.locate(mid.x, mid.z, branch.heightAt(branch.spline.length / 2) + 1).onRoad).toBe(true);
  });
});

/** Steps race time until hazard `kind` is in a stage `ok` likes, and returns that pose. */
function hazardWhen(h: HazardSystem, kind: HazardPose['kind'], ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.02) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === kind && ok(q));
    if (p) return p;
  }
  throw new Error(`no ${kind} in that stage`);
}

/** A kart sitting right on a hazard. */
function kartAt(p: HazardPose): KartState {
  const s = createKartState(p.x, p.z, p.heading);
  s.y = s.groundY = p.ground;
  return s;
}

describe('hazards that help when you use them', () => {
  it('a robot marching across the road walks into you; stopped dead it is a block, and a ramp if you hop onto it', () => {
    const h = new HazardSystem(new Track(buildRobotStop()));
    const sides = new Set<number>();
    for (let t = 0; t < 30; t += 0.05) {
      h.update(t);
      for (const q of h.poses) if (q.kind === 'robots') sides.add(q.side);
    }
    expect([...sides].sort()).toEqual([-1, 1]);
    const marching = hazardWhen(h, 'robots', (q) => q.phase < ROBOT_STAGES.stop - 0.05);
    const walked = kartAt(marching);
    expect(h.collide([walked], PHYSICS_DT)[0]).toMatchObject({ by: 'robots' });
    expect(walked.spinTime).toBeGreaterThan(0);
    const stopped = hazardWhen(h, 'robots', (q) => q.phase >= ROBOT_STAGES.stop + 0.02 && q.phase < ROBOT_STAGES.go - 0.02);
    const bumped = kartAt(stopped);
    bumped.x += 1;
    expect(h.collide([bumped], PHYSICS_DT)).toEqual([]);
    expect(bumped.spinTime).toBe(0);
    expect(Math.hypot(bumped.x - stopped.x, bumped.z - stopped.z)).toBeGreaterThan(stopped.radius);
    const hopped = kartAt(stopped);
    hopped.hopAge = 0.1;
    expect(h.collide([hopped], PHYSICS_DT)[0]).toMatchObject({ by: 'robots', good: true });
    expect(hopped.vy).toBe(RAMP_LAUNCH);
    expect(hopped.grounded).toBe(false);
  });

  it('the gamma knife misses while it aims, bursts where it is pointed, and slipping through the crosshair as it closes is a boost', () => {
    const h = new HazardSystem(new Track(buildGammaKnife()));
    const aiming = hazardWhen(h, 'gammaRays', (q) => q.phase >= GAMMA_STAGES.aim && q.phase < GAMMA_EDGE - 0.02);
    expect(h.collide([kartAt(aiming)], PHYSICS_DT)).toEqual([]);
    const closing = hazardWhen(h, 'gammaRays', (q) => q.phase >= GAMMA_EDGE && q.phase < GAMMA_STAGES.fire);
    const slipped = kartAt(closing);
    expect(h.collide([slipped], PHYSICS_DT)[0]).toMatchObject({ by: 'gammaRays', good: true });
    expect(slipped.boostTime).toBeCloseTo(GAMMA_BOOST);
    expect(slipped.spinTime).toBe(0);
    const firing = hazardWhen(h, 'gammaRays', (q) => q.active);
    const pierced = kartAt(firing);
    expect(h.collide([pierced], PHYSICS_DT)[0]).toMatchObject({ by: 'gammaRays' });
    expect(pierced.spinTime).toBeGreaterThan(0);
    // Beside the focus, nothing: the knife is a point.
    const beside = kartAt(firing);
    beside.x += Math.cos(firing.heading) * (firing.radius + 2);
    beside.z -= Math.sin(firing.heading) * (firing.radius + 2);
    expect(h.collide([beside], PHYSICS_DT)).toEqual([]);
  });

  it('a vulture circles high out of reach, swoops low along the road, and carries a kart that hops as it comes', () => {
    const h = new HazardSystem(new Track(buildPeopleVultures()));
    const circling = hazardWhen(h, 'vultures', (q) => q.phase < VULTURE_STAGES.dive);
    expect(circling.y - circling.ground).toBeGreaterThan(10);
    expect(h.collide([kartAt(circling)], PHYSICS_DT)).toEqual([]);
    const swooping = hazardWhen(h, 'vultures', (q) => q.active);
    expect(swooping.y - swooping.ground).toBeLessThan(2);
    const flat = kartAt(swooping);
    expect(h.collide([flat], PHYSICS_DT)[0]).toMatchObject({ by: 'vultures' });
    expect(flat.spinTime).toBeGreaterThan(0);
    const hopped = kartAt(swooping);
    hopped.hopAge = 0.1;
    expect(h.collide([hopped], PHYSICS_DT)[0]).toMatchObject({ by: 'vultures', good: true });
    expect(hopped.vy).toBe(VULTURE_LIFT);
    expect(hopped.boostTime).toBeCloseTo(VULTURE_BOOST);
    expect(hopped.spinTime).toBe(0);
    // The swoop runs along the road: the bird moves between two reads.
    h.update(0);
    const a = hazardWhen(h, 'vultures', (q) => q.phase >= VULTURE_STAGES.swoop && q.phase < VULTURE_STAGES.swoop + 0.02);
    const ax = a.x;
    const az = a.z;
    const b = hazardWhen(h, 'vultures', (q) => q.phase >= VULTURE_STAGES.climb - 0.02 && q.phase < VULTURE_STAGES.climb);
    expect(Math.hypot(b.x - ax, b.z - az)).toBeGreaterThan(8);
  });

  it('a wah pedal is harmless toe up, squashes you as it stamps, and stamped flat is a springboard if you hop onto it', () => {
    const h = new HazardSystem(new Track(buildWahWah()));
    const up = hazardWhen(h, 'wahs', (q) => q.phase < WAH_STAGES.stamp - 0.05);
    expect(h.collide([kartAt(up)], PHYSICS_DT)).toEqual([]);
    const stamping = hazardWhen(h, 'wahs', (q) => q.phase >= WAH_STAGES.stamp && q.phase < WAH_STAGES.down);
    const squashed = kartAt(stamping);
    squashed.speed = 20;
    expect(h.collide([squashed], PHYSICS_DT)[0]).toMatchObject({ by: 'wahs' });
    expect(squashed.spinTime).toBeGreaterThan(0);
    expect(squashed.speed).toBeCloseTo(20 * WAH_SLOW);
    const flat = hazardWhen(h, 'wahs', (q) => q.phase >= WAH_STAGES.down + 0.02 && q.phase < WAH_STAGES.rise - 0.02);
    const bumped = kartAt(flat);
    bumped.x += 1;
    expect(h.collide([bumped], PHYSICS_DT)).toEqual([]);
    expect(Math.hypot(bumped.x - flat.x, bumped.z - flat.z)).toBeGreaterThan(flat.radius);
    const hopped = kartAt(flat);
    hopped.hopAge = 0.1;
    expect(h.collide([hopped], PHYSICS_DT)[0]).toMatchObject({ by: 'wahs', good: true });
    expect(hopped.vy).toBe(WAH_SPRING);
    expect(hopped.boostTime).toBeCloseTo(WAH_BOOST);
  });
});

/** How high and low each road runs: a climb to a crest and a dip below ground. */
const HEIGHTS: { name: string; build: () => TrackDef; top: number; bottom: number }[] = [
  { name: 'Robot Stop', build: buildRobotStop, top: 13, bottom: -4 },
  { name: 'Gamma Knife', build: buildGammaKnife, top: 14, bottom: -4 },
  { name: 'People-Vultures', build: buildPeopleVultures, top: 14, bottom: -4 },
  { name: 'Wah Wah', build: buildWahWah, top: 13, bottom: -4 },
];

describe.each(HEIGHTS.map((c) => [c.name, c] as const))('%s elevation', (_name, c) => {
  const def = c.build();
  const track = new Track(def);
  const main = track.main;
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);

  it('climbs high and dips low', () => {
    const top = Math.max(...heights);
    const bottom = Math.min(...heights);
    console.log(`${c.name}: road from ${bottom.toFixed(1)} m to ${top.toFixed(1)} m`);
    expect(top).toBeGreaterThan(c.top);
    if (def.abyss) {
      // Nothing is sunk over the void.
      expect(bottom).toBeGreaterThanOrEqual(0);
      expect(main.cut.some((x) => x > 0)).toBe(false);
    } else {
      expect(bottom).toBeLessThan(c.bottom);
      expect(main.cut.some((x) => x > 0)).toBe(true);
    }
  });

  it('keeps its cuts clear of pits, so the ground opens cleanly round each', () => {
    const sp = main.spline;
    for (let i = 0; i < sp.count; i++) {
      if (!main.cut[i]) continue;
      const near = def.pits.some((p) => inPit({ ...p, halfLength: p.halfLength + 6, halfWidth: p.halfWidth + 6 }, sp.px[i], sp.pz[i]));
      expect(near, `cut at ${main.toBuilder(sp.dist[i]).toFixed(0)}`).toBe(false);
    }
  });

  it('never runs downhill so steeply that a kart at full speed skips off it', () => {
    // Kicker lips and jump gaps aside, no slope steeper than this.
    for (let s = 0; s + 1 < heights.length; s++) {
      const b = main.toBuilder(s);
      if (lips.some((l) => Math.abs(b - l) < 2) || def.main.gaps.some(([a, z]) => b > a - 2 && b < z + 2)) continue;
      expect(heights[s] - heights[s + 1], `at ${b.toFixed(0)}`).toBeLessThan(0.45);
    }
  });

  it('gives a fast kart airtime off a crest, and laps it at 150cc with no falls', () => {
    const race = new Race(track);
    const kart = race.addKart(RACERS[0], '150cc', null);
    race.time = 0;
    let respawns = 0;
    const crests: number[] = [];
    for (let t = 0; t < 200 && kart.laps.lap < 1; t += PHYSICS_DT) {
      const s = kart.state;
      const ev = race.step(PHYSICS_DT, [steerAlong(main, s, kart.progressS)])[0];
      if (kart.respawned) respawns++;
      const b = main.toBuilder(kart.progressS);
      // A launch that isn't off a kicker or a jump ramp: over the top of a hill.
      if (ev.launched && !lips.some((l) => Math.abs(b - l) < 6) && !def.main.gaps.some(([a, z]) => b > a - 4 && b < z + 4)) crests.push(b);
    }
    console.log(`${c.name}: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    expect(crests.length).toBeGreaterThan(0);
  }, 30000);

  it('a full field of 150cc CPUs laps it', () => {
    const race = new Race(track);
    for (const r of RACERS.slice(0, 8)) race.addKart(r, '150cc', CPU_SKILL['150cc']);
    let respawns = 0;
    for (let t = 0; t < 200 && race.karts.some((k) => k.laps.lap < 1); t += PHYSICS_DT) {
      race.step(PHYSICS_DT, []);
      respawns += race.karts.filter((k) => k.respawned).length;
    }
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(1);
    expect(respawns).toBeLessThanOrEqual(2);
  }, 30000);
});

/** Below the ground and not on a road there (a road sunk in a cut holds you up): fallen. */
function fallen(track: Track, kart: KartState): boolean {
  if (kart.y > -2) return false;
  const loc = track.locateKart(kart);
  return !(loc.onRoad && kart.y > loc.height - 1.5);
}

/** Builder arc lengths of each kicker's lip on the main road: a sheer drop in the elevation keys. */
function kickerLips(def: TrackDef): number[] {
  const el = def.main.elevation;
  const lips: number[] = [];
  for (let j = 1; j < el.length; j++) if (el[j][0] - el[j - 1][0] < 1e-6 && el[j - 1][1] - el[j][1] > 0.5) lips.push(el[j][0]);
  return lips;
}

/** Steers toward a point 14 m further along `ribbon`, as the autopilot in tests/track.test.ts does. */
function steerAlong(ribbon: Ribbon, s: ReturnType<typeof createKartState>, progress: number) {
  const sp = ribbon.spline;
  const p = pointAt(sp, sp.closed ? progress + 14 : Math.min(progress + 14, sp.length));
  const desired = Math.atan2(p.x - s.x, p.z - s.z);
  const err = wrapAngle(desired - s.heading);
  return { ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) };
}

/**
 * Drives a ribbon (a branch from its start, or the main road from builder
 * arc length `from`) at top speed until the kart passes the main road's
 * pose at builder arc length `to`; reports the time and whether it fell.
 * A boost of `boost` seconds kicks in at ribbon arc length `boostAt`.
 */
function drive(track: Track, ribbon: Ribbon, to: number, p: ReturnType<typeof kartParams>, boost: number, from?: number, boostAt = -Infinity, lap?: LapContext) {
  const s0 = from === undefined ? 0 : track.mainS(from);
  const pt = pointAt(ribbon.spline, s0);
  const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
  if (lap) Object.assign(kart, lap);
  kart.y = kart.groundY = ribbon.heightAt(s0);
  kart.speed = p.topSpeed;
  const goal = pointAt(track.spline, track.mainS(to));
  let progress = s0;
  let hint = -1;
  for (let t = 0; t < 30; t += PHYSICS_DT) {
    if (boost > 0 && progress >= boostAt) {
      kart.boostTime = boost;
      boost = 0;
    }
    stepKart(kart, steerAlong(ribbon, kart, progress), p, track, PHYSICS_DT);
    const hit = nearestOnSpline(ribbon.spline, kart.x, kart.z, hint, 20);
    hint = hit.index;
    progress = hit.s;
    if (fallen(track, kart)) return { time: t, fell: true };
    const near = Math.hypot(kart.x - goal.x, kart.z - goal.z) < 30;
    if (near && (kart.x - goal.x) * goal.tx + (kart.z - goal.z) * goal.tz >= 0) return { time: t, fell: false };
  }
  return { time: Infinity, fell: false };
}

/** Drives straight down a ribbon from arc length `s` and reports whether the kart landed or fell (as in tests/track.test.ts). */
function jump(track: Track, s: number, ribbon: number, speed: number, boost: number, p: ReturnType<typeof kartParams>) {
  const r = track.ribbon(ribbon);
  const pt = pointAt(r.spline, s);
  const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
  kart.y = kart.groundY = r.heightAt(s);
  kart.speed = speed;
  kart.boostTime = boost;
  for (let t = 0; t < 4; t += PHYSICS_DT) {
    stepKart(kart, { ...NEUTRAL_INPUT, throttle: 1 }, p, track, PHYSICS_DT);
    if (fallen(track, kart)) return 'fell';
  }
  return 'cleared';
}
