import { clamp, seededRandom } from '../core/math';
import type { InputFrame } from '../core/inputFrame';
import { KART_RADIUS, spinOut, slowDown, wobble, type KartState } from '../physics/kart';
import { pointAt } from '../tracks/spline';
import type { Track } from '../tracks/track';
import type { HazardKind } from './hazards';

/**
 * Spec section 6. The kinds keep the names they were built under; what
 * players see are the Gizzverse names in ITEMS. New kinds go on the end:
 * online snapshots send an item as its index in ITEM_KINDS.
 */
export type ItemKind =
  | 'fuzzPedal'
  | 'microtonalMine'
  | 'feedbackWave'
  | 'riffMissile'
  | 'tempoShift'
  | 'wooCannon'
  | 'fluteFlurry'
  | 'drumRoll'
  | 'bassDrop'
  | 'patchCable'
  | 'harmonicaWail'
  | 'keytarLaser'
  | 'gizzardWave'
  | 'drippingTap';

export const ITEMS: Record<ItemKind, { name: string }> = {
  fuzzPedal: { name: 'Mind Fuzz' },
  microtonalMine: { name: 'Microtonal Banana' },
  feedbackWave: { name: 'Nuclear Fusion' },
  riffMissile: { name: 'Big Fig Wasp' },
  tempoShift: { name: 'Horology' },
  wooCannon: { name: 'Woo Cannon' },
  // The band's own, one each.
  fluteFlurry: { name: 'Sleep Drifter' },
  drumRoll: { name: 'Road Train' },
  bassDrop: { name: 'Superheavy' },
  patchCable: { name: 'The Silver Cord' },
  harmonicaWail: { name: 'Boogieman Sam' },
  keytarLaser: { name: 'Gamma Knife' },
  gizzardWave: { name: 'Nonagon Infinity' },
  // The long jam, for the back of the field: a boost that keeps dripping.
  drippingTap: { name: 'The Dripping Tap' },
};
export const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];

/** Each band member's own item, a little likelier out of the box for them. */
export const SIGNATURE_ITEMS: Record<string, ItemKind> = {
  'stu-mackenzie': 'fluteFlurry',
  'michael-cavanagh': 'drumRoll',
  'lucas-harwood': 'bassDrop',
  'joey-walker': 'patchCable',
  'ambrose-kenny-smith': 'harmonicaWail',
  'cook-craig': 'keytarLaser',
};
const SIGNATURE_BIAS = 2;

/** Held in the slot, these guard your back: they take a missile or a mine for you, and are gone. */
export const SHIELD_ITEMS: readonly ItemKind[] = ['microtonalMine', 'riffMissile'];

/** How long Horology slows a kart in `position` of `karts`: longest for the leader, shortest for last. */
export function tempoSlowFor(position: number, karts: number): number {
  const p = karts > 1 ? (position - 1) / (karts - 1) : 0;
  return TEMPO_SLOW_FIRST + (TEMPO_SLOW_LAST - TEMPO_SLOW_FIRST) * Math.min(1, Math.max(0, p));
}

export const FUZZ_BOOST = 1.2;
/** The Dripping Tap: one long boost, back-of-the-field only. */
export const DRIP_BOOST = 3.2;
export const MINE_WOBBLE = 1.5;
export const WAVE_RANGE = 8;
export const WAVE_SPIN = 1.0;
export const MISSILE_SPIN = 1.2;
/** Horology slows the leader longest and the back of the field least (seconds, first to last). */
export const TEMPO_SLOW_FIRST = 4;
export const TEMPO_SLOW_LAST = 1.5;
/**
 * Woo Cannon: it flies until it has caught the pack and gone a varying
 * distance past it (Race.aimCannon), at a multiple of the kart's own top
 * speed, never shorter than the least nor longer than the most seconds;
 * and the spin it gives anyone in the way.
 */
