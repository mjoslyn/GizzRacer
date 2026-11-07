import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RacerDef } from '../../physics/racers';
import { type KartModel, box, glowSprite, headlights, pipes, put, rod } from '../racerModels';
import { grilleTexture, skyEnvMap, sparkleTexture, yikesTexture } from '../textures';

/**
 * The band: stylized cartoons, each in a vehicle built from his instrument.
 *
 * Big sculpted heads on smaller bodies (the NBA Jam manner), all in work
 * coveralls with their names on the patch, their hair, moustaches, glasses
 * and colouring taken from photos. Materials are shared by colour, and once a
 * racer is built its static parts are merged by material (`bake`), so the
 * detail costs triangles, not draw calls. The head, and anything the kart
 * view animates, stays a part of its own.
 */

// ---- Materials, shared by colour and finish -----------------------------------

let env: THREE.CubeTexture | null = null;
const envMap = () => (env ??= skyEnvMap());
const mats = new Map<string, THREE.Material>();
function shared<T extends THREE.Material>(key: string, make: () => T): T {
  let m = mats.get(key) as T | undefined;
  if (!m) mats.set(key, (m = make()));
  return m;
}

interface Finish {
  shine?: number;
  spec?: number;
  flat?: boolean;
  emissive?: number;
  opacity?: number;
  /** Reflects the sky by this much. */
  env?: number;
}
function phong(color: number, f: Finish = {}): THREE.MeshPhongMaterial {
  const key = `phong:${color}:${f.shine ?? 12}:${f.spec ?? 0x111111}:${f.flat ? 1 : 0}:${f.emissive ?? 0}:${f.opacity ?? 1}:${f.env ?? 0}`;
  return shared(
    key,
    () =>
      new THREE.MeshPhongMaterial({
        color,
        shininess: f.shine ?? 12,
        specular: f.spec ?? 0x111111,
        flatShading: !!f.flat,
        emissive: f.emissive ?? 0,
        transparent: (f.opacity ?? 1) < 1,
        opacity: f.opacity ?? 1,
        ...(f.env ? { envMap: envMap(), reflectivity: f.env, combine: THREE.MixOperation } : {}),
      }),
  );
}
const matte = (c: number) => phong(c);
const gloss = (c: number) => phong(c, { shine: 90, spec: 0x666666, env: 0.25 });
const steel = () => phong(0xd8dee8, { shine: 140, spec: 0xffffff, env: 0.75 });
const alu = () => phong(0xb8bec8, { shine: 70, spec: 0x888888, env: 0.35 });
const brassy = () => phong(0xd8a83a, { shine: 90, spec: 0xffe0a0, env: 0.4 });
const lit = (c: number) => shared(`basic:${c}`, () => new THREE.MeshBasicMaterial({ color: c }));
const rubber = () => matte(0x1c1c1c);
/** A painted texture on a material of its own, made once. */
function decalMat(key: string, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 128, basic = false): THREE.Material {
  return shared(`decal:${key}`, () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d')!, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const o = { map: t, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 };
    return basic ? new THREE.MeshBasicMaterial(o) : new THREE.MeshPhongMaterial({ ...o, shininess: 30 });
  });
}
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

// ---- Geometry: low segment counts for the small parts ---------------------------

const sph = (r: number, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const cy = (rt: number, rb: number, h: number, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const tor = (r: number, tube: number, arc = Math.PI * 2, rs = 6, ts = 18) => new THREE.TorusGeometry(r, tube, rs, ts, arc);
type V3 = [number, number, number];
const HALF_PI = Math.PI / 2;

/** A tube through points (a cable, a strap, a rail). */
function cable(parent: THREE.Object3D, pts: V3[], r: number, mat: THREE.Material, segs = 16, radial = 5): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  return put(parent, new THREE.TubeGeometry(curve, segs, r, radial, false), mat, [0, 0, 0]);
}

/** A coiled cable from a to b: a helix round the line between them. */
function coil(parent: THREE.Object3D, a: V3, b: V3, r: number, turns: number, mat: THREE.Material): void {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const axis = vb.clone().sub(va);
  const side = new THREE.Vector3(0, 1, 0).cross(axis).normalize();
  if (side.lengthSq() < 0.01) side.set(1, 0, 0);
  const up = axis.clone().cross(side).normalize();
  const pts: V3[] = [];
  const n = turns * 8;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const a2 = t * turns * Math.PI * 2;
    const p = va.clone().addScaledVector(axis, t).addScaledVector(side, Math.cos(a2) * r).addScaledVector(up, Math.sin(a2) * r);
    pts.push(p.toArray() as V3);
  }
  cable(parent, pts, 0.012, mat, n * 2, 4);
}

/**
 * Merges the static meshes under `root` into one mesh per material, in
 * root's space. `keep` (and what's under it) is left as it is: the parts the
 * kart view moves. Meshes with children or a render order are left too.
 */
function bake(root: THREE.Object3D, keep: THREE.Object3D[] = []): void {
  let top: THREE.Object3D = root;
  while (top.parent) top = top.parent;
  top.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const skip = new Set(keep);
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[] }>();
  const victims: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (skip.has(c)) continue;
      if (c instanceof THREE.Mesh && !Array.isArray(c.material) && c.children.length === 0 && c.renderOrder === 0) {
        const m = new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld);
        const g = (c.geometry as THREE.BufferGeometry).clone();
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.clearGroups();
        g.applyMatrix4(m);
        if (m.determinant() < 0) flipWinding(g);
        let entry = byMat.get(c.material);
        if (!entry) byMat.set(c.material, (entry = { geos: [] }));
        entry.geos.push(g);
        victims.push(c);
      } else walk(c);
    }
  };
  walk(root);
  for (const v of victims) {
    v.parent?.remove(v);
    v.geometry.dispose();
  }
  for (const [mat, { geos }] of byMat) {
    const indexed = geos.every((g) => g.index);
    const merged = mergeGeometries(indexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g)));
    if (merged) root.add(new THREE.Mesh(merged, mat));
  }
}

function flipWinding(g: THREE.BufferGeometry): void {
  if (g.index) {
    const idx = g.index;
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
    return;
  }
  for (const attr of Object.values(g.attributes) as THREE.BufferAttribute[]) {
    for (let i = 0; i < attr.count; i += 3)
      for (let c = 0; c < attr.itemSize; c++) {
        const b = attr.getComponent(i + 1, c);
        attr.setComponent(i + 1, c, attr.getComponent(i + 2, c));
        attr.setComponent(i + 2, c, b);
      }
  }
}

// ---- The figure ------------------------------------------------------------------

export interface Look {
  skin: number;
  hair: number;
  style: 'long' | 'short' | 'shaggy' | 'mop' | 'wavy' | 'tousled' | 'mullet';
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
  hat?: { color: number; kind: 'cap' };
  /** The face he's pulling: a grin, singing out, a sideways smirk, teeth gritted. */
  mouth?: 'grin' | 'sing' | 'smirk' | 'grit';
  /** Brows: raised (negative) or knitted down at the middle (positive). */
  brow?: number;
  /** The T-shirt showing at the open collar. */
  tee?: number;
  /** Sleeves rolled to the elbow. */
  rolled?: boolean;
}

/** Big-head mode: how much larger than life the heads are. */
const BIG_HEAD = 1.45;

/** Work coveralls wrapped round a cylinder: a zip down the front, a chest pocket, a name patch, stitching. */
function coverallMat(color: number, trim: number, name: string): THREE.Material {
  return shared(`coverall:${color}:${trim}:${name}`, () => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = hex(color);
    g.fillRect(0, 0, 256, 256);
    // Seams down the sides, a darker fold or two, so it reads as cloth; stitching beside the seams.
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(62, 0, 4, 256);
    g.fillRect(190, 0, 4, 256);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let y = 2; y < 256; y += 7) {
      g.fillRect(68, y, 2, 4);
      g.fillRect(186, y, 2, 4);
    }
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(96, 150, 10, 106);
    g.fillRect(150, 170, 8, 86);
    // The zip.
    g.fillStyle = '#c8c8c8';
    g.fillRect(126, 0, 4, 256);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = 4; y < 256; y += 8) g.fillRect(124, y, 8, 2);
    // A chest pocket with a flap and a pen on the left, the name patch on the right.
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 3;
    g.strokeRect(84, 60, 32, 36);
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.fillRect(84, 60, 32, 10);
    g.fillStyle = '#2a2a2a';
    g.fillRect(90, 50, 4, 16);
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
    // On the back, between the shoulders: the name again, big, in the trim colour.
    g.font = 'italic 900 30px "Arial Black", sans-serif';
    g.fillStyle = hex(trim);
    g.fillText(name.toUpperCase(), 0, 70, 90);
    g.fillText(name.toUpperCase(), 256, 70, 90);
    // A belt line.
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, 214, 256, 10);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    // A cylinder's seam is at the back: turn the zip round to face forward.
    t.offset.x = 0.5;
    return new THREE.MeshPhongMaterial({ map: t, shininess: 12, specular: 0x111111 });
  });
}

const skinMat = (look: Look) => phong(look.skin, { shine: 25, spec: 0x221a14 });

/**
 * A cartoon musician from the waist up at `d`, facing +z: a big sculpted
 * head on a smaller body in work coveralls. Returns the head (unrotated, for
 * the lean animation).
 */
