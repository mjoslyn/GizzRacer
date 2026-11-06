import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { HazardSystem, isSheet, type HazardPose } from '../src/items/hazards';
import { BPM, PRESS_BOOST, PRESS_DARE, PRESS_HIT, PRESS_LANES, PRESS_ORDER, laneAt, pressBeat, pressDared, pressDown, pressLane } from '../src/kits/automation';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { FIELD_SECTIONS } from '../src/render/automation';
import { DECK, PRESS_PERIOD, buildAutomation } from '../src/tracks/automation';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, type LapContext, type Ribbon } from '../src/tracks/track';

const def = buildAutomation();
const track = new Track(def);
const main = track.main;
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];
const sectionAt = (s: number) => def.main.sections.find((q) => s >= q.from && s <= q.to)!;

describe('Automation', () => {
  it("is the K.G. Cup's first, on a conveyor belt", () => {
    expect(CUPS.find((c) => c.id === 'kg')!.tracks.map((i) => TRACK_LIST[i].id)[0]).toBe('automation');
    expect(TRACK_SONGS.automation).toMatchObject({ title: 'Automation', year: 2020 });
    expect(def.theme).toBe('automated');
    expect(def.music).toEqual({ lap: 'automation', finalLap: 'automation-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('conveyor');
  });

  it('runs through the song in order, from clocking in to clocking out', () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      'Clocking In',
      'The Production Line',
      'Arms That Never Tire',
      'Nobody at the Desk',
      'Screens Watching Screens',
      'Machines Building Machines',
      'The Algorithm Decides',
      'Pink Slips',
      'The Server Farm',
      'Lights-Out Factory',
      'Clocking Out',
    ]);
    console.log(`Automation: ${track.length.toFixed(0)} m a lap`);
    expect(track.length).toBeGreaterThan(2400);
    expect(track.length).toBeLessThan(2700);
    expect(def.laps).toBe(3);
  });

  it('crosses the production line once, on the overhead deck high over it', () => {
    const sp = track.spline;
    const found: { i: number; j: number; dy: number }[] = [];
    for (let i = 0; i < sp.count; i += 2) {
      for (let j = i; j < sp.count; j += 2) {
        const along = sp.dist[j] - sp.dist[i];
        if (Math.min(along, sp.length - along) < 120) continue;
        if (Math.hypot(sp.px[i] - sp.px[j], sp.pz[i] - sp.pz[j]) > 4) continue;
        const dy = Math.abs(main.heightAt(sp.dist[i]) - main.heightAt(sp.dist[j]));
        const near = found.find((c) => Math.abs(sp.dist[c.i] - sp.dist[i]) < 60 && Math.abs(sp.dist[c.j] - sp.dist[j]) < 60);
        if (near) near.dy = Math.min(near.dy, dy);
        else found.push({ i, j, dy });
      }
    }
    expect(found.length).toBe(1);
    const [c] = found;
    expect(c.dy).toBeGreaterThan(DECK - 1);
    const [upper, lower] = main.heightAt(sp.dist[c.i]) > main.heightAt(sp.dist[c.j]) ? [c.i, c.j] : [c.j, c.i];
    expect(sectionAt(main.toBuilder(sp.dist[upper])).name).toBe('Machines Building Machines');
    expect(sectionAt(main.toBuilder(sp.dist[upper])).bridge).toBe(true);
    expect(sectionAt(main.toBuilder(sp.dist[lower])).name).toBe('The Production Line');
    // The deck is level over the line, and only the deck and its ramps leave the ground.
    for (let s = section('Machines Building Machines').from + 100; s < section('Machines Building Machines').to - 5; s += 10) expect(main.heightAtBuilder(s)).toBeCloseTo(DECK, 0);
    for (const q of def.main.sections) {
      if (q.name === 'Machines Building Machines' || q.name === 'The Algorithm Decides') continue;
      for (let s = q.from; s < q.to; s += 10) expect(Math.abs(main.heightAtBuilder(s)), q.name).toBeLessThan(0.5);
    }
  });

  it('lays its full rows of item boxes eight across, and a double box on the override', () => {
    const rows = def.itemBoxes.filter((r) => r.ribbon === undefined || r.ribbon === -1);
    expect(rows.filter((r) => r.count >= 4).length).toBeGreaterThanOrEqual(4);
    for (const r of rows) expect([3, 8]).toContain(r.count);
    expect(def.itemBoxes.some((r) => r.ribbon === 0 && r.double)).toBe(true);
  });

  it('is dressed end to end in stretches, each starting in a section the world knows, with the skyline round the lot', () => {
    const fields = def.landmarks.filter((l) => l.kind === 'factoryField').sort((a, b) => a.s - b.s);
    expect(fields.length).toBe(FIELD_SECTIONS.length);
    for (const f of fields) {
      expect(f.to, 'a field runs along the road').toBeGreaterThan(f.s + 40);
      expect(FIELD_SECTIONS).toContain(sectionAt(f.s).name);
    }
    let covered = 0;
    for (let k = 0; k < fields.length; k++) covered += Math.min(fields[k].to!, k + 1 < fields.length ? fields[k + 1].s : Infinity) - fields[k].s;
    expect(covered / track.length).toBeGreaterThan(0.93);
    expect(def.landmarks.filter((l) => l.kind === 'factorySkyline').length).toBe(1);
  });

  it('has its landmarks off the road, the time clock at the line', () => {
    expect(def.landmarks.filter((l) => l.s < 20).map((l) => l.kind)).toEqual(['timeClock']);
    for (const lm of def.landmarks) {
      if (!lm.lateral) continue;
      const p = pointAt(track.spline, track.mainS(lm.s));
      const hit = nearestOnSpline(track.spline, p.x - p.tz * lm.lateral, p.z + p.tx * lm.lateral);
      expect(hit.distance - main.halfWidthAt(hit), lm.kind).toBeGreaterThan(14);
    }
  });

  it('stays inside its bounds', () => {
    const sp = track.spline;
    for (let i = 0; i < sp.count; i++) expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i])) + main.halfWidth[i]).toBeLessThan(def.bounds - 10);
  });
});

