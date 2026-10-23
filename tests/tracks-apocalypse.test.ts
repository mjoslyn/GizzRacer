import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { FUZZ_BOOST } from '../src/items/items';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams, type EngineClass } from '../src/physics/racers';
import { buildHellOnMars } from '../src/tracks/hellOnMars';
import { buildMurderOfTheUniverse } from '../src/tracks/murderOfTheUniverse';
import { buildPetrodragonicApocalypse } from '../src/tracks/petrodragonicApocalypse';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { buildSupercell } from '../src/tracks/supercell';
import { Track, inPit, shortcutLap, type Ribbon, type TrackDef } from '../src/tracks/track';

/** How a shortcut's jump is meant to go: who makes it, and who doesn't. */
interface JumpSpec {
  /** Engine class and boost seconds that every racer clears it with. */
  clears: [EngineClass, number][];
  /** Engine class and boost seconds that the first racer falls short with. */
  fails: [EngineClass, number][];
}

interface Case {
  name: string;
  build: () => TrackDef;
  branch: string;
  /** Branch arc length (m) at each end where it may still run alongside the main road. */
  junction: number;
  jump?: JumpSpec;
  /** Boost seconds given at the start of the timed runs (a pad at the mouth, say). */
  boost?: number;
}

const CASES: Case[] = [
  {
    name: 'Hell on Mars',
    build: buildHellOnMars,
    branch: 'Mars for the Rich',
    junction: 50,
    jump: { clears: [['150cc', 0], ['100cc', 0.5]], fails: [['100cc', 0]] },
  },
  { name: 'Supercell', build: buildSupercell, branch: 'Converge', junction: 40 },
  { name: 'Murder of the Universe', build: buildMurderOfTheUniverse, branch: 'Digital Black', junction: 66 },
  {
    name: 'Petrodragonic Apocalypse',
    build: buildPetrodragonicApocalypse,
    branch: 'Flamethrower',
    junction: 45,
    jump: { clears: [['150cc', 0], ['100cc', 0.5]], fails: [['100cc', 0]] },
  },
];

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
      if (sp.dist[i] < c.junction * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - c.junction * ROAD_WIDTH_SCALE) continue;
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
    const run = drive(track, branch, bdef.mainTo, p, FUZZ_BOOST, undefined, boostAt);
    expect(run.fell).toBe(false);
    expect(run.time).toBeLessThan(20);
  });

  it('is quicker than the main line at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const viaBranch = drive(track, branch, bdef.mainTo, p, c.boost ?? 0);
    const viaMain = drive(track, track.main, bdef.mainTo, p, c.boost ?? 0, bdef.mainFrom);
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
      Object.assign(kart, shortcutLap(track.def));
      kart.y = kart.groundY = track.main.heightAt(start);
      kart.speed = p.topSpeed;
      let launched = false;
      let progress = start;
      for (let t = 0; t < 3; t += PHYSICS_DT) {
        const ev = stepKart(kart, steerAlong(track.main, kart, progress), p, track, PHYSICS_DT);
        progress = nearestOnSpline(track.spline, kart.x, kart.z).s;
        launched ||= ev.launched;
        expect(fallen(track, kart), `kicker at ${lip.toFixed(0)}`).toBe(false);
      }
      expect(launched, `kicker at ${lip.toFixed(0)}`).toBe(true);
      expect(kart.grounded).toBe(true);
      expect(track.locate(kart.x, kart.z, kart.y).onRoad).toBe(true);
    }
  });
});

