import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ball, cone, cyl, glow, gloss, matte, put, UP } from '../racerModels';

/**
 * Detail helpers for the roster's creatures and their rides (racers/*.ts):
 * a material cache so a model shares its materials, `bake` to merge a
 * model's static parts into one mesh per material, and small shapes that
 * come up again and again (tubes, studs, rivets, decals).
 */

export type V3 = [number, number, number];

/** One model's materials, made once each and shared by every part that asks for the same one. */
export class Mats {
  private readonly made = new Map<string, THREE.Material>();
  private get<T extends THREE.Material>(key: string, make: () => T): T {
    let m = this.made.get(key) as T | undefined;
    if (!m) this.made.set(key, (m = make()));
    return m;
  }
  matte(color: number, extra: THREE.MeshPhongMaterialParameters = {}): THREE.MeshPhongMaterial {
    return this.get(`m${color}${keyOf(extra)}`, () => matte(color, extra));
  }
  gloss(color: number, extra: THREE.MeshPhongMaterialParameters = {}): THREE.MeshPhongMaterial {
    return this.get(`g${color}${keyOf(extra)}`, () => gloss(color, extra));
  }
  glow(color: number): THREE.MeshBasicMaterial {
    return this.get(`l${color}`, () => glow(color));
  }
  /** A see-through glow (flames, sparks, spray). */
  haze(color: number, opacity: number): THREE.MeshBasicMaterial {
    return this.get(`h${color}/${opacity}`, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  }
}

function keyOf(extra: THREE.MeshPhongMaterialParameters): string {
  const keys = Object.keys(extra).sort();
  if (!keys.length) return '';
  return keys.map((k) => {
    const v = (extra as Record<string, unknown>)[k];
    return `${k}=${v instanceof THREE.Texture ? v.uuid : String(v)}`;
  }).join(',');
}

const tmpM = new THREE.Matrix4();
const inv = new THREE.Matrix4();

/**
 * Merges the static meshes under `root` into one mesh per material, in
 * `root`'s space: everything but the subtrees in `keep` (the parts the kart
 * view moves: heads, wings, legs, spinners) and anything that isn't a plain
 * single-material mesh. Sprites and other non-mesh children of a merged mesh
 * are kept, moved up to its parent where they were.
 */
export function bake(root: THREE.Object3D, keep: readonly (THREE.Object3D | null | undefined)[] = []): void {
  const kept = new Set(keep.filter((o): o is THREE.Object3D => !!o));
  root.updateMatrixWorld(true);
  inv.copy(root.matrixWorld).invert();
  const found: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (kept.has(c)) continue;
      if (c instanceof THREE.Mesh && !Array.isArray(c.material) && !(c as THREE.Mesh & { isInstancedMesh?: boolean }).isInstancedMesh) found.push(c);
      walk(c);
    }
  };
  walk(root);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const m of found) {
    const g = normalize(m.geometry);
    tmpM.multiplyMatrices(inv, m.matrixWorld);
    g.applyMatrix4(tmpM);
    if (tmpM.determinant() < 0) flipWinding(g);
    const mat = m.material as THREE.Material;
    let list = buckets.get(mat);
    if (!list) buckets.set(mat, (list = []));
    list.push(g);
  }
  const merged = new Set(found);
  for (const m of found) {
    // Whatever isn't being merged (a sprite, a kept part) moves up out of the way, where it was.
    for (const c of [...m.children]) if (!merged.has(c as THREE.Mesh)) m.parent!.attach(c);
  }
  for (const m of found) m.removeFromParent();
  for (const [mat, list] of buckets) {
    const anyFlat = list.some((g) => !g.index);
    const geo = mergeGeometries(anyFlat ? list.map((g) => (g.index ? g.toNonIndexed() : g)) : list);
    if (geo) root.add(new THREE.Mesh(geo, mat));
  }
}

