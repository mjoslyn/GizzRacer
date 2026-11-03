import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { BREATH_DEPTH, BREATH_SINK, BREATH_STAGES, type HazardPose } from '../items/hazards';
import { BREATH_PERIOD } from '../tracks/gaia';
import { nearestOnSpline, pointAt } from '../tracks/spline';
import { inPit, type Ribbon, type Track } from '../tracks/track';
import { glowTexture } from './textures';
import { atmosphere } from './trackDetail';

/**
 * Gaia's world, the All Stars Cup #1's finale: the Earth herself, a
 * colossal goddess lying in the land under a heavy sky, the lap run over
 * and through her body. Its textures (the road of her own skin, soil and
 * pale stones, the meadow, the strata of the cut and the world's edge, a
 * barrier of woven roots, the grey of dead earth), its scenery (oaks,
 * pines and birches, ferns, wildflowers, mossy boulders; by her parasites,
 * pumpjacks nodding, stumps and oil drums; round the dead earth, dead
 * trees and grey stones), its landmarks (her two hands rising out of the
 * ground over the start, cupping the one; her face lying in the land, the
 * eye that sees; the parasites gnawing at her shoulder; the elements
 * round her hair, the wind, a raincloud raining, a shaft of light, a
 * great wave; her heart beating where the roads cross; the grey of the
 * dead earth; the Lucky Rainbow over the gorge) and its hazard's look
 * (her ribs heaving under the road). On the final lap she dies: her eyes
 * close, her heart slows and greys, the light goes out of the elements.
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

/** Dead earth's grey, that everything she was drains to on the final lap. */
const DEAD_HEX = 0x8a8680;
const GOLD_HEX = 0xffd890;

/**
 * The road: the Earth's own skin, warm sienna and ochre soil packed hard,
 * pebbles in it, a root crossing here and there, a darker damp patch; down
 * each edge a border of pale stones set in the soil with grass creeping in
 * over them, so the way reads far ahead against the green. The texture
 * spans half the road, mirrored about its middle (its u across from the
 * middle at 0 to the edge at 1, its v along).
 */
export function earthRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7101);
  const fine = fbm(S, 64, 2, 7102);
  const damp = fbm(S, 4, 3, 7103);
  paint(ctx, S, S, (x, _y, i) => {
    const u = x / S;
    const sienna: RGB = [178, 112, 66];
    const ochre: RGB = [214, 164, 104];
    let c = mix(sienna, ochre, n[i]);
    // Damp patches, darker; the middle of the road worn paler by the wheels.
    if (damp[i] > 0.62) c = mix(c, [132, 86, 56], Math.min(1, (damp[i] - 0.62) * 4));
    c = mix(c, [226, 186, 132], 0.25 * Math.max(0, 0.45 - u) * 2);
    c = shade(c, 0.88 + fine[i] * 0.24);
    // The border of pale stones, grass between them.
    if (u > 0.93) {
      const stone = Math.sin(x * 0.9 + fine[i] * 6) * Math.sin(_y * 0.35 + n[i] * 8) > -0.2;
      return stone ? shade([236, 226, 198], 0.85 + fine[i] * 0.2) : [74, 116, 52];
    }
    if (u > 0.9 && fine[i] > 0.55) return [86, 128, 58];
    return c;
  });
  const rand = seededRandom(7104);
  // Pebbles.
  for (let k = 0; k < 700; k++) {
    const r = 0.4 + rand() * 0.9;
    ctx.fillStyle = rand() < 0.6 ? 'rgba(236,222,196,0.6)' : 'rgba(120,96,80,0.55)';
    ctx.beginPath();
    ctx.arc(rand() * S * 0.88, rand() * S, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Roots crossing the road, worn smooth.
  ctx.strokeStyle = 'rgba(92,58,36,0.55)';
  ctx.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    ctx.lineWidth = 1.5 + rand() * 2;
    const y0 = rand() * S;
    ctx.beginPath();
    ctx.moveTo(S * 0.92, y0);
    ctx.bezierCurveTo(S * 0.65, y0 + (rand() - 0.5) * 60, S * 0.4, y0 + (rand() - 0.5) * 60, S * rand() * 0.4, y0 + (rand() - 0.5) * 40);
    ctx.stroke();
  }
  const t = finish(c);
  // Mirrored about the road's middle, so both edges get the stones.
  t.wrapS = THREE.MirroredRepeatWrapping;
  return t;
}

/** The ground: a meadow, deep greens and clover, moss in the hollows, wildflowers scattered through it, white, yellow, pink and blue. */
export function meadowTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 5, 7111);
  const patch = fbm(S, 4, 3, 7112);
  paint(ctx, S, S, (_x, _y, i) => {
    const deep: RGB = [44, 88, 36];
    const grass: RGB = [78, 128, 48];
    const moss: RGB = [96, 120, 44];
    const base = patch[i] > 0.58 ? mix(grass, moss, Math.min(1, (patch[i] - 0.58) * 5)) : mix(deep, grass, patch[i] / 0.58);
    return shade(base, 0.78 + n[i] * 0.44);
  });
  const rand = seededRandom(7113);
  for (let k = 0; k < 9000; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(130,180,80,0.45)' : 'rgba(24,52,20,0.45)';
    ctx.fillRect(rand() * S, rand() * S, 1.2, 3);
  }
  const petals = ['rgba(255,255,248,0.9)', 'rgba(255,224,80,0.9)', 'rgba(255,140,200,0.85)', 'rgba(140,170,255,0.85)'];
  for (let k = 0; k < 900; k++) {
    ctx.fillStyle = petals[Math.floor(rand() * petals.length)];
    ctx.fillRect(rand() * S, rand() * S, 2, 2);
  }
  return finish(c);
}

/** The cut's walls and the world's edge: her body's strata, dark topsoil over ochre clay, grey rock and a red seam, roots hanging down from the turf. */
export function strataTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7121);
  const bands: RGB[] = [
    [72, 104, 44],
    [66, 46, 32],
    [150, 104, 62],
    [120, 112, 104],
    [168, 82, 52],
    [104, 96, 88],
    [140, 116, 80],
  ];
  paint(ctx, S, S, (_x, y, i) => {
    const v = (y / S + (n[i] - 0.5) * 0.08) * 7;
    const k = Math.max(0, Math.min(bands.length - 1, Math.floor(v)));
    return shade(bands[k], 0.8 + n[i] * 0.4);
  });
  const rand = seededRandom(7122);
  ctx.strokeStyle = 'rgba(60,40,26,0.8)';
  for (let k = 0; k < 40; k++) {
    const x = rand() * S;
    ctx.lineWidth = 1 + rand() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, S / 7);
    ctx.quadraticCurveTo(x + (rand() - 0.5) * 20, S / 7 + 20, x + (rand() - 0.5) * 30, S / 7 + 20 + rand() * 50);
    ctx.stroke();
  }
  for (let k = 0; k < 400; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(220,210,190,0.6)' : 'rgba(30,24,20,0.5)';
    ctx.fillRect(rand() * S, (2 + rand() * 5) * (S / 7), 2, 2);
  }
  return finish(c);
}

