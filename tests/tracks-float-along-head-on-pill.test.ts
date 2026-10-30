import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { FUZZ_BOOST } from '../src/items/items';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { HazardSystem, PILL_BOOST, PILL_STAGES, PILL_SWIM, rightPill, type HazardPose } from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { buildHeadOnPill } from '../src/tracks/headOnPill';
import { TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type Ribbon, type TrackDef } from '../src/tracks/track';

const SECTIONS = ['Just Yesterday', 'Across from My Legs', "Eyes Weren't in Me", 'Hold Me Up Straight', 'Screw My Head On', 'The Cup to My Lips', 'Black Enemy', 'The Wrong Pill', 'Pill'];
const first = RACERS[0];

describe('Head On/Pill', () => {
  const def = TRACK_LIST.find((t) => t.id === 'head-on-pill')!.build();
  const raw = buildHeadOnPill();
  const track = new Track(raw);
  const section = (name: string) => raw.main.sections.find((s) => s.name === name)!;

  it('is the song, in its own world: a paisley road, the sitar over the start, the black cup in the infield', () => {
    expect(def.theme).toBe('headon');
    expect(def.music).toEqual({ lap: 'head-on-pill', finalLap: 'head-on-pill-final-lap' });
    expect(TRACK_SONGS['head-on-pill'].title).toBe('Head On/Pill');
    expect(new Set(raw.main.sections.map((s) => s.surface))).toEqual(new Set(['paisley']));
    expect(def.landmarks.filter((l) => l.s < 20).map((l) => l.kind)).toEqual(['sitarGate']);
    expect(def.landmarks.find((l) => l.kind === 'blackCup')!.lateral! ** 2).toBeGreaterThanOrEqual(100 ** 2);
    expect(def.landmarks.some((l) => l.kind === 'lostLegs')).toBe(true);
    expect(def.laps).toBe(3);
    expect(track.length).toBeGreaterThan(1800);
    expect(track.length).toBeLessThan(2700);
  });

  it("is laid out after the song's lines, in the order it sings them", () => {
    expect(raw.main.sections.map((s) => s.name).filter((n) => n !== 'Finish Straight')).toEqual(SECTIONS);
  });

  it('is a figure of eight, Head On one loop and Pill the other: the Cup to My Lips crosses back over Just Yesterday on a deck, and the head screws on up round itself', () => {
    const over = (upper: string, lower: string) => {
      const a = section(upper);
      const b = section(lower);
      let closest = Infinity;
      let dy = 0;
      for (let s = a.from; s < a.to; s += 2) {
        const p = pointAt(track.spline, track.mainS(s));
        for (let q = b.from; q < b.to; q += 2) {
          // Along the lap from each other: where one section runs into the next isn't a crossing.
          if (Math.abs(s - q) < 120) continue;
          const r = pointAt(track.spline, track.mainS(q));
          const d = Math.hypot(p.x - r.x, p.z - r.z);
          if (d < closest) {
            closest = d;
            dy = track.main.heightAtBuilder(s) - track.main.heightAtBuilder(q);
          }
        }
      }
      expect(closest, `${upper} over ${lower}`).toBeLessThan(3);
      return dy;
    };
    expect(over('The Cup to My Lips', 'Just Yesterday')).toBeGreaterThan(8);
    expect(over('Screw My Head On', 'Hold Me Up Straight')).toBeGreaterThan(8);
    expect(section('The Cup to My Lips').bridge).toBe(true);
    expect(section('Screw My Head On').bridge).toBe(true);
    // Those are the only two crossings, and the road is well clear of itself at each.
    const xs = crossings(track);
    expect(xs.length).toBe(2);
    for (const dy of xs) expect(dy).toBeGreaterThan(6);
    // Screwed on: a full three quarters of a turn and more, climbing to the top.
    const screw = section('Screw My Head On');
    expect(turning(track, screw.from, screw.to)).toBeGreaterThan(260);
    expect(track.main.heightAtBuilder(screw.to - 5)).toBeGreaterThan(14);
  });

  it("winds through three hairpins where the eyes weren't, and drives the same bend over and over through the Pill", () => {
    const eyes = section("Eyes Weren't in Me");
    const runs = bends(track, eyes.from, eyes.to);
    expect(runs.filter((deg) => Math.abs(deg) > 170).length).toBe(3);
    // Krautrock: bend after bend of the same turn, each the other way from the last.
    const pill = section('Pill');
    const kraut = bends(track, pill.from + 320, pill.to - 30).filter((deg) => Math.abs(deg) > 60);
    expect(kraut.length).toBeGreaterThanOrEqual(3);
    for (let k = 1; k < kraut.length; k++) {
      expect(Math.sign(kraut[k])).toBe(-Math.sign(kraut[k - 1]));
      expect(Math.abs(Math.abs(kraut[k]) - Math.abs(kraut[k - 1]))).toBeLessThan(6);
    }
  });

  it('sinks the Black Enemy between tall walls, the pills tumbling across it', () => {
    const walled = raw.main.sections.filter((s) => (s.wallHeight ?? 0) >= 5);
    expect(walled.map((s) => s.name)).toEqual(['Black Enemy']);
    const pills = raw.hazards.filter((h) => h.kind === 'pills').flatMap((h) => ('at' in h ? h.at : []));
    const enemy = section('Black Enemy');
    expect(pills.filter((s) => s > enemy.from && s < enemy.to).length).toBe(3);
    for (const s of pills.filter((q) => q > enemy.from && q < enemy.to)) expect(track.main.heightAtBuilder(s)).toBeLessThan(-5);
    expect(track.main.heightAtBuilder((enemy.from + enemy.to) / 2)).toBeLessThan(-4);
  });

  it("leaps where the legs aren't connected: the slowest kart clears it at 50cc", () => {
    expect(raw.main.gaps.length).toBe(1);
    const [a] = raw.main.gaps[0];
    expect(a > section('Across from My Legs').from && a < section('Across from My Legs').to).toBe(true);
    const slow = kartParams(RACERS.find((r) => r.id === 'swamp-witch')!.stats, '50cc');
    expect(jump(track, track.mainS(a) - 45, -1, slow.topSpeed, 0, slow)).toBe('cleared');
  });

  it('has one to three kickers on Just Yesterday that launch a kart at 100cc and land it on the road', () => {
    const lips = kickerLips(raw);
    expect(lips.length).toBeGreaterThanOrEqual(1);
    expect(lips.length).toBeLessThanOrEqual(3);
    const p = kartParams(first.stats, '100cc');
    for (const lip of lips) {
      expect(lip).toBeLessThan(section('Just Yesterday').to);
      const start = track.mainS(lip - 7 - 25);
      const pt = pointAt(track.spline, start);
      const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
      kart.y = kart.groundY = track.main.heightAt(start);
      kart.speed = p.topSpeed;
      let launched = false;
      let landed = false;
      let progress = start;
      for (let t = 0; t < 4 && !landed; t += PHYSICS_DT) {
        const ev = stepKart(kart, steerAlong(track.main, kart, progress), p, track, PHYSICS_DT);
        progress = nearestOnSpline(track.spline, kart.x, kart.z).s;
        launched ||= ev.launched;
        landed = launched && kart.grounded;
        expect(fallen(track, kart), `kicker at ${lip.toFixed(0)}`).toBe(false);
      }
      expect(launched, `kicker at ${lip.toFixed(0)}`).toBe(true);
      expect(landed).toBe(true);
      expect(track.locate(kart.x, kart.z, kart.y).onRoad).toBe(true);
    }
  });
});

