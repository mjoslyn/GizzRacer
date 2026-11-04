import * as THREE from 'three';
import { seededRandom } from '../core/math';
import type { HazardPose } from '../items/hazards';
import { BROOM_HEAD, BROOM_STAGES, BROOM_TAIL, BROOM_WAKE } from '../kits/sadieSorceress';
import type { PitDef } from '../tracks/builder';
import { nearestOnSpline, pointAt } from '../tracks/spline';
import type { Ribbon, Track } from '../tracks/track';
import { glowTexture } from './textures';

/**
 * Sadie Sorceress's world, the All Stars Cup #2's second: Sadie's night out
 * on the town, 80s roller disco and witchcraft, and the town's night out
 * after her with pitchforks. Night, neon pink and toxic green under a
 * violet sky and a sickly moon. Its textures (the road an 80s roller rink's
 * maple floor, pale and polished, its painted lines in neon; dark heath
 * with poison moss for the ground; crypt brick for the masquerade's walls;
 * a padded rink rail with chase lights running along it), its scenery
 * (crooked cottages with lit windows, twisted trees, glowing toadstools,
 * cauldrons, broomsticks stuck in the ground, black cats, boomboxes, giant
 * skates, crushed tinnies and whisky bottles, scrap metal and amp stacks,
 * nightshade, oleander and buttercups, haystacks with pitchforks in them,
 * circus wagons), its landmarks (the roller rink's neon arch at the start,
 * Sadie herself skating on the spot in her lair at the star's heart, the
 * Quidditch hoops over the leap, the masks of the masquerade, the lanterns
 * along her flight path, the poison garden, Millicent's cottage, the
 * pitchfork mob, the ducking stool over the pond, the circus big top, the
 * pool of poison under the buttercups' planks) and its hazard's look
 * (Sadie on her broomstick, her trail of sparks, and her line across the
 * road glowing before she swoops).
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type Animated = ((time: number) => void)[];
type RGB = [number, number, number];

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

/** Made once and shared: the textures go on hundreds of meshes. */
function once<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
}

// The canvas painting, as textures.ts does it.

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Tileable fractal value noise, roughly 0..1. */
function fbm(size: number, basePeriod: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const period = basePeriod << o;
    const rand = seededRandom(seed + o * 101);
    const grid = Float32Array.from({ length: period * period }, () => rand());
    const cell = size / period;
    for (let y = 0; y < size; y++) {
      const gy = y / cell;
      const y0 = Math.floor(gy) % period;
      const y1 = (y0 + 1) % period;
      let ty = gy - Math.floor(gy);
      ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const gx = x / cell;
        const x0 = Math.floor(gx) % period;
        const x1 = (x0 + 1) % period;
        let tx = gx - Math.floor(gx);
        tx = tx * tx * (3 - 2 * tx);
        const a = grid[y0 * period + x0] + (grid[y0 * period + x1] - grid[y0 * period + x0]) * tx;
        const b = grid[y1 * period + x0] + (grid[y1 * period + x1] - grid[y1 * period + x0]) * tx;
        out[y * size + x] += (a + (b - a) * ty) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

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

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c: RGB, f: number): RGB => [c[0] * f, c[1] * f, c[2] * f];

/** Neon pink, toxic green, violet, the sickly moon's yellow-green, and the warm light of lit windows and torches. */
const PINK = 0xff2a9a;
const TOXIC = 0x8aff2a;
const CYAN = 0x2ae8ff;
const FLAME = 0xff8a2a;
const WINDOW = 0xffc860;

/** Old school hip-hop, about 92 beats a minute. */
const BEAT = 92 / 60;
const beatPhase = (time: number) => (time * BEAT) % 1;
/** A kick: 1 on the beat, falling away fast. */
const kick = (time: number) => Math.exp(-beatPhase(time) * 7);
/** The ducking pond's surface, as trackView.ts's WATER_LEVEL. */
const WATER = -2.5;

/**
 * The road: an 80s roller rink's floor, strips of pale maple polished to a
 * shine, scuffed by wheels. The texture spans half the road and repeats
 * across it (its left and right edges fall on the road's edges and its
 * middle): boards of honey maple in a few shades with their end joints
 * staggered, wheel scuffs, a dashed toxic green line down the middle (and
 * under the pink edge lines), and a thin neon pink lane line half way out
 * on each side. It reads pale against the dark heath.
 */
export function rinkRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const grain = fbm(S, 4, 4, 9101);
  const fine = fbm(S, 32, 2, 9102);
  const rand = seededRandom(9103);
  const BOARDS = 11;
  const tones: RGB[] = Array.from({ length: BOARDS }, () => mix([206, 150, 92], [236, 196, 140], rand()));
  // Where along each board its end joint falls.
  const joints = Array.from({ length: BOARDS }, () => Math.floor(rand() * S));
  paint(ctx, S, S, (x, y, i) => {
    const bu = x / S;
    const k = Math.min(BOARDS - 1, Math.floor(bu * BOARDS));
    const within = bu * BOARDS - k;
    // The grain runs along the boards: noise stretched along v.
    const g = grain[((y * 1) % S) * S + ((x * 7 + k * 37) % S)];
    let col = shade(tones[k], 0.86 + 0.22 * g + 0.06 * fine[i]);
    // The seams between boards, and each board's end joint.
    if (within < 0.04 || within > 0.96) col = shade(col, 0.62);
    if (Math.abs(y - joints[k]) < 1) col = shade(col, 0.58);
    return col;
  });
  // Wheel scuffs: thin dark arcs.
  ctx.lineWidth = 1;
  for (let k = 0; k < 40; k++) {
    ctx.strokeStyle = `rgba(60,36,24,${0.12 + rand() * 0.18})`;
    ctx.beginPath();
    const r = 20 + rand() * 90;
    const a = rand() * Math.PI * 2;
    ctx.arc(S * (0.15 + rand() * 0.8), rand() * S, r, a, a + 0.4 + rand() * 0.6);
    ctx.stroke();
  }
  // The lane lines, neon pink, half way out each side.
  ctx.fillStyle = 'rgba(255,60,170,1)';
  ctx.fillRect(S / 2 - 3, 0, 6, S);
  ctx.fillStyle = 'rgba(255,200,236,0.8)';
  ctx.fillRect(S / 2 - 1, 0, 2, S);
  // A dashed toxic green line down the middle, straddling the texture's seam.
  ctx.fillStyle = 'rgba(140,255,60,1)';
  for (let y = 0; y < S; y += 64) {
    ctx.fillRect(S - 4, y + 10, 4, 34);
    ctx.fillRect(0, y + 10, 4, 34);
  }
  return finish(c);
}

/** The ground: dark heath at night, violet-black earth and dead grass, patches of poison moss, a few glowing flecks. */
export function hexGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 5, 9111);
  const patch = fbm(S, 4, 3, 9112);
  paint(ctx, S, S, (_x, _y, i) => {
    const earth: RGB = [44, 34, 54];
    const heath: RGB = [64, 54, 72];
    const moss: RGB = [40, 72, 34];
    const base = patch[i] < 0.42 ? mix(moss, earth, patch[i] / 0.42) : mix(earth, heath, Math.min(1, (patch[i] - 0.42) * 2));
    return shade(base, 0.78 + n[i] * 0.4);
  });
  const rand = seededRandom(9113);
  for (let k = 0; k < 7000; k++) {
    const r = rand();
    ctx.fillStyle = r < 0.45 ? 'rgba(20,14,26,0.5)' : r < 0.85 ? 'rgba(96,84,104,0.45)' : r < 0.97 ? 'rgba(70,110,50,0.5)' : 'rgba(170,255,90,0.6)';
    ctx.fillRect(rand() * S, rand() * S, r < 0.45 ? 2 : 1, r > 0.45 && r < 0.85 ? 3 : 1.5);
  }
  return finish(c);
}

/** The masquerade's walls and the world's edge: crypt brick, violet-black, moss down it, the odd brick glowing toxic green. */
export function cryptWallTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 9121);
  const rand = seededRandom(9122);
  const rows = 8;
  const glow = new Set(Array.from({ length: 5 }, () => Math.floor(rand() * rows * 4)));
  paint(ctx, S, S, (x, y, i) => {
    const row = Math.floor((y / S) * rows);
    const off = row % 2 ? S / 8 : 0;
    const col = Math.floor(((x + off) % S) / (S / 4));
    const bx = ((x + off) % (S / 4)) / (S / 4);
    const by = ((y / S) * rows) % 1;
    if (bx < 0.04 || by < 0.08) return [16, 10, 20];
    if (glow.has(row * 4 + col)) return shade([110, 230, 70], 0.6 + 0.4 * n[i]);
    return shade(mix([54, 40, 66], [80, 64, 92], n[i]), 0.85 + 0.2 * ((row * 7 + col * 3) % 5) / 5);
  });
  for (let k = 0; k < 14; k++) {
    const x = rand() * S;
    const len = S * (0.2 + rand() * 0.5);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(60,110,40,0.55)');
    g.addColorStop(1, 'rgba(60,110,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 2 + rand() * 4, len);
  }
  return finish(c);
}

/** The barrier: a roller rink's padded rail, black vinyl, a neon pink tube along the top and chase lights below it in pink and green. */
export function rinkRailTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#120a16';
  ctx.fillRect(0, 0, W, H);
  // Padding seams.
  ctx.fillStyle = '#22162a';
  for (let x = 0; x < W; x += 32) ctx.fillRect(x, 10, 2, H - 10);
  ctx.fillStyle = 'rgba(255,60,170,1)';
  ctx.fillRect(0, 2, W, 7);
  ctx.fillStyle = 'rgba(255,210,240,0.9)';
  ctx.fillRect(0, 4, W, 2);
  for (let k = 0; k < 8; k++) {
    const g = ctx.createRadialGradient(16 + k * 32, 38, 0, 16 + k * 32, 38, 10);
    const col = k % 2 ? '140,255,60' : '255,60,170';
    g.addColorStop(0, `rgba(255,255,255,1)`);
    g.addColorStop(0.35, `rgba(${col},1)`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(k * 32, 26, 32, 26);
  }
  return finish(c);
}

const glowTex = once(() => glowTexture());

function sprite(color: number, size: number, opacity = 1, fog = true): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog }));
  s.scale.setScalar(size);
  return s;
}

/** A puff of smoke or steam: a soft sprite, not additive. */
function smoke(color: number, size: number, opacity = 0.6): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size);
  return s;
}

/** Where the ribbon is at `s`, and its heading. */
function frameAt(ribbon: Ribbon, s: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x, z: p.z, y: ribbon.heightAt(s), heading: Math.atan2(p.tx, p.tz), tx: p.tx, tz: p.tz };
}

