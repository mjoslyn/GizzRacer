import * as THREE from 'three';
import { seededRandom } from '../core/math';
import type { HazardPose } from '../items/hazards';
import { GANG_STAGGER, gangRiders } from '../kits/billabongValley';
import type { PitDef } from '../tracks/builder';
import { nearestOnSpline, pointAt } from '../tracks/spline';
import { BANK, type Ribbon, type Track } from '../tracks/track';
import { glowTexture } from './textures';
import { atmosphere } from './atmosphere';

/**
 * Billabong Valley's world, the All Stars Cup #2's finale: Mad Dog Morgan's
 * country, a dark, violent 1860s bush at night going to a blood-red dawn.
 * A crescent moon over the black ranges, smoke from the burning camp
 * drifting through the valley, firelight on the river red gums, and on the
 * final lap the dawn coming up red behind it all. Its textures (a bush
 * track of pale red dirt worn into ruts, hoofprints and gum leaves in it,
 * that reads plain against the dark bush floor of leaf litter, charcoal and
 * dry grass; the ranges' dark granite, iron-stained; a fence of split
 * slabs), its scenery (river red gums, dead white gums, grass trees, granite
 * tors, fallen logs, the outlaws' campfires, dingo eyes in the dark, wanted
 * notices nailed up, graves in the gully, burning tents, the troopers'
 * tents, ropes on the trees, slab huts), its landmarks (the hideout gate,
 * the black billabong, the red gums with the ropes on them, the burning
 * camp at Kyeamba, the troopers' camp and the burnt bridge, Morgan's wanted
 * poster, the timber trestle across the valley, the homestead under siege,
 * the red dawn, the fallen red gum across the billabong) and its hazard's
 * look (Morgan and his gang at the gallop, rifles flashing).
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

/** Firelight, its embers and its white-hot heart; blood; the troopers' blue; the moon; the dawn. */
const FIRE_HEX = 0xff6a1a;
const EMBER_HEX = 0xff3a10;
const FLAME_HEX = 0xffc050;
const BLOOD_HEX = 0x5a0a08;
const TROOPER_HEX = 0x1a2238;
const MOON_HEX = 0xc8d0e8;
const DAWN_HEX = 0xc01a0a;
/** Smoke from the burning camp hanging in the valley, lit red from under. */
const SMOKE_HEX = 0x3a2a26;

/**
 * The road: a bush track of red dirt, pale with dust, the way the outlaws'
 * horses and the troopers' drays have worn it. The texture spans half the
 * road (u across from its edge to its middle, v along): pale ochre dirt,
 * two wheel ruts worn darker and redder, hoofprints between them, gum
 * leaves and twigs blown across it, a dusty pale shoulder at the edge and a
 * thin crown of dry grass down the middle. It reads light against the dark
 * bush floor either side.
 */
export function redgumRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 8101);
  const grain = fbm(S, 64, 2, 8102);
  paint(ctx, S, S, (x, _y, i) => {
    const u = x / S;
    if (u < 0.05) return shade(mix([196, 168, 132], [222, 196, 156], n[i]), 0.9 + 0.2 * grain[i]);
    const base = mix([184, 124, 88], [216, 160, 116], n[i]);
    const rut = Math.exp(-(((u - 0.32) / 0.07) ** 2)) + Math.exp(-(((u - 0.7) / 0.07) ** 2));
    const worn = mix(base, [156, 92, 64], 0.45 * rut);
    // The crown down the middle: a little dry grass.
    const crown = Math.max(0, (u - 0.93) / 0.07);
    return shade(mix(worn, [150, 136, 92], 0.5 * crown), 0.82 + 0.36 * grain[i]);
  });
  const rand = seededRandom(8103);
  // Grit and pebbles.
  for (let k = 0; k < 2000; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(110,64,44,0.5)' : 'rgba(236,206,170,0.45)';
    const sz = 1 + rand() * 2;
    ctx.fillRect(S * (0.06 + rand() * 0.9), rand() * S, sz, sz);
  }
  // Hoofprints between the ruts: little dark horseshoes.
  ctx.strokeStyle = 'rgba(90,48,32,0.5)';
  ctx.lineWidth = 1.1;
  for (let k = 0; k < 30; k++) {
    const x = S * (0.4 + rand() * 0.45);
    const y = rand() * S;
    ctx.beginPath();
    ctx.arc(x, y, 2, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.stroke();
  }
  // Gum leaves and twigs blown across it.
  for (let k = 0; k < 60; k++) {
    ctx.save();
    ctx.translate(S * (0.06 + rand() * 0.88), rand() * S);
    ctx.rotate(rand() * Math.PI);
    const leaf = rand() < 0.6;
    ctx.fillStyle = leaf ? (rand() < 0.5 ? 'rgba(120,110,70,0.8)' : 'rgba(150,80,50,0.75)') : 'rgba(70,50,40,0.8)';
    if (leaf) {
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.fillRect(-7, -0.6, 14, 1.2);
    ctx.restore();
  }
  // The shoulder's edge: a line of dark leaf litter.
  ctx.fillStyle = 'rgba(60,40,30,0.55)';
  ctx.fillRect(S * 0.05, 0, 2, S);
  return finish(c);
}

/** The bush floor at night: leaf litter, bark strips, dry grass in clumps, charcoal where fires have been through, a little dark red earth. */
export function bushFloorTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 5, 8111);
  const patch = fbm(S, 4, 3, 8112);
  paint(ctx, S, S, (_x, _y, i) => {
    const litter: RGB = [58, 46, 36];
    const grass: RGB = [74, 66, 44];
    const char: RGB = [26, 22, 20];
    const earth: RGB = [72, 40, 30];
    let col = patch[i] < 0.35 ? mix(char, litter, patch[i] / 0.35) : patch[i] < 0.6 ? mix(litter, grass, (patch[i] - 0.35) / 0.25) : mix(grass, earth, Math.min(1, (patch[i] - 0.6) * 2.5));
    col = shade(col, 0.78 + n[i] * 0.44);
    return col;
  });
  const rand = seededRandom(8113);
  // Bark strips and twigs.
  for (let k = 0; k < 500; k++) {
    ctx.save();
    ctx.translate(rand() * S, rand() * S);
    ctx.rotate(rand() * Math.PI);
    ctx.fillStyle = rand() < 0.5 ? 'rgba(140,124,104,0.55)' : 'rgba(40,30,24,0.6)';
    ctx.fillRect(-6 - rand() * 8, -0.8, 12 + rand() * 16, 1.6);
    ctx.restore();
  }
  // Leaves.
  for (let k = 0; k < 4000; k++) {
    const r = rand();
    ctx.fillStyle = r < 0.4 ? 'rgba(96,84,56,0.5)' : r < 0.7 ? 'rgba(110,60,40,0.45)' : 'rgba(30,24,20,0.55)';
    ctx.fillRect(rand() * S, rand() * S, 2, 1);
  }
  return finish(c);
}

/** The ranges and the gully's walls: dark granite, iron-stained red-brown in runs, cracked, lichen spotted, blacker along the top. */
export function rangeRockTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 8121);
  const band = fbm(S, 2, 3, 8122);
  paint(ctx, S, S, (_x, y, i) => {
    const grey: RGB = [74, 68, 64];
    const iron: RGB = [96, 54, 38];
    const col = mix(grey, iron, Math.max(0, band[i] - 0.45) * 2);
    const top = Math.max(0, 1 - y / (S * 0.25));
    return shade(mix(col, [20, 16, 14], top * 0.7), 0.7 + n[i] * 0.5);
  });
  const rand = seededRandom(8123);
  ctx.strokeStyle = 'rgba(16,12,12,0.6)';
  ctx.lineWidth = 1.4;
  for (let k = 0; k < 26; k++) {
    let x = rand() * S;
    let y = rand() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += (rand() - 0.5) * 30;
      y += 6 + rand() * 18;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let k = 0; k < 900; k++) {
    ctx.fillStyle = rand() < 0.6 ? 'rgba(150,150,120,0.3)' : 'rgba(20,16,14,0.4)';
    ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 2, 1 + rand() * 2);
  }
  return finish(c);
}

