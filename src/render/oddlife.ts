import * as THREE from 'three';
import { seededRandom } from '../core/math';
import type { HazardPose } from '../items/hazards';
import { DOOR_SLOTS, DOOR_STAGES, ODDLIFE_BPM, doorRisen, doorSlot, opens, swung } from '../kits/oddlife';
import type { Ribbon, Track } from '../tracks/track';
import * as kit from './scenery';

/**
 * Oddlife's world (K.G., 2020): the band's odd life on tour, a night drive
 * through the middle of nowhere from one show to the next. Red dirt under
 * an indigo sky, a highway of bitumen with its lines painted bright, and
 * the tour all along it in stage-light pink, teal and gold: amp stacks bad
 * for your ears, light rigs, road cases, the tour bus going round for
 * another round, a headbanger, the sugarplum fairy dancing, the voyager
 * with his crown at the energy peak, the hydra's heads tasting the breeze,
 * the living room suite, the anthropoids who can't decide, the motel where
 * you sleep it off, and another carpark, another promoter, another green
 * room. Its textures (the road, the dirt, the walls, the barrier of road
 * cases), its scenery, its landmarks and its hazard's look (the backstage
 * doors, promoters in the shut ones, green rooms through the open ones).
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type RGB = [number, number, number];

/** Stage lights at night: pink, teal, gold, and a hot orange. */
const PINK = 0xff4fa8;
const TEAL = 0x3af0d0;
const GOLD = 0xffd23a;
const ORANGE = 0xff8a3a;
const VIOLET = 0x9a6aff;
const GREEN = 0x5aff7a;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Tileable value noise, roughly 0..1. */
function noise(size: number, period: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const p = period << o;
    const rand = seededRandom(seed + o * 101);
    const grid = Float32Array.from({ length: p * p }, () => rand());
    const cell = size / p;
    for (let y = 0; y < size; y++) {
      const gy = y / cell;
      const y0 = Math.floor(gy) % p;
      const y1 = (y0 + 1) % p;
      let ty = gy - Math.floor(gy);
      ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const gx = x / cell;
        const x0 = Math.floor(gx) % p;
        const x1 = (x0 + 1) % p;
        let tx = gx - Math.floor(gx);
        tx = tx * tx * (3 - 2 * tx);
        const a = grid[y0 * p + x0] + (grid[y0 * p + x1] - grid[y0 * p + x0]) * tx;
        const b = grid[y1 * p + x0] + (grid[y1 * p + x1] - grid[y1 * p + x0]) * tx;
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
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const [r, g, b] = fn(x, y, i);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * The road: the tour's highway, bitumen at night, grey-blue in the stage
 * light, its aggregate glinting, patched here and there; a bright dashed
 * line down the middle and a yellow edge line. It reads lighter than the
 * dark red dirt beside it. The texture spans half the road and mirrors
 * across it.
 */
export function tourRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = kit.canvas(S);
  const grain = noise(S, 16, 4, 6101);
  const fine = noise(S, 128, 1, 6102);
  paint(ctx, S, S, (_x, _y, i) => mix([78, 80, 104], [118, 120, 146], 0.3 + 0.4 * grain[i] + 0.3 * fine[i]));
  const rand = seededRandom(6103);
  // Patches and tar snakes: the road worn by every tour before this one.
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = `rgba(52,52,72,${0.35 + rand() * 0.3})`;
    ctx.fillRect(20 + rand() * 160, rand() * S, 40 + rand() * 50, 20 + rand() * 40);
  }
  ctx.strokeStyle = 'rgba(30,30,44,0.7)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 5; k++) {
    ctx.beginPath();
    let x = 30 + rand() * 180;
    let y = rand() * S;
    ctx.moveTo(x, y);
    for (let n = 0; n < 6; n++) ctx.lineTo((x += (rand() - 0.5) * 24), (y += 8 + rand() * 10));
    ctx.stroke();
  }
  // Glints of aggregate in the headlights.
  for (let k = 0; k < 260; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(220,220,255,0.5)' : 'rgba(255,200,240,0.35)';
    ctx.fillRect(rand() * S, rand() * S, 1, 1);
  }
  // The middle line, dashed white, and the yellow edge line on the outside.
  ctx.fillStyle = 'rgba(250,250,240,0.9)';
  for (let y = 0; y < S; y += 64) {
    ctx.fillRect(S - 4, y + 8, 4, 36);
    ctx.fillRect(0, y + 8, 4, 36);
  }
  ctx.fillStyle = 'rgba(255,210,58,0.85)';
  ctx.fillRect(24, 0, 5, S);
  return kit.canvasTexture(c);
}

/** The ground: red dirt in the middle of nowhere at night, dark, scattered with stones and spinifex. */
export function redDirtTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = kit.canvas(S);
  const grain = noise(S, 8, 4, 6201);
  const fine = noise(S, 64, 2, 6202);
  paint(ctx, S, S, (_x, _y, i) => mix([40, 16, 30], [92, 36, 46], 0.2 + 0.55 * grain[i] + 0.25 * fine[i]));
  const rand = seededRandom(6203);
  for (let k = 0; k < 90; k++) {
    ctx.fillStyle = rand() < 0.6 ? 'rgba(130,70,70,0.6)' : 'rgba(60,90,70,0.6)';
    ctx.beginPath();
    ctx.arc(rand() * S, rand() * S, 1 + rand() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  return kit.canvasTexture(c);
}

/** The cut's walls and the world's edge: a red rock cutting, layered and cracked, like the road cuts on the long drives between shows. */
export function cuttingTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = kit.canvas(S);
  const grain = noise(S, 16, 3, 6301);
  const rand = seededRandom(6302);
  const rows: RGB[] = [];
  while (rows.length < S) {
    const col = mix([70, 26, 36], [150, 70, 60], rand());
    const n = 4 + Math.floor(rand() * 14);
    for (let k = 0; k < n && rows.length < S; k++) rows.push(col);
  }
  paint(ctx, S, S, (x, y, i) => {
    const col = rows[Math.max(0, Math.min(S - 1, Math.floor(y + Math.sin(x * 0.04) * 4 + grain[i] * 5)))];
    const f = 0.75 + 0.35 * grain[i];
    return [col[0] * f, col[1] * f, col[2] * f];
  });
  return kit.canvasTexture(c);
}

/** The barrier: road cases end to end, black with aluminium edges, a blank gaffer-tape label on each. */
export function roadCaseTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 64;
  const [c, ctx] = kit.canvas(W, H);
  for (let k = 0; k < 4; k++) {
    const x = k * 64;
    ctx.fillStyle = '#18161e';
    ctx.fillRect(x, 0, 64, H);
    ctx.fillStyle = '#b8bcc8';
    ctx.fillRect(x, 0, 64, 4);
    ctx.fillRect(x, H - 4, 64, 4);
    ctx.fillRect(x, 0, 3, H);
    ctx.fillStyle = '#e8e2c8';
    ctx.fillRect(x + 12, 20, 40, 14);
    // A strip of black marker across the tape where a name would be.
    ctx.fillStyle = '#4a4440';
    ctx.fillRect(x + 18, 26, 28, 2);
    ctx.fillStyle = hex([PINK, TEAL, GOLD, ORANGE][k]);
    ctx.fillRect(x + 6, 44, 52, 4);
  }
  return kit.canvasTexture(c);
}

// Shared parts. The song bounces along at ODDLIFE_BPM (kits/oddlife.ts); the world's lights pulse on it.
const music = kit.beat(ODDLIFE_BPM);

const black = kit.once(() => kit.matte(0x16141c));
const metal = kit.once(() => kit.matte(0x9aa0b0, { emissive: 0x101018 }));
const cone = kit.once(() => kit.matte(0x4a4658, { emissive: 0x0a0a10 }));
const scrub = kit.once(() => kit.matte(0x3a5a3a, { flat: true, emissive: 0x081008 }));
const skin = kit.once(() => kit.matte(0xe8b090, { emissive: 0x281008 }));
const denim = kit.once(() => kit.matte(0x3a4a8a, { emissive: 0x080a18 }));
const glass = kit.once(() => new THREE.MeshPhongMaterial({ color: 0x8ad8ff, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.5 }));

const CYL = kit.once(() => new THREE.CylinderGeometry(1, 1, 1, 10));
const BOX = kit.once(() => new THREE.BoxGeometry(1, 1, 1));
const BALL = kit.once(() => new THREE.SphereGeometry(1, 12, 8));
const CONE = kit.once(() => new THREE.ConeGeometry(1, 1, 10));

/** A pole `h` tall and `r` thick standing on `y0`. */
function pole(h: number, r: number, mat: THREE.Material, y0 = 0): THREE.Mesh {
  const m = new THREE.Mesh(CYL(), mat);
  m.scale.set(r, h, r);
  m.position.y = y0 + h / 2;
  return m;
}

