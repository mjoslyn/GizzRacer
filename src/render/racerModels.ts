import * as THREE from 'three';
import type { RacerDef } from '../physics/racers';
import {
  beadTexture,
  flameDecalTexture,
  glowTexture,
  grilleTexture,
  keysTexture,
  scaleTexture,
  skyEnvMap,
  sparkleTexture,
  spotsTexture,
  stoneTexture,
  treadTexture,
  woodTexture,
  yikesTexture,
} from './textures';

/**
 * One original character and vehicle per racer. Not every one is a kart:
 * some fly, hover or roll on one wheel, but all drive with the same kart
 * physics. Everything is built in kart space: +z is forward, +y up, the
 * ground at y = 0.
 */

export interface WheelSpec {
  x: number;
  z: number;
  radius: number;
  width: number;
  front: boolean;
  material?: THREE.Material;
  /** An open hoop rather than a tire with a hub (a monowheel). */
  ring?: boolean;
}

export interface KartModel {
  /** Chassis and driver; tilts and bounces as one. */
  body: THREE.Group;
  wheels: WheelSpec[];
  /** Boost flame anchors in body space, pointing backwards. */
  exhausts: THREE.Vector3[];
  /** x positions of the rear contact patches, for drift sparks. */
  rearTrack: number;
  rearZ: number;
  /** Things that spin with speed about their z axis (fans). */
  spinners: THREE.Object3D[];
  shadow: [number, number];
  /** Rotors that spin flat about their y axis, fast even at rest. */
  rotors?: THREE.Object3D[];
  /** Flyers and hovercraft: no wheels touch the road, the body bobs, and the pads under it pulse. */
  hover?: { bob: number; pads: THREE.Object3D[] };
  /** The driver's head: leans into turns and looks where it's steering. Built unrotated. */
  head?: THREE.Object3D;
  /** Tread textures that roll with the wheels; v runs along the tread, `perMeter` repeats per meter. */
  treads?: { map: THREE.Texture; perMeter: number }[];
  /** Wings that beat about their z axis; `userData.side` is -1 or 1. Built unrotated. */
  flappers?: THREE.Object3D[];
  /** Moving-head lights that sweep side to side about their y axis. Built unrotated. */
  sweepers?: THREE.Object3D[];
}

let env: THREE.CubeTexture | null = null;
const cache = new Map<string, THREE.Texture>();
const tex = (key: string, make: () => THREE.Texture) => {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
};

const gloss = (color: number, extra: THREE.MeshPhongMaterialParameters = {}) =>
  new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x666666, envMap: (env ??= skyEnvMap()), reflectivity: 0.25, combine: THREE.MixOperation, ...extra });
const matte = (color: number, extra: THREE.MeshPhongMaterialParameters = {}) => new THREE.MeshPhongMaterial({ color, shininess: 12, specular: 0x111111, ...extra });
const chrome = () => new THREE.MeshPhongMaterial({ color: 0xd8dee8, shininess: 140, specular: 0xffffff, envMap: (env ??= skyEnvMap()), reflectivity: 0.75, combine: THREE.MixOperation });
const brass = () => gloss(0xd8a83a, { specular: 0xffe0a0, reflectivity: 0.4 });
const glow = (color: number) => new THREE.MeshBasicMaterial({ color });
const rubberMat = () => matte(0x1c1c1c);

/** Adds a mesh to `parent` at a position, with optional rotation and scale. */
function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  parent.add(m);
  return m;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const ball = (r: number, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt: number, rb: number, h: number, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r: number, h: number, seg = 12) => new THREE.ConeGeometry(r, h, seg);
const ring = (r: number, tube: number, arc = Math.PI * 2) => new THREE.TorusGeometry(r, tube, 8, 24, arc);

const UP = new THREE.Vector3(0, 1, 0);

/** A rod from `a` to `b` (a limb, a strut, a cable). */
function rod(parent: THREE.Object3D, a: [number, number, number], b: [number, number, number], r: number, mat: THREE.Material, rEnd = r): THREE.Mesh {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const m = new THREE.Mesh(cyl(rEnd, r, dir.length(), 8), mat);
  m.position.copy(va).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  parent.add(m);
  return m;
}

/** An arm from shoulder to grip, with a hand (or a claw) on the end. */
function arm(parent: THREE.Object3D, shoulder: [number, number, number], grip: [number, number, number], r: number, sleeve: THREE.Material, hand: THREE.Material): void {
  const elbow: [number, number, number] = [(shoulder[0] + grip[0]) / 2 + Math.sign(shoulder[0]) * 0.08, Math.min(shoulder[1], grip[1]) - 0.06, (shoulder[2] + grip[2]) / 2];
  rod(parent, shoulder, elbow, r, sleeve);
  put(parent, ball(r, 8, 6), sleeve, elbow);
  rod(parent, elbow, grip, r * 0.85, hand);
  put(parent, ball(r * 1.15, 10, 8), hand, grip);
}

/** Steering wheel on a column, tilted toward the driver; returns the two grip points. */
function steeringWheel(parent: THREE.Object3D, y: number, z: number, r = 0.2, mat: THREE.Material = matte(0x1a1a1a)): [[number, number, number], [number, number, number]] {
  const w = new THREE.Group();
  w.position.set(0, y, z);
  w.rotation.x = -0.9;
  put(w, ring(r, 0.03), mat, [0, 0, 0]);
  put(w, box(r * 2, 0.03, 0.03), mat, [0, 0, 0]);
  put(w, cyl(0.05, 0.05, 0.04, 10), chrome(), [0, 0.01, 0], [Math.PI / 2, 0, 0]);
  parent.add(w);
  rod(parent, [0, y - 0.05, z + 0.05], [0, y - 0.3, z + 0.4], 0.03, mat);
  const gy = y + Math.sin(0.9) * 0.02;
  return [
    [-r * 0.95, gy, z],
    [r * 0.95, gy, z],
  ];
}

/** Two eyes facing +z: white, iris, pupil, a glint. Pupils as slits for reptiles. */
function eyes(parent: THREE.Object3D, y: number, z: number, spread: number, size: number, iris: number, slit = false): void {
  for (const side of [-1, 1]) {
    put(parent, ball(size), matte(0xf8f4e0), [side * spread, y, z]);
    put(parent, ball(size * 0.62), glow(iris), [side * spread, y, z + size * 0.55]);
    put(parent, slit ? box(size * 0.18, size * 1.1, 0.02) : ball(size * 0.3), matte(0x050505), [side * spread, y, z + size * 0.92]);
    put(parent, ball(size * 0.14, 6, 4), glow(0xffffff), [side * spread + size * 0.25, y + size * 0.3, z + size * 0.95]);
  }
}

/** Heavy brows over a pair of eyes; `tilt` > 0 frowns. */
function brows(parent: THREE.Object3D, y: number, z: number, spread: number, w: number, mat: THREE.Material, tilt = 0.25): void {
  for (const side of [-1, 1]) put(parent, box(w, w * 0.25, w * 0.35), mat, [side * spread, y, z], [0, 0, side * tilt]);
}

/** Two rear exhaust pipes at (±x, y, z). */
function pipes(parent: THREE.Object3D, x: number, y: number, z: number, r = 0.11): THREE.Vector3[] {
  const mat = chrome();
  return [-1, 1].map((side) => {
    put(parent, cyl(r * 0.8, r, 0.6), mat, [side * x, y, z], [Math.PI / 2, 0, 0]);
    put(parent, ring(r * 0.8, r * 0.18), matte(0x222222), [side * x, y, z - 0.3]);
    return new THREE.Vector3(side * x, y, z - 0.35);
  });
}

/** A pair of glowing headlamps on the nose. */
function headlights(parent: THREE.Object3D, x: number, y: number, z: number, r = 0.09, color = 0xfff6c8): void {
  for (const side of [-1, 1]) {
    put(parent, cyl(r * 1.25, r * 1.25, 0.08, 12), chrome(), [side * x, y, z], [Math.PI / 2, 0, 0]);
    put(parent, ball(r, 10, 8), glow(color), [side * x, y, z + 0.03], [0, 0, 0], [1, 1, 0.5]);
  }
}

/** A flat decal on both flanks at |x| facing outward, `w` long by `h` tall. */
function sideDecal(parent: THREE.Object3D, map: THREE.Texture, x: number, y: number, z: number, w: number, h: number): void {
  const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const side of [-1, 1]) {
    // Flames lick backwards on both sides.
    put(parent, new THREE.PlaneGeometry(w, h), mat, [side * x, y, z], [0, side * (Math.PI / 2), 0], [side, 1, 1]);
  }
}

/** A soft glowing sprite, for hover pads and lamps. */
function glowSprite(parent: THREE.Object3D, pos: [number, number, number], size: number, color: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('glow', () => glowTexture()), color, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.position.set(...pos);
  s.scale.setScalar(size);
  parent.add(s);
  return s;
}

// ---- Lizard Warlock: lizard sorcerer in a hot rod ------------------------------

function lizardWarlock(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const paint = gloss(r.color);
  const trim = gloss(r.accent);
  const skin = matte(0xffffff, { map: tex('lizard', () => scaleTexture('#7fd36a', '#2c6a2a')) });
  const belly = matte(0xe8e0a0);
  const engine = chrome();

  // Hot rod tub, raked nose, rear wing.
  put(body, box(1.25, 0.3, 2.5), paint, [0, 0.42, -0.05]);
  put(body, box(0.9, 0.22, 0.9), paint, [0, 0.5, 1.2], [-0.12, 0, 0]);
  put(body, box(1.3, 0.06, 0.12), trim, [0, 0.58, -0.6]);
  put(body, box(0.85, 0.5, 0.22), matte(0x2a1a30), [0, 0.8, -0.65]);
  sideDecal(body, tex('flames', () => flameDecalTexture()), 0.63, 0.44, 0.1, 1.9, 0.42);
  for (const side of [-1, 1]) put(body, box(0.06, 0.45, 0.06), engine, [side * 0.5, 0.8, -1.2]);
  put(body, box(1.5, 0.05, 0.4), trim, [0, 1.05, -1.25], [0.15, 0, 0]);
  for (const side of [-1, 1]) put(body, box(0.04, 0.3, 0.45), trim, [side * 0.75, 1.0, -1.25]);
  // Chrome engine on the nose: block, blower with an intake scoop, headers down both sides.
  put(body, box(0.6, 0.35, 0.6), engine, [0, 0.75, 0.95]);
  put(body, box(0.45, 0.18, 0.4), trim, [0, 1.0, 0.95]);
  put(body, box(0.36, 0.14, 0.2), matte(0x161616), [0, 1.14, 1.05], [-0.3, 0, 0]);
  for (let k = 0; k < 4; k++) put(body, box(0.62, 0.02, 0.02), matte(0x666666), [0, 0.65 + k * 0.07, 1.26]);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) rod(body, [side * 0.3, 0.72, 0.8 + k * 0.15], [side * 0.62, 0.45, 0.6 + k * 0.15], 0.04, engine);
    rod(body, [side * 0.62, 0.42, 0.85], [side * 0.62, 0.42, -0.9], 0.06, engine);
    put(body, cyl(0.06, 0.08, 0.5), engine, [side * 0.38, 0.95, 0.75], [0.4, 0, side * 0.3]);
  }
  headlights(body, 0.36, 0.52, 1.66);

  // The warlock: scaled snout, frill, robe with flared sleeves, a starry hat, a tail over the back.
  const d = new THREE.Group();
  d.position.set(0, 0.6, -0.35);
  put(d, cyl(0.32, 0.42, 0.7), trim, [0, 0.45, 0]);
  put(d, box(0.22, 0.5, 0.04), belly, [0, 0.45, 0.33]);
  put(d, ring(0.34, 0.03), gloss(0xffe14d), [0, 0.2, 0], [Math.PI / 2, 0, 0]);
  put(d, new THREE.OctahedronGeometry(0.07), glow(0xc04bff), [0, 0.78, 0.33]);
  for (const [x, z, rx] of [[-0.25, 0.25, 0.8], [0.25, 0.25, 0.8]] as const) put(d, cyl(0.06, 0.12, 0.25, 8), skin, [x, 0.02, z], [rx, 0, 0]);
  const grips = steeringWheel(d, 0.6, 0.62, 0.2);
  for (const [k, side] of [-1, 1].entries()) {
    arm(d, [side * 0.33, 0.7, 0.05], grips[k], 0.07, trim, skin);
    put(d, cone(0.12, 0.2, 10), trim, [side * 0.27, 0.52, 0.42], [-Math.PI / 2 - 0.3, 0, 0]);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.15, -0.3);
  for (let k = 0; k < 7; k++) put(tail, ball(0.13 - k * 0.015, 10, 8), skin, [Math.sin(k * 0.7) * 0.15, 0.02 * k, -0.18 * k]);
  d.add(tail);

  const head = new THREE.Group();
  head.position.set(0, 1.08, 0.05);
  put(head, ball(0.3), skin, [0, 0, 0], [0, 0, 0], [1, 0.9, 1]);
  put(head, ball(0.22), skin, [0, -0.06, 0.3], [0, 0, 0], [0.9, 0.6, 1.3]);
  put(head, box(0.3, 0.02, 0.25), matte(0x2a0a0a), [0, -0.14, 0.38]);
  for (const side of [-1, 1]) put(head, ball(0.02, 6, 4), matte(0x0a0a0a), [side * 0.06, -0.02, 0.58]);
  // Forked tongue tasting the wind.
  put(head, box(0.03, 0.01, 0.2), matte(0xd0303a), [0, -0.12, 0.6]);
  for (const side of [-1, 1]) put(head, box(0.015, 0.01, 0.09), matte(0xd0303a), [side * 0.025, -0.12, 0.73], [0, side * 0.6, 0]);
  eyes(head, 0.1, 0.2, 0.16, 0.08, 0xffd23a, true);
  brows(head, 0.19, 0.22, 0.15, 0.14, skin, -0.3);
  for (let k = 0; k < 7; k++) {
    const a = ((k - 3) / 3) * 1.1;
    put(head, cone(0.06, 0.32, 6), matte(r.accent), [Math.sin(a) * 0.32, Math.cos(a) * 0.2 - 0.05, -0.12], [-0.6, 0, -a]);
  }
  put(head, cyl(0.42, 0.42, 0.04, 20), trim, [0, 0.24, 0]);
  put(head, cyl(0.25, 0.27, 0.08, 16), gloss(0xffe14d), [0, 0.3, -0.03]);
  const hat = put(head, cone(0.26, 0.7, 16), trim, [0, 0.6, -0.05], [-0.15, 0, 0]);
  for (let k = 0; k < 4; k++) put(hat, new THREE.OctahedronGeometry(0.05), glow(0xffe14d), [Math.sin(k * 1.7) * 0.15, -0.2 + k * 0.1, 0.12 + (k % 2) * 0.03]);
  put(hat, ring(0.06, 0.018, Math.PI * 1.3), glow(0xfff2a8), [0.08, -0.05, 0.2], [0, 0, 0.6]);
  put(hat, ball(0.05, 8, 6), glow(0xc04bff), [0, 0.36, 0]);
  d.add(head);
  body.add(d);

  return {
    body,
    wheels: [
      { x: 0.78, z: 0.95, radius: 0.32, width: 0.26, front: true },
      { x: -0.78, z: 0.95, radius: 0.32, width: 0.26, front: true },
      { x: 0.82, z: -0.85, radius: 0.46, width: 0.42, front: false },
      { x: -0.82, z: -0.85, radius: 0.46, width: 0.42, front: false },
    ],
    exhausts: pipes(body, 0.35, 0.55, -1.35),
    rearTrack: 0.82,
    rearZ: -0.95,
    spinners: [],
    shadow: [2.4, 3.3],
    head,
  };
}

// ---- Cyborg Gourmand: the Fishies robot in a kitchen cart------------------------

