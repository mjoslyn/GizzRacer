import * as THREE from 'three';
import { seededRandom } from '../core/math';

/**
 * Procedural textures in a sharp, early-2000s console style: tileable,
 * high resolution, hand-painted feel rather than flat colors.
 */

let anisotropy = 1;
export function setTextureAnisotropy(value: number): void {
  anisotropy = value;
}

type RGB = [number, number, number];

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Tileable smooth value noise, 0..1. */
function valueNoise(size: number, period: number, seed: number): Float32Array {
  const rand = seededRandom(seed);
  const grid = new Float32Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const out = new Float32Array(size * size);
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
      out[y * size + x] = a + (b - a) * ty;
    }
  }
  return out;
}

/** Fractal noise, roughly 0..1. */
function fbm(size: number, basePeriod: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const layer = valueNoise(size, basePeriod << o, seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Fills a canvas from a per-pixel color function. */
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

/** Draws a stroke 9 times offset by the tile size so it wraps seamlessly. */
function wrapStroke(ctx: CanvasRenderingContext2D, size: number, draw: () => void): void {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      ctx.save();
      ctx.translate(ox, oy);
      draw();
      ctx.restore();
    }
  }
}

function cracks(ctx: CanvasRenderingContext2D, size: number, count: number, color: string, width: number, seed: number): void {
  const rand = seededRandom(seed);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let k = 0; k < count; k++) {
    const pts: [number, number][] = [];
    let x = rand() * size;
    let y = rand() * size;
    let a = rand() * Math.PI * 2;
    const steps = 6 + Math.floor(rand() * 10);
    for (let i = 0; i < steps; i++) {
      pts.push([x, y]);
      a += (rand() - 0.5) * 1.2;
      const len = size * (0.02 + rand() * 0.05);
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
    }
    const w = width * (0.5 + rand());
    wrapStroke(ctx, size, () => {
      ctx.lineWidth = w;
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
    });
  }
}

export function asphaltTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 11);
  const rand = seededRandom(12);
  paint(ctx, S, S, (_x, _y, i) => {
    const speck = rand();
    const base = 58 + n[i] * 34 + (speck > 0.985 ? 45 : speck < 0.02 ? -18 : (speck - 0.5) * 14);
    return [base, base + 1, base + 6];
  });
  cracks(ctx, S, 10, 'rgba(20,20,26,0.55)', 2, 13);
  return finish(c);
}

export function saltTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 21);
  paint(ctx, S, S, (_x, _y, i) => mix([214, 208, 196], [248, 246, 238], n[i]));
  // Polygonal crust ridges, the look of a dry salt pan.
  cracks(ctx, S, 40, 'rgba(150,140,125,0.7)', 2.2, 22);
  cracks(ctx, S, 40, 'rgba(255,255,255,0.8)', 1.2, 23);
  return finish(c);
}

export function dirtTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 31);
  const rand = seededRandom(32);
  paint(ctx, S, S, (_x, _y, i) => {
    const pebble = rand() > 0.992 ? 1.35 : 1;
    return shade(mix([118, 58, 38], [170, 92, 58], n[i]), pebble);
  });
  cracks(ctx, S, 8, 'rgba(70,30,20,0.5)', 2, 33);
  return finish(c);
}

export function sandTexture(dark: RGB = [176, 98, 52], light: RGB = [222, 146, 84]): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 41);
  const warp = fbm(S, 2, 3, 42);
  const rand = seededRandom(43);
  paint(ctx, S, S, (x, y, i) => {
    // Wind ripples, warped so they don't look ruled.
    const ripple = Math.sin(((y + warp[i] * 90) / S) * Math.PI * 2 * 18 + x * 0.004) * 0.5 + 0.5;
    const t = n[i] * 0.75 + ripple * 0.25;
    return shade(mix(dark, light, t), 0.94 + rand() * 0.1);
  });
  return finish(c);
}

/** Horizontal sedimentary bands for canyon walls and cliffs. v runs up the wall. */
export function strataTexture(palette: RGB[] = RED_STRATA, crack = 'rgba(60,20,12,0.45)'): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 51);
  const bandNoise = fbm(S, 2, 3, 52);
  paint(ctx, S, S, (_x, y, i) => {
    const v = (y / S + bandNoise[i] * 0.08) * palette.length * 2;
    const k = Math.floor(v);
    const a = palette[((k % palette.length) + palette.length) % palette.length];
    const b = palette[(((k + 1) % palette.length) + palette.length) % palette.length];
    const t = Math.min(1, Math.max(0, (v - k - 0.8) * 5));
    return shade(mix(a, b, t), 0.78 + n[i] * 0.4);
  });
  cracks(ctx, S, 14, crack, 2.5, 53);
  return finish(c);
}

const RED_STRATA: RGB[] = [
  [120, 44, 30],
  [168, 72, 42],
  [196, 112, 64],
  [150, 60, 38],
  [222, 162, 108],
  [176, 84, 50],
  [104, 38, 28],
];

/**
 * Flying Microtonal Banana's cover: cobalt blue and banana yellow. The
 * album's cup paints its four worlds in them (render/themes.ts `banana`).
 */
export const BANANA = {
  sandDark: [226, 160, 0] as RGB,
  sandLight: [255, 216, 40] as RGB,
  strata: [
    [24, 40, 130],
    [40, 72, 186],
    [232, 186, 48],
    [32, 56, 160],
    [252, 222, 112],
    [58, 98, 210],
    [20, 32, 104],
  ] as RGB[],
  crack: 'rgba(10,16,60,0.5)',
  diamond: { top: '#ffd21a', bottom: '#b88a10', rings: ['#fff4c0', '#10207a', '#2a4ad0'] as const },
  water: [[18, 60, 180], [60, 130, 236]] as [RGB, RGB],
  shore: [[240, 190, 20], [255, 222, 80]] as [RGB, RGB],
  neon: { a: '#ffe45a', aGlow: '#ffb81a', b: '#7aa4ff', bGlow: '#2a5aff', tint: [0, 0, 14] as RGB },
  grid: { bg: '#05091e', line: '#ffc81a', glow: '#ff9a00', fine: 'rgba(90,130,255,0.7)' },
  windows: ['#ffd23a', '#fff0a0', '#7aa4ff', '#ffe45a'],
  windowDark: '#121a3a',
  cloudSea: [[24, 40, 130], [250, 220, 120]] as [RGB, RGB],
  bands: ['#1f3fbf', '#ffd21a', '#3a6ae8', '#ffe66a', '#16309a', '#ffc400'],
};

/** Diamondback pattern for barriers (spec: patterned textures along the barriers). */
export function diamondTexture(colors: { top: string; bottom: string; rings: readonly [string, string, string] } = { top: '#d9b46a', bottom: '#8a6232', rings: ['#f3e6c4', '#3b2412', '#6e4422'] }): THREE.CanvasTexture {
  const W = 512;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, colors.top);
  g.addColorStop(1, colors.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const d = H * 0.8;
  for (let k = 0; k < W / d; k++) {
    const cx = k * d + d / 2;
    const cy = H / 2;
    for (const [scale, color] of [
      [1, colors.rings[0]],
      [0.82, colors.rings[1]],
      [0.55, colors.rings[2]],
    ] as const) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx, cy - (H / 2) * scale);
      ctx.lineTo(cx + (d / 2) * scale, cy);
      ctx.lineTo(cx, cy + (H / 2) * scale);
      ctx.lineTo(cx - (d / 2) * scale, cy);
      ctx.closePath();
      ctx.fill();
    }
  }
  return finish(c);
}

export function curbTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 128);
  ctx.fillStyle = '#e8e2d4';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#c9301f';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, 6, 128);
  return finish(c);
}

export function mudTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 61);
  paint(ctx, S, S, (_x, _y, i) => mix([74, 44, 30], [120, 78, 50], n[i]));
  cracks(ctx, S, 60, 'rgba(30,16,10,0.85)', 3, 62);
  return finish(c);
}

export function boneTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 71);
  paint(ctx, S, S, (_x, _y, i) => mix([196, 182, 150], [246, 238, 216], n[i]));
  return finish(c);
}

export function cactusTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const n = fbm(128, 4, 3, 81);
  paint(ctx, 128, 128, (x, _y, i) => {
    const rib = Math.cos((x / 128) * Math.PI * 2 * 8) * 0.5 + 0.5;
    return shade(mix([44, 82, 40], [92, 138, 70], rib), 0.85 + n[i] * 0.3);
  });
  return finish(c);
}

export function grassTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 131);
  const rand = seededRandom(132);
  paint(ctx, S, S, (_x, _y, i) => shade(mix([52, 110, 40], [118, 170, 64], n[i]), 0.85 + rand() * 0.25));
  // Blades: short light strokes.
  ctx.strokeStyle = 'rgba(190,230,120,0.35)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 1800; k++) {
    const x = rand() * S;
    const y = rand() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 3, y - 3 - rand() * 4);
    ctx.stroke();
  }
  return finish(c);
}

/** Cooled lava: black basalt with faintly glowing seams. */
export function basaltTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 141);
  paint(ctx, S, S, (_x, _y, i) => mix([22, 18, 20], [70, 58, 56], n[i]));
  cracks(ctx, S, 26, 'rgba(255,90,20,0.55)', 2.2, 142);
  cracks(ctx, S, 26, 'rgba(255,200,80,0.35)', 0.8, 142);
  return finish(c);
}

/** Molten rock: bright cracks of yellow through orange and crust. */
export function lavaTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 161);
  paint(ctx, S, S, (_x, _y, i) => {
    const v = n[i];
    return v > 0.55 ? mix([255, 140, 20], [255, 236, 120], (v - 0.55) * 2.5) : mix([90, 14, 6], [255, 90, 10], v / 0.55);
  });
  return finish(c);
}

