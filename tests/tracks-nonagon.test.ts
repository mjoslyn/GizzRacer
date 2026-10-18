import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { buildInfiniteLoopSpeedway } from '../src/tracks/infiniteLoopSpeedway';
import { buildPolygondwanalandJungle } from '../src/tracks/polygondwanalandJungle';
import { buildRattlesnakeRun } from '../src/tracks/rattlesnakeRun';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, type TrackDef } from '../src/tracks/track';
import { buildVolcanoFortress } from '../src/tracks/volcanoFortress';

/** The Nonagon Cup's shortcuts: each track's branch, and how much of each end may run alongside the main road. */
const CUP: { name: string; build: () => TrackDef; near: number }[] = [
  { name: 'Infinite Loop Speedway', build: buildInfiniteLoopSpeedway, near: 60 },
  { name: 'Rattlesnake Run', build: buildRattlesnakeRun, near: 55 },
  { name: 'Volcano Fortress', build: buildVolcanoFortress, near: 50 },
  { name: 'Polygondwanaland Jungle', build: buildPolygondwanalandJungle, near: 55 },
];

const lizard = RACERS[0];

/** Builder arc lengths where a kicker's lip drops sheer back to the road. */
function kickerLips(elevation: [number, number][]): number[] {
  const lips: number[] = [];
  for (let i = 1; i < elevation.length; i++) {
    const [s0, y0] = elevation[i - 1];
    const [s1, y1] = elevation[i];
    if (s1 - s0 < 1e-6 && y0 - y1 > 0.5) lips.push(s1);
  }
  return lips;
}

/** Steers toward a point 14 m further along a ribbon. */
function autopilot(track: Track, ribbon: number, s: KartState) {
  const sp = track.ribbon(ribbon).spline;
  const hit = nearestOnSpline(sp, s.x, s.z);
  const p = pointAt(sp, sp.closed ? hit.s + 14 : Math.min(hit.s + 14, sp.length));
  const err = wrapAngle(Math.atan2(p.x - s.x, p.z - s.z) - s.heading);
  return { ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) };
}

/** Signed distance of the kart past a pose, along its heading. */
function past(s: KartState, p: { x: number; z: number; tx: number; tz: number }): number {
  return (s.x - p.x) * p.tx + (s.z - p.z) * p.tz;
}

/**
 * Seconds from passing mainFrom to passing mainTo at 150cc, flat out from
 * 60 m before the split: along the main road, or taking the branch.
 */
function splitTime(track: Track, branch: number, viaBranch: boolean, boost = 0): number {
  const def = track.def.branches[branch];
  const p = kartParams(lizard.stats, '150cc');
  const from = pointAt(track.spline, track.mainS(def.mainFrom));
  const to = pointAt(track.spline, track.mainS(def.mainTo));
  const s0 = pointAt(track.spline, track.mainS(def.mainFrom - 60));
  const kart = createKartState(s0.x, s0.z, Math.atan2(s0.tx, s0.tz));
  kart.y = kart.groundY = track.main.heightAt(track.mainS(def.mainFrom - 60));
  kart.speed = p.topSpeed;
  let t0 = -1;
  for (let t = 0; t < 30; t += PHYSICS_DT) {
    const started = t0 >= 0;
    if (!started && past(kart, from) >= 0) {
      t0 = t;
      kart.boostTime = Math.max(kart.boostTime, boost);
    }
    stepKart(kart, autopilot(track, started && viaBranch ? branch : -1, kart), p, track, PHYSICS_DT);
    if (kart.y < -2) return Infinity;
    if (started && past(kart, to) >= 0 && Math.hypot(kart.x - to.x, kart.z - to.z) < 20) return t - t0;
  }
  return Infinity;
}

/** Drives straight down a ribbon from arc length `s` and reports whether the kart landed or fell. */
function jump(track: Track, s: number, ribbon: number, speed: number, boost: number, p: ReturnType<typeof kartParams>) {
  const r = track.ribbon(ribbon);
  const pt = pointAt(r.spline, s);
  const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
  kart.y = kart.groundY = r.heightAt(s);
  kart.speed = speed;
  kart.boostTime = boost;
  for (let t = 0; t < 4; t += PHYSICS_DT) {
    stepKart(kart, { ...NEUTRAL_INPUT, throttle: 1 }, p, track, PHYSICS_DT);
    if (kart.y < -2) return 'fell';
  }
  return 'cleared';
}

