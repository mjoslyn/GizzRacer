import * as THREE from 'three';
import { seededRandom } from '../core/math';
import type { HazardPose } from '../items/hazards';
import { PISTON_LIFT, PISTON_RADIUS, PISTON_STAGES } from '../kits/cyboogie';
import type { PitDef } from '../tracks/builder';
import { PISTON_PERIOD } from '../tracks/cyboogie';
import { nearestOnSpline, pointAt } from '../tracks/spline';
import type { Ribbon, Track } from '../tracks/track';
import { glowTexture } from './textures';

/**
 * Cyboogie's world (the All Stars Cup #1's second): a ride through a
 * depressed cyborg who has lost his humanity, dark and synth red, chrome
 * and brine green, like the song's video (the band in red suits and white
 * helmets at their modular synths, a fishie face scrolling on every
 * screen, Stu's head in a black helmet, a mic dangling at it). Its
 * textures (the road's graphene lattice, the plating inside him, the brine
 * tanks of the cut's walls and the world's edge, the synth panels along the
 * road), its scenery by the part of him the road is passing through (his
 * dome: grey matter, brine tubes, augmented senses, bouncy balls; his
 * chest: pistons, knotted cables, pumps, test screens; the dance floor and
 * the brook: synth cabinets, the band, error screens, fishing rods, reeds
 * of optic fibre), its landmarks (the gate over the start, his helmeted
 * head in the dome with his grey matter in brine under its glass, his
 * heart of pistons and pumps with the cables knotted round it, the hook in
 * the bend of the brook with the line up into the sky, the binary brook
 * and its red-bellied trout, Han-Tyumi reciting it backwards, the bug in
 * the lattice) and its hazard's look (the pistons).
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
function fbm(w: number, h: number, basePeriod: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(w * h);
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const period = basePeriod << o;
    const rand = seededRandom(seed + o * 101);
    const grid = Float32Array.from({ length: period * period }, () => rand());
    for (let y = 0; y < h; y++) {
      const gy = (y / h) * period;
      const y0 = Math.floor(gy) % period;
      const y1 = (y0 + 1) % period;
      let ty = gy - Math.floor(gy);
      ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < w; x++) {
        const gx = (x / w) * period;
        const x0 = Math.floor(gx) % period;
        const x1 = (x0 + 1) % period;
        let tx = gx - Math.floor(gx);
        tx = tx * tx * (3 - 2 * tx);
        const a = grid[y0 * period + x0] + (grid[y0 * period + x1] - grid[y0 * period + x0]) * tx;
        const b = grid[y1 * period + x0] + (grid[y1 * period + x1] - grid[y1 * period + x0]) * tx;
        out[y * w + x] += (a + (b - a) * ty) * amp;
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

/** The video's synth red, its chrome, and the brine green in his dome. */
const RED = 0xe8182c;
const BRINE = 0x3affa0;
const CHROME = 0xd0d4dc;

/**
 * The honeycomb of the graphene lattice: a hexagon's centres, a cell `w`
 * across its flats, laid so the pattern repeats across a canvas 8 cells wide
 * and 4 periods (3 radii each) high, so it tiles.
 */
const HEX_W = 32;
const HEX_R = HEX_W / Math.sqrt(3);
const LATTICE_W = 8 * HEX_W;
const LATTICE_H = Math.round(4 * 3 * HEX_R);

