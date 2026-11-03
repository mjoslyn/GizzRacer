import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { HazardSystem, LIGHT_DEPTH, LIGHT_GO, LIGHT_LAG, LIGHT_SLOW, LIGHT_SPIN, LIGHT_STAGES, isSheet, lightColour, lightPhase, type HazardPose } from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { DEPTH, LIGHT_PERIOD, PIER, SKY, buildStrawsInTheWind } from '../src/tracks/strawsInTheWind';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildStrawsInTheWind();
const track = new Track(def);
const main = track.main;
/** A section by name: a name the road keeps across a deck is one section, from where it starts to where its last part ends. */
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];
const eye = def.landmarks.find((l) => l.kind === 'trashTornado')!;
/** Where the tornado's eye is: off the road where the spiral starts, the way it turns. */
const eyeAt = (() => {
  const p = pointAt(track.spline, track.mainS(eye.s));
  const lat = eye.lateral ?? 0;
  return { x: p.x - p.tz * lat, z: p.z + p.tx * lat };
})();

describe('Straws in the Wind', () => {
  it("is the All Stars Cup's first, a farm track through the flowers", () => {
    const cup = CUPS.find((c) => c.id === 'all-stars-1')!;
    expect(TRACK_LIST[cup.tracks[0]].id).toBe('straws-in-the-wind');
    expect(TRACK_SONGS['straws-in-the-wind']).toMatchObject({ title: 'Straws in the Wind', album: 'K.G.', year: 2020 });
    expect(def.theme).toBe('windmill');
    expect(def.music).toEqual({ lap: 'straws-in-the-wind', finalLap: 'straws-in-the-wind-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('farmtrack');
  });

  it('runs through the song in order, from galvanising uncertainty to we have all just awoken', () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      'Galvanising Uncertainty',
      'The Weary Inkling',
      'Hierarchy Cracking',
      'This Black Heart',
      'Straws in the Wind',
      'Is It All Ending?',
      'Full to the Brim',
      'The Beelzebub Cheshire Grin',
      'Cooking Something Big',
      'Pandemonium',
      'Headless Chickens',
      'Pandemonium',
      'The Media Will Never Quit',
      'Allegro',
      'Mortal Traffic Lights',
      'Condescending Expendables',
      "Hell's Kitchen",
      'A Bad Omen Hanging',
      'Pillars of a Forgotten Pier',
      "We've All Just Awoken",
    ]);
    const length = track.length;
    console.log(`Straws in the Wind: ${length.toFixed(0)} m a lap`);
    // Three laps a race, the length of the cup's others.
    expect(length).toBeGreaterThan(2400);
    expect(length).toBeLessThan(2750);
    expect(def.laps).toBe(3);
  });

  it("climbs the trash tornado: Straws in the Wind spirals up round its eye more than a full turn, widening as it climbs like the funnel, to the sky road", () => {
    const sec = section('Straws in the Wind');
    let turned = 0;
    let lastA = Number.NaN;
    let r0 = Infinity;
    let r1 = 0;
    let y = -Infinity;
    for (let s = sec.from; s <= sec.to; s += 2) {
      const p = pointAt(track.spline, track.mainS(s));
      const a = Math.atan2(p.x - eyeAt.x, p.z - eyeAt.z);
      if (!Number.isNaN(lastA)) turned += wrapAngle(a - lastA);
      lastA = a;
      const r = Math.hypot(p.x - eyeAt.x, p.z - eyeAt.z);
      if (s < sec.from + 30) r0 = Math.min(r0, r);
      if (s > sec.to - 30) r1 = Math.max(r1, r);
      // Never coming down on the way up.
      const h = main.heightAtBuilder(s);
      expect(h, `at ${s.toFixed(0)}`).toBeGreaterThanOrEqual(y - 1e-6);
      y = h;
    }
    expect(Math.abs(turned)).toBeGreaterThan(2 * Math.PI);
    expect(r1).toBeGreaterThan(1.8 * r0);
    expect(main.heightAtBuilder(sec.to)).toBeCloseTo(SKY, 1);
    // On stilts once it's off the ground, walled.
    for (const part of sec.parts.slice(1)) {
      expect(part.bridge).toBe(true);
      expect(part.wallHeight).toBeGreaterThan(1);
    }
  });

  it('crosses itself in tiers: the funnel over its own way in, the sky road over Hell\'s Kitchen, and the pier back over the kitchen', () => {
    const over = crossings(track);
    console.log(`Straws in the Wind crossings: ${over.map((c) => `${c.upper} over ${c.lower} by ${c.dy.toFixed(1)} m`).join('; ')}`);
    const pairs = new Set(over.map((c) => `${c.upper} over ${c.lower}`));
    expect([...pairs].sort()).toEqual(["Is It All Ending? over Hell's Kitchen", "Pillars of a Forgotten Pier over Hell's Kitchen", 'Straws in the Wind over This Black Heart'].sort());
    for (const c of over) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(6);
      expect(sectionAt(c.upperS).bridge, c.upper).toBe(true);
    }
    const sky = over.find((q) => q.upper === 'Is It All Ending?')!;
    expect(sky.upperY).toBeCloseTo(SKY, 0);
    expect(sky.lowerY).toBeLessThan(-DEPTH + 0.5);
    const pier = over.find((q) => q.upper === 'Pillars of a Forgotten Pier')!;
    expect(pier.upperY).toBeCloseTo(PIER, 0);
    expect(pier.lowerY).toBeLessThan(-DEPTH + 0.5);
    // A figure of eight: the sky road and the kitchen cross near square on, in the middle of the map.
    const a = pointAt(track.spline, track.mainS(sky.upperS));
    const b = pointAt(track.spline, track.mainS(sky.lowerS));
    expect(Math.abs(Math.abs(wrapAngle(Math.atan2(a.tx, a.tz) - Math.atan2(b.tx, b.tz))) - Math.PI / 2)).toBeLessThan(0.2);
    expect(Math.hypot(a.x, a.z)).toBeLessThan(0.3 * def.bounds);
  });

  it("sinks Hell's Kitchen in a walled cut, and nothing else", () => {
    const cut = section("Hell's Kitchen");
    let sunk = 0;
    for (let s = cut.from; s < cut.to; s += 2) if (main.heightAtBuilder(s) < -DEPTH + 0.5) sunk += 2;
    expect(sunk / (cut.to - cut.from)).toBeGreaterThan(0.4);
    const sp = main.spline;
    for (let k = 0; k < sp.count; k++) {
      if (!main.cut[k]) continue;
      expect(sectionAt(main.toBuilder(sp.dist[k])).name).toBe("Hell's Kitchen");
      expect(main.wallHeight[k]).toBeGreaterThan(-main.heightAt(sp.dist[k]));
    }
    expect(def.landmarks.some((l) => l.kind === 'hellsKitchen')).toBe(true);
  });

  it('is it all ending?: the sky road plunges off its crest, and the road broken off is a leap a 100cc kart at full speed clears', () => {
    const ending = section('Is It All Ending?');
    expect(main.heightAtBuilder(ending.from + 20)).toBeCloseTo(SKY, 1);
    expect(main.heightAtBuilder(ending.to)).toBeCloseTo(0, 1);
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    expect(a > ending.from && z < ending.to).toBe(true);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });

  it('a bad omen hanging: loops round and climbs onto the pillars of a forgotten pier, and down off it to wake', () => {
    const omen = section('A Bad Omen Hanging');
    expect(main.heightAtBuilder(omen.from)).toBeCloseTo(0, 1);
    expect(main.heightAtBuilder(omen.to)).toBeCloseTo(PIER, 1);
    const pier = section('Pillars of a Forgotten Pier');
    expect(pier.parts.every((p) => p.bridge)).toBe(true);
    expect(main.heightAtBuilder(section("We've All Just Awoken").to)).toBeCloseTo(0, 1);
    expect(def.landmarks.some((l) => l.kind === 'forgottenPier')).toBe(true);
  });

  it('starts under the farm gate, and has its landmarks: the tornado in the funnel\'s eye, the grin in the sky', () => {
    expect(def.landmarks.filter((l) => l.s < 20 && l.ribbon === -1).map((l) => l.kind)).toEqual(['strawsGate']);
    expect(eye.s).toBeCloseTo(section('Straws in the Wind').from, 0);
    expect(def.landmarks.some((l) => l.kind === 'cheshireGrin')).toBe(true);
    // The eye clear of every road.
    const hit = nearestOnSpline(track.spline, eyeAt.x, eyeAt.z);
    expect(hit.distance - main.halfWidthAt(hit)).toBeGreaterThan(8);
  });
});

