import * as THREE from 'three';
import { seededRandom } from '../core/math';
import type { HazardPose } from '../items/hazards';
import { WAX_DEPTH, WAX_STAGES, waxHeat } from '../kits/hotWax';
import { nearestOnSpline, pointAt } from '../tracks/spline';
import { inPit, type Ribbon, type Track } from '../tracks/track';
import type { PitDef } from '../tracks/builder';
import { glowTexture } from './textures';

/**
 * Hot Wax's world, the All Stars Cup #2's first: a house at night, the
 * karts tiny in it, and hot wax creeping in under everything, flooding it.
 * Candlelight, garish 60s garage colours (orange, mustard, plum, avocado),
 * and the slightly sinister creep of something engulfing it all. Its
 * textures (a road of set wax, cream marbled with orange, molten and
 * glowing down its edges; giant floorboards, dark and varnished, spattered
 * with wax; 60s wallpaper for the walls and the cut; a rail of dripping
 * wax), its scenery (candles burning down in their own wax, chianti
 * bottles with candles in them, drips standing up off the floor like
 * stalagmites, records, matches; round the safari, house plants and
 * plastic animals), its landmarks (the door the wax comes in under, the
 * joists under the floor, the rucked rug, the window over the sill, the
 * giant candle burning down, the lava lamp in the flame, the jungle of
 * drips, the armchair and the sitter's feet, the kitchen cupboards and the
 * sink, the spilt drink, the lord's shrine, the glass head, the maze, the
 * pot plant's leaves, the bed with something under it, the leg the wax
 * runs up, the spring reverb pedal punched for the clang, and the channel
 * of wax that sets from lap 2) and its hazard's look (tongues of wax
 * creeping across the road, molten, cooling and set).
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type Animated = ((time: number) => void)[];
type RGB = [number, number, number];

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const basic = (color: number, extra: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ color, ...extra });

/** Made once and shared: the textures go on hundreds of meshes. */
function once<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
}

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

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, fn: (x: number, y: number, i: number) => RGB, alpha?: (x: number, y: number, i: number) => number): void {
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const [r, g, b] = fn(x, y, i);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = alpha ? alpha(x, y, i) : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c: RGB, f: number): RGB => [c[0] * f, c[1] * f, c[2] * f];
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/** The palette: set wax, molten wax and its glow, candle red, and the 60s colours of the house. */
const CREAM: RGB = [240, 226, 196];
const MOLTEN: RGB = [255, 104, 26];
const CREAM_HEX = 0xf0e2c4;
const MOLTEN_HEX = 0xff6a1a;
const GLOW_HEX = 0xffa040;
const RED_HEX = 0xb0201a;
const MUSTARD_HEX = 0xe0a020;
const PLUM_HEX = 0x5a1a40;
const AVOCADO_HEX = 0x6a7a26;
const ORANGE_HEX = 0xe8601a;
const TEAL_HEX = 0x1a6a6a;
/** Hot Wax's garage stomp, near enough, for the clang on the beat. */
const BEAT = 150 / 60;
const beatPhase = (time: number) => (time * BEAT) % 1;

/**
 * The road: a slick of hot wax that has set. Cream and ivory, swirled
 * with the orange and red of the candles it ran from like the marbling in
 * a 60s candle, ridged where it flowed and dimpled where it cooled; down
 * each edge it's still molten, a band of orange glowing red at the rim
 * where it creeps on over the floor. The texture spans half the road (its
 * u from the middle at 0 to the edge at 1, its v along). It reads pale
 * against the dark boards either side.
 */
export function waxRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 9101);
  const swirl = fbm(S, 8, 3, 9102);
  const grain = fbm(S, 32, 2, 9103);
  paint(ctx, S, S, (x, y, i) => {
    // From the edge in.
    const u = 1 - x / S;
    // The molten edge: deep red at the rim to orange, then cooling into the cream.
    if (u < 0.07) return mix([200, 40, 14], MOLTEN, u / 0.07);
    const cool = Math.min(1, (u - 0.07) / 0.08);
    // Marbling: bands of orange and red swirled through the cream where the noise folds.
    const band = Math.sin((swirl[i] * 7 + (y / S) * 2 * Math.PI + n[i] * 4) * 2);
    const vein = Math.max(0, band - 0.75) * 4;
    const base = mix(CREAM, [250, 238, 214], grain[i]);
    let col = mix(base, n[i] > 0.55 ? [236, 150, 70] : [214, 96, 60], vein * 0.55);
    // Flow ridges along the road, as it ran.
    col = shade(col, 0.9 + 0.1 * Math.sin((u * 26 + swirl[i] * 6) * Math.PI));
    return mix(MOLTEN, col, cool);
  });
  const rand = seededRandom(9104);
  // Dimples where bubbles burst as it cooled.
  for (let k = 0; k < 120; k++) {
    const x = S * (0.02 + rand() * 0.8);
    const y = rand() * S;
    const r = 1.5 + rand() * 3;
    ctx.fillStyle = css([196, 172, 140], 0.45);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css([255, 250, 236], 0.6);
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Drips of the molten edge running in a little way.
  for (let y = 0; y < S; y += 10 + rand() * 18) {
    const len = 6 + rand() * 22;
    ctx.fillStyle = css(MOLTEN, 0.85);
    ctx.fillRect(S * 0.93 - len, y, len, 3 + rand() * 3);
    ctx.beginPath();
    ctx.arc(S * 0.93 - len, y + 2.5, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return mirrored(finish(c));
}

/** Mirrored about the road's middle, so both edges get the molten wax. */
function mirrored(t: THREE.CanvasTexture): THREE.CanvasTexture {
  t.wrapS = THREE.MirroredRepeatWrapping;
  return t;
}

/** The road's own glow: the molten edge and its drips, lit; the set wax dark. */
export function waxGlowTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  // A faint warmth through the set wax, where the candlelight catches it.
  ctx.fillStyle = 'rgba(70,46,26,1)';
  ctx.fillRect(0, 0, S * 0.88, S);
  const g = ctx.createLinearGradient(S, 0, S * 0.88, 0);
  g.addColorStop(0, 'rgb(255,120,40)');
  g.addColorStop(0.55, 'rgb(255,150,60)');
  g.addColorStop(1, 'rgb(70,46,26)');
  ctx.fillStyle = g;
  ctx.fillRect(S * 0.88, 0, S * 0.12, S);
  return mirrored(finish(c));
}

/**
 * The floor: giant floorboards, dark varnished jarrah worn paler down the
 * middle of each board, nail heads, the seams black, wax spattered and
 * pooled on them in cream, orange and red.
 */
export function floorboardTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 9111);
  const grain = fbm(S, 64, 2, 9112);
  const BOARDS = 4;
  paint(ctx, S, S, (x, y, i) => {
    const b = Math.floor((x / S) * BOARDS);
    const u = (x / S) * BOARDS - b;
    const tone = [0.8, 1.05, 0.9, 1.15][b];
    const streak = 0.85 + 0.3 * Math.sin((y / S) * Math.PI * 2 * (6 + b * 3) + grain[i] * 5 + n[i] * 3);
    const wear = 1 + 0.18 * Math.exp(-(((u - 0.5) / 0.25) ** 2));
    return shade(mix([70, 34, 18], [116, 62, 30], n[i]), tone * streak * wear * 0.9);
  });
  ctx.fillStyle = 'rgba(10,4,2,0.9)';
  for (let b = 0; b <= BOARDS; b++) ctx.fillRect((b * S) / BOARDS - 2, 0, 4, S);
  // Butt joints, staggered board to board, and nail heads.
  const rand = seededRandom(9113);
  for (let b = 0; b < BOARDS; b++) {
    const y = (S * (b * 0.37 + 0.2)) % S;
    ctx.fillRect((b * S) / BOARDS, y, S / BOARDS, 3);
    ctx.fillStyle = 'rgba(30,24,20,0.9)';
    for (const yy of [y - 12, y + 14]) {
      ctx.fillRect((b * S) / BOARDS + 10, yy, 4, 4);
      ctx.fillRect(((b + 1) * S) / BOARDS - 14, yy, 4, 4);
    }
    ctx.fillStyle = 'rgba(10,4,2,0.9)';
  }
  // Spattered wax.
  const colours: RGB[] = [CREAM, CREAM, [236, 120, 40], [196, 40, 30], [230, 176, 40], [120, 40, 90]];
  for (let k = 0; k < 70; k++) {
    const col = colours[Math.floor(rand() * colours.length)];
    const x = rand() * S;
    const y = rand() * S;
    const r = 2 + rand() * (rand() < 0.15 ? 18 : 6);
    ctx.fillStyle = css(col, 0.9);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    for (let j = 0; j < 4; j++) {
      ctx.beginPath();
      ctx.arc(x + (rand() - 0.5) * r * 4, y + (rand() - 0.5) * r * 4, 1 + rand() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/** The walls, and the sides of the cut under the floor: 60s wallpaper, big circles in orange, mustard and plum on cream, gone brown with smoke and wax. */
export function wallpaperTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 3, 9121);
  paint(ctx, S, S, (_x, _y, i) => shade([214, 186, 140], 0.8 + 0.3 * n[i]));
  const rings: [number, string[]][] = [
    [0, ['#e0601a', '#f0a020', '#5a1a40']],
    [1, ['#6a7a26', '#e0a020', '#b0201a']],
  ];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const cx = (col + (row % 2) * 0.5) * (S / 2) + S / 4;
      const cy = row * (S / 2) + S / 4;
      const set = rings[(row + col) % 2][1];
      for (const dx of [0, -S, S]) {
        set.forEach((fill, k) => {
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.arc(cx + dx, cy, S * (0.22 - k * 0.065), 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  }
  // Smoke and wax dribbled down it.
  const rand = seededRandom(9122);
  for (let k = 0; k < 14; k++) {
    const x = rand() * S;
    const len = 20 + rand() * 80;
    ctx.fillStyle = css(CREAM, 0.85);
    ctx.fillRect(x, 0, 3 + rand() * 4, len);
    ctx.beginPath();
    ctx.arc(x + 3, len, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(40,20,10,0.25)';
  ctx.fillRect(0, 0, S, S);
  return finish(c);
}

/** The barrier: a rail of wax along the road, red at the top, cream drips running down it, molten orange where it's still soft. */
export function waxRailTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#3a1810';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#b0201a';
  ctx.fillRect(0, 0, W, 16);
  const rand = seededRandom(9131);
  for (let x = 0; x < W; x += 6 + rand() * 10) {
    const len = 10 + rand() * 44;
    const col = rand() < 0.25 ? css(MOLTEN) : rand() < 0.5 ? '#b0201a' : css(CREAM);
    ctx.fillStyle = col;
    ctx.fillRect(x, 10, 5, len);
    ctx.beginPath();
    ctx.arc(x + 2.5, 10 + len, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

const glowTex = once(() => glowTexture());

function sprite(color: number, size: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size);
  return s;
}

/** Where the ribbon is at `s`, and its heading. */
function frameAt(ribbon: Ribbon, s: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x, z: p.z, y: ribbon.heightAt(s), heading: Math.atan2(p.tx, p.tz), tx: p.tx, tz: p.tz };
}

/** Where a point `lateral` metres off the road at `s` is (a lateral to the right is positive). */
function offRoad(ribbon: Ribbon, s: number, lateral: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x - p.tz * lateral, z: p.z + p.tx * lateral, heading: Math.atan2(p.tx, p.tz) };
}

/** How far a point is from the edge of any road of the track (negative: on one). */
function clearance(track: Track, x: number, z: number): number {
  let best = Infinity;
  for (const r of [track.main, ...track.branches]) {
    const hit = nearestOnSpline(r.spline, x, z);
    best = Math.min(best, hit.distance - r.halfWidthAt(hit));
  }
  return best;
}

/** Whether another stretch of road than the ribbon's own round `s` passes within `r` of a point. */
function crowded(track: Track, ribbon: Ribbon, s: number, x: number, z: number, r: number): boolean {
  for (const other of [track.main, ...track.branches]) {
    const sp = other.spline;
    for (let i = 0; i < sp.count; i += 2) {
      if (other === ribbon) {
        const along = Math.abs(sp.dist[i] - s);
        if (Math.min(along, sp.length - along) < 80) continue;
      }
      if (Math.hypot(sp.px[i] - x, sp.pz[i] - z) < r) return true;
    }
  }
  return false;
}

/** A cylinder from `a` to `b`. */
function beam(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, d.length(), 6), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
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

/** A face of words on a sign: cream on orange, in a chunky 60s hand. */
const signFace = (() => {
  const made = new Map<string, THREE.CanvasTexture>();
  return (lines: string[], bg = '#e0601a', fg = '#fff4dc'): THREE.CanvasTexture => {
    const key = `${lines.join('|')}|${bg}|${fg}`;
    let t = made.get(key);
    if (t) return t;
    const W = 512;
    const H = 256;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#5a1a40';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = lines.length === 1 ? 104 : 68;
    ctx.font = `bold ${size}px 'Cooper Black', Georgia, serif`;
    lines.forEach((line, k) => {
      const w = ctx.measureText(line).width;
      ctx.save();
      ctx.translate(W / 2, H / 2 + (k - (lines.length - 1) / 2) * size * 1.1);
      if (w > W - 60) ctx.scale((W - 60) / w, 1);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
    t = finish(c, false);
    made.set(key, t);
    return t;
  };
})();

/** A sign panel `w` wide (half as high), its face toward -z (whoever's coming) and on its back. */
function signPanel(w: number, map: THREE.Texture, frame: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, w / 2);
  const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map }));
  front.rotation.y = Math.PI;
  front.position.z = -0.24;
  const rear = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map }));
  rear.position.z = 0.24;
  const board = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, w / 2 + 0.6, 0.4), frame);
  g.add(board, front, rear);
  return g;
}

