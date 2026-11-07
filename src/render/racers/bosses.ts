import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RacerDef } from '../../physics/racers';
import {
  type KartModel,
  UP,
  arm,
  ball,
  box,
  brass,
  chrome,
  cone,
  cyl,
  glow,
  glowSprite,
  gloss,
  headlights,
  horn,
  matte,
  pipes,
  put,
  ring,
  rod,
  tex,
  tri,
  tube,
} from '../racerModels';
import { scaleTexture, woodTexture } from '../textures';

// ==== The story bosses ==========================================================
// One for each story suite's end (core/story.ts), each from its song's
// lyrics: bigger and stranger than the roster, and plainly that song's
// villain. They drive with the same kart physics as everyone.
//
// The detail is in the geometry (feathers, scales, fur, cracks, rivets,
// stitches), most of it small low-poly pieces that are merged into one mesh
// per material and part (`finish`), so a boss draws in a few dozen calls.
// Glows marked `pulsing` throb on their own as they're drawn.

type V = [number, number, number];
const TAU = Math.PI * 2;
const Z = new THREE.Vector3(0, 0, 1);

/** A seeded random in [0, 1), so a boss is built the same every time. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Low-poly pieces for the small details (no RES doubling: there are hundreds of them).
const sph = (r: number, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const can = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const spike = (r: number, h: number, seg = 5) => new THREE.ConeGeometry(r, h, seg);
const hoop = (r: number, t: number, arc = TAU, seg = 16) => new THREE.TorusGeometry(r, t, 5, seg, arc);
/** A unit diamond: squashed, it's a feather, a scale, a plate or a leaf. */
const OCT = new THREE.OctahedronGeometry(0.5, 0);

/** A thin low-poly tube through `pts` (veins, cracks, stitches, cords). */
function line(parent: THREE.Object3D, pts: V[], r: number, mat: THREE.Material, radial = 5): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  return put(parent, new THREE.TubeGeometry(curve, Math.max(3, (pts.length - 1) * 3), r, radial, false), mat, [0, 0, 0]);
}

/** A cone from `a` (its base) to `b` (its point): a claw, a fang, a thorn, a tuft. */
function prong(parent: THREE.Object3D, a: V, b: V, r: number, mat: THREE.Material, seg = 5): THREE.Mesh {
  const va = new THREE.Vector3(...a);
  const d = new THREE.Vector3(...b).sub(va);
  const m = put(parent, spike(r, Math.max(1e-3, d.length()), seg), mat, [0, 0, 0]);
  m.position.copy(va).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}

/**
 * A flat diamond laid from `at` along `dir`: `w` wide, `t` thick, `l` long (a
 * feather, a scale, a plate); given the surface's normal `up`, it lies flat on it.
 */
function leaf(parent: THREE.Object3D, at: V, dir: V, [w, t, l]: V, mat: THREE.Material, up?: THREE.Vector3): THREE.Mesh {
  const d = new THREE.Vector3(...dir).normalize();
  const m = put(parent, OCT, mat, [0, 0, 0], [0, 0, 0], [w, t, l]);
  if (up) {
    const y = up.clone().addScaledVector(d, -up.dot(d)).normalize();
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(y, d), y, d));
  } else m.quaternion.setFromUnitVectors(Z, d);
  m.position.set(...at).addScaledVector(d, l * 0.42);
  return m;
}

/** A point on the ellipsoid round `c` with radii `rr`: `a` round the y axis from +z, `e` up from the equator. */
function onBall(c: V, rr: V, a: number, e: number, out = 1): V {
  return [c[0] + Math.sin(a) * Math.cos(e) * rr[0] * out, c[1] + Math.sin(e) * rr[1] * out, c[2] + Math.cos(a) * Math.cos(e) * rr[2] * out];
}

/** The outward normal of that ellipsoid at `p`. */
function normalAt(c: V, rr: V, p: V): THREE.Vector3 {
  return new THREE.Vector3((p[0] - c[0]) / rr[0] ** 2, (p[1] - c[1]) / rr[1] ** 2, (p[2] - c[2]) / rr[2] ** 2).normalize();
}

/** Tufts of fur (or spines, or flames) sticking out of an ellipsoid, leaning along `lean`; `keep` picks where. */
function tufts(parent: THREE.Object3D, c: V, rr: V, n: number, rnd: () => number, mats: THREE.Material[], len: number, rad: number, lean: V = [0, 0, 0], keep?: (a: number, e: number) => boolean): void {
  for (let k = 0; k < n; k++) {
    const a = rnd() * TAU;
    const e = (rnd() * 2 - 1) * 1.25;
    if (keep && !keep(a, e)) continue;
    const p = onBall(c, rr, a, e, 0.9);
    const d = normalAt(c, rr, p).add(new THREE.Vector3(...lean)).normalize().multiplyScalar(len * (0.7 + rnd() * 0.6));
    prong(parent, p, [p[0] + d.x, p[1] + d.y, p[2] + d.z], rad * (0.8 + rnd() * 0.4), mats[k % mats.length], 4);
  }
}

/** A jagged crack across an ellipsoid's surface from (a0, e0), wandering as it goes. */
function crack(parent: THREE.Object3D, c: V, rr: V, a0: number, e0: number, steps: number, rnd: () => number, mat: THREE.Material, r = 0.02, drift: [number, number] = [0, -0.18]): void {
  const pts: V[] = [];
  let a = a0;
  let e = e0;
  for (let s = 0; s <= steps; s++) {
    pts.push(onBall(c, rr, a, e, 1.0));
    a += drift[0] + (rnd() - 0.5) * 0.45;
    e += drift[1] + (rnd() - 0.5) * 0.25;
  }
  line(parent, pts, r, mat, 3);
}

/** Rivets (or studs, or warts) at each point. */
function studs(parent: THREE.Object3D, pts: V[], r: number, mat: THREE.Material): void {
  for (const p of pts) put(parent, sph(r, 6, 4), mat, p);
}

/** A ring of `n` points round the y axis at radius `rad` and height `y`, centred at (cx, cz). */
function around(n: number, rad: number, y: number, cx = 0, cz = 0, phase = 0): V[] {
  return Array.from({ length: n }, (_, k) => {
    const a = phase + (k / n) * TAU;
    return [cx + Math.cos(a) * rad, y, cz + Math.sin(a) * rad] as V;
  });
}

interface Pulse {
  target: THREE.Color;
  base: THREE.Color;
  hz: number;
  depth: number;
  phase: number;
}

/** A material that throbs as it's drawn: its glow (emissive, or color if it has none) dips by `depth` at `hz`. */
function pulsing<M extends THREE.Material>(m: M, hz: number, depth = 0.45, phase = 0): M {
  const e = (m as unknown as { emissive?: THREE.Color }).emissive;
  const target = e && e.getHex() !== 0 ? e : (m as unknown as { color: THREE.Color }).color;
  m.userData.pulse = { target, base: target.clone(), hz, depth, phase } satisfies Pulse;
  return m;
}

interface Cycle {
  color: THREE.Color;
  hz: number;
  hue: number;
  sat: number;
  light: number;
}

/**
 * A material whose colour runs round the colour wheel as it's drawn, `hz`
 * turns a second from `hue`; once a turn it goes past the rainbow, a fourth
 * colour flickering between two opposites too fast to read as either.
 */
function cycling<M extends THREE.Material & { color: THREE.Color }>(m: M, hz: number, hue = 0, sat = 1, light = 0.55): M {
  m.userData.cycle = { color: m.color, hz, hue, sat, light } satisfies Cycle;
  return m;
}

/** A group that moves on its own as it's drawn (slides, turns, breathes): `f` poses it from the time (s). */
function morph<O extends THREE.Object3D>(o: O, f: (o: O, t: number) => void): O {
  o.userData.morph = f;
  return o;
}

/** A glow sprite that swells and shrinks on its own (not a hover pad: the kart view scales those). */
function throb(s: THREE.Sprite, hz: number, depth = 0.25, phase = 0): THREE.Sprite {
  s.userData.throb = { size: s.scale.x, hz, depth, phase };
  return s;
}

const now = () => performance.now() / 1000;

/** Copies a mesh's geometry into its parent's space, with just the attributes a merge needs. */
function prep(m: THREE.Mesh): THREE.BufferGeometry {
  const g = m.geometry.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  g.morphAttributes = {};
  g.clearGroups();
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.index) g.setIndex(Array.from({ length: n }, (_, i) => i));
  return g.applyMatrix4(m.matrix);
}

/**
 * Merges the plain meshes under each group into one mesh per material,
 * group by group, so the parts that move (heads, wings, legs, rotors)
 * still move. Mirrored meshes are left alone.
 */
function mergeStatic(root: THREE.Object3D): void {
  const byMat = new Map<THREE.Material, THREE.Mesh[]>();
  for (const c of root.children) {
    if (c instanceof THREE.Mesh && c.children.length === 0 && !Array.isArray(c.material) && !c.userData.morph) {
      c.updateMatrix();
      if (c.matrix.determinant() > 0) {
        const list = byMat.get(c.material) ?? [];
        list.push(c);
        byMat.set(c.material, list);
        continue;
      }
    }
    if (!(c instanceof THREE.Sprite)) mergeStatic(c);
  }
  for (const [mat, ms] of byMat) {
    if (ms.length < 2) continue;
    const geo = mergeGeometries(ms.map(prep));
    if (!geo) continue;
    for (const m of ms) root.remove(m);
    root.add(new THREE.Mesh(geo, mat));
  }
}

/** The last step of every boss: merge what doesn't move, and set the pulsing glows, the colour cycles and the morphs going. */
function finish(body: THREE.Group): void {
  mergeStatic(body);
  const calls = new Map<THREE.Object3D, (() => void)[]>();
  const on = (o: THREE.Object3D, f: () => void) => calls.set(o, [...(calls.get(o) ?? []), f]);
  body.traverse((o) => {
    if (o instanceof THREE.Mesh && !Array.isArray(o.material)) {
      const p = o.material.userData.pulse as Pulse | undefined;
      if (p) on(o, () => void p.target.copy(p.base).multiplyScalar(1 - p.depth * (0.5 + 0.5 * Math.sin(now() * TAU * p.hz + p.phase))));
      const c = o.material.userData.cycle as Cycle | undefined;
      if (c) {
        on(o, () => {
          const turn = (c.hue + now() * c.hz) % 1;
          // Past violet, the fourth colour: two opposites swapped every frame-ish, brighter.
          const past = turn > 0.86 && turn < 0.96;
          c.color.setHSL(past ? (turn * 3 + (Math.floor(now() * 30) % 2) * 0.5) % 1 : turn, c.sat, past ? Math.min(0.85, c.light + 0.2) : c.light);
        });
      }
    } else if (o instanceof THREE.Sprite && o.userData.throb) {
      const t = o.userData.throb as { size: number; hz: number; depth: number; phase: number };
      on(o, () => void o.scale.setScalar(t.size * (1 + t.depth * Math.sin(now() * TAU * t.hz + t.phase))));
    }
    // A morphing group is posed by the first thing in it that's drawn.
    const f = o.userData.morph as ((o: THREE.Object3D, t: number) => void) | undefined;
    if (f) {
      f(o, 0);
      const driver = o.children.find((c) => c instanceof THREE.Mesh || c instanceof THREE.Sprite);
      if (driver) on(driver, () => f(o, now()));
    }
  });
  for (const [o, fs] of calls) o.onBeforeRender = fs.length === 1 ? fs[0] : () => fs.forEach((f) => f());
}

// ---- The Voice in Your Mind: the Mind Fuzz Suite's boss -------------------------
// "When I'm in your mind, then I'm in your mind", "dig a little deeper",
// "everybody's sucking on fluoride": a great brain floating in fluoride under
// a glass bell, veins throbbing, folded all over, one huge heavy-lidded
// bloodshot eye with a spiral for an iris and a grinning mouth under it, three
// more eyes on stalks peering round, patched by cables into a fuzz pedal that
// rides a spinning hypnotic saw of a spiral over the road, a cloud of fuzz
// round it all.