/** Leaf litter and moss for the jungle floor. */
export function jungleFloorTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 151);
  paint(ctx, S, S, (_x, _y, i) => mix([34, 52, 22], [92, 110, 44], n[i]));
  const rand = seededRandom(152);
  for (let k = 0; k < 260; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 3 + rand() * 7;
    const leaf = ['rgba(120,80,30,0.55)', 'rgba(70,110,40,0.6)', 'rgba(160,120,50,0.45)'][k % 3];
    wrapStroke(ctx, S, () => {
      ctx.fillStyle = leaf;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.45, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  return finish(c);
}

/** Overlapping reptile scales, tinted from `base` to `edge`. */
export function scaleTexture(base: string, edge: string): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, S, S);
  const r = S / 12;
  for (let row = -1; row < 14; row++) {
    for (let col = -1; col < 14; col++) {
      const x = col * r * 1.6 + (row % 2) * r * 0.8;
      const y = row * r * 0.9;
      wrapStroke(ctx, S, () => {
        const g = ctx.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
        g.addColorStop(0, base);
        g.addColorStop(1, edge);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 0.85, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  return finish(c);
}

/** Gila monster beadwork: black hide with blotches of round orange beads. */
export function beadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = valueNoise(S, 5, 101);
  const bead = 8;
  ctx.fillStyle = '#1a1210';
  ctx.fillRect(0, 0, S, S);
  for (let y = bead / 2; y < S; y += bead) {
    for (let x = bead / 2; x < S; x += bead) {
      const orange = n[Math.floor(y) * S + Math.floor(x)] > 0.52;
      const g = ctx.createRadialGradient(x - 1, y - 1, 0.5, x, y, bead * 0.55);
      g.addColorStop(0, orange ? '#ffb070' : '#4a3a34');
      g.addColorStop(1, orange ? '#c4501c' : '#140c0a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, bead * 0.46, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish(c);
}

/**
 * A dragon-gila's hide, after PetroDragonic Apocalypse: raised charcoal beads on top (v = 1 at a sphere's top),
 * going to orange and then golden-yellow beads on the throat and belly underneath.
 */
export function dragonHideTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = valueNoise(S, 8, 131);
  const bead = 8;
  ctx.fillStyle = '#0c0b0c';
  ctx.fillRect(0, 0, S, S);
  for (let y = bead / 2; y < S; y += bead) {
    // Offset alternate rows so the beads pack like scales.
    for (let x = bead / 2 + ((y / bead) % 2 ? bead / 2 : 0); x < S + bead; x += bead) {
      const xi = Math.floor(x) % S;
      // 0 on the back, 1 at the belly, with a ragged edge where the colours meet.
      const warm = Math.min(1, Math.max(0, (y / S - 0.5) * 4 + (n[Math.floor(y) * S + xi] - 0.5) * 1.6));
      const [hi, lo] =
        warm < 0.35 ? (n[Math.floor(y) * S + xi] > 0.7 ? ['#6a6266', '#1c1a1c'] : ['#4a4548', '#141214'])
        : warm < 0.8 ? ['#ffa040', '#a8380e']
        : ['#ffe27a', '#d88a1c'];
      const g = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, bead * 0.55);
      g.addColorStop(0, hi);
      g.addColorStop(1, lo);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, bead * 0.47, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish(c);
}

/** Weathered boat planks. */
export function woodTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 2, 4, 111);
  paint(ctx, S, S, (x, y, i) => {
    const plank = Math.floor(y / 32);
    const grain = Math.sin((x / S) * Math.PI * 2 * 3 + n[i] * 9 + plank) * 0.5 + 0.5;
    const seam = y % 32 < 2 ? 0.45 : 1;
    return shade(mix([86, 58, 34], [140, 100, 60], grain * 0.6 + n[i] * 0.4), seam * (0.9 + (plank % 3) * 0.06));
  });
  return finish(c);
}

/** Rough stone with mineral flecks. */
export function stoneTexture(base: RGB, light: RGB): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 121);
  const rand = seededRandom(122);
  paint(ctx, S, S, (_x, _y, i) => shade(mix(base, light, n[i]), rand() > 0.985 ? 1.5 : 1));
  cracks(ctx, S, 12, 'rgba(0,0,0,0.45)', 2, 123);
  return finish(c);
}

export function chevronTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#ff5a00');
  g.addColorStop(1, '#ffb000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#fff6a0';
  ctx.lineWidth = 18;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(16, 92);
  ctx.lineTo(64, 40);
  ctx.lineTo(112, 92);
  ctx.stroke();
  const tex = finish(c);
  tex.repeat.set(1, 3);
  return tex;
}

/** A launcher's deck: twin chevrons climbing it, sky blue into violet, for the glider ramp. */
export function launcherTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#7a3aff');
  g.addColorStop(1, '#2ac8ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#eafcff';
  ctx.lineWidth = 12;
  ctx.lineJoin = 'miter';
  for (const y of [52, 100]) {
    ctx.beginPath();
    ctx.moveTo(14, y);
    ctx.lineTo(64, y - 34);
    ctx.lineTo(114, y);
    ctx.stroke();
  }
  const tex = finish(c);
  tex.repeat.set(1, 2);
  return tex;
}

export function checkerTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 32);
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#f4efe6';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  return finish(c, false);
}

export interface SkyColors {
  zenith: string;
  high: string;
  low: string;
  horizon: string;
  below: string;
  ground: string;
  cloud: string;
  /** Number of cloud banks; 0 for a clear sky. */
  clouds: number;
  /** Stars in the upper sky, and their colour. */
  stars?: { count: number; color: string };
  /** A crescent moon this colour, high on one side. */
  moon?: string;
}

export const DESERT_SKY: SkyColors = {
  zenith: '#0d2a9e',
  high: '#1f4fd6',
  low: '#7fa6ee',
  horizon: '#f1c9a0',
  below: '#d98c58',
  ground: '#8a4a2a',
  cloud: '255,255,255',
  clouds: 26,
};

/** Equirectangular painted sky: deep overhead, hazy at the horizon, soft cumulus. */
export function skyTexture(colors: SkyColors = DESERT_SKY): THREE.CanvasTexture {
  const W = 2048;
  const H = 1024;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, colors.zenith);
  g.addColorStop(0.3, colors.high);
  g.addColorStop(0.47, colors.low);
  g.addColorStop(0.5, colors.horizon);
  g.addColorStop(0.52, colors.below);
  g.addColorStop(1, colors.ground);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const rand = seededRandom(91);
  if (colors.stars) {
    const starRand = seededRandom(92);
    ctx.fillStyle = colors.stars.color;
    for (let k = 0; k < colors.stars.count; k++) {
      const x = starRand() * W;
      const y = H * 0.45 * starRand() ** 1.4;
      const r = 0.6 + starRand() ** 3 * 2.4;
      ctx.globalAlpha = 0.5 + starRand() * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (colors.moon) {
    // A crescent: the full disc, then the sky's own colour bitten out of it, in a soft halo.
    const mx = W * 0.3;
    const my = H * 0.2;
    const mr = 46;
    const halo = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 3);
    halo.addColorStop(0, 'rgba(255,240,170,0.35)');
    halo.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
    ctx.fillStyle = colors.moon;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.high;
    ctx.beginPath();
    ctx.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.88, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let k = 0; k < colors.clouds; k++) {
    const cx = rand() * W;
    const cy = H * (0.3 + rand() * 0.15);
    const scale = 40 + rand() * 70;
    for (let p = 0; p < 9; p++) {
      const px = cx + (rand() - 0.5) * scale * 3;
      const py = cy + (rand() - 0.5) * scale * 0.6;
      const r = scale * (0.5 + rand() * 0.6);
      wrapX(W, px, r, (x) => {
        const cg = ctx.createRadialGradient(x, py - r * 0.2, 0, x, py, r);
        cg.addColorStop(0, `rgba(${colors.cloud},0.85)`);
        cg.addColorStop(0.6, `rgba(${colors.cloud},0.45)`);
        cg.addColorStop(1, `rgba(${colors.cloud},0)`);
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.ellipse(x, py, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  const tex = finish(c, false);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function wrapX(width: number, x: number, r: number, draw: (x: number) => void): void {
  draw(x);
  if (x - r < 0) draw(x + width);
  if (x + r > width) draw(x - width);
}

/** Soft radial sprite used for glows, sparks and lens flare. */
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128): THREE.CanvasTexture {
  const [c, ctx] = canvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.6)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finish(c, false);
}

export function flareRingTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128);
  const g = ctx.createRadialGradient(64, 64, 30, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return finish(c, false);
}

/** Dark soft disc, the classic blob shadow. */
export function blobShadowTexture(): THREE.CanvasTexture {
  return glowTexture('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)', 64);
}

/** Small cube map from the sky colors, for glossy kart reflections. */
export function skyEnvMap(): THREE.CubeTexture {
  const faces: HTMLCanvasElement[] = [];
  for (let f = 0; f < 6; f++) {
    const [c, ctx] = canvas(64);
    if (f === 2) {
      ctx.fillStyle = '#2a56d8';
      ctx.fillRect(0, 0, 64, 64);
    } else if (f === 3) {
      ctx.fillStyle = '#b06a3c';
      ctx.fillRect(0, 0, 64, 64);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, '#2a56d8');
      g.addColorStop(0.5, '#f0c8a0');
      g.addColorStop(0.55, '#c07840');
      g.addColorStop(1, '#8a4a2a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
    faces.push(c);
  }
  const tex = new THREE.CubeTexture(faces);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Item box face: a psychedelic swirl with a big question mark. */
export function itemBoxTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x - S / 2;
      const dy = y - S / 2;
      const a = Math.atan2(dy, dx);
      const r = Math.hypot(dx, dy) / S;
      const h = (a / (Math.PI * 2) + r * 3) % 1;
      const [cr, cg, cb] = hsl(h < 0 ? h + 1 : h, 0.9, 0.58);
      const i = (y * S + x) * 4;
      img.data[i] = cr;
      img.data[i + 1] = cg;
      img.data[i + 2] = cb;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#fff6d0';
  ctx.strokeRect(7, 7, S - 14, S - 14);
  ctx.font = 'bold 190px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#2a0636';
  ctx.strokeText('?', S / 2, S / 2 + 10);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('?', S / 2, S / 2 + 10);
  return finish(c, false);
}

/** Streaky sand for dust devil funnels; tiles horizontally. */
export function dustTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  const n = fbm(W, 4, 4, 211);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const streak = n[(y * W + ((x + y * 2) % W)) % (W * W)];
      img.data[i * 4] = 214;
      img.data[i * 4 + 1] = 168;
      img.data[i * 4 + 2] = 118;
      img.data[i * 4 + 3] = Math.max(0, Math.min(255, (streak - 0.3) * 420));
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c);
}

/** Red warning ring painted under a falling boulder. */
export function warningTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.65)');
  g.addColorStop(0.7, 'rgba(40,0,0,0.5)');
  g.addColorStop(0.82, 'rgba(255,40,30,0.95)');
  g.addColorStop(0.92, 'rgba(255,200,60,0.9)');
  g.addColorStop(1, 'rgba(255,40,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return finish(c, false);
}

function hsl(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** A sheet of fire: hot yellow at the base licking up to transparent red. */
export function flameTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  const n = fbm(W, 4, 4, 301);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const up = 1 - y / H; // 0 at the base, 1 at the top
      const lick = n[y * W + x];
      const a = Math.max(0, Math.min(1, (1 - up * 1.25) + (lick - 0.5) * 0.9));
      const heat = Math.max(0, 1 - up * 1.6);
      const i = (y * W + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 90 + heat * 165;
      img.data[i + 2] = 20 + heat * 120;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = finish(c);
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Falling water: pale blue with bright vertical streaks; scroll v to make it fall. */
export function waterfallTexture(): THREE.CanvasTexture {
  const W = 128;
  const [c, ctx] = canvas(W);
  const n = fbm(W, 4, 4, 401);
  const img = ctx.createImageData(W, W);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      // Stretch the noise vertically into streaks.
      const v = n[((y >> 3) * W + x) % (W * W)] * 0.6 + n[y * W + x] * 0.4;
      const i = (y * W + x) * 4;
      img.data[i] = 150 + v * 105;
      img.data[i + 1] = 205 + v * 50;
      img.data[i + 2] = 235 + v * 20;
      img.data[i + 3] = 200 + v * 55;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c);
}

/** Sun-bleached boardwalk planks running across the road. */
export function boardsTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 2, 4, 171);
  paint(ctx, S, S, (x, y, i) => {
    const plank = Math.floor(y / 21);
    const grain = Math.sin((x / S) * Math.PI * 2 * 4 + n[i] * 7 + plank * 1.7) * 0.5 + 0.5;
    const seam = y % 21 < 2 ? 0.5 : 1;
    const nail = (x % 64 < 4 || x % 64 > 60) && y % 21 > 8 && y % 21 < 12 ? 0.6 : 1;
    return shade(mix([150, 122, 92], [214, 190, 150], grain * 0.5 + n[i] * 0.5), seam * nail * (0.9 + (plank % 4) * 0.04));
  });
  return finish(c);
}

/** Sheet ice: pale blue with white frost streaks along the road and fine cracks. */
export function iceTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 181);
  const streak = fbm(S, 8, 3, 182);
  paint(ctx, S, S, (x, _y, i) => {
    const frost = Math.max(0, Math.sin((x / S) * Math.PI * 2 * 6 + streak[i] * 6)) ** 6;
    return mix(mix([120, 170, 210], [190, 225, 245], n[i]), [248, 252, 255], frost * 0.6);
  });
  cracks(ctx, S, 30, 'rgba(255,255,255,0.75)', 1.2, 183);
  cracks(ctx, S, 14, 'rgba(60,110,160,0.5)', 1.6, 184);
  return finish(c);
}

/** Night asphalt with glowing edge and centre lines (the road shows two tiles across). */
export function neonRoadTexture(colors = { a: '#ff7ae8', aGlow: '#ff3ad8', b: '#8af0ff', bGlow: '#3adcff', tint: [0, -2, 10] as RGB }): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 191);
  paint(ctx, S, S, (_x, _y, i) => {
    const v = 18 + n[i] * 20;
    return [v + colors.tint[0], v + colors.tint[1], v + colors.tint[2]];
  });
  const line = (x: number, color: string, dashed: boolean) => {
    ctx.fillStyle = color;
    for (let y = 0; y < S; y += dashed ? 64 : S) ctx.fillRect(x, y, 6, dashed ? 34 : S);
  };
  ctx.shadowBlur = 14;
  ctx.shadowColor = colors.aGlow;
  line(0, colors.a, true);
  ctx.shadowColor = colors.bGlow;
  line(S - 6, colors.b, false);
  return finish(c);
}

