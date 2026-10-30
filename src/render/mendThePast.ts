import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { CAMERA_GAP, CAMERA_HEIGHT, CAMERA_RADIUS, type HazardPose } from '../items/hazards';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import * as tex from './textures';

/**
 * Let Me Mend the Past's world, after Ambrose's song about his mum and her
 * sisters, and living at his nan's for a bit: nan's house, the karts tiny
 * in it. A floral carpet runner down the hall, floorboards either side,
 * striped wallpaper over a dado rail, doilies, teacups and her cups on the
 * wall, armchairs and standard lamps, the family's photos, a sewing basket
 * spilt across the floor (spools, pins, a needle and thread: the mending);
 * the front door with too many locks on it, and the cameras an auntie put
 * up in the hallway.
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

/** Draws `draw` at (x, y) and wherever it would wrap round the edges of a `size` tile. */
function wrapped(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void): void {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      if (x + ox < -r || x + ox > size + r || y + oy < -r || y + oy > size + r) continue;
      draw(x + ox, y + oy);
    }
  }
}

/** A carpet's pile: every pixel a little lighter or darker, tufts in rows. */
function pile(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number): void {
  const rand = seededRandom(seed);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < w * h; i++) {
    const f = 1 + (rand() - 0.5) * amount + ((i % w) % 2 === 0 ? amount * 0.15 : 0);
    for (let k = 0; k < 3; k++) img.data[i * 4 + k] = Math.min(255, img.data[i * 4 + k] * f);
  }
  ctx.putImageData(img, 0, 0);
}

/** A cabbage rose seen from above: rings of petals, darker at the heart. */
function rose(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, petal: RGB, heart: RGB): void {
  for (let ring = 0; ring < 4; ring++) {
    const rr = r * (1 - ring * 0.22);
    const n = 7 - ring;
    const c: RGB = [petal[0] + (heart[0] - petal[0]) * (ring / 3), petal[1] + (heart[1] - petal[1]) * (ring / 3), petal[2] + (heart[2] - petal[2]) * (ring / 3)];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + ring * 0.7;
      ctx.fillStyle = css(c);
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * rr * 0.35, y + Math.sin(a) * rr * 0.35, rr * 0.62, rr * 0.42, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = css([c[0] * 0.7, c[1] * 0.6, c[2] * 0.6], 0.7);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.fillStyle = css(heart);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, a: number, color: RGB): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = css(color);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.35, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.35, 0, 0);
  ctx.fill();
  ctx.strokeStyle = css([color[0] * 0.6, color[1] * 0.7, color[2] * 0.6]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(len * 0.9, 0);
  ctx.stroke();
  ctx.restore();
}

