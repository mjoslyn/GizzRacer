import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import * as tex from './textures';

/**
 * God Is Calling Me Back Home's world (the Float Along – Fill Your Lungs
 * Cup): an Australian suburb on a hill at Christmas, high summer at dusk.
 * Its textures (a street's bitumen with a white line down it, a dry summer
 * lawn, the back fences, white pickets, weatherboards and corrugated iron),
 * its scenery (weatherboard houses strung with fairy lights, gum trees and
 * jacarandas, inflatable Santas, Hills Hoists), its landmarks (the arch of
 * light at the start, and the house on the top of the hill with Santa on its
 * roof, his sack over his shoulder and an axe in his hand, light pouring down
 * on it), and Santa and his presents for the hazard.
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type Animated = ((time: number) => void)[];
type RGB = [number, number, number];

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const additive = (map: THREE.Texture, color: number) => new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false });
const glowing = (color: number, intensity = 0.8) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: intensity, flatShading: true });

/** Made once and shared: the textures go on hundreds of meshes. */
function once<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
}
const glowTex = once(() => tex.glowTexture());
/** The anisotropy textures.ts gives its own, read off a tiny one of them. */
const anisotropy = once(() => tex.glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 2).anisotropy);

// ---- Textures -------------------------------------------------------------------

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Tileable value noise over `period` cells, a few octaves of it, roughly 0..1. */
function noise(size: number, period: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const p = period << o;
    const rand = seededRandom(seed + o * 101);
    const grid = Float32Array.from({ length: p * p }, () => rand());
    const cell = size / p;
    for (let y = 0; y < size; y++) {
      const gy = y / cell;
      const y0 = Math.floor(gy) % p;
      const y1 = (y0 + 1) % p;
      const ty = (gy % 1) * (gy % 1) * (3 - 2 * (gy % 1));
      for (let x = 0; x < size; x++) {
        const gx = x / cell;
        const x0 = Math.floor(gx) % p;
        const x1 = (x0 + 1) % p;
        const tx = (gx % 1) * (gx % 1) * (3 - 2 * (gx % 1));
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

/** Fills a canvas from a per-pixel colour. */
function paint(ctx: CanvasRenderingContext2D, w: number, h: number, fn: (x: number, y: number, i: number) => RGB): void {
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const [r, g, b] = fn(x, y, i);
      img.data.set([r, g, b, 255], i * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * God Is Calling Me Back Home's road: a suburban street's bitumen, grey
 * aggregate in black, tar snakes along its cracks, a patch or two, and a
 * dashed white line down the middle. The road's texture repeats twice
 * across it, so the line at its edge runs down the road's middle.
 */
export function bitumenTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = noise(S, 8, 4, 2101);
  const patch = noise(S, 2, 2, 2102);
  const rand = seededRandom(2103);
  paint(ctx, S, S, (_x, _y, i) => {
    let col = mix([40, 40, 44], [70, 70, 74], n[i]);
    // Aggregate: grains of grey stone in the black.
    if (rand() < 0.08) col = mix(col, [140, 138, 132], 0.3 + rand() * 0.5);
    // A patch where the council dug it up and filled it in again, darker and newer.
    if (patch[i] > 0.68) col = mix(col, [26, 26, 30], 0.6);
    return col;
  });
  // Tar snakes: black crack sealant, wriggling along the road.
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(16,16,18,0.6)';
  for (let k = 0; k < 3; k++) {
    let x = 30 + rand() * (S - 60);
    let y = rand() * S;
    ctx.lineWidth = 1.5 + rand() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 8; j++) {
      x += (rand() - 0.5) * 24;
      y += 10 + rand() * 14;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // The dashed white line down the middle (the texture's edge): two dashes a tile, worn.
  ctx.fillStyle = 'rgba(236,236,226,0.92)';
  for (const y0 of [0, S / 2]) {
    ctx.fillRect(0, y0, 3, S / 4);
    ctx.fillRect(S - 3, y0, 3, S / 4);
  }
  return finish(c);
}

/** The suburb's lawns in high summer: green where the sprinklers reach, burnt yellow where they don't, clover in the green. */
export function lawnTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = noise(S, 6, 5, 2111);
  const dry = noise(S, 3, 3, 2112);
  const rand = seededRandom(2113);
  paint(ctx, S, S, (_x, _y, i) => {
    const green = mix([62, 96, 36], [112, 140, 54], n[i]);
    const burnt = mix([150, 136, 70], [196, 176, 104], n[i]);
    let col = mix(green, burnt, Math.min(1, Math.max(0, (dry[i] - 0.4) * 3)));
    if (rand() < 0.04) col = mix(col, [40, 70, 26], 0.5);
    return col;
  });
  return finish(c);
}

/** The back fences: grey palings, weathered, nailed to two rails, the odd one newer and paler. */
export function palingTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = noise(S, 8, 3, 2121);
  const rand = seededRandom(2122);
  const tone = Array.from({ length: S / 8 }, () => 0.75 + rand() * 0.4);
  paint(ctx, S, S, (x, y, i) => {
    const k = Math.floor(x / 8);
    if (x % 8 === 0) return [34, 30, 26];
    // The grain runs up the paling.
    const grain = 0.9 + 0.1 * Math.sin(y * 0.4 + k * 7 + n[i] * 6);
    const base = mix([116, 104, 88], [160, 148, 128], n[i]);
    const f = tone[k] * grain;
    return [base[0] * f, base[1] * f, base[2] * f];
  });
  // The rails' shadow and the nails.
  for (const y of [S * 0.2, S * 0.75]) {
    ctx.fillStyle = 'rgba(20,16,12,0.35)';
    ctx.fillRect(0, y, S, 6);
    ctx.fillStyle = 'rgba(40,40,44,0.9)';
    for (let x = 4; x < S; x += 8) ctx.fillRect(x - 1, y - 3, 2, 2);
  }
  return finish(c);
}

/** A white picket fence in front of a hedge: the low walls along the road. */
export function picketTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  const hedge = noise(W, 8, 3, 2131);
  paint(ctx, W, H, (x, y) => mix([26, 60, 30], [60, 110, 50], hedge[(y % W) * W + x]));
  ctx.fillStyle = '#f4f2ea';
  for (let x = 4; x < W; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x, 22);
    ctx.lineTo(x + 5, 8);
    ctx.lineTo(x + 10, 22);
    ctx.lineTo(x + 10, H);
    ctx.fill();
  }
  ctx.fillStyle = '#e4e0d4';
  ctx.fillRect(0, 40, W, 8);
  ctx.fillRect(0, 96, W, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(0, 48, W, 3);
  ctx.fillRect(0, 104, W, 3);
  return finish(c);
}

/** Weatherboards, in greys for a material's colour to tint: a board's shadow under each lap. */
export function weatherboardTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const n = noise(S, 4, 2, 2141);
  paint(ctx, S, S, (_x, y, i) => {
    const lap = y % 16;
    const v = lap > 13 ? 150 : 225 + n[i] * 30 - lap * 1.2;
    return [v, v, v];
  });
  return finish(c);
}

/** Corrugated iron for the roofs, in greys for a material's colour to tint. */
export function corrugatedIronTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const n = noise(S, 4, 2, 2151);
  paint(ctx, S, S, (x, _y, i) => {
    const v = 170 + 60 * Math.sin((x / S) * Math.PI * 16) + n[i] * 25;
    return [v, v, v];
  });
  return finish(c);
}