describe('Automation walls', () => {
  // A branch's ends and the road where it leaves and joins it are one surface.
  const mouth = (r: Ribbon, i: number, m: Ribbon, j: number) => {
    const k = track.branches.indexOf(r);
    if (k < 0 || m !== main) return false;
    const b = def.branches[k];
    const s = r.spline.dist[i];
    const near = (a: number) => Math.min(Math.abs(m.spline.dist[j] - track.mainS(a)), m.spline.length - Math.abs(m.spline.dist[j] - track.mainS(a))) < 60;
    return (s < 60 && near(b.mainFrom)) || (s > r.spline.length - 60 && near(b.mainTo));
  };
  // Every pair of road samples near each other on different stretches, the upper first.
  const pairs = () => {
    const rs = [main, ...track.branches];
    const out: { up: Ribbon; i: number; low: Ribbon; j: number; gap: number }[] = [];
    rs.forEach((A, ai) => {
      for (let i = 0; i < A.spline.count; i += 2) {
        const ya = A.heightAt(A.spline.dist[i]);
        rs.forEach((B, bi) => {
          for (let j = 0; j < B.spline.count; j += 2) {
            if (ai === bi) {
              const d = Math.abs(A.spline.dist[i] - B.spline.dist[j]);
              if (Math.min(d, A.spline.length - d) < 80) continue;
            }
            if (B.heightAt(B.spline.dist[j]) >= ya - 0.3) continue;
            if (mouth(A, i, B, j) || mouth(B, j, A, i)) continue;
            const gap = Math.hypot(A.spline.px[i] - B.spline.px[j], A.spline.pz[i] - B.spline.pz[j]) - A.halfWidth[i] - B.halfWidth[j];
            if (gap < 2.5) out.push({ up: A, i, low: B, j, gap });
          }
        });
      }
    });
    return out;
  };
  const all = pairs();

  it('keeps the production line and its walls well under the deck', () => {
    expect(all.filter((p) => p.gap < 0).length).toBeGreaterThan(0);
    for (const { up, i, low, j } of all.filter((p) => p.gap < 0)) {
      const top = low.heightAt(low.spline.dist[j]) + low.wallHeight[j];
      expect(up.heightAt(up.spline.dist[i]) - top, `${up.sectionName(i)} over ${low.sectionName(j)}`).toBeGreaterThan(2);
    }
  });

  it('walls the deck high beside the road below, so no kart drops off it onto the line', () => {
    for (const { up, i } of all) expect(up.wallHeight[i], up.sectionName(i)).toBeGreaterThanOrEqual(2.5);
  });

  it('keeps every other stretch of road apart from the rest', () => {
    // Away from the crossing and the override's mouths, no two stretches of road come within a few metres of each other.
    const sp = main.spline;
    for (let i = 0; i < sp.count; i += 3) {
      for (let j = i; j < sp.count; j += 3) {
        const along = sp.dist[j] - sp.dist[i];
        if (Math.min(along, sp.length - along) < 120) continue;
        const dy = Math.abs(main.heightAt(sp.dist[i]) - main.heightAt(sp.dist[j]));
        if (dy > 6) continue;
        const gap = Math.hypot(sp.px[i] - sp.px[j], sp.pz[i] - sp.pz[j]) - main.halfWidth[i] - main.halfWidth[j];
        expect(gap, `${main.sectionName(i)} by ${main.sectionName(j)}`).toBeGreaterThan(6);
      }
    }
  });
});

