import type { DriveEnv, GroundInfo, KartState, SurfaceType, WallHit } from '../physics/kart';
import type { PitDef, RibbonDef, RoadSurface } from './builder';
import { buildSpline, nearestOnSpline, pointAt, type SplineHit, type TrackSpline } from './spline';

export interface BoostPad {
  s: number; // main-ribbon arc length of the pad's leading edge (builder units)
  length: number;
  lateral: number; // center offset from the centerline
  halfWidth: number;
}

/** An alternate route that leaves and rejoins the main ribbon. */
export interface BranchDef extends RibbonDef {
  name: string;
  mainFrom: number; // main arc length where it leaves (builder units)
  mainTo: number; // and where it rejoins
}

export interface Landmark {
  kind: 'skeletonArch' | 'fangs';
  ribbon: number; // -1 = main, else branch index
  s: number; // builder units
}

/** Serializable track description (spec section 11). */
export interface TrackDef {
  id: string;
  name: string;
  main: RibbonDef;
  branches: BranchDef[];
  pits: PitDef[];
  boostPads: BoostPad[];
  /** Checkpoints as fractions of a lap, ascending, excluding the start line. */
  checkpoints: number[];
  laps: number;
  /** Square play area half-extent; walls sit on its edge. */
  bounds: number;
  landmarks: Landmark[];
}

export interface StartSlot {
  x: number;
  z: number;
  y: number;
  heading: number;
}

/** Everything known about a point on the track. */
export interface TrackLocation {
  hint: number; // main sample index, for the next lookup
  progress: number; // main arc length in spline meters
  height: number;
  surface: SurfaceType;
  section: string;
  onRoad: boolean;
}

const CURB = 1.2;
/** How far above the kart a road surface can be and still be stepped onto. */
const STEP_UP = 0.8;
const PIT_FLOOR = -12;
const HINT_WINDOW = 40;

/** Runtime road ribbon with per-sample attributes. */
export class Ribbon {
  readonly spline: TrackSpline;
  /** spline meters per builder meter */
  readonly scale: number;
  readonly halfWidth: Float32Array;
  readonly wallHeight: Float32Array;
  readonly sectionIndex: Uint16Array;

  constructor(readonly def: RibbonDef) {
    this.spline = buildSpline(def.points, 2, def.closed);
    this.scale = def.length > 0 ? this.spline.length / def.length : 1;
    const n = this.spline.count;
    this.sectionIndex = new Uint16Array(n);
    this.wallHeight = new Float32Array(n);
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = this.spline.dist[i] / this.scale;
      const k = this.sectionAt(s);
      this.sectionIndex[i] = k;
      raw[i] = def.sections[k].halfWidth;
      this.wallHeight[i] = def.sections[k].wallHeight ?? 0;
    }
    // Blend widths across section boundaries (about +-8 m).
    this.halfWidth = new Float32Array(n);
    const r = 4;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let count = 0;
      for (let o = -r; o <= r; o++) {
        let j = i + o;
        if (def.closed) j = (j + n) % n;
        else if (j < 0 || j >= n) continue;
        sum += raw[j];
        count++;
      }
      this.halfWidth[i] = sum / count;
    }
  }

  private sectionAt(s: number): number {
    const secs = this.def.sections;
    for (let k = 0; k < secs.length; k++) if (s >= secs[k].from && s < secs[k].to) return k;
    return s < (secs[0]?.from ?? 0) ? 0 : secs.length - 1;
  }

  /** Builder-unit arc length for a spline arc length. */
  toBuilder(s: number): number {
    return s / this.scale;
  }

  heightAtBuilder(s: number): number {
    const keys = this.def.elevation;
    if (s <= keys[0][0]) return keys[0][1];
    for (let k = 1; k < keys.length; k++) {
      if (s <= keys[k][0]) {
        const [s0, y0] = keys[k - 1];
        const [s1, y1] = keys[k];
        return s1 > s0 ? y0 + ((y1 - y0) * (s - s0)) / (s1 - s0) : y1;
      }
    }
    return keys[keys.length - 1][1];
  }

  heightAt(splineS: number): number {
    return this.heightAtBuilder(this.toBuilder(splineS));
  }

  inGap(splineS: number): boolean {
    const s = this.toBuilder(splineS);
    return this.def.gaps.some(([a, b]) => s >= a && s < b);
  }

  halfWidthAt(hit: SplineHit): number {
    const j = (hit.index + 1) % this.spline.count;
    return this.halfWidth[hit.index] + (this.halfWidth[j] - this.halfWidth[hit.index]) * hit.t;
  }

  surfaceAt(index: number): RoadSurface {
    return this.def.sections[this.sectionIndex[index]].surface ?? 'asphalt';
  }

  sectionName(index: number): string {
    return this.def.sections[this.sectionIndex[index]].name;
  }
}