/** The barrier: a fence of split slabs, grey and weathered, stood up side by side, a rail along the top, the odd nail rusting. */
export function slabFenceTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  const rand = seededRandom(8131);
  ctx.fillStyle = '#100c0a';
  ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; ) {
    const w = 12 + Math.floor(rand() * 10);
    const g = 70 + Math.floor(rand() * 40);
    ctx.fillStyle = `rgb(${g + 20},${g + 10},${g})`;
    ctx.fillRect(x + 1, 6 + rand() * 4, w - 2, H - 8);
    // The grain down each slab.
    ctx.strokeStyle = 'rgba(30,24,20,0.5)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const gx = x + 3 + rand() * (w - 6);
      ctx.beginPath();
      ctx.moveTo(gx, 8);
      ctx.lineTo(gx + (rand() - 0.5) * 3, H);
      ctx.stroke();
    }
    x += w;
  }
  ctx.fillStyle = '#5a4a3c';
  ctx.fillRect(0, 12, W, 6);
  ctx.fillStyle = 'rgba(200,180,150,0.35)';
  ctx.fillRect(0, 12, W, 1.5);
  ctx.fillStyle = 'rgba(140,60,30,0.9)';
  for (let x = 6; x < W; x += 21) ctx.fillRect(x, 14, 2, 2);
  return finish(c);
}

const glowTex = once(() => glowTexture());
const bark = once(() => lambert(0x8a7c70));
/** A river red gum's bark: mottled pale grey, patched red where it's shed. */
const redBark = once(() => lambert(0x7a5a4a));
const paleBark = once(() => lambert(0xb8b0a4));
const gumLeaf = once(() => lambert(0x26301e, { flatShading: true }));
const charcoal = once(() => lambert(0x161210));
const granite = once(() => lambert(0x4a4440, { flatShading: true }));
const wood = once(() => lambert(0x4a3a2c));
const darkWood = once(() => lambert(0x241a14));
const canvasMat = once(() => lambert(0xc8bca0, { side: THREE.DoubleSide }));
const rope = once(() => lambert(0x9a8460));
const iron = once(() => lambert(0x1c1a1a));
const trooperBlue = once(() => lambert(TROOPER_HEX));
const skin = once(() => lambert(0xc89070));
const coat = once(() => lambert(0x2a221c));
/** The gang's horses: bays, lit a little by the fires so they read against the dark. */
const horseHide = once(() => new THREE.MeshPhongMaterial({ color: 0x5a3420, emissive: 0x2a1006, specular: 0x806040, shininess: 30 }));

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

/** A flame: a cluster of flickering sprites, its heart white-hot; returns the group and a flicker to call each frame (`strength` 0 to 1). */
function flame(size: number, phase: number): { group: THREE.Group; flicker: (time: number, strength?: number) => void } {
  const g = new THREE.Group();
  const outer = sprite(FIRE_HEX, size, 0.8);
  const mid = sprite(EMBER_HEX, size * 0.7, 0.8);
  const core = sprite(FLAME_HEX, size * 0.4, 0.9);
  g.add(outer, mid, core);
  return {
    group: g,
    flicker: (time, strength = 1) => {
      const f = 0.75 + 0.25 * Math.sin(time * 13 + phase) * Math.sin(time * 7.3 + phase * 2);
      const k = strength * f;
      outer.scale.set(size * (0.8 + 0.2 * k), size * (1.1 + 0.5 * k), 1);
      outer.position.y = size * 0.45 * k;
      mid.scale.set(size * 0.6 * k + 0.01, size * 0.9 * k + 0.01, 1);
      mid.position.y = size * 0.3 * k;
      core.scale.setScalar(size * 0.35 * k + 0.01);
      outer.material.opacity = 0.75 * strength;
      mid.material.opacity = 0.8 * strength;
      core.material.opacity = 0.9 * strength;
    },
  };
}

/** A face of words on parchment or a slab: dark ink on pale paper by default, heavy old letters. */
const notice = (() => {
  const made = new Map<string, THREE.CanvasTexture>();
  return (lines: string[], bg = '#d8c49a', fg = '#1a0e08', W = 512, H = 256): THREE.CanvasTexture => {
    const key = `${lines.join('|')}|${bg}|${fg}|${W}|${H}`;
    let t = made.get(key);
    if (t) return t;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // Foxed and stained.
    const rand = seededRandom(lines.join('').length * 31 + W);
    for (let k = 0; k < 40; k++) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(90,60,30,0.18)');
      g.addColorStop(1, 'rgba(90,60,30,0)');
      ctx.save();
      ctx.translate(rand() * W, rand() * H);
      ctx.scale(10 + rand() * 40, 10 + rand() * 40);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = Math.min(H / (lines.length + 0.6), lines.length === 1 ? 110 : 80);
    lines.forEach((line, k) => {
      ctx.font = `900 ${size}px 'Times New Roman', Georgia, serif`;
      const w = ctx.measureText(line).width;
      ctx.save();
      ctx.translate(W / 2, H / 2 + (k - (lines.length - 1) / 2) * size * 1.05);
      if (w > W - 40) ctx.scale((W - 40) / w, 1);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
    t = finish(c, false);
    made.set(key, t);
    return t;
  };
})();

/** A board `w` wide and `h` high with `map` on its face toward -z (toward whoever's coming) and on its back. */
function board(w: number, h: number, map: THREE.Texture, back: THREE.Material = darkWood()): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, h);
  const front = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map }));
  front.rotation.y = Math.PI;
  front.position.z = -0.12;
  const rear = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map }));
  rear.position.z = 0.12;
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.2), back), front, rear);
  return g;
}

/** A river red gum, `scale` times life size: a thick, gnarled trunk leaning a little, mottled, heavy limbs and sparse dark crowns. Its foot at the origin. */
function redGumFigure(rand: () => number, scale = 1): THREE.Group {
  const t = new THREE.Group();
  const h = (11 + rand() * 6) * scale;
  const mat = rand() < 0.5 ? bark() : redBark();
  const lean = (rand() - 0.5) * 0.25;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7 * scale, 1.3 * scale, h * 0.6, 8), mat);
  trunk.position.y = h * 0.3;
  trunk.rotation.z = lean;
  t.add(trunk);
  const top = h * 0.58;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + rand();
    const len = (4 + rand() * 3) * scale;
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.5 * scale, len, 6), mat);
    const tilt = 0.6 + rand() * 0.4;
    limb.position.set(Math.cos(a) * len * 0.35 * Math.sin(tilt) + lean * -top, top + len * 0.4 * Math.cos(tilt), Math.sin(a) * len * 0.35 * Math.sin(tilt));
    limb.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
    t.add(limb);
    // Clumps of dark leaves at the end of each limb, ragged, hanging.
    for (let j = 0; j < 2; j++) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry((1.8 + rand() * 1.4) * scale, 0), gumLeaf());
      crown.scale.y = 0.7;
      crown.position.set(Math.cos(a) * len * (0.6 + 0.3 * j) * Math.sin(tilt) + lean * -top + (rand() - 0.5) * 2 * scale, top + len * (0.7 + 0.2 * j) * Math.cos(tilt) + (rand() - 0.2) * 1.5 * scale, Math.sin(a) * len * (0.6 + 0.3 * j) * Math.sin(tilt) + (rand() - 0.5) * 2 * scale);
      t.add(crown);
    }
  }
  return t;
}

