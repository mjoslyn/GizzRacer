import * as THREE from 'three';
import { seededRandom } from '../core/math';
import type { HazardPose } from '../items/hazards';
import { HOUND_STAGES, houndPack } from '../kits/theGrimReaper';
import type { PitDef } from '../tracks/builder';
import { nearestOnSpline, pointAt } from '../tracks/spline';
import type { Ribbon, Track } from '../tracks/track';
import { glowTexture } from './textures';

/**
 * The Grim Reaper's world, the All Stars Cup's third: the reaper's rounds
 * on collection night, a slow boom-bap dread over a dead frontier. Night
 * coming down, the sun gone dark blood red behind black cloud over the
 * wicked men, the only warmth in a cold, ashen world; fog lying in the pit
 * and the hollows, crows and vultures over the carrion. Its textures (the
 * road of black cinders with a gold line down its middle, ashen and cracked
 * hardpan with old blood dried into it, charred rock for the pit and the
 * world's edge, a black rail with a cut-up sample's waveform in gold along
 * it), its scenery (charred cacti, dead trees with nooses and hatchets,
 * bones and skulls, carrion with crows on it, broken wagon wheels, crooked
 * crosses and gravestones, chimneys of burnt-out houses, crates of
 * dollar-bin records and speaker stacks, body bags on pegs, guttering
 * matches, ground fog), its landmarks (the start between two speaker
 * stacks under a tarnished, bloodied scythe, the chimneys belching black
 * smoke, the gate keeper's iron gate over the hellhound pit, the reaper
 * himself, hooded, his skull's hollow eyes burning red, looming over the
 * lap and nodding slowly over his turntables, the dark sun behind the
 * silhouettes of many wicked men, the bank and the cheque signed in blood,
 * the black, spiked fortress of the wicked, the body bags on the hills,
 * the rotting homestead the stench orbits, the open grave under Time Is
 * Priceless) and its hazard's look (the hellhounds, their dens glowing
 * like furnaces and the stitches like fresh wounds).
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

/** Tarnished gold, the dark red sun, the hellhounds' fire, blood, and the stench's sick yellow-green. */
const GOLD_HEX = 0xc89a30;
const SUN_HEX = 0xb01408;
const EMBER_HEX = 0xff3a10;
const BLOOD_HEX = 0x6a0606;
const STENCH_HEX = 0x8aa030;
/** The fog lying in the pit and the hollows: a cold grey. */
const FOG_HEX = 0x9a9aa6;

/** The boom-bap's tempo, slowed right down like the sample: about 80 beats a minute. */
const BEAT = 80 / 60;
/** 0..1 through each beat, a kick on the 0. */
const beatPhase = (time: number) => (time * BEAT) % 1;
/** A kick: 1 on the beat, falling away fast. */
const kick = (time: number) => Math.exp(-beatPhase(time) * 7);

/**
 * The road: black cinders and ash, the scorched dirt of the reaper's round.
 * The texture spans half the road (its u across, its v along): charcoal
 * cinders, coarse and speckled, lighter ash in the two worn ruts, a few
 * embers still glowing red and flecks of gold; a pale ash shoulder down
 * the edge, and a broken gold line down the middle. It reads black and
 * plain against the pale ash of the ground either side.
 */
export function cinderRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7101);
  const grain = fbm(S, 64, 2, 7102);
  paint(ctx, S, S, (x, _y, i) => {
    const u = x / S;
    // The shoulder: ash, pale and dusty.
    if (u < 0.05) return mix([150, 136, 120], [184, 170, 150], n[i]);
    const base = mix([40, 36, 38], [74, 66, 64], n[i]);
    // The worn ruts, smoother and greyer with ash.
    const rut = Math.exp(-(((u - 0.34) / 0.07) ** 2)) + Math.exp(-(((u - 0.72) / 0.07) ** 2));
    const ash = mix(base, [96, 90, 88], 0.35 * rut);
    return shade(ash, 0.78 + 0.44 * grain[i]);
  });
  const rand = seededRandom(7103);
  // Cinders: coarse dark and light specks.
  for (let k = 0; k < 2600; k++) {
    const r = rand();
    ctx.fillStyle = r < 0.5 ? 'rgba(14,12,14,0.7)' : 'rgba(140,130,124,0.45)';
    const sz = 1 + rand() * 2;
    ctx.fillRect(S * (0.06 + rand() * 0.9), rand() * S, sz, sz);
  }
  // A few embers, and flecks of gold.
  for (let k = 0; k < 70; k++) {
    ctx.fillStyle = rand() < 0.7 ? 'rgba(220,40,20,0.85)' : 'rgba(255,196,70,0.9)';
    ctx.fillRect(S * (0.08 + rand() * 0.86), rand() * S, 1.5, 1.5);
  }
  // The broken gold line down the middle.
  ctx.fillStyle = css([236, 184, 56]);
  for (let y = 0; y < S; y += 64) ctx.fillRect(S - 7, y + 8, 7, 34);
  ctx.fillStyle = css([255, 232, 150], 0.7);
  for (let y = 0; y < S; y += 64) ctx.fillRect(S - 4, y + 10, 2, 30);
  // The shoulder's edge, a line of dark cinders.
  ctx.fillStyle = 'rgba(20,16,16,0.6)';
  ctx.fillRect(S * 0.05, 0, 2, S);
  return finish(c);
}

/** The ground: dead hardpan gone to ash, pale and cold, cracked into plates, old blood dried dark into it, scorch marks, bone chips and dead grass. */
export function scorchedGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 5, 7111);
  const patch = fbm(S, 4, 3, 7112);
  paint(ctx, S, S, (_x, _y, i) => {
    const bone: RGB = [216, 210, 202];
    const ash: RGB = [170, 164, 160];
    const char: RGB = [100, 92, 92];
    const base = patch[i] < 0.4 ? mix(char, ash, patch[i] / 0.4) : mix(ash, bone, Math.min(1, (patch[i] - 0.4) * 2));
    return shade(base, 0.8 + n[i] * 0.34);
  });
  const rand = seededRandom(7113);
  // The cracks: the dead crust split into plates, a crooked line from each seed to its neighbours.
  const seeds = Array.from({ length: 70 }, () => [rand() * S, rand() * S] as const);
  ctx.strokeStyle = 'rgba(24,18,18,0.6)';
  ctx.lineWidth = 1.5;
  for (const [x, y] of seeds) {
    const near = seeds
      .map(([a, b]) => [a, b, Math.hypot(a - x, b - y)] as const)
      .filter((q) => q[2] > 1)
      .sort((p, q) => p[2] - q[2])
      .slice(0, 3);
    for (const [a, b] of near) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      const mx = (x + a) / 2 + (rand() - 0.5) * 14;
      const my = (y + b) / 2 + (rand() - 0.5) * 14;
      ctx.lineTo(mx, my);
      ctx.lineTo(a, b);
      ctx.stroke();
    }
  }
  // Scorch marks, and old blood dried dark.
  for (let k = 0; k < 46; k++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    const blood = rand() < 0.35;
    g.addColorStop(0, blood ? 'rgba(80,10,10,0.4)' : 'rgba(30,24,24,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(rand() * S, rand() * S);
    ctx.scale(8 + rand() * 30, 5 + rand() * 18);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Grit, bone chips and dead grass.
  for (let k = 0; k < 6000; k++) {
    const r = rand();
    ctx.fillStyle = r < 0.4 ? 'rgba(60,54,52,0.5)' : r < 0.75 ? 'rgba(120,112,96,0.45)' : 'rgba(232,226,214,0.55)';
    ctx.fillRect(rand() * S, rand() * S, r < 0.4 ? 2 : 1, r > 0.4 && r < 0.75 ? 3 : 1.5);
  }
  return finish(c);
}

/** The pit's walls and the world's edge: charred rock in strata, black and dark rust, scorched blacker along the top, red-brown runs down it like old blood. */
export function adobeTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7121);
  const band = fbm(S, 2, 3, 7122);
  paint(ctx, S, S, (_x, y, i) => {
    // Strata across the wall, wavering.
    const v = (y / S + band[i] * 0.25) * 7;
    const layer = Math.floor(v) % 3;
    const col: RGB = layer === 0 ? [84, 60, 54] : layer === 1 ? [112, 96, 88] : [58, 40, 38];
    // Scorched dark near the top of the wall (v small: the texture's top is the wall's top).
    const sootTop = Math.max(0, 1 - y / (S * 0.3));
    return shade(mix(col, [18, 12, 12], sootTop * 0.8), 0.78 + n[i] * 0.4);
  });
  const rand = seededRandom(7123);
  for (let k = 0; k < 1400; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(20,12,12,0.45)' : 'rgba(170,160,150,0.25)';
    ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 2, 1);
  }
  // The runs, dark red, down from the top.
  for (let k = 0; k < 18; k++) {
    const x = rand() * S;
    const len = S * (0.2 + rand() * 0.6);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(100,10,8,0.55)');
    g.addColorStop(1, 'rgba(100,10,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 1.5 + rand() * 2, len);
  }
  return finish(c);
}

/** The barrier: a black rail with a gold rule along each edge and, between them, a sample's waveform in gold, chopped into pieces the way the record was cut up. */
export function waveformRailTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#141012';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = css([236, 184, 56]);
  ctx.fillRect(0, 0, W, 5);
  ctx.fillRect(0, H - 5, W, 5);
  const loud = fbm(W, 8, 3, 7131);
  // Four chops, a gap between each.
  for (let x = 0; x < W; x++) {
    const inChop = x % 64 > 4 && x % 64 < 60;
    if (!inChop) continue;
    const a = (0.25 + 0.75 * loud[(x * 7) % (W * W)]) * (0.55 + 0.45 * Math.abs(Math.sin(x * 0.7) * Math.sin(x * 0.13)));
    const h = a * (H / 2 - 9);
    ctx.fillStyle = css([255, 200, 70], 0.95);
    ctx.fillRect(x, H / 2 - h, 1, 2 * h);
  }
  ctx.fillStyle = css([255, 240, 180], 0.8);
  ctx.fillRect(0, H / 2 - 0.5, W, 1);
  return finish(c);
}

const glowTex = once(() => glowTexture());
const gold = once(() => new THREE.MeshPhongMaterial({ color: GOLD_HEX, emissive: 0x1a1000, specular: 0xc8b080, shininess: 60 }));
/** Gold gone dark: the reaper's scythe and chain. */
const tarnish = once(() => new THREE.MeshPhongMaterial({ color: 0x5a4216, emissive: 0x080400, specular: 0x6a5838, shininess: 35 }));
const blood = once(() => new THREE.MeshPhongMaterial({ color: BLOOD_HEX, emissive: 0x2a0000, specular: 0x803030, shininess: 90 }));
const blackGloss = once(() => new THREE.MeshPhongMaterial({ color: 0x0e0c0e, specular: 0x605860, shininess: 70 }));
const bone = once(() => lambert(0xc8bca8));
const wood = once(() => lambert(0x5a4a3c));
const darkWood = once(() => lambert(0x2e241e));
const brick = once(() => lambert(0x4a2822));
const soot = once(() => lambert(0x1a1412));
const iron = once(() => lambert(0x1c181a));
/** The fortress of the wicked: black stone. */
const adobe = once(() => lambert(0x1c1818));
/** The cacti, charred black, a little dead green left in them. */
const cactus = once(() => lambert(0x2a2c22, { flatShading: true }));
const hound = once(() => new THREE.MeshPhongMaterial({ color: 0x0a0808, specular: 0x402020, shininess: 30 }));

function sprite(color: number, size: number, opacity = 1, fog = true): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog }));
  s.scale.setScalar(size);
  return s;
}

/** A puff of smoke: a soft dark sprite, not additive. */
function smoke(color: number, size: number, opacity = 0.6): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, depthWrite: false, transparent: true, opacity }));
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

