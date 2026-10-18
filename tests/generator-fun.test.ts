import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { Race } from '../src/core/race';
import { ItemSystem } from '../src/items/items';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { GEN_COMPLEXITY_MAX, GEN_LENGTHS, GEN_THEMES, SHORTCUT_JUNCTION, generateTrack, isPlayable, type GenParams } from '../src/tracks/generator';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, type Ribbon, type TrackDef } from '../src/tracks/track';

/** Every theme, twist and length, a few seeds each. */
const DIALS: GenParams[] = GEN_THEMES.flatMap((theme, t) =>
  Array.from({ length: GEN_COMPLEXITY_MAX }, (_, i) => i + 1).flatMap((complexity) =>
    GEN_LENGTHS.flatMap((length, l) => [0, 1].map((k) => ({ seed: 100 + t * 37 + complexity * 11 + l * 5 + k * 1000, theme, complexity, length }))),
  ),
);
const BUILT = DIALS.map((p) => ({ p, def: generateTrack(p) }));
const bySpeed = [...RACERS].sort((a, b) => a.stats.speed - b.stats.speed);
const SLOWEST = bySpeed[0];
const FASTEST = bySpeed[bySpeed.length - 1];
const label = (p: GenParams) => `${p.theme} ${p.complexity} ${p.length} #${p.seed}`;

/** Kicker lips: a sheer drop in the elevation keys (builder units). */
function kickerLips(def: TrackDef): number[] {
  const keys = def.main.elevation;
  const lips: number[] = [];
  for (let i = 1; i < keys.length; i++) if (keys[i][0] === keys[i - 1][0] && keys[i - 1][1] - keys[i][1] > 1) lips.push(keys[i][0]);
  return lips;
}

/** Steers toward a point 14 m further along a ribbon. */
function steer(r: Ribbon, s: KartState) {
  const at = nearestOnSpline(r.spline, s.x, s.z).s;
  const p = pointAt(r.spline, at + 14);
  const err = wrapAngle(Math.atan2(p.x - s.x, p.z - s.z) - s.heading);
  return { ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) };
}

/** A kart on a ribbon at spline arc length s, at speed. */
function kartAt(r: Ribbon, s: number, speed: number, boost = 0): KartState {
  const pt = pointAt(r.spline, s);
  const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
  kart.y = kart.groundY = r.heightAt(s);
  kart.speed = speed;
  kart.boostTime = boost;
  return kart;
}

/** Drives a kicker at speed: did it leave the lip, and where did it come down? */
function hitKicker(track: Track, lip: number, speed: number) {
  const p = kartParams(RACERS[0].stats, '100cc');
  const kart = kartAt(track.main, track.mainS(lip) - 25, speed);
  let launched = false;
  let landedOnRoad = false;
  let fell = false;
  for (let t = 0; t < 3; t += PHYSICS_DT) {
    const ev = stepKart(kart, steer(track.main, kart), p, track, PHYSICS_DT);
    if (ev.launched) launched = true;
    if (launched && ev.landed > 0 && !landedOnRoad) landedOnRoad = track.locate(kart.x, kart.z, kart.y).onRoad;
    if (kart.y < -2) fell = true;
  }
  return { launched, landedOnRoad, fell };
}

/** Drives straight down a ribbon from s; 'fell' if the kart drops into a pit. */
function jump(track: Track, r: Ribbon, s: number, speed: number, boost: number, p: ReturnType<typeof kartParams>) {
  const kart = kartAt(r, s, speed, boost);
  for (let t = 0; t < 4; t += PHYSICS_DT) {
    stepKart(kart, { ...NEUTRAL_INPUT, throttle: 1 }, p, track, PHYSICS_DT);
    if (kart.y < -2) return 'fell';
  }
  return 'cleared';
}