/** Strokes the lattice's bonds (and its atoms, `dot` across) onto a canvas, wrapping round its edges. */
function strokeLattice(ctx: CanvasRenderingContext2D, bond: string, width: number, atom: string, dot: number): void {
  ctx.strokeStyle = bond;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  const atoms: [number, number][] = [];
  for (let row = -1; row <= 8; row++) {
    for (let col = -1; col <= 9; col++) {
      const cx = col * HEX_W + (row % 2 ? HEX_W / 2 : 0);
      const cy = row * 1.5 * HEX_R;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        const x = cx + Math.cos(a) * HEX_R;
        const y = cy + Math.sin(a) * HEX_R;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        if (k < 6) atoms.push([x, y]);
      }
      ctx.stroke();
    }
  }
  ctx.fillStyle = atom;
  for (const [x, y] of atoms) {
    ctx.beginPath();
    ctx.arc(x, y, dot / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The road: graphene, a lattice of carbon one atom thick laid over his
 * pistons and pumps. The texture spans half the road (u across, from the
 * edge to the middle; v along it): a pale chrome-grey honeycomb, its bonds
 * silver and its atoms bright, a sheen across it, a chrome band down the
 * edge and the synth red line down the middle. It stands well clear of
 * the dark brine-green plating either side.
 */
export function grapheneRoadTexture(): THREE.CanvasTexture {
  const W = LATTICE_W;
  const H = LATTICE_H;
  const [c, ctx] = canvas(W, H);
  const n = fbm(W, H, 4, 3, 7101);
  paint(ctx, W, H, (x, _y, i) => {
    const u = x / W;
    const sheen = Math.exp(-(((u - 0.45) / 0.22) ** 2));
    return shade(mix([108, 112, 124], [150, 154, 166], sheen), 0.88 + n[i] * 0.24);
  });
  strokeLattice(ctx, 'rgba(206,212,224,0.9)', 3.2, 'rgba(240,244,255,1)', 5);
  // Inside each cell, darker: the pistons glimpsed under the lattice.
  const rand = seededRandom(7102);
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = `rgba(40,40,52,${0.12 + rand() * 0.12})`;
    ctx.beginPath();
    ctx.arc(rand() * W, rand() * H, 4 + rand() * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // The chrome band down the edge, and the red line down the middle.
  ctx.fillStyle = 'rgba(226,230,238,1)';
  ctx.fillRect(0, 0, W * 0.05, H);
  ctx.fillStyle = 'rgba(70,72,84,1)';
  ctx.fillRect(W * 0.05, 0, 2, H);
  ctx.fillStyle = 'rgba(232,24,44,1)';
  for (let y = 0; y < H; y += H / 4) ctx.fillRect(W * 0.965, y, W * 0.035, H / 8);
  return finish(c);
}

/** The road's own light: the lattice's bonds lit faintly, its atoms brighter, and the red line down the middle glowing. */
export function grapheneGlowTexture(): THREE.CanvasTexture {
  const W = LATTICE_W;
  const H = LATTICE_H;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  // The lattice dimly lit all over, so it reads in the dark.
  ctx.fillStyle = 'rgba(44,46,54,1)';
  ctx.fillRect(0, 0, W, H);
  strokeLattice(ctx, 'rgba(90,96,110,1)', 3, 'rgba(160,170,190,1)', 5);
  ctx.fillStyle = 'rgba(120,124,136,1)';
  ctx.fillRect(0, 0, W * 0.05, H);
  ctx.fillStyle = 'rgba(255,40,60,1)';
  for (let y = 0; y < H; y += H / 4) ctx.fillRect(W * 0.965, y, W * 0.035, H / 8);
  return finish(c);
}

/** The ground inside him: dark plating in brine green and black, its seams, rivets and the faint traces of his circuitry. */
export function plateTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, S, 8, 4, 7111);
  const patch = fbm(S, S, 2, 3, 7112);
  paint(ctx, S, S, (_x, _y, i) => shade(mix([14, 30, 28], [30, 58, 50], patch[i]), 0.75 + n[i] * 0.5));
  const rand = seededRandom(7113);
  const P = 128;
  ctx.strokeStyle = 'rgba(4,10,10,0.9)';
  ctx.lineWidth = 3;
  for (let k = 0; k <= S; k += P) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k, S);
    ctx.moveTo(0, k);
    ctx.lineTo(S, k);
    ctx.stroke();
  }
  // Rivets at the plates' corners and along their seams.
  for (let x = 0; x < S; x += P / 4) {
    for (let y = 0; y < S; y += P) {
      for (const [a, b] of [
        [x + 6, y + 6],
        [y + 6, x + 6],
      ]) {
        ctx.fillStyle = 'rgba(120,150,140,0.5)';
        ctx.beginPath();
        ctx.arc(a, b, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Traces of circuitry, faintly lit brine green, turning at right angles.
  ctx.lineWidth = 1.6;
  for (let k = 0; k < 40; k++) {
    let x = Math.floor(rand() * 16) * 32;
    let y = Math.floor(rand() * 16) * 32;
    ctx.strokeStyle = `rgba(60,220,140,${0.12 + rand() * 0.2})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      if (rand() < 0.5) x += (rand() < 0.5 ? -1 : 1) * 32 * (1 + Math.floor(rand() * 3));
      else y += (rand() < 0.5 ? -1 : 1) * 32 * (1 + Math.floor(rand() * 3));
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(90,255,170,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/** The cut's walls and the world's edge: brine tanks, panes of glowing green brine in chrome frames, bubbles rising in them. */
export function brineTankTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, S, 4, 4, 7121);
  paint(ctx, S, S, (_x, y, i) => {
    const deep = y / S;
    return shade(mix([30, 170, 110], [10, 70, 60], deep), 0.8 + n[i] * 0.4);
  });
  const rand = seededRandom(7122);
  for (let k = 0; k < 160; k++) {
    const r = 1 + rand() * 3.5;
    ctx.strokeStyle = `rgba(200,255,230,${0.3 + rand() * 0.4})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(rand() * S, rand() * S, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The chrome frames: rails top and bottom, a post between panes.
  const chrome = (x: number, y: number, w: number, h: number) => {
    const g = ctx.createLinearGradient(x, y, x + (w < h ? w : 0), y + (w < h ? 0 : h));
    g.addColorStop(0, '#5a5e68');
    g.addColorStop(0.45, '#eef0f6');
    g.addColorStop(1, '#6a6e78');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  };
  chrome(0, 0, S, 22);
  chrome(0, S - 26, S, 26);
  chrome(0, 0, 12, S);
  chrome(S / 2 - 6, 0, 12, S);
  // A red lamp on each post.
  ctx.fillStyle = '#ff2a3a';
  for (const x of [6, S / 2]) {
    ctx.beginPath();
    ctx.arc(x, 11, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/** The barrier: a modular synth's panel, black, rows of knobs and jacks, a red stripe along the top, patch cables slung across. */
export function synthPanelTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#121216';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e8182c';
  ctx.fillRect(0, 0, W, 9);
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 9, W, 2);
  // Module seams.
  ctx.fillStyle = '#2a2a32';
  for (let x = 0; x < W; x += 64) ctx.fillRect(x, 11, 2, H - 11);
  const rand = seededRandom(7131);
  for (let x = 10; x < W; x += 16) {
    // A knob, white or red, its pointer.
    const red = rand() < 0.3;
    ctx.fillStyle = red ? '#e8182c' : '#e8e8ec';
    ctx.beginPath();
    ctx.arc(x, 24, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#121216';
    ctx.lineWidth = 1.5;
    const a = rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, 24);
    ctx.lineTo(x + Math.cos(a) * 4.5, 24 + Math.sin(a) * 4.5);
    ctx.stroke();
    // A jack below it.
    ctx.strokeStyle = '#b8bcc6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, 46, 3.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Patch cables between the jacks.
  for (let k = 0; k < 5; k++) {
    const a = 10 + Math.floor(rand() * 15) * 16;
    const b = Math.min(W - 6, a + 32 + Math.floor(rand() * 4) * 16);
    ctx.strokeStyle = ['#e8182c', '#ffd23a', '#f0f0f0', '#3affa0'][k % 4];
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(a, 46);
    ctx.quadraticCurveTo((a + b) / 2, 62, b, 46);
    ctx.stroke();
  }
  return finish(c);
}

/** The fishie face scrolling on the synths' screens in the video: big eyes and pouting lips, red on a black screen, two to a texture (scroll it along u). */
const fishieTexture = once(() => {
  const W = 256;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#060608';
  ctx.fillRect(0, 0, W, H);
  for (const cx of [W * 0.25, W * 0.75]) {
    const cy = H / 2;
    // The face.
    ctx.fillStyle = '#e8182c';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 50, 44, 0, 0, Math.PI * 2);
    ctx.fill();
    // Its fins.
    ctx.beginPath();
    ctx.moveTo(cx - 46, cy - 10);
    ctx.lineTo(cx - 62, cy - 30);
    ctx.lineTo(cx - 56, cy);
    ctx.fill();
    // Two big eyes.
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#f4f4f4';
      ctx.beginPath();
      ctx.arc(cx + s * 18, cy - 12, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#060608';
      ctx.beginPath();
      ctx.arc(cx + s * 18 + 3, cy - 10, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // The pout.
    ctx.fillStyle = '#ffd0d4';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 20, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#060608';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 20, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Scanlines.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1.5);
  return finish(c);
});

/** A screen of words, lit on black (a red error, green code). */
const screenFace = (() => {
  const made = new Map<string, THREE.CanvasTexture>();
  return (lines: string[], fg = '#ff2a3a', bg = '#060608'): THREE.CanvasTexture => {
    const key = `${lines.join('|')}|${fg}|${bg}`;
    let t = made.get(key);
    if (t) return t;
    const W = 512;
    const H = 256;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = lines.length === 1 ? 96 : lines.length === 2 ? 72 : 52;
    ctx.font = `bold ${size}px "Courier New", monospace`;
    lines.forEach((line, k) => {
      const w = ctx.measureText(line).width;
      ctx.save();
      ctx.translate(W / 2, H / 2 + (k - (lines.length - 1) / 2) * size * 1.1);
      if (w > W - 50) ctx.scale((W - 50) / w, 1);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
    t = finish(c, false);
    made.set(key, t);
    return t;
  };
})();

const glowTex = once(() => glowTexture());
const chrome = once(() => new THREE.MeshPhongMaterial({ color: CHROME, specular: 0xffffff, shininess: 110 }));
const darkChrome = once(() => new THREE.MeshPhongMaterial({ color: 0x5a5e6a, specular: 0xffffff, shininess: 90 }));
const black = once(() => new THREE.MeshPhongMaterial({ color: 0x0a0a0e, specular: 0x8a8aa0, shininess: 120 }));
const redLit = once(() => new THREE.MeshBasicMaterial({ color: RED }));
const suitRed = once(() => lambert(0xc0141e));
const helmetWhite = once(() => new THREE.MeshPhongMaterial({ color: 0xf2f2f4, specular: 0xffffff, shininess: 80 }));
/** Grey matter: pinkish grey, its folds traced in darker curls. */
const brainTexture = once(() => {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#c8a4ac';
  ctx.fillRect(0, 0, S, S);
  const rand = seededRandom(7171);
  ctx.lineCap = 'round';
  for (let k = 0; k < 70; k++) {
    let x = rand() * S;
    let y = rand() * S;
    let a = rand() * Math.PI * 2;
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(120,80,92,0.8)' : 'rgba(150,104,116,0.7)';
    ctx.lineWidth = 3 + rand() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 14; j++) {
      a += (rand() - 0.5) * 1.6;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(c);
});
const greyMatter = once(() => new THREE.MeshPhongMaterial({ map: brainTexture(), color: 0xffffff, specular: 0x6a4a50, shininess: 30, emissive: 0x2a1418 }));
const panel = once(() => new THREE.MeshLambertMaterial({ map: synthPanelTexture() }));
const brineGlass = once(() => new THREE.MeshPhongMaterial({ color: BRINE, emissive: 0x0a5a34, transparent: true, opacity: 0.45, shininess: 140, specular: 0xffffff, depthWrite: false }));

function sprite(color: number, size: number, opacity = 1, fog = true): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog }));
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

/** The boogie's beat, 0 to 1 through each beat: a sharp pump at the start of it. */
function pump(time: number): number {
  const beat = (time / (PISTON_PERIOD / 4)) % 1;
  return Math.exp(-beat * 6);
}

/** A screen showing the fishie face, `w` wide, scrolling. */
function fishieScreen(w: number, animated: Animated, speed = 0.12): THREE.Mesh {
  const map = fishieTexture().clone();
  map.needsUpdate = true;
  map.repeat.set(0.5, 1);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.5), new THREE.MeshBasicMaterial({ map }));
  const ph = Math.random();
  animated.push((time) => (map.offset.x = ph + time * speed));
  return screen;
}

/** A synth cabinet, `w` wide and `h` tall, its panels to the front (+z), a fishie screen on top of them. */
function synthCabinet(w: number, h: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.45), black());
  box.position.y = h / 2;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, h * 0.55), panel());
  face.position.set(0, h * 0.33, w * 0.226);
  const screen = fishieScreen(w * 0.7, animated);
  screen.position.set(0, h * 0.8, w * 0.227);
  g.add(box, face, screen);
  return g;
}

/** One of the band as in the video: a red suit and a white helmet, black visor, hands out to a synth. Its feet at the origin, facing +z. */
function bandFigure(h: number): THREE.Group {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(h * 0.22, h * 0.45, h * 0.14), suitRed());
  legs.position.y = h * 0.225;
  const body = new THREE.Mesh(new THREE.BoxGeometry(h * 0.3, h * 0.34, h * 0.18), suitRed());
  body.position.y = h * 0.62;
  const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.13, 14, 10), helmetWhite());
  head.position.y = h * 0.88;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(h * 0.105, 12, 8, Math.PI / 2 - 0.9, 1.8, 0.9, 0.9), black());
  visor.position.set(0, h * 0.88, h * 0.035);
  const arms = new THREE.Mesh(new THREE.BoxGeometry(h * 0.38, h * 0.07, h * 0.24), suitRed());
  arms.position.set(0, h * 0.66, h * 0.14);
  g.add(legs, body, head, visor, arms);
  return g;
}

