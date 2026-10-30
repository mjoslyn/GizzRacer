import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { BUBBLE_LIFT, BUBBLE_SHOVE, BUBBLE_SLOW, BUBBLE_STAGES, HazardSystem, type HazardPose } from '../src/items/hazards';
import { TRICK_BOOST, createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { buildFloatAlong } from '../src/tracks/floatAlong';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildFloatAlong();
const track = new Track(def);
const main = track.main;
const section = (name: string) => def.main.sections.find((s) => s.name === name)!;
const first = RACERS[0];

describe('Float Along', () => {
  it("is the cup's last, after the album's closer, on a country road of gravel", () => {
    const cup = CUPS.find((c) => c.id === 'float-along-fill-your-lungs')!;
    expect(TRACK_LIST[cup.tracks[3]].id).toBe('float-along');
    expect(TRACK_SONGS['float-along'].title).toBe('Float Along – Fill Your Lungs');
    expect(def.theme).toBe('float');
    expect(def.music).toEqual({ lap: 'float-along', finalLap: 'float-along-final-lap' });
    for (const s of def.main.sections) expect(s.surface, s.name).toBe('gravel');
  });

  it('runs through the song in order: the carpet shades, a baby\'s face, float along, fill your lungs, breathe, the paper folds, the coffee mug', () => {
    expect(def.main.sections.map((s) => s.name)).toEqual(['The Old Ford', 'Carpet Shades', "A Baby's Face", 'Float Along', 'Fill Your Lungs', 'Breathe a Deep Breath', 'Paper Folds', 'My Coffee Mug', 'Finish Straight']);
    const length = track.length;
    console.log(`Float Along: ${length.toFixed(0)} m a lap`);
    expect(length).toBeGreaterThan(1800);
    expect(length).toBeLessThan(2700);
    expect(def.laps).toBe(3);
  });

  it('is a cinquefoil: five lobes, twice round the middle, crossing itself five times, one road over the other each time', () => {
    const sp = main.spline;
    // Five lobes: the road swings out from the middle and back five times.
    const r = Array.from({ length: sp.count }, (_, i) => Math.hypot(sp.px[i], sp.pz[i]));
    let lobes = 0;
    const W = 40;
    for (let i = 0; i < sp.count; i++) {
      let top = true;
      for (let o = -W; o <= W && top; o++) if (o && r[(i + o + sp.count) % sp.count] >= r[i]) top = false;
      if (top && r[i] > 150) lobes++;
    }
    expect(lobes).toBe(5);
    // Twice round the middle.
    let turned = 0;
    for (let i = 0; i < sp.count; i++) {
      const j = (i + 1) % sp.count;
      turned += wrapAngle(Math.atan2(sp.px[j], sp.pz[j]) - Math.atan2(sp.px[i], sp.pz[i]));
    }
    expect(Math.abs(turned) / (2 * Math.PI)).toBeCloseTo(2, 5);
    const knot = crossings(track);
    expect(knot.length).toBe(5);
    for (const c of knot) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(6);
      // The upper road on a deck; the lower on the ground, or sunk beneath it.
      expect(sectionAt(c.upperS).bridge, c.upper).toBe(true);
      expect(c.lowerY, c.lower).toBeLessThan(0.5);
    }
    expect(knot.map((c) => `${c.upper} over ${c.lower}`).sort()).toEqual(
      ["A Baby's Face over Paper Folds", 'Breathe a Deep Breath over A Baby\'s Face', 'Carpet Shades over Fill Your Lungs', 'Float Along over The Old Ford', 'My Coffee Mug over Float Along'].sort(),
    );
  });

  it('fills its lungs: round the dam on the ground, then sunk in a cut beneath its wall, bubbles rising through the road; then breathes, up to a crest to fly off', () => {
    const lungs = section('Fill Your Lungs');
    const sp = main.spline;
    let deepest = Infinity;
    let at0 = 0;
    for (let s = lungs.from; s < lungs.to; s += 2) {
      const y = main.heightAtBuilder(s);
      if (y < deepest) [deepest, at0] = [y, s];
    }
    expect(deepest).toBeLessThan(-6);
    // Walled in by the cut, its walls up past the ground.
    const i = Math.round((track.mainS(at0) / sp.length) * sp.count) % sp.count;
    expect(main.cut[i]).toBe(1);
    expect(main.wallHeight[i]).toBeGreaterThan(-deepest);
    const at = def.hazards.filter((h) => h.kind === 'bubbles').flatMap((h) => ('at' in h ? h.at : []));
    expect(at.filter((s) => Math.abs(main.heightAtBuilder(s) - deepest) < 0.5).length).toBeGreaterThanOrEqual(3);
    for (const s of at) expect(s > lungs.from && s < lungs.to).toBe(true);
    const breathe = section('Breathe a Deep Breath');
    let top = 0;
    for (let s = breathe.from; s < breathe.to; s += 2) top = Math.max(top, main.heightAtBuilder(s));
    expect(top).toBeGreaterThan(10);
    // The only walled stretch, and the deepest.
    const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
    const bottom = Math.min(...heights);
    expect(bottom).toBeLessThan(-6);
    expect(deepest).toBeCloseTo(bottom, 1);
    // The only stretch sunk below the ground.
    for (let k = 0; k < sp.count; k++) if (main.cut[k]) expect(sectionAt(main.toBuilder(sp.dist[k])).name).toBe('Fill Your Lungs');
  });

  it('floats along over five swells, down under My Coffee Mug and up onto its deck over the Old Ford', () => {
    const float = section('Float Along');
    const deck = crossings(track).find((c) => c.upper === 'Float Along' && c.lower === 'The Old Ford')!;
    // Each swell stands up from the road either side of it.
    const h = (s: number) => main.heightAtBuilder(s);
    const lift = (s: number) => h(s) - (h(s - 15) + h(s + 15)) / 2;
    const swells: number[] = [];
    for (let s = float.from + 4; s < deck.upperS - 40; s += 2) if (lift(s) > lift(s - 2) && lift(s) >= lift(s + 2) && lift(s) > 0.3) swells.push(s);
    expect(swells.length).toBe(5);
    // Long and easy: a good way apart.
    for (let k = 1; k < swells.length; k++) expect(swells[k] - swells[k - 1]).toBeGreaterThan(35);
  });

  it('leaps a crease in the paper folds: a 100cc kart at full speed clears it', () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const folds = section('Paper Folds');
    expect(a > folds.from && z < folds.to).toBe(true);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });

  it('starts by the old Ford, and sees the face in the clouds', () => {
    expect(def.landmarks.filter((l) => l.s < 20).map((l) => l.kind)).toEqual(['oldFord']);
    const faces = def.landmarks.filter((l) => l.kind === 'faceCloud');
    expect(faces.length).toBeGreaterThanOrEqual(1);
    for (const f of faces) expect(Math.abs(f.lateral ?? 0)).toBeGreaterThanOrEqual(100);
  });
});

