import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { METEOR_BLAST, METEOR_FALL, METEOR_MARK, METEOR_RADIUS, METEOR_STAGE, type HazardPose } from '../items/hazards';
import { RUNGS } from '../tracks/greatChainOfBeing';
import { pointAt } from '../tracks/spline';
import type { Ribbon, Track } from '../tracks/track';
import { glowTexture } from './textures';

/**
 * The Great Chain of Being's world, the Gumboot Soup Cup's second: the
 * scala naturae, the ladder of all things, at dusk, in smoke and firelight.
 * Its textures (the road of layered stone, the scorched quarry ground, the
 * strata of the quarry walls with veins of precious stone in them, the iron
 * chain along the barriers), its scenery, a tier of being to each rung of
 * the ladder (the minerals: crystals, geodes, quarried blocks and small rocks
 * with eyes; the plants: twisted trees and ferns; the beasts: lambs grazing
 * among the trees; men:
 * cottages, some of them burning, graves and bonfires; the angels: stone
 * angels with their haloes lit and banks of cloud; the top: gold columns and
 * candles in the clouds), its landmarks (a link of the great chain for a
 * gate, the rock with eyes to the sky, the church burning, the great chain
 * hanging out of the sky, the empty throne, the broken link) and its
 * hazard's look (the rocky meteors).
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

/** The strata of the bottom link of the chain: ochre, rust, slate, a dusky violet, cream. */
const STRATA: RGB[] = [
  [168, 112, 62],
  [132, 66, 42],
  [96, 92, 98],
  [186, 150, 102],
  [92, 64, 80],
  [150, 96, 58],
  [120, 110, 104],
  [204, 176, 128],
];
/** The precious stones in it: amethyst, ruby, emerald, topaz, sapphire. */
const GEMS: RGB[] = [
  [168, 92, 232],
  [226, 44, 70],
  [46, 196, 120],
  [246, 190, 64],
  [70, 120, 236],
];
const GEM_HEX = GEMS.map(([r, g, b]) => (r << 16) | (g << 8) | b);

/**
 * The road: slabs cut from the bottom of the chain, laid in two courses,
 * staggered, each a different stone, the fine layers of its strata showing
 * across it; the joints dark between them, the slabs worn paler where the
 * wheels run; mica glinting, and here and there a chip of precious stone.
 * The texture spans half the road (its u across, its v along).
 */
