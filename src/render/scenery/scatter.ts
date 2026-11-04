import * as THREE from 'three';
import { seededRandom } from '../../core/math';
import type { Ribbon, Track } from '../../tracks/track';
import { jitter, range, weighted, type Rand } from './base';
import { inPits, clearance, offRoad, wrap } from './road';

/**
 * Props scattered along a stretch of road, the way every world dresses its
 * roadside: a varied row either side, kept off every road (the lap's other
 * stretches too) and out of the pits, each one sized, turned and picked
 * by weight; or the same mesh many times over in one InstancedMesh (tufts,
 * stones, posts, candles, crosses), colour-jittered.
 */

export interface StretchOptions {
  track: Track;
  /** The road to line (track.main, or one of track.branches). */
  ribbon: Ribbon;
  /** Where along it, in spline metres; `to` may run past the end of a closed lap. */
  from: number;
  to: number;
  /** Mean metres between props along each side (varied by ±40%). */
  spacing: number;
  side?: 'both' | 'left' | 'right';
  /** The band beside the road they stand in, in metres beyond its edge: [nearest, farthest]. Default [3, 14]. */
  band?: readonly [number, number];
  /** How far a prop's middle must stay from the edge of any road (default: the band's near edge less a metre, at least 1.5). */
  clear?: number;
  /** Chance of leaving a gap where a prop would go, 0 to 1. */
  gaps?: number;
  /** Size range, a multiplier (default [0.8, 1.3]). */
  scale?: readonly [number, number];
  seed?: number;
}

/** Where one prop goes. */
export interface Site {
  x: number;
  z: number;
  /** Along the ribbon, and which side (1 right, -1 left). */
  s: number;
  side: 1 | -1;
  /** Metres beyond the road's edge. */
  gap: number;
  /** The road's heading at `s` (a rotation.y that turns +z along it), and the turn that faces +z at the road. */
  heading: number;
  facing: number;
  scale: number;
  /** A random turn about y. */
  yaw: number;
}

/** The sites along a stretch, clear of the roads and pits; pure, so it's tested. */
export function scatterSites(o: StretchOptions): Site[] {
  const rand = seededRandom(o.seed ?? 4242);
  const [near, far] = o.band ?? [3, 14];
  const clear = o.clear ?? Math.max(1.5, near - 1);
  const scale = o.scale ?? [0.8, 1.3];
  const sides: (1 | -1)[] = o.side === 'left' ? [-1] : o.side === 'right' ? [1] : [-1, 1];
  const out: Site[] = [];
  const to = o.to >= o.from ? o.to : o.to + o.ribbon.spline.length;
  for (const side of sides) {
    for (let d = o.from + rand() * o.spacing * 0.5; d < to; d += o.spacing * (0.6 + rand() * 0.8)) {
      if (o.gaps && rand() < o.gaps) continue;
      const s = wrap(o.ribbon, d);
      const gap = near + rand() * (far - near);
      const at = offRoad(o.ribbon, s, side * (o.ribbon.halfWidthAtS(s) + gap));
      if (clearance(o.track, at.x, at.z) < clear || inPits(o.track, at.x, at.z, 2)) continue;
      out.push({ x: at.x, z: at.z, s, side, gap, heading: at.heading, facing: at.heading + (side * Math.PI) / 2, scale: range(rand, scale), yaw: rand() * Math.PI * 2 });
    }
  }
  return out;
}

/** One prop, built at the origin (its foot on y = 0, facing +z); the site says where it's going if it cares. */
export type Prop = (rand: Rand, site: Site) => THREE.Object3D;

export interface ScatterOptions extends StretchOptions {
  /** What stands there, by weight: at least three kinds per stretch. */
  kinds: readonly (readonly [number, Prop])[];
  /** How each is turned: at random (default), facing the road, or along it. */
  turn?: 'random' | 'road' | 'along';
}

/** A varied row of props either side of a stretch of road. */
export function scatter(o: ScatterOptions): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom((o.seed ?? 4242) + 17);
  for (const site of scatterSites(o)) {
    const obj = weighted(rand, o.kinds)(rand, site);
    obj.position.set(site.x, obj.position.y, site.z);
    obj.scale.multiplyScalar(site.scale);
    obj.rotation.y = o.turn === 'road' ? site.facing : o.turn === 'along' ? site.heading : site.yaw;
    g.add(obj);
  }
  return g;
}

export interface InstancedOptions extends StretchOptions {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Colours to pick from, each jittered by `jitter` (0 to 1, default 0.1); none keeps the material's own. */
  colors?: readonly number[];
  jitter?: number;
  /** Squash or stretch in y as well as the size (a range multiplier, default [1, 1]). */
  stretchY?: readonly [number, number];
  /** Lifted this far (times the size) off the ground: half the geometry's height for one centred on its middle. */
  lift?: number;
  /** A random tilt, in radians, either way. */
  tilt?: number;
  turn?: 'random' | 'road' | 'along';
}

/**
 * Many of one mesh along a stretch, in one draw call: tufts, stones, posts,
 * candles, crosses, skulls. Colour-jittered per instance when `colors` is
 * given (the material should be white, or a light tint, for that).
 */
export function scatterInstanced(o: InstancedOptions): THREE.InstancedMesh {
  const sites = scatterSites(o);
  const mesh = new THREE.InstancedMesh(o.geometry, o.material, Math.max(1, sites.length));
  const rand = seededRandom((o.seed ?? 4242) + 29);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();
  sites.forEach((site, i) => {
    const yaw = o.turn === 'road' ? site.facing : o.turn === 'along' ? site.heading : site.yaw;
    const tilt = o.tilt ?? 0;
    e.set((rand() - 0.5) * 2 * tilt, yaw, (rand() - 0.5) * 2 * tilt);
    q.setFromEuler(e);
    const sy = site.scale * range(rand, o.stretchY ?? [1, 1]);
    p.set(site.x, (o.lift ?? 0) * sy, site.z);
    sc.set(site.scale, sy, site.scale);
    mesh.setMatrixAt(i, m.compose(p, q, sc));
    if (o.colors?.length) mesh.setColorAt(i, jitter(o.colors[Math.floor(rand() * o.colors.length)], rand, o.jitter ?? 0.1, c));
  });
  mesh.count = sites.length;
  return mesh;
}
