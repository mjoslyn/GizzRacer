import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { DOZE_DEPTH, DOZE_DRIFT, DOZE_LAG, DOZE_NOD, DOZE_SLEEP, DOZE_SLOW, DOZE_STAGES, DOZE_WAKE, HazardSystem, dozeHaze, dozePhase, isSheet, type HazardPose } from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { DECK, DEPTH, DOZE_PERIOD, HUB_X, HUB_Z, RIM, SPOKE, SUMMIT, TOP, buildTheWheel } from '../src/tracks/theWheel';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildTheWheel();
const track = new Track(def);
const main = track.main;
/** A section by name: a name the road keeps across a deck is one section, from where it starts to where its deck ends. */
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];
/** The three spokes across the hub: the deck, the cut and the top tier. */
const SPOKES = ['Fall Asleep Willingly', 'In a Stupor', 'Into Our Future'];
/** Where a stretch of road (builder arc lengths) passes nearest the hub, and its heading there. */
function byHub(from: number, to: number) {
  let best = { d: Infinity, s: from, h: 0 };
  for (let s = from; s <= to; s += 0.5) {
    const p = pointAt(track.spline, track.mainS(s));
    const d = Math.hypot(p.x - HUB_X, p.z - HUB_Z);
    if (d < best.d) best = { d, s, h: Math.atan2(p.tx, p.tz) };
  }
  return best;
}

