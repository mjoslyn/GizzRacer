import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import {
  HazardSystem,
  PISTON_BOOST,
  PISTON_BUMP_SLOW,
  PISTON_LANES,
  PISTON_LIFT,
  PISTON_SLOW,
  PISTON_STAGES,
  isSheet,
  pistonBeat,
  pistonLift,
  pistonPhase,
  type HazardPose,
} from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { BEND_R, BUG, DECK, DEPTH, DOME_R, PISTON_PERIOD, TOP, buildCyboogie } from '../src/tracks/cyboogie';
import { buildCyboogieCity } from '../src/tracks/cyboogieCity';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Landmark, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildCyboogie();
const track = new Track(def);
const main = track.main;
/** A section by name: a name the road keeps across a deck is one section, from where it starts to where its deck ends. */
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];
/** Where a landmark that stands off the road stands. */
function standsAt(lm: Landmark) {
  const p = pointAt(track.spline, track.mainS(lm.s));
  const lat = lm.lateral ?? 0;
  return { x: p.x - p.tz * lat, z: p.z + p.tx * lat };
}
/** How far round a stretch of road turns about a point, in degrees, and how far from it the road stays. */
function round(from: number, to: number, c: { x: number; z: number }) {
  let turned = 0;
  let near = Infinity;
  let far = 0;
  let last: number | null = null;
  for (let s = from; s <= to; s += 1) {
    const p = pointAt(track.spline, track.mainS(s));
    const a = Math.atan2(p.x - c.x, p.z - c.z);
    if (last !== null) turned += wrapAngle(a - last);
    last = a;
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    near = Math.min(near, d);
    far = Math.max(far, d);
  }
  return { turned: (Math.abs(turned) * 180) / Math.PI, near, far };
}