/** The barrier: living roots woven along the road, moss on them, and a pale band of peeled root along the top so the edge reads. */
export function rootBarrierTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#3a2618';
  ctx.fillRect(0, 0, W, H);
  const rand = seededRandom(7131);
  ctx.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    ctx.strokeStyle = rand() < 0.5 ? '#7a5434' : '#5a3a22';
    ctx.lineWidth = 3 + rand() * 4;
    const x = rand() * W;
    ctx.beginPath();
    ctx.moveTo(x - 30, H);
    ctx.bezierCurveTo(x - 10, H * 0.6, x + 10, H * 0.4, x + 30, 0);
    ctx.stroke();
  }
  for (let k = 0; k < 160; k++) {
    ctx.fillStyle = rand() < 0.6 ? 'rgba(96,150,60,0.8)' : 'rgba(140,190,80,0.7)';
    ctx.beginPath();
    ctx.arc(rand() * W, H * (0.3 + rand() * 0.7), 1.5 + rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e8d6b0';
  ctx.fillRect(0, 0, W, 9);
  ctx.fillStyle = 'rgba(120,90,60,0.6)';
  for (let x = 0; x < W; x += 14) ctx.fillRect(x, 0, 2, 9);
  return finish(c);
}

/** Dead earth: grey, cracked, ash in the cracks, fading out at its edges (for patches laid on the meadow). */
const deadGroundTexture = once(() => {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7141);
  const edge = fbm(S, 4, 3, 7142);
  paint(
    ctx,
    S,
    S,
    (_x, _y, i) => shade([150, 146, 138], 0.75 + n[i] * 0.4),
    (x, y, i) => {
      const r = Math.hypot(x / S - 0.5, y / S - 0.5) * 2;
      const a = 1 - Math.min(1, Math.max(0, (r - 0.55 - (edge[i] - 0.5) * 0.4) / 0.3));
      return Math.round(255 * a);
    },
  );
  const rand = seededRandom(7143);
  ctx.strokeStyle = 'rgba(40,38,36,0.7)';
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 60; k++) {
    let x = S * (0.15 + rand() * 0.7);
    let y = S * (0.15 + rand() * 0.7);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += (rand() - 0.5) * 30;
      y += (rand() - 0.5) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const t = finish(c, false);
  return t;
});

/** The Earth, seen as an eye sees it: an iris of blue ocean and green land round a black pupil, for her eyes. */
const irisTexture = once(() => {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 4, 7151);
  paint(
    ctx,
    S,
    S,
    (x, y, i) => {
      const r = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
      if (r < 0.34) return [8, 10, 14];
      const land = n[i] > 0.56;
      const base: RGB = land ? mix([60, 140, 60], [170, 150, 90], Math.min(1, (n[i] - 0.56) * 4)) : mix([20, 70, 150], [60, 150, 210], n[i]);
      const rim = Math.max(0, (r - 0.85) / 0.15);
      return mix(base, [10, 30, 40], rim);
    },
    (x, y) => (Math.hypot(x - S / 2, y - S / 2) < S / 2 ? 255 : 0),
  );
  return finish(c, false);
});

const glowTex = once(() => glowTexture());

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

/** A face of words on a sign: cream on a deep green, a gold rule round it. */
const signFace = (() => {
  const made = new Map<string, THREE.CanvasTexture>();
  return (lines: string[], bg = '#1e3a22', fg = '#f4ecc8'): THREE.CanvasTexture => {
    const key = `${lines.join('|')}|${bg}|${fg}`;
    let t = made.get(key);
    if (t) return t;
    const W = 512;
    const H = 256;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#d8b860';
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = lines.length === 1 ? 96 : 66;
    ctx.font = `bold ${size}px Georgia, serif`;
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

/** A sign panel `w` wide (half as high), its face toward -z (whoever's coming) and on its back. */
function signPanel(w: number, map: THREE.Texture, frame: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, w / 2);
  const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map }));
  front.rotation.y = Math.PI;
  front.position.z = -0.14;
  const rear = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map }));
  rear.position.z = 0.14;
  const board = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, w / 2 + 0.4, 0.22), frame);
  g.add(board, front, rear);
  return g;
}

/** A colour that drains to dead grey as she dies on the final lap: the returned function sets it, each frame. */
function dying(material: THREE.MeshLambertMaterial | THREE.MeshPhongMaterial | THREE.MeshBasicMaterial | THREE.SpriteMaterial, keep = 0.15) {
  // The living colour, kept on the material: a shared one may be drained already when another track view is built.
  const alive: THREE.Color = (material.userData.alive ??= material.color.clone());
  const dead = new THREE.Color(DEAD_HEX).lerp(alive, keep);
  return () => material.color.copy(alive).lerp(dead, atmosphere.finalLap);
}

// Shared materials for the scenery.
const bark = once(() => lambert(0x5a3e28, { flatShading: true }));
const birchBark = once(() => lambert(0xe8e4da, { flatShading: true }));
const leafMats = once(() => [0x3e7a2e, 0x5a9a36, 0x2e6428, 0x6aa040].map((c) => lambert(c, { flatShading: true })));
const pineMat = once(() => lambert(0x1e4a2a, { flatShading: true }));
const mossStone = once(() => lambert(0x8a8a7e, { flatShading: true }));
const moss = once(() => lambert(0x5a8a34, { flatShading: true }));
const deadWood = once(() => lambert(0x6a645c, { flatShading: true }));
const greyStone = once(() => lambert(0xa09a90, { flatShading: true }));
const rust = once(() => lambert(0x7a3a20, { flatShading: true }));
const steel = once(() => lambert(0x3a3a40, { flatShading: true }));

/** Which part of her the scenery at a point stands on, by the stretch of the lap it's nearest. */
export type GaiaZone = 'living' | 'hair' | 'parasite' | 'dead';
const ZONES: Record<string, GaiaZone> = {
  'Giant Body Parasite': 'parasite',
  'Gaia Lives While Others Die': 'parasite',
  'I Am the Two': 'hair',
  'I Am the Stream': 'hair',
  'I Am Wind': 'hair',
  'I Am Rain': 'hair',
  'I Am Photon': 'hair',
  'I Am Wave': 'hair',
  'Dirt Is Deceased': 'dead',
  'Gaia Dies': 'dead',
};

/** For Gaia's own lap: the zone a point of scenery stands in. */
export function gaiaZones(track: Track): ((x: number, z: number) => GaiaZone) | undefined {
  if (track.def.id !== 'gaia') return undefined;
  const secs = track.def.main.sections;
  return (x, z) => {
    const hit = nearestOnSpline(track.spline, x, z);
    const b = track.main.toBuilder(hit.s);
    const name = secs.find((q) => b >= q.from && b <= q.to)?.name ?? '';
    return ZONES[name] ?? 'living';
  };
}

/**
 * The scenery: her living land, oaks, pines and birches, ferns, wildflowers
 * and mossy boulders; round her hair, the trees thicker and taller, willows
 * streaming; by her parasites, pumpjacks nodding, felled stumps and oil
 * drums; round the dead earth, dead grey trees and stones. On the final
 * lap the living land drains grey.
 */
