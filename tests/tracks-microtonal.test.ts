import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { Race } from '../src/core/race';
import { clamp, wrapAngle } from '../src/core/math';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { buildButterflySkyway } from '../src/tracks/butterflySkyway';
import { buildCyboogieCity } from '../src/tracks/cyboogieCity';
import { buildFishiesLagoon } from '../src/tracks/fishiesLagoon';
import { buildIceVGlacier } from '../src/tracks/iceVGlacier';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, shortcutLap, type Ribbon, type TrackDef } from '../src/tracks/track';

/** A shortcut jump's design: at `engine`, every racer clears it at `clear` and falls at `fail` (speed as a share of top speed, boost seconds). */
interface JumpSpec {
  engine: '100cc' | '150cc';
  clear: { speed: number; boost: number };
  fail: { speed: number; boost: number };
}

/**
 * The shortcuts and kickers of the old Microtonal Cup's tracks (Open Water, Ice V, Doom City, Sleep Drifter). `jump` is the design of the
 * shortcut's jump, if it has one; `boostAt` is where the test autopilot
 * takes a mini-turbo on the shortcut (metres into the route) to clear it.
 */
const CASES: { name: string; build: () => TrackDef; jump?: JumpSpec; boostAt?: number }[] = [
  { name: 'Open Water', build: buildFishiesLagoon },
  { name: 'Ice V', build: buildIceVGlacier, jump: { engine: '100cc', clear: { speed: 1.35, boost: 1 }, fail: { speed: 1, boost: 0 } }, boostAt: 40 },
  { name: 'Doom City', build: buildCyboogieCity, jump: { engine: '100cc', clear: { speed: 1.35, boost: 1 }, fail: { speed: 1, boost: 0 } }, boostAt: 42 },
  { name: 'Sleep Drifter', build: buildButterflySkyway },
];

/** How far from a junction (m) the branch may still run beside the main road. */
/** Metres from a junction within which the shortcut may still share road with the main line (longer the wider the roads). */
const JUNCTION = 50 * ROAD_WIDTH_SCALE;

const MID = kartParams(RACERS[0].stats, '100cc');
const FAST = kartParams(RACERS[0].stats, '150cc');

/** Kickers: elevation keys that drop a metre or more at one arc length (gap ramps drop over a gap instead). */
function kickers(r: Ribbon): number[] {
  const keys = r.def.elevation;
  const out: number[] = [];
  for (let k = 1; k < keys.length; k++) {
    if (keys[k][0] === keys[k - 1][0] && keys[k - 1][1] - keys[k][1] >= 1) out.push(keys[k][0]);
  }
  return out;
}

const heading = (tx: number, tz: number) => Math.atan2(tx, tz);

/** A route as a polyline of road points: main up to the branch, the branch, main after it (or main all the way). */
function route(track: Track, branch: number | null, before: number, after: number) {
  const def = branch === null ? null : track.def.branches[branch];
  const b = track.def.branches[0];
  const pts: { x: number; z: number }[] = [];
  const add = (r: Ribbon, s0: number, s1: number) => {
    for (let s = s0; s < s1; s += 1) pts.push(pointAt(r.spline, s));
  };
  const from = track.mainS(b.mainFrom);
  const to = track.mainS(b.mainTo);
  if (def) {
    add(track.main, from - before, from);
    add(track.ribbon(branch!), 0, track.ribbon(branch!).spline.length);
    add(track.main, to, to + after);
  } else {
    add(track.main, from - before, to + after);
  }
  return pts;
}

/**
 * Drives a route with the test autopilot (steer to a point 14 m ahead,
 * full throttle) and returns the time to its end, or null on a fall.
 * `boostAt` gives a 1 s boost (a mini-turbo or Fuzz Pedal) that many metres into the route.
 */
