import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { GANG_BOOST, GANG_JITTER, GANG_OUT, GANG_RIDE, GANG_SPIN, HazardSystem, gangPhase, gangRiders, isSheet, type HazardPose } from '../src/items/hazards';
import { ItemSystem } from '../src/items/items';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { DEPTH, GANG_PERIOD, POND_HALF, RANGES, buildBillabongValley } from '../src/tracks/billabongValley';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildBillabongValley();
const track = new Track(def);
const main = track.main;
/** A section by name: a name the road keeps across a deck is one section, from where it starts to where it ends. */
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];

describe('Billabong Valley', () => {
  it("is the All Stars Cup #2's fourth and last, on a bush track of red dirt", () => {
    const cup = CUPS.find((c) => c.id === 'all-stars-2')!;
    expect(TRACK_LIST[cup.tracks[3]].id).toBe('billabong-valley');
    expect(cup.tracks.length).toBe(4);
    expect(TRACK_SONGS['billabong-valley'].title).toBe('Billabong Valley');
    expect(def.theme).toBe('bushranger');
    expect(def.music).toEqual({ lap: 'billabong-valley', finalLap: 'billabong-valley-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('redgum');
  });

  it('runs through the song in order, from outlaws on the run to shot in the back by morning', () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      'Outlaws on the Run',
      'Tied Naked to the Trees',
      'Killed So Gruesomely',
      'Burning Tents to the Ground',
      "Cops Won't Wave Them Down",
      'The Most Wanted Men',
      'Bushrangers Reigning In',
      'Bloodthirsty Tendencies',
      'Antiauthority',
      'Mad Dog Morgan',
      'He Never Gave a Warning',
      'Shot in the Back by Morning',
    ]);
    const length = track.length;
    console.log(`Billabong Valley: ${length.toFixed(0)} m a lap`);
    expect(length).toBeGreaterThan(2400);
    expect(length).toBeLessThan(2750);
    expect(def.laps).toBe(3);
  });

  it("crosses itself twice in tiers: the outlaws over the gully, and the trestle over the troopers' road", () => {
    const over = crossings(track);
    const pairs = new Set(over.map((c) => `${c.upper} over ${c.lower}`));
    expect([...pairs].sort()).toEqual(['Outlaws on the Run over Killed So Gruesomely', "Shot in the Back by Morning over Cops Won't Wave Them Down"].sort());
    for (const c of over) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(6);
      expect(sectionAt(c.upperS).bridge, c.upper).toBe(true);
    }
    const gully = over.find((q) => q.lower === 'Killed So Gruesomely')!;
    expect(gully.upperY).toBeCloseTo(0, 0);
    expect(gully.lowerY).toBeLessThan(-DEPTH + 0.5);
    const trestle = over.find((q) => q.upper === 'Shot in the Back by Morning')!;
    expect(trestle.upperY).toBeCloseTo(RANGES, 0);
    expect(trestle.lowerY).toBeCloseTo(0, 0);
    expect(def.landmarks.some((l) => l.kind === 'trestle')).toBe(true);
  });

  it('climbs into the ranges, holds the ridge to the trestle, and comes down off it toward the dawn', () => {
    const reigning = section('Bushrangers Reigning In');
    expect(main.heightAtBuilder(reigning.from)).toBeCloseTo(0, 1);
    for (let s = reigning.from; s < reigning.to - 1; s += 1) expect(main.heightAtBuilder(s + 1)).toBeGreaterThanOrEqual(main.heightAtBuilder(s) - 1e-6);
    for (const name of ['Antiauthority', 'Mad Dog Morgan', 'He Never Gave a Warning']) {
      const q = section(name);
      for (let s = q.from; s <= q.to; s += 2) expect(main.heightAtBuilder(s), name).toBeCloseTo(RANGES, 1);
    }
    expect(main.heightAtBuilder(section('Shot in the Back by Morning').to - 5)).toBeCloseTo(0, 1);
  });

  it("cops won't wave them down: a leap where the bridge was burned, that a 100cc kart at full speed clears", () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const cops = section("Cops Won't Wave Them Down");
    expect(a > cops.from && z < cops.to).toBe(true);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
    expect(def.landmarks.some((l) => l.kind === 'troopersCamp')).toBe(true);
  });

  it('sinks Killed So Gruesomely into the gully under the outlaws, walled, and nothing else is sunk', () => {
    const cut = section('Killed So Gruesomely');
    let sunk = 0;
    for (let s = cut.from; s < cut.to; s += 2) if (main.heightAtBuilder(s) < -DEPTH + 0.5) sunk += 2;
    expect(sunk / (cut.to - cut.from)).toBeGreaterThan(0.25);
    const sp = main.spline;
    for (let k = 0; k < sp.count; k++) {
      if (!main.cut[k]) continue;
      expect(['Killed So Gruesomely', 'Burning Tents to the Ground']).toContain(sectionAt(main.toBuilder(sp.dist[k])).name);
      expect(main.wallHeight[k]).toBeGreaterThan(-main.heightAt(sp.dist[k]));
    }
  });

  it('starts under the hideout gate, and has the billabong, the burning camp, the wanted poster, the homestead and the dawn', () => {
    expect(def.landmarks.filter((l) => l.s < 20 && l.ribbon === -1).map((l) => l.kind)).toEqual(['hideoutGate']);
    for (const k of ['blackBillabong', 'ropeGums', 'burningCamp', 'wantedPoster', 'stationHomestead', 'redDawn'] as const) expect(def.landmarks.some((l) => l.kind === k), k).toBe(true);
    // The burning camp, the poster and the homestead stand clear of the road.
    for (const kind of ['burningCamp', 'wantedPoster', 'stationHomestead']) {
      const lm = def.landmarks.find((l) => l.kind === kind)!;
      const p = pointAt(track.spline, track.mainS(lm.s));
      const x = p.x - p.tz * lm.lateral!;
      const z = p.z + p.tx * lm.lateral!;
      expect(nearestOnSpline(track.spline, x, z).distance, kind).toBeGreaterThan(30);
    }
  });
});