function cyborgGourmand(r: RacerDef): KartModel {
  const body = new THREE.Group();
  // Brushed steel rather than mirror chrome, so it reads as metal under any sky.
  const steel = gloss(r.color, { reflectivity: 0.12, shininess: 70, specular: 0x999999 });
  const paint = gloss(r.color);
  const red = gloss(r.accent);
  const dark = matte(0x222222);

  put(body, box(1.45, 0.55, 2.3), paint, [0, 0.62, 0]);
  put(body, box(1.2, 0.3, 0.2), steel, [0, 0.55, 1.2]);
  for (let k = 0; k < 5; k++) put(body, box(0.04, 0.24, 0.05), dark, [-0.4 + k * 0.2, 0.55, 1.31]);
  // Oven door on each flank with a window glowing from inside, rivets along the top.
  for (const side of [-1, 1]) {
    put(body, box(0.02, 0.36, 0.8), matte(0x2a2a2a), [side * 0.73, 0.6, 0.15]);
    put(body, box(0.03, 0.2, 0.55), glow(0xff8a3a), [side * 0.735, 0.62, 0.15]);
    put(body, box(0.05, 0.04, 0.5), steel, [side * 0.75, 0.84, 0.15]);
    for (let k = 0; k < 6; k++) put(body, ball(0.035, 6, 4), steel, [side * 0.73, 0.88, -0.9 + k * 0.36]);
    for (let k = 0; k < 3; k++) put(body, cyl(0.05, 0.05, 0.05, 10), red, [side * 0.74, 0.42, -0.6 + k * 0.18], [0, 0, Math.PI / 2]);
  }
  headlights(body, 0.45, 0.62, 1.16, 0.08, 0xffe4b0);
  // Stove top at the back: hot plate, pot with a ladle, chimney with a cap.
  put(body, box(1.2, 0.08, 0.7), matte(0x1c1c1c), [0, 0.93, -0.75]);
  put(body, cyl(0.2, 0.2, 0.04, 20), glow(0xff5a1a), [0.3, 0.98, -0.75]);
  for (let k = 1; k <= 2; k++) put(body, ring(0.07 * k, 0.012), matte(0x1c1c1c), [0.3, 1.0, -0.75], [Math.PI / 2, 0, 0]);
  put(body, cyl(0.2, 0.18, 0.3, 16), steel, [-0.3, 1.1, -0.75]);
  put(body, cyl(0.19, 0.19, 0.02, 16), matte(0xd8a040), [-0.3, 1.24, -0.75]);
  rod(body, [-0.3, 1.15, -0.75], [-0.18, 1.5, -0.85], 0.02, steel);
  put(body, cyl(0.12, 0.14, 0.9), matte(0x333333), [0.45, 1.35, -1.0]);
  put(body, cyl(0.17, 0.12, 0.12), matte(0x333333), [0.45, 1.84, -1.0]);
  put(body, cone(0.2, 0.12, 12), matte(0x333333), [0.45, 1.98, -1.0]);
  // Frying pan and a knife rack off the sides; salt and pepper on the dash.
  put(body, cyl(0.22, 0.2, 0.06, 16), dark, [-0.8, 0.85, 0.2], [0, 0, Math.PI / 2]);
  put(body, box(0.05, 0.05, 0.4), dark, [-0.8, 0.85, 0.55]);
  put(body, box(0.06, 0.12, 0.5), matte(0x6a4a2a), [0.78, 0.98, 0.0]);
  for (let k = 0; k < 4; k++) put(body, box(0.01, 0.22, 0.05), chrome(), [0.8, 1.12, -0.18 + k * 0.12]);
  put(body, cyl(0.04, 0.05, 0.12, 8), matte(0xf4f4f4), [-0.15, 0.95, 0.95]);
  put(body, cyl(0.04, 0.05, 0.12, 8), matte(0x2a2a2a), [0.15, 0.95, 0.95]);

  // The Fishing for Fishies robot: blue overalls stitched in yellow, a bucket hat, a rod over the shoulder.
  const d = new THREE.Group();
  d.position.set(0, 0.9, 0.15);
  const denim = matte(0x2d5cb8);
  const stitch = matte(0xf2c230);
  put(d, box(0.54, 0.5, 0.36), steel, [0, 0.34, 0]);
  put(d, box(0.6, 0.34, 0.42), denim, [0, 0.2, 0]);
  put(d, box(0.4, 0.26, 0.04), denim, [0, 0.46, 0.2]);
  for (const side of [-1, 1]) {
    // Straps over the shoulders, a button each, a pocket each side of the bib.
    put(d, box(0.08, 0.04, 0.4), denim, [side * 0.16, 0.6, 0], [0.15, 0, 0]);
    put(d, ball(0.03, 8, 6), stitch, [side * 0.15, 0.56, 0.22]);
    put(d, box(0.13, 0.1, 0.02), denim, [side * 0.12, 0.42, 0.225]);
    put(d, box(0.13, 0.012, 0.025), stitch, [side * 0.12, 0.47, 0.226]);
    put(d, box(0.012, 0.26, 0.025), stitch, [side * 0.18, 0.46, 0.226]);
  }
  put(d, box(0.36, 0.012, 0.025), stitch, [0, 0.335, 0.226]);
  for (const side of [-1, 1]) put(d, ball(0.1, 10, 8), steel, [side * 0.34, 0.52, 0], [0, 0, 0], [1, 0.8, 1]);
  const grips = steeringWheel(d, 0.32, 0.65, 0.2);
  arm(d, [-0.34, 0.5, 0.02], grips[0], 0.06, steel, dark);
  // The other hand holds a fishing rod up over the cart, the line trailing back.
  arm(d, [0.34, 0.5, 0.02], [0.55, 0.75, 0.25], 0.06, steel, dark);
  rod(d, [0.55, 0.68, 0.3], [0.58, 0.95, 0.2], 0.035, matte(0xc89a5a));
  rod(d, [0.58, 0.95, 0.2], [0.75, 2.1, -0.6], 0.015, matte(0x2a2a2a));
  put(d, cyl(0.05, 0.05, 0.05, 10), steel, [0.6, 0.86, 0.26], [0, 0, Math.PI / 2]);
  rod(d, [0.75, 2.1, -0.6], [0.8, 1.2, -1.3], 0.004, matte(0xeeeeee));
  put(d, cyl(0.07, 0.11, 0.18), denim, [0, 0.66, 0]);
  const head = new THREE.Group();
  head.position.set(0, 0.92, 0.02);
  put(head, box(0.48, 0.4, 0.42), steel, [0, 0, 0]);
  // Red round eyes in dark sockets, a grille of teeth for a mouth.
  for (const side of [-1, 1]) {
    put(head, cyl(0.08, 0.08, 0.03, 14), dark, [side * 0.11, 0.06, 0.215], [Math.PI / 2, 0, 0]);
    put(head, cyl(0.05, 0.05, 0.03, 14), glow(0xff2a2a), [side * 0.11, 0.06, 0.23], [Math.PI / 2, 0, 0]);
    put(head, cyl(0.06, 0.06, 0.06, 12), dark, [side * 0.26, 0, 0], [0, 0, Math.PI / 2]);
  }
  put(head, box(0.3, 0.1, 0.02), dark, [0, -0.11, 0.215]);
  for (let k = 0; k < 6; k++) put(head, box(0.04, 0.08, 0.02), matte(0xd8d8d8), [-0.125 + k * 0.05, -0.11, 0.225]);
  // Bucket hat, brim turned down.
  const hat = matte(0x2a63c8);
  put(head, cyl(0.25, 0.27, 0.2, 18), hat, [0, 0.29, 0]);
  put(head, cyl(0.25, 0.25, 0.02, 18), hat, [0, 0.4, 0]);
  put(head, cyl(0.29, 0.38, 0.06, 20), hat, [0, 0.2, 0]);
  d.add(head);
  body.add(d);

  const tire = matte(0x1c1c1c);
  return {
    body,
    wheels: [0.85, -0.85].flatMap((x) => [
      { x, z: 0.85, radius: 0.42, width: 0.4, front: true, material: tire },
      { x, z: -0.85, radius: 0.42, width: 0.4, front: false, material: tire },
    ]),
    exhausts: [new THREE.Vector3(0.45, 1.9, -1.0)],
    rearTrack: 0.85,
    rearZ: -0.9,
    spinners: [],
    shadow: [2.6, 3.0],
    head,
  };
}

// ---- Gila Rider: beaded gila monster flying a rotor chopper --------------------

function gilaRider(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const hide = matte(0xffffff, { map: tex('beads', beadTexture) });
  const paint = gloss(r.color);
  const black = gloss(r.accent);
  const steel = chrome();
  // It flies: everything rides a metre off the road.
  const ship = new THREE.Group();
  ship.position.y = 0.95;
  body.add(ship);

  // A chopper bike with no wheels: teardrop tank, long raked forks ending in a nose pod, a tail boom.
  put(ship, box(0.6, 0.3, 1.8), paint, [0, 0, -0.3]);
  put(ship, ball(0.36, 16, 12), paint, [0, 0.2, 0.45], [0, 0, 0], [0.8, 0.6, 1.4]);
  sideDecal(ship, tex('flames-gila', () => flameDecalTexture('#ffb070', '#c4501c')), 0.31, 0.2, 0.45, 0.9, 0.24);
  for (const side of [-1, 1]) rod(ship, [side * 0.12, 0.45, 0.85], [side * 0.12, -0.15, 1.5], 0.04, steel);
  put(ship, ball(0.24, 14, 10), black, [0, -0.15, 1.55], [0, 0, 0], [1, 0.8, 1.3]);
  put(ship, ball(0.12, 10, 8), glow(0xfff2c0), [0, -0.12, 1.83], [0, 0, 0], [1, 1, 0.4]);
  rod(ship, [0, 0.05, -1.1], [0, 0.35, -2.2], 0.07, paint, 0.04);
  put(ship, box(0.04, 0.5, 0.35), black, [0, 0.5, -2.2]);
  // The tail rotor turns about the boom's side axis: a mount turned side-on, spun about its own z.
  const tailMount = new THREE.Group();
  tailMount.position.set(0.08, 0.5, -2.2);
  tailMount.rotation.y = Math.PI / 2;
  const tailRotor = new THREE.Group();
  for (let k = 0; k < 3; k++) put(tailRotor, box(0.06, 0.55, 0.02), black, [0, 0, 0], [0, 0, (k * Math.PI) / 3]);
  tailMount.add(tailRotor);
  ship.add(tailMount);
  // Ape-hanger bars.
  put(ship, box(0.9, 0.04, 0.04), steel, [0, 0.75, 0.85]);
  for (const side of [-1, 1]) {
    put(ship, cyl(0.03, 0.03, 0.5), steel, [side * 0.42, 0.95, 0.85]);
    put(ship, cyl(0.045, 0.045, 0.14, 8), matte(0x111111), [side * 0.42, 1.24, 0.85]);
  }
  // Landing skids and two downward thrusters with glowing pads.
  const pads: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    put(ship, box(0.06, 0.06, 1.9), steel, [side * 0.55, -0.82, -0.2]);
    put(ship, cyl(0.04, 0.04, 0.12, 8), steel, [side * 0.55, -0.8, 0.78], [Math.PI / 2 - 0.5, 0, 0]);
    rod(ship, [side * 0.25, -0.1, 0.25], [side * 0.55, -0.8, 0.35], 0.03, steel);
    rod(ship, [side * 0.25, -0.1, -0.85], [side * 0.55, -0.8, -0.75], 0.03, steel);
    const pod = put(ship, cyl(0.22, 0.18, 0.35, 14), black, [side * 0.62, -0.25, -0.35]);
    put(pod, ring(0.21, 0.035), steel, [0, -0.17, 0], [Math.PI / 2, 0, 0]);
    pads.push(glowSprite(ship, [side * 0.62, -0.5, -0.35], 0.8, 0xffa040));
  }
  // Main rotor on a mast.
  put(ship, cyl(0.05, 0.06, 0.9), steel, [0, 1.15, -0.55]);
  put(ship, cyl(0.12, 0.12, 0.1, 12), black, [0, 1.6, -0.55]);
  const rotor = new THREE.Group();
  rotor.position.set(0, 1.62, -0.55);
  for (let k = 0; k < 3; k++) {
    const hub = new THREE.Group();
    hub.rotation.y = (k * Math.PI * 2) / 3;
    const blade = put(hub, box(0.14, 0.02, 1.5), black, [0, 0, 0.78], [0, 0, 0.06]);
    put(blade, box(0.15, 0.025, 0.12), matte(0xffb070), [0, 0, 0.7]);
    rotor.add(hub);
  }
  // A blur disc so the spin reads at speed.
  put(rotor, cyl(1.55, 1.55, 0.01, 32), new THREE.MeshBasicMaterial({ color: 0x1a1210, transparent: true, opacity: 0.12, depthWrite: false }), [0, 0, 0]);
  ship.add(rotor);

  const d = new THREE.Group();
  d.position.set(0, -0.2, -0.3);
  put(d, ball(0.38), hide, [0, 0.35, 0], [0.4, 0, 0], [1, 1.2, 0.9]);
  // A bandana round the neck, feet on pegs, a fat tail over the back.
  put(d, cyl(0.24, 0.3, 0.12, 14), gloss(0xd0303a), [0, 0.72, 0.1], [0.3, 0, 0]);
  put(d, cone(0.12, 0.25, 4), gloss(0xd0303a), [0, 0.62, -0.18], [-2.4, 0, 0]);
  for (const side of [-1, 1]) {
    rod(d, [side * 0.25, 0.15, 0.1], [side * 0.35, -0.1, 0.5], 0.08, hide);
    put(d, ball(0.09, 8, 6), hide, [side * 0.35, -0.12, 0.58], [0, 0, 0], [1, 0.6, 1.4]);
  }
  for (let k = 0; k < 6; k++) put(d, ball(0.15 - k * 0.018, 10, 8), hide, [0, 0.05 - k * 0.04, -0.35 - k * 0.2]);
  for (const side of [-1, 1]) arm(d, [side * 0.3, 0.6, 0.2], [side * 0.42, 1.45, 1.15], 0.08, hide, hide);
  const face = new THREE.Group();
  face.position.set(0, 0.95, 0.2);
  put(face, ball(0.3), hide, [0, 0, 0], [0, 0, 0], [1.2, 0.7, 1.3]);
  put(face, ball(0.2), hide, [0, -0.04, 0.3], [0, 0, 0], [1.2, 0.6, 1]);
  eyes(face, 0.08, 0.2, 0.2, 0.06, 0x2a1408, false);
  put(face, box(0.04, 0.01, 0.3), matte(0xd0303a), [0, -0.1, 0.55]);
  for (const side of [-1, 1]) put(face, box(0.02, 0.01, 0.12), matte(0xd0303a), [side * 0.04, -0.1, 0.74], [0, side * 0.5, 0]);
  // Sunglasses: every rider needs a pair. Aviators, for a pilot.
  put(face, box(0.5, 0.02, 0.03), steel, [0, 0.15, 0.33]);
  for (const side of [-1, 1]) put(face, ball(0.09, 12, 8), matte(0x050505, { shininess: 140, specular: 0xffffff }), [side * 0.12, 0.09, 0.35], [0, 0, 0], [1.1, 0.8, 0.3]);
  // A leather pilot's cap with the flaps up.
  put(face, ball(0.31, 16, 10), matte(0x5a3a22), [0, 0.08, -0.05], [0, 0, 0], [1.15, 0.6, 1.2]);
  for (const side of [-1, 1]) put(face, box(0.04, 0.16, 0.14), matte(0x5a3a22), [side * 0.34, 0.08, -0.05], [0, 0, side * 0.5]);
  d.add(face);
  ship.add(d);

  return {
    body,
    wheels: [],
    exhausts: [-0.2, 0.2].map((x) => new THREE.Vector3(x, 0.95, -1.25)),
    rearTrack: 0.55,
    rearZ: -0.9,
    spinners: [tailRotor],
    shadow: [2.2, 3.6],
    rotors: [rotor],
    hover: { bob: 0.12, pads },
    head: face,
  };
}

// ---- Swamp Witch: witch in a fan-driven swamp hovercraft ------------------------

function swampWitch(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const wood = matte(0xffffff, { map: tex('wood', woodTexture) });
  const moss = gloss(r.color);
  const skin = matte(0x8fbf5a);
  const iron = matte(0x3a3a3a);
  const craft = new THREE.Group();
  craft.position.y = 0.35;
  body.add(craft);

  // Plank skiff riding on a fat rubber skirt.
  put(craft, ring(0.95, 0.28), matte(0x2a2a24, { shininess: 30 }), [0, 0.05, -0.1], [Math.PI / 2, 0, 0], [0.82, 1.25, 1]);
  put(craft, box(1.4, 0.35, 2.1), wood, [0, 0.35, -0.1]);
  put(craft, cyl(0.7, 0.7, 0.35, 3), wood, [0, 0.35, 1.05], [0, Math.PI / 6, 0], [1, 1, 0.9]);
  put(craft, box(1.5, 0.08, 2.2), moss, [0, 0.55, -0.1]);
  // Hanging moss and lily pads stuck to the gunwales.
  for (let k = 0; k < 6; k++) for (const side of [-1, 1]) put(craft, cone(0.06, 0.3, 5), moss, [side * 0.72, 0.38, -0.9 + k * 0.33], [Math.PI, 0, 0]);
  for (const [x, z] of [[0.55, 0.6], [-0.6, -0.5]]) put(craft, cyl(0.16, 0.16, 0.02, 12), matte(0x4a9a3a), [x, 0.6, z]);
  // A bubbling cauldron in the bow, a green lantern on a crook, a broom lashed along the side.
  put(craft, ball(0.24, 14, 10), iron, [0, 0.7, 0.75], [0, 0, 0], [1, 0.85, 1]);
  put(craft, cyl(0.2, 0.2, 0.03, 14), glow(0x9aff4a), [0, 0.86, 0.75]);
  for (let k = 0; k < 3; k++) put(craft, ball(0.05 + k * 0.01, 8, 6), glow(0xc8ff8a), [Math.sin(k * 2.1) * 0.08, 0.93 + k * 0.07, 0.75 + Math.cos(k * 2.1) * 0.06]);
  rod(craft, [-0.6, 0.55, 1.0], [-0.6, 1.6, 1.0], 0.025, matte(0x4a3420));
  put(craft, ring(0.12, 0.025, Math.PI), matte(0x4a3420), [-0.48, 1.6, 1.0], [0, 0, 0]);
  put(craft, ball(0.09, 10, 8), glow(0x7aff5a), [-0.36, 1.45, 1.0]);
  glowSprite(craft, [-0.36, 1.45, 1.0], 0.8, 0x7aff5a);
  rod(craft, [0.78, 0.5, 0.8], [0.78, 0.5, -0.9], 0.03, matte(0x6a4a2a));
  put(craft, cone(0.12, 0.45, 8), matte(0xc8a050), [0.78, 0.5, -1.1], [-Math.PI / 2, 0, 0]);
  // Big caged fan at the back, a crow perched on the cage.
  const cage = new THREE.Group();
  cage.position.set(0, 1.2, -1.15);
  put(cage, new THREE.TorusGeometry(0.7, 0.04, 8, 32), iron, [0, 0, 0]);
  for (let k = 0; k < 4; k++) put(cage, box(0.03, 1.4, 0.03), iron, [0, 0, 0], [0, 0, (k * Math.PI) / 4]);
  const fan = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const blade = new THREE.Group();
    blade.rotation.z = (k * Math.PI * 2) / 3;
    put(blade, box(0.16, 0.62, 0.03), wood, [0, 0.31, -0.08], [0, 0.4, 0]);
    fan.add(blade);
  }
  put(fan, cyl(0.1, 0.1, 0.15), matte(0x222222), [0, 0, -0.08], [Math.PI / 2, 0, 0]);
  cage.add(fan);
  const crow = new THREE.Group();
  crow.position.set(0.15, 0.74, 0);
  const feather = matte(0x111118, { shininess: 60, specular: 0x334466 });
  put(crow, ball(0.1, 10, 8), feather, [0, 0, 0], [0, 0, 0], [1, 0.9, 1.4]);
  put(crow, ball(0.07, 10, 8), feather, [0, 0.08, 0.1]);
  put(crow, cone(0.025, 0.1, 6), matte(0x3a3020), [0, 0.07, 0.2], [Math.PI / 2, 0, 0]);
  put(crow, cone(0.06, 0.18, 4), feather, [0, -0.02, -0.18], [-Math.PI / 2 - 0.3, 0, 0]);
  put(crow, ball(0.015, 6, 4), glow(0xffd23a), [0.04, 0.1, 0.15]);
  cage.add(crow);
  put(craft, box(0.1, 0.9, 0.1), iron, [0, 0.8, -1.1]);
  craft.add(cage);
  // Spray kicked out from under the skirt.
  const pads = [-1, 1].flatMap((side) => [glowSprite(craft, [side * 0.75, -0.15, 0.5], 0.9, 0x9ac8b0), glowSprite(craft, [side * 0.75, -0.15, -0.7], 0.9, 0x9ac8b0)]);

  const d = new THREE.Group();
  d.position.set(0, 0.55, 0.05);
  put(d, cone(0.42, 0.9, 12), matte(0x2a1e3a), [0, 0.45, 0]);
  put(d, ring(0.24, 0.025), matte(r.accent), [0, 0.6, 0], [Math.PI / 2, 0, 0]);
  // One gnarled hand on the rudder stick, the other on the cauldron's spoon.
  rod(d, [0.15, 0.0, 0.3], [0.2, 0.6, 0.55], 0.025, matte(0x6a4a2a));
  arm(d, [-0.2, 0.75, 0.05], [-0.1, 0.33, 0.6], 0.05, matte(0x2a1e3a), skin);
  arm(d, [0.2, 0.75, 0.05], [0.2, 0.6, 0.55], 0.05, matte(0x2a1e3a), skin);
  const head = new THREE.Group();
  head.position.set(0, 1.05, 0.05);
  put(head, ball(0.26), skin, [0, 0, 0]);
  put(head, cone(0.07, 0.32, 8), skin, [0, -0.02, 0.36], [Math.PI / 2 - 0.3, 0, 0]);
  put(head, ball(0.035, 6, 4), matte(0x5a7a3a), [0.06, 0.02, 0.4]);
  put(head, ball(0.03, 6, 4), matte(0x5a7a3a), [-0.14, -0.1, 0.2]);
  eyes(head, 0.06, 0.2, 0.1, 0.06, 0xb7d14a, false);
  brows(head, 0.14, 0.23, 0.1, 0.1, matte(0x1a1a1a), 0.4);
  // A crooked grin with one tooth.
  put(head, new THREE.TorusGeometry(0.09, 0.015, 6, 12, Math.PI), matte(0x2a0a0a), [0, -0.12, 0.2], [0, 0, Math.PI]);
  put(head, box(0.025, 0.035, 0.02), matte(0xf4f0d0), [0.03, -0.19, 0.22]);
  for (let k = 0; k < 9; k++) {
    const a = (k / 8) * Math.PI - Math.PI / 2;
    put(head, cyl(0.025, 0.012, 0.6, 5), matte(r.accent), [Math.sin(a) * 0.24, -0.25, -Math.abs(Math.cos(a)) * 0.15], [0.2, 0, a * 0.3]);
  }
  // Crooked hat in two pieces, with a buckle and a mushroom growing on the brim.
  const hatMat = matte(0x1a2a24);
  put(head, cyl(0.5, 0.5, 0.04, 20), hatMat, [0, 0.18, 0]);
  put(head, cyl(0.12, 0.26, 0.45, 12), hatMat, [0, 0.42, 0]);
  put(head, cone(0.12, 0.45, 12), hatMat, [0.08, 0.78, -0.12], [-0.6, 0, -0.4]);
  put(head, cyl(0.27, 0.27, 0.07, 16), matte(r.accent), [0, 0.24, 0]);
  put(head, box(0.1, 0.08, 0.02), gloss(0xd8a83a), [0, 0.24, 0.27]);
  put(head, cyl(0.02, 0.025, 0.08, 6), matte(0xf0e8d0), [0.35, 0.24, 0.2]);
  put(head, ball(0.06, 10, 6), matte(0xd0402a), [0.35, 0.29, 0.2], [0, 0, 0], [1, 0.5, 1]);
  d.add(head);
  craft.add(d);

  return {
    body,
    wheels: [],
    exhausts: [new THREE.Vector3(0, 1.55, -1.35)],
    rearTrack: 0.82,
    rearZ: -0.85,
    spinners: [fan],
    shadow: [2.6, 3.4],
    hover: { bob: 0.05, pads },
    head,
  };
}