describe('Head On/Pill: the Wrong Pill', () => {
  const def = buildHeadOnPill();
  const track = new Track(def);
  const k = def.branches.findIndex((b) => b.name === 'The Wrong Pill');
  const bdef = def.branches[k];
  const branch = track.branches[k];

  it('runs straight through the capsule, every lap, meeting the main road at both ends', () => {
    expect(k).toBeGreaterThanOrEqual(0);
    expect(bdef.openOn).toBeUndefined();
    expect(bdef.shut).toBeUndefined();
    const sp = branch.spline;
    const ends: [number, number, number, number][] = [
      [sp.px[0], sp.pz[0], Math.atan2(sp.tx[0], sp.tz[0]), bdef.mainFrom],
      [sp.px[sp.count - 1], sp.pz[sp.count - 1], Math.atan2(sp.tx[sp.count - 1], sp.tz[sp.count - 1]), bdef.mainTo],
    ];
    for (const [x, z, h, s] of ends) {
      const p = pointAt(track.spline, track.mainS(s));
      expect(Math.hypot(x - p.x, z - p.z)).toBeLessThan(1);
      expect(Math.abs(wrapAngle(h - Math.atan2(p.tx, p.tz)))).toBeLessThan((3 * Math.PI) / 180);
      expect(track.main.heightAtBuilder(s)).toBeCloseTo(0, 5);
    }
    for (const end of [bdef.sections[0], bdef.sections[bdef.sections.length - 1]]) expect(end.wallHeight ?? 0).toBe(0);
    for (const s of [bdef.mainFrom, bdef.mainTo]) expect(def.main.sections.find((q) => s >= q.from && s <= q.to)!.wallHeight ?? 0).toBe(0);
    // Straight: no bend in it at all.
    expect(Math.max(...Array.from(branch.curvature, Math.abs))).toBeLessThan(1e-3);
  });

  it('keeps clear of the main road away from its junctions, and inside the bounds', () => {
    const sp = branch.spline;
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 40 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 40 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - track.main.halfWidthAt(hit) - branch.halfWidth[i], `branch s ${sp.dist[i].toFixed(0)}`).toBeGreaterThan(4);
    }
  });

  it('puts a row of double item boxes in the capsule', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('a kart driving through with a moderate boost reaches the rejoin', () => {
    const p = kartParams(first.stats, '100cc');
    const run = drive(track, branch, bdef.mainTo, p, FUZZ_BOOST);
    expect(run.fell).toBe(false);
    expect(run.time).toBeLessThan(20);
  });

  it('is quicker than the main line at 150cc, by 0.8 to 2.5 s', () => {
    const p = kartParams(first.stats, '150cc');
    const viaBranch = drive(track, branch, bdef.mainTo, p, 0);
    const viaMain = drive(track, track.main, bdef.mainTo, p, 0, bdef.mainFrom);
    console.log(`Head On/Pill: The Wrong Pill ${viaBranch.time.toFixed(2)} s, main line ${viaMain.time.toFixed(2)} s, saves ${(viaMain.time - viaBranch.time).toFixed(2)} s`);
    expect(viaBranch.fell).toBe(false);
    expect(viaMain.fell).toBe(false);
    expect(viaBranch.time).toBeLessThan(viaMain.time - 0.8);
    expect(viaBranch.time).toBeGreaterThan(viaMain.time - 2.5);
  });
});

