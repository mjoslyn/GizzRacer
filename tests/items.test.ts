import { describe, expect, it } from 'vitest';
import { CPU_SKILL, CpuDriver } from '../src/ai/cpuDriver';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { COUNTDOWN, Race } from '../src/core/race';
import { BOULDER_STAGES, HOLE_CORE, HazardSystem, JET_STAGES, LIGHTNING_STRIKE } from '../src/items/hazards';
import { buildVolcanoFortress } from '../src/tracks/volcanoFortress';
import { buildPolygondwanalandJungle } from '../src/tracks/polygondwanalandJungle';
import { buildHellOnMars } from '../src/tracks/hellOnMars';
import { buildSupercell } from '../src/tracks/supercell';
import { buildMurderOfTheUniverse } from '../src/tracks/murderOfTheUniverse';
import { BOX_RESPAWN, FAR_BEHIND, CANNON_PAST_MAX, CANNON_PAST_MIN, CANNON_TIME, FUZZ_BOOST, ITEM_KINDS, MINE_WOBBLE, ROULETTE, TEMPO_SLOW_FIRST, TEMPO_SLOW_LAST, WAVE_RANGE, itemWeights, rollItem, tempoSlowFor, type ItemKind } from '../src/items/items';
import { createKartState, respawnKart, slowDown, spinOut, stepKart } from '../src/physics/kart';
import { FIELD_SIZE, RACERS, kartParams } from '../src/physics/racers';
import { buildRattlesnakeRun } from '../src/tracks/rattlesnakeRun';
import { Track } from '../src/tracks/track';
import { seededRandom } from '../src/core/math';
import { packKart, unpackKart } from '../src/net/wire';
import { TRACK_LIST } from '../src/tracks/index';

const track = new Track(buildRattlesnakeRun());
const PRESS = { ...NEUTRAL_INPUT, throttle: 1, item: true, itemPressed: true };
const GAS = { ...NEUTRAL_INPUT, throttle: 1 };

/** A started race with human-driven karts, so nothing fires on its own. */
function humanRace(n: number) {
  const race = new Race(track);
  for (let i = 0; i < n; i++) race.addKart(RACERS[i], '100cc', null);
  race.time = 0;
  return race;
}

function give(race: Race, index: number, item: ItemKind) {
  const k = race.karts[index];
  k.item = item;
  k.rolling = 0;
  return k;
}

describe('item odds', () => {
  it('never gives the leader a missile, and Horology only to the last two', () => {
    for (let pos = 1; pos <= 6; pos++) {
      const w = itemWeights(pos, 6);
      if (pos === 1) expect(w.riffMissile).toBe(0);
      if (pos <= 4) expect(w.tempoShift).toBe(0);
      else expect(w.tempoShift).toBeGreaterThan(0);
      for (const k of ITEM_KINDS) expect(w[k]).toBeGreaterThanOrEqual(0);
    }
  });

  it('biases mines to the front and missiles to the back', () => {
    expect(itemWeights(1, 6).microtonalMine).toBeGreaterThan(itemWeights(6, 6).microtonalMine);
    expect(itemWeights(6, 6).riffMissile).toBeGreaterThan(itemWeights(2, 6).riffMissile);
    expect(itemWeights(3, 6).feedbackWave).toBeGreaterThan(itemWeights(1, 6).feedbackWave);
  });

  it('rolls only items a position can get', () => {
    const rand = seededRandom(5);
    for (let i = 0; i < 500; i++) {
      expect(rollItem(1, 6, rand)).not.toBe('riffMissile');
      expect(rollItem(3, 6, rand)).not.toBe('tempoShift');
    }
  });
});