/** A face of words on a sign: blood red on black, a rule round it, heavy letters. */
const signFace = (() => {
  const made = new Map<string, THREE.CanvasTexture>();
  return (lines: string[], bg = '#060404', fg = '#c81810'): THREE.CanvasTexture => {
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
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = lines.length === 1 ? 96 : lines.length === 2 ? 70 : 52;
    ctx.font = `900 ${size}px Impact, 'Arial Black', sans-serif`;
    lines.forEach((line, k) => {
      const w = ctx.measureText(line).width;
      ctx.save();
      ctx.translate(W / 2, H / 2 + (k - (lines.length - 1) / 2) * size * 1.08);
      if (w > W - 60) ctx.scale((W - 60) / w, 1);
      // A drop shadow, the way a sleeve's lettering sits on it.
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(line, 4, 4);
      ctx.fillStyle = fg;
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
    t = finish(c, false);
    made.set(key, t);
    return t;
  };
})();

/** A sign panel `w` wide (half as high) with `map` on its face toward -z (toward whoever's coming) and on its back. */
function signPanel(w: number, map: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, w / 2);
  const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map }));
  front.rotation.y = Math.PI;
  front.position.z = -0.12;
  const rear = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map }));
  rear.position.z = 0.12;
  const board = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, w / 2 + 0.3, 0.2), blackGloss());
  g.add(board, front, rear);
  return g;
}

/** A speaker's cone: a gold ring round a black cone, facing +z. */
const coneTexture = once(() => {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#0a0808';
  ctx.fillRect(0, 0, S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.42);
  g.addColorStop(0, '#5a5050');
  g.addColorStop(0.25, '#141010');
  g.addColorStop(0.9, '#2a2424');
  g.addColorStop(1, '#f0b830');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.44, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f4c850';
  ctx.lineWidth = 5;
  ctx.stroke();
  return finish(c, false);
});

/**
 * A stack of `n` speaker cabinets `size` across, a cone in each facing +z,
 * the cones pumping on the kick. Its foot at the origin.
 */
function speakerStack(n: number, size: number, animated: Animated, phase = 0): THREE.Group {
  const g = new THREE.Group();
  const cones: THREE.Mesh[] = [];
  const coneMat = new THREE.MeshBasicMaterial({ map: coneTexture() });
  for (let k = 0; k < n; k++) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(size, size, size * 0.8), blackGloss());
    cab.position.y = size * (k + 0.5);
    const cone = new THREE.Mesh(new THREE.CircleGeometry(size * 0.42, 24), coneMat);
    cone.position.set(0, size * (k + 0.5), size * 0.41);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(size * 1.02, size * 0.05, size * 0.82), gold());
    trim.position.y = size * (k + 1) - size * 0.025;
    g.add(cab, cone, trim);
    cones.push(cone);
  }
  animated.push((time) => {
    const p = 1 + 0.08 * kick(time + phase);
    cones.forEach((c) => c.scale.set(p, p, 1));
  });
  return g;
}

/**
 * A scythe, along +y from the butt of its snath, `len` long: a black snath
 * with two grips of tarnished gold, the blade fixed at its head sweeping out
 * along +x and curving down to its point, gold gone dark, blood along its
 * edge and dripping off it.
 */
function scytheFigure(len: number): THREE.Group {
  const g = new THREE.Group();
  const snath = new THREE.Mesh(new THREE.CylinderGeometry(len * 0.012, len * 0.014, len, 8), blackGloss());
  snath.position.y = len / 2;
  g.add(snath);
  for (const at of [0.35, 0.68]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(len * 0.01, len * 0.01, len * 0.09, 6), tarnish());
    grip.rotation.z = Math.PI / 2;
    grip.position.set(len * 0.04, len * at, 0);
    g.add(grip);
  }
  const B = len * 0.62;
  const blade = new THREE.Shape();
  blade.moveTo(0, len * 0.02);
  blade.quadraticCurveTo(B * 0.5, len * 0.12, B, -len * 0.1);
  blade.quadraticCurveTo(B * 0.5, len * 0.03, 0, -len * 0.04);
  blade.lineTo(0, len * 0.02);
  const steel = new THREE.MeshPhongMaterial({ color: 0x6a5020, emissive: 0x0a0400, specular: 0x907040, shininess: 50, side: THREE.DoubleSide });
  const depth = len * 0.008;
  const edge = new THREE.Mesh(new THREE.ExtrudeGeometry(blade, { depth, bevelEnabled: false, curveSegments: 16 }), steel);
  edge.position.y = len;
  g.add(edge);
  // The blood along its cutting edge, a little proud of the steel either side.
  const wet = new THREE.Shape();
  wet.moveTo(0, -len * 0.04);
  wet.quadraticCurveTo(B * 0.5, len * 0.03, B, -len * 0.1);
  wet.quadraticCurveTo(B * 0.5, len * 0.055, 0, -len * 0.015);
  wet.lineTo(0, -len * 0.04);
  const stain = new THREE.Mesh(new THREE.ExtrudeGeometry(wet, { depth: depth * 1.4, bevelEnabled: false, curveSegments: 16 }), blood());
  stain.position.set(0, len, -depth * 0.2);
  g.add(stain);
  // Drips hanging off it.
  for (const u of [0.3, 0.5, 0.68, 0.84]) {
    const drip = new THREE.Mesh(new THREE.ConeGeometry(len * 0.006, len * 0.03, 5), blood());
    drip.rotation.z = Math.PI;
    // Under the lower curve, roughly: from (0, -0.04) through (0.5B, 0.03) to (B, -0.1).
    const y = (1 - u) * (1 - u) * -0.04 + 2 * u * (1 - u) * 0.03 + u * u * -0.1;
    drip.position.set(B * u, len + len * y - len * 0.016, depth / 2);
    g.add(drip);
  }
  return g;
}

/** A saguaro, `h` tall: a ribbed trunk and up to three arms, its foot at the origin. */
function saguaroFigure(h: number, rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const r = h * 0.07;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 10), cactus());
  trunk.position.y = h / 2;
  const top = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), cactus());
  top.position.y = h;
  g.add(trunk, top);
  const arms = Math.floor(rand() * 3) + (h > 7 ? 1 : 0);
  for (let k = 0; k < arms; k++) {
    const side = k % 2 ? -1 : 1;
    const y = h * (0.35 + rand() * 0.3);
    const out = r * (2.2 + rand());
    const elbow = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.75, out, 8), cactus());
    elbow.rotation.z = (side * Math.PI) / 2;
    elbow.position.set((side * out) / 2, y, 0);
    const up = h * (0.2 + rand() * 0.25);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.75, up, 8), cactus());
    arm.position.set(side * out, y + up / 2, 0);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.75, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), cactus());
    cap.position.set(side * out, y + up, 0);
    const holder = new THREE.Group();
    holder.add(elbow, arm, cap);
    holder.rotation.y = rand() * Math.PI;
    g.add(holder);
  }
  return g;
}

/** A sleeve's colours, for the dollar-bin records. */
const SLEEVES = [0xd84a20, 0x2a6ab8, 0xf0c840, 0x3a8a4a, 0xe8e0d0, 0x8a2a6a, 0x1a1a1a, 0xc87830];

/**
 * The dead frontier on collection night, scenery by where it stands along
 * the lap: chimneys of burnt-out houses belching black smoke by the
 * chimney sweeper's stretch, crates of dollar-bin records and speaker
 * stacks where the scraps are scratched for, charred saguaros and
 * guttering matches in the cactus, dead trees with nooses and hatchets in
 * their stumps, boot hill's crooked crosses and gravestones by the
 * hellhound pit and the grave, body bags on pegs with flies over the hills;
 * everywhere charred cacti, skulls on posts, carrion with crows at it,
 * broken wagon wheels and the fog lying in the hollows. Each piece a little
 * cluster.
 */