export function strataRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7101);
  const fine = fbm(S, 32, 2, 7102);
  /** The slab a texel is in: two courses across the half road, three slabs a tile along each, the second course staggered. */
  const slab = (x: number, y: number) => {
    const col = x < S / 2 ? 0 : 1;
    const yy = (y + (col ? S / 6 : 0)) % S;
    return { col, row: Math.floor(yy / (S / 3)), along: (yy % (S / 3)) / (S / 3) };
  };
  const GREY: RGB = [118, 108, 100];
  paint(ctx, S, S, (x, y, i) => {
    const u = x / S;
    const { col, row, along } = slab(x, y);
    const k = (col * 5 + row * 3) % STRATA.length;
    const stone = mix(STRATA[k], GREY, 0.45);
    // The slab's own strata: fine layers across it, a little wavy.
    const layer = Math.sin((along * 9 + (n[i] - 0.5) * 1.5) * Math.PI * 2);
    const layered = shade(stone, 0.93 + 0.07 * layer);
    // Worn smoother and paler where the wheels run.
    const wear = Math.min(...[0.3, 0.7].map((t) => Math.abs(u - t)));
    const worn = wear < 0.1 ? mix(layered, [184, 170, 150], (0.1 - wear) * 2.5) : layered;
    return shade(worn, 0.86 + fine[i] * 0.2);
  });
  const rand = seededRandom(7103);
  // The joints between the slabs.
  ctx.strokeStyle = 'rgba(26,16,12,0.8)';
  ctx.lineWidth = 3;
  for (const col of [0, 1]) {
    for (let row = 0; row < 3; row++) {
      const y = ((row * S) / 3 - (col ? S / 6 : 0) + S) % S;
      ctx.beginPath();
      ctx.moveTo(col * (S / 2), y);
      ctx.lineTo(col * (S / 2) + S / 2, y);
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.moveTo(S / 2, 0);
  ctx.lineTo(S / 2, S);
  ctx.stroke();
  // Hairline cracks.
  ctx.strokeStyle = 'rgba(40,24,18,0.5)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 18; k++) {
    let x = rand() * S;
    let y = rand() * S;
    let a = rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      a += (rand() - 0.5) * 1.4;
      x += Math.cos(a) * (6 + rand() * 10);
      y += Math.sin(a) * (6 + rand() * 10);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Mica, and chips of precious stone.
  for (let k = 0; k < 900; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,240,210,0.5)' : 'rgba(30,20,16,0.4)';
    ctx.fillRect(rand() * S, rand() * S, 1, 1);
  }
  for (let k = 0; k < 14; k++) {
    const g = GEMS[k % GEMS.length];
    const x = rand() * S;
    const y = rand() * S;
    ctx.fillStyle = css(shade(g, 0.6));
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.fillStyle = css(mix(g, [255, 255, 255], 0.5));
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  return finish(c);
}

/** The ground: a quarry's floor at dusk, scorched earth and ash, gravel and stone chips, dry grass in the hollows. */
export function scalaGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 5, 7111);
  const patch = fbm(S, 4, 3, 7112);
  paint(ctx, S, S, (_x, _y, i) => {
    const earth = mix([58, 42, 34], [98, 76, 58], n[i]);
    // Dry grass in the hollows, and scorched black where fire has been.
    if (patch[i] > 0.62) return mix(earth, [96, 88, 52], Math.min(1, (patch[i] - 0.62) * 5));
    if (patch[i] < 0.34) return mix(earth, [24, 18, 16], Math.min(1, (0.34 - patch[i]) * 5));
    return earth;
  });
  const rand = seededRandom(7113);
  for (let k = 0; k < 7000; k++) {
    const r = rand();
    ctx.fillStyle = r < 0.4 ? 'rgba(20,14,12,0.55)' : r < 0.8 ? 'rgba(170,150,130,0.35)' : 'rgba(210,190,160,0.4)';
    ctx.fillRect(rand() * S, rand() * S, 1.5, 1.5);
  }
  // Stone chips.
  for (let k = 0; k < 160; k++) {
    ctx.fillStyle = css(shade(STRATA[k % STRATA.length], 0.8 + rand() * 0.3), 0.8);
    ctx.beginPath();
    const x = rand() * S;
    const y = rand() * S;
    const r = 1.5 + rand() * 3;
    ctx.ellipse(x, y, r, r * (0.5 + rand() * 0.5), rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/**
 * The quarry's walls and the world's edge: sedimentary strata in bands of
 * every colour of the chain's bottom link, cracked, a seam of precious
 * stone glinting in one of them, darker streaks of smoke down from the top.
 */
export function strataWallTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 7121);
  const fine = fbm(S, 16, 3, 7122);
  const rand = seededRandom(7123);
  // Bands of varying thickness down the tile.
  const bands: { to: number; c: RGB }[] = [];
  let y = 0;
  let k = 0;
  while (y < S) {
    const h = 12 + rand() * 30;
    y += h;
    bands.push({ to: Math.min(S, y), c: STRATA[k++ % STRATA.length] });
  }
  paint(ctx, S, S, (x, yy, i) => {
    const w = yy + (n[i] - 0.5) * 18;
    const b = bands.find((q) => w < q.to) ?? bands[bands.length - 1];
    const smoke = Math.max(0, 1 - yy / (S * 0.5)) * (fine[x] > 0.55 ? 0.35 : 0.12);
    return shade(b.c, (0.78 + fine[i] * 0.3) * (1 - smoke));
  });
  // The seams between the strata.
  ctx.strokeStyle = 'rgba(28,18,14,0.6)';
  ctx.lineWidth = 1.5;
  for (const b of bands) {
    ctx.beginPath();
    for (let x = 0; x <= S; x += 8) ctx.lineTo(x, b.to + Math.sin(x * 0.07 + b.to) * 2);
    ctx.stroke();
  }
  // Vertical cracks.
  ctx.strokeStyle = 'rgba(20,12,10,0.55)';
  for (let j = 0; j < 12; j++) {
    let x = rand() * S;
    let yy = rand() * S;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    for (let q = 0; q < 5; q++) {
      x += (rand() - 0.5) * 8;
      yy += 6 + rand() * 10;
      ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // A seam of precious stones.
  const seam = bands[Math.floor(bands.length / 2)].to - 6;
  for (let x = 4; x < S; x += 6 + rand() * 10) {
    const g = GEMS[Math.floor(rand() * GEMS.length)];
    ctx.fillStyle = css(g);
    ctx.beginPath();
    ctx.moveTo(x, seam - 3);
    ctx.lineTo(x + 3, seam);
    ctx.lineTo(x, seam + 3);
    ctx.lineTo(x - 3, seam);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(x - 1, seam - 1, 1.5, 1.5);
  }
  return finish(c);
}

/** The barriers: dark iron, a length of chain riveted along it, rust bleeding from the links, firelight on the top edge. */
export function chainBarrierTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  const n = fbm(W, 8, 3, 7131);
  paint(ctx, W, H, (_x, y, i) => {
    const iron = mix([34, 30, 32], [64, 56, 54], n[i]);
    const rust = n[i] > 0.62 ? mix(iron, [120, 60, 30], (n[i] - 0.62) * 2) : iron;
    // Firelight on the top edge.
    return y < 6 ? mix(rust, [220, 130, 60], (6 - y) / 8) : rust;
  });
  // The chain: two links a tile, one face on, one edge on.
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(120,108,100,1)';
  ctx.beginPath();
  ctx.ellipse(W * 0.25, H * 0.5, W * 0.17, H * 0.2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(180,160,140,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(W * 0.25, H * 0.48, W * 0.17, H * 0.2, 0, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.fillStyle = 'rgba(120,108,100,1)';
  ctx.fillRect(W * 0.55, H * 0.44, W * 0.4, H * 0.12);
  ctx.fillStyle = 'rgba(190,170,150,0.6)';
  ctx.fillRect(W * 0.55, H * 0.44, W * 0.4, 2);
  // Rivets.
  ctx.fillStyle = 'rgba(16,14,14,0.9)';
  for (const x of [6, W / 2, W - 6]) for (const yy of [H * 0.2, H * 0.8]) ctx.fillRect(x - 2, yy - 2, 4, 4);
  return finish(c);
}

const glowTex = once(() => glowTexture());
const ironMat = once(() => new THREE.MeshPhongMaterial({ color: 0x2c2624, shininess: 40, specular: 0x6a4a3a, flatShading: true }));
const goldMat = once(() => new THREE.MeshPhongMaterial({ color: 0xd8a83a, emissive: 0x3a2004, shininess: 90, specular: 0xffe8a0 }));
const cloudMat = once(() => lambert(0xd8c8c0, { emissive: 0x3a2018, flatShading: true }));
const stoneMat = once(() => new THREE.MeshLambertMaterial({ map: strataWallTexture(), flatShading: true }));

function sprite(color: number, size: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size);
  return s;
}

/** A fire: an orange glow round a yellow core, flickering. */
function fire(animated: Animated, size: number): THREE.Group {
  const g = new THREE.Group();
  const outer = sprite(0xff5a14, size * 1.6, 0.9);
  const inner = sprite(0xffc860, size * 0.8);
  const tip = sprite(0xff8a20, size * 0.7, 0.8);
  tip.position.y = size * 0.5;
  g.add(outer, inner, tip);
  const ph = Math.random() * 6;
  animated.push((time) => {
    const f = 0.85 + Math.sin(time * 15 + ph) * 0.1 + Math.sin(time * 27 + ph * 2) * 0.08;
    outer.scale.setScalar(size * 1.6 * f);
    tip.position.y = size * (0.5 + 0.15 * Math.sin(time * 9 + ph));
    tip.scale.setScalar(size * 0.7 * (1.1 - f * 0.2));
  });
  return g;
}

/** Smoke rising from a fire: dark puffs climbing, spreading and thinning, over and over. */
function smoke(animated: Animated, size: number, rise: number, count = 6): THREE.Group {
  const g = new THREE.Group();
  const puffs: THREE.Sprite[] = [];
  for (let k = 0; k < count; k++) {
    const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x1a1210, transparent: true, opacity: 0.5, depthWrite: false }));
    g.add(p);
    puffs.push(p);
  }
  const ph = Math.random();
  animated.push((time) => {
    puffs.forEach((p, k) => {
      const u = (time * 0.12 + k / count + ph) % 1;
      p.position.set(Math.sin(u * 3 + k) * size * 0.4 + u * size, u * rise, Math.cos(u * 2 + k) * size * 0.3);
      p.scale.setScalar(size * (0.8 + u * 2.2));
      (p.material as THREE.SpriteMaterial).opacity = 0.55 * (1 - u);
    });
  });
  return g;
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

/**
 * A link of chain, the shape of a running track: its bar `bar` thick, its
 * centreline `halfLen` from the middle to either end along y and `halfWidth`
 * across x, in the x-y plane.
 */
class LinkCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly halfLen: number,
    private readonly halfWidth: number,
  ) {
    super();
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const w = this.halfWidth;
    const s = Math.max(0, this.halfLen - w);
    const per = 4 * s + 2 * Math.PI * w;
    let d = ((t % 1) + 1) % 1 * per;
    if (d < 2 * s) return target.set(w, -s + d, 0);
    d -= 2 * s;
    if (d < Math.PI * w) return target.set(w * Math.cos(d / w), s + w * Math.sin(d / w), 0);
    d -= Math.PI * w;
    if (d < 2 * s) return target.set(-w, s - d, 0);
    d -= 2 * s;
    const a = Math.PI + d / w;
    return target.set(w * Math.cos(a), -s + w * Math.sin(a), 0);
  }
}

