import * as THREE from 'three';
import { seededRandom } from '../core/math';
import {
  AUTOPILOT_DRAFT,
  AUTOPILOT_HALF_LENGTH,
  AUTOPILOT_HALF_WIDTH,
  type HazardPose,
} from '../items/hazards';
import type { PitDef } from '../tracks/builder';
import { LEVEL, PARK_LEG } from '../tracks/level5';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import { glowTexture } from './textures';

/**
 * Level 5's world, the Alien Metal Cup's third: the metal built into the
 * machines that drive us now, at the end of the world. A city of
 * driverless cars at night under the cup's alien stars, its motorway white
 * and blue, the sky coming apart into pixels. Its textures (the
 * self-driving lane, the car park tarmac, the concrete of the cutting and
 * the car park, the motorway's barriers), its scenery (pods abandoned where
 * they stopped, cold lamps, sensor masts, signs for the machines, tower
 * blocks with a few windows lit, cones, a carton of milk gone bad), its
 * landmarks (the car park's barrier and its LEVEL 5 sign, the levels'
 * signs and the car park's columns, the giant carton of milk, the hole in
 * the sky with the stars falling flat out of it, the dark tunnel) and its
 * hazard's look (the driverless pods).
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
const shade = (c: RGB, f: number): RGB => [c[0] * f, c[1] * f, c[2] * f];
const css = ([r, g, b]: RGB, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

/** The cup's cold electric blue, and the pods' white. */
const BLUE: RGB = [42, 128, 255];
const BLUE_HEX = 0x2a80ff;

/**
 * The road: a self-driving lane, white and blue, its markings for the
 * machines. The texture spans half the road (its u across, its v along):
 * a solid blue line down each edge of it (the road's edges and its middle),
 * a dashed one down the middle of it (so four lanes), blue studs for the
 * sensors along the lines, the lanes worn grey where the wheels run, and
 * now and then a chevron and a square of code painted in a lane, read by
 * the cars and not by anyone in them.
 */
export function laneRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 5101);
  const fine = fbm(S, 32, 2, 5102);
  paint(ctx, S, S, (x, _y, i) => {
    const u = x / S;
    const base = mix([200, 206, 216], [232, 236, 242], n[i]);
    // Worn grey along each lane's wheel tracks.
    const track = Math.min(...[0.13, 0.37, 0.63, 0.87].map((t) => Math.abs(u - t)));
    const worn = track < 0.05 ? mix(base, [176, 182, 192], (0.05 - track) * 10) : base;
    return shade(worn, 0.94 + fine[i] * 0.1);
  });
  const rand = seededRandom(5103);
  // Aggregate: fine dark and pale grains.
  for (let k = 0; k < 2600; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(120,128,140,0.35)' : 'rgba(255,255,255,0.4)';
    ctx.fillRect(rand() * S, rand() * S, 1, 1);
  }
  // The solid line down the edge: half of it at each side of the tile, so it runs whole down the road's edges and its middle.
  const solid = (x0: number, w: number) => {
    ctx.fillStyle = css(mix(BLUE, [255, 255, 255], 0.55), 0.6);
    ctx.fillRect(x0 - 2, 0, w + 4, S);
    ctx.fillStyle = css(BLUE);
    ctx.fillRect(x0, 0, w, S);
  };
  solid(0, 5);
  solid(S - 5, 5);
  // The dashed line between the two lanes: one dash a tile.
  ctx.fillStyle = css(BLUE);
  ctx.fillRect(S / 2 - 3, S * 0.1, 6, S * 0.38);
  // Sensor studs: bright blue dots along the lines.
  for (let y = 8; y < S; y += 32) {
    for (const x of [7, S - 7, S / 2]) {
      ctx.fillStyle = 'rgba(200,236,255,1)';
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }
  // A chevron pointing the way (up the canvas is along the road), and a square of code, in one lane each.
  ctx.strokeStyle = css(BLUE, 0.75);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(S * 0.17, S * 0.82);
  ctx.lineTo(S * 0.25, S * 0.72);
  ctx.lineTo(S * 0.33, S * 0.82);
  ctx.stroke();
  const code = (x0: number, y0: number, cell: number) => {
    ctx.fillStyle = css([28, 40, 70], 0.7);
    ctx.fillRect(x0 - 2, y0 - 2, cell * 7 + 4, cell * 7 + 4);
    ctx.fillStyle = 'rgba(236,240,246,1)';
    ctx.fillRect(x0, y0, cell * 7, cell * 7);
    ctx.fillStyle = css([28, 40, 70], 0.85);
    for (let a = 0; a < 7; a++) for (let b = 0; b < 7; b++) if (rand() < 0.5 || (a < 2 && b < 2) || (a > 4 && b < 2) || (a < 2 && b > 4)) ctx.fillRect(x0 + a * cell, y0 + b * cell, cell, cell);
  };
  code(S * 0.66, S * 0.36, 5);
  return finish(c);
}

