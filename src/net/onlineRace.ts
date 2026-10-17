import type { Race, RaceKart } from '../core/race';
import { ITEM_KINDS, type ItemKind } from '../items/items';
import { slowDown, spinOut, wobble } from '../physics/kart';
import type { Effect, Snap } from './protocol';
import { lerpPacked, packKart } from './wire';

/** Other karts are shown this far in the past, so there's a snapshot either side to blend. */
export const INTERP_DELAY = 0.1;
/** If snapshots stop, karts coast on for this long, then hold. */
const MAX_EXTRAPOLATE = 0.25;

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
    snap.box.forEach((r, i) => items.boxes[i] && (items.boxes[i].respawn = r));
    const owner = this.me;
    items.mines.length = 0;
    for (const [x, y, z] of snap.mines) items.mines.push({ x, y, z, owner, arm: 0 });
    items.missiles.length = 0;
    for (const [x, y, z, heading] of snap.mis) items.missiles.push({ x, y, z, heading, s: 0, owner, target: null, homing: true, life: 1 });
    items.waves.length = 0;
    for (const [x, y, z, age] of snap.waves) items.waves.push({ x, y, z, age });
    const n = this.race.karts.indexOf(this.me);
    const [item, rolling] = snap.it[n] ?? [-1, 0];
    const kind: ItemKind | null = item >= 0 ? ITEM_KINDS[item] : null;
    this.me.item = kind;
    this.me.rolling = rolling;
  }

  /** Hits and boosts the room decided on: they happen to my kart here. Returns the ones that took. */
  apply(effects: readonly Effect[]): Effect[] {
    const s = this.me.state;
    return effects.filter((e) => {
      if (e.k === 'boost') {
        s.boostTime = Math.max(s.boostTime, e.t);
        return true;
      }
      if (e.k === 'spin') return spinOut(s, e.t);
      if (e.k === 'wobble') return wobble(s, e.t);
      return slowDown(s, e.t);
    });
  }
}
