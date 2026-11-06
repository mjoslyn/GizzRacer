import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { Race } from '../src/core/race';
import { HazardSystem, isSheet, type HazardPose } from '../src/items/hazards';
import { NEEDLE_BOOST, NEEDLE_BPM, NEEDLE_DOWN, NEEDLE_STITCHES, needleBeat, needleDown, needleHeight, needleLateral, stitchLateral, stitchOf, stitchOpen } from '../src/kits/intrasport';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_SONGS } from '../src/audio/songs';
import { FIELD_SECTIONS } from '../src/render/intrasport';
import { EVOLVE, HIGH_DECK, LANE_HW, LOW_DECK, TUNNEL, buildIntrasport } from '../src/tracks/intrasport';
import { ROAD_WIDTH_SCALE } from '../src/tracks/builder';
import { CUPS, TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, type LapContext, type Ribbon } from '../src/tracks/track';

const def = buildIntrasport();
const track = new Track(def);
const main = track.main;
const section = (name: string) => {
  const parts = def.main.sections.filter((s) => s.name === name);
  return { name, from: parts[0].from, to: parts[parts.length - 1].to, parts };
};
const first = RACERS[0];
const sectionAt = (s: number) => def.main.sections.find((q) => s >= q.from && s <= q.to)!;

/** Every place two stretches of the lap pass over one another: the upper and lower sample and the height between them. */
function crossings() {
  const sp = track.spline;
  const found: { i: number; j: number; dy: number }[] = [];
  for (let i = 0; i < sp.count; i += 2) {
    for (let j = i; j < sp.count; j += 2) {
      const along = sp.dist[j] - sp.dist[i];
      if (Math.min(along, sp.length - along) < 120) continue;
      if (Math.hypot(sp.px[i] - sp.px[j], sp.pz[i] - sp.pz[j]) > 4) continue;
      const dy = main.heightAt(sp.dist[i]) - main.heightAt(sp.dist[j]);
      const [up, low] = dy > 0 ? [i, j] : [j, i];
      const near = found.find((c) => Math.abs(sp.dist[c.i] - sp.dist[up]) < 60 && Math.abs(sp.dist[c.j] - sp.dist[low]) < 60);
      if (near) near.dy = Math.min(near.dy, Math.abs(dy));
      else found.push({ i: up, j: low, dy: Math.abs(dy) });
    }
  }
  return found.map((c) => ({ ...c, upper: sectionAt(main.toBuilder(sp.dist[c.i])).name, lower: sectionAt(main.toBuilder(sp.dist[c.j])).name }));
}