/** The ground: a car park's tarmac running on for miles, dark, its bays' lines faded, oil stains, cracks. */
export function tarmacTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 5, 5111);
  const stain = fbm(S, 4, 3, 5112);
  paint(ctx, S, S, (_x, _y, i) => {
    const t = mix([26, 30, 40], [50, 56, 68], n[i]);
    return stain[i] > 0.64 ? mix(t, [12, 14, 20], Math.min(1, (stain[i] - 0.64) * 4)) : t;
  });
  const rand = seededRandom(5113);
  for (let k = 0; k < 6000; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(10,12,18,0.5)' : 'rgba(110,118,132,0.35)';
    ctx.fillRect(rand() * S, rand() * S, 1.5, 1.5);
  }
  // The bays: two rows of faded white lines, and the odd faded number.
  ctx.strokeStyle = 'rgba(200,210,226,0.28)';
  ctx.lineWidth = 4;
  for (const [y0, y1] of [
    [30, 150],
    [290, 410],
  ]) {
    for (let x = 0; x < S; x += 64) {
      if (rand() < 0.15) continue;
      ctx.beginPath();
      ctx.moveTo(x + 2, y0);
      ctx.lineTo(x + 2, y1);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, y1);
    ctx.lineTo(S, y1);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(200,210,226,0.18)';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  for (let x = 32; x < S; x += 128) ctx.fillText(String(1 + Math.floor(rand() * 99)), x, 110);
  // Cracks.
  ctx.strokeStyle = 'rgba(6,8,12,0.7)';
  ctx.lineWidth = 1.3;
  for (let k = 0; k < 30; k++) {
    let x = rand() * S;
    let y = rand() * S;
    let a = rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      a += (rand() - 0.5) * 1.2;
      x += Math.cos(a) * (8 + rand() * 16);
      y += Math.sin(a) * (8 + rand() * 16);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(c);
}

/**
 * The cutting's walls and the car park's concrete (and the world's edge):
 * pale precast panels, their joints, the tie holes in rows, a strip of
 * blue light along the top of each course, and rain stains streaking down.
 */
export function concreteTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 5121);
  const streak = fbm(S, 16, 2, 5122);
  paint(ctx, S, S, (x, y, i) => {
    const panel = mix([132, 138, 150], [176, 182, 192], n[i]);
    // Rain stains: darker streaks running down from the top.
    const s = streak[x + ((y / 8) | 0) * S] > 0.6 ? 0.88 : 1;
    return shade(panel, s * (0.92 + 0.08 * Math.sin(x * 0.4 + n[i] * 3)));
  });
  ctx.strokeStyle = 'rgba(40,46,58,0.8)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= S; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, S);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, S / 2);
  ctx.lineTo(S, S / 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(40,44,54,0.7)';
  for (let x = 16; x < S; x += 32) for (const y of [S * 0.3, S * 0.8]) ctx.fillRect(x - 2, y - 2, 4, 4);
  // The strip of light along the top of each course.
  for (const y of [8, S / 2 + 8]) {
    ctx.fillStyle = css(mix(BLUE, [255, 255, 255], 0.5), 0.5);
    ctx.fillRect(0, y - 3, S, 8);
    ctx.fillStyle = css(mix(BLUE, [255, 255, 255], 0.2));
    ctx.fillRect(0, y, S, 3);
  }
  return finish(c);
}