/** A dead gum, bleached white and bare, its limbs up like arms. */
function deadGumFigure(rand: () => number, scale = 1): THREE.Group {
  const t = new THREE.Group();
  const h = (9 + rand() * 6) * scale;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * scale, 0.65 * scale, h, 6), paleBark());
  trunk.position.y = h / 2;
  t.add(trunk);
  for (let k = 0; k < 5; k++) {
    const a = rand() * Math.PI * 2;
    const len = (2.5 + rand() * 3.5) * scale;
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * scale, 0.2 * scale, len, 5), paleBark());
    const tilt = 0.4 + rand() * 0.7;
    limb.position.set(Math.cos(a) * len * 0.45 * Math.sin(tilt), h * (0.5 + rand() * 0.45) + len * 0.45 * Math.cos(tilt), Math.sin(a) * len * 0.45 * Math.sin(tilt));
    limb.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
    t.add(limb);
  }
  return t;
}

/** A man in the bush: a long coat, a slouch hat; `cloth` for the coat (troopers in blue). Facing +z, his foot at the origin. Returns him and his right arm. */
function manFigure(cloth: THREE.Material, beard = false): { group: THREE.Group; arm: THREE.Group } {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.26), darkWood());
  legs.position.y = 0.45;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.36, 0.9, 8), cloth);
  body.position.y = 1.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), skin());
  head.position.y = 1.92;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 10), charcoal());
  brim.position.y = 2.06;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.2, 8), charcoal());
  crown.position.y = 2.16;
  g.add(legs, body, head, brim, crown);
  if (beard) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.4, 6), charcoal());
    b.rotation.x = Math.PI;
    b.position.set(0, 1.74, 0.08);
    g.add(b);
  }
  const arm = new THREE.Group();
  arm.position.set(0.3, 1.62, 0);
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.13), cloth);
  sleeve.position.y = -0.3;
  arm.add(sleeve);
  g.add(arm);
  return { group: g, arm };
}

/**
 * Mad Dog Morgan's country, scenery by where it stands along the lap: the
 * outlaws' campfires and slab huts by the hideout, drowned dead gums and
 * reeds round the billabong, red gums with ropes on them, graves in the
 * gully with the crows, burning tents along the camp's side of the valley,
 * the troopers' tents, wanted notices nailed up by the poster, granite tors
 * up in the ranges, and everywhere river red gums, dead white gums, grass
 * trees, fallen logs, dingo eyes in the dark and smoke lying in the hollows.
 */
export function nightbushFeature(animated: Animated, track?: Track): Feature {
  const sectionAt = (x: number, z: number): string => {
    if (!track) return '';
    const hit = nearestOnSpline(track.spline, x, z);
    return track.main.def.sections[track.main.sectionIndex[hit.index]]?.name ?? '';
  };
  const gum: Feature = (x, z, rand) => place(redGumFigure(rand, 0.9 + rand() * 0.7), x, z, rand);
  const deadGum: Feature = (x, z, rand) => {
    const t = deadGumFigure(rand, 0.9 + rand() * 0.6);
    // A crow on a limb now and then.
    if (rand() < 0.4) {
      const crow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 5), charcoal());
      crow.rotation.x = Math.PI / 2;
      crow.position.set(0.4, 7 + rand() * 3, 0);
      t.add(crow);
    }
    return place(t, x, z, rand);
  };
  const grassTree: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 1 + rand() * 1.8;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, h, 7), charcoal());
    trunk.position.y = h / 2;
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.4, 10, 1, true), lambert(0x4a5a2a, { side: THREE.DoubleSide }));
    skirt.position.y = h + 0.1;
    skirt.rotation.x = Math.PI;
    const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 5), lambert(0x6a5a3a));
    spike.position.y = h + 1.2;
    t.add(trunk, skirt, spike);
    return place(t, x, z, rand);
  };
  const tor: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const r = 1.2 + rand() * 2.8;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), granite());
      rock.scale.set(1, 0.6 + rand() * 0.5, 1);
      rock.position.set((rand() - 0.5) * 6, r * 0.45 + (k > 2 ? r : 0), (rand() - 0.5) * 6);
      rock.rotation.set(rand(), rand(), rand());
      t.add(rock);
    }
    return place(t, x, z, rand);
  };
  const log: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const len = 5 + rand() * 7;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, len, 7), rand() < 0.5 ? paleBark() : bark());
    trunk.rotation.z = Math.PI / 2;
    trunk.position.y = 0.45;
    t.add(trunk);
    return place(t, x, z, rand);
  };
  // The outlaws' campfire: a ring of stones, a billy on a tripod over the flames, firelight.
  const campfire: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), granite());
      st.position.set(Math.cos(a) * 1, 0.2, Math.sin(a) * 1);
      t.add(st);
    }
    for (let k = 0; k < 3; k++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 4), darkWood());
      const a = (k / 3) * Math.PI * 2;
      leg.position.set(Math.cos(a) * 0.45, 0.95, Math.sin(a) * 0.45);
      leg.rotation.set(Math.sin(a) * -0.4, 0, Math.cos(a) * 0.4);
      t.add(leg);
    }
    const billy = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.35, 8), iron());
    billy.position.y = 1.2;
    t.add(billy);
    const f = flame(1.8, rand() * 9);
    f.group.position.y = 0.3;
    const glow = sprite(FIRE_HEX, 9, 0.2);
    glow.position.y = 1;
    t.add(f.group, glow);
    animated.push((time) => {
      f.flicker(time);
      glow.material.opacity = 0.16 + 0.06 * Math.sin(time * 11 + x);
    });
    return place(t, x, z, rand);
  };
  // Dingo eyes in the dark, blinking.
  const eyes: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const pair: THREE.Sprite[] = [];
    for (const e of [-1, 1]) {
      const eye = sprite(0xffd060, 0.35, 0.9);
      eye.position.set(e * 0.14, 0.6 + rand() * 0.2, 0);
      t.add(eye);
      pair.push(eye);
    }
    const ph = rand() * 20;
    animated.push((time) => {
      const open = Math.sin(time * 0.7 + ph) > -0.2 && Math.sin(time * 9 + ph) > -0.95 ? 0.9 : 0;
      pair.forEach((e) => (e.material.opacity = open));
    });
    return place(t, x, z, rand);
  };
  const fogPatch: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const banks: THREE.Sprite[] = [];
    for (let k = 0; k < 4; k++) {
      const b = smoke(SMOKE_HEX, 1, 0.3);
      b.scale.set(16 + rand() * 10, 3.5, 1);
      t.add(b);
      banks.push(b);
    }
    const ph = rand() * 6;
    animated.push((time) => banks.forEach((b, k) => b.position.set(Math.sin(time * 0.05 + k * 1.3 + ph) * 8, 1.2 + (k % 2) * 0.8, Math.cos(time * 0.04 + k * 2.1 + ph) * 8)));
    return place(t, x, z, rand);
  };
  const tent = (burning: boolean, rand: () => number): THREE.Group => {
    const t = new THREE.Group();
    const s = 1.6 + rand() * 0.8;
    const cloth = new THREE.Mesh(new THREE.ConeGeometry(1.8 * s, 2.4 * s, 4, 1, true), burning ? lambert(0x3a2a20, { side: THREE.DoubleSide }) : canvasMat());
    cloth.position.y = 1.2 * s;
    cloth.rotation.y = Math.PI / 4;
    t.add(cloth);
    if (burning) {
      const flames: ReturnType<typeof flame>[] = [];
      for (let k = 0; k < 3; k++) {
        const f = flame(2.4 * s, rand() * 9);
        f.group.position.set((rand() - 0.5) * 2 * s, 0.5 * s + rand() * s, (rand() - 0.5) * 2 * s);
        t.add(f.group);
        flames.push(f);
      }
      const plume = smoke(SMOKE_HEX, 7 * s, 0.5);
      t.add(plume);
      const ph = rand() * 9;
      animated.push((time) => {
        // By dawn, burned down to embers.
        const left = 1 - 0.7 * atmosphere.finalLap;
        flames.forEach((f) => f.flicker(time, left));
        const v = (time * 0.25 + ph) % 1;
        plume.position.y = 3 * s + v * 10 * s;
        plume.material.opacity = 0.5 * (1 - v);
      });
    }
    return t;
  };
  const burningTent: Feature = (x, z, rand) => place(tent(true, rand), x, z, rand);
  const troopersTent: Feature = (x, z, rand) => {
    const t = tent(false, rand);
    const lamp = sprite(0xffc070, 1.4, 0.8);
    lamp.position.set(1.8, 1.6, 0);
    t.add(lamp);
    return place(t, x, z, rand);
  };
  const wantedPost: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 3, 6), wood());
    post.position.y = 1.5;
    const sheet = board(1.4, 1.9, notice(['WANTED', 'MAD DOG', 'MORGAN', '£1000'], '#d8c49a', '#1a0e08', 256, 352), wood());
    sheet.position.set(0, 2.2, 0.2);
    t.add(post, sheet);
    return place(t, x, z, rand);
  };
  // A red gum with rope round it, lengths hanging cut, a lantern guttering.
  const ropeTree: Feature = (x, z, rand) => {
    const t = redGumFigure(rand, 1 + rand() * 0.4);
    for (let k = 0; k < 3; k++) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 5, 16), rope());
      loop.rotation.x = Math.PI / 2;
      loop.position.y = 1 + k * 0.6;
      t.add(loop);
    }
    const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 4), rope());
    hang.position.set(1.2, 1, 0);
    t.add(hang);
    return place(t, x, z, rand);
  };
  const grave: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0x4a2a1e));
    mound.scale.set(0.9, 0.4, 2);
    const up = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.6, 0.14), wood());
    up.position.set(0, 0.8, -2);
    up.rotation.z = (rand() - 0.5) * 0.3;
    const across = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.12), wood());
    across.position.set(0, 1.2, -2);
    t.add(mound, up, across);
    return place(t, x, z, rand);
  };
  // A bark slab hut, a fire behind its one window, smoke from the chimney.
  const hut: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 4), wood());
    walls.position.y = 1.3;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4, 1.6, 4), darkWood());
    roof.position.y = 3.4;
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.75;
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.2, 0.9), granite());
    chimney.position.set(2.2, 2.1, 0);
    const window = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
    window.position.set(0, 1.5, 2.01);
    const puff = smoke(0x5a5050, 2, 0.4);
    t.add(walls, roof, chimney, window, puff);
    const ph = rand() * 5;
    animated.push((time) => {
      const v = (time * 0.3 + ph) % 1;
      puff.position.set(2.2, 4.4 + v * 5, 0);
      puff.scale.setScalar(1.5 + v * 3);
      puff.material.opacity = 0.4 * (1 - v);
    });
    return place(t, x, z, rand);
  };
  const reeds: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const mat = lambert(0x3a4228);
    for (let k = 0; k < 14; k++) {
      const h = 1 + rand() * 1.4;
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, h, 3), mat);
      r.position.set((rand() - 0.5) * 3, h / 2, (rand() - 0.5) * 3);
      r.rotation.z = (rand() - 0.5) * 0.3;
      t.add(r);
    }
    return place(t, x, z, rand);
  };
  const general: [number, Feature][] = [
    [4, gum],
    [1.6, deadGum],
    [1.6, grassTree],
    [1.2, tor],
    [1, log],
    [0.5, campfire],
    [0.9, eyes],
    [1, fogPatch],
  ];
  const bySection: Record<string, [number, Feature][]> = {
    'Outlaws on the Run': [[1.5, campfire], [1.5, hut], [2, reeds], [1, deadGum]],
    'Tied Naked to the Trees': [[6, ropeTree], [2, gum]],
    'Killed So Gruesomely': [[4, grave], [2, deadGum], [1, fogPatch]],
    'Burning Tents to the Ground': [[6, burningTent], [1, fogPatch]],
    "Cops Won't Wave Them Down": [[5, troopersTent], [1, wantedPost]],
    'The Most Wanted Men': [[4, wantedPost], [1, troopersTent]],
    'Bushrangers Reigning In': [[4, tor], [1, deadGum]],
    'Bloodthirsty Tendencies': [[4, tor], [2, deadGum], [1, eyes]],
    Antiauthority: [[3, tor], [1, wantedPost]],
    'Mad Dog Morgan': [[2, tor], [2, campfire], [1, eyes]],
    'He Never Gave a Warning': [[2, tor], [2, eyes]],
    'Shot in the Back by Morning': [[2, hut], [2, log], [1, campfire]],
  };
  return (x, z, rand) => {
    const local = bySection[sectionAt(x, z)] ?? [];
    return pick(rand, [...general, ...local])(x, z, rand);
  };
}