/** Where a landmark `lateral` metres off the road at `s` stands (a lateral to the right is positive). */
function offRoad(ribbon: Ribbon, s: number, lateral: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x - p.tz * lateral, z: p.z + p.tx * lateral, heading: Math.atan2(p.tx, p.tz) };
}

/**
 * The tip of a star point the road goes round from `s` to `to`: the middle
 * of the bend, and the way out from the bend's chord to it (away from the
 * star's heart).
 */
function pointTip(ribbon: Ribbon, s: number, to: number) {
  const a = frameAt(ribbon, s);
  const b = frameAt(ribbon, to);
  const m = frameAt(ribbon, (s + to) / 2);
  const dx = m.x - (a.x + b.x) / 2;
  const dz = m.z - (a.z + b.z) / 2;
  const d = Math.hypot(dx, dz) || 1;
  return { x: m.x, z: m.z, y: m.y, ox: dx / d, oz: dz / d, heading: Math.atan2(dx, dz), hw: ribbon.halfWidthAtS((s + to) / 2) };
}

function place(t: THREE.Object3D, x: number, z: number, rand: () => number): THREE.Object3D {
  t.position.set(x, 0, z);
  t.rotation.y = rand() * Math.PI * 2;
  return t;
}

function pick(rand: () => number, kinds: [number, Feature][]): Feature {
  const total = kinds.reduce((s, [w]) => s + w, 0);
  let r = rand() * total;
  for (const [w, f] of kinds) if ((r -= w) <= 0) return f;
  return kinds[kinds.length - 1][1];
}

/** A neon sign's face: glowing letters on black, a tube round it. */
const neonFace = (() => {
  const made = new Map<string, THREE.CanvasTexture>();
  return (lines: string[], fg = '#ff3aa8', glow = '#ff70c8', bg = '#0a0610'): THREE.CanvasTexture => {
    const key = `${lines.join('|')}|${fg}|${bg}`;
    let t = made.get(key);
    if (t) return t;
    const W = 512;
    const H = 256;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.shadowColor = glow;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(16, 16, W - 32, H - 32);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = lines.length === 1 ? 92 : lines.length === 2 ? 70 : 52;
    ctx.font = `italic 900 ${size}px 'Arial Black', Impact, sans-serif`;
    lines.forEach((line, k) => {
      const w = ctx.measureText(line).width;
      ctx.save();
      ctx.translate(W / 2, H / 2 + (k - (lines.length - 1) / 2) * size * 1.1);
      if (w > W - 60) ctx.scale((W - 60) / w, 1);
      ctx.shadowBlur = 24;
      ctx.fillStyle = fg;
      ctx.fillText(line, 0, 0);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
    t = finish(c, false);
    made.set(key, t);
    return t;
  };
})();

/** A sign `w` wide (half as high), its face toward -z and +z, unlit so it glows in the dark. */
function neonSign(w: number, map: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, w / 2);
  const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map }));
  front.rotation.y = Math.PI;
  front.position.z = -0.12;
  const rear = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map }));
  rear.position.z = 0.12;
  const board = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, w / 2 + 0.3, 0.2), blackGloss());
  g.add(board, front, rear);
  return g;
}

// Materials.

const blackGloss = once(() => new THREE.MeshPhongMaterial({ color: 0x120c14, specular: 0x806080, shininess: 70 }));
const black = once(() => lambert(0x140e16));
const bark = once(() => lambert(0x2a2024, { flatShading: true }));
const wood = once(() => lambert(0x5a4434));
const straw = once(() => lambert(0xc8a850, { flatShading: true }));
const iron = once(() => lambert(0x2a2a30));
const steel = once(() => new THREE.MeshPhongMaterial({ color: 0x9a9aa8, specular: 0xffffff, shininess: 80 }));
const neonPink = once(() => new THREE.MeshBasicMaterial({ color: PINK }));
const neonGreen = once(() => new THREE.MeshBasicMaterial({ color: TOXIC }));
const brew = once(() => new THREE.MeshBasicMaterial({ color: 0x6aee30 }));
const skin = once(() => lambert(0xb8d4a0));
const windowLit = once(() => new THREE.MeshBasicMaterial({ color: WINDOW }));
const plaster = once(() => lambert(0x8a7e8a));
const thatch = once(() => lambert(0x5a4a34, { flatShading: true }));

/** Striped stockings, purple and black, round a leg. */
const stockingTexture = once(() => {
  const [c, ctx] = canvas(16, 64);
  for (let y = 0; y < 64; y += 8) {
    ctx.fillStyle = '#7a2ad0';
    ctx.fillRect(0, y, 16, 4);
    ctx.fillStyle = '#140a18';
    ctx.fillRect(0, y + 4, 16, 4);
  }
  const t = finish(c);
  t.repeat.set(1, 3);
  return t;
});

/** Scales: the leviathan's on her cardigan in teal, the dragon's on her knapsack in green. */
const scaleTexture = (() => {
  const made = new Map<string, THREE.CanvasTexture>();
  return (dark: string, light: string): THREE.CanvasTexture => {
    const key = dark + light;
    let t = made.get(key);
    if (t) return t;
    const S = 128;
    const [c, ctx] = canvas(S);
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, S, S);
    const r = 12;
    for (let row = -1; row < S / r + 1; row++) {
      for (let col = -1; col < S / (2 * r) + 1; col++) {
        const x = col * 2 * r + (row % 2 ? r : 0);
        const y = row * r;
        const g = ctx.createRadialGradient(x, y - r * 0.4, 1, x, y, r);
        g.addColorStop(0, light);
        g.addColorStop(1, dark);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.stroke();
      }
    }
    t = finish(c);
    t.repeat.set(3, 3);
    made.set(key, t);
    return t;
  };
})();

/** Her freak flag: neon zigzags and a pentagram in a ring, on black. */
const flagTexture = once(() => {
  const W = 256;
  const H = 160;
  const [c, ctx] = canvas(W, H);
  const bands = ['#ff2a9a', '#8aff2a', '#2ae8ff', '#ffe02a', '#8a3aff'];
  bands.forEach((b, k) => {
    ctx.strokeStyle = b;
    ctx.lineWidth = 12;
    ctx.beginPath();
    for (let x = -20; x <= W + 20; x += 20) ctx.lineTo(x, 22 + k * 28 + ((x / 20) % 2 ? 10 : -10));
    ctx.stroke();
  });
  ctx.fillStyle = 'rgba(10,6,16,0.75)';
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 50, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.beginPath();
  for (let k = 0; k <= 5; k++) {
    const a = -Math.PI / 2 + (k * 4 * Math.PI) / 5;
    ctx.lineTo(W / 2 + Math.cos(a) * 44, H / 2 + Math.sin(a) * 44);
  }
  ctx.stroke();
  return finish(c, false);
});

/** A roller blade: a black boot trimmed pink, four wheels glowing green in a line under it, along +z. */
function rollerBlade(size: number): THREE.Group {
  const g = new THREE.Group();
  const boot = new THREE.Mesh(new THREE.BoxGeometry(0.5 * size, 0.7 * size, 1.1 * size), blackGloss());
  boot.position.set(0, 0.55 * size, 0.1 * size);
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.55 * size, 0.12 * size, 0.6 * size), neonPink());
  cuff.position.set(0, 0.9 * size, -0.1 * size);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12 * size, 0.12 * size, 1.15 * size), steel());
  frame.position.set(0, 0.2 * size, 0.1 * size);
  g.add(boot, cuff, frame);
  for (let k = 0; k < 4; k++) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * size, 0.15 * size, 0.1 * size, 12), neonGreen());
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.15 * size, (-0.38 + k * 0.32) * size);
    g.add(wheel);
  }
  return g;
}

/** A witch's hat: a tall black cone bent at the tip, a wide brim, a neon pink band. Its foot at the origin. */
function witchHat(size: number): THREE.Group {
  const g = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.1 * size, 1.1 * size, 0.06 * size, 20), black());
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.55 * size, 1.4 * size, 16), black());
  crown.position.y = 0.7 * size;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.52 * size, 0.55 * size, 0.16 * size, 16), neonPink());
  band.position.y = 0.12 * size;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16 * size, 0.6 * size, 8), black());
  tip.position.set(0.18 * size, 1.45 * size, 0);
  tip.rotation.z = -0.9;
  g.add(brim, crown, band, tip);
  return g;
}

/** A broomstick, along +y from its tip: a crooked shaft, and bristles bound at the foot. `len` long. */
function broomstick(len: number): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * len, 0.045 * len, len, 7), wood());
  shaft.position.y = len / 2;
  const bristles = new THREE.Mesh(new THREE.ConeGeometry(0.16 * len, 0.36 * len, 10), straw());
  bristles.position.y = len + 0.1 * len;
  const bind = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * len, 0.06 * len, 0.06 * len, 8), neonPink());
  bind.position.y = len - 0.04 * len;
  g.add(shaft, bristles, bind);
  return g;
}

/**
 * Sadie, `size` metres to the top of her hat: an 80s lady and a witch.
 * Rollerblades, striped stockings, a black skirt with a pink hem, a
 * leviathan-scale cardigan, a mastodon's fur pelt round her shoulders with
 * its little tusks, a dragon-scale knapsack, sickly green skin, big violet
 * 80s hair, a witch's hat, a long nose with enormous moles on it, a
 * cackling mouth and glowing pink eyes. Stands at the origin facing +z.
 */