export function gaiaFeature(animated: Animated, zones?: (x: number, z: number) => GaiaZone): Feature {
  const leaves = leafMats();
  const fades = [...leaves, pineMat(), moss()].map((m) => dying(m, 0.25));
  animated.push(() => fades.forEach((f) => f()));
  const oak: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 4 + rand() * 4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.75, h, 7), bark());
    trunk.position.y = h / 2;
    t.add(trunk);
    const n = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const r = 2.4 + rand() * 2.2;
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaves[Math.floor(rand() * leaves.length)]);
      blob.position.set((rand() - 0.5) * 4, h + rand() * 2.5, (rand() - 0.5) * 4);
      t.add(blob);
    }
    return place(t, x, z, rand);
  };
  const pine: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 9 + rand() * 9;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, h * 0.3, 6), bark());
    trunk.position.y = h * 0.15;
    t.add(trunk);
    for (let k = 0; k < 3; k++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(h * (0.28 - k * 0.06), h * 0.42, 8), pineMat());
      cone.position.y = h * (0.35 + k * 0.22);
      t.add(cone);
    }
    return place(t, x, z, rand);
  };
  const birch: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const h = 7 + rand() * 5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, h, 6), birchBark());
      trunk.position.set((rand() - 0.5) * 2.4, h / 2, (rand() - 0.5) * 2.4);
      trunk.rotation.z = (rand() - 0.5) * 0.2;
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + rand(), 0), leaves[1]);
      crown.scale.y = 1.6;
      crown.position.set(trunk.position.x, h, trunk.position.z);
      t.add(trunk, crown);
    }
    return place(t, x, z, rand);
  };
  const fernMat = lambert(0x4a8a30, { side: THREE.DoubleSide, flatShading: true });
  fades.push(dying(fernMat, 0.25));
  const fernGeo = new THREE.ConeGeometry(0.5, 3, 4, 1, true).rotateX(Math.PI / 2).translate(0, 0, 1.5).scale(1, 0.15, 1);
  const fern: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 9; k++) {
      const f = new THREE.Mesh(fernGeo, fernMat);
      f.rotation.y = (k / 9) * Math.PI * 2;
      f.rotation.x = -0.5 - rand() * 0.3;
      f.position.y = 0.3;
      t.add(f);
    }
    return place(t, x, z, rand);
  };
  const petalMats = [0xfff8f0, 0xffd84a, 0xff8ac8, 0x8aa8ff, 0xff6a4a].map((c) => lambert(c));
  petalMats.forEach((m) => fades.push(dying(m, 0.2)));
  const flowers: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const mat = petalMats[Math.floor(rand() * petalMats.length)];
    for (let k = 0; k < 14; k++) {
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + rand() * 0.2, 0), mat);
      head.position.set((rand() - 0.5) * 4, 0.6 + rand() * 0.6, (rand() - 0.5) * 4);
      t.add(head);
    }
    return place(t, x, z, rand);
  };
  const boulder: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 1.2 + rand() * 2.5;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mossStone());
    stone.scale.y = 0.7;
    stone.position.y = r * 0.4;
    const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.85, 0), moss());
    cap.scale.set(1, 0.25, 1);
    cap.position.y = r * 0.82;
    t.add(stone, cap);
    return place(t, x, z, rand);
  };
  const willowMat = lambert(0x6a9a3a, { flatShading: true, side: THREE.DoubleSide });
  fades.push(dying(willowMat, 0.25));
  const willow: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 7 + rand() * 4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, h, 7), bark());
    trunk.position.y = h / 2;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(5 + rand() * 2, h * 0.9, 10, 1, true), willowMat);
    crown.position.y = h * 0.62;
    t.add(trunk, crown);
    // Streaming in the wind, like her hair.
    const ph = rand() * 10;
    animated.push((time) => (crown.rotation.z = 0.08 * Math.sin(time * 1.1 + ph)));
    return place(t, x, z, rand);
  };
  // Her parasites.
  const pumpjack: Feature = (x, z, rand) => {
    const t = pumpjackFigure(0.8 + rand() * 0.5, animated, rand() * 10);
    return place(t, x, z, rand);
  };
  const stump: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 0.6 + rand() * 0.6;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.2, 0.8, 8), bark());
    s.position.y = 0.4;
    const top = new THREE.Mesh(new THREE.CircleGeometry(r, 8), lambert(0xd8b88a));
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.81;
    t.add(s, top);
    if (rand() < 0.5) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 6 + rand() * 4, 8), bark());
      log.rotation.z = Math.PI / 2;
      log.position.set(4, r * 0.9, 0);
      t.add(log);
    }
    return place(t, x, z, rand);
  };
  const drums: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 3 + Math.floor(rand() * 4); k++) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 10), rand() < 0.5 ? rust() : steel());
      d.position.set((rand() - 0.5) * 3, 0.6, (rand() - 0.5) * 3);
      if (rand() < 0.3) {
        d.rotation.z = Math.PI / 2;
        d.position.y = 0.5;
      }
      t.add(d);
    }
    const slick = new THREE.Mesh(new THREE.CircleGeometry(2.5 + rand() * 2, 12), new THREE.MeshPhongMaterial({ color: 0x0a0a0c, shininess: 90, specular: 0x6a6a8a }));
    slick.rotation.x = -Math.PI / 2;
    slick.position.y = 0.04;
    t.add(slick);
    return place(t, x, z, rand);
  };
  // The dead.
  const deadTree: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 6 + rand() * 6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.5, h, 6), deadWood());
    trunk.position.y = h / 2;
    trunk.rotation.z = (rand() - 0.5) * 0.25;
    t.add(trunk);
    for (let k = 0; k < 5; k++) {
      const len = 1.5 + rand() * 3;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, len, 5), deadWood());
      const a = rand() * Math.PI * 2;
      br.position.set(Math.cos(a) * len * 0.35, h * (0.5 + rand() * 0.45), Math.sin(a) * len * 0.35);
      br.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      t.add(br);
    }
    return place(t, x, z, rand);
  };
  const greyRock: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 0.8 + rand() * 2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), greyStone());
    stone.scale.y = 0.6;
    stone.position.y = r * 0.3;
    t.add(stone);
    return place(t, x, z, rand);
  };
  const living: [number, Feature][] = [
    [3, oak],
    [2, pine],
    [1.4, birch],
    [1.6, fern],
    [1.8, flowers],
    [1.2, boulder],
  ];
  const hair: [number, Feature][] = [
    [2, oak],
    [3, pine],
    [3, willow],
    [1, fern],
    [1, flowers],
  ];
  const parasite: [number, Feature][] = [
    [2.2, pumpjack],
    [2.5, stump],
    [1.4, drums],
    [0.8, oak],
    [0.6, greyRock],
  ];
  const dead: [number, Feature][] = [
    [3, deadTree],
    [1.6, stump],
    [2, greyRock],
  ];
  const sets: Record<GaiaZone, [number, Feature][]> = { living, hair, parasite, dead };
  return (x, z, rand) => pick(rand, sets[zones ? zones(x, z) : 'living'])(x, z, rand);
}