/** Nan's floral carpet: cabbage roses in pink and cream with their leaves on a deep wine ground, the pile showing. */
export function floralCarpetTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = css([96, 18, 30]);
  ctx.fillRect(0, 0, S, S);
  const rand = seededRandom(2301);
  // A trellis of fine gold scrolls under the flowers.
  ctx.strokeStyle = css([170, 120, 50], 0.55);
  ctx.lineWidth = 2;
  for (let k = 0; k < 8; k++) {
    const y0 = (k / 8) * S;
    ctx.beginPath();
    for (let x = 0; x <= S; x += 4) {
      const y = y0 + Math.sin((x / S) * Math.PI * 4 + k) * 8;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const roses: [number, number, number, RGB, RGB][] = [
    [64, 64, 30, [236, 150, 160], [150, 30, 50]],
    [192, 192, 30, [236, 150, 160], [150, 30, 50]],
    [192, 64, 22, [244, 224, 196], [200, 120, 90]],
    [64, 192, 22, [244, 224, 196], [200, 120, 90]],
  ];
  for (const [x, y, r] of roses) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + rand();
      wrapped(S, x, y, r * 2.2, (wx, wy) => leaf(ctx, wx + Math.cos(a) * r * 0.6, wy + Math.sin(a) * r * 0.6, r * 1.3, a, [52, 96, 48]));
    }
  }
  for (const [x, y, r, petal, heart] of roses) wrapped(S, x, y, r, (wx, wy) => rose(ctx, wx, wy, r, petal, heart));
  // Little sprigs of blue forget-me-nots between.
  for (let k = 0; k < 14; k++) {
    const x = rand() * S;
    const y = rand() * S;
    if (roses.some(([rx, ry, r]) => Math.hypot(rx - x, ry - y) < r * 1.7)) continue;
    wrapped(S, x, y, 8, (wx, wy) => {
      for (let p = 0; p < 5; p++) {
        ctx.fillStyle = css([120, 150, 210]);
        ctx.beginPath();
        ctx.arc(wx + Math.cos(p * 1.26) * 3, wy + Math.sin(p * 1.26) * 3, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = css([240, 210, 90]);
      ctx.beginPath();
      ctx.arc(wx, wy, 1.4, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  pile(ctx, S, S, 0.22, 2302);
  return finish(c);
}

/** Polished floorboards, honey-coloured, in staggered lengths, the grain running along them and a nail at every joist. */
export function floorboardsTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const rand = seededRandom(2311);
  const boards = 8;
  const w = S / boards;
  for (let b = 0; b < boards; b++) {
    let y = -rand() * S * 0.5;
    while (y < S) {
      const len = S * (0.35 + rand() * 0.4);
      const base: RGB = [176 + (rand() - 0.5) * 40, 112 + (rand() - 0.5) * 30, 58 + (rand() - 0.5) * 20];
      const draw = (yy: number) => {
        ctx.fillStyle = css(base);
        ctx.fillRect(b * w, yy, w, len);
        // Grain.
        for (let g = 0; g < 7; g++) {
          ctx.strokeStyle = css([base[0] * 0.75, base[1] * 0.7, base[2] * 0.65], 0.5);
          ctx.lineWidth = 1 + rand();
          ctx.beginPath();
          const gx = b * w + 4 + rand() * (w - 8);
          ctx.moveTo(gx, yy);
          ctx.bezierCurveTo(gx + (rand() - 0.5) * 10, yy + len * 0.3, gx + (rand() - 0.5) * 10, yy + len * 0.7, gx + (rand() - 0.5) * 6, yy + len);
          ctx.stroke();
        }
        // The joint at its end, and its nails.
        ctx.fillStyle = css([60, 34, 18]);
        ctx.fillRect(b * w, yy + len - 2, w, 2);
        ctx.fillStyle = css([40, 30, 26]);
        for (const nx of [0.25, 0.75]) {
          ctx.beginPath();
          ctx.arc(b * w + w * nx, yy + 8, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      draw(y);
      if (y + len > S) draw(y - S);
      y += len;
    }
    ctx.fillStyle = css([50, 28, 14]);
    ctx.fillRect(b * w, 0, 2, S);
  }
  // The polish: a soft sheen across them.
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, 'rgba(255,240,200,0.08)');
  g.addColorStop(0.5, 'rgba(255,240,200,0.0)');
  g.addColorStop(1, 'rgba(255,240,200,0.08)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return finish(c);
}

/**
 * Nan's walls, from the floor up (the bottom of the image is the floor):
 * a dark skirting board, embossed paper painted oxblood below the dado
 * rail, and above it striped wallpaper, dusty pink and cream, with sprigs
 * of roses down the stripes.
 */
export function wallpaperTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const at = (v: number) => S * (1 - v);
  // The wallpaper.
  for (let k = 0; k < 8; k++) {
    ctx.fillStyle = k % 2 ? css([236, 214, 196]) : css([206, 150, 150]);
    ctx.fillRect((k / 8) * S, 0, S / 8, S);
  }
  for (let k = 0; k < 8; k++) {
    if (k % 2 === 0) continue;
    for (let j = 0; j < 4; j++) {
      const x = ((k + 0.5) / 8) * S;
      const y = (j / 4) * at(0.35) + 12;
      leaf(ctx, x - 1, y + 4, 8, Math.PI * 0.75, [96, 130, 90]);
      leaf(ctx, x + 1, y + 4, 8, Math.PI * 0.25, [96, 130, 90]);
      rose(ctx, x, y, 5, [214, 110, 120], [140, 40, 60]);
    }
  }
  // Below the dado rail: embossed lincrusta, painted oxblood.
  const dado = 0.35;
  ctx.fillStyle = css([110, 36, 34]);
  ctx.fillRect(0, at(dado), S, S - at(dado));
  ctx.strokeStyle = css([150, 60, 50]);
  ctx.lineWidth = 2;
  for (let k = 0; k < 8; k++) {
    const x = ((k + 0.5) / 8) * S;
    ctx.beginPath();
    ctx.ellipse(x, (at(dado) + at(0.08)) / 2, S / 20, (at(0.08) - at(dado)) * 0.36, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The dado rail and the skirting board, wood.
  ctx.fillStyle = css([86, 48, 24]);
  ctx.fillRect(0, at(dado + 0.025), S, S * 0.025);
  ctx.fillStyle = css([140, 90, 50]);
  ctx.fillRect(0, at(dado + 0.02), S, 2);
  ctx.fillStyle = css([74, 40, 20]);
  ctx.fillRect(0, at(0.08), S, S * 0.08);
  ctx.fillStyle = css([120, 76, 40]);
  ctx.fillRect(0, at(0.08), S, 3);
  return finish(c);
}

/** The low walls: a painted skirting board, cream, a moulding along its top. */
export function skirtingTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = css([236, 226, 204]);
  ctx.fillRect(0, 0, S, S);
  for (const [y, col] of [[0, [200, 186, 160]], [S * 0.12, [255, 250, 236]], [S * 0.2, [190, 176, 150]], [S * 0.9, [170, 150, 126]]] as [number, RGB][]) {
    ctx.fillStyle = css(col);
    ctx.fillRect(0, y, S, S * 0.05);
  }
  pile(ctx, S, S, 0.05, 2321);
  return finish(c);
}

/** Crocheted lace: rings of loops and holes, white, the gaps see-through. */
function laceTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const m = S / 2;
  ctx.strokeStyle = '#fffaf0';
  ctx.fillStyle = '#fffaf0';
  for (let ring = 1; ring <= 6; ring++) {
    const r = (ring / 6.4) * m;
    ctx.lineWidth = ring === 6 ? 5 : 3;
    ctx.beginPath();
    ctx.arc(m, m, r, 0, Math.PI * 2);
    ctx.stroke();
    // Loops between the rings, and the scalloped edge.
    const n = ring * 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m + Math.cos(a) * (r - m / 12.8), m + Math.sin(a) * (r - m / 12.8), m / 14, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(m, m);
    ctx.lineTo(m + Math.cos(a) * m * 0.94, m + Math.sin(a) * m * 0.94);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(m, m, m / 10, 0, Math.PI * 2);
  ctx.fill();
  return finish(c, false);
}

/** A family photo in sepia: a row of them in their good clothes, standing a little apart. */
function photoTexture(seed: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 160);
  const rand = seededRandom(2331 + seed);
  const g = ctx.createLinearGradient(0, 0, 0, 160);
  g.addColorStop(0, '#d8c090');
  g.addColorStop(1, '#8a6a40');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 160);
  const n = 2 + Math.floor(rand() * 4);
  for (let k = 0; k < n; k++) {
    const x = 128 * ((k + 0.5) / n) + (rand() - 0.5) * 8;
    const h = 60 + rand() * 40;
    ctx.fillStyle = css([60 + rand() * 30, 40 + rand() * 20, 24]);
    ctx.beginPath();
    ctx.ellipse(x, 160 - h * 0.45, 14, h * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css([200, 170, 130]);
    ctx.beginPath();
    ctx.arc(x, 160 - h - 6, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  // Faded at the corners.
  const v = ctx.createRadialGradient(64, 80, 30, 64, 80, 100);
  v.addColorStop(0, 'rgba(255,240,210,0)');
  v.addColorStop(1, 'rgba(255,240,210,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 128, 160);
  return finish(c, false);
}

/** Fine bone china: white, a band of roses round it and a gold line at the rim. */
function chinaTexture(band: RGB): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 64);
  ctx.fillStyle = '#fbf8f2';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = css([210, 170, 70]);
  ctx.fillRect(0, 0, 256, 4);
  for (let k = 0; k < 8; k++) {
    const x = (k + 0.5) * 32;
    leaf(ctx, x - 2, 16, 10, Math.PI * 0.85, [90, 130, 84]);
    leaf(ctx, x + 2, 16, 10, Math.PI * 0.15, [90, 130, 84]);
    rose(ctx, x, 16, 7, band, [band[0] * 0.6, band[1] * 0.4, band[2] * 0.5]);
  }
  return finish(c);
}

const glowTex = once(() => tex.glowTexture());
const laceTex = once(laceTexture);
const floralTex = once(floralCarpetTexture);
const wallTex = once(wallpaperTexture);
const CHINA: RGB[] = [
  [220, 110, 130],
  [110, 140, 210],
  [230, 160, 80],
  [150, 110, 190],
];
const chinaTex = once(() => CHINA.map(chinaTexture));
const photoTex = once(() => [0, 1, 2, 3, 4, 5].map(photoTexture));

// ---- Shared shapes -----------------------------------------------------------

/** A teacup, its saucer and handle, `h` tall, standing at the origin. */
function teacup(h: number, china: THREE.Material, white: THREE.Material, gold: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const r = h * 0.6;
  // The bowl, turned on a lathe: a foot, flaring out to the rim.
  const pts = [
    new THREE.Vector2(r * 0.4, 0),
    new THREE.Vector2(r * 0.45, h * 0.08),
    new THREE.Vector2(r * 0.7, h * 0.3),
    new THREE.Vector2(r * 0.92, h * 0.7),
    new THREE.Vector2(r, h),
    new THREE.Vector2(r * 0.94, h),
    new THREE.Vector2(r * 0.86, h * 0.7),
    new THREE.Vector2(r * 0.62, h * 0.3),
    new THREE.Vector2(0.01, h * 0.12),
  ];
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), china);
  bowl.position.y = h * 0.1;
  const tea = new THREE.Mesh(new THREE.CircleGeometry(r * 0.86, 24), lambert(0x7a3a14));
  tea.rotation.x = -Math.PI / 2;
  tea.position.y = h * 0.82;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.97, h * 0.025, 6, 32), gold);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = h * 1.1;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(h * 0.24, h * 0.06, 8, 16, Math.PI * 1.3), white);
  handle.position.set(r * 0.95, h * 0.62, 0);
  handle.rotation.z = -Math.PI * 0.65;
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.6, r * 0.9, h * 0.1, 28), white);
  saucer.position.y = h * 0.05;
  g.add(saucer, bowl, tea, rim, handle);
  return g;
}

