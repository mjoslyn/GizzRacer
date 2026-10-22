import { wrapAngle } from '../core/math';
import type { DriveEnv, GroundInfo, KartState, SurfaceType, WallHit } from '../physics/kart';
import type { PitDef, RibbonDef, RoadSurface } from './builder';
import { buildSpline, indexAt, nearestOnSpline, pointAt, type SplineHit, type TrackSpline } from './spline';

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
  /**
   * The laps it's there on, by the lap each kart is on (1 is the first;
   * 'final' is the last lap of a race of more than one). Always, when absent.
   */
  openOn?: (number | 'final')[];
  /**
   * What it is on the other laps: gone ('vanish': drive on and you're in
   * the water), drowned by the tide ('flood'), or barred from this far along
   * it, in builder units ('barrier': karts bounce off the bar).
   */
  shut?: { kind: 'vanish' } | { kind: 'flood' } | { kind: 'barrier'; at: number; look?: BarrierLook };
}

/** How a bar across a road looks: a striped boom that swings up, or a wall (of ice, fire, bone, steel) that sinks away. */
export interface BarrierLook {
  style: 'boom' | 'wall';
  color?: number;
  /** Lit from within (fire, neon). */
  glow?: boolean;
}

/** Which lap a kart is on, for the roads that are only there on some (BranchDef.openOn). */
export interface LapContext {
  /** 1 is the first lap. */
  lap: number;
  /** The last lap of a race of more than one. */
  lastLap: boolean;
}

/** The first lap of a race of `laps` on which every one of a track's shortcuts is there (for tests and tools). */
export function shortcutLap(def: TrackDef, laps = 3): LapContext {
  for (let lap = 1; lap <= laps; lap++) {
    const ctx = { lap, lastLap: laps > 1 && lap === laps };
    if (def.branches.every((b) => branchOpen(b, ctx))) return ctx;
  }
  return { lap: 1, lastLap: false };
}

/** Whether a branch is there on a lap; with no lap given, every branch is. */
export function branchOpen(def: BranchDef, ctx?: LapContext): boolean {
  if (!ctx || !def.openOn) return true;
  return def.openOn.some((o) => (o === 'final' ? ctx.lastLap : o === ctx.lap));
}

export interface Landmark {
  kind: 'skeletonArch' | 'fangs' | 'fortressGate' | 'templeGate' | 'waterfall' | 'gantry' | 'lighthouse' | 'iceArch' | 'neonArch' | 'rainbowArch' | 'dragonGate' | 'dragonFlight' | 'colonyGate' | 'rodGate' | 'voidEye' | 'phantomArch' | 'runwayGate' | 'treeGate' | 'wreckGate' | 'worldTree' | 'crystalGate' | 'magentaPeak' | 'keplerArch' | 'goblinGate' | 'jawsGate' | 'castleGate' | 'castleKeep' | 'cloudGate' | 'airCastle' | 'skyTower' | 'cellGate' | 'nucleus' | 'prismGate' | 'prismEye';
  ribbon: number; // -1 = main, else branch index
  s: number; // builder units
  /** Metres to the right of the road (left if negative), for a landmark that stands off it. */
  lateral?: number;
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
  /**
   * Rows of item boxes across the road, at arc lengths (builder units) on the
   * main ribbon, or on a branch (`ribbon`, an index into `branches`).
   * `double` boxes hold two items; put them on the risky lines.
   */
  itemBoxes: ItemBoxRow[];
  hazards: HazardDef[];
  /** Visual theme (render/themes.ts). */
  theme: 'desert' | 'speedway' | 'volcano' | 'jungle' | 'lagoon' | 'glacier' | 'neon' | 'dream' | 'petro' | 'mars' | 'storm' | 'void' | 'phantom' | 'airfield' | 'grove' | 'doubt' | 'magenta' | 'kepler' | 'goblin' | 'primeval' | 'castle' | 'skycastle' | 'cell' | 'prism';
  /** No ground: off the road is a long drop (the sky track). */
  abyss?: boolean;
  /** Music cues (public/music/<cue>.mp3): one for the race, one for the final lap. */
  music: { lap: string; finalLap?: string };
}

export interface ItemBoxRow {
  s: number;
  count: number;
  ribbon?: number;
  /** Centre of the row as an offset from the centerline (m), the same way round as a boost pad's `lateral`. */
  lateral?: number;
  /** Width of the row (m); defaults to 70% of the road. */
  span?: number;
  double?: boolean;
}

/**
 * Track hazards, positioned along the main ribbon (builder units). Their
 * motion is a pure function of race time (items/hazards.ts).
 */