// ---- Microtonal Monk: monk levitating in a lotus pod with a sitar neck ---------

function microtonalMonk(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const gold = gloss(r.color, { specular: 0xffe0a0 });
  const petal = gloss(0xf3a6c8);
  const innerPetal = gloss(0xffd0e4);
  const lotus = new THREE.Group();
  lotus.position.y = 0.55;
  body.add(lotus);

  put(lotus, ball(0.9, 24, 12), gold, [0, 0, 0], [0, 0, 0], [0.85, 0.35, 1.25]);
  put(lotus, ring(0.78, 0.04), gloss(r.accent), [0, 0.12, 0], [Math.PI / 2, 0, 0], [1, 1.45, 1]);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    put(lotus, ball(0.32, 10, 8), petal, [Math.sin(a) * 0.72, 0.17, Math.cos(a) * 1.0], [0.5 * Math.cos(a), a, -0.5 * Math.sin(a)], [0.5, 0.25, 1]);
    const b = a + Math.PI / 10;
    put(lotus, ball(0.26, 10, 8), innerPetal, [Math.sin(b) * 0.55, 0.3, Math.cos(b) * 0.78], [0.9 * Math.cos(b), b, -0.9 * Math.sin(b)], [0.45, 0.22, 0.9]);
  }
  // Petals curling down underneath, over a soft golden glow it floats on.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    put(lotus, ball(0.28, 10, 8), gold, [Math.sin(a) * 0.5, -0.22, Math.cos(a) * 0.7], [-0.6 * Math.cos(a), a, 0.6 * Math.sin(a)], [0.45, 0.2, 0.9]);
  }
  const pads = [glowSprite(lotus, [0, -0.45, 0], 2.2, 0xffd88a), glowSprite(lotus, [0, -0.5, 0.6], 1.2, 0xff9ad0), glowSprite(lotus, [0, -0.5, -0.6], 1.2, 0xff9ad0)];
  // Sitar-style neck rising behind, gourd at its foot, strings, tuning pegs.
  const wood = matte(0x7b3a1a, { shininess: 60, specular: 0x553322 });
  put(lotus, ball(0.32, 16, 12), wood, [0, 0.4, -0.95], [0, 0, 0], [1, 1, 0.8]);
  put(lotus, ring(0.2, 0.02), gold, [0, 0.4, -0.7], [0, 0, 0]);
  put(lotus, box(0.12, 1.5, 0.08), wood, [0, 1.25, -1.0], [-0.2, 0, 0]);
  for (let k = 0; k < 9; k++) put(lotus, box(0.14, 0.015, 0.1), chrome(), [0, 0.65 + k * 0.14, -0.88 - k * 0.028], [-0.2, 0, 0]);
  for (let k = -1; k <= 1; k++) rod(lotus, [k * 0.03, 0.45, -0.66], [k * 0.03, 1.95, -1.1], 0.004, chrome());
  for (let k = 0; k < 4; k++) for (const side of [-1, 1]) put(lotus, cyl(0.015, 0.025, 0.14, 6), wood, [side * 0.1, 1.55 + k * 0.1, -1.05 - k * 0.02], [0, 0, (side * Math.PI) / 2]);
  put(lotus, ball(0.1, 8, 6), wood, [0, 2.0, -1.15]);
  // Prayer flags strung from the neck to the bow.
  const flagColors = [0x3a7aff, 0xffffff, 0xd8302a, 0x3aa04a, 0xffd23a];
  for (let k = 0; k < 5; k++) {
    const t = (k + 0.5) / 5;
    put(lotus, box(0.01, 0.13, 0.11), matte(flagColors[k]), [0.3, 1.9 - t * 1.4 - Math.sin(t * Math.PI) * 0.2, -1.05 + t * 2.0]);
  }
  rod(lotus, [0, 1.95, -1.1], [0.3, 0.2, 1.0], 0.005, matte(0x8a7a6a));

  // A ring of glowing notes orbits the pod.
  const orbit = new THREE.Group();
  orbit.position.y = 0.35;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const note = new THREE.Group();
    note.position.set(Math.sin(a) * 1.2, Math.sin(k * 2.3) * 0.15, Math.cos(a) * 1.3);
    put(note, ball(0.06, 8, 6), glow(0xffe680), [0, 0, 0], [0, 0, 0], [1.2, 0.9, 1]);
    put(note, box(0.015, 0.2, 0.015), glow(0xffe680), [0.06, 0.1, 0]);
    orbit.add(note);
  }
  lotus.add(orbit);

  const d = new THREE.Group();
  d.position.set(0, 0.1, -0.05);
  put(d, cone(0.48, 0.75, 16), gloss(0xff9a1a), [0, 0.38, 0]);
  put(d, box(0.12, 0.75, 0.1), gloss(r.accent), [0.18, 0.4, 0.2], [0, 0, 0.45]);
  // Crossed legs and hands together in front of the chest.
  for (const side of [-1, 1]) put(d, cyl(0.1, 0.1, 0.6, 10), gloss(0xff9a1a), [side * 0.12, 0.08, 0.3], [0, side * 0.6, Math.PI / 2]);
  const skin = gloss(0xd9a878, { reflectivity: 0.12, shininess: 120 });
  for (const side of [-1, 1]) arm(d, [side * 0.3, 0.62, 0.02], [side * 0.03, 0.55, 0.36], 0.06, gloss(0xff9a1a), skin);
  put(d, box(0.04, 0.16, 0.06), skin, [0, 0.64, 0.38]);
  const beads = new THREE.Group();
  beads.position.set(0, 0.72, 0.05);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    put(beads, ball(0.035, 6, 4), matte(r.accent), [Math.sin(a) * 0.22, -Math.abs(Math.cos(a)) * 0.18, Math.cos(a) * 0.16 + 0.1]);
  }
  d.add(beads);
  const head = new THREE.Group();
  head.position.set(0, 1.0, 0.02);
  put(head, ball(0.27), skin, [0, 0, 0]);
  put(head, ball(0.03, 8, 6), glow(0xd1342f), [0, 0.12, 0.26]);
  for (const side of [-1, 1]) put(head, box(0.09, 0.015, 0.02), matte(0x3a2410), [side * 0.09, 0.03, 0.25]); // eyes closed in meditation
  for (const side of [-1, 1]) put(head, box(0.08, 0.012, 0.02), matte(0x3a2410), [side * 0.09, 0.09, 0.25], [0, 0, side * -0.15]);
  put(head, new THREE.TorusGeometry(0.06, 0.01, 6, 12, Math.PI), matte(0x8a3a2a), [0, -0.1, 0.25], [0, 0, Math.PI]);
  put(head, ball(0.04, 8, 6), skin, [0, -0.01, 0.27]);
  for (const side of [-1, 1]) put(head, ball(0.07, 8, 6), skin, [side * 0.27, 0, 0], [0, 0, 0], [0.5, 1, 0.8]);
  // A halo hums above.
  put(head, new THREE.TorusGeometry(0.22, 0.02, 6, 24), glow(0xffe680), [0, 0.42, 0], [Math.PI / 2, 0, 0]);
  d.add(head);
  lotus.add(d);

  return {
    body,
    wheels: [],
    exhausts: [new THREE.Vector3(0, 0.6, -1.15)],
    rearTrack: 0.72,
    rearZ: -0.8,
    spinners: [],
    shadow: [2.2, 3.0],
    rotors: [orbit],
    hover: { bob: 0.14, pads },
    head,
  };
}

// ---- Fuzz Golem: fuzzed-out rock golem on a boulder slab -----------------------

function fuzzGolem(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const rockMap = tex('stone', () => stoneTexture([70, 62, 80], [140, 128, 150]));
  const rock = matte(0xffffff, { map: rockMap, flatShading: true });
  const fuzz = matte(r.color, { flatShading: true, shininess: 30, specular: 0x442244 });
  const lava = glow(0xff8a2a);

  put(body, new THREE.DodecahedronGeometry(1, 0), rock, [0, 0.62, 0], [0.3, 0.4, 0], [0.85, 0.38, 1.35]);
  // Glowing cracks through the slab.
  for (const [x, z, a] of [[0.55, 0.4, 0.3], [-0.6, -0.2, -0.5], [0.3, -0.7, 1.2], [-0.2, 0.9, 0.8]] as const) {
    put(body, box(0.04, 0.03, 0.5), lava, [x, 0.86, z], [0, a, 0]);
  }
  for (let k = 0; k < 5; k++) put(body, new THREE.DodecahedronGeometry(0.12 + (k % 3) * 0.05, 0), rock, [Math.sin(k * 2.4) * 0.7, 0.85, Math.cos(k * 2.4) * 1.0]);
  // Amp stack strapped to the back: grille cloth, knobs, glowing tubes on top, a chain round it.
  put(body, box(0.95, 0.75, 0.45), matte(0x161616), [0, 1.05, -1.0]);
  const grille = matte(0xffffff, { map: tex('grille', grilleTexture) });
  put(body, box(0.85, 0.65, 0.02), grille, [0, 1.05, -1.23]);
  for (const side of [-1, 1]) {
    put(body, cyl(0.17, 0.2, 0.05, 20), matte(0x0a0a0a), [side * 0.2, 1.05, -1.25], [Math.PI / 2, 0, 0]);
    put(body, ball(0.05, 8, 6), matte(0x2a2a2a), [side * 0.2, 1.05, -1.28]);
  }
  put(body, box(0.95, 0.1, 0.45), gloss(r.accent), [0, 1.47, -1.0]);
  for (let k = 0; k < 5; k++) put(body, cyl(0.03, 0.03, 0.04, 10), chrome(), [-0.3 + k * 0.15, 1.47, -0.76], [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 3; k++) {
    put(body, cyl(0.045, 0.045, 0.18, 10), new THREE.MeshPhongMaterial({ color: 0xffb060, emissive: 0xff6a10, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 }), [-0.2 + k * 0.2, 1.62, -1.05]);
  }
  for (const side of [-1, 1]) put(body, box(0.04, 0.8, 0.5), matte(0x6a6a6a, { shininess: 80 }), [side * 0.49, 1.05, -1.0]);
  // A coiled cable from the amp to the guitar.
  for (let k = 0; k < 8; k++) put(body, ring(0.07, 0.015), matte(0x111111), [0.45, 0.95, -0.7 + k * 0.08], [0, Math.PI / 2, 0]);

  const d = new THREE.Group();
  d.position.set(0, 0.85, 0.05);
  put(d, new THREE.IcosahedronGeometry(0.62, 0), fuzz, [0, 0.55, 0], [0.2, 0.3, 0]);
  // The fuzz: spikes in every direction, a few tipped with the accent colour.
  const spike = cone(0.07, 0.32, 5);
  const tip = matte(r.accent, { emissive: 0x332200 });
  for (let k = 0; k < 56; k++) {
    const u = (k * 0.618034) % 1;
    const v = (k * 0.381966 + 0.13) % 1;
    const theta = u * Math.PI * 2;
    const phi = Math.acos(1 - 2 * v);
    const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    if (dir.y < -0.4) continue;
    if (dir.z > 0.5 && Math.abs(dir.y - 0.3) < 0.35) continue; // leave the face clear
    const m = put(d, spike, k % 6 === 0 ? tip : fuzz, [dir.x * 0.6, 0.55 + dir.y * 0.6, dir.z * 0.6]);
    m.quaternion.setFromUnitVectors(UP, dir);
    m.scale.setScalar(0.8 + ((k * 7) % 5) * 0.12);
  }
  // A fuzz guitar slung across the front: body, neck, headstock, strings.
  const guitar = new THREE.Group();
  guitar.position.set(0.1, 0.25, 0.62);
  guitar.rotation.set(0.2, 0, -0.6);
  put(guitar, box(0.5, 0.36, 0.08), gloss(r.accent), [0, 0, 0]);
  put(guitar, box(0.3, 0.28, 0.08), gloss(r.accent), [0.25, 0.1, 0], [0, 0, 0.6]);
  put(guitar, box(0.7, 0.07, 0.04), matte(0x3a2410), [0.55, 0, 0.02]);
  put(guitar, box(0.14, 0.11, 0.04), matte(0x111111), [0.95, 0.02, 0.02], [0, 0, 0.2]);
  for (let k = -1; k <= 1; k++) put(guitar, box(1.0, 0.006, 0.006), chrome(), [0.4, k * 0.02, 0.05]);
  for (let k = 0; k < 2; k++) put(guitar, box(0.14, 0.05, 0.02), matte(0x111111), [-0.05 + k * 0.08, -0.02, 0.05], [0, 0, Math.PI / 2]);
  d.add(guitar);
  // Boulder fists on the bars, one on the neck.
  put(d, new THREE.DodecahedronGeometry(0.22, 0), rock, [-0.55, 0.2, 0.55]);
  put(d, new THREE.DodecahedronGeometry(0.22, 0), rock, [0.62, 0.62, 0.55]);
  for (const side of [-1, 1]) rod(d, [side * 0.5, 0.5, 0.1], side < 0 ? [-0.55, 0.2, 0.55] : [0.62, 0.62, 0.55], 0.1, rock);

  const head = new THREE.Group();
  head.position.set(0, 0.75, 0.48);
  eyes(head, 0, 0.02, 0.2, 0.09, 0xffcc33, false);
  put(head, new THREE.DodecahedronGeometry(0.13, 0), rock, [-0.2, 0.13, 0.04], [0, 0, 0], [1.3, 0.5, 0.8]);
  put(head, new THREE.DodecahedronGeometry(0.13, 0), rock, [0.2, 0.13, 0.04], [0, 0, 0], [1.3, 0.5, 0.8]);
  // A mouth glowing like a cranked amp.
  put(head, box(0.3, 0.07, 0.04), lava, [0, -0.2, 0.04]);
  for (let k = 0; k < 4; k++) put(head, box(0.04, 0.08, 0.05), rock, [-0.11 + k * 0.073, -0.2, 0.06]);
  d.add(head);
  body.add(d);

  const stoneWheel = matte(0x4a4452, { flatShading: true, map: rockMap });
  return {
    body,
    wheels: [
      { x: 0.85, z: 0.95, radius: 0.4, width: 0.35, front: true, material: stoneWheel },
      { x: -0.85, z: 0.95, radius: 0.4, width: 0.35, front: true, material: stoneWheel },
      { x: 0.92, z: -0.85, radius: 0.56, width: 0.5, front: false, material: stoneWheel },
      { x: -0.92, z: -0.85, radius: 0.56, width: 0.5, front: false, material: stoneWheel },
    ],
    exhausts: pipes(body, 0.42, 0.75, -1.3, 0.14),
    rearTrack: 0.92,
    rearZ: -0.95,
    spinners: [],
    shadow: [2.8, 3.5],
    head,
  };
}

// ---- Neon Moth: glowing moth on a featherweight trike with wing sails ----------

function neonMoth(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const paint = gloss(r.color, { emissive: 0x0a3a4a });
  const trim = gloss(r.accent);
  const fuzz = matte(0xf4ecd8);
  const leg = matte(0x3a2a20);

  // A narrow tube-frame trike: one front wheel, two rear, a seat on a strut.
  put(body, box(0.5, 0.22, 2.3), paint, [0, 0.42, 0]);
  put(body, box(1.3, 0.14, 0.5), trim, [0, 0.4, -0.85]);
  for (const side of [-1, 1]) put(body, box(0.04, 0.05, 2.2), glow(r.color), [side * 0.26, 0.42, 0]);
  put(body, cyl(0.06, 0.06, 1.1), chrome(), [0, 0.75, 1.05], [0.5, 0, 0]);
  put(body, box(0.5, 0.04, 0.04), chrome(), [0, 1.0, 0.95]);
  // Glowing lamp on the nose, the thing it can't stop chasing, and a tiny moth already circling it.
  put(body, ball(0.16), glow(0xfff2a8), [0, 1.0, 1.35]);
  put(body, cyl(0.17, 0.2, 0.12, 14), chrome(), [0, 1.0, 1.24], [Math.PI / 2, 0, 0]);
  glowSprite(body, [0, 1.0, 1.4], 1.4, 0xfff2a8);
  const lampOrbit = new THREE.Group();
  lampOrbit.position.set(0, 1.0, 1.35);
  const tiny = new THREE.Group();
  tiny.position.set(0.3, 0.05, 0);
  put(tiny, ball(0.03, 6, 4), fuzz, [0, 0, 0]);
  for (const side of [-1, 1]) put(tiny, box(0.08, 0.005, 0.05), matte(r.accent), [side * 0.04, 0, 0], [0, 0, side * 0.4]);
  lampOrbit.add(tiny);
  body.add(lampOrbit);

  // The moth: fuzzy thorax with a fur collar, big faceted eyes, feathered antennae, six legs, four wing sails.
  const d = new THREE.Group();
  d.position.set(0, 0.55, -0.3);
  put(d, ball(0.34), fuzz, [0, 0.42, 0], [0, 0, 0], [1, 1.2, 1]);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    put(d, cone(0.07, 0.18, 5), fuzz, [Math.sin(a) * 0.3, 0.72, Math.cos(a) * 0.3], [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9]);
  }
  put(d, ball(0.26, 12, 10), matte(0xd8c8a8), [0, 0.15, -0.35], [0.6, 0, 0], [0.9, 0.8, 1.4]);
  for (let k = 0; k < 4; k++) put(d, ring(0.2 - k * 0.03, 0.02), matte(0x8a7a5a), [0, 0.12 - k * 0.05, -0.42 - k * 0.1], [0.9, 0, 0]);
  // Front legs on the bars; the rest gripping the frame.
  for (const side of [-1, 1]) {
    arm(d, [side * 0.18, 0.5, 0.2], [side * 0.25, 0.45, 1.25], 0.025, leg, leg);
    rod(d, [side * 0.2, 0.3, 0.1], [side * 0.3, -0.13, 0.3], 0.02, leg);
    rod(d, [side * 0.2, 0.3, -0.05], [side * 0.3, -0.13, -0.3], 0.02, leg);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.98, 0.05);
  put(head, ball(0.24), fuzz, [0, 0, 0]);
  for (const side of [-1, 1]) {
    put(head, new THREE.IcosahedronGeometry(0.13, 1), new THREE.MeshPhongMaterial({ color: r.color, emissive: r.color, emissiveIntensity: 0.6, flatShading: true, shininess: 120 }), [side * 0.17, 0.04, 0.14]);
    const antenna = new THREE.Group();
    antenna.position.set(side * 0.1, 0.18, 0.08);
    antenna.rotation.set(-0.5, 0, side * -0.5);
    put(antenna, cyl(0.015, 0.015, 0.5, 5), leg, [0, 0.25, 0]);
    for (let k = 0; k < 5; k++) put(antenna, box(0.16 - k * 0.025, 0.012, 0.03), leg, [0, 0.12 + k * 0.08, 0]);
    head.add(antenna);
  }
  // A curled proboscis.
  put(head, new THREE.TorusGeometry(0.05, 0.01, 6, 12, Math.PI * 1.6), leg, [0, -0.14, 0.22], [0, Math.PI / 2, 0]);
  d.add(head);
  const wing = new THREE.Shape();
  wing.moveTo(0, 0);
  wing.bezierCurveTo(0.5, 0.3, 1.1, 0.25, 1.05, -0.2);
  wing.bezierCurveTo(0.9, -0.55, 0.4, -0.45, 0, 0);
  const wingGeo = new THREE.ShapeGeometry(wing);
  const wingMat = new THREE.MeshPhongMaterial({ color: r.color, emissive: r.accent, emissiveIntensity: 0.25, transparent: true, opacity: 0.85, side: THREE.DoubleSide, shininess: 60 });
  const flappers: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.18, 0, -0.1);
    pivot.userData.side = side;
    for (const [y, tilt, s] of [[0.55, 0.35, 1], [0.35, -0.15, 0.7]] as const) {
      const w = put(pivot, wingGeo, wingMat, [0, y, 0], [0, side * -0.35, tilt * side], [side * s, s, 1]);
      w.rotation.order = 'YXZ';
      // Eyespots on each sail.
      put(w, new THREE.CircleGeometry(0.12, 16), glow(r.accent), [0.65, 0.02, 0.005]);
      put(w, new THREE.CircleGeometry(0.06, 12), glow(0xffffff), [0.65, 0.02, 0.01]);
      put(w, new THREE.CircleGeometry(0.12, 16), glow(r.accent), [0.65, 0.02, -0.005], [0, Math.PI, 0]);
    }
    d.add(pivot);
    flappers.push(pivot);
  }
  body.add(d);

  return {
    body,
    wheels: [
      { x: 0, z: 1.15, radius: 0.34, width: 0.18, front: true },
      { x: 0.72, z: -0.85, radius: 0.4, width: 0.26, front: false },
      { x: -0.72, z: -0.85, radius: 0.4, width: 0.26, front: false },
    ],
    exhausts: pipes(body, 0.25, 0.45, -1.2, 0.09),
    rearTrack: 0.72,
    rearZ: -0.95,
    spinners: [],
    shadow: [2.2, 3.0],
    rotors: [lampOrbit],
    head,
    flappers,
  };
}