function sign(g: THREE.Group, text: string, bg: string, fg: string, width: number, y: number): void {
  const map = tex.billboardTexture(text, bg, fg);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.25), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
  m.position.y = y;
  m.rotation.y = Math.PI;
  g.add(m);
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

// ---- Scenery -------------------------------------------------------------------

/**
 * Nan's house, at a kart's size: teacups on their saucers, doilies,
 * armchairs in floral chintz, standard lamps with fringed shades, the
 * family's photos in their frames, an aspidistra, and the sewing basket
 * spilt: spools of thread, a pincushion stuck with pins, a needle and its
 * thread, and balls of wool with the knitting still on the needles.
 */
export function nanFeature(animated: Animated): Feature {
  const white = glossy(0xfbf8f2, 120);
  const gold = glossy(0xd8b048, 100);
  const chinas = chinaTex().map((map) => new THREE.MeshPhongMaterial({ map, shininess: 120, specular: 0xffffff, side: THREE.DoubleSide }));
  const chintz = new THREE.MeshLambertMaterial({ map: floralTex() });
  const wood = lambert(0x6a3a1a);
  const brass = glossy(0xc89a40, 80);
  const shadeMat = new THREE.MeshLambertMaterial({ color: 0xffd8a0, emissive: 0xffb060, emissiveIntensity: 0.7, side: THREE.DoubleSide });
  const lace = new THREE.MeshLambertMaterial({ map: laceTex(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  const photos = photoTex().map((map) => new THREE.MeshBasicMaterial({ map }));
  const steel = glossy(0xd8dce4, 160);
  const threads = [0xc02030, 0x2050b0, 0xf0d040, 0x30a050, 0xe8e0d0, 0x8a4ab0].map((c) => lambert(c));
  const wools = [0xc05070, 0x5a8ac0, 0xe0c060, 0x8ab060].map((c) => lambert(c, { flatShading: true }));
  const glow = glowTex();

  const cup: Feature = (x, z, rand) => {
    const t = teacup(3 + rand() * 2.5, chinas[Math.floor(rand() * chinas.length)], white, gold);
    return place(t, x, z, rand);
  };
  const doily: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 5 + rand() * 6;
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), lace);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.08;
    t.add(m);
    // Something set down on it, as often as not.
    if (rand() < 0.5) t.add(teacup(r * 0.4, chinas[Math.floor(rand() * chinas.length)], white, gold));
    return place(t, x, z, rand);
  };
  const armchair: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 16 + rand() * 6;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.3, w * 0.9), chintz);
    seat.position.y = w * 0.3;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.75, w * 0.22), chintz);
    back.position.set(0, w * 0.72, -w * 0.4);
    t.add(seat, back);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.13, w * 0.13, w * 0.9, 12), chintz);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(side * w * 0.45, w * 0.55, 0);
      t.add(arm);
      for (const end of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.03, w * 0.02, w * 0.16, 6), wood);
        leg.position.set(side * w * 0.42, w * 0.08, end * w * 0.38);
        t.add(leg);
      }
    }
    // A crocheted antimacassar over the back.
    const anti = new THREE.Mesh(new THREE.CircleGeometry(w * 0.22, 24), lace);
    anti.position.set(0, w * 1.0, -w * 0.28);
    t.add(anti);
    return place(t, x, z, rand);
  };
  const lamp: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 22 + rand() * 8;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.6, 0.8, 16), brass);
    foot.position.y = 0.4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, h, 8), brass);
    pole.position.y = h / 2;
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 4.6, 4.2, 20, 1, true), shadeMat);
    shade.position.y = h + 1;
    const bulb = new THREE.Sprite(additive(glow, 0xffc070));
    bulb.scale.setScalar(14);
    bulb.position.y = h;
    t.add(foot, pole, shade, bulb);
    // The fringe round the shade's hem.
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), brass);
      f.position.set(Math.cos(a) * 4.6, h - 1.5, Math.sin(a) * 4.6);
      t.add(f);
    }
    const ph = rand() * 10;
    animated.push((time) => (bulb.material.opacity = 0.75 + 0.1 * Math.sin(time * 1.3 + ph)));
    return place(t, x, z, rand);
  };
  const photo: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 5 + rand() * 4;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(h * 0.85, h, 0.4), rand() < 0.5 ? gold : wood);
    frame.position.y = h / 2 + 0.2;
    frame.rotation.x = -0.15;
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.68, h * 0.82), photos[Math.floor(rand() * photos.length)]);
    pic.position.set(0, h / 2 + 0.2, 0.22);
    pic.rotation.x = -0.15;
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.3, h * 0.8, 0.3), wood);
    prop.position.set(0, h * 0.4, -h * 0.25);
    prop.rotation.x = 0.4;
    t.add(frame, pic, prop);
    return place(t, x, z, rand);
  };
  const aspidistra: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 1.9, 4, 16), glossy(0x2a6a6a, 60));
    pot.position.y = 2;
    t.add(pot);
    const leafMat = lambert(0x2a5a28, { side: THREE.DoubleSide, flatShading: true });
    for (let k = 0; k < 9; k++) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 7 + rand() * 3), leafMat);
      l.position.y = 4;
      l.rotation.set(-0.5 - rand() * 0.4, (k / 9) * Math.PI * 2, 0);
      l.translateY(3.5);
      t.add(l);
    }
    return place(t, x, z, rand);
  };
  // The sewing basket, spilt: the mending.
  const spool: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 2.4 + rand() * 1.4;
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.42, h * 0.42, h * 0.8, 18), threads[Math.floor(rand() * threads.length)]);
    thread.position.y = h / 2;
    t.add(thread);
    for (const y of [0.05, 0.95]) {
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.55, h * 0.55, h * 0.1, 18), wood);
      flange.position.y = h * y;
      t.add(flange);
    }
    // Lying on its side as often as standing.
    if (rand() < 0.4) {
      t.rotation.z = Math.PI / 2;
      t.position.y = h * 0.55;
      const holder = new THREE.Group();
      holder.add(t);
      return place(holder, x, z, rand);
    }
    return place(t, x, z, rand);
  };
  const pincushion: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 2.4 + rand();
    const tomato = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), lambert(0xc02024));
    tomato.scale.y = 0.7;
    tomato.position.y = r * 0.6;
    t.add(tomato);
    for (let k = 0; k < 9; k++) {
      const a = rand() * Math.PI * 2;
      const tilt = 0.2 + rand() * 0.7;
      const pin = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, r * 1.2, 4), steel);
      shaft.position.y = r * 0.6;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), threads[k % threads.length]);
      head.position.y = r * 1.2;
      pin.add(shaft, head);
      pin.position.y = r * 0.6;
      pin.rotation.set(Math.cos(a) * tilt, 0, Math.sin(a) * tilt);
      t.add(pin);
    }
    return place(t, x, z, rand);
  };
  const needle: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const len = 12 + rand() * 6;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, len, 8), steel);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.y = 0.3;
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.2, 8), steel);
    point.rotation.z = Math.PI / 2;
    point.position.set(len / 2 + 0.6, 0.3, 0);
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 12), steel);
    eye.position.set(-len / 2, 0.3, 0);
    t.add(shaft, point, eye);
    // The thread through its eye, trailing off in loops across the floor.
    const pts: THREE.Vector3[] = [new THREE.Vector3(-len / 2, 0.3, 0)];
    for (let k = 1; k < 9; k++) pts.push(new THREE.Vector3(-len / 2 - k * 2.2, 0.15, Math.sin(k * 1.3) * 3 * (k / 8)));
    const cotton = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.1, 5, false), threads[Math.floor(rand() * threads.length)]);
    t.add(cotton);
    return place(t, x, z, rand);
  };
  const wool: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 2.2 + rand() * 1.2;
    const mat = wools[Math.floor(rand() * wools.length)];
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), mat);
    ball.position.y = r;
    t.add(ball);
    // Wound round and round.
    for (let k = 0; k < 5; k++) {
      const wind = new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, 0.12, 4, 24), mat);
      wind.position.y = r;
      wind.rotation.set(k * 0.7, k * 1.1, 0);
      t.add(wind);
    }
    for (const side of [-1, 1]) {
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, r * 3.2, 6), brass);
      n.position.set(side * 0.5, r * 1.2, 0);
      n.rotation.set(0.5, 0, side * 0.35);
      t.add(n);
    }
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [4, cup],
      [3, doily],
      [1.2, armchair],
      [1.4, lamp],
      [2, photo],
      [1.4, aspidistra],
      [3, spool],
      [1.5, pincushion],
      [1.5, needle],
      [2, wool],
    ])(x, z, rand);
}