/** Lanterns hanging off a beam: a glass box and its glow, swinging a little. */
function lantern(animated: Animated, phase: number): THREE.Group {
  const g = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 3), iron());
  cord.position.y = -0.4;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.35), new THREE.MeshBasicMaterial({ color: 0xffb050 }));
  box.position.y = -1;
  const glow = sprite(0xffa040, 3.5, 0.6);
  glow.position.y = -1;
  g.add(cord, box, glow);
  animated.push((time) => {
    g.rotation.z = 0.08 * Math.sin(time * 1.3 + phase);
    glow.material.opacity = 0.5 + 0.12 * Math.sin(time * 9 + phase);
  });
  return g;
}

/**
 * Outlaws on the run: the start, under the gate of Morgan's hideout. Two
 * great red gum trunks either side, a log laid across them with BILLABONG
 * VALLEY burned into a slab hung from it, lanterns swinging, a horse's
 * skull nailed up over the middle, and a campfire at each foot.
 */
export function hideoutGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const H = 11;
  for (const side of [-1, 1]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, H + 4, 9), redBark());
    trunk.position.set(side * hw, (H + 4) / 2, 0);
    g.add(trunk);
    const crown = redGumFigure(seededRandom(side > 0 ? 8201 : 8202), 1.2);
    crown.position.set(side * hw, H - 4, 0);
    g.add(crown);
    const fire = flame(2.2, side * 3);
    fire.group.position.set(side * (hw + 3), 0.3, -3);
    const glow = sprite(FIRE_HEX, 12, 0.25);
    glow.position.set(side * (hw + 3), 1.5, -3);
    g.add(fire.group, glow);
    animated.push((time) => fire.flicker(time));
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 2 * hw + 5, 8), bark());
  beam.rotation.z = Math.PI / 2;
  beam.position.y = H;
  g.add(beam);
  const slab = board(14, 3.2, notice(['BILLABONG VALLEY'], '#3a2416', '#e8c890', 512, 120), wood());
  slab.position.y = H - 2.4;
  g.add(slab);
  for (const x of [-hw * 0.7, -hw * 0.35, hw * 0.35, hw * 0.7]) {
    const l = lantern(animated, x);
    l.position.set(x, H - 0.6, -0.4);
    g.add(l);
  }
  // A horse's skull over the middle.
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 2), lambert(0xd8ccb4));
  skull.position.set(0, H + 1.2, -0.6);
  skull.rotation.x = -0.5;
  g.add(skull);
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * The black billabong, where the road bows out round it: still black water
 * (the pit under the log, its water drawn by the track), drowned red gums
 * standing dead in it, reeds round its edge, mist lying on it and the moon
 * on the water. `to` is where the road comes back to the line.
 */
