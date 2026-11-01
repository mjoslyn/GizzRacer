import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { FUZZ_BOOST } from '../src/items/items';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { ALPHA_BOOST, ALPHA_COUNT, ALPHA_DEPTH, ALPHA_RADIUS, ALPHA_STAGES, HazardSystem, alphaAcross, type HazardPose } from '../src/items/hazards';
import { KART_RADIUS, createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { buildRapidAlphaDecay } from '../src/tracks/rapidAlphaDecay';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type HazardDef, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildRapidAlphaDecay();
const track = new Track(def);
const section = (name: string) => def.main.sections.find((s) => s.name === name)!;
const first = RACERS[0];
/** The alpha bursts' def: where they're fired across the road, and the nucleus they come out of. */
const alphas = def.hazards.find((h): h is Extract<HazardDef, { kind: 'alphas' }> => h.kind === 'alphas')!;

describe('Rapid Alpha Decay', () => {
  it("is the song, in a reactor's core: the cup's last, its own world, road and music", () => {
    const cup = CUPS.find((c) => c.id === 'alien-metal')!;
    expect(TRACK_LIST[cup.tracks[3]].id).toBe('rapid-alpha-decay');
    expect(def.theme).toBe('reactor');
    expect(new Set(def.main.sections.map((s) => s.surface))).toEqual(new Set(['lead']));
    expect(def.music).toEqual({ lap: 'rapid-alpha-decay', finalLap: 'rapid-alpha-decay-final-lap' });
    expect(TRACK_SONGS['rapid-alpha-decay'].title).toBe('Rapid Alpha Decay');
    expect(def.laps).toBe(3);
    expect(track.length).toBeGreaterThan(1800);
    expect(track.length).toBeLessThan(2700);
    // The reactor's lead doors at the start, and again where the road sinks into the lead; the nucleus on Transcend, the road bored through it.
    expect(def.landmarks.filter((l) => l.s < 20).map((l) => l.kind)).toEqual(['reactorGate']);
    const lead = section('Full with Lead');
    expect(def.landmarks.some((l) => l.kind === 'reactorGate' && l.ribbon === -1 && l.s >= lead.from - 5 && l.s <= lead.to)).toBe(true);
    const nucleus = def.landmarks.find((l) => l.kind === 'atomNucleus')!;
    const k = def.branches.findIndex((b) => b.name === 'Transcend');
    expect(nucleus.ribbon).toBe(k);
    const core = def.branches[k].sections.find((s) => s.name === 'The Nucleus')!;
    expect(nucleus.s > core.from && nucleus.s < core.to).toBe(true);
  });

  it('runs its sections in the order the song sings them', () => {
    expect(def.main.sections.map((s) => s.name)).toEqual([
      'Climb the Walls',
      'Rapid Flame',
      'Alpha Decay',
      'Full with Lead',
      'Metallic',
      'Jumpstart My Heart',
      'Static',
      'Through the Rapid',
      'Keeper of the Energy',
      'Energy and Heat',
      'Finish Straight',
    ]);
  });

  it("is an atom: an electron's orbit precessing round the nucleus, three lobes out and three passes in by the core", () => {
    // The orbit's far points: three, a third of a turn apart round the middle of the map.
    const sp = track.spline;
    const r = (i: number) => Math.hypot(sp.px[i], sp.pz[i]);
    let far = 0;
    for (let i = 0; i < sp.count; i++) far = Math.max(far, r(i));
    const tips: number[] = [];
    for (let i = 0; i < sp.count; i++) {
      if (r(i) < far * 0.85) continue;
      let top = true;
      for (let o = -40; o <= 40 && top; o++) if (r((i + o + sp.count) % sp.count) > r(i)) top = false;
      if (top) tips.push(Math.atan2(sp.px[i], sp.pz[i]));
    }
    expect(tips.length).toBe(3);
    tips.sort((a, b) => a - b);
    for (let k = 0; k < 3; k++) {
      const gap = wrapAngle(tips[(k + 1) % 3] - tips[k]);
      expect(Math.abs(Math.abs(gap) - (2 * Math.PI) / 3)).toBeLessThan(0.2);
    }
    // And each far end is a hairpin: the road turned right round within its lobe.
    for (const name of ['Alpha Decay', 'Static', 'Energy and Heat']) {
      const s = section(name);
      expect(Math.abs(track.main.turnBetween(track.mainS(s.from), track.mainS(s.to))), name).toBeGreaterThan(Math.PI * 0.75);
    }
  });

  it('crosses itself three times, in tiers: the top tier over the ground, a deck over the ground, and the ground over the sunk lead', () => {
    const crossed = crossings(track);
    expect(crossed.length).toBe(3);
    for (const dy of crossed) expect(dy).toBeGreaterThan(6);
    expect(over('Climb the Walls', 'Through the Rapid')).toBeGreaterThan(14);
    expect(over('Metallic', 'Climb the Walls')).toBeGreaterThan(7);
    expect(over('Keeper of the Energy', 'Full with Lead')).toBeGreaterThan(6.5);
    for (const name of ['Climb the Walls', 'Rapid Flame', 'Metallic', 'Keeper of the Energy']) expect(section(name).bridge, name).toBe(true);
  });

  it('climbs the walls up past the core to the top tier, the Rapid Flame burning 16 m up, and decays off a crest down into the lead', () => {
    const climb = section('Climb the Walls');
    expect(climb.wallHeight).toBeGreaterThan(2);
    expect(track.main.heightAtBuilder(climb.to)).toBeGreaterThan(15.5);
    const flame = section('Rapid Flame');
    for (let s = flame.from; s < flame.to; s += 5) expect(track.main.heightAtBuilder(s)).toBeGreaterThan(15.5);
    const decay = section('Alpha Decay');
    expect(track.main.heightAtBuilder(decay.to)).toBeLessThan(0);
  });

  it('sinks Full with Lead between its walls, the alphas fired across it', () => {
    const walled = def.main.sections.filter((s) => (s.wallHeight ?? 0) >= 5);
    expect(walled.map((s) => s.name)).toEqual(['Full with Lead']);
    const at = def.hazards.filter((h) => h.kind === 'alphas').flatMap((h) => ('at' in h ? h.at : []));
    for (const sec of walled) {
      expect(at.filter((s) => s >= sec.from && s <= sec.to).length, sec.name).toBeGreaterThanOrEqual(2);
      expect(track.main.heightAtBuilder((sec.from + sec.to) / 2), sec.name).toBeLessThan(-6);
    }
    expect(def.hazards.every((h) => h.kind === 'alphas')).toBe(true);
  });

  it('leaps the coolant to jumpstart its heart, even the slowest kart at 50cc', () => {
    expect(def.main.gaps.length).toBe(1);
    const [from] = def.main.gaps[0];
    expect(def.main.sections.find((s) => from >= s.from && from <= s.to)!.name).toBe('Jumpstart My Heart');
    expect(def.pits.some((p) => p.liquid === 'water' && inPit(p, pointAt(track.spline, track.mainS(from + 6)).x, pointAt(track.spline, track.mainS(from + 6)).z))).toBe(true);
    for (const r of RACERS) {
      const slow = kartParams(r.stats, '50cc');
      expect(jump(track, track.mainS(from) - 30, -1, slow.topSpeed, 0, slow), r.id).toBe('cleared');
    }
  });

  it('crackles with Static: kinks one way and the other', () => {
    const s = section('Static');
    let flips = 0;
    let last = 0;
    for (let b = s.from + 1; b < s.to - 1; b += 1) {
      const c = track.main.curvatureAt(track.mainS(b));
      if (Math.abs(c) < 0.008) continue;
      const sign = Math.sign(c);
      if (last && sign !== last) flips++;
      last = sign;
    }
    expect(flips).toBeGreaterThanOrEqual(3);
  });
});

describe('Transcend', () => {
  const k = def.branches.findIndex((b) => b.name === 'Transcend');
  const bdef = def.branches[k];
  const branch = track.branches[k];

  it('leaves and rejoins Through the Rapid, open-edged, at the same pose', () => {
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
      expect(sec.name).toBe('Through the Rapid');
      expect(sec.wallHeight ?? 0).toBe(0);
    }
    for (const end of [bdef.sections[0], bdef.sections[bdef.sections.length - 1]]) expect(end.wallHeight ?? 0).toBe(0);
  });

  it('runs straight through the nucleus the main road swings round, rising up through it, there every lap', () => {
    expect(bdef.openOn).toBeUndefined();
    expect(Math.abs(branch.turnBetween(0, branch.spline.length))).toBeLessThan(0.02);
    // The main road loops right round the nucleus, a full half turn and back.
    expect(track.main.maxCurvature(track.mainS(bdef.mainFrom), track.mainS(bdef.mainTo))).toBeGreaterThan(1 / 40);
    expect(Math.max(...bdef.elevation.map(([, y]) => y))).toBeGreaterThan(2.5);
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
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

  it('is quicker than the main line at 150cc, and a kart on a moderate boost at 100cc makes it through', () => {
    const p = kartParams(first.stats, '150cc');
    const viaBranch = drive(branch, bdef.mainTo, p, 0);
    const viaMain = drive(track.main, bdef.mainTo, p, 0, bdef.mainFrom);
    console.log(`Transcend ${viaBranch.time.toFixed(2)} s, main line ${viaMain.time.toFixed(2)} s, saves ${(viaMain.time - viaBranch.time).toFixed(2)} s`);
    expect(viaBranch.fell).toBe(false);
    expect(viaMain.fell).toBe(false);
    expect(viaBranch.time).toBeLessThan(viaMain.time - 0.8);
    expect(viaBranch.time).toBeGreaterThan(viaMain.time - 2.5);
    const moderate = drive(branch, bdef.mainTo, kartParams(first.stats, '100cc'), FUZZ_BOOST, undefined, 0);
    expect(moderate.fell).toBe(false);
    expect(moderate.time).toBeLessThan(20);
  });
});

describe('Rapid Alpha Decay: the ride', () => {
  const main = track.main;
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);

  it('has two kickers early on that launch a kart at 100cc and land it on the road', () => {
    expect(lips.length).toBe(2);
    for (const lip of lips) expect(lip).toBeLessThan(80);
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

  it('climbs to its top tier and sinks into the lead, its cut clear of the pits', () => {
    expect(Math.max(...heights)).toBeGreaterThan(15.5);
    expect(Math.min(...heights)).toBeLessThan(-6.5);
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
    console.log(`Rapid Alpha Decay: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    // Off the top of the decay, at least.
    const decay = section('Alpha Decay');
    expect(crests.some((b) => b >= decay.from && b <= decay.to)).toBe(true);
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

describe('the alpha particles', () => {
  /** The nucleus's side of the road at a pose: 1 to the right of it, -1 to the left. */
  const nucleusSide = (p: HazardPose) => {
    const from = alphas.from!;
    return (from.x - p.ax) * -Math.cos(p.heading) + (from.z - p.az) * Math.sin(p.heading) >= 0 ? 1 : -1;
  };

  it('are fired in bursts out of the nucleus, from its side of the road right across to the other, the same at the same moment', () => {
    const h = new HazardSystem(track);
    const again = new HazardSystem(track);
    const most = new Map<number, number>();
    const least = new Map<number, number>();
    for (let t = 0; t < 10; t += 0.02) {
      h.update(t);
      again.update(t);
      for (const [k, p] of h.poses.entries()) {
        expect(again.poses[k].x).toBeCloseTo(p.x, 6);
        expect(again.poses[k].phase).toBeCloseTo(p.phase, 6);
        expect(p.side).toBe(nucleusSide(p));
        if (p.phase < ALPHA_STAGES.fire || p.phase >= ALPHA_STAGES.wake) continue;
        // Measured toward the nucleus's side: from beyond that edge to beyond the other.
        const lead = p.side * lateral(p, p.x, p.z);
        most.set(k, Math.max(most.get(k) ?? -Infinity, lead));
        least.set(k, Math.min(least.get(k) ?? Infinity, lead));
      }
    }
    expect(most.size).toBe(h.poses.length);
    for (const [k, p] of h.poses.entries()) {
      expect(most.get(k)!).toBeGreaterThan(p.radius);
      expect(least.get(k)!).toBeLessThan(-p.radius);
    }
    // Three to a burst, one behind another.
    expect(alphaAcross(0.4, 1, 15)! - alphaAcross(0.4, 0, 15)!).toBeGreaterThan(ALPHA_RADIUS * 2);
  });

  it('hit by one you spin; the glow before a burst is harmless; through the static wave behind it, a jumpstart', () => {
    const h = new HazardSystem(track);
    const glowing = hazardWhen(h, (q) => q.phase > 0.05 && q.phase < ALPHA_STAGES.fire - 0.02);
    const waiting = beside(glowing, glowing.side * (glowing.radius - 1));
    expect(h.collide([waiting], PHYSICS_DT)).toEqual([]);
    // In the burst: right where an alpha is, you're hit.
    const burst = hazardWhen(h, (q) => q.active && Math.abs(lateral(q, q.x, q.z)) < q.radius - 3);
    const hit = beside(burst, lateral(burst, burst.x, burst.z));
    hit.speed = 20;
    expect(h.collide([hit], PHYSICS_DT)[0]).toMatchObject({ by: 'alphas' });
    expect(hit.spinTime).toBeGreaterThan(0);
    // Once in a while: not again straight away.
    expect(h.collide([hit], PHYSICS_DT)).toEqual([]);
    // Up the road from their line, clear of them: nothing.
    const clear = beside(burst, lateral(burst, burst.x, burst.z));
    clear.x += Math.sin(burst.heading) * (ALPHA_RADIUS + KART_RADIUS + 1);
    clear.z += Math.cos(burst.heading) * (ALPHA_RADIUS + KART_RADIUS + 1);
    expect(h.collide([clear], PHYSICS_DT)).toEqual([]);
    // The static wave, right across the road.
    const wake = hazardWhen(h, (q) => q.lane === 1 && q.phase < ALPHA_STAGES.gone - 0.02);
    for (const lat of [0, wake.radius - 2, -(wake.radius - 2)]) {
      const caught = beside(wake, lat);
      caught.speed = 20;
      expect(h.collide([caught], PHYSICS_DT)[0], `${lat}`).toMatchObject({ by: 'alphas', good: true });
      expect(caught.boostTime).toBeCloseTo(ALPHA_BOOST);
      expect(caught.spinTime).toBe(0);
    }
    const beyond = beside(wake, 0);
    beyond.x += Math.sin(wake.heading) * (ALPHA_DEPTH + KART_RADIUS + 1);
    beyond.z += Math.cos(wake.heading) * (ALPHA_DEPTH + KART_RADIUS + 1);
    expect(h.collide([beyond], PHYSICS_DT)).toEqual([]);
    // Gone quiet after the wave: nothing.
    const quiet = hazardWhen(h, (q) => q.phase > ALPHA_STAGES.gone + 0.02);
    expect(h.collide([beside(quiet, 0)], PHYSICS_DT)).toEqual([]);
  });

  it('shows CPUs the alphas to steer round while they fly, and nothing in the wave', () => {
    // One burst on its own.
    const h = new HazardSystem(new Track({ ...def, hazards: [{ ...alphas, at: alphas.at.slice(0, 1) }] }));
    const out: { x: number; z: number; r: number; vx: number; vz: number }[] = [];
    hazardWhen(h, (q) => q.active);
    h.obstacles(out);
    expect(out.length).toBe(ALPHA_COUNT);
    for (const o of out) expect(o.r).toBe(ALPHA_RADIUS);
    hazardWhen(h, (q) => q.lane === 1);
    out.length = 0;
    h.obstacles(out);
    expect(out.length).toBe(0);
  });
});

/** Steps race time until an alpha burst is in a stage `ok` likes, and returns that pose. */
function hazardWhen(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.01) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'alphas' && ok(q));
    if (p) return p;
  }
  throw new Error('no alphas in that stage');
}

/** How far `upper` runs over `lower` where they're closest: the height between them there. */
function over(upper: string, lower: string): number {
  const a = def.main.sections.find((s) => s.name === upper)!;
  const b = def.main.sections.find((s) => s.name === lower)!;
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

/** A kart on the alphas' line across the road, `lat` metres to the right of the road's centre. */
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