function musician(d: THREE.Group, look: Look): THREE.Group {
  const skin = skinMat(look);
  const shade = matte(new THREE.Color(look.skin).multiplyScalar(0.82).getHex());
  const hair = phong(look.hair, { flat: true, shine: 40, spec: 0x333333 });
  const suit = coverallMat(look.shirt, look.trim ?? 0xffffff, look.name);
  const cloth = matte(look.shirt);
  const collar = matte(look.trim ?? look.shirt);
  // Torso in coveralls, shoulders rounded, a collar folded down round the neck, the tee at the open neck.
  put(d, cy(0.25, 0.3, 0.58, 24), suit, [0, 0.34, 0]);
  for (const side of [-1, 1]) {
    put(d, sph(0.11, 12, 8), cloth, [side * 0.27, 0.58, 0]);
    put(d, box(0.13, 0.03, 0.1), collar, [side * 0.07, 0.66, 0.15], [0.5, 0, side * -0.5]);
    // Shoulder seam and a pocket flap with a button.
    put(d, box(0.04, 0.012, 0.012), matte(0x111111), [side * 0.2, 0.615, 0.06], [0, 0, side * -0.4]);
  }
  put(d, box(0.1, 0.03, 0.02), cloth, [-0.1, 0.48, 0.255], [-0.15, -0.2, 0]);
  put(d, sph(0.01, 6, 4), steel(), [-0.1, 0.47, 0.268]);
  put(d, cy(0.14, 0.14, 0.05, 16), collar, [0, 0.65, 0]);
  put(d, box(0.09, 0.06, 0.02), matte(look.tee ?? 0xf4f0e8), [0, 0.62, 0.235], [-0.2, 0, 0]);
  put(d, cy(0.1, 0.12, 0.16, 12), skin, [0, 0.72, 0]);
  // A belt round the waist, a buckle.
  put(d, cy(0.302, 0.302, 0.045, 24), matte(0x2a2018), [0, 0.11, 0]);
  put(d, box(0.08, 0.055, 0.02), brassy(), [0, 0.11, 0.3]);

  const head = new THREE.Group();
  head.position.set(0, 1.0, 0.02);
  head.scale.set(BIG_HEAD * (look.faceWidth ?? 1), BIG_HEAD, BIG_HEAD);
  // Skull, jaw, cheekbones, brow ridge, chin.
  put(head, sph(0.25, 28, 20), skin, [0, 0.02, -0.01], [0, 0, 0], [0.92, 1.06, 1]);
  put(head, sph(0.2, 22, 14), skin, [0, -0.1, 0.04], [0, 0, 0], [0.95, 0.8, 1]);
  put(head, sph(0.07, 12, 8), skin, [0, -0.2, 0.15], [0, 0, 0], [1.1, 0.7, 0.8]);
  for (const side of [-1, 1]) put(head, sph(0.07, 12, 10), skin, [side * 0.115, -0.035, 0.145], [0, 0, 0], [1, 0.75, 0.6]);
  put(head, box(0.32, 0.04, 0.07), skin, [0, 0.095, 0.2]);
  // Eyes: sclera, iris, pupil, a glint, and a lid over the top; a shadow under each.
  const iris = phong(look.iris ?? 0x4a3020, { shine: 80, spec: 0xffffff });
  const white = phong(0xfaf6ec, { shine: 60 });
  const tilt = look.brow ?? -0.18;
  for (const side of [-1, 1]) {
    const x = side * 0.085;
    put(head, sph(0.05, 16, 12), white, [x, 0.035, 0.205], [0, 0, 0], [1.25, 0.85, 0.7]);
    put(head, sph(0.028, 12, 8), iris, [x, 0.035, 0.235]);
    put(head, sph(0.014, 8, 6), matte(0x050505), [x, 0.035, 0.252]);
    put(head, sph(0.007, 6, 4), lit(0xffffff), [x + 0.008, 0.045, 0.258]);
    put(head, new THREE.SphereGeometry(0.054, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), skin, [x, 0.047, 0.201], [-0.42 - Math.max(0, tilt) * 0.6, 0, side * tilt * 0.4], [1.25, 0.8, 0.75]);
    put(head, sph(0.04, 10, 6), shade, [x, -0.002, 0.2], [0, 0, 0], [1.3, 0.35, 0.5]);
    // Brows: the hair colour, thick, arched or knitted.
    put(head, box(0.11, 0.028, 0.032), hair, [x, 0.125 - Math.max(0, tilt) * 0.03, 0.226], [0.1, 0, side * tilt]);
    // Ears with a shaded hollow.
    put(head, sph(0.06, 10, 8), skin, [side * 0.24, 0, 0], [0, 0, 0], [0.45, 1, 0.7]);
    put(head, sph(0.035, 8, 6), shade, [side * 0.255, 0, 0.01], [0, 0, 0], [0.3, 0.8, 0.5]);
  }
  // Nose: bridge, tip, nostril wings.
  put(head, box(0.045, 0.12, 0.05), skin, [0, 0.0, 0.245], [-0.2, 0, 0]);
  put(head, sph(0.04, 12, 8), skin, [0, -0.055, 0.27]);
  for (const side of [-1, 1]) put(head, sph(0.024, 8, 6), shade, [side * 0.032, -0.065, 0.255]);
  mouthFor(head, look);
  if (look.beard !== undefined) {
    const beard = phong(look.beard, { flat: true });
    put(head, sph(0.2, 16, 10), beard, [0, -0.17, 0.08], [0, 0, 0], [1.05, 0.62, 0.85]);
    for (const side of [-1, 1]) put(head, sph(0.09, 10, 8), beard, [side * 0.15, -0.09, 0.1], [0, 0, 0], [0.6, 1.1, 1]);
    for (const side of [-1, 1]) put(head, sph(0.05, 10, 8), beard, [side * 0.045, -0.085, 0.25], [0, 0, side * 0.3], [1.3, 0.55, 0.6]);
    // Tufts round the jaw so the edge isn't smooth.
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (0.1 + (k / 8) * 0.8);
      put(head, sph(0.035, 6, 4), beard, [Math.cos(a) * 0.17, -0.26 + Math.abs(Math.cos(a)) * 0.08, 0.06 + Math.sin(a) * 0.12]);
    }
  }
  if (look.moustache !== undefined) {
    const tache = phong(look.moustache, { flat: true });
    for (const side of [-1, 1]) put(head, sph(0.045, 10, 8), tache, [side * 0.035, -0.083, 0.258], [0, 0, side * 0.35], [1.25, 0.42, 0.5]);
  }
  if (look.stubble !== undefined) {
    // A shadow of the hair colour over the skin, not a beard.
    const shadow = phong(new THREE.Color(look.skin).lerp(new THREE.Color(look.stubble), 0.6).getHex(), { opacity: 0.6 });
    put(head, sph(0.205, 16, 10), shadow, [0, -0.115, 0.05], [0, 0, 0], [0.97, 0.76, 1.0]);
    for (const side of [-1, 1]) put(head, sph(0.04, 8, 6), shadow, [side * 0.04, -0.08, 0.262], [0, 0, side * 0.3], [1.3, 0.45, 0.4]);
  }
  if (look.shades) {
    const black = phong(0x0a0a0c, { shine: 140, spec: 0xaaaaaa, env: 0.5 });
    for (const side of [-1, 1]) put(head, sph(0.07, 14, 10), black, [side * 0.088, 0.035, 0.235], [0, 0, side * -0.1], [1.25, 0.72, 0.45]);
    put(head, box(0.34, 0.025, 0.03), black, [0, 0.075, 0.245]);
    for (const side of [-1, 1]) put(head, box(0.014, 0.018, 0.24), black, [side * 0.18, 0.07, 0.13]);
    // A glint across each lens.
    for (const side of [-1, 1]) put(head, box(0.05, 0.008, 0.005), lit(0xd8e8ff), [side * 0.07 + 0.02, 0.06, 0.268], [0, 0, 0.5]);
  }
  if (look.glasses !== undefined) {
    const frame = phong(look.glasses, { shine: 70, spec: 0x444444 });
    const lens = phong(0x223040, { opacity: 0.35, shine: 120, spec: 0xffffff });
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
  hairFor(head, look, hair);
  if (look.hat) {
    const hat = matte(look.hat.color);
    put(head, new THREE.SphereGeometry(0.275, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat, [0, 0.1, -0.02]);
    put(head, box(0.32, 0.03, 0.24), hat, [0, 0.11, 0.27], [0.15, 0, 0]);
    put(head, sph(0.025, 6, 4), hat, [0, 0.37, -0.02]);
    // Stitched panels and a patch on the front.
    for (let k = 0; k < 6; k++) put(head, box(0.006, 0.006, 0.25), matte(0x5a5040), [0, 0.25, -0.02], [HALF_PI * 0.55, (k / 6) * Math.PI, 0]);
    put(head, cy(0.06, 0.06, 0.01, 12), matte(0x1a1a1a), [0, 0.24, 0.235], [HALF_PI - 0.6, 0, 0]);
  }
  d.add(head);
  return head;
}

/** The mouth: lips, teeth and the dark inside, in one of four faces. */
function mouthFor(head: THREE.Group, look: Look): void {
  const lip = phong(new THREE.Color(look.skin).lerp(new THREE.Color(0xb05a50), 0.55).getHex(), { shine: 40 });
  const dark = matte(0x2a0808);
  const teeth = phong(0xfaf8f0, { shine: 90, spec: 0x666666 });
  const tongue = matte(0xc8505a);
  const m = new THREE.Group();
  m.position.set(0, -0.12, 0.21);
  head.add(m);
  switch (look.mouth ?? 'grin') {
    case 'sing':
      // Open wide on a high note: a round dark mouth, the top teeth, the tongue, lips all round.
      put(m, sph(0.06, 14, 10), dark, [0, -0.012, -0.004], [0, 0, 0], [1.0, 1.05, 0.5]);
      put(m, new THREE.SphereGeometry(0.05, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2), teeth, [0, 0.03, 0.005], [Math.PI, 0, 0], [1.05, 0.35, 0.5]);
      put(m, sph(0.035, 10, 6), tongue, [0, -0.05, 0.012], [0, 0, 0], [1.2, 0.5, 0.6]);
      put(m, tor(0.058, 0.011, Math.PI * 2, 6, 20), lip, [0, -0.012, 0.01], [0, 0, 0], [1.05, 1.15, 1]);
      break;
    case 'grit':
      // Teeth bared and set: both rows, a line between, lips drawn back.
      put(m, sph(0.07, 14, 10), dark, [0, 0, -0.005], [0, 0, 0], [1.25, 0.55, 0.5]);
      put(m, box(0.12, 0.05, 0.03), teeth, [0, 0.0, 0.012]);
      put(m, box(0.12, 0.004, 0.032), matte(0x6a5a50), [0, 0.0, 0.014]);
      for (let k = -2; k <= 2; k++) put(m, box(0.003, 0.05, 0.033), matte(0xb8b0a0), [k * 0.025, 0, 0.014]);
      put(m, tor(0.075, 0.01, Math.PI * 2, 6, 20), lip, [0, 0, 0.01], [0, 0, 0], [1.0, 0.45, 1]);
      break;
    case 'smirk':
      // A closed half-smile, up at one corner.
      m.rotation.z = 0.2;
      m.position.x = 0.015;
      put(m, new THREE.TorusGeometry(0.06, 0.012, 6, 18, Math.PI), lip, [0, 0.005, 0.005], [0.35, 0, Math.PI]);
      put(m, new THREE.TorusGeometry(0.058, 0.008, 6, 18, Math.PI), dark, [0, 0.012, 0.0], [0.35, 0, Math.PI], [1, 0.4, 1]);
      put(m, sph(0.016, 6, 4), matte(new THREE.Color(look.skin).multiplyScalar(0.8).getHex()), [0.07, 0.02, -0.005]);
      break;
    default:
      // A grin: a dark mouth, a curved row of upper teeth inside it, and lips round it.
      put(m, sph(0.065, 14, 10), dark, [0, -0.002, -0.005], [0, 0, 0], [1.2, 0.5, 0.5]);
      put(m, new THREE.SphereGeometry(0.06, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), teeth, [0, 0.016, 0.004], [Math.PI, 0, 0], [1.15, 0.42, 0.55]);
      put(m, new THREE.TorusGeometry(0.072, 0.011, 6, 18, Math.PI), lip, [0, 0, 0.005], [0.35, 0, Math.PI]);
      put(m, new THREE.TorusGeometry(0.07, 0.009, 6, 18, Math.PI), lip, [0, 0.016, 0.008], [-0.2, 0, 0], [1, 0.25, 1]);
  }
}

/** Hair, built up from clumps so it has some volume and shape. */
function hairFor(head: THREE.Group, look: Look, hair: THREE.Material): void {
  const clump = (pos: V3, size: number, stretch: V3, rot: V3 = [0, 0, 0]) => put(head, sph(size, 9, 7), hair, pos, rot, stretch);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // The scalp: a full cap of hair, or only the crown for short back and sides.
  if (look.style === 'short') put(head, new THREE.SphereGeometry(0.264, 28, 10, 0, Math.PI * 2, 0, Math.PI / 3.3), hair, [0, 0.07, -0.02], [-0.1, 0, 0], [1, 1.05, 1.05]);
  else put(head, new THREE.SphereGeometry(0.265, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), hair, [0, 0.06, -0.02], [-0.15, 0, 0], [1, 0.95, 1.05]);
  switch (look.style) {
    case 'long':
      // Long and straight-ish, down past the shoulders: a curtain behind, a lock either side of the face, parted in the middle.
      for (let k = 0; k < 18; k++) {
        const a = Math.PI * (-0.12 + (k / 17) * 1.24);
        const x = Math.cos(a) * 0.255;
        clump([x, -0.2 - (k % 3) * 0.025, -Math.sin(a) * 0.19 - 0.02], 0.08, [0.75, 2.8, 0.8], [0, 0, x * 0.35]);
      }
      // A second, longer layer at the back, past the collar.
      for (let k = 0; k < 9; k++) {
        const a = Math.PI * (0.15 + (k / 8) * 0.7);
        clump([Math.cos(a) * 0.2, -0.42, -Math.sin(a) * 0.16 - 0.04], 0.07, [0.8, 2.2, 0.8], [-0.2, 0, Math.cos(a) * 0.4]);
      }
      for (const side of [-1, 1]) clump([side * 0.2, -0.1, 0.12], 0.07, [0.7, 2.6, 0.8], [0.1, 0, side * 0.12]);
      // A centre parting and a loose fringe swept to the sides.
      put(head, box(0.012, 0.004, 0.2), matte(new THREE.Color(look.skin).multiplyScalar(0.9).getHex()), [0, 0.3, 0.06], [-0.6, 0, 0]);
      for (const x of [-0.15, -0.1, -0.05, 0.05, 0.1, 0.15]) clump([x, 0.15, 0.205 - Math.abs(x) * 0.25], 0.05, [0.9, 2, 0.5], [0.3, 0, x * 2.4]);
      break;
    case 'shaggy':
      for (let k = 0; k < 12; k++) {
        const a = Math.PI * (0.02 + (k / 11) * 0.96);
        clump([Math.cos(a) * 0.25, -0.05 - (k % 2) * 0.05, -Math.sin(a) * 0.16], 0.07, [0.8, 1.9, 0.8], [0, 0, Math.cos(a) * 0.3]);
      }
      for (let k = -2; k <= 2; k++) clump([k * 0.07, 0.16, 0.19], 0.05, [0.8, 1.4, 0.6], [0.6, 0, k * 0.25]);
      break;
    case 'short':
      // Short back and sides, a mop of tight curls on top, a few falling forward.
      for (let k = 0; k < 30; k++) {
        const a = (k * 2.399) % (Math.PI * 2);
        const r = 0.05 + ((k * 0.618) % 1) * 0.15;
        clump([Math.cos(a) * r, 0.27 + (0.2 - r) * 0.4, Math.sin(a) * r * 0.9 + 0.03], 0.048, [1, 1, 1]);
      }
      for (let k = 0; k < 5; k++) clump([-0.11 + k * 0.055, 0.235 - (k % 2) * 0.02, 0.17], 0.044, [1, 1, 0.9]);
      // Sideburns.
      for (const side of [-1, 1]) put(head, box(0.03, 0.09, 0.05), hair, [side * 0.235, 0.02, 0.07]);
      break;
    case 'mop': {
      // A big head of curls down to the neck, a few falling over the brow, the face left clear.
      for (let k = 0; k < 90; k++) {
        const a = rnd() * Math.PI * 2;
        const up = -0.24 + rnd() * 0.52;
        const front = Math.sin(a);
        if (front > 0.35 && up < 0.2) continue;
        const r = (up > 0.12 ? 0.27 - (up - 0.12) * 0.6 : 0.275) + rnd() * 0.03;
        clump([Math.cos(a) * r, up, front * r * 0.85 - 0.04], 0.058 + rnd() * 0.02, [1, 1.1, 1]);
      }
      for (const [x, y] of [[-0.15, 0.17], [-0.06, 0.2], [0.05, 0.19], [0.14, 0.15], [-0.19, 0.08], [0.2, 0.06]]) clump([x, y, 0.19], 0.065, [1, 1.3, 0.8]);
      break;
    }
    case 'mullet':
    case 'tousled': {
      // Jaw-length waves pushed up and back off the forehead, full at the sides, every lock at its own angle.
      seed = 11;
      const tip = look.tips !== undefined ? phong(look.tips, { flat: true, shine: 40, spec: 0x333333 }) : hair;
      for (let k = 0; k < 26; k++) {
        const a = Math.PI * (-0.18 + (k / 25) * 1.36);
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
      // A mullet: curly and longer at the back, flicking out at the nape.
      if (look.style === 'mullet') {
        for (let k = 0; k < 11; k++) {
          const a = Math.PI * (0.1 + (k / 10) * 0.8);
          clump([Math.cos(a) * 0.25, -0.2 - (k % 2) * 0.03, -Math.sin(a) * 0.2 - 0.03], 0.07, [0.85, 1.8, 0.85], [-0.35, 0, Math.cos(a) * 0.9]);
        }
        for (let k = 0; k < 14; k++) {
          const a = Math.PI * (0.12 + rnd() * 0.76);
          clump([Math.cos(a) * 0.23, -0.3 - rnd() * 0.08, -Math.sin(a) * 0.2 - 0.05], 0.05, [1, 1, 1]);
        }
      }
      break;
    }
    case 'wavy':
      // Ear-length waves swept back off a high forehead, a side parting.
      for (let k = 0; k < 18; k++) {
        const a = Math.PI * (-0.15 + (k / 17) * 1.3);
        clump([Math.cos(a) * 0.265, -0.02 + (k % 2) * 0.05, -Math.sin(a) * 0.2 - 0.03], 0.08, [0.9, 1.5, 0.9], [0, 0, Math.cos(a) * 0.3]);
      }
      for (let k = 0; k < 5; k++) clump([-0.12 + k * 0.06, 0.25, 0.08], 0.075, [0.8, 0.8, 1.9], [-0.3, 0, (k - 2) * 0.12]);
      clump([0.1, 0.2, 0.18], 0.07, [1.6, 0.7, 1.0], [-0.4, 0, -0.4]);
      break;
  }
}

/** A hand closed round a grip: palm, four curled fingers with knuckles, a thumb, the sleeve's cuff behind. */
function hand(parent: THREE.Object3D, at: V3, skin: THREE.Material, cuff: THREE.Material, knuckle: THREE.Material): void {
  const h = new THREE.Group();
  h.position.set(...at);
  put(h, sph(0.065, 12, 8), skin, [0, 0, 0], [0, 0, 0], [1, 0.8, 1.1]);
  for (let k = 0; k < 4; k++) {
    put(h, cy(0.02, 0.018, 0.08, 6), skin, [-0.045 + k * 0.03, 0.035, 0.05], [1.2, 0, 0]);
    put(h, sph(0.012, 5, 4), knuckle, [-0.045 + k * 0.03, 0.06, 0.03]);
  }
  put(h, cy(0.022, 0.02, 0.07, 6), skin, [0.06, 0.02, 0.02], [0.6, 0, -0.8]);
  put(h, cy(0.06, 0.06, 0.06, 12), cuff, [0, -0.02, -0.08], [HALF_PI, 0, 0]);
  parent.add(h);
}

/** Coverall sleeves from a musician's shoulders (torso at `d`) to two grips, cuffs in the trim colour (or rolled, forearms bare), hands bare. */
function musicianArms(d: THREE.Group, look: Look, grips: V3[]): void {
  const skin = skinMat(look);
  const sleeve = matte(look.shirt);
  const cuff = matte(look.trim ?? look.shirt);
  const knuckle = matte(new THREE.Color(look.skin).multiplyScalar(0.9).getHex());
  grips.forEach((g, k) => {
    const side = k ? 1 : -1;
    const shoulder: V3 = [side * 0.29, 0.56, 0.0];
    const elbow: V3 = [(shoulder[0] + g[0]) / 2 + side * 0.09, Math.min(shoulder[1], g[1]) - 0.08, (shoulder[2] + g[2]) / 2];
    rod(d, shoulder, elbow, 0.085, sleeve, 0.075);
    put(d, sph(0.078, 10, 8), look.rolled ? cuff : sleeve, elbow, [0, 0, 0], look.rolled ? [1.05, 0.9, 1.05] : [1, 1, 1]);
    rod(d, elbow, g, 0.072, look.rolled ? skin : sleeve, look.rolled ? 0.055 : 0.065);
    // A patch on the left sleeve: a ring in the trim colour.
    if (side < 0) put(d, cy(0.045, 0.045, 0.01, 12), cuff, [shoulder[0] - 0.08, shoulder[1] - 0.08, shoulder[2] + 0.01], [0, 0, HALF_PI]);
    hand(d, g, skin, look.rolled ? skin : cuff, knuckle);
  });
}

/** Legs astride: coverall thighs and shins from the hips to boots planted at `feet`. */
function legs(d: THREE.Group, look: Look, knees: V3, feet: V3): void {
  const cloth = matte(look.shirt);
  const boot = phong(0x3a2414, { shine: 50, spec: 0x332211 });
  for (const side of [-1, 1]) {
    const hip: V3 = [side * 0.14, 0.06, 0.04];
    const knee: V3 = [side * knees[0], knees[1], knees[2]];
    const ankle: V3 = [side * feet[0], feet[1] + 0.08, feet[2]];
    rod(d, hip, knee, 0.1, cloth, 0.085);
    put(d, sph(0.088, 10, 8), cloth, knee);
    rod(d, knee, ankle, 0.08, cloth, 0.07);
    put(d, box(0.13, 0.11, 0.24), boot, [side * feet[0], feet[1], feet[2] + 0.05]);
    put(d, box(0.14, 0.03, 0.26), matte(0x161616), [side * feet[0], feet[1] - 0.06, feet[2] + 0.05]);
  }
}

/** Bolts in a row: a dark hex head each. */
function bolts(parent: THREE.Object3D, at: V3[], r = 0.018, axis: 'x' | 'y' | 'z' = 'y'): void {
  const rot: V3 = axis === 'x' ? [0, 0, HALF_PI] : axis === 'z' ? [HALF_PI, 0, 0] : [0, 0, 0];
  for (const p of at) put(parent, cy(r, r, 0.014, 6), phong(0x50545c, { shine: 60, spec: 0x888888 }), p, rot);
}

/** Text painted in a decal: centred lines in one font. */
function lettering(g: CanvasRenderingContext2D, lines: [string, number, number, string][], font: string): void {
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const [text, x, y, color] of lines) {
    g.font = font;
    g.fillStyle = color;
    g.fillText(text, x, y);
  }
}

// ---- Stu: the Flying Microtonal Banana ----------------------------------------------

// Stu Mackenzie: frontman, guitar and flute, riding the Flying Microtonal Banana: a giant banana
// that is also a guitar, its neck fretted in quarter tones, a flute slung on his back, two leaves for wings.
export function stuMackenzie(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const chrome = steel();
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.95, -1.75),
    new THREE.Vector3(0, 0.52, -1.0),
    new THREE.Vector3(0, 0.42, 0),
    new THREE.Vector3(0, 0.52, 1.0),
    new THREE.Vector3(0, 0.98, 1.72),
  ]);
  const radiusAt = (u: number) => 0.08 + 0.5 * Math.pow(Math.sin(Math.PI * u), 0.55);
  // The banana: a five-ridged tube along a curve that rises at both ends, fat in the middle, tapering to the tips.
  const rings = 48;
  const peel = new THREE.TubeGeometry(path, rings, 1, 5, false);
  const pos = peel.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const u = Math.floor(i / 6) / rings;
    const c = path.getPointAt(u);
    v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(radiusAt(u)).add(c);
    v.x *= 1.1;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  peel.computeVertexNormals();
  put(body, peel, phong(r.color, { flat: true, shine: 60, spec: 0x666666, env: 0.25 }), [0, 0, 0]);
  /** A point on the peel's surface at u along it, `a` round from the side (0) to the top (pi/2), `out` of the radius. */
  const onPeel = (u: number, a: number, side: number, out = 0.9): V3 => {
    const c = path.getPointAt(u);
    const t = path.getTangentAt(u);
    const rad = radiusAt(u) * out;
    return [side * Math.cos(a) * rad * 1.1, c.y + Math.sin(a) * rad * t.z, c.z - Math.sin(a) * rad * t.y];
  };
  // Ripening: brown sugar spots in clusters down both flanks, a green flush at the stalk, the dark tips.
  const spot = matte(0x6a4a1a);
  let s = 3;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 40; k++) {
    const u = 0.12 + rnd() * 0.76;
    const side = k % 2 ? 1 : -1;
    put(body, sph(0.022 + rnd() * 0.025, 6, 4), spot, onPeel(u, -0.5 + rnd() * 1.2, side, 0.86), [0, 0, 0], [1, 1, 0.6]);
  }
  put(body, sph(0.09, 8, 6), matte(0x2a1a0a), path.getPointAt(0).toArray() as V3);
  for (let k = 0; k < 5; k++) {
    const u = 0.94 + k * 0.012;
    const c = path.getPointAt(u);
    put(body, sph(radiusAt(u) * 1.02, 10, 6), phong(0x8ab83a, { flat: true }), c.toArray() as V3, [0, 0, 0], [1.1, 0.4, 0.6]);
  }
  // A dark seam down each ridge.
  for (const side of [-1, 1]) cable(body, [0.15, 0.3, 0.5, 0.7, 0.85].map((u) => onPeel(u, 0.95, side, 0.97)), 0.008, matte(0x8a6a1a), 24, 3);
  // The stalk at the front is the headstock: a plate, three tuners a side with pearl buttons, a nut at the top of the neck.
  const tip = path.getPointAt(1);
  put(body, cy(0.07, 0.09, 0.42, 8), matte(0x5a4a1a), [0, tip.y + 0.12, tip.z + 0.1], [-0.6, 0, 0]);
  const headstock = new THREE.Group();
  headstock.position.set(0, tip.y + 0.22, tip.z + 0.2);
  headstock.rotation.x = -0.6;
  body.add(headstock);
  put(headstock, box(0.24, 0.05, 0.36), matte(0x3a2214), [0, 0, 0]);
  for (const side of [-1, 1])
    for (let k = 0; k < 3; k++) {
      put(headstock, cy(0.018, 0.018, 0.14, 6), chrome, [side * 0.16, 0, -0.1 + k * 0.1], [0, 0, HALF_PI]);
      put(headstock, sph(0.035, 8, 6), phong(0xf4ecd8, { shine: 80 }), [side * 0.24, 0, -0.1 + k * 0.1], [0, 0, 0], [0.5, 1, 1]);
      put(headstock, cy(0.012, 0.012, 0.06, 6), chrome, [side * 0.07, 0.04, -0.1 + k * 0.1]);
    }
  // The fretboard down the top of the front half: frets in quarter tones (every other one a short fret between the normal ones), pearl dots.
  const neckTop = (u: number) => path.getPointAt(u).y + radiusAt(u) * 0.95;
  const pitch = (u: number) => {
    const t = path.getTangentAt(u);
    return -Math.atan2(t.y, t.z);
  };
  for (let k = 0; k < 16; k++) {
    const u = 0.58 + k * 0.022;
    const c = path.getPointAt(u);
    const top = neckTop(u);
    put(body, box(0.26, 0.04, 0.075), matte(0x3a2214), [0, top, c.z], [pitch(u), 0, 0]);
    put(body, box(k % 2 ? 0.13 : 0.26, 0.014, 0.012), chrome, [0, top + 0.026, c.z + 0.03], [pitch(u), 0, 0]);
    if (k === 2 || k === 6 || k === 10) put(body, cy(0.018, 0.018, 0.01, 8), phong(0xf4ecd8, { shine: 80 }), [0, top + 0.024, c.z], [pitch(u), 0, 0]);
  }
  {
    const u = 0.93;
    const c = path.getPointAt(u);
    put(body, box(0.27, 0.04, 0.02), phong(0xf4ecd8, { shine: 80 }), [0, neckTop(u) + 0.03, c.z], [pitch(u), 0, 0]);
  }
  // Strings from the tailpiece behind the pickups to the headstock.
  const strings = new THREE.CatmullRomCurve3([0.48, 0.6, 0.7, 0.8, 0.93].map((u) => new THREE.Vector3(0, neckTop(u) + 0.04, path.getPointAt(u).z)));
  for (let k = 0; k < 6; k++) put(body, new THREE.TubeGeometry(strings, 24, 0.005, 3, false), chrome, [-0.075 + k * 0.03, 0, 0]);
  // A pickguard in the accent colour; two humbuckers with pole pieces; a bridge and tailpiece; three knobs and a switch; the jack, its lead coiled away.
  put(body, cy(0.3, 0.3, 0.03, 20), phong(r.accent, { shine: 70, spec: 0x666666 }), [0.12, 0.98, 0.3], [0.05, 0, 0], [1, 1, 1.5]);
  put(body, tor(0.3, 0.012, Math.PI * 2, 4, 28), phong(0xf4ecd8, { shine: 60 }), [0.12, 0.995, 0.3], [HALF_PI + 0.05, 0, 0], [1, 1.5, 1]);
  for (let k = 0; k < 2; k++) {
    const z = 0.18 + k * 0.22;
    put(body, box(0.26, 0.05, 0.11), matte(0x111111), [0, 1.0, z]);
    put(body, box(0.28, 0.02, 0.13), phong(0xf4ecd8, { shine: 60 }), [0, 0.985, z]);
    for (let p = 0; p < 6; p++) for (const dz of [-0.025, 0.025]) put(body, cy(0.009, 0.009, 0.012, 6), chrome, [-0.09 + p * 0.036, 1.028, z + dz]);
  }
  put(body, box(0.3, 0.05, 0.06), chrome, [0, 1.02, 0.02]);
  put(body, box(0.24, 0.04, 0.05), chrome, [0, 1.0, -0.08]);
  for (let k = 0; k < 3; k++) put(body, cy(0.032, 0.036, 0.04, 12), brassy(), [0.3, 1.02, 0.1 + k * 0.1]);
  rod(body, [0.38, 1.0, 0.45], [0.42, 1.08, 0.45], 0.008, chrome);
  put(body, sph(0.015, 6, 4), phong(0xf4ecd8), [0.42, 1.09, 0.45]);
  put(body, cy(0.03, 0.03, 0.05, 8), chrome, [0.55, 0.72, 0.1], [0, 0, HALF_PI]);
  coil(body, [0.58, 0.72, 0.1], [0.5, 0.55, -1.0], 0.04, 9, matte(0x161616));
  headlights(body, 0.32, 0.62, 1.22, 0.07);
  // Tail lights in the black tip, and a pair of exhausts.
  for (const side of [-1, 1]) put(body, sph(0.05, 8, 6), lit(0xff3020), [side * 0.18, 0.66, -1.38], [0, 0, 0], [1, 0.6, 0.4]);

  // Two leaves for wings, a V up off the tail, flapping (the kart view beats them about z).
  const flappers: THREE.Object3D[] = [];
  const leaf = phong(0x4a9a32, { shine: 30, flat: true });
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.12, 0.98, -1.15);
    wing.userData.side = side;
    const blade = new THREE.Group();
    blade.rotation.set(0, side * 0.35, side * 0.75);
    wing.add(blade);
    put(blade, sph(0.26, 12, 6), leaf, [side * 0.26, 0, 0], [0, 0, 0], [1.0, 0.06, 0.4]);
    put(blade, box(0.5, 0.025, 0.02), matte(0x2a6a1a), [side * 0.26, 0.015, 0]);
    for (let k = 0; k < 4; k++) for (const f of [-1, 1]) put(blade, box(0.012, 0.02, 0.1), matte(0x2a6a1a), [side * (0.1 + k * 0.1), 0.015, f * 0.045], [0, side * f * -0.6, 0]);
    bake(blade);
    body.add(wing);
    flappers.push(wing);
  }

  const look: Look = { skin: 0xf2caa8, hair: 0x6a4626, tips: 0x9a7244, style: 'tousled', shirt: 0x2a5a8a, trim: 0xffd23a, name: 'Stu', iris: 0x5a86a8, faceWidth: 0.92, stubble: 0x5a3a20, moustache: 0x6a4626, mouth: 'sing', brow: -0.25, tee: 0x7a2a8a };
  const d = new THREE.Group();
  // Astride the banana, behind the pickups, on a saddle, boots on the peel.
  d.position.set(0, 0.8, -0.35);
  put(body, sph(0.3, 12, 8), phong(0x4a2a14, { shine: 40 }), [0, 0.86, -0.42], [0, 0, 0], [1, 0.3, 1.2]);
  const head = musician(d, look);
  legs(d, look, [0.42, 0.0, 0.3], [0.62, -0.25, 0.4]);
  // Chopper bars on a riser, grips black, a mirror.
  rod(d, [0, 0.1, 0.62], [0, 0.42, 0.66], 0.03, chrome);
  cable(d, [[-0.34, 0.5, 0.56], [-0.18, 0.43, 0.66], [0, 0.42, 0.67], [0.18, 0.43, 0.66], [0.34, 0.5, 0.56]], 0.022, chrome, 12, 6);
  const grips: V3[] = [[-0.3, 0.49, 0.56], [0.3, 0.49, 0.56]];
  for (const g of grips) put(d, cy(0.032, 0.032, 0.12, 8), rubber(), g, [0, 0, HALF_PI]);
  rod(d, [0.3, 0.5, 0.6], [0.38, 0.72, 0.66], 0.01, chrome);
  put(d, cy(0.06, 0.06, 0.015, 12), chrome, [0.38, 0.74, 0.66], [HALF_PI, 0, 0]);
  musicianArms(d, look, grips);
  // The flute slung across his back on a strap: a silver tube, the lip plate, the keys with their pads, the crown.
  const flute = new THREE.Group();
  flute.position.set(0, 0.42, -0.33);
  flute.rotation.z = 1.05;
  d.add(flute);
  put(flute, cy(0.03, 0.03, 1.2, 12), chrome, [0, 0, 0]);
  put(flute, cy(0.034, 0.034, 0.04, 12), chrome, [0, 0.62, 0]);
  put(flute, sph(0.034, 8, 6), chrome, [0, 0.64, 0]);
  put(flute, box(0.05, 0.07, 0.016), chrome, [0, 0.42, -0.03]);
  put(flute, cy(0.008, 0.008, 0.02, 6), matte(0x111111), [0, 0.42, -0.04], [HALF_PI, 0, 0]);
  for (let k = 0; k < 9; k++) {
    const y = 0.2 - k * 0.075;
    put(flute, cy(0.022, 0.022, 0.012, 10), chrome, [0, y, -0.034], [HALF_PI, 0, 0]);
    put(flute, cy(0.016, 0.016, 0.006, 10), matte(0xe8dcc0), [0, y, -0.042], [HALF_PI, 0, 0]);
  }
  rod(flute, [0, 0.24, -0.045], [0, -0.45, -0.045], 0.005, chrome);
  for (const y of [-0.58, 0.3]) put(flute, tor(0.034, 0.008, Math.PI * 2, 4, 12), chrome, [0, y, 0], [HALF_PI, 0, 0]);
  cable(d, [[-0.22, 0.6, 0.18], [-0.05, 0.42, 0.28], [0.15, 0.2, 0.3], [0.28, 0.06, 0.12]], 0.022, matte(r.accent), 10, 4);
  body.add(d);
  bake(head);
  bake(body, [head, ...flappers]);
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
    flappers,
  };
}