/** A pumpjack, nodding: its walking beam on an A-frame, the horse's head dipping into her and drawing up, a counterweight turning. */
function pumpjackFigure(size: number, animated: Animated, ph: number): THREE.Group {
  const t = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 9), steel());
  base.position.y = 0.25;
  const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, 5, 4), rust());
  frame.position.y = 2.8;
  const beam = new THREE.Group();
  beam.position.y = 5.2;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 8), rust());
  const head = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.6, 12, 1, false, 0, Math.PI), rust());
  head.rotation.z = Math.PI / 2;
  head.position.z = 4;
  beam.add(bar, head);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 4), steel());
  rod.position.set(0, 2.5, 5.2);
  const crank = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 1.2), steel());
  crank.position.set(0, 1.8, -3.4);
  t.add(base, frame, beam, rod, crank);
  t.scale.setScalar(size);
  animated.push((time) => {
    const a = Math.sin(time * 1.6 + ph);
    beam.rotation.x = 0.22 * a;
    rod.position.y = 2.5 - 0.9 * a;
    crank.rotation.x = time * 1.6 + ph;
  });
  return t;
}

/** How much bigger than a model hand her hands are built, and the start's sign. */
const HAND = 1.2;
const startFace = once(() => signFace(['I AM GAIA']));

/**
 * The one: her two hands rising out of the earth either side of the start,
 * palms to the road, fingers curling over it toward each other, moss on
 * their knuckles and grass on their backs; between the fingertips, high
 * over the line, a seed of light, the one, beating with her breath; I AM
 * GAIA hung under it. On the final lap the seed fades and her hands grey.
 */
export function gaiaHands(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 3;
  const handSkin = lambert(0xa0704a, { flatShading: true });
  const handMoss = lambert(0x5a8a34, { flatShading: true });
  const nailMat = lambert(0xe8dcc0, { flatShading: true });
  const fades = [dying(handSkin, 0.4), dying(handMoss, 0.3)];
  for (const side of [-1, 1]) {
    const hand = new THREE.Group();
    // The wrist out of a mound of earth, the palm leaning in over the road.
    const mound = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), handMoss);
    mound.scale.set(1, 0.45, 1.3);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 6, 10), handSkin);
    wrist.position.y = 2;
    const palm = new THREE.Group();
    palm.position.y = 4.5;
    palm.rotation.z = -0.25;
    const flat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 8, 8.4), handSkin);
    flat.position.y = 4;
    palm.add(flat);
    // Four fingers, each three joints curling over the road; the thumb low on the near side.
    for (let k = 0; k < 4; k++) {
      let joint: THREE.Object3D = palm;
      let y = 8;
      const lens = [5.2 - Math.abs(k - 1.5) * 0.6, 4.4, 3.6];
      lens.forEach((len, j) => {
        const seg = new THREE.Group();
        seg.position.set(0, y, j === 0 ? -3.3 + k * 2.2 : 0);
        seg.rotation.z = -(j === 0 ? 0.3 : 0.62);
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.62 - j * 0.08, 0.72 - j * 0.08, len, 8), handSkin);
        bone.position.y = len / 2;
        const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.82 - j * 0.1, 8, 6), j === 0 ? handMoss : handSkin);
        seg.add(bone, knuckle);
        if (j === 2) {
          // A fingernail of pale stone at the tip.
          const nail = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), nailMat);
          nail.scale.set(0.5, 0.9, 0.9);
          nail.position.set(-0.3, len, 0);
          seg.add(nail);
        }
        joint.add(seg);
        joint = seg;
        y = len;
      });
    }
    const thumb = new THREE.Group();
    thumb.position.set(0, 3, -4.3);
    thumb.rotation.set(-0.8, 0, -0.5);
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, 5, 8), handSkin);
    tb.position.y = 2.5;
    thumb.add(tb);
    palm.add(thumb);
    hand.add(mound, wrist, palm);
    // Built curling toward +x: from the right of the road (-x here) toward its middle; mirrored on the left.
    hand.position.x = side * hw;
    hand.scale.set(-side * HAND, HAND, HAND);
    g.add(hand);
  }
  // The one, between her fingertips.
  const seed = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), new THREE.MeshBasicMaterial({ color: GOLD_HEX }));
  seed.position.y = 21.5;
  const halo = sprite(GOLD_HEX, 16, 0.8);
  halo.position.y = 21.5;
  const sign = signPanel(10, startFace(), handSkin);
  sign.position.y = 14.5;
  const ropes = [-1, 1].map((k) => {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6, 4), lambert(0x3a2a1a));
    r.position.set(k * 4, 18.5, 0);
    return r;
  });
  g.add(seed, halo, sign, ...ropes);
  animated.push((time) => {
    const u = (time / BREATH_PERIOD) % 1;
    const life = 1 - 0.85 * atmosphere.finalLap;
    seed.scale.setScalar(1 + 0.25 * Math.sin(u * Math.PI * 2));
    halo.material.opacity = (0.55 + 0.3 * Math.sin(u * Math.PI * 2)) * life;
    fades.forEach((fn) => fn());
  });
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * Her face, lying in the land round her head, looking up: a low dome of
 * her skin, the brow, cheeks, nose, lips and chin raised out of it, and
 * her eyes, the Earth for irises, that look about and blink: Gaia sees.
 * Her hair streams away from her crown in long swathes of forest. It
 * lies `lateral` off the road at `s`, as far from every road as it can
 * be, its crown toward the road at `s`. On the final lap her eyes close
 * and she greys.
 */
