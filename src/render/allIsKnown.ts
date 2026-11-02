import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { SWEEP_DEPTH, SWEEP_HALF, SWEEP_STAGES, SWEEP_WAKE, type HazardPose } from '../items/hazards';
import type { PitDef } from '../tracks/builder';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import { glowTexture } from './textures';

/**
 * All Is Known's world, the Gumboot Soup Cup's third: the machine's, where
 * everything is known. A circuit board the size of a city under a black
 * sky, cold cyan light, white and steel; data running down the traces of
 * the road; the empty, swept streets of the people it replaced, their old
 * technology piled up, weeds coming through; and the king's eye, cut out,
 * wired in and augmented to a fourth cone, watching from its mast. Its
 * textures (the circuit road and the pulses running down it, the board,
 * the server racks of the walls, the steel rails), its scenery (chips,
 * capacitors, server racks, masts with cameras, empty houses, old
 * computers, weeds), its landmarks (the gate, the paint dissolving, the
 * synapse, the mainframe, the via pads, the steel bone, the king's eye,
 * the bare trace of the shortcut) and its hazard's look (the street
 * sweepers).
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
  // Three clamps this to what the card can do.
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
const css = ([r, g, b]: RGB, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

/** The machine's cold cyan, its white, the black of the board, and steel. */
const CYAN: RGB = [70, 236, 255];
const CYAN_HEX = 0x46ecff;
const WHITE_HEX = 0xeefcff;
const BOARD: RGB = [9, 12, 16];
const STEEL_HEX = 0x9aa6b4;
/** The king's eye, augmented: red, green and blue cones, and the fourth, ultraviolet. */
const CONES = ['#ff3048', '#30ff78', '#3a6aff', '#c040ff'];

/**
 * The traces down the road, in the road texture's half (u across 0..1, y
 * down the canvas): each straight, with a jog over and back at 45 degrees
 * somewhere down the tile, as a board's traces run. Shared by the road and
 * the pulses that run down it, so the pulses keep to the traces.
 */
function traces(S: number): [number, number][][] {
  const lanes = [0.2, 0.36, 0.52, 0.68, 0.84];
  return lanes.map((u, k) => {
    const x = u * S;
    const jog = (k % 2 ? -1 : 1) * S * 0.06;
    const y0 = S * (0.15 + 0.17 * k);
    const d = Math.abs(jog);
    return [
      [x, 0],
      [x, y0],
      [x + jog, y0 + d],
      [x + jog, y0 + d + S * 0.22],
      [x, y0 + 2 * d + S * 0.22],
      [x, S],
    ];
  });
}

function strokePath(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  ctx.beginPath();
  pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

/**
 * The road: a circuit board's solder mask, near black, the traces running
 * down it lit cyan, pads and vias along them, the board's white markings
 * (a component's outline, its number, an arrow the way the data goes), and
 * a bright bus line down each edge of the half (the road's edges and its
 * middle). The texture spans half the road, u across and v along.
 */
export function circuitRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7101);
  paint(ctx, S, S, (_x, _y, i) => mix([10, 14, 20], [22, 30, 38], n[i]));
  const paths = traces(S);
  // The traces: a dark copper bed, lit along the middle.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(30,70,84,1)';
  ctx.lineWidth = 9;
  for (const p of paths) strokePath(ctx, p);
  ctx.strokeStyle = css(mix(CYAN, [20, 60, 70], 0.45));
  ctx.lineWidth = 3.5;
  for (const p of paths) strokePath(ctx, p);
  // Vias: a ring and a hole, on the traces' jogs.
  for (const p of paths) {
    for (const [x, y] of [p[1], p[4]]) {
      ctx.fillStyle = 'rgba(150,200,210,1)';
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#05070a';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // The board's white markings: a component's outline and its number, and arrows the way the data runs.
  ctx.strokeStyle = 'rgba(220,236,240,0.55)';
  ctx.fillStyle = 'rgba(220,236,240,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(S * 0.42, S * 0.04, S * 0.2, S * 0.07);
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('U7', S * 0.28, S * 0.95);
  for (const y of [S * 0.3, S * 0.8]) {
    ctx.beginPath();
    ctx.moveTo(S * 0.6, y);
    ctx.lineTo(S * 0.64, y + 10);
    ctx.lineTo(S * 0.56, y + 10);
    ctx.closePath();
    ctx.fill();
  }
  // The bus line down the edge of the half: the road's edges and its middle.
  ctx.fillStyle = css(mix(CYAN, [255, 255, 255], 0.35));
  ctx.fillRect(0, 0, 7, S);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(0, 0, 3, S);
  return finish(c);
}

/**
 * The data running down the road: black but for pulses of light along the
 * traces and the bus lines, each a bright head and a fading tail behind
 * it. The road's emissive map, scrolled along it (trackView.ts), so the
 * data flows the way the karts go.
 */
export function circuitGlowTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, S, S);
  // A dim glow along every trace, so the road reads in the dark.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20,90,104,1)';
  ctx.lineWidth = 3;
  const paths = traces(S);
  for (const p of paths) strokePath(ctx, p);
  ctx.fillStyle = 'rgba(40,140,160,1)';
  ctx.fillRect(0, 0, 4, S);
  // Pulses: up the canvas is forward along the road; a head and a tail trailing back down.
  const rand = seededRandom(7111);
  const pulse = (x: number, y: number, len: number) => {
    const g = ctx.createLinearGradient(x, y, x, y + len);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.15, css(CYAN));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 2.5, y, 5, len);
  };
  for (const p of paths) {
    // On the straight runs of each trace (clear of its jog).
    const x = p[0][0];
    for (const y of [rand() * p[1][1] * 0.6, p[4][1] + rand() * (S - p[4][1]) * 0.5]) pulse(x, y, 28 + rand() * 20);
  }
  pulse(2, rand() * S * 0.5, 60);
  return finish(c);
}

