import type { DriveEnv, SurfaceType, WallHit } from '../physics/kart';
import { buildClosedSpline, nearestOnSpline, pointAt, type TrackSpline, type Vec2 } from './spline';

export interface BoostPad {
  s: number; // arc length of the pad's leading edge
  length: number;
  lateral: number; // center offset from the centerline
  halfWidth: number;
}

/** Serializable track description (will move to JSON per spec section 11). */
export interface TrackDef {
  id: string;
  name: string;
  centerline: Vec2[];
  roadHalfWidth: number;
  /** Square play area half-extent; walls sit on its edge. */
  bounds: number;
  boostPads: BoostPad[];
  /** Checkpoints as fractions of a lap, in order, excluding the start line. */
  checkpoints: number[];
  laps: number;
}

export interface StartSlot {
  x: number;
  z: number;
  heading: number;
}

/** Runtime track: the def plus the sampled spline and the physics environment. */
export class Track implements DriveEnv {
  readonly spline: TrackSpline;

  constructor(readonly def: TrackDef) {
    this.spline = buildClosedSpline(def.centerline, 2);
  }

  surfaceAt(x: number, z: number): SurfaceType {
    const hit = nearestOnSpline(this.spline, x, z);
    if (hit.distance > this.def.roadHalfWidth) return 'offroad';
    for (const pad of this.def.boostPads) {
      const ds = (hit.s - pad.s + this.spline.length) % this.spline.length;
      if (ds <= pad.length && Math.abs(hit.lateral - pad.lateral) <= pad.halfWidth) return 'boost';
    }
    return 'road';
  }

  groundHeight(): number {
    return 0;
  }

  collide(x: number, z: number, radius: number): WallHit | null {
    const b = this.def.bounds - radius;
    if (x > b) return { nx: -1, nz: 0, depth: x - b };
    if (x < -b) return { nx: 1, nz: 0, depth: -b - x };
    if (z > b) return { nx: 0, nz: -1, depth: z - b };
    if (z < -b) return { nx: 0, nz: 1, depth: -b - z };
    return null;
  }

  /** Grid slots behind the start line, two abreast, staggered. */
  startSlot(index: number): StartSlot {
    const row = Math.floor(index / 2);
    const side = index % 2 === 0 ? -1 : 1;
    const p = pointAt(this.spline, -6 - row * 7 - (side > 0 ? 3 : 0));
    const rx = -p.tz;
    const rz = p.tx;
    const lat = side * this.def.roadHalfWidth * 0.4;
    return { x: p.x + rx * lat, z: p.z + rz * lat, heading: Math.atan2(p.tx, p.tz) };
  }
}
