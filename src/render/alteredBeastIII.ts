import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { FANG_HEIGHT, FANG_STAGES, fangBite, type HazardPose } from '../items/hazards';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import * as tex from './textures';

/**
 * Altered Beast III's world, the altered world the beast takes you to:
 * flesh for ground, veined and mottled, fur growing through it in patches;
 * the road the beast's own fur, combed; walls of muscle, and low walls of
 * gum lined with teeth; the beast's DNA standing up out of the flesh in
 * twisting towers, fangs, tufts of hair, claws, eyes on stalks that turn
 * to look at you ("I see you"), cells with their nuclei; under a bruised
 * sky where angels hang weeping. The start is a jaw of nine fangs over the
 * road; the base pairs lie across between the lap's two strands.
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type Animated = ((time: number) => void)[];
type RGB = [number, number, number];

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const glossy = (color: number, shininess = 90) => new THREE.MeshPhongMaterial({ color, shininess, specular: 0xffffff });
const glowing = (color: number, intensity = 0.8) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: intensity });
const additive = (map: THREE.Texture, color: number) => new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false });

/** Made once and shared: the textures go on hundreds of meshes. */
function once<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
}

/** The four bases, paired as DNA pairs them: adenine with thymine, guanine with cytosine. */
export const BASES = { A: 0xff4a5a, T: 0x40b8ff, G: 0x58e070, C: 0xffd040 } as const;
const PAIRS: [number, number][] = [
  [BASES.A, BASES.T],
  [BASES.T, BASES.A],
  [BASES.G, BASES.C],
  [BASES.C, BASES.G],
];
const PEARL = 0xf6f0e2;
const GUM = 0xd8687a;
const FLESH = 0xb85a66;
const FUR = 0x7a4a26;

// ---- Textures --------------------------------------------------------------

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = tex.textureAnisotropy();
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const css = ([r, g, b]: RGB, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Draws `draw` at (x, y) and wherever it would wrap round the edges of a `size` tile. */
function wrapped(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void): void {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      if (x + ox < -r || x + ox > size + r || y + oy < -r || y + oy > size + r) continue;
      draw(x + ox, y + oy);
    }
  }
}

