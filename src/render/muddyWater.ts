import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { SHARK_HEAD, SHARK_RADIUS, SHARK_STAGES, SHARK_TAIL, SHARK_WAKE, type HazardPose } from '../items/hazards';
import type { PitDef } from '../tracks/builder';
import { DUNES, RIVER, SHORE } from '../tracks/muddyWater';
import { nearestOnSpline, pointAt } from '../tracks/spline';
import { inPit, type Ribbon, type Track } from '../tracks/track';
import { glowTexture } from './textures';

/**
 * Muddy Water's world, the Gumboot Soup Cup's first: a blazing Australian
 * summer, the beach and the bush river behind it. The beach is hostile:
 * bleached sand too hot to walk on, a sea so cold it freezes you, sharks,
 * the shark-spotting helicopter going over, the lifesavers' flags, beach
 * cricket and the muscle men basking in their vanity. The river is the
 * refuge: red clay banks, gum trees and tea trees, the willow over the
 * driftwood, brown water and the fish in it. Its textures (the red clay
 * track, the sunburnt bush ground, the bleached sand, sandstone, the surf
 * club's red and yellow rails, the sea and the river), the coast laid
 * round the lap (the sea and its surf, the beach, the dunes, the river
 * down to its mouth), its scenery, its landmarks (the flags at the start,
 * the helicopter, the willow, the billabong's ford), the riverbed under
 * the muddy water, and its hazard's look (the sharks).
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
const css = ([r, g, b]: RGB, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

/** The lifesavers' red and yellow, and the river's brown. */
const RED = 0xd8202a;
const YELLOW = 0xffd21a;
export const MURK = 0x6a4a28;

/** Cracks like baked clay's: a net of short dark strokes, wrapped round the tile. */
function crackle(ctx: CanvasRenderingContext2D, S: number, rand: () => number, n: number, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    let x = rand() * S;
    let y = rand() * S;
    let a = rand() * Math.PI * 2;
    const steps = 3 + Math.floor(rand() * 4);
    for (let j = 0; j < steps; j++) {
      const len = 6 + rand() * 14;
      const nx = x + Math.cos(a) * len;
      const ny = y + Math.sin(a) * len;
      for (const [ox, oy] of [
        [0, 0],
        [S, 0],
        [-S, 0],
        [0, S],
        [0, -S],
      ]) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(nx + ox, ny + oy);
        ctx.stroke();
      }
      x = nx;
      y = ny;
      a += (rand() - 0.5) * 1.6;
    }
  }
}

/**
 * The road: a red-brown clay track down to the river, baked hard and
 * cracked by the sun, two pale ruts worn into it where the wheels run,
 * grit and gum leaves in it. The texture spans half the road (its u
 * across, its v along).
 */
export function clayRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7101);
  const fine = fbm(S, 32, 2, 7102);
  const dark: RGB = [138, 62, 36];
  const light: RGB = [196, 104, 62];
  const dust: RGB = [222, 168, 118];
  paint(ctx, S, S, (x, _y, i) => {
    let col = mix(dark, light, n[i]);
    // The rut, worn pale and dusty, a little in from the road's middle (the tile's edge at u = 0).
    const u = x / S;
    const rut = Math.exp(-(((u - 0.45) / 0.12) ** 2));
    col = mix(col, dust, rut * (0.45 + 0.25 * fine[i]));
    return shade(col, 0.9 + 0.2 * fine[i]);
  });
  const rand = seededRandom(7103);
  crackle(ctx, S, rand, 60, 'rgba(70,26,14,0.55)', 1.4);
  // Grit and pebbles.
  for (let k = 0; k < 260; k++) {
    ctx.fillStyle = css(rand() < 0.5 ? [236, 200, 150] : [96, 44, 26], 0.6);
    ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 2, 1 + rand() * 2);
  }
  // A few gum leaves blown across it: grey-green crescents.
  for (let k = 0; k < 9; k++) {
    ctx.save();
    ctx.translate(rand() * S, rand() * S);
    ctx.rotate(rand() * Math.PI);
    ctx.fillStyle = rand() < 0.5 ? 'rgba(120,130,96,0.85)' : 'rgba(170,120,70,0.85)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return finish(c);
}

/** The ground: sunburnt bush, red earth through dry yellow grass that won't last, leaf litter and a few green tussocks. */
export function bushGroundTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 7201);
  const patch = fbm(S, 8, 3, 7202);
  const earth: RGB = [164, 96, 58];
  const straw: RGB = [214, 184, 104];
  const burnt: RGB = [176, 150, 84];
  paint(ctx, S, S, (_x, _y, i) => {
    const g = Math.max(0, Math.min(1, (patch[i] - 0.38) * 3));
    return shade(mix(earth, mix(burnt, straw, n[i]), g), 0.85 + 0.3 * n[i]);
  });
  const rand = seededRandom(7203);
  // Grass blades.
  for (let k = 0; k < 900; k++) {
    const x = rand() * S;
    const y = rand() * S;
    ctx.strokeStyle = css(rand() < 0.15 ? [120, 140, 70] : rand() < 0.5 ? [232, 206, 130] : [180, 150, 80], 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 4, y - 3 - rand() * 4);
    ctx.stroke();
  }
  // Leaf litter and twigs.
  for (let k = 0; k < 60; k++) {
    ctx.fillStyle = css(rand() < 0.5 ? [120, 120, 90] : [130, 80, 50], 0.8);
    ctx.fillRect(rand() * S, rand() * S, 3, 1);
  }
  return finish(c);
}

/** The beach: bleached sand, rippled by the wind, shell grit in it. */
export function beachSandTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7301);
  const low: RGB = [226, 206, 166];
  const high: RGB = [250, 240, 214];
  paint(ctx, S, S, (x, y, i) => {
    const ripple = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * 9 + n[i] * 5 + (x / S) * Math.PI * 2);
    return shade(mix(low, high, n[i] * 0.7 + ripple * 0.3), 0.95 + 0.08 * ripple);
  });
  const rand = seededRandom(7302);
  for (let k = 0; k < 220; k++) {
    ctx.fillStyle = css(rand() < 0.6 ? [255, 250, 236] : [180, 150, 120], 0.7);
    ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }
  return finish(c);
}

/** Cliffs and walls: Sydney sandstone, cream and ochre in beds, rusty iron bands through it and honeycomb weathering. */
export function sandstoneTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 5, 7401);
  const cream: RGB = [226, 196, 146];
  const ochre: RGB = [204, 140, 76];
  const rust: RGB = [150, 70, 36];
  paint(ctx, S, S, (x, y, i) => {
    const bed = 0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * 5 + n[i] * 4);
    let col = mix(cream, ochre, bed * 0.8);
    const band = Math.abs(Math.sin((y / S) * Math.PI * 2 * 3 + (x / S) * Math.PI * 2 + n[i] * 6));
    if (band < 0.08) col = mix(col, rust, 0.75);
    return shade(col, 0.82 + 0.3 * n[i]);
  });
  const rand = seededRandom(7402);
  for (let k = 0; k < 90; k++) {
    const r = 1.5 + rand() * 4;
    ctx.fillStyle = 'rgba(90,50,26,0.45)';
    ctx.beginPath();
    ctx.ellipse(rand() * S, rand() * S, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/** The low rails: the surf club's, timber painted red and yellow in blocks, a white rail along the top. */
export function railTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 64);
  ctx.fillStyle = '#d8202a';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#ffd21a';
  ctx.fillRect(64, 0, 64, 64);
  ctx.fillStyle = '#f8f4ec';
  ctx.fillRect(0, 0, 128, 9);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 9, 128, 2);
  ctx.fillRect(0, 60, 128, 4);
  // The grain, and sun-bleaching.
  const rand = seededRandom(7501);
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = `rgba(255,255,255,${0.05 + rand() * 0.1})`;
    ctx.fillRect(rand() * 128, 12 + rand() * 46, 10 + rand() * 30, 1);
  }
  return finish(c);
}