function linkGeometry(halfLen: number, halfWidth: number, bar: number, segments = 48): THREE.TubeGeometry {
  return new THREE.TubeGeometry(new LinkCurve(halfLen, halfWidth), segments, bar, 8, true);
}

/**
 * The tier of being the ground at `z` is under, on the ladder of the
 * track's rungs: 0 the minerals, 1 the plants, 2 the beasts, 3 men, 4 the
 * angels, 5 the top.
 */
export function tierAt(z: number): number {
  for (let k = 0; k < RUNGS.length - 1; k++) if (z < (RUNGS[k] + RUNGS[k + 1]) / 2) return k;
  return RUNGS.length - 1;
}

/** The tiers for this track's scenery: the rungs' if it's the ladder's own, none (all of them mixed) on a generated track. */
export function chainTiers(track: Track): ((x: number, z: number) => number) | undefined {
  return track.def.id === 'great-chain-of-being' ? (_x, z) => tierAt(z) : undefined;
}

/**
 * The scenery, a tier of being on each rung of the ladder: the minerals
 * (clusters of precious stones, geodes split open, quarried blocks, small
 * rocks with eyes), the plants (twisted trees, ferns), the beasts (lambs
 * grazing among the trees), men (cottages with their windows lit and some of them burning,
 * graves, bonfires), the angels (stone angels with their haloes lit, banks
 * of cloud) and the top (gold columns, candles, cloud). With no tiers, a
 * mix of them all.
 */
