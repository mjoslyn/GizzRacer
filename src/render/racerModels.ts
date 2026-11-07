import * as THREE from 'three';
import type { RacerDef } from '../physics/racers';
import { arlo, flyingPig, neonMoth } from './racers/beasts';
import { cosmicCoyote, cyborgGourmand, mantisShredder, octoOrganist } from './racers/drivers';
import { fuzzGolem, lordOfLightning, microtonalMonk, mushroomSage, swampWitch } from './racers/mystics';
import { gatorDrummer, gilaRider, lizardWarlock, rattlesnake, skeletonDragon } from './racers/reptiles';
import { glowTexture, skyEnvMap } from './textures';
import { ambroseKennySmith, cookCraig, jasonGalea, joeyWalker, lucasHarwood, michaelCavanagh, stuMackenzie } from './racers/band';
import { alteredBeast, balrog, covenMother, fourthColour, mindVoice, muntMachine, peopleVulture, ratKing } from './racers/bosses';

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
   * A leg with `userData.gallop` hangs straight under its hip instead and
   * swings fore and aft about its x axis, folding `userData.lower` (its lower
   * leg) as it comes forward; a `sway` with `userData.bound` rocks nose to tail.
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


// ==== The story bosses ==========================================================
// One for each story suite's end (core/story.ts), each from its song's
// lyrics: bigger and stranger than the roster, and plainly that song's
// villain. They drive with the same kart physics as everyone.

/** A flat triangle from three points (wing membranes, banners). */
export function tri(parent: THREE.Object3D, a: [number, number, number], b: [number, number, number], c: [number, number, number], mat: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  g.computeVertexNormals();
  return put(parent, g, mat, [0, 0, 0]);
}

/** A tube through `pts` (horns, tails, cables, antler tines). */
export function tube(parent: THREE.Object3D, pts: [number, number, number][], radius: number, mat: THREE.Material, closed = false): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed);
  return put(parent, new THREE.TubeGeometry(curve, Math.max(8, pts.length * 6), radius, 8, closed), mat, [0, 0, 0]);
}

/** A tapered horn curling along `pts`: a tube thick at the root, then a cone tip. */
export function horn(parent: THREE.Object3D, pts: [number, number, number][], radius: number, mat: THREE.Material): void {
  tube(parent, pts.slice(0, -1), radius, mat);
  const a = new THREE.Vector3(...pts[pts.length - 2]);
  const b = new THREE.Vector3(...pts[pts.length - 1]);
  const d = b.clone().sub(a);
  const tip = put(parent, cone(radius, d.length(), 8), mat, [0, 0, 0]);
  tip.position.copy(a).addScaledVector(d, 0.5);
  tip.quaternion.setFromUnitVectors(UP, d.normalize());
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
  'fourth-colour': fourthColour,
  'rat-king': ratKing,
  'coven-mother': covenMother,
};

/** How much bigger than built each boss is drawn: they loom over the roster. */
const BOSS_SCALE: Record<string, number> = {
  'mind-voice': 1.25,
  'people-vulture': 1.15,
  'altered-beast': 1.3,
  balrog: 0.9,
  'munt-machine': 1,
  'fourth-colour': 1,
  'rat-king': 1.15,
  'coven-mother': 0.95,
  'cyborg-gourmand': 1.1,
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
