import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import {
  AUTOPILOT_DRAFT,
  AUTOPILOT_FADE,
  AUTOPILOT_FOLLOW,
  AUTOPILOT_GAP,
  AUTOPILOT_HALF_LENGTH,
  AUTOPILOT_LANES,
  AUTOPILOT_PLATOON,
  AUTOPILOT_SPEED,
  AUTOPILOT_STAGES,
  AUTOPILOT_TOW,
  HazardSystem,
  autopilotLane,
  autopilotPod,
  type HazardPose,
} from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { DEPTH, LEVEL, ROOF, buildLevel5 } from '../src/tracks/level5';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildLevel5();
const track = new Track(def);
const main = track.main;
/** A section by name: a name the road keeps across a deck is one section, from where it starts to where its deck ends. */
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];
const helix = def.main.sections.find((s) => s.name === 'Level Five Autonomy' && s.bridge)!;

describe('Level 5', () => {
  it("is the cup's third, on a self-driving lane", () => {
    const cup = CUPS.find((c) => c.id === 'alien-metal')!;
    expect(TRACK_LIST[cup.tracks[2]].id).toBe('level-5');
    expect(TRACK_SONGS['level-5'].title).toBe('Level 5');
    expect(def.theme).toBe('autonomy');
    expect(def.music).toEqual({ lap: 'level-5', finalLap: 'level-5-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('lane');
  });

  it('runs through the song in order, from level five autonomy to our faith is blind', () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      'Level Five Autonomy',
      "The Milk's Gone Bad",
      'Flies on the Windscreen',
      'Mortician',
      'Date with the End of the World',
      'Out of Time',
      'Incision',
      'Sulphur',
      'The Sky Dematerialised',
      'Stars Fell Flat',
      'Rebellion',
      'Mechanic Rise',
      'Faith Is Blind',
      'Finish Straight',
    ]);
    const length = track.length;
    console.log(`Level 5: ${length.toFixed(0)} m a lap`);
    expect(length).toBeGreaterThan(1800);
    expect(length).toBeLessThan(2700);
    expect(def.laps).toBe(3);
  });

  it("climbs the car park's helix, Level 1 to Level 5, a level each half turn, each level stacked over the one two below", () => {
    // Four half turns, a level each, from the ground to the roof.
    const sp = main.spline;
    const i0 = Math.round((track.mainS(helix.from) / sp.length) * sp.count);
    const i1 = Math.round((track.mainS(helix.to) / sp.length) * sp.count);
    expect(Math.abs(main.turn[i1] - main.turn[i0])).toBeCloseTo(4 * Math.PI, 1);
    expect(main.heightAtBuilder(helix.from)).toBeCloseTo(0, 1);
    expect(main.heightAtBuilder(helix.to)).toBeCloseTo(ROOF, 1);
    expect(ROOF).toBe(4 * LEVEL);
    const half = (helix.to - helix.from) / 4;
    for (let k = 0; k <= 4; k++) expect(main.heightAtBuilder(helix.from + k * half), `Level ${k + 1}`).toBeCloseTo(k * LEVEL, 1);
    // One steady grade all the way up, as gentle as a car park's: one in twenty or less.
    for (let s = helix.from + 1; s < helix.to - 1; s += 1) {
      const grade = main.heightAtBuilder(s + 1) - main.heightAtBuilder(s);
      expect(grade).toBeGreaterThan(0);
      expect(grade).toBeLessThan(0.05);
    }
    // A full turn up, the road is straight over itself, a tier above: two levels, more than 6 m.
    for (let s = helix.from; s < helix.to - 2 * half; s += 5) {
      const a = pointAt(sp, track.mainS(s));
      const b = pointAt(sp, track.mainS(s + 2 * half));
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.5);
      expect(main.heightAtBuilder(s + 2 * half) - main.heightAtBuilder(s)).toBeGreaterThan(6);
    }
    // A sign for each level.
    expect(def.landmarks.filter((l) => l.kind === 'levelSign').length).toBe(5);
  });

  it('runs out over the roof and drops off its edge, the motorway flying out of the car park and back under it', () => {
    const milk = section("The Milk's Gone Bad");
    for (let s = milk.from; s < milk.to; s += 4) expect(main.heightAtBuilder(s)).toBeCloseTo(ROOF, 1);
    const over = crossings(track);
    const pairs = new Set(over.map((c) => `${c.upper} over ${c.lower}`));
    expect([...pairs].sort()).toEqual(['Level Five Autonomy over Incision', 'Level Five Autonomy over Level Five Autonomy', "The Milk's Gone Bad over Incision", 'Mechanic Rise over Finish Straight'].sort());
    for (const c of over) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(6);
      expect(sectionAt(c.upperS).bridge, c.upper).toBe(true);
    }
    // Under the car park, the incision is sunk.
    for (const c of over.filter((q) => q.lower === 'Incision')) expect(c.lowerY).toBeLessThan(-6);
  });

  it('cuts the incision corner to corner under the car park, sunk and walled, and nothing else is sunk', () => {
    const cut = section('Incision');
    let sunk = 0;
    for (let s = cut.from; s < cut.to; s += 2) if (main.heightAtBuilder(s) < -DEPTH + 0.5) sunk += 2;
    expect(sunk / (cut.to - cut.from)).toBeGreaterThan(0.5);
    const sp = main.spline;
    for (let k = 0; k < sp.count; k++) {
      if (!main.cut[k]) continue;
      expect(['Incision', 'Sulphur']).toContain(sectionAt(main.toBuilder(sp.dist[k])).name);
      expect(main.wallHeight[k]).toBeGreaterThan(-main.heightAt(sp.dist[k]));
    }
  });

  it('runs out of time: a leap that a 100cc kart at full speed clears', () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const time = section('Out of Time');
    expect(a > time.from && z < time.to).toBe(true);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });

  it('climbs to the sky dematerialised, and the stars fall flat off its crest', () => {
    const sky = section('The Sky Dematerialised');
    expect(main.heightAtBuilder(sky.to)).toBeGreaterThan(9);
    // Falling away at once off the top, and flat on the ground by the start of the rebellion.
    expect(main.heightAtBuilder(section('Stars Fell Flat').to)).toBeLessThan(main.heightAtBuilder(sky.to) - 7);
    expect(main.heightAtBuilder(section('Rebellion').from + 25)).toBeCloseTo(0, 1);
    expect(def.landmarks.some((l) => l.kind === 'deadSky')).toBe(true);
  });

  it('starts at the car park barrier, and passes another going in', () => {
    expect(def.landmarks.filter((l) => l.s < 20 && l.ribbon === -1).map((l) => l.kind)).toEqual(['carParkGate']);
    const gates = def.landmarks.filter((l) => l.kind === 'carParkGate');
    expect(gates.length).toBe(2);
    expect(Math.abs(gates[1].s - helix.from)).toBeLessThan(10);
  });
});