export const CANNON_TIME = 9;
export const CANNON_MIN_TIME = 1.5;
export const CANNON_PAST_MIN = 5;
export const CANNON_PAST_MAX = 45;
export const CANNON_SPEED_MUL = 1.9;
/** The further behind the kart it's chasing, the faster it flies: up to this much more top speed, from CANNON_FAR_FROM metres back to CANNON_FAR metres. */
export const CANNON_FAR_BOOST = 1.3;
export const CANNON_FAR_FROM = 40;
export const CANNON_FAR = 300;
export const CANNON_SPIN = 1.0;
/** Sleep Drifter: a spray of notes in a cone ahead that sends steering out of tune. */
export const FLUTE_RANGE = 26;
export const FLUTE_CONE = 0.5;
export const FLUTE_WOBBLE = 1.3;
/** Road Train: seconds as a battering ram (race.ts bumps). */
export const DRUM_TIME = 3;
/** Superheavy: slows every kart up to this far ahead of you, for this long. */
export const BASS_RANGE = 90;
export const BASS_SLOW = 1.6;
/** Silver Cord: latches onto the nearest kart ahead in range, slows it and slingshots you. */
export const CABLE_RANGE = 55;
export const CABLE_TIME = 1.5;
export const CABLE_BOOST = 2.2;
/** Boogieman Sam: shoves karts in a cone ahead aside (an impulse, m/s), wobbles them, and gives you a little boost. */
export const HARMONICA_RANGE = 20;
export const HARMONICA_CONE = 0.7;
export const HARMONICA_PUSH = 16;
export const HARMONICA_WOBBLE = 0.6;
export const HARMONICA_BOOST = 0.6;
/** Gamma Knife: a straight beam ahead; the first kart in it spins out. */
export const LASER_RANGE = 70;
export const LASER_WIDTH = 1.8;
export const LASER_SPIN = 1.2;
/**
 * Nonagon Infinity: rolls down the road under everyone to the leader, fast,
 * then closes in at a readable pace; a leader in the air (or just off a
 * hop) when it arrives rides over it.
 */
export const SURGE_FAST = 80;
export const SURGE_CLOSE = 60;
export const SURGE_CLOSING = 22;
export const SURGE_SPIN = 1.8;
export const SURGE_DODGE = 0.32;
const SURGE_LIFE = 25;
/** Metres behind the middle of the field past which an item box always gives a Woo Cannon. */
export const FAR_BEHIND = 250;
export const BOX_RESPAWN = 3;
/** Seconds the item roulette spins before the item lands in the slot. */
export const ROULETTE = 1;
const BOX_RADIUS = 1.4;
const MINE_RADIUS = 1.2;
const MINE_ARM = 0.4;
const MAX_MINES = 12;
const MISSILE_SPEED = 55;
const MISSILE_LIFE = 7;
const MISSILE_HOMING_RANGE = 28;
const MISSILE_TURN = 4; // rad/s once homing

/** A racer, as far as the item system cares. */
export interface ItemHolder {
  state: KartState;
  readonly params: { mass: number };
  position: number;
  progressS: number;
  /** Continuous distance raced. */
  distance: number;
  readonly finished: boolean;
  /** Driven somewhere else (online): its hits are settled where it's driven. */
  remote: boolean;
  /** The item this racer gets a little more often. */
  readonly signature: ItemKind | null;
  item: ItemKind | null;
  /** A second item from a double box; it moves into the slot when the first is used. */
  spare: ItemKind | null;
  /** Roulette time left before `item` is usable; > 0 while spinning. */
  rolling: number;
  /** Seconds the current item has been held. */
  held: number;
  /** Metres behind the middle of the field (0 when level or ahead). */
  behind: number;
}

export interface ItemBox {
  x: number;
  y: number;
  z: number;
  /** Seconds until it's back; 0 = available. */
  respawn: number;
  /** Holds two items. */
  double: boolean;
}

export interface Mine {
  x: number;
  y: number;
  z: number;
  owner: ItemHolder;
  arm: number;
}

export interface Missile {
  x: number;
  y: number;
  z: number;
  heading: number;
  /** Arc length along the main centerline while it follows the road. */
  s: number;
  owner: ItemHolder;
  target: ItemHolder | null;
  homing: boolean;
  life: number;
}

export interface Wave {
  x: number;
  y: number;
  z: number;
  age: number;
}

/** A band item going off, for looks: where, which way, and who it's from and to. */
export interface Burst {
  kind: ItemKind;
  x: number;
  y: number;
  z: number;
  heading: number;
  age: number;
  life: number;
  /** Reach (m): the laser's beam, the bass drop's ring. */
  len: number;
  from: ItemHolder | null;
  to: ItemHolder | null;
}