/** The ground: the board itself, black, its traces dim, pads, the outlines of its parts in faded white. */
export function boardTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7121);
  paint(ctx, S, S, (_x, _y, i) => mix(BOARD, [20, 26, 32], n[i]));
  const rand = seededRandom(7122);
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  // Traces in runs of right angles and 45s, wrapping round the tile's edges.
  for (let k = 0; k < 26; k++) {
    let x = Math.floor(rand() * 32) * 16;
    let y = Math.floor(rand() * 32) * 16;
    ctx.strokeStyle = k % 5 === 0 ? 'rgba(70,200,220,0.55)' : 'rgba(40,110,124,0.6)';
    ctx.lineWidth = k % 4 === 0 ? 5 : 2.5;
    const steps = 3 + Math.floor(rand() * 4);
    for (let j = 0; j < steps; j++) {
      const dir = Math.floor(rand() * 8);
      const len = 32 + Math.floor(rand() * 6) * 16;
      const dx = [1, 1, 0, -1, -1, -1, 0, 1][dir];
      const dy = [0, 1, 1, 1, 0, -1, -1, -1][dir];
      for (const ox of [-S, 0, S]) {
        for (const oy of [-S, 0, S]) {
          ctx.beginPath();
          ctx.moveTo(x + ox, y + oy);
          ctx.lineTo(x + ox + dx * len, y + oy + dy * len);
          ctx.stroke();
        }
      }
      x = (((x + dx * len) % S) + S) % S;
      y = (((y + dy * len) % S) + S) % S;
      ctx.fillStyle = 'rgba(120,170,180,0.8)';
      ctx.beginPath();
      ctx.arc(x, y, ctx.lineWidth + 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Parts' outlines and their numbers.
  ctx.strokeStyle = 'rgba(200,220,226,0.28)';
  ctx.fillStyle = 'rgba(200,220,226,0.32)';
  ctx.lineWidth = 2;
  ctx.font = 'bold 16px monospace';
  for (let k = 0; k < 9; k++) {
    const x = rand() * (S - 90);
    const y = rand() * (S - 60);
    const w = 30 + rand() * 60;
    const h = 20 + rand() * 30;
    ctx.strokeRect(x, y, w, h);
    ctx.fillText(['U', 'R', 'C', 'Q', 'D'][k % 5] + (1 + Math.floor(rand() * 64)), x + 2, y - 4);
  }
  return finish(c);
}

/** The walls (a sunk cutting's, the world's edge): server racks, panel on panel, rows of little lights, vents. */
export function rackTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 3, 7131);
  paint(ctx, S, S, (_x, _y, i) => mix([16, 18, 22], [34, 38, 44], n[i]));
  const rand = seededRandom(7132);
  for (let y = 0; y < S; y += 32) {
    // Each unit: its face, a seam, a vent, and its lights.
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, y, S, 2);
    ctx.fillStyle = 'rgba(60,66,74,1)';
    for (let x = 140; x < 240; x += 6) ctx.fillRect(x, y + 8, 3, 16);
    for (let x = 12; x < 120; x += 10) {
      const r = rand();
      ctx.fillStyle = r < 0.55 ? css(CYAN) : r < 0.75 ? '#e8fcff' : r < 0.8 ? '#ffb030' : '#0a2a30';
      ctx.fillRect(x, y + 14, 5, 4);
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, 3, S);
  ctx.fillRect(S / 2, 0, 3, S);
  return finish(c);
}

/** The rails: brushed steel, a cyan light strip along it, and dark ticks like a bus's pins. */
export function railTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  const n = fbm(W, 8, 3, 7141);
  paint(ctx, W, H, (x, y) => {
    const v = n[(y % W) * W + x];
    return mix([120, 128, 140], [176, 184, 196], v * 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(y * 1.7)));
  });
  ctx.fillStyle = css(CYAN);
  ctx.fillRect(0, H * 0.36, W, H * 0.14);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(0, H * 0.41, W, H * 0.04);
  ctx.fillStyle = 'rgba(20,24,30,0.85)';
  for (let x = 4; x < W; x += 16) ctx.fillRect(x, H * 0.62, 6, H * 0.2);
  return finish(c);
}

const glowTex = once(() => glowTexture());
const cyanLight = once(() => new THREE.MeshBasicMaterial({ color: CYAN_HEX }));
const whiteLight = once(() => new THREE.MeshBasicMaterial({ color: WHITE_HEX }));
const steelMat = once(() => new THREE.MeshPhongMaterial({ color: STEEL_HEX, specular: 0xdde8ff, shininess: 60 }));
const blackMat = once(() => new THREE.MeshPhongMaterial({ color: 0x0c0e12, specular: 0x4a5a6a, shininess: 40 }));
const rackMat = once(() => {
  const map = rackTexture();
  return new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.6 });
});

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

/** Where a landmark `lateral` metres to the right of the road at `s` stands. */
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