/** Runtime track: ribbons, pits, and the physics environment. */
export class Track implements DriveEnv {
  readonly main: Ribbon;
  readonly branches: Ribbon[];
  /** Main spline length; lap progress is measured against it. */
  readonly length: number;

  constructor(readonly def: TrackDef) {
    this.main = new Ribbon(def.main);
    this.branches = def.branches.map((b) => new Ribbon(b));
    this.length = this.main.spline.length;
  }

  get spline(): TrackSpline {
    return this.main.spline;
  }

  ribbon(index: number): Ribbon {
    return index < 0 ? this.main : this.branches[index];
  }

  /** Spline-meter arc length on the main ribbon for a builder-unit value. */
  mainS(builderS: number): number {
    return builderS * this.main.scale;
  }

  locate(x: number, z: number, y: number, hint = -1): TrackLocation {
    const mainHit = this.nearestMain(x, z, hint);
    let bestY = -Infinity;
    let support: { ribbon: Ribbon; hit: SplineHit; branch: number } | null = null;

    const consider = (ribbon: Ribbon, hit: SplineHit, branch: number) => {
      if (Math.abs(hit.lateral) > ribbon.halfWidthAt(hit) + CURB) return;
      if (ribbon.inGap(hit.s)) return;
      const ry = ribbon.heightAt(hit.s);
      if (ry > y + STEP_UP || ry <= bestY) return;
      bestY = ry;
      support = { ribbon, hit, branch };
    };
    consider(this.main, mainHit, -1);
    this.branches.forEach((r, k) => consider(r, nearestOnSpline(r.spline, x, z), k));

    let progress = mainHit.s;
    if (!support) {
      return {
        hint: mainHit.index,
        progress,
        height: this.terrainHeight(x, z, y),
        surface: 'offroad',
        section: this.main.sectionName(mainHit.index),
        onRoad: false,
      };
    }
    const sup = support as { ribbon: Ribbon; hit: SplineHit; branch: number };
    let surface: SurfaceType = 'road';
    if (sup.branch >= 0) {
      const def = this.def.branches[sup.branch];
      const f = sup.hit.s / sup.ribbon.spline.length;
      progress = this.mainS(def.mainFrom + (def.mainTo - def.mainFrom) * f);
    } else if (this.onBoostPad(sup.hit)) {
      surface = 'boost';
    }
    return {
      hint: mainHit.index,
      progress,
      height: bestY,
      surface,
      section: sup.ribbon.sectionName(sup.hit.index),
      onRoad: true,
    };
  }

  probe(s: KartState): GroundInfo {
    const loc = this.locate(s.x, s.z, s.y, s.trackHint);
    s.trackHint = loc.hint;
    return { height: loc.height, surface: loc.surface };
  }