describe('Woo Cannon', () => {
  /** Puts kart `i` on the centreline `s` metres round, and lets the race see where it is. */
  const place = (race: Race, i: number, s: number) => {
    const k = race.karts[i];
    const pose = race.track.respawnPose(s);
    respawnKart(k.state, pose.x, pose.y, pose.z, pose.heading);
    race.step(PHYSICS_DT, race.karts.map(() => NEUTRAL_INPUT));
    return k;
  };

  it('only rolls for the last three, likelier further back', () => {
    for (let pos = 1; pos <= 5; pos++) expect(itemWeights(pos, 8).wooCannon).toBe(0);
    for (let pos = 6; pos <= 8; pos++) expect(itemWeights(pos, 8).wooCannon).toBeGreaterThan(0);
    expect(itemWeights(8, 8).wooCannon).toBeGreaterThan(itemWeights(6, 8).wooCannon);
    const rand = seededRandom(9);
    for (let i = 0; i < 500; i++) expect(rollItem(2, 8, rand)).not.toBe('wooCannon');
  });

  it('flies the kart down the road well past top speed, immune, then lets go', () => {
    const race = humanRace(1);
    const k = place(race, 0, 60);
    give(race, 0, 'wooCannon');
    race.step(PHYSICS_DT, [PRESS]);
    expect(k.state.cannonTime).toBeGreaterThan(CANNON_TIME - 0.1);
    const d0 = k.distance;
    for (let t = 0; t < CANNON_TIME + 2 && k.state.cannonTime > 0; t += PHYSICS_DT) {
      race.step(PHYSICS_DT, [NEUTRAL_INPUT]);
      expect(spinOut(k.state, 1)).toBe(false);
    }
    expect(k.state.cannonTime).toBe(0);
    expect(k.distance - d0).toBeGreaterThan(k.baseParams.topSpeed * CANNON_TIME * 1.4);
    expect(k.state.speed).toBeGreaterThan(k.params.topSpeed * 0.9);
  });

  it('flies last place up to the pack and a varying way past it, then lets go', () => {
    const pasts: number[] = [];
    for (const seed of [1, 2, 3]) {
      const race = new Race(track, seed);
      for (let i = 0; i < 4; i++) race.addKart(RACERS[i], '100cc', null);
      race.time = 0;
      // Three karts bunched up the road, the fourth far behind them.
      [300, 310, 320].forEach((s, i) => place(race, i, s));
      const last = place(race, 3, 40);
      expect(last.position).toBe(4);
      give(race, 3, 'wooCannon');
      race.step(PHYSICS_DT, [NEUTRAL_INPUT, NEUTRAL_INPUT, NEUTRAL_INPUT, PRESS]);
      const goal = last.cannonGoal!;
      expect(goal.target.position).toBe(2);
      expect(goal.past).toBeGreaterThanOrEqual(CANNON_PAST_MIN);
      expect(goal.past).toBeLessThanOrEqual(CANNON_PAST_MAX);
      pasts.push(goal.past);
      const target = goal.target;
      for (let t = 0; t < CANNON_TIME + 1 && last.state.cannonTime > 0; t += PHYSICS_DT) race.step(PHYSICS_DT, race.karts.map(() => NEUTRAL_INPUT));
      expect(last.state.cannonTime).toBe(0);
      const ahead = last.distance - target.distance;
      expect(ahead).toBeGreaterThan(goal.past - 1);
      expect(ahead).toBeLessThan(goal.past + 15);
    }
    // A different amount past the pack each time.
    expect(new Set(pasts.map((p) => p.toFixed(2))).size).toBe(3);
  });

  it('always comes out of the box for a kart far behind the pack', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const race = new Race(track, seed);
      for (let i = 0; i < 4; i++) race.addKart(RACERS[i], '100cc', null);
      race.time = 0;
      const box = race.items.boxes[0];
      const boxS = track.locate(box.x, box.z, box.y).progress;
      [boxS + FAR_BEHIND + 60, boxS + FAR_BEHIND + 70, boxS + FAR_BEHIND + 80].forEach((s, i) => place(race, i, s));
      const last = race.karts[3];
      last.state.x = box.x;
      last.state.z = box.z;
      last.state.y = last.state.groundY = box.y - 1.1;
      race.step(PHYSICS_DT, race.karts.map(() => NEUTRAL_INPUT));
      expect(last.behind).toBeGreaterThan(FAR_BEHIND);
      expect(last.item).toBe('wooCannon');
    }
  });

  it('never drops a kart into a pit or off the edge, on any track', () => {
    for (const entry of TRACK_LIST) {
      const t = new Track(entry.build());
      for (let f = 0; f < 1; f += 0.125) {
        const race = new Race(t);
        race.addKart(RACERS[0], '150cc', null);
        race.time = 0;
        const k = place(race, 0, f * t.length + 2);
        give(race, 0, 'wooCannon');
        race.step(PHYSICS_DT, [PRESS]);
        for (let s = 0; s < CANNON_TIME + 3 && k.state.cannonTime > 0; s += PHYSICS_DT) race.step(PHYSICS_DT, [NEUTRAL_INPUT]);
        // Let a CPU drive on: it should land on the road and carry on without falling.
        k.driver = new CpuDriver(CPU_SKILL['150cc'], 3);
        let fell = false;
        let landed = false;
        for (let s = 0; s < 1.5; s += PHYSICS_DT) {
          race.step(PHYSICS_DT, []);
          fell ||= k.fallTime > 0 || k.respawned;
          // On the road at some point (it may take a ramp straight after).
          landed ||= k.state.grounded;
        }
        expect(fell, `${entry.name} at ${f}`).toBe(false);
        expect(landed, `${entry.name} at ${f}`).toBe(true);
      }
    }
  });

  it('knocks aside and spins out a kart in its way, and keeps going', () => {
    const race = humanRace(2);
    const shell = place(race, 0, 100);
    const victim = place(race, 1, 118);
    give(race, 0, 'wooCannon');
    race.step(PHYSICS_DT, [PRESS, NEUTRAL_INPUT]);
    let hit = false;
    for (let t = 0; t < 1.5 && !hit; t += PHYSICS_DT) {
      race.step(PHYSICS_DT, [NEUTRAL_INPUT, NEUTRAL_INPUT]);
      hit = race.events.some((e) => e.type === 'hit' && e.kart === victim && e.by === 'wooCannon' && e.from === shell);
    }
    expect(hit).toBe(true);
    expect(victim.state.spinTime).toBeGreaterThan(0);
    expect(shell.state.cannonTime).toBeGreaterThan(0);
    expect(shell.state.spinTime).toBe(0);
  });

  it('goes over the wire, so others see the shell', () => {
    const s = createKartState();
    s.cannonTime = 2.25;
    const back = createKartState();
    unpackKart(packKart(s), back);
    expect(back.cannonTime).toBe(2.25);
  });
});