/** The sea: deep blue out past the break, green-turquoise in the shallows, glints of the sun on it. */
const seaTexture = once(() => {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7601);
  const deep: RGB = [22, 104, 170];
  const shallow: RGB = [60, 186, 196];
  paint(ctx, S, S, (_x, _y, i) => {
    const w = Math.max(0, Math.min(1, n[i] * 1.6 - 0.3));
    return mix(deep, shallow, w);
  });
  const rand = seededRandom(7602);
  for (let k = 0; k < 160; k++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.5})`;
    ctx.fillRect(rand() * S, rand() * S, 2 + rand() * 6, 1);
  }
  return finish(c);
});

/** Foam: the white water of a wave breaking, torn at its edges. */
const foamTexture = once(() => {
  const W = 256;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  const n = fbm(W, 16, 3, 7701);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // Densest along its middle, torn into lace toward its edges.
      const across = 1 - Math.abs(y / H - 0.5) * 2;
      const a = Math.max(0, Math.min(1, across * 1.6 - 0.25 - (1 - n[(y % W) * W + x]) * 0.9));
      img.data[i * 4] = 255;
      img.data[i * 4 + 1] = 255;
      img.data[i * 4 + 2] = 250;
      img.data[i * 4 + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = finish(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
});

/** The river: brown water, lighter streaks where it runs, the sky's glare on it. */
const riverTexture = once(() => {
  const S = 128;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 7801);
  const mud: RGB = [96, 66, 36];
  const silt: RGB = [150, 112, 66];
  paint(ctx, S, S, (x, _y, i) => {
    const streak = 0.5 + 0.5 * Math.sin((x / S) * Math.PI * 2 * 3 + n[i] * 6);
    return mix(mud, silt, streak * 0.4 + n[i] * 0.3);
  });
  const rand = seededRandom(7802);
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = `rgba(230,220,190,${0.2 + rand() * 0.3})`;
    ctx.fillRect(rand() * S, rand() * S, 1, 4 + rand() * 8);
  }
  return finish(c);
});

const glowTex = once(() => glowTexture());

function sprite(color: number, size: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size);
  return s;
}

/** Where the ribbon is at `s`, and its heading. */
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

/** The overlays lie on the ground, in front of it and behind the roads (render/trackView.ts's ground is pushed back further). */
function overlay(mat: THREE.Material, factor = 2): THREE.Material {
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = factor;
  mat.polygonOffsetUnits = factor;
  return mat;
}

function pitCorners(p: PitDef): [number, number][] {
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => [p.x + fx * a * p.halfLength - fz * b * p.halfWidth, p.z + fz * a * p.halfLength + fx * b * p.halfWidth]);
}

/** The river's course as a smooth line, a point every couple of metres, in world x and z; and how wide it runs there (it widens to its mouth). */
export function riverCourse(): { x: number; z: number; half: number }[] {
  const pts = RIVER.map(([e, n]) => new THREE.Vector3(e, 0, -n));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const count = Math.ceil(curve.getLength() / 2);
  return curve.getSpacedPoints(count).map((p, k) => ({ x: p.x, z: p.z, half: 6 + 4 * (k / count) ** 3 }));
}

/**
 * The coast laid round the lap: the sea from the water's edge to the
 * horizon, its surf rolling in, the wet sand and the beach up to the dunes,
 * and the river winding down through the bush to its mouth. Each lies on
 * the ground, open over the pits (they have their own water).
 */
export function coast(track: Track, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const E = 1400;
  // Shape space is (x, north) once the mesh lies on the ground (rotated -90 degrees about x).
  const holes = (minN: number, maxN: number) =>
    track.def.pits
      .filter((p) => pitCorners(p).some(([, z]) => -z > minN - 10 && -z < maxN + 10))
      .map((p) => new THREE.Path(pitCorners(p).map(([x, z]) => new THREE.Vector2(x, -z))));
  const lay = (shape: THREE.Shape, mat: THREE.Material, tile: number, y = 0) => {
    const geo = new THREE.ShapeGeometry(shape, 4);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getY(i) / tile);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.renderOrder = 0;
    return m;
  };

  // The sea, out to the horizon.
  const sea = seaTexture().clone();
  sea.needsUpdate = true;
  const seaMat = overlay(new THREE.MeshPhongMaterial({ map: sea, shininess: 90, specular: 0xfff4d0 }));
  const seaShape = new THREE.Shape([new THREE.Vector2(-E, -E), new THREE.Vector2(E, -E), new THREE.Vector2(E, SHORE), new THREE.Vector2(-E, SHORE)]);
  g.add(lay(seaShape, seaMat, 30));

  // The beach, from the water's edge up to the dunes, the dunes' foot wavering.
  const beach = new THREE.Shape();
  beach.moveTo(-E, SHORE);
  beach.lineTo(E, SHORE);
  for (let x = E; x >= -E; x -= 10) beach.lineTo(x, DUNES + 6 * Math.sin(x * 0.031) + 3 * Math.sin(x * 0.11));
  beach.holes.push(...holes(SHORE, DUNES + 10));
  g.add(lay(beach, overlay(new THREE.MeshLambertMaterial({ map: beachSandTexture() })), 16));

  // The wet sand at the water's edge, darker, where the waves wash up.
  const wet = new THREE.Shape([new THREE.Vector2(-E, SHORE), new THREE.Vector2(E, SHORE), new THREE.Vector2(E, SHORE + 7), new THREE.Vector2(-E, SHORE + 7)]);
  wet.holes.push(...holes(SHORE, SHORE + 7));
  g.add(lay(wet, overlay(new THREE.MeshLambertMaterial({ color: 0x8a7a60, transparent: true, opacity: 0.45, depthWrite: false }), 1.5), 16, 0.01));

  // The surf: three lines of white water rolling in to the edge and washing up it.
  const foam = foamTexture();
  const surf: { m: THREE.Mesh; phase: number }[] = [];
  for (let k = 0; k < 3; k++) {
    const map = foam.clone();
    map.needsUpdate = true;
    map.repeat.set(2 * E / 60, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * E, 6), overlay(new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0.9 }), 1));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    g.add(m);
    surf.push({ m, phase: k / 3 });
  }
  animated.push((time) => {
    sea.offset.set(time * 0.004, time * 0.006);
    for (const s of surf) {
      // From out past the causeway in to the edge, fading as it washes up.
      const u = (time * 0.11 + s.phase) % 1;
      s.m.position.z = -(SHORE - 60 * (1 - u));
      const mat = s.m.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.85;
      (mat.map as THREE.Texture).offset.x = s.phase * 3 + time * 0.01;
      s.m.scale.y = 0.6 + u;
    }
  });

  // The river, down through the bush to its mouth: brown water flowing, its banks of red clay.
  const course = riverCourse();
  const flow = riverTexture().clone();
  flow.needsUpdate = true;
  const water: number[] = [];
  const bank: number[] = [];
  const wuv: number[] = [];
  const buv: number[] = [];
  const open = (x: number, z: number) => !track.def.pits.some((p) => inPit({ ...p, halfLength: p.halfLength + 1, halfWidth: p.halfWidth + 1 }, x, z));
  let v = 0;
  for (let k = 0; k + 1 < course.length; k++) {
    const a = course[k];
    const b = course[k + 1];
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const len = Math.hypot(tx, tz) || 1;
    const rx = -tz / len;
    const rz = tx / len;
    const v1 = v + len / 14;
    if (open((a.x + b.x) / 2, (a.z + b.z) / 2)) {
      const quad = (out: number[], uvs: number[], h0: number, h1: number, i0: number, i1: number) => {
        const p = [
          [a.x + rx * h0 * a.half, a.z + rz * h0 * a.half],
          [a.x + rx * h1 * a.half, a.z + rz * h1 * a.half],
          [b.x + rx * h0 * b.half, b.z + rz * h0 * b.half],
          [b.x + rx * h1 * b.half, b.z + rz * h1 * b.half],
        ];
        for (const q of [0, 2, 1, 1, 2, 3]) out.push(p[q][0], 0, p[q][1]);
        const uvq = [
          [i0, v],
          [i1, v],
          [i0, v1],
          [i1, v1],
        ];
        for (const q of [0, 2, 1, 1, 2, 3]) uvs.push(uvq[q][0], uvq[q][1]);
      };
      quad(water, wuv, -1, 1, 0, 1);
      quad(bank, buv, -1.6, -1, 0, 0.2);
      quad(bank, buv, 1, 1.6, 0.8, 1);
    }
    v = v1;
  }
  const geo = (pos: number[], uv: number[]) => {
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    gg.computeVertexNormals();
    return gg;
  };
  const banks = new THREE.Mesh(geo(bank, buv), overlay(new THREE.MeshLambertMaterial({ color: 0x9a5a34, side: THREE.DoubleSide }), 1.5));
  banks.position.y = 0.01;
  const river = new THREE.Mesh(geo(water, wuv), overlay(new THREE.MeshPhongMaterial({ map: flow, shininess: 60, specular: 0x8a7a60, side: THREE.DoubleSide }), 1));
  river.position.y = 0.02;
  g.add(banks, river);
  animated.push((time) => flow.offset.set(0, -time * 0.12));
  g.add(wash(track, animated));
  return g;
}

/**
 * Where the main road runs through the water: the surf washing across the
 * causeway and the shallows out past the water's edge, waves surging over
 * from the seaward side and spray bursting off the edge; and the river
 * running brown across the ford. Sheets of moving water laid over the road.
 */
function wash(track: Track, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const r = track.main;
  const sp = r.spline;
  const wetPit = (x: number, z: number) => track.def.pits.some((p) => p.liquid === 'water' && inPit(p, x, z));
  // Which samples are wet, and how: 1 the sea, 2 a ford.
  const kind = Array.from({ length: sp.count }, (_, i) => {
    const y = r.heightAt(sp.dist[i]);
    if (Math.abs(y) > 0.5) return 0;
    if (-sp.pz[i] < SHORE - 2) return 1;
    return wetPit(sp.px[i], sp.pz[i]) ? 2 : 0;
  });
  const sheets: Record<1 | 2, { pos: number[]; uv: number[] }> = { 1: { pos: [], uv: [] }, 2: { pos: [], uv: [] } };
  const sprays: { s: THREE.Sprite; phase: number }[] = [];
  for (let i = 0; i + 1 < sp.count; i++) {
    const k = kind[i];
    if (!k || kind[i + 1] !== k) continue;
    const j = i + 1;
    const edge = (n: number, side: number) => {
      const w = r.halfWidth[n] + 1.2;
      return [sp.px[n] - sp.tz[n] * side * w, r.heightAt(sp.dist[n]) + 0.08, sp.pz[n] + sp.tx[n] * side * w];
    };
    const q = [edge(i, -1), edge(i, 1), edge(j, -1), edge(j, 1)];
    const v0 = sp.dist[i] / 12;
    const v1 = sp.dist[j] / 12;
    const u = [
      [0, v0],
      [1, v0],
      [0, v1],
      [1, v1],
    ];
    for (const n of [0, 2, 1, 1, 2, 3]) {
      sheets[k as 1 | 2].pos.push(...q[n]);
      sheets[k as 1 | 2].uv.push(...u[n]);
    }
    // Spray off the seaward edge every so often.
    if (k === 1 && i % 4 === 0) {
      // The seaward edge: the side further south (a lateral to the right is (-tz, tx), and south is +z).
      const sea = sp.tx[i] >= 0 ? 1 : -1;
      const w = r.halfWidth[i] + 1.5;
      const spray = sprite(0xffffff, 3, 0);
      spray.position.set(sp.px[i] - sp.tz[i] * sea * w, r.heightAt(sp.dist[i]) + 1, sp.pz[i] + sp.tx[i] * sea * w);
      g.add(spray);
      sprays.push({ s: spray, phase: (sp.dist[i] / 37) % 1 });
    }
  }
  const sheet = (k: 1 | 2, color: number) => {
    const map = (k === 1 ? foamTexture() : riverTexture()).clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(sheets[k].pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(sheets[k].uv, 2));
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: k === 1 ? 0.55 : 0.5, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 2;
    g.add(m);
    return { map, mat };
  };
  const surf = sheets[1].pos.length ? sheet(1, 0xe8fbff) : null;
  const ford = sheets[2].pos.length ? sheet(2, 0xc8a070) : null;
  animated.push((time) => {
    if (surf) {
      // A wave washing across every few seconds, then the water running back off.
      const u = (time / 3.2) % 1;
      surf.map.offset.set(-u * 1.5, time * 0.05);
      surf.mat.opacity = 0.2 + 0.5 * Math.max(0, Math.sin(Math.PI * Math.min(1, u * 1.4)));
    }
    if (ford) ford.map.offset.set(-time * 0.35, 0);
    for (const sp2 of sprays) {
      const u = (time / 3.2 + sp2.phase * 0.3) % 1;
      const k = u < 0.35 ? Math.sin((u / 0.35) * Math.PI) : 0;
      sp2.s.scale.set(3 + k * 5, 1 + k * 5, 1);
      sp2.s.material.opacity = k * 0.75;
    }
  });
  return g;
}

/** Which part of the coast a point is in: out in the sea, on the beach, by the river, or up in the bush. */
function zoneAt(x: number, z: number, course: { x: number; z: number; half: number }[]): 'sea' | 'beach' | 'river' | 'bush' {
  const n = -z;
  if (n < SHORE - 4) return 'sea';
  if (n < DUNES) return 'beach';
  let best = Infinity;
  for (const c of course) best = Math.min(best, Math.hypot(c.x - x, c.z - z) - c.half);
  if (best < 0) return 'sea';
  return best < 30 ? 'river' : 'bush';
}

/** A gum tree: a pale, smooth trunk, peeling, branching, and grey-green crowns in clumps. */
function gumTree(rand: () => number, scale = 1): THREE.Group {
  const t = new THREE.Group();
  const bark = lambert(rand() < 0.5 ? 0xe8e0d0 : 0xd8c8b0);
  const leaf = lambert(rand() < 0.5 ? 0x6a8a5a : 0x7a9068, { flatShading: true });
  const h = (8 + rand() * 6) * scale;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * scale, 0.6 * scale, h, 7), bark);
  trunk.position.y = h / 2;
  trunk.rotation.z = (rand() - 0.5) * 0.15;
  t.add(trunk);
  for (let k = 0; k < 4; k++) {
    const a = rand() * Math.PI * 2;
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.22 * scale, 3.5 * scale, 5), bark);
    limb.position.set(Math.cos(a) * 1.2 * scale, h * (0.65 + rand() * 0.25), Math.sin(a) * 1.2 * scale);
    limb.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
    t.add(limb);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry((1.8 + rand() * 1.2) * scale, 0), leaf);
    crown.scale.y = 0.6;
    crown.position.set(Math.cos(a) * 2.6 * scale, h * (0.8 + rand() * 0.3), Math.sin(a) * 2.6 * scale);
    t.add(crown);
  }
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 * scale, 0), leaf);
  top.scale.y = 0.55;
  top.position.y = h + 0.5;
  t.add(top);
  return t;
}

/** A tea tree: low, crooked, papery bark, small dark leaves, white flowers in summer. */
function teaTree(rand: () => number): THREE.Group {
  const t = new THREE.Group();
  const bark = lambert(0xb8a890);
  const leaf = lambert(0x4a6a3a, { flatShading: true });
  const flower = lambert(0xf8f4ea);
  for (let k = 0; k < 3; k++) {
    const h = 2.5 + rand() * 2;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, h, 5), bark);
    stem.position.set((rand() - 0.5) * 1.2, h / 2, (rand() - 0.5) * 1.2);
    stem.rotation.set((rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 0.5);
    t.add(stem);
    const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 + rand() * 0.6, 0), leaf);
    bush.position.set(stem.position.x, h, stem.position.z);
    bush.scale.y = 0.7;
    t.add(bush);
    for (let f = 0; f < 4; f++) {
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.16, 4, 3), flower);
      bloom.position.set(bush.position.x + (rand() - 0.5) * 2, h + (rand() - 0.3) * 0.9, bush.position.z + (rand() - 0.5) * 2);
      t.add(bloom);
    }
  }
  return t;
}

/** A weeping willow: a thick trunk, and curtains of long fronds hanging to the ground, swaying. */
function willowFigure(scale: number, animated: Animated, rand: () => number): THREE.Group {
  const t = new THREE.Group();
  const bark = lambert(0x5a4a34);
  const frondMats = [0x9ab84a, 0x86a83e, 0xb0c860].map((c) => lambert(c, { side: THREE.DoubleSide }));
  const h = 7 * scale;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * scale, 1.1 * scale, h, 8), bark);
  trunk.position.y = h / 2;
  trunk.rotation.z = 0.12;
  t.add(trunk);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(4.2 * scale, 10, 8), lambert(0x86a63a, { flatShading: true }));
  crown.scale.y = 0.55;
  crown.position.set(0.8 * scale, h + 0.6 * scale, 0);
  t.add(crown);
  // Long thin strands hanging in curtains, gaps between them, longer toward the outside.
  const frondGeo = new THREE.PlaneGeometry(0.32 * scale, 6 * scale, 1, 4);
  frondGeo.translate(0, -3 * scale, 0);
  const fronds: { m: THREE.Mesh; phase: number }[] = [];
  for (let k = 0; k < 70; k++) {
    const a = rand() * Math.PI * 2;
    const r = (1.5 + rand() * 3.2) * scale;
    const m = new THREE.Mesh(frondGeo, frondMats[k % 3]);
    m.position.set(0.8 * scale + Math.cos(a) * r, h + 0.5 * scale, Math.sin(a) * r);
    m.rotation.y = -a + Math.PI / 2;
    m.scale.y = 0.35 + (r / (4.7 * scale)) * 0.75 + rand() * 0.2;
    t.add(m);
    fronds.push({ m, phase: rand() * 6 });
  }
  animated.push((time) => {
    for (const f of fronds) f.m.rotation.x = Math.sin(time * 0.9 + f.phase) * 0.08;
  });
  return t;
}

/** A driftwood log, bleached silver, with a stub of a branch. */
function driftwood(len: number, rand: () => number): THREE.Group {
  const t = new THREE.Group();
  const wood = lambert(0xc8c0b0);
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, len, 8), wood);
  log.rotation.z = Math.PI / 2;
  log.position.y = 0.45;
  const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 1.8, 5), wood);
  stub.position.set(len * (rand() - 0.5) * 0.6, 1.0, 0.2);
  stub.rotation.set(0.4, 0, 0.8);
  t.add(log, stub);
  return t;
}

/** A person, as the scenery draws them: head, body, arms and legs, in their swimmers. */
function person(skin: number, cloth: number, pose: 'stand' | 'flex' | 'lie' | 'swim'): THREE.Group {
  const t = new THREE.Group();
  const skinMat = lambert(skin);
  const clothMat = lambert(cloth);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.75, 8), skinMat);
  body.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), skinMat);
  head.position.y = 1.78;
  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.28, 8), clothMat);
  shorts.position.y = 0.8;
  t.add(body, head, shorts);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.7, 6), skinMat);
    leg.position.set(side * 0.13, 0.35, 0);
    t.add(leg);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.65, 6), skinMat);
    if (pose === 'flex') {
      // Showing off: arms up and bent, the biceps bunched.
      arm.position.set(side * 0.45, 1.6, 0);
      arm.rotation.z = side * 1.2;
      const bicep = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), skinMat);
      bicep.position.set(side * 0.55, 1.62, 0);
      t.add(bicep);
    } else {
      arm.position.set(side * 0.36, 1.2, 0);
      arm.rotation.z = side * 0.2;
    }
    t.add(arm);
  }
  if (pose === 'flex') body.scale.set(1.35, 1, 1.1);
  if (pose === 'lie') {
    t.rotation.x = -Math.PI / 2;
    t.position.y = 0.25;
  }
  if (pose === 'swim') t.position.y = -1.3;
  return t;
}

/**
 * The scenery, by where it is. Out in the sea: buoys, the shark net's
 * floats, swimmers, a surfer, rocks with the swell breaking on them. On the
 * beach: umbrellas, towels, eskies, a cricket match's stumps, sunbathers
 * baking to leather, muscle men flexing, the flags, a lifeguard's tower,
 * sandcastles. By the river: gum trees, tea trees, willows, reeds and
 * driftwood. Up in the bush: gum trees, tea trees, dry tussocks, termite
 * mounds.
 */
export function summerFeature(animated: Animated): Feature {
  const course = riverCourse();
  const white = lambert(0xf8f4ec);
  const red = lambert(RED);
  const yellow = lambert(YELLOW);
  const dark = lambert(0x2a2a2e);
  const skins = [0xf0c8a0, 0xd89a6a, 0xa86a3a, 0xc8743a, 0x8a4a28];
  const cloths = [0x1a3ad8, RED, 0x1a1a1a, YELLOW, 0x2ad8b8, 0xff6ab8];
  const stripeSets = [
    [RED, 0xf8f4ec],
    [0x1a6ad8, YELLOW],
    [0x2ab84a, 0xf8f4ec],
    [0xff7a1a, 0x1a3ad8],
  ];

  // The sea.
  const buoy: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), rand() < 0.5 ? lambert(0xff7a1a) : yellow);
    t.add(ball);
    const ph = rand() * 6;
    animated.push((time) => (ball.position.y = 0.2 + Math.sin(time * 1.6 + ph) * 0.25));
    return place(t, x, z, rand);
  };
  const swimmer: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const p = person(skins[Math.floor(rand() * skins.length)], cloths[Math.floor(rand() * cloths.length)], 'swim');
    t.add(p);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.9, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    t.add(ring);
    const ph = rand() * 6;
    animated.push((time) => (p.position.y = -1.3 + Math.sin(time * 2 + ph) * 0.12));
    return place(t, x, z, rand);
  };
  const surfer: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const board = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 2, 4, 8), rand() < 0.5 ? white : yellow);
    board.rotation.x = Math.PI / 2;
    board.scale.y = 0.25;
    board.position.y = 0.1;
    const rider = person(skins[Math.floor(rand() * skins.length)], 0x1a1a1a, 'stand');
    rider.position.y = 0.15;
    rider.rotation.y = Math.PI / 2;
    t.add(board, rider);
    const ph = rand() * 6;
    animated.push((time) => {
      t.position.y = Math.sin(time * 1.3 + ph) * 0.2;
      t.rotation.z = Math.sin(time * 1.1 + ph) * 0.08;
    });
    return place(t, x, z, rand);
  };
  const seaRock: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(2 + rand() * 3, 0), lambert(0x6a5a4a, { flatShading: true }));
    rock.scale.y = 0.5;
    t.add(rock);
    const spray = sprite(0xffffff, 4, 0.6);
    spray.position.y = 1.5;
    t.add(spray);
    const ph = rand() * 6;
    animated.push((time) => {
      const k = Math.max(0, Math.sin(time * 1.2 + ph));
      spray.scale.setScalar(2 + k * 6);
      spray.material.opacity = k * 0.7;
    });
    return place(t, x, z, rand);
  };
  // The beach.
  const umbrella: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const [a, b] = stripeSets[Math.floor(rand() * stripeSets.length)];
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5), white);
    pole.position.y = 1.3;
    pole.rotation.z = (rand() - 0.5) * 0.3;
    t.add(pole);
    for (let k = 0; k < 8; k++) {
      const panel = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.6, 8, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4), lambert(k % 2 ? a : b, { side: THREE.DoubleSide }));
      panel.position.y = 2.6;
      t.add(panel);
    }
    const towel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), lambert(cloths[Math.floor(rand() * cloths.length)], { side: THREE.DoubleSide }));
    towel.rotation.x = -Math.PI / 2;
    towel.position.set(1.2, 0.04, 0.3);
    t.add(towel);
    if (rand() < 0.6) {
      const sunbather = person(skins[2 + Math.floor(rand() * 3)], cloths[Math.floor(rand() * cloths.length)], 'lie');
      sunbather.position.x = 1.2;
      t.add(sunbather);
    }
    if (rand() < 0.5) {
      // An esky.
      const esky = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.45), rand() < 0.5 ? lambert(0x1a6ad8) : red);
      esky.position.set(-0.8, 0.25, 0.6);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.1, 0.5), white);
      lid.position.set(-0.8, 0.55, 0.6);
      t.add(esky, lid);
    }
    return place(t, x, z, rand);
  };
  const muscleMan: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const man = person(skins[3 + Math.floor(rand() * 2)], cloths[Math.floor(rand() * cloths.length)], 'flex');
    man.scale.setScalar(1.15);
    t.add(man);
    // Basking: turning this way and that to catch the sun.
    const ph = rand() * 6;
    animated.push((time) => (man.rotation.y = Math.sin(time * 0.7 + ph) * 0.6));
    return place(t, x, z, rand);
  };
  const cricket: Feature = (x, z, rand) => {
    // Beach cricket: three stumps and the bails, an esky for the other end, a bat dropped in the sand.
    const t = new THREE.Group();
    const wood = lambert(0xe8d8b0);
    for (const end of [-9, 9]) {
      for (const k of [-1, 0, 1]) {
        const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 5), wood);
        stump.position.set(k * 0.12, 0.38, end);
        t.add(stump);
      }
    }
    const bat = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.9), wood);
    bat.position.set(0.6, 0.04, 8.2);
    bat.rotation.y = 0.5;
    t.add(bat);
    const batter = person(skins[Math.floor(rand() * skins.length)], cloths[Math.floor(rand() * cloths.length)], 'stand');
    batter.position.set(-0.6, 0, 8.3);
    t.add(batter);
    return place(t, x, z, rand);
  };
  const flags: Feature = (x, z, rand) => {
    // A lifesavers' flag: red over yellow.
    const t = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.5, 5), white);
    pole.position.y = 1.75;
    t.add(pole);
    const flag = new THREE.Group();
    const top = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), lambert(RED, { side: THREE.DoubleSide }));
    top.position.set(0.6, 0.22, 0);
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), lambert(YELLOW, { side: THREE.DoubleSide }));
    bottom.position.set(0.6, -0.22, 0);
    flag.add(top, bottom);
    flag.position.y = 3.0;
    t.add(flag);
    const ph = rand() * 6;
    animated.push((time) => (flag.rotation.y = Math.sin(time * 3 + ph) * 0.3));
    return place(t, x, z, rand);
  };
  const tower: Feature = (x, z, rand) => {
    // The lifeguard's tower: stilts, a hut with a red and yellow roof, a lifeguard watching the water.
    const t = new THREE.Group();
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 0.2), white);
      leg.position.set(a * 1.2, 2, b * 1.2);
      t.add(leg);
    }
    const hut = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.8, 2.8), white);
    hut.position.y = 4.9;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.1, 4), red);
    roof.position.y = 6.35;
    roof.rotation.y = Math.PI / 4;
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.4, 2.9), yellow);
    band.position.y = 5.5;
    t.add(hut, roof, band);
    return place(t, x, z, rand);
  };
  const sandcastle: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const sand = lambert(0xe2c890);
    for (let k = 0; k < 4; k++) {
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.8, 7), sand);
      turret.position.set((k % 2) - 0.5, 0.4, Math.floor(k / 2) - 0.5);
      t.add(turret);
    }
    const keep = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.4, 8), sand);
    keep.position.y = 0.7;
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.35, 8), rand() < 0.5 ? red : lambert(0x1a6ad8));
    bucket.position.set(1.2, 0.18, 0.4);
    t.add(keep, bucket);
    return place(t, x, z, rand);
  };
  const spinifex: Feature = (x, z, rand) => {
    // A tussock of dune grass.
    const t = new THREE.Group();
    const grass = lambert(0xb8b070, { side: THREE.DoubleSide });
    for (let k = 0; k < 7; k++) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.4, 3), grass);
      blade.position.set((rand() - 0.5) * 0.8, 0.6, (rand() - 0.5) * 0.8);
      blade.rotation.set((rand() - 0.5) * 0.9, 0, (rand() - 0.5) * 0.9);
      t.add(blade);
    }
    return place(t, x, z, rand);
  };
  // The river and the bush.
  const gum: Feature = (x, z, rand) => place(gumTree(rand, 0.85 + rand() * 0.5), x, z, rand);
  const tea: Feature = (x, z, rand) => place(teaTree(rand), x, z, rand);
  const willow: Feature = (x, z, rand) => place(willowFigure(0.7 + rand() * 0.4, animated, rand), x, z, rand);
  const reeds: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const reed = lambert(0x7a8a3a);
    const head = lambert(0x5a3a20);
    for (let k = 0; k < 9; k++) {
      const h = 1.4 + rand() * 1.2;
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, h, 4), reed);
      stalk.position.set((rand() - 0.5) * 1.6, h / 2, (rand() - 0.5) * 1.6);
      stalk.rotation.set((rand() - 0.5) * 0.2, 0, (rand() - 0.5) * 0.2);
      t.add(stalk);
      if (rand() < 0.5) {
        const cat = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 5), head);
        cat.position.set(stalk.position.x, h, stalk.position.z);
        t.add(cat);
      }
    }
    return place(t, x, z, rand);
  };
  const log: Feature = (x, z, rand) => place(driftwood(3 + rand() * 4, rand), x, z, rand);
  const tussock: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const grass = lambert(rand() < 0.5 ? 0xd8c070 : 0xa8a060, { flatShading: true });
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.0, 6), grass);
    tuft.position.y = 0.5;
    t.add(tuft);
    return place(t, x, z, rand);
  };
  const termites: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 1.5 + rand() * 2;
    const mound = new THREE.Mesh(new THREE.ConeGeometry(0.8, h, 7), lambert(0xb0602e, { flatShading: true }));
    mound.position.y = h / 2;
    t.add(mound);
    return place(t, x, z, rand);
  };
  const pine: Feature = (x, z, rand) => {
    // A Norfolk Island pine along the foreshore, tiers of branches.
    const t = new THREE.Group();
    const h = 14 + rand() * 6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, h, 6), lambert(0x6a4a34));
    trunk.position.y = h / 2;
    t.add(trunk);
    const green = lambert(0x2a5a3a, { flatShading: true });
    for (let k = 0; k < 6; k++) {
      const tier = new THREE.Mesh(new THREE.ConeGeometry(2.6 - k * 0.35, 1.2, 7), green);
      tier.position.y = h * 0.35 + k * (h * 0.11);
      t.add(tier);
    }
    return place(t, x, z, rand);
  };
  void dark;

  const sea = (rand: () => number) => pick(rand, [
    [4, buoy],
    [3, swimmer],
    [2, surfer],
    [2, seaRock],
  ]);
  const beach = (rand: () => number) => pick(rand, [
    [6, umbrella],
    [2, muscleMan],
    [1, cricket],
    [2, flags],
    [1, tower],
    [2, sandcastle],
    [3, spinifex],
  ]);
  const river = (rand: () => number) => pick(rand, [
    [4, gum],
    [3, tea],
    [2, willow],
    [3, reeds],
    [2, log],
  ]);
  const bush = (rand: () => number) => pick(rand, [
    [6, gum],
    [3, tea],
    [3, tussock],
    [1, termites],
    [1, pine],
  ]);
  return (x, z, rand) => {
    const zone = zoneAt(x, z, course);
    const f = zone === 'sea' ? sea(rand) : zone === 'beach' ? beach(rand) : zone === 'river' ? river(rand) : bush(rand);
    return f(x, z, rand);
  };
}

/** A face of words on a sign, as the surf club paints its signs: red on white, or white on red. */
const signFace = (() => {
  const made = new Map<string, THREE.CanvasTexture>();
  return (lines: string[], bg = '#f8f4ec', fg = '#d8202a'): THREE.CanvasTexture => {
    const key = `${lines.join('|')}|${bg}|${fg}`;
    let t = made.get(key);
    if (t) return t;
    const W = 512;
    const H = 256;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = lines.length === 1 ? 92 : lines.length === 2 ? 68 : 50;
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

/** A sign panel `w` wide (half as high), its face toward whoever's coming (-z). */
function signPanel(w: number, map: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, w / 2);
  const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map }));
  front.rotation.y = Math.PI;
  front.position.z = -0.12;
  const rear = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map }));
  rear.position.z = 0.12;
  const board = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, w / 2 + 0.2, 0.2), lambert(0xf8f4ec));
  g.add(board, front, rear);
  return g;
}

/** A flag of the lifesavers, red over yellow, rippling on its pole: the group, and the flag to wave. */
function lifesaverFlag(size: number): { pole: THREE.Group; flag: THREE.Mesh } {
  const pole = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * size, 0.14 * size, 9 * size, 8), lambert(0xf8f4ec));
  stick.position.y = 4.5 * size;
  pole.add(stick);
  const [c, ctx] = canvas(128, 96);
  ctx.fillStyle = '#d8202a';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(128, 0);
  ctx.lineTo(0, 96);
  ctx.fill();
  ctx.fillStyle = '#ffd21a';
  ctx.beginPath();
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 96);
  ctx.lineTo(0, 96);
  ctx.fill();
  const geo = new THREE.PlaneGeometry(4 * size, 3 * size, 8, 1);
  geo.translate(2 * size, 0, 0);
  const flag = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: finish(c, false), side: THREE.DoubleSide }));
  flag.position.y = 7.4 * size;
  pole.add(flag);
  return { pole, flag };
}

/** Ripples a flag's cloth along its length. */
function wave(flag: THREE.Mesh, time: number, phase: number): void {
  const pos = (flag.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
  if (!flag.userData.rest) flag.userData.rest = Float32Array.from(pos.array as Float32Array);
  const rest = flag.userData.rest as Float32Array;
  for (let i = 0; i < pos.count; i++) {
    const x = rest[i * 3];
    pos.setZ(i, Math.sin(x * 1.4 - time * 6 + phase) * 0.12 * x);
  }
  pos.needsUpdate = true;
}

/**
 * The start: between the flags. Two tall lifesavers' flags, red over
 * yellow, either side of the road, a banner of the surf club's across
 * between them, MUDDY WATER on it, and a SWIM BETWEEN THE FLAGS board.
 */
export function flagsGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const waving: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const { pole, flag } = lifesaverFlag(1.4);
    pole.position.x = side * hw;
    g.add(pole);
    waving.push(flag);
  }
  // The banner, strung between the poles: the surf club's red, the song's name in yellow, both faces.
  const [bc, bctx] = canvas(1024, 128);
  bctx.fillStyle = '#d8202a';
  bctx.fillRect(0, 0, 1024, 128);
  bctx.fillStyle = '#ffd21a';
  bctx.fillRect(0, 0, 1024, 10);
  bctx.fillRect(0, 118, 1024, 10);
  bctx.font = 'bold 92px sans-serif';
  bctx.textAlign = 'center';
  bctx.textBaseline = 'middle';
  bctx.fillText('MUDDY WATER', 512, 68);
  const bw = 2 * hw - 1;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(bw, bw / 8), new THREE.MeshLambertMaterial({ map: finish(bc, false), side: THREE.DoubleSide }));
  banner.position.y = 10.4;
  g.add(banner);
  const board = signPanel(6, signFace(['SWIM BETWEEN', 'THE FLAGS']));
  board.position.set(-(hw + 6), 3.2, 0);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6), lambert(0xf8f4ec));
  post.position.set(-(hw + 6), 1.6, 0);
  g.add(board, post);
  animated.push((time) => waving.forEach((fl, k) => wave(fl, time, k * 1.7)));
  return g;
}

/** The helicopter: a yellow body and red stripe (the lifesavers'), its rotor and tail rotor, skids, the spotter at the open door. */
function helicopterFigure(): { group: THREE.Group; rotor: THREE.Object3D; tail: THREE.Object3D } {
  const g = new THREE.Group();
  const yellow = lambert(YELLOW);
  const red = lambert(RED);
  const glass = new THREE.MeshPhongMaterial({ color: 0x1a2a3a, specular: 0xffffff, shininess: 90 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(2, 14, 10), yellow);
  body.scale.set(1.1, 1, 1.7);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.2, 2.2);
  nose.scale.set(1, 1, 0.8);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.25, 0.6, 16), red);
  stripe.rotation.x = Math.PI / 2;
  stripe.scale.set(1, 1, 1);
  stripe.position.z = -0.6;
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 6, 8), yellow);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 0.6, -5.5);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.8, 1), red);
  fin.position.set(0, 1.4, -8.2);
  const tail = new THREE.Group();
  for (let k = 0; k < 2; k++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.8, 0.2), lambert(0x2a2a2a));
    blade.rotation.x = (k * Math.PI) / 2;
    tail.add(blade);
  }
  tail.position.set(0.25, 1.5, -8.2);
  const rotor = new THREE.Group();
  for (let k = 0; k < 2; k++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(14, 0.08, 0.5), lambert(0x2a2a2a));
    blade.rotation.y = (k * Math.PI) / 2;
    rotor.add(blade);
  }
  const blur = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshBasicMaterial({ color: 0x404040, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  blur.rotation.x = -Math.PI / 2;
  rotor.add(blur);
  rotor.position.y = 2.3;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.6, 6), lambert(0x2a2a2a));
  mast.position.y = 2;
  for (const side of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.5, 6), lambert(0x2a2a2a));
    skid.rotation.x = Math.PI / 2;
    skid.position.set(side * 1.3, -2.2, 0.2);
    g.add(skid);
  }
  // SHARK spotted, on the belly.
  const belly = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.2), new THREE.MeshBasicMaterial({ map: signFace(['LIFESAVER'], '#ffd21a', '#d8202a'), side: THREE.DoubleSide }));
  belly.rotation.y = Math.PI / 2;
  belly.position.set(2.25, 0, 0);
  g.add(body, nose, stripe, boom, fin, tail, rotor, mast, belly);
  return { group: g, rotor, tail };
}

/**
 * The shark-spotting helicopter, flying over: it circles the shallows
 * where the sharks are, banking, its rotor beating, a siren light blinking,
 * and its shadow racing across the sand and the water.
 */
export function sharkCopter(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const c = offRoad(ribbon, s, lateral);
  const { group, rotor, tail } = helicopterFigure();
  const light = sprite(0xff3020, 3, 0.9);
  light.position.set(0, -1.6, 0);
  group.add(light);
  g.add(group);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(4, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1, 1.8, 1);
  shadow.renderOrder = 2;
  g.add(shadow);
  const R = 85;
  const H = 34;
  animated.push((time) => {
    // Round an oval over the water, a lap every 26 s, banking into the turn.
    const a = time * ((2 * Math.PI) / 26);
    const x = c.x + Math.cos(a) * R * 1.4;
    const z = c.z + Math.sin(a) * R * 0.7;
    const dx = -Math.sin(a) * R * 1.4;
    const dz = Math.cos(a) * R * 0.7;
    group.position.set(x, H + Math.sin(time * 0.7) * 2, z);
    group.rotation.set(0, Math.atan2(dx, dz), 0);
    group.rotateZ(-0.22);
    rotor.rotation.y = time * 40;
    tail.rotation.x = time * 60;
    light.visible = Math.floor(time * 2.5) % 2 === 0;
    shadow.position.set(x, 0.15, z);
    shadow.rotation.z = -Math.atan2(dx, dz);
  });
  return g;
}

/**
 * The willow tree over the driftwood: a great weeping willow on the river
 * bank, its curtains of fronds swaying down to the water, a long bleached
 * log of driftwood lying under it, and someone lying on the driftwood in
 * the shade, any day, anyway.
 */
export function willowTree(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const c = offRoad(ribbon, s, lateral);
  const rand = seededRandom(7901);
  g.position.set(c.x, 0, c.z);
  g.rotation.y = c.heading;
  const tree = willowFigure(1.9, animated, rand);
  g.add(tree);
  const log = driftwood(9, rand);
  log.position.set(-2, 0, -4);
  log.rotation.y = 0.4;
  g.add(log);
  const dreamer = person(0xe8b890, 0x2a6ad8, 'lie');
  dreamer.position.set(-2, 1.0, -4);
  dreamer.rotation.z = 0.4;
  g.add(dreamer);
  // Gum leaves and willow fronds drifting down.
  const leaves: { m: THREE.Mesh; phase: number; x: number; z: number }[] = [];
  const leafMat = lambert(0xb0c050, { side: THREE.DoubleSide });
  for (let k = 0; k < 14; k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.6), leafMat);
    g.add(m);
    leaves.push({ m, phase: rand(), x: (rand() - 0.5) * 12, z: (rand() - 0.5) * 12 });
  }
  animated.push((time) => {
    for (const l of leaves) {
      const u = (time * 0.08 + l.phase) % 1;
      l.m.position.set(l.x + Math.sin(time + l.phase * 9) * 1.2, 13 * (1 - u), l.z);
      l.m.rotation.set(time * 2 + l.phase, time + l.phase, 0);
    }
  });
  return g;
}

/**
 * Give Me Over to the River: the billabong the ford runs through, reeds
 * and lily pads round it, depth posts along the ford, a sign at its bank,
 * and the hungry fishes rising in rings.
 */
export function billabong(ribbon: Ribbon, s: number, pits: readonly PitDef[], animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const pool = pits.find((p) => inPit(p, f.x, f.z));
  const rand = seededRandom(7951);
  const reed = lambert(0x7a8a3a);
  const pad = lambert(0x4a8a3a, { side: THREE.DoubleSide });
  const lily = lambert(0xf8e8f0);
  const post = lambert(0xf8f4ec);
  const mark = lambert(RED);
  if (pool) {
    const fx = Math.sin(pool.heading);
    const fz = Math.cos(pool.heading);
    const at = (a: number, b: number): [number, number] => [pool.x + fx * a * pool.halfLength - fz * b * pool.halfWidth, pool.z + fz * a * pool.halfLength + fx * b * pool.halfWidth];
    // Depth posts along both edges of the ford, white with red bands.
    for (let a = -0.9; a <= 0.91; a += 0.3) {
      for (const side of [-1, 1]) {
        const [x, z] = at(a, side * 0.92);
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), post);
        p.position.set(x, -1.2, z);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 6), mark);
        band.position.set(x, -0.2, z);
        g.add(p, band);
      }
    }
    // Lily pads floating on the water either side, and reeds along the banks.
    for (let k = 0; k < 26; k++) {
      const side = rand() < 0.5 ? -1 : 1;
      const [x, z] = at(rand() * 2 - 1, side * (1.05 + rand() * 0.6));
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.6 + rand() * 0.5, 10, 0.3, Math.PI * 1.8), pad);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, -2.45, z);
      g.add(m);
      if (rand() < 0.3) {
        const flower = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), lily);
        flower.position.set(x, -2.3, z);
        g.add(flower);
      }
    }
    for (let k = 0; k < 40; k++) {
      const side = rand() < 0.5 ? -1 : 1;
      const [x, z] = at((rand() * 2 - 1) * 1.05, side * (1.0 + rand() * 0.15));
      const h = 1.5 + rand() * 1.5;
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, h, 4), reed);
      stalk.position.set(x, -2.5 + h / 2 + 1.5, z);
      g.add(stalk);
    }
    // The hungry fishes, rising: rings spreading on the water.
    const rings: { m: THREE.Mesh; phase: number }[] = [];
    for (let k = 0; k < 6; k++) {
      const side = rand() < 0.5 ? -1 : 1;
      const [x, z] = at(rand() * 1.6 - 0.8, side * (1.3 + rand() * 0.3));
      const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24), new THREE.MeshBasicMaterial({ color: 0xe8dcc0, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, -2.42, z);
      g.add(m);
      rings.push({ m, phase: rand() });
    }
    animated.push((time) => {
      for (const r of rings) {
        const u = (time * 0.4 + r.phase) % 1;
        r.m.scale.setScalar(0.3 + u * 3);
        (r.m.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.7;
      }
    });
  }
  // The sign on the bank where the ford goes in.
  const start = frameAt(ribbon, 6);
  const sign = signPanel(5, signFace(['GIVE ME OVER', 'TO THE RIVER'], '#6a4a28', '#f8f0d8'));
  sign.position.set(start.x - Math.cos(start.heading) * 9, 3, start.z + Math.sin(start.heading) * 9);
  sign.rotation.y = start.heading;
  const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 6), lambert(0x6a4a34));
  stake.position.set(sign.position.x, 1.5, sign.position.z);
  g.add(sign, stake);
  return g;
}

/**
 * Under the muddy water: the riverbed's silt and snags, reeds swaying,
 * catfish and carp nosing about, silt drifting, and the brown light from
 * the surface. Kept off the road.
 */
export function riverbed(track: Track, p: PitDef, waterLevel: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(Math.round(p.x * 7 + p.z * 13));
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const floor = -p.depth;
  const at = (a: number, b: number): [number, number] => [p.x + fx * a * p.halfLength - fz * b * p.halfWidth, p.z + fz * a * p.halfLength + fx * b * p.halfWidth];
  const clear = (x: number, z: number, margin: number) => [track.main, ...track.branches].every((r) => nearestOnSpline(r.spline, x, z).distance > Math.max(...r.halfWidth) + margin);
  // Snags: drowned branches lying on the bed, reaching up.
  const wood = lambert(0x3a2a1a);
  for (let k = 0; k < 24; k++) {
    const [x, z] = at(rand() * 2 - 1, rand() * 2 - 1);
    if (!clear(x, z, 2)) continue;
    const len = 3 + rand() * 5;
    const snag = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.35, len, 5), wood);
    snag.position.set(x, floor + len * 0.35, z);
    snag.rotation.set(rand() - 0.5, rand() * 6, 0.6 + rand() * 0.6);
    g.add(snag);
  }
  // Reeds on the bed, swaying in the current.
  const reedMat = lambert(0x5a6a2a, { side: THREE.DoubleSide });
  const reedGeo = new THREE.PlaneGeometry(0.4, 1, 1, 6);
  reedGeo.translate(0, 0.5, 0);
  const reeds: { m: THREE.Mesh; phase: number }[] = [];
  for (let k = 0; k < 60; k++) {
    const [x, z] = at(rand() * 2 - 1, rand() * 2 - 1);
    if (!clear(x, z, 2)) continue;
    const m = new THREE.Mesh(reedGeo, reedMat);
    m.scale.set(1, 2 + rand() * (p.depth - 3), 1);
    m.position.set(x, floor, z);
    m.rotation.y = rand() * Math.PI;
    g.add(m);
    reeds.push({ m, phase: rand() * 6 });
  }
  // Catfish and carp, in ones and twos, nosing about.
  const fishGeo = new THREE.SphereGeometry(0.4, 8, 6);
  fishGeo.scale(0.6, 0.5, 1.8);
  const fishMats = [0x6a5a3a, 0x8a7a4a, 0xa88a4a].map((c) => lambert(c));
  const fish: { m: THREE.Mesh; cx: number; cz: number; y: number; r: number; speed: number }[] = [];
  for (let k = 0; k < 14; k++) {
    const [cx, cz] = at(rand() * 1.6 - 0.8, rand() * 1.6 - 0.8);
    const m = new THREE.Mesh(fishGeo, fishMats[k % 3]);
    g.add(m);
    fish.push({ m, cx, cz, y: floor + 1 + rand() * (p.depth - 3), r: 3 + rand() * 6, speed: (0.2 + rand() * 0.3) * (rand() < 0.5 ? -1 : 1) });
  }
  // Silt drifting in the water.
  const silt = glowTexture('rgba(220,190,140,0.8)', 'rgba(220,190,140,0)', 32);
  const motes: { s: THREE.Sprite; x: number; z: number; phase: number }[] = [];
  for (let k = 0; k < 70; k++) {
    const [x, z] = at(rand() * 2 - 1, rand() * 2 - 1);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: silt, transparent: true, depthWrite: false, opacity: 0.5 }));
    s.scale.setScalar(0.2 + rand() * 0.3);
    g.add(s);
    motes.push({ s, x, z, phase: rand() });
  }
  // The surface seen from below: brown, the sun a blur through it.
  const corners = pitCorners(p);
  const under = new THREE.BufferGeometry();
  under.setAttribute('position', new THREE.Float32BufferAttribute(corners.map(([x, z]) => [x, waterLevel - 0.05, z]).flat(), 3));
  under.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  under.setIndex([0, 1, 2, 0, 2, 3]);
  const ripples = riverTexture().clone();
  ripples.needsUpdate = true;
  ripples.repeat.set(p.halfLength / 8, p.halfWidth / 8);
  g.add(new THREE.Mesh(under, new THREE.MeshBasicMaterial({ map: ripples, color: 0xd8b880, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })));
  animated.push((time) => {
    for (const r of reeds) r.m.rotation.z = Math.sin(time * 0.8 + r.phase) * 0.15;
    for (const f of fish) {
      const a = time * f.speed;
      f.m.position.set(f.cx + Math.cos(a) * f.r, f.y + Math.sin(time * 0.9 + f.r) * 0.3, f.cz + Math.sin(a) * f.r);
      f.m.rotation.y = -a + (f.speed > 0 ? Math.PI : 0);
    }
    for (const m of motes) {
      const u = (m.phase + time * 0.03) % 1;
      m.s.position.set(m.x + Math.sin(time * 0.5 + m.phase * 9) * 1.5, floor + u * (waterLevel - floor), m.z + u * 4);
    }
    ripples.offset.set(time * 0.01, time * 0.02);
  });
  return g;
}

// The hazard: the sharks.

const sharkGrey = once(() => lambert(0x4a5a66));
const sharkBelly = once(() => lambert(0xd8dcd8));

/**
 * A shark: its fin, its body under the wash, its jaws (white teeth on a
 * pink mouth) that come up out of the water as it crosses the middle of the
 * road, the white water of its wake trailing behind it, and the ring of
 * ripples round its fin while it circles.
 */
export function sharkParts(obj: THREE.Object3D): THREE.Object3D[] {
  // The fin: a curved triangle standing out of the water.
  const finShape = new THREE.Shape();
  finShape.moveTo(-0.7, 0);
  finShape.quadraticCurveTo(-0.2, 0.7, 0.35, 1.25);
  finShape.quadraticCurveTo(0.25, 0.5, 0.6, 0);
  finShape.lineTo(-0.7, 0);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.12, bevelEnabled: false });
  finGeo.translate(0, 0, -0.06);
  finGeo.rotateY(-Math.PI / 2);
  const fin = new THREE.Mesh(finGeo, sharkGrey());
  fin.position.y = 0.15;
  // The body: long and grey, half under the wash.
  const body = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), sharkGrey());
  trunk.scale.set(SHARK_RADIUS, SHARK_RADIUS * 0.7, (SHARK_HEAD + SHARK_TAIL) / 2);
  trunk.position.z = (SHARK_HEAD - SHARK_TAIL) / 2;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), sharkBelly());
  belly.scale.copy(trunk.scale).multiplyScalar(0.98);
  belly.position.copy(trunk.position);
  const tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 4), sharkGrey());
  tailFin.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
  tailFin.scale.set(0.25, 1, 1.4);
  tailFin.position.set(0, 0, -SHARK_TAIL - 0.4);
  body.add(trunk, belly, tailFin);
  body.position.y = -0.05;
  // The jaws: up out of the water, open, teeth all round.
  const jaws = new THREE.Group();
  const mouth = lambert(0xc0505a, { side: THREE.DoubleSide });
  const tooth = lambert(0xfaf8f0);
  for (const [k, sign] of [
    [0, 1],
    [1, -1],
  ] as const) {
    const jaw = new THREE.Group();
    const half = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), k === 0 ? sharkGrey() : sharkBelly());
    half.scale.set(1, 0.5 * sign, 1.3);
    const inside = new THREE.Mesh(new THREE.CircleGeometry(0.85, 14), mouth);
    inside.rotation.x = -Math.PI / 2;
    inside.scale.set(1, 1.25, 1);
    jaw.add(half, inside);
    for (let t = 0; t < 12; t++) {
      const a = (t / 12) * Math.PI * 2;
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 4), tooth);
      fang.position.set(Math.cos(a) * 0.78, -sign * 0.1, Math.sin(a) * 1.0);
      fang.rotation.x = sign > 0 ? Math.PI : 0;
      jaw.add(fang);
    }
    jaw.userData.sign = sign;
    jaws.add(jaw);
  }
  jaws.position.set(0, 0.6, SHARK_HEAD - 0.3);
  // The wake: white water trailing back from its tail.
  const wakeGeo = new THREE.PlaneGeometry(2.6, SHARK_WAKE, 1, 4);
  wakeGeo.rotateX(-Math.PI / 2);
  wakeGeo.translate(0, 0, -SHARK_TAIL - SHARK_WAKE / 2);
  const wakeMap = foamTexture().clone();
  wakeMap.needsUpdate = true;
  wakeMap.rotation = Math.PI / 2;
  wakeMap.center.set(0.5, 0.5);
  wakeMap.repeat.set(2, 1);
  const wake = new THREE.Mesh(wakeGeo, new THREE.MeshBasicMaterial({ map: wakeMap, transparent: true, depthWrite: false, opacity: 0.8, side: THREE.DoubleSide }));
  wake.position.y = 0.12;
  wake.renderOrder = 2;
  // The ripples round its fin while it circles.
  const ripple = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.y = 0.08;
  const parts = [fin, body, jaws, wake, ripple];
  for (const o of parts) obj.add(o);
  return parts;
}

export function poseShark(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [fin, body, jaws, wake, ripple] = parts;
  const S = SHARK_STAGES;
  const u = p.phase;
  obj.position.set(p.x, p.ground, p.z);
  obj.rotation.y = p.heading;
  // Gone under, it's nowhere to be seen.
  obj.visible = u < S.calm;
  if (!obj.visible) return;
  const running = u >= S.run;
  fin.visible = true;
  fin.position.y = 0.15 + Math.sin(elapsed * 5) * 0.05;
  fin.rotation.z = Math.sin(elapsed * 3) * 0.06;
  body.visible = running;
  body.rotation.y = Math.sin(elapsed * 9) * 0.08;
  ripple.visible = !running;
  if (ripple.visible) {
    const k = (elapsed * 0.9) % 1;
    ripple.scale.setScalar(0.8 + k * 1.6);
    (ripple as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.6 * (1 - k);
  }
  wake.visible = running;
  if (running) {
    const k = Math.min(1, (u - S.run) / 0.06);
    const fade = u >= S.ashore ? 1 - (u - S.ashore) / (S.calm - S.ashore) : 1;
    const w = wake as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    w.scale.set(1, k, 1);
    w.material.opacity = 0.85 * fade;
    w.material.map!.offset.y = -elapsed * 0.8;
  }
  // The jaws come up out of the water as it crosses the middle of the road, snapping.
  const hw = 14;
  const mid = running && u < S.ashore ? Math.max(0, 1 - Math.abs(p.gap) / (hw * 0.7)) : 0;
  jaws.visible = mid > 0.02;
  if (jaws.visible) {
    jaws.position.y = 0.2 + mid * 1.1;
    jaws.rotation.x = -0.5 * mid;
    const open = 0.15 + 0.45 * Math.abs(Math.sin(elapsed * 7));
    for (const jaw of jaws.children) jaw.rotation.x = -(jaw.userData.sign as number) * open * mid;
  }
}
