import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { FUZZ_BOOST } from '../src/items/items';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import {
  CORD_BOOST, CORD_STAGES, HOP_BOOST, HazardSystem, MOON_BOOST, PLANT_BOOST, SERPENT_STAGES, STRING_BOOST, STRING_LAG, STRING_STAGES, SUN_SLOW, type HazardPose,
} from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams, type EngineClass } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { buildTheia } from '../src/tracks/theia';
import { buildSet } from '../src/tracks/set';
import { buildChangE } from '../src/tracks/changE';
import { buildGilgamesh } from '../src/tracks/gilgamesh';
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
  { name: 'Theia', build: buildTheia, branch: 'The Silver Cord', junction: 40, lap: { lap: 1, lastLap: false } },
  { name: 'Set', build: buildSet, branch: 'The Tomb', junction: 40, lap: { lap: 2, lastLap: false } },
  { name: "Chang'e", build: buildChangE, branch: 'Riding on Moonbeams', junction: 40, lap: { lap: 3, lastLap: true } },
  { name: 'Gilgamesh', build: buildGilgamesh, branch: 'Swam the Flood', junction: 40 },
];

const IDS = ['theia', 'set', 'chang-e', 'gilgamesh'];
const NAMES = ['Theia', 'Set', "Chang'e", 'Gilgamesh'];