describe('item boxes', () => {
  it('lays out every row and gives one item at a time, respawning after 3 s', () => {
    const race = humanRace(1);
    expect(race.items.boxes.length).toBe(track.def.itemBoxes.reduce((a, r) => a + r.count, 0));
    const k = race.karts[0];
    const box = race.items.boxes[0];
    k.state.x = box.x;
    k.state.z = box.z;
    k.state.y = k.state.groundY = box.y - 1.1;
    race.step(PHYSICS_DT, [NEUTRAL_INPUT]);
    expect(k.item).not.toBeNull();
    expect(k.rolling).toBeGreaterThan(0);
    expect(box.respawn).toBeGreaterThan(0);
    const first = k.item;

    // A second box with a full slot pops but doesn't change the item.
    const other = race.items.boxes[1];
    k.state.x = other.x;
    k.state.z = other.z;
    race.step(PHYSICS_DT, [NEUTRAL_INPUT]);
    expect(other.respawn).toBeGreaterThan(0);
    expect(k.item).toBe(first);

    // Can't fire during the roulette.
    race.step(PHYSICS_DT, [PRESS]);
    expect(k.item).toBe(first);

    k.state.x += 100;
    for (let t = 0; t < BOX_RESPAWN + 0.1; t += PHYSICS_DT) race.step(PHYSICS_DT, [NEUTRAL_INPUT]);
    expect(box.respawn).toBe(0);
    expect(k.rolling).toBe(0);
    expect(ROULETTE).toBeLessThan(BOX_RESPAWN);
  });
});

