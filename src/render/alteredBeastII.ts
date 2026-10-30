import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { CUTLERY_STAGES, FORK_RADIUS, KNIFE_LENGTH, type HazardPose } from '../items/hazards';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import * as tex from './textures';

/**
 * Altered Beast II's world, "now we cross to the foe": the beast's own
 * habitat, the top of the food chain, its den laid like a table and the
 * karts the size of a meal on it. A butcher's block for a road, scored by
 * knives; a tablecloth for the ground in the colours of meat and wine; the
 * beast's larder for walls. Strewn over the table: crusty bread, bones
 * picked clean, goblets, guttering candles, a fork and a cleaver stuck
 * upright, its weapons (the sabre, the spiked bat) and its heavy cargo
 * (crates and barrels), the caribou's skull with its antlers, a roast
 * drumstick. The catapult's frame over the start, and the monster's plate,
 * "our friend" on it.
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type Animated = ((time: number) => void)[];
type RGB = [number, number, number];

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const additive = (map: THREE.Texture, color: number) => new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false });
const glossy = (color: number, shininess = 90) => new THREE.MeshPhongMaterial({ color, shininess, specular: 0xffffff });

/** Made once and shared: the textures go on hundreds of meshes. */
function once<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
}

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

/** Every pixel a little lighter or darker: grain. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number): void {
  const rand = seededRandom(seed);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < w * h; i++) {
    const f = 1 + (rand() - 0.5) * amount;
    for (let k = 0; k < 3; k++) img.data[i * 4 + k] = Math.min(255, img.data[i * 4 + k] * f);
  }
  ctx.putImageData(img, 0, 0);
}

/** A knife's score across the wood: a dark cut with a pale lip, wrapped round the tile. */
function score(ctx: CanvasRenderingContext2D, S: number, x: number, y: number, len: number, a: number, alpha: number): void {
  for (const ox of [-S, 0, S]) {
    for (const oy of [-S, 0, S]) {
      ctx.save();
      ctx.translate(x + ox, y + oy);
      ctx.rotate(a);
      ctx.strokeStyle = `rgba(60,24,10,${alpha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2, 0);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,236,200,${alpha * 0.5})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 1.2);
      ctx.lineTo(len / 2, 1.2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

/** A stain soaked into the grain, wrapped round the tile. */
function stain(ctx: CanvasRenderingContext2D, S: number, x: number, y: number, r: number, color: RGB, alpha: number): void {
  for (const ox of [-S, 0, S]) {
    for (const oy of [-S, 0, S]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, css(color, alpha));
      g.addColorStop(0.7, css(color, alpha * 0.6));
      g.addColorStop(1, css(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
}

/**
 * The butcher's block: end grain, square blocks of maple glued up in a
 * checker of paler and darker wood, the growth rings in each, scored all
 * over by knives and stained where the meat has been.
 */
export function butcherBlockTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rand = seededRandom(3101);
  const n = 4;
  const w = S / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const light = (i + j) % 2 === 0;
      const base: RGB = light ? [222 + rand() * 14, 176 + rand() * 14, 120 + rand() * 12] : [176 + rand() * 16, 118 + rand() * 12, 70 + rand() * 10];
      ctx.save();
      ctx.beginPath();
      ctx.rect(i * w, j * w, w, w);
      ctx.clip();
      ctx.fillStyle = css(base);
      ctx.fillRect(i * w, j * w, w, w);
      // The growth rings, round a heart off in one corner of the block or beyond it.
      const cx = i * w + (rand() < 0.5 ? -0.2 : 1.2) * w * rand();
      const cy = j * w + (rand() < 0.5 ? -0.2 : 1.2) * w * rand();
      for (let r = 4; r < w * 1.8; r += 3 + rand() * 4) {
        ctx.strokeStyle = css([base[0] * 0.78, base[1] * 0.7, base[2] * 0.62], 0.45 + rand() * 0.3);
        ctx.lineWidth = 0.8 + rand() * 1.2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Rays out from the heart.
      for (let k = 0; k < 5; k++) {
        const a = rand() * Math.PI * 2;
        ctx.strokeStyle = css([base[0] * 0.85, base[1] * 0.8, base[2] * 0.75], 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * w * 2, cy + Math.sin(a) * w * 2);
        ctx.stroke();
      }
      ctx.restore();
      // The glue line round it.
      ctx.strokeStyle = 'rgba(70,36,16,0.8)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(i * w + 0.75, j * w + 0.75, w - 1.5, w - 1.5);
    }
  }
  // Stains soaked in: blood and fat.
  for (let k = 0; k < 6; k++) stain(ctx, S, rand() * S, rand() * S, 14 + rand() * 30, k % 3 ? [120, 20, 16] : [90, 50, 20], 0.18 + rand() * 0.16);
  // Scored by knives, every which way.
  for (let k = 0; k < 90; k++) score(ctx, S, rand() * S, rand() * S, 12 + rand() * 50, rand() * Math.PI, 0.35 + rand() * 0.4);
  grain(ctx, S, S, 0.12, 3102);
  return finish(c);
}

/**
 * The beast's tablecloth: gingham in the colours of meat and wine (blood
 * red and a deep oxblood, darker where they cross), the linen's weave,
 * rings from goblets, spilt wine and gravy, and crumbs of crusty bread.
 */
export function tableclothTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rand = seededRandom(3111);
  const n = 8;
  const w = S / n;
  ctx.fillStyle = css([150, 26, 26]);
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = i % 2 === 0;
      const b = j % 2 === 0;
      ctx.fillStyle = a && b ? css([60, 8, 12]) : a || b ? css([104, 14, 20]) : css([168, 34, 30]);
      ctx.fillRect(i * w, j * w, w, w);
    }
  }
  // The weave.
  for (let y = 0; y < S; y += 2) {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, y, S, 1);
  }
  for (let x = 0; x < S; x += 2) {
    ctx.fillStyle = 'rgba(255,220,200,0.04)';
    ctx.fillRect(x, 0, 1, S);
  }
  // Goblet rings, and spills.
  for (let k = 0; k < 3; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 10 + rand() * 8;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        ctx.strokeStyle = 'rgba(30,0,10,0.45)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  for (let k = 0; k < 4; k++) stain(ctx, S, rand() * S, rand() * S, 16 + rand() * 24, k % 2 ? [40, 0, 16] : [90, 50, 20], 0.35);
  // Crumbs.
  for (let k = 0; k < 60; k++) {
    ctx.fillStyle = css([210 + rand() * 30, 160 + rand() * 30, 90 + rand() * 20], 0.8);
    ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 2.5, 1 + rand() * 2);
  }
  grain(ctx, S, S, 0.1, 3112);
  return finish(c);
}

/**
 * The beast's larder, its walls from the floor up (the bottom of the image
 * is the floor): rough oak planks, an iron strap riveted across them low
 * and high, meat hooks hung from the top one, and dark drips run down.
 */
export function larderWallTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rand = seededRandom(3121);
  const planks = 6;
  const w = S / planks;
  for (let k = 0; k < planks; k++) {
    const base: RGB = [70 + rand() * 20, 42 + rand() * 12, 24 + rand() * 8];
    ctx.fillStyle = css(base);
    ctx.fillRect(k * w, 0, w, S);
    for (let g = 0; g < 9; g++) {
      ctx.strokeStyle = css([base[0] * 0.65, base[1] * 0.6, base[2] * 0.6], 0.6);
      ctx.lineWidth = 1 + rand() * 1.5;
      const x = k * w + 3 + rand() * (w - 6);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (rand() - 0.5) * 12, S * 0.3, x + (rand() - 0.5) * 12, S * 0.7, x, S);
      ctx.stroke();
    }
    // A knot or two.
    for (let n = 0; n < 2; n++) {
      ctx.fillStyle = css([base[0] * 0.5, base[1] * 0.45, base[2] * 0.4]);
      ctx.beginPath();
      ctx.ellipse(k * w + w * (0.3 + rand() * 0.4), rand() * S, 3 + rand() * 3, 6 + rand() * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(20,8,4,0.9)';
    ctx.fillRect(k * w, 0, 2, S);
  }
  // Iron straps, riveted, low and high.
  for (const y of [S * 0.18, S * 0.8]) {
    ctx.fillStyle = css([46, 44, 46]);
    ctx.fillRect(0, y - 7, S, 14);
    ctx.fillStyle = css([90, 86, 86]);
    ctx.fillRect(0, y - 7, S, 2);
    for (let x = w / 2; x < S; x += w) {
      ctx.fillStyle = css([130, 126, 120]);
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Meat hooks hung from the top strap.
  ctx.strokeStyle = css([150, 146, 140]);
  ctx.lineWidth = 2.5;
  for (let x = w; x < S; x += w * 2) {
    ctx.beginPath();
    ctx.moveTo(x, S * 0.2);
    ctx.lineTo(x, S * 0.34);
    ctx.arc(x - 5, S * 0.34, 5, 0, Math.PI * 0.9);
    ctx.stroke();
  }
  // Dark drips run down the planks.
  for (let k = 0; k < 7; k++) {
    const x = rand() * S;
    const y = S * (0.2 + rand() * 0.2);
    const len = 30 + rand() * 80;
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, 'rgba(90,6,10,0.75)');
    g.addColorStop(1, 'rgba(90,6,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 2.5 + rand() * 2, len);
  }
  grain(ctx, S, S, 0.14, 3122);
  return finish(c);
}

/** The low walls: a cleaver's steel, brushed along, the edge polished bright along its top, a row of rivets. */
export function cleaverTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#f4f6f8');
  g.addColorStop(0.12, '#c8ccd0');
  g.addColorStop(0.2, '#8a8e94');
  g.addColorStop(1, '#5a5c62');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const rand = seededRandom(3131);
  for (let k = 0; k < 160; k++) {
    ctx.fillStyle = `rgba(255,255,255,${0.04 + rand() * 0.08})`;
    ctx.fillRect(0, rand() * S, S, 1);
  }
  for (const x of [S * 0.25, S * 0.75]) {
    ctx.fillStyle = '#3a3c40';
    ctx.beginPath();
    ctx.arc(x, S * 0.62, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8ccd0';
    ctx.beginPath();
    ctx.arc(x - 1, S * 0.6, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/** A crust: golden brown, baked darker in patches, floured. */
function crustTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const rand = seededRandom(3141);
  ctx.fillStyle = css([186, 112, 44]);
  ctx.fillRect(0, 0, S, S);
  for (let k = 0; k < 40; k++) stain(ctx, S, rand() * S, rand() * S, 6 + rand() * 18, k % 3 ? [120, 60, 20] : [230, 170, 90], 0.4);
  for (let k = 0; k < 120; k++) {
    ctx.fillStyle = `rgba(250,240,220,${0.2 + rand() * 0.4})`;
    ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 2, 1 + rand() * 2);
  }
  grain(ctx, S, S, 0.2, 3142);
  return finish(c);
}

const glowTex = once(() => tex.glowTexture());
const crustTex = once(crustTexture);
const furTex = once(() => tex.furTexture());

/** Shared materials for the beast's things. */
function stuff() {
  return {
    steel: glossy(0xd4d8de, 140),
    darkSteel: glossy(0x6a6e76, 90),
    bone: lambert(0xece0c4),
    wood: lambert(0x5a3218),
    darkWood: lambert(0x3a1e0e),
    gold: glossy(0xd8a838, 110),
    iron: glossy(0x3a3a40, 60),
    wine: new THREE.MeshPhongMaterial({ color: 0x4a0410, shininess: 140, specular: 0xffa0a0 }),
    crust: new THREE.MeshLambertMaterial({ map: crustTex() }),
    fur: new THREE.MeshLambertMaterial({ map: furTex(), color: 0x8a6040 }),
    wax: lambert(0xf0e4c8),
    roast: new THREE.MeshPhongMaterial({ color: 0x7a3a14, shininess: 70, specular: 0xffc080 }),
    leather: lambert(0x2a1a10),
  };
}

// ---- Shapes -------------------------------------------------------------------------

/** A table fork, `h` long, its tines along -y from the origin and its handle up +y. */
function forkShape(h: number, steel: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const tines = 4;
  const spread = h * 0.16;
  for (let k = 0; k < tines; k++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.012, h * 0.006, h * 0.3, 6), steel);
    t.position.set(-spread / 2 + (k * spread) / (tines - 1), -h * 0.15, 0);
    g.add(t);
  }
  const neck = new THREE.Mesh(new THREE.BoxGeometry(spread * 1.1, h * 0.06, h * 0.025), steel);
  neck.position.y = h * 0.02;
  const shank = new THREE.Mesh(new THREE.BoxGeometry(h * 0.035, h * 0.24, h * 0.022), steel);
  shank.position.y = h * 0.16;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(h * 0.07, h * 0.42, h * 0.03), steel);
  handle.position.y = h * 0.48;
  g.add(neck, shank, handle);
  return g;
}

/** A knife, its blade `len` long along +z from the origin, the edge down along y = 0 and the spine at `h`; the handle runs on along +z. */
function knifeShape(len: number, h: number, steel: THREE.Material, handleMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, h * 0.75);
  // The point, then the edge curving up to it; the spine straight back to the bolster.
  shape.quadraticCurveTo(len * 0.25, 0, len, 0);
  shape.lineTo(len, h);
  shape.lineTo(len * 0.2, h);
  shape.lineTo(0, h * 0.75);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: h * 0.06, bevelEnabled: false }), steel);
  blade.rotation.y = -Math.PI / 2;
  blade.position.x = (h * 0.06) / 2;
  const bolster = new THREE.Mesh(new THREE.BoxGeometry(h * 0.14, h * 1.05, h * 0.12), steel);
  bolster.position.set(0, h * 0.5, len + h * 0.06);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(h * 0.18, h * 0.42, len * 0.55), handleMat);
  handle.position.set(0, h * 0.72, len + h * 0.12 + len * 0.275);
  g.add(blade, bolster, handle);
  for (let k = 0; k < 3; k++) {
    const rivet = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.04, h * 0.04, h * 0.2, 8), steel);
    rivet.rotation.z = Math.PI / 2;
    rivet.position.set(0, h * 0.72, len + h * 0.12 + len * (0.1 + k * 0.17));
    g.add(rivet);
  }
  return g;
}

// ---- Scenery -------------------------------------------------------------------

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

/**
 * The beast's table, at a kart's size: loaves of crusty bread, bones picked
 * clean, goblets of wine, candles guttering, a fork and a cleaver stuck
 * upright, the sabre and the spiked bat, its heavy cargo of crates and
 * barrels, the caribou's skull with its antlers, a roast drumstick.
 */
export function denFeature(animated: Animated): Feature {
  const m = stuff();
  const glow = glowTex();

  const loaf: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const len = 12 + rand() * 8;
    const bread = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), m.crust);
    bread.scale.set(len * 0.3, len * 0.22, len * 0.5);
    bread.position.y = len * 0.14;
    t.add(bread);
    // Slashed across the top, the crumb showing.
    for (let k = 0; k < 4; k++) {
      const slash = new THREE.Mesh(new THREE.BoxGeometry(len * 0.32, len * 0.03, len * 0.05), lambert(0xf0dca8));
      slash.position.set(0, len * 0.34, -len * 0.3 + k * len * 0.2);
      slash.rotation.set(0, 0.5, 0);
      t.add(slash);
    }
    // Broken open, as often as not: a hunk torn off beside it.
    if (rand() < 0.5) {
      const hunk = new THREE.Mesh(new THREE.DodecahedronGeometry(len * 0.13, 0), m.crust);
      hunk.position.set(len * 0.32, len * 0.1, len * 0.3);
      t.add(hunk);
    }
    return place(t, x, z, rand);
  };
  const bone: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const len = 10 + rand() * 8;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(len * 0.06, len * 0.06, len, 10), m.bone);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.y = len * 0.1;
    t.add(shaft);
    for (const end of [-1, 1]) {
      for (const side of [-1, 1]) {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(len * 0.1, 10, 8), m.bone);
        knob.position.set(side * len * 0.07, len * 0.1, (end * len) / 2);
        t.add(knob);
      }
    }
    return place(t, x, z, rand);
  };
  const goblet: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 9 + rand() * 6;
    const pts = [
      [0, 0],
      [h * 0.3, 0],
      [h * 0.3, h * 0.03],
      [h * 0.06, h * 0.08],
      [h * 0.05, h * 0.45],
      [h * 0.3, h * 0.6],
      [h * 0.34, h],
      [h * 0.32, h],
      [h * 0.28, h * 0.62],
      [0, h * 0.5],
    ].map(([a, b]) => new THREE.Vector2(a, b));
    const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), rand() < 0.5 ? m.gold : m.darkSteel);
    const wine = new THREE.Mesh(new THREE.CircleGeometry(h * 0.31, 20), m.wine);
    wine.rotation.x = -Math.PI / 2;
    wine.position.y = h * 0.9;
    t.add(cup, wine);
    return place(t, x, z, rand);
  };
  const candle: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 12 + rand() * 10;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.2, 1.6, 16), m.gold);
    stick.position.y = 0.8;
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.4, 16), m.gold);
    dish.position.y = 1.8;
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, h, 14), m.wax);
    wax.position.y = 2 + h / 2;
    t.add(stick, dish, wax);
    // Wax run down its side.
    for (let k = 0; k < 4; k++) {
      const a = rand() * Math.PI * 2;
      const drip = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, h * (0.15 + rand() * 0.3), 4, 6), m.wax);
      drip.position.set(Math.cos(a) * 1.45, 2 + h * (0.75 + rand() * 0.15), Math.sin(a) * 1.45);
      t.add(drip);
    }
    const flame = new THREE.Sprite(additive(glow, 0xffa040));
    flame.scale.set(3, 5, 1);
    flame.position.y = 2 + h + 2;
    const halo = new THREE.Sprite(additive(glow, 0xff6020));
    halo.scale.setScalar(14);
    halo.position.y = 2 + h + 2;
    t.add(flame, halo);
    const ph = rand() * 10;
    animated.push((time) => {
      const f = 0.8 + 0.2 * Math.sin(time * 11 + ph) * Math.sin(time * 7.3 + ph * 2);
      flame.scale.set(3 * f, 5 * (0.9 + 0.2 * f), 1);
      halo.material.opacity = 0.5 + 0.25 * f;
    });
    return place(t, x, z, rand);
  };
  const fork: Feature = (x, z, rand) => {
    // A giant fork stuck in the table, tines down, leaning.
    const t = new THREE.Group();
    const h = 22 + rand() * 10;
    const f = forkShape(h, m.steel);
    f.position.y = h * 0.22;
    f.rotation.z = (rand() - 0.5) * 0.5;
    f.rotation.x = (rand() - 0.5) * 0.3;
    t.add(f);
    return place(t, x, z, rand);
  };
  const cleaver: Feature = (x, z, rand) => {
    // A cleaver chopped into the table, its blade half buried.
    const t = new THREE.Group();
    const s = 6 + rand() * 4;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.4, s, s * 1.4), m.steel);
    blade.position.y = s * 0.3;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.1, s * 0.12, s * 1.1, 10), m.darkWood);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, s * 0.6, s * 1.2);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(s * 0.12, 12), m.darkWood);
    hole.rotation.y = Math.PI / 2;
    hole.position.set(0.21, s * 0.6, -s * 0.45);
    t.add(blade, handle, hole);
    t.rotation.z = (rand() - 0.5) * 0.3;
    const holder = new THREE.Group();
    holder.add(t);
    return place(holder, x, z, rand);
  };
  const sabre: Feature = (x, z, rand) => {
    // "I am the sabre!": a curved blade stuck point down, its guard and grip up high.
    const t = new THREE.Group();
    const len = 20 + rand() * 8;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      pts.push(new THREE.Vector3(Math.sin(u * 1.1) * len * 0.18, u * len, 0));
    }
    const blade = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, len * 0.035, 5, false), m.steel);
    blade.scale.z = 0.3;
    const top = pts[pts.length - 1];
    const guard = new THREE.Mesh(new THREE.TorusGeometry(len * 0.08, len * 0.012, 6, 16, Math.PI), m.gold);
    guard.position.copy(top);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(len * 0.025, len * 0.025, len * 0.18, 8), m.leather);
    grip.position.set(top.x + len * 0.02, top.y + len * 0.09, 0);
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(len * 0.035, 10, 8), m.gold);
    pommel.position.set(top.x + len * 0.02, top.y + len * 0.19, 0);
    t.add(blade, guard, grip, pommel);
    t.position.y = -len * 0.12;
    t.rotation.z = (rand() - 0.5) * 0.3;
    const holder = new THREE.Group();
    holder.add(t);
    return place(holder, x, z, rand);
  };
  const bat: Feature = (x, z, rand) => {
    // "The catapult and bat!": a club studded with spikes, leant on its end.
    const t = new THREE.Group();
    const len = 14 + rand() * 6;
    const club = new THREE.Mesh(new THREE.CylinderGeometry(len * 0.1, len * 0.035, len, 12), m.wood);
    club.position.y = len / 2;
    t.add(club);
    for (let k = 0; k < 14; k++) {
      const a = k * 2.4;
      const y = len * (0.55 + (k / 14) * 0.4);
      const r = len * (0.035 + 0.065 * ((y / len - 0.0) * 1.0));
      const spike = new THREE.Mesh(new THREE.ConeGeometry(len * 0.025, len * 0.09, 6), m.iron);
      spike.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      spike.rotation.set(Math.sin(a) * (Math.PI / 2), 0, -Math.cos(a) * (Math.PI / 2));
      t.add(spike);
    }
    t.rotation.z = 0.25 + rand() * 0.2;
    const holder = new THREE.Group();
    holder.add(t);
    return place(holder, x, z, rand);
  };
  const crate: Feature = (x, z, rand) => {
    // Heavy cargo: crates bound in iron, and a barrel.
    const t = new THREE.Group();
    const s = 6 + rand() * 4;
    const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), m.wood);
    box.position.y = s / 2;
    t.add(box);
    for (const y of [0.2, 0.8]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(s * 1.02, s * 0.08, s * 1.02), m.iron);
      band.position.y = s * y;
      t.add(band);
    }
    if (rand() < 0.6) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.38, s * 0.38, s * 0.9, 14), m.darkWood);
      barrel.position.set(s * 0.95, s * 0.45, 0);
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(s * 0.39, s * 0.03, 4, 16), m.iron);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.set(s * 0.95, s * 0.7, 0);
      t.add(barrel, hoop);
    }
    return place(t, x, z, rand);
  };
  const skull: Feature = (x, z, rand) => {
    // The caribou: its skull picked clean, its antlers.
    const t = new THREE.Group();
    const s = 5 + rand() * 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.5, 14, 10), m.bone);
    head.scale.set(0.8, 0.7, 1);
    head.position.y = s * 0.4;
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.2, s * 0.3, s * 1.1, 10), m.bone);
    snout.rotation.x = Math.PI / 2 - 0.3;
    snout.position.set(0, s * 0.25, s * 0.7);
    t.add(head, snout);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(s * 0.1, 8, 6), lambert(0x1a0a06));
      eye.position.set(side * s * 0.22, s * 0.5, s * 0.32);
      t.add(eye);
      // The antler: a beam sweeping up and back, tines off it.
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 8; k++) {
        const u = k / 8;
        pts.push(new THREE.Vector3(side * (s * 0.3 + u * s * 1.6), s * 0.6 + Math.sin(u * 2.2) * s * 2.2, -u * s * 1.2 + Math.sin(u * 3) * s * 0.8));
      }
      const beam = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, s * 0.08, 5, false), m.bone);
      t.add(beam);
      for (let k = 2; k <= 7; k += 2) {
        const tine = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.03, s * 0.07, s * 1.1, 5), m.bone);
        tine.position.copy(pts[k]).add(new THREE.Vector3(0, s * 0.45, s * 0.2));
        tine.rotation.x = 0.4;
        tine.rotation.z = -side * 0.2;
        t.add(tine);
      }
    }
    return place(t, x, z, rand);
  };
  const drumstick: Feature = (x, z, rand) => {
    // A roast drumstick, glazed, its bone sticking out.
    const t = new THREE.Group();
    const s = 6 + rand() * 4;
    const meat = new THREE.Mesh(new THREE.SphereGeometry(s * 0.55, 16, 12), m.roast);
    meat.scale.set(1, 0.85, 1.4);
    meat.position.y = s * 0.45;
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.1, s * 0.12, s * 1.3, 8), m.bone);
    shank.rotation.x = Math.PI / 2 - 0.25;
    shank.position.set(0, s * 0.55, s * 1.25);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(s * 0.17, 10, 8), m.bone);
    knob.position.set(0, s * 0.7, s * 1.85);
    t.add(meat, shank, knob);
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [3, loaf],
      [2.4, bone],
      [2, goblet],
      [2, candle],
      [1.2, fork],
      [1.2, cleaver],
      [1, sabre],
      [1, bat],
      [2, crate],
      [1, skull],
      [1.6, drumstick],
    ])(x, z, rand);
}

// ---- Landmarks --------------------------------------------------------------------

function sign(g: THREE.Group, text: string, bg: string, fg: string, width: number, y: number): void {
  const map = tex.billboardTexture(text, bg, fg);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.25), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
  mesh.position.y = y;
  mesh.rotation.y = Math.PI;
  g.add(mesh);
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

/**
 * The catapult's frame over the road, the start: two A-frames of rough
 * timber either side, lashed and bolted, an axle across between them, and
 * the throwing arm on it, cocked back over the road with a boulder in its
 * sling and the counterweight hung from its short end, creaking.
 */
export function catapultGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const H = 22;
  const m = stuff();
  const beam = (a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) => {
    const d = b.clone().sub(a);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(r, d.length(), r), mat);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return mesh;
  };
  for (const side of [-1, 1]) {
    const x = side * hw;
    const top = new THREE.Vector3(x, H, 0);
    g.add(beam(new THREE.Vector3(x, 0, -9), top, 1.6, m.wood), beam(new THREE.Vector3(x, 0, 9), top, 1.6, m.wood));
    g.add(beam(new THREE.Vector3(x, 7, -6.2), new THREE.Vector3(x, 7, 6.2), 1.2, m.darkWood));
    // Iron bolted at the head where the axle runs through.
    const plate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3, 3), m.iron);
    plate.position.set(x, H, 0);
    g.add(plate);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, hw * 2 + 3, 12), m.iron);
  axle.rotation.z = Math.PI / 2;
  axle.position.y = H;
  g.add(axle);
  // The arm, pivoting on the axle: its long end cocked back over the road with the sling, the counterweight on its short end.
  const arm = new THREE.Group();
  arm.position.y = H;
  const long = 26;
  const pole = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, long + 8), m.darkWood);
  pole.position.z = -long / 2 + 4;
  arm.add(pole);
  const weight = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), m.iron);
  weight.position.set(0, -3.5, 7);
  const sling = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.leather);
  sling.position.set(0, 0.4, -long);
  const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6, 0), lambert(0x6a5a50, { flatShading: true }));
  boulder.position.set(0, 1.6, -long);
  arm.add(weight, sling, boulder);
  arm.rotation.x = -0.45;
  g.add(arm);
  // The ropes holding it cocked, down to the frame.
  for (const side of [-1, 1]) g.add(beam(new THREE.Vector3(side * hw, 7, -6), new THREE.Vector3(side * 0.5, H - 4.5, -10), 0.25, m.leather));
  sign(g, 'ALTERED BEAST II', '#3a0a0c', '#f0d8a0', hw * 1.1, H + 5);
  animated.push((time) => (arm.rotation.x = -0.45 + Math.sin(time * 0.9) * 0.03 + Math.max(0, Math.sin(time * 0.35)) ** 8 * 0.06));
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * The monster's plate, "now we cross to our friend on the monster's
 * plate": a great white plate with a red rim, set on the table where the
 * road goes round it, and our friend lying on it among the garnish,
 * steaming, turning slowly over ("in time he will turn and reincarnate");
 * the beast's knife and fork laid either side.
 */
export function monsterPlate(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const R = 30;
  const m = stuff();
  const china = glossy(0xfaf6ee, 140);
  const rimMat = glossy(0x9a1a1a, 120);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.8, 2, 48), china);
  plate.position.y = 1;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 1, 1.2, 8, 48), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 2.2;
  const well = new THREE.Mesh(new THREE.CircleGeometry(R * 0.75, 40), glossy(0xf2ece0, 120));
  well.rotation.x = -Math.PI / 2;
  well.position.y = 2.05;
  g.add(plate, rim, well);
  // Our friend, lying on the plate: a body, a head, arms and legs, in a shirt and trousers, a lettuce leaf tucked under.
  const friend = new THREE.Group();
  friend.position.y = 2.1;
  const skin = lambert(0xe8b090);
  const shirt = lambert(0x3a6ab0);
  const trousers = lambert(0x3a3a44);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 6, 6, 12), shirt);
  body.rotation.z = Math.PI / 2;
  body.position.y = 2.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(2.1, 14, 10), skin);
  head.position.set(-6.6, 2.4, 0);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0x3a2414));
  hair.position.copy(head.position);
  hair.rotation.z = Math.PI / 2;
  friend.add(body, head, hair);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.8, 5, 4, 8), shirt);
    arm.rotation.z = Math.PI / 2 + side * 0.4;
    arm.position.set(-2, 1.6, side * 3);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(1, 7, 4, 8), trousers);
    leg.rotation.z = Math.PI / 2 - side * 0.1;
    leg.position.set(7, 1.6, side * 1.4);
    friend.add(arm, leg);
  }
  g.add(friend);
  // The garnish: parsley, a tomato, slices of crusty bread.
  const parsley = lambert(0x3a8a2a, { flatShading: true });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.3;
    const sprig = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), parsley);
    sprig.position.set(Math.cos(a) * R * 0.62, 2.8, Math.sin(a) * R * 0.62);
    g.add(sprig);
  }
  const tomato = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 10), glossy(0xd02010, 80));
  tomato.position.set(R * 0.4, 4, -R * 0.4);
  const slice = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1, 16), m.crust);
  slice.position.set(-R * 0.45, 2.6, R * 0.4);
  g.add(tomato, slice);
  // The beast's knife and fork laid either side.
  const knife = knifeShape(18, 4, m.steel, m.darkWood);
  knife.rotation.set(0, 0, Math.PI / 2);
  knife.position.set(R + 5, 0.2, -16);
  const fork = forkShape(36, m.steel);
  fork.rotation.x = -Math.PI / 2;
  fork.position.set(-R - 5, 0.8, 0);
  g.add(knife, fork);
  // Steam rising off it.
  const glow = glowTex();
  const steam: THREE.Sprite[] = [];
  for (let k = 0; k < 8; k++) {
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff4e8, transparent: true, opacity: 0.3, depthWrite: false }));
    puff.position.set(Math.cos(k * 2.3) * 6, 0, Math.sin(k * 2.3) * 4);
    g.add(puff);
    steam.push(puff);
  }
  animated.push((time) => {
    // Turning, slowly, over.
    friend.rotation.y = time * 0.12;
    steam.forEach((p, k) => {
      const u = (time * 0.18 + k / steam.length) % 1;
      p.position.y = 5 + u * 26;
      p.scale.setScalar(6 + u * 14);
      p.material.opacity = 0.35 * (1 - u) * Math.min(1, u * 5);
    });
  });
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.heading;
  return g;
}

// ---- The knife and fork ---------------------------------------------------------------------

/**
 * The beast's knife and fork, each held in a great furry paw at the end of
 * an arm reaching down out of the sky, and a shadow on the road under each.
 * Adds them to `obj` and returns the parts, for HazardsView to pose each
 * frame: knife, fork, knife's shadow, fork's shadow.
 */
export function cutleryParts(obj: THREE.Object3D): THREE.Object3D[] {
  const m = stuff();
  const arm = (): THREE.Group => {
    const g = new THREE.Group();
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.1, 40, 10), m.fur);
    limb.position.y = 22;
    const paw = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), m.fur);
    paw.scale.set(1, 1.2, 1.3);
    paw.position.y = 2;
    g.add(limb, paw);
    // Claws round the handle.
    for (let k = 0; k < 4; k++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 6), m.bone);
      claw.position.set(-0.75 + k * 0.5, 1.2, 1.5);
      claw.rotation.x = 2.4;
      g.add(claw);
    }
    return g;
  };
  // The knife: its blade along the road, edge down, the handle up in the paw.
  const knife = new THREE.Group();
  const blade = knifeShape(KNIFE_LENGTH, 1.7, m.steel, m.darkWood);
  blade.position.z = -KNIFE_LENGTH / 2;
  knife.add(blade);
  const knifePaw = arm();
  knifePaw.position.set(0, 1.6, KNIFE_LENGTH / 2 + 1.4);
  knife.add(knifePaw);
  // The fork: tines down into the road, the handle up in the other paw.
  const fork = new THREE.Group();
  const prongs = forkShape(7.5, m.steel);
  prongs.position.y = 1.1;
  prongs.rotation.y = Math.PI / 2;
  fork.add(prongs);
  const forkPaw = arm();
  forkPaw.position.y = 4.6;
  fork.add(forkPaw);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const knifeShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), shadowMat);
  knifeShadow.rotation.x = -Math.PI / 2;
  knifeShadow.scale.set(0.9, KNIFE_LENGTH / 2, 1);
  const forkShadow = new THREE.Mesh(new THREE.CircleGeometry(FORK_RADIUS * 1.2, 24), shadowMat);
  forkShadow.rotation.x = -Math.PI / 2;
  obj.add(knife, fork, knifeShadow, forkShadow);
  return [knife, fork, knifeShadow, forkShadow];
}

/**
 * Poses the knife and fork for a cutlery hazard's pose: the object sits on
 * the road's centre line, turned to its heading; the knife at the pose's
 * lateral and the fork at its `gap`, both at the pose's height off the
 * road; sawing while they pull apart.
 */
export function poseCutlery(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [knife, fork, knifeShadow, forkShadow] = parts;
  obj.position.set(p.ax, p.ground, p.az);
  obj.rotation.y = p.heading;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const knifeLat = (p.x - p.ax) * -fz + (p.z - p.az) * fx;
  const lift = p.y - p.ground;
  const u = p.phase;
  const C = CUTLERY_STAGES;
  // A lateral to the right is local -x.
  knife.position.set(-knifeLat, lift, 0);
  fork.position.set(-p.gap, lift, 0);
  const pulling = u >= C.pull && u < C.lift;
  // Sawing along the road as it slices; the fork tipped the way it drags.
  knife.rotation.x = pulling ? Math.sin(elapsed * 18) * 0.12 : 0;
  knife.position.z = pulling ? Math.sin(elapsed * 18) * 0.6 : 0;
  fork.rotation.z = pulling ? p.side * 0.25 : 0;
  // Their shadows on the road, darkening as they come down.
  const dark = Math.max(0, 1 - lift / 9);
  for (const [sh, lat] of [[knifeShadow, knifeLat], [forkShadow, p.gap]] as [THREE.Object3D, number][]) {
    sh.position.set(-lat, 0.08, 0);
    sh.visible = u >= C.stab - 0.15 && u < C.gone;
    ((sh as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.35 * dark;
  }
}