describe('Cyboogie', () => {
  it("is the All Stars Cup #1's second, on a graphene lattice, and not Doom City", () => {
    const cup = CUPS.find((c) => c.id === 'all-stars-1')!;
    expect(TRACK_LIST[cup.tracks[1]].id).toBe('cyboogie');
    expect(TRACK_SONGS.cyboogie.title).toBe('Cyboogie');
    expect(TRACK_SONGS.cyboogie.album).toBe('Fishing for Fishies');
    expect(def.theme).toBe('cyborg');
    expect(def.music).toEqual({ lap: 'cyboogie', finalLap: 'cyboogie-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('graphene');
    // The old Cyboogie, now Doom City, is a neon downtown: a different world, road and lap.
    const city = buildCyboogieCity();
    expect(city.id).toBe('cyboogie-city');
    expect(city.theme).not.toBe(def.theme);
    expect(new Set(city.main.sections.map((s) => s.name)).size).toBeGreaterThan(0);
    for (const s of city.main.sections) expect(def.main.sections.some((q) => q.name === s.name), s.name).toBe(false);
  });

  it('runs through the song in order, from his grey matter to the hook through his cheek and Han-Tyumi', () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      'Cyboogie',
      'A Hunk of Grey Matter',
      'Brine Fluid',
      'Augmented Senses',
      'Bouncy Ball Thoughts',
      'His Heart Is a Mess',
      'Cables in Knots',
      'Feeling Depressed',
      'Run Over the Tests',
      'Pistons and Pumps',
      'Breaks Down',
      'Lump in His Throat',
      'Palpitations',
      'Chorophobia',
      'Terminal Error',
      'Fishing for Fishies',
      'Binary Brook',
      'Pierced Through His Cheek',
      'Dance With the Devil',
    ]);
    const length = track.length;
    console.log(`Cyboogie: ${length.toFixed(0)} m a lap`);
    // Three laps a race, the length of the cup standard.
    expect(length).toBeGreaterThan(2400);
    expect(length).toBeLessThan(2700);
    expect(def.laps).toBe(3);
  });

  it('is the cyborg seen from above: right round his dome, round his heart, and round the bend of the hook', () => {
    const at = (kind: Landmark['kind']) => standsAt(def.landmarks.find((l) => l.kind === kind)!);
    // His dome: the loop goes three quarters of the way round his head, and on out of it down the neck.
    const dome = round(section('A Hunk of Grey Matter').from + 15, section('A Hunk of Grey Matter').to, at('cyborgHead'));
    expect(dome.turned).toBeGreaterThan(250);
    expect(dome.near).toBeGreaterThan(DOME_R - 2);
    expect(dome.far).toBeLessThan(DOME_R + 2);
    // His heart: the knot loops right round it, then crosses back over its own way in.
    const knot = section('Cables in Knots');
    const heart = round(knot.from, knot.parts[0].to + 60, at('cyborgHeart'));
    expect(heart.turned).toBeGreaterThan(250);
    expect(heart.near).toBeGreaterThan(30);
    // The hook: the brook bends half round it, from the line down to the barb back up.
    const brook = section('Binary Brook');
    const hook = round(brook.from, brook.to, at('fishHook'));
    expect(hook.turned).toBeGreaterThan(170);
    expect(Math.abs(hook.near - BEND_R)).toBeLessThan(2);
    // The line down and the barb up run side by side, the hook's shank between them.
    const down = pointAt(track.spline, track.mainS(brook.from));
    const up = pointAt(track.spline, track.mainS(brook.to));
    expect(down.tx * up.tx + down.tz * up.tz).toBeLessThan(-0.99);
    expect(def.landmarks.filter((l) => l.kind === 'binaryBrook').length).toBe(1);
    expect(def.landmarks.filter((l) => l.kind === 'hanTyumi').length).toBe(1);
  });

  it('crosses itself in tiers: the start over the neck, the throat over both, and the knot back over its way in', () => {
    const over = crossings(track);
    const pairs = new Set(over.map((c) => `${c.upper} over ${c.lower}`));
    expect([...pairs].sort()).toEqual(['Cables in Knots over Bouncy Ball Thoughts', 'Cyboogie over Brine Fluid', 'Lump in His Throat over Brine Fluid', 'Lump in His Throat over Cyboogie'].sort());
    for (const c of over) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(6);
      expect(sectionAt(c.upperS).bridge, c.upper).toBe(true);
    }
    // Three tiers where the throat crosses the neck: the cut, and the throat's viaduct high over it.
    for (const c of over.filter((q) => q.upper === 'Lump in His Throat')) expect(c.upperY).toBeCloseTo(TOP, 0);
    for (const c of over.filter((q) => q.lower === 'Brine Fluid')) expect(c.lowerY).toBeLessThan(-DEPTH + 0.5);
    const throat = over.find((q) => q.upper === 'Lump in His Throat' && q.lower === 'Brine Fluid')!;
    expect(throat.dy).toBeGreaterThan(TOP + DEPTH - 0.5);
    const knot = over.find((q) => q.upper === 'Cables in Knots')!;
    expect(knot.upperY).toBeCloseTo(DECK, 0);
    expect(knot.lowerY).toBeCloseTo(0, 0);
  });

  it('sinks Brine Fluid in a cut down his neck, walled, and nothing else is sunk', () => {
    const cut = section('Brine Fluid');
    let sunk = 0;
    for (let s = cut.from; s < cut.to; s += 2) if (main.heightAtBuilder(s) < -DEPTH + 0.5) sunk += 2;
    expect(sunk / (cut.to - cut.from)).toBeGreaterThan(0.4);
    const sp = main.spline;
    for (let k = 0; k < sp.count; k++) {
      if (!main.cut[k]) continue;
      const name = sectionAt(main.toBuilder(sp.dist[k])).name;
      expect(['A Hunk of Grey Matter', 'Brine Fluid', 'Augmented Senses']).toContain(name);
      expect(main.wallHeight[k]).toBeGreaterThan(-main.heightAt(sp.dist[k]));
    }
  });

  it('drops off the knot\'s deck feeling depressed, and flies off the lump in his throat into the palpitations', () => {
    expect(main.heightAtBuilder(section('Cables in Knots').to)).toBeCloseTo(DECK, 1);
    expect(main.heightAtBuilder(section('Feeling Depressed').to)).toBeCloseTo(0, 1);
    const throat = section('Lump in His Throat');
    expect(main.heightAtBuilder(throat.to)).toBeCloseTo(TOP, 1);
    const palp = section('Palpitations');
    // Down off the crest, and two skips of the heart on the way.
    let skips = 0;
    let rising = false;
    for (let s = palp.from + 20; s < palp.to + 30; s += 0.5) {
      const up = main.heightAtBuilder(s + 0.5) > main.heightAtBuilder(s) + 1e-4;
      if (up && !rising) skips++;
      rising = up;
    }
    expect(skips).toBe(2);
  });

  it('breaks down: the road broken off, a leap a 100cc kart at full speed clears', () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const breaks = section('Breaks Down');
    expect(a > breaks.from && z < breaks.to).toBe(true);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });

  it('starts under the cyboogie gate', () => {
    expect(def.landmarks.filter((l) => l.s < 20 && l.ribbon === -1).map((l) => l.kind)).toEqual(['cyboogieGate']);
  });
});