describe('The Wheel', () => {
  it("is the cup's fourth and last, on a record's groove", () => {
    const cup = CUPS.find((c) => c.id === 'gumboot-soup')!;
    expect(TRACK_LIST[cup.tracks[3]].id).toBe('the-wheel');
    expect(cup.tracks.length).toBe(4);
    expect(TRACK_SONGS['the-wheel'].title).toBe('The Wheel');
    expect(def.theme).toBe('wheel');
    expect(def.music).toEqual({ lap: 'the-wheel', finalLap: 'the-wheel-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('groove');
  });

  it('runs through the song in order, from at the wheel to the wheel that steers us', () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      'At the Wheel',
      'Fall Asleep Willingly',
      'Our Minds Unpack',
      'Muscles Relax',
      'In a Stupor',
      'Into Our Future',
      'Yet We Decline',
      'Without Mercy',
      'Destroying All',
      'A Better Thesis',
      'Shivering Pilgrims',
      'The Idealistic Reaper',
      'With Hope to Prosper',
      'What Can We Offer?',
      'Our Allegiance Suffers',
      'The Wheel That Steers Us',
    ]);
    const length = track.length;
    console.log(`The Wheel: ${length.toFixed(0)} m a lap`);
    // A long lap: two laps a race, the length of the cup's others.
    expect(length).toBeGreaterThan(1800);
    expect(length).toBeLessThan(2300);
    expect(def.laps).toBe(2);
  });

  it("is a ship's helm seen from above: three spokes straight across its hub, sixty degrees apart, and the road round its rim between them", () => {
    const heads = SPOKES.map((name) => {
      const sec = section(name);
      const at = byHub(sec.from, sec.to);
      // The cut bows a little, to pass beside the others' crossing.
      expect(at.d, name).toBeLessThan(10);
      return at.h;
    });
    // As lines, sixty degrees apart (or a hundred and twenty: the same three spokes).
    for (let a = 0; a < 3; a++) {
      for (let b = a + 1; b < 3; b++) {
        const d = Math.abs(wrapAngle(2 * (heads[a] - heads[b]))) / 2;
        expect(Math.abs(d - Math.PI / 3), `${SPOKES[a]} and ${SPOKES[b]}`).toBeLessThan(0.08);
      }
    }
    // Round the rim between the spokes: Muscles Relax runs out to it, as far out as the hub's sixty degrees round.
    const relax = section('Muscles Relax');
    let far = 0;
    for (let s = relax.from; s < relax.to; s += 1) {
      const p = pointAt(track.spline, track.mainS(s));
      far = Math.max(far, Math.hypot(p.x - HUB_X, p.z - HUB_Z));
    }
    const scale = byHub(section('Fall Asleep Willingly').from, section('Fall Asleep Willingly').from + 1).d / SPOKE;
    expect(Math.abs(far / scale - RIM)).toBeLessThan(0.06 * RIM);
    // The helm's handles stand out past the rim, where the road swings off a spoke or onto one.
    expect(def.landmarks.filter((l) => l.kind === 'helmHandle').length).toBe(4);
  });

  it('crosses itself in tiers: at the hub the top tier over the deck over the cut, and the loop back over its own way in', () => {
    const over = crossings(track);
    const pairs = new Set(over.map((c) => `${c.upper} over ${c.lower}`));
    expect([...pairs].sort()).toEqual(['Fall Asleep Willingly over In a Stupor', 'Into Our Future over Fall Asleep Willingly', 'Into Our Future over In a Stupor', 'Without Mercy over Yet We Decline'].sort());
    for (const c of over) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(6);
      expect(sectionAt(c.upperS).bridge, c.upper).toBe(true);
    }
    // The top tier, the ground and the cut.
    for (const c of over.filter((q) => q.upper === 'Into Our Future')) expect(c.upperY).toBeCloseTo(TOP, 0);
    for (const c of over.filter((q) => q.lower === 'In a Stupor')) expect(c.lowerY).toBeLessThan(-DEPTH + 0.5);
    const loop = over.find((q) => q.upper === 'Without Mercy')!;
    expect(loop.upperY).toBeCloseTo(DECK, 0);
    expect(loop.lowerY).toBeCloseTo(0, 0);
  });

  it('sinks In a Stupor in a cut under the hub, walled, and nothing else is sunk', () => {
    const cut = section('In a Stupor');
    let sunk = 0;
    for (let s = cut.from; s < cut.to; s += 2) if (main.heightAtBuilder(s) < -DEPTH + 0.5) sunk += 2;
    expect(sunk / (cut.to - cut.from)).toBeGreaterThan(0.4);
    const sp = main.spline;
    for (let k = 0; k < sp.count; k++) {
      if (!main.cut[k]) continue;
      expect(sectionAt(main.toBuilder(sp.dist[k])).name).toBe('In a Stupor');
      expect(main.wallHeight[k]).toBeGreaterThan(-main.heightAt(sp.dist[k]));
    }
  });

  it('flies off the crest of the top tier into the future, and Yet We Decline falls away from it', () => {
    const future = section('Into Our Future');
    expect(main.heightAtBuilder(future.to)).toBeCloseTo(TOP, 1);
    const decline = section('Yet We Decline');
    expect(main.heightAtBuilder(decline.to)).toBeCloseTo(0, 1);
    expect(def.landmarks.some((l) => l.kind === 'greatWheel')).toBe(true);
  });

  it('destroying all: the road broken off, a leap a 100cc kart at full speed clears', () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const destroy = section('Destroying All');
    expect(a > destroy.from && z < destroy.to).toBe(true);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });

  it('climbs with the shivering pilgrims to the idealistic reaper on the summit, and off its crest', () => {
    const pilgrims = section('Shivering Pilgrims');
    expect(main.heightAtBuilder(pilgrims.from)).toBeCloseTo(0, 1);
    expect(main.heightAtBuilder(pilgrims.to)).toBeCloseTo(SUMMIT, 1);
    for (let s = pilgrims.from; s < pilgrims.to - 1; s += 1) expect(main.heightAtBuilder(s + 1)).toBeGreaterThanOrEqual(main.heightAtBuilder(s) - 1e-6);
    const reaper = section('The Idealistic Reaper');
    expect(main.heightAtBuilder(reaper.from + 10)).toBeCloseTo(SUMMIT, 1);
    expect(main.heightAtBuilder(section('With Hope to Prosper').to)).toBeCloseTo(0, 1);
    expect(def.landmarks.some((l) => l.kind === 'reaper')).toBe(true);
    expect(def.landmarks.some((l) => l.kind === 'pilgrims')).toBe(true);
  });

  it('starts under the wheel, turning over the line', () => {
    expect(def.landmarks.filter((l) => l.s < 20 && l.ribbon === -1).map((l) => l.kind)).toEqual(['wheelGate']);
  });
});