export function blackBillabong(ribbon: Ribbon, s: number, to: number, pits: readonly PitDef[], animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const a = frameAt(ribbon, s);
  const b = frameAt(ribbon, to);
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  const pit = pits.find((p) => p.liquid === 'water' && Math.hypot(p.x - mx, p.z - mz) < 40);
  const cx = pit?.x ?? mx;
  const cz = pit?.z ?? mz;
  const heading = pit?.heading ?? a.heading;
  const hl = pit?.halfLength ?? 25;
  const hwid = pit?.halfWidth ?? 15;
  const rand = seededRandom(8301);
  const inner = new THREE.Group();
  // Drowned gums standing in the water, clear of the log down its middle.
  for (let k = 0; k < 6; k++) {
    const t = deadGumFigure(rand, 0.9 + rand() * 0.5);
    const side = k % 2 ? 1 : -1;
    t.position.set(side * (6 + rand() * (hwid - 9)), -1.5, (rand() - 0.5) * 1.6 * hl);
    inner.add(t);
  }
  // Reeds round the edge.
  const reedMat = lambert(0x2e3622);
  for (let k = 0; k < 120; k++) {
    const h = 1 + rand() * 1.6;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, h, 3), reedMat);
    const edge = rand() < 0.5;
    const along = edge ? (rand() < 0.5 ? -1 : 1) * (hl + rand() * 2) : (rand() - 0.5) * 2 * hl;
    const across = edge ? (rand() - 0.5) * 2 * hwid : (rand() < 0.5 ? -1 : 1) * (hwid + rand() * 2);
    if (Math.abs(across) < 6) continue;
    r.position.set(across, h / 2 - 0.3, along);
    inner.add(r);
  }
  // Mist lying on the water, and the moon's light on it.
  const mists: THREE.Sprite[] = [];
  for (let k = 0; k < 6; k++) {
    const m = smoke(0x6a6a78, 1, 0.22);
    m.scale.set(20, 3, 1);
    inner.add(m);
    mists.push(m);
  }
  const shine = new THREE.Mesh(new THREE.PlaneGeometry(4, 22), new THREE.MeshBasicMaterial({ color: MOON_HEX, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
  shine.rotation.x = -Math.PI / 2;
  shine.position.set(hwid * 0.5, -2.3, 0);
  inner.add(shine);
  animated.push((time) => {
    mists.forEach((m, k) => m.position.set(Math.sin(time * 0.06 + k * 1.7) * hwid * 0.6, 0.2 + (k % 2) * 0.6, -hl + (k / 5) * 2 * hl + Math.sin(time * 0.05 + k) * 4));
    shine.material.opacity = 0.14 + 0.05 * Math.sin(time * 0.8);
  });
  inner.position.set(cx, 0, cz);
  inner.rotation.y = heading;
  g.add(inner);
  return g;
}

/** Tied naked to the trees: giant river red gums close along both sides from `s` to `to`, rope bound round their trunks, lengths hanging cut, crows in them, a lantern guttering on one. */
export function ropeGums(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(8401);
  let k = 0;
  for (let at = s; at < to; at += 22 + rand() * 10, k++) {
    const side = k % 2 ? 1 : -1;
    const o = offRoad(ribbon, at, side * (ribbon.halfWidthAtS(at) + 5 + rand() * 4));
    const t = redGumFigure(rand, 1.5 + rand() * 0.4);
    for (let j = 0; j < 4; j++) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.09, 5, 18), rope());
      loop.rotation.x = Math.PI / 2;
      loop.position.y = 0.8 + j * 0.55;
      t.add(loop);
    }
    for (let j = 0; j < 2; j++) {
      const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4 + rand(), 4), rope());
      hang.position.set(Math.cos(j * 2) * 1.8, 1.1, Math.sin(j * 2) * 1.8);
      t.add(hang);
    }
    // Dark stains down the bark.
    const stain = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.82, 1.2, 9, 1, true, 0, 1.4), lambert(BLOOD_HEX));
    stain.position.y = 1.4;
    t.add(stain);
    if (k % 3 === 1) {
      const l = lantern(animated, k);
      l.position.set(0, 4.2, -1.9);
      t.add(l);
    }
    t.position.set(o.x, 0, o.z);
    t.rotation.y = rand() * Math.PI * 2;
    g.add(t);
  }
  return g;
}

/**
 * Burning tents to the ground: the camp at Kyeamba in the middle of the
 * valley, ablaze. Canvas tents in rows, most of them burning, one falling
 * in on itself over and over, a wagon, a column of smoke climbing high and
 * lit red from under, embers rising, the whole valley floor round it
 * glowing. By dawn on the final lap it has burned down to embers and
 * smoke.
 */
export function burningCamp(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const o = offRoad(ribbon, s, lateral);
  const rand = seededRandom(8501);
  const flames: { f: ReturnType<typeof flame>; k: number }[] = [];
  for (let k = 0; k < 9; k++) {
    const t = new THREE.Group();
    const sz = 2.2 + rand();
    const ring = Math.floor(k / 3);
    const a = (k % 3) * 2.1 + ring;
    const r = 10 + ring * 9;
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    t.rotation.y = rand() * Math.PI;
    const burnt = k % 4 !== 3;
    const cloth = new THREE.Mesh(new THREE.ConeGeometry(2 * sz, 2.8 * sz, 4, 1, true), burnt ? lambert(0x2a1c16, { side: THREE.DoubleSide }) : canvasMat());
    cloth.position.y = 1.4 * sz;
    cloth.rotation.y = Math.PI / 4;
    t.add(cloth);
    if (burnt) {
      for (let j = 0; j < 3; j++) {
        const f = flame(3.2 * sz, rand() * 9);
        f.group.position.set((rand() - 0.5) * 2.4 * sz, 0.6 * sz + rand() * sz * 1.2, (rand() - 0.5) * 2.4 * sz);
        t.add(f.group);
        flames.push({ f, k });
      }
    }
    // One falling in on itself, again and again.
    if (k === 1) {
      const ph = rand() * 5;
      animated.push((time) => {
        const u = ((time / 7 + ph) % 1 + 1) % 1;
        const fall = u < 0.7 ? 0 : Math.min(1, (u - 0.7) / 0.12);
        cloth.rotation.z = fall * 1.1;
        cloth.position.y = 1.4 * sz * (1 - 0.55 * fall);
        cloth.scale.y = 1 - 0.5 * fall;
      });
    }
    g.add(t);
  }
  // A wagon on its side.
  const wagon = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 2.4), darkWood());
  wagon.position.set(-4, 1.2, 4);
  wagon.rotation.set(0.2, 0.6, 1.2);
  g.add(wagon);
  for (const z of [-0.8, 0.8]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.1, 5, 14), wood());
    wheel.position.set(-3, 2.3, 4 + z * 2);
    g.add(wheel);
  }
  // The glow on the ground, the smoke column and embers.
  const glow = sprite(FIRE_HEX, 70, 0.35);
  glow.position.y = 4;
  g.add(glow);
  const column: THREE.Sprite[] = [];
  for (let k = 0; k < 12; k++) {
    const p = smoke(SMOKE_HEX, 12, 0.5);
    g.add(p);
    column.push(p);
  }
  const embers: THREE.Sprite[] = [];
  for (let k = 0; k < 30; k++) {
    const e = sprite(EMBER_HEX, 0.6, 0.9);
    g.add(e);
    embers.push(e);
  }
  animated.push((time) => {
    const left = 1 - 0.75 * atmosphere.finalLap;
    flames.forEach(({ f }) => f.flicker(time, left));
    glow.material.opacity = (0.28 + 0.07 * Math.sin(time * 7) * Math.sin(time * 3.1)) * left + 0.06;
    column.forEach((p, k) => {
      const v = (time * 0.04 + k / column.length) % 1;
      p.position.set(Math.sin(v * 4 + k) * 6 + v * 30, 6 + v * 90, Math.cos(v * 3 + k) * 6);
      p.scale.setScalar(10 + v * 40);
      p.material.opacity = 0.55 * Math.sin(Math.PI * v);
      // Lit red from under, low down.
      p.material.color.setHex(v < 0.25 ? 0x6a2a1a : SMOKE_HEX);
    });
    embers.forEach((e, k) => {
      const v = (time * 0.2 + (k * 0.618) % 1) % 1;
      e.position.set(Math.sin(k * 2.3 + time * 0.5) * 18 * (0.3 + v), 2 + v * 40, Math.cos(k * 1.7 + time * 0.4) * 18 * (0.3 + v));
      e.material.opacity = 0.9 * (1 - v) * left;
    });
  });
  g.position.set(o.x, 0, o.z);
  return g;
}

