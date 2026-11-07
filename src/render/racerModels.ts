import * as THREE from 'three';
import type { RacerDef } from '../physics/racers';
import { arlo, flyingPig, neonMoth } from './racers/beasts';
import { cosmicCoyote, cyborgGourmand, mantisShredder, octoOrganist } from './racers/drivers';
import { fuzzGolem, lordOfLightning, microtonalMonk, mushroomSage, swampWitch } from './racers/mystics';
import { gatorDrummer, gilaRider, lizardWarlock, rattlesnake, skeletonDragon } from './racers/reptiles';
import {
  flameDecalTexture,
  glowTexture,
  grilleTexture,
  scaleTexture,
  skyEnvMap,
  sparkleTexture,
  stoneTexture,
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
  /**
   * Flyers and hovercraft: no wheels touch the road, the body bobs, and the pads under it pulse.
   * `beat`: a bird holding itself up, the body rising on each downstroke of its `flappers` instead.
   */
  hover?: { bob: number; pads: THREE.Object3D[]; beat?: boolean };
  /** The driver's head: leans into turns and looks where it's steering. Built unrotated. */
  head?: THREE.Object3D;
  /** Tread textures that roll with the wheels; v runs along the tread, `perMeter` repeats per meter. */
  treads?: { map: THREE.Texture; perMeter: number }[];
  /** Wings that beat about their z axis; `userData.side` is -1 or 1. Built unrotated. */
  flappers?: THREE.Object3D[];
  /** Moving-head lights that sweep side to side about their y axis. Built unrotated. */
  sweepers?: THREE.Object3D[];
  /**
   * Runners: legs pivoting at the hip, swung forward and back about their y
   * axis in a gait that quickens with speed; `userData.side` is -1 or 1,
   * `userData.phase` the leg's place in the stride. `sway` turns with the
   * stride (a lizard's body snaking), `tail` against it. Built unrotated.
   */
  legs?: THREE.Object3D[];
  sway?: THREE.Object3D;
  tail?: THREE.Object3D;
  /**
   * Slitherers: body segments a wave runs down from head to tail, side to
   * side, quicker with speed; `userData.z` is how far back the segment sits
   * (m), `userData.amp` how far it swings. `rattle` shakes. Built unrotated.
   */
  segments?: THREE.Object3D[];
  rattle?: THREE.Object3D;
}

let env: THREE.CubeTexture | null = null;
const cache = new Map<string, THREE.Texture>();
export const tex = (key: string, make: () => THREE.Texture) => {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
};

export const gloss = (color: number, extra: THREE.MeshPhongMaterialParameters = {}) =>
  new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x666666, envMap: (env ??= skyEnvMap()), reflectivity: 0.25, combine: THREE.MixOperation, ...extra });
export const matte = (color: number, extra: THREE.MeshPhongMaterialParameters = {}) => new THREE.MeshPhongMaterial({ color, shininess: 12, specular: 0x111111, ...extra });
export const chrome = () => new THREE.MeshPhongMaterial({ color: 0xd8dee8, shininess: 140, specular: 0xffffff, envMap: (env ??= skyEnvMap()), reflectivity: 0.75, combine: THREE.MixOperation });
export const brass = () => gloss(0xd8a83a, { specular: 0xffe0a0, reflectivity: 0.4 });
export const glow = (color: number) => new THREE.MeshBasicMaterial({ color });
export const rubberMat = () => matte(0x1c1c1c);

/** Adds a mesh to `parent` at a position, with optional rotation and scale. */
export function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  parent.add(m);
  return m;
}

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** Model resolution: every curved surface gets twice the segments it was drawn with (`RES`), so heads, helmets and wheels read round up close. */
export const RES = 2;
export const ball = (r: number, w = 16, h = 12) => new THREE.SphereGeometry(r, w * RES, h * RES);
export const cyl = (rt: number, rb: number, h: number, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg < 6 ? seg : seg * RES);
export const cone = (r: number, h: number, seg = 12) => new THREE.ConeGeometry(r, h, seg < 6 ? seg : seg * RES);
export const ring = (r: number, tube: number, arc = Math.PI * 2) => new THREE.TorusGeometry(r, tube, 8 * RES, 24 * RES, arc);

export const UP = new THREE.Vector3(0, 1, 0);

/** A rod from `a` to `b` (a limb, a strut, a cable). */
export function rod(parent: THREE.Object3D, a: [number, number, number], b: [number, number, number], r: number, mat: THREE.Material, rEnd = r): THREE.Mesh {
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
export function arm(parent: THREE.Object3D, shoulder: [number, number, number], grip: [number, number, number], r: number, sleeve: THREE.Material, hand: THREE.Material): void {
  const elbow: [number, number, number] = [(shoulder[0] + grip[0]) / 2 + Math.sign(shoulder[0]) * 0.08, Math.min(shoulder[1], grip[1]) - 0.06, (shoulder[2] + grip[2]) / 2];
  rod(parent, shoulder, elbow, r, sleeve);
  put(parent, ball(r, 8, 6), sleeve, elbow);
  rod(parent, elbow, grip, r * 0.85, hand);
  put(parent, ball(r * 1.15, 10, 8), hand, grip);
}

/** Steering wheel on a column, tilted toward the driver; returns the two grip points. */
export function steeringWheel(parent: THREE.Object3D, y: number, z: number, r = 0.2, mat: THREE.Material = matte(0x1a1a1a)): [[number, number, number], [number, number, number]] {
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
export function eyes(parent: THREE.Object3D, y: number, z: number, spread: number, size: number, iris: number, slit = false): void {
  for (const side of [-1, 1]) {
    put(parent, ball(size), matte(0xf8f4e0), [side * spread, y, z]);
    put(parent, ball(size * 0.62), glow(iris), [side * spread, y, z + size * 0.55]);
    put(parent, slit ? box(size * 0.18, size * 1.1, 0.02) : ball(size * 0.3), matte(0x050505), [side * spread, y, z + size * 0.92]);
    put(parent, ball(size * 0.14, 6, 4), glow(0xffffff), [side * spread + size * 0.25, y + size * 0.3, z + size * 0.95]);
  }
}

/** Heavy brows over a pair of eyes; `tilt` > 0 frowns. */
export function brows(parent: THREE.Object3D, y: number, z: number, spread: number, w: number, mat: THREE.Material, tilt = 0.25): void {
  for (const side of [-1, 1]) put(parent, box(w, w * 0.25, w * 0.35), mat, [side * spread, y, z], [0, 0, side * tilt]);
}

/** Two rear exhaust pipes at (±x, y, z). */
export function pipes(parent: THREE.Object3D, x: number, y: number, z: number, r = 0.11): THREE.Vector3[] {
  const mat = chrome();
  return [-1, 1].map((side) => {
    put(parent, cyl(r * 0.8, r, 0.6), mat, [side * x, y, z], [Math.PI / 2, 0, 0]);
    put(parent, ring(r * 0.8, r * 0.18), matte(0x222222), [side * x, y, z - 0.3]);
    return new THREE.Vector3(side * x, y, z - 0.35);
  });
}

/** A pair of glowing headlamps on the nose. */
export function headlights(parent: THREE.Object3D, x: number, y: number, z: number, r = 0.09, color = 0xfff6c8): void {
  for (const side of [-1, 1]) {
    put(parent, cyl(r * 1.25, r * 1.25, 0.08, 12), chrome(), [side * x, y, z], [Math.PI / 2, 0, 0]);
    put(parent, ball(r, 10, 8), glow(color), [side * x, y, z + 0.03], [0, 0, 0], [1, 1, 0.5]);
  }
}

/** A flat decal on both flanks at |x| facing outward, `w` long by `h` tall. */
export function sideDecal(parent: THREE.Object3D, map: THREE.Texture, x: number, y: number, z: number, w: number, h: number): void {
  const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const side of [-1, 1]) {
    // Flames lick backwards on both sides.
    put(parent, new THREE.PlaneGeometry(w, h), mat, [side * x, y, z], [0, side * (Math.PI / 2), 0], [side, 1, 1]);
  }
}

/** A soft glowing sprite, for hover pads and lamps. */
export function glowSprite(parent: THREE.Object3D, pos: [number, number, number], size: number, color: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('glow', () => glowTexture()), color, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.position.set(...pos);
  s.scale.setScalar(size);
  parent.add(s);
  return s;
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
    put(head, new THREE.SphereGeometry(0.054, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), skin, [x, 0.047, 0.201], [-0.42, 0, 0], [1.25, 0.8, 0.75]);
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
  put(head, new THREE.SphereGeometry(0.06, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), matte(0xfaf8f0, { shininess: 90, specular: 0x666666 }), [0, -0.104, 0.214], [Math.PI, 0, 0], [1.15, 0.42, 0.55]);
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
  if (look.style === 'short') put(head, new THREE.SphereGeometry(0.264, 36, 16, 0, Math.PI * 2, 0, Math.PI / 3.3), hair, [0, 0.07, -0.02], [-0.1, 0, 0], [1, 1.05, 1.05]);
  else put(head, new THREE.SphereGeometry(0.265, 36, 20, 0, Math.PI * 2, 0, Math.PI / 2), hair, [0, 0.06, -0.02], [-0.15, 0, 0], [1, 0.95, 1.05]);
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
      put(head, new THREE.SphereGeometry(0.275, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), hat, [0, 0.1, -0.02]);
      put(head, box(0.32, 0.03, 0.24), hat, [0, 0.11, 0.27], [0.15, 0, 0]);
      put(head, ball(0.025, 6, 4), hat, [0, 0.37, -0.02]);
    } else {
      put(head, new THREE.SphereGeometry(0.275, 32, 16, 0, Math.PI * 2, 0, Math.PI / 1.9), hat, [0, 0.08, -0.02], [0, 0, 0], [1.03, 1.15, 1.03]);
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

// ==== The story bosses ==========================================================
// One for each story suite's end (core/story.ts), each from its song's
// lyrics: bigger and stranger than the roster, and plainly that song's
// villain. They drive with the same kart physics as everyone.

/** A flat triangle from three points (wing membranes, banners). */
function tri(parent: THREE.Object3D, a: [number, number, number], b: [number, number, number], c: [number, number, number], mat: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  g.computeVertexNormals();
  return put(parent, g, mat, [0, 0, 0]);
}

/** A tube through `pts` (horns, tails, cables, antler tines). */
function tube(parent: THREE.Object3D, pts: [number, number, number][], radius: number, mat: THREE.Material, closed = false): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed);
  return put(parent, new THREE.TubeGeometry(curve, Math.max(8, pts.length * 6), radius, 8, closed), mat, [0, 0, 0]);
}

