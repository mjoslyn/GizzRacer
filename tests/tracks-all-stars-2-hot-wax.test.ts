import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { HazardSystem, WAX_DEPTH, WAX_LAG, WAX_SLICK, WAX_SLOW, WAX_STAGES, WAX_STICK, isSheet, waxHeat, waxPhase, waxReach, type HazardPose } from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { CHANNEL, FLAME_R, FLOOR, HILL, LEAVES, SILL, TONGUES, WAX_PERIOD, buildHotWax } from '../src/tracks/hotWax';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildHotWax();
const track = new Track(def);
const main = track.main;
/** A section by name: a name the road keeps across a deck is one section, from where it starts to where its deck ends. */
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];
const headingAt = (s: number) => {
  const p = pointAt(track.spline, track.mainS(s));
  return Math.atan2(p.tx, p.tz);
};

describe('Hot Wax', () => {
  it("is the All Stars Cup #2's first, on a road of wax", () => {
    const cup = CUPS.find((c) => c.id === 'all-stars-2')!;
    expect(TRACK_LIST[cup.tracks[0]].id).toBe('hot-wax');
    expect(TRACK_SONGS['hot-wax']).toMatchObject({ title: 'Hot Wax', album: 'Oddments', year: 2014 });
    expect(def.theme).toBe('hotwax');
    expect(def.music).toEqual({ lap: 'hot-wax', finalLap: 'hot-wax-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('wax');
  });

  it('runs through the song in order, from under the door to up my leg', () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      "Comin' Under the Door",
      "Comin' Under the Floor",
      "Creepin' Under the Hill",
      "Creepin' Under the Sill",
      'Hot Wax',
      "C'mon Get Around",
      'Come On a Safari With Me',
      "Slippin' Under the Seat",
      "Drippin' Under the Feet",
      "Leakin' Under the Sink",
      "Leakin' Under the Drink",
      "Comin' Under the Lord",
      "Comin' Into the Brain",
      "Comin' Into the Maze",
      "Risin' From Beneath",
      "Risin' From the Leaves",
      "Runnin' Under My Bed",
      "Runnin' Up My Leg",
    ]);
    const length = track.length;
    console.log(`Hot Wax: ${length.toFixed(0)} m a lap`);
    // Three laps a race, the length of the cup tracks before it.
    expect(length).toBeGreaterThan(2400);
    expect(length).toBeLessThan(2750);
    expect(def.laps).toBe(3);
  });

  it('is a candle laid across the floor: the pool round its foot, its two sides straight and parallel, and the flame round on top', () => {
    // The candle's sides: one heading up it, one back down, the same line apart and the other way.
    const up = [section("Creepin' Under the Hill"), section("Creepin' Under the Sill")];
    const down = [section("Leakin' Under the Sink")];
    const hUp = headingAt(up[1].from + 1);
    const hDown = headingAt(down[0].from + 1);
    expect(Math.abs(wrapAngle(hDown - hUp - Math.PI))).toBeLessThan(0.02);
    for (let s = up[1].from + 1; s < up[1].from + 90; s += 5) expect(Math.abs(wrapAngle(headingAt(s) - hUp))).toBeLessThan(0.01);
    // The flame: three quarters of a circle and more on its radius, round the lava lamp.
    const flame = ['Hot Wax', "C'mon Get Around", 'Come On a Safari With Me'].map(section);
    const turned = wrapAngle(headingAt(flame[2].to - 0.5) - headingAt(flame[0].from + 0.5));
    const span = flame[2].to - flame[0].from;
    expect(span / (2 * Math.PI + turned)).toBeGreaterThan(FLAME_R);
    const lamp = landmarkAt('lavaLamp');
    for (let s = flame[0].from; s < flame[2].to; s += 5) {
      const q = pointAt(track.spline, track.mainS(s));
      expect(Math.hypot(q.x - lamp.x, q.z - lamp.z)).toBeLessThan(FLAME_R * 1.3);
    }
    // The candle standing in the middle of its own outline.
    const candle = landmarkAt('giantCandle');
    const hit = nearestOnSpline(track.spline, candle.x, candle.z);
    expect(hit.distance - main.halfWidthAt(hit)).toBeGreaterThan(40);
  });

  it('crosses itself in tiers: the lord over the floor at the candle\'s foot, and the sill over the seat across the wick', () => {
    const over = crossings(track);
    const pairs = new Set(over.map((c) => `${c.upper} over ${c.lower}`));
    expect([...pairs].sort()).toEqual(["Comin' Under the Lord over Comin' Under the Floor", "Creepin' Under the Sill over Slippin' Under the Seat"].sort());
    for (const c of over) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(6);
      expect(sectionAt(c.upperS).bridge, c.upper).toBe(true);
    }
    const foot = over.find((q) => q.lower === "Comin' Under the Floor")!;
    expect(foot.upperY).toBeCloseTo(0, 0);
    expect(foot.lowerY).toBeLessThan(-FLOOR + 0.5);
    const wick = over.find((q) => q.upper === "Creepin' Under the Sill")!;
    expect(wick.upperY).toBeCloseTo(SILL, 0);
    expect(wick.lowerY).toBeCloseTo(0, 0);
  });

  it('sinks Comin\' Under the Floor between the joists, walled, and nothing else is sunk', () => {
    const floor = section("Comin' Under the Floor");
    let sunk = 0;
    for (let s = floor.from; s < floor.to; s += 2) if (main.heightAtBuilder(s) < -FLOOR + 0.5) sunk += 2;
    expect(sunk).toBeGreaterThan(150);
    const sp = main.spline;
    for (let k = 0; k < sp.count; k++) {
      if (!main.cut[k]) continue;
      expect(["Comin' Under the Floor", "Creepin' Under the Hill"]).toContain(sectionAt(main.toBuilder(sp.dist[k])).name);
      expect(main.wallHeight[k]).toBeGreaterThan(-main.heightAt(sp.dist[k]));
    }
  });

  it('leakin\' under the drink: a leap over the spilt drink that a 100cc kart at full speed clears', () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const drink = section("Leakin' Under the Drink");
    expect(a > drink.from && z < drink.to).toBe(true);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 30), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });

  it('climbs over the rucked rug, up onto the sill, and flies off its end into the flame', () => {
    const hill = section("Creepin' Under the Hill");
    let top = 0;
    for (let s = hill.from; s < hill.to; s += 1) top = Math.max(top, main.heightAtBuilder(s));
    expect(top).toBeCloseTo(HILL, 0);
    const sill = section("Creepin' Under the Sill");
    expect(main.heightAtBuilder(sill.to - 1)).toBeCloseTo(SILL, 1);
    expect(main.heightAtBuilder(section("C'mon Get Around").from)).toBeCloseTo(0, 1);
    let leaves = 0;
    for (let s = section("Risin' From the Leaves").from; s < section("Runnin' Under My Bed").from + 1; s += 1) leaves = Math.max(leaves, main.heightAtBuilder(s));
    expect(leaves).toBeCloseTo(LEAVES, 1);
  });

  it('keeps its landmarks off the road: the candle, the lava lamp, the spring reverb, the shrine and the leg', () => {
    for (const kind of ['giantCandle', 'lavaLamp', 'springKing', 'lordShrine', 'giantLeg'] as const) {
      const p = landmarkAt(kind);
      for (const r of [main, ...track.branches]) {
        const hit = nearestOnSpline(r.spline, p.x, p.z);
        expect(hit.distance - r.halfWidthAt(hit), kind).toBeGreaterThan(8);
      }
    }
  });

  it('starts under the door', () => {
    expect(def.landmarks.filter((l) => l.s < 20 && l.ribbon === -1).map((l) => l.kind)).toEqual(['waxDoor']);
  });

  it('stays inside its bounds', () => {
    const sp = track.spline;
    for (let i = 0; i < sp.count; i++) expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i])) + main.halfWidth[i]).toBeLessThan(def.bounds - 10);
  });
});