// Shared materials.
const waxMat = once(() => new THREE.MeshPhongMaterial({ color: CREAM_HEX, shininess: 50, specular: 0x6a5a48 }));
const redWax = once(() => new THREE.MeshPhongMaterial({ color: RED_HEX, shininess: 60, specular: 0x6a3a30 }));
const moltenMat = once(() => basic(MOLTEN_HEX));
const flameMat = once(() => basic(0xffd070, { transparent: true, opacity: 0.95 }));
const flameCore = once(() => basic(0xfff4d0));
const wickMat = once(() => basic(0x14100c));
const darkWood = once(() => lambert(0x3a1e10, { flatShading: true }));
const brass = once(() => new THREE.MeshPhongMaterial({ color: 0xc89a3a, shininess: 90, specular: 0xffe0a0 }));
const chrome = once(() => new THREE.MeshPhongMaterial({ color: 0xc8ccd0, shininess: 120, specular: 0xffffff }));
const glassMat = once(() => new THREE.MeshPhongMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.22, shininess: 140, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false }));
const waxColours = once(() => [CREAM_HEX, RED_HEX, ORANGE_HEX, MUSTARD_HEX, PLUM_HEX, AVOCADO_HEX, TEAL_HEX].map((c) => new THREE.MeshPhongMaterial({ color: c, shininess: 50, specular: 0x5a4a40 })));

/** A candle flame: a teardrop of light over a wick, flickering, with its glow. */
function flame(size: number, animated: Animated, ph: number): THREE.Group {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 10, 8), flameMat());
  outer.scale.set(1, 2.2, 1);
  outer.position.y = size * 1.1;
  const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.26, 8, 6), flameCore());
  core.scale.set(1, 2, 1);
  core.position.y = size * 0.8;
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.06, size * 0.08, size * 0.6, 5), wickMat());
  wick.position.y = size * 0.25;
  const halo = sprite(GLOW_HEX, size * 7, 0.55);
  halo.position.y = size * 1.2;
  g.add(wick, outer, core, halo);
  animated.push((time) => {
    const f = 1 + 0.12 * Math.sin(time * 13 + ph) + 0.07 * Math.sin(time * 29 + ph * 2);
    outer.scale.set(1 / f, 2.2 * f, 1 / f);
    outer.rotation.z = 0.08 * Math.sin(time * 5 + ph);
    halo.material.opacity = 0.45 + 0.15 * f;
  });
  return g;
}

/** Drips of wax down the side of a column `r` round and `h` high, from its rim. */
function drips(r: number, h: number, mat: THREE.Material, rand: () => number, count = 9): THREE.Group {
  const g = new THREE.Group();
  for (let k = 0; k < count; k++) {
    const a = rand() * Math.PI * 2;
    const len = h * (0.15 + rand() * 0.6);
    const w = r * (0.08 + rand() * 0.08);
    const d = new THREE.Mesh(new THREE.CylinderGeometry(w, w * 0.8, len, 6), mat);
    d.position.set(Math.cos(a) * r * 1.01, h - len / 2, Math.sin(a) * r * 1.01);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(w * 1.5, 6, 5), mat);
    bulb.position.set(Math.cos(a) * r * 1.02, h - len, Math.sin(a) * r * 1.02);
    g.add(d, bulb);
  }
  return g;
}

/** A pool of wax spread on the floor, `r` across, set at its edges and molten at its heart. */
function pool(r: number, mat: THREE.Material, molten = true): THREE.Group {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.12;
  disc.scale.set(1, 0.8, 1);
  g.add(disc);
  if (molten) {
    const heart = new THREE.Mesh(new THREE.CircleGeometry(r * 0.45, 16), moltenMat());
    heart.rotation.x = -Math.PI / 2;
    heart.position.y = 0.16;
    g.add(heart);
  }
  return g;
}

/**
 * A candle on the floor, burning down in its own pool: a pillar or a taper
 * in a brass holder, drips down its sides, its flame flickering.
 */
function candleFigure(h: number, rand: () => number, animated: Animated): THREE.Group {
  const t = new THREE.Group();
  const mats = waxColours();
  const mat = mats[Math.floor(rand() * mats.length)];
  const taper = rand() < 0.4;
  const r = taper ? h * 0.07 : h * (0.16 + rand() * 0.1);
  let base = 0;
  if (taper) {
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.6, r * 3.2, h * 0.18, 12), brass());
    holder.position.y = h * 0.09;
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(r * 3.6, r * 3.4, h * 0.03, 16), brass());
    dish.position.y = h * 0.18;
    t.add(holder, dish);
    base = h * 0.19;
  } else {
    t.add(pool(r * 2.2, mat));
  }
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, h, 14), mat);
  body.position.y = base + h / 2;
  const top = drips(r, h, mat, rand, taper ? 4 : 8);
  top.position.y = base;
  const f = flame(r * (taper ? 1.4 : 0.55), animated, rand() * 10);
  f.position.y = base + h;
  t.add(body, top, f);
  return t;
}

/** A chianti bottle in its straw basket, a candle burning in its neck and wax of every colour run down it. */
function chiantiFigure(h: number, rand: () => number, animated: Animated): THREE.Group {
  const t = new THREE.Group();
  const bottle = new THREE.Mesh(new THREE.SphereGeometry(h * 0.3, 14, 12), new THREE.MeshPhongMaterial({ color: 0x1a4a22, shininess: 110, specular: 0x88aa88, transparent: true, opacity: 0.85 }));
  bottle.scale.set(1, 1.1, 1);
  bottle.position.y = h * 0.32;
  const straw = new THREE.Mesh(new THREE.SphereGeometry(h * 0.31, 14, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), lambert(0xc8a050, { flatShading: true }));
  straw.position.y = h * 0.32;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.05, h * 0.08, h * 0.4, 10), bottle.material);
  neck.position.y = h * 0.78;
  t.add(bottle, straw, neck);
  // Wax of every colour run down the neck and over the shoulders.
  const mats = waxColours();
  for (let k = 0; k < 12; k++) {
    const a = rand() * Math.PI * 2;
    const len = h * (0.2 + rand() * 0.35);
    const d = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.025, h * 0.02, len, 5), mats[k % mats.length]);
    const rr = h * (0.07 + 0.2 * rand());
    d.position.set(Math.cos(a) * rr, h * 0.95 - len / 2, Math.sin(a) * rr);
    d.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
    t.add(d);
  }
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.045, h * 0.045, h * 0.25, 8), mats[1]);
  candle.position.y = h * 1.1;
  const f = flame(h * 0.07, animated, rand() * 10);
  f.position.y = h * 1.22;
  t.add(candle, f);
  return t;
}