/** A tapered horn curling along `pts`: a tube thick at the root, then a cone tip. */
function horn(parent: THREE.Object3D, pts: [number, number, number][], radius: number, mat: THREE.Material): void {
  tube(parent, pts.slice(0, -1), radius, mat);
  const a = new THREE.Vector3(...pts[pts.length - 2]);
  const b = new THREE.Vector3(...pts[pts.length - 1]);
  const d = b.clone().sub(a);
  const tip = put(parent, cone(radius, d.length(), 8), mat, [0, 0, 0]);
  tip.position.copy(a).addScaledVector(d, 0.5);
  tip.quaternion.setFromUnitVectors(UP, d.normalize());
}

// ---- The Voice in Your Mind: the Mind Fuzz Suite's boss -------------------------
// "When I'm in your mind, then I'm in your mind": a great brain under a glass
// bell, one huge eye open on its front and three more on stalks, patched by
// cables into a fuzz pedal that rides a spinning hypnotic spiral over the
// road, a cloud of fuzz round it all.

function mindVoice(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const pink = matte(0xf08ab8, { shininess: 40, specular: 0x553344, emissive: 0x2a0818 });
  const fold = matte(0xc85a90, { shininess: 30 });
  const pedal = gloss(r.color);
  const metal = chrome();
  const fuzz = glow(r.accent);
  const dark = matte(0x14081c);
  const glass = new THREE.MeshPhongMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.22, shininess: 140, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide });

  // The spiral: a dark disc with a glowing spiral arm wound out from the middle, turning flat and fast.
  const rotors: THREE.Object3D[] = [];
  const disc = new THREE.Group();
  disc.position.y = 0.32;
  put(disc, cyl(1.45, 1.35, 0.1, 40), dark, [0, 0, 0]);
  for (const [phase, mat] of [[0, fuzz], [Math.PI, glow(r.color)]] as const) {
    const pts: [number, number, number][] = [];
    for (let k = 0; k <= 40; k++) {
      const a = phase + k * 0.32;
      const rad = 0.08 + k * 0.033;
      pts.push([Math.cos(a) * rad, 0.06, Math.sin(a) * rad]);
    }
    tube(disc, pts, 0.035, mat);
  }
  put(disc, ring(1.42, 0.045), fuzz, [0, 0.03, 0], [Math.PI / 2, 0, 0]);
  body.add(disc);
  rotors.push(disc);
  const pads = [glowSprite(body, [0, 0.15, 0], 2.6, r.accent), glowSprite(body, [0, 0.2, 0.9], 1.2, r.color), glowSprite(body, [0, 0.2, -0.9], 1.2, r.color)];

  // The pedal: a big stompbox, three knobs, a footswitch and its jewel light, the jacks either side.
  put(body, box(1.3, 0.42, 1.25), pedal, [0, 0.6, -0.1]);
  put(body, box(1.32, 0.04, 1.27), metal, [0, 0.82, -0.1]);
  for (const x of [-0.38, 0, 0.38]) {
    put(body, cyl(0.1, 0.11, 0.1, 14), dark, [x, 0.88, 0.32]);
    put(body, box(0.02, 0.02, 0.08), glow(0xffffff), [x, 0.94, 0.36]);
  }
  put(body, cyl(0.09, 0.09, 0.08, 14), metal, [0.4, 0.86, -0.5]);
  put(body, ball(0.06, 10, 8), glow(0xff3a3a), [-0.4, 0.88, -0.5]);
  for (const side of [-1, 1]) put(body, cyl(0.07, 0.07, 0.12, 12), metal, [side * 0.7, 0.62, 0.1], [0, 0, Math.PI / 2]);

  // The bell jar on the pedal, and the brain in it, with its eye: the head, which leans and looks.
  put(body, cyl(0.78, 0.82, 0.08, 32), metal, [0, 0.86, -0.1]);
  put(body, cyl(0.74, 0.74, 1.0, 32, ), glass, [0, 1.38, -0.1]);
  put(body, new THREE.SphereGeometry(0.74, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass, [0, 1.88, -0.1]);
  put(body, ball(0.07, 10, 8), metal, [0, 2.64, -0.1]);
  const head = new THREE.Group();
  head.position.set(0, 1.5, -0.1);
  // Two hemispheres, folded all over, the cleft down the middle.
  for (const side of [-1, 1]) {
    put(head, ball(0.36, 18, 14), pink, [side * 0.2, 0.08, -0.04], [0, 0, 0], [0.95, 0.9, 1.2]);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      put(head, ring(0.25 - (k % 3) * 0.04, 0.035, Math.PI * 1.2), fold, [side * (0.2 + Math.cos(a) * 0.12), 0.12 + Math.sin(a) * 0.15, -0.05 + (k % 2 ? 0.1 : -0.12)], [Math.PI / 2 + (k % 3) * 0.4, side * 0.5, a]);
    }
  }
  put(head, box(0.03, 0.5, 0.8), dark, [0, 0.18, -0.04]);
  put(head, cyl(0.1, 0.06, 0.45, 12), pink, [0, -0.32, -0.08]);
  // The eye: one great eye open on the front of the brain, a spiral of an iris.
  put(head, ball(0.24, 20, 16), matte(0xf8f4e8), [0, 0.0, 0.32]);
  put(head, ball(0.16, 18, 12), fuzz, [0, 0.0, 0.5], [0, 0, 0], [1, 1, 0.35]);
  put(head, ring(0.1, 0.018), glow(r.color), [0, 0.0, 0.555]);
  put(head, ball(0.07, 12, 10), matte(0x050505), [0, 0.0, 0.56], [0, 0, 0], [1, 1, 0.3]);
  put(head, ball(0.025, 6, 4), glow(0xffffff), [0.05, 0.05, 0.575]);
  put(head, ball(0.26, 16, 10, ), pink, [0, 0.2, 0.25], [0.6, 0, 0], [1.05, 0.3, 0.7]);
  // Three more eyes on stalks, peering round.
  for (const [x, y, z, s] of [[-0.42, 0.35, 0.05, 0.08], [0.45, 0.3, -0.1, 0.07], [0.05, 0.5, -0.2, 0.06]] as const) {
    rod(head, [x * 0.4, 0.2, z], [x, y, z + 0.1], 0.025, pink);
    put(head, ball(s, 12, 10), matte(0xf8f4e8), [x, y, z + 0.1]);
    put(head, ball(s * 0.55, 10, 8), fuzz, [x, y, z + 0.1 + s * 0.6]);
    put(head, ball(s * 0.25, 6, 4), matte(0x050505), [x, y, z + 0.1 + s * 0.95]);
  }
  body.add(head);
  glowSprite(body, [0, 1.5, 0.3], 1.0, r.accent);
  // Patch cables from the pedal's jacks up into the brain, sagging and coiling.
  for (const side of [-1, 1]) {
    tube(body, [[side * 0.76, 0.62, 0.1], [side * 1.0, 0.9, 0.2], [side * 0.95, 1.5, 0.0], [side * 0.6, 1.95, -0.15], [side * 0.25, 1.7, -0.2]], 0.035, side < 0 ? glow(r.accent) : glow(r.color));
  }
  // The fuzz: soft lumps of it hanging in the air round the jar.
  const fog = new THREE.MeshPhongMaterial({ color: r.color, emissive: 0x401040, transparent: true, opacity: 0.35, depthWrite: false });
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    put(body, ball(0.22 + (k % 3) * 0.06, 10, 8), fog, [Math.cos(a) * 1.05, 1.2 + Math.sin(k * 1.7) * 0.5, Math.sin(a) * 1.05 - 0.1]);
  }

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
  };
}

// ---- The People-Vulture: Nonagon Infinity's boss ---------------------------------
// "People-vultures waiting by my stage": a great black vulture with a man's
// bald, frowning head on its long bare neck and a white ruff, flying low over
// the road with no kart under it, wings spread and beating, talons hanging.