describe('Faster Than a Stolen Gun, straight across the billabong on a fallen red gum', () => {
  const k = def.branches.findIndex((b) => b.name === 'Faster Than a Stolen Gun');
  const bdef = def.branches[k];
  const branch = track.branches[k];
  const open: LapContext = { lap: 2, lastLap: false };

  it('leaves where the road bows out round the billabong and meets it again where it comes back, at the same pose', () => {
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
    for (const s of [bdef.mainFrom, bdef.mainTo]) expect(def.main.sections.filter((q) => s >= q.from && s <= q.to).every((q) => (q.wallHeight ?? 0) === 0)).toBe(true);
    expect(sectionAt(bdef.mainFrom + 1).name).toBe('Outlaws on the Run');
    expect(sectionAt(bdef.mainTo - 1).name).toBe('Outlaws on the Run');
    expect(def.landmarks.some((l) => l.kind === 'stolenGun' && l.ribbon === k)).toBe(true);
  });

  it('lies over the black water, clear of the main road and in bounds', () => {
    const sp = branch.spline;
    const pond = def.pits.find((p) => p.liquid === 'water' && inPit(p, sp.px[Math.floor(sp.count * 0.5)], sp.pz[Math.floor(sp.count * 0.5)]))!;
    expect(pond).toBeDefined();
    expect(pond.halfWidth).toBe(Math.max(POND_HALF, bdef.sections[0].halfWidth));
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 40 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 40 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(4);
    }
    const msp = main.spline;
    const fx = Math.sin(pond.heading);
    const fz = Math.cos(pond.heading);
    for (let i = 0; i < msp.count; i++) {
      const dx = msp.px[i] - pond.x;
      const dz = msp.pz[i] - pond.z;
      const along = Math.max(0, Math.abs(dx * fx + dz * fz) - pond.halfLength);
      const across = Math.max(0, Math.abs(-dx * fz + dz * fx) - pond.halfWidth);
      expect(Math.hypot(along, across) - main.halfWidth[i]).toBeGreaterThan(2);
    }
  });

  it('puts a double item box over the water', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('is there from lap 2: on the first, drive on and you fall into the billabong', () => {
    expect(bdef.openOn).toEqual([2, 'final']);
    const p = kartParams(first.stats, '150cc');
    expect(drive(branch, bdef.mainTo, p, undefined, open).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 3, lastLap: true }).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 1, lastLap: false }).fell).toBe(true);
  });

  it('saves 0.8 to 2.5 s at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p, undefined, open);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, open);
    console.log(`Billabong Valley: the log ${via.time.toFixed(2)} s, round the billabong ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.8);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('Billabong Valley elevation and driving', () => {
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

  it('keeps its cut clear of pits, so the ground opens cleanly round it', () => {
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

  it('laps it at 150cc with no falls', () => {
    const race = new Race(track);
    const kart = race.addKart(RACERS[0], '150cc', null);
    race.time = 0;
    let respawns = 0;
    for (let t = 0; t < 200 && kart.laps.lap < 1; t += PHYSICS_DT) {
      race.step(PHYSICS_DT, [steerAlong(main, kart.state, kart.progressS)]);
      if (kart.respawned) respawns++;
    }
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
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
    console.log(`Billabong Valley: the leader home in ${leader.toFixed(1)} s (${(leader / def.laps).toFixed(1)} s a lap), the last in ${t.toFixed(1)} s, ${respawns} respawns`);
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(def.laps);
    expect(respawns).toBeLessThanOrEqual(2 * def.laps);
    expect(leader / def.laps).toBeGreaterThan(60);
    expect(leader / def.laps).toBeLessThan(70);
  }, 120000);
});

describe("bushrangers: Mad Dog Morgan's gang riding across the ridge road, never giving a warning", () => {
  const h = new HazardSystem(track);
  const q = def.hazards.find((d) => d.kind === 'bushrangers')!;

  it('ride across the ridge road on Mad Dog Morgan and He Never Gave a Warning, up in the ranges', () => {
    expect(def.hazards.length).toBe(1);
    if (!('at' in q) || !('period' in q)) throw new Error('no gang');
    expect(q.at.length).toBe(3);
    expect(q.period).toBe(GANG_PERIOD);
    for (const s of q.at) {
      expect(['Mad Dog Morgan', 'He Never Gave a Warning']).toContain(sectionAt(s).name);
      expect(main.heightAtBuilder(s)).toBeCloseTo(RANGES, 1);
    }
    expect(isSheet('bushrangers')).toBe(false);
  });

  it('never come at quite the same moment twice, nor always from the same side, and nothing is on the road before they come', () => {
    const starts = new Set<string>();
    const sides = new Set<number>();
    for (let k = 0; k < 12; k++) {
      // Where in its period ride k starts.
      let t = (k + 0.001) * GANG_PERIOD - 10;
      while (gangPhase(t, GANG_PERIOD, 0).u < 0) t += 0.002;
      const into = ((t + 10) / GANG_PERIOD) % 1;
      expect(into).toBeLessThanOrEqual(GANG_JITTER + 0.01);
      starts.add(into.toFixed(2));
      sides.add(gangPhase(t, GANG_PERIOD, 0).side);
    }
    expect(starts.size).toBeGreaterThan(6);
    expect([...sides].sort()).toEqual([-1, 1]);
    expect(GANG_JITTER + GANG_RIDE).toBeLessThan(1);
    // Before a ride the riders are out in the scrub, off the road, and can't hit anyone.
    const p = when(h, (x) => x.phase < 0);
    expect(p.active).toBe(false);
    for (const r of gangRiders(p.phase, p.side, p.gap)) expect(r.out).toBe(false);
    // As they set off they're out past the road's edge.
    expect(Math.abs(gangRiders(0, 1, 15)[0].lateral)).toBeCloseTo(15 + GANG_OUT, 5);
  });

  it('ridden down by a horse, you are bailed up: robbed and spun', () => {
    const p = when(h, (x) => x.active && Math.abs(gangRiders(x.phase, x.side, x.gap)[0].lateral) < 4);
    const kart = kartAtRider(p, 0);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'bushrangers', robbed: true });
    expect(kart.spinTime).toBeCloseTo(GANG_SPIN);
    // Down under the ridge, nothing.
    const below = kartAtRider(p, 0);
    below.y -= 10;
    expect(h.collide([below], PHYSICS_DT)).toEqual([]);
  });

  it('slipped through the dust just behind the last of them, a boost', () => {
    const p = when(h, (x) => {
      const rs = gangRiders(x.phase, x.side, x.gap);
      const last = rs[rs.length - 1];
      return x.lane === 1 && last.out && Math.abs(last.lateral) < 3;
    });
    const rs = gangRiders(p.phase, p.side, p.gap);
    const last = rs[rs.length - 1];
    const kart = kartAt(p, last.lateral - p.side * 4, last.along);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'bushrangers', good: true });
    expect(kart.boostTime).toBeCloseTo(GANG_BOOST);
    expect(kart.spinTime).toBe(0);
  });

  it('robs the item in your hands, the spare moving up', () => {
    const items = new ItemSystem(track);
    const holder = { state: createKartState(0, 0, 0), params: { mass: 1 }, position: 1, progressS: 0, distance: 0, finished: false, remote: false, signature: null, item: 'fuzzPedal', spare: 'drumRoll', rolling: 0, held: 2, behind: 0 } as Parameters<ItemSystem['rob']>[0];
    expect(items.rob(holder)).toBe(true);
    expect(holder.item).toBe('drumRoll');
    expect(holder.spare).toBe(null);
    expect(items.rob(holder)).toBe(true);
    expect(holder.item).toBe(null);
    expect(items.rob(holder)).toBe(false);
  });

  it('are where they are by race time alone', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    for (let t = 0; t <= 12.3; t += 0.7) b.update(t);
    b.update(12.3);
    const pa = a.poses.filter((p) => p.kind === 'bushrangers');
    const pb = b.poses.filter((p) => p.kind === 'bushrangers');
    expect(pa.length).toBe(3);
    pa.forEach((p, i) => {
      expect(p.x).toBeCloseTo(pb[i].x, 6);
      expect(p.phase).toBeCloseTo(pb[i].phase, 6);
      expect(p.active).toBe(pb[i].active);
    });
  });
});

/** Steps race time until a gang is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 120; t += 0.01) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'bushrangers' && ok(q));
    if (p) return p;
  }
  throw new Error('no gang in that stage');
}

/** A kart sitting on the road right where rider `k` of a gang is. */
function kartAtRider(p: HazardPose, k: number): KartState {
  const r = gangRiders(p.phase, p.side, p.gap)[k];
  return kartAt(p, r.lateral, r.along);
}

/** A kart sitting on the road at a hazard's station, `lateral` to the right of the road's centre and `along` the road from it. */
function kartAt(p: HazardPose, lateral = 0, along = 0): KartState {
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