export function mindVoice(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const rnd = rng(11);
  const pink = matte(0xf08ab8, { shininess: 40, specular: 0x553344, emissive: 0x2a0818 });
  const fold = matte(0xc85a90, { shininess: 30, emissive: 0x1a0410 });
  const lid = matte(0xd8709e, { shininess: 25 });
  const vein = pulsing(matte(0xb0103a, { emissive: 0x7a0a28 }), 1.2, 0.75);
  const pedal = gloss(r.color);
  const metal = chrome();
  const fuzz = pulsing(glow(r.accent), 0.8, 0.45);
  const fuzz2 = pulsing(glow(r.color), 0.8, 0.45, Math.PI);
  const dark = matte(0x14081c);
  const white = matte(0xf8f4e8);
  const black = matte(0x050505);
  const shine = glow(0xffffff);
  const tooth = matte(0xfff4d8, { shininess: 60 });
  const gum = matte(0x4a0618);
  const led = pulsing(glow(0xff3a3a), 2.2, 0.85);
  const glass = new THREE.MeshPhongMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.2, shininess: 140, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide });
  const fluoride = new THREE.MeshPhongMaterial({ color: 0x9adfff, emissive: 0x0a3a5a, transparent: true, opacity: 0.45, shininess: 100, depthWrite: false });

  // The spiral: a dark disc, op-art rings and two glowing arms wound out from the middle, a saw's teeth round its rim, turning flat and fast.
  const rotors: THREE.Object3D[] = [];
  const disc = new THREE.Group();
  disc.position.y = 0.32;
  put(disc, cyl(1.45, 1.35, 0.1, 40), dark, [0, 0, 0]);
  for (const [phase, mat] of [[0, fuzz], [Math.PI, fuzz2]] as const) {
    const pts: V[] = [];
    for (let k = 0; k <= 40; k++) {
      const a = phase + k * 0.32;
      const rad = 0.08 + k * 0.033;
      pts.push([Math.cos(a) * rad, 0.06, Math.sin(a) * rad]);
    }
    line(disc, pts, 0.035, mat, 6);
  }
  for (let k = 1; k <= 4; k++) put(disc, hoop(0.3 * k, 0.012, TAU, 40), white, [0, 0.055, 0], [Math.PI / 2, 0, 0]);
  put(disc, ring(1.42, 0.045), fuzz, [0, 0.03, 0], [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * TAU;
    const b = a + 0.16;
    prong(disc, [Math.cos(a) * 1.38, 0, Math.sin(a) * 1.38], [Math.cos(b) * 1.62, 0, Math.sin(b) * 1.62], 0.07, metal, 4);
  }
  studs(disc, around(14, 1.2, 0.06), 0.035, metal);
  body.add(disc);
  rotors.push(disc);
  const pads = [glowSprite(body, [0, 0.15, 0], 2.6, r.accent), glowSprite(body, [0, 0.2, 0.9], 1.2, r.color), glowSprite(body, [0, 0.2, -0.9], 1.2, r.color)];

  // The pedal: a big stompbox, three knobs with their pointers, screws, rubber feet, a fuzz bolt on its face, a footswitch and its jewel light.
  put(body, box(1.3, 0.42, 1.25), pedal, [0, 0.6, -0.1]);
  put(body, box(1.32, 0.04, 1.27), metal, [0, 0.82, -0.1]);
  studs(body, [[-0.6, 0.845, 0.48], [0.6, 0.845, 0.48], [-0.6, 0.845, -0.68], [0.6, 0.845, -0.68]], 0.03, metal);
  for (const [x, z] of [[-0.55, 0.42], [0.55, 0.42], [-0.55, -0.62], [0.55, -0.62]]) put(body, can(0.07, 0.07, 0.05), dark, [x, 0.37, z]);
  for (const [k, x] of [-0.38, 0, 0.38].entries()) {
    put(body, cyl(0.1, 0.11, 0.1, 14), dark, [x, 0.88, 0.32]);
    put(body, hoop(0.11, 0.012), metal, [x, 0.84, 0.32], [Math.PI / 2, 0, 0]);
    put(body, box(0.02, 0.02, 0.09), shine, [x, 0.94, 0.33], [0, (k - 1) * 0.9, 0]);
    for (let t = 0; t < 5; t++) put(body, box(0.012, 0.01, 0.04), white, [x + Math.cos(Math.PI * (0.1 + t * 0.2)) * 0.15, 0.845, 0.32 - Math.sin(Math.PI * (0.1 + t * 0.2)) * 0.15], [0, Math.PI * (0.1 + t * 0.2) - Math.PI / 2, 0]);
  }
  const bolt = new THREE.Shape();
  bolt.moveTo(-0.3, 0.12);
  bolt.lineTo(0.05, 0.12);
  bolt.lineTo(-0.06, 0.02);
  bolt.lineTo(0.3, 0.02);
  bolt.lineTo(-0.1, -0.13);
  bolt.lineTo(0.0, -0.04);
  bolt.lineTo(-0.3, -0.04);
  bolt.closePath();
  put(body, new THREE.ShapeGeometry(bolt), fuzz, [0, 0.6, 0.53]);
  put(body, cyl(0.09, 0.09, 0.08, 14), metal, [0.4, 0.86, -0.5]);
  put(body, can(0.11, 0.11, 0.03, 6), metal, [0.4, 0.835, -0.5]);
  put(body, sph(0.06, 10, 8), led, [-0.4, 0.88, -0.5]);
  put(body, hoop(0.065, 0.012), metal, [-0.4, 0.85, -0.5], [Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) {
    put(body, cyl(0.07, 0.07, 0.12, 12), metal, [side * 0.7, 0.62, 0.1], [0, 0, Math.PI / 2]);
    put(body, can(0.05, 0.06, 0.16), dark, [side * 0.8, 0.62, 0.1], [0, 0, Math.PI / 2]);
  }

  // The bell jar on the pedal, bolted down, fluoride in the bottom, bubbles rising.
  put(body, cyl(0.78, 0.82, 0.08, 32), metal, [0, 0.86, -0.1]);
  studs(body, around(12, 0.8, 0.91, 0, -0.1), 0.03, metal);
  put(body, cyl(0.74, 0.74, 1.0, 32), glass, [0, 1.38, -0.1]);
  put(body, new THREE.SphereGeometry(0.74, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass, [0, 1.88, -0.1]);
  put(body, can(0.71, 0.71, 0.32, 24), fluoride, [0, 1.06, -0.1]);
  for (let k = 0; k < 10; k++) put(body, sph(0.02 + (k % 3) * 0.012, 6, 4), shine, [Math.sin(k * 2.4) * 0.5, 0.95 + ((k * 0.37) % 1) * 0.9, -0.1 + Math.cos(k * 2.4) * 0.5]);
  put(body, hoop(0.75, 0.02, TAU, 32), metal, [0, 1.88, -0.1], [Math.PI / 2, 0, 0]);
  put(body, sph(0.07, 10, 8), metal, [0, 2.64, -0.1]);
  put(body, hoop(0.1, 0.02), metal, [0, 2.72, -0.1]);

  // The brain: the head, which leans and looks.
  const head = new THREE.Group();
  head.position.set(0, 1.5, -0.1);
  // Two hemispheres, the cleft between, folded all over in squiggling gyri, veins throbbing across them.
  for (const side of [-1, 1]) {
    const c: V = [side * 0.2, 0.08, -0.04];
    const rr: V = [0.342, 0.324, 0.432];
    put(head, sph(0.36, 20, 14), pink, c, [0, 0, 0], [0.95, 0.9, 1.2]);
    for (let k = 0; k < 13; k++) {
      let a = side * (0.35 + rnd() * 2.4);
      let e = -0.5 + rnd() * 1.7;
      const pts: V[] = [];
      for (let s = 0; s < 6; s++) {
        pts.push(onBall(c, rr, a, e, 1.0));
        a += (rnd() - 0.5) * 0.7;
        e += (rnd() - 0.5) * 0.5;
        if (Math.sign(Math.sin(a)) !== side) a = side * 0.4;
      }
      line(head, pts, 0.032, fold, 4);
    }
    for (let k = 0; k < 4; k++) crack(head, c, rr, side * (0.6 + k * 0.55), 0.9 - k * 0.2, 5, rnd, vein, 0.012, [0, -0.25]);
  }
  put(head, box(0.03, 0.5, 0.8), dark, [0, 0.18, -0.04]);
  put(head, sph(0.2, 12, 8), fold, [0, -0.1, -0.42], [0, 0, 0], [1.4, 0.75, 0.9]);
  for (let k = 0; k < 4; k++) put(head, hoop(0.2, 0.012, Math.PI, 12), pink, [0, -0.04 - k * 0.05, -0.42], [0, Math.PI / 2, 0], [0.95 - k * 0.1, 1, 1.4 - k * 0.15]);
  put(head, cyl(0.1, 0.06, 0.45, 12), pink, [0, -0.32, -0.08]);
  // Nerves trailing off the stem into the fluoride, sucking it up.
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    line(head, [[0, -0.5, -0.08], [Math.cos(a) * 0.15, -0.6, -0.08 + Math.sin(a) * 0.15], [Math.cos(a) * 0.3, -0.42, -0.08 + Math.sin(a) * 0.3]], 0.012, vein, 3);
  }
  // Electrodes where the cables plug in.
  for (const side of [-1, 1]) {
    put(head, can(0.06, 0.06, 0.04, 10), metal, [side * 0.48, 0.24, -0.15], [0, 0, side * 1.1]);
    put(head, sph(0.03, 6, 4), led, [side * 0.51, 0.26, -0.15]);
  }
  // The eye: one great bloodshot eye on the front, a spiral of an iris, the lids heavy over it and the brow knotted in a scowl.
  const eyeC: V = [0, 0.0, 0.32];
  put(head, sph(0.24, 20, 16), white, eyeC);
  put(head, sph(0.16, 18, 12), fuzz, [0, 0.0, 0.5], [0, 0, 0], [1, 1, 0.35]);
  const swirl: V[] = [];
  for (let k = 0; k <= 22; k++) swirl.push([Math.cos(k * 0.6) * (0.015 + k * 0.006), Math.sin(k * 0.6) * (0.015 + k * 0.006), 0.556]);
  line(head, swirl, 0.01, black, 3);
  put(head, ball(0.05, 10, 8), black, [0, 0.0, 0.56], [0, 0, 0], [1, 1, 0.3]);
  put(head, sph(0.025, 6, 4), shine, [0.05, 0.05, 0.575]);
  for (let k = 0; k < 9; k++) {
    const psi = (k / 9) * TAU + 0.3;
    const pts: V[] = [];
    for (let s = 0; s < 4; s++) {
      const phi = 1.25 - s * 0.17;
      const q = psi + (rnd() - 0.5) * 0.3;
      pts.push([eyeC[0] + Math.sin(phi) * Math.cos(q) * 0.243, eyeC[1] + Math.sin(phi) * Math.sin(q) * 0.243, eyeC[2] + Math.cos(phi) * 0.243]);
    }
    line(head, pts, 0.007, vein, 3);
  }
  put(head, new THREE.SphereGeometry(0.256, 20, 8, 0, TAU, 0, 0.92), lid, eyeC, [0.48, 0, 0]);
  put(head, new THREE.SphereGeometry(0.252, 20, 6, 0, TAU, Math.PI - 0.85, 0.85), lid, eyeC, [-0.32, 0, 0]);
  for (const side of [-1, 1]) rod(head, [side * 0.3, 0.27, 0.34], [side * 0.02, 0.17, 0.5], 0.055, fold);
  put(head, ball(0.26, 16, 10), pink, [0, 0.2, 0.25], [0.6, 0, 0], [1.05, 0.3, 0.7]);
  // The mouth under it: a fleshy grin, wide open, teeth in it.
  put(head, sph(0.19, 14, 10), pink, [0, -0.25, 0.27], [0, 0, 0], [1.3, 0.6, 0.75]);
  put(head, new THREE.CircleGeometry(0.15, 16, Math.PI, Math.PI), gum, [0, -0.22, 0.41], [0, 0, 0], [1.1, 0.75, 1]);
  put(head, hoop(0.16, 0.022, Math.PI, 14), fold, [0, -0.22, 0.405], [0, 0, Math.PI], [1.1, 0.78, 1]);
  put(head, box(0.36, 0.025, 0.04), fold, [0, -0.215, 0.405]);
  for (let k = 0; k < 8; k++) {
    const x = -0.14 + k * 0.04;
    put(head, box(0.028, 0.035, 0.015), tooth, [x, -0.24, 0.415]);
  }
  for (const x of [-0.11, 0.11]) prong(head, [x, -0.31, 0.405], [x, -0.26, 0.415], 0.014, tooth, 4);
  // Three more eyes on stalks, peering round on their own.
  const sweepers: THREE.Object3D[] = [];
  for (const [k, [x, y, z, s]] of ([[-0.42, 0.35, 0.05, 0.08], [0.45, 0.3, -0.1, 0.07], [0.05, 0.5, -0.2, 0.06]] as const).entries()) {
    const stalk = new THREE.Group();
    stalk.position.set(x * 0.4, 0.2, z);
    stalk.userData.phase = k * 2.1;
    const tip: V = [x * 0.6, y - 0.2, 0.1];
    line(stalk, [[0, 0, 0], [x * 0.25, (y - 0.2) * 0.6, 0.02], tip], 0.025, pink, 5);
    put(stalk, sph(s, 12, 10), white, tip);
    put(stalk, sph(s * 0.55, 10, 8), fuzz, [tip[0], tip[1], tip[2] + s * 0.6]);
    put(stalk, sph(s * 0.25, 6, 4), black, [tip[0], tip[1], tip[2] + s * 0.95]);
    put(stalk, new THREE.SphereGeometry(s * 1.08, 12, 5, 0, TAU, 0, 1.0), lid, tip, [0.5, 0, 0]);
    head.add(stalk);
    sweepers.push(stalk);
  }
  body.add(head);
  throb(glowSprite(body, [0, 1.5, 0.3], 1.0, r.accent), 0.8, 0.3);
  // Patch cables from the pedal's jacks up into the electrodes, sagging, signals pulsing up them.
  for (const side of [-1, 1]) {
    line(body, [[side * 0.86, 0.62, 0.1], [side * 1.05, 0.9, 0.2], [side * 0.98, 1.5, 0.0], [side * 0.75, 1.9, -0.2], [side * 0.55, 1.78, -0.25]], 0.035, side < 0 ? fuzz : fuzz2, 6);
  }
  // The fuzz: soft lumpy clouds of it hanging in the air round the jar.
  const fog = new THREE.MeshPhongMaterial({ color: r.color, emissive: 0x401040, transparent: true, opacity: 0.32, depthWrite: false });
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU;
    const p: V = [Math.cos(a) * 1.05, 1.2 + Math.sin(k * 1.7) * 0.5, Math.sin(a) * 1.05 - 0.1];
    for (let j = 0; j < 3; j++) put(body, sph(0.13 + (k % 3) * 0.04 + j * 0.03, 8, 6), fog, [p[0] + Math.cos(j * 2.1) * 0.12, p[1] + Math.sin(j * 1.3) * 0.08, p[2] + Math.sin(j * 2.1) * 0.12]);
  }

  finish(body);
  return {
    body,
    wheels: [],
    exhausts: [new THREE.Vector3(-0.4, 0.6, -0.8), new THREE.Vector3(0.4, 0.6, -0.8)],
    rearTrack: 0.6,
    rearZ: -1.2,
    spinners: [],
    rotors,
    shadow: [3.2, 3.2],
    hover: { bob: 0.12, pads },
    head,
    sweepers,
  };
}

// ---- The People-Vulture: Nonagon Infinity's boss ---------------------------------
// "People-vultures waiting by my stage", "deadly ulcers feeding on my skin",
// "tainted voodoo, headless guru", "what else have I got left to spew down?":
// a great black vulture, feathered row on row, with a man's bald, scowling,
// liver-spotted head on its long bare warty neck, bloodshot eyes glowing,
// spew dribbling off its lip, a white ruff, a voodoo string of bones and a
// skull round its neck, flying low over the road with no kart under it, its
// wings beating in two joints, the fingered primaries spread, talons hanging.

export function peopleVulture(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const feather = matte(r.color, { shininess: 25, specular: 0x332a3a });
  const sheen = gloss(0x2a1a3a, { shininess: 70, specular: 0x8a6aaa, reflectivity: 0.15 });
  const tip = matte(0x120e16);
  const pale = matte(0xb8b0b8, { shininess: 10 });
  const ruff = matte(0xf0ead8, { shininess: 5 });
  const skin = matte(0xe0a088, { shininess: 20 });
  const flush = matte(r.accent);
  const wart = matte(0xc8402a, { shininess: 30 });
  const spot = matte(0x9a5a3a);
  const talon = matte(0xc8b880);
  const claw = matte(0x1a1410, { shininess: 60, specular: 0x666666 });
  const bone = matte(0xeee4c8);
  const black = matte(0x050505);
  const white = matte(0xf8f0dc);
  const iris = pulsing(glow(0xff2a1a), 1.4, 0.55);
  const spew = pulsing(new THREE.MeshPhongMaterial({ color: 0xa8d040, emissive: 0x3a5a08, transparent: true, opacity: 0.85, shininess: 90 }), 0.9, 0.5);
  const cord = matte(0x3a2a1a);
  const socket = matte(0x5a2a2a);
  const throat = matte(0x2a0808);
  const yellowTooth = matte(0xd8c890);
  const nostril = matte(0x4a1a1a);

  // It flies: the bird rides low over the road, its talons hanging clear of it.
  const bird = new THREE.Group();
  bird.position.set(0, 1.4, -0.1);
  body.add(bird);
  const bc: V = [0, 0.12, 0];
  const br: V = [0.55, 0.52, 0.8];
  put(bird, sph(0.55, 20, 14), feather, bc, [0.12, 0, 0], [1.0, 0.95, 1.45]);
  // Feathers laid row on row down the back and flanks, pointing back.
  for (let row = 0; row < 7; row++) {
    const z = 0.5 - row * 0.2;
    for (let col = -3; col <= 3; col++) {
      const x = col * 0.14;
      const q = 1 - (x / br[0]) ** 2 - (z / br[2]) ** 2;
      if (q <= 0.05) continue;
      const y = bc[1] + br[1] * Math.sqrt(q);
      leaf(bird, [x, y, z], [x * 0.4, -0.3, -1], [0.2, 0.04, 0.34], row % 3 === 2 ? sheen : (row + col) % 2 ? feather : tip);
    }
  }
  for (const side of [-1, 1]) for (let k = 0; k < 6; k++) leaf(bird, [side * 0.52, 0.0 - (k % 2) * 0.15, 0.35 - k * 0.2], [side * 0.3, -0.2, -1], [0.18, 0.04, 0.32], k % 2 ? tip : sheen);
  // Shaggy breast feathers hanging under.
  tufts(bird, [0, -0.05, 0.25], [0.45, 0.4, 0.55], 18, rng(3), [feather, tip], 0.22, 0.06, [0, -0.9, 0.1], (_a, e) => e < -0.1);
  // The tail: a fan of long feathers spread out flat behind, pale shafts down them.
  for (let k = -4; k <= 4; k++) {
    const d: V = [Math.sin(k * 0.13), 0.1, -1];
    leaf(bird, [k * 0.05, 0.02, -0.65], d, [0.17, 0.035, 0.85], k % 2 ? tip : feather);
    leaf(bird, [k * 0.05, 0.045, -0.65], d, [0.02, 0.03, 0.8], pale);
  }
  // The ruff: a fluffy white collar where the bare neck comes out, tufts bristling.
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    put(bird, sph(0.14, 8, 6), ruff, [Math.cos(a) * 0.28, 0.5 + Math.sin(a) * 0.12, 0.5 + Math.sin(a * 2) * 0.03]);
  }
  tufts(bird, [0, 0.5, 0.5], [0.36, 0.22, 0.2], 22, rng(5), [ruff], 0.16, 0.05);
  // The legs: bare and scaled, ringed with scutes, the toes knuckled, the talons hooked and black.
  for (const side of [-1, 1]) {
    const hip: V = [side * 0.28, -0.3, 0.0];
    const ankle: V = [side * 0.36, -0.78, -0.38];
    put(bird, sph(0.13, 8, 6), feather, [side * 0.28, -0.32, 0.0], [0, 0, 0], [1, 1.3, 1]);
    rod(bird, hip, ankle, 0.075, talon, 0.05);
    for (let s = 1; s < 5; s++) {
      const t = s / 5;
      put(bird, hoop(0.07 - t * 0.02, 0.012, TAU, 10), talon, [hip[0] + (ankle[0] - hip[0]) * t, hip[1] + (ankle[1] - hip[1]) * t, hip[2] + (ankle[2] - hip[2]) * t], [0.9, 0, 0]);
    }
    for (let t = -1; t <= 1; t++) {
      const knuckle: V = [ankle[0] + t * 0.06, ankle[1] - 0.09, ankle[2] + 0.08];
      const toe: V = [ankle[0] + t * 0.11, ankle[1] - 0.16, ankle[2] + 0.17];
      rod(bird, ankle, knuckle, 0.03, talon);
      put(bird, sph(0.032, 6, 4), talon, knuckle);
      rod(bird, knuckle, toe, 0.026, talon);
      prong(bird, toe, [toe[0], toe[1] - 0.1, toe[2] + 0.04], 0.025, claw, 5);
    }
    const back: V = [ankle[0], ankle[1] - 0.12, ankle[2] - 0.14];
    rod(bird, ankle, back, 0.028, talon);
    prong(bird, back, [back[0], back[1] - 0.09, back[2] - 0.02], 0.022, claw, 5);
  }

  // The wings: two joints that each beat, the inner arm with its coverts and secondaries, the hand with long fingered primaries.
  const flappers: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.4, 0.3, 0.1);
    wing.userData.side = side;
    put(wing, sph(0.3, 12, 8), feather, [side * 0.45, 0.05, -0.05], [0, 0, side * 0.2], [1.8, 0.35, 1.0]);
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 6; k++) {
        leaf(wing, [side * (0.12 + k * 0.16), 0.12 - row * 0.02, 0.12 - row * 0.18], [side * 0.15, -0.05, -1], [0.2, 0.035, 0.3 + row * 0.08], (k + row) % 3 === 0 ? sheen : row === 2 ? tip : feather);
      }
    }
    for (let k = 0; k < 7; k++) leaf(wing, [side * (0.1 + k * 0.15), 0.02, -0.3], [side * 0.08, -0.05, -1], [0.17, 0.03, 0.62], k % 2 ? tip : feather);
    const hand = new THREE.Group();
    hand.position.set(side * 1.05, 0.1, -0.08);
    hand.userData.side = side;
    put(hand, sph(0.28, 12, 8), feather, [side * 0.15, 0.02, -0.08], [0, 0, side * 0.1], [1.4, 0.28, 1.0]);
    for (let k = 0; k < 5; k++) leaf(hand, [side * (0.02 + k * 0.08), 0.06, 0.08 - k * 0.02], [side * 0.6, -0.05, -1], [0.16, 0.03, 0.32], k % 2 ? sheen : feather);
    for (let k = 0; k < 7; k++) {
      const a = -0.3 + k * 0.2;
      const d: V = [side * Math.cos(a), 0.03 - k * 0.01, -Math.sin(a) - 0.15];
      const at: V = [side * 0.2, 0.0, -0.05 - k * 0.05];
      leaf(hand, at, d, [0.15, 0.03, 0.82 - k * 0.04], k % 2 ? tip : feather);
      leaf(hand, [at[0], at[1] + 0.022, at[2]], d, [0.022, 0.025, 0.78 - k * 0.04], pale);
    }
    wing.add(hand);
    bird.add(wing);
    flappers.push(wing, hand);
  }

  // The neck: long, bare and wrinkled, red warts up it, craning up and forward, the head held high enough to show over the back.
  const neckPts: V[] = [[0, 0.45, 0.45], [0, 0.78, 0.62], [0, 1.0, 0.85]];
  tube(bird, neckPts, 0.1, skin);
  for (let k = 0; k < 4; k++) put(bird, ring(0.1, 0.012), flush, [0, 0.58 + k * 0.1, 0.52 + k * 0.08], [Math.PI / 2 - 0.6, 0, 0]);
  const wr = rng(9);
  for (let k = 0; k < 12; k++) {
    const t = 0.15 + wr() * 0.8;
    const a = wr() * TAU;
    put(bird, sph(0.022 + wr() * 0.02, 6, 4), wart, [Math.cos(a) * 0.1, 0.45 + t * 0.55, 0.45 + t * 0.4 + Math.sin(a) * 0.1]);
  }
  // The voodoo string: bones and teeth on a cord slung round the neck, a little skull hanging off it.
  const beads: V[] = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    beads.push([(t - 0.5) * 0.6, 0.38 - Math.sin(t * Math.PI) * 0.3, 0.62 + Math.sin(t * Math.PI) * 0.12]);
  }
  line(bird, beads, 0.008, cord, 3);
  for (let k = 1; k < 8; k++) {
    if (k === 4) continue;
    const b = beads[k];
    if (k % 2) put(bird, can(0.018, 0.018, 0.08, 5), bone, b, [0, 0, Math.PI / 2 + (k - 4) * 0.2]);
    else prong(bird, b, [b[0], b[1] - 0.07, b[2] + 0.01], 0.014, bone, 4);
  }
  const sk: V = [beads[4][0], beads[4][1] - 0.08, beads[4][2] + 0.02];
  put(bird, sph(0.07, 10, 8), bone, sk, [0, 0, 0], [1, 1.05, 0.95]);
  put(bird, box(0.08, 0.04, 0.06), bone, [sk[0], sk[1] - 0.06, sk[2] + 0.01]);
  for (const s of [-1, 1]) put(bird, sph(0.02, 6, 4), black, [sk[0] + s * 0.026, sk[1] + 0.01, sk[2] + 0.06]);
  put(bird, sph(0.01, 4, 3), black, [sk[0], sk[1] - 0.02, sk[2] + 0.067]);

  // The head: a man's, bald, liver-spotted and wrinkled, heavy-browed and scowling, a great hooked nose for a beak, spew on his lip.
  const head = new THREE.Group();
  head.position.set(0, 2.52, 0.88);
  head.scale.setScalar(1.25);
  put(head, sph(0.24, 20, 16), skin, [0, 0.05, 0], [0, 0, 0], [0.92, 1.05, 1.0]);
  for (let k = 0; k < 3; k++) put(head, ring(0.12, 0.008, Math.PI * 0.8), flush, [0, 0.2 + k * 0.03, 0.17 - k * 0.02], [0.3, 0, Math.PI * 0.6]);
  for (const side of [-1, 1]) {
    put(head, sph(0.065, 10, 8), skin, [side * 0.22, 0.03, -0.01], [0, 0, 0], [0.45, 1.1, 0.8]);
    put(head, sph(0.035, 6, 4), flush, [side * 0.235, 0.03, 0.0], [0, 0, 0], [0.4, 1, 0.7]);
  }
  // Sunken, bloodshot eyes under a knotted brow, glowing.
  for (const side of [-1, 1]) {
    const x = side * 0.075;
    put(head, sph(0.055, 10, 8), socket, [x, 0.085, 0.17], [0, 0, 0], [1.2, 0.8, 0.6]);
    put(head, sph(0.04, 10, 8), white, [x, 0.085, 0.185]);
    put(head, sph(0.026, 8, 6), iris, [x, 0.085, 0.215], [0, 0, 0], [1, 1, 0.5]);
    put(head, sph(0.012, 6, 4), black, [x, 0.085, 0.226]);
    put(head, new THREE.SphereGeometry(0.044, 10, 4, 0, TAU, 0, 1.05), skin, [x, 0.085, 0.185], [0.55, 0, side * -0.25]);
    rod(head, [side * 0.16, 0.15, 0.18], [side * 0.02, 0.12, 0.235], 0.022, skin);
    for (let k = 0; k < 3; k++) put(head, hoop(0.025, 0.004, Math.PI * 0.6, 6), flush, [side * 0.14, 0.07 - k * 0.02, 0.17], [0, side * 0.9, side * -0.4 - k * 0.2]);
  }
  put(head, box(0.02, 0.05, 0.02), flush, [0, 0.16, 0.23], [0.3, 0, 0]);
  // The nose: long and hooked, beak-like.
  tube(head, [[0, 0.1, 0.22], [0, 0.03, 0.34], [0, -0.06, 0.38]], 0.045, skin);
  put(head, cone(0.04, 0.09, 8), skin, [0, -0.1, 0.36], [Math.PI - 0.6, 0, 0]);
  for (const side of [-1, 1]) put(head, sph(0.02, 6, 4), nostril, [side * 0.03, -0.06, 0.33]);
  // The mouth: a sneer dropped open, a few yellow teeth, the lower lip hanging, spew dribbling off it.
  put(head, sph(0.075, 10, 8), throat, [0, -0.12, 0.2], [0, 0, 0], [1.1, 0.55, 0.5]);
  for (let k = 0; k < 4; k++) put(head, box(0.018, 0.022, 0.01), yellowTooth, [-0.033 + k * 0.022 + (k > 1 ? 0.01 : 0), -0.1, 0.235]);
  put(head, ring(0.065, 0.014, Math.PI), skin, [0, -0.1, 0.215], [0, 0, 0.12]);
  put(head, sph(0.05, 8, 6), skin, [0, -0.155, 0.215], [0.3, 0, 0], [1.2, 0.45, 0.6]);
  line(head, [[0.015, -0.16, 0.24], [0.02, -0.24, 0.25], [0.012, -0.34, 0.22]], 0.012, spew, 5);
  put(head, sph(0.022, 8, 6), spew, [0.012, -0.36, 0.22], [0, 0, 0], [1, 1.4, 1]);
  put(head, sph(0.1, 10, 8), skin, [0, -0.17, 0.12], [0, 0, 0], [1.2, 0.6, 0.8]);
  // A wattle of red warts under the jowls, liver spots on the crown, grey wisps either side.
  for (let k = 0; k < 7; k++) put(head, sph(0.018 + (k % 3) * 0.008, 6, 4), wart, [Math.sin(k * 1.9) * 0.08, -0.22 - (k % 3) * 0.02, 0.08 + Math.cos(k * 1.9) * 0.04]);
  const sr = rng(21);
  for (let k = 0; k < 7; k++) {
    const p = onBall([0, 0.05, 0], [0.221, 0.252, 0.24], sr() * TAU, 0.5 + sr() * 0.9, 1.0);
    put(head, sph(0.018 + sr() * 0.012, 6, 4), spot, p, [0, 0, 0], [1, 0.35, 1]);
  }
  for (const side of [-1, 1]) for (let k = 0; k < 3; k++) prong(head, [side * 0.2, 0.13 - k * 0.04, -0.06], [side * 0.27, 0.16 - k * 0.05, -0.14], 0.02, ruff, 4);
  for (let k = 0; k < 2; k++) put(head, ring(0.14 - k * 0.03, 0.008, Math.PI * 0.7), flush, [0, 0.02 + k * 0.06, -0.19], [0, Math.PI, Math.PI * 0.65]);
  body.add(head);

  finish(body);
  return {
    body,
    wheels: [],
    // Boost fire out under the tail.
    exhausts: [new THREE.Vector3(-0.2, 1.4, -1.35), new THREE.Vector3(0.2, 1.4, -1.35)],
    rearTrack: 0.6,
    rearZ: -0.8,
    spinners: [],
    // The spread wings' shadow on the road under it.
    shadow: [4.4, 2.6],
    // No pads: it holds itself up, the body rising on each downstroke.
    hover: { bob: 0.1, pads: [], beat: true },
    head,
    flappers,
  };
}