/**
 * Which part of him the road is passing through, by the section of road
 * nearest: his dome (the brain), his chest (the heart and its pistons), or
 * the dance floor and the brook.
 */
export type Zone = 'brain' | 'chest' | 'brook';
const BRAIN = new Set(['Cyboogie', 'A Hunk of Grey Matter', 'Brine Fluid', 'Augmented Senses', 'Bouncy Ball Thoughts', 'Dance With the Devil']);
const CHEST = new Set(['His Heart Is a Mess', 'Cables in Knots', 'Feeling Depressed', 'Run Over the Tests', 'Pistons and Pumps', 'Breaks Down', 'Lump in His Throat']);
export function cyborgZones(track: Track): (x: number, z: number) => Zone {
  const secs = track.def.main.sections;
  return (x, z) => {
    const hit = nearestOnSpline(track.spline, x, z);
    const name = secs[track.main.sectionIndex[hit.index]].name;
    return BRAIN.has(name) ? 'brain' : CHEST.has(name) ? 'chest' : 'brook';
  };
}

/**
 * The scenery inside him, by where the road is. His dome: lumps of grey
 * matter with synapses glowing between them, tubes of brine with bubbles
 * rising, eyes on chrome stalks (augmented senses) looking about, bouncy
 * balls bouncing. His chest: pistons pumping on the beat, cables tied in
 * knots, pumps breathing, screens running over the tests. The dance floor
 * and the brook: the band's synth cabinets with the fishie face scrolling
 * on them, the band in red suits and white helmets playing, screens of
 * terminal errors, fishing rods with their lines out, reeds of optic fibre.
 */