function driveRoute(track: Track, pts: { x: number; z: number }[], p: ReturnType<typeof kartParams>, boostAt?: number) {
  const a = pts[0];
  const b = pts[1];
  const kart = createKartState(a.x, a.z, heading(b.x - a.x, b.z - a.z));
  Object.assign(kart, shortcutLap(track.def));
  kart.y = kart.groundY = track.locate(a.x, a.z, 100).height;
  kart.speed = p.topSpeed;
  let i = 0;
  for (let t = 0; t < 30; t += PHYSICS_DT) {
    while (i < pts.length - 1 && Math.hypot(pts[i + 1].x - kart.x, pts[i + 1].z - kart.z) < Math.hypot(pts[i].x - kart.x, pts[i].z - kart.z)) i++;
    if (i >= pts.length - 2) return t;
    if (boostAt !== undefined && i === boostAt) kart.boostTime = Math.max(kart.boostTime, 1);
    const aim = pts[Math.min(i + 14, pts.length - 1)];
    const err = wrapAngle(heading(aim.x - kart.x, aim.z - kart.z) - kart.heading);
    stepKart(kart, { ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) }, p, track, PHYSICS_DT);
    if (fallen(track, kart)) return null;
  }
  return null;
}

/** Below the ground and not on a road there (a cut or the Coral Causeway's dive holds you up): fallen. */
function fallen(track: Track, kart: KartState): boolean {
  if (kart.y > -2) return false;
  const loc = track.locate(kart.x, kart.z, kart.y, kart.trackHint);
  return !(loc.onRoad && kart.y > loc.height - 1.5);
}

/** Drives straight down a ribbon from arc length `s` and reports whether the kart landed or fell. */
function jump(track: Track, s: number, ribbon: number, speed: number, boost: number, p: ReturnType<typeof kartParams>) {
  const r = track.ribbon(ribbon);
  const pt = pointAt(r.spline, s);
  const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
  Object.assign(kart, shortcutLap(track.def));
  kart.y = kart.groundY = r.heightAt(s);
  kart.speed = speed;
  kart.boostTime = boost;
  for (let t = 0; t < 4; t += PHYSICS_DT) {
    stepKart(kart, { ...NEUTRAL_INPUT, throttle: 1 }, p, track, PHYSICS_DT);
    if (fallen(track, kart)) return 'fell';
  }
  return 'cleared';
}

/** Follows a ribbon from arc length s for `time` seconds; reports launches, landings off the road, wall hits and falls. */
function followRibbon(track: Track, ribbon: number, s: number, time: number, p: ReturnType<typeof kartParams>) {
  const r = track.ribbon(ribbon);
  const pt = pointAt(r.spline, s);
  const kart: KartState = createKartState(pt.x, pt.z, heading(pt.tx, pt.tz));
  Object.assign(kart, shortcutLap(track.def));
  kart.y = kart.groundY = r.heightAt(s);
  kart.speed = p.topSpeed;
  let launched = false;
  let offLanding = false;
  let walls = 0;
  for (let t = 0; t < time; t += PHYSICS_DT) {
    const hit = nearestOnSpline(r.spline, kart.x, kart.z);
    const aim = pointAt(r.spline, hit.s + 14);
    const err = wrapAngle(heading(aim.x - kart.x, aim.z - kart.z) - kart.heading);
    const ev = stepKart(kart, { ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) }, p, track, PHYSICS_DT);
    if (ev.launched) launched = true;
    if (ev.landed && !track.locate(kart.x, kart.z, kart.y).onRoad) offLanding = true;
    if (ev.wallHit > 0 && hit.s < r.spline.length - 2) walls++;
    if (fallen(track, kart)) return { launched, offLanding, walls, fell: true, end: kart };
  }
  return { launched, offLanding, walls, fell: false, end: kart };
}