// ---- The Altered Beast: the Tale of the Altered Beast's boss ---------------------
// "Half made of man, half of bear", "altered face and altered skin", "my left
// hand is a knife and my right hand is a fork", "nine pearl fangs": a hulking
// shaggy thing on all fours, stitched together down the middle, a bear's ear
// and a wolf's, a horn, two glowing eyes and a third, more blinking on its
// hump, a snarl of nine white fangs, plates of scaled hide, broken shackles,
// a carving knife for its left hand and a fork for its right, trampling the
// earth as it comes.

export function alteredBeast(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const rnd = rng(31);
  const fur = matte(r.color, { shininess: 6 });
  const furDark = matte(0x3a1a4a, { shininess: 6 });
  const furPale = matte(0x8a6a9a, { shininess: 6 });
  const hide = matte(0xffffff, { map: tex('beast-scales', () => scaleTexture('#5a8a2a', '#c8ff3a')), shininess: 40 });
  const scale = gloss(0x4a7a22, { shininess: 80, specular: 0xc8ff3a, reflectivity: 0.1 });
  const skin = matte(0xc89a8a);
  const stitch = matte(0x1a0a10);
  const bone = matte(0xf4eedc);
  const gum = matte(0x8a1a2a, { shininess: 60 });
  const mouth = matte(0x2a0a1a);
  const steel = chrome();
  const iron = matte(0x3a3a40, { shininess: 50, specular: 0x666666 });
  const wood = matte(0x5a3218, { shininess: 30 });
  const blood = matte(0x8a0a12, { shininess: 90, specular: 0xff6a6a });
  const eye = pulsing(glow(r.accent), 1.1, 0.5);
  const black = matte(0x050505, { shininess: 90 });
  const slime = new THREE.MeshPhongMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.55, shininess: 120, depthWrite: false });

  // It runs: high in the shoulder, low at the haunch, the whole bulk swaying.
  const beast = new THREE.Group();
  beast.position.y = 1.05;
  body.add(beast);
  const fore: [V, V] = [[0, 0.2, 0.3], [0.9, 0.75, 0.83]];
  const hind: [V, V] = [[0, 0.0, -0.55], [0.66, 0.54, 0.69]];
  put(beast, sph(0.75, 22, 16), fur, fore[0], [0, 0, 0], [1.2, 1.0, 1.1]);
  put(beast, sph(0.6, 20, 14), fur, hind[0], [0, 0, 0], [1.1, 0.9, 1.15]);
  put(beast, sph(0.45, 16, 12), furDark, [0, 0.65, 0.15], [0, 0, 0], [1.2, 0.7, 1.0]);
  // Shag all over: tufts on the shoulders and haunches, leaning back, darker down the spine.
  tufts(beast, ...fore, 70, rnd, [fur, furDark, fur, furPale], 0.3, 0.07, [0, 0, -0.6], (a) => Math.cos(a) < 0.75);
  tufts(beast, ...hind, 45, rnd, [fur, furDark, fur], 0.28, 0.07, [0, -0.2, -0.6]);
  // Altered skin: plates of scaled hide over the fur, each scale laid on.
  for (const [a0, e0, n] of [[1.55, 0.25, 6], [-2.3, 0.05, 5], [-1.2, 0.55, 4]] as const) {
    const c = a0 < -2 ? hind : fore;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if ((i === 0 || i === n - 1) && (j === 0 || j === n - 1)) continue;
      const p = onBall(c[0], c[1], a0 + (i - (n - 1) / 2) * 0.11 + (j % 2) * 0.05, e0 + ((n - 1) / 2 - j) * 0.1, 0.99);
      const up = normalAt(c[0], c[1], p);
      const down = new THREE.Vector3(0, -1, 0).addScaledVector(up, up.y).normalize();
      leaf(beast, p, down.toArray() as V, [0.13, 0.03, 0.15], (i + j) % 4 ? scale : hide, up);
    }
  }
  // Where it was stitched together: a seam down its flank, the stitches across it.
  const seam: V[] = [];
  for (let k = 0; k <= 8; k++) seam.push(onBall(fore[0], fore[1], -1.2 - k * 0.12, 0.7 - k * 0.15, 1.01));
  line(beast, seam, 0.018, stitch, 3);
  for (const p of seam.slice(1, -1)) {
    const n = normalAt(fore[0], fore[1], p);
    const a = new THREE.Vector3(...p).addScaledVector(n, 0.01);
    put(beast, box(0.015, 0.015, 0.12), stitch, a.toArray() as V, [0, Math.atan2(n.x, n.z) + Math.PI / 2, 0.6]);
  }
  // A ridge of bony spikes down the back, and three more eyes blinking on the hump.
  for (let k = 0; k < 7; k++) {
    put(beast, sph(0.07, 6, 4), bone, [0, 0.86 - k * 0.12, 0.35 - k * 0.2]);
    prong(beast, [0, 0.86 - k * 0.12, 0.35 - k * 0.2], [0, 1.18 - k * 0.15, 0.2 - k * 0.24], 0.07 + (k < 3 ? 0.03 : 0), bone, 5);
  }
  for (const [a, e] of [[0.9, 0.95], [1.3, 0.7], [-1.0, 0.85]] as const) {
    const p = onBall(fore[0], fore[1], a, e, 0.98);
    put(beast, sph(0.06, 8, 6), skin, p, [0, 0, 0], [1.3, 0.9, 1.3]);
    put(beast, sph(0.035, 6, 4), eye, onBall(fore[0], fore[1], a, e, 1.03));
  }
  // Broken shackles on the haunches, a few links of chain swinging off them.
  for (const side of [-1, 1]) {
    const at: V = [side * 0.72, -0.25, -0.6];
    put(beast, can(0.24, 0.24, 0.1, 10), iron, at, [0, 0, side * 0.5]);
    for (let k = 0; k < 3; k++) put(beast, hoop(0.05, 0.015, TAU, 8), iron, [at[0] + side * 0.12, at[1] - 0.12 - k * 0.08, at[2] - 0.15 - k * 0.04], [0, k % 2 ? Math.PI / 2 : 0, 0]);
  }
  const tailRoot = new THREE.Group();
  tailRoot.position.set(0, 0.1, -1.1);
  beast.add(tailRoot);
  tube(tailRoot, [[0, 0, 0], [0, 0.2, -0.3], [0.1, 0.45, -0.45], [0.05, 0.6, -0.4]], 0.08, fur);
  for (let k = 0; k < 8; k++) prong(tailRoot, [0.05 * (k / 8), 0.1 + k * 0.07, -0.2 - (k / 8) * 0.22], [0.15 * Math.sin(k * 2), 0.2 + k * 0.07, -0.42 - (k / 8) * 0.2], 0.05, k % 2 ? furDark : fur, 4);
  for (let k = 0; k < 3; k++) prong(tailRoot, [0.05, 0.58 - k * 0.04, -0.4 - k * 0.03], [0.05 + (k - 1) * 0.12, 0.78 - k * 0.05, -0.38 - k * 0.05], 0.035, bone, 5);

  // Four sprawled legs: bear's paws behind, and in front the altered hands, a knife on the left, a fork on the right.
  const legs: THREE.Object3D[] = [];
  const leg = (side: number, hipZ: number, phase: number, front: boolean) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.65, -0.1, hipZ);
    pivot.userData = { side, phase };
    const knee: V = [side * 0.35, -0.3, front ? 0.15 : -0.05];
    const foot: V = [side * 0.42, -0.9, front ? 0.25 : 0.05];
    rod(pivot, [0, 0, 0], knee, 0.26, fur, 0.2);
    put(pivot, sph(0.2, 12, 10), fur, knee);
    tufts(pivot, [knee[0], knee[1] + 0.12, knee[2]], [0.24, 0.25, 0.24], 10, rnd, [fur, furDark], 0.18, 0.05, [0, -0.6, -0.4]);
    rod(pivot, knee, foot, 0.17, front ? skin : fur, 0.14);
    if (!front) {
      put(pivot, sph(0.2, 12, 10), furDark, foot, [0, 0, 0], [1.1, 0.5, 1.4]);
      for (let t = -1; t <= 1; t++) prong(pivot, [foot[0] + t * 0.09, foot[1], foot[2] + 0.2], [foot[0] + t * 0.11, foot[1] - 0.08, foot[2] + 0.38], 0.035, bone, 5);
    } else {
      // A cuff of stitched skin where the hand was cut off and the tool put on.
      put(pivot, cyl(0.1, 0.12, 0.25, 10), furDark, [foot[0], foot[1] + 0.05, foot[2]]);
      put(pivot, hoop(0.115, 0.012, TAU, 12), stitch, [foot[0], foot[1] - 0.04, foot[2]], [Math.PI / 2, 0, 0]);
      for (let k = 0; k < 6; k++) put(pivot, box(0.012, 0.06, 0.012), stitch, [foot[0] + Math.cos((k / 6) * TAU) * 0.12, foot[1] - 0.04, foot[2] + Math.sin((k / 6) * TAU) * 0.12]);
      if (side < 0) {
        // The knife: a carving blade with a bolster and a riveted wooden grip, its spine serrated, blood on the point.
        put(pivot, box(0.07, 0.14, 0.26), wood, [foot[0], foot[1] - 0.12, foot[2] + 0.02]);
        studs(pivot, [[foot[0] - 0.036, foot[1] - 0.12, foot[2] - 0.06], [foot[0] - 0.036, foot[1] - 0.12, foot[2] + 0.08], [foot[0] + 0.036, foot[1] - 0.12, foot[2] - 0.06], [foot[0] + 0.036, foot[1] - 0.12, foot[2] + 0.08]], 0.018, steel);
        put(pivot, box(0.08, 0.18, 0.05), steel, [foot[0], foot[1] - 0.12, foot[2] + 0.17]);
        const blade = new THREE.Shape();
        blade.moveTo(0, 0);
        blade.lineTo(0.7, 0.02);
        blade.quadraticCurveTo(0.55, 0.22, 0, 0.2);
        blade.closePath();
        put(pivot, new THREE.ExtrudeGeometry(blade, { depth: 0.03, bevelEnabled: false }).translate(0, 0, -0.015).rotateY(-Math.PI / 2), steel, [foot[0], foot[1] - 0.21, foot[2] + 0.19]);
        for (let k = 0; k < 8; k++) prong(pivot, [foot[0], foot[1] - 0.02, foot[2] + 0.22 + k * 0.05], [foot[0], foot[1] + 0.03, foot[2] + 0.26 + k * 0.05], 0.02, steel, 3);
        put(pivot, sph(0.03, 6, 4), blood, [foot[0], foot[1] - 0.2, foot[2] + 0.84], [0, 0, 0], [0.7, 1, 1.6]);
        line(pivot, [[foot[0] + 0.017, foot[1] - 0.16, foot[2] + 0.5], [foot[0] + 0.017, foot[1] - 0.18, foot[2] + 0.7], [foot[0] + 0.017, foot[1] - 0.2, foot[2] + 0.84]], 0.012, blood, 3);
      } else {
        // The fork: a grip, a neck and four long tines, bits of its last meal on them.
        put(pivot, box(0.07, 0.12, 0.24), wood, [foot[0], foot[1] - 0.1, foot[2] + 0.02]);
        put(pivot, box(0.08, 0.06, 0.18), steel, [foot[0], foot[1] - 0.1, foot[2] + 0.2]);
        put(pivot, box(0.3, 0.05, 0.12), steel, [foot[0], foot[1] - 0.1, foot[2] + 0.34]);
        for (let t = 0; t < 4; t++) {
          const x = foot[0] - 0.12 + t * 0.08;
          put(pivot, box(0.035, 0.035, 0.42), steel, [x, foot[1] - 0.12, foot[2] + 0.58], [0.06, 0, 0]);
          prong(pivot, [x, foot[1] - 0.135, foot[2] + 0.79], [x, foot[1] - 0.15, foot[2] + 0.9], 0.02, steel, 4);
        }
        put(pivot, sph(0.06, 6, 4), blood, [foot[0] - 0.04, foot[1] - 0.12, foot[2] + 0.62], [0, 0, 0], [1.8, 0.8, 0.8]);
      }
    }
    beast.add(pivot);
    legs.push(pivot);
  };
  for (const side of [-1, 1]) {
    leg(side, 0.55, side < 0 ? 0 : Math.PI, true);
    leg(side, -0.7, side < 0 ? Math.PI : 0, false);
  }

  // The head: big and low-slung, all wrong: stitched down the middle, bear's fur one side and a man's bare skin the other, a round ear and a pointed one, a horn, three eyes, a snarl.
  const head = new THREE.Group();
  head.position.set(0, 0.35, 1.2);
  head.scale.setScalar(1.2);
  const hc: V = [0, 0.05, 0];
  const hr: V = [0.46, 0.4, 0.42];
  put(head, sph(0.42, 20, 16), fur, hc, [0, 0, 0], [1.1, 0.95, 1.0]);
  put(head, new THREE.SphereGeometry(0.43, 14, 12, 0, Math.PI * 0.75, 0.25, Math.PI * 0.55), skin, hc, [0, 0.15, 0], [1.1, 0.95, 1.0]);
  for (let k = 0; k < 7; k++) put(head, box(0.12, 0.018, 0.018), stitch, onBall(hc, hr, 0.12, 0.85 - k * 0.2, 1.0), [0, 0.1, 0.3]);
  tufts(head, hc, hr, 26, rnd, [fur, furDark], 0.16, 0.05, [0, 0, -0.5], (a) => Math.sin(a) < -0.05);
  // The muzzle: wrinkled back in a snarl, a wet black nose.
  put(head, sph(0.28, 16, 12), skin, [0, -0.08, 0.3], [0, 0, 0], [1.0, 0.75, 1.05]);
  for (let k = 0; k < 3; k++) put(head, hoop(0.13 - k * 0.015, 0.018, Math.PI, 10), skin, [0, 0.06 - k * 0.02, 0.4 + k * 0.05], [-0.5, 0, 0]);
  put(head, sph(0.09, 10, 8), black, [0, 0.0, 0.58], [0, 0, 0], [1.3, 0.8, 0.8]);
  for (const side of [-1, 1]) put(head, sph(0.025, 6, 4), black, [side * 0.04, -0.02, 0.645]);
  put(head, sph(0.3, 14, 10), hide, [0.22, 0.2, 0.15], [0, 0, 0], [0.8, 0.5, 0.7]);
  // The ears: round bear on the left, tall wolf on the right; and a curled ridged horn over the scaled side.
  put(head, sph(0.13, 12, 10), fur, [-0.3, 0.42, -0.05], [0, 0, 0], [1, 1, 0.5]);
  put(head, sph(0.08, 10, 8), skin, [-0.3, 0.42, -0.0], [0, 0, 0], [1, 1, 0.4]);
  put(head, spike(0.13, 0.42, 4), furDark, [0.3, 0.55, -0.1], [-0.15, 0, -0.3]);
  put(head, spike(0.07, 0.3, 4), skin, [0.3, 0.53, -0.05], [-0.15, 0, -0.3]);
  const hornPts: V[] = [[0.18, 0.35, 0.1], [0.35, 0.65, 0.05], [0.5, 0.75, -0.15], [0.55, 0.65, -0.35]];
  horn(head, hornPts, 0.06, bone);
  const hornCurve = new THREE.CatmullRomCurve3(hornPts.slice(0, -1).map((p) => new THREE.Vector3(...p)));
  for (let k = 1; k < 6; k++) {
    const p = hornCurve.getPoint(k / 6);
    const t = hornCurve.getTangent(k / 6);
    const m = put(head, hoop(0.062, 0.012, TAU, 10), bone, p.toArray() as V);
    m.quaternion.setFromUnitVectors(Z, t);
  }
  // Three eyes: two great glowing ones under a heavy furrowed brow, and a little one in the forehead.
  for (const side of [-1, 1]) {
    put(head, sph(0.1, 14, 10), eye, [side * 0.18, 0.15, 0.33]);
    put(head, box(0.025, 0.14, 0.02), black, [side * 0.18, 0.15, 0.43]);
    glowSprite(head, [side * 0.19, 0.15, 0.43], 0.4, r.accent);
    put(head, box(0.24, 0.07, 0.1), side < 0 ? furDark : skin, [side * 0.17, 0.27, 0.38], [0, 0, side * 0.4]);
  }
  for (let k = 0; k < 3; k++) put(head, box(0.012, 0.08, 0.012), stitch, [-0.015 + k * 0.015, 0.3, 0.42], [0, 0, (k - 1) * 0.4]);
  put(head, sph(0.055, 10, 8), eye, [0, 0.38, 0.34]);
  put(head, sph(0.025, 6, 4), black, [0, 0.38, 0.39]);
  // The mouth: a wide snarl dropped open, the lips curled back off red gums, nine pearl fangs along the top, teeth below, slaver strung between.
  put(head, box(0.5, 0.16, 0.14), mouth, [0, -0.22, 0.4]);
  put(head, box(0.52, 0.05, 0.16), gum, [0, -0.15, 0.42]);
  put(head, box(0.5, 0.05, 0.14), gum, [0, -0.3, 0.4]);
  put(head, sph(0.1, 8, 6), gum, [0, -0.27, 0.36], [0, 0, 0], [1.6, 0.4, 1]);
  for (let k = 0; k < 9; k++) {
    const x = -0.21 + k * 0.0525;
    prong(head, [x, -0.16, 0.48 - Math.abs(x) * 0.25], [x, k === 1 || k === 7 ? -0.32 : -0.25, 0.49 - Math.abs(x) * 0.25], 0.025, bone, 5);
  }
  for (let k = 0; k < 6; k++) {
    const x = -0.15 + k * 0.06;
    prong(head, [x, -0.29, 0.46 - Math.abs(x) * 0.2], [x, -0.22, 0.47 - Math.abs(x) * 0.2], 0.02, bone, 4);
  }
  for (const x of [-0.12, 0.08]) line(head, [[x, -0.16, 0.47], [x + 0.01, -0.25, 0.49], [x + 0.02, -0.29, 0.46]], 0.008, slime, 3);
  // A shaggy mane round the back of the head.
  for (let k = 0; k < 14; k++) {
    const a = Math.PI * 0.1 + (k / 13) * Math.PI * 0.8;
    put(head, spike(0.1, 0.45, 5), k % 2 ? fur : furDark, [Math.cos(a) * 0.42, Math.sin(a) * 0.36 - 0.05, -0.25], [-1.9, 0, Math.cos(a) * 0.8]);
  }
  beast.add(head);

  finish(body);
  return {
    body,
    wheels: [],
    exhausts: [new THREE.Vector3(0, 1.3, -1.45)],
    rearTrack: 0.9,
    rearZ: -1.0,
    spinners: [],
    shadow: [3.2, 4.0],
    head,
    legs,
    sway: beast,
    tail: tailRoot,
  };
}