export function cyborgFeature(animated: Animated, zone: (x: number, z: number) => Zone = () => 'brain'): Feature {
  const synapse = new THREE.MeshBasicMaterial({ color: BRINE, transparent: true, opacity: 0.7 });
  const node: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const size = 2.5 + rand() * 4;
    const n = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const lump = new THREE.Mesh(new THREE.SphereGeometry(size * (0.5 + rand() * 0.5), 14, 10), greyMatter());
      lump.position.set((rand() - 0.5) * size, size * (0.5 + rand() * 0.8), (rand() - 0.5) * size);
      t.add(lump);
    }
    // Synapses out of it, glowing, firing now and then.
    const fire = sprite(BRINE, size * 2.5, 0.4);
    fire.position.y = size;
    for (let k = 0; k < 3; k++) {
      const len = size * (1.5 + rand() * 2);
      const axon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, len, 4), synapse);
      axon.position.y = size;
      axon.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      axon.translateY(len / 2);
      t.add(axon);
    }
    t.add(fire);
    const ph = rand() * 10;
    animated.push((time) => (fire.material.opacity = 0.2 + 0.8 * Math.max(0, Math.sin(time * 2.3 + ph)) ** 8));
    return place(t, x, z, rand);
  };
  const tube: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 7 + rand() * 9;
    const r = 1 + rand() * 0.8;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14, 1, true), brineGlass());
    glass.position.y = h / 2 + 0.6;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.2, r * 1.3, 0.8, 14), chrome());
    base.position.y = 0.4;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.2, r * 1.1, 0.6, 14), chrome());
    cap.position.y = h + 0.9;
    const glow = sprite(BRINE, r * 6, 0.35);
    glow.position.y = h / 2;
    t.add(glass, base, cap, glow);
    const bubbles: THREE.Sprite[] = [];
    for (let k = 0; k < 5; k++) {
      const b = sprite(0xd0ffe8, 0.5 + rand() * 0.4, 0.8);
      b.userData.ph = rand();
      b.userData.x = (rand() - 0.5) * r;
      bubbles.push(b);
      t.add(b);
    }
    animated.push((time) => {
      for (const b of bubbles) {
        const u = (time * 0.25 + b.userData.ph) % 1;
        b.position.set(b.userData.x + 0.2 * Math.sin(time * 3 + b.userData.ph * 9), 1 + u * h, 0);
      }
    });
    return place(t, x, z, rand);
  };
  const eyeWhite = new THREE.MeshPhongMaterial({ color: 0xf4f4f0, shininess: 90, specular: 0xffffff });
  const sensor: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 4 + rand() * 5;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, h, 8), chrome());
    stalk.position.y = h / 2;
    const eye = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), eyeWhite);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), redLit());
    iris.position.z = 1.08;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.12, 6, 20), chrome());
    eye.add(ball, iris, ring);
    eye.position.y = h + 0.9;
    t.add(stalk, eye);
    const ph = rand() * 10;
    animated.push((time) => {
      eye.rotation.y = 1.2 * Math.sin(time * 0.4 + ph);
      eye.rotation.x = 0.3 * Math.sin(time * 0.7 + ph * 2);
    });
    return place(t, x, z, rand);
  };
  const BALLS = [RED, 0xf2f2f4, 0xffd23a, BRINE];
  const ballMats = BALLS.map((c) => new THREE.MeshPhongMaterial({ color: c, shininess: 120, specular: 0xffffff }));
  const ball: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 0.8 + rand() * 1.4;
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), ballMats[Math.floor(rand() * ballMats.length)]);
    t.add(b);
    const ph = rand();
    const high = 3 + rand() * 4;
    animated.push((time) => {
      const u = ((time / (PISTON_PERIOD / 2)) + ph) % 1;
      b.position.y = r + high * 4 * u * (1 - u);
      b.scale.set(1, u < 0.06 || u > 0.94 ? 0.8 : 1, 1);
    });
    return place(t, x, z, rand);
  };

  const piston: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 0.9 + rand() * 0.8;
    const h = 3 + rand() * 4;
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.3, r * 1.4, h, 16), darkChrome());
    sleeve.position.y = h / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.3, 0.12, 6, 20), redLit());
    ring.rotation.x = Math.PI / 2;
    ring.position.y = h;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, h, 12), chrome());
    const head = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.15, r * 1.15, 0.6, 16), chrome());
    t.add(sleeve, ring, rod, head);
    const ph = Math.floor(rand() * 4);
    animated.push((time) => {
      const lift = pump(time + (ph * PISTON_PERIOD) / 4) * h * 0.6;
      rod.position.y = h + lift - h / 2 + 0.3;
      head.position.y = h + lift + 0.3;
    });
    return place(t, x, z, rand);
  };
  const cable = [lambert(0x141418), lambert(0x9a0a14), lambert(0x2a2a30)];
  const knot: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 1.5 + rand() * 2;
    const k = new THREE.Mesh(new THREE.TorusKnotGeometry(r, r * 0.16, 64, 8, 2 + Math.floor(rand() * 2), 3), cable[Math.floor(rand() * cable.length)]);
    k.position.y = r * 1.3;
    k.rotation.set(rand() * 3, rand() * 3, 0);
    t.add(k);
    // A cable trailing off it along the ground.
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.16, r * 4, 6), cable[0]);
    tail.rotation.z = Math.PI / 2;
    tail.position.set(r * 2, r * 0.16, 0);
    t.add(tail);
    return place(t, x, z, rand);
  };
  const bellows: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 1.2 + rand();
    const folds = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.5, 14), k % 2 ? black() : darkChrome());
      f.position.y = 0.5 + k * 0.5;
      folds.add(f);
    }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.1, r * 1.1, 0.4, 14), chrome());
    const pipe = new THREE.Mesh(new THREE.TorusGeometry(r * 1.6, 0.25, 6, 16, Math.PI), chrome());
    pipe.position.set(r * 1.6, 0, 0);
    t.add(folds, top, pipe);
    const ph = rand() * 10;
    animated.push((time) => {
      const s = 0.75 + 0.35 * pump(time + ph);
      folds.scale.y = s;
      top.position.y = 0.5 + 3 * s + 0.2;
      pipe.position.y = top.position.y * 0.5;
    });
    return place(t, x, z, rand);
  };
  const TESTS = [
    ['RUN TESTS', '0 FAILED'],
    ['DE-BUG', '...'],
    ['TEST 01', 'PASS'],
    ['HEART', 'FAIL'],
  ];
  const testScreen: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 4 + rand() * 2;
    const lines = TESTS[Math.floor(rand() * TESTS.length)];
    const fail = lines[1] === 'FAIL';
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), new THREE.MeshBasicMaterial({ map: screenFace(lines, fail ? '#ff2a3a' : '#3affa0'), side: THREE.DoubleSide }));
    screen.position.y = 2.2 + w / 4;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, w / 2 + 0.4, 0.3), black());
    frame.position.set(0, screen.position.y, -0.18);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.2, 6), chrome());
    leg.position.y = 1.1;
    t.add(frame, screen, leg);
    return place(t, x, z, rand);
  };

  const cabinet: Feature = (x, z, rand) => {
    const t = synthCabinet(3 + rand() * 2, 3 + rand() * 3, animated);
    return place(t, x, z, rand);
  };
  const player: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const synth = synthCabinet(2.4, 1.6, animated);
    synth.position.z = 1.2;
    synth.rotation.y = Math.PI;
    const who = bandFigure(2.2 + rand() * 0.3);
    t.add(synth, who);
    const ph = rand() * 10;
    animated.push((time) => {
      // Bobbing to the boogie.
      who.position.y = 0.12 * pump(time + ph * 0.01);
      who.rotation.y = 0.15 * Math.sin(time * 1.6 + ph);
    });
    return place(t, x, z, rand);
  };
  const ERRORS = [['TERMINAL', 'ERROR'], ['CHOROPHOBIA'], ['ERROR 0x0', 'VASCULAR'], ['BOOGIE', 'BOOGIE']];
  const error: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 6 + rand() * 3;
    const lines = ERRORS[Math.floor(rand() * ERRORS.length)];
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), new THREE.MeshBasicMaterial({ map: screenFace(lines), side: THREE.DoubleSide }));
    screen.position.y = 3 + w / 4;
    const posts = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.4, 0.4), chrome());
    posts.position.y = 3 - 0.2;
    t.add(screen, posts);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), chrome());
      leg.position.set((s * w) / 2, 1.5, 0);
      t.add(leg);
    }
    const ph = rand() * 10;
    animated.push((time) => (screen.visible = Math.sin(time * 5 + ph) > -0.7));
    return place(t, x, z, rand);
  };
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe0e4ea });
  const rod: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const len = 7 + rand() * 4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, len, 6), black());
    pole.position.set(0, (len / 2) * Math.cos(0.7), (len / 2) * Math.sin(0.7));
    pole.rotation.x = 0.7;
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 10), chrome());
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0, 1.2, 0.8);
    const tip = new THREE.Vector3(0, len * Math.cos(0.7), len * Math.sin(0.7));
    const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(tip, new THREE.Vector3(0, tip.y * 0.3, tip.z + 3), new THREE.Vector3(0, 0, tip.z + 5)), 10, 0.03, 3), lineMat);
    const float = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), redLit());
    float.position.set(0, 0.2, tip.z + 5);
    t.add(pole, reel, line, float);
    const ph = rand() * 10;
    animated.push((time) => (float.position.y = 0.2 + 0.1 * Math.sin(time * 3 + ph)));
    return place(t, x, z, rand);
  };
  const fibre = new THREE.MeshBasicMaterial({ color: 0x2a6a5a });
  const reeds: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const tips: THREE.Sprite[] = [];
    for (let k = 0; k < 7; k++) {
      const h = 2 + rand() * 3;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, h, 4), fibre);
      const lean = (rand() - 0.5) * 0.5;
      const ox = (rand() - 0.5) * 2;
      const oz = (rand() - 0.5) * 2;
      stem.position.set(ox + Math.sin(lean) * h * 0.5, h / 2, oz);
      stem.rotation.z = -lean;
      const tip = sprite(rand() < 0.5 ? BRINE : RED, 0.7, 0.9);
      tip.position.set(ox + Math.sin(lean) * h, h, oz);
      t.add(stem, tip);
      tips.push(tip);
    }
    const ph = rand() * 10;
    animated.push((time) => tips.forEach((tp, k) => (tp.material.opacity = 0.5 + 0.5 * Math.sin(time * 2 + k + ph))));
    return place(t, x, z, rand);
  };

  return (x, z, rand) => {
    const where = zone(x, z);
    if (where === 'brain')
      return pick(rand, [
        [3.5, node],
        [2, tube],
        [1.5, sensor],
        [1.2, ball],
      ])(x, z, rand);
    if (where === 'chest')
      return pick(rand, [
        [3, piston],
        [2, knot],
        [1.5, bellows],
        [1.2, testScreen],
        [0.8, ball],
      ])(x, z, rand);
    return pick(rand, [
      [2.5, cabinet],
      [2, player],
      [1, error],
      [1.5, rod],
      [2, reeds],
    ])(x, z, rand);
  };
}

