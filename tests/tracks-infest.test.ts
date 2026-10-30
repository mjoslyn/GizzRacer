import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { FUZZ_BOOST } from '../src/items/items';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import {
  AIRLOCK_BOOST, AIRLOCK_SLIT, AIRLOCK_STAGES, FLARE_BOOST, FLARE_CLEAR, FLARE_HEIGHT, FLARE_STAGES, HOP_BOOST, HazardSystem, RAM_BOOST, RAT_LENGTH, RAT_STAGES, SMOG_LIFT, SMOG_SLOW, SMOG_STAGES, flareHeight, type HazardPose,
} from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams, type EngineClass } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { buildHell } from '../src/tracks/hell';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { buildMarsForTheRich } from '../src/tracks/marsForTheRich';
import { buildPerihelion } from '../src/tracks/perihelion';
import { buildPlanetB } from '../src/tracks/planetB';
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
  { name: 'Planet B', build: buildPlanetB, branch: 'The Last Bridge', junction: 40, lap: { lap: 1, lastLap: false } },
  { name: 'Mars for the Rich', build: buildMarsForTheRich, branch: 'Service Tube', junction: 40, lap: { lap: 2, lastLap: false } },
  { name: 'Perihelion', build: buildPerihelion, branch: 'Sunspot Crossing', junction: 40, lap: { lap: 2, lastLap: false } },
  { name: 'Hell', build: buildHell, branch: "Devil's Bridge", junction: 40, lap: { lap: 3, lastLap: true } },
];

const IDS = ['planet-b', 'mars-for-the-rich', 'perihelion', 'hell'];

describe("Infest the Rats' Nest Cup", () => {
  it('is four new tracks in album order, each with its own world and a lap and a final-lap song', () => {
    const cup = CUPS.find((c) => c.name === "Infest the Rats' Nest Cup")!;
    expect(cup.id).toBe('infest-the-rats-nest');
    expect(cup.tracks).toEqual([28, 29, 30, 31]);
    const defs = cup.tracks.map((t) => TRACK_LIST[t].build());
    expect(defs.map((d) => d.id)).toEqual(IDS);
    expect(cup.tracks.map((t) => TRACK_LIST[t].name)).toEqual(['Planet B', 'Mars for the Rich', 'Perihelion', 'Hell']);
    expect(new Set(defs.map((d) => d.theme)).size).toBe(4);
    for (const d of defs) {
      expect(d.music.lap).toBe(d.id);
      expect(d.music.finalLap).toBe(`${d.id}-final-lap`);
      expect(TRACK_SONGS[d.id].album).toBe("Infest the Rats' Nest");
      expect(TRACK_SONGS[d.id].year).toBe(2019);
    }
    expect(defs.map((d) => TRACK_SONGS[d.id].title)).toEqual(['Planet B', 'Mars for the Rich', 'Perihelion', 'Hell']);
  });

  it('builds its own Mars for the Rich, apart from the burning one, which is Flamethrower now', () => {
    const own = buildMarsForTheRich();
    const burning = TRACK_LIST.find((t) => t.id === 'hell-on-mars')!.build();
    expect(own.id).not.toBe(burning.id);
    expect(own.theme).not.toBe(burning.theme);
    expect(burning.name).toBe('Flamethrower');
    expect(CUPS.find((c) => c.id === 'petrodragonic-apocalypse')!.tracks.map((t) => TRACK_LIST[t].id)).toContain('hell-on-mars');
  });

  it('every track has its own landmark gate, a big landmark off the road, and its own road surface', () => {
    const defs = IDS.map((id) => TRACK_LIST.find((t) => t.id === id)!.build());
    const kinds = defs.map((d) => new Set(d.landmarks.map((l) => l.kind)));
    for (const k of kinds) expect(k.size).toBeGreaterThanOrEqual(2);
    for (const d of defs) {
      expect(d.landmarks.some((l) => Math.abs(l.lateral ?? 0) >= 100), d.id).toBe(true);
      expect(d.landmarks.filter((l) => l.s < 20).length, d.id).toBe(1);
    }
    const surfaces = defs.map((d) => d.main.sections[0].surface);
    expect(surfaces).toEqual(['tar', 'gilded', 'heatshield', 'brimstone']);
  });
});

