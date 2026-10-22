import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { Race } from '../src/core/race';
import { ItemSystem } from '../src/items/items';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { GEN_COMPLEXITY_MAX, GEN_LENGTHS, GEN_THEMES, SHORTCUT_JUNCTION, generateTrack, isPlayable, selfGap, type GenParams } from '../src/tracks/generator';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type Ribbon, type TrackDef } from '../src/tracks/track';

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

/** Below the ground and not on a road there (a cut holds you up): fallen. */
function fallen(track: Track, kart: KartState): boolean {
  if (kart.y > -2) return false;
  const loc = track.locate(kart.x, kart.z, kart.y, kart.trackHint);
  return !(loc.onRoad && kart.y > loc.height - 1.5);
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
    if (fallen(track, kart)) fell = true;
  }
  return { launched, landedOnRoad, fell };
}

/** Drives straight down a ribbon from s; 'fell' if the kart drops into a pit. */
function jump(track: Track, r: Ribbon, s: number, speed: number, boost: number, p: ReturnType<typeof kartParams>) {
  const kart = kartAt(r, s, speed, boost);
  for (let t = 0; t < 4; t += PHYSICS_DT) {
    stepKart(kart, { ...NEUTRAL_INPUT, throttle: 1 }, p, track, PHYSICS_DT);
    if (fallen(track, kart)) return 'fell';
  }
  return 'cleared';
}

/** Seconds for an autopilot kart to drive a ribbon from s0 to s1 (spline units), starting at speed. */
function drive(track: Track, r: Ribbon, s0: number, s1: number, p: ReturnType<typeof kartParams>, boost = 0): number {
  const kart = kartAt(r, s0, p.topSpeed, boost);
  for (let t = 0; t < 30; t += PHYSICS_DT) {
    stepKart(kart, steer(r, kart), p, track, PHYSICS_DT);
    if (fallen(track, kart)) return Infinity;
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
    for (const { p, def } of BUILT) if (p.complexity < 3 || ABYSS(p)) expect(def.branches.length, label(p)).toBe(0);
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
        if (fallen(track, kart)) break;
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
      expect(autopilotLap(def, RACERS[0], '100cc')).toEqual({ laps: 1, falls: 0 });
    }, 30_000);
  });
});

/** One autopilot lap in a race (falls and respawns as in a real race): laps done and respawns. */
function autopilotLap(def: TrackDef, racer: (typeof RACERS)[number], engine: '100cc' | '150cc') {
  const track = new Track(def);
  const race = new Race(track);
  const kart = race.addKart(racer, engine, null);
  race.time = 0;
  let falls = 0;
  for (let t = 0; t < 200 && kart.laps.lap < 1; t += PHYSICS_DT) {
    const s = kart.state;
    const aim = pointAt(track.spline, kart.progressS + 14);
    const err = wrapAngle(Math.atan2(aim.x - s.x, aim.z - s.z) - s.heading);
    race.step(PHYSICS_DT, [{ ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) }]);
    if (kart.respawned) falls++;
  }
  return { laps: kart.laps.lap, falls };
}

/** More seeds for the elevation checks: every theme, twist and length, three more each. */
const MORE = GEN_THEMES.flatMap((theme, t) =>
  Array.from({ length: GEN_COMPLEXITY_MAX }, (_, i) => i + 1).flatMap((complexity) =>
    GEN_LENGTHS.flatMap((length, l) => [0, 1, 2].map((k) => ({ seed: 5000 + t * 101 + complexity * 13 + l * 7 + k * 977, theme, complexity, length }))),
  ),
).map((p) => ({ p, def: generateTrack(p) }));
const ALL = [...BUILT, ...MORE];
const ABYSS = (p: GenParams) => p.theme === 'dream' || p.theme === 'void' || p.theme === 'skycastle';
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** Main road heights every 2 m (spline units). */
function heights(track: Track): number[] {
  const out: number[] = [];
  for (let s = 0; s < track.length; s += 2) out.push(track.main.heightAt(s));
  return out;
}