describe('De-bug, straight down the line through the tests over the bug', () => {
  const k = def.branches.findIndex((b) => b.name === 'De-bug');
  const bdef = def.branches[k];
  const branch = track.branches[k];
  const last: LapContext = { lap: 3, lastLap: true };

  it('leaves the top of the tests and meets the main road again at their foot, at the same pose', () => {
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
    const tests = section('Run Over the Tests');
    expect(Math.abs(bdef.mainFrom - tests.from)).toBeLessThan(1);
    expect(Math.abs(bdef.mainTo - tests.to)).toBeLessThan(1);
    expect(def.landmarks.some((l) => l.kind === 'debugLane' && l.ribbon === k)).toBe(true);
  });

  it('runs over the bug, clear of the main road and in bounds', () => {
    const sp = branch.spline;
    const bug = def.pits.find((p) => inPit(p, sp.px[Math.floor(sp.count / 2)], sp.pz[Math.floor(sp.count / 2)]))!;
    expect(bug).toBeDefined();
    expect(2 * bug.halfLength).toBeCloseTo(BUG, 0);
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      // Off the main road where it runs over the bug and either side of it (its ends fork off the main road and back onto it).
      if (Math.abs(sp.dist[i] - sp.length / 2) > BUG / 2 + 4) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(4);
    }
    const msp = main.spline;
    const fx = Math.sin(bug.heading);
    const fz = Math.cos(bug.heading);
    for (let i = 0; i < msp.count; i++) {
      const dx = msp.px[i] - bug.x;
      const dz = msp.pz[i] - bug.z;
      const along = Math.max(0, Math.abs(dx * fx + dz * fz) - bug.halfLength);
      const across = Math.max(0, Math.abs(-dx * fz + dz * fx) - bug.halfWidth);
      expect(Math.hypot(along, across) - main.halfWidth[i]).toBeGreaterThan(2);
    }
  });

  it('puts a double item box over the bug', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('is there on the final lap only: before that, drive on and you fall', () => {
    expect(bdef.openOn).toEqual(['final']);
    const p = kartParams(first.stats, '150cc');
    expect(drive(branch, bdef.mainTo, p, undefined, last).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 2, lastLap: false }).fell).toBe(true);
  });

  it('saves 0.8 to 2.5 s at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p, undefined, last);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, last);
    console.log(`Cyboogie: De-bug ${via.time.toFixed(2)} s, the tests ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.8);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('Cyboogie elevation and driving', () => {
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);
  const ramps = (b: number) => lips.some((l) => b > l - 9 && b < l + 2) || def.main.gaps.some(([a, z]) => b > a - 20 && b < z + 2);

  it('has two kickers under his cheek that launch a kart at 100cc and land it on the road', () => {
    expect(lips.length).toBe(2);
    const start = def.main.sections[0];
    const p = kartParams(first.stats, '100cc');
    for (const lip of lips) {
      expect(lip > start.from && lip < start.to).toBe(true);
      const s0 = track.mainS(Math.max(0, lip - 7 - 12));
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

  it('stays in bounds', () => {
    const sp = main.spline;
    for (let i = 0; i < sp.count; i++) expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i])) + main.halfWidth[i]).toBeLessThan(def.bounds - 10);
  });

  it('never runs downhill so steeply that a kart at full speed skips off it, nor climbs any steeper', () => {
    for (let s = 0; s + 1 < heights.length; s++) {
      const b = main.toBuilder(s);
      if (ramps(b)) continue;
      expect(Math.abs(heights[s] - heights[s + 1]), `at ${b.toFixed(0)}`).toBeLessThan(0.45);
    }
  });

  it('gives a fast kart airtime off the lump in his throat, and laps it at 150cc with no falls', () => {
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
    console.log(`Cyboogie: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const palp = section('Palpitations');
    expect(crests.some((b) => b > palp.from - 10 && b < palp.to)).toBe(true);
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
    console.log(`Cyboogie: the leader home in ${leader.toFixed(1)} s, the last in ${t.toFixed(1)} s`);
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(def.laps);
    expect(respawns).toBeLessThanOrEqual(2 * def.laps);
    expect(leader / def.laps).toBeGreaterThan(60);
    expect(leader / def.laps).toBeLessThan(70);
  }, 120000);
});