describe('item effects', () => {
  it('Mind Fuzz boosts', () => {
    const race = humanRace(1);
    const k = give(race, 0, 'fuzzPedal');
    race.step(PHYSICS_DT, [PRESS]);
    expect(k.item).toBeNull();
    expect(k.state.boostTime).toBeGreaterThan(FUZZ_BOOST - 0.1);
  });

  it('Microtonal Banana drops behind, arms, and wobbles whoever drives over it', () => {
    const race = humanRace(2);
    const a = give(race, 0, 'microtonalMine');
    race.step(PHYSICS_DT, [PRESS, NEUTRAL_INPUT]);
    expect(race.items.mines.length).toBe(1);
    const m = race.items.mines[0];
    // The dropper isn't hit by its own mine while it arms.
    expect(a.state.wobbleTime).toBe(0);
    const b = race.karts[1];
    for (let t = 0; t < 1; t += PHYSICS_DT) race.step(PHYSICS_DT, [NEUTRAL_INPUT, NEUTRAL_INPUT]);
    b.state.x = m.x;
    b.state.z = m.z;
    b.state.y = m.y;
    race.step(PHYSICS_DT, [NEUTRAL_INPUT, NEUTRAL_INPUT]);
    expect(b.state.wobbleTime).toBeGreaterThan(MINE_WOBBLE - 0.1);
    expect(race.items.mines.length).toBe(0);
    expect(race.events.some((e) => e.type === 'hit' && e.kart === b && e.by === 'microtonalMine')).toBe(true);
  });

  it('Nuclear Fusion spins out karts in range only', () => {
    const race = humanRace(3);
    const [a, near, far] = race.karts;
    give(race, 0, 'feedbackWave');
    near.state.x = a.state.x + WAVE_RANGE - 2;
    near.state.z = a.state.z;
    far.state.x = a.state.x + WAVE_RANGE + 6;
    far.state.z = a.state.z;
    race.step(PHYSICS_DT, [PRESS, NEUTRAL_INPUT, NEUTRAL_INPUT]);
    expect(near.state.spinTime).toBeGreaterThan(0);
    expect(far.state.spinTime).toBe(0);
    expect(a.state.spinTime).toBe(0);
  });

  it('Big Fig Wasp chases down the racer ahead', () => {
    const race = humanRace(2);
    const [lead, chaser] = race.karts;
    // Put the leader 60 m up the salt flat and the chaser at the line.
    const place = (k: typeof lead, s: number) => {
      const p = track.respawnPose(s);
      Object.assign(k.state, createKartState(p.x, p.z, p.heading));
      k.state.y = k.state.groundY = p.y;
    };
    place(lead, 70);
    place(chaser, 10);
    race.step(PHYSICS_DT, [NEUTRAL_INPUT, NEUTRAL_INPUT]);
    expect(chaser.position).toBe(2);
    give(race, 1, 'riffMissile');
    let hit = false;
    for (let t = 0; t < 4 && !hit; t += PHYSICS_DT) {
      race.step(PHYSICS_DT, [NEUTRAL_INPUT, t === 0 ? PRESS : NEUTRAL_INPUT]);
      hit = race.events.some((e) => e.type === 'hit' && e.kart === lead && e.by === 'riffMissile');
    }
    expect(hit).toBe(true);
    expect(lead.state.spinTime).toBeGreaterThan(0);
    expect(race.items.missiles.length).toBe(0);
  });

  it('Horology slows everyone else, the leader longest', () => {
    const race = humanRace(3);
    give(race, 2, 'tempoShift');
    race.step(PHYSICS_DT, [NEUTRAL_INPUT, NEUTRAL_INPUT, PRESS]);
    const [first, second, user] = race.karts;
    expect(first.position).toBe(1);
    expect(first.state.slowTime).toBeGreaterThan(TEMPO_SLOW_FIRST - 0.1);
    expect(second.state.slowTime).toBeGreaterThan(0);
    expect(second.state.slowTime).toBeLessThan(first.state.slowTime);
    expect(user.state.slowTime).toBe(0);
  });

  it('Horology runs from longest in first to shortest in last', () => {
    expect(tempoSlowFor(1, 8)).toBe(TEMPO_SLOW_FIRST);
    expect(tempoSlowFor(8, 8)).toBe(TEMPO_SLOW_LAST);
    for (let p = 1; p < 8; p++) expect(tempoSlowFor(p, 8)).toBeGreaterThan(tempoSlowFor(p + 1, 8));
  });
});