/** Tileable smooth noise, 0..1, a few octaves of it. */
function noise(size: number, period: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const p = period << o;
    const rand = seededRandom(seed + o * 101);
    const grid = Array.from({ length: p * p }, rand);
    const cell = size / p;
    for (let y = 0; y < size; y++) {
      const gy = y / cell;
      const y0 = Math.floor(gy) % p;
      const y1 = (y0 + 1) % p;
      let ty = gy - Math.floor(gy);
      ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const gx = x / cell;
        const x0 = Math.floor(gx) % p;
        const x1 = (x0 + 1) % p;
        let tx = gx - Math.floor(gx);
        tx = tx * tx * (3 - 2 * tx);
        const a = grid[y0 * p + x0] + (grid[y0 * p + x1] - grid[y0 * p + x0]) * tx;
        const b = grid[y1 * p + x0] + (grid[y1 * p + x1] - grid[y1 * p + x0]) * tx;
        out[y * size + x] += (a + (b - a) * ty) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Fills a canvas pixel by pixel. */
function paint(ctx: CanvasRenderingContext2D, w: number, h: number, fn: (x: number, y: number, i: number) => RGB): void {
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const [r, g, b] = fn(x, y, i);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** A hair: a stroke from (x, y) `len` long, leaning `a` off straight down the tile, curling a little toward its tip. */
function hair(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, a: number, curl: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + Math.sin(a) * len * 0.5, y + Math.cos(a) * len * 0.5, x + Math.sin(a + curl) * len, y + Math.cos(a + curl) * len);
  ctx.stroke();
}

/**
 * The road: the beast's fur, combed down the road in waves, thick and
 * brown, darker at the roots and tawny at the tips, a parting of darker
 * fur here and there where the comb has been.
 */
export function furRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = noise(S, 4, 3, 3101);
  // The undercoat.
  paint(ctx, S, S, (_x, _y, i) => mix([44, 24, 12], [96, 58, 30], n[i]));
  const rand = seededRandom(3102);
  const flow = noise(S, 2, 2, 3103);
  // Layer on layer of hairs, the last ones lightest: they lie on top.
  for (let layer = 0; layer < 3; layer++) {
    const count = [2600, 2200, 1400][layer];
    for (let k = 0; k < count; k++) {
      const x = rand() * S;
      const y = rand() * S;
      const i = Math.floor(y) * S + Math.floor(x);
      const a = (flow[i] - 0.5) * 1.1;
      const len = 10 + rand() * 14;
      const lift = layer * 0.3 + n[i] * 0.5 + rand() * 0.3;
      const col = mix([58, 32, 16], [206, 150, 92], Math.min(1, lift));
      ctx.strokeStyle = css(col, 0.55 + rand() * 0.4);
      ctx.lineWidth = 0.8 + rand() * 1.1;
      const curl = (rand() - 0.5) * 0.5;
      wrapped(S, x, y, len + 2, (wx, wy) => hair(ctx, wx, wy, len, a, curl));
    }
  }
  return finish(c);
}

/**
 * The ground: flesh, pink and mauve and mottled, veins branching through
 * it under the skin and capillaries in red, pores, and the beast's fur
 * growing through in patches.
 */
export function fleshTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = noise(S, 4, 4, 3111);
  const fine = noise(S, 32, 2, 3112);
  paint(ctx, S, S, (_x, _y, i) => {
    const base = mix([132, 52, 66], [214, 132, 132], n[i]);
    return mix(base, [96, 36, 60], Math.max(0, 0.5 - fine[i]) * 0.5);
  });
  const rand = seededRandom(3113);
  // Veins: blue-purple under the skin, branching as they go.
  const vein = (x: number, y: number, a: number, w: number, steps: number) => {
    let px = x;
    let py = y;
    for (let k = 0; k < steps; k++) {
      a += (rand() - 0.5) * 0.5;
      const nx = px + Math.cos(a) * 4;
      const ny = py + Math.sin(a) * 4;
      const width = w * (1 - k / steps) + 0.6;
      wrapped(S, px, py, 8, (wx, wy) => {
        ctx.strokeStyle = css([72, 40, 104], 0.45);
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + nx - px, wy + ny - py);
        ctx.stroke();
      });
      px = nx;
      py = ny;
      if (rand() < 0.04 && w > 1.5) vein(px, py, a + (rand() > 0.5 ? 0.8 : -0.8), w * 0.6, Math.floor(steps * 0.5));
    }
  };
  for (let k = 0; k < 9; k++) vein(rand() * S, rand() * S, rand() * Math.PI * 2, 4, 60 + Math.floor(rand() * 60));
  // Capillaries, fine and red.
  for (let k = 0; k < 90; k++) {
    let x = rand() * S;
    let y = rand() * S;
    let a = rand() * Math.PI * 2;
    ctx.strokeStyle = css([170, 30, 44], 0.35);
    ctx.lineWidth = 0.8;
    for (let s = 0; s < 6; s++) {
      a += (rand() - 0.5) * 1.2;
      const nx = x + Math.cos(a) * 5;
      const ny = y + Math.sin(a) * 5;
      wrapped(S, x, y, 6, (wx, wy) => {
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + nx - x, wy + ny - y);
        ctx.stroke();
      });
      x = nx;
      y = ny;
    }
  }
  // Pores.
  for (let k = 0; k < 900; k++) {
    const x = rand() * S;
    const y = rand() * S;
    ctx.fillStyle = css([70, 20, 34], 0.3);
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + rand() * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fur growing through in patches.
  for (let p = 0; p < 7; p++) {
    const cx = rand() * S;
    const cy = rand() * S;
    const r = 24 + rand() * 40;
    for (let k = 0; k < 260; k++) {
      const d = Math.sqrt(rand()) * r;
      const a = rand() * Math.PI * 2;
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      ctx.strokeStyle = css(mix([50, 28, 14], [150, 100, 60], rand()), 0.8);
      ctx.lineWidth = 1 + rand();
      const len = 6 + rand() * 9;
      const lean = a + (rand() - 0.5) * 0.6 - Math.PI / 2;
      wrapped(S, x, y, len + 2, (wx, wy) => hair(ctx, wx, wy, len, lean, 0.3));
    }
  }
  return finish(c);
}

/** Walls of muscle: deep red fibres running up in bundles, pale sinew between them, a wet sheen. */
export function muscleTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = noise(S, 4, 3, 3121);
  const fine = noise(S, 16, 2, 3122);
  paint(ctx, S, S, (x, _y, i) => {
    // Fibres: fine stripes up the wall, wandering with the noise.
    const f = 0.5 + 0.5 * Math.sin((x / S) * Math.PI * 2 * 40 + n[i] * 14);
    const bundle = Math.abs(Math.sin((x / S) * Math.PI * 2 * 5 + n[i] * 6));
    let col = mix([92, 16, 26], [196, 62, 64], f * 0.6 + fine[i] * 0.4);
    // Sinew where the bundles meet.
    if (bundle < 0.12) col = mix([236, 196, 190], col, bundle / 0.12);
    return col;
  });
  // Glistening.
  const rand = seededRandom(3123);
  for (let k = 0; k < 60; k++) {
    const x = rand() * S;
    const y = rand() * S;
    ctx.strokeStyle = css([255, 220, 220], 0.25);
    ctx.lineWidth = 1.5;
    wrapped(S, x, y, 20, (wx, wy) => {
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + (rand() - 0.5) * 3, wy + 10 + rand() * 10);
      ctx.stroke();
    });
  }
  return finish(c);
}