/** The motorway's barrier: white concrete, a segment every tile, a blue reflective band and round reflectors along it. */
export function barrierTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  const n = fbm(W, 8, 3, 5131);
  paint(ctx, W, H, (_x, y, i) => {
    const v = y / H;
    const white = mix([206, 212, 222], [236, 240, 246], n[i]);
    // Darker toward the foot, where the spray hits it.
    return shade(white, 0.7 + 0.3 * (1 - v));
  });
  ctx.fillStyle = css(BLUE);
  ctx.fillRect(0, H * 0.3, W, H * 0.16);
  ctx.fillStyle = 'rgba(220,240,255,1)';
  for (const x of [W * 0.25, W * 0.75]) {
    ctx.beginPath();
    ctx.arc(x, H * 0.38, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(30,34,44,0.9)';
  ctx.fillRect(0, 0, 2, H);
  return finish(c);
}

const glowTex = once(() => glowTexture());
const podWhite = once(() => lambert(0xe8ecf2));
const glassMat = once(() => new THREE.MeshPhongMaterial({ color: 0x0a1428, specular: 0x8ab8ff, shininess: 80 }));
const blueLight = once(() => new THREE.MeshBasicMaterial({ color: BLUE_HEX }));
const concreteMat = once(() => lambert(0xb4bac4));

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

/** Where a landmark `lateral` metres off the road at `s` stands. */
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

/** A face of words on a sign: white on the cup's blue, a white border. */
const signFace = (() => {
  const made = new Map<string, THREE.CanvasTexture>();
  return (lines: string[], bg = '#123a8a', fg = '#f2f6ff'): THREE.CanvasTexture => {
    const key = `${lines.join('|')}|${bg}|${fg}`;
    let t = made.get(key);
    if (t) return t;
    const W = 512;
    const H = 256;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, W - 24, H - 24);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = lines.length === 1 ? 96 : lines.length === 2 ? 70 : 52;
    ctx.font = `bold ${size}px sans-serif`;
    lines.forEach((line, k) => {
      const w = ctx.measureText(line).width;
      ctx.save();
      ctx.translate(W / 2, H / 2 + (k - (lines.length - 1) / 2) * size * 1.12);
      if (w > W - 60) ctx.scale((W - 60) / w, 1);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
    t = finish(c, false);
    made.set(key, t);
    return t;
  };
})();

/** A sign panel `w` wide (half as high) with `map` on its face, toward -z (toward whoever's coming), and `back` on its other side. */
function signPanel(w: number, map: THREE.Texture, back?: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, w / 2);
  const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map }));
  front.rotation.y = Math.PI;
  front.position.z = -0.12;
  const rear = new THREE.Mesh(geo, back ? new THREE.MeshBasicMaterial({ map: back }) : lambert(0x5a6070));
  rear.position.z = 0.12;
  const board = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, w / 2 + 0.2, 0.2), lambert(0x3a404c));
  g.add(board, front, rear);
  return g;
}

/**
 * A driverless pod: a white capsule of a car with nobody in it, its dark
 * glass all round, a strip of blue light round its waist, the lidar on its
 * roof. Its nose toward +z. Returns the group and its lidar, to turn.
 */
function podFigure(): { group: THREE.Group; lidar: THREE.Object3D; body: THREE.Mesh } {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1, 2.4, 6, 14), podWhite());
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 1, 0.72);
  body.position.y = 0.95;
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), glassMat());
  glass.scale.set(0.92, 0.62, 1.55);
  glass.position.y = 1.35;
  const strip = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 4, 32), blueLight());
  strip.rotation.x = Math.PI / 2;
  strip.scale.set(1.02, 2.2, 1);
  strip.position.y = 0.95;
  const lidar = new THREE.Group();
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.3, 12), lambert(0x1a1e26));
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.3), blueLight());
  eye.position.set(0, 0, 0.3);
  lidar.add(puck, eye);
  lidar.position.y = 2.0;
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), lambert(0x14161c));
    wheel.rotation.z = Math.PI / 2;
    for (const end of [-1.25, 1.25]) {
      const w = wheel.clone();
      w.position.set(side * 0.92, 0.42, end);
      g.add(w);
    }
  }
  g.add(body, glass, strip, lidar);
  return { group: g, lidar, body };
}

/**
 * The city of driverless cars at the end of the world: pods abandoned
 * where they stopped (some with their hazard lights still going, flies on
 * their windscreens), cold blue lamps, masts of cameras and lidar watching
 * the empty road, signs for the machines, tower blocks with a few windows
 * still lit and a red light on top, cones, and cartons of milk gone bad.
 */