/** A copy with just position, normal and uv, and no groups, so any two merge. */
function normalize(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', src.getAttribute('position').clone());
  if (src.index) g.setIndex(src.index.clone());
  if (src.getAttribute('normal')) g.setAttribute('normal', src.getAttribute('normal').clone());
  else g.computeVertexNormals();
  const n = g.getAttribute('position').count;
  g.setAttribute('uv', src.getAttribute('uv') ? src.getAttribute('uv').clone() : new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

function flipWinding(g: THREE.BufferGeometry): void {
  if (g.index) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    g.index.needsUpdate = true;
    return;
  }
  for (const name of ['position', 'normal', 'uv']) {
    const at = g.getAttribute(name) as THREE.BufferAttribute;
    const s = at.itemSize;
    const a = at.array;
    for (let i = 0; i < at.count; i += 3) {
      for (let k = 0; k < s; k++) {
        const t = a[(i + 1) * s + k];
        a[(i + 1) * s + k] = a[(i + 2) * s + k];
        a[(i + 2) * s + k] = t;
      }
    }
  }
}

/** A tube through `pts`, tapering from `r` to `rEnd` (tails, tentacles, horns, hoses). */
export function tube(parent: THREE.Object3D, pts: V3[], r: number, mat: THREE.Material, rEnd = r, radial = 8, closed = false): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed);
  const seg = Math.max(6, pts.length * 5);
  const geo = new THREE.TubeGeometry(curve, seg, r, radial, closed);
  if (rEnd !== r) {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const c = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.floor(i / (radial + 1)) / seg;
      curve.getPoint(t, c);
      p.fromBufferAttribute(pos, i).sub(c).multiplyScalar((r + (rEnd - r) * t) / r).add(c);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    geo.computeVertexNormals();
  }
  return put(parent, geo, mat, [0, 0, 0]);
}

/** A cone from `base` pointing at `tip` (spikes, claws, teeth, spines). */
export function spike(parent: THREE.Object3D, base: V3, tip: V3, r: number, mat: THREE.Material, seg = 5): THREE.Mesh {
  const a = new THREE.Vector3(...base);
  const d = new THREE.Vector3(...tip).sub(a);
  const m = put(parent, cone(r, d.length(), seg), mat, [0, 0, 0]);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}

/**
 * Studs over an ellipsoid (scales, beads, warts, curls, suckers): `count`
 * spread evenly (a golden spiral) over the ellipsoid at `at` with radii
 * `radii`, each a squashed ball of radius `size` sat on the surface; `keep`
 * filters by the unit direction. Low-poly: they're merged by `bake`.
 */
