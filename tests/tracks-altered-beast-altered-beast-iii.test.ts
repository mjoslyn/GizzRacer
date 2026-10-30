import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { FUZZ_BOOST } from '../src/items/items';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { FANG_BOOST, FANG_DEPTH, FANG_LAG, FANG_SPIN, FANG_STAGES, HazardSystem, fangBite, type HazardPose } from '../src/items/hazards';
import { KART_RADIUS, createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { buildAlteredBeastIII } from '../src/tracks/alteredBeastIII';
import { TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildAlteredBeastIII();
const track = new Track(def);
const section = (name: string) => def.main.sections.find((s) => s.name === name)!;
const first = RACERS[0];

describe('Altered Beast III', () => {
  it('is the song and Alter Me III after it, in the altered world: its own world, road and music', () => {
    expect(TRACK_LIST[22].id).toBe('altered-beast-iii');
    expect(def.theme).toBe('altered');
    expect(new Set(def.main.sections.map((s) => s.surface))).toEqual(new Set(['fur']));
    expect(def.music).toEqual({ lap: 'altered-beast-iii', finalLap: 'altered-beast-iii-final-lap' });
    expect([TRACK_SONGS['altered-beast-iii'].title, TRACK_SONGS['altered-beast-iii'].also]).toEqual(['Altered Beast III', 'Alter Me III']);
    expect(def.laps).toBe(3);
    expect(track.length).toBeGreaterThan(1800);
    expect(track.length).toBeLessThan(2700);
    // A jaw of nine fangs over the start, and again at the head of the gullet; the angels weeping off in the sky.
    expect(def.landmarks.filter((l) => l.s < 20).map((l) => l.kind)).toEqual(['fangGate']);
    const fangs = section('Nine Pearl Fangs');
    expect(def.landmarks.some((l) => l.kind === 'fangGate' && l.s >= fangs.from && l.s <= fangs.to)).toBe(true);
    const angels = def.landmarks.find((l) => l.kind === 'weepingAngels')!;
    expect(Math.abs(angels.lateral ?? 0)).toBeGreaterThanOrEqual(120);
    // Look to the sky: they're straight ahead all the way up the climb at Angels Weep, well off any road.
    const p = pointAt(track.spline, track.mainS(angels.s));
    const ax = p.x - p.tz * angels.lateral!;
    const az = p.z + p.tx * angels.lateral!;
    expect(nearestOnSpline(track.spline, ax, az).distance).toBeGreaterThan(80);
    const weep = section('Angels Weep');
    for (let s = weep.from; s <= weep.to; s += 10) {
      const v = pointAt(track.spline, track.mainS(s));
      expect(((ax - v.x) * v.tx + (az - v.z) * v.tz) / Math.hypot(ax - v.x, az - v.z), `at ${s.toFixed(0)}`).toBeGreaterThan(0.9);
    }
  });

  it('runs its sections in the order the songs sing them', () => {
    expect(def.main.sections.map((s) => s.name)).toEqual([
      'By the Tree',
      'Find a Place to Hide',
      'Steal a Peep',
      'Angels Weep',
      'I See You',
      'Altered World',
      'Nine White Teeth',
      'Hair on My Skin',
      'Feeling Beastly',
      'Nine Pearl Fangs',
      'Monstrosity Reborn',
      'Into Your Nucleus',
      'Finish Straight',
    ]);
  });

  it('is a double helix from above: two strands, mirror images across one straight axis, crossing three times', () => {
    // Out along one strand to the hairpin, back along the other: halfway round, the lap is at the far end.
    const out = [section('Find a Place to Hide').from, section('Nine White Teeth').to];
    const back = [section('Feeling Beastly').from, section('Into Your Nucleus').to];
    const pts = (from: number, to: number) => Array.from({ length: 200 }, (_, k) => pointAt(track.spline, track.mainS(from + ((to - from) * (k + 0.5)) / 200)));
    // Each point on the way out has its mirror on the way back, across the axis (the line y = x, corner to corner).
    const backPts = pts(back[0], back[1]);
    for (const p of pts(out[0], out[1])) {
      const mirror = backPts.reduce((best, q) => Math.min(best, Math.hypot(q.x - p.z, q.z - p.x)), Infinity);
      expect(mirror).toBeLessThan(12);
    }
    const crossed = crossings(track);
    expect(crossed.length).toBe(3);
    for (const c of crossed) {
      // Every crossing is between the two strands, on the axis.
      expect(Math.abs(c.x - c.z)).toBeLessThan(10);
      expect(c.dy).toBeGreaterThan(6);
    }
    // Evenly spaced along it: a half twist apart.
    const along = crossed.map((c) => (c.x + c.z) / Math.SQRT2).sort((a, b) => a - b);
    expect(Math.abs(along[2] - along[1] - (along[1] - along[0]))).toBeLessThan(10);
  });

  it('twists over and under, as a helix does: each strand under, over, under the other, or over, under, over', () => {
    expect(over('Monstrosity Reborn', 'Find a Place to Hide')).toBeGreaterThan(6);
    expect(over('Angels Weep', 'Nine Pearl Fangs')).toBeGreaterThan(12);
    expect(over('Feeling Beastly', 'Altered World')).toBeGreaterThan(12);
    for (const name of ['Monstrosity Reborn', 'Angels Weep', 'Feeling Beastly']) expect(section(name).bridge, name).toBe(true);
    // And the hairpin at the far end, turned right round.
    const pin = section('Hair on My Skin');
    const a = pointAt(track.spline, track.mainS(pin.from));
    const z = pointAt(track.spline, track.mainS(pin.to));
    expect(Math.abs(wrapAngle(Math.atan2(a.tx, a.tz) - Math.atan2(z.tx, z.tz)))).toBeGreaterThan(Math.PI * 0.85);
  });

  it('lays the base pairs across between the strands, clear of the roads', () => {
    const rungs = def.landmarks.filter((l) => l.kind === 'basePair');
    expect(rungs.length).toBeGreaterThan(8);
    const mid = (track.mainS(section('Hair on My Skin').from) + track.mainS(section('Hair on My Skin').to)) / 2;
    for (const r of rungs) {
      // One end on the way out, the other on the way back.
      expect(track.mainS(r.s)).toBeLessThan(mid);
      expect(track.mainS(r.to!)).toBeGreaterThan(mid);
      const a = pointAt(track.spline, track.mainS(r.s));
      const b = pointAt(track.spline, track.mainS(r.to!));
      // Square across the axis.
      expect(Math.abs(a.x + a.z - (b.x + b.z))).toBeLessThan(2);
    }
  });

  it('sinks the Altered World and the gullet between walls, the jaws in the gullet', () => {
    const walled = def.main.sections.filter((s) => (s.wallHeight ?? 0) >= 5);
    expect(walled.map((s) => s.name)).toEqual(['Altered World', 'Nine Pearl Fangs']);
    for (const sec of walled) expect(Math.min(...Array.from({ length: 20 }, (_, k) => track.main.heightAtBuilder(sec.from + ((sec.to - sec.from) * k) / 19))), sec.name).toBeLessThan(-5.5);
    const fangs = section('Nine Pearl Fangs');
    const at = def.hazards.flatMap((h) => ('at' in h ? h.at : []));
    expect(at.length).toBe(3);
    for (const s of at) {
      expect(s >= fangs.from && s <= fangs.to).toBe(true);
      expect(track.main.heightAtBuilder(s)).toBeLessThan(-1);
    }
    expect(def.hazards.every((h) => h.kind === 'fangs')).toBe(true);
  });

  it('leaps into the nucleus, even the slowest kart at 50cc', () => {
    expect(def.main.gaps.length).toBe(1);
    const [from] = def.main.gaps[0];
    expect(def.main.sections.find((s) => from >= s.from && from <= s.to)!.name).toBe('Into Your Nucleus');
    for (const r of RACERS) {
      const slow = kartParams(r.stats, '50cc');
      expect(jump(track, track.mainS(from) - 30, -1, slow.topSpeed, 0, slow), r.id).toBe('cleared');
    }
  });
});

describe('Steal a Peep', () => {
  const k = def.branches.findIndex((b) => b.name === 'Steal a Peep');
  const bdef = def.branches[k];
  const branch = track.branches[k];

  it('leaves and rejoins Steal a Peep, open-edged, at the same pose', () => {
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
      expect(['Find a Place to Hide', 'Steal a Peep']).toContain(sec.name);
      expect(Math.abs(track.main.heightAtBuilder(s))).toBeLessThan(0.05);
    }
    expect(section('Steal a Peep').wallHeight ?? 0).toBe(0);
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

  it('is there every lap, a row of double boxes on it', () => {
    expect(bdef.openOn).toBeUndefined();
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
    const p = kartParams(first.stats, '150cc');
    const open = drive(branch, bdef.mainTo, p, 0);
    expect(open.fell).toBe(false);
    expect(open.time).toBeLessThan(20);
    expect(drive(branch, bdef.mainTo, kartParams(first.stats, '100cc'), FUZZ_BOOST, undefined, 0).fell).toBe(false);
  });

  it('is quicker than the main line at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const viaBranch = drive(branch, bdef.mainTo, p, 0);
    const viaMain = drive(track.main, bdef.mainTo, p, 0, bdef.mainFrom);
    console.log(`Steal a Peep ${viaBranch.time.toFixed(2)} s, main line ${viaMain.time.toFixed(2)} s, saves ${(viaMain.time - viaBranch.time).toFixed(2)} s`);
    expect(viaBranch.fell).toBe(false);
    expect(viaMain.fell).toBe(false);
    expect(viaBranch.time).toBeLessThan(viaMain.time - 0.8);
    expect(viaBranch.time).toBeGreaterThan(viaMain.time - 2.5);
  });
});

describe('Altered Beast III: the ride', () => {
  const main = track.main;
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);

  it('has two kickers early on that launch a kart at 100cc and land it on the road', () => {
    expect(lips.length).toBe(2);
    for (const lip of lips) expect(lip).toBeLessThan(section('By the Tree').to);
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

  it('climbs onto its decks and sinks into its cuts, clear of the pits', () => {
    expect(Math.max(...heights)).toBeGreaterThan(7.5);
    expect(Math.min(...heights)).toBeLessThan(-5.5);
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
    console.log(`Altered Beast III: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
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

describe('the nine pearl fangs', () => {
  it('snap shut across the road one after another down the gullet, and open again, the same at the same moment', () => {
    const h = new HazardSystem(track);
    const again = new HazardSystem(track);
    const shut: number[][] = h.poses.map(() => []);
    for (let t = 0; t < 9.2; t += 0.02) {
      h.update(t);
      again.update(t);
      for (const [k, p] of h.poses.entries()) {
        expect(again.poses[k].phase).toBeCloseTo(p.phase, 6);
        expect(p.radius).toBeGreaterThan(track.main.halfWidthAtS(track.mainS((def.hazards[0] as { at: number[] }).at[k])));
        if (p.active && !shut[k].some((s) => t - s < 1)) shut[k].push(t);
      }
    }
    // Each bites once a period, the next down the gullet a beat later.
    for (const s of shut) expect(s.length).toBe(2);
    const period = (def.hazards[0] as { period: number }).period;
    expect(shut[1][0] - shut[0][0]).toBeCloseTo(FANG_LAG * period, 1);
    expect(shut[2][0] - shut[1][0]).toBeCloseTo(FANG_LAG * period, 1);
    // Wide open, baring, shut, opening.
    expect(fangBite(0.1)).toBe(0);
    expect(fangBite(FANG_STAGES.bare + 0.05)).toBeGreaterThan(0);
    expect(fangBite(FANG_STAGES.bare + 0.05)).toBeLessThan(0.5);
    expect(fangBite((FANG_STAGES.snap + FANG_STAGES.open) / 2)).toBe(1);
    const opening = fangBite((FANG_STAGES.open + FANG_STAGES.wide) / 2);
    expect(opening).toBeGreaterThan(0);
    expect(opening).toBeLessThan(1);
  });

  it('shut, they bite: spun out; through the gap as they open, a boost; wide open or baring, nothing', () => {
    const h = new HazardSystem(track);
    const period = (def.hazards[0] as { period: number }).period;
    const when = (u: number) => u * period - 10 + period * 10;
    h.update(when((FANG_STAGES.snap + FANG_STAGES.open) / 2));
    const p = h.poses[0];
    const bitten = beside(p, 3);
    bitten.speed = 20;
    expect(h.collide([bitten], PHYSICS_DT)[0]).toMatchObject({ by: 'fangs' });
    expect(bitten.spinTime).toBeCloseTo(FANG_SPIN);
    expect(h.collide([bitten], PHYSICS_DT)).toEqual([]);
    // Up or down the road from the jaw's line: nothing.
    const ahead = beside(p, 0);
    ahead.x += Math.sin(p.heading) * (FANG_DEPTH + KART_RADIUS + 1);
    ahead.z += Math.cos(p.heading) * (FANG_DEPTH + KART_RADIUS + 1);
    expect(h.collide([ahead], PHYSICS_DT)).toEqual([]);

    const h2 = new HazardSystem(track);
    h2.update(when((FANG_STAGES.open + FANG_STAGES.wide) / 2));
    const through = beside(h2.poses[0], -4);
    through.speed = 20;
    expect(h2.collide([through], PHYSICS_DT)[0]).toMatchObject({ by: 'fangs', good: true });
    expect(through.boostTime).toBeCloseTo(FANG_BOOST);
    expect(through.spinTime).toBe(0);
    // Once in a while: not again straight away.
    expect(h2.collide([through], PHYSICS_DT)).toEqual([]);

    for (const u of [0.1, FANG_STAGES.bare + 0.05, FANG_STAGES.wide + 0.05]) {
      const h3 = new HazardSystem(track);
      h3.update(when(u));
      const k = beside(h3.poses[0], 0);
      expect(h3.collide([k], PHYSICS_DT), `at ${u}`).toEqual([]);
    }
  });

  it('fill the road: nothing for a CPU to steer round, only to time', () => {
    const h = new HazardSystem(track);
    h.update(1);
    const out: { x: number; z: number; r: number; vx: number; vz: number }[] = [];
    h.obstacles(out);
    expect(out).toEqual([]);
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

/** Where the main road crosses itself: for each crossing, where, and the least height between the two roads there. */
function crossings(t: Track): { x: number; z: number; dy: number }[] {
  const sp = t.spline;
  const found: { i: number; j: number; dy: number; d: number; x: number; z: number }[] = [];
  for (let i = 0; i < sp.count; i += 2) {
    for (let j = i; j < sp.count; j += 2) {
      const along = sp.dist[j] - sp.dist[i];
      if (Math.min(along, sp.length - along) < 120) continue;
      const d = Math.hypot(sp.px[i] - sp.px[j], sp.pz[i] - sp.pz[j]);
      if (d > 4) continue;
      const dy = Math.abs(t.main.heightAt(sp.dist[i]) - t.main.heightAt(sp.dist[j]));
      const near = found.find((c) => Math.abs(sp.dist[c.i] - sp.dist[i]) < 60 && Math.abs(sp.dist[c.j] - sp.dist[j]) < 60);
      if (near) {
        near.dy = Math.min(near.dy, dy);
        if (d < near.d) Object.assign(near, { d, x: sp.px[i], z: sp.pz[i] });
      } else found.push({ i, j, dy, d, x: sp.px[i], z: sp.pz[i] });
    }
  }
  return found;
}

/** A kart on the jaw's line across the road, `lat` metres to the right of the road's centre. */
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
function drive(ribbon: Ribbon, to: number, p: ReturnType<typeof kartParams>, boost: number, from?: number, boostAt = -Infinity) {
  const s0 = from === undefined ? 0 : track.mainS(from);
  const pt = pointAt(ribbon.spline, s0);
  const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
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