// ---- Landmarks --------------------------------------------------------------------

/**
 * Nan's front door, the start: a panelled double door over the road
 * standing open, a fanlight glowing over it, and all down its frame and
 * its leaves the locks: deadbolts, padlocks on hasps, and chains hung
 * across, swaying.
 */
export function lockedDoor(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const H = 34;
  const paint = lambert(0x2a4a3a);
  const trim = lambert(0xeee4d0);
  const brass = glossy(0xd0a040, 110);
  const iron = glossy(0x3a3a40, 70);
  // The frame: two jambs and a lintel, the architrave round them.
  for (const side of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(2.6, H, 3), trim);
    jamb.position.set(side * (hw + 1.3), H / 2, 0);
    g.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 5.2, 2.6, 3), trim);
  lintel.position.y = H + 1.3;
  g.add(lintel);
  // The fanlight over it, glowing from the hall.
  const fan = new THREE.Mesh(new THREE.CircleGeometry(hw, 32, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xffd890, side: THREE.DoubleSide }));
  fan.position.y = H + 2.6;
  g.add(fan);
  for (let k = 1; k < 6; k++) {
    const a = (k / 6) * Math.PI;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, hw, 0.6), trim);
    bar.position.set((Math.cos(a) * hw) / 2, H + 2.6 + (Math.sin(a) * hw) / 2, 0.1);
    bar.rotation.z = a - Math.PI / 2;
    g.add(bar);
  }
  const arc = new THREE.Mesh(new THREE.TorusGeometry(hw, 0.8, 8, 32, Math.PI), trim);
  arc.position.y = H + 2.6;
  g.add(arc);
  sign(g, 'LET ME MEND THE PAST', '#2a4a3a', '#ffe8b0', hw * 1.4, H - 4);
  // The two leaves, swung open into the hall, each with its locks.
  const chains: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(side * hw, 0, 0.6);
    hinge.rotation.y = side * -1.75;
    const leafW = hw * 0.62;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafW, H - 0.5, 1), paint);
    leaf.position.set(-side * (leafW / 2), H / 2, 0);
    hinge.add(leaf);
    // Its panels.
    for (const [py, ph] of [[H * 0.25, H * 0.32], [H * 0.68, H * 0.42]]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(leafW * 0.7, ph, 1.2), lambert(0x22402f));
      panel.position.set(-side * (leafW / 2), py, 0);
      hinge.add(panel);
    }
    // Locks down the leaf's edge: deadbolts, a knob, padlocks on hasps.
    for (let k = 0; k < 6; k++) {
      const y = 6 + k * 4.2;
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 1.8), k % 2 ? brass : iron);
      box.position.set(-side * (leafW - 1.4), y, 0);
      hinge.add(box);
      if (k % 2 === 0) {
        const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.18, 6, 12, Math.PI), iron);
        shackle.position.set(-side * (leafW - 1.4), y + 0.9, 0);
        hinge.add(shackle);
      }
    }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), brass);
    knob.position.set(-side * (leafW - 1.2), H * 0.45, 0.9);
    hinge.add(knob);
    g.add(hinge);
    // Locks up the jamb too, and chains hung from it across the opening, swaying.
    for (let k = 0; k < 5; k++) {
      const bolt = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 2.2), k % 2 ? iron : brass);
      bolt.position.set(side * (hw + 0.2), 8 + k * 5, -1.5);
      g.add(bolt);
    }
    for (let k = 0; k < 2; k++) {
      const chain = new THREE.Group();
      chain.position.set(side * (hw + 0.2), 14 + k * 9, -1.5);
      const links = 9;
      for (let l = 0; l < links; l++) {
        const link = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.14, 5, 10), brass);
        link.position.set(-side * (l * 0.85), -Math.sin((l / (links - 1)) * Math.PI) * 1.6, 0);
        link.rotation.set(l % 2 ? Math.PI / 2 : 0, Math.PI / 2, 0);
        chain.add(link);
      }
      g.add(chain);
      chains.push(chain);
    }
  }
  animated.push((time) => chains.forEach((c, k) => (c.rotation.x = Math.sin(time * 1.4 + k) * 0.12)));
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * "Her cups on my wall": a stretch of nan's wall beside the road, papered,
 * a plate rack along it, and shelf on shelf of her teacups, hung by their
 * handles from hooks, saucers stood up behind them; one swings.
 */
