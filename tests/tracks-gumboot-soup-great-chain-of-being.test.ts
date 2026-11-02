import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import {
  HazardSystem,
  METEOR_BLAST,
  METEOR_CLEAR,
  METEOR_LANES,
  METEOR_MARK,
  METEOR_RADIUS,
  METEOR_ROLL,
  METEOR_STAGE,
  rockyMeteor,
  type HazardPose,
} from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { DEPTH, FALL_LEVELS, FLIGHTS, RUNGS, SUMMIT, buildGreatChainOfBeing } from '../src/tracks/greatChainOfBeing';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildGreatChainOfBeing();
const track = new Track(def);
const main = track.main;
/** A section by name: a name the road keeps across several pieces is one section, from where it starts to where its last piece ends. */
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];
const FALL = 'Bring That Sulking Lamb to Slaughter';
/** The ladder's rungs, bottom to top, by the sections that run across the map on each. */
const RUNG_SECTIONS = [['Fall to Pieces', 'Usurp the Precious Stones'], ['Transcend the Natural Flesh'], ["See Through Your World's Facade"], ['Rocky Meteor Sparks Fire'], ['Climb Stairs to Push You Down'], ['Disrupt Natural Order']];

describe('The Great Chain of Being', () => {
  it("is the Gumboot Soup Cup's second, on a road of layered stone", () => {
    const cup = CUPS.find((c) => c.id === 'gumboot-soup')!;
    expect(TRACK_LIST[cup.tracks[1]].id).toBe('great-chain-of-being');
    expect(TRACK_SONGS['great-chain-of-being'].title).toBe('The Great Chain of Being');
    expect(def.theme).toBe('scala');
    expect(def.music).toEqual({ lap: 'great-chain-of-being', finalLap: 'great-chain-of-being-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('strata');
  });

  it('runs through the song in order, from the rock with eyes to the sulking lamb', () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      'The Great Chain of Being',
      'Rock with Eyes to the Sky',
      'Wait for My Time',
      'Disturb the Flow',
      'Dropped from a Pocket',
      'Fall to Pieces',
      'Usurp the Precious Stones',
      'Come to Take the Throne',
      'Transcend the Natural Flesh',
      'Lay Your God to Rest',
      "See Through Your World's Facade",
      'Punish God',
      'Rocky Meteor Sparks Fire',
      'Burn the Church',
      'Climb Stairs to Push You Down',
      'Climb Chains to Cut You Down',
      'Disrupt Natural Order',
      FALL,
    ]);
    const length = track.length;
    console.log(`The Great Chain of Being: ${length.toFixed(0)} m a lap`);
    expect(length).toBeGreaterThan(2450);
    expect(length).toBeLessThan(2750);
    expect(def.laps).toBe(3);
  });

  it('climbs the ladder rung by rung, a rung to each tier of being, each across the map over the one before, a hairpin up to the next', () => {
    const sp = main.spline;
    const along = (name: string) => {
      const q = section(name);
      const zs: number[] = [];
      const ys: number[] = [];
      for (let s = q.from; s <= q.to; s += 2) {
        const p = pointAt(sp, track.mainS(s));
        zs.push(p.z);
        ys.push(main.heightAtBuilder(s));
      }
      return { zs, ys, x: [pointAt(sp, track.mainS(q.from)).x, pointAt(sp, track.mainS(q.to)).x] };
    };
    let below = -Infinity;
    RUNG_SECTIONS.forEach((names, k) => {
      const all = names.map(along);
      const zs = all.flatMap((a) => a.zs);
      const ys = all.flatMap((a) => a.ys);
      // Across the map on its rung (the esses and the throne's swing aside).
      const mean = zs.reduce((a, b) => a + b, 0) / zs.length;
      expect(Math.abs(mean - RUNGS[k]), names[0]).toBeLessThan(k === RUNGS.length - 1 ? 25 : 6);
      // Higher than the rung below, all the way across.
      const lo = Math.min(...ys);
      expect(lo, names[0]).toBeGreaterThan(below);
      below = Math.max(...ys);
    });
    // The bottom rung sunk in the quarry, the throne at the top.
    expect(Math.min(...along('Usurp the Precious Stones').ys)).toBeCloseTo(-DEPTH, 1);
    expect(Math.max(...along('Disrupt Natural Order').ys)).toBeCloseTo(SUMMIT, 1);
    // The hairpins up from one rung to the next: half a turn each, alternately right and left.
    const turn = (name: string) => {
      const q = section(name);
      const i0 = Math.round((track.mainS(q.from) / sp.length) * sp.count);
      const i1 = Math.round((track.mainS(q.to) / sp.length) * sp.count);
      return main.turn[i1] - main.turn[i0];
    };
    const hairpins = ['Come to Take the Throne', 'Lay Your God to Rest', 'Punish God', 'Burn the Church', 'Climb Chains to Cut You Down'];
    hairpins.forEach((n, k) => expect(Math.abs(turn(n) - (k % 2 === 0 ? -1 : 1) * Math.PI), n).toBeLessThan(0.12));
    for (let k = 1; k < RUNGS.length; k++) expect(RUNGS[k] - RUNGS[k - 1]).toBeGreaterThan(40);
  });

  it('falls straight back down through the middle of the ladder on a deck, a rung at a time, over every rung', () => {
    const over = crossings(track);
    expect(over.map((c) => c.upper).every((n) => n === FALL)).toBe(true);
    const under = over.map((c) => RUNG_SECTIONS.findIndex((names) => names.includes(c.lower))).sort();
    expect(under).toEqual([0, 1, 2, 3, 4]);
    for (const c of over) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(7);
      expect(sectionAt(c.upperS).bridge, c.upper).toBe(true);
    }
    // Over the bottom rung, the quarry's sunk.
    expect(over.find((c) => RUNG_SECTIONS[0].includes(c.lower))!.lowerY).toBeLessThan(-6);
    // Never climbing on the way down, and held level over each rung before falling away to the next.
    const fall = section(FALL);
    for (let s = fall.from; s < fall.to - 1; s += 1) expect(main.heightAtBuilder(s + 1)).toBeLessThanOrEqual(main.heightAtBuilder(s) + 1e-6);
    for (const y of FALL_LEVELS) {
      let held = 0;
      for (let s = fall.from; s < fall.to; s += 1) if (Math.abs(main.heightAtBuilder(s) - y) < 0.6) held++;
      expect(held, `held at ${y} m`).toBeGreaterThan(25);
    }
    expect(main.heightAtBuilder(fall.to)).toBeCloseTo(0, 1);
  });

  it('sinks the bottom rung into the quarry, walled, and nothing else', () => {
    for (const name of ['Fall to Pieces', 'Usurp the Precious Stones']) {
      const q = section(name);
      let sunk = 0;
      for (let s = q.from; s < q.to; s += 2) if (main.heightAtBuilder(s) < -DEPTH + 0.5) sunk += 2;
      expect(sunk / (q.to - q.from), name).toBeGreaterThan(0.6);
    }
    const sp = main.spline;
    for (let k = 0; k < sp.count; k++) {
      if (!main.cut[k]) continue;
      expect(['Dropped from a Pocket', 'Fall to Pieces', 'Usurp the Precious Stones', 'Come to Take the Throne']).toContain(sectionAt(main.toBuilder(sp.dist[k])).name);
      expect(main.wallHeight[k]).toBeGreaterThan(-main.heightAt(sp.dist[k]));
    }
  });

  it('disturbs the flow: a leap over the stream that a 100cc kart at full speed clears', () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const flow = section('Disturb the Flow');
    expect(a > flow.from && z < flow.to).toBe(true);
    const p0 = pointAt(track.spline, track.mainS((a + z) / 2));
    expect(def.pits.find((p) => inPit(p, p0.x, p0.z))?.liquid).toBe('water');
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });

  it('climbs the stairs in flights, a level tread and a riser each, on a viaduct', () => {
    const q = section('Climb Stairs to Push You Down');
    expect(q.parts.every((p) => p.bridge)).toBe(true);
    let risers = 0;
    let rising = false;
    for (let s = q.from; s < q.to - 1; s += 0.5) {
      const grade = main.heightAtBuilder(s + 0.5) - main.heightAtBuilder(s);
      expect(grade).toBeGreaterThanOrEqual(-1e-6);
      const up = grade > 0.01;
      if (up && !rising) risers++;
      rising = up;
    }
    expect(risers).toBe(FLIGHTS);
  });

  it('starts at a link of the great chain, and has its landmarks where the song puts them', () => {
    expect(def.landmarks.filter((l) => l.s < 20 && l.ribbon === -1).map((l) => l.kind)).toEqual(['chainGate']);
    const by = (kind: string) => def.landmarks.find((l) => l.kind === kind)!;
    expect(sectionAt(by('rockWithEyes').s).name).toBe('Rock with Eyes to the Sky');
    expect(sectionAt(by('burningChurch').s).name).toBe('Burn the Church');
    expect(sectionAt(by('greatChain').s).name).toBe('Climb Chains to Cut You Down');
    expect(sectionAt(by('emptyThrone').s).name).toBe('Disrupt Natural Order');
    // The rock and the church stand off the road, outside their hairpins.
    for (const kind of ['rockWithEyes', 'burningChurch']) {
      const l = by(kind);
      const p = pointAt(track.spline, track.mainS(l.s));
      const x = p.x - p.tz * (l.lateral ?? 0);
      const z = p.z + p.tx * (l.lateral ?? 0);
      expect(nearestOnSpline(track.spline, x, z).distance, kind).toBeGreaterThan(30);
    }
    // The chain hangs in the eye of the hairpin climbing round it, clear of the road.
    const c = by('greatChain');
    const p = pointAt(track.spline, track.mainS(c.s));
    const hit = nearestOnSpline(track.spline, p.x - p.tz * (c.lateral ?? 0), p.z + p.tx * (c.lateral ?? 0));
    expect(hit.distance - main.halfWidthAt(hit)).toBeGreaterThan(6);
    expect(def.landmarks.some((l) => l.kind === 'brokenLink' && l.ribbon === 0)).toBe(true);
  });
});