// ---- The Balrog: the Lord of Lightning vs. Balrog's boss -------------------------
// "You made the atom split, it caused a massive rift, and he came screaming
// through": a fire demon come through and flying, low over the road the way
// the Skeleton Dragon does, leant into it on two-jointed wings of smoke and
// embers, "glowing red and lapis hot", plated in cooled crust, "pyre muscles"
// cracked with fire that throbs, a lapis heart, its right fist thrust ahead
// clawed and burning, a whip of fire lashing from its left, ridged bull
// horns, a smirk "beyond the flames" full of fangs and here "to bite the head
// from you", a mane of flame, its legs trailing fire behind.

export function balrog(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const rnd = rng(41);
  const rock = matte(0x2a1210, { shininess: 20, specular: 0x552010, emissive: 0x1a0402 });
  const crust = matte(0x1e0e0c, { shininess: 35, specular: 0x6a3020, emissive: 0x120200 });
  const red = matte(r.color, { shininess: 50, specular: 0xff6a3a, emissive: 0x5a0a02 });
  const lapis = pulsing(glow(r.accent), 1.6, 0.5);
  const lapisVein = pulsing(glow(r.accent), 0.9, 0.6, 1.5);
  const lava = pulsing(glow(0xffa020), 1.1, 0.55);
  const hot = pulsing(glow(0xffe060), 2.0, 0.35);
  const hornMat = matte(0x1a1210, { shininess: 60, specular: 0x886655 });
  const fang = matte(0xf8f0d8, { shininess: 60 });
  const smoke = new THREE.MeshPhongMaterial({ color: 0x1a1018, emissive: 0x2a0800, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const flame = pulsing(new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), 1.7, 0.35);
  const flameHot = pulsing(new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), 2.3, 0.35, 1);

  // It flies like the Skeleton Dragon: the whole demon a metre off the road, leant forward into the wind.
  const demon = new THREE.Group();
  demon.position.set(0, 1.1, -0.2);
  demon.scale.setScalar(0.88);
  body.add(demon);
  const lean = 0.95;
  const torso = new THREE.Group();
  torso.rotation.x = lean;
  demon.add(torso);
  /** A point on the leant torso (built upright, waist at the origin) in the demon's own space. */
  const tilt = new THREE.Euler(lean, 0, 0);
  const T = (p: V): V => new THREE.Vector3(...p).applyEuler(tilt).toArray() as V;

  // Torso: a great barrel chest and belly, plates of muscle, fire in the cracks between, lapis veins and a lapis heart.
  const belly: [V, V] = [[0, 0.55, 0], [0.775, 0.59, 0.53]];
  const chest: [V, V] = [[0, 1.25, 0.05], [1.01, 0.71, 0.675]];
  put(torso, sph(0.62, 22, 16), red, belly[0], [0, 0, 0], [1.25, 0.95, 0.85]);
  put(torso, sph(0.75, 22, 16), red, chest[0], [0, 0, 0], [1.35, 0.95, 0.9]);
  for (const side of [-1, 1]) put(torso, sph(0.36, 16, 12), red, [side * 0.38, 1.45, 0.42], [0, 0, 0], [1.1, 0.75, 0.5]);
  for (let k = 0; k < 3; k++) for (const side of [-1, 1]) put(torso, sph(0.15, 10, 8), red, [side * 0.17, 0.95 - k * 0.24, 0.5 - k * 0.03], [0, 0, 0], [1.1, 0.8, 0.5]);
  for (const [a, b] of [
    [[-0.5, 1.6, 0.55], [-0.2, 1.1, 0.68]],
    [[0.55, 1.55, 0.5], [0.25, 1.2, 0.66]],
    [[0, 1.25, 0.72], [0.0, 0.5, 0.58]],
    [[-0.8, 1.1, 0.3], [-0.6, 0.5, 0.35]],
    [[0.75, 0.9, 0.38], [0.65, 0.4, 0.3]],
  ] as V[][]) rod(torso, a, b, 0.03, lava);
  for (let k = 0; k < 12; k++) crack(torso, ...chest, -1.5 + rnd() * 3, 0.9 - rnd() * 0.5, 4, rnd, lava, 0.02);
  // The back, which the chase camera sees: the cracks thickest there, a ridge of crust plates and spines down the spine.
  for (let k = 0; k < 18; k++) crack(torso, ...chest, Math.PI + (rnd() - 0.5) * 3.2, 0.95 - rnd() * 0.6, 5, rnd, k % 4 ? lava : lapisVein, 0.026);
  for (let k = 0; k < 8; k++) crack(torso, ...belly, Math.PI + (rnd() - 0.5) * 2.6, 0.5 - rnd() * 0.3, 3, rnd, lava, 0.022);
  for (let k = 0; k < 8; k++) {
    const p = onBall(chest[0], chest[1], Math.PI, 0.95 - k * 0.2, 1.0);
    const up = normalAt(chest[0], chest[1], p);
    leaf(torso, p, [0, -1, 0], [0.26 - k * 0.012, 0.08, 0.26], crust, up);
    prong(torso, p, [p[0], p[1] + up.y * 0.25, p[2] + up.z * 0.25], 0.05, hornMat, 4);
  }
  for (let k = 0; k < 7; k++) crack(torso, ...belly, -1.4 + rnd() * 2.8, 0.4 - rnd() * 0.4, 3, rnd, k % 3 ? lava : lapisVein, 0.018);
  // Plates of cooled crust on the shoulders, and a girdle of crust round the waist.
  for (const side of [-1, 1]) for (let k = 0; k < 6; k++) {
    const p = onBall(chest[0], chest[1], side * (1.1 + (k % 3) * 0.3), 0.55 + Math.floor(k / 3) * 0.3, 1.0);
    leaf(torso, p, [0, -1, -0.3], [0.28, 0.06, 0.3], crust, normalAt(chest[0], chest[1], p));
  }
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU;
    prong(torso, [Math.sin(a) * 0.72, 0.12, Math.cos(a) * 0.5], [Math.sin(a) * 0.92, 0.0 - (k % 3) * 0.06, Math.cos(a) * 0.66], 0.1, k % 2 ? crust : rock, 4);
  }
  put(torso, sph(0.17, 14, 10), lapis, [0, 1.35, 0.68], [0, 0, 0], [1, 1, 0.5]);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    line(torso, [[0, 1.35, 0.7], [Math.cos(a) * 0.2, 1.35 + Math.sin(a) * 0.2, 0.7], [Math.cos(a + 0.4) * 0.38, 1.35 + Math.sin(a + 0.4) * 0.34, 0.66]], 0.014, lapisVein, 3);
  }
  throb(glowSprite(torso, [0, 1.35, 0.78], 0.9, r.accent), 1.6, 0.35);
  // Burning on its back between the wings, so it reads lit from behind.
  throb(glowSprite(torso, [0, 1.2, -0.75], 1.4, 0xff6a1a), 1.1, 0.25);

  // Arms: huge, crust on the forearms, claws on the fists, flame licking off them.
  const limb = (side: number, shoulder: V, elbow: V, fist: V) => {
    put(demon, sph(0.36, 16, 12), red, shoulder);
    rod(demon, shoulder, elbow, 0.26, red, 0.22);
    put(demon, sph(0.22, 12, 10), red, elbow);
    rod(demon, elbow, fist, 0.2, red, 0.24);
    put(demon, sph(0.26, 14, 10), red, fist, [0, 0, 0], [1, 0.9, 1.1]);
    for (let k = 0; k < 4; k++) {
      const t = 0.2 + k * 0.18;
      const p: V = [elbow[0] + (fist[0] - elbow[0]) * t, elbow[1] + (fist[1] - elbow[1]) * t, elbow[2] + (fist[2] - elbow[2]) * t];
      leaf(demon, [p[0] + side * 0.16, p[1] + 0.1, p[2]], [side * 0.5, 0.6, -0.4], [0.18, 0.05, 0.22], crust);
      line(demon, [[p[0] - 0.12, p[1] - 0.15, p[2] + 0.12], [p[0], p[1] + 0.02, p[2] + 0.2], [p[0] + 0.12, p[1] + 0.18, p[2] + 0.1]], 0.018, lava, 3);
    }
    const toward = new THREE.Vector3(...fist).sub(new THREE.Vector3(...elbow)).normalize();
    for (let k = 0; k < 4; k++) {
      const off = (k - 1.5) * 0.1;
      const base: V = [fist[0] + off * side * 0.4, fist[1] + 0.12 - Math.abs(off) * 0.4, fist[2] + 0.05 + off];
      prong(demon, base, [base[0] + toward.x * 0.3, base[1] + toward.y * 0.3 + 0.05, base[2] + toward.z * 0.3], 0.04, hornMat, 5);
    }
    for (let k = 0; k < 3; k++) put(demon, spike(0.07, 0.4, 6), k % 2 ? flame : flameHot, [(elbow[0] + fist[0]) / 2 + side * 0.1, (elbow[1] + fist[1]) / 2 + 0.15, (elbow[2] + fist[2]) / 2 - 0.1 * k], [-1.2, 0, -side * 0.4]);
  };
  // The right fist thrust out ahead; the left swept back, the whip in it.
  limb(1, T([0.95, 1.55, 0.05]), [1.3, 0.62, 1.75], [1.05, 0.6, 2.5]);
  const whipHand: V = [-1.3, 0.3, 0.2];
  limb(-1, T([-0.95, 1.55, 0.05]), [-1.45, 0.62, 0.8], whipHand);
  // The whip: a lash of fire trailing from the left fist, swinging side to side.
  const sweepers: THREE.Object3D[] = [];
  const whip = new THREE.Group();
  whip.position.set(...whipHand);
  whip.userData.phase = 0.5;
  const whipPts: V[] = [[0, 0, 0], [-0.15, -0.2, -0.55], [0.05, -0.38, -1.1], [-0.12, -0.45, -1.6], [0.06, -0.38, -2.1], [0.0, -0.25, -2.45]];
  const whipCurve = new THREE.CatmullRomCurve3(whipPts.map((p) => new THREE.Vector3(...p)));
  for (let k = 0; k < 10; k++) {
    const a = whipCurve.getPoint(k / 10).toArray() as V;
    const b = whipCurve.getPoint((k + 1) / 10).toArray() as V;
    rod(whip, a, b, 0.07 * (1 - k / 11), k % 2 ? flame : flameHot, 0.07 * (1 - (k + 1) / 11));
    if (k % 2) put(whip, spike(0.05, 0.25, 5), flameHot, [a[0], a[1] + 0.08, a[2]], [-1.3, 0, 0]);
  }
  throb(glowSprite(whip, [0, -0.4, -2.3], 0.6, 0xffa020), 2.2, 0.35);
  demon.add(whip);
  sweepers.push(whip);

  // The legs: trailing out behind, muscled and crusted, cracked with fire, clawed feet with flame streaming off them.
  const feet: V[] = [];
  for (const side of [-1, 1]) {
    const hip: V = [side * 0.42, -0.02, -0.08];
    const knee: V = [side * 0.6, -0.45, -0.68];
    const ankle: V = [side * 0.52, -0.5, -1.4];
    const toes: V = [side * 0.5, -0.82, -1.55];
    put(demon, sph(0.42, 14, 10), red, [side * 0.42, -0.08, -0.2], [0, 0, 0], [1, 0.9, 1.3]);
    rod(demon, hip, knee, 0.32, red, 0.24);
    put(demon, sph(0.25, 12, 10), red, knee);
    rod(demon, knee, ankle, 0.22, red, 0.14);
    put(demon, sph(0.15, 10, 8), red, ankle);
    rod(demon, ankle, toes, 0.13, red, 0.1);
    for (let k = 0; k < 3; k++) {
      const t = 0.2 + k * 0.28;
      const p: V = [knee[0] + (ankle[0] - knee[0]) * t, knee[1] + (ankle[1] - knee[1]) * t, knee[2] + (ankle[2] - knee[2]) * t];
      leaf(demon, [p[0] + side * 0.1, p[1] + 0.12, p[2]], [0, 0.2, -1], [0.22, 0.05, 0.26], crust);
    }
    line(demon, [hip, [side * 0.62, -0.25, -0.4], knee, [side * 0.58, -0.4, -1.0], ankle], 0.022, lava, 3);
    line(demon, [[side * 0.3, 0.05, -0.2], [side * 0.45, -0.3, -0.55], [side * 0.48, -0.45, -0.9]], 0.018, lapisVein, 3);
    for (let t = -1; t <= 1; t++) prong(demon, [toes[0] + t * 0.08, toes[1], toes[2]], [toes[0] + t * 0.12, toes[1] - 0.22, toes[2] - 0.1], 0.04, hornMat, 5);
    for (let k = 0; k < 3; k++) put(demon, spike(0.1, 0.5 + k * 0.12, 6), k % 2 ? flame : flameHot, [toes[0] + (k - 1) * 0.07, toes[1] + 0.05, toes[2] - 0.3], [-Math.PI / 2 - 0.35, 0, 0]);
    throb(glowSprite(demon, [toes[0], toes[1] + 0.05, toes[2] - 0.25], 0.8, 0xff7a1a), 2.4, 0.3, side);
    feet.push([toes[0], toes[1], toes[2] - 0.3]);
  }
  // The fire under it: it swells as it flies, like the dragon's.
  const pads = [glowSprite(demon, [0, -0.75, -0.5], 1.8, 0xff6a1a), glowSprite(demon, [0, -0.6, 0.4], 1.1, r.accent)];

  // Wings: two great spans of smoke on dark bone, in two joints that both beat, spread off its shoulder blades, embers smouldering along the edges.
  const flappers: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(...T([side * 0.55, 1.65, -0.4]));
    wing.userData.side = side;
    const elbow: V = [side * 1.05, 0.32, -0.15];
    rod(wing, [0, 0, 0], elbow, 0.09, rock, 0.06);
    put(wing, sph(0.09, 8, 6), rock, elbow);
    prong(wing, elbow, [elbow[0] + side * 0.08, elbow[1] + 0.3, elbow[2] + 0.05], 0.05, hornMat, 5);
    tri(wing, [0, 0, 0], elbow, [side * 0.5, -0.12, -0.95], smoke);
    for (let k = 0; k < 3; k++) put(wing, sph(0.04, 6, 4), lava, [side * (0.3 + k * 0.2), 0.05 - k * 0.05, -0.35 - k * 0.15]);
    const hand = new THREE.Group();
    hand.position.set(...elbow);
    hand.userData.side = side;
    const tipA: V = [side * 1.05, 0.08, 0.05];
    const tipB: V = [side * 0.95, -0.1, -0.7];
    const tipC: V = [side * 0.45, -0.18, -1.2];
    const back: V = [side * -0.55, -0.15, -0.85];
    for (const t of [tipA, tipB, tipC]) {
      rod(hand, [0, 0, 0], t, 0.04, rock, 0.02);
      put(hand, sph(0.07, 8, 6), lava, t);
    }
    tri(hand, [0, 0, 0], tipA, tipB, smoke);
    tri(hand, [0, 0, 0], tipB, tipC, smoke);
    tri(hand, [0, 0, 0], tipC, back, smoke);
    for (const [a, b] of [[tipA, tipB], [tipB, tipC], [tipC, back]] as [V, V][]) {
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        put(hand, sph(0.04, 6, 4), k % 2 ? lava : hot, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 0.03, a[2] + (b[2] - a[2]) * t]);
      }
    }
    wing.add(hand);
    demon.add(wing);
    flappers.push(wing, hand);
  }

  // The head: held up to look where it's going, horned and heavy-jawed, crusted brows, eyes white-hot, a smirk of fangs, a mane of fire streaming back.
  const head = new THREE.Group();
  // Up off the shoulders, so it's held high enough to look ahead.
  head.position.set(...T([0, 2.2, 0.3])).add(new THREE.Vector3(0, 0.35, -0.2));
  put(head, sph(0.38, 18, 14), red, [0, 0, 0], [0, 0, 0], [1, 1.05, 1]);
  put(head, sph(0.3, 16, 12), red, [0, -0.2, 0.15], [0, 0, 0], [1.15, 0.75, 1]);
  for (const side of [-1, 1]) {
    leaf(head, [side * 0.03, 0.17, 0.33], [side * 1, -0.35, 0.25], [0.14, 0.07, 0.3], crust);
    put(head, sph(0.08, 8, 6), red, [side * 0.22, -0.08, 0.3], [0, 0, 0], [1.2, 0.8, 0.7]);
    put(head, sph(0.065, 10, 8), hot, [side * 0.15, 0.04, 0.32]);
    put(head, box(0.1, 0.025, 0.02), crust, [side * 0.15, 0.065, 0.375], [0, 0, side * 0.35]);
    glowSprite(head, [side * 0.15, 0.04, 0.38], 0.45, 0xffd040);
    put(head, sph(0.025, 6, 4), lava, [side * 0.05, -0.1, 0.42]);
    crack(head, [0, 0, 0], [0.38, 0.4, 0.38], side * 0.7, 0.3, 4, rnd, lava, 0.014);
    for (let k = 0; k < 3; k++) prong(head, [side * 0.06 * k, -0.38, 0.28 - k * 0.04], [side * 0.08 * k, -0.52 - (k === 0 ? 0.05 : 0), 0.3 - k * 0.04], 0.035, hornMat, 4);
  }
  put(head, sph(0.06, 8, 6), red, [0, -0.06, 0.43], [0, 0, 0], [1.3, 0.8, 0.9]);
  // The smirk: a crooked slash of fire, one corner up, fangs top and bottom.
  put(head, box(0.34, 0.06, 0.05), lava, [0.02, -0.24, 0.39], [0, 0, 0.18]);
  for (const [x, up] of [[-0.12, 1], [-0.05, 1], [0.04, 1], [0.12, 1], [-0.08, -1], [0.08, -1]] as const) {
    const y = -0.24 + x * 0.18;
    prong(head, [x, y + up * 0.01, 0.405], [x, y - up * (Math.abs(x) > 0.1 ? 0.11 : 0.06), 0.41], 0.022, fang, 4);
  }
  // Horns: two great ridged ones sweeping out and forward like a bull's, two small ones behind.
  for (const side of [-1, 1]) {
    const pts: V[] = [[side * 0.28, 0.18, 0], [side * 0.6, 0.35, 0.0], [side * 0.8, 0.65, 0.2], [side * 0.72, 0.95, 0.35]];
    horn(head, pts, 0.09, hornMat);
    const curve = new THREE.CatmullRomCurve3(pts.slice(0, -1).map((p) => new THREE.Vector3(...p)));
    for (let k = 1; k < 7; k++) {
      const m = put(head, hoop(0.09 - k * 0.004, 0.016, TAU, 10), hornMat, curve.getPoint(k / 7).toArray() as V);
      m.quaternion.setFromUnitVectors(Z, curve.getTangent(k / 7));
    }
    horn(head, [[side * 0.2, 0.3, -0.2], [side * 0.3, 0.55, -0.4], [side * 0.25, 0.7, -0.6]], 0.045, hornMat);
  }
  // The mane: tongues of flame up and back off the skull, streaming behind in the wind.
  for (let k = 0; k < 14; k++) {
    const a = -1.3 + (k / 13) * 2.6;
    put(head, spike(0.12, 0.55 + (k % 3) * 0.15, 6), k % 2 ? flame : flameHot, [Math.sin(a) * 0.3, 0.15 + Math.cos(a) * 0.15, -0.3], [-1.6 + Math.abs(a) * 0.2, 0, -a * 0.6]);
  }
  throb(glowSprite(head, [0, 0.3, -0.45], 1.6, 0xff6a1a), 1.3, 0.2);
  demon.add(head);

  finish(body);
  const at = demon.position;
  const k = demon.scale.x;
  return {
    body,
    wheels: [],
    // Boost fire off its feet.
    exhausts: feet.map(([x, y, z]) => new THREE.Vector3(at.x + x * k, at.y + y * k, at.z + z * k)),
    rearTrack: 0.8,
    rearZ: -1.3,
    spinners: [],
    // The spread wings' shadow on the road under it.
    shadow: [4.4, 4.0],
    // Like the dragon: it holds itself up and bobs, the fire under it swelling.
    hover: { bob: 0.14, pads },
    head,
    flappers,
    sweepers,
  };
}