/** A face of words: cyan on black, a thin frame, as the machine writes. */
const signFace = (() => {
  const made = new Map<string, THREE.CanvasTexture>();
  return (lines: string[]): THREE.CanvasTexture => {
    const key = lines.join('|');
    let t = made.get(key);
    if (t) return t;
    const W = 512;
    const H = 128;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = '#04070a';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = css(CYAN);
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.fillStyle = css(mix(CYAN, [255, 255, 255], 0.5));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = lines.length === 1 ? 64 : 42;
    ctx.font = `bold ${size}px monospace`;
    lines.forEach((line, k) => {
      const w = ctx.measureText(line).width;
      ctx.save();
      ctx.translate(W / 2, H / 2 + (k - (lines.length - 1) / 2) * size * 1.1);
      if (w > W - 40) ctx.scale((W - 40) / w, 1);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
    t = finish(c, false);
    made.set(key, t);
    return t;
  };
})();

/** A sign `w` wide (a quarter as high), its words on both faces. */
function signPanel(w: number, map: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, w / 4);
  for (const back of [false, true]) {
    const face = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map }));
    face.rotation.y = back ? 0 : Math.PI;
    face.position.z = back ? 0.16 : -0.16;
    g.add(face);
  }
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, w / 4 + 0.3, 0.26), blackMat()));
  return g;
}

/** A server rack, `h` tall: its lights on its faces. Its foot at the origin. */
function rackFigure(w: number, h: number, d: number): THREE.Mesh {
  const map = rackMat().map!.clone();
  map.needsUpdate = true;
  map.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3)));
  const mat = new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.6 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = h / 2;
  return m;
}

/**
 * The machine's world off the road: chips the size of buildings with
 * their pins in rows, capacitors, server racks with their lights going,
 * masts of cameras watching the road, the empty houses of the swept
 * streets (scanned, marked, nobody home), heaps of old technology (beige
 * boxes, their screens dead), and the vermin weed coming up through it all.
 */
export function networkFeature(animated: Animated): Feature {
  const pinMat = steelMat();
  const chip: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 6 + rand() * 8;
    const d = 5 + rand() * 6;
    const h = 1.2 + rand() * 1.4;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), blackMat());
    body.position.y = h / 2 + 0.6;
    t.add(body);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), whiteLight());
    dot.rotation.x = -Math.PI / 2;
    dot.position.set(-w / 2 + 0.9, h + 0.61, -d / 2 + 0.9);
    t.add(dot);
    // Its pins down both long sides, bent to the board.
    const pins = Math.floor(w / 1.2);
    const pinGeo = new THREE.BoxGeometry(0.3, 0.9, 1.4);
    for (const side of [-1, 1]) {
      for (let k = 0; k < pins; k++) {
        const pin = new THREE.Mesh(pinGeo, pinMat);
        pin.position.set(-w / 2 + 0.6 + (k * (w - 1.2)) / Math.max(1, pins - 1), 0.45, side * (d / 2 + 0.5));
        t.add(pin);
      }
    }
    if (rand() < 0.5) {
      const led = sprite(CYAN_HEX, 1.4);
      led.position.set(w / 2 - 1, h + 0.9, d / 2 - 1);
      t.add(led);
      const ph = rand() * 3;
      animated.push((time) => (led.visible = (time + ph) % 1.3 < 0.9));
    }
    return place(t, x, z, rand);
  };
  const sleeve = lambert(0x18405a);
  const cap: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 1 + rand() * 1.4;
    const h = 3 + rand() * 4;
    const can = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), sleeve);
    can.position.y = h / 2;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, h * 0.9, 20, 1, true, 0, 0.7), lambert(0xd8e4ea));
    stripe.position.y = h / 2;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.96, r * 0.96, 0.12, 20), pinMat);
    top.position.y = h + 0.06;
    for (const a of [0, Math.PI / 2]) {
      const score = new THREE.Mesh(new THREE.BoxGeometry(r * 1.6, 0.05, 0.12), blackMat());
      score.rotation.y = a;
      score.position.y = h + 0.14;
      t.add(score);
    }
    t.add(can, stripe, top);
    return place(t, x, z, rand);
  };
  const rack: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 1 + Math.floor(rand() * 3);
    const h = 5 + rand() * 6;
    for (let k = 0; k < n; k++) {
      const r = rackFigure(2.4, h, 1.6);
      r.position.x = k * 2.5;
      t.add(r);
    }
    return place(t, x, z, rand);
  };
  const mast: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 9 + rand() * 6;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, h, 8), pinMat);
    pole.position.y = h / 2;
    const head = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 1.6), lambert(0xe8eef2));
    const lens = sprite(CYAN_HEX, 1.1);
    lens.position.z = 0.95;
    head.add(box, lens);
    head.position.y = h;
    t.add(pole, head);
    const sp = 0.3 + rand() * 0.4;
    const ph = rand() * 6;
    // Watching: turning slowly one way and back.
    animated.push((time) => (head.rotation.y = Math.sin(time * sp + ph) * 1.4));
    return place(t, x, z, rand);
  };
  const wallMat = lambert(0x6a6e74);
  const roofMat = lambert(0x2a2e34);
  const dark = new THREE.MeshBasicMaterial({ color: 0x020304 });
  const house: Feature = (x, z, rand) => {
    // An empty house on a swept street: dark windows, its door open, the machine's mark across it.
    const t = new THREE.Group();
    const w = 7 + rand() * 3;
    const h = 4 + rand() * 2;
    const d = 7;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    walls.position.y = h / 2;
    const roofGeo = new THREE.ConeGeometry(Math.SQRT1_2 + 0.06, 3, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.scale.set(w, 1, d);
    roof.position.y = h + 1.5;
    t.add(walls, roof);
    for (const side of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), dark);
      win.position.set(side * w * 0.25, h * 0.62, d / 2 + 0.02);
      t.add(win);
    }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), dark);
    door.position.set(0, 1.1, d / 2 + 0.02);
    // The mark: a cyan cross, scanned and done.
    const mark = new THREE.Group();
    for (const a of [0.8, -0.8]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.3), cyanLight());
      bar.rotation.z = a;
      mark.add(bar);
    }
    mark.position.set(0, h * 0.5, d / 2 + 0.05);
    t.add(door, mark);
    return place(t, x, z, rand);
  };
  const beige = lambert(0xc8bc9a);
  const deadScreen = lambert(0x1a1e1c);
  const oldTech: Feature = (x, z, rand) => {
    // A heap of old technology: beige computers and their monitors, dead.
    const t = new THREE.Group();
    const n = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const s = 1.2 + rand() * 1.2;
      const monitor = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.85, s * 1.1), beige);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.75, s * 0.6), deadScreen);
      screen.position.z = s * 0.551;
      monitor.add(box, screen);
      monitor.position.set((rand() - 0.5) * 4, s * 0.42 + (k > 2 ? s * 0.85 : 0), (rand() - 0.5) * 4);
      monitor.rotation.set(rand() < 0.3 ? 0.4 : 0, rand() * 6, rand() < 0.2 ? Math.PI / 2 : 0);
      t.add(monitor);
    }
    return place(t, x, z, rand);
  };
  const weedMat = lambert(0x1e3a22, { flatShading: true });
  const weed: Feature = (x, z, rand) => {
    // Vermin weed, coming up through the board.
    const t = new THREE.Group();
    const n = 5 + Math.floor(rand() * 6);
    for (let k = 0; k < n; k++) {
      const h = 0.8 + rand() * 1.8;
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.18, h, 4), weedMat);
      blade.position.set((rand() - 0.5) * 1.6, h / 2, (rand() - 0.5) * 1.6);
      blade.rotation.set((rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.8);
      t.add(blade);
    }
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [3, chip],
      [2, cap],
      [2.2, rack],
      [1.4, mast],
      [1.6, house],
      [1.2, oldTech],
      [1.6, weed],
    ])(x, z, rand);
}