export function scalaFeature(animated: Animated, tiers?: (x: number, z: number) => number): Feature {
  const gemMats = GEM_HEX.map((c) => new THREE.MeshPhongMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, shininess: 120, specular: 0xffffff, flatShading: true, transparent: true, opacity: 0.9 }));
  const rock = new THREE.MeshLambertMaterial({ color: 0x6a5a50, flatShading: true });
  const white = new THREE.MeshPhongMaterial({ color: 0xf4f0e8, shininess: 60 });
  const black = new THREE.MeshBasicMaterial({ color: 0x0a0808 });
  const bark = lambert(0x3a2a20, { flatShading: true });
  const leaves = [lambert(0x4a5a28, { flatShading: true }), lambert(0x6a4a1a, { flatShading: true }), lambert(0x2a3a20, { flatShading: true })];
  const fernMat = lambert(0x4a6a2a, { side: THREE.DoubleSide, flatShading: true });
  const wool = lambert(0xe8e0d0, { flatShading: true });
  const face = lambert(0x1a1414);
  const wall = lambert(0x9a8a74, { flatShading: true });
  const thatch = lambert(0x6a5030, { flatShading: true });
  const lit = new THREE.MeshBasicMaterial({ color: 0xffb050 });
  const statue = lambert(0xb8b0a4, { flatShading: true });
  const halo = new THREE.MeshBasicMaterial({ color: 0xffe0a0 });
  const wax = lambert(0xf0e4c8);
  const crystal = new THREE.ConeGeometry(1, 1, 6);
  crystal.translate(0, 0.5, 0);
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const eyeGeo = new THREE.SphereGeometry(1, 12, 8);

  /** A cluster of crystals of one precious stone, growing out of the ground at angles. */
  const crystals: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const mat = gemMats[Math.floor(rand() * gemMats.length)];
    const n = 4 + Math.floor(rand() * 5);
    for (let k = 0; k < n; k++) {
      const c = new THREE.Mesh(crystal, mat);
      const h = 1.5 + rand() * 4;
      c.scale.set(0.3 + rand() * 0.4, h, 0.3 + rand() * 0.4);
      c.position.set((rand() - 0.5) * 2, -0.3, (rand() - 0.5) * 2);
      c.rotation.set((rand() - 0.5) * 0.9, rand() * 3, (rand() - 0.5) * 0.9);
      t.add(c);
    }
    const g = sprite(mat.color.getHex(), 5, 0.35);
    g.position.y = 1.5;
    t.add(g);
    return place(t, x, z, rand);
  };
  /** A geode split open, its half lying cut face up, crystals inside. */
  const geode: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 1.6 + rand() * 1.6;
    const lining = new THREE.Mesh(new THREE.CircleGeometry(r * 0.85, 12), gemMats[Math.floor(rand() * gemMats.length)]);
    lining.rotation.x = -Math.PI / 2;
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), rock);
    bowl.position.y = r * 0.15;
    bowl.scale.y = 0.6;
    lining.position.y = r * 0.16;
    t.add(bowl, lining);
    for (let k = 0; k < 6; k++) {
      const c = new THREE.Mesh(crystal, lining.material as THREE.Material);
      c.scale.set(0.2, 0.5 + rand() * 0.6, 0.2);
      const a = rand() * Math.PI * 2;
      const d = rand() * r * 0.6;
      c.position.set(Math.cos(a) * d, r * 0.16, Math.sin(a) * d);
      c.rotation.set((rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6);
      t.add(c);
    }
    return place(t, x, z, rand);
  };
  /** Blocks of stone cut from the quarry, stacked. */
  const blocks: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.6), stoneMat());
      b.position.set((rand() - 0.5) * 3, 0.8 + (k > 2 ? 1.6 : 0), (k % 3) * 1.8 - 1.8);
      b.rotation.y = (rand() - 0.5) * 0.3;
      t.add(b);
    }
    return place(t, x, z, rand);
  };
  /** A small rock with eyes, its kin, looking up at the sky; now and then it blinks. */
  const eyedRock: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 1.2 + rand() * 1.4;
    const body = new THREE.Mesh(blob, rock);
    body.scale.set(r, r * 0.75, r);
    body.position.y = r * 0.5;
    t.add(body);
    const eyes = new THREE.Group();
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, white);
      e.scale.setScalar(r * 0.26);
      e.position.set(side * r * 0.3, r * 1.1, r * 0.2);
      const pupil = new THREE.Mesh(eyeGeo, black);
      pupil.scale.setScalar(0.5);
      pupil.position.set(0, 0.7, 0.3);
      e.add(pupil);
      eyes.add(e);
    }
    t.add(eyes);
    const ph = rand() * 9;
    animated.push((time) => (eyes.scale.y = (time + ph) % 6 < 0.15 ? 0.1 : 1));
    return place(t, x, z, rand);
  };

  /** A tree, twisted, its leaves turning in the dusk. */
  const tree: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 6 + rand() * 7;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, h, 7), bark);
    trunk.position.y = h / 2;
    trunk.rotation.z = (rand() - 0.5) * 0.25;
    t.add(trunk);
    const mat = leaves[Math.floor(rand() * leaves.length)];
    for (let k = 0; k < 4; k++) {
      const c = new THREE.Mesh(blob, mat);
      c.scale.setScalar(1.8 + rand() * 1.6);
      c.position.set((rand() - 0.5) * 3.4, h + (rand() - 0.3) * 2, (rand() - 0.5) * 3.4);
      t.add(c);
    }
    return place(t, x, z, rand);
  };
  /** A fern, its fronds unrolled. */
  const fern: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 6 + Math.floor(rand() * 4);
    const frond = new THREE.PlaneGeometry(0.9, 3.4);
    frond.translate(0, 1.7, 0);
    for (let k = 0; k < n; k++) {
      const f = new THREE.Mesh(frond, fernMat);
      f.rotation.set(-0.6 - rand() * 0.4, (k / n) * Math.PI * 2, 0, 'YXZ');
      f.scale.setScalar(0.8 + rand() * 0.6);
      t.add(f);
    }
    return place(t, x, z, rand);
  };
  /** A lamb, or a few, grazing: a woolly body, a black face, black legs; heads down, and now and then up. */
  const lambs: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const l = new THREE.Group();
      const body = new THREE.Mesh(blob, wool);
      body.scale.set(0.8, 0.65, 1.15);
      body.position.y = 1.05;
      const head = new THREE.Mesh(blob, face);
      head.scale.set(0.32, 0.38, 0.45);
      const neck = new THREE.Group();
      neck.position.set(0, 1.2, 1.0);
      head.position.set(0, 0, 0.35);
      neck.add(head);
      l.add(body, neck);
      for (const [lx, lz] of [
        [-0.4, -0.6],
        [0.4, -0.6],
        [-0.4, 0.6],
        [0.4, 0.6],
      ]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 5), face);
        leg.position.set(lx, 0.4, lz);
        l.add(leg);
      }
      l.position.set((rand() - 0.5) * 6, 0, (rand() - 0.5) * 6);
      l.rotation.y = rand() * Math.PI * 2;
      t.add(l);
      const ph = rand() * 10;
      animated.push((time) => (neck.rotation.x = (time * 0.4 + ph) % 4 < 2.8 ? 0.7 : -0.1));
    }
    return place(t, x, z, rand);
  };

  /** A cottage, stone and thatch, its windows lit; one in three burning. */
  const cottage: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 5 + rand() * 3;
    const d = 4 + rand() * 2;
    const h = 3 + rand() * 1.5;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
    walls.position.y = h / 2;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, d * 0.75, w + 0.6, 4, 1), thatch);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.x = Math.PI / 4;
    roof.position.y = h + d * 0.3;
    roof.scale.set(1, 1, 0.7);
    t.add(walls, roof);
    for (const side of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), lit);
      win.position.set(side * w * 0.25, h * 0.55, d / 2 + 0.02);
      t.add(win);
    }
    if (rand() < 0.35) {
      const f = fire(animated, 3.5);
      f.position.set(0, h + d * 0.4, 0);
      const s = smoke(animated, 3, 30, 5);
      s.position.set(0, h + d * 0.4, 0);
      t.add(f, s);
    }
    return place(t, x, z, rand);
  };
  /** Graves: headstones and crosses, leaning. */
  const graves: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      let g: THREE.Object3D;
      if (rand() < 0.5) {
        g = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.25), statue);
        g.position.y = 0.6;
      } else {
        g = new THREE.Group();
        const up = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.8, 0.22), statue);
        up.position.y = 0.9;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1, 0.22, 0.22), statue);
        arm.position.y = 1.3;
        g.add(up, arm);
      }
      g.position.x += (k % 3) * 2 - 2;
      g.position.z += Math.floor(k / 3) * 2.2;
      g.rotation.z = (rand() - 0.5) * 0.3;
      t.add(g);
    }
    return place(t, x, z, rand);
  };
  /** A bonfire: logs, flames, smoke. */
  const bonfire: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 2.4, 6), bark);
      log.rotation.set(1.1, (k / 5) * Math.PI * 2, 0, 'YXZ');
      log.position.y = 0.5;
      t.add(log);
    }
    const f = fire(animated, 2.6);
    f.position.y = 1.2;
    const s = smoke(animated, 2, 22, 4);
    s.position.y = 2;
    t.add(f, s);
    return place(t, x, z, rand);
  };

  /** A stone angel, wings raised, its halo lit. */
  const angel: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const s = 1.4 + rand() * 1.2;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2 * s, 1.2 * s, 2 * s), stoneMat());
    plinth.position.y = 0.6 * s;
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.8 * s, 3 * s, 8), statue);
    robe.position.y = 2.7 * s;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42 * s, 10, 8), statue);
    head.position.y = 4.5 * s;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5 * s, 0.07 * s, 6, 20), halo);
    ring.rotation.x = Math.PI / 2 - 0.3;
    ring.position.y = 5.1 * s;
    const glow = sprite(0xffd890, 2.5 * s, 0.6);
    glow.position.y = 5.1 * s;
    t.add(plinth, robe, head, ring, glow);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.6 * s, 3.4 * s, 4), statue);
      wing.scale.set(1, 1, 0.25);
      wing.position.set(side * 0.9 * s, 4 * s, -0.4 * s);
      wing.rotation.z = side * -0.5;
      t.add(wing);
    }
    const ph = rand() * 6;
    animated.push((time) => (glow.material.opacity = 0.45 + 0.2 * Math.sin(time * 1.3 + ph)));
    return place(t, x, z, rand);
  };
  /** A bank of cloud lying on the ground, lit from below by the fires. */
  const cloud: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 4 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const c = new THREE.Mesh(blob, cloudMat());
      c.scale.set(2.5 + rand() * 3, 1.5 + rand() * 1.5, 2.5 + rand() * 3);
      c.position.set((rand() - 0.5) * 9, 1 + rand() * 1.5, (rand() - 0.5) * 9);
      t.add(c);
    }
    const ph = rand() * 6;
    animated.push((time) => (t.position.y = Math.sin(time * 0.3 + ph) * 0.4));
    const g = new THREE.Group();
    g.add(t);
    return place(g, x, z, rand);
  };

  /** A column of gold, its capital worked, in the clouds at the top. */
  const column: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 10 + rand() * 12;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, h, 12), goldMat());
    shaft.position.y = h / 2;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 2.4), goldMat());
    cap.position.y = h + 0.4;
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 2.4), goldMat());
    base.position.y = 0.4;
    t.add(shaft, cap, base);
    return place(t, x, z, rand);
  };
  /** Candles as tall as a man, burning. */
  const candles: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const h = 2 + rand() * 3;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, h, 10), wax);
      c.position.set(k * 1.2 - n * 0.6, h / 2, (rand() - 0.5) * 1.2);
      const f = fire(animated, 0.9);
      f.position.set(c.position.x, h + 0.4, c.position.z);
      t.add(c, f);
    }
    return place(t, x, z, rand);
  };

  const byTier: Feature[] = [
    (x, z, rand) => pick(rand, [[3, crystals], [1.5, geode], [2, blocks], [1.2, eyedRock]])(x, z, rand),
    (x, z, rand) => pick(rand, [[3, tree], [2.5, fern]])(x, z, rand),
    (x, z, rand) => pick(rand, [[3, lambs], [1.2, tree], [0.5, fern]])(x, z, rand),
    (x, z, rand) => pick(rand, [[3, cottage], [2, graves], [1.2, bonfire], [1, tree]])(x, z, rand),
    (x, z, rand) => pick(rand, [[2, angel], [3, cloud], [0.6, column]])(x, z, rand),
    (x, z, rand) => pick(rand, [[2, column], [2, cloud], [1.5, candles], [0.6, angel]])(x, z, rand),
  ];
  return (x, z, rand) => byTier[tiers ? tiers(x, z) : Math.floor(rand() * byTier.length)](x, z, rand);
}

