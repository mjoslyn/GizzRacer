import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { STOMP_FOOT, STOMP_HANG, STOMP_STAGES, type HazardPose } from '../items/hazards';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import { billboardTexture, glowTexture } from './textures';

/**
 * Altered Beast I's world, after A New World: as soon as the dust settles,
 * a new world where the old one had been. Cracked flats of dry crusted mud
 * under a bruised dusk, pools lying in them, the old world's ruins broken
 * up in the mud, a meadow growing back and a creek through it; one tree,
 * and by it the brute like a bear with a long dark shadow; the mushroom
 * cloud still standing on the horizon; the beast's footprints everywhere.
 * Its textures (the crusted mud road, the mud flats, the trampled path's
 * walls of mud, the rubble barrier), its scenery, its landmarks, and the
 * beast's foot coming down.
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

/**
 * Mud dried and cracked into plates, as a cell pattern that wraps: for each
 * pixel, how far it is inside its plate (the gap between its nearest and
 * second-nearest seed, 0 on a crack) and which plate it's in.
 */
function plates(size: number, count: number, seed: number): { edge: Float32Array; cell: Uint16Array } {
  const rand = seededRandom(seed);
  const px = Float32Array.from({ length: count }, () => rand() * size);
  const pz = Float32Array.from({ length: count }, () => rand() * size);
  const edge = new Float32Array(size * size);
  const cell = new Uint16Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let d1 = Infinity;
      let d2 = Infinity;
      let k1 = 0;
      for (let k = 0; k < count; k++) {
        let dx = Math.abs(x - px[k]);
        let dy = Math.abs(y - pz[k]);
        if (dx > size / 2) dx = size - dx;
        if (dy > size / 2) dy = size - dy;
        const d = dx * dx + dy * dy;
        if (d < d1) {
          d2 = d1;
          d1 = d;
          k1 = k;
        } else if (d < d2) d2 = d;
      }
      edge[y * size + x] = Math.sqrt(d2) - Math.sqrt(d1);
      cell[y * size + x] = k1;
    }
  }
  return { edge, cell };
}

/**
 * The road: dry crusted mud, cracked into plates that curl up pale at their
 * edges, dark cracks between them, dust settled in the hollows, and the
 * odd stone pressed into it.
 */
export function crustTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 3101);
  const { edge, cell } = plates(S, 46, 3102);
  const tone = Float32Array.from({ length: 46 }, seededRandom(3103));
  paint(ctx, S, S, (_x, _y, i) => {
    const e = edge[i];
    if (e < 1.6 + n[i] * 1.4) return mix([70, 54, 40], [96, 76, 56], n[i]);
    const base = mix([168, 146, 116], [204, 184, 152], tone[cell[i]] * 0.6 + n[i] * 0.4);
    // The plate's rim curls up and catches the light; its middle is dustier.
    const rim = Math.max(0, 1 - (e - 1.6) / 6);
    return shade(mix(base, [222, 206, 178], rim * 0.45), 0.92 + n[i] * 0.12);
  });
  const rand = seededRandom(3104);
  for (let k = 0; k < 120; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 0.8 + rand() * 1.8;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        ctx.fillStyle = rand() < 0.5 ? 'rgba(120,108,96,0.9)' : 'rgba(80,70,62,0.8)';
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return finish(c);
}

/** The ground: wide flats of cracked mud, darker where it's still damp, the meadow coming back green through it in patches. */
export function mudflatTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 5, 3111);
  const damp = fbm(S, 3, 3, 3112);
  const green = fbm(S, 4, 3, 3113);
  const { edge, cell } = plates(S, 90, 3114);
  const tone = Float32Array.from({ length: 90 }, seededRandom(3115));
  paint(ctx, S, S, (_x, _y, i) => {
    const mud = mix([128, 104, 78], [166, 140, 108], tone[cell[i]] * 0.5 + n[i] * 0.5);
    const wet = damp[i] > 0.58 ? Math.min(1, (damp[i] - 0.58) * 6) : 0;
    let col = mix(mud, [84, 66, 52], wet * 0.7);
    if (edge[i] < 2 + n[i] * 2) col = shade(col, 0.55);
    if (green[i] > 0.6) col = mix(col, mix([88, 104, 52], [128, 138, 70], n[i]), Math.min(1, (green[i] - 0.6) * 4));
    return col;
  });
  const rand = seededRandom(3116);
  ctx.lineWidth = 1;
  for (let k = 0; k < 1800; k++) {
    const x = rand() * S;
    const y = rand() * S;
    if (green[Math.floor(y) * S + Math.floor(x)] < 0.55) continue;
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(150,170,80,0.6)' : 'rgba(70,84,40,0.55)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 4, y - 3 - rand() * 5);
    ctx.stroke();
  }
  return finish(c);
}

