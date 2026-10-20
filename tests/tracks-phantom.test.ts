import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { FUZZ_BOOST } from '../src/items/items';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { BOULDER_STAGES, RAMP_LAUNCH, HazardSystem, RAM_BOOST, WAVE_SURF, WISP_BOOST, type HazardPose } from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams, type EngineClass } from '../src/physics/racers';
import { buildDeadstickDrop } from '../src/tracks/deadstickDrop';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { buildPanpsychGrove } from '../src/tracks/panpsychGrove';
import { buildPhantomIsland } from '../src/tracks/phantomIsland';
import { buildSeaOfDoubt } from '../src/tracks/seaOfDoubt';
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
  { name: 'Phantom Island', build: buildPhantomIsland, branch: 'Eternal Return', junction: 40, lap: { lap: 2, lastLap: false } },
  { name: 'Deadstick Drop', build: buildDeadstickDrop, branch: 'Tailwind', junction: 40, lap: { lap: 3, lastLap: true } },
  { name: 'Panpsych Grove', build: buildPanpsychGrove, branch: 'Hollow Log', junction: 40 },
  { name: 'Sea of Doubt', build: buildSeaOfDoubt, branch: 'Riptide', junction: 40 },
];

describe('Phantom Island Cup', () => {
  it('is four new tracks, each with its own world and a lap and a final-lap song', () => {
    const cup = CUPS.find((c) => c.name === 'Phantom Island Cup')!;
    expect(cup.tracks).toHaveLength(4);
    const defs = cup.tracks.map((t) => TRACK_LIST[t].build());
    expect(defs.map((d) => d.id)).toEqual(['phantom-island', 'deadstick-drop', 'panpsych-grove', 'sea-of-doubt']);
    expect(new Set(defs.map((d) => d.theme)).size).toBe(4);
    for (const d of defs) {
      expect(d.music.lap).toBe(d.id);
      expect(d.music.finalLap).toBe(`${d.id}-final-lap`);
    }
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
      let progress = start;
      for (let t = 0; t < 3; t += PHYSICS_DT) {
        const ev = stepKart(kart, steerAlong(track.main, kart, progress), p, track, PHYSICS_DT);
        progress = nearestOnSpline(track.spline, kart.x, kart.z).s;
        launched ||= ev.launched;
        expect(fallen(track, kart), `kicker at ${lip.toFixed(0)}`).toBe(false);
      }
      expect(launched, `kicker at ${lip.toFixed(0)}`).toBe(true);
      expect(kart.grounded).toBe(true);
      expect(track.locate(kart.x, kart.z, kart.y).onRoad).toBe(true);
    }
  });
});

describe('Deadstick Drop: off the end of the runway with no engine', () => {
  const def = buildDeadstickDrop();
  const track = new Track(def);
  const lip = def.main.gaps[0][0];

  it('drops well below the runway it leaves', () => {
    const before = track.main.heightAt(track.mainS(lip - 20));
    const after = track.main.heightAt(track.mainS(def.main.gaps[0][1] + 2));
    expect(before - after).toBeGreaterThan(8);
  });

  it('is cleared by every racer at 50cc top speed, with no boost', () => {
    for (const r of RACERS) {
      const p = kartParams(r.stats, '50cc');
      expect(jump(track, track.mainS(lip) - 30, -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });
});

/** The shortcuts that are only there on some laps, and what they are on the others. */
const LAP_ROADS: { name: string; build: () => TrackDef; branch: string; open: LapContext; shut: LapContext; shutIs: 'fall' | 'barred' }[] = [
  { name: 'Phantom Island', build: buildPhantomIsland, branch: 'Eternal Return', open: { lap: 2, lastLap: false }, shut: { lap: 1, lastLap: false }, shutIs: 'fall' },
  { name: 'Phantom Island (final lap)', build: buildPhantomIsland, branch: 'Eternal Return', open: { lap: 2, lastLap: false }, shut: { lap: 3, lastLap: true }, shutIs: 'fall' },
  { name: 'Deadstick Drop', build: buildDeadstickDrop, branch: 'Tailwind', open: { lap: 3, lastLap: true }, shut: { lap: 2, lastLap: false }, shutIs: 'barred' },
  { name: 'Sea of Doubt', build: buildSeaOfDoubt, branch: 'Riptide', open: { lap: 2, lastLap: false }, shut: { lap: 3, lastLap: true }, shutIs: 'fall' },
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
    expect(track.locate(mid.x, mid.z, 10).onRoad).toBe(true);
  });
});

