import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { MAGNET_FIELD, MAGNET_HANG, MAGNET_STAGES, type HazardPose } from '../items/hazards';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import { billboardTexture, glowTexture } from './textures';

/**
 * Kill for the Steel's world: where the alien metal is mined and fought
 * over, an open-cut mine on an alien moon under the cup's one night. Dark
 * regolith stained with iron, terraces benched down into the pit, the haul
 * roads of crushed ore glinting with steel; girders stacked like trophies,
 * heaps of ore, ore trains and haul trucks; rival rigs' searchlights
 * sweeping the pit; the electromagnet cranes over the haul roads, and the
 * giant rig drilling on the rim. Its textures (the ore road, the regolith,
 * the benched pit walls, the steel barrier), its scenery, its landmarks,
 * and the cranes' magnets.
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type Animated = ((time: number) => void)[];
type RGB = [number, number, number];

/** The cup's one palette: black steel, molten orange, cold electric blue, a sick radiation green. */
const STEEL = 0x22262c;
const MOLTEN = 0xff7a1e;
const ELECTRIC = 0x6ad8ff;
const RADIATION = 0x9cff3a;
const HAZARD = 0xf0b420;

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const glowing = (color: number) => new THREE.MeshBasicMaterial({ color });

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

/** Specks scattered over a tile, wrapping at its edges: grains of ore, flecks of steel. */
function specks(ctx: CanvasRenderingContext2D, S: number, n: number, seed: number, colour: (rand: () => number) => string, size: [number, number]): void {
  const rand = seededRandom(seed);
  for (let k = 0; k < n; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = size[0] + rand() * (size[1] - size[0]);
    ctx.fillStyle = colour(rand);
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/**
 * The road: a mine's haul road of crushed ore, near black, iron red where
 * it has rusted, flecks of raw steel glinting cold in it, and the twin ruts
 * of the haul trucks' tyres worn down it either side of the middle. Across
 * the texture is the middle of the road (x = 0) out to its edge (x = 1).
 */
export function oreRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 5201);
  const rust = fbm(S, 3, 3, 5202);
  paint(ctx, S, S, (x, _y, i) => {
    let col = mix([34, 34, 38], [70, 68, 70], n[i]);
    if (rust[i] > 0.56) col = mix(col, mix([96, 44, 26], [140, 70, 36], n[i]), Math.min(1, (rust[i] - 0.56) * 5) * 0.7);
    // The haul trucks' dual tyres: two ruts, packed darker and smoother.
    const u = x / S;
    const rut = Math.max(0, 1 - Math.abs(u - 0.42) / 0.06) + Math.max(0, 1 - Math.abs(u - 0.6) / 0.06);
    col = mix(col, shade(mix([30, 30, 34], [52, 50, 52], n[i]), 0.8), Math.min(1, rut) * 0.6);
    return col;
  });
  specks(ctx, S, 900, 5203, (r) => (r() < 0.5 ? 'rgba(110,104,100,0.8)' : 'rgba(20,20,22,0.8)'), [0.6, 1.8]);
  specks(ctx, S, 140, 5204, (r) => (r() < 0.6 ? 'rgba(150,64,30,0.85)' : 'rgba(186,96,46,0.8)'), [0.8, 2.2]);
  // Raw steel in the ore, catching the light.
  specks(ctx, S, 90, 5205, (r) => (r() < 0.7 ? 'rgba(200,226,255,0.95)' : 'rgba(255,170,90,0.9)'), [0.5, 1.1]);
  return finish(c);
}