/**
 * The start: a gate of two server racks as tall as towers, ALL IS KNOWN
 * across the beam between them, and a scanner's sheet of light running up
 * and down the gap, reading everything that passes through.
 */
export function knownGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const H = 12;
  for (const side of [-1, 1]) {
    const tower = rackFigure(3, H + 2, 3);
    tower.position.x = side * (hw + 1.5);
    g.add(tower);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 6, 1.4, 2.4), blackMat());
  beam.position.y = H;
  g.add(beam);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 6.1, 0.2, 2.5), cyanLight());
  strip.position.y = H - 0.6;
  g.add(strip);
  const sign = signPanel(16, signFace(['ALL IS KNOWN']));
  sign.position.y = H + 2.9;
  g.add(sign);
  // The scanner: a bar of light running up and down between the towers, its sheet trailing it.
  const scan = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2 * hw, 0.12, 0.12), whiteLight());
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * hw, 1.6),
    new THREE.MeshBasicMaterial({ color: CYAN_HEX, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  sheet.position.y = 0.8;
  scan.add(bar, sheet);
  g.add(scan);
  animated.push((time) => {
    const u = (time * 0.45) % 2;
    scan.position.y = 0.4 + (H - 1.2) * (u < 1 ? u : 2 - u);
    sheet.position.y = u < 1 ? -0.8 : 0.8;
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Acetone at work on paint: the old world's road paint (yellow lines, white, a red stripe) running, pooling and dissolving, the board showing through. */
const acetoneTexture = once(() => {
  const W = 256;
  const H = 512;
  const [c, ctx] = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  const rand = seededRandom(7151);
  const colours = ['rgba(255,214,60,', 'rgba(244,244,236,', 'rgba(220,40,40,'];
  // Streaks of paint, smeared and running, broken into drips and pools.
  for (let k = 0; k < 70; k++) {
    const col = colours[k % 3];
    const x = (k % 3 === 0 ? 0.5 : rand()) * W + (rand() - 0.5) * 30;
    const y = rand() * H;
    const len = 20 + rand() * 90;
    const g = ctx.createLinearGradient(x, y, x + (rand() - 0.5) * 20, y + len);
    g.addColorStop(0, `${col}0)`);
    g.addColorStop(0.4, `${col}${0.35 + rand() * 0.35})`);
    g.addColorStop(1, `${col}0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y + len / 2, 2 + rand() * 6, len / 2, (rand() - 0.5) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Pools where it's run together, the solvent's sheen round their edges.
  for (let k = 0; k < 18; k++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 6 + rand() * 14;
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, `${colours[k % 3]}0.45)`);
    g.addColorStop(0.75, 'rgba(160,240,255,0.25)');
    g.addColorStop(1, 'rgba(160,240,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rand() * 0.6), rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = finish(c);
  return t;
});

/**
 * Exterminated like paint to acetone: the old world's road paint lying on
 * the machine's road from `s` to `to` (spline units), running, pooling and
 * dissolving away, thinning out as it goes.
 */
export function acetone(ribbon: Ribbon, s: number, to: number): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const n = Math.max(2, Math.ceil((to - s) / 1.5));
  for (let k = 0; k <= n; k++) {
    const d = s + ((to - s) * k) / n;
    const p = pointAt(ribbon.spline, d);
    const hw = ribbon.halfWidthAtS(d) - 0.3;
    const y = ribbon.heightAt(d) + 0.06;
    const u = k / n;
    // In from the start, thinning out to nothing by the end: dissolved.
    const a = Math.min(1, u * 8) * (1 - u) ** 0.7;
    for (const side of [-1, 1]) {
      pos.push(p.x - p.tz * side * hw, y, p.z + p.tx * side * hw);
      uv.push(side < 0 ? 0 : 1, (d - s) / 24);
      col.push(1, 1, 1, a);
    }
    if (k < n) idx.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: acetoneTexture(), vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }));
  mesh.renderOrder = 1;
  return mesh;
}

/** The pit nearest a point: the hole a landmark stands over. */
function nearestPit(pits: readonly PitDef[], x: number, z: number): PitDef | undefined {
  return pits.reduce<PitDef | undefined>((best, p) => (!best || Math.hypot(p.x - x, p.z - z) < Math.hypot(best.x - x, best.z - z) ? p : best), undefined);
}

/** The bottom of a hole etched through the board: black, in the pit's own frame (centred, along its heading). */
function etchedFloor(pit: PitDef): THREE.Mesh {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * pit.halfWidth, 2 * pit.halfLength), new THREE.MeshBasicMaterial({ color: 0x010203 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -pit.depth + 0.3;
  return floor;
}

/**
 * You've got gaps, synapses: the leap at `s` is a synaptic cleft, a
 * terminal swelling either side of it, glowing, and sparks of signal
 * arcing across from one to the other.
 */
export function synapseGap(ribbon: Ribbon, s: number, pits: readonly PitDef[], animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const pit = nearestPit(pits, f.x, f.z);
  if (pit && Math.hypot(pit.x - f.x, pit.z - f.z) < 10) {
    // The cleft: black all the way down. The pit's place in this group's frame, turned back by the road's heading.
    const holder = new THREE.Group();
    holder.add(etchedFloor(pit));
    holder.position.set(pit.x - f.x, -Math.max(0, f.y), pit.z - f.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -f.heading);
    holder.rotation.y = pit.heading - f.heading;
    g.add(holder);
  }
  const hw = ribbon.halfWidthAtS(s) + 3;
  const knob = new THREE.MeshLambertMaterial({ color: 0xd8f8ff, emissive: CYAN_HEX, emissiveIntensity: 0.6 });
  const ends: THREE.Vector3[] = [];
  const flares: THREE.Sprite[] = [];
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), knob);
      bulb.position.set(side * hw, 2.4, end * 11);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.4, 10), steelMat());
      stalk.position.set(side * hw, 1.0, end * 11);
      // Its flare as a signal fires from it.
      const flare = sprite(CYAN_HEX, 6);
      flare.position.copy(bulb.position);
      g.add(bulb, stalk, flare);
      ends.push(bulb.position);
      flares.push(flare);
    }
  }
  // The arcs: jagged lines across the cleft, redrawn every flicker.
  const SEG = 10;
  const arcs: THREE.Line[] = [];
  for (let k = 0; k < 4; k++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: k % 2 ? WHITE_HEX : CYAN_HEX, transparent: true, opacity: 0.9 }));
    arcs.push(line);
    g.add(line);
  }
  const rand = seededRandom(7161);
  let last = -1;
  animated.push((time) => {
    const tick = Math.floor(time * 14);
    if (tick === last) return;
    last = tick;
    flares.forEach((f) => (f.visible = false));
    arcs.forEach((line, k) => {
      const on = rand() < 0.7;
      line.visible = on;
      if (!on) return;
      // From a terminal on the near lip to one on the far lip.
      const a = ends[(k % 2) * 2 + (rand() < 0.5 ? 0 : 1)];
      const b = ends[2 - (k % 2) * 2 + (rand() < 0.5 ? 0 : 1)];
      flares[ends.indexOf(a)].visible = flares[ends.indexOf(b)].visible = true;
      const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let j = 0; j <= SEG; j++) {
        const u = j / SEG;
        const wob = j === 0 || j === SEG ? 0 : 1.6;
        attr.setXYZ(j, a.x + (b.x - a.x) * u + (rand() - 0.5) * wob, a.y + (b.y - a.y) * u + Math.sin(u * Math.PI) * 3 + (rand() - 0.5) * wob, a.z + (b.z - a.z) * u + (rand() - 0.5) * wob);
      }
      attr.needsUpdate = true;
    });
  });
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The mainframe's skin: black, lines of cyan light running up it, rows of its lights. */
const mainframeTexture = once(() => {
  const W = 128;
  const H = 512;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#06080b';
  ctx.fillRect(0, 0, W, H);
  const rand = seededRandom(7171);
  for (let x = 8; x < W; x += 24) {
    ctx.fillStyle = css(CYAN, 0.25 + rand() * 0.5);
    ctx.fillRect(x, 0, 2, H);
  }
  for (let y = 0; y < H; y += 10) {
    for (let x = 4; x < W; x += 8) {
      if (rand() < 0.25) {
        ctx.fillStyle = rand() < 0.8 ? css(CYAN) : '#ffffff';
        ctx.fillRect(x, y, 3, 2);
      }
    }
  }
  return finish(c);
});

/**
 * I'm connected to the network: the mainframe, in the middle of the loop
 * round the output node, `lateral` off the road at `s`. A black tower of
 * a machine, lines of light running up it, smaller towers round it, the
 * cables out of its foot to every corner of the board, and rings of
 * light rising up it, the data going out.
 */
export function mainframe(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral || ribbon.halfWidthAtS(s) + 30);
  const map = mainframeTexture();
  const skin = new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.9 });
  const H = 44;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(9, H, 9), skin);
  tower.position.y = H / 2;
  g.add(tower);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 10), steelMat());
  cap.position.y = H + 0.6;
  g.add(cap);
  const beacon = sprite(WHITE_HEX, 6);
  beacon.position.y = H + 3;
  g.add(beacon);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const h = 16 + (k % 2) * 8;
    const small = new THREE.Mesh(new THREE.BoxGeometry(4, h, 4), skin);
    small.position.set(Math.cos(a) * 11, h / 2, Math.sin(a) * 11);
    g.add(small);
    // A cable from its foot out across the board.
    const cable = new THREE.Mesh(new THREE.TorusGeometry(9, 0.5, 6, 20, Math.PI), blackMat());
    cable.rotation.y = -a;
    cable.position.set(Math.cos(a) * 20, 0, Math.sin(a) * 20);
    g.add(cable);
  }
  const rings: THREE.Mesh[] = [];
  for (let k = 0; k < 3; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.25, 6, 32), new THREE.MeshBasicMaterial({ color: CYAN_HEX, transparent: true, opacity: 0.8 }));
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    rings.push(ring);
  }
  animated.push((time) => {
    rings.forEach((r, k) => {
      const u = (time * 0.25 + k / 3) % 1;
      r.position.y = 2 + u * (H - 4);
      (r.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - u);
    });
    beacon.visible = time % 1.2 < 0.6;
  });
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.heading;
  return g;
}

/**
 * A recurrent node's via, in the middle of the loop round it, `lateral`
 * off the road at `s`: a ring of plated steel on the board as wide as a
 * plaza, its hole going down into the dark, its rim lit.
 */
export function viaPad(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral || ribbon.halfWidthAtS(s) + 22);
  const ring = new THREE.Mesh(new THREE.RingGeometry(9, 16, 48), new THREE.MeshPhongMaterial({ color: 0xb8c4cc, specular: 0xffffff, shininess: 90, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.1;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(9, 0.3, 6, 48), new THREE.MeshBasicMaterial({ color: CYAN_HEX, transparent: true, opacity: 1 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.2;
  const outer = new THREE.Mesh(new THREE.TorusGeometry(16, 0.2, 6, 48), cyanLight());
  outer.rotation.x = Math.PI / 2;
  outer.position.y = 0.2;
  g.add(ring, hole, rim, outer);
  animated.push((time) => ((rim.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.45 * Math.sin(time * 3)));
  g.position.set(at.x, 0, at.z);
  return g;
}

/**
 * I am made of steel bone: the skeleton under the Steel Bone deck, from
 * `s` to `to` (spline units): a spine of steel along under it, and ribs
 * every few metres curving out and down to the board either side.
 */
export function steelBone(ribbon: Ribbon, s: number, to: number): THREE.Group {
  const g = new THREE.Group();
  const bone = steelMat();
  const ribGeo = new THREE.BoxGeometry(0.5, 1, 0.7);
  const sp = ribbon.spline;
  // Nothing stands in another stretch of the road under it (the muscle).
  const clear = (x: number, z: number, d: number) => {
    for (let k = 0; k < sp.count; k++) {
      if (Math.abs(sp.dist[k] - d) < 60) continue;
      if (Math.hypot(sp.px[k] - x, sp.pz[k] - z) < ribbon.halfWidth[k] + 3) return false;
    }
    return true;
  };
  for (let d = s; d <= to; d += 7) {
    const f = frameAt(ribbon, d);
    if (f.y < 2) continue;
    const hw = ribbon.halfWidthAtS(d);
    const top = f.y - 1.4;
    // A vertebra under the middle.
    const vert = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.6), bone);
    vert.position.set(f.x, top - 0.8, f.z);
    vert.rotation.y = f.heading;
    g.add(vert);
    // A rib each side: out under the deck's edge and down to the ground beyond it, in three straight pieces.
    for (const side of [-1, 1]) {
      const foot = hw + 5;
      if (!clear(f.x - f.tz * side * foot, f.z + f.tx * side * foot, d) || !clear(f.x - f.tz * side * (hw + 3), f.z + f.tx * side * (hw + 3), d)) continue;
      const pts = [
        [0, top - 0.8],
        [hw * 0.8, top - 0.2],
        [hw + 3, top * 0.55],
        [hw + 5, 0],
      ];
      for (let k = 0; k + 1 < pts.length; k++) {
        const [l0, y0] = pts[k];
        const [l1, y1] = pts[k + 1];
        const len = Math.hypot(l1 - l0, y1 - y0);
        const rib = new THREE.Mesh(ribGeo, bone);
        rib.scale.y = len;
        const lm = (l0 + l1) / 2;
        // A lateral to the right of the road is (-tz, tx).
        rib.position.set(f.x - f.tz * side * lm, (y0 + y1) / 2, f.z + f.tx * side * lm);
        rib.rotation.order = 'YXZ';
        rib.rotation.y = f.heading;
        rib.rotation.z = side * Math.atan2(l1 - l0, y1 - y0);
        g.add(rib);
      }
    }
  }
  return g;
}

/** The king's eye's iris: the three cones' colours and the fourth, in four sectors round the pupil, its fibres radiating. */
const irisTexture = once(() => {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  CONES.forEach((col, k) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(S / 2, S / 2);
    ctx.arc(S / 2, S / 2, S / 2, (k * Math.PI) / 2, ((k + 1) * Math.PI) / 2);
    ctx.closePath();
    ctx.fill();
  });
  const rand = seededRandom(7181);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 90; k++) {
    const a = rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(S / 2 + Math.cos(a) * S * 0.18, S / 2 + Math.sin(a) * S * 0.18);
    ctx.lineTo(S / 2 + Math.cos(a) * S * 0.48, S / 2 + Math.sin(a) * S * 0.48);
    ctx.stroke();
  }
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(S * 0.42, S * 0.4, S * 0.05, 0, Math.PI * 2);
  ctx.fill();
  return finish(c, false);
});

/**
 * Cut the eyes from the king and augment to the fourth cone: the king's
 * eye, cut out and wired into the network, up on a steel mast in the
 * bulb the road swings round, `lateral` off the road at `s`. Its iris in
 * four colours, a ring of steel and lenses round it, cables down the mast
 * like an optic nerve; it looks round over the board, a cone of its gaze
 * sweeping the ground; and at the mast's foot the king's crown, fallen.
 */
export function kingsEye(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral || ribbon.halfWidthAtS(s) + 30);
  const H = 30;
  const R = 6;
  // The mast: four steel legs leaning in, braced.
  const steel = steelMat();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, H + 1, 8), steel);
    leg.position.set(Math.cos(a) * 2.6, H / 2, Math.sin(a) * 2.6);
    leg.rotation.set(Math.sin(a) * 0.09, 0, -Math.cos(a) * 0.09);
    g.add(leg);
  }
  for (let y = 4; y < H; y += 6) {
    const brace = new THREE.Mesh(new THREE.TorusGeometry(3.6 - (y / H) * 1.6, 0.18, 4, 4), steel);
    brace.rotation.x = Math.PI / 2;
    brace.rotation.z = Math.PI / 4;
    brace.position.y = y;
    g.add(brace);
  }
  // The optic nerve: cables down the mast.
  const nerve = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.1, H, 8), blackMat());
  nerve.position.y = H / 2;
  g.add(nerve);
  // The eye, on a gimbal so it can look round.
  const look = new THREE.Group();
  look.position.y = H + R;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), new THREE.MeshPhongMaterial({ color: 0xf4f0ea, specular: 0xffffff, shininess: 80 }));
  look.add(ball);
  const iris = new THREE.Mesh(new THREE.CircleGeometry(R * 0.55, 32), new THREE.MeshBasicMaterial({ map: irisTexture() }));
  iris.position.z = R * 0.84;
  iris.scale.setScalar(1);
  const lensRing = new THREE.Mesh(new THREE.TorusGeometry(R * 0.6, 0.35, 8, 32), steel);
  lensRing.position.z = R * 0.82;
  const augment = new THREE.Mesh(new THREE.TorusGeometry(R * 1.08, 0.5, 8, 40), steel);
  const strip = new THREE.Mesh(new THREE.TorusGeometry(R * 1.08, 0.12, 6, 40), cyanLight());
  strip.position.z = 0.45;
  look.add(iris, lensRing, augment, strip);
  // Lenses clamped to the ring: one for each cone.
  CONES.forEach((col, k) => {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const lens = sprite(new THREE.Color(col).getHex(), 2.2);
    lens.position.set(Math.cos(a) * R * 1.08, Math.sin(a) * R * 1.08, 0.8);
    look.add(lens);
  });
  // Its gaze: a cone of cold light down onto the board.
  const gaze = new THREE.Mesh(
    new THREE.ConeGeometry(14, 60, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: CYAN_HEX, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  gaze.rotation.x = -Math.PI / 2;
  gaze.position.z = R + 30;
  look.add(gaze);
  g.add(look);
  // The king's crown, fallen at the foot of the mast.
  const gold = new THREE.MeshPhongMaterial({ color: 0xd8a830, specular: 0xffe8a0, shininess: 70, side: THREE.DoubleSide });
  const crown = new THREE.Group();
  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.2, 1.6, 20, 1, true), gold);
  crown.add(band);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 6), gold);
    point.position.set(Math.cos(a) * 2.3, 1.5, Math.sin(a) * 2.3);
    crown.add(point);
  }
  crown.position.set(6, 1.2, 4);
  crown.rotation.set(0.5, 0.3, 1.1);
  g.add(crown);
  animated.push((time) => {
    // Looking round over the board, slowly, now and then darting.
    look.rotation.y = Math.sin(time * 0.23) * 1.6 + Math.sin(time * 1.7) * 0.08;
    look.rotation.x = 0.35 + Math.sin(time * 0.31) * 0.15;
    iris.scale.setScalar(0.92 + 0.08 * Math.sin(time * 0.9));
  });
  g.position.set(at.x, 0, at.z);
  return g;
}

/**
 * All Is Known, the shortcut: the board etched out under the bare trace
 * at `s` on the branch, the layers of the board showing down in the hole,
 * and a sign at each end. The trace itself is the branch's own road, its
 * data running down it, there on the laps it's open (trackView's lapRoad).
 */
export function busTrace(ribbon: Ribbon, s: number, pits: readonly PitDef[], animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const pit = nearestPit(pits, f.x, f.z);
  if (!pit) return g;
  // The board's edge round the etched hole: a band of exposed layers, lit.
  for (const end of [-1, 1]) {
    const sign = signPanel(10, signFace(['ALL IS KNOWN']));
    sign.position.set(Math.sin(pit.heading) * end * (pit.halfLength + 2), 5.5, Math.cos(pit.heading) * end * (pit.halfLength + 2));
    sign.rotation.y = pit.heading + (end > 0 ? Math.PI : 0);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 0.3), steelMat());
      post.position.set(side * 4.6, -2.8, 0);
      sign.add(post);
    }
    g.add(sign);
  }
  const layers = new THREE.Group();
  for (const [depth, col] of [[1.2, CYAN_HEX], [3.5, 0x2a6a7a], [6, 0x1a3a44]] as const) {
    const ring = new THREE.Mesh(new THREE.BoxGeometry(2 * pit.halfWidth, 0.25, 2 * pit.halfLength), new THREE.MeshBasicMaterial({ color: col, wireframe: true }));
    ring.position.y = -depth;
    layers.add(ring);
  }
  layers.add(etchedFloor(pit));
  layers.rotation.y = pit.heading;
  g.add(layers);
  // The layers' lights flicker, down in the dark.
  animated.push((time) => layers.children.forEach((l, k) => (l.visible = Math.sin(time * (2 + k) + k * 1.3) > -0.6)));
  g.position.set(pit.x, 0, pit.z);
  return g;
}

/** A sweeper's brushes: steel-grey bristles in bands, so the drum's spin shows. */
const bristleTexture = once(() => {
  const W = 64;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#2a2e34';
  ctx.fillRect(0, 0, W, H);
  const rand = seededRandom(7191);
  for (let k = 0; k < 400; k++) {
    ctx.fillStyle = rand() < 0.5 ? '#8a929c' : '#4a525c';
    ctx.fillRect(rand() * W, rand() * H, 1, 3 + rand() * 4);
  }
  ctx.fillStyle = css(CYAN, 0.8);
  ctx.fillRect(0, 0, W, 6);
  return finish(c);
});

/**
 * A street sweeper, the hazard's look: a squat white machine with nobody
 * in it, its dark glass, a cyan stripe, a beacon turning on top; the brush
 * drum across its front and a disc brush either side, spinning; the
 * scanner's fan of light out ahead of it over the road; and behind it the
 * clean wake, the road it has just swept, lit. Its front toward local -x.
 */
export function sweeperParts(obj: THREE.Object3D): THREE.Object3D[] {
  const machine = new THREE.Group();
  const white = new THREE.MeshPhongMaterial({ color: 0xe8eef2, specular: 0xffffff, shininess: 50 });
  const L = SWEEP_HALF * 2 - 1.2;
  const D = SWEEP_DEPTH * 2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(L, 1.8, D), white);
  body.position.set(0.3, 1.3, 0);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, D * 0.9), new THREE.MeshPhongMaterial({ color: 0x0a1218, specular: 0x8adfff, shininess: 90 }));
  cab.position.set(-L / 2 + 1.1, 2.6, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(L + 0.04, 0.2, D + 0.04), cyanLight());
  stripe.position.set(0.3, 1.0, 0);
  const beacon = new THREE.Group();
  const lamp = sprite(CYAN_HEX, 2.4);
  lamp.position.x = 0.35;
  beacon.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.4, 10), whiteLight()), lamp);
  beacon.position.set(0.8, 2.45, 0);
  for (const z of [-D / 2 + 0.2, D / 2 - 0.2]) {
    for (const x of [-L / 2 + 1, L / 2 - 0.5]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), lambert(0x14161c));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x + 0.3, 0.42, z);
      machine.add(wheel);
    }
  }
  const bristles = new THREE.MeshLambertMaterial({ map: bristleTexture() });
  // The drum across its front, rolling the way it goes.
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, D + 0.4, 14), bristles);
  drum.rotation.x = Math.PI / 2;
  drum.position.set(-L / 2 - 0.3, 0.55, 0);
  const discs = new THREE.Group();
  for (const z of [-D / 2 - 0.3, D / 2 + 0.3]) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.12, 16), bristles);
    disc.position.set(-L / 2 + 0.3, 0.12, z);
    discs.add(disc);
  }
  machine.add(discs);
  // The scanner: a fan of light out over the road ahead of it.
  const scan = new THREE.Mesh(
    new THREE.PlaneGeometry(5, D + 1),
    new THREE.MeshBasicMaterial({ color: CYAN_HEX, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  scan.rotation.x = -Math.PI / 2;
  scan.position.set(-L / 2 - 3.2, 0.1, 0);
  machine.add(body, cab, stripe, beacon, drum, scan);
  // The clean wake behind it.
  const wake = new THREE.Mesh(
    new THREE.PlaneGeometry(SWEEP_WAKE, D),
    new THREE.MeshBasicMaterial({ color: CYAN_HEX, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  wake.rotation.x = -Math.PI / 2;
  wake.position.set(SWEEP_HALF + SWEEP_WAKE / 2, 0.09, 0);
  machine.add(wake);
  obj.add(machine);
  return [machine, beacon, drum, discs, scan, wake];
}

/** Poses a sweeper's parts (from sweeperParts): across the road where it is, facing the way it goes, its brushes spinning. */
export function poseSweeper(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [machine, beacon, drum, discs, scan, wake] = parts;
  const S = SWEEP_STAGES;
  const u = p.phase;
  obj.position.set(p.ax, p.ground, p.az);
  obj.rotation.y = p.heading;
  // A lateral to the right is local -x; it faces the way it's going (mirrored for the other way).
  machine.position.x = -p.gap;
  machine.scale.x = p.side;
  beacon.rotation.y = elapsed * (u >= S.warn && u < S.done ? 9 : 2);
  const spinning = u >= S.warn && u < S.done;
  drum.rotation.y = spinning ? elapsed * 14 : 0;
  discs.children.forEach((d, k) => (d.rotation.y = spinning ? elapsed * (k ? -12 : 12) : 0));
  scan.visible = spinning;
  if (spinning) ((scan as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.15 * Math.sin(elapsed * 20);
  wake.visible = p.active;
  if (p.active) ((wake as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.1 * Math.sin(elapsed * 12);
}
