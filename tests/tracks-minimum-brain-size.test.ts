import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { HazardSystem, isSheet, type HazardPose } from '../src/items/hazards';
import { MOB_BOOST, MOB_SLOTS, MOB_STAGES, mobIn, mobPhase, mobRow, mobSlot } from '../src/kits/minimumBrainSize';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { FIELD_SECTIONS } from '../src/render/minimumBrainSize';
import { DECK, DEPTH, LANE_HW, MOB_PERIOD, buildMinimumBrainSize } from '../src/tracks/minimumBrainSize';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, type LapContext, type Ribbon, type TrackDef } from '../src/tracks/track';

const def = buildMinimumBrainSize();
const track = new Track(def);
const main = track.main;
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];
const sectionAt = (s: number) => def.main.sections.find((q) => s >= q.from && s <= q.to)!;

describe('Minimum Brain Size', () => {
  it("is the K.G. Cup's second, on a road of scrolling feed", () => {
    expect(CUPS.find((c) => c.id === 'kg')!.tracks.map((i) => TRACK_LIST[i].id)[1]).toBe('minimum-brain-size');
    expect(TRACK_SONGS['minimum-brain-size']).toMatchObject({ title: 'Minimum Brain Size', year: 2020 });
    expect(def.theme).toBe('echochamber');
    expect(def.music).toEqual({ lap: 'minimum-brain-size', finalLap: 'minimum-brain-size-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('feed');
  });

  it('runs through the song in order, from the riddle to standing on a ball', () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      'Riddle Me This',
      'Did You Ever Grow?',
      "Break the Spider's Legs",
      'Just to Feed the Crow',
      'Sympathetic Crowds',
      'Dance Like Flies',
      'To All of the People Who Had It Coming',
      'A Few Biccys Too Many',
      "I'm So Lonely",
      'Open Their Eyes',
      'Minimum Brain Size',
      'Re-Enter the Uterus',
      'Refund All Your Cells',
      'Back-to-Front',
      'You Will Not Be Missed',
      'Said the Tear to the Eye',
      'Pathetic, You’re Weaker Than You Know',
      'Parasitic Mob',
      'Faceless Undertow',
      'Himpathetic Bro',
      "You Don't Have a Say Anymore",
      'Radicalise',
      'Radicalise to Minimum Brain Size',
      'At the Center of It All',
      "You Ain't Got the Gall",
      'Pissing on a Flame',
      'Standing on a Ball',
    ]);
    console.log(`Minimum Brain Size: ${track.length.toFixed(0)} m a lap`);
    expect(track.length).toBeGreaterThan(2400);
    expect(track.length).toBeLessThan(2700);
    expect(def.laps).toBe(3);
  });

  it('shrinks the road down the way in, to the centre, and widens it again back to front on the way out', () => {
    const hw = (name: string) => section(name).parts[0].halfWidth;
    const inward = ['Sympathetic Crowds', 'Dance Like Flies', 'To All of the People Who Had It Coming', 'A Few Biccys Too Many', "I'm So Lonely", 'Open Their Eyes', 'Minimum Brain Size'];
    for (let k = 1; k < inward.length; k++) expect(hw(inward[k]), inward[k]).toBeLessThan(hw(inward[k - 1]));
    const outward = ['You Will Not Be Missed', 'Said the Tear to the Eye', 'Pathetic, You’re Weaker Than You Know', 'Parasitic Mob', 'Himpathetic Bro', "You Don't Have a Say Anymore", 'Radicalise'];
    for (let k = 1; k < outward.length; k++) expect(hw(outward[k]), outward[k]).toBeGreaterThanOrEqual(hw(outward[k - 1]));
    // The walls come down with it.
    expect(section('Sympathetic Crowds').parts[0].wallHeight!).toBeGreaterThan(section("I'm So Lonely").parts[0].wallHeight!);
  });

  it('winds a double spiral, the way out the way in run back to front, and crosses it with one long deck over every turn, in tiers', () => {
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
    expect(found.length).toBeGreaterThanOrEqual(5);
    for (const c of found) {
      expect(c.dy).toBeGreaterThan(6);
      const upper = main.heightAt(sp.dist[c.i]) > main.heightAt(sp.dist[c.j]) ? c.i : c.j;
      // The road over every one is the road back, on its deck.
      expect(['At the Center of It All', "You Ain't Got the Gall"]).toContain(sectionAt(main.toBuilder(sp.dist[upper])).name);
      expect(sectionAt(main.toBuilder(sp.dist[upper])).bridge).toBe(true);
    }
    for (const name of ['At the Center of It All', "You Ain't Got the Gall"]) for (let s = section(name).from + 5; s < section(name).to - 5; s += 10) expect(main.heightAtBuilder(s)).toBeCloseTo(DECK, 0);
  });

  it('sinks the centre in a walled cut round two islands, and nothing else is cut', () => {
    const centre = ['Minimum Brain Size', 'Re-Enter the Uterus', 'Refund All Your Cells', 'Back-to-Front'];
    for (const name of centre.slice(1)) for (let s = section(name).from + 2; s < section(name).to - 2; s += 5) expect(main.heightAtBuilder(s)).toBeLessThan(-DEPTH + 0.5);
    const sp = main.spline;
    let cut = 0;
    for (let k = 0; k < sp.count; k++) {
      if (!main.cut[k]) continue;
      cut++;
      expect(['Open Their Eyes', ...centre, 'You Will Not Be Missed', 'Said the Tear to the Eye']).toContain(sectionAt(main.toBuilder(sp.dist[k])).name);
      expect(main.wallHeight[k]).toBeGreaterThan(-main.heightAt(sp.dist[k]));
    }
    expect(cut).toBeGreaterThan(30);
    // The brain on its ball and the eye stand on the two islands the road circles.
    for (const kind of ['brainBall', 'tearEye']) {
      const lm = def.landmarks.find((l) => l.kind === kind)!;
      const p = pointAt(track.spline, track.mainS(lm.s));
      const x = p.x - p.tz * (lm.lateral ?? 0);
      const z = p.z + p.tx * (lm.lateral ?? 0);
      const hit = nearestOnSpline(track.spline, x, z);
      expect(hit.distance, kind).toBeGreaterThan(20);
      expect(hit.distance, kind).toBeLessThan(80);
    }
  });

  it("breaks the spider's legs: a leap over the road broken off a 100cc kart at full speed clears", () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const legs = section("Break the Spider's Legs");
    expect(a > legs.from && z <= legs.to).toBe(true);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });

  it('lays its full rows of item boxes eight across, and puts boost pads in the centre for the long way round', () => {
    const rows = def.itemBoxes.filter((r) => r.ribbon === undefined || r.ribbon === -1);
    expect(rows.filter((r) => r.count >= 4).length).toBeGreaterThanOrEqual(4);
    for (const r of rows) expect([3, 8]).toContain(r.count);
    const centre = section('Minimum Brain Size').from;
    const out = section('You Will Not Be Missed').to;
    expect(def.boostPads.filter((p) => p.s > centre && p.s < out).length).toBeGreaterThanOrEqual(3);
  });

  it('is dressed end to end in stretches, each starting in a section the world knows, with the skyline round the lot', () => {
    const fields = def.landmarks.filter((l) => l.kind === 'feedField').sort((a, b) => a.s - b.s);
    expect(fields.length).toBe(FIELD_SECTIONS.length);
    for (const f of fields) {
      expect(f.to, 'a field runs along the road').toBeGreaterThan(f.s + 40);
      expect(FIELD_SECTIONS).toContain(sectionAt(f.s).name);
    }
    let covered = 0;
    for (let k = 0; k < fields.length; k++) covered += Math.min(fields[k].to!, k + 1 < fields.length ? fields[k + 1].s : Infinity) - fields[k].s;
    expect(covered / track.length).toBeGreaterThan(0.93);
    expect(def.landmarks.filter((l) => l.kind === 'echoSkyline').length).toBe(1);
  });

  it('has two kickers off the line, and its landmarks off the road', () => {
    const el = def.main.elevation;
    const lips: number[] = [];
    for (let j = 1; j < el.length; j++) if (el[j][0] - el[j - 1][0] < 1e-6 && el[j - 1][1] - el[j][1] > 0.5) lips.push(el[j][0]);
    expect(lips.length).toBe(2);
    expect(def.landmarks.filter((l) => l.s < 20).map((l) => l.kind)).toEqual(['echoGate']);
    expect(def.landmarks.find((l) => l.kind === 'bedroom')!.s).toBeGreaterThan(60);
    for (const lm of def.landmarks) {
      if (!lm.lateral) continue;
      const p = pointAt(track.spline, track.mainS(lm.s));
      const hit = nearestOnSpline(track.spline, p.x - p.tz * lm.lateral, p.z + p.tx * lm.lateral);
      expect(hit.distance - main.halfWidthAt(hit), lm.kind).toBeGreaterThan(8);
    }
  });

  it('stays inside its bounds', () => {
    const sp = track.spline;
    for (let i = 0; i < sp.count; i++) expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i])) + main.halfWidth[i]).toBeLessThan(def.bounds - 10);
  });
});

