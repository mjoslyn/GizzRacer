import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import {
  HazardSystem,
  SHARK_BOOST,
  SHARK_HEAD,
  SHARK_OUT,
  SHARK_RADIUS,
  SHARK_STAGES,
  SHARK_TAIL,
  SHARK_WAKE,
  sharkCourse,
  type HazardPose,
} from '../src/items/hazards';
import { KART_RADIUS, createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { DIVE, HELI, LAGOON_DECK, MUSCLE, RIVER, SHORE, buildMuddyWater } from '../src/tracks/muddyWater';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type HazardDef, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildMuddyWater();
const track = new Track(def);
const main = track.main;
/** A section by name: a name the road keeps across a deck is one section, from where it starts to where its deck ends. */
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];
/** Map terms: metres north is -z. */
const north = (z: number) => -z;
const sharks = def.hazards.find((h): h is Extract<HazardDef, { kind: 'sharks' }> => h.kind === 'sharks')!;

describe('Muddy Water', () => {
  it("is the Gumboot Soup Cup's first, on a red clay track down to the river", () => {
    const cup = CUPS.find((c) => c.id === 'gumboot-soup')!;
    expect(TRACK_LIST[cup.tracks[0]].id).toBe('muddy-water');
    expect(TRACK_SONGS['muddy-water'].title).toBe('Muddy Water');
    expect(def.theme).toBe('muddy');
    expect(def.music).toEqual({ lap: 'muddy-water', finalLap: 'muddy-water-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('clay');
  });

  it('runs through the song in order, from the hot, mean summer to any day, anyway', () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      "It's Hot, It's Mean",
      "Green Grass Won't Last",
      'Helicopter Flying Over',
      'Shark Bait, Shark Bite',
      'Heat Stroke',
      'The Amber Coals',
      'So Cold It Freezes Me',
      'The Salty Spray',
      'Stop Breathing and Sink',
      "I'm Not a Buoy",
      'I Prefer the Muddy Water',
      'Jump into the River',
      'Hungry Fishes',
      'Under the Willow Tree',
      'Muscle Men',
      'Any Day, Anyway',
    ]);
    const length = track.length;
    console.log(`Muddy Water: ${length.toFixed(0)} m a lap`);
    expect(length).toBeGreaterThan(2200);
    expect(length).toBeLessThan(2700);
    expect(def.laps).toBe(3);
  });

  it('starts between the flags, and keeps to the map', () => {
    expect(def.landmarks.filter((l) => l.s < 20 && l.ribbon === -1 && l.kind !== 'coast').map((l) => l.kind)).toEqual(['flagsGate']);
    for (const kind of ['coast', 'sharkCopter', 'willowTree', 'billabong'] as const) expect(def.landmarks.some((l) => l.kind === kind), kind).toBe(true);
    for (const r of [track.main, ...track.branches]) {
      const sp = r.spline;
      for (let i = 0; i < sp.count; i++) expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i])) + r.halfWidth[i]).toBeLessThan(def.bounds);
    }
  });

  it('is the beach and then the river: the beach half by the sea, the river half up in the bush, and back down to the beach to finish', () => {
    // The shallows: the causeway the sharks cross, the surf, and the salty spray are out past the water's edge.
    for (const name of ['Shark Bait, Shark Bite', 'So Cold It Freezes Me', 'The Salty Spray']) {
      const sec = section(name);
      let south = Infinity;
      for (let s = sec.from; s <= sec.to; s += 2) south = Math.min(south, north(pointAt(track.spline, track.mainS(s)).z));
      expect(south, name).toBeLessThan(SHORE - 20);
    }
    // The river half: up in the bush, north of everything on the beach.
    for (const name of ['I Prefer the Muddy Water', 'Jump into the River', 'Hungry Fishes', 'Under the Willow Tree']) {
      const sec = section(name);
      for (let s = sec.from + 20; s < sec.to; s += 10) expect(north(pointAt(track.spline, track.mainS(s)).z), name).toBeGreaterThan(-90);
    }
    // The river runs from the hills beyond the map down into the lagoon at its mouth, which opens to the sea.
    expect(RIVER[0][1]).toBeGreaterThan(def.bounds);
    const [e, n] = RIVER[RIVER.length - 1];
    const mouth = def.pits.find((p) => p.liquid === 'water' && inPit(p, e, -n))!;
    expect(mouth).toBeDefined();
    expect(Math.min(...[-1, 1].map((k) => -(mouth.z + Math.cos(mouth.heading) * k * mouth.halfLength)))).toBeLessThan(SHORE);
  });

  it('crosses itself in tiers: the helicopter deck over the esplanade and the amber coals, the boardwalk over the river road and over the road sunk under the river mouth', () => {
    const over = crossings(track);
    const pairs = new Set(over.map((c) => `${c.upper} over ${c.lower}`));
    expect([...pairs].sort()).toEqual(
      ["Helicopter Flying Over over It's Hot, It's Mean", 'Helicopter Flying Over over The Amber Coals', 'Muscle Men over I Prefer the Muddy Water', 'Muscle Men over Stop Breathing and Sink'].sort(),
    );
    for (const c of over) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(6);
      expect(sectionAt(c.upperS).bridge, c.upper).toBe(true);
    }
    // Over the river mouth, the road underneath is under the water.
    const mouth = over.find((c) => c.lower === 'Stop Breathing and Sink')!;
    expect(mouth.lowerY).toBeLessThan(-DIVE + 1);
  });

  it('flies the helicopter deck over the esplanade and the sand and plunges off it into the shallows', () => {
    const heli = section('Helicopter Flying Over');
    expect(Math.max(...Array.from({ length: 50 }, (_, k) => main.heightAtBuilder(heli.from + ((heli.to - heli.from) * k) / 49)))).toBeCloseTo(HELI, 1);
    expect(main.heightAtBuilder(heli.to)).toBeCloseTo(0, 1);
    expect(heli.parts.every((p) => p.bridge)).toBe(true);
  });

  it('sinks under the muddy water of the river mouth and comes back up, nothing else sunk', () => {
    const sink = section('Stop Breathing and Sink');
    let under = 0;
    for (let s = sink.from; s < sink.to; s += 2) if (main.heightAtBuilder(s) < -DIVE + 0.5) under += 2;
    expect(under / (sink.to - sink.from)).toBeGreaterThan(0.4);
    // In the water: a pit of it round the road all the way down, deep enough to see the road under the surface.
    const mid = pointAt(track.spline, track.mainS((sink.from + sink.to) / 2));
    const lagoon = def.pits.find((p) => p.liquid === 'water' && inPit(p, mid.x, mid.z))!;
    expect(lagoon).toBeDefined();
    expect(lagoon.depth).toBeGreaterThan(DIVE);
    expect(main.heightAtBuilder(section("I'm Not a Buoy").from)).toBeCloseTo(0, 1);
    // No road is cut into the ground: under water is the only way down.
    expect(main.cut.every((x) => x === 0)).toBe(true);
  });

  it('jumps into the river: a leap over it that a 100cc kart at full speed clears', () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const leap = section('Jump into the River');
    expect(a > leap.from && z < leap.to).toBe(true);
    const mid = pointAt(track.spline, track.mainS((a + z) / 2));
    expect(def.pits.some((p) => p.liquid === 'water' && inPit(p, mid.x, mid.z))).toBe(true);
    // The river runs under it.
    expect(distanceToRiver(mid.x, mid.z)).toBeLessThan(6);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });

  it('keeps the river clear of the roads except where it passes under the jump, through the ford and into the river mouth', () => {
    for (const r of [track.main, ...track.branches]) {
      const sp = r.spline;
      for (let i = 0; i < sp.count; i++) {
        if (distanceToRiver(sp.px[i], sp.pz[i]) > r.halfWidth[i] + 8) continue;
        const s = r === track.main ? main.toBuilder(sp.dist[i]) : -1;
        const deck = s >= 0 && sectionAt(s).bridge && main.heightAtBuilder(s) > 3;
        const overWater = def.pits.some((p) => p.liquid === 'water' && inPit({ ...p, halfLength: p.halfLength + 20 }, sp.px[i], sp.pz[i]));
        expect(deck || overWater || r.inGap(sp.dist[i]), `road by the river at ${s.toFixed(0)}`).toBe(true);
      }
    }
  });

  it('drives through the water three ways: through the surf, through the river at the ford, and under the river mouth', () => {
    // Through the surf: the causeway, the surf and the spray, out in the sea, at the water's own level.
    for (const name of ['Shark Bait, Shark Bite', 'So Cold It Freezes Me', 'The Salty Spray']) {
      const sec = section(name);
      let wet = 0;
      for (let s = sec.from; s < sec.to; s += 2) {
        const p = pointAt(track.spline, track.mainS(s));
        if (north(p.z) < SHORE) {
          wet += 2;
          expect(Math.abs(main.heightAtBuilder(s)), name).toBeLessThan(0.5);
        }
      }
      expect(wet, name).toBeGreaterThan(40);
    }
    // The ford under the willow: the road runs at water level through the river, open water either side.
    const muddy = section('Under the Willow Tree');
    let ford = 0;
    for (let s = muddy.from; s < muddy.to; s += 1) {
      const p = pointAt(track.spline, track.mainS(s));
      if (!def.pits.some((q) => q.liquid === 'water' && inPit(q, p.x, p.z))) continue;
      ford += 1;
      expect(main.heightAtBuilder(s)).toBeCloseTo(0, 1);
      expect(sectionAt(s).wallHeight ?? 0).toBe(0);
      expect(distanceToRiver(p.x, p.z)).toBeLessThan(16);
      // Water off both edges of the road.
      for (const side of [-1, 1]) {
        const w = main.halfWidthAtS(track.mainS(s)) + 4;
        expect(def.pits.some((q) => q.liquid === 'water' && inPit(q, p.x - p.tz * side * w, p.z + p.tx * side * w))).toBe(true);
      }
    }
    expect(ford).toBeGreaterThan(20);
    // Under the river mouth: see 'sinks under the muddy water'. And the shortcut fords the billabong.
    expect(def.landmarks.some((l) => l.kind === 'coast')).toBe(true);
  });

  it('runs out over the boardwalk at the muscle men, off the ground, twice', () => {
    const muscle = section('Muscle Men');
    let top = 0;
    for (let s = muscle.from; s < muscle.to; s += 2) top = Math.max(top, main.heightAtBuilder(s));
    expect(top).toBeCloseTo(MUSCLE, 1);
    expect(muscle.parts.filter((p) => p.bridge).length).toBe(2);
    expect(main.heightAtBuilder(muscle.to)).toBeCloseTo(LAGOON_DECK, 1);
  });
});