/**
 * The low walls: gums lined with teeth, "nine white teeth, my gums
 * bequeathed": two teeth to a tile, pearl white and rounded, set in pink
 * gum along the bottom, the dark of a mouth between their tips.
 */
export function teethTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  const mouth = ctx.createLinearGradient(0, 0, 0, H);
  mouth.addColorStop(0, '#1a0408');
  mouth.addColorStop(1, '#4a0c18');
  ctx.fillStyle = mouth;
  ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 2; k++) {
    const x0 = k * (W / 2) + 8;
    const w = W / 2 - 16;
    const top = 18 + k * 6;
    const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    g.addColorStop(0, '#cfc4ae');
    g.addColorStop(0.35, '#fffaf0');
    g.addColorStop(0.7, '#f2ead8');
    g.addColorStop(1, '#b8aa90');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, H);
    ctx.lineTo(x0, top + 20);
    ctx.quadraticCurveTo(x0, top, x0 + w * 0.5, top - 4);
    ctx.quadraticCurveTo(x0 + w, top, x0 + w, top + 20);
    ctx.lineTo(x0 + w, H);
    ctx.closePath();
    ctx.fill();
    // A shine down its face.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(x0 + w * 0.3, top + 10, 5, H * 0.45);
  }
  // The gum along the bottom, scalloped up between the teeth, a wet line along its top.
  ctx.fillStyle = '#c85468';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, H * 0.62);
  for (let k = 0; k <= 2; k++) {
    const x = k * (W / 2);
    ctx.quadraticCurveTo(x - W / 4, H * 0.82, x, H * 0.6);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,190,200,0.7)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.62);
  for (let k = 0; k <= 2; k++) ctx.quadraticCurveTo(k * (W / 2) - W / 4, H * 0.82, k * (W / 2), H * 0.6);
  ctx.stroke();
  const t = finish(c);
  // Along the wall it repeats; up it, it doesn't: over the teeth's tips is the dark of the mouth.
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

const glowTex = once(() => tex.glowTexture());

// ---- Shared shapes ---------------------------------------------------------

/** A fang: pearl, curved back a little, its root in the origin and its point `len` up. */
function fangGeometry(len: number, r: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 10;
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    pts.push(new THREE.Vector2(r * Math.pow(1 - u, 0.8) + 0.02, u * len));
  }
  const g = new THREE.LatheGeometry(pts, 12);
  // Curve it: the further up, the further back.
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setZ(i, pos.getZ(i) - ((y / len) ** 2) * len * 0.22);
  }
  g.computeVertexNormals();
  return g;
}

/** An eye: the white, an iris, a slit of a pupil, all turning together inside `look`; looks along +z. */
function eyeball(r: number, iris: number): { group: THREE.Group; look: THREE.Group } {
  const group = new THREE.Group();
  const look = new THREE.Group();
  const white = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), glossy(0xf4ece0, 120));
  const ring = new THREE.Mesh(new THREE.SphereGeometry(r * 0.52, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhongMaterial({ color: iris, emissive: iris, emissiveIntensity: 0.35, shininess: 140 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.z = r * 0.62;
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.26, 10, 8), new THREE.MeshBasicMaterial({ color: 0x080204 }));
  pupil.scale.set(0.35, 1.2, 0.4);
  pupil.position.z = r * 0.9;
  look.add(white, ring, pupil);
  group.add(look);
  return { group, look };
}

function frameAt(ribbon: Ribbon, s: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x, z: p.z, y: ribbon.heightAt(s), heading: Math.atan2(p.tx, p.tz) };
}

function offRoad(ribbon: Ribbon, s: number, lateral: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x - p.tz * lateral, z: p.z + p.tx * lateral, heading: Math.atan2(p.tx, p.tz) };
}

function pick(rand: () => number, kinds: [number, Feature][]): Feature {
  const total = kinds.reduce((s, [w]) => s + w, 0);
  let r = rand() * total;
  for (const [w, f] of kinds) if ((r -= w) <= 0) return f;
  return kinds[kinds.length - 1][1];
}

function place(t: THREE.Object3D, x: number, z: number, rand: () => number): THREE.Object3D {
  t.position.set(x, 0, z);
  t.rotation.y = rand() * Math.PI * 2;
  return t;
}

