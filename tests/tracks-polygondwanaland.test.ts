import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { FUZZ_BOOST } from '../src/items/items';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import {
  CRUSHER_SLOW, CRUSHER_STAGES, GUST_BOOST, GUST_SHOVE, HazardSystem, PRISM_BOOST, SHOCKWAVE_BOOST, VESICLE_BOUNCE, VESICLE_SLOW, prismColour, type HazardPose,
} from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams, type EngineClass } from '../src/physics/racers';
import { TRACK_SONGS, TRANSCRIBED } from '../src/audio/songs';
import { buildCastleInTheAir } from '../src/tracks/castleInTheAir';
import { buildCrumblingCastle } from '../src/tracks/crumblingCastle';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { buildInnerCell } from '../src/tracks/innerCell';
import { buildTetrachromacy } from '../src/tracks/tetrachromacy';
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
  { name: 'Crumbling Castle', build: buildCrumblingCastle, branch: 'The Breach', junction: 40, lap: { lap: 2, lastLap: false } },
  { name: 'The Castle in the Air', build: buildCastleInTheAir, branch: 'Cloud Bridge', junction: 40, lap: { lap: 2, lastLap: false } },
  { name: 'Inner Cell', build: buildInnerCell, branch: 'Nuclear Pore', junction: 40 },
  { name: 'Tetrachromacy', build: buildTetrachromacy, branch: 'Ultraviolet', junction: 40, lap: { lap: 3, lastLap: true } },
];

describe('Polygondwanaland Cup', () => {
  it('is four new tracks in album order, each with its own world and a lap and a final-lap song', () => {
    const cup = CUPS.find((c) => c.name === 'Polygondwanaland Cup')!;
    expect(cup.tracks).toHaveLength(4);
    const defs = cup.tracks.map((t) => TRACK_LIST[t].build());
    expect(defs.map((d) => d.id)).toEqual(['crumbling-castle', 'castle-in-the-air', 'inner-cell', 'tetrachromacy']);
    expect(new Set(defs.map((d) => d.theme)).size).toBe(4);
    for (const d of defs) {
      expect(d.music.lap).toBe(d.id);
      expect(d.music.finalLap).toBe(`${d.id}-final-lap`);
      expect(TRACK_SONGS[d.id].album).toBe('Polygondwanaland');
    }
  });

  it('plays Crumbling Castle on Crumbling Castle, and the title song on Polygondwanaland Jungle', () => {
    expect(TRACK_SONGS['crumbling-castle'].title).toBe('Crumbling Castle');
    expect(TRANSCRIBED['crumbling-castle'].recording).toBe('Crumbling Castle');
    expect(TRACK_SONGS['polygondwanaland-jungle'].title).toBe('Polygondwanaland');
    expect(TRANSCRIBED['polygondwanaland-jungle']).toBeUndefined();
  });
});