/** The ground: the alien moon's regolith, dark blue-grey dust, stained rust red where the iron runs near the surface, small craters, spoil scattered over it. */
export function regolithTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 5, 5211);
  const iron = fbm(S, 3, 4, 5212);
  paint(ctx, S, S, (_x, _y, i) => {
    let col = mix([40, 44, 54], [82, 86, 96], n[i]);
    if (iron[i] > 0.55) col = mix(col, mix([92, 46, 32], [126, 66, 42], n[i]), Math.min(1, (iron[i] - 0.55) * 4) * 0.8);
    return col;
  });
  const rand = seededRandom(5213);
  // Craters: a dark bowl, its rim lit on one side.
  for (let k = 0; k < 40; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 3 + rand() * 12;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        ctx.fillStyle = 'rgba(14,16,22,0.45)';
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(150,156,170,0.35)';
        ctx.lineWidth = Math.max(1, r * 0.18);
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, Math.PI * 0.9, Math.PI * 1.7);
        ctx.stroke();
      }
    }
  }
  specks(ctx, S, 1400, 5214, (r) => (r() < 0.5 ? 'rgba(120,124,136,0.7)' : 'rgba(16,18,24,0.7)'), [0.6, 1.6]);
  return finish(c);
}

/**
 * The pit's walls, and the cuts the benches run in: rock in uneven bands
 * of strata, dark slate, rust red and ochre where the ore is, split by
 * joints; the half-barrels of the drill holes they were blasted along
 * scored down the face; a ledge where each bench was cut; iron weeping
 * down it.
 */
export function benchWallTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 5221);
  const band = fbm(S, 2, 3, 5222);
  const grain = fbm(S, 16, 2, 5223);
  const tones: RGB[] = [
    [58, 60, 68],
    [96, 50, 34],
    [44, 46, 54],
    [118, 88, 52],
    [70, 68, 74],
    [84, 42, 30],
    [52, 54, 62],
  ];
  paint(ctx, S, S, (x, y, i) => {
    // Strata of uneven thickness, warped.
    const v = y / S + (band[i] - 0.5) * 0.18;
    const w = v * 7 + Math.sin(v * 13) * 0.6;
    const layer = ((Math.floor(w) % tones.length) + tones.length) % tones.length;
    let col = shade(tones[layer], 0.72 + n[i] * 0.4 + (grain[i] - 0.5) * 0.25);
    // The ledge the bench was cut to: a lit lip, the shadow under it.
    const f = (y / S) * 2 - Math.floor((y / S) * 2);
    if (f < 0.03) col = mix(col, [150, 148, 150], 0.35);
    else if (f < 0.07) col = shade(col, 0.6);
    // Half-barrels of the drill holes, scored down the face from each ledge.
    const hole = (x + 4) % 21;
    if (hole < 2 && f > 0.07 && f < 0.45 + n[i] * 0.2) col = shade(col, hole < 1 ? 0.62 : 1.18);
    // Iron weeping down it.
    if (Math.sin(x * 0.17 + n[i] * 5) > 0.95 && f > 0.07) col = mix(col, [130, 62, 30], 0.4);
    return col;
  });
  // Joints: cracks across the strata.
  const rand = seededRandom(5224);
  ctx.strokeStyle = 'rgba(14,14,18,0.7)';
  for (let k = 0; k < 16; k++) {
    let x = rand() * S;
    let y = rand() * S;
    ctx.lineWidth = 0.8 + rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (rand() - 0.5) * 20;
      y += 6 + rand() * 14;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(c);
}

/** The barrier: steel plate, black and hazard yellow in chevrons, scraped and rusting, rivets along its top and bottom. */
export function steelBarrierTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 3, 5231);
  paint(ctx, S, S, (x, y, i) => {
    const v = y / S;
    if (v < 0.12 || v > 0.88) return shade(mix([46, 48, 54], [80, 82, 88], n[i]), 0.9);
    const stripe = ((x + y) >> 5) % 2 === 0;
    let col: RGB = stripe ? mix([200, 150, 30], [236, 184, 40], n[i]) : mix([20, 20, 22], [44, 42, 44], n[i]);
    // Scraped through to the steel, and rusting round the scrapes.
    if (n[i] > 0.7) col = mix(col, [120, 60, 30], (n[i] - 0.7) * 2.5);
    if (n[i] < 0.22) col = mix(col, [110, 112, 118], 0.5);
    return col;
  });
  ctx.fillStyle = 'rgba(150,150,156,0.9)';
  for (let x = 8; x < S; x += 24) {
    for (const y of [S * 0.06, S * 0.94]) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish(c);
}