describe("Everybody's Learning How, straight through the maze over a channel of wax", () => {
  const k = def.branches.findIndex((b) => b.name === "Everybody's Learning How");
  const bdef = def.branches[k];
  const branch = track.branches[k];
  const open: LapContext = { lap: 2, lastLap: false };

  it('leaves the road where the maze starts and meets it again where it ends, at the same pose', () => {
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
    for (const s of [bdef.mainFrom + 1, bdef.mainTo - 1]) expect(sectionAt(s).wallHeight ?? 0).toBe(0);
    const maze = section("Comin' Into the Maze");
    expect(bdef.mainFrom).toBeCloseTo(maze.from, 3);
    expect(bdef.mainTo).toBeCloseTo(maze.to, 3);
    expect(def.landmarks.some((l) => l.kind === 'learningHow' && l.ribbon === k)).toBe(true);
  });

  it('crosses the channel of molten wax, clear of the main road and in bounds', () => {
    const sp = branch.spline;
    const mid = Math.floor(sp.count / 2);
    const channel = def.pits.find((p) => inPit(p, sp.px[mid], sp.pz[mid]))!;
    expect(channel).toBeDefined();
    expect(channel.liquid).toBe('lava');
    expect(2 * channel.halfLength).toBeCloseTo(CHANNEL, 0);
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 40 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 40 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(4);
    }
    const msp = main.spline;
    const fx = Math.sin(channel.heading);
    const fz = Math.cos(channel.heading);
    for (let i = 0; i < msp.count; i++) {
      const dx = msp.px[i] - channel.x;
      const dz = msp.pz[i] - channel.z;
      const along = Math.max(0, Math.abs(dx * fx + dz * fz) - channel.halfLength);
      const across = Math.max(0, Math.abs(-dx * fz + dz * fx) - channel.halfWidth);
      expect(Math.hypot(along, across) - main.halfWidth[i]).toBeGreaterThan(2);
    }
  });

  it('puts a double item box over the channel', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('is there from lap 2, once everybody\'s learned how: on the first the wax is still molten, and you fall in', () => {
    expect(bdef.openOn).toEqual([2, 'final']);
    const p = kartParams(first.stats, '150cc');
    expect(drive(branch, bdef.mainTo, p, undefined, open).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 1, lastLap: false }).fell).toBe(true);
  });

  it('saves 0.5 to 2.5 s at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p, undefined, open);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, open);
    console.log(`Hot Wax: Everybody's Learning How ${via.time.toFixed(2)} s, the maze ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.5);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('Hot Wax elevation and driving', () => {
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);
  const ramps = (b: number) => lips.some((l) => b > l - 9 && b < l + 2) || def.main.gaps.some(([a, z]) => b > a - 20 && b < z + 2);

  it('has two kickers at the start that launch a kart at 100cc and land it on the road', () => {
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

  it('keeps its cut clear of the pits, so the ground opens cleanly round it', () => {
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

  it('gives a fast kart airtime off the sill, and laps it at 150cc with no falls', () => {
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
    console.log(`Hot Wax: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const sill = section("Creepin' Under the Sill");
    expect(crests.some((b) => b > sill.to - 10 && b < section('Hot Wax').to)).toBe(true);
  }, 30000);

  it('a full field of 150cc CPUs laps it, the leader in about a minute and five seconds a lap', () => {
    const race = new Race(track);
    for (const r of RACERS.slice(0, 8)) race.addKart(r, '150cc', CPU_SKILL['150cc']);
    let respawns = 0;
    let t = 0;
    let leader = Infinity;
    for (; t < 400 && race.karts.some((k) => k.laps.lap < def.laps); t += PHYSICS_DT) {
      race.step(PHYSICS_DT, []);
      respawns += race.karts.filter((k) => k.respawned).length;
      if (leader === Infinity && race.karts.some((k) => k.laps.lap >= def.laps)) leader = t;
    }
    console.log(`Hot Wax: the leader home in ${leader.toFixed(1)} s, the last in ${t.toFixed(1)} s, ${respawns} respawns`);
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(def.laps);
    expect(respawns).toBeLessThanOrEqual(2 * def.laps);
    expect(leader / def.laps).toBeGreaterThan(60);
    expect(leader / def.laps).toBeLessThan(70);
  }, 120000);
});

