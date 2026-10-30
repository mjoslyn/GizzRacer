import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { HazardSystem, VOID_BEATS, VOID_RADIUS, VOID_RIM, VOID_SLING, VOID_SLOW, VOID_STAGES, voidRadius, type HazardPose } from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { buildAlteredBeastIV } from '../src/tracks/alteredBeastIV';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildAlteredBeastIV();
const track = new Track(def);
const main = track.main;
/** A section by name: a name the road keeps across a deck is one section, from where it starts to where its deck ends. */
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];

describe('Altered Beast IV', () => {
  it("is the cup's last, the suite's last Altered Beast on its own, on a road of bone", () => {
    const cup = CUPS.find((c) => c.id === 'altered-beast')!;
    expect(TRACK_LIST[cup.tracks[3]].id).toBe('altered-beast-iv');
    expect(TRACK_SONGS['altered-beast-iv'].title).toBe('Altered Beast IV');
    expect(def.theme).toBe('hollow');
    expect(def.music).toEqual({ lap: 'altered-beast-iv', finalLap: 'altered-beast-iv-final-lap' });
    for (const s of def.main.sections) expect(s.surface, s.name).toBe('bone');
  });

  it('runs through the song in order, from no love no pain to the end of the cul-de-sac', () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      'No Love No Pain',
      'Kill for Sport',
      'So Crooked and Curled',
      'Completely Satisfied',
      'Hell and Back',
      'Until the End',
      'Never',
      "I Don't Feel Anything",
      'Ruthless and Savage',
      'The Void',
      'Canyon in the Chest',
      'End of the Cul-de-Sac',
      'Finish Straight',
    ]);
    const length = track.length;
    console.log(`Altered Beast IV: ${length.toFixed(0)} m a lap`);
    expect(length).toBeGreaterThan(1800);
    expect(length).toBeLessThan(2700);
    expect(def.laps).toBe(3);
  });

  it('is the beast laid open: a canyon down its chest, two ribs of road crossing over it, and the cul-de-sac over its top', () => {
    const over = crossings(track);
    expect(over.map((c) => `${c.upper} over ${c.lower}`).sort()).toEqual(['Completely Satisfied over Canyon in the Chest', 'End of the Cul-de-Sac over Canyon in the Chest', 'Kill for Sport over Canyon in the Chest']);
    for (const c of over) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(6);
      // The upper road on a deck; the lower sunk in the canyon.
      expect(sectionAt(c.upperS).bridge, c.upper).toBe(true);
      expect(c.lowerY, c.lower).toBeLessThan(-5);
    }
    // The ribs run across the canyon, the one above the other, as ribs do.
    const ribs = over.filter((c) => c.upper !== 'End of the Cul-de-Sac');
    for (const c of ribs) {
      const a = pointAt(track.spline, track.mainS(c.upperS));
      const b = pointAt(track.spline, track.mainS(c.lowerS));
      expect(Math.abs(a.tx * b.tx + a.tz * b.tz)).toBeLessThan(0.35);
    }
  });

  it('sinks into the canyon in the chest through the void, walled in, the ribcage arching over it', () => {
    const sp = main.spline;
    const canyon = section('Canyon in the Chest');
    let deepest = Infinity;
    for (let s = canyon.from; s < canyon.to; s += 2) deepest = Math.min(deepest, main.heightAtBuilder(s));
    expect(deepest).toBeLessThan(-6);
    // Sunk most of its length.
    let sunk = 0;
    for (let s = canyon.from; s < canyon.to; s += 2) if (main.heightAtBuilder(s) < -5) sunk += 2;
    expect(sunk / (canyon.to - canyon.from)).toBeGreaterThan(0.8);
    // Walled in by the cut, its walls up past the ground; and the only stretch, with the void before it, sunk below it.
    for (let k = 0; k < sp.count; k++) {
      if (!main.cut[k]) continue;
      expect(['The Void', 'Canyon in the Chest', 'End of the Cul-de-Sac']).toContain(sectionAt(main.toBuilder(sp.dist[k])).name);
      expect(main.wallHeight[k]).toBeGreaterThan(-main.heightAt(sp.dist[k]));
    }
    // The ribcages stand over the sunk road, clear of the decks crossing it.
    const cages = def.landmarks.filter((l) => l.kind === 'ribcage');
    expect(cages.length).toBe(2);
    const decks = crossings(track).map((c) => c.lowerS);
    for (const c of cages) {
      expect(main.heightAtBuilder(c.s)).toBeLessThan(-4);
      for (const d of decks) expect(Math.abs(c.s - d)).toBeGreaterThan(40);
    }
  });

  it('ends in the cul-de-sac, the road turning right round to come back out over the way in', () => {
    const end = section('End of the Cul-de-Sac');
    const sp = main.spline;
    const i0 = Math.round((track.mainS(end.from) / sp.length) * sp.count);
    const i1 = Math.round((track.mainS(end.to) / sp.length) * sp.count);
    expect(Math.abs(main.turn[i1] - main.turn[i0])).toBeGreaterThan((260 * Math.PI) / 180);
    // A sign in the turning circle, off the road.
    const sign = def.landmarks.find((l) => l.kind === 'culDeSac' && l.lateral);
    expect(sign).toBeDefined();
    expect(sign!.s > end.from && sign!.s < end.to).toBe(true);
  });

  it('goes until the end, up to a crest, and never: off it, and a leap that a 100cc kart at full speed clears', () => {
    const until = section('Until the End');
    let top = 0;
    for (let s = until.from; s <= until.to + 2; s += 2) top = Math.max(top, main.heightAtBuilder(s));
    expect(top).toBeGreaterThan(9);
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const never = section('Never');
    expect(a > never.from && z < never.to).toBe(true);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });

  it("doesn't feel anything in the song's eleven: bends three, three, three and two beats long", () => {
    const feel = section("I Don't Feel Anything");
    // Runs of the road turning one way, then the other.
    const runs: { dir: number; len: number }[] = [];
    for (let s = feel.from; s < feel.to; s += 1) {
      const k = main.curvatureAt(track.mainS(s));
      const dir = Math.abs(k) < 1e-3 ? 0 : Math.sign(k);
      if (!dir) continue;
      if (runs.length && runs[runs.length - 1].dir === dir) runs[runs.length - 1].len += 1;
      else runs.push({ dir, len: 1 });
    }
    const inner = runs.slice(1, -1).filter((r) => r.len > 4);
    expect(inner.length).toBe(4);
    const beat = inner[0].len / 3;
    expect(inner.map((r) => r.len / beat)).toEqual([3, 3, 3, 2].map((b) => expect.closeTo(b, 0)));
  });

  it('starts at the No Through Road sign', () => {
    expect(def.landmarks.filter((l) => l.s < 20 && l.ribbon === -1).map((l) => l.kind)).toEqual(['culDeSac']);
  });
});