/** A black helmet like Stu's in the video, radius `r`, its middle at the origin, facing +z: a red slit of a visor, and a mic on a boom dangling at it. Returns it and the mic, to swing. */
function helmetHead(r: number): { group: THREE.Group; mic: THREE.Object3D; visor: THREE.Mesh } {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), black());
  shell.scale.set(1, 1.08, 1.05);
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(r * 1.02, 32, 8, Math.PI / 2 - 0.75, 1.5, Math.PI * 0.42, Math.PI * 0.14),
    new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.9 }),
  );
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, r * 0.04, 8, 48), chrome());
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -r * 0.55;
  g.add(shell, visor, rim);
  // The boom from the side of the helmet round to the front, and the mic hanging off it on its cable.
  const boom = new THREE.Mesh(new THREE.TorusGeometry(r * 1.15, r * 0.025, 6, 24, Math.PI / 2), darkChrome());
  boom.rotation.x = Math.PI / 2;
  boom.position.y = -r * 0.25;
  const mic = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.012, r * 0.012, r * 0.5, 4), black());
  cord.position.y = -r * 0.25;
  const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.07, r * 0.18, 4, 10), black());
  capsule.position.y = -r * 0.55;
  const grille = new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 10, 8), darkChrome());
  grille.position.y = -r * 0.42;
  mic.add(cord, capsule, grille);
  mic.position.set(0, -r * 0.25, r * 1.15);
  g.add(boom, mic);
  return { group: g, mic, visor };
}

/** The gate's words, in the video's red on black. */
const gateFace = once(() => screenFace(['CYBOOGIE'], '#ff2a3a', '#0a0a0e'));

/**
 * The start: two towers of the band's modular synth cabinets either side
 * of the road, the fishie face scrolling on their screens, a beam across
 * with CYBOOGIE lit red on it, and on the beam Stu's head in its black
 * helmet as in the video, disembodied, the mic dangling at it, bobbing to
 * the boogie, a band member in a red suit and white helmet at a synth
 * either side of him.
 */
export function cyboogieGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const H = 10;
  for (const side of [-1, 1]) {
    const tower = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const cab = synthCabinet(4.2, H / 3, animated);
      cab.position.y = (k * H) / 3;
      // Facing the karts coming in (-z), and those going away.
      cab.rotation.y = Math.PI;
      tower.add(cab);
      const back = synthCabinet(4.2, H / 3, animated);
      back.position.y = (k * H) / 3;
      tower.add(back);
    }
    tower.position.x = side * (hw + 2.2);
    g.add(tower);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 8.6, 1.6, 2), black());
  beam.position.y = H + 0.8;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 8.8, 0.3, 2.1), redLit());
  stripe.position.y = H + 1.7;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: gateFace() }));
  sign.position.set(0, H - 1.2, -1.05);
  sign.rotation.y = Math.PI;
  const signBack = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: gateFace() }));
  signBack.position.set(0, H - 1.2, 1.05);
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(14.4, 3.9, 2), black());
  signBoard.position.y = H - 1.2;
  g.add(beam, stripe, signBoard, sign, signBack);
  // Stu's head on the beam, facing the grid, the mic at his mouth; the band either side at their synths.
  const R = 3.4;
  const { group: head, mic } = helmetHead(R);
  head.position.y = H + 1.6 + R * 1.1;
  head.rotation.y = Math.PI;
  g.add(head);
  const glow = sprite(RED, 14, 0.35);
  glow.position.y = head.position.y;
  g.add(glow);
  const band: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const who = bandFigure(2.6);
    who.position.set(side * 7.5, H + 1.6, 0.6);
    who.rotation.y = Math.PI;
    const synth = synthCabinet(2.6, 1.5, animated);
    synth.position.set(side * 7.5, H + 1.6, -0.8);
    synth.rotation.y = Math.PI;
    g.add(who, synth);
    band.push(who);
  }
  animated.push((time) => {
    const p = pump(time);
    head.position.y = H + 1.6 + R * 1.1 + 0.25 * p;
    head.rotation.z = 0.08 * Math.sin((time * Math.PI * 2) / PISTON_PERIOD);
    mic.rotation.x = 0.12 * Math.sin(time * 2.1);
    band.forEach((b, k) => (b.position.y = H + 1.6 + 0.15 * pump(time + k * 0.25)));
    glow.material.opacity = 0.25 + 0.2 * p;
  });
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * His head, in the middle of the dome's loop: a black helmet the size of a
 * hill, as in the video, disembodied, its visor a slit of synth red, the
 * mic dangling at it on its boom; and its crown a dome of glass, his grey
 * matter inside it floating in green brine, bubbles rising through it and
 * the synapses flickering. The lap loops right round it. `lateral` off the
 * road at `s` (to the right is positive).
 */
export function cyborgHead(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const R = 17;
  const { group: head, mic, visor } = helmetHead(R);
  head.position.y = R * 1.15;
  g.add(head);
  // The glass dome on his crown, brine in it, and his grey matter.
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 0.82, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), brineGlass());
  dome.position.y = R * 1.15 + R * 0.5;
  const brain = new THREE.Group();
  const rand = seededRandom(7141);
  for (let k = 0; k < 14; k++) {
    const lump = new THREE.Mesh(new THREE.SphereGeometry(R * (0.14 + rand() * 0.1), 14, 10), greyMatter());
    const a = rand() * Math.PI * 2;
    const d = rand() * R * 0.45;
    lump.position.set(Math.cos(a) * d, R * (0.12 + rand() * 0.38), Math.sin(a) * d);
    brain.add(lump);
  }
  brain.position.y = dome.position.y;
  const glow = sprite(BRINE, R * 2.4, 0.4);
  glow.position.y = dome.position.y + R * 0.3;
  const bubbles: THREE.Sprite[] = [];
  for (let k = 0; k < 16; k++) {
    const b = sprite(0xd0ffe8, 0.8 + rand(), 0.8);
    b.userData = { ph: rand(), a: rand() * Math.PI * 2, d: rand() * R * 0.6 };
    bubbles.push(b);
    g.add(b);
  }
  const sparks: THREE.Sprite[] = [];
  for (let k = 0; k < 8; k++) {
    const sp = sprite(BRINE, 3, 0);
    sp.position.set((rand() - 0.5) * R, dome.position.y + R * (0.15 + rand() * 0.35), (rand() - 0.5) * R);
    sparks.push(sp);
    g.add(sp);
  }
  // A ring of chrome at his neck, where he was cut off.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.45, R * 0.55, R * 0.4, 24), darkChrome());
  neck.position.y = R * 0.2;
  const cables = new THREE.Mesh(new THREE.TorusGeometry(R * 0.5, R * 0.06, 8, 24), lambert(0x9a0a14));
  cables.rotation.x = Math.PI / 2;
  cables.position.y = R * 0.08;
  g.add(dome, brain, glow, neck, cables);
  animated.push((time) => {
    for (const b of bubbles) {
      const u = (time * 0.12 + b.userData.ph) % 1;
      b.position.set(Math.cos(b.userData.a) * b.userData.d, dome.position.y + u * R * 0.75, Math.sin(b.userData.a) * b.userData.d);
      b.material.opacity = 0.8 * Math.sin(u * Math.PI);
    }
    sparks.forEach((sp, k) => (sp.material.opacity = Math.max(0, Math.sin(time * 3.1 + k * 2.3)) ** 12));
    mic.rotation.x = 0.1 * Math.sin(time * 0.9);
    mic.rotation.z = 0.06 * Math.sin(time * 1.3);
    (visor.material as THREE.MeshBasicMaterial).opacity = 0.65 + 0.3 * pump(time);
    brain.rotation.y = time * 0.05;
  });
  g.position.set(at.x, 0, at.z);
  // Facing down the page, toward the start straight and his neck.
  g.rotation.y = 0;
  return g;
}