/** A box `w` by `h` by `d` centred at x, y, z. */
function slab(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(BOX(), mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

function ball(r: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(BALL(), mat);
  m.scale.setScalar(r);
  m.position.set(x, y, z);
  return m;
}

/** Everything that thumps on the beat in one place: halos, speaker cones, lights; one callback between them. */
interface Pulse {
  animated: kit.Animated;
  halos: THREE.Sprite[];
  cones: THREE.Object3D[];
  lights: { mat: THREE.MeshBasicMaterial; on: number; n: number }[];
}

function pulse(animated: kit.Animated): Pulse {
  const p: Pulse = { animated, halos: [], cones: [], lights: [] };
  const off = new THREE.Color(0x1a1420);
  const tmp = new THREE.Color();
  animated.push((time) => {
    const k = music.kick(time, 0, 4);
    for (const h of p.halos) h.material.opacity = (h.userData.base as number) * (0.65 + 0.35 * k);
    for (const c of p.cones) c.scale.z = 0.5 + 0.9 * music.kick(time, 0, 8);
    // Stage lights chasing down the rigs, a light a beat.
    const beat = Math.floor(time * (music.bpm / 60));
    for (const l of p.lights) l.mat.color.copy(beat % 4 === l.n % 4 ? tmp.setHex(l.on) : tmp.setHex(l.on).lerp(off, 0.7));
  });
  return p;
}

/** A glow that pulses with the beat. */
function halo(p: Pulse, color: number, size: number, opacity = 0.3): THREE.Sprite {
  const s = kit.glowSprite(color, size, opacity);
  s.userData.base = opacity;
  p.halos.push(s);
  return s;
}

/** A stage light, a can on a yoke, chasing with the others on the beat. */
function stageLight(p: Pulse, color: number, n: number, size = 0.5): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color });
  p.lights.push({ mat, on: color, n });
  const can = new THREE.Mesh(CYL(), black());
  can.scale.set(size, size * 1.6, size);
  can.rotation.x = Math.PI / 2.4;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(size * 0.85, 12), mat);
  lens.position.set(0, -size * 0.6, size * 0.7);
  lens.rotation.x = Math.PI / 2.4 - Math.PI / 2;
  g.add(can, lens, halo(p, color, size * 6, 0.35));
  return g;
}

/** A speaker cabinet `w` across: a grille and cones that thump on the kick. */
function cabinet(p: Pulse, w: number, h = w, cones = 2): THREE.Group {
  const g = new THREE.Group();
  g.add(slab(w, h, w * 0.6, black(), 0, h / 2, 0));
  const r = Math.min(w / 2, h / cones) * 0.36;
  for (let k = 0; k < cones; k++) {
    const y = (h * (k + 0.5)) / cones;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.12, 6, 18), metal());
    ring.position.set(0, y, w * 0.3 + 0.02);
    const c = new THREE.Mesh(new THREE.ConeGeometry(r * 0.9, r * 0.6, 14, 1, true), cone());
    c.rotation.x = -Math.PI / 2;
    c.position.set(0, y, w * 0.3);
    const holder = new THREE.Group();
    holder.position.set(0, y, w * 0.3);
    c.position.set(0, 0, 0);
    holder.add(c);
    p.cones.push(holder);
    g.add(ring, holder);
  }
  return g;
}

/** Which way a road sign out here points: none of them agree. */
type Way = 'left' | 'right' | 'up' | 'back';
const WAYS: readonly Way[] = ['left', 'right', 'up', 'back'];

const arrows = new Map<string, THREE.CanvasTexture>();
/** A road sign's face with no words on it: a white arrow pointing `way` on `bg`, a white rule round it. */
function arrowFace(way: Way, bg = '#1a6a3a', fg = '#ffffff'): THREE.CanvasTexture {
  const key = `${way}|${bg}|${fg}`;
  const made = arrows.get(key);
  if (made) return made;
  const W = 256;
  const H = 128;
  const [c, ctx] = kit.canvas(W, H);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  ctx.fillStyle = fg;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate({ left: Math.PI, right: 0, up: -Math.PI / 2, back: Math.PI / 2 }[way]);
  ctx.beginPath();
  ctx.moveTo(-60, -10);
  ctx.lineTo(20, -10);
  ctx.lineTo(20, -32);
  ctx.lineTo(62, 0);
  ctx.lineTo(20, 32);
  ctx.lineTo(20, 10);
  ctx.lineTo(-60, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const t = kit.canvasTexture(c, false);
  arrows.set(key, t);
  return t;
}

/** A sign of the song's words, lit. */
function words(lines: string[], fg = hex(GOLD), glow = hex(PINK)): THREE.CanvasTexture {
  return kit.textFace(lines, { style: 'neon', bg: '#120a1c', fg, glow });
}

/** A figure in the band's world: legs, body, head and long hair; in `body` clothes. */
function person(body: THREE.Material, size = 1, hair = 0x3a2418): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.18, 0.18]) g.add(slab(0.22, 0.9, 0.24, denim(), x, 0.45, 0));
  g.add(slab(0.62, 0.8, 0.34, body, 0, 1.3, 0), ball(0.24, skin(), 0, 1.95, 0));
  const locks = slab(0.5, 0.6, 0.2, kit.matte(hair), 0, 1.85, -0.16);
  g.add(locks);
  g.scale.setScalar(size);
  return g;
}

/** The roadside props, built for one place's pulse. Each is built at the origin, facing +z, its foot on the ground. */
function props(p: Pulse) {
  const amps: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const cab = cabinet(p, 2.2, 2.2, 2);
      cab.position.y = k * 2.2;
      g.add(cab);
    }
    const head = slab(2.2, 0.8, 1.2, black(), 0, n * 2.2 + 0.4, 0);
    g.add(head, slab(1.6, 0.12, 0.05, kit.lit(rand() < 0.5 ? TEAL : PINK), 0, n * 2.2 + 0.4, 0.62));
    return g;
  };
  const roadCase: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const w = 1.4 + rand() * 0.8;
      const c = slab(w, 0.9, 1, black(), (rand() - 0.5) * 0.3, 0.45 + k * 0.92, 0);
      c.rotation.y = (rand() - 0.5) * 0.3;
      g.add(c, slab(w + 0.04, 0.08, 1.04, metal(), c.position.x, k * 0.92 + 0.05, 0), slab(w * 0.5, 0.2, 0.02, kit.lit([PINK, TEAL, GOLD][k % 3]), c.position.x, 0.5 + k * 0.92, 0.52));
    }
    return g;
  };
  const truss: kit.Prop = (rand) => {
    // A light tower: a truss mast with a bar of stage lights on top, chasing.
    const g = new THREE.Group();
    const h = 6 + rand() * 4;
    for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) g.add(pole(h, 0.06, metal()).translateX(x).translateZ(z));
    g.add(slab(3.4, 0.3, 0.3, metal(), 0, h, 0));
    const cols = [PINK, TEAL, GOLD];
    for (let k = 0; k < 3; k++) {
      const l = stageLight(p, cols[(k + Math.floor(rand() * 3)) % 3], k + Math.floor(rand() * 4), 0.4);
      l.position.set(-1.1 + k * 1.1, h - 0.5, 0.2);
      g.add(l);
    }
    return g;
  };
  const sign: kit.Prop = (rand) => {
    // A road sign out here in the middle of nowhere, pointing somewhere else.
    const g = new THREE.Group();
    const board = kit.signPanel(3.6, arrowFace(WAYS[Math.floor(rand() * WAYS.length)]), { h: 1.8, depth: 0.1, frame: metal(), glows: false });
    board.position.y = 3.2;
    g.add(pole(4, 0.08, metal()).translateX(-1.2), pole(4, 0.08, metal()).translateX(1.2), board);
    return g;
  };
  const cone: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const n = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const c = new THREE.Mesh(CONE(), kit.matte(ORANGE, { emissive: 0x401800 }));
      c.scale.set(0.35, 0.9, 0.35);
      c.position.set((rand() - 0.5) * 3, 0.45, (rand() - 0.5) * 3);
      g.add(c, slab(0.3, 0.08, 0.3, kit.lit(0xffffff), c.position.x, 0.55, c.position.z));
    }
    return g;
  };
  const bush: kit.Prop = (rand) => {
    // Spinifex and saltbush: the middle of nowhere.
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + rand() * 0.6, 0), scrub());
      b.scale.y = 0.6;
      b.position.set((rand() - 0.5) * 2, 0.4, (rand() - 0.5) * 2);
      g.add(b);
    }
    return g;
  };
  const bottles: kit.Prop = (rand) => {
    // Drinking 'til I'm dead asleep: empties and a crate.
    const g = new THREE.Group();
    g.add(slab(1.2, 0.5, 0.8, kit.matte(0x2a5a8a), 0, 0.25, 0));
    for (let k = 0; k < 6; k++) {
      const b = pole(0.6, 0.1, kit.matte(k % 2 ? 0x2a7a3a : 0x8a5a2a, { emissive: 0x081008 }));
      b.position.set((rand() - 0.5) * 2.2, 0.3, (rand() - 0.5) * 2.2);
      if (rand() < 0.5) {
        b.rotation.z = Math.PI / 2;
        b.position.y = 0.1;
      }
      g.add(b);
    }
    return g;
  };
  const mic: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const h = 2.4 + rand();
    g.add(pole(h, 0.04, metal()), ball(0.12, metal(), 0, h + 0.1, 0.1), slab(0.8, 0.08, 0.8, black(), 0, 0.04, 0));
    g.add(halo(p, TEAL, 2, 0.35).translateY(h + 0.1));
    return g;
  };
  const van: kit.Prop = (rand) => {
    // A tour van parked up: another carpark in the middle of nowhere.
    const g = new THREE.Group();
    const col = [0xe8e2d0, 0x6a8aa0, 0xa04a5a][Math.floor(rand() * 3)];
    g.add(slab(2.2, 2, 4.8, kit.matte(col, { emissive: 0x101010 }), 0, 1.4, 0), slab(2.1, 0.8, 0.1, glass(), 0, 1.9, 2.42));
    for (const [x, z] of [[-1, 1.5], [1, 1.5], [-1, -1.5], [1, -1.5]]) {
      const w = pole(0.3, 0.38, black());
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.38, z);
      g.add(w);
    }
    for (const x of [-0.7, 0.7]) g.add(ball(0.18, kit.lit(0xfff4c0), x, 1.0, 2.42), halo(p, 0xfff4c0, 2.2, 0.4).translateX(x).translateY(1).translateZ(2.6));
    return g;
  };
  const lamp: kit.Prop = (rand) => {
    // A carpark light on a tall pole, its pool on the dirt.
    const g = kit.lamp(p.animated, rand() * 6, { color: 0xffc070, size: 0.8, cord: 0, shape: 'box', halo: 14, gutter: 0.1 });
    const holder = new THREE.Group();
    g.position.y = 7;
    holder.add(pole(7, 0.12, metal()), g, kit.lightPool(0xffc070, 6, 0.25));
    return holder;
  };
  const sparkle: kit.Prop = (rand) => {
    // Sugarplum: a sugared plum on a stem, glowing pink, sparkles round it.
    const g = new THREE.Group();
    const s = 0.8 + rand() * 0.6;
    g.add(pole(1.2, 0.06, scrub()), ball(s, kit.matte(0x8a2a8a, { emissive: 0x5a1050 }), 0, 1.2 + s, 0));
    g.add(halo(p, PINK, s * 5, 0.45).translateY(1.2 + s));
    return g;
  };
  const sofa: kit.Prop = (rand) => {
    // A living room left out by the road: a couch and a telly glowing.
    const g = new THREE.Group();
    const col = [0x8a3a5a, 0x3a6a5a, 0x7a5a2a][Math.floor(rand() * 3)];
    const m = kit.matte(col, { emissive: 0x100808 });
    g.add(slab(3, 0.7, 1.2, m, 0, 0.5, 0), slab(3, 1, 0.4, m, 0, 1.1, -0.5), slab(0.4, 0.9, 1.2, m, -1.5, 0.8, 0), slab(0.4, 0.9, 1.2, m, 1.5, 0.8, 0));
    const tv = slab(1.4, 1, 0.6, black(), 0, 0.9, 2.6);
    const screen = slab(1.2, 0.8, 0.02, kit.lit(TEAL), 0, 0.9, 2.28);
    g.add(tv, screen, halo(p, TEAL, 3, 0.4).translateY(0.9).translateZ(2.2));
    return g;
  };
  return { amps, roadCase, truss, sign, cone, bush, bottles, mic, van, lamp, sparkle, sofa };
}


