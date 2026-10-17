import { KART_RADIUS, spinOut, type KartState } from '../physics/kart';
import { pointAt } from '../tracks/spline';
import type { HazardDef, Track } from '../tracks/track';

export type HazardKind = HazardDef['kind'];

/** Where one hazard is at a moment of race time. Recomputed every tick. */
export interface HazardPose {
  kind: HazardKind;
  x: number;
  y: number;
  z: number;
  /** Facing (physics convention) for snakes and tumbleweeds; road heading otherwise. */
  heading: number;
  radius: number;
  /** Road height under the hazard. */
  ground: number;
  /** Road centerline point it sits across from (vine anchors). */
  ax: number;
  az: number;
  /** Velocity over the last update, m/s. */
  vx: number;
  vz: number;
  /** Can hit karts right now. */
  active: boolean;
  /**
   * Kind-specific: boulder cycle stage (0..1), tumbleweed bounce height,
   * snake slither phase, dust devil spin.
   */
  phase: number;
}

export const SNAKE_SPIN = 0.9;
export const BOULDER_SPIN = 1.1;
export const JET_SPIN = 1.0;
export const VINE_SPIN = 1.0;
export const ROLLER_SPIN = 1.0;
/** Flame jet cycle: quiet, then sputtering (harmless), then full fire. */
export const JET_STAGES = { sputter: 0.45, fire: 0.62 } as const;
const VINE_RADIUS = 1.3;
const ROLLER_RADIUS = 1.5;
/** How far along the road a flame jet's sheet of fire reaches. */
const JET_DEPTH = 1.3;
export const TUMBLEWEED_SLOW = 0.55;
/** Sideways acceleration inside a dust devil, m/s^2. */
export const DEVIL_PUSH = 34;
const SNAKE_RADIUS = 0.7;
const SNAKE_LENGTH = 3.2;
const DEVIL_RADIUS = 4;
const TUMBLEWEED_RADIUS = 0.9;
const TUMBLEWEED_SPEED = 7;
const BOULDER_RADIUS = 1.7;
const BOULDER_DROP = 24;
const HIT_COOLDOWN = 1;
const SPIN: Record<Exclude<HazardKind, 'dustDevils' | 'tumbleweeds'>, number> = {
  snakes: SNAKE_SPIN,
  boulders: BOULDER_SPIN,
  lavaBombs: BOULDER_SPIN,
  flameJets: JET_SPIN,
  vines: VINE_SPIN,
  rollers: ROLLER_SPIN,
};

/** Boulder cycle stages, as fractions of the period. */
export const BOULDER_STAGES = { fall: 0.3, land: 0.4, crumble: 0.85 } as const;

/**
 * Track hazards (spec section 7). Every hazard's position is a pure
 * function of race time so they replay identically and can be synced over
 * the network by time alone; only per-kart hit cooldowns are state.
 */
export class HazardSystem {
  readonly poses: HazardPose[] = [];
  private readonly slots: { def: HazardDef; index: number }[] = [];
  private readonly cooldown = new Map<KartState, number>();
  private lastT = 0;

  constructor(private readonly track: Track) {
    for (const def of track.def.hazards) {
      const n = 'at' in def ? def.at.length : def.count;
      for (let i = 0; i < n; i++) {
        this.slots.push({ def, index: i });
        this.poses.push({ kind: def.kind, x: 0, y: 0, z: 0, heading: 0, radius: 0, ground: 0, ax: 0, az: 0, vx: 0, vz: 0, active: false, phase: 0 });
      }
    }
    this.update(0);
  }