// ---- Amby: the chrome harmonica ----------------------------------------------------

/** Boogieman Sam, the hood ornament: a little dancer in a black suit and top hat, shades and a grin, twisting on a chrome stand. */
function boogiemanSam(): THREE.Group {
  const g = new THREE.Group();
  const suit = phong(0x141418, { shine: 60, spec: 0x444444 });
  const skin = matte(0x6a4630);
  const white = phong(0xf8f4ec, { shine: 40 });
  put(g, cy(0.12, 0.14, 0.04, 16), steel(), [0, 0.02, 0]);
  put(g, cy(0.02, 0.02, 0.06, 8), steel(), [0, 0.07, 0]);
  // Legs: one planted, one kicked out to the side; two-tone shoes.
  rod(g, [-0.03, 0.1, 0], [-0.04, 0.24, 0], 0.025, suit);
  rod(g, [0.03, 0.24, 0], [0.11, 0.14, 0.02], 0.025, suit);
  put(g, box(0.05, 0.03, 0.08), white, [-0.04, 0.1, 0.02]);
  put(g, box(0.05, 0.03, 0.08), white, [0.12, 0.13, 0.04], [0, 0, -0.6]);
  // A jacket, a white shirt front, a red bow tie.
  put(g, cy(0.055, 0.045, 0.14, 10), suit, [0, 0.31, 0]);
  put(g, box(0.04, 0.09, 0.02), white, [0, 0.33, 0.045]);
  put(g, box(0.04, 0.015, 0.01), lit(0xe8302a), [0, 0.37, 0.057]);
  // Arms flung up and out, white gloves.
  rod(g, [-0.05, 0.36, 0], [-0.15, 0.46, 0.02], 0.018, suit);
  rod(g, [0.05, 0.36, 0], [0.14, 0.3, 0.04], 0.018, suit);
  put(g, sph(0.025, 8, 6), white, [-0.16, 0.48, 0.02]);
  put(g, sph(0.025, 8, 6), white, [0.15, 0.29, 0.05]);
  // Head, shades, a grin, a top hat with a red band.
  put(g, sph(0.055, 12, 10), skin, [0, 0.44, 0]);
  put(g, box(0.09, 0.022, 0.02), phong(0x050505, { shine: 120 }), [0, 0.45, 0.048]);
  put(g, box(0.05, 0.01, 0.01), white, [0, 0.415, 0.05]);
  put(g, cy(0.075, 0.075, 0.01, 14), suit, [0, 0.49, 0]);
  put(g, cy(0.045, 0.05, 0.1, 12), suit, [0, 0.54, 0]);
  put(g, cy(0.051, 0.051, 0.02, 12), lit(0xe8302a), [0, 0.51, 0]);
  bake(g);
  return g;
}

