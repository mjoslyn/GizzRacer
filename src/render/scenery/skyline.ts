import * as THREE from 'three';
import { seededRandom } from '../../core/math';
import type { Track } from '../../tracks/track';
import { canvas, canvasTexture, glowSprite, jitter, once, range, type Animated } from './base';

/**
 * A skyline: a ring of shapes standing round the whole track beyond its
 * walls, between the play area and the theme's own far silhouettes
 * (`Theme.distant`, 560 m out and more): towers with lit windows, blocks,
 * spires, hills, domes, chimney stacks. One InstancedMesh per shape, and
 * a blinking beacon sprite on some. It's what's behind every driver's-seat
 * frame, so a stretch never ends at bare horizon. It stands just outside
 * the play area's square (its walls), so it never lands on the road; the
 * ones out by the corners fade into the fog, which layers it.
 */

export type SkylineShape = 'tower' | 'block' | 'spire' | 'hill' | 'dome' | 'stack';

export interface SkylineOptions {
  /** The track, to ring its play area (or give `center` and `radius`). */
  track?: Track;
  center?: { x: number; z: number };
  /** The half-extent of the square it stands outside (default the track's bounds, else 400), how far beyond it it starts (default 30), and how deep it is (default 160). */
  bounds?: number;
  gap?: number;
  depth?: number;
  /** How many shapes round the ring (default 48). */
  count?: number;
  /** Which shapes, by weight. */
  shapes: readonly (readonly [number, SkylineShape])[];
  /** Height and width ranges in metres (default [30, 110] and [18, 50]). */
  height?: readonly [number, number];
  width?: readonly [number, number];
  /** The silhouettes' colour, jittered a little. */
  color: number;
  /** Lit windows on towers and blocks (a colour, glowing through the fog), how many lit (0 to 1, default 0.35). */
  windows?: number;
  lit?: number;
  /** A blinking beacon on top of every `beacons.every`th tall one. */
  beacons?: { color: number; every?: number };
  /** Leave the ring open where `open(angle)` is true (a sea, a view). */
  open?: (angle: number) => boolean;
  seed?: number;
}

/** A window texture: a grid of panes, some lit, the rest dark; white where lit, so the emissive colour tints it. */
const windowMap = once(() => {
  const [c, ctx] = canvas(64, 128);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 64, 128);
  const rand = seededRandom(909);
  for (let y = 4; y < 124; y += 8) for (let x = 4; x < 60; x += 8) if (rand() < 0.35) {
    ctx.fillStyle = `rgba(255,255,255,${0.6 + rand() * 0.4})`;
    ctx.fillRect(x, y, 4, 5);
  }
  const t = canvasTexture(c);
  t.repeat.set(2, 4);
  return t;
});

const GEOMETRY: Record<SkylineShape, () => THREE.BufferGeometry> = {
  // Unit shapes, their foot at y = 0, a metre across and a metre high, scaled per instance.
  tower: () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  block: () => new THREE.BoxGeometry(1, 1, 0.8).translate(0, 0.5, 0),
  spire: () => new THREE.ConeGeometry(0.5, 1, 6).translate(0, 0.5, 0),
  hill: () => new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1),
  dome: () => new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1),
  stack: () => new THREE.CylinderGeometry(0.35, 0.5, 1, 8).translate(0, 0.5, 0),
};

/** How wide each shape stands for its width: hills and domes spread, spires and stacks are slim. */
const FOOTPRINT: Record<SkylineShape, number> = { tower: 1, block: 1, spire: 0.5, hill: 2.2, dome: 2.2, stack: 0.5 };

/** A ring of silhouettes round the track. Add the group to the world (a landmark builder can return it). */
export function skyline(o: SkylineOptions, animated?: Animated): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(o.seed ?? 2718);
  const cx = o.center?.x ?? 0;
  const cz = o.center?.z ?? 0;
  const bounds = o.bounds ?? o.track?.def.bounds ?? 400;
  const gap = o.gap ?? 30;
  const depth = o.depth ?? 160;
  const count = o.count ?? 48;
  const heights = o.height ?? [30, 110];
  const widths = o.width ?? [18, 50];
  type Spot = { x: number; z: number; w: number; h: number; yaw: number; shape: SkylineShape };
  const spots: Spot[] = [];
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + rand() * (Math.PI / count);
    if (o.open?.(a)) continue;
    const pick = rand() * o.shapes.reduce((s, [w]) => s + w, 0);
    let acc = 0;
    let shape: SkylineShape = o.shapes[0][1];
    for (const [w, s] of o.shapes) if ((acc += w) >= pick) {
      shape = s;
      break;
    }
    const w = range(rand, widths);
    // Out past the square's edge in this direction, its whole footprint outside the walls (a corner reaches out √2 of its half-width).
    const reach = (FOOTPRINT[shape] * w) / Math.SQRT2;
    const r0 = bounds / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))) + gap + reach;
    const r = r0 + rand() * depth;
    // Further out, taller, so the ring reads in layers.
    const h = range(rand, heights) * (0.8 + (0.4 * (r - r0)) / depth);
    spots.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, w, h, yaw: rand() * Math.PI, shape });
  }
  const windows = o.windows;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  for (const shape of new Set(spots.map((s) => s.shape))) {
    const mine = spots.filter((s) => s.shape === shape);
    const glazed = windows !== undefined && (shape === 'tower' || shape === 'block');
    const mat = glazed
      ? new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: windows, emissiveMap: windowMap(), emissiveIntensity: Math.min(1.5, (o.lit ?? 0.35) * 3) })
      : new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: shape === 'hill' || shape === 'spire' });
    const mesh = new THREE.InstancedMesh(GEOMETRY[shape](), mat, mine.length);
    mine.forEach((s, i) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.yaw);
      const wide = s.w * FOOTPRINT[shape];
      const tall = shape === 'hill' || shape === 'dome' ? s.h * 0.5 : s.h;
      m.compose(new THREE.Vector3(s.x, -1, s.z), q, new THREE.Vector3(wide, tall, wide));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, jitter(o.color, rand, 0.06, c));
    });
    mesh.computeBoundingSphere();
    g.add(mesh);
  }
  if (o.beacons) {
    const every = o.beacons.every ?? 3;
    const beacons = spots.filter((s, k) => (s.shape === 'tower' || s.shape === 'spire' || s.shape === 'stack') && k % every === 0).map((s, k) => {
      const b = glowSprite(o.beacons!.color, 10, 0.9, false);
      b.position.set(s.x, s.h + 3, s.z);
      g.add(b);
      return { b, ph: k * 0.37 };
    });
    animated?.push((time) => beacons.forEach(({ b, ph }) => (b.material.opacity = ((time * 0.8 + ph) % 1) < 0.15 ? 1 : 0.15)));
  }
  return g;
}
