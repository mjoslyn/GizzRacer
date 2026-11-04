import * as THREE from 'three';
import type { Ribbon, Track } from '../../tracks/track';
import { glowSprite, matte, type Animated } from './base';
import type { Beat } from './beat';
import { lightPool } from './fire';
import { faceOncoming, frameAt, nearOtherStretch, offRoad } from './road';

/**
 * A set piece: a landmark built in layers, the way the best ones are. A
 * body (yours: the giant, the candle, the colossus) stood on a base, a glow
 * round it and the light it throws on the ground, and a slow movement (a
 * turn, a bob, a breath, a pulse on the beat), so it reads from far off and
 * never stands dead still. Then put beside the road, facing the karts.
 */

export interface SetPieceOptions {
  /** What it is, its foot at the origin, facing +z. */
  body: THREE.Object3D;
  /** What it stands on: a stepped plinth, a mound of earth, a ring of stones, your own, or nothing (default plinth). */
  base?: 'plinth' | 'mound' | 'ring' | THREE.Object3D | false;
  /** The base's colour and how wide (default the body's width and a third). */
  baseColor?: number;
  baseWidth?: number;
  /** A halo round it: its colour, size (default twice the body's height), where (default two thirds up), and whether it lights the ground (default true). */
  glow?: { color: number; size?: number; y?: number; pool?: boolean; opacity?: number };
  /** Its movement: a turn (radians a second), a bob (metres, over `period` seconds), a breath (scale, ± this fraction). */
  spin?: number;
  bob?: number;
  breathe?: number;
  period?: number;
  /** The glow (and the breath, if any) pulsing on this beat. */
  beat?: Beat;
}

/** The body on its base with its glow, moving. Its foot at the origin; `.userData.body` is the moving part. */
export function setPiece(o: SetPieceOptions, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Box3().setFromObject(o.body);
  const size = box.getSize(new THREE.Vector3());
  const w = o.baseWidth ?? Math.max(size.x, size.z) * 1.35 + 1;
  let lift = 0;
  if (o.base !== false) {
    const color = o.baseColor ?? 0x2a2420;
    const base = o.base instanceof THREE.Object3D ? o.base : (o.base ?? 'plinth') === 'plinth' ? plinth(w, color) : o.base === 'mound' ? mound(w, color) : stones(w, color);
    g.add(base);
    lift = o.base instanceof THREE.Object3D ? new THREE.Box3().setFromObject(base).max.y : (o.base ?? 'plinth') === 'plinth' ? w * 0.12 : o.base === 'mound' ? w * 0.08 : 0;
  }
  const holder = new THREE.Group();
  holder.position.y = lift;
  holder.add(o.body);
  g.add(holder);
  g.userData.body = holder;
  let halo: THREE.Sprite | null = null;
  let pool: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial> | null = null;
  const opacity = o.glow?.opacity ?? 0.35;
  if (o.glow) {
    halo = glowSprite(o.glow.color, o.glow.size ?? Math.max(6, size.y * 2), opacity);
    halo.position.y = lift + (o.glow.y ?? size.y * 0.66);
    g.add(halo);
    if (o.glow.pool !== false) {
      pool = lightPool(o.glow.color, w * 1.4, opacity * 0.8);
      g.add(pool);
    }
  }
  const period = o.period ?? 6;
  if (o.spin || o.bob || o.breathe || o.beat || o.glow) {
    animated.push((time) => {
      if (o.spin) holder.rotation.y = time * o.spin;
      if (o.bob) holder.position.y = lift + o.bob * (0.5 + 0.5 * Math.sin((time * Math.PI * 2) / period));
      const pulse = o.beat ? o.beat.kick(time) : 0.5 + 0.5 * Math.sin((time * Math.PI * 2) / period);
      if (o.breathe) holder.scale.setScalar(1 + o.breathe * (o.beat ? pulse : Math.sin((time * Math.PI * 2) / period)));
      if (halo) halo.material.opacity = opacity * (0.7 + 0.3 * pulse);
      if (pool) pool.material.opacity = opacity * 0.8 * (0.75 + 0.25 * pulse);
    });
  }
  return g;
}

/** A stepped plinth `w` across: three slabs. */
function plinth(w: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const mat = matte(color, { flat: true });
  [1, 0.8, 0.62].forEach((k, i) => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w * k, w * 0.04, w * k), mat);
    slab.position.y = w * 0.02 + i * w * 0.04;
    g.add(slab);
  });
  return g;
}

/** A low mound of earth `w` across. */
function mound(w: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(w / 2, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), matte(color, { flat: true }));
  m.scale.y = 0.16;
  return m;
}

/** A ring of standing stones `w` across. */
function stones(w: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const mat = matte(color, { flat: true });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const h = w * (0.08 + 0.05 * Math.sin(k * 2.7));
    const st = new THREE.Mesh(new THREE.BoxGeometry(w * 0.05, h, w * 0.035), mat);
    st.position.set(Math.cos(a) * w * 0.5, h / 2, Math.sin(a) * w * 0.5);
    st.rotation.y = -a;
    g.add(st);
  }
  return g;
}

/**
 * Stands `obj` `lateral` metres off the road at `s` (right positive), on
 * the ground, turned to face the karts coming at it. With `track` and a
 * radius, it moves further out (up to three times) while another stretch
 * of the lap would run through it. Returns `obj`.
 */
export function standBeside(obj: THREE.Object3D, ribbon: Ribbon, s: number, lateral: number, o: { track?: Track; radius?: number; face?: 'oncoming' | 'road' | 'along'; back?: number } = {}): THREE.Object3D {
  let lat = lateral;
  if (o.track && o.radius) {
    for (let k = 0; k < 3; k++) {
      const at = offRoad(ribbon, s, lat);
      if (!nearOtherStretch(o.track, ribbon, s, at.x, at.z, o.radius + 8)) break;
      lat += Math.sign(lat || 1) * o.radius;
    }
  }
  const at = offRoad(ribbon, s, lat);
  obj.position.set(at.x, 0, at.z);
  const f = frameAt(ribbon, s);
  if (o.face === 'along') obj.rotation.y = f.heading;
  else if (o.face === 'road') obj.rotation.y = f.heading + (Math.sign(lat || 1) * Math.PI) / 2;
  else faceOncoming(obj, ribbon, s, o.back ?? 90);
  return obj;
}