// Scenery.

/**
 * Off-road scenery by the stretch of the lap it's beside: amp stacks, road
 * cases, light towers, road signs, cones, scrub, empties, tour vans,
 * carpark lights, sugarplums and couches. The roadside fill; each
 * stretch's own dressing is its `tourField`.
 */
export function oddFeature(animated: kit.Animated, track?: Track): Feature {
  const sectionAt = track ? kit.sectionNamer(track) : () => '';
  const P = props(pulse(animated));
  const general: [number, kit.Prop][] = [
    [2.4, P.bush],
    [1.5, P.sign],
    [1.2, P.roadCase],
    [1, P.truss],
    [0.8, P.cone],
  ];
  const bySection: Record<string, [number, kit.Prop][]> = {
    'All This Rock n Roll': [[4, P.amps], [2, P.truss]],
    'Bad for My Ears': [[4, P.amps], [1, P.mic]],
    'All This Headbanging': [[3, P.amps], [2, P.truss]],
    'Sugarplum Fairy': [[5, P.sparkle]],
    'Echoed Feet': [[3, P.truss], [2, P.mic]],
    'Hallowed Ground': [[3, P.truss], [2, P.amps]],
    'Back to the Bus': [[3, P.van], [2, P.cone]],
    'Head of the Hydra': [[3, P.bush], [2, P.sign]],
    'The Living Room Suite': [[5, P.sofa]],
    'Boredom Breeds': [[3, P.sofa], [2, P.bottles]],
    'Still Fatigued': [[3, P.bottles], [2, P.lamp]],
    'Dead Asleep': [[4, P.bottles], [2, P.sofa]],
    'Another Carpark': [[4, P.van], [3, P.lamp]],
    'Another Promoter': [[3, P.roadCase], [2, P.lamp]],
    'Another Green Room': [[3, P.roadCase], [2, P.amps]],
  };
  const noSite = {} as kit.Site;
  const kept = track ? track.def.landmarks.filter((l) => ROOM[l.kind] !== undefined).map((l) => ({ ...kit.offRoad(track.main, l.s * track.main.scale, l.lateral ?? 0), r: ROOM[l.kind]! })) : [];
  return (x, z, rand) => {
    if (kept.some((q) => Math.hypot(x - q.x, z - q.z) < q.r)) return new THREE.Group();
    const obj = kit.weighted(rand, [...general, ...(bySection[sectionAt(x, z)] ?? [])])(rand, noSite);
    obj.position.set(x, obj.position.y, z);
    obj.rotation.y = rand() * Math.PI * 2;
    return obj;
  };
}

/** How much room each landmark wants kept clear round it, in metres. */
const ROOM: Partial<Record<string, number>> = { tourBus: 34, headbanger: 30, sugarplumFairy: 34, voyager: 34, hydra: 40, anthropoids: 30, motel: 40, tourPoster: 34 };

/** One stretch of the lap being dressed. */
interface Field {
  track: Track;
  ribbon: Ribbon;
  from: number;
  to: number;
  animated: kit.Animated;
  g: THREE.Group;
  p: Pulse;
  P: ReturnType<typeof props>;
  seed: number;
  /** Where the landmarks stand, and how much room each wants: nothing is strewn there, and a set piece keeps clear. */
  stands: { x: number; z: number; r: number }[];
}

const along = (f: Field, frac: number): number => f.from + (f.to - f.from) * frac;

/** Stands a mid-ground set piece `away` metres off the road, `frac` along the field, on the side with room, facing the karts. */
function midground(f: Field, piece: THREE.Object3D, frac: number, away: number, radius: number): THREE.Object3D {
  const s = along(f, frac);
  let lateral = f.ribbon.halfWidthAtS(s) + away;
  search: for (const extra of [0, 14, 28, 42]) {
    for (const side of [1, -1] as const) {
      const at = kit.beside(f.ribbon, s, side, away + extra);
      if (Math.max(Math.abs(at.x), Math.abs(at.z)) > f.track.def.bounds - 25 || kit.clearance(f.track, at.x, at.z) < radius) continue;
      if (f.stands.some((q) => Math.hypot(at.x - q.x, at.z - q.z) < q.r + radius)) continue;
      lateral = side * (f.ribbon.halfWidthAtS(s) + away + extra);
      break search;
    }
  }
  kit.standBeside(piece, f.ribbon, s, lateral);
  f.g.add(piece);
  return piece;
}

/** A lighting rig across the road `frac` of the way along the field: a truss on two towers, its lamps chasing on the beat, where a banner of words would hang. */
function rig(f: Field, frac: number, color = PINK): void {
  const s = along(f, frac);
  const fr = kit.frameAt(f.ribbon, s);
  const hw = f.ribbon.halfWidthAtS(s) + 2;
  const H = 8;
  const g = new THREE.Group();
  for (const side of [-1, 1]) for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) g.add(pole(H, 0.06, metal()).translateX(side * hw + x).translateZ(z));
  g.add(slab(2 * hw + 1, 0.5, 0.5, metal(), 0, H, 0), slab(2 * hw + 1, 0.5, 0.5, metal(), 0, H - 0.8, 0));
  const cols = [color, TEAL, GOLD];
  const n = Math.max(4, Math.round(hw / 2.2));
  for (let k = 0; k < n; k++) {
    const l = stageLight(f.p, cols[k % 3], k, 0.5);
    l.position.set(-hw + ((k + 0.5) * 2 * hw) / n, H - 1.3, 0.3);
    g.add(l);
  }
  g.position.set(fr.x, fr.y, fr.z);
  g.rotation.y = fr.heading;
  f.g.add(g);
}

/** A banner of the song's words across the road `frac` of the way along the field. */
function banner(f: Field, frac: number, lines: string[], color = hex(GOLD), glow = PINK): void {
  f.g.add(kit.roadBanner(f.ribbon, along(f, frac), lines, { style: 'neon', bg: '#120a1c', fg: color, glow: color, glowColor: glow, lift: 7, post: metal() }, f.animated));
}

/** Props strewn either side of the field, in the band 3 to 20 m off the road. */
function strew(f: Field, kinds: [number, kit.Prop][], spacing = 14, o: Partial<kit.ScatterOptions> = {}): void {
  const off = kinds.map(([w, prop]): [number, kit.Prop] => [w, (rand, site) => (f.stands.some((q) => Math.hypot(site.x - q.x, site.z - q.z) < q.r) ? new THREE.Group() : prop(rand, site))]);
  f.g.add(kit.scatter({ track: f.track, ribbon: f.ribbon, from: f.from, to: f.to, spacing: spacing * 0.75, band: [3.5, 20], scale: [0.9, 1.5], kinds: off, seed: f.seed, ...o }));
}