export function teacups(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const W = 150;
  const H = 90;
  const wallMap = wallTex().clone();
  wallMap.needsUpdate = true;
  wallMap.repeat.set(W / 12, H / 30);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(W, H, 3), new THREE.MeshLambertMaterial({ map: wallMap }));
  wall.position.y = H / 2;
  g.add(wall);
  const wood = lambert(0x6a3a1a);
  const white = glossy(0xfbf8f2, 120);
  const gold = glossy(0xd8b048, 100);
  const chinas = chinaTex().map((map) => new THREE.MeshPhongMaterial({ map, shininess: 120, specular: 0xffffff, side: THREE.DoubleSide }));
  const swinging: THREE.Object3D[] = [];
  const shelves = 3;
  for (let k = 0; k < shelves; k++) {
    const y = 24 + k * 22;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 1.4, 8), wood);
    shelf.position.set(0, y, 5);
    g.add(shelf);
    const cups = 7;
    for (let c = 0; c < cups; c++) {
      const x = -W * 0.4 + ((c + 0.5) * W * 0.8) / cups;
      // A saucer stood up against the wall behind.
      const saucer = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.6, 28), chinas[(c + k) % chinas.length]);
      saucer.rotation.x = Math.PI / 2 - 0.15;
      saucer.position.set(x, y + 6.5, 3.2);
      g.add(saucer);
      // And the cup hung from a hook under the shelf.
      const hook = new THREE.Group();
      hook.position.set(x, y - 0.7, 6);
      const cup = teacup(6, chinas[(c + k + 1) % chinas.length], white, gold);
      cup.rotation.z = Math.PI * 0.08;
      cup.position.set(-2.4, -8, 0);
      const pin = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.15, 5, 10, Math.PI), gold);
      pin.rotation.z = Math.PI;
      hook.add(pin, cup);
      g.add(hook);
      if ((c + k) % 5 === 2) swinging.push(hook);
    }
  }
  // A plate rail along the top, plates stood on it.
  const rail = new THREE.Mesh(new THREE.BoxGeometry(W * 0.95, 1.2, 4), wood);
  rail.position.set(0, H - 8, 4);
  g.add(rail);
  for (let k = 0; k < 9; k++) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 0.6, 28), chinas[k % chinas.length]);
    plate.rotation.x = Math.PI / 2 - 0.2;
    plate.position.set(-W * 0.42 + (k * W * 0.84) / 8, H - 1.8, 3.5);
    g.add(plate);
  }
  animated.push((time) => swinging.forEach((h, k) => (h.rotation.z = Math.sin(time * 1.1 + k * 2) * 0.12)));
  g.position.set(at.x, 0, at.z);
  // Facing the road.
  g.rotation.y = at.heading + (lateral > 0 ? -Math.PI / 2 : Math.PI / 2);
  return g;
}