export function driverlessFeature(animated: Animated): Feature {
  const steel = lambert(0xd8dce4);
  const dark = lambert(0x1a1e26);
  const amber = 0xffa020;
  const pod: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const { group, lidar } = podFigure();
    t.add(group);
    // Flies on the windscreen.
    const fly = lambert(0x060608);
    for (let k = 0; k < 6; k++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 3), fly);
      f.position.set((rand() - 0.5) * 1.2, 1.5 + rand() * 0.3, 1.2 + rand() * 0.4);
      t.add(f);
    }
    if (rand() < 0.45) {
      // Its hazard lights, still blinking.
      const lights = [-1, 1].flatMap((side) => [-2.1, 2.1].map((end) => {
        const l = sprite(amber, 1.2);
        l.position.set(side * 0.9, 1.0, end);
        t.add(l);
        return l;
      }));
      const ph = rand();
      animated.push((time) => lights.forEach((l) => (l.visible = (time * 1.4 + ph) % 1 < 0.5)));
    }
    const spin = 1 + rand() * 2;
    animated.push((time) => (lidar.rotation.y = time * spin));
    return place(t, x, z, rand);
  };
  const lamp: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 9 + rand() * 3;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, h, 8), steel);
    pole.position.y = h / 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 0.14), steel);
    arm.position.set(1.2, h - 0.1, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5), blueLight());
    head.position.set(2.3, h - 0.25, 0);
    const glow = sprite(0x9ad0ff, 4, 0.8);
    glow.position.set(2.3, h - 0.6, 0);
    t.add(pole, arm, head, glow);
    return place(t, x, z, rand);
  };
  const mast: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 6 + rand() * 3;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, h, 8), dark);
    pole.position.y = h / 2;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.5), steel);
    box.position.y = h - 0.6;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10), blueLight());
    lens.position.set(0, h - 0.6, 0.26);
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.35, 12), dark);
    puck.position.y = h + 0.1;
    const red = sprite(0xff2020, 1.1);
    red.position.y = h + 0.5;
    t.add(pole, box, lens, puck, red);
    const ph = rand() * 3;
    animated.push((time) => {
      puck.rotation.y = time * 3;
      red.visible = (time + ph) % 1.6 < 0.15;
    });
    return place(t, x, z, rand);
  };
  const SIGNS = [['LEVEL 5', 'AUTONOMY'], ['NO DRIVERS', 'BEYOND THIS POINT'], ['TRUST IN', 'AUTONOMY'], ['END OF THE WORLD', '2 KM'], ['EXPIRY'], ['SHUT YOUR EYES']];
  const sign: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const lines = SIGNS[Math.floor(rand() * SIGNS.length)];
    const w = 7 + rand() * 3;
    const panel = signPanel(w, signFace(lines));
    panel.position.y = 4 + w / 4;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4 + w / 2, 0.3), steel);
      post.position.set(side * w * 0.38, (4 + w / 2) / 2, 0.3);
      t.add(post);
    }
    t.add(panel);
    return place(t, x, z, rand);
  };
  const windows = once(() => {
    const W = 128;
    const H = 256;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = '#10141e';
    ctx.fillRect(0, 0, W, H);
    const rand = seededRandom(5141);
    for (let y = 6; y < H; y += 16) {
      for (let x = 6; x < W; x += 16) {
        const lit = rand();
        ctx.fillStyle = lit < 0.12 ? '#cfe4ff' : lit < 0.16 ? '#ffd88a' : '#1c2230';
        ctx.fillRect(x, y, 9, 10);
      }
    }
    return finish(c);
  });
  const tower: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 22 + rand() * 30;
    const w = 10 + rand() * 8;
    const d = 10 + rand() * 6;
    const map = windows().clone();
    map.needsUpdate = true;
    map.repeat.set(w / 12, h / 24);
    const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.5 }));
    block.position.y = h / 2;
    const red = sprite(0xff3020, 2.4);
    red.position.y = h + 1;
    t.add(block, red);
    const ph = rand() * 2;
    animated.push((time) => (red.visible = (time + ph) % 2 < 1));
    return place(t, x, z, rand);
  };
  const coneMat = lambert(0xff6a1a);
  const band = lambert(0xf4f4f4);
  const cones: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 3 + Math.floor(rand() * 5);
    for (let k = 0; k < n; k++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1, 10), coneMat);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.26, 0.18, 10), band);
      ring.position.y = 0.05;
      const g = new THREE.Group();
      cone.position.y = 0.5;
      g.add(cone, ring);
      g.position.set(k * 1.6 + (rand() - 0.5), 0, (rand() - 0.5) * 1.5);
      // Some knocked over.
      if (rand() < 0.3) {
        g.rotation.z = Math.PI / 2;
        g.position.y = 0.35;
      }
      t.add(g);
    }
    return place(t, x, z, rand);
  };
  const carton: Feature = (x, z, rand) => {
    const t = milkCartonFigure(1.2 + rand() * 1.2);
    // Fallen over, spilt.
    if (rand() < 0.5) {
      t.rotation.z = Math.PI / 2;
      t.position.y = 0.5;
    }
    const g = new THREE.Group();
    g.add(t);
    const spill = new THREE.Mesh(new THREE.CircleGeometry(1.5, 14), lambert(0xe4e8c8));
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(1.2, 0.04, 0);
    g.add(spill);
    return place(g, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [4, pod],
      [3, lamp],
      [1.5, mast],
      [1.2, sign],
      [2.2, tower],
      [1.4, cones],
      [0.8, carton],
    ])(x, z, rand);
}