function sadieFigure(size: number) {
  const k = size / 4.2;
  const g = new THREE.Group();
  const legs: THREE.Group[] = [];
  const stocking = lambert(0xffffff, { map: stockingTexture() });
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.22 * k, 1.75 * k, 0);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * k, 0.11 * k, 1.5 * k, 8), stocking);
    shin.position.y = -0.75 * k;
    const blade = rollerBlade(0.55 * k);
    blade.position.y = -1.75 * k;
    leg.add(shin, blade);
    g.add(leg);
    legs.push(leg);
  }
  const body = new THREE.Group();
  body.position.y = 1.6 * k;
  g.add(body);
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.75 * k, 1.0 * k, 14, 1, true), lambert(0x140a18, { side: THREE.DoubleSide }));
  skirt.position.y = 0.45 * k;
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.72 * k, 0.05 * k, 6, 20), neonPink());
  hem.rotation.x = Math.PI / 2;
  hem.position.y = -0.03 * k;
  const cardiganMat = lambert(0xffffff, { map: scaleTexture('#0a4a54', '#3ae0c8') });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * k, 0.5 * k, 1.1 * k, 12), cardiganMat);
  torso.position.y = 1.4 * k;
  // The mastodon's pelt: shaggy brown fur round her shoulders, its two little tusks curling at the front.
  const pelt = new THREE.Mesh(new THREE.TorusGeometry(0.48 * k, 0.2 * k, 6, 12), lambert(0x5a3a22, { flatShading: true }));
  pelt.rotation.x = Math.PI / 2;
  pelt.position.y = 1.9 * k;
  body.add(skirt, hem, torso, pelt);
  for (const side of [-1, 1]) {
    const tusk = new THREE.Mesh(new THREE.TorusGeometry(0.16 * k, 0.03 * k, 5, 10, Math.PI), lambert(0xeee4c8));
    tusk.position.set(side * 0.18 * k, 1.78 * k, 0.55 * k);
    tusk.rotation.set(0, Math.PI / 2, 0);
    body.add(tusk);
  }
  // The dragon-scale knapsack, spiny.
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.7 * k, 0.8 * k, 0.4 * k), lambert(0xffffff, { map: scaleTexture('#0a3a10', '#5aee3a') }));
  pack.position.set(0, 1.4 * k, -0.62 * k);
  body.add(pack);
  for (let s = 0; s < 3; s++) {
    const spine = new THREE.Mesh(new THREE.ConeGeometry(0.08 * k, 0.3 * k, 5), lambert(0xc8ff60));
    spine.position.set(0, 1.85 * k - s * 0.28 * k, -0.86 * k);
    spine.rotation.x = -1.2;
    body.add(spine);
  }
  // Arms in the cardigan; the right holds her broomstick, the left a winnie, smoking.
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.55 * k, 1.85 * k, 0);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * k, 0.13 * k, 1.1 * k, 8), cardiganMat);
    sleeve.position.y = -0.5 * k;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.12 * k, 8, 6), skin());
    hand.position.y = -1.1 * k;
    arm.add(sleeve, hand);
    arm.rotation.z = side * 0.35;
    body.add(arm);
    arms.push(arm);
  }
  const head = new THREE.Group();
  head.position.y = 2.25 * k;
  body.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.36 * k, 14, 12), skin());
  face.scale.set(0.9, 1.1, 0.95);
  face.position.y = 0.3 * k;
  // Big 80s hair, violet, teased out round her face.
  const hairMat = lambert(0x6a2aa0, { flatShading: true });
  const hairRand = seededRandom(9301);
  for (let h = 0; h < 14; h++) {
    const a = (h / 14) * Math.PI * 2;
    if (Math.abs(Math.sin(a / 2)) < 0.2 && Math.cos(a) > 0) continue;
    const curl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 * k * (0.8 + hairRand() * 0.5), 0), hairMat);
    curl.position.set(Math.sin(a) * 0.42 * k, (0.2 + hairRand() * 0.35) * k, Math.cos(a) * 0.36 * k - 0.08 * k);
    if (Math.cos(a) > 0.6) curl.position.y += 0.25 * k;
    head.add(curl);
  }
  // The nose, long and hooked, and the moles on it, so enormous.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08 * k, 0.45 * k, 8), skin());
  nose.rotation.x = Math.PI / 2 + 0.25;
  nose.position.set(0, 0.25 * k, 0.48 * k);
  const moleMat = lambert(0x2a1a14);
  const moleA = new THREE.Mesh(new THREE.SphereGeometry(0.06 * k, 8, 6), moleMat);
  moleA.position.set(0.05 * k, 0.29 * k, 0.5 * k);
  const moleB = new THREE.Mesh(new THREE.SphereGeometry(0.045 * k, 8, 6), moleMat);
  moleB.position.set(-0.04 * k, 0.21 * k, 0.6 * k);
  // The mouth, cackling.
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.13 * k, 10, 6), lambert(0x2a0812));
  mouth.scale.set(1.2, 0.5, 0.4);
  mouth.position.set(0, 0.08 * k, 0.3 * k);
  const eyes: THREE.Sprite[] = [];
  for (const side of [-1, 1]) {
    const eye = sprite(PINK, 0.32 * k, 1, false);
    eye.position.set(side * 0.13 * k, 0.42 * k, 0.32 * k);
    head.add(eye);
    eyes.push(eye);
  }
  const hat = witchHat(0.7 * k);
  hat.position.y = 0.62 * k;
  hat.rotation.z = -0.15;
  head.add(face, nose, moleA, moleB, mouth, hat);
  return { group: g, body, head, legs, arms, mouth, eyes, k };
}

/**
 * Sadie, flying: astride her broomstick (along +z, its tip ahead), her
 * skirt and hair streaming, rollerblades dangling, her handbag swinging
 * off the end of the broom. About the size of a kart and a half.
 */
function flyingSadie() {
  const g = new THREE.Group();
  const broom = broomstick(BROOM_HEAD + BROOM_TAIL + 0.6);
  broom.rotation.x = -Math.PI / 2;
  broom.position.z = BROOM_HEAD + 0.3;
  g.add(broom);
  const s = sadieFigure(3.4);
  // Sitting: lean her forward over the shaft, her legs dangling forward.
  s.group.position.set(0, -0.75, -0.1);
  s.body.rotation.x = 0.45;
  for (const leg of s.legs) leg.rotation.x = -1.1;
  s.arms.forEach((a) => (a.rotation.x = -1.2));
  g.add(s.group);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.2), neonPink());
  bag.position.set(0, -0.45, -BROOM_TAIL + 0.6);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 4, 10, Math.PI), black());
  strap.position.set(0, -0.27, -BROOM_TAIL + 0.6);
  g.add(bag, strap);
  return { group: g, sadie: s, bag };
}

/**
 * The night town round the pentagram, scenery by where it stands along the
 * lap: boomboxes and giant skates by the rink, crushed tinnies, whisky
 * bottles and smouldering winnies round the bottle shop, cauldrons of
 * blood, scrap heaps and amp stacks by the metal, flagpoles flying
 * handbags, the crooked cottages of the town under her flight path,
 * nightshade, oleander and buttercups in the poison garden, haystacks
 * with pitchforks in them in the village, reeds by the pond, circus
 * wagons; everywhere twisted trees, glowing toadstools, broomsticks stuck
 * in the ground, black cats on posts and witches' hats. Nothing in her
 * lair at the star's heart.
 */
