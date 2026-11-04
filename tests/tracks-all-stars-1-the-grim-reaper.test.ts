import { describe, expect, it } from 'vitest';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { HazardSystem, isSheet, type HazardPose } from '../src/items/hazards';
import { HOUND_BOOST, HOUND_COUNT, HOUND_GAP, HOUND_HEAD, HOUND_LAG, HOUND_OUT, HOUND_RADIUS, HOUND_SPACING, HOUND_SPIN, HOUND_STAGES, HOUND_TAIL, houndPack, houndPhase } from '../src/kits/theGrimReaper';
import { KART_RADIUS, createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { BLADE_R, DECK, DEPTH, GRAVE, HOUND_PERIOD, ORBIT_DECK, RIDGE, buildTheGrimReaper } from '../src/tracks/theGrimReaper';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, inPit, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildTheGrimReaper();
const track = new Track(def);
const main = track.main;
/** A section by name: a name the road keeps across a deck is one section, from where it starts to where its deck ends. */
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];
const headingAt = (s: number) => {
  const p = pointAt(track.spline, track.mainS(s));
  return Math.atan2(p.tx, p.tz);
};

describe('The Grim Reaper', () => {
  it("is the All Stars Cup's third, on a road of cinders", () => {
    const cup = CUPS.find((c) => c.id === 'all-stars-1')!;
    expect(TRACK_LIST[cup.tracks[2]].id).toBe('the-grim-reaper');
    expect(TRACK_SONGS['the-grim-reaper']).toMatchObject({ title: 'The Grim Reaper', album: 'Omnium Gatherum', year: 2022 });
    expect(def.theme).toBe('grimreaper');
    expect(def.music).toEqual({ lap: 'the-grim-reaper', finalLap: 'the-grim-reaper-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('cinder');
  });

  it("runs through the song in order, from I'm the grim reaper to came to collect his debt", () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      "I'm the Grim Reaper",
      'Chimney Sweeper',
      'Gate Keeper',
      'Faster Than a Cheetah',
      'Point-Blank Range',
      'Like a Hurricane',
      'Scratching for Scraps',
      'Sipping on Cactus',
      'Unburied Hatchets',
      'The Hellhounds',
      'Existential Crisis',
      'Cashes the Cheque',
      'Heaven Sent the Silhouette',
      'Whiplash in the Fortress',
      'Body Bags on the Hills',
      'The Stench Orbits the Homestead',
      'Came to Collect His Debt',
    ]);
    const length = track.length;
    console.log(`The Grim Reaper: ${length.toFixed(0)} m a lap`);
    // Three laps a race, the length of the cup's others.
    expect(length).toBeGreaterThan(2400);
    expect(length).toBeLessThan(2750);
    expect(def.laps).toBe(3);
  });

  it('is the reaper\'s scythe seen from above: the snath a straight road from its butt to the heel, the blade a long sweep round to its point and back along its edge', () => {
    // The snath: one heading all the way up, from the start through the gate keeper's stretch.
    const snath = [section("I'm the Grim Reaper"), section('Chimney Sweeper'), section('Gate Keeper')];
    const h0 = headingAt(snath[0].from + 1);
    for (const sec of snath) for (let s = sec.from + 1; s < sec.to - 1; s += 5) expect(Math.abs(wrapAngle(headingAt(s) - h0)), `${sec.name} at ${s.toFixed(0)}`).toBeLessThan(0.01);
    const length = snath[2].to - snath[0].from;
    expect(length).toBeGreaterThan(300);
    // The blade's back: one long sweep, a third of a circle and more, on a wide radius.
    const back = section('Faster Than a Cheetah');
    const turned = wrapAngle(headingAt(back.to - 0.5) - headingAt(back.from + 0.5));
    expect(Math.abs(turned)).toBeGreaterThan(Math.PI * 0.6);
    expect((back.to - back.from) / Math.abs(turned)).toBeGreaterThan(BLADE_R * 0.95);
    // Round the point and back along the edge: heading back the way the blade went out.
    const edge = section('Like a Hurricane');
    const outward = headingAt(back.from + 1);
    const home = headingAt(edge.to - 1);
    expect(Math.abs(wrapAngle(home - outward - Math.PI))).toBeLessThan(1.1);
  });

  it('crosses itself in tiers: the blade\'s edge back over the snath, the snath over the hellhound pit, and the orbit back over its own way in', () => {
    const over = crossings(track);
    const pairs = new Set(over.map((c) => `${c.upper} over ${c.lower}`));
    expect([...pairs].sort()).toEqual(['Gate Keeper over The Hellhounds', 'Like a Hurricane over Gate Keeper', 'The Stench Orbits the Homestead over Body Bags on the Hills'].sort());
    for (const c of over) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(6);
      expect(sectionAt(c.upperS).bridge, c.upper).toBe(true);
    }
    const edge = over.find((q) => q.upper === 'Like a Hurricane')!;
    expect(edge.upperY).toBeCloseTo(DECK, 0);
    expect(edge.lowerY).toBeCloseTo(0, 0);
    const gate = over.find((q) => q.upper === 'Gate Keeper')!;
    expect(gate.upperY).toBeCloseTo(0, 0);
    expect(gate.lowerY).toBeLessThan(-DEPTH + 0.5);
    const orbit = over.find((q) => q.upper === 'The Stench Orbits the Homestead')!;
    expect(orbit.upperY).toBeCloseTo(ORBIT_DECK, 0);
    expect(orbit.lowerY).toBeCloseTo(0, 0);
  });

  it('sinks The Hellhounds in their pit, walled, and nothing else is sunk', () => {
    const pit = section('The Hellhounds');
    let sunk = 0;
    for (let s = pit.from; s < pit.to; s += 2) if (main.heightAtBuilder(s) < -DEPTH + 0.5) sunk += 2;
    expect(sunk / (pit.to - pit.from)).toBeGreaterThan(0.5);
    const sp = main.spline;
    for (let k = 0; k < sp.count; k++) {
      if (!main.cut[k]) continue;
      expect(sectionAt(main.toBuilder(sp.dist[k])).name).toBe('The Hellhounds');
      expect(main.wallHeight[k]).toBeGreaterThan(-main.heightAt(sp.dist[k]));
    }
  });

  it('unburied hatchets: a leap a 100cc kart at full speed clears', () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const hatchets = section('Unburied Hatchets');
    expect(a > hatchets.from && z < hatchets.to).toBe(true);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });

  it('climbs onto the ridge against the sky and flies off its crest into the fortress', () => {
    const silhouette = section('Heaven Sent the Silhouette');
    expect(main.heightAtBuilder(silhouette.to)).toBeCloseTo(RIDGE, 1);
    expect(main.heightAtBuilder(section('Whiplash in the Fortress').to)).toBeCloseTo(0, 1);
    expect(def.landmarks.some((l) => l.kind === 'wickedSun')).toBe(true);
    expect(def.landmarks.some((l) => l.kind === 'fortress')).toBe(true);
  });

  it('orbits the homestead: a loop right round it, the homestead in the middle', () => {
    const orbit = section('The Stench Orbits the Homestead');
    const lm = def.landmarks.find((l) => l.kind === 'homestead')!;
    const p = pointAt(track.spline, track.mainS(lm.s));
    const cx = p.x - p.tz * (lm.lateral ?? 0);
    const cz = p.z + p.tx * (lm.lateral ?? 0);
    // Round it, from the way in to back over it: three quarters of a circle and more at an even distance.
    let turned = 0;
    let prev = Math.atan2(p.x - cx, p.z - cz);
    let near = Infinity;
    let far = 0;
    for (let s = orbit.from; s < orbit.from + 205; s += 2) {
      const q = pointAt(track.spline, track.mainS(s));
      const a = Math.atan2(q.x - cx, q.z - cz);
      turned += wrapAngle(a - prev);
      prev = a;
      const d = Math.hypot(q.x - cx, q.z - cz);
      near = Math.min(near, d);
      far = Math.max(far, d);
    }
    expect(Math.abs(turned)).toBeGreaterThan(Math.PI * 1.4);
    expect(far - near).toBeLessThan(6);
  });

  it('keeps its landmarks off the road: the reaper in the crook of his blade, the bank, the homestead', () => {
    for (const kind of ['reaperMC', 'chequeBank', 'homestead'] as const) {
      const lm = def.landmarks.find((l) => l.kind === kind)!;
      const p = pointAt(track.spline, track.mainS(lm.s));
      const x = p.x - p.tz * (lm.lateral ?? 0);
      const z = p.z + p.tx * (lm.lateral ?? 0);
      const hit = nearestOnSpline(track.spline, x, z);
      expect(hit.distance - main.halfWidthAt(hit), kind).toBeGreaterThan(12);
    }
    // The reaper stands inside the blade, between its back and its edge.
    const lm = def.landmarks.find((l) => l.kind === 'reaperMC')!;
    expect(lm.lateral!).toBeLessThan(0);
  });

  it('starts under the scythe, between the speaker stacks', () => {
    expect(def.landmarks.filter((l) => l.s < 20 && l.ribbon === -1).map((l) => l.kind)).toEqual(['scytheGate']);
  });

  it('stays inside its bounds', () => {
    const sp = track.spline;
    for (let i = 0; i < sp.count; i++) expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i])) + main.halfWidth[i]).toBeLessThan(def.bounds - 10);
  });
});