/**
 * His heart, in the knot: a mess, two chambers of red-lacquered steel
 * with chrome pipes out of them and pistons and pumps in it, pumping on the
 * boogie's beat, and the cables tied in knots round it, slowly turning;
 * its glow throbbing. `lateral` off the road at `s`.
 */
export function cyborgHeart(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const H = 12;
  const lacquer = new THREE.MeshPhongMaterial({ color: 0xa8101c, specular: 0xffc0c0, shininess: 90 });
  const heart = new THREE.Group();
  const left = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16), lacquer);
  left.position.set(-3, 0, 0);
  const right = new THREE.Mesh(new THREE.SphereGeometry(5.2, 24, 16), lacquer);
  right.position.set(3.2, -0.6, 0.4);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(5.6, 8, 20), lacquer);
  tip.rotation.z = Math.PI;
  tip.position.set(0, -5.5, 0);
  heart.add(left, right, tip);
  // The pipes out of the top.
  for (const [x, r, h] of [
    [-3, 1.4, 6],
    [0.5, 1.1, 7.5],
    [3.6, 0.9, 5],
  ]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), chrome());
    pipe.position.set(x, 4 + h / 2, 0);
    heart.add(pipe);
  }
  // Pistons through its walls, pumping.
  const rods: THREE.Mesh[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 10), chrome());
    rod.position.set(Math.cos(a) * 5.5, 0, Math.sin(a) * 5.5);
    rod.rotation.z = Math.PI / 2;
    rod.rotation.y = -a;
    rods.push(rod);
    heart.add(rod);
  }
  heart.position.y = H;
  g.add(heart);
  // The cables, in knots round it.
  const knots = [
    new THREE.Mesh(new THREE.TorusKnotGeometry(10, 0.7, 160, 8, 2, 3), lambert(0x141418)),
    new THREE.Mesh(new THREE.TorusKnotGeometry(11.5, 0.5, 160, 8, 3, 4), lambert(0xc0141e)),
  ];
  for (const k of knots) {
    k.position.y = H;
    g.add(k);
  }
  const glow = sprite(RED, 34, 0.4);
  glow.position.y = H;
  // A plinth of plating under it, and the cables running off it to the road.
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 2, 24), darkChrome());
  plinth.position.y = 1;
  g.add(glow, plinth);
  animated.push((time) => {
    const p = pump(time);
    heart.scale.setScalar(1 + 0.06 * p);
    rods.forEach((r, k) => (r.scale.y = 1 + 0.5 * pump(time + (k * PISTON_PERIOD) / 4)));
    knots[0].rotation.y = time * 0.2;
    knots[1].rotation.y = -time * 0.15;
    knots[1].rotation.x = 0.3 * Math.sin(time * 0.3);
    glow.material.opacity = 0.25 + 0.35 * p;
  });
  g.position.set(at.x, 0, at.z);
  return g;
}

/**
 * The hook through his cheek, in the bend of the brook: a fish hook of
 * chrome as tall as a tower standing in the bend's middle, its bend down in
 * the brook and its point and barb curling up on the barb's side of the
 * road (Pierced Through His Cheek), its shank up the line's side (Fishing
 * for Fishies) to the eye, and the line from the eye straight up into the
 * dark: the humans, fishing for him. It sways. `lateral` off the road at `s`.
 */
export function fishHook(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const at = offRoad(ribbon, s, lateral);
  const B = 12;
  const SHANK = 70;
  const steel = new THREE.MeshPhongMaterial({ color: 0xd8dce4, specular: 0xffffff, shininess: 140, emissive: 0x1a1a22 });
  // The hook in its own plane: x across, from the line's side (-x) to the barb's (+x); y up.
  const path = new THREE.CurvePath<THREE.Vector3>();
  path.add(new THREE.LineCurve3(new THREE.Vector3(-B, SHANK, 0), new THREE.Vector3(-B, B, 0)));
  const bend = new THREE.EllipseCurve(0, B, B, B, Math.PI, 2 * Math.PI, false, 0);
  const pts = bend.getPoints(24).map((p) => new THREE.Vector3(p.x, p.y, 0));
  for (let k = 1; k < pts.length; k++) path.add(new THREE.LineCurve3(pts[k - 1], pts[k]));
  path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(B, B, 0), new THREE.Vector3(B + 1, B * 2.2, 0), new THREE.Vector3(B - 2.5, B * 3, 0)));
  const hook = new THREE.Group();
  hook.add(new THREE.Mesh(new THREE.TubeGeometry(path, 120, 1.3, 10), steel));
  // The point and its barb.
  const point = new THREE.Mesh(new THREE.ConeGeometry(1.3, 5, 10), steel);
  point.position.set(B - 3.2, B * 3 + 1.8, 0);
  point.rotation.z = 0.5;
  const barb = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5, 8), steel);
  barb.position.set(B - 4.6, B * 3 - 2.2, 0);
  barb.rotation.z = Math.PI + 0.9;
  // The eye at the top of the shank, and the line up into the sky.
  const eye = new THREE.Mesh(new THREE.TorusGeometry(3, 0.9, 8, 20), steel);
  eye.position.set(-B, SHANK + 3, 0);
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 400, 4), new THREE.MeshBasicMaterial({ color: 0xe8ecf4, fog: false }));
  line.position.set(-B, SHANK + 6 + 200, 0);
  const glint = sprite(0xffffff, 8, 0.6);
  glint.position.set(B - 3, B * 3 + 3, 0);
  hook.add(point, barb, eye, line, glint);
  g.add(hook);
  animated.push((time) => {
    hook.rotation.z = 0.03 * Math.sin(time * 0.5);
    hook.position.y = 0.6 * Math.sin(time * 0.8);
    glint.material.opacity = 0.3 + 0.5 * Math.max(0, Math.sin(time * 1.7)) ** 6;
  });
  g.position.set(at.x, 0, at.z);
  // Its x across the road to the right (the road's right at `s` is (-tz, tx)), so the shank stands on the line's side and the point on the barb's.
  g.rotation.y = f.heading + Math.PI;
  return g;
}

/** The brook's water: binary flowing in it, ones and zeros, lit, on a dark green-blue current. */
const binaryTexture = once(() => {
  const W = 128;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  const n = fbm(W, H, 4, 3, 7151);
  paint(ctx, W, H, (_x, _y, i) => shade(mix([10, 60, 70], [30, 140, 130], n[i]), 0.9 + n[i] * 0.2));
  const rand = seededRandom(7152);
  ctx.font = 'bold 18px "Courier New", monospace';
  ctx.textAlign = 'center';
  for (let k = 0; k < 90; k++) {
    ctx.fillStyle = rand() < 0.25 ? 'rgba(255,60,80,0.85)' : 'rgba(170,255,220,0.8)';
    ctx.fillText(rand() < 0.5 ? '0' : '1', rand() * W, rand() * H);
  }
  return finish(c);
});

/**
 * The Binary Brook: a stream of binary, ones and zeros flowing in it, down
 * the outside of the road from `s` to `to` (spline units, the line down
 * and the hook's bend), and red-bellied trout leaping out of it in arcs and
 * back in, now and then.
 */