export function sorceryFeature(animated: Animated, track?: Track): Feature {
  const sectionAt = (x: number, z: number): string => {
    if (!track) return '';
    const hit = nearestOnSpline(track.spline, x, z);
    return track.main.def.sections[track.main.sectionIndex[hit.index]]?.name ?? '';
  };
  const tree: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 5 + rand() * 6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.55, h, 6), bark());
    trunk.position.y = h / 2;
    trunk.rotation.z = (rand() - 0.5) * 0.3;
    t.add(trunk);
    for (let k = 0; k < 5; k++) {
      const len = 1.5 + rand() * 3;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, len, 5), bark());
      const a = rand() * Math.PI * 2;
      br.position.set(Math.cos(a) * len * 0.35, h * (0.5 + rand() * 0.45), Math.sin(a) * len * 0.35);
      br.rotation.set(Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0);
      t.add(br);
    }
    if (rand() < 0.4) {
      // A lantern carved from a pumpkin hung off a bough, grinning.
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), lambert(0xe86a10, { emissive: 0x803000 }));
      lantern.scale.y = 0.8;
      lantern.position.set(1.2, h * 0.6, 0);
      const glow = sprite(FLAME, 2.2, 0.6);
      glow.position.copy(lantern.position);
      t.add(lantern, glow);
    }
    return place(t, x, z, rand);
  };
  const capMat = lambert(0x3a8a20, { emissive: 0x1a5a08 });
  const stalkMat = lambert(0xd8d0b8);
  const toadstools: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 3 + Math.floor(rand() * 5);
    for (let k = 0; k < n; k++) {
      const h = 0.6 + rand() * 1.8;
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * h, 0.16 * h, h, 7), stalkMat);
      stalk.position.set((rand() - 0.5) * 4, h / 2, (rand() - 0.5) * 4);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.45 * h, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
      cap.position.set(stalk.position.x, h, stalk.position.z);
      t.add(stalk, cap);
    }
    const glow = sprite(TOXIC, 5, 0.35);
    glow.position.y = 1;
    t.add(glow);
    return place(t, x, z, rand);
  };
  const cauldron = (blood: boolean): Feature => (x, z, rand) => {
    const t = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.SphereGeometry(1.3, 14, 10, 0, Math.PI * 2, Math.PI * 0.25, Math.PI * 0.75), iron());
    pot.position.y = 1.2;
    const surface = new THREE.Mesh(new THREE.CircleGeometry(0.95, 16), blood ? new THREE.MeshBasicMaterial({ color: 0xa0081a }) : brew());
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = 2.1;
    const fire = sprite(FLAME, 3, 0.7);
    fire.position.y = 0.2;
    t.add(pot, surface, fire);
    const bubbles: THREE.Sprite[] = [];
    for (let k = 0; k < 5; k++) {
      const b = blood ? smoke(0x501018, 1.2, 0.5) : sprite(TOXIC, 1, 0.6);
      t.add(b);
      bubbles.push(b);
    }
    const ph = rand() * 5;
    animated.push((time) => {
      bubbles.forEach((b, k) => {
        const v = (time * 0.4 + k / bubbles.length + ph) % 1;
        b.position.set(Math.sin(k * 2 + ph) * 0.5, 2.2 + v * 4, Math.cos(k * 3 + ph) * 0.5);
        b.material.opacity = 0.6 * (1 - v);
      });
      fire.material.opacity = 0.5 + 0.3 * Math.sin(time * 9 + ph);
    });
    return place(t, x, z, rand);
  };
  const brooms: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 2 + Math.floor(rand() * 3); k++) {
      const b = broomstick(2.4 + rand());
      b.rotation.set((rand() - 0.5) * 0.3, rand() * 3, Math.PI + (rand() - 0.5) * 0.3);
      b.position.set((rand() - 0.5) * 3, 3.2, (rand() - 0.5) * 3);
      t.add(b);
    }
    return place(t, x, z, rand);
  };
  const catMat = lambert(0x08060a);
  const cat: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2, 0.3), wood());
    post.position.y = 1;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), catMat);
    body.scale.set(0.8, 1.2, 0.8);
    body.position.y = 2.35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), catMat);
    head.position.y = 2.95;
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 4, 10, Math.PI * 1.2), catMat);
    tail.position.set(0, 2.5, -0.3);
    tail.rotation.y = Math.PI / 2;
    t.add(post, body, head, tail);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 4), catMat);
      ear.position.set(side * 0.12, 3.15, 0);
      const eye = sprite(TOXIC, 0.3, 1, false);
      eye.position.set(side * 0.08, 2.98, 0.22);
      t.add(ear, eye);
    }
    return place(t, x, z, rand);
  };
  const hats: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.2), wood());
    post.position.y = 1.3;
    const hat = witchHat(0.9);
    hat.position.y = 2.6;
    t.add(post, hat);
    return place(t, x, z, rand);
  };
  const cottage: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 5 + rand() * 3;
    const d = 4 + rand() * 2;
    const h = 3 + rand() * 2;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), plaster());
    walls.position.y = h / 2;
    walls.rotation.z = (rand() - 0.5) * 0.08;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 3 + rand() * 2, 4), thatch());
    roof.rotation.y = Math.PI / 4;
    roof.position.y = h + 1.6;
    roof.rotation.z = (rand() - 0.5) * 0.15;
    t.add(walls, roof);
    // Timbers across the walls, and its windows lit.
    for (let k = 0; k < 3; k++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.2, d + 0.05), black());
      beam.position.y = 0.4 + k * (h / 2.4);
      t.add(beam);
    }
    for (const side of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), windowLit());
      win.position.set(side * w * 0.25, h * 0.55, d / 2 + 0.03);
      t.add(win);
    }
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.8), lambert(0x4a3036));
    chimney.position.set(w * 0.3, h + 2, 0);
    t.add(chimney);
    const glow = sprite(WINDOW, 6, 0.25);
    glow.position.set(0, h * 0.55, d / 2 + 1);
    t.add(glow);
    return place(t, x, z, rand);
  };
  // The rink: boomboxes pumping on the beat, giant skates.
  const boombox: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const s = 1.6 + rand() * 1.4;
    const box = new THREE.Mesh(new THREE.BoxGeometry(3 * s, 1.6 * s, 0.9 * s), lambert(0x2a2a32));
    box.position.y = 0.8 * s;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(1.1 * s, 0.08 * s, 5, 16, Math.PI), steel());
    handle.position.y = 1.6 * s;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.9 * s, 0.5 * s, 0.05), lambert(0x101014));
    deck.position.set(0, 0.95 * s, 0.46 * s);
    t.add(box, handle, deck);
    const cones: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const cone = new THREE.Mesh(new THREE.CircleGeometry(0.55 * s, 18), lambert(0x18181c, { emissive: 0x200818 }));
      cone.position.set(side * 0.95 * s, 0.8 * s, 0.46 * s);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55 * s, 0.65 * s, 20), side < 0 ? neonPink() : neonGreen());
      ring.position.copy(cone.position).add(new THREE.Vector3(0, 0, 0.01));
      t.add(cone, ring);
      cones.push(cone);
    }
    const ph = rand();
    animated.push((time) => {
      const p = 1 + 0.12 * kick(time + ph * 0.1);
      cones.forEach((c) => c.scale.set(p, p, 1));
    });
    return place(t, x, z, rand);
  };
  const skate: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const s = rollerBlade(2.5 + rand() * 2);
    s.rotation.z = rand() < 0.5 ? 0 : Math.PI / 2;
    if (s.rotation.z) s.position.y = 0.6;
    t.add(s);
    return place(t, x, z, rand);
  };
  // The bottle shop: tinnies crushed, whisky bottles, winnies smouldering.
  const canMats = [lambert(0xd8202a), lambert(0x2a6ad8), lambert(0xe8c020), lambert(0x30a040)];
  const bottleMat = new THREE.MeshPhongMaterial({ color: 0x8a5a14, transparent: true, opacity: 0.8, shininess: 100 });
  const tinnies: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.5 * (0.5 + rand() * 0.5), 12), canMats[Math.floor(rand() * canMats.length)]);
      can.position.set((rand() - 0.5) * 5, 0.5, (rand() - 0.5) * 5);
      can.rotation.set(rand() < 0.5 ? Math.PI / 2 : 0, rand() * 3, 0);
      t.add(can);
    }
    const bottle = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 3, 4), bottleMat);
    glass.position.y = 1.5;
    glass.rotation.y = Math.PI / 4;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.2, 8), bottleMat);
    neck.position.y = 3.6;
    bottle.add(glass, neck);
    bottle.position.set(2, 0, 2);
    t.add(bottle);
    // A winnie, still smouldering.
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.2, 8), lambert(0xf0ece0));
    butt.rotation.z = Math.PI / 2;
    butt.position.set(-2, 0.15, 1);
    const ember = sprite(0xff4010, 0.7, 0.9);
    ember.position.set(-0.9, 0.2, 1);
    t.add(butt, ember);
    const puff = smoke(0xa098a8, 2, 0.4);
    t.add(puff);
    const ph = rand() * 4;
    animated.push((time) => {
      const v = (time * 0.25 + ph) % 1;
      puff.position.set(-0.9 + v * 1.5, 0.4 + v * 5, 1);
      puff.scale.setScalar(1 + v * 3);
      puff.material.opacity = 0.4 * (1 - v);
    });
    return place(t, x, z, rand);
  };
  // Meddles in the metal: scrap heaps and amp stacks.
  const scrapMats = [lambert(0x6a5a50, { flatShading: true }), lambert(0x7a3a20, { flatShading: true }), steel()];
  const scrap: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 8; k++) {
      const s = 0.8 + rand() * 2;
      const geo = rand() < 0.5 ? new THREE.BoxGeometry(s * 2, s * 0.3, s) : new THREE.CylinderGeometry(s * 0.4, s * 0.4, s * 1.6, 8);
      const m = new THREE.Mesh(geo, scrapMats[Math.floor(rand() * scrapMats.length)]);
      m.position.set((rand() - 0.5) * 5, rand() * 2.2, (rand() - 0.5) * 5);
      m.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      t.add(m);
    }
    return place(t, x, z, rand);
  };
  const amps: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const grille = lambert(0x1a1a1a);
    for (let k = 0; k < 3; k++) {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 1.2), black());
      cab.position.set(0, 1.2 + k * 2.4, 0);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), grille);
      front.position.set(0, 1.2 + k * 2.4, 0.61);
      const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), neonPink());
      logo.position.set(0, 2.2 + k * 2.4, 0.62);
      t.add(cab, front, logo);
    }
    return place(t, x, z, rand);
  };
  // Handbag freak flags on poles.
  const flagMat = new THREE.MeshBasicMaterial({ map: flagTexture(), side: THREE.DoubleSide });
  const flags: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 7 + rand() * 3;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, h, 6), steel());
    pole.position.y = h / 2;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2, 6, 1), flagMat);
    flag.position.set(1.6, h - 1.1, 0);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.25), neonPink());
    bag.position.set(0.3, h - 2.6, 0);
    t.add(pole, flag, bag);
    const ph = rand() * 6;
    const pos = flag.geometry.attributes.position as THREE.BufferAttribute;
    const base = Float32Array.from(pos.array as Float32Array);
    animated.push((time) => {
      for (let i = 0; i < pos.count; i++) {
        const fx = base[i * 3] + 1.6;
        pos.setZ(i, Math.sin(time * 5 + fx * 2 + ph) * 0.25 * fx);
      }
      pos.needsUpdate = true;
    });
    return place(t, x, z, rand);
  };
  // The poison garden.
  const nightMat = lambert(0x5a1a8a, { emissive: 0x200838 });
  const berryMat = lambert(0x0a0a10, { emissive: 0x080010 });
  const leafMat = lambert(0x1a3a1a, { flatShading: true });
  const oleanderMat = lambert(0xff5aa8, { emissive: 0x401028 });
  const buttercupMat = lambert(0xffe020, { emissive: 0x403000 });
  const plant = (bloom: THREE.Material, berries: boolean, h0: number): Feature => (x, z, rand) => {
    const t = new THREE.Group();
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(h0 * 0.6, 0), leafMat);
    bush.scale.y = 0.8;
    bush.position.y = h0 * 0.45;
    t.add(bush);
    for (let k = 0; k < 9; k++) {
      const f = new THREE.Mesh(berries ? new THREE.ConeGeometry(0.18 * h0, 0.35 * h0, 6, 1, true) : new THREE.SphereGeometry(0.12 * h0, 6, 5), bloom);
      const a = rand() * Math.PI * 2;
      f.position.set(Math.cos(a) * h0 * 0.55, h0 * (0.4 + rand() * 0.5), Math.sin(a) * h0 * 0.55);
      if (berries) f.rotation.x = Math.PI;
      t.add(f);
      if (berries && rand() < 0.5) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.08 * h0, 6, 5), berryMat);
        b.position.copy(f.position).add(new THREE.Vector3(0.15 * h0, -0.1 * h0, 0));
        t.add(b);
      }
    }
    return place(t, x, z, rand);
  };
  const buttercups: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 24; k++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), buttercupMat);
      f.position.set((rand() - 0.5) * 8, 0.5 + rand() * 0.4, (rand() - 0.5) * 8);
      t.add(f);
    }
    return place(t, x, z, rand);
  };
  // The village: haystacks with pitchforks stuck in them.
  const haystack: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const stack = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), straw());
    stack.scale.y = 1.3;
    const fork = pitchfork(4);
    fork.position.set(0.6, 1.4, 0.3);
    fork.rotation.z = 0.4;
    t.add(stack, fork);
    return place(t, x, z, rand);
  };
  const reeds: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const reed = lambert(0x3a4a2a);
    for (let k = 0; k < 14; k++) {
      const h = 1.5 + rand() * 2;
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, h, 4), reed);
      r.position.set((rand() - 0.5) * 3, h / 2, (rand() - 0.5) * 3);
      r.rotation.z = (rand() - 0.5) * 0.3;
      t.add(r);
    }
    return place(t, x, z, rand);
  };
  // The circus: wagons painted in stripes.
  const wagon: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 2.6), lambert(rand() < 0.5 ? 0xa01848 : 0x2a6a4a));
    body.position.y = 2.4;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 3), lambert(0xe8c040));
    roof.position.y = 4.05;
    t.add(body, roof);
    for (let k = 0; k < 6; k++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 4), lambert(0xe8c040));
      bar.position.set(-2 + k * 0.8, 2.4, 1.32);
      t.add(bar);
    }
    for (const [wx, wz] of [
      [-1.8, 1.4],
      [1.8, 1.4],
      [-1.8, -1.4],
      [1.8, -1.4],
    ]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 5, 14), lambert(0xe8c040));
      wheel.position.set(wx, 0.8, wz);
      t.add(wheel);
    }
    return place(t, x, z, rand);
  };
  const general: [number, Feature][] = [
    [2.4, tree],
    [1.4, toadstools],
    [0.6, cauldron(false)],
    [0.6, brooms],
    [0.6, cat],
    [0.5, hats],
    [1.4, cottage],
  ];
  const bySection: Record<string, [number, Feature][]> = {
    "Who's This Sadie Sorceress?": [[3, boombox], [2, skate]],
    'Wild Like a Witch': [[2, boombox], [1, skate], [1, cauldron(false)]],
    'More Fly Than Quidditch': [[2, brooms], [1, flags]],
    'Winnies, Tinnies and Glenfiddich': [[6, tinnies]],
    'Roller Blader Skating': [[3, skate], [3, boombox]],
    Masquerading: [[2, hats], [1, cat]],
    'Eats Blood and Trouble': [[4, cauldron(true)]],
    'Meddles in the Metal': [[4, scrap], [3, amps]],
    'Handbag Freak Flag': [[6, flags]],
    'Dragon Scale Knapsack': [[4, cottage]],
    'Leviathan Cardigan': [[4, cottage]],
    'Sharp Like Parmesan': [[3, cottage]],
    'Concealing Her Identity': [[3, cottage], [1, hats]],
    Nightshade: [[5, plant(nightMat, true, 2.6)]],
    'Have a Gander, Oleander': [[4, plant(oleanderMat, false, 3.2)], [3, plant(nightMat, true, 2.6)], [3, buttercups]],
    'Hello Love, How Are Ya?': [[4, buttercups], [2, plant(oleanderMat, false, 3.2)]],
    'Snapping Necks with Her Broomstick': [[4, brooms], [2, cat]],
    'Pitchforks Banging on Her Door': [[4, haystack], [4, cottage]],
    'See If She Floats': [[5, reeds]],
    'Sell Her to the Circus': [[5, wagon]],
    'The Most Dangerous, Debaucherous': [[2, wagon], [2, boombox]],
  };
  return (x, z, rand) => {
    // Her lair at the star's heart is hers alone.
    if (track && Math.hypot(x, z) < 72) return new THREE.Group();
    const local = bySection[sectionAt(x, z)] ?? [];
    return pick(rand, [...general, ...local])(x, z, rand);
  };
}

