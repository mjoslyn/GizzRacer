import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { BREATH_DEPTH, BREATH_SINK, BREATH_STAGES, type HazardPose } from '../items/hazards';
import { BREATH_PERIOD } from '../tracks/gaia';
import { nearestOnSpline, pointAt } from '../tracks/spline';
import { inPit, type Ribbon, type Track } from '../tracks/track';
import { glowTexture } from './textures';
import { atmosphere } from './trackDetail';

/**
 * Gaia's world, the All Stars Cup #1's finale: the Earth herself, ancient,
 * vast and indifferent, a colossal goddess lying in a blighted land under
 * a storm-dark sky, the lap run over and through her body; humanity a
 * giant body parasite on her. Its textures (the road of her own skin,
 * rust soil and bone-pale stones, the blighted ground with her blood dull
 * red in its cracks, the strata of the cut and the world's edge, a barrier
 * of dead roots and thorns, the grey of dead earth), its scenery (bare
 * black trees twisted and clawing, thorns, ragged pines, standing stones,
 * great ribcages and skulls, ash; round her hair, black willows streaming;
 * by her parasites, pumpjacks nodding, stumps and oil drums bleeding oil;
 * round the dead earth, grey dead trees and stones), its landmarks (her
 * two black hands rising out of the ground over the start, clawed fingers
 * flexing over the road round an ember, the one; her face lying in the
 * land with vast eyes that follow you, and the sun eclipsed over it; the
 * parasites, rigs like ticks gorging, smokestacks belching; the elements
 * as threats, the wind tearing, a downpour and lightning, a cold harsh
 * shaft of light, a black tidal wall; her dark heart pulsing slow where
 * the roads cross, her veins glowing dull red out across the land; the
 * grey of the dead earth; the Lucky Rainbow sickly and guttering over the
 * gorge) and its hazard's look (her ribs of black rock heaving under the
 * road). On the final lap she dies: her eyes close, her heart slows and
 * stops, her veins go dark and the light goes out of the elements.
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
const DEAD_HEX = 0x6a6660;
/** Her blood: the dull red of her veins, her heart, the glow in her cracks. */
const BLOOD_HEX = 0xb0281a;
const EMBER_HEX = 0xff5a28;

/**
 * The road: the Earth's own skin, sienna and rust soil packed hard and dry,
 * pebbles and bone-white grit in it, a dead root crossing here and there,
 * a darker stain where something soaked into it; down each edge a border
 * of pale stones like old bone set in the soil, so the way reads far ahead
 * against the dark land. The texture spans half the road, mirrored about
 * its middle (its u across from the middle at 0 to the edge at 1, its v
 * along).
 */
export function earthRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7101);
  const fine = fbm(S, 64, 2, 7102);
  const damp = fbm(S, 4, 3, 7103);
  paint(ctx, S, S, (x, _y, i) => {
    const u = x / S;
    const rust: RGB = [176, 104, 62];
    const ochre: RGB = [208, 156, 100];
    let c = mix(rust, ochre, n[i]);
    // Stains, darker and redder; the middle of the road worn paler by the wheels.
    if (damp[i] > 0.62) c = mix(c, [120, 60, 42], Math.min(1, (damp[i] - 0.62) * 4));
    c = mix(c, [224, 186, 140], 0.25 * Math.max(0, 0.45 - u) * 2);
    c = shade(c, 0.88 + fine[i] * 0.24);
    // The border of pale stones, like old bone, dead grass between them.
    if (u > 0.93) {
      const stone = Math.sin(x * 0.9 + fine[i] * 6) * Math.sin(_y * 0.35 + n[i] * 8) > -0.2;
      return stone ? shade([238, 228, 204], 0.85 + fine[i] * 0.2) : [62, 58, 44];
    }
    if (u > 0.9 && fine[i] > 0.55) return [70, 64, 48];
    return c;
  });
  const rand = seededRandom(7104);
  // Grit.
  for (let k = 0; k < 700; k++) {
    const r = 0.4 + rand() * 0.9;
    ctx.fillStyle = rand() < 0.6 ? 'rgba(236,226,206,0.55)' : 'rgba(70,46,36,0.55)';
    ctx.beginPath();
    ctx.arc(rand() * S * 0.88, rand() * S, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Dead roots crossing the road, worn smooth.
  ctx.strokeStyle = 'rgba(64,38,26,0.6)';
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

/**
 * The ground: blighted land, black soil and ash, dead grass grey-olive
 * and straw-brown, a sickly green left only in the hollows, and through
 * it all cracks with her blood showing dull red in them.
 */
export function blightTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 5, 7111);
  const patch = fbm(S, 4, 3, 7112);
  paint(ctx, S, S, (_x, _y, i) => {
    const soil: RGB = [30, 28, 24];
    const dead: RGB = [62, 60, 44];
    const sick: RGB = [44, 60, 36];
    const base = patch[i] > 0.6 ? mix(dead, sick, Math.min(1, (patch[i] - 0.6) * 4)) : mix(soil, dead, patch[i] / 0.6);
    return shade(base, 0.72 + n[i] * 0.5);
  });
  const rand = seededRandom(7113);
  for (let k = 0; k < 8000; k++) {
    const r = rand();
    ctx.fillStyle = r < 0.4 ? 'rgba(110,100,70,0.45)' : r < 0.75 ? 'rgba(12,12,10,0.5)' : 'rgba(130,126,118,0.35)';
    ctx.fillRect(rand() * S, rand() * S, 1.2, r < 0.4 ? 3 : 1.5);
  }
  // Cracks, her blood dull in them.
  ctx.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    let x = rand() * S;
    let y = rand() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 7; j++) {
      x += (rand() - 0.5) * 50;
      y += (rand() - 0.5) * 50;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(10,8,6,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(150,34,20,0.75)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  return finish(c);
}

/** The cut's walls and the world's edge: her body's strata, dead topsoil over rust clay, black rock and a seam of blood red, dead roots hanging down from the top, bones in it. */
export function strataTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7121);
  const bands: RGB[] = [
    [52, 50, 38],
    [38, 30, 24],
    [120, 76, 48],
    [58, 56, 54],
    [128, 40, 28],
    [44, 42, 40],
    [96, 74, 54],
  ];
  paint(ctx, S, S, (_x, y, i) => {
    const v = (y / S + (n[i] - 0.5) * 0.08) * 7;
    const k = Math.max(0, Math.min(bands.length - 1, Math.floor(v)));
    return shade(bands[k], 0.8 + n[i] * 0.4);
  });
  const rand = seededRandom(7122);
  ctx.strokeStyle = 'rgba(20,14,10,0.85)';
  for (let k = 0; k < 40; k++) {
    const x = rand() * S;
    ctx.lineWidth = 1 + rand() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, S / 7);
    ctx.quadraticCurveTo(x + (rand() - 0.5) * 20, S / 7 + 20, x + (rand() - 0.5) * 30, S / 7 + 20 + rand() * 50);
    ctx.stroke();
  }
  for (let k = 0; k < 400; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(220,210,190,0.6)' : 'rgba(10,8,8,0.5)';
    ctx.fillRect(rand() * S, (2 + rand() * 5) * (S / 7), rand() < 0.1 ? 6 : 2, 2);
  }
  return finish(c);
}

