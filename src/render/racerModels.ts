import * as THREE from 'three';
import type { RacerDef } from '../physics/racers';
import { beadTexture, scaleTexture, skyEnvMap, stoneTexture, woodTexture } from './textures';

/**
 * One original character and kart per racer. Everything is built in kart
 * space: +z is forward, +y up, the ground at y = 0.
 */

export interface WheelSpec {
  x: number;
  z: number;
  radius: number;
  width: number;
  front: boolean;
  material?: THREE.Material;
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
  /** Things that spin with speed (fans). */
  spinners: THREE.Object3D[];
  shadow: [number, number];
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
const glow = (color: number) => new THREE.MeshBasicMaterial({ color });

/** Adds a mesh to `parent` at a position, with optional rotation and scale. */
function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): THREE.Mesh {
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

/** Two eyes facing +z: white, iris, pupil. Pupils as slits for reptiles. */
function eyes(parent: THREE.Object3D, y: number, z: number, spread: number, size: number, iris: number, slit = false): void {
  for (const side of [-1, 1]) {
    put(parent, ball(size), matte(0xf8f4e0), [side * spread, y, z]);
    put(parent, ball(size * 0.62), glow(iris), [side * spread, y, z + size * 0.55]);
    put(parent, slit ? box(size * 0.18, size * 1.1, 0.02) : ball(size * 0.3), matte(0x050505), [side * spread, y, z + size * 0.92]);
  }
}

/** Two rear exhaust pipes at (±x, y, z). */
function pipes(parent: THREE.Object3D, x: number, y: number, z: number, r = 0.11): THREE.Vector3[] {
  const mat = chrome();
  return [-1, 1].map((side) => {
    put(parent, cyl(r * 0.8, r, 0.6), mat, [side * x, y, z], [Math.PI / 2, 0, 0]);
    return new THREE.Vector3(side * x, y, z - 0.35);
  });
}

// ---- Lizard Warlock: lizard sorcerer in a hot rod ------------------------------

function lizardWarlock(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const paint = gloss(r.color);
  const trim = gloss(r.accent);
  const skin = matte(0xffffff, { map: tex('lizard', () => scaleTexture('#7fd36a', '#2c6a2a')) });

  put(body, box(1.25, 0.3, 2.5), paint, [0, 0.42, -0.05]);
  put(body, box(0.9, 0.22, 0.9), paint, [0, 0.5, 1.2], [-0.12, 0, 0]);
  // Chrome engine on the nose with a blower and twin stacks.
  const engine = chrome();
  put(body, box(0.6, 0.35, 0.6), engine, [0, 0.75, 0.95]);
  put(body, box(0.45, 0.18, 0.4), trim, [0, 1.0, 0.95]);
  for (const side of [-1, 1]) put(body, cyl(0.06, 0.08, 0.5), engine, [side * 0.38, 0.95, 0.75], [0.4, 0, side * 0.3]);
  put(body, box(1.3, 0.06, 0.12), trim, [0, 0.58, -0.6]);
  put(body, box(0.85, 0.5, 0.22), matte(0x2a1a30), [0, 0.8, -0.65]);

  // The warlock: scaled snout, frill, robe and a starry hat.
  const d = new THREE.Group();
  d.position.set(0, 0.6, -0.35);
  put(d, cyl(0.32, 0.42, 0.7), trim, [0, 0.45, 0]);
  const head = new THREE.Group();
  head.position.set(0, 1.08, 0.05);
  put(head, ball(0.3), skin, [0, 0, 0], [0, 0, 0], [1, 0.9, 1]);
  put(head, ball(0.22), skin, [0, -0.06, 0.3], [0, 0, 0], [0.9, 0.6, 1.3]);
  eyes(head, 0.1, 0.2, 0.16, 0.08, 0xffd23a, true);
  for (let k = 0; k < 7; k++) {
    const a = ((k - 3) / 3) * 1.1;
    put(head, cone(0.06, 0.32, 6), matte(r.accent), [Math.sin(a) * 0.32, Math.cos(a) * 0.2 - 0.05, -0.12], [-0.6, 0, -a]);
  }
  put(head, cyl(0.42, 0.42, 0.04, 20), trim, [0, 0.24, 0]);
  const hat = put(head, cone(0.26, 0.7, 16), trim, [0, 0.6, -0.05], [-0.15, 0, 0]);
  for (let k = 0; k < 4; k++) put(hat, new THREE.OctahedronGeometry(0.05), glow(0xffe14d), [Math.sin(k * 1.7) * 0.15, -0.2 + k * 0.1, 0.12 + (k % 2) * 0.03]);
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
  };
}