describe.each(CASES)('$name', ({ build, jump: spec, boostAt }) => {
  const def = build();
  const track = new Track(def);
  const main = track.main;

  it('has a shortcut branch whose ends meet the main road', () => {
    expect(def.branches.length).toBeGreaterThan(0);
    for (const b of def.branches) {
      const r = new Track(def).branches[def.branches.indexOf(b)];
      const sp = r.spline;
      for (const [k, ms] of [[0, b.mainFrom], [sp.count - 1, b.mainTo]] as const) {
        const m = pointAt(main.spline, track.mainS(ms));
        expect(Math.hypot(sp.px[k] - m.x, sp.pz[k] - m.z)).toBeLessThan(1);
        expect(Math.abs(wrapAngle(heading(sp.tx[k], sp.tz[k]) - heading(m.tx, m.tz)))).toBeLessThan((3 * Math.PI) / 180);
      }
      expect(b.mainTo).toBeGreaterThan(b.mainFrom);
    }
  });

  it('keeps the branch clear of the main road away from its junctions', () => {
    const r = track.branches[0];
    const sp = r.spline;
    // Pairs of points both within JUNCTION of the same junction are the fork itself.
    const ends = [0, sp.count - 1].map((k) => ({ x: sp.px[k], z: sp.pz[k] }));
    const near = (x: number, z: number) => ends.map((e) => Math.hypot(x - e.x, z - e.z) < JUNCTION);
    const m = main.spline;
    let min = Infinity;
    for (let j = 0; j < m.count; j++) {
      const nm = near(m.px[j], m.pz[j]);
      for (let i = 0; i < sp.count; i++) {
        const nb = near(sp.px[i], sp.pz[i]);
        if ((nm[0] && nb[0]) || (nm[1] && nb[1])) continue;
        min = Math.min(min, Math.hypot(sp.px[i] - m.px[j], sp.pz[i] - m.pz[j]) - main.halfWidth[j] - r.halfWidth[i]);
      }
    }
    console.log(`${def.name}: branch ${sp.length.toFixed(0)} m, closest approach to main away from junctions ${min.toFixed(1)} m`);
    expect(min).toBeGreaterThan(4);
  });

  it("keeps the shortcut's pits out from under the main road", () => {
    const r = track.branches[0];
    const m = main.spline;
    for (const pit of def.pits.filter((p) => nearestOnSpline(r.spline, p.x, p.z).distance < 1)) {
      for (let j = 0; j < m.count; j++) {
        for (const f of [-1, 0, 1]) {
          const x = m.px[j] - m.tz[j] * f * main.halfWidth[j];
          const z = m.pz[j] + m.tx[j] * f * main.halfWidth[j];
          expect(inPit(pit, x, z)).toBe(false);
        }
      }
    }
  });

  it.runIf(spec)('the shortcut jump is cleared as designed, and failed without', () => {
    const gapStart = def.branches[0].gaps[0][0] * track.branches[0].scale;
    for (const r of RACERS) {
      const p = kartParams(r.stats, spec!.engine);
      expect(jump(track, gapStart - 20, 0, p.topSpeed * spec!.clear.speed, spec!.clear.boost, p), r.id).toBe('cleared');
      expect(jump(track, gapStart - 20, 0, p.topSpeed * spec!.fail.speed, spec!.fail.boost, p), r.id).toBe('fell');
    }
  });

  it('a kart with a moderate boost drives straight down the branch to the rejoin, clear of walls', () => {
    const r = track.branches[0];
    const res = followRibbon(track, 0, 2, (r.spline.length / FAST.topSpeed) * 1.6, { ...MID, topSpeed: MID.topSpeed * 1.2 });
    expect(res.fell).toBe(false);
    expect(res.walls, 'wall hits on the way').toBe(0);
    const end = pointAt(main.spline, track.mainS(def.branches[0].mainTo));
    expect(nearestOnSpline(main.spline, res.end.x, res.end.z).s).toBeGreaterThan(track.mainS(def.branches[0].mainTo) - 5);
    expect(Math.hypot(res.end.x - end.x, res.end.z - end.z)).toBeLessThan(80);
  });

  it('every kicker launches a kart at 100cc top speed and lands it on the road', () => {
    const list = kickers(main);
    expect(list.length).toBeGreaterThan(0);
    for (const k of list) {
      const res = followRibbon(track, -1, track.mainS(k) - 25, 3, MID);
      expect(res.launched, `kicker at ${k.toFixed(0)}`).toBe(true);
      expect(res.offLanding, `kicker at ${k.toFixed(0)}`).toBe(false);
      expect(res.fell, `kicker at ${k.toFixed(0)}`).toBe(false);
    }
  });

  it('puts a row of double item boxes on the shortcut', () => {
    expect(def.itemBoxes.some((row) => row.ribbon === 0 && row.double)).toBe(true);
  });

  it('the shortcut is faster than the main line at 150cc', () => {
    // Both lines get the same boost at the same spot, where the shortcut needs one.
    const viaMain = driveRoute(track, route(track, null, 40, 40), FAST, boostAt);
    const viaBranch = driveRoute(track, route(track, 0, 40, 40), FAST, boostAt);
    const flat = boostAt === undefined ? viaBranch : driveRoute(track, route(track, 0, 40, 40), FAST);
    console.log(
      `${def.name}: main line ${viaMain?.toFixed(2)} s, shortcut ${viaBranch?.toFixed(2)} s at 150cc` +
        (boostAt === undefined ? '' : ` (both with a 1 s boost at the fork; shortcut without it: ${flat === null ? 'falls' : `${flat.toFixed(2)} s`})`),
    );
    expect(viaMain).not.toBeNull();
    expect(viaBranch).not.toBeNull();
    expect(viaBranch!).toBeLessThan(viaMain!);
  });
});

