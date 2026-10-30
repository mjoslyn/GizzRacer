import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { FUZZ_BOOST } from '../src/items/items';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { HazardSystem, PRESENT_BOOST, PRESENT_EDGE, PRESENT_OPEN, PRESENT_REACH, PRESENT_ROOF, PRESENT_STAGES, RAM_BOOST, REWARD_COOLDOWN, presentFlight, type HazardPose } from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { buildGodIsCalling } from '../src/tracks/godIsCalling';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const SECTIONS = [
  'Meet Me at the House',
  'Top of the Hill',
  'Two Important People',
  'Flunk or Fail',
  'Something Better to Do',
  "Santa's on the Roof",
  'Presents and Sack',
  'Blade and Axe',
  'Then I Hear God Call',
  'All My Hate Is Gone',
  'Calling Me Back Home',
];
/** The song explodes here: the sections before are the quiet half, from here on the loud. */
const LOUD = SECTIONS.indexOf('Then I Hear God Call');

const def = buildGodIsCalling();
const track = new Track(def);
const main = track.main;
const section = (name: string) => def.main.sections.find((s) => s.name === name)!;
const first = RACERS[0];

describe('God Is Calling Me Back Home', () => {
  it("is the Float Along – Fill Your Lungs Cup's second track, after the album's third song, on its own road and in its own world", () => {
    const cup = CUPS.find((c) => c.id === 'float-along-fill-your-lungs')!;
    expect(TRACK_LIST[cup.tracks[1]].id).toBe('god-is-calling');
    expect(def.name).toBe('God Is Calling Me Back Home');
    expect(TRACK_SONGS[def.id].title).toBe('God Is Calling Me Back Home');
    expect(def.theme).toBe('godcall');
    expect(def.music).toEqual({ lap: 'god-is-calling', finalLap: 'god-is-calling-final-lap' });
    for (const s of def.main.sections) expect(s.surface, s.name).toBe('bitumen');
    expect(def.laps).toBe(3);
    expect(track.length).toBeGreaterThan(1800);
    expect(track.length).toBeLessThan(2700);
    // The arch of light at the start, again where the road goes up into the light, and the house on the top of the hill off the road.
    expect(def.landmarks.filter((l) => l.s < 20).map((l) => l.kind)).toEqual(['heavenGate']);
    expect(def.landmarks.filter((l) => l.kind === 'heavenGate').length).toBe(2);
    const house = def.landmarks.find((l) => l.kind === 'hillHouse')!;
    expect(Math.abs(house.lateral ?? 0)).toBeGreaterThanOrEqual(100);
  });

  it('runs through the song in the order it sings it', () => {
    expect(def.main.sections.map((s) => s.name).filter((n) => n !== 'Finish Straight')).toEqual(SECTIONS);
  });

  it('is quiet then loud, as the song is: low and narrow through the streets, then up onto the high decks', () => {
    const top = (name: string) => {
      const s = section(name);
      let y = -Infinity;
      for (let b = s.from; b < s.to; b += 2) y = Math.max(y, main.heightAtBuilder(b));
      return y;
    };
    const quiet = def.main.sections.filter((s) => SECTIONS.indexOf(s.name) >= 0 && SECTIONS.indexOf(s.name) < LOUD);
    const loud = def.main.sections.filter((s) => SECTIONS.indexOf(s.name) >= LOUD);
    // Quiet: never higher than the Top of the Hill's crest, and narrower.
    for (const s of quiet) expect(top(s.name), s.name).toBeLessThan(8);
    const width = (ss: typeof quiet) => ss.reduce((w, s) => w + s.halfWidth * (s.to - s.from), 0) / ss.reduce((l, s) => l + s.to - s.from, 0);
    expect(width(quiet)).toBeLessThan(width(loud));
    expect(Math.min(...def.main.sections.map((s) => s.halfWidth))).toBe(section('Flunk or Fail').halfWidth);
    // Loud: the call climbs a turn and an eighth to the deck, and the deck goes up into the light, higher than anything else.
    expect(main.heightAtBuilder(section('Then I Hear God Call').to)).toBeGreaterThan(10);
    expect(top('All My Hate Is Gone')).toBeGreaterThan(14);
    expect(section('Then I Hear God Call').bridge).toBe(true);
    expect(section('All My Hate Is Gone').bridge).toBe(true);
    const call = section('Then I Hear God Call');
    expect(turning(call.from, call.to)).toBeGreaterThan((390 * Math.PI) / 180);
  });

  it('crosses itself twice, one road over the other: the call over its own road in, and the high deck over Meet Me at the House', () => {
    const tiers = crossings(track);
    expect(tiers.length).toBe(2);
    for (const dy of tiers) expect(dy).toBeGreaterThan(6);
    const span = (name: string): [number, number] => [section(name).from, section(name).to];
    expect(over(span('All My Hate Is Gone'), span('Meet Me at the House'))).toBeGreaterThan(8);
    // A turn and an eighth round, the call comes back over where it began, Blade and Axe running into it.
    const call = section('Then I Hear God Call');
    expect(over([call.from + 200, call.to], [section('Blade and Axe').from, call.from + 100])).toBeGreaterThan(6);
  });

  it("has two important people's two hairpins, Flunk or Fail's kinks, and the crest at the top of the hill", () => {
    const two = section('Two Important People');
    expect(turning(two.from, two.to)).toBeGreaterThan((340 * Math.PI) / 180);
    const flunk = section('Flunk or Fail');
    expect(bends(flunk.from + 1, flunk.to - 1)).toBeGreaterThanOrEqual(4);
    // A sharp crest: up the street and straight over the top.
    const hill = section('Top of the Hill');
    let peak = 0;
    let at = 0;
    for (let b = hill.from; b < hill.to; b += 1) if (main.heightAtBuilder(b) > peak) [peak, at] = [main.heightAtBuilder(b), b];
    expect(peak).toBeGreaterThan(6);
    const slope = (b: number) => main.heightAtBuilder(b + 1) - main.heightAtBuilder(b);
    expect(slope(at - 2)).toBeGreaterThan(0.08);
    expect(slope(at + 1)).toBeLessThan(-0.08);
  });

  it('sinks Presents and Sack 6 m down a lane between the back fences, with presents dropping into it', () => {
    const sack = section('Presents and Sack');
    expect(sack.wallHeight).toBeGreaterThanOrEqual(5);
    expect(main.heightAtBuilder((sack.from + sack.to) / 2)).toBeLessThan(-5);
    const at = def.hazards.filter((h) => h.kind === 'presents').flatMap((h) => ('at' in h ? h.at : []));
    expect(at.filter((s) => s > sack.from && s < sack.to).length).toBeGreaterThanOrEqual(2);
    expect(at.some((s) => s > section("Santa's on the Roof").from && s < section("Santa's on the Roof").to)).toBe(true);
    // The only walled stretch so tall, and the only hazard on the lap.
    expect(def.main.sections.filter((s) => (s.wallHeight ?? 0) >= 5).map((s) => s.name)).toEqual(['Presents and Sack']);
    expect(new Set(def.hazards.map((h) => h.kind))).toEqual(new Set(['presents']));
  });

  it('leaps the creek on the way home: a jump on the main road, over water', () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const home = section('Calling Me Back Home');
    expect(a > home.from && z < home.to).toBe(true);
    const p = pointAt(track.spline, track.mainS((a + z) / 2));
    expect(def.pits.some((pit) => pit.liquid === 'water' && inPit(pit, p.x, p.z))).toBe(true);
  });
});