/** A pitchfork, `len` long, along +y from the foot of its handle; its three tines at the top. */
function pitchfork(len: number): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, len, 5), wood());
  shaft.position.y = len / 2;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), iron());
  bar.position.y = len;
  g.add(shaft, bar);
  for (const x of [-0.22, 0, 0.22]) {
    const tine = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.6, 4), iron());
    tine.position.set(x, len + 0.3, 0);
    g.add(tine);
  }
  return g;
}

/** A villager of the mob: a body in drab homespun, a head, a cap or a bonnet, an arm raised with a pitchfork or a torch. Its feet at the origin. */
function villager(rand: () => number, torches: THREE.Sprite[]): { group: THREE.Group; arm: THREE.Group } {
  const g = new THREE.Group();
  const cloth = [0x4a3a2a, 0x3a3a44, 0x5a4a3a, 0x2a3a2a, 0x6a2a20][Math.floor(rand() * 5)];
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.5, 8), lambert(cloth));
  body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), lambert(0xd8a888));
  head.position.y = 1.75;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.2, 8), lambert(rand() < 0.5 ? 0x2a2018 : 0xd8d0c0));
  cap.position.y = 1.97;
  g.add(body, head, cap);
  const arm = new THREE.Group();
  arm.position.set(0.4, 1.35, 0);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 5), lambert(cloth));
  sleeve.position.y = 0.3;
  arm.add(sleeve);
  if (rand() < 0.6) {
    const fork = pitchfork(2.2);
    fork.position.y = -0.4;
    arm.add(fork);
  } else {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.2, 5), wood());
    stick.position.y = 0.9;
    const flame = sprite(FLAME, 1.4, 0.9);
    flame.position.y = 1.6;
    arm.add(stick, flame);
    torches.push(flame);
  }
  g.add(arm);
  return { group: g, arm };
}

/**
 * Who's this Sadie Sorceress? The start under the roller rink's neon arch:
 * two towers of boomboxes stacked high, pumping on the beat, a neon pink
 * arch over the road with SADIE SORCERESS lit along it, a witch's hat on
 * top and a mirror ball turning under it, throwing spots of light.
 */
export function rinkGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const H = 12;
  const cones: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const tower = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.8, 2), lambert(0x2a2a32));
      box.position.y = 1.4 + k * 2.9;
      tower.add(box);
      for (const sx of [-1, 1]) {
        const cone = new THREE.Mesh(new THREE.CircleGeometry(0.95, 18), lambert(0x101014, { emissive: 0x300a28 }));
        cone.position.set(sx * 1.25, 1.4 + k * 2.9, -1.02);
        cone.rotation.y = Math.PI;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.1, 20), (k + sx) % 2 ? neonPink() : neonGreen());
        ring.position.set(sx * 1.25, 1.4 + k * 2.9, -1.03);
        ring.rotation.y = Math.PI;
        tower.add(cone, ring);
        cones.push(cone);
      }
    }
    tower.position.x = side * (hw + 2.4);
    g.add(tower);
  }
  // The arch: a neon tube in a half circle, and the sign hung from it.
  const arch = new THREE.Mesh(new THREE.TorusGeometry(hw + 2.4, 0.35, 8, 40, Math.PI), neonPink());
  arch.position.y = H;
  const inner = new THREE.Mesh(new THREE.TorusGeometry(hw + 1.2, 0.2, 8, 40, Math.PI), neonGreen());
  inner.position.y = H;
  const sign = neonSign(16, neonFace(['SADIE SORCERESS']));
  sign.scale.y = 0.55;
  sign.position.y = H + 2;
  const hat = witchHat(3);
  hat.position.y = H + hw + 2.4;
  g.add(arch, inner, sign, hat);
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), new THREE.MeshPhongMaterial({ color: 0xdadae8, specular: 0xffffff, shininess: 150, flatShading: true }));
  ball.position.y = H - 3;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 4), black());
  string.position.y = H - 0.9;
  g.add(ball, string);
  const spots: THREE.Sprite[] = [];
  for (let k = 0; k < 8; k++) {
    const sp = sprite(k % 2 ? PINK : CYAN, 1.6, 0.8);
    g.add(sp);
    spots.push(sp);
  }
  animated.push((time) => {
    const p = 1 + 0.1 * kick(time);
    cones.forEach((c) => c.scale.set(p, p, 1));
    ball.rotation.y = time * 0.8;
    spots.forEach((sp, k) => {
      const a = time * 0.8 + (k / spots.length) * Math.PI * 2;
      sp.position.set(Math.cos(a) * (hw - 1), 0.4 + (k % 3) * 0.2, Math.sin(a) * 6);
    });
  });
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * Sadie herself, in her lair at the heart of the pentagram: a colossus
 * skating on the spot on her rollerblades over a ring of the star scorched
 * into the ground in toxic green, swaying and pushing off foot to foot,
 * her head bobbing on the beat, cackling; her broomstick held up in one
 * hand flying her handbag freak flag, a winnie smoking in the other, and
 * her cauldron bubbling at her feet.
 */
export function sadieColossus(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const H = 42;
  const sadie = sadieFigure(H);
  const k = sadie.k;
  // The star in the ground round her, and its ring.
  const glowMat = new THREE.MeshBasicMaterial({ color: TOXIC, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
  const R = 58;
  const ring = new THREE.Mesh(new THREE.RingGeometry(R - 1.6, R, 80), glowMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(ring);
  for (let p = 0; p < 5; p++) {
    const a0 = (p * 4 * Math.PI) / 5;
    const a1 = ((p + 1) * 4 * Math.PI) / 5;
    const x0 = Math.sin(a0) * (R - 2);
    const z0 = Math.cos(a0) * (R - 2);
    const x1 = Math.sin(a1) * (R - 2);
    const z1 = Math.cos(a1) * (R - 2);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(1.4, len), glowMat);
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = -Math.atan2(x1 - x0, z1 - z0);
    line.position.set((x0 + x1) / 2, 0.16, (z0 + z1) / 2);
    g.add(line);
    // A candle at each point of it.
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 4, 10), lambert(0x1a1018));
    candle.position.set(x0, 2, z0);
    const flame = sprite(TOXIC, 4, 0.9);
    flame.position.set(x0, 4.8, z0);
    g.add(candle, flame);
  }
  // Her cauldron, bubbling over.
  const pot = new THREE.Mesh(new THREE.SphereGeometry(6, 18, 12, 0, Math.PI * 2, Math.PI * 0.25, Math.PI * 0.75), iron());
  pot.position.set(0, 5.5, 13);
  const surface = new THREE.Mesh(new THREE.CircleGeometry(4.3, 24), brew());
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(0, 9.7, 13);
  const fire = sprite(FLAME, 14, 0.8);
  fire.position.set(0, 1, 13);
  g.add(pot, surface, fire);
  const fumes: THREE.Sprite[] = [];
  for (let n = 0; n < 10; n++) {
    const f = sprite(TOXIC, 5, 0.5);
    g.add(f);
    fumes.push(f);
  }
  // Her broomstick held up like a flagpole, the freak flag flying, her handbag swinging off it.
  const [left, right] = sadie.arms;
  right.rotation.set(-0.3, 0, -1.9);
  const pole = new THREE.Group();
  const shaft = broomstick(3.2 * k);
  shaft.rotation.x = Math.PI;
  shaft.position.y = 2.2 * k;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8 * k, 1.1 * k, 8, 1), new THREE.MeshBasicMaterial({ map: flagTexture(), side: THREE.DoubleSide }));
  flag.position.set(0.95 * k, 1.75 * k, 0);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.5 * k, 0.36 * k, 0.18 * k), neonPink());
  bag.position.set(0.15 * k, 1.0 * k, 0);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.15 * k, 0.025 * k, 4, 10, Math.PI), black());
  strap.position.set(0.15 * k, 1.18 * k, 0);
  pole.add(shaft, flag, bag, strap);
  pole.position.y = -1.1 * k;
  pole.rotation.z = 1.9;
  right.add(pole);
  // The winnie, smoking.
  left.rotation.set(-1.2, 0, 0.4);
  const winnie = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * k, 0.03 * k, 0.4 * k, 6), lambert(0xf0ece0));
  winnie.position.set(0, -1.15 * k, 0.15 * k);
  winnie.rotation.x = Math.PI / 2;
  const ember = sprite(0xff4010, 0.2 * k, 1);
  ember.position.set(0, -1.15 * k, 0.36 * k);
  left.add(winnie, ember);
  const puffs: THREE.Sprite[] = [];
  for (let n = 0; n < 5; n++) {
    const p = smoke(0xb0a8c0, 2, 0.4);
    g.add(p);
    puffs.push(p);
  }
  // Her own light: a pink wash up her from the neon, and green from the brew.
  const wash = sprite(PINK, 40, 0.18);
  wash.position.y = H * 0.5;
  g.add(wash, sadie.group);
  const flagPos = flag.geometry.attributes.position as THREE.BufferAttribute;
  const flagBase = Float32Array.from(flagPos.array as Float32Array);
  const pushTo = new THREE.Vector3();
  animated.push((time) => {
    // Skating on the spot: pushing off one foot then the other, swaying with it.
    const stride = Math.sin(time * BEAT * Math.PI);
    sadie.legs[0].rotation.x = 0.35 * stride;
    sadie.legs[1].rotation.x = -0.35 * stride;
    sadie.legs[0].rotation.z = -0.12 - 0.1 * Math.max(0, stride);
    sadie.legs[1].rotation.z = 0.12 + 0.1 * Math.max(0, -stride);
    sadie.body.rotation.z = 0.08 * stride;
    sadie.group.rotation.y = 0.25 * Math.sin(time * 0.3);
    // Head bobbing on the beat, cackling.
    sadie.head.rotation.x = 0.12 * kick(time) - 0.05;
    sadie.mouth.scale.y = 0.35 + 0.35 * Math.abs(Math.sin(time * 9));
    sadie.eyes.forEach((e) => (e.material.opacity = 0.6 + 0.4 * kick(time)));
    pole.rotation.z = 1.9 + 0.1 * Math.sin(time * 1.3);
    for (let i = 0; i < flagPos.count; i++) {
      const fx = flagBase[i * 3] / k + 0.9;
      flagPos.setZ(i, Math.sin(time * 4 + fx * 3) * 0.18 * k * fx);
    }
    flagPos.needsUpdate = true;
    fumes.forEach((f, n) => {
      const v = (time * 0.15 + n / fumes.length) % 1;
      f.position.set(Math.sin(n * 2.3 + time * 0.3) * 3, 10 + v * 18, 13 + Math.cos(n * 1.7) * 3);
      f.material.opacity = 0.5 * (1 - v);
      f.scale.setScalar(4 + v * 8);
    });
    ember.getWorldPosition(pushTo);
    g.worldToLocal(pushTo);
    puffs.forEach((p, n) => {
      const v = (time * 0.2 + n / puffs.length) % 1;
      p.position.set(pushTo.x + v * 3, pushTo.y + v * 10, pushTo.z);
      p.scale.setScalar(1 + v * 5);
      p.material.opacity = 0.35 * (1 - v);
    });
    fire.material.opacity = 0.6 + 0.2 * Math.sin(time * 7);
  });
  g.position.set(at.x, 0, at.z);
  // Facing the circus point and the start, down the long point of the star.
  g.rotation.y = Math.PI;
  return g;
}

