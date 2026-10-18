import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { DRAFT_BOOST, RESPAWN_DELAY, ROCKET_BOOST, Race, type RaceKart } from '../src/core/race';
import {
  BASS_SLOW,
  CABLE_TIME,
  DRUM_TIME,
  ITEM_KINDS,
  LASER_RANGE,
  SIGNATURE_ITEMS,
  itemWeights,
  type ItemKind,
} from '../src/items/items';
import { TRICK_BOOST, TRICK_STREAK_BONUS, createKartState, stepKart, type DriveEnv } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { packKart, unpackKart } from '../src/net/wire';
import { RoomRace } from '../src/net/roomRace';
import { TrackBuilder } from '../src/tracks/builder';
import { buildRattlesnakeRun } from '../src/tracks/rattlesnakeRun';
import { pointAt } from '../src/tracks/spline';
import { Track, type TrackDef } from '../src/tracks/track';

const track = new Track(buildRattlesnakeRun());
const GAS = { ...NEUTRAL_INPUT, throttle: 1 };
const HOP = { ...GAS, drift: true, driftPressed: true };
const PRESS = { ...GAS, item: true, itemPressed: true };

/** A started race with human-driven karts, so nothing fires on its own. */
function humanRace(n: number, t = track) {
  const race = new Race(t);
  for (let i = 0; i < n; i++) race.addKart(RACERS[i], '100cc', null);
  race.time = 0;
  return race;
}

/** Puts a kart on the Salt Flat Straight, `s` metres in, `lateral` off the centerline, facing down the road. */
function place(k: RaceKart, s: number, lateral = 0, speed = 0) {
  const p = pointAt(track.spline, s);
  const tl = Math.hypot(p.tx, p.tz);
  Object.assign(k.state, { x: p.x - (p.tz / tl) * lateral, z: p.z + (p.tx / tl) * lateral, heading: Math.atan2(p.tx, p.tz), speed, trackHint: -1 });
  k.state.y = k.state.groundY = track.main.heightAt(s);
  k.progressS = s;
  k.distance = s;
}

function give(k: RaceKart, item: ItemKind, spare: ItemKind | null = null) {
  k.item = item;
  k.spare = spare;
  k.rolling = 0;
}

/** Steps the race, kart 0 on `first`, everyone else coasting with the throttle down. */
function step(race: Race, first = GAS, others = GAS) {
  race.step(PHYSICS_DT, race.karts.map((_, i) => (i === 0 ? first : others)));
  return race.events;
}

describe('rocket start', () => {
  function countdownRace(hopAt: number | null) {
    const race = new Race(track);
    race.addKart(RACERS[0], '100cc', null);
    let hopped = false;
    while (race.time < 0.5) {
      const press = hopAt !== null && !hopped && race.time >= hopAt;
      if (press) hopped = true;
      race.step(PHYSICS_DT, [press ? HOP : GAS]);
    }
    return race.karts[0];
  }

  it('a hop in the last half second before GO launches with a boost', () => {
    const k = countdownRace(-0.3);
    expect(k.launch).toBe('rocket');
    expect(k.state.boostTime).toBeGreaterThan(ROCKET_BOOST - 0.6);
  });

  it('a hop too early bogs the engine: the kart sits after GO', () => {
    const k = countdownRace(-1.4);
    expect(k.launch).toBe('early');
    const fair = countdownRace(null);
    expect(fair.launch).toBe(null);
    expect(k.state.speed).toBeLessThan(fair.state.speed * 0.3);
  });

  it('a hop during the 3 is just a hop', () => {
    expect(countdownRace(-2.8).launch).toBe(null);
  });

  it('CPUs get rocket starts, more of them at higher classes', () => {
    const count = (engine: '50cc' | '150cc') => {
      const race = new Race(track);
      for (let i = 0; i < 12; i++) race.addKart(RACERS[i], engine, { speedCap: 1, driftChance: 0.5, maxTier: 2, wander: 0.5, itemIq: engine === '50cc' ? 0.25 : 0.85 });
      while (race.time < 0.1) race.step(PHYSICS_DT, []);
      return race.karts.filter((k) => k.launch === 'rocket').length;
    };
    expect(count('150cc')).toBeGreaterThan(count('50cc'));
  });
});