const UP = new THREE.Vector3(0, 1, 0);

/** A rod from `a` to `b`, radius `r`. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, radial = 8): THREE.Mesh {
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), radial), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(UP, d.normalize());
  return m;
}

// ---- Scenery -----------------------------------------------------------------

/** The altered world's scenery: DNA towers, fangs, tufts of fur, claws, eyes on stalks, cells. */
export function alteredFeature(animated: Animated): Feature {
  const pearl = glossy(PEARL, 130);
  const gum = glossy(GUM, 70);
  const flesh = glossy(FLESH, 40);
  const claw = glossy(0x14100e, 120);
  const glow = glowTex();
  const strandMats = [glowing(0x7ae8ff, 0.55), glowing(0xd08aff, 0.55)];
  const rungGeo = new THREE.CylinderGeometry(0.22, 0.22, 1, 6);
  const hairGeo = new THREE.ConeGeometry(0.22, 1, 5);
  hairGeo.translate(0, 0.5, 0);
  const hairMat = lambert(0xffffff);
  const furShades = [0x4a2a14, 0x6a3e1e, 0x8a5a30, 0xa87444, 0x3a2010].map((c) => new THREE.Color(c));

  // The beast's DNA, standing up out of the flesh in a twisting tower, its base pairs in their four colours, turning slowly.
  const dna: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 16 + rand() * 24;
    const r = 2.4 + rand() * 1.8;
    const turns = h / 11;
    const helix = (phase: number) =>
      new THREE.CatmullRomCurve3(Array.from({ length: 40 }, (_, k) => {
        const u = k / 39;
        const a = u * turns * Math.PI * 2 + phase;
        return new THREE.Vector3(Math.cos(a) * r, 1 + u * h, Math.sin(a) * r);
      }));
    const spin = new THREE.Group();
    for (const [k, phase] of [0, Math.PI].entries()) spin.add(new THREE.Mesh(new THREE.TubeGeometry(helix(phase), 80, 0.45, 6, false), strandMats[k]));
    const rungs = Math.floor(h / 1.4);
    const bars = new THREE.InstancedMesh(rungGeo, lambert(0xffffff, { emissive: 0x222222 }), rungs * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    for (let k = 0; k < rungs; k++) {
      const u = (k + 0.5) / rungs;
      const a = u * turns * Math.PI * 2;
      const y = 1 + u * h;
      const pair = PAIRS[Math.floor(rand() * 4)];
      for (let side = 0; side < 2; side++) {
        // Half a rung from each strand to the middle, each its own base.
        const a0 = a + side * Math.PI;
        const mid = new THREE.Vector3(Math.cos(a0) * r * 0.5, y, Math.sin(a0) * r * 0.5);
        q.setFromUnitVectors(UP, new THREE.Vector3(Math.cos(a0), 0, Math.sin(a0)));
        m.compose(mid, q, new THREE.Vector3(1, r, 1));
        bars.setMatrixAt(k * 2 + side, m);
        bars.setColorAt(k * 2 + side, col.setHex(pair[side]));
      }
    }
    spin.add(bars);
    t.add(spin);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(r * 1.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), flesh);
    mound.scale.y = 0.5;
    t.add(mound);
    const halo = new THREE.Sprite(additive(glow, 0x9ad8ff));
    halo.scale.set(r * 5, h * 1.1, 1);
    halo.position.y = h * 0.55;
    (halo.material as THREE.SpriteMaterial).opacity = 0.35;
    t.add(halo);
    const ph = rand() * 10;
    const speed = (rand() > 0.5 ? 1 : -1) * (0.2 + rand() * 0.25);
    animated.push((time) => (spin.rotation.y = time * speed + ph));
    return place(t, x, z, rand);
  };
  // A fang, or two or three, jutting out of a mound of gum.
  const fang: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 1 + Math.floor(rand() * 3);
    const size = 5 + rand() * 9;
    const mound = new THREE.Mesh(new THREE.SphereGeometry(size * 0.45, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), gum);
    mound.scale.set(1 + n * 0.3, 0.45, 1);
    t.add(mound);
    for (let k = 0; k < n; k++) {
      const len = size * (0.7 + rand() * 0.5);
      const f = new THREE.Mesh(fangGeometry(len, len * 0.17), pearl);
      f.position.set((k - (n - 1) / 2) * size * 0.4, 0, (rand() - 0.5) * size * 0.2);
      f.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI * 2, (rand() - 0.5) * 0.4);
      t.add(f);
    }
    return place(t, x, z, rand);
  };
  // A tuft of the beast's fur, a clump of long hairs, swaying.
  const tuft: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 26 + Math.floor(rand() * 20);
    const h = 3 + rand() * 5;
    const hairs = new THREE.InstancedMesh(hairGeo, hairMat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const shade = furShades[Math.floor(rand() * furShades.length)];
    const col = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * h * 0.3;
      const lean = 0.15 + (d / (h * 0.3)) * 0.7;
      e.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
      q.setFromEuler(e);
      const len = h * (0.6 + rand() * 0.5);
      m.compose(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), q, new THREE.Vector3(1 + rand() * 0.6, len, 1 + rand() * 0.6));
      hairs.setMatrixAt(k, m);
      hairs.setColorAt(k, col.copy(shade).multiplyScalar(0.75 + rand() * 0.5));
    }
    t.add(hairs);
    const ph = rand() * 10;
    animated.push((time) => {
      hairs.rotation.z = Math.sin(time * 1.3 + ph) * 0.06;
      hairs.rotation.x = Math.sin(time * 0.9 + ph * 2) * 0.05;
    });
    return place(t, x, z, rand);
  };
  // "I see you": an eye on a stalk of flesh, turning to look about.
  const stalk: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 5 + rand() * 7;
    const r = 1.3 + rand() * 1.3;
    const bend = (rand() - 0.5) * 3;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(bend * 0.5, h * 0.5, 0), new THREE.Vector3(bend, h, 0)]);
    t.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, r * 0.32, 8, false), flesh));
    const e = eyeball(r, [0xffb020, 0xe03010, 0x40c060][Math.floor(rand() * 3)]);
    e.group.position.set(bend, h + r * 0.7, 0);
    t.add(e.group);
    const ph = rand() * 10;
    animated.push((time) => {
      e.look.rotation.y = Math.sin(time * 0.5 + ph) * 1.4;
      e.look.rotation.x = -0.2 + Math.sin(time * 0.37 + ph * 2) * 0.3;
    });
    return place(t, x, z, rand);
  };
  // The beast's claws, three curved and black, coming up out of a mound of fur.
  const claws: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const size = 4 + rand() * 5;
    const mound = new THREE.Mesh(new THREE.SphereGeometry(size * 0.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert(FUR));
    mound.scale.set(1.4, 0.5, 1);
    t.add(mound);
    for (let k = -1; k <= 1; k++) {
      const c = new THREE.Mesh(fangGeometry(size * (k === 0 ? 1.1 : 0.9), size * 0.14), claw);
      c.position.set(k * size * 0.35, size * 0.15, 0);
      c.rotation.set(0.5, Math.PI, k * 0.15);
      t.add(c);
    }
    return place(t, x, z, rand);
  };
  // A cell, half sunk in the flesh: its membrane clear and pink, its nucleus dark inside, pulsing.
  const cell: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 4 + rand() * 5;
    const membrane = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshPhongMaterial({ color: 0xff9ab0, transparent: true, opacity: 0.32, shininess: 160, specular: 0xffffff, depthWrite: false }));
    membrane.position.y = r * 0.4;
    const nucleus = new THREE.Mesh(new THREE.SphereGeometry(r * 0.38, 16, 12), glowing(0x8a2aa0, 0.4));
    nucleus.position.set(r * 0.15, r * 0.45, 0);
    const nucleolus = new THREE.Mesh(new THREE.SphereGeometry(r * 0.12, 10, 8), glowing(0xff60d0, 0.8));
    nucleolus.position.set(r * 0.2, r * 0.5, r * 0.1);
    t.add(membrane, nucleus, nucleolus);
    const ph = rand() * 10;
    animated.push((time) => membrane.scale.setScalar(1 + Math.sin(time * 1.6 + ph) * 0.04));
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [2.2, dna],
      [2.6, fang],
      [3, tuft],
      [1.3, stalk],
      [1.2, claws],
      [1, cell],
    ])(x, z, rand);
}

