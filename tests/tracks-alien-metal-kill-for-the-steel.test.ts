import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { HazardSystem, MAGNET_FIELD, MAGNET_FLING, MAGNET_STAGES, magnetSwing, type HazardPose } from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { buildKillForTheSteel } from '../src/tracks/killForTheSteel';
import { TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const SECTIONS = ["We Don't Wish Death", 'Upon You', 'No Bad Luck', 'No Ill Will', 'Kill for the Steel', 'Level Five'];
const first = RACERS[0];
const def = TRACK_LIST.find((t) => t.id === 'kill-for-the-steel')!.build();
const raw = buildKillForTheSteel();
const track = new Track(raw);
const main = track.main;
const section = (name: string) => raw.main.sections.find((s) => s.name === name)!;

describe('Kill for the Steel', () => {
  it('is the song, in its own world: an open-cut mine, a haul road of crushed ore, the girder gate over the start', () => {
    expect(def.theme).toBe('steelwar');
    expect(def.music).toEqual({ lap: 'kill-for-the-steel', finalLap: 'kill-for-the-steel-final-lap' });
    expect(TRACK_SONGS['kill-for-the-steel'].title).toBe('Kill for the Steel');
    expect(new Set([...raw.main.sections, ...raw.branches.flatMap((b) => b.sections)].map((s) => s.surface))).toEqual(new Set(['ore']));
    expect(def.landmarks.filter((l) => l.s < 20).map((l) => l.kind)).toEqual(['steelGate']);
    expect(def.laps).toBe(3);
    console.log(`Kill for the Steel: ${track.length.toFixed(0)} m a lap`);
    expect(track.length).toBeGreaterThan(1800);
    expect(track.length).toBeLessThan(2700);
  });

  it("is laid out after the song's lines, in the order they're sung", () => {
    expect(raw.main.sections.map((s) => s.name).filter((n) => n !== 'Finish Straight')).toEqual(SECTIONS);
  });

  it('goes down the mine in terraces: round the top bench stepping down, a hairpin down to the bench below and back the other way, a hairpin down again to the floor', () => {
    // The top bench steps down, level a while between each step.
    const upon = section('Upon You');
    const ys: number[] = [];
    for (let s = upon.from; s <= upon.to; s += 2) ys.push(main.heightAtBuilder(s));
    for (let k = 1; k < ys.length; k++) expect(ys[k]).toBeLessThanOrEqual(ys[k - 1] + 1e-6);
    expect(ys[0]).toBeCloseTo(0, 5);
    expect(ys[ys.length - 1]).toBeLessThan(-3.5);
    const level = ys.filter((y, k) => k > 0 && Math.abs(y - ys[k - 1]) < 1e-3 && y < -0.5 && y > ys[ys.length - 1] + 0.5);
    expect(level.length).toBeGreaterThan(10);
    // Round the pit one way, then hairpins down and back the other way, and round again the first way.
    const luck = section('No Bad Luck');
    const turns = bends(luck.from, luck.to).filter((deg) => Math.abs(deg) > 60);
    expect(turns.length).toBe(3);
    const way = Math.sign(turns[0]);
    expect(turns.map(Math.sign)).toEqual([way, -way, way]);
    expect(Math.sign(bends(upon.from + 5, upon.to - 5)[0])).toBe(way);
    // The first hairpin, half a turn; back round the bench below and the second hairpin, half a turn more; round the floor.
    expect(Math.abs(turns[0])).toBeGreaterThan(175);
    expect(Math.abs(turns[1])).toBeGreaterThan(270);
    expect(Math.abs(turns[2])).toBeGreaterThan(150);
    // Each bench deeper than the one above it, the floor 8 m down.
    expect(main.heightAtBuilder(luck.from + (luck.to - luck.from) * 0.3)).toBeLessThan(-5);
    expect(main.heightAtBuilder(luck.to - 30)).toBeLessThan(-7.5);
  });

  it('climbs back up out of it on the ore conveyor, straight over all three benches: three crossings, the conveyor high over each', () => {
    const conveyor = section('Kill for the Steel');
    expect(conveyor.bridge).toBe(true);
    expect(over('Kill for the Steel', 'Upon You')).toBeGreaterThan(8);
    expect(over('Kill for the Steel', 'No Bad Luck')).toBeGreaterThan(6);
    const xs = crossings(track);
    expect(xs.length).toBe(3);
    for (const dy of xs) expect(dy).toBeGreaterThan(6);
    // Straight out of the pit, 12 m up at its head.
    expect(Math.max(...Array.from({ length: 100 }, (_, k) => Math.abs(curvatureAt(conveyor.from + 15 + k))))).toBeLessThan(1e-3);
    expect(Math.max(...Array.from({ length: Math.ceil(conveyor.to - conveyor.from) }, (_, k) => main.heightAtBuilder(conveyor.from + k)))).toBeGreaterThan(11.5);
  });

  it('sinks the pit floor between tall walls, the cranes swinging their magnets across it', () => {
    const walled = raw.main.sections.filter((s) => (s.wallHeight ?? 0) >= 5);
    expect(walled.map((s) => s.name)).toEqual(['No Bad Luck']);
    const luck = section('No Bad Luck');
    const magnets = raw.hazards.filter((h) => h.kind === 'magnets').flatMap((h) => ('at' in h ? h.at : []));
    const onFloor = magnets.filter((s) => s > luck.from && s < luck.to && main.heightAtBuilder(s) < -7.5);
    expect(onFloor.length).toBeGreaterThanOrEqual(3);
    expect(main.heightAtBuilder((luck.from + luck.to) / 2)).toBeLessThan(-4);
  });

  it('tips you off the conveyor\'s head and over the crusher: the slowest kart clears it at 50cc', () => {
    expect(raw.main.gaps.length).toBe(1);
    const [a] = raw.main.gaps[0];
    const kill = section('Kill for the Steel');
    expect(a > kill.from && a < kill.to).toBe(true);
    const slow = kartParams(RACERS.find((r) => r.id === 'swamp-witch')!.stats, '50cc');
    expect(jump(track.mainS(a) - 45, slow.topSpeed, slow)).toBe('cleared');
  });

  it('stands the mining rig out on the rim, clear of the road', () => {
    const rig = def.landmarks.find((l) => l.kind === 'mineRig')!;
    expect(Math.abs(rig.lateral!)).toBeGreaterThanOrEqual(100);
    const p = pointAt(track.spline, track.mainS(rig.s));
    const x = p.x - p.tz * rig.lateral!;
    const z = p.z + p.tx * rig.lateral!;
    const hit = nearestOnSpline(track.spline, x, z);
    expect(hit.distance - main.halfWidthAt(hit)).toBeGreaterThan(60);
    expect(Math.max(Math.abs(x), Math.abs(z))).toBeLessThan(raw.bounds - 30);
  });

  it('has one to three kickers along the rim, on We Don\'t Wish Death, that launch a kart at 100cc and land it on the road', () => {
    const lips = kickerLips(raw);
    expect(lips.length).toBeGreaterThanOrEqual(1);
    expect(lips.length).toBeLessThanOrEqual(3);
    const p = kartParams(first.stats, '100cc');
    for (const lip of lips) {
      expect(lip).toBeLessThan(section("We Don't Wish Death").to);
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

describe('Kill for the Steel: Ill Will, down the pit wall', () => {
  const k = raw.branches.findIndex((b) => b.name === 'Ill Will');
  const bdef = raw.branches[k];
  const branch = track.branches[k];
  const lap2: LapContext = { lap: 2, lastLap: false };

  it('leaves No Ill Will where it swings round the open pit and meets it again at the same pose, straight across', () => {
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
    const will = section('No Ill Will');
    expect(bdef.mainFrom > will.from && bdef.mainTo <= will.to).toBe(true);
    expect(Math.max(...Array.from(branch.curvature, Math.abs))).toBeLessThan(1e-3);
  });

  it('dives down into the open pit and up the other side, rail-less; keeps clear of the main road away from its ends, and in bounds', () => {
    expect(Math.min(...bdef.elevation.map(([, y]) => y))).toBeLessThan(-4);
    for (const sec of bdef.sections) expect(sec.wallHeight ?? 0).toBe(0);
    const pit = raw.pits.find((p) => inPit(p, pointAt(branch.spline, branch.spline.length / 2).x, pointAt(branch.spline, branch.spline.length / 2).z))!;
    expect(pit).toBeTruthy();
    expect(pit.liquid).toBeUndefined();
    const msp = main.spline;
    for (let i = 0; i < msp.count; i++) expect(inPit(pit, msp.px[i], msp.pz[i])).toBe(false);
    const sp = branch.spline;
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(raw.bounds - 20);
      if (sp.dist[i] < 40 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 40 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i], `branch s ${sp.dist[i].toFixed(0)}`).toBeGreaterThan(4);
    }
  });

  it('puts a row of double item boxes down in the pit', () => {
    expect(raw.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('is opened from the second lap: on the first there is nothing over the pit, and you fall', () => {
    expect(bdef.openOn).toEqual([2, 'final']);
    expect(bdef.shut).toEqual({ kind: 'vanish' });
    const p = kartParams(first.stats, '150cc');
    expect(drive(branch, bdef.mainTo, p, undefined, lap2).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 3, lastLap: true }).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 1, lastLap: false }).fell).toBe(true);
  });

  it('saves 0.8 to 2.5 s at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p, undefined, lap2);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, lap2);
    console.log(`Kill for the Steel: Ill Will ${via.time.toFixed(2)} s, round the pit ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.8);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('Kill for the Steel elevation and driving', () => {
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(raw);

  it('climbs 12 m up the conveyor and sinks 8 m to the pit floor', () => {
    expect(Math.max(...heights)).toBeGreaterThan(11.5);
    expect(Math.min(...heights)).toBeLessThan(-7.5);
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
    console.log(`Kill for the Steel: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
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

describe("Kill for the Steel: the cranes' magnets", () => {
  const h = new HazardSystem(new Track(raw));
  const floorRow = raw.hazards.find((q) => q.kind === 'magnets' && 'at' in q && q.at.length === 3)!;
  const period = 'period' in floorRow ? floorRow.period : 0;
  const firstMagnet = h.poses.findIndex((q) => q.kind === 'magnets');

  it('swings from the edge it switches on at right across the road while it is on, and back again dark', () => {
    const M = MAGNET_STAGES;
    expect(magnetSwing(M.on)).toBeCloseTo(1, 5);
    expect(magnetSwing(M.off)).toBeCloseTo(-1, 5);
    expect(magnetSwing((M.on + M.off) / 2)).toBeCloseTo(0, 5);
    // Smoothly, all the way round.
    for (let u = 0; u < 1; u += 0.001) expect(Math.abs(magnetSwing(u + 0.001) - magnetSwing(u))).toBeLessThan(0.02);
    expect(magnetSwing(1 - 1e-6)).toBeCloseTo(magnetSwing(0), 4);
    // Each down the row sweeps the other way from the one before, a beat behind it.
    const sides = h.poses.slice(firstMagnet, firstMagnet + 3).map((q) => q.side);
    expect(sides).toEqual([1, -1, 1]);
    let most = 0;
    let least = 0;
    for (let t = 0; t < period; t += 0.02) {
      h.update(t);
      const q = h.poses[firstMagnet];
      most = Math.max(most, lateral(q));
      least = Math.min(least, lateral(q));
    }
    const hw = main.halfWidthAt(nearestOnSpline(track.spline, h.poses[firstMagnet].ax, h.poses[firstMagnet].az));
    expect(most).toBeGreaterThan(hw * 0.7);
    expect(least).toBeLessThan(-hw * 0.7);
  });

  it('switched on, it drags a kart under it toward it and holds it back: not spun, and not a boost', () => {
    const p = when(h, (q) => q.active && q.phase > MAGNET_STAGES.on + 0.05 && q.phase < MAGNET_STAGES.off - 0.05);
    const s = beside(p, 3);
    s.speed = 30;
    const hit = h.collide([s], PHYSICS_DT).filter((e) => e.kart === s);
    expect(hit[0]).toMatchObject({ by: 'magnets' });
    expect(hit[0].good).toBeUndefined();
    expect(s.speed).toBeLessThan(30);
    expect(s.spinTime).toBe(0);
    // Pulled toward the magnet: across the road, to its side.
    expect((s.extX * (p.x - s.x) + s.extZ * (p.z - s.z)) / Math.hypot(p.x - s.x, p.z - s.z)).toBeGreaterThan(0);
    // It keeps on dragging, tick after tick, while you're under it.
    const pulled = Math.hypot(s.extX, s.extZ);
    h.collide([s], PHYSICS_DT);
    expect(Math.hypot(s.extX, s.extZ)).toBeGreaterThan(pulled);
  });

  it('under it as it switches off, it flings you on: a boost', () => {
    const p = when(h, (q) => q.phase >= MAGNET_STAGES.off + 0.01 && q.phase < MAGNET_STAGES.flung - 0.01);
    expect(p.active).toBe(false);
    const s = beside(p, 2);
    s.speed = 25;
    expect(h.collide([s], PHYSICS_DT)[0]).toMatchObject({ by: 'magnets', good: true });
    expect(s.boostTime).toBeCloseTo(MAGNET_FLING);
    expect(s.speed).toBe(25);
  });

  it('dark or charging, it touches nothing; switched on, nothing past its field', () => {
    for (const ok of [(q: HazardPose) => q.phase < MAGNET_STAGES.charge, (q: HazardPose) => q.phase >= MAGNET_STAGES.charge && q.phase < MAGNET_STAGES.on - 0.01, (q: HazardPose) => q.phase >= MAGNET_STAGES.flung + 0.01]) {
      const p = when(h, ok);
      const s = beside(p, 1);
      s.speed = 25;
      expect(h.collide([s], PHYSICS_DT)).toEqual([]);
      expect(s.extX).toBe(0);
    }
    const on = when(h, (q) => q.active);
    expect(h.collide([beside(on, MAGNET_FIELD + 2)], PHYSICS_DT)).toEqual([]);
  });
});

/** Steps race time until a magnet is in a state `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.01) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'magnets' && ok(q));
    if (p) return { ...p };
  }
  throw new Error('no magnet in that state');
}

/** How far a hazard is to the right of the road's centre. */
function lateral(p: HazardPose): number {
  return (p.x - p.ax) * -Math.cos(p.heading) + (p.z - p.az) * Math.sin(p.heading);
}

/** A kart on the road `d` metres from under a magnet, toward the road's middle. */
function beside(p: HazardPose, d: number): KartState {
  const side = lateral(p) > 0 ? -1 : 1;
  const s = createKartState(p.x - Math.cos(p.heading) * side * d, p.z + Math.sin(p.heading) * side * d, p.heading);
  s.y = s.groundY = p.ground;
  return s;
}

/** How high `upper` runs over `lower` where they cross (the closest they come in plan, at least 120 m apart along the lap). */
function over(upper: string, lower: string): number {
  const a = section(upper);
  const b = section(lower);
  let closest = Infinity;
  let dy = 0;
  for (let s = a.from; s < a.to; s += 2) {
    const p = pointAt(track.spline, track.mainS(s));
    for (let q = b.from; q < b.to; q += 2) {
      if (Math.abs(s - q) < 120) continue;
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
}

/** Where the main road crosses itself: for each crossing, the least height between the two roads there. */
function crossings(t: Track): number[] {
  const sp = t.spline;
  const found: { i: number; j: number; dy: number }[] = [];
  for (let i = 0; i < sp.count; i += 2) {
    for (let j = i; j < sp.count; j += 1) {
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

/** The road's curvature at builder arc length `s` (rad/m). */
function curvatureAt(s: number): number {
  return wrapAngle(headingAt(s + 0.5) - headingAt(s - 0.5));
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
