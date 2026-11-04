import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { HazardSystem, WANDER_COUNT, WANDER_OUT, WANDER_SLOW, WANDER_WARM, WANDER_WOBBLE, isSheet, wanderPhase, wanderStep, wanderYou, type HazardPose } from '../src/items/hazards';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { DEPTH, LOOP_R, RISE, WANDER_PERIOD, buildEmpty } from '../src/tracks/empty';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildEmpty();
const track = new Track(def);
const main = track.main;
/** A section by name: a name the road keeps across a deck is one section, from where it starts to where it ends. */
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];
const NATURAL = 'Feeling So Empty';
const REVERSE = "I Don't Feel Empty When I'm With You";

describe('Empty', () => {
  it("is the All Stars Cup #2's third, on a pale road", () => {
    const cup = CUPS.find((c) => c.id === 'all-stars-2')!;
    expect(TRACK_LIST[cup.tracks[2]].id).toBe('empty');
    expect(cup.tracks.length).toBe(4);
    expect(TRACK_SONGS.empty.title).toBe('Empty');
    expect(def.theme).toBe('emptiness');
    expect(def.music).toEqual({ lap: 'empty', finalLap: 'empty-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('pale');
  });

  it('runs through the song in order, from empty to what I got myself into', () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      'Empty',
      'Life Is Nothing Like It Used to Be',
      'People Used to Be So Nice to Me',
      NATURAL,
      'There Is Nothing Deep Inside of Me',
      'Love Is Nothing Like It Used to Be',
      'Life Is Death',
      'Shot It Through Its Head',
      'Wandering Around So Lazily',
      'And Now I Know',
      'Never Set It in Stone',
      REVERSE,
      'You Level Me Too',
      'Who? Empty',
      'What I Got Myself Into',
    ]);
    const length = track.length;
    console.log(`Empty: ${length.toFixed(0)} m a lap`);
    // Three laps a race, the length of the cup's others.
    expect(length).toBeGreaterThan(2400);
    expect(length).toBeLessThan(2720);
    expect(def.laps).toBe(3);
  });

  it("is a waltz in tiers: each lobe's turn rises back over its own way in, and the level road crosses the middle over the cut", () => {
    const over = crossings(track);
    const pairs = new Set(over.map((c) => `${c.upper} over ${c.lower}`));
    expect([...pairs].sort()).toEqual([`${NATURAL} over People Used to Be So Nice to Me`, `${REVERSE} over Never Set It in Stone`, 'You Level Me Too over There Is Nothing Deep Inside of Me'].sort());
    for (const c of over) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(6);
      expect(sectionAt(c.upperS).bridge, c.upper).toBe(true);
    }
    for (const name of [NATURAL, REVERSE]) {
      const loop = over.find((q) => q.upper === name)!;
      expect(loop.upperY).toBeCloseTo(RISE, 0);
      expect(loop.lowerY).toBeCloseTo(0, 0);
    }
    const middle = over.find((q) => q.upper === 'You Level Me Too')!;
    expect(middle.upperY).toBeCloseTo(0, 0);
    expect(middle.lowerY).toBeLessThan(-DEPTH + 0.5);
  });

  it('turns right round the north loop and left round the south, a natural turn and a reverse turn', () => {
    const turn = (name: string) => {
      const sp = main.spline;
      const sec = section(name);
      let total = 0;
      for (let i = 0; i < sp.count; i++) {
        const b = main.toBuilder(sp.dist[i]);
        if (b < sec.from || b > sec.from + LOOP_R * ((3 * Math.PI) / 2) - 1) continue;
        const j = (i + 1) % sp.count;
        total += wrapAngle(Math.atan2(sp.tx[j], sp.tz[j]) - Math.atan2(sp.tx[i], sp.tz[i]));
      }
      return (total * 180) / Math.PI;
    };
    // Positive is a left turn.
    expect(turn(NATURAL)).toBeCloseTo(-270, -1);
    expect(turn(REVERSE)).toBeCloseTo(270, -1);
  });

  it('flies a fast kart off the crest of each loop, and lands it on the road', () => {
    for (const name of [NATURAL, REVERSE]) {
      const sec = section(name);
      let top = 0;
      for (let s = sec.from; s < sec.to; s += 1) top = Math.max(top, main.heightAtBuilder(s));
      expect(top, name).toBeCloseTo(RISE, 1);
    }
  });

  it('shot it through its head: a leap over the hole a 100cc kart at full speed clears', () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const shot = section('Shot It Through Its Head');
    expect(a > shot.from && z < shot.to).toBe(true);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });

  it('sinks There Is Nothing Deep Inside of Me into a walled cut under the level road, and nothing else is sunk', () => {
    const cut = section('There Is Nothing Deep Inside of Me');
    let sunk = 0;
    for (let s = cut.from; s < cut.to; s += 2) if (main.heightAtBuilder(s) < -DEPTH + 0.5) sunk += 2;
    expect(sunk).toBeGreaterThan(50);
    const sp = main.spline;
    for (let k = 0; k < sp.count; k++) {
      if (!main.cut[k]) continue;
      expect(sectionAt(main.toBuilder(sp.dist[k])).name).toBe('There Is Nothing Deep Inside of Me');
      expect(main.wallHeight[k]).toBeGreaterThan(-main.heightAt(sp.dist[k]));
    }
  });

  it('keeps the whole lap in bounds', () => {
    for (const r of [main, ...track.branches]) {
      const sp = r.spline;
      for (let i = 0; i < sp.count; i++) expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i])) + r.halfWidth[i]).toBeLessThan(def.bounds - 15);
    }
  });

  it('starts under the metronome, and has the empty stage, the shot clock, the one you are with and the works', () => {
    expect(def.landmarks.filter((l) => l.s < 20 && l.ribbon === -1).map((l) => l.kind)).toEqual(['metronome']);
    for (const kind of ['emptyStage', 'shotClock', 'companion', 'setInStone'] as const) expect(def.landmarks.some((l) => l.kind === kind), kind).toBe(true);
    // The stage and the one you're with stand in the middle of their loops, well clear of the road.
    for (const kind of ['emptyStage', 'companion'] as const) {
      const lm = def.landmarks.find((l) => l.kind === kind)!;
      const p = pointAt(track.spline, track.mainS(lm.s));
      const fx = p.x - p.tz * lm.lateral!;
      const fz = p.z + p.tx * lm.lateral!;
      expect(nearestOnSpline(track.spline, fx, fz).distance, kind).toBeGreaterThan(LOOP_R - 2);
    }
  });
});

