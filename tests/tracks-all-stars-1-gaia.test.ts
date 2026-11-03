import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { BREATH_BOOST, BREATH_DEPTH, BREATH_RISE, BREATH_SINK, BREATH_SLOW, BREATH_STAGES, BREATH_WOBBLE, HazardSystem, breathLift, breathPhase, isSheet, type HazardPose } from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { BREATH_PERIOD, DEPTH, GOD, PHOTON, RAINBOW_ARCH, RIB, buildGaia } from '../src/tracks/gaia';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildGaia();
const track = new Track(def);
const main = track.main;
/** A section by name: a name the road keeps across a deck is one section, from where it starts to where it ends. */
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];
const ELEMENTS = ['I Am the Stream', 'I Am Wind', 'I Am Rain', 'I Am Photon', 'I Am Wave'];

describe('Gaia', () => {
  it("is the All Stars Cup #1's fourth and last, on the Earth's own skin", () => {
    const cup = CUPS.find((c) => c.id === 'all-stars-1')!;
    expect(TRACK_LIST[cup.tracks[3]].id).toBe('gaia');
    expect(cup.tracks.length).toBe(4);
    expect(TRACK_SONGS.gaia.title).toBe('Gaia');
    expect(def.theme).toBe('gaia');
    expect(def.music).toEqual({ lap: 'gaia', finalLap: 'gaia-final-lap' });
    for (const s of def.main.sections) expect(s.surface, s.name).toBe('earth');
    // The Lucky Rainbow is a rainbow.
    for (const s of def.branches.flatMap((b) => b.sections)) expect(s.surface, s.name).toBe('rainbow');
  });

  it('runs through the song in order, from I am the one to no one sees', () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      'I Am the One',
      'I Am Nobody',
      'I Am God',
      'I Am You, I Am Me',
      'I Am Gaia',
      'Giant Body Parasite',
      'Gaia Lives While Others Die',
      'I Am the Two',
      ...ELEMENTS,
      'Gaia Sees',
      'Gaia Breathes',
      "Gaia's Needs Incomplete",
      'Gaia Bequeaths',
      'Dirt Is Deceased',
      'Gaia Dies',
      'No One Sees',
    ]);
    const length = track.length;
    console.log(`Gaia: ${length.toFixed(0)} m a lap`);
    // Three laps a race, the length of the cup's others.
    expect(length).toBeGreaterThan(2400);
    expect(length).toBeLessThan(2750);
    expect(def.laps).toBe(3);
  });

  it('crosses itself in tiers: I Am Gaia on a deck across her heart over her breathing chest, and the start over the dead earth', () => {
    const over = crossings(track);
    const pairs = new Set(over.map((c) => `${c.upper} over ${c.lower}`));
    expect([...pairs].sort()).toEqual(['I Am Gaia over Gaia Breathes', 'I Am Nobody over Dirt Is Deceased'].sort());
    for (const c of over) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(6);
      expect(sectionAt(c.upperS).bridge, c.upper).toBe(true);
    }
    const heart = over.find((q) => q.upper === 'I Am Gaia')!;
    expect(heart.upperY).toBeCloseTo(GOD, 0);
    expect(heart.lowerY).toBeCloseTo(0, 0);
    const dead = over.find((q) => q.lower === 'Dirt Is Deceased')!;
    expect(dead.upperY).toBeCloseTo(0, 0);
    expect(dead.lowerY).toBeLessThan(-DEPTH + 0.5);
    expect(def.landmarks.some((l) => l.kind === 'gaiaHeart')).toBe(true);
  });

  it('climbs round her hip to I Am God, and flies off the crest of I Am Gaia down her flank', () => {
    const god = section('I Am God');
    expect(main.heightAtBuilder(god.from)).toBeCloseTo(0, 1);
    expect(main.heightAtBuilder(god.to)).toBeCloseTo(GOD, 1);
    for (let s = god.from; s < god.to - 1; s += 1) expect(main.heightAtBuilder(s + 1)).toBeGreaterThanOrEqual(main.heightAtBuilder(s) - 1e-6);
    for (let s = section('I Am You, I Am Me').from; s < section('I Am You, I Am Me').to; s += 2) expect(main.heightAtBuilder(s)).toBeCloseTo(GOD, 1);
    expect(main.heightAtBuilder(section('Giant Body Parasite').from)).toBeCloseTo(0, 1);
  });

  it('bulges out round her hair through the elements in the order she names them, up into the light and down the wave', () => {
    expect(main.heightAtBuilder(section('I Am the Stream').to)).toBeCloseTo(0, 1);
    const photon = section('I Am Photon');
    for (let s = photon.from; s <= photon.to; s += 2) expect(main.heightAtBuilder(s)).toBeCloseTo(PHOTON, 1);
    const wave = section('I Am Wave');
    expect(main.heightAtBuilder(wave.to)).toBeCloseTo(0, 1);
    // The wave rolls: down, up over a swell, and down again.
    let rises = 0;
    for (let s = wave.from + 2; s < wave.to; s += 2) if (main.heightAtBuilder(s) > main.heightAtBuilder(s - 2) + 0.05) rises++;
    expect(rises).toBeGreaterThan(2);
    expect(def.landmarks.some((l) => l.kind === 'elements')).toBe(true);
  });

  it("gaia's needs incomplete: the road torn open, a leap a 100cc kart at full speed clears", () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const needs = section("Gaia's Needs Incomplete");
    expect(a > needs.from && z < needs.to).toBe(true);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });

  it('sinks Dirt Is Deceased into dead earth under the start, walled, and nothing else is sunk', () => {
    const cut = section('Dirt Is Deceased');
    let sunk = 0;
    for (let s = cut.from; s < cut.to; s += 2) if (main.heightAtBuilder(s) < -DEPTH + 0.5) sunk += 2;
    expect(sunk / (cut.to - cut.from)).toBeGreaterThan(0.3);
    const sp = main.spline;
    for (let k = 0; k < sp.count; k++) {
      if (!main.cut[k]) continue;
      expect(['Dirt Is Deceased', 'Gaia Dies']).toContain(sectionAt(main.toBuilder(sp.dist[k])).name);
      expect(main.wallHeight[k]).toBeGreaterThan(-main.heightAt(sp.dist[k]));
    }
    expect(def.landmarks.some((l) => l.kind === 'deadEarth')).toBe(true);
  });

  it('starts between her hands, and has her face, her parasites and the Lucky Rainbow', () => {
    expect(def.landmarks.filter((l) => l.s < 20 && l.ribbon === -1).map((l) => l.kind)).toEqual(['gaiaHands']);
    const face = def.landmarks.find((l) => l.kind === 'gaiaFace')!;
    // Her face lies in the land round her head, well clear of the road.
    const p = pointAt(track.spline, track.mainS(face.s));
    const fx = p.x - p.tz * face.lateral!;
    const fz = p.z + p.tx * face.lateral!;
    expect(nearestOnSpline(track.spline, fx, fz).distance).toBeGreaterThan(45);
    expect(def.landmarks.some((l) => l.kind === 'parasites')).toBe(true);
  });
});