describe('a race tells each kart which lap it is on', () => {
  it('lap 1 to start with, the last lap only in a race of more than one', () => {
    const race = new Race(new Track(buildSeaOfDoubt()));
    const kart = race.addKart(RACERS[0], '150cc', null);
    race.step(PHYSICS_DT, []);
    expect(kart.state.lap).toBe(1);
    expect(kart.state.lastLap).toBe(false);
    const trial = new Race(new Track(buildSeaOfDoubt()), 1, false, 1);
    const solo = trial.addKart(RACERS[0], '150cc', null);
    trial.step(PHYSICS_DT, []);
    expect(solo.state.lastLap).toBe(false);
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
  it('a ghost light carries you through its core with a boost', () => {
    const h = new HazardSystem(new Track(buildPhantomIsland()));
    const p = hazardWhen(h, 'wisps', () => true);
    const s = kartAt(p);
    const hits = h.collide([s], PHYSICS_DT);
    expect(hits).toEqual([{ kart: s, by: 'wisps', good: true }]);
    expect(s.boostTime).toBeCloseTo(WISP_BOOST);
  });

  it('a plane that has crash-landed is a ramp, hopped onto: it throws you up with a trick window, no spin', () => {
    const h = new HazardSystem(new Track(buildDeadstickDrop()));
    const p = hazardWhen(h, 'gliders', (q) => q.phase > BOULDER_STAGES.land + 0.05 && q.phase < BOULDER_STAGES.crumble - 0.05);
    const driven = kartAt(p);
    h.collide([driven], PHYSICS_DT);
    expect(driven.spinTime).toBeGreaterThan(0);
    const s = kartAt(p);
    s.hopAge = 0.1;
    expect(h.collide([s], PHYSICS_DT)[0]).toMatchObject({ by: 'gliders', good: true });
    expect(s.vy).toBe(RAMP_LAUNCH);
    expect(s.grounded).toBe(false);
    expect(s.trickWindow).toBeGreaterThan(0);
    expect(s.spinTime).toBe(0);
  });

  it('a stone spins you out, unless you ram it on a boost, which runs on longer', () => {
    const h = new HazardSystem(new Track(buildPanpsychGrove()));
    const p = hazardWhen(h, 'stones', () => true);
    const plain = kartAt(p);
    expect(h.collide([plain], PHYSICS_DT)[0]).toMatchObject({ by: 'stones' });
    expect(plain.spinTime).toBeGreaterThan(0);
    const boosting = kartAt(p);
    boosting.boostTime = 0.5;
    expect(h.collide([boosting], PHYSICS_DT)[0]).toMatchObject({ by: 'stones', good: true });
    expect(boosting.boostTime).toBeCloseTo(0.5 + RAM_BOOST);
    expect(boosting.spinTime).toBe(0);
  });

  it('a breaking wave spins you out, unless you hop as it breaks and surf it', () => {
    const h = new HazardSystem(new Track(buildSeaOfDoubt()));
    const p = hazardWhen(h, 'waves', (q) => q.active);
    const plain = kartAt(p);
    expect(h.collide([plain], PHYSICS_DT)[0]).toMatchObject({ by: 'waves' });
    expect(plain.spinTime).toBeGreaterThan(0);
    const hopped = kartAt(p);
    hopped.hopAge = 0.1;
    expect(h.collide([hopped], PHYSICS_DT)[0]).toMatchObject({ by: 'waves', good: true });
    expect(hopped.boostTime).toBeCloseTo(WAVE_SURF);
    expect(hopped.spinTime).toBe(0);
  });
});

/** How high and low each road runs: a climb to a crest and a dip below ground (none on the abyss, which has no ground). */
const HEIGHTS: { name: string; build: () => TrackDef; top: number; bottom: number }[] = [
  { name: 'Phantom Island', build: buildPhantomIsland, top: 12, bottom: -4 },
  { name: 'Deadstick Drop', build: buildDeadstickDrop, top: 16, bottom: -4 },
  { name: 'Panpsych Grove', build: buildPanpsychGrove, top: 12, bottom: -4 },
  { name: 'Sea of Doubt', build: buildSeaOfDoubt, top: 15, bottom: -4 },
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
