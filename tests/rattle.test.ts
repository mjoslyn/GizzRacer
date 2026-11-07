import { describe, expect, it } from 'vitest';
import { CPU_SKILL, CpuDriver } from '../src/ai/cpuDriver';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { Race, type RaceKart } from '../src/core/race';
import { ITEMS, ITEM_KINDS, RATTLE_BOUNCES, RATTLE_SPEED, RATTLE_SPIN, SHIELD_ITEMS, TRAIL_BACK, TRAIL_RAM_SPIN, itemWeights, trailPoint, type ItemEvent, type ItemKind } from '../src/items/items';
import { OnlineRace } from '../src/net/onlineRace';
import type { RoomStart } from '../src/net/protocol';
import { RoomRace } from '../src/net/roomRace';
import { RACERS } from '../src/physics/racers';
import { TrackBuilder } from '../src/tracks/builder';
import { GEN_LAYOUT, generateTrack } from '../src/tracks/generator';
import { pointAt } from '../src/tracks/spline';
import { Track } from '../src/tracks/track';
import { TRACK_LIST } from '../src/tracks/index';

const GAS = { ...NEUTRAL_INPUT, throttle: 1 };
const PRESS = { ...NEUTRAL_INPUT, item: true, itemPressed: true };
const BACK = { ...PRESS, lookBack: true };

/** A long flat straight, 20 m across, walled both sides, or open with a drop into a pit down each. */
function straightTrack(walls: boolean): Track {
  const b = new TrackBuilder({ x: 0, z: -350, h: 0 }, 'Test', { halfWidth: 10, wallHeight: walls ? 1.5 : 0 });
  b.straight(700);
  const pits = walls ? [] : [-1, 1].map((side) => ({ x: side * 27, z: 0, heading: 0, halfLength: 400, halfWidth: 15, depth: 12 }));
  return new Track({ id: 'straight', name: 'Straight', main: b.finish(false), branches: [], pits, boostPads: [], checkpoints: [0.5], laps: 1, bounds: 400, landmarks: [], itemBoxes: [], hazards: [], theme: 'speedway', music: { lap: 'title' } });
}
const walled = straightTrack(true);
const open = straightTrack(false);

function humanRace(n: number, t = walled) {
  const race = new Race(t);
  for (let i = 0; i < n; i++) race.addKart(RACERS[i], '100cc', null);
  race.time = 0;
  return race;
}

/** Puts a kart `s` metres down the road, `lateral` off the centre line, facing down it (turned `turn` rad left). */
function place(k: RaceKart, s: number, lateral = 0, t = walled, turn = 0) {
  const p = pointAt(t.spline, s);
  const tl = Math.hypot(p.tx, p.tz);
  Object.assign(k.state, { x: p.x - (p.tz / tl) * lateral, z: p.z + (p.tx / tl) * lateral, heading: Math.atan2(p.tx, p.tz) + turn, speed: 0, trackHint: -1 });
  k.state.y = k.state.groundY = t.main.heightAt(s);
  k.progressS = s;
  k.distance = s;
}

function give(k: RaceKart, item: ItemKind, spare: ItemKind | null = null) {
  k.item = item;
  k.spare = spare;
  k.rolling = 0;
}

/** Steps `secs` with each kart on its input (the first step only: the rest coast), collecting the events. */
function run(race: Race, secs: number, first: (typeof NEUTRAL_INPUT)[] = [], until?: (e: ItemEvent[]) => boolean): ItemEvent[] {
  const all: ItemEvent[] = [];
  for (let t = 0; t < secs; t += PHYSICS_DT) {
    race.step(PHYSICS_DT, race.karts.map((_, i) => (t === 0 ? first[i] : undefined) ?? NEUTRAL_INPUT));
    all.push(...race.events);
    if (until?.(race.events)) break;
  }
  return all;
}