/** A carton of milk's side: white, the cup's blue, MILK, and its expiry, long gone, mould creeping up it. */
const cartonTexture = once(() => {
  const W = 256;
  const H = 512;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#f0f2f4';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1e5ad8';
  ctx.fillRect(0, H * 0.62, W, H * 0.38);
  // Waves of milk along the blue.
  ctx.fillStyle = '#f0f2f4';
  ctx.beginPath();
  ctx.moveTo(0, H * 0.62);
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, H * 0.62 + Math.sin(x / 20) * 10);
  ctx.lineTo(W, H * 0.6);
  ctx.lineTo(0, H * 0.6);
  ctx.fill();
  ctx.fillStyle = '#1e5ad8';
  ctx.textAlign = 'center';
  ctx.font = 'bold 84px sans-serif';
  ctx.fillText('MILK', W / 2, H * 0.3);
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('FULL CREAM', W / 2, H * 0.38);
  ctx.fillStyle = '#f0f2f4';
  ctx.font = 'bold 30px monospace';
  ctx.fillText('EXP 14 08 26', W / 2, H * 0.8);
  // Gone bad: green-grey mould creeping up from the foot.
  const rand = seededRandom(5151);
  for (let k = 0; k < 120; k++) {
    const x = rand() * W;
    const y = H - rand() ** 2 * H * 0.7;
    ctx.fillStyle = `rgba(${90 + rand() * 40},${120 + rand() * 50},${60 + rand() * 30},${0.35 + rand() * 0.4})`;
    ctx.beginPath();
    ctx.arc(x, y, 3 + rand() * 12, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, false);
});

/** A carton of milk, `h` high: its box, the gable on top, its spout. Its foot at the origin. */
function milkCartonFigure(h: number): THREE.Group {
  const g = new THREE.Group();
  const w = h * 0.42;
  const side = new THREE.MeshLambertMaterial({ map: cartonTexture() });
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.8, w), side);
  box.position.y = h * 0.4;
  const gable = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.72, w * 0.72, w, 3, 1), lambert(0xe8ecf0));
  gable.rotation.set(0, 0, Math.PI / 2);
  gable.rotation.order = 'ZXY';
  gable.scale.set(1, 1, 0.7);
  gable.position.y = h * 0.8 + w * 0.18;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.06, h * 0.08, w), lambert(0xe8ecf0));
  fin.position.y = h * 0.8 + w * 0.42;
  g.add(box, gable, fin);
  return g;
}

/** The car park's barrier sign: LEVEL 5, the P, AUTONOMY. */
const level5Face = once(() => {
  const W = 1024;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#0c2a78';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#eef4ff';
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.fillStyle = '#eef4ff';
  ctx.fillRect(48, 40, 176, 176);
  ctx.fillStyle = '#0c2a78';
  ctx.font = 'bold 170px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('P', 136, 136);
  ctx.fillStyle = '#eef4ff';
  ctx.font = 'bold 120px sans-serif';
  ctx.fillText('LEVEL 5', 600, 108);
  ctx.font = 'bold 54px sans-serif';
  ctx.fillText('AUTONOMY', 600, 196);
  return finish(c, false);
});

/** A boom barrier's arm: red and white stripes. */
const boomTexture = once(() => {
  const [c, ctx] = canvas(256, 32);
  for (let x = 0; x < 256; x += 32) {
    ctx.fillStyle = (x / 32) % 2 ? '#f4f4f4' : '#d81820';
    ctx.fillRect(x, 0, 32, 32);
  }
  return finish(c, false);
});

/**
 * The car park's barrier: a gantry over the road with the LEVEL 5 sign on
 * it, the ticket booth by the road, and its boom barrier raised (nobody to
 * take a ticket from), its light blinking.
 */
export function carParkGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  // Low enough to clear the car park's levels over the way in.
  const H = 5;
  const white = lambert(0xe4e8ee);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, H, 0.7), white);
    post.position.set(side * (hw + 0.6), H / 2, 0);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.4, 0.74), blueLight());
    band.position.set(side * (hw + 0.6), H - 1.2, 0);
    g.add(post, band);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 2, 0.6, 0.6), white);
  beam.position.y = H;
  g.add(beam);
  const sign = signPanel(12, level5Face(), level5Face());
  sign.scale.y = 0.5;
  sign.position.y = H + 1.6;
  g.add(sign);
  // The booth, on the road's left (local +x), and its boom, raised.
  const booth = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 2.4), white);
  walls.position.y = 1.3;
  const pane = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1, 1.6), new THREE.MeshBasicMaterial({ color: 0x1a4a9a }));
  pane.position.y = 1.7;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3, 0.25, 3), lambert(0x2a3040));
  roof.position.y = 2.7;
  booth.add(walls, pane, roof);
  booth.position.set(hw + 3.2, 0, -3);
  const pivot = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(hw * 0.8, 0.22, 0.22), new THREE.MeshLambertMaterial({ map: boomTexture() }));
  arm.position.x = -hw * 0.4;
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.6), lambert(0xffc020));
  stand.position.set(hw + 1.2, 0.6, -1.5);
  pivot.add(arm);
  pivot.position.set(hw + 1.2, 1.15, -1.5);
  pivot.rotation.z = -1.35;
  const light = sprite(0xffa020, 1.4);
  light.position.set(hw + 1.2, 1.5, -1.5);
  g.add(booth, stand, pivot, light);
  animated.push((time) => {
    light.visible = time % 1 < 0.5;
    pivot.rotation.z = -1.35 + 0.03 * Math.sin(time * 2.1);
  });
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Each level's colour, as car parks colour them so you find your car again. */
const LEVEL_COLOURS = ['#c8202a', '#e87a10', '#18a050', '#1e5ad8', '#7a3ad8'];