export function binaryBrook(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const W = 9;
  const out = (k: number) => -(ribbon.halfWidthAtS(k) + 9);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let n = 0;
  let v = 0;
  let last: { x: number; z: number } | null = null;
  for (let k = s; k <= to; k += 2) {
    const c = offRoad(ribbon, k, out(k));
    const p = pointAt(ribbon.spline, k);
    if (last) v += Math.hypot(c.x - last.x, c.z - last.z) / W;
    last = c;
    for (const side of [-1, 1]) {
      pos.push(c.x - p.tz * side * (W / 2), 0.12, c.z + p.tx * side * (W / 2));
      uv.push(side < 0 ? 0 : 1, v);
    }
    if (n > 0) idx.push(2 * n - 2, 2 * n - 1, 2 * n, 2 * n - 1, 2 * n + 1, 2 * n);
    n++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const map = binaryTexture().clone();
  map.needsUpdate = true;
  const water = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
  g.add(water);
  // Banks of chrome either side of it.
  const bankMat = darkChrome();
  for (let k = s; k <= to; k += 9) {
    const c = offRoad(ribbon, k, out(k));
    const p = pointAt(ribbon.spline, k);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), bankMat);
      post.position.set(c.x - p.tz * side * (W / 2 + 0.4), 0.3, c.z + p.tx * side * (W / 2 + 0.4));
      g.add(post);
    }
  }
  // Red-bellied trout leaping.
  const trout: { fish: THREE.Group; k: number; ph: number }[] = [];
  const silver = new THREE.MeshPhongMaterial({ color: 0x9aa8b8, specular: 0xffffff, shininess: 90 });
  const belly = new THREE.MeshPhongMaterial({ color: 0xe8182c, specular: 0xffffff, shininess: 60 });
  const rand = seededRandom(7153);
  for (let j = 0; j < 6; j++) {
    const fish = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), silver);
    body.scale.set(0.45, 0.55, 1.6);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.98, 12, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), belly);
    red.scale.set(0.45, 0.55, 1.5);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 4), silver);
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = -1.8;
    fish.add(body, red, tail);
    fish.visible = false;
    g.add(fish);
    trout.push({ fish, k: s + ((to - s) * (j + rand())) / 6, ph: rand() });
  }
  animated.push((time) => {
    map.offset.y = -time * 0.6;
    for (const t of trout) {
      const u = (time / 3.4 + t.ph) % 1;
      const leap = u < 0.3 ? u / 0.3 : -1;
      t.fish.visible = leap >= 0;
      if (!t.fish.visible) continue;
      const c = offRoad(ribbon, t.k, out(t.k));
      const p = pointAt(ribbon.spline, t.k);
      const along = (leap - 0.5) * 6;
      t.fish.position.set(c.x + p.tx * along, 0.2 + 4 * leap * (1 - leap) * 3, c.z + p.tz * along);
      t.fish.rotation.set(-(leap - 0.5) * 2, Math.atan2(p.tx, p.tz), 0);
    }
  });
  return g;
}

/** Han-Tyumi's words read forwards, and as he recites them: backwards. */
const HAN_TYUMI = 'Homo sapiens existed for 200,000 years. Yes. Their apex was dance. Yes. They left Africa dancing. Yes. Now the stars watch their silhouettes. Yes. Go forth. Yes. Dance with the devil. Cyboogie. Cyboogie. Yes. ';
const marquee = once(() => {
  const backwards = HAN_TYUMI.split('').reverse().join('');
  const W = 2048;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#060608';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffd23a';
  ctx.font = 'bold 40px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(backwards).width;
  ctx.save();
  ctx.scale(Math.min(1, (W - 20) / w), 1);
  ctx.fillText(backwards, 10, H / 2);
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  for (let x = 0; x < W; x += 4) ctx.fillRect(x, 0, 1, H);
  return finish(c);
});

/**
 * Han-Tyumi, the confused cyborg of Murder of the Universe, come back at
 * the end of the song: a towering figure in yellow (as Joey wore to recite
 * it in the video) with a cyborg's chrome head and a screen for a face,
 * standing off the dance floor reciting his message backwards (it runs
 * backwards across his face and the marquee beside him): their apex was
 * dance; go forth, dance with the devil. He dances, stiffly. `lateral` off
 * the road at `s` (well off it, when that's 0).
 */
export function hanTyumi(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const side = Math.sign(lateral) || -1;
  const off = lateral || -(ribbon.halfWidthAtS(s) + 26);
  const at = offRoad(ribbon, s, off);
  const H = 30;
  const yellow = new THREE.MeshLambertMaterial({ color: 0xf2c218 });
  const body = new THREE.Group();
  const legs = [-1, 1].map((k) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(H * 0.1, H * 0.42, H * 0.1), yellow);
    leg.geometry.translate(0, -H * 0.21, 0);
    leg.position.set(k * H * 0.08, H * 0.44, 0);
    body.add(leg);
    return leg;
  });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(H * 0.32, H * 0.3, H * 0.16), yellow);
  torso.position.y = H * 0.6;
  const arms = [-1, 1].map((k) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(H * 0.07, H * 0.32, H * 0.07), yellow);
    arm.geometry.translate(0, -H * 0.15, 0);
    arm.position.set(k * H * 0.2, H * 0.72, 0);
    body.add(arm);
    return arm;
  });
  const head = new THREE.Mesh(new THREE.BoxGeometry(H * 0.2, H * 0.18, H * 0.18), chrome());
  head.position.y = H * 0.86;
  const faceMap = marquee().clone();
  faceMap.needsUpdate = true;
  faceMap.repeat.set(0.12, 1);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(H * 0.17, H * 0.1), new THREE.MeshBasicMaterial({ map: faceMap }));
  face.position.set(0, H * 0.86, H * 0.091);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, H * 0.1, 6), chrome());
  antenna.position.set(H * 0.06, H * 1.0, 0);
  const bulb = sprite(RED, 3, 0.9);
  bulb.position.set(H * 0.06, H * 1.05, 0);
  body.add(torso, head, face, antenna, bulb);
  g.add(body);
  // The marquee beside him, running his message backwards.
  const runMap = marquee().clone();
  runMap.needsUpdate = true;
  runMap.repeat.set(0.25, 1);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(36, 3), new THREE.MeshBasicMaterial({ map: runMap, side: THREE.DoubleSide }));
  board.position.set(0, H * 1.18, 0);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(37, 3.6, 0.6), black());
  frame.position.set(0, H * 1.18, -0.4);
  g.add(frame, board);
  const glow = sprite(0xffd23a, H * 1.2, 0.18);
  glow.position.y = H * 0.6;
  g.add(glow);
  animated.push((time) => {
    // Stiff steps on the beat: weight from one foot to the other, arms out and in.
    const beat = (time / (PISTON_PERIOD / 2)) % 2;
    const step = beat < 1 ? 1 : -1;
    body.position.x = step * 0.6;
    body.rotation.z = step * 0.04;
    legs[0].rotation.x = step * 0.2;
    legs[1].rotation.x = -step * 0.2;
    arms[0].rotation.z = -0.4 - 0.5 * pump(time);
    arms[1].rotation.z = 0.4 + 0.5 * pump(time + PISTON_PERIOD / 8);
    // Backwards, as he recites it.
    faceMap.offset.x = 1 - ((time * 0.04) % 1);
    runMap.offset.x = 1 - ((time * 0.02) % 1);
    bulb.material.opacity = 0.4 + 0.6 * pump(time);
  });
  g.position.set(at.x, Math.max(0, ribbon.heightAt(s)), at.z);
  // Facing the road.
  g.rotation.y = at.heading + side * (Math.PI / 2);
  return g;
}