/** Bands of the spectrum across the road, with a soft sheen. */
export function rainbowTexture(colors: readonly string[] = ['#ff5a7a', '#ffa64a', '#ffe45a', '#6aef7a', '#4ad0ff', '#7a7aff', '#c86aff']): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  colors.forEach((col, k) => {
    ctx.fillStyle = col;
    ctx.fillRect((k * S) / colors.length, 0, S / colors.length + 1, S);
  });
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, 'rgba(255,255,255,0.25)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let y = 0; y < S; y += 64) ctx.fillRect(0, y, S, 3);
  return finish(c);
}

/** Shallow lagoon: turquoise water over sand, with sandbars and ripples. */
export function lagoonTexture(water: [RGB, RGB] = [[40, 170, 190], [110, 220, 210]], shore: [RGB, RGB] = [[214, 196, 150], [236, 222, 180]]): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 5, 201);
  const warp = fbm(S, 2, 3, 202);
  paint(ctx, S, S, (x, y, i) => {
    const ripple = Math.sin(((x + warp[i] * 120) / S) * Math.PI * 2 * 14 + y * 0.01) * 0.5 + 0.5;
    const depth = n[i];
    if (depth > 0.68) return mix(shore[0], shore[1], ripple * 0.3 + (depth - 0.68) * 2);
    return shade(mix(water[0], water[1], depth / 0.68), 0.92 + ripple * 0.12);
  });
  return finish(c);
}

/** Wind-packed snow with blue shadows. */
export function snowTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 211);
  const rand = seededRandom(212);
  paint(ctx, S, S, (_x, _y, i) => shade(mix([196, 212, 232], [250, 252, 255], n[i]), 0.97 + rand() * 0.05));
  return finish(c);
}

/** A dark grid that glows, for the city's ground. */
export function neonGridTexture(colors = { bg: '#0c0818', line: '#7a3ad8', glow: '#b84aff', fine: 'rgba(58,220,255,0.5)' }): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, S, S);
  ctx.shadowBlur = 10;
  ctx.shadowColor = colors.glow;
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, S - 3, S - 3);
  ctx.strokeStyle = colors.fine;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(S / 2, 0);
  ctx.lineTo(S / 2, S);
  ctx.moveTo(0, S / 2);
  ctx.lineTo(S, S / 2);
  ctx.stroke();
  return finish(c);
}

/** Lit windows on a dark tower, tiled up the walls. */
export function windowsTexture(lit: readonly string[] = ['#ffd27a', '#7ae8ff', '#ff7ae0', '#fff4d8'], dark = '#241c34'): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const rand = seededRandom(221);
  ctx.fillStyle = '#141020';
  ctx.fillRect(0, 0, S, S);
  for (let y = 4; y < S; y += 16) {
    for (let x = 4; x < S; x += 16) {
      ctx.fillStyle = rand() < 0.55 ? lit[Math.floor(rand() * lit.length)] : dark;
      ctx.fillRect(x, y, 9, 10);
    }
  }
  return finish(c);
}

/** A soft sea of cloud seen from above, for the sky track's void. */
export function cloudSeaTexture(shadow: RGB = [196, 170, 230], light: RGB = [255, 244, 250]): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 6, 231);
  paint(ctx, S, S, (_x, _y, i) => {
    const v = Math.min(1, Math.max(0, (n[i] - 0.3) * 1.8));
    return mix(shadow, light, v);
  });
  return finish(c);
}

/** One butterfly wing (body at the left edge) on a transparent ground: white, to be tinted. */
export function wingTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#2a1a2a';
  ctx.lineWidth = 5;
  for (const [cx, cy, rx, ry, rot] of [
    [64, 42, 58, 38, -0.35],
    [52, 92, 40, 30, 0.45],
  ]) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(40,20,40,0.85)';
  for (const [x, y, r] of [
    [86, 34, 9],
    [58, 92, 7],
    [104, 52, 5],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, false);
}

/** The swirl inside a Nonagon gate: nine rainbow arms spiralling into a bright core. */
export function portalTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const h = S / 2;
  ctx.fillStyle = '#1a0630';
  ctx.fillRect(0, 0, S, S);
  for (let arm = 0; arm < 9; arm++) {
    for (let t = 0; t < 1; t += 0.004) {
      const a = (arm / 9) * Math.PI * 2 + t * Math.PI * 3.2;
      const r = t * h;
      ctx.fillStyle = `hsl(${(arm * 40 + t * 220) % 360}, 95%, ${55 + (1 - t) * 20}%)`;
      ctx.beginPath();
      ctx.arc(h + Math.cos(a) * r, h + Math.sin(a) * r, 2 + t * 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const core = ctx.createRadialGradient(h, h, 0, h, h, h);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.18, 'rgba(255,240,255,0.7)');
  core.addColorStop(0.5, 'rgba(255,255,255,0)');
  core.addColorStop(1, 'rgba(10,0,20,0.6)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, S, S);
  return finish(c, false);
}

/** Metal-flake drum wrap: a base colour glittering with flecks. */
export function sparkleTexture(base: RGB): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rand = seededRandom(301);
  const n = fbm(S, 4, 3, 302);
  paint(ctx, S, S, (_x, _y, i) => {
    const r = rand();
    const flake = r > 0.94 ? 1.7 : r > 0.8 ? 1.25 : r < 0.08 ? 0.6 : 1;
    return shade(base, flake * (0.85 + n[i] * 0.3)).map((v) => Math.min(255, v)) as RGB;
  });
  return finish(c);
}

/** Rubber tank tread: raised blocks across the band, grooves between. */
export function treadTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 16) {
    const g = ctx.createLinearGradient(0, y, 0, y + 12);
    g.addColorStop(0, '#5a5a5a');
    g.addColorStop(1, '#262626');
    ctx.fillStyle = g;
    ctx.fillRect(6, y + 2, S - 12, 10);
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(S / 2 - 6, y + 4, 12, 6);
  }
  return finish(c);
}

/** A toadstool cap: `base` with soft pale spots, for a sphere's UVs. */
export function spotsTexture(base: string, spot: string, count = 18): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  const rand = seededRandom(311);
  for (let k = 0; k < count; k++) {
    const x = rand() * S;
    const y = 20 + rand() * (S * 0.55);
    const r = 8 + rand() * 14;
    wrapStroke(ctx, S, () => {
      const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      g.addColorStop(0, spot);
      g.addColorStop(0.8, spot);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.2, r, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  return finish(c);
}

/** One octave of organ keys, white with black sharps, along u. */
export function keysTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 64);
  ctx.fillStyle = '#f4efe2';
  ctx.fillRect(0, 0, 256, 64);
  const w = 256 / 7;
  ctx.strokeStyle = '#3a3428';
  ctx.lineWidth = 2;
  for (let k = 0; k <= 7; k++) {
    ctx.beginPath();
    ctx.moveTo(k * w, 0);
    ctx.lineTo(k * w, 64);
    ctx.stroke();
  }
  ctx.fillStyle = '#16120e';
  for (const k of [1, 2, 4, 5, 6]) ctx.fillRect(k * w - w * 0.3, 0, w * 0.6, 38);
  return finish(c);
}

/** Speaker grille cloth: a fine woven grid. */
export function grilleTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (x, y) => {
    const weave = (x % 4 < 2) !== (y % 4 < 2) ? 1 : 0.7;
    return shade([58, 52, 46], weave);
  });
  return finish(c);
}

/** Hot rod flames on a transparent ground, licking back along u. */
export function flameDecalTexture(inner = '#ffe14d', outer = '#ff4a1a'): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 64);
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.strokeStyle = '#2a0a06';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  // Tongues from a wide root at the left to curled points on the right.
  for (const [cy, h, tip, curl] of [[20, 14, 230, -10], [34, 16, 252, 6], [46, 12, 190, 10], [28, 10, 160, -14]]) {
    ctx.beginPath();
    ctx.moveTo(0, cy - h);
    ctx.bezierCurveTo(tip * 0.4, cy - h, tip * 0.75, cy + curl - 6, tip, cy + curl);
    ctx.bezierCurveTo(tip * 0.7, cy + curl + 4, tip * 0.35, cy + h, 0, cy + h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  return finish(c, false);
}

/** A trackside billboard: a slogan in chunky type over a bold two-colour ground. */
export function billboardTexture(text: string, bg: string, fg: string, ink = '#1a0a1a'): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 192);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 192);
  ctx.fillStyle = fg;
  for (let k = 0; k < 9; k++) {
    ctx.beginPath();
    ctx.moveTo(256, 96);
    ctx.arc(256, 96, 400, (k / 9) * Math.PI * 2, ((k + 0.5) / 9) * Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 192);
  ctx.globalAlpha = 1;
  ctx.font = 'italic 900 88px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 12;
  ctx.strokeStyle = ink;
  ctx.strokeText(text, 256, 100, 480);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 256, 100, 480);
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 502, 182);
  return finish(c, false);
}

/** A roadside name board: the section's name on a dark plate with a coloured bar, readable at speed. */
export function signTexture(text: string, bar: string, fg: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 160);
  ctx.fillStyle = '#1a1420';
  ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, 512, 22);
  ctx.fillRect(0, 138, 512, 22);
  ctx.font = 'italic 900 64px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#000000';
  ctx.strokeText(text.toUpperCase(), 256, 82, 470);
  ctx.fillStyle = fg;
  ctx.fillText(text.toUpperCase(), 256, 82, 470);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#000000';
  ctx.strokeRect(3, 3, 506, 154);
  return finish(c, false);
}

/** Words painted on the road: white letters with a dark edge on a clear ground. */
export function roadTextTexture(text: string, fg = '#f4f4f0'): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 256);
  ctx.clearRect(0, 0, 1024, 256);
  ctx.font = '900 190px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 16;
  ctx.strokeStyle = '#1a0a1a';
  ctx.strokeText(text.toUpperCase(), 512, 134, 980);
  ctx.fillStyle = fg;
  ctx.fillText(text.toUpperCase(), 512, 134, 980);
  return finish(c, false);
}

/** A corner warning board: white chevrons pointing left on red. Flip it for a right-hander. */
export function chevronSignTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 128);
  ctx.fillStyle = '#d8202a';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#ffffff';
  for (let k = 0; k < 3; k++) {
    const x = 40 + k * 70;
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.lineTo(x + 40, 14);
    ctx.lineTo(x + 66, 14);
    ctx.lineTo(x + 26, 64);
    ctx.lineTo(x + 66, 114);
    ctx.lineTo(x + 40, 114);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 120);
  return finish(c, false);
}

/** Petrodragonic ground: cracked, oil-soaked earth, black puddles with a rainbow sheen, embers in the cracks. */
export function oilEarthTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 401);
  const pools = fbm(S, 3, 3, 402);
  paint(ctx, S, S, (x, y, i) => {
    if (pools[i] > 0.62) {
      // A slick: near black, a faint oily rainbow where it thins at the rim.
      const rim = Math.max(0, 1 - (pools[i] - 0.62) * 12);
      const hue = (x + y) * 0.05 + n[i] * 9;
      return [8 + rim * (40 + 30 * Math.sin(hue)), 6 + rim * (30 + 30 * Math.sin(hue + 2)), 10 + rim * (45 + 30 * Math.sin(hue + 4))];
    }
    return mix([28, 20, 18], [62, 44, 34], n[i]);
  });
  cracks(ctx, S, 26, 'rgba(0,0,0,0.85)', 3, 403);
  cracks(ctx, S, 8, 'rgba(255,90,20,0.55)', 1.2, 404);
  return finish(c);
}

/** An oil road: wet black tarmac with streaks of sheen; it slides like ice. */
export function oilRoadTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 4, 411);
  const streak = fbm(S, 2, 3, 412);
  paint(ctx, S, S, (x, y, i) => {
    const sheen = Math.max(0, streak[i] - 0.55) * 4;
    const hue = y * 0.03 + x * 0.01 + n[i] * 6;
    const base = 14 + n[i] * 16;
    return [base + sheen * (50 + 40 * Math.sin(hue)), base + sheen * (40 + 40 * Math.sin(hue + 2.1)), base + 4 + sheen * (60 + 40 * Math.sin(hue + 4.2))];
  });
  return finish(c);
}