describe('status effects', () => {
  const p = kartParams(RACERS[0].stats, '100cc');

  it('a spun-out kart loses control and most of its speed, then recovers', () => {
    const s = createKartState();
    s.speed = 25;
    spinOut(s, 1);
    for (let t = 0; t < 1; t += PHYSICS_DT) stepKart(s, GAS, p, flat, PHYSICS_DT);
    expect(s.speed).toBeLessThan(5);
    expect(s.spinTime).toBe(0);
    for (let t = 0; t < 1; t += PHYSICS_DT) stepKart(s, GAS, p, flat, PHYSICS_DT);
    expect(s.speed).toBeGreaterThan(10);
  });

  it('a just-hit kart is briefly immune', () => {
    const s = createKartState();
    expect(spinOut(s, 1)).toBe(true);
    expect(spinOut(s, 1)).toBe(false);
  });

  it('a slowed kart tops out lower', () => {
    const top = (slow: boolean) => {
      const s = createKartState();
      for (let t = 0; t < 6; t += PHYSICS_DT) {
        if (slow) slowDown(s, 1);
        stepKart(s, GAS, p, flat, PHYSICS_DT);
      }
      return s.speed;
    };
    expect(top(true)).toBeLessThan(top(false) * 0.7);
  });
});

describe('hazards', () => {
  it('moves as a pure function of time', () => {
    const a = new HazardSystem(track);
    const b = new HazardSystem(track);
    a.update(12.3);
    b.update(4);
    b.update(12.3);
    expect(a.poses.map((p) => [p.x, p.y, p.z])).toEqual(b.poses.map((p) => [p.x, p.y, p.z]));
    expect(new Set(a.poses.map((p) => p.kind))).toEqual(new Set(['snakes', 'dustDevils', 'tumbleweeds', 'boulders']));
  });

  it('snakes cross the whole road', () => {
    const h = new HazardSystem(track);
    const snake = h.poses.findIndex((p) => p.kind === 'snakes');
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (let t = 0; t < 6; t += 0.1) {
      h.update(t);
      const p = h.poses[snake];
      const loc = track.locate(p.x, p.z, p.y);
      const c = track.respawnPose(loc.progress);
      const cross = Math.hypot(p.x - c.x, p.z - c.z);
      minLat = Math.min(minLat, cross);
      maxLat = Math.max(maxLat, cross);
    }
    expect(minLat).toBeLessThan(2);
    expect(maxLat).toBeGreaterThan(8);
  });

  it('a snake spins out a kart it touches', () => {
    const h = new HazardSystem(track);
    h.update(3);
    const p = h.poses.find((q) => q.kind === 'snakes')!;
    const s = createKartState(p.x, p.z);
    s.y = p.y;
    expect(h.collide([s], PHYSICS_DT)).toEqual([{ kart: s, by: 'snakes' }]);
    expect(s.spinTime).toBeGreaterThan(0);
  });

  it('a dust devil pushes karts sideways', () => {
    const h = new HazardSystem(track);
    const p = h.poses.find((q) => q.kind === 'dustDevils')!;
    const s = createKartState(p.x + 2, p.z);
    s.y = p.y;
    for (let i = 0; i < 10; i++) h.collide([s], PHYSICS_DT);
    expect(Math.hypot(s.extX, s.extZ)).toBeGreaterThan(3);
    expect(s.spinTime).toBe(0);
  });

  it('a tumbleweed slows a kart once, not every tick', () => {
    const h = new HazardSystem(track);
    const p = h.poses.find((q) => q.kind === 'tumbleweeds')!;
    const s = createKartState(p.x, p.z);
    s.y = p.ground;
    s.speed = 20;
    h.collide([s], PHYSICS_DT);
    expect(s.speed).toBeCloseTo(11, 0);
    h.collide([s], PHYSICS_DT);
    expect(s.speed).toBeCloseTo(11, 0);
  });

  it('boulders warn, fall, then sit on the road as a solid hazard', () => {
    const h = new HazardSystem(track);
    const i = h.poses.findIndex((q) => q.kind === 'boulders');
    const seen = new Set<string>();
    for (let t = 0; t < 7; t += 0.05) {
      h.update(t);
      const p = h.poses[i];
      const stage = p.phase < BOULDER_STAGES.fall ? 'warn' : p.phase < BOULDER_STAGES.land ? 'fall' : p.phase < BOULDER_STAGES.crumble ? 'rest' : 'gone';
      seen.add(stage);
      if (stage === 'warn') expect(p.active).toBe(false);
      if (stage === 'rest') {
        expect(p.active).toBe(true);
        const s = createKartState(p.x + 0.5, p.z);
        s.y = p.ground;
        h.collide([s], PHYSICS_DT);
        expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeGreaterThan(p.radius);
      }
    }
    expect(seen).toEqual(new Set(['warn', 'fall', 'rest', 'gone']));
  });
});