describe('slipstream', () => {
  it('tucked in behind a kart at speed, the draft charges and fires a boost', () => {
    const race = humanRace(2);
    const [chaser, leader] = race.karts;
    const top = chaser.params.topSpeed;
    place(chaser, 10, 0, top);
    place(leader, 20, 0, top);
    let fired = false;
    for (let t = 0; t < 2 && !fired; t += PHYSICS_DT) {
      step(race);
      fired = chaser.drafted;
    }
    expect(fired).toBe(true);
    expect(chaser.state.boostTime).toBeGreaterThan(DRAFT_BOOST - 0.1);
    expect(leader.draft).toBe(0);
  });

  it("doesn't charge off to one side", () => {
    const race = humanRace(2);
    const [chaser, leader] = race.karts;
    const top = chaser.params.topSpeed;
    place(chaser, 10, -6, top);
    place(leader, 20, 6, top);
    for (let t = 0; t < 1.5; t += PHYSICS_DT) step(race);
    expect(chaser.draft).toBe(0);
  });
});

describe('trick streaks', () => {
  const flat: DriveEnv = { probe: () => ({ height: 0, surface: 'road' }), collide: () => null };
  const p = kartParams(RACERS[0].stats, '100cc');

  function landTrick(s: ReturnType<typeof createKartState>) {
    Object.assign(s, { y: 1.5, vy: 0, grounded: false, trick: true, boostTime: 0 });
    for (let t = 0; t < 1; t += PHYSICS_DT) {
      const ev = stepKart(s, GAS, p, flat, PHYSICS_DT);
      if (ev.trick) return { ev, boost: s.boostTime };
    }
    throw new Error('never landed');
  }

  it('back-to-back tricks grow the boost, and a pause resets the streak', () => {
    const s = createKartState();
    s.speed = p.topSpeed;
    const a = landTrick(s);
    const b = landTrick(s);
    const c = landTrick(s);
    expect([a.ev.trickStreak, b.ev.trickStreak, c.ev.trickStreak]).toEqual([1, 2, 3]);
    expect(c.boost).toBeCloseTo(TRICK_BOOST * (1 + 2 * TRICK_STREAK_BONUS), 1);
    for (let t = 0; t < 3.5; t += PHYSICS_DT) stepKart(s, GAS, p, flat, PHYSICS_DT);
    expect(landTrick(s).ev.trickStreak).toBe(1);
  });

  it('a kicker launches a kart off its lip, and a hop there is a trick', () => {
    const b = new TrackBuilder({ x: 0, z: -150, h: 0 }, 'Test', { halfWidth: 10 });
    b.straight(40).kicker(7, 1.4).straight(200);
    const def: TrackDef = {
      id: 'kicker',
      name: 'Kicker',
      main: b.finish(false),
      branches: [],
      pits: [],
      boostPads: [],
      checkpoints: [0.5],
      laps: 1,
      bounds: 400,
      landmarks: [],
      itemBoxes: [],
      hazards: [],
      theme: 'speedway',
      music: { lap: 'title' },
    };
    const t = new Track(def);
    const s = createKartState(0, -150, 0);
    s.speed = p.topSpeed;
    let launched = false;
    let trick = false;
    let airborneAt = -1;
    for (let time = 0; time < 3; time += PHYSICS_DT) {
      const lip = s.trickWindow > 0 && airborneAt < 0;
      if (lip) airborneAt = time;
      const ev = stepKart(s, lip ? HOP : GAS, p, t, PHYSICS_DT);
      launched ||= ev.launched;
      trick ||= ev.trick;
    }
    expect(launched).toBe(true);
    expect(trick).toBe(true);
    expect(s.y).toBeGreaterThan(-1);
  });
});

describe('respawn', () => {
  it('comes back quicker, rolling, with a moment of immunity', () => {
    const race = humanRace(1);
    const k = race.karts[0];
    place(k, 50, 0, 20);
    k.state.y = -5;
    k.state.grounded = false;
    let t = 0;
    while (!k.respawned && t < 3) {
      step(race);
      t += PHYSICS_DT;
    }
    expect(k.respawned).toBe(true);
    expect(t).toBeLessThan(RESPAWN_DELAY + 0.1);
    expect(k.state.speed).toBeGreaterThan(5);
    expect(k.state.invulnTime).toBeGreaterThan(1);
  });
});

