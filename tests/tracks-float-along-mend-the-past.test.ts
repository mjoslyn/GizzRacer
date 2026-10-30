import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { FUZZ_BOOST } from '../src/items/items';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { CAMERA_BOOST, CAMERA_GAP, CAMERA_RADIUS, CAMERA_SLOW, HazardSystem, type HazardPose } from '../src/items/hazards';
import { KART_RADIUS, createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { buildMendThePast } from '../src/tracks/mendThePast';
import { TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildMendThePast();
const track = new Track(def);
const section = (name: string) => def.main.sections.find((s) => s.name === name)!;
const first = RACERS[0];
/** The Last Time I Ask is there on the final lap of three. */
const FINAL: LapContext = { lap: 3, lastLap: true };
const SHUT: LapContext = { lap: 2, lastLap: false };

describe('Let Me Mend the Past', () => {
  it('is the song, in nan\'s house: its own world, road and music', () => {
    expect(TRACK_LIST[6].id).toBe('mend-the-past');
    expect(def.theme).toBe('nan');
    expect(new Set(def.main.sections.map((s) => s.surface))).toEqual(new Set(['florals']));
    expect(def.music).toEqual({ lap: 'mend-the-past', finalLap: 'mend-the-past-final-lap' });
    expect(TRACK_SONGS['mend-the-past'].title).toBe('Let Me Mend the Past');
    expect(def.laps).toBe(3);
    expect(track.length).toBeGreaterThan(1800);
    expect(track.length).toBeLessThan(2700);
    // Nan's front door at the start, locks all down it, and again at the Locks on the Door; her cups on the wall, off the road.
    expect(def.landmarks.filter((l) => l.s < 20).map((l) => l.kind)).toEqual(['lockedDoor']);
    const locks = section('Locks on the Door');
    expect(def.landmarks.some((l) => l.kind === 'lockedDoor' && l.s >= locks.from - 5 && l.s <= locks.to)).toBe(true);
    const cups = def.landmarks.find((l) => l.kind === 'teacups')!;
    expect(Math.abs(cups.lateral ?? 0)).toBeGreaterThanOrEqual(100);
    const wall = section('Her Cups on My Wall');
    expect(cups.s >= wall.from && cups.s <= wall.to).toBe(true);
  });

  it('runs its sections in the order the song sings them', () => {
    expect(def.main.sections.map((s) => s.name)).toEqual([
      'Let Me Mend the Past',
      'Behind Your Mask',
      'She Stares at the Ground',
      'Locks on the Door',
      'Surveillance',
      'The Hall',
      'Her Cups on My Wall',
      'Hard to Be Ignored',
      'Make Ends Meet',
      'Before They Bleed',
      'Come Across Too Weak',
      'This Will Be the Last',
      'Finish Straight',
    ]);
    // Don't wanna come across too weak: the narrowest road on the lap, up on a deck.
    const weak = section('Come Across Too Weak');
    expect(Math.min(...def.main.sections.map((s) => s.halfWidth))).toBe(weak.halfWidth);
    expect(weak.bridge).toBe(true);
  });

  it('stitches back and forth across itself, over, under, over, each crossing a tier apart', () => {
    // Up the seam, the thread passes over the way back at the first crossing, under it in the Hall at the
    // second, and over it again at the third.
    expect(over('Behind Your Mask', 'This Will Be the Last')).toBeGreaterThan(7);
    expect(over('Come Across Too Weak', 'The Hall')).toBeGreaterThan(12);
    expect(over('Hard to Be Ignored', 'Before They Bleed')).toBeGreaterThan(7);
    for (const name of ['Behind Your Mask', 'Come Across Too Weak', 'Hard to Be Ignored']) expect(section(name).bridge, name).toBe(true);
    const crossed = crossings(track);
    expect(crossed.length).toBe(3);
    for (const dy of crossed) expect(dy).toBeGreaterThan(6);
    // And the hairpin there at the far end of the tear, turned right back.
    const ends = section('Make Ends Meet');
    const a = pointAt(track.spline, track.mainS(ends.from));
    const z = pointAt(track.spline, track.mainS(ends.to));
    expect(Math.abs(wrapAngle(Math.atan2(a.tx, a.tz) - Math.atan2(z.tx, z.tz)))).toBeGreaterThan(Math.PI * 0.85);
  });

  it('sinks the Hall between its walls, the cameras up on them', () => {
    const walled = def.main.sections.filter((s) => (s.wallHeight ?? 0) >= 5);
    expect(walled.map((s) => s.name)).toEqual(['Surveillance', 'The Hall']);
    const at = def.hazards.filter((h) => h.kind === 'cameras').flatMap((h) => ('at' in h ? h.at : []));
    for (const sec of walled) {
      expect(at.some((s) => s >= sec.from && s <= sec.to), sec.name).toBe(true);
      expect(track.main.heightAtBuilder((sec.from + sec.to) / 2), sec.name).toBeLessThan(-4);
    }
    expect(def.hazards.every((h) => h.kind === 'cameras')).toBe(true);
  });

  it('leaps a gap in the floorboards to make the ends meet, even the slowest kart at 50cc', () => {
    expect(def.main.gaps.length).toBe(1);
    const [from] = def.main.gaps[0];
    const sec = def.main.sections.find((s) => from >= s.from && from <= s.to)!;
    expect(sec.name).toBe('Make Ends Meet');
    for (const r of RACERS) {
      const slow = kartParams(r.stats, '50cc');
      expect(jump(track, track.mainS(from) - 30, -1, slow.topSpeed, 0, slow), r.id).toBe('cleared');
    }
  });
});

describe('The Last Time I Ask', () => {
  const k = def.branches.findIndex((b) => b.name === 'The Last Time I Ask');
  const bdef = def.branches[k];
  const branch = track.branches[k];

  it('leaves and rejoins This Will Be the Last, open-edged, at the same pose', () => {
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
      const sec = def.main.sections.find((q) => s >= q.from && s <= q.to)!;
      expect(sec.name).toBe('This Will Be the Last');
      expect(sec.wallHeight ?? 0).toBe(0);
    }
    for (const end of [bdef.sections[0], bdef.sections[bdef.sections.length - 1]]) expect(end.wallHeight ?? 0).toBe(0);
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

  it('is there only on the final lap, a row of double boxes on it: on the others, drive on and you fall in', () => {
    expect(bdef.openOn).toEqual(['final']);
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
    const p = kartParams(first.stats, '150cc');
    const open = drive(branch, bdef.mainTo, p, 0, undefined, -Infinity, FINAL);
    expect(open.fell).toBe(false);
    expect(open.time).toBeLessThan(20);
    expect(drive(branch, bdef.mainTo, p, 0, undefined, -Infinity, SHUT).fell).toBe(true);
    const moderate = drive(branch, bdef.mainTo, kartParams(first.stats, '100cc'), FUZZ_BOOST, undefined, 0, FINAL);
    expect(moderate.fell).toBe(false);
  });

  it('is quicker than the main line at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const viaBranch = drive(branch, bdef.mainTo, p, 0, undefined, -Infinity, FINAL);
    const viaMain = drive(track.main, bdef.mainTo, p, 0, bdef.mainFrom, -Infinity, FINAL);
    console.log(`The Last Time I Ask ${viaBranch.time.toFixed(2)} s, main line ${viaMain.time.toFixed(2)} s, saves ${(viaMain.time - viaBranch.time).toFixed(2)} s`);
    expect(viaBranch.fell).toBe(false);
    expect(viaMain.fell).toBe(false);
    expect(viaBranch.time).toBeLessThan(viaMain.time - 0.8);
    expect(viaBranch.time).toBeGreaterThan(viaMain.time - 2.5);
  });
});

describe('Let Me Mend the Past: the ride', () => {
  const main = track.main;
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);

  it('has two kickers early on that launch a kart at 100cc and land it on the road', () => {
    expect(lips.length).toBe(2);
    for (const lip of lips) expect(lip).toBeLessThan(section('Let Me Mend the Past').to);
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
        expect(fallen(kart), `kicker at ${lip.toFixed(0)}`).toBe(false);
      }
      expect(launched, `kicker at ${lip.toFixed(0)}`).toBe(true);
      expect(landed).toBe(true);
      expect(track.locate(kart.x, kart.z, kart.y).onRoad).toBe(true);
    }
  });

  it('climbs onto its decks and sinks into the Hall, its cut clear of the pits', () => {
    const top = Math.max(...heights);
    const bottom = Math.min(...heights);
    expect(top).toBeGreaterThan(7.5);
    expect(bottom).toBeLessThan(-5.5);
    const sp = main.spline;
    expect(main.cut.some((x) => x > 0)).toBe(true);
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
    console.log(`Let Me Mend the Past: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
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

describe('the cameras in the hallway', () => {
  it('pan their two beams right across the road together and back, a gap kept between them, the same at the same moment', () => {
    const h = new HazardSystem(track);
    const again = new HazardSystem(track);
    let most = -Infinity;
    let least = Infinity;
    for (let t = 0; t < 10; t += 0.05) {
      h.update(t);
      again.update(t);
      for (const [k, p] of h.poses.entries()) {
        expect(again.poses[k].x).toBeCloseTo(p.x, 6);
        expect(again.poses[k].gap).toBeCloseTo(p.gap, 6);
        // The pose is the left beam: the gap is half a gap to its right, and the other beam a whole gap.
        expect(lateral(p, p.x, p.z)).toBeCloseTo(p.gap - CAMERA_GAP / 2, 5);
        const edge = p.radius - CAMERA_GAP / 2 - CAMERA_RADIUS;
        expect(Math.abs(p.gap)).toBeLessThanOrEqual(edge + 1e-6);
        most = Math.max(most, p.gap);
        least = Math.min(least, p.gap);
      }
    }
    expect(most).toBeGreaterThan(5);
    expect(least).toBeLessThan(-5);
  });

  it('caught in a beam you are seen, a flash, and slowed; slipped through the gap between, unseen, a boost', () => {
    const h = new HazardSystem(track);
    h.update(3.3);
    const p = h.poses[0];
    const seen = beside(p, p.gap - CAMERA_GAP / 2);
    seen.speed = 20;
    expect(h.collide([seen], PHYSICS_DT)[0]).toMatchObject({ by: 'cameras' });
    expect(h.collide([seen], PHYSICS_DT)).toEqual([]);
    expect(seen.speed).toBeCloseTo(20 * CAMERA_SLOW);
    expect(seen.spinTime).toBe(0);
    const other = beside(p, p.gap + CAMERA_GAP / 2);
    other.speed = 20;
    expect(h.collide([other], PHYSICS_DT)[0]).toMatchObject({ by: 'cameras' });
    const unseen = beside(p, p.gap);
    unseen.speed = 20;
    expect(h.collide([unseen], PHYSICS_DT)[0]).toMatchObject({ by: 'cameras', good: true });
    expect(unseen.boostTime).toBeCloseTo(CAMERA_BOOST);
    expect(unseen.speed).toBe(20);
    // Once in a while: not again straight away.
    expect(h.collide([unseen], PHYSICS_DT)).toEqual([]);
    // Off to the side of both beams, clear of the gap: nothing.
    const wide = beside(p, p.gap + CAMERA_GAP / 2 + CAMERA_RADIUS + KART_RADIUS + 1.5);
    expect(h.collide([wide], PHYSICS_DT)).toEqual([]);
    // Up or down the road from the beams' line: nothing either.
    const ahead = beside(p, p.gap);
    ahead.x += Math.sin(p.heading) * (CAMERA_RADIUS + KART_RADIUS + 1);
    ahead.z += Math.cos(p.heading) * (CAMERA_RADIUS + KART_RADIUS + 1);
    expect(h.collide([ahead], PHYSICS_DT)).toEqual([]);
  });

  it('shows CPUs both beams to steer round', () => {
    const h = new HazardSystem(track);
    h.update(1);
    const out: { x: number; z: number; r: number; vx: number; vz: number }[] = [];
    h.obstacles(out);
    expect(out.length).toBe(2 * h.poses.length);
    for (const o of out) expect(o.r).toBe(CAMERA_RADIUS);
  });
});

/** How far `upper` runs over `lower` where they're closest: the height between them there. */
function over(upper: string, lower: string): number {
  const a = section(upper);
  const b = section(lower);
  let closest = Infinity;
  let dy = 0;
  for (let s = a.from; s < a.to; s += 2) {
    const p = pointAt(track.spline, track.mainS(s));
    for (let q = b.from; q < b.to; q += 2) {
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
}

/** Where the main road crosses itself: for each crossing, the least height between the two roads there. */
function crossings(t: Track): number[] {
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
  return found.map((c) => c.dy);
}

/** A hazard pose's lateral (to the right of the road's centre) at a point. */
function lateral(p: HazardPose, x: number, z: number): number {
  return (x - p.ax) * -Math.cos(p.heading) + (z - p.az) * Math.sin(p.heading);
}

/** A kart on the beams' line across the road, `lat` metres to the right of the road's centre. */
function beside(p: HazardPose, lat: number): KartState {
  const k = createKartState(p.ax - Math.cos(p.heading) * lat, p.az + Math.sin(p.heading) * lat, p.heading);
  k.y = k.groundY = p.ground;
  return k;
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
  const err = wrapAngle(desired - travel);
  return { ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) };
}

/**
 * Drives a ribbon (a branch from its start, or the main road from builder
 * arc length `from`) at top speed until the kart passes the main road's
 * pose at builder arc length `to`; reports the time and whether it fell.
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

/** Drives straight down a ribbon from arc length `s` and reports whether the kart landed or fell. */
function jump(t: Track, s: number, ribbon: number, speed: number, boost: number, p: ReturnType<typeof kartParams>) {
  const r = t.ribbon(ribbon);
  const pt = pointAt(r.spline, s);
  const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
  kart.y = kart.groundY = r.heightAt(s);
  kart.speed = speed;
  kart.boostTime = boost;
  for (let k = 0; k < 4; k += PHYSICS_DT) {
    stepKart(kart, { ...NEUTRAL_INPUT, throttle: 1 }, p, t, PHYSICS_DT);
    if (fallen(kart)) return 'fell';
  }
  return 'cleared';
}