/** Seconds for an autopilot kart to drive a ribbon from s0 to s1 (spline units), starting at speed. */
function drive(track: Track, r: Ribbon, s0: number, s1: number, p: ReturnType<typeof kartParams>, boost = 0): number {
  const kart = kartAt(r, s0, p.topSpeed, boost);
  for (let t = 0; t < 30; t += PHYSICS_DT) {
    stepKart(kart, steer(r, kart), p, track, PHYSICS_DT);
    if (kart.y < -2) return Infinity;
    if (nearestOnSpline(r.spline, kart.x, kart.z).s >= s1) return t;
  }
  return Infinity;
}

describe('generated tracks: kickers, double boxes and shortcuts', () => {
  it('builds every dial into a closed loop that never crosses itself, inside its bounds', () => {
    for (const { p, def } of BUILT) {
      expect(isPlayable(def), label(p)).toBe(true);
      const track = new Track(def);
      const sp = track.spline;
      expect(Math.abs(wrapAngle(Math.atan2(sp.tx[0], sp.tz[0]) - Math.atan2(sp.tx[sp.count - 1], sp.tz[sp.count - 1]))), label(p)).toBeLessThan(0.1);
      for (const r of [track.main, ...track.branches]) {
        for (let i = 0; i < r.spline.count; i++) expect(Math.max(Math.abs(r.spline.px[i]), Math.abs(r.spline.pz[i])), label(p)).toBeLessThan(def.bounds - 20);
      }
    }
  }, 60_000);

  it('still builds the same track from the same seed', () => {
    for (const { p, def } of BUILT.filter((_, i) => i % 9 === 0)) expect(JSON.stringify(generateTrack(p)), label(p)).toBe(JSON.stringify(def));
  }, 60_000);

  it('gives every track kickers, more of them at higher twists', () => {
    const perTwist = new Map<number, number[]>();
    for (const { p, def } of BUILT) {
      const n = kickerLips(def).length;
      expect(n, label(p)).toBeGreaterThanOrEqual(1);
      perTwist.set(p.complexity, [...(perTwist.get(p.complexity) ?? []), n]);
    }
    const mean = (c: number) => perTwist.get(c)!.reduce((a, b) => a + b, 0) / perTwist.get(c)!.length;
    expect(mean(GEN_COMPLEXITY_MAX)).toBeGreaterThan(mean(1) + 0.8);
  });

  it('pairs some kickers a second or two apart so tricks chain', () => {
    const p100 = kartParams(RACERS[0].stats, '100cc').topSpeed;
    let pairs = 0;
    for (const { def } of BUILT) {
      const lips = kickerLips(def);
      for (let i = 1; i < lips.length; i++) {
        const apart = (lips[i] - lips[i - 1]) / p100;
        if (apart < 3) {
          expect(apart).toBeGreaterThan(1);
          pairs++;
        }
      }
    }
    expect(pairs).toBeGreaterThan(BUILT.length / 10);
  });

  it('launches a kart off every kicker at 100cc top speed, and it lands on road', () => {
    const speed = kartParams(RACERS[0].stats, '100cc').topSpeed;
    for (const { p, def } of BUILT) {
      const track = new Track(def);
      for (const lip of kickerLips(def)) {
        const hit = hitKicker(track, lip, speed);
        expect(hit, `${label(p)} kicker at ${lip.toFixed(0)}`).toEqual({ launched: true, landedOnRoad: true, fell: false });
      }
    }
  }, 60_000);

  it('puts one row of one or two double boxes on the road, out on a risky line', () => {
    for (const { p, def } of BUILT) {
      const rows = def.itemBoxes.filter((r) => r.double);
      expect(rows.length, label(p)).toBe(1);
      expect(rows[0].count, label(p)).toBeGreaterThanOrEqual(1);
      expect(rows[0].count, label(p)).toBeLessThanOrEqual(2);
      // On a branch when there is one, else off the centre of the road.
      if (def.branches.length) expect(rows[0].ribbon, label(p)).toBe(0);
      else expect(Math.abs(rows[0].lateral ?? 0), label(p)).toBeGreaterThan(3);
      const track = new Track(def);
      const doubles = new ItemSystem(track).boxes.filter((b) => b.double);
      expect(doubles.length, label(p)).toBe(rows[0].count);
      for (const b of doubles) expect(track.locate(b.x, b.z, b.y).onRoad, label(p)).toBe(true);
    }
  }, 60_000);

  it('adds shortcuts only at twists 3 and up, now and then, on solid ground', () => {
    // Never over an abyss, where the open bends it leaves from would be a long way down.
    for (const { p, def } of BUILT) if (p.complexity < 3 || p.theme === 'dream' || p.theme === 'void') expect(def.branches.length, label(p)).toBe(0);
    const at = (c: number) => BUILT.filter(({ p }) => p.complexity === c && p.theme !== 'dream' && p.theme !== 'void');
    for (let c = 3; c <= GEN_COMPLEXITY_MAX; c++) {
      const share = at(c).filter(({ def }) => def.branches.length).length / at(c).length;
      expect(share, `twists ${c}`).toBeGreaterThan(0.05);
      expect(share, `twists ${c}`).toBeLessThan(0.8);
    }
  });

  const SHORTCUTS = BUILT.filter(({ def }) => def.branches.length);

  it('starts and ends each shortcut on the main road', () => {
    expect(SHORTCUTS.length).toBeGreaterThan(20);
    for (const { p, def } of SHORTCUTS) {
      const track = new Track(def);
      const br = def.branches[0];
      const ends: [number, number, number][] = [
        [0, br.mainFrom, 0],
        [br.points.length - 1, br.mainTo, 1],
      ];
      for (const [i, mainS, end] of ends) {
        const m = pointAt(track.spline, track.mainS(mainS));
        const [x, z] = br.points[i];
        expect(Math.hypot(x - m.x, z - m.z), label(p)).toBeLessThan(1);
        const b = pointAt(track.branches[0].spline, end * track.branches[0].spline.length);
        expect(Math.abs(wrapAngle(Math.atan2(b.tx, b.tz) - Math.atan2(m.tx, m.tz))), label(p)).toBeLessThan((3 * Math.PI) / 180);
      }
    }
  });

  it('keeps each shortcut 4 m clear of the main road away from its junctions, and wall-free where they meet', () => {
    for (const { p, def } of SHORTCUTS) {
      const track = new Track(def);
      const br = track.branches[0];
      const L = br.spline.length;
      const from = track.mainS(def.branches[0].mainFrom);
      const to = track.mainS(def.branches[0].mainTo);
      for (let i = 0; i < br.spline.count; i += 2) {
        const s = br.spline.dist[i];
        const m = nearestOnSpline(track.spline, br.spline.px[i], br.spline.pz[i]);
        const gap = m.distance - br.halfWidth[i] - track.main.halfWidth[m.index];
        if (s > SHORTCUT_JUNCTION && s < L - SHORTCUT_JUNCTION) {
          expect(gap, label(p)).toBeGreaterThan(4);
          continue;
        }
        // Near the junctions: no walls on either ribbon where a kart on the other would meet them,
        // and clear of road that isn't leading in or out.
        expect(br.wallHeight[i], label(p)).toBe(0);
        if (s > 5 && s < L - 5 && gap < 3) expect(track.main.wallHeight[m.index], label(p)).toBe(0);
        const sp = track.spline;
        for (let j = 0; j < sp.count; j += 2) {
          if (sp.dist[j] > from - 120 && sp.dist[j] < to + 120) continue;
          const far = Math.hypot(br.spline.px[i] - sp.px[j], br.spline.pz[i] - sp.pz[j]) - br.halfWidth[i] - track.main.halfWidth[j];
          expect(far, label(p)).toBeGreaterThan(4);
        }
      }
    }
  }, 60_000);

  it('shortcut jump: any kart clears it at 100cc with a mini-turbo, at 50cc it takes a boost or it falls in', () => {
    for (const { p, def } of SHORTCUTS) {
      const track = new Track(def);
      const br = track.branches[0];
      const gapStart = br.def.gaps[0][0] * br.scale;
      // The slowest kart clears it as designed; the fastest still falls in at 50cc without a boost.
      const k100 = kartParams(SLOWEST.stats, '100cc');
      expect(jump(track, br, gapStart - 25, k100.topSpeed, 0.5, k100), `${label(p)} 100cc mini-turbo`).toBe('cleared');
      const k50 = kartParams(SLOWEST.stats, '50cc');
      expect(jump(track, br, gapStart - 25, k50.topSpeed * 1.35, 2, k50), `${label(p)} 50cc boosted`).toBe('cleared');
      const fast50 = kartParams(FASTEST.stats, '50cc');
      expect(jump(track, br, gapStart - 25, fast50.topSpeed, 0, fast50), `${label(p)} 50cc`).toBe('fell');
    }
  }, 60_000);

  it('a kart driving straight down a shortcut with a boost reaches the rejoin', () => {
    const p = kartParams(RACERS[0].stats, '100cc');
    for (const { p: dials, def } of SHORTCUTS) {
      const track = new Track(def);
      const br = track.branches[0];
      const kart = kartAt(br, br.def.gaps[0][0] * br.scale - 40, p.topSpeed, 1);
      const end = br.def.points[br.def.points.length - 1];
      let reached = false;
      for (let t = 0; t < 10 && !reached; t += PHYSICS_DT) {
        stepKart(kart, { ...NEUTRAL_INPUT, throttle: 1 }, p, track, PHYSICS_DT);
        if (kart.y < -2) break;
        reached = Math.hypot(kart.x - end[0], kart.z - end[1]) < 4;
      }
      expect(reached, label(dials)).toBe(true);
    }
  });

  it('a shortcut is quicker than the main line at 150cc', () => {
    const gains: number[] = [];
    for (const { p: dials, def } of SHORTCUTS) {
      const track = new Track(def);
      const br = track.branches[0];
      const p = kartParams(RACERS[0].stats, '150cc');
      const mainTime = drive(track, track.main, track.mainS(def.branches[0].mainFrom), track.mainS(def.branches[0].mainTo), p);
      const cutTime = drive(track, br, 0, br.spline.length - 1, p);
      expect(cutTime, label(dials)).toBeLessThan(mainTime);
      gains.push(mainTime - cutTime);
    }
    gains.sort((a, b) => a - b);
    console.log(`shortcut gain at 150cc over ${gains.length} tracks: min ${gains[0].toFixed(2)} s, median ${gains[gains.length >> 1].toFixed(2)} s, max ${gains[gains.length - 1].toFixed(2)} s`);
  }, 60_000);

  describe.each(GEN_THEMES)('%s: autopilot laps every dial', (theme) => {
    it.each(BUILT.filter(({ p }) => p.theme === theme && p.seed < 1000).map(({ p, def }) => [label(p), def] as const))('%s', (_name, def) => {
      const track = new Track(def);
      const race = new Race(track);
      const kart = race.addKart(RACERS[0], '100cc', null);
      race.time = 0;
      let falls = 0;
      for (let t = 0; t < 200 && kart.laps.lap < 1; t += PHYSICS_DT) {
        const s = kart.state;
        const aim = pointAt(track.spline, kart.progressS + 14);
        const err = wrapAngle(Math.atan2(aim.x - s.x, aim.z - s.z) - s.heading);
        race.step(PHYSICS_DT, [{ ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) }]);
        if (kart.respawned) falls++;
      }
      expect(kart.laps.lap).toBe(1);
      expect(falls).toBe(0);
    }, 30_000);
  });
});