/** The barrier: dead roots and thorns woven along the road, black and grey, and a pale band of peeled root along the top, bone-white, so the edge reads. */
export function rootBarrierTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#1a1410';
  ctx.fillRect(0, 0, W, H);
  const rand = seededRandom(7131);
  ctx.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    ctx.strokeStyle = rand() < 0.5 ? '#4a3a2c' : '#2e241c';
    ctx.lineWidth = 3 + rand() * 4;
    const x = rand() * W;
    ctx.beginPath();
    ctx.moveTo(x - 30, H);
    ctx.bezierCurveTo(x - 10, H * 0.6, x + 10, H * 0.4, x + 30, 0);
    ctx.stroke();
  }
  // Thorns.
  ctx.fillStyle = '#6a5a48';
  for (let k = 0; k < 120; k++) {
    const x = rand() * W;
    const y = H * (0.25 + rand() * 0.7);
    const d = rand() < 0.5 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 1.5);
    ctx.lineTo(x + d * 6, y - 3);
    ctx.lineTo(x, y + 1.5);
    ctx.fill();
  }
  ctx.fillStyle = '#e4d8bc';
  ctx.fillRect(0, 0, W, 9);
  ctx.fillStyle = 'rgba(80,60,44,0.6)';
  for (let x = 0; x < W; x += 14) ctx.fillRect(x, 0, 2, 9);
  return finish(c);
}

/** Dead earth: grey, cracked, ash in the cracks, fading out at its edges (for patches laid on the land). */
const deadGroundTexture = once(() => {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7141);
  const edge = fbm(S, 4, 3, 7142);
  paint(
    ctx,
    S,
    S,
    (_x, _y, i) => shade([120, 116, 110], 0.75 + n[i] * 0.4),
    (x, y, i) => {
      const r = Math.hypot(x / S - 0.5, y / S - 0.5) * 2;
      const a = 1 - Math.min(1, Math.max(0, (r - 0.55 - (edge[i] - 0.5) * 0.4) / 0.3));
      return Math.round(255 * a);
    },
  );
  const rand = seededRandom(7143);
  ctx.strokeStyle = 'rgba(20,18,16,0.75)';
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

/** Her eye: an iris of the dark Earth, black seas and dead brown land, burning to a ring of dull fire round a pupil like a pit. */
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
      if (r < 0.3) return [0, 0, 0];
      const fire = Math.max(0, 1 - (r - 0.3) / 0.25);
      const land = n[i] > 0.55;
      const base: RGB = land ? mix([70, 54, 30], [130, 90, 40], Math.min(1, (n[i] - 0.55) * 4)) : mix([10, 24, 22], [26, 52, 44], n[i]);
      const rim = Math.max(0, (r - 0.86) / 0.14);
      return mix(mix(base, [230, 110, 30], fire * 0.85), [6, 6, 6], rim);
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
const bark = once(() => lambert(0x2a221c, { flatShading: true }));
const blackWood = once(() => lambert(0x16120f, { flatShading: true }));
const deadLeaf = once(() => [0x2a3424, 0x3a3a26, 0x22281e].map((c) => lambert(c, { flatShading: true })));
const pineMat = once(() => lambert(0x141e18, { flatShading: true }));
const stoneMat = once(() => lambert(0x5a5852, { flatShading: true }));
const lichen = once(() => lambert(0x4a5038, { flatShading: true }));
const deadWood = once(() => lambert(0x4a4640, { flatShading: true }));
const greyStone = once(() => lambert(0x7a766e, { flatShading: true }));
const boneMat = once(() => lambert(0xd8ccb0, { flatShading: true }));
const rust = once(() => lambert(0x5a2a18, { flatShading: true }));
const steel = once(() => lambert(0x26262a, { flatShading: true }));
const oilMat = once(() => new THREE.MeshPhongMaterial({ color: 0x050506, shininess: 110, specular: 0x6a5a7a }));

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

/** A bare, twisted tree: a black trunk leaning and turning, its branches clawing at the sky. */
function twistedTree(h: number, rand: () => number, wood: THREE.Material): THREE.Group {
  const t = new THREE.Group();
  let joint: THREE.Object3D = t;
  let len = h * 0.4;
  for (let k = 0; k < 3; k++) {
    const seg = new THREE.Group();
    seg.position.y = k ? len : 0;
    seg.rotation.set((rand() - 0.5) * 0.6, rand() * 2, (rand() - 0.5) * 0.6);
    const r = 0.5 - k * 0.14;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, len, 6), wood);
    m.position.y = len / 2;
    seg.add(m);
    for (let j = 0; j < 2 + k; j++) {
      const bl = 1.5 + rand() * 2.5;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.14, bl, 4), wood);
      const a = rand() * Math.PI * 2;
      br.position.set(Math.cos(a) * bl * 0.4, len * (0.5 + rand() * 0.5), Math.sin(a) * bl * 0.4);
      br.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      seg.add(br);
    }
    joint.add(seg);
    joint = seg;
    len *= 0.75;
  }
  return t;
}

/** A skull, roughly: a cranium and a jaw, two dark sockets. */
function skullFigure(size: number): THREE.Group {
  const t = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), boneMat());
  head.scale.set(1, 0.85, 1.15);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(size * 1.1, size * 0.5, size * 0.8), boneMat());
  jaw.position.set(0, -size * 0.6, size * 0.45);
  t.add(head, jaw);
  for (const k of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(size * 0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0x050403 }));
    socket.position.set(k * size * 0.38, 0, size * 1.0);
    t.add(socket);
  }
  return t;
}

/**
 * The scenery: her blighted land, bare black trees twisted and clawing,
 * thorn thickets, a few dark pines, standing stones with lichen on them,
 * bones; round her hair, the dead trees thicker, willows hanging black
 * and streaming; by her parasites, pumpjacks nodding, felled stumps, oil
 * drums and oil bleeding into the ground; round the dead earth, grey dead
 * trees, ash and stones. On the final lap even that drains grey.
 */