describe('hot wax: tongues creeping out across the sink\'s run, molten, then set hard', () => {
  const h = new HazardSystem(track);
  const hdef = def.hazards.find((q) => q.kind === 'waxFlows')!;
  const tongues = () => h.poses.filter((q) => q.kind === 'waxFlows');

  it('come out three times down the sink\'s run, past the kitchen cupboards', () => {
    expect(def.hazards.map((q) => q.kind)).toEqual(['waxFlows']);
    if (!('at' in hdef)) throw new Error('no stations');
    expect(hdef.at.length).toBe(TONGUES.length);
    expect('period' in hdef && hdef.period).toBe(WAX_PERIOD);
    for (const s of hdef.at) expect(sectionAt(s).name).toBe("Leakin' Under the Sink");
    expect(isSheet('waxFlows')).toBe(false);
  });

  it('well up at an edge, creep right across, cool and set, and crack away; the next comes from the other edge', () => {
    const W = WAX_STAGES;
    expect(waxReach(W.creep / 2)).toBe(0);
    expect(waxReach((W.creep + W.across) / 2)).toBeGreaterThan(0.3);
    expect(waxReach((W.creep + W.across) / 2)).toBeLessThan(1);
    expect(waxReach((W.across + W.cool) / 2)).toBe(1);
    expect(waxHeat((W.across + W.cool) / 2)).toBe(1);
    expect(waxHeat((W.set + W.crack) / 2)).toBe(0);
    const sides = [0, 1, 2, 3].map((c) => waxPhase(c * WAX_PERIOD + 0.01, WAX_PERIOD, 0).side);
    expect(new Set(sides).size).toBe(2);
    expect(sides[0]).toBe(-sides[1]);
  });

  it('set one after another down the run at about a fast kart\'s pace', () => {
    for (const t of [0, 3.3, 11.7]) {
      for (let i = 0; i + 1 < TONGUES.length; i++) {
        const a = waxPhase(t, WAX_PERIOD, i).u;
        const b = waxPhase(t, WAX_PERIOD, i + 1).u;
        expect((((a - b) % 1) + 1) % 1).toBeCloseTo(WAX_LAG, 6);
      }
    }
    if (!('at' in hdef)) throw new Error('no stations');
    const apart = track.mainS(hdef.at[1]) - track.mainS(hdef.at[0]);
    const pace = apart / (WAX_LAG * WAX_PERIOD);
    const fast = kartParams(first.stats, '150cc').topSpeed;
    expect(pace).toBeGreaterThan(0.75 * fast);
    expect(pace).toBeLessThan(1.25 * fast);
  });

  it('is harmless welling at its edge, cooling and crumbling', () => {
    const W = WAX_STAGES;
    for (const ok of [(p: HazardPose) => p.phase < W.creep - 0.02, (p: HazardPose) => p.phase > W.cool + 0.01 && p.phase < W.set - 0.01, (p: HazardPose) => p.phase > W.crack + 0.01]) {
      const p = when(h, ok);
      expect(p.active).toBe(false);
      for (const lat of [-10, -4, 0, 4, 10]) expect(h.collide([kartAcross(p, lat)], PHYSICS_DT)).toEqual([]);
    }
  });

  it('caught in it molten, it grabs you: slowed hard, the wheel wobbling', () => {
    const p = when(h, (q) => q.active && q.gap >= 1);
    const kart = kartAcross(p, 0);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'waxFlows' });
    expect(kart.speed).toBeCloseTo(30 * WAX_SLOW, 3);
    expect(kart.wobbleTime).toBeCloseTo(WAX_STICK, 3);
    expect(kart.spinTime).toBe(0);
    // Up over it, or well along the road from it: nothing.
    const over = kartAcross(p, 0);
    over.y += 8;
    expect(fresh().collide([over], PHYSICS_DT)).toEqual([]);
    const past = kartAcross(p, 0, WAX_DEPTH + 2);
    expect(fresh().collide([past], PHYSICS_DT)).toEqual([]);
  });

  it('while it creeps across, the far side of the road is clear', () => {
    const p = when(h, (q) => q.active && q.gap > 0.3 && q.gap < 0.5);
    // It comes from the right when side is 1: the left edge is clear.
    const clear = kartAcross(p, -p.side * (p.radius - 2));
    clear.speed = 30;
    expect(h.collide([clear], PHYSICS_DT)).toEqual([]);
    const caught = kartAcross(p, p.side * (p.radius - 2));
    caught.speed = 30;
    expect(fresh().collide([caught], PHYSICS_DT)[0]).toMatchObject({ by: 'waxFlows' });
  });

  it('over it set hard, a slick that slings you on: a boost', () => {
    const p = when(h, (q) => q.lane === 1);
    const kart = kartAcross(p, 3);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'waxFlows', good: true });
    expect(kart.boostTime).toBeCloseTo(WAX_SLICK);
    expect(kart.wobbleTime).toBe(0);
  });

  it('is where it is by race time alone', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    for (let t = 0; t <= 12.3; t += 0.7) b.update(t);
    b.update(12.3);
    const pa = a.poses.filter((q) => q.kind === 'waxFlows');
    const pb = b.poses.filter((q) => q.kind === 'waxFlows');
    expect(pa.length).toBe(TONGUES.length);
    pa.forEach((p, i) => {
      expect(p.x).toBeCloseTo(pb[i].x, 6);
      expect(p.phase).toBeCloseTo(pb[i].phase, 6);
      expect(p.gap).toBeCloseTo(pb[i].gap, 6);
      expect(p.active).toBe(pb[i].active);
    });
    expect(tongues().length).toBe(TONGUES.length);
  });

  it('shows the CPUs the molten part while it creeps, so they keep to the clear side', () => {
    const p = when(h, (q) => q.active && q.gap > 0.3 && q.gap < 0.6);
    const out: { x: number; z: number; r: number; vx: number; vz: number }[] = [];
    h.obstacles(out);
    expect(out.length).toBeGreaterThan(0);
    // The obstacle is on the side the wax comes from.
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const o = out.find((q) => Math.hypot(q.x - p.ax, q.z - p.az) < p.radius + 2)!;
    const lat = (o.x - p.ax) * -fz + (o.z - p.az) * fx;
    expect(Math.sign(lat)).toBe(p.side);
  });
});