const PEBBLE = kit.once(() => new THREE.DodecahedronGeometry(0.5, 0));
const TUFT = kit.once(() => new THREE.ConeGeometry(0.3, 1, 4));
const CAN = kit.once(() => new THREE.CylinderGeometry(0.12, 0.12, 0.4, 6));
/** The ground underfoot, three layers in one draw call each: red stones, spinifex tufts, and cans and bottle caps glinting. */
function ground(f: Field, density = 1): void {
  const base = { track: f.track, ribbon: f.ribbon, from: f.from, to: f.to };
  f.g.add(
    kit.scatterInstanced({ ...base, spacing: 1.4 / density, band: [2.5, 26], geometry: PEBBLE(), material: kit.matte(0xffffff, { flat: true }), colors: [0x6a2a32, 0x8a4038, 0x4a1a28, 0x9a5a48], lift: 0.25, scale: [0.6, 1.8], seed: f.seed + 3 }),
    kit.scatterInstanced({ ...base, spacing: 1.8 / density, band: [2.5, 22], geometry: TUFT(), material: kit.matte(0xffffff, { flat: true }), colors: [0x4a6a3a, 0x6a7a3a, 0x3a5a3a], lift: 0.5, scale: [0.6, 1.4], seed: f.seed + 5 }),
    kit.scatterInstanced({ ...base, spacing: 4 / density, band: [2.5, 14], geometry: CAN(), material: kit.lit(0xffffff), colors: [PINK, TEAL, GOLD, 0xd8d8e8], lift: 0.12, tilt: 1.5, seed: f.seed + 7 }),
  );
}

/** Light in the air over the field: dust in the headlights, sparkles, confetti. */
function air(f: Field, frac: number, color = 0xffc8e8, drift: 'rise' | 'fall' | 'float' | 'swirl' = 'float', count = 140): void {
  const m = kit.motes({ count, radius: 40, height: 20, color, drift, size: 0.45, seed: f.seed }, f.animated);
  const s = along(f, frac);
  const at = kit.offRoad(f.ribbon, s, 0);
  m.position.set(at.x, kit.frameAt(f.ribbon, s).y, at.z);
  f.g.add(m);
}

/** Bats over the field: night out here. */
function bats(f: Field, frac: number, count = 10): void {
  const fl = kit.flock({ count, radius: 34, height: 26, color: 0x0a0610, size: 1.4 }, f.animated);
  const at = kit.offRoad(f.ribbon, along(f, frac), 0);
  fl.position.set(at.x, 0, at.z);
  f.g.add(fl);
}

/** The crowd along the road, jumping on the beat, phones and lighters up. */
function crowd(f: Field, side: 'left' | 'right', from: number, to: number, motion: 'bob' | 'jump' | 'wave' | 'sway', near = 7): void {
  f.g.add(kit.crowd({ track: f.track, ribbon: f.ribbon, from, to, side, rows: 3, spacing: 1.7, band: [near, near + 0.4], motion, beat: music, clothes: [PINK, TEAL, 0x2a2a3a, GOLD, 0x6a4a9a], skin: 0xe0a888, height: 1.8, lights: { color: 0xfff0c0, every: 4, size: 1 }, seed: f.seed + (side === 'left' ? 1 : 2) }, f.animated).group);
}

// Mid-ground set pieces.

/** A stack of speaker cabinets as tall as a house, thumping on the kick: all this rock n roll, bad for your ears. */
function bigStack(f: Field, h = 18): THREE.Object3D {
  const body = new THREE.Group();
  const w = h / 3;
  for (let k = 0; k < 3; k++) body.add(cabinet(f.p, w, w, 2).translateY(k * w));
  body.add(slab(w, w * 0.3, w * 0.6, black(), 0, h + w * 0.15, 0), slab(w * 0.8, w * 0.06, 0.05, kit.lit(PINK), 0, h + w * 0.15, w * 0.31));
  return kit.setPiece({ body, base: 'plinth', baseColor: 0x1a1420, glow: { color: PINK, size: h * 1.2, y: h * 0.6, opacity: 0.16 }, beat: music }, f.animated);
}

/** A stage: a deck, a roof truss, lights chasing, a band of figures under it. */
function stage(f: Field, w = 26): THREE.Object3D {
  const body = new THREE.Group();
  body.add(slab(w, 2, w * 0.5, black(), 0, 1, 0));
  for (const x of [-w / 2, w / 2]) body.add(pole(12, 0.3, metal()).translateX(x).translateZ(-w * 0.2), pole(12, 0.3, metal()).translateX(x).translateZ(w * 0.2));
  body.add(slab(w + 1, 0.8, w * 0.5, metal(), 0, 12, 0));
  const cols = [PINK, TEAL, GOLD, VIOLET];
  for (let k = 0; k < 6; k++) body.add(stageLight(f.p, cols[k % 4], k, 0.7).translateX(-w / 2 + 2 + (k * (w - 4)) / 5).translateY(11.2).translateZ(w * 0.2));
  for (let k = 0; k < 5; k++) body.add(person(kit.matte(cols[k % 4], { emissive: 0x200818 }), 1.6).translateX(-8 + k * 4).translateY(2));
  body.add(cabinet(f.p, 3, 4, 2).translateX(-w / 2 + 2).translateY(2), cabinet(f.p, 3, 4, 2).translateX(w / 2 - 2).translateY(2));
  return kit.setPiece({ body, base: false, glow: { color: PINK, size: w * 1.4, y: 8, opacity: 0.2 }, beat: music }, f.animated);
}

/** A water tower out in the middle of nowhere, the town's name long gone, a red light on top. */
function waterTower(f: Field): THREE.Object3D {
  const body = new THREE.Group();
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) body.add(pole(14, 0.3, metal()).translateX(x).translateZ(z));
  const tank = pole(7, 5, kit.matte(0xb8b0a8, { emissive: 0x141010 }), 14);
  body.add(tank, new THREE.Mesh(new THREE.ConeGeometry(5.4, 2.4, 16), kit.matte(0x8a8078)).translateY(22.2));
  // Where the town's name was, a painted band, long faded.
  const face = pole(2.2, 5.08, kit.matte(0x8aa8a8, { emissive: 0x0a1414 }), 16.4);
  body.add(face, ball(0.5, kit.lit(0xff3030), 0, 23.6, 0));
  return kit.setPiece({ body, base: false, glow: { color: 0xff3030, size: 6, y: 23.6, opacity: 0.4 }, beat: music }, f.animated);
}

/** A giant ear, ringing: bad for my ears. */
function bigEar(f: Field, s = 10): THREE.Object3D {
  const body = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.TorusGeometry(s * 0.5, s * 0.16, 10, 24, Math.PI * 1.5), skin());
  outer.scale.set(1, 1.5, 1);
  outer.rotation.z = -Math.PI / 4;
  outer.position.y = s;
  const inner = ball(s * 0.22, kit.matte(0xc07070, { emissive: 0x301010 }), 0, s * 0.85, 0.5);
  body.add(outer, inner);
  // The ringing: rings of light going out from it.
  const rings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];
  for (let k = 0; k < 3; k++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(s * 0.6, 0.15, 4, 30), new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, depthWrite: false }));
    r.position.set(0, s, 1);
    rings.push(r);
    body.add(r);
  }
  f.animated.push((time) =>
    rings.forEach((r, k) => {
      const u = (time * 0.6 + k / 3) % 1;
      r.scale.setScalar(0.6 + u * 1.6);
      r.material.opacity = 0.8 * (1 - u);
    }),
  );
  return kit.setPiece({ body, base: 'mound', baseColor: 0x4a1a28, glow: { color: TEAL, size: s * 2.4, y: s, opacity: 0.15 }, beat: music }, f.animated);
}

/** A couch and a telly the size of a house: the living room suite, the conduit seeing out through the screen. */
function bigSuite(f: Field): THREE.Object3D {
  const body = props(f.p).sofa(seededRandom(f.seed), {} as kit.Site);
  body.scale.setScalar(5);
  return kit.setPiece({ body, base: false, glow: { color: TEAL, size: 30, y: 6, opacity: 0.18 }, beat: music }, f.animated);
}

/** A giant bottle tipped over, a last drop glowing: drinking 'til I'm dead asleep. */
function bigBottle(f: Field): THREE.Object3D {
  const body = new THREE.Group();
  const b = pole(10, 2.2, kit.matte(0x2a7a3a, { emissive: 0x082010 }));
  const neck = pole(3, 0.8, kit.matte(0x2a7a3a, { emissive: 0x082010 }), 10);
  const label = pole(4, 2.25, kit.matte(0xe8d8a8, { emissive: 0x201810 }), 3);
  const bottle = new THREE.Group();
  bottle.add(b, neck, label);
  bottle.rotation.z = Math.PI / 2 - 0.15;
  bottle.position.y = 2.2;
  body.add(bottle, ball(1, kit.lit(GOLD), 13, 0.5, 0));
  return kit.setPiece({ body, base: false, glow: { color: GOLD, size: 10, y: 1, opacity: 0.3 }, beat: music }, f.animated);
}

/** A wire walked upon a knife: a giant knife stood on its back, a tightrope along its edge, a walker balancing on it. */
function knife(f: Field): THREE.Object3D {
  const body = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(24, 6, 0.4), kit.matte(0xc8d0e0, { emissive: 0x181820 }));
  blade.position.y = 9;
  const handle = slab(8, 3, 1.4, black(), -15, 7.5, 0);
  const wire = slab(30, 0.08, 0.08, kit.lit(GOLD), -2, 12.2, 0);
  const walker = person(kit.matte(PINK, { emissive: 0x300818 }), 1.5);
  walker.position.y = 12.2;
  const pole2 = slab(5, 0.08, 0.08, metal(), 0, 13.8, 0);
  walker.add(pole2);
  body.add(blade, handle, wire, walker);
  f.animated.push((time) => {
    walker.position.x = -10 + 18 * (0.5 + 0.5 * Math.sin(time * 0.3));
    walker.rotation.z = 0.12 * Math.sin(time * 2.3);
  });
  return kit.setPiece({ body, base: 'mound', baseColor: 0x4a1a28, glow: { color: GOLD, size: 20, y: 12, opacity: 0.15 }, beat: music }, f.animated);
}