describe('pistons: punching up through the graphene on the boogie\'s beat', () => {
  const h = new HazardSystem(track);
  const defs = def.hazards.filter((q) => q.kind === 'pistons');
  const pistons = () => h.poses.filter((q) => q.kind === 'pistons');

  it('stand in rows of four across Pistons and Pumps and the dance floor he fears', () => {
    expect(defs.length).toBe(2);
    const where = defs.map((q) => ('at' in q ? [...new Set(q.at.map((s) => sectionAt(s).name))] : []));
    expect(where).toEqual([['Pistons and Pumps'], ['Chorophobia']]);
    for (const q of defs) {
      if (!('at' in q)) continue;
      expect(q.period).toBe(PISTON_PERIOD);
      expect(q.at.length % PISTON_LANES).toBe(0);
      for (let r = 0; r < q.at.length; r += PISTON_LANES) expect(new Set(q.at.slice(r, r + PISTON_LANES)).size).toBe(1);
    }
    expect(isSheet('pistons')).toBe(false);
    // A row spans the road, a piston to each lane, left to right.
    h.update(3);
    const row = pistons().slice(0, PISTON_LANES);
    const lat = row.map((p) => (p.x - p.ax) * -Math.cos(p.heading) + (p.z - p.az) * Math.sin(p.heading));
    for (let k = 1; k < lat.length; k++) expect(lat[k]).toBeGreaterThan(lat[k - 1] + 5);
    expect(Math.abs(lat[0] + lat[lat.length - 1])).toBeLessThan(0.5);
  });

  it('pump like an arpeggio: one in each row on each beat of the bar, up one row and down the next, each row a beat behind', () => {
    for (let row = 0; row < 3; row++) {
      const beats = Array.from({ length: PISTON_LANES }, (_, lane) => pistonBeat(row, lane, PISTON_LANES));
      expect([...beats].sort()).toEqual([0, 1, 2, 3]);
    }
    // Up the first row, left to right, and down the second, right to left (round and round the bar), its first a beat after the first row's.
    const laneOn = (row: number, beat: number) => Array.from({ length: PISTON_LANES }, (_, lane) => lane).find((lane) => pistonBeat(row, lane, PISTON_LANES) === beat)!;
    for (let beat = 0; beat < PISTON_LANES; beat++) {
      expect(laneOn(0, (beat + 1) % PISTON_LANES)).toBe((laneOn(0, beat) + 1) % PISTON_LANES);
      expect(laneOn(1, (beat + 1) % PISTON_LANES)).toBe((laneOn(1, beat) + PISTON_LANES - 1) % PISTON_LANES);
    }
    expect(laneOn(0, 0)).toBe(0);
    expect(laneOn(1, 1)).toBe(PISTON_LANES - 1);
    // A beat apart, piston after piston.
    const beat = PISTON_PERIOD / PISTON_LANES;
    for (const t of [0, 1.3, 7.7]) {
      const a = pistonPhase(t, PISTON_PERIOD, 0, PISTON_LANES);
      const b = pistonPhase(t + beat, PISTON_PERIOD, 1, PISTON_LANES);
      expect(b).toBeCloseTo(a, 6);
    }
    // At any moment some of each row are flush to drive over.
    for (let t = 0; t < 4; t += 0.05) {
      h.update(t);
      const all = pistons();
      for (let r = 0; r < all.length; r += PISTON_LANES) expect(all.slice(r, r + PISTON_LANES).some((p) => !p.active)).toBe(true);
    }
  });

  it('hiss as a warning, punch up, stand at the top of the stroke, and drop back flush', () => {
    expect(pistonLift(PISTON_STAGES.warn + 0.05)).toBe(0);
    expect(pistonLift(PISTON_STAGES.top / 2)).toBeGreaterThan(0.5);
    expect(pistonLift(PISTON_STAGES.top + 0.05)).toBe(1);
    expect(pistonLift(PISTON_STAGES.down + 0.01)).toBe(0);
    const up = when(h, (q) => q.phase > PISTON_STAGES.top + 0.05 && q.phase < PISTON_STAGES.drop);
    expect(up.y - up.ground).toBeCloseTo(PISTON_LIFT, 3);
    // Harmless while it hisses and once it's flush.
    for (const ok of [(p: HazardPose) => p.phase > PISTON_STAGES.warn + 0.02, (p: HazardPose) => p.phase > PISTON_STAGES.down + 0.02 && p.phase < PISTON_STAGES.warn]) {
      const p = when(h, ok);
      expect(p.active).toBe(false);
      expect(h.collide([kartAt(p)], PHYSICS_DT)).toEqual([]);
    }
  });

  it('caught over one as it punches up, you are thrown and spun', () => {
    const p = when(h, (q) => q.phase < PISTON_STAGES.top * 0.6);
    const kart = kartAt(p);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'pistons' });
    expect(kart.spinTime).toBeGreaterThan(0);
    expect(kart.vy).toBeGreaterThan(5);
    expect(kart.speed).toBeCloseTo(30 * PISTON_SLOW, 5);
  });

  it('driven into one standing at the top of its stroke, you are spun and pushed off it', () => {
    const p = when(h, (q) => q.phase > PISTON_STAGES.top + 0.02 && q.phase < PISTON_STAGES.drop - 0.02);
    const kart = kartAt(p, 0, -1.5);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'pistons' });
    expect(kart.spinTime).toBeGreaterThan(0);
    expect(kart.speed).toBeCloseTo(30 * PISTON_BUMP_SLOW, 5);
    expect(Math.hypot(kart.x - p.x, kart.z - p.z)).toBeGreaterThanOrEqual(p.radius + 0.99);
  });

  it('hopped onto at the top of its stroke, you ride it: up, and on with a boost', () => {
    const p = when(h, (q) => q.phase > PISTON_STAGES.top + 0.02 && q.phase < PISTON_STAGES.drop - 0.02);
    const kart = kartAt(p, 0.5);
    kart.speed = 30;
    kart.hopAge = 0.05;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'pistons', good: true });
    expect(kart.boostTime).toBeCloseTo(PISTON_BOOST);
    expect(kart.vy).toBeGreaterThan(9);
    expect(kart.spinTime).toBe(0);
    expect(kart.speed).toBe(30);
  });

  it('nothing for a kart on a deck over one, or in the next lane', () => {
    const p = when(h, (q) => q.active);
    const over = kartAt(p);
    over.y += 8;
    expect(h.collide([over], PHYSICS_DT)).toEqual([]);
    const beside = kartAt(p, p.radius + 1.5);
    expect(h.collide([beside], PHYSICS_DT)).toEqual([]);
  });

  it('are where they are by race time alone, and the CPUs steer round the ones that are up', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    for (let t = 0; t <= 12.3; t += 0.7) b.update(t);
    b.update(12.3);
    const pa = a.poses.filter((q) => q.kind === 'pistons');
    const pb = b.poses.filter((q) => q.kind === 'pistons');
    expect(pa.length).toBe(5 * PISTON_LANES);
    pa.forEach((p, i) => {
      expect(p.x).toBeCloseTo(pb[i].x, 6);
      expect(p.y).toBeCloseTo(pb[i].y, 6);
      expect(p.phase).toBeCloseTo(pb[i].phase, 6);
      expect(p.active).toBe(pb[i].active);
    });
    const out: { x: number; z: number; r: number; vx: number; vz: number }[] = [];
    a.obstacles(out);
    const up = pa.filter((p) => p.active || p.phase >= PISTON_STAGES.warn);
    expect(out.length).toBe(up.length);
    for (const p of up) expect(out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 0.01)).toBe(true);
    for (const p of pa.filter((q) => !q.active && q.phase < PISTON_STAGES.warn)) expect(out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 0.01)).toBe(false);
  });
});

/** Steps race time until a piston is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.01) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'pistons' && ok(q));
    if (p) return p;
  }
  throw new Error('no piston in that stage');
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