export function reapingFeature(animated: Animated, track?: Track): Feature {
  const sectionAt = (x: number, z: number): string => {
    if (!track) return '';
    const hit = nearestOnSpline(track.spline, x, z);
    return track.main.def.sections[track.main.sectionIndex[hit.index]]?.name ?? '';
  };
  const saguaro: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const s = saguaroFigure(5 + rand() * 8, rand);
      s.position.set((rand() - 0.5) * 9, 0, (rand() - 0.5) * 9);
      t.add(s);
    }
    return place(t, x, z, rand);
  };
  const padGeo = new THREE.SphereGeometry(1, 8, 6);
  const fruit = lambert(0x4a1020);
  const pear: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 5 + Math.floor(rand() * 7);
    for (let k = 0; k < n; k++) {
      const pad = new THREE.Mesh(padGeo, cactus());
      pad.scale.set(0.8, 1, 0.18);
      pad.position.set((rand() - 0.5) * 2.4, 0.7 + rand() * 1.6, (rand() - 0.5) * 2.4);
      pad.rotation.set((rand() - 0.5) * 0.6, rand() * Math.PI, (rand() - 0.5) * 0.9);
      t.add(pad);
      if (rand() < 0.4) {
        const f = new THREE.Mesh(padGeo, fruit);
        f.scale.setScalar(0.18);
        f.position.copy(pad.position).add(new THREE.Vector3(0, 0.9, 0));
        t.add(f);
      }
    }
    return place(t, x, z, rand);
  };
  const chimney: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 7 + rand() * 7;
    const stack = new THREE.Mesh(new THREE.BoxGeometry(1.8, h, 1.8), brick());
    stack.position.y = h / 2;
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 2.1), soot());
    band.position.y = h - 0.25;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1, 8), soot());
    pot.position.y = h + 0.5;
    t.add(stack, band, pot);
    // The house it stood in, burnt out: a few charred beams at its foot.
    for (let k = 0; k < 4; k++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 3 + rand() * 4), soot());
      beam.position.set((rand() - 0.5) * 5, 0.3 + rand() * 0.8, (rand() - 0.5) * 5);
      beam.rotation.set(rand() * 0.6, rand() * Math.PI, rand() * 0.6);
      t.add(beam);
    }
    // Still burning down inside: a red glow in its mouth, and black smoke belching out.
    const glow = sprite(EMBER_HEX, 2.4, 0.6);
    glow.position.y = h + 0.8;
    t.add(glow);
    const puffs: THREE.Sprite[] = [];
    for (let k = 0; k < 6; k++) {
      const p = smoke(0x080606, 4, 0.75);
      t.add(p);
      puffs.push(p);
    }
    const ph = rand() * 4;
    animated.push((time) => {
      puffs.forEach((p, k) => {
        const v = (time * 0.18 + k / puffs.length + ph) % 1;
        p.position.set(Math.sin(v * 3 + k) * 1.2 + v * 5, h + 1 + v * 14, 0);
        p.scale.setScalar(3 + v * 9 + kick(time));
        p.material.opacity = 0.75 * (1 - v);
      });
      glow.material.opacity = 0.4 + 0.25 * Math.sin(time * 7 + ph);
    });
    return place(t, x, z, rand);
  };
  const crateMat = lambert(0x4a3e30);
  const sleeveMats = SLEEVES.map((c) => lambert(c));
  const crate: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const box = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.4), crateMat);
      base.position.y = 0.45;
      box.add(base);
      // The records stood in it, leaning, their sleeves in every colour.
      for (let r = 0; r < 9; r++) {
        const lp = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.04), sleeveMats[Math.floor(rand() * sleeveMats.length)]);
        lp.position.set(0, 1.0, -0.55 + r * 0.13);
        lp.rotation.x = -0.25 + rand() * 0.15;
        box.add(lp);
      }
      box.position.set(k * 1.9 + (rand() - 0.5) * 0.4, 0, (rand() - 0.5) * 0.8);
      box.rotation.y = (rand() - 0.5) * 0.4;
      t.add(box);
    }
    return place(t, x, z, rand);
  };
  const speakers: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const a = speakerStack(2 + Math.floor(rand() * 2), 2 + rand() * 1.2, animated, rand());
    const b = speakerStack(1 + Math.floor(rand() * 2), 2 + rand(), animated, rand());
    b.position.set(3.2, 0, 0.4);
    t.add(a, b);
    return place(t, x, z, rand);
  };
  const crossMat = lambert(0x3a2e24);
  const stone = lambert(0x6a6662);
  const moundMat = lambert(0x3a3230, { flatShading: true });
  const graves: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const g = new THREE.Group();
      if (rand() < 0.6) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.8, 0.15), crossMat);
        post.position.y = 0.9;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.18, 0.15), crossMat);
        bar.position.y = 1.35;
        g.add(post, bar);
      } else {
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.25), stone);
        head.position.y = 0.6;
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.25, 12, 1, false, 0, Math.PI), stone);
        top.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        top.position.y = 1.2;
        g.add(head, top);
      }
      const mound = new THREE.Mesh(padGeo, moundMat);
      mound.scale.set(0.7, 0.3, 1.3);
      mound.position.set(0, 0, 1.2);
      g.add(mound);
      // Crooked, sunk at a lean.
      g.rotation.set((rand() - 0.5) * 0.5, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.6);
      g.position.set((k % 3) * 2.4 + (rand() - 0.5) * 0.5, 0, Math.floor(k / 3) * 3.4);
      t.add(g);
    }
    return place(t, x, z, rand);
  };
  const skull: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 1.6 + rand();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, h, 0.25), wood());
    post.position.y = h / 2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.9), bone());
    head.position.set(0, h + 0.1, 0.1);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.5), bone());
    snout.position.set(0, h - 0.05, 0.6);
    t.add(post, head, snout);
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1.2, 6), bone());
      horn.rotation.z = side * -1.2;
      horn.position.set(side * 0.7, h + 0.35, 0);
      t.add(horn);
    }
    return place(t, x, z, rand);
  };
  const bark = lambert(0x221c18, { flatShading: true });
  const rope = lambert(0x6a5a40);
  const steelMat = new THREE.MeshPhongMaterial({ color: 0xa8a8b0, specular: 0xffffff, shininess: 80 });
  const hatchet = (): THREE.Group => {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6), wood());
    handle.position.y = 0.45;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.05), steelMat);
    head.position.set(0.12, 0.9, 0);
    g.add(handle, head);
    return g;
  };
  const deadTree: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 5 + rand() * 4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, h, 6), bark);
    trunk.position.y = h / 2;
    trunk.rotation.z = (rand() - 0.5) * 0.2;
    t.add(trunk);
    for (let k = 0; k < 4; k++) {
      const len = 1.5 + rand() * 2.5;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, len, 5), bark);
      const a = rand() * Math.PI * 2;
      branch.position.set(Math.cos(a) * len * 0.35, h * (0.55 + rand() * 0.4), Math.sin(a) * len * 0.35);
      branch.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      t.add(branch);
    }
    if (rand() < 0.55) {
      // A noose off a bough, turning slowly.
      const bough = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 3.4, 5), bark);
      bough.rotation.z = Math.PI / 2;
      bough.position.set(1.5, h * 0.72, 0);
      const noose = new THREE.Group();
      noose.position.set(2.6, h * 0.72, 0);
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 4), rope);
      line.position.y = -1;
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 5, 12), rope);
      loop.position.y = -2.3;
      noose.add(line, loop);
      t.add(bough, noose);
      const ph = rand() * 6;
      animated.push((time) => {
        noose.rotation.y = time * 0.3 + ph;
        noose.rotation.z = 0.05 * Math.sin(time * 0.7 + ph);
      });
    } else {
      // The stump beside it, a hatchet dug up and buried in it again.
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.8, 8), bark);
      stump.position.set(2.2, 0.4, 0.6);
      const axe = hatchet();
      axe.position.set(2.2, 0.75, 0.6);
      axe.rotation.z = 0.5;
      t.add(stump, axe);
    }
    return place(t, x, z, rand);
  };
  const matchWood = lambert(0x8a7a60);
  const matchHead = lambert(0x5a0a0a);
  const match: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 3.5 + rand() * 2.5;
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.35, h, 0.35), matchWood);
    stick.position.y = h / 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), matchHead);
    head.scale.set(1, 1.4, 1);
    head.position.y = h + 0.2;
    const flame = sprite(0xff4a18, 2.6, 0.8);
    flame.position.y = h + 1;
    const core = sprite(0xffb060, 1, 0.8);
    core.position.y = h + 0.7;
    t.add(stick, head, flame, core);
    t.rotation.z = (rand() - 0.5) * 0.3;
    const ph = rand() * 10;
    animated.push((time) => {
      // Guttering: dying down and catching again.
      const f = 0.45 + 0.55 * Math.abs(Math.sin(time * 1.7 + ph) * Math.sin(time * 9 + ph * 2));
      flame.scale.set(2.2 * f, 3 * f, 1);
      flame.material.opacity = 0.4 + 0.5 * f;
    });
    const g = new THREE.Group();
    g.add(t);
    return place(g, x, z, rand);
  };
  const wheel: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const R = 1.2 + rand() * 0.4;
    // Broken: a piece of the rim gone, spokes snapped.
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.1, 6, 24, Math.PI * (1.2 + rand() * 0.6)), darkWood());
    t.add(rim);
    for (let k = 0; k < 6; k++) {
      if (rand() < 0.4) continue;
      const len = rand() < 0.5 ? 2 * R : R * (0.4 + rand() * 0.5);
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 5), darkWood());
      spoke.rotation.z = (k / 6) * Math.PI;
      t.add(spoke);
    }
    // Lying half sunk, or leaning on a broken axle.
    t.rotation.x = -1.2 + rand() * 0.5;
    t.position.y = R * 0.4;
    const g = new THREE.Group();
    g.add(t);
    return place(g, x, z, rand);
  };
  const bagMat = lambert(0x121012);
  const bag: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 0.3), wood());
    post.position.y = 2.1;
    const peg = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 0.2), wood());
    peg.position.set(0.8, 4, 0);
    const hang = new THREE.Group();
    hang.position.set(1.5, 3.9, 0);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.5, 4, 8), bagMat);
    body.position.y = -1.3;
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.6, 0.05), tarnish());
    zip.position.set(0, -1.3, 0.42);
    hang.add(body, zip);
    t.add(post, peg, hang);
    const flies = Array.from({ length: 4 }, () => {
      const f = smoke(0x000000, 0.25, 0.95);
      t.add(f);
      return f;
    });
    const ph = rand() * 6;
    animated.push((time) => {
      hang.rotation.z = 0.12 * Math.sin(time * 0.9 + ph);
      flies.forEach((f, k) => f.position.set(1.5 + Math.cos(time * 6 + k * 1.6 + ph) * 0.9, 2.6 + 0.5 * Math.sin(time * 8 + k), Math.sin(time * 6 + k * 1.6 + ph) * 0.9));
    });
    return place(t, x, z, rand);
  };
  // Carrion: the bones of something that died here, picked at by crows.
  const crowMat = lambert(0x060506);
  const crowFigure = (): THREE.Group => {
    const c = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), crowMat);
    body.scale.set(0.8, 0.8, 1.5);
    body.position.y = 0.3;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), crowMat);
    head.position.set(0, 0.42, 0.3);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), crowMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.4, 0.46);
    c.add(body, head, beak);
    return c;
  };
  const carrion: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 5), bone());
    spine.rotation.x = Math.PI / 2;
    spine.position.y = 0.5;
    t.add(spine);
    for (let k = 0; k < 7; k++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.6 - Math.abs(k - 3) * 0.05, 0.04, 4, 10, Math.PI), bone());
      // Arching up over the spine, across it.
      rib.position.set(0, 0.5, -1.2 + k * 0.4);
      t.add(rib);
    }
    const skullBox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.8), bone());
    skullBox.position.set(0.2, 0.25, 2.1);
    skullBox.rotation.y = 0.5;
    t.add(skullBox);
    const crows: THREE.Group[] = [];
    for (let k = 0; k < 2 + Math.floor(rand() * 2); k++) {
      const c = crowFigure();
      c.position.set((rand() - 0.5) * 2.4, 0, (rand() - 0.5) * 3);
      c.rotation.y = rand() * Math.PI * 2;
      t.add(c);
      crows.push(c);
    }
    const ph = rand() * 6;
    animated.push((time) => crows.forEach((c, k) => (c.rotation.x = Math.max(0, Math.sin(time * 3 + k * 2 + ph)) * 0.6)));
    return place(t, x, z, rand);
  };
  // Fog lying in a hollow: low grey banks drifting.
  const fogPatch: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const banks: THREE.Sprite[] = [];
    for (let k = 0; k < 5; k++) {
      const b = smoke(FOG_HEX, 1, 0.22);
      b.scale.set(14 + rand() * 10, 3, 1);
      t.add(b);
      banks.push(b);
    }
    const ph = rand() * 6;
    animated.push((time) => banks.forEach((b, k) => b.position.set(Math.sin(time * 0.05 + k * 1.3 + ph) * 8, 1 + (k % 2) * 0.6, Math.cos(time * 0.04 + k * 2.1 + ph) * 8)));
    return place(t, x, z, rand);
  };
  const hourglass: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const s = 1.4 + rand();
    const glass = new THREE.MeshPhongMaterial({ color: 0xd8e8f0, transparent: true, opacity: 0.35, shininess: 120 });
    const sand = lambert(0xe8c070);
    for (const dir of [-1, 1]) {
      const bulb = new THREE.Mesh(new THREE.ConeGeometry(0.6 * s, 1.1 * s, 12, 1, true), glass);
      bulb.rotation.x = dir < 0 ? 0 : Math.PI;
      bulb.position.y = 1.2 * s + dir * 0.55 * s;
      t.add(bulb);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.75 * s, 0.75 * s, 0.15 * s, 12), darkWood());
      cap.position.y = 1.2 * s + dir * 1.15 * s;
      t.add(cap);
    }
    const pile = new THREE.Mesh(new THREE.ConeGeometry(0.5 * s, 0.5 * s, 12), sand);
    pile.position.y = 0.38 * s;
    t.add(pile);
    return place(t, x, z, rand);
  };
  const general: [number, Feature][] = [
    [2.6, saguaro],
    [1.2, pear],
    [1.2, skull],
    [0.8, wheel],
    [0.5, match],
    [1.4, deadTree],
    [1, carrion],
    [1.4, fogPatch],
    [0.8, graves],
  ];
  const bySection: Record<string, [number, Feature][]> = {
    "I'm the Grim Reaper": [[3, speakers], [2, crate], [1, chimney]],
    'Chimney Sweeper': [[5, chimney], [1, speakers]],
    'Gate Keeper': [[3, chimney], [1, graves]],
    'Scratching for Scraps': [[4, crate], [2, speakers]],
    'Like a Hurricane': [[2, crate], [1, speakers]],
    'Sipping on Cactus': [[5, saguaro], [3, pear], [3, match]],
    'Unburied Hatchets': [[5, deadTree], [1, graves]],
    'The Hellhounds': [[3, graves], [1, skull], [2, fogPatch]],
    'Existential Crisis': [[3, graves], [2, hourglass]],
    'Body Bags on the Hills': [[6, bag], [1, carrion]],
    'The Stench Orbits the Homestead': [[4, bag], [2, carrion], [1, wheel]],
    'Came to Collect His Debt': [[2, graves], [1, speakers]],
  };
  return (x, z, rand) => {
    const local = bySection[sectionAt(x, z)] ?? [];
    return pick(rand, [...general, ...local])(x, z, rand);
  };
}

/** The start's sign. */
const reaperFace = once(() => signFace(['THE GRIM REAPER']));

/**
 * I'm the grim reaper: the start line between two towering stacks of
 * speakers, their cones pumping on the kick, a black beam across with THE
 * GRIM REAPER on it in gold, and laid along the top of it a golden scythe,
 * its blade curving down over the road.
 */