/** Drips standing up off the floor like stalagmites, set where they fell, round a puddle of wax. */
function stalagmites(h: number, rand: () => number): THREE.Group {
  const t = new THREE.Group();
  const mats = waxColours();
  const mat = mats[Math.floor(rand() * mats.length)];
  t.add(pool(h * 0.9, mat, rand() < 0.5));
  const n = 3 + Math.floor(rand() * 5);
  for (let k = 0; k < n; k++) {
    const hh = h * (0.4 + rand() * 0.8);
    const r = hh * 0.16;
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, hh, 8), mat);
    m.position.set((rand() - 0.5) * h, hh / 2, (rand() - 0.5) * h);
    m.rotation.set((rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3);
    const blob = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 8, 6), mat);
    blob.position.set(m.position.x, hh * 0.08, m.position.z);
    blob.scale.y = 0.5;
    t.add(m, blob);
  }
  return t;
}

/** A record, lying on the floor or leaning, black with an orange label. */
const labelTexture = once(() => {
  const [c, ctx] = canvas(128);
  ctx.fillStyle = '#e0601a';
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a1a40';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('ODDMENTS', 64, 48);
  ctx.font = 'bold 16px Georgia, serif';
  ctx.fillText('HOT WAX', 64, 90);
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(64, 64, 5, 0, Math.PI * 2);
  ctx.fill();
  return finish(c, false);
});
function recordFigure(r: number, rand: () => number): THREE.Group {
  const t = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 0.03, 32), new THREE.MeshPhongMaterial({ color: 0x0c0a0c, shininess: 90, specular: 0x6a6a7a }));
  const label = new THREE.Mesh(new THREE.CircleGeometry(r * 0.33, 24), new THREE.MeshLambertMaterial({ map: labelTexture() }));
  label.rotation.x = -Math.PI / 2;
  label.position.y = r * 0.016;
  const g = new THREE.Group();
  g.add(disc, label);
  if (rand() < 0.4) {
    // Leaning on its edge.
    g.rotation.x = Math.PI / 2 - 0.3;
    g.position.y = r * 0.95;
  } else g.position.y = r * 0.016;
  t.add(g);
  return t;
}

/** A matchbox, open, and a few matches spilt out of it, one burnt down. */
function matchesFigure(s: number, rand: () => number): THREE.Group {
  const t = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.35, s * 0.6), lambert(0xd8c8a0));
  box.position.y = s * 0.175;
  const label = new THREE.Mesh(new THREE.BoxGeometry(s * 1.01, s * 0.2, s * 0.61), lambert(0xb0201a));
  label.position.y = s * 0.2;
  t.add(box, label);
  for (let k = 0; k < 4; k++) {
    const m = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.BoxGeometry(s * 0.05, s * 0.05, s * 0.9), lambert(0xe8d0a0));
    const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.05, 6, 5), lambert(k === 0 ? 0x1a1a1a : 0xc0201a));
    head.position.z = s * 0.45;
    m.add(stick, head);
    m.position.set(s * (0.7 + rand() * 0.6), s * 0.03, (rand() - 0.5) * s);
    m.rotation.y = rand() * Math.PI;
    t.add(m);
  }
  return t;
}

/** A house plant, giant, its leaves hanging over: a monstera or a palm in a pot. */
function plantFigure(h: number, rand: () => number): THREE.Group {
  const t = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.2, h * 0.14, h * 0.3, 14), lambert(rand() < 0.5 ? 0xb8562a : 0xe0a020, { flatShading: true }));
  pot.position.y = h * 0.15;
  t.add(pot);
  const leafMat = lambert(rand() < 0.5 ? 0x2a6a2a : 0x3a7a24, { side: THREE.DoubleSide, flatShading: true });
  const n = 6 + Math.floor(rand() * 5);
  for (let k = 0; k < n; k++) {
    const stalk = new THREE.Group();
    stalk.position.y = h * 0.3;
    stalk.rotation.set(0, (k / n) * Math.PI * 2 + rand() * 0.4, 0);
    const lean = new THREE.Group();
    lean.rotation.x = 0.5 + rand() * 0.6;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.012, h * 0.016, h * 0.5, 5), leafMat);
    stem.position.y = h * 0.25;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(h * 0.18, 10, 6), leafMat);
    leaf.scale.set(1, 0.08, 1.6);
    leaf.position.set(0, h * 0.52, h * 0.12);
    leaf.rotation.x = 0.5;
    lean.add(stem, leaf);
    stalk.add(lean);
    t.add(stalk);
  }
  return t;
}

/** A plastic safari animal, as big as a house to a kart: a giraffe, an elephant or a zebra, in toy colours. */
function toyAnimal(s: number, rand: () => number): THREE.Group {
  const t = new THREE.Group();
  const kind = Math.floor(rand() * 3);
  const col = [0xe8b030, 0x8a8a96, 0xf0f0f0][kind];
  const mat = new THREE.MeshPhongMaterial({ color: col, shininess: 80, specular: 0xffffff });
  const spot = new THREE.MeshPhongMaterial({ color: kind === 2 ? 0x141414 : 0x8a4a1a, shininess: 80 });
  const legH = kind === 0 ? s * 0.7 : s * 0.45;
  const body = new THREE.Mesh(new THREE.SphereGeometry(s * 0.4, 12, 10), mat);
  body.scale.set(0.8, 0.75, 1.3);
  body.position.y = legH + s * 0.25;
  t.add(body);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.07, s * 0.08, legH + s * 0.1, 6), mat);
    leg.position.set(lx * s * 0.2, legH / 2, lz * s * 0.35);
    t.add(leg);
  }
  if (kind === 0) {
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.08, s * 0.12, s * 1.1, 8), mat);
    neck.position.set(0, legH + s * 0.85, s * 0.45);
    neck.rotation.x = 0.35;
    const head = new THREE.Mesh(new THREE.BoxGeometry(s * 0.16, s * 0.18, s * 0.34), mat);
    head.position.set(0, legH + s * 1.4, s * 0.68);
    t.add(neck, head);
    for (let k = 0; k < 8; k++) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(s * 0.08, 6, 4), spot);
      sp.scale.y = 0.3;
      const a = rand() * Math.PI * 2;
      sp.position.set(Math.cos(a) * s * 0.3, legH + s * 0.3 + rand() * s * 0.2, Math.sin(a) * s * 0.4);
      t.add(sp);
    }
  } else if (kind === 1) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.25, 10, 8), mat);
    head.position.set(0, legH + s * 0.4, s * 0.55);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.05, s * 0.09, s * 0.6, 6), mat);
    trunk.position.set(0, legH + s * 0.1, s * 0.75);
    trunk.rotation.x = 0.3;
    t.add(head, trunk);
    for (const k of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CircleGeometry(s * 0.22, 10), new THREE.MeshPhongMaterial({ color: col, side: THREE.DoubleSide }));
      ear.position.set(k * s * 0.24, legH + s * 0.45, s * 0.45);
      ear.rotation.y = k * 0.9;
      t.add(ear);
    }
  } else {
    const head = new THREE.Mesh(new THREE.BoxGeometry(s * 0.18, s * 0.22, s * 0.45), mat);
    head.position.set(0, legH + s * 0.55, s * 0.6);
    head.rotation.x = 0.5;
    t.add(head);
    for (let k = 0; k < 6; k++) {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(s * 0.33, s * 0.025, 4, 16), spot);
      stripe.position.set(0, legH + s * 0.25, (k / 5 - 0.5) * s * 0.9);
      stripe.scale.set(0.8, 0.75, 1);
      t.add(stripe);
    }
  }
  return t;
}

/** Which part of the house the scenery at a point stands in, by the stretch of the lap it's nearest. */
const JUNGLE = new Set(['Hot Wax', "C'mon Get Around", 'Come On a Safari With Me']);

/**
 * The scenery: the floor of the house, giant to the karts, the wax all
 * over it: candles of every colour burning down in their own pools (pillars
 * and tapers in brass holders), chianti bottles with candles in their
 * necks, drips set into stalagmites round puddles, records lying about,
 * matches. Round the flame, where the safari is, house plants and plastic
 * safari animals among the drips. Kept clear of the road: what would reach
 * it is drawn smaller.
 */
export function waxworksFeature(animated: Animated, track?: Track): Feature {
  const room = (x: number, z: number) => (track ? clearance(track, x, z) : 60);
  const jungle = (x: number, z: number) => {
    if (!track || track.def.id !== 'hot-wax') return false;
    const hit = nearestOnSpline(track.spline, x, z);
    return hit.distance < 120 && JUNGLE.has(track.main.def.sections[track.main.sectionIndex[hit.index]]?.name ?? '');
  };
  const sized = (x: number, z: number, want: number) => Math.max(3, Math.min(want, room(x, z) - 3));
  const candle: Feature = (x, z, rand) => place(candleFigure(sized(x, z, 10 + rand() * 26), rand, animated), x, z, rand);
  const chianti: Feature = (x, z, rand) => place(chiantiFigure(sized(x, z, 14 + rand() * 12), rand, animated), x, z, rand);
  const drip: Feature = (x, z, rand) => place(stalagmites(sized(x, z, 5 + rand() * 9), rand), x, z, rand);
  const record: Feature = (x, z, rand) => place(recordFigure(sized(x, z, 10 + rand() * 8), rand), x, z, rand);
  const matches: Feature = (x, z, rand) => place(matchesFigure(sized(x, z, 8 + rand() * 6), rand), x, z, rand);
  const plant: Feature = (x, z, rand) => place(plantFigure(sized(x, z, 26 + rand() * 20), rand), x, z, rand);
  const animal: Feature = (x, z, rand) => place(toyAnimal(sized(x, z, 9 + rand() * 9), rand), x, z, rand);
  return (x, z, rand) => {
    if (jungle(x, z)) return pick(rand, [[4, plant], [3, animal], [3, drip], [1, candle]])(x, z, rand);
    return pick(rand, [[5, candle], [2, chianti], [3, drip], [1, record], [1, matches], [1, plant]])(x, z, rand);
  };
}

/**
 * Comin' under the door: the start, a giant door in its frame across the
 * road, the walls of the room going off either side, the door hung high
 * enough off the floor that the karts go under it, and hot wax oozing out
 * under it, glowing. HOT WAX on a plate on it, a big brass knob.
 */
