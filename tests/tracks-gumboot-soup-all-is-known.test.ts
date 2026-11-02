import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import {
  HazardSystem,
  SWEEP_BOOST,
  SWEEP_DEPTH,
  SWEEP_HALF,
  SWEEP_PARK,
  SWEEP_STAGES,
  SWEEP_WAKE,
  sweeperAcross,
  type HazardPose,
} from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { BIND, BONE, CROSS, DEPTH, KING_R, NET, STEEL, buildAllIsKnown } from '../src/tracks/allIsKnown';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildAllIsKnown();
const track = new Track(def);
const main = track.main;
/** A section by name: a name the road keeps across a deck is one section, from where it starts to where its deck ends. */
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];

describe('All Is Known', () => {
  it("is the Gumboot Soup Cup's third, on a circuit board's road", () => {
    const cup = CUPS.find((c) => c.id === 'gumboot-soup')!;
    expect(TRACK_LIST[cup.tracks[2]].id).toBe('all-is-known');
    expect(TRACK_SONGS['all-is-known'].title).toBe('All Is Known');
    expect(def.theme).toBe('network');
    expect(def.music).toEqual({ lap: 'all-is-known', finalLap: 'all-is-known-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('circuit');
  });

  it('runs through the song in order, from human beings to all is known', () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      'Human Beings',
      'Vermin Weed',
      'Old Technology',
      'Supersede',
      'Paint to Acetone',
      "You've Got Gaps",
      'Synapses',
      'Connected to the Network',
      'Weak and Organic',
      "You've Got Muscle",
      'Steel Bone',
      'Burn Their Meat',
      'Sweep the Streets',
      'Bind Their Hands',
      'Digitise',
      'Cut the Eyes from the King',
      'The Fourth Cone',
      'All Is Known',
    ]);
    const length = track.length;
    console.log(`All Is Known: ${length.toFixed(0)} m a lap`);
    expect(length).toBeGreaterThan(2200);
    expect(length).toBeLessThan(2700);
    expect(def.laps).toBe(3);
  });

  it('is a neural network: it crosses itself four times, always a tier apart, the upper road on a deck', () => {
    const over = crossings(track);
    const pairs = over.map((c) => `${c.upper} over ${c.lower}`).sort();
    expect(pairs).toEqual(
      [
        // The long traces crossing in the middle of the network.
        'Supersede over Sweep the Streets',
        // The three recurrent nodes, each looping back through its own way in.
        'Connected to the Network over Connected to the Network',
        "Steel Bone over You've Got Muscle",
        'Bind Their Hands over Sweep the Streets',
      ].sort(),
    );
    for (const c of over) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(7);
      expect(sectionAt(c.upperS).bridge, c.upper).toBe(true);
    }
    // Supersede over the streets right where the two long traces cross.
    const mid = over.find((c) => c.upper === 'Supersede')!;
    expect(Math.hypot(mid.x - CROSS.x, mid.z - CROSS.z)).toBeLessThan(6);
    // Each recurrent node's loop turns most of the way round.
    for (const l of [NET, BONE, BIND]) expect(Math.abs(l.turn)).toBeGreaterThan(240);
    // It fills the map: out to all four sides of it.
    const sp = track.spline;
    const xs = Array.from(sp.px);
    const zs = Array.from(sp.pz);
    for (const v of [Math.max(...xs), -Math.min(...xs), Math.max(...zs), -Math.min(...zs)]) {
      expect(v).toBeGreaterThan(def.bounds * 0.7);
      expect(v).toBeLessThan(def.bounds - 20);
    }
  });

  it("sinks the muscle 7 m between walls under steel bone, 14 m below it, and nothing else is sunk", () => {
    const cut = section("You've Got Muscle");
    let sunk = 0;
    for (let s = cut.from; s < cut.to; s += 2) if (main.heightAtBuilder(s) < -DEPTH + 0.5) sunk += 2;
    expect(sunk).toBeGreaterThan(80);
    const sp = main.spline;
    for (let k = 0; k < sp.count; k++) {
      if (!main.cut[k]) continue;
      expect(["Weak and Organic", "You've Got Muscle", 'Steel Bone']).toContain(sectionAt(main.toBuilder(sp.dist[k])).name);
      expect(main.wallHeight[k]).toBeGreaterThan(-main.heightAt(sp.dist[k]));
    }
    const bone = crossings(track).find((c) => c.upper === 'Steel Bone')!;
    expect(bone.dy).toBeGreaterThan(DEPTH + STEEL - 1);
    expect(def.landmarks.some((l) => l.kind === 'steelBone')).toBe(true);
  });

  it("leaps a synapse: You've Got Gaps, a gap that a 100cc kart at full speed clears", () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const gaps = section("You've Got Gaps");
    expect(a > gaps.from && z < gaps.to).toBe(true);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
    expect(def.landmarks.some((l) => l.kind === 'synapseGap' && l.s > a && l.s < z)).toBe(true);
  });

  it("dissolves Supersede's paint off the end of its deck: a crest, and down", () => {
    const deck = section('Supersede');
    expect(main.heightAtBuilder(deck.to - 5)).toBeGreaterThan(8);
    const acetone = section('Paint to Acetone');
    expect(main.heightAtBuilder(acetone.from + 60)).toBeLessThan(2);
    expect(def.landmarks.some((l) => l.kind === 'acetone' && l.s >= acetone.from - 1 && (l.to ?? 0) <= acetone.to)).toBe(true);
  });

  it("starts at the gate, and the king's eye watches from the bulb the road swings round", () => {
    expect(def.landmarks.filter((l) => l.s < 20 && l.ribbon === -1).map((l) => l.kind)).toEqual(['knownGate']);
    const eye = def.landmarks.find((l) => l.kind === 'kingsEye')!;
    const king = section('Cut the Eyes from the King');
    expect(eye.s).toBeGreaterThan(king.from);
    // In the bulb: well clear of the main road and of the shortcut across it.
    const p = pointAt(track.spline, track.mainS(eye.s));
    const x = p.x - p.tz * (eye.lateral ?? 0);
    const z = p.z + p.tx * (eye.lateral ?? 0);
    const hit = nearestOnSpline(track.spline, x, z);
    expect(hit.distance - main.halfWidthAt(hit)).toBeGreaterThan(10);
    const short = track.branches[0];
    const b = nearestOnSpline(short.spline, x, z);
    expect(b.distance - short.halfWidthAt(b)).toBeGreaterThan(6);
    expect(def.landmarks.some((l) => l.kind === 'busTrace')).toBe(true);
  });

  it("stands each node's landmark in the middle of the loop round it, and the eye in the middle of the bulb", () => {
    const centred = (kind: string, r: number) => {
      const marks = def.landmarks.filter((l) => l.kind === kind);
      expect(marks.length, kind).toBeGreaterThan(0);
      for (const l of marks) {
        const p = pointAt(track.spline, track.mainS(l.s));
        const x = p.x - p.tz * (l.lateral ?? 0);
        const z = p.z + p.tx * (l.lateral ?? 0);
        // The road all round it, `r` away, for a good way either side.
        for (let d = -25; d <= 25; d += 5) {
          const q = pointAt(track.spline, track.mainS(l.s + d));
          expect(Math.hypot(q.x - x, q.z - z), `${kind} at ${d}`).toBeCloseTo(r, 0);
        }
      }
    };
    centred('mainframe', NET.r);
    centred('viaPad', BONE.r);
    centred('kingsEye', KING_R);
    expect(BIND.r).toBe(BONE.r);
  });
});