// ---- Cosmic Coyote: space coyote in a rocket roadster ---------------------------

function cosmicCoyote(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const paint = gloss(r.color);
  const trim = gloss(r.accent);
  const fur = matte(0xc89060);
  const belly = matte(0xf0d8b0);

  // Low roadster with a rocket on its back, tail fins, portholes and a radar dish.
  put(body, box(1.2, 0.3, 2.6), paint, [0, 0.42, 0]);
  put(body, cone(0.55, 0.9, 16), paint, [0, 0.45, 1.6], [Math.PI / 2, 0, 0], [1, 1, 0.55]);
  put(body, box(1.22, 0.06, 2.0), trim, [0, 0.58, -0.1]);
  for (const side of [-1, 1]) {
    put(body, box(0.06, 0.55, 0.6), trim, [side * 0.58, 0.75, -1.05], [0, 0, side * 0.25]);
    for (let k = 0; k < 2; k++) {
      put(body, cyl(0.1, 0.1, 0.03, 14), chrome(), [side * 0.61, 0.44, 0.9 - k * 0.35], [0, 0, Math.PI / 2]);
      put(body, cyl(0.07, 0.07, 0.035, 14), glow(0x7ad8ff), [side * 0.615, 0.44, 0.9 - k * 0.35], [0, 0, Math.PI / 2]);
    }
  }
  const rocket = put(body, cyl(0.24, 0.24, 1.3, 14), chrome(), [0, 0.82, -0.9], [Math.PI / 2, 0, 0]);
  put(rocket, cone(0.24, 0.4, 14), trim, [0, 0.85, 0]);
  for (let k = 0; k < 3; k++) put(rocket, box(0.03, 0.4, 0.3), trim, [0, -0.45, 0], [0, (k * Math.PI * 2) / 3, 0]);
  put(rocket, ring(0.24, 0.03), trim, [0, 0.2, 0], [Math.PI / 2, 0, 0]);
  put(rocket, cyl(0.2, 0.26, 0.12, 14), matte(0x2a2a2a), [0, -0.7, 0]);
  rod(body, [-0.45, 0.6, -0.5], [-0.45, 1.1, -0.6], 0.02, chrome());
  put(body, new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), chrome(), [-0.45, 1.12, -0.6], [-0.9, 0.6, 0]);
  // Stars painted down the sides, a ringed planet on the nose.
  for (let k = 0; k < 4; k++) for (const side of [-1, 1]) put(body, new THREE.OctahedronGeometry(0.06), glow(0xfff2a8), [side * 0.61, 0.45, 0.4 - k * 0.4]);
  put(body, ball(0.1, 12, 8), glow(0xff9a1f), [0, 0.68, 1.35]);
  put(body, ring(0.16, 0.012), glow(0xfff2a8), [0, 0.68, 1.35], [1.2, 0, 0.3]);
  headlights(body, 0.35, 0.48, 1.62, 0.08, 0xc8f0ff);

  // The coyote: long snout, tall ears, goggles, scarf, a bubble helmet, a bushy tail.
  const d = new THREE.Group();
  d.position.set(0, 0.58, -0.2);
  put(d, cyl(0.3, 0.38, 0.65), fur, [0, 0.4, 0]);
  put(d, cyl(0.33, 0.33, 0.12, 14), trim, [0, 0.72, 0]);
  // The scarf streams out behind.
  for (let k = 0; k < 5; k++) put(d, box(0.14 - k * 0.012, 0.03, 0.22), trim, [0.18 + k * 0.03, 0.72 + Math.sin(k * 1.4) * 0.06, -0.25 - k * 0.2], [0, 0.1, Math.sin(k) * 0.3]);
  for (let k = 0; k < 5; k++) put(d, ball(0.16 - k * 0.015, 10, 8), k > 3 ? belly : fur, [0, 0.12 + k * 0.08, -0.35 - k * 0.12]);
  const grips = steeringWheel(d, 0.55, 0.62, 0.2);
  for (const [k, side] of [-1, 1].entries()) arm(d, [side * 0.33, 0.62, 0.05], grips[k], 0.07, fur, matte(0x7a4a2a));
  const head = new THREE.Group();
  head.position.set(0, 1.0, 0.05);
  put(head, ball(0.27), fur, [0, 0, 0], [0, 0, 0], [1, 0.95, 1]);
  put(head, cone(0.15, 0.42, 12), fur, [0, -0.06, 0.36], [Math.PI / 2, 0, 0]);
  put(head, ball(0.06), matte(0x1a1010), [0, -0.05, 0.58]);
  put(head, ball(0.14), belly, [0, -0.13, 0.14], [0, 0, 0], [1.2, 0.6, 1]);
  // A toothy grin along the snout.
  for (let k = 0; k < 3; k++) put(head, cone(0.015, 0.04, 4), matte(0xffffff), [-0.04 + k * 0.04, -0.15, 0.38 + k * 0.02], [Math.PI, 0, 0]);
  for (const side of [-1, 1]) {
    put(head, cone(0.1, 0.38, 6), fur, [side * 0.15, 0.3, -0.02], [0, 0, side * -0.2]);
    put(head, cone(0.055, 0.25, 6), matte(0xf0b8a0), [side * 0.15, 0.28, 0.02], [0, 0, side * -0.2]);
    put(head, cyl(0.08, 0.08, 0.06, 12), chrome(), [side * 0.11, 0.08, 0.22], [Math.PI / 2, 0, 0]);
    put(head, cyl(0.06, 0.06, 0.065, 12), glow(r.accent), [side * 0.11, 0.08, 0.23], [Math.PI / 2, 0, 0]);
  }
  put(head, box(0.42, 0.04, 0.04), matte(0x2a2a2a), [0, 0.08, 0.2]);
  // Fishbowl helmet with a little antenna.
  put(head, ball(0.5, 20, 14), new THREE.MeshPhongMaterial({ color: 0xc8e8ff, transparent: true, opacity: 0.22, shininess: 140, specular: 0xffffff, depthWrite: false, envMap: (env ??= skyEnvMap()), reflectivity: 0.4 }), [0, 0.02, 0.08]);
  put(head, ring(0.36, 0.04), chrome(), [0, -0.3, 0.08], [Math.PI / 2, 0, 0]);
  rod(head, [0.2, 0.42, -0.1], [0.28, 0.72, -0.15], 0.012, chrome());
  put(head, ball(0.035, 8, 6), glow(0xff3a3a), [0.28, 0.74, -0.15]);
  d.add(head);
  body.add(d);

  return {
    body,
    wheels: [
      { x: 0.74, z: 0.95, radius: 0.33, width: 0.28, front: true },
      { x: -0.74, z: 0.95, radius: 0.33, width: 0.28, front: true },
      { x: 0.78, z: -0.9, radius: 0.44, width: 0.38, front: false },
      { x: -0.78, z: -0.9, radius: 0.44, width: 0.38, front: false },
    ],
    // The rocket nozzle is the exhaust.
    exhausts: [new THREE.Vector3(0, 0.82, -1.6)],
    rearTrack: 0.78,
    rearZ: -1,
    spinners: [],
    shadow: [2.4, 3.4],
    head,
  };
}

// ---- Mantis Shredder: praying mantis guitarist inside a monowheel --------------

function mantisShredder(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const shell = gloss(r.color, { shininess: 110 });
  const pink = gloss(r.accent);
  const steel = chrome();
  const R = 1.05;

  // The frame hangs from the hub inside the hoop: a cradle seat, an engine below, a fin above.
  put(body, box(0.5, 0.18, 0.9), matte(0x1a1a1a), [0, 0.38, 0]);
  put(body, box(0.42, 0.3, 0.5), steel, [0, 0.42, -0.1]);
  for (let k = 0; k < 4; k++) put(body, box(0.46, 0.02, 0.4), matte(0x555555), [0, 0.5 + k * 0.05, -0.1]);
  for (const side of [-1, 1]) {
    rod(body, [side * 0.22, 0.4, 0.4], [side * 0.2, R, 0.3], 0.03, steel);
    rod(body, [side * 0.22, 0.4, -0.4], [side * 0.2, R, -0.3], 0.03, steel);
    // Inner rollers riding the hoop.
    put(body, cyl(0.08, 0.08, 0.1, 12), matte(0x111111), [side * 0.18, 0.2, 0.55], [0, 0, Math.PI / 2]);
    put(body, cyl(0.08, 0.08, 0.1, 12), matte(0x111111), [side * 0.18, 0.2, -0.55], [0, 0, Math.PI / 2]);
    put(body, cyl(0.08, 0.08, 0.1, 12), matte(0x111111), [side * 0.18, 2 * R - 0.2, 0], [0, 0, Math.PI / 2]);
  }
  rod(body, [0, 1.2, -0.3], [0, 2 * R - 0.22, 0], 0.04, steel);
  put(body, box(0.04, 0.5, 0.6), pink, [0, 1.75, -0.35], [0.5, 0, 0]);
  put(body, box(0.6, 0.04, 0.04), steel, [0, 1.0, 0.55]);
  for (const side of [-1, 1]) put(body, cyl(0.035, 0.035, 0.14, 8), matte(0x111111), [side * 0.3, 1.0, 0.55], [0, 0, Math.PI / 2]);
  headlights(body, 0.12, 0.6, 0.5, 0.06, 0xd8ff9a);

  // The mantis: long thorax, raptor arms on the bars, a triangle head with huge eyes, wings folded back.
  const d = new THREE.Group();
  d.position.set(0, 0.55, -0.15);
  put(d, cyl(0.12, 0.16, 0.7, 10), shell, [0, 0.4, 0.05], [0.4, 0, 0]);
  put(d, ball(0.2, 12, 10), shell, [0, 0.05, -0.15], [0, 0, 0], [1, 0.8, 1.6]);
  for (let k = 0; k < 3; k++) put(d, ring(0.17 - k * 0.02, 0.012), matte(0x5a8a1a), [0, 0.05, -0.3 - k * 0.12], [0, 0, 0]);
  for (const side of [-1, 1]) {
    // Folded wings over the abdomen.
    put(d, ball(0.25, 10, 6), new THREE.MeshPhongMaterial({ color: 0xd8ff9a, transparent: true, opacity: 0.55, shininess: 100, side: THREE.DoubleSide }), [side * 0.08, 0.2, -0.3], [0.3, side * 0.2, 0], [0.4, 0.06, 1.6]);
    // Raptor forelegs: upper arm, spiked forearm, hook on the grip.
    arm(d, [side * 0.12, 0.7, 0.2], [side * 0.3, 0.45, 0.68], 0.04, shell, pink);
    for (let k = 0; k < 3; k++) put(d, cone(0.012, 0.07, 4), pink, [side * (0.22 + k * 0.03), 0.6 - k * 0.03, 0.35 + k * 0.08], [0.8, 0, 0]);
    // Walking legs folded against the frame.
    rod(d, [side * 0.12, 0.2, 0], [side * 0.28, -0.05, 0.25], 0.02, shell);
    rod(d, [side * 0.12, 0.15, -0.1], [side * 0.28, -0.1, -0.35], 0.02, shell);
  }
  // A guitar on its back, headstock up.
  const guitar = new THREE.Group();
  guitar.position.set(0, 0.55, -0.3);
  guitar.rotation.set(-0.3, 0, 0.5);
  put(guitar, new THREE.CylinderGeometry(0.22, 0.22, 0.06, 3), pink, [0, 0, 0], [Math.PI / 2, 0, 0], [1, 1, 1.3]);
  put(guitar, box(0.05, 0.6, 0.03), matte(0x2a1a10), [0, 0.42, 0]);
  put(guitar, box(0.1, 0.12, 0.03), matte(0x111111), [0, 0.76, 0], [0, 0, 0.3]);
  d.add(guitar);
  const head = new THREE.Group();
  head.position.set(0, 0.86, 0.22);
  put(head, new THREE.ConeGeometry(0.17, 0.32, 3), shell, [0, -0.02, 0.05], [Math.PI, 0, 0], [1.3, 1, 0.7]);
  for (const side of [-1, 1]) {
    put(head, ball(0.1, 14, 10), new THREE.MeshPhongMaterial({ color: 0x9ad83a, emissive: 0x2a5a0a, shininess: 140, specular: 0xffffff }), [side * 0.15, 0.06, 0.04], [0, 0, 0], [0.9, 1.1, 0.9]);
    put(head, ball(0.025, 6, 4), matte(0x0a0a0a), [side * 0.17, 0.07, 0.13]);
    rod(head, [side * 0.04, 0.12, 0.08], [side * 0.18, 0.5, 0.25], 0.008, shell);
  }
  // Mandibles and a pink bandana.
  for (const side of [-1, 1]) put(head, cone(0.02, 0.07, 4), matte(0x3a5a1a), [side * 0.03, -0.18, 0.08], [0.3, 0, side * 0.5]);
  put(head, cyl(0.16, 0.16, 0.05, 12), pink, [0, 0.13, 0.0], [0.2, 0, 0]);
  put(head, cone(0.05, 0.16, 4), pink, [0.12, 0.13, -0.15], [-2.2, 0, 0.5]);
  d.add(head);
  body.add(d);

  return {
    body,
    wheels: [{ x: 0, z: 0, radius: R, width: 0.24, front: false, ring: true, material: matte(0x1a1a1a, { shininess: 40 }) }],
    exhausts: [-0.12, 0.12].map((x) => new THREE.Vector3(x, 0.45, -0.6)),
    rearTrack: 0.15,
    rearZ: 0,
    spinners: [],
    shadow: [1.4, 2.6],
    head,
  };
}

// ---- Gator Drummer: alligator drumming on a tracked kick-drum tank -------------

function gatorDrummer(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const wrap = matte(0xffffff, { map: tex('drum-wrap', () => sparkleTexture([184, 32, 42])), shininess: 80, specular: 0x888888 });
  const head = matte(r.accent);
  const steel = chrome();
  const hide = matte(0xffffff, { map: tex('gator', () => scaleTexture('#6a9a3a', '#22401a')) });
  const brassMat = brass();

  // The hull is a kick drum on its side, its head facing forward.
  put(body, cyl(0.62, 0.62, 1.7, 24), wrap, [0, 0.82, 0], [Math.PI / 2, 0, 0]);
  for (const z of [0.86, -0.86]) {
    put(body, cyl(0.6, 0.6, 0.02, 24), head, [0, 0.82, z], [Math.PI / 2, 0, 0]);
    put(body, ring(0.62, 0.05), steel, [0, 0.82, z], [0, 0, 0]);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      put(body, box(0.04, 0.04, 0.12), steel, [Math.cos(a) * 0.66, 0.82 + Math.sin(a) * 0.66, z - Math.sign(z) * 0.08]);
    }
  }
  // A logo on the front head: a circle and a zigzag.
  put(body, new THREE.CircleGeometry(0.3, 24), gloss(r.color), [0, 0.82, 0.875]);
  put(body, box(0.4, 0.05, 0.01), glow(0xffe14d), [0, 0.82, 0.88], [0, 0, 0.4]);
  // Two tracks on wheel bogies.
  const treadMap = tex('tread', treadTexture).clone();
  treadMap.needsUpdate = true;
  treadMap.repeat.set(1, 6);
  const tread = matte(0xffffff, { map: treadMap });
  const rubber = rubberMat();
  // Tread on the running faces, plain rubber on the flanks and ends.
  const band = [rubber, rubber, tread, tread, rubber, rubber];
  for (const side of [-1, 1]) {
    put(body, box(0.4, 0.12, 2.3), band, [side * 0.95, 0.06, 0]);
    put(body, box(0.4, 0.12, 2.3), band, [side * 0.95, 0.66, 0]);
    for (const z of [1.15, -1.15]) put(body, cyl(0.36, 0.36, 0.4, 16), rubber, [side * 0.95, 0.36, z], [0, 0, Math.PI / 2]);
    put(body, box(0.42, 0.04, 2.6), gloss(r.color), [side * 0.95, 0.75, 0]);
    put(body, box(0.5, 0.18, 0.3), steel, [side * 0.6, 0.62, 0]);
  }
  // A stand of toms, a crash, a ride and a hi-hat on top of the drum.
  const shell = matte(0xffffff, { map: tex('drum-wrap', () => sparkleTexture([184, 32, 42])) });
  for (const [x, z, rr] of [[-0.3, 0.45, 0.18], [0.3, 0.45, 0.18], [0.55, -0.1, 0.24]] as const) {
    put(body, cyl(rr, rr, 0.22, 18), shell, [x, 1.6, z], [0.4, 0, -x * 0.3]);
    put(body, cyl(rr - 0.01, rr - 0.01, 0.01, 18), head, [x, 1.72, z + 0.04], [0.4, 0, -x * 0.3]);
    rod(body, [x, 1.5, z], [x * 0.5, 1.4, z], 0.015, steel);
  }
  for (const [x, z, y, rr] of [[-0.65, 0.3, 2.05, 0.32], [0.7, 0.4, 2.0, 0.36], [-0.55, -0.35, 1.75, 0.22]] as const) {
    rod(body, [x, 1.4, z], [x, y, z], 0.015, steel);
    put(body, cyl(0.02, rr, 0.04, 24), brassMat, [x, y, z], [0.2, 0, x * 0.2]);
  }
  put(body, cyl(0.22, 0.02, 0.03, 24), brassMat, [-0.55, 1.79, -0.35]);

  // The gator sits at the back behind the kit.
  const d = new THREE.Group();
  d.position.set(0, 1.2, -0.55);
  put(d, ball(0.38), hide, [0, 0.35, 0], [0, 0, 0], [1, 1.1, 0.9]);
  put(d, ball(0.28), matte(0xe8e0a8), [0, 0.3, 0.12], [0, 0, 0], [0.9, 1, 0.7]);
  // A tail hanging down the back, ridged.
  for (let k = 0; k < 6; k++) {
    put(d, ball(0.2 - k * 0.025, 10, 8), hide, [0, 0.0 - k * 0.12, -0.3 - k * 0.12]);
    put(d, cone(0.05, 0.1, 4), hide, [0, 0.16 - k * 0.14, -0.3 - k * 0.12]);
  }
  // Sticks up mid-fill.
  for (const side of [-1, 1]) {
    const grip: [number, number, number] = [side * 0.42, 0.72, 0.55];
    arm(d, [side * 0.32, 0.55, 0.05], grip, 0.08, hide, hide);
    rod(d, grip, [side * 0.3, 0.95 + side * 0.08, 1.0], 0.015, matte(0xe8c890));
  }
  const gHead = new THREE.Group();
  gHead.position.set(0, 0.82, 0.05);
  put(gHead, ball(0.24), hide, [0, 0, 0], [0, 0, 0], [1.1, 0.8, 1]);
  // Long jaws with a row of teeth, eyes and nostrils on top.
  put(gHead, box(0.32, 0.1, 0.5), hide, [0, 0.0, 0.38]);
  put(gHead, box(0.3, 0.07, 0.48), hide, [0, -0.11, 0.36], [0.12, 0, 0]);
  for (let k = 0; k < 6; k++) for (const side of [-1, 1]) put(gHead, cone(0.018, 0.05, 4), matte(0xf8f4e0), [side * 0.14, -0.06, 0.2 + k * 0.07], [Math.PI, 0, 0]);
  for (const side of [-1, 1]) {
    put(gHead, ball(0.07, 10, 8), hide, [side * 0.1, 0.12, 0.1]);
    put(gHead, ball(0.05, 10, 8), glow(0xffd23a), [side * 0.1, 0.15, 0.14]);
    put(gHead, box(0.012, 0.06, 0.01), matte(0x050505), [side * 0.1, 0.15, 0.19]);
    put(gHead, ball(0.025, 6, 4), matte(0x1a2a10), [side * 0.05, 0.06, 0.62]);
  }
  // Headphones over the top.
  put(gHead, ring(0.27, 0.025, Math.PI), matte(0x1a1a1a), [0, 0.03, -0.02], [0, Math.PI / 2, 0]);
  for (const side of [-1, 1]) put(gHead, cyl(0.09, 0.09, 0.06, 14), gloss(r.color), [side * 0.27, 0.03, -0.02], [0, 0, Math.PI / 2]);
  d.add(gHead);
  body.add(d);

  const hub = matte(0x2a2a2a);
  return {
    body,
    wheels: [-1, 1].flatMap((side) => [-0.75, -0.25, 0.25, 0.75].map((z) => ({ x: side * 1.17, z, radius: 0.3, width: 0.06, front: false, material: hub }))),
    exhausts: [-0.35, 0.35].map((x) => new THREE.Vector3(x, 0.55, -1.0)),
    rearTrack: 0.95,
    rearZ: -1.1,
    spinners: [],
    shadow: [2.8, 3.4],
    head: gHead,
    treads: [{ map: treadMap, perMeter: 6 / 2.3 }],
  };
}