const weatherTex = once(weatherboardTexture);
const ironTex = once(corrugatedIronTexture);

// ---- Shared pieces ----------------------------------------------------------------

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

function frameAt(ribbon: Ribbon, s: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x, z: p.z, y: ribbon.heightAt(s), heading: Math.atan2(p.tx, p.tz) };
}

/** Where a landmark `lateral` metres off the road at `s` stands. */
function offRoad(ribbon: Ribbon, s: number, lateral: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x - p.tz * lateral, z: p.z + p.tx * lateral, heading: Math.atan2(p.tx, p.tz) };
}

/** A sign over the road, facing the karts coming. */
function sign(g: THREE.Group, text: string, bg: string, fg: string, width: number, y: number): void {
  const map = tex.billboardTexture(text, bg, fg);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.25), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
  m.position.y = y;
  m.rotation.y = Math.PI;
  g.add(m);
}

/** Fairy lights in Christmas colours: a material for each, twinkling in turn, shared by every string of them. */
function fairyLights(animated: Animated): THREE.SpriteMaterial[] {
  const mats = [0xff3030, 0x40ff60, 0x40a0ff, 0xffd040].map((c) => additive(glowTex(), c));
  animated.push((time) => mats.forEach((m, k) => (m.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(time * 2.2 + k * 1.6)))));
  return mats;
}

