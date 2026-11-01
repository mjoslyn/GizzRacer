import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import {
  HAMMER_BEAT, HAMMER_BEATS, HAMMER_CRUSH, HAMMER_FACE, HAMMER_FIX, HAMMER_PERIOD, HAMMER_SPARKS, HAMMER_STAGES, HazardSystem, hammerLift, type HazardPose,
} from '../src/items/hazards';
import { KART_RADIUS, createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { buildAlienMetal } from '../src/tracks/alienMetal';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildAlienMetal();
const track = new Track(def);
const main = track.main;
/** Every stretch of the road by a name (the chant's names come round three times). */
const sections = (name: string) => def.main.sections.filter((s) => s.name === name);
const section = (name: string) => sections(name)[0];
const first = RACERS[0];

describe('Alien Metal', () => {
  it("is the cup's first, the album's title track, on a road of forged plates on the astral blacksmith's anvil", () => {
    const cup = CUPS.find((c) => c.id === 'alien-metal')!;
    expect(TRACK_LIST[cup.tracks[0]].id).toBe('alien-metal');
    expect(TRACK_SONGS['alien-metal'].title).toBe('Alien Metal');
    expect(def.theme).toBe('forge');
    expect(def.music).toEqual({ lap: 'alien-metal', finalLap: 'alien-metal-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('anvil');
  });

  it('runs through the song in order, the chant three times over, and back under the stars at the end', () => {
    expect(def.main.sections.map((s) => s.name)).toEqual([
      'Fall Asleep Under the Stars',
      'Summer Breeze',
      'Water',
      'Fire',
      'Water',
      'Fire',
      'Water',
      'Fire',
      'Clouds and Ice',
      'Transforming',
      'Rebirth',
      'Interstellar Reality',
      'Astral Blacksmith',
      'Gimme a Fix',
      'Keep It a Secret',
      'Under the Stars',
      'Finish Straight',
    ]);
    const length = track.length;
    console.log(`Alien Metal: ${length.toFixed(0)} m a lap`);
    expect(length).toBeGreaterThan(1800);
    expect(length).toBeLessThan(2700);
    expect(def.laps).toBe(3);
  });

  it("is a Möbius strip's edge: twice round the forge before it meets itself, outside and then inside, the twist where it crosses over", () => {
    // Round the middle of the map twice.
    const sp = main.spline;
    let turned = 0;
    for (let i = 0; i < sp.count; i++) {
      const j = (i + 1) % sp.count;
      turned += wrapAngle(Math.atan2(sp.px[j], sp.pz[j]) - Math.atan2(sp.px[i], sp.pz[i]));
    }
    expect(Math.abs(turned) / (2 * Math.PI)).toBeCloseTo(2, 5);
    // The first time round on the outside edge, the second on the inside: about the strip's width apart.
    const radius = (s: number) => {
      const p = pointAt(sp, track.mainS(s));
      return Math.hypot(p.x, p.z);
    };
    const outside = radius((section('Fall Asleep Under the Stars').from + section('Fall Asleep Under the Stars').to) / 2);
    const inside = radius((section('Rebirth').from + section('Rebirth').to) / 2);
    expect(outside - inside).toBeGreaterThan(80);
    // Three crossings, the first time round over the second each time, the upper road on a deck: the twist,
    // where the edge crosses over from outside to inside, and the forge, twice under the inside.
    const over = crossings(track);
    expect(over.map((c) => `${c.upper} over ${c.lower}`).sort()).toEqual([
      'Transforming over Astral Blacksmith',
      'Transforming over Interstellar Reality',
      'Transforming over Keep It a Secret',
    ]);
    for (const c of over) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(7);
      expect(sectionAt(c.upperS).bridge, c.upper).toBe(true);
    }
    // At the twist the two roads cross square-ish, an X, not side by side.
    const twist = over.find((c) => c.lower === 'Interstellar Reality')!;
    const a = pointAt(track.spline, track.mainS(twist.upperS));
    const b = pointAt(track.spline, track.mainS(twist.lowerS));
    expect(Math.abs(a.tx * b.tx + a.tz * b.tz)).toBeLessThan(0.85);
  });

  it("chants water, fire, water, fire, water, fire in the song's rhythm: six even zones, water swinging out and fire in, a hump of heat on each fire", () => {
    const zones = def.main.sections.filter((s) => s.name === 'Water' || s.name === 'Fire');
    expect(zones.map((z) => z.name)).toEqual(['Water', 'Fire', 'Water', 'Fire', 'Water', 'Fire']);
    const lengths = zones.map((z) => z.to - z.from);
    for (const l of lengths) expect(Math.abs(l / (lengths.reduce((x, y) => x + y) / 6) - 1)).toBeLessThan(0.15);
    for (let k = 1; k < zones.length; k++) expect(zones[k].from).toBeCloseTo(zones[k - 1].to, 5);
    // Water's middle further out from the forge than its edges, fire's further in.
    const sp = main.spline;
    const r = (s: number) => {
      const p = pointAt(sp, track.mainS(s));
      return Math.hypot(p.x, p.z);
    };
    for (const z of zones) {
      const bulge = r((z.from + z.to) / 2) - (r(z.from) + r(z.to)) / 2;
      if (z.name === 'Water') expect(bulge, `water at ${z.from.toFixed(0)}`).toBeGreaterThan(4);
      else expect(bulge, `fire at ${z.from.toFixed(0)}`).toBeLessThan(-4);
      const mid = main.heightAtBuilder((z.from + z.to) / 2);
      if (z.name === 'Fire') expect(mid).toBeGreaterThan(2);
      else expect(mid).toBeLessThan(0.5);
    }
    // Then clouds and ice.
    expect(def.main.sections[def.main.sections.indexOf(zones[5]) + 1].name).toBe('Clouds and Ice');
  });

  it("goes down into the astral blacksmith's forge, sunk between iron walls, his hammers across it, round the anvil and out again unseen", () => {
    for (const name of ['Astral Blacksmith', 'Gimme a Fix', 'Keep It a Secret']) {
      const sec = section(name);
      expect(sec.wallHeight ?? 0, name).toBeGreaterThanOrEqual(5);
      expect(main.heightAtBuilder((sec.from + sec.to) / 2), name).toBeLessThan(-5);
    }
    // Every walled stretch is sunk, with the smith's hammer coming down across it.
    const at = def.hazards.filter((h) => h.kind === 'hammer').flatMap((h) => ('at' in h ? h.at : []));
    for (const sec of def.main.sections.filter((s) => (s.wallHeight ?? 0) >= 5)) {
      expect(at.some((s) => s >= sec.from && s <= sec.to), sec.name).toBe(true);
    }
    for (const s of at) expect(main.heightAtBuilder(s)).toBeLessThan(-5);
    // Gimme a Fix turns right round the anvil, a hairpin, and the strip turns over the anvil in the middle of it.
    const fix = section('Gimme a Fix');
    const sp = main.spline;
    const i0 = Math.round((track.mainS(fix.from) / sp.length) * sp.count);
    const i1 = Math.round((track.mainS(fix.to) / sp.length) * sp.count);
    const turned = Math.abs(main.turn[i1] - main.turn[i0]);
    expect(turned).toBeGreaterThan(Math.PI * 0.92);
    expect(turned).toBeLessThan(Math.PI * 1.08);
    const strip = def.landmarks.find((l) => l.kind === 'mobiusStrip')!;
    expect(strip.s).toBeCloseTo(fix.from, 0);
    // The forge's cut keeps clear of the quench water.
    expect(main.cut.some((x) => x > 0)).toBe(true);
    for (let i = 0; i < sp.count; i++) {
      if (!main.cut[i]) continue;
      const near = def.pits.some((p) => inPit({ ...p, halfLength: p.halfLength + 6, halfWidth: p.halfWidth + 6 }, sp.px[i], sp.pz[i]));
      expect(near, `cut at ${main.toBuilder(sp.dist[i]).toFixed(0)}`).toBe(false);
    }
  });

  it('is reborn off the end of the deck: a crest to fly off, and a leap over the quench water that a 100cc kart at full speed clears', () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const rebirth = section('Rebirth');
    expect(a > rebirth.from && z < rebirth.to).toBe(true);
    expect(main.heightAtBuilder(rebirth.from)).toBeGreaterThan(7);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });

  it('floats through interstellar reality, over its swells under lighter gravity, level again under the twist', () => {
    const reality = section('Interstellar Reality');
    expect(reality.gravity).toBeLessThan(1);
    let top = 0;
    for (let s = reality.from; s < reality.to; s += 2) top = Math.max(top, main.heightAtBuilder(s));
    expect(top).toBeGreaterThan(2);
  });

  it('starts under the anvil, the blacksmith huge in the stars off the road', () => {
    expect(def.landmarks.filter((l) => l.s < 20 && l.ribbon === -1).map((l) => l.kind)).toEqual(['anvilGate']);
    const smith = def.landmarks.find((l) => l.kind === 'astralBlacksmith')!;
    expect(Math.abs(smith.lateral ?? 0)).toBeGreaterThan(100);
    // Off beyond every road.
    const p = pointAt(track.spline, track.mainS(smith.s));
    const x = p.x - p.tz * smith.lateral!;
    const z = p.z + p.tx * smith.lateral!;
    expect(nearestOnSpline(track.spline, x, z).distance).toBeGreaterThan(100);
  });
});

describe('The Slipstream, a straight tube of wind across the quench pool', () => {
  const k = def.branches.findIndex((b) => b.name === 'The Slipstream');
  const bdef = def.branches[k];
  const branch = track.branches[k];

  it('leaves Clouds and Ice where it swings out round the pool, and meets the main road again at the same pose and height', () => {
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
    const clouds = section('Clouds and Ice');
    expect(bdef.mainFrom > clouds.from && bdef.mainTo <= clouds.to).toBe(true);
  });

  it('runs straight across the pool, clear of the main road and in bounds', () => {
    const sp = branch.spline;
    for (let i = 1; i < sp.count; i++) expect(Math.abs(wrapAngle(Math.atan2(sp.tx[i], sp.tz[i]) - Math.atan2(sp.tx[0], sp.tz[0])))).toBeLessThan(0.02);
    const mid = Math.floor(sp.count / 2);
    expect(def.pits.some((p) => p.liquid === 'water' && inPit(p, sp.px[mid], sp.pz[mid]))).toBe(true);
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 40 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 40 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(4);
    }
  });

  it('is there every lap, with a row of double item boxes on it', () => {
    expect(bdef.openOn).toBeUndefined();
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('saves 0.8 to 2.5 s at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom);
    console.log(`Alien Metal: the Slipstream ${via.time.toFixed(2)} s, round the pool ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.8);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('Alien Metal elevation and driving', () => {
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);

  it('climbs onto the deck over the twist and sinks into the forge', () => {
    expect(Math.max(...heights)).toBeGreaterThan(7.5);
    expect(Math.min(...heights)).toBeLessThan(-5);
  });

  it('has one to three kickers falling asleep under the stars that launch a kart at 100cc and land it on the road', () => {
    expect(lips.length).toBeGreaterThanOrEqual(1);
    expect(lips.length).toBeLessThanOrEqual(3);
    const start = section('Fall Asleep Under the Stars');
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

  it('never runs downhill so steeply that a kart at full speed skips off it', () => {
    for (let s = 0; s + 1 < heights.length; s++) {
      const b = main.toBuilder(s);
      if (lips.some((l) => Math.abs(b - l) < 2) || def.main.gaps.some(([a, z]) => b > a - 2 && b < z + 2)) continue;
      expect(heights[s] - heights[s + 1], `at ${b.toFixed(0)}`).toBeLessThan(0.45);
    }
  });

  it('gives a fast kart airtime off the end of the deck, and laps it at 150cc with no falls', () => {
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
    console.log(`Alien Metal: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const twist = section('Transforming');
    const rebirth = section('Rebirth');
    expect(crests.some((b) => b > twist.to - 10 && b < rebirth.to)).toBe(true);
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

describe("hammer: the astral blacksmith's hammer coming down on the beat, a shower of sparks", () => {
  const h = new HazardSystem(track);

  it('comes down every two bars at the album\'s 143 beats a minute, the hammers down the forge a beat apart, one side of the road and then the other', () => {
    expect(HAMMER_BEAT).toBeCloseTo(60 / 143, 9);
    expect(HAMMER_PERIOD).toBeCloseTo(HAMMER_BEATS * HAMMER_BEAT, 9);
    for (const q of def.hazards.filter((r) => r.kind === 'hammer')) expect('period' in q && q.period).toBeCloseTo(HAMMER_PERIOD, 9);
    // The strike on the fourth beat.
    expect(HAMMER_STAGES.land * HAMMER_BEATS).toBeCloseTo(4, 9);
    h.update(5);
    const row = h.poses.filter((q) => q.kind === 'hammer').slice(0, 3);
    for (let k = 1; k < row.length; k++) {
      const lag = (((row[k - 1].phase - row[k].phase) % 1) + 1) % 1;
      expect(lag).toBeCloseTo(1 / HAMMER_BEATS, 5);
    }
    const sides = new Set<number>();
    for (let t = 0; t < 4 * HAMMER_PERIOD; t += 0.1) {
      h.update(t);
      sides.add(h.poses.find((q) => q.kind === 'hammer')!.side);
    }
    expect([...sides].sort()).toEqual([-1, 1]);
  });

  it('hangs high over the road first, harmless, its shadow the warning; comes down faster and faster', () => {
    const raised = when(h, (q) => q.phase < HAMMER_STAGES.fall - 0.05);
    expect(raised.active).toBe(false);
    expect(raised.y - raised.ground).toBeGreaterThan(5);
    expect(h.collide([kartAt(raised)], PHYSICS_DT)).toEqual([]);
    const S = HAMMER_STAGES;
    const fall = (u: number) => hammerLift(u) - hammerLift(u + 0.01);
    expect(fall(S.land - 0.02)).toBeGreaterThan(fall(S.fall + 0.01));
    expect(hammerLift(S.land)).toBe(0);
  });

  it('flattens what is under it as it strikes: spun out', () => {
    const strike = when(h, (q) => q.phase >= HAMMER_STAGES.land && q.phase < HAMMER_STAGES.land + HAMMER_CRUSH);
    expect(strike.active).toBe(true);
    const under = kartAt(strike);
    under.speed = 20;
    expect(h.collide([under], PHYSICS_DT).find((e) => e.kart === under)).toMatchObject({ by: 'hammer' });
    expect(under.spinTime).toBeGreaterThan(0);
  });

  it('rests on the road a beat where it struck: a block to drive round, not a spin', () => {
    const resting = when(h, (q) => q.phase > HAMMER_STAGES.land + HAMMER_CRUSH + 0.01 && q.phase < HAMMER_STAGES.lift - 0.01);
    expect(resting.y).toBeCloseTo(resting.ground, 5);
    const k = kartAt(resting);
    k.x += 0.5;
    h.collide([k], PHYSICS_DT);
    expect(k.spinTime).toBe(0);
    expect(Math.hypot(k.x - resting.x, k.z - resting.z)).toBeGreaterThanOrEqual(HAMMER_FACE + KART_RADIUS - 1e-6);
  });

  it('throws a shower of sparks off the strike: driven through just after, a fix, a boost; out past them, nothing', () => {
    const sparking = when(h, (q) => q.phase > HAMMER_STAGES.lift + 0.01 && q.phase < HAMMER_STAGES.sparks - 0.02);
    expect(sparking.gap).toBe(HAMMER_SPARKS);
    const through = kartAt(sparking);
    through.x += -Math.cos(sparking.heading) * (HAMMER_SPARKS - 2);
    through.z += Math.sin(sparking.heading) * (HAMMER_SPARKS - 2);
    through.speed = 20;
    expect(h.collide([through], PHYSICS_DT)[0]).toMatchObject({ by: 'hammer', good: true });
    expect(through.boostTime).toBeCloseTo(HAMMER_FIX);
    expect(through.spinTime).toBe(0);
    // Under where it struck, now it has lifted: the sparks too.
    const lifted = kartAt(sparking);
    expect(h.collide([lifted], PHYSICS_DT)[0]).toMatchObject({ by: 'hammer', good: true });
    const far = kartAt(sparking);
    far.x += Math.sin(sparking.heading) * (HAMMER_SPARKS + KART_RADIUS + 2);
    far.z += Math.cos(sparking.heading) * (HAMMER_SPARKS + KART_RADIUS + 2);
    expect(h.collide([far], PHYSICS_DT)).toEqual([]);
    // Once the sparks have died, nothing.
    const cold = when(h, (q) => q.phase > HAMMER_STAGES.sparks + 0.02 && q.phase < 0.98);
    expect(cold.gap).toBe(0);
    expect(h.collide([kartAt(cold)], PHYSICS_DT)).toEqual([]);
  });
});

/** Steps race time until a hammer is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.01) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'hammer' && ok(q));
    if (p) return p;
  }
  throw new Error('no hammer in that stage');
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
    return { dy, upper: sectionAt(upperS).name, lower: sectionAt(lowerS).name, upperS, lowerS };
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
function drive(ribbon: Ribbon, to: number, p: ReturnType<typeof kartParams>, from?: number) {
  const s0 = from === undefined ? 0 : track.mainS(from);
  const pt = pointAt(ribbon.spline, s0);
  const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
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

/** Drives down the road from arc length `s` and reports whether the kart landed or fell. */
function jump(s: number, ribbon: number, speed: number, boost: number, p: ReturnType<typeof kartParams>) {
  const r = track.ribbon(ribbon);
  const pt = pointAt(r.spline, s);
  const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
  kart.y = kart.groundY = r.heightAt(s);
  kart.speed = speed;
  kart.boostTime = boost;
  let progress = s;
  for (let k = 0; k < 4; k += PHYSICS_DT) {
    stepKart(kart, steerAlong(r, kart, progress), p, track, PHYSICS_DT);
    progress = nearestOnSpline(r.spline, kart.x, kart.z).s;
    if (fallen(kart)) return 'fell';
  }
  return 'cleared';
}