export function gaiaFaceLand(track: Track, ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = offRoad(ribbon, s, lateral);
  // As far from every road as it can be, near there.
  let best = { x: p.x, z: p.z, c: clearance(track, p.x, p.z) };
  for (let dx = -50; dx <= 50; dx += 5) {
    for (let dz = -50; dz <= 50; dz += 5) {
      const c = clearance(track, p.x + dx, p.z + dz);
      if (c > best.c && !track.def.pits.some((q) => inPit({ ...q, halfWidth: q.halfWidth + 10, halfLength: q.halfLength + 10 }, p.x + dx, p.z + dz))) best = { x: p.x + dx, z: p.z + dz, c };
    }
  }
  const R = Math.max(22, Math.min(46, best.c - 6));
  const at = frameAt(ribbon, s);
  // Her crown toward the road at s (out round her hair), her chin away from it.
  const up = Math.atan2(at.x - best.x, at.z - best.z);
  const face = new THREE.Group();
  const faceSkin = lambert(0xc08a62, { flatShading: true });
  const lipMat = lambert(0xa8584a, { flatShading: true });
  const browMat = lambert(0x6a8a3a, { flatShading: true });
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f0e6 });
  const fades = [dying(faceSkin, 0.4), dying(lipMat, 0.3), dying(browMat, 0.3)];
  const blob = (mat: THREE.Material, x: number, z: number, sx: number, sy: number, sz: number, y = 0) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    face.add(m);
    return m;
  };
  // Local frame: +z up the face to her crown, +x across it, y up out of the land.
  blob(faceSkin, 0, 0, R * 0.72, R * 0.14, R);
  blob(browMat, -R * 0.3, R * 0.3, R * 0.24, R * 0.12, R * 0.08, R * 0.05);
  blob(browMat, R * 0.3, R * 0.3, R * 0.24, R * 0.12, R * 0.08, R * 0.05);
  blob(faceSkin, -R * 0.38, -R * 0.15, R * 0.22, R * 0.14, R * 0.2, R * 0.03);
  blob(faceSkin, R * 0.38, -R * 0.15, R * 0.22, R * 0.14, R * 0.2, R * 0.03);
  blob(faceSkin, 0, -R * 0.08, R * 0.09, R * 0.26, R * 0.3, R * 0.02);
  blob(faceSkin, 0, -R * 0.3, R * 0.13, R * 0.18, R * 0.09, R * 0.04);
  blob(lipMat, 0, -R * 0.48, R * 0.2, R * 0.12, R * 0.06, R * 0.06);
  blob(lipMat, 0, -R * 0.58, R * 0.18, R * 0.12, R * 0.06, R * 0.05);
  blob(faceSkin, 0, -R * 0.78, R * 0.2, R * 0.12, R * 0.12, R * 0.02);
  // Her eyes, open to the sky; the lids close over them to blink, and for good at the end.
  const eyes = [-1, 1].map((k) => {
    const eye = new THREE.Group();
    eye.position.set(k * R * 0.3, R * 0.1, R * 0.14);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(R * 0.14, 24, 16), white);
    ball.scale.set(1.25, 0.6, 0.8);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(R * 0.075, 32), new THREE.MeshBasicMaterial({ map: irisTexture(), transparent: true }));
    iris.rotation.x = -Math.PI / 2;
    iris.position.y = R * 0.085;
    const lid = new THREE.Mesh(new THREE.SphereGeometry(R * 0.15, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), faceSkin);
    lid.scale.set(1.28, 0.7, 0.85);
    eye.add(ball, iris, lid);
    face.add(eye);
    return { eye, iris, lid };
  });
  const glint = sprite(0x9ad8ff, R * 0.5, 0.5);
  glint.position.set(0, R * 0.2, R * 0.14);
  face.add(glint);
  // Her hair: long swathes of forest streaming out from her crown, round either side.
  const hairMat = lambert(0x2e5a26, { flatShading: true });
  const hairLight = lambert(0x4a7a2e, { flatShading: true });
  fades.push(dying(hairMat, 0.3), dying(hairLight, 0.3));
  const tuft = new THREE.ConeGeometry(2.4, 7, 6);
  tuft.translate(0, 3.5, 0);
  const rand = seededRandom(7161);
  const hairs: THREE.Matrix4[] = [];
  const hairsLight: THREE.Matrix4[] = [];
  const cos = Math.cos(up);
  const sin = Math.sin(up);
  for (let k = 0; k < 15 && hairs.length + hairsLight.length < 360; k++) {
    const a0 = ((k / 14) - 0.5) * Math.PI * 1.25;
    for (let d = 0; d < 26; d++) {
      const r = R * (0.95 + d * 0.11);
      const a = a0 + Math.sin(d * 0.35 + k) * 0.16 + (a0 > 0 ? 1 : -1) * d * 0.035;
      const lx = Math.sin(a) * r * 0.82;
      const lz = Math.cos(a) * r;
      // Into the world, round the face's frame.
      const wx = best.x + lx * cos + lz * sin;
      const wz = best.z - lx * sin + lz * cos;
      if (clearance(track, wx, wz) < 7 || track.def.pits.some((q) => inPit({ ...q, halfWidth: q.halfWidth + 5, halfLength: q.halfLength + 5 }, wx, wz))) break;
      const sc = 0.7 + rand() * 0.6;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(wx, 0, wz), new THREE.Quaternion(), new THREE.Vector3(sc, sc * (0.8 + rand() * 0.5), sc));
      (rand() < 0.6 ? hairs : hairsLight).push(m);
    }
  }
  for (const [list, mat] of [
    [hairs, hairMat],
    [hairsLight, hairLight],
  ] as const) {
    const inst = new THREE.InstancedMesh(tuft, mat, Math.max(1, list.length));
    list.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.count = list.length;
    g.add(inst);
  }
  face.position.set(best.x, 0, best.z);
  face.rotation.y = up;
  g.add(face);
  let blinkAt = 3;
  animated.push((time) => {
    const shut = atmosphere.finalLap;
    // She blinks now and then; she looks about.
    if (time > blinkAt + 0.3) blinkAt = time + 2.5 + ((time * 7.3) % 4);
    const blink = time > blinkAt && time < blinkAt + 0.3 ? Math.sin(((time - blinkAt) / 0.3) * Math.PI) : 0;
    const closed = Math.max(blink, shut);
    for (const { iris, lid } of eyes) {
      lid.scale.y = 0.05 + 0.75 * closed;
      lid.visible = closed > 0.02;
      iris.position.x = R * 0.03 * Math.sin(time * 0.37);
      iris.position.z = R * 0.025 * Math.sin(time * 0.29 + 1);
    }
    glint.material.opacity = 0.5 * (1 - shut);
    fades.forEach((fn) => fn());
  });
  return g;
}

/**
 * Her parasites, gnawing at her along the road from `s` to `to`: pumpjacks
 * nodding as they draw her up, drill rigs boring into her with a flame at
 * the top, smokestacks smoking, and a pipeline on trestles running beside
 * the road, all of it set back off the road and clear of every other.
 */