/** A Nonagon Infinity rolling down the road after the leader. */
export interface Surge {
  /** Race distance it has reached. */
  d: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  owner: ItemHolder;
  target: ItemHolder | null;
  age: number;
  /** A CPU target has rolled for its dodge. */
  dodgeRolled: boolean;
}

export type ItemEvent =
  /** `spare`: the second item from a double box. */
  | { type: 'pickup'; kart: ItemHolder; spare?: boolean }
  | { type: 'use'; kart: ItemHolder; item: ItemKind }
  /** Drove through an item box, full slot or not. */
  | { type: 'box'; kart: ItemHolder; double: boolean; x: number; y: number; z: number }
  /** `from` is whoever fired the item; absent for hazards. `push` is a shove (m/s, world) that came with it. */
  | { type: 'hit'; kart: ItemHolder; by: ItemKind | HazardKind; from?: ItemHolder; push?: [number, number] }
  /** A held item took the hit instead. */
  | { type: 'block'; kart: ItemHolder; by: ItemKind; from?: ItemHolder }
  /** Rode over a Nonagon Infinity. */
  | { type: 'dodge'; kart: ItemHolder; by: ItemKind; from?: ItemHolder }
  /** Used a hazard well: a ghost light's core, a wreck as a ramp, a stone rammed on a boost, a wave surfed. */
  | { type: 'bonus'; kart: ItemHolder; by: HazardKind };

/** Horology comes out of the box from this far back (0 leading .. 1 last); the Woo Cannon from COMEBACK_CANNON. */
export const COMEBACK_HOROLOGY = 0.6;
export const COMEBACK_CANNON = 0.7;
/** The Dripping Tap is for the back half. */
export const COMEBACK_TAP = 0.5;

/**
 * Item odds by race position (spec section 6): `p` runs from 0 (leading)
 * to 1 (last). Fuzz everywhere, mines up front, waves mid-pack, missiles
 * from the middle back. The comeback items start in the back half of the
 * field, not the last two or three places: in a field of twelve a bad hit
 * on lap 2 puts you 8th, and 8th used to get nothing but fuzz. Horology
 * from 60% back, the Woo Cannon from 70%, the Dripping Tap from halfway,
 * all likelier the further back.
 */
export function itemWeights(position: number, karts: number, signature: ItemKind | null = null): Record<ItemKind, number> {
  const p = karts > 1 ? (position - 1) / (karts - 1) : 0;
  const back = (from: number) => (p >= from - 1e-9 ? (p - from) / Math.max(1e-9, 1 - from) : -1);
  const w: Record<ItemKind, number> = {
    fuzzPedal: 2 + 2 * p,
    microtonalMine: 4 * (1 - p),
    feedbackWave: 4 * Math.max(0, 1 - Math.abs(p - 0.5) * 2),
    riffMissile: position === 1 ? 0 : 3.5 * Math.min(1, p * 1.6),
    tempoShift: karts > 2 && back(COMEBACK_HOROLOGY) >= 0 ? 1 + 2 * back(COMEBACK_HOROLOGY) : 0,
    wooCannon: karts > 3 && back(COMEBACK_CANNON) >= 0 ? 1 + 2.5 * back(COMEBACK_CANNON) : 0,
    drippingTap: karts > 2 && back(COMEBACK_TAP) >= 0 ? 1 + 1.5 * back(COMEBACK_TAP) : 0,
    // The band's own: something for every place, the ones that reach ahead only for those behind.
    fluteFlurry: 1.4 * (1 - 0.5 * p),
    drumRoll: 1 + 0.8 * p,
    bassDrop: position === 1 ? 0 : 1.4 * Math.min(1, p * 2),
    patchCable: position === 1 ? 0 : 1.5 * Math.min(1, p * 1.8),
    harmonicaWail: 1.3,
    keytarLaser: position === 1 ? 0 : 1.3,
    // For the back half of a big field only.
    gizzardWave: karts >= 6 && position >= 4 ? 0.6 + 1.2 * p : 0,
  };
  if (signature) w[signature] *= SIGNATURE_BIAS;
  return w;
}