export function scytheGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const size = 3;
  const H = size * 3;
  for (const side of [-1, 1]) {
    const stack = speakerStack(3, size, animated, side * 0.25);
    stack.position.set(side * (hw + size / 2), 0, 0);
    // Facing down the road at whoever's coming.
    stack.rotation.y = Math.PI;
    g.add(stack);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 2 * size, 1, 1.2), blackGloss());
  beam.position.y = H + 0.5;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 2 * size + 0.1, 0.18, 1.3), tarnish());
  trim.position.y = H + 1;
  const sign = signPanel(12, reaperFace());
  sign.scale.y = 0.5;
  sign.position.y = H - 1.4;
  g.add(beam, trim, sign);
  // A skull on each stack, its eyes lit red.
  const eyes: THREE.Sprite[] = [];
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), bone());
    head.scale.set(1, 1.1, 1.05);
    head.position.set(side * (hw + size / 2), H + 1.1, 0);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1), bone());
    jaw.position.set(side * (hw + size / 2), H + 0.45, -0.3);
    g.add(head, jaw);
    for (const e of [-1, 1]) {
      const eye = sprite(0xff1a08, 1, 0.9);
      eye.position.set(side * (hw + size / 2) + e * 0.38, H + 1.2, -1.05);
      g.add(eye);
      eyes.push(eye);
    }
  }
  // The scythe, laid along the beam, its blade hanging out over the far side of the road.
  const scythe = scytheFigure(2 * hw + 6);
  scythe.rotation.z = -Math.PI / 2;
  scythe.position.set(-(hw + 3), H + 1.6, 0);
  g.add(scythe);
  const glow = sprite(SUN_HEX, 10, 0.25);
  glow.position.set(hw, H + 1, 0);
  g.add(glow);
  animated.push((time) => {
    glow.material.opacity = 0.15 + 0.25 * kick(time);
    eyes.forEach((e) => (e.material.opacity = 0.55 + 0.4 * kick(time)));
  });
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * Chimney sweeper: the chimneys of burnt-out houses all along both sides
 * of the snath from `s` to `to`, soot-black brick, a sweep's brush stuck
 * out of the odd one, a fire still glowing in their mouths, belching black
 * smoke that heaves on the kick.
 */
export function chimneys(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(7201);
  const puffs: { p: THREE.Sprite; h: number; ph: number }[] = [];
  let k = 0;
  for (let at = s; at < to; at += 16, k++) {
    const side = k % 2 ? 1 : -1;
    const off = ribbon.halfWidthAtS(at) + 5 + rand() * 6;
    const where = offRoad(ribbon, at, side * off);
    const t = new THREE.Group();
    const h = 9 + rand() * 7;
    const stack = new THREE.Mesh(new THREE.BoxGeometry(2.2, h, 2.2), brick());
    stack.position.y = h / 2;
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 2.6), soot());
    top.position.y = h - 0.35;
    t.add(stack, top);
    for (let p = 0; p < 2; p++) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.4, 8), soot());
      pot.position.set(p ? 0.55 : -0.55, h + 0.7, 0);
      t.add(pot);
    }
    if (k % 3 === 0) {
      // The sweep's brush, its pole up out of the pot, its bristles a black wheel.
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4, 5), wood());
      pole.position.set(0.55, h + 2.4, 0);
      pole.rotation.z = 0.25;
      const brush = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.18, 14), soot());
      brush.position.set(0.05, h + 4.3, 0);
      brush.rotation.z = 0.25;
      t.add(pole, brush);
    }
    const mouth = sprite(EMBER_HEX, 3, 0.55);
    mouth.position.y = h + 1.2;
    t.add(mouth);
    for (let p = 0; p < 5; p++) {
      const sp = smoke(0x060404, 4, 0.8);
      t.add(sp);
      puffs.push({ p: sp, h, ph: p / 5 + rand() });
    }
    t.position.set(where.x, 0, where.z);
    t.rotation.y = where.heading;
    g.add(t);
  }
  animated.push((time) => {
    const kk = kick(time);
    for (const { p, h, ph } of puffs) {
      const v = (time * 0.22 + ph) % 1;
      p.position.set(v * 6, h + 1.5 + v * 16, Math.sin(v * 4 + ph) * 1.2);
      p.scale.setScalar(3 + v * 11 + kk * (1 - v) * 2.5);
      p.material.opacity = 0.8 * (1 - v * v);
    }
  });
  return g;
}

const keeperFace = once(() => signFace(['GATE KEEPER']));

/**
 * Gate keeper: his gate, on the bridge where the snath crosses the
 * hellhound pit. Two stone pillars with a skull on each, their eyes lit
 * red; a wrought iron arch between them with the keeper's ring of keys
 * hanging from its middle; the two gate leaves swung back open against the
 * bridge's rails; a lantern on each pillar.
 */