describe('item boxes', () => {
  function driveInto(race: Race, k: RaceKart) {
    const box = race.items.boxes.find((b) => b.double) ?? race.items.boxes[0];
    Object.assign(k.state, { x: box.x, z: box.z, y: box.y - 1.1, groundY: box.y - 1.1 });
    return step(race);
  }

  it('every box hit is an event, full slot or not', () => {
    const race = humanRace(1);
    const k = race.karts[0];
    give(k, 'fuzzPedal');
    const ev = driveInto(race, k);
    expect(ev.some((e) => e.type === 'box')).toBe(true);
    expect(ev.some((e) => e.type === 'pickup')).toBe(false);
  });

  it('a double box gives a spare, which moves up when the first is used', () => {
    const race = humanRace(1);
    const box = race.items.boxes[0];
    box.double = true;
    const k = race.karts[0];
    const ev = driveInto(race, k);
    expect(ev.some((e) => e.type === 'pickup')).toBe(true);
    expect(k.item).not.toBe(null);
    expect(k.spare).not.toBe(null);
    const spare = k.spare;
    k.rolling = 0;
    place(k, 5);
    step(race, PRESS);
    expect(k.item).toBe(spare);
    expect(k.spare).toBe(null);
  });
});

describe('shields', () => {
  it('a held mine takes a missile for you', () => {
    const race = humanRace(2);
    const [back, front] = race.karts;
    place(back, 20);
    place(front, 32);
    race.step(0, [GAS, GAS]);
    give(back, 'riffMissile');
    give(front, 'microtonalMine', 'fuzzPedal');
    step(race, PRESS);
    let events: ReturnType<typeof step> = [];
    for (let t = 0; t < 2 && !events.some((e) => e.type === 'block' || e.type === 'hit'); t += PHYSICS_DT) events = step(race, GAS, { ...NEUTRAL_INPUT });
    expect(events.find((e) => e.type === 'block')?.kart).toBe(front);
    expect(front.state.spinTime).toBe(0);
    expect(front.item).toBe('fuzzPedal');
  });
});

describe('band items', () => {
  /** Kart 0 fires `item` from 20 m in, with a kart `ahead` metres in front (`lateral` off its line). */
  function fire(item: ItemKind, ahead = 12, lateral = 0) {
    const race = humanRace(2);
    const [me, them] = race.karts;
    place(me, 20, 0, 20);
    place(them, 20 + ahead, lateral, 20);
    race.step(0, [GAS, GAS]);
    give(me, item);
    const events = step(race, PRESS);
    return { race, me, them, events, hit: events.some((e) => e.type === 'hit' && e.kart === them && e.by === item) };
  }

  it('each band member has their own item, likelier for them', () => {
    for (const [id, item] of Object.entries(SIGNATURE_ITEMS)) {
      expect(RACERS.some((r) => r.id === id), id).toBe(true);
      expect(itemWeights(6, 12, item)[item]).toBeGreaterThan(itemWeights(6, 12)[item]);
    }
  });

  it('Flute Flurry wobbles karts in a cone ahead, not off to the side', () => {
    expect(fire('fluteFlurry').them.state.wobbleTime).toBeGreaterThan(1);
    expect(fire('fluteFlurry', 4, 8).hit).toBe(false);
  });

  it('Drum Roll is a battering ram: immune, and spins out whoever it touches', () => {
    const { race, me, them } = fire('drumRoll', 3);
    expect(me.state.ramTime).toBeCloseTo(DRUM_TIME, 1);
    let spun = false;
    for (let t = 0; t < 1 && !spun; t += PHYSICS_DT) spun = step(race, GAS, { ...NEUTRAL_INPUT }).some((e) => e.type === 'hit' && e.by === 'drumRoll' && e.kart === them);
    expect(spun).toBe(true);
    expect(me.state.spinTime).toBe(0);
  });

  it('Bass Drop slows everyone a little way ahead', () => {
    expect(fire('bassDrop', 60).them.state.slowTime).toBeCloseTo(BASS_SLOW, 1);
    expect(fire('bassDrop', 150).hit).toBe(false);
  });

  it('Patch Cable slows the kart ahead and slingshots you', () => {
    const { me, them, hit } = fire('patchCable', 30);
    expect(hit).toBe(true);
    expect(them.state.slowTime).toBeCloseTo(CABLE_TIME, 1);
    expect(me.state.boostTime).toBeGreaterThan(CABLE_TIME);
  });

  it('Harmonica Wail shoves karts ahead aside', () => {
    const { them, events } = fire('harmonicaWail', 8, 1.5);
    const hit = events.find((e) => e.type === 'hit' && e.kart === them);
    expect(hit && hit.type === 'hit' && hit.push).toBeTruthy();
    expect(Math.hypot(them.state.extX, them.state.extZ)).toBeGreaterThan(3);
  });

  it('Keytar Laser spins out the first kart in line, in range', () => {
    expect(fire('keytarLaser', 40).them.state.spinTime).toBeGreaterThan(1);
    expect(fire('keytarLaser', LASER_RANGE + 20).hit).toBe(false);
    expect(fire('keytarLaser', 20, 6).hit).toBe(false);
  });
});