describe('The Lucky Rainbow, straight across the elements on the light through the rain', () => {
  const k = def.branches.findIndex((b) => b.name === 'Lucky Rainbow');
  const bdef = def.branches[k];
  const branch = track.branches[k];
  const open: LapContext = { lap: 2, lastLap: false };

  it('leaves at the stream and meets the main road again at the foot of the wave, at the same pose', () => {
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
      expect(Math.abs(main.heightAtBuilder(s) - branch.heightAt(s === bdef.mainFrom ? 0 : branch.spline.length))).toBeLessThan(0.05);
    }
    for (const end of [bdef.sections[0], bdef.sections[bdef.sections.length - 1]]) expect(end.wallHeight ?? 0).toBe(0);
    for (const s of [bdef.mainFrom, bdef.mainTo]) expect(def.main.sections.filter((q) => s >= q.from && s <= q.to).every((q) => (q.wallHeight ?? 0) === 0)).toBe(true);
    expect(sectionAt(bdef.mainFrom + 1).name).toBe('I Am the Stream');
    expect(sectionAt(bdef.mainTo - 1).name).toBe('I Am Wave');
    expect(def.landmarks.some((l) => l.kind === 'luckyRainbow' && l.ribbon === k)).toBe(true);
  });

  it('arches over the gorge, clear of the main road and in bounds', () => {
    const sp = branch.spline;
    let top = 0;
    for (let s = 0; s < sp.length; s += 1) top = Math.max(top, branch.heightAt(s));
    expect(top).toBeCloseTo(RAINBOW_ARCH, 0);
    const drop = def.pits.find((p) => inPit(p, sp.px[Math.floor(sp.count * 0.5)], sp.pz[Math.floor(sp.count * 0.5)]))!;
    expect(drop).toBeDefined();
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 40 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 40 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(4);
    }
    const msp = main.spline;
    const fx = Math.sin(drop.heading);
    const fz = Math.cos(drop.heading);
    for (let i = 0; i < msp.count; i++) {
      const dx = msp.px[i] - drop.x;
      const dz = msp.pz[i] - drop.z;
      const along = Math.max(0, Math.abs(dx * fx + dz * fz) - drop.halfLength);
      const across = Math.max(0, Math.abs(-dx * fz + dz * fx) - drop.halfWidth);
      expect(Math.hypot(along, across) - main.halfWidth[i]).toBeGreaterThan(2);
    }
  });

  it('puts a double item box over the gorge', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('is there from lap 2: on the first, drive on and you fall into the gorge', () => {
    expect(bdef.openOn).toEqual([2, 'final']);
    const p = kartParams(first.stats, '150cc');
    expect(drive(branch, bdef.mainTo, p, undefined, open).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 3, lastLap: true }).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 1, lastLap: false }).fell).toBe(true);
  });

  it('saves 0.8 to 2.5 s at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p, undefined, open);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, open);
    console.log(`Gaia: the Lucky Rainbow ${via.time.toFixed(2)} s, round the elements ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.8);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('Gaia elevation and driving', () => {
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);
  const ramps = (b: number) => lips.some((l) => b > l - 9 && b < l + 2) || def.main.gaps.some(([a, z]) => b > a - 20 && b < z + 2);

  it('has two kickers at the start that launch a kart at 100cc and land it on the road', () => {
    expect(lips.length).toBe(2);
    const start = def.main.sections[0];
    const p = kartParams(first.stats, '100cc');
    for (const lip of lips) {
      expect(lip > start.from && lip < start.to).toBe(true);
      const s0 = track.mainS(Math.max(0, lip - 7 - 15));
      const pt = pointAt(track.spline, s0);
      const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
      kart.y = kart.groundY = main.heightAt(s0);
      kart.speed = p.topSpeed;
      let launched = false;
      let landed = false;
      let progress = s0;
      for (let t = 0; t < 4 && !landed; t += PHYSICS_DT) {
        const ev = stepKart(kart, steerAlong(main, kart, progress), p, track, PHYSICS_DT);
        progress = nearestOnSpline(track.spline, kart.x, kart.z).s;
        launched ||= ev.launched;
        landed = launched && kart.grounded;
        expect(fallen(kart)).toBe(false);
      }
      expect(launched, `kicker at ${lip.toFixed(0)}`).toBe(true);
      expect(landed).toBe(true);
      expect(track.locate(kart.x, kart.z, kart.y).onRoad).toBe(true);
    }
  });

  it('keeps its cut clear of pits, so the ground opens cleanly round it', () => {
    expect(main.cut.some((x) => x > 0)).toBe(true);
    const sp = main.spline;
    for (let i = 0; i < sp.count; i++) {
      if (!main.cut[i]) continue;
      const near = def.pits.some((p) => inPit({ ...p, halfLength: p.halfLength + 6, halfWidth: p.halfWidth + 6 }, sp.px[i], sp.pz[i]));
      expect(near, `cut at ${main.toBuilder(sp.dist[i]).toFixed(0)}`).toBe(false);
    }
  });

  it('never runs downhill so steeply that a kart at full speed skips off it, nor climbs any steeper', () => {
    for (let s = 0; s + 1 < heights.length; s++) {
      const b = main.toBuilder(s);
      if (ramps(b)) continue;
      expect(Math.abs(heights[s] - heights[s + 1]), `at ${b.toFixed(0)}`).toBeLessThan(0.45);
    }
  });

  it('gives a fast kart airtime off I Am Gaia and over the wave, and laps it at 150cc with no falls', () => {
    const race = new Race(track);
    const kart = race.addKart(RACERS[0], '150cc', null);
    race.time = 0;
    let respawns = 0;
    const crests: number[] = [];
    const ribs = def.hazards.flatMap((q) => ('at' in q ? q.at : []));
    for (let t = 0; t < 200 && kart.laps.lap < 1; t += PHYSICS_DT) {
      const s = kart.state;
      const ev = race.step(PHYSICS_DT, [steerAlong(main, s, kart.progressS)])[0];
      if (kart.respawned) respawns++;
      const b = main.toBuilder(kart.progressS);
      if (ev.launched && !lips.some((l) => Math.abs(b - l) < 6) && !def.main.gaps.some(([a, z]) => b > a - 4 && b < z + 4) && !ribs.some((r) => Math.abs(b - r) < 10)) crests.push(b);
    }
    console.log(`Gaia: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const gaia = section('I Am Gaia');
    const wave = section('I Am Wave');
    expect(crests.some((b) => b > gaia.from && b < gaia.to)).toBe(true);
    expect(crests.some((b) => b > section('I Am Photon').from && b < wave.to)).toBe(true);
  }, 30000);

  it('a full field of 150cc CPUs laps it, the leader in about a minute and five seconds a lap', () => {
    const race = new Race(track);
    for (const r of RACERS.slice(0, 8)) race.addKart(r, '150cc', CPU_SKILL['150cc']);
    let respawns = 0;
    let t = 0;
    let leader = Infinity;
    for (; t < 400 && race.karts.some((k) => k.laps.lap < def.laps); t += PHYSICS_DT) {
      race.step(PHYSICS_DT, []);
      respawns += race.karts.filter((k) => k.respawned).length;
      if (leader === Infinity && race.karts.some((k) => k.laps.lap >= def.laps)) leader = t;
    }
    console.log(`Gaia: the leader home in ${leader.toFixed(1)} s (${(leader / def.laps).toFixed(1)} s a lap), the last in ${t.toFixed(1)} s, ${respawns} respawns`);
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(def.laps);
    expect(respawns).toBeLessThanOrEqual(2 * def.laps);
    expect(leader / def.laps).toBeGreaterThan(60);
    expect(leader / def.laps).toBeLessThan(70);
  }, 120000);
});