export function parasites(track: Track, ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(7171);
  const smoke = new THREE.SpriteMaterial({ map: glowTex(), color: 0x5a5650, transparent: true, depthWrite: false, opacity: 0.5 });
  const flameColor = 0xff9a30;
  let side = 1;
  for (let at = s + 8; at < to; at += 20 + rand() * 10) {
    side = -side;
    const hw = ribbon.halfWidthAtS(at);
    const lat = side * (hw + 14 + rand() * 22);
    const p = offRoad(ribbon, at, lat);
    if (clearance(track, p.x, p.z) < 10) continue;
    const r = rand();
    if (r < 0.45) {
      const t = pumpjackFigure(1.2 + rand() * 0.5, animated, rand() * 10);
      t.position.set(p.x, 0, p.z);
      t.rotation.y = p.heading + (rand() - 0.5);
      g.add(t);
    } else if (r < 0.75) {
      // A drill rig: a lattice derrick, the bit turning into her, a flare on top.
      const t = new THREE.Group();
      const H = 18 + rand() * 8;
      for (const [x, z] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, H, 4), steel());
        leg.position.set(x * 1.8, H / 2, z * 1.8);
        leg.rotation.set(-z * 0.09, 0, x * 0.09);
        t.add(leg);
      }
      for (let y = 3; y < H; y += 4) {
        const ring = new THREE.Mesh(new THREE.BoxGeometry(4.2 - (y / H) * 3, 0.25, 4.2 - (y / H) * 3), rust());
        ring.position.y = y;
        t.add(ring);
      }
      const bit = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4, 6), steel());
      bit.rotation.x = Math.PI;
      bit.position.y = 1;
      const flare = sprite(flameColor, 6, 0.9);
      flare.position.y = H + 1.5;
      t.add(bit, flare);
      const ph = rand() * 10;
      animated.push((time) => {
        bit.rotation.y = time * 6;
        flare.material.opacity = (0.7 + 0.25 * Math.sin(time * 13 + ph)) * (1 - 0.6 * atmosphere.finalLap);
        flare.scale.setScalar(5 + Math.sin(time * 9 + ph));
      });
      t.position.set(p.x, 0, p.z);
      g.add(t);
    } else {
      // A smokestack, smoking.
      const t = new THREE.Group();
      const H = 22 + rand() * 12;
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2, H, 12), lambert(0x8a7a6a));
      stack.position.y = H / 2;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 1.2, 12), lambert(0xa83a2a));
      band.position.y = H - 2;
      t.add(stack, band);
      const puffs = Array.from({ length: 6 }, () => {
        const sp = new THREE.Sprite(smoke);
        t.add(sp);
        return sp;
      });
      const ph = rand() * 10;
      animated.push((time) =>
        puffs.forEach((sp, k) => {
          const u = (time * 0.12 + k / puffs.length + ph) % 1;
          sp.position.set(u * 8, H + u * 22, u * 3);
          sp.scale.setScalar(4 + u * 12);
        }),
      );
      t.position.set(p.x, 0, p.z);
      g.add(t);
    }
  }
  // The pipeline, on trestles beside the road, a little off it.
  for (const side2 of [1]) {
    let prev: THREE.Vector3 | null = null;
    for (let at = s; at <= to; at += 12) {
      const hw = ribbon.halfWidthAtS(at);
      const p = offRoad(ribbon, at, side2 * (hw + 7));
      const ok = clearance(track, p.x, p.z) > 4;
      const here = new THREE.Vector3(p.x, 1.8, p.z);
      if (ok) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.8, 0.3), steel());
        leg.position.set(p.x, 0.9, p.z);
        g.add(leg);
      }
      if (ok && prev) {
        const len = here.distanceTo(prev);
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, len, 10), rust());
        pipe.position.copy(here).add(prev).multiplyScalar(0.5);
        pipe.lookAt(here);
        pipe.rotateX(Math.PI / 2);
        g.add(pipe);
      }
      prev = ok ? here : null;
    }
  }
  return g;
}

/**
 * The elements round her hair, in the order she names them along the road
 * from `s` to `to`: the stream (its water is in the gorge inside the
 * bend), the wind (trees bent over and streaks of it blowing across), the
 * rain (a black cloud over the road, raining on it), the photon (a shaft
 * of sunlight on the crest), the wave (a great green wave curling over
 * the outside of the road as it falls). On the final lap the light and the
 * rain fail.
 */