const glowTex = once(() => glowTexture());

/** Rusted steel, for girders, gantries and scrap. */
const rustTexture = once(() => {
  const S = 128;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 5241);
  const r = fbm(S, 4, 2, 5242);
  paint(ctx, S, S, (_x, _y, i) => {
    const steel = mix([40, 44, 52], [86, 90, 98], n[i]);
    return r[i] > 0.5 ? mix(steel, mix([110, 50, 26], [160, 84, 40], n[i]), Math.min(1, (r[i] - 0.5) * 3)) : steel;
  });
  return finish(c);
});

/** A steel I-beam's section, `w` wide over its flanges and `h` deep, extruded along z for `len`. */
function iBeam(w: number, h: number, len: number): THREE.ExtrudeGeometry {
  const f = h * 0.14;
  const web = w * 0.18;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2 + f);
  s.lineTo(web / 2, -h / 2 + f);
  s.lineTo(web / 2, h / 2 - f);
  s.lineTo(w / 2, h / 2 - f);
  s.lineTo(w / 2, h / 2);
  s.lineTo(-w / 2, h / 2);
  s.lineTo(-w / 2, h / 2 - f);
  s.lineTo(-web / 2, h / 2 - f);
  s.lineTo(-web / 2, -h / 2 + f);
  s.lineTo(-w / 2, -h / 2 + f);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  return g;
}

/** A lattice: four corner posts `w` apart and `h` tall, braced in X's every `bay`. Sits on the origin. */
function lattice(w: number, h: number, bay: number, mat: THREE.Material, post = 0.35): THREE.Group {
  const g = new THREE.Group();
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(post, h, post), mat);
    p.position.set((x * w) / 2, h / 2, (z * w) / 2);
    g.add(p);
  }
  const diag = Math.hypot(w, bay);
  const brace = new THREE.BoxGeometry(post * 0.5, diag, post * 0.5);
  for (let y = 0; y + bay <= h + 1e-6; y += bay) {
    for (let side = 0; side < 4; side++) {
      for (const dir of [-1, 1]) {
        const b = new THREE.Mesh(brace, mat);
        const a = (side * Math.PI) / 2;
        b.position.set(Math.sin(a) * (w / 2), y + bay / 2, Math.cos(a) * (w / 2));
        b.rotation.set(0, a, dir * Math.atan2(w, bay));
        b.rotation.order = 'YXZ';
        g.add(b);
      }
    }
  }
  return g;
}

/** A light: a bright core sprite, and a soft glow round it. */
function lamp(color: number, size: number): THREE.Group {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.12, 8, 6), glowing(color));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.setScalar(size);
  g.add(core, halo);
  return g;
}

/** A searchlight's beam: a long cone of light from its narrow end at the origin out along -y, additive. */
function beamCone(length: number, spread: number, color: number, opacity: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(0.4, spread, length, 16, 1, true);
  geo.translate(0, -length / 2, 0);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
}

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

/** Girders stacked like trophies: layers of I-beams laid crosswise on each other, `layers` high. */
function girderStack(layers: number, len: number, rand: () => number, mat: THREE.Material, beam: THREE.BufferGeometry): THREE.Group {
  const g = new THREE.Group();
  for (let l = 0; l < layers; l++) {
    const n = 3 + Math.floor(rand() * 2);
    const layer = new THREE.Group();
    layer.position.y = 0.45 + l * 0.9;
    layer.rotation.y = (l % 2 ? Math.PI / 2 : 0) + (rand() - 0.5) * 0.12;
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(beam, mat);
      b.position.set((k - (n - 1) / 2) * (len / (n + 1)), 0, (rand() - 0.5) * 0.8);
      layer.add(b);
    }
    g.add(layer);
  }
  return g;
}

/**
 * The mine: girders stacked like trophies, heaps of ore glinting, an ore
 * train on its rails, the haul trucks parked up, scrap, and the rival
 * rigs' searchlight towers sweeping their beams across the pit; the odd
 * crystal of the alien metal itself, glowing green, broken out of the rock.
 */