/** A crossroad sign: arrows every way, none of them agreeing. */
function crossSign(f: Field): THREE.Object3D {
  const body = new THREE.Group();
  body.add(pole(12, 0.3, metal()));
  const arms: THREE.Object3D[] = [];
  WAYS.forEach((w, k) => {
    const arm = kit.signPanel(7, arrowFace(w, '#ffffff', '#1a1420'), { h: 1.4, depth: 0.1, frame: metal(), glows: false });
    arm.position.set(3.5, 0, 0);
    const holder = new THREE.Group();
    holder.position.y = 7 + k * 1.6;
    holder.rotation.y = k * 1.7;
    holder.add(arm);
    arms.push(holder);
    body.add(holder);
  });
  f.animated.push((time) => arms.forEach((a, k) => (a.rotation.y = k * 1.7 + 0.6 * Math.sin(time * 0.4 + k))));
  return kit.setPiece({ body, base: 'plinth', baseColor: 0x2a1a28, glow: { color: GOLD, size: 12, y: 9, opacity: 0.18 }, beat: music }, f.animated);
}

const FIELDS: Record<string, (f: Field) => void> = {
  // All this rock n roll: off the stage, the crowd either side, amp stacks thumping.
  'All This Rock n Roll'(f) {
    strew(f, [[3, f.P.amps], [2, f.P.roadCase], [2, f.P.truss], [1, f.P.mic]], 11);
    ground(f);
    crowd(f, 'left', f.from + 10, f.to, 'jump', 8);
    crowd(f, 'right', f.from + 10, f.to, 'jump', 8);
    rig(f, 0.85);
    air(f, 0.5, 0xffd8f0, 'fall', 200);
  },
  // Bad for my ears: the stacks, a giant ear ringing.
  'Bad for My Ears'(f) {
    strew(f, [[4, f.P.amps], [2, f.P.truss], [2, f.P.bush], [1, f.P.cone]], 13);
    ground(f);
    midground(f, bigStack(f, 20), 0.4, 32, 12);
    midground(f, bigEar(f, 10), 0.75, 32, 12);
    air(f, 0.6);
    bats(f, 0.5);
  },
  // It's weird: through the crossroad, under the deck.
  "It's Weird"(f) {
    strew(f, [[3, f.P.sign], [2, f.P.cone], [2, f.P.bush]], 13, { band: [6, 22] });
    ground(f);
    rig(f, 0.1);
    midground(f, crossSign(f), 0.5, 26, 10);
  },
  // All this headbanging: the stacks, the headbanger (his landmark).
  'All This Headbanging'(f) {
    strew(f, [[4, f.P.amps], [2, f.P.truss], [1, f.P.mic]], 11);
    ground(f);
    rig(f, 0.4, PINK);
    crowd(f, 'left', f.from, f.to, 'bob', 8);
  },
  'Bad for My Brain'(f) {
    strew(f, [[3, f.P.amps], [2, f.P.sign], [2, f.P.bush]], 12);
    ground(f);
    rig(f, 0.3, PINK);
    midground(f, bigStack(f, 16), 0.65, 30, 10);
  },
  // Sugarplum fairy dances now: sugarplums glowing, the leap.
  'Sugarplum Fairy'(f) {
    strew(f, [[4, f.P.sparkle], [2, f.P.truss], [1, f.P.bush]], 11);
    ground(f);
    banner(f, 0.3, ['SUGARPLUM FAIRY', 'DANCES NOW'], '#ffc8f0', PINK);
    air(f, 0.7, PINK, 'swirl', 240);
  },
  // Echoed feet on the hallowed ground: a stadium's worth of crowd, the road bouncing.
  'Echoed Feet'(f) {
    strew(f, [[3, f.P.truss], [2, f.P.amps], [1, f.P.mic]], 12, { band: [10, 24] });
    ground(f);
    crowd(f, 'left', f.from, f.to, 'jump', 8);
    crowd(f, 'right', f.from, f.to, 'jump', 8);
    rig(f, 0.4);
    midground(f, stage(f, 26), 0.7, 34, 18);
  },
  'Hallowed Ground'(f) {
    strew(f, [[3, f.P.truss], [2, f.P.amps], [2, f.P.bush]], 12, { band: [10, 24] });
    ground(f);
    crowd(f, 'left', f.from, f.to, 'wave', 8);
    rig(f, 0.4, GOLD);
    air(f, 0.5, GOLD, 'fall', 200);
  },
  // Energy peaks on the voyager's crown: the climb, light towers rising with it.
  'Energy Peaks'(f) {
    strew(f, [[4, f.P.truss], [2, f.P.sign], [2, f.P.bush]], 13);
    ground(f);
    midground(f, waterTower(f), 0.5, 34, 12);
    bats(f, 0.7, 12);
  },
  "The Voyager's Crown"(f) {
    strew(f, [[3, f.P.truss], [2, f.P.sign]], 14, { band: [8, 26] });
    rig(f, 0.5, GOLD);
    air(f, 0.5, GOLD, 'rise', 180);
  },
  // Back to the bus for another round, high over the crossroad.
  'Back to the Bus'(f) {
    strew(f, [[3, f.P.van], [2, f.P.cone], [2, f.P.sign]], 14, { band: [10, 30] });
  },
  'Another Round'(f) {
    strew(f, [[3, f.P.sign], [2, f.P.bush]], 14, { band: [10, 30] });
    rig(f, 0.7, PINK);
    air(f, 0.5, 0xffd8f0, 'float', 160);
  },
  // Managing feats by managing feet: off the deck.
  'Managing Feats'(f) {
    strew(f, [[3, f.P.roadCase], [2, f.P.cone], [2, f.P.bush]], 12, { band: [6, 22] });
    ground(f);
    rig(f, 0.75);
  },
  // Head of the hydra tastes the breeze: the hydra is its own landmark; scrub and signs round the U.
  'Head of the Hydra'(f) {
    strew(f, [[3, f.P.bush], [2, f.P.sign], [2, f.P.cone]], 12);
    ground(f);
    midground(f, waterTower(f), 0.5, 30, 12);
    bats(f, 0.5);
  },
  'Tastes the Breeze'(f) {
    strew(f, [[3, f.P.bush], [2, f.P.sign], [1, f.P.cone]], 12);
    ground(f);
    rig(f, 0.4, GREEN);
    air(f, 0.5, 0xd8ffe8, 'swirl', 220);
  },
  // Conduit sees from the living room suite.
  'Conduit Sees'(f) {
    strew(f, [[3, f.P.sofa], [2, f.P.sign], [2, f.P.bush]], 12);
    ground(f);
    rig(f, 0.4, TEAL);
  },
  'The Living Room Suite'(f) {
    strew(f, [[4, f.P.sofa], [2, f.P.bottles], [1, f.P.lamp]], 12);
    ground(f);
    rig(f, 0.3, TEAL);
    midground(f, bigSuite(f), 0.5, 26, 14);
  },
  // Boredom is what boredom breeds, you see: sunk in a cut, nothing to look at but the rock.
  'Boredom Breeds'(f) {
    strew(f, [[3, f.P.sofa], [2, f.P.sign], [2, f.P.bush]], 18, { band: [10, 26], clear: 9 });
    air(f, 0.5, 0xb8b0d8, 'float', 120);
  },
  // So deranged, life is strange.
  'So Deranged'(f) {
    strew(f, [[3, f.P.sign], [2, f.P.truss], [2, f.P.bush]], 12);
    ground(f);
    rig(f, 0.4, PINK);
    air(f, 0.5, PINK, 'swirl', 200);
  },
  // All this indecision in anthropoids: signs every way, the apes (their landmark) dithering.
  'Indecision in Anthropoids'(f) {
    strew(f, [[4, f.P.sign], [2, f.P.bush], [1, f.P.cone]], 11);
    ground(f);
    rig(f, 0.2);
    midground(f, crossSign(f), 0.6, 28, 10);
  },
  // All this wire walking upon the knife.
  'Wire Walking Upon the Knife'(f) {
    strew(f, [[3, f.P.cone], [2, f.P.sign], [2, f.P.bush]], 12);
    ground(f);
    midground(f, knife(f), 0.6, 30, 16);
  },
  // I wake up and I'm still fatigued; drinking 'til I'm dead asleep.
  'Still Fatigued'(f) {
    strew(f, [[3, f.P.bottles], [2, f.P.lamp], [2, f.P.bush]], 12);
    ground(f);
    rig(f, 0.4, VIOLET);
  },
  'Dead Asleep'(f) {
    strew(f, [[4, f.P.bottles], [2, f.P.sofa], [1, f.P.lamp]], 11);
    ground(f);
    rig(f, 0.4, VIOLET);
    midground(f, bigBottle(f), 0.6, 22, 10);
  },
  // Riding high 'til I'm back home in one piece.
  'Riding High'(f) {
    strew(f, [[3, f.P.sign], [2, f.P.truss], [2, f.P.van]], 12);
    ground(f);
    rig(f, 0.4, TEAL);
  },
  // Another carpark in the middle of nowhere.
  'Another Carpark'(f) {
    strew(f, [[4, f.P.van], [3, f.P.lamp], [1, f.P.cone]], 10);
    ground(f);
  },
  // Another promoter hanging in your hair; another backstage green room to prepare: road cases and the crowd waiting.
  'Another Promoter'(f) {
    strew(f, [[3, f.P.roadCase], [2, f.P.lamp], [2, f.P.van]], 12, { band: [10, 24] });
    ground(f);
    crowd(f, 'left', f.from, f.to, 'wave', 8);
    crowd(f, 'right', f.from, f.to, 'bob', 8);
    air(f, 0.5, PINK, 'float', 160);
  },
  'Another Green Room'(f) {
    strew(f, [[3, f.P.roadCase], [2, f.P.amps], [2, f.P.truss]], 12, { band: [10, 24] });
    ground(f);
    crowd(f, 'left', f.from, f.to, 'jump', 8);
    crowd(f, 'right', f.from, f.to, 'jump', 8);
    air(f, 0.5, GREEN, 'rise', 160);
  },
  // It's an odd life 'til you get in the stride: round to the line.
  'Get in the Stride'(f) {
    strew(f, [[3, f.P.amps], [2, f.P.truss], [2, f.P.roadCase]], 12);
    ground(f);
    banner(f, 0.5, ["IT'S AN ODD LIFE", "'TIL YOU GET IN THE STRIDE"]);
    midground(f, stage(f, 24), 0.5, 32, 16);
    air(f, 0.5, 0xffd8f0, 'fall', 200);
  },
};