/**
 * The walls of the path the beast trampled into the earth, and the map's
 * edge: mud laid down in bands, cracked as it dried, roots through it, and
 * the beast's claws raked across it in fours.
 */
export function mudWallTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 4, 3121);
  const band = fbm(S, 2, 2, 3122);
  paint(ctx, S, S, (x, y, i) => {
    const v = y / S;
    const layer = Math.sin((v * 8 + band[i] * 1.8) * Math.PI);
    const mud = mix([96, 72, 52], [150, 120, 88], n[i]);
    return shade(layer > 0.5 ? mix(mud, [176, 150, 112], 0.35) : mud, 0.84 + layer * 0.08 + (x % 64 < 2 ? -0.05 : 0));
  });
  const rand = seededRandom(3123);
  ctx.strokeStyle = 'rgba(46,32,22,0.75)';
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 14; k++) {
    let x = rand() * S;
    let y = rand() * S * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 7; j++) {
      x += (rand() - 0.5) * 18;
      y += 6 + rand() * 12;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Claw marks: four gouges raked down across the bands together.
  for (let k = 0; k < 3; k++) {
    const x = 30 + rand() * (S - 90);
    const y = 30 + rand() * (S - 140);
    const lean = (rand() - 0.5) * 30;
    for (let f = 0; f < 4; f++) {
      const ox = x + f * 9;
      const grad = ctx.createLinearGradient(ox, y, ox + lean, y + 90);
      grad.addColorStop(0, 'rgba(30,20,14,0)');
      grad.addColorStop(0.2, 'rgba(30,20,14,0.85)');
      grad.addColorStop(1, 'rgba(30,20,14,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 4 - f * 0.4;
      ctx.beginPath();
      ctx.moveTo(ox, y);
      ctx.quadraticCurveTo(ox + lean * 0.4, y + 45, ox + lean, y + 90);
      ctx.stroke();
    }
  }
  return finish(c);
}

/** The barrier: the old world broken up, brick and concrete rubble heaped along the road, rusted rebar sticking out of it. */
export function rubbleTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 3, 3131);
  paint(ctx, S, S, (x, y, i) => {
    const v = y / S;
    // Courses of brick along the bottom, broken off unevenly; grey concrete above.
    const top = 0.45 + 0.25 * Math.sin(x * 0.05 + n[i] * 3);
    if (v > top) {
      const row = Math.floor(v * 10);
      const mortar = v * 10 - row < 0.12 || (x + (row % 2) * 16) % 32 < 3;
      return mortar ? [150, 140, 128] : shade(mix([120, 58, 40], [168, 92, 64], n[i]), 0.8 + (((x >> 5) + row) % 3) * 0.08);
    }
    return shade(mix([118, 114, 106], [170, 164, 152], n[i]), 0.85 + n[i] * 0.2);
  });
  const rand = seededRandom(3132);
  ctx.strokeStyle = 'rgba(120,60,30,0.9)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 8; k++) {
    const x = rand() * S;
    ctx.beginPath();
    ctx.moveTo(x, S * 0.45);
    ctx.lineTo(x + (rand() - 0.5) * 30, S * (0.05 + rand() * 0.2));
    ctx.stroke();
  }
  return finish(c);
}

/** A bear's paw print pressed into the mud: the pad, five toes and the claws' holes, looking up the texture's v. */
const pawPrintTexture = once(() => {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(46,32,22,0.85)';
  ctx.beginPath();
  ctx.ellipse(S / 2, S * 0.64, S * 0.26, S * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let k = 0; k < 5; k++) {
    const a = Math.PI * (1.15 + (k / 4) * 0.7);
    const x = S / 2 + Math.cos(a) * S * 0.3;
    const y = S * 0.5 + Math.sin(a) * S * 0.3;
    ctx.beginPath();
    ctx.ellipse(x, y, S * 0.07, S * 0.09, a + Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(S / 2 + Math.cos(a) * S * 0.44, S * 0.5 + Math.sin(a) * S * 0.44, S * 0.02, S * 0.04, a + Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, false);
});

/** Cracks starring out from where a foot came down. */
const crackTexture = once(() => {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.clearRect(0, 0, S, S);
  const rand = seededRandom(3141);
  ctx.strokeStyle = 'rgba(40,28,20,0.9)';
  for (let k = 0; k < 11; k++) {
    let x = S / 2;
    let y = S / 2;
    let a = (k / 11) * Math.PI * 2 + rand() * 0.4;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      a += (rand() - 0.5) * 0.7;
      x += Math.cos(a) * (6 + rand() * 6);
      y += Math.sin(a) * (6 + rand() * 6);
      ctx.lineTo(x, y);
      ctx.lineWidth = Math.max(0.6, 3 - j * 0.5);
    }
    ctx.stroke();
  }
  return finish(c, false);
});

const glowTex = once(() => glowTexture());
/** The beast's fur: shaggy, brown going grey, in clumps. */
const furTex = once(() => {
  const S = 128;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 3, 3171);
  const clump = fbm(S, 4, 2, 3172);
  paint(ctx, S, S, (x, y, i) => shade(mix([96, 72, 52], [164, 132, 100], n[i] * 0.6 + clump[i] * 0.4), 0.78 + 0.22 * Math.abs(Math.sin(x * 0.8 + y * 0.15 + n[i] * 9))));
  return finish(c);
});