/** A string of fairy lights from `a` to `b`, sagging a little between bulbs, `n` bulbs. */
function lightString(g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, n: number, mats: THREE.SpriteMaterial[], size = 0.7): void {
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    const bulb = new THREE.Sprite(mats[k % mats.length]);
    bulb.scale.setScalar(size);
    bulb.position.copy(a).lerp(b, u);
    bulb.position.y -= 0.3 * Math.sin(u * Math.PI);
    g.add(bulb);
  }
}

/**
 * A weatherboard house with a hipped roof of corrugated iron, a door and
 * two lit windows, fairy lights round the gutter. Sits at the origin, its
 * front to +z; returns the house and the height of its gutter and ridge.
 */
function weatherboardHouse(w: number, d: number, board: THREE.Material, roof: THREE.Material, lights: THREE.SpriteMaterial[] | null): { group: THREE.Group; eave: number; ridge: number } {
  const g = new THREE.Group();
  const h = 3.2;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), board);
  walls.position.y = h / 2 + 0.4;
  // On stumps, a little off the ground.
  const base = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.4, d * 0.98), lambert(0x6a5a4a));
  base.position.y = 0.2;
  // A hipped roof: a square pyramid turned square to the walls, stretched over them with a little overhang.
  const hipGeo = new THREE.ConeGeometry(1, 2.2, 4, 1);
  hipGeo.rotateY(Math.PI / 4);
  const hip = new THREE.Mesh(hipGeo, roof);
  hip.scale.set((w * 0.56) / Math.SQRT1_2, 1, (d * 0.56) / Math.SQRT1_2);
  hip.position.y = h + 0.4 + 1.1;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.1), lambert(0x7a2a1a));
  door.position.set(0, 1.45, d / 2 + 0.02);
  g.add(walls, base, hip, door);
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), glowing(0xffd890, 0.7));
    win.position.set(side * w * 0.3, 2.3, d / 2 + 0.02);
    g.add(win);
  }
  const eave = h + 0.4;
  if (lights) {
    const y = eave + 0.05;
    const n = Math.round(w / 0.8);
    lightString(g, new THREE.Vector3(-w / 2 - 0.2, y, d / 2 + 0.2), new THREE.Vector3(w / 2 + 0.2, y, d / 2 + 0.2), n, lights);
  }
  return { group: g, eave, ridge: eave + 2.2 };
}

/**
 * Santa: a red suit and a white beard, his sack over one shoulder and an
 * axe in his other hand. Stands on his feet at the origin, about 2 m tall,
 * facing +z; `arm` is the throwing arm, to swing.
 */