// Ambrose Kenny-Smith: harmonica and keys, in a racer that is one long chrome harmonica, Boogieman Sam dancing on the nose.
export function ambroseKennySmith(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const plate = steel();
  const comb = gloss(r.color);
  const dark = matte(0x0a0a0a);
  // The comb (coloured) between two chrome cover plates, the holes along both flanks, each with a chrome lip.
  put(body, box(1.0, 0.36, 2.7), comb, [0, 0.5, 0]);
  for (const y of [0.31, 0.69]) put(body, box(1.08, 0.06, 2.8), plate, [0, y, 0]);
  for (const side of [-1, 1])
    for (let k = 0; k < 10; k++) {
      put(body, box(0.02, 0.16, 0.16), dark, [side * 0.51, 0.5, -1.15 + k * 0.255]);
      put(body, box(0.012, 0.03, 0.2), plate, [side * 0.515, 0.6, -1.15 + k * 0.255]);
      put(body, box(0.012, 0.03, 0.2), plate, [side * 0.515, 0.4, -1.15 + k * 0.255]);
    }
  // The hole numbers stamped on the top plate's edge, and the plates' engraving on top: the name in script and a scroll.
  const numbers = decalMat('amby-numbers', (g, w, h) => {
    lettering(g, Array.from({ length: 10 }, (_, k) => [`${k + 1}`, ((k + 0.5) / 10) * w, h / 2, '#2a2a30'] as [string, number, number, string]), 'bold 40px sans-serif');
  }, 256, 64);
  for (const side of [-1, 1]) put(body, new THREE.PlaneGeometry(2.55, 0.06), numbers, [side * 0.541, 0.69, 0], [0, side * HALF_PI, 0], [side, 1, 1]);
  const engraving = decalMat('amby-engraving', (g, w, h) => {
    g.strokeStyle = 'rgba(30,30,40,0.7)';
    g.lineWidth = 3;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.strokeRect(14, 14, w - 28, h - 28);
    for (let k = 0; k < 2; k++) {
      g.beginPath();
      for (let x = 24; x < w - 24; x += 4) g.lineTo(x, (k ? h - 26 : 26) + Math.sin(x * 0.12) * 4);
      g.stroke();
    }
    lettering(g, [['Boogieman Sam', w / 2, h / 2 - 4, 'rgba(30,30,40,0.85)']], 'italic bold 30px Georgia, serif');
    lettering(g, [['BLUES HARP  ·  KEY OF A', w / 2, h / 2 + 24, 'rgba(30,30,40,0.7)']], 'bold 11px sans-serif');
  }, 256, 128);
  put(body, new THREE.PlaneGeometry(1.9, 0.9), engraving, [0, 0.722, -0.35], [-HALF_PI, 0, HALF_PI]);
  // Screws through the plates; a rear end with the plates' vents.
  for (const y of [0.722, 0.278]) bolts(body, [-1.25, -0.4, 0.4, 1.25].flatMap((z) => [[-0.44, y, z], [0.44, y, z]] as V3[]), 0.022);
  for (const z of [1.4, -1.4]) put(body, cy(0.2, 0.2, 1.08, 16), plate, [0, 0.5, z], [0, 0, HALF_PI], [1, 1, 0.6]);
  for (let k = 0; k < 5; k++) put(body, box(0.6, 0.02, 0.02), dark, [0, 0.38 + k * 0.06, -1.52]);
  // A keyboard on the dash, two octaves of keys, a pitch bend lever beside it.
  const keys = new THREE.Group();
  keys.position.set(0, 0.74, 0.75);
  for (let k = 0; k < 10; k++) put(keys, box(0.075, 0.04, 0.3), phong(0xf4f0e4, { shine: 60 }), [-0.36 + k * 0.08, 0, 0]);
  for (let k = 0; k < 9; k++) if (k % 7 !== 2 && k % 7 !== 6) put(keys, box(0.045, 0.05, 0.18), matte(0x111111), [-0.32 + k * 0.08, 0.03, -0.06]);
  put(keys, box(0.86, 0.06, 0.08), matte(0x1a1a1a), [0, 0.01, -0.18]);
  for (let k = 0; k < 4; k++) put(keys, cy(0.022, 0.022, 0.03, 8), phong(0xf4f0e4), [-0.3 + k * 0.08, 0.05, -0.18]);
  put(keys, sph(0.014, 6, 4), lit(0xff3020), [0.32, 0.05, -0.18]);
  body.add(keys);
  headlights(body, 0.35, 0.5, 1.55, 0.08);
  for (const side of [-1, 1]) put(body, box(0.14, 0.06, 0.02), lit(0xff2a1a), [side * 0.35, 0.5, -1.62]);
  // A tuck-and-roll seat back behind him.
  for (let k = 0; k < 4; k++) put(body, cy(0.05, 0.05, 0.5, 10), phong(0xf4ecd8, { shine: 30 }), [-0.15 + k * 0.1, 1.0, -0.75], [0.15, 0, 0]);
  put(body, box(0.5, 0.06, 0.12), phong(0xf4ecd8, { shine: 30 }), [0, 1.27, -0.79]);
  // Boogieman Sam, twisting (the kart view sweeps him about y).
  const sam = boogiemanSam();
  sam.position.set(0, 0.72, 1.18);
  sam.scale.setScalar(1.15);
  sam.userData.phase = 0;
  body.add(sam);

  const look: Look = { skin: 0xf0c4a4, hair: 0x1e1410, style: 'mullet', shirt: r.accent, trim: 0xffffff, name: 'Amby', moustache: 0x1e1410, faceWidth: 0.94, iris: 0x3a2a1a, mouth: 'sing', brow: -0.3, tee: 0x2a8ad8 };
  const d = new THREE.Group();
  d.position.set(0, 0.7, -0.35);
  const head = musician(d, look);
  // One hand on the keys, the other raising a harmonica to the sky.
  musicianArms(d, look, [[-0.25, 0.1, 1.05], [0.5, 1.3, 0.3]]);
  const harp = new THREE.Group();
  harp.position.set(0.5, 1.4, 0.32);
  harp.rotation.z = 0.15;
  put(harp, box(0.4, 0.05, 0.11), comb, [0, 0, 0]);
  for (const y of [-0.035, 0.035]) put(harp, box(0.42, 0.025, 0.12), plate, [0, y, 0]);
  for (let k = 0; k < 10; k++) put(harp, box(0.022, 0.03, 0.01), dark, [-0.18 + k * 0.04, 0, 0.056]);
  for (const x of [-0.21, 0.21]) put(harp, cy(0.045, 0.045, 0.12, 10), plate, [x, 0, 0], [HALF_PI, 0, 0], [0.6, 1, 1]);
  d.add(harp);
  // A sparkle off the harmonica.
  glowSprite(d, [0.55, 1.5, 0.4], 0.35, 0xfff0c0);
  body.add(d);
  bake(head);
  bake(body, [head, sam]);
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
    sweepers: [sam],
  };
}