describe('Our Faith Is Blind, a lane through a dark tunnel with no lights', () => {
  const k = def.branches.findIndex((b) => b.name === 'Our Faith Is Blind');
  const bdef = def.branches[k];
  const branch = track.branches[k];
  const last: LapContext = { lap: 3, lastLap: true };

  it('leaves Faith Is Blind where it swings round the dark, and meets the main road again at the same pose', () => {
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
    const blind = section('Faith Is Blind');
    expect(bdef.mainFrom > blind.from && bdef.mainTo <= blind.to).toBe(true);
    expect(def.landmarks.some((l) => l.kind === 'blindTunnel' && l.ribbon === k)).toBe(true);
  });

  it('runs over a drop in the dark, clear of the main road and in bounds', () => {
    const sp = branch.spline;
    const drop = def.pits.find((p) => inPit(p, sp.px[Math.floor(sp.count / 2)], sp.pz[Math.floor(sp.count / 2)]))!;
    expect(drop).toBeDefined();
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 40 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 40 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(4);
    }
    // The drop is clear of the main road: its edge a good way from the road's.
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

  it('puts a row of double item boxes in the dark', () => {
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
    console.log(`Level 5: Our Faith Is Blind ${via.time.toFixed(2)} s, round the bend ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.8);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('Level 5 elevation and driving', () => {
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);
  const ramps = (b: number) => lips.some((l) => b > l - 9 && b < l + 2) || def.main.gaps.some(([a, z]) => b > a - 20 && b < z + 2);

  it('has two speed bumps on the way in that launch a kart at 100cc and land it on the road', () => {
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

  it('keeps its incision clear of pits, so the ground opens cleanly round it', () => {
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

  it('gives a fast kart airtime off the roof and off the crest, and laps it at 150cc with no falls', () => {
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
    console.log(`Level 5: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const sky = section('The Sky Dematerialised');
    const stars = section('Stars Fell Flat');
    expect(crests.some((b) => b > sky.to - 10 && b < stars.to)).toBe(true);
  }, 30000);

  it('a full field of 150cc CPUs laps it', () => {
    const race = new Race(track);
    // The eight the lap was tuned with: the roster's first, and Han-Tyumi (a boss now, in a field once beaten).
    const field = ['lizard-warlock', 'cyborg-gourmand', 'gila-rider', 'swamp-witch', 'microtonal-monk', 'fuzz-golem', 'neon-moth', 'cosmic-coyote'];
    for (const id of field) race.addKart(RACERS.find((r) => r.id === id)!, '150cc', CPU_SKILL['150cc']);
    let respawns = 0;
    for (let t = 0; t < 200 && race.karts.some((k) => k.laps.lap < 1); t += PHYSICS_DT) {
      race.step(PHYSICS_DT, []);
      respawns += race.karts.filter((k) => k.respawned).length;
    }
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(1);
    expect(respawns).toBeLessThanOrEqual(2);
  }, 30000);
});

describe('autopilot: driverless pods nose to tail in the lanes, changing lane on a rhythm', () => {
  const h = new HazardSystem(track);
  const defs = def.hazards.filter((q) => q.kind === 'autopilot');
  const pods = () => h.poses.filter((q) => q.kind === 'autopilot');

  it('cruise the incision, sunk, and the date with the end of the world, in platoons', () => {
    expect(defs.length).toBe(2);
    const where = defs.map((q) => ('from' in q ? [sectionAt(q.from).name, sectionAt(q.to).name] : []));
    expect(where).toEqual([
      ['Incision', 'Incision'],
      ['Date with the End of the World', 'Date with the End of the World'],
    ]);
    const cut = defs[0];
    if ('from' in cut) for (let s = cut.from; s <= cut.to; s += 5) expect(main.heightAtBuilder(s)).toBeLessThan(-DEPTH + 0.5);
    for (const q of defs) if ('count' in q) expect(q.count % AUTOPILOT_PLATOON).toBe(0);
  });

  it('cruise at one steady speed down their stretch, and keep to the lanes painted on the road', () => {
    const q = defs[0];
    if (!('from' in q)) throw new Error('no stretch');
    const len = q.to - q.from;
    const a = autopilotPod(3, q.period, 0, q.count, len);
    const b = autopilotPod(3.5, q.period, 0, q.count, len);
    expect((((b.along - a.along) % len) + len) % len).toBeCloseTo(AUTOPILOT_SPEED * 0.5, 5);
    expect(AUTOPILOT_SPEED).toBeLessThan(kartParams(first.stats, '50cc').topSpeed * 0.6);
    // Settled in its lane (after the move over), a pod sits in the middle of one of the four.
    h.update(0);
    for (let t = 0; t < 30; t += 0.25) {
      h.update(t);
      for (const p of pods()) {
        if (!p.active || p.phase < AUTOPILOT_STAGES.shift) continue;
        // Across the road from the centreline point it sits by (the pose's own heading is the road's, settled).
        const lateral = (p.x - p.ax) * -Math.cos(p.heading) + (p.z - p.az) * Math.sin(p.heading);
        const hw = widthBy(p);
        const lane = [0, 1, 2, 3].find((l) => Math.abs(autopilotLane(l, hw) - lateral) < 0.3);
        expect(lane, `pod at lateral ${lateral.toFixed(1)} of ${hw.toFixed(1)}`).toBe(p.lane);
        expect(Math.abs(lateral)).toBeLessThan(hw - 1);
      }
    }
    expect(AUTOPILOT_LANES).toBe(4);
  });

  it('run nose to tail, and follow the leader over into the next lane, one after another', () => {
    const q = defs[0];
    if (!('from' in q)) throw new Error('no stretch');
    const len = q.to - q.from;
    for (const t of [1, 2.7, 5.1]) {
      const lead = autopilotPod(t, q.period, 0, q.count, len);
      const next = autopilotPod(t, q.period, 1, q.count, len);
      const gap = (((lead.along - next.along) % len) + len) % len;
      expect(gap).toBeCloseTo(AUTOPILOT_GAP, 5);
      // The one behind is where the one ahead was, a beat behind it in the lane changes.
      expect((((lead.u - next.u) % 1) + 1) % 1).toBeCloseTo(AUTOPILOT_FOLLOW, 5);
    }
    // Over a lap of the rhythm, a platoon changes lane each period, one lane at a time.
    let changes = 0;
    for (let c = 0; c < 6; c++) {
      const p = autopilotPod(c * q.period + 0.5 * q.period - 10, q.period, 0, q.count, len);
      expect(Math.abs(p.lane - p.from)).toBe(1);
      changes++;
    }
    expect(changes).toBe(6);
  });

  it('blink before they move over, toward the lane they move into', () => {
    for (let t = 0; t < 20; t += 0.1) {
      h.update(t);
      for (const p of pods()) {
        if (p.phase >= AUTOPILOT_STAGES.blink) expect(Math.abs(p.side)).toBe(1);
        else if (p.phase >= AUTOPILOT_STAGES.shift) expect(p.side).toBe(0);
      }
    }
  });

  it('materialise out of pixels at the start of their stretch and dematerialise at its end, harmless while they do', () => {
    const p = when(h, (q) => q.gap > 0 && q.gap < 1);
    expect(p.active).toBe(false);
    expect(h.collide([kartAt(p)], PHYSICS_DT)).toEqual([]);
    const q = defs[0];
    if (!('from' in q)) throw new Error('no stretch');
    expect(AUTOPILOT_FADE * 2).toBeLessThan(q.to - q.from);
  });

  it('spin you out if you drive into one', () => {
    const p = when(h, (q) => q.active);
    const kart = kartAt(p);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'autopilot' });
    expect(kart.spinTime).toBeGreaterThan(0);
    // Up on a deck over it: nothing.
    const over = kartAt(p);
    over.y += 8;
    expect(h.collide([over], PHYSICS_DT)).toEqual([]);
  });

  it('tow you on in their slipstream, tucked in behind going faster than they do: a boost', () => {
    // The tail of a platoon (behind the others is the next pod).
    const p = when(h, (q) => q.active && q.phase > AUTOPILOT_STAGES.shift && q.phase < AUTOPILOT_STAGES.blink && pods().indexOf(q) % AUTOPILOT_PLATOON === AUTOPILOT_PLATOON - 1);
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const back = AUTOPILOT_HALF_LENGTH + AUTOPILOT_DRAFT / 2;
    const kart = kartAt(p);
    kart.x -= fx * back;
    kart.z -= fz * back;
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'autopilot', good: true });
    expect(kart.boostTime).toBeCloseTo(AUTOPILOT_TOW);
    expect(kart.spinTime).toBe(0);
    // Crawling along behind it, slower than it: no tow.
    const slow = kartAt(p);
    slow.x -= fx * back;
    slow.z -= fz * back;
    slow.speed = AUTOPILOT_SPEED - 2;
    expect(h.collide([slow], PHYSICS_DT)).toEqual([]);
    // Out of its lane, beside its slipstream: nothing.
    const wide = kartAt(p);
    wide.x += -fz * 3.5 - fx * back;
    wide.z += fx * 3.5 - fz * back;
    wide.speed = 30;
    expect(h.collide([wide], PHYSICS_DT)).toEqual([]);
  });

  it('are where they are by race time alone', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    for (let t = 0; t <= 12.3; t += 0.7) b.update(t);
    b.update(12.3);
    const pa = a.poses.filter((q) => q.kind === 'autopilot');
    const pb = b.poses.filter((q) => q.kind === 'autopilot');
    pa.forEach((p, i) => {
      expect(p.x).toBeCloseTo(pb[i].x, 6);
      expect(p.z).toBeCloseTo(pb[i].z, 6);
      expect(p.lane).toBe(pb[i].lane);
    });
  });
});

/** The road's half width at the centreline point a pod sits by, found along the pods' own stretches (the car park's helix runs over the incision). */
function widthBy(p: HazardPose): number {
  for (const q of def.hazards) {
    if (q.kind !== 'autopilot') continue;
    for (let s = q.from; s <= q.to; s += 0.25) {
      const pt = pointAt(track.spline, track.mainS(s));
      if (Math.hypot(pt.x - p.ax, pt.z - p.az) < 0.2) return main.halfWidthAtS(track.mainS(s));
    }
  }
  throw new Error('no road by the pod');
}

/** Steps race time until a pod is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.02) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'autopilot' && ok(q));
    if (p) return p;
  }
  throw new Error('no pod in that stage');
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