export type HazardDef =
  | { kind: 'snakes'; from: number; to: number; count: number; period: number }
  | { kind: 'dustDevils'; from: number; to: number; count: number }
  | { kind: 'tumbleweeds'; from: number; to: number; count: number }
  | { kind: 'boulders'; at: number[]; period: number }
  /** Volcano: boulders that fall glowing and smoulder where they land. */
  | { kind: 'lavaBombs'; at: number[]; period: number }
  /** Volcano fortress: jets of fire across the whole road, on a rhythm. */
  | { kind: 'flameJets'; at: number[]; period: number }
  /** Jungle: logs swinging across the road on vines. */
  | { kind: 'vines'; at: number[]; period: number }
  /** Jungle ruins: polygon boulders rolling across the road and back. */
  | { kind: 'rollers'; from: number; to: number; count: number; period: number }
  /** Lagoon: fish leaping across the road from one side to the other. */
  | { kind: 'fish'; from: number; to: number; count: number; period: number }
  /** Glacier: blocks of ice sliding across the road and back. */
  | { kind: 'iceBlocks'; from: number; to: number; count: number; period: number }
  /** City: laser gates across the whole road, on a rhythm. */
  | { kind: 'lasers'; at: number[]; period: number }
  /** Sky: swarms of butterflies that buffet karts sideways. */
  | { kind: 'butterflies'; from: number; to: number; count: number }
  /** Petrodragonic: dragons perched by the road breathing fire across all of it, on a rhythm. */
  | { kind: 'dragonFire'; at: number[]; period: number }
  /** Petrodragonic: burning oil dropped from above, left smouldering on the road. */
  | { kind: 'oilBombs'; at: number[]; period: number }
  /** Hell on Mars: meteors streaking down and smouldering in their craters. */
  | { kind: 'meteors'; at: number[]; period: number }
  /** Supercell: hailstones the size of boulders. */
  | { kind: 'hail'; at: number[]; period: number }
  /** Supercell and Murder of the Universe: a ring of warning, then a bolt where it stood. */
  | { kind: 'lightning'; at: number[]; period: number }
  /** Supercell: tornadoes wandering the road, flinging karts round and out. */
  | { kind: 'tornadoes'; from: number; to: number; count: number }
  /** Murder of the Universe: black holes drifting across the road, dragging karts round and in. */
  | { kind: 'blackHoles'; from: number; to: number; count: number }
  /** Phantom Island: ghost lights drifting over the road, buffeting karts round. */
  | { kind: 'wisps'; from: number; to: number; count: number }
  /** Deadstick Drop: planes with their propellers stopped, gliding in to crash-land on the road. */
  | { kind: 'gliders'; at: number[]; period: number }
  /** Panpsych Grove: standing stones, awake, shuffling across the road and back. */
  | { kind: 'stones'; from: number; to: number; count: number; period: number }
  /** Sea of Doubt: waves breaking right across the causeway, on a rhythm. */
  | { kind: 'waves'; at: number[]; period: number }
  /** Magenta Mountain: magenta crystals tumbling across the road and back. */
  | { kind: 'crystals'; from: number; to: number; count: number; period: number }
  /** Kepler-22b: geysers that bubble as a warning, then erupt, throwing karts up. */
  | { kind: 'geysers'; at: number[]; period: number }
  /** The Garden Goblin: goblins scurrying across the path. */
  | { kind: 'goblins'; from: number; to: number; count: number; period: number }
  /** Predator X: the pliosaur circles (a fin, ripples), then lunges out of the water and snaps across the road's edge. */
  | { kind: 'jaws'; at: number[]; period: number }
  /** Crumbling Castle: blocks of masonry that shake loose, slam down on the road and haul back up. */
  | { kind: 'crushers'; at: number[]; period: number }
  /** The Castle in the Air: gusts of wind blowing right across the road, on a rhythm, one way and then the other. */
  | { kind: 'gusts'; at: number[]; period: number }
  /** Inner Cell: vesicles drifting across the road and back, bouncy. */
  | { kind: 'vesicles'; from: number; to: number; count: number; period: number }
  /** Tetrachromacy: a beam of light across the road cycling red, green, blue and the fourth colour. */
  | { kind: 'prisms'; at: number[]; period: number };

export interface StartSlot {
  x: number;
  z: number;
  y: number;
  heading: number;
}

/** A kart's place across the road it's on (Track.roadFrame). */
export interface RoadFrame {
  /** Metres right of the centre line (negative is left). */
  lateral: number;
  halfWidth: number;
  /** The road's direction of travel, a unit vector. */
  tx: number;
  tz: number;
  walled: boolean;
  /** Signed curvature (rad/m); positive turns left. */
  curvature: number;
}

