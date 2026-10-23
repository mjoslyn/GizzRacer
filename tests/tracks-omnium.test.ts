import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { FUZZ_BOOST } from '../src/items/items';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { GEYSER_RIDE, GEYSER_SLOW, GEYSER_THROW, HOP_BOOST, HazardSystem, RAM_BOOST, type HazardPose } from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams, type EngineClass } from '../src/physics/racers';
import { buildGoblinGarden } from '../src/tracks/goblinGarden';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { SHALLOWS_GRAVITY, buildKepler22b } from '../src/tracks/kepler22b';
import { buildMagentaMountain } from '../src/tracks/magentaMountain';
import { buildPredatorX } from '../src/tracks/predatorX';
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
  { name: 'Magenta Mountain', build: buildMagentaMountain, branch: 'Snow Bridge', junction: 40 },
  { name: 'Kepler-22b', build: buildKepler22b, branch: 'Membrane', junction: 40, lap: { lap: 2, lastLap: false } },
  { name: 'Goblin Garden', build: buildGoblinGarden, branch: 'Goblin Hole', junction: 40 },
  { name: 'Predator X', build: buildPredatorX, branch: 'Bone Bridge', junction: 40 },
];

describe('Omnium Gatherum Cup', () => {
  it('is four new tracks, each with its own world and a lap and a final-lap song', () => {
    const cup = CUPS.find((c) => c.name === 'Omnium Gatherum Cup')!;
    expect(cup.tracks).toHaveLength(4);
    const defs = cup.tracks.map((t) => TRACK_LIST[t].build());
    expect(defs.map((d) => d.id)).toEqual(['magenta-mountain', 'kepler-22b', 'goblin-garden', 'predator-x']);
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
      if (sp.dist[i] < c.junction * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - c.junction * ROAD_WIDTH_SCALE) continue;
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

describe('Magenta Mountain: up the switchbacks to the summit', () => {
  it('climbs 25 m', () => {
    const track = new Track(buildMagentaMountain());
    const top = Math.max(...Array.from({ length: Math.ceil(track.length) }, (_, s) => track.main.heightAt(s)));
    expect(top).toBeGreaterThanOrEqual(24.9);
  });
});

describe('Kepler-22b: the Weightless Shallows', () => {
  const track = new Track(buildKepler22b());
  const def = track.def;
  const sec = def.main.sections.find((q) => q.name === 'Weightless Shallows')!;

  it('has low gravity there, and only there', () => {
    const at = (b: number) => {
      const pt = pointAt(track.spline, track.mainS(b));
      const s = createKartState(pt.x, pt.z, 0);
      s.y = track.main.heightAt(track.mainS(b));
      return track.probe(s).gravity ?? 1;
    };
    expect(at((sec.from + sec.to) / 2)).toBe(SHALLOWS_GRAVITY);
    expect(at(sec.from - 30)).toBe(1);
    expect(at(sec.to + 60)).toBe(1);
  });

  it('floats a kart off its kickers for longer than a kicker anywhere else', () => {
    const p = kartParams(first.stats, '100cc');
    const air = (t: Track) => {
      const lip = kickerLips(t.def)[0];
      const start = t.mainS(lip - 7 - 25);
      const pt = pointAt(t.spline, start);
      const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
      kart.y = kart.groundY = t.main.heightAt(start);
      kart.speed = p.topSpeed;
      let progress = start;
      let flying = 0;
      for (let time = 0; time < 4; time += PHYSICS_DT) {
        stepKart(kart, steerAlong(t.main, kart, progress), p, t, PHYSICS_DT);
        progress = nearestOnSpline(t.spline, kart.x, kart.z).s;
        if (!kart.grounded) flying += PHYSICS_DT;
      }
      return flying;
    };
    const floaty = air(track);
    const plain = air(new Track(buildGoblinGarden()));
    console.log(`kicker airtime: shallows ${floaty.toFixed(2)} s, garden ${plain.toFixed(2)} s`);
    expect(floaty).toBeGreaterThan(plain * 1.6);
  });
});

/** The shortcuts that are only there on some laps, and what they are on the others. */
const LAP_ROADS: { name: string; build: () => TrackDef; branch: string; open: LapContext; shut: LapContext; shutIs: 'fall' }[] = [
  { name: 'Predator X', build: buildPredatorX, branch: 'Bone Bridge', open: { lap: 2, lastLap: false }, shut: { lap: 3, lastLap: true }, shutIs: 'fall' },
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
  it('a crystal spins you out, unless you ram it on a boost, which runs on longer', () => {
    const h = new HazardSystem(new Track(buildMagentaMountain()));
    const p = hazardWhen(h, 'crystals', () => true);
    const plain = kartAt(p);
    expect(h.collide([plain], PHYSICS_DT)[0]).toMatchObject({ by: 'crystals' });
    expect(plain.spinTime).toBeGreaterThan(0);
    const boosting = kartAt(p);
    boosting.boostTime = 0.5;
    expect(h.collide([boosting], PHYSICS_DT)[0]).toMatchObject({ by: 'crystals', good: true });
    expect(boosting.boostTime).toBeCloseTo(0.5 + RAM_BOOST);
    expect(boosting.spinTime).toBe(0);
  });

  it('a geyser throws a kart it catches and costs it speed, but hopped onto, you ride it high on a boost', () => {
    const h = new HazardSystem(new Track(buildKepler22b()));
    const p = hazardWhen(h, 'geysers', (q) => q.active);
    const caught = kartAt(p);
    caught.speed = 20;
    expect(h.collide([caught], PHYSICS_DT)[0]).toMatchObject({ by: 'geysers' });
    expect(caught.vy).toBe(GEYSER_THROW);
    expect(caught.speed).toBeCloseTo(20 * GEYSER_SLOW);
    // Thrown, it's in the air over the geyser: that is not a ride.
    expect(h.collide([caught], PHYSICS_DT)).toEqual([]);
    const hopped = kartAt(p);
    hopped.hopAge = 0.1;
    expect(h.collide([hopped], PHYSICS_DT)[0]).toMatchObject({ by: 'geysers', good: true });
    expect(hopped.vy).toBe(GEYSER_RIDE);
    expect(hopped.boostTime).toBeCloseTo(HOP_BOOST);
    expect(hopped.spinTime).toBe(0);
  });

  it('a goblin spins you out, unless you hop it', () => {
    const h = new HazardSystem(new Track(buildGoblinGarden()));
    const p = hazardWhen(h, 'goblins', () => true);
    const plain = kartAt(p);
    expect(h.collide([plain], PHYSICS_DT)[0]).toMatchObject({ by: 'goblins' });
    expect(plain.spinTime).toBeGreaterThan(0);
    const hopped = kartAt(p);
    hopped.hopAge = 0.1;
    expect(h.collide([hopped], PHYSICS_DT)[0]).toMatchObject({ by: 'goblins', good: true });
    expect(hopped.boostTime).toBeCloseTo(HOP_BOOST);
  });

  it("Predator X's jaws come over the road's edge on alternate sides and spin you out, unless you hop as they snap", () => {
    const track = new Track(buildPredatorX());
    const h = new HazardSystem(track);
    const sides = new Set<number>();
    for (let t = 0; t < 30; t += 0.02) {
      h.update(t);
      for (const q of h.poses) {
        if (q.kind !== 'jaws' || !q.active) continue;
        const hit = nearestOnSpline(track.spline, q.x, q.z);
        // Its jaws (3.2 m) reach over the road.
        expect(hit.distance).toBeLessThan(track.main.halfWidthAt(hit) + 3);
        const pt = pointAt(track.spline, hit.s);
        sides.add(Math.sign((q.x - pt.x) * pt.tz - (q.z - pt.z) * pt.tx));
      }
    }
    expect(sides.size).toBe(2);
    const p = hazardWhen(h, 'jaws', (q) => q.active);
    const plain = kartAt(p);
    expect(h.collide([plain], PHYSICS_DT)[0]).toMatchObject({ by: 'jaws' });
    expect(plain.spinTime).toBeGreaterThan(0);
    const hopped = kartAt(p);
    hopped.hopAge = 0.1;
    expect(h.collide([hopped], PHYSICS_DT)[0]).toMatchObject({ by: 'jaws', good: true });
    expect(hopped.boostTime).toBeCloseTo(HOP_BOOST);
  });
});

/** How high and low each road runs: a climb to a crest and a dip below ground (none on the abyss, which has no ground). */
const HEIGHTS: { name: string; build: () => TrackDef; top: number; bottom: number }[] = [
  { name: 'Magenta Mountain', build: buildMagentaMountain, top: 22, bottom: -4 },
  { name: 'Kepler-22b', build: buildKepler22b, top: 16, bottom: -4 },
  { name: 'Goblin Garden', build: buildGoblinGarden, top: 12, bottom: -4 },
  { name: 'Predator X', build: buildPredatorX, top: 12, bottom: -4 },
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

/** Steers the kart's travel toward a point further along `ribbon` (further the faster it goes), as the autopilot in tests/track.test.ts does. */
function steerAlong(ribbon: Ribbon, s: ReturnType<typeof createKartState>, progress: number) {
  const sp = ribbon.spline;
  const look = 10 + s.speed * 0.4;
  const p = pointAt(sp, sp.closed ? progress + look : Math.min(progress + look, sp.length));
  const desired = Math.atan2(p.x - s.x, p.z - s.z);
  // The direction of travel, not the nose: a kart skids wide of its heading through a turn (stepKart's slide).
  const travel = s.speed > 4 ? Math.atan2(Math.sin(s.heading) * s.speed + s.extX, Math.cos(s.heading) * s.speed + s.extZ) : s.heading;
  const err = wrapAngle(desired - travel);
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
