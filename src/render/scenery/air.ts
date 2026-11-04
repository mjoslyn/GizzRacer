import * as THREE from 'three';
import { seededRandom } from '../../core/math';
import { glowMap, smokeSprite, type Animated } from './base';

/**
 * Things in the air over a set piece: motes drifting in a volume (embers
 * off a fire, ash, spores, snow, fireflies), a column of smoke, a swarm
 * circling something, a flock wheeling over it. The track-wide flock and
 * motes are a decor's `life` (trackLife.ts); these are local, one layer
 * over one place. Motes and swarms are one Points cloud each.
 */

export interface MotesOptions {
  count: number;
  /** The volume, round the origin: how far out, and how high (from y = 0). */
  radius: number;
  height: number;
  color: number;
  /** World size of each mote (default 0.4). */
  size?: number;
  /** Which way they go (default float): up and out like embers, down like ash or snow, round and round, or hanging about. */
  drift?: 'rise' | 'fall' | 'swirl' | 'float';
  /** How fast, metres a second (default 1.5). */
  speed?: number;
  /** Additive, so they glow (default true). */
  glow?: boolean;
  seed?: number;
}

/** Motes drifting through a volume round the origin. */
export function motes(o: MotesOptions, animated: Animated): THREE.Points {
  const rand = seededRandom(o.seed ?? 31);
  const n = o.count;
  const base = Array.from({ length: n }, () => ({ a: rand() * Math.PI * 2, r: Math.sqrt(rand()) * o.radius, y: rand(), ph: rand() * 10 }));
  const pos = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const glow = o.glow ?? true;
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ map: glowMap(), color: o.color, size: o.size ?? 0.4, transparent: true, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending }),
  );
  const speed = o.speed ?? 1.5;
  const drift = o.drift ?? 'float';
  const update = (time: number) => {
    base.forEach((b, i) => {
      let y = b.y * o.height;
      let a = b.a;
      let r = b.r;
      if (drift === 'rise' || drift === 'fall') {
        const v = (((b.y + (time * speed) / o.height) % 1) + 1) % 1;
        y = (drift === 'rise' ? v : 1 - v) * o.height;
        // Embers spread as they climb.
        if (drift === 'rise') r = b.r * (0.4 + 0.6 * v);
        a += Math.sin(time * 0.5 + b.ph) * 0.3;
      } else if (drift === 'swirl') {
        a += (time * speed) / Math.max(2, b.r);
        y += Math.sin(time * 0.7 + b.ph) * 0.6;
      } else {
        a += Math.sin(time * 0.2 + b.ph) * 0.2;
        y += Math.sin(time * 0.6 + b.ph) * 0.8;
      }
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(a) * r;
    });
    geo.attributes.position.needsUpdate = true;
  };
  update(0);
  geo.computeBoundingSphere();
  pts.frustumCulled = false;
  animated.push(update);
  return pts;
}

export interface SmokeOptions {
  color?: number;
  /** How many puffs (default 10), how high it climbs (default 40), how wide it starts (default 6). */
  puffs?: number;
  height?: number;
  width?: number;
  /** Seconds for a puff to climb (default 22). */
  rise?: number;
  /** The wind, metres it leans over the climb, along +x (default height / 3). */
  lean?: number;
  /** Lit from under: low puffs take this colour (a fire's red). */
  under?: number;
  opacity?: number;
}

/** A column of smoke climbing from the origin and leaning off in the wind, spreading as it goes (Billabong Valley's burning camp). */
export function smokeColumn(o: SmokeOptions, animated: Animated, phase = 0): THREE.Group {
  const g = new THREE.Group();
  const n = o.puffs ?? 10;
  const H = o.height ?? 40;
  const w = o.width ?? 6;
  const lean = o.lean ?? H / 3;
  const color = o.color ?? 0x3a2a26;
  const opacity = o.opacity ?? 0.5;
  const puffs = Array.from({ length: n }, () => {
    const p = smokeSprite(color, w, opacity);
    g.add(p);
    return p;
  });
  animated.push((time) => {
    puffs.forEach((p, k) => {
      const v = ((time / (o.rise ?? 22) + k / n + phase) % 1 + 1) % 1;
      p.position.set(Math.sin(v * 4 + k) * w * 0.4 + v * lean, w * 0.5 + v * H, Math.cos(v * 3 + k) * w * 0.4);
      p.scale.setScalar(w * (1 + v * 3));
      p.material.opacity = opacity * Math.sin(Math.PI * v);
      if (o.under !== undefined) p.material.color.setHex(v < 0.22 ? o.under : color);
    });
  });
  return g;
}

