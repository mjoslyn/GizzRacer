import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { HazardSystem, isSheet, type HazardPose } from '../src/items/hazards';
import { BROOM_BOOST, BROOM_HEAD, BROOM_HIGH, BROOM_LAG, BROOM_LOW, BROOM_OUT, BROOM_RADIUS, BROOM_SPIN, BROOM_STAGES, BROOM_TAIL, BROOM_WAKE, broomCourse, broomPhase } from '../src/kits/sadieSorceress';
import { KART_RADIUS, createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { BROOM_PERIOD, DECK, DEPTH, DIVE, POOL, buildSadieSorceress, pentagram } from '../src/tracks/sadieSorceress';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildSadieSorceress();
const track = new Track(def);
const main = track.main;
/** A section by name: a name the road keeps across a deck is one section, from where it starts to where its last part ends. */
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];
const headingAt = (s: number) => {
  const p = pointAt(track.spline, track.mainS(s));
  return Math.atan2(p.tx, p.tz);
};
/** Where on the map a landmark stands. */
const landmarkAt = (kind: string) => {
  const lm = def.landmarks.find((l) => l.kind === kind)!;
  const p = pointAt(track.spline, track.mainS(lm.s));
  return { x: p.x - p.tz * (lm.lateral ?? 0), z: p.z + p.tx * (lm.lateral ?? 0) };
};