// ---- Cyborg Gourmand: robot chef in a kitchen cart -----------------------------

function cyborgGourmand(r: RacerDef): KartModel {
  const body = new THREE.Group();
  // Brushed steel rather than mirror chrome, so it reads as metal under any sky.
  const steel = gloss(r.color, { reflectivity: 0.12, shininess: 70, specular: 0x999999 });
  const paint = gloss(r.color);
  const red = gloss(r.accent);

  put(body, box(1.45, 0.55, 2.3), paint, [0, 0.62, 0]);
  put(body, box(1.2, 0.3, 0.2), steel, [0, 0.55, 1.2]);
  for (let k = 0; k < 5; k++) put(body, box(0.04, 0.24, 0.05), matte(0x222222), [-0.4 + k * 0.2, 0.55, 1.31]);
  // Rivets down each flank.
  for (const side of [-1, 1]) for (let k = 0; k < 6; k++) put(body, ball(0.035, 6, 4), steel, [side * 0.73, 0.78, -0.9 + k * 0.36]);
  // Stove top at the back: hot plate, pot, chimney.
  put(body, box(1.2, 0.08, 0.7), matte(0x1c1c1c), [0, 0.93, -0.75]);
  put(body, cyl(0.2, 0.2, 0.04, 20), glow(0xff5a1a), [0.3, 0.98, -0.75]);
  put(body, cyl(0.2, 0.18, 0.3, 16), steel, [-0.3, 1.1, -0.75]);
  put(body, cyl(0.12, 0.14, 0.9), matte(0x333333), [0.45, 1.35, -1.0]);
  put(body, cyl(0.17, 0.12, 0.12), matte(0x333333), [0.45, 1.84, -1.0]);
  // Frying pan hanging off the side.
  put(body, cyl(0.22, 0.2, 0.06, 16), matte(0x222222), [-0.8, 0.85, 0.2], [0, 0, Math.PI / 2]);
  put(body, box(0.05, 0.05, 0.4), matte(0x222222), [-0.8, 0.85, 0.55]);

  const d = new THREE.Group();
  d.position.set(0, 0.9, 0.15);
  put(d, box(0.62, 0.55, 0.42), steel, [0, 0.32, 0]);
  put(d, box(0.5, 0.3, 0.05), red, [0, 0.38, 0.22]);
  const head = new THREE.Group();
  head.position.set(0, 0.86, 0.02);
  put(head, box(0.5, 0.42, 0.44), steel, [0, 0, 0]);
  put(head, box(0.42, 0.1, 0.05), glow(0xff2a2a), [0, 0.05, 0.23]);
  put(head, new THREE.TorusGeometry(0.1, 0.035, 6, 12, Math.PI), matte(0x111111), [0, -0.1, 0.24], [0, 0, Math.PI]);
  put(head, cyl(0.02, 0.02, 0.25), steel, [0.18, 0.32, 0]);
  put(head, ball(0.05, 8, 6), glow(0xff2a2a), [0.18, 0.46, 0]);
  // Chef's hat.
  const white = matte(0xfafaf4);
  put(head, cyl(0.26, 0.24, 0.3, 16), white, [0, 0.36, 0]);
  for (let k = 0; k < 5; k++) put(head, ball(0.16, 10, 8), white, [Math.cos(k * 1.26) * 0.13, 0.56, Math.sin(k * 1.26) * 0.13]);
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
  };
}

// ---- Gila Rider: beaded gila monster on a chopper trike ------------------------

