import type { Vec2 } from './spline';

/** Heading h uses the physics convention: forward is (sin h, cos h); +h turns left. */
export interface Pose {
  x: number;
  z: number;
  h: number;
}

/** How the road looks; 'ice' and 'oil' also slide (physics/kart.ts). */
export type RoadSurface =
  | 'asphalt' | 'salt' | 'rock' | 'sand' | 'boards' | 'ice' | 'neon' | 'rainbow' | 'oil' | 'regolith' | 'wet' | 'cosmic'
  /** Magenta Mountain's glowing crystal road. */
  | 'crystal'
  /** Kepler-22b's alien reef. */
  | 'reef'
  /** The Garden Goblin's paths: crazy paving. */
  | 'paving'
  /** Crumbling Castle's worn flagstones. */
  | 'flagstone'
  /** The Castle in the Air's road of cloud. */
  | 'cloud'
  /** Inner Cell's living membrane. */
  | 'membrane'
  /** Tetrachromacy's glass in four colours. */
  | 'prism'
  /** Robot Stop's factory floor: diamond plate steel. */
  | 'steel'
  /** Gamma Knife's operating theatre: white tiles, green seams. */
  | 'chrome'
  /** People-Vultures' dry lake: cracked, scorched earth. */
  | 'scorched'
  /** Wah Wah's fretboard: dark wood with frets across it. */
  | 'fret';

/**
 * Every road is built this much wider than its section says: the layouts
 * were drawn at a width that read as narrow once the karts skidded, so the
 * builder widens them all at once (a pit under a jump is never narrower
 * than the road over it).
 */
export const ROAD_WIDTH_SCALE = 1.5;

export interface SectionProps {
  halfWidth: number;
  /** Barrier height on both edges; 0 = open edges. */
  wallHeight?: number;
  surface?: RoadSurface;
  /** Raised deck on pillars (an overpass) rather than an earth embankment. */
  bridge?: boolean;
  /** Gravity over this stretch, as a share of the usual: below 1, karts float. */
  gravity?: number;
}

export interface SectionDef extends SectionProps {
  name: string;
  from: number;
  to: number;
}

/** A road ribbon: centerline plus arc-length keyed attributes. Serializable. */
export interface RibbonDef {
  points: Vec2[];
  closed: boolean;
  /** Arc length as laid out by the builder; attributes below are keyed against it. */
  length: number;
  sections: SectionDef[];
  /** [s, y] keys, linearly interpolated. */
  elevation: [number, number][];
  /** [from, to] ranges with no road surface (jumps). */
  gaps: [number, number][];
}

/** A rectangular hole in the terrain (riverbed, chasm). Karts that fall in respawn. */
export interface PitDef {
  x: number;
  z: number;
  heading: number;
  halfLength: number; // along heading
  halfWidth: number;
  depth: number;
  /** What the pit is full of, for looks; karts fall in either way. */
  liquid?: 'water' | 'lava' | 'oil';
}

const INTEGRATION_STEP = 0.25;

/** Turtle-style builder for track centerlines. */
export class TrackBuilder {
  s = 0;
  pose: Pose;
  /** Stretches straights, arcs and turns (not ramps, gaps or bridges): a layout's size, without changing its shape. */
  scale = 1;
  readonly pits: PitDef[] = [];
  readonly marks: Record<string, { s: number; pose: Pose }> = {};
  private readonly points: [number, number][] = [];
  private readonly sections: SectionDef[] = [];
  private readonly elevation: [number, number][] = [];
  private readonly gaps: [number, number][] = [];
  private current: SectionDef;
  private sinceEmit = 0;

  constructor(
    start: Pose,
    name: string,
    props: SectionProps,
    private readonly emitEvery = 4,
  ) {
    this.pose = { ...start };
    this.points.push([start.x, start.z]);
    this.current = { name, from: 0, to: 0, ...props, halfWidth: props.halfWidth * ROAD_WIDTH_SCALE };
  }

  /** Ends the current section and starts a new one here. */
  section(name: string, props: SectionProps): this {
    this.closeSection();
    this.current = { name, from: this.s, to: this.s, ...props, halfWidth: props.halfWidth * ROAD_WIDTH_SCALE };
    return this;
  }

  straight(len: number): this {
    return this.integrate(len * this.scale, () => 0);
  }

  /** An unscaled straight climbing (or falling) to height `y`: a jump ramp, the same at any scale. */
  rise(len: number, y: number): this {
    this.integrate(len, () => 0);
    return this.elevate(y);
  }

  /** Circular arc; positive degrees turn left. */
  arc(radius: number, degrees: number): this {
    const r = radius * this.scale;
    const k = Math.sign(degrees) / r;
    return this.integrate((r * Math.abs(degrees) * Math.PI) / 180, () => k);
  }