/**
 * A level's sign up on its parapet, on the car park's inside (`lateral`'s
 * side): LEVEL n in the level's colour, the level by its height (Level 5
 * the roof, and the song's).
 */
export function levelSign(ribbon: Ribbon, s: number, lateral: number): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const level = Math.max(1, Math.min(5, Math.round(f.y / LEVEL) + 1));
  const side = Math.sign(lateral) || 1;
  const hw = ribbon.halfWidthAtS(s);
  const lines = level === 5 ? ['LEVEL 5', 'ROOF'] : [`LEVEL ${level}`];
  const panel = signPanel(7, signFace(lines, LEVEL_COLOURS[level - 1]));
  panel.position.set(-side * (hw + 0.8), 3.4, 0);
  g.add(panel);
  for (const k of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 0.2), concreteMat());
    post.position.set(-side * (hw + 0.8) + k * 2.6, 1.6, 0.2);
    g.add(post);
  }
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * The car park's frame: concrete columns up its outside edges, from the
 * ground to the top level over each spot, with a cold lamp on each, the
 * levels between them their own decks. From `s` (spline units) the helix
 * and on over its roof's first ramp to `to`. Columns that would stand in
 * a road below (the way in, the cutting) are left out.
 */
export function carPark(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const sp = ribbon.spline;
  const turn = (to - PARK_LEG * ribbon.scale - s) / 2;
  const geo = new THREE.BoxGeometry(0.9, 1, 0.9);
  const lampGeo = new THREE.BoxGeometry(0.5, 0.15, 0.5);
  const lamps: THREE.Sprite[] = [];
  // The top level over each spot: the helix's second turn, and the roof's straight over the first ramp.
  for (let d = s + turn; d <= to; d += 9) {
    const f = frameAt(ribbon, d);
    const y = ribbon.heightAt(d);
    const hw = ribbon.halfWidthAtS(d) + 1.1;
    for (const side of [-1, 1]) {
      const x = f.x - f.tz * side * hw;
      const z = f.z + f.tx * side * hw;
      // Keep out of any other road under it (not the car park's own levels).
      let blocked = false;
      for (let k = 0; k < sp.count && !blocked; k++) {
        const at = sp.dist[k];
        if (at > s - 2 && at < to + 60) continue;
        if (ribbon.heightAt(at) > y) continue;
        blocked = Math.hypot(sp.px[k] - x, sp.pz[k] - z) < ribbon.halfWidth[k] + 4;
      }
      if (blocked) continue;
      const col = new THREE.Mesh(geo, concreteMat());
      col.scale.y = y + 1.2;
      col.position.set(x, (y + 1.2) / 2, z);
      g.add(col);
      const head = new THREE.Mesh(lampGeo, blueLight());
      head.position.set(x, y + 1.3, z);
      const glow = sprite(0x9ad0ff, 2.6, 0.7);
      glow.position.set(x, y + 1.6, z);
      g.add(head, glow);
      lamps.push(glow);
    }
  }
  // The lamps hum, now and then one dropping out.
  animated.push((time) => lamps.forEach((l, k) => (l.visible = Math.sin(time * 0.7 + k * 12.9) < 0.97)));
  return g;
}

/**
 * The milk's gone bad: a carton of milk the size of a tower block by the
 * roof's road, its expiry long past, mould creeping up it, a sour puddle
 * round its foot and flies circling it. `lateral` off the road (well off
 * it, when that's 0).
 */
export function milkCarton(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral || ribbon.halfWidthAtS(s) + 26);
  const carton = milkCartonFigure(30);
  carton.rotation.z = 0.06;
  g.add(carton);
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(14, 24), lambert(0xd8dcb4));
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.y = 0.05;
  g.add(puddle);
  const flyMat = new THREE.MeshBasicMaterial({ color: 0x050506 });
  const flies: THREE.Mesh[] = [];
  for (let k = 0; k < 40; k++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.25, 4, 3), flyMat);
    f.userData = { r: 9 + (k % 7) * 1.3, h: 6 + ((k * 7) % 22), ph: k * 0.77, sp: 0.6 + (k % 5) * 0.25 };
    g.add(f);
    flies.push(f);
  }
  animated.push((time) =>
    flies.forEach((f) => {
      const { r, h, ph, sp } = f.userData;
      const a = time * sp + ph;
      f.position.set(Math.cos(a) * r, h + Math.sin(time * 3 + ph) * 1.5, Math.sin(a) * r);
    }),
  );
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.heading + 0.5;
  return g;
}