/** A face of words, carved and gilded, for the gate's plaque. */
const plaqueTexture = once(() => {
  const W = 1024;
  const H = 160;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#2a1a14';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#d8a83a';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.fillStyle = '#f0c860';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 84px Georgia, serif';
  ctx.fillText('THE GREAT CHAIN OF BEING', W / 2, H / 2 + 4);
  return finish(c, false);
});

/**
 * The gate: a link of the great chain standing up out of the ground astride
 * the road, its foot buried, the next link through the top of it and the
 * chain going on up out of sight into the smoke; a gilded plaque with the
 * chain's name, and braziers burning at its feet.
 */
export function chainGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pointAt(ribbon.spline, s);
  const hw = ribbon.halfWidthAtS(s);
  g.position.set(p.x, ribbon.heightAt(s), p.z);
  g.rotation.y = Math.atan2(p.tx, p.tz);
  const w = hw + 3;
  const bar = 1.5;
  const len = w * 1.6;
  const gate = new THREE.Mesh(linkGeometry(len, w, bar, 64), ironMat());
  gate.position.y = len * 0.35;
  g.add(gate);
  // The chain on up out of the top of it, a link at a time, each smaller, turned a quarter to the one before.
  let y = gate.position.y + len;
  let lw = w * 0.55;
  for (let k = 0; k < 7; k++) {
    const l = lw * 1.7;
    const m = new THREE.Mesh(linkGeometry(l, lw, bar * (lw / w) + 0.5, 40), ironMat());
    m.position.y = y + l - bar * 2;
    m.rotation.y = k % 2 === 0 ? Math.PI / 2 : 0;
    g.add(m);
    y = m.position.y + l - bar * 2;
    lw *= 0.92;
  }
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.5, w * 0.24), new THREE.MeshBasicMaterial({ map: plaqueTexture(), side: THREE.DoubleSide }));
  plaque.position.y = gate.position.y + len - w * 0.5;
  plaque.rotation.y = Math.PI;
  g.add(plaque);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 3.2, 6), ironMat());
    post.position.set(side * (w + 3), 1.6, -3);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.5, 0.8, 8), ironMat());
    bowl.position.set(side * (w + 3), 3.4, -3);
    const f = fire(animated, 2.2);
    f.position.set(side * (w + 3), 4.3, -3);
    g.add(post, bowl, f);
  }
  return g;
}

/** A rock face: rough, lumpy, its vertices pushed in and out. */
function lumpy(r: number, seed: number, detail = 2): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(r, detail);
  const pos = geo.getAttribute('position');
  const rand = seededRandom(seed);
  const bumps = Array.from({ length: 7 }, () => new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize());
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const f = 1 + bumps.reduce((a, b, k) => a + Math.max(0, n.dot(b)) ** 3 * (k % 2 ? 0.12 : -0.08), 0);
    v.multiplyScalar(f);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** An eye: the white, an iris of `iris`, the pupil, and a glint; looking along +z. Returns it and its iris, to turn. */