describe('The Short Straw, a lane straight up through the wheat past the pandemonium', () => {
  const k = def.branches.findIndex((b) => b.name === 'The Short Straw');
  const bdef = def.branches[k];
  const branch = track.branches[k];
  const second: LapContext = { lap: 2, lastLap: false };

  it('leaves where the pandemonium swerves out and meets the main road again where it comes back, at the same pose', () => {
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
    for (const s of [bdef.mainFrom, bdef.mainTo]) expect(def.main.sections.find((q) => s >= q.from && s <= q.to)!.wallHeight ?? 0).toBe(0);
    expect(bdef.mainFrom).toBeCloseTo(section('Pandemonium').from, 0);
    expect(bdef.mainTo).toBeCloseTo(section('Pandemonium').to, 0);
    expect(def.landmarks.some((l) => l.kind === 'shortStraw' && l.ribbon === k)).toBe(true);
  });

  it('runs clear of the main road and in bounds, and has a double item box on it', () => {
    const sp = branch.spline;
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 40 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 40 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(4);
    }
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('is there from lap 2: on the first, drive on and you fall', () => {
    expect(bdef.openOn).toEqual([2, 'final']);
    const p = kartParams(first.stats, '150cc');
    expect(drive(branch, bdef.mainTo, p, undefined, second).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 3, lastLap: true }).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 1, lastLap: false }).fell).toBe(true);
  });

  it('saves 1 to 3 s at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p, undefined, second);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, second);
    console.log(`Straws in the Wind: the Short Straw ${via.time.toFixed(2)} s, the pandemonium ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 1);
    expect(via.time).toBeGreaterThan(round.time - 3);
  });
});

describe('Straws in the Wind elevation and driving', () => {
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);
  const ramps = (b: number) => lips.some((l) => b > l - 9 && b < l + 2) || def.main.gaps.some(([a, z]) => b > a - 20 && b < z + 2);

  it('has two kickers galvanising the start that launch a kart at 100cc and land it on the road', () => {
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

  it('stays in bounds', () => {
    const sp = main.spline;
    for (let i = 0; i < sp.count; i++) expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i])) + main.halfWidth[i]).toBeLessThan(def.bounds - 10);
  });

  it('gives a fast kart airtime off the sky road, and laps it at 150cc with no falls', () => {
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
    console.log(`Straws in the Wind: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const ending = section('Is It All Ending?');
    expect(crests.some((b) => b > ending.from && b < ending.to)).toBe(true);
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
    console.log(`Straws in the Wind: the leader home in ${leader.toFixed(1)} s, the last in ${t.toFixed(1)} s`);
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(def.laps);
    expect(respawns).toBeLessThanOrEqual(2 * def.laps);
    expect(leader / def.laps).toBeGreaterThan(60);
    expect(leader / def.laps).toBeLessThan(70);
  }, 120000);
});