export function gaiaFeature(animated: Animated, zones?: (x: number, z: number) => GaiaZone): Feature {
  const leaves = deadLeaf();
  const fades = [...leaves, pineMat(), lichen()].map((m) => dying(m, 0.3));
  animated.push(() => fades.forEach((f) => f()));
  const twisted: Feature = (x, z, rand) => place(twistedTree(7 + rand() * 9, rand, rand() < 0.7 ? blackWood() : bark()), x, z, rand);
  const pine: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 10 + rand() * 10;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, h * 0.35, 6), blackWood());
    trunk.position.y = h * 0.17;
    t.add(trunk);
    // Ragged: some tiers missing, the top broken.
    for (let k = 0; k < 3; k++) {
      if (rand() < 0.3) continue;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(h * (0.26 - k * 0.06), h * 0.4, 6), pineMat());
      cone.position.y = h * (0.38 + k * 0.2);
      cone.rotation.z = (rand() - 0.5) * 0.2;
      t.add(cone);
    }
    return place(t, x, z, rand);
  };
  const thornMat = lambert(0x241c16, { flatShading: true });
  const thorns: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 16; k++) {
      const len = 1.5 + rand() * 2.5;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, len, 4), thornMat);
      sp.position.set((rand() - 0.5) * 3, len * 0.35, (rand() - 0.5) * 3);
      sp.rotation.set((rand() - 0.5) * 1.6, 0, (rand() - 0.5) * 1.6);
      t.add(sp);
    }
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), leaves[2]);
    bush.scale.set(1.3, 0.6, 1.3);
    bush.position.y = 0.6;
    t.add(bush);
    return place(t, x, z, rand);
  };
  const standing: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = rand() < 0.4 ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const h = 4 + rand() * 5;
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.4 + rand(), h, 0.9 + rand() * 0.5), stoneMat());
      st.position.set(k * 3.2 - (n - 1) * 1.6, h / 2 - 0.3, (rand() - 0.5) * 1.5);
      st.rotation.set((rand() - 0.5) * 0.15, rand(), (rand() - 0.5) * 0.15);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 1.0), lichen());
      cap.position.y = h / 2;
      st.add(cap);
      t.add(st);
    }
    return place(t, x, z, rand);
  };
  const bones: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    // A great ribcage half sunk in the ground, and its skull.
    const R = 2 + rand() * 2.5;
    for (let k = 0; k < 6; k++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(R, 0.14 * R * 0.5, 5, 12, Math.PI), boneMat());
      rib.position.set(0, 0, (k - 2.5) * R * 0.35);
      rib.scale.set(1, 0.9 - Math.abs(k - 2.5) * 0.08, 1);
      t.add(rib);
    }
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * R, 0.12 * R, R * 2.4, 6), boneMat());
    spine.rotation.x = Math.PI / 2;
    spine.position.y = R * 0.9;
    const skull = skullFigure(R * 0.35);
    skull.position.set(0, R * 0.3, R * 1.6);
    skull.rotation.x = 0.4;
    t.add(spine, skull);
    t.rotation.z = (rand() - 0.5) * 0.4;
    const g = new THREE.Group();
    g.add(t);
    return place(g, x, z, rand);
  };
  const ash: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const heap = new THREE.Mesh(new THREE.SphereGeometry(2 + rand() * 2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), greyStone());
    heap.scale.y = 0.35;
    t.add(heap);
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 1.4, 6), blackWood());
    stump.position.set(0.8, 0.7, 0);
    stump.rotation.z = 0.2;
    t.add(stump);
    return place(t, x, z, rand);
  };
  const willowMat = lambert(0x1e2418, { flatShading: true, side: THREE.DoubleSide });
  fades.push(dying(willowMat, 0.3));
  const willow: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 8 + rand() * 4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, h, 7), blackWood());
    trunk.position.y = h / 2;
    trunk.rotation.z = (rand() - 0.5) * 0.3;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(5 + rand() * 2, h * 0.95, 9, 1, true), willowMat);
    crown.position.y = h * 0.6;
    t.add(trunk, crown);
    // Streaming in the wind, like her hair.
    const ph = rand() * 10;
    animated.push((time) => (crown.rotation.z = 0.14 * Math.sin(time * 1.7 + ph)));
    return place(t, x, z, rand);
  };
  // Her parasites.
  const pumpjack: Feature = (x, z, rand) => place(pumpjackFigure(0.8 + rand() * 0.5, animated, rand() * 10), x, z, rand);
  const stump: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 0.6 + rand() * 0.6;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.2, 0.8, 8), bark());
    s.position.y = 0.4;
    const top = new THREE.Mesh(new THREE.CircleGeometry(r, 8), lambert(0x8a7058));
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
      if (rand() < 0.4) {
        d.rotation.z = Math.PI / 2;
        d.position.y = 0.5;
      }
      t.add(d);
    }
    // Bleeding out into the ground.
    const slick = new THREE.Mesh(new THREE.CircleGeometry(3 + rand() * 4, 14), oilMat());
    slick.rotation.x = -Math.PI / 2;
    slick.position.y = 0.04;
    t.add(slick);
    return place(t, x, z, rand);
  };
  // The dead.
  const deadTree: Feature = (x, z, rand) => place(twistedTree(6 + rand() * 6, rand, deadWood()), x, z, rand);
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
    [4, twisted],
    [1.6, pine],
    [2, thorns],
    [1.2, standing],
    [1, bones],
    [1, ash],
  ];
  const hair: [number, Feature][] = [
    [3, twisted],
    [2.5, pine],
    [3, willow],
    [1.5, thorns],
  ];
  const parasite: [number, Feature][] = [
    [2.2, pumpjack],
    [2.5, stump],
    [1.8, drums],
    [1, twisted],
    [0.6, bones],
  ];
  const dead: [number, Feature][] = [
    [3, deadTree],
    [1.4, ash],
    [2, greyRock],
    [1, bones],
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

/**
 * A rig like a tick, gorging: a bloated body of dark red sunk into her on
 * eight bent legs of steel, a pipe for a mouth driven down into the
 * ground, swelling and slackening as it drinks.
 */
function tickFigure(size: number, animated: Animated, ph: number): THREE.Group {
  const t = new THREE.Group();
  const hide = new THREE.MeshPhongMaterial({ color: 0x3a0e0a, emissive: 0x1a0402, shininess: 70, specular: 0x6a3a30, flatShading: true });
  const body = new THREE.Mesh(new THREE.SphereGeometry(3, 14, 10), hide);
  body.scale.set(1, 0.7, 1.35);
  body.position.set(0, 3.2, -0.6);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), steel());
  head.position.set(0, 2.4, 3.3);
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.2, 3.4, 6), rust());
  mouth.position.set(0, 1, 4);
  mouth.rotation.x = 0.5;
  t.add(body, head, mouth);
  for (let k = 0; k < 8; k++) {
    const side = k < 4 ? -1 : 1;
    const z = ((k % 4) - 1.5) * 1.5;
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.4, 5), steel());
    upper.position.set(side * 2.6, 4, z);
    upper.rotation.z = side * -0.9;
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 4.2, 5), steel());
    lower.position.set(side * 4.3, 1.9, z * 1.3);
    lower.rotation.z = side * 0.35;
    t.add(upper, lower);
  }
  const pool = new THREE.Mesh(new THREE.CircleGeometry(5.5, 16), oilMat());
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.05, 2);
  t.add(pool);
  t.scale.setScalar(size);
  animated.push((time) => {
    const gulp = 0.5 + 0.5 * Math.sin(time * 1.3 + ph);
    body.scale.set(1 + 0.12 * gulp, 0.7 + 0.1 * gulp, 1.35 + 0.1 * gulp);
    hide.emissiveIntensity = 0.6 + 0.6 * gulp;
    pool.scale.setScalar(0.9 + 0.15 * Math.sin(time * 0.2 + ph));
  });
  return t;
}

/** How much bigger than a model hand her hands are built, and the start's sign. */
const HAND = 1.25;
const startFace = once(() => signFace(['I AM GAIA'], '#0c0a08', '#e8dcc0'));

/**
 * The one: her two hands rising out of the earth either side of the start,
 * black and cracked as old rock, her blood glowing dull in the cracks of
 * their knuckles, palms to the road and long clawed fingers curling over
 * it toward each other, flexing slowly as if they could close on it;
 * between the claws, high over the line, an ember, the one, beating slow
 * with her breath; I AM GAIA hung under it. On the final lap the ember
 * goes out, the fingers fall still and the hands grey.
 */
