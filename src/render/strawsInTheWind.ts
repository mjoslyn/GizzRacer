import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { LIGHT_DEPTH, type HazardPose } from '../items/hazards';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import { glowTexture } from './textures';

/**
 * Straws in the Wind's world, the All Stars Cup's first: a sunny field of
 * flowers and windmills going to pandemonium as a tornado of trash and straw
 * sweeps through it, after the song (the chaos of the pandemic, the media
 * whipping up the panic, the feeling these are the end times) and Jason
 * Galea's video (the band playing in a field of flowers and windmills, swept
 * off their feet into the sky by a tornado and playing on up there; made in
 * lockdown with a leaf blower blowing trash round the room). Its textures
 * (the farm track through the flowers, straw blown across it; the field;
 * the weathered boards of the barns, the pier's piles and Hell's Kitchen's
 * cellar; the post-and-rail fence), its scenery (windmills turning,
 * windpumps, round bales, flowers, scarecrows, litter tumbling about,
 * selfish pigs hoarding toilet rolls, headless chickens running in circles,
 * stacks of televisions that never switch off, a red barn), its landmarks
 * (the gate, the trash tornado the road climbs, the Beelzebub Cheshire grin
 * in the sky, Hell's Kitchen singing hymns, the pillars of a forgotten
 * pier, the Short Straw) and its hazard's look (the mortal traffic lights).
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

/** The flowers' colours. */
const FLOWERS = ['#e8202a', '#ffd21a', '#ffffff', '#9a4ad8', '#ff7ac0', '#ff8a1a'];

/** Straws blown across a surface: short gold strokes at every angle, a few broken and darker. */
function strewStraw(ctx: CanvasRenderingContext2D, W: number, H: number, n: number, seed: number, alpha = 0.85): void {
  const rand = seededRandom(seed);
  for (let k = 0; k < n; k++) {
    const x = rand() * W;
    const y = rand() * H;
    const a = rand() * Math.PI;
    const len = 4 + rand() * 12;
    const light = rand();
    ctx.strokeStyle = `rgba(${(220 + light * 35) | 0},${(180 + light * 50) | 0},${(70 + light * 60) | 0},${alpha * (0.5 + rand() * 0.5)})`;
    ctx.lineWidth = 0.8 + rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
}

/**
 * The road: a farm track through the flower fields, pale gold earth packed
 * hard and baked in the sun, two pairs of tyre ruts worn into it (the
 * texture spans half the road: its u across, its v along), a little grass
 * at the edges and up the crown, pebbles, and straw blown right across it.
 * Pale against the green field either side, it reads a long way ahead.
 */
export function farmTrackTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7101);
  const fine = fbm(S, 32, 2, 7102);
  paint(ctx, S, S, (x, _y, i) => {
    const u = x / S;
    const earth: RGB = mix([204, 176, 124], [232, 208, 156], n[i]);
    // Ruts: worn smoother and a shade darker, a pair to each half.
    const rut = Math.max(Math.exp(-(((u - 0.3) / 0.06) ** 2)), Math.exp(-(((u - 0.72) / 0.06) ** 2)));
    let col = mix(earth, [176, 146, 98], rut * 0.55);
    // Grass creeping in at the edge (u near 0) and up the crown (u near 1 and 0 meet in the middle and at the edges).
    const verge = Math.max(0, 1 - Math.min(u, 1 - u) / 0.06);
    col = mix(col, [120, 150, 70], verge * (0.35 + 0.4 * fine[i]));
    return shade(col, 0.9 + fine[i] * 0.18);
  });
  const rand = seededRandom(7103);
  // Pebbles.
  for (let k = 0; k < 260; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(150,126,92,0.6)' : 'rgba(250,236,200,0.6)';
    ctx.fillRect(rand() * S, rand() * S, 1.5, 1.5);
  }
  strewStraw(ctx, S, S, 140, 7104);
  // A petal or two blown off the flowers.
  for (let k = 0; k < 24; k++) {
    ctx.fillStyle = FLOWERS[Math.floor(rand() * FLOWERS.length)];
    ctx.fillRect(rand() * S, rand() * S, 2, 2);
  }
  return finish(c);
}

/** The ground: a field of flowers, green grass thick with poppies, buttercups, daisies and lavender, patches of ripe wheat, straw blown over it all. */
export function flowerFieldTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 5, 7111);
  const patch = fbm(S, 4, 3, 7112);
  paint(ctx, S, S, (_x, _y, i) => {
    const grass: RGB = mix([70, 132, 46], [118, 170, 64], n[i]);
    const wheat: RGB = mix([196, 168, 80], [226, 200, 110], n[i]);
    const p = patch[i];
    const base = p > 0.62 ? mix(grass, wheat, Math.min(1, (p - 0.62) * 6)) : grass;
    return shade(base, 0.82 + n[i] * 0.3);
  });
  const rand = seededRandom(7113);
  // Flowers, thickest in drifts.
  for (let k = 0; k < 9000; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const drift = patch[(Math.floor(y) % S) * S + (Math.floor(x) % S)];
    if (drift > 0.6 && rand() < 0.6) continue;
    const kind = Math.floor(((drift * 3.7 + rand() * 0.6) % 1) * FLOWERS.length);
    ctx.fillStyle = FLOWERS[kind];
    const r = 0.8 + rand() * 1.2;
    ctx.fillRect(x, y, r, r);
  }
  // Blades of grass.
  for (let k = 0; k < 2500; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(40,90,30,0.5)' : 'rgba(160,200,90,0.45)';
    ctx.fillRect(rand() * S, rand() * S, 1, 3);
  }
  strewStraw(ctx, S, S, 220, 7114, 0.6);
  return finish(c);
}

/**
 * Weathered boards: the barns, the pier's old piles, the fence round the
 * world and the walls of Hell's Kitchen's cellar. Grey-brown planks
 * standing on end, their grain silvered by the sun, nail heads, knots, and
 * straw caught in the cracks.
 */
export function boardsTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7121);
  const PLANK = 32;
  const rand = seededRandom(7122);
  const tint = Array.from({ length: S / PLANK }, () => 0.85 + rand() * 0.3);
  paint(ctx, S, S, (x, y, i) => {
    const k = Math.floor(x / PLANK);
    const grain = 0.85 + 0.15 * Math.sin(x * 1.3 + n[i] * 14 + y * 0.02);
    const base = mix([138, 124, 106], [196, 186, 166], n[i]);
    const seam = x % PLANK < 2 ? 0.45 : 1;
    return shade(base, grain * tint[k] * seam);
  });
  for (let k = 0; k < 12; k++) {
    ctx.fillStyle = 'rgba(70,56,42,0.45)';
    ctx.beginPath();
    ctx.ellipse(rand() * S, rand() * S, 2 + rand() * 3, 4 + rand() * 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(30,26,24,0.9)';
  for (let x = PLANK / 2; x < S; x += PLANK) for (const y of [S * 0.12, S * 0.62]) ctx.fillRect(x - 1, y, 2, 2);
  strewStraw(ctx, S, S, 30, 7123, 0.7);
  return finish(c);
}

/** The barrier: a post-and-rail fence, three white-washed rails on weathered posts, the field showing green between them. */
export function fenceTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  const n = fbm(W, 8, 3, 7131);
  paint(ctx, W, H, (_x, y, i) => shade(mix([70, 120, 50], [104, 150, 66], n[i]), 0.85 + 0.15 * (y / H)));
  for (const [y, h] of [
    [H * 0.08, H * 0.18],
    [H * 0.42, H * 0.16],
    [H * 0.74, H * 0.14],
  ]) {
    ctx.fillStyle = '#ece6d8';
    ctx.fillRect(0, y, W, h);
    ctx.fillStyle = 'rgba(120,110,96,0.5)';
    ctx.fillRect(0, y + h - 2, W, 2);
  }
  for (const x of [W * 0.1, W * 0.6]) {
    ctx.fillStyle = '#8a7a64';
    ctx.fillRect(x, 0, 9, H);
    ctx.fillStyle = 'rgba(40,30,20,0.5)';
    ctx.fillRect(x + 7, 0, 2, H);
  }
  return finish(c);
}