describe('Petrodragonic Apocalypse Flamethrower pad', () => {
  const def = buildPetrodragonicApocalypse();
  const track = new Track(def);
  const k = def.branches.findIndex((b) => b.name === 'Flamethrower');
  const bdef = def.branches[k];
  const pad = def.boostPads[def.boostPads.length - 1];

  it('carries any 100cc kart over the burning lake from the pad at its mouth', () => {
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      // Up the inside line over the pad, then straight down the branch.
      const s0 = track.mainS(pad.s - 12);
      const pt = pointAt(track.spline, s0);
      const kart = createKartState(pt.x - pt.tz * pad.lateral, pt.z + pt.tx * pad.lateral, Math.atan2(pt.tx, pt.tz));
      Object.assign(kart, shortcutLap(track.def));
      kart.speed = p.topSpeed;
      let boosted = false;
      for (let t = 0; t < 6; t += PHYSICS_DT) {
        const onBranch = nearestOnSpline(track.spline, kart.x, kart.z).s >= track.mainS(bdef.mainFrom) - 1;
        const ribbon = onBranch ? track.branches[k] : track.main;
        const hit = nearestOnSpline(ribbon.spline, kart.x, kart.z);
        const ahead = pointAt(ribbon.spline, Math.min(hit.s + 14, ribbon.spline.length));
        const lat = onBranch ? 0 : pad.lateral;
        const err = wrapAngle(Math.atan2(ahead.x - ahead.tz * lat - kart.x, ahead.z + ahead.tx * lat - kart.z) - kart.heading);
        stepKart(kart, { ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) }, p, track, PHYSICS_DT);
        boosted ||= kart.surface === 'boost';
        expect(fallen(track, kart), r.id).toBe(false);
      }
      expect(boosted, r.id).toBe(true);
    }
  });
});

/** How high and low each road runs: a climb to a crest and a dip below ground (none on the abyss, which has no ground). */
const HEIGHTS: { name: string; build: () => TrackDef; top: number; bottom: number }[] = [
  { name: 'Hell on Mars', build: buildHellOnMars, top: 20, bottom: -6 },
  { name: 'Supercell', build: buildSupercell, top: 12, bottom: -4 },
  { name: 'Murder of the Universe', build: buildMurderOfTheUniverse, top: 20, bottom: 0 },
  { name: 'Petrodragonic Apocalypse', build: buildPetrodragonicApocalypse, top: 10, bottom: -6 },
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
  const loc = track.locate(kart.x, kart.z, kart.y, kart.trackHint);
  return !(loc.onRoad && kart.y > loc.height - 1.5);
}

/** Builder arc lengths of each kicker's lip on the main road: a sheer drop in the elevation keys. */
function kickerLips(def: TrackDef): number[] {
  const el = def.main.elevation;
  const lips: number[] = [];
  for (let j = 1; j < el.length; j++) if (el[j][0] - el[j - 1][0] < 1e-6 && el[j - 1][1] - el[j][1] > 0.5) lips.push(el[j][0]);
  return lips;
}

/** Steers the kart's travel toward a point further along `ribbon` (further the faster it goes), as the autopilot in tests/track.test.ts does. */
function steerAlong(ribbon: Ribbon, s: ReturnType<typeof createKartState>, progress: number) {
  const sp = ribbon.spline;
  const look = 10 + s.speed * 0.4;
  const p = pointAt(sp, sp.closed ? progress + look : Math.min(progress + look, sp.length));
  const desired = Math.atan2(p.x - s.x, p.z - s.z);
  // The direction of travel, not the nose: a kart skids wide of its heading through a turn (stepKart's slide).
  const travel = s.speed > 4 ? Math.atan2(Math.sin(s.heading) * s.speed + s.extX, Math.cos(s.heading) * s.speed + s.extZ) : s.heading;
  const err = wrapAngle(desired - travel);
  return { ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) };
}

/**
 * Drives a ribbon (a branch from its start, or the main road from builder
 * arc length `from`) at top speed until the kart passes the main road's
 * pose at builder arc length `to`; reports the time and whether it fell.
 * A boost of `boost` seconds kicks in at ribbon arc length `boostAt`.
 */
function drive(track: Track, ribbon: Ribbon, to: number, p: ReturnType<typeof kartParams>, boost: number, from?: number, boostAt = -Infinity) {
  const s0 = from === undefined ? 0 : track.mainS(from);
  const pt = pointAt(ribbon.spline, s0);
  const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
  Object.assign(kart, shortcutLap(track.def));
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