describe('The Override, the shortcut', () => {
  const k = def.branches.findIndex((b) => b.name === 'The Override');
  const bdef = def.branches[k];
  const branch = track.branches[k];

  it('cuts inside the lights-out turn into the straight home, at the same pose at both ends, clear of every other road', () => {
    expect(k).toBeGreaterThanOrEqual(0);
    expect(sectionAt(bdef.mainFrom).name).toBe('Lights-Out Factory');
    expect(sectionAt(bdef.mainTo).name).toBe('Clocking Out');
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
    // The road is open at the lane's mouth and walled either side of it.
    for (const s of [bdef.mainFrom, bdef.mainTo]) expect(sectionAt(s).wallHeight ?? 0).toBe(0);
    for (const s of [bdef.mainFrom - 20, bdef.mainTo + 20]) expect(sectionAt(s).wallHeight ?? 0).toBeGreaterThan(0);
    for (let i = 0; i < sp.count; i++) {
      if (sp.dist[i] < 30 || sp.dist[i] > sp.length - 30) continue;
      let clear = Infinity;
      for (let j = 0; j < main.spline.count; j++) {
        const s = main.spline.dist[j];
        if (Math.abs(s - track.mainS(bdef.mainFrom)) < 110 || Math.abs(s - track.mainS(bdef.mainTo)) < 110) continue;
        clear = Math.min(clear, Math.hypot(main.spline.px[j] - sp.px[i], main.spline.pz[j] - sp.pz[i]) - main.halfWidth[j] - branch.halfWidth[i]);
      }
      expect(clear).toBeGreaterThan(0);
    }
  });

  it('is there from the second lap, and saves between one and two and a half seconds at 150cc', () => {
    expect(bdef.openOn).toEqual([2, 'final']);
    const p = kartParams(first.stats, '150cc');
    const open: LapContext = { lap: 2, lastLap: false };
    const via = drive(branch, bdef.mainTo, p, undefined, open);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, open);
    console.log(`Automation: the override ${via.time.toFixed(2)} s, the long way ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(round.time - via.time).toBeGreaterThan(1);
    expect(round.time - via.time).toBeLessThan(2.5);
  });
});

describe('Automation driving', () => {
  it('goes off the deck with airtime, and laps at 150cc with no falls', () => {
    const race = new Race(track);
    const kart = race.addKart(RACERS[0], '150cc', null);
    race.time = 0;
    let respawns = 0;
    const launches: number[] = [];
    for (let t = 0; t < 200 && kart.laps.lap < 1; t += PHYSICS_DT) {
      const s = kart.state;
      const ev = race.step(PHYSICS_DT, [steerAlong(main, s, kart.progressS)])[0];
      if (kart.respawned) respawns++;
      if (ev.launched) launches.push(main.toBuilder(kart.progressS));
    }
    console.log(`Automation: airtime at ${launches.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const down = section('The Algorithm Decides');
    expect(launches.some((b) => b > down.from - 10 && b < down.from + 60)).toBe(true);
  }, 30000);

  it('a full field of 150cc CPUs laps it, the leader in 60 to 70 seconds a lap', () => {
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
    console.log(`Automation: the leader home in ${leader.toFixed(1)} s, the last in ${t.toFixed(1)} s, ${respawns} respawns`);
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(def.laps);
    expect(respawns).toBeLessThanOrEqual(2 * def.laps);
    expect(leader / def.laps).toBeGreaterThan(60);
    expect(leader / def.laps).toBeLessThan(70);
  }, 120000);
});

describe('the presses: heads stamping the production line lane by lane, on the beat', () => {
  const h = new HazardSystem(track);
  const pdef = def.hazards.find((q) => q.kind === 'presses')!;

  it('stands three gantries up the production line, on level road clear of the deck, a bar of the song round', () => {
    expect(def.hazards.map((q) => q.kind)).toEqual(['presses']);
    if (!('at' in pdef)) throw new Error('no stations');
    expect(pdef.at.length).toBe(3);
    expect('period' in pdef && pdef.period).toBe(PRESS_PERIOD);
    expect(PRESS_PERIOD).toBeCloseTo((60 / BPM) * 4);
    const cross = section('The Production Line').from;
    for (const s of pdef.at) {
      expect(sectionAt(s).name).toBe('The Production Line');
      expect(main.heightAtBuilder(s)).toBeCloseTo(0, 1);
      expect(s - cross).toBeGreaterThan(110);
    }
    expect(isSheet('presses')).toBe(false);
  });

  it('stamps each lane once a bar on its own beat, two down at a time, the open lanes moving across', () => {
    expect([...PRESS_ORDER].sort()).toEqual([0, 1, 2, 3]);
    for (let b = 0; b < 4; b += 0.05) {
      const down = [0, 1, 2, 3].filter((k) => pressDown(b, k) > PRESS_HIT);
      expect(down.length, `beat ${b.toFixed(2)}`).toBeLessThanOrEqual(2);
      expect(down.length, `beat ${b.toFixed(2)}`).toBeGreaterThanOrEqual(1);
    }
    // On each beat, the lane in the order slams.
    PRESS_ORDER.forEach((k, beat) => {
      expect(pressDown(beat - 0.05, k)).toBe(0);
      expect(pressDown(beat + 0.5, k)).toBe(1);
      expect(pressDared(beat - PRESS_DARE / 2, k)).toBe(true);
      expect(pressDared(beat + 0.5, k)).toBe(false);
    });
    // The open lanes are not the same two from one beat to the next.
    const open = (b: number) => [0, 1, 2, 3].filter((k) => pressDown(b, k) < PRESS_HIT).join();
    expect(new Set([0.6, 1.6, 2.6, 3.6].map(open)).size).toBeGreaterThan(2);
    // The lanes span the road, and a lateral is in the lane round it.
    const reach = 16;
    for (let k = 0; k < PRESS_LANES; k++) expect(laneAt(pressLane(k, reach), reach)).toBe(k);
    expect(laneAt(-reach - 3, reach)).toBe(0);
    expect(laneAt(reach + 3, reach)).toBe(PRESS_LANES - 1);
    // Each station a beat after the one before.
    expect(pressBeat(5, PRESS_PERIOD, 1)).toBeCloseTo((pressBeat(5, PRESS_PERIOD, 0) + 3) % 4, 6);
  });

  it('stamps a kart under a head that is down: spun and slowed', () => {
    const p = when(h, (q) => [0, 1, 2, 3].some((k) => pressDown(q.phase * 4, k) > 0.99));
    const k = [0, 1, 2, 3].find((l) => pressDown(p.phase * 4, l) > 0.99)!;
    const kart = kartOn(p, pressLane(k, p.radius), 0);
    kart.speed = 30;
    expect(fresh().collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'presses' });
    expect(kart.spinTime).toBeGreaterThan(0);
    expect(kart.speed).toBeLessThan(30);
  });

  it('through a lane in the half beat before its head comes down, beating the machine: a boost', () => {
    const p = when(h, (q) => [0, 1, 2, 3].some((k) => pressDared(q.phase * 4, k) && pressDown(q.phase * 4, k) === 0));
    const k = [0, 1, 2, 3].find((l) => pressDared(p.phase * 4, l) && pressDown(p.phase * 4, l) === 0)!;
    const kart = kartOn(p, pressLane(k, p.radius), 0);
    kart.speed = 30;
    expect(fresh().collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'presses', good: true });
    expect(kart.boostTime).toBeCloseTo(PRESS_BOOST);
    expect(kart.spinTime).toBe(0);
  });

  it('is harmless in a lane whose head is up, and to a kart past the gantry', () => {
    const p = when(h, (q) => [0, 1, 2, 3].some((k) => pressDown(q.phase * 4, k) === 0 && !pressDared(q.phase * 4, k)));
    const k = [0, 1, 2, 3].find((l) => pressDown(p.phase * 4, l) === 0 && !pressDared(p.phase * 4, l))!;
    expect(fresh().collide([kartOn(p, pressLane(k, p.radius), 0)], PHYSICS_DT)).toEqual([]);
    for (let l = 0; l < PRESS_LANES; l++) expect(fresh().collide([kartOn(p, pressLane(l, p.radius), 8)], PHYSICS_DT)).toEqual([]);
  });

  it('is where it is by race time alone, and shows the CPUs the heads coming down', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    for (let t = 0; t <= 12.3; t += 0.7) b.update(t);
    b.update(12.3);
    const pa = a.poses.filter((q) => q.kind === 'presses');
    const pb = b.poses.filter((q) => q.kind === 'presses');
    expect(pa.length).toBe(3);
    pa.forEach((p, i) => expect(p.phase).toBeCloseTo(pb[i].phase, 6));
    h.update(3);
    const out: { x: number; z: number; r: number; vx: number; vz: number }[] = [];
    h.obstacles(out);
    expect(out.length).toBeGreaterThanOrEqual(3);
  });
});