export function waxDoor(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 3;
  const GAP = 9;
  const TOP = 50;
  const frameMat = lambert(0xf0e8d8, { flatShading: true });
  const wall = new THREE.MeshLambertMaterial({ map: wallpaperTexture() });
  (wall.map as THREE.Texture).repeat.set(3, 2);
  for (const k of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(4, TOP + 4, 5), frameMat);
    jamb.position.set(k * (hw + 2), (TOP + 4) / 2, 0);
    const side = new THREE.Mesh(new THREE.BoxGeometry(60, TOP + 20, 3), wall);
    side.position.set(k * (hw + 34), (TOP + 20) / 2, 0);
    const skirting = new THREE.Mesh(new THREE.BoxGeometry(60, 4, 3.6), darkWood());
    skirting.position.set(k * (hw + 34), 2, 0);
    g.add(jamb, side, skirting);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 8, 4, 5), frameMat);
  header.position.y = TOP + 2;
  const over = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 8, 16, 3), wall);
  over.position.y = TOP + 12;
  g.add(header, over);
  // The door: a 60s flush door in mustard, panels and a brass knob, hung above the road.
  const doorMat = lambert(0xc88a1e, { flatShading: true });
  const door = new THREE.Mesh(new THREE.BoxGeometry(2 * hw, TOP - GAP, 1.6), doorMat);
  door.position.y = (TOP + GAP) / 2;
  g.add(door);
  for (const [px, py] of [[-0.5, 0.72], [0.5, 0.72], [-0.5, 0.3], [0.5, 0.3]]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(hw * 0.8, (TOP - GAP) * 0.34, 2), lambert(0xa86a14));
    panel.position.set(px * hw, GAP + (TOP - GAP) * py, 0);
    g.add(panel);
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), brass());
  knob.position.set(hw * 0.75, GAP + 14, -1.8);
  const knobBack = knob.clone();
  knobBack.position.z = 1.8;
  const plate = signPanel(14, signFace(['HOT WAX']), brass());
  plate.position.set(0, GAP + (TOP - GAP) * 0.52, 0);
  g.add(knob, knobBack, plate);
  // Under it, the wax oozing through, glowing, spreading out both ways.
  const ooze = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw + 6, 10), new THREE.MeshBasicMaterial({ color: MOLTEN_HEX, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  ooze.rotation.x = -Math.PI / 2;
  ooze.position.y = 0.1;
  const glow = sprite(GLOW_HEX, 40, 0.5);
  glow.position.y = 3;
  g.add(ooze, glow);
  animated.push((time) => {
    ooze.scale.y = 0.8 + 0.25 * Math.sin(time * 1.3);
    glow.material.opacity = 0.35 + 0.15 * Math.sin(time * 2.1);
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * Comin' under the floor: the joists over the road where it's sunk under
 * the floor, every few metres, and the floorboards over its edges, the
 * candlelight slanting down through the gaps.
 */
export function floorJoists(track: Track, ribbon: Ribbon, s: number, to: number): THREE.Group {
  const g = new THREE.Group();
  const joist = darkWood();
  const board = lambert(0x6a3a1c, { flatShading: true });
  const shaft = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  let k = 0;
  for (let d = s; d < to; d += 9, k++) {
    const f = frameAt(ribbon, d);
    if (f.y > -4) continue;
    // Not where another stretch of road runs over the floor.
    if (crowded(track, ribbon, d, f.x, f.z, 34)) continue;
    const hw = ribbon.halfWidthAtS(d) + 2;
    const j = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 4, 1.6, 1.4), joist);
    beam.position.y = -1.0;
    j.add(beam);
    // The floorboards' ends over the cut's rims, and between them, open, the light coming through.
    for (const side of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 8.6), board);
      b.position.set(side * (hw + 1), -0.2, 0);
      j.add(b);
    }
    if (k % 2 === 0) {
      const light = new THREE.Mesh(new THREE.PlaneGeometry(hw * 0.8, 9), shaft);
      light.position.y = f.y / 2;
      light.rotation.x = 0.3;
      j.add(light);
    }
    j.position.set(f.x, 0, f.z);
    j.rotation.y = f.heading;
    g.add(j);
  }
  return g;
}

/** A rug's shag pattern: orange, mustard and brown in big 60s swirls, fringed. */
const rugTexture = once(() => {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 3, 9141);
  const fine = fbm(S, 64, 2, 9142);
  paint(ctx, S, S, (x, y, i) => {
    const r = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
    const band = Math.floor((r * 5 + n[i] * 1.5) % 3);
    const col: RGB = band === 0 ? [214, 96, 26] : band === 1 ? [210, 160, 40] : [96, 40, 30];
    return shade(col, 0.75 + 0.4 * fine[i]);
  });
  return finish(c);
});

/** Creepin' under the hill: the rucked rug the road climbs over, its shag in 60s swirls, rising round the road in the same hump. */
export function rugHill(ribbon: Ribbon, s: number): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const L = 110;
  const W = 2 * ribbon.halfWidthAtS(s) + 60;
  const geo = new THREE.PlaneGeometry(W, L, 12, 40);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const along = pos.getZ(i);
    const across = pos.getX(i);
    const y = ribbon.heightAt(Math.max(0, Math.min(ribbon.spline.length, s + along)));
    // The rug drapes off to the floor at its far sides.
    const drop = Math.max(0, Math.abs(across) - W * 0.3) / (W * 0.2);
    pos.setY(i, Math.max(0.15, y * Math.max(0, 1 - drop * drop) - 0.25));
  }
  geo.computeVertexNormals();
  const rug = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: rugTexture() }));
  g.add(rug);
  // The fringe, along its ends.
  for (const end of [-1, 1]) {
    for (let k = 0; k < 24; k++) {
      const tassel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 3), lambert(0xf0e0c0));
      tassel.position.set((k / 23 - 0.5) * W, 0.2, end * (L / 2 + 1.5));
      g.add(tassel);
    }
  }
  g.position.set(f.x, 0, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The night outside the window: deep blue, a moon, stars, and the black shapes of gum trees. */
const nightTexture = once(() => {
  const W = 512;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#060a24');
  sky.addColorStop(1, '#1a2a5a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const rand = seededRandom(9151);
  for (let k = 0; k < 140; k++) {
    ctx.fillStyle = `rgba(255,255,240,${0.4 + rand() * 0.6})`;
    ctx.fillRect(rand() * W, rand() * H * 0.7, 1.5, 1.5);
  }
  ctx.fillStyle = '#fff6d8';
  ctx.beginPath();
  ctx.arc(W * 0.7, H * 0.28, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#04060c';
  for (let x = 0; x < W; x += 30 + rand() * 40) {
    const h = 40 + rand() * 90;
    ctx.fillRect(x, H - h, 6, h);
    ctx.beginPath();
    ctx.ellipse(x + 3, H - h, 20 + rand() * 20, 16 + rand() * 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, false);
});

/**
 * Creepin' under the sill: a tall sash window along the left of the sill,
 * the night outside and the moon, orange and plum curtains drawn back at
 * its ends, a cactus in a pot on the sill; wax dribbling down the glass.
 */
export function windowSill(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const a = frameAt(ribbon, s);
  const b = frameAt(ribbon, to);
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const hw = ribbon.halfWidthAtS((s + to) / 2) + 4;
  const H = 56;
  const y0 = a.y;
  const frameMat = lambert(0xf4ecdc, { flatShading: true });
  const win = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshBasicMaterial({ map: nightTexture() }));
  glass.position.set(0, H / 2, 0);
  // Facing the road, to its right (local -x).
  glass.rotation.y = -Math.PI / 2;
  win.add(glass);
  // The frame and the glazing bars.
  for (const yy of [0, H / 2, H]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2, 2, len + 2), frameMat);
    bar.position.y = yy;
    win.add(bar);
  }
  for (let k = 0; k <= 4; k++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2, H, 1.6), frameMat);
    bar.position.set(0, H / 2, (k / 4 - 0.5) * len);
    win.add(bar);
  }
  // Curtains drawn back at either end.
  for (const end of [-1, 1]) {
    const curtain = new THREE.Mesh(new THREE.CylinderGeometry(4, 7, H + 10, 10, 1, true), lambert(end < 0 ? ORANGE_HEX : PLUM_HEX, { side: THREE.DoubleSide }));
    curtain.position.set(-2, (H + 10) / 2, end * (len / 2 + 2));
    curtain.scale.set(0.45, 1, 1);
    win.add(curtain);
  }
  // A cactus in a pot on the sill.
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(3, 2.2, 4, 10), lambert(0xb8562a));
  pot.position.set(-5, 2, len * 0.3);
  const cactus = new THREE.Mesh(new THREE.CapsuleGeometry(1.6, 7, 4, 8), lambert(0x3a7a3a));
  cactus.position.set(-5, 8, len * 0.3);
  win.add(pot, cactus);
  // Wax dribbling slowly down the glass.
  const dribbles: THREE.Mesh[] = [];
  const rand = seededRandom(9152);
  for (let k = 0; k < 7; k++) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 5), waxMat());
    d.position.set(-0.4, H, (rand() - 0.5) * len * 0.9);
    d.userData.speed = 0.6 + rand();
    d.userData.ph = rand() * 30;
    dribbles.push(d);
    win.add(d);
  }
  animated.push((time) => {
    for (const d of dribbles) {
      const l = ((time * d.userData.speed + d.userData.ph) % 30) / 30;
      d.scale.y = 1 + l * H * 0.7;
      d.position.y = H - d.scale.y / 2;
    }
  });
  // On the left of the sill (its lateral is to the right, so negative).
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  const heading = Math.atan2(b.x - a.x, b.z - a.z);
  win.position.set(mx + Math.cos(heading) * hw, y0, mz - Math.sin(heading) * hw);
  win.rotation.y = heading;
  g.add(win);
  return g;
}

/**
 * The candle itself, standing in the middle of the candle the lap draws:
 * a great red pillar of wax burning down over the race, drips running down
 * its sides and pooling round its foot, its flame high over everything,
 * the light the whole house is lit by.
 */
export function giantCandle(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = offRoad(ribbon, s, lateral);
  const R = 22;
  const H = 120;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.03, 1, 28), redWax());
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.92, R * 0.12, 8, 28), redWax());
  rim.rotation.x = Math.PI / 2;
  const well = new THREE.Mesh(new THREE.CircleGeometry(R * 0.86, 24), moltenMat());
  well.rotation.x = -Math.PI / 2;
  const rand = seededRandom(9161);
  const runs = drips(R, 1, redWax(), rand, 14);
  const creamRuns = drips(R * 1.01, 1, waxMat(), rand, 8);
  const f = flame(9, animated, 1.3);
  const high = sprite(GLOW_HEX, 160, 0.35);
  g.add(body, rim, well, runs, creamRuns, f, high, pool(R * 2.6, redWax()));
  animated.push((time) => {
    // It burns down over a race, and no further than half its height.
    const h = Math.max(H * 0.5, H - time * 0.25);
    body.scale.y = h;
    body.position.y = h / 2;
    rim.position.y = h;
    well.position.y = h - 0.4;
    runs.scale.y = h;
    creamRuns.scale.y = h * 0.8;
    f.position.y = h;
    high.position.y = h + 14;
    high.material.opacity = 0.3 + 0.06 * Math.sin(time * 11);
  });
  g.position.set(p.x, 0, p.z);
  return g;
}