// ---- The cameras ---------------------------------------------------------------------

/**
 * The cameras an auntie put up in the hallway: one high on each wall on a
 * bracket, a red light on it, each throwing a cone of light down onto the
 * road where it's looking. Adds them to `obj` and returns the parts, for
 * HazardsView to pose each frame.
 */
export function cameraParts(obj: THREE.Object3D): THREE.Object3D[] {
  const body = lambert(0xe4e4e0);
  const dark = lambert(0x1a1a1e);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xc8e0ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const spotMat = new THREE.MeshBasicMaterial({ color: 0xe0f0ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  // A cone with its point at the origin and its base 1 along +z, radius 1.
  const cone = new THREE.ConeGeometry(1, 1, 20, 1, true);
  cone.translate(0, -0.5, 0);
  cone.rotateX(-Math.PI / 2);
  const spotGeo = new THREE.CircleGeometry(1, 28);
  spotGeo.rotateX(-Math.PI / 2);
  const parts: THREE.Object3D[] = [];
  const cams: THREE.Object3D[] = [];
  for (let k = 0; k < 2; k++) {
    const cam = new THREE.Group();
    const head = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 2.2), body);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 2.6), body);
    hood.position.y = 0.6;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14), dark);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 1.2;
    const rec = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    rec.position.set(0.4, 0.3, 1.1);
    head.add(box, hood, lens, rec);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 1.6), dark);
    arm.position.z = -1.2;
    cam.add(head, arm);
    cams.push(cam, head, rec);
  }
  parts.push(...cams);
  for (let k = 0; k < 2; k++) parts.push(new THREE.Mesh(cone, beamMat), new THREE.Mesh(spotGeo, spotMat.clone()));
  for (const o of parts) if (!o.parent) obj.add(o);
  return parts;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const aim = new THREE.Vector3();