describe('Rattlesnake', () => {
  it('is a new kind on the end, trails like the banana and the wasp, and comes out of the box everywhere, likelier up front', () => {
    expect(ITEM_KINDS[ITEM_KINDS.length - 1]).toBe('rattle');
    expect(ITEMS.rattle.name).toBe('Rattlesnake Rattle');
    expect(SHIELD_ITEMS).toEqual(expect.arrayContaining(['microtonalMine', 'riffMissile', 'rattle']));
    for (const pos of [1, 4, 8]) expect(itemWeights(pos, 8).rattle).toBeGreaterThan(0);
    expect(itemWeights(1, 8).rattle).toBeGreaterThan(itemWeights(8, 8).rattle);
  });

  it('skitters straight down the road along the ground, fast', () => {
    const race = humanRace(1);
    const [me] = race.karts;
    place(me, 50);
    give(me, 'rattle');
    run(race, 0.5, [PRESS]);
    expect(me.item).toBe(null);
    const r = race.items.rattles[0];
    expect(r).toBeDefined();
    // Half a second at its speed, from 2.4 m in front of the kart, dead straight down the middle.
    const p = pointAt(walled.spline, 50);
    const along = (r.x - p.x) * p.tx + (r.z - p.z) * p.tz;
    expect(along).toBeGreaterThan(RATTLE_SPEED * 0.45);
    expect(along).toBeLessThan(RATTLE_SPEED * 0.5 + 4);
    expect(Math.abs((r.x - p.x) * -p.tz + (r.z - p.z) * p.tx)).toBeLessThan(0.1);
    expect(r.y).toBeCloseTo(walled.main.heightAt(50 + along), 1);
    expect(r.bounces).toBe(0);
  });

  it('thrown backward (braking or looking back), it goes back down the road', () => {
    const race = humanRace(1);
    const [me] = race.karts;
    place(me, 300);
    give(me, 'rattle');
    run(race, 0.3, [BACK]);
    const p = pointAt(walled.spline, 300);
    const r = race.items.rattles[0];
    expect((r.x - p.x) * p.tx + (r.z - p.z) * p.tz).toBeLessThan(-RATTLE_SPEED * 0.25);
  });

  it('bounces off the walls, staying on the road, and breaks after its last bounce', () => {
    const race = humanRace(1);
    const [me] = race.karts;
    // Thrown across the road at 50 degrees: it zigzags wall to wall.
    place(me, 30, 0, walled, 0.87);
    give(me, 'rattle');
    let seen = 0;
    let headings = new Set<number>();
    for (let t = 0; t < 4 && (t === 0 || race.items.rattles.length); t += PHYSICS_DT) {
      race.step(PHYSICS_DT, [t === 0 ? PRESS : NEUTRAL_INPUT]);
      const r = race.items.rattles[0];
      if (!r) break;
      seen = r.bounces;
      headings.add(Math.round(r.heading * 100));
      const loc = walled.locate(r.x, r.z, r.y + 1);
      expect(loc.onRoad).toBe(true);
    }
    expect(seen).toBe(RATTLE_BOUNCES);
    // It zigzagged: the heading flipped back and forth across the road, not just one way.
    expect(headings.size).toBeGreaterThanOrEqual(2);
    expect(race.items.rattles.length).toBe(0);
  });

  it('goes over an open edge and is gone', () => {
    const race = humanRace(1, open);
    const [me] = race.karts;
    place(me, 30, 0, open, 1.2);
    give(me, 'rattle');
    run(race, 1, [PRESS]);
    expect(race.items.rattles.length).toBe(0);
  });

  it('spins out the first kart it meets, then breaks', () => {
    const race = humanRace(3);
    const [me, near, far] = race.karts;
    place(me, 50);
    place(near, 80);
    place(far, 110);
    give(me, 'rattle');
    const events = run(race, 1.5, [PRESS], (e) => e.some((x) => x.type === 'hit'));
    const hit = events.find((e) => e.type === 'hit');
    expect(hit).toMatchObject({ kart: near, by: 'rattle', from: me });
    expect(near.state.spinTime).toBeGreaterThan(RATTLE_SPIN - 0.2);
    expect(far.state.spinTime).toBe(0);
    expect(race.items.rattles.length).toBe(0);
  });

  it('spares its thrower until it has come back off a wall', () => {
    const race = humanRace(1);
    const [me] = race.karts;
    place(me, 300);
    give(me, 'rattle');
    run(race, 0.4, [BACK]);
    expect(me.state.spinTime).toBe(0);
  });
});