export function gaiaHands(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 3;
  const handSkin = lambert(0x3a332c, { flatShading: true });
  const knuckleMat = new THREE.MeshLambertMaterial({ color: 0x2a201a, emissive: BLOOD_HEX, emissiveIntensity: 0.5, flatShading: true });
  const clawMat = lambert(0xc8bca0, { flatShading: true });
  const fades = [dying(handSkin, 0.5), dying(knuckleMat, 0.4)];
  const curls: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const hand = new THREE.Group();
    // The wrist out of a mound of torn earth, the palm leaning in over the road.
    const mound = new THREE.Mesh(new THREE.SphereGeometry(6.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0x221c16, { flatShading: true }));
    mound.scale.set(1, 0.5, 1.3);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.3, 6, 9), handSkin);
    wrist.position.y = 2;
    const palm = new THREE.Group();
    palm.position.y = 4.5;
    palm.rotation.z = -0.25;
    const flat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 8, 8.4), handSkin);
    flat.position.y = 4;
    palm.add(flat);
    // Four long fingers, each three joints curling over the road, clawed; the thumb low on the near side.
    for (let k = 0; k < 4; k++) {
      let joint: THREE.Object3D = palm;
      let y = 8;
      const lens = [5.6 - Math.abs(k - 1.5) * 0.6, 4.8, 3.8];
      lens.forEach((len, j) => {
        const seg = new THREE.Group();
        seg.position.set(0, y, j === 0 ? -3.3 + k * 2.2 : 0);
        seg.rotation.z = -(j === 0 ? 0.3 : 0.62);
        seg.userData.rest = seg.rotation.z;
        seg.userData.j = j;
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.48 - j * 0.08, 0.62 - j * 0.08, len, 7), handSkin);
        bone.position.y = len / 2;
        const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.74 - j * 0.12, 7, 5), knuckleMat);
        seg.add(bone, knuckle);
        if (j === 2) {
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.34, 2.4, 5), clawMat);
          claw.position.set(0.2, len + 1, 0);
          claw.rotation.z = -0.35;
          seg.add(claw);
        }
        joint.add(seg);
        joint = seg;
        y = len;
        if (j > 0) curls.push(seg);
      });
    }
    const thumb = new THREE.Group();
    thumb.position.set(0, 3, -4.3);
    thumb.rotation.set(-0.8, 0, -0.5);
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.95, 5, 7), handSkin);
    tb.position.y = 2.5;
    thumb.add(tb);
    palm.add(thumb);
    hand.add(mound, wrist, palm);
    // Built curling toward +x: from the right of the road (-x here) toward its middle; mirrored on the left.
    hand.position.x = side * hw;
    hand.scale.set(-side * HAND, HAND, HAND);
    g.add(hand);
  }
  // The one, between her claws: an ember.
  const emberMat = new THREE.MeshBasicMaterial({ color: EMBER_HEX });
  const seed = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), emberMat);
  seed.position.y = 22;
  const halo = sprite(BLOOD_HEX, 18, 0.7);
  halo.position.y = 22;
  const sign = signPanel(10, startFace(), handSkin);
  sign.position.y = 15;
  const ropes = [-1, 1].map((k) => {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6, 4), lambert(0x1a1410));
    r.position.set(k * 4, 19, 0);
    return r;
  });
  g.add(seed, halo, sign, ...ropes);
  animated.push((time) => {
    const life = 1 - atmosphere.finalLap;
    const u = (time / (BREATH_PERIOD * 2)) % 1;
    const beat = Math.exp(-((u - 0.1) ** 2) / 0.004) + 0.6 * Math.exp(-((u - 0.28) ** 2) / 0.004);
    seed.scale.setScalar(1 + 0.3 * beat * life);
    emberMat.color.setHex(EMBER_HEX).lerp(new THREE.Color(DEAD_HEX), atmosphere.finalLap);
    halo.material.opacity = (0.35 + 0.45 * beat) * life;
    knuckleMat.emissiveIntensity = (0.3 + 0.4 * beat) * life;
    // Her fingers flex, slowly, as if to close over the road.
    const flex = 0.1 * (0.5 + 0.5 * Math.sin(time * 0.45)) * life;
    for (const seg of curls) seg.rotation.z = seg.userData.rest - flex * (seg.userData.j === 2 ? 1.6 : 1);
    fades.forEach((fn) => fn());
  });
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * Her face, lying in the land round her head, looking up: a vast dome of
 * her skin, dark as old rock, the brow, cheeks, nose, lips and chin raised
 * out of it, and her eyes, vast, unblinking but for once in a long while,
 * the dark Earth for irises burning round a pupil like a pit, that turn to
 * follow whoever passes: Gaia sees. Her hair streams away from her crown
 * in long swathes of dead black forest. It lies `lateral` off the road at
 * `s`, as far from every road as it can be, its crown toward the road at
 * `s`. Over it all, low in the sky, the sun eclipsed. On the final lap her
 * eyes close and she greys.
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
  const R = Math.max(22, Math.min(56, best.c - 6));
  const at = frameAt(ribbon, s);
  // Her crown toward the road at s (out round her hair), her chin away from it.
  const up = Math.atan2(at.x - best.x, at.z - best.z);
  const face = new THREE.Group();
  const faceSkin = lambert(0x4a4038, { flatShading: true });
  const lipMat = lambert(0x3e1c16, { flatShading: true });
  const browMat = lambert(0x221e1a, { flatShading: true });
  const socketMat = new THREE.MeshBasicMaterial({ color: 0x060504 });
  const white = new THREE.MeshLambertMaterial({ color: 0xc8c0a8, emissive: 0x2a1a10 });
  const fades = [dying(faceSkin, 0.5), dying(lipMat, 0.4), dying(white, 0.4)];
  const blob = (mat: THREE.Material, x: number, z: number, sx: number, sy: number, sz: number, y = 0) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    face.add(m);
    return m;
  };
  // Local frame: +z up the face to her crown, +x across it, y up out of the land.
  blob(faceSkin, 0, 0, R * 0.72, R * 0.14, R);
  blob(browMat, -R * 0.31, R * 0.32, R * 0.26, R * 0.13, R * 0.08, R * 0.05);
  blob(browMat, R * 0.31, R * 0.32, R * 0.26, R * 0.13, R * 0.08, R * 0.05);
  blob(faceSkin, -R * 0.4, -R * 0.16, R * 0.22, R * 0.13, R * 0.2, R * 0.03);
  blob(faceSkin, R * 0.4, -R * 0.16, R * 0.22, R * 0.13, R * 0.2, R * 0.03);
  blob(faceSkin, 0, -R * 0.08, R * 0.09, R * 0.26, R * 0.3, R * 0.02);
  blob(faceSkin, 0, -R * 0.3, R * 0.13, R * 0.18, R * 0.09, R * 0.04);
  blob(lipMat, 0, -R * 0.48, R * 0.2, R * 0.11, R * 0.06, R * 0.06);
  blob(lipMat, 0, -R * 0.58, R * 0.18, R * 0.11, R * 0.06, R * 0.05);
  blob(faceSkin, 0, -R * 0.78, R * 0.2, R * 0.12, R * 0.12, R * 0.02);
  // Her eyes, vast, open to the sky in their dark sockets; the irises turn to follow the camera.
  const eyes = [-1, 1].map((k) => {
    const eye = new THREE.Group();
    eye.position.set(k * R * 0.3, R * 0.1, R * 0.13);
    const socket = new THREE.Mesh(new THREE.SphereGeometry(R * 0.2, 20, 10), socketMat);
    socket.scale.set(1.25, 0.45, 0.85);
    socket.position.y = -R * 0.02;
    const A = R * 0.18;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), white);
    ball.scale.set(A * 1.2, A * 0.6, A * 0.8);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(R * 0.085, 32), new THREE.MeshBasicMaterial({ map: irisTexture(), transparent: true }));
    const glow = sprite(EMBER_HEX, R * 0.12, 0.5);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(A * 1.05, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), faceSkin);
    lid.scale.set(1.24, 0.66, 0.84);
    eye.add(socket, ball, iris, glow, lid);
    face.add(eye);
    const local = new THREE.Vector3();
    // Gaia sees: whoever is looking, she looks back.
    ball.onBeforeRender = (_r, _s, camera) => {
      local.copy(camera.position);
      eye.worldToLocal(local);
      local.y = Math.max(local.y, local.length() * 0.35);
      local.normalize();
      const t = 1 / Math.hypot(local.x / (A * 1.2), local.y / (A * 0.6), local.z / (A * 0.8));
      iris.position.copy(local).multiplyScalar(t * 1.01);
      glow.position.copy(local).multiplyScalar(t * 1.05);
      iris.lookAt(camera.position);
    };
    return { iris, lid, glow };
  });
  // Her hair: long swathes of dead forest streaming out from her crown, round either side.
  const hairMat = lambert(0x161a14, { flatShading: true });
  const hairLight = lambert(0x262a1e, { flatShading: true });
  fades.push(dying(hairMat, 0.4), dying(hairLight, 0.4));
  const tuft = new THREE.ConeGeometry(2.2, 8, 5);
  tuft.translate(0, 4, 0);
  const rand = seededRandom(7161);
  const hairs: THREE.Matrix4[] = [];
  const hairsLight: THREE.Matrix4[] = [];
  const cos = Math.cos(up);
  const sin = Math.sin(up);
  for (let k = 0; k < 15 && hairs.length + hairsLight.length < 380; k++) {
    const a0 = (k / 14 - 0.5) * Math.PI * 1.25;
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
      const m = new THREE.Matrix4().compose(new THREE.Vector3(wx, 0, wz), new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3)), new THREE.Vector3(sc, sc * (0.8 + rand() * 0.5), sc));
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
  // Her features stand up out of the land, higher than a face would.
  face.scale.y = 1.4;
  g.add(face);
  // The sun eclipsed, low over her: a black disc in a thin pale ring, and a dull bloom round it.
  const eclipse = new THREE.Group();
  const corona = sprite(0xd8b890, 260, 0.55, false);
  const bloom = sprite(0x8a3a1a, 520, 0.35, false);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(48, 48), new THREE.MeshBasicMaterial({ color: 0x030303, fog: false }));
  disc.position.z = 2;
  eclipse.add(bloom, corona, disc);
  eclipse.position.set(best.x + Math.sin(up + 2.2) * 900, 240, best.z + Math.cos(up + 2.2) * 900);
  eclipse.lookAt(best.x, 0, best.z);
  g.add(eclipse);
  let blinkAt = 9;
  animated.push((time) => {
    const shut = atmosphere.finalLap;
    // Unblinking, all but once in a long while.
    if (time > blinkAt + 0.5) blinkAt = time + 11 + ((time * 7.3) % 7);
    const blink = time > blinkAt && time < blinkAt + 0.5 ? Math.sin(((time - blinkAt) / 0.5) * Math.PI) : 0;
    const closed = Math.max(blink, shut);
    for (const { lid, glow } of eyes) {
      lid.scale.y = 0.04 + 0.78 * closed;
      lid.visible = closed > 0.02;
      glow.material.opacity = (0.35 + 0.15 * Math.sin(time * 1.3)) * (1 - closed);
    }
    corona.material.opacity = 0.55 * (1 - 0.6 * shut);
    fades.forEach((fn) => fn());
  });
  return g;
}