// ---- Cookie: keytar, guitar and keyboard in one deck ---------------------------------

// Cook Craig: guitar and synth, riding a hybrid of the two: an angular keytar body with a keyboard
// down the deck, synth knobs, a screen and a pitch wheel, strings running over the keys to a fretted
// neck out front, and a Gamma Knife on the neck: a blade with an edge glowing gamma green.
export function cookCraig(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const finish = phong(r.color, { shine: 110, spec: 0x666666, env: 0.25 });
  const chrome = steel();
  const cream = phong(0xf4ecd8, { shine: 60 });
  // The wedge body: two angled slabs meeting at the tail, a pointed horn either side, cream binding round the top edges.
  put(body, box(1.3, 0.3, 2.1), finish, [0, 0.48, -0.15]);
  for (const side of [-1, 1]) {
    put(body, box(0.5, 0.3, 1.1), finish, [side * 0.72, 0.48, 0.25], [0, side * 0.45, 0]);
    for (const e of [-1, 1]) put(body, box(0.025, 0.025, 1.12), cream, [side * 0.72 + e * 0.24 * Math.cos(0.45), 0.64, 0.25 - side * e * 0.24 * Math.sin(0.45)], [0, side * 0.45, 0]);
    put(body, new THREE.ConeGeometry(0.12, 0.5, 4), finish, [side * 0.72, 0.62, 0.95], [HALF_PI - 0.3, 0, 0]);
    put(body, box(0.025, 0.025, 2.1), cream, [side * 0.66, 0.64, -0.15]);
  }
  put(body, box(1.32, 0.025, 0.025), cream, [0, 0.64, -1.2]);
  // A keyboard down the middle of the deck, two octaves.
  const keys = new THREE.Group();
  keys.position.set(0, 0.645, -0.05);
  for (let k = 0; k < 14; k++) put(keys, box(0.072, 0.035, 0.36), phong(0xf4f0e4, { shine: 60 }), [-0.49 + k * 0.077, 0, 0]);
  for (let k = 0; k < 13; k++) if (k % 7 !== 2 && k % 7 !== 6) put(keys, box(0.045, 0.04, 0.22), matte(0x111111), [-0.45 + k * 0.077, 0.025, -0.07]);
  put(keys, box(1.12, 0.05, 0.03), matte(0x1a1a1a), [0, 0.0, -0.195]);
  body.add(keys);
  // Two single-coil pickups and a bridge between the keys and the neck, with pole pieces.
  for (const z of [0.42, 0.6]) {
    put(body, box(0.34, 0.03, 0.09), cream, [0, 0.64, z]);
    for (let p = 0; p < 6; p++) put(body, cy(0.009, 0.009, 0.01, 6), chrome, [-0.12 + p * 0.048, 0.66, z]);
  }
  put(body, box(0.34, 0.04, 0.05), chrome, [0, 0.66, 0.25]);
  // Strings running the length of it, over the keys and up the neck.
  for (let k = 0; k < 6; k++) put(body, box(0.005, 0.005, 2.0), chrome, [-0.12 + k * 0.048, 0.69, 1.05]);
  for (let k = 0; k < 6; k++) put(body, box(0.004, 0.004, 1.0), chrome, [-0.12 + k * 0.048, 0.69, -0.25]);
  // Synth controls: a row of knobs with pointer lines, LEDs, a pitch wheel and a mod wheel, a screen with a wave on it.
  for (let k = 0; k < 6; k++) {
    put(body, cy(0.045, 0.05, 0.05, 12), matte([0xffffff, 0xff5a3a, 0x3adcff][k % 3]), [-0.4 + k * 0.16, 0.66, -0.48]);
    put(body, box(0.008, 0.01, 0.04), matte(0x111111), [-0.4 + k * 0.16, 0.69, -0.47], [0, k * 0.7, 0]);
    put(body, sph(0.018, 6, 4), lit(k % 2 ? 0x7aff7a : 0xff3a3a), [-0.4 + k * 0.16, 0.65, -0.62]);
  }
  for (const x of [-0.58, -0.48]) {
    put(body, cy(0.07, 0.07, 0.035, 16), matte(0x2a2a2a), [x, 0.64, 0.25], [0, 0, HALF_PI]);
    for (let k = 0; k < 6; k++) put(body, box(0.038, 0.012, 0.012), matte(0x4a4a4a), [x, 0.64 + Math.cos(k) * 0.07, 0.25 + Math.sin(k) * 0.07]);
  }
  const screen = decalMat('cookie-screen', (g, w, h) => {
    g.fillStyle = '#0a2a12';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#7aff8a';
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x < w; x += 2) g.lineTo(x, h * 0.45 + Math.sin(x * 0.09) * h * 0.22 * Math.sin(x * 0.013));
    g.stroke();
    lettering(g, [['γ KNIFE', w / 2, h - 12, '#c8ffc8']], 'bold 16px monospace');
  }, 128, 64, true);
  put(body, box(0.46, 0.2, 0.04), matte(0x1a1a1a), [0, 0.72, 0.8], [0.5, 0, 0]);
  put(body, new THREE.PlaneGeometry(0.4, 0.15), screen, [0, 0.73, 0.781], [0.5, Math.PI, 0]);
  // The neck: frets, inlays, a headstock with six tuners up front.
  put(body, box(0.26, 0.08, 1.1), phong(0x3a2210, { shine: 50 }), [0, 0.6, 1.4]);
  for (let k = 0; k < 10; k++) put(body, box(0.27, 0.012, 0.015), chrome, [0, 0.645, 0.9 + k * 0.1]);
  for (const z of [1.05, 1.25, 1.45, 1.75]) put(body, sph(0.018, 6, 4), cream, [0, 0.645, z]);
  put(body, box(0.27, 0.03, 0.02), cream, [0, 0.66, 1.94]);
  put(body, box(0.36, 0.08, 0.32), finish, [0, 0.6, 2.05], [-0.15, 0, 0.2]);
  for (const side of [-1, 1])
    for (let k = 0; k < 3; k++) {
      put(body, cy(0.02, 0.02, 0.1, 6), chrome, [side * 0.22, 0.62, 1.95 + k * 0.08], [0, 0, HALF_PI]);
      put(body, sph(0.03, 8, 6), cream, [side * 0.28, 0.62, 1.95 + k * 0.08], [0, 0, 0], [0.5, 1, 1]);
    }
  // The Gamma Knife: a long blade bolted along the neck's right side, point forward, a bolster and a
  // riveted handle back at the body, the edge glowing green and a trefoil on the flat.
  const knife = new THREE.Group();
  knife.position.set(0.24, 0.68, 1.0);
  body.add(knife);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(1.1, 0);
  shape.quadraticCurveTo(1.25, 0.02, 1.3, 0.12);
  shape.quadraticCurveTo(0.9, 0.2, 0, 0.18);
  shape.lineTo(0, 0);
  const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 6 });
  put(knife, blade, chrome, [0, 0, 0], [0, -HALF_PI, 0]);
  put(knife, box(0.008, 0.02, 1.15), lit(0x7aff5a), [0.01, 0.005, 0.6]);
  put(knife, box(0.008, 0.012, 0.5), lit(0x7aff5a), [0.01, 0.06, 1.05], [0.45, 0, 0]);
  const trefoil = decalMat('gamma-trefoil', (g, w, h) => {
    g.fillStyle = '#ffe14d';
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.48, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    for (let k = 0; k < 3; k++) {
      const a = -HALF_PI + (k * Math.PI * 2) / 3;
      g.beginPath();
      g.moveTo(w / 2, h / 2);
      g.arc(w / 2, h / 2, w * 0.4, a - 0.5, a + 0.5);
      g.fill();
    }
    g.fillStyle = '#ffe14d';
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.08, 0, Math.PI * 2);
    g.fill();
  }, 64, 64);
  put(knife, new THREE.PlaneGeometry(0.13, 0.13), trefoil, [0.014, 0.09, 0.45], [0, HALF_PI, 0]);
  put(knife, box(0.06, 0.24, 0.05), brassy(), [0.01, 0.09, -0.02]);
  put(knife, box(0.05, 0.14, 0.32), matte(0x2a1a10), [0.01, 0.08, -0.2]);
  bolts(knife, [[0.04, 0.08, -0.12], [0.04, 0.08, -0.28]], 0.016, 'x');
  glowSprite(knife, [0.0, 0.08, 1.2], 0.45, 0x7aff5a);
  // A strap button and a coiled cable off the tail; tail lights.
  for (let k = 0; k < 6; k++) put(body, tor(0.08, 0.016, Math.PI * 2, 5, 14), matte(0x111111), [0.5, 0.45, -1.25 - k * 0.06]);
  put(body, cy(0.05, 0.05, 0.04, 10), chrome, [0.5, 0.48, -1.22], [HALF_PI, 0, 0]);
  for (const side of [-1, 1]) put(body, box(0.22, 0.07, 0.02), lit(0xff2a1a), [side * 0.42, 0.5, -1.21]);
  const tail = decalMat('cookie-tail', (g, w, h) => {
    g.fillStyle = '#f4ecd8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1e1e22';
    g.fillRect(6, 6, w - 12, h - 12);
    lettering(g, [['GAMMA KNIFE', w / 2, h / 2 + 2, '#7aff5a']], 'italic 900 30px "Arial Black", sans-serif');
  }, 256, 64);
  put(body, new THREE.PlaneGeometry(0.5, 0.125), tail, [0, 0.47, -1.207], [0, Math.PI, 0]);
  headlights(body, 0.55, 0.45, 0.95, 0.07, 0xd8ffd8);

  const look: Look = { skin: 0xf2c8aa, hair: 0xd4b06a, tips: 0xecd49a, style: 'long', shirt: 0x1e1e22, trim: 0x6aff7a, name: 'Cookie', iris: 0x5a7a9a, moustache: 0x9a6a3a, faceWidth: 0.92, mouth: 'smirk', brow: -0.1, tee: 0xffe14d, rolled: true };
  const d = new THREE.Group();
  d.position.set(0, 0.62, -0.75);
  const head = musician(d, look);
  const grips = guitarWheel(d, 0.42, 0.6, 0.2, r.accent);
  musicianArms(d, look, grips);
  body.add(d);
  bake(head);
  bake(body, [head]);
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

/** A steering wheel shaped like a guitar pick on its column, tilted toward the driver; returns the two grip points. */
function guitarWheel(parent: THREE.Object3D, y: number, z: number, r: number, color: number): [V3, V3] {
  const w = new THREE.Group();
  w.position.set(0, y, z);
  w.rotation.x = -0.9;
  put(w, tor(r, 0.03, Math.PI * 2, 6, 24), matte(0x1a1a1a), [0, 0, 0]);
  put(w, box(r * 2, 0.03, 0.03), matte(0x1a1a1a), [0, 0, 0]);
  put(w, cy(0.09, 0.09, 0.04, 3), phong(color, { shine: 80 }), [0, 0, 0.01], [HALF_PI, 0, 0]);
  parent.add(w);
  rod(parent, [0, y - 0.05, z + 0.05], [0, y - 0.3, z + 0.4], 0.03, matte(0x1a1a1a));
  const gy = y + Math.sin(0.9) * 0.02;
  return [
    [-r * 0.95, gy, z],
    [r * 0.95, gy, z],
  ];
}

// ---- Joey: the modular-synth buggy ---------------------------------------------------