function frameAt(ribbon: Ribbon, s: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x, z: p.z, y: ribbon.heightAt(s), heading: Math.atan2(p.tx, p.tz) };
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

/** A flat, ragged disc lying on the ground, `r` across: a pool, or a footprint's shadow. */
function puddle(r: number, rand: () => number): THREE.ShapeGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 14;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const d = r * (0.75 + rand() * 0.35);
    pts.push(new THREE.Vector2(Math.cos(a) * d, Math.sin(a) * d * (0.6 + rand() * 0.2)));
  }
  const geo = new THREE.ShapeGeometry(new THREE.Shape(pts));
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/**
 * The beast: half made of man, half of bear, standing up on its hind legs
 * like a man, its arms hanging long, claws out, its eyes lit. Sits at the
 * origin facing +z, `h` tall. Its chest and head, to set breathing and
 * looking.
 */
function beastFigure(h: number): { body: THREE.Group; chest: THREE.Object3D; head: THREE.Object3D } {
  const body = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ map: furTex() });
  const dark = lambert(0x1e1612);
  const claw = lambert(0xe8e0c8);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffb020 });
  const blob = new THREE.SphereGeometry(1, 14, 10);
  const k = h / 9;
  // Legs, bowed like a bear's, standing like a man's.
  for (const side of [-1, 1]) {
    const thigh = new THREE.Mesh(blob, fur);
    thigh.scale.set(0.9 * k, 1.6 * k, 0.95 * k);
    thigh.position.set(side * 0.95 * k, 2.4 * k, 0);
    const shin = new THREE.Mesh(blob, fur);
    shin.scale.set(0.7 * k, 1.3 * k, 0.75 * k);
    shin.position.set(side * 1.05 * k, 0.95 * k, 0.1 * k);
    const foot = new THREE.Mesh(blob, dark);
    foot.scale.set(0.7 * k, 0.3 * k, 1.1 * k);
    foot.position.set(side * 1.05 * k, 0.2 * k, 0.5 * k);
    body.add(thigh, shin, foot);
  }
  const chest = new THREE.Group();
  chest.position.y = 4.6 * k;
  const torso = new THREE.Mesh(blob, fur);
  torso.scale.set(1.9 * k, 2.3 * k, 1.4 * k);
  const hump = new THREE.Mesh(blob, fur);
  hump.scale.set(1.5 * k, 1.1 * k, 1.1 * k);
  hump.position.set(0, 1.9 * k, -0.6 * k);
  chest.add(torso, hump);
  // Arms hanging long, a man's shoulders, a bear's paws and claws.
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(blob, fur);
    arm.scale.set(0.6 * k, 2.1 * k, 0.65 * k);
    arm.position.set(side * 2.1 * k, -0.4 * k, 0.2 * k);
    arm.rotation.z = side * 0.15;
    const paw = new THREE.Mesh(blob, dark);
    paw.scale.set(0.55 * k, 0.5 * k, 0.6 * k);
    paw.position.set(side * 2.45 * k, -2.5 * k, 0.4 * k);
    chest.add(arm, paw);
    for (let f = 0; f < 4; f++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.08 * k, 0.6 * k, 5), claw);
      c.position.set(side * 2.45 * k + (f - 1.5) * 0.16 * k, -2.95 * k, 0.65 * k);
      c.rotation.x = Math.PI * 0.85;
      chest.add(c);
    }
  }
  const head = new THREE.Group();
  head.position.y = 3.1 * k;
  const skull = new THREE.Mesh(blob, fur);
  skull.scale.set(0.95 * k, 0.9 * k, 0.95 * k);
  const snout = new THREE.Mesh(blob, fur);
  snout.scale.set(0.5 * k, 0.42 * k, 0.6 * k);
  snout.position.set(0, -0.25 * k, 0.85 * k);
  const nose = new THREE.Mesh(blob, dark);
  nose.scale.set(0.2 * k, 0.15 * k, 0.15 * k);
  nose.position.set(0, -0.12 * k, 1.42 * k);
  head.add(skull, snout, nose);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(blob, fur);
    ear.scale.set(0.3 * k, 0.3 * k, 0.15 * k);
    ear.position.set(side * 0.7 * k, 0.75 * k, -0.1 * k);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11 * k, 8, 6), eyeMat);
    eye.position.set(side * 0.38 * k, 0.12 * k, 0.82 * k);
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffa020, blending: THREE.AdditiveBlending, depthWrite: false }));
    glint.scale.setScalar(0.9 * k);
    glint.position.copy(eye.position);
    head.add(ear, eye, glint);
  }
  chest.add(head);
  body.add(chest);
  return { body, chest, head };
}