describe.each(CUP)('$name', ({ build, near }) => {
  const def = build();
  const track = new Track(def);
  const branch = def.branches[0];
  const ribbon = track.branches[0];

  it('has a shortcut whose ends meet the main road', () => {
    expect(branch).toBeDefined();
    for (const [bs, ms] of [
      [0, branch.mainFrom],
      [ribbon.spline.length, branch.mainTo],
    ]) {
      const a = pointAt(ribbon.spline, bs);
      const m = pointAt(track.spline, track.mainS(ms));
      expect(Math.hypot(a.x - m.x, a.z - m.z)).toBeLessThan(1);
      expect(Math.abs(wrapAngle(Math.atan2(a.tx, a.tz) - Math.atan2(m.tx, m.tz)))).toBeLessThan((3 * Math.PI) / 180);
    }
  });

  it('keeps the shortcut clear of the main road and its walls away from the junctions', () => {
    const sp = ribbon.spline;
    let gap = Infinity;
    for (let i = 0; i < sp.count; i++) {
      if (sp.dist[i] < near || sp.dist[i] > sp.length - near) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      gap = Math.min(gap, hit.distance - track.main.halfWidthAt(hit) - ribbon.halfWidth[i]);
    }
    expect(gap).toBeGreaterThan(4);
    // Wherever the main road has a barrier, the shortcut stays out of its reach.
    for (let i = 0; i < sp.count; i++) {
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      if (track.main.wallHeight[hit.index] > 0) expect(hit.distance - ribbon.halfWidth[i]).toBeGreaterThan(track.main.halfWidthAt(hit) + 3);
    }
    // And the shortcut's own ends are open.
    expect(branch.sections[0].wallHeight ?? 0).toBe(0);
    expect(branch.sections[branch.sections.length - 1].wallHeight ?? 0).toBe(0);
  });

  it('a kart driving down the shortcut with a little boost reaches the rejoin', () => {
    expect(splitTime(track, 0, true, 1)).toBeLessThan(Infinity);
  });

  it('the shortcut beats the main line at 150cc', () => {
    const main = splitTime(track, 0, false);
    const cut = splitTime(track, 0, true);
    console.log(`${def.name}: main ${main.toFixed(2)} s, ${branch.name} ${cut.toFixed(2)} s, saves ${(main - cut).toFixed(2)} s`);
    expect(cut).toBeLessThan(main);
  });

  it('puts double item boxes on the shortcut', () => {
    const rows = def.itemBoxes.filter((r) => r.ribbon === 0 && r.double);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.s).toBeLessThan(branch.length);
  });

  const lips = kickerLips(def.main.elevation);
  it('has one to three kickers', () => {
    expect(lips.length).toBeGreaterThanOrEqual(1);
    expect(lips.length).toBeLessThanOrEqual(3);
  });

  it.each(lips.map((s) => [s]))('the kicker at %d launches a 100cc kart that lands on the road', (lip) => {
    const p = kartParams(lizard.stats, '100cc');
    const s = track.mainS(lip - 30);
    const pt = pointAt(track.spline, s);
    const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
    kart.y = kart.groundY = track.main.heightAt(s);
    kart.speed = p.topSpeed;
    let launched = false;
    let landed = false;
    for (let t = 0; t < 3; t += PHYSICS_DT) {
      const ev = stepKart(kart, autopilot(track, -1, kart), p, track, PHYSICS_DT);
      launched ||= ev.launched;
      if (launched && ev.landed > 0) {
        landed = true;
        expect(track.locate(kart.x, kart.z, kart.y, kart.trackHint).onRoad).toBe(true);
      }
      expect(kart.y).toBeGreaterThan(-1);
    }
    expect(launched).toBe(true);
    expect(landed).toBe(true);
    expect(track.locate(kart.x, kart.z, kart.y, kart.trackHint).onRoad).toBe(true);
  });
});

describe('The Fourth Colour', () => {
  const def = buildPolygondwanalandJungle();
  const track = new Track(def);
  const gapStart = def.branches[0].gaps[0][0];

  it('clears the river at 150cc flat out, and at 100cc only with an orange mini-turbo', () => {
    for (const r of RACERS) {
      const fast = kartParams(r.stats, '150cc');
      expect(jump(track, gapStart - 25, 0, fast.topSpeed, 0, fast), r.id).toBe('cleared');
      const mid = kartParams(r.stats, '100cc');
      expect(jump(track, gapStart - 25, 0, mid.topSpeed, 1, mid), r.id).toBe('cleared');
      expect(jump(track, gapStart - 25, 0, mid.topSpeed, 0, mid), r.id).toBe('fell');
    }
  });
});