// ---- Landmarks -----------------------------------------------------------------

/**
 * A jaw of nine fangs over the road, the start: an upper jaw of gum across
 * the road with five fangs hanging from it, and the lower jaw's four
 * coming up out of the gums either side; the beast's eyes glowing over it,
 * watching you come ("I see you"), and its breath chewing slowly.
 */
export function fangGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const gum = glossy(GUM, 70);
  const pearl = glossy(PEARL, 130);
  const fur = lambert(FUR);
  const H = 15;
  // The lower jaw: a ridge of gum either side, two fangs up out of each.
  for (const side of [-1, 1]) {
    const ridge = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 10, 6, 12), gum);
    ridge.rotation.x = Math.PI / 2;
    ridge.position.set(side * (hw + 2.6), 1.2, 0);
    g.add(ridge);
    for (let k = 0; k < 2; k++) {
      const fg = new THREE.Mesh(fangGeometry(7 - k * 1.5, 1.1), pearl);
      fg.position.set(side * (hw + 1.6 - k * 0.2), 2.6, (k - 0.5) * 6);
      fg.rotation.set(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, side * 0.2);
      g.add(fg);
    }
    // Pillars of muscle, the jaw's hinge, up to the upper jaw.
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.8, H, 12), lambert(0x9a3040));
    hinge.position.set(side * (hw + 5.5), H / 2, 0);
    g.add(hinge);
  }
  // The upper jaw: a beam of gum across the road, five fangs hanging from it, fur over it.
  const upper = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CapsuleGeometry(2.4, hw * 2 + 8, 6, 14), gum);
  beam.rotation.z = Math.PI / 2;
  upper.add(beam);
  for (let k = 0; k < 5; k++) {
    const x = (k - 2) * hw * 0.42;
    const len = 6 + (k % 2 ? 0 : 2) + (k === 2 ? 1 : 0);
    const fg = new THREE.Mesh(fangGeometry(len, 1.3), pearl);
    fg.rotation.x = Math.PI;
    fg.position.set(x, -1.2, 0);
    upper.add(fg);
  }
  const pelt = new THREE.Mesh(new THREE.CapsuleGeometry(2.8, hw * 2 + 10, 6, 14), fur);
  pelt.rotation.z = Math.PI / 2;
  pelt.scale.set(1, 1, 0.9);
  pelt.position.set(0, 2.4, 0.6);
  upper.add(pelt);
  // The beast's eyes over it, glowing, looking down the road at you.
  const eyes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const e = eyeball(2.2, 0xffa010);
    e.group.position.set(side * hw * 0.35, 6.2, -0.6);
    e.group.rotation.y = Math.PI;
    upper.add(e.group);
    eyes.push(e.look);
  }
  const brow = new THREE.Mesh(new THREE.BoxGeometry(hw * 1.3, 1.4, 2.4), fur);
  brow.position.set(0, 8.4, -0.4);
  brow.rotation.z = 0;
  upper.add(brow);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(hw * 1.1, hw * 0.275), new THREE.MeshBasicMaterial({ map: tex.billboardTexture('ALTERED BEAST', '#3a0a18', '#fff0e0'), side: THREE.DoubleSide }));
  sign.position.set(0, 2.2, -3.2);
  sign.rotation.y = Math.PI;
  upper.add(sign);
  upper.position.y = H;
  g.add(upper);
  animated.push((time) => {
    // Chewing, slowly; the eyes on you.
    upper.position.y = H + Math.sin(time * 1.1) * 0.5;
    for (const [k, e] of eyes.entries()) e.rotation.y = Math.sin(time * 0.6 + k * 0.3) * 0.25;
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * "Look to the sky and I see angels weep": three angels high over the
 * flesh, robed and winged and haloed, their hands to their faces, their
 * tears falling in streams all the way down, a pale light round them.
 */
export function weepingAngels(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const robe = lambert(0xf4ecf0, { emissive: 0x8a7a90, emissiveIntensity: 0.4 });
  const skin = lambert(0xf0d0c0, { emissive: 0x6a4a40, emissiveIntensity: 0.3 });
  const wingMat = lambert(0xffffff, { emissive: 0xa098b0, emissiveIntensity: 0.5, side: THREE.DoubleSide });
  const halo = new THREE.MeshBasicMaterial({ color: 0xffe080 });
  const glow = glowTex();
  // A wing: a curved fan of long feathers.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.bezierCurveTo(4, 6, 12, 9, 18, 7);
  for (let k = 0; k < 6; k++) {
    const u = k / 5;
    wingShape.lineTo(18 - u * 14, 7 - u * 15 - (k % 2) * 1.5);
  }
  wingShape.lineTo(0, 0);
  const wingGeo = new THREE.ShapeGeometry(wingShape);
  const tearTex = glow;
  const figures: { fig: THREE.Group; wings: THREE.Object3D[]; y: number; tears: THREE.Sprite[] }[] = [];
  const spots: [number, number, number, number][] = [
    [-34, 82, 0, 1],
    [0, 96, -14, 1.15],
    [34, 78, 6, 0.95],
  ];
  for (const [x, y, z, size] of spots) {
    const fig = new THREE.Group();
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(5, 16, 16, 1, true), robe);
    skirt.position.y = -2;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 7, 12), robe);
    body.position.y = 7;
    const head = new THREE.Mesh(new THREE.SphereGeometry(2.1, 16, 12), skin);
    head.position.y = 12.4;
    // Bowed, weeping into its hands.
    head.rotation.x = 0.4;
    fig.add(skirt, body, head);
    for (const side of [-1, 1]) {
      const arm = rod(new THREE.Vector3(side * 2.4, 9.5, 0), new THREE.Vector3(side * 0.9, 11.8, 1.9), 0.75, robe);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), skin);
      hand.position.set(side * 0.8, 12.2, 2.1);
      fig.add(arm, hand);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.3, 8, 28), halo);
    ring.rotation.x = Math.PI / 2 - 0.3;
    ring.position.set(0, 15.4, -0.4);
    fig.add(ring);
    const wings: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(side * 1.2, 10, -1.6);
      const w = new THREE.Mesh(wingGeo, wingMat);
      w.scale.set(side, 1, 1);
      hinge.add(w);
      fig.add(hinge);
      wings.push(hinge);
    }
    const aura = new THREE.Sprite(additive(glow, 0xfff0d0));
    aura.scale.set(46, 46, 1);
    aura.position.y = 8;
    (aura.material as THREE.SpriteMaterial).opacity = 0.45;
    fig.add(aura);
    fig.scale.setScalar(size * 1.6);
    fig.position.set(x, y, z);
    g.add(fig);
    // Their tears: streams of drops falling from the hands all the way down.
    const tears: THREE.Sprite[] = [];
    for (let k = 0; k < 28; k++) {
      const drop = new THREE.Sprite(additive(tearTex, 0xa8e0ff));
      drop.scale.setScalar(1.6);
      g.add(drop);
      tears.push(drop);
    }
    figures.push({ fig, wings, y, tears });
  }
  animated.push((time) => {
    for (const [k, a] of figures.entries()) {
      a.fig.position.y = a.y + Math.sin(time * 0.5 + k * 2) * 2.5;
      for (const [w, hinge] of a.wings.entries()) hinge.rotation.y = (w ? -1 : 1) * (0.3 + Math.sin(time * 0.8 + k) * 0.18);
      // Falling from the hands, faster as they go, to the ground.
      const sx = a.fig.position.x;
      const sy = a.fig.position.y + 12 * a.fig.scale.y;
      const sz = a.fig.position.z + 2.5 * a.fig.scale.z;
      a.tears.forEach((d, i) => {
        const u = (time * 0.35 + i / a.tears.length + k * 0.13) % 1;
        d.position.set(sx + ((i % 2) - 0.5) * 2.4 + Math.sin(i * 3.1) * u * 3, sy * (1 - u * u), sz + Math.cos(i * 2.3) * u * 3);
      });
    }
  });
  g.position.set(at.x, 0, at.z);
  // Facing the road.
  g.rotation.y = at.heading + (lateral > 0 ? -Math.PI / 2 : Math.PI / 2);
  return g;
}