let found = 0;
const fresh = () => {
  const h = new HazardSystem(track);
  h.update(found);
  return h;
};

function when(h: HazardSystem, ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.01) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === 'presses' && ok(q));
    found = t;
    if (p) return p;
  }
  throw new Error('no press in that stage');
}

/** A kart on the road at the press's gantry, `lateral` to the right of its middle, `along` past it. */
function kartOn(p: HazardPose, lateral: number, along: number): KartState {
  const hit = nearestOnSpline(track.spline, p.ax, p.az);
  const q = pointAt(track.spline, hit.s);
  const x = p.ax - q.tz * lateral + q.tx * along;
  const z = p.az + q.tx * lateral + q.tz * along;
  const k = createKartState(x, z, Math.atan2(q.tx, q.tz));
  k.y = k.groundY = p.ground;
  return k;
}

function fallen(kart: KartState): boolean {
  if (kart.y > -2) return false;
  const loc = track.locateKart(kart);
  return !(loc.onRoad && kart.y > loc.height - 1.5);
}

function steerAlong(ribbon: Ribbon, s: KartState, progress: number) {
  const sp = ribbon.spline;
  const look = 10 + s.speed * 0.4;
  const p = pointAt(sp, sp.closed ? progress + look : Math.min(progress + look, sp.length));
  const desired = Math.atan2(p.x - s.x, p.z - s.z);
  const travel = s.speed > 4 ? Math.atan2(Math.sin(s.heading) * s.speed + s.extX, Math.cos(s.heading) * s.speed + s.extZ) : s.heading;
  const err = wrapAngle(desired - travel);
  return { ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) };
}

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