/**
 * Cops won't wave them down: the troopers' camp beside the road from `s`
 * to `to`, white bell tents in a row, a flag on its pole, their horses
 * tethered, and troopers in blue at the roadside waving lanterns to stop
 * you; and the bridge over the creek burned, its charred stumps either side
 * of the leap and smoke still coming off them.
 */
export function troopersCamp(ribbon: Ribbon, s: number, to: number, pits: readonly PitDef[], animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(8601);
  const len = Math.max(20, to - s);
  // The tents on the right, set back.
  for (let k = 0; k < 6; k++) {
    const at = s + (k + 0.5) * (len / 6);
    const o = offRoad(ribbon, at, ribbon.halfWidthAtS(at) + 14 + (k % 2) * 7);
    const t = new THREE.Group();
    const cloth = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 12, 1, true), canvasMat());
    cloth.position.y = 1.7;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 4), wood());
    pole.position.y = 2.1;
    const lamp = sprite(0xffd090, 2.2, 0.7);
    lamp.position.y = 1.4;
    t.add(cloth, pole, lamp);
    t.position.set(o.x, 0, o.z);
    g.add(t);
  }
  // The flag on its pole.
  const fo = offRoad(ribbon, s + len * 0.5, ribbon.halfWidthAtS(s) + 26);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 12, 6), lambert(0xd8d0c0));
  pole.position.set(fo.x, 6, fo.z);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8, 8, 1), lambert(0x1a2a6a, { side: THREE.DoubleSide }));
  flag.position.set(fo.x + 1.6, 10.8, fo.z);
  g.add(pole, flag);
  const fpos = flag.geometry.attributes.position as THREE.BufferAttribute;
  const base = Float32Array.from(fpos.array as Float32Array);
  animated.push((time) => {
    for (let i = 0; i < fpos.count; i++) {
      const x = base[i * 3];
      fpos.setZ(i, Math.sin(x * 2 - time * 5) * 0.25 * (x + 1.6) * 0.4);
    }
    fpos.needsUpdate = true;
  });
  // Troopers at the roadside on both sides before the leap, waving their lanterns.
  for (let k = 0; k < 4; k++) {
    const side = k % 2 ? 1 : -1;
    const at = s + 4 + Math.floor(k / 2) * 14;
    const o = offRoad(ribbon, at, side * (ribbon.halfWidthAtS(at) + 2.5));
    const man = manFigure(trooperBlue());
    const l = sprite(0xffc070, 2.4, 0.9);
    l.position.set(0, -0.7, 0);
    man.arm.add(l);
    man.group.position.set(o.x, Math.max(0, ribbon.heightAt(at)), o.z);
    // Facing the oncoming karts.
    man.group.rotation.y = o.heading + Math.PI;
    g.add(man.group);
    const ph = k * 1.3;
    animated.push((time) => {
      man.arm.rotation.z = -2.4 + 0.7 * Math.sin(time * 6 + ph);
    });
  }
  // The burned bridge: charred stumps either side of the creek, smoking.
  const creek = pits.find((p) => !p.liquid && pointNear(ribbon, p, s, to));
  if (creek) {
    const fx = Math.sin(creek.heading);
    const fz = Math.cos(creek.heading);
    for (const end of [-1, 1]) {
      for (let j = -2; j <= 2; j++) {
        const lat = j * (creek.halfWidth / 2.5);
        const x = creek.x + fx * end * (creek.halfLength - 1) - fz * lat;
        const z = creek.z + fz * end * (creek.halfLength - 1) + fx * lat;
        const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 6 + rand() * 3, 6), charcoal());
        stump.position.set(x, -2, z);
        stump.rotation.z = (rand() - 0.5) * 0.4;
        g.add(stump);
        if (j % 2 === 0) {
          const ember = sprite(EMBER_HEX, 1.4, 0.7);
          ember.position.set(x, 1.2, z);
          const puff = smoke(0x4a4040, 2.5, 0.4);
          g.add(ember, puff);
          const ph = rand() * 5;
          animated.push((time) => {
            const v = (time * 0.35 + ph) % 1;
            puff.position.set(x, 1.5 + v * 6, z);
            puff.material.opacity = 0.4 * (1 - v);
            ember.material.opacity = 0.5 + 0.3 * Math.sin(time * 6 + ph);
          });
        }
      }
    }
  }
  return g;
}

/** Whether a pit lies along the road between `s` and `to`. */
function pointNear(ribbon: Ribbon, p: PitDef, s: number, to: number): boolean {
  const hit = nearestOnSpline(ribbon.spline, p.x, p.z);
  return hit.distance < 6 && hit.s > s - 5 && hit.s < to + 40;
}