function peopleVulture(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const feather = matte(r.color, { shininess: 25, specular: 0x332a3a });
  const tip = matte(0x120e16);
  const ruff = matte(0xf0ead8, { shininess: 5 });
  const skin = matte(0xe0a088, { shininess: 20 });
  const flush = matte(r.accent);
  const talon = matte(0xc8b880);

  // It flies: the bird rides low over the road, its talons hanging clear of it.
  const bird = new THREE.Group();
  bird.position.set(0, 1.4, -0.1);
  body.add(bird);
  // The body, level in flight and long, tipped a little nose-up.
  put(bird, ball(0.55, 20, 14), feather, [0, 0.12, 0], [0.12, 0, 0], [1.0, 0.95, 1.45]);
  // Rows of feather points down the back and flanks.
  for (let k = 0; k < 14; k++) {
    const side = k % 2 ? 1 : -1;
    const row = Math.floor(k / 2);
    put(bird, cone(0.12, 0.42, 6), k % 3 ? feather : tip, [side * (0.32 + (row % 2) * 0.1), 0.18 - row * 0.03, -0.1 - row * 0.1], [-1.75, 0, side * 0.3]);
  }
  // The tail: a fan of long feathers spread out flat behind.
  for (let k = -3; k <= 3; k++) put(bird, box(0.14, 0.04, 0.85), k % 2 ? tip : feather, [k * 0.09, 0.0, -0.95], [0.12, k * 0.17, 0]);
  // The ruff: a fluffy white collar where the bare neck comes out.
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    put(bird, ball(0.14, 10, 8), ruff, [Math.cos(a) * 0.28, 0.5 + Math.sin(a) * 0.12, 0.5 + Math.sin(a * 2) * 0.03]);
  }
  // The legs: bare and scaled, hanging down and trailing back in flight, the talons open and hooked.
  for (const side of [-1, 1]) {
    const hip: [number, number, number] = [side * 0.28, -0.3, 0.0];
    const ankle: [number, number, number] = [side * 0.36, -0.78, -0.38];
    rod(bird, hip, ankle, 0.075, feather, 0.05);
    for (let t = -1; t <= 1; t++) {
      const toe: [number, number, number] = [ankle[0] + t * 0.1, ankle[1] - 0.16, ankle[2] + 0.14];
      rod(bird, ankle, toe, 0.03, talon);
      put(bird, cone(0.025, 0.12, 5), tip, [toe[0], toe[1] - 0.03, toe[2] + 0.04], [2.3, 0, 0]);
    }
    // The hind talon, hooked back.
    const back: [number, number, number] = [ankle[0], ankle[1] - 0.12, ankle[2] - 0.14];
    rod(bird, ankle, back, 0.028, talon);
    put(bird, cone(0.022, 0.1, 5), tip, [back[0], back[1] - 0.03, back[2] - 0.03], [-2.3, 0, 0]);
  }

  // The wings: spread wide and beating, a fan of long dark primaries at each tip.
  const flappers: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.4, 0.3, 0.1);
    wing.userData.side = side;
    put(wing, ball(0.3, 12, 8), feather, [side * 0.45, 0.05, -0.05], [0, 0, side * 0.2], [1.8, 0.35, 1.0]);
    put(wing, ball(0.28, 12, 8), feather, [side * 0.9, 0.12, -0.15], [0, 0, side * 0.1], [1.6, 0.3, 1.0]);
    for (let k = 0; k < 7; k++) {
      const a = -0.5 + k * 0.17;
      const f = put(wing, box(0.95, 0.03, 0.16), k % 2 ? tip : feather, [0, 0, 0], [0, -side * a, 0]);
      f.position.set(side * (1.2 + Math.cos(a) * 0.35), 0.12 - k * 0.01, -0.15 - Math.sin(a) * 0.5 - k * 0.04);
    }
    for (let k = 0; k < 6; k++) put(wing, box(0.18, 0.025, 0.55), tip, [side * (0.25 + k * 0.2), 0.0, -0.45], [0.2, 0, 0]);
    bird.add(wing);
    flappers.push(wing);
  }

  // The neck: long, bare and wrinkled, craning up and forward, the head held high enough to show over the back.
  const neckPts: [number, number, number][] = [[0, 0.45, 0.45], [0, 0.78, 0.62], [0, 1.0, 0.85]];
  tube(bird, neckPts, 0.1, skin);
  for (let k = 0; k < 4; k++) put(bird, ring(0.1, 0.012), flush, [0, 0.58 + k * 0.1, 0.52 + k * 0.08], [Math.PI / 2 - 0.6, 0, 0]);

  // The head: a man's, bald and wrinkled, heavy-browed and frowning, a great hooked nose for a beak.
  const head = new THREE.Group();
  head.position.set(0, 2.52, 0.88);
  head.scale.setScalar(1.25);
  put(head, ball(0.24, 20, 16), skin, [0, 0.05, 0], [0, 0, 0], [0.92, 1.05, 1.0]);
  for (let k = 0; k < 3; k++) put(head, ring(0.12, 0.008, Math.PI * 0.8), flush, [0, 0.2 + k * 0.03, 0.17 - k * 0.02], [0.3, 0, Math.PI * 0.6]);
  for (const side of [-1, 1]) put(head, ball(0.06, 10, 8), skin, [side * 0.22, 0.03, -0.01], [0, 0, 0], [0.5, 1, 0.8]);
  eyes(head, 0.09, 0.19, 0.075, 0.04, 0x8a2a1a);
  brows(head, 0.15, 0.22, 0.075, 0.12, matte(0x6a5a50), 0.45);
  // The nose: long and hooked, beak-like.
  tube(head, [[0, 0.1, 0.22], [0, 0.03, 0.34], [0, -0.06, 0.38]], 0.045, skin);
  put(head, cone(0.04, 0.09, 8), skin, [0, -0.1, 0.36], [Math.PI - 0.6, 0, 0]);
  // A thin downturned mouth and a jowly chin.
  put(head, ring(0.06, 0.012, Math.PI), matte(0x5a1a1a), [0, -0.1, 0.21], [0, 0, 0]);
  put(head, ball(0.1, 10, 8), skin, [0, -0.15, 0.13], [0, 0, 0], [1.2, 0.6, 0.8]);
  // A wisp of grey hair either side, and a bald crown that shows from behind: wrinkles round the back of the skull.
  for (const side of [-1, 1]) put(head, ball(0.05, 8, 6), ruff, [side * 0.2, 0.14, -0.06], [0, 0, 0], [0.6, 1.2, 1]);
  for (let k = 0; k < 2; k++) put(head, ring(0.14 - k * 0.03, 0.008, Math.PI * 0.7), flush, [0, 0.02 + k * 0.06, -0.19], [0, Math.PI, Math.PI * 0.65]);
  body.add(head);

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
// "Half made of man, half of bear", altered face and altered skin: a hulking
// shaggy thing on all fours, a bear's ear and a wolf's, a horn, two glowing
// eyes and a third, nine white teeth, patches of scaled hide, a knife for its
// left hand and a fork for its right, trampling the earth as it comes.

function alteredBeast(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const fur = matte(r.color, { shininess: 6 });
  const furDark = matte(0x3a1a4a, { shininess: 6 });
  const hide = matte(0xffffff, { map: tex('beast-scales', () => scaleTexture('#5a8a2a', '#c8ff3a')), shininess: 40 });
  const skin = matte(0xc89a8a);
  const bone = matte(0xf4eedc);
  const steel = chrome();
  const eye = glow(r.accent);

  // It runs: high in the shoulder, low at the haunch, the whole bulk swaying.
  const beast = new THREE.Group();
  beast.position.y = 1.05;
  body.add(beast);
  put(beast, ball(0.75, 22, 16), fur, [0, 0.2, 0.3], [0, 0, 0], [1.2, 1.0, 1.1]);
  put(beast, ball(0.6, 20, 14), fur, [0, 0.0, -0.55], [0, 0, 0], [1.1, 0.9, 1.15]);
  put(beast, ball(0.45, 16, 12), furDark, [0, 0.65, 0.15], [0, 0, 0], [1.2, 0.7, 1.0]);
  // Altered skin: scaled patches over the fur, and a ridge of bony spikes down the back.
  for (const [x, y, z, s] of [[0.62, 0.3, 0.4, 0.3], [-0.55, 0.0, -0.5, 0.28], [0.3, 0.55, -0.3, 0.22]] as const) put(beast, ball(s, 12, 8), hide, [x, y, z], [0, 0, 0], [1, 0.45, 1]);
  for (let k = 0; k < 7; k++) put(beast, cone(0.07 + (k < 3 ? 0.03 : 0), 0.3 - k * 0.02, 6), bone, [0, 0.9 - k * 0.12, 0.35 - k * 0.2], [-0.4, 0, 0]);
  // Shaggy tufts all over.
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    put(beast, cone(0.1, 0.32, 5), k % 3 ? fur : furDark, [Math.cos(a) * 0.85, 0.15 + Math.sin(k * 2.1) * 0.25, 0.1 + Math.sin(a) * 0.5], [0, 0, -Math.cos(a) * 1.4]);
  }
  const tailRoot = new THREE.Group();
  tailRoot.position.set(0, 0.1, -1.1);
  beast.add(tailRoot);
  tube(tailRoot, [[0, 0, 0], [0, 0.2, -0.3], [0.1, 0.45, -0.45], [0.05, 0.6, -0.4]], 0.08, fur);
  put(tailRoot, cone(0.06, 0.18, 6), bone, [0.05, 0.68, -0.38]);

  // Four sprawled legs: bear's paws behind, and in front the altered hands, a knife on the left, a fork on the right.
  const legs: THREE.Object3D[] = [];
  const leg = (side: number, hipZ: number, phase: number, front: boolean) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.65, -0.1, hipZ);
    pivot.userData = { side, phase };
    const knee: [number, number, number] = [side * 0.35, -0.3, front ? 0.15 : -0.05];
    const foot: [number, number, number] = [side * 0.42, -0.9, front ? 0.25 : 0.05];
    rod(pivot, [0, 0, 0], knee, 0.26, fur, 0.2);
    put(pivot, ball(0.2, 12, 10), fur, knee);
    rod(pivot, knee, foot, 0.17, front ? skin : fur, 0.14);
    if (!front) {
      put(pivot, ball(0.2, 12, 10), furDark, foot, [0, 0, 0], [1.1, 0.5, 1.4]);
      for (let t = -1; t <= 1; t++) put(pivot, cone(0.035, 0.16, 5), bone, [foot[0] + t * 0.09, foot[1] - 0.02, foot[2] + 0.24], [Math.PI / 2 + 0.3, 0, 0]);
    } else if (side < 0) {
      // The knife: a long blade straight out of the wrist, edge down, its point forward.
      put(pivot, cyl(0.1, 0.12, 0.25, 10), furDark, [foot[0], foot[1] + 0.05, foot[2]]);
      const blade = new THREE.Shape();
      blade.moveTo(0, 0);
      blade.lineTo(0.62, 0.02);
      blade.quadraticCurveTo(0.5, 0.2, 0, 0.2);
      blade.closePath();
      put(pivot, new THREE.ExtrudeGeometry(blade, { depth: 0.035, bevelEnabled: false }).translate(0, 0, -0.0175).rotateY(-Math.PI / 2), steel, [foot[0], foot[1] - 0.08, foot[2] + 0.05]);
    } else {
      // The fork: four tines spread out of the wrist.
      put(pivot, cyl(0.1, 0.12, 0.25, 10), furDark, [foot[0], foot[1] + 0.05, foot[2]]);
      put(pivot, box(0.26, 0.06, 0.18), steel, [foot[0], foot[1] - 0.05, foot[2] + 0.15]);
      for (let t = 0; t < 4; t++) put(pivot, box(0.035, 0.035, 0.4), steel, [foot[0] - 0.11 + t * 0.073, foot[1] - 0.08, foot[2] + 0.42], [0.25, 0, 0]);
    }
    beast.add(pivot);
    legs.push(pivot);
  };
  for (const side of [-1, 1]) {
    leg(side, 0.55, side < 0 ? 0 : Math.PI, true);
    leg(side, -0.7, side < 0 ? Math.PI : 0, false);
  }

  // The head: big and low-slung, all wrong: a bear's round ear and a wolf's pointed one, a horn, three eyes, nine white teeth.
  const head = new THREE.Group();
  head.position.set(0, 0.35, 1.2);
  head.scale.setScalar(1.2);
  put(head, ball(0.42, 20, 16), fur, [0, 0.05, 0], [0, 0, 0], [1.1, 0.95, 1.0]);
  put(head, ball(0.28, 16, 12), skin, [0, -0.08, 0.3], [0, 0, 0], [1.0, 0.75, 1.05]);
  put(head, ball(0.09, 10, 8), matte(0x1a0a14), [0, 0.0, 0.58], [0, 0, 0], [1.3, 0.8, 0.8]);
  put(head, ball(0.3, 14, 10), hide, [0.22, 0.2, 0.15], [0, 0, 0], [0.8, 0.5, 0.7]);
  // The ears: round bear on the left, tall wolf on the right; and a curled horn over the scaled side.
  put(head, ball(0.13, 12, 10), fur, [-0.3, 0.42, -0.05], [0, 0, 0], [1, 1, 0.5]);
  put(head, ball(0.08, 10, 8), skin, [-0.3, 0.42, -0.0], [0, 0, 0], [1, 1, 0.4]);
  put(head, cone(0.13, 0.42, 4), furDark, [0.3, 0.55, -0.1], [-0.15, 0, -0.3]);
  horn(head, [[0.18, 0.35, 0.1], [0.35, 0.65, 0.05], [0.5, 0.75, -0.15], [0.55, 0.65, -0.35]], 0.06, bone);
  // Three eyes: two great glowing ones under a heavy brow, and a little one in the forehead.
  for (const side of [-1, 1]) {
    put(head, ball(0.1, 14, 10), eye, [side * 0.18, 0.15, 0.33]);
    put(head, box(0.025, 0.14, 0.02), matte(0x050505), [side * 0.18, 0.15, 0.43]);
    glowSprite(head, [side * 0.19, 0.15, 0.43], 0.4, r.accent);
  }
  brows(head, 0.27, 0.36, 0.18, 0.22, furDark, 0.35);
  put(head, ball(0.055, 10, 8), eye, [0, 0.36, 0.34]);
  put(head, ball(0.025, 6, 4), matte(0x050505), [0, 0.36, 0.39]);
  // The mouth: a wide grin dropped open, nine white teeth along the top.
  put(head, box(0.48, 0.1, 0.12), matte(0x2a0a1a), [0, -0.2, 0.42]);
  for (let k = 0; k < 9; k++) {
    const x = -0.21 + k * 0.0525;
    put(head, cone(0.025, k === 1 || k === 7 ? 0.14 : 0.08, 5), bone, [x, -0.18, 0.47 - Math.abs(x) * 0.25], [Math.PI, 0, 0]);
  }
  // A shaggy mane round the back of the head.
  for (let k = 0; k < 10; k++) {
    const a = Math.PI * 0.15 + (k / 9) * Math.PI * 0.7;
    put(head, cone(0.1, 0.4, 5), k % 2 ? fur : furDark, [Math.cos(a) * 0.4, Math.sin(a) * 0.35 - 0.05, -0.25], [-1.9, 0, Math.cos(a) * 0.8]);
  }
  beast.add(head);

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
// through": a fire demon heaving up waist-deep out of a spinning rift, glowing
// red and lapis hot, pyre muscles flexed and cracked with fire, horns, a
// mane of flame, wings of smoke and embers, smirking beyond the flames.