/**
 * Her parasites, gnawing at her along the road from `s` to `to`: rigs like
 * ticks gorging, bloated and swelling as they drink; pumpjacks nodding as
 * they draw her up; drill rigs boring into her, a flare burning on top;
 * smokestacks belching black smoke into the storm; oil bleeding out into
 * the ground round all of them; and a pipeline on trestles running beside
 * the road, all of it set back off the road and clear of every other.
 */
export function parasites(track: Track, ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(7171);
  const smoke = new THREE.SpriteMaterial({ map: glowTex(), color: 0x141210, transparent: true, depthWrite: false, opacity: 0.75 });
  const fire = new THREE.SpriteMaterial({ map: glowTex(), color: EMBER_HEX, transparent: true, depthWrite: false, opacity: 0.6, blending: THREE.AdditiveBlending });
  const flameColor = 0xff7a20;
  let side = 1;
  for (let at = s + 8; at < to; at += 18 + rand() * 9) {
    side = -side;
    const hw = ribbon.halfWidthAtS(at);
    const lat = side * (hw + 14 + rand() * 22);
    const p = offRoad(ribbon, at, lat);
    if (clearance(track, p.x, p.z) < 10) continue;
    // Oil bleeding out into her round it.
    const bleed = new THREE.Mesh(new THREE.CircleGeometry(6 + rand() * 6, 18), oilMat());
    bleed.rotation.x = -Math.PI / 2;
    bleed.scale.set(1, 0.6 + rand() * 0.6, 1);
    bleed.position.set(p.x, 0.04, p.z);
    g.add(bleed);
    const r = rand();
    if (r < 0.3) {
      const t = tickFigure(1.1 + rand() * 0.5, animated, rand() * 10);
      t.position.set(p.x, 0, p.z);
      t.rotation.y = p.heading + (rand() - 0.5) * 2;
      g.add(t);
    } else if (r < 0.55) {
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
      const flare = sprite(flameColor, 7, 0.9);
      flare.position.y = H + 1.5;
      t.add(bit, flare);
      const ph = rand() * 10;
      animated.push((time) => {
        bit.rotation.y = time * 6;
        flare.material.opacity = (0.7 + 0.25 * Math.sin(time * 13 + ph)) * (1 - 0.6 * atmosphere.finalLap);
        flare.scale.setScalar(6 + 1.5 * Math.sin(time * 9 + ph));
      });
      t.position.set(p.x, 0, p.z);
      g.add(t);
    } else {
      // A smokestack, belching black smoke, fire in its throat.
      const t = new THREE.Group();
      const H = 26 + rand() * 14;
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, H, 12), lambert(0x3a3430));
      stack.position.y = H / 2;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.65, 1.4, 12), lambert(0x6a1a12));
      band.position.y = H - 2.5;
      const throat = new THREE.Sprite(fire);
      throat.scale.setScalar(6);
      throat.position.y = H + 0.5;
      t.add(stack, band, throat);
      const puffs = Array.from({ length: 10 }, () => {
        const sp = new THREE.Sprite(smoke);
        t.add(sp);
        return sp;
      });
      const ph = rand() * 10;
      animated.push((time) =>
        puffs.forEach((sp, k) => {
          const u = (time * 0.16 + k / puffs.length + ph) % 1;
          sp.position.set(u * 18, H + u * 34, u * 6 + Math.sin(u * 9 + k) * 2);
          sp.scale.setScalar(5 + u * 22);
        }),
      );
      t.position.set(p.x, 0, p.z);
      g.add(t);
    }
  }
  // The pipeline, on trestles beside the road, a little off it, leaking.
  let prev: THREE.Vector3 | null = null;
  for (let at = s; at <= to; at += 12) {
    const hw = ribbon.halfWidthAtS(at);
    const p = offRoad(ribbon, at, hw + 7);
    const ok = clearance(track, p.x, p.z) > 4;
    const here = new THREE.Vector3(p.x, 1.8, p.z);
    if (ok) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.8, 0.3), steel());
      leg.position.set(p.x, 0.9, p.z);
      g.add(leg);
      if (rand() < 0.3) {
        const drip = new THREE.Mesh(new THREE.CircleGeometry(1.5 + rand() * 2, 10), oilMat());
        drip.rotation.x = -Math.PI / 2;
        drip.position.set(p.x, 0.05, p.z);
        g.add(drip);
      }
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
  return g;
}