function eye(r: number, iris: number): { group: THREE.Group; look: THREE.Group } {
  const group = new THREE.Group();
  const white = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshPhongMaterial({ color: 0xf2ece0, shininess: 90, specular: 0xffffff }));
  const look = new THREE.Group();
  const ir = new THREE.Mesh(new THREE.CircleGeometry(r * 0.48, 20), new THREE.MeshBasicMaterial({ color: iris }));
  ir.position.z = r * 0.99;
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(r * 0.22, 16), new THREE.MeshBasicMaterial({ color: 0x050404 }));
  pupil.position.z = r * 1.0;
  const glint = new THREE.Mesh(new THREE.CircleGeometry(r * 0.08, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  glint.position.set(r * 0.12, r * 0.12, r * 1.01);
  look.add(ir, pupil, glint);
  group.add(white, look);
  return { group, look };
}

/**
 * The rock with eyes to the sky: a boulder as big as a house lying beside
 * its hairpin, two great eyes on top of it looking up into the smoke, waiting
 * for its time; now and then it blinks, and its eyes wander. Crystals grow
 * round its foot.
 */
export function rockWithEyes(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const { x, z, heading } = offRoad(ribbon, s, lateral);
  g.position.set(x, 0, z);
  g.rotation.y = heading;
  const R = 9;
  const body = new THREE.Mesh(lumpy(R, 7141), new THREE.MeshLambertMaterial({ map: strataWallTexture(), flatShading: true }));
  body.scale.set(1.3, 0.75, 1);
  body.position.y = R * 0.55;
  g.add(body);
  const eyes: THREE.Group[] = [];
  const lids: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const { group, look } = eye(2.6, 0x8a5a2a);
    group.position.set(side * 3.6, R * 1.15, 1.5);
    // Looking up at the sky.
    group.rotation.x = -Math.PI / 2 + 0.3;
    const lid = new THREE.Mesh(new THREE.SphereGeometry(2.75, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), body.material as THREE.Material);
    lid.position.copy(group.position);
    lid.rotation.x = -0.3;
    lid.scale.y = 0.15;
    g.add(group, lid);
    eyes.push(look);
    lids.push(lid);
  }
  const rand = seededRandom(7142);
  for (let k = 0; k < 7; k++) {
    const mat = new THREE.MeshPhongMaterial({ color: GEM_HEX[k % GEM_HEX.length], emissive: GEM_HEX[k % GEM_HEX.length], emissiveIntensity: 0.4, flatShading: true });
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4 + rand() * 4, 6), mat);
    const a = (k / 7) * Math.PI * 2 + rand();
    c.position.set(Math.cos(a) * R * 1.3, 1.5, Math.sin(a) * R * 1.0);
    c.rotation.set((rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.8);
    g.add(c);
  }
  animated.push((time) => {
    // It blinks, and its eyes drift across the sky.
    const blink = time % 5.3 < 0.18;
    lids.forEach((l) => (l.scale.y = blink ? 1 : 0.15));
    const a = time * 0.4;
    eyes.forEach((e) => {
      e.rotation.y = Math.sin(a) * 0.35;
      e.rotation.x = Math.cos(a * 0.7) * 0.25;
    });
  });
  return g;
}

/**
 * The church, burning: a nave of stone, its roof fallen in, the steeple with
 * its cross knocked crooked, its windows lit orange from inside, fire
 * through the roof and out of the windows, black smoke going up and up.
 * "Burn that God damn church to the ground."
 */
export function burningChurch(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const { x, z, heading } = offRoad(ribbon, s, lateral);
  g.position.set(x, 0, z);
  // Side on to the road it's beside.
  g.rotation.y = heading;
  const stone = new THREE.MeshLambertMaterial({ color: 0x8a7a6a, flatShading: true });
  const soot = lambert(0x2a2220, { flatShading: true });
  const glass = new THREE.MeshBasicMaterial({ color: 0xff8a30 });
  const L = 30;
  const W = 13;
  const H = 12;
  const nave = new THREE.Mesh(new THREE.BoxGeometry(W, H, L), stone);
  nave.position.y = H / 2;
  g.add(nave);
  // The roof, half of it fallen in: one slope left, charred, rafters showing.
  const slope = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.6, L * 0.55), soot);
  slope.position.set(-W * 0.25, H + W * 0.22, -L * 0.2);
  slope.rotation.z = 0.62;
  g.add(slope);
  for (let k = 0; k < 6; k++) {
    const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.4, W * 0.62, 0.4), soot);
    rafter.position.set(W * 0.22, H + W * 0.2, L * 0.1 + k * 2.4);
    rafter.rotation.z = -0.95;
    g.add(rafter);
  }
  // Tall arched windows lit from inside, down both sides.
  for (const side of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 5), glass);
      win.position.set(side * (W / 2 + 0.05), H * 0.5, -L / 2 + 4 + k * 5.5);
      win.rotation.y = side * Math.PI / 2;
      const top = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12, 0, Math.PI), glass);
      top.position.set(0, 2.5, 0.001);
      win.add(top);
      g.add(win);
    }
  }
  // The steeple at the west end, its spire, and the cross knocked crooked.
  const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 22, 6), stone);
  tower.position.set(0, 11, L / 2 + 3);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(4.4, 14, 4), soot);
  spire.position.set(0, 29, L / 2 + 3);
  spire.rotation.y = Math.PI / 4;
  const cross = new THREE.Group();
  const up = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5), goldMat());
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.5), goldMat());
  arm.position.y = 0.8;
  cross.add(up, arm);
  cross.position.set(0, 38, L / 2 + 3);
  cross.rotation.z = 0.5;
  const belfry = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.6), glass);
  belfry.position.set(0, 18, L / 2 + 6.05);
  g.add(tower, spire, cross, belfry);
  // The fire: through the roof, out of the windows, and the smoke.
  for (const [fx, fy, fz, size] of [
    [0, H + 2, -6, 9],
    [2, H + 1, 4, 7],
    [-3, H + 3, 10, 6],
    [0, 24, L / 2 + 3, 5],
  ]) {
    const f = fire(animated, size);
    f.position.set(fx, fy, fz);
    g.add(f);
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const f = fire(animated, 2);
      f.position.set(side * (W / 2 + 0.8), H * 0.6, -L / 2 + 6 + k * 9);
      g.add(f);
    }
  }
  const sm = smoke(animated, 10, 110, 9);
  sm.position.set(0, H + 4, 0);
  g.add(sm);
  // Its glow, lighting the smoke over it.
  const light = sprite(0xff6a20, 70, 0.45);
  light.position.set(0, H + 8, 0);
  g.add(light);
  animated.push((time) => (light.material.opacity = 0.4 + 0.06 * Math.sin(time * 13) + 0.04 * Math.sin(time * 7.3)));
  return g;
}

/**
 * The great chain, hanging out of the sky: link after iron link, each
 * turned a quarter to the one above, from somewhere above the smoke down
 * into the eye of the hairpin that climbs round it, swinging slowly. "I
 * climb chains to cut you down."
 */