  /** Arc whose radius changes linearly from r0 to r1 over the turn; positive degrees turn left. */
  spiral(r0: number, r1: number, degrees: number): this {
    const total = (Math.abs(degrees) * Math.PI) / 180;
    const dir = Math.sign(degrees);
    // Integrate by angle so curvature follows the radius schedule exactly.
    const steps = Math.ceil((total * Math.max(r0, r1)) / INTEGRATION_STEP);
    const dPhi = total / steps;
    for (let i = 0; i < steps; i++) {
      const r = r0 + (r1 - r0) * ((i + 0.5) / steps);
      this.advance(r * dPhi, dir / r);
    }
    return this;
  }

  /** Smooth cubic Hermite curve to `target`, matching its heading. */
  hermiteTo(target: Pose, tension = 1): this {
    const a = { ...this.pose };
    const d = Math.hypot(target.x - a.x, target.z - a.z) * tension;
    const m0x = Math.sin(a.h) * d;
    const m0z = Math.cos(a.h) * d;
    const m1x = Math.sin(target.h) * d;
    const m1z = Math.cos(target.h) * d;
    const steps = Math.ceil((d * 2) / INTEGRATION_STEP);
    let px = a.x;
    let pz = a.z;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      const x = h00 * a.x + h10 * m0x + h01 * target.x + h11 * m1x;
      const z = h00 * a.z + h10 * m0z + h01 * target.z + h11 * m1z;
      const ds = Math.hypot(x - px, z - pz);
      this.pose = { x, z, h: Math.atan2(x - px, z - pz) };
      this.moved(ds);
      px = x;
      pz = z;
    }
    this.pose = { ...target };
    return this;
  }

  /**
   * Shortest turn-straight-turn path (a Dubins path) to `target` with
   * turns of `radius`: closes a loop with real corners where a Hermite
   * curve would kink.
   */
  turnTo(target: Pose, radius: number): this {
    const r = radius * this.scale;
    for (const [kind, len] of dubins(this.pose, target, r)) {
      if (kind === 'S') this.integrate(len, () => 0);
      else if (len > 1e-6) this.integrate(len, () => (kind === 'L' ? 1 : -1) / r);
    }
    return this;
  }

  /**
   * Shapes the road's height between builder arc lengths `from` and `to`
   * (from marks, say) by `f(u)`, u running 0..1, sampled every `step`
   * metres; any height keys already in that stretch give way. For hills,
   * dips and roller coasters laid over a layout after it's drawn. Keep
   * kickers, gaps and dives out of the stretch.
   */
  profile(from: number, to: number, f: (u: number) => number, step = 4): this {
    const keys = this.elevation.filter(([s]) => s < from || s > to);
    const n = Math.max(1, Math.ceil((to - from) / step));
    for (let k = 0; k <= n; k++) keys.push([from + ((to - from) * k) / n, f(k / n)]);
    keys.sort((a, b) => a[0] - b[0]);
    this.elevation.splice(0, this.elevation.length, ...keys);
    return this;
  }

  /** Sets the road height at the current position. */
  elevate(y: number): this {
    this.elevation.push([this.s, y]);
    return this;
  }

  /**
   * A trick kicker across the road: a short ramp up `height` metres, then a
   * sheer drop back to the road. Karts leave the lip airborne, so a hop
   * there is a trick boost on landing.
   */
  kicker(len = 7, height = 1.4): this {
    const base = this.elevation.length ? this.elevation[this.elevation.length - 1][1] : 0;
    this.elevate(base).rise(len, base + height);
    return this.elevate(base);
  }

  /** Straight jump gap with a pit underneath. */
  gap(len: number, pitHalfWidth: number, liquid?: PitDef['liquid'], depth = 12, overhang = 2): this {
    const from = this.s;
    this.addPit(len, pitHalfWidth, liquid, depth, overhang);
    this.integrate(len, () => 0);
    this.gaps.push([from, this.s]);
    return this;
  }

  /**
   * A dive under water: over a pit of water `len` long, the road ramps
   * `depth` down over `ramp`, runs along under the surface, and climbs back
   * out. Unscaled, like a bridge.
   */
  dive(len: number, depth: number, ramp: number, pitHalfWidth: number, liquid: PitDef['liquid'] = 'water'): this {
    const base = this.elevation.length ? this.elevation[this.elevation.length - 1][1] : 0;
    this.addPit(len, pitHalfWidth, liquid, depth + 6, 0);
    this.elevate(base);
    this.integrate(ramp, () => 0).elevate(base - depth);
    this.integrate(len - 2 * ramp, () => 0).elevate(base - depth);
    this.integrate(ramp, () => 0);
    return this.elevate(base);
  }

  /** Straight road over a pit: a bridge with nothing either side. */
  bridge(len: number, pitHalfWidth: number, liquid?: PitDef['liquid'], depth = 12): this {
    this.addPit(len, pitHalfWidth, liquid, depth, 0);
    return this.integrate(len, () => 0);
  }

  private addPit(len: number, halfWidth: number, liquid: PitDef['liquid'], depth: number, overhang: number): void {
    const h = this.pose.h;
    this.pits.push({
      x: this.pose.x + Math.sin(h) * (len / 2),
      z: this.pose.z + Math.cos(h) * (len / 2),
      heading: h,
      halfLength: len / 2 + overhang,
      // A pit is at least as wide as the (widened) road over it, and otherwise as drawn.
      halfWidth: Math.max(halfWidth, this.current.halfWidth),
      depth,
      liquid,
    });
  }

  mark(name: string): this {
    this.marks[name] = { s: this.s, pose: { ...this.pose } };
    return this;
  }

  finish(closed: boolean): RibbonDef {
    this.closeSection();
    const pts = this.points.slice();
    if (this.sinceEmit > 0.5) pts.push([this.pose.x, this.pose.z]);
    if (closed && pts.length > 2) {
      const [fx, fz] = pts[0];
      const [lx, lz] = pts[pts.length - 1];
      if (Math.hypot(fx - lx, fz - lz) < this.emitEvery * 0.75) pts.pop();
    }
    const elevation = this.elevation.length ? this.elevation.slice() : [[0, 0] as [number, number]];
    return { points: pts, closed, length: this.s, sections: this.sections.slice(), elevation, gaps: this.gaps.slice() };
  }

  private integrate(len: number, curvature: (u: number) => number): this {
    const steps = Math.max(1, Math.ceil(len / INTEGRATION_STEP));
    const ds = len / steps;
    for (let i = 0; i < steps; i++) this.advance(ds, curvature((i + 0.5) / steps));
    return this;
  }

  private advance(ds: number, k: number): void {
    const p = this.pose;
    p.h += (k * ds) / 2;
    p.x += Math.sin(p.h) * ds;
    p.z += Math.cos(p.h) * ds;
    p.h += (k * ds) / 2;
    this.moved(ds);
  }

  private moved(ds: number): void {
    this.s += ds;
    this.sinceEmit += ds;
    if (this.sinceEmit >= this.emitEvery) {
      this.points.push([this.pose.x, this.pose.z]);
      this.sinceEmit = 0;
    }
  }

  private closeSection(): void {
    this.current.to = this.s;
    if (this.current.to > this.current.from) this.sections.push({ ...this.current });
  }
}