describe("breaths: Gaia's ribs heaving under the road, all in one breath", () => {
  const h = new HazardSystem(track);
  const q = def.hazards.find((d) => d.kind === 'breaths')!;
  const rows = () => h.poses.filter((p) => p.kind === 'breaths');

  it("heave across her chest, on Gaia Breathes, before the deck", () => {
    expect(def.hazards.length).toBe(1);
    if (!('at' in q) || !('period' in q)) throw new Error('no ribs');
    expect(q.at.length).toBe(3);
    for (const s of q.at) expect(sectionAt(s).name).toBe('Gaia Breathes');
    expect(q.period).toBe(BREATH_PERIOD);
    expect(isSheet('breaths')).toBe(true);
    // Clear of the deck over the chest.
    const heart = crossings(track).find((c) => c.upper === 'I Am Gaia')!;
    for (const s of q.at) expect(Math.abs(s - heart.lowerS)).toBeGreaterThan(40);
  });

  it("are a fast kart's breath apart, so one that meets the first as it rises meets them all so", () => {
    if (!('at' in q)) throw new Error('no ribs');
    const fast = kartParams(first.stats, '150cc').topSpeed;
    const apart = track.mainS(q.at[1]) - track.mainS(q.at[0]);
    expect(apart / BREATH_PERIOD).toBeGreaterThan(0.85 * fast);
    expect(apart / BREATH_PERIOD).toBeLessThan(1.1 * fast);
    expect(RIB / BREATH_PERIOD).toBeGreaterThan(0.85 * fast);
    // All in one breath.
    for (const t of [0, 1.3, 7.7]) {
      h.update(t);
      const u = rows().map((p) => p.phase);
      expect(new Set(u.map((x) => x.toFixed(6))).size).toBe(1);
      expect(u[0]).toBeCloseTo(breathPhase(t, BREATH_PERIOD), 6);
    }
  });

  it('swell as she breathes in, hold, sink right through the road as she breathes out, and fill again', () => {
    const B = BREATH_STAGES;
    expect(breathLift(B.inhale / 2)).toBe(0);
    expect(breathLift(B.full + 0.01)).toBeCloseTo(BREATH_RISE, 6);
    expect(breathLift(B.empty - 1e-6)).toBeCloseTo(-BREATH_SINK, 3);
    expect(breathLift(0.9999)).toBeCloseTo(0, 2);
    for (let u = 0; u < 1; u += 0.01) expect(Math.abs(breathLift(u + 0.01) - breathLift(u))).toBeLessThan(0.6);
    // At rest: nothing.
    const p = when(h, (x) => x.phase < B.inhale - 0.02);
    expect(p.active).toBe(false);
    expect(p.lane).toBe(0);
    expect(h.collide([kartAt(p)], PHYSICS_DT)).toEqual([]);
  });

  it('over a rib as it rises, it throws you on: up, and a boost', () => {
    const p = when(h, (x) => x.lane === 1 && x.phase > BREATH_STAGES.full - 0.1);
    const kart = kartAt(p, 2);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'breaths', good: true });
    expect(kart.boostTime).toBeCloseTo(BREATH_BOOST);
    expect(kart.grounded).toBe(false);
    expect(kart.vy).toBeGreaterThan(5);
    expect(kart.speed).toBe(30);
  });

  it('caught as it falls, you sink with it: slowed, the wheel wobbling', () => {
    const p = when(h, (x) => x.active);
    const kart = kartAt(p, -3);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'breaths' });
    expect(kart.speed).toBeCloseTo(30 * BREATH_SLOW, 5);
    expect(kart.wobbleTime).toBeCloseTo(BREATH_WOBBLE);
    expect(kart.spinTime).toBe(0);
    // Up on the deck over the chest, or past the rib along the road: nothing.
    const over = kartAt(p);
    over.y += 12;
    expect(h.collide([over], PHYSICS_DT)).toEqual([]);
    const past = kartAt(p, 0, BREATH_DEPTH + 2.5);
    expect(h.collide([past], PHYSICS_DT)).toEqual([]);
  });

  it('are where they are by race time alone', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    for (let t = 0; t <= 12.3; t += 0.7) b.update(t);
    b.update(12.3);
    const pa = a.poses.filter((p) => p.kind === 'breaths');
    const pb = b.poses.filter((p) => p.kind === 'breaths');
    expect(pa.length).toBe(3);
    pa.forEach((p, i) => {
      expect(p.x).toBeCloseTo(pb[i].x, 6);
      expect(p.gap).toBeCloseTo(pb[i].gap, 6);
      expect(p.active).toBe(pb[i].active);
    });
  });
});