describe('Intrasport', () => {
  it("is the K.G. Cup's last, on a running track's red rubber", () => {
    const cup = CUPS.find((c) => c.id === 'kg')!.tracks.map((i) => TRACK_LIST[i].id);
    expect(cup[cup.length - 1]).toBe('intrasport');
    expect(TRACK_SONGS.intrasport).toMatchObject({ title: 'Intrasport', year: 2020 });
    expect(def.theme).toBe('stadiumrave');
    expect(def.music).toEqual({ lap: 'intrasport', finalLap: 'intrasport-final-lap' });
    for (const s of [...def.main.sections, ...def.branches.flatMap((b) => b.sections)]) expect(s.surface, s.name).toBe('tartan');
  });

  it("runs through the song's lines in order, from don't take it personally to don't do it", () => {
    const names = def.main.sections.map((s) => s.name).filter((n, k, all) => n !== all[k - 1]);
    expect(names).toEqual([
      "Don't Take It Personally",
      'Slide Inward',
      'Shatter the Static',
      'Find the Rhythm',
      'Set Course to Collide',
      'My Hands Are Disappearing',
      'Dissolving in a Tear',
      "I Think I'm Taking Off",
      'Will I Evaporate?',
      "I've Got a Bird's Eye View",
      'I Have Shed My Skin',
      'Perish to My Thoughts',
      'My Hand Is on the Gun',
      'My Face Splashes in the Sky',
      'I Used to Dream',
      'Dreams That Sew Me Up',
      'Sleeping with a Needle',
      'A Schism in the Rhythm',
      'My Hair Is Liquifying',
      'My Tastebuds Are Igniting',
      "It's True I Am Evolving",
      "The Feeling's on the Floor",
      "Don't Do It",
    ]);
    console.log(`Intrasport: ${track.length.toFixed(0)} m a lap`);
    expect(track.length).toBeGreaterThan(2400);
    expect(track.length).toBeLessThan(2700);
    expect(def.laps).toBe(3);
  });

  it("slides inward down a tunnel under My Hands Are Disappearing, and floats round on a deck high over Find the Rhythm and My Hands Are Disappearing, in tiers", () => {
    const found = crossings();
    console.log(`Intrasport crossings: ${found.map((c) => `${c.upper} over ${c.lower} (${c.dy.toFixed(1)} m)`).join(', ')}`);
    const pairs = found.map((c) => `${c.upper} / ${c.lower}`);
    expect(pairs).toContain('My Hands Are Disappearing / Slide Inward');
    expect(pairs.some((p) => p === "I've Got a Bird's Eye View / Find the Rhythm" || p === "I've Got a Bird's Eye View / Shatter the Static")).toBe(true);
    expect(pairs.some((p) => p === "I've Got a Bird's Eye View / My Hands Are Disappearing" || p === 'I Have Shed My Skin / My Hands Are Disappearing')).toBe(true);
    for (const c of found) {
      expect(c.dy, `${c.upper} over ${c.lower}`).toBeGreaterThan(6);
      // The road over is on a deck.
      expect(sectionAt(main.toBuilder(track.spline.dist[c.i])).bridge, c.upper).toBe(true);
    }
    // The tunnel is sunk, in a cut, and the decks hold their heights over it all.
    const tunnel = found.find((c) => c.lower === 'Slide Inward')!;
    expect(main.heightAt(track.spline.dist[tunnel.j])).toBeCloseTo(-TUNNEL, 1);
    expect(main.cut[tunnel.j]).toBe(1);
    expect(main.heightAt(track.spline.dist[tunnel.i])).toBeCloseTo(LOW_DECK, 1);
    for (let s = section('Will I Evaporate?').from + 15; s < section("I've Got a Bird's Eye View").to - 5; s += 10) expect(main.heightAtBuilder(s)).toBeCloseTo(HIGH_DECK, 0);
    // Nothing else is cut.
    const sp = main.spline;
    for (let k = 0; k < sp.count; k++) if (main.cut[k]) expect(main.sectionName(k)).toBe('Slide Inward');
  });

  it('splashes into the sky off a ramp over a gap a 100cc kart at full speed clears', () => {
    expect(def.main.gaps.length).toBe(1);
    const [a, z] = def.main.gaps[0];
    const face = section('My Face Splashes in the Sky');
    expect(a > face.from && z <= face.to).toBe(true);
    for (const r of RACERS) {
      const p = kartParams(r.stats, '100cc');
      expect(jump(track, track.mainS(a - 40), -1, p.topSpeed, 0, p), r.id).toBe('cleared');
    }
  });

  it('lays its full rows of item boxes eight across, three on the risky lines', () => {
    const rows = def.itemBoxes.filter((r) => r.ribbon === undefined || r.ribbon === -1);
    expect(rows.filter((r) => r.count >= 4).length).toBeGreaterThanOrEqual(4);
    for (const r of rows) expect([3, 8]).toContain(r.count);
  });

  it('is dressed end to end in stretches, each starting in a section the world knows, with the stadium round the lot', () => {
    const fields = def.landmarks.filter((l) => l.kind === 'raveField').sort((a, b) => a.s - b.s);
    expect(fields.length).toBe(FIELD_SECTIONS.length);
    for (const f of fields) {
      expect(f.to, 'a field runs along the road').toBeGreaterThan(f.s + 40);
      expect(FIELD_SECTIONS).toContain(sectionAt(f.s).name);
    }
    let covered = 0;
    for (let k = 0; k < fields.length; k++) covered += Math.min(fields[k].to!, k + 1 < fields.length ? fields[k + 1].s : Infinity) - fields[k].s;
    expect(covered / track.length).toBeGreaterThan(0.93);
    expect(def.landmarks.filter((l) => l.kind === 'stadiumSkyline').length).toBe(1);
  });

  it('stands each of the song\'s images beside its own stretch, off the road', () => {
    const where: Record<string, string> = {
      staticWall: 'Shatter the Static',
      speakerStack: 'Find the Rhythm',
      ballCollision: 'Set Course to Collide',
      raveHands: 'My Hands Are Disappearing',
      tearDrop: 'Dissolving in a Tear',
      starterPistol: 'My Hand Is on the Gun',
      skyFace: 'My Face Splashes in the Sky',
      boxingRing: 'I Used to Dream',
      spoolTower: 'Sleeping with a Needle',
      meltingHead: 'My Hair Is Liquifying',
      evolutionMarch: "It's True I Am Evolving",
      mirrorFloor: "The Feeling's on the Floor",
      stopHand: "Don't Do It",
    };
    for (const [kind, name] of Object.entries(where)) expect(sectionAt(def.landmarks.find((l) => l.kind === kind)!.s).name, kind).toBe(name);
    expect(def.landmarks.filter((l) => l.s < 20).map((l) => l.kind)).toEqual(['stadiumGate']);
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

describe('Intrasport walls', () => {
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

  it('keeps every lower road and its walls well under any road over it', () => {
    expect(all.filter((p) => p.gap < 0).length).toBeGreaterThan(10);
    for (const { up, i, low, j } of all.filter((p) => p.gap < 0)) {
      const top = low.heightAt(low.spline.dist[j]) + low.wallHeight[j];
      expect(up.heightAt(up.spline.dist[i]) - top, `${up.sectionName(i)} over ${low.sectionName(j)}`).toBeGreaterThan(2);
    }
  });

  it('walls the decks high beside a road below, so no kart drops from one level to the next', () => {
    for (const { up, i } of all.filter((p) => p.gap >= 0)) expect(up.wallHeight[i], up.sectionName(i)).toBeGreaterThanOrEqual(2.5);
    for (const name of ['My Hands Are Disappearing', 'Will I Evaporate?', "I've Got a Bird's Eye View", 'I Have Shed My Skin']) expect(section(name).parts[0].wallHeight!).toBeGreaterThanOrEqual(2.5);
  });
});

describe("Now I'm Running, the shortcut", () => {
  const k = def.branches.findIndex((b) => b.name === "Now I'm Running");
  const bdef = def.branches[k];
  const branch = track.branches[k];

  it('leaves the road at the schism and meets it again round the hairpin, at the same pose, clear of every other road', () => {
    expect(k).toBeGreaterThanOrEqual(0);
    expect(sectionAt(bdef.mainFrom - 1).name).toBe('Sleeping with a Needle');
    expect(sectionAt(bdef.mainTo).name).toBe('My Hair Is Liquifying');
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
    for (const s of [bdef.mainFrom, bdef.mainTo]) expect(sectionAt(s).wallHeight ?? 0).toBe(0);
    for (const s of [bdef.mainFrom - 25, bdef.mainTo + 25]) expect(sectionAt(s).wallHeight ?? 0).toBeGreaterThan(0);
    for (let i = 0; i < sp.count; i++) {
      expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
      if (sp.dist[i] < 30 || sp.dist[i] > sp.length - 30) continue;
      let clear = Infinity;
      for (let j = 0; j < main.spline.count; j++) {
        const s = main.spline.dist[j];
        if (Math.abs(s - track.mainS(bdef.mainFrom)) < 60 || Math.abs(s - track.mainS(bdef.mainTo)) < 60) continue;
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
    console.log(`Intrasport: Now I'm Running ${via.time.toFixed(2)} s, the long way ${round.time.toFixed(2)} s, saves ${(round.time - via.time).toFixed(2)} s`);
    expect(via.fell).toBe(false);
    expect(round.fell).toBe(false);
    expect(round.time - via.time).toBeGreaterThan(1);
    expect(round.time - via.time).toBeLessThan(2.5);
  });

  it('puts a double item box on it', () => {
    expect(def.itemBoxes.some((r) => r.ribbon === k && r.double)).toBe(true);
  });
});

describe('Intrasport driving', () => {
  it("laps at 150cc with no falls, flying off the ramp and off the crest of It's True I Am Evolving", () => {
    const race = new Race(track);
    const kart = race.addKart(RACERS[0], '150cc', null);
    race.time = 0;
    let respawns = 0;
    let launched = false;
    let crest = false;
    const [a, z] = def.main.gaps[0];
    const evolving = section("It's True I Am Evolving");
    expect(Math.max(...[40, 50, 55].map((d) => main.heightAtBuilder(evolving.from + d)))).toBeCloseTo(EVOLVE, 0);
    for (let t = 0; t < 200 && kart.laps.lap < 1; t += PHYSICS_DT) {
      const s = kart.state;
      const ev = race.step(PHYSICS_DT, [steerAlong(main, s, kart.progressS)])[0];
      if (kart.respawned) respawns++;
      const b = main.toBuilder(kart.progressS);
      if (ev.launched && b > a - 8 && b < z + 4) launched = true;
      if (ev.launched && b > evolving.from + 30 && b < section("The Feeling's on the Floor").to) crest = true;
    }
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
    expect(launched).toBe(true);
    expect(crest).toBe(true);
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
    console.log(`Intrasport: the leader home in ${leader.toFixed(1)} s, the last in ${t.toFixed(1)} s, ${respawns} respawns`);
    for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(def.laps);
    expect(respawns).toBeLessThanOrEqual(2 * def.laps);
    expect(leader / def.laps).toBeGreaterThan(60);
    expect(leader / def.laps).toBeLessThan(70);
  }, 120000);
});

describe('dreams that sew me up like sleeping with a needle: stabbing the road on the beat, stepping across it between beats', () => {
  const h = new HazardSystem(track);
  const ndef = def.hazards.find((q) => q.kind === 'needles')!;

  it("hangs four gantries over Sleeping with a Needle, on level road, at the song's tempo", () => {
    expect(def.hazards.map((q) => q.kind)).toEqual(['needles']);
    if (!('at' in ndef) || !('bpm' in ndef)) throw new Error('no stations');
    expect(ndef.at.length).toBe(4);
    expect(ndef.bpm).toBe(NEEDLE_BPM);
    for (const s of ndef.at) {
      expect(sectionAt(s).name).toBe('Sleeping with a Needle');
      expect(main.heightAtBuilder(s)).toBeCloseTo(0, 1);
    }
    expect(isSheet('needles')).toBe(false);
  });

  it('goes down on every beat, a stitch further across each time, back and forth over the whole road', () => {
    const beat = 60 / NEEDLE_BPM;
    const a = needleBeat(3, NEEDLE_BPM, 0);
    const b = needleBeat(3 + beat, NEEDLE_BPM, 0);
    expect(b.n).toBe(a.n + 1);
    expect(b.u).toBeCloseTo(a.u, 6);
    // Each gantry a beat behind the one before.
    expect(needleBeat(3, NEEDLE_BPM, 1).n).toBe(a.n - 1);
    const seen = new Set<number>();
    for (let n = 0; n < 40; n++) {
      const k = stitchOf(n);
      seen.add(k);
      expect(Math.abs(stitchOf(n + 1) - k)).toBe(1);
    }
    expect(seen.size).toBe(NEEDLE_STITCHES);
    const reach = 12;
    expect(stitchLateral(0, reach)).toBeLessThan(-reach * 0.7);
    expect(stitchLateral(NEEDLE_STITCHES - 1, reach)).toBeGreaterThan(reach * 0.7);
    // Down in the road at its stitch, then up and over to the next.
    for (const u of [0, NEEDLE_DOWN / 2, NEEDLE_DOWN - 0.01]) {
      expect(needleDown(u)).toBe(true);
      expect(needleHeight(u)).toBe(0);
      expect(needleLateral(5, u, reach)).toBeCloseTo(stitchLateral(stitchOf(5), reach), 6);
    }
    expect(needleHeight(0.68)).toBeGreaterThan(3);
    expect(needleLateral(5, 0.999, reach)).toBeCloseTo(stitchLateral(stitchOf(6), reach), 1);
    expect(stitchOpen(NEEDLE_DOWN + 0.01)).toBe(true);
    expect(stitchOpen(0.95)).toBe(false);
  });

  it('sews up a kart under it: spun and slowed', () => {
    const p = when(h, (q) => q.active && q.phase < NEEDLE_DOWN - 0.1);
    const kart = kartOn(p, p.gap, 0);
    kart.speed = 30;
    expect(fresh().collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'needles' });
    expect(kart.spinTime).toBeGreaterThan(0);
    expect(kart.speed).toBeLessThan(30);
  });

  it('through the stitch it has just pulled out of, threaded: a boost', () => {
    const p = when(h, (q) => stitchOpen(q.phase) && q.phase < NEEDLE_DOWN + 0.15);
    const kart = kartOn(p, p.gap, 0);
    kart.speed = 30;
    expect(fresh().collide([kart], PHYSICS_DT)[0]).toMatchObject({ by: 'needles', good: true });
    expect(kart.boostTime).toBeCloseTo(NEEDLE_BOOST);
    expect(kart.spinTime).toBe(0);
  });

  it('is harmless away from the needle', () => {
    const p = when(h, (q) => q.active && Math.abs(q.gap) < 6);
    for (const d of [-6, 6]) expect(fresh().collide([kartOn(p, p.gap + d, 0)], PHYSICS_DT)).toEqual([]);
  });

  it('is where it is by race time alone, and shows the CPUs the needle', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    for (let t = 0; t <= 12.3; t += 0.7) b.update(t);
    b.update(12.3);
    const pa = a.poses.filter((q) => q.kind === 'needles');
    const pb = b.poses.filter((q) => q.kind === 'needles');
    expect(pa.length).toBe(4);
    pa.forEach((p, i) => {
      expect(p.phase).toBeCloseTo(pb[i].phase, 6);
      expect(p.x).toBeCloseTo(pb[i].x, 6);
      expect(p.z).toBeCloseTo(pb[i].z, 6);
    });
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
    const p = h.poses.find((q) => q.kind === 'needles' && ok(q));
    found = t;
    if (p) return p;
  }
  throw new Error('no needle in that stage');
}

/** A kart on the road at the needle's gantry, `lateral` to the right of its middle. */
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