/**
 * A base pair between the lap's two strands: a rung from the edge of the
 * road at `s` across to the edge of the road at `to`, two bases meeting in
 * the middle (adenine with thymine, guanine with cytosine), a bead of the
 * backbone at either end and the bond between them glowing.
 */
export function basePair(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const a = pointAt(ribbon.spline, s);
  const b = pointAt(ribbon.spline, to);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  // Out from each road's edge (past its wall), whichever way the rung leaves it.
  const out = (p: { tx: number; tz: number }, s0: number, dir: number) => {
    const across = Math.abs(ux * -p.tz + uz * p.tx) * dir;
    return Math.min((ribbon.halfWidthAtS(s0) + 3) / Math.max(0.3, Math.abs(across)), len * 0.3);
  };
  const da = out(a, s, 1);
  const db = out(b, to, 1);
  const ya = Math.max(ribbon.heightAt(s), 0) + 1.6;
  const yb = Math.max(ribbon.heightAt(to), 0) + 1.6;
  const pa = new THREE.Vector3(a.x + ux * da, ya, a.z + uz * da);
  const pb = new THREE.Vector3(b.x - ux * db, yb, b.z - uz * db);
  const mid = pa.clone().lerp(pb, 0.5);
  const pair = PAIRS[Math.floor(Math.abs(Math.sin(s * 12.9898) * 43758.5453)) % 4];
  const gap = pb.clone().sub(pa).normalize();
  g.add(rod(pa, mid.clone().addScaledVector(gap, -0.8), 1.3, glossy(pair[0], 60), 10));
  g.add(rod(mid.clone().addScaledVector(gap, 0.8), pb, 1.3, glossy(pair[1], 60), 10));
  const bead = glossy(0xe8e0f0, 100);
  for (const p of [pa, pb]) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 10), bead);
    ball.position.copy(p);
    g.add(ball);
  }
  // The bond: two glowing beads in the gap between the bases.
  const bond = new THREE.Sprite(additive(glowTex(), 0xffffff));
  bond.position.copy(mid);
  bond.scale.setScalar(5);
  g.add(bond);
  const ph = s * 0.01;
  animated.push((time) => bond.scale.setScalar(4 + Math.sin(time * 3 + ph) * 1.2));
  return g;
}

