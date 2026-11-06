import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { HazardSystem, isSheet, type HazardPose } from '../src/items/hazards';
import { DOOR_BOOST, DOOR_OPEN, DOOR_SLOTS, DOOR_STAGES, doorPhase, doorRisen, doorSlot, greenRoom, openMask, opens, standing, swung } from '../src/kits/oddlife';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { FIELD_SECTIONS } from '../src/render/oddlife';
import { DECK, DEPTH, DOOR_PERIOD, buildOddlife } from '../src/tracks/oddlife';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, type LapContext, type Ribbon } from '../src/tracks/track';

const def = buildOddlife();
const track = new Track(def);
const main = track.main;
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];
const sectionAt = (s: number) => def.main.sections.find((q) => s >= q.from && s <= q.to)!;

describe('Oddlife', () => {
  it("is the K.G. Cup's third, on the tour's highway", () => {
    expect(CUPS.find((c) => c.id === 'kg')!.tracks.map((i) => TRACK_LIST[i].id)[2]).toBe('oddlife');
    expect(TRACK_SONGS.oddlife).toMatchObject({ title: 'Oddlife', album: 'K.G.', year: 2020 });
    expect(def.theme).toBe('oddlife');
    expect(def.music).toEqual({ lap: 'oddlife', finalLap: 'oddlife-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('tourRoad');
  });

  it('runs through the song in order, from all this rock n roll to getting in the stride', () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      // Verse one: the show.
      'All This Rock n Roll',
      'Bad for My Ears',
      "It's Weird",
      'All This Headbanging',
      'Bad for My Brain',
      // The chorus.
      'Sugarplum Fairy',
      'Echoed Feet',
      'Hallowed Ground',
      'Energy Peaks',
      "The Voyager's Crown",
      'Back to the Bus',
      'Another Round',
      'Managing Feats',
      'Head of the Hydra',
      'Tastes the Breeze',
      'Conduit Sees',
      'The Living Room Suite',
      'Boredom Breeds',
      'So Deranged',
      // Verse two.
      'Indecision in Anthropoids',
      'Wire Walking Upon the Knife',
      // Ambrose's verse.
      'Still Fatigued',
      'Dead Asleep',
      'Riding High',
      'Another Carpark',
      'Another Promoter',
      'Another Green Room',
      // The outro.
      'Get in the Stride',
    ]);
    console.log(`Oddlife: ${track.length.toFixed(0)} m a lap`);
    expect(track.length).toBeGreaterThan(2400);
    expect(track.length).toBeLessThan(2700);
    expect(def.laps).toBe(3);
  });

  it('is a figure of eight through a bitumen crossroad, the way back over the way out on a deck, crossing nothing else', () => {
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
    expect(c.dy).toBeGreaterThan(DECK - 0.5);
    const upper = main.heightAt(sp.dist[c.i]) > main.heightAt(sp.dist[c.j]) ? c.i : c.j;
    const lower = upper === c.i ? c.j : c.i;
    expect(sectionAt(main.toBuilder(sp.dist[upper])).name).toBe('Another Round');
    expect(sectionAt(main.toBuilder(sp.dist[upper])).bridge).toBe(true);
    expect(sectionAt(main.toBuilder(sp.dist[lower])).name).toBe("It's Weird");
    // The two loops: the show north of the crossroad, the rest of the odd life, the bigger, south of it.
    let north = 0;
    let south = 0;
    for (let i = 1; i < sp.count; i++) (sp.pz[i] > 0 ? (north += sp.dist[i] - sp.dist[i - 1]) : (south += sp.dist[i] - sp.dist[i - 1]));
    expect(south).toBeGreaterThan(north);
    expect(north).toBeGreaterThan(track.length * 0.3);
  });

  it('sinks Boredom Breeds in a walled cut, and nothing else is cut', () => {
    const under = section('Boredom Breeds');
    for (let s = under.from + 12; s < under.to - 12; s += 5) expect(main.heightAtBuilder(s)).toBeLessThan(-DEPTH + 0.5);
    const sp = main.spline;
    let cut = 0;
    for (let k = 0; k < sp.count; k++) {
      if (!main.cut[k]) continue;
      cut++;
      expect(['The Living Room Suite', 'Boredom Breeds', 'So Deranged']).toContain(sectionAt(main.toBuilder(sp.dist[k])).name);
      expect(main.wallHeight[k]).toBeGreaterThan(-main.heightAt(sp.dist[k]));
    }
    expect(cut).toBeGreaterThan(20);
  });

  it('dances the sugarplum fairy\'s leap: a gap a 100cc kart at full speed clears', () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    expect(sectionAt(a).name).toBe('Sugarplum Fairy');
    expect(sectionAt(z + 1).name).toBe('Echoed Feet');
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });

  it('lays its full rows of item boxes eight across, and its landmarks off the road', () => {
    const rows = def.itemBoxes.filter((r) => r.ribbon === undefined || r.ribbon === -1);
    expect(rows.filter((r) => r.count >= 4).length).toBeGreaterThanOrEqual(4);
    for (const r of rows) expect([3, 8]).toContain(r.count);
    for (const lm of def.landmarks) {
      if (!lm.lateral) continue;
      const p = pointAt(track.spline, track.mainS(lm.s));
      const hit = nearestOnSpline(track.spline, p.x - p.tz * lm.lateral, p.z + p.tx * lm.lateral);
      expect(hit.distance - main.halfWidthAtS(hit.s), lm.kind).toBeGreaterThan(20);
    }
    expect(def.landmarks.filter((l) => l.s < 20 && !l.lateral).map((l) => l.kind)).toEqual(['stageGate', 'tourField']);
  });

  it('is dressed end to end, a field a section, each in a section the world knows, with the skyline round the lot', () => {
    const fields = def.landmarks.filter((l) => l.kind === 'tourField').sort((a, b) => a.s - b.s);
    expect(fields.length).toBe(FIELD_SECTIONS.length);
    for (const f of fields) {
      expect(f.to, 'a field runs along the road').toBeGreaterThan(f.s + 15);
      expect(FIELD_SECTIONS).toContain(sectionAt(f.s).name);
    }
    let covered = 0;
    for (let k = 0; k < fields.length; k++) covered += Math.min(fields[k].to!, k + 1 < fields.length ? fields[k + 1].s : Infinity) - fields[k].s;
    expect(covered / track.length).toBeGreaterThan(0.95);
    expect(def.landmarks.filter((l) => l.kind === 'outbackSkyline').length).toBe(1);
  });

  it('has two kickers off the line', () => {
    const el = def.main.elevation;
    const lips: number[] = [];
    for (let j = 1; j < el.length; j++) if (el[j][0] - el[j - 1][0] < 1e-6 && el[j - 1][1] - el[j][1] > 0.5) lips.push(el[j][0]);
    expect(lips.length).toBe(2);
    for (const l of lips) expect(sectionAt(l).name).toBe('All This Rock n Roll');
  });

  it('stays inside its bounds', () => {
    for (const r of [main, ...track.branches]) {
      const sp = r.spline;
      for (let i = 0; i < sp.count; i++) expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i])) + r.halfWidth[i]).toBeLessThan(def.bounds - 10);
    }
  });
});

