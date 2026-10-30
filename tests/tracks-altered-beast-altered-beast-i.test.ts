import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { HazardSystem, STOMP_BOOST, STOMP_CRUSH, STOMP_FOOT, STOMP_LAG, STOMP_SLOW, STOMP_STAGES, stompLift, stompRing, type HazardPose } from '../src/items/hazards';
import { KART_RADIUS, createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { buildAlteredBeastI } from '../src/tracks/alteredBeastI';
import { TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const SECTIONS = ['A New World', 'Dust Settles', 'Mushroom Cloud', 'By the Meadow', 'I Think I See', 'By the Tree', 'By the Creek', 'In My Dreams', 'Unsteady Gait', 'Tramples the Earth', 'Dust out of Stone', 'Alter Me'];
const first = RACERS[0];
const def = TRACK_LIST.find((t) => t.id === 'altered-beast-i')!.build();
const raw = buildAlteredBeastI();
const track = new Track(raw);
const main = track.main;
const section = (name: string) => raw.main.sections.find((s) => s.name === name)!;

describe('Altered Beast I', () => {
  it('is the song, A New World run into it and Alter Me I after, in its own world: a road of crusted mud, the ruined gate over the start', () => {
    expect(def.theme).toBe('newworld');
    expect(def.music).toEqual({ lap: 'altered-beast-i', finalLap: 'altered-beast-i-final-lap' });
    expect([TRACK_SONGS['altered-beast-i'].title, TRACK_SONGS['altered-beast-i'].also]).toEqual(['Altered Beast I', 'Alter Me I']);
    expect(new Set([...raw.main.sections, ...raw.branches.flatMap((b) => b.sections)].map((s) => s.surface))).toEqual(new Set(['crust']));
    expect(def.landmarks.filter((l) => l.s < 20).map((l) => l.kind)).toEqual(['newWorldGate']);
    expect(def.laps).toBe(3);
    console.log(`Altered Beast I: ${track.length.toFixed(0)} m a lap`);
    expect(track.length).toBeGreaterThan(1800);
    expect(track.length).toBeLessThan(2700);
  });

  it("is laid out after the songs' lines, in the order they're sung", () => {
    expect(raw.main.sections.map((s) => s.name).filter((n) => n !== 'Finish Straight')).toEqual(SECTIONS);
  });

  it('stands the tree in the middle of the hairpin round it, the beast beside it, and the mushroom cloud far off on the horizon', () => {
    const tree = def.landmarks.find((l) => l.kind === 'beastTree')!;
    const by = section('By the Tree');
    expect(tree.s > by.from && tree.s < by.to).toBe(true);
    const p = pointAt(track.spline, track.mainS(tree.s));
    const x = p.x - p.tz * tree.lateral!;
    const z = p.z + p.tx * tree.lateral!;
    // Clear of the road all round it, and inside the hairpin: the road turns round it.
    const hit = nearestOnSpline(track.spline, x, z);
    expect(hit.distance - main.halfWidthAt(hit)).toBeGreaterThan(15);
    const sp = track.spline;
    let around = 0;
    for (let s = by.from; s + 1 <= by.to; s += 1) {
      const a = pointAt(sp, track.mainS(s));
      const b = pointAt(sp, track.mainS(s + 1));
      around += wrapAngle(Math.atan2(b.x - x, b.z - z) - Math.atan2(a.x - x, a.z - z));
    }
    expect(Math.abs(around)).toBeGreaterThan(Math.PI * 0.95);
    const cloud = def.landmarks.find((l) => l.kind === 'mushroomCloud')!;
    expect(Math.abs(cloud.lateral!)).toBeGreaterThan(def.bounds);
  });

  it('crosses itself three times in tiers: the Mushroom Cloud over the trampled path, In My Dreams over the meadow, and Alter Me looping back over itself', () => {
    const over = (upper: string, lower: string, d = 120) => {
      const a = section(upper);
      const b = section(lower);
      let closest = Infinity;
      let dy = 0;
      for (let s = a.from; s < a.to; s += 2) {
        const p = pointAt(track.spline, track.mainS(s));
        for (let q = b.from; q < b.to; q += 2) {
          // Along the lap from each other: where one section runs into the next isn't a crossing.
          if (Math.abs(s - q) < d) continue;
          const r = pointAt(track.spline, track.mainS(q));
          const dist = Math.hypot(p.x - r.x, p.z - r.z);
          if (dist < closest) {
            closest = dist;
            dy = main.heightAtBuilder(s) - main.heightAtBuilder(q);
          }
        }
      }
      expect(closest, `${upper} over ${lower}`).toBeLessThan(3);
      return dy;
    };
    expect(over('Mushroom Cloud', 'Tramples the Earth')).toBeGreaterThan(15);
    expect(over('In My Dreams', 'By the Meadow', 0)).toBeGreaterThan(8);
    expect(Math.abs(over('Alter Me', 'Alter Me'))).toBeGreaterThan(8);
    for (const name of ['Mushroom Cloud', 'In My Dreams', 'Alter Me']) expect(section(name).bridge, name).toBe(true);
    const xs = crossings(track);
    expect(xs.length).toBe(3);
    for (const dy of xs) expect(dy).toBeGreaterThan(6);
    // Alter Me: round a loop of three quarters of a turn and more.
    const alter = section('Alter Me');
    expect(turning(alter.from, alter.to)).toBeGreaterThan(260);
  });

  it('turns right round the tree, swings round a bend in the creek, and lurches one way and the other on an unsteady gait', () => {
    const tree = section('By the Tree');
    expect(Math.max(...bends(tree.from, tree.to).map(Math.abs))).toBeGreaterThan(175);
    const creek = bends(section('By the Creek').from, section('By the Creek').to).filter((deg) => Math.abs(deg) > 40);
    expect(creek.length).toBe(3);
    const gait = section('Unsteady Gait');
    const steps = bends(gait.from + 60, gait.to - 60).filter((deg) => Math.abs(deg) > 8 && Math.abs(deg) < 60);
    expect(steps.length).toBeGreaterThanOrEqual(5);
    for (let k = 1; k < steps.length; k++) expect(Math.sign(steps[k])).toBe(-Math.sign(steps[k - 1]));
  });

  it('sinks the beast\'s trampled path between tall walls of mud, its footfalls coming down it', () => {
    const walled = raw.main.sections.filter((s) => (s.wallHeight ?? 0) >= 5);
    expect(walled.map((s) => s.name)).toEqual(['Tramples the Earth']);
    const path = section('Tramples the Earth');
    const stomps = raw.hazards.filter((h) => h.kind === 'stomps').flatMap((h) => ('at' in h ? h.at : []));
    const inPath = stomps.filter((s) => s > path.from && s < path.to);
    expect(inPath.length).toBeGreaterThanOrEqual(3);
    for (const s of inPath) expect(main.heightAtBuilder(s)).toBeLessThan(-6);
    expect(main.heightAtBuilder((path.from + path.to) / 2)).toBeLessThan(-6);
  });

  it('leaps a rift making dust out of stone: the slowest kart clears it at 50cc', () => {
    expect(raw.main.gaps.length).toBe(1);
    const [a] = raw.main.gaps[0];
    const stone = section('Dust out of Stone');
    expect(a > stone.from && a < stone.to).toBe(true);
    const slow = kartParams(RACERS.find((r) => r.id === 'swamp-witch')!.stats, '50cc');
    expect(jump(track.mainS(a) - 45, slow.topSpeed, slow)).toBe('cleared');
  });

  it('has one to three kickers out of the ruins, on A New World, that launch a kart at 100cc and land it on the road', () => {
    const lips = kickerLips(raw);
    expect(lips.length).toBeGreaterThanOrEqual(1);
    expect(lips.length).toBeLessThanOrEqual(3);
    const p = kartParams(first.stats, '100cc');
    for (const lip of lips) {
      expect(lip).toBeLessThan(section('A New World').to);
      const start = track.mainS(Math.max(0, lip - 7 - 20));
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
        expect(fallen(kart), `kicker at ${lip.toFixed(0)}`).toBe(false);
      }
      expect(launched, `kicker at ${lip.toFixed(0)}`).toBe(true);
      expect(landed).toBe(true);
      expect(track.locate(kart.x, kart.z, kart.y).onRoad).toBe(true);
    }
  });
});

describe('Altered Beast I: Take a Peek, along the creek bed', () => {
  const k = raw.branches.findIndex((b) => b.name === 'Take a Peek');
  const bdef = raw.branches[k];
  const branch = track.branches[k];
  const lap2: LapContext = { lap: 2, lastLap: false };

  it('leaves By the Creek where it swings round the bend and meets it again at the same pose, straight along the creek bed', () => {
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
      expect(main.heightAtBuilder(s)).toBeCloseTo(0, 5);
    }
    for (const end of [bdef.sections[0], bdef.sections[bdef.sections.length - 1]]) expect(end.wallHeight ?? 0).toBe(0);
    for (const s of [bdef.mainFrom, bdef.mainTo]) expect(raw.main.sections.find((q) => s >= q.from && s <= q.to)!.wallHeight ?? 0).toBe(0);
    const creek = section('By the Creek');
    expect(bdef.mainFrom > creek.from && bdef.mainTo < creek.to).toBe(true);
    expect(Math.max(...Array.from(branch.curvature, Math.abs))).toBeLessThan(1e-3);
  });

  it('runs over the creek, which is clear of the main road; keeps clear of the main road away from its ends, and in bounds', () => {
    const creek = raw.pits.filter((p) => p.liquid === 'water');
    expect(creek.length).toBe(1);
    const msp = main.spline;
    for (let i = 0; i < msp.count; i++) expect(inPit({ ...creek[0], halfWidth: creek[0].halfWidth + main.halfWidth[i], halfLength: creek[0].halfLength + main.halfWidth[i] }, msp.px[i], msp.pz[i])).toBe(false);
    const sp = branch.spline;
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(raw.bounds - 20);
      if (sp.dist[i] < 40 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 40 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i], `branch s ${sp.dist[i].toFixed(0)}`).toBeGreaterThan(4);
    }
  });

  it('puts a row of double item boxes on the creek bed', () => {
    expect(raw.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('is under the creek on the first lap, so you drive into the water, and there from the second', () => {
    expect(bdef.openOn).toEqual([2, 'final']);
    expect(bdef.shut).toEqual({ kind: 'flood' });
    const p = kartParams(first.stats, '150cc');
    expect(drive(branch, bdef.mainTo, p, undefined, lap2).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 1, lastLap: false }).fell).toBe(true);
  });

  it('saves 0.8 to 2.5 s at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p, undefined, lap2);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, lap2);
    console.log(`Altered Beast I: Take a Peek ${via.time.toFixed(2)} s, round the creek ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.8);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('Altered Beast I elevation and driving', () => {
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(raw);

  it('climbs 13 m up the Mushroom Cloud and sinks 7 m into the trampled path', () => {
    expect(Math.max(...heights)).toBeGreaterThan(12.5);
    expect(Math.min(...heights)).toBeLessThan(-6.5);
    expect(main.cut.some((x) => x > 0)).toBe(true);
  });

  it('keeps its cuts clear of pits, so the ground opens cleanly round each', () => {
    const sp = main.spline;
    for (let i = 0; i < sp.count; i++) {
      if (!main.cut[i]) continue;
      const near = raw.pits.some((p) => inPit({ ...p, halfLength: p.halfLength + 6, halfWidth: p.halfWidth + 6 }, sp.px[i], sp.pz[i]));
      expect(near, `cut at ${main.toBuilder(sp.dist[i]).toFixed(0)}`).toBe(false);
    }
  });

  it('never runs downhill so steeply that a kart at full speed skips off it', () => {
    for (let s = 0; s + 1 < heights.length; s++) {
      const b = main.toBuilder(s);
      if (lips.some((l) => Math.abs(b - l) < 2) || raw.main.gaps.some(([a, z]) => b > a - 2 && b < z + 2)) continue;
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
      if (ev.launched && !lips.some((l) => Math.abs(b - l) < 6) && !raw.main.gaps.some(([a, z]) => b > a - 4 && b < z + 4)) crests.push(b);
    }
    console.log(`Altered Beast I: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
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

describe("Altered Beast I: the beast's footfalls", () => {
  const h = new HazardSystem(new Track(raw));
  const path = section('Tramples the Earth');
  const row = raw.hazards.find((q) => q.kind === 'stomps' && 'at' in q && q.at[0] > path.from && q.at[0] < path.to)!;
  const period = 'period' in row ? row.period : 0;
  const first = h.poses.findIndex((q) => q.kind === 'stomps');

  it('raises the foot high over the road, brings it down, plants it, and lifts it away', () => {
    const S = STOMP_STAGES;
    expect(stompLift(0.1)).toBeGreaterThan(10);
    expect(stompLift((S.fall + S.land) / 2)).toBeLessThan(stompLift(S.fall));
    expect(stompLift(S.land + 0.01)).toBe(0);
    expect(stompLift(S.lift - 0.01)).toBe(0);
    expect(stompLift(0.99)).toBeCloseTo(stompLift(0), 5);
    // The ring runs out from the foot only after it lands, and is gone before it lifts.
    expect(stompRing(S.land - 0.01, 20)).toBe(0);
    expect(stompRing(S.land + 0.01, 20)).toBeGreaterThanOrEqual(STOMP_FOOT);
    expect(stompRing(S.gone - 0.001, 20)).toBeGreaterThan(19);
    expect(stompRing(S.gone, 20)).toBe(0);
  });

  it('comes down left foot and right, the ring running right across the road from each', () => {
    const sides = new Set<number>();
    let reach = 0;
    for (let t = 0; t < 20; t += 0.02) {
      h.update(t);
      for (const q of h.poses.filter((r) => r.kind === 'stomps')) {
        sides.add(Math.sign(lateral(q)));
        if (!q.active) continue;
        // How far past the far edge of the road the ring has reached.
        const hw = main.halfWidthAt(nearestOnSpline(track.spline, q.ax, q.az));
        reach = Math.max(reach, q.gap - hw - Math.abs(lateral(q)));
      }
    }
    expect(sides).toEqual(new Set([1, -1]));
    expect(reach).toBeGreaterThan(0);
  });

  it('comes closer: the footfalls down the path land one after another, the far ones first', () => {
    const n = 'at' in row ? row.at.length : 0;
    const landings: number[] = [];
    for (let i = 0; i < n; i++) {
      let prev = 1;
      for (let t = 0; t < period * 2; t += 0.005) {
        h.update(t);
        const u = h.poses[first + i].phase;
        if (prev < STOMP_STAGES.land && u >= STOMP_STAGES.land) {
          landings.push(t);
          break;
        }
        prev = u;
      }
    }
    for (let i = 0; i + 1 < n; i++) {
      // The next one along lands this long before; the nearest last.
      const lead = (((landings[i] - landings[i + 1]) % period) + period) % period;
      expect(lead).toBeCloseTo(STOMP_LAG * period, 1);
    }
  });

  it('caught by the ring on the ground, your feet stick to the terrain: slowed, not spun', () => {
    const p = when(h, (q) => q.active && q.gap > STOMP_FOOT + 3);
    const s = onRing(p);
    s.speed = 30;
    const hit = h.collide([s], PHYSICS_DT).filter((e) => e.kart === s);
    expect(hit[0]).toMatchObject({ by: 'stomps' });
    expect(hit[0].good).toBeUndefined();
    expect(s.speed).toBeCloseTo(30 * STOMP_SLOW);
    expect(s.spinTime).toBe(0);
  });

  it('hopped as it passes, the ring is a boost', () => {
    const p = when(h, (q) => q.active && q.gap > STOMP_FOOT + 3);
    const s = onRing(p);
    s.hopAge = 0.1;
    s.speed = 30;
    expect(h.collide([s], PHYSICS_DT)[0]).toMatchObject({ by: 'stomps', good: true });
    expect(s.boostTime).toBeCloseTo(STOMP_BOOST);
    expect(s.speed).toBe(30);
  });

  it('under the foot as it comes down, trampled: spun out; once it stands there, a foot to drive round', () => {
    const landing = when(h, (q) => q.phase >= STOMP_STAGES.land && q.phase < STOMP_STAGES.land + STOMP_CRUSH);
    const under = kartAt(landing);
    under.speed = 20;
    expect(h.collide([under], PHYSICS_DT).find((e) => e.kart === under)).toMatchObject({ by: 'stomps' });
    expect(under.spinTime).toBeGreaterThan(0);
    const planted = when(h, (q) => q.phase > STOMP_STAGES.gone && q.phase < STOMP_STAGES.lift);
    const beside = kartAt(planted);
    beside.x += 0.5;
    h.collide([beside], PHYSICS_DT);
    expect(Math.hypot(beside.x - planted.x, beside.z - planted.z)).toBeGreaterThanOrEqual(STOMP_FOOT + KART_RADIUS - 1e-6);
    expect(beside.spinTime).toBe(0);
  });

  it('raised, the foot touches nothing, and the road is clear of its ring', () => {
    const raised = when(h, (q) => q.phase < STOMP_STAGES.fall);
    expect(raised.active).toBe(false);
    expect(h.collide([kartAt(raised), onRing({ ...raised, gap: 8 })], PHYSICS_DT)).toEqual([]);
  });
});

/** Steps race time until a footfall is in a state `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.01) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'stomps' && ok(q));
    if (p) return { ...p };
  }
  throw new Error('no footfall in that state');
}

/** How far a hazard is to the right of the road's centre. */
function lateral(p: HazardPose): number {
  return (p.x - p.ax) * -Math.cos(p.heading) + (p.z - p.az) * Math.sin(p.heading);
}

/** A kart sitting right on a hazard. */
function kartAt(p: HazardPose): KartState {
  const s = createKartState(p.x, p.z, p.heading);
  s.y = s.groundY = p.ground;
  return s;
}

/** A kart on the road where a footfall's ring is passing: across the road from the foot, toward the middle. */
function onRing(p: HazardPose): KartState {
  const side = lateral(p) > 0 ? -1 : 1;
  const s = createKartState(p.x - Math.cos(p.heading) * side * p.gap, p.z + Math.sin(p.heading) * side * p.gap, p.heading);
  s.y = s.groundY = p.ground;
  return s;
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

/** The road's heading at builder arc length `s`. */
function headingAt(s: number): number {
  const p = pointAt(track.spline, track.mainS(s));
  return Math.atan2(p.tx, p.tz);
}

/** How far the road turns between builder arc lengths `a` and `b`, in degrees, all of it whichever way. */
function turning(a: number, b: number): number {
  let total = 0;
  for (let s = a; s + 1 <= b; s += 1) total += Math.abs(wrapAngle(headingAt(s + 1) - headingAt(s)));
  return (total * 180) / Math.PI;
}

/** The road's bends between `a` and `b`: each run of turning one way, in signed degrees, tiny ones dropped. */
function bends(a: number, b: number): number[] {
  const runs: number[] = [];
  let run = 0;
  for (let s = a; s + 1 <= b; s += 1) {
    const d = (wrapAngle(headingAt(s + 1) - headingAt(s)) * 180) / Math.PI;
    if (Math.abs(d) < 0.05) continue;
    if (run && Math.sign(d) !== Math.sign(run)) {
      runs.push(run);
      run = 0;
    }
    run += d;
  }
  if (run) runs.push(run);
  return runs.filter((r) => Math.abs(r) > 5);
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

/** Steers the kart's travel toward a point further along `ribbon` (further the faster it goes), as the autopilot in tests/track.test.ts does. */
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
 * arc length `from`) at top speed, on lap `lap`, until the kart passes the
 * main road's pose at builder arc length `to`; reports the time and
 * whether it fell.
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

/** Drives straight down the main road from spline arc length `s` at `speed` and reports whether the kart landed or fell. */
function jump(s: number, speed: number, p: ReturnType<typeof kartParams>) {
  const pt = pointAt(main.spline, s);
  const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
  kart.y = kart.groundY = main.heightAt(s);
  kart.speed = speed;
  let progress = s;
  for (let t = 0; t < 4; t += PHYSICS_DT) {
    stepKart(kart, steerAlong(main, kart, progress), p, track, PHYSICS_DT);
    progress = nearestOnSpline(main.spline, kart.x, kart.z).s;
    if (fallen(kart)) return 'fell';
  }
  return 'cleared';
}