// Joey Walker: guitar and synths, in a buggy built around a modular synth: module panels of knobs,
// jacks, sliders and a scope, patch cables everywhere, a step sequencer spinning, and the Silver Cord
// patched from the rack all the way round to the nose. The back of the rack is pink and signed "Yikes".
export function joeyWalker(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const frame = gloss(0x2a2a30);
  const chrome = steel();
  const paint = gloss(r.color);
  put(body, box(1.2, 0.25, 2.4), paint, [0, 0.4, 0]);
  // A skid plate and a chrome bumper, nerf bars along the sides.
  put(body, box(1.0, 0.06, 0.4), alu(), [0, 0.3, 1.2], [0.3, 0, 0]);
  cable(body, [[-0.6, 0.45, 1.32], [-0.3, 0.55, 1.42], [0.3, 0.55, 1.42], [0.6, 0.45, 1.32]], 0.04, chrome, 12, 8);
  for (const side of [-1, 1]) {
    rod(body, [side * 0.66, 0.38, 0.55], [side * 0.66, 0.38, -0.5], 0.035, chrome);
    for (const z of [0.55, -0.5]) rod(body, [side * 0.6, 0.38, z], [side * 0.66, 0.38, z], 0.03, chrome);
  }
  // Coilover shocks at each corner: a chrome rod in a yellow spring.
  for (const side of [-1, 1])
    for (const z of [0.95, -0.9]) {
      const top: V3 = [side * 0.55, 0.95, z];
      const bot: V3 = [side * 0.72, 0.42, z];
      rod(body, top, bot, 0.022, chrome);
      for (let k = 0; k < 6; k++) {
        const t = 0.15 + k * 0.13;
        put(body, tor(0.05, 0.01, Math.PI * 2, 4, 10), matte(0xffd23a), [top[0] + (bot[0] - top[0]) * t, top[1] + (bot[1] - top[1]) * t, z], [HALF_PI, 0, side * 0.3]);
      }
      put(body, cy(0.05, 0.05, 0.05, 10), frame, top);
    }
  // The rack: two rows of modules, each its own panel, in a frame with rails and screws.
  const rack = new THREE.Group();
  rack.position.set(0, 0.95, -0.85);
  rack.rotation.x = -0.25;
  put(rack, box(1.3, 0.85, 0.3), frame, [0, 0, 0]);
  for (const y of [0.4, 0, -0.4]) put(rack, box(1.32, 0.04, 0.04), alu(), [0, y, 0.15]);
  const panels = [0xc8ccd4, 0x1a1a1e, 0xf0ece0, 0xc8ccd4, 0x2a3a5a, 0x1a1a1e];
  const jack = matte(0x0a0a0a);
  const knobColors = [0xffffff, 0xff5a3a, 0x3adcff, 0xffd23a];
  for (let row = 0; row < 2; row++) {
    const y = 0.2 - row * 0.4;
    let x = -0.62;
    for (let m = 0; m < 4; m++) {
      const w = [0.28, 0.36, 0.26, 0.34][(m + row) % 4];
      const cx = x + w / 2;
      put(rack, box(w - 0.01, 0.34, 0.02), matte(panels[(m + row * 3) % panels.length]), [cx, y, 0.155]);
      bolts(rack, [[cx - w / 2 + 0.02, y + 0.15, 0.168], [cx + w / 2 - 0.02, y - 0.15, 0.168]], 0.01, 'z');
      const kind = (m + row * 2) % 4;
      if (kind === 0) {
        // Big knobs over a row of jacks.
        for (const kx of [-0.06, 0.06]) put(rack, cy(0.04, 0.045, 0.05, 10), matte(knobColors[(m + row) % 4]), [cx + kx, y + 0.08, 0.18], [HALF_PI, 0, 0]);
        for (const kx of [-0.08, 0, 0.08]) put(rack, cy(0.018, 0.018, 0.02, 8), jack, [cx + kx, y - 0.1, 0.17], [HALF_PI, 0, 0]);
      } else if (kind === 1) {
        // Sliders.
        for (let k = 0; k < 4; k++) {
          const kx = -0.12 + k * 0.08;
          put(rack, box(0.012, 0.22, 0.01), matte(0x111111), [cx + kx, y, 0.168]);
          put(rack, box(0.04, 0.025, 0.03), matte(0xf4f4f4), [cx + kx, y + Math.sin(k * 2.1 + row) * 0.08, 0.18]);
        }
      } else if (kind === 2) {
        // A scope: a green screen with its trace.
        put(rack, box(w - 0.08, 0.18, 0.012), lit(0x0a3a1a), [cx, y + 0.05, 0.168]);
        put(rack, box(w - 0.12, 0.012, 0.012), lit(0x7aff7a), [cx, y + 0.05, 0.172], [0, 0, 0.4]);
        put(rack, box(w - 0.12, 0.012, 0.012), lit(0x7aff7a), [cx, y + 0.05, 0.172], [0, 0, -0.4]);
        for (const kx of [-0.06, 0.06]) put(rack, cy(0.018, 0.018, 0.02, 8), jack, [cx + kx, y - 0.11, 0.17], [HALF_PI, 0, 0]);
      } else {
        // Small knobs and LEDs.
        for (let k = 0; k < 6; k++) {
          const kx = -0.1 + (k % 3) * 0.1;
          const ky = 0.08 - Math.floor(k / 3) * 0.12;
          put(rack, cy(0.025, 0.028, 0.04, 8), matte(knobColors[(k + m) % 4]), [cx + kx, y + ky, 0.18], [HALF_PI, 0, 0]);
          put(rack, sph(0.012, 6, 4), lit(k % 2 ? 0x7aff7a : 0xff3a3a), [cx + kx + 0.035, y + ky + 0.035, 0.17]);
        }
      }
      x += w;
    }
  }
  // The back of the rack, facing whoever's behind: pink, signed "Yikes", a vent grille either side.
  put(rack, new THREE.PlaneGeometry(1.31, 0.86), gloss(0xff6ac0), [0, 0, -0.152], [0, Math.PI, 0]);
  put(rack, new THREE.PlaneGeometry(1.24, 0.62), shared('yikes-mat', () => new THREE.MeshPhongMaterial({ map: yikesTexture(), emissive: 0x401028 })), [0, 0, -0.16], [0, Math.PI, 0]);
  // Patch cables drooping between jacks, each with a plug at both ends.
  const cableColors = [0xff3a8a, 0x3adcff, 0xffd23a, 0x7aff7a, 0xff8a2a, 0xb87aff, 0xffffff];
  for (let k = 0; k < 7; k++) {
    const a: V3 = [-0.55 + k * 0.18, 0.28, 0.19];
    const b: V3 = [-0.48 + ((k * 3) % 7) * 0.16, -0.3, 0.19];
    const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.12, 0.42 + (k % 3) * 0.05];
    cable(rack, [a, mid, b], 0.016, matte(cableColors[k]), 10, 5);
    for (const p of [a, b]) put(rack, cy(0.022, 0.022, 0.05, 8), chrome, [p[0], p[1], p[2] + 0.01], [HALF_PI, 0, 0]);
  }
  body.add(rack);
  // A step sequencer: a dial of eight LEDs that runs round (the kart view spins it with speed).
  const seq = new THREE.Group();
  seq.position.set(0.75, 0.0, 0.0);
  put(seq, cy(0.16, 0.16, 0.04, 20), matte(0x1a1a1e), [0, 0, 0], [HALF_PI, 0, 0]);
  for (let k = 0; k < 8; k++) put(seq, sph(0.02, 6, 4), lit(k === 0 ? 0xff3a3a : 0x3adcff), [Math.cos((k / 8) * Math.PI * 2) * 0.11, Math.sin((k / 8) * Math.PI * 2) * 0.11, 0.025]);
  put(seq, box(0.03, 0.12, 0.02), matte(0xf4f4f4), [0, 0.05, 0.03]);
  bake(seq);
  rack.add(seq);
  // Roll cage over the seat, a bucket seat with a headrest.
  for (const side of [-1, 1]) rod(body, [side * 0.55, 0.5, -0.5], [side * 0.45, 1.75, -0.3], 0.04, chrome);
  rod(body, [-0.45, 1.75, -0.3], [0.45, 1.75, -0.3], 0.04, chrome);
  for (const side of [-1, 1]) rod(body, [side * 0.45, 1.75, -0.3], [side * 0.5, 0.55, 0.6], 0.03, chrome);
  put(body, box(0.6, 0.7, 0.1), matte(0x1a1a1e), [0, 0.85, -0.45], [-0.15, 0, 0]);
  put(body, box(0.36, 0.2, 0.1), matte(0x1a1a1e), [0, 1.32, -0.52], [-0.15, 0, 0]);
  put(body, box(0.08, 0.66, 0.11), matte(r.accent), [0, 0.85, -0.44], [-0.15, 0, 0]);
  // The Silver Cord: a thick braided silver lead from the rack, round the side and down to a jack on the nose.
  const cord = phong(0xe8eef8, { shine: 140, spec: 0xffffff, env: 0.8, emissive: 0x303844 });
  const cordPts: V3[] = [[-0.55, 1.22, -0.72], [-0.75, 1.15, -0.3], [-0.72, 0.9, 0.3], [-0.55, 0.62, 0.95], [-0.2, 0.6, 1.22]];
  cable(body, cordPts, 0.035, cord, 32, 8);
  const curve = new THREE.CatmullRomCurve3(cordPts.map((p) => new THREE.Vector3(...p)));
  for (let k = 1; k < 14; k++) {
    const p = curve.getPointAt(k / 14);
    const t = curve.getTangentAt(k / 14);
    const ring = put(body, tor(0.038, 0.01, Math.PI * 2, 4, 12), chrome, p.toArray() as V3);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), t);
  }
  put(body, cy(0.05, 0.05, 0.1, 10), chrome, [-0.2, 0.6, 1.25], [HALF_PI, 0, 0]);
  glowSprite(body, [-0.2, 0.62, 1.3], 0.4, 0xe0f0ff);
  // A pink tail across the back with tail lights, and the headlights.
  put(body, box(1.3, 0.34, 0.14), gloss(0xff6ac0), [0, 0.45, -1.22]);
  for (const side of [-1, 1]) put(body, cy(0.06, 0.06, 0.02, 12), lit(0xff2a1a), [side * 0.5, 0.48, -1.3], [HALF_PI, 0, 0]);
  headlights(body, 0.4, 0.45, 1.22, 0.08, 0xc8f0ff);

  const look: Look = { skin: 0xe8b88e, hair: 0x1a1210, style: 'short', shirt: 0x26262c, trim: r.accent, name: 'Joey', shades: true, moustache: 0x1a1210, faceWidth: 0.93, mouth: 'grin', tee: 0xe85a9a, rolled: true };
  const d = new THREE.Group();
  d.position.set(0, 0.5, -0.1);
  const head = musician(d, look);
  const grips = guitarWheel(d, 0.42, 0.62, 0.2, r.accent);
  musicianArms(d, look, grips);
  body.add(d);
  bake(head);
  bake(body, [head, seq]);
  return {
    body,
    wheels: [0.8, -0.8].flatMap((x) => [
      { x, z: 0.95, radius: 0.4, width: 0.36, front: true },
      { x, z: -0.9, radius: 0.46, width: 0.42, front: false },
    ]),
    exhausts: pipes(body, 0.35, 0.45, -1.25),
    rearTrack: 0.8,
    rearZ: -1.0,
    spinners: [seq],
    shadow: [2.5, 3.3],
    head,
  };
}

// ---- Lukey: the 8x10 bass cab ----------------------------------------------------------