describe('a CPU race with items', () => {
  it('CPUs pick up and use items, take hits, and still all finish', () => {
    const race = new Race(track, 7);
    for (const r of RACERS.slice(0, FIELD_SIZE)) race.addKart(r, '150cc', CPU_SKILL['150cc']);
    const uses = new Map<ItemKind, number>();
    let pickups = 0;
    let hazardHits = 0;
    let itemHits = 0;
    for (let t = 0; t < COUNTDOWN + 400 && !race.finished; t += PHYSICS_DT) {
      race.step(PHYSICS_DT, []);
      for (const e of race.events) {
        if (e.type === 'pickup') pickups++;
        if (e.type === 'use') uses.set(e.item, (uses.get(e.item) ?? 0) + 1);
        if (e.type === 'hit') e.from ? itemHits++ : hazardHits++;
      }
    }
    expect(race.finished).toBe(true);
    expect(pickups).toBeGreaterThan(20);
    expect(uses.size).toBeGreaterThanOrEqual(4);
    expect(itemHits).toBeGreaterThan(3);
    // Hazards bite, but not every corner of every lap (three laps per kart; the bound was 60 for eight karts).
    expect(hazardHits).toBeGreaterThan(5);
    expect(hazardHits).toBeLessThan((60 * FIELD_SIZE) / 8);
  });
});

/** Endless flat asphalt. */
const flat = {
  probe: () => ({ height: 0, surface: 'road' as const }),
  collide: () => null,
};

describe('volcano and jungle hazards', () => {
  const volcano = new Track(buildVolcanoFortress());
  const jungle = new Track(buildPolygondwanalandJungle());

  it('flame jets burn across the whole road, but only while firing', () => {
    const h = new HazardSystem(volcano);
    const i = h.poses.findIndex((p) => p.kind === 'flameJets');
    const at = (lo: number, hi: number) => {
      for (let t = 0; t < 20; t += 1 / 60) {
        h.update(t);
        if (h.poses[i].phase >= lo && h.poses[i].phase < hi) return;
      }
    };
    const kartAt = (lateral: number) => {
      const p = h.poses[i];
      const s = createKartState(p.x - Math.cos(p.heading) * lateral, p.z + Math.sin(p.heading) * lateral);
      s.y = p.ground;
      return s;
    };
    at(0, JET_STAGES.sputter);
    expect(h.collide([kartAt(0)], PHYSICS_DT)).toEqual([]);
    at(JET_STAGES.fire + 0.05, 1);
    const edge = kartAt(h.poses[i].radius - 2);
    expect(h.collide([edge], PHYSICS_DT).length).toBe(1);
    expect(edge.spinTime).toBeGreaterThan(0);
  });

  it('lava bombs land and sit solid like boulders', () => {
    const h = new HazardSystem(volcano);
    const i = h.poses.findIndex((p) => p.kind === 'lavaBombs');
    for (let t = 0; t < 10 && !(h.poses[i].phase > 0.5 && h.poses[i].phase < 0.6); t += 1 / 60) h.update(t);
    const p = h.poses[i];
    expect(p.active).toBe(true);
    const s = createKartState(p.x + 0.4, p.z);
    s.y = p.ground;
    h.collide([s], PHYSICS_DT);
    expect(s.spinTime).toBeGreaterThan(0);
    expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeGreaterThan(p.radius);
  });

  it('vine logs swing across the road and rollers roll across it', () => {
    const h = new HazardSystem(jungle);
    for (const kind of ['vines', 'rollers'] as const) {
      const i = h.poses.findIndex((p) => p.kind === kind);
      let lo = Infinity;
      let hi = -Infinity;
      for (let t = 0; t < 8; t += 0.05) {
        h.update(t);
        const p = h.poses[i];
        const off = Math.hypot(p.x - p.ax, p.z - p.az) * Math.sign((p.x - p.ax) * -Math.cos(p.heading) + (p.z - p.az) * Math.sin(p.heading) || 1);
        lo = Math.min(lo, off);
        hi = Math.max(hi, off);
      }
      expect(hi - lo, kind).toBeGreaterThan(10);
    }
  });
});