describe('Crumbling Castle: the castle from the N64', () => {
  const def = buildCrumblingCastle();
  const names = def.main.sections.map((s) => s.name);

  it('goes in at the gate, down a hall of crushers, up the stair to the garden and down through the galleries and the dungeon', () => {
    const order = ['Drawbridge', 'Moat Bridge', 'Thwomp Hall', 'Crooked Corridor', 'Great Hall', 'Grand Stair', 'Castle Garden', 'Lava Galleries', 'Dungeon', 'Lava Walk', 'The Leap'];
    const at = order.map((n) => names.indexOf(n));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('walls its halls in like a castle', () => {
    for (const n of ['Thwomp Hall', 'Great Hall', 'Lava Galleries', 'Dungeon']) expect(def.main.sections.find((s) => s.name === n)!.wallHeight).toBeGreaterThanOrEqual(5);
  });

  it('has the upper floor 10 m up, and crushers down the halls', () => {
    const track = new Track(def);
    const garden = def.main.sections.find((s) => s.name === 'Castle Garden')!;
    expect(track.main.heightAtBuilder((garden.from + garden.to) / 2)).toBeCloseTo(10, 1);
    const crushers = def.hazards.filter((h) => h.kind === 'crushers').flatMap((h) => ('at' in h ? h.at : []));
    expect(crushers.length).toBeGreaterThanOrEqual(5);
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
  { name: 'Crumbling Castle', build: buildCrumblingCastle, branch: 'The Breach', open: { lap: 2, lastLap: false }, shut: { lap: 1, lastLap: false }, shutIs: 'barred' },
  { name: 'The Castle in the Air', build: buildCastleInTheAir, branch: 'Cloud Bridge', open: { lap: 2, lastLap: false }, shut: { lap: 3, lastLap: true }, shutIs: 'fall' },
  { name: 'Inner Cell', build: buildInnerCell, branch: 'Nuclear Pore', open: { lap: 1, lastLap: false }, shut: { lap: 3, lastLap: true }, shutIs: 'barred' },
  { name: 'Tetrachromacy', build: buildTetrachromacy, branch: 'Ultraviolet', open: { lap: 3, lastLap: true }, shut: { lap: 2, lastLap: false }, shutIs: 'fall' },
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
  const crusherAt = (h: HazardSystem, ok: (u: number) => boolean) => hazardWhen(h, 'crushers', (q) => ok(q.phase));
  const C = CRUSHER_STAGES;

  it('a crusher slamming down squashes a kart under it: spun out and slowed', () => {
    const h = new HazardSystem(new Track(buildCrumblingCastle()));
    const p = crusherAt(h, (u) => u >= C.slam && u < C.landed);
    const under = kartAt(p);
    under.speed = 20;
    expect(h.collide([under], PHYSICS_DT)[0]).toMatchObject({ by: 'crushers' });
    expect(under.spinTime).toBeGreaterThan(0);
    expect(under.speed).toBeCloseTo(20 * CRUSHER_SLOW);
  });

  it('hanging, it misses; landed, it is a block you bump off; its shockwave throws a kart just past it on, on a boost', () => {
    const h = new HazardSystem(new Track(buildCrumblingCastle()));
    const hanging = crusherAt(h, (u) => u < C.shake);
    expect(h.collide([kartAt(hanging)], PHYSICS_DT)).toEqual([]);
    const down = crusherAt(h, (u) => u > C.landed + 0.05 && u < C.rise);
    const bumped = kartAt(down);
    bumped.x += 1;
    expect(h.collide([bumped], PHYSICS_DT)).toEqual([]);
    expect(bumped.spinTime).toBe(0);
    expect(Math.hypot(bumped.x - down.x, bumped.z - down.z)).toBeGreaterThan(down.radius);
    const landing = crusherAt(h, (u) => u >= C.landed && u < C.landed + 0.02);
    // 1 m past its edge, up the road.
    const ahead = kartAt(landing);
    ahead.x += Math.sin(landing.heading) * (landing.radius + 1.5);
    ahead.z += Math.cos(landing.heading) * (landing.radius + 1.5);
    expect(h.collide([ahead], PHYSICS_DT)[0]).toMatchObject({ by: 'crushers', good: true });
    expect(ahead.boostTime).toBeCloseTo(SHOCKWAVE_BOOST);
    // The same distance behind it, coming up to it: nothing.
    const h2 = new HazardSystem(new Track(buildCrumblingCastle()));
    const landing2 = crusherAt(h2, (u) => u >= C.landed && u < C.landed + 0.02);
    const behind = kartAt(landing2);
    behind.x -= Math.sin(landing2.heading) * (landing2.radius + 1.5);
    behind.z -= Math.cos(landing2.heading) * (landing2.radius + 1.5);
    expect(h2.collide([behind], PHYSICS_DT)).toEqual([]);
  });

  it('a gust shoves you across the road, one way and then the other, unless you hop and catch the wind', () => {
    const track = new Track(buildCastleInTheAir());
    const h = new HazardSystem(track);
    const sides = new Set<number>();
    for (let t = 0; t < 20; t += 0.05) {
      h.update(t);
      for (const q of h.poses) if (q.kind === 'gusts' && q.active) sides.add(q.side);
    }
    expect([...sides].sort()).toEqual([-1, 1]);
    const p = hazardWhen(h, 'gusts', (q) => q.active);
    const shoved = kartAt(p);
    expect(h.collide([shoved], PHYSICS_DT)[0]).toMatchObject({ by: 'gusts' });
    // To the road's right (-tz, tx) for a gust blowing that way.
    const along = shoved.extX * -Math.cos(p.heading) + shoved.extZ * Math.sin(p.heading);
    expect(along * p.side).toBeCloseTo(GUST_SHOVE);
    expect(shoved.spinTime).toBe(0);
    const hopped = kartAt(p);
    hopped.hopAge = 0.1;
    expect(h.collide([hopped], PHYSICS_DT)[0]).toMatchObject({ by: 'gusts', good: true });
    expect(hopped.boostTime).toBeCloseTo(GUST_BOOST);
    expect(hopped.extX).toBe(0);
  });

  it('a vesicle bounces a kart that drives into it back, and one that hops onto it up high', () => {
    const h = new HazardSystem(new Track(buildInnerCell()));
    const p = hazardWhen(h, 'vesicles', () => true);
    const driven = kartAt(p);
    driven.speed = 20;
    expect(h.collide([driven], PHYSICS_DT)[0]).toMatchObject({ by: 'vesicles' });
    expect(driven.speed).toBeCloseTo(20 * VESICLE_SLOW);
    expect(driven.spinTime).toBe(0);
    const hopped = kartAt(p);
    hopped.hopAge = 0.1;
    expect(h.collide([hopped], PHYSICS_DT)[0]).toMatchObject({ by: 'vesicles', good: true });
    expect(hopped.vy).toBe(VESICLE_BOUNCE);
    expect(hopped.grounded).toBe(false);
  });

  it('a prism beam spins you out in red, green and blue, and is a boost in the fourth colour', () => {
    const h = new HazardSystem(new Track(buildTetrachromacy()));
    const seen = new Set<number>();
    for (let t = 0; t < 20; t += 0.02) {
      h.update(t);
      for (const q of h.poses) if (q.kind === 'prisms' && q.active) seen.add(prismColour(q.phase).colour);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    const red = hazardWhen(h, 'prisms', (q) => q.active && prismColour(q.phase).colour === 0);
    const hit = kartAt(red);
    expect(h.collide([hit], PHYSICS_DT)[0]).toMatchObject({ by: 'prisms' });
    expect(hit.spinTime).toBeGreaterThan(0);
    const uv = hazardWhen(h, 'prisms', (q) => q.active && prismColour(q.phase).colour === 3);
    const boosted = kartAt(uv);
    expect(h.collide([boosted], PHYSICS_DT)[0]).toMatchObject({ by: 'prisms', good: true });
    expect(boosted.boostTime).toBeCloseTo(PRISM_BOOST);
    expect(boosted.spinTime).toBe(0);
    const dark = hazardWhen(h, 'prisms', (q) => !q.active);
    expect(h.collide([kartAt(dark)], PHYSICS_DT)).toEqual([]);
  });
});

/** How high and low each road runs: a climb to a crest and a dip below ground (none on the abyss, which has no ground). */
const HEIGHTS: { name: string; build: () => TrackDef; top: number; bottom: number }[] = [
  { name: 'Crumbling Castle', build: buildCrumblingCastle, top: 9, bottom: -4 },
  { name: 'The Castle in the Air', build: buildCastleInTheAir, top: 18, bottom: -4 },
  { name: 'Inner Cell', build: buildInnerCell, top: 12, bottom: -4 },
  { name: 'Tetrachromacy', build: buildTetrachromacy, top: 13, bottom: -4 },
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