describe('trafficLights: mortal traffic lights signalling when to stay or go', () => {
  const h = new HazardSystem(track);
  const defs = def.hazards.filter((q) => q.kind === 'trafficLights');

  it('hang over the Mortal Traffic Lights, three gantries down the straight', () => {
    expect(defs.length).toBe(1);
    const q = defs[0];
    if (!('at' in q)) throw new Error('no gantries');
    expect(q.at.length).toBe(3);
    for (const s of q.at) expect(sectionAt(s).name).toBe('Mortal Traffic Lights');
    expect(q.period).toBe(LIGHT_PERIOD);
    expect(isSheet('trafficLights')).toBe(true);
  });

  it('change on the waltz: green on the one, amber on the two, red on the three', () => {
    expect(lightColour(0.1)).toBe(0);
    expect(lightColour(LIGHT_STAGES.amber + 0.01)).toBe(1);
    expect(lightColour(LIGHT_STAGES.red + 0.01)).toBe(2);
    expect(LIGHT_STAGES.amber).toBeCloseTo(1 / 3, 6);
    expect(LIGHT_STAGES.red).toBeCloseTo(2 / 3, 6);
  });

  it('change one after another down the straight, so a green wave rolls down it at about a fast kart\'s pace', () => {
    for (const t of [0, 3.3, 11.7]) for (let i = 0; i < 2; i++) expect((((lightPhase(t, LIGHT_PERIOD, i) - lightPhase(t, LIGHT_PERIOD, i + 1)) % 1) + 1) % 1).toBeCloseTo(LIGHT_LAG, 6);
    const q = defs[0];
    if (!('at' in q)) throw new Error('no gantries');
    const apart = track.mainS(q.at[1]) - track.mainS(q.at[0]);
    const wave = apart / (LIGHT_LAG * LIGHT_PERIOD);
    const fast = kartParams(first.stats, '150cc').topSpeed;
    expect(wave).toBeGreaterThan(0.85 * fast);
    expect(wave).toBeLessThan(1.1 * fast);
    // A kart at full speed through the first on green is through them all on green.
    const t0 = 0.1 * LIGHT_PERIOD - 10;
    for (let i = 0; i < q.at.length; i++) {
      const t = t0 + (track.mainS(q.at[i]) - track.mainS(q.at[0])) / fast;
      expect(lightColour(lightPhase(t, LIGHT_PERIOD, i)), `gantry ${i}`).toBe(0);
    }
  });

  it('through on green: go, a boost', () => {
    const p = when(h, (q) => q.lane === 0);
    const kart = kartAt(p, 3);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'trafficLights', good: true });
    expect(kart.boostTime).toBeCloseTo(LIGHT_GO);
    expect(kart.spinTime).toBe(0);
  });

  it('caught on red: stay, stopped dead and spun round', () => {
    const p = when(h, (q) => q.lane === 2);
    expect(p.active).toBe(true);
    const kart = kartAt(p, -4);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'trafficLights' });
    expect(kart.speed).toBeCloseTo(30 * LIGHT_SLOW, 5);
    expect(kart.spinTime).toBeCloseTo(LIGHT_SPIN);
    // Up on a deck over it: nothing.
    const over = kartAt(p);
    over.y += 8;
    expect(h.collide([over], PHYSICS_DT)).toEqual([]);
    // Short of its stop line: nothing.
    const short = kartAt(p, 0, -(LIGHT_DEPTH + 2.5));
    expect(h.collide([short], PHYSICS_DT)).toEqual([]);
  });

  it('amber only warns', () => {
    const p = when(h, (q) => q.lane === 1);
    expect(p.active).toBe(false);
    const kart = kartAt(p);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)).toEqual([]);
    expect(kart.speed).toBe(30);
    expect(kart.boostTime).toBe(0);
  });

  it('are where they are by race time alone', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    for (let t = 0; t <= 12.3; t += 0.7) b.update(t);
    b.update(12.3);
    const pa = a.poses.filter((q) => q.kind === 'trafficLights');
    const pb = b.poses.filter((q) => q.kind === 'trafficLights');
    expect(pa.length).toBe(3);
    pa.forEach((p, i) => {
      expect(p.x).toBeCloseTo(pb[i].x, 6);
      expect(p.phase).toBeCloseTo(pb[i].phase, 6);
      expect(p.lane).toBe(pb[i].lane);
    });
  });
});

/** Steps race time until a gantry is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.02) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'trafficLights' && ok(q));
    if (p) return p;
  }
  throw new Error('no gantry in that stage');
}

/** A kart sitting on the road on a hazard, `lateral` to the right of it and `along` the road from it. */
function kartAt(p: HazardPose, lateral = 0, along = 0): KartState {
  const x = p.x - Math.cos(p.heading) * lateral + Math.sin(p.heading) * along;
  const z = p.z + Math.sin(p.heading) * lateral + Math.cos(p.heading) * along;
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