/** Drives a lap flat out on autopilot: where (builder metres) the kart left the road over a crest, not off a kicker or a jump. */
function crestLaunches(track: Track, def: TrackDef, p: ReturnType<typeof kartParams>): number[] {
  const lips = kickerLips(def);
  const kart = kartAt(track.main, 2, p.topSpeed);
  const out: number[] = [];
  let last = 2;
  let travelled = 0;
  for (let t = 0; t < 120 && travelled < track.length - 10; t += PHYSICS_DT) {
    const ev = stepKart(kart, steer(track.main, kart), p, track, PHYSICS_DT);
    const at = nearestOnSpline(track.spline, kart.x, kart.z).s;
    let d = at - last;
    if (d < -track.length / 2) d += track.length;
    travelled += d;
    last = at;
    if (!ev.launched) continue;
    const s = track.main.toBuilder(at);
    if (lips.some((l) => Math.abs(s - l) < 8) || def.main.gaps.some(([a, b]) => s > a - 8 && s < b + 8)) continue;
    out.push(s);
  }
  return out;
}

describe('generated tracks: hills, coasters and cuts', () => {
  it('every dial still builds a closed loop that never crosses itself, even flat on the map', () => {
    for (const { p, def } of ALL) {
      expect(isPlayable(def), label(p)).toBe(true);
      const track = new Track(def);
      // Measured flat on the map: a deck high over another stretch of road would count.
      expect(selfGap(track), label(p)).toBeGreaterThanOrEqual(5);
      // Level over the grid and through the line.
      for (let s = -50; s <= 6; s += 2) expect(Math.abs(track.main.heightAt((s + track.length) % track.length)), label(p)).toBeLessThan(0.01);
    }
  }, 120_000);

  it('builds the same hills from the same seed', () => {
    for (const { p, def } of MORE.filter((_, i) => i % 7 === 0)) expect(JSON.stringify(generateTrack(p)), label(p)).toBe(JSON.stringify(def));
  }, 60_000);

  it('rolls at every twist, more at higher twists', () => {
    const range = (c: number) =>
      mean(
        ALL.filter(({ p }) => p.complexity === c).map(({ def }) => {
          const h = heights(new Track(def));
          return Math.max(...h) - Math.min(...h);
        }),
      );
    for (let c = 1; c <= GEN_COMPLEXITY_MAX; c++) expect(range(c), `twists ${c}`).toBeGreaterThan(1);
    expect(range(2)).toBeGreaterThan(range(1));
    expect(range(3)).toBeGreaterThan(range(2) + 5);
  }, 60_000);

  it('from twists 3, a coaster: a real height range, up on a pillared deck with low walls, higher over an abyss', () => {
    const peaks = { abyss: [] as number[], ground: [] as number[] };
    for (const { p, def } of ALL) {
      if (p.complexity < 3) continue;
      const track = new Track(def);
      const decks = def.main.sections.filter((s) => s.bridge);
      expect(decks.length, label(p)).toBeGreaterThanOrEqual(1);
      const h = heights(track);
      expect(Math.max(...h) - Math.min(...h), label(p)).toBeGreaterThan(10);
      let peak = 0;
      for (const d of decks) {
        for (let s = d.from; s <= d.to; s += 2) {
          const y = track.main.heightAtBuilder(s);
          expect(y, `${label(p)} deck at ${s.toFixed(0)}`).toBeGreaterThan(3.5);
          peak = Math.max(peak, y);
        }
        expect(d.wallHeight, label(p)).toBe(1.2);
      }
      (ABYSS(p) ? peaks.abyss : peaks.ground).push(peak);
    }
    expect(mean(peaks.ground)).toBeGreaterThan(12);
    expect(mean(peaks.abyss)).toBeGreaterThan(mean(peaks.ground) + 3);
  }, 60_000);

  it('sinks a walled stretch into a cut now and then, never over an abyss or by a pit', () => {
    let cut = 0;
    let ground = 0;
    for (const { p, def } of ALL) {
      const track = new Track(def);
      const h = heights(track);
      if (ABYSS(p)) {
        // No ground to sink into: nothing goes below it but a dip in the clouds.
        expect(track.main.cut.some((v) => v), label(p)).toBe(false);
        continue;
      }
      ground++;
      if (!track.main.cut.some((v) => v)) {
        expect(Math.min(...h), label(p)).toBeGreaterThan(-0.3);
        continue;
      }
      cut++;
      expect(Math.min(...h), label(p)).toBeLessThan(-4.5);
      expect(Math.min(...h), label(p)).toBeGreaterThan(-11);
      const sp = track.spline;
      for (let i = 0; i < sp.count; i++) {
        if (!track.main.cut[i]) continue;
        for (const pit of def.pits) expect(inPit({ ...pit, halfLength: pit.halfLength + 10, halfWidth: pit.halfWidth + 10 }, sp.px[i], sp.pz[i]), label(p)).toBe(false);
      }
    }
    expect(cut / ground).toBeGreaterThan(0.15);
    expect(cut / ground).toBeLessThan(0.7);
  }, 60_000);

  it('keeps kickers, jumps, bridges over pits and shortcut junctions level', () => {
    for (const { p, def } of ALL) {
      const track = new Track(def);
      const main = track.main;
      // Kickers rise off level road and drop back onto it.
      for (const lip of kickerLips(def)) {
        for (const d of [-12, -8, 1, 10, 30]) expect(Math.abs(main.heightAtBuilder(lip + d)), `${label(p)} kicker at ${lip.toFixed(0)}`).toBeLessThan(0.01);
      }
      // Jumps land on level road.
      for (const [, to] of def.main.gaps) expect(Math.abs(main.heightAtBuilder(to + 5)), label(p)).toBeLessThan(0.01);
      // Over a pit the road is its bridge or its jump ramp, nothing more.
      const sp = track.spline;
      for (let i = 0; i < sp.count; i++) {
        if (!def.pits.some((pit) => inPit(pit, sp.px[i], sp.pz[i]))) continue;
        const y = main.heightAt(sp.dist[i]);
        expect(y, label(p)).toBeGreaterThanOrEqual(0);
        expect(y, label(p)).toBeLessThanOrEqual(3);
      }
      // A shortcut meets the main road at its height, at both ends.
      def.branches.forEach((br, k) => {
        const r = track.branches[k];
        const ends: [number, number][] = [
          [0, br.mainFrom],
          [r.spline.length, br.mainTo],
        ];
        for (const [bs, ms] of ends) {
          expect(Math.abs(main.heightAtBuilder(ms)), label(p)).toBeLessThan(0.01);
          for (const d of [-20, 0, 20]) expect(Math.abs(r.heightAt(clamp(bs + d, 0, r.spline.length))), label(p)).toBeLessThan(0.01);
        }
        // No hill reaches into the sweep it cuts across (a bridge or kicker may sit right up against it).
        for (let s = br.mainFrom; s <= br.mainTo; s += 4) expect(Math.abs(main.heightAtBuilder(s)), label(p)).toBeLessThan(0.01);
      });
    }
  }, 60_000);

  it('puts barriers on raised road, so nobody drops off an embankment', () => {
    for (const { p, def } of ALL) {
      const track = new Track(def);
      const sp = track.spline;
      for (let i = 0; i < sp.count; i++) {
        if (track.main.heightAt(sp.dist[i]) > 3.2) expect(track.main.wallHeight[i], `${label(p)} at ${sp.dist[i].toFixed(0)}`).toBeGreaterThanOrEqual(1.2);
      }
    }
  });

  it('gives a fast kart airtime over a crest: nearly every track from twists 3, most at twists 2', () => {
    const fast = kartParams(FASTEST.stats, '150cc');
    const got = new Map<number, number>();
    for (const { p, def } of BUILT) {
      const n = crestLaunches(new Track(def), def, fast).length;
      got.set(p.complexity, (got.get(p.complexity) ?? 0) + (n > 0 ? 1 : 0));
    }
    const per = BUILT.length / GEN_COMPLEXITY_MAX;
    // A launch counted right at the crest; now and then a kart is already in the air as it gets there.
    for (let c = 3; c <= GEN_COMPLEXITY_MAX; c++) expect(got.get(c)! / per, `twists ${c}`).toBeGreaterThanOrEqual(0.95);
    expect(got.get(2)! / per).toBeGreaterThan(0.5);
  }, 120_000);

  describe.each(GEN_THEMES)('%s: autopilot laps at 150cc', (theme) => {
    it.each(ALL.filter(({ p }) => p.theme === theme && p.seed % 2 === 0).map(({ p, def }) => [label(p), def] as const))('%s', (_name, def) => {
      expect(autopilotLap(def, FASTEST, '150cc')).toEqual({ laps: 1, falls: 0 });
    }, 30_000);
  });
});
