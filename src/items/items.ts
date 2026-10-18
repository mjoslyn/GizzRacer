import { clamp, seededRandom } from '../core/math';
import { KART_RADIUS, spinOut, slowDown, wobble, type KartState } from '../physics/kart';
import { pointAt } from '../tracks/spline';
import type { Track } from '../tracks/track';
import type { HazardKind } from './hazards';

/** Spec section 6. */
export type ItemKind = 'fuzzPedal' | 'microtonalMine' | 'feedbackWave' | 'riffMissile' | 'tempoShift' | 'wooCannon';

export const ITEMS: Record<ItemKind, { name: string }> = {
  fuzzPedal: { name: 'Fuzz Pedal' },
  microtonalMine: { name: 'Microtonal Mine' },
  feedbackWave: { name: 'Feedback Wave' },
  riffMissile: { name: 'Riff Missile' },
  tempoShift: { name: 'Tempo Shift' },
  wooCannon: { name: 'Woo Cannon' },
};
export const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];

/** How long Tempo Shift slows a kart in `position` of `karts`: longest for the leader, shortest for last. */
export function tempoSlowFor(position: number, karts: number): number {
  const p = karts > 1 ? (position - 1) / (karts - 1) : 0;
  return TEMPO_SLOW_FIRST + (TEMPO_SLOW_LAST - TEMPO_SLOW_FIRST) * Math.min(1, Math.max(0, p));
}

export const FUZZ_BOOST = 1.2;
export const MINE_WOBBLE = 1.5;
export const WAVE_RANGE = 8;
export const WAVE_SPIN = 1.0;
export const MISSILE_SPIN = 1.2;
/** Tempo Shift slows the leader longest and the back of the field least (seconds, first to last). */
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
export const CANNON_SPIN = 1.0;
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
  position: number;
  progressS: number;
  item: ItemKind | null;
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

export type ItemEvent =
  | { type: 'pickup'; kart: ItemHolder }
  | { type: 'use'; kart: ItemHolder; item: ItemKind }
  /** `from` is whoever fired the item; absent for hazards. */
  | { type: 'hit'; kart: ItemHolder; by: ItemKind | HazardKind; from?: ItemHolder };

/**
 * Item odds by race position (spec section 6): `p` runs from 0 (leading)
 * to 1 (last). Fuzz everywhere, mines up front, waves mid-pack, missiles
 * from the middle back, Tempo Shift for the last two only, and the Woo
 * Cannon for the last three, likelier the further back.
 */
export function itemWeights(position: number, karts: number): Record<ItemKind, number> {
  const p = karts > 1 ? (position - 1) / (karts - 1) : 0;
  return {
    fuzzPedal: 2 + 2 * p,
    microtonalMine: 4 * (1 - p),
    feedbackWave: 4 * Math.max(0, 1 - Math.abs(p - 0.5) * 2),
    riffMissile: position === 1 ? 0 : 3.5 * Math.min(1, p * 1.6),
    tempoShift: karts > 2 && position >= karts - 1 ? 2.5 : 0,
    wooCannon: karts > 3 && position >= karts - 2 ? 1.5 + (position - (karts - 2)) : 0,
  };
}

export function rollItem(position: number, karts: number, rand: () => number): ItemKind {
  const w = itemWeights(position, karts);
  const total = ITEM_KINDS.reduce((a, k) => a + w[k], 0);
  let r = rand() * total;
  for (const k of ITEM_KINDS) {
    r -= w[k];
    if (r <= 0 && w[k] > 0) return k;
  }
  return 'fuzzPedal';
}

/** Item boxes, dropped mines, missiles in flight and wave rings for one race. */
export class ItemSystem {
  readonly boxes: ItemBox[] = [];
  readonly mines: Mine[] = [];
  readonly missiles: Missile[] = [];
  readonly waves: Wave[] = [];
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
        k.item = null;
        k.held = 0;
        this.fire(item, k, karts, events);
        events.push({ type: 'use', kart: k, item });
      }
    });
    this.updateMines(dt, karts, events);
    this.updateMissiles(dt, karts, events);
    for (const w of this.waves) w.age += dt;
    while (this.waves.length && this.waves[0].age > 0.8) this.waves.shift();
    return events;
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
        // One item at a time: a full slot just pops the box.
        if (!k.item) {
          // Far behind everyone: always the cannon, to get back in the race.
          k.item = k.behind > FAR_BEHIND && karts.length > 3 ? 'wooCannon' : rollItem(k.position, karts.length, this.rand);
          k.rolling = ROULETTE;
          k.held = 0;
          events.push({ type: 'pickup', kart: k });
        }
        break;
      }
    }
  }

  private fire(item: ItemKind, k: ItemHolder, karts: readonly ItemHolder[], events: ItemEvent[]): void {
    const s = k.state;
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    switch (item) {
      case 'fuzzPedal':
        s.boostTime = Math.max(s.boostTime, FUZZ_BOOST);
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
    }
  }

  private updateMines(dt: number, karts: readonly ItemHolder[], events: ItemEvent[]): void {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.arm = Math.max(0, m.arm - dt);
      if (m.arm > 0) continue;
      const victim = karts.find((k) => Math.hypot(k.state.x - m.x, k.state.z - m.z) < MINE_RADIUS + KART_RADIUS && Math.abs(k.state.y - m.y) < 1.5);
      if (!victim) continue;
      this.mines.splice(i, 1);
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
        if (spinOut(victim.state, MISSILE_SPIN)) events.push({ type: 'hit', kart: victim, by: 'riffMissile', from: m.owner });
        this.missiles.splice(i, 1);
      } else if (m.life <= 0) {
        this.missiles.splice(i, 1);
      }
    }
  }
}