// ---- The Soy-Protein Munt Machine: Han-Tyumi and the Murder of the Universe's boss
// "So I built a machine, a human machine, I made it with steel and
// soy-protein, born from a test tube and into a vat, to live and to heave",
// and the cyborg who wants only "to vomit": a riveted steel vat of glowing
// goo on six wheels, gauges and valves on it, a cooling fan spinning at its
// back, hazard stripes down the bed; the machine heaving up out of the goo,
// lumpy veined protein bolted into steel ribs, a piston claw and a soft
// drooping hand, a half steel skull with a red camera eye and a sad soft one,
// goo spewing out of its grille, a test tube for a crown with the embryo it
// was born from curled up inside.

export function muntMachine(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const rnd = rng(51);
  const steel = chrome();
  const dull = matte(0x7a828c, { shininess: 60, specular: 0x888888 });
  const darkSteel = matte(0x3a4048, { shininess: 50, specular: 0x777777 });
  const protein = matte(r.color, { shininess: 30, specular: 0x554430 });
  const lump = matte(0xc0a070, { shininess: 25 });
  const vein = matte(0x9a4a5a, { shininess: 40 });
  const goo = pulsing(glow(r.accent), 0.9, 0.4);
  const gooSoft = new THREE.MeshPhongMaterial({ color: r.accent, emissive: 0x2a6a10, transparent: true, opacity: 0.75, shininess: 80 });
  const glass = new THREE.MeshPhongMaterial({ color: 0xe0fff0, transparent: true, opacity: 0.25, shininess: 140, specular: 0xffffff, depthWrite: false });
  const hose = matte(0x2a2a30);
  const yellow = matte(0xf0c020, { shininess: 40 });
  const black = matte(0x101012);
  const dial = matte(0xf4f0e0);
  const redEye = pulsing(glow(0xff3a2a), 1.5, 0.6);
  const blink = pulsing(glow(0xff3a2a), 2.5, 0.9);
  const embryo = matte(0xf0a0a0, { emissive: 0x401818 });
  const white = matte(0xf8f4e0);
  const bubble = glow(0xeaffc8);
  const red = matte(0xc02020);
  const cork = matte(0x8a5a30);

  // The chassis: a steel bed on six wheels, rivets down the sides, hazard stripes along its edges, a bumper and lamps.
  put(body, box(1.55, 0.3, 2.9), dull, [0, 0.62, 0]);
  for (const side of [-1, 1]) {
    studs(body, Array.from({ length: 12 }, (_, k) => [side * 0.78, 0.7, -1.38 + k * 0.25] as V), 0.025, steel);
    studs(body, Array.from({ length: 12 }, (_, k) => [side * 0.78, 0.54, -1.38 + k * 0.25] as V), 0.025, steel);
    for (let k = 0; k < 6; k++) put(body, box(0.02, 0.12, 0.2), k % 2 ? black : yellow, [side * 0.785, 0.62, 1.2 - k * 0.2], [0.6, 0, 0]);
  }
  put(body, box(1.2, 0.2, 0.15), steel, [0, 0.6, 1.5]);
  for (let k = 0; k < 6; k++) put(body, box(0.18, 0.2, 0.02), k % 2 ? black : yellow, [-0.5 + k * 0.2, 0.6, 1.58], [0, 0, 0.6]);
  headlights(body, 0.45, 0.62, 1.48, 0.08, 0xc8ff9a);

  // The vat: a fat steel drum banded and riveted, a glass band round it full of green goo, slopping over the brim.
  put(body, cyl(0.82, 0.82, 0.25, 32), steel, [0, 0.9, -0.3]);
  put(body, cyl(0.76, 0.76, 0.8, 32), glass, [0, 1.42, -0.3]);
  put(body, cyl(0.7, 0.7, 0.7, 32), gooSoft, [0, 1.37, -0.3]);
  put(body, cyl(0.82, 0.82, 0.1, 32), steel, [0, 1.85, -0.3]);
  studs(body, around(24, 0.83, 0.95, 0, -0.3), 0.022, dull);
  studs(body, around(24, 0.83, 1.85, 0, -0.3), 0.022, dull);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    put(body, box(0.06, 0.8, 0.06), steel, [Math.cos(a) * 0.8, 1.42, -0.3 + Math.sin(a) * 0.8]);
  }
  put(body, cyl(0.72, 0.72, 0.05, 32), goo, [0, 1.9, -0.3]);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU + 0.3;
    put(body, sph(0.07, 8, 6), goo, [Math.cos(a) * 0.84, 1.75 - (k % 3) * 0.25, -0.3 + Math.sin(a) * 0.84], [0, 0, 0], [1, 1.8, 1]);
  }
  for (let k = 0; k < 6; k++) put(body, sph(0.08 + (k % 3) * 0.03, 8, 6), goo, [Math.sin(k * 2.1) * 0.45, 1.93, -0.3 + Math.cos(k * 2.1) * 0.45], [0, 0, 0], [1, 0.5, 1]);
  // Bubbles rising in the goo.
  for (let k = 0; k < 10; k++) put(body, sph(0.04 + (k % 3) * 0.02, 8, 6), bubble, [Math.sin(k * 2.3) * 0.5, 1.1 + (k % 5) * 0.15, -0.3 + Math.cos(k * 2.3) * 0.5]);
  throb(glowSprite(body, [0, 1.4, -0.3], 1.8, r.accent), 0.9, 0.2);
  // A pressure gauge on the front of the vat, its needle in the red; a valve wheel on its flank; pipes with flanges.
  put(body, can(0.16, 0.16, 0.06, 16), steel, [0.42, 1.15, 0.36], [Math.PI / 2, 0, 0]);
  put(body, can(0.135, 0.135, 0.02, 16), dial, [0.42, 1.15, 0.395], [Math.PI / 2, 0, 0]);
  put(body, can(0.11, 0.11, 0.022, 12, ), red, [0.42, 1.15, 0.394], [Math.PI / 2, 0, 0], [1, 1, 1]);
  put(body, can(0.1, 0.1, 0.024, 12), dial, [0.42, 1.12, 0.396], [Math.PI / 2, 0, 0]);
  put(body, box(0.012, 0.11, 0.01), black, [0.45, 1.19, 0.41], [0, 0, -0.5]);
  rod(body, [0.42, 1.15, 0.28], [0.42, 1.15, 0.36], 0.03, steel);
  for (const side of [-1, 1]) {
    const v: V = [side * 0.9, 1.15, -0.6];
    put(body, hoop(0.16, 0.025, TAU, 14), red, v, [0, Math.PI / 2, 0]);
    for (let k = 0; k < 3; k++) put(body, box(0.02, 0.3, 0.025), red, v, [(k / 3) * Math.PI, 0, 0]);
    put(body, can(0.04, 0.04, 0.12, 8), steel, [side * 0.84, 1.15, -0.6], [0, 0, Math.PI / 2]);
  }
  // The cooling fan at the back of the vat, in its cage, spinning with speed.
  const spinners: THREE.Object3D[] = [];
  put(body, can(0.36, 0.36, 0.1, 16), darkSteel, [0, 1.25, -1.15], [Math.PI / 2, 0, 0]);
  put(body, hoop(0.36, 0.025, TAU, 20), steel, [0, 1.25, -1.21]);
  rod(body, [0, 1.25, -1.0], [0, 1.25, -1.1], 0.06, steel);
  const fan = new THREE.Group();
  fan.position.set(0, 1.25, -1.22);
  for (let k = 0; k < 5; k++) put(fan, box(0.1, 0.3, 0.015), steel, [Math.cos((k / 5) * TAU) * 0.17, Math.sin((k / 5) * TAU) * 0.17, 0], [0.35, 0, (k / 5) * TAU - Math.PI / 2]);
  put(fan, can(0.06, 0.06, 0.06, 10), yellow, [0, 0, -0.01], [Math.PI / 2, 0, 0]);
  body.add(fan);
  spinners.push(fan);
  for (let k = 0; k < 4; k++) put(body, box(0.72, 0.015, 0.015), steel, [0, 1.25, -1.235], [0, 0, (k / 4) * Math.PI]);

  // The machine, heaving up out of the goo: a lumpy veined protein torso bolted into steel ribs.
  const machine = new THREE.Group();
  machine.position.set(0, 1.9, -0.25);
  body.add(machine);
  const tc: V = [0, 0.45, 0];
  const tr: V = [0.55, 0.53, 0.43];
  put(machine, sph(0.48, 18, 14), protein, tc, [0, 0, 0], [1.15, 1.1, 0.9]);
  for (const [x, y, z, s] of [[0.3, 0.6, 0.3, 0.2], [-0.35, 0.3, 0.28, 0.18], [0.1, 0.15, 0.38, 0.15], [-0.2, 0.75, 0.25, 0.14], [0.42, 0.25, -0.1, 0.17], [-0.38, 0.62, -0.15, 0.15]] as const) put(machine, sph(s, 10, 8), lump, [x, y, z]);
  for (let k = 0; k < 8; k++) crack(machine, tc, tr, -2 + rnd() * 4, 0.6 - rnd() * 0.4, 4, rnd, vein, 0.014);
  for (let k = 0; k < 3; k++) {
    put(machine, ring(0.5 - Math.abs(k - 1) * 0.05, 0.035), dull, [0, 0.2 + k * 0.25, 0], [Math.PI / 2, 0, 0], [1.15, 0.9, 1]);
    studs(machine, around(10, 0.5 - Math.abs(k - 1) * 0.05, 0.2 + k * 0.25).map(([x, y, z]) => [x * 1.17, y, z * 0.92] as V), 0.025, steel);
  }
  put(machine, box(0.08, 0.95, 0.08), steel, [0, 0.45, 0.42]);
  // A hatch in its chest, dials and a blinking light in it.
  put(machine, box(0.28, 0.22, 0.04), darkSteel, [0.17, 0.4, 0.42], [0, 0.3, 0]);
  put(machine, can(0.045, 0.045, 0.02, 10), dial, [0.12, 0.42, 0.45], [Math.PI / 2, 0.3, 0]);
  put(machine, sph(0.025, 6, 4), blink, [0.24, 0.45, 0.43]);
  studs(machine, [[0.05, 0.31, 0.43], [0.05, 0.49, 0.43], [0.3, 0.31, 0.36], [0.3, 0.49, 0.36]], 0.015, steel);
  // A soft arm on the left, lumps all down it, flopped over the rim, its hand limp, its fingers dangling.
  tube(machine, [[-0.5, 0.6, 0.05], [-0.9, 0.45, 0.25], [-1.0, 0.0, 0.45], [-0.85, -0.25, 0.6]], 0.13, protein);
  for (let k = 0; k < 3; k++) put(machine, sph(0.1, 8, 6), lump, [-0.9 + k * 0.02, 0.4 - k * 0.22, 0.25 + k * 0.12]);
  put(machine, sph(0.16, 12, 10), protein, [-0.85, -0.28, 0.62], [0, 0, 0], [1.2, 0.8, 1]);
  for (let k = 0; k < 4; k++) line(machine, [[-0.95 + k * 0.065, -0.32, 0.72], [-0.97 + k * 0.07, -0.4, 0.8], [-0.98 + k * 0.07, -0.52, 0.78]], 0.028, protein, 5);
  // A steel claw on the right, raised, pistons down the arm and hoses to them, three hooked fingers.
  const shoulder: V = [0.55, 0.65, 0.0];
  const elbow: V = [0.95, 0.95, 0.2];
  const wrist: V = [0.9, 1.4, 0.45];
  put(machine, sph(0.14, 12, 10), steel, shoulder);
  rod(machine, shoulder, elbow, 0.07, dull);
  put(machine, sph(0.1, 10, 8), steel, elbow);
  rod(machine, elbow, wrist, 0.06, dull);
  rod(machine, [0.6, 0.55, 0.12], [0.92, 0.82, 0.3], 0.03, steel);
  rod(machine, [0.85, 0.8, 0.28], [1.03, 1.2, 0.4], 0.035, darkSteel);
  rod(machine, [1.0, 1.0, 0.3], [0.98, 1.3, 0.45], 0.022, steel);
  line(machine, [[0.45, 0.8, -0.1], [0.85, 1.1, -0.05], [0.95, 1.3, 0.3]], 0.025, hose, 5);
  put(machine, can(0.09, 0.09, 0.08, 10), darkSteel, wrist, [0.4, 0, 0]);
  for (let t = 0; t < 3; t++) {
    const a = (t / 3) * TAU;
    const k1: V = [wrist[0] + Math.cos(a) * 0.1, wrist[1] + 0.14, wrist[2] + 0.06 + Math.sin(a) * 0.1];
    const k2: V = [wrist[0] + Math.cos(a) * 0.16, wrist[1] + 0.3, wrist[2] + 0.1 + Math.sin(a) * 0.16];
    rod(machine, wrist, k1, 0.028, steel);
    put(machine, sph(0.035, 6, 4), darkSteel, k1);
    rod(machine, k1, k2, 0.024, steel);
    prong(machine, k2, [wrist[0] + Math.cos(a) * 0.08, wrist[1] + 0.42, wrist[2] + 0.12 + Math.sin(a) * 0.08], 0.024, steel, 4);
  }
  // Hoses from the vat into the body, feeding it, clamped.
  for (const side of [-1, 1]) {
    tube(body, [[side * 0.78, 1.6, -0.9], [side * 0.95, 2.1, -0.85], [side * 0.6, 2.6, -0.6], [side * 0.3, 2.5, -0.35]], 0.05, hose);
    put(body, hoop(0.06, 0.015, TAU, 10), steel, [side * 0.92, 2.05, -0.86], [Math.PI / 2, 0, 0]);
  }

  // The head: a steel skull half grown over with protein, riveted down the seam, a red camera eye and a sad soft eye, a steel grille of a jaw spewing goo, a test tube for a crown with an embryo in it.
  const head = new THREE.Group();
  head.position.set(0, 3.0, -0.15);
  put(head, sph(0.32, 18, 14), protein, [0, 0, 0], [0, 0, 0], [1.05, 1.0, 1.0]);
  put(head, new THREE.SphereGeometry(0.335, 24, 12, -Math.PI * 0.05, Math.PI, 0, Math.PI * 0.75), dull, [0, 0, 0], [0, 0, 0]);
  for (let k = 0; k < 7; k++) {
    const e = 1.3 - k * 0.35;
    put(head, sph(0.018, 6, 4), steel, [Math.sin(-Math.PI * 0.05) * Math.sin(e) * 0.34 + 0.01, Math.cos(e) * 0.34, Math.cos(-Math.PI * 0.05) * Math.sin(e) * 0.34]);
  }
  for (let k = 0; k < 4; k++) crack(head, [0, 0, 0], [0.336, 0.32, 0.32], -0.6 - k * 0.5, 0.5, 3, rnd, vein, 0.01);
  // The camera eye on the steel side: a lens barrel, the aperture ring and the red iris.
  put(head, cyl(0.1, 0.12, 0.14, 16), steel, [0.13, 0.05, 0.3], [Math.PI / 2, 0, 0]);
  put(head, hoop(0.09, 0.015, TAU, 14), darkSteel, [0.13, 0.05, 0.37]);
  put(head, can(0.075, 0.075, 0.02, 6), black, [0.13, 0.05, 0.365], [Math.PI / 2, 0, 0]);
  put(head, sph(0.05, 10, 8), redEye, [0.13, 0.05, 0.37], [0, 0, 0], [1, 1, 0.5]);
  glowSprite(head, [0.13, 0.05, 0.42], 0.35, 0xff3a2a);
  put(head, box(0.2, 0.03, 0.04), darkSteel, [0.14, 0.17, 0.29], [0, 0, -0.25]);
  // The soft eye: drooping, sad, a tear of goo under it.
  put(head, sph(0.08, 12, 10), white, [-0.14, 0.04, 0.27]);
  put(head, sph(0.04, 10, 8), goo, [-0.14, 0.03, 0.33]);
  put(head, sph(0.02, 6, 4), black, [-0.14, 0.03, 0.36]);
  put(head, new THREE.SphereGeometry(0.085, 12, 5, 0, TAU, 0, 1.15), protein, [-0.14, 0.04, 0.27], [0.5, 0, 0.35]);
  put(head, sph(0.1, 10, 8), lump, [-0.17, 0.15, 0.22], [0, 0, -0.35], [1.3, 0.45, 1]);
  put(head, sph(0.02, 6, 4), goo, [-0.17, -0.06, 0.33], [0, 0, 0], [0.8, 1.5, 0.8]);
  // The jaw: a steel grille of teeth, goo spewing out through it and down its front into the vat.
  put(head, box(0.34, 0.12, 0.2), dull, [0, -0.25, 0.18]);
  for (let k = 0; k < 6; k++) put(head, box(0.035, 0.08, 0.02), steel, [-0.13 + k * 0.052, -0.2, 0.29]);
  studs(head, [[-0.16, -0.25, 0.285], [0.16, -0.25, 0.285]], 0.02, steel);
  line(head, [[0.02, -0.22, 0.3], [0.05, -0.36, 0.36], [0.04, -0.6, 0.38], [0.0, -0.95, 0.42]], 0.035, goo, 6);
  put(head, sph(0.05, 8, 6), goo, [0.0, -0.98, 0.42], [0, 0, 0], [1, 1.4, 1]);
  // An antenna with a light blinking on it.
  rod(head, [0.2, 0.25, -0.1], [0.32, 0.55, -0.15], 0.012, steel);
  put(head, sph(0.03, 6, 4), blink, [0.32, 0.56, -0.15]);
  // The test tube: rising out of the crown, half full of goo, the embryo curled up in it, a cork in the top.
  put(head, cyl(0.07, 0.07, 0.45, 14), glass, [0, 0.48, -0.05], [-0.15, 0, 0.1]);
  put(head, cyl(0.06, 0.06, 0.22, 14), gooSoft, [0.01, 0.38, -0.03], [-0.15, 0, 0.1]);
  put(head, sph(0.035, 8, 6), embryo, [0.0, 0.42, -0.04], [0, 0, 0], [1, 1.2, 1]);
  put(head, sph(0.025, 8, 6), embryo, [0.01, 0.37, -0.02]);
  line(head, [[0.0, 0.4, -0.03], [-0.02, 0.33, -0.02], [0.02, 0.3, -0.03]], 0.008, embryo, 3);
  put(head, cyl(0.06, 0.07, 0.08, 12), cork, [-0.03, 0.72, -0.09], [-0.15, 0, 0.1]);
  machine.add(head);
  head.position.sub(machine.position);

  finish(body);
  return {
    body,
    wheels: [-1, 1].flatMap((side) => [
      { x: side * 0.86, z: 1.0, radius: 0.42, width: 0.3, front: true, material: dull },
      { x: side * 0.86, z: 0.0, radius: 0.42, width: 0.3, front: false, material: dull },
      { x: side * 0.86, z: -1.0, radius: 0.42, width: 0.3, front: false, material: dull },
    ]),
    // The smokestacks at the back.
    exhausts: pipes(body, 0.5, 1.1, -1.55, 0.13),
    rearTrack: 0.86,
    rearZ: -1.0,
    spinners,
    shadow: [2.6, 3.6],
    head,
  };
}