/**
 * The lava lamp in the heart of the flame: a chrome rocket of a lamp, its
 * glass glowing magenta, and blobs of orange wax rising from the heat at
 * its foot, swelling, wobbling and sinking again.
 */
export function lavaLamp(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = offRoad(ribbon, s, lateral);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(7, 14, 18, 20), chrome());
  base.position.y = 9;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(3, 7, 12, 20), chrome());
  cap.position.y = 72;
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k <= 16; k++) {
    const u = k / 16;
    pts.push(new THREE.Vector2(7 + 6 * Math.sin(Math.PI * u * 0.8) - u * 3, 18 + u * 48));
  }
  const glass = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshPhongMaterial({ color: 0xff3aa0, emissive: 0xa0105a, emissiveIntensity: 0.8, transparent: true, opacity: 0.55, shininess: 120, depthWrite: false }));
  const glow = sprite(0xff4ab0, 90, 0.4);
  glow.position.y = 42;
  g.add(base, cap, glass, glow);
  const blobMat = new THREE.MeshPhongMaterial({ color: 0xff8a1a, emissive: 0xff5a00, emissiveIntensity: 0.7, shininess: 60 });
  const blobs = Array.from({ length: 6 }, (_, k) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 12), blobMat);
    b.userData.ph = k * 1.7;
    b.userData.size = 3 + (k % 3);
    g.add(b);
    return b;
  });
  animated.push((time) => {
    for (const b of blobs) {
      const u = 0.5 - 0.5 * Math.cos(time * 0.25 + b.userData.ph);
      const r = b.userData.size * (0.8 + 0.3 * Math.sin(time * 1.1 + b.userData.ph));
      b.position.set(Math.sin(b.userData.ph * 3) * 3, 22 + u * 40, Math.cos(b.userData.ph * 3) * 3);
      b.scale.set(r, r * (1.2 + 0.3 * Math.sin(time * 1.7 + b.userData.ph)), r);
    }
    glow.material.opacity = 0.32 + 0.08 * Math.sin(time * 0.9);
  });
  g.position.set(p.x, 0, p.z);
  return g;
}

/**
 * Come on a safari with me: along the flame's far side, a jungle of drips,
 * house plants as big as trees, plastic safari animals among them, and a
 * surfboard stood up in the wax, after the song the chorus is lifted from.
 */
export function waxJungle(track: Track, ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(9171);
  for (let d = s; d < to; d += 14) {
    for (const side of [-1, 1]) {
      const lat = side * (ribbon.halfWidthAtS(d) + 10 + rand() * 30);
      const p = offRoad(ribbon, d, lat);
      const room = clearance(track, p.x, p.z);
      if (room < 6) continue;
      const r = rand();
      const size = Math.min(room - 3, 30);
      const obj = r < 0.35 ? plantFigure(size * 1.4, rand) : r < 0.6 ? toyAnimal(Math.min(size, 16), rand) : r < 0.9 ? stalagmites(Math.min(size, 10), rand) : candleFigure(Math.min(size, 20), rand, animated);
      obj.position.set(p.x, 0, p.z);
      obj.rotation.y = rand() * Math.PI * 2;
      g.add(obj);
    }
  }
  // The surfboard, stuck upright in the wax at the start of the safari.
  const p = offRoad(ribbon, s + 20, ribbon.halfWidthAtS(s) + 14);
  if (clearance(track, p.x, p.z) > 6) {
    const board = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 18, 4, 12), lambert(0x2ab0d0));
    board.scale.z = 0.25;
    board.position.set(p.x, 11, p.z);
    board.rotation.set(0.1, p.heading, 0.15);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.8, 20, 1.5), lambert(0xffd23a));
    stripe.position.copy(board.position);
    stripe.rotation.copy(board.rotation);
    g.add(board, stripe, pool(8, waxMat()).translateX(p.x).translateZ(p.z));
  }
  return g;
}

/**
 * Slippin' under the seat: a 60s armchair standing over the road on its
 * splayed teak legs, its seat a mustard cushion high overhead, its back and
 * arms, wax dripping off the cushion's edge onto the road.
 */
export function armchair(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 6;
  const SEAT = 16;
  const D = 40;
  const teak = lambert(0x8a4a1e, { flatShading: true });
  const cloth = lambert(MUSTARD_HEX, { flatShading: true });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.6, SEAT + 1, 8), teak);
      leg.position.set(sx * hw, (SEAT + 1) / 2, sz * D * 0.42);
      leg.rotation.set(-sz * 0.12, 0, sx * 0.1);
      g.add(leg);
    }
  }
  const frameBox = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 6, 3, D), teak);
  frameBox.position.y = SEAT + 1.5;
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 2, 6, D - 2), cloth);
  cushion.position.y = SEAT + 6;
  const back = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 6, 34, 6), cloth);
  back.position.set(0, SEAT + 20, D / 2);
  back.rotation.x = -0.18;
  g.add(frameBox, cushion, back);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(4, 3, D), teak);
    arm.position.set(sx * (hw + 3), SEAT + 14, 0);
    const post = new THREE.Mesh(new THREE.BoxGeometry(3, 12, 3), teak);
    post.position.set(sx * (hw + 3), SEAT + 8, -D * 0.4);
    g.add(arm, post);
  }
  // Wax dripping off the front of the cushion.
  const drops: THREE.Mesh[] = [];
  const rand = seededRandom(9181);
  for (let k = 0; k < 6; k++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 5), waxMat());
    d.userData.x = (rand() - 0.5) * 2 * hw;
    d.userData.ph = rand();
    drops.push(d);
    g.add(d);
  }
  animated.push((time) => {
    for (const d of drops) {
      const u = (time * 0.5 + d.userData.ph) % 1;
      d.position.set(d.userData.x, SEAT - u * u * SEAT, -D / 2 + 1);
      d.visible = u < 0.98;
    }
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Drippin' under the feet: the sitter's bare feet either side of the road, giant, wax dripping over their toes. */
export function giantFeet(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s);
  const skin = lambert(0xe0a888, { flatShading: true });
  const rand = seededRandom(9191);
  for (const side of [-1, 1]) {
    const foot = new THREE.Group();
    const sole = new THREE.Mesh(new THREE.SphereGeometry(7, 14, 10), skin);
    sole.scale.set(1, 0.6, 2.1);
    sole.position.y = 3.5;
    const ankle = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 30, 12), skin);
    ankle.position.set(0, 18, 9);
    ankle.rotation.x = -0.25;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 6, 12), lambert(side < 0 ? PLUM_HEX : TEAL_HEX));
    cuff.position.set(0, 32, 12.5);
    cuff.rotation.x = -0.25;
    foot.add(sole, ankle, cuff);
    for (let k = 0; k < 5; k++) {
      const toe = new THREE.Mesh(new THREE.SphereGeometry(1.6 - k * 0.15, 8, 6), skin);
      toe.position.set((k - 2) * 2.4 * -side, 2, -13 + Math.abs(k - 2) * 0.8);
      const nail = new THREE.Mesh(new THREE.SphereGeometry(0.8 - k * 0.08, 6, 4), lambert(0xc0201a));
      nail.position.copy(toe.position).add(new THREE.Vector3(0, 1.1, -0.6));
      foot.add(toe, nail);
    }
    // Wax run down over the top of the foot.
    for (let k = 0; k < 4; k++) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 4 + rand() * 5, 5), redWax());
      d.position.set((rand() - 0.5) * 8, 6, -4 + rand() * 6);
      d.rotation.x = 1.0;
      foot.add(d);
    }
    foot.position.x = side * (hw + 12);
    foot.rotation.y = side * 0.15;
    g.add(foot);
  }
  animated.push((time) => {
    // A toe-tap, now and then.
    g.children.forEach((foot, k) => (foot.rotation.x = Math.max(0, Math.sin(time * 1.4 + k * 2)) * -0.08));
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * Leakin' under the sink: a run of 60s kitchen cupboards along both sides
 * of the road, avocado doors and orange handles, the bench over them, the
 * sink on one side with its chrome tap arched over the road and dripping;
 * the hot wax glowing in the gap under their doors, where it creeps out.
 */
export function kitchenSink(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const H = 22;
  const D = 16;
  const carcass = lambert(0xf0e8d8, { flatShading: true });
  const doorMat = lambert(AVOCADO_HEX, { flatShading: true });
  const handle = lambert(ORANGE_HEX);
  const bench = new THREE.MeshPhongMaterial({ color: 0xe8d070, shininess: 60, specular: 0x8a7a50 });
  const glowUnder = new THREE.MeshBasicMaterial({ color: MOLTEN_HEX, transparent: true, opacity: 0.9 });
  const UNIT = 18;
  for (let d = s + UNIT / 2; d < to - 4; d += UNIT) {
    const f = frameAt(ribbon, d);
    const hw = ribbon.halfWidthAtS(d) + 3;
    for (const side of [-1, 1]) {
      const unit = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(D, H, UNIT - 0.6), carcass);
      box.position.set(0, H / 2 + 2, 0);
      const kick = new THREE.Mesh(new THREE.BoxGeometry(D - 2, 2, UNIT - 0.6), darkWood());
      kick.position.set(1, 1, 0);
      const gap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, UNIT - 1.2), glowUnder);
      gap.position.set(-D / 2 + 0.6, 0.7, 0);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, H - 3, UNIT - 1.6), doorMat);
      door.position.set(-D / 2 - 0.2, H / 2 + 2, 0);
      const knob = new THREE.Mesh(new THREE.BoxGeometry(1, 5, 1.2), handle);
      knob.position.set(-D / 2 - 0.8, H - 4, UNIT / 2 - 3);
      const top = new THREE.Mesh(new THREE.BoxGeometry(D + 3, 1.6, UNIT), bench);
      top.position.set(-1.5, H + 2.8, 0);
      unit.add(box, kick, gap, door, knob, top);
      unit.position.set(f.x - f.tz * side * (hw + D / 2), f.y, f.z + f.tx * side * (hw + D / 2));
      // Each faces the road, its door (built on its -x side) toward the middle.
      unit.rotation.y = f.heading + (side > 0 ? Math.PI : 0);
      g.add(unit);
    }
  }
  // The sink, half way along the left, its tap arched out over the road, dripping.
  const mid = (s + to) / 2;
  const f = frameAt(ribbon, mid);
  const hw = ribbon.halfWidthAtS(mid) + 3;
  const sink = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 16), new THREE.MeshPhongMaterial({ color: 0x8a9096, shininess: 120, specular: 0xffffff }));
  basin.position.set(0, H + 3.7, 0);
  const tapPost = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 10, 10), chrome());
  tapPost.position.set(5, H + 8.6, 0);
  const tapArc = new THREE.Mesh(new THREE.TorusGeometry(10, 0.9, 8, 20, Math.PI), chrome());
  tapArc.position.set(-5, H + 13.6, 0);
  sink.add(basin, tapPost, tapArc);
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), waxMat());
  sink.add(drop);
  animated.push((time) => {
    const u = (time * 0.7) % 1;
    drop.position.set(-15, H + 13 - u * u * (H + 13), 0);
  });
  sink.position.set(f.x - f.tz * -(hw + D / 2), f.y, f.z + f.tx * -(hw + D / 2));
  // On the left of the road, its tap (built along local -x) leaning out over it.
  sink.rotation.y = f.heading;
  g.add(sink);
  return g;
}