/** More fly than Quidditch: three golden hoops on tall poles over the leap, the middle one right over the road. */
export function quidditchHoops(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s);
  const gold = new THREE.MeshPhongMaterial({ color: 0xe8b830, emissive: 0x402800, specular: 0xffffff, shininess: 90 });
  const hoops: THREE.Mesh[] = [];
  for (const [lat, r, h] of [
    [-(hw + 8), 4, 16],
    [0, hw - 2, hw + 4],
    [hw + 8, 4, 20],
  ] as const) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(r, 0.4, 8, 32), gold);
    hoop.position.set(lat, h, 0);
    g.add(hoop);
    hoops.push(hoop);
    if (lat === 0) {
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, h, 8), gold);
        pole.position.set(side * (hw + 1), h / 2, 0);
        g.add(pole);
      }
    } else {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, h - r, 8), gold);
      pole.position.set(lat, (h - r) / 2, 0);
      g.add(pole);
    }
  }
  const snitch = sprite(0xffe060, 1.6, 1);
  g.add(snitch);
  animated.push((time) => {
    snitch.position.set(Math.sin(time * 2.3) * hw, 8 + 3 * Math.sin(time * 3.1), Math.cos(time * 1.7) * 10);
  });
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A masquerade mask's face: a half-face mask in a sparkly colour, its eye holes, gold trim and a plume of feathers. */
const maskFace = (() => {
  const made: THREE.CanvasTexture[] = [];
  return (k: number): THREE.CanvasTexture => {
    const n = k % 4;
    if (made[n]) return made[n];
    const W = 256;
    const H = 192;
    const [c, ctx] = canvas(W, H);
    const cols = ['#ff2a9a', '#8aff2a', '#8a3aff', '#2ae8ff'];
    // Feathers.
    for (let f = 0; f < 7; f++) {
      ctx.strokeStyle = cols[(n + f) % 4];
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(W / 2 + 40, 70);
      ctx.quadraticCurveTo(W / 2 + 40 + f * 12, 10, W / 2 + 20 + f * 18, 4);
      ctx.stroke();
    }
    ctx.fillStyle = cols[n];
    ctx.beginPath();
    ctx.moveTo(20, 90);
    ctx.bezierCurveTo(40, 40, W / 2 - 20, 60, W / 2, 80);
    ctx.bezierCurveTo(W / 2 + 20, 60, W - 40, 40, W - 20, 90);
    ctx.bezierCurveTo(W - 50, 150, W / 2 + 20, 140, W / 2, 125);
    ctx.bezierCurveTo(W / 2 - 20, 140, 50, 150, 20, 90);
    ctx.fill();
    ctx.strokeStyle = '#ffd040';
    ctx.lineWidth = 5;
    ctx.stroke();
    const rand = seededRandom(9400 + n);
    for (let s = 0; s < 80; s++) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(30 + rand() * (W - 60), 60 + rand() * 70, 2, 2);
    }
    ctx.fillStyle = '#000000';
    for (const ex of [W / 2 - 50, W / 2 + 50]) {
      ctx.beginPath();
      ctx.ellipse(ex, 95, 26, 14, ex < W / 2 ? 0.2 : -0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    made[n] = t;
    return t;
  };
})();

/**
 * Masquerading: masks hung all down both walls of the cut from `s` to
 * `to`, sparkling in neon, eyes glowing in the dark behind them, purple
 * drapes between, concealing their identities.
 */
export function masquerade(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const eyes: THREE.Sprite[] = [];
  const drape = lambert(0x3a0a4a, { side: THREE.DoubleSide });
  let k = 0;
  for (let d = s; d < to; d += 14, k++) {
    const f = frameAt(ribbon, d);
    const hw = ribbon.halfWidthAtS(d);
    for (const side of [-1, 1]) {
      const at = offRoad(ribbon, d, side * (hw - 0.4));
      const mask = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ map: maskFace(k + (side > 0 ? 1 : 0)), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide }));
      mask.position.set(at.x, f.y + 3.2, at.z);
      mask.rotation.y = f.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      g.add(mask);
      for (const e of [-0.78, 0.78]) {
        const eye = sprite(k % 2 ? TOXIC : PINK, 0.7, 0.9);
        const ep = offRoad(ribbon, d + e, side * (hw - 0.6));
        eye.position.set(ep.x, f.y + 3.25, ep.z);
        g.add(eye);
        eyes.push(eye);
      }
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(5, 4.5), drape);
      const cp = offRoad(ribbon, d + 7, side * (hw - 0.3));
      cloth.position.set(cp.x, f.y + 3.6, cp.z);
      cloth.rotation.y = f.heading + Math.PI / 2;
      g.add(cloth);
    }
  }
  animated.push((time) => eyes.forEach((e, n) => (e.material.opacity = 0.45 + 0.5 * Math.max(0, Math.sin(time * 2 + n * 0.7)))));
  return g;
}

/**
 * Her flight path: up over the town on its decks from `s` to `to`,
 * lanterns grinning on crooked posts along both rails, and sparks drifting
 * down the way she flew it.
 */
export function flightPath(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const lanternMat = lambert(0xe86a10, { emissive: 0xa04000 });
  const glows: THREE.Sprite[] = [];
  for (let d = s + 10; d < to; d += 26) {
    const f = frameAt(ribbon, d);
    const hw = ribbon.halfWidthAtS(d);
    for (const side of [-1, 1]) {
      const at = offRoad(ribbon, d, side * (hw + 0.6));
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 4, 5), black());
      post.position.set(at.x, f.y + 2, at.z);
      post.rotation.z = side * 0.1;
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), lanternMat);
      lantern.scale.y = 0.8;
      lantern.position.set(at.x, f.y + 4.3, at.z);
      const glow = sprite(FLAME, 3.4, 0.6);
      glow.position.copy(lantern.position);
      g.add(post, lantern, glow);
      glows.push(glow);
    }
  }
  const sparks: { s: THREE.Sprite; d: number; lat: number }[] = [];
  const rand = seededRandom(9501);
  for (let k = 0; k < 40; k++) {
    const sp = sprite(k % 2 ? PINK : TOXIC, 0.8, 0.8);
    g.add(sp);
    sparks.push({ s: sp, d: rand(), lat: (rand() - 0.5) * 20 });
  }
  animated.push((time) => {
    glows.forEach((gl, n) => (gl.material.opacity = 0.45 + 0.25 * Math.sin(time * 6 + n)));
    for (const sp of sparks) {
      const v = (sp.d + time * 0.03) % 1;
      const d = s + (to - s) * v;
      const at = offRoad(ribbon, d, sp.lat);
      sp.s.position.set(at.x, ribbon.heightAt(d) + 6 + 3 * Math.sin(time + sp.lat), at.z);
    }
  });
  return g;
}

/**
 * Nightshade bringing death commander, have a gander, oleander, poisonous
 * like buttercups: the poison garden either side of the road from `s` to
 * `to`, giant nightshade with its purple bells and black berries, oleander
 * in pink bloom, buttercups underfoot, and signs warning POISON with a
 * skull on them.
 */
export function poisonGarden(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(9601);
  const leaf = lambert(0x1a3a1a, { flatShading: true });
  const blooms = [lambert(0x5a1a8a, { emissive: 0x2a0844 }), lambert(0xff5aa8, { emissive: 0x501030 }), lambert(0xffe020, { emissive: 0x504000 })];
  const sways: THREE.Group[] = [];
  for (let d = s; d < to; d += 9) {
    const hw = ribbon.halfWidthAtS(d);
    for (const side of [-1, 1]) {
      const at = offRoad(ribbon, d, side * (hw + 4 + rand() * 6));
      const p = new THREE.Group();
      const kind = Math.floor(rand() * 3);
      const h = kind === 2 ? 2 + rand() * 1.5 : 4 + rand() * 4;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, h, 5), leaf);
      stem.position.y = h / 2;
      p.add(stem);
      for (let b = 0; b < 6; b++) {
        const a = rand() * Math.PI * 2;
        const bloom = new THREE.Mesh(kind === 0 ? new THREE.ConeGeometry(0.5, 0.9, 6, 1, true) : new THREE.SphereGeometry(kind === 2 ? 0.5 : 0.6, 7, 5), blooms[kind]);
        bloom.position.set(Math.cos(a) * 0.9, h * (0.6 + rand() * 0.4), Math.sin(a) * 0.9);
        if (kind === 0) bloom.rotation.x = Math.PI;
        p.add(bloom);
      }
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.3, 0), leaf);
      bush.position.y = h * 0.6;
      p.add(bush);
      p.position.set(at.x, 0, at.z);
      g.add(p);
      sways.push(p);
    }
  }
  // POISON signs at either end.
  for (const d of [s + 6, (s + to) / 2, to - 6]) {
    const f = frameAt(ribbon, d);
    const at = offRoad(ribbon, d, ribbon.halfWidthAtS(d) + 3);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), wood());
    post.position.set(at.x, 2, at.z);
    const sign = neonSign(4, neonFace(['☠ POISON'], '#8aff2a', '#b0ff70'));
    sign.position.set(at.x, 4.6, at.z);
    sign.rotation.y = f.heading;
    g.add(post, sign);
  }
  animated.push((time) => sways.forEach((p, n) => (p.rotation.z = 0.05 * Math.sin(time * 1.2 + n))));
  return g;
}

