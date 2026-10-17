import { describe, expect, it } from 'vitest';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { COUNTDOWN, Race } from '../src/core/race';
import { BOULDER_STAGES, HazardSystem } from '../src/items/hazards';
import { BOX_RESPAWN, FUZZ_BOOST, ITEM_KINDS, MINE_WOBBLE, ROULETTE, TEMPO_SLOW, WAVE_RANGE, itemWeights, rollItem, type ItemKind } from '../src/items/items';
import { createKartState, slowDown, spinOut, stepKart } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { buildRattlesnakeRun } from '../src/tracks/rattlesnakeRun';
import { Track } from '../src/tracks/track';
import { seededRandom } from '../src/core/math';

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
  it('never gives the leader a missile, and Tempo Shift only to the last two', () => {
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
  it('Fuzz Pedal boosts', () => {
    const race = humanRace(1);
    const k = give(race, 0, 'fuzzPedal');
    race.step(PHYSICS_DT, [PRESS]);
    expect(k.item).toBeNull();
    expect(k.state.boostTime).toBeGreaterThan(FUZZ_BOOST - 0.1);
  });

  it('Microtonal Mine drops behind, arms, and wobbles whoever drives over it', () => {
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

  it('Feedback Wave spins out karts in range only', () => {
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

  it('Riff Missile chases down the racer ahead', () => {
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

  it('Tempo Shift slows everyone else', () => {
    const race = humanRace(3);
    give(race, 2, 'tempoShift');
    race.step(PHYSICS_DT, [NEUTRAL_INPUT, NEUTRAL_INPUT, PRESS]);
    expect(race.karts[0].state.slowTime).toBeGreaterThan(TEMPO_SLOW - 0.1);
    expect(race.karts[1].state.slowTime).toBeGreaterThan(TEMPO_SLOW - 0.1);
    expect(race.karts[2].state.slowTime).toBe(0);
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
    for (const r of RACERS) race.addKart(r, '150cc', CPU_SKILL['150cc']);
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
    // Hazards bite, but not every corner of all 18 laps.
    expect(hazardHits).toBeGreaterThan(5);
    expect(hazardHits).toBeLessThan(60);
  });
});

/** Endless flat asphalt. */
const flat = {
  probe: () => ({ height: 0, surface: 'road' as const }),
  collide: () => null,
};