/** The sections a `tourField` can start in. */
export const FIELD_SECTIONS = Object.keys(FIELDS);

/**
 * One stretch of the lap dressed in layers: props strewn in the foreground,
 * stones, spinifex and cans on the ground, a set piece in the mid-ground,
 * dust, sparkle and bats in the air, and the song's words over the road.
 * Which stretch it is goes by the section at `s`.
 */
export function tourField(track: Track, ribbon: Ribbon, s: number, to: number, section: string, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const recipe = FIELDS[section];
  if (!recipe) return g;
  const p = pulse(animated);
  const stands = track.def.landmarks.filter((l) => ROOM[l.kind] !== undefined).map((l) => ({ ...kit.offRoad(track.main, l.s * track.main.scale, l.lateral ?? 0), r: ROOM[l.kind]! }));
  recipe({ track, ribbon, from: s, to, animated, g, p, P: props(p), seed: Math.round(s) + 17, stands });
  return g;
}

/** The skyline: the middle of nowhere at night, low hills, silos and water towers, radio masts blinking red. */
export function outbackSkyline(track: Track, animated: kit.Animated): THREE.Group {
  return kit.skyline({ track, shapes: [[4, 'hill'], [2, 'stack'], [2, 'spire'], [1, 'block']], color: 0x1c0e24, windows: GOLD, lit: 0.12, beacons: { color: 0xff3030, every: 2 }, count: 52, height: [24, 90], width: [24, 70], gap: 26, depth: 180 }, animated);
}

// Landmarks.

/** A landmark group stood at a road point, turned to the road's heading. */
function atRoad(g: THREE.Group, ribbon: Ribbon, s: number): THREE.Group {
  const f = kit.frameAt(ribbon, s);
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A group stood `lateral` metres off the road at `s` on the ground, +z turned to face the road. */
function offRoadFacing(g: THREE.Group, ribbon: Ribbon, s: number, lateral: number): THREE.Group {
  const at = kit.offRoad(ribbon, s, lateral);
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.heading + (lateral > 0 ? -Math.PI / 2 : Math.PI / 2);
  return g;
}

/** The start: a stage truss over the road, ALL THIS ROCK N ROLL across it, speaker stacks either side thumping, lights chasing. */
export function stageGate(ribbon: Ribbon, s: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const hw = ribbon.halfWidthAtS(s) + 3;
  const H = 13;
  for (const side of [-1, 1]) {
    for (const z of [-1, 1]) g.add(pole(H, 0.25, metal()).translateX(side * (hw + 0.5)).translateZ(z));
    for (let k = 0; k < 3; k++) g.add(cabinet(p, 3, 3, 2).translateX(side * (hw + 3.5)).translateY(k * 3));
  }
  g.add(slab(2 * hw + 2, 1.2, 2.4, metal(), 0, H, 0));
  const face = kit.signPanel(2 * hw - 2, words(['ALL THIS ROCK N ROLL'], hex(GOLD), hex(PINK)), { h: 3.4, depth: 0.2, frame: black() });
  face.position.set(0, H + 2.4, 0);
  g.add(face);
  const cols = [PINK, TEAL, GOLD, VIOLET];
  for (let k = 0; k < 8; k++) g.add(stageLight(p, cols[k % 4], k, 0.6).translateX(-hw + 1 + (k * (2 * hw - 2)) / 7).translateY(H - 1).translateZ(1.2));
  g.add(halo(p, PINK, 46, 0.22).translateY(H));
  return atRoad(g, ribbon, s);
}

/** Back to the bus for another round: the tour bus, as big as a house, rolling on the spot, wheels turning, headlights on, ANOTHER ROUND on its destination sign. */
export function tourBus(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const bus = new THREE.Group();
  const paint = kit.matte(0xe8e0d0, { emissive: 0x141410 });
  bus.add(slab(9, 9, 30, paint, 0, 6.5, 0), slab(9.1, 1.6, 30.1, kit.matte(PINK, { emissive: 0x400820 }), 0, 4, 0), slab(9.1, 0.8, 30.1, kit.matte(TEAL, { emissive: 0x084030 }), 0, 5.4, 0));
  for (let k = 0; k < 6; k++) for (const x of [-4.56, 4.56]) bus.add(slab(0.05, 2.6, 3.4, glass(), x, 8, -11 + k * 4.4));
  bus.add(slab(8.4, 3.4, 0.1, glass(), 0, 8, 15.02));
  const dest = kit.signPanel(6, arrowFace('up', '#1a1420', hex(GOLD)), { h: 1.2, depth: 0.1, frame: black() });
  dest.position.set(0, 10.6, 15.1);
  bus.add(dest);
  for (const x of [-3, 3]) bus.add(ball(0.6, kit.lit(0xfff4c0), x, 3.4, 15.05), halo(p, 0xfff4c0, 8, 0.6).translateX(x).translateY(3.4).translateZ(15.6));
  const wheels: THREE.Object3D[] = [];
  for (const z of [-9, 9]) for (const x of [-4.4, 4.4]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 1.2, 14), black());
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 2, z);
    const hub = slab(0.1, 2.4, 0.5, metal(), x + Math.sign(x) * 0.62, 2, z);
    wheels.push(w, hub);
    bus.add(w, hub);
  }
  g.add(bus, slab(14, 0.4, 36, kit.matte(0x3a3a48), 0, 0.2, 0), halo(p, GOLD, 50, 0.12).translateY(8));
  const dust = kit.motes({ count: 80, radius: 8, height: 4, color: 0xd8a8a0, drift: 'swirl', size: 0.6, seed: 71 }, animated);
  dust.position.set(0, 0.5, -16);
  g.add(dust);
  animated.push((time) => {
    bus.position.y = 0.35 * Math.abs(Math.sin(time * Math.PI * (music.bpm / 60)));
    bus.rotation.z = 0.02 * Math.sin(time * 2);
    for (const w of wheels) w.rotation.x = time * 4;
  });
  return offRoadFacing(g, ribbon, s, lateral);
}

/** All this headbanging is bad for my brain: a giant headbanger in front of his stack, hair flying on every beat. */
export function headbanger(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  for (let k = 0; k < 2; k++) for (const x of [-13, 13]) g.add(cabinet(p, 5, 5, 2).translateX(x).translateY(k * 5).translateZ(-6));
  const body = new THREE.Group();
  const tee = kit.matte(0x1a1420, { emissive: 0x08040c });
  for (const x of [-1.2, 1.2]) body.add(slab(1.4, 7, 1.6, denim(), x, 3.5, 0));
  body.add(slab(4.4, 6, 2.4, tee, 0, 10, 0));
  const print = kit.signPanel(3.2, words(['K.G.'], hex(PINK), hex(PINK)), { h: 1.6, depth: 0.05 });
  print.position.set(0, 10.5, 1.25);
  body.add(print);
  const neck = new THREE.Group();
  neck.position.y = 13;
  const head = ball(1.6, skin(), 0, 1.8, 0);
  neck.add(head);
  const hair: THREE.Mesh[] = [];
  for (let k = 0; k < 9; k++) {
    const lock = slab(0.5, 5, 0.4, kit.matte(0x2a1810), -2 + k * 0.5, 0.2, -0.6 - (k % 2) * 0.3);
    hair.push(lock);
    neck.add(lock);
  }
  for (const x of [-2.6, 2.6]) {
    const arm = slab(1, 6, 1, skin(), x, 9.5, 1.5);
    arm.rotation.x = -0.6;
    body.add(arm);
  }
  // His guitar.
  const neckG = slab(7, 0.5, 0.4, black(), 4, 1.5, 0);
  neckG.rotation.z = 0.4;
  const bodyG = ball(1, kit.matte(ORANGE, { emissive: 0x401800 }));
  bodyG.scale.set(2.2, 1.7, 0.5);
  const gtr = new THREE.Group();
  gtr.add(bodyG, neckG);
  gtr.position.set(0, 8, 2);
  gtr.rotation.z = -0.3;
  body.add(gtr, neck);
  g.add(body, halo(p, PINK, 34, 0.2).translateY(12));
  animated.push((time) => {
    // Down on the beat, up between.
    const k = music.kick(time, 0, 5);
    neck.rotation.x = 0.9 * k - 0.2;
    hair.forEach((h, n) => (h.rotation.x = -0.6 * k + 0.2 * Math.sin(time * 9 + n)));
    body.rotation.x = 0.08 * k;
  });
  g.scale.setScalar(1.8);
  return offRoadFacing(g, ribbon, s, lateral);
}