/**
 * Leakin' under the drink: a giant tumbler lying on its side by the road,
 * its drink spilt right across it into a red pool, ice cubes in it, a
 * cocktail umbrella floating, a straw.
 */
export function spiltDrink(ribbon: Ribbon, s: number, pits: readonly PitDef[], animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const pit = pits.reduce((best, p) => (Math.hypot(p.x - f.x, p.z - f.z) < Math.hypot(best.x - f.x, best.z - f.z) ? p : best), pits[0]);
  const hw = pit ? pit.halfWidth : ribbon.halfWidthAtS(s);
  const tumbler = new THREE.Group();
  const side = new THREE.Mesh(new THREE.CylinderGeometry(10, 9, 26, 24, 1, true), glassMat());
  side.rotation.z = Math.PI / 2;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(9, 24), glassMat());
  bottom.rotation.y = Math.PI / 2;
  bottom.position.x = 13;
  const inside = new THREE.Mesh(new THREE.CylinderGeometry(8, 7.5, 24, 16, 1, false, Math.PI * 0.6, Math.PI * 0.8), basic(0x7a1a24, { transparent: true, opacity: 0.8 }));
  inside.rotation.z = Math.PI / 2;
  tumbler.add(side, bottom, inside);
  tumbler.position.set(hw + 16, 9.5, 0);
  tumbler.rotation.y = 0.25;
  g.add(tumbler);
  // Ice in the pool, and on the floor by the glass.
  const ice = new THREE.MeshPhongMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.7, shininess: 140, specular: 0xffffff });
  const cubes: THREE.Mesh[] = [];
  const rand = seededRandom(9201);
  for (let k = 0; k < 6; k++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), ice);
    c.position.set((rand() - 0.5) * hw * 1.6, -0.6, (rand() - 0.5) * 6);
    c.rotation.set(rand(), rand(), rand());
    cubes.push(c);
    g.add(c);
  }
  // The cocktail umbrella, floating.
  const umb = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(4, 2, 10), lambert(0xff4aa0, { side: THREE.DoubleSide }));
  canopy.position.y = 5;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 4), lambert(0xf0e0b0));
  stick.position.y = 2.5;
  umb.add(canopy, stick);
  umb.rotation.z = 0.5;
  g.add(umb);
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 22, 8), lambert(0xffffff));
  straw.position.set(hw + 6, 1, 8);
  straw.rotation.set(0, 0, Math.PI / 2 - 0.1);
  g.add(straw);
  animated.push((time) => {
    cubes.forEach((c, k) => (c.position.y = -0.8 + 0.3 * Math.sin(time * 1.5 + k)));
    umb.position.set(Math.sin(time * 0.3) * hw * 0.4, -0.5, Math.cos(time * 0.4) * 3);
  });
  if (pit) {
    g.position.set(pit.x, 0, pit.z);
    g.rotation.y = pit.heading;
  } else {
    g.position.set(f.x, 0, f.z);
    g.rotation.y = f.heading;
  }
  return g;
}

/** The lord's icon: a haloed figure in red and blue robes on gold, hands raised, the paint cracked. */
const iconTexture = once(() => {
  const W = 256;
  const H = 384;
  const [c, ctx] = canvas(W, H);
  const gold = ctx.createLinearGradient(0, 0, W, H);
  gold.addColorStop(0, '#c89a3a');
  gold.addColorStop(1, '#f0d070');
  ctx.fillStyle = gold;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffe8a0';
  ctx.beginPath();
  ctx.arc(W / 2, 110, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e0b890';
  ctx.beginPath();
  ctx.ellipse(W / 2, 110, 34, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a2010';
  ctx.beginPath();
  ctx.ellipse(W / 2, 92, 38, 30, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(W / 2 - 18, 104, 8, 4);
  ctx.fillRect(W / 2 + 10, 104, 8, 4);
  ctx.fillStyle = '#a01a1a';
  ctx.beginPath();
  ctx.moveTo(W / 2 - 40, 150);
  ctx.lineTo(W / 2 + 40, 150);
  ctx.lineTo(W / 2 + 80, H - 20);
  ctx.lineTo(W / 2 - 80, H - 20);
  ctx.fill();
  ctx.fillStyle = '#1a3a8a';
  ctx.beginPath();
  ctx.moveTo(W / 2 - 40, 150);
  ctx.lineTo(W / 2 - 100, H - 20);
  ctx.lineTo(W / 2 - 50, H - 20);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W / 2 + 40, 150);
  ctx.lineTo(W / 2 + 100, H - 20);
  ctx.lineTo(W / 2 + 50, H - 20);
  ctx.fill();
  // Wax run down over it from the candles above.
  ctx.fillStyle = 'rgba(240,226,196,0.9)';
  const rand = seededRandom(9211);
  for (let k = 0; k < 9; k++) {
    const x = rand() * W;
    const len = 30 + rand() * 160;
    ctx.fillRect(x, 0, 6, len);
    ctx.beginPath();
    ctx.arc(x + 3, len, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, false);
});

/**
 * Comin' under the lord: the lord's shrine beside the road, a great gilded
 * icon on an altar, banks of votive candles in red glass flickering in
 * front of it, and the wax of them all run down over the altar and the
 * icon both.
 */
export function lordShrine(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = offRoad(ribbon, s, lateral);
  const altar = new THREE.Mesh(new THREE.BoxGeometry(34, 12, 14), lambert(0xe8e0d0, { flatShading: true }));
  altar.position.y = 6;
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(35, 2, 15), lambert(0x8a1a2a));
  cloth.position.y = 12.5;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(30, 44, 3), brass());
  frame.position.set(0, 36, 4);
  const icon = new THREE.Mesh(new THREE.PlaneGeometry(26, 39), new THREE.MeshBasicMaterial({ map: iconTexture() }));
  icon.position.set(0, 36, 2.4);
  icon.rotation.y = Math.PI;
  const halo = sprite(0xffe0a0, 46, 0.35);
  halo.position.set(0, 48, 0);
  g.add(altar, cloth, frame, icon, halo);
  // The votives, in rows on the altar and stands either side.
  const votiveGlass = new THREE.MeshPhongMaterial({ color: 0xc0101a, emissive: 0x9a0a10, emissiveIntensity: 0.6, transparent: true, opacity: 0.85, shininess: 90 });
  const lights: THREE.Sprite[] = [];
  const rand = seededRandom(9212);
  for (let k = 0; k < 18; k++) {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1, 2.4, 10), votiveGlass);
    const row = k % 3;
    const x = ((k / 3) | 0) * 5.5 - 14;
    v.position.set(x, 14.7 + row * 0.1, -4 + row * 3);
    const l = sprite(0xffa040, 4, 0.8);
    l.position.copy(v.position).add(new THREE.Vector3(0, 1.6, 0));
    l.userData.ph = rand() * 10;
    lights.push(l);
    g.add(v, l);
  }
  for (let k = 0; k < 8; k++) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.4, 4 + rand() * 6, 5), waxMat());
    d.position.set(-15 + rand() * 30, 10, -7.2);
    g.add(d);
  }
  animated.push((time) => {
    for (const l of lights) l.material.opacity = 0.55 + 0.35 * Math.abs(Math.sin(time * 7 + l.userData.ph));
    halo.material.opacity = 0.28 + 0.08 * Math.sin(time * 0.8);
  });
  g.position.set(p.x, 0, p.z);
  // Facing the road (the icon faces its local -z).
  g.rotation.y = p.heading + (lateral < 0 ? Math.PI / 2 : -Math.PI / 2);
  return g;
}

/**
 * Comin' into the brain: a head of glass standing over the road, the road
 * running in through it, and its brain hanging overhead, pink and glowing,
 * the hot wax seeping into its folds.
 */