export function elements(track: Track, ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  // The stretch's own sections.
  const secs = ribbon.def.sections.filter((q) => q.from * ribbon.scale >= s - 10 && q.to * ribbon.scale <= to + 10);
  const span = (name: string) => {
    const parts = secs.filter((q) => q.name === name);
    return parts.length ? { from: parts[0].from * ribbon.scale, to: parts[parts.length - 1].to * ribbon.scale } : { from: s, to: s };
  };
  const rand = seededRandom(7181);
  // Outside the bulge: to the left of the road.
  const outside = (at: number, d: number) => offRoad(ribbon, at, -(ribbon.halfWidthAtS(at) + d));
  // Wind: trees bent over, and streaks of wind blowing across the road.
  const wind = span('I Am Wind');
  const leaves = lambert(0x5a9a36, { flatShading: true });
  const fadeLeaves = dying(leaves, 0.25);
  for (let at = wind.from; at < wind.to; at += 9) {
    const p = outside(at, 8 + rand() * 10);
    if (clearance(track, p.x, p.z) < 5) continue;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 8, 6), bark());
    trunk.position.y = 4;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), leaves);
    crown.scale.set(1.6, 0.8, 1);
    crown.position.set(1.6, 7.6, 0);
    t.add(trunk, crown);
    t.position.set(p.x, 0, p.z);
    t.rotation.y = p.heading + Math.PI / 2;
    const ph = rand() * 10;
    animated.push((time) => (t.rotation.z = -0.35 - 0.08 * Math.sin(time * 2.3 + ph)));
    g.add(t);
  }
  const streakMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  const streaks = Array.from({ length: 14 }, (_, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.25), streakMat);
    g.add(m);
    return { m, k, at: wind.from + rand() * (wind.to - wind.from), y: 2 + rand() * 7 };
  });
  // Rain: a black cloud over the road, raining.
  const rain = span('I Am Rain');
  const mid = (rain.from + rain.to) / 2;
  const rf = frameAt(ribbon, mid);
  const cloud = new THREE.Group();
  const cloudMat = lambert(0x4a5058, { flatShading: true });
  for (let k = 0; k < 12; k++) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(7 + rand() * 6, 1), cloudMat);
    puff.position.set((rand() - 0.5) * 50, (rand() - 0.5) * 5, (rand() - 0.5) * 30);
    puff.scale.y = 0.55;
    cloud.add(puff);
  }
  cloud.position.set(rf.x, rf.y + 34, rf.z);
  cloud.rotation.y = rf.heading;
  g.add(cloud);
  const DROPS = 900;
  const dropPos = new Float32Array(DROPS * 6);
  const dropSeed = Array.from({ length: DROPS }, () => [(rand() - 0.5) * 60, (rand() - 0.5) * 36, rand()]);
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const dropMat = new THREE.LineBasicMaterial({ color: 0xc8d8ff, transparent: true, opacity: 0.55 });
  const drops = new THREE.LineSegments(dropGeo, dropMat);
  drops.position.copy(cloud.position);
  drops.rotation.y = rf.heading;
  drops.frustumCulled = false;
  g.add(drops);
  // Photon: a shaft of sunlight onto the crest, and motes of light in it.
  const photon = span('I Am Photon');
  const pf = frameAt(ribbon, (photon.from + photon.to) / 2);
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(6, 15, 120, 24, 1, true), shaftMat);
  shaft.position.set(pf.x, pf.y + 60, pf.z);
  shaft.rotation.z = 0.12;
  const sun = sprite(0xfff4c0, 60, 0.6, false);
  sun.position.set(pf.x + 14, pf.y + 120, pf.z);
  g.add(shaft, sun);
  // Wave: a great green wave curling over the outside of the road as it falls.
  const wave = span('I Am Wave');
  const wf = frameAt(ribbon, (wave.from + wave.to) / 2);
  const wo = outside((wave.from + wave.to) / 2, 16);
  const waveMat = new THREE.MeshPhongMaterial({ color: 0x1a8a8a, emissive: 0x0a3a40, shininess: 80, specular: 0xbffff8, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const fadeWave = dying(waveMat, 0.3);
  const curl = new THREE.Group();
  // Its cross-section: rising from the land behind, cresting, and its lip curling over toward the road (-x).
  const profile = new THREE.Shape();
  profile.moveTo(34, 0);
  profile.quadraticCurveTo(24, 2, 17, 10);
  profile.quadraticCurveTo(12, 19, 3, 21);
  profile.quadraticCurveTo(-5, 21, -7, 13);
  profile.quadraticCurveTo(-3, 15, 1, 13.5);
  profile.quadraticCurveTo(8, 10, 9, 0);
  profile.lineTo(34, 0);
  const LONG = 44;
  const bodyGeo = new THREE.ExtrudeGeometry(profile, { depth: LONG, bevelEnabled: false, curveSegments: 10 });
  bodyGeo.translate(0, 0, -LONG / 2);
  const body = new THREE.Mesh(bodyGeo, waveMat);
  const foam = Array.from({ length: 14 }, (_, k) => {
    const f = sprite(0xffffff, 4 + (k % 3), 0.7);
    curl.add(f);
    return f;
  });
  curl.add(body);
  curl.position.set(wo.x, 0, wo.z);
  // Along the road on its outside (local +x is the road's left), the lip over toward it.
  curl.rotation.y = wf.heading;
  g.add(curl);
  animated.push((time) => {
    const life = 1 - atmosphere.finalLap;
    for (const st of streaks) {
      const u = (time * 0.45 + st.k / streaks.length) % 1;
      const at = st.at;
      const hw = ribbon.halfWidthAtS(at);
      const p = offRoad(ribbon, at, (u - 0.5) * 2 * (hw + 12));
      st.m.position.set(p.x, ribbon.heightAt(at) + st.y, p.z);
      st.m.rotation.y = p.heading + Math.PI / 2;
      streakMat.opacity = 0.3 * Math.sin(u * Math.PI);
    }
    for (let k = 0; k < DROPS; k++) {
      const [x, z, ph] = dropSeed[k];
      const u = (time * 1.4 + ph) % 1;
      const y = -u * 34;
      dropPos.set([x, y, z, x - 0.3, y - 2.2, z], k * 6);
    }
    dropGeo.attributes.position.needsUpdate = true;
    dropMat.opacity = 0.55 * life;
    shaftMat.opacity = (0.1 + 0.03 * Math.sin(time * 0.8)) * life;
    sun.material.opacity = 0.6 * life;
    foam.forEach((f, k) => {
      // Spray along the lip.
      f.position.set(-4 + Math.sin(time * 2 + k) * 1.5, 18 + Math.sin(time * 3 + k * 1.7) * 1.5, (k / (foam.length - 1) - 0.5) * LONG);
      f.material.opacity = 0.7 * (0.6 + 0.4 * Math.sin(time * 3 + k));
    });
    curl.position.y = 0.6 * Math.sin(time * 0.9);
    fadeLeaves();
    fadeWave();
  });
  return g;
}

/**
 * Her heart, where the roads cross: off to the side between them, half
 * sunk in the land, a great ember of red and gold beating (a heartbeat's
 * two beats to each of her breaths), glowing veins running out from it
 * under the meadow. On the final lap it slows, and goes grey.
 */
export function gaiaHeart(track: Track, ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const a = frameAt(ribbon, s);
  const b = frameAt(ribbon, to);
  // Between I Am Gaia's way on and her chest's way back: her chest, toward her head.
  let dx = a.tx - b.tx;
  let dz = a.tz - b.tz;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  let dist = 36;
  while (dist < 90 && clearance(track, a.x + dx * dist, a.z + dz * dist) < 14) dist += 4;
  const x = a.x + dx * dist;
  const z = a.z + dz * dist;
  const heartMat = new THREE.MeshPhongMaterial({ color: 0xc8202a, emissive: 0xa01010, emissiveIntensity: 0.8, shininess: 60 });
  const heart = new THREE.Group();
  const lobes = [-1, 1].map((k) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(4, 18, 14), heartMat);
    m.position.set(k * 3, 7, 0);
    return m;
  });
  const point = new THREE.Mesh(new THREE.ConeGeometry(5.6, 8, 18), heartMat);
  point.rotation.z = Math.PI;
  point.position.y = 2.4;
  heart.add(...lobes, point);
  heart.rotation.z = 0.25;
  const glow = sprite(0xff5030, 40, 0.6);
  glow.position.y = 6;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0x6a4a30, { flatShading: true }));
  earth.scale.y = 0.3;
  const veinMat = new THREE.MeshBasicMaterial({ color: 0xff6040, transparent: true, opacity: 0.8 });
  const rand = seededRandom(7191);
  for (let k = 0; k < 9; k++) {
    const ang = (k / 9) * Math.PI * 2 + rand() * 0.4;
    const len = 18 + rand() * 24;
    let px = 0;
    let pz = 0;
    for (let j = 0; j < 4; j++) {
      const l = len / 4;
      const aj = ang + (rand() - 0.5) * 0.7;
      const nx = px + Math.sin(aj) * l;
      const nz = pz + Math.cos(aj) * l;
      if (clearance(track, x + nx, z + nz) < 3) break;
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, l), veinMat);
      v.position.set((px + nx) / 2, 0.08, (pz + nz) / 2);
      v.rotation.y = Math.atan2(nx - px, nz - pz);
      g.add(v);
      px = nx;
      pz = nz;
    }
  }
  g.add(earth, heart, glow);
  const alive = new THREE.Color(0xc8202a);
  const dead = new THREE.Color(DEAD_HEX);
  let beat = 0;
  let last = 0;
  animated.push((time) => {
    const dying = atmosphere.finalLap;
    // Two beats to a breath, slowing to almost nothing at the end.
    beat += (time - last) * (2 / BREATH_PERIOD) * (1 - 0.7 * dying);
    last = time;
    const u = beat % 1;
    const pulse = Math.exp(-((u - 0.1) ** 2) / 0.003) + 0.6 * Math.exp(-((u - 0.3) ** 2) / 0.003);
    heart.scale.setScalar(1 + 0.12 * pulse * (1 - dying));
    heartMat.color.copy(alive).lerp(dead, dying);
    heartMat.emissiveIntensity = (0.4 + 0.6 * pulse) * (1 - 0.9 * dying);
    glow.material.opacity = (0.35 + 0.4 * pulse) * (1 - dying);
    veinMat.opacity = (0.4 + 0.5 * pulse) * (1 - 0.9 * dying);
  });
  g.position.set(x, 0, z);
  return g;
}

/**
 * Dead earth along the road from `s` to `to`: the meadow gone grey and
 * cracked either side, dead trees standing in it, grey stones, and ash
 * blowing; nobody sees.
 */