/** The lie of each track's land: its highest road reaches `high` and its lowest `low` (m); the sky track never sinks below its start line. */
const LIE: Record<string, { high: number; low: number; floor?: number }> = {
  'Open Water': { high: 12, low: -6 },
  'Ice V': { high: 12, low: -8 },
  'Doom City': { high: 18, low: -4 },
  'Sleep Drifter': { high: 25, low: 0, floor: 0 },
};

/** Steers toward a point a little further along the main centerline, flat out. */
function autopilot(track: Track, s: KartState, progress: number) {
  const p = pointAt(track.spline, progress + 14);
  const err = wrapAngle(Math.atan2(p.x - s.x, p.z - s.z) - s.heading);
  return { ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) };
}

/** One autopilot lap at 150cc: respawns, and each spell in the air (where it left the road, builder metres, and for how long). */
function fastLap(track: Track) {
  const race = new Race(track);
  const kart = race.addKart(RACERS[0], '150cc', null);
  race.time = 0; // skip the countdown
  let respawns = 0;
  const air: { s: number; time: number }[] = [];
  let from = -1;
  let time = 0;
  for (let t = 0; t < 200 && kart.laps.lap < 1; t += PHYSICS_DT) {
    race.step(PHYSICS_DT, [autopilot(track, kart.state, kart.progressS)]);
    if (kart.respawned) respawns++;
    if (!kart.state.grounded) {
      if (from < 0) from = track.main.toBuilder(kart.progressS);
      time += PHYSICS_DT;
    } else if (from >= 0) {
      air.push({ s: from, time });
      from = -1;
      time = 0;
    }
  }
  return { lapped: kart.laps.lap >= 1, respawns, air };
}

describe.each(CASES)('$name elevation', ({ name, build }) => {
  const def = build();
  const track = new Track(def);
  const lap = fastLap(track);

  it('climbs and dips', () => {
    const sp = track.main.spline;
    let high = -Infinity;
    let low = Infinity;
    for (let i = 0; i < sp.count; i++) {
      const y = track.main.heightAt(sp.dist[i]);
      high = Math.max(high, y);
      low = Math.min(low, y);
    }
    console.log(`${name}: road from ${low.toFixed(1)} m to ${high.toFixed(1)} m`);
    expect(high).toBeGreaterThanOrEqual(LIE[name].high);
    expect(low).toBeLessThanOrEqual(LIE[name].low);
    if (LIE[name].floor !== undefined) expect(low).toBeGreaterThanOrEqual(LIE[name].floor!);
  });

  it('gives a fast kart airtime off a crest, not just the kickers and jumps', () => {
    const lips = [...kickers(track.main), ...def.main.gaps.map((g) => g[0])];
    const crests = lap.air.filter((a) => a.time > 0.4 && lips.every((l) => Math.abs(a.s - l) > 8));
    console.log(`${name}: crest airtime at 150cc ${crests.map((a) => `${a.s.toFixed(0)} m (${a.time.toFixed(2)} s)`).join(', ')}`);
    expect(crests.length).toBeGreaterThan(0);
  });

  it('laps on autopilot at 150cc without a respawn', () => {
    expect(lap.lapped).toBe(true);
    expect(lap.respawns).toBe(0);
  });
});