// ---- Mushroom Sage: bearded mushroom elder flying a toadstool saucer -----------

function mushroomSage(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const cap = matte(0xffffff, { map: tex('sage-cap', () => spotsTexture('#7a5adf', '#f4e8d0', 22)), shininess: 40, specular: 0x332244 });
  const stem = matte(r.accent);
  const gill = matte(0xc8b4e8, { side: THREE.DoubleSide });
  const saucer = new THREE.Group();
  saucer.position.y = 0.95;
  body.add(saucer);

  // A wide toadstool cap, flat on top where the sage sits; gills underneath; a stubby stem as the keel.
  put(saucer, new THREE.SphereGeometry(1.25, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), cap, [0, -0.2, 0], [0, 0, 0], [1, 0.42, 1.2]);
  put(saucer, new THREE.CircleGeometry(1.25, 28), gill, [0, -0.2, 0], [Math.PI / 2, 0, 0], [1, 1.2, 1]);
  for (let k = 0; k < 24; k++) put(saucer, box(0.015, 0.06, 1.0), gill, [0, -0.23, 0], [0, (k / 24) * Math.PI, 0]);
  put(saucer, ring(1.22, 0.06), stem, [0, -0.2, 0], [Math.PI / 2, 0, 0], [1, 1.2, 1]);
  put(saucer, cyl(0.32, 0.42, 0.55, 16), stem, [0, -0.48, 0]);
  put(saucer, ring(0.36, 0.05), matte(0xe8d8c0), [0, -0.35, 0], [Math.PI / 2, 0, 0]);
  // Glowing spore jets under the rim and a lamp at the keel.
  const pads: THREE.Object3D[] = [glowSprite(saucer, [0, -0.85, 0], 1.6, 0xb89aff)];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const p = [Math.sin(a) * 0.9, -0.3, Math.cos(a) * 1.05] as [number, number, number];
    put(saucer, ball(0.07, 8, 6), glow(0xd8c0ff), p);
    pads.push(glowSprite(saucer, [p[0], p[1] - 0.1, p[2]], 0.6, 0xb89aff));
  }
  // Small mushrooms sprouting on the cap, a moss rim round the seat.
  for (const [x, z, s] of [[0.7, 0.5, 1], [-0.75, 0.3, 0.8], [0.5, -0.7, 0.7], [-0.4, -0.8, 1.1]] as const) {
    put(saucer, cyl(0.03 * s, 0.04 * s, 0.14 * s, 8), matte(0xf0e8d0), [x, 0.18 - Math.hypot(x, z) * 0.12, z]);
    put(saucer, new THREE.SphereGeometry(0.09 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), gloss(0xff7a3a), [x, 0.25 - Math.hypot(x, z) * 0.12, z]);
  }
  put(saucer, ring(0.45, 0.07), matte(0x5a8a3a, { flatShading: true }), [0, 0.3, -0.1], [Math.PI / 2, 0, 0]);
  // Spores drifting round in a slow ring.
  const spores = new THREE.Group();
  spores.position.y = 0.2;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    put(spores, ball(0.035, 6, 4), glow(k % 2 ? 0xffe8a0 : 0xd8c0ff), [Math.sin(a) * 1.5, Math.sin(k * 1.7) * 0.25, Math.cos(a) * 1.6]);
  }
  saucer.add(spores);

  // The sage: a little mushroom elder with a great white beard and a staff.
  const d = new THREE.Group();
  d.position.set(0, 0.3, -0.1);
  put(d, cyl(0.2, 0.3, 0.55, 14), matte(0xe8dcc8), [0, 0.28, 0]);
  put(d, cone(0.32, 0.5, 14), matte(0x3a2a5a), [0, 0.2, 0]);
  for (const side of [-1, 1]) put(d, ball(0.08, 8, 6), matte(0x5a3a22), [side * 0.12, 0.0, 0.25], [0, 0, 0], [1, 0.6, 1.5]);
  // Staff topped with a glowing spore; the other hand on a carved tiller.
  rod(d, [0.38, -0.1, 0.25], [0.42, 1.25, 0.32], 0.025, matte(0x6a4a2a));
  put(d, ball(0.08, 10, 8), glow(0xd8c0ff), [0.42, 1.32, 0.32]);
  glowSprite(d, [0.42, 1.32, 0.32], 0.6, 0xb89aff);
  arm(d, [0.22, 0.45, 0.05], [0.4, 0.6, 0.28], 0.06, matte(0x3a2a5a), matte(0xe8d8c0));
  rod(d, [-0.25, 0.0, 0.5], [-0.25, 0.4, 0.45], 0.03, matte(0x6a4a2a));
  put(d, ball(0.06, 8, 6), matte(0x6a4a2a), [-0.25, 0.42, 0.45]);
  arm(d, [-0.22, 0.45, 0.05], [-0.25, 0.42, 0.45], 0.06, matte(0x3a2a5a), matte(0xe8d8c0));
  const head = new THREE.Group();
  head.position.set(0, 0.72, 0.02);
  put(head, ball(0.2, 14, 10), matte(0xf0e4d0), [0, 0, 0]);
  eyes(head, 0.04, 0.15, 0.08, 0.045, 0x6a4ad8, false);
  brows(head, 0.1, 0.18, 0.08, 0.09, matte(0xffffff), -0.3);
  put(head, ball(0.045, 8, 6), matte(0xe8a890), [0, -0.02, 0.2]);
  // The beard: a fan of cones down to the lap, a moustache over it.
  for (let k = 0; k < 7; k++) {
    const a = ((k - 3) / 3) * 0.6;
    put(head, cone(0.06, 0.45, 6), matte(0xffffff), [Math.sin(a) * 0.12, -0.27, 0.12 + Math.cos(a) * 0.04], [Math.PI - 0.25, 0, a * 0.6]);
  }
  for (const side of [-1, 1]) put(head, cone(0.035, 0.18, 6), matte(0xffffff), [side * 0.08, -0.06, 0.19], [0, 0, side * 2.0]);
  // Its own little cap, spotted like the saucer.
  put(head, new THREE.SphereGeometry(0.34, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap, [0, 0.1, 0], [0, 0, 0], [1, 0.75, 1]);
  put(head, new THREE.CircleGeometry(0.34, 18), gill, [0, 0.1, 0], [Math.PI / 2, 0, 0]);
  d.add(head);
  saucer.add(d);

  return {
    body,
    wheels: [],
    exhausts: [-0.5, 0.5].map((x) => new THREE.Vector3(x, 0.8, -1.3)),
    rearTrack: 0.8,
    rearZ: -0.9,
    spinners: [],
    shadow: [2.6, 3.0],
    rotors: [spores],
    hover: { bob: 0.16, pads },
    head,
  };
}

// ---- Octo Organist: octopus at the keys of a steam pipe-organ car --------------

function octoOrganist(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const paint = gloss(r.accent);
  const brassMat = brass();
  const skin = matte(0xffffff, { map: tex('octo', () => spotsTexture('#ff7aa8', '#ffc8dc', 30)), shininess: 60, specular: 0x553344 });
  const wood = matte(0x5a2a1a, { shininess: 50, specular: 0x442211 });

  // A carved organ cabinet on a low brass-trimmed chassis.
  put(body, box(1.3, 0.3, 2.5), paint, [0, 0.45, 0]);
  put(body, box(1.34, 0.06, 2.54), brassMat, [0, 0.62, 0]);
  put(body, box(1.0, 0.25, 0.5), paint, [0, 0.55, 1.25], [-0.15, 0, 0]);
  put(body, ring(0.2, 0.04, Math.PI), brassMat, [0, 0.5, 1.5], [0, 0, 0]);
  headlights(body, 0.38, 0.6, 1.5, 0.1, 0xfff0d0);
  put(body, box(1.2, 0.55, 0.9), wood, [0, 0.9, -0.75]);
  for (let k = 0; k < 4; k++) put(body, box(0.02, 0.4, 0.84), brassMat, [-0.6 + (k % 2) * 1.2, 0.9, -0.75]);
  // The pipes, tallest in the middle, flared mouths along the front.
  const pipeMat = chrome();
  for (let k = 0; k < 9; k++) {
    const x = -0.52 + k * 0.13;
    const h = 0.5 + (1 - Math.abs(k - 4) / 4) * 0.9;
    put(body, cyl(0.05, 0.05, h, 10), k % 2 ? brassMat : pipeMat, [x, 1.17 + h / 2, -0.95]);
    put(body, box(0.06, 0.04, 0.02), matte(0x111111), [x, 1.3, -0.9]);
    put(body, cone(0.05, 0.06, 10), k % 2 ? brassMat : pipeMat, [x, 1.17 + h + 0.03, -0.95], [Math.PI, 0, 0]);
  }
  for (let k = 0; k < 5; k++) put(body, cyl(0.04, 0.04, 0.4 + k * 0.08, 10), brassMat, [-0.4 + k * 0.2, 1.4 + k * 0.04, -1.15]);
  // The console: two manuals of keys and a row of stops.
  const keys = matte(0xffffff, { map: tex('keys', keysTexture) });
  const kMap = keys.map!.clone();
  kMap.needsUpdate = true;
  kMap.repeat.set(3, 1);
  keys.map = kMap;
  for (let k = 0; k < 2; k++) {
    put(body, box(0.95, 0.04, 0.18), keys, [0, 0.92 + k * 0.1, 0.35 - k * 0.12]);
    put(body, box(1.0, 0.1, 0.2), wood, [0, 0.87 + k * 0.1, 0.35 - k * 0.12]);
  }
  for (let k = 0; k < 8; k++) put(body, cyl(0.03, 0.03, 0.06, 10), matte([0xffffff, 0xd8302a, 0x2a2a2a, 0xffd23a][k % 4]), [-0.38 + k * 0.11, 1.2, 0.12], [Math.PI / 2, 0, 0]);
  put(body, box(1.0, 0.25, 0.04), wood, [0, 1.12, 0.1]);
  // Sheet music on a stand.
  put(body, box(0.4, 0.3, 0.01), matte(0xf4f0e0), [0, 1.42, 0.12], [-0.3, 0, 0]);
  for (let k = 0; k < 4; k++) put(body, box(0.34, 0.008, 0.012), matte(0x2a2a2a), [0, 1.33 + k * 0.05, 0.135], [-0.3, 0, 0]);

  // The octopus: a bulbous mantle, big eyes, a monocle and a little top hat, eight arms busy everywhere.
  const d = new THREE.Group();
  d.position.set(0, 0.7, -0.15);
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0);
  put(head, ball(0.38, 18, 14), skin, [0, 0.2, -0.12], [-0.4, 0, 0], [1, 1.3, 1]);
  put(head, ball(0.3, 16, 12), skin, [0, -0.05, 0.05]);
  eyes(head, 0.02, 0.22, 0.15, 0.09, 0xffb030, false);
  put(head, ring(0.1, 0.012), brassMat, [0.15, 0.02, 0.32]);
  rod(head, [0.25, 0.0, 0.3], [0.3, -0.35, 0.2], 0.004, brassMat);
  put(head, cyl(0.15, 0.15, 0.02, 16), matte(0x1a1a1a), [-0.05, 0.6, -0.15], [-0.35, 0, 0.2]);
  put(head, cyl(0.1, 0.1, 0.22, 16), matte(0x1a1a1a), [-0.05, 0.71, -0.19], [-0.35, 0, 0.2]);
  put(head, cyl(0.105, 0.105, 0.04, 16), matte(r.color), [-0.05, 0.64, -0.17], [-0.35, 0, 0.2]);
  d.add(head);
  // Arms: two on the manuals, two on the steering, two on the stops and pipes, two curling over the sides.
  const curl = (from: [number, number, number], ctrl: [number, number, number], to: [number, number, number], r0: number) => {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...from), new THREE.Vector3(...ctrl), new THREE.Vector3(...to));
    const geo = new THREE.TubeGeometry(curve, 12, r0, 8, false);
    // Taper toward the tip.
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const c = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.floor(i / 9) / 12;
      curve.getPoint(t, c);
      p.fromBufferAttribute(pos, i).sub(c).multiplyScalar(1 - t * 0.7).add(c);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    const m = new THREE.Mesh(geo, skin);
    d.add(m);
    put(d, ball(r0 * 0.4, 6, 4), skin, to);
  };
  curl([-0.15, 0.4, 0.15], [-0.3, 0.3, 0.4], [-0.3, 0.32, 0.5], 0.06);
  curl([0.15, 0.4, 0.15], [0.3, 0.3, 0.4], [0.25, 0.42, 0.42], 0.06);
  curl([-0.2, 0.45, 0.05], [-0.45, 0.6, 0.6], [-0.2, 0.15, 0.95], 0.06);
  curl([0.2, 0.45, 0.05], [0.45, 0.6, 0.6], [0.2, 0.15, 0.95], 0.06);
  curl([-0.25, 0.5, -0.05], [-0.6, 0.9, 0.1], [-0.35, 0.52, 0.28], 0.05);
  curl([0.25, 0.5, -0.1], [0.5, 1.2, -0.5], [0.35, 1.7, -0.95], 0.05);
  curl([-0.3, 0.35, -0.1], [-0.9, 0.2, -0.2], [-0.75, -0.1, 0.3], 0.06);
  curl([0.3, 0.35, -0.1], [0.9, 0.2, -0.3], [0.75, -0.1, -0.6], 0.06);
  // A small steering wheel low in front of it.
  put(d, ring(0.15, 0.025), brassMat, [0, 0.15, 0.95], [-0.6, 0, 0]);
  body.add(d);

  const spokeWheel = brassMat;
  return {
    body,
    wheels: [
      { x: 0.72, z: 0.95, radius: 0.3, width: 0.2, front: true, material: rubberMat() },
      { x: -0.72, z: 0.95, radius: 0.3, width: 0.2, front: true, material: rubberMat() },
      { x: 0.82, z: -0.8, radius: 0.52, width: 0.28, front: false, material: spokeWheel },
      { x: -0.82, z: -0.8, radius: 0.52, width: 0.28, front: false, material: spokeWheel },
    ],
    exhausts: pipes(body, 0.4, 0.5, -1.3, 0.1),
    rearTrack: 0.82,
    rearZ: -0.85,
    spinners: [],
    shadow: [2.4, 3.2],
    head,
  };
}

// ---- The band: stylized cartoons, each in a vehicle built from his instrument --

interface Look {
  skin: number;
  hair: number;
  style: 'long' | 'curly' | 'short' | 'shaggy' | 'mop' | 'bob' | 'wavy' | 'tousled' | 'mullet';
  /** Coveralls: the colour, the trim (patch border, cuffs, collar) and the name on the patch. */
  shirt: number;
  trim?: number;
  name: string;
  iris?: number;
  beard?: number;
  /** A moustache, and nothing else on the chin. */
  moustache?: number;
  /** A few days' growth: a shadow on the jaw and lip rather than a beard. */
  stubble?: number;
  /** Narrower (under 1) or wider face. */
  faceWidth?: number;
  /** Lighter ends to the hair, sun-bleached. */
  tips?: number;
  /** Sunglasses: black wraparound lenses. */
  shades?: boolean;
  /** Frames: rectangular glasses in this colour. */
  glasses?: number;
  hat?: { color: number; kind: 'bucket' | 'cap' | 'beanie' };
  headphones?: number;
}

/** Big-head mode: how much larger than life the heads are. */
const BIG_HEAD = 1.45;

/** Work coveralls wrapped round a cylinder: a zip down the front, a chest pocket, a name patch. */
function coverallTexture(color: number, trim: number, name: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  g.fillStyle = hex(color);
  g.fillRect(0, 0, 256, 256);
  // Seams down the sides and a darker fold or two, so it reads as cloth.
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(62, 0, 4, 256);
  g.fillRect(190, 0, 4, 256);
  // The zip.
  g.fillStyle = '#c8c8c8';
  g.fillRect(126, 0, 4, 256);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 4; y < 256; y += 8) g.fillRect(124, y, 8, 2);
  // A chest pocket with a flap on the left, the name patch on the right.
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 3;
  g.strokeRect(84, 60, 32, 36);
  g.fillStyle = 'rgba(0,0,0,0.15)';
  g.fillRect(84, 60, 32, 10);
  g.fillStyle = '#f8f4e8';
  g.beginPath();
  g.ellipse(160, 74, 26, 14, 0, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = hex(trim);
  g.stroke();
  g.font = 'italic 900 15px "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = hex(trim);
  g.fillText(name.toUpperCase(), 160, 75, 46);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  // A cylinder's seam is at the front: turn the zip round to face forward.
  t.offset.x = 0.5;
  return t;
}