export function glassHead(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const R = 28;
  const head = new THREE.Mesh(new THREE.SphereGeometry(R, 28, 20), glassMat());
  head.scale.set(1, 1.15, 1.05);
  head.position.y = 6;
  // Features in the glass, etched: brows, nose, lips, seen from the road ahead.
  const etch = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(4, 12, 4), etch);
  nose.position.set(0, 14, -R - 2);
  nose.rotation.x = -0.4;
  const lips = new THREE.Mesh(new THREE.TorusGeometry(5, 1, 6, 16), etch);
  lips.scale.y = 0.4;
  lips.position.set(0, 4, -R + 0.5);
  g.add(head, nose, lips);
  for (const k of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.RingGeometry(2.5, 4, 16), etch);
    eye.position.set(k * 9, 22, -R + 2);
    eye.rotation.y = Math.PI;
    const ear = new THREE.Mesh(new THREE.TorusGeometry(5, 1.4, 6, 14, Math.PI * 1.4), glassMat());
    ear.position.set(k * (R + 1), 14, 0);
    ear.rotation.y = Math.PI / 2;
    g.add(eye, ear);
  }
  const brainMat = new THREE.MeshPhongMaterial({ color: 0xf08aa8, emissive: 0xc0305a, emissiveIntensity: 0.5, shininess: 40 });
  // Its folds, darker, with the wax glowing orange down in them.
  const foldMat = new THREE.MeshPhongMaterial({ color: 0xb0406a, emissive: 0xff5a20, emissiveIntensity: 0.25, shininess: 30 });
  const brain = new THREE.Group();
  for (const k of [-1, 1]) {
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 12), brainMat);
    lobe.scale.set(0.9, 0.75, 1.3);
    lobe.position.x = k * 8;
    brain.add(lobe);
    for (let j = 0; j < 7; j++) {
      const fold = new THREE.Mesh(new THREE.TorusGeometry(7 - j * 0.6, 0.7, 5, 16, Math.PI), foldMat);
      fold.position.set(k * 8, 1 + (j % 2) * 1.5, (j - 3) * 3.2);
      fold.rotation.y = (j % 3) * 0.3 - 0.3;
      brain.add(fold);
    }
  }
  brain.position.y = 26;
  const glow = sprite(0xff6a9a, 60, 0.4);
  glow.position.y = 26;
  g.add(brain, glow);
  animated.push((time) => {
    brainMat.emissiveIntensity = 0.4 + 0.25 * Math.sin(time * 2.4);
    brain.rotation.y = Math.sin(time * 0.3) * 0.1;
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * Comin' into the maze: walls of wax standing up off the floor all round
 * the maze's stretch in a maze's turns, cream and mustard, drips down them,
 * kept clear of the road and of Everybody's Learning How through it.
 */
export function waxMaze(track: Track, ribbon: Ribbon, s: number, to: number): THREE.Group {
  const g = new THREE.Group();
  const a = frameAt(ribbon, s);
  const b = frameAt(ribbon, to);
  const cx = (a.x + b.x) / 2;
  const cz = (a.z + b.z) / 2;
  const heading = Math.atan2(b.x - a.x, b.z - a.z);
  const C = 12;
  const N = 11;
  const mats = [waxMat(), new THREE.MeshPhongMaterial({ color: MUSTARD_HEX, shininess: 50 }), new THREE.MeshPhongMaterial({ color: ORANGE_HEX, shininess: 50 })];
  const rand = seededRandom(9221);
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const toWorld = (u: number, v: number) => ({ x: cx + sin * v + cos * u, z: cz + cos * v - sin * u });
  for (let i = -N / 2; i < N / 2; i++) {
    for (let j = -N / 2; j < N / 2; j++) {
      // A wall on one or two sides of each cell, chosen at random: a maze's look.
      const walls: [number, number, number, number][] = [];
      if (rand() < 0.55) walls.push([i * C, (j + 0.5) * C, C, 0]);
      if (rand() < 0.55) walls.push([(i + 0.5) * C, j * C, C, Math.PI / 2]);
      for (const [u, v, len, rot] of walls) {
        const w = toWorld(u, v);
        if (clearance(track, w.x, w.z) < len / 2 + 4) continue;
        if (track.def.pits.some((p) => inPit({ ...p, halfWidth: p.halfWidth + 4, halfLength: p.halfLength + 4 }, w.x, w.z))) continue;
        const h = 6 + rand() * 3;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(len + 1.6, h, 1.6), mats[Math.floor(rand() * mats.length)]);
        wall.position.set(w.x, h / 2, w.z);
        wall.rotation.y = heading + rot;
        g.add(wall);
      }
    }
  }
  return g;
}

/** Risin' from the leaves: a pot plant beside the road, its great leaves arching right over it. */
export function giantLeaves(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const mid = (s + to) / 2;
  const hw = ribbon.halfWidthAtS(mid);
  const leafMat = lambert(0x2a7a2a, { side: THREE.DoubleSide, flatShading: true });
  const vein = lambert(0x9ac83a, { side: THREE.DoubleSide });
  const leaves: THREE.Group[] = [];
  const rand = seededRandom(9231);
  // The pot, outside the bend.
  const p = offRoad(ribbon, mid, hw + 26);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(16, 11, 24, 18), lambert(0xb8562a, { flatShading: true }));
  pot.position.set(p.x, 12, p.z);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(15.5, 18), lambert(0x2a1a10));
  soil.rotation.x = -Math.PI / 2;
  soil.position.set(p.x, 23.9, p.z);
  g.add(pot, soil);
  for (let d = s; d < to; d += (to - s) / 7) {
    const f = frameAt(ribbon, d);
    const leaf = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.SphereGeometry(10, 12, 6), leafMat);
    blade.scale.set(1.4, 0.06, 0.6);
    const rib = new THREE.Mesh(new THREE.BoxGeometry(26, 0.5, 0.5), vein);
    rib.position.y = 0.4;
    leaf.add(blade, rib);
    leaf.position.set(f.x, f.y + 20 + rand() * 6, f.z);
    leaf.rotation.set(0, f.heading + (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.4);
    leaf.userData.ph = rand() * 10;
    leaves.push(leaf);
    g.add(leaf);
    // Its stem back to the pot.
    const dx = p.x - f.x;
    const dz = p.z - f.z;
    const len = Math.hypot(dx, dz);
    g.add(beam(new THREE.Vector3(p.x, 24, p.z), leaf.position, 0.8, leafMat));
    void len;
  }
  animated.push((time) => {
    for (const l of leaves) l.rotation.z = 0.15 * Math.sin(time * 0.7 + l.userData.ph);
  });
  return g;
}

/**
 * Runnin' under my bed: a bed standing over the road on its legs, the
 * mattress and a chenille spread hanging down either side, pillows, dark
 * under it, and something under there, its eyes glowing at the edges.
 */
export function giantBed(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 7;
  const UNDER = 15;
  const L = 70;
  const wood = lambert(0x5a2a14, { flatShading: true });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(3, UNDER + 4, 3), wood);
      leg.position.set(sx * hw, (UNDER + 4) / 2, sz * (L / 2 - 2));
      g.add(leg);
    }
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 4, 4, L), wood);
  base.position.y = UNDER + 2;
  const under = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw + 4, L), basic(0x0a0406, { side: THREE.DoubleSide }));
  under.rotation.x = Math.PI / 2;
  under.position.y = UNDER - 0.05;
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 2, 8, L - 2), lambert(0xf0ece0));
  mattress.position.y = UNDER + 8;
  const spread = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 6, 1.4, L + 2), lambert(TEAL_HEX, { flatShading: true }));
  spread.position.y = UNDER + 12.6;
  g.add(base, under, mattress, spread);
  // The spread hangs down the sides, short of the road.
  for (const sx of [-1, 1]) {
    const hang = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, L + 2), lambert(TEAL_HEX, { flatShading: true }));
    hang.position.set(sx * (hw + 3), UNDER + 8, 0);
    g.add(hang);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 8, 34, 3), wood);
  head.position.set(0, UNDER + 17, L / 2 + 1);
  for (const k of [-1, 1]) {
    const pillow = new THREE.Mesh(new THREE.SphereGeometry(8, 12, 8), lambert(0xfff4e0));
    pillow.scale.set(1.4, 0.45, 0.9);
    pillow.position.set(k * hw * 0.45, UNDER + 15, L / 2 - 9);
    g.add(pillow);
  }
  g.add(head);
  // Eyes under the bed, either side of the road, blinking.
  const eyes: THREE.Group[] = [];
  const rand = seededRandom(9241);
  for (let k = 0; k < 4; k++) {
    const pair = new THREE.Group();
    for (const e of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), basic(0xffd040));
      eye.position.x = e * 1.6;
      pair.add(eye);
    }
    const side = k % 2 ? 1 : -1;
    pair.position.set(side * (hw - 2), 2 + rand() * 4, (rand() - 0.5) * L * 0.8);
    pair.rotation.y = side * Math.PI / 2;
    pair.userData.ph = rand() * 10;
    eyes.push(pair);
    g.add(pair);
  }
  animated.push((time) => {
    for (const e of eyes) e.scale.y = Math.sin(time * 0.8 + e.userData.ph) > 0.96 ? 0.1 : 1;
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * Runnin' up my leg: a giant leg standing up off the floor beside the road,
 * a foot, a shin and a knee and on up out of sight, a pyjama cuff, and the
 * hot wax running up it the wrong way, glowing.
 */
export function giantLeg(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = offRoad(ribbon, s, lateral);
  const skin = lambert(0xe0a888, { flatShading: true });
  const foot = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), skin);
  foot.scale.set(1, 0.6, 2);
  foot.position.set(0, 3, -6);
  const shin = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 3.6, 46, 12), skin);
  shin.position.y = 25;
  const knee = new THREE.Mesh(new THREE.SphereGeometry(5.2, 12, 10), skin);
  knee.position.y = 49;
  const thigh = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 5.4, 60, 12), skin);
  thigh.position.set(0, 76, 8);
  thigh.rotation.x = 0.3;
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.2, 30, 12, 1, true), lambert(PLUM_HEX, { side: THREE.DoubleSide }));
  cuff.position.set(0, 96, 14);
  cuff.rotation.x = 0.3;
  g.add(foot, shin, knee, thigh, cuff);
  // The wax running up it.
  const runs: THREE.Mesh[] = [];
  for (let k = 0; k < 6; k++) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1, 6), new THREE.MeshBasicMaterial({ color: k % 2 ? MOLTEN_HEX : CREAM_HEX }));
    const a = (k / 6) * Math.PI * 2;
    r.position.set(Math.cos(a) * 4.5, 0, Math.sin(a) * 4.5);
    r.userData.ph = k * 0.37;
    runs.push(r);
    g.add(r);
  }
  animated.push((time) => {
    for (const r of runs) {
      const u = (time * 0.12 + r.userData.ph) % 1;
      const h = 4 + u * 44;
      r.scale.y = h;
      r.position.y = h / 2;
    }
  });
  g.position.set(p.x, 0, p.z);
  g.rotation.y = p.heading;
  return g;
}

/**
 * The spring reverb, punched for the clang: a big yellow Spring King pedal
 * on the floor in the middle of the pool, the springs showing through its
 * window, and a fist punching it on the beat, the whole thing jumping and
 * the springs shivering.
 */