describe('Planet B: the burning Earth', () => {
  const def = buildPlanetB();
  const names = def.main.sections.map((s) => s.name);

  it('runs down the last exit, up the smokestack and off the top, through smog alley and the sewer to the refinery', () => {
    const order = ['Last Exit Straight', 'Smokestack Esses', 'Smokestack Spiral', 'Ash Drop', 'Smog Alley', 'Sewer Cut', 'Oil Slick', 'Landfill Leap', 'Refinery Bend'];
    const at = order.map((n) => names.indexOf(n));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('walls its alley and its sewer, smog rolls across both, and the sewer has an oil slick at the bottom', () => {
    for (const n of ['Smog Alley', 'Sewer Cut']) expect(def.main.sections.find((s) => s.name === n)!.wallHeight).toBeGreaterThanOrEqual(5);
    const smog = def.hazards.filter((h) => h.kind === 'smog').flatMap((h) => ('at' in h ? h.at : []));
    expect(smog.length).toBeGreaterThanOrEqual(4);
    expect(def.main.sections.find((s) => s.name === 'Oil Slick')!.surface).toBe('oil');
    const track = new Track(def);
    const slick = def.main.sections.find((s) => s.name === 'Oil Slick')!;
    expect(track.main.heightAtBuilder((slick.from + slick.to) / 2)).toBeLessThan(-4);
  });
});

describe('Mars for the Rich: the colony under glass', () => {
  const def = buildMarsForTheRich();
  it('keeps the poor below: the Undercity is sunk deeper than the rest of the colony, with airlocks across it', () => {
    const track = new Track(def);
    const under = def.main.sections.find((s) => s.name === 'The Undercity')!;
    expect(track.main.heightAtBuilder((under.from + under.to) / 2)).toBeLessThan(-6);
    const locks = def.hazards.filter((h) => h.kind === 'airlocks').flatMap((h) => ('at' in h ? h.at : []));
    expect(locks.filter((s) => s >= under.from && s <= under.to).length).toBeGreaterThanOrEqual(2);
  });
});

describe('Hell: down through the pit', () => {
  const def = buildHell();
  it('sinks the Pit 8 m, deeper than any other cut in the cup', () => {
    const track = new Track(def);
    const pit = def.main.sections.find((s) => s.name === 'The Pit')!;
    expect(track.main.heightAtBuilder((pit.from + pit.to) / 2)).toBeCloseTo(-8, 0);
    expect(def.hazards.some((h) => h.kind === 'rats')).toBe(true);
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



/** The shortcuts that are only there on some laps, and what they are on the others. */
const LAP_ROADS: { name: string; build: () => TrackDef; branch: string; open: LapContext; shut: LapContext; shutIs: 'fall' }[] = [
  { name: 'Planet B', build: buildPlanetB, branch: 'The Last Bridge', open: { lap: 2, lastLap: false }, shut: { lap: 3, lastLap: true }, shutIs: 'fall' },
  { name: 'Mars for the Rich', build: buildMarsForTheRich, branch: 'Service Tube', open: { lap: 2, lastLap: false }, shut: { lap: 1, lastLap: false }, shutIs: 'fall' },
  { name: 'Perihelion', build: buildPerihelion, branch: 'Sunspot Crossing', open: { lap: 2, lastLap: false }, shut: { lap: 3, lastLap: true }, shutIs: 'fall' },
  { name: 'Hell', build: buildHell, branch: "Devil's Bridge", open: { lap: 3, lastLap: true }, shut: { lap: 2, lastLap: false }, shutIs: 'fall' },
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
  it('smog rolls across the road from a stack at one edge: it chokes you, hopped into it lifts you, and on a boost you blast through', () => {
    const h = new HazardSystem(new Track(buildPlanetB()));
    const gathering = hazardWhen(h, 'smog', (q) => q.phase < SMOG_STAGES.roll - 0.05);
    expect(gathering.active).toBe(false);
    expect(h.collide([kartAt(gathering)], PHYSICS_DT)).toEqual([]);
    const sides = new Set<number>();
    for (let t = 0; t < 30; t += 0.05) {
      h.update(t);
      for (const q of h.poses) if (q.kind === 'smog') sides.add(q.side);
    }
    expect([...sides].sort()).toEqual([-1, 1]);
    // It rolls: two reads apart, the cloud has crossed a good part of the road.
    h.update(0);
    const a = hazardWhen(h, 'smog', (q) => q.phase >= SMOG_STAGES.roll && q.phase < SMOG_STAGES.roll + 0.02);
    const ax = a.x;
    const az = a.z;
    const b = hazardWhen(h, 'smog', (q) => q.phase >= SMOG_STAGES.clear - 0.03 && q.phase < SMOG_STAGES.clear);
    expect(Math.hypot(b.x - ax, b.z - az)).toBeGreaterThan(15);
    const rolling = hazardWhen(h, 'smog', (q) => q.active);
    const choked = kartAt(rolling);
    choked.speed = 20;
    expect(h.collide([choked], PHYSICS_DT)[0]).toMatchObject({ by: 'smog' });
    expect(choked.speed).toBeCloseTo(20 * SMOG_SLOW);
    const hopped = kartAt(rolling);
    hopped.hopAge = 0.1;
    expect(h.collide([hopped], PHYSICS_DT)[0]).toMatchObject({ by: 'smog', good: true });
    expect(hopped.vy).toBe(SMOG_LIFT);
    expect(hopped.grounded).toBe(false);
    const boosted = kartAt(rolling);
    boosted.boostTime = 0.5;
    boosted.speed = 20;
    expect(h.collide([boosted], PHYSICS_DT)[0]).toMatchObject({ by: 'smog', good: true });
    expect(boosted.boostTime).toBeCloseTo(0.5 + RAM_BOOST);
    expect(boosted.speed).toBe(20);
  });

  it('airlock doors slide in to a slit: caught by a door you spin, through the slit while it is shut is a boost, open they are nothing', () => {
    const h = new HazardSystem(new Track(buildMarsForTheRich()));
    const open = hazardWhen(h, 'airlocks', (q) => q.phase < AIRLOCK_STAGES.close - 0.05);
    expect(open.active).toBe(false);
    expect(h.collide([kartAt(open)], PHYSICS_DT)).toEqual([]);
    const shut = hazardWhen(h, 'airlocks', (q) => q.phase >= AIRLOCK_STAGES.shut + 0.02 && q.phase < AIRLOCK_STAGES.open - 0.02);
    expect(shut.gap).toBeCloseTo(AIRLOCK_SLIT);
    const slipped = kartAt(shut);
    expect(h.collide([slipped], PHYSICS_DT)[0]).toMatchObject({ by: 'airlocks', good: true });
    expect(slipped.boostTime).toBeCloseTo(AIRLOCK_BOOST);
    expect(slipped.spinTime).toBe(0);
    // A few metres to the side of the slit (towards the road's middle, so still between the frame's posts): a door.
    const fx = Math.sin(shut.heading);
    const fz = Math.cos(shut.heading);
    const c = (shut.x - shut.ax) * -fz + (shut.z - shut.az) * fx;
    const toward = c > 0 ? -1 : 1;
    const beside = (along: number) => {
      const k = kartAt(shut);
      k.x += fx * along - fz * (AIRLOCK_SLIT + 2) * toward;
      k.z += fz * along + fx * (AIRLOCK_SLIT + 2) * toward;
      return k;
    };
    const caught = beside(0);
    expect(h.collide([caught], PHYSICS_DT)[0]).toMatchObject({ by: 'airlocks' });
    expect(caught.spinTime).toBeGreaterThan(0);
    // Well past the doors along the road: nothing.
    expect(h.collide([beside(5)], PHYSICS_DT)).toEqual([]);
    // Where they meet moves from one closing to the next.
    const centres = new Set<number>();
    for (let t = 0; t < 40; t += 0.1) {
      h.update(t);
      const q = h.poses.find((p) => p.kind === 'airlocks')!;
      centres.add(Math.round((q.x - q.ax) * 2 + (q.z - q.az) * 3));
    }
    expect(centres.size).toBeGreaterThan(2);
  });

  it('a solar flare burns while it boils low across the road and as it crashes, and is a boost to drive under while it arches high', () => {
    expect(flareHeight(FLARE_STAGES.glow)).toBe(0);
    expect(flareHeight((FLARE_STAGES.arch + FLARE_STAGES.fall) / 2)).toBe(FLARE_HEIGHT);
    const h = new HazardSystem(new Track(buildPerihelion()));
    const glowing = hazardWhen(h, 'flares', (q) => q.phase >= FLARE_STAGES.glow && q.phase < FLARE_STAGES.erupt - 0.02);
    expect(h.collide([kartAt(glowing)], PHYSICS_DT)).toEqual([]);
    const boiling = hazardWhen(h, 'flares', (q) => q.phase >= FLARE_STAGES.erupt + 0.02 && q.phase < FLARE_STAGES.lift - 0.02);
    expect(boiling.active).toBe(true);
    const burned = kartAt(boiling);
    expect(h.collide([burned], PHYSICS_DT)[0]).toMatchObject({ by: 'flares' });
    expect(burned.spinTime).toBeGreaterThan(0);
    const arched = hazardWhen(h, 'flares', (q) => q.phase >= FLARE_STAGES.arch && q.phase < FLARE_STAGES.fall - 0.02);
    expect(flareHeight(arched.phase)).toBeGreaterThanOrEqual(FLARE_CLEAR);
    const under = kartAt(arched);
    under.x += -Math.cos(arched.heading) * 4;
    under.z += Math.sin(arched.heading) * 4;
    expect(h.collide([under], PHYSICS_DT)[0]).toMatchObject({ by: 'flares', good: true });
    expect(under.boostTime).toBeCloseTo(FLARE_BOOST);
    expect(under.spinTime).toBe(0);
    const crashing = hazardWhen(h, 'flares', (q) => q.phase >= FLARE_STAGES.land && q.phase < FLARE_STAGES.done - 0.01);
    expect(crashing.active).toBe(true);
  });

  it('a swarm of rats pours across the road from one edge: it spins you out, hopped it is cleared for a boost, rammed on a boost they scatter', () => {
    const h = new HazardSystem(new Track(buildHell()));
    const waiting = hazardWhen(h, 'rats', (q) => q.phase < RAT_STAGES.pour - 0.05);
    expect(waiting.active).toBe(false);
    const sides = new Set<number>();
    for (let t = 0; t < 30; t += 0.05) {
      h.update(t);
      for (const q of h.poses) if (q.kind === 'rats') sides.add(q.side);
    }
    expect([...sides].sort()).toEqual([-1, 1]);
    const pouring = hazardWhen(h, 'rats', (q) => q.phase >= (RAT_STAGES.pour + RAT_STAGES.gone) / 2 - 0.02 && q.phase < (RAT_STAGES.pour + RAT_STAGES.gone) / 2);
    // The stream trails behind the lead rat: a kart a few metres behind the head is still in the swarm.
    const tail = kartAt(pouring);
    tail.x -= Math.sin(pouring.heading) * RAT_LENGTH * 0.6;
    tail.z -= Math.cos(pouring.heading) * RAT_LENGTH * 0.6;
    expect(h.collide([tail], PHYSICS_DT)[0]).toMatchObject({ by: 'rats' });
    expect(tail.spinTime).toBeGreaterThan(0);
    const hopped = kartAt(pouring);
    hopped.hopAge = 0.1;
    expect(h.collide([hopped], PHYSICS_DT)[0]).toMatchObject({ by: 'rats', good: true });
    expect(hopped.boostTime).toBeCloseTo(HOP_BOOST);
    const rammed = kartAt(pouring);
    rammed.boostTime = 0.5;
    expect(h.collide([rammed], PHYSICS_DT)[0]).toMatchObject({ by: 'rats', good: true });
    expect(rammed.boostTime).toBeCloseTo(0.5 + RAM_BOOST);
    expect(rammed.spinTime).toBe(0);
  });
});

/** How high and low each road runs: a climb to a crest and a dip below ground. */
const HEIGHTS: { name: string; build: () => TrackDef; top: number; bottom: number }[] = [
  { name: 'Planet B', build: buildPlanetB, top: 13, bottom: -4 },
  { name: 'Mars for the Rich', build: buildMarsForTheRich, top: 14, bottom: -6 },
  { name: 'Perihelion', build: buildPerihelion, top: 14, bottom: -4 },
  { name: 'Hell', build: buildHell, top: 13, bottom: -7 },
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