// Lucas Harwood: bass, driving an 8x10 bass cabinet on wheels: eight speakers facing out behind,
// an amp head on top glowing, and his bass in a stand against the cab's side, swaying.
export function lucasHarwood(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const tolex = phong(0x161616, { shine: 30 });
  const chrome = steel();
  const piping = phong(0xf4ecd8, { shine: 40 });
  put(body, box(1.4, 0.3, 2.6), gloss(r.color), [0, 0.4, 0]);
  // A grille-cloth nose, like a little cab of its own.
  put(body, new THREE.PlaneGeometry(1.2, 0.22), shared('lukey-grille', () => new THREE.MeshPhongMaterial({ map: grilleTexture(), shininess: 10 })), [0, 0.4, 1.302]);
  put(body, box(1.3, 0.03, 0.03), piping, [0, 0.52, 1.3]);
  // The cab stands at the back: tolex, chrome corners, white piping round the baffle, a handle each side.
  put(body, box(1.3, 1.25, 0.7), tolex, [0, 1.15, -0.85]);
  put(body, box(1.2, 1.15, 0.02), matte(0x101010), [0, 1.15, -1.205]);
  for (const x of [-1, 1]) for (const y of [0.525, 1.775]) for (const z of [-0.5, -1.2]) put(body, box(0.12, 0.12, 0.12), chrome, [x * 0.63, y, z]);
  put(body, box(1.22, 0.02, 0.02), piping, [0, 1.735, -1.215]);
  put(body, box(1.22, 0.02, 0.02), piping, [0, 0.565, -1.215]);
  for (const x of [-0.6, 0.6]) put(body, box(0.02, 1.17, 0.02), piping, [x, 1.15, -1.215]);
  for (const side of [-1, 1]) {
    put(body, box(0.03, 0.08, 0.3), matte(0x0a0a0a), [side * 0.655, 1.3, -0.85]);
    put(body, box(0.04, 0.03, 0.26), chrome, [side * 0.67, 1.3, -0.85]);
  }
  // Eight tens, two by four: a surround, a cone and a dust cap each, and the screws round the rim.
  const cone = matte(0x2a2a2a);
  const surround = matte(0x0e0e0e);
  for (let row = 0; row < 4; row++)
    for (const col of [-1, 1]) {
      const x = col * 0.28;
      const y = 0.72 + row * 0.29;
      put(body, tor(0.115, 0.022, Math.PI * 2, 5, 18), surround, [x, y, -1.215]);
      put(body, new THREE.ConeGeometry(0.11, 0.06, 18, 1, true), cone, [x, y, -1.2], [-HALF_PI, 0, 0]);
      put(body, sph(0.04, 10, 6), phong(0x3a3a3a, { shine: 60 }), [x, y, -1.215], [0, 0, 0], [1, 1, 0.5]);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        put(body, cy(0.008, 0.008, 0.01, 6), chrome, [x + Math.cos(a) * 0.13, y + Math.sin(a) * 0.13, -1.22], [HALF_PI, 0, 0]);
      }
    }
  // A logo plate across the top of the baffle.
  const plate = decalMat('lukey-plate', (g, w, h) => {
    g.fillStyle = '#d8d8d0';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1a1a';
    g.fillRect(4, 4, w - 8, h - 8);
    lettering(g, [['LUKEY 8×10', w / 2, h / 2 + 2, '#d8d8d0']], 'italic 900 34px "Arial Black", sans-serif');
  }, 256, 64);
  put(body, new THREE.PlaneGeometry(0.5, 0.12), plate, [0, 1.66, -1.218], [0, Math.PI, 0]);
  // The amp head on top: tolex, a chrome strip, a row of knobs facing back, a red jewel and the valves glowing through a vent.
  put(body, box(1.0, 0.28, 0.5), tolex, [0, 1.92, -0.85]);
  put(body, box(0.98, 0.18, 0.02), phong(0xc8c8c0, { shine: 80, env: 0.3 }), [0, 1.92, -1.105]);
  for (let k = 0; k < 7; k++) put(body, cy(0.025, 0.028, 0.03, 10), matte(0x111111), [-0.38 + k * 0.1, 1.92, -1.125], [HALF_PI, 0, 0]);
  put(body, sph(0.03, 8, 6), lit(0xff2a1a), [0.42, 1.92, -1.12]);
  for (let k = 0; k < 4; k++) put(body, box(0.02, 0.12, 0.01), lit(0xff9a3a), [-0.12 + k * 0.08, 1.93, -0.595]);
  put(body, box(0.3, 0.16, 0.012), matte(0x0a0a0a), [0, 1.93, -0.598]);
  rod(body, [-0.25, 2.07, -0.85], [0.25, 2.07, -0.85], 0.02, matte(0x111111));
  // A speaker cable from the head down into the cab.
  cable(body, [[-0.45, 1.85, -0.6], [-0.6, 1.6, -0.45], [-0.5, 1.4, -0.48]], 0.015, matte(0x111111), 10, 4);
  // The bass in a stand clamped to the cab's side, swaying as it drives (the kart view beats it about z).
  const bass = new THREE.Group();
  bass.position.set(0.78, 0.58, -0.85);
  put(body, box(0.16, 0.06, 0.3), chrome, [0.76, 0.58, -0.85]);
  put(body, box(0.04, 0.5, 0.04), chrome, [0.73, 1.2, -0.85]);
  bass.userData.side = 1;
  const bassBody = new THREE.Group();
  bassBody.rotation.z = -0.08;
  bassBody.scale.setScalar(0.85);
  bass.add(bassBody);
  const sunburst = phong(r.accent, { shine: 90, spec: 0x666666, env: 0.25 });
  put(bassBody, sph(0.18, 14, 8), sunburst, [0, 0.2, 0], [0, 0, 0], [1.0, 1.0, 0.3]);
  put(bassBody, sph(0.14, 14, 8), sunburst, [0, 0.4, 0], [0, 0, 0], [0.95, 0.85, 0.3]);
  for (const side of [-1, 1]) put(bassBody, new THREE.ConeGeometry(0.05, 0.18, 6), sunburst, [side * 0.1, 0.55, 0], [0, 0, side * -0.3], [1, 1, 0.5]);
  put(bassBody, box(0.16, 0.24, 0.012), phong(0xf4ecd8, { shine: 60 }), [0.02, 0.28, 0.055]);
  put(bassBody, box(0.14, 0.05, 0.03), matte(0x111111), [0, 0.32, 0.062]);
  put(bassBody, box(0.14, 0.04, 0.03), chrome, [0, 0.12, 0.062]);
  put(bassBody, box(0.07, 1.0, 0.045), matte(0x5a3218), [0, 0.95, 0]);
  for (let k = 0; k < 10; k++) put(bassBody, box(0.072, 0.008, 0.05), chrome, [0, 0.55 + k * 0.08, 0.003]);
  put(bassBody, box(0.12, 0.24, 0.04), sunburst, [0.02, 1.55, 0], [0, 0, -0.08]);
  for (let k = 0; k < 4; k++) {
    put(bassBody, cy(0.012, 0.012, 0.08, 6), chrome, [-0.05, 1.47 + k * 0.055, 0], [0, 0, HALF_PI]);
    put(bassBody, cy(0.025, 0.025, 0.012, 8), chrome, [-0.09, 1.47 + k * 0.055, 0], [0, 0, HALF_PI]);
  }
  for (let k = 0; k < 4; k++) put(bassBody, box(0.004, 1.32, 0.004), chrome, [-0.022 + k * 0.015, 0.8, 0.03]);
  bake(bassBody);
  body.add(bass);
  headlights(body, 0.45, 0.5, 1.32, 0.09);
  for (const side of [-1, 1]) put(body, box(0.2, 0.06, 0.02), lit(0xff2a1a), [side * 0.45, 0.42, -1.302]);

  const look: Look = { skin: 0xe8bc94, hair: 0x2a1a10, style: 'wavy', shirt: 0xd8703a, trim: 0xf4e8d0, name: 'Lukey', iris: 0x4a6a8a, mouth: 'grin', stubble: 0x2a1a10, tee: 0x2a2a2a };
  const d = new THREE.Group();
  d.position.set(0, 0.55, -0.05);
  const head = musician(d, look);
  const grips = guitarWheel(d, 0.42, 0.62, 0.2, r.accent);
  musicianArms(d, look, grips);
  body.add(d);
  bake(head);
  bake(body, [head, bass]);
  return {
    body,
    wheels: [0.86, -0.86].flatMap((x) => [
      { x, z: 0.95, radius: 0.42, width: 0.4, front: true, material: rubber() },
      { x, z: -0.95, radius: 0.46, width: 0.44, front: false, material: rubber() },
    ]),
    exhausts: pipes(body, 0.45, 0.5, -1.35),
    rearTrack: 0.86,
    rearZ: -1.0,
    spinners: [],
    shadow: [2.7, 3.4],
    head,
    flappers: [bass],
  };
}

// ---- Cavs: the Road Train on two bass drums --------------------------------------------

/** A drum shell's hoop and its tension lugs, round a shell of radius r whose head faces +y. */
function drumHardware(parent: THREE.Object3D, at: V3, r: number, h: number, lugs: number): void {
  const chrome = steel();
  for (const y of [h / 2, -h / 2]) put(parent, tor(r + 0.01, 0.014, Math.PI * 2, 4, 24), chrome, [at[0], at[1] + y, at[2]], [HALF_PI, 0, 0]);
  for (let k = 0; k < lugs; k++) {
    const a = (k / lugs) * Math.PI * 2;
    put(parent, box(0.03, h * 0.5, 0.03), chrome, [at[0] + Math.cos(a) * (r + 0.012), at[1], at[2] + Math.sin(a) * (r + 0.012)], [0, -a, 0]);
  }
}

// Michael Cavanagh: drums, rolling on two bass drums (heads out, "ROAD TRAIN" on them) with a ride
// cymbal for a spoiler, a snare on the nose, toms, a hi-hat and a crash wobbling, sticks up mid-fill,
// and the Road Train's chrome: a bull bar, twin stacks and mud flaps. No brakes.
export function michaelCavanagh(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const wrap = shared('cav-wrap', () => new THREE.MeshPhongMaterial({ map: sparkleTexture([40, 120, 200]), shininess: 80, specular: 0x888888 }));
  const head = phong(0xf4f0e4, { shine: 30 });
  const chrome = steel();
  const cymbal = brassy();
  put(body, box(1.0, 0.28, 2.3), gloss(r.color), [0, 0.42, 0.1]);
  // The bass drum heads on the rear wheels' outer faces: a hoop and lugs round each, the logo printed on.
  const logo = decalMat('cav-roadtrain', (g, w, h) => {
    g.fillStyle = '#f4f0e4';
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#1a3a6a';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.4, 0, Math.PI * 2);
    g.stroke();
    lettering(g, [['ROAD', w / 2, h / 2 - 22, '#1a3a6a'], ['TRAIN', w / 2, h / 2 + 22, '#1a3a6a']], 'italic 900 44px "Arial Black", sans-serif');
    lettering(g, [['CAVS', w / 2, h / 2 + 76, '#e8642a']], 'bold 22px sans-serif');
  }, 256, 256);
  for (const side of [-1, 1]) {
    const x = side * 1.07;
    put(body, new THREE.CircleGeometry(0.4, 28), logo, [x, 0.55, -0.85], [0, side * HALF_PI, 0]);
    put(body, tor(0.41, 0.022, Math.PI * 2, 5, 28), chrome, [x, 0.55, -0.85], [0, HALF_PI, 0]);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      put(body, box(0.05, 0.035, 0.035), chrome, [x - side * 0.02, 0.55 + Math.sin(a) * 0.38, -0.85 + Math.cos(a) * 0.38], [a, 0, 0]);
    }
  }
  // A snare on the nose with its hoops, lugs and a stand under it.
  put(body, cy(0.3, 0.3, 0.22, 24), wrap, [0, 0.68, 0.9]);
  put(body, cy(0.29, 0.29, 0.01, 24), head, [0, 0.8, 0.9]);
  drumHardware(body, [0, 0.68, 0.9], 0.3, 0.22, 8);
  // A floor tom beside the seat, a rack tom over the dash.
  put(body, cy(0.28, 0.28, 0.42, 24), wrap, [0.62, 0.75, -0.1]);
  put(body, cy(0.27, 0.27, 0.01, 24), head, [0.62, 0.97, -0.1]);
  drumHardware(body, [0.62, 0.75, -0.1], 0.28, 0.42, 8);
  put(body, cy(0.2, 0.2, 0.18, 20), wrap, [0.3, 1.0, 0.45], [0.35, 0, -0.2]);
  put(body, cy(0.19, 0.19, 0.01, 20), head, [0.33, 1.09, 0.48], [0.35, 0, -0.2]);
  rod(body, [0.3, 0.55, 0.4], [0.3, 0.92, 0.42], 0.02, chrome);
  // A hi-hat on the left: a stand and two cymbals closed together.
  rod(body, [-0.55, 0.55, 0.25], [-0.62, 1.15, 0.3], 0.02, chrome);
  for (const y of [1.13, 1.16]) put(body, cy(0.02, 0.24, 0.025, 24), cymbal, [-0.62, y, 0.3], [0, 0, 0], [1, y > 1.14 ? 1 : -1, 1]);
  // The ride as a spoiler on a post, amber marker lights along a bar under it.
  rod(body, [0, 0.55, -1.1], [0, 1.25, -1.15], 0.03, chrome);
  put(body, cy(0.03, 0.56, 0.04, 32), cymbal, [0, 1.28, -1.15], [0.15, 0, 0]);
  put(body, cy(0.07, 0.07, 0.05, 12), cymbal, [0, 1.31, -1.15], [0.15, 0, 0]);
  for (let k = 0; k < 6; k++) put(body, tor(0.15 + k * 0.075, 0.004, Math.PI * 2, 3, 28), phong(0xb88a2a, { shine: 90 }), [0, 1.3 - k * 0.0, -1.15], [HALF_PI + 0.15, 0, 0]);
  rod(body, [-0.5, 1.1, -1.12], [0.5, 1.1, -1.12], 0.025, chrome);
  for (let k = 0; k < 5; k++) put(body, sph(0.04, 8, 6), lit(0xffa81a), [-0.4 + k * 0.2, 1.1, -1.16], [0, 0, 0], [1, 0.7, 0.7]);
  // The crash on the left, wobbling on its stand (the kart view rocks it about z).
  rod(body, [-0.55, 0.55, 0.4], [-0.75, 1.05, 0.65], 0.02, chrome);
  const crash = new THREE.Group();
  crash.position.set(-0.75, 1.07, 0.65);
  crash.userData.side = -1;
  const crashTilt = new THREE.Group();
  crashTilt.rotation.set(0.2, 0, 0.2);
  crash.add(crashTilt);
  put(crashTilt, cy(0.02, 0.4, 0.03, 28), cymbal, [0, 0, 0]);
  put(crashTilt, cy(0.06, 0.06, 0.04, 12), cymbal, [0, 0.02, 0]);
  put(crashTilt, cy(0.015, 0.015, 0.1, 6), chrome, [0, 0.04, 0]);
  bake(crashTilt);
  body.add(crash);
  // The Road Train's chrome: a bull bar on the front, twin exhaust stacks with rain caps behind the seat, mud flaps.
  for (const x of [-0.42, 0.42]) rod(body, [x, 0.3, 1.18], [x, 0.85, 1.21], 0.035, chrome);
  for (const y of [0.45, 0.7]) cable(body, [[-0.55, y - 0.05, 1.08], [-0.4, y, 1.21], [0.4, y, 1.21], [0.55, y - 0.05, 1.08]], 0.03, chrome, 12, 6);
  for (const side of [-1, 1]) {
    const x = side * 0.32;
    rod(body, [x, 0.55, -0.82], [x, 1.75, -0.82], 0.05, chrome);
    put(body, cy(0.062, 0.062, 0.3, 12), phong(0x3a3a3a, { shine: 40 }), [x, 1.1, -0.82]);
    for (let k = 0; k < 6; k++) put(body, box(0.13, 0.012, 0.012), chrome, [x, 0.98 + k * 0.045, -0.75]);
    put(body, cy(0.07, 0.07, 0.01, 12), chrome, [x, 1.78, -0.84], [-0.6, 0, 0]);
    put(body, box(0.4, 0.24, 0.02), matte(0x111111), [side * 0.85, 0.42, -1.45]);
    put(body, box(0.28, 0.05, 0.022), chrome, [side * 0.85, 0.48, -1.45]);
  }
  rod(body, [-0.85, 0.4, -1.42], [0.85, 0.4, -1.42], 0.02, chrome);

  const look: Look = { skin: 0xecc0a0, hair: 0x1e140e, style: 'mop', shirt: 0x24262c, trim: 0xe8642a, name: 'Cavs', iris: 0x4a3a2a, mouth: 'grit', brow: 0.25, moustache: 0x1e140e, tee: 0xe8642a, rolled: true };
  const d = new THREE.Group();
  d.position.set(0, 0.55, -0.35);
  const driverHead = musician(d, look);
  // Sticks up mid-fill: wood, a tip, motion streaks behind.
  const grips: V3[] = [[-0.38, 0.9, 0.45], [0.38, 0.9, 0.45]];
  musicianArms(d, look, grips);
  for (const [k, g] of grips.entries()) {
    const side = k ? 1 : -1;
    const end: V3 = [side * 0.5, 1.35, 0.75];
    rod(d, [g[0] - (end[0] - g[0]) * 0.2, g[1] - (end[1] - g[1]) * 0.2, g[2] - (end[2] - g[2]) * 0.2], end, 0.017, phong(0xe8c890, { shine: 40 }), 0.012);
    put(d, sph(0.02, 8, 6), phong(0xf4ecd8, { shine: 40 }), end, [0, 0, 0], [1, 1.4, 1]);
  }
  body.add(d);
  bake(driverHead);
  bake(body, [driverHead, crash]);
  return {
    body,
    wheels: [
      { x: 0.7, z: 0.95, radius: 0.3, width: 0.24, front: true },
      { x: -0.7, z: 0.95, radius: 0.3, width: 0.24, front: true },
      { x: 0.85, z: -0.85, radius: 0.55, width: 0.42, front: false, material: wrap },
      { x: -0.85, z: -0.85, radius: 0.55, width: 0.42, front: false, material: wrap },
    ],
    exhausts: pipes(body, 0.3, 0.5, -1.15),
    rearTrack: 0.85,
    rearZ: -0.95,
    spinners: [],
    shadow: [2.5, 3.2],
    head: driverHead,
    flappers: [crash],
  };
}