describe('Sadie Sorceress', () => {
  it("is the All Stars Cup #2's second, on a roller rink floor", () => {
    const cup = CUPS.find((c) => c.id === 'all-stars-2')!;
    expect(TRACK_LIST[cup.tracks[1]].id).toBe('sadie-sorceress');
    expect(TRACK_SONGS['sadie-sorceress']).toMatchObject({ title: 'Sadie Sorceress', album: 'Omnium Gatherum', year: 2022 });
    expect(def.theme).toBe('sorceress');
    expect(def.music).toEqual({ lap: 'sadie-sorceress', finalLap: 'sadie-sorceress-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('rink');
  });

  it("runs through the song in order, from who's this Sadie Sorceress to the most dangerous, debaucherous", () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      "Who's This Sadie Sorceress?",
      'Wild Like a Witch',
      'More Fly Than Quidditch',
      'Winnies, Tinnies and Glenfiddich',
      'Roller Blader Skating',
      'Masquerading',
      'Eats Blood and Trouble',
      'Meddles in the Metal',
      'Handbag Freak Flag',
      'Dragon Scale Knapsack',
      'Leviathan Cardigan',
      'Sharp Like Parmesan',
      'Concealing Her Identity',
      'Nightshade',
      'Have a Gander, Oleander',
      'Hello Love, How Are Ya?',
      'Snapping Necks with Her Broomstick',
      'Pitchforks Banging on Her Door',
      'See If She Floats',
      'Sell Her to the Circus',
      'The Most Dangerous, Debaucherous',
    ]);
    const length = track.length;
    console.log(`Sadie Sorceress: ${length.toFixed(0)} m a lap`);
    // Three laps a race, the length of the cup's others.
    expect(length).toBeGreaterThan(2400);
    expect(length).toBeLessThan(2750);
    expect(def.laps).toBe(3);
  });

  it('is a pentagram drawn in one stroke: five points, a hairpin round each, the road straight back along the star\'s lines between them', () => {
    const star = pentagram();
    // Every point turns the road back on itself by well over a right angle, all the same way: twice round in all.
    for (const t of star.turns) {
      expect(Math.abs(t)).toBeGreaterThan((130 * Math.PI) / 180);
      expect(Math.sign(t)).toBe(Math.sign(star.turns[0]));
    }
    expect(Math.abs(star.turns.reduce((a, t) => a + t, 0))).toBeCloseTo(4 * Math.PI, 6);
    // Each point is out at the star's tips, the far side of the middle from the next.
    for (const p of star.pts) expect(Math.hypot(p.x, p.z)).toBeGreaterThan(300);
    // The road keeps to the star's lines: off the hairpins, never more than a swerve off the line between two points.
    const sp = track.spline;
    let onLines = 0;
    for (let i = 0; i < sp.count; i++) {
      const off = Math.min(...star.edges.map((e) => Math.abs((sp.px[i] - e.from.x) * Math.cos(e.h) - (sp.pz[i] - e.from.z) * Math.sin(e.h))));
      if (off < 9) onLines++;
    }
    expect(onLines / sp.count).toBeGreaterThan(0.75);
    // Round each point and back: the way out heads back nearly the way it came in.
    for (const name of ['Winnies, Tinnies and Glenfiddich', 'Meddles in the Metal', 'Sharp Like Parmesan', 'Hello Love, How Are Ya?', 'Sell Her to the Circus']) {
      const sec = section(name);
      expect(Math.abs(wrapAngle(headingAt(sec.to - 0.5) - headingAt(sec.from + 0.5))), name).toBeGreaterThan((135 * Math.PI) / 180);
    }
  });

  it("crosses itself five times round Sadie's lair, in tiers: her flight path over the roads, the roads over the masquerade", () => {
    const over = crossings(track);
    const pairs = new Set(over.map((c) => `${c.upper} over ${c.lower}`));
    expect([...pairs].sort()).toEqual(
      [
        'Dragon Scale Knapsack over Wild Like a Witch',
        'Concealing Her Identity over Wild Like a Witch',
        'Nightshade over Masquerading',
        'Snapping Necks with Her Broomstick over Masquerading',
        'Dragon Scale Knapsack over Pitchforks Banging on Her Door',
      ].sort(),
    );
    expect(over.length).toBe(5);
    for (const c of over) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(6);
      expect(sectionAt(c.upperS).bridge, c.upper).toBe(true);
    }
    for (const c of over.filter((q) => q.lower !== 'Masquerading')) {
      expect(c.upperY).toBeCloseTo(DECK, 0);
      expect(c.lowerY).toBeCloseTo(0, 0);
    }
    for (const c of over.filter((q) => q.lower === 'Masquerading')) {
      expect(c.upperY).toBeCloseTo(0, 0);
      expect(c.lowerY).toBeLessThan(-DEPTH + 0.5);
    }
    // Sadie stands in the middle of it all, in her lair at the star's heart.
    const sadie = landmarkAt('sadieColossus');
    expect(Math.hypot(sadie.x, sadie.z)).toBeLessThan(2);
  });

  it('sinks Masquerading in a cut, walled, and nothing else is cut into the ground', () => {
    const masq = section('Masquerading');
    let sunk = 0;
    for (let s = masq.from; s < masq.to; s += 2) if (main.heightAtBuilder(s) < -DEPTH + 0.5) sunk += 2;
    expect(sunk / (masq.to - masq.from)).toBeGreaterThan(0.5);
    const sp = main.spline;
    for (let k = 0; k < sp.count; k++) {
      if (!main.cut[k]) continue;
      expect(sectionAt(main.toBuilder(sp.dist[k])).name).toBe('Masquerading');
      expect(main.wallHeight[k]).toBeGreaterThan(-main.heightAt(sp.dist[k]));
    }
  });

  it('sees if she floats: down under the ducking pond and back up', () => {
    const floats = section('See If She Floats');
    let under = 0;
    for (let s = floats.from; s < floats.to; s += 2) if (main.heightAtBuilder(s) < -DIVE + 0.5) under += 2;
    expect(under / (floats.to - floats.from)).toBeGreaterThan(0.3);
    const mid = pointAt(track.spline, track.mainS(floats.parts[0].from + 55));
    const pond = def.pits.find((p) => p.liquid === 'water' && inPit(p, mid.x, mid.z))!;
    expect(pond).toBeDefined();
    expect(pond.depth).toBeGreaterThan(DIVE);
    expect(main.heightAtBuilder(floats.to)).toBeCloseTo(0, 1);
    expect(def.landmarks.some((l) => l.kind === 'duckingStool' && l.s > floats.from && l.s < floats.to)).toBe(true);
  });

  it('more fly than Quidditch: a leap through the hoops a 100cc kart at full speed clears', () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const quidditch = section('More Fly Than Quidditch');
    expect(a > quidditch.from && z < quidditch.to).toBe(true);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
    expect(def.landmarks.some((l) => l.kind === 'quidditchHoops')).toBe(true);
  });

  it('flies her flight path on decks round the sharp point, and off its crest down the nightshade', () => {
    const parmesan = section('Sharp Like Parmesan');
    for (let s = parmesan.from; s < parmesan.to; s += 5) expect(main.heightAtBuilder(s)).toBeCloseTo(DECK, 1);
    expect(parmesan.parts.every((p) => p.bridge)).toBe(true);
    expect(main.heightAtBuilder(section('Nightshade').to)).toBeCloseTo(0, 1);
    expect(main.heightAtBuilder(section('Handbag Freak Flag').from)).toBeCloseTo(0, 1);
  });

  it('keeps its landmarks off the road: Sadie in her lair, the cottage, the big top', () => {
    const sadie = landmarkAt('sadieColossus');
    const hit = nearestOnSpline(track.spline, sadie.x, sadie.z);
    expect(hit.distance - main.halfWidthAt(hit)).toBeGreaterThan(40);
  });

  it('starts under the roller rink\'s sign', () => {
    expect(def.landmarks.filter((l) => l.s < 20 && l.ribbon === -1).map((l) => l.kind)).toEqual(['rinkGate']);
  });

  it('stays inside its bounds', () => {
    const sp = track.spline;
    for (let i = 0; i < sp.count; i++) expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i])) + main.halfWidth[i]).toBeLessThan(def.bounds - 10);
  });
});

