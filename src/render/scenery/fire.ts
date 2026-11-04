import * as THREE from 'three';
import { glowMap, glowSprite, lit, matte, smokeSprite, type Animated } from './base';

/**
 * Fire and light. No world uses real lights for its scenery (they cost too
 * much): a flame is a cluster of additive sprites with a white-hot heart, a
 * lamp is a lit shape and its halo, and the light they throw is a soft
 * additive pool on the ground. Each flickers on its own phase.
 */

/** A flicker, about 0.75 to 1, uneven: firelight and guttering lamps. */
export const flicker = (time: number, phase = 0): number => 0.75 + 0.25 * Math.sin(time * 13 + phase) * Math.sin(time * 7.3 + phase * 2);

export interface FlameColors {
  outer: number;
  mid: number;
  core: number;
}
export const FIRE: FlameColors = { outer: 0xff6a1a, mid: 0xff3a10, core: 0xffc050 };

/**
 * A flame `size` tall: three sprites (its outer fire, embers and its heart)
 * licking up. Returns the group (its foot at the origin) and `flicker`, to
 * call each frame, `strength` 0 to 1 to burn it down.
 */
export function flame(size: number, phase = 0, colors: FlameColors = FIRE): { group: THREE.Group; flicker: (time: number, strength?: number) => void } {
  const g = new THREE.Group();
  const outer = glowSprite(colors.outer, size, 0.8);
  const mid = glowSprite(colors.mid, size * 0.7, 0.8);
  const core = glowSprite(colors.core, size * 0.4, 0.9);
  g.add(outer, mid, core);
  return {
    group: g,
    flicker: (time, strength = 1) => {
      const k = strength * flicker(time, phase);
      outer.scale.set(size * (0.8 + 0.2 * k), size * (1.1 + 0.5 * k), 1);
      outer.position.y = size * 0.45 * k;
      mid.scale.set(size * 0.6 * k + 0.01, size * 0.9 * k + 0.01, 1);
      mid.position.y = size * 0.3 * k;
      core.scale.setScalar(size * 0.35 * k + 0.01);
      outer.material.opacity = 0.75 * strength;
      mid.material.opacity = 0.8 * strength;
      core.material.opacity = 0.9 * strength;
    },
  };
}

/** The light a lamp or fire throws on the ground: an additive disc `radius` across, lying flat at y = 0.05. */
export function lightPool(color: number, radius: number, opacity = 0.35): THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial> {
  const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), new THREE.MeshBasicMaterial({ map: glowMap(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.05;
  return m;
}

export interface TorchOptions {
  /** How tall the pole is (default 2.2). */
  height?: number;
  /** A pole, or an iron basket on a stand (a brazier). */
  kind?: 'pole' | 'basket';
  /** The pole's colour. */
  wood?: number;
  colors?: FlameColors;
  /** The flame's size (default 1.4) and whether it lights the ground round it (default true). */
  size?: number;
  pool?: boolean;
}

/** A torch or a brazier burning on its stand, flickering, its glow and the light on the ground round it. Its foot at the origin. */
export function torch(animated: Animated, phase = 0, o: TorchOptions = {}): THREE.Group {
  const g = new THREE.Group();
  const h = o.height ?? 2.2;
  const size = o.size ?? 1.4;
  const colors = o.colors ?? FIRE;
  const wood = matte(o.wood ?? 0x2a1c14);
  if (o.kind === 'basket') {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h, 4), wood);
      leg.position.set(Math.cos(a) * 0.3, h / 2, Math.sin(a) * 0.3);
      leg.rotation.set(Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15);
      g.add(leg);
    }
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.5, 8, 1, true), matte(0x1a1614, { double: true }));
    basket.position.y = h;
    g.add(basket);
  } else {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, h, 5), wood);
    pole.position.y = h / 2;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.35, 6), matte(0x1a1210));
    head.position.y = h;
    g.add(pole, head);
  }
  const f = flame(size, phase, colors);
  f.group.position.y = h + 0.1;
  const halo = glowSprite(colors.outer, size * 4, 0.25);
  halo.position.y = h + 0.4;
  g.add(f.group, halo);
  const pool = o.pool === false ? null : lightPool(colors.outer, size * 3.2, 0.22);
  if (pool) g.add(pool);
  animated.push((time) => {
    f.flicker(time);
    const k = flicker(time, phase + 1);
    halo.material.opacity = 0.2 * k;
    if (pool) pool.material.opacity = 0.18 * k;
  });
  return g;
}

export interface LampOptions {
  color?: number;
  /** The lamp's glass, its size (default 0.4). */
  size?: number;
  /** How long a cord it hangs on (0 for a lamp that stands on whatever it's put on). */
  cord?: number;
  /** How far it swings, radians (default 0.08). */
  swing?: number;
  /** A box (a lantern), a ball (a bulb, a paper lantern) or a tube (neon, a fluorescent strip). */
  shape?: 'box' | 'ball' | 'tube';
  /** Its halo, times its size (default 9), and how much it gutters, 0 to 1 (default 0.25; 0 for a steady electric light). */
  halo?: number;
  gutter?: number;
}