export function greatChain(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const { x, z } = offRoad(ribbon, s, lateral);
  // Hung from a point high over the hairpin, so it swings about there.
  const TOP = 190;
  g.position.set(x, TOP, z);
  const len = 6;
  const w = 2.6;
  const bar = 0.8;
  const geo = linkGeometry(len, w, bar, 40);
  const pitch = 2 * (len - bar * 1.6);
  const n = Math.ceil((TOP - 2) / pitch);
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(geo, ironMat());
    m.position.y = -k * pitch - len;
    m.rotation.y = k % 2 === 0 ? 0 : Math.PI / 2;
    g.add(m);
  }
  const ph = 1.7;
  animated.push((time) => {
    g.rotation.z = Math.sin(time * 0.35 + ph) * 0.006;
    g.rotation.x = Math.sin(time * 0.27) * 0.004;
  });
  return g;
}

/**
 * The empty throne, at the top of the chain: a throne of gold on a bank of
 * cloud, nobody on it, a sunburst behind it, floating over the middle of the
 * swing round it, over Unlinked. "I have come to take the throne."
 */
export function emptyThrone(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const { x, z, heading } = offRoad(ribbon, s, lateral);
  const y = ribbon.heightAt(s) + 12;
  g.position.set(x, y, z);
  // Facing back down the ladder.
  g.rotation.y = heading - Math.PI / 2;
  const red = lambert(0x7a1420);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 5), goldMat());
  seat.position.y = 3.4;
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.6, 4.2), red);
  cushion.position.y = 4.2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(6, 10, 0.9), goldMat());
  back.position.set(0, 8.5, -2.3);
  const backCloth = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 7.6), red);
  backCloth.position.set(0, 8.2, -1.8);
  const crest = new THREE.Mesh(new THREE.ConeGeometry(3.2, 4, 4), goldMat());
  crest.position.set(0, 15.5, -2.3);
  crest.rotation.y = Math.PI / 4;
  crest.scale.z = 0.3;
  g.add(seat, cushion, back, backCloth, crest);
  for (const side of [-1, 1]) {
    const armRest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 5), goldMat());
    armRest.position.set(side * 3, 5.6, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), goldMat());
    knob.position.set(side * 3, 6.3, 2.6);
    g.add(armRest, knob);
    for (const end of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 0.8), goldMat());
      leg.position.set(side * 2.6, 1.5, end * 2);
      g.add(leg);
    }
  }
  // The cloud it sits on.
  const rand = seededRandom(7151);
  const blob = new THREE.IcosahedronGeometry(1, 1);
  for (let k = 0; k < 12; k++) {
    const c = new THREE.Mesh(blob, cloudMat());
    c.scale.set(3 + rand() * 3, 2 + rand() * 1.5, 3 + rand() * 3);
    const a = (k / 12) * Math.PI * 2;
    c.position.set(Math.cos(a) * (5 + rand() * 4), -1 + rand() * 1.2, Math.sin(a) * (5 + rand() * 4));
    g.add(c);
  }
  // The sunburst behind it, rising from behind its back, its rays swaying.
  const burst = new THREE.Group();
  const rayMat = new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const rayGeo = new THREE.PlaneGeometry(1.2, 14);
  rayGeo.translate(0, 7, 0);
  for (let k = 0; k < 11; k++) {
    const ray = new THREE.Mesh(rayGeo, rayMat);
    ray.rotation.z = ((k - 5) / 5) * 1.25;
    burst.add(ray);
  }
  burst.position.set(0, 10, -3.2);
  const glow = sprite(0xffc860, 26, 0.6);
  glow.position.set(0, 10, -3);
  g.add(burst, glow);
  animated.push((time) => {
    burst.rotation.z = Math.sin(time * 0.4) * 0.12;
    g.position.y = y + Math.sin(time * 0.5) * 0.6;
  });
  return g;
}

/**
 * The broken link: a link of the great chain standing astride Unlinked, the
 * top of it snapped through and the two ends bent apart, over the gap the
 * road leaps; pieces of it hang in the air. "The great chain of being will
 * be unlinked to start again."
 */
export function brokenLink(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pointAt(ribbon.spline, s);
  g.position.set(p.x, ribbon.heightAt(s), p.z);
  g.rotation.y = Math.atan2(p.tx, p.tz);
  const w = ribbon.halfWidthAtS(s) + 2.5;
  const len = w * 1.5;
  const bar = 1.2;
  // Two halves of the link, each an arc of it, parted at the top.
  for (const side of [-1, 1]) {
    const half = new THREE.Mesh(new THREE.TubeGeometry(new HalfLink(len, w, side), 32, bar, 8, false), ironMat());
    half.position.y = len * 0.3;
    half.rotation.z = side * -0.12;
    g.add(half);
    const end = sprite(0xff8a30, 3, 0.7);
    end.position.set(side * w * 0.55, len * 0.3 + len + w * 0.4, 0);
    g.add(end);
  }
  // Pieces of it hanging in the air over the gap.
  const pieces: THREE.Mesh[] = [];
  for (let k = 0; k < 4; k++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 2.4), ironMat());
    m.position.set((k - 1.5) * 3, len * 1.45 + (k % 2) * 2, (k % 2 ? 1 : -1) * 2);
    g.add(m);
    pieces.push(m);
  }
  animated.push((time) =>
    pieces.forEach((m, k) => {
      m.rotation.set(time * 0.3 + k, time * 0.2 + k * 2, 0);
      m.position.y = len * 1.45 + (k % 2) * 2 + Math.sin(time * 0.8 + k) * 0.4;
    }),
  );
  return g;
}

/** One side of a broken link: up its side from the buried foot and over toward the top, stopping short of the middle. */
class HalfLink extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly halfLen: number,
    private readonly halfWidth: number,
    private readonly side: number,
  ) {
    super();
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const w = this.halfWidth;
    const s = Math.max(0, this.halfLen - w);
    const straight = 2 * s;
    const arc = (Math.PI / 2) * 0.8 * w;
    const d = t * (straight + arc);
    if (d < straight) return target.set(this.side * w, -s + d, 0);
    const a = (d - straight) / w;
    return target.set(this.side * w * Math.cos(a), s + w * Math.sin(a), 0);
  }
}