describe('Head On/Pill elevation', () => {
  const def = TRACK_LIST.find((t) => t.id === 'head-on-pill')!.build();
  const track = new Track(def);
  const main = track.main;
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);

  it('climbs high up the screw and sinks low into the Black Enemy', () => {
    expect(Math.max(...heights)).toBeGreaterThan(14);
    expect(Math.min(...heights)).toBeLessThan(-6);
    expect(main.cut.some((x) => x > 0)).toBe(true);
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
      if (ev.launched && !lips.some((l) => Math.abs(b - l) < 6) && !def.main.gaps.some(([a, z]) => b > a - 4 && b < z + 4)) crests.push(b);
    }
    console.log(`Head On/Pill: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
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

describe('Head On/Pill: the pills', () => {
  const def = buildHeadOnPill();
  const h = new HazardSystem(new Track(def));

  it('tumble right across the road, one edge to the other and back the next time', () => {
    let most = -Infinity;
    let least = Infinity;
    const seen = new Set<number>();
    for (let t = 0; t < 20; t += 0.02) {
      h.update(t);
      for (const q of h.poses.filter((r) => r.kind === 'pills' && r.active)) {
        const lat = lateral(q);
        [most, least] = [Math.max(most, lat * q.side), Math.min(least, lat * q.side)];
        seen.add(q.side);
      }
    }
    expect(most).toBeGreaterThan(10);
    expect(least).toBeLessThan(-10);
    expect(seen).toEqual(new Set([1, -1]));
  });

  it('are the right pill and the wrong one by turns, and their colours say which', () => {
    const kinds = new Set<number>();
    for (let cycle = 0; cycle < 12; cycle++) for (let i = 0; i < 3; i++) kinds.add(rightPill(cycle, i) ? 1 : 0);
    expect(kinds).toEqual(new Set([0, 1]));
    h.update(7.3);
    for (const q of h.poses.filter((r) => r.kind === 'pills')) expect([0, 1]).toContain(q.lane);
  });

  it('the right pill is a boost to drive through', () => {
    const p = when(h, (q) => q.active && q.lane === 1);
    const s = kartAt(p);
    expect(h.collide([s], PHYSICS_DT)[0]).toMatchObject({ by: 'pills', good: true });
    expect(s.boostTime).toBeCloseTo(PILL_BOOST);
    expect(s.spinTime).toBe(0);
  });

  it('the wrong pill spins you out, and the steering swims after', () => {
    const p = when(h, (q) => q.active && q.lane === 0);
    const s = kartAt(p);
    s.speed = 20;
    const hit = h.collide([s], PHYSICS_DT)[0];
    expect(hit).toMatchObject({ by: 'pills' });
    expect(hit.good).toBeUndefined();
    expect(s.spinTime).toBeGreaterThan(0);
    expect(s.wobbleTime).toBeCloseTo(PILL_SWIM);
  });

  it('off the road between crossings, a pill touches nothing', () => {
    const p = when(h, (q) => q.phase > PILL_STAGES.across + 0.02);
    expect(p.active).toBe(false);
    expect(h.collide([kartAt({ ...p, x: p.ax, z: p.az })], PHYSICS_DT).filter((e) => e.by === 'pills' && e.kart)).toEqual([]);
  });
});

/** Steps race time until a pill is in a state `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.02) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'pills' && ok(q));
    if (p) return p;
  }
  throw new Error('no pill in that state');
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