// ---- The Fourth Colour: Polygondwanaland's boss ------------------------------------
// "Can I see the eye that sees me? Please show me these", "as I opened my
// eyes the dream decolourized", and the album's The Fourth Colour and
// Tetrachromacy: what waits at the castle in the air is a colour no eye has
// seen, come as a cube that won't hold its shape. A glass cube hovering low
// over the road on a glowing point, its edges burning in colours that run
// round the rainbow and past it into a fourth, its side faces swinging open
// on their hinges, its lid sliding apart, the four tiles of its back sliding
// out and in; inside, a cube in a cube joined corner to corner like a
// tesseract, turning, round a core that spins; prisms orbiting it, a gem
// floating over it, and on its front the eye that sees you.

export function fourthColour(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const H = 0.75;
  const C: V = [0, 1.6, 0];
  const glass = cycling(new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }), 0.04, 0.7, 0.7, 0.4);
  const edge = (hue: number, hz = 0.1) => cycling(glow(0xffffff), hz, hue, 1, 0.58);
  const edges = [edge(0), edge(0.25), edge(0.5), edge(0.75)];
  const inner = edge(0.4, 0.22);
  const core = cycling(glow(r.accent), 0.3, 0.45, 1, 0.6);
  const facet = matte(0x1a1030, { shininess: 100, specular: 0x9a8aff });

  /** The twelve edges of a cube of half-edge `h` round `c`, glowing, each axis its own colour. */
  const frame = (parent: THREE.Object3D, c: V, h: number, rad: number, mats: THREE.Material[]) => {
    for (let axis = 0; axis < 3; axis++) for (const u of [-1, 1]) for (const v of [-1, 1]) {
      const a: V = [0, 0, 0];
      const b: V = [0, 0, 0];
      const [i, j] = [(axis + 1) % 3, (axis + 2) % 3];
      a[axis] = -h;
      b[axis] = h;
      a[i] = b[i] = u * h;
      a[j] = b[j] = v * h;
      rod(parent, [c[0] + a[0], c[1] + a[1], c[2] + a[2]], [c[0] + b[0], c[1] + b[1], c[2] + b[2]], rad, mats[axis % mats.length]);
    }
  };
  /** A square pane of glass `w` across with a glowing border and a smaller square glowing in it, facing along `n` ('x', 'y' or 'z'). */
  const pane = (parent: THREE.Object3D, at: V, w: number, n: 'x' | 'y' | 'z', mat: THREE.Material) => {
    const size: V = n === 'x' ? [0.025, w, w] : n === 'y' ? [w, 0.025, w] : [w, w, 0.025];
    put(parent, box(...size), glass, at);
    const ax = n === 'x' ? 0 : n === 'y' ? 1 : 2;
    for (const [s, rad, m] of [[w / 2, 0.03, mat], [w * 0.28, 0.015, core]] as [number, number, THREE.Material][]) {
      const corners: V[] = [[-s, -s], [s, -s], [s, s], [-s, s]].map(([u, v]) => {
        const p: V = [...at];
        p[(ax + 1) % 3] += u;
        p[(ax + 2) % 3] += v;
        return p;
      });
      for (let k = 0; k < 4; k++) rod(parent, corners[k], corners[(k + 1) % 4], rad, m);
    }
  };

  // The shell: front and floor fixed, the frame's twelve edges burning, a glowing node at each corner.
  const shell = new THREE.Group();
  shell.position.set(...C);
  body.add(shell);
  frame(shell, [0, 0, 0], H, 0.04, edges);
  for (const x of [-H, H]) for (const y of [-H, H]) for (const z of [-H, H]) put(shell, sph(0.075, 8, 6), core, [x, y, z]);
  pane(shell, [0, 0, H], 1.5, 'z', edges[3]);
  pane(shell, [0, -H, 0], 1.5, 'y', edges[1]);
  // Just a cube: no stand under it, nothing hanging off it. The side faces are panes like the front, a nest of squares one in another.
  for (const side of [-1, 1]) {
    pane(shell, [side * (H + 0.01), 0, 0], 1.5, 'x', edges[side < 0 ? 0 : 2]);
    pane(shell, [side * (H + 0.03), 0, 0], 0.9, 'x', edges[1]);
  }
  // The lid: two halves sliding apart and back.
  for (const side of [-1, 1]) {
    const half = new THREE.Group();
    put(half, box(0.74, 0.025, 1.5), glass, [0, 0, 0]);
    for (const z of [-0.75, 0.75]) rod(half, [-0.37, 0, z], [0.37, 0, z], 0.03, edges[2]);
    rod(half, [side * 0.37, 0, -0.75], [side * 0.37, 0, 0.75], 0.03, edges[0]);
    rod(half, [-side * 0.37, 0, -0.75], [-side * 0.37, 0, 0.75], 0.02, core);
    body.add(morph(half, (g, t) => g.position.set(C[0] + side * (0.375 + (0.5 + 0.5 * Math.sin(t * 1.3)) * 0.3), C[1] + H + 0.03, C[2])));
  }
  // The back: four tiles, each sliding out along its diagonal and back in its turn, the light inside showing between.
  for (const [k, [sx, sy]] of [[-1, -1], [1, -1], [1, 1], [-1, 1]].entries()) {
    const tile = new THREE.Group();
    pane(tile, [0, 0, 0], 0.72, 'z', edges[k]);
    put(tile, sph(0.06, 8, 6), core, [0, 0, -0.03]);
    body.add(
      morph(tile, (g, t) => {
        const d = (0.5 + 0.5 * Math.sin(t * 1.1 + (k * Math.PI) / 2)) * 0.22;
        g.position.set(C[0] + sx * (H / 2 + d), C[1] + sy * (H / 2 + d), C[2] - H - 0.03 - d * 0.6);
      }),
    );
  }

  // Inside: a cube in a cube, corner joined to corner like a tesseract, turning to and fro.
  const sweepers: THREE.Object3D[] = [];
  const hyper = new THREE.Group();
  hyper.position.set(...C);
  hyper.userData.phase = 0;
  frame(hyper, [0, 0, 0], 0.46, 0.025, [inner, edges[1], edges[3]]);
  frame(hyper, [0, 0, 0], 0.22, 0.02, [edges[2], inner, edges[0]]);
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    rod(hyper, [x * 0.22, y * 0.22, z * 0.22], [x * 0.46, y * 0.46, z * 0.46], 0.015, edges[(x + y + 2) / 2 + (z > 0 ? 1 : 0)]);
    put(hyper, sph(0.04, 6, 4), core, [x * 0.46, y * 0.46, z * 0.46]);
  }
  body.add(hyper);
  sweepers.push(hyper);
  // The core: a cube of the colour itself, spinning, a glow round it.
  const spinners: THREE.Object3D[] = [];
  const heart = new THREE.Group();
  heart.position.set(...C);
  put(heart, box(0.26, 0.26, 0.26), core, [0, 0, 0], [0.62, 0.79, 0]);
  throb(glowSprite(heart, [0, 0, 0], 1.4, r.accent), 0.7, 0.3);
  body.add(heart);
  spinners.push(heart);

  // Prisms orbiting it, slowly, and over it a gem of the fourth colour.
  const orbit = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    const at: V = [Math.cos(a) * 1.3, (k % 2 ? 0.3 : -0.3), Math.sin(a) * 1.3];
    put(orbit, new THREE.CylinderGeometry(0.11, 0.11, 0.42, 3), k % 2 ? edges[k % 4] : facet, at, [0.4 * (k % 2 ? 1 : -1), a, 0.6]);
    put(orbit, new THREE.OctahedronGeometry(0.05), core, [Math.cos(a + 0.52) * 1.3, 0, Math.sin(a + 0.52) * 1.3]);
  }
  put(orbit, new THREE.OctahedronGeometry(0.24), core, [0, H + 0.5, 0], [0, 0, 0], [1, 1.4, 1]);
  rod(orbit, [0, H + 0.16, 0], [0, H + 0.84, 0], 0.012, edges[0]);
  throb(glowSprite(orbit, [0, H + 0.5, 0], 0.9, r.accent), 1.2, 0.3);
  body.add(morph(orbit, (g, t) => {
    g.position.set(...C);
    g.rotation.y = t * 0.8;
  }));

  // No face: the kart view's head part is an empty mark at the cube's middle.
  const head = new THREE.Group();
  head.position.set(...C);
  body.add(head);

  const pads = [glowSprite(body, [0, 0.45, 0], 2.0, r.accent), glowSprite(body, [0, 0.3, 0], 1.1, 0xff4af0)];

  finish(body);
  return {
    body,
    wheels: [],
    exhausts: [new THREE.Vector3(-0.45, 1.15, -0.85), new THREE.Vector3(0.45, 1.15, -0.85)],
    rearTrack: 0.7,
    rearZ: -0.8,
    spinners,
    shadow: [2.8, 2.8],
    hover: { bob: 0.14, pads },
    head,
    flappers: [],
    sweepers,
  };
}

// ---- The Rat King: Infest the Rats' Nest's boss -----------------------------------
// "Satan points me to the rat's nest", "Hell's where they wanna be. Infest
// the rats' nest": what waits at the bottom of the nest is its king, a rat
// the size of a bear galloping on all fours, mangy and matted, scabbed and
// scarred, one ear torn, red eyes glowing, yellow chisel teeth bared under
// its whiskers, claws out, its long naked scaly tail lashing behind,
// crowned in twisted wire and bottle caps from the nest, its fur singed from
// Hell and smouldering, embers coming off its back.