describe('Give Me Over to the River, a ford straight through the billabong', () => {
  const k = def.branches.findIndex((b) => b.name === 'Give Me Over to the River');
  const bdef = def.branches[k];
  const branch = track.branches[k];
  const last: LapContext = { lap: 3, lastLap: true };

  it('leaves Hungry Fishes where it swings round the billabong, and meets the main road again at the same pose', () => {
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
    for (const s of [bdef.mainFrom, bdef.mainTo]) expect(def.main.sections.find((q) => s >= q.from && s <= q.to)!.wallHeight ?? 0).toBe(0);
    const fishes = section('Hungry Fishes');
    expect(bdef.mainFrom > fishes.from && bdef.mainTo <= fishes.to).toBe(true);
    expect(def.landmarks.some((l) => l.kind === 'billabong' && l.ribbon === k)).toBe(true);
  });

  it('runs through the water, clear of the main road and in bounds', () => {
    const sp = branch.spline;
    const water = def.pits.find((p) => p.liquid === 'water' && inPit(p, sp.px[Math.floor(sp.count / 2)], sp.pz[Math.floor(sp.count / 2)]))!;
    expect(water).toBeDefined();
    for (let i = 0; i < sp.count; i++) {
      if (sp.dist[i] < 40 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 40 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(4);
    }
    // The billabong is clear of the main road: its edge a good way from the road's.
    const msp = main.spline;
    const fx = Math.sin(water.heading);
    const fz = Math.cos(water.heading);
    for (let i = 0; i < msp.count; i++) {
      const dx = msp.px[i] - water.x;
      const dz = msp.pz[i] - water.z;
      const along = Math.max(0, Math.abs(dx * fx + dz * fz) - water.halfLength);
      const across = Math.max(0, Math.abs(-dx * fz + dz * fx) - water.halfWidth);
      expect(Math.hypot(along, across) - main.halfWidth[i]).toBeGreaterThan(2);
    }
  });

  it('puts a row of double item boxes in the river', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('is there on the final lap only: before that the river is up, and you go in', () => {
    expect(bdef.openOn).toEqual(['final']);
    expect(bdef.shut).toEqual({ kind: 'flood' });
    const p = kartParams(first.stats, '150cc');
    expect(drive(branch, bdef.mainTo, p, undefined, last).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 2, lastLap: false }).fell).toBe(true);
  });

  it('saves 0.8 to 2.5 s at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p, undefined, last);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, last);
    console.log(`Muddy Water: the ford ${via.time.toFixed(2)} s, round the billabong ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.8);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('Muddy Water elevation and driving', () => {
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);
  const ramps = (b: number) => lips.some((l) => b > l - 9 && b < l + 2) || def.main.gaps.some(([a, z]) => b > a - 20 && b < z + 2);

  it('has two kickers on the esplanade that launch a kart at 100cc and land it on the road', () => {
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

  it('never runs downhill so steeply that a kart at full speed skips off it, nor climbs any steeper', () => {
    for (let s = 0; s + 1 < heights.length; s++) {
      const b = main.toBuilder(s);
      if (ramps(b)) continue;
      expect(Math.abs(heights[s] - heights[s + 1]), `at ${b.toFixed(0)}`).toBeLessThan(0.45);
    }
  });

  it('gives a fast kart airtime off the helicopter deck and the dune, and laps it at 150cc with no falls', () => {
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
      if (ev.launched && !lips.some((l) => Math.abs(b - l) < 6) && !def.main.gaps.some(([a, z]) => b > a - 4 && b < z + 4)) crests.push(b);
    }
    console.log(`Muddy Water: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const heli = section('Helicopter Flying Over');
    const coals = section('The Amber Coals');
    expect(crests.some((b) => b > heli.to - 45 && b < heli.to + 10)).toBe(true);
    expect(crests.some((b) => b > coals.from && b < coals.to)).toBe(true);
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

describe('sharks: a fin circling in the shallows, then cutting across the causeway', () => {
  const h = new HazardSystem(track);
  const poses = () => h.poses.filter((q) => q.kind === 'sharks');

  it('patrol the causeway through the shallows, Shark Bait, Shark Bite, out past the water\'s edge', () => {
    expect(sharks.at.length).toBeGreaterThanOrEqual(3);
    const shark = section('Shark Bait, Shark Bite');
    for (const s of sharks.at) {
      expect(s > shark.from && s < shark.to).toBe(true);
      expect(north(pointAt(track.spline, track.mainS(s)).z)).toBeLessThan(SHORE);
    }
    expect(def.hazards.map((q) => q.kind)).toEqual(['sharks']);
  });

  it('circle off the edge they will come from, harmless, then run right across the road on a slant and on into the water the other side', () => {
    const reach = 13.5;
    for (const [cycle, i] of [
      [0, 0],
      [1, 0],
      [2, 1],
      [7, 2],
    ]) {
      for (let u = 0; u < SHARK_STAGES.run; u += 0.01) {
        const c = sharkCourse(u, cycle, i, reach);
        expect(c.running).toBe(false);
        // Off the road, on the side the run starts from.
        expect(-c.side * c.lateral).toBeGreaterThan(reach + SHARK_OUT - 0.01);
      }
      const start = sharkCourse(SHARK_STAGES.run, cycle, i, reach);
      const before = sharkCourse(SHARK_STAGES.run - 1e-6, cycle, i, reach);
      expect(Math.hypot(start.along - before.along, start.lateral - before.lateral)).toBeLessThan(0.01);
      const across = sharkCourse(SHARK_STAGES.ashore, cycle, i, reach);
      expect(across.lateral).toBeCloseTo(start.side * (reach + SHARK_OUT), 5);
      expect(Math.sign(across.lateral)).toBe(-Math.sign(start.lateral));
      // Along the way it swims the way it's heading.
      const mid = sharkCourse((SHARK_STAGES.run + SHARK_STAGES.ashore) / 2, cycle, i, reach);
      const next = sharkCourse((SHARK_STAGES.run + SHARK_STAGES.ashore) / 2 + 0.01, cycle, i, reach);
      const d = Math.hypot(next.along - mid.along, next.lateral - mid.lateral);
      expect((next.along - mid.along) / d).toBeCloseTo(mid.da, 3);
      expect((next.lateral - mid.lateral) / d).toBeCloseTo(mid.dl, 3);
    }
    // Back and forth: one run one way, the next the other.
    expect(sharkCourse(0.7, 0, 0, reach).side).toBe(-sharkCourse(0.7, 1, 0, reach).side);
  });

  it('are where they are by race time alone', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    for (let t = 0; t <= 12.3; t += 0.7) b.update(t);
    b.update(12.3);
    const pa = a.poses.filter((q) => q.kind === 'sharks');
    const pb = b.poses.filter((q) => q.kind === 'sharks');
    pa.forEach((p, i) => {
      expect(p.x).toBeCloseTo(pb[i].x, 6);
      expect(p.z).toBeCloseTo(pb[i].z, 6);
      expect(p.active).toBe(pb[i].active);
    });
  });

  it('bite you if you drive into one as it crosses: spun', () => {
    const p = when(h, (q) => q.active && Math.abs(q.gap) < 4);
    for (const d of [SHARK_HEAD, 0, -SHARK_TAIL]) {
      const hs = new HazardSystem(track);
      hs.update(lastT);
      const q = hs.poses.find((o) => o.kind === 'sharks' && o.active && Math.abs(o.x - p.x) < 1e-6)!;
      const kart = kartAt(q, d, 0);
      kart.speed = 30;
      expect(hs.collide([kart], PHYSICS_DT)[0], `${d} along it`).toMatchObject({ by: 'sharks' });
      expect(kart.spinTime).toBeGreaterThan(0);
    }
    // Beside it, clear of its body and its wake: nothing.
    const hs = new HazardSystem(track);
    hs.update(lastT);
    const q = hs.poses.find((o) => o.kind === 'sharks' && o.active && Math.abs(o.x - p.x) < 1e-6)!;
    const kart = kartAt(q, 0, SHARK_RADIUS + KART_RADIUS + 3);
    kart.speed = 30;
    expect(hs.collide([kart], PHYSICS_DT)).toEqual([]);
  });

  it('are harmless while they circle off the road', () => {
    const p = when(h, (q) => q.phase < SHARK_STAGES.run - 0.05);
    expect(p.active).toBe(false);
    expect(h.collide([kartAt(p, 0, 0)], PHYSICS_DT)).toEqual([]);
  });

  it('tow you on if you slip past just behind one, through its wake: a boost', () => {
    const p = when(h, (q) => q.active && Math.abs(q.gap) < 4);
    const kart = kartAt(p, -SHARK_TAIL - SHARK_RADIUS - SHARK_WAKE / 2, 0);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'sharks', good: true });
    expect(kart.boostTime).toBeCloseTo(SHARK_BOOST);
    expect(kart.spinTime).toBe(0);
    // In front of it, where it's going: no wake there.
    const ahead = kartAt(p, SHARK_HEAD + SHARK_RADIUS + KART_RADIUS + 3, 0);
    ahead.speed = 30;
    const hs = new HazardSystem(track);
    hs.update(lastT);
    expect(hs.collide([ahead], PHYSICS_DT)).toEqual([]);
  });

  it('shows CPUs the shark to steer round while it crosses, and nothing while it circles', () => {
    const out: { x: number; z: number; r: number; vx: number; vz: number }[] = [];
    const p = when(h, (q) => q.active);
    h.obstacles(out);
    expect(out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 0.1)).toBe(true);
    const hs = new HazardSystem(track);
    for (let t = 0; t < 30; t += 0.05) {
      hs.update(t);
      if (hs.poses.every((q) => q.kind !== 'sharks' || !q.active)) {
        const none: typeof out = [];
        hs.obstacles(none);
        expect(none).toEqual([]);
        return;
      }
    }
    throw new Error('never all circling');
  });

  it('cross on every lap: each one runs within its period', () => {
    for (let k = 0; k < poses().length; k++) {
      let ran = false;
      for (let t = 0; t < sharks.period; t += 0.05) {
        h.update(t);
        ran ||= poses()[k].active;
      }
      expect(ran).toBe(true);
    }
  });
});