/** Rusted sheet metal for barriers: orange-brown scale over dark steel, rivet rows. */
export function rustTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 421);
  paint(ctx, S, S, (_x, _y, i) => (n[i] > 0.5 ? mix([70, 38, 22], [150, 70, 30], (n[i] - 0.5) * 2) : mix([30, 28, 30], [70, 38, 22], n[i] * 2)));
  ctx.fillStyle = 'rgba(20,14,12,0.9)';
  for (let x = 8; x < S; x += 32) for (const y of [12, S - 12]) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/** Martian regolith: rust-red dust, darker basalt patches, small craters. */
export function marsTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 501);
  const patch = fbm(S, 3, 3, 502);
  paint(ctx, S, S, (_x, _y, i) => {
    const base = mix([132, 52, 26], [206, 104, 56], n[i]);
    return patch[i] > 0.6 ? mix(base, [70, 30, 22], Math.min(1, (patch[i] - 0.6) * 5)) : base;
  });
  const rand = seededRandom(503);
  for (let k = 0; k < 14; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 4 + rand() * 18;
    wrapStroke(ctx, S, () => {
      ctx.strokeStyle = 'rgba(60,20,10,0.45)';
      ctx.lineWidth = r * 0.25;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(240,150,100,0.35)';
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.arc(x - r * 0.1, y - r * 0.1, r * 1.1, Math.PI * 0.9, Math.PI * 1.6);
      ctx.stroke();
    });
  }
  return finish(c);
}

/** A packed red dirt road on Mars, rover ruts down it. */
export function regolithRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 511);
  paint(ctx, S, S, (x, _y, i) => {
    const rut = Math.abs(x / S - 0.3) < 0.04 || Math.abs(x / S - 0.7) < 0.04 ? 0.88 : 1;
    const b = mix([120, 50, 30], [176, 86, 50], n[i]);
    return [b[0] * rut, b[1] * rut, b[2] * rut];
  });
  return finish(c);
}

/** Storm plains: flattened wet grass, dark mud showing through, puddles catching the sky. */
export function stormGrassTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 5, 5, 521);
  const mud = fbm(S, 3, 3, 522);
  paint(ctx, S, S, (_x, _y, i) => {
    if (mud[i] > 0.68) return mix([70, 84, 92], [120, 138, 150], (mud[i] - 0.68) * 3);
    if (mud[i] > 0.58) return mix([52, 46, 34], [74, 66, 48], n[i]);
    return mix([46, 70, 40], [96, 122, 66], n[i]);
  });
  return finish(c);
}

/** Rain-soaked asphalt: near black, glossy streaks. */
export function wetRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 4, 531);
  const streak = fbm(S, 2, 3, 532);
  paint(ctx, S, S, (_x, _y, i) => {
    const sheen = Math.max(0, streak[i] - 0.6) * 3;
    const b = 30 + n[i] * 20;
    return [b + sheen * 60, b + sheen * 66, b + 4 + sheen * 76];
  });
  return finish(c);
}

/** Deep space for the void below the road: nebula clouds and stars. */
export function voidTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 5, 541);
  const m = fbm(S, 2, 4, 542);
  paint(ctx, S, S, (_x, _y, i) => {
    const a = Math.max(0, n[i] - 0.45) * 2;
    const b = Math.max(0, m[i] - 0.5) * 2;
    return [6 + a * 120 + b * 30, 4 + a * 20 + b * 60, 14 + a * 110 + b * 120];
  });
  const rand = seededRandom(543);
  for (let k = 0; k < 260; k++) {
    const v = 150 + rand() * 105;
    ctx.fillStyle = `rgb(${v},${v},${Math.min(255, v + 20)})`;
    const r = rand() < 0.08 ? 1.6 : 0.8;
    ctx.fillRect(rand() * S, rand() * S, r, r);
  }
  return finish(c);
}

/** A road of starlight across the void: deep violet, stars set in it, glowing rails of colour down its sides. */
export function cosmicRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 4, 551);
  paint(ctx, S, S, (x, _y, i) => {
    const edge = x / S < 0.06 || x / S > 0.94;
    if (edge) return [255, 60 + n[i] * 80, 200];
    return [24 + n[i] * 40, 10 + n[i] * 16, 50 + n[i] * 60];
  });
  const rand = seededRandom(552);
  for (let k = 0; k < 70; k++) {
    ctx.fillStyle = rand() < 0.3 ? '#9ae8ff' : '#ffffff';
    ctx.fillRect(16 + rand() * (S - 32), rand() * S, 1.5, 1.5);
  }
  ctx.fillStyle = 'rgba(120,240,255,0.7)';
  ctx.fillRect(S / 2 - 2, 0, 4, S / 2);
  return finish(c);
}

/** Corrugated steel for colony barriers and huts, a hazard stripe along the top. */
export function corrugatedTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 3, 561);
  paint(ctx, S, S, (x, y, i) => {
    const ridge = 0.8 + 0.2 * Math.sin((x / S) * Math.PI * 32);
    const dust = y / S;
    const b = mix([150, 150, 156], [196, 120, 80], dust * 0.7 + n[i] * 0.3);
    return [b[0] * ridge, b[1] * ridge, b[2] * ridge];
  });
  for (let x = -S; x < S * 2; x += 32) {
    ctx.fillStyle = '#ffc020';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 16, 0);
    ctx.lineTo(x + 32, 24);
    ctx.lineTo(x + 16, 24);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(20,20,20,0.9)';
  ctx.fillRect(0, 24, S, 3);
  return finish(c);
}

/** Pink with "Yikes" in a hand-lettered script, drawn as one stroke so it reads the same without any script font installed. */
export function yikesTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#ff8ad0');
  g.addColorStop(1, '#ff4aa8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // One continuous script stroke, Y-i-k-e-s, then the i's dot.
  const word = () => {
    ctx.beginPath();
    // Y: left arm down into a cup, up to the right arm's top.
    ctx.moveTo(70, 72);
    ctx.bezierCurveTo(78, 60, 92, 66, 92, 84);
    ctx.bezierCurveTo(92, 120, 104, 142, 122, 142);
    ctx.bezierCurveTo(140, 142, 150, 110, 154, 70);
    // ...the right arm runs down into a descender loop and swings back up to the i.
    ctx.bezierCurveTo(150, 130, 146, 196, 118, 214);
    ctx.bezierCurveTo(98, 226, 92, 200, 112, 186);
    ctx.bezierCurveTo(136, 170, 160, 160, 178, 128);
    // i
    ctx.bezierCurveTo(176, 148, 170, 164, 184, 166);
    ctx.bezierCurveTo(196, 166, 206, 150, 214, 132);
    // k: a tall looped ascender, then the arm and leg.
    ctx.bezierCurveTo(232, 96, 244, 46, 226, 40);
    ctx.bezierCurveTo(208, 36, 206, 100, 204, 166);
    ctx.bezierCurveTo(212, 140, 236, 118, 252, 124);
    ctx.bezierCurveTo(266, 130, 254, 146, 226, 146);
    ctx.bezierCurveTo(248, 150, 250, 166, 270, 166);
    // e
    ctx.bezierCurveTo(286, 166, 300, 150, 304, 140);
    ctx.bezierCurveTo(312, 120, 294, 114, 286, 130);
    ctx.bezierCurveTo(278, 148, 288, 168, 304, 166);
    ctx.bezierCurveTo(318, 164, 328, 150, 336, 136);
    // s, and a flourish off the end.
    ctx.bezierCurveTo(338, 126, 344, 120, 348, 122);
    ctx.bezierCurveTo(352, 140, 370, 150, 358, 162);
    ctx.bezierCurveTo(350, 170, 334, 168, 330, 160);
    ctx.bezierCurveTo(350, 172, 400, 168, 440, 120);
  };
  ctx.lineCap = ctx.lineJoin = 'round';
  word();
  ctx.strokeStyle = '#7a0a4a';
  ctx.lineWidth = 22;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 11;
  ctx.stroke();
  for (const [w, color] of [[22, '#7a0a4a'], [11, '#ffffff']] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(186, 100, w / 2 + 2, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, false);
}

/** Phantom Island: dark wet sand and sea grass under a violet dusk, pools of mist-blue water left by the tide. */
export function phantomShoreTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 601);
  const pool = fbm(S, 3, 3, 602);
  paint(ctx, S, S, (_x, _y, i) => {
    if (pool[i] > 0.66) return mix([60, 92, 120], [120, 168, 190], (pool[i] - 0.66) * 3);
    if (pool[i] > 0.56) return mix([74, 70, 88], [104, 98, 116], n[i]);
    return mix([46, 62, 66], [86, 104, 96], n[i]);
  });
  return finish(c);
}

/** Cliff-top turf by an airfield: short bright grass, clover, mown stripes. */
export function turfTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 5, 5, 611);
  const clover = fbm(S, 2, 3, 612);
  paint(ctx, S, S, (_x, y, i) => {
    const stripe = Math.floor((y / S) * 8) % 2 ? 1.06 : 0.94;
    const base = mix([70, 132, 52], [128, 184, 80], n[i]);
    return shade(clover[i] > 0.7 ? mix(base, [150, 200, 110], 0.4) : base, stripe);
  });
  return finish(c);
}

/** The grove's floor: moss, leaf litter in amber and rust, roots showing through. */
export function groveFloorTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 5, 5, 621);
  const moss = fbm(S, 3, 4, 622);
  paint(ctx, S, S, (_x, _y, i) => {
    if (moss[i] > 0.55) return mix([44, 86, 40], [96, 140, 60], n[i]);
    return mix([92, 58, 30], [176, 118, 52], n[i]);
  });
  cracks(ctx, S, 18, 'rgba(40,26,16,0.55)', 3, 623);
  return finish(c);
}

/** The Sea of Doubt at night: black-green water, whitecaps streaking it. */
export function nightSeaTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 5, 631);
  const warp = fbm(S, 2, 3, 632);
  paint(ctx, S, S, (x, y, i) => {
    const swell = Math.sin(((x + warp[i] * 160) / S) * Math.PI * 2 * 9 + y * 0.02) * 0.5 + 0.5;
    const cap = Math.max(0, swell * n[i] - 0.55) * 4;
    const b = mix([8, 20, 26], [24, 52, 62], n[i]);
    return mix(b, [190, 210, 214], Math.min(1, cap));
  });
  return finish(c);
}

/** Magenta Mountain: snow gone pink in the light, magenta shadows, glints of crystal. */
export function magentaSnowTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 701);
  const drift = fbm(S, 2, 3, 702);
  paint(ctx, S, S, (_x, _y, i) => shade(mix([196, 120, 190], [252, 214, 240], n[i]), 0.85 + drift[i] * 0.2));
  const rand = seededRandom(703);
  for (let k = 0; k < 220; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,240,255,0.9)' : 'rgba(255,90,220,0.8)';
    ctx.fillRect(rand() * S, rand() * S, 1.5, 1.5);
  }
  return finish(c);
}

/** A road of magenta crystal: facets, light running through the cracks. */
export function crystalRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 4, 711);
  paint(ctx, S, S, (x, y, i) => {
    const facet = (Math.floor(x / 32) + Math.floor(y / 48)) % 2 ? 1 : 0.86;
    return shade(mix([120, 30, 110], [220, 80, 200], n[i]), facet);
  });
  cracks(ctx, S, 10, 'rgba(255,190,250,0.7)', 2, 712);
  return finish(c);
}

/** Kepler-22b's shallows: teal water over violet sand, glowing specks of life. */
export function alienShoreTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 5, 721);
  const bar = fbm(S, 2, 3, 722);
  paint(ctx, S, S, (x, y, i) => {
    const ripple = Math.sin((x / S) * Math.PI * 2 * 11 + n[i] * 6 + y * 0.01) * 0.5 + 0.5;
    if (bar[i] > 0.66) return mix([110, 70, 150], [170, 120, 200], n[i]);
    return shade(mix([20, 120, 140], [60, 200, 200], n[i]), 0.9 + ripple * 0.15);
  });
  const rand = seededRandom(723);
  for (let k = 0; k < 160; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(140,255,230,0.9)' : 'rgba(255,140,255,0.8)';
    ctx.beginPath();
    ctx.arc(rand() * S, rand() * S, 1 + rand() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/** A road over Kepler-22b's reef: coral pink and violet, teal pools between. */
export function reefRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 731);
  const pool = fbm(S, 3, 3, 732);
  paint(ctx, S, S, (_x, _y, i) => {
    if (pool[i] > 0.7) return mix([30, 140, 150], [70, 190, 190], n[i]);
    return mix([170, 80, 130], [230, 140, 170], n[i]);
  });
  return finish(c);
}