describe('trailing items', () => {
  it('sit behind the kart while held, not while the roulette spins', () => {
    const race = humanRace(1);
    const [me] = race.karts;
    place(me, 100);
    give(me, 'rattle');
    const t = trailPoint(me)!;
    expect(Math.hypot(t.x - me.state.x, t.z - me.state.z)).toBeCloseTo(TRAIL_BACK, 5);
    me.rolling = 0.5;
    expect(trailPoint(me)).toBe(null);
    give(me, 'fuzzPedal');
    expect(trailPoint(me)).toBe(null);
  });

  for (const held of ['rattle', 'microtonalMine', 'riffMissile'] as const) {
    it(`a trailing ${ITEMS[held].name} takes a Rattlesnake from behind, and both break`, () => {
      const race = humanRace(2);
      const [back, front] = race.karts;
      place(back, 40);
      place(front, 80);
      give(front, held, 'fuzzPedal');
      give(back, 'rattle');
      const events = run(race, 1.5, [PRESS], (e) => e.some((x) => x.type === 'block' || x.type === 'hit'));
      expect(events.find((e) => e.type === 'block')).toMatchObject({ kart: front, by: 'rattle', from: back });
      expect(events.some((e) => e.type === 'hit')).toBe(false);
      expect(front.state.spinTime).toBe(0);
      // The spare moves up into the slot.
      expect(front.item).toBe('fuzzPedal');
      expect(race.items.rattles.length).toBe(0);
    });
  }

  it("doesn't stop one coming from the front", () => {
    const race = humanRace(2);
    const [thrower, holder] = race.karts;
    place(thrower, 300);
    place(holder, 260);
    give(holder, 'microtonalMine');
    give(thrower, 'rattle');
    // Thrown back down the road at the holder's nose.
    const events = run(race, 1.5, [BACK], (e) => e.some((x) => x.type === 'block' || x.type === 'hit'));
    expect(events.find((e) => e.type === 'hit')).toMatchObject({ kart: holder, by: 'rattle' });
    expect(holder.item).toBe('microtonalMine');
  });

  for (const held of ['rattle', 'microtonalMine', 'riffMissile'] as const) {
    it(`running into a trailing ${ITEMS[held].name} spins you out, and its holder loses it`, () => {
      const race = humanRace(2);
      const [holder, rammer] = race.karts;
      place(holder, 100);
      place(rammer, 100 - TRAIL_BACK - 2.2);
      give(holder, held);
      // The rammer comes up fast behind.
      rammer.state.speed = 20;
      const events = run(race, 0.5, [], (e) => e.some((x) => x.type === 'hit'));
      expect(events.find((e) => e.type === 'hit')).toMatchObject({ kart: rammer, by: held, from: holder, rammed: true });
      expect(rammer.state.spinTime).toBeGreaterThan(TRAIL_RAM_SPIN - 0.2);
      expect(holder.item).toBe(null);
      expect(holder.state.spinTime).toBe(0);
    });
  }

  it("an immune kart only breaks it: no spin, and the holder still loses it", () => {
    const race = humanRace(2);
    const [holder, rammer] = race.karts;
    place(holder, 100);
    place(rammer, 100 - TRAIL_BACK - 2.2);
    give(holder, 'microtonalMine');
    rammer.state.speed = 20;
    rammer.state.invulnTime = 2;
    const events = run(race, 0.5, [], (e) => e.some((x) => x.type === 'block'));
    expect(events.find((e) => e.type === 'block')).toMatchObject({ kart: holder, by: 'microtonalMine', from: rammer });
    expect(rammer.state.spinTime).toBe(0);
    expect(holder.item).toBe(null);
  });
});