export function santaFigure(): { group: THREE.Group; arm: THREE.Group } {
  const g = new THREE.Group();
  const red = lambert(0xd01818);
  const white = lambert(0xf8f4ec);
  const black = lambert(0x1a1414);
  const skin = lambert(0xf0c0a0);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), red);
  body.scale.set(1, 1.15, 0.9);
  body.position.y = 1.05;
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.14, 14), black);
  belt.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), skin);
  head.position.y = 1.85;
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white);
  beard.position.set(0, 1.8, 0.08);
  beard.scale.set(1, 1.5, 0.9);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 12), red);
  hat.position.set(0, 2.25, -0.05);
  hat.rotation.x = -0.3;
  const bobble = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), white);
  bobble.position.set(0, 2.5, -0.18);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.06, 6, 16), white);
  brim.rotation.x = Math.PI / 2;
  brim.position.y = 2.02;
  g.add(body, belt, head, beard, hat, bobble, brim);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.6, 8), black);
    leg.position.set(side * 0.22, 0.3, 0);
    g.add(leg);
  }
  // The sack over his left shoulder.
  const sack = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), lambert(0x8a6a3a));
  sack.scale.set(0.9, 1.1, 0.8);
  sack.position.set(0.55, 1.5, -0.45);
  g.add(sack);
  // His right arm, raised to throw, an axe in the hand of the other.
  const arm = new THREE.Group();
  arm.position.set(-0.55, 1.45, 0);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.7, 8), red);
  sleeve.position.y = 0.35;
  const mitt = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), white);
  mitt.position.y = 0.72;
  arm.add(sleeve, mitt);
  g.add(arm);
  const axe = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), lambert(0x8a5a2a));
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.32), new THREE.MeshPhongMaterial({ color: 0xc8ccd4, shininess: 120 }));
  blade.position.set(0, 0.38, 0.14);
  axe.add(handle, blade);
  axe.position.set(0.6, 0.95, 0.35);
  axe.rotation.x = 0.4;
  g.add(axe);
  return { group: g, arm };
}

/** Wrapping paper and ribbon for the presents: red with gold, green with red, blue with silver, gold with green. */
export const PRESENT_WRAPS: [number, number][] = [
  [0xd02020, 0xffd040],
  [0x20a040, 0xe02020],
  [0x2050d0, 0xe0e8f0],
  [0xe8b030, 0x208040],
];

/**
 * One of Santa's presents, a box `size` across, wrapped, ribboned and
 * bowed, its lid separate so it can come off; sits on its base at the
 * origin. `inside` is the glow of the gift, shown when it's open.
 */
export function presentFigure(size: number, wrap: [number, number]): { group: THREE.Group; lid: THREE.Group; inside: THREE.Sprite } {
  const g = new THREE.Group();
  const paper = new THREE.MeshPhongMaterial({ color: wrap[0], shininess: 60 });
  const ribbon = new THREE.MeshPhongMaterial({ color: wrap[1], shininess: 120, specular: 0xffffff });
  const h = size * 0.8;
  const box = new THREE.Mesh(new THREE.BoxGeometry(size, h, size), paper);
  box.position.y = h / 2;
  g.add(box);
  for (const r of [0, Math.PI / 2]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(size * 0.16, h + 0.02, size + 0.02), ribbon);
    band.position.y = h / 2;
    band.rotation.y = r;
    g.add(band);
  }
  const lid = new THREE.Group();
  lid.position.y = h;
  const top = new THREE.Mesh(new THREE.BoxGeometry(size * 1.06, size * 0.16, size * 1.06), paper);
  top.position.y = size * 0.08;
  lid.add(top);
  for (const r of [0, Math.PI / 2]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(size * 0.16, size * 0.17, size * 1.08), ribbon);
    band.position.y = size * 0.08;
    band.rotation.y = r;
    lid.add(band);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(size * 0.16, size * 0.05, 6, 12), ribbon);
    loop.position.y = size * 0.26;
    loop.rotation.y = r + Math.PI / 4;
    lid.add(loop);
  }
  g.add(lid);
  const inside = new THREE.Sprite(additive(glowTex(), 0xfff0a0));
  inside.scale.setScalar(size * 3);
  inside.position.y = h + size * 0.4;
  g.add(inside);
  return { group: g, lid, inside };
}

