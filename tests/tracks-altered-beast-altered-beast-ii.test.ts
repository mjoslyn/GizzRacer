import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { FUZZ_BOOST } from '../src/items/items';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { CUTLERY_BOOST, CUTLERY_CLOSE, CUTLERY_STAGES, CUTLERY_THREAD, FORK_RADIUS, HazardSystem, KNIFE_LENGTH, KNIFE_RADIUS, cutleryAcross, type HazardPose } from '../src/items/hazards';
import { KART_RADIUS, createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { buildAlteredBeastII } from '../src/tracks/alteredBeastII';
import { TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildAlteredBeastII();
const track = new Track(def);
const section = (name: string) => def.main.sections.find((s) => s.name === name)!;
const first = RACERS[0];
/** The Caribou Run is there on the final lap of three. */
const FINAL: LapContext = { lap: 3, lastLap: true };
const SHUT: LapContext = { lap: 2, lastLap: false };

describe('Altered Beast II', () => {
  it('is the song and Alter Me II, in the beast\'s den: its own world, road and music', () => {
    expect(TRACK_LIST[21].id).toBe('altered-beast-ii');
    expect(def.theme).toBe('foe');
    expect(new Set(def.main.sections.map((s) => s.surface))).toEqual(new Set(['butcher']));
    expect(def.music).toEqual({ lap: 'altered-beast-ii', finalLap: 'altered-beast-ii-final-lap' });
    expect([TRACK_SONGS['altered-beast-ii'].title, TRACK_SONGS['altered-beast-ii'].also]).toEqual(['Altered Beast II', 'Alter Me II']);
    expect(def.laps).toBe(3);
    expect(track.length).toBeGreaterThan(1800);
    expect(track.length).toBeLessThan(2700);
    // The catapult's frame over the start, and again where it flings you; the monster's plate in the loop the road takes round it.
    expect(def.landmarks.filter((l) => l.s < 20).map((l) => l.kind)).toEqual(['catapultGate']);
    const catapult = section('Catapult and Bat');
    expect(def.landmarks.some((l) => l.kind === 'catapultGate' && l.s >= catapult.from && l.s <= catapult.to)).toBe(true);
    const plate = def.landmarks.find((l) => l.kind === 'monsterPlate')!;
    const loop = section("The Monster's Plate");
    expect(plate.s >= loop.from && plate.s <= loop.to).toBe(true);
    const p = pointAt(track.spline, track.mainS(plate.s));
    const lat = plate.lateral ?? 0;
    const px = p.x - p.tz * lat;
    const pz = p.z + p.tx * lat;
    // In the middle of the loop: as far from the road all the way round it.
    const reach: number[] = [];
    for (let s = loop.from; s < loop.from + 250; s += 10) {
      const q = pointAt(track.spline, track.mainS(s));
      reach.push(Math.hypot(q.x - px, q.z - pz));
    }
    expect(Math.max(...reach) - Math.min(...reach)).toBeLessThan(8);
    expect(Math.min(...reach)).toBeGreaterThan(45);
  });

  it('runs its sections in the order the songs sing them', () => {
    expect(def.main.sections.map((s) => s.name)).toEqual([
      'Cross to the Foe',
      'Weapons and Heavy Cargo',
      'The Sabre',
      'Catapult and Bat',
      'Top of the Food Chain',
      'Crusty Bread',
      'Malevolence',
      'Golden Wolf',
      'Caribou',
      'Knife and Fork',
      "The Monster's Plate",
      'Reincarnate',
      'Finish Straight',
    ]);
  });

  it('runs up and down the fork\'s tines, two hairpins', () => {
    const w = section('Weapons and Heavy Cargo');
    const heading = (d: number) => {
      const p = pointAt(track.spline, track.mainS(w.from + d));
      return Math.atan2(p.tx, p.tz);
    };
    const legs = [56, 181, 307].map(heading);
    expect(Math.abs(wrapAngle(legs[0] - legs[1]))).toBeGreaterThan(Math.PI * 0.9);
    expect(Math.abs(wrapAngle(legs[1] - legs[2]))).toBeGreaterThan(Math.PI * 0.9);
  });

  it('crosses the knife over the fork, and the plate over the way in, each a tier apart', () => {
    // The Top of the Food Chain on its deck over Cross to the Foe, the highest road on the lap; the plate's deck over Knife and Fork's cut.
    expect(over('Top of the Food Chain', 'Cross to the Foe')).toBeGreaterThan(9);
    expect(over("The Monster's Plate", 'Knife and Fork')).toBeGreaterThan(12);
    for (const name of ['Top of the Food Chain', "The Monster's Plate"]) expect(section(name).bridge, name).toBe(true);
    const crossed = crossings(track);
    expect(crossed.length).toBe(2);
    for (const dy of crossed) expect(dy).toBeGreaterThan(6);
    const chain = section('Top of the Food Chain');
    let top = -Infinity;
    let where = 0;
    for (let s = 0; s < def.main.length; s += 2) {
      const y = track.main.heightAtBuilder(s);
      if (y > top) {
        top = y;
        where = s;
      }
    }
    expect(where >= chain.from && where <= chain.to).toBe(true);
  });

  it('sinks Knife and Fork between the larder\'s walls, the beast\'s cutlery coming down into it', () => {
    const walled = def.main.sections.filter((s) => (s.wallHeight ?? 0) >= 5);
    expect(walled.map((s) => s.name)).toEqual(['Knife and Fork']);
    const at = def.hazards.flatMap((h) => ('at' in h ? h.at : []));
    const sunk = at.filter((s) => s >= walled[0].from && s <= walled[0].to);
    expect(sunk.length).toBeGreaterThanOrEqual(3);
    for (const s of sunk) expect(track.main.heightAtBuilder(s), `cutlery at ${s.toFixed(0)}`).toBeLessThan(-5);
    expect(def.hazards.every((h) => h.kind === 'cutlery')).toBe(true);
  });

  it('catapults you over a gap, even the slowest kart at 50cc', () => {
    expect(def.main.gaps.length).toBe(1);
    const [from] = def.main.gaps[0];
    const sec = def.main.sections.find((s) => from >= s.from && from <= s.to)!;
    expect(sec.name).toBe('Catapult and Bat');
    for (const r of RACERS) {
      const slow = kartParams(r.stats, '50cc');
      expect(jump(track, track.mainS(from) - 30, -1, slow.topSpeed, 0, slow), r.id).toBe('cleared');
    }
  });
});

describe('The Caribou Run', () => {
  const k = def.branches.findIndex((b) => b.name === 'Caribou Run');
  const bdef = def.branches[k];
  const branch = track.branches[k];

  it('leaves and rejoins Caribou, open-edged, at the same pose', () => {
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
      expect(sec.name).toBe('Caribou');
      expect(sec.wallHeight ?? 0).toBe(0);
      expect(track.main.heightAtBuilder(s)).toBeCloseTo(0, 5);
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
    console.log(`Caribou Run ${viaBranch.time.toFixed(2)} s, main line ${viaMain.time.toFixed(2)} s, saves ${(viaMain.time - viaBranch.time).toFixed(2)} s`);
    expect(viaBranch.fell).toBe(false);
    expect(viaMain.fell).toBe(false);
    expect(viaBranch.time).toBeLessThan(viaMain.time - 0.8);
    expect(viaBranch.time).toBeGreaterThan(viaMain.time - 2.5);
  });
});

describe('Altered Beast II: the ride', () => {
  const main = track.main;
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);

  it('has two kickers early on that launch a kart at 100cc and land it on the road', () => {
    expect(lips.length).toBe(2);
    for (const lip of lips) expect(lip).toBeLessThan(section('Cross to the Foe').to);
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

  it('climbs onto its decks and sinks into Knife and Fork, its cut clear of the pits', () => {
    const top = Math.max(...heights);
    const bottom = Math.min(...heights);
    expect(top).toBeGreaterThan(10);
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
    console.log(`Altered Beast II: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
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

describe("the beast's knife and fork", () => {
  it('come down into the road together, pull apart to the edges and lift away, the same at the same moment', () => {
    const h = new HazardSystem(track);
    const again = new HazardSystem(track);
    const stations = def.hazards.flatMap((d) => ('at' in d ? d.at : []));
    let downTogether = 0;
    let atEdges = 0;
    for (let t = 0; t < 20; t += 0.05) {
      h.update(t);
      again.update(t);
      for (const [k, p] of h.poses.entries()) {
        expect(again.poses[k].x).toBeCloseTo(p.x, 6);
        expect(again.poses[k].gap).toBeCloseTo(p.gap, 6);
        const knife = lateral(p, p.x, p.z);
        const hw = track.main.halfWidthAtS(track.mainS(stations[k]));
        // Down in the road only between the stab and the lift, and there on the road.
        expect(p.active).toBe(p.phase >= CUTLERY_STAGES.stab && p.phase < CUTLERY_STAGES.lift);
        if (p.active) expect(p.y - p.ground).toBeCloseTo(0, 6);
        else expect(p.y - p.ground).toBeGreaterThanOrEqual(0);
        // The knife on its side of the fork (until they swing back over each other, up in the air), and the pair across the road.
        if (p.phase < CUTLERY_STAGES.gone) expect(Math.sign(knife - p.gap)).toBe(p.side);
        expect(Math.abs(knife)).toBeLessThanOrEqual(hw + 1 + 1e-6);
        expect(Math.abs(p.gap)).toBeLessThanOrEqual(hw + 1 + 1e-6);
        if (p.active && p.phase < CUTLERY_STAGES.pull) {
          expect(Math.abs(knife - p.gap)).toBeCloseTo(CUTLERY_CLOSE, 6);
          downTogether++;
        }
        if (p.active && p.phase > CUTLERY_STAGES.lift - 0.1) {
          expect(Math.abs(knife - p.gap)).toBeCloseTo(2 * (hw + 1), 6);
          atEdges++;
        }
      }
    }
    expect(downTogether).toBeGreaterThan(0);
    expect(atEdges).toBeGreaterThan(0);
  });

  it('swap hands each time they come down, somewhere different across the road', () => {
    const P = 4.6;
    const hw = 13.5;
    const sides: number[] = [];
    const mids: number[] = [];
    for (let c = 0; c < 6; c++) {
      // Each cycle, just after they come down.
      const t = (c + CUTLERY_STAGES.stab + 0.02 - 0.37 * 0) * P - 10;
      const a = cutleryAcross(t, P, 0, hw);
      sides.push(a.side);
      mids.push((a.knife + a.fork) / 2);
    }
    for (let c = 1; c < sides.length; c++) expect(sides[c]).toBe(-sides[c - 1]);
    expect(Math.max(...mids) - Math.min(...mids)).toBeGreaterThan(2);
    // Up in the air between, they swing smoothly over to where they come down next.
    for (let t = 0; t < 30; t += 0.01) {
      const a = cutleryAcross(t, P, 0, hw);
      const b = cutleryAcross(t + 0.01, P, 0, hw);
      expect(Math.abs(b.knife - a.knife)).toBeLessThan(1.2);
      expect(Math.abs(b.fork - a.fork)).toBeLessThan(1.2);
    }
  });

  it('caught by the blade or the tines, you spin; threaded between them as they part, a boost', () => {
    const h = new HazardSystem(track);
    const p = h.poses[0];
    // Just as they start to pull apart.
    const t = timeAt(0, CUTLERY_STAGES.pull + 0.05);
    h.update(t);
    expect(p.active).toBe(true);
    const knife = lateral(p, p.x, p.z);
    expect(Math.abs(knife - p.gap)).toBeLessThan(CUTLERY_THREAD);
    const sliced = beside(p, knife);
    sliced.speed = 20;
    expect(h.collide([sliced], PHYSICS_DT)[0]).toMatchObject({ by: 'cutlery' });
    expect(sliced.spinTime).toBeGreaterThan(0);
    expect(h.collide([sliced], PHYSICS_DT)).toEqual([]);
    // The blade's length along the road counts, its point and its heel.
    const heel = beside(p, knife, KNIFE_LENGTH / 2 + KNIFE_RADIUS + KART_RADIUS - 0.1);
    expect(h.collide([heel], PHYSICS_DT)[0]).toMatchObject({ by: 'cutlery' });
    const stabbed = beside(p, p.gap);
    expect(h.collide([stabbed], PHYSICS_DT)[0]).toMatchObject({ by: 'cutlery' });
    expect(stabbed.spinTime).toBeGreaterThan(0);
    const threaded = beside(p, (knife + p.gap) / 2);
    threaded.speed = 20;
    expect(h.collide([threaded], PHYSICS_DT)[0]).toMatchObject({ by: 'cutlery', good: true });
    expect(threaded.boostTime).toBeCloseTo(CUTLERY_BOOST);
    expect(threaded.spinTime).toBe(0);
    // Once in a while: not again straight away.
    expect(h.collide([threaded], PHYSICS_DT)).toEqual([]);
    // Outside the pair, off to the side: nothing.
    const wide = beside(p, p.gap - p.side * (FORK_RADIUS + KART_RADIUS + 1.5));
    expect(h.collide([wide], PHYSICS_DT)).toEqual([]);
    // Once they're pulled right apart, the middle of the road is only road.
    h.update(timeAt(0, CUTLERY_STAGES.lift - 0.05));
    const late = beside(p, (lateral(p, p.x, p.z) + p.gap) / 2);
    expect(h.collide([late], PHYSICS_DT)).toEqual([]);
    // Hanging over the road before they come down: nothing.
    h.update(timeAt(0, 0.05));
    const under = beside(p, p.gap);
    expect(h.collide([under], PHYSICS_DT)).toEqual([]);
  });

  it('shows CPUs the knife and the fork to steer round while they are down', () => {
    const h = new HazardSystem(track);
    const p = h.poses[0];
    const near = (o: { x: number; z: number }) => Math.hypot(o.x - p.ax, o.z - p.az) < 20;
    h.update(timeAt(0, CUTLERY_STAGES.pull));
    const out: { x: number; z: number; r: number; vx: number; vz: number }[] = [];
    h.obstacles(out);
    const down = out.filter(near);
    expect(down.filter((o) => o.r === FORK_RADIUS).length).toBe(1);
    expect(down.length).toBe(4);
    // Lifted away: nothing there.
    h.update(timeAt(0, 0.9));
    const up: typeof out = [];
    h.obstacles(up);
    expect(up.filter(near)).toEqual([]);
  });
});

/** A race time when hazard `k` (of the first, three-station run) is at cycle stage `u`. */
function timeAt(k: number, u: number): number {
  const period = def.hazards[0].kind === 'cutlery' ? def.hazards[0].period : 1;
  return (2 + u - k * 0.37) * period - 10;
}

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

/** A kart on the hazard's line across the road, `lat` metres to the right of the road's centre and `along` it. */
function beside(p: HazardPose, lat: number, along = 0): KartState {
  const k = createKartState(p.ax - Math.cos(p.heading) * lat + Math.sin(p.heading) * along, p.az + Math.sin(p.heading) * lat + Math.cos(p.heading) * along, p.heading);
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