/**
 * The new world: pools lying in the cracked mud, the old world's ruins
 * broken up in it (brick walls with a window still in them, slabs of
 * concrete tipped up, a bent lamppost), dead trees, tussocks of the meadow
 * growing back with flowers in them, and the beast's footprints, a line of
 * them, wherever you look.
 */
export function newWorldFeature(animated: Animated): Feature {
  const water = new THREE.MeshPhongMaterial({ color: 0x5a6a78, emissive: 0x2a2a3a, shininess: 140, specular: 0xffd8b0, transparent: true, opacity: 0.9 });
  const rustWater = new THREE.MeshPhongMaterial({ color: 0x5a2a22, emissive: 0x2a0e0a, shininess: 140, specular: 0xffc0a0, transparent: true, opacity: 0.9 });
  const rim = lambert(0x5a4434);
  const brick = new THREE.MeshLambertMaterial({ map: rubbleTexture() });
  const concrete = lambert(0x9a958a, { flatShading: true });
  const rust = lambert(0x7a3a1e);
  const bark = lambert(0x3a2e26);
  const grass = lambert(0x7a8a40, { side: THREE.DoubleSide });
  const dry = lambert(0xb0a060, { side: THREE.DoubleSide });
  const flowers = [0xe8d84a, 0xd86a8a, 0xf0f0e8, 0x9a7ad8].map((c) => lambert(c));
  const print = new THREE.MeshBasicMaterial({ map: pawPrintTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const blade = new THREE.ConeGeometry(0.12, 1, 3);
  const pool: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 3 + rand() * 6;
    const bank = new THREE.Mesh(puddle(r * 1.15, rand), rim);
    bank.position.y = 0.03;
    const surface = new THREE.Mesh(puddle(r, rand), rand() < 0.15 ? rustWater : water);
    surface.position.y = 0.07;
    t.add(bank, surface);
    return place(t, x, z, rand);
  };
  const ruin: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 6 + rand() * 8;
    const h = 3 + rand() * 4;
    // A brick wall broken off at the top, a window still in it.
    const win = w * (0.25 + rand() * 0.25);
    const left = (w - win) * (0.3 + rand() * 0.4);
    const right = w - win - left;
    const pieces: [number, number, number, number][] = [
      [-w / 2 + left / 2, left, h * (0.7 + rand() * 0.3), 0],
      [w / 2 - right / 2, right, h * (0.4 + rand() * 0.6), 0],
      [-w / 2 + left + win / 2, win, h * 0.3, 0],
      [-w / 2 + left + win / 2, win, h * 0.15, h * (0.75 + rand() * 0.1)],
    ];
    for (const [cx, pw, ph, y0] of pieces) {
      if (y0 > 0 && y0 + ph > Math.min(pieces[0][2], pieces[1][2])) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.6), brick);
      m.position.set(cx, y0 + ph / 2, 0);
      t.add(m);
    }
    // Rubble at its foot, and rebar bent out of the break.
    for (let k = 0; k < 5; k++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + rand() * 0.6, 0), rand() < 0.5 ? concrete : brick);
      r.position.set((rand() - 0.5) * w, 0.2, 0.8 + rand() * 1.6);
      r.rotation.set(rand() * 3, rand() * 3, 0);
      t.add(r);
    }
    for (let k = 0; k < 3; k++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 4), rust);
      bar.position.set(-w / 2 + rand() * left, pieces[0][2] + 0.5, 0);
      bar.rotation.z = (rand() - 0.5) * 1.2;
      t.add(bar);
    }
    return place(t, x, z, rand);
  };
  const slab: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 4 + rand() * 5;
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, w * (0.6 + rand() * 0.4)), concrete);
    s.rotation.set(0.3 + rand() * 0.6, 0, (rand() - 0.5) * 0.4);
    s.position.y = w * 0.2;
    t.add(s);
    return place(t, x, z, rand);
  };
  const lamppost: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 7 + rand() * 3;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h, 6), rust);
    pole.position.y = h / 2;
    const bend = new THREE.Group();
    bend.position.y = h;
    bend.rotation.z = 0.6 + rand() * 1.2;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.4, 6), rust);
    arm.position.y = 1.2;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.9), lambert(0x2a2a2a));
    lamp.position.y = 2.4;
    bend.add(arm, lamp);
    t.add(pole, bend);
    t.rotation.z = (rand() - 0.5) * 0.3;
    return place(t, x, z, rand);
  };
  const deadTree: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 6 + rand() * 6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.5, h, 6), bark);
    trunk.position.y = h / 2;
    t.add(trunk);
    for (let k = 0; k < 4; k++) {
      const len = 2 + rand() * 3;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, len, 5), bark);
      const a = rand() * Math.PI * 2;
      const tilt = 0.6 + rand() * 0.6;
      b.position.set(Math.cos(a) * Math.sin(tilt) * len * 0.5, h * (0.55 + rand() * 0.4) + Math.cos(tilt) * len * 0.5, Math.sin(a) * Math.sin(tilt) * len * 0.5);
      b.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
      t.add(b);
    }
    return place(t, x, z, rand);
  };
  const tussock: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 12 + Math.floor(rand() * 10);
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(blade, rand() < 0.6 ? grass : dry);
      const h = 0.8 + rand() * 1.2;
      b.scale.set(1, h, 1);
      b.position.set((rand() - 0.5) * 2.4, h / 2, (rand() - 0.5) * 2.4);
      b.rotation.set((rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 0.5);
      t.add(b);
    }
    if (rand() < 0.6) {
      const mat = flowers[Math.floor(rand() * flowers.length)];
      for (let k = 0; k < 5; k++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), mat);
        f.position.set((rand() - 0.5) * 2.4, 1 + rand() * 0.8, (rand() - 0.5) * 2.4);
        t.add(f);
      }
    }
    const ph = rand() * 10;
    // Bending in the wind, which whistles here.
    animated.push((time) => (t.rotation.z = Math.sin(time * 1.3 + ph) * 0.06));
    t.position.set(x, 0, z);
    return t;
  };
  // The beast passed here: a line of its prints pressed into the mud.
  const tracks: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 4 + Math.floor(rand() * 4);
    const geo = new THREE.PlaneGeometry(3.2, 3.2);
    geo.rotateX(-Math.PI / 2);
    for (let k = 0; k < n; k++) {
      const p = new THREE.Mesh(geo, print);
      p.position.set((k % 2 ? 1 : -1) * 1.4, 0.05, k * 4.2);
      p.rotation.y = Math.PI + (rand() - 0.5) * 0.2;
      p.renderOrder = 1;
      t.add(p);
    }
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [3, pool],
      [3, ruin],
      [1.5, slab],
      [1, lamppost],
      [2, deadTree],
      [5, tussock],
      [1.5, tracks],
    ])(x, z, rand);
}