// ---- Jason: the rolling lighting rig ----------------------------------------------------

// Jason Galea: the band's visual artist, riding a rolling lighting rig: a road case on wheels under a
// box truss, moving heads sweeping their beams, par cans across the front, a strobe, the desk he plays
// it from and a laptop of visuals, paint splattered all over and a brush in his hand, painting the Gizzverse.
export function jasonGalea(r: RacerDef): KartModel {
  const body = new THREE.Group();
  const truss = phong(0xc8ccd4, { shine: 90, spec: 0xffffff });
  const black = matte(0x16161c);
  const chrome = steel();
  const beamColors = [r.accent, 0xff3ad8, 0xffd23a, 0x7aff9a];
  // The road case: black, aluminium edging, ball corners, butterfly latches, and paint splattered down its flanks.
  put(body, box(1.4, 0.26, 2.5), gloss(r.color), [0, 0.4, 0]);
  for (const x of [-0.7, 0.7]) for (const y of [0.27, 0.53]) put(body, box(0.04, 0.04, 2.5), alu(), [x, y, 0]);
  for (const z of [-1.25, 1.25]) for (const y of [0.27, 0.53]) put(body, box(1.4, 0.04, 0.04), alu(), [0, y, z]);
  for (const x of [-0.7, 0.7]) for (const y of [0.27, 0.53]) for (const z of [-1.25, 1.25]) put(body, sph(0.045, 8, 6), chrome, [x, y, z]);
  for (const side of [-1, 1])
    for (const z of [-0.6, 0.6]) {
      put(body, box(0.02, 0.1, 0.16), chrome, [side * 0.71, 0.4, z]);
      put(body, cy(0.025, 0.025, 0.03, 8), chrome, [side * 0.725, 0.4, z], [0, 0, HALF_PI]);
    }
  const splat = decalMat('jason-splat', (g, w, h) => {
    let s = 19;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const colors = ['#3adcff', '#ff3ad8', '#ffd23a', '#7aff9a', '#ff6a2a'];
    for (let k = 0; k < 16; k++) {
      g.fillStyle = colors[k % colors.length];
      const x = rnd() * w;
      const y = rnd() * h;
      const rad = 6 + rnd() * 16;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
      for (let j = 0; j < 6; j++) {
        const a = rnd() * Math.PI * 2;
        const d = rad * (1.2 + rnd() * 1.4);
        g.beginPath();
        g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2 + rnd() * 4, 0, Math.PI * 2);
        g.fill();
      }
      g.fillRect(x - 2, y, 4, rad * (1 + rnd() * 2));
    }
  }, 256, 64);
  for (const side of [-1, 1]) put(body, new THREE.PlaneGeometry(2.3, 0.2), splat, [side * 0.702, 0.4, 0], [0, side * HALF_PI, 0], [side, 1, 1]);
  put(body, new THREE.PlaneGeometry(1.3, 0.2), splat, [0, 0.4, -1.252], [0, Math.PI, 0]);
  // A box truss on four corner posts, rails along the top, zigzag lacing down the sides and along the top.
  const corners: [number, number][] = [[-0.62, -1.1], [0.62, -1.1], [-0.62, 0.95], [0.62, 0.95]];
  for (const [x, z] of corners) {
    rod(body, [x, 0.5, z], [x, 2.1, z], 0.035, truss);
    rod(body, [x + 0.08, 0.5, z], [x + 0.08, 2.0, z], 0.018, truss);
  }
  for (const z of [-1.1, 0.95]) {
    rod(body, [-0.62, 2.1, z], [0.62, 2.1, z], 0.035, truss);
    rod(body, [-0.62, 2.0, z], [0.62, 2.0, z], 0.02, truss);
    for (let k = 0; k < 6; k++) rod(body, [-0.62 + k * 0.207, 2.0 + (k % 2) * 0.1, z], [-0.62 + (k + 1) * 0.207, 2.0 + ((k + 1) % 2) * 0.1, z], 0.01, truss);
  }
  for (const x of [-0.62, 0.62]) {
    rod(body, [x, 2.1, -1.1], [x, 2.1, 0.95], 0.035, truss);
    rod(body, [x, 2.0, -1.1], [x, 2.0, 0.95], 0.02, truss);
    for (let k = 0; k < 10; k++) rod(body, [x, 2.0 + (k % 2) * 0.1, -1.1 + k * 0.205], [x, 2.0 + ((k + 1) % 2) * 0.1, -1.1 + (k + 1) * 0.205], 0.01, truss);
    for (let k = 0; k < 3; k++) rod(body, [x, 0.55 + k * 0.48, -1.1], [x, 1.03 + k * 0.48, 0.95], 0.015, truss);
    // Cable bundles taped down the posts.
    cable(body, [[x * 0.95, 2.0, -1.05], [x * 0.92, 1.4, -1.0], [x * 0.95, 0.6, -1.02]], 0.022, black, 8, 4);
  }
  // Moving heads on the four top corners: a yoke and a head, its beam a soft cone of light (they sweep about y).
  const sweepers: THREE.Object3D[] = [];
  corners.forEach(([x, z], k) => {
    const yoke = new THREE.Group();
    yoke.position.set(x, 2.15, z);
    put(yoke, cy(0.12, 0.13, 0.1, 14), black, [0, 0.04, 0]);
    put(yoke, box(0.08, 0.02, 0.04), lit(beamColors[k]), [0, 0.04, 0.12]);
    for (const side of [-1, 1]) {
      put(yoke, box(0.03, 0.24, 0.08), black, [side * 0.11, 0.16, 0]);
      put(yoke, cy(0.03, 0.03, 0.02, 8), chrome, [side * 0.13, 0.2, 0], [0, 0, HALF_PI]);
    }
    const headGroup = new THREE.Group();
    headGroup.position.y = 0.2;
    headGroup.rotation.x = 0.5 + (k % 2) * 0.3;
    put(headGroup, cy(0.08, 0.1, 0.22, 14), black, [0, 0, 0], [HALF_PI, 0, 0]);
    for (let f = 0; f < 4; f++) put(headGroup, tor(0.085, 0.008, Math.PI * 2, 3, 14), matte(0x2a2a30), [0, 0, -0.08 + f * 0.04]);
    put(headGroup, cy(0.075, 0.075, 0.01, 14), lit(beamColors[k]), [0, 0, 0.115], [HALF_PI, 0, 0]);
    const beam = put(
      headGroup,
      new THREE.ConeGeometry(0.5, 3, 16, 1, true).translate(0, -1.5, 0).rotateX(-HALF_PI),
      shared(`beam:${beamColors[k]}`, () => new THREE.MeshBasicMaterial({ color: beamColors[k], transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })),
      [0, 0, 0.12],
    );
    beam.renderOrder = 2;
    yoke.add(headGroup);
    yoke.userData.phase = k * 1.3;
    bake(headGroup);
    bake(yoke, [headGroup]);
    body.add(yoke);
    sweepers.push(yoke);
  });
  // Par cans along the front bar with yokes and clamps, a strobe in the middle.
  for (let k = 0; k < 4; k++) {
    const x = -0.45 + k * 0.3;
    put(body, cy(0.07, 0.09, 0.18, 12), black, [x, 1.95, 1.0], [HALF_PI - 0.4, 0, 0]);
    put(body, cy(0.065, 0.065, 0.01, 12), lit(beamColors[k]), [x, 1.92, 1.09], [HALF_PI - 0.4, 0, 0]);
    put(body, tor(0.1, 0.01, Math.PI, 3, 10), black, [x, 1.95, 1.0], [0, HALF_PI, 0]);
    put(body, box(0.05, 0.06, 0.05), alu(), [x, 2.05, 0.97]);
  }
  put(body, box(0.3, 0.12, 0.1), black, [0, 2.1, 1.0]);
  put(body, box(0.26, 0.08, 0.02), lit(0xffffff), [0, 2.1, 1.055]);
  // The desk: a console of faders and buttons, a laptop of visuals beside it.
  const desk = new THREE.Group();
  desk.position.set(0, 0.85, 0.55);
  desk.rotation.x = -0.35;
  put(desk, box(0.9, 0.06, 0.45), black, [0, 0, 0]);
  for (let k = 0; k < 8; k++) {
    put(desk, box(0.02, 0.01, 0.2), matte(0x333333), [-0.36 + k * 0.1, 0.035, 0.05]);
    put(desk, box(0.05, 0.03, 0.03), matte(0xf4f4f4), [-0.36 + k * 0.1, 0.05, 0.05 + Math.sin(k * 1.9) * 0.07]);
    put(desk, box(0.04, 0.02, 0.04), lit(beamColors[k % 4]), [-0.36 + k * 0.1, 0.04, -0.15]);
    put(desk, cy(0.015, 0.015, 0.02, 8), matte(0xd8d8d8), [-0.36 + k * 0.1, 0.04, 0.19]);
  }
  body.add(desk);
  const swirl = decalMat('jason-visuals', (g, w, h) => {
    const colors = ['#3adcff', '#ff3ad8', '#ffd23a', '#7aff9a', '#1a1030'];
    for (let k = 12; k > 0; k--) {
      g.fillStyle = colors[k % colors.length];
      g.beginPath();
      g.ellipse(w / 2 + Math.sin(k) * 6, h / 2 + Math.cos(k * 1.3) * 4, k * 6, k * 4, k * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }, 128, 64, true);
  const laptop = new THREE.Group();
  laptop.position.set(-0.32, 0.94, 0.35);
  laptop.rotation.y = 0.5;
  put(laptop, box(0.34, 0.02, 0.24), alu(), [0, 0, 0]);
  put(laptop, box(0.34, 0.22, 0.015), alu(), [0, 0.11, 0.12], [0.25, 0, 0]);
  put(laptop, new THREE.PlaneGeometry(0.3, 0.18), swirl, [0, 0.112, 0.111], [0.25, Math.PI, 0]);
  body.add(laptop);
  // Paint pots on the deck behind him, drips down their sides.
  [0x3adcff, 0xff3ad8, 0xffd23a].forEach((c, k) => {
    const x = -0.35 + k * 0.35;
    put(body, cy(0.09, 0.09, 0.16, 12), alu(), [x, 0.61, -0.95]);
    put(body, cy(0.085, 0.085, 0.01, 12), matte(c), [x, 0.695, -0.95]);
    for (let j = 0; j < 3; j++) put(body, box(0.025, 0.06 + j * 0.03, 0.01), matte(c), [x + Math.cos(j * 2) * 0.09, 0.66 - j * 0.015, -0.95 + Math.sin(j * 2) * 0.09], [0, -j * 2 + HALF_PI, 0]);
  });
  headlights(body, 0.45, 0.45, 1.27, 0.08, 0xffffff);
  for (const side of [-1, 1]) put(body, box(0.2, 0.06, 0.02), lit(0xff2a1a), [side * 0.45, 0.42, -1.27]);

  const look: Look = { skin: 0xe8bc98, hair: 0x5a3c24, style: 'shaggy', shirt: 0x22222a, trim: r.accent, name: 'Jason', beard: 0x4a3020, iris: 0x4a3a2a, hat: { color: 0xb8a882, kind: 'cap' }, mouth: 'grin', tee: 0xffd23a };
  const d = new THREE.Group();
  d.position.set(0, 0.5, -0.2);
  const head = musician(d, look);
  // One hand on the faders, the other with a brush up, loaded with paint.
  const brushAt: V3 = [0.42, 0.72, 0.6];
  musicianArms(d, look, [[-0.2, 0.45, 0.68], brushAt]);
  const brush = new THREE.Group();
  brush.position.set(...brushAt);
  brush.rotation.set(0.7, 0, -0.5);
  put(brush, cy(0.018, 0.014, 0.4, 8), phong(0xc8302a, { shine: 60 }), [0, 0.15, 0]);
  put(brush, cy(0.022, 0.02, 0.06, 8), chrome, [0, 0.37, 0]);
  put(brush, cy(0.03, 0.006, 0.12, 8), matte(0x3adcff), [0, 0.46, 0]);
  put(brush, sph(0.025, 8, 6), matte(0x3adcff), [0.02, 0.52, 0.02]);
  d.add(brush);
  body.add(d);
  bake(head);
  bake(body, [head, ...sweepers]);
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