/** Morgan's face on the poster: wild black hair and beard, deep-set eyes, drawn the way the police drew him. */
const posterFace = once(() => {
  const W = 512;
  const H = 768;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#d4bf92';
  ctx.fillRect(0, 0, W, H);
  const rand = seededRandom(8701);
  for (let k = 0; k < 60; k++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(110,70,30,0.2)');
    g.addColorStop(1, 'rgba(110,70,30,0)');
    ctx.save();
    ctx.translate(rand() * W, rand() * H);
    ctx.scale(20 + rand() * 60, 20 + rand() * 60);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#140a06';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = "900 120px 'Times New Roman', Georgia, serif";
  ctx.fillText('WANTED', W / 2, 80);
  ctx.font = "900 50px 'Times New Roman', Georgia, serif";
  ctx.fillText('MAD DOG MORGAN', W / 2, 160);
  // His face.
  ctx.save();
  ctx.translate(W / 2, 360);
  ctx.fillStyle = '#c8a070';
  ctx.beginPath();
  ctx.ellipse(0, -10, 80, 100, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#140a06';
  // Hair.
  ctx.beginPath();
  ctx.ellipse(0, -80, 95, 55, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  // Beard, wild, down to his chest.
  ctx.beginPath();
  ctx.moveTo(-85, -10);
  ctx.quadraticCurveTo(-100, 120, 0, 160);
  ctx.quadraticCurveTo(100, 120, 85, -10);
  ctx.quadraticCurveTo(40, 40, 0, 30);
  ctx.quadraticCurveTo(-40, 40, -85, -10);
  ctx.fill();
  // Eyes, deep and hard.
  for (const e of [-1, 1]) {
    ctx.fillRect(e * 32 - 16, -30, 32, 8);
    ctx.beginPath();
    ctx.arc(e * 32, -14, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(-4, -10, 8, 34);
  ctx.restore();
  ctx.font = "900 92px 'Times New Roman', Georgia, serif";
  ctx.fillText('£1000', W / 2, 580);
  ctx.font = "900 46px 'Times New Roman', Georgia, serif";
  ctx.fillText('REWARD', W / 2, 640);
  ctx.font = "700 34px 'Times New Roman', Georgia, serif";
  ctx.fillText('DEAD OR ALIVE', W / 2, 700);
  // Bullet holes.
  for (let k = 0; k < 7; k++) {
    ctx.fillStyle = '#0a0604';
    ctx.beginPath();
    ctx.arc(60 + rand() * (W - 120), 60 + rand() * (H - 120), 5 + rand() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#140a06';
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  return finish(c, false);
});

/**
 * The most wanted men: Morgan's wanted poster, 26 metres high, nailed to
 * a dead giant of a gum outside the bend at the end of the straight,
 * turned to face the karts coming at it, lit from below by two fires,
 * crows on its top.
 */
export function wantedPoster(ribbon: Ribbon, s: number, lateral: number | undefined, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const hw = ribbon.halfWidthAtS(s);
  const o = offRoad(ribbon, s, lateral ?? -(hw + 22));
  const L = ribbon.spline.length;
  const back = pointAt(ribbon.spline, (((s - 90) % L) + L) % L);
  const H = 26;
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, H + 12, 9), paleBark());
  trunk.position.y = (H + 12) / 2;
  tree.add(trunk);
  const limbs = deadGumFigure(seededRandom(8702), 2.2);
  limbs.position.y = H - 4;
  tree.add(limbs);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(H * 0.62, H * 0.93), new THREE.MeshLambertMaterial({ map: posterFace(), emissive: 0x2a1a0a, side: THREE.DoubleSide }));
  sheet.position.set(0, H * 0.5 + 3, 2.8);
  tree.add(sheet);
  // Nails at the corners.
  for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 6), iron());
    nail.rotation.x = Math.PI / 2;
    nail.position.set(x * H * 0.29, H * 0.5 + 3 + y * H * 0.44, 2.9);
    tree.add(nail);
  }
  for (const side of [-1, 1]) {
    const f = flame(4, side);
    f.group.position.set(side * 6, 0.4, 6);
    const glow = sprite(FIRE_HEX, 22, 0.3);
    glow.position.set(side * 6, 4, 5);
    tree.add(f.group, glow);
    animated.push((time) => {
      f.flicker(time);
      glow.material.opacity = 0.25 + 0.07 * Math.sin(time * 9 + side);
    });
  }
  tree.position.set(o.x, 0, o.z);
  // Facing the karts coming down the straight.
  tree.rotation.y = Math.atan2(back.x - o.x, back.z - o.z);
  g.add(tree);
  return g;
}

/**
 * Across the valley on the trestle: timber bents under the deck from `s`
 * to `to`, two legs splayed out to the ground, a cap beam and cross braces,
 * every few metres, wherever they won't stand in the road underneath.
 */
export function trestle(ribbon: Ribbon, s: number, to: number): THREE.Group {
  const g = new THREE.Group();
  const sp = ribbon.spline;
  const timber = wood();
  for (let at = s + 3; at < to; at += 7) {
    const f = frameAt(ribbon, at);
    const top = f.y - 1.3;
    if (top < 2) continue;
    const hw = ribbon.halfWidthAtS(at);
    // Keep clear of the road below.
    let blocked = false;
    for (let k = 0; k < sp.count && !blocked; k += 2) {
      const along = Math.abs(sp.dist[k] - at);
      if (Math.min(along, sp.length - along) < 60) continue;
      blocked = Math.hypot(sp.px[k] - f.x, sp.pz[k] - f.z) < ribbon.halfWidth[k] + hw + 2;
    }
    if (blocked) continue;
    const bent = new THREE.Group();
    const spread = hw + 2 + top * 0.15;
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, Math.hypot(top, spread - hw + 1), 0.6), timber);
      const dx = spread - (hw - 1);
      leg.position.set(side * (hw - 1 + dx / 2), top / 2, 0);
      leg.rotation.z = side * Math.atan2(dx, top);
      bent.add(leg);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.5, top, 0.5), timber);
      inner.position.set(side * hw * 0.4, top / 2, 0);
      bent.add(inner);
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 2, 0.7, 0.8), darkWood());
    cap.position.y = top - 0.35;
    bent.add(cap);
    // The X of the cross braces.
    for (const dir of [-1, 1]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(2 * hw, top * 0.8), 0.3, 0.3), timber);
      brace.position.y = top * 0.5;
      brace.rotation.z = dir * Math.atan2(top * 0.8, 2 * hw);
      bent.add(brace);
    }
    bent.position.set(f.x, 0, f.z);
    bent.rotation.y = f.heading;
    g.add(bent);
  }
  return g;
}

/**
 * Shot in the back by morning: the station homestead where Morgan held the
 * household overnight, `lateral` off the road. A weatherboard house with a
 * verandah all round, every window lit, smoke from both chimneys; the men
 * waiting for him in the dark behind the woolshed and the fences, rifles
 * up, and him walking out alone across the yard.
 */
export function stationHomestead(ribbon: Ribbon, s: number, lateral: number | undefined, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const o = offRoad(ribbon, s, lateral ?? ribbon.halfWidthAtS(s) + 40);
  const house = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(16, 4, 11), lambert(0x8a8070));
  walls.position.y = 2.4;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(12.5, 4.5, 4), lambert(0x3a3836));
  roof.position.y = 6.6;
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.72;
  const verandah = new THREE.Mesh(new THREE.BoxGeometry(20, 0.25, 15), lambert(0x4a4440));
  verandah.position.y = 3.9;
  house.add(walls, roof, verandah);
  for (const [x, z] of [[-10, -7.5], [10, -7.5], [-10, 7.5], [10, 7.5], [0, -7.5], [0, 7.5]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.8, 0.25), wood());
    post.position.set(x, 1.9, z);
    house.add(post);
  }
  const lit = new THREE.MeshBasicMaterial({ color: 0xffb050 });
  for (const x of [-5.5, -2, 2, 5.5]) {
    for (const z of [-5.51, 5.51]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.6), lit);
      w.position.set(x, 2.5, z);
      if (z < 0) w.rotation.y = Math.PI;
      house.add(w);
    }
  }
  const glows: THREE.Sprite[] = [];
  for (const z of [-7, 7]) {
    const glow = sprite(0xffa040, 18, 0.25);
    glow.position.set(0, 2.5, z);
    house.add(glow);
    glows.push(glow);
  }
  const puffs: THREE.Sprite[] = [];
  for (const x of [-6, 6]) {
    const chim = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4, 1.2), lambert(0x5a3a2a));
    chim.position.set(x, 7, 0);
    house.add(chim);
    const p = smoke(0x5a5458, 3, 0.4);
    p.userData.x = x;
    house.add(p);
    puffs.push(p);
  }
  // The woolshed, and the men behind it with their rifles.
  const shed = new THREE.Mesh(new THREE.BoxGeometry(18, 5, 9), lambert(0x4a4038));
  shed.position.set(-24, 2.5, 14);
  house.add(shed);
  for (let k = 0; k < 5; k++) {
    const man = manFigure(coat());
    man.arm.rotation.x = -1.4;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.4), darkWood());
    gun.position.set(0, -0.6, 0.5);
    man.arm.add(gun);
    man.group.position.set(-30 + k * 4, 0, 6 + (k % 2) * 2);
    man.group.rotation.y = 0.6;
    man.group.scale.y = 0.75;
    house.add(man.group);
  }
  // Morgan, walking out alone across the yard.
  const morgan = manFigure(coat(), true);
  morgan.group.position.set(4, 0, -12);
  morgan.group.rotation.y = Math.PI * 0.85;
  house.add(morgan.group);
  // A post-and-rail fence round the yard.
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.25), wood());
    post.position.set(Math.cos(a) * 22, 0.7, Math.sin(a) * 16);
    house.add(post);
  }
  animated.push((time) => {
    puffs.forEach((p, k) => {
      const v = (time * 0.2 + k * 0.5) % 1;
      p.position.set(p.userData.x as number, 9 + v * 10, 0);
      p.scale.setScalar(3 + v * 6);
      p.material.opacity = 0.4 * (1 - v);
    });
    glows.forEach((gl, k) => (gl.material.opacity = 0.22 + 0.04 * Math.sin(time * 5 + k)));
    // At dawn he walks out across the yard.
    const walk = atmosphere.finalLap;
    morgan.group.position.z = -12 - walk * 14;
  });
  house.position.set(o.x, 0, o.z);
  house.rotation.y = o.heading;
  g.add(house);
  return g;
}