describe('The Steeper Path, straight up the face to the reaper over a crevasse', () => {
  const k = def.branches.findIndex((b) => b.name === 'The Steeper Path');
  const bdef = def.branches[k];
  const branch = track.branches[k];
  const last: LapContext = { lap: 2, lastLap: true };

  it('leaves the foot of the pilgrims\' way and meets the main road again at the summit, at the same pose', () => {
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
    const pilgrims = section('Shivering Pilgrims');
    expect(bdef.mainFrom > pilgrims.from && bdef.mainTo <= pilgrims.to).toBe(true);
    expect(def.landmarks.some((l) => l.kind === 'steeperPath' && l.ribbon === k)).toBe(true);
  });

  it('is the steeper path: up the face more than twice as steep as the pilgrims\' way round, and never too steep to drive', () => {
    const steepest = (r: Ribbon, a: number, b: number) => {
      let most = 0;
      for (let s = a; s + 1 < b; s += 1) most = Math.max(most, r.heightAt(s + 1) - r.heightAt(s));
      return most;
    };
    const theirs = steepest(main, track.mainS(bdef.mainFrom), track.mainS(bdef.mainTo));
    const ours = steepest(branch, 0, branch.spline.length);
    expect(ours).toBeGreaterThan(2 * theirs);
    expect(ours).toBeLessThan(0.45);
    expect(branch.heightAt(branch.spline.length)).toBeCloseTo(SUMMIT, 1);
  });

  it('runs over a crevasse, clear of the main road and in bounds', () => {
    const sp = branch.spline;
    const drop = def.pits.find((p) => inPit(p, sp.px[Math.floor(sp.count * 0.4)], sp.pz[Math.floor(sp.count * 0.4)]))!;
    expect(drop).toBeDefined();
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 30 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 30 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(4);
    }
    const msp = main.spline;
    const fx = Math.sin(drop.heading);
    const fz = Math.cos(drop.heading);
    for (let i = 0; i < msp.count; i++) {
      const dx = msp.px[i] - drop.x;
      const dz = msp.pz[i] - drop.z;
      const along = Math.max(0, Math.abs(dx * fx + dz * fz) - drop.halfLength);
      const across = Math.max(0, Math.abs(-dx * fz + dz * fx) - drop.halfWidth);
      expect(Math.hypot(along, across) - main.halfWidth[i]).toBeGreaterThan(2);
    }
  });

  it('puts a double item box over the crevasse', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('is there on the final lap only: before that, drive on and you fall', () => {
    expect(bdef.openOn).toEqual(['final']);
    const p = kartParams(first.stats, '150cc');
    expect(drive(branch, bdef.mainTo, p, undefined, last).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 1, lastLap: false }).fell).toBe(true);
  });

  it('saves 0.8 to 2.5 s at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p, undefined, last);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, last);
    console.log(`The Wheel: the Steeper Path ${via.time.toFixed(2)} s, the pilgrims' way ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.8);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('The Wheel elevation and driving', () => {
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);
  const ramps = (b: number) => lips.some((l) => b > l - 9 && b < l + 2) || def.main.gaps.some(([a, z]) => b > a - 20 && b < z + 2);

  it('has two kickers at the wheel that launch a kart at 100cc and land it on the road', () => {
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

  it('gives a fast kart airtime off the top tier and off the summit, and laps it at 150cc with no falls', () => {
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
    console.log(`The Wheel: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const decline = section('Yet We Decline');
    const reaper = section('The Idealistic Reaper');
    const prosper = section('With Hope to Prosper');
    expect(crests.some((b) => b > decline.from - 10 && b < decline.to)).toBe(true);
    expect(crests.some((b) => b > reaper.from && b < prosper.to)).toBe(true);
  }, 30000);

  it('a full field of 150cc CPUs laps it, and the leader finishes the two laps in about a minute and three quarters', () => {
    const race = new Race(track);
    for (const r of RACERS.slice(0, 8)) race.addKart(r, '150cc', CPU_SKILL['150cc']);
    let respawns = 0;
    let t = 0;
    let leader = Infinity;
    for (; t < 300 && race.karts.some((k) => k.laps.lap < def.laps); t += PHYSICS_DT) {
      race.step(PHYSICS_DT, []);
      respawns += race.karts.filter((k) => k.respawned).length;
      if (leader === Infinity && race.karts.some((k) => k.laps.lap >= def.laps)) leader = t;
    }
    console.log(`The Wheel: the leader home in ${leader.toFixed(1)} s, the last in ${t.toFixed(1)} s`);
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(def.laps);
    expect(respawns).toBeLessThanOrEqual(2 * def.laps);
    expect(leader).toBeGreaterThan(95);
    expect(leader).toBeLessThan(120);
  }, 60000);
});