describe('Oddlife roads', () => {
  // A branch's ends and the road where it leaves and joins it are one surface, and so is the open mouth between them.
  const mouth = (r: Ribbon, i: number, m: Ribbon, j: number) => {
    const k = track.branches.indexOf(r);
    if (k < 0 || m !== main) return false;
    const b = def.branches[k];
    const s = r.spline.dist[i];
    const near = (a: number) => Math.min(Math.abs(m.spline.dist[j] - track.mainS(a)), m.spline.length - Math.abs(m.spline.dist[j] - track.mainS(a))) < 75;
    // Or where the road it leaves is open to it, the mouth itself.
    return (s < 60 && near(b.mainFrom)) || (s > r.spline.length - 60 && near(b.mainTo)) || ((near(b.mainFrom) || near(b.mainTo)) && m.wallHeight[j] === 0);
  };
  // Every pair of road samples near each other on different stretches, the upper first.
  const pairs = () => {
    const rs = [main, ...track.branches];
    const out: { up: Ribbon; i: number; low: Ribbon; j: number; gap: number }[] = [];
    rs.forEach((A, ai) => {
      for (let i = 0; i < A.spline.count; i += 2) {
        rs.forEach((B, bi) => {
          if (bi < ai) return;
          for (let j = ai === bi ? i : 0; j < B.spline.count; j += 2) {
            if (ai === bi) {
              const d = Math.abs(A.spline.dist[i] - B.spline.dist[j]);
              if (Math.min(d, A.spline.length - d) < 80) continue;
            }
            if (mouth(A, i, B, j) || mouth(B, j, A, i)) continue;
            const gap = Math.hypot(A.spline.px[i] - B.spline.px[j], A.spline.pz[i] - B.spline.pz[j]) - A.halfWidth[i] - B.halfWidth[j];
            if (gap >= 2.5) continue;
            const aUp = A.heightAt(A.spline.dist[i]) >= B.heightAt(B.spline.dist[j]);
            out.push(aUp ? { up: A, i, low: B, j, gap } : { up: B, i: j, low: A, j: i, gap });
          }
        });
      }
    });
    return out;
  };
  const all = pairs();

  it('never runs one road into another: where two roads overlap, one is a deck well over the other and its walls', () => {
    for (const { up, i, low, j } of all.filter((p) => p.gap < 0)) {
      const top = low.heightAt(low.spline.dist[j]) + low.wallHeight[j];
      expect(up.heightAt(up.spline.dist[i]) - top, `${up.sectionName(i)} over ${low.sectionName(j)}`).toBeGreaterThan(2);
      expect(up.sectionName(i)).toMatch(/The Voyager's Crown|Back to the Bus|Another Round|Managing Feats/);
    }
  });

  it('walls the deck high beside the road below, so no kart drops from one to the other', () => {
    for (const { up, i } of all.filter((p) => p.gap >= 0 && p.up.heightAt(p.up.spline.dist[p.i]) - p.low.heightAt(p.low.spline.dist[p.j]) > 2)) expect(up.wallHeight[i], up.sectionName(i)).toBeGreaterThanOrEqual(2.5);
    for (const name of ['Back to the Bus', 'Another Round']) {
      expect(section(name).parts[0].wallHeight!).toBeGreaterThanOrEqual(2.5);
      expect(section(name).parts[0].bridge).toBe(true);
    }
  });
});

describe('No Concept of Geography, the shortcut', () => {
  const k = def.branches.findIndex((b) => b.name === 'No Concept of Geography');
  const bdef = def.branches[k];
  const branch = track.branches[k];

  it("cuts across the hydra's U, leaving and meeting the road at the same pose, clear of every other road", () => {
    expect(k).toBeGreaterThanOrEqual(0);
    expect(sectionAt(bdef.mainFrom).name).toBe('Head of the Hydra');
    expect(sectionAt(bdef.mainTo).name).toBe('Head of the Hydra');
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
    // The road is open at its mouths and walled either side of them.
    for (const s of [bdef.mainFrom, bdef.mainTo]) expect(sectionAt(s).wallHeight ?? 0).toBe(0);
    for (const s of [bdef.mainFrom - 30, bdef.mainTo + 30]) expect(sectionAt(s).wallHeight ?? 0).toBeGreaterThan(0);
    for (let i = 0; i < sp.count; i++) {
      if (sp.dist[i] < 30 || sp.dist[i] > sp.length - 30) continue;
      let clear = Infinity;
      for (let j = 0; j < main.spline.count; j++) {
        const s = main.spline.dist[j];
        if (Math.abs(s - track.mainS(bdef.mainFrom)) < 70 || Math.abs(s - track.mainS(bdef.mainTo)) < 70) continue;
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
    console.log(`Oddlife: No Concept of Geography ${via.time.toFixed(2)} s, the long way ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(round.time - via.time).toBeGreaterThan(1);
    expect(round.time - via.time).toBeLessThan(2.5);
  });

  it('puts a double item box on it', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });
});

describe('Oddlife elevation and driving', () => {
  it('climbs to the energy peak on the deck, goes off it with airtime, and laps at 150cc with no falls', () => {
    for (const name of ['Back to the Bus', 'Another Round']) for (let s = section(name).from + 2; s < section(name).to - 2; s += 5) expect(main.heightAtBuilder(s)).toBeCloseTo(DECK, 0);
    const race = new Race(track);
    const kart = race.addKart(RACERS[0], '150cc', null);
    race.time = 0;
    let respawns = 0;
    const crests: number[] = [];
    const lips = (() => {
      const el = def.main.elevation;
      const out: number[] = [];
      for (let j = 1; j < el.length; j++) if (el[j][0] - el[j - 1][0] < 1e-6 && el[j - 1][1] - el[j][1] > 0.5) out.push(el[j][0]);
      return out;
    })();
    for (let t = 0; t < 200 && kart.laps.lap < 1; t += PHYSICS_DT) {
      const s = kart.state;
      const ev = race.step(PHYSICS_DT, [steerAlong(main, s, kart.progressS)])[0];
      if (kart.respawned) respawns++;
      const b = main.toBuilder(kart.progressS);
      if (ev.launched && !lips.some((l) => Math.abs(b - l) < 6) && !def.main.gaps.some(([a, z]) => b > a - 4 && b < z + 4)) crests.push(b);
    }
    console.log(`Oddlife: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const off = section('Managing Feats');
    expect(crests.some((b) => b > off.from - 10 && b < off.to + 30)).toBe(true);
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
    console.log(`Oddlife: the leader home in ${leader.toFixed(1)} s, the last in ${t.toFixed(1)} s, ${respawns} respawns`);
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(def.laps);
    expect(respawns).toBeLessThanOrEqual(2 * def.laps);
    expect(leader / def.laps).toBeGreaterThan(60);
    expect(leader / def.laps).toBeLessThan(70);
  }, 120000);
});

describe('the backstage doors: another promoter hanging in your hair, another green room to prepare', () => {
  const h = new HazardSystem(track);
  const pdef = def.hazards.find((q) => q.kind === 'backstageDoors')!;

  it('rises across Another Promoter and Another Green Room at three stations, on level road', () => {
    expect(def.hazards.map((q) => q.kind)).toEqual(['backstageDoors']);
    if (!('at' in pdef)) throw new Error('no stations');
    expect(pdef.at.length).toBe(3);
    expect('period' in pdef && pdef.period).toBe(DOOR_PERIOD);
    for (const s of pdef.at) {
      expect(['Another Promoter', 'Another Green Room']).toContain(sectionAt(s).name);
      expect(main.heightAtBuilder(s)).toBeCloseTo(0, 1);
    }
    expect(isSheet('backstageDoors')).toBe(false);
  });

  it('rises out of the road, half the doors swing open, a different half each time, and the row sinks back', () => {
    expect(doorRisen(0)).toBe(0);
    expect(doorRisen(DOOR_STAGES.risen + 0.01)).toBe(1);
    expect(doorRisen(0.99)).toBeLessThan(0.1);
    expect(swung(DOOR_STAGES.risen - 0.01)).toBe(0);
    expect(swung(DOOR_STAGES.opened + 0.01)).toBe(1);
    expect(standing(0.1)).toBe(false);
    expect(standing(0.5)).toBe(true);
    expect(standing(0.9)).toBe(false);
    expect(greenRoom(DOOR_STAGES.risen + 0.01)).toBe(false);
    expect(greenRoom(0.5)).toBe(true);
    const masks = new Set<number>();
    for (let c = 0; c < 12; c++) {
      const m = openMask(c, 0);
      let n = 0;
      for (let k = 0; k < DOOR_SLOTS; k++) if (opens(m, k)) n++;
      expect(n).toBe(DOOR_OPEN);
      expect(m).not.toBe(openMask(c + 1, 0));
      masks.add(m);
    }
    expect(masks.size).toBeGreaterThan(4);
    const ph = doorPhase(DOOR_PERIOD * 3 + 0.5, DOOR_PERIOD, 1);
    expect(ph.open).toBe(openMask(ph.cycle, 1));
    const reach = 15;
    for (let k = 1; k < DOOR_SLOTS; k++) expect(doorSlot(k, reach)).toBeGreaterThan(doorSlot(k - 1, reach));
    expect(doorSlot(0, reach)).toBeCloseTo(-doorSlot(DOOR_SLOTS - 1, reach), 6);
  });

  it('a promoter in a shut door catches a kart driven into it: spun and slowed', () => {
    const p = when(h, (q) => q.phase > DOOR_STAGES.opened + 0.02 && q.phase < DOOR_STAGES.sink - 0.05);
    const shut = [...Array(DOOR_SLOTS).keys()].find((k) => !opens(p.lane, k))!;
    const kart = kartOn(p, doorSlot(shut, p.radius), 0);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'backstageDoors' });
    expect(kart.spinTime).toBeGreaterThan(0);
    expect(kart.speed).toBeLessThan(30);
  });

  it('through an open door, into the green room: a boost', () => {
    const p = when(h, (q) => q.phase > DOOR_STAGES.opened + 0.02 && q.phase < DOOR_STAGES.sink - 0.05);
    const open = [...Array(DOOR_SLOTS).keys()].find((k) => opens(p.lane, k))!;
    const kart = kartOn(p, doorSlot(open, p.radius), 0);
    kart.speed = 30;
    expect(fresh().collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'backstageDoors', good: true });
    expect(kart.boostTime).toBeCloseTo(DOOR_BOOST);
    expect(kart.spinTime).toBe(0);
  });

  it('is harmless while it rises and after it has sunk', () => {
    const p = when(h, (q) => q.phase < 0.1);
    for (const lat of [-12, -6, 0, 6, 12]) expect(fresh().collide([kartOn(p, lat, 0)], PHYSICS_DT)).toEqual([]);
  });

  it('is where it is by race time alone, and shows the CPUs the shut doors', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    for (let t = 0; t <= 12.3; t += 0.7) b.update(t);
    b.update(12.3);
    const pa = a.poses.filter((q) => q.kind === 'backstageDoors');
    const pb = b.poses.filter((q) => q.kind === 'backstageDoors');
    expect(pa.length).toBe(3);
    pa.forEach((p, i) => {
      expect(p.phase).toBeCloseTo(pb[i].phase, 6);
      expect(p.lane).toBe(pb[i].lane);
    });
    when(h, (q) => q.phase > DOOR_STAGES.risen && q.phase < DOOR_STAGES.sink);
    const out: { x: number; z: number; r: number; vx: number; vz: number }[] = [];
    h.obstacles(out);
    expect(out.length).toBeGreaterThanOrEqual(DOOR_SLOTS - DOOR_OPEN);
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
    const p = h.poses.find((q) => q.kind === 'backstageDoors' && ok(q));
    found = t;
    if (p) return p;
  }
  throw new Error('no row in that stage');
}

/** A kart on the road at the row's station, `lateral` to the right of its middle. */
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