describe('CPUs and trailing items', () => {
  it('steer round a trailing item: it is on their list of things to avoid, moving with its kart', () => {
    const race = humanRace(2);
    const [holder] = race.karts;
    place(holder, 100);
    holder.state.speed = 15;
    give(holder, 'rattle');
    race.step(PHYSICS_DT, [GAS, NEUTRAL_INPUT]);
    const t = trailPoint(holder)!;
    const ob = race.obstacleList.find((o) => Math.hypot(o.x - t.x, o.z - t.z) < 1.5);
    expect(ob).toBeDefined();
    expect(Math.hypot(ob!.vx, ob!.vz)).toBeGreaterThan(10);
  });

  it("don't ram a slow kart's trailing item from behind", () => {
    let rams = 0;
    for (const lateral of [-1, 0, 1]) {
      const race = new Race(walled);
      const holder = race.addKart(RACERS[0], '100cc', null);
      const cpu = race.addKart(RACERS[1], '150cc', { ...CPU_SKILL['150cc'], itemIq: 1, wander: 0 });
      race.time = 0;
      place(holder, 100, lateral);
      place(cpu, 60, lateral);
      holder.state.speed = 12;
      cpu.state.speed = 30;
      give(holder, 'microtonalMine');
      for (let t = 0; t < 6; t += PHYSICS_DT) {
        // The holder crawls on down the middle; it keeps its banana out the whole way.
        race.step(PHYSICS_DT, [{ ...NEUTRAL_INPUT, throttle: 0.3 }, NEUTRAL_INPUT]);
        if (race.events.some((e) => e.type === 'hit' && e.rammed)) rams++;
        holder.item = 'microtonalMine';
        cpu.item = null;
      }
      // It got past.
      expect(cpu.distance).toBeGreaterThan(holder.distance);
    }
    expect(rams).toBe(0);
  });

  it('keep a trailing item out while something is coming for them from behind', () => {
    const smart = { ...CPU_SKILL['200cc'], itemIq: 1 };
    const race = humanRace(2);
    const [me, them] = race.karts;
    place(me, 100);
    place(them, 92);
    for (const item of ['microtonalMine', 'riffMissile', 'rattle'] as const) {
      const d = new CpuDriver(smart, 3);
      const others = race.karts.map((k) => k.state);
      // With a kart right on its tail it would drop the banana, or throw the rattle back; not with a rattle coming too.
      const wants = (threat: boolean) => d.wantsItem(item, 2, me.state, 2, me.progressS, walled, others, threat);
      expect(wants(true)).toBe(false);
      if (item !== 'riffMissile') expect(wants(false)).toBe(true);
    }
    // A Rattlesnake on its way up the road at it is a threat; one going away isn't.
    give(them, 'rattle');
    run(race, PHYSICS_DT, [NEUTRAL_INPUT, PRESS]);
    expect(race.items.threatened(me)).toBe(true);
    expect(race.items.threatened(them)).toBe(false);
  });

  it('throw a Rattlesnake back at a kart on their tail, and ahead at one in line on a straight', () => {
    const d = new CpuDriver({ ...CPU_SKILL['200cc'], itemIq: 1 }, 5);
    const race = humanRace(2);
    const [me, them] = race.karts;
    place(me, 100);
    place(them, 92);
    const others = race.karts.map((k) => k.state);
    expect(d.wantsItem('rattle', 2, me.state, 1, 100, walled, others)).toBe(true);
    expect(d.aimBack).toBe(true);
    place(them, 130);
    expect(d.wantsItem('rattle', 2, me.state, 2, 100, walled, others)).toBe(true);
    expect(d.aimBack).toBe(false);
  });
});