/** A clipped garden hedge: a wall of small dark leaves with lighter ones catching the sun, the odd red berry. */
export function hedgeTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 5, 913);
  paint(ctx, S, S, (_x, _y, i) => mix([20, 60, 22], [50, 110, 40], n[i]));
  const rand = seededRandom(914);
  for (let k = 0; k < 2600; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const g = 70 + Math.floor(rand() * 90);
    ctx.fillStyle = `rgba(${Math.floor(g * 0.45)},${g},${Math.floor(g * 0.35)},0.85)`;
    ctx.beginPath();
    ctx.ellipse(x, y, 5, 2.6, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = '#c82a2a';
    ctx.beginPath();
    ctx.arc(rand() * S, rand() * S, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/** The Garden Goblin's lawn, seen by someone very small: big blades, clover, daisies. */
export function lawnTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 5, 5, 741);
  paint(ctx, S, S, (_x, _y, i) => mix([50, 120, 40], [120, 190, 70], n[i]));
  const rand = seededRandom(742);
  for (let k = 0; k < 900; k++) {
    const x = rand() * S;
    const y = rand() * S;
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(30,90,25,0.7)' : 'rgba(150,210,90,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 6, y - 8 - rand() * 10);
    ctx.stroke();
  }
  for (let k = 0; k < 30; k++) {
    const x = rand() * S;
    const y = rand() * S;
    ctx.fillStyle = '#ffffff';
    for (let p = 0; p < 6; p++) {
      ctx.beginPath();
      ctx.arc(x + Math.cos(p) * 4, y + Math.sin(p) * 4, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/** Crazy paving: flat stones in warm greys and buffs, moss in the joints. */
export function pavingTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 751);
  paint(ctx, S, S, (_x, _y, i) => mix([150, 140, 120], [200, 190, 165], n[i]));
  cracks(ctx, S, 26, 'rgba(70,110,50,0.9)', 3, 752);
  return finish(c);
}

/** A primeval shore: black volcanic sand, green weed, shells. */
export function primevalShoreTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 761);
  const weed = fbm(S, 3, 3, 762);
  paint(ctx, S, S, (_x, _y, i) => {
    if (weed[i] > 0.63) return mix([40, 70, 40], [80, 110, 50], n[i]);
    return mix([30, 30, 34], [80, 76, 74], n[i]);
  });
  const rand = seededRandom(763);
  for (let k = 0; k < 120; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(230,220,200,0.8)' : 'rgba(200,160,120,0.7)';
    ctx.fillRect(rand() * S, rand() * S, 2, 2);
  }
  return finish(c);
}

/** Crumbling Castle's floor: big worn flagstones, dark mortar, the odd crack and a little moss. */
export function flagstoneTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 801);
  const rand = seededRandom(802);
  // Two rows of stones per tile, each row offset half a stone, each stone its own shade.
  const shadeOf: number[] = Array.from({ length: 8 }, () => 0.82 + rand() * 0.3);
  paint(ctx, S, S, (x, y, i) => {
    const row = Math.floor(y / 128);
    const col = Math.floor((x + row * 64) / 128) % 2;
    const lx = (x + row * 64) % 128;
    const ly = y % 128;
    const joint = lx < 4 || ly < 4;
    if (joint) return mix([34, 32, 30], [60, 58, 52], n[i]);
    return shade(mix([96, 92, 86], [150, 146, 136], n[i]), shadeOf[row * 2 + col]);
  });
  cracks(ctx, S, 9, 'rgba(20,18,16,0.55)', 1.5, 803);
  for (let k = 0; k < 60; k++) {
    ctx.fillStyle = 'rgba(70,96,50,0.5)';
    ctx.fillRect(rand() * S, (rand() < 0.5 ? 0 : 126) + rand() * 6, 3 + rand() * 6, 2);
  }
  return finish(c);
}

/** A castle wall: courses of dark grey blocks, some fallen out, scorched near the foot. */
export function castleWallTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 811);
  const rand = seededRandom(812);
  const missing = new Set<number>();
  for (let k = 0; k < 4; k++) missing.add(Math.floor(rand() * 32));
  paint(ctx, S, S, (x, y, i) => {
    const row = Math.floor(y / 32);
    const lx = (x + (row % 2) * 32) % 64;
    const block = row * 4 + Math.floor(((x + (row % 2) * 32) % S) / 64);
    if (lx < 3 || y % 32 < 3) return mix([22, 20, 22], [40, 38, 40], n[i]);
    // A block gone: the dark rubble core behind it.
    if (missing.has(block)) return mix([16, 12, 12], [44, 34, 30], n[i]);
    return shade(mix([70, 68, 72], [124, 120, 122], n[i]), 0.85 + ((block * 37) % 10) * 0.025);
  });
  cracks(ctx, S, 7, 'rgba(10,8,8,0.6)', 1.5, 813);
  return finish(c);
}

/** The ground round Crumbling Castle: ash and cinders over cooled lava, embers glowing in the cracks. */
export function castleGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 821);
  paint(ctx, S, S, (_x, _y, i) => mix([26, 22, 22], [70, 60, 56], n[i]));
  cracks(ctx, S, 30, 'rgba(255,90,20,0.55)', 1.6, 822);
  const rand = seededRandom(823);
  for (let k = 0; k < 160; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(110,100,96,0.7)' : 'rgba(30,26,26,0.8)';
    ctx.fillRect(rand() * S, rand() * S, 2 + rand() * 4, 2 + rand() * 3);
  }
  return finish(c);
}

/** The Castle in the Air's road: packed cloud, white on top, lilac in the folds. */
export function cloudRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 5, 831);
  const puff = fbm(S, 6, 3, 832);
  paint(ctx, S, S, (_x, _y, i) => {
    const v = Math.min(1, Math.max(0, n[i] * 0.7 + puff[i] * 0.5 - 0.1));
    return mix([196, 190, 232], [255, 252, 255], v);
  });
  return finish(c);
}

/** Inner Cell's road: a pink membrane, a lipid bilayer of tiny beads, veins of something running through it. */
export function membraneTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 841);
  paint(ctx, S, S, (x, y, i) => {
    const bead = Math.sin((x / S) * Math.PI * 2 * 32) * Math.sin((y / S) * Math.PI * 2 * 32) * 0.5 + 0.5;
    return shade(mix([170, 60, 110], [236, 130, 170], n[i]), 0.88 + bead * 0.14);
  });
  cracks(ctx, S, 10, 'rgba(120,20,80,0.6)', 2.5, 842);
  cracks(ctx, S, 8, 'rgba(255,190,220,0.5)', 1.2, 843);
  return finish(c);
}

/** Inner Cell's floor: cytoplasm, violet and murky, organelles floating in it. */
export function cytoplasmTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 5, 851);
  paint(ctx, S, S, (_x, _y, i) => mix([70, 30, 90], [150, 80, 150], n[i]));
  const rand = seededRandom(852);
  for (let k = 0; k < 90; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 3 + rand() * 10;
    const ry = r * (0.5 + rand() * 0.5);
    const a = rand() * Math.PI;
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,150,200,0.35)' : 'rgba(150,240,200,0.3)';
    wrapStroke(ctx, S, () => {
      ctx.beginPath();
      ctx.ellipse(x, y, r, ry, a, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  return finish(c);
}

/** A cell wall: folds of membrane, pink and wet-looking. */
export function cellWallTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 4, 861);
  paint(ctx, S, S, (x, _y, i) => {
    const fold = Math.sin((x / S) * Math.PI * 2 * 6 + n[i] * 5) * 0.5 + 0.5;
    return mix([110, 30, 80], [230, 120, 170], fold * 0.7 + n[i] * 0.3);
  });
  return finish(c);
}

/** The four colours of Tetrachromacy, the last the one only a tetrachromat sees. */
export const TETRA_COLOURS = [0xff3a4a, 0x3aff7a, 0x3a7aff, 0xd040ff] as const;

/** Tetrachromacy's road: glass tiles in the four colours, bright edges between them. */
export function prismRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 3, 871);
  const cols: RGB[] = TETRA_COLOURS.map((h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255]);
  paint(ctx, S, S, (x, y, i) => {
    const tx = Math.floor(x / 64);
    const ty = Math.floor(y / 64);
    const edge = x % 64 < 3 || y % 64 < 3;
    if (edge) return [200, 200, 230];
    // A diagonal through each tile splits it in two colours, like light through a prism.
    const diag = (x % 64) > (y % 64) ? 1 : 0;
    const col = cols[(tx + ty * 2 + diag) % 4];
    return mix(shade(col, 0.25), shade(col, 0.8), 0.4 + n[i] * 0.5);
  });
  return finish(c);
}

/** Tetrachromacy's floor: dark glass, bands of spectrum running under it. */
export function prismGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 4, 881);
  const cols: RGB[] = TETRA_COLOURS.map((h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255]);
  paint(ctx, S, S, (x, y, i) => {
    const band = (((x + y) / S) * 4 + n[i] * 1.5) % 4;
    const k = Math.floor(band);
    const col = mix(cols[k], cols[(k + 1) % 4], band - k);
    return mix([12, 10, 24], col, 0.18 + n[i] * 0.12);
  });
  return finish(c);
}

/** A mirror wall: silver, a spectrum smeared across it. */
export function mirrorTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 2, 3, 891);
  const cols: RGB[] = TETRA_COLOURS.map((h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255]);
  paint(ctx, S, S, (x, y, i) => {
    const band = ((y / S) * 4 + n[i]) % 4;
    const k = Math.floor(band);
    const silver = mix([150, 156, 176], [236, 240, 255], (Math.sin((x / S) * Math.PI * 2) * 0.5 + 0.5) * 0.6 + n[i] * 0.4);
    return mix(silver, cols[k], 0.22);
  });
  return finish(c);
}

/** Robot Stop's factory floor: diamond plate steel, dark and scuffed, oil in the tread. */
export function steelPlateTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 901);
  paint(ctx, S, S, (x, y, i) => {
    // Raised lozenges in staggered rows, lit from the top left.
    const row = Math.floor(y / 32);
    const lx = (x + (row % 2) * 16) % 32;
    const ly = y % 32;
    const d = Math.abs(lx - 16) + Math.abs(ly - 16);
    const base = mix([44, 46, 52], [92, 96, 104], n[i]);
    if (d < 11) return shade(base, lx + ly < 32 ? 1.35 : 0.8);
    return shade(base, 0.9 + n[i] * 0.2);
  });
  cracks(ctx, S, 6, 'rgba(10,8,6,0.5)', 2, 902);
  return finish(c);
}

/** The ground round the factory: concrete, oil stains, scraps of orange paint. */
export function factoryGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 911);
  paint(ctx, S, S, (_x, _y, i) => mix([40, 40, 44], [86, 84, 86], n[i]));
  const rand = seededRandom(912);
  for (let k = 0; k < 40; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 6 + rand() * 20;
    ctx.fillStyle = rand() < 0.75 ? 'rgba(12,10,14,0.55)' : 'rgba(230,120,20,0.35)';
    wrapStroke(ctx, S, () => {
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.4 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  cracks(ctx, S, 16, 'rgba(14,14,16,0.6)', 1.5, 913);
  return finish(c);
}

/** A factory wall: riveted steel plates, rust bleeding down from the seams, a warning stripe along the foot. */
export function steelWallTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 921);
  const rust = fbm(S, 2, 3, 922);
  paint(ctx, S, S, (x, y, i) => {
    const seam = x % 128 < 4 || y % 64 < 4;
    const base = mix([58, 62, 70], [110, 114, 120], n[i]);
    const streak = Math.max(0, rust[i] - 0.55) * 2.5 * ((y % 64) / 64);
    const plate = mix(base, [140, 70, 30], Math.min(0.8, streak));
    if (seam) return shade(plate, 0.55);
    if (y > S - 20) return ((x + y) % 40 < 20 ? [230, 170, 20] : [20, 18, 18]) as RGB;
    return plate;
  });
  ctx.fillStyle = 'rgba(24,26,30,0.95)';
  for (let x = 12; x < S; x += 24) for (let y = 12; y < S - 24; y += 64) {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/** Gamma Knife's theatre floor: white tiles with green seams, a sterile glow in the grout. */
export function chromeTileTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 3, 931);
  paint(ctx, S, S, (x, y, i) => {
    const seam = x % 64 < 3 || y % 64 < 3;
    if (seam) return mix([40, 220, 120], [120, 255, 180], n[i]);
    const tile = Math.floor(x / 64) + Math.floor(y / 64) * 4;
    return shade(mix([200, 214, 222], [240, 248, 252], n[i]), 0.9 + ((tile * 29) % 7) * 0.02);
  });
  return finish(c);
}