export function ratKing(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const rnd = rng(61);
  const fur = matte(r.color, { shininess: 6 });
  const furDark = matte(0x2a221c, { shininess: 6 });
  const furGrey = matte(0x8a8076, { shininess: 6 });
  const skin = matte(0xb88480, { shininess: 30 });
  const skinDark = matte(0x7a4a48, { shininess: 30 });
  const raw = matte(0x8a5450, { shininess: 50 });
  const scab = matte(0x5a1410, { shininess: 70, specular: 0x803020 });
  const scar = matte(0xe0b0a8, { shininess: 40 });
  const tooth = matte(0xe8b02a, { shininess: 80, specular: 0xfff0a0 });
  const clawMat = matte(0x1a1410, { shininess: 70, specular: 0x887766 });
  const nose = matte(0xd06a7a, { shininess: 90 });
  const black = matte(0x050505, { shininess: 90 });
  const mouth = matte(0x2a0808);
  const eye = pulsing(glow(r.accent), 1.3, 0.45);
  const ember = pulsing(glow(0xff6a10), 1.6, 0.6);
  const singe = pulsing(glow(0xff8a2a), 0.9, 0.7, 1);
  const copper = matte(0xc06a30, { shininess: 90, specular: 0xffc080 });
  const wires = [copper, matte(0x2a6ad8, { shininess: 60 }), matte(0xd82a2a, { shininess: 60 }), matte(0xe8d82a, { shininess: 60 })];
  const capRed = matte(0xc81a1a, { shininess: 90, specular: 0xffffff });
  const tin = chrome();
  const whisker = matte(0xe8e0d0);

  // It gallops: hunched high at the haunch, the whole bulk rocking with the bound.
  const rat = new THREE.Group();
  rat.position.y = 1.0;
  rat.userData.bound = true;
  body.add(rat);
  const haunch: [V, V] = [[0, 0.22, -0.6], [0.7, 0.72, 0.95]];
  const mid: [V, V] = [[0, 0.08, -0.02], [0.6, 0.6, 0.75]];
  const chest: [V, V] = [[0, 0.02, 0.5], [0.54, 0.56, 0.72]];
  // Mange: bare raw patches where the fur's come out, scabbed over.
  const mange: [number, number, [V, V]][] = [[1.4, 0.3, haunch], [-2.2, 0.55, haunch], [-1.3, 0.1, chest], [1.1, 0.5, mid], [2.6, 0.2, haunch]];
  const bare = (part: [V, V]) => (a: number, e: number) => mange.every(([ma, me, c]) => c !== part || Math.hypot(Math.atan2(Math.sin(a - ma), Math.cos(a - ma)), e - me) > 0.42);
  for (const [c, rr] of [haunch, mid, chest]) put(rat, sph(1, 22, 16), fur, c, [0, 0, 0], rr);
  // Matted fur all over, in clumps leaning back, darker down the spine, grey round the belly.
  tufts(rat, ...haunch, 150, rnd, [fur, furDark, fur, furGrey], 0.2, 0.075, [0, -0.1, -1.6], bare(haunch));
  tufts(rat, ...mid, 80, rnd, [fur, furDark, furGrey], 0.18, 0.07, [0, -0.1, -1.6], bare(mid));
  tufts(rat, ...chest, 100, rnd, [fur, furDark, fur, furGrey], 0.18, 0.065, [0, -0.2, -1.4], bare(chest));
  for (const [a, e, [c, rr]] of mange) {
    const p = onBall(c, rr, a, e, 1.0);
    const n = normalAt(c, rr, p);
    for (const [d, w] of [[0, 1], [0.12, 0.7]]) {
      const q = onBall(c, rr, a + d, e - d * 0.8, 0.99);
      const m = put(rat, sph(0.2 * w, 10, 8), raw, q, [0, 0, 0], [1.2, 0.12, 0.85]);
      m.quaternion.setFromUnitVectors(UP, n);
    }
    for (let k = 0; k < 4; k++) {
      const q = onBall(c, rr, a + (rnd() - 0.5) * 0.4, e + (rnd() - 0.5) * 0.3, 1.03);
      put(rat, sph(0.05 + rnd() * 0.03, 6, 4), scab, q, [0, 0, 0], [1, 0.45, 1.2]);
    }
  }
  // Old scars clawed across its flanks and shoulder.
  for (const [c, rr, a, e] of [[...haunch, 1.9, 0.75], [...haunch, -1.9, 0.9], [...chest, 1.6, 0.6], [...haunch, 2.4, 0.5]] as [V, V, number, number][]) crack(rat, c, rr, a, e, 5, rnd, scar, 0.022, [0.1, -0.2]);
  // A ridge of spiky matted fur down the hunched spine, its tips singed and smouldering from Hell.
  for (let k = 0; k < 16; k++) {
    const z = 0.95 - k * 0.15;
    const c = z > 0.2 ? chest : z > -0.3 ? mid : haunch;
    const y = c[0][1] + c[1][1] * Math.sqrt(Math.max(0, 1 - ((z - c[0][2]) / c[1][2]) ** 2)) - 0.04;
    for (const x of [-0.07, 0.07]) prong(rat, [x, y, z], [x * 2.5, y + 0.16 + (k % 3) * 0.05, z - 0.32], 0.06, k % 2 ? furDark : fur, 4);
    if (k % 2 === 0 && k > 2) prong(rat, [0, y + 0.1, z - 0.12], [0, y + 0.24, z - 0.32], 0.03, singe, 4);
  }
  // Embers coming off its back.
  for (let k = 0; k < 9; k++) put(rat, new THREE.OctahedronGeometry(0.035), ember, [(rnd() - 0.5) * 0.9, 1.0 + rnd() * 0.4, -0.2 - rnd() * 1.1]);
  throb(glowSprite(rat, [0, 1.0, -0.6], 1.0, 0xff6a1a), 0.9, 0.3);
  // Bits of the nest snagged in its fur: a tangle of wire, a crushed can, a shred of plastic.
  line(rat, [[-0.55, 0.5, -0.9], [-0.7, 0.3, -1.1], [-0.6, 0.0, -1.2], [-0.75, -0.15, -0.95], [-0.62, 0.2, -0.7]], 0.014, wires[1], 3);
  line(rat, [[0.5, 0.65, -0.2], [0.68, 0.4, -0.35], [0.6, 0.15, -0.1], [0.72, 0.3, 0.1]], 0.014, wires[2], 3);
  put(rat, can(0.07, 0.07, 0.12, 8), tin, [0.62, 0.55, -1.05], [0.6, 0.2, 1.1], [1, 0.6, 1]);
  leaf(rat, [-0.45, 0.62, 0.35], [-0.3, -0.5, -1], [0.2, 0.01, 0.3], matte(0x3a8a8a, { side: THREE.DoubleSide }));

  // Four legs under it, a gallop: forelegs on the shoulder, hind legs on the haunch, each folding as it comes forward.
  const legs: THREE.Object3D[] = [];
  const paw = (parent: THREE.Object3D, at: V, long: number) => {
    put(parent, sph(0.14, 10, 8), skin, at, [0, 0, 0], [1, 0.45, long]);
    for (let t = -1.5; t <= 1.5; t++) {
      const toe: V = [at[0] + t * 0.065, at[1] - 0.01, at[2] + 0.12 * long];
      put(parent, sph(0.04, 6, 4), skin, toe, [0, 0, 0], [1, 0.8, 1.3]);
      prong(parent, toe, [toe[0] + t * 0.02, toe[1] - 0.07, toe[2] + 0.13], 0.022, clawMat, 4);
    }
  };
  const leg = (side: number, front: boolean, phase: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (front ? 0.4 : 0.52), front ? -0.05 : 0.0, front ? 0.62 : -0.62);
    pivot.userData = { side, phase, gallop: true };
    const knee: V = front ? [side * 0.04, -0.48, -0.06] : [side * 0.05, -0.45, 0.22];
    if (front) {
      put(pivot, sph(0.24, 12, 10), fur, [side * 0.02, -0.08, 0], [0, 0, 0], [1, 1.3, 1]);
      rod(pivot, [0, -0.1, 0], knee, 0.16, fur, 0.11);
      tufts(pivot, [side * 0.03, -0.25, -0.03], [0.17, 0.25, 0.17], 12, rnd, [fur, furDark, furGrey], 0.14, 0.04, [0, -0.4, -0.6]);
    } else {
      // The great hind thigh, the haunch's muscle swinging with it.
      put(pivot, sph(0.34, 14, 10), fur, [side * 0.04, -0.12, 0.05], [0, 0, 0], [1, 1.25, 1.2]);
      rod(pivot, [side * 0.04, -0.2, 0.08], knee, 0.18, fur, 0.12);
      tufts(pivot, [side * 0.05, -0.15, 0.05], [0.3, 0.38, 0.36], 22, rnd, [fur, furDark, fur], 0.16, 0.05, [0, -0.3, -0.7]);
    }
    const lower = new THREE.Group();
    lower.position.set(...knee);
    put(lower, sph(0.1, 8, 6), fur, [0, 0, 0]);
    if (front) {
      rod(lower, [0, 0, 0], [0, -0.38, 0.04], 0.1, furDark, 0.07);
      paw(lower, [0, -0.44, 0.1], 1.3);
    } else {
      // A long hind foot: down to the hock, then laid along the ground.
      const hock: V = [0, -0.28, -0.24];
      rod(lower, [0, 0, 0], hock, 0.12, fur, 0.07);
      put(lower, sph(0.07, 8, 6), skinDark, hock);
      rod(lower, hock, [0, -0.47, 0.1], 0.065, skin, 0.06);
      paw(lower, [0, -0.5, 0.2], 1.8);
    }
    pivot.add(lower);
    pivot.userData.lower = lower;
    rat.add(pivot);
    legs.push(pivot);
  };
  leg(-1, true, 0);
  leg(1, true, 0.7);
  leg(-1, false, Math.PI);
  leg(1, false, Math.PI + 0.7);

  // The tail: long, naked and scaly, ringed all down it, tapering to a whip, scabbed, lashing as it runs.
  const tail = new THREE.Group();
  tail.position.set(0, 0.25, -1.38);
  rat.add(tail);
  const tailCurve = new THREE.CatmullRomCurve3(([[0, 0, 0], [0, -0.12, -0.45], [0.12, -0.4, -0.95], [-0.08, -0.62, -1.4], [0.1, -0.68, -1.8], [0.22, -0.6, -2.05]] as V[]).map((p) => new THREE.Vector3(...p)));
  const N = 16;
  for (let k = 0; k < N; k++) {
    const a = tailCurve.getPoint(k / N);
    const b = tailCurve.getPoint((k + 1) / N);
    const ra = 0.13 * (1 - k / N) + 0.015;
    const rb = 0.13 * (1 - (k + 1) / N) + 0.015;
    rod(tail, a.toArray() as V, b.toArray() as V, ra, k % 5 === 2 ? skinDark : skin, rb);
    if (k < N - 2) put(tail, hoop(ra * 1.02, 0.008, TAU, 10), skinDark, a.toArray() as V).quaternion.setFromUnitVectors(Z, tailCurve.getTangent(k / N));
  }
  tufts(tail, [0, -0.02, -0.1], [0.15, 0.15, 0.2], 10, rnd, [fur, furDark], 0.14, 0.045, [0, 0, -0.8]);
  for (const t of [0.3, 0.55]) put(tail, sph(0.035, 6, 4), scab, tailCurve.getPoint(t).add(new THREE.Vector3(0, 0.1 * (1 - t), 0)).toArray() as V, [0, 0, 0], [1.2, 0.5, 1.6]);

  // The head: a long wedge of a skull, low and thrust forward, a twitching pink nose, whiskers fanned out, beady red eyes, one ear torn half away.
  const head = new THREE.Group();
  head.position.set(0, 0.2, 1.12);
  rat.add(head);
  const hc: V = [0, 0.05, 0];
  const hr: V = [0.36, 0.32, 0.4];
  put(head, sph(1, 18, 14), fur, hc, [0, 0, 0], hr);
  put(head, sph(1, 16, 12), fur, [0, -0.06, 0.42], [0, 0, 0], [0.24, 0.22, 0.5]);
  put(head, sph(1, 10, 8), skin, [0, -0.04, 0.88], [0, 0, 0], [0.09, 0.08, 0.06]);
  for (const side of [-1, 1]) put(head, sph(0.018, 5, 3), black, [side * 0.035, -0.06, 0.93]);
  put(head, sph(0.075, 10, 8), nose, [0, -0.0, 0.9], [0, 0, 0], [1.1, 0.8, 0.8]);
  tufts(head, hc, hr, 40, rnd, [fur, furDark, furGrey], 0.16, 0.045, [0, 0.1, -0.8], (a) => Math.cos(a) < 0.55);
  tufts(head, [0, -0.06, 0.42], [0.24, 0.22, 0.5], 18, rnd, [fur, furGrey], 0.08, 0.025, [0, 0, -0.9], (a, e) => Math.cos(a) < 0.85 && e > -0.3);
  // A snarl: the lips drawn back off two long yellow chisel teeth above and two below, the mouth dark behind.
  put(head, box(0.2, 0.1, 0.3), mouth, [0, -0.2, 0.62]);
  put(head, sph(0.12, 8, 6), skinDark, [0, -0.15, 0.72], [0, 0, 0], [1.1, 0.35, 1.2]);
  for (const side of [-1, 1]) {
    put(head, box(0.055, 0.24, 0.045), tooth, [side * 0.03, -0.24, 0.8], [0.15, 0, 0]);
    put(head, box(0.05, 0.17, 0.04), tooth, [side * 0.027, -0.28, 0.7], [-0.35, 0, 0]);
  }
  put(head, sph(0.12, 8, 6), fur, [0, -0.33, 0.6], [0, 0, 0], [1, 0.4, 1.3]);
  // Whiskers fanned out from the snout, five a side.
  for (const side of [-1, 1]) for (let k = 0; k < 5; k++) {
    const s: V = [side * 0.13, -0.06 + k * 0.025, 0.74 - k * 0.03];
    const tip: V = [side * (0.75 + k * 0.06), -0.2 + k * 0.1, 0.55 - k * 0.12];
    line(head, [s, [(s[0] + tip[0]) / 2, (s[1] + tip[1]) / 2 + 0.03, (s[2] + tip[2]) / 2], tip], 0.006, whisker, 3);
  }
  // Beady red eyes, glaring, under a heavy brow.
  for (const side of [-1, 1]) {
    put(head, sph(0.085, 12, 10), eye, [side * 0.2, 0.13, 0.3]);
    put(head, sph(0.03, 6, 4), black, [side * 0.21, 0.13, 0.38]);
    glowSprite(head, [side * 0.21, 0.13, 0.38], 0.5, r.accent);
    put(head, box(0.2, 0.05, 0.1), furDark, [side * 0.17, 0.24, 0.31], [0.2, 0, side * 0.45]);
  }
  // The ears: round and naked, pink inside. The left one torn, a bite out of it, scabbed at the edge.
  for (const side of [-1, 1]) {
    const torn = side < 0;
    const at: V = [side * 0.27, 0.36, -0.08];
    const g = new THREE.CylinderGeometry(0.2, 0.2, 0.03, 18, 1, false, torn ? 0.9 : 0, torn ? TAU * 0.68 : TAU);
    put(head, g, skinDark, at, [Math.PI / 2 - 0.3, 0, -side * 0.45]);
    const gi = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 16, 1, false, torn ? 0.9 : 0, torn ? TAU * 0.68 : TAU);
    put(head, gi, skin, [at[0], at[1], at[2] + 0.02], [Math.PI / 2 - 0.3, 0, -side * 0.45]);
    if (torn) for (let k = 0; k < 3; k++) put(head, sph(0.025, 6, 4), scab, [at[0] + 0.03 + k * 0.05, at[1] + 0.1 - k * 0.06, at[2] + 0.02]);
  }
  // The crown of the nest: twisted wire round its head, its points tipped with bottle caps.
  put(head, hoop(0.22, 0.022, TAU, 18), copper, [0, 0.36, -0.02], [Math.PI / 2 + 0.15, 0, 0]);
  put(head, hoop(0.23, 0.014, TAU, 18), wires[1], [0, 0.38, -0.02], [Math.PI / 2 + 0.1, 0.1, 0.05]);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU + 0.2;
    const base: V = [Math.cos(a) * 0.22, 0.36 - Math.sin(a) * 0.03, -0.02 + Math.sin(a) * 0.22];
    const tip: V = [Math.cos(a) * 0.3, 0.62 + (k % 2) * 0.08, -0.02 + Math.sin(a) * 0.3];
    line(head, [base, [(base[0] + tip[0]) / 2 + 0.03, (base[1] + tip[1]) / 2, (base[2] + tip[2]) / 2], tip], 0.016, wires[k % wires.length], 3);
    put(head, can(0.06, 0.06, 0.025, 10), k % 3 ? capRed : tin, tip, [0.3 * Math.sin(a), 0, 0.3 * Math.cos(a)]);
    put(head, hoop(0.06, 0.01, TAU, 10), tin, [tip[0], tip[1] - 0.012, tip[2]], [Math.PI / 2 + 0.3 * Math.sin(a), 0, 0.3 * Math.cos(a)]);
  }

  finish(body);
  return {
    body,
    wheels: [],
    exhausts: [new THREE.Vector3(-0.45, 0.35, -1.25), new THREE.Vector3(0.45, 0.35, -1.25)],
    rearTrack: 0.9,
    rearZ: -1.1,
    spinners: [],
    shadow: [2.6, 4.2],
    head,
    legs,
    sway: rat,
    tail,
  };
}

// ---- The Mother of the Coven: PetroDragonic Apocalypse's boss ---------------------
// "Antlers shed ribbons of blood, draped like thorns upon the brow",
// "chanting songs above the lyre", "I've laid the altar, charged the
// crystals, the circle I have blessed", "I am cat, black", "lizard and bat
// take wing in the night": a tall gaunt witch in a ragged robe stitched with
// glowing runes, chanting, blood running from a crown of thorns, great
// antlers hung with red ribbons, a bat hung from them, a lyre in her hand,
// flying low over the road astride a long gnarled broomstick, its bristles
// bound with cord and smouldering, her charged crystals hung on cords all
// along it, swinging and glowing, a black cat riding the tail, the
// blood-moon at her raised hand.

