/**
 * Pooled particles, as plain typed arrays: no three.js here, so the
 * stepping, the cap and the write-out can be tested without a GPU. One
 * store is one draw call (fx/fxSystem.ts draws it as an instanced quad).
 *
 * A particle is spawned with `spawn(tile)` and shaped with the chained
 * setters (`at`, `vel`, `life`, `size` ...), which write into the slot just
 * taken: nothing is allocated per particle or per frame. When every slot is
 * live the oldest-placed is taken over, so the cap is a hard one.
 *
 * A particle with a life of 0 is drawn for the one frame it's spawned in
 * and gone at the next step: the per-frame marks (a homing reticle, a
 * dizzy swirl, a held item's glow) go through the same draw call as the
 * bursts.
 */

/** The atlas tiles (fx/atlas.ts draws them, 4 by 4, white on clear unless noted). */
export const TILE = {
  glow: 0,
  star: 1,
  note: 2,
  ring: 3,
  nonagon: 4,
  flare: 5,
  drop: 6,
  cog: 7,
  puff: 8,
  shard: 9,
  peel: 10,
  chunk: 11,
  /** Drawn dark: a soft shadow on the ground. */
  shadow: 12,
  clock: 13,
  feather: 14,
  streak: 15,
} as const;
export type Tile = (typeof TILE)[keyof typeof TILE];

/** How many floats each particle writes to each instanced attribute. */
export const STRIDE = { offset: 3, vel: 4, color: 4, misc: 4 } as const;

/** The buffers a store writes its live particles into, one instance each. */
export interface ParticleBuffers {
  /** x, y, z. */
  offset: Float32Array;
  /** vx, vy, vz, stretch (0: a billboard; >0: a streak along its velocity). */
  vel: Float32Array;
  /** r, g, b, alpha. */
  color: Float32Array;
  /** size (m), rotation (rad), tile, flat (1: lying on the ground). */
  misc: Float32Array;
}

export function makeBuffers(cap: number): ParticleBuffers {
  return {
    offset: new Float32Array(cap * STRIDE.offset),
    vel: new Float32Array(cap * STRIDE.vel),
    color: new Float32Array(cap * STRIDE.color),
    misc: new Float32Array(cap * STRIDE.misc),
  };
}

const FLAT = 1;

export class ParticleStore {
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly age: Float32Array;
  readonly lifeOf: Float32Array;
  readonly size0: Float32Array;
  readonly growBy: Float32Array;
  readonly r0: Float32Array;
  readonly g0: Float32Array;
  readonly b0: Float32Array;
  readonly r1: Float32Array;
  readonly g1: Float32Array;
  readonly b1: Float32Array;
  readonly alpha0: Float32Array;
  readonly gravityOf: Float32Array;
  readonly dragOf: Float32Array;
  readonly floorY: Float32Array;
  readonly bounceOf: Float32Array;
  readonly rot: Float32Array;
  readonly spinOf: Float32Array;
  readonly tileOf: Float32Array;
  readonly stretchOf: Float32Array;
  readonly fadeInOf: Float32Array;
  readonly fadeFrom: Float32Array;
  readonly flags: Uint8Array;
  readonly alive: Uint8Array;
  /** Live particles. */
  count = 0;
  /** Spawns refused because the store was full and the oldest was taken over. */
  stolen = 0;
  private cursor = 0;
  /** The slot the chained setters write to. */
  private i = 0;
  /** Mirror mode: spawns from the flipped world are flipped back in x. */
  flipX = false;

  constructor(readonly cap: number) {
    const f = () => new Float32Array(cap);
    this.px = f();
    this.py = f();
    this.pz = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.age = f();
    this.lifeOf = f();
    this.size0 = f();
    this.growBy = f();
    this.r0 = f();
    this.g0 = f();
    this.b0 = f();
    this.r1 = f();
    this.g1 = f();
    this.b1 = f();
    this.alpha0 = f();
    this.gravityOf = f();
    this.dragOf = f();
    this.floorY = f();
    this.bounceOf = f();
    this.rot = f();
    this.spinOf = f();
    this.tileOf = f();
    this.stretchOf = f();
    this.fadeInOf = f();
    this.fadeFrom = f();
    this.flags = new Uint8Array(cap);
    this.alive = new Uint8Array(cap);
  }

  /** Takes a slot for a new particle of `tile` (a free one near the cursor, else the next in turn) with the defaults set. */
  spawn(tile: number): this {
    let i = this.cursor;
    let probes = 0;
    while (this.alive[i] && probes < 24) {
      i = (i + 1) % this.cap;
      probes++;
    }
    if (this.alive[i]) this.stolen++;
    else this.count++;
    this.cursor = (i + 1) % this.cap;
    this.i = i;
    this.alive[i] = 1;
    this.px[i] = this.py[i] = this.pz[i] = 0;
    this.vx[i] = this.vy[i] = this.vz[i] = 0;
    this.age[i] = 0;
    this.lifeOf[i] = 1;
    this.size0[i] = 1;
    this.growBy[i] = 0;
    this.r0[i] = this.g0[i] = this.b0[i] = 1;
    this.r1[i] = this.g1[i] = this.b1[i] = 1;
    this.alpha0[i] = 1;
    this.gravityOf[i] = 0;
    this.dragOf[i] = 0;
    this.floorY[i] = -1e9;
    this.bounceOf[i] = 0;
    this.rot[i] = 0;
    this.spinOf[i] = 0;
    this.tileOf[i] = tile;
    this.stretchOf[i] = 0;
    this.fadeInOf[i] = 0;
    this.fadeFrom[i] = 0.4;
    this.flags[i] = 0;
    return this;
  }