/**
 * The elements round her hair, in the order she names them along the road
 * from `s` to `to`, each a threat: the stream (black, in the gorge inside
 * the bend), the wind (tearing across the road in streaks, dead trees bent
 * almost flat, debris flying), the rain (a black mass of cloud low over
 * the road, a downpour out of it, lightning), the photon (a cold, harsh
 * shaft of light stabbing down onto the crest, flickering), the wave (a
 * black tidal wall rearing over the outside of the road as it falls). On
 * the final lap the light fails and the rain thins, and the wave stills.
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
  // Wind: dead trees bent almost flat, streaks of it tearing across the road, and debris flying.
  const wind = span('I Am Wind');
  for (let at = wind.from - 20; at < wind.to + 10; at += 8) {
    const p = outside(at, 8 + rand() * 12);
    if (clearance(track, p.x, p.z) < 5) continue;
    const t = twistedTree(8 + rand() * 4, rand, blackWood());
    t.position.set(p.x, 0, p.z);
    t.rotation.y = p.heading + Math.PI / 2;
    const ph = rand() * 10;
    animated.push((time) => (t.rotation.z = -0.55 - 0.14 * Math.sin(time * 4.1 + ph) * Math.sin(time * 1.7 + ph)));
    g.add(t);
  }
  const streakMat = new THREE.MeshBasicMaterial({ color: 0xc8ccc4, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  const streaks = Array.from({ length: 26 }, (_, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.22), streakMat);
    g.add(m);
    return { m, k, at: wind.from + rand() * (wind.to - wind.from), y: 1.5 + rand() * 9 };
  });
  const debrisMat = lambert(0x2a221a, { side: THREE.DoubleSide });
  const debris = Array.from({ length: 24 }, (_, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35), debrisMat);
    g.add(m);
    return { m, k, at: wind.from + rand() * (wind.to - wind.from), y: 1 + rand() * 6 };
  });
  // Rain: a black mass of cloud low over the road, a downpour out of it.
  const rain = span('I Am Rain');
  const mid = (rain.from + rain.to) / 2;
  const rf = frameAt(ribbon, mid);
  const cloud = new THREE.Group();
  const cloudMat = lambert(0x16191a, { flatShading: true });
  for (let k = 0; k < 22; k++) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(8 + rand() * 8, 1), cloudMat);
    puff.position.set((rand() - 0.5) * 90, (rand() - 0.5) * 6, (rand() - 0.5) * 60);
    puff.scale.y = 0.5;
    cloud.add(puff);
  }
  cloud.position.set(rf.x, rf.y + 30, rf.z);
  cloud.rotation.y = rf.heading;
  g.add(cloud);
  const DROPS = 2400;
  const dropPos = new Float32Array(DROPS * 6);
  const dropSeed = Array.from({ length: DROPS }, () => [(rand() - 0.5) * 100, (rand() - 0.5) * 70, rand()]);
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const dropMat = new THREE.LineBasicMaterial({ color: 0x9aa8b4, transparent: true, opacity: 0.5 });
  const drops = new THREE.LineSegments(dropGeo, dropMat);
  drops.position.copy(cloud.position);
  drops.rotation.y = rf.heading;
  drops.frustumCulled = false;
  g.add(drops);
  // Lightning: out of the storm, now here, now there over her, the land lit white an instant.
  const flash = new THREE.DirectionalLight(0xc8d4ff, 0);
  flash.position.set(rf.x, 300, rf.z);
  flash.target.position.set(rf.x, 0, rf.z);
  g.add(flash, flash.target);
  const boltPos = new Float32Array(13 * 3);
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3));
  const boltMat = new THREE.LineBasicMaterial({ color: 0xe8ecff, transparent: true, opacity: 0, fog: false });
  const bolt = new THREE.Line(boltGeo, boltMat);
  bolt.frustumCulled = false;
  g.add(bolt);
  let strikeAt = 4;
  let struck = -1;
  const bounds = track.def.bounds;
  // Photon: a cold, harsh shaft of light stabbing down onto the crest, flickering.
  const photon = span('I Am Photon');
  const pf = frameAt(ribbon, (photon.from + photon.to) / 2);
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4, 9, 140, 18, 1, true), shaftMat);
  shaft.position.set(pf.x, pf.y + 70, pf.z);
  shaft.rotation.z = 0.08;
  const glare = sprite(0xe0f0ff, 26, 0.5);
  glare.position.set(pf.x, pf.y + 1.5, pf.z);
  g.add(shaft, glare);
  // Wave: a black tidal wall rearing over the outside of the road as it falls.
  const wave = span('I Am Wave');
  const wf = frameAt(ribbon, (wave.from + wave.to) / 2);
  const wo = outside((wave.from + wave.to) / 2, 16);
  const waveMat = new THREE.MeshPhongMaterial({ color: 0x0a1614, emissive: 0x020605, shininess: 110, specular: 0x6a8a8a, side: THREE.DoubleSide });
  const curl = new THREE.Group();
  // Its cross-section: a wall rising from the land behind, cresting high, and its lip curling over toward the road (-x).
  const profile = new THREE.Shape();
  profile.moveTo(40, 0);
  profile.quadraticCurveTo(28, 4, 20, 16);
  profile.quadraticCurveTo(14, 30, 4, 33);
  profile.quadraticCurveTo(-7, 34, -10, 22);
  profile.quadraticCurveTo(-5, 25, 0, 22);
  profile.quadraticCurveTo(9, 14, 10, 0);
  profile.lineTo(40, 0);
  const LONG = 70;
  const bodyGeo = new THREE.ExtrudeGeometry(profile, { depth: LONG, bevelEnabled: false, curveSegments: 10 });
  bodyGeo.translate(0, 0, -LONG / 2);
  const body = new THREE.Mesh(bodyGeo, waveMat);
  const foam = Array.from({ length: 18 }, (_, k) => {
    const f = sprite(0x8a9a98, 5 + (k % 3), 0.5);
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
      const u = (time * 0.9 + st.k / streaks.length) % 1;
      const hw = ribbon.halfWidthAtS(st.at);
      const p = offRoad(ribbon, st.at, (u - 0.5) * 2 * (hw + 16));
      st.m.position.set(p.x, ribbon.heightAt(st.at) + st.y, p.z);
      st.m.rotation.y = p.heading + Math.PI / 2;
    }
    streakMat.opacity = 0.32;
    for (const d of debris) {
      const u = (time * 0.7 + d.k / debris.length) % 1;
      const hw = ribbon.halfWidthAtS(d.at);
      const p = offRoad(ribbon, d.at, (u - 0.5) * 2 * (hw + 20));
      d.m.position.set(p.x, ribbon.heightAt(d.at) + d.y + Math.sin(time * 7 + d.k) * 1.2, p.z);
      d.m.rotation.set(time * 9 + d.k, time * 5, d.k);
    }
    for (let k = 0; k < DROPS; k++) {
      const [x, z, ph] = dropSeed[k];
      const u = (time * 2.2 + ph) % 1;
      const y = -u * 30;
      dropPos.set([x, y, z, x - 0.6, y - 3.4, z], k * 6);
    }
    dropGeo.attributes.position.needsUpdate = true;
    dropMat.opacity = 0.5 * (0.5 + 0.5 * life);
    // Lightning, every few seconds somewhere over her.
    if (time > strikeAt + 0.25) {
      const k = Math.floor(time);
      strikeAt = time + 4 + ((k * 7.31) % 6);
      struck = k;
    }
    const since = time - strikeAt;
    const lit = since >= 0 && since < 0.25 ? (since < 0.06 || (since > 0.12 && since < 0.17) ? 1 : 0.3) : 0;
    flash.intensity = 2.6 * lit;
    boltMat.opacity = lit;
    if (lit && boltMat.userData.k !== struck) {
      boltMat.userData.k = struck;
      const r = seededRandom(struck * 31 + 7);
      let x = (r() - 0.5) * bounds * 1.6;
      let z = (r() - 0.5) * bounds * 1.6;
      for (let j = 0; j <= 12; j++) {
        boltPos.set([x, 220 - j * 18.3, z], j * 3);
        x += (r() - 0.5) * 22;
        z += (r() - 0.5) * 22;
      }
      boltGeo.attributes.position.needsUpdate = true;
    }
    const flicker = 0.75 + 0.25 * Math.sin(time * 23) * Math.sin(time * 7.3);
    shaftMat.opacity = 0.2 * flicker * life;
    glare.material.opacity = 0.5 * flicker * life;
    foam.forEach((f, k) => {
      // Spray off the lip.
      f.position.set(-7 + Math.sin(time * 2 + k) * 2, 29 + Math.sin(time * 3 + k * 1.7) * 2, (k / (foam.length - 1) - 0.5) * LONG);
      f.material.opacity = 0.5 * (0.6 + 0.4 * Math.sin(time * 3 + k)) * life;
    });
    curl.position.y = 1.2 * Math.sin(time * 0.7) * life;
  });
  return g;
}

/**
 * Her heart, where the roads cross: off to the side between them, half
 * sunk in the cracked earth, a great dark heart, near black, a dull red
 * pulse beating through it slow (two beats to each of her breaths), and
 * her veins glowing dull red out from it through the cracks, far across
 * the land. On the final lap it slows, and slows, and stops; the veins go
 * dark and it greys.
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
  const heartMat = new THREE.MeshPhongMaterial({ color: 0x2a0806, emissive: BLOOD_HEX, emissiveIntensity: 0.5, shininess: 70, specular: 0x5a2a2a });
  const heart = new THREE.Group();
  const lobes = [-1, 1].map((k) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(4.6, 18, 14), heartMat);
    m.position.set(k * 3.4, 8, 0);
    return m;
  });
  const point = new THREE.Mesh(new THREE.ConeGeometry(6.4, 9, 18), heartMat);
  point.rotation.z = Math.PI;
  point.position.y = 2.8;
  // The great vessels, torn off.
  const vessels = [-1, 0, 1].map((k) => {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.3, 5, 10), heartMat);
    v.position.set(k * 2.4, 13, (k ? -1 : 1) * 1.2);
    v.rotation.z = k * 0.3;
    return v;
  });
  heart.add(...lobes, point, ...vessels);
  heart.rotation.z = 0.25;
  const glow = sprite(BLOOD_HEX, 46, 0.5);
  glow.position.y = 7;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0x1e1814, { flatShading: true }));
  earth.scale.y = 0.3;
  // Her veins, out through the cracked earth across the land.
  const veinMat = new THREE.MeshBasicMaterial({ color: 0xc02a18, transparent: true, opacity: 0.8 });
  const rand = seededRandom(7191);
  const grow = (sx: number, sz: number, ang: number, len: number, width: number, depth: number) => {
    let px = sx;
    let pz = sz;
    const steps = Math.ceil(len / 8);
    for (let j = 0; j < steps; j++) {
      const aj = ang + (rand() - 0.5) * 0.8;
      ang = aj;
      const nx = px + Math.sin(aj) * 8;
      const nz = pz + Math.cos(aj) * 8;
      if (clearance(track, x + nx, z + nz) < 3) return;
      const v = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, 8.2), veinMat);
      v.position.set((px + nx) / 2, 0.08, (pz + nz) / 2);
      v.rotation.y = Math.atan2(nx - px, nz - pz);
      g.add(v);
      if (depth < 2 && rand() < 0.18) grow(nx, nz, ang + (rand() < 0.5 ? -0.9 : 0.9), len * 0.45, width * 0.6, depth + 1);
      px = nx;
      pz = nz;
    }
  };
  for (let k = 0; k < 14; k++) grow(0, 0, (k / 14) * Math.PI * 2 + rand() * 0.3, 60 + rand() * 110, 0.7, 0);
  g.add(earth, heart, glow);
  const alive = new THREE.Color(0x2a0806);
  const dead = new THREE.Color(DEAD_HEX);
  let beat = 0;
  let last = 0;
  animated.push((time) => {
    const dying = atmosphere.finalLap;
    // Two slow beats to a breath, slowing to a stop at the end.
    beat += (time - last) * (1.2 / BREATH_PERIOD) * Math.max(0, 1 - 1.1 * dying);
    last = time;
    const u = beat % 1;
    const pulse = (Math.exp(-((u - 0.1) ** 2) / 0.004) + 0.6 * Math.exp(-((u - 0.32) ** 2) / 0.004)) * (1 - dying);
    heart.scale.setScalar(1 + 0.1 * pulse);
    heartMat.color.copy(alive).lerp(dead, dying);
    heartMat.emissiveIntensity = 0.15 + 0.85 * pulse;
    glow.material.opacity = 0.15 + 0.45 * pulse;
    veinMat.opacity = (0.3 + 0.55 * pulse) * (1 - 0.95 * dying);
  });
  g.position.set(x, 0, z);
  return g;
}

/**
 * Dead earth along the road from `s` to `to`: the land gone grey and
 * cracked either side, ash blowing; nobody sees.
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
  const ash = new THREE.SpriteMaterial({ map: glowTex(), color: 0x8a8480, transparent: true, depthWrite: false, opacity: 0.4 });
  const flakes = Array.from({ length: 60 }, () => {
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
const rainbowFace = once(() => signFace(['LUCKY', 'RAINBOW'], '#14121a', '#c8c0b0'));

/**
 * The Lucky Rainbow: the light through the rain, a rainbow in the storm
 * over the gorge, arching the same way as its road, but sickly, its
 * colours washed out to bruise and bile, guttering in and out like it
 * could go any moment; a sign at the gorge's near edge; the road itself is
 * the rainbow. On the final lap it all but goes (the road stays).
 */