describe('Deep Breath, straight across under the dam', () => {
  const k = def.branches.findIndex((b) => b.name === 'Deep Breath');
  const bdef = def.branches[k];
  const branch = track.branches[k];
  const lap2: LapContext = { lap: 2, lastLap: false };

  it('leaves Fill Your Lungs where it swells out round the dam, and meets the main road again at the same pose', () => {
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
      expect(Math.abs(main.heightAtBuilder(s) - branch.heightAt(s === bdef.mainFrom ? 0 : branch.spline.length))).toBeLessThan(0.05);
    }
    for (const end of [bdef.sections[0], bdef.sections[bdef.sections.length - 1]]) expect(end.wallHeight ?? 0).toBe(0);
    for (const s of [bdef.mainFrom, bdef.mainTo]) expect(def.main.sections.find((q) => s >= q.from && s <= q.to)!.wallHeight ?? 0).toBe(0);
    const lungs = section('Fill Your Lungs');
    expect(bdef.mainFrom > lungs.from && bdef.mainTo < lungs.to).toBe(true);
  });

  it('dives under the dam, keeps clear of the main road away from its ends, and stays in bounds', () => {
    expect(Math.min(...bdef.elevation.map(([, y]) => y))).toBeLessThan(-4);
    const sp = branch.spline;
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 40 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 40 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(4);
    }
    // The dam is clear of the main road: its water never under it.
    const msp = main.spline;
    for (const pit of def.pits.filter((p) => p.liquid === 'water' && p.depth < 12)) {
      for (let i = 0; i < msp.count; i++) expect(inPit({ ...pit, halfWidth: pit.halfWidth + main.halfWidth[i], halfLength: pit.halfLength + main.halfWidth[i] }, msp.px[i], msp.pz[i])).toBe(false);
    }
  });

  it('puts a row of double item boxes on it', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('is there from lap 2: gone on the first, so you drive into the dam', () => {
    expect(bdef.openOn).toEqual([2, 'final']);
    const p = kartParams(first.stats, '150cc');
    expect(drive(branch, bdef.mainTo, p, undefined, lap2).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 1, lastLap: false }).fell).toBe(true);
  });

  it('saves 0.8 to 2.5 s at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p, undefined, lap2);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, lap2);
    console.log(`Float Along: Deep Breath ${via.time.toFixed(2)} s, round the dam ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.8);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('Float Along elevation and driving', () => {
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);

  it('has one to three kickers on the Old Ford that launch a kart at 100cc and land it on the road', () => {
    expect(lips.length).toBeGreaterThanOrEqual(1);
    expect(lips.length).toBeLessThanOrEqual(3);
    const ford = section('The Old Ford');
    const p = kartParams(first.stats, '100cc');
    for (const lip of lips) {
      expect(lip > ford.from && lip < ford.to).toBe(true);
      const start = track.mainS(Math.max(0, lip - 7 - 15));
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
        expect(fallen(kart)).toBe(false);
      }
      expect(launched, `kicker at ${lip.toFixed(0)}`).toBe(true);
      expect(landed).toBe(true);
      expect(track.locate(kart.x, kart.z, kart.y).onRoad).toBe(true);
    }
  });

  it('keeps its cut clear of pits, so the ground opens cleanly round it', () => {
    expect(main.cut.some((x) => x > 0)).toBe(true);
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

  it('gives a fast kart airtime off the crest, and laps it at 150cc with no falls', () => {
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
    console.log(`Float Along: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const breathe = section('Breathe a Deep Breath');
    expect(crests.some((b) => b > breathe.from && b < breathe.to + 40)).toBe(true);
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

describe('bubbles: great breaths of air rising up through the road', () => {
  const h = new HazardSystem(track);

  it('froth on the road for two beats, harmless', () => {
    const p = when(h, (q) => q.phase > 0.05 && q.phase < BUBBLE_STAGES.rise - 0.05);
    expect(p.active).toBe(false);
    expect(p.y).toBeCloseTo(p.ground, 5);
    expect(h.collide([kartAt(p)], PHYSICS_DT)).toEqual([]);
  });

  it('caught as one rises, it floats you up, and you come down on a boost', () => {
    const p = when(h, (q) => q.phase > BUBBLE_STAGES.rise + 0.05 && q.phase < BUBBLE_STAGES.burst - 0.05);
    expect(p.y).toBeGreaterThan(p.ground + 0.5);
    const kart = kartAt(p);
    kart.speed = 20;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'bubbles', good: true });
    expect(kart.grounded).toBe(false);
    expect(kart.vy).toBe(BUBBLE_LIFT);
    expect(kart.spinTime).toBe(0);
    // Up, and down again on the road, boosted.
    const prm = kartParams(first.stats, '150cc');
    let air = 0;
    let progress = nearestOnSpline(track.spline, kart.x, kart.z).s;
    for (let t = 0; t < 3 && !kart.grounded; t += PHYSICS_DT) {
      const ev = stepKart(kart, steerAlong(main, kart, progress), prm, track, PHYSICS_DT);
      progress = nearestOnSpline(track.spline, kart.x, kart.z).s;
      air += PHYSICS_DT;
      if (ev.trick) expect(kart.boostTime).toBeGreaterThanOrEqual(TRICK_BOOST - 1e-6);
    }
    expect(kart.grounded).toBe(true);
    expect(air).toBeGreaterThan(0.5);
    expect(kart.boostTime).toBeGreaterThan(0);
    // Once a while: straight back into another is nothing.
    const again = kartAt(p);
    expect(h.collide([again], PHYSICS_DT).filter((e) => e.kart === kart)).toEqual([]);
  });

  it('driven into as it bursts, it knocks you aside and slows you, without spinning you', () => {
    const p = when(h, (q) => q.active);
    expect(p.phase).toBeGreaterThanOrEqual(BUBBLE_STAGES.burst);
    const kart = kartAt(p);
    // Just to its right.
    kart.x += -Math.cos(p.heading) * 1.5;
    kart.z += Math.sin(p.heading) * 1.5;
    kart.speed = 20;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'bubbles' });
    expect(kart.speed).toBeCloseTo(20 * BUBBLE_SLOW);
    // Shoved to the right, across the road.
    expect(-Math.cos(p.heading) * kart.extX + Math.sin(p.heading) * kart.extZ).toBeCloseTo(BUBBLE_SHOVE);
    expect(kart.spinTime).toBe(0);
    // Burst and gone: nothing there.
    const gone = when(h, (q) => q.phase > BUBBLE_STAGES.gone + 0.02);
    expect(h.collide([kartAt(gone)], PHYSICS_DT)).toEqual([]);
  });

  it('rise on a five-beat rhythm: each a beat after the one before it', () => {
    h.update(7);
    const row = h.poses.filter((q) => q.kind === 'bubbles').slice(0, 3);
    for (let k = 1; k < row.length; k++) {
      const lag = (((row[k].phase - row[k - 1].phase) % 1) + 1) % 1;
      expect(lag).toBeCloseTo(0.2, 5);
    }
  });
});