/** The hole in the sky: a ragged disc of pixels gone dark, stars in the black, its edge breaking up into squares. */
const holeTexture = once(() => {
  const S = 512;
  const [c, ctx] = canvas(S);
  const rand = seededRandom(5161);
  const cell = 16;
  const n = S / cell;
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      const dx = (a + 0.5) / n - 0.5;
      const dy = (b + 0.5) / n - 0.5;
      const r = Math.hypot(dx, dy) * 2 + (rand() - 0.5) * 0.22;
      if (r > 1) continue;
      // Black in the middle; at the ragged edge, the sky's own blues breaking up.
      const edge = r > 0.78;
      if (edge && rand() < 0.45) continue;
      ctx.fillStyle = edge ? css(mix([14, 30, 80], BLUE, rand()), 1) : r > 0.6 && rand() < 0.2 ? css([8, 14, 40]) : '#000000';
      ctx.fillRect(a * cell, b * cell, cell, cell);
    }
  }
  // Stars in the black, flat squares of them.
  for (let k = 0; k < 90; k++) {
    const x = S / 2 + (rand() - 0.5) * S * 0.6;
    const y = S / 2 + (rand() - 0.5) * S * 0.6;
    ctx.fillStyle = rand() < 0.2 ? '#c8ffb0' : '#e8f2ff';
    const w = 2 + Math.floor(rand() * 4);
    ctx.fillRect(x, y, w, w);
  }
  const t = finish(c, false);
  t.magFilter = THREE.NearestFilter;
  return t;
});

/**
 * The sky dematerialised: a vast hole torn in the night, its edge coming
 * apart into pixels, and the stars falling flat out of it, little squares
 * of light tumbling down the sky and going out. Hung high in the sky far
 * ahead of the road at `s` (and `lateral` off it), past the world's edge,
 * facing back at it: what the climb to the crest climbs toward.
 */
export function deadSky(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const side = offRoad(ribbon, s, lateral);
  const AHEAD = 420;
  const at = { x: side.x + Math.sin(side.heading) * AHEAD, z: side.z + Math.cos(side.heading) * AHEAD };
  const R = 90;
  const H = 150;
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, 2 * R), new THREE.MeshBasicMaterial({ map: holeTexture(), transparent: true, alphaTest: 0.5, fog: false, side: THREE.DoubleSide }));
  hole.position.y = H;
  g.add(hole);
  // Pixels of sky breaking off its edge, and stars falling flat out of it.
  const rand = seededRandom(5171);
  const count = 70;
  const geo = new THREE.PlaneGeometry(1, 1);
  const pixels: { m: THREE.Mesh; a: number; r: number; ph: number; star: boolean }[] = [];
  for (let k = 0; k < count; k++) {
    const star = k % 3 === 0;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: star ? 0xe8f4ff : mix([14, 40, 110], BLUE, rand()).reduce((h, v) => (h << 8) | (v | 0), 0), transparent: true, fog: false, side: THREE.DoubleSide, depthWrite: false }));
    m.scale.setScalar(star ? 1.6 : 3 + rand() * 3);
    g.add(m);
    pixels.push({ m, a: rand() * Math.PI * 2, r: R * (star ? rand() * 0.6 : 0.8 + rand() * 0.2), ph: rand(), star });
  }
  animated.push((time) => {
    for (const p of pixels) {
      const u = (time * (p.star ? 0.05 : 0.035) + p.ph) % 1;
      // Falling, flat to the ground and tumbling, and going out as they fall.
      p.m.position.set(Math.cos(p.a) * p.r, H + Math.sin(p.a) * p.r - u * (H - 10) * (p.star ? 1 : 0.6), (u - 0.5) * 6);
      p.m.rotation.set(u * 9, p.a, u * 4);
      (p.m.material as THREE.MeshBasicMaterial).opacity = 1 - u;
    }
  });
  g.position.set(at.x, 0, at.z);
  // Facing back at the road.
  g.lookAt(frameAt(ribbon, s).x, 0, frameAt(ribbon, s).z);
  return g;
}

/** A tunnel portal's sign: no lights, and our faith is blind. */
const blindFace = once(() => signFace(['NO LIGHTS', 'OUR FAITH IS BLIND'], '#0a0c12', '#d8e0ee'));

/**
 * Our Faith Is Blind: a concrete box of a tunnel over the dark, its inside
 * black, no lights, a sign over each mouth. It stands over the drop `pits`
 * holds by the branch at `s`: on the final lap a lane runs through it; on
 * the others there's nothing in there but the drop.
 */