describe('Minimum Brain Size walls', () => {
  // A branch's ends and the road where it leaves and joins it are one surface, sloped or not.
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

  it('keeps every lower road and its walls well under any road over it', () => {
    for (const { up, i, low, j, gap } of all.filter((p) => p.gap < 0)) {
      const top = low.heightAt(low.spline.dist[j]) + low.wallHeight[j];
      expect(up.heightAt(up.spline.dist[i]) - top, `${up.sectionName(i)} over ${low.sectionName(j)}`).toBeGreaterThan(2);
      expect(gap).toBeLessThan(0);
    }
  });

  it('walls the spiral high beside a road below, so no kart drops from one level to the next', () => {
    for (const { up, i } of all.filter((p) => p.gap >= 0)) expect(up.wallHeight[i], up.sectionName(i)).toBeGreaterThanOrEqual(2.5);
    for (const name of ['Sympathetic Crowds', "I'm So Lonely", 'Faceless Undertow', 'Radicalise', 'At the Center of It All']) expect(section(name).parts[0].wallHeight!).toBeGreaterThanOrEqual(2.5);
  });
});

describe("Couldn't Hack It, the shortcut", () => {
  const k = def.branches.findIndex((b) => b.name === "Couldn't Hack It");
  const bdef = def.branches[k];
  const branch = track.branches[k];

  it('leaves the deck\'s way down and meets the road again before the line, at the same pose, clear of every other road', () => {
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
    // The road is open at the lane's mouth and walled either side of it.
    for (const s of [bdef.mainFrom, bdef.mainTo]) expect(sectionAt(s).wallHeight ?? 0).toBe(0);
    for (const s of [bdef.mainFrom - 20, bdef.mainTo + 20]) expect(sectionAt(s).wallHeight ?? 0).toBeGreaterThan(0);
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 30 || sp.dist[i] > sp.length - 30) continue;
      // Clear of every road but the one it leaves and joins, near its ends.
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
    // One narrow strip with no walls: it pays only taken clean.
    for (const q of bdef.sections) {
      expect(q.halfWidth).toBeCloseTo(LANE_HW * ROAD_WIDTH_SCALE);
      expect(q.wallHeight ?? 0).toBe(0);
    }
    const p = kartParams(first.stats, '150cc');
    const open: LapContext = { lap: 2, lastLap: false };
    const via = drive(branch, bdef.mainTo, p, undefined, open);
    const round = drive(main, bdef.mainTo, p, bdef.mainFrom, open);
    console.log(`Minimum Brain Size: Couldn't Hack It ${via.time.toFixed(2)} s, the long way ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(via.time).toBeLessThan(round.time - 0.2);
    expect(round.time - via.time).toBeGreaterThan(1);
    expect(round.time - via.time).toBeLessThan(2.5);
  });

  it('puts a double item box on it', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });
});

describe('Minimum Brain Size elevation and driving', () => {
  it('goes off the crest of the deck with airtime, and laps at 150cc with no falls', () => {
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
    console.log(`Minimum Brain Size: crest airtime at ${crests.map((b) => b.toFixed(0)).join(', ')}`);
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    const crest = section('Pissing on a Flame');
    expect(crests.some((b) => b > crest.from - 10 && b < crest.to + 60)).toBe(true);
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
    console.log(`Minimum Brain Size: the leader home in ${leader.toFixed(1)} s, the last in ${t.toFixed(1)} s, ${respawns} respawns`);
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(def.laps);
    expect(respawns).toBeLessThanOrEqual(2 * def.laps);
    expect(leader / def.laps).toBeGreaterThan(60);
    expect(leader / def.laps).toBeLessThan(70);
  }, 120000);
});

describe('the mob: faceless avatars closing ranks across the road, and the one gap', () => {
  const h = new HazardSystem(track);
  const bdef = def.hazards.find((q) => q.kind === 'mobs')!;

  it('closes in across Parasitic Mob and Faceless Undertow at four stations, on level road', () => {
    expect(def.hazards.map((q) => q.kind)).toEqual(['mobs']);
    if (!('at' in bdef)) throw new Error('no stations');
    expect(bdef.at.length).toBe(4);
    expect('period' in bdef && bdef.period).toBe(MOB_PERIOD);
    for (const s of bdef.at) {
      expect(['Parasitic Mob', 'Faceless Undertow']).toContain(sectionAt(s).name);
      expect(main.heightAtBuilder(s)).toBeCloseTo(0, 1);
    }
    expect(isSheet('mobs')).toBe(false);
  });

  it('gathers from both edges to stand shoulder to shoulder with one slot open, a different one each time', () => {
    const reach = 12;
    expect(mobIn(0)).toBe(0);
    expect(mobIn(MOB_STAGES.closed + 0.01)).toBe(1);
    expect(mobIn(0.99)).toBeLessThan(0.1);
    const row = mobRow(0.5, 2, reach);
    expect(row.length).toBe(MOB_SLOTS - 1);
    expect(row.some((a) => a.slot === 2)).toBe(false);
    for (const a of row) expect(a.lateral).toBeCloseTo(mobSlot(a.slot, reach), 6);
    // Gathering: out at the edges, coming in.
    const early = mobRow(0.05, 2, reach);
    for (const a of early) expect(Math.abs(a.lateral)).toBeGreaterThan(reach - 0.01);
    const gaps = new Set([0, 1, 2, 3, 4, 5].map((c) => mobPhase(c * MOB_PERIOD + 0.01, MOB_PERIOD, 0).gap));
    expect(gaps.size).toBeGreaterThan(1);
    for (const g of gaps) {
      expect(g).toBeGreaterThan(0);
      expect(g).toBeLessThan(MOB_SLOTS - 1);
    }
  });

  it('piles on a kart driven into the row: spun and slowed', () => {
    const p = when(h, (q) => q.phase > MOB_STAGES.closed + 0.02 && q.phase < MOB_STAGES.open - 0.05);
    const people = mobRow(p.phase, p.lane, p.radius);
    const kart = kartOn(p, people[0].lateral, 0);
    kart.speed = 30;
    expect(h.collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'mobs' });
    expect(kart.spinTime).toBeGreaterThan(0);
    expect(kart.speed).toBeLessThan(30);
  });

  it('through the gap while the row stands closed, out of the echo: a boost', () => {
    const p = when(h, (q) => q.phase > MOB_STAGES.closed + 0.02 && q.phase < MOB_STAGES.open - 0.05);
    const kart = kartOn(p, p.gap, 0);
    kart.speed = 30;
    expect(fresh().collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'mobs', good: true });
    expect(kart.boostTime).toBeCloseTo(MOB_BOOST);
    expect(kart.spinTime).toBe(0);
  });

  it('is harmless before it gathers and after it has washed out', () => {
    const p = when(h, (q) => q.phase < 0.05);
    for (const lat of [-9, -4, 0, 4, 9]) expect(fresh().collide([kartOn(p, lat, 0)], PHYSICS_DT)).toEqual([]);
  });

  it('is where it is by race time alone, and shows the CPUs the row when it closes', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    for (let t = 0; t <= 12.3; t += 0.7) b.update(t);
    b.update(12.3);
    const pa = a.poses.filter((q) => q.kind === 'mobs');
    const pb = b.poses.filter((q) => q.kind === 'mobs');
    expect(pa.length).toBe(4);
    pa.forEach((p, i) => {
      expect(p.phase).toBeCloseTo(pb[i].phase, 6);
      expect(p.lane).toBe(pb[i].lane);
    });
    when(h, (q) => q.phase > MOB_STAGES.closed && q.phase < MOB_STAGES.open);
    const out: { x: number; z: number; r: number; vx: number; vz: number }[] = [];
    h.obstacles(out);
    expect(out.length).toBeGreaterThanOrEqual(MOB_SLOTS - 1);
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
    const p = h.poses.find((q) => q.kind === 'mobs' && ok(q));
    found = t;
    if (p) return p;
  }
  throw new Error('no mob in that stage');
}

/** A kart on the road at the mob's station, `lateral` to the right of its middle. */
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

export type { TrackDef };