export function mineFeature(animated: Animated): Feature {
  const rust = new THREE.MeshLambertMaterial({ map: rustTexture() });
  const ore = lambert(0x3a3436, { flatShading: true });
  const oreRed = lambert(0x6a3424, { flatShading: true });
  const glint = glowing(0xd0e8ff);
  const yellow = lambert(HAZARD);
  const tyre = lambert(0x141416);
  const dark = lambert(STEEL);
  const glass = glowing(0xffb860);
  const crystal = new THREE.MeshLambertMaterial({ color: RADIATION, emissive: RADIATION, emissiveIntensity: 0.7, flatShading: true });
  const beam = iBeam(0.5, 0.6, 9);
  const stack: Feature = (x, z, rand) => place(girderStack(3 + Math.floor(rand() * 5), 9, rand, rust, beam), x, z, rand);
  const heap: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 4 + rand() * 6;
    const h = r * (0.5 + rand() * 0.3);
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9, 2), rand() < 0.35 ? oreRed : ore);
    c.position.y = h / 2;
    c.rotation.y = rand() * 3;
    t.add(c);
    // Steel glinting in it.
    for (let k = 0; k < 6; k++) {
      const a = rand() * Math.PI * 2;
      const u = rand() * 0.8;
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), glint);
      s.position.set(Math.cos(a) * r * (1 - u) * 0.95, h * u + 0.1, Math.sin(a) * r * (1 - u) * 0.95);
      t.add(s);
    }
    return place(t, x, z, rand);
  };
  const train: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 3 + Math.floor(rand() * 3);
    const len = n * 6 + 6;
    for (const side of [-0.8, 0.8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, len), dark);
      rail.position.set(side, 0.2, 0);
      t.add(rail);
    }
    for (let k = 0; k < len; k += 1.4) {
      const sleeper = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.3), rust);
      sleeper.position.set(0, 0.06, -len / 2 + k);
      t.add(sleeper);
    }
    for (let k = 0; k < n; k++) {
      const wagon = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 5), rust);
      body.position.y = 1.5;
      const load = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1, 6), ore);
      load.scale.z = 1.7;
      load.position.y = 2.7;
      wagon.add(body, load);
      for (const wz of [-1.6, 1.6]) {
        for (const wx of [-0.8, 0.8]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.25, 10), dark);
          w.rotation.z = Math.PI / 2;
          w.position.set(wx, 0.55, wz);
          wagon.add(w);
        }
      }
      wagon.position.z = -len / 2 + 5 + k * 6;
      t.add(wagon);
    }
    return place(t, x, z, rand);
  };
  const truck: Feature = (x, z, rand) => {
    // A haul truck: wheels taller than a man, a tipper body, a cab up on the deck, its lights on.
    const t = new THREE.Group();
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 11), dark);
    chassis.position.y = 2.6;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 7.5), yellow);
    bed.position.set(0, 4.6, -1.6);
    bed.rotation.x = rand() < 0.3 ? -0.5 : -0.06;
    const load = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.6, 7), ore);
    load.scale.z = 1.4;
    load.position.set(0, 1.6, 0);
    bed.add(load);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 2.4), yellow);
    cab.position.set(-1.2, 4.4, 4);
    const window = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.8), glass);
    window.position.set(-1.2, 4.7, 5.21);
    t.add(chassis, bed, cab, window);
    for (const [wx, wz] of [[-2.8, 3.6], [2.8, 3.6], [-2.8, -2.6], [2.8, -2.6], [-2.8, -4.6], [2.8, -4.6]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 1.4, 14), tyre);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 1.8, wz);
      t.add(w);
    }
    for (const lx of [-1.8, 1.8]) {
      const l = lamp(0xfff0c0, 2.2);
      l.position.set(lx, 2.6, 5.6);
      t.add(l);
    }
    return place(t, x, z, rand);
  };
  const scrap: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 9; k++) {
      const m = rand() < 0.5 ? new THREE.Mesh(new THREE.BoxGeometry(0.3 + rand() * 3, 0.2 + rand(), 0.3 + rand() * 2), rand() < 0.5 ? rust : dark) : new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1 + rand() * 3, 7), rust);
      m.position.set((rand() - 0.5) * 4, 0.3 + rand() * 1.4, (rand() - 0.5) * 4);
      m.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      t.add(m);
    }
    return place(t, x, z, rand);
  };
  const searchlight: Feature = (x, z, rand) => {
    // A rival rig's searchlight on a lattice tower, its beam sweeping the pit.
    const t = new THREE.Group();
    const h = 14 + rand() * 10;
    t.add(lattice(1.6, h, 3, rust, 0.22));
    const head = new THREE.Group();
    head.position.y = h + 0.6;
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 1.4, 12), dark);
    housing.rotation.x = Math.PI / 2;
    const face = lamp(0xe8f4ff, 4);
    face.position.z = 0.8;
    const beamGroup = new THREE.Group();
    const cone = beamCone(55, 5, 0xbfe0ff, 0.025);
    cone.rotation.x = -Math.PI / 2;
    beamGroup.add(cone);
    beamGroup.rotation.x = 0.35;
    head.add(housing, face, beamGroup);
    const warn = lamp(0xff3020, 1.6);
    warn.position.y = h + 2;
    t.add(head, warn);
    const ph = rand() * 10;
    const rate = 0.25 + rand() * 0.3;
    animated.push((time) => {
      head.rotation.y = Math.sin(time * rate + ph) * 1.4;
      head.rotation.x = -0.2 + Math.sin(time * rate * 1.7 + ph) * 0.1;
      warn.visible = Math.sin(time * 3 + ph) > 0;
    });
    t.position.set(x, 0, z);
    return t;
  };
  const shard: Feature = (x, z, rand) => {
    // The alien metal itself, broken out of the rock: crystals of it, glowing.
    const t = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const h = 1.2 + rand() * 2.8;
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), crystal);
      c.scale.set(0.4 + rand() * 0.3, h, 0.4 + rand() * 0.3);
      c.position.set((rand() - 0.5) * 2.5, h * 0.6, (rand() - 0.5) * 2.5);
      c.rotation.set((rand() - 0.5) * 0.8, rand() * 3, (rand() - 0.5) * 0.8);
      t.add(c);
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: RADIATION, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 }));
    halo.scale.setScalar(7);
    halo.position.y = 1.5;
    t.add(halo);
    const ph = rand() * 10;
    animated.push((time) => (halo.material.opacity = 0.35 + 0.2 * Math.sin(time * 2 + ph)));
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [3, stack],
      [4, heap],
      [1.2, train],
      [1.2, truck],
      [2, scrap],
      [0.5, searchlight],
      [1, shard],
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
 * The start: two stacks of girders either side of the road, higher than a
 * house, girders laid crosswise like trophies won; a gantry crane over the
 * road on them, KILL FOR THE STEEL along its beam, a hook hanging from its
 * trolley, orange beacons turning on its legs.
 */