  at(x: number, y: number, z: number): this {
    this.px[this.i] = this.flipX ? -x : x;
    this.py[this.i] = y;
    this.pz[this.i] = z;
    return this;
  }

  vel(x: number, y: number, z: number): this {
    this.vx[this.i] = this.flipX ? -x : x;
    this.vy[this.i] = y;
    this.vz[this.i] = z;
    return this;
  }

  /** Seconds it lives (0: this frame only). */
  life(t: number): this {
    this.lifeOf[this.i] = t;
    return this;
  }

  /** Size (m) at birth, and how much bigger it ends (-1 shrinks to nothing, 2 ends three times the size). */
  size(s: number, grow = 0): this {
    this.size0[this.i] = s;
    this.growBy[this.i] = grow;
    return this;
  }

  /** Its colour (0xrrggbb), and the one it turns to by the end of its life. */
  color(hex: number, to = hex, alpha = 1): this {
    const i = this.i;
    this.r0[i] = ((hex >> 16) & 255) / 255;
    this.g0[i] = ((hex >> 8) & 255) / 255;
    this.b0[i] = (hex & 255) / 255;
    this.r1[i] = ((to >> 16) & 255) / 255;
    this.g1[i] = ((to >> 8) & 255) / 255;
    this.b1[i] = (to & 255) / 255;
    this.alpha0[i] = alpha;
    return this;
  }

  /** Falls at `g` m/s² (negative rises); `drag` bleeds speed (per second). */
  physics(g: number, drag = 0): this {
    this.gravityOf[this.i] = g;
    this.dragOf[this.i] = drag;
    return this;
  }

  /** Lands on the ground at `y`, bouncing back up by `bounce` of its fall. */
  floor(y: number, bounce = 0.35): this {
    this.floorY[this.i] = y;
    this.bounceOf[this.i] = bounce;
    return this;
  }

  spin(rot: number, rate = 0): this {
    this.rot[this.i] = rot;
    this.spinOf[this.i] = rate;
    return this;
  }

  /** A streak along its velocity (as seen from the moving camera): `k` metres of length per m/s. */
  stretch(k: number): this {
    this.stretchOf[this.i] = k;
    return this;
  }

  /** Fades in over `fadeIn` seconds and out from `from` (0..1) of its life. */
  fade(fadeIn: number, from = 0.4): this {
    this.fadeInOf[this.i] = fadeIn;
    this.fadeFrom[this.i] = from;
    return this;
  }

  /** Lies flat on the ground (a ring, a scorch, a shadow) instead of facing the camera. */
  flat(): this {
    this.flags[this.i] |= FLAT;
    return this;
  }

  /** Ages and moves every live particle; the dead (and last frame's one-frame marks) are freed. */
  step(dt: number): void {
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      const age = this.age[i] + dt;
      if (age >= this.lifeOf[i]) {
        this.alive[i] = 0;
        this.count--;
        continue;
      }
      this.age[i] = age;
      if (dt <= 0) continue;
      const drag = this.dragOf[i];
      if (drag > 0) {
        const k = Math.exp(-drag * dt);
        this.vx[i] *= k;
        this.vy[i] *= k;
        this.vz[i] *= k;
      }
      this.vy[i] -= this.gravityOf[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.spinOf[i] * dt;
      if (this.py[i] < this.floorY[i]) {
        this.py[i] = this.floorY[i];
        if (this.vy[i] < 0) {
          this.vy[i] = -this.vy[i] * this.bounceOf[i];
          // Scrapes along the ground, slowing, and its spin dies.
          this.vx[i] *= 0.7;
          this.vz[i] *= 0.7;
          this.spinOf[i] *= 0.6;
          if (this.vy[i] < 0.6) this.vy[i] = 0;
        }
      }
    }
  }

  /** Writes the live particles into `out`, packed from the start; how many it wrote. */
  write(out: ParticleBuffers): number {
    let n = 0;
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      const life = this.lifeOf[i];
      const t = life > 0 ? this.age[i] / life : 0;
      const a = this.alpha0[i] * fadeAt(this.age[i], t, this.fadeInOf[i], this.fadeFrom[i]);
      let o = n * 3;
      out.offset[o] = this.px[i];
      out.offset[o + 1] = this.py[i];
      out.offset[o + 2] = this.pz[i];
      o = n * 4;
      out.vel[o] = this.vx[i];
      out.vel[o + 1] = this.vy[i];
      out.vel[o + 2] = this.vz[i];
      out.vel[o + 3] = this.stretchOf[i];
      out.color[o] = this.r0[i] + (this.r1[i] - this.r0[i]) * t;
      out.color[o + 1] = this.g0[i] + (this.g1[i] - this.g0[i]) * t;
      out.color[o + 2] = this.b0[i] + (this.b1[i] - this.b0[i]) * t;
      out.color[o + 3] = a;
      out.misc[o] = Math.max(0, this.size0[i] * (1 + this.growBy[i] * t));
      out.misc[o + 1] = this.rot[i];
      out.misc[o + 2] = this.tileOf[i];
      out.misc[o + 3] = this.flags[i] & FLAT ? 1 : 0;
      n++;
    }
    return n;
  }

  clear(): void {
    this.alive.fill(0);
    this.count = 0;
  }
}

/** A particle's opacity, 0..1: up over `fadeIn` seconds, and down from `from` of its life to nothing at the end. */
export function fadeAt(age: number, t: number, fadeIn: number, from: number): number {
  const up = fadeIn > 0 ? Math.min(1, age / fadeIn) : 1;
  if (t <= from) return up;
  const u = Math.min(1, (t - from) / Math.max(1e-6, 1 - from));
  return up * (1 - u * u * (3 - 2 * u));
}