function gilaRider(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const hide = matte(0xffffff, { map: tex('beads', beadTexture) });
  const paint = gloss(r.color);
  const steel = chrome();

  put(body, box(0.7, 0.3, 2.0), paint, [0, 0.55, -0.35]);
  put(body, box(0.5, 0.35, 0.8), paint, [0, 0.7, 0.4], [-0.15, 0, 0]);
  put(body, box(1.3, 0.12, 0.4), matte(r.accent), [0, 0.5, -1.0]);
  // Raked forks out to a lone front wheel, ape-hanger bars.
  for (const side of [-1, 1]) put(body, cyl(0.04, 0.04, 1.3), steel, [side * 0.12, 0.85, 1.25], [0.95, 0, 0]);
  put(body, box(0.9, 0.04, 0.04), steel, [0, 1.35, 0.85]);
  for (const side of [-1, 1]) put(body, cyl(0.03, 0.03, 0.5), steel, [side * 0.42, 1.55, 0.85]);

  const d = new THREE.Group();
  d.position.set(0, 0.75, -0.3);
  put(d, ball(0.38), hide, [0, 0.35, 0], [0.4, 0, 0], [1, 1.2, 0.9]);
  for (const side of [-1, 1]) put(d, cyl(0.08, 0.08, 0.9), hide, [side * 0.3, 0.75, 0.55], [-1.0, 0, side * 0.35]);
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0.2);
  put(head, ball(0.3), hide, [0, 0, 0], [0, 0, 0], [1.2, 0.7, 1.3]);
  put(head, ball(0.2), hide, [0, -0.04, 0.3], [0, 0, 0], [1.2, 0.6, 1]);
  eyes(head, 0.08, 0.2, 0.2, 0.06, 0x2a1408, false);
  put(head, box(0.04, 0.01, 0.3), matte(0xd0303a), [0, -0.1, 0.55]);
  for (const side of [-1, 1]) put(head, box(0.02, 0.01, 0.12), matte(0xd0303a), [side * 0.04, -0.1, 0.74], [0, side * 0.5, 0]);
  // Sunglasses: every rider needs a pair.
  put(head, box(0.5, 0.08, 0.04), matte(0x050505, { shininess: 120, specular: 0xffffff }), [0, 0.1, 0.33]);
  d.add(head);
  body.add(d);

  return {
    body,
    wheels: [
      { x: 0, z: 1.7, radius: 0.36, width: 0.22, front: true },
      { x: 0.75, z: -0.95, radius: 0.48, width: 0.5, front: false },
      { x: -0.75, z: -0.95, radius: 0.48, width: 0.5, front: false },
    ],
    exhausts: pipes(body, 0.3, 0.45, -1.4, 0.13),
    rearTrack: 0.75,
    rearZ: -1.05,
    spinners: [],
    shadow: [2.0, 3.8],
  };
}

// ---- Swamp Witch: witch in a fan-driven swamp skiff ----------------------------