/**
 * A cartoon musician from the waist up at `d`, facing +z, in the NBA Jam
 * manner: a big sculpted head on a smaller body, here in work coveralls.
 * Returns the head (unrotated, for the lean animation).
 */
function musician(d: THREE.Group, look: Look): THREE.Group {
  const skin = matte(look.skin, { shininess: 25, specular: 0x221a14 });
  const shade = matte(new THREE.Color(look.skin).multiplyScalar(0.82).getHex());
  const hair = matte(look.hair, { flatShading: true, shininess: 40, specular: 0x333333 });
  const suit = matte(0xffffff, { map: coverallTexture(look.shirt, look.trim ?? 0xffffff, look.name) });
  const cloth = matte(look.shirt);
  const collar = matte(look.trim ?? look.shirt);
  // Torso in coveralls, shoulders rounded, a collar folded down round the neck.
  put(d, cyl(0.25, 0.3, 0.58, 20), suit, [0, 0.34, 0]);
  for (const side of [-1, 1]) {
    put(d, ball(0.11, 12, 8), cloth, [side * 0.27, 0.58, 0]);
    put(d, box(0.13, 0.03, 0.1), collar, [side * 0.07, 0.66, 0.15], [0.5, 0, side * -0.5]);
  }
  put(d, cyl(0.14, 0.14, 0.05, 16), collar, [0, 0.65, 0]);
  put(d, cyl(0.1, 0.12, 0.16, 12), skin, [0, 0.72, 0]);

  const head = new THREE.Group();
  head.position.set(0, 1.0, 0.02);
  head.scale.set(BIG_HEAD * (look.faceWidth ?? 1), BIG_HEAD, BIG_HEAD);
  // Skull, jaw, cheekbones, brow.
  put(head, ball(0.25, 20, 16), skin, [0, 0.02, -0.01], [0, 0, 0], [0.92, 1.06, 1]);
  put(head, ball(0.2, 16, 12), skin, [0, -0.1, 0.04], [0, 0, 0], [0.95, 0.8, 1]);
  // Cheekbones: soft, set back into the face rather than puffed out.
  for (const side of [-1, 1]) put(head, ball(0.07, 12, 10), skin, [side * 0.115, -0.035, 0.145], [0, 0, 0], [1, 0.75, 0.6]);
  put(head, box(0.32, 0.04, 0.07), skin, [0, 0.095, 0.2]);
  // Eyes: sclera, iris, pupil, a glint, and a lid over the top.
  const iris = matte(look.iris ?? 0x4a3020, { shininess: 80, specular: 0xffffff });
  for (const side of [-1, 1]) {
    const x = side * 0.085;
    put(head, ball(0.05, 12, 10), matte(0xfaf6ec, { shininess: 60 }), [x, 0.035, 0.205], [0, 0, 0], [1.25, 0.85, 0.7]);
    put(head, ball(0.028, 10, 8), iris, [x, 0.035, 0.235]);
    put(head, ball(0.014, 8, 6), matte(0x050505), [x, 0.035, 0.252]);
    put(head, ball(0.007, 6, 4), glow(0xffffff), [x + 0.008, 0.045, 0.258]);
    put(head, new THREE.SphereGeometry(0.054, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), skin, [x, 0.047, 0.201], [-0.42, 0, 0], [1.25, 0.8, 0.75]);
    // Brows: the hair colour, thick and arched.
    put(head, box(0.11, 0.026, 0.03), hair, [x, 0.125, 0.225], [0, 0, side * -0.18]);
    // Ears with a shaded hollow.
    put(head, ball(0.06, 10, 8), skin, [side * 0.24, 0, 0], [0, 0, 0], [0.45, 1, 0.7]);
    put(head, ball(0.035, 8, 6), shade, [side * 0.255, 0, 0.01], [0, 0, 0], [0.3, 0.8, 0.5]);
  }
  // Nose: bridge, tip, nostril wings.
  put(head, box(0.045, 0.12, 0.05), skin, [0, 0.0, 0.245], [-0.2, 0, 0]);
  put(head, ball(0.04, 10, 8), skin, [0, -0.055, 0.27]);
  for (const side of [-1, 1]) put(head, ball(0.024, 8, 6), shade, [side * 0.032, -0.065, 0.255]);
  // A grin: a dark mouth, a curved row of upper teeth inside it, and lips round it.
  const lip = matte(new THREE.Color(look.skin).lerp(new THREE.Color(0xb05a50), 0.55).getHex(), { shininess: 40 });
  put(head, ball(0.065, 14, 10), matte(0x2a0808), [0, -0.122, 0.205], [0, 0, 0], [1.2, 0.5, 0.5]);
  put(head, new THREE.SphereGeometry(0.06, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), matte(0xfaf8f0, { shininess: 90, specular: 0x666666 }), [0, -0.104, 0.214], [Math.PI, 0, 0], [1.15, 0.42, 0.55]);
  put(head, new THREE.TorusGeometry(0.072, 0.011, 6, 18, Math.PI), lip, [0, -0.12, 0.215], [0.35, 0, Math.PI]);
  put(head, new THREE.TorusGeometry(0.07, 0.009, 6, 18, Math.PI), lip, [0, -0.104, 0.218], [-0.2, 0, 0], [1, 0.25, 1]);
  if (look.beard !== undefined) {
    const beard = matte(look.beard, { flatShading: true });
    put(head, ball(0.2, 14, 10), beard, [0, -0.17, 0.08], [0, 0, 0], [1.05, 0.62, 0.85]);
    for (const side of [-1, 1]) put(head, ball(0.09, 10, 8), beard, [side * 0.15, -0.09, 0.1], [0, 0, 0], [0.6, 1.1, 1]);
    for (const side of [-1, 1]) put(head, ball(0.05, 10, 8), beard, [side * 0.045, -0.085, 0.25], [0, 0, side * 0.3], [1.3, 0.55, 0.6]);
  }
  if (look.moustache !== undefined) {
    const tache = matte(look.moustache, { flatShading: true });
    for (const side of [-1, 1]) put(head, ball(0.045, 10, 8), tache, [side * 0.035, -0.083, 0.258], [0, 0, side * 0.35], [1.25, 0.42, 0.5]);
  }
  if (look.stubble !== undefined) {
    // A shadow of the hair colour over the skin, not a beard.
    const shadow = matte(new THREE.Color(look.skin).lerp(new THREE.Color(look.stubble), 0.6).getHex(), { transparent: true, opacity: 0.6 });
    put(head, ball(0.205, 14, 10), shadow, [0, -0.115, 0.05], [0, 0, 0], [0.97, 0.76, 1.0]);
    for (const side of [-1, 1]) put(head, ball(0.04, 8, 6), shadow, [side * 0.04, -0.08, 0.262], [0, 0, side * 0.3], [1.3, 0.45, 0.4]);
  }
  if (look.shades) {
    const black = matte(0x0a0a0c, { shininess: 140, specular: 0xaaaaaa });
    for (const side of [-1, 1]) put(head, ball(0.07, 14, 10), black, [side * 0.088, 0.035, 0.235], [0, 0, side * -0.1], [1.25, 0.72, 0.45]);
    put(head, box(0.34, 0.025, 0.03), black, [0, 0.075, 0.245]);
    for (const side of [-1, 1]) put(head, box(0.014, 0.018, 0.24), black, [side * 0.18, 0.07, 0.13]);
  }
  if (look.glasses !== undefined) {
    const frame = matte(look.glasses, { shininess: 70, specular: 0x444444 });
    const lens = matte(0x223040, { transparent: true, opacity: 0.35, shininess: 120, specular: 0xffffff });
    for (const side of [-1, 1]) {
      const x = side * 0.09;
      put(head, box(0.13, 0.085, 0.015), lens, [x, 0.035, 0.262]);
      put(head, box(0.14, 0.016, 0.02), frame, [x, 0.082, 0.262]);
      put(head, box(0.14, 0.012, 0.02), frame, [x, -0.01, 0.262]);
      put(head, box(0.012, 0.09, 0.02), frame, [side * 0.159, 0.035, 0.262]);
      put(head, box(0.012, 0.09, 0.02), frame, [side * 0.021, 0.035, 0.262]);
      put(head, box(0.012, 0.016, 0.24), frame, [side * 0.165, 0.075, 0.14]);
    }
    put(head, box(0.04, 0.012, 0.02), frame, [0, 0.06, 0.262]);
  }
  // Hair, built up from clumps so it has some volume and shape.
  const clump = (pos: [number, number, number], size: number, stretch: [number, number, number], rot: [number, number, number] = [0, 0, 0]) => put(head, ball(size, 8, 6), hair, pos, rot, stretch);
  // The scalp: a full cap of hair, or only the crown for short back and sides.
  if (look.style === 'short') put(head, new THREE.SphereGeometry(0.264, 18, 8, 0, Math.PI * 2, 0, Math.PI / 3.3), hair, [0, 0.07, -0.02], [-0.1, 0, 0], [1, 1.05, 1.05]);
  else put(head, new THREE.SphereGeometry(0.265, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair, [0, 0.06, -0.02], [-0.15, 0, 0], [1, 0.95, 1.05]);
  switch (look.style) {
    case 'long':
      // Long and straight-ish, down past the shoulders: a curtain behind, a lock either side of the face, parted in the middle.
      for (let k = 0; k < 16; k++) {
        const a = Math.PI * (-0.12 + (k / 15) * 1.24);
        const x = Math.cos(a) * 0.255;
        clump([x, -0.2 - (k % 3) * 0.025, -Math.sin(a) * 0.19 - 0.02], 0.08, [0.75, 2.8, 0.8], [0, 0, x * 0.35]);
      }
      for (const side of [-1, 1]) {
        clump([side * 0.2, -0.1, 0.12], 0.07, [0.7, 2.6, 0.8], [0.1, 0, side * 0.12]);
      }
      // A loose fringe across the brow, parted in the middle.
      for (const x of [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15]) clump([x, 0.15, 0.205 - Math.abs(x) * 0.25], 0.05, [0.9, 2, 0.5], [0.3, 0, x * 1.8]);
      break;
    case 'curly':
      for (let k = 0; k < 34; k++) {
        const a = (k * 2.399) % (Math.PI * 2);
        const h = (k * 0.618) % 1;
        const r = 0.24 + 0.03 * Math.sin(k * 3.1);
        const up = 0.05 + h * 0.25;
        if (Math.sin(a) > 0.55 && up < 0.18) continue; // keep the face clear
        clump([Math.cos(a) * r, up, Math.sin(a) * r - 0.04], 0.075, [1, 1, 1]);
      }
      break;
    case 'shaggy':
      for (let k = 0; k < 10; k++) {
        const a = Math.PI * (0.05 + (k / 9) * 0.9);
        clump([Math.cos(a) * 0.25, -0.05 - (k % 2) * 0.04, -Math.sin(a) * 0.16], 0.07, [0.8, 1.8, 0.8]);
      }
      for (let k = -2; k <= 2; k++) clump([k * 0.07, 0.16, 0.19], 0.05, [0.8, 1.4, 0.6], [0.6, 0, k * 0.25]);
      break;
    case 'short':
      // Short back and sides, a mop of tight curls on top.
      for (let k = 0; k < 22; k++) {
        const a = (k * 2.399) % (Math.PI * 2);
        const r = 0.05 + ((k * 0.618) % 1) * 0.13;
        clump([Math.cos(a) * r, 0.27 + (0.18 - r) * 0.4, Math.sin(a) * r * 0.9 + 0.03], 0.048, [1, 1, 1]);
      }
      for (let k = 0; k < 4; k++) clump([-0.09 + k * 0.06, 0.24, 0.16], 0.046, [1, 1, 0.9]);
      break;
    case 'mop': {
      // A big head of curls down to the neck, a few falling over the brow: curls scattered over the
      // whole scalp and the back and sides, the face left clear.
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let k = 0; k < 70; k++) {
        const a = rnd() * Math.PI * 2;
        const up = -0.22 + rnd() * 0.5;
        const front = Math.sin(a);
        if (front > 0.35 && up < 0.2) continue;
        const r = (up > 0.12 ? 0.26 - (up - 0.12) * 0.6 : 0.265) + rnd() * 0.02;
        clump([Math.cos(a) * r, up, front * r * 0.85 - 0.04], 0.06 + rnd() * 0.02, [1, 1.1, 1]);
      }
      for (const [x, y] of [[-0.15, 0.17], [-0.06, 0.2], [0.05, 0.19], [0.14, 0.15], [-0.19, 0.08], [0.2, 0.06]]) clump([x, y, 0.19], 0.065, [1, 1.3, 0.8]);
      break;
    }
    case 'mullet':
    case 'tousled': {
      // Jaw-length waves pushed up and back off the forehead, full at the sides, every lock at its own angle.
      const tip = look.tips !== undefined ? matte(look.tips, { flatShading: true, shininess: 40, specular: 0x333333 }) : hair;
      let seed = 11;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let k = 0; k < 22; k++) {
        const a = Math.PI * (-0.18 + (k / 21) * 1.36);
        const y = -0.08 + (k % 3) * 0.06 + rnd() * 0.03;
        const lock = clump([Math.cos(a) * (0.255 + rnd() * 0.02), y, -Math.sin(a) * 0.19 - 0.02], 0.065 + rnd() * 0.012, [0.8, 1.6, 0.8], [rnd() - 0.5, 0, (rnd() - 0.5) * 0.9 + Math.cos(a) * 0.4]);
        if (k % 3 === 0) lock.material = tip;
      }
      // The crown, heaped up and swept to one side; a lock lifting off the hairline.
      for (let k = 0; k < 9; k++) {
        const x = -0.18 + k * 0.045;
        clump([x, 0.225 + Math.sin(k) * 0.015, 0.02 - Math.abs(x) * 0.2 + rnd() * 0.04], 0.065, [1.1, 0.75, 1.4], [-0.5 + rnd() * 0.3, 0, -0.35 + rnd() * 0.3]);
      }
      for (let k = 0; k < 4; k++) clump([-0.08 + k * 0.07, 0.2 + k * 0.012, 0.15], 0.06, [1.2, 0.7, 1.1], [-0.7, 0, -0.5]).material = k % 2 ? tip : hair;
      for (const side of [-1, 1]) clump([side * 0.23, 0.11, 0.1], 0.06, [0.8, 1.4, 0.8], [0.3, 0, side * 0.3]);
      // A mullet: longer at the back, flicking out at the nape.
      if (look.style === 'mullet')
        for (let k = 0; k < 9; k++) {
          const a = Math.PI * (0.12 + (k / 8) * 0.76);
          clump([Math.cos(a) * 0.25, -0.2 - (k % 2) * 0.03, -Math.sin(a) * 0.2 - 0.03], 0.07, [0.85, 1.8, 0.85], [-0.35, 0, Math.cos(a) * 0.9]);
        }
      break;
    }
    case 'wavy':
      // Ear-length waves swept back off a high forehead.
      for (let k = 0; k < 16; k++) {
        const a = Math.PI * (-0.15 + (k / 15) * 1.3);
        clump([Math.cos(a) * 0.265, -0.02 + (k % 2) * 0.05, -Math.sin(a) * 0.2 - 0.03], 0.08, [0.9, 1.5, 0.9]);
      }
      for (let k = 0; k < 5; k++) clump([-0.12 + k * 0.06, 0.25, 0.08 - k * 0.0], 0.075, [0.8, 0.8, 1.9], [-0.3, 0, (k - 2) * 0.12]);
      break;
    case 'bob':
      // A fringe straight across the brow and a bob cut level with the jaw.
      for (let k = 0; k < 13; k++) {
        const a = Math.PI * (-0.1 + (k / 12) * 1.2);
        clump([Math.cos(a) * 0.255, -0.06, -Math.sin(a) * 0.2 + 0.0], 0.075, [0.8, 2.1, 0.8]);
      }
      for (let k = -3; k <= 3; k++) clump([k * 0.055, 0.15, 0.2 - Math.abs(k) * 0.012], 0.055, [0.9, 1.5, 0.6], [0.35, 0, k * 0.08]);
      break;
  }
  if (look.hat) {
    const hat = matte(look.hat.color);
    if (look.hat.kind === 'bucket') {
      put(head, cyl(0.2, 0.26, 0.2, 18), hat, [0, 0.28, -0.01]);
      put(head, cyl(0.42, 0.42, 0.03, 22), hat, [0, 0.18, -0.01], [0.08, 0, 0]);
      put(head, ring(0.215, 0.015), matte(0x1a1a1a), [0, 0.22, -0.01], [Math.PI / 2, 0, 0]);
    } else if (look.hat.kind === 'cap') {
      put(head, new THREE.SphereGeometry(0.275, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hat, [0, 0.1, -0.02]);
      put(head, box(0.32, 0.03, 0.24), hat, [0, 0.11, 0.27], [0.15, 0, 0]);
      put(head, ball(0.025, 6, 4), hat, [0, 0.37, -0.02]);
    } else {
      put(head, new THREE.SphereGeometry(0.275, 16, 8, 0, Math.PI * 2, 0, Math.PI / 1.9), hat, [0, 0.08, -0.02], [0, 0, 0], [1.03, 1.15, 1.03]);
      put(head, ring(0.265, 0.04), hat, [0, 0.1, -0.02], [Math.PI / 2, 0, 0]);
    }
  }
  if (look.headphones !== undefined) {
    const hp = gloss(look.headphones);
    put(head, ring(0.3, 0.025, Math.PI), hp, [0, 0.03, 0], [0, Math.PI / 2, 0]);
    for (const side of [-1, 1]) {
      put(head, cyl(0.09, 0.09, 0.07, 16), hp, [side * 0.29, 0, 0], [0, 0, Math.PI / 2]);
      put(head, cyl(0.07, 0.07, 0.072, 16), matte(0x111111), [side * 0.295, 0, 0], [0, 0, Math.PI / 2]);
    }
  }
  d.add(head);
  return head;
}

/** A hand closed round a grip: palm, four curled fingers and a thumb, the sleeve's cuff behind. */
function hand(parent: THREE.Object3D, at: [number, number, number], skin: THREE.Material, band: THREE.Material): void {
  const h = new THREE.Group();
  h.position.set(...at);
  put(h, ball(0.065, 10, 8), skin, [0, 0, 0], [0, 0, 0], [1, 0.8, 1.1]);
  for (let k = 0; k < 4; k++) put(h, cyl(0.02, 0.018, 0.08, 6), skin, [-0.045 + k * 0.03, 0.035, 0.05], [1.2, 0, 0]);
  put(h, cyl(0.022, 0.02, 0.07, 6), skin, [0.06, 0.02, 0.02], [0.6, 0, -0.8]);
  put(h, cyl(0.06, 0.06, 0.06, 12), band, [0, -0.02, -0.08], [Math.PI / 2, 0, 0]);
  parent.add(h);
}

/** Coverall sleeves from a musician's shoulders (torso at `d`) to two grips, cuffs in the trim colour, hands bare. */
function musicianArms(d: THREE.Group, look: Look, grips: [number, number, number][]): void {
  const skin = matte(look.skin, { shininess: 25, specular: 0x221a14 });
  const sleeve = matte(look.shirt);
  const cuff = matte(look.trim ?? look.shirt);
  grips.forEach((g, k) => {
    const side = k ? 1 : -1;
    const shoulder: [number, number, number] = [side * 0.29, 0.56, 0.0];
    const elbow: [number, number, number] = [(shoulder[0] + g[0]) / 2 + side * 0.09, Math.min(shoulder[1], g[1]) - 0.08, (shoulder[2] + g[2]) / 2];
    rod(d, shoulder, elbow, 0.085, sleeve, 0.075);
    put(d, ball(0.075, 8, 6), sleeve, elbow);
    rod(d, elbow, g, 0.072, sleeve, 0.065);
    hand(d, g, skin, cuff);
  });
}