function balrog(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const rock = matte(0x2a1210, { shininess: 20, specular: 0x552010, emissive: 0x1a0402 });
  const red = matte(r.color, { shininess: 50, specular: 0xff6a3a, emissive: 0x5a0a02 });
  const lapis = glow(r.accent);
  const crack = glow(0xffa020);
  const hot = glow(0xffe060);
  const hornMat = matte(0x1a1210, { shininess: 60, specular: 0x886655 });
  const smoke = new THREE.MeshPhongMaterial({ color: 0x1a1018, emissive: 0x2a0800, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  const flame = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameHot = new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

  // The rift: a torn hole in the air hovering over the road, lapis at its rim, spinning.
  const rotors: THREE.Object3D[] = [];
  const rift = new THREE.Group();
  rift.position.y = 0.38;
  put(rift, cyl(1.5, 1.5, 0.06, 40), matte(0x05020a, { emissive: 0x0a0418 }), [0, 0, 0]);
  put(rift, ring(1.5, 0.09), lapis, [0, 0.02, 0], [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const pts: [number, number, number][] = [];
    for (let j = 0; j <= 5; j++) pts.push([Math.cos(a + j * 0.22) * (1.45 - j * 0.22), 0.05, Math.sin(a + j * 0.22) * (1.45 - j * 0.22)]);
    tube(rift, pts, 0.03, k % 2 ? lapis : crack);
  }
  body.add(rift);
  rotors.push(rift);
  const pads = [glowSprite(body, [0, 0.3, 0], 3.2, r.accent), glowSprite(body, [0, 0.45, 0], 1.8, 0xff6a1a)];
  // Molten splashes thrown up round the rim.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    put(body, cone(0.08, 0.35 + (k % 3) * 0.15, 6), k % 2 ? flame : flameHot, [Math.cos(a) * 1.3, 0.55, Math.sin(a) * 1.3]);
  }

  // The demon, up to the waist out of the rift, leaning forward.
  const demon = new THREE.Group();
  demon.position.set(0, 0.4, -0.1);
  demon.rotation.x = 0.18;
  demon.scale.setScalar(0.88);
  body.add(demon);
  // Torso: a great barrel chest and belly, plates of muscle, fire in the cracks and a lapis heart.
  put(demon, ball(0.62, 22, 16), red, [0, 0.55, 0], [0, 0, 0], [1.25, 0.95, 0.85]);
  put(demon, ball(0.75, 22, 16), red, [0, 1.25, 0.05], [0, 0, 0], [1.35, 0.95, 0.9]);
  for (const side of [-1, 1]) put(demon, ball(0.36, 16, 12), red, [side * 0.38, 1.45, 0.42], [0, 0, 0], [1.1, 0.75, 0.5]);
  for (let k = 0; k < 3; k++) for (const side of [-1, 1]) put(demon, ball(0.15, 10, 8), red, [side * 0.17, 0.95 - k * 0.24, 0.5 - k * 0.03], [0, 0, 0], [1.1, 0.8, 0.5]);
  for (const [a, b] of [
    [[-0.5, 1.6, 0.55], [-0.2, 1.1, 0.68]],
    [[0.55, 1.55, 0.5], [0.25, 1.2, 0.66]],
    [[0, 1.25, 0.72], [0.0, 0.5, 0.58]],
    [[-0.8, 1.1, 0.3], [-0.6, 0.5, 0.35]],
    [[0.75, 0.9, 0.38], [0.65, 0.4, 0.3]],
  ] as [number, number, number][][]) rod(demon, a, b, 0.03, crack);
  put(demon, ball(0.17, 14, 10), lapis, [0, 1.35, 0.68], [0, 0, 0], [1, 1, 0.5]);
  glowSprite(demon, [0, 1.35, 0.78], 0.9, r.accent);
  // Arms: huge, the right fist thrust forward, the left raised and flexed; flame licking off the forearms.
  const armUp = (side: number, elbow: [number, number, number], fist: [number, number, number]) => {
    const shoulder: [number, number, number] = [side * 0.95, 1.55, 0.05];
    put(demon, ball(0.36, 16, 12), red, shoulder);
    rod(demon, shoulder, elbow, 0.26, red, 0.22);
    put(demon, ball(0.22, 12, 10), red, elbow);
    rod(demon, elbow, fist, 0.2, red, 0.24);
    put(demon, ball(0.26, 14, 10), red, fist, [0, 0, 0], [1, 0.9, 1.1]);
    for (let k = 0; k < 3; k++) put(demon, cone(0.07, 0.4, 6), k % 2 ? flame : flameHot, [(elbow[0] + fist[0]) / 2 + side * 0.1, (elbow[1] + fist[1]) / 2 + 0.15, (elbow[2] + fist[2]) / 2 - 0.1 * k], [-0.6, 0, -side * 0.4]);
  };
  armUp(1, [1.35, 1.05, 0.45], [1.05, 1.1, 1.15]);
  armUp(-1, [-1.4, 1.75, 0.15], [-1.15, 2.4, 0.35]);

  // Wings: two great spans of smoke on dark bone, embers along the edges, beating.
  const flappers: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.5, 1.6, -0.45);
    wing.userData.side = side;
    const elbow: [number, number, number] = [side * 1.0, 0.7, -0.3];
    const tipA: [number, number, number] = [side * 2.0, 1.2, -0.6];
    const tipB: [number, number, number] = [side * 2.0, 0.1, -0.9];
    const tipC: [number, number, number] = [side * 1.5, -0.8, -0.8];
    rod(wing, [0, 0, 0], elbow, 0.08, rock, 0.06);
    for (const t of [tipA, tipB, tipC]) rod(wing, elbow, t, 0.04, rock, 0.02);
    tri(wing, [0, 0, 0], elbow, tipC, smoke);
    tri(wing, elbow, tipA, tipB, smoke);
    tri(wing, elbow, tipB, tipC, smoke);
    for (const t of [tipA, tipB, tipC]) put(wing, ball(0.07, 8, 6), crack, t);
    demon.add(wing);
    flappers.push(wing);
  }

  // The head: horned and heavy-jawed, eyes white-hot, a smirk, a mane of fire streaming back.
  const head = new THREE.Group();
  head.position.set(0, 2.3, 0.25);
  put(head, ball(0.38, 18, 14), red, [0, 0, 0], [0, 0, 0], [1, 1.05, 1]);
  put(head, ball(0.3, 16, 12), red, [0, -0.2, 0.15], [0, 0, 0], [1.15, 0.75, 1]);
  brows(head, 0.12, 0.32, 0.15, 0.24, rock, 0.45);
  for (const side of [-1, 1]) {
    put(head, ball(0.065, 10, 8), hot, [side * 0.15, 0.04, 0.32]);
    glowSprite(head, [side * 0.15, 0.04, 0.38], 0.45, 0xffd040);
  }
  // The smirk: a crooked slash of fire, one corner up, two fangs at it.
  put(head, box(0.32, 0.05, 0.05), crack, [0.02, -0.24, 0.39], [0, 0, 0.18]);
  for (const x of [-0.1, 0.12]) put(head, cone(0.03, 0.1, 5), matte(0xf8f0d8), [x, -0.28, 0.38], [Math.PI, 0, 0]);
  // Horns: two great ones sweeping out and forward like a bull's, two small ones behind.
  for (const side of [-1, 1]) {
    horn(head, [[side * 0.28, 0.18, 0], [side * 0.6, 0.35, 0.0], [side * 0.8, 0.65, 0.2], [side * 0.72, 0.95, 0.35]], 0.09, hornMat);
    horn(head, [[side * 0.2, 0.3, -0.2], [side * 0.3, 0.55, -0.4], [side * 0.25, 0.7, -0.6]], 0.045, hornMat);
  }
  // The mane: tongues of flame up and back off the skull and down the shoulders.
  for (let k = 0; k < 12; k++) {
    const a = -1.2 + (k / 11) * 2.4;
    put(head, cone(0.12, 0.55 + (k % 3) * 0.15, 6), k % 2 ? flame : flameHot, [Math.sin(a) * 0.3, 0.2 + Math.cos(a) * 0.15, -0.25], [-1.1 + Math.abs(a) * 0.2, 0, -a * 0.6]);
  }
  glowSprite(head, [0, 0.4, -0.4], 1.6, 0xff6a1a);
  demon.add(head);

  return {
    body,
    wheels: [],
    exhausts: [new THREE.Vector3(-0.7, 0.5, -1.3), new THREE.Vector3(0.7, 0.5, -1.3)],
    rearTrack: 0.8,
    rearZ: -1.3,
    spinners: [],
    rotors,
    shadow: [3.6, 3.6],
    hover: { bob: 0.1, pads },
    head,
    flappers,
  };
}

