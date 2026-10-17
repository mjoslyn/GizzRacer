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
export function neonRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 191);
  paint(ctx, S, S, (_x, _y, i) => {
    const v = 18 + n[i] * 20;
    return [v, v - 2, v + 10];
  });
  const line = (x: number, color: string, dashed: boolean) => {
    ctx.fillStyle = color;
    for (let y = 0; y < S; y += dashed ? 64 : S) ctx.fillRect(x, y, 6, dashed ? 34 : S);
  };
  ctx.shadowBlur = 14;
  ctx.shadowColor = '#ff3ad8';
  line(0, '#ff7ae8', true);
  ctx.shadowColor = '#3adcff';
  line(S - 6, '#8af0ff', false);
  return finish(c);
}

/** Bands of the spectrum across the road, with a soft sheen. */
export function rainbowTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const colors = ['#ff5a7a', '#ffa64a', '#ffe45a', '#6aef7a', '#4ad0ff', '#7a7aff', '#c86aff'];
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
export function lagoonTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 5, 201);
  const warp = fbm(S, 2, 3, 202);
  paint(ctx, S, S, (x, y, i) => {
    const ripple = Math.sin(((x + warp[i] * 120) / S) * Math.PI * 2 * 14 + y * 0.01) * 0.5 + 0.5;
    const depth = n[i];
    if (depth > 0.68) return mix([214, 196, 150], [236, 222, 180], ripple * 0.3 + (depth - 0.68) * 2);
    return shade(mix([40, 170, 190], [110, 220, 210], depth / 0.68), 0.92 + ripple * 0.12);
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
export function neonGridTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#0c0818';
  ctx.fillRect(0, 0, S, S);
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#b84aff';
  ctx.strokeStyle = '#7a3ad8';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, S - 3, S - 3);
  ctx.strokeStyle = 'rgba(58,220,255,0.5)';
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
export function windowsTexture(): THREE.CanvasTexture {
  const S = 128;
  const [c, ctx] = canvas(S);
  const rand = seededRandom(221);
  ctx.fillStyle = '#141020';
  ctx.fillRect(0, 0, S, S);
  const lit = ['#ffd27a', '#7ae8ff', '#ff7ae0', '#fff4d8'];
  for (let y = 4; y < S; y += 16) {
    for (let x = 4; x < S; x += 16) {
      ctx.fillStyle = rand() < 0.55 ? lit[Math.floor(rand() * lit.length)] : '#241c34';
      ctx.fillRect(x, y, 9, 10);
    }
  }
  return finish(c);
}

/** A soft sea of cloud seen from above, for the sky track's void. */
export function cloudSeaTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 3, 6, 231);
  paint(ctx, S, S, (_x, _y, i) => {
    const v = Math.min(1, Math.max(0, (n[i] - 0.3) * 1.8));
    return mix([196, 170, 230], [255, 244, 250], v);
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