export interface SwarmOptions {
  count: number;
  /** How far out they circle, and how high round y = 0 they wander. */
  radius: number;
  height: number;
  color: number;
  size?: number;
  /** Turns a second (default 0.3) — a swarm of flies is fast, fireflies slow. */
  speed?: number;
  glow?: boolean;
  seed?: number;
}

/** A swarm circling the origin, each one on its own tilted orbit: flies over carrion, fireflies, spirits round a shrine. */
export function swarm(o: SwarmOptions, animated: Animated): THREE.Points {
  const rand = seededRandom(o.seed ?? 53);
  const n = o.count;
  const orbits = Array.from({ length: n }, () => ({ r: o.radius * (0.3 + 0.7 * rand()), a: rand() * Math.PI * 2, tilt: (rand() - 0.5) * 1.2, w: (0.6 + rand() * 0.8) * (rand() < 0.5 ? -1 : 1), y: (rand() - 0.5) * o.height }));
  const pos = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ map: glowMap(), color: o.color, size: o.size ?? 0.5, transparent: true, depthWrite: false, blending: o.glow === false ? THREE.NormalBlending : THREE.AdditiveBlending }),
  );
  pts.frustumCulled = false;
  const speed = (o.speed ?? 0.3) * Math.PI * 2;
  animated.push((time) => {
    orbits.forEach((b, i) => {
      const a = b.a + time * speed * b.w;
      pos[i * 3] = Math.cos(a) * b.r;
      pos[i * 3 + 1] = b.y + Math.sin(a) * b.r * b.tilt * 0.5;
      pos[i * 3 + 2] = Math.sin(a) * b.r;
    });
    geo.attributes.position.needsUpdate = true;
  });
  return pts;
}

export interface FlockOptions {
  count: number;
  /** How far out they wheel round the origin, and how high (default 20). */
  radius: number;
  height?: number;
  color: number;
  /** Wingspan (default 1.2). */
  size?: number;
  /** Seconds a lap (default 18). */
  period?: number;
  seed?: number;
}

/** Birds (or bats, or crows) wheeling round the origin, wings flapping: one InstancedMesh of a flat V. */
export function flock(o: FlockOptions, animated: Animated): THREE.InstancedMesh {
  const rand = seededRandom(o.seed ?? 71);
  const span = o.size ?? 1.2;
  // Two wings along +z, the left wing's triangle and the right's, their tips at y = 1: scaling y by the flap raises and drops them.
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.3, -span / 2, 1, -0.1, 0, 0, -0.3, 0, 0, 0.3, 0, 0, -0.3, span / 2, 1, -0.1]), 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: o.color, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, o.count);
  mesh.frustumCulled = false;
  const birds = Array.from({ length: o.count }, () => ({ a: rand() * Math.PI * 2, r: o.radius * (0.6 + rand() * 0.5), y: (o.height ?? 20) * (0.8 + rand() * 0.4), ph: rand() * 6, w: 0.85 + rand() * 0.3 }));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const period = o.period ?? 18;
  animated.push((time) => {
    birds.forEach((b, i) => {
      const a = b.a + ((time * Math.PI * 2) / period) * b.w;
      p.set(Math.cos(a) * b.r, b.y + Math.sin(time * 0.5 + b.ph) * 1.5, Math.sin(a) * b.r);
      // Flying round anticlockwise seen from above: heading along the tangent, banked in.
      e.set(0, Math.atan2(-Math.sin(a), Math.cos(a)), -0.25);
      q.setFromEuler(e);
      s.set(1, span * (0.1 + 0.4 * Math.sin(time * 7 + b.ph)), 1);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return mesh;
}