export function springKing(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = offRoad(ribbon, s, lateral);
  const pedal = new THREE.Group();
  const yellow = new THREE.MeshPhongMaterial({ color: 0xffd21a, shininess: 70, specular: 0xfff0a0 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 56), yellow);
  box.position.y = 7;
  const kick = new THREE.Mesh(new THREE.BoxGeometry(36, 4, 18), chrome());
  kick.position.set(0, 15, -14);
  kick.rotation.x = 0.12;
  const plate = signPanel(26, signFace(['SPRING KING'], '#111111', '#ffd21a'), chrome());
  plate.position.set(0, 14.4, 12);
  plate.rotation.x = -Math.PI / 2;
  pedal.add(box, kick, plate);
  // Its window: the springs, coiled.
  const springs: THREE.Mesh[] = [];
  for (const k of [-1, 1]) {
    const path = new THREE.CatmullRomCurve3(Array.from({ length: 80 }, (_, i) => new THREE.Vector3(k * 8 + Math.cos(i * 0.9) * 2, 15 + Math.sin(i * 0.9) * 2, -24 + i * 0.6)));
    const coil = new THREE.Mesh(new THREE.TubeGeometry(path, 160, 0.35, 5), chrome());
    springs.push(coil);
    pedal.add(coil);
  }
  for (const [x, z] of [[-14, 20], [14, 20], [0, 20]]) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 4, 14), lambert(0x111111));
    knob.position.set(x, 16, z);
    pedal.add(knob);
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), basic(0xff2010));
  led.position.set(0, 15, 26);
  pedal.add(led);
  g.add(pedal);
  // The fist, Stu's, coming down on it.
  const arm = new THREE.Group();
  const fist = new THREE.Mesh(new THREE.BoxGeometry(14, 12, 14), lambert(0xe0a888, { flatShading: true }));
  const knuckles = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 3), lambert(0xd09070));
  knuckles.position.set(0, -6, -5);
  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 60, 10), lambert(0xe0a888));
  forearm.position.y = 34;
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 30, 10), lambert(0x2a2a3a));
  sleeve.position.y = 62;
  arm.add(fist, knuckles, forearm, sleeve);
  arm.rotation.z = 0.15;
  g.add(arm);
  const flash = sprite(0xfff0a0, 30, 0);
  flash.position.y = 18;
  g.add(flash);
  animated.push((time) => {
    // Punched every other beat: up, down hard, a clang.
    const u = (time * BEAT * 0.5) % 1;
    const hit = u < 0.12 ? 1 - u / 0.12 : 0;
    arm.position.y = u < 0.12 ? 22 + 30 * (u / 0.12) ** 2 : 22 + 30 * Math.min(1, (1 - u) / 0.6);
    pedal.position.y = hit * 1.4;
    pedal.rotation.z = hit * 0.03 * Math.sin(time * 60);
    for (const sp of springs) sp.position.y = hit * Math.sin(time * 90) * 0.6;
    flash.material.opacity = hit * 0.8;
    (led.material as THREE.MeshBasicMaterial).color.setHex(beatPhase(time) < 0.5 ? 0xff2010 : 0x601008);
  });
  g.position.set(p.x, 0, p.z);
  g.rotation.y = p.heading + 0.5;
  return g;
}

/**
 * Everybody's Learning How: the channel of molten wax across the middle of
 * the maze, glowing and smoking, its banks set hard, and the sign. On the
 * first lap it's molten through; from lap 2 the lane over it has set.
 */
export function learningHow(ribbon: Ribbon, s: number, pits: readonly PitDef[], animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const pit = pits.reduce((best, p) => (Math.hypot(p.x - f.x, p.z - f.z) < Math.hypot(best.x - f.x, best.z - f.z) ? p : best), pits[0]);
  if (!pit) return g;
  const L = pit.halfLength;
  const W = pit.halfWidth;
  for (const k of [-1, 1]) {
    const bank = new THREE.Mesh(new THREE.BoxGeometry(2 * W + 8, 2.4, 3), waxMat());
    bank.position.set(0, 1, k * (L + 1.5));
    g.add(bank);
  }
  const smoke: THREE.Sprite[] = [];
  for (let k = 0; k < 8; k++) {
    const p = sprite(0xffa060, 8, 0.3);
    p.userData.ph = k / 8;
    p.userData.x = (k / 7 - 0.5) * 2 * W;
    smoke.push(p);
    g.add(p);
  }
  const sign = signPanel(16, signFace(["EVERYBODY'S", 'LEARNING HOW']), darkWood());
  sign.position.set(W + 8, 12, -L - 4);
  const post = new THREE.Mesh(new THREE.BoxGeometry(1, 12, 1), darkWood());
  post.position.set(W + 8, 6, -L - 4);
  g.add(sign, post);
  animated.push((time) => {
    for (const p of smoke) {
      const u = (time * 0.4 + p.userData.ph) % 1;
      p.position.set(p.userData.x, u * 14, Math.sin(time + p.userData.ph * 6) * L * 0.5);
      p.material.opacity = 0.3 * (1 - u);
      p.scale.setScalar(5 + u * 10);
    }
  });
  g.position.set(pit.x, 0, pit.z);
  g.rotation.y = pit.heading;
  return g;
}

/** How far the tongue's front runs on past the far edge, and how far back under the cupboards it comes from. */
const TONGUE_REACH = 2;
const TONGUE_SEGS = 18;
/** A tongue of red candle wax, set. */
const SET_HEX = 0xa0141c;

/**
 * A tongue of hot wax, the hazard's look: a flat sheet of wax across the
 * road from the edge it comes from out to its rounded front, molten orange
 * and glowing while it creeps and lies there, a skin forming and darkening
 * to candle red as it cools, glossy and gleaming once it has set, then cracking up and shrinking
 * away; at its edge before it comes, the wax welling up glowing.
 */
export function waxFlowParts(obj: THREE.Object3D): THREE.Object3D[] {
  const sheetMat = new THREE.MeshPhongMaterial({ color: MOLTEN_HEX, emissive: MOLTEN_HEX, emissiveIntensity: 0.8, shininess: 90, specular: 0xfff0d0, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, TONGUE_SEGS, 4), sheetMat);
  sheet.rotation.x = -Math.PI / 2;
  sheet.position.y = 0.14;
  const front = new THREE.Mesh(new THREE.CircleGeometry(1, 20, -Math.PI / 2, Math.PI), sheetMat);
  front.rotation.x = -Math.PI / 2;
  front.position.y = 0.15;
  const well = sprite(GLOW_HEX, 10, 0);
  const cracks = new THREE.Group();
  const crackMat = basic(0x5a2a14, { transparent: true, opacity: 0 });
  for (let k = 0; k < 9; k++) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 1), crackMat);
    c.rotation.x = -Math.PI / 2;
    c.rotation.z = (k % 3) * 0.7 - 0.7;
    cracks.add(c);
  }
  const shine = sprite(0xfff4e0, 6, 0);
  // Its lip, the thick creeping edge of it, and the heat off it while it's molten.
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1, 8), sheetMat);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.2;
  const heat = sprite(GLOW_HEX, 14, 0);
  heat.position.y = 1.5;
  obj.add(sheet, front, well, cracks, shine, lip, heat);
  return [sheet, front, well, cracks, shine, lip, heat];
}

/** Poses a tongue of wax (from waxFlowParts): crept as far across as it has, hot or set. */
export function poseWaxFlow(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [sheet, front, well, cracks, shine, lip, heat] = parts;
  obj.rotation.y = p.heading;
  const W = WAX_STAGES;
  const width = 2 * p.radius + TONGUE_REACH;
  const from = p.side * (p.radius + 1);
  const reach = p.gap * width;
  // In the pose's frame local +x is the road's left: a lateral to the right is -x.
  const fromX = -from;
  const frontX = fromX + p.side * reach;
  const visible = reach > 0.3;
  sheet.visible = front.visible = visible;
  const depth = 2 * WAX_DEPTH;
  if (visible) {
    sheet.scale.set(reach, depth, 1);
    sheet.position.x = (fromX + frontX) / 2;
    // A creeping front wobbles; the sheet's edges ripple a little.
    const wobble = p.phase < W.across ? 0.4 * Math.sin(elapsed * 6) : 0;
    front.scale.set(WAX_DEPTH, WAX_DEPTH * (1 + 0.1 * Math.sin(elapsed * 3)), 1);
    front.position.x = frontX + wobble * p.side;
    front.rotation.z = p.side > 0 ? 0 : Math.PI;
  }
  const hot = waxHeat(p.phase);
  lip.visible = visible;
  lip.scale.y = depth * 0.9;
  lip.position.x = frontX;
  const heatMat = (heat as THREE.Sprite).material;
  heat.position.x = (fromX + frontX) / 2;
  heat.scale.set(Math.max(4, reach), 10, 1);
  heatMat.opacity = visible ? 0.35 * hot : 0;
  const mat = (sheet as THREE.Mesh).material as THREE.MeshPhongMaterial;
  // Set, it's candle red and glossy, plain against the cream road; molten, it glows.
  mat.color.setHex(SET_HEX).lerp(new THREE.Color(MOLTEN_HEX), hot);
  mat.emissive.setHex(MOLTEN_HEX);
  mat.emissiveIntensity = 0.1 + 0.9 * hot * (0.85 + 0.15 * Math.sin(elapsed * 9));
  mat.opacity = p.phase >= W.crack ? 0.95 * (1 - (p.phase - W.crack) / (1 - W.crack)) : 0.95;
  // Welling up at its edge before it comes: the warning.
  const wellMat = (well as THREE.Sprite).material;
  well.position.set(fromX, 1, 0);
  wellMat.opacity = p.phase < W.creep ? (p.phase / W.creep) * (0.6 + 0.3 * Math.sin(elapsed * 14)) : p.phase < W.across ? 0.5 : 0;
  well.scale.setScalar(8 + 4 * Math.sin(elapsed * 5));
  // Cracks as it sets and crumbles.
  const crack = p.phase >= W.set ? Math.min(1, (p.phase - W.set) / (W.crack - W.set)) : 0;
  cracks.children.forEach((c, k) => {
    const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
    m.opacity = visible ? 0.6 * crack : 0;
    c.position.set(fromX + p.side * reach * ((k + 0.5) / 9), 0.17, ((k * 7) % 5 - 2) * 1.2);
    c.scale.y = 2 + (k % 3) * 1.5;
  });
  // A glint on it once it's set: ride the slick.
  const set = p.lane === 1;
  shine.visible = set;
  if (set) {
    shine.position.set((fromX + frontX) / 2 + Math.sin(elapsed * 2) * p.radius * 0.6, 0.6, 0);
    ((shine as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.5 + 0.3 * Math.sin(elapsed * 7);
  }
}