/** HELLO LOVE on Millicent's fence. */
const helloFace = once(() => neonFace(['HELLO LOVE', 'HOW ARE YA?'], '#ffc860', '#ffe0a0', '#1a0e08'));

/**
 * Hello love, how are ya? Millicent's cottage out at the tip of her point,
 * the road round her garden from `s` to `to`: a crooked cottage, warm
 * light in its windows, a picket fence with HELLO LOVE on it, and
 * Millicent herself in her rocking chair on the porch in her hip beanie,
 * waving at everyone who goes by.
 */
export function grannyCottage(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const tip = pointTip(ribbon, s, to);
  const house = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 7), lambert(0xd8c8b0));
  walls.position.y = 2.5;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(8, 4.5, 4), lambert(0x6a2a2a, { flatShading: true }));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 7.2;
  const porch = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, 3), wood());
  porch.position.set(0, 0.3, -5);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.2, 3.2), lambert(0x4a7a4a));
  awning.position.set(0, 3.8, -5);
  awning.rotation.x = 0.15;
  house.add(walls, roof, porch, awning);
  for (const x of [-3, 3]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.6), windowLit());
    win.position.set(x, 3, -3.52);
    win.rotation.y = Math.PI;
    house.add(win);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.6), lambert(0x3a6a8a));
  door.position.set(0, 1.6, -3.52);
  door.rotation.y = Math.PI;
  const glow = sprite(WINDOW, 12, 0.3);
  glow.position.set(0, 3, -6);
  house.add(door, glow);
  // Millicent, rocking and waving.
  const nan = new THREE.Group();
  const chair = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.2), wood());
  chair.position.set(0, 1.6, 0.5);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 1), wood());
  seat.position.y = 0.9;
  const rocker = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 4, 12, Math.PI * 0.6), wood());
  rocker.rotation.set(0, Math.PI / 2, Math.PI * 1.2);
  rocker.position.y = 0.6;
  const dress = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 1.2, 10), lambert(0x8a5aa0));
  dress.position.y = 1.4;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), lambert(0xe8c8b0));
  head.position.y = 2.25;
  const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0xe83a3a));
  beanie.position.y = 2.32;
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), lambert(0xffffff));
  pom.position.y = 2.65;
  const waveArm = new THREE.Group();
  waveArm.position.set(0.38, 1.85, 0);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 5), lambert(0x8a5aa0));
  sleeve.position.y = 0.35;
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), lambert(0xe8c8b0));
  hand.position.y = 0.75;
  waveArm.add(sleeve, hand);
  nan.add(chair, seat, rocker, dress, head, beanie, pom, waveArm);
  nan.position.set(2.5, 0.45, -5.2);
  nan.rotation.y = Math.PI;
  house.add(nan);
  // The picket fence and its sign.
  const picket = lambert(0xf0ece4);
  for (let x = -9; x <= 9; x += 1.2) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 0.1), picket);
    p.position.set(x, 0.7, -9);
    house.add(p);
  }
  const sign = neonSign(5, helloFace());
  sign.position.set(-4, 2.6, -9.1);
  house.add(sign);
  const d = tip.hw + 16;
  house.position.set(tip.x + tip.ox * d, 0, tip.z + tip.oz * d);
  // The porch facing back toward the road and the star's heart.
  house.rotation.y = tip.heading;
  g.add(house);
  animated.push((time) => {
    nan.rotation.x = 0.08 * Math.sin(time * 1.5);
    waveArm.rotation.z = -0.4 - 0.5 * Math.abs(Math.sin(time * 4));
  });
  return g;
}

/**
 * Pitchforks banging on her door: the mob all along the road from `s` to
 * `to` on both sides, pitchforks and torches pumping in the air on the
 * beat, and at its head a crooked cottage, Sadie's door shaking under
 * their fists.
 */
export function pitchforkMob(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(9701);
  const arms: { arm: THREE.Group; ph: number }[] = [];
  const torches: THREE.Sprite[] = [];
  for (let d = s; d < to; d += 5) {
    const hw = ribbon.halfWidthAtS(d);
    for (const side of [-1, 1]) {
      if (rand() < 0.25) continue;
      const f = frameAt(ribbon, d);
      const at = offRoad(ribbon, d + (rand() - 0.5) * 3, side * (hw + 5 + rand() * 8));
      const v = villager(rand, torches);
      v.group.position.set(at.x, 0, at.z);
      // Facing the road, shaking their forks at whoever goes by.
      v.group.rotation.y = f.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (rand() - 0.5) * 0.6;
      g.add(v.group);
      arms.push({ arm: v.arm, ph: rand() });
    }
  }
  // Sadie's door, at the head of the mob, banged on.
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s);
  const at = offRoad(ribbon, s, -(hw + 20));
  const house = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 7), lambert(0x2a2030));
  walls.position.y = 3;
  walls.rotation.z = 0.06;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 7, 4), black());
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 9.4;
  roof.rotation.z = -0.15;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3, 0.2), lambert(0x5a1a3a));
  door.position.set(0, 1.5, 3.55);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), neonGreen());
  win.position.set(2.4, 3.6, 3.52);
  const glow = sprite(TOXIC, 6, 0.4);
  glow.position.set(2.4, 3.6, 4.5);
  house.add(walls, roof, door, win, glow);
  for (let k = 0; k < 6; k++) {
    const v = villager(rand, torches);
    v.group.position.set((k - 2.5) * 1.3, 0, 6 + (k % 2) * 1.5);
    v.group.rotation.y = Math.PI;
    house.add(v.group);
    arms.push({ arm: v.arm, ph: k * 0.3 });
  }
  house.position.set(at.x, 0, at.z);
  house.rotation.y = f.heading + Math.PI / 2;
  g.add(house);
  animated.push((time) => {
    for (const { arm, ph } of arms) arm.rotation.z = -0.3 - 0.5 * kick(time + ph * 0.15);
    door.rotation.y = 0.04 * Math.sin(time * 30) * kick(time);
    torches.forEach((t, n) => (t.material.opacity = 0.7 + 0.3 * Math.sin(time * 11 + n)));
  });
  return g;
}

/**
 * To see if she floats or sinks: the ducking stool on the bank of the pond
 * the road dives under at `s`, its long beam see-sawing on its post and
 * dunking a witch in its chair; out on the water, her hat bobbing on the
 * surface; the peasants on the bank cheering, and a sign, SEE IF SHE FLOATS.
 */
export function duckingStool(ribbon: Ribbon, s: number, pits: readonly PitDef[], animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const pond = pits.reduce((best, p) => (Math.hypot(p.x - f.x, p.z - f.z) < Math.hypot(best.x - f.x, best.z - f.z) ? p : best), pits[0]);
  if (!pond) return g;
  const W = pond.halfWidth;
  const hw = ribbon.halfWidthAtS(s);
  // The stool: a post on the bank, the beam reaching out over the water, the chair hanging off its end.
  const stool = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 6, 0.8), wood());
  post.position.y = 3;
  const beam = new THREE.Group();
  beam.position.y = 6;
  const plank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 18), wood());
  plank.position.z = -5;
  const chair = new THREE.Group();
  chair.position.z = -13.5;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 1.4), wood());
  seat.position.y = -2.5;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 0.2), wood());
  back.position.set(0, -1.8, -0.6);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 4), lambert(0x8a7a50));
  rope.position.y = -1.2;
  const witch = sadieFigure(2.2);
  witch.group.position.y = -3.7;
  witch.body.position.y += 0;
  chair.add(seat, back, rope, witch.group);
  beam.add(plank, chair);
  stool.add(post, beam);
  stool.position.set(-(W + 3), 0, 0);
  stool.rotation.y = -Math.PI / 2;
  // Her hat, bobbing on the surface.
  const hat = witchHat(1.4);
  hat.position.set(-(hw + 8), WATER, 8);
  const sign = neonSign(6, neonFace(['SEE IF', 'SHE FLOATS'], '#8aff2a', '#b0ff70'));
  sign.position.set(W + 3, 3.5, -10);
  sign.rotation.y = Math.PI / 2;
  const signPost = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2, 0.3), wood());
  signPost.position.set(W + 3, 1, -10);
  const local = new THREE.Group();
  local.add(stool, hat, sign, signPost);
  // The peasants on the banks, cheering.
  const rand = seededRandom(9801);
  const arms: THREE.Group[] = [];
  const torches: THREE.Sprite[] = [];
  for (let k = 0; k < 14; k++) {
    const v = villager(rand, torches);
    const side = k % 2 ? 1 : -1;
    v.group.position.set(side * (W + 4 + rand() * 6), 0, -pond.halfLength + 10 + rand() * (2 * pond.halfLength - 20));
    v.group.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    local.add(v.group);
    arms.push(v.arm);
  }
  local.position.set(pond.x, 0, pond.z);
  local.rotation.y = pond.heading;
  g.add(local);
  animated.push((time) => {
    // Dunked, held under, and up again: a see-saw every few seconds.
    const u = (time / 5) % 1;
    const dip = u < 0.3 ? Math.sin((u / 0.3) * Math.PI * 0.5) : u < 0.55 ? 1 : u < 0.75 ? 1 - (u - 0.55) / 0.2 : 0;
    beam.rotation.x = -0.12 + 0.42 * dip;
    chair.rotation.x = -beam.rotation.x;
    hat.position.y = WATER + 0.1 * Math.sin(time * 2.2);
    hat.rotation.z = 0.2 * Math.sin(time * 1.3);
    arms.forEach((a, n) => (a.rotation.z = -0.4 - 0.6 * Math.abs(Math.sin(time * 3 + n))));
    torches.forEach((t, n) => (t.material.opacity = 0.7 + 0.3 * Math.sin(time * 9 + n)));
  });
  return g;
}