describe('God Is Calling Me Back Home: Something Better to Do', () => {
  const k = def.branches.findIndex((b) => b.name === 'Something Better to Do');
  const bdef = def.branches[k];
  const branch = track.branches[k];
  const open: LapContext = { lap: 2, lastLap: false };

  it('is there from lap 2, and on lap 1 there is nothing but the skate park pool', () => {
    expect(bdef.openOn).toEqual([2, 'final']);
    expect(bdef.shut).toEqual({ kind: 'vanish' });
    const p = kartParams(first.stats, '150cc');
    expect(drive(branch, bdef.mainTo, p, 0, undefined, -Infinity, open).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, 0, undefined, -Infinity, { lap: 1, lastLap: false }).fell).toBe(true);
    expect(drive(branch, bdef.mainTo, p, 0, undefined, -Infinity, { lap: 3, lastLap: true }).fell).toBe(false);
  });

  it('meets the main road at both ends and keeps clear of it between', () => {
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
    for (const s of [bdef.mainFrom, bdef.mainTo]) expect(def.main.sections.find((q) => s >= q.from && s <= q.to)!.wallHeight ?? 0).toBe(0);
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 40 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 40 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - track.main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(4);
    }
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('jumps the empty pool with a moderate boost at 100cc, and saves 0.8 to 2.5 s at 150cc', () => {
    const slow = kartParams(first.stats, '100cc');
    expect(drive(branch, bdef.mainTo, slow, FUZZ_BOOST, undefined, branch.scale * bdef.gaps[0][0] - 30, open).fell).toBe(false);
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p, 0, undefined, -Infinity, open);
    const round = drive(track.main, bdef.mainTo, p, 0, bdef.mainFrom, -Infinity, open);
    console.log(`Something Better to Do ${via.time.toFixed(2)} s, round the park ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.8);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('God Is Calling Me Back Home: kickers, crests and laps', () => {
  const lips = kickerLips(def);
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));

  it('has two speed humps on Meet Me at the House that launch a kart at 100cc and land it on the road', () => {
    expect(lips.length).toBe(2);
    for (const lip of lips) expect(lip).toBeLessThan(section('Meet Me at the House').to);
    const p = kartParams(first.stats, '100cc');
    for (const lip of lips) {
      const start = track.mainS(lip - 7 - 25);
      const pt = pointAt(track.spline, start);
      const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
      kart.y = kart.groundY = main.heightAt(start);
      kart.speed = p.topSpeed;
      let launched = false;
      let landed = false;
      let progress = start;
      for (let t = 0; t < 4 && !landed; t += PHYSICS_DT) {
        const ev = stepKart(kart, steerAlong(main, kart, progress), p, track, PHYSICS_DT);
        progress = nearestOnSpline(track.spline, kart.x, kart.z).s;
        launched ||= ev.launched;
        landed = launched && kart.grounded;
        expect(fallen(kart)).toBe(false);
      }
      expect(launched).toBe(true);
      expect(landed).toBe(true);
      expect(track.locate(kart.x, kart.z, kart.y).onRoad).toBe(true);
    }
  });

  it('never runs downhill so steeply that a kart at full speed skips off it, and keeps its cut clear of pits', () => {
    for (let s = 0; s + 1 < heights.length; s++) {
      const b = main.toBuilder(s);
      if (lips.some((l) => Math.abs(b - l) < 2) || def.main.gaps.some(([a, z]) => b > a - 2 && b < z + 2)) continue;
      expect(heights[s] - heights[s + 1], `at ${b.toFixed(0)}`).toBeLessThan(0.45);
    }
    const sp = main.spline;
    expect(main.cut.some((x) => x > 0)).toBe(true);
    for (let i = 0; i < sp.count; i++) {
      if (!main.cut[i]) continue;
      expect(def.pits.some((p) => inPit({ ...p, halfLength: p.halfLength + 6, halfWidth: p.halfWidth + 6 }, sp.px[i], sp.pz[i]))).toBe(false);
    }
  });

  it('gives a fast kart airtime off a crest, and laps it at 150cc with no falls', () => {
    const race = new Race(track);
    const kart = race.addKart(RACERS[0], '150cc', null);
    race.time = 0;
    let respawns = 0;
    const crests: number[] = [];
    for (let t = 0; t < 200 && kart.laps.lap < 1; t += PHYSICS_DT) {
      const ev = race.step(PHYSICS_DT, [steerAlong(main, kart.state, kart.progressS)])[0];
      if (kart.respawned) respawns++;
      const b = main.toBuilder(kart.progressS);
      if (ev.launched && !lips.some((l) => Math.abs(b - l) < 6) && !def.main.gaps.some(([a, z]) => b > a - 4 && b < z + 4)) crests.push(b);
    }
    console.log(`God Is Calling Me Back Home: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    expect(crests.length).toBeGreaterThan(0);
  }, 30000);

  it('a full field of 150cc CPUs laps it', () => {
    const race = new Race(new Track(TRACK_LIST.find((t) => t.id === 'god-is-calling')!.build()));
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

describe("Santa's presents", () => {
  it('Santa holds one up at the edge of the road, tosses it, and it bounces across the road and comes to rest', () => {
    const h = new HazardSystem(track);
    const held = when(h, (q) => q.phase < PRESENT_STAGES.toss - 0.02);
    expect(held.active).toBe(false);
    // Up on a roof beside the road: over the lane sunk between the fences, up at the top of them.
    expect(held.ground).toBeLessThan(-5);
    expect(held.y).toBeCloseTo(PRESENT_ROOF);
    expect(Math.abs(lateral(held))).toBeCloseTo(Math.abs(held.gap));
    expect(Math.abs(held.gap)).toBeGreaterThan(track.main.halfWidthAtS(track.mainS(section('Presents and Sack').from + 60)) + PRESENT_EDGE - 2);
    expect(h.collide([kartAt(held)], PHYSICS_DT)).toEqual([]);
    // Over the road: high on the toss, down, up again off the bounces, lower each time, then still.
    const lifts: number[] = [];
    let u0 = -1;
    for (let t = 0; t < 30; t += 0.01) {
      h.update(t);
      const p = h.poses[0];
      if (u0 < 0 && p.phase >= PRESENT_STAGES.toss) u0 = t;
      if (u0 >= 0 && p.phase >= PRESENT_STAGES.toss && p.phase < PRESENT_STAGES.gone) lifts.push(p.y - p.ground);
      if (u0 >= 0 && p.phase >= PRESENT_STAGES.gone) break;
    }
    // The throw's arc off the roof, and two bounces, each lower.
    const peaks = lifts.filter((y, i) => i > 0 && i < lifts.length - 1 && y > lifts[i - 1] && y >= lifts[i + 1] && y > 0.2);
    expect(peaks.length).toBe(3);
    expect(peaks[0]).toBeGreaterThan(PRESENT_ROOF - held.ground);
    expect(peaks[1]).toBeLessThan(peaks[0] / 2);
    expect(peaks[2]).toBeLessThan(peaks[1]);
    expect(lifts[lifts.length - 1]).toBe(0);
    // Across the road it goes, edge to wherever it comes to rest: never at the very edge.
    const rest = when(h, (q) => q.phase > PRESENT_STAGES.rest + 0.02 && q.phase < PRESENT_STAGES.gone - 0.02);
    expect(rest.active).toBe(true);
    expect(Math.abs(lateral(rest))).toBeLessThan(Math.abs(rest.gap) - PRESENT_EDGE - 1);
    expect(presentFlight(PRESENT_STAGES.gone + 0.01)).toBeNull();
  });

  it('a shut one spins you; rammed on a boost, it bursts and the boost runs on', () => {
    const h = new HazardSystem(track);
    const shut = when(h, (q) => q.lane === 0 && q.phase > PRESENT_STAGES.rest && q.phase < PRESENT_STAGES.gone - 0.02);
    const hit = kartAt(shut);
    hit.speed = 20;
    expect(h.collide([hit], PHYSICS_DT)[0]).toMatchObject({ by: 'presents' });
    expect(hit.spinTime).toBeGreaterThan(0);
    const rammed = kartAt(shut);
    rammed.boostTime = 0.5;
    expect(h.collide([rammed], PHYSICS_DT)[0]).toMatchObject({ by: 'presents', good: true });
    expect(rammed.boostTime).toBeCloseTo(0.5 + RAM_BOOST);
    expect(rammed.spinTime).toBe(0);
    // In the air over you, it can't touch you.
    const high = when(h, (q) => q.phase > PRESENT_STAGES.toss && q.y - q.ground > PRESENT_REACH + 0.5);
    expect(high.active).toBe(false);
    expect(h.collide([kartAt(high)], PHYSICS_DT)).toEqual([]);
  });

  it('one that lands open is a gift: a boost, and an item if your hands are empty, once in a while', () => {
    const h = new HazardSystem(track);
    const open = when(h, (q) => q.lane === 1 && q.phase > PRESENT_STAGES.rest && q.phase < PRESENT_STAGES.gone - 0.05);
    const k = kartAt(open);
    expect(h.collide([k], PHYSICS_DT)[0]).toMatchObject({ by: 'presents', good: true, gift: true });
    expect(k.boostTime).toBeCloseTo(PRESENT_BOOST);
    expect(k.spinTime).toBe(0);
    // Not again straight away; once the cooldown's run out, again.
    expect(h.collide([k], PHYSICS_DT)).toEqual([]);
    expect(h.collide([k], REWARD_COOLDOWN)[0]).toMatchObject({ by: 'presents', good: true, gift: true });
    // About one in three lands open, and the CPUs steer for those, round the rest.
    let opened = 0;
    let landed = 0;
    let last = -1;
    const obstacles: { x: number; z: number; r: number; vx: number; vz: number }[] = [];
    for (let t = 0; t < 600; t += 0.1) {
      h.update(t);
      const p = h.poses[0];
      const cycle = Math.floor((t + 10) / 4.8);
      if (p.phase > PRESENT_STAGES.rest && cycle !== last) {
        last = cycle;
        landed++;
        if (p.lane === 1) opened++;
        obstacles.length = 0;
        h.obstacles(obstacles);
        const near = obstacles.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 0.1);
        expect(near).toBe(p.lane === 0);
      }
    }
    expect(opened / landed).toBeGreaterThan(1 / PRESENT_OPEN - 0.12);
    expect(opened / landed).toBeLessThan(1 / PRESENT_OPEN + 0.12);
  });

  it('in a race, the gift is an item for a kart with none', () => {
    const race = new Race(track);
    const kart = race.addKart(RACERS[0], '150cc', null);
    const probe = new HazardSystem(track);
    let t = 1;
    for (; t < 120; t += PHYSICS_DT) {
      probe.update(t + PHYSICS_DT);
      const q = probe.poses.find((p) => p.lane === 1 && p.phase > PRESENT_STAGES.rest + 0.02 && p.phase < PRESENT_STAGES.gone - 0.05);
      if (q) {
        race.time = t;
        Object.assign(kart.state, kartAt(q));
        break;
      }
    }
    expect(kart.item).toBeNull();
    race.step(PHYSICS_DT, [NEUTRAL_INPUT]);
    expect(race.events).toContainEqual(expect.objectContaining({ type: 'bonus', by: 'presents' }));
    expect(race.events).toContainEqual(expect.objectContaining({ type: 'pickup', kart }));
    expect(kart.item).not.toBeNull();
  });
});

/** Steps race time until a present is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 120; t += 0.02) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'presents' && ok(q));
    if (p) return p;
  }
  throw new Error('no present in that stage');
}

/** A kart sitting right on a hazard. */
function kartAt(p: HazardPose): KartState {
  const s = createKartState(p.x, p.z, p.heading);
  s.y = s.groundY = p.ground;
  return s;
}

/** How far to the right of the road's centre a hazard is. */
function lateral(p: HazardPose): number {
  return -(p.x - p.ax) * Math.cos(p.heading) + (p.z - p.az) * Math.sin(p.heading);
}

/** How far the road turns between two builder arc lengths, all told (radians). */
function turning(from: number, to: number): number {
  let total = 0;
  for (let b = from; b < to; b += 1) {
    const a = pointAt(track.spline, track.mainS(b));
    const c = pointAt(track.spline, track.mainS(b + 1));
    total += Math.abs(wrapAngle(Math.atan2(c.tx, c.tz) - Math.atan2(a.tx, a.tz)));
  }
  return total;
}

/** How many bends between two builder arc lengths, each the other way from the last. */
function bends(from: number, to: number): number {
  let n = 0;
  let last = 0;
  for (let b = from; b < to; b += 1) {
    const i = Math.min(main.spline.count - 1, Math.round((track.mainS(b) / main.spline.length) * main.spline.count));
    const c = Math.sign(main.curvature[i]);
    if (c && c !== last) {
      n++;
      last = c;
    }
  }
  return n;
}

/** How far the road between builder arc lengths `upper` runs over the road between `lower` where they cross. */
function over(upper: [number, number], lower: [number, number]): number {
  let closest = Infinity;
  let dy = 0;
  for (let s = upper[0]; s < upper[1]; s += 2) {
    const p = pointAt(track.spline, track.mainS(s));
    for (let q = lower[0]; q < lower[1]; q += 2) {
      const r = pointAt(track.spline, track.mainS(q));
      const d = Math.hypot(p.x - r.x, p.z - r.z);
      if (d < closest) {
        closest = d;
        dy = main.heightAtBuilder(s) - main.heightAtBuilder(q);
      }
    }
  }
  expect(closest, `${upper} over ${lower}`).toBeLessThan(3);
  return dy;
}

/** Where the main road crosses itself: for each crossing, the least height between the two roads there. */
function crossings(t: Track): number[] {
  const sp = t.spline;
  const found: { i: number; j: number; dy: number }[] = [];
  for (let i = 0; i < sp.count; i += 4) {
    for (let j = i; j < sp.count; j += 4) {
      const along = sp.dist[j] - sp.dist[i];
      if (Math.min(along, sp.length - along) < 120) continue;
      if (Math.hypot(sp.px[i] - sp.px[j], sp.pz[i] - sp.pz[j]) > 4) continue;
      const dy = Math.abs(t.main.heightAt(sp.dist[i]) - t.main.heightAt(sp.dist[j]));
      const near = found.find((c) => Math.abs(sp.dist[c.i] - sp.dist[i]) < 60 && Math.abs(sp.dist[c.j] - sp.dist[j]) < 60);
      if (near) near.dy = Math.min(near.dy, dy);
      else found.push({ i, j, dy });
    }
  }
  return found.map((c) => c.dy);
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

/** Steers the kart's travel toward a point further along `ribbon` (further the faster it goes). */
function steerAlong(ribbon: Ribbon, s: KartState, progress: number) {
  const sp = ribbon.spline;
  const look = 10 + s.speed * 0.4;
  const p = pointAt(sp, sp.closed ? progress + look : Math.min(progress + look, sp.length));
  const desired = Math.atan2(p.x - s.x, p.z - s.z);
  const travel = s.speed > 4 ? Math.atan2(Math.sin(s.heading) * s.speed + s.extX, Math.cos(s.heading) * s.speed + s.extZ) : s.heading;
  return { ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-wrapAngle(desired - travel) * 2.5, -1, 1) };
}

/**
 * Drives a ribbon (a branch from its start, or the main road from builder
 * arc length `from`) at top speed until the kart passes the main road's
 * pose at builder arc length `to`; reports the time and whether it fell.
 * A boost of `boost` seconds kicks in at ribbon arc length `boostAt`.
 */
function drive(ribbon: Ribbon, to: number, p: ReturnType<typeof kartParams>, boost: number, from?: number, boostAt = -Infinity, lap?: LapContext) {
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
    if (fallen(kart)) return { time: t, fell: true };
    const near = Math.hypot(kart.x - goal.x, kart.z - goal.z) < 30;
    if (near && (kart.x - goal.x) * goal.tx + (kart.z - goal.z) * goal.tz >= 0) return { time: t, fell: false };
  }
  return { time: Infinity, fell: false };
}