/** Where the main road crosses itself: for each crossing, the least height between the two roads there. */
function crossings(track: Track): number[] {
  const sp = track.spline;
  const found: { i: number; j: number; dy: number }[] = [];
  for (let i = 0; i < sp.count; i += 4) {
    for (let j = i; j < sp.count; j += 4) {
      const along = sp.dist[j] - sp.dist[i];
      if (Math.min(along, sp.length - along) < 120) continue;
      if (Math.hypot(sp.px[i] - sp.px[j], sp.pz[i] - sp.pz[j]) > 4) continue;
      const dy = Math.abs(track.main.heightAt(sp.dist[i]) - track.main.heightAt(sp.dist[j]));
      const near = found.find((c) => Math.abs(sp.dist[c.i] - sp.dist[i]) < 60 && Math.abs(sp.dist[c.j] - sp.dist[j]) < 60);
      if (near) near.dy = Math.min(near.dy, dy);
      else found.push({ i, j, dy });
    }
  }
  return found.map((c) => c.dy);
}

/** The road's heading at builder arc length `s`. */
function headingAt(track: Track, s: number): number {
  const p = pointAt(track.spline, track.mainS(s));
  return Math.atan2(p.tx, p.tz);
}

/** How far the road turns between builder arc lengths `a` and `b`, in degrees, all of it whichever way. */
function turning(track: Track, a: number, b: number): number {
  let total = 0;
  for (let s = a; s + 1 <= b; s += 1) total += Math.abs(wrapAngle(headingAt(track, s + 1) - headingAt(track, s)));
  return (total * 180) / Math.PI;
}

/** The road's bends between `a` and `b`: each run of turning one way, in signed degrees, tiny ones dropped. */
function bends(track: Track, a: number, b: number): number[] {
  const runs: number[] = [];
  let run = 0;
  for (let s = a; s + 1 <= b; s += 1) {
    const d = (wrapAngle(headingAt(track, s + 1) - headingAt(track, s)) * 180) / Math.PI;
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
function fallen(track: Track, kart: KartState): boolean {
  if (kart.y > -2) return false;
  const loc = track.locateKart(kart);
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
  const travel = s.speed > 4 ? Math.atan2(Math.sin(s.heading) * s.speed + s.extX, Math.cos(s.heading) * s.speed + s.extZ) : s.heading;
  const err = wrapAngle(desired - travel);
  return { ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) };
}

/**
 * Drives a ribbon (a branch from its start, or the main road from builder
 * arc length `from`) at top speed until the kart passes the main road's
 * pose at builder arc length `to`; reports the time and whether it fell.
 */
function drive(track: Track, ribbon: Ribbon, to: number, p: ReturnType<typeof kartParams>, boost: number, from?: number) {
  const s0 = from === undefined ? 0 : track.mainS(from);
  const pt = pointAt(ribbon.spline, s0);
  const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
  kart.y = kart.groundY = ribbon.heightAt(s0);
  kart.speed = p.topSpeed;
  kart.boostTime = boost;
  const goal = pointAt(track.spline, track.mainS(to));
  let progress = s0;
  let hint = -1;
  for (let t = 0; t < 30; t += PHYSICS_DT) {
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
    if (fallen(track, kart)) return 'fell';
  }
  return 'cleared';
}