const look = new THREE.Quaternion();
const turn = new THREE.Quaternion();

/**
 * Poses the cameras for a camera hazard's pose: the object sits at the
 * left beam's spot, turned to the road's heading; each camera is on its
 * own wall, looking down at its own beam's spot.
 */
export function poseCameras(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  obj.rotation.y = p.heading;
  const lp = p.gap - CAMERA_GAP / 2;
  // A lateral to the right is local -x, measured from the pose.
  const local = (lat: number) => -(lat - lp);
  for (let k = 0; k < 2; k++) {
    const side = k === 0 ? -1 : 1;
    const cam = parts[k * 3];
    const head = parts[k * 3 + 1];
    const rec = parts[k * 3 + 2];
    const beam = parts[6 + k * 2];
    const spot = parts[7 + k * 2];
    const wall = local(side * (p.radius + 0.3));
    const target = local(p.gap + (side * CAMERA_GAP) / 2);
    cam.position.set(wall, CAMERA_HEIGHT, 0);
    // The bracket off the wall, toward the road.
    cam.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2;
    aim.set(target - wall, -CAMERA_HEIGHT, 0).normalize();
    // The head looks along `aim`, in the camera's own turned frame.
    look.setFromUnitVectors(Z_AXIS, aim);
    turn.setFromAxisAngle(Y_AXIS, -cam.rotation.y);
    head.quaternion.copy(turn.multiply(look));
    (rec as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.color.setHex(Math.sin(elapsed * 6) > 0 ? 0xff2020 : 0x400808);
    const len = Math.hypot(target - wall, CAMERA_HEIGHT);
    beam.position.set(wall, CAMERA_HEIGHT, 0);
    beam.quaternion.copy(look);
    beam.scale.set(CAMERA_RADIUS, CAMERA_RADIUS, len);
    spot.position.set(target, 0.1, 0);
    spot.scale.setScalar(CAMERA_RADIUS);
    (spot as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.45 + 0.15 * Math.sin(elapsed * 23);
  }
}