describe('Rattlesnakes in a race', () => {
  it('come out of the boxes and get thrown by CPUs, at a sensible share', () => {
    const track = new Track(TRACK_LIST[0].build());
    const race = new Race(track, 7);
    for (let i = 0; i < 8; i++) race.addKart(RACERS[i], '150cc', CPU_SKILL['150cc']);
    const uses = new Map<ItemKind, number>();
    let hits = 0;
    while (race.time < 120 && !race.finished) {
      race.step(PHYSICS_DT, []);
      for (const e of race.events) {
        if (e.type === 'use') uses.set(e.item, (uses.get(e.item) ?? 0) + 1);
        if (e.type === 'hit' && (e.by === 'rattle' || e.rammed)) hits++;
      }
    }
    const total = [...uses.values()].reduce((a, b) => a + b, 0);
    const rattles = uses.get('rattle') ?? 0;
    expect(rattles).toBeGreaterThan(0);
    expect(rattles / total).toBeLessThan(0.3);
    expect(hits).toBeGreaterThanOrEqual(0);
  });

  it('run on a generated track and are gone by the end of their life', () => {
    const track = new Track(generateTrack({ seed: 11, theme: 'desert', complexity: 4, length: 'medium', layout: GEN_LAYOUT }));
    const race = new Race(track);
    const k = race.addKart(RACERS[0], '100cc', null);
    race.time = 0;
    const pose = track.respawnPose(60);
    Object.assign(k.state, { x: pose.x, z: pose.z, y: pose.y, groundY: pose.y, heading: pose.heading + 0.5 });
    give(k, 'rattle');
    run(race, 0.2, [PRESS]);
    for (const r of race.items.rattles) expect(Number.isFinite(r.x + r.y + r.z)).toBe(true);
    run(race, 7);
    expect(race.items.rattles.length).toBe(0);
  });
});

describe('Rattlesnakes online', () => {
  const start: RoomStart = { race: 1, at: 0, seed: 3, grid: [{ racerId: RACERS[0].id, playerId: 'p' }, { racerId: RACERS[1].id, playerId: null }], settings: { track: 0, engine: '100cc' } };

  it('a player throws one back through the room; it goes over the wire and keeps its identity on the client', () => {
    const room = new RoomRace(start, 0);
    room.race.time = 1;
    const me = room.race.karts[0];
    give(me, 'rattle');
    room.useItem('p', true);
    room.step(PHYSICS_DT);
    expect(room.race.items.rattles.length).toBe(1);
    const snap = room.snapshot();
    expect(snap.rat).toHaveLength(1);
    expect(snap.rat![0][5]).toBe(0);
    // Thrown backward: behind the kart.
    const r = room.race.items.rattles[0];
    expect(r.x * Math.sin(me.state.heading) + r.z * Math.cos(me.state.heading)).toBeLessThan(me.state.x * Math.sin(me.state.heading) + me.state.z * Math.cos(me.state.heading));

    const client = new Race(new Track(TRACK_LIST[0].build()), 3);
    client.addKart(RACERS[0], '100cc', null);
    client.addKart(RACERS[1], '100cc', null);
    const net = new OnlineRace(client, client.karts[0]);
    net.receive(snap, 0);
    net.update(1);
    const mirrored = client.items.rattles[0];
    expect(mirrored).toBeDefined();
    room.step(PHYSICS_DT);
    net.receive(room.snapshot(), 0.1);
    net.update(1.1);
    expect(client.items.rattles[0]).toBe(mirrored);
  });

  it("running into a trailing item reaches the player as a spin", () => {
    const room = new RoomRace(start, 0);
    room.race.time = 1;
    const [player, cpu] = room.race.karts;
    give(cpu, 'microtonalMine');
    cpu.driver = null;
    const t = trailPoint(cpu)!;
    const s = { ...player.state, x: t.x, z: t.z, y: cpu.state.y, groundY: cpu.state.y };
    player.state.x = s.x;
    player.state.z = s.z;
    player.state.y = s.y;
    const fx = room.step(PHYSICS_DT).get('p') ?? [];
    expect(fx).toContainEqual(expect.objectContaining({ k: 'spin', t: TRAIL_RAM_SPIN, by: 'microtonalMine', r: 1 }));
    expect(cpu.item).toBe(null);
  });
});