describe('dozes: waves of sleep rolling down the road, and the rumble strips that wake you', () => {
  const h = new HazardSystem(track);
  const defs = def.hazards.filter((q) => q.kind === 'dozes');
  const rows = () => h.poses.filter((q) => q.kind === 'dozes');

  it('roll down the first spoke to the hub and down the cut under it, sunk', () => {
    expect(defs.length).toBe(2);
    const where = defs.map((q) => ('at' in q ? [...new Set(q.at.map((s) => sectionAt(s).name))] : []));
    expect(where).toEqual([['Fall Asleep Willingly'], ['In a Stupor']]);
    const cut = defs[1];
    if ('at' in cut) for (const s of cut.at) expect(main.heightAtBuilder(s)).toBeLessThan(-DEPTH + 0.5);
    expect(isSheet('dozes')).toBe(true);
    for (const q of defs) if ('period' in q) expect(q.period).toBe(DOZE_PERIOD);
  });

  it('settle a beat after one another down the stretch, so the wave of sleep (and the moment to wake) rolls on at about a fast kart\'s pace', () => {
    for (const t of [0, 3.3, 11.7]) for (let i = 0; i < 3; i++) expect((((dozePhase(t, DOZE_PERIOD, i) - dozePhase(t, DOZE_PERIOD, i + 1)) % 1) + 1) % 1).toBeCloseTo(DOZE_LAG, 6);
    const q = defs[1];
    if (!('at' in q)) throw new Error('no rows');
    const apart = (track.mainS(q.at[1]) - track.mainS(q.at[0])) * 1;
    const wave = apart / (DOZE_LAG * DOZE_PERIOD);
    const fast = kartParams(first.stats, '150cc').topSpeed;
    expect(wave).toBeGreaterThan(0.85 * fast);
    expect(wave).toBeLessThan(1.1 * fast);
    // A kart at full speed that crosses the first row as it lifts crosses every row as it lifts, awake all the way down.
    const t0 = (DOZE_STAGES.lift + 0.05) * DOZE_PERIOD - 10;
    for (let i = 0; i < q.at.length; i++) {
      const t = t0 + (track.mainS(q.at[i]) - track.mainS(q.at[0])) / fast;
      const u = dozePhase(t, DOZE_PERIOD, i);
      expect(u, `row ${i}`).toBeGreaterThanOrEqual(DOZE_STAGES.lift);
      expect(u, `row ${i}`).toBeLessThan(DOZE_STAGES.clear);
    }
  });

  it('gather as a warning, lie thick, lift, and clear', () => {
    expect(dozeHaze(DOZE_STAGES.thick + 0.01)).toBe(1);
    expect(dozeHaze(0.05)).toBeLessThan(0.3);
    expect(dozeHaze(DOZE_STAGES.clear + 0.01)).toBeLessThan(0.05);
    // Harmless while it gathers and when it's clear.
    for (const ok of [(p: HazardPose) => p.phase < DOZE_STAGES.thick - 0.02, (p: HazardPose) => p.phase > DOZE_STAGES.clear + 0.02]) {
      const p = when(h, ok);
      expect(p.active).toBe(false);
      expect(p.lane).toBe(0);
      expect(h.collide([kartAt(p)], PHYSICS_DT)).toEqual([]);
    }
  });

  it('caught in the haze while it lies thick, you nod off at the wheel: slowed, the wheel wobbling, drifting toward the edge', () => {
    const p = when(h, (q) => q.active);
    const kart = kartAt(p, 3);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'dozes' });
    expect(kart.speed).toBeCloseTo(30 * DOZE_SLOW, 5);
    expect(kart.wobbleTime).toBeCloseTo(DOZE_NOD);
    // Drifting to the right, the side it's on: a lateral to the right is (-cos h, sin h).
    const drift = kart.extX * -Math.cos(p.heading) + kart.extZ * Math.sin(p.heading);
    expect(drift).toBeCloseTo(DOZE_DRIFT, 5);
    expect(kart.spinTime).toBe(0);
    // The screen's eyelids stay down a little longer than the wheel wobbles.
    expect(DOZE_SLEEP).toBeGreaterThan(DOZE_NOD);
    // Up on a deck over it: nothing.
    const over = kartAt(p);
    over.y += 8;
    expect(h.collide([over], PHYSICS_DT)).toEqual([]);
    // Past it along the road: nothing.
    const past = kartAt(p, 0, DOZE_DEPTH + 2.5);
    expect(h.collide([past], PHYSICS_DT)).toEqual([]);
  });

  it('over the rumble strip as the haze lifts, you are jolted awake: a boost', () => {
    const p = when(h, (q) => q.lane === 1);
    const kart = kartAt(p, -2);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'dozes', good: true });
    expect(kart.boostTime).toBeCloseTo(DOZE_WAKE);
    expect(kart.wobbleTime).toBe(0);
    expect(kart.speed).toBe(30);
  });

  it('are where they are by race time alone', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    for (let t = 0; t <= 12.3; t += 0.7) b.update(t);
    b.update(12.3);
    const pa = a.poses.filter((q) => q.kind === 'dozes');
    const pb = b.poses.filter((q) => q.kind === 'dozes');
    expect(pa.length).toBe(7);
    pa.forEach((p, i) => {
      expect(p.x).toBeCloseTo(pb[i].x, 6);
      expect(p.phase).toBeCloseTo(pb[i].phase, 6);
      expect(p.active).toBe(pb[i].active);
    });
    expect(rows().length).toBe(7);
  });
});

/** Steps race time until a row is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.02) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'dozes' && ok(q));
    if (p) return p;
  }
  throw new Error('no row in that stage');
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