describe('Hell and Back, a dive down into the hellmouth and up again', () => {
  const k = def.branches.findIndex((b) => b.name === 'Hell and Back');
  const bdef = def.branches[k];
  const branch = track.branches[k];
  const last: LapContext = { lap: 3, lastLap: true };

  it('leaves Hell and Back where it swings out round the hellmouth, and meets the main road again at the same pose', () => {
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
    const hell = section('Hell and Back');
    expect(bdef.mainFrom > hell.from && bdef.mainTo < hell.to).toBe(true);
    expect(def.landmarks.some((l) => l.kind === 'hellmouth' && l.ribbon === k)).toBe(true);
  });

  it('dives down into the hellmouth and climbs back out, over the drop, clear of the main road and in bounds', () => {
    expect(Math.min(...bdef.elevation.map(([, y]) => y))).toBeLessThan(-4);
    const sp = branch.spline;
    // Over the hellmouth all the way down and back up: deeper than the road dives.
    const mouth = def.pits.find((p) => inPit(p, sp.px[Math.floor(sp.count / 2)], sp.pz[Math.floor(sp.count / 2)]))!;
    expect(mouth.depth).toBeGreaterThan(15);
    for (let i = 0; i < sp.count; i++) if (branch.heightAt(sp.dist[i]) < -0.5) expect(inPit(mouth, sp.px[i], sp.pz[i])).toBe(true);
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 40 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 40 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(4);
    }
    // The hellmouth is clear of the main road: its edge a good way from the road's.
    const msp = main.spline;
    const fx = Math.sin(mouth.heading);
    const fz = Math.cos(mouth.heading);
    for (let i = 0; i < msp.count; i++) {
      const dx = msp.px[i] - mouth.x;
      const dz = msp.pz[i] - mouth.z;
      const along = Math.max(0, Math.abs(dx * fx + dz * fz) - mouth.halfLength);
      const across = Math.max(0, Math.abs(-dx * fz + dz * fx) - mouth.halfWidth);
      expect(Math.hypot(along, across) - main.halfWidth[i]).toBeGreaterThan(2);
    }
  });

  it('puts a row of double item boxes on it', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('is there on the final lap only: before that, drive on and you fall into hell', () => {
    expect(bdef.openOn).toEqual(['final']);
    const p = kartParams(first.stats, '150cc');
    expect(drive(branch, bdef.mainTo, p, undefined, last).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 2, lastLap: false }).fell).toBe(true);
  });

  it('saves 0.8 to 2.5 s at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p, undefined, last);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, last);
    console.log(`Altered Beast IV: Hell and Back ${via.time.toFixed(2)} s, round the hellmouth ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.8);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('Altered Beast IV elevation and driving', () => {
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);

  it('has one to three kickers on No Love No Pain that launch a kart at 100cc and land it on the road', () => {
    expect(lips.length).toBeGreaterThanOrEqual(1);
    expect(lips.length).toBeLessThanOrEqual(3);
    const start = section('No Love No Pain');
    const p = kartParams(first.stats, '100cc');
    for (const lip of lips) {
      expect(lip > start.from && lip < start.to).toBe(true);
      const s0 = track.mainS(Math.max(0, lip - 7 - 15));
      const pt = pointAt(track.spline, s0);
      const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
      kart.y = kart.groundY = main.heightAt(s0);
      kart.speed = p.topSpeed;
      let launched = false;
      let landed = false;
      let progress = s0;
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

  it('keeps its canyon clear of pits, so the ground opens cleanly round it', () => {
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
    console.log(`Altered Beast IV: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const until = section('Until the End');
    const never = section('Never');
    expect(crests.some((b) => b > until.to - 10 && b < never.to)).toBe(true);
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

describe('void: hollows yawning open in the road on the eleven-beat bar', () => {
  const h = new HazardSystem(track);

  it('lie in The Void and the canyon, sunk, and nowhere else', () => {
    const at = def.hazards.filter((q) => q.kind === 'void').flatMap((q) => ('at' in q ? q.at : []));
    expect(at.length).toBe(6);
    for (const s of at) {
      expect(['The Void', 'Canyon in the Chest']).toContain(sectionAt(s).name);
      expect(main.heightAtBuilder(s)).toBeLessThan(-5);
    }
  });

  it('crack the road first, harmless', () => {
    const p = when(h, (q) => q.phase > 0.05 && q.phase < VOID_STAGES.yawn - 0.05);
    expect(p.active).toBe(false);
    expect(voidRadius(p.phase)).toBe(0);
    expect(h.collide([kartAt(p)], PHYSICS_DT)).toEqual([]);
  });

  it('yawn open, and drag you down if you drive over one, slowed but not spun', () => {
    const p = when(h, (q) => q.phase > VOID_STAGES.open && q.phase < VOID_STAGES.close - 0.05);
    expect(p.active).toBe(true);
    expect(voidRadius(p.phase)).toBe(VOID_RADIUS);
    const kart = kartAt(p);
    kart.speed = 20;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'void' });
    expect(kart.speed).toBeCloseTo(20 * VOID_SLOW);
    expect(kart.spinTime).toBe(0);
    // Flying over it, nothing.
    const over = kartAt(p);
    over.y += 3;
    over.grounded = false;
    expect(h.collide([over], PHYSICS_DT)).toEqual([]);
  });

  it('close again, and skirting the rim as one closes slings you on, a boost; over its middle as it closes, nothing', () => {
    const p = when(h, (q) => q.phase > VOID_STAGES.close + 0.03 && q.phase < VOID_STAGES.shut - 0.05);
    expect(p.active).toBe(false);
    const r = voidRadius(p.phase);
    expect(r).toBeGreaterThan(0.5);
    expect(r).toBeLessThan(VOID_RADIUS);
    // On the rim, to its right.
    const kart = kartAt(p);
    kart.x += -Math.cos(p.heading) * r;
    kart.z += Math.sin(p.heading) * r;
    kart.speed = 20;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'void', good: true });
    expect(kart.boostTime).toBeCloseTo(VOID_SLING);
    expect(kart.speed).toBe(20);
    // Well clear of the rim: nothing.
    const far = kartAt(p);
    far.x += -Math.cos(p.heading) * (r + VOID_RIM + 2.5);
    far.z += Math.sin(p.heading) * (r + VOID_RIM + 2.5);
    expect(h.collide([far], PHYSICS_DT)).toEqual([]);
    // Shut: nothing there.
    const gone = when(h, (q) => q.phase > VOID_STAGES.shut + 0.02);
    expect(h.collide([kartAt(gone)], PHYSICS_DT)).toEqual([]);
  });

  it('open one after another down a row, on three and three and three and two of the eleven', () => {
    h.update(7);
    const row = h.poses.filter((q) => q.kind === 'void').slice(0, 4);
    expect(VOID_BEATS).toEqual([0, 3, 6, 9]);
    for (let k = 1; k < row.length; k++) {
      const lag = (((row[k - 1].phase - row[k].phase) % 1) + 1) % 1;
      expect(lag).toBeCloseTo(3 / 11, 5);
    }
    // And round to the first again on the bar's last two.
    const back = (((row[3].phase - row[0].phase) % 1) + 1) % 1;
    expect(back).toBeCloseTo(2 / 11, 5);
  });
});

/** Steps race time until a hollow is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.02) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'void' && ok(q));
    if (p) return p;
  }
  throw new Error('no hollow in that stage');
}

/** A kart sitting on the road right on a hazard. */
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
    return { dy, upper: sectionAt(upperS).name, lower: sectionAt(lowerS).name, upperS, lowerS, lowerY: t.main.heightAt(sp.dist[low]) };
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