/**
 * The dawn: a blood-red sun low on the horizon far off down the finish
 * straight, behind bands of black cloud, the sky round it glowing. Through
 * the race it waits just under the horizon, a red glow coming; on the final
 * lap it rises.
 */
export function redDawn(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const D = 1100;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(90, 48), new THREE.MeshBasicMaterial({ color: DAWN_HEX, fog: false, transparent: true, opacity: 0.95, depthWrite: false }));
  const halo = sprite(0xd03010, 520, 0.5, false);
  const wide = sprite(0x801408, 1300, 0.35, false);
  const clouds: THREE.Mesh[] = [];
  for (let k = 0; k < 4; k++) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(420 + k * 60, 10 + k * 3), new THREE.MeshBasicMaterial({ color: 0x0a0406, fog: false, transparent: true, opacity: 0.9, depthWrite: false }));
    c.position.set((k - 1.5) * 40, -30 + k * 24, 1);
    clouds.push(c);
  }
  const sun = new THREE.Group();
  sun.add(wide, halo, disc, ...clouds);
  sun.renderOrder = -0.5;
  sun.traverse((o) => (o.renderOrder = -0.5));
  g.add(sun);
  // Far off down the finish straight, facing back up it.
  g.position.set(f.x + Math.sin(f.heading) * D, 0, f.z + Math.cos(f.heading) * D);
  g.rotation.y = f.heading + Math.PI;
  animated.push(() => {
    const rise = atmosphere.finalLap;
    sun.position.y = -120 + rise * 190;
    disc.material.opacity = 0.35 + 0.6 * rise;
    halo.material.opacity = 0.3 + 0.35 * rise;
    wide.material.opacity = 0.22 + 0.25 * rise;
  });
  return g;
}

/**
 * Faster Than a Stolen Gun: the fallen red gum the log road runs along
 * across the black water, its trunk under the road, its roots torn up at
 * one end and its broken crown at the other, a lantern hung on a snag.
 */
export function stolenGun(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const len = 70;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3, len, 12), redBark());
  trunk.rotation.x = Math.PI / 2;
  trunk.position.y = -2.2;
  g.add(trunk);
  const roots = new THREE.Mesh(new THREE.CylinderGeometry(7, 5, 2, 10), lambert(0x3a2418, { flatShading: true }));
  roots.rotation.x = Math.PI / 2;
  roots.position.set(0, -1, -len / 2 - 1);
  g.add(roots);
  const crown = deadGumFigure(seededRandom(8801), 1.4);
  crown.rotation.x = Math.PI / 2;
  crown.position.set(0, -2, len / 2);
  g.add(crown);
  const snag = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 5, 5), redBark());
  snag.position.set(5.5, 0.5, 6);
  snag.rotation.z = -0.5;
  g.add(snag);
  const l = lantern(animated, 2);
  l.position.set(6.6, 2.8, 6);
  g.add(l);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A horse at the gallop with its rider, facing +z, its feet at the origin: the parts that move. */
function riderFigure(morgan: boolean): { group: THREE.Group; legs: THREE.Object3D[]; head: THREE.Object3D; arm: THREE.Group; flash: THREE.Sprite; tail: THREE.Object3D } {
  const g = new THREE.Group();
  const hide = horseHide();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.7, 4, 8), hide);
  body.rotation.x = Math.PI / 2;
  body.position.y = 1.55;
  const head = new THREE.Group();
  head.position.set(0, 1.9, 1.3);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.5), hide);
  neck.position.set(0, 0.35, 0.15);
  neck.rotation.x = 0.6;
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.85), hide);
  skull.position.set(0, 0.8, 0.6);
  skull.rotation.x = 0.5;
  head.add(neck, skull);
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.3, 0.8], [0.3, 0.8], [-0.3, -0.8], [0.3, -0.8]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 1.4, z);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.4, 0.18), hide);
    leg.position.y = -0.7;
    hip.add(leg);
    g.add(hip);
    legs.push(hip);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 1.8, -1.3);
  const hair = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.1, 5), charcoal());
  hair.rotation.x = -2.4;
  hair.position.z = -0.4;
  tail.add(hair);
  const rider = manFigure(coat(), morgan);
  rider.group.position.set(0, 1.25, -0.1);
  rider.group.scale.setScalar(morgan ? 1.1 : 1);
  // The rifle, up and out to the side.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.5), darkWood());
  gun.position.set(0, -0.62, 0.6);
  rider.arm.add(gun);
  const flash = sprite(0xffe090, 2.4, 0);
  flash.position.set(0, -0.62, 1.5);
  rider.arm.add(flash);
  g.add(body, head, tail, rider.group);
  return { group: g, legs, head, arm: rider.arm, flash, tail };
}

/** The gang is drawn this much bigger than life, so they read at speed. */
const GANG_LOOK = 1.25;

/**
 * Mad Dog Morgan and his gang at their station, the hazard's look: three
 * dark horses and their riders in long coats and slouch hats, Morgan in
 * front with his black beard, rifles flashing as they gallop, dust thrown
 * up behind them. Nothing on the road before they come: he never gave a
 * warning.
 */
export function gangParts(obj: THREE.Object3D): THREE.Object3D[] {
  const gang = new THREE.Group();
  for (let k = 0; k < GANG_STAGGER.length; k++) {
    const r = riderFigure(k === 0);
    r.group.userData = r;
    r.group.scale.setScalar(GANG_LOOK);
    gang.add(r.group);
  }
  const dust = new THREE.Group();
  for (let k = 0; k < 9; k++) dust.add(smoke(0x6a5040, 3, 0));
  obj.add(gang, dust);
  return [gang, dust];
}

/** Poses the gang's parts (from gangParts) at race time, in the road's frame at the station. */
export function poseGang(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [gang, dust] = parts;
  obj.position.set(p.ax, p.ground, p.az);
  obj.rotation.y = p.heading;
  const reach = p.gap;
  const riding = p.phase >= 0 && p.phase < 1;
  const riders = gangRiders(p.phase, p.side, reach);
  // Down the bank off the road's edge, the road being raised `ground` over the land.
  const drop = (lat: number) => Math.max(-p.ground, -Math.max(0, Math.abs(lat) - reach - 1.5) / BANK);
  riders.forEach((r, k) => {
    const g = gang.children[k];
    const fig = g.userData as ReturnType<typeof riderFigure>;
    g.visible = riding && r.out;
    if (!g.visible) return;
    const gallop = elapsed * 15 + k * 1.9;
    g.position.set(-r.lateral, drop(r.lateral) + 0.2 * Math.abs(Math.sin(gallop)), r.along);
    g.rotation.y = -p.side * (Math.PI / 2);
    fig.legs.forEach((leg, j) => (leg.rotation.x = 0.9 * Math.sin(gallop + (j < 2 ? 0 : Math.PI) + (j % 2) * 0.5)));
    fig.head.rotation.x = 0.15 * Math.sin(gallop);
    fig.tail.rotation.x = 0.3 * Math.sin(gallop * 0.5);
    // Rifles up and firing, each on its own beat.
    fig.arm.rotation.x = -1.3 - 0.2 * Math.sin(elapsed * 3 + k);
    const shot = (elapsed * 2.2 + k * 0.37) % 1;
    fig.flash.material.opacity = shot < 0.08 ? 1 - shot / 0.08 : 0;
  });
  // Dust thrown up in their wake.
  dust.children.forEach((d, k) => {
    const sp = d as THREE.Sprite;
    const r = riders[k % riders.length];
    if (!riding) {
      sp.material.opacity = 0;
      return;
    }
    const lag = 1 + Math.floor(k / riders.length) * 2.2;
    const lat = r.lateral - p.side * lag;
    sp.position.set(-lat, drop(lat) + 0.8, r.along + Math.sin(k * 2.1) * 0.8);
    sp.scale.setScalar(2.5 + lag);
    sp.material.opacity = r.out ? 0.35 / lag : 0;
  });
}