// ---- The Soy-Protein Munt Machine: Han-Tyumi and the Murder of the Universe's boss
// "So I built a machine, a human machine, I made it with steel and
// soy-protein, born from a test tube and into a vat": a steel vat of green
// glowing goo on six wheels, the machine heaving up out of it, lumpy beige
// protein bolted into steel ribs, one camera eye and one soft one, a test
// tube for a crown, hoses everywhere, a steel claw and a soft arm.

function muntMachine(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const steel = chrome();
  const dull = matte(0x7a828c, { shininess: 60, specular: 0x888888 });
  const protein = matte(r.color, { shininess: 30, specular: 0x554430 });
  const lump = matte(0xc0a070, { shininess: 25 });
  const goo = glow(r.accent);
  const gooSoft = new THREE.MeshPhongMaterial({ color: r.accent, emissive: 0x2a6a10, transparent: true, opacity: 0.75, shininess: 80 });
  const glass = new THREE.MeshPhongMaterial({ color: 0xe0fff0, transparent: true, opacity: 0.25, shininess: 140, specular: 0xffffff, depthWrite: false });
  const hose = matte(0x2a2a30);

  // The chassis: a steel bed on six wheels, rivets down the sides.
  put(body, box(1.55, 0.3, 2.9), dull, [0, 0.62, 0]);
  for (const side of [-1, 1]) for (let k = 0; k < 8; k++) put(body, ball(0.03, 6, 4), steel, [side * 0.78, 0.62, -1.3 + k * 0.37]);
  put(body, box(1.2, 0.2, 0.15), steel, [0, 0.6, 1.5]);
  headlights(body, 0.45, 0.62, 1.48, 0.08, 0xc8ff9a);

  // The vat: a fat steel drum, a glass band round it full of green goo, slopping over the brim.
  put(body, cyl(0.82, 0.82, 0.25, 32), steel, [0, 0.9, -0.3]);
  put(body, cyl(0.76, 0.76, 0.8, 32), glass, [0, 1.42, -0.3]);
  put(body, cyl(0.7, 0.7, 0.7, 32), gooSoft, [0, 1.37, -0.3]);
  put(body, cyl(0.82, 0.82, 0.1, 32), steel, [0, 1.85, -0.3]);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    put(body, box(0.06, 0.8, 0.06), steel, [Math.cos(a) * 0.8, 1.42, -0.3 + Math.sin(a) * 0.8]);
  }
  put(body, cyl(0.72, 0.72, 0.05, 32), goo, [0, 1.9, -0.3]);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    put(body, ball(0.07, 8, 6), goo, [Math.cos(a) * 0.84, 1.75 - (k % 3) * 0.25, -0.3 + Math.sin(a) * 0.84], [0, 0, 0], [1, 1.8, 1]);
  }
  // Bubbles rising in the goo.
  for (let k = 0; k < 8; k++) put(body, ball(0.05 + (k % 3) * 0.02, 8, 6), glow(0xeaffc8), [Math.sin(k * 2.3) * 0.5, 1.15 + (k % 4) * 0.15, -0.3 + Math.cos(k * 2.3) * 0.5]);
  glowSprite(body, [0, 1.4, -0.3], 1.8, r.accent);

  // The machine, heaving up out of the goo: a lumpy protein torso in steel ribs.
  const machine = new THREE.Group();
  machine.position.set(0, 1.9, -0.25);
  body.add(machine);
  put(machine, ball(0.48, 18, 14), protein, [0, 0.45, 0], [0, 0, 0], [1.15, 1.1, 0.9]);
  for (const [x, y, z, s] of [[0.3, 0.6, 0.3, 0.2], [-0.35, 0.3, 0.28, 0.18], [0.1, 0.15, 0.38, 0.15], [-0.2, 0.75, 0.25, 0.14], [0.42, 0.25, -0.1, 0.17]] as const) put(machine, ball(s, 12, 10), lump, [x, y, z]);
  for (let k = 0; k < 3; k++) put(machine, ring(0.5 - Math.abs(k - 1) * 0.05, 0.035), dull, [0, 0.2 + k * 0.25, 0], [Math.PI / 2, 0, 0], [1.15, 0.9, 1]);
  put(machine, box(0.08, 0.95, 0.08), steel, [0, 0.45, 0.42]);
  // A soft arm on the left, lumps all down it, flopped over the rim; a steel claw on the right, raised.
  tube(machine, [[-0.5, 0.6, 0.05], [-0.9, 0.45, 0.25], [-1.0, 0.0, 0.45], [-0.85, -0.25, 0.6]], 0.13, protein);
  for (let k = 0; k < 3; k++) put(machine, ball(0.1, 8, 6), lump, [-0.9 + k * 0.02, 0.4 - k * 0.22, 0.25 + k * 0.12]);
  put(machine, ball(0.16, 12, 10), protein, [-0.85, -0.28, 0.62], [0, 0, 0], [1.2, 0.8, 1]);
  const shoulder: [number, number, number] = [0.55, 0.65, 0.0];
  const elbow: [number, number, number] = [0.95, 0.95, 0.2];
  const wrist: [number, number, number] = [0.9, 1.4, 0.45];
  put(machine, ball(0.14, 12, 10), steel, shoulder);
  rod(machine, shoulder, elbow, 0.07, dull);
  put(machine, ball(0.1, 10, 8), steel, elbow);
  rod(machine, elbow, wrist, 0.06, dull);
  for (const t of [-1, 1]) {
    tube(machine, [wrist, [wrist[0] + t * 0.12, wrist[1] + 0.15, wrist[2] + 0.08], [wrist[0] + t * 0.06, wrist[1] + 0.3, wrist[2] + 0.12]], 0.03, steel);
  }
  // Hoses from the vat into the body, feeding it.
  for (const side of [-1, 1]) tube(body, [[side * 0.78, 1.6, -0.9], [side * 0.95, 2.1, -0.85], [side * 0.6, 2.6, -0.6], [side * 0.3, 2.5, -0.35]], 0.05, hose);

  // The head: a steel skull half grown over with protein, one camera eye and one soft eye, a steel jaw, a test tube for a crown.
  const head = new THREE.Group();
  head.position.set(0, 3.0, -0.15);
  put(head, ball(0.32, 18, 14), protein, [0, 0, 0], [0, 0, 0], [1.05, 1.0, 1.0]);
  put(head, new THREE.SphereGeometry(0.335, 32, 16, -Math.PI * 0.05, Math.PI, 0, Math.PI * 0.75), dull, [0, 0, 0], [0, 0, 0]);
  // The camera eye on the steel side, the soft one on the protein side.
  put(head, cyl(0.1, 0.12, 0.14, 16), steel, [0.13, 0.05, 0.3], [Math.PI / 2, 0, 0]);
  put(head, ball(0.07, 12, 10), glow(0xff3a2a), [0.13, 0.05, 0.37], [0, 0, 0], [1, 1, 0.5]);
  glowSprite(head, [0.13, 0.05, 0.42], 0.35, 0xff3a2a);
  put(head, ball(0.08, 12, 10), matte(0xf8f4e0), [-0.14, 0.04, 0.27]);
  put(head, ball(0.04, 10, 8), goo, [-0.14, 0.04, 0.33]);
  put(head, ball(0.02, 6, 4), matte(0x050505), [-0.14, 0.04, 0.36]);
  put(head, ball(0.1, 10, 8), lump, [-0.17, 0.13, 0.22], [0, 0, 0], [1.3, 0.5, 1]);
  // The jaw: a steel grille of teeth, goo dribbling.
  put(head, box(0.34, 0.12, 0.2), dull, [0, -0.25, 0.18]);
  for (let k = 0; k < 6; k++) put(head, box(0.035, 0.08, 0.02), steel, [-0.13 + k * 0.052, -0.2, 0.29]);
  put(head, ball(0.04, 8, 6), goo, [0.06, -0.33, 0.28], [0, 0, 0], [0.8, 1.6, 0.8]);
  // The test tube: rising out of the crown, half full of goo, a cork in the top.
  put(head, cyl(0.07, 0.07, 0.45, 14), glass, [0, 0.48, -0.05], [-0.15, 0, 0.1]);
  put(head, cyl(0.06, 0.06, 0.22, 14), goo, [0.01, 0.38, -0.03], [-0.15, 0, 0.1]);
  put(head, cyl(0.06, 0.07, 0.08, 12), matte(0x8a5a30), [-0.03, 0.72, -0.09], [-0.15, 0, 0.1]);
  machine.add(head);
  head.position.sub(machine.position);

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
    spinners: [],
    shadow: [2.6, 3.6],
    head,
  };
}

// ---- The King of the Castle in the Air: Polygondwanaland's boss ------------------
// "Smooth sailing through the castle in the air", over the one-eyed people
// and the monopods, and the men "whose heads do grow beneath their
// shoulders": the king is one of those, his face in his chest and his crown
// on his shoulders, standing at the prow of a sailing ship that is also a
// castle, towers at its corners and a sail on its mast, riding a cloud.