/** The race time `when` last stopped at. */
let lastT = 0;

/** Steps race time until a shark is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.02) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'sharks' && ok(q));
    if (p) {
      lastT = t;
      return p;
    }
  }
  throw new Error('no shark in that stage');
}

/** A kart on the road `along` metres ahead of a shark along its line and `beside` to its right. */
function kartAt(p: HazardPose, along: number, beside: number): KartState {
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const s = createKartState(p.x + fx * along - fz * beside, p.z + fz * along + fx * beside, p.heading);
  s.y = s.groundY = p.ground;
  return s;
}

/** How far a point is from the river's centreline. */
function distanceToRiver(x: number, z: number): number {
  let best = Infinity;
  for (let k = 0; k + 1 < RIVER.length; k++) {
    const [ax, an] = RIVER[k];
    const [bx, bn] = RIVER[k + 1];
    const az = -an;
    const bz = -bn;
    const dx = bx - ax;
    const dz = bz - az;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * u, z - az - dz * u));
  }
  return best;
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
    return { dy, upper: sectionAt(upperS).name, lower: sectionAt(lowerS).name, upperS, lowerS, lowerY: t.main.heightAt(sp.dist[low]) };
  });
}

/** Below the ground and not on a road there (a road sunk in a cut or under water holds you up): fallen. */
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