/** Steps race time until a rib is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.02) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'breaths' && ok(q));
    if (p) return p;
  }
  throw new Error('no rib in that stage');
}

/** A kart sitting on the road on a hazard, `lateral` to the right of it and `along` the road from it. */
function kartAt(p: HazardPose, lateral = 0, along = 0): KartState {
  const x = p.x - Math.cos(p.heading) * lateral + Math.sin(p.heading) * along;
  const z = p.z + Math.sin(p.heading) * lateral + Math.cos(p.heading) * along;
  const s = createKartState(x, z, p.heading);
  s.y = s.groundY = p.ground;
  return s;
}

function sectionAt(s: number) {
  return def.main.sections.find((q) => s >= q.from && s <= q.to)!;
}

/** Where the main road crosses itself: for each crossing, which road is over which and the least height between them. */
function crossings(t: Track) {
  const sp = t.spline;
  const found: { i: number; j: number; dy: number }[] = [];
  for (let i = 0; i < sp.count; i += 2) {
    for (let j = i; j < sp.count; j += 2) {
      const along = sp.dist[j] - sp.dist[i];
      if (Math.min(along, sp.length - along) < 120) continue;
      if (Math.hypot(sp.px[i] - sp.px[j], sp.pz[i] - sp.pz[j]) > 4) continue;
      const dy = Math.abs(t.main.heightAt(sp.dist[i]) - t.main.heightAt(sp.dist[j]));
      const near = found.find((c) => Math.abs(sp.dist[c.i] - sp.dist[i]) < 60 && Math.abs(sp.dist[c.j] - sp.dist[j]) < 60);
      if (near) near.dy = Math.min(near.dy, dy);
      else found.push({ i, j, dy });
    }
  }
  return found.map(({ i, j, dy }) => {
    const [up, low] = t.main.heightAt(sp.dist[i]) > t.main.heightAt(sp.dist[j]) ? [i, j] : [j, i];
    const upperS = t.main.toBuilder(sp.dist[up]);
    const lowerS = t.main.toBuilder(sp.dist[low]);
    return { dy, upper: sectionAt(upperS).name, lower: sectionAt(lowerS).name, upperS, lowerS, upperY: t.main.heightAt(sp.dist[up]), lowerY: t.main.heightAt(sp.dist[low]) };
  });
}