export function blindTunnel(ribbon: Ribbon, s: number, pits: readonly PitDef[]): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const pit = pits.reduce((best, p) => (Math.hypot(p.x - f.x, p.z - f.z) < Math.hypot(best.x - f.x, best.z - f.z) ? p : best), pits[0]);
  if (!pit) return g;
  const L = pit.halfLength + 1;
  const W = pit.halfWidth + 0.4;
  const H = 6.5;
  const T = 0.8;
  const outside = concreteMat();
  const inside = new THREE.MeshBasicMaterial({ color: 0x020204, side: THREE.BackSide });
  // The dark inside: a box seen from within, open at its ends.
  const inner = new THREE.Mesh(new THREE.BoxGeometry(2 * W, H, 2 * L, 1, 1, 1), [inside, inside, inside, new THREE.MeshBasicMaterial({ visible: false }), new THREE.MeshBasicMaterial({ visible: false }), new THREE.MeshBasicMaterial({ visible: false })]);
  inner.position.y = H / 2;
  g.add(inner);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(T, H + T, 2 * L), outside);
    wall.position.set(side * (W + T / 2), (H + T) / 2, 0);
    g.add(wall);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2 * W + 2 * T, T, 2 * L), outside);
  roof.position.y = H + T / 2;
  g.add(roof);
  // Down below, where there's no road: dark all the way down.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 2 * L), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -pit.depth + 0.5;
  g.add(floor);
  for (const end of [-1, 1]) {
    const sign = signPanel(2 * W, blindFace(), blindFace());
    sign.scale.y = 0.4;
    sign.position.set(0, H + T + 1.6, end * L);
    if (end > 0) sign.rotation.y = Math.PI;
    g.add(sign);
  }
  g.position.set(pit.x, 0, pit.z);
  g.rotation.y = pit.heading;
  return g;
}

/**
 * A driverless pod, the hazard's look: the pod itself (the same white
 * capsule with nobody in it), its blinkers, its headlights and tail
 * lights, a faint streak of its slipstream on the road behind it, and the
 * pixels it materialises out of and dematerialises into.
 */
export function podParts(obj: THREE.Object3D): THREE.Object3D[] {
  const { group, lidar } = podFigure();
  group.scale.set(AUTOPILOT_HALF_WIDTH / 1, 1, AUTOPILOT_HALF_LENGTH / 2.2);
  const blinkers = new THREE.Group();
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const b = sprite(0xffa020, 1.3);
      b.position.set(side * 1.05, 1.0, end * 2.0);
      b.userData.side = side;
      blinkers.add(b);
    }
  }
  const lights = new THREE.Group();
  for (const side of [-1, 1]) {
    const head = sprite(0xe0f0ff, 1.6);
    head.position.set(side * 0.6, 0.95, 2.3);
    const tail = sprite(0xff2020, 1.0);
    tail.position.set(side * 0.6, 0.95, -2.3);
    lights.add(head, tail);
  }
  const draft = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, AUTOPILOT_DRAFT),
    new THREE.MeshBasicMaterial({ color: BLUE_HEX, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  draft.rotation.x = -Math.PI / 2;
  draft.position.set(0, 0.08, -AUTOPILOT_HALF_LENGTH - AUTOPILOT_DRAFT / 2);
  const pixels = new THREE.Group();
  const rand = seededRandom(5181);
  const cube = new THREE.BoxGeometry(0.42, 0.42, 0.42);
  const pixelMats = [new THREE.MeshBasicMaterial({ color: 0xe8ecf2 }), blueLight()];
  for (let k = 0; k < 36; k++) {
    const m = new THREE.Mesh(cube, pixelMats[k % 4 === 0 ? 1 : 0]);
    m.position.set((rand() - 0.5) * 2, 0.3 + rand() * 1.5, (rand() - 0.5) * 4.2);
    m.userData.k = rand();
    pixels.add(m);
  }
  obj.add(group, blinkers, lights, draft, pixels);
  return [group, lidar, blinkers, lights, draft, pixels];
}

/** Poses a pod's parts (from podParts): turned along its lane, blinking toward the lane it's moving into, materialising. */
export function posePod(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [group, lidar, blinkers, lights, draft, pixels] = parts;
  obj.rotation.y = p.heading;
  const solid = p.gap >= 1;
  group.visible = lights.visible = draft.visible = solid;
  lidar.rotation.y = elapsed * 4;
  // A lateral to the right is local -x: the blinker on that side.
  const on = p.side !== 0 && elapsed % 0.6 < 0.3;
  blinkers.children.forEach((b) => (b.visible = solid && on && b.userData.side === -p.side));
  ((draft as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.06 * Math.sin(elapsed * 6);
  pixels.visible = !solid;
  if (!solid) pixels.children.forEach((m) => (m.visible = m.userData.k < p.gap));
}