/** A sign, facing the karts coming. */
function sign(text: string, bg: string, fg: string, width: number): THREE.Mesh {
  const map = billboardTexture(text, bg, fg);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.25), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
  m.rotation.y = Math.PI;
  return m;
}

/**
 * The start: the ruin of a gate of the old world. Two brick piers either
 * side of the road, broken off at different heights, rebar sticking out of
 * them; the iron arch between them snapped and half of it hanging down;
 * the old name gone, a board hung crooked from it on one chain, A NEW
 * WORLD painted on it, swinging in the wind.
 */
export function newWorldGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const brick = new THREE.MeshLambertMaterial({ map: rubbleTexture() });
  const iron = lambert(0x4a3a30);
  const rust = lambert(0x7a3a1e);
  const heights = [13, 9];
  [-1, 1].forEach((side, k) => {
    const h = heights[k];
    const pier = new THREE.Mesh(new THREE.BoxGeometry(3, h, 3), brick);
    pier.position.set(side * hw, h / 2, 0);
    // The top broken off: a jagged chunk tipped over.
    const chunk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 2.6), brick);
    chunk.position.set(side * hw + side * 0.4, h + 0.5, 0.3);
    chunk.rotation.set(0.3, 0, side * 0.4);
    g.add(pier, chunk);
    for (let r = 0; r < 4; r++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 4), rust);
      bar.position.set(side * hw + (r - 1.5) * 0.6, h + 1, (r % 2) * 0.8 - 0.4);
      bar.rotation.set((r - 1.5) * 0.25, 0, side * (0.2 + r * 0.1));
      g.add(bar);
    }
    // Rubble at its foot.
    for (let r = 0; r < 6; r++) {
      const rb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + (r % 3) * 0.3, 0), brick);
      rb.position.set(side * (hw + 2 + (r % 3)), 0.3, -3 + r * 1.2);
      rb.rotation.set(r, r * 2, 0);
      g.add(rb);
    }
  });
  // The arch, from the taller pier out over the road and snapped off; its other half hangs down from the shorter.
  const R = hw;
  const arcA = new THREE.Mesh(new THREE.TorusGeometry(R, 0.35, 6, 24, Math.PI * 0.55), iron);
  arcA.rotation.y = Math.PI;
  arcA.scale.y = 0.5;
  arcA.position.set(0, heights[0] - 1, 0);
  g.add(arcA);
  const hang = new THREE.Group();
  hang.position.set(hw, heights[1], 0);
  const arcB = new THREE.Mesh(new THREE.TorusGeometry(R * 0.5, 0.35, 6, 12, Math.PI * 0.5), iron);
  arcB.rotation.z = -Math.PI * 0.75;
  hang.add(arcB);
  g.add(hang);
  // The board on its one chain, from the arch's broken end.
  const end = new THREE.Vector3(-R * Math.cos(Math.PI * 0.55), heights[0] - 1 + 0.5 * R * Math.sin(Math.PI * 0.55), 0);
  const swing = new THREE.Group();
  swing.position.copy(end);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 4), iron);
  chain.position.y = -1.2;
  const board = sign('A NEW WORLD', '#3a2a1e', '#e8d8b0', hw * 0.9);
  board.position.set(hw * 0.35, -2.4 - hw * 0.11, 0);
  board.rotation.z = -0.22;
  swing.add(chain, board);
  g.add(swing);
  animated.push((time) => {
    swing.rotation.z = Math.sin(time * 0.9) * 0.08 + Math.sin(time * 2.3) * 0.03;
    swing.rotation.x = Math.sin(time * 0.7 + 1) * 0.05;
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * By the tree: one tree in the new world, old and huge, gnarled, a few
 * dark clumps of leaves still on it; and beside it the altered beast,
 * standing up on its hind legs, three times the height of a man, swaying
 * on its unsteady gait, breathing, looking round for you; its long dark
 * shadow thrown out across the mud from the low sun.
 */
export function beastTree(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const rand = seededRandom(3151);
  const bark = lambert(0x3e3028);
  const leaves = lambert(0x2e4a2a, { flatShading: true });
  const H = 22;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.4, H, 10), bark);
  trunk.position.y = H / 2;
  trunk.rotation.z = 0.06;
  g.add(trunk);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + rand() * 0.5;
    const len = 9 + rand() * 6;
    const limb = new THREE.Group();
    limb.position.y = H * (0.6 + rand() * 0.35);
    limb.rotation.set(0, a, 0);
    const bough = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.8, len, 6), bark);
    bough.rotation.z = -(0.7 + rand() * 0.5);
    bough.position.set(Math.sin(-bough.rotation.z) * len * 0.5, Math.cos(bough.rotation.z) * len * 0.5, 0);
    limb.add(bough);
    const tip = new THREE.Vector3(Math.sin(-bough.rotation.z) * len, Math.cos(bough.rotation.z) * len, 0);
    for (let j = 0; j < 3; j++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), leaves);
      c.scale.set(2.5 + rand() * 2, 1.6 + rand(), 2.5 + rand() * 2);
      c.position.set(tip.x + (rand() - 0.5) * 4, tip.y + rand() * 2, (rand() - 0.5) * 4);
      limb.add(c);
    }
    g.add(limb);
  }
  // Roots humped up out of the mud.
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.7, 6, 5), bark);
    root.position.set(Math.cos(a) * 3, 0.3, Math.sin(a) * 3);
    root.rotation.set(0, -a, Math.PI / 2 - 0.25);
    root.rotation.order = 'YZX';
    g.add(root);
  }
  // The beast, by the tree, and its long dark shadow on the mud.
  const { body, chest, head } = beastFigure(10);
  const stand = new THREE.Group();
  stand.position.set(7, 0, 4);
  stand.add(body);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6, 34), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.06, -15);
  shadow.scale.set(1, 1, 1);
  stand.add(shadow);
  g.add(stand);
  // Facing out toward the road, its shadow thrown out behind it.
  const road = frameAt(ribbon, s);
  stand.rotation.y = Math.atan2(road.x - at.x - 7, road.z - at.z - 4);
  animated.push((time) => {
    // Breathing; swaying from foot to foot on its unsteady gait; looking round.
    chest.scale.set(1 + Math.sin(time * 1.4) * 0.03, 1 + Math.sin(time * 1.4) * 0.02, 1 + Math.sin(time * 1.4) * 0.04);
    body.rotation.z = Math.sin(time * 0.8) * 0.06;
    head.rotation.y = Math.sin(time * 0.35) * 0.7;
    head.rotation.x = Math.sin(time * 0.5) * 0.1;
  });
  g.position.set(at.x, 0, at.z);
  return g;
}