/** Below the ground and not on a road there (a road sunk in a cut holds you up): fallen. */
function fallen(kart: KartState): boolean {
  if (kart.y > -2) return false;
  const loc = track.locateKart(kart);
  return !(loc.onRoad && kart.y > loc.height - 1.5);
}

/** Builder arc lengths of each kicker's lip on the main road: a sheer drop in the elevation keys. */
function kickerLips(d: TrackDef): number[] {
  const el = d.main.elevation;
  const lips: number[] = [];
  for (let j = 1; j < el.length; j++) if (el[j][0] - el[j - 1][0] < 1e-6 && el[j - 1][1] - el[j][1] > 0.5) lips.push(el[j][0]);
  return lips;
}

/** Steers the kart's travel toward a point further along `ribbon`, as the autopilot in tests/track.test.ts does. */
function steerAlong(ribbon: Ribbon, s: KartState, progress: number) {
  const sp = ribbon.spline;
  const look = 10 + s.speed * 0.4;
  const p = pointAt(sp, sp.closed ? progress + look : Math.min(progress + look, sp.length));
  const desired = Math.atan2(p.x - s.x, p.z - s.z);
  const travel = s.speed > 4 ? Math.atan2(Math.sin(s.heading) * s.speed + s.extX, Math.cos(s.heading) * s.speed + s.extZ) : s.heading;
  const err = wrapAngle(desired - travel);
  return { ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) };
}