export function steelGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 3;
  const rand = seededRandom(5251);
  const rust = new THREE.MeshLambertMaterial({ map: rustTexture() });
  const yellow = lambert(HAZARD);
  const dark = lambert(STEEL);
  const beam = iBeam(0.6, 0.7, 10);
  const H = 15;
  for (const side of [-1, 1]) {
    const pile = girderStack(10, 10, rand, rust, beam);
    pile.position.set(side * (hw + 5), 0, 0);
    pile.scale.set(1, 1.6, 1);
    g.add(pile);
    // The crane's legs, up out of the stacks.
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.4, H, 1.4), yellow);
    leg.position.set(side * hw, H / 2, 0);
    g.add(leg);
    const beacon = new THREE.Group();
    beacon.position.set(side * hw, H + 1.6, 0);
    const bulb = lamp(MOLTEN, 3);
    beacon.add(bulb);
    const sweep = beamCone(14, 3, MOLTEN, 0.18);
    sweep.rotation.z = Math.PI / 2;
    beacon.add(sweep);
    g.add(beacon);
    animated.push((time) => (beacon.rotation.y = time * 3 + side));
  }
  const top = new THREE.Mesh(iBeam(1.6, 2.2, hw * 2 + 4), yellow);
  top.rotation.y = Math.PI / 2;
  top.position.y = H + 0.4;
  g.add(top);
  const board = sign('KILL FOR THE STEEL', '#1a1c22', '#ffb020', hw * 1.4);
  board.position.set(0, H - 2.2, -0.2);
  g.add(board);
  // The trolley out over the road, and its hook swinging.
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2.2), dark);
  trolley.position.set(hw * 0.4, H - 1, 0);
  const hang = new THREE.Group();
  hang.position.set(hw * 0.4, H - 1.6, 0);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 4), dark);
  cable.position.y = -2;
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.18, 6, 12, Math.PI * 1.5), dark);
  hook.position.y = -4.4;
  hang.add(cable, hook);
  g.add(trolley, hang);
  animated.push((time) => {
    hang.rotation.z = Math.sin(time * 1.1) * 0.12;
    hang.rotation.x = Math.sin(time * 0.8 + 1) * 0.06;
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * The mining rig on the pit's rim: a crawler as big as a building, its
 * deck and cab lit, a lattice mast 70 m tall over it, and down its middle
 * the drill string, its auger turning into the rock, sparks thrown off it
 * molten orange; floodlights on the mast and a red light at its top.
 */
export function mineRig(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const rust = new THREE.MeshLambertMaterial({ map: rustTexture() });
  const yellow = lambert(HAZARD);
  const dark = lambert(STEEL);
  const tread = lambert(0x18181a);
  const glass = glowing(0xffc070);
  // The crawler: two tracks, a deck on them, a house and cab on the deck.
  for (const side of [-1, 1]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 34), tread);
    track.position.set(side * 13, 3, 0);
    g.add(track);
    for (let k = 0; k < 6; k++) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 7.4, 12), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 13, 3, -14 + k * 5.6);
      g.add(wheel);
    }
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(34, 4, 38), yellow);
  deck.position.y = 8;
  const house = new THREE.Mesh(new THREE.BoxGeometry(22, 10, 16), yellow);
  house.position.set(0, 15, -10);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 6), yellow);
  cab.position.set(-9, 22.5, -4);
  const window = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.4), glass);
  window.position.set(-9, 23, -0.95);
  g.add(deck, house, cab, window);
  // The mast.
  const H = 70;
  const mast = lattice(7, H, 7, rust, 0.6);
  mast.position.set(0, 10, 8);
  g.add(mast);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 10), dark);
  crown.position.set(0, 10 + H + 1.5, 8);
  const red = lamp(0xff2010, 8);
  red.position.set(0, 10 + H + 4, 8);
  g.add(crown, red);
  for (const y of [30, 55]) {
    for (const side of [-1, 1]) {
      const flood = lamp(0xf0f6ff, 9);
      flood.position.set(side * 4.5, y, 12);
      g.add(flood);
      const cone = beamCone(55, 12, 0xd8ecff, 0.03);
      cone.position.set(side * 4.5, y, 12);
      cone.rotation.set(0.9, 0, side * 0.5);
      g.add(cone);
    }
  }
  // The drill string, down the middle of the mast into the rock, and its auger turning.
  const drill = new THREE.Group();
  drill.position.set(0, 0, 8);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, H + 8, 10), dark);
  pipe.position.y = (H + 8) / 2 + 2;
  drill.add(pipe);
  const flight = new THREE.BoxGeometry(3.6, 0.35, 1.6);
  for (let k = 0; k < 60; k++) {
    const a = k * 0.5;
    const b = new THREE.Mesh(flight, rust);
    b.position.set(Math.cos(a) * 1.6, 2 + k * 0.32, Math.sin(a) * 1.6);
    b.rotation.set(0.25, -a, 0);
    drill.add(b);
  }
  g.add(drill);
  // Sparks off the bit, molten.
  const sparkMat = new THREE.SpriteMaterial({ map: glowTex(), color: MOLTEN, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const sparks: THREE.Sprite[] = [];
  for (let k = 0; k < 24; k++) {
    const sp = new THREE.Sprite(sparkMat);
    sp.scale.setScalar(1.2);
    sparks.push(sp);
    g.add(sp);
  }
  const glow = lamp(MOLTEN, 26);
  glow.position.set(0, 1.5, 8);
  g.add(glow);
  animated.push((time) => {
    drill.rotation.y = time * 2.4;
    red.visible = Math.sin(time * 2) > -0.3;
    sparks.forEach((sp, k) => {
      const u = (time * 0.9 + k / sparks.length) % 1;
      const a = k * 2.4;
      sp.position.set(Math.cos(a) * (3 + u * 14), 1 + u * 9 - u * u * 12, 8 + Math.sin(a) * (3 + u * 14));
      sp.visible = sp.position.y > 0;
    });
  });
  g.position.set(at.x, 0, at.z);
  // Square to the road, its mast over the pit side.
  g.rotation.y = at.heading + (lateral > 0 ? Math.PI / 2 : -Math.PI / 2);
  return g;
}

/**
 * A crane's magnet over the road: a gantry across it, a trolley that runs
 * along its beam carrying the magnet out over the road on its chains; the
 * magnet a great steel disc, banded in hazard stripes; blue arcs crawling
 * over it as it charges, its face lit cold blue and the field on the road
 * under it when it's on, and a burst of molten sparks as it lets go. Sits
 * at the road's middle (`obj` is moved there), facing along it.
 */
export function magnetParts(obj: THREE.Object3D, halfWidth: number): THREE.Object3D[] {
  const rust = new THREE.MeshLambertMaterial({ map: rustTexture() });
  const yellow = lambert(HAZARD);
  const dark = lambert(STEEL);
  const span = halfWidth + 4;
  const top = MAGNET_HANG + 7;
  const gantry = new THREE.Group();
  for (const side of [-1, 1]) {
    const leg = lattice(1.4, top, 2.4, rust, 0.25);
    leg.position.x = side * span;
    gantry.add(leg);
  }
  const rail = new THREE.Mesh(iBeam(1.2, 1.4, span * 2 + 2), yellow);
  rail.rotation.y = Math.PI / 2;
  rail.position.y = top + 0.7;
  gantry.add(rail);
  // The trolley, and hanging under it the magnet on its chains.
  const trolley = new THREE.Group();
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 2.4), dark);
  carriage.position.y = top - 0.4;
  trolley.add(carriage);
  const swing = new THREE.Group();
  swing.position.y = top - 1;
  const R = 3;
  const drop = top - 1 - MAGNET_HANG;
  for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, drop, 4), dark);
    chain.position.set(cx * R * 0.4, -drop / 2, cz * R * 0.4);
    swing.add(chain);
  }
  const magnet = new THREE.Group();
  magnet.position.y = -drop;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1, 28), dark);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.04, R + 0.04, 0.4, 28, 1, true), new THREE.MeshLambertMaterial({ map: steelBarrierTexture(), side: THREE.DoubleSide }));
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 0.8, 12), yellow);
  boss.position.y = 0.8;
  const face = new THREE.Mesh(new THREE.CircleGeometry(R * 0.92, 28), new THREE.MeshBasicMaterial({ color: ELECTRIC, transparent: true, opacity: 0.9 }));
  face.rotation.x = Math.PI / 2;
  face.position.y = -0.52;
  // Its rim, lit with the field when it's on.
  face.add(new THREE.Mesh(new THREE.TorusGeometry(R + 0.1, 0.16, 6, 32), glowing(ELECTRIC)));
  magnet.add(disc, band, boss, face);
  // Arcs crawling over it: a ring of bright flecks, flickering.
  const arcs = new THREE.Group();
  const arcMat = new THREE.SpriteMaterial({ map: glowTex(), color: ELECTRIC, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  for (let k = 0; k < 10; k++) arcs.add(new THREE.Sprite(arcMat));
  magnet.add(arcs);
  swing.add(magnet);
  trolley.add(swing);
  // The field on the road under it, and the lines of force up to it.
  const field = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(MAGNET_FIELD - 0.5, MAGNET_FIELD, 48), new THREE.MeshBasicMaterial({ color: ELECTRIC, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(MAGNET_FIELD, 40), new THREE.MeshBasicMaterial({ map: glowTex(), color: ELECTRIC, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  field.add(ring, pool);
  const lineMat = new THREE.MeshBasicMaterial({ color: ELECTRIC, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, MAGNET_HANG, 4), lineMat);
    line.position.set(Math.cos(a) * MAGNET_FIELD * 0.6, MAGNET_HANG / 2, Math.sin(a) * MAGNET_FIELD * 0.6);
    line.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    field.add(line);
  }
  field.position.y = 0.1;
  trolley.add(field);
  // Letting go: a burst of molten sparks.
  const burst = new THREE.Group();
  const sparkMat = new THREE.SpriteMaterial({ map: glowTex(), color: MOLTEN, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  for (let k = 0; k < 18; k++) burst.add(new THREE.Sprite(sparkMat));
  burst.position.y = MAGNET_HANG - 0.5;
  trolley.add(burst);
  const parts = [gantry, trolley, swing, magnet, face, arcs, field, burst];
  obj.add(gantry, trolley);
  return parts;
}

/** Poses a crane's magnet at stage `p.phase`: its trolley out over the road where it is, swinging; dark, charging, on, or letting go. */
export function poseMagnet(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [, trolley, swing, magnet, face, arcs, field, burst] = parts;
  const M = MAGNET_STAGES;
  const u = p.phase;
  obj.position.set(p.ax, p.ground, p.az);
  obj.rotation.y = p.heading;
  // In the road's frame, a lateral to the right is local -x.
  const lateral = (p.x - p.ax) * -Math.cos(p.heading) + (p.z - p.az) * Math.sin(p.heading);
  trolley.position.x = -lateral;
  // Swinging behind the trolley as it runs, the way a load on chains does.
  const across = -(p.vx * -Math.cos(p.heading) + p.vz * Math.sin(p.heading));
  swing.rotation.z = Math.max(-0.35, Math.min(0.35, -across * 0.03)) + Math.sin(elapsed * 1.7) * 0.02;
  magnet.rotation.y = elapsed * 0.2;
  const charging = u >= M.charge && u < M.on;
  const on = p.active;
  const letting = u >= M.off && u < M.flung;
  const faceMat = (face as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material;
  face.visible = charging || on;
  faceMat.opacity = on ? 0.85 + 0.15 * Math.sin(elapsed * 40) : 0.3 + 0.3 * Math.abs(Math.sin(elapsed * 25));
  arcs.visible = charging || on;
  arcs.children.forEach((a, k) => {
    const ang = k * 0.63 + elapsed * (on ? 9 : 5) + Math.sin(elapsed * 31 + k) * 0.6;
    a.position.set(Math.cos(ang) * 2.5, (k % 3) * 0.4 - 0.4, Math.sin(ang) * 2.5);
    a.scale.setScalar(Math.sin(elapsed * 47 + k * 2.1) > (on ? -0.4 : 0.2) ? 1.6 : 0.01);
  });
  field.visible = on;
  if (on) {
    const pulse = (elapsed * 1.6) % 1;
    const [ring, pool] = field.children as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
    ring.scale.setScalar(1 - pulse * 0.6);
    ring.material.opacity = 0.4 + 0.5 * pulse;
    pool.material.opacity = 0.25 + 0.1 * Math.sin(elapsed * 20);
  }
  burst.visible = letting;
  if (letting) {
    const w = (u - M.off) / (M.flung - M.off);
    burst.children.forEach((sp, k) => {
      const a = k * 2.4;
      const r = 1 + w * 9;
      sp.position.set(Math.cos(a) * r, -w * w * 5 + (k % 4) * 0.4, Math.sin(a) * r);
      sp.scale.setScalar(1.4 * (1 - w) + 0.3);
    });
  }
}
