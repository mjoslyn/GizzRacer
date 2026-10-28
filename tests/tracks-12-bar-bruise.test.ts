import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { FUZZ_BOOST } from '../src/items/items';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import {
  ELBOW_BOOST, ELBOW_STAGES, HOP_BOOST, HazardSystem, RAKE_BOOST, RAKE_LANES, RAKE_SLOW, RAKE_STAGES, RAZOR_BOOST, RAZOR_RADIUS, RAZOR_SHAVE, TIMBER_STAGES, timberFall, type HazardPose,
} from '../src/items/hazards';
import { KART_RADIUS, createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams, type EngineClass } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { buildElbow } from '../src/tracks/elbow';
import { buildMuckraker } from '../src/tracks/muckraker';
import { buildCutThroatBoogie } from '../src/tracks/cutThroatBoogie';
import { buildSeaOfTrees } from '../src/tracks/seaOfTrees';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
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
  { name: 'Elbow', build: buildElbow, branch: 'The Backstab', junction: 40, lap: { lap: 3, lastLap: true } },
  { name: 'Muckraker', build: buildMuckraker, branch: 'Water Hazard', junction: 40, lap: { lap: 2, lastLap: false }, jump: { clears: [['50cc', 0], ['100cc', 0], ['150cc', 0]], fails: [] } },
  { name: 'Cut Throat Boogie', build: buildCutThroatBoogie, branch: 'Left Channel', junction: 40 },
  { name: 'Sea of Trees', build: buildSeaOfTrees, branch: 'Rope Bridge', junction: 40, lap: { lap: 3, lastLap: true } },
];

const IDS = ['elbow', 'muckraker', 'cut-throat-boogie', 'sea-of-trees'];
const NAMES = ['Elbow', 'Muckraker', 'Cut Throat Boogie', 'Sea of Trees'];