const glowTex = once(() => glowTexture());
const timber = once(() => lambert(0x8a6a48));
const darkTimber = once(() => lambert(0x5a4630));
const whitewash = once(() => lambert(0xf0ece0));
const strawMat = once(() => lambert(0xe0bc5c));
const steel = once(() => new THREE.MeshPhongMaterial({ color: 0xa8acb4, specular: 0xffffff, shininess: 60 }));
const pink = once(() => lambert(0xf4a0a8));
const feathers = once(() => lambert(0xf8f4ec));
const tissue = once(() => lambert(0xffffff));

function sprite(color: number, size: number, opacity = 1, fog = true, additive = true): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, transparent: true, opacity, fog }));
  s.scale.setScalar(size);
  return s;
}

/** Where the ribbon is at `s`, and its heading. */
function frameAt(ribbon: Ribbon, s: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x, z: p.z, y: ribbon.heightAt(s), heading: Math.atan2(p.tx, p.tz), tx: p.tx, tz: p.tz };
}

/** Where something `lateral` metres off the road at `s` stands (a lateral to the right is positive). */
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

/** A face of words on a hand-painted farm sign: red letters on cream, a red rule round it. */
const signFace = (() => {
  const made = new Map<string, THREE.CanvasTexture>();
  return (lines: string[], bg = '#f4ead0', fg = '#c8201a'): THREE.CanvasTexture => {
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
    const size = lines.length === 1 ? 88 : lines.length === 2 ? 66 : 50;
    ctx.font = `bold ${size}px Georgia, serif`;
    lines.forEach((line, k) => {
      const w = ctx.measureText(line).width;
      ctx.save();
      ctx.translate(W / 2, H / 2 + (k - (lines.length - 1) / 2) * size * 1.12);
      if (w > W - 60) ctx.scale((W - 60) / w, 1);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
    strewStraw(ctx, W, H, 26, 7141 + key.length, 0.8);
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
  const board = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, w / 2 + 0.3, 0.2), darkTimber());
  g.add(board, front, rear);
  return g;
}

/** A windmill's sail: a lattice spar with a canvas sheet on it, along +y from the hub. */
function sailFigure(len: number, sheet: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const spar = new THREE.Mesh(new THREE.BoxGeometry(len * 0.04, len, len * 0.04), timber());
  spar.position.y = len / 2;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.22, len * 0.78), sheet);
  cloth.position.set(len * 0.12, len * 0.58, 0);
  g.add(spar, cloth);
  return g;
}

const sailCloth = once(() => new THREE.MeshLambertMaterial({ color: 0xf4ecd8, side: THREE.DoubleSide }));

/** A tower windmill `h` tall, its foot at the origin: a tapering tower, a cap, four sails on the front (+z), turning. Returns it and its sails. */
function windmillFigure(h: number, body: THREE.Material): { group: THREE.Group; sails: THREE.Group } {
  const g = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.16, h * 0.26, h, 8), body);
  tower.position.y = h / 2;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(h * 0.21, h * 0.22, 8), darkTimber());
  cap.position.y = h + h * 0.1;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.1, h * 0.16), darkTimber());
  door.position.set(0, h * 0.08, h * 0.255);
  const sails = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const sail = sailFigure(h * 0.62, sailCloth());
    sail.rotation.z = (k / 4) * Math.PI * 2;
    sails.add(sail);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.04, h * 0.04, h * 0.12, 8), darkTimber());
  hub.rotation.x = Math.PI / 2;
  sails.add(hub);
  sails.position.set(0, h * 0.92, h * 0.24);
  g.add(tower, cap, door, sails);
  return { group: g, sails };
}

/** A pig, `s` long, facing +z: pink, round, a snout, ears and a curly tail. */
function pigFigure(s: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(s * 0.5, 12, 10), pink());
  body.scale.set(0.75, 0.7, 1);
  body.position.y = s * 0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.28, 10, 8), pink());
  head.position.set(0, s * 0.6, s * 0.5);
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.12, s * 0.12, s * 0.1, 10), lambert(0xe07a88));
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, s * 0.56, s * 0.78);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(s * 0.08, s * 0.16, 4), pink());
    ear.position.set(side * s * 0.14, s * 0.84, s * 0.5);
    g.add(ear);
    for (const end of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.07, s * 0.07, s * 0.3, 6), pink());
      leg.position.set(side * s * 0.2, s * 0.15, end * s * 0.28);
      g.add(leg);
    }
  }
  g.add(body, head, snout);
  return g;
}

/** A chicken with no head, `s` tall, facing +z: a white body, a tail, wings to flap and two legs. Returns it and its wings. */
function chickenFigure(s: number): { group: THREE.Group; wings: THREE.Object3D[] } {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(s * 0.35, 10, 8), feathers());
  body.scale.set(0.8, 0.9, 1.1);
  body.position.y = s * 0.55;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(s * 0.16, s * 0.3, 6), feathers());
  tail.position.set(0, s * 0.75, -s * 0.36);
  tail.rotation.x = -0.8;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.08, s * 0.1, s * 0.16, 6), lambert(0xc81a1a));
  neck.position.set(0, s * 0.88, s * 0.24);
  const wings: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * s * 0.26, s * 0.62, 0);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(s * 0.36, s * 0.04, s * 0.3), feathers());
    wing.position.x = side * s * 0.18;
    pivot.add(wing);
    pivot.userData.side = side;
    wings.push(pivot);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.03, s * 0.03, s * 0.3, 4), lambert(0xe8a020));
    leg.position.set(side * s * 0.1, s * 0.15, 0);
    g.add(pivot, leg);
  }
  g.add(body, tail, neck);
  return { group: g, wings };
}

/** A roll of toilet paper, `s` across, standing on end. */
function toiletRoll(s: number): THREE.Group {
  const g = new THREE.Group();
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(s / 2, s / 2, s * 0.95, 14), tissue());
  const core = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.2, s * 0.2, s * 0.97, 10), lambert(0x9a7a50));
  g.add(roll, core);
  return g;
}