export function rollItem(position: number, karts: number, rand: () => number, signature: ItemKind | null = null, exclude: ItemKind | null = null): ItemKind {
  const w = itemWeights(position, karts, signature);
  if (exclude) w[exclude] = 0;
  const total = ITEM_KINDS.reduce((a, k) => a + w[k], 0);
  let r = rand() * total;
  for (const k of ITEM_KINDS) {
    r -= w[k];
    if (r <= 0 && w[k] > 0) return k;
  }
  return 'fuzzPedal';
}

/** Item boxes, dropped mines, missiles in flight, wave rings and the band's items for one race. */
export class ItemSystem {
  readonly boxes: ItemBox[] = [];
  readonly mines: Mine[] = [];
  readonly missiles: Missile[] = [];
  readonly waves: Wave[] = [];
  readonly bursts: Burst[] = [];
  /** The Nonagon Infinity in flight; one at a time. */
  surge: Surge | null = null;
  private readonly rand: () => number;

  constructor(
    private readonly track: Track,
    seed = 1,
    /** False for Time Trial: no boxes on the road. */
    withBoxes = true,
  ) {
    this.rand = seededRandom(seed);
    for (const row of withBoxes ? track.def.itemBoxes : []) {
      const ribbon = track.ribbon(row.ribbon ?? -1);
      const s = row.s * ribbon.scale;
      const p = pointAt(ribbon.spline, s);
      const hw = row.span !== undefined ? row.span / 2 : ribbon.halfWidthAtS(s) * 0.7;
      const tl = Math.hypot(p.tx, p.tz) || 1;
      for (let i = 0; i < row.count; i++) {
        const lat = (row.lateral ?? 0) + (row.count > 1 ? -hw + (2 * hw * i) / (row.count - 1) : 0);
        const x = p.x - (p.tz / tl) * lat;
        const z = p.z + (p.tx / tl) * lat;
        this.boxes.push({ x, y: ribbon.heightAt(s) + 1.1, z, respawn: 0, double: !!row.double });
      }
    }
  }

  /** `use[i]` is true when kart i pressed its item button this tick. */
  update(dt: number, karts: readonly ItemHolder[], use: readonly boolean[]): ItemEvent[] {
    const events: ItemEvent[] = [];
    this.pickups(dt, karts, events);
    karts.forEach((k, i) => {
      if (k.rolling > 0) k.rolling = Math.max(0, k.rolling - dt);
      if (k.item && k.rolling === 0) k.held += dt;
      if (use[i] && k.item && k.rolling === 0 && k.state.spinTime === 0) {
        const item = k.item;
        nextItem(k);
        this.fire(item, k, karts, events);
        events.push({ type: 'use', kart: k, item });
      }
    });
    this.updateMines(dt, karts, events);
    this.updateMissiles(dt, karts, events);
    this.updateSurge(dt, karts, events);
    for (const w of this.waves) w.age += dt;
    while (this.waves.length && this.waves[0].age > 0.8) this.waves.shift();
    for (const b of this.bursts) b.age += dt;
    for (let i = this.bursts.length - 1; i >= 0; i--) if (this.bursts[i].age > this.bursts[i].life) this.bursts.splice(i, 1);
    return events;
  }

  /**
   * A CPU's hop over a Nonagon Infinity coming for it: it rolls once, on its
   * driver's dice, when the wave is a moment away.
   */
  dodge(k: ItemHolder, input: InputFrame, driver: { roll(chance: number): boolean; skill: { itemIq: number } }): InputFrame {
    const w = this.surge;
    if (!w || w.target !== k || w.dodgeRolled || !k.state.grounded) return input;
    const closing = Math.max(1, SURGE_CLOSING);
    if ((k.distance - w.d) / closing > 0.12) return input;
    w.dodgeRolled = true;
    return driver.roll(0.75 * driver.skill.itemIq) ? { ...input, driftPressed: true, drift: false } : input;
  }