/** SELL HER TO THE CIRCUS over the big top's door. */
const circusFace = once(() => neonFace(['SELL HER', 'TO THE CIRCUS'], '#ffd040', '#ffe890', '#1a0610'));

/**
 * Sell her to the circus: the big top out at the tip of the circus point,
 * the road round it from `s` to `to`; striped neon pink and black, lit
 * from inside, pennants strung from its king pole, a sign over its door.
 */
export function bigTop(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const tip = pointTip(ribbon, s, to);
  const tent = new THREE.Group();
  const R = 20;
  const stripes = (() => {
    const [c, ctx] = canvas(256, 64);
    for (let k = 0; k < 16; k++) {
      ctx.fillStyle = k % 2 ? '#ff2a9a' : '#1a0a1e';
      ctx.fillRect(k * 16, 0, 16, 64);
    }
    return finish(c);
  })();
  const canvasMat = new THREE.MeshLambertMaterial({ map: stripes, emissive: 0x300818 });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 9, 32, 1, true), canvasMat);
  wall.position.y = 4.5;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(R + 1.5, 13, 32, 1, true), canvasMat);
  roof.position.y = 15.5;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 28, 8), lambert(0xe8c040));
  pole.position.y = 14;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.8), new THREE.MeshBasicMaterial({ map: flagTexture(), side: THREE.DoubleSide }));
  flag.position.set(1.5, 27, 0);
  tent.add(wall, roof, pole, flag);
  // Pennants from the king pole to the ground all round.
  const pennants = [neonPink(), neonGreen(), new THREE.MeshBasicMaterial({ color: 0xffd040 })];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (let n = 1; n < 6; n++) {
      const u = n / 6;
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 3), pennants[(k + n) % 3]);
      p.position.set(Math.cos(a) * (R + 8) * u, 27 - 26 * u - 2 * Math.sin(u * Math.PI), Math.sin(a) * (R + 8) * u);
      p.rotation.x = Math.PI;
      tent.add(p);
    }
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(6, 7), new THREE.MeshBasicMaterial({ color: 0xffc070 }));
  door.position.set(0, 3.5, -R - 0.05);
  door.rotation.y = Math.PI;
  const sign = neonSign(10, circusFace());
  sign.position.set(0, 10, -R - 1);
  const glow = sprite(0xffb050, 30, 0.25);
  glow.position.y = 6;
  tent.add(door, sign, glow);
  const bulbs: THREE.Sprite[] = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const b = sprite(k % 2 ? 0xffd040 : PINK, 1.4, 0.9);
    b.position.set(Math.cos(a) * (R + 0.4), 9.2, Math.sin(a) * (R + 0.4));
    tent.add(b);
    bulbs.push(b);
  }
  const d = tip.hw + R + 8;
  tent.position.set(tip.x + tip.ox * d, 0, tip.z + tip.oz * d);
  // Its door toward the road.
  tent.rotation.y = tip.heading;
  g.add(tent);
  animated.push((time) => {
    const step = Math.floor(time * 6);
    bulbs.forEach((b, k) => (b.material.opacity = (k + step) % 3 === 0 ? 1 : 0.3));
    flag.rotation.y = 0.3 * Math.sin(time * 2);
  });
  return g;
}

/**
 * Poisonous like buttercups: the pool of poison under the buttercups'
 * planks at `s` on the lane, glowing toxic green and bubbling, fumes
 * rising off it, buttercups crowding its banks and a skull on a stake.
 */
export function poisonPool(ribbon: Ribbon, s: number, pits: readonly PitDef[], animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const pit = pits.reduce((best, p) => (Math.hypot(p.x - f.x, p.z - f.z) < Math.hypot(best.x - f.x, best.z - f.z) ? p : best), pits[0]);
  if (!pit) return g;
  const L = pit.halfLength;
  const W = pit.halfWidth;
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 2 * L), new THREE.MeshBasicMaterial({ color: 0x4ad018 }));
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = -2.5;
  g.add(surface);
  const bubbles: THREE.Sprite[] = [];
  for (let k = 0; k < 14; k++) {
    const b = sprite(TOXIC, 2, 0.6);
    g.add(b);
    bubbles.push(b);
  }
  const rand = seededRandom(9901);
  const cup = lambert(0xffe020, { emissive: 0x504000 });
  for (let k = 0; k < 40; k++) {
    const side = rand() < 0.5 ? -1 : 1;
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), cup);
    c.position.set(side * (W + 1 + rand() * 6), 0.4, (rand() * 2 - 1) * (L + 4));
    g.add(c);
  }
  const stake = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3, 0.25), wood());
  stake.position.set(W + 3, 1.5, -L);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), lambert(0xe8e0cc));
  skull.position.set(W + 3, 3.3, -L);
  g.add(stake, skull);
  animated.push((time) => {
    bubbles.forEach((b, k) => {
      const v = (time * 0.35 + k / bubbles.length) % 1;
      b.position.set(Math.sin(k * 2.7) * W * 0.7, -2.4 + v * 5, Math.cos(k * 1.9) * L * 0.8);
      b.material.opacity = 0.6 * (1 - v);
    });
  });
  g.position.set(pit.x, Math.max(0, f.y), pit.z);
  g.rotation.y = pit.heading;
  return g;
}

// The hazard: Sadie on her broomstick.

/** Her line across the road, scorched in sparks before she swoops along it. */
const lineTexture = once(() => {
  const W = 64;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(140,255,60,0)');
  g.addColorStop(0.5, 'rgba(200,255,140,1)');
  g.addColorStop(1, 'rgba(140,255,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const rand = seededRandom(9951);
  for (let k = 0; k < 120; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,60,170,0.9)' : 'rgba(255,255,255,0.9)';
    ctx.fillRect(W / 2 + (rand() - 0.5) * W * 0.8, rand() * H, 2, 2);
  }
  return finish(c);
});

/**
 * Sadie on her broomstick: her figure astride it, her handbag swinging
 * off its end, a glow round her in pink, her shadow on the road under her,
 * the trail of sparks in her slipstream behind the bristles (the boost),
 * and the line across the road she'll swoop along, glowing up in toxic
 * green while she circles, cackling, before she comes.
 */
export function broomParts(obj: THREE.Object3D): THREE.Object3D[] {
  const rider = new THREE.Group();
  const fly = flyingSadie();
  rider.add(fly.group);
  const aura = sprite(PINK, 7, 0.55);
  aura.position.y = 1.2;
  const eyesGlow = sprite(TOXIC, 3, 0.6);
  eyesGlow.position.set(0, 2.4, 0.3);
  rider.add(aura, eyesGlow);
  const trail = new THREE.Group();
  for (let k = 0; k < 18; k++) {
    const sp = sprite(k % 3 === 0 ? TOXIC : k % 3 === 1 ? PINK : 0xffffff, 1.2, 0.8);
    trail.add(sp);
  }
  rider.add(trail);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: glowTex(), color: PINK, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  shadow.rotation.x = -Math.PI / 2;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1, 1, 1), new THREE.MeshBasicMaterial({ map: lineTexture(), transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending }));
  line.rotation.x = -Math.PI / 2;
  line.renderOrder = 2;
  const lineHolder = new THREE.Group();
  lineHolder.add(line);
  const parts = [rider, shadow, lineHolder];
  for (const o of parts) obj.add(o);
  rider.userData.fly = fly;
  return parts;
}

export function poseBroom(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [rider, shadow, lineHolder] = parts;
  const S = BROOM_STAGES;
  const u = p.phase;
  // The object sits on the road at her station; she flies about it.
  obj.position.set(p.ax, p.ground, p.az);
  obj.rotation.y = 0;
  const lx = p.x - p.ax;
  const lz = p.z - p.az;
  const height = p.y - p.ground;
  // Diving or climbing: tip her nose with it.
  const last = rider.userData.last as { y: number; x: number; z: number } | undefined;
  let pitch = 0;
  if (last) {
    const run = Math.hypot(lx - last.x, lz - last.z);
    if (run > 0.01) pitch = Math.atan2(height - last.y, run);
  }
  rider.userData.last = { y: height, x: lx, z: lz };
  rider.position.set(lx, height, lz);
  rider.rotation.set(0, p.heading, 0);
  const fly = rider.userData.fly as ReturnType<typeof flyingSadie>;
  fly.group.rotation.x = -Math.max(-0.6, Math.min(0.6, pitch));
  // Banking as she circles, steady as she swoops.
  fly.group.rotation.z = p.lane === 1 ? 0 : 0.35;
  fly.sadie.mouth.scale.y = 0.35 + 0.35 * Math.abs(Math.sin(elapsed * 10));
  fly.bag.rotation.x = 0.4 * Math.sin(elapsed * 6);
  // Her slipstream: sparks streaming back behind the bristles, longest as she skims the road.
  const trail = rider.children[3] as THREE.Group;
  const low = p.lane === 1 && height < 3;
  trail.children.forEach((c, k) => {
    const sp = c as THREE.Sprite;
    const f = k / trail.children.length;
    const reach = low ? BROOM_WAKE : 4;
    sp.position.set(Math.sin(elapsed * 9 + k * 1.7) * 0.6 * f, Math.cos(elapsed * 7 + k) * 0.4 * f, -BROOM_TAIL - 0.5 - f * reach);
    sp.material.opacity = (low ? 0.95 : 0.5) * (1 - f * 0.8);
    sp.scale.setScalar(low ? 1.6 - f * 0.8 : 0.9);
  });
  // Her shadow on the ground under her, sharper as she comes down.
  shadow.position.set(lx, 0.08, lz);
  const near = Math.max(0, 1 - height / 14);
  (shadow as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.1 + 0.5 * near;
  shadow.scale.setScalar(0.6 + near);
  // The warning: her line across the road, lighting up in the last of her circling, and gone as she passes.
  const line = lineHolder.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  const warn = u < S.dive ? Math.max(0, (u - (S.dive - 0.22)) / 0.22) : u < S.away ? Math.max(0, 1 - (u - S.dive) / (S.away - S.dive)) * 0.8 : 0;
  lineHolder.visible = warn > 0.01;
  if (lineHolder.visible) {
    // Across the road through its middle, the way from where she circles to the other side.
    const across = Math.hypot(lx, lz) || 1;
    lineHolder.rotation.y = Math.atan2(lx / across, lz / across);
    lineHolder.position.set(0, 0.12, 0);
    line.scale.set(1 + warn, 2 * Math.max(across, 20), 1);
    line.material.opacity = warn * (0.7 + 0.3 * Math.sin(elapsed * 14));
  }
}