/** The ground round the gamma knife: dark, a green grid under glass, pinpoints of light. */
export function gammaGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 4, 941);
  paint(ctx, S, S, (x, y, i) => {
    const grid = x % 64 < 2 || y % 64 < 2;
    if (grid) return mix([20, 90, 60], [60, 200, 120], n[i]);
    return mix([8, 14, 18], [22, 34, 40], n[i]);
  });
  const rand = seededRandom(942);
  for (let k = 0; k < 120; k++) {
    ctx.fillStyle = rand() < 0.6 ? 'rgba(120,255,180,0.6)' : 'rgba(200,160,255,0.5)';
    ctx.fillRect(rand() * S, rand() * S, 2, 2);
  }
  return finish(c);
}

/** People-Vultures' dry lake: cracked earth, bleached, a bone poking through here and there. */
export function scorchedTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 951);
  paint(ctx, S, S, (_x, _y, i) => mix([150, 120, 86], [206, 180, 140], n[i]));
  cracks(ctx, S, 22, 'rgba(60,40,24,0.7)', 2.5, 952);
  cracks(ctx, S, 18, 'rgba(90,64,40,0.5)', 1.2, 953);
  const rand = seededRandom(954);
  for (let k = 0; k < 10; k++) {
    ctx.fillStyle = 'rgba(240,232,210,0.85)';
    wrapStroke(ctx, S, () => {
      ctx.beginPath();
      ctx.ellipse(rand() * S, rand() * S, 5 + rand() * 8, 2, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  return finish(c);
}

/** The ground round the carcass: ochre dust and dead grass, dark where something was dragged. */
export function boneyardGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 961);
  const drag = fbm(S, 2, 3, 962);
  paint(ctx, S, S, (_x, _y, i) => mix(mix([120, 84, 50], [176, 140, 92], n[i]), [70, 40, 30], Math.max(0, drag[i] - 0.6) * 1.8));
  const rand = seededRandom(963);
  for (let k = 0; k < 400; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(200,170,100,0.6)' : 'rgba(90,60,30,0.5)';
    ctx.fillRect(rand() * S, rand() * S, 1.5, 4 + rand() * 6);
  }
  return finish(c);
}

/** Wah Wah's road: a fretboard, dark rosewood with frets across it and dot inlays down the middle. */
export function fretboardTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 4, 971);
  paint(ctx, S, S, (_x, y, i) => {
    const grain = Math.sin((y / S) * Math.PI * 2 * 3 + n[i] * 4) * 0.5 + 0.5;
    if (y % 128 < 6) return mix([180, 180, 190], [240, 240, 248], (y % 128) / 6);
    return mix([54, 30, 22], [96, 58, 38], grain * 0.6 + n[i] * 0.4);
  });
  ctx.fillStyle = 'rgba(240,236,220,0.95)';
  for (const y of [64, 192]) {
    ctx.beginPath();
    ctx.arc(S / 2, y, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/** The ground round the pedalboard: a swirl of purple, teal and gold, a filter sweep drawn out. */
export function wahGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 5, 981);
  const stops: RGB[] = [[60, 20, 90], [20, 110, 120], [200, 150, 40], [120, 30, 110]];
  paint(ctx, S, S, (x, y, i) => {
    const a = Math.atan2(y - S / 2, x - S / 2);
    const r = Math.hypot(x - S / 2, y - S / 2) / S;
    const band = (((a / Math.PI) * 2 + r * 6 + n[i] * 2) % 4 + 4) % 4;
    const k = Math.floor(band);
    return mix(mix(stops[k], stops[(k + 1) % 4], band - k), [20, 10, 30], 0.35);
  });
  return finish(c);
}

/** Planet B's road: cracked asphalt gone grey with soot, tar bleeding up through the cracks, a faded line. */
export function tarTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 1001);
  paint(ctx, S, S, (_x, _y, i) => mix([34, 32, 32], [78, 74, 72], n[i]));
  cracks(ctx, S, 20, 'rgba(8,6,6,0.6)', 1.8, 1002);
  const rand = seededRandom(1003);
  for (let k = 0; k < 10; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 4 + rand() * 10;
    ctx.fillStyle = 'rgba(6,4,4,0.4)';
    wrapStroke(ctx, S, () => {
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.5 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // Ash settling on it.
  for (let k = 0; k < 500; k++) {
    ctx.fillStyle = `rgba(170,160,150,${0.15 + rand() * 0.2})`;
    ctx.fillRect(rand() * S, rand() * S, 1.5, 1.5);
  }
  return finish(c);
}

/** The ground round Planet B: ash and slag, dead grass, black puddles of crude, rubbish. */
export function smogGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 1011);
  const dead = fbm(S, 2, 3, 1012);
  paint(ctx, S, S, (_x, _y, i) => mix(mix([52, 48, 44], [104, 96, 86], n[i]), [96, 84, 50], Math.max(0, dead[i] - 0.55) * 2));
  const rand = seededRandom(1013);
  for (let k = 0; k < 30; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 8 + rand() * 24;
    ctx.fillStyle = rand() < 0.7 ? 'rgba(8,6,8,0.75)' : 'rgba(200,90,30,0.35)';
    wrapStroke(ctx, S, () => {
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.4 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  for (let k = 0; k < 260; k++) {
    ctx.fillStyle = ['rgba(200,190,170,0.5)', 'rgba(60,90,140,0.5)', 'rgba(180,60,40,0.5)'][k % 3];
    ctx.fillRect(rand() * S, rand() * S, 2 + rand() * 4, 1.5 + rand() * 3);
  }
  cracks(ctx, S, 14, 'rgba(20,16,14,0.6)', 1.5, 1014);
  return finish(c);
}

/** A tenement wall on Planet B: soot-black brick, boarded windows, a streak of rust under each. */
export function tenementTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 1021);
  paint(ctx, S, S, (x, y, i) => {
    const row = Math.floor(y / 8);
    const mortar = y % 8 < 1 || (x + (row % 2) * 8) % 16 < 1;
    const base = mix([60, 34, 28], [110, 64, 48], n[i]);
    const soot = Math.min(1, 1.2 - y / S + n[i] * 0.4);
    return shade(mortar ? [40, 36, 34] : base, 0.5 + 0.5 * (1 - soot * 0.6));
  });
  for (let wx = 16; wx < S; wx += 64) {
    for (let wy = 20; wy < S; wy += 64) {
      ctx.fillStyle = '#141010';
      ctx.fillRect(wx, wy, 32, 28);
      ctx.fillStyle = 'rgba(120,90,50,0.9)';
      for (let k = 0; k < 3; k++) ctx.fillRect(wx - 2, wy + 4 + k * 9, 36, 5);
      ctx.fillStyle = 'rgba(120,60,30,0.35)';
      ctx.fillRect(wx + 4, wy + 28, 24, 30);
    }
  }
  return finish(c);
}

/** Mars for the Rich's boulevard: white marble veined grey, gold inlay in a diamond lattice. */
export function gildedTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 5, 1031);
  const vein = fbm(S, 2, 4, 1032);
  paint(ctx, S, S, (x, y, i) => {
    const d = Math.min(Math.abs(((x + y) % 128) - 64), Math.abs(((x - y + 512) % 128) - 64));
    if (d < 2.5) return mix([200, 150, 50], [255, 220, 120], n[i]);
    const v = Math.abs(vein[i] - 0.5) < 0.02 ? 0.75 : 1;
    return shade(mix([214, 210, 204], [246, 244, 240], n[i]), v);
  });
  return finish(c);
}

/** The red dust round the colony: fine rust, rover tracks and the odd footprint where the poor walked. */
export function domeGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 1041);
  paint(ctx, S, S, (_x, _y, i) => mix([140, 56, 30], [204, 104, 62], n[i]));
  const rand = seededRandom(1042);
  ctx.strokeStyle = 'rgba(90,34,18,0.45)';
  for (let k = 0; k < 6; k++) {
    const y0 = rand() * S;
    const tilt = (rand() - 0.5) * 0.6;
    for (const off of [0, 14]) {
      ctx.lineWidth = 4;
      wrapStroke(ctx, S, () => {
        ctx.beginPath();
        ctx.moveTo(0, y0 + off);
        ctx.lineTo(S, y0 + off + tilt * S);
        ctx.stroke();
      });
    }
  }
  for (let k = 0; k < 160; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(80,28,14,0.5)' : 'rgba(240,160,110,0.35)';
    ctx.beginPath();
    ctx.arc(rand() * S, rand() * S, 1 + rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/** The colony's glass: tall panes in gold frames, a sheen across them, the rich's towers faint behind. */
export function domeGlassTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 2, 3, 1051);
  paint(ctx, S, S, (x, y, i) => {
    if (x % 64 < 4 || y % 128 < 4) return mix([170, 120, 40], [240, 200, 100], n[i]);
    const sheen = Math.max(0, 1 - Math.abs(((x - y * 0.5 + 512) % 128) - 40) / 18);
    return mix(mix([120, 170, 190], [180, 220, 236], n[i]), [250, 252, 255], sheen * 0.6);
  });
  ctx.fillStyle = 'rgba(90,110,130,0.35)';
  const rand = seededRandom(1052);
  for (let k = 0; k < 8; k++) {
    const w = 10 + rand() * 18;
    const h = 40 + rand() * 120;
    ctx.fillRect(rand() * S, S - h, w, h);
  }
  return finish(c);
}

/** Perihelion's road: the ship's heat shield, black ceramic tiles glowing orange at the seams. */
export function heatShieldTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 1061);
  paint(ctx, S, S, (x, y, i) => {
    const row = Math.floor(y / 32);
    const lx = (x + (row % 2) * 16) % 32;
    const seam = lx < 2 || y % 32 < 2;
    if (seam) return mix([255, 110, 20], [255, 210, 90], n[i]);
    const tile = Math.floor((x + (row % 2) * 16) / 32) + row * 8;
    return shade(mix([22, 20, 22], [60, 54, 52], n[i]), 0.85 + ((tile * 37) % 9) * 0.04);
  });
  // Scorch where the heat has got through.
  const rand = seededRandom(1062);
  for (let k = 0; k < 10; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
    g.addColorStop(0, 'rgba(255,120,40,0.35)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 14, y - 14, 28, 28);
  }
  return finish(c);
}

/** The sun's surface far below the ship: granulation, cells of yellow fire edged in orange. */
export function solarGroundTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 4, 1071);
  const rand = seededRandom(1072);
  const cells: [number, number][] = Array.from({ length: 40 }, () => [rand() * S, rand() * S]);
  paint(ctx, S, S, (x, y, i) => {
    let d1 = Infinity;
    let d2 = Infinity;
    for (const [cx, cy] of cells) {
      const dx = Math.min(Math.abs(x - cx), S - Math.abs(x - cx));
      const dy = Math.min(Math.abs(y - cy), S - Math.abs(y - cy));
      const d = dx * dx + dy * dy;
      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) d2 = d;
    }
    const edge = Math.min(1, (Math.sqrt(d2) - Math.sqrt(d1)) / 10);
    return mix([200, 60, 10], mix([255, 170, 40], [255, 236, 150], n[i]), edge);
  });
  return finish(c);
}

/** Hell's road: black brimstone, lava glowing in the cracks, sulphur crusted on it. */
export function brimstoneTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 1081);
  paint(ctx, S, S, (_x, _y, i) => mix([20, 14, 14], [64, 44, 40], n[i]));
  cracks(ctx, S, 16, 'rgba(255,90,20,0.95)', 2.5, 1082);
  cracks(ctx, S, 16, 'rgba(255,200,80,0.6)', 1, 1082);
  const rand = seededRandom(1083);
  for (let k = 0; k < 120; k++) {
    ctx.fillStyle = 'rgba(220,200,60,0.4)';
    ctx.fillRect(rand() * S, rand() * S, 2, 2);
  }
  return finish(c);
}