  collide(s: KartState, radius: number): WallHit | null {
    let best: WallHit | null = null;
    const keep = (h: WallHit | null) => {
      if (h && (!best || h.depth > best.depth)) best = h;
    };
    keep(this.ribbonWalls(this.main, this.nearestMain(s.x, s.z, s.trackHint), s.y, radius));
    for (const r of this.branches) keep(this.ribbonWalls(r, nearestOnSpline(r.spline, s.x, s.z), s.y, radius));

    const b = this.def.bounds - radius;
    if (s.x > b) keep({ nx: -1, nz: 0, depth: s.x - b });
    if (s.x < -b) keep({ nx: 1, nz: 0, depth: -b - s.x });
    if (s.z > b) keep({ nx: 0, nz: -1, depth: s.z - b });
    if (s.z < -b) keep({ nx: 0, nz: 1, depth: -b - s.z });
    return best;
  }

  /** Grid slots behind the start line, two abreast, staggered. */
  startSlot(index: number): StartSlot {
    const row = Math.floor(index / 2);
    const side = index % 2 === 0 ? -1 : 1;
    const p = pointAt(this.spline, -6 - row * 7 - (side > 0 ? 3 : 0));
    const lat = side * this.main.halfWidth[0] * 0.4;
    return this.poseAt(p, lat);
  }

  /** Respawn pose on the main centerline at spline arc length s. */
  respawnPose(s: number): StartSlot {
    return this.poseAt(pointAt(this.spline, s), 0);
  }

  private poseAt(p: { x: number; z: number; tx: number; tz: number }, lateral: number): StartSlot {
    const x = p.x - p.tz * lateral;
    const z = p.z + p.tx * lateral;
    return { x, z, y: this.locate(x, z, 100).height, heading: Math.atan2(p.tx, p.tz) };
  }

  private nearestMain(x: number, z: number, hint: number): SplineHit {
    const sp = this.main.spline;
    if (hint >= 0) {
      const hit = nearestOnSpline(sp, x, z, hint, HINT_WINDOW);
      if (hit.distance < this.main.halfWidth[hit.index] + 25) return hit;
    }
    return nearestOnSpline(sp, x, z);
  }

  private onBoostPad(hit: SplineHit): boolean {
    const s = this.main.toBuilder(hit.s);
    const L = this.def.main.length || this.length;
    for (const pad of this.def.boostPads) {
      const ds = (s - pad.s + L) % L;
      if (ds <= pad.length && Math.abs(hit.lateral - pad.lateral) <= pad.halfWidth) return true;
    }
    return false;
  }

  terrainHeight(x: number, z: number, y: number): number {
    // Below ground level means we're already falling into a pit.
    if (y < -1) return PIT_FLOOR;
    for (const p of this.def.pits) if (inPit(p, x, z)) return -p.depth;
    return 0;
  }

  private ribbonWalls(ribbon: Ribbon, hit: SplineHit, y: number, radius: number): WallHit | null {
    const hw = ribbon.halfWidthAt(hit);
    const lat = hit.lateral;
    const abs = Math.abs(lat);
    if (abs > hw + 4) return null;
    const ry = ribbon.heightAt(hit.s);
    const side = Math.sign(lat) || 1;
    // Right of travel is (-tz, tx).
    const rx = -hit.tz * side;
    const rz = hit.tx * side;

    if (ry > y + STEP_UP && !ribbon.inGap(hit.s)) {
      // Road is above us: its side is a cliff face. Only push from the edge band.
      if (abs > hw - 2 && abs < hw + radius) return { nx: rx, nz: rz, depth: hw + radius - abs };
      return null;
    }
    const wall = ribbon.wallHeight[hit.index];
    if (wall > 0 && y < ry + wall && abs > hw - radius && abs < hw + 3) {
      return { nx: -rx, nz: -rz, depth: abs - (hw - radius) };
    }
    return null;
  }
}

export function inPit(p: PitDef, x: number, z: number): boolean {
  const dx = x - p.x;
  const dz = z - p.z;
  const along = dx * Math.sin(p.heading) + dz * Math.cos(p.heading);
  const across = -dx * Math.cos(p.heading) + dz * Math.sin(p.heading);
  return Math.abs(along) <= p.halfLength && Math.abs(across) <= p.halfWidth;
}