/** The rocky meteor's face: dark rock with fire glowing through the cracks. */
const meteorTexture = once(() => {
  const S = 128;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 7161);
  paint(ctx, S, S, (_x, _y, i) => {
    const r = mix([40, 30, 28], [96, 76, 64], n[i]);
    return n[i] > 0.48 && n[i] < 0.52 ? [255, 140, 40] : r;
  });
  return finish(c);
});

/**
 * A rocky meteor, the hazard's look: a rock with eyes, burning; its mark
 * burning on the road where it will land, a ring closing in; the streak of
 * fire it comes down in; the burst of sparks as it lands; the fire it
 * trails, rolling back down the road at you, its eyes turning over and
 * over with it; and the pieces it crumbles into at the foot of the climb.
 */
export function meteorParts(obj: THREE.Object3D): THREE.Object3D[] {
  const R = METEOR_RADIUS;
  const rockGroup = new THREE.Group();
  const rock = new THREE.Mesh(lumpy(R, 7162, 1), new THREE.MeshPhongMaterial({ map: meteorTexture(), emissive: 0x3a1004, flatShading: true, shininess: 10 }));
  rockGroup.add(rock);
  for (const side of [-1, 1]) {
    const { group } = eye(R * 0.32, 0xd8a020);
    group.position.set(side * R * 0.38, R * 0.35, R * 0.78);
    rockGroup.add(group);
  }
  const flames = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const f = sprite(k % 2 ? 0xff7a20 : 0xffc050, R * (2.2 - k * 0.3), 0.85);
    f.userData.k = k;
    flames.add(f);
  }
  // Its streak down out of the sky.
  const streak = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.2, R * 0.9, 14, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  streak.geometry.translate(0, 7 + R, 0);
  // The mark on the road: a ring of fire closing in on where it will land, and the patch inside it.
  const mark = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff6a18, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(METEOR_BLAST * 0.88, METEOR_BLAST, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  const patch = new THREE.Mesh(
    new THREE.CircleGeometry(METEOR_BLAST, 32),
    new THREE.MeshBasicMaterial({ color: 0xff3a08, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  patch.rotation.x = -Math.PI / 2;
  patch.position.y = 0.02;
  mark.add(ring, patch);
  // The burst: a ring of sparks flying out from where it lands.
  const burst = new THREE.Group();
  for (let k = 0; k < 14; k++) {
    const spark = sprite(k % 3 ? 0xffb040 : 0xffffff, 1.2, 1);
    spark.userData.a = (k / 14) * Math.PI * 2;
    burst.add(spark);
  }
  // The fire it trails up the road behind it.
  const trail = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const f = sprite(0xff5a14, R * (2 - k * 0.25), 0.7 - k * 0.1);
    f.userData.k = k;
    trail.add(f);
  }
  // The pieces it crumbles into.
  const pieces = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(R * 0.35, 0), rock.material as THREE.Material);
    m.userData.a = (k / 6) * Math.PI * 2;
    pieces.add(m);
  }
  obj.add(rockGroup, flames, streak, mark, burst, trail, pieces);
  return [rockGroup, flames, streak, mark, burst, trail, pieces];
}

/** Poses a rocky meteor's parts (from meteorParts) by its stage. */
export function poseMeteor(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [rockGroup, flames, streak, mark, burst, trail, pieces] = parts;
  const S = METEOR_STAGE;
  const R = METEOR_RADIUS;
  // Downhill (back down the road) is local +z.
  obj.rotation.y = p.heading + Math.PI;
  const ground = p.ground - p.y;
  const visible = p.lane !== S.gone;
  obj.visible = visible;
  if (!visible) return;
  const falling = p.lane === S.mark;
  const seen = falling && p.phase >= 1 - METEOR_FALL / METEOR_MARK;
  rockGroup.visible = flames.visible = !falling || seen;
  streak.visible = seen;
  mark.visible = falling;
  burst.visible = p.lane === S.blast || (p.lane === S.roll && p.phase * R < METEOR_ROLL_BURST);
  trail.visible = p.lane === S.roll;
  pieces.visible = p.lane === S.crumble;
  if (falling) {
    // Its eyes on the sky as it comes; the ring closing in on where it lands.
    rockGroup.rotation.set(-Math.PI / 2, elapsed * 2, 0);
    rockGroup.scale.setScalar(1);
    mark.position.y = ground + 0.08;
    const ring = mark.children[0];
    const close = 1 + (1 - p.phase) * 0.8;
    ring.scale.setScalar(close);
    ring.rotation.z = elapsed * 2;
    const patchMat = (mark.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    patchMat.opacity = 0.15 + 0.35 * p.phase + 0.1 * Math.sin(elapsed * 14);
  } else if (p.lane === S.crumble) {
    rockGroup.scale.setScalar(Math.max(0.01, 1 - p.phase));
    flames.visible = false;
    pieces.children.forEach((m) => {
      const a = m.userData.a as number;
      const d = p.phase * R * 2.5;
      m.position.set(Math.cos(a) * d, ground + R * 0.4 + Math.sin(p.phase * Math.PI) * R, Math.sin(a) * d);
    });
  } else {
    // Rolling back down the road, over and over (p.phase is how far it has turned).
    rockGroup.scale.setScalar(1);
    rockGroup.rotation.set(p.phase, 0, 0);
  }
  flames.children.forEach((f) => {
    const k = f.userData.k as number;
    f.position.set(Math.sin(elapsed * 9 + k * 2) * R * 0.3, R * 0.2 + k * R * 0.35 * (falling ? 1 : 0.5), falling ? 0 : -k * R * 0.4);
  });
  if (trail.visible) {
    trail.children.forEach((f) => {
      const k = f.userData.k as number;
      f.position.set(Math.sin(elapsed * 7 + k) * 0.4, ground + R * 0.6 + Math.sin(elapsed * 11 + k) * 0.2, -(k + 1) * R * 1.2);
    });
  }
  if (burst.visible) {
    // Where it landed: back up the road (local -z) as far as it has rolled.
    const along = p.phase * R;
    const u = Math.min(1, along / METEOR_ROLL_BURST);
    burst.children.forEach((sp) => {
      const a = sp.userData.a as number;
      const d = 1 + u * METEOR_BLAST * 1.6;
      sp.position.set(Math.cos(a) * d, ground + 0.5 + Math.sin(u * Math.PI) * 2.5, Math.sin(a) * d - along);
      sp.scale.setScalar(1.4 * (1 - u * 0.7));
    });
  }
}

/** How far (m) it has rolled when the last of its burst's sparks have flown. */
const METEOR_ROLL_BURST = 6;