/** The bug's sign. */
const debugFace = once(() => screenFace(['DE-BUG'], '#3affa0'));

/**
 * De-bug's bug: where a cell of the lattice has burnt out, a hole through
 * the road, its broken bonds sparking red round the rim, and the bug itself
 * (a chrome beetle, red-eyed) scuttling round it; on the final lap a patch
 * of fresh graphene lies over it (the branch's road), on the others there's
 * only the hole. A sign at its near lip. Stands over the pit `pits` holds by
 * the branch at `s`.
 */
export function debugLane(ribbon: Ribbon, s: number, pits: readonly PitDef[], animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const pit = pits.reduce((best, p) => (Math.hypot(p.x - f.x, p.z - f.z) < Math.hypot(best.x - f.x, best.z - f.z) ? p : best), pits[0]);
  if (!pit) return g;
  const L = pit.halfLength;
  const W = pit.halfWidth + 0.4;
  // The burnt bonds round the rim: chrome stubs, their ends glowing red.
  const rand = seededRandom(7161);
  const embers: THREE.Sprite[] = [];
  for (let k = 0; k < 18; k++) {
    const u = k / 18;
    const per = 4 * (L + W);
    let d = u * per;
    let x: number;
    let z: number;
    if (d < 2 * W) [x, z] = [-W + d, -L];
    else if ((d -= 2 * W) < 2 * L) [x, z] = [W, -L + d];
    else if ((d -= 2 * L) < 2 * W) [x, z] = [W - d, L];
    else [x, z] = [-W, L - (d - 2 * W)];
    const stub = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 1.6 + rand()), darkChrome());
    stub.position.set(x, 0.15, z);
    stub.rotation.y = rand() * Math.PI;
    const ember = sprite(RED, 1.4, 0.8);
    ember.position.set(x, 0.4, z);
    g.add(stub, ember);
    embers.push(ember);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 2 * L), new THREE.MeshBasicMaterial({ color: 0x050308 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -pit.depth + 0.5;
  const glow = sprite(RED, 2 * L, 0.25);
  glow.position.y = -pit.depth * 0.5;
  g.add(floor, glow);
  // The bug: a chrome beetle with red eyes and six legs, scuttling round the rim.
  const bug = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.2, 14, 10), darkChrome());
  shell.scale.set(0.8, 0.5, 1.2);
  const eyes = [-1, 1].map((k) => {
    const e = sprite(RED, 0.8, 1);
    e.position.set(k * 0.35, 0.25, 1.35);
    return e;
  });
  bug.add(shell, ...eyes);
  const legs: THREE.Mesh[] = [];
  for (let k = 0; k < 6; k++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 4), black());
    leg.position.set((k % 2 ? 1 : -1) * 0.9, -0.1, (Math.floor(k / 2) - 1) * 0.6);
    leg.rotation.z = (k % 2 ? -1 : 1) * 1.1;
    bug.add(leg);
    legs.push(leg);
  }
  bug.position.y = 0.6;
  g.add(bug);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: debugFace(), side: THREE.DoubleSide }));
  sign.position.set(-W - 4, 4, -L - 2);
  sign.rotation.y = Math.PI;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), chrome());
  post.position.set(-W - 4, 1.4, -L - 2);
  g.add(sign, post);
  animated.push((time) => {
    embers.forEach((e, k) => (e.material.opacity = 0.4 + 0.6 * Math.max(0, Math.sin(time * 9 + k * 1.7))));
    // Round the rim, an ellipse round the hole.
    const a = time * 0.6;
    bug.position.set(Math.cos(a) * (W + 1.5), 0.6, Math.sin(a) * (L + 1.5));
    bug.rotation.y = -a;
    legs.forEach((l, k) => (l.rotation.x = 0.4 * Math.sin(time * 18 + k)));
  });
  g.position.set(pit.x, Math.max(0, f.y), pit.z);
  g.rotation.y = pit.heading;
  return g;
}

/**
 * A piston, the hazard's look: a ring of synth red flush in the road where
 * it sits (glowing as it hisses), the chrome rod and the head on it, its
 * top cut in red and white like a synth's key, and the steam it hisses.
 */
export function pistonParts(obj: THREE.Object3D): THREE.Object3D[] {
  const R = PISTON_RADIUS;
  const ring = new THREE.Mesh(new THREE.RingGeometry(R + 0.05, R + 0.7, 32), new THREE.MeshBasicMaterial({ color: RED, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(R + 0.05, 32), new THREE.MeshBasicMaterial({ color: 0x08080a }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.04;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.45, R * 0.45, 1, 16), chrome());
  const head = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.5, 32), chrome());
  disc.position.y = -0.25;
  const cap = new THREE.Mesh(new THREE.CircleGeometry(R * 0.86, 32), new THREE.MeshBasicMaterial({ map: pistonCap() }));
  cap.rotation.x = -Math.PI / 2;
  cap.position.y = 0.01;
  head.add(disc, cap);
  const warn = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: RED, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  warn.scale.set(R * 3.4, R * 1.4, 1);
  warn.position.y = 0.6;
  const steam = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xe8f0f0, transparent: true, depthWrite: false, opacity: 0 }));
    steam.add(puff);
  }
  obj.add(hole, ring, rod, head, warn, steam);
  return [ring, rod, head, warn, steam];
}

/** A piston's cap: the top of a synth key, a red disc with a white ring and a dot, as if to press. */
const pistonCap = once(() => {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#e8182c';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#f4f4f4';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#f4f4f4';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.1, 0, Math.PI * 2);
  ctx.fill();
  return finish(c, false);
});

/** Poses a piston's parts (from pistonParts) for its stroke: the head up as far as it stands, the ring glowing as it hisses, steam out round it. */
export function posePiston(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [ring, rod, head, warn, steam] = parts;
  obj.position.set(p.x, p.ground, p.z);
  obj.rotation.y = p.heading;
  const lift = p.gap * PISTON_LIFT;
  head.position.y = 0.12 + lift;
  rod.visible = lift > 0.05;
  rod.scale.y = Math.max(0.01, lift);
  rod.position.y = lift / 2;
  const P = PISTON_STAGES;
  const hissing = p.phase >= P.warn;
  const pumping = p.phase < P.top + 0.06;
  const u = hissing ? (p.phase - P.warn) / (1 - P.warn) : 0;
  ((ring as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(hissing || p.active ? RED : 0x701018);
  ((warn as THREE.Sprite).material as THREE.SpriteMaterial).opacity = hissing ? (0.3 + 0.5 * u) * (0.7 + 0.3 * Math.sin(elapsed * 40)) : p.active ? 0.35 : 0;
  // A tremble as it hisses.
  if (hissing) head.position.y += 0.04 * Math.sin(elapsed * 60);
  steam.children.forEach((puff, k) => {
    const a = (k / steam.children.length) * Math.PI * 2 + elapsed * 0.7;
    const v = hissing ? u : pumping ? 1 - (p.phase / (P.top + 0.06)) * 0.5 : 0;
    const r = PISTON_RADIUS + 0.5 + v * 1.5;
    puff.position.set(Math.cos(a) * r, 0.5 + v * 2, Math.sin(a) * r);
    puff.scale.setScalar(1.4 + v * 2.2);
    ((puff as THREE.Sprite).material as THREE.SpriteMaterial).opacity = v > 0 ? 0.45 * Math.min(1, v * 2) : 0;
  });
}