/** Steps race time until a bubble is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.02) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'bubbles' && ok(q));
    if (p) return p;
  }
  throw new Error('no bubble in that stage');
}

/** A kart sitting on the road right under a hazard. */
function kartAt(p: HazardPose): KartState {
  const s = createKartState(p.x, p.z, p.heading);
  s.y = s.groundY = p.ground;
  return s;
}

function sectionAt(s: number) {
  return def.main.sections.find((q) => s >= q.from && s <= q.to)!;
}

/** Where the main road crosses itself: for each crossing, which road is over which and the least height between them. */
function crossings(t: Track) {
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
  return found.map(({ i, j, dy }) => {
    const [up, low] = t.main.heightAt(sp.dist[i]) > t.main.heightAt(sp.dist[j]) ? [i, j] : [j, i];
    const upperS = t.main.toBuilder(sp.dist[up]);
    const lowerS = t.main.toBuilder(sp.dist[low]);
    return { dy, upper: sectionAt(upperS).name, lower: sectionAt(lowerS).name, upperS, lowerY: t.main.heightAt(sp.dist[low]) };
  });
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

/** Steers the kart's travel toward a point further along `ribbon`, as the autopilot in tests/track.test.ts does. */
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

/** Drives straight down a ribbon from arc length `s` and reports whether the kart landed or fell. */
function jump(t: Track, s: number, ribbon: number, speed: number, boost: number, p: ReturnType<typeof kartParams>) {
  const r = t.ribbon(ribbon);
  const pt = pointAt(r.spline, s);
  const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
  kart.y = kart.groundY = r.heightAt(s);
  kart.speed = speed;
  kart.boostTime = boost;
  let progress = s;
  for (let k = 0; k < 4; k += PHYSICS_DT) {
    stepKart(kart, steerAlong(r, kart, progress), p, t, PHYSICS_DT);
    progress = nearestOnSpline(r.spline, kart.x, kart.z).s;
    if (fallen(kart)) return 'fell';
  }
  return 'cleared';
}