  private pickups(dt: number, karts: readonly ItemHolder[], events: ItemEvent[]): void {
    for (const box of this.boxes) {
      if (box.respawn > 0) {
        box.respawn = Math.max(0, box.respawn - dt);
        continue;
      }
      for (const k of karts) {
        const s = k.state;
        if (Math.hypot(s.x - box.x, s.z - box.z) > BOX_RADIUS + KART_RADIUS || Math.abs(s.y + 1 - box.y) > 2) continue;
        box.respawn = BOX_RESPAWN;
        events.push({ type: 'box', kart: k, double: box.double, x: box.x, y: box.y, z: box.z });
        // One item at a time, two from a double box: a full slot just pops it.
        if (!k.item) {
          // Far behind everyone: always the cannon, to get back in the race.
          k.item = k.behind > FAR_BEHIND && karts.length > 3 ? 'wooCannon' : this.roll(k, karts);
          if (box.double) k.spare = this.roll(k, karts, k.item);
          k.rolling = ROULETTE;
          k.held = 0;
          events.push({ type: 'pickup', kart: k });
        } else if (box.double && !k.spare) {
          k.spare = this.roll(k, karts, k.item);
          events.push({ type: 'pickup', kart: k, spare: true });
        }
        break;
      }
    }
  }

  /** An item for `k`: never a second Nonagon Infinity while one is out, nor the same thing twice from one box. */
  private roll(k: ItemHolder, karts: readonly ItemHolder[], not: ItemKind | null = null): ItemKind {
    const busy = this.surge || not === 'gizzardWave' ? 'gizzardWave' : null;
    const item = rollItem(k.position, karts.length, this.rand, k.signature, busy);
    return item === not && item !== 'fuzzPedal' ? rollItem(k.position, karts.length, this.rand, k.signature, busy ?? not) : item;
  }

  private burst(kind: ItemKind, k: ItemHolder, life: number, len = 0, to: ItemHolder | null = null): void {
    const s = k.state;
    this.bursts.push({ kind, x: s.x, y: s.y, z: s.z, heading: s.heading, age: 0, life, len, from: k, to });
  }