describe('Time Is Priceless, straight across the existential crisis over the open grave', () => {
  const k = def.branches.findIndex((b) => b.name === 'Time Is Priceless');
  const bdef = def.branches[k];
  const branch = track.branches[k];
  const last: LapContext = { lap: 3, lastLap: true };

  it('leaves the road at the foot of the crisis and meets it again at its end, at the same pose', () => {
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
    const crisis = section('Existential Crisis');
    expect(bdef.mainFrom > crisis.from && bdef.mainTo < crisis.to).toBe(true);
    expect(def.landmarks.some((l) => l.kind === 'openGrave' && l.ribbon === k)).toBe(true);
  });

  it('runs over the open grave on planks, clear of the main road and in bounds', () => {
    const sp = branch.spline;
    const grave = def.pits.find((p) => inPit(p, sp.px[Math.floor(sp.count * 0.42)], sp.pz[Math.floor(sp.count * 0.42)]))!;
    expect(grave).toBeDefined();
    expect(2 * grave.halfLength).toBeCloseTo(GRAVE, 0);
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 40 * ROAD_WIDTH_SCALE || sp.dist[i] > sp.length - 40 * ROAD_WIDTH_SCALE) continue;
      const hit = nearestOnSpline(track.spline, sp.px[i], sp.pz[i]);
      expect(hit.distance - main.halfWidthAt(hit) - branch.halfWidth[i]).toBeGreaterThan(4);
    }
    const msp = main.spline;
    const fx = Math.sin(grave.heading);
    const fz = Math.cos(grave.heading);
    for (let i = 0; i < msp.count; i++) {
      const dx = msp.px[i] - grave.x;
      const dz = msp.pz[i] - grave.z;
      const along = Math.max(0, Math.abs(dx * fx + dz * fz) - grave.halfLength);
      const across = Math.max(0, Math.abs(-dx * fz + dz * fx) - grave.halfWidth);
      expect(Math.hypot(along, across) - main.halfWidth[i]).toBeGreaterThan(2);
    }
  });

  it('puts a double item box over the grave', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });

  it('is there on the final lap only: before that, drive on and you fall in the grave', () => {
    expect(bdef.openOn).toEqual(['final']);
    const p = kartParams(first.stats, '150cc');
    expect(drive(branch, bdef.mainTo, p, undefined, last).fell).toBe(false);
    expect(drive(branch, bdef.mainTo, p, undefined, { lap: 2, lastLap: false }).fell).toBe(true);
  });

  it('saves 0.8 to 2.5 s at 150cc', () => {
    const p = kartParams(first.stats, '150cc');
    const via = drive(branch, bdef.mainTo, p, undefined, last);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, last);
    console.log(`The Grim Reaper: Time Is Priceless ${via.time.toFixed(2)} s, the crisis ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.8);
    expect(via.time).toBeGreaterThan(round.time - 2.5);
  });
});

describe('The Grim Reaper elevation and driving', () => {
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

  it('keeps its pit clear of other pits, so the ground opens cleanly round it', () => {
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

  it('gives a fast kart airtime off the ridge, and laps it at 150cc with no falls', () => {
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
    console.log(`The Grim Reaper: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const silhouette = section('Heaven Sent the Silhouette');
    const fortress = section('Whiplash in the Fortress');
    expect(crests.some((b) => b > silhouette.to - 10 && b < fortress.to)).toBe(true);
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
    console.log(`The Grim Reaper: the leader home in ${leader.toFixed(1)} s, the last in ${t.toFixed(1)} s, ${respawns} respawns`);
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(def.laps);
    expect(respawns).toBeLessThanOrEqual(2 * def.laps);
    expect(leader / def.laps).toBeGreaterThan(60);
    expect(leader / def.laps).toBeLessThan(70);
  }, 120000);
});