export function keeperGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1;
  const H = 8;
  const pillarMat = lambert(0x4a4440);
  const eyes: THREE.Sprite[] = [];
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.8, H, 1.8), pillarMat);
    pillar.position.set(side * (hw + 0.9), H / 2, 0);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.5, 2.3), pillarMat);
    cap.position.set(side * (hw + 0.9), H + 0.25, 0);
    const skullHead = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), bone());
    skullHead.scale.set(1, 1.1, 1.05);
    skullHead.position.set(side * (hw + 0.9), H + 1.3, 0);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.9), bone());
    jaw.position.set(side * (hw + 0.9), H + 0.7, -0.25);
    g.add(pillar, cap, skullHead, jaw);
    for (const e of [-1, 1]) {
      const eye = sprite(0xff2a10, 0.9, 0.9);
      eye.position.set(side * (hw + 0.9) + e * 0.32, H + 1.4, -0.9);
      g.add(eye);
      eyes.push(eye);
    }
    // The leaf, swung open back against the rail: iron bars with spikes.
    const leaf = new THREE.Group();
    for (let b = 0; b < 7; b++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, H - 1.5, 5), iron());
      bar.position.set(0, (H - 1.5) / 2, b * 0.8);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 5), gold());
      spike.position.set(0, H - 1.25, b * 0.8);
      leaf.add(bar, spike);
    }
    for (const y of [0.6, H * 0.45, H - 2]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 5.2), iron());
      rail.position.set(0, y, 2.4);
      leaf.add(rail);
    }
    leaf.position.set(side * (hw - 0.2), 0, 0.9);
    g.add(leaf);
  }
  // The arch: a curve of iron from pillar to pillar, scrolls along it, the sign hung under its crown.
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-(hw + 0.9), H + 0.4, 0), new THREE.Vector3(0, H + 7, 0), new THREE.Vector3(hw + 0.9, H + 0.4, 0));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.22, 6), iron()));
  const curve2 = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-(hw + 0.9), H - 0.6, 0), new THREE.Vector3(0, H + 5, 0), new THREE.Vector3(hw + 0.9, H - 0.6, 0));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve2, 24, 0.14, 6), gold()));
  const sign = signPanel(8, keeperFace());
  sign.scale.y = 0.55;
  sign.position.y = H + 1.4;
  g.add(sign);
  // The keys, on their ring, swinging.
  const ring = new THREE.Group();
  ring.position.y = H + 3.4;
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.08, 6, 20), gold());
  loop.position.y = -0.8;
  ring.add(loop);
  for (let k = 0; k < 4; k++) {
    const key = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.06), gold());
    shaft.position.y = -0.8;
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 5, 12), gold());
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.06), gold());
    bit.position.set(0.18, -1.45, 0);
    key.add(shaft, bow, bit);
    key.position.set((k - 1.5) * 0.35, -1.5, 0);
    key.rotation.z = (k - 1.5) * 0.25;
    ring.add(key);
  }
  g.add(ring);
  const lanterns: THREE.Sprite[] = [];
  for (const side of [-1, 1]) {
    const l = sprite(0xff4a18, 3.5, 0.8);
    l.position.set(side * (hw + 0.9), H - 1, -1.2);
    g.add(l);
    lanterns.push(l);
  }
  animated.push((time) => {
    ring.rotation.z = 0.12 * Math.sin(time * 1.3);
    eyes.forEach((e) => (e.material.opacity = 0.6 + 0.35 * kick(time)));
    lanterns.forEach((l, k) => (l.material.opacity = 0.7 + 0.1 * Math.sin(time * 9 + k * 2)));
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The reaper's medallion: a gold disc with a scythe across it and a dollar sign. */
const medallionFace = once(() => {
  const S = 128;
  const [c, ctx] = canvas(S);
  const g = ctx.createRadialGradient(S * 0.4, S * 0.35, 4, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#fff2b0');
  g.addColorStop(0.6, '#f0b830');
  g.addColorStop(1, '#8a5a10');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a3808';
  ctx.font = `900 ${S * 0.7}px Impact, 'Arial Black', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', S / 2, S / 2 + 4);
  return finish(c, false);
});

/** A turntable's record, spinning: black with grooves and a gold label. */
const recordFace = once(() => {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#0a0808';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,110,120,0.35)';
  for (let r = 40; r < S / 2 - 4; r += 3) {
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#f0b830';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1010';
  ctx.font = '900 16px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('IN THE ORIENT', S / 2, S / 2 - 6);
  ctx.fillText('1974', S / 2, S / 2 + 14);
  // A white sticker on the sleeve's edge, the dollar-bin price.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(S * 0.72, S * 0.2, 26, 16);
  ctx.fillStyle = '#c01818';
  ctx.font = '900 13px sans-serif';
  ctx.fillText('$1', S * 0.72 + 13, S * 0.2 + 13);
  return finish(c, false);
});

/**
 * The grim reaper himself, come to collect: a skeleton half as tall again
 * as anything else on the frontier, in a black tracksuit with stripes of
 * tarnished gold, its hood up, the skull under it grinning with teeth gone
 * dark gold, its eye sockets hollow and burning red; a heavy chain of
 * tarnished gold, two ropes of it, and a medallion; the mic in one hand
 * and in the other his scythe, its gold gone dark and its edge bloodied,
 * leant out over the road so the blade hangs over the karts going under
 * it. He nods slowly, on every other beat, behind his turntables (records
 * of the 1974 world-music LP he sampled spinning on them), a speaker stack
 * either side, a red glow on the ground under him. He stands `lateral`
 * off the road at `s` (inside his blade's curve), facing back along it at
 * the karts coming round.
 */
export function reaperMC(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const off = lateral || -(ribbon.halfWidthAtS(s) + 26);
  const at = offRoad(ribbon, s, off);
  const suit = new THREE.MeshPhongMaterial({ color: 0x0c0a0c, specular: 0x302830, shininess: 25 });
  const stripe = tarnish();
  const T = 3; // the scale of him: nearly 50 m tall.
  // The DJ table, his decks on it.
  const table = new THREE.Mesh(new THREE.BoxGeometry(16, 3.6, 5), blackGloss());
  table.position.set(0, 1.8, 4);
  const tableTrim = new THREE.Mesh(new THREE.BoxGeometry(16.2, 0.3, 5.2), tarnish());
  tableTrim.position.set(0, 3.6, 4);
  g.add(table, tableTrim);
  const platters: THREE.Mesh[] = [];
  for (const x of [-4.5, 4.5]) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 4.2), lambert(0x2a2628));
    deck.position.set(x, 3.9, 4);
    const platter = new THREE.Mesh(new THREE.CircleGeometry(1.8, 32), new THREE.MeshBasicMaterial({ map: recordFace() }));
    platter.rotation.x = -Math.PI / 2;
    platter.position.set(x, 4.12, 4);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2.2), tarnish());
    arm.position.set(x + 2, 4.3, 4);
    arm.rotation.y = 0.4;
    g.add(deck, platter, arm);
    platters.push(platter);
  }
  const mixer = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 3.6), lambert(0x3a3438));
  mixer.position.set(0, 3.95, 4);
  g.add(mixer);
  for (const x of [-12, 12]) {
    const stack = speakerStack(4, 3.4, animated, x > 0 ? 0.1 : 0);
    stack.position.set(x, 0, 3);
    g.add(stack);
  }
  // Him: legs, the tracksuit, the chain, arms, the hooded skull.
  const body = new THREE.Group();
  for (const x of [-1.6, 1.6]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.1 * T, 0.9 * T, 6 * T, 10), suit);
    leg.position.set(x * T, 3 * T, 0);
    const legStripe = new THREE.Mesh(new THREE.BoxGeometry(0.18 * T, 6 * T, 0.18 * T), stripe);
    legStripe.position.set(x * T + Math.sign(x) * 1.05 * T, 3 * T, 0);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(1.8 * T, 0.9 * T, 3 * T), lambert(0x1a1616));
    shoe.position.set(x * T, 0.45 * T, 0.5 * T);
    body.add(leg, legStripe, shoe);
  }
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(3.3 * T, 2.6 * T, 6.4 * T, 12), suit);
  torso.position.y = 9.2 * T;
  const zip = new THREE.Mesh(new THREE.BoxGeometry(0.22 * T, 6.4 * T, 0.2 * T), stripe);
  zip.position.set(0, 9.2 * T, 3 * T);
  body.add(torso, zip);
  // The chain: two heavy ropes of tarnished gold round the neck, the medallion on his chest.
  for (const [r, y, z, tilt] of [
    [2.3, 11.2, 1.2, 1.15],
    [2.7, 10.4, 1.5, 1.05],
  ]) {
    const chain = new THREE.Mesh(new THREE.TorusGeometry(r * T, 0.38 * T, 8, 28), stripe);
    chain.rotation.x = tilt;
    chain.position.set(0, y * T, z * T);
    body.add(chain);
  }
  const medallion = new THREE.Mesh(new THREE.CircleGeometry(1.3 * T, 28), new THREE.MeshPhongMaterial({ map: medallionFace(), color: 0x5a4830, emissive: 0x060300, shininess: 30, specular: 0x605030 }));
  medallion.position.set(0, 8.9 * T, 3.1 * T);
  body.add(medallion);
  // The arms: the right up with the mic, the left holding the scythe out over the road.
  const armGeo = new THREE.CylinderGeometry(0.75 * T, 0.65 * T, 5 * T, 8);
  const handGeo = new THREE.SphereGeometry(0.75 * T, 10, 8);
  const micArm = new THREE.Group();
  micArm.position.set(3.2 * T, 11.6 * T, 0);
  const upper = new THREE.Mesh(armGeo, suit);
  upper.position.set(0.8 * T, -2 * T, 0.6 * T);
  upper.rotation.set(-0.5, 0, 0.35);
  const fore = new THREE.Mesh(armGeo, suit);
  fore.position.set(0.1 * T, -2.2 * T, 3 * T);
  fore.rotation.set(-1.9, 0, -0.5);
  const hand = new THREE.Mesh(handGeo, bone());
  hand.position.set(-0.6 * T, -0.6 * T, 4.6 * T);
  const mic = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * T, 0.2 * T, 2.4 * T, 8), stripe);
  const grille = new THREE.Mesh(new THREE.SphereGeometry(0.55 * T, 10, 8), lambert(0x5a5652));
  grille.position.y = 1.4 * T;
  mic.add(handle, grille);
  mic.position.set(-1.2 * T, 0.2 * T, 4.4 * T);
  mic.rotation.set(0.4, 0, 0.9);
  micArm.add(upper, fore, hand, mic);
  const scytheArm = new THREE.Group();
  scytheArm.position.set(-3.2 * T, 11.6 * T, 0);
  const sUpper = new THREE.Mesh(armGeo, suit);
  sUpper.position.set(-0.4 * T, -2.2 * T, 0.6 * T);
  sUpper.rotation.set(-0.3, 0, -0.2);
  const sFore = new THREE.Mesh(armGeo, suit);
  sFore.position.set(-0.1 * T, -1.8 * T, 2.8 * T);
  sFore.rotation.set(-1.5, 0, 0.3);
  const sHand = new THREE.Mesh(handGeo, bone());
  sHand.position.set(0.1 * T, -1.8 * T, 5.1 * T);
  const scythe = scytheFigure(24 * T);
  // Held at the grip and leant out toward the road, the blade high over it.
  scythe.position.set(0.1 * T, -9 * T, 3 * T);
  scythe.rotation.set(SCYTHE_LEAN, 0, 0.25);
  scytheArm.add(sUpper, sFore, sHand, scythe);
  body.add(micArm, scytheArm);
  // The skull: grey bone, its teeth gone dark gold, hollow eyes burning, under its hood.
  const head = new THREE.Group();
  head.position.y = 14.6 * T;
  // Long and gaunt, grey, the jaw hanging.
  const skullBone = lambert(0x8a8278);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(2.3 * T, 18, 14), skullBone);
  skull.scale.set(0.86, 1.15, 1);
  const cheek = new THREE.Mesh(new THREE.BoxGeometry(2.5 * T, 1.5 * T, 2.8 * T), skullBone);
  cheek.position.set(0, -1.9 * T, 0.7 * T);
  const hollow = lambert(0x050303);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.4 * T, 0.8 * T, 3), hollow);
  nose.position.set(0, -0.6 * T, 2.38 * T);
  nose.rotation.x = Math.PI;
  const grin = new THREE.Group();
  for (let k = 0; k < 8; k++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.26 * T, 0.6 * T, 0.2 * T), k % 3 === 1 ? skullBone : stripe);
    tooth.position.set((k - 3.5) * 0.29 * T, -2.1 * T, 2.12 * T);
    grin.add(tooth);
  }
  const eyes: THREE.Sprite[] = [];
  for (const x of [-1, 1]) {
    // The socket, a black hollow, and the fire deep in it.
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.62 * T, 12, 10), hollow);
    socket.scale.set(0.95, 0.75, 0.5);
    socket.position.set(x * 0.78 * T, 0.1 * T, 2.02 * T);
    const fire = sprite(0xff1a08, 1.1 * T, 1);
    fire.position.set(x * 0.78 * T, 0.05 * T, 2.35 * T);
    const halo = sprite(0x900804, 2.6 * T, 0.45);
    halo.position.set(x * 0.78 * T, 0.05 * T, 2.55 * T);
    head.add(socket, fire, halo);
    eyes.push(fire, halo);
  }
  // The hood: drawn close round the face, its brow low over the eyes, peaked behind.
  const hood = new THREE.Mesh(new THREE.SphereGeometry(2.9 * T, 18, 14, Math.PI * 0.68, Math.PI * 1.64, 0, Math.PI * 0.74), new THREE.MeshLambertMaterial({ color: 0x0a080a, side: THREE.DoubleSide }));
  hood.position.set(0, 0.5 * T, 0.2 * T);
  hood.scale.set(1, 1.1, 1);
  const brow = new THREE.Mesh(new THREE.SphereGeometry(2.95 * T, 18, 8, Math.PI * 0.25, Math.PI * 0.5, 0, Math.PI * 0.28), new THREE.MeshLambertMaterial({ color: 0x0a080a, side: THREE.DoubleSide }));
  brow.position.set(0, 0.5 * T, 0.35 * T);
  brow.scale.set(1, 1.1, 1);
  head.add(brow);
  const peak = new THREE.Mesh(new THREE.ConeGeometry(1.4 * T, 2.6 * T, 10), suit);
  peak.position.set(0, 2.9 * T, -1.4 * T);
  peak.rotation.x = -0.6;
  const drape = new THREE.Mesh(new THREE.CylinderGeometry(2.9 * T, 3.4 * T, 2.4 * T, 16, 1, true), new THREE.MeshLambertMaterial({ color: 0x0a080a, side: THREE.DoubleSide }));
  drape.position.y = -2.2 * T;
  head.add(skull, cheek, nose, grin, hood, peak, drape);
  body.add(head);
  body.position.z = -3 * T;
  g.add(body);
  // A red glow on the ground under him.
  const pool = sprite(SUN_HEX, 40, 0.3);
  pool.position.set(0, 2, 6);
  g.add(pool);
  animated.push((time) => {
    // The nod: slow, on every other beat, down and held, up again.
    const b2 = (time * BEAT * 0.5) % 1;
    head.rotation.x = 0.06 + 0.2 * (0.5 - 0.5 * Math.cos(b2 * Math.PI * 2)) ** 2;
    body.position.y = -0.6 * (0.5 - 0.5 * Math.cos(b2 * Math.PI * 2));
    micArm.rotation.z = 0.04 * Math.sin(time * BEAT * Math.PI * 0.5);
    scythe.rotation.x = SCYTHE_LEAN + 0.03 * Math.sin(time * 0.4);
    platters.forEach((p, k) => (p.rotation.z = -time * 3 * (k ? 1 : 1.05) + (k ? 0 : 0.4 * Math.sin(time * BEAT * Math.PI * 2))));
    const burn = 0.75 + 0.25 * Math.sin(time * 2.1) * Math.sin(time * 7.3);
    eyes.forEach((e, k) => (e.material.opacity = (k % 2 ? 0.45 : 1) * burn));
    pool.material.opacity = 0.2 + 0.12 * kick(time);
  });
  g.position.set(at.x, Math.max(0, ribbon.heightAt(s) - 1), at.z);
  // Facing the road back the way the karts come round to him, so they see him coming.
  const L = ribbon.spline.length;
  const toward = pointAt(ribbon.spline, (((s - 90) % L) + L) % L);
  g.rotation.y = Math.atan2(toward.x - at.x, toward.z - at.z);
  return g;
}

/** How far the reaper leans his scythe out toward the road. */
const SCYTHE_LEAN = 0.55;

/** The sun gone dark: a dull blood-red disc, darker to its rim, banded by black haze. */
const sunFace = once(() => {
  const S = 256;
  const [c, ctx] = canvas(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#d02a14');
  g.addColorStop(0.5, '#9a1008');
  g.addColorStop(0.85, '#4a0404');
  g.addColorStop(1, 'rgba(60,4,4,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // Bands of haze across the lower half.
  ctx.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = `rgba(0,0,0,${0.25 + k * 0.08})`;
    ctx.fillRect(0, S * (0.56 + k * 0.075), S, 4 + k * 2);
  }
  return finish(c, false);
});

/** A wicked man's silhouette: hat, coat, gun at his hip, flat black. */
function wickedMan(h: number, rand: () => number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const coat = new THREE.Mesh(new THREE.ConeGeometry(h * 0.2, h * 0.62, 6), mat);
  coat.position.y = h * 0.42;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(h * 0.2, h * 0.3, h * 0.1), mat);
  legs.position.y = h * 0.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.08, 8, 6), mat);
  head.position.y = h * 0.8;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.18, h * 0.18, h * 0.02, 10), mat);
  brim.position.y = h * 0.86;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.07, h * 0.09, h * 0.12, 8), mat);
  crown.position.y = h * 0.92;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(h * 0.04, h * 0.04, h * 0.2), mat);
  gun.position.set(h * 0.2, h * 0.38, h * 0.05);
  g.add(coat, legs, head, brim, crown, gun);
  if (rand() < 0.5) {
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(h * 0.03, h * 0.5, h * 0.03), mat);
    rifle.position.set(-h * 0.18, h * 0.62, 0);
    rifle.rotation.z = 0.3;
    g.add(rifle);
  }
  return g;
}

/**
 * Heaven sent the silhouette of many wicked men: straight ahead up the
 * ridge from `s`, far off past the edge of the world, the sun gone dark
 * blood red and huge on the horizon behind black cloud drifting across it,
 * and black against it a row of wicked men on a ridge, fearless, hats and
 * guns, waiting on their reckoning, a gallows tree among them with one
 * already hanging; vultures and crows wheeling across it.
 */
export function wickedSun(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const D = 640;
  const R = 120;
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, 2 * R), new THREE.MeshBasicMaterial({ map: sunFace(), transparent: true, depthWrite: false, fog: false }));
  sun.position.set(0, R * 0.55, D + 40);
  sun.rotation.y = Math.PI;
  const halo = sprite(SUN_HEX, R * 3.6, 0.3, false);
  halo.position.set(0, R * 0.53, D + 60);
  g.add(halo, sun);
  // Black cloud across it, drifting.
  const clouds: THREE.Sprite[] = [];
  for (let k = 0; k < 7; k++) {
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x040203, transparent: true, depthWrite: false, opacity: 0.85, fog: false }));
    cloud.scale.set(R * (1.6 + (k % 3) * 0.4), R * 0.35, 1);
    cloud.userData.y = R * (0.2 + (k % 4) * 0.28);
    cloud.userData.ph = k * 0.9;
    g.add(cloud);
    clouds.push(cloud);
  }
  const black = new THREE.MeshBasicMaterial({ color: 0x0c0406, fog: false });
  // Their ridge, and them on it.
  // Up high enough to stand clear over the edge of the world.
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(260, 300, 60, 24, 1, false, Math.PI * 0.75, Math.PI * 0.5), black);
  ridge.position.set(0, 2, D - 240 + 300);
  g.add(ridge);
  const rand = seededRandom(7301);
  const men: THREE.Group[] = [];
  for (let k = 0; k < 9; k++) {
    const man = wickedMan(30 + rand() * 10, rand, black);
    man.position.set((k - 4) * 30 + (rand() - 0.5) * 8, 31, D - 250 + Math.abs(k - 4) * 6);
    man.rotation.y = Math.PI + (rand() - 0.5) * 0.6;
    g.add(man);
    men.push(man);
  }
  // The gallows tree on the ridge, and the one hanging from it.
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2, 46, 6), black);
  trunk.position.y = 23;
  const bough = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 26, 5), black);
  bough.rotation.z = Math.PI / 2 - 0.25;
  bough.position.set(12, 40, 0);
  const hanged = new THREE.Group();
  hanged.position.set(20, 41, 0);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7, 4), black);
  rope.position.y = -3.5;
  const hung = new THREE.Mesh(new THREE.CapsuleGeometry(1.6, 9, 4, 8), black);
  hung.position.y = -12;
  hanged.add(rope, hung);
  tree.add(trunk, bough, hanged);
  tree.position.set(-150, 31, D - 230);
  tree.rotation.y = Math.PI;
  g.add(tree);
  const birds: THREE.Mesh[] = [];
  for (let k = 0; k < 9; k++) {
    const bird = new THREE.Mesh(new THREE.BoxGeometry(k < 3 ? 14 : 7, 0.6, 2.4), black);
    g.add(bird);
    birds.push(bird);
  }
  animated.push((time) => {
    halo.material.opacity = 0.26 + 0.05 * Math.sin(time * 0.4);
    clouds.forEach((cl) => cl.position.set(((time * 3 + (cl.userData.ph as number) * 90) % 360) - 180, cl.userData.y as number, D + 20));
    hanged.rotation.z = 0.04 * Math.sin(time * 0.5);
    men.forEach((m, k) => (m.rotation.z = 0.015 * Math.sin(time * 0.6 + k)));
    birds.forEach((b, k) => {
      const a = time * (k < 3 ? 0.12 : 0.2) + (k * Math.PI * 2) / (k < 3 ? 3 : 6);
      const r = k < 3 ? 140 : 70 + k * 6;
      b.position.set(Math.cos(a) * r, (k < 3 ? 120 : 90) + 18 * Math.sin(a * 2 + k), D - 120 + Math.sin(a) * 60);
      b.rotation.z = 0.4 * Math.sin(time * 3 + k);
    });
  });
  g.position.set(f.x, 0, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The cheque: yellowed and stained, made out to the grim reaper, priceless, signed in blood, a bloody thumbprint on it. */
const chequeFace = once(() => {
  const W = 1024;
  const H = 440;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#c8b890');
  g.addColorStop(1, '#8a7a58');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#7a5a20';
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, W - 60, H - 60);
  ctx.fillStyle = '#3a2410';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '900 44px Georgia, serif';
  ctx.fillText('FIRST BANK OF THE FRONTIER', 60, 90);
  ctx.font = 'italic 32px Georgia, serif';
  ctx.fillText('Pay to the order of', 60, 170);
  ctx.font = '900 64px Impact, sans-serif';
  ctx.fillStyle = '#1a1010';
  ctx.fillText('THE GRIM REAPER', 360, 172);
  ctx.strokeStyle = '#3a2410';
  ctx.beginPath();
  ctx.moveTo(350, 182);
  ctx.lineTo(W - 220, 182);
  ctx.stroke();
  // The amount: in its box.
  ctx.strokeRect(W - 200, 120, 150, 70);
  ctx.font = '900 40px Georgia, serif';
  ctx.fillText('$ ∞', W - 175, 170);
  ctx.font = 'italic 36px Georgia, serif';
  ctx.fillText('One soul, and the debt in full — priceless', 60, 260);
  ctx.beginPath();
  ctx.moveTo(60, 272);
  ctx.lineTo(W - 60, 272);
  ctx.stroke();
  ctx.font = '28px Georgia, serif';
  ctx.fillText('Memo: rotting flesh odorous', 60, 370);
  // The signature, a scrawl in blood, running.
  ctx.strokeStyle = '#7a0606';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(W - 420, 360);
  for (let k = 0; k < 14; k++) ctx.quadraticCurveTo(W - 410 + k * 24, 320 + (k % 2) * 70, W - 400 + k * 24 + 10, 360 - (k % 3) * 10);
  ctx.stroke();
  ctx.fillStyle = '#6a0404';
  for (let k = 0; k < 7; k++) {
    const x = W - 400 + k * 46;
    const len = 20 + ((k * 37) % 50);
    ctx.fillRect(x, 362, 3, len);
    ctx.beginPath();
    ctx.arc(x + 1.5, 362 + len, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // A bloody thumbprint, and stains.
  ctx.fillStyle = 'rgba(110,8,6,0.75)';
  ctx.beginPath();
  ctx.ellipse(130, 120, 26, 34, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(60,40,20,0.35)';
  for (const [x, y, r] of [[300, 330, 60], [700, 90, 45], [880, 300, 70]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.font = 'italic 22px Georgia, serif';
  ctx.fillStyle = '#3a2410';
  ctx.fillText('G. Reaper', W - 280, 400);
  return finish(c, false);
});

const bankFace = once(() => signFace(['BANK'], '#0e0806', '#8a7a5a'));

/**
 * The grim reaper cashes the cheque: a frontier bank `lateral` off the road
 * at `s`, charred and dark, its false front high over the porch with BANK
 * across it, barred windows lit dull red, a lamp guttering on the porch,
 * and leaning against it facing the karts a cheque the size of a wagon made
 * out to the grim reaper, priceless, signed in blood; sacks of tarnished
 * coin by the door.
 */
export function chequeBank(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const off = lateral || -(ribbon.halfWidthAtS(s) + 22);
  const at = offRoad(ribbon, s, off);
  const plank = lambert(0x3a2e26);
  const house = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 11), plank);
  house.position.set(0, 4, -3);
  const front = new THREE.Mesh(new THREE.BoxGeometry(18, 13, 0.6), lambert(0x2a201a));
  front.position.set(0, 6.5, 2.6);
  const sign = signPanel(12, bankFace());
  sign.scale.y = 0.5;
  sign.position.set(0, 11, 3.1);
  sign.rotation.y = Math.PI;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(18, 0.4, 4), darkWood());
  roof.position.set(0, 5.2, 4.8);
  g.add(house, front, sign, roof);
  for (const x of [-8, -3, 3, 8]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.4), darkWood());
    post.position.set(x, 2.5, 6.6);
    g.add(post);
  }
  for (const x of [-5.5, 5.5]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.6), new THREE.MeshBasicMaterial({ color: 0x6a1408 }));
    win.position.set(x, 3.6, 2.95);
    g.add(win);
    for (let b = 0; b < 5; b++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), iron());
      bar.position.set(x - 1.2 + b * 0.6, 3.6, 3.05);
      g.add(bar);
    }
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4), lambert(0x3a2014));
  door.position.set(0, 2, 2.95);
  g.add(door);
  // The cheque, propped up facing the road.
  const cheque = new THREE.Mesh(new THREE.PlaneGeometry(20, 8.6), new THREE.MeshBasicMaterial({ map: chequeFace(), side: THREE.DoubleSide }));
  cheque.position.set(0, 5.4, 13);
  cheque.rotation.x = -0.18;
  const easel = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), darkWood());
  easel.position.set(0, 3, 11.4);
  easel.rotation.x = 0.4;
  g.add(cheque, easel);
  const sackMat = lambert(0x5a4a38);
  const coinMat = tarnish();
  for (let k = 0; k < 4; k++) {
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), sackMat);
    sack.scale.set(1, 1.2, 1);
    sack.position.set(-9 + k * 1.3, 1, 8 + (k % 2) * 1.2);
    g.add(sack);
  }
  const pile = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.4, 14), coinMat);
  pile.position.set(9, 0.7, 9);
  g.add(pile);
  // A lamp guttering red on the porch.
  const sparkle = sprite(EMBER_HEX, 5, 0.4);
  sparkle.position.set(-7, 4.4, 6.6);
  g.add(sparkle);
  animated.push((time) => (sparkle.material.opacity = 0.25 + 0.25 * Math.abs(Math.sin(time * 1.3) * Math.sin(time * 7))));
  g.position.set(at.x, Math.max(0, ribbon.heightAt(s) - 0.5), at.z);
  // Facing the road back the way the karts come, the cheque toward them.
  const L = ribbon.spline.length;
  const toward = pointAt(ribbon.spline, (((s - 60) % L) + L) % L);
  g.rotation.y = Math.atan2(toward.x - at.x, toward.z - at.z);
  return g;
}

/**
 * Whiplash in the fortress: the fortress of the wicked, black stone walls
 * spiked with iron along both sides of the road from `s` to `to`, a tower
 * either side at each end with a black and red flag and a torch guttering
 * on it, and a spiked gatehouse over the road where it goes in, a whip and
 * a skull hung from it.
 */
export function fortress(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const wallMat = adobe();
  const H = 6;
  const flags: THREE.Mesh[] = [];
  const flagMat = new THREE.MeshLambertMaterial({ color: 0x4a0606, side: THREE.DoubleSide });
  const spikeGeo = new THREE.ConeGeometry(0.28, 1.8, 5);
  const torches: THREE.Sprite[] = [];
  const tower = (x: number, z: number, y: number, heading: number) => {
    const t = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, H + 6, 5), wallMat);
    body.position.y = (H + 6) / 2;
    t.add(body);
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 1.2), wallMat);
      merlon.position.set(dx, H + 6.7, dz);
      const spike = new THREE.Mesh(spikeGeo, iron());
      spike.position.set(dx, H + 8.3, dz);
      t.add(merlon, spike);
    }
    const torch = sprite(0xff5018, 4, 0.8);
    torch.position.set(0, H + 7.5, -2.8);
    t.add(torch);
    torches.push(torch);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5, 5), darkWood());
    pole.position.y = H + 8.5;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.8, 6, 1), flagMat);
    flag.position.set(1.5, H + 10, 0);
    t.add(pole, flag);
    flags.push(flag);
    t.position.set(x, y, z);
    t.rotation.y = heading;
    g.add(t);
  };
  for (const end of [s, to]) {
    for (const side of [-1, 1]) {
      const at = offRoad(ribbon, end, side * (ribbon.halfWidthAtS(end) + 4.5));
      tower(at.x, at.z, Math.max(0, ribbon.heightAt(end)), at.heading);
    }
  }
  // The walls, in lengths along both sides, at the road's height.
  for (let at = s + 6; at < to - 4; at += 7) {
    for (const side of [-1, 1]) {
      const p = offRoad(ribbon, at, side * (ribbon.halfWidthAtS(at) + 3.5));
      const y = Math.max(0, ribbon.heightAt(at));
      const seg = new THREE.Group();
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.6, H + y, 7.4), wallMat);
      wall.position.y = (H + y) / 2;
      seg.add(wall);
      for (const dz of [-2.4, -0.8, 0.8, 2.4]) {
        const spike = new THREE.Mesh(spikeGeo, iron());
        spike.position.set(0, H + y + 0.9, dz);
        seg.add(spike);
      }
      seg.position.set(p.x, 0, p.z);
      seg.rotation.y = p.heading;
      g.add(seg);
    }
  }
  // The gatehouse over the way in.
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const lintel = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 4, 3, 4), wallMat);
  beam.position.y = H + 4.5;
  lintel.add(beam);
  for (let k = -6; k <= 6; k++) {
    const spike = new THREE.Mesh(spikeGeo, iron());
    spike.scale.setScalar(1.6);
    spike.position.set((k * (2 * hw + 2)) / 13, H + 7.4, 0);
    lintel.add(spike);
  }
  const gateSkull = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), bone());
  gateSkull.position.set(0, H + 2.4, -2.2);
  lintel.add(gateSkull);
  // A whip coiled on it, hung over the way in.
  const whip = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 6, 24), darkWood());
  whip.position.set(0, H + 4.5, -2.1);
  lintel.add(whip);
  lintel.position.set(f.x, Math.max(0, f.y), f.z);
  lintel.rotation.y = f.heading;
  g.add(lintel);
  animated.push((time) => {
    torches.forEach((tc, k) => {
      const f = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.9 + k * 1.7) * Math.sin(time * 11 + k));
      tc.scale.set(3 * f, 4.4 * f, 1);
      tc.material.opacity = 0.35 + 0.55 * f;
    });
    flags.forEach((fl, k) => {
      const pos = fl.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, 0.35 * Math.sin(time * 4 + x * 1.6 + k) * ((x + 1.5) / 3));
      }
      pos.needsUpdate = true;
    });
  });
  return g;
}

/**
 * Body bags hanging on the hills, hoist with a peg: gallows posts close
 * along both sides of the road from `s` to `to`, a black bag on the peg of
 * each, swaying, the flies thick round them.
 */
export function bodyBags(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const bagMat = lambert(0x0e0c0e);
  const swingers: { o: THREE.Object3D; ph: number }[] = [];
  const flies: THREE.Sprite[] = [];
  let k = 0;
  for (let at = s; at < to; at += 8, k++) {
    const side = k % 2 ? 1 : -1;
    const p = offRoad(ribbon, at, side * (ribbon.halfWidthAtS(at) + 4));
    const y = Math.max(0, ribbon.heightAt(at));
    const t = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6 + y, 0.4), darkWood());
    post.position.y = (6 + y) / 2;
    const peg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 2.6), darkWood());
    // Out over the road's side.
    peg.position.set(0, 5.8 + y, 1.1);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 0.2), darkWood());
    brace.position.set(0, 5 + y, 0.5);
    brace.rotation.x = 0.7;
    const hang = new THREE.Group();
    hang.position.set(0, 5.6 + y, 2.2);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 4), lambert(0x8a7050));
    rope.position.y = -0.4;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.8, 4, 8), bagMat);
    body.position.y = -1.9;
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.9, 0.06), tarnish());
    zip.position.set(0, -1.9, 0.5);
    hang.add(rope, body, zip);
    t.add(post, peg, brace, hang);
    swingers.push({ o: hang, ph: k * 1.3 });
    for (let q = 0; q < 5; q++) {
      const fly = sprite(0x0a0a0a, 0.3, 0.9);
      fly.material.blending = THREE.NormalBlending;
      fly.userData = { y: 3.6 + y, ph: q * 2.1 + k };
      t.add(fly);
      flies.push(fly);
    }
    t.position.set(p.x, 0, p.z);
    // Its peg reaching toward the road.
    t.rotation.y = p.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    g.add(t);
  }
  animated.push((time) => {
    swingers.forEach(({ o, ph }) => (o.rotation.x = 0.1 * Math.sin(time * 0.8 + ph)));
    flies.forEach((f) => {
      const ph = f.userData.ph as number;
      f.position.set(Math.cos(time * 5 + ph) * 1.1, (f.userData.y as number) + 0.6 * Math.sin(time * 7 + ph), 2.2 + Math.sin(time * 5 + ph) * 1.1);
    });
  });
  return g;
}

/**
 * The stench orbits the homestead: a rotting timber farmhouse on a rise in
 * the middle of the loop (`lateral` off the road at `s`), its roof caved
 * in, its porch sagging, a window lit a sick yellow; the windmill broken,
 * its vanes snapped and hanging, creaking back and forth; a water tank on
 * stilts; round it all the stench, thick rings of sickly yellow-green haze
 * orbiting at three heights, and swarms of flies.
 */
export function homestead(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral || -(ribbon.halfWidthAtS(s) + 30));
  const rise = new THREE.Mesh(new THREE.SphereGeometry(22, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0x4a4440, { flatShading: true }));
  rise.scale.y = 0.18;
  g.add(rise);
  const y0 = 3.6;
  const plank = lambert(0x4a4036);
  const house = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 9), plank);
  house.rotation.z = 0.03;
  house.position.y = y0 + 3;
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-6.8, 0);
  roofShape.lineTo(0, 4);
  roofShape.lineTo(6.8, 0);
  roofShape.lineTo(-6.8, 0);
  // The roof caved in: half of it, the other half's rafters bare.
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 5, bevelEnabled: false }), lambert(0x2a221c));
  roof.position.set(0, y0 + 6, -5);
  roof.rotation.z = -0.06;
  g.add(roof);
  for (let k = 0; k < 5; k++) {
    const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 7.6), darkWood());
    rafter.rotation.set(0, 0, 0);
    rafter.rotation.x = 0;
    rafter.position.set(-6 + k * 3, y0 + 6.6 - Math.abs(-6 + k * 3) * 0.4, 1.8);
    rafter.rotation.y = Math.PI / 2;
    rafter.rotation.z = (k - 2) * 0.25;
    g.add(rafter);
  }
  const porch = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 3), darkWood());
  porch.position.set(0, y0 + 3.1, 6);
  porch.rotation.z = 0.09;
  g.add(house, porch);
  for (const x of [-5.5, 5.5]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 0.3), darkWood());
    post.position.set(x, y0 + 1.7, 7.3);
    g.add(post);
  }
  const win = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.6), new THREE.MeshBasicMaterial({ color: 0x8a8a30 }));
  win.position.set(-3, y0 + 3.4, 4.55);
  const chimneyStack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4, 1.4), brick());
  chimneyStack.position.set(3.5, y0 + 9, -1);
  g.add(win, chimneyStack);
  // The windmill.
  const mill = new THREE.Group();
  mill.position.set(-14, y0 - 1, -6);
  for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 14, 0.25), iron());
    leg.position.set(dx * 0.6, 7, dz * 0.6);
    leg.rotation.set(dz * 0.06, 0, -dx * 0.06);
    mill.add(leg);
  }
  const vanes = new THREE.Group();
  vanes.position.set(0, 14.5, 1);
  // Broken: most of its vanes snapped off, one hanging by a thread.
  const vaneMat = lambert(0x5a5650);
  for (const k of [0, 1, 4, 7, 8]) {
    const vane = new THREE.Mesh(new THREE.BoxGeometry(0.5, k === 4 ? 1.4 : 2.6, 0.05), vaneMat);
    vane.position.y = k === 4 ? 1.2 : 1.8;
    const holder = new THREE.Group();
    holder.add(vane);
    holder.rotation.z = (k / 12) * Math.PI * 2;
    vanes.add(holder);
  }
  const dangling = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.05), vaneMat);
  dangling.position.set(0.6, 12.6, 1.1);
  dangling.rotation.z = 0.2;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 2.6), vaneMat);
  tail.position.set(0, 14.5, -1.8);
  tail.rotation.x = 0.5;
  mill.add(vanes, tail, dangling);
  mill.rotation.z = 0.08;
  g.add(mill);
  const tank = new THREE.Group();
  tank.position.set(13, y0 - 1, -4);
  for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 0.3), darkWood());
    leg.position.set(dx, 3, dz);
    tank.add(leg);
  }
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.6, 14), plank);
  barrel.position.y = 7.8;
  const lid = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 14), darkWood());
  lid.position.y = 10.2;
  tank.add(barrel, lid);
  g.add(tank);
  // The stench, orbiting: puffs of sick green haze in rings at three heights, each ring round its own way.
  const rings: { group: THREE.Group; speed: number }[] = [];
  for (let r = 0; r < 3; r++) {
    const ring = new THREE.Group();
    ring.position.y = y0 + 2 + r * 4;
    ring.rotation.x = (r - 1) * 0.25;
    const R = 15 + r * 3;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: STENCH_HEX, transparent: true, depthWrite: false, opacity: 0.6 }));
      puff.scale.set(9, 5, 1);
      puff.position.set(Math.cos(a) * R, Math.sin(a * 3) * 0.8, Math.sin(a) * R);
      ring.add(puff);
    }
    g.add(ring);
    rings.push({ group: ring, speed: (r % 2 ? -1 : 1) * (0.35 + r * 0.1) });
  }
  const flies: THREE.Sprite[] = [];
  for (let k = 0; k < 60; k++) {
    const fly = sprite(0x0a0a0a, 0.5, 0.95);
    fly.material.blending = THREE.NormalBlending;
    g.add(fly);
    flies.push(fly);
  }
  animated.push((time) => {
    // Creaking back and forth in the wind, never round.
    vanes.rotation.z = 0.5 * Math.sin(time * 0.6) + 0.15 * Math.sin(time * 2.3);
    dangling.rotation.z = 0.2 + 0.25 * Math.sin(time * 0.9);
    for (const { group, speed } of rings) group.rotation.y = time * speed;
    flies.forEach((f, k) => {
      const a = time * (1.6 + (k % 5) * 0.3) + k;
      const R = 10 + (k % 7) * 1.6;
      f.position.set(Math.cos(a) * R, y0 + 4 + Math.sin(a * 2.3 + k) * 3, Math.sin(a) * R);
    });
  });
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.heading;
  return g;
}

const graveFace = once(() => {
  const W = 256;
  const H = 320;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#8a8478';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2a2420';
  ctx.textAlign = 'center';
  ctx.font = '900 30px Georgia, serif';
  ctx.fillText('HERE LIES', W / 2, 70);
  ctx.font = '900 40px Georgia, serif';
  ctx.fillText('TIME', W / 2, 140);
  ctx.font = 'italic 26px Georgia, serif';
  ctx.fillText('is priceless', W / 2, 185);
  ctx.font = '22px Georgia, serif';
  ctx.fillText('repent in small', W / 2, 250);
  ctx.fillText('increments', W / 2, 280);
  return finish(c, false);
});

/**
 * Time Is Priceless: the open grave the lane crosses on planks (on the
 * final lap; on the others there's only the grave). A crooked headstone at
 * its near end, HERE LIES TIME, older graves round it with their stones
 * sunk at a lean, the dug earth heaped beside it with a shovel stuck in, a
 * coffin open at the bottom in the dark, mist rising out of it, and an
 * hourglass on a post running out, its sand falling.
 */
export function openGrave(ribbon: Ribbon, s: number, pits: readonly PitDef[], animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const pit = pits.reduce((best, p) => (Math.hypot(p.x - f.x, p.z - f.z) < Math.hypot(best.x - f.x, best.z - f.z) ? p : best), pits[0]);
  if (!pit) return g;
  const L = pit.halfLength;
  const W = pit.halfWidth;
  const stone = lambert(0x5a5652);
  const head = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 0.6), stone);
  head.position.set(-W - 3, 2, -L - 1);
  head.rotation.z = 0.12;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), new THREE.MeshLambertMaterial({ map: graveFace() }));
  face.position.set(-W - 3, 2, -L - 1.31);
  face.rotation.y = Math.PI;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.6, 16, 1, false, 0, Math.PI), stone);
  top.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  top.position.set(-W - 3, 4, -L - 1);
  face.rotation.z = -0.12;
  top.position.x += -0.25;
  g.add(head, face, top);
  // Older graves round it, their stones sunk crooked.
  const rand = seededRandom(7401);
  for (let k = 0; k < 9; k++) {
    const side = k % 2 ? 1 : -1;
    const old = new THREE.Mesh(new THREE.BoxGeometry(1.4 + rand(), 2 + rand() * 1.6, 0.4), stone);
    old.position.set(side * (W + 4 + rand() * 9), 0.8, -L - 6 + k * 3.5);
    old.rotation.set((rand() - 0.5) * 0.6, (rand() - 0.5) * 0.8, (rand() - 0.5) * 0.7);
    g.add(old);
  }
  const heap = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0x3a302a, { flatShading: true }));
  heap.scale.set(1, 0.5, 1.6);
  heap.position.set(W + 6, 0, 0);
  const shovel = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 5), wood());
  shaft.position.y = 1.5;
  const spade = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.08), iron());
  spade.position.y = -0.2;
  shovel.add(shaft, spade);
  shovel.position.set(W + 5, 2.2, 1);
  shovel.rotation.z = 0.3;
  g.add(heap, shovel);
  // The coffin at the bottom, its lid off.
  const coffinMat = lambert(0x3a2418);
  const coffin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 6), coffinMat);
  coffin.position.set(0, -pit.depth + 0.6, 0);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 6), coffinMat);
  lid.position.set(2, -pit.depth + 1.4, 0.5);
  lid.rotation.z = 0.8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 2 * L), new THREE.MeshBasicMaterial({ color: 0x060404 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -pit.depth + 0.1;
  g.add(coffin, lid, floor);
  // The hourglass, on a post by the headstone, running out.
  const glassMat = new THREE.MeshPhongMaterial({ color: 0xd8e8f0, transparent: true, opacity: 0.35, shininess: 120, side: THREE.DoubleSide });
  const sandMat = lambert(0xf0c060);
  const hg = new THREE.Group();
  hg.position.set(W + 2.5, 0, -L - 2);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, 0.4), darkWood());
  post.position.y = 1.2;
  hg.add(post);
  for (const dir of [-1, 1]) {
    const bulb = new THREE.Mesh(new THREE.ConeGeometry(1, 1.6, 14, 1, true), glassMat);
    bulb.rotation.x = dir < 0 ? 0 : Math.PI;
    bulb.position.y = 4 + dir * 0.8;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.25, 14), gold());
    cap.position.y = 4 + dir * 1.7;
    hg.add(bulb, cap);
  }
  const upperSand = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.2, 14), sandMat);
  upperSand.rotation.x = Math.PI;
  upperSand.position.y = 4.7;
  const lowerSand = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1, 14), sandMat);
  lowerSand.position.y = 2.9;
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 4), sandMat);
  stream.position.y = 3.6;
  hg.add(upperSand, lowerSand, stream);
  g.add(hg);
  // Mist rising out of the grave.
  const mists: THREE.Sprite[] = [];
  for (let k = 0; k < 8; k++) {
    const m = smoke(FOG_HEX, 6, 0.3);
    g.add(m);
    mists.push(m);
  }
  animated.push((time) => {
    mists.forEach((m, k) => {
      const v = (time * 0.1 + k / mists.length) % 1;
      m.position.set(Math.sin(k * 2.1 + time * 0.2) * W * 0.6, -pit.depth + v * (pit.depth + 4), Math.cos(k * 1.7) * L * 0.7);
      m.material.opacity = 0.32 * Math.sin(v * Math.PI);
    });
    // It runs out over a lap's worth, about a minute, and starts again.
    const u = (time / 60) % 1;
    upperSand.scale.set(1 - u * 0.85, 1 - u * 0.85, 1 - u * 0.85);
    lowerSand.scale.set(0.15 + u * 0.85, 0.15 + u * 0.85, 0.15 + u * 0.85);
  });
  g.position.set(pit.x, Math.max(0, f.y), pit.z);
  g.rotation.y = pit.heading;
  return g;
}

/** The stitches the hellhounds sniff out: a fresh wound across the road, raw red and wet, black thread crossed through it, blood beading. */
const stitchTexture = once(() => {
  const W = 256;
  const H = 32;
  const [c, ctx] = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  // The wound: dark at its lips, raw and bright down its middle.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.2, 'rgba(60,4,4,0)');
  g.addColorStop(0.36, 'rgba(90,6,6,0.9)');
  g.addColorStop(0.5, 'rgba(230,30,20,1)');
  g.addColorStop(0.64, 'rgba(90,6,6,0.9)');
  g.addColorStop(0.8, 'rgba(60,4,4,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#0a0404';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (let x = 8; x < W; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x - 5, 5);
    ctx.lineTo(x + 5, H - 5);
    ctx.moveTo(x + 5, 5);
    ctx.lineTo(x - 5, H - 5);
    ctx.stroke();
    // A bead of blood at each stitch.
    ctx.fillStyle = 'rgba(200,16,10,0.9)';
    ctx.beginPath();
    ctx.arc(x + 5, H - 5, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = finish(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
});

/** A hellhound, facing +z, its foot at the origin: black, a ridge of fire down its back, eyes of fire, smoke on its breath. Returns it and the parts that move. */
function houndFigure(): { group: THREE.Group; legs: THREE.Object3D[]; flames: THREE.Sprite[]; head: THREE.Object3D; tail: THREE.Object3D; breath: THREE.Sprite[] } {
  const g = new THREE.Group();
  const mat = hound();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.4, 4, 8), mat);
  body.rotation.x = Math.PI / 2;
  body.position.y = 1.1;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), mat);
  chest.position.set(0, 1.2, 0.55);
  const head = new THREE.Group();
  head.position.set(0, 1.55, 1.15);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.65), mat);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.32, 0.55), mat);
  snout.position.set(0, -0.08, 0.55);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.5), lambert(0x6a0a0a));
  jaw.position.set(0, -0.28, 0.5);
  head.add(skull, snout, jaw);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 4), mat);
    ear.position.set(side * 0.2, 0.42, -0.1);
    ear.rotation.z = side * -0.25;
    const eye = sprite(0xff3a10, 0.8, 1);
    eye.position.set(side * 0.16, 0.08, 0.36);
    const core = sprite(0xffd060, 0.25, 1);
    core.position.set(side * 0.16, 0.08, 0.38);
    head.add(ear, eye, core);
  }
  // Its breath, smoking off its jaws.
  const breath: THREE.Sprite[] = [];
  for (let k = 0; k < 3; k++) {
    const puff = smoke(0x5a5458, 0.6, 0.5);
    head.add(puff);
    breath.push(puff);
  }
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.3, 0.6], [0.3, 0.6], [-0.3, -0.6], [0.3, -0.6]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 1.1, z);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 0.18), mat);
    leg.position.y = -0.55;
    hip.add(leg);
    g.add(hip);
    legs.push(hip);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 1.3, -1.1);
  const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 5), mat);
  tailMesh.rotation.x = -2.2;
  tailMesh.position.z = -0.3;
  tail.add(tailMesh);
  const flames: THREE.Sprite[] = [];
  for (let k = 0; k < 4; k++) {
    const fl = sprite(k % 2 ? EMBER_HEX : 0xffa030, 0.8, 0.85);
    fl.position.set(0, 1.65, 0.7 - k * 0.5);
    g.add(fl);
    flames.push(fl);
  }
  g.add(body, chest, head, tail);
  return { group: g, legs, flames, head, tail, breath };
}

/** The hellhounds are drawn this much bigger than a dog: a little bigger than the body they bite with. */
const HOUND_LOOK = 1.35;

/**
 * A pack of hellhounds at their station, the hazard's look: the three
 * hounds, big and black, eyes of fire and smoke on their breath; the
 * stitches across the road they sniff out, a fresh wound sewn further
 * across from the den they'll come from as the run nears; the two dens in
 * the pit's walls glowing like furnaces in arches of bone, eyes burning in
 * the one the pack waits in; and fog lying across the pit floor.
 */
export function houndParts(obj: THREE.Object3D): THREE.Object3D[] {
  const pack = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const h = houndFigure();
    h.group.userData = h;
    h.group.scale.setScalar(HOUND_LOOK);
    pack.add(h.group);
  }
  // Its own copy of the stitches, to repeat as far across as they've been sewn.
  const map = stitchTexture().clone();
  map.needsUpdate = true;
  const stitches = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.6), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0 }));
  stitches.rotation.x = -Math.PI / 2;
  stitches.position.y = 0.06;
  const dens = new THREE.Group();
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x3a0804 });
  for (const side of [-1, 1]) {
    const den = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20, 0, Math.PI), holeMat);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.26, 6, 20, Math.PI), bone());
    const keystone = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), bone());
    keystone.position.y = 2.5;
    // The furnace inside it.
    const furnace = sprite(0xff4a10, 4.5, 0.6);
    furnace.position.set(0, 0.9, 0.1);
    den.add(hole, frame, keystone, furnace);
    const eyes = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      for (const e of [-1, 1]) {
        const eye = sprite(0xff2a10, 0.35, 0);
        eye.position.set((k - 1) * 0.9 + e * 0.13, 0.9 + (k % 2) * 0.25, 0.05);
        eyes.add(eye);
      }
    }
    den.add(eyes);
    den.userData = { side, eyes, furnace };
    dens.add(den);
  }
  // Fog lying on the pit floor.
  const fog = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const bank = smoke(FOG_HEX, 1, 0.22);
    bank.scale.set(16, 2.4, 1);
    fog.add(bank);
  }
  obj.add(pack, stitches, dens, fog);
  return [pack, stitches, dens, fog];
}

/** Poses a pack of hellhounds' parts (from houndParts) at race time: in the road's frame at the station. */
export function poseHounds(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [pack, stitches, dens, fog] = parts;
  // In the road's frame, from its centre: a lateral to the right is local -x.
  obj.position.set(p.ax, p.ground, p.az);
  obj.rotation.y = p.heading;
  const reach = p.gap;
  const u = p.phase;
  const H = HOUND_STAGES;
  const hounds = houndPack(u, p.side, reach);
  const running = u >= H.run && u < H.gone;
  hounds.forEach((h, k) => {
    const g = pack.children[k];
    const fig = g.userData as ReturnType<typeof houndFigure>;
    // Out of its den and not yet in the far one; before the run the lead pokes its nose out sniffing.
    const peek = k === 0 && u < H.run && u > H.run - 0.16;
    const inWall = Math.abs(h.lateral) > reach + 0.5;
    g.visible = (h.out && !inWall) || peek;
    if (!g.visible) return;
    const lat = peek ? -p.side * (reach - 0.4) : h.lateral;
    g.position.set(-lat, 0, h.along);
    // Running the way the pack goes: to the right (local -x) when side is 1.
    g.rotation.y = -p.side * (Math.PI / 2) + (running ? 0.25 * Math.cos(elapsed * 9 + k) * 0.4 : 0);
    const gallop = running ? elapsed * 16 + k * 1.7 : elapsed * 3;
    fig.legs.forEach((leg, j) => (leg.rotation.x = running ? 0.9 * Math.sin(gallop + (j < 2 ? 0 : Math.PI)) : 0));
    g.position.y = running ? 0.25 * Math.abs(Math.sin(gallop)) : 0;
    // Nose down on the scent, sniffing.
    fig.head.rotation.x = 0.35 + 0.15 * Math.sin(elapsed * (running ? 8 : 14) + k);
    fig.tail.rotation.x = 0.4 * Math.sin(elapsed * 10 + k);
    fig.flames.forEach((f, j) => {
      const fl = 0.8 + 0.3 * Math.sin(elapsed * 17 + j * 2 + k);
      f.scale.set(0.7 * fl, 1.1 * fl, 1);
      f.position.y = 1.65 + 0.15 * fl;
    });
    fig.breath.forEach((b, j) => {
      const v = (elapsed * 1.6 + j / fig.breath.length + k * 0.3) % 1;
      b.position.set(0, -0.1 + v * 0.5, 0.85 + v * 0.4);
      b.scale.setScalar(0.4 + v * 1.1);
      b.material.opacity = 0.5 * (1 - v);
    });
  });
  // The stitches: sewn across from the near den as the run nears, burning while the pack runs it, then cooling.
  const mat = (stitches as THREE.Mesh).material as THREE.MeshBasicMaterial;
  const w = 2 * reach;
  const grow = u < H.run ? Math.min(1, Math.max(0, (u - 0.08) / (H.run - 0.12))) : 1;
  mat.opacity = u < H.run ? 0.3 + 0.6 * grow : u < H.gone ? 0.95 : 0.95 * Math.max(0.15, 1 - (u - H.gone) / 0.12);
  stitches.scale.x = Math.max(0.01, w * grow);
  // Anchored at the near den's side, reaching across.
  stitches.position.x = p.side * (reach - (w * grow) / 2);
  mat.map!.repeat.set(Math.max(1, (w * grow) / 4), 1);
  dens.children.forEach((den) => {
    const side = den.userData.side as number;
    den.position.set(side * (reach + 0.25), 0, 0);
    den.rotation.y = -side * (Math.PI / 2);
    // Eyes in the den the pack waits in (before the run) or has gone into (after it).
    const near = side === p.side;
    const lit = near ? (u < H.run ? Math.min(1, u * 4) : 0) : u >= H.gone ? Math.max(0, 1 - (u - H.gone) / 0.15) : 0;
    (den.userData.eyes as THREE.Group).children.forEach((e, k) => (((e as THREE.Sprite).material as THREE.SpriteMaterial).opacity = lit * (0.7 + 0.3 * Math.sin(elapsed * 3 + k))));
    // The furnace roars up while the pack's in it.
    const furnace = den.userData.furnace as THREE.Sprite;
    furnace.material.opacity = 0.35 + 0.4 * lit + 0.1 * Math.sin(elapsed * 9 + side);
  });
  fog.children.forEach((bank, k) => bank.position.set(Math.sin(elapsed * 0.07 + k * 1.9) * reach * 0.8, 0.9 + (k % 2) * 0.5, -14 + k * 5.6 + Math.sin(elapsed * 0.05 + k) * 2));
}