  private fire(item: ItemKind, k: ItemHolder, karts: readonly ItemHolder[], events: ItemEvent[]): void {
    const s = k.state;
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    const others = karts.filter((o) => o !== k && !o.finished);
    switch (item) {
      case 'fuzzPedal':
        s.boostTime = Math.max(s.boostTime, FUZZ_BOOST);
        break;
      case 'drippingTap':
        s.boostTime = Math.max(s.boostTime, DRIP_BOOST);
        break;
      case 'microtonalMine': {
        this.mines.push({ x: s.x - fx * 2.6, y: s.groundY, z: s.z - fz * 2.6, owner: k, arm: MINE_ARM });
        if (this.mines.length > MAX_MINES) this.mines.shift();
        break;
      }
      case 'feedbackWave':
        this.waves.push({ x: s.x, y: s.y, z: s.z, age: 0 });
        for (const o of karts) {
          if (o === k || Math.hypot(o.state.x - s.x, o.state.z - s.z) > WAVE_RANGE) continue;
          if (spinOut(o.state, WAVE_SPIN)) events.push({ type: 'hit', kart: o, by: 'feedbackWave', from: k });
        }
        break;
      case 'riffMissile': {
        const target = karts.find((o) => o.position === k.position - 1) ?? null;
        this.missiles.push({ x: s.x + fx * 2, y: s.y + 0.8, z: s.z + fz * 2, heading: s.heading, s: k.progressS + 2, owner: k, target, homing: false, life: MISSILE_LIFE });
        break;
      }
      case 'tempoShift':
        for (const o of karts) {
          if (o !== k && slowDown(o.state, tempoSlowFor(o.position, karts.length))) events.push({ type: 'hit', kart: o, by: 'tempoShift', from: k });
        }
        break;
      case 'wooCannon':
        // The race flies it from here (Race.flyCannon); anyone it touches is knocked aside (Race.bumps).
        s.cannonTime = CANNON_TIME;
        s.invulnTime = Math.max(s.invulnTime, CANNON_TIME + 0.8);
        break;
      case 'fluteFlurry':
        this.burst(item, k, 0.7, FLUTE_RANGE);
        for (const o of others) {
          if (inCone(s, o.state, FLUTE_RANGE, FLUTE_CONE) && wobble(o.state, FLUTE_WOBBLE)) events.push({ type: 'hit', kart: o, by: item, from: k });
        }
        break;
      case 'drumRoll':
        // A battering ram for a few seconds (Race.bumps), and nothing touches you.
        s.ramTime = DRUM_TIME;
        s.invulnTime = Math.max(s.invulnTime, DRUM_TIME);
        this.burst(item, k, DRUM_TIME);
        break;
      case 'bassDrop':
        this.burst(item, k, 0.9, BASS_RANGE);
        for (const o of others) {
          const ahead = o.distance - k.distance;
          if (ahead > 0 && ahead < BASS_RANGE && slowDown(o.state, BASS_SLOW)) events.push({ type: 'hit', kart: o, by: item, from: k });
        }
        break;
      case 'patchCable': {
        let target: ItemHolder | null = null;
        for (const o of others) {
          const ahead = o.distance - k.distance;
          if (ahead > 0 && ahead < CABLE_RANGE && (!target || o.distance < target.distance)) target = o;
        }
        // No one in reach: the cable still gives a little pull.
        s.boostTime = Math.max(s.boostTime, target ? CABLE_BOOST : FUZZ_BOOST * 0.6);
        this.burst(item, k, target ? CABLE_TIME : 0.4, CABLE_RANGE, target);
        if (target && slowDown(target.state, CABLE_TIME)) events.push({ type: 'hit', kart: target, by: item, from: k });
        break;
      }
      case 'harmonicaWail':
        s.boostTime = Math.max(s.boostTime, HARMONICA_BOOST);
        this.burst(item, k, 0.5, HARMONICA_RANGE);
        for (const o of others) {
          if (!inCone(s, o.state, HARMONICA_RANGE, HARMONICA_CONE)) continue;
          // Shoved out of your way, to whichever side it was already on.
          const side = Math.sign((o.state.x - s.x) * fz - (o.state.z - s.z) * fx) || 1;
          const push: [number, number] = [fz * side * HARMONICA_PUSH, -fx * side * HARMONICA_PUSH];
          if (!wobble(o.state, HARMONICA_WOBBLE)) continue;
          o.state.extX += push[0] / o.params.mass;
          o.state.extZ += push[1] / o.params.mass;
          events.push({ type: 'hit', kart: o, by: item, from: k, push });
        }
        break;
      case 'keytarLaser': {
        let victim: ItemHolder | null = null;
        let reach = LASER_RANGE;
        for (const o of others) {
          const dx = o.state.x - s.x;
          const dz = o.state.z - s.z;
          const along = dx * fx + dz * fz;
          if (along > 0 && along < reach && Math.abs(dx * fz - dz * fx) < LASER_WIDTH && Math.abs(o.state.y - s.y) < 2.5) {
            victim = o;
            reach = along;
          }
        }
        this.burst(item, k, 0.35, reach);
        if (victim && spinOut(victim.state, LASER_SPIN)) events.push({ type: 'hit', kart: victim, by: item, from: k });
        break;
      }
      case 'gizzardWave':
        this.surge = { d: k.distance + 2, x: s.x, y: s.groundY, z: s.z, heading: s.heading, owner: k, target: null, age: 0, dodgeRolled: false };
        break;
    }
  }

  /** A held mine or missile takes the hit instead; true if it did. */
  private shield(k: ItemHolder, by: ItemKind, from: ItemHolder, events: ItemEvent[]): boolean {
    if (!k.item || k.rolling > 0 || !SHIELD_ITEMS.includes(k.item)) return false;
    nextItem(k);
    events.push({ type: 'block', kart: k, by, from });
    return true;
  }