// ---- The jaws ----------------------------------------------------------------

/** The upper jaw's fangs and the lower's, across the road as a share of its half-width: five down, four up between them. */
const UPPER = [-0.8, -0.4, 0, 0.4, 0.8];
const LOWER = [-0.6, -0.2, 0.2, 0.6];
const UPPER_LEN = 4.6;
const LOWER_LEN = 3.4;

/**
 * A jaw across the road for the fangs hazard: a beam of gum spanning it
 * with five fangs hanging, four fangs coming up out of slits in the road
 * between them, columns of gum either side as its hinge, and drool. Adds
 * them to `obj` and returns the parts, for HazardsView to pose each frame.
 */
export function fangParts(obj: THREE.Object3D, radius: number): THREE.Object3D[] {
  const gum = glossy(GUM, 80);
  const pearl = glossy(PEARL, 140);
  const upper = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, radius * 2 + 2, 6, 12), gum);
  beam.rotation.z = Math.PI / 2;
  beam.position.y = 1.2;
  upper.add(beam);
  const fur = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, radius * 2 + 2, 6, 12), lambert(FUR));
  fur.rotation.z = Math.PI / 2;
  fur.position.y = 2.6;
  upper.add(fur);
  for (const x of UPPER) {
    const f = new THREE.Mesh(fangGeometry(UPPER_LEN, 0.95), pearl);
    f.rotation.x = Math.PI;
    f.position.set(x * radius, 0.4, 0);
    upper.add(f);
  }
  const lower = new THREE.Group();
  for (const x of LOWER) {
    const f = new THREE.Mesh(fangGeometry(LOWER_LEN, 0.85), pearl);
    f.position.x = x * radius;
    lower.add(f);
  }
  // The slits in the road they come up through.
  const slits = new THREE.Group();
  const slitMat = new THREE.MeshBasicMaterial({ color: 0x2a0408, polygonOffset: true, polygonOffsetFactor: -4 });
  for (const x of LOWER) {
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), slitMat);
    slit.rotation.x = -Math.PI / 2;
    slit.position.set(x * radius, 0.08, 0);
    slits.add(slit);
  }
  const hinges: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 1, 10), gum);
    h.position.x = side * (radius + 1.6);
    hinges.push(h);
  }
  const drool = new THREE.MeshPhongMaterial({ color: 0xe8f4f0, transparent: true, opacity: 0.7, shininess: 200, specular: 0xffffff });
  const drops: THREE.Mesh[] = UPPER.map(() => new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), drool));
  const parts: THREE.Object3D[] = [upper, lower, slits, ...hinges, ...drops];
  for (const o of parts) obj.add(o);
  return parts;
}