function swampWitch(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const wood = matte(0xffffff, { map: tex('wood', woodTexture) });
  const moss = gloss(r.color);
  const skin = matte(0x8fbf5a);

  put(body, box(1.4, 0.35, 2.1), wood, [0, 0.5, -0.1]);
  put(body, cyl(0.7, 0.7, 0.35, 3), wood, [0, 0.5, 1.05], [0, Math.PI / 6, 0], [1, 1, 0.9]);
  put(body, box(1.5, 0.08, 2.2), moss, [0, 0.7, -0.1]);
  // Big caged fan at the back.
  const cage = new THREE.Group();
  cage.position.set(0, 1.35, -1.15);
  put(cage, new THREE.TorusGeometry(0.7, 0.04, 8, 32), matte(0x3a3a3a), [0, 0, 0]);
  for (let k = 0; k < 4; k++) put(cage, box(0.03, 1.4, 0.03), matte(0x3a3a3a), [0, 0, 0], [0, 0, (k * Math.PI) / 4]);
  const fan = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const blade = new THREE.Group();
    blade.rotation.z = (k * Math.PI * 2) / 3;
    put(blade, box(0.16, 0.62, 0.03), wood, [0, 0.31, -0.08], [0, 0.4, 0]);
    fan.add(blade);
  }
  put(fan, cyl(0.1, 0.1, 0.15), matte(0x222222), [0, 0, -0.08], [Math.PI / 2, 0, 0]);
  cage.add(fan);
  put(body, box(0.1, 0.9, 0.1), matte(0x3a3a3a), [0, 0.95, -1.1]);
  body.add(cage);

  const d = new THREE.Group();
  d.position.set(0, 0.7, 0.05);
  put(d, cone(0.42, 0.9, 12), matte(0x2a1e3a), [0, 0.45, 0]);
  const head = new THREE.Group();
  head.position.set(0, 1.05, 0.05);
  put(head, ball(0.26), skin, [0, 0, 0]);
  put(head, cone(0.07, 0.32, 8), skin, [0, -0.02, 0.36], [Math.PI / 2 - 0.3, 0, 0]);
  put(head, ball(0.035, 6, 4), matte(0x5a7a3a), [0.06, 0.02, 0.4]);
  eyes(head, 0.06, 0.2, 0.1, 0.06, 0xb7d14a, false);
  for (let k = 0; k < 9; k++) {
    const a = (k / 8) * Math.PI - Math.PI / 2;
    put(head, cyl(0.025, 0.012, 0.6, 5), matte(r.accent), [Math.sin(a) * 0.24, -0.25, -Math.abs(Math.cos(a)) * 0.15], [0.2, 0, a * 0.3]);
  }
  // Crooked hat in two pieces.
  const hatMat = matte(0x1a2a24);
  put(head, cyl(0.5, 0.5, 0.04, 20), hatMat, [0, 0.18, 0]);
  put(head, cyl(0.12, 0.26, 0.45, 12), hatMat, [0, 0.42, 0]);
  put(head, cone(0.12, 0.45, 12), hatMat, [0.08, 0.78, -0.12], [-0.6, 0, -0.4]);
  put(head, cyl(0.27, 0.27, 0.07, 16), matte(r.accent), [0, 0.24, 0]);
  d.add(head);
  body.add(d);

  const tire = matte(0x2a2418);
  return {
    body,
    wheels: [0.82, -0.82].flatMap((x) => [
      { x, z: 0.8, radius: 0.36, width: 0.3, front: true, material: tire },
      { x, z: -0.8, radius: 0.4, width: 0.34, front: false, material: tire },
    ]),
    exhausts: [new THREE.Vector3(0, 1.35, -1.35)],
    rearTrack: 0.82,
    rearZ: -0.85,
    spinners: [fan],
    shadow: [2.5, 3.2],
  };
}

// ---- Microtonal Monk: monk in a lotus pod with a sitar neck --------------------

function microtonalMonk(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const gold = gloss(r.color, { specular: 0xffe0a0 });
  const petal = gloss(0xf3a6c8);

  put(body, ball(0.9, 24, 12), gold, [0, 0.55, 0], [0, 0, 0], [0.85, 0.35, 1.25]);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    put(body, ball(0.32, 10, 8), petal, [Math.sin(a) * 0.72, 0.72, Math.cos(a) * 1.0], [0.5 * Math.cos(a), a, -0.5 * Math.sin(a)], [0.5, 0.25, 1]);
  }
  // Sitar-style neck rising behind, gourd at its foot.
  const wood = matte(0x7b3a1a, { shininess: 60, specular: 0x553322 });
  put(body, ball(0.32, 16, 12), wood, [0, 0.95, -0.95], [0, 0, 0], [1, 1, 0.8]);
  put(body, box(0.12, 1.5, 0.08), wood, [0, 1.8, -1.0], [-0.2, 0, 0]);
  for (let k = 0; k < 9; k++) put(body, box(0.14, 0.015, 0.1), chrome(), [0, 1.2 + k * 0.14, -0.88 - k * 0.028], [-0.2, 0, 0]);
  put(body, ball(0.1, 8, 6), wood, [0, 2.55, -1.15]);

  const d = new THREE.Group();
  d.position.set(0, 0.65, -0.05);
  put(d, cone(0.48, 0.75, 16), gloss(0xff9a1a), [0, 0.38, 0]);
  put(d, box(0.12, 0.75, 0.1), gloss(r.accent), [0.18, 0.4, 0.2], [0, 0, 0.45]);
  const beads = new THREE.Group();
  beads.position.set(0, 0.72, 0.05);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    put(beads, ball(0.035, 6, 4), matte(r.accent), [Math.sin(a) * 0.22, -Math.abs(Math.cos(a)) * 0.18, Math.cos(a) * 0.16 + 0.1]);
  }
  d.add(beads);
  const head = new THREE.Group();
  head.position.set(0, 1.0, 0.02);
  put(head, ball(0.27), gloss(0xd9a878, { reflectivity: 0.12, shininess: 120 }), [0, 0, 0]);
  put(head, ball(0.03, 8, 6), glow(0xd1342f), [0, 0.12, 0.26]);
  for (const side of [-1, 1]) put(head, box(0.09, 0.015, 0.02), matte(0x3a2410), [side * 0.09, 0.03, 0.25]); // eyes closed in meditation
  for (const side of [-1, 1]) put(head, ball(0.07, 8, 6), gloss(0xd9a878), [side * 0.27, 0, 0], [0, 0, 0], [0.5, 1, 0.8]);
  // A halo hums above.
  put(head, new THREE.TorusGeometry(0.22, 0.02, 6, 24), glow(0xffe680), [0, 0.42, 0], [Math.PI / 2, 0, 0]);
  d.add(head);
  body.add(d);

  const spoke = gloss(r.color);
  return {
    body,
    wheels: [0.72, -0.72].flatMap((x) => [
      { x, z: 0.75, radius: 0.32, width: 0.18, front: true, material: spoke },
      { x, z: -0.75, radius: 0.34, width: 0.2, front: false, material: spoke },
    ]),
    exhausts: [new THREE.Vector3(0, 0.6, -1.15)],
    rearTrack: 0.72,
    rearZ: -0.8,
    spinners: [],
    shadow: [2.2, 3.0],
  };
}