export function luckyRainbow(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const bands = [0x8a4a4a, 0x8a6a3a, 0x9a9a4a, 0x5a7a4a, 0x4a5a7a, 0x4a3a6a, 0x5a3a5a];
  const mats = bands.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const R = 60;
  const CUT = 0.42;
  bands.forEach((_, k) => {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(R - k * 2.2, 1.1, 6, 64, Math.PI - 2 * CUT), mats[k]);
    // In the vertical plane along the road, centred on the gorge, its feet fading out high in the air over the gorge's ends.
    arc.rotation.set(0, Math.PI / 2, CUT);
    arc.position.y = -6;
    g.add(arc);
  });
  const sign = signPanel(7, rainbowFace(), lambert(0x3a3430));
  const start = offRoad(ribbon, Math.max(0, s - 52), ribbon.halfWidthAtS(s) + 3);
  sign.position.set(start.x, 4, start.z);
  sign.rotation.y = start.heading;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), lambert(0x3a3430));
  post.position.set(start.x, 1.6, start.z);
  animated.push((time) => {
    // Guttering, as if it could go any moment.
    const gutter = 0.55 + 0.45 * Math.sin(time * 0.6) * Math.sin(time * 1.9 + 1) ** 2;
    mats.forEach((m, k) => (m.opacity = 0.22 * gutter * (0.8 + 0.2 * Math.sin(time * 3 + k)) * (1 - 0.85 * atmosphere.finalLap)));
  });
  g.position.set(f.x, 0, f.z);
  g.rotation.y = f.heading;
  const out = new THREE.Group();
  out.add(g, sign, post);
  return out;
}