describe('Poisonous Like Buttercups, inside Millicent\'s point over a pool of poison', () => {
  const k = def.branches.findIndex((b) => b.name === 'Poisonous Like Buttercups');
  const bdef = def.branches[k];
  const branch = track.branches[k];
  const open: LapContext = { lap: 2, lastLap: false };

  it('leaves the road coming in to the point and meets it going out, at the same pose', () => {
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
    // No wall in the way where it leaves or rejoins the road.
    for (const end of [bdef.sections[0], bdef.sections[bdef.sections.length - 1]]) expect(end.wallHeight ?? 0).toBe(0);
    for (const s of [bdef.mainFrom, bdef.mainTo]) expect(sectionAt(s).wallHeight ?? 0).toBe(0);
    expect(sectionAt(bdef.mainFrom).name).toBe('Have a Gander, Oleander');
    expect(sectionAt(bdef.mainTo).name).toBe('Snapping Necks with Her Broomstick');
    expect(def.landmarks.some((l) => l.kind === 'poisonPool' && l.ribbon === k)).toBe(true);
  });

  it('runs over the pool on planks, clear of the main road and in bounds', () => {
    const sp = branch.spline;
    const pool = def.pits.find((p) => inPit(p, sp.px[Math.floor(sp.count / 2)], sp.pz[Math.floor(sp.count / 2)]))!;
    expect(pool).toBeDefined();
    expect(2 * pool.halfLength).toBeCloseTo(POOL, 0);
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 40 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 40 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(4);
    }
    const msp = main.spline;
    const fx = Math.sin(pool.heading);
    const fz = Math.cos(pool.heading);
    for (let i = 0; i < msp.count; i++) {
      const dx = msp.px[i] - pool.x;
      const dz = msp.pz[i] - pool.z;
      const along = Math.max(0, Math.abs(dx * fx + dz * fz) - pool.halfLength);
      const across = Math.max(0, Math.abs(-dx * fz + dz * fx) - pool.halfWidth);
      expect(Math.hypot(along, across) - main.halfWidth[i]).toBeGreaterThan(2);
    }
  });

  it('puts a double item box over the pool', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('is there from the second lap: on the first, drive on and you are in the poison', () => {
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
    console.log(`Sadie Sorceress: Poisonous Like Buttercups ${via.time.toFixed(2)} s, round the cottage ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.8);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('Sadie Sorceress elevation and driving', () => {
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);
  const ramps = (b: number) => lips.some((l) => b > l - 9 && b < l + 2) || def.main.gaps.some(([a, z]) => b > a - 20 && b < z + 2);

  it('has two kickers off the line that launch a kart at 100cc and land it on the road', () => {
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
    const floats = section('See If She Floats').parts[0];
    for (let s = 0; s + 1 < heights.length; s++) {
      const b = main.toBuilder(s);
      // The dive's ramps under the pond are as steep as Muddy Water's.
      if (ramps(b) || (b > floats.from - 1 && b < floats.to + 1)) continue;
      expect(Math.abs(heights[s] - heights[s + 1]), `at ${b.toFixed(0)}`).toBeLessThan(0.45);
    }
  });

  it('gives a fast kart airtime off the crest of her flight path, and laps it at 150cc with no falls', () => {
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
    console.log(`Sadie Sorceress: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const nightshade = section('Nightshade');
    expect(crests.some((b) => b > nightshade.from - 10 && b < nightshade.to)).toBe(true);
  }, 30000);

  it('a full field of 150cc CPUs laps it, the leader in about a minute and four seconds a lap', () => {
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
    console.log(`Sadie Sorceress: the leader home in ${leader.toFixed(1)} s, the last in ${t.toFixed(1)} s, ${respawns} respawns`);
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(def.laps);
    expect(respawns).toBeLessThanOrEqual(2 * def.laps);
    expect(leader / def.laps).toBeGreaterThan(60);
    expect(leader / def.laps).toBeLessThan(70);
  }, 120000);
});

describe('her broomstick: Sadie swooping across the road, and her slipstream', () => {
  const h = new HazardSystem(track);
  const bdef = def.hazards.find((q) => q.kind === 'brooms')!;
  const brooms = () => h.poses.filter((q) => q.kind === 'brooms');

  it('swoops across Snapping Necks with Her Broomstick at three stations, over the masquerade, nothing overhead', () => {
    expect(def.hazards.map((q) => q.kind)).toEqual(['brooms']);
    if (!('at' in bdef)) throw new Error('no stations');
    expect(bdef.at.length).toBe(3);
    expect('period' in bdef && bdef.period).toBe(BROOM_PERIOD);
    const k = def.branches.findIndex((b) => b.name === 'Poisonous Like Buttercups');
    for (const s of bdef.at) {
      expect(sectionAt(s).name).toBe('Snapping Necks with Her Broomstick');
      expect(main.heightAtBuilder(s)).toBeCloseTo(0, 1);
      // Past where the buttercups' lane comes back, so the shortcut doesn't skip her.
      expect(s).toBeGreaterThan(def.branches[k].mainTo);
      // Nothing up over her: no road overhead within her swoop.
      const p = pointAt(track.spline, track.mainS(s));
      const sp = track.spline;
      for (let i = 0; i < sp.count; i++) {
        if (main.heightAt(sp.dist[i]) < 3) continue;
        expect(Math.hypot(sp.px[i] - p.x, sp.pz[i] - p.z), `over ${s.toFixed(0)}`).toBeGreaterThan(30);
      }
    }
    expect(isSheet('brooms')).toBe(false);
  });

  it('circles high off the edge she will come from, swoops down across the road at kart height, and up and away off the other, the other way next time', () => {
    const reach = 15;
    const S = BROOM_STAGES;
    // Waiting: high up, off the road's edge on the side she'll come from.
    for (const u of [0.05, 0.2, 0.4]) {
      const c = broomCourse(u, 1, reach);
      expect(c.swoop).toBe(false);
      expect(c.height).toBeGreaterThan(BROOM_HIGH - 0.01);
      expect(c.lateral).toBeLessThan(-reach - BROOM_OUT + 0.01);
    }
    // Swooping: across from one side to the other, down at kart height over the road.
    let prev = -Infinity;
    for (let f = 0; f <= 1; f += 0.05) {
      const c = broomCourse(S.dive + (S.away - S.dive) * f, 1, reach);
      expect(c.swoop).toBe(true);
      expect(c.lateral).toBeGreaterThan(prev);
      prev = c.lateral;
      if (Math.abs(c.lateral) < reach) expect(c.height).toBeCloseTo(BROOM_LOW, 6);
    }
    // Away: up high off the other side.
    const after = broomCourse(0.9, 1, reach);
    expect(after.height).toBeGreaterThan(BROOM_HIGH - 0.01);
    expect(after.lateral).toBeGreaterThan(reach + BROOM_OUT - 0.01);
    // Smooth all the way round, cycle to cycle: never a jump in where she is.
    for (let t = 0; t < 3 * BROOM_PERIOD; t += 0.01) {
      const a = broomPhase(t, BROOM_PERIOD, 0);
      const b = broomPhase(t + 0.01, BROOM_PERIOD, 0);
      const ca = broomCourse(a.u, a.side, reach);
      const cb = broomCourse(b.u, b.side, reach);
      expect(Math.hypot(ca.lateral - cb.lateral, ca.along - cb.along, ca.height - cb.height), `at ${t.toFixed(2)}`).toBeLessThan(1);
    }
    // Each cycle the other way.
    const sides = [0, 1, 2, 3].map((c) => broomPhase(c * BROOM_PERIOD + 0.01, BROOM_PERIOD, 0).side);
    expect(new Set(sides).size).toBe(2);
    expect(sides[0]).toBe(-sides[1]);
  });

  it('swoops a beat after the station before, so a kart in one slipstream meets the next as she comes down', () => {
    for (const t of [0, 3.3, 11.7]) {
      for (let i = 0; i < 2; i++) {
        const a = broomPhase(t, BROOM_PERIOD, i).u;
        const b = broomPhase(t, BROOM_PERIOD, i + 1).u;
        expect((((a - b) % 1) + 1) % 1).toBeCloseTo(BROOM_LAG, 6);
      }
    }
    if (!('at' in bdef)) throw new Error('no stations');
    const apart = track.mainS(bdef.at[1]) - track.mainS(bdef.at[0]);
    const pace = apart / (BROOM_LAG * BROOM_PERIOD);
    const fast = kartParams(first.stats, '150cc').topSpeed;
    expect(pace).toBeGreaterThan(0.75 * fast);
    expect(pace).toBeLessThan(1.25 * fast);
  });

  it('is harmless while she circles high', () => {
    const p = when(h, (q) => q.phase < BROOM_STAGES.dive - 0.05);
    expect(p.active).toBe(false);
    for (const lat of [-12, -6, 0, 6, 12]) expect(h.collide([kartAcross(p, lat)], PHYSICS_DT)).toEqual([]);
    // Even right under her.
    const under = kartAt(p, 0);
    expect(h.collide([under], PHYSICS_DT)).toEqual([]);
  });

  it('caught by her broomstick as she skims across, snapped and spun', () => {
    const p = when(h, (q) => q.active && Math.abs(q.gap) < 3);
    const kart = kartAt(p, 0);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'brooms' });
    expect(kart.spinTime).toBeGreaterThan(0);
    expect(BROOM_SPIN).toBeGreaterThan(0.8);
    // Well along her line ahead of the tip: nothing.
    const clear = kartAt(p, BROOM_HEAD + BROOM_RADIUS + KART_RADIUS + 1.5);
    expect(fresh().collide([clear], PHYSICS_DT)).toEqual([]);
  });

  it('tucked into her slipstream just behind the bristles as she crosses: a boost', () => {
    const p = when(h, (q) => q.active && Math.abs(q.gap) < 3);
    const kart = kartAt(p, -(BROOM_TAIL + BROOM_RADIUS + 3));
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'brooms', good: true });
    expect(kart.boostTime).toBeCloseTo(BROOM_BOOST);
    expect(kart.spinTime).toBe(0);
    // Too far behind her, it's just road.
    const late = kartAt(p, -(BROOM_TAIL + BROOM_RADIUS + BROOM_WAKE + 2));
    late.speed = 30;
    expect(fresh().collide([late], PHYSICS_DT)).toEqual([]);
  });

  it('is where she is by race time alone', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    for (let t = 0; t <= 12.3; t += 0.7) b.update(t);
    b.update(12.3);
    const pa = a.poses.filter((q) => q.kind === 'brooms');
    const pb = b.poses.filter((q) => q.kind === 'brooms');
    expect(pa.length).toBe(3);
    pa.forEach((p, i) => {
      expect(p.x).toBeCloseTo(pb[i].x, 6);
      expect(p.y).toBeCloseTo(pb[i].y, 6);
      expect(p.phase).toBeCloseTo(pb[i].phase, 6);
      expect(p.active).toBe(pb[i].active);
    });
    expect(brooms().length).toBe(3);
  });

  it('shows the CPUs where she is as she skims across, so they can steer for her slipstream', () => {
    const p = when(h, (q) => q.active);
    const out: { x: number; z: number; r: number; vx: number; vz: number }[] = [];
    h.obstacles(out);
    expect(out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 2)).toBe(true);
  });
});