// Stu Mackenzie: frontman, guitar and flute, riding the Flying Microtonal Banana: a giant banana
// that is also a guitar, its neck fretted in quarter tones.
function stuMackenzie(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const steel = chrome();
  // The banana: a five-ridged tube along a curve that rises at both ends, fat in the middle, tapering to the tips.
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.95, -1.75),
    new THREE.Vector3(0, 0.52, -1.0),
    new THREE.Vector3(0, 0.42, 0),
    new THREE.Vector3(0, 0.52, 1.0),
    new THREE.Vector3(0, 0.98, 1.72),
  ]);
  const rings = 48;
  const peel = new THREE.TubeGeometry(path, rings, 1, 5, false);
  const pos = peel.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const u = Math.floor(i / 6) / rings;
    const c = path.getPointAt(u);
    const radius = 0.08 + 0.5 * Math.pow(Math.sin(Math.PI * u), 0.55);
    v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(radius).add(c);
    // A little wider than tall, so it sits like a hull.
    v.x *= 1.1;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  peel.computeVertexNormals();
  put(body, peel, gloss(r.color, { flatShading: true, shininess: 60 }), [0, 0, 0]);
  // Brown freckles and the dark tips.
  const freckle = matte(0x6a4a1a);
  for (let k = 0; k < 14; k++) {
    const u = 0.15 + ((k * 0.37) % 0.7);
    const c = path.getPointAt(u);
    const side = k % 2 ? 1 : -1;
    put(body, ball(0.035 + (k % 3) * 0.01, 6, 4), freckle, [side * (0.5 - Math.abs(u - 0.5) * 0.6), c.y + 0.05, c.z]);
  }
  put(body, ball(0.09, 8, 6), matte(0x2a1a0a), path.getPointAt(0).toArray() as [number, number, number]);
  // The stalk at the front is the headstock, tuning pegs either side.
  const tip = path.getPointAt(1);
  put(body, cyl(0.07, 0.09, 0.42, 8), matte(0x5a4a1a), [0, tip.y + 0.12, tip.z + 0.1], [-0.6, 0, 0]);
  for (const side of [-1, 1]) for (let k = 0; k < 3; k++) put(body, cyl(0.025, 0.025, 0.14, 8), steel, [side * 0.1, tip.y + 0.06 + k * 0.06, tip.z - 0.02 + k * 0.05], [0, 0, Math.PI / 2]);
  // The fretboard down the top of the front half: frets in quarter tones (every other one a short fret between the normal ones).
  const board = new THREE.Group();
  for (let k = 0; k < 16; k++) {
    const u = 0.58 + k * 0.022;
    const c = path.getPointAt(u);
    const t = path.getTangentAt(u);
    const top = c.y + (0.08 + 0.5 * Math.pow(Math.sin(Math.PI * u), 0.55)) * 0.95;
    put(board, box(0.26, 0.04, 0.075), matte(0x3a2214), [0, top, c.z], [-Math.atan2(t.y, t.z), 0, 0]);
    put(board, box(k % 2 ? 0.13 : 0.26, 0.014, 0.012), steel, [0, top + 0.026, c.z + 0.03], [-Math.atan2(t.y, t.z), 0, 0]);
  }
  body.add(board);
  // Strings from the tailpiece behind the driver to the stalk.
  const strings = new THREE.CatmullRomCurve3([0.48, 0.6, 0.7, 0.8, 0.92].map((u) => {
    const c = path.getPointAt(u);
    return new THREE.Vector3(0, c.y + (0.08 + 0.5 * Math.pow(Math.sin(Math.PI * u), 0.55)) * 0.95 + 0.04, c.z);
  }));
  for (let k = 0; k < 6; k++) put(body, new THREE.TubeGeometry(strings, 24, 0.005, 4, false), steel, [-0.075 + k * 0.03, 0, 0]);
  // A red pickguard and two pickups in front of the seat.
  put(body, cyl(0.3, 0.3, 0.03, 20), matte(0xb8201a, { shininess: 50 }), [0.12, 0.98, 0.3], [0.05, 0, 0], [1, 1, 1.5]);
  for (let k = 0; k < 2; k++) put(body, box(0.24, 0.05, 0.1), matte(0x111111), [0, 1.0, 0.18 + k * 0.22]);
  headlights(body, 0.32, 0.62, 1.22, 0.07);

  const look: Look = { skin: 0xf2caa8, hair: 0x6a4626, tips: 0x9a7244, style: 'tousled', shirt: 0x2a5a8a, trim: 0xffd23a, name: 'Stu', iris: 0x5a86a8, faceWidth: 0.92 };
  const d = new THREE.Group();
  // Astride the banana, behind the pickups.
  d.position.set(0, 0.8, -0.35);
  const head = musician(d, look);
  const grips = steeringWheel(d, 0.42, 0.62, 0.2);
  musicianArms(d, look, grips);
  // A flute slung across his back.
  put(d, cyl(0.035, 0.035, 1.3, 10), steel, [0, 0.55, -0.32], [0, 0, 1.1]);
  for (let k = 0; k < 5; k++) put(d, cyl(0.02, 0.02, 0.02, 6), matte(0x222222), [-0.3 + k * 0.13, 0.42 + k * 0.06, -0.36], [Math.PI / 2, 0, 0]);
  body.add(d);
  return {
    body,
    wheels: [
      { x: 0.7, z: 0.95, radius: 0.32, width: 0.26, front: true },
      { x: -0.7, z: 0.95, radius: 0.32, width: 0.26, front: true },
      { x: 0.82, z: -0.8, radius: 0.44, width: 0.38, front: false },
      { x: -0.82, z: -0.8, radius: 0.44, width: 0.38, front: false },
    ],
    exhausts: pipes(body, 0.32, 0.5, -1.3),
    rearTrack: 0.82,
    rearZ: -0.9,
    spinners: [],
    shadow: [2.4, 3.6],
    head,
  };
}

// Ambrose Kenny-Smith: harmonica and keys, in a racer that is one long chrome harmonica.
function ambroseKennySmith(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const plate = chrome();
  const comb = gloss(r.color);
  // The comb (coloured) between two chrome cover plates, the holes along both flanks.
  put(body, box(1.0, 0.36, 2.7), comb, [0, 0.5, 0]);
  for (const y of [0.31, 0.69]) put(body, box(1.08, 0.06, 2.8), plate, [0, y, 0]);
  for (const side of [-1, 1]) for (let k = 0; k < 10; k++) put(body, box(0.02, 0.16, 0.16), matte(0x0a0a0a), [side * 0.51, 0.5, -1.15 + k * 0.255]);
  // Rounded plate ends, a keyboard on the dash.
  for (const z of [1.4, -1.4]) put(body, cyl(0.2, 0.2, 1.08, 12), plate, [0, 0.5, z], [0, 0, Math.PI / 2], [1, 1, 0.6]);
  const keys = new THREE.Group();
  keys.position.set(0, 0.74, 0.75);
  for (let k = 0; k < 8; k++) put(keys, box(0.09, 0.04, 0.3), matte(0xf4f0e4), [-0.35 + k * 0.1, 0, 0]);
  for (const k of [0, 1, 3, 4, 5]) put(keys, box(0.05, 0.05, 0.18), matte(0x111111), [-0.3 + k * 0.1, 0.03, -0.06]);
  body.add(keys);
  headlights(body, 0.35, 0.5, 1.55, 0.08);

  const look: Look = { skin: 0xf0c4a4, hair: 0x1e1410, style: 'mullet', shirt: r.accent, trim: 0xffffff, name: 'Amby', moustache: 0x1e1410, faceWidth: 0.94, iris: 0x3a2a1a };
  const d = new THREE.Group();
  d.position.set(0, 0.7, -0.35);
  const head = musician(d, look);
  // One hand on the keys, the other raising a harmonica to the sky.
  musicianArms(d, look, [[-0.25, 0.1, 1.05], [0.5, 1.3, 0.3]]);
  put(d, box(0.32, 0.08, 0.1), plate, [0.5, 1.4, 0.32]);
  body.add(d);
  return {
    body,
    wheels: [0.72, -0.72].flatMap((x) => [
      { x, z: 0.95, radius: 0.32, width: 0.24, front: true },
      { x, z: -0.95, radius: 0.36, width: 0.3, front: false },
    ]),
    exhausts: pipes(body, 0.3, 0.5, -1.55, 0.09),
    rearTrack: 0.72,
    rearZ: -1.05,
    spinners: [],
    shadow: [2.2, 3.4],
    head,
  };
}

// Cook Craig: guitar and synth, riding a hybrid of the two: an angular keytar
// body with a keyboard down the deck, synth knobs and a pitch wheel, strings
// running over the keys and a fretted neck out front.
function cookCraig(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const finish = gloss(r.color, { shininess: 110 });
  const steel = chrome();
  // The wedge body: two angled slabs meeting at the tail, a pointed horn either side.
  put(body, box(1.3, 0.3, 2.1), finish, [0, 0.48, -0.15]);
  for (const side of [-1, 1]) {
    put(body, box(0.5, 0.3, 1.1), finish, [side * 0.72, 0.48, 0.25], [0, side * 0.45, 0]);
    put(body, cone(0.12, 0.5, 4), finish, [side * 0.72, 0.62, 0.95], [Math.PI / 2 - 0.3, 0, 0]);
  }
  // A keyboard down the middle of the deck, two octaves.
  const keys = new THREE.Group();
  keys.position.set(0, 0.645, -0.05);
  for (let k = 0; k < 14; k++) put(keys, box(0.075, 0.035, 0.36), matte(0xf4f0e4, { shininess: 60 }), [-0.49 + k * 0.077, 0, 0]);
  for (let k = 0; k < 13; k++) if (k % 7 !== 2 && k % 7 !== 6) put(keys, box(0.045, 0.04, 0.22), matte(0x111111), [-0.45 + k * 0.077, 0.025, -0.07]);
  body.add(keys);
  // Strings running the length of it, over the keys and up the neck.
  for (let k = 0; k < 6; k++) put(body, box(0.005, 0.005, 3.0), steel, [-0.12 + k * 0.048, 0.69, 0.55]);
  // Synth controls: a row of knobs, LEDs, a pitch wheel and a mod wheel.
  for (let k = 0; k < 6; k++) {
    put(body, cyl(0.045, 0.05, 0.05, 12), matte([0xffffff, 0xff5a3a, 0x3adcff][k % 3]), [-0.4 + k * 0.16, 0.66, -0.48]);
    put(body, ball(0.018, 6, 4), glow(k % 2 ? 0x7aff7a : 0xff3a3a), [-0.4 + k * 0.16, 0.65, -0.62]);
  }
  for (const x of [-0.58, -0.48]) put(body, cyl(0.07, 0.07, 0.035, 16), matte(0x2a2a2a), [x, 0.64, 0.25], [0, 0, Math.PI / 2]);
  // The neck: frets, inlays, a headstock with tuners up front.
  put(body, box(0.26, 0.08, 1.1), matte(0x3a2210, { shininess: 50 }), [0, 0.6, 1.4]);
  for (let k = 0; k < 10; k++) put(body, box(0.27, 0.012, 0.015), steel, [0, 0.645, 0.9 + k * 0.1]);
  for (const z of [1.05, 1.25, 1.45, 1.75]) put(body, ball(0.018, 6, 4), matte(0xf4f0e4), [0, 0.645, z]);
  put(body, box(0.36, 0.08, 0.32), finish, [0, 0.6, 2.05], [-0.15, 0, 0.2]);
  for (const side of [-1, 1]) for (let k = 0; k < 3; k++) put(body, cyl(0.025, 0.025, 0.1, 8), steel, [side * 0.22, 0.62, 1.95 + k * 0.08], [0, 0, Math.PI / 2]);
  // A coiled cable off the tail.
  for (let k = 0; k < 6; k++) put(body, ring(0.08, 0.016), matte(0x111111), [0.5, 0.45, -1.25 - k * 0.06]);
  headlights(body, 0.55, 0.45, 0.95, 0.07, 0xd8ffd8);

  const look: Look = { skin: 0xf2c8aa, hair: 0xd4b06a, tips: 0xecd49a, style: 'long', shirt: 0x1e1e22, trim: 0x6aff7a, name: 'Cookie', iris: 0x5a7a9a, moustache: 0x9a6a3a, faceWidth: 0.92 };
  const d = new THREE.Group();
  d.position.set(0, 0.62, -0.75);
  const head = musician(d, look);
  const grips = steeringWheel(d, 0.42, 0.6, 0.2);
  musicianArms(d, look, grips);
  body.add(d);
  return {
    body,
    wheels: [0.96, -0.96].flatMap((x) => [
      { x, z: 0.85, radius: 0.38, width: 0.34, front: true },
      { x, z: -0.85, radius: 0.42, width: 0.38, front: false },
    ]),
    exhausts: pipes(body, 0.4, 0.55, -1.3),
    rearTrack: 0.96,
    rearZ: -0.9,
    spinners: [],
    shadow: [2.6, 3.2],
    head,
  };
}

// Joey Walker: guitar and synths, in a buggy built around a modular synth, patch cables everywhere.
function joeyWalker(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const frame = gloss(0x2a2a30);
  put(body, box(1.2, 0.25, 2.4), gloss(r.color), [0, 0.4, 0]);
  // The rack: two rows of modules with knobs and blinking LEDs.
  const rack = new THREE.Group();
  rack.position.set(0, 0.95, -0.85);
  rack.rotation.x = -0.25;
  put(rack, box(1.3, 0.85, 0.3), frame, [0, 0, 0]);
  // The back of the rack, facing whoever's behind: pink, signed "Yikes".
  put(rack, new THREE.PlaneGeometry(1.31, 0.86), gloss(0xff6ac0), [0, 0, -0.152], [0, Math.PI, 0]);
  put(rack, new THREE.PlaneGeometry(1.24, 0.62), matte(0xffffff, { map: tex('yikes', yikesTexture), emissive: 0x401028 }), [0, 0, -0.16], [0, Math.PI, 0]);
  const knobColors = [0xffffff, 0xff5a3a, 0x3adcff, 0xffd23a];
  for (let row = 0; row < 2; row++)
    for (let k = 0; k < 7; k++) {
      put(rack, cyl(0.04, 0.045, 0.05, 10), matte(knobColors[(k + row) % 4]), [-0.54 + k * 0.18, 0.2 - row * 0.36, 0.17], [Math.PI / 2, 0, 0]);
      put(rack, ball(0.02, 6, 4), glow(k % 2 ? 0x7aff7a : 0xff3a3a), [-0.54 + k * 0.18, 0.08 - row * 0.36, 0.16]);
    }
  // Patch cables drooping between jacks.
  const cableColors = [0xff3a8a, 0x3adcff, 0xffd23a, 0x7aff7a, 0xff8a2a];
  for (let k = 0; k < 5; k++) {
    const a = new THREE.Vector3(-0.5 + k * 0.22, 0.32, 0.18);
    const b = new THREE.Vector3(-0.3 + ((k * 3) % 5) * 0.2, -0.32, 0.18);
    const curve = new THREE.QuadraticBezierCurve3(a, new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.1, 0.45), b);
    put(rack, new THREE.TubeGeometry(curve, 10, 0.018, 6, false), matte(cableColors[k]), [0, 0, 0]);
  }
  body.add(rack);
  // Roll bars over the seat.
  for (const side of [-1, 1]) rod(body, [side * 0.55, 0.5, -0.5], [side * 0.45, 1.75, -0.3], 0.04, chrome());
  rod(body, [-0.45, 1.75, -0.3], [0.45, 1.75, -0.3], 0.04, chrome());
  // A pink tail across the back.
  put(body, box(1.3, 0.34, 0.14), gloss(0xff6ac0), [0, 0.45, -1.22]);
  headlights(body, 0.4, 0.45, 1.22, 0.08, 0xc8f0ff);

  const look: Look = { skin: 0xe8b88e, hair: 0x1a1210, style: 'short', shirt: 0x26262c, trim: r.accent, name: 'Joey', shades: true, moustache: 0x1a1210, faceWidth: 0.93 };
  const d = new THREE.Group();
  d.position.set(0, 0.5, -0.1);
  const head = musician(d, look);
  const grips = steeringWheel(d, 0.42, 0.62, 0.2);
  musicianArms(d, look, grips);
  body.add(d);
  return {
    body,
    wheels: [0.8, -0.8].flatMap((x) => [
      { x, z: 0.95, radius: 0.4, width: 0.36, front: true },
      { x, z: -0.9, radius: 0.46, width: 0.42, front: false },
    ]),
    exhausts: pipes(body, 0.35, 0.45, -1.25),
    rearTrack: 0.8,
    rearZ: -1.0,
    spinners: [],
    shadow: [2.5, 3.3],
    head,
  };
}

// Lucas Harwood: bass, driving an 8x10 bass cabinet on wheels, his bass neck up as an aerial.
function lucasHarwood(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const tolex = matte(0x161616, { shininess: 30 });
  const grille = matte(0xffffff, { map: tex('grille', grilleTexture) });
  put(body, box(1.4, 0.3, 2.6), gloss(r.color), [0, 0.4, 0]);
  // The cab stands at the back, its eight speakers facing out behind.
  put(body, box(1.3, 1.25, 0.7), tolex, [0, 1.15, -0.85]);
  put(body, box(1.2, 1.15, 0.02), grille, [0, 1.15, -1.21]);
  for (let row = 0; row < 4; row++)
    for (const col of [-1, 1]) put(body, cyl(0.2, 0.22, 0.04, 18), matte(0x0a0a0a), [col * 0.28, 0.72 + row * 0.29, -1.23], [Math.PI / 2, 0, 0], [1, 1, 1]);
  for (const side of [-1, 1]) put(body, box(0.06, 1.3, 0.06), chrome(), [side * 0.66, 1.15, -0.5]);
  put(body, box(1.32, 0.06, 0.72), chrome(), [0, 1.8, -0.85]);
  // A bass guitar neck standing up off the cab.
  put(body, box(0.1, 1.4, 0.06), matte(0x6a3a1a), [0.5, 2.5, -0.85], [0, 0, -0.15]);
  put(body, box(0.2, 0.26, 0.06), gloss(r.accent), [0.6, 3.25, -0.85], [0, 0, -0.15]);
  headlights(body, 0.45, 0.5, 1.32, 0.09);

  const look: Look = { skin: 0xe8bc94, hair: 0x2a1a10, style: 'wavy', shirt: 0xd8703a, trim: 0xf4e8d0, name: 'Lukey', iris: 0x4a6a8a };
  const d = new THREE.Group();
  d.position.set(0, 0.55, -0.05);
  const head = musician(d, look);
  const grips = steeringWheel(d, 0.42, 0.62, 0.2);
  musicianArms(d, look, grips);
  body.add(d);
  const tire = matte(0x1c1c1c);
  return {
    body,
    wheels: [0.86, -0.86].flatMap((x) => [
      { x, z: 0.95, radius: 0.42, width: 0.4, front: true, material: tire },
      { x, z: -0.95, radius: 0.46, width: 0.44, front: false, material: tire },
    ]),
    exhausts: pipes(body, 0.45, 0.5, -1.35),
    rearTrack: 0.86,
    rearZ: -1.0,
    spinners: [],
    shadow: [2.7, 3.4],
    head,
  };
}