/** A lamp, hanging from its cord or standing, lit, its halo guttering, swinging a little. Its top (where the cord ties on) at the origin. */
export function lamp(animated: Animated, phase = 0, o: LampOptions = {}): THREE.Group {
  const g = new THREE.Group();
  const color = o.color ?? 0xffb050;
  const size = o.size ?? 0.4;
  const cord = o.cord ?? 0.8;
  const y = -cord - size / 2;
  if (cord > 0) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, cord, 3), matte(0x1c1a1a));
    c.position.y = -cord / 2;
    g.add(c);
  }
  const geo = o.shape === 'ball' ? new THREE.SphereGeometry(size / 2, 10, 8) : o.shape === 'tube' ? new THREE.CylinderGeometry(size * 0.12, size * 0.12, size * 3, 6) : new THREE.BoxGeometry(size * 0.8, size, size * 0.8);
  const glass = new THREE.Mesh(geo, lit(color));
  if (o.shape === 'tube') glass.rotation.z = Math.PI / 2;
  glass.position.y = y;
  const halo = glowSprite(color, size * (o.halo ?? 9), 0.6);
  halo.position.y = y;
  g.add(glass, halo);
  const swing = o.swing ?? (cord > 0 ? 0.08 : 0);
  const gutter = o.gutter ?? 0.25;
  animated.push((time) => {
    if (swing) g.rotation.z = swing * Math.sin(time * 1.3 + phase);
    halo.material.opacity = 0.6 * (1 - gutter + gutter * flicker(time, phase));
  });
  return g;
}

export interface FireOptions {
  /** How big a blaze (default 2: a campfire; 8 a burning building). */
  size?: number;
  colors?: FlameColors;
  /** Its smoke going up (default true), in this colour. */
  smoke?: number | false;
  /** How many embers rise off it (default 12). */
  embers?: number;
  /** Burns down to this much on the final lap (0 to 1, default 1: no change): read each frame. */
  strength?: (time: number) => number;
}

/** A fire on the ground: a few flames, its glow and the light round it, smoke climbing and embers rising. Its foot at the origin. */
export function fire(animated: Animated, phase = 0, o: FireOptions = {}): THREE.Group {
  const g = new THREE.Group();
  const size = o.size ?? 2;
  const colors = o.colors ?? FIRE;
  const flames: ReturnType<typeof flame>[] = [];
  const n = size > 4 ? 4 : size > 2 ? 3 : 1;
  for (let k = 0; k < n; k++) {
    const f = flame(size * (n > 1 ? 0.8 : 1), phase + k * 2.1, colors);
    const a = (k / n) * Math.PI * 2;
    f.group.position.set(n > 1 ? Math.cos(a) * size * 0.3 : 0, 0.2, n > 1 ? Math.sin(a) * size * 0.3 : 0);
    g.add(f.group);
    flames.push(f);
  }
  const glow = glowSprite(colors.outer, size * 5, 0.22);
  glow.position.y = size * 0.6;
  const pool = lightPool(colors.outer, size * 4, 0.25);
  g.add(glow, pool);
  const puffs: THREE.Sprite[] = [];
  if (o.smoke !== false) {
    for (let k = 0; k < 5; k++) {
      const p = smokeSprite(o.smoke ?? 0x3a302c, size, 0.4);
      g.add(p);
      puffs.push(p);
    }
  }
  const embers: THREE.Sprite[] = [];
  for (let k = 0; k < (o.embers ?? 12); k++) {
    const e = glowSprite(colors.mid, 0.25 + size * 0.06, 0.9);
    g.add(e);
    embers.push(e);
  }
  animated.push((time) => {
    const left = o.strength ? o.strength(time) : 1;
    flames.forEach((f) => f.flicker(time, left));
    const k = flicker(time, phase);
    glow.material.opacity = 0.2 * k * left + 0.03;
    pool.material.opacity = 0.22 * k * left + 0.03;
    puffs.forEach((p, i) => {
      const v = (time * 0.18 + i / puffs.length + phase * 0.1) % 1;
      p.position.set(Math.sin(v * 3 + i) * size * 0.4, size + v * size * 5, Math.cos(v * 2 + i) * size * 0.4);
      p.scale.setScalar(size * (0.8 + v * 2.5));
      p.material.opacity = 0.45 * Math.sin(Math.PI * v);
    });
    embers.forEach((e, i) => {
      const v = (time * 0.3 + ((i * 0.618) % 1)) % 1;
      e.position.set(Math.sin(i * 2.3 + time * 0.6) * size * (0.3 + v), size * 0.5 + v * size * 4, Math.cos(i * 1.7 + time * 0.5) * size * (0.3 + v));
      e.material.opacity = 0.9 * (1 - v) * left;
    });
  });
  return g;
}