// ---- Scenery -----------------------------------------------------------------------

/** God Is Calling Me Back Home: weatherboard houses strung with fairy lights, gum trees, jacarandas in flower, inflatable Santas, Hills Hoists and wheelie bins. */
export function suburbFeature(animated: Animated): Feature {
  const lights = fairyLights(animated);
  const boards = [0xf4ead0, 0xc8dcea, 0xd0e8d0, 0xf0d8c8, 0xffffff].map((c) => new THREE.MeshLambertMaterial({ map: weatherTex(), color: c }));
  const roofs = [0xa83a2a, 0x8a9098, 0x3a5a4a, 0xc8ccd0].map((c) => new THREE.MeshLambertMaterial({ map: ironTex(), color: c, flatShading: true }));
  const bark = lambert(0xe8e0d4);
  const barkDark = lambert(0x8a7a64);
  const gum = lambert(0x6a7a4a, { flatShading: true });
  const jacaranda = lambert(0x8a6ad8, { flatShading: true });
  const red = lambert(0xd81818);
  const white = lambert(0xf8f4ec);
  const steel = new THREE.MeshPhongMaterial({ color: 0xb8bcc4, shininess: 90 });
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const house: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 8 + rand() * 4;
    const d = 7 + rand() * 3;
    const hs = weatherboardHouse(w, d, boards[Math.floor(rand() * boards.length)], roofs[Math.floor(rand() * roofs.length)], rand() < 0.8 ? lights : null);
    t.add(hs.group);
    // Some have Santa up on the roof, waving.
    if (rand() < 0.3) {
      const santa = santaFigure();
      santa.group.position.set(w * 0.2, hs.eave + 0.6, d * 0.25);
      santa.group.scale.setScalar(0.9);
      const ph = rand() * 10;
      animated.push((time) => (santa.arm.rotation.z = -2.4 + Math.sin(time * 3 + ph) * 0.5));
      t.add(santa.group);
    }
    return place(t, x, z, rand);
  };
  const gumTree: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 12 + rand() * 10;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, h, 7), rand() < 0.6 ? bark : barkDark);
    trunk.position.y = h / 2;
    trunk.rotation.z = (rand() - 0.5) * 0.15;
    t.add(trunk);
    // A gum's crown: open and drooping, clumps of grey-green leaves at the ends of the limbs.
    for (let k = 0; k < 5; k++) {
      const c = new THREE.Mesh(blob, gum);
      const a = k * 1.3 + rand();
      c.position.set(Math.cos(a) * (1.5 + rand() * 2), h * (0.75 + rand() * 0.3), Math.sin(a) * (1.5 + rand() * 2));
      c.scale.set(2.4 + rand(), 1.4 + rand() * 0.6, 2.4 + rand());
      t.add(c);
    }
    return place(t, x, z, rand);
  };
  const jacarandaTree: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 6 + rand() * 3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, h, 7), barkDark);
    trunk.position.y = h / 2;
    t.add(trunk);
    // A wide umbrella of purple flowers.
    for (let k = 0; k < 4; k++) {
      const c = new THREE.Mesh(blob, jacaranda);
      const a = k * 1.6;
      c.position.set(Math.cos(a) * 2, h + rand(), Math.sin(a) * 2);
      c.scale.set(3, 1.5, 3);
      t.add(c);
    }
    return place(t, x, z, rand);
  };
  // An inflatable Santa on the front lawn, three storeys of him, swaying in the hot wind.
  const inflatable: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const sway = new THREE.Group();
    const s = 1.6 + rand() * 1.2;
    const body = new THREE.Mesh(blob, red);
    body.scale.set(1.6 * s, 2 * s, 1.4 * s);
    body.position.y = 2 * s;
    const face = new THREE.Mesh(blob, lambert(0xf0c0a0));
    face.scale.setScalar(0.9 * s);
    face.position.y = 4.6 * s;
    const beard = new THREE.Mesh(blob, white);
    beard.scale.set(0.95 * s, 0.8 * s, 0.8 * s);
    beard.position.set(0, 4.1 * s, 0.35 * s);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.9 * s, 1.6 * s, 12), red);
    hat.position.y = 5.9 * s;
    const bobble = new THREE.Mesh(blob, white);
    bobble.scale.setScalar(0.3 * s);
    bobble.position.y = 6.7 * s;
    sway.add(body, face, beard, hat, bobble);
    t.add(sway);
    const ph = rand() * 10;
    animated.push((time) => {
      sway.rotation.z = Math.sin(time * 1.3 + ph) * 0.08;
      sway.rotation.x = Math.sin(time * 0.9 + ph) * 0.05;
    });
    return place(t, x, z, rand);
  };
  // A Hills Hoist in the backyard, turning slowly, the washing out on it.
  const hoist: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), steel);
    pole.position.y = 1.2;
    t.add(pole);
    const head = new THREE.Group();
    head.position.y = 2.3;
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 4), steel);
      arm.rotation.z = Math.PI / 2 - 0.15;
      arm.position.x = 1.2;
      const wrap = new THREE.Group();
      wrap.rotation.y = (k * Math.PI) / 2;
      wrap.add(arm);
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.9), lambert([0xffffff, 0xf0a0b0, 0xa0c8f0][k % 3], { side: THREE.DoubleSide }));
      sheet.position.set(1.4, -0.3, 0);
      wrap.add(sheet);
      head.add(wrap);
    }
    t.add(head);
    const sp = 0.1 + rand() * 0.2;
    animated.push((time) => (head.rotation.y = time * sp));
    return place(t, x, z, rand);
  };
  // A wheelie bin out on the nature strip, red lid and green.
  const bins: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < n; k++) {
      const bin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.8), lambert(0x2a5a34));
      bin.position.set(k * 0.9, 0.55, 0);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.08, 0.85), lambert(k ? 0xe8c820 : 0xc81818));
      lid.position.set(k * 0.9, 1.14, 0);
      t.add(bin, lid);
    }
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [6, house],
      [5, gumTree],
      [2, jacarandaTree],
      [1.5, inflatable],
      [1.5, hoist],
      [1, bins],
    ])(x, z, rand);
}