  /** Moves every hazard to where it is at race time `t`. */
  update(t: number): void {
    const dt = t - this.lastT;
    this.lastT = t;
    this.slots.forEach(({ def, index: i }, k) => {
      const p = this.poses[k];
      const x0 = p.x;
      const z0 = p.z;
      switch (def.kind) {
        case 'snakes':
        case 'rollers': {
          const s = def.from + ((def.to - def.from) * (i + 0.5)) / def.count;
          const roller = def.kind === 'rollers';
          const hw = this.halfWidth(s) + (roller ? 1 : 2.5);
          const u = (((t + 10) / def.period + i * 0.37) % 1 + 1) % 1;
          // Triangle wave: edge to edge at a steady pace, then back.
          const lat = hw * (1 - 4 * Math.abs(u - 0.5));
          this.place(p, s, lat, roller ? ROLLER_RADIUS : 0);
          const dir = u < 0.5 ? -1 : 1; // lateral direction of travel
          p.heading = p.heading + (dir * Math.PI) / 2;
          p.radius = roller ? ROLLER_RADIUS : SNAKE_RADIUS;
          p.active = true;
          // Snakes: slither phase. Rollers: roll angle (distance over radius).
          p.phase = roller ? (lat + hw) / ROLLER_RADIUS : t * 9 + i;
          break;
        }
        case 'vines': {
          const at = def.at[i];
          const hw = this.halfWidth(at);
          const swing = Math.sin(((t + 10) / def.period) * Math.PI * 2 + i * 1.9);
          this.place(p, at, hw * 0.85 * swing, 1.1);
          p.radius = VINE_RADIUS;
          p.active = true;
          p.phase = swing;
          break;
        }
        case 'flameJets': {
          const at = def.at[i];
          this.place(p, at, 0, 0);
          const u = (((t + 10) / def.period + i * 0.31) % 1 + 1) % 1;
          p.radius = this.halfWidth(at) + 1;
          p.active = u >= JET_STAGES.fire;
          p.phase = u;
          break;
        }
        case 'dustDevils': {
          const s = def.from + (def.to - def.from) * (0.5 + 0.45 * Math.sin(t * 0.11 * (1 + i * 0.4) + i * 2.1));
          const lat = this.halfWidth(s) * 0.7 * Math.sin(t * 0.33 + i * 1.7);
          this.place(p, s, lat, 0);
          p.radius = DEVIL_RADIUS;
          p.active = true;
          p.phase = t * 7;
          break;
        }
        case 'tumbleweeds': {
          const len = def.to - def.from;
          const s = def.to - ((t * TUMBLEWEED_SPEED + (i * len) / def.count) % len);
          const lat = this.halfWidth(s) * 0.6 * Math.sin(t * 0.8 + i * 2.3);
          const bounce = Math.abs(Math.sin(t * 3.4 + i)) * 1.6;
          this.place(p, s, lat, TUMBLEWEED_RADIUS + bounce);
          p.heading += Math.PI; // rolling against the traffic
          p.radius = TUMBLEWEED_RADIUS;
          p.active = true;
          p.phase = bounce;
          break;
        }
        case 'boulders':
        case 'lavaBombs': {
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.55 * Math.sin(cycle * 2.39 + i * 1.3);
          let lift = 0;
          if (u < BOULDER_STAGES.fall) lift = BOULDER_DROP;
          else if (u < BOULDER_STAGES.land) lift = BOULDER_DROP * (1 - ((u - BOULDER_STAGES.fall) / (BOULDER_STAGES.land - BOULDER_STAGES.fall)) ** 2);
          else if (u > BOULDER_STAGES.crumble) lift = -BOULDER_RADIUS * 2 * ((u - BOULDER_STAGES.crumble) / (1 - BOULDER_STAGES.crumble));
          this.place(p, at, lat, BOULDER_RADIUS + lift);
          p.radius = BOULDER_RADIUS;
          // Dangerous from just before it lands until it starts to crumble.
          p.active = u > BOULDER_STAGES.land - 0.02 && u < BOULDER_STAGES.crumble;
          p.phase = u;
          break;
        }
      }
      const fresh = dt > 0 && dt < 0.5;
      p.vx = fresh ? (p.x - x0) / dt : 0;
      p.vz = fresh ? (p.z - z0) / dt : 0;
    });
  }