export function studs(parent: THREE.Object3D, mat: THREE.Material | ((k: number) => THREE.Material), at: V3, radii: V3, count: number, size: number, keep?: (x: number, y: number, z: number) => boolean, flat = 0.55, seg: [number, number] = [6, 4]): void {
  const geo = new THREE.SphereGeometry(size, seg[0], seg[1]);
  const n = new THREE.Vector3();
  for (let k = 0; k < count; k++) {
    const y = 1 - (2 * (k + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    const a = k * 2.399963;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (keep && !keep(x, y, z)) continue;
    const m = put(parent, geo, typeof mat === 'function' ? mat(k) : mat, [at[0] + x * radii[0], at[1] + y * radii[1], at[2] + z * radii[2]], [0, 0, 0], [1, flat, 1]);
    // Squashed along the surface normal.
    n.set(x / radii[0], y / radii[1], z / radii[2]).normalize();
    m.quaternion.setFromUnitVectors(UP, n);
  }
}

/** Rivets (or nails, or bolts) in a line from `a` to `b`, `n` of them. */
export function rivets(parent: THREE.Object3D, mat: THREE.Material, a: V3, b: V3, n: number, r = 0.018): void {
  const geo = new THREE.SphereGeometry(r, 6, 4);
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0.5 : k / (n - 1);
    put(parent, geo, mat, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
}

/** A disc lying in the plane facing `normal` (a sucker, a lens, a badge). */
export function disc(parent: THREE.Object3D, at: V3, normal: V3, r: number, mat: THREE.Material, seg = 10): THREE.Mesh {
  const m = put(parent, new THREE.CircleGeometry(r, seg), mat, at);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...normal).normalize());
  return m;
}

/** A canvas texture of at most 256 px, drawn once by `draw` and cached under `key`. */
const decals = new Map<string, THREE.CanvasTexture>();
export function decal(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  let t = decals.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  decals.set(key, t);
  return t;
}

/** A flat picture facing +z (a plate, a badge, a sticker), `w` by `h`. */
export function sticker(parent: THREE.Object3D, map: THREE.Texture, at: V3, rot: V3, w: number, h: number, doubleSided = false): THREE.Mesh {
  const mat = new THREE.MeshPhongMaterial({ map, transparent: true, shininess: 30, specular: 0x222222, polygonOffset: true, polygonOffsetFactor: -2, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide });
  return put(parent, new THREE.PlaneGeometry(w, h), mat, at, rot);
}

/** `#rrggbb` for a canvas. */
export const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** A small flame: a glowing teardrop with a hot core, its base at the origin of `parent`. */
export function flame(parent: THREE.Object3D, mats: Mats, size: number, outer = 0xff8a1a, inner = 0xfff0a0): void {
  put(parent, ball(size, 8, 6), mats.glow(outer), [0, size * 0.9, 0], [0, 0, 0], [0.7, 1.4, 0.7]);
  put(parent, cone(size * 0.55, size * 1.6, 8), mats.glow(outer), [0, size * 2.0, 0]);
  put(parent, ball(size * 0.5, 8, 6), mats.glow(inner), [0, size * 0.8, 0], [0, 0, 0], [0.7, 1.3, 0.7]);
}

/** A candle: a wax stick with drips down it, a black wick, a flame on a group that can flicker (returned). */
export function candle(parent: THREE.Object3D, mats: Mats, at: V3, h: number, r: number, wax: number): THREE.Group {
  const w = mats.matte(wax, { shininess: 40, specular: 0x333333 });
  put(parent, cyl(r, r * 1.05, h, 10), w, [at[0], at[1] + h / 2, at[2]]);
  for (let k = 0; k < 4; k++) {
    const a = k * 1.7 + 0.4;
    const len = h * (0.25 + (k % 3) * 0.15);
    put(parent, cyl(r * 0.22, r * 0.3, len, 5), w, [at[0] + Math.cos(a) * r, at[1] + h - len / 2, at[2] + Math.sin(a) * r]);
    put(parent, ball(r * 0.3, 5, 4), w, [at[0] + Math.cos(a) * r, at[1] + h - len, at[2] + Math.sin(a) * r]);
  }
  put(parent, cyl(r * 1.02, r * 1.02, r * 0.4, 10), w, [at[0], at[1] + h - r * 0.1, at[2]], [0, 0, 0], [1, 1, 1]);
  put(parent, cyl(r * 0.08, r * 0.08, r * 0.6, 4), mats.matte(0x111111), [at[0], at[1] + h + r * 0.25, at[2]]);
  const fl = new THREE.Group();
  fl.position.set(at[0], at[1] + h + r * 0.35, at[2]);
  flame(fl, mats, r * 0.7);
  parent.add(fl);
  return fl;
}

/** A pivot whose `rotation.z` the kart view swings as a flapper: `amp` (as `userData.side`) scales the swing. Its local z is pointed along `axis`. */
export function swinger(parent: THREE.Object3D, at: V3, axis: 'x' | 'y' | 'z', amp: number): { pivot: THREE.Group; inner: THREE.Group } {
  const pivot = new THREE.Group();
  pivot.position.set(...at);
  pivot.userData.side = amp;
  // Turn the pivot so its z runs along `axis`, and the inner group back so what's built in it is the right way up.
  const inner = new THREE.Group();
  if (axis === 'y') {
    pivot.rotation.x = -Math.PI / 2;
    inner.rotation.x = Math.PI / 2;
  } else if (axis === 'x') {
    pivot.rotation.y = Math.PI / 2;
    inner.rotation.y = -Math.PI / 2;
  }
  pivot.add(inner);
  parent.add(pivot);
  return { pivot, inner };
}