/** Sugarplum fairy dances now: a giant ballerina on her toe, pirouetting, her tutu pink, her wand trailing sparkles. */
export function sugarplumFairy(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  g.add(slab(16, 2, 16, kit.matte(0x3a1a3a), 0, 1, 0), new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.3, 24), kit.lit(0xffd0f0)).translateY(2.15));
  const dancer = new THREE.Group();
  const pinkSkin = kit.matte(0xf0c0d0, { emissive: 0x301018 });
  const leg = pole(12, 0.5, pinkSkin, 2.2);
  const leg2 = pole(10, 0.5, pinkSkin, 0);
  leg2.rotation.z = 1.4;
  leg2.position.set(5, 13, 0);
  const tutu = new THREE.Mesh(new THREE.ConeGeometry(6, 2.2, 20, 1, true), kit.matte(PINK, { double: true, emissive: 0x501030 }));
  tutu.rotation.x = Math.PI;
  tutu.position.y = 15;
  const bodice = pole(5, 1.4, kit.matte(0xc02a7a, { emissive: 0x400818 }), 15);
  const head = ball(1.4, pinkSkin, 0, 21.6, 0);
  const bun = ball(0.8, kit.matte(0x5a2a1a), 0, 22.8, -0.4);
  const arm = slab(10, 0.6, 0.6, pinkSkin, 0, 21, 0);
  arm.rotation.z = 0.5;
  const wand = pole(4, 0.12, kit.lit(GOLD), 0);
  wand.position.set(4.6, 23.4, 0);
  const star = ball(0.8, kit.lit(0xffffff), 4.6, 27.8, 0);
  dancer.add(leg, leg2, tutu, bodice, head, bun, arm, wand, star, halo(p, PINK, 30, 0.22).translateY(16), halo(p, GOLD, 8, 0.6).translateX(4.6).translateY(27.8));
  g.add(dancer);
  const sparkles = kit.swarm({ count: 120, radius: 12, height: 20, color: 0xffe0f4, size: 0.7, speed: 0.4, seed: 81 }, animated);
  sparkles.position.y = 16;
  g.add(sparkles);
  animated.push((time) => {
    dancer.rotation.y = time * 1.2;
    dancer.position.y = 0.4 * Math.abs(Math.sin(time * 1.8));
  });
  return offRoadFacing(g, ribbon, s, lateral);
}

/** Energy peaks: light rigs down both edges of the deck, their lights chasing toward the crown. */
export function deckLights(ribbon: Ribbon, s: number, to: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const cols = [PINK, TEAL, GOLD, VIOLET];
  let k = 0;
  for (let d = s; d < to; d += 20, k++) {
    const f = kit.frameAt(ribbon, d);
    const hw = ribbon.halfWidthAtS(d);
    for (const side of [-1, 1]) {
      const at = kit.offRoad(ribbon, d, side * (hw + 1));
      const post = pole(5, 0.15, metal());
      post.position.set(at.x, f.y + 2.5, at.z);
      const light = stageLight(p, cols[k % 4], k, 0.5);
      light.position.set(at.x, f.y + 5.3, at.z);
      light.rotation.y = f.heading + Math.PI;
      g.add(post, light);
    }
  }
  return g;
}

/** Energy peaks on the voyager's crown: a giant traveller in a crown, rucksack on, staff in hand, his crown crackling with energy that peaks on the beat. */
export function voyager(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  g.add(slab(20, 3, 14, kit.matte(0x3a1a2a, { flat: true }), 0, 1.5, 0));
  const coat = kit.matte(0x4a3a7a, { emissive: 0x0a0618 });
  const man = new THREE.Group();
  for (const x of [-1.6, 1.6]) man.add(slab(2, 10, 2.2, denim(), x, 8, 0));
  man.add(slab(6.4, 9, 3.6, coat, 0, 17.5, 0), slab(5, 7, 3, kit.matte(0x8a5a2a), 0, 18, -3.2), ball(2.2, skin(), 0, 24.2, 0));
  const crown = new THREE.Group();
  const gold = kit.lit(GOLD);
  crown.add(new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 1.2, 12, 1, true), gold));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const spike = new THREE.Mesh(CONE(), gold);
    spike.scale.set(0.4, 1.6, 0.4);
    spike.position.set(Math.cos(a) * 2.2, 1.3, Math.sin(a) * 2.2);
    crown.add(spike);
  }
  crown.position.y = 26.4;
  const staff = pole(24, 0.25, kit.matte(0x6a4a2a), 3);
  staff.position.x = 4.4;
  man.add(crown, staff);
  // The energy peaking: bolts of light round the crown.
  const bolts: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
  for (let k = 0; k < 8; k++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 0.2), new THREE.MeshBasicMaterial({ color: k % 2 ? TEAL : GOLD, transparent: true }));
    const a = (k / 8) * Math.PI * 2;
    b.position.set(Math.cos(a) * 3.6, 29, Math.sin(a) * 3.6);
    b.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    bolts.push(b);
    man.add(b);
  }
  const peak = halo(p, GOLD, 22, 0.5);
  peak.position.y = 28;
  man.add(peak);
  g.add(man);
  animated.push((time) => {
    const k = music.kick(time, 0, 3);
    bolts.forEach((b, n) => (b.material.opacity = k * (0.5 + 0.5 * Math.sin(time * 20 + n * 2))));
    crown.rotation.y = time * 0.5;
    man.rotation.y = 0.15 * Math.sin(time * 0.4);
  });
  return offRoadFacing(g, ribbon, s, lateral);
}

/** Head of the hydra tastes the breeze: a giant hydra, five long necks swaying, forked tongues flicking out to taste the air. */
export function hydra(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const scales = kit.matte(0x3aba7a, { flat: true, emissive: 0x145a34 });
  const belly = kit.matte(0x8ad87a, { flat: true, emissive: 0x183010 });
  const body = ball(1, scales, 0, 6, 0);
  body.scale.set(10, 6, 12);
  const under = ball(1, belly, 0, 4.5, 4);
  under.scale.set(7, 3.5, 7);
  g.add(body, under);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(3, 16, 8), scales);
  tail.rotation.x = -Math.PI / 2 - 0.3;
  tail.position.set(0, 3, -16);
  g.add(tail);
  const necks: { root: THREE.Group; tongue: THREE.Mesh; ph: number }[] = [];
  for (let k = 0; k < 5; k++) {
    const root = new THREE.Group();
    root.position.set(-8 + k * 4, 11, 4);
    root.rotation.z = (k - 2) * 0.25;
    let at = root;
    // A neck of four segments, each bending a little more.
    for (let n = 0; n < 4; n++) {
      const seg = pole(5.4, 1.9 - n * 0.3, scales);
      const joint = new THREE.Group();
      joint.position.y = n === 0 ? 0 : 5;
      joint.add(seg);
      at.add(joint);
      at = joint;
    }
    const head = new THREE.Group();
    head.position.y = 5.5;
    const skull = ball(1, scales);
    skull.scale.set(1.6, 1.3, 2.6);
    const eyes = [ball(0.35, kit.lit(GOLD), 0.9, 0.6, 1), ball(0.35, kit.lit(GOLD), -0.9, 0.6, 1)];
    const tongue = slab(0.15, 0.08, 3, kit.lit(0xff3a5a), 0, -0.3, 3);
    head.add(skull, ...eyes, tongue);
    at.add(head);
    necks.push({ root, tongue, ph: k * 1.3 });
    g.add(root);
  }
  g.add(halo(p, GREEN, 40, 0.08).translateY(22));
  animated.push((time) => {
    for (const nk of necks) {
      // Swaying, each joint following the one below.
      let j: THREE.Object3D | undefined = nk.root.children[0];
      let n = 0;
      while (j) {
        j.rotation.x = 0.25 * Math.sin(time * 0.9 + nk.ph + n * 0.6);
        j.rotation.z = 0.12 * Math.sin(time * 0.7 + nk.ph * 1.7 + n);
        j = j.children.find((c) => c instanceof THREE.Group);
        n++;
      }
      // Tasting the breeze: the tongue flicks out and back.
      const flick = Math.max(0, Math.sin(time * 3 + nk.ph * 2)) ** 4;
      nk.tongue.scale.z = 3 * (0.2 + flick);
      nk.tongue.position.z = 1.6 + 1.8 * flick;
    }
  });
  g.scale.setScalar(1.2);
  return offRoadFacing(g, ribbon, s, lateral);
}