/**
 * The mushroom cloud: still standing far off on the horizon where the old
 * world went up, a column of smoke lit orange at its foot by the fire
 * under it, a ring of cloud round its stem, and its cap boiling over at the
 * top, slowly rolling.
 */
export function mushroomCloud(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const rand = seededRandom(3161);
  const puff = new THREE.IcosahedronGeometry(1, 2);
  const smoke = (glow: number) => lambert(0x7a6a62, { emissive: new THREE.Color(0xff6a20).multiplyScalar(glow), fog: false });
  const mats = [0.9, 0.55, 0.3, 0.15, 0.08].map(smoke);
  const H = 190;
  const stem = new THREE.Group();
  for (let k = 0; k < 40; k++) {
    const u = k / 40;
    const b = new THREE.Mesh(puff, mats[Math.min(4, Math.floor(u * 5))]);
    const r = 14 + 6 * Math.sin(u * 9) + rand() * 6;
    b.scale.set(r, r * 0.8, r);
    b.position.set((rand() - 0.5) * 12, u * H, (rand() - 0.5) * 12);
    stem.add(b);
  }
  // Billowing out along the ground at its foot.
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const b = new THREE.Mesh(puff, mats[0]);
    b.scale.set(22 + rand() * 8, 12 + rand() * 6, 22 + rand() * 8);
    b.position.set(Math.cos(a) * 40, 6, Math.sin(a) * 40);
    stem.add(b);
  }
  const collar = new THREE.Group();
  collar.position.y = H * 0.55;
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const b = new THREE.Mesh(puff, mats[2]);
    b.scale.set(12, 6, 12);
    b.position.set(Math.cos(a) * 30, 0, Math.sin(a) * 30);
    collar.add(b);
  }
  const cap = new THREE.Group();
  cap.position.y = H;
  for (let k = 0; k < 46; k++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * 75;
    const b = new THREE.Mesh(puff, mats[k < 12 ? 2 : k < 26 ? 3 : 4]);
    const r = 22 + rand() * 16;
    b.scale.set(r, r * 0.75, r);
    // A cap: domed in the middle, curling under at its rim.
    b.position.set(Math.cos(a) * d, 30 * Math.cos((d / 80) * (Math.PI / 2)) - (d > 60 ? 12 : 0), Math.sin(a) * d);
    cap.add(b);
  }
  const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff7a30, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  fire.scale.set(260, 120, 1);
  fire.position.y = 20;
  g.add(stem, collar, cap, fire);
  animated.push((time) => {
    cap.rotation.y = time * 0.02;
    collar.rotation.y = -time * 0.03;
    const swell = 1 + 0.03 * Math.sin(time * 0.2);
    cap.scale.set(swell, 1, swell);
    (fire.material as THREE.SpriteMaterial).opacity = 0.55 + 0.15 * Math.sin(time * 0.9);
  });
  g.position.set(at.x, 0, at.z);
  g.scale.setScalar(1.4);
  return g;
}