// Michael Cavanagh: drums, rolling on two bass drums with a cymbal for a spoiler, sticks up.
function michaelCavanagh(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const wrap = matte(0xffffff, { map: tex('cav-wrap', () => sparkleTexture([40, 120, 200])), shininess: 80, specular: 0x888888 });
  const brassMat = brass();
  put(body, box(1.0, 0.28, 2.3), gloss(r.color), [0, 0.42, 0.1]);
  // A snare on the nose, a floor tom beside the seat, a cymbal spoiler.
  put(body, cyl(0.3, 0.3, 0.22, 20), wrap, [0, 0.68, 0.9]);
  put(body, cyl(0.29, 0.29, 0.01, 20), matte(0xf4f0e4), [0, 0.8, 0.9]);
  put(body, cyl(0.28, 0.28, 0.42, 20), wrap, [0.62, 0.75, -0.1]);
  put(body, cyl(0.27, 0.27, 0.01, 20), matte(0xf4f0e4), [0.62, 0.97, -0.1]);
  rod(body, [0, 0.55, -1.1], [0, 1.25, -1.15], 0.03, chrome());
  put(body, cyl(0.03, 0.62, 0.04, 28), brassMat, [0, 1.28, -1.15], [0.15, 0, 0]);
  rod(body, [-0.6, 0.55, 0.4], [-0.85, 1.05, 0.65], 0.02, chrome());
  put(body, cyl(0.02, 0.36, 0.03, 24), brassMat, [-0.85, 1.07, 0.65], [0.2, 0, 0.2]);

  const look: Look = { skin: 0xecc0a0, hair: 0x1e140e, style: 'mop', shirt: 0x24262c, trim: 0xe8642a, name: 'Cavs', iris: 0x4a3a2a };
  const d = new THREE.Group();
  d.position.set(0, 0.55, -0.35);
  const head = musician(d, look);
  // Sticks up mid-fill.
  const grips: [number, number, number][] = [[-0.38, 0.9, 0.45], [0.38, 0.9, 0.45]];
  musicianArms(d, look, grips);
  for (const [k, g] of grips.entries()) rod(d, g, [(k ? 1 : -1) * 0.5, 1.35, 0.75], 0.015, matte(0xe8c890));
  body.add(d);
  // The rear wheels are bass drums, heads out.
  const drum = wrap;
  return {
    body,
    wheels: [
      { x: 0.7, z: 0.95, radius: 0.3, width: 0.24, front: true },
      { x: -0.7, z: 0.95, radius: 0.3, width: 0.24, front: true },
      { x: 0.85, z: -0.85, radius: 0.55, width: 0.42, front: false, material: drum },
      { x: -0.85, z: -0.85, radius: 0.55, width: 0.42, front: false, material: drum },
    ],
    exhausts: pipes(body, 0.3, 0.5, -1.15),
    rearTrack: 0.85,
    rearZ: -0.95,
    spinners: [],
    shadow: [2.5, 3.2],
    head,
  };
}

// Jason: the band's visual artist, riding a rolling lighting rig: a truss
// frame with moving heads sweeping their beams, par cans across the front,
// a strobe, and the desk he plays it from.
function jasonGalea(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const truss = matte(0xc8ccd4, { shininess: 90, specular: 0xffffff });
  const black = matte(0x16161c);
  put(body, box(1.4, 0.26, 2.5), gloss(r.color), [0, 0.4, 0]);
  // A box truss on four corner posts, rails along the top, cross-braces down the sides.
  const corners: [number, number][] = [[-0.62, -1.1], [0.62, -1.1], [-0.62, 0.95], [0.62, 0.95]];
  for (const [x, z] of corners) rod(body, [x, 0.5, z], [x, 2.1, z], 0.035, truss);
  for (const z of [-1.1, 0.95]) rod(body, [-0.62, 2.1, z], [0.62, 2.1, z], 0.035, truss);
  for (const x of [-0.62, 0.62]) {
    rod(body, [x, 2.1, -1.1], [x, 2.1, 0.95], 0.035, truss);
    for (let k = 0; k < 3; k++) rod(body, [x, 0.55 + k * 0.52, -1.1], [x, 1.05 + k * 0.52, 0.95], 0.015, truss);
  }
  // Moving heads on the four top corners: a yoke and a head, its beam a soft cone of light.
  const beamColors = [r.accent, 0xff3ad8, 0xffd23a, 0x7aff9a];
  const sweepers: THREE.Object3D[] = [];
  corners.forEach(([x, z], k) => {
    const yoke = new THREE.Group();
    yoke.position.set(x, 2.15, z);
    put(yoke, cyl(0.1, 0.12, 0.08, 12), black, [0, 0.04, 0]);
    for (const side of [-1, 1]) put(yoke, box(0.03, 0.22, 0.06), black, [side * 0.1, 0.15, 0]);
    const headGroup = new THREE.Group();
    headGroup.position.y = 0.2;
    headGroup.rotation.x = 0.5 + (k % 2) * 0.3;
    put(headGroup, cyl(0.08, 0.1, 0.22, 12), black, [0, 0, 0], [Math.PI / 2, 0, 0]);
    put(headGroup, cyl(0.075, 0.075, 0.01, 12), glow(beamColors[k]), [0, 0, 0.115], [Math.PI / 2, 0, 0]);
    const beam = put(
      headGroup,
      new THREE.ConeGeometry(0.5, 3, 16, 1, true).translate(0, -1.5, 0).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: beamColors[k], transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      [0, 0, 0.12],
    );
    beam.renderOrder = 2;
    yoke.add(headGroup);
    yoke.userData.phase = k * 1.3;
    body.add(yoke);
    sweepers.push(yoke);
  });
  // Par cans along the front bar, a strobe in the middle.
  for (let k = 0; k < 4; k++) {
    const x = -0.45 + k * 0.3;
    put(body, cyl(0.07, 0.09, 0.18, 12), black, [x, 1.95, 1.0], [Math.PI / 2 - 0.4, 0, 0]);
    put(body, cyl(0.065, 0.065, 0.01, 12), glow(beamColors[k]), [x, 1.92, 1.09], [Math.PI / 2 - 0.4, 0, 0]);
  }
  put(body, box(0.3, 0.1, 0.08), glow(0xffffff), [0, 2.1, 1.0]);
  // The desk: a console of faders and buttons in front of him.
  const desk = new THREE.Group();
  desk.position.set(0, 0.85, 0.55);
  desk.rotation.x = -0.35;
  put(desk, box(0.9, 0.06, 0.45), black, [0, 0, 0]);
  for (let k = 0; k < 8; k++) {
    put(desk, box(0.02, 0.01, 0.2), matte(0x333333), [-0.36 + k * 0.1, 0.035, 0.05]);
    put(desk, box(0.05, 0.03, 0.03), matte(0xf4f4f4), [-0.36 + k * 0.1, 0.05, 0.05 + Math.sin(k * 1.9) * 0.07]);
    put(desk, box(0.04, 0.02, 0.04), glow(beamColors[k % 4]), [-0.36 + k * 0.1, 0.04, -0.15]);
  }
  body.add(desk);
  headlights(body, 0.45, 0.45, 1.27, 0.08, 0xffffff);

  const look: Look = { skin: 0xe8bc98, hair: 0x5a3c24, style: 'shaggy', shirt: 0x22222a, trim: r.accent, name: 'Jason', beard: 0x4a3020, iris: 0x4a3a2a, hat: { color: 0xb8a882, kind: 'cap' } };
  const d = new THREE.Group();
  d.position.set(0, 0.5, -0.2);
  const head = musician(d, look);
  // Both hands on the faders.
  musicianArms(d, look, [[-0.2, 0.45, 0.68], [0.2, 0.45, 0.68]]);
  body.add(d);
  return {
    body,
    wheels: [0.8, -0.8].flatMap((x) => [
      { x, z: 0.95, radius: 0.36, width: 0.3, front: true },
      { x, z: -0.95, radius: 0.4, width: 0.34, front: false },
    ]),
    exhausts: pipes(body, 0.35, 0.45, -1.3),
    rearTrack: 0.8,
    rearZ: -1.0,
    spinners: [],
    shadow: [2.5, 3.4],
    head,
    sweepers,
  };
}

/** Curls over an ellipsoid: small balls scattered on its surface, each a little in or out, for a poodle's coat. */
function curls(parent: THREE.Object3D, mat: THREE.Material, at: [number, number, number], radii: [number, number, number], count: number, size: number, seed: number, skip?: (x: number, y: number, z: number) => boolean): void {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const geo = ball(size, 10, 8);
  for (let k = 0; k < count; k++) {
    // Even spread over the sphere (golden spiral), then stretched to the ellipsoid.
    const y = 1 - (2 * (k + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    const a = k * 2.399963;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (skip?.(x, y, z)) continue;
    const out = 0.92 + rnd() * 0.16;
    put(parent, geo, mat, [at[0] + x * radii[0] * out, at[1] + y * radii[1] * out, at[2] + z * radii[2] * out], [0, 0, 0], [1, 0.9 + rnd() * 0.3, 1]);
  }
  put(parent, ball(1, 16, 12), mat, at, [0, 0, 0], [radii[0] * 0.95, radii[1] * 0.95, radii[2] * 0.95]);
}

// Arlo: an apricot standard poodle in a plush grey dog bed on wheels, ears flapping, tail going.
function arlo(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const coat = matte(r.color, { shininess: 6 });
  const face = matte(0xe8c69a, { shininess: 10 });
  const plush = matte(0xffffff, { map: tex('plush', () => sparkleTexture([150, 150, 154])), shininess: 4 });
  const plushDark = matte(0x8a8a8e, { shininess: 4 });

  // The bed: a padded base, a bolster all round open at the front, on four wheels.
  put(body, cyl(0.9, 0.95, 0.3, 28), plushDark, [0, 0.42, 0], [0, 0, 0], [0.95, 1, 1.35]);
  put(body, cyl(0.8, 0.8, 0.06, 28), plush, [0, 0.58, 0], [0, 0, 0], [0.95, 1, 1.35]);
  // The bolster runs round the sides and back, open at the front, its ends rounded off.
  const rim = Array.from({ length: 13 }, (_, k) => {
    const a = Math.PI * (0.32 + (k / 12) * 1.36);
    return new THREE.Vector3(Math.sin(a) * 0.78, 0.7, Math.cos(a) * 1.08 - 0.05);
  });
  put(body, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim), 40, 0.2, 12, false), plush, [0, 0, 0]);
  for (const end of [rim[0], rim[rim.length - 1]]) put(body, ball(0.2, 12, 10), plush, end.toArray() as [number, number, number]);
  // A tennis ball riding on the front.
  put(body, ball(0.17, 16, 12), matte(0xd8f03a), [0.35, 0.72, 1.2]);
  put(body, ring(0.17, 0.012), matte(0xffffff), [0.35, 0.72, 1.2], [0.6, 0.4, 0]);
  headlights(body, 0.4, 0.5, 1.3, 0.07);

  const d = new THREE.Group();
  d.position.set(0, 0.62, -0.1);
  // Sitting up: a curly chest and haunches, the trimmed legs, curly paws on the wheel.
  curls(d, coat, [0, 0.42, 0], [0.32, 0.4, 0.3], 110, 0.07, 3);
  curls(d, coat, [0, 0.15, -0.3], [0.36, 0.2, 0.28], 70, 0.065, 5);
  const grips = steeringWheel(d, 0.5, 0.5, 0.2);
  for (const g of grips) {
    const side = Math.sign(g[0]);
    rod(d, [side * 0.18, 0.62, 0.12], g, 0.07, coat);
    curls(d, coat, g, [0.07, 0.07, 0.08], 12, 0.04, 9 + side);
  }
  // The tail, straight up and curly at the tip, wagging.
  // A sweeper turns about its own y axis: tipped back a quarter turn, that axis runs fore and aft, so the turn is a wag.
  const tail = new THREE.Group();
  tail.position.set(0, 0.25, -0.55);
  tail.rotation.x = -Math.PI / 2;
  tail.userData.phase = 0;
  const stub = new THREE.Group();
  stub.rotation.x = Math.PI / 2;
  rod(stub, [0, 0, 0], [0, 0.5, -0.12], 0.05, coat);
  curls(stub, coat, [0, 0.58, -0.14], [0.08, 0.12, 0.08], 16, 0.045, 13);
  tail.add(stub);
  d.add(tail);

  // The head: a long trimmed muzzle, a black nose, a curly topknot and long curly ears.
  const head = new THREE.Group();
  head.position.set(0, 1.02, 0.08);
  head.scale.setScalar(1.5);
  put(head, ball(0.2, 18, 14), face, [0, 0, 0], [0, 0, 0], [0.95, 1, 1.05]);
  put(head, cyl(0.1, 0.13, 0.3, 14), face, [0, -0.06, 0.2], [Math.PI / 2 - 0.15, 0, 0]);
  // A curly moustache round the muzzle, and the beard under it.
  curls(head, coat, [0, -0.1, 0.28], [0.1, 0.07, 0.07], 18, 0.035, 17, (_x, y, z) => z > 0.6 && y > 0);
  put(head, ball(0.065, 14, 10), matte(0x0a0a0a, { shininess: 120, specular: 0x666666 }), [0, -0.03, 0.37], [0, 0, 0], [1.1, 0.8, 0.8]);
  put(head, ball(0.06, 12, 8), matte(0x3a0a0a), [0, -0.14, 0.27], [0, 0, 0], [1, 0.4, 0.6]);
  for (const side of [-1, 1]) {
    put(head, ball(0.04, 12, 10), matte(0x120806, { shininess: 100, specular: 0xffffff }), [side * 0.085, 0.04, 0.165]);
    put(head, ball(0.012, 6, 4), glow(0xffffff), [side * 0.085 + 0.012, 0.055, 0.2]);
  }
  curls(head, coat, [0, 0.17, -0.03], [0.19, 0.12, 0.19], 44, 0.05, 19, (_x, y, z) => y < -0.2 && z > 0.3);
  const flappers: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.17, 0.08, -0.02);
    ear.userData.side = side;
    curls(ear, coat, [side * 0.05, -0.2, 0], [0.065, 0.2, 0.06], 34, 0.042, 23 + side);
    head.add(ear);
    flappers.push(ear);
  }
  d.add(head);
  // A grey-blue collar.
  put(d, ring(0.2, 0.025), matte(0x3a4250), [0, 0.8, 0.04], [Math.PI / 2 - 0.2, 0, 0]);
  body.add(d);

  return {
    body,
    wheels: [0.82, -0.82].flatMap((x) => [
      { x, z: 0.95, radius: 0.32, width: 0.28, front: true },
      { x, z: -0.95, radius: 0.38, width: 0.32, front: false },
    ]),
    exhausts: pipes(body, 0.3, 0.4, -1.3),
    rearTrack: 0.82,
    rearZ: -0.95,
    spinners: [],
    shadow: [2.4, 3.3],
    head,
    flappers,
    sweepers: [tail],
  };
}

const BUILDERS: Record<string, (r: RacerDef) => KartModel> = {
  'lizard-warlock': lizardWarlock,
  'cyborg-gourmand': cyborgGourmand,
  'gila-rider': gilaRider,
  'swamp-witch': swampWitch,
  'microtonal-monk': microtonalMonk,
  'fuzz-golem': fuzzGolem,
  'neon-moth': neonMoth,
  'cosmic-coyote': cosmicCoyote,
  'mantis-shredder': mantisShredder,
  'gator-drummer': gatorDrummer,
  'mushroom-sage': mushroomSage,
  'octo-organist': octoOrganist,
  'stu-mackenzie': stuMackenzie,
  'ambrose-kenny-smith': ambroseKennySmith,
  'cook-craig': cookCraig,
  'joey-walker': joeyWalker,
  'lucas-harwood': lucasHarwood,
  'michael-cavanagh': michaelCavanagh,
  'jason-galea': jasonGalea,
  'arlo': arlo,
};

export function buildKartModel(racer: RacerDef): KartModel {
  const build = BUILDERS[racer.id] ?? lizardWarlock;
  return build(racer);
}

export interface WooCannonModel {
  group: THREE.Group;
  /** Spin with the flight. */
  fins: THREE.Object3D;
  flame: THREE.Mesh;
}

/**
 * The shell a racer becomes inside the Woo Cannon: a fat glossy round in
 * the racer's colours with rainbow fins, a face on the nose shouting WOO,
 * and a flame out the back. Built at kart scale, centred a metre up.
 */
export function buildWooCannon(r: RacerDef): WooCannonModel {
  const group = new THREE.Group();
  group.position.y = 1.1;
  const shell = gloss(0x3a1a6a, { shininess: 120, reflectivity: 0.35 });
  const nose = gloss(r.color, { shininess: 120 });
  const band = gloss(r.accent);
  put(group, cyl(1, 1, 2.2, 28), shell, [0, 0, 0], [Math.PI / 2, 0, 0]);
  put(group, new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), nose, [0, 0, 1.1], [Math.PI / 2, 0, 0]);
  for (const z of [0.55, -0.45]) put(group, ring(1.0, 0.07), band, [0, 0, z]);
  // The letters down both flanks.
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.font = 'italic 900 82px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = '#1a0620';
  g.strokeText('WOO', 128, 50);
  g.fillStyle = '#ffd23a';
  g.fillText('WOO', 128, 50);
  const letters = new THREE.CanvasTexture(c);
  letters.colorSpace = THREE.SRGBColorSpace;
  const decal = new THREE.MeshBasicMaterial({ map: letters, transparent: true, depthWrite: false });
  for (const side of [-1, 1]) put(group, new THREE.PlaneGeometry(1.2, 0.45), decal, [side * 1.01, 0.05, 0.05], [0, side * (Math.PI / 2), 0]);
  // The face: wide eyes under angry brows, a mouth open on the O.
  const centre = new THREE.Vector3(0, 0, 1.1);
  const onNose = (x: number, y: number, out = 1): [number, number, number] => {
    const d = new THREE.Vector3(x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y)));
    const p = centre.clone().addScaledVector(d, out);
    return [p.x, p.y, p.z];
  };
  for (const side of [-1, 1]) {
    put(group, ball(0.2, 14, 10), matte(0xffffff), onNose(side * 0.33, 0.3, 0.93));
    put(group, ball(0.09, 10, 8), matte(0x0a0a0a), onNose(side * 0.3, 0.28, 1.1));
    put(group, ball(0.03, 6, 4), glow(0xffffff), onNose(side * 0.27, 0.32, 1.17));
    put(group, box(0.32, 0.07, 0.07), matte(0x1a0620), onNose(side * 0.33, 0.52, 1.0), [0, 0, side * -0.4]);
  }
  put(group, new THREE.TorusGeometry(0.17, 0.05, 8, 18), matte(0x1a0620), onNose(0, -0.33, 0.98));
  put(group, new THREE.CircleGeometry(0.16, 18), matte(0x7a0a1a), onNose(0, -0.33, 0.97));
  // Rainbow fins round the back, turning as it flies.
  const fins = new THREE.Group();
  fins.position.z = -0.95;
  const finColors = [0xff5a7a, 0xffe45a, 0x4ad0ff, 0xc86aff];
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    arm.rotation.z = (k * Math.PI) / 2 + Math.PI / 4;
    put(arm, box(0.08, 0.75, 0.9), gloss(finColors[k]), [0, 1.2, -0.1]);
    fins.add(arm);
  }
  group.add(fins);
  put(group, cyl(0.75, 0.9, 0.3, 24), chrome(), [0, 0, -1.2], [Math.PI / 2, 0, 0]);
  const flame = put(
    group,
    new THREE.ConeGeometry(0.5, 1.8, 16).rotateX(-Math.PI / 2).translate(0, 0, -0.9),
    new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    [0, 0, -1.3],
  );
  glowSprite(group, [0, 0, -1.6], 1.4, 0xff9a40);
  group.visible = false;
  return { group, fins, flame };
}