export function deadEarth(track: Track, ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(7201);
  const patchMat = new THREE.MeshLambertMaterial({ map: deadGroundTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const geo = new THREE.PlaneGeometry(1, 1);
  const L = ribbon.spline.length;
  const len = (((to - s) % L) + L) % L;
  for (let d = 0; d < len; d += 9) {
    const at = (s + d) % L;
    const hw = ribbon.halfWidthAtS(at);
    for (const side of [-1, 1]) {
      const r = 10 + rand() * 10;
      const p = offRoad(ribbon, at, side * (hw + 4 + r * 0.8 + rand() * 20));
      if (clearance(track, p.x, p.z) < r * 0.6) continue;
      const m = new THREE.Mesh(geo, patchMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = rand() * Math.PI * 2;
      m.scale.set(2 * r, 2 * r, 1);
      m.position.set(p.x, 0.05 + rand() * 0.02, p.z);
      g.add(m);
    }
  }
  // Ash blowing across the dead earth.
  const ash = new THREE.SpriteMaterial({ map: glowTex(), color: 0xb8b0a8, transparent: true, depthWrite: false, opacity: 0.35 });
  const flakes = Array.from({ length: 40 }, () => {
    const f = new THREE.Sprite(ash);
    f.scale.setScalar(1.2 + rand() * 1.5);
    g.add(f);
    return { f, at: s + rand() * len, lat: (rand() - 0.5) * 80, ph: rand() };
  });
  animated.push((time) =>
    flakes.forEach((k) => {
      const u = (time * 0.08 + k.ph) % 1;
      const p = offRoad(ribbon, k.at % L, k.lat + (u - 0.5) * 40);
      k.f.position.set(p.x, 1 + 6 * Math.sin(u * Math.PI), p.z);
    }),
  );
  return g;
}

/** The Lucky Rainbow's sign. */
const rainbowFace = once(() => signFace(['LUCKY', 'RAINBOW'], '#2a2a5a', '#fff8e0'));

/**
 * The Lucky Rainbow: the light through the rain, a rainbow in the sky over
 * the gorge, arching the same way as its road, and a sign at the gorge's
 * near edge; the road itself is the rainbow. On the final lap its colours
 * fade (the road stays).
 */
export function luckyRainbow(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const bands = [0xff3a3a, 0xff9a2a, 0xffe83a, 0x4ad84a, 0x3a8aff, 0x5a4ae8, 0xb04ae8];
  const mats = bands.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const R = 60;
  const CUT = 0.42;
  bands.forEach((_, k) => {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(R - k * 2.2, 1.1, 6, 64, Math.PI - 2 * CUT), mats[k]);
    // In the vertical plane along the road, centred on the gorge, its feet fading out high in the air over the gorge's ends.
    arc.rotation.set(0, Math.PI / 2, CUT);
    arc.position.y = -6;
    g.add(arc);
  });
  const sign = signPanel(7, rainbowFace(), lambert(0xf4f0e8));
  const start = offRoad(ribbon, Math.max(0, s - 52), ribbon.halfWidthAtS(s) + 3);
  sign.position.set(start.x, 4, start.z);
  sign.rotation.y = start.heading;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), lambert(0xf4f0e8));
  post.position.set(start.x, 1.6, start.z);
  animated.push(() => mats.forEach((m) => (m.opacity = 0.32 * (1 - 0.8 * atmosphere.finalLap))));
  g.position.set(f.x, 0, f.z);
  g.rotation.y = f.heading;
  const out = new THREE.Group();
  out.add(g, sign, post);
  return out;
}

/** Ribs heaving: how far past each edge of the road a rib runs on under the land. */
const RIB_REACH = 7;
const DUST = 10;

/**
 * One of Gaia's ribs, the hazard's look: a ridge of her skin across the
 * road and on under the land either side, swelling as she breathes in, its
 * cracks glowing gold as she starts to; as she breathes out it sinks right
 * down through the road into a dark trough, her breath blowing dust up out
 * of the cracks.
 */
export function breathParts(obj: THREE.Object3D): THREE.Object3D[] {
  const ridgeMat = new THREE.MeshLambertMaterial({ color: 0x5a9a36, emissive: 0xffc860, emissiveIntensity: 0, flatShading: true });
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 18, 1, false, 0, Math.PI), ridgeMat);
  // Lying across the road (local x), its round top up.
  ridge.rotation.set(0, 0, Math.PI / 2);
  const ridgeHolder = new THREE.Group();
  ridgeHolder.add(ridge);
  // Her rib's crest, pale as bone through the turf.
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(1.03, 1.03, 1, 18, 1, false, Math.PI * 0.42, Math.PI * 0.16), new THREE.MeshLambertMaterial({ color: 0xf0e4c4, flatShading: true }));
  grass.rotation.set(0, 0, Math.PI / 2);
  ridgeHolder.add(grass);
  const cracks = new THREE.Mesh(new THREE.PlaneGeometry(1, 2 * BREATH_DEPTH), new THREE.MeshBasicMaterial({ color: GOLD_HEX, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  cracks.rotation.x = -Math.PI / 2;
  cracks.position.y = 0.1;
  const trough = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0x1a120c, transparent: true, opacity: 0, depthWrite: false }));
  trough.rotation.x = -Math.PI / 2;
  trough.position.y = 0.09;
  const dust = new THREE.Group();
  for (let k = 0; k < DUST; k++) dust.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xc8a878, transparent: true, depthWrite: false, opacity: 0 })));
  obj.add(ridgeHolder, cracks, trough, dust);
  return [ridgeHolder, cracks, trough, dust];
}

/** Poses a rib (from breathParts): as high as her breath has it, or sunk to a trough with dust blowing out. */
export function poseBreath(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [ridgeHolder, cracks, trough, dust] = parts;
  obj.rotation.y = p.heading;
  const B = BREATH_STAGES;
  const w = 2 * (p.radius + RIB_REACH);
  const lift = p.gap;
  const ridge = ridgeHolder.children[0] as THREE.Mesh;
  const ridgeMat = ridge.material as THREE.MeshLambertMaterial;
  ridgeHolder.visible = lift > 0.04;
  // The ridge: half a cylinder across the road, its height the breath's.
  ridgeHolder.scale.set(w, Math.max(0.05, lift), BREATH_DEPTH);
  // Gold in the cracks: from just before she breathes in, while she does.
  const warming = p.phase > B.inhale - 0.12 && p.phase < B.full;
  const glow = warming ? Math.sin(((p.phase - (B.inhale - 0.12)) / (B.full - B.inhale + 0.12)) * Math.PI) : 0;
  ridgeMat.emissiveIntensity = 0.6 * glow;
  const crackMat = (cracks as THREE.Mesh).material as THREE.MeshBasicMaterial;
  cracks.scale.x = w;
  crackMat.opacity = 0.45 * glow * (0.7 + 0.3 * Math.sin(elapsed * 14));
  // The trough as she breathes out, and her breath blowing dust out of it.
  const sink = Math.max(0, -lift) / BREATH_SINK;
  const out = p.phase >= B.exhale && p.phase < B.empty ? (p.phase - B.exhale) / (B.empty - B.exhale) : p.phase >= B.empty ? 1 : 0;
  trough.scale.set(w / 2, BREATH_DEPTH * 1.4, 1);
  ((trough as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.55 * sink;
  dust.children.forEach((d, k) => {
    const v = (elapsed * 0.9 + k / DUST) % 1;
    d.position.set(((k / (DUST - 1)) - 0.5) * w * 0.9, 0.5 + v * 4 * (0.5 + out), (Math.sin(k * 2.1) * BREATH_DEPTH) / 2);
    d.scale.setScalar(2 + v * 4);
    ((d as THREE.Sprite).material as THREE.SpriteMaterial).opacity = p.active || (p.phase >= B.empty && sink > 0.2) ? 0.5 * Math.sin(v * Math.PI) * Math.max(sink, 0.3) : 0;
  });
}