describe('Gizzard Wave', () => {
  function chase(hop: boolean) {
    const race = humanRace(6);
    race.karts.forEach((k, i) => place(k, 10 + i * 3, (i % 3) * 3 - 3, 0));
    const leader = race.karts[5];
    place(leader, 110, 0, 0);
    race.step(0, race.karts.map(() => GAS));
    give(race.karts[0], 'gizzardWave');
    race.step(PHYSICS_DT, race.karts.map((_, i) => (i === 0 ? PRESS : { ...NEUTRAL_INPUT })));
    let result: string | null = null;
    for (let t = 0; t < 10 && !result; t += PHYSICS_DT) {
      const w = race.items.surge;
      // Hop as it arrives.
      const close = !!w && leader.distance - w.d < 3 && leader.state.grounded;
      race.step(PHYSICS_DT, race.karts.map((k) => (k === leader && hop && close ? HOP : { ...NEUTRAL_INPUT })));
      for (const e of race.events) if ((e.type === 'hit' || e.type === 'dodge') && e.by === 'gizzardWave') result = `${e.type}:${race.karts.indexOf(e.kart as RaceKart)}`;
    }
    return { result, race };
  }

  it('rolls under everyone to the leader and spins them out', () => {
    const { result, race } = chase(false);
    expect(result).toBe('hit:5');
    expect(race.karts.slice(1, 5).every((k) => k.state.spinTime === 0)).toBe(true);
  });

  it('a leader who hops as it arrives rides over it', () => {
    expect(chase(true).result).toBe('dodge:5');
  });

  it('only one is ever out at a time, and only for the back of a big field', () => {
    for (let pos = 1; pos <= 3; pos++) expect(itemWeights(pos, 12).gizzardWave).toBe(0);
    expect(itemWeights(4, 4).gizzardWave).toBe(0);
    expect(itemWeights(10, 12).gizzardWave).toBeGreaterThan(0);
  });
});

describe('online', () => {
  it('puts the Drum Roll on the wire', () => {
    const s = createKartState();
    s.ramTime = 2.5;
    const out = createKartState();
    unpackKart(packKart(s), out);
    expect(out.ramTime).toBe(2.5);
  });

  it('the room tells a player who hit them with what, and sends band item fx in snapshots', () => {
    const start = { race: 1, at: 0, seed: 3, settings: { track: 1, engine: '100cc' as const }, grid: RACERS.slice(0, 2).map((r, i) => ({ racerId: r.id, playerId: i === 1 ? 'p' : null })) };
    const room = new RoomRace(start, 0);
    const [cpu, human] = room.race.karts;
    place(cpu, 20, 0, 20);
    place(human, 50, 0, 20);
    room.race.step(0, []);
    give(cpu, 'keytarLaser');
    cpu.driver = null;
    cpu.pendingUse = true;
    cpu.remote = true;
    const fx = room.step(PHYSICS_DT).get('p') ?? [];
    expect(fx.find((e) => e.by === 'keytarLaser')).toMatchObject({ k: 'spin', f: 0 });
    const snap = room.snapshot();
    expect(snap.fx.some((b) => ITEM_KINDS[b[0]] === 'keytarLaser')).toBe(true);
    expect(snap.it[0]).toHaveLength(3);
  });
});