describe('Set in Stone, straight through the works', () => {
  const k = def.branches.findIndex((b) => b.name === 'Set in Stone');
  const bdef = def.branches[k];
  const branch = track.branches[k];
  const open: LapContext = { lap: 2, lastLap: false };

  it('leaves where the road swings out round the works and meets it again past them, at the same pose', () => {
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
    for (const end of [bdef.sections[0], bdef.sections[bdef.sections.length - 1]]) expect(end.wallHeight ?? 0).toBe(0);
    for (const s of [bdef.mainFrom, bdef.mainTo]) expect(def.main.sections.filter((q) => s >= q.from && s <= q.to).every((q) => (q.wallHeight ?? 0) === 0)).toBe(true);
    expect(sectionAt(bdef.mainFrom + 1).name).toBe('Never Set It in Stone');
    expect(sectionAt(bdef.mainTo - 1).name).toBe('Never Set It in Stone');
    expect(def.landmarks.some((l) => l.kind === 'setInStone' && l.ribbon === k)).toBe(true);
  });

  it('runs over the pour, clear of the main road', () => {
    const sp = branch.spline;
    const pour = def.pits.find((p) => inPit(p, sp.px[Math.floor(sp.count * 0.5)], sp.pz[Math.floor(sp.count * 0.5)]))!;
    expect(pour).toBeDefined();
    expect(pour.liquid).toBe('water');
    for (let i = 0; i < sp.count; i++) {
      if (sp.dist[i] < 40 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 40 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(3);
    }
    const msp = main.spline;
    const fx = Math.sin(pour.heading);
    const fz = Math.cos(pour.heading);
    for (let i = 0; i < msp.count; i++) {
      const dx = msp.px[i] - pour.x;
      const dz = msp.pz[i] - pour.z;
      const along = Math.max(0, Math.abs(dx * fx + dz * fz) - pour.halfLength);
      const across = Math.max(0, Math.abs(-dx * fz + dz * fx) - pour.halfWidth);
      expect(Math.hypot(along, across) - main.halfWidth[i]).toBeGreaterThan(2);
    }
  });

  it('puts a double item box over the pour', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('is wet on lap 1, sunk in the pour, and set hard from lap 2', () => {
    expect(bdef.openOn).toEqual([2, 'final']);
    expect(bdef.shut).toEqual({ kind: 'flood' });
    const p = kartParams(first.stats, '150cc');
    expect(drive(branch, bdef.mainTo, p, undefined, open).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 3, lastLap: true }).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 1, lastLap: false }).fell).toBe(true);
  });

  it('saves 0.8 to 2.5 s at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p, undefined, open);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, open);
    console.log(`Empty: Set in Stone ${via.time.toFixed(2)} s, round the works ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.8);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('Empty elevation and driving', () => {
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

  it('gives a fast kart airtime off both loops, and laps it at 150cc with no falls', () => {
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
    console.log(`Empty: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    for (const name of [NATURAL, REVERSE]) {
      const sec = section(name);
      expect(crests.some((b) => b > sec.from && b < sec.to + 40), name).toBe(true);
    }
  }, 30000);

  it('a full field of 150cc CPUs laps it, the leader in a minute and a bit a lap', () => {
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
    console.log(`Empty: the leader home in ${leader.toFixed(1)} s (${(leader / def.laps).toFixed(1)} s a lap), the last in ${t.toFixed(1)} s, ${respawns} respawns`);
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(def.laps);
    expect(respawns).toBeLessThanOrEqual(2 * def.laps);
    expect(leader / def.laps).toBeGreaterThan(60);
    expect(leader / def.laps).toBeLessThan(70);
  }, 120000);
});