// ---- Fuzz Golem: fuzzed-out rock golem on a boulder slab -----------------------

function fuzzGolem(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const rock = matte(0xffffff, { map: tex('stone', () => stoneTexture([70, 62, 80], [140, 128, 150])), flatShading: true });
  const fuzz = matte(r.color, { flatShading: true, shininess: 30, specular: 0x442244 });

  put(body, new THREE.DodecahedronGeometry(1, 0), rock, [0, 0.62, 0], [0.3, 0.4, 0], [0.85, 0.38, 1.35]);
  // Amp stack strapped to the back.
  put(body, box(0.95, 0.75, 0.45), matte(0x161616), [0, 1.05, -1.0]);
  put(body, box(0.85, 0.65, 0.02), matte(0x2a2a2a), [0, 1.05, -1.23]);
  for (const side of [-1, 1]) put(body, cyl(0.17, 0.2, 0.05, 20), matte(0x0a0a0a), [side * 0.2, 1.05, -1.25], [Math.PI / 2, 0, 0]);
  put(body, box(0.95, 0.1, 0.45), gloss(r.accent), [0, 1.47, -1.0]);

  const d = new THREE.Group();
  d.position.set(0, 0.85, 0.05);
  put(d, new THREE.IcosahedronGeometry(0.62, 0), fuzz, [0, 0.55, 0], [0.2, 0.3, 0]);
  // The fuzz: spikes in every direction, a few tipped with the accent colour.
  const spike = cone(0.07, 0.32, 5);
  const tip = matte(r.accent, { emissive: 0x332200 });
  for (let k = 0; k < 40; k++) {
    const u = (k * 0.618034) % 1;
    const v = (k * 0.381966 + 0.13) % 1;
    const theta = u * Math.PI * 2;
    const phi = Math.acos(1 - 2 * v);
    const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    if (dir.y < -0.4) continue;
    const m = put(d, spike, k % 6 === 0 ? tip : fuzz, [dir.x * 0.6, 0.55 + dir.y * 0.6, dir.z * 0.6]);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }
  eyes(d, 0.75, 0.5, 0.2, 0.09, 0xffcc33, false);
  // Boulder fists on the bars.
  for (const side of [-1, 1]) put(d, new THREE.DodecahedronGeometry(0.22, 0), rock, [side * 0.55, 0.2, 0.55]);
  body.add(d);

  const stoneWheel = matte(0x4a4452, { flatShading: true, map: tex('stone', () => stoneTexture([70, 62, 80], [140, 128, 150])) });
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
  };
}

const BUILDERS: Record<string, (r: RacerDef) => KartModel> = {
  'lizard-warlock': lizardWarlock,
  'cyborg-gourmand': cyborgGourmand,
  'gila-rider': gilaRider,
  'swamp-witch': swampWitch,
  'microtonal-monk': microtonalMonk,
  'fuzz-golem': fuzzGolem,
};

export function buildKartModel(racer: RacerDef): KartModel {
  const build = BUILDERS[racer.id] ?? lizardWarlock;
  return build(racer);
}