/** Ribs heaving: how far past each edge of the road a rib runs on under the land. */
const RIB_REACH = 9;
const DUST = 12;

/**
 * One of Gaia's ribs, the hazard's look: a ridge of black rock across the
 * road and on under the land either side, heaving like something alive:
 * swelling as she breathes in, red glowing in its cracks as she starts
 * to; as she breathes out it sinks right down through the road into a
 * black trough, her breath blowing ash up out of the cracks.
 */
export function breathParts(obj: THREE.Object3D): THREE.Object3D[] {
  const ridgeMat = new THREE.MeshPhongMaterial({ color: 0x141210, emissive: BLOOD_HEX, emissiveIntensity: 0, flatShading: true, shininess: 40, specular: 0x4a3a30 });
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 14, 1, false, 0, Math.PI), ridgeMat);
  // Lying across the road (local x), its round top up.
  ridge.rotation.set(0, 0, Math.PI / 2);
  const ridgeHolder = new THREE.Group();
  ridgeHolder.add(ridge);
  // Its crest, a seam of her blood showing through the rock.
  const seam = new THREE.Mesh(new THREE.CylinderGeometry(1.03, 1.03, 1, 14, 1, false, Math.PI * 0.45, Math.PI * 0.1), new THREE.MeshBasicMaterial({ color: 0x7a1a10 }));
  seam.rotation.set(0, 0, Math.PI / 2);
  ridgeHolder.add(seam);
  const cracks = new THREE.Mesh(new THREE.PlaneGeometry(1, 2 * BREATH_DEPTH), new THREE.MeshBasicMaterial({ color: EMBER_HEX, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  cracks.rotation.x = -Math.PI / 2;
  cracks.position.y = 0.1;
  const trough = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0, depthWrite: false }));
  trough.rotation.x = -Math.PI / 2;
  trough.position.y = 0.09;
  const dust = new THREE.Group();
  for (let k = 0; k < DUST; k++) dust.add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x5a524a, transparent: true, depthWrite: false, opacity: 0 })));
  obj.add(ridgeHolder, cracks, trough, dust);
  return [ridgeHolder, cracks, trough, dust];
}

/** Poses a rib (from breathParts): as high as her breath has it, shuddering, or sunk to a trough with ash blowing out. */
export function poseBreath(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [ridgeHolder, cracks, trough, dust] = parts;
  obj.rotation.y = p.heading;
  const B = BREATH_STAGES;
  const w = 2 * (p.radius + RIB_REACH);
  const lift = p.gap;
  const ridge = ridgeHolder.children[0] as THREE.Mesh;
  const ridgeMat = ridge.material as THREE.MeshPhongMaterial;
  ridgeHolder.visible = lift > 0.04;
  // The ridge: half a cylinder across the road, its height the breath's, shuddering like something alive as it moves.
  const moving = lift > 0.04 && lift < 1.98;
  ridgeHolder.scale.set(w, Math.max(0.05, lift) * (1 + (moving ? 0.05 * Math.sin(elapsed * 31) : 0)), BREATH_DEPTH);
  // Red in the cracks: from just before she breathes in, while she does.
  const warming = p.phase > B.inhale - 0.12 && p.phase < B.full;
  const glow = warming ? Math.sin(((p.phase - (B.inhale - 0.12)) / (B.full - B.inhale + 0.12)) * Math.PI) : 0;
  ridgeMat.emissiveIntensity = 0.15 + 0.75 * glow;
  const crackMat = (cracks as THREE.Mesh).material as THREE.MeshBasicMaterial;
  cracks.scale.x = w;
  crackMat.opacity = 0.5 * glow * (0.7 + 0.3 * Math.sin(elapsed * 14));
  // The trough as she breathes out, and her breath blowing ash out of it.
  const sink = Math.max(0, -lift) / BREATH_SINK;
  const out = p.phase >= B.exhale && p.phase < B.empty ? (p.phase - B.exhale) / (B.empty - B.exhale) : p.phase >= B.empty ? 1 : 0;
  trough.scale.set(w / 2, BREATH_DEPTH * 1.4, 1);
  ((trough as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.7 * sink;
  dust.children.forEach((d, k) => {
    const v = (elapsed * 0.9 + k / DUST) % 1;
    d.position.set((k / (DUST - 1) - 0.5) * w * 0.9, 0.5 + v * 5 * (0.5 + out), (Math.sin(k * 2.1) * BREATH_DEPTH) / 2);
    d.scale.setScalar(2.5 + v * 5);
    ((d as THREE.Sprite).material as THREE.SpriteMaterial).opacity = p.active || (p.phase >= B.empty && sink > 0.2) ? 0.6 * Math.sin(v * Math.PI) * Math.max(sink, 0.3) : 0;
  });
}