describe('apocalypse hazards', () => {
  const mars = new Track(buildHellOnMars());
  const storm = new Track(buildSupercell());
  const space = new Track(buildMurderOfTheUniverse());

  it('meteors and hail land and sit solid like boulders', () => {
    for (const [t0, kind] of [[mars, 'meteors'], [storm, 'hail']] as const) {
      const h = new HazardSystem(t0);
      const i = h.poses.findIndex((p) => p.kind === kind);
      for (let t = 0; t < 10 && !(h.poses[i].phase > 0.5 && h.poses[i].phase < 0.6); t += 1 / 60) h.update(t);
      const p = h.poses[i];
      expect(p.active, kind).toBe(true);
      const s = createKartState(p.x + 0.4, p.z);
      s.y = p.ground;
      h.collide([s], PHYSICS_DT);
      expect(s.spinTime, kind).toBeGreaterThan(0);
      expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeGreaterThan(p.radius);
    }
  });

  it('lightning warns, then strikes only for a moment', () => {
    const h = new HazardSystem(storm);
    const i = h.poses.findIndex((p) => p.kind === 'lightning');
    const seen = { warn: false, strike: false, after: false };
    for (let t = 0; t < 10; t += 1 / 60) {
      h.update(t);
      const p = h.poses[i];
      const striking = p.phase >= BOULDER_STAGES.land && p.phase < BOULDER_STAGES.land + LIGHTNING_STRIKE;
      expect(p.active).toBe(striking);
      if (p.phase < BOULDER_STAGES.land) seen.warn = true;
      else if (striking) seen.strike = true;
      else seen.after = true;
    }
    expect(seen).toEqual({ warn: true, strike: true, after: true });
    for (let t = 0; t < 10 && !h.poses[i].active; t += 1 / 60) h.update(t);
    const p = h.poses[i];
    const s = createKartState(p.x + 1, p.z);
    s.y = p.ground;
    expect(h.collide([s], PHYSICS_DT).map((e) => e.by)).toEqual(['lightning']);
    expect(s.spinTime).toBeGreaterThan(0);
  });

  it('a tornado flings karts round and out without spinning them', () => {
    const h = new HazardSystem(storm);
    const p = h.poses.find((q) => q.kind === 'tornadoes')!;
    const s = createKartState(p.x + 3, p.z);
    s.y = p.ground;
    for (let i = 0; i < 10; i++) h.collide([s], PHYSICS_DT);
    expect(Math.hypot(s.extX, s.extZ)).toBeGreaterThan(4);
    expect(s.extX).toBeGreaterThan(0); // outward
    expect(s.spinTime).toBe(0);
  });

  it('a black hole drags karts in, and its core spins them out', () => {
    const h = new HazardSystem(space);
    const p = h.poses.find((q) => q.kind === 'blackHoles')!;
    const s = createKartState(p.x + 5, p.z);
    s.y = p.ground;
    for (let i = 0; i < 10; i++) h.collide([s], PHYSICS_DT);
    expect(s.extX).toBeLessThan(0); // inward
    expect(s.spinTime).toBe(0);
    const core = createKartState(p.x + HOLE_CORE * 0.5, p.z);
    core.y = p.ground;
    expect(h.collide([core], PHYSICS_DT).map((e) => e.by)).toEqual(['blackHoles']);
    expect(core.spinTime).toBeGreaterThan(0);
  });
});