describe('Silver Cord Cup', () => {
  it('is four songs from The Silver Cord in album order, between the PetroDragonic Apocalypse and Phantom Island Cups, each with its own world and a lap and a final-lap song', () => {
    const k = CUPS.findIndex((c) => c.name === 'Silver Cord Cup');
    const cup = CUPS[k];
    expect(cup.id).toBe('silver-cord');
    expect(CUPS[k - 1].id).toBe('petrodragonic-apocalypse');
    expect(CUPS[k + 1].id).toBe('phantom-island');
    const defs = cup.tracks.map((t) => TRACK_LIST[t].build());
    expect(defs.map((d) => d.id)).toEqual(IDS);
    expect(cup.tracks.map((t) => TRACK_LIST[t].name)).toEqual(NAMES);
    expect(new Set(defs.map((d) => d.theme)).size).toBe(4);
    for (const d of defs) {
      expect(d.music.lap).toBe(d.id);
      expect(d.music.finalLap).toBe(`${d.id}-final-lap`);
      expect(TRACK_SONGS[d.id].album).toBe('The Silver Cord');
      expect(TRACK_SONGS[d.id].year).toBe(2023);
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
    expect(defs.map((d) => d.main.sections[0].surface)).toEqual(['silver', 'hieroglyph', 'jade', 'mudbrick']);
    const names = defs.map((d) => d.main.sections.map((s) => s.name).filter((n) => n !== 'Finish Straight'));
    const all = names.flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it("is laid out after its song: Theia's two orbits tangled in tiers, Set's tornado, Chang'e's knot on the Moon, Gilgamesh's thirteen winds", () => {
    const section = (def: TrackDef, name: string) => def.main.sections.find((s) => s.name === name)!;
    const theia = buildTheia();
    for (const n of ['The Glowing Thread', 'Higher Divine', 'Force of Destiny', 'Ticking Clock', 'Spiritual Rebirth', 'Fate Intertwined', 'The Impact', 'The Snap', 'Dance with Theia', 'Meet Our Maker', 'Mortal Coil', "Theia's Void", 'Gravitational Waves', 'Astral Beach']) expect(section(theia, n), n).toBeTruthy();
    // The orbits tangle and the road runs in tiers where it crosses itself: the Impact on a deck over the
    // Glowing Thread, and the Astral Beach on the top tier over the Impact.
    const t = new Track(theia);
    const over = (upper: string, lower: string) => {
      const a = section(theia, upper);
      const b = section(theia, lower);
      let closest = Infinity;
      let dy = 0;
      for (let s = a.from; s < a.to; s += 2) {
        const p = pointAt(t.spline, t.mainS(s));
        for (let q = b.from; q < b.to; q += 2) {
          const r = pointAt(t.spline, t.mainS(q));
          const d = Math.hypot(p.x - r.x, p.z - r.z);
          if (d < closest) {
            closest = d;
            dy = t.main.heightAtBuilder(s) - t.main.heightAtBuilder(q);
          }
        }
      }
      expect(closest, `${upper} over ${lower}`).toBeLessThan(3);
      return dy;
    };
    expect(over('The Impact', 'The Glowing Thread')).toBeGreaterThan(7);
    expect(over('Astral Beach', 'The Impact')).toBeGreaterThan(7);
    expect(over('Fate Intertwined', 'The Glowing Thread')).toBeGreaterThan(6);

    const set = buildSet();
    for (const n of ['Through the Desert', 'Snout of a Jackal', 'Tail of a Snake', 'Moonbeams', 'Quantum Foam', 'The Tornado', 'Thrown Around', 'Bones Did Shatter', 'Slay the Mighty Set', 'Day into Night', 'Eighty Years of Conflict', 'Hieroglyphic']) expect(section(set, n), n).toBeTruthy();
    // Lifted him high: the tornado climbs a full turn, to 14 m.
    const st = new Track(set);
    const tornado = section(set, 'The Tornado');
    expect(st.main.heightAtBuilder(tornado.to - 5)).toBeGreaterThan(12);
    // Day squeezed into night: the narrowest road on the lap.
    expect(Math.min(...set.main.sections.map((s) => s.halfWidth))).toBe(section(set, 'Day into Night').halfWidth);

    const moon = buildChangE();
    for (const n of ['Ten Suns', 'Scorching Sands', 'Cerebral Asteroids', 'The Jade Portal', 'Float in the Bright Night', 'Lyre of Lightning', 'Sailing the Moon-Sea', 'Astral Planes', 'Palace Amongst Stars', 'White Rabbit', 'Eclipse', 'Lonely Moon']) expect(section(moon, n), n).toBeTruthy();
    // On the Moon past the jade portal: its gravity, floating.
    expect(section(moon, 'Float in the Bright Night').gravity).toBeLessThan(1);
    // The lyre's five strings across the yoke, between its walls.
    const strings = moon.hazards.find((h) => h.kind === 'strings')!;
    const lyre = section(moon, 'Lyre of Lightning');
    expect('at' in strings && strings.at.length).toBe(5);
    for (const s of 'at' in strings ? strings.at : []) expect(s > lyre.from && s < lyre.to).toBe(true);
    // A trefoil knot: it crosses itself three times, one road over the other each time.
    const knot = crossings(new Track(moon));
    expect(knot.length).toBe(3);
    for (const dy of knot) expect(dy).toBeGreaterThan(6);

    const gil = buildGilgamesh();
    for (const n of ['Walls of Uruk', 'Fiery Temper', 'Shamash Combat', 'A Prayer from the Peaks', 'Glorious Photon', 'Bone-Dried Swamplands', 'The Scorpion Pass', 'Gemstone Trees', 'The Razorback', 'Thirteen Winds', 'Killed the Bull', 'Crossed the Sea', 'The Flood', 'Land of Bone', 'House of Dust']) expect(section(gil, n), n).toBeTruthy();
    // Thirteen winds: thirteen bends, each the other way from the last.
    const gt = new Track(gil);
    const winds = section(gil, 'Thirteen Winds');
    let bends = 0;
    let last = 0;
    for (let s = winds.from + 1; s < winds.to - 1; s += 1) {
      const i = Math.min(gt.main.spline.count - 1, Math.round((gt.mainS(s) / gt.main.spline.length) * gt.main.spline.count));
      const c = Math.sign(gt.main.curvature[i]);
      if (c && c !== last) {
        bends++;
        last = c;
      }
    }
    expect(bends).toBe(13);
    // Swam the flood: the shortcut dives under the water.
    const flood = gil.branches.find((b) => b.name === 'Swam the Flood')!;
    expect(Math.min(...flood.elevation.map(([, y]) => y))).toBeLessThan(-4);
    expect(flood.openOn).toBeUndefined();
  });

  it('runs each walled stretch with its own hazard across it, sunk below the ground', () => {
    const own: Record<string, string> = { theia: 'cords', set: 'sunMoon', 'chang-e': 'strings', gilgamesh: 'serpents' };
    for (const id of IDS) {
      const def = TRACK_LIST.find((t) => t.id === id)!.build();
      const track = new Track(def);
      const walled = def.main.sections.filter((s) => (s.wallHeight ?? 0) >= 5);
      expect(walled.length, id).toBeGreaterThanOrEqual(1);
      const at = def.hazards.filter((h) => h.kind === own[id]).flatMap((h) => ('at' in h ? h.at : []));
      for (const sec of walled) {
        expect(at.some((s) => s >= sec.from && s <= sec.to), `${id} ${sec.name}`).toBe(true);
        expect(track.main.heightAtBuilder((sec.from + sec.to) / 2), `${id} ${sec.name}`).toBeLessThan(-4);
      }
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
  { name: 'Theia', build: buildTheia, branch: 'The Silver Cord', open: { lap: 1, lastLap: false }, shut: { lap: 2, lastLap: true }, shutIs: 'fall' },
  { name: 'Set', build: buildSet, branch: 'The Tomb', open: { lap: 2, lastLap: false }, shut: { lap: 1, lastLap: false }, shutIs: 'fall' },
  { name: "Chang'e", build: buildChangE, branch: 'Riding on Moonbeams', open: { lap: 3, lastLap: true }, shut: { lap: 2, lastLap: false }, shutIs: 'fall' },
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
  it('a silver cord across the road slings you on while it is taut, frays, snaps and lashes back: lashed, you spin', () => {
    const h = new HazardSystem(new Track(buildTheia()));
    const taut = hazardWhen(h, 'cords', (q) => q.phase < CORD_STAGES.fray - 0.02);
    const slung = kartAt(taut);
    slung.speed = 20;
    expect(h.collide([slung], PHYSICS_DT)[0]).toMatchObject({ by: 'cords', good: true });
    expect(slung.boostTime).toBeCloseTo(CORD_BOOST);
    // Right across the road: at either edge too.
    for (const lat of [taut.radius - 2, -(taut.radius - 2)]) {
      const k = aside(taut, lat);
      expect(h.collide([k], PHYSICS_DT)[0], `${lat}`).toMatchObject({ by: 'cords', good: true });
    }
    // Fraying: the warning, harmless.
    const fraying = hazardWhen(h, 'cords', (q) => q.phase >= CORD_STAGES.fray + 0.01 && q.phase < CORD_STAGES.snap - 0.02);
    expect(h.collide([kartAt(fraying)], PHYSICS_DT)).toEqual([]);
    const lashing = hazardWhen(h, 'cords', (q) => q.phase >= CORD_STAGES.snap + 0.01 && q.phase < CORD_STAGES.lash - 0.01);
    expect(lashing.active).toBe(true);
    const lashed = kartAt(lashing);
    lashed.speed = 20;
    expect(h.collide([lashed], PHYSICS_DT)[0]).toMatchObject({ by: 'cords' });
    expect(lashed.spinTime).toBeGreaterThan(0);
    // Snapped and gone, then spun anew: nothing there.
    const gone = hazardWhen(h, 'cords', (q) => q.phase >= CORD_STAGES.lash + 0.02 && q.phase < 0.98);
    expect(h.collide([kartAt(gone)], PHYSICS_DT)).toEqual([]);
  });

  it("Set's two eyes roll across the road past each other: the sun scorches and spins you, the moon is a moonbeam boost", () => {
    const h = new HazardSystem(new Track(buildSet()));
    const p = hazardWhen(h, 'sunMoon', (q) => Math.abs(q.gap) > 6);
    const scorched = kartAt(p);
    scorched.speed = 20;
    expect(h.collide([scorched], PHYSICS_DT)[0]).toMatchObject({ by: 'sunMoon' });
    expect(scorched.spinTime).toBeGreaterThan(0);
    expect(scorched.speed).toBeLessThanOrEqual(20 * SUN_SLOW);
    // The moon: the other side of the road's centre.
    const moonbeam = aside({ ...p, x: p.ax, z: p.az }, -p.gap);
    expect(h.collide([moonbeam], PHYSICS_DT)[0]).toMatchObject({ by: 'sunMoon', good: true });
    expect(moonbeam.boostTime).toBeCloseTo(MOON_BOOST);
    expect(moonbeam.spinTime).toBe(0);
    // Each rolls right across the road, both ways.
    let most = 0;
    let least = 0;
    for (let t = 0; t < 10; t += 0.02) {
      h.update(t);
      const q = h.poses.find((r) => r.kind === 'sunMoon')!;
      [most, least] = [Math.max(most, q.gap), Math.min(least, q.gap)];
    }
    expect(most).toBeGreaterThan(8);
    expect(least).toBeLessThan(-8);
  });

  it("the lyre's lightning strings are plucked one after another: a bolt as it's plucked spins you, the hum after is a boost", () => {
    const def = buildChangE();
    const h = new HazardSystem(new Track(def));
    const dark = hazardWhen(h, 'strings', (q) => q.phase > STRING_STAGES.fade + 0.02);
    expect(h.collide([kartAt(dark)], PHYSICS_DT)).toEqual([]);
    const plucked = hazardWhen(h, 'strings', (q) => q.phase >= STRING_STAGES.pluck + 0.005 && q.phase < STRING_STAGES.hum - 0.01);
    expect(plucked.active).toBe(true);
    const zapped = kartAt(plucked);
    zapped.speed = 20;
    expect(h.collide([zapped], PHYSICS_DT)[0]).toMatchObject({ by: 'strings' });
    expect(zapped.spinTime).toBeGreaterThan(0);
    const humming = hazardWhen(h, 'strings', (q) => q.phase >= STRING_STAGES.hum + 0.01 && q.phase < STRING_STAGES.fade - 0.02);
    const rode = kartAt(humming);
    expect(h.collide([rode], PHYSICS_DT)[0]).toMatchObject({ by: 'strings', good: true });
    expect(rode.boostTime).toBeCloseTo(STRING_BOOST);
    // An arpeggio: each string a step behind the one before it, along the road.
    h.update(3);
    const row = h.poses.filter((q) => q.kind === 'strings');
    for (let k = 1; k < row.length; k++) {
      const lag = (((row[k - 1].phase - row[k].phase) % 1) + 1) % 1;
      expect(lag).toBeCloseTo(STRING_LAG, 5);
    }
  });

  it('the plant of immortality grows up through the road and the snake comes for it: reach it first for a long boost; the snake bites, unless hopped', () => {
    const h = new HazardSystem(new Track(buildGilgamesh()));
    const growing = hazardWhen(h, 'serpents', (q) => q.lane === 1 && q.phase > SERPENT_STAGES.slither);
    const road = growing.heading + (growing.side * Math.PI) / 2;
    const atPlant = createKartState(growing.ax - Math.cos(road) * growing.gap, growing.az + Math.sin(road) * growing.gap, road);
    atPlant.y = atPlant.groundY = growing.ground;
    expect(h.collide([atPlant], PHYSICS_DT)[0]).toMatchObject({ by: 'serpents', good: true });
    expect(atPlant.boostTime).toBeCloseTo(PLANT_BOOST);
    const slithering = hazardWhen(h, 'serpents', (q) => q.active);
    const bitten = kartAt(slithering);
    bitten.speed = 15;
    expect(h.collide([bitten], PHYSICS_DT)[0]).toMatchObject({ by: 'serpents' });
    expect(bitten.spinTime).toBeGreaterThan(0);
    const hopped = kartAt(slithering);
    hopped.hopAge = 0;
    expect(h.collide([hopped], PHYSICS_DT)[0]).toMatchObject({ by: 'serpents', good: true });
    expect(hopped.boostTime).toBeCloseTo(HOP_BOOST);
    // Once the snake has reached it, the plant is gone.
    const eaten = hazardWhen(h, 'serpents', (q) => q.active && q.lane === 0 && q.phase > SERPENT_STAGES.slither + 0.05);
    const late = createKartState(eaten.ax - Math.cos(eaten.heading + (eaten.side * Math.PI) / 2) * eaten.gap, eaten.az + Math.sin(eaten.heading + (eaten.side * Math.PI) / 2) * eaten.gap, 0);
    late.y = late.groundY = eaten.ground;
    const got = h.collide([late], PHYSICS_DT).filter((e) => e.good);
    expect(got).toEqual([]);
  });
});

/** Where the main road crosses itself: for each crossing, the least height between the two roads there. */
function crossings(track: Track): number[] {
  const sp = track.spline;
  const found: { i: number; j: number; dy: number }[] = [];
  for (let i = 0; i < sp.count; i += 4) {
    for (let j = i; j < sp.count; j += 4) {
      const along = sp.dist[j] - sp.dist[i];
      if (Math.min(along, sp.length - along) < 120) continue;
      if (Math.hypot(sp.px[i] - sp.px[j], sp.pz[i] - sp.pz[j]) > 4) continue;
      const dy = Math.abs(track.main.heightAt(sp.dist[i]) - track.main.heightAt(sp.dist[j]));
      const near = found.find((c) => Math.abs(sp.dist[c.i] - sp.dist[i]) < 60 && Math.abs(sp.dist[c.j] - sp.dist[j]) < 60);
      if (near) near.dy = Math.min(near.dy, dy);
      else found.push({ i, j, dy });
    }
  }
  return found.map((c) => c.dy);
}

/** A kart sitting on a hazard's line across the road, `lateral` metres to the right of the hazard's pose. */
function aside(p: HazardPose, lateral: number): KartState {
  const k = kartAt(p);
  k.x += -Math.cos(p.heading) * lateral;
  k.z += Math.sin(p.heading) * lateral;
  return k;
}

/** How high and low each road runs: a climb to a crest and a dip below ground. */
const HEIGHTS: { name: string; build: () => TrackDef; top: number; bottom: number }[] = [
  { name: 'Theia', build: buildTheia, top: 9, bottom: -5 },
  { name: 'Set', build: buildSet, top: 13, bottom: -5 },
  { name: "Chang'e", build: buildChangE, top: 9, bottom: -7 },
  { name: 'Gilgamesh', build: buildGilgamesh, top: 12, bottom: -5 },
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