type Support = { ribbon: Ribbon; hit: SplineHit; branch: number };

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
/**
 * A road this far below the ground runs in a cut: the earth opens along it
 * and its sides are walls of rock up to the ground and this much over.
 */
export const CUT_DEPTH = 0.3;
export const CUT_RIM = 1.5;
/** A road raised on the ground (not a deck on pillars) sits on a bank of earth this many metres out for each metre up: you can drive back up it. */
export const BANK = 2;
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
  /** Heading at each sample, unwrapped so differences measure total turning. */
  readonly turn: Float64Array;
  /** Signed curvature (rad/m) at each sample; positive turns left. */
  readonly curvature: Float32Array;
  /** 1 where the road is sunk into the ground (Track.cutInto): rock walls up to ground level, and a hole in the ground above. */
  readonly cut: Uint8Array;
  /** 1 where the road is raised on a bank of earth (Track.cutInto): its sides slope down to the ground, BANK out per metre up. */
  readonly bank: Uint8Array;

  constructor(readonly def: RibbonDef) {
    this.spline = buildSpline(def.points, 2, def.closed);
    const sp = this.spline;
    this.turn = new Float64Array(sp.count);
    this.curvature = new Float32Array(sp.count);
    for (let i = 0; i < sp.count; i++) {
      const h = Math.atan2(sp.tx[i], sp.tz[i]);
      this.turn[i] = i === 0 ? h : this.turn[i - 1] + wrapAngle(h - Math.atan2(sp.tx[i - 1], sp.tz[i - 1]));
    }
    for (let i = 0; i < sp.count; i++) {
      const a = sp.closed ? (i - 2 + sp.count) % sp.count : Math.max(i - 2, 0);
      const b = sp.closed ? (i + 2) % sp.count : Math.min(i + 2, sp.count - 1);
      const ds = 4 * (sp.length / (sp.closed ? sp.count : sp.count - 1));
      this.curvature[i] = wrapAngle(Math.atan2(sp.tx[b], sp.tz[b]) - Math.atan2(sp.tx[a], sp.tz[a])) / ds;
    }
    this.cut = new Uint8Array(sp.count);
    this.bank = new Uint8Array(sp.count);
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

  /**
   * Marks where the road runs below the ground and walls it in up to ground
   * level, and where it's raised on an earth bank; `overPit` says where the
   * ground is already open.
   */
  cutInto(overPit: (x: number, z: number) => boolean): void {
    const sp = this.spline;
    for (let i = 0; i < sp.count; i++) {
      const h = this.heightAt(sp.dist[i]);
      if (this.inGap(sp.dist[i]) || overPit(sp.px[i], sp.pz[i])) continue;
      // Up on the ground and not a deck: an earth bank either side.
      if (h > 0.05 && !this.def.sections[this.sectionIndex[i]]?.bridge) this.bank[i] = 1;
      if (h >= -CUT_DEPTH) continue;
      this.cut[i] = 1;
      this.wallHeight[i] = Math.max(this.wallHeight[i], -h + CUT_RIM);
    }
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

  /** Unwrapped heading at spline arc length s; on a loop it keeps counting past the line. */
  private turnAt(s: number): number {
    const sp = this.spline;
    const L = sp.length;
    const laps = sp.closed ? Math.floor(s / L) : 0;
    const local = sp.closed ? s - laps * L : Math.min(Math.max(s, 0), L);
    const i = indexAt(sp, local);
    const j = (i + 1) % sp.count;
    const segLen = j === 0 ? L - sp.dist[i] : sp.dist[j] - sp.dist[i];
    const t = (local - sp.dist[i]) / (segLen || 1);
    const next = j === 0 ? this.turn[0] + this.loopTurn() : this.turn[j];
    return this.turn[i] + (next - this.turn[i]) * t + laps * this.loopTurn();
  }

  private loopTurn(): number {
    const sp = this.spline;
    const last = sp.count - 1;
    return this.turn[last] - this.turn[0] + wrapAngle(Math.atan2(sp.tx[0], sp.tz[0]) - Math.atan2(sp.tx[last], sp.tz[last]));
  }

  /** Signed heading change from s0 to s1 (positive = left), any length of road. */
  turnBetween(s0: number, s1: number): number {
    return this.turnAt(s1) - this.turnAt(s0);
  }

  /** Largest |curvature| between s0 and s1. */
  maxCurvature(s0: number, s1: number): number {
    const sp = this.spline;
    let max = 0;
    for (let s = s0; s <= s1; s += 2) {
      const local = sp.closed ? ((s % sp.length) + sp.length) % sp.length : s;
      max = Math.max(max, Math.abs(this.curvature[indexAt(sp, local)]));
    }
    return max;
  }

  curvatureAt(s: number): number {
    const sp = this.spline;
    const local = sp.closed ? ((s % sp.length) + sp.length) % sp.length : s;
    return this.curvature[indexAt(sp, local)];
  }

  halfWidthAtS(s: number): number {
    const sp = this.spline;
    const local = sp.closed ? ((s % sp.length) + sp.length) % sp.length : s;
    return this.halfWidth[indexAt(sp, local)];
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
    // Sunk into the ground (not over a pit, which is open water or a drop): a cut.
    if (!def.abyss) for (const r of [this.main, ...this.branches]) r.cutInto((x, z) => def.pits.some((p) => inPit(p, x, z)));
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

  /**
   * How far along branch `k` (spline metres) it can be driven on this lap:
   * all of it when it's open, none when it's gone, up to the bar when it's barred.
   */
  private branchReach(k: number, ctx?: LapContext): number {
    const def = this.def.branches[k];
    if (branchOpen(def, ctx)) return Infinity;
    return def.shut?.kind === 'barrier' ? def.shut.at * this.branches[k].scale : -Infinity;
  }

  /** The road under a point (the highest one within a step up), and the main ribbon's nearest point. */
  private support(x: number, z: number, y: number, hint: number, ctx?: LapContext): { mainHit: SplineHit; support: Support | null; bestY: number } {
    const mainHit = this.nearestMain(x, z, hint);
    let bestY = -Infinity;
    let support: Support | null = null;

    const consider = (ribbon: Ribbon, hit: SplineHit, branch: number) => {
      if (Math.abs(hit.lateral) > ribbon.halfWidthAt(hit) + CURB || pastEnd(ribbon, hit)) return;
      if (ribbon.inGap(hit.s)) return;
      const ry = ribbon.heightAt(hit.s);
      if (ry > y + STEP_UP || ry <= bestY) return;
      bestY = ry;
      support = { ribbon, hit, branch };
    };
    consider(this.main, mainHit, -1);
    this.branches.forEach((r, k) => {
      const reach = this.branchReach(k, ctx);
      if (reach === -Infinity) return;
      const hit = nearestOnSpline(r.spline, x, z);
      if (hit.s <= reach) consider(r, hit, k);
    });
    return { mainHit, support, bestY };
  }

  /** Where a kart sits on the road it's driving: its offset from the centre line, the road's edge and direction there, and whether that edge is walled. Null off the road. */
  roadFrame(s: KartState): RoadFrame | null {
    const { support } = this.support(s.x, s.z, s.y, s.trackHint, s);
    if (!support) return null;
    const { ribbon, hit } = support as Support;
    return { lateral: hit.lateral, halfWidth: ribbon.halfWidthAt(hit), tx: hit.tx, tz: hit.tz, walled: ribbon.wallHeight[hit.index] > 0.5, curvature: ribbon.curvature[hit.index] };
  }

  /** The road (or ground) at a point; `ctx` leaves out the roads that aren't there on that lap. */
  locate(x: number, z: number, y: number, hint = -1, ctx?: LapContext): TrackLocation {
    const { mainHit, support, bestY } = this.support(x, z, y, hint, ctx);
    let progress = mainHit.s;
    if (!support) {
      // Off the road: the ground, or the bank of a raised road beside it.
      let ground = this.terrainHeight(x, z, y);
      if (y >= -1) {
        ground = Math.max(ground, this.bankHeight(this.main, mainHit));
        this.branches.forEach((r, k) => {
          if (this.branchReach(k, ctx) === Infinity) ground = Math.max(ground, this.bankHeight(r, nearestOnSpline(r.spline, x, z)));
        });
      }
      return {
        hint: mainHit.index,
        progress,
        height: ground,
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
    const road = sup.ribbon.surfaceAt(sup.hit.index);
    if (surface === 'road' && (road === 'ice' || road === 'oil')) surface = road;
    return {
      hint: mainHit.index,
      progress,
      height: bestY,
      surface,
      section: sup.ribbon.sectionName(sup.hit.index),
      onRoad: true,
    };
  }

  /** Where a kart is, on the lap it's on. */
  locateKart(s: KartState): TrackLocation {
    return this.locate(s.x, s.z, s.y, s.trackHint, s);
  }

  probe(s: KartState): GroundInfo {
    const loc = this.locateKart(s);
    s.trackHint = loc.hint;
    // Gravity goes with the stretch of main road nearest, on it or flying over a gap beside it.
    const gravity = this.main.def.sections[this.main.sectionIndex[loc.hint]]?.gravity;
    return gravity === undefined ? { height: loc.height, surface: loc.surface } : { height: loc.height, surface: loc.surface, gravity };
  }

  collide(s: KartState, radius: number): WallHit | null {
    let best: WallHit | null = null;
    const keep = (h: WallHit | null) => {
      if (h && (!best || h.depth > best.depth)) best = h;
    };
    keep(this.ribbonWalls(this.main, this.nearestMain(s.x, s.z, s.trackHint), s.y, radius));
    this.branches.forEach((r, k) => {
      const reach = this.branchReach(k, s);
      if (reach === -Infinity) return;
      const hit = nearestOnSpline(r.spline, s.x, s.z);
      if (hit.s <= reach) keep(this.ribbonWalls(r, hit, s.y, radius));
      // Barred: a bar across the road there, from the side the kart comes from.
      if (reach !== Infinity && !pastEnd(r, hit) && Math.abs(hit.lateral) < r.halfWidthAt(hit) + 1 && hit.s > reach - radius && hit.s < reach + 2 && Math.abs(s.y - r.heightAt(hit.s)) < 3) {
        keep({ nx: -hit.tx, nz: -hit.tz, depth: hit.s - (reach - radius) });
      }
    });

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
    if (y < -1 || this.def.abyss) return PIT_FLOOR;
    for (const p of this.def.pits) if (inPit(p, x, z)) return -p.depth;
    return 0;
  }

  /** Height of a raised road's earth bank at `hit`; -Infinity off it, so a pit beside it stays a pit. */
  private bankHeight(ribbon: Ribbon, hit: SplineHit): number {
    // Only beside the road: across a jump's gap there's nothing, bank or road.
    const hw = ribbon.halfWidthAt(hit);
    if (!ribbon.bank[hit.index] || pastEnd(ribbon, hit) || ribbon.inGap(hit.s) || Math.abs(hit.lateral) <= hw) return -Infinity;
    const h = ribbon.heightAt(hit.s);
    const out = Math.max(0, Math.abs(hit.lateral) - hw - CURB);
    return out < h * BANK ? h * (1 - out / (h * BANK)) : -Infinity;
  }

  /** Under or right beside a deck that's above you, off the road: there's no getting back up there. */
  underDeck(s: KartState): boolean {
    const deck = (r: Ribbon, hit: SplineHit) =>
      !pastEnd(r, hit) && !!r.def.sections[r.sectionIndex[hit.index]]?.bridge && Math.abs(hit.lateral) < r.halfWidthAt(hit) + 3 && r.heightAt(hit.s) > s.y + STEP_UP;
    return deck(this.main, this.nearestMain(s.x, s.z, s.trackHint)) || this.branches.some((r, k) => this.branchReach(k, s) === Infinity && deck(r, nearestOnSpline(r.spline, s.x, s.z)));
  }

  private ribbonWalls(ribbon: Ribbon, hit: SplineHit, y: number, radius: number): WallHit | null {
    if (pastEnd(ribbon, hit)) return null;
    const hw = ribbon.halfWidthAt(hit);
    const lat = hit.lateral;
    const abs = Math.abs(lat);
    if (abs > hw + 4) return null;
    const ry = ribbon.heightAt(hit.s);
    const side = Math.sign(lat) || 1;
    // Right of travel is (-tz, tx).
    const rx = -hit.tz * side;
    const rz = hit.tx * side;

    if (ry > y + STEP_UP && !ribbon.inGap(hit.s) && !ribbon.bank[hit.index]) {
      // Road is above us with no bank to drive up: its side is a cliff face. Only push from the edge band.
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

/** A point beyond either end of an open ribbon (a branch) is off it, however close its side line passes. */
function pastEnd(ribbon: Ribbon, hit: SplineHit): boolean {
  return !ribbon.spline.closed && hit.distance > Math.abs(hit.lateral) + 0.5;
}

export function inPit(p: PitDef, x: number, z: number): boolean {
  const dx = x - p.x;
  const dz = z - p.z;
  const along = dx * Math.sin(p.heading) + dz * Math.cos(p.heading);
  const across = -dx * Math.cos(p.heading) + dz * Math.sin(p.heading);
  return Math.abs(along) <= p.halfLength && Math.abs(across) <= p.halfWidth;
}