describe('hellhounds: packs sniffing out stitches across their pit, and the gap behind them', () => {
  const h = new HazardSystem(track);
  const hdef = def.hazards.find((q) => q.kind === 'hellhounds')!;
  const packs = () => h.poses.filter((q) => q.kind === 'hellhounds');

  it('run across the pit, sunk, past the gate keeper\'s bridge, three packs of three', () => {
    expect(def.hazards.map((q) => q.kind)).toEqual(['hellhounds']);
    if (!('at' in hdef)) throw new Error('no stations');
    expect(hdef.at.length).toBe(3);
    expect(HOUND_COUNT).toBe(3);
    expect('period' in hdef && hdef.period).toBe(HOUND_PERIOD);
    const bridge = section('Gate Keeper').parts.find((q) => q.bridge)!;
    for (const s of hdef.at) {
      expect(sectionAt(s).name).toBe('The Hellhounds');
      expect(main.heightAtBuilder(s)).toBeLessThan(-DEPTH + 0.5);
      // Not in the bridge's shadow: nothing up on the snath overhead.
      const p = pointAt(track.spline, track.mainS(s));
      const b = pointAt(track.spline, track.mainS((bridge.from + bridge.to) / 2));
      expect(Math.hypot(p.x - b.x, p.z - b.z)).toBeGreaterThan(25);
    }
    expect(isSheet('hellhounds')).toBe(false);
  });

  it('wait in one den, run right across into the other, nose to tail, and come back the other way next time', () => {
    const reach = 15;
    const before = houndPack(0.2, 1, reach);
    expect(before.every((q) => !q.out && q.lateral === -(reach + HOUND_OUT))).toBe(true);
    const mid = houndPack((HOUND_STAGES.run + HOUND_STAGES.gone) / 2, 1, reach);
    expect(mid.some((q) => q.out)).toBe(true);
    // Strung out behind the lead, the way they run.
    for (let k = 1; k < mid.length; k++) if (mid[k].out && mid[k - 1].out) expect(mid[k - 1].lateral - mid[k].lateral).toBeCloseTo(HOUND_SPACING, 6);
    const after = houndPack(0.9, 1, reach);
    expect(after.every((q) => !q.out && q.lateral === reach + HOUND_OUT)).toBe(true);
    // Each cycle the other way.
    const sides = [0, 1, 2, 3].map((c) => houndPhase(c * HOUND_PERIOD + 0.01, HOUND_PERIOD, 0).side);
    expect(new Set(sides).size).toBe(2);
    expect(sides[0]).toBe(-sides[1]);
  });

  it('run a beat after one another down the pit, so a kart through the gap behind one meets the next as it opens', () => {
    for (const t of [0, 3.3, 11.7]) {
      for (let i = 0; i < 2; i++) {
        const a = houndPhase(t, HOUND_PERIOD, i).u;
        const b = houndPhase(t, HOUND_PERIOD, i + 1).u;
        expect((((a - b) % 1) + 1) % 1).toBeCloseTo(HOUND_LAG, 6);
      }
    }
    if (!('at' in hdef)) throw new Error('no stations');
    const apart = track.mainS(hdef.at[1]) - track.mainS(hdef.at[0]);
    const pace = apart / (HOUND_LAG * HOUND_PERIOD);
    const fast = kartParams(first.stats, '150cc').topSpeed;
    expect(pace).toBeGreaterThan(0.75 * fast);
    expect(pace).toBeLessThan(1.25 * fast);
  });

  it('are harmless in their dens, before they run and after', () => {
    for (const ok of [(p: HazardPose) => p.phase < HOUND_STAGES.run - 0.02, (p: HazardPose) => p.phase > HOUND_STAGES.gone + 0.02]) {
      const p = when(h, ok);
      expect(p.active).toBe(false);
      for (const lat of [-10, -4, 0, 4, 10]) expect(h.collide([kartAcross(p, lat)], PHYSICS_DT)).toEqual([]);
    }
  });

  it('caught by a hound as the pack crosses, bitten and spun', () => {
    const p = when(h, (q) => q.active && houndPack(q.phase, q.side, q.gap).every((d) => d.out));
    const lead = houndPack(p.phase, p.side, p.gap)[0];
    const kart = kartAcross(p, lead.lateral, lead.along);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'hellhounds' });
    expect(kart.spinTime).toBeGreaterThan(0);
    expect(HOUND_SPIN).toBeGreaterThan(0.8);
    // Up on the snath over the pit: nothing.
    const over = kartAcross(p, lead.lateral, lead.along);
    over.y += 8;
    expect(h.collide([over], PHYSICS_DT)).toEqual([]);
    // Well along the road from the pack: nothing.
    const past = kartAcross(p, lead.lateral, lead.along + HOUND_RADIUS + KART_RADIUS + 1.5);
    expect(h.collide([past], PHYSICS_DT)).toEqual([]);
  });

  it('slipped through the gap just behind the last of the pack as it crosses: a boost', () => {
    const p = when(h, (q) => {
      if (!q.active) return false;
      const pack = houndPack(q.phase, q.side, q.gap);
      const last = pack[pack.length - 1];
      return last.out && Math.abs(last.lateral) < 4;
    });
    const pack = houndPack(p.phase, p.side, p.gap);
    const last = pack[pack.length - 1];
    const lat = last.lateral - p.side * (HOUND_TAIL + HOUND_RADIUS + HOUND_GAP / 2);
    const kart = kartAcross(p, lat, last.along);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'hellhounds', good: true });
    expect(kart.boostTime).toBeCloseTo(HOUND_BOOST);
    expect(kart.spinTime).toBe(0);
    // Too far behind them, it's just road.
    const late = kartAcross(p, last.lateral - p.side * (HOUND_TAIL + HOUND_RADIUS + HOUND_GAP + 2), last.along);
    late.speed = 30;
    expect(new HazardSystem(track).collide([late], PHYSICS_DT)).toEqual([]);
    // In front of the lead, it's a bite, not a boost.
    expect(HOUND_HEAD).toBeGreaterThan(0);
  });

  it('are where they are by race time alone', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    for (let t = 0; t <= 12.3; t += 0.7) b.update(t);
    b.update(12.3);
    const pa = a.poses.filter((q) => q.kind === 'hellhounds');
    const pb = b.poses.filter((q) => q.kind === 'hellhounds');
    expect(pa.length).toBe(3);
    pa.forEach((p, i) => {
      expect(p.x).toBeCloseTo(pb[i].x, 6);
      expect(p.phase).toBeCloseTo(pb[i].phase, 6);
      expect(p.active).toBe(pb[i].active);
    });
    expect(packs().length).toBe(3);
  });

  it('show the CPUs where the pack is as it runs, so they can steer for the gap', () => {
    const p = when(h, (q) => q.active);
    const out: { x: number; z: number; r: number; vx: number; vz: number }[] = [];
    h.obstacles(out);
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 2)).toBe(true);
  });
});

/** Steps race time until a pack is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.01) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'hellhounds' && ok(q));
    if (p) return p;
  }
  throw new Error('no pack in that stage');
}

/** A kart sitting on the road at a pack's station, `lateral` to the right of the road's middle and `along` the road. */
function kartAcross(p: HazardPose, lateral: number, along = 0): KartState {
  const x = p.ax - Math.cos(p.heading) * lateral + Math.sin(p.heading) * along;
  const z = p.az + Math.sin(p.heading) * lateral + Math.cos(p.heading) * along;
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