describe('12 Bar Bruise Cup', () => {
  it("is four songs from the band's first album in album order, first of the cups, each with its own world and a lap and a final-lap song", () => {
    const cup = CUPS.find((c) => c.name === '12 Bar Bruise Cup')!;
    expect(cup.id).toBe('twelve-bar-bruise');
    expect(CUPS[0]).toBe(cup);
    expect(cup.tracks).toEqual([0, 1, 2, 3]);
    const defs = cup.tracks.map((t) => TRACK_LIST[t].build());
    expect(defs.map((d) => d.id)).toEqual(IDS);
    expect(cup.tracks.map((t) => TRACK_LIST[t].name)).toEqual(NAMES);
    expect(new Set(defs.map((d) => d.theme)).size).toBe(4);
    for (const d of defs) {
      expect(d.music.lap).toBe(d.id);
      expect(d.music.finalLap).toBe(`${d.id}-final-lap`);
      expect(TRACK_SONGS[d.id].album).toBe('12 Bar Bruise');
      expect(TRACK_SONGS[d.id].year).toBe(2012);
    }
    expect(defs.map((d) => TRACK_SONGS[d.id].title)).toEqual(NAMES);
  });

  it('every track has its own landmark gate, a big landmark off the road, its own road surface and its own layout', () => {
    const defs = IDS.map((id) => TRACK_LIST.find((t) => t.id === id)!.build());
    const kinds = defs.map((d) => new Set(d.landmarks.map((l) => l.kind)));
    for (const k of kinds) expect(k.size).toBeGreaterThanOrEqual(2);
    for (const d of defs) {
      expect(d.landmarks.some((l) => Math.abs(l.lateral ?? 0) >= 100), d.id).toBe(true);
      expect(d.landmarks.filter((l) => l.s < 20).length, d.id).toBe(1);
    }
    expect(defs.map((d) => d.main.sections[0].surface)).toEqual(['carpet', 'muck', 'dancefloor', 'moss']);
    // No two share a section name: each is laid out after its own song.
    const names = defs.map((d) => d.main.sections.map((s) => s.name).filter((n) => n !== 'Finish Straight'));
    const all = names.flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('is laid out after its song: the arm bent at the elbow, the rake and its tines, the open razor and its two channels, the swells of the canopy', () => {
    const section = (def: TrackDef, name: string) => def.main.sections.find((s) => s.name === name);
    const elbow = buildElbow();
    for (const n of ['Big Shot Straight', 'The Bended Elbow', 'The Forearm', 'The Fist', 'Backstab Alley', 'Hey Hey Esses', 'The Flange']) expect(section(elbow, n), n).toBeTruthy();
    const muck = buildMuckraker();
    for (const n of ['Cobweb Straight', 'The Handle', 'The Tines', 'Power Station Climb', 'Muck Pit', 'Coogoorah Boardwalk', 'Ant Trail', 'The Fairway']) expect(section(muck, n), n).toBeTruthy();
    const boogie = buildCutThroatBoogie();
    for (const n of ['Boogie Straight', 'Set Sail', 'The Blade Edge', 'The Tip', 'Dual Mono', 'Inches', 'The Stitch-Up']) expect(section(boogie, n), n).toBeTruthy();
    // Dual Mono: a left channel there every lap, as well as the right.
    expect(boogie.branches.find((b) => b.name === 'Left Channel')!.openOn).toBeUndefined();
    const trees = buildSeaOfTrees();
    for (const n of ['The Tree Line', 'The Canopy', 'Unfold', 'Sinking Like a Stone', 'Underwater', 'Lava Tube', 'The Jam', 'Out of Tape']) expect(section(trees, n), n).toBeTruthy();
    // The canopy rolls: it rises and falls over its swells, up on the treetops.
    const track = new Track(trees);
    const canopy = section(trees, 'The Canopy')!;
    const hs = Array.from({ length: 60 }, (_, k) => track.main.heightAtBuilder(canopy.from + ((canopy.to - canopy.from) * (k + 0.5)) / 60));
    let turns = 0;
    for (let k = 1; k + 1 < hs.length; k++) if ((hs[k] - hs[k - 1]) * (hs[k + 1] - hs[k]) < 0) turns++;
    expect(turns).toBeGreaterThanOrEqual(6);
    expect(Math.min(...hs)).toBeGreaterThan(5);
  });

  it('runs each walled stretch with its own hazard across it, and the finale sinks deepest', () => {
    const own: Record<string, string> = { elbow: 'elbows', muckraker: 'rakes', 'cut-throat-boogie': 'razors', 'sea-of-trees': 'timber' };
    const depths: number[] = [];
    for (const id of IDS) {
      const def = TRACK_LIST.find((t) => t.id === id)!.build();
      const track = new Track(def);
      const walled = def.main.sections.filter((s) => (s.wallHeight ?? 0) >= 5);
      expect(walled.length, id).toBeGreaterThanOrEqual(1);
      const at = def.hazards.filter((h) => h.kind === own[id]).flatMap((h) => ('at' in h ? h.at : []));
      for (const sec of walled) expect(at.some((s) => s >= sec.from && s <= sec.to), `${id} ${sec.name}`).toBe(true);
      depths.push(Math.min(...walled.map((sec) => track.main.heightAtBuilder((sec.from + sec.to) / 2))));
    }
    expect(depths[3]).toBeCloseTo(-8, 0);
    expect(Math.min(...depths.slice(0, 3))).toBeGreaterThan(depths[3]);
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
          expect(jump(track, gapStart - 20, k, p.topSpeed, boost, p, c.lap), `${r.id} ${engine} boost ${boost}`).toBe('cleared');
        }
      }
      for (const [engine, boost] of jumpSpec.fails) {
        const p = kartParams(first.stats, engine);
        expect(jump(track, gapStart - 20, k, p.topSpeed, boost, p, c.lap), `${engine} boost ${boost}`).toBe('fell');
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
const LAP_ROADS: { name: string; build: () => TrackDef; branch: string; open: LapContext; shut: LapContext; shutIs: 'fall' }[] = [
  { name: 'Elbow', build: buildElbow, branch: 'The Backstab', open: { lap: 3, lastLap: true }, shut: { lap: 2, lastLap: false }, shutIs: 'fall' },
  { name: 'Muckraker', build: buildMuckraker, branch: 'Water Hazard', open: { lap: 2, lastLap: false }, shut: { lap: 1, lastLap: false }, shutIs: 'fall' },
  { name: 'Sea of Trees', build: buildSeaOfTrees, branch: 'Rope Bridge', open: { lap: 3, lastLap: true }, shut: { lap: 2, lastLap: false }, shutIs: 'fall' },
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
  it('an arm out of the wall winds up over one half of the road and throws its elbow across it: elbowed there, a boost past it on the other half', () => {
    const h = new HazardSystem(new Track(buildElbow()));
    const rest = hazardWhen(h, 'elbows', (q) => q.phase < ELBOW_STAGES.cock - 0.02);
    expect(rest.active).toBe(false);
    expect(h.collide([aside(rest, rest.side * 5)], PHYSICS_DT)).toEqual([]);
    // Winding up: the warning, harmless.
    const cocked = hazardWhen(h, 'elbows', (q) => q.phase >= ELBOW_STAGES.cock + 0.01 && q.phase < ELBOW_STAGES.throw - 0.02);
    expect(h.collide([aside(cocked, cocked.side * 5)], PHYSICS_DT)).toEqual([]);
    const thrown = hazardWhen(h, 'elbows', (q) => q.phase >= ELBOW_STAGES.throw + 0.01 && q.phase < ELBOW_STAGES.back - 0.02);
    expect(thrown.active).toBe(true);
    const elbowed = aside(thrown, thrown.side * 5);
    const before = { x: elbowed.extX, z: elbowed.extZ };
    expect(h.collide([elbowed], PHYSICS_DT)[0]).toMatchObject({ by: 'elbows' });
    expect(elbowed.spinTime).toBeGreaterThan(0);
    // Shoved away from the wall it came out of: toward the other half.
    const shove = (elbowed.extX - before.x) * -Math.cos(thrown.heading) + (elbowed.extZ - before.z) * Math.sin(thrown.heading);
    expect(Math.sign(shove)).toBe(-thrown.side);
    const past = aside(thrown, -thrown.side * 5);
    expect(h.collide([past], PHYSICS_DT)[0]).toMatchObject({ by: 'elbows', good: true });
    expect(past.boostTime).toBeCloseTo(ELBOW_BOOST);
    expect(past.spinTime).toBe(0);
    // Which wall changes from one throw to the next.
    const sides = new Set<number>();
    for (let t = 0; t < 60; t += 0.25) {
      h.update(t);
      for (const q of h.poses) if (q.kind === 'elbows') sides.add(q.side);
    }
    expect([...sides].sort()).toEqual([-1, 1]);
  });

  it('a rake drags one lane clean through four lanes of muck: the furrow is a boost, the muck bogs you down, and the furrow moves', () => {
    const h = new HazardSystem(new Track(buildMuckraker()));
    const wet = hazardWhen(h, 'rakes', (q) => q.phase < RAKE_STAGES.drag - 0.02);
    expect(h.collide([kartAt(wet)], PHYSICS_DT)).toEqual([]);
    const mucked = hazardWhen(h, 'rakes', (q) => q.phase >= RAKE_STAGES.muck + 0.01 && q.phase < RAKE_STAGES.dry - 0.02);
    expect(mucked.active).toBe(true);
    const w = (2 * mucked.radius) / RAKE_LANES;
    const inLane = (k: number) => aside(mucked, -mucked.radius + w * (k + 0.5));
    const furrow = inLane(mucked.lane);
    expect(h.collide([furrow], PHYSICS_DT)[0]).toMatchObject({ by: 'rakes', good: true });
    expect(furrow.boostTime).toBeCloseTo(RAKE_BOOST);
    const bogged = inLane((mucked.lane + 2) % RAKE_LANES);
    bogged.speed = 20;
    expect(h.collide([bogged], PHYSICS_DT)[0]).toMatchObject({ by: 'rakes' });
    expect(bogged.speed).toBeCloseTo(20 * RAKE_SLOW);
    expect(bogged.spinTime).toBe(0);
    const lanes = new Set<number>();
    for (let t = 0; t < 80; t += 0.25) {
      h.update(t);
      for (const q of h.poses) if (q.kind === 'rakes') lanes.add(q.lane);
    }
    expect(lanes.size).toBe(RAKE_LANES);
  });

  it('a cut-throat razor swings edge to edge: touched it cuts you and spins you, a close shave past it at speed is a boost', () => {
    const h = new HazardSystem(new Track(buildCutThroatBoogie()));
    const blade = hazardWhen(h, 'razors', () => true);
    expect(blade.active).toBe(true);
    const cut = kartAt(blade);
    cut.speed = 20;
    expect(h.collide([cut], PHYSICS_DT)[0]).toMatchObject({ by: 'razors' });
    expect(cut.spinTime).toBeGreaterThan(0);
    // Inches from it, along the road.
    const shave = kartAt(blade);
    const d = RAZOR_RADIUS + KART_RADIUS + RAZOR_SHAVE / 2;
    shave.x += Math.sin(blade.heading) * d;
    shave.z += Math.cos(blade.heading) * d;
    shave.speed = 20;
    expect(h.collide([shave], PHYSICS_DT)[0]).toMatchObject({ by: 'razors', good: true });
    expect(shave.boostTime).toBeCloseTo(RAZOR_BOOST);
    expect(shave.spinTime).toBe(0);
    // Sat there beside it, it's no shave.
    const parked = kartAt(blade);
    parked.x += Math.sin(blade.heading) * d;
    parked.z += Math.cos(blade.heading) * d;
    parked.speed = 0;
    expect(h.collide([parked], PHYSICS_DT)).toEqual([]);
    // It swings right across the road, from one edge to the other.
    let most = 0;
    let least = 0;
    for (let t = 0; t < 10; t += 0.02) {
      h.update(t);
      const q = h.poses.find((p) => p.kind === 'razors')!;
      const lat = (q.x - q.ax) * -Math.cos(q.heading) + (q.z - q.az) * Math.sin(q.heading);
      [most, least] = [Math.max(most, lat), Math.min(least, lat)];
    }
    expect(most).toBeGreaterThan(5);
    expect(least).toBeLessThan(-5);
  });

  it('a tree leans out, creaks and comes down across the road: hop its trunk for a boost, drive into it and you spin', () => {
    expect(timberFall(0)).toBe(0);
    expect(timberFall((TIMBER_STAGES.fall + TIMBER_STAGES.gone) / 2)).toBe(1);
    const h = new HazardSystem(new Track(buildSeaOfTrees()));
    const leaning = hazardWhen(h, 'timber', (q) => q.phase >= TIMBER_STAGES.lean && q.phase < TIMBER_STAGES.fall - 0.02);
    expect(leaning.active).toBe(false);
    expect(h.collide([kartAt(leaning)], PHYSICS_DT)).toEqual([]);
    const down = hazardWhen(h, 'timber', (q) => q.phase >= TIMBER_STAGES.fall + 0.06 && q.phase < TIMBER_STAGES.gone - 0.04);
    expect(down.active).toBe(true);
    // Right across the road: at either edge as well as the middle.
    for (const lat of [0, down.radius - 3, -(down.radius - 3)]) {
      const k = aside(down, lat);
      k.speed = 20;
      expect(h.collide([k], PHYSICS_DT)[0], `${lat}`).toMatchObject({ by: 'timber' });
      expect(k.spinTime).toBeGreaterThan(0);
    }
    const hopped = kartAt(down);
    hopped.hopAge = 0;
    expect(h.collide([hopped], PHYSICS_DT)[0]).toMatchObject({ by: 'timber', good: true });
    expect(hopped.boostTime).toBeCloseTo(HOP_BOOST);
    // Cleared away before the next one comes down.
    const gone = hazardWhen(h, 'timber', (q) => q.phase >= TIMBER_STAGES.gone + 0.02);
    expect(h.collide([kartAt(gone)], PHYSICS_DT)).toEqual([]);
  });
});

/** A kart sitting on a hazard's line across the road, `lateral` metres to the right of the hazard's pose. */
function aside(p: HazardPose, lateral: number): KartState {
  const k = kartAt(p);
  k.x += -Math.cos(p.heading) * lateral;
  k.z += Math.sin(p.heading) * lateral;
  return k;
}

/** How high and low each road runs: a climb to a crest and a dip below ground. */
const HEIGHTS: { name: string; build: () => TrackDef; top: number; bottom: number }[] = [
  { name: 'Elbow', build: buildElbow, top: 0.5, bottom: -5 },
  { name: 'Muckraker', build: buildMuckraker, top: 13, bottom: -5 },
  { name: 'Cut Throat Boogie', build: buildCutThroatBoogie, top: 2.5, bottom: -5 },
  { name: 'Sea of Trees', build: buildSeaOfTrees, top: 13, bottom: -7 },
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
function jump(track: Track, s: number, ribbon: number, speed: number, boost: number, p: ReturnType<typeof kartParams>, lap?: LapContext) {
  const r = track.ribbon(ribbon);
  const pt = pointAt(r.spline, s);
  const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
  if (lap) Object.assign(kart, lap);
  kart.y = kart.groundY = r.heightAt(s);
  kart.speed = speed;
  kart.boostTime = boost;
  for (let t = 0; t < 4; t += PHYSICS_DT) {
    stepKart(kart, { ...NEUTRAL_INPUT, throttle: 1 }, p, track, PHYSICS_DT);
    if (fallen(track, kart)) return 'fell';
  }
  return 'cleared';
}