function castleKing(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const cloud = matte(0xf4f4ff, { shininess: 5, emissive: 0x30304a });
  const woodMat = matte(0xffffff, { map: tex('wood', woodTexture) });
  const stone = matte(0xffffff, { map: tex('castle-stone', () => stoneTexture([196, 190, 214], [236, 232, 248])) });
  const roof = gloss(r.color);
  const gold = brass();
  const robe = matte(r.color, { shininess: 30 });
  const ermine = matte(0xf8f4ee);
  const skin = matte(0xe0b090);
  const sail = matte(0xfff4dc, { side: THREE.DoubleSide });

  // The cloud it sails on.
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    put(body, ball(0.45 + (k % 3) * 0.1, 14, 10), cloud, [Math.cos(a) * 0.85, 0.35 + (k % 2) * 0.1, Math.sin(a) * 1.35], [0, 0, 0], [1.2, 0.7, 1.2]);
  }
  put(body, ball(0.8, 18, 12), cloud, [0, 0.35, 0], [0, 0, 0], [1.3, 0.6, 1.9]);
  const pads = [glowSprite(body, [0, 0.3, 0.8], 1.6, 0xd8e8ff), glowSprite(body, [0, 0.3, -0.8], 1.6, 0xd8e8ff)];

  // The hull: a ship's, pointed at the bow, the castle's walls built up on its gunwales.
  const hull = new THREE.Shape();
  hull.moveTo(0, 1.8);
  hull.quadraticCurveTo(0.85, 1.0, 0.8, -0.6);
  hull.lineTo(0.7, -1.4);
  hull.lineTo(-0.7, -1.4);
  hull.lineTo(-0.8, -0.6);
  hull.quadraticCurveTo(-0.85, 1.0, 0, 1.8);
  const hullGeo = new THREE.ExtrudeGeometry(hull, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 }).rotateX(Math.PI / 2);
  put(body, hullGeo, woodMat, [0, 1.18, 0]);
  put(body, box(1.5, 0.05, 2.6), woodMat, [0, 1.2, -0.1]);
  // Battlements round the deck.
  for (let k = 0; k < 9; k++) for (const side of [-1, 1]) put(body, box(0.12, 0.16, 0.18), stone, [side * 0.72, 1.3, -1.25 + k * 0.28]);
  // A tower at each corner of the stern, a taller keep amidships, conical roofs and pennants.
  const tower = (x: number, z: number, h: number, rad: number) => {
    put(body, cyl(rad, rad * 1.08, h, 16), stone, [x, 1.2 + h / 2, z]);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      put(body, box(0.1, 0.12, 0.1), stone, [x + Math.cos(a) * rad, 1.26 + h, z + Math.sin(a) * rad]);
    }
    put(body, cone(rad * 1.25, h * 0.75, 16), roof, [x, 1.3 + h + h * 0.37, z]);
    put(body, box(0.05, 0.1, 0.05), glow(0xffe48a), [x, 1.2 + h * 0.6, z + rad]);
    rod(body, [x, 1.3 + h + h * 0.74, z], [x, 1.6 + h + h * 0.74, z], 0.012, gold);
    tri(body, [x, 1.6 + h + h * 0.74, z], [x, 1.48 + h + h * 0.74, z], [x, 1.54 + h + h * 0.74, z - 0.25], sail);
  };
  tower(-0.62, -1.15, 0.85, 0.24);
  tower(0.62, -1.15, 0.85, 0.24);
  tower(0, -0.55, 1.0, 0.34);
  // The mast before the keep, a billowing sail with a crown on it.
  rod(body, [0, 1.2, -0.2], [0, 3.45, -0.2], 0.045, woodMat);
  rod(body, [-0.85, 3.3, -0.2], [0.85, 3.3, -0.2], 0.03, woodMat);
  const sailGeo = new THREE.PlaneGeometry(1.6, 1.15, 8, 4);
  const pos = sailGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, (1 - (pos.getX(i) / 0.8) ** 2) * 0.25);
  sailGeo.computeVertexNormals();
  put(body, sailGeo, sail, [0, 2.75, -0.18]);
  put(body, cyl(0.16, 0.16, 0.02, 5), roof, [0, 2.75, 0.1], [Math.PI / 2, 0, 0]);
  put(body, ring(0.2, 0.025), gold, [0, 2.75, 0.1]);

  // The king at the prow: no head above his shoulders, his face in his chest, crowned on the shoulders.
  const king = new THREE.Group();
  king.position.set(0, 1.22, 0.7);
  body.add(king);
  put(king, cyl(0.38, 0.55, 0.85, 20), robe, [0, 0.42, 0]);
  put(king, cyl(0.56, 0.56, 0.08, 20), ermine, [0, 0.04, 0]);
  const cape = new THREE.CylinderGeometry(0.42, 0.62, 1.25, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8);
  put(king, cape, matte(0x2a1a6a, { side: THREE.DoubleSide }), [0, 0.6, -0.05]);
  // The arms: one holding up an orb, the other a sceptre.
  arm(king, [0.66, 1.52, 0.0], [0.78, 1.15, 0.4], 0.08, robe, skin);
  put(king, ball(0.11, 12, 10), gold, [0.78, 1.3, 0.42]);
  put(king, ring(0.11, 0.015), glow(r.accent), [0.78, 1.3, 0.42], [Math.PI / 2, 0, 0]);
  arm(king, [-0.66, 1.52, 0.0], [-0.72, 0.9, 0.4], 0.08, robe, skin);
  rod(king, [-0.72, 0.4, 0.42], [-0.72, 1.6, 0.42], 0.025, gold);
  put(king, ball(0.06, 10, 8), glow(r.accent), [-0.72, 1.65, 0.42]);
  // The chest he wears as a face: a big round torso, the eyes where a chest would be, the nose and mouth below, a beard down the belly.
  const head = new THREE.Group();
  head.position.set(0, 1.15, 0);
  put(head, ball(0.48, 22, 16), skin, [0, 0, 0], [0, 0, 0], [1.25, 0.95, 0.75]);
  put(head, box(1.35, 0.16, 0.62), robe, [0, 0.44, 0]);
  for (const side of [-1, 1]) put(head, ball(0.16, 12, 8), gold, [side * 0.62, 0.48, 0], [0, 0, 0], [1, 0.5, 1]);
  put(head, box(1.38, 0.06, 0.64), ermine, [0, 0.35, 0]);
  eyes(head, 0.12, 0.3, 0.17, 0.085, 0x2a5ad8);
  brows(head, 0.25, 0.33, 0.17, 0.2, matte(0x5a3a1a), -0.15);
  put(head, ball(0.08, 10, 8), skin, [0, -0.02, 0.36], [0, 0, 0], [0.9, 1.1, 1]);
  put(head, ring(0.1, 0.02, Math.PI), matte(0x7a1a2a), [0, -0.14, 0.33], [0, 0, Math.PI]);
  put(head, cone(0.22, 0.5, 12), matte(0x8a5a2a), [0, -0.45, 0.28], [Math.PI - 0.2, 0, 0], [1, 1, 0.5]);
  // The crown on his shoulders, where a head would be: a gold band of points with jewels.
  put(head, cyl(0.26, 0.26, 0.2, 20), gold, [0, 0.6, 0]);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    put(head, cone(0.06, 0.18, 4), gold, [Math.cos(a) * 0.26, 0.78, Math.sin(a) * 0.26]);
    put(head, ball(0.03, 6, 4), glow(k % 2 ? 0xff3a5a : r.accent), [Math.cos(a) * 0.27, 0.62, Math.sin(a) * 0.27]);
  }
  put(head, ball(0.25, 14, 10), robe, [0, 0.55, 0], [0, 0, 0], [1, 0.4, 1]);
  king.add(head);

  return {
    body,
    wheels: [],
    exhausts: [new THREE.Vector3(-0.4, 0.5, -1.45), new THREE.Vector3(0.4, 0.5, -1.45)],
    rearTrack: 0.7,
    rearZ: -1.3,
    spinners: [],
    shadow: [2.8, 4.0],
    hover: { bob: 0.16, pads },
    head,
  };
}

// ---- The Devil: Infest the Rats' Nest's boss --------------------------------------
// "God, it's pretty hot down here undersurface": the Devil himself, crimson,
// horned and grinning, wings and tail and spines, a trident up, at the wheel
// of a hot rod with the door to hell built into its back, glowing amber, and
// a thousand flies whirling round him.