/** The ground of Hell: ash, embers, rivers of lava, and bones in it. */
export function infernoGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 1091);
  const flow = fbm(S, 2, 4, 1092);
  paint(ctx, S, S, (_x, _y, i) => {
    const river = Math.max(0, 1 - Math.abs(flow[i] - 0.5) / 0.025);
    return mix(mix([30, 12, 10], [80, 30, 20], n[i]), [255, 120, 20], river);
  });
  const rand = seededRandom(1093);
  for (let k = 0; k < 300; k++) {
    ctx.fillStyle = rand() < 0.6 ? 'rgba(255,120,40,0.6)' : 'rgba(230,220,200,0.5)';
    ctx.fillRect(rand() * S, rand() * S, 1.5 + rand() * 2, 1.5);
  }
  return finish(c);
}

/** The walls of Hell: black rock seamed with fire, skulls set in it. */
export function hellWallTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 1101);
  paint(ctx, S, S, (_x, y, i) => mix(mix([18, 10, 10], [66, 30, 24], n[i]), [180, 50, 10], Math.max(0, (y - S * 0.8) / (S * 0.2)) * 0.6));
  cracks(ctx, S, 10, 'rgba(255,100,20,0.9)', 2, 1102);
  const rand = seededRandom(1103);
  for (let k = 0; k < 5; k++) {
    const x = 20 + rand() * (S - 40);
    const y = 20 + rand() * (S - 60);
    ctx.fillStyle = 'rgba(200,190,170,0.85)';
    ctx.beginPath();
    ctx.ellipse(x, y, 10, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 6, y + 8, 12, 8);
    ctx.fillStyle = 'rgba(20,6,6,0.95)';
    for (const sx of [-4, 4]) {
      ctx.beginPath();
      ctx.arc(x + sx, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish(c);
}

/** Planet B's Earth, wrapped round a globe: grey dead seas, scorched brown continents, fires burning across them. */
export function burntEarthTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S * 2, S);
  const land = fbm(S * 2, 4, 5, 1111);
  const n = fbm(S * 2, 8, 3, 1112);
  paint(ctx, S * 2, S, (x, y) => {
    const i = y * S * 2 + x;
    const v = land[i];
    if (v < 0.5) return mix([40, 52, 62], [80, 90, 96], n[i]);
    if (v > 0.62 && n[i] > 0.6) return mix([255, 110, 20], [255, 220, 90], n[i] - 0.6);
    return mix([70, 46, 28], [130, 96, 56], n[i]);
  });
  const rand = seededRandom(1113);
  for (let k = 0; k < 60; k++) {
    const x = rand() * S * 2;
    const y = S * 0.15 + rand() * S * 0.7;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 6 + rand() * 10);
    g.addColorStop(0, 'rgba(255,200,80,0.95)');
    g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 16, y - 16, 32, 32);
  }
  return finish(c);
}

/** A rat's fur: dark grey-brown, streaked. */
export function furTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 3, 1121);
  paint(ctx, S, S, (x, _y, i) => shade(mix([46, 38, 34], [96, 82, 70], n[i]), 0.8 + 0.2 * Math.abs(Math.sin(x * 0.9 + n[i] * 9))));
  return finish(c);
}

/**
 * Folds of brain, tileable: the ridges of a field of noise drawn as gyri,
 * the furrows between them dark. `n` is noise in 0..1; returns 0 in a
 * furrow and 1 on a ridge.
 */
function gyri(n: number): number {
  const w = Math.abs(Math.sin(n * Math.PI * 9));
  return Math.min(1, w * 1.6);
}

/** I'm in Your Mind's road: violet folds of brain, the furrows deep plum, nerves glowing pink and cyan through them. */
export function neuralTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 1201);
  const fine = fbm(S, 8, 3, 1202);
  paint(ctx, S, S, (_x, _y, i) => {
    const g = gyri(n[i]);
    // Violet, a shade apart from the pink ground, so the road reads.
    return shade(mix([56, 16, 84], [176, 96, 200], g), 0.85 + fine[i] * 0.25);
  });
  // Nerves: thin glowing threads wandering over the folds, a spark where they meet.
  const rand = seededRandom(1203);
  for (let k = 0; k < 14; k++) {
    const pts: [number, number][] = [];
    let x = rand() * S;
    let y = rand() * S;
    let a = rand() * Math.PI * 2;
    for (let j = 0; j < 12; j++) {
      pts.push([x, y]);
      a += (rand() - 0.5) * 0.9;
      x += Math.cos(a) * 10;
      y += Math.sin(a) * 10;
    }
    const colour = k % 3 ? 'rgba(255,140,220,0.75)' : 'rgba(110,240,255,0.8)';
    wrapStroke(ctx, S, () => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      pts.forEach(([px, py], j) => (j ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(pts[11][0], pts[11][1], 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  return finish(c);
}

/** The ground inside the mind: a sea of brain folds, rose and plum, with violet light pooling in the furrows. */
export function mindGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 1211);
  const tint = fbm(S, 2, 3, 1212);
  paint(ctx, S, S, (_x, _y, i) => {
    const g = gyri(n[i]);
    const furrow = mix([60, 16, 70], [120, 40, 150], tint[i]);
    return mix(furrow, mix([200, 100, 140], [250, 170, 190], tint[i]), g);
  });
  return finish(c);
}

/** The Cortex Folds' walls: brain, tall and wet-looking, with nerves running up it. */
export function brainWallTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 4, 1221);
  paint(ctx, S, S, (x, y, i) => {
    const g = gyri(n[i] + y / S * 0.15);
    const sheen = Math.max(0, Math.sin((x + y) * 0.05 + n[i] * 6)) * 0.25;
    return mix(mix([90, 26, 60], [222, 128, 156], g), [255, 230, 240], sheen * g);
  });
  ctx.strokeStyle = 'rgba(150,230,255,0.6)';
  ctx.lineWidth = 1.5;
  const rand = seededRandom(1222);
  for (let k = 0; k < 6; k++) {
    let x = rand() * S;
    ctx.beginPath();
    ctx.moveTo(x, S);
    for (let y = S; y > 0; y -= 12) {
      x += (rand() - 0.5) * 12;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(c);
}

/** I'm Not in Your Mind's road: black and white checks, warped as if seen through a fever. */
export function opartTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 2, 2, 1231);
  paint(ctx, S, S, (x, y, i) => {
    // The warp is tileable: whole periods of sine across the tile, plus tileable noise.
    const wx = x + Math.sin((y / S) * Math.PI * 2) * 10 + (n[i] - 0.5) * 18;
    const wy = y + Math.sin((x / S) * Math.PI * 4) * 8;
    const check = (Math.floor(wx / 32) + Math.floor(wy / 32)) % 2 === 0;
    return check ? [236, 234, 228] : [16, 14, 18];
  });
  return finish(c);
}

/** The ground round I'm Not in Your Mind: grey rings rippling out across white, a spiral that won't keep still, softer than the road's black and white checks so the road stands out on it. */
export function notMindGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 3, 1241);
  paint(ctx, S, S, (x, y, i) => {
    // Distance to the nearest of four tiled centres, so the rings wrap.
    const dx = Math.min(x % 256, 256 - (x % 256));
    const dy = Math.min(y % 256, 256 - (y % 256));
    const d = Math.hypot(dx - 128, dy - 128);
    const ring = Math.sin(d * 0.098 + n[i] * 3) > 0.6;
    return ring ? mix([150, 148, 156], [176, 172, 180], n[i]) : mix([226, 224, 220], [250, 248, 244], n[i]);
  });
  return finish(c);
}

/** The Hall of Mirrors' walls: zigzags of black and white that seem to move as you pass. */
export function opartWallTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (x, y) => {
    const zig = Math.abs(((x / 16) % 2) - 1) * 16;
    return Math.floor((y + zig) / 16) % 2 === 0 ? [240, 238, 232] : [12, 10, 16];
  });
  return finish(c);
}

/** The colours cellophane comes in. */
export const CELLOPHANE_COLOURS = ['#ff3a6a', '#ffd020', '#30e080', '#30a0ff', '#b060ff'];

/** Cellophane's road: overlapping sheets of coloured cellophane over a dark tray, jewel-toned against the pale ground, crinkled, light catching in the creases. */
export function filmTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 4, 1251);
  paint(ctx, S, S, (_x, _y, i) => mix([16, 14, 36], [40, 34, 74], n[i]));
  const rand = seededRandom(1252);
  for (let k = 0; k < 14; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const w = 50 + rand() * 90;
    const h = 40 + rand() * 80;
    const a = rand() * Math.PI;
    ctx.fillStyle = CELLOPHANE_COLOURS[k % CELLOPHANE_COLOURS.length];
    ctx.globalAlpha = 0.4;
    wrapStroke(ctx, S, () => {
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillRect(-w / 2, -h / 2, w, h);
    });
  }
  ctx.globalAlpha = 1;
  // Creases: thin bright lines where the light catches.
  cracks(ctx, S, 26, 'rgba(255,255,255,0.7)', 1, 1253);
  return finish(c);
}

/** The ground round Cellophane: pale and glossy, pools of coloured light thrown through the sheets. */
export function cellophaneGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 1261);
  paint(ctx, S, S, (_x, _y, i) => mix([170, 180, 200], [230, 236, 248], n[i]));
  const rand = seededRandom(1262);
  ctx.globalCompositeOperation = 'multiply';
  for (let k = 0; k < 30; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 30 + rand() * 70;
    ctx.fillStyle = CELLOPHANE_COLOURS[k % CELLOPHANE_COLOURS.length];
    ctx.globalAlpha = 0.35;
    wrapStroke(ctx, S, () => {
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.4 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return finish(c);
}

/** Stained Glass Alley's walls: panes of coloured cellophane in black frames, lit from behind. */
export function paneTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 3, 1271);
  const rand = seededRandom(1272);
  const cells: RGB[] = Array.from({ length: 16 }, () => {
    const hex = CELLOPHANE_COLOURS[Math.floor(rand() * CELLOPHANE_COLOURS.length)];
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  });
  paint(ctx, S, S, (x, y, i) => {
    if (x % 64 < 4 || y % 64 < 4) return [16, 14, 20];
    const cell = cells[Math.floor(y / 64) * 4 + Math.floor(x / 64)];
    return mix(shade(cell, 0.7), cell, n[i]);
  });
  return finish(c);
}

/** I'm in Your Mind Fuzz's road: a carpet of fuzz, deep purple, flecked with green and magenta static. */
export function fuzzRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 1281);
  const rand = seededRandom(1282);
  paint(ctx, S, S, (_x, _y, i) => {
    const r = rand();
    const fleck: RGB = r > 0.97 ? [120, 255, 120] : r > 0.94 ? [255, 90, 220] : [0, 0, 0];
    const base = mix([40, 16, 60], [96, 46, 120], n[i]);
    return r > 0.94 ? mix(base, fleck, 0.7) : shade(base, 0.8 + rand() * 0.4);
  });
  return finish(c);
}

/** The ground round I'm in Your Mind Fuzz: TV static in purple and green, fuzz growing up through it. */
export function fuzzGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 5, 1291);
  const rand = seededRandom(1292);
  paint(ctx, S, S, (_x, _y, i) => {
    const s = rand();
    const base = mix([30, 60, 30], [90, 40, 120], n[i]);
    return mix(base, [s * 200, s * 255, s * 200], 0.25);
  });
  return finish(c);
}

/** Amp Alley's walls: amp stacks, black tolex round grille cloth, a gold logo plate on every cab. */
export function ampTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 3, 1301);
  paint(ctx, S, S, (x, y, i) => {
    const lx = x % 128;
    const ly = y % 128;
    if (lx < 10 || lx > 118 || ly < 10 || ly > 118) return shade([30, 28, 32], 0.8 + n[i] * 0.4);
    const weave = (x + y) % 4 < 2 ? 1 : 0.85;
    return shade(mix([70, 60, 50], [110, 96, 80], n[i]), weave);
  });
  ctx.fillStyle = '#e0b040';
  for (const [x, y] of [[44, 16], [172, 16], [44, 144], [172, 144]]) ctx.fillRect(x, y, 40, 8);
  return finish(c);
}