/** A static of a television screen, and BREAKING across it: the media will never quit. */
const newsTexture = once(() => {
  const W = 128;
  const H = 96;
  const [c, ctx] = canvas(W, H);
  const rand = seededRandom(7151);
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const v = (rand() * 200) | 0;
      ctx.fillStyle = `rgb(${v},${v},${(v * 1.1) | 0})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }
  ctx.fillStyle = '#c8101a';
  ctx.fillRect(0, H * 0.62, W, H * 0.22);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BREAKING', W / 2, H * 0.73);
  return finish(c, false);
});

/**
 * The field going to pandemonium: windmills with their sails turning and
 * windpumps spinning, round bales, drifts of flowers, scarecrows flapping in
 * the wind, litter and toilet rolls tumbling about, selfish pigs on a heap
 * of hoarded toilet rolls, headless chickens running in circles, stacks of
 * old televisions that never switch off, and the odd red barn.
 */
export function strawFeature(animated: Animated): Feature {
  const towerMats = [whitewash(), lambert(0xb84a30), lambert(0xd8c8a8), lambert(0x6a8aa8)];
  const windmill: Feature = (x, z, rand) => {
    const { group, sails } = windmillFigure(13 + rand() * 9, towerMats[Math.floor(rand() * towerMats.length)]);
    const speed = 0.6 + rand() * 1.4;
    const ph = rand() * 6;
    animated.push((time) => (sails.rotation.z = -time * speed - ph));
    return place(group, x, z, rand);
  };
  const vane = lambert(0x9aa0a8);
  const windpump: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 9 + rand() * 4;
    for (const [lx, lz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, h, 5), steel());
      leg.position.set(lx * 0.8, h / 2, lz * 0.8);
      leg.rotation.set(lz * -0.07, 0, lx * 0.07);
      t.add(leg);
    }
    const wheel = new THREE.Group();
    for (let k = 0; k < 16; k++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.8, 0.04), vane);
      blade.position.y = 1.2;
      blade.rotation.y = 0.4;
      const arm = new THREE.Group();
      arm.add(blade);
      arm.rotation.z = (k / 16) * Math.PI * 2;
      wheel.add(arm);
    }
    wheel.position.set(0, h + 0.2, 0.5);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 2), vane);
    tail.position.set(0, h + 0.2, -1.3);
    t.add(wheel, tail);
    const speed = 2 + rand() * 3;
    animated.push((time) => (wheel.rotation.z = time * speed));
    return place(t, x, z, rand);
  };
  const baleGeo = new THREE.CylinderGeometry(0.8, 0.8, 1.3, 14);
  const bale: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(baleGeo, strawMat());
      b.rotation.z = Math.PI / 2;
      b.position.set(k * 1.5 - (n - 1) * 0.75, 0.8, (rand() - 0.5) * 1.2);
      t.add(b);
    }
    if (n > 1 && rand() < 0.5) {
      const top = new THREE.Mesh(baleGeo, strawMat());
      top.rotation.z = Math.PI / 2;
      top.position.set(0, 2.2, 0);
      t.add(top);
    }
    return place(t, x, z, rand);
  };
  const petals = FLOWERS.map((c) => lambert(new THREE.Color(c).getHex()));
  const leaf = lambert(0x3a8a2a);
  const flowerGeo = new THREE.SphereGeometry(0.22, 6, 5);
  const flowers: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const bush = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), leaf);
    bush.scale.set(1.4 + rand(), 0.6 + rand() * 0.4, 1.4 + rand());
    bush.position.y = 0.4;
    t.add(bush);
    const mat = petals[Math.floor(rand() * petals.length)];
    for (let k = 0; k < 14; k++) {
      const f = new THREE.Mesh(flowerGeo, rand() < 0.8 ? mat : petals[Math.floor(rand() * petals.length)]);
      const a = rand() * Math.PI * 2;
      const r = rand() * 1.6;
      f.position.set(Math.cos(a) * r, 0.7 + rand() * 0.5, Math.sin(a) * r);
      t.add(f);
    }
    return place(t, x, z, rand);
  };
  const shirt = [lambert(0x3a5a9a), lambert(0x9a3a2a), lambert(0x5a7a3a)];
  const scarecrow: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 6), darkTimber());
    pole.position.y = 1.6;
    const body = new THREE.Group();
    body.position.y = 2.2;
    const coat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.4), shirt[Math.floor(rand() * shirt.length)]);
    const arms = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.22), coat.material);
    arms.position.y = 0.35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), lambert(0xe8d8a8));
    head.position.y = 0.85;
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.45, 10), strawMat());
    hat.position.y = 1.15;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.05, 12), strawMat());
    brim.position.y = 0.98;
    // Straw sticking out of the cuffs.
    for (const side of [-1, 1]) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 5), strawMat());
      tuft.rotation.z = side * (Math.PI / 2);
      tuft.position.set(side * 1.35, 0.35, 0);
      body.add(tuft);
    }
    body.add(coat, arms, head, hat, brim);
    t.add(pole, body);
    const ph = rand() * 10;
    animated.push((time) => (body.rotation.z = 0.12 * Math.sin(time * 2.3 + ph) + 0.05 * Math.sin(time * 7 + ph)));
    return place(t, x, z, rand);
  };
  const can = lambert(0xc8282a);
  const paper = new THREE.MeshLambertMaterial({ color: 0xf4f0e6, side: THREE.DoubleSide });
  const bottle = new THREE.MeshPhongMaterial({ color: 0x2a8a4a, specular: 0xffffff, shininess: 80, transparent: true, opacity: 0.8 });
  const litterPiece = (rand: () => number): THREE.Object3D => {
    const r = rand();
    if (r < 0.3) return toiletRoll(0.5);
    if (r < 0.5) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 8), can);
      return m;
    }
    if (r < 0.65) return new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.6, 8), bottle);
    return new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), paper);
  };
  const litter: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const flying: { o: THREE.Object3D; r: number; h: number; w: number; ph: number }[] = [];
    for (let k = 0; k < 8; k++) {
      const piece = litterPiece(rand);
      if (k < 3) {
        piece.position.set((rand() - 0.5) * 4, 0.2, (rand() - 0.5) * 4);
        piece.rotation.set(Math.PI / 2, rand() * 6, 0);
      } else flying.push({ o: piece, r: 1 + rand() * 3, h: 0.5 + rand() * 4, w: 1.5 + rand() * 2, ph: rand() * 6 });
      t.add(piece);
    }
    // Tumbling round in the gusts.
    animated.push((time) => {
      for (const f of flying) {
        const a = time * f.w + f.ph;
        f.o.position.set(Math.cos(a) * f.r, f.h + Math.sin(time * 1.7 + f.ph) * 0.8, Math.sin(a) * f.r);
        f.o.rotation.set(time * 3 + f.ph, time * 2, time * 1.3);
      }
    });
    return place(t, x, z, rand);
  };
  const pigs: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    // Their hoard: a heap of toilet rolls.
    for (let k = 0; k < 14; k++) {
      const roll = toiletRoll(0.55);
      const a = rand() * Math.PI * 2;
      const r = rand() * 0.9;
      roll.position.set(Math.cos(a) * r, 0.27 + Math.floor(k / 6) * 0.5, Math.sin(a) * r);
      t.add(roll);
    }
    const n = 2 + Math.floor(rand() * 3);
    const herd: { o: THREE.Object3D; a: number; ph: number }[] = [];
    for (let k = 0; k < n; k++) {
      const pig = pigFigure(1.6 + rand() * 0.5);
      const a = (k / n) * Math.PI * 2 + rand();
      pig.position.set(Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4);
      // Facing the hoard, guarding it.
      pig.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      t.add(pig);
      herd.push({ o: pig, a, ph: rand() * 6 });
    }
    animated.push((time) => {
      for (const p of herd) {
        p.o.position.y = Math.abs(Math.sin(time * 5 + p.ph)) * 0.08;
        p.o.rotation.z = 0.05 * Math.sin(time * 5 + p.ph);
      }
    });
    return place(t, x, z, rand);
  };
  const chickens: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 3 + Math.floor(rand() * 4);
    const flock: { o: THREE.Object3D; wings: THREE.Object3D[]; r: number; w: number; ph: number }[] = [];
    for (let k = 0; k < n; k++) {
      const { group, wings } = chickenFigure(0.8 + rand() * 0.3);
      t.add(group);
      flock.push({ o: group, wings, r: 1.5 + rand() * 4, w: (rand() < 0.5 ? -1 : 1) * (2 + rand() * 2.5), ph: rand() * 6 });
    }
    // Running round in circles, flapping, scared witless.
    animated.push((time) => {
      for (const c of flock) {
        const a = time * c.w + c.ph;
        c.o.position.set(Math.cos(a) * c.r, Math.abs(Math.sin(time * 14 + c.ph)) * 0.15, Math.sin(a) * c.r);
        c.o.rotation.y = -a + (c.w > 0 ? Math.PI : 0);
        for (const w of c.wings) w.rotation.z = w.userData.side * (0.3 + 0.7 * Math.abs(Math.sin(time * 18 + c.ph)));
      }
    });
    return place(t, x, z, rand);
  };
  const casing = lambert(0x4a3a30);
  const screen = new THREE.MeshBasicMaterial({ map: newsTexture() });
  const tellies: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 3 + Math.floor(rand() * 4);
    const screens: THREE.Mesh[] = [];
    for (let k = 0; k < n; k++) {
      const row = k < 3 ? 0 : k < 5 ? 1 : 2;
      const col = k < 3 ? k - 1 : k < 5 ? k - 3.5 : 0;
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.1), casing);
      box.position.set(col * 1.5, 0.55 + row * 1.15, 0);
      box.rotation.y = (rand() - 0.5) * 0.3;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), screen);
      face.position.z = 0.56;
      box.add(face);
      t.add(box);
      screens.push(face);
    }
    const ph = rand() * 10;
    animated.push((time) => {
      // The static rolls, and never stops.
      screen.map!.offset.set(0, (time * 3.1 + ph) % 1);
      screens.forEach((sc, k) => (sc.visible = Math.sin(time * 9 + k * 2.1 + ph) > -0.95));
    });
    return place(t, x, z, rand);
  };
  const barnRed = lambert(0xa82a22);
  const roofMat = lambert(0x4a4a50);
  const barn: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 10 + rand() * 4;
    const d = 14 + rand() * 6;
    const h = 6;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), barnRed);
    walls.position.y = h / 2;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.72, w * 0.72, d + 1, 4, 1, false, Math.PI / 4, Math.PI / 2), roofMat);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.y = h;
    roof.scale.set(1, 1, 0.55);
    const doors = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.45, h * 0.7), whitewash());
    doors.position.set(0, h * 0.35, d / 2 + 0.05);
    t.add(walls, roof, doors);
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [3, windmill],
      [1.2, windpump],
      [2.6, bale],
      [3, flowers],
      [1.2, scarecrow],
      [1.6, litter],
      [0.9, pigs],
      [1, chickens],
      [0.7, tellies],
      [0.5, barn],
    ])(x, z, rand);
}

/** The gate's sign. */
const gateFace = once(() => signFace(['STRAWS IN THE WIND']));

/**
 * The start: a farm gate of rough timber over the line, STRAWS IN THE WIND
 * painted on its beam, a windmill's head on top with its sails turning,
 * round bales stacked at its feet, and straw streaming off it in the wind.
 */
export function strawsGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const H = 9;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.1, H, 1.1), timber());
    post.position.set(side * (hw + 0.8), H / 2, 0);
    g.add(post);
    for (let k = 0; k < 3; k++) {
      const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 14), strawMat());
      bale.rotation.z = Math.PI / 2;
      bale.position.set(side * (hw + 2.6 + k * 0.4), 0.9 + (k === 2 ? 1.7 : 0), k === 1 ? 1.8 : k === 2 ? 0.9 : 0);
      g.add(bale);
    }
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 2.8, 1, 1), timber());
  beam.position.y = H;
  const brace = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 2.8, 0.5, 0.5), timber());
  brace.position.y = H - 3.6;
  const sign = signPanel(12, gateFace());
  sign.scale.y = 0.5;
  sign.position.y = H - 1.8;
  g.add(beam, brace, sign);
  // A windmill's head up on the beam, facing the karts, its sails turning.
  const { group: mill, sails } = windmillFigure(7, whitewash());
  mill.position.y = H + 0.5;
  mill.rotation.y = Math.PI;
  g.add(mill);
  // Straw streaming off it.
  const wisps: THREE.Sprite[] = [];
  for (let k = 0; k < 10; k++) {
    const w = sprite(0xffd870, 1.2, 0.6, true, false);
    wisps.push(w);
    g.add(w);
  }
  animated.push((time) => {
    sails.rotation.z = time * 1.4;
    wisps.forEach((w, k) => {
      const u = (time * 0.35 + k / wisps.length) % 1;
      w.position.set(-hw + u * 2 * hw, H + 1 + Math.sin(u * 9 + k) * 2, Math.sin(k * 1.7) * 3);
      w.material.opacity = 0.6 * Math.sin(u * Math.PI);
    });
  });
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The funnel's swirl: streaks of dust, straw and trash wound round it, see-through. */
const swirlTexture = once(() => {
  const W = 256;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  const rand = seededRandom(7161);
  for (let k = 0; k < 420; k++) {
    const x = rand() * W;
    const y = rand() * H;
    const len = 20 + rand() * 80;
    const r = rand();
    ctx.strokeStyle = r < 0.55 ? `rgba(150,128,100,${0.15 + rand() * 0.3})` : r < 0.8 ? `rgba(232,196,96,${0.25 + rand() * 0.4})` : `rgba(250,248,240,${0.3 + rand() * 0.4})`;
    ctx.lineWidth = 1 + rand() * 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Wound round: streaks lean along the swirl.
    ctx.lineTo(x + len, y - len * 0.25);
    ctx.stroke();
    // Wrap the far end round so it tiles.
    ctx.beginPath();
    ctx.moveTo(x - W, y);
    ctx.lineTo(x - W + len, y - len * 0.25);
    ctx.stroke();
  }
  return finish(c);
});

/** How wide the trash tornado's funnel is `y` metres up: a narrow foot inside the road's first turn, widening up into the cloud. */
export function funnelRadius(y: number): number {
  if (y < 30) return 7 + y * 0.45;
  return 20.5 + (y - 30) ** 1.35 * 0.22;
}

/**
 * The trash tornado: the funnel the road spirals up round, standing in its
 * eye (`lateral` off the road at `s`; far off it when that's 0). Layers of
 * swirling dust, straw and trash winding up into a cloud, a skirt of debris
 * at its foot, and everything the gale has picked up whirling round it:
 * toilet rolls, cans, bottles, newspapers, straw, a leaf blower, a guitar
 * and a flute, the band's, still being played up there.
 */
export function trashTornado(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const off = lateral || -(ribbon.halfWidthAtS(s) + 70);
  const at = offRoad(ribbon, s, off);
  const H = 170;
  const profile: THREE.Vector2[] = [];
  for (let y = 0; y <= H; y += 5) profile.push(new THREE.Vector2(funnelRadius(y), y));
  const layers: THREE.Mesh[] = [];
  for (let k = 0; k < 3; k++) {
    const map = swirlTexture().clone();
    map.needsUpdate = true;
    map.repeat.set(3 + k, 4);
    const mat = new THREE.MeshBasicMaterial({ map, color: [0xd8c8a8, 0xb8a888, 0xf0e4c0][k], transparent: true, opacity: [0.75, 0.55, 0.4][k], depthWrite: false, side: THREE.DoubleSide });
    const shell = new THREE.Mesh(new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p.x * (0.8 + k * 0.14), p.y)), 32), mat);
    layers.push(shell);
    g.add(shell);
  }
  // The cloud it hangs from.
  const cloud = new THREE.Group();
  for (let k = 0; k < 14; k++) {
    const puff = sprite(0x8a8478, 70 + (k % 4) * 20, 0.75, false, false);
    const a = (k / 14) * Math.PI * 2;
    puff.position.set(Math.cos(a) * 70, H + 10 + (k % 3) * 8, Math.sin(a) * 70);
    cloud.add(puff);
  }
  const core = sprite(0x6a6458, 160, 0.8, false, false);
  core.position.y = H + 18;
  cloud.add(core);
  g.add(cloud);
  // Dust kicked up round its foot.
  const skirt: THREE.Sprite[] = [];
  for (let k = 0; k < 10; k++) {
    const d = sprite(0xc8b08a, 14, 0.5, true, false);
    skirt.push(d);
    g.add(d);
  }
  // Everything it has picked up, whirling round.
  const rand = seededRandom(7171);
  const can = lambert(0xc8282a);
  const paper = new THREE.MeshLambertMaterial({ color: 0xf4f0e6, side: THREE.DoubleSide });
  const bottle = lambert(0x2a8a4a);
  const orange = lambert(0xf07a1a);
  const guitarWood = lambert(0xb86a2a);
  const debris: { o: THREE.Object3D; y: number; r: number; w: number; ph: number; spin: number }[] = [];
  const make = (k: number): THREE.Object3D => {
    const kind = k % 9;
    if (kind === 0 || kind === 1) {
      const roll = toiletRoll(1.6);
      return roll;
    }
    if (kind === 2) return new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.3, 8), can);
    if (kind === 3) return new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.8), paper);
    if (kind === 4) return new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 1.9, 8), bottle);
    if (kind === 5) return new THREE.Mesh(new THREE.BoxGeometry(0.25, 4, 0.25), strawMat());
    if (kind === 6) {
      // The leaf blower that started it all.
      const t = new THREE.Group();
      const motor = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.8), orange);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3.2, 8), orange);
      tube.rotation.x = Math.PI / 2;
      tube.position.z = 2.2;
      t.add(motor, tube);
      return t;
    }
    if (kind === 7) {
      const t = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.4, 14), guitarWood);
      body.rotation.x = Math.PI / 2;
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.2), darkTimber());
      neck.position.y = 2.1;
      t.add(body, neck);
      return t;
    }
    return new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6), steel());
  };
  for (let k = 0; k < 64; k++) {
    const y = 22 + rand() * (H - 30);
    const o = make(k);
    debris.push({ o, y, r: funnelRadius(y) + 3 + rand() * 14, w: (1.3 - y / (H * 1.4)) * (0.6 + rand() * 0.5), ph: rand() * Math.PI * 2, spin: 1 + rand() * 3 });
    g.add(o);
  }
  animated.push((time) => {
    layers.forEach((l, k) => {
      l.rotation.y = time * (1.1 + k * 0.45);
      ((l.material as THREE.MeshBasicMaterial).map as THREE.Texture).offset.y = (time * (0.05 + k * 0.03)) % 1;
    });
    cloud.rotation.y = time * 0.15;
    skirt.forEach((d, k) => {
      const a = time * 1.6 + (k / skirt.length) * Math.PI * 2;
      const u = (time * 0.3 + k / skirt.length) % 1;
      d.position.set(Math.cos(a) * (8 + u * 6), 2 + u * 10, Math.sin(a) * (8 + u * 6));
      d.material.opacity = 0.5 * Math.sin(u * Math.PI);
    });
    for (const d of debris) {
      const a = time * d.w + d.ph;
      d.o.position.set(Math.cos(a) * d.r, d.y + Math.sin(time * 0.7 + d.ph) * 4, Math.sin(a) * d.r);
      d.o.rotation.set(time * d.spin, time * d.spin * 0.7 + d.ph, time * 0.5);
    }
  });
  g.position.set(at.x, 0, at.z);
  return g;
}

/**
 * The Beelzebub Cheshire grin in the sky: a vast crescent of a smile, its
 * teeth sharp, its lips livid, two horns over it and two yellow eyes with
 * slit pupils, standing far ahead of the road at `s` over the field. The
 * eyes and the horns fade away and come back, as a Cheshire cat's do; the
 * grin stays.
 */
export function cheshireGrin(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const AHEAD = 330;
  const at = { x: f.x + Math.sin(f.heading) * AHEAD, z: f.z + Math.cos(f.heading) * AHEAD };
  const face = new THREE.Group();
  const W = 70;
  // The mouth: a crescent, wide at the middle, the lips round it.
  const mouth = new THREE.Shape();
  const N = 24;
  for (let k = 0; k <= N; k++) {
    const u = k / N;
    const x = (u - 0.5) * 2 * W;
    mouth.lineTo(x, 18 * (u - 0.5) ** 2 * 4 - 18 + 8);
  }
  for (let k = N; k >= 0; k--) {
    const u = k / N;
    const x = (u - 0.5) * 2 * W * 0.96;
    mouth.lineTo(x, 30 * (u - 0.5) ** 2 * 4 - 30 + 2 - 8 * (1 - 4 * (u - 0.5) ** 2));
  }
  const lipMat = new THREE.MeshBasicMaterial({ color: 0xc8187a, fog: false, transparent: true, side: THREE.DoubleSide });
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x1a0410, fog: false, transparent: true, side: THREE.DoubleSide });
  const lips = new THREE.Mesh(new THREE.ShapeGeometry(mouth, 4), lipMat);
  lips.scale.set(1.06, 1.12, 1);
  lips.position.z = -0.5;
  const inside = new THREE.Mesh(new THREE.ShapeGeometry(mouth, 4), darkMat);
  face.add(lips, inside);
  // The teeth, sharp, along the top and bottom of the mouth.
  const toothMat = new THREE.MeshBasicMaterial({ color: 0xfff8e8, fog: false, transparent: true, side: THREE.DoubleSide });
  const toothGeo = new THREE.ConeGeometry(2.6, 8, 3);
  for (let k = 1; k < 18; k++) {
    const u = k / 18;
    const x = (u - 0.5) * 2 * W * 0.9;
    const top = new THREE.Mesh(toothGeo, toothMat);
    top.position.set(x, 18 * (u - 0.5) ** 2 * 4 - 18 + 8 - 4, 0.5);
    top.rotation.z = Math.PI;
    const bottom = new THREE.Mesh(toothGeo, toothMat);
    bottom.position.set(x * 0.96, 30 * (u - 0.5) ** 2 * 4 - 30 + 2 - 8 * (1 - 4 * (u - 0.5) ** 2) + 4, 0.5);
    face.add(top, bottom);
  }
  // The eyes, gold with slit pupils, and the horns: these come and go.
  const fading: THREE.Material[] = [];
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd21a, fog: false, transparent: true, side: THREE.DoubleSide });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x100408, fog: false, transparent: true, side: THREE.DoubleSide });
  const hornMat = new THREE.MeshBasicMaterial({ color: 0x9a1010, fog: false, transparent: true, side: THREE.DoubleSide });
  fading.push(eyeMat, pupilMat, hornMat);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(11, 24), eyeMat);
    eye.scale.set(1.3, 0.8, 1);
    eye.rotation.z = side * -0.25;
    eye.position.set(side * 34, 34, 0);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(9, 16), pupilMat);
    pupil.scale.set(0.22, 1, 1);
    pupil.position.set(side * 34, 34, 0.4);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(7, 34, 10), hornMat);
    horn.position.set(side * 48, 62, -0.5);
    horn.rotation.z = side * -0.45;
    face.add(eye, pupil, horn);
  }
  const glow = sprite(0xff3a8a, 260, 0.25, false);
  glow.position.z = -4;
  face.add(glow);
  g.add(face);
  animated.push((time) => {
    // Fading in and out, slowly; the grin stays, and widens a little.
    const there = 0.5 + 0.5 * Math.sin(time * 0.35);
    for (const m of fading) (m as THREE.MeshBasicMaterial).opacity = there;
    face.scale.set(1 + 0.04 * Math.sin(time * 0.5), 1, 1);
    face.position.y = 4 * Math.sin(time * 0.27);
    glow.material.opacity = 0.18 + 0.1 * there;
  });
  g.position.set(at.x, 120, at.z);
  // Facing back at the road.
  g.lookAt(f.x, 120, f.z);
  return g;
}

/** Hell's Kitchen's tiles: white and black, sooted and cracked, a red band of tiles round at shoulder height. */
const tileTexture = once(() => {
  const S = 128;
  const [c, ctx] = canvas(S);
  const rand = seededRandom(7181);
  const T = 16;
  for (let y = 0; y < S; y += T) {
    for (let x = 0; x < S; x += T) {
      const dark = (x / T + y / T) % 2 === 1;
      const band = y === T * 3;
      const v = 0.85 + rand() * 0.15;
      ctx.fillStyle = band ? `rgb(${(170 * v) | 0},20,24)` : dark ? `rgb(${(40 * v) | 0},${(36 * v) | 0},${(36 * v) | 0})` : `rgb(${(232 * v) | 0},${(226 * v) | 0},${(214 * v) | 0})`;
      ctx.fillRect(x, y, T, T);
    }
  }
  ctx.strokeStyle = 'rgba(90,80,70,0.8)';
  ctx.lineWidth = 1;
  for (let k = 0; k <= S; k += T) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k, S);
    ctx.moveTo(0, k);
    ctx.lineTo(S, k);
    ctx.stroke();
  }
  // Soot, rising from below.
  const grad = ctx.createLinearGradient(0, S, 0, 0);
  grad.addColorStop(0, 'rgba(20,10,8,0.55)');
  grad.addColorStop(0.5, 'rgba(20,10,8,0.1)');
  grad.addColorStop(1, 'rgba(20,10,8,0.3)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  return finish(c);
});

/** Hell's Kitchen's sign. */
const kitchenFace = once(() => signFace(["HELL'S KITCHEN"], '#1a0806', '#ff6a1a'));

/** A hymn's note, drifting up out of the kitchen. */
const noteTexture = once(() => {
  const S = 64;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#ffe0a0';
  ctx.font = 'bold 48px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♪', S / 2, S / 2);
  return finish(c, false);
});

/**
 * Hell's Kitchen, singing hymns: the sunk stretch of road from `s` to `to`
 * dressed as a cellar kitchen: its walls tiled and sooted, ranges along the
 * rim with their burners roaring, cauldrons steaming over them, a red glow
 * down in it, a choir of chefs along the rim with their hymn books, singing,
 * the notes drifting up, and the sign over the way in.
 */
export function hellsKitchen(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const sunk: number[] = [];
  for (let d = s; d < to; d += 2) if (ribbon.heightAt(d) < -2.5) sunk.push(d);
  if (!sunk.length) return g;
  const a = sunk[0];
  const b = sunk[sunk.length - 1];
  const tiles = new THREE.MeshLambertMaterial({ map: tileTexture(), side: THREE.DoubleSide });
  // The tiled walls, a panel to each few metres of each side, from the road up to the rim.
  for (let d = a; d < b; d += 4) {
    const p0 = pointAt(ribbon.spline, d);
    const p1 = pointAt(ribbon.spline, Math.min(b, d + 4));
    const y0 = ribbon.heightAt(d);
    for (const side of [-1, 1]) {
      const lat = side * (ribbon.halfWidthAtS(d) + 0.25);
      const x0 = p0.x - p0.tz * lat;
      const z0 = p0.z + p0.tx * lat;
      const x1 = p1.x - p1.tz * lat;
      const z1 = p1.z + p1.tx * lat;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const h = -y0 + 0.5;
      const geo = new THREE.PlaneGeometry(len, h);
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (len / 2), uv.getY(k) * (h / 2));
      const panel = new THREE.Mesh(geo, tiles);
      panel.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
      panel.rotation.y = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
      g.add(panel);
    }
  }
  // Ranges along the rim, burners roaring, cauldrons steaming; chefs singing between.
  const iron = lambert(0x2a2624);
  const copper = new THREE.MeshPhongMaterial({ color: 0xb86a3a, specular: 0xffc080, shininess: 50 });
  const chefWhite = lambert(0xf8f8f4);
  const book = lambert(0x2a1a4a);
  const flames: THREE.Sprite[] = [];
  const steam: THREE.Sprite[] = [];
  const choir: THREE.Object3D[] = [];
  let k = 0;
  for (let d = a + 6; d < b; d += 11, k++) {
    for (const side of [-1, 1]) {
      const o = offRoad(ribbon, d, side * (ribbon.halfWidthAtS(d) + 4.5));
      const t = new THREE.Group();
      if ((k + (side > 0 ? 1 : 0)) % 2 === 0) {
        const range = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 1.6), iron);
        range.position.y = 0.5;
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 1.2, 14), copper);
        pot.position.y = 1.6;
        const fire = sprite(0x4a8aff, 1.6, 0.9);
        fire.position.set(0.7, 1.1, 0);
        const blaze = sprite(0xff6a1a, 2.4, 0.8);
        blaze.position.set(0, 1.05, 0);
        const puff = sprite(0xf0f0f0, 3, 0.4, true, false);
        puff.position.y = 2.6;
        t.add(range, pot, fire, blaze, puff);
        flames.push(fire, blaze);
        steam.push(puff);
      } else {
        // A chef in the choir: whites, a tall toque, a hymn book open.
        const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.6, 10), chefWhite);
        coat.position.y = 0.8;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), lambert(0xe8b896));
        head.position.y = 1.85;
        const toque = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.3, 0.7, 10), chefWhite);
        toque.position.y = 2.4;
        const hymns = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.08), book);
        hymns.position.set(0, 1.35, 0.45);
        hymns.rotation.x = -0.6;
        t.add(coat, head, toque, hymns);
        choir.push(t);
      }
      t.position.set(o.x, 0, o.z);
      // Facing the road below.
      t.rotation.y = o.heading - side * (Math.PI / 2);
      g.add(t);
    }
  }
  // The red glow down in it, and the hymns rising out of it.
  for (let d = a; d < b; d += 18) {
    const f = frameAt(ribbon, d);
    const glow = sprite(0xff3010, 22, 0.35);
    glow.position.set(f.x, f.y + 3, f.z);
    g.add(glow);
  }
  const notes: { o: THREE.Sprite; d: number; side: number; ph: number }[] = [];
  for (let n = 0; n < 16; n++) {
    const o = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTexture(), transparent: true, depthWrite: false }));
    o.scale.setScalar(1.6);
    notes.push({ o, d: a + ((b - a) * n) / 16, side: n % 2 ? 1 : -1, ph: n / 16 });
    g.add(o);
  }
  // The sign over the way in.
  const f0 = frameAt(ribbon, Math.max(s, a - 25));
  const hw0 = ribbon.halfWidthAtS(a) + 1.5;
  const gate = new THREE.Group();
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), darkTimber());
    post.position.set(side * (hw0 + 0.6), 4, 0);
    gate.add(post);
  }
  const sign = signPanel(11, kitchenFace());
  sign.scale.y = 0.55;
  sign.position.y = 7;
  gate.add(sign);
  gate.position.set(f0.x, Math.max(0, f0.y), f0.z);
  gate.rotation.y = f0.heading;
  g.add(gate);
  animated.push((time) => {
    flames.forEach((fl, j) => (fl.material.opacity = 0.65 + 0.3 * Math.sin(time * 17 + j * 1.9)));
    steam.forEach((st, j) => {
      const u = (time * 0.4 + j * 0.37) % 1;
      st.position.y = 2.4 + u * 3;
      st.material.opacity = 0.45 * (1 - u);
    });
    // Singing: swaying and bobbing together on the hymn's slow three.
    choir.forEach((c, j) => {
      c.rotation.z = 0.06 * Math.sin(time * 2.2 + j * 0.3);
      c.position.y = 0.06 * Math.abs(Math.sin(time * 2.2));
    });
    for (const n of notes) {
      const u = (time * 0.18 + n.ph) % 1;
      const p = offRoad(ribbon, n.d, n.side * (ribbon.halfWidthAtS(n.d) * 0.6));
      n.o.position.set(p.x, ribbon.heightAt(n.d) + 2 + u * 14, p.z);
      n.o.material.opacity = Math.sin(u * Math.PI);
    }
  });
  return g;
}

/** The pier's sign, its paint long faded. */
const pierFace = once(() => signFace(['PIER'], '#d8d0c0', '#6a8a9a'));

/**
 * We are the pillars of a forgotten pier: along the deck from `s` to `to`,
 * the old piles of a seaside pier standing up past it either side in pairs,
 * crusted with barnacles and weed though there's no sea for miles, its
 * lamp posts with their lamps cracked, lifebuoys hung on them, gulls
 * perched on the piles, and its faded sign.
 */
export function forgottenPier(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const pile = new THREE.CylinderGeometry(0.55, 0.65, 1, 10);
  const barnacle = lambert(0xc8c4b0);
  const weed = lambert(0x3a5a3a);
  const buoyMat = [lambert(0xe8302a), lambert(0xf8f4ec)];
  const lampGlass = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
  const gulls: THREE.Object3D[] = [];
  let k = 0;
  for (let d = s; d <= to; d += 12, k++) {
    const y = ribbon.heightAt(d);
    for (const side of [-1, 1]) {
      const o = offRoad(ribbon, d, side * (ribbon.halfWidthAtS(d) + 1.4));
      const h = Math.max(4, y + 3.2);
      const p = new THREE.Mesh(pile, darkTimber());
      p.scale.y = h;
      p.position.set(o.x, h / 2, o.z);
      g.add(p);
      // Barnacles and weed in a band round the foot, where the tide would have been.
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.78, 1.4, 10), barnacle);
      band.position.set(o.x, 1.2, o.z);
      const fringe = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.5, 10), weed);
      fringe.position.set(o.x, 2.1, o.z);
      g.add(band, fringe);
      if (k % 3 === 1 && side > 0) {
        // A lamp post, its lamp cracked and dim, a lifebuoy hung on it.
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 4, 8), lambert(0x2a4a5a));
        post.position.set(o.x, h + 2, o.z);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), lampGlass);
        lamp.position.set(o.x, h + 4.2, o.z);
        const buoy = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.16, 6, 14), buoyMat[k % 2]);
        buoy.position.set(o.x, h + 1.2, o.z);
        buoy.rotation.y = o.heading;
        g.add(post, lamp, buoy);
      }
      if ((k + side) % 4 === 0) {
        // A gull, perched, looking about.
        const gull = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), lambert(0xf4f4f0));
        body.scale.set(0.8, 0.8, 1.4);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lambert(0xf4f4f0));
        head.position.set(0, 0.25, 0.32);
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), lambert(0xf0b020));
        beak.rotation.x = Math.PI / 2;
        beak.position.set(0, 0.24, 0.5);
        gull.add(body, head, beak);
        gull.position.set(o.x, h + 0.3, o.z);
        g.add(gull);
        gulls.push(gull);
      }
    }
  }
  const f = frameAt(ribbon, s);
  const sign = signPanel(5, pierFace());
  sign.scale.y = 0.6;
  const o = offRoad(ribbon, s, -(ribbon.halfWidthAtS(s) + 3));
  sign.position.set(o.x, f.y + 4.5, o.z);
  sign.rotation.y = f.heading;
  g.add(sign);
  animated.push((time) => gulls.forEach((gl, j) => (gl.rotation.y = 1.5 * Math.sin(time * 0.6 + j * 2.3) + (Math.sin(time * 3 + j) > 0.9 ? 0.4 : 0))));
  return g;
}

/** The Short Straw's sign. */
const strawFace = once(() => signFace(['THE SHORT STRAW']));

/**
 * The Short Straw: at the mouth of the lane through the wheat, a sign and a
 * great fistful of straws held up out of the field, every one long but one,
 * and round bales lining the lane.
 */
export function shortStraw(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s);
  const sign = signPanel(6, strawFace());
  sign.scale.y = 0.6;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 0.3), darkTimber());
  post.position.set(-(hw + 3), 1.7, 0);
  sign.position.set(-(hw + 3), 3.6, 0);
  g.add(post, sign);
  // The fistful of straws: all long, but one.
  const fist = new THREE.Group();
  const hand = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10), lambert(0xe8b896));
  hand.scale.set(1, 1.3, 0.9);
  fist.add(hand);
  const straws: THREE.Mesh[] = [];
  for (let k = 0; k < 7; k++) {
    const len = k === 4 ? 1.6 : 7;
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 6), strawMat());
    straw.position.set((k - 3) * 0.3, 1.2 + len / 2, 0);
    fist.add(straw);
    straws.push(straw);
  }
  fist.position.set(hw + 5, 1.2, 4);
  g.add(fist);
  const baleGeo = new THREE.CylinderGeometry(0.8, 0.8, 1.3, 14);
  for (let d = 10; d < 70; d += 12) {
    for (const side of [-1, 1]) {
      const bale = new THREE.Mesh(baleGeo, strawMat());
      bale.rotation.z = Math.PI / 2;
      bale.position.set(side * (hw + 2.2), 0.8, d);
      g.add(bale);
    }
  }
  animated.push((time) => straws.forEach((st, k) => (st.rotation.z = 0.08 * Math.sin(time * 2.6 + k))));
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The colours a mortal traffic light shows, and the dark of an unlit lamp. */
const LIGHT_HEX = [0x2aff5a, 0xffb21a, 0xff2a1a] as const;
const UNLIT = 0x1a1a14;
const HEADS = 3;

/**
 * A gantry of mortal traffic lights, the hazard's look: two leaning timber
 * poles at the road's edges with a beam across, three signal heads hung
 * from it facing the karts coming (red over amber over green), the stop
 * line painted across the road in whatever colour they show, glowing, and,
 * on red, a curtain of red light across the road: stay.
 */
export function trafficLightParts(obj: THREE.Object3D): THREE.Object3D[] {
  const rig = new THREE.Group();
  const pole = new THREE.BoxGeometry(0.5, 1, 0.5);
  const poles: THREE.Mesh[] = [];
  for (let k = 0; k < 2; k++) {
    const p = new THREE.Mesh(pole, darkTimber());
    poles.push(p);
    rig.add(p);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1, 0.45, 0.45), darkTimber());
  rig.add(beam);
  const heads = new THREE.Group();
  const housing = lambert(0x1e2a1e);
  for (let h = 0; h < HEADS; h++) {
    const head = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3, 0.8), housing);
    box.position.y = -1.7;
    head.add(box);
    for (let c = 0; c < 3; c++) {
      // Red at the top, green at the bottom; each lamp faces the oncoming karts (-z).
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.38, 16), new THREE.MeshBasicMaterial({ color: UNLIT }));
      lamp.rotation.y = Math.PI;
      lamp.position.set(0, -0.7 - (2 - c) * 0.95, -0.42);
      lamp.userData.colour = c;
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 12, 1, true, -Math.PI / 2, Math.PI), housing);
      visor.rotation.x = Math.PI / 2;
      visor.position.set(0, lamp.position.y + 0.1, -0.6);
      head.add(lamp, visor);
    }
    const halo = sprite(0xffffff, 5, 0);
    halo.position.set(0, -1.7, -1);
    head.add(halo);
    heads.add(head);
  }
  rig.add(heads);
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: LIGHT_HEX[0], transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.09;
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xf8f4e8 }));
  paint.rotation.x = -Math.PI / 2;
  paint.position.y = 0.07;
  const curtain = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  obj.add(rig, paint, line, curtain);
  return [rig, paint, line, curtain, ...poles, beam, heads];
}

/** Poses a gantry of traffic lights (from trafficLightParts) across the road, lit as `p.lane` has it, rocking in the gale. */
export function poseTrafficLight(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [rig, paint, line, curtain, poleL, poleR, beam, heads] = parts;
  obj.rotation.y = p.heading;
  const w = 2 * p.radius;
  const H = 8;
  // The poles at the edges, a little out past them.
  for (const [pole, side] of [
    [poleL, -1],
    [poleR, 1],
  ] as const) {
    pole.scale.y = H;
    pole.position.set(side * (p.radius + 1.2), H / 2, 0);
  }
  beam.scale.x = w + 3;
  beam.position.y = H;
  // The heads hung across the road under the beam, swinging.
  heads.children.forEach((head, k) => {
    head.position.set((k / (HEADS - 1) - 0.5) * w * 0.7, H, 0);
    head.rotation.z = 0.12 * Math.sin(elapsed * 2.1 + k * 1.3 + p.side);
    head.rotation.x = 0.08 * Math.sin(elapsed * 1.7 + k);
    for (const part of head.children) {
      if (part.userData.colour === undefined) continue;
      const c = part.userData.colour as number;
      const lit = c === p.lane;
      // Amber blinks through its beat, warning.
      const on = lit && (p.lane !== 1 || p.gap % 0.5 < 0.32);
      ((part as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(on ? LIGHT_HEX[c] : UNLIT);
    }
    const halo = head.children[head.children.length - 1] as THREE.Sprite;
    halo.material.color.setHex(LIGHT_HEX[p.lane]);
    halo.material.opacity = 0.75;
    halo.position.y = -0.7 - (2 - p.lane) * 0.95;
  });
  // The whole gantry rocking in the gale.
  rig.rotation.z = 0.025 * Math.sin(elapsed * 1.3 + p.side) * p.side;
  paint.scale.set(w, 0.5, 1);
  paint.position.z = -LIGHT_DEPTH - 0.2;
  line.scale.set(w, 2 * LIGHT_DEPTH, 1);
  const lm = (line as THREE.Mesh).material as THREE.MeshBasicMaterial;
  lm.color.setHex(LIGHT_HEX[p.lane]);
  lm.opacity = p.lane === 1 ? (p.gap % 0.5 < 0.32 ? 0.55 : 0.15) : 0.65 + 0.15 * Math.sin(elapsed * 12);
  // Red: a curtain of light across the road. Stay.
  curtain.scale.set(w, H - 1, 1);
  curtain.position.y = (H - 1) / 2;
  ((curtain as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = p.lane === 2 ? 0.28 + 0.1 * Math.sin(elapsed * 20) : 0;
}