export function covenMother(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const oak = matte(0xffffff, { map: tex('wood', woodTexture), color: 0xb08a6a });
  const knot = matte(0x4a2a14);
  const straw = matte(0xc8a050, { shininess: 6 });
  const strawDark = matte(0x8a6a2a, { shininess: 6 });
  const robe = matte(r.color, { shininess: 15 });
  const robeDark = matte(0x1a0e26);
  const robeOpen = matte(r.color, { shininess: 15, side: THREE.DoubleSide });
  const veil = matte(0x1a1420, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const skin = matte(0xe8ddd0);
  const hollow = matte(0x9a8a90);
  const antler = matte(0xe0ccaa, { shininess: 20 });
  const ribbon = matte(r.accent, { side: THREE.DoubleSide, emissive: 0x3a0606 });
  const blood = matte(0x8a0a12, { shininess: 90, specular: 0xff6a6a });
  const thorn = matte(0x2a1a10);
  const rune = pulsing(glow(r.accent), 0.5, 0.6);
  const ember = pulsing(glow(0xff6a1a), 1.7, 0.6);
  const gold = brass();
  const silver = chrome();
  const catFur = matte(0x101014, { shininess: 30, specular: 0x333344 });
  const catEye = pulsing(glow(0x7aff3a), 1.1, 0.6);
  const bone = matte(0xece2c8);
  const black = matte(0x050505);
  const eyeMat = pulsing(glow(r.accent), 0.9, 0.5);
  const cordMat = matte(0x3a2a1a);
  const scab = matte(0x8a1010);
  const lips = matte(0x5a1020);

  // The broomstick: long and gnarled, knotted and twig-stubbed, its nose curling up, a metre off the road.
  const Y = 1.0;
  const shaft: V[] = [[0, Y - 0.02, -1.15], [0.03, Y + 0.02, -0.6], [-0.02, Y, 0], [0.03, Y + 0.03, 0.6], [-0.01, Y + 0.05, 1.1], [0.0, Y + 0.14, 1.42], [0.0, Y + 0.28, 1.5]];
  tube(body, shaft, 0.06, oak);
  put(body, sph(0.06, 8, 6), oak, shaft[shaft.length - 1], [0, 0, 0], [1, 1.2, 1]);
  const along = new THREE.CatmullRomCurve3(shaft.map((p) => new THREE.Vector3(...p)));
  const gn = rng(81);
  for (let k = 0; k < 9; k++) {
    const p = along.getPoint(0.06 + k * 0.1);
    const a = gn() * TAU;
    put(body, sph(0.065, 8, 6), oak, [p.x + Math.cos(a) * 0.02, p.y + Math.sin(a) * 0.02, p.z], [0, 0, a], [1, 0.8, 1.6]);
    put(body, hoop(0.04, 0.01, TAU, 8), knot, [p.x + Math.cos(a) * 0.06, p.y + Math.sin(a) * 0.06, p.z], [0, Math.PI / 2, 0]);
    if (k % 3 === 1) prong(body, [p.x, p.y, p.z], [p.x + Math.cos(a) * 0.14, p.y + Math.sin(a) * 0.14, p.z + 0.08], 0.022, oak, 5);
  }
  // A silver band at the grip and another at the nose.
  for (const t of [0.66, 0.9]) {
    const p = along.getPoint(t);
    put(body, hoop(0.055, 0.014, TAU, 12), silver, [p.x, p.y, p.z]);
  }

  // The brush at the back: bound three times with cord, the bristles splayed out behind, some of them smouldering.
  const bz = -1.1;
  put(body, can(0.09, 0.07, 0.3, 10), strawDark, [0, Y - 0.02, bz - 0.12], [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 3; k++) put(body, hoop(0.095 + k * 0.006, 0.018, TAU, 12), cordMat, [0, Y - 0.02, bz - 0.04 - k * 0.1]);
  const br = rng(83);
  const smoulder: V[] = [];
  for (let k = 0; k < 44; k++) {
    const a = (k / 44) * TAU + br() * 0.2;
    const ring0 = 0.05 + (k % 3) * 0.02;
    const spread = 0.2 + br() * 0.16;
    const len = 0.7 + br() * 0.25;
    const tip: V = [Math.cos(a) * spread, Y - 0.04 + Math.sin(a) * spread * 0.85 - 0.04, bz - 0.25 - len];
    prong(body, [Math.cos(a) * ring0, Y - 0.02 + Math.sin(a) * ring0, bz - 0.2], tip, 0.03, k % 3 ? straw : strawDark, 4);
    if (k % 5 === 0) smoulder.push(tip);
  }
  for (const p of smoulder) put(body, new THREE.OctahedronGeometry(0.03), ember, [p[0], p[1], p[2] + 0.02]);
  throb(glowSprite(body, [0, Y - 0.05, bz - 0.95], 0.8, 0xff6a1a), 1.7, 0.35);

  // Her charged crystals: amethyst, quartz, rose, citrine, aqua and green, faceted, glowing and pulsing, hung on cords
  // and little silver caps from the shaft, swinging together as she flies.
  const crystalColors = [0x9a5aff, 0xe8f0ff, 0xff6aa8, 0xffc84a, 0x5ad8ff, 0x7aff9a];
  const crystalMats = crystalColors.map((c, k) => pulsing(new THREE.MeshPhongMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.55), shininess: 120, specular: 0xffffff, flatShading: true, transparent: true, opacity: 0.92 }), 0.6 + k * 0.13, 0.55, k * 1.3));
  const prism = can(0.05, 0.05, 0.14, 6);
  const point = spike(0.05, 0.11, 6);
  const crown = spike(0.05, 0.05, 6);
  const flappers: THREE.Object3D[] = [];
  // Four ahead of her knees, one behind her skirt, two off the cord binding the brush (where the chase camera sees them): z, x, cord, size.
  const hung: [number, number, number, number][] = [
    [1.3, 0, 0.16, 1.2],
    [1.08, 0, 0.24, 1.45],
    [0.88, 0, 0.14, 1.25],
    [0.68, 0, 0.26, 1.4],
    [-0.66, 0, 0.2, 1.3],
    [-1.16, -0.12, 0.16, 1.3],
    [-1.16, 0.12, 0.26, 1.45],
  ];
  hung.forEach(([z, x, len, s], k) => {
    const p = along.getPointAt(Math.min(1, Math.max(0, (z + 1.15) / 2.75)));
    const pivot = new THREE.Group();
    pivot.position.set(p.x + x, p.y - (x ? 0.1 : 0.045), z);
    pivot.userData.side = 1;
    const hang = new THREE.Group();
    // The kart view swings it 0.12 rad off true on average: hang it that much back, so it swings about straight down.
    hang.rotation.z = -0.12;
    pivot.add(hang);
    line(hang, [[0, 0, 0], [0, -len * 0.5, 0.01], [0, -len, 0]], 0.006, cordMat, 3);
    put(hang, sph(0.025, 6, 4), silver, [0, -len - 0.01, 0], [0, 0, 0], [1, 0.7, 1]);
    const mat = crystalMats[k % crystalMats.length];
    const c: V = [0, -len - 0.1 * s, 0];
    put(hang, crown, mat, [c[0], c[1] + 0.095 * s, 0], [0, k * 0.4, 0], [s, s, s]);
    put(hang, prism, mat, c, [0, k * 0.4, 0], [s, s, s]);
    put(hang, point, mat, [c[0], c[1] - 0.125 * s, 0], [Math.PI, k * 0.4, 0], [s, s, s]);
    throb(glowSprite(hang, c, 0.42 * s, crystalColors[k % crystalColors.length]), 0.6 + k * 0.13, 0.3, k * 1.3);
    body.add(pivot);
    flappers.push(pivot);
  });

  // The black cat riding the broom's tail, sat up, its eyes green fire, its tail flicking.
  const cat: V = [0, Y + 0.04, -0.92];
  put(body, sph(0.1, 10, 8), catFur, [cat[0], cat[1] + 0.1, cat[2]], [0, 0, 0], [0.9, 1.2, 1]);
  put(body, sph(0.07, 10, 8), catFur, [cat[0], cat[1] + 0.27, cat[2] + 0.03]);
  for (const s of [-1, 1]) {
    prong(body, [cat[0] + s * 0.035, cat[1] + 0.31, cat[2] + 0.02], [cat[0] + s * 0.05, cat[1] + 0.39, cat[2] + 0.02], 0.025, catFur, 4);
    put(body, sph(0.017, 6, 4), catEye, [cat[0] + s * 0.027, cat[1] + 0.285, cat[2] + 0.09], [0, 0, 0], [1, 0.7, 0.5]);
    put(body, box(0.005, 0.02, 0.005), black, [cat[0] + s * 0.027, cat[1] + 0.285, cat[2] + 0.098]);
    put(body, sph(0.03, 6, 4), catFur, [cat[0] + s * 0.05, cat[1] + 0.01, cat[2] + 0.07]);
  }
  const sweepers: THREE.Object3D[] = [];
  const catTail = new THREE.Group();
  catTail.position.set(cat[0], cat[1] + 0.03, cat[2] - 0.08);
  catTail.userData.phase = 1;
  line(catTail, [[0, 0, 0], [0.05, 0.02, -0.12], [0.08, 0.15, -0.16], [0.04, 0.27, -0.12]], 0.018, catFur, 5);
  body.add(catTail);
  sweepers.push(catTail);

  // Her: tall and gaunt in a ragged robe stitched with runes, sat astride the broom, the skirt draped over it and blown
  // back in tatters, the toes of her boots poking out in front.
  const witch = new THREE.Group();
  witch.position.set(0, Y + 0.02, 0.05);
  witch.rotation.x = 0.08;
  witch.scale.setScalar(1.0);
  body.add(witch);
  const skirt = new THREE.Group();
  skirt.position.set(0, 0.12, -0.05);
  skirt.rotation.x = 0.35;
  witch.add(skirt);
  put(skirt, cyl(0.24, 0.46, 0.66, 20), robeOpen, [0, -0.27, 0]);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    put(skirt, box(0.04, 0.66, 0.02), robeDark, [Math.cos(a) * 0.365, -0.3, Math.sin(a) * 0.365], [0, -a + Math.PI / 2, Math.cos(a) * 0.32]);
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    prong(skirt, [Math.cos(a) * 0.44, -0.55, Math.sin(a) * 0.44], [Math.cos(a) * 0.52, -0.72 - (k % 3) * 0.05, Math.sin(a) * 0.52], 0.07, k % 2 ? robe : robeDark, 3);
  }
  for (const s of [-1, 1]) {
    put(witch, sph(0.06, 8, 6), black, [s * 0.16, -0.5, 0.42], [0, 0, 0], [0.8, 0.7, 1.6]);
    prong(witch, [s * 0.16, -0.5, 0.5], [s * 0.17, -0.42, 0.66], 0.04, black, 5);
  }
  // The body above the broom.
  put(witch, cyl(0.2, 0.3, 0.7, 20), robe, [0, 0.35, 0]);
  for (let k = 0; k < 4; k++) {
    const y = 0.15 + k * 0.15;
    const z = 0.3 - (y / 0.7) * 0.1 + 0.01;
    put(witch, box(0.012, 0.09, 0.01), rune, [0, y, z], [-0.14, 0, 0]);
    put(witch, box(0.05, 0.012, 0.01), rune, [0, y + (k % 2 ? 0.03 : -0.02), z + 0.005], [-0.14, 0, (k % 3) * 0.6 - 0.6]);
    put(witch, box(0.012, 0.09, 0.01), rune, [0, y + 0.03, -z], [0.14, 0, 0]);
    put(witch, box(0.06, 0.012, 0.01), rune, [0, y + 0.05 - (k % 2) * 0.05, -z - 0.005], [0.14, 0, (k % 3) * 0.7 - 0.7]);
    put(witch, box(0.03, 0.012, 0.01), rune, [k % 2 ? 0.02 : -0.02, y - 0.035, -z], [0.14, 0, 0.8]);
  }
  // Runes round the skirt's back too, where the chase camera sees them.
  for (let k = 0; k < 5; k++) {
    const a = Math.PI * (1.25 + k * 0.125);
    put(skirt, box(0.014, 0.12, 0.01), rune, [Math.cos(a) * 0.41, -0.42, Math.sin(a) * 0.41], [0, -a + Math.PI / 2, 0]);
    put(skirt, box(0.07, 0.014, 0.01), rune, [Math.cos(a) * 0.41, -0.4 + (k % 2) * 0.04, Math.sin(a) * 0.41], [0, -a + Math.PI / 2, (k % 3) * 0.6 - 0.6]);
  }
  put(witch, ball(0.25, 14, 10), robe, [0, 0.7, 0], [0, 0, 0], [1.35, 0.6, 1]);
  put(witch, ring(0.22, 0.03), gold, [0, 0.63, 0.02], [Math.PI / 2, 0, 0]);
  // A cord belt hung with bones and charms; a necklace of teeth.
  put(witch, hoop(0.3, 0.018, TAU, 18), cordMat, [0, 0.12, 0], [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 5; k++) {
    const a = 0.6 + k * 0.5;
    const at: V = [Math.cos(a) * 0.31, 0.1, Math.sin(a) * 0.31];
    line(witch, [at, [at[0] * 1.05, at[1] - 0.1, at[2] * 1.05]], 0.006, cordMat, 3);
    put(witch, k % 2 ? can(0.015, 0.015, 0.08, 5) : sph(0.03, 6, 4), k % 2 ? bone : gold, [at[0] * 1.06, at[1] - 0.14, at[2] * 1.06]);
  }
  for (let k = 0; k < 9; k++) {
    const a = Math.PI * 0.2 + (k / 8) * Math.PI * 0.6;
    const p: V = [Math.cos(a) * 0.2, 0.75 - Math.sin(a) * 0.1, Math.sin(a) * 0.24];
    prong(witch, p, [p[0], p[1] - 0.06, p[2] + 0.01], 0.012, bone, 4);
  }
  // One arm raised to the moon, the other holding the lyre, its strings glowing.
  arm(witch, [0.3, 0.7, 0], [0.55, 1.33, 0.15], 0.07, robe, skin);
  for (let k = 0; k < 4; k++) prong(witch, [0.55 + (k - 1.5) * 0.03, 1.38, 0.15], [0.55 + (k - 1.5) * 0.05, 1.5, 0.17], 0.012, skin, 4);
  throb(glowSprite(witch, [0.56, 1.43, 0.15], 0.5, r.accent), 0.5, 0.35);
  arm(witch, [-0.3, 0.7, 0], [-0.5, 0.38, 0.36], 0.07, robe, skin);
  const lyre = new THREE.Group();
  lyre.position.set(-0.52, 0.48, 0.4);
  lyre.rotation.set(0, 0.3, 0.15);
  tube(lyre, [[-0.12, -0.15, 0], [-0.18, 0.05, 0], [-0.1, 0.25, 0], [-0.16, 0.38, 0]], 0.025, gold);
  tube(lyre, [[0.12, -0.15, 0], [0.18, 0.05, 0], [0.1, 0.25, 0], [0.16, 0.38, 0]], 0.025, gold);
  for (const s of [-1, 1]) put(lyre, sph(0.03, 6, 4), gold, [s * 0.16, 0.39, 0]);
  put(lyre, box(0.34, 0.03, 0.03), gold, [0, 0.3, 0]);
  put(lyre, box(0.28, 0.06, 0.05), oak, [0, -0.16, 0]);
  const strings = pulsing(glow(0xfff4d0), 1.5, 0.5);
  for (let k = 0; k < 5; k++) rod(lyre, [-0.08 + k * 0.04, -0.13, 0.01], [-0.08 + k * 0.04, 0.29, 0.01], 0.004, strings);
  witch.add(lyre);

  // The blood-moon, small, up by her raised hand: off the line the camera looks down past her.
  const moon: V = [0.78, 1.62, 0.05];
  put(witch, ball(0.2, 16, 12), pulsing(glow(0xd02a2a), 0.3, 0.3), moon);
  for (let k = 0; k < 5; k++) put(witch, sph(0.035 + (k % 2) * 0.02, 6, 4), scab, onBall(moon, [0.2, 0.2, 0.2], 0.3 + k * 0.4, -0.5 + k * 0.3, 0.92), [0, 0, 0], [1, 1, 0.5]);
  throb(glowSprite(witch, moon, 0.9, 0xff3a3a), 0.3, 0.2);

  // The head: pale and gaunt, hollow-cheeked, glowing eyes, her mouth open in the chant, blood running from a crown of thorns, under a veil of long dark hair, crowned with great antlers hung with red ribbons.
  const head = new THREE.Group();
  head.position.set(0, 1.0, 0.02);
  put(head, sph(0.2, 18, 14), skin, [0, 0, 0], [0, 0, 0], [0.88, 1.1, 0.95]);
  for (const side of [-1, 1]) {
    put(head, sph(0.045, 8, 6), hollow, [side * 0.1, -0.06, 0.13], [0, 0, 0], [0.7, 1.3, 0.5]);
    put(head, sph(0.05, 8, 6), black, [side * 0.07, 0.03, 0.15], [0, 0, 0], [1.1, 0.8, 0.5]);
    put(head, sph(0.03, 8, 6), eyeMat, [side * 0.07, 0.03, 0.17]);
    glowSprite(head, [side * 0.07, 0.03, 0.2], 0.2, r.accent);
    put(head, box(0.07, 0.012, 0.015), hollow, [side * 0.075, 0.08, 0.17], [0, 0, side * 0.3]);
    line(head, [[side * 0.06, 0.2, 0.15], [side * 0.075, 0.12, 0.18], [side * 0.08, -0.02, 0.18], [side * 0.085, -0.1, 0.16]], 0.007, blood, 3);
  }
  put(head, sph(0.025, 6, 4), skin, [0, -0.02, 0.19], [0, 0, 0], [0.8, 1.2, 1]);
  put(head, sph(0.04, 8, 6), black, [0, -0.11, 0.16], [0, 0, 0], [1, 1.2, 0.5]);
  put(head, hoop(0.04, 0.008, TAU, 10), lips, [0, -0.11, 0.165], [0, 0, 0], [1, 1.2, 1]);
  // The crown of thorns round her brow.
  put(head, hoop(0.17, 0.014, TAU, 16), thorn, [0, 0.14, 0], [Math.PI / 2 - 0.1, 0, 0], [1, 1.05, 1]);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    const p: V = [Math.sin(a) * 0.17, 0.14 + Math.cos(a) * 0.017, Math.cos(a) * 0.18];
    prong(head, p, [p[0] * 1.35, p[1] + (k % 2 ? 0.05 : -0.03), p[2] * 1.35], 0.01, thorn, 3);
  }
  // The hair: a long dark veil falling from the crown down past the shoulders, streaming back.
  put(head, new THREE.SphereGeometry(0.23, 24, 14, Math.PI * 0.15, Math.PI * 1.7, 0, Math.PI * 0.6), veil, [0, 0.02, -0.01], [0, Math.PI, 0]);
  put(head, new THREE.CylinderGeometry(0.22, 0.4, 0.9, 20, 1, true, Math.PI * 0.65, Math.PI * 0.7), veil, [0, -0.36, -0.14], [0.35, 0, 0]);
  // The antlers: great branching racks, the tines curving up, red ribbons hanging from them dripping blood, a bat hung asleep from one.
  const rack = new THREE.Group();
  rack.scale.setScalar(0.7);
  head.add(rack);
  for (const side of [-1, 1]) {
    const beam: V[] = [[side * 0.12, 0.15, 0], [side * 0.35, 0.35, -0.05], [side * 0.55, 0.65, -0.1], [side * 0.62, 0.98, -0.05], [side * 0.55, 1.22, 0.02]];
    tube(rack, beam, 0.035, antler);
    put(rack, hoop(0.05, 0.02, TAU, 10), antler, beam[0], [Math.PI / 2, 0, 0]);
    for (const [i, len] of [[1, 0.25], [2, 0.3], [3, 0.22]] as const) {
      const b = beam[i];
      horn(rack, [b, [b[0] + side * 0.05, b[1] + len * 0.6, b[2] + 0.12], [b[0] - side * 0.02, b[1] + len, b[2] + 0.15]], 0.022, antler);
    }
    horn(rack, [beam[1], [beam[1][0] - side * 0.05, beam[1][1] + 0.2, beam[1][2] + 0.15], [beam[1][0] - side * 0.12, beam[1][1] + 0.3, beam[1][2] + 0.2]], 0.02, antler);
    // Ribbons: long strips hung from the tines, twisting, a drop of blood at the end of each.
    for (const [i, len] of [[1, 0.7], [2, 0.9], [3, 0.6], [4, 0.5]] as const) {
      const b = beam[i];
      put(rack, new THREE.PlaneGeometry(0.05, len), ribbon, [b[0] + side * 0.02, b[1] - len / 2, b[2]], [0, side * 0.6 + i * 0.3, side * 0.06]);
      put(rack, sph(0.022, 6, 4), blood, [b[0] + side * 0.02 + Math.sin(side * 0.06) * len, b[1] - len - 0.02, b[2]], [0, 0, 0], [0.8, 1.6, 0.8]);
      put(rack, hoop(0.03, 0.01, TAU, 8), ribbon, [b[0], b[1] - 0.01, b[2]], [Math.PI / 2, 0, 0]);
    }
  }
  const bat: V = [0.55 * 0.7, 0.48 * 0.7, -0.08];
  put(head, sph(0.04, 8, 6), catFur, [bat[0], bat[1] - 0.05, bat[2]], [0, 0, 0], [0.9, 1.4, 0.9]);
  put(head, sph(0.025, 6, 4), catFur, [bat[0], bat[1] - 0.12, bat[2] + 0.01]);
  for (const s of [-1, 1]) {
    tri(head, [bat[0], bat[1] - 0.01, bat[2]], [bat[0] + s * 0.06, bat[1] - 0.04, bat[2] + 0.02], [bat[0] + s * 0.03, bat[1] - 0.12, bat[2] + 0.03], veil);
    prong(head, [bat[0] + s * 0.012, bat[1] - 0.13, bat[2] + 0.01], [bat[0] + s * 0.02, bat[1] - 0.17, bat[2] + 0.01], 0.008, catFur, 3);
  }
  witch.add(head);

  finish(body);
  return {
    body,
    wheels: [],
    // Boost fire out of the bristles.
    exhausts: [new THREE.Vector3(-0.12, Y - 0.05, -2.0), new THREE.Vector3(0.12, Y - 0.05, -2.0)],
    rearTrack: 0.5,
    rearZ: -1.2,
    spinners: [],
    // The broom's shadow on the road under her: long and narrow.
    shadow: [2.0, 3.8],
    // No pads: the broom holds her up, bobbing.
    hover: { bob: 0.1, pads: [] },
    head,
    flappers,
    sweepers,
  };
}