/**
 * The altered beast's foot, for its footfalls across the road: a huge paw,
 * furred, its sole black and five claws on it, the leg going up out of
 * sight; its shadow on the road where it's coming down; the ring of dust
 * the shockwave throws out across the road; the cracks it leaves. Sits at
 * the origin facing +z.
 */
export function stompParts(obj: THREE.Object3D): THREE.Object3D[] {
  const fur = new THREE.MeshLambertMaterial({ map: furTex() });
  const sole = lambert(0x1a1210);
  const claw = lambert(0xe8e0c8);
  const R = STOMP_FOOT;
  const foot = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), fur);
  pad.scale.set(R * 0.85, R * 0.5, R);
  pad.position.y = R * 0.45;
  const under = new THREE.Mesh(new THREE.CircleGeometry(R * 0.8, 20), sole);
  under.rotation.x = Math.PI / 2;
  under.position.y = 0.05;
  foot.add(pad, under);
  for (let k = 0; k < 5; k++) {
    const a = Math.PI * (-0.3 + (k / 4) * 0.6);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(R * 0.26, 10, 8), fur);
    toe.position.set(Math.sin(a) * R * 0.8, R * 0.25, Math.cos(a) * R * 0.95);
    const c = new THREE.Mesh(new THREE.ConeGeometry(R * 0.08, R * 0.45, 6), claw);
    c.position.set(Math.sin(a) * R * 1.1, R * 0.12, Math.cos(a) * R * 1.25);
    c.rotation.set(Math.PI / 2 + 0.3, 0, -a);
    foot.add(toe, c);
  }
  // The leg, up into the dust the beast is raising: you only ever see its foot.
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.7, R * 0.9, 9, 14), fur);
  leg.position.set(0, 4.5 + R * 0.5, -R * 0.3);
  foot.add(leg);
  const haze = new THREE.SpriteMaterial({ map: glowTex(), color: 0x9a8468, transparent: true, opacity: 0.95, depthWrite: false });
  for (let k = 0; k < 9; k++) {
    const d = new THREE.Sprite(haze);
    const a = (k / 9) * Math.PI * 2;
    d.position.set(Math.cos(a) * R * (k % 3 ? 0.9 : 0.2), 8 + R * 0.5 + (k % 3) * 1.5, Math.sin(a) * R * 0.9 - R * 0.3);
    d.scale.setScalar(R * (3.5 + (k % 2)));
    foot.add(d);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(R * 1.1, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  shadow.rotation.x = -Math.PI / 2;
  // The ring of the shockwave, 1 out at scale 1; dust thrown up along it.
  const ring = new THREE.Group();
  const band = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), new THREE.MeshBasicMaterial({ color: 0xd8c8a8, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  band.rotation.x = -Math.PI / 2;
  ring.add(band);
  const dustMat = new THREE.SpriteMaterial({ map: glowTex(), color: 0xc8b490, transparent: true, opacity: 0.6, depthWrite: false });
  for (let k = 0; k < 16; k++) ring.add(new THREE.Sprite(dustMat));
  const cracks = new THREE.Mesh(new THREE.PlaneGeometry(R * 4, R * 4), new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  cracks.rotation.x = -Math.PI / 2;
  const parts = [foot, shadow, ring, cracks];
  obj.add(...parts);
  return parts;
}

/** Poses the foot for a footfall at stage `p.phase`: raised over the road, coming down, planted, and lifting away. */
export function poseStomp(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [foot, shadow, ring, cracks] = parts;
  const S = STOMP_STAGES;
  const u = p.phase;
  const lift = p.y - p.ground;
  obj.rotation.y = p.heading;
  // A left foot or a right one: the paw mirrored.
  foot.scale.x = p.side;
  // Raised, it hangs heavy, shifting; planted, it presses down.
  foot.position.set(lift > 0.1 ? Math.sin(elapsed * 1.7) * 0.3 : 0, 0, 0);
  // Its shadow on the road where it'll come down, darker and smaller the nearer it gets.
  const near = 1 - Math.min(1, lift / STOMP_HANG);
  shadow.position.y = -lift + 0.08;
  shadow.scale.setScalar(1.6 - near * 0.6);
  (shadow as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.2 + near * 0.5;
  shadow.visible = lift > 0.05;
  ring.visible = p.gap > 0;
  if (ring.visible) {
    const w = (u - S.land) / (S.gone - S.land);
    ring.position.y = -lift + 0.12;
    const [band, ...dust] = ring.children as [THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>, ...THREE.Sprite[]];
    band.scale.set(p.gap, p.gap, 1);
    band.material.opacity = 0.85 * (1 - w * 0.7);
    dust.forEach((d, k) => {
      const a = (k / dust.length) * Math.PI * 2;
      d.position.set(Math.cos(a) * p.gap, 0.6 + w, Math.sin(a) * p.gap);
      d.scale.set(2.5 + w * 2, 2 + w * 1.5, 1);
    });
    dust[0].material.opacity = 0.6 * (1 - w);
  }
  // Cracks where it came down, until it lifts away and the dust settles over them.
  cracks.visible = u >= S.land && u < S.lift + 0.1;
  cracks.position.y = -lift + 0.07;
  (cracks as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = u < S.lift ? 0.9 : 0.9 * (1 - (u - S.lift) / 0.1);
}
