import type { Race, RaceKart } from '../core/race';
import { ITEM_KINDS, type ItemBox, type ItemKind } from '../items/items';
import { slowDown, spinOut, wobble } from '../physics/kart';
import type { Effect, Snap } from './protocol';
import { lerpPacked, packKart } from './wire';

/** Other karts are shown this far in the past, so there's a snapshot either side to blend. */
export const INTERP_DELAY = 0.1;
/** If snapshots stop, karts coast on for this long, then hold. */
const MAX_EXTRAPOLATE = 0.25;
/**
 * Online, the wave is a snapshot behind: a hop this recent still rides
 * over it, a little more forgiving than offline (SURGE_DODGE).
 */
const SURGE_DODGE_ONLINE = 0.45;

interface Received {
  snap: Snap;
  at: number;
}

/**
 * A client's side of an online race (docs/MULTIPLAYER.md 7.1): my kart is
 * simulated here; every other kart is remote, fed from the room's
 * snapshots INTERP_DELAY in the past; items (boxes, mines, missiles,
 * waves, my item slot) mirror the room's.
 */
export class OnlineRace {
  private readonly buffer: Received[] = [];
  private readonly scratch: number[] = [];
  /** Item boxes that went from there to gone in the latest mirror: someone drove through them. */
  readonly popped: ItemBox[] = [];

  constructor(
    readonly race: Race,
    readonly me: RaceKart,
  ) {
    race.remoteItems = true;
    for (const k of race.karts) k.remote = k !== me;
  }

  /** The newest snapshot from the room (debugging). */
  get latest(): Snap | null {
    return this.buffer[this.buffer.length - 1]?.snap ?? null;
  }

  /** The packed state to report to the room. */
  report(): number[] {
    return packKart(this.me.state);
  }

  /** `now` in seconds (any steady clock). */
  receive(snap: Snap, now: number): void {
    // Drop anything older than the newest (out of order or a repeat).
    const last = this.buffer[this.buffer.length - 1];
    if (last && snap.t <= last.snap.t) return;
    this.buffer.push({ snap, at: now });
    while (this.buffer.length > 30) this.buffer.shift();
  }

  /** The room's race time we're showing other karts at. */
  renderTime(now: number): number | null {
    const last = this.buffer[this.buffer.length - 1];
    if (!last) return null;
    return Math.min(last.snap.t + MAX_EXTRAPOLATE, last.snap.t + (now - last.at) - INTERP_DELAY);
  }

  /** Before each physics step: place every remote kart, and mirror the room's items. */
  update(now: number): void {
    const t = this.renderTime(now);
    if (t === null) return;
    const buf = this.buffer;
    let i = buf.length - 1;
    while (i > 0 && buf[i - 1].snap.t >= t) i--;
    const b = buf[i].snap;
    const a = i > 0 ? buf[i - 1].snap : b;
    const f = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 1;
    const ahead = Math.max(0, t - b.t);
    this.race.karts.forEach((k, n) => {
      if (k === this.me || !a.k[n] || !b.k[n]) return;
      const s = lerpPacked(a.k[n], b.k[n], f, this.scratch);
      if (ahead > 0) {
        // Past the newest snapshot: coast along the last heading.
        s[0] += Math.sin(s[3]) * s[4] * ahead;
        s[2] += Math.cos(s[3]) * s[4] * ahead;
      }
      k.feed(s.slice());
    });
    this.mirrorItems(buf[buf.length - 1].snap);
  }

  private mirrorItems(snap: Snap): void {
    const items = this.race.items;
    this.popped.length = 0;
    snap.box.forEach((r, i) => {
      const b = items.boxes[i];
      if (!b) return;
      if (b.respawn === 0 && r > 0) this.popped.push(b);
      b.respawn = r;
    });
    const owner = this.me;
    items.mines.length = 0;
    for (const [x, y, z] of snap.mines) items.mines.push({ x, y, z, owner, arm: 0 });
    items.missiles.length = 0;
    for (const [x, y, z, heading] of snap.mis) items.missiles.push({ x, y, z, heading, s: 0, owner, target: null, homing: true, life: 1 });
    items.waves.length = 0;
    for (const [x, y, z, age] of snap.waves) items.waves.push({ x, y, z, age });
    const karts = this.race.karts;
    items.bursts.length = 0;
    for (const [kind, x, y, z, heading, age, life, len, from, to] of snap.fx ?? []) {
      items.bursts.push({ kind: ITEM_KINDS[kind], x, y, z, heading, age, life, len, from: karts[from] ?? null, to: karts[to] ?? null });
    }
    const sg = snap.sg;
    items.surge = sg ? { d: 0, x: sg[0], y: sg[1], z: sg[2], heading: sg[3], owner: this.me, target: karts[sg[4]] ?? null, age: 0, dodgeRolled: true } : null;
    // Everyone's slots, so held items show trailing behind their karts.
    const kind = (i: number): ItemKind | null => (i >= 0 ? ITEM_KINDS[i] : null);
    karts.forEach((k, n) => {
      const [item, rolling, spare] = snap.it[n] ?? [-1, 0, -1];
      k.item = kind(item);
      k.rolling = rolling;
      k.spare = kind(spare ?? -1);
    });
  }

  /** Hits and boosts the room decided on: they happen to my kart here. Returns the ones that took. */
  apply(effects: readonly Effect[]): Effect[] {
    const s = this.me.state;
    const out: Effect[] = [];
    for (const e of effects) {
      if (e.k === 'surge' && (!s.grounded || s.hopAge < SURGE_DODGE_ONLINE)) out.push({ ...e, k: 'dodge' });
      else if (this.take(e)) out.push(e);
    }
    return out;
  }

  private take(e: Effect): boolean {
    const s = this.me.state;
    {
      if (e.k === 'boost') {
        s.boostTime = Math.max(s.boostTime, e.t);
        return true;
      }
      if (e.k === 'ram') {
        s.ramTime = Math.max(s.ramTime, e.t);
        s.invulnTime = Math.max(s.invulnTime, e.t);
        return true;
      }
      if (e.k === 'push') {
        if (!wobble(s, e.t)) return false;
        s.extX += (e.x ?? 0) / this.me.params.mass;
        s.extZ += (e.z ?? 0) / this.me.params.mass;
        return true;
      }
      if (e.k === 'surge') return spinOut(s, e.t);
      if (e.k === 'cannon') {
        // Fly it here, aimed at the pack as this screen sees it.
        s.cannonTime = Math.max(s.cannonTime, e.t);
        s.invulnTime = Math.max(s.invulnTime, e.t + 0.8);
        this.race.aimCannon(this.me);
        return true;
      }
      if (e.k === 'spin') return spinOut(s, e.t);
      if (e.k === 'wobble') return wobble(s, e.t);
      return slowDown(s, e.t);
    }
  }
}