  /** Hits karts touching an active hazard. Returns the karts that got hit (spun or slowed) and by what. */
  collide(karts: readonly KartState[], dt: number): { kart: KartState; by: HazardKind }[] {
    const hit: { kart: KartState; by: HazardKind }[] = [];
    for (const [k, v] of this.cooldown) {
      if (v - dt <= 0) this.cooldown.delete(k);
      else this.cooldown.set(k, v - dt);
    }
    for (const s of karts) {
      for (const p of this.poses) {
        if (!p.active) continue;
        if (Math.abs(s.y - p.ground) > 2.2) continue;
        const d = this.distance(p, s);
        if (d > p.radius + KART_RADIUS) continue;
        if (p.kind === 'dustDevils') {
          this.swirl(p, s, dt);
          continue;
        }
        if (p.kind === 'boulders' || p.kind === 'lavaBombs') this.pushOut(p, s);
        if (this.cooldown.has(s)) continue;
        this.cooldown.set(s, HIT_COOLDOWN);
        if (p.kind === 'tumbleweeds') {
          s.speed *= TUMBLEWEED_SLOW;
          s.vy = Math.max(s.vy, 2.5);
          hit.push({ kart: s, by: p.kind });
        } else if (spinOut(s, SPIN[p.kind])) {
          hit.push({ kart: s, by: p.kind });
        }
      }
    }
    return hit;
  }

  /** Circles for CPU avoidance, including boulders about to land. */
  obstacles(out: { x: number; z: number; r: number; vx: number; vz: number }[]): void {
    for (const p of this.poses) {
      if (p.kind === 'flameJets') continue; // the whole road: nothing to steer around
      const falling = p.kind === 'boulders' || p.kind === 'lavaBombs';
      if (falling ? p.phase > BOULDER_STAGES.crumble || p.phase < BOULDER_STAGES.fall * 0.5 : !p.active) continue;
      if (p.kind === 'snakes') {
        // The body trails the head: aim to miss its middle.
        const bx = -Math.sin(p.heading) * SNAKE_LENGTH * 0.5;
        const bz = -Math.cos(p.heading) * SNAKE_LENGTH * 0.5;
        out.push({ x: p.x + bx, z: p.z + bz, r: SNAKE_LENGTH * 0.5 + SNAKE_RADIUS, vx: p.vx, vz: p.vz });
      } else {
        out.push({ x: p.x, z: p.z, r: p.radius, vx: p.vx, vz: p.vz });
      }
    }
  }

  private place(p: HazardPose, builderS: number, lateral: number, lift: number): void {
    const s = this.track.mainS(builderS);
    const a = pointAt(this.track.spline, s);
    const tl = Math.hypot(a.tx, a.tz) || 1;
    p.x = a.x - (a.tz / tl) * lateral;
    p.z = a.z + (a.tx / tl) * lateral;
    const L = this.track.length;
    p.ground = this.track.main.heightAt(((s % L) + L) % L);
    p.ax = a.x;
    p.az = a.z;
    p.y = p.ground + lift;
    p.heading = Math.atan2(a.tx, a.tz);
  }

  private halfWidth(builderS: number): number {
    return this.track.main.halfWidthAtS(this.track.mainS(builderS));
  }

  /**
   * Snakes are a short segment trailing behind the head; a flame jet is a
   * thin sheet across the road; everything else is a circle.
   */
  private distance(p: HazardPose, s: KartState): number {
    if (p.kind === 'flameJets') {
      const fx = Math.sin(p.heading);
      const fz = Math.cos(p.heading);
      const along = Math.abs((s.x - p.x) * fx + (s.z - p.z) * fz);
      const across = Math.abs((s.x - p.x) * -fz + (s.z - p.z) * fx);
      // Inside the sheet counts as touching; the radius is the half-width.
      return along < JET_DEPTH + KART_RADIUS ? across - KART_RADIUS : Infinity;
    }
    if (p.kind !== 'snakes') return Math.hypot(s.x - p.x, s.z - p.z);
    const bx = -Math.sin(p.heading);
    const bz = -Math.cos(p.heading);
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const along = Math.max(0, Math.min(SNAKE_LENGTH, dx * bx + dz * bz));
    return Math.hypot(dx - bx * along, dz - bz * along);
  }

  private swirl(p: HazardPose, s: KartState, dt: number): void {
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    // Mostly around (counterclockwise from above), a little outward.
    s.extX += ((-dz / d) * 0.85 + (dx / d) * 0.5) * DEVIL_PUSH * dt;
    s.extZ += ((dx / d) * 0.85 + (dz / d) * 0.5) * DEVIL_PUSH * dt;
  }

  private pushOut(p: HazardPose, s: KartState): void {
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const r = p.radius + KART_RADIUS;
    if (d >= r) return;
    s.x = p.x + (dx / d) * r;
    s.z = p.z + (dz / d) * r;
  }
}