/**
 * Poses a jaw for a fangs pose: up and wide open, baring (creeping
 * shut, drooling), snapped shut with the fangs meeting at the road, and
 * opening again.
 */
export function poseFangs(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  obj.rotation.y = p.heading;
  const [upper, lower, , hingeL, hingeR, ...drops] = parts;
  const bite = fangBite(p.phase);
  // Wide open, the upper fangs' tips are FANG_HEIGHT over the road; shut, they're down at it.
  const top = FANG_HEIGHT + UPPER_LEN - 0.4;
  const y = top - (top - UPPER_LEN - 0.2) * bite;
  upper.position.y = y + (p.active ? Math.sin(elapsed * 40) * 0.05 : 0);
  lower.position.y = -LOWER_LEN - 0.2 + (LOWER_LEN + 0.2) * bite;
  lower.visible = bite > 0.01;
  for (const h of [hingeL, hingeR]) {
    h.scale.y = y + 1.2;
    h.position.y = (y + 1.2) / 2;
  }
  // Drool off the upper fangs while it bares them.
  const baring = p.phase >= FANG_STAGES.bare && p.phase < FANG_STAGES.snap;
  drops.forEach((d, k) => {
    d.visible = baring;
    if (!baring) return;
    const u = (elapsed * 0.9 + k * 0.29) % 1;
    d.position.set(UPPER[k] * p.radius * 0.96, y - UPPER_LEN * 0.9 - u * u * (y - UPPER_LEN), 0);
  });
}