/** The race time `when` last stopped at. */
let found = 0;
/** A fresh hazard system at that time: no cooldowns from the last kart it hit. */
const fresh = () => {
  const h = new HazardSystem(track);
  h.update(found);
  return h;
};

/** Steps race time until Sadie is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.01) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'brooms' && ok(q));
    found = t;
    if (p) return p;
  }
  throw new Error('no broom in that stage');
}

/** A kart on the road at Sadie's station, `lateral` to the right of the road's middle. */
function kartAcross(p: HazardPose, lateral: number): KartState {
  const hit = nearestOnSpline(track.spline, p.ax, p.az);
  const q = pointAt(track.spline, hit.s);
  const x = p.ax - q.tz * lateral;
  const z = p.az + q.tx * lateral;
  const k = createKartState(x, z, Math.atan2(q.tx, q.tz));
  k.y = k.groundY = p.ground;
  return k;
}

/** A kart on the road under Sadie's line, `along` it ahead of her (behind her if negative), facing down the road. */
function kartAt(p: HazardPose, along: number): KartState {
  const x = p.x + Math.sin(p.heading) * along;
  const z = p.z + Math.cos(p.heading) * along;
  const hit = nearestOnSpline(track.spline, x, z);
  const q = pointAt(track.spline, hit.s);
  const k = createKartState(x, z, Math.atan2(q.tx, q.tz));
  k.y = k.groundY = p.ground;
  return k;
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

/** Below the ground and not on a road there (a road sunk in a cut or under water holds you up): fallen. */
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