describe('Unlinked: straight across beneath the empty throne, a leap through a broken link', () => {
  const k = def.branches.findIndex((b) => b.name === 'Unlinked');
  const bdef = def.branches[k];
  const branch = track.branches[k];
  const last: LapContext = { lap: 3, lastLap: true };

  it('leaves the top rung where it swings up round the throne, and meets it again at the same pose', () => {
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
    const order = section('Disrupt Natural Order');
    expect(bdef.mainFrom > order.from && bdef.mainTo <= order.to).toBe(true);
  });

  it('leaps a gap through the broken link, high over the ground, clear of the main road', () => {
    expect(bdef.gaps.length).toBe(1);
    const [a, z] = bdef.gaps[0];
    const link = def.landmarks.find((l) => l.kind === 'brokenLink')!;
    expect(link.s).toBeGreaterThan(a);
    expect(link.s).toBeLessThan(z);
    const sp = branch.spline;
    for (let i = 0; i < sp.count; i++) {
      expect(branch.heightAt(sp.dist[i])).toBeGreaterThan(20);
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 30 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 30 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(2);
    }
  });

  it('puts a row of double item boxes on it', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('is there on the final lap only: before that, drive on and you fall', () => {
    expect(bdef.openOn).toEqual(['final']);
    const p = kartParams(first.stats, '150cc');
    expect(drive(branch, bdef.mainTo, p, undefined, last).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 2, lastLap: false }).fell).toBe(true);
  });

  it('saves 0.4 to 2.5 s at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p, undefined, last);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, last);
    console.log(`The Great Chain of Being: Unlinked ${via.time.toFixed(2)} s, round the throne ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.4);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('The Great Chain of Being elevation and driving', () => {
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);
  const ramps = (b: number) => lips.some((l) => b > l - 9 && b < l + 2) || def.main.gaps.some(([a, z]) => b > a - 20 && b < z + 2);

  it('has two kickers on the start straight that launch a kart at 100cc and land it on the road', () => {
    expect(lips.length).toBe(2);
    const start = def.main.sections[0];
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

  it('keeps its quarry clear of pits, so the ground opens cleanly round it', () => {
    expect(main.cut.some((x) => x > 0)).toBe(true);
    const sp = main.spline;
    for (let i = 0; i < sp.count; i++) {
      if (!main.cut[i]) continue;
      const near = def.pits.some((p) => inPit({ ...p, halfLength: p.halfLength + 6, halfWidth: p.halfWidth + 6 }, sp.px[i], sp.pz[i]));
      expect(near, `cut at ${main.toBuilder(sp.dist[i]).toFixed(0)}`).toBe(false);
    }
  });

  it('never runs downhill so steeply that a kart at full speed skips off it, nor climbs any steeper', () => {
    for (let s = 0; s + 1 < heights.length; s++) {
      const b = main.toBuilder(s);
      if (ramps(b)) continue;
      expect(Math.abs(heights[s] - heights[s + 1]), `at ${b.toFixed(0)}`).toBeLessThan(0.45);
    }
  });

  it('throws a fast kart off the top and off the steps down the fall, and laps it at 150cc with no falls', () => {
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
    console.log(`The Great Chain of Being: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const fall = section(FALL);
    expect(crests.filter((b) => b > fall.from - 5 && b < fall.to).length).toBeGreaterThanOrEqual(2);
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

describe('rocky meteors: rocks with eyes falling onto the top of a climb and rolling back down it at you', () => {
  const h = new HazardSystem(track);
  const defs = def.hazards.filter((q) => q.kind === 'rockyMeteors');
  const meteors = () => h.poses.filter((q) => q.kind === 'rockyMeteors');

  it("fall on men's rung and down the angels' stairs, onto the top of each climb, and roll all the way down before they fall again", () => {
    expect(defs.length).toBe(2);
    const where = defs.map((q) => ('from' in q ? [sectionAt(q.from).name, sectionAt(q.to).name] : []));
    expect(where).toEqual([
      ['Rocky Meteor Sparks Fire', 'Rocky Meteor Sparks Fire'],
      ['Climb Stairs to Push You Down', 'Climb Stairs to Push You Down'],
    ]);
    for (const q of defs) {
      if (!('from' in q)) continue;
      // The top of the climb is where they land: they roll downhill.
      expect(main.heightAtBuilder(q.to)).toBeGreaterThan(main.heightAtBuilder(q.from) + 1);
      expect(q.period).toBeGreaterThan(METEOR_MARK + (q.to - q.from) / METEOR_ROLL);
    }
  });

  it('show their mark on the road where they will land before they land, and are harmless till then', () => {
    const p = when(h, (q) => q.lane === METEOR_STAGE.mark && q.phase > 0.5);
    expect(p.active).toBe(false);
    expect(p.y - p.ground).toBeGreaterThan(METEOR_RADIUS);
    const kart = kartAt(p);
    expect(h.collide([kart], PHYSICS_DT)).toEqual([]);
    expect(kart.spinTime).toBe(0);
    // A CPU sees it coming, as it's seen falling.
    const late = when(h, (q) => q.lane === METEOR_STAGE.mark && q.phase > 0.9);
    const out: { x: number; z: number; r: number }[] = [];
    h.obstacles(out as never);
    expect(out.some((o) => Math.hypot(o.x - late.x, o.z - late.z) < 0.5 && o.r >= METEOR_BLAST - 0.01)).toBe(true);
  });

  it('blast you as they land, if you are under one', () => {
    const p = when(h, (q) => q.lane === METEOR_STAGE.blast);
    expect(p.active).toBe(true);
    const kart = kartAt(p);
    kart.x += 2;
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'rockyMeteors' });
    expect(kart.spinTime).toBeGreaterThan(0);
  });

  it('roll back down the road at a steady speed in the lane they landed in, each fall picking a lane', () => {
    const q = defs[0];
    if (!('from' in q)) throw new Error('no stretch');
    const len = q.to - q.from;
    // Rolling: down from the top at a steady pace.
    const t0 = 20;
    let a = rockyMeteor(t0, q.period, 0, q.count, len);
    let t = t0;
    while (a.stage !== METEOR_STAGE.roll) a = rockyMeteor((t += 0.05), q.period, 0, q.count, len);
    const b = rockyMeteor(t + 0.5, q.period, 0, q.count, len);
    expect(b.along - a.along).toBeCloseTo(METEOR_ROLL * 0.5, 5);
    expect(b.lane).toBe(a.lane);
    // Over many falls, every lane.
    const lanes = new Set<number>();
    for (let c = 0; c < 30; c++) lanes.add(rockyMeteor(c * q.period + 0.1, q.period, 0, q.count, len).lane);
    expect(lanes.size).toBe(METEOR_LANES.length);
    // And the pose rolls down the road: lower each moment, its velocity back toward the start of the stretch.
    for (let tt = 0; tt < 30; tt += 0.25) {
      h.update(tt);
      for (const p of meteors()) {
        if (p.lane !== METEOR_STAGE.roll) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        if (Math.hypot(p.vx, p.vz) > 1) expect(p.vx * fx + p.vz * fz).toBeLessThan(-METEOR_ROLL * 0.8);
      }
    }
  });

  it('push you down if you drive into one rolling at you', () => {
    const p = when(h, (q) => q.lane === METEOR_STAGE.roll);
    const kart = kartAt(p);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'rockyMeteors' });
    expect(kart.spinTime).toBeGreaterThan(0);
    // Up on the fall's deck over it: nothing.
    const over = kartAt(p);
    over.y += 8;
    expect(h.collide([over], PHYSICS_DT)).toEqual([]);
  });

  it('are cleared if you hop one as it comes, and you come down on a boost; rammed on a boost, they burst and the boost runs on', () => {
    const p = when(h, (q) => q.lane === METEOR_STAGE.roll);
    const hop = kartAt(p);
    hop.speed = 30;
    hop.hopAge = 0.05;
    expect(h.collide([hop], PHYSICS_DT)[0]).toMatchObject({ by: 'rockyMeteors', good: true });
    expect(hop.boostTime).toBeCloseTo(METEOR_CLEAR);
    expect(hop.spinTime).toBe(0);
    const ram = kartAt(p);
    ram.speed = 40;
    ram.boostTime = 0.5;
    expect(h.collide([ram], PHYSICS_DT)[0]).toMatchObject({ by: 'rockyMeteors', good: true });
    expect(ram.boostTime).toBeGreaterThan(0.5);
    expect(ram.spinTime).toBe(0);
  });

  it('crumble at the foot of the climb, harmless', () => {
    const p = when(h, (q) => q.lane === METEOR_STAGE.crumble);
    expect(p.active).toBe(false);
    expect(h.collide([kartAt(p)], PHYSICS_DT)).toEqual([]);
  });

  it('are where they are by race time alone', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(31.7);
    for (let t = 0; t <= 31.7; t += 0.7) b.update(t);
    b.update(31.7);
    const pa = a.poses.filter((q) => q.kind === 'rockyMeteors');
    const pb = b.poses.filter((q) => q.kind === 'rockyMeteors');
    pa.forEach((p, i) => {
      expect(p.x).toBeCloseTo(pb[i].x, 6);
      expect(p.z).toBeCloseTo(pb[i].z, 6);
      expect(p.lane).toBe(pb[i].lane);
    });
  });
});

/** Steps race time until a meteor is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.02) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'rockyMeteors' && ok(q));
    if (p) return p;
  }
  throw new Error('no meteor in that stage');
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

/** Below the ground and not on a road there (a road sunk in a cut holds you up), or well below the road it was on: fallen. */
function fallen(kart: KartState): boolean {
  if (kart.y > -2) {
    const loc = track.locateKart(kart);
    return !loc.onRoad && kart.y < 1 && kart.groundY > 5;
  }
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
  let top = kart.y;
  for (let t = 0; t < 30; t += PHYSICS_DT) {
    stepKart(kart, steerAlong(ribbon, kart, progress), p, track, PHYSICS_DT);
    const hit = nearestOnSpline(ribbon.spline, kart.x, kart.z, hint, 20);
    hint = hit.index;
    progress = hit.s;
    top = Math.max(top, kart.groundY);
    // Off the top rung's deck with no road under it: falling.
    if (fallen(kart) || kart.y < top - 6) return { time: t, fell: true };
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
