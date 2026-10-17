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

export function sandTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 41);
  const warp = fbm(S, 2, 3, 42);
  const rand = seededRandom(43);
  paint(ctx, S, S, (x, y, i) => {
    // Wind ripples, warped so they don't look ruled.
    const ripple = Math.sin(((y + warp[i] * 90) / S) * Math.PI * 2 * 18 + x * 0.004) * 0.5 + 0.5;
    const t = n[i] * 0.75 + ripple * 0.25;
    return shade(mix([176, 98, 52], [222, 146, 84], t), 0.94 + rand() * 0.1);
  });
  return finish(c);
}

/** Horizontal sedimentary bands for canyon walls and cliffs. v runs up the wall. */
export function strataTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 51);
  const bandNoise = fbm(S, 2, 3, 52);
  const palette: RGB[] = [
    [120, 44, 30],
    [168, 72, 42],
    [196, 112, 64],
    [150, 60, 38],
    [222, 162, 108],
    [176, 84, 50],
    [104, 38, 28],
  ];
  paint(ctx, S, S, (_x, y, i) => {
    const v = (y / S + bandNoise[i] * 0.08) * palette.length * 2;
    const k = Math.floor(v);
    const a = palette[((k % palette.length) + palette.length) % palette.length];
    const b = palette[(((k + 1) % palette.length) + palette.length) % palette.length];
    const t = Math.min(1, Math.max(0, (v - k - 0.8) * 5));
    return shade(mix(a, b, t), 0.78 + n[i] * 0.4);
  });
  cracks(ctx, S, 14, 'rgba(60,20,12,0.45)', 2.5, 53);
  return finish(c);
}

/** Diamondback pattern for barriers (spec: patterned textures along the barriers). */
export function diamondTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#d9b46a');
  g.addColorStop(1, '#8a6232');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const d = H * 0.8;
  for (let k = 0; k < W / d; k++) {
    const cx = k * d + d / 2;
    const cy = H / 2;
    for (const [scale, color] of [
      [1, '#f3e6c4'],
      [0.82, '#3b2412'],
      [0.55, '#6e4422'],
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