  private updateMines(dt: number, karts: readonly ItemHolder[], events: ItemEvent[]): void {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.arm = Math.max(0, m.arm - dt);
      if (m.arm > 0) continue;
      const victim = karts.find((k) => Math.hypot(k.state.x - m.x, k.state.z - m.z) < MINE_RADIUS + KART_RADIUS && Math.abs(k.state.y - m.y) < 1.5);
      if (!victim) continue;
      this.mines.splice(i, 1);
      if (victim.state.invulnTime > 0 || this.shield(victim, 'microtonalMine', m.owner, events)) continue;
      if (wobble(victim.state, MINE_WOBBLE)) events.push({ type: 'hit', kart: victim, by: 'microtonalMine', from: m.owner });
    }
  }

  private updateMissiles(dt: number, karts: readonly ItemHolder[], events: ItemEvent[]): void {
    const sp = this.track.spline;
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;
      const t = m.target?.state;
      if (t && Math.hypot(t.x - m.x, t.z - m.z) < MISSILE_HOMING_RANGE) m.homing = true;
      if (m.homing && t) {
        // Close in directly, turning at a limited rate.
        const want = Math.atan2(t.x - m.x, t.z - m.z);
        let d = want - m.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        m.heading += clamp(d, -MISSILE_TURN * dt, MISSILE_TURN * dt);
        m.x += Math.sin(m.heading) * MISSILE_SPEED * dt;
        m.z += Math.cos(m.heading) * MISSILE_SPEED * dt;
        m.y += (t.y + 0.8 - m.y) * Math.min(1, dt * 6);
      } else {
        // Follow the road until the target is in range.
        m.s += MISSILE_SPEED * dt;
        const p = pointAt(sp, m.s);
        m.heading = Math.atan2(p.tx, p.tz);
        m.x = p.x;
        m.z = p.z;
        m.y = this.track.main.heightAt(((m.s % sp.length) + sp.length) % sp.length) + 0.9;
      }
      const victim = karts.find((k) => k !== m.owner && Math.hypot(k.state.x - m.x, k.state.z - m.z) < KART_RADIUS + 0.8 && Math.abs(k.state.y + 0.8 - m.y) < 1.6);
      if (victim) {
        if (victim.state.invulnTime === 0 && !this.shield(victim, 'riffMissile', m.owner, events) && spinOut(victim.state, MISSILE_SPIN)) {
          events.push({ type: 'hit', kart: victim, by: 'riffMissile', from: m.owner });
        }
        this.missiles.splice(i, 1);
      } else if (m.life <= 0) {
        this.missiles.splice(i, 1);
      }
    }
  }

  /** The Nonagon Infinity: on down the road to whoever leads, then it breaks on them, or under them if they're in the air. */
  private updateSurge(dt: number, karts: readonly ItemHolder[], events: ItemEvent[]): void {
    const w = this.surge;
    if (!w) return;
    w.age += dt;
    const leader = karts.filter((k) => !k.finished && k !== w.owner).sort((a, b) => a.position - b.position)[0] ?? null;
    if (leader !== w.target) w.dodgeRolled = false;
    w.target = leader;
    if (!leader || w.age > SURGE_LIFE) {
      this.surge = null;
      return;
    }
    const gap = leader.distance - w.d;
    w.d += (gap > SURGE_CLOSE ? SURGE_FAST : Math.max(0, leader.state.speed) + SURGE_CLOSING) * dt;
    const L = this.track.length;
    const p = pointAt(this.track.spline, ((w.d % L) + L) % L);
    // Down the middle of the road, then onto the leader's line as it closes.
    const f = clamp(1 - (leader.distance - w.d) / 30, 0, 1);
    w.x = p.x + (leader.state.x - p.x) * f;
    w.z = p.z + (leader.state.z - p.z) * f;
    w.y = this.track.main.heightAt(((w.d % L) + L) % L) * (1 - f) + leader.state.groundY * f;
    w.heading = Math.atan2(p.tx, p.tz);
    if (w.d < leader.distance) return;
    this.surge = null;
    const s = leader.state;
    if (!leader.remote && (!s.grounded || s.hopAge < SURGE_DODGE)) {
      events.push({ type: 'dodge', kart: leader, by: 'gizzardWave', from: w.owner });
      return;
    }
    // Online, the leader's own screen decides whether they rode it (OnlineRace.apply).
    if (leader.remote || spinOut(s, SURGE_SPIN)) events.push({ type: 'hit', kart: leader, by: 'gizzardWave', from: w.owner });
  }
}

/** Moves the spare into the slot, ready to use. */
function nextItem(k: ItemHolder): void {
  k.item = k.spare;
  k.spare = null;
  k.held = 0;
}

/** Whether `o` is within `range` of `s` and inside `halfAngle` (rad) of where it's facing. */
export function inCone(s: KartState, o: KartState, range: number, halfAngle: number): boolean {
  const dx = o.x - s.x;
  const dz = o.z - s.z;
  const d = Math.hypot(dx, dz);
  if (d > range || d < 0.01 || Math.abs(o.y - s.y) > 2.5) return false;
  return (dx * Math.sin(s.heading) + dz * Math.cos(s.heading)) / d > Math.cos(halfAngle);
}