/** Pose `dist` meters ahead of (or behind, if negative) `p`. */
export function offsetPose(p: Pose, dist: number, lateral = 0): Pose {
  return {
    x: p.x + Math.sin(p.h) * dist - Math.cos(p.h) * lateral,
    z: p.z + Math.cos(p.h) * dist + Math.sin(p.h) * lateral,
    h: p.h,
  };
}

type DubinsStep = ['L' | 'R' | 'S', number];

/**
 * The shortest of the four turn-straight-turn Dubins paths between two
 * poses, as (turn or straight, metres) steps. Worked in a plane where
 * X = z and Y = x, so heading h is the standard angle and left is
 * counterclockwise.
 */
export function dubins(from: Pose, to: Pose, radius: number): DubinsStep[] {
  const mod = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const dx = to.z - from.z;
  const dy = to.x - from.x;
  const d = Math.hypot(dx, dy) / radius;
  const phi = Math.atan2(dy, dx);
  const a = mod(from.h - phi);
  const b = mod(to.h - phi);
  const sa = Math.sin(a);
  const sb = Math.sin(b);
  const ca = Math.cos(a);
  const cb = Math.cos(b);
  const cab = Math.cos(a - b);
  const words: [string, number, number, number][] = [];
  let p2 = 2 + d * d - 2 * cab + 2 * d * (sa - sb);
  if (p2 >= 0) {
    const th = Math.atan2(cb - ca, d + sa - sb);
    words.push(['LSL', mod(-a + th), Math.sqrt(p2), mod(b - th)]);
  }
  p2 = 2 + d * d - 2 * cab + 2 * d * (sb - sa);
  if (p2 >= 0) {
    const th = Math.atan2(ca - cb, d - sa + sb);
    words.push(['RSR', mod(a - th), Math.sqrt(p2), mod(-b + th)]);
  }
  p2 = -2 + d * d + 2 * cab + 2 * d * (sa + sb);
  if (p2 >= 0) {
    const p = Math.sqrt(p2);
    const th = Math.atan2(-ca - cb, d + sa + sb) - Math.atan2(-2, p);
    words.push(['LSR', mod(-a + th), p, mod(-b + th)]);
  }
  p2 = d * d - 2 + 2 * cab - 2 * d * (sa + sb);
  if (p2 >= 0) {
    const p = Math.sqrt(p2);
    const th = Math.atan2(ca + cb, d - sa - sb) - Math.atan2(2, p);
    words.push(['RSL', mod(a - th), p, mod(b - th)]);
  }
  if (!words.length) return [['S', Math.hypot(dx, dy)]];
  const [word, t, p, q] = words.reduce((best, w) => (w[1] + w[2] + w[3] < best[1] + best[2] + best[3] ? w : best));
  return [
    [word[0] as 'L' | 'R', t * radius],
    ['S', p * radius],
    [word[2] as 'L' | 'R', q * radius],
  ];
}