/**
 * Drives a ribbon (a branch from its start, or the main road from builder
 * arc length `from`) at top speed until the kart passes the main road's
 * pose at builder arc length `to`; reports the time and whether it fell.
 */
function drive(ribbon: Ribbon, to: number, p: ReturnType<typeof kartParams>, from?: number, lap?: LapContext) {
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
    stepKart(kart, steerAlong(ribbon, kart, progress), p, track, PHYSICS_DT);
    const hit = nearestOnSpline(ribbon.spline, kart.x, kart.z, hint, 20);
    hint = hit.index;
    progress = hit.s;
    if (fallen(kart)) return { time: t, fell: true };
    const near = Math.hypot(kart.x - goal.x, kart.z - goal.z) < 30;
    if (near && (kart.x - goal.x) * goal.tx + (kart.z - goal.z) * goal.tz >= 0) return { time: t, fell: false };
  }
  return { time: Infinity, fell: false };
}

/** Drives straight down a ribbon from arc length `s` and reports whether the kart landed or fell. */
function jump(t: Track, s: number, ribbon: number, speed: number, boost: number, p: ReturnType<typeof kartParams>) {
  const r = t.ribbon(ribbon);
  const pt = pointAt(r.spline, s);
  const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
  kart.y = kart.groundY = r.heightAt(s);
  kart.speed = speed;
  kart.boostTime = boost;
  let progress = s;
  for (let k = 0; k < 4; k += PHYSICS_DT) {
    stepKart(kart, steerAlong(r, kart, progress), p, t, PHYSICS_DT);
    progress = nearestOnSpline(r.spline, kart.x, kart.z).s;
    if (fallen(kart)) return 'fell';
  }
  return 'cleared';
}