describe('All Is Known, the shortcut: a bare trace across the bulb', () => {
  const k = def.branches.findIndex((b) => b.name === 'All Is Known');
  const bdef = def.branches[k];
  const branch = track.branches[k];
  const two: LapContext = { lap: 2, lastLap: false };

  it('leaves the main road before the bulb, and meets it again after it at the same pose', () => {
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
    expect(bdef.mainFrom).toBeGreaterThanOrEqual(section('Cut the Eyes from the King').from);
    expect(bdef.mainTo).toBeLessThanOrEqual(section('The Fourth Cone').to);
  });

  it('runs over the etched-out board, clear of the main road and in bounds', () => {
    const sp = branch.spline;
    expect(def.pits.some((p) => Array.from({ length: sp.count }, (_, i) => i).some((i) => inPit(p, sp.px[i], sp.pz[i])))).toBe(true);
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 30 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 30 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(2);
    }
    expect(def.landmarks.some((l) => l.kind === 'busTrace' && l.ribbon === k)).toBe(true);
  });

  it('puts a row of double item boxes on it', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('is there from lap 2: once round, all is known; on the first lap, drive on and you fall', () => {
    expect(bdef.openOn).toEqual([2, 'final']);
    const p = kartParams(first.stats, '150cc');
    expect(drive(branch, bdef.mainTo, p, undefined, two).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 1, lastLap: false }).fell).toBe(true);
  });

  it('saves 0.8 to 2.5 s at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p, undefined, two);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, two);
    console.log(`All Is Known: the shortcut ${via.time.toFixed(2)} s, round the bulb ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.8);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('All Is Known elevation and driving', () => {
  const heights = Array.from({ length: Math.ceil(track.length) }, (_, s) => main.heightAt(s));
  const lips = kickerLips(def);
  const ramps = (b: number) => lips.some((l) => b > l - 9 && b < l + 2) || def.main.gaps.some(([a, z]) => b > a - 20 && b < z + 2);

  it('has two kickers on the way out of the input node that launch a kart at 100cc and land it on the road', () => {
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

  it('keeps the muscle clear of pits, so the ground opens cleanly round it', () => {
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

  it('gives a fast kart airtime off the end of the deck, and laps it at 150cc with no falls', () => {
    const race = new Race(track);
    const kart = race.addKart(RACERS[0], '150cc', null);
    race.time = 0;
    let respawns = 0;
    const crests: number[] = [];
    let t = 0;
    for (; t < 200 && kart.laps.lap < 1; t += PHYSICS_DT) {
      const s = kart.state;
      const ev = race.step(PHYSICS_DT, [steerAlong(main, s, kart.progressS)])[0];
      if (kart.respawned) respawns++;
      const b = main.toBuilder(kart.progressS);
      if (ev.launched && !lips.some((l) => Math.abs(b - l) < 6) && !def.main.gaps.some(([a, z]) => b > a - 4 && b < z + 4)) crests.push(b);
    }
    console.log(`All Is Known: a lap in ${t.toFixed(1)} s, crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const acetone = section('Paint to Acetone');
    expect(crests.some((b) => b > acetone.from - 10 && b < acetone.from + 60)).toBe(true);
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

describe('sweepers: street sweepers crossing the road one after another', () => {
  const h = new HazardSystem(track);
  const sweepers = () => h.poses.filter((q) => q.kind === 'sweepers');
  const hdef = def.hazards.find((q) => q.kind === 'sweepers')!;

  it('sweep the streets, clear of the deck over them', () => {
    expect(hdef).toBeDefined();
    if (!('at' in hdef)) throw new Error('no sweepers');
    expect(hdef.at.length).toBeGreaterThanOrEqual(3);
    for (const s of hdef.at) {
      expect(sectionAt(s).name).toBe('Sweep the Streets');
      expect(main.heightAtBuilder(s)).toBeCloseTo(0, 1);
      // Nothing over them: the deck's well behind.
      const p = pointAt(track.spline, track.mainS(s));
      expect(Math.hypot(p.x - CROSS.x, p.z - CROSS.z)).toBeGreaterThan(30);
    }
  });

  it('park off one edge, then cross the whole road at a steady pace to the other, and come back the next time', () => {
    const reach = 10;
    expect(sweeperAcross(0, reach)).toBe(-reach);
    expect(sweeperAcross(SWEEP_STAGES.go - 0.01, reach)).toBe(-reach);
    expect(sweeperAcross(SWEEP_STAGES.done, reach)).toBe(reach);
    const mid = (SWEEP_STAGES.go + SWEEP_STAGES.done) / 2;
    expect(sweeperAcross(mid, reach)).toBeCloseTo(0, 6);
    const a = sweeperAcross(SWEEP_STAGES.go + 0.05, reach);
    const b = sweeperAcross(SWEEP_STAGES.go + 0.1, reach);
    const c = sweeperAcross(SWEEP_STAGES.go + 0.15, reach);
    expect(b - a).toBeCloseTo(c - b, 6);
    // Parked off the road, clear of it; and on the road only while crossing.
    for (let t = 0; t < 30; t += 0.1) {
      h.update(t);
      for (const p of sweepers()) {
        const lat = lateral(p);
        expect(Math.abs(lat - p.gap)).toBeLessThan(0.05);
        if (p.phase < SWEEP_STAGES.go) {
          expect(p.active).toBe(false);
          expect(Math.abs(lat)).toBeGreaterThan(p.radius - SWEEP_PARK + SWEEP_HALF);
        }
        if (p.active) expect(p.phase).toBeGreaterThanOrEqual(SWEEP_STAGES.go);
      }
    }
    // Each sweeper alternates: the way it goes this time is back the way it came last time.
    const sides: number[] = [];
    if (!('at' in hdef)) throw new Error('no sweepers');
    for (let c = 0; c < 4; c++) {
      h.update(c * hdef.period + 0.6 * hdef.period - 10);
      sides.push(sweepers()[0].side);
    }
    expect(new Set(sides.map((s, k) => s * (k % 2 ? -1 : 1))).size).toBe(1);
  });

  it('go one after another down the street', () => {
    h.update(13.7);
    const phases = sweepers().map((p) => p.phase);
    for (let k = 1; k < phases.length; k++) expect((((phases[k] - phases[k - 1]) % 1) + 1) % 1).toBeCloseTo(0.25, 5);
  });

  it('sweep you aside if they catch you: spun, and shoved the way they go', () => {
    const p = when(h, (q) => q.active && Math.abs(q.gap) < 3);
    const kart = kartAt(p);
    kart.speed = 25;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'sweepers' });
    expect(kart.spinTime).toBeGreaterThan(0);
    // Shoved toward the edge it's heading for (a lateral to the right is (-cos h, sin h)).
    const shove = kart.extX * -Math.cos(p.heading) + kart.extZ * Math.sin(p.heading);
    expect(Math.sign(shove)).toBe(p.side);
    // On a deck over it, or while it's parked: nothing.
    const over = kartAt(p);
    over.y += 8;
    expect(h.collide([over], PHYSICS_DT)).toEqual([]);
    const parked = when(h, (q) => q.phase < SWEEP_STAGES.warn);
    expect(h.collide([kartAt(parked)], PHYSICS_DT)).toEqual([]);
  });

  it('tow you on in the clean wake just behind them, the road they have this moment swept: a boost', () => {
    const p = when(h, (q) => q.active && Math.abs(q.gap) < 3);
    const behind = (d: number) => {
      const lat = p.gap - p.side * d;
      const s = createKartState(p.ax - Math.cos(p.heading) * lat, p.az + Math.sin(p.heading) * lat, p.heading);
      s.y = s.groundY = p.ground;
      s.speed = 25;
      return s;
    };
    const kart = behind(SWEEP_HALF + SWEEP_WAKE / 2);
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'sweepers', good: true });
    expect(kart.boostTime).toBeCloseTo(SWEEP_BOOST);
    expect(kart.spinTime).toBe(0);
    // Ahead of it, on the road it's about to sweep: nothing yet.
    const ahead = behind(-(SWEEP_HALF + SWEEP_WAKE / 2) - 1.5);
    expect(h.collide([ahead], PHYSICS_DT)).toEqual([]);
    // Too far along the road from it: no wake.
    const wide = behind(SWEEP_HALF + 2);
    wide.x += Math.sin(p.heading) * (SWEEP_DEPTH + 3);
    wide.z += Math.cos(p.heading) * (SWEEP_DEPTH + 3);
    expect(h.collide([wide], PHYSICS_DT)).toEqual([]);
  });

  it('are where they are by race time alone', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    for (let t = 0; t <= 12.3; t += 0.7) b.update(t);
    b.update(12.3);
    const pa = a.poses.filter((q) => q.kind === 'sweepers');
    const pb = b.poses.filter((q) => q.kind === 'sweepers');
    pa.forEach((p, i) => {
      expect(p.x).toBeCloseTo(pb[i].x, 6);
      expect(p.z).toBeCloseTo(pb[i].z, 6);
      expect(p.side).toBe(pb[i].side);
    });
  });
});

/** A pose's lateral from the centreline point it sits by (to the right is positive). */
function lateral(p: HazardPose): number {
  return (p.x - p.ax) * -Math.cos(p.heading) + (p.z - p.az) * Math.sin(p.heading);
}

/** Steps race time until a sweeper is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.02) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'sweepers' && ok(q));
    if (p) return p;
  }
  throw new Error('no sweeper in that stage');
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

/** Where the main road crosses itself: for each crossing, which road is over which, the least height between them, and where. */
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
    return { dy, upper: sectionAt(upperS).name, lower: sectionAt(lowerS).name, upperS, lowerS, lowerY: t.main.heightAt(sp.dist[low]), x: sp.px[i], z: sp.pz[i] };
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