/** The album's swirl: bands of purple, orange, green and pink turning in on a point, for the sky over the fuzz. */
export function swirlTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const bands: RGB[] = [[120, 40, 160], [255, 140, 40], [80, 220, 120], [255, 80, 180], [40, 20, 80]];
  paint(ctx, S, S, (x, y) => {
    const dx = x - S / 2;
    const dy = y - S / 2;
    const r = Math.hypot(dx, dy) / (S / 2);
    const a = Math.atan2(dy, dx);
    const t = ((a / (Math.PI * 2) + r * 3) % 1 + 1) % 1;
    const k = Math.floor(t * bands.length);
    return mix(bands[k], bands[(k + 1) % bands.length], (t * bands.length) % 1);
  });
  return finish(c, false);
}

/**
 * An eye's iris, for a cap of the ball round its pupil: the top row is the
 * middle of the eye and the bottom row the rim, so the rings go across:
 * the pupil, then gold, violet and green, streaked, and a dark ring round it.
 */
export function irisTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  const n = fbm(W, 8, 3, 1311);
  paint(ctx, W, H, (x, y, i) => {
    const d = y / H;
    if (d < 0.3) return [8, 4, 12];
    if (d > 0.92) return [24, 12, 34];
    const streak = 0.72 + 0.28 * Math.sin((x / W) * Math.PI * 2 * 24 + n[i] * 8);
    const ring: RGB = d < 0.48 ? [240, 190, 60] : d < 0.72 ? [150, 70, 220] : [60, 200, 140];
    return shade(ring, streak);
  });
  return finish(c, false);
}

/** A black and white spiral, for the op-art discs that turn round I'm Not in Your Mind. */
export function opSpiralTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (x, y) => {
    const dx = x - S / 2;
    const dy = y - S / 2;
    const r = Math.hypot(dx, dy) / (S / 2);
    if (r > 1) return [16, 14, 18];
    const a = Math.atan2(dy, dx);
    return Math.sin(a * 3 + r * 22) > 0 ? [240, 238, 232] : [16, 14, 18];
  });
  return finish(c, false);
}

/** The face of a VU meter: cream card, a scale arcing over it, green into gold into red, and FUZZ across the bottom. */
export function meterTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 320;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#f0e6c8';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H * 0.95;
  const R = H * 0.78;
  // Needle travel: from -50 to +50 degrees off straight up; level 0..1 along it.
  const angle = (u: number) => -Math.PI / 2 + (-50 + 100 * u) * (Math.PI / 180);
  const band = (u0: number, u1: number, colour: string) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.arc(cx, cy, R, angle(u0), angle(u1));
    ctx.stroke();
  };
  band(0, 0.55, '#40b050');
  band(0.55, 0.8, '#e8b020');
  band(0.8, 1, '#e02a20');
  ctx.strokeStyle = '#1a1414';
  ctx.lineWidth = 4;
  for (let k = 0; k <= 10; k++) {
    const a = angle(k / 10);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (R - 24), cy + Math.sin(a) * (R - 24));
    ctx.lineTo(cx + Math.cos(a) * (R - 46), cy + Math.sin(a) * (R - 46));
    ctx.stroke();
  }
  ctx.fillStyle = '#1a1414';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FUZZ', cx, H * 0.62);
  return finish(c, false);
}

// The 12 Bar Bruise Cup's worlds.

/** Elbow's road: the band room's carpet, red and gold swirls, worn to the backing where the crowd stands, beer-dark stains. */
export function carpetTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 1501);
  const wear = fbm(S, 2, 3, 1502);
  paint(ctx, S, S, (x, y, i) => {
    // A swirl repeat: paisley-ish curls of gold on oxblood, a green line round each.
    const u = (x / S) * Math.PI * 8;
    const v = (y / S) * Math.PI * 8;
    const curl = Math.sin(u + Math.sin(v) * 1.6) * Math.cos(v + Math.sin(u * 0.5) * 1.3);
    let col: RGB = curl > 0.55 ? [214, 160, 60] : curl > 0.42 ? [40, 90, 60] : [112, 22, 30];
    col = shade(col, 0.8 + n[i] * 0.35);
    // Worn through to the jute backing; stained dark in patches.
    if (wear[i] > 0.7) col = mix(col, [120, 100, 76], Math.min(1, (wear[i] - 0.7) * 5));
    if (wear[i] < 0.22) col = shade(col, 0.6);
    return col;
  });
  return finish(c);
}

/** The street outside the band room at night: bitumen, wet, the neon pooling in it in pink and blue. */
export function pubStreetTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 5, 1511);
  const puddle = fbm(S, 3, 3, 1512);
  paint(ctx, S, S, (_x, _y, i) => {
    const base = mix([26, 24, 30], [52, 48, 56], n[i]);
    if (puddle[i] > 0.66) return mix(base, puddle[i] > 0.74 ? [255, 80, 160] : [60, 140, 255], 0.35);
    return base;
  });
  return finish(c);
}

/** Backstab Alley's walls: brick behind the band room, layered with torn gig posters. */
export function posterWallTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 3, 1521);
  paint(ctx, S, S, (x, y, i) => {
    const row = Math.floor(y / 16);
    const bx = (x + (row % 2) * 16) % 32;
    const mortar = y % 16 < 2 || bx < 2;
    return mortar ? [70, 66, 60] : shade(mix([110, 40, 30], [150, 64, 44], n[i]), 0.85 + (row % 3) * 0.05);
  });
  const rand = seededRandom(1522);
  const inks = ['#ffe14d', '#ff4a8a', '#4ad0ff', '#f4f0e8', '#80ff60'];
  for (let k = 0; k < 9; k++) {
    const w = 40 + rand() * 50;
    const h = w * 1.4;
    const x = rand() * (S - w);
    const y = rand() * (S - h);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((rand() - 0.5) * 0.2);
    ctx.fillStyle = inks[k % inks.length];
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-w / 2 + 4, -h / 2 + 6, w - 8, h * 0.18);
    ctx.fillRect(-w / 2 + 4, h / 2 - h * 0.22, w * 0.6, h * 0.08);
    // Torn off at a corner.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w / 2 - w * 0.4, h / 2);
    ctx.lineTo(w / 2, h / 2 - h * 0.3);
    ctx.fill();
    ctx.restore();
  }
  return finish(c);
}

/** Muckraker's road: wet muck raked into ridges along the road, puddles in the ruts. */
export function muckTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 1531);
  const wet = fbm(S, 3, 3, 1532);
  paint(ctx, S, S, (x, _y, i) => {
    // Rake ridges run along the road (the texture's v), so they stripe across x.
    const ridge = 0.5 + 0.5 * Math.sin((x / S) * Math.PI * 2 * 12 + n[i] * 2);
    const mud = shade(mix([58, 40, 24], [104, 76, 46], n[i]), 0.75 + ridge * 0.35);
    if (wet[i] > 0.68 && ridge < 0.4) return mix(mud, [120, 130, 136], 0.55);
    return mud;
  });
  return finish(c);
}

/** The ground round Muckraker: Anglesea's wetlands in the rain, reeds, mud and standing water. */
export function wetlandTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 5, 5, 1541);
  const water = fbm(S, 3, 3, 1542);
  const rand = seededRandom(1543);
  paint(ctx, S, S, (_x, _y, i) => {
    if (water[i] > 0.64) return mix([60, 78, 84], [104, 122, 128], (water[i] - 0.64) * 3);
    if (water[i] > 0.56) return mix([58, 46, 30], [84, 66, 42], n[i]);
    const reed = rand() > 0.9 ? 1.25 : 1;
    return shade(mix([62, 80, 40], [112, 120, 62], n[i]), reed);
  });
  return finish(c);
}

/** The Muck Pit's walls: banks of mud, roots and stones through them, wet streaks down them. */
export function mudBankTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 5, 4, 1551);
  paint(ctx, S, S, (x, y, i) => {
    const streak = 0.5 + 0.5 * Math.sin((x / S) * Math.PI * 2 * 9 + n[i] * 3);
    const layer = Math.floor((y / S) * 6 + n[i] * 1.5) % 2;
    return shade(mix([66, 46, 28], [98, 72, 44], n[i]), (layer ? 0.85 : 1) * (0.85 + streak * 0.2));
  });
  cracks(ctx, S, 14, 'rgba(40,26,14,0.7)', 2, 1552);
  return finish(c);
}

/** Cut Throat Boogie's road: a dance floor of squares lit from under in party colours, chrome between them. */
export function danceFloorTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const tiles = ['#ff3a8a', '#ffd040', '#40e0ff', '#a040ff', '#ff7a20', '#40ff90'];
  const rand = seededRandom(1561);
  const T = S / 4;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const g = ctx.createRadialGradient(x * T + T / 2, y * T + T / 2, 2, x * T + T / 2, y * T + T / 2, T * 0.7);
      const col = tiles[Math.floor(rand() * tiles.length)];
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, col);
      g.addColorStop(1, '#1a1020');
      ctx.fillStyle = g;
      ctx.fillRect(x * T, y * T, T, T);
    }
  }
  ctx.strokeStyle = '#c8c8d0';
  ctx.lineWidth = 3;
  for (let k = 0; k <= 4; k++) {
    ctx.beginPath();
    ctx.moveTo(k * T, 0);
    ctx.lineTo(k * T, S);
    ctx.moveTo(0, k * T);
    ctx.lineTo(S, k * T);
    ctx.stroke();
  }
  return finish(c);
}

/** The backyard round the party, at night: lawn gone dark, pools of coloured light from the fairy lights. */
export function partyLawnTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 5, 1571);
  const pools = fbm(S, 3, 3, 1572);
  paint(ctx, S, S, (_x, _y, i) => {
    const grass = mix([18, 34, 22], [40, 64, 36], n[i]);
    if (pools[i] > 0.7) return mix(grass, pools[i] > 0.78 ? [255, 120, 200] : [255, 210, 90], 0.3);
    return grass;
  });
  return finish(c);
}

/** Inches' walls: seventies speaker cabinets, walnut veneer round orange grille cloth. */
export function speakerWallTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 3, 1581);
  paint(ctx, S, S, (x, y, i) => {
    const lx = x % 128;
    const ly = y % 128;
    if (lx < 12 || lx > 116 || ly < 12 || ly > 116) {
      const grain = 0.5 + 0.5 * Math.sin((y / S) * 80 + n[i] * 6);
      return mix([70, 40, 20], [120, 74, 40], grain);
    }
    const weave = (x + y) % 4 < 2 ? 1 : 0.85;
    return shade(mix([200, 100, 30], [236, 140, 50], n[i]), weave);
  });
  return finish(c);
}

/** Sea of Trees' road: moss grown over old lava rock, roots snaking across it. */
export function mossRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 5, 5, 1591);
  const rock = fbm(S, 3, 3, 1592);
  paint(ctx, S, S, (_x, _y, i) => {
    if (rock[i] > 0.66) return mix([40, 38, 36], [70, 66, 60], n[i]);
    return mix([46, 84, 34], [96, 136, 56], n[i]);
  });
  cracks(ctx, S, 10, 'rgba(70,46,26,0.85)', 4, 1593);
  return finish(c);
}

/** The forest floor under the sea of trees: moss and leaf litter on black lava, ferns. */
export function forestFloorTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 5, 1601);
  const lava = fbm(S, 3, 3, 1602);
  paint(ctx, S, S, (_x, _y, i) => {
    if (lava[i] > 0.7) return mix([26, 24, 24], [54, 50, 46], n[i]);
    if (lava[i] < 0.3) return mix([70, 54, 30], [110, 86, 48], n[i]);
    return mix([30, 64, 30], [70, 110, 46], n[i]);
  });
  return finish(c);
}

/** Underwater's walls: black lava rock, porous, moss in every hollow. */
export function lavaRockTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 4, 1611);
  const pores = fbm(S, 12, 2, 1612);
  paint(ctx, S, S, (_x, _y, i) => {
    if (pores[i] < 0.3) return mix([40, 80, 34], [76, 120, 50], n[i]);
    return shade(mix([30, 28, 28], [64, 60, 56], n[i]), pores[i] > 0.75 ? 0.6 : 1);
  });
  return finish(c);
}