function theDevil(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const paint = gloss(0x6a0a12, { shininess: 120 });
  const skin = matte(r.color, { shininess: 50, specular: 0x663333 });
  const dark = matte(0x14080a);
  const hornMat = matte(0x1a1012, { shininess: 70, specular: 0x886666 });
  const amber = glow(r.accent);
  const stone = matte(0xffffff, { map: tex('hell-stone', () => stoneTexture([60, 34, 30], [110, 70, 56])) });
  const metal = chrome();
  const gold = brass();

  // The rod: long and low, a blower out of the bonnet, flames down the flanks.
  put(body, box(1.3, 0.38, 2.9), paint, [0, 0.6, 0.05]);
  put(body, box(1.0, 0.3, 1.1), paint, [0, 0.85, 0.85]);
  put(body, box(0.5, 0.25, 0.5), metal, [0, 1.12, 0.95]);
  put(body, box(0.55, 0.06, 0.2), metal, [0, 1.28, 1.05]);
  for (let k = 0; k < 4; k++) put(body, cyl(0.04, 0.04, 0.25, 8), metal, [-0.18 + k * 0.12, 1.4, 0.9]);
  sideDecal(body, tex('flames', () => flameDecalTexture()), 0.66, 0.6, 0.2, 2.2, 0.36);
  headlights(body, 0.42, 0.66, 1.5, 0.09, 0xffc84a);
  const grips = steeringWheel(body, 1.1, 0.35, 0.18, matte(0x14080a));

  // The door to hell at the back: a stone arch, the door in it glowing amber, a ring for a knocker.
  const door = new THREE.Group();
  door.position.set(0, 0.8, -1.05);
  door.scale.set(0.8, 1, 1);
  body.add(door);
  const arch = new THREE.Shape();
  arch.moveTo(-0.65, 0);
  arch.lineTo(-0.65, 1.1);
  arch.absarc(0, 1.1, 0.65, Math.PI, 0, true);
  arch.lineTo(0.65, 0);
  arch.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-0.45, 0.05);
  hole.lineTo(-0.45, 1.1);
  hole.absarc(0, 1.1, 0.45, Math.PI, 0, true);
  hole.lineTo(0.45, 0.05);
  hole.closePath();
  arch.holes.push(hole);
  put(door, new THREE.ExtrudeGeometry(arch, { depth: 0.22, bevelEnabled: false }), stone, [0, 0, -0.11]);
  const panel = new THREE.Shape();
  panel.moveTo(-0.45, 0.05);
  panel.lineTo(-0.45, 1.1);
  panel.absarc(0, 1.1, 0.45, Math.PI, 0, true);
  panel.lineTo(0.45, 0.05);
  panel.closePath();
  const panelGeo = new THREE.ShapeGeometry(panel);
  put(door, panelGeo, amber, [0, 0, -0.02]);
  put(door, panelGeo, amber, [0, 0, -0.02], [0, Math.PI, 0]);
  for (let k = 0; k < 3; k++) put(door, box(0.04, 1.3, 0.03), matte(0xa85a10), [-0.25 + k * 0.25, 0.75, 0.0]);
  put(door, ring(0.08, 0.018), gold, [0.25, 0.7, -0.05]);
  put(door, ring(0.08, 0.018), gold, [0.25, 0.7, 0.05]);
  glowSprite(door, [0, 0.8, -0.2], 2.0, r.accent);
  glowSprite(door, [0, 0.8, 0.2], 1.4, r.accent);

  // The Devil at the wheel, sat tall.
  const devil = new THREE.Group();
  devil.position.set(0, 0.8, -0.35);
  body.add(devil);
  put(devil, box(0.65, 0.12, 0.6), dark, [0, 0.05, 0]);
  put(devil, ball(0.34, 18, 14), skin, [0, 0.62, 0], [0, 0, 0], [1.15, 1.25, 0.85]);
  put(devil, ball(0.22, 12, 10), dark, [0, 0.2, 0.15], [0, 0, 0], [1.3, 0.7, 1.2]);
  // Spines down his back.
  for (let k = 0; k < 5; k++) put(devil, cone(0.05, 0.2, 6), hornMat, [0, 0.95 - k * 0.15, -0.28 + k * 0.02], [-1.3, 0, 0]);
  for (const side of [-1, 1]) {
    const grip = grips[side < 0 ? 0 : 1];
    arm(devil, [side * 0.36, 0.85, 0.05], [grip[0], grip[1] - 0.8, grip[2] + 0.35], 0.08, skin, skin);
  }
  // The trident, held up in the left hand above the wheel.
  rod(devil, [-0.55, 0.2, 0.35], [-0.55, 2.0, 0.35], 0.03, gold);
  put(devil, box(0.4, 0.05, 0.05), gold, [-0.55, 1.95, 0.35]);
  for (const x of [-0.2, 0, 0.2]) put(devil, cone(0.04, x === 0 ? 0.3 : 0.22, 4), gold, [-0.55 + x, 2.1 + (x === 0 ? 0.04 : 0), 0.35]);
  put(devil, ball(0.09, 10, 8), skin, [-0.5, 0.95, 0.35]);
  rod(devil, [-0.36, 0.85, 0.05], [-0.5, 0.95, 0.35], 0.07, skin);
  // Bat wings off his shoulders, beating.
  const flappers: THREE.Object3D[] = [];
  const web = matte(0x5a0a10, { side: THREE.DoubleSide, emissive: 0x200204 });
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.25, 0.9, -0.25);
    wing.userData.side = side;
    const wrist: [number, number, number] = [side * 0.7, 0.55, -0.2];
    const fingers: [number, number, number][] = [[side * 1.35, 0.35, -0.35], [side * 1.2, -0.05, -0.45], [side * 0.8, -0.3, -0.4]];
    rod(wing, [0, 0, 0], wrist, 0.035, hornMat);
    put(wing, cone(0.03, 0.15, 5), hornMat, [wrist[0], wrist[1] + 0.08, wrist[2]]);
    for (const f of fingers) rod(wing, wrist, f, 0.02, hornMat, 0.01);
    tri(wing, [0, 0, 0], wrist, fingers[2], web);
    tri(wing, wrist, fingers[0], fingers[1], web);
    tri(wing, wrist, fingers[1], fingers[2], web);
    devil.add(wing);
    flappers.push(wing);
  }
  // The tail: up over the door and back, an arrowhead on the end.
  tube(devil, [[0, 0.15, -0.3], [0.2, 0.1, -0.7], [0.4, 0.6, -0.9], [0.55, 1.4, -0.75], [0.45, 1.75, -0.55]], 0.04, skin);
  put(devil, cone(0.12, 0.22, 4), skin, [0.42, 1.85, -0.5], [0.4, 0, 0], [1, 1, 0.3]);

  // The head: a grin, yellow eyes, pointed ears, a goatee and two great curling horns.
  const head = new THREE.Group();
  head.position.set(0, 1.25, 0.02);
  put(head, ball(0.26, 20, 16), skin, [0, 0.05, 0], [0, 0, 0], [0.92, 1.05, 0.95]);
  put(head, ball(0.15, 14, 10), skin, [0, -0.12, 0.12], [0, 0, 0], [1, 0.8, 0.9]);
  for (const side of [-1, 1]) {
    put(head, ball(0.055, 12, 10), glow(0xffd23a), [side * 0.09, 0.08, 0.22], [0, 0, side * -0.3], [1.3, 0.7, 0.6]);
    put(head, box(0.015, 0.07, 0.02), matte(0x050505), [side * 0.09, 0.08, 0.255]);
    put(head, cone(0.06, 0.18, 4), skin, [side * 0.27, 0.12, -0.02], [0, 0, -side * 1.1], [1, 1, 0.4]);
  }
  brows(head, 0.17, 0.22, 0.09, 0.14, dark, -0.5);
  // The grin: a wide curve up at both ends, a row of white teeth in it.
  put(head, ring(0.12, 0.022, Math.PI), dark, [0, -0.04, 0.2], [0.3, 0, Math.PI]);
  for (let k = 0; k < 5; k++) put(head, box(0.03, 0.035, 0.02), matte(0xfff8e8), [-0.07 + k * 0.035, -0.1 + Math.abs(k - 2) * 0.01, 0.235]);
  put(head, cone(0.06, 0.2, 8), dark, [0, -0.3, 0.14], [Math.PI + 0.3, 0, 0]);
  put(head, ball(0.06, 8, 6), dark, [0, 0.29, 0.05], [0, 0, 0], [2.2, 0.5, 1.6]);
  for (const side of [-1, 1]) horn(head, [[side * 0.13, 0.22, 0], [side * 0.3, 0.4, -0.02], [side * 0.36, 0.62, 0.08], [side * 0.28, 0.78, 0.18]], 0.06, hornMat);
  devil.add(head);

  // The flies: a thousand (well, sixteen) whirling round over his head.
  const rotors: THREE.Object3D[] = [];
  const swarm = new THREE.Group();
  swarm.position.set(0, 2.1, -0.4);
  const flyWing = new THREE.MeshBasicMaterial({ color: 0xd8e8ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const rad = 0.75 + (k % 3) * 0.3;
    const f = new THREE.Group();
    f.position.set(Math.cos(a) * rad, Math.sin(k * 1.9) * 0.35, Math.sin(a) * rad);
    f.rotation.y = -a;
    put(f, ball(0.05, 8, 6), dark, [0, 0, 0], [0, 0, 0], [1, 0.9, 1.5]);
    put(f, ball(0.035, 6, 4), matte(0x8a1010), [0, 0.01, 0.06]);
    for (const s of [-1, 1]) put(f, new THREE.CircleGeometry(0.05, 8), flyWing, [s * 0.05, 0.04, -0.01], [-Math.PI / 2 + 0.4, 0, s * 0.5], [1, 1.5, 1]);
    swarm.add(f);
  }
  body.add(swarm);
  rotors.push(swarm);

  return {
    body,
    wheels: [-1, 1].flatMap((side) => [
      { x: side * 0.68, z: 1.1, radius: 0.32, width: 0.24, front: true },
      { x: side * 0.78, z: -0.95, radius: 0.56, width: 0.46, front: false },
    ]),
    exhausts: pipes(body, 0.45, 0.55, -1.45),
    rearTrack: 0.78,
    rearZ: -0.95,
    spinners: [],
    rotors,
    shadow: [2.6, 3.6],
    head,
    flappers,
  };
}

// ---- The Mother of the Coven: PetroDragonic Apocalypse's boss ---------------------
// "Antlers shed ribbons of blood, draped like thorns upon the brow",
// "taxidermy with eyes of fire, chanting songs above the lyre", the
// blood-moon goddess called on, the crystals charged and the circle blessed:
// a tall robed witch crowned with great antlers hung with red ribbons, a lyre
// in her hand, on an oak altar cart lit with candles, crystals at its
// corners, a stag's head with fire for eyes on the front, the blood-moon at
// her back.