describe('wanderers: the empty and the one you are with, drifting across the road in three-four', () => {
  const h = new HazardSystem(track);
  const q = def.hazards.find((d) => d.kind === 'wanderers')!;
  const figures = () => h.poses.filter((p) => p.kind === 'wanderers');

  it('wander across Wandering Around So Lazily, three to a row, one in each row the one you are with', () => {
    expect(def.hazards.length).toBe(1);
    if (!('at' in q) || !('period' in q)) throw new Error('no wanderers');
    expect(q.period).toBe(WANDER_PERIOD);
    expect(q.at.length % WANDER_COUNT).toBe(0);
    const rows = q.at.length / WANDER_COUNT;
    expect(rows).toBeGreaterThanOrEqual(3);
    for (const s of q.at) expect(sectionAt(s).name).toBe('Wandering Around So Lazily');
    for (let r = 0; r < rows; r++) {
      const row = q.at.slice(r * WANDER_COUNT, (r + 1) * WANDER_COUNT);
      expect(new Set(row).size).toBe(1);
      expect(Array.from({ length: WANDER_COUNT }, (_, k) => wanderYou(r, k)).filter(Boolean).length).toBe(1);
    }
    expect(isSheet('wanderers')).toBe(false);
  });

  it('step on the one of each bar and stand on the two and three, spread evenly across the road', () => {
    // Across from one side to the other, never going back.
    expect(wanderStep(0)).toBe(0);
    expect(wanderStep(0.9999)).toBeCloseTo(1, 2);
    for (let u = 0; u < 0.999; u += 0.003) expect(wanderStep(u + 0.003)).toBeGreaterThanOrEqual(wanderStep(u) - 1e-9);
    // Standing still through the two and three of a bar.
    const bar = 1 / 8;
    expect(wanderStep(bar * 2 + bar * 0.5)).toBeCloseTo(wanderStep(bar * 2 + bar * 0.95), 9);
    expect(wanderStep(bar * 2 + bar * 0.2)).toBeLessThan(wanderStep(bar * 2 + bar * 0.5));
    // A row's three are a third of a crossing apart.
    for (const t of [0, 3.3, 17.1]) {
      const u = [0, 1, 2].map((k) => wanderPhase(t, WANDER_PERIOD, 0, k));
      const d = [(u[1] - u[0] + 1) % 1, (u[2] - u[1] + 1) % 1];
      for (const x of d) expect(x).toBeCloseTo(1 / 3, 6);
    }
  });

  it('come out of nothing past one edge and fade into nothing past the other', () => {
    for (let t = 0; t < 30; t += 0.25) {
      h.update(t);
      for (const p of figures()) {
        const lat = (p.x - p.ax) * -Math.cos(p.heading) + (p.z - p.az) * Math.sin(p.heading);
        const hw = track.main.halfWidthAtS(nearestOnSpline(track.spline, p.ax, p.az).s);
        expect(Math.abs(lat)).toBeLessThanOrEqual(hw + WANDER_OUT + 1e-6);
        if (Math.abs(lat) < hw - 1) expect(p.active).toBe(true);
        if (Math.abs(lat) > hw + WANDER_OUT - 0.5) expect(p.active).toBe(false);
      }
    }
  });

  it('driven into an empty one, you go right through it and it empties you: slowed, the wheel wobbling', () => {
    const p = when(h, (x) => x.active && x.lane === 0);
    const kart = kartAt(p);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'wanderers' });
    expect(kart.speed).toBeCloseTo(30 * WANDER_SLOW, 5);
    expect(kart.wobbleTime).toBeCloseTo(WANDER_WOBBLE);
    expect(kart.spinTime).toBe(0);
    // Flying over it off the leap: nothing.
    const over = kartAt(p);
    over.y += 4;
    expect(h.collide([over], PHYSICS_DT)).toEqual([]);
  });

  it("through the one you're with, you don't feel empty: a boost", () => {
    const p = when(h, (x) => x.active && x.lane === 1);
    const kart = kartAt(p, 0.5);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'wanderers', good: true });
    expect(kart.boostTime).toBeCloseTo(WANDER_WARM);
    expect(kart.speed).toBe(30);
    expect(kart.wobbleTime).toBe(0);
  });

  it('are where they are by race time alone', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    for (let t = 0; t <= 12.3; t += 0.7) b.update(t);
    b.update(12.3);
    const pa = a.poses.filter((p) => p.kind === 'wanderers');
    const pb = b.poses.filter((p) => p.kind === 'wanderers');
    expect(pa.length).toBeGreaterThan(0);
    pa.forEach((p, i) => {
      expect(p.x).toBeCloseTo(pb[i].x, 6);
      expect(p.z).toBeCloseTo(pb[i].z, 6);
      expect(p.active).toBe(pb[i].active);
    });
  });
});

/** Steps race time until a wanderer is in a state `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.02) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'wanderers' && ok(q));
    if (p) return p;
  }
  throw new Error('no wanderer like that');
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