/** Where a landmark that stands off the road is. */
function landmarkAt(kind: string) {
  const lm = def.landmarks.find((l) => l.kind === kind)!;
  const p = pointAt(track.spline, track.mainS(lm.s));
  return { x: p.x - p.tz * (lm.lateral ?? 0), z: p.z + p.tx * (lm.lateral ?? 0) };
}

/** The race time `when` last stopped at, and a fresh hazard system there (no cooldowns from an earlier collide). */
let lastT = 0;
function fresh(): HazardSystem {
  const h = new HazardSystem(track);
  h.update(lastT);
  return h;
}

/** Steps race time until a tongue is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.01) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'waxFlows' && ok(q));
    if (p) {
      lastT = t;
      return p;
    }
  }
  throw new Error('no tongue in that stage');
}

/** A kart sitting on the road at a tongue's station, `lateral` to the right of the road's middle and `along` the road. */
function kartAcross(p: HazardPose, lateral: number, along = 0): KartState {
  const x = p.ax - Math.cos(p.heading) * lateral + Math.sin(p.heading) * along;
  const z = p.az + Math.sin(p.heading) * lateral + Math.cos(p.heading) * along;
  const s = createKartState(x, z, p.heading);
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
    return { dy, upper: sectionAt(upperS).name, lower: sectionAt(lowerS).name, upperS, lowerS, upperY: t.main.heightAt(sp.dist[up]), lowerY: t.main.heightAt(sp.dist[low]) };
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