function covenMother(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const oak = matte(0xffffff, { map: tex('wood', woodTexture), color: 0xb08a6a });
  const robe = matte(r.color, { shininess: 15 });
  const veil = matte(0x1a1420, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const skin = matte(0xe8ddd0);
  const antler = matte(0xe0ccaa, { shininess: 20 });
  const ribbon = matte(r.accent, { side: THREE.DoubleSide, emissive: 0x3a0606 });
  const fire = glow(0xff7a1a);
  const wax = matte(0xf4ecd8);
  const gold = brass();
  const fur = matte(0x7a5a3a, { shininess: 5 });

  // The cart: an oak platform with a knotted rail, on four great cart wheels.
  put(body, box(1.75, 0.22, 2.8), oak, [0, 0.82, 0]);
  for (const side of [-1, 1]) {
    put(body, box(0.08, 0.3, 2.7), oak, [side * 0.84, 1.06, 0]);
    for (let k = 0; k < 4; k++) put(body, ball(0.05, 8, 6), matte(0x5a3a20), [side * 0.88, 1.06, -1.0 + k * 0.66]);
  }
  // The circle chalked on the deck, glowing, and a crystal at each corner on a stand.
  put(body, ring(0.62, 0.02), glow(0xf8f0ff), [0, 0.94, -0.35], [Math.PI / 2, 0, 0]);
  const crystalColors = [0x9a5aff, 0x5ad8ff, 0xff5a9a, 0x7aff9a];
  [[-0.6, 1.2], [0.6, 1.2], [-0.6, -1.25], [0.6, -1.25]].forEach(([x, z], k) => {
    put(body, cyl(0.06, 0.08, 0.3, 8), oak, [x, 1.08, z]);
    put(body, new THREE.OctahedronGeometry(0.14), glow(crystalColors[k]), [x, 1.38, z], [0, k, 0], [0.7, 1.4, 0.7]);
    glowSprite(body, [x, 1.38, z], 0.6, crystalColors[k]);
  });
  // The altar at the front: a stone slab with candles burning on it and a lyre stood against it.
  put(body, box(1.0, 0.35, 0.5), matte(0x6a6070), [0, 1.11, 0.85]);
  for (let k = 0; k < 5; k++) {
    const x = -0.4 + k * 0.2;
    const h = 0.18 + (k % 3) * 0.08;
    put(body, cyl(0.04, 0.045, h, 10), wax, [x, 1.3 + h / 2, 0.85 + (k % 2) * 0.1]);
    put(body, cone(0.03, 0.08, 8), fire, [x, 1.32 + h + 0.03, 0.85 + (k % 2) * 0.1]);
    glowSprite(body, [x, 1.32 + h + 0.04, 0.85 + (k % 2) * 0.1], 0.25, 0xffa040);
  }
  // The figurehead: a stuffed stag's head on a shield, its eyes on fire.
  const stag = new THREE.Group();
  stag.position.set(0, 1.05, 1.5);
  body.add(stag);
  put(stag, cyl(0.38, 0.38, 0.06, 6), oak, [0, 0, -0.04], [Math.PI / 2, 0, 0]);
  put(stag, ball(0.2, 14, 10), fur, [0, 0.05, 0.12], [0.4, 0, 0], [0.9, 1.1, 1.0]);
  put(stag, cyl(0.07, 0.12, 0.3, 10), fur, [0, -0.08, 0.3], [1.2, 0, 0]);
  put(stag, ball(0.05, 8, 6), matte(0x14100c), [0, -0.12, 0.45]);
  for (const side of [-1, 1]) {
    put(stag, ball(0.045, 10, 8), fire, [side * 0.1, 0.08, 0.27]);
    glowSprite(stag, [side * 0.1, 0.08, 0.3], 0.35, 0xff6a1a);
    put(stag, cone(0.05, 0.14, 4), fur, [side * 0.2, 0.18, 0.08], [0, 0, -side * 1.0], [1, 1, 0.4]);
    tube(stag, [[side * 0.08, 0.22, 0.1], [side * 0.22, 0.42, 0.05], [side * 0.3, 0.6, 0.12]], 0.025, antler);
    tube(stag, [[side * 0.18, 0.38, 0.06], [side * 0.12, 0.55, 0.18]], 0.018, antler);
  }

  // The blood-moon, small, up by her raised hand: off the line the camera looks down past her.
  put(body, ball(0.2, 16, 12), glow(0xd02a2a), [0.75, 2.5, -0.35]);
  glowSprite(body, [0.75, 2.5, -0.35], 0.9, 0xff3a3a);

  // Her: tall and robed, stood in the circle, the robe pooling round her feet.
  const witch = new THREE.Group();
  witch.position.set(0, 0.93, -0.35);
  witch.scale.setScalar(0.92);
  body.add(witch);
  put(witch, cyl(0.2, 0.55, 1.45, 20), robe, [0, 0.72, 0]);
  put(witch, cyl(0.58, 0.58, 0.06, 20), robe, [0, 0.03, 0]);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    put(witch, box(0.04, 1.3, 0.02), matte(0x1a0e26), [Math.cos(a) * 0.36, 0.68, Math.sin(a) * 0.36], [0, -a + Math.PI / 2, Math.cos(a) * 0.12]);
  }
  put(witch, ball(0.25, 14, 10), robe, [0, 1.42, 0], [0, 0, 0], [1.35, 0.6, 1]);
  put(witch, ring(0.22, 0.03), gold, [0, 1.35, 0.02], [Math.PI / 2, 0, 0]);
  // One arm raised to the moon, the other holding the lyre.
  arm(witch, [0.3, 1.42, 0], [0.55, 2.05, 0.15], 0.07, robe, skin);
  glowSprite(witch, [0.56, 2.15, 0.15], 0.5, r.accent);
  arm(witch, [-0.3, 1.42, 0], [-0.45, 1.05, 0.38], 0.07, robe, skin);
  const lyre = new THREE.Group();
  lyre.position.set(-0.45, 1.15, 0.42);
  lyre.rotation.set(0, 0.3, 0.15);
  tube(lyre, [[-0.12, -0.15, 0], [-0.18, 0.05, 0], [-0.1, 0.25, 0], [-0.16, 0.38, 0]], 0.025, gold);
  tube(lyre, [[0.12, -0.15, 0], [0.18, 0.05, 0], [0.1, 0.25, 0], [0.16, 0.38, 0]], 0.025, gold);
  put(lyre, box(0.34, 0.03, 0.03), gold, [0, 0.3, 0]);
  put(lyre, box(0.28, 0.06, 0.05), oak, [0, -0.16, 0]);
  for (let k = 0; k < 5; k++) rod(lyre, [-0.08 + k * 0.04, -0.13, 0.01], [-0.08 + k * 0.04, 0.29, 0.01], 0.004, glow(0xfff4d0));
  witch.add(lyre);

  // The head: pale and solemn, glowing eyes under a veil of long dark hair, crowned with great antlers hung with red ribbons.
  const head = new THREE.Group();
  head.position.set(0, 1.72, 0.02);
  put(head, ball(0.2, 18, 14), skin, [0, 0, 0], [0, 0, 0], [0.88, 1.1, 0.95]);
  for (const side of [-1, 1]) {
    put(head, ball(0.035, 10, 8), glow(r.accent), [side * 0.07, 0.03, 0.17]);
    glowSprite(head, [side * 0.07, 0.03, 0.2], 0.2, r.accent);
  }
  put(head, box(0.08, 0.015, 0.02), matte(0x5a1020), [0, -0.1, 0.18]);
  // The hair: a long dark veil falling from the crown down past the shoulders.
  put(head, new THREE.SphereGeometry(0.23, 24, 14, Math.PI * 0.15, Math.PI * 1.7, 0, Math.PI * 0.6), veil, [0, 0.02, -0.01], [0, Math.PI, 0]);
  put(head, new THREE.CylinderGeometry(0.22, 0.38, 0.9, 20, 1, true, Math.PI * 0.65, Math.PI * 0.7), veil, [0, -0.4, -0.04]);
  // The antlers: great branching racks, the tines curving up, red ribbons hanging from them.
  const rack = new THREE.Group();
  rack.scale.setScalar(0.68);
  head.add(rack);
  for (const side of [-1, 1]) {
    const beam: [number, number, number][] = [[side * 0.12, 0.15, 0], [side * 0.35, 0.35, -0.05], [side * 0.55, 0.65, -0.1], [side * 0.62, 0.98, -0.05], [side * 0.55, 1.22, 0.02]];
    tube(rack, beam, 0.035, antler);
    for (const [i, len] of [[1, 0.25], [2, 0.3], [3, 0.22]] as const) {
      const b = beam[i];
      horn(rack, [b, [b[0] + side * 0.05, b[1] + len * 0.6, b[2] + 0.12], [b[0] - side * 0.02, b[1] + len, b[2] + 0.15]], 0.022, antler);
    }
    horn(rack, [beam[1], [beam[1][0] - side * 0.05, beam[1][1] + 0.2, beam[1][2] + 0.15], [beam[1][0] - side * 0.12, beam[1][1] + 0.3, beam[1][2] + 0.2]], 0.02, antler);
    // Ribbons: long strips hung from the tines, twisting a little.
    for (const [i, len] of [[1, 0.7], [2, 0.9], [3, 0.6], [4, 0.5]] as const) {
      const b = beam[i];
      put(rack, new THREE.PlaneGeometry(0.05, len), ribbon, [b[0] + side * 0.02, b[1] - len / 2, b[2]], [0, side * 0.6 + i * 0.3, side * 0.06]);
    }
  }
  witch.add(head);

  return {
    body,
    wheels: [-1, 1].flatMap((side) => [
      { x: side * 1.0, z: 0.95, radius: 0.5, width: 0.14, front: true, material: oak },
      { x: side * 1.0, z: -0.95, radius: 0.5, width: 0.14, front: false, material: oak },
    ]),
    exhausts: [new THREE.Vector3(-0.4, 0.75, -1.45), new THREE.Vector3(0.4, 0.75, -1.45)],
    rearTrack: 1.0,
    rearZ: -0.95,
    spinners: [],
    shadow: [2.8, 3.6],
    head,
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
  'flying-pig': flyingPig,
  'skeleton-dragon': skeletonDragon,
  'lord-of-lightning': lordOfLightning,
  rattlesnake,
  'mind-voice': mindVoice,
  'people-vulture': peopleVulture,
  'altered-beast': alteredBeast,
  balrog,
  'munt-machine': muntMachine,
  'castle-king': castleKing,
  'the-devil': theDevil,
  'coven-mother': covenMother,
};

/** How much bigger than built each boss is drawn: they loom over the roster. */
const BOSS_SCALE: Record<string, number> = {
  'mind-voice': 1.25,
  'people-vulture': 1.15,
  'altered-beast': 1.3,
  balrog: 1.15,
  'munt-machine': 1,
  'castle-king': 0.8,
  'the-devil': 1.15,
  'coven-mother': 0.95,
};

export function buildKartModel(racer: RacerDef): KartModel {
  const build = BUILDERS[racer.id] ?? lizardWarlock;
  const model = build(racer);
  const s = BOSS_SCALE[racer.id];
  return s ? enlarge(model, s) : model;
}

/**
 * A model drawn `s` times its size: the body's contents in a scaled group
 * (the body's own scale is the view's, for Horology), and the wheels, the
 * exhausts, the rear track and the shadow scaled with it.
 */
function enlarge(m: KartModel, s: number): KartModel {
  const inner = new THREE.Group();
  inner.scale.setScalar(s);
  inner.add(...m.body.children);
  m.body.add(inner);
  return {
    ...m,
    wheels: m.wheels.map((w) => ({ ...w, x: w.x * s, z: w.z * s, radius: w.radius * s, width: w.width * s })),
    exhausts: m.exhausts.map((e) => e.clone().multiplyScalar(s)),
    rearTrack: m.rearTrack * s,
    rearZ: m.rearZ * s,
    shadow: [m.shadow[0] * s, m.shadow[1] * s],
  };
}

/** Whether a racer has a model of its own (every one should), not the fallback. */
export function hasKartModel(racerId: string): boolean {
  return racerId in BUILDERS;
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
  put(group, new THREE.SphereGeometry(1, 56, 28, 0, Math.PI * 2, 0, Math.PI / 2), nose, [0, 0, 1.1], [Math.PI / 2, 0, 0]);
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

export interface GliderModel {
  group: THREE.Group;
  /** The canopy, which flutters and banks with the steering. */
  wing: THREE.Group;
}

/**
 * The glider a launcher opens (physics/kart.ts): a paraglider canopy over
 * the kart in the racer's colours, striped cell by cell, with its lines
 * down to the seat. Built hidden, about the kart's own origin.
 */
const GLIDER_HEIGHT = 2.5;

export function buildGlider(r: RacerDef): GliderModel {
  const group = new THREE.Group();
  const wing = new THREE.Group();
  wing.position.y = GLIDER_HEIGHT;
  group.add(wing);
  const cells = 9;
  const spread = (95 * Math.PI) / 180;
  const radius = 2;
  const colours = [gloss(r.color, { side: THREE.DoubleSide }), gloss(r.accent, { side: THREE.DoubleSide })];
  const tips: [number, number, number][] = [];
  for (let k = 0; k < cells; k++) {
    // Cells round an arch, the middle one on top.
    const a = -spread / 2 + (spread * (k + 0.5)) / cells;
    const x = Math.sin(a) * radius;
    const y = Math.cos(a) * radius - radius;
    put(wing, box((spread * radius) / cells + 0.02, 0.14, 1.2), colours[k % 2], [x, y, 0], [0.12, 0, -a]);
    if (k === 0 || k === cells - 1 || k === (cells - 1) / 2) tips.push([x, y + GLIDER_HEIGHT - 0.1, 0]);
  }
  // A darker leading edge, with the cell mouths.
  put(wing, box(0.5, 0.18, 0.08), matte(0x1a1a24), [0, 0, 0.62], [0.12, 0, 0]);
  // The lines: from the canopy's tips and middle down to either side of the seat.
  const line = matte(0xf2f2f2);
  for (const t of tips) for (const side of [-1, 1]) rod(group, t, [side * 0.45, 1.1, 0.1], 0.015, line);
  group.visible = false;
  return { group, wing };
}