// ---- Landmarks ---------------------------------------------------------------------

/**
 * The start: an arch of light over the road, pointed like a church
 * window, strung with fairy lights from two white gateposts, light
 * pouring down through it.
 */
export function heavenGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const post = lambert(0xf4f2ea);
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 9, 1.4), post);
    p.position.set(side * (hw + 0.7), 4.5, 0);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.4, 4), post);
    cap.rotation.y = Math.PI / 4;
    cap.position.set(side * (hw + 0.7), 9.7, 0);
    g.add(p, cap);
  }
  // A pointed arch, as a church window's: two arcs, each centred halfway to the other post, meeting at the top; lit.
  const light = new THREE.MeshLambertMaterial({ color: 0xfff4d0, emissive: 0xfff0c0, emissiveIntensity: 1 });
  const lights = fairyLights(animated);
  const a = hw + 0.7;
  const c = a * 0.5;
  const R = a + c;
  const apex = Math.acos(-c / R);
  const top = 9 + R * Math.sin(apex);
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 16; k++) {
      const th = Math.PI + (apex - Math.PI) * (k / 16);
      pts.push(new THREE.Vector3(-side * (c + R * Math.cos(th)), 9 + R * Math.sin(th), 0));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.3, 6, false), light));
    for (let k = 0; k < 12; k++) {
      const bulb = new THREE.Sprite(lights[k % lights.length]);
      bulb.scale.setScalar(1.1);
      bulb.position.copy(curve.getPoint((k + 0.5) / 12));
      bulb.position.z -= 0.4;
      g.add(bulb);
    }
  }
  sign(g, 'GOD IS CALLING', '#1a2a6a', '#fff0c0', hw * 1.2, 7);
  // Light pouring down through it from the sky.
  const halo = new THREE.Sprite(additive(glowTex(), 0xfff0c0));
  halo.scale.set(hw * 2.6, hw * 1.6, 1);
  halo.position.y = top - 1;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(hw * 0.7, hw * 1.1, 60, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff4c0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  beam.position.y = top + 30;
  g.add(halo, beam);
  animated.push((time) => {
    halo.material.opacity = 0.55 + 0.25 * Math.sin(time * 1.4);
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.09 + 0.05 * Math.sin(time * 0.7);
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * The house on the top of the hill: a weatherboard house on a green hill
 * over the suburb, fairy lights round it, an inflatable Santa on the lawn,
 * and Santa himself up on the roof with his presents and sack, an axe in
 * his hand; the sky opening over it and the light pouring down.
 */
export function hillHouse(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const H = 22;
  const hill = new THREE.Mesh(new THREE.SphereGeometry(60, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ map: (() => {
    const m = lawnTexture();
    m.repeat.set(4, 2);
    return m;
  })() }));
  hill.scale.y = H / 60;
  g.add(hill);
  const lights = fairyLights(animated);
  const S = 3;
  const house = weatherboardHouse(10, 8, new THREE.MeshLambertMaterial({ map: weatherTex(), color: 0xf4ead0 }), new THREE.MeshLambertMaterial({ map: ironTex(), color: 0xa83a2a, flatShading: true }), lights);
  house.group.scale.setScalar(S);
  house.group.position.y = H - 0.5;
  g.add(house.group);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(1, 2.4, 1), lambert(0x9a4a34));
  chimney.position.set(2.6, house.ridge - 0.4, -1);
  house.group.add(chimney);
  // Santa on the roof, by the chimney, presents piled beside him.
  const santa = santaFigure();
  santa.group.position.set(1, house.ridge - 0.9, 0.6);
  house.group.add(santa.group);
  PRESENT_WRAPS.forEach((w, k) => {
    const p = presentFigure(0.7, w);
    p.inside.visible = false;
    p.group.position.set(-1 - k * 0.8, house.ridge - 1.3 + k * 0.1, 1 + (k % 2) * 0.3);
    house.group.add(p.group);
  });
  // The sky opens: a shaft of light down on the house from on high.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(18, 32, 260, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff4c8, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  beam.position.y = H + 130;
  const glow = new THREE.Sprite(additive(glowTex(), 0xfff0c0));
  glow.scale.setScalar(70);
  glow.position.y = H + 14;
  g.add(beam, glow);
  // Fairy lights strung down the hill from the house, round and round.
  const rand = seededRandom(2161);
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * Math.PI * 2;
    const r0 = 14;
    const r1 = 56;
    const a = new THREE.Vector3(Math.cos(a0) * r0, H * Math.sqrt(1 - (r0 / 60) ** 2), Math.sin(a0) * r0);
    const b = new THREE.Vector3(Math.cos(a0 + 0.3) * r1, H * Math.sqrt(1 - (r1 / 60) ** 2) + 0.5, Math.sin(a0 + 0.3) * r1);
    lightString(g, a, b, 18 + Math.floor(rand() * 6), lights, 1.4);
  }
  animated.push((time) => {
    santa.arm.rotation.z = -2.2 + Math.sin(time * 2.2) * 0.6;
    santa.group.rotation.y = Math.sin(time * 0.4) * 0.5;
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.05 * Math.sin(time * 0.5);
    glow.material.opacity = 0.5 + 0.3 * Math.sin(time * 0.8);
  });
  g.position.set(at.x, 0, at.z);
  // The house faces the road (its front is local +z; a lateral to the right is the road's (-tz, tx)).
  g.rotation.y = at.heading + (lateral > 0 ? Math.PI / 2 : -Math.PI / 2);
  return g;
}