/** All this indecision in anthropoids: three giant apes at a signpost pointing every way, turning one way and back, never deciding. */
export function anthropoids(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const fur = kit.matte(0x9a7458, { flat: true, emissive: 0x3a2414 });
  const face = kit.matte(0xa07a60, { emissive: 0x181008 });
  g.add(pole(16, 0.4, metal()));
  const arrows: THREE.Object3D[] = [];
  WAYS.forEach((w, k) => {
    const arm = kit.signPanel(6, arrowFace(w, '#ffffff', '#1a1420'), { h: 1.3, depth: 0.1, frame: metal(), glows: false });
    arm.position.x = 3;
    const holder = new THREE.Group();
    holder.position.y = 10 + k * 1.6;
    holder.add(arm);
    arrows.push(holder);
    g.add(holder);
  });
  const apes: THREE.Group[] = [];
  for (let k = 0; k < 3; k++) {
    const ape = new THREE.Group();
    const torso = ball(1, fur, 0, 7, 0);
    torso.scale.set(3.2, 4, 2.6);
    const head = ball(1.8, fur, 0, 12, 0.6);
    const muzzle = ball(1.1, face, 0, 11.6, 2);
    for (const x of [-3, 3]) {
      const arm = slab(1.4, 8, 1.4, fur, x, 6, 0.5);
      arm.rotation.z = x > 0 ? -0.15 : 0.15;
      ape.add(arm);
    }
    for (const x of [-1.4, 1.4]) ape.add(slab(1.6, 4, 1.6, fur, x, 2, 0));
    ape.add(torso, head, muzzle, ball(0.3, kit.lit(GOLD), 0.7, 12.5, 1.7), ball(0.3, kit.lit(GOLD), -0.7, 12.5, 1.7));
    const a = (k / 3) * Math.PI * 2;
    ape.position.set(Math.cos(a) * 9, 0, Math.sin(a) * 9);
    apes.push(ape);
    g.add(ape);
  }
  g.add(halo(p, GOLD, 30, 0.15).translateY(10));
  animated.push((time) => {
    // Which way? This way. No, that way.
    apes.forEach((ape, k) => (ape.rotation.y = Math.sin(time * 0.8 + k * 2) > 0 ? 1 : -1.2 + 0.1 * Math.sin(time * 6)));
    arrows.forEach((a, k) => (a.rotation.y = Math.round(Math.sin(time * 0.5 + k)) * 1.6 + k));
  });
  return offRoadFacing(g, ribbon, s, lateral);
}

/** I wake up and I'm still fatigued, drinking 'til I'm dead asleep: a roadside motel, MOTEL in neon flickering, NO VACANCY, a giant bed out front with a sleeper snoring, empties round it. */
export function motel(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const wall = kit.matte(0xc89a7a, { emissive: 0x181008 });
  g.add(slab(40, 7, 10, wall, 0, 3.5, -8), slab(42, 0.8, 12, kit.matte(0x6a3a3a), 0, 7.4, -8));
  for (let k = 0; k < 6; k++) {
    g.add(slab(1.8, 3.6, 0.1, kit.matte([0xa04a5a, 0x3a6a8a, 0x6a8a3a][k % 3]), -15 + k * 6, 1.8, -2.95));
    g.add(slab(2.4, 1.6, 0.1, kit.lit(k % 2 ? 0xffd890 : 0x2a2030), -12.5 + k * 6, 4.2, -2.95));
  }
  const signMat = new THREE.MeshBasicMaterial({ map: words(['MOTEL'], hex(PINK), hex(PINK)) });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), signMat);
  sign.position.set(-24, 14, 0);
  const vacancy = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.4), new THREE.MeshBasicMaterial({ map: arrowFace('back', '#120a1c', hex(TEAL)) }));
  vacancy.position.set(-24, 10, 0);
  g.add(pole(12, 0.4, metal()).translateX(-24), sign, vacancy, halo(p, PINK, 18, 0.35).translateX(-24).translateY(14));
  // The bed out front, its sleeper dead asleep, Zs rising.
  g.add(slab(10, 2, 14, kit.matte(0x5a3a2a), 6, 1, 8), slab(9.6, 1.2, 13.6, kit.matte(0xe8e8f0), 6, 2.5, 8), slab(9.6, 1.4, 9, kit.matte(0x3a6aaa), 6, 3.1, 10), slab(4, 1.2, 2.4, kit.matte(0xffffff), 6, 3.3, 2.6));
  const sleeper = ball(1.4, skin(), 6, 4, 3);
  g.add(sleeper, props(p).bottles(seededRandom(9), {} as kit.Site).translateX(-2).translateZ(12));
  const zs: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  for (let k = 0; k < 3; k++) {
    const z = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: words(['Z'], '#ffffff', hex(VIOLET)), transparent: true, depthWrite: false }));
    zs.push(z);
    g.add(z);
  }
  animated.push((time) => {
    // The neon buzzing and dropping out now and then.
    signMat.color.setScalar(Math.sin(time * 13) > -0.85 || Math.sin(time * 0.7) < 0.6 ? 1 : 0.25);
    zs.forEach((z, k) => {
      const u = (time * 0.35 + k / 3) % 1;
      z.position.set(7 + u * 4, 5 + u * 9, 3);
      z.scale.setScalar(0.6 + u);
      z.material.opacity = 1 - u;
    });
  });
  return offRoadFacing(g, ribbon, s, lateral);
}

/** The tour poster: a billboard of the odd life's dates, every one another carpark in the middle of nowhere, its bulbs chasing round the frame. */
export function tourPoster(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const W = 34;
  const H = 18;
  for (const x of [-W / 3, W / 3]) g.add(pole(10, 0.5, metal()).translateX(x));
  const face = kit.signPanel(W, kit.textFace(['ODDLIFE'], { style: 'poster', bg: '#ffd8a0', fg: '#2a0a2a', width: 1024, height: 512 }), { h: H, depth: 0.6, frame: black() });
  face.position.y = 10 + H / 2;
  g.add(face);
  const bulbs: THREE.MeshBasicMaterial[] = [];
  const ring = (x: number, y: number) => {
    const m = new THREE.MeshBasicMaterial({ color: GOLD });
    bulbs.push(m);
    const b = new THREE.Mesh(BALL(), m);
    b.scale.setScalar(0.35);
    b.position.set(x, y, 0.5);
    g.add(b);
  };
  for (let k = 0; k <= 20; k++) {
    ring(-W / 2 + (k * W) / 20, 10);
    ring(-W / 2 + (k * W) / 20, 10 + H);
  }
  for (let k = 1; k < 10; k++) {
    ring(-W / 2, 10 + (k * H) / 10);
    ring(W / 2, 10 + (k * H) / 10);
  }
  g.add(halo(p, GOLD, 50, 0.15).translateY(10 + H / 2));
  animated.push((time) => bulbs.forEach((m, k) => m.color.setHex((k + Math.floor(time * 6)) % 3 === 0 ? 0xfff4c0 : 0x5a3a10)));
  return offRoadFacing(g, ribbon, s, lateral);
}

// The hazard.

const DOOR_WOOD = kit.once(() => kit.matte(0x3a2a4a, { emissive: 0x0a0612 }));
const DOOR_FRAME = kit.once(() => kit.matte(0x18161e));
const SUIT = kit.once(() => kit.matte(0x2a2a34, { emissive: 0x08080c }));
const GREEN_LIGHT = kit.once(() => new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.85 }));

/**
 * The backstage doors: a row of them risen out of the road across it, each
 * in its black frame with a star on it. The shut ones have a promoter in
 * the doorway, phone in one hand, clipboard in the other, reaching for your
 * hair; the open ones swing wide on a green room glowing green.
 */
export function doorParts(obj: THREE.Object3D): THREE.Object3D[] {
  const row = new THREE.Group();
  const glows = new THREE.Group();
  for (let k = 0; k < DOOR_SLOTS; k++) {
    const unit = new THREE.Group();
    unit.add(slab(0.25, 3.4, 0.3, DOOR_FRAME(), -1.15, 1.7, 0), slab(0.25, 3.4, 0.3, DOOR_FRAME(), 1.15, 1.7, 0), slab(2.55, 0.3, 0.3, DOOR_FRAME(), 0, 3.4, 0));
    // The green room behind the door: a glowing panel.
    const room = slab(2, 3.1, 0.05, GREEN_LIGHT(), 0, 1.6, 0.2);
    // The door, hinged on its left edge.
    const hinge = new THREE.Group();
    hinge.position.set(-1.02, 0, 0);
    const leaf = slab(2.04, 3.2, 0.12, DOOR_WOOD(), 1.02, 1.6, 0);
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.3, 5), kit.lit(GOLD));
    star.position.set(1.02, 2.5, -0.08);
    star.rotation.y = Math.PI;
    hinge.add(leaf, star);
    // The promoter, in the doorway of a shut door.
    const promoter = person(SUIT(), 1.1, 0x1a1a1a);
    promoter.position.set(0, 0, -0.5);
    promoter.rotation.y = Math.PI;
    const phone = slab(0.1, 0.25, 0.04, kit.lit(TEAL), 0.35, 2.05, -0.1);
    const board = slab(0.5, 0.6, 0.04, kit.matte(0xe8e2c8), -0.4, 1.3, -0.25);
    promoter.add(phone, board);
    unit.add(room, hinge, promoter);
    row.add(unit);
    glows.add(kit.glowSprite(GREEN, 5, 0));
  }
  const parts = [row, glows];
  for (const o of parts) obj.add(o);
  return parts;
}

export function poseDoors(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [row, glows] = parts;
  obj.position.set(p.ax, p.ground, p.az);
  obj.rotation.y = p.heading;
  const u = p.phase;
  const up = doorRisen(u);
  const w = swung(u);
  for (let k = 0; k < DOOR_SLOTS; k++) {
    // In the road's frame, a lateral to the right is local -x.
    const x = -doorSlot(k, p.radius);
    const unit = row.children[k] as THREE.Group;
    const open = opens(p.lane, k);
    unit.visible = up > 0.02;
    unit.position.set(x, (up - 1) * 3.6, 0);
    unit.rotation.y = Math.PI;
    const hinge = unit.children[4];
    hinge.rotation.y = open ? -1.6 * w : 0;
    const promoter = unit.children[5];
    promoter.visible = !open;
    promoter.position.y = 0.06 * Math.abs(Math.sin(elapsed * 5 + k));
    const room = unit.children[3];
    room.visible = open;
    const g = glows.children[k] as THREE.Sprite;
    g.position.set(x, 1.8, 0);
    g.material.opacity = open && u >= DOOR_STAGES.risen && u < DOOR_STAGES.sink ? 0.6 * w * up : 0;
  }
}
