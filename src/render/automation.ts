import * as THREE from 'three';
import { seededRandom } from '../core/math';
import type { HazardPose } from '../items/hazards';
import { BPM, PRESS_DEPTH, PRESS_LANES, pressDared, pressDown, pressLane } from '../kits/automation';
import type { Ribbon, Track } from '../tracks/track';
import * as kit from './scenery';

/**
 * Automation's world (K.G., 2020): the machine world the song sings of, at
 * dusk under its own smog. The road is a conveyor belt, rolling; the floor
 * is concrete painted with safety lines; the walls are hazard stripes.
 * Everyone joins the last migration through the gate, the bald ape king
 * sits crowned on his throne, the heir stands gilded over the kneeling, the
 * overlord sets its shapes to turn, the super-organism works as one, light
 * bends through the great prism, the cyber-surgeon operates, the neural
 * network fires, the floor cracks open, and a dinosaur walks in its
 * simulation. Its textures, scenery, landmarks and its hazard's look (the
 * presses stamping their lanes in turn).
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type RGB = [number, number, number];

const once = kit.once;
const canvas = kit.canvas;

function finish(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Tileable value noise, roughly 0..1. */
function noise(size: number, period: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const p = period << o;
    const rand = seededRandom(seed + o * 97);
    const grid = Float32Array.from({ length: p * p }, () => rand());
    const cell = size / p;
    for (let y = 0; y < size; y++) {
      const gy = y / cell;
      const y0 = Math.floor(gy) % p;
      const y1 = (y0 + 1) % p;
      const ty = gy - Math.floor(gy);
      for (let x = 0; x < size; x++) {
        const gx = x / cell;
        const x0 = Math.floor(gx) % p;
        const x1 = (x0 + 1) % p;
        const tx = gx - Math.floor(gx);
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

const shade = (c: RGB, f: number): RGB => [c[0] * f, c[1] * f, c[2] * f];

/** Safety yellow, sodium light, screen blue, robot orange, slip pink, go green, stop red. */
const SAFETY = 0xffc21a;
const SODIUM = 0xffa040;
const SCREEN = 0x5ad8ff;
const ROBOT = 0xff6a1a;
const PINK = 0xff8ab8;
const GO = 0x6aff8a;
const STOP = 0xff3a2a;
const GOLD = 0xffc84a;

/**
 * The road: a conveyor belt. Dark ribbed rubber over rollers, the seams of
 * its plates across it, yellow chevrons down the middle pointing the way,
 * worn pale where the wheels run. It rolls toward the line (`rollBelt`).
 * The texture spans half the road and mirrors across it.
 */
export const conveyorRoadTexture = once((): THREE.CanvasTexture => {
  const S = 256;
  const [c, ctx] = canvas(S);
  const grain = noise(S, 16, 3, 9101);
  paint(ctx, S, S, (x, y, i) => {
    const rib = (y % 8) < 2 ? 0.78 : 1;
    const worn = Math.exp(-(((x - 150) / 40) ** 2)) * 0.18;
    return shade([66, 70, 78], (0.85 + 0.25 * grain[i] + worn) * rib);
  });
  // The plates' seams, bolted.
  for (let y = 0; y < S; y += 64) {
    ctx.fillStyle = 'rgb(22,24,28)';
    ctx.fillRect(0, y, S, 4);
    ctx.fillStyle = 'rgb(130,136,146)';
    for (let x = 20; x < S; x += 48) ctx.fillRect(x, y + 6, 4, 4);
  }
  // Chevrons down the middle (the mirror's seam is x = 0).
  ctx.fillStyle = 'rgba(255,194,26,0.85)';
  for (let y = 0; y < S; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y + 46);
    ctx.lineTo(40, y + 18);
    ctx.lineTo(40, y + 32);
    ctx.lineTo(0, y + 60);
    ctx.closePath();
    ctx.fill();
  }
  // Yellow and black at the edge of the belt.
  for (let y = 0; y < S; y += 32) {
    ctx.fillStyle = '#ffc21a';
    ctx.fillRect(S - 10, y, 10, 16);
    ctx.fillStyle = '#16161a';
    ctx.fillRect(S - 10, y + 16, 10, 16);
  }
  return finish(c);
});

/** Rolls the belt toward the line, `speed` tiles a second (one call per world: the texture is shared). */
const rolling = new WeakSet<kit.Animated>();
export function rollBelt(animated: kit.Animated, speed = 0.35): void {
  if (rolling.has(animated)) return;
  rolling.add(animated);
  const t = conveyorRoadTexture();
  animated.push((time) => (t.offset.y = -time * speed));
}

/** The ground: a factory floor's concrete, stained, its slabs' joints and painted safety lines. */
export function concreteGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = noise(S, 8, 4, 9111);
  paint(ctx, S, S, (_x, _y, i) => shade([96, 98, 100], 0.62 + n[i] * 0.55));
  ctx.fillStyle = 'rgba(30,30,32,0.5)';
  for (let k = 0; k < S; k += 128) {
    ctx.fillRect(k, 0, 2, S);
    ctx.fillRect(0, k, S, 2);
  }
  ctx.fillStyle = 'rgba(255,194,26,0.55)';
  ctx.fillRect(60, 0, 8, S);
  ctx.fillRect(0, 300, S, 8);
  const rand = seededRandom(9112);
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = `rgba(20,16,12,${0.15 + rand() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(rand() * S, rand() * S, 6 + rand() * 30, 4 + rand() * 18, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/** The world's edge and the cut's walls: corrugated steel cladding, rust running down it. */
export function claddingTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = noise(S, 8, 3, 9121);
  paint(ctx, S, S, (x, _y, i) => {
    const rib = 0.75 + 0.25 * Math.sin((x / 16) * Math.PI * 2);
    const rust = n[i] > 0.62 ? 0.4 : 0;
    return [(70 + 60 * rust) * rib, (76 + 20 * rust) * rib, (84 - 20 * rust) * rib];
  });
  return finish(c);
}

/** The barrier: yellow and black hazard stripes, a steel rail along the top. */
export function hazardRailTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#16161a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffc21a';
  for (let x = -H; x < W + H; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + 20, H);
    ctx.lineTo(x + 20 + H, 0);
    ctx.lineTo(x + H, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#9aa0aa';
  ctx.fillRect(0, 0, W, 7);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(0, 1, W, 1);
  return finish(c);
}

// Shared parts. The song runs at 120 beats a minute: the whole factory works to it.
const music = kit.beat(BPM);

const steel = once(() => kit.matte(0x5a6068));
const dark = once(() => kit.matte(0x22252a));
const orange = once(() => kit.matte(ROBOT, { emissive: 0x401400 }));
const yellow = once(() => kit.matte(SAFETY, { emissive: 0x3a2a00 }));
const white = once(() => kit.matte(0xe4e6ea, { emissive: 0x202224 }));
const cardboard = once(() => kit.matte(0xb08850, { emissive: 0x1a1006 }));
const wood = once(() => kit.matte(0x8a6a40));
const person = once(() => kit.matte(0x6a6e78));
const paper = once(() => kit.matte(PINK, { emissive: 0x4a1a2a, double: true }));

const CYL = once(() => new THREE.CylinderGeometry(1, 1, 1, 10));
const BOX = once(() => new THREE.BoxGeometry(1, 1, 1));
const BALL = once(() => new THREE.SphereGeometry(1, 12, 8));

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

/** What a screen shows when it isn't words: a trace, a bar chart, a turning cube, a robot's face, the simulation's grid, a heartbeat. */
export type Glyph = 'wave' | 'bars' | 'cube' | 'face' | 'grid' | 'pulse';
export const GLYPHS: readonly Glyph[] = ['wave', 'bars', 'cube', 'face', 'grid', 'pulse'];

const glyphs = new Map<string, THREE.CanvasTexture>();
/** A screen's face with no words on it: `glyph` drawn in glowing lines on dark glass, made once per glyph and colour. */
export function glyphFace(glyph: Glyph, color = '#9aeaff'): THREE.CanvasTexture {
  const key = `${glyph}|${color}`;
  const made = glyphs.get(key);
  if (made) return made;
  const W = 512;
  const H = 256;
  const [c, ctx] = kit.canvas(W, H);
  ctx.fillStyle = '#04121a';
  ctx.fillRect(0, 0, W, H);
  // Scan lines on the glass.
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const line = (pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  if (glyph === 'wave') {
    line(Array.from({ length: 65 }, (_, k): [number, number] => [24 + k * 7.3, H / 2 + Math.sin(k * 0.35) * 70 * Math.sin(k * 0.05 + 0.3)]));
  } else if (glyph === 'bars') {
    [0.4, 0.7, 0.55, 0.9, 0.3, 0.75, 0.6].forEach((v, k) => ctx.fillRect(40 + k * 64, H - 30 - v * 180, 40, v * 180));
  } else if (glyph === 'cube') {
    // Two views of the same block shape: is it the same, turned?
    for (const [cx, flip] of [[W * 0.28, 1], [W * 0.72, -1]] as const) {
      const r = 62;
      const a: [number, number] = [cx, H / 2 - r];
      const b: [number, number] = [cx + flip * r * 0.9, H / 2 - r * 0.5];
      const m: [number, number] = [cx, H / 2];
      const d: [number, number] = [cx - flip * r * 0.9, H / 2 - r * 0.5];
      line([a, b, m, d, a]);
      line([d, [d[0], d[1] + r], [cx, H / 2 + r], [b[0], b[1] + r], b]);
      line([m, [cx, H / 2 + r]]);
    }
  } else if (glyph === 'face') {
    ctx.beginPath();
    ctx.arc(W * 0.36, H * 0.42, 26, 0, Math.PI * 2);
    ctx.arc(W * 0.64, H * 0.42, 26, 0, Math.PI * 2);
    ctx.fill();
    line([[W * 0.3, H * 0.72], [W * 0.7, H * 0.72]]);
  } else if (glyph === 'grid') {
    ctx.lineWidth = 3;
    for (let x = 16; x < W; x += 40) line([[x, 0], [x, H]]);
    for (let y = 8; y < H; y += 40) line([[0, y], [W, y]]);
    ctx.beginPath();
    ctx.arc(W * 0.6, H * 0.45, 18, 0, Math.PI * 2);
    ctx.fill();
  } else {
    line([[20, H / 2], [170, H / 2], [200, H / 2 - 90], [235, H / 2 + 80], [265, H / 2 - 30], [290, H / 2], [W - 20, H / 2]]);
  }
  const t = kit.canvasTexture(c, false);
  glyphs.set(key, t);
  return t;
}

/** A screen's face: a glyph lit on dark glass. */
const screenFace = (glyph: Glyph, color = '#9aeaff') => glyphFace(glyph, color);

/** Everything that glows on the beat in one place, one callback between them. */
interface Pulse {
  animated: kit.Animated;
  halos: THREE.Sprite[];
  /** Beacons that flash on one beat of the bar each. */
  beacons: THREE.Sprite[];
  /** Arms working: each a joint and its phase. */
  joints: { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; base: number; swing: number; phase: number }[];
}

function pulse(animated: kit.Animated): Pulse {
  const p: Pulse = { animated, halos: [], beacons: [], joints: [] };
  animated.push((time) => {
    const k = music.kick(time, 0, 5);
    for (const h of p.halos) h.material.opacity = (h.userData.base as number) * (0.7 + 0.3 * k);
    const bar = music.count(time, 4);
    p.beacons.forEach((b, n) => (b.material.opacity = n % 4 === bar ? 0.95 : 0.15));
    // Robots move on the beat: a quick move, then a hold, like a machine.
    for (const j of p.joints) {
      const ph = music.phase(time, j.phase);
      const step = Math.floor(((time * BPM) / 60 + j.phase) % 2);
      const move = ph < 0.35 ? ph / 0.35 : 1;
      const eased = move * move * (3 - 2 * move);
      const from = step === 0 ? -1 : 1;
      j.obj.rotation[j.axis] = j.base + j.swing * (from + (-2 * from) * eased) * 0.5;
    }
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

/** A beacon on a stalk, flashing on its beat. */
function beacon(p: Pulse, color: number, size = 3): THREE.Sprite {
  const s = kit.glowSprite(color, size, 0.2);
  p.beacons.push(s);
  return s;
}

/**
 * An industrial robot arm, orange: a turning base, a shoulder, an elbow and
 * a welding tip, each joint moving on the beat. `size` 1 is about 5 m tall.
 */
function robotArm(p: Pulse, size = 1, phase = 0, spark = true): THREE.Group {
  const g = new THREE.Group();
  g.add(slab(2.2, 0.6, 2.2, dark(), 0, 0.3, 0));
  const turn = new THREE.Group();
  turn.position.y = 0.6;
  turn.add(pole(1.2, 0.8, orange()));
  const shoulder = new THREE.Group();
  shoulder.position.y = 1.4;
  shoulder.add(slab(0.7, 3.4, 0.7, orange(), 0, 1.7, 0));
  const elbow = new THREE.Group();
  elbow.position.y = 3.4;
  const knuckle = new THREE.Mesh(BALL(), dark());
  knuckle.scale.setScalar(0.55);
  elbow.add(knuckle, slab(0.55, 0.55, 2.8, orange(), 0, 0, 1.4));
  const tip = new THREE.Group();
  tip.position.z = 2.8;
  tip.add(slab(0.3, 0.9, 0.3, steel(), 0, -0.45, 0));
  if (spark) {
    const s = kit.glowSprite(0xfff0c0, 1.6, 0.9);
    s.position.y = -1;
    tip.add(s);
    p.animated.push((time) => {
      const on = music.phase(time, phase) > 0.4;
      s.visible = on;
      s.scale.setScalar(on ? 1 + Math.random() * 1.2 : 0.01);
    });
  }
  elbow.add(tip);
  shoulder.add(elbow);
  turn.add(shoulder);
  g.add(turn);
  shoulder.rotation.x = 0.3;
  elbow.rotation.x = 0.6;
  p.joints.push({ obj: turn, axis: 'y', base: 0, swing: 1.2, phase });
  p.joints.push({ obj: shoulder, axis: 'x', base: 0.35, swing: 0.4, phase: phase + 0.5 });
  p.joints.push({ obj: elbow, axis: 'x', base: 0.7, swing: 0.5, phase: phase + 0.25 });
  g.scale.setScalar(size);
  return g;
}

/** A robot standing: a white box of a body, a screen for a face, a red eye in it. */
function robot(p: Pulse, size = 1, rand: () => number = Math.random): THREE.Group {
  const g = new THREE.Group();
  g.add(slab(0.4, 1, 0.4, steel(), -0.35, 0.5, 0), slab(0.4, 1, 0.4, steel(), 0.35, 0.5, 0));
  g.add(slab(1.3, 1.4, 0.8, white(), 0, 1.7, 0));
  g.add(slab(0.3, 1.1, 0.3, steel(), -0.85, 1.8, 0), slab(0.3, 1.1, 0.3, steel(), 0.85, 1.8, 0));
  const head = slab(1, 0.8, 0.8, dark(), 0, 2.85, 0);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), kit.lit(rand() < 0.3 ? STOP : SCREEN));
  face.position.set(0, 2.85, 0.41);
  g.add(head, face);
  const glow = halo(p, SCREEN, 2.4, 0.4);
  glow.position.set(0, 2.85, 0.6);
  g.add(glow);
  g.scale.setScalar(size);
  return g;
}

/** One of the people the machines replaced: a grey figure, a box of their things in their arms. */
function leaver(size = 1, rand: () => number = Math.random): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 2, 8), person());
  body.position.y = 1.0;
  const head = new THREE.Mesh(BALL(), person());
  head.scale.setScalar(0.3);
  head.position.set(0, 1.85, 0.1);
  const box = slab(0.8, 0.5, 0.55, cardboard(), 0, 1.05, 0.45);
  g.add(body, head, box);
  if (rand() < 0.5) {
    const plant = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 6), kit.matte(0x4a8a3a));
    plant.position.set(0.15, 1.5, 0.45);
    g.add(plant);
  }
  g.rotation.x = 0.12;
  g.scale.setScalar(size);
  return g;
}

/** The roadside props, built for one place's pulse. Each is built at the origin, facing +z, its foot on the ground. */
function props(p: Pulse) {
  const crates: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const n = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const s = 1.4 + rand() * 0.8;
      const c = slab(s, s, s, cardboard(), (rand() - 0.5) * 4, s / 2 + (k > 2 ? s : 0), (rand() - 0.5) * 4);
      c.rotation.y = rand() * 0.6;
      g.add(c);
    }
    g.add(slab(3.6, 0.3, 3.6, wood(), 0, 0.15, 0));
    return g;
  };
  const barrels: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const colors = [0x2a6aaa, 0xaa2a2a, SAFETY, 0x3a8a4a];
    for (let k = 0; k < 4; k++) {
      const b = pole(1.8, 0.65, kit.matte(colors[Math.floor(rand() * colors.length)]));
      b.position.x = (k % 2) * 1.4 - 0.7;
      b.position.z = Math.floor(k / 2) * 1.4 - 0.7;
      g.add(b);
    }
    return g;
  };
  const arm: kit.Prop = (rand) => {
    const g = new THREE.Group();
    g.add(robotArm(p, 0.9 + rand() * 0.6, rand() * 2));
    const floor = new THREE.Mesh(new THREE.RingGeometry(3, 3.4, 24), new THREE.MeshBasicMaterial({ color: SAFETY, side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.05;
    g.add(floor);
    return g;
  };
  const bot: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const r = robot(p, 1.2 + rand() * 0.5, rand);
    g.add(r);
    return g;
  };
  const screen: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const w = 4 + rand() * 4;
    const h = w * 0.6;
    const post = 2.5 + rand() * 4;
    const face = kit.signPanel(w, screenFace(GLYPHS[Math.floor(rand() * GLYPHS.length)]), { h, depth: 0.4, frame: dark() });
    face.position.y = post + h / 2;
    const lit = halo(p, SCREEN, w * 1.2, 0.14);
    lit.position.y = post + h / 2;
    g.add(pole(post, 0.25, steel()), face, lit);
    return g;
  };
  const rack: kit.Prop = (rand) => {
    blinkLeds(p.animated);
    const g = new THREE.Group();
    const h = 4 + rand() * 4;
    g.add(slab(2.4, h, 1.8, dark(), 0, h / 2, 0));
    for (let k = 0; k < 10; k++) {
      const led = new THREE.Mesh(BOX(), LED[k % 3]);
      led.scale.set(0.25, 0.18, 0.1);
      led.position.set(-0.7 + (k % 3) * 0.7, 0.6 + (k / 10) * (h - 1), 0.92);
      g.add(led);
    }
    return g;
  };
  const desk: kit.Prop = (rand) => {
    const g = new THREE.Group();
    g.add(slab(3.2, 0.2, 1.6, wood(), 0, 1.6, 0), slab(0.2, 1.5, 1.4, dark(), -1.4, 0.75, 0), slab(0.2, 1.5, 1.4, dark(), 1.4, 0.75, 0));
    const mon = kit.signPanel(1.6, screenFace(rand() < 0.5 ? 'wave' : 'face'), { h: 1, depth: 0.1, frame: dark() });
    mon.position.set(0, 2.3, -0.4);
    mon.rotation.y = Math.PI;
    g.add(mon);
    // The empty chair, pushed back.
    const chair = new THREE.Group();
    chair.add(slab(1, 0.15, 1, dark(), 0, 1, 0), slab(1, 1.1, 0.12, dark(), 0, 1.6, 0.5), pole(0.9, 0.08, steel()));
    chair.position.set((rand() - 0.5) * 1.2, 0, 1.4 + rand());
    chair.rotation.y = (rand() - 0.5) * 1.2;
    g.add(chair);
    return g;
  };
  const drone: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const d = new THREE.Group();
    d.add(slab(1.2, 0.4, 1.2, white()));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 12), kit.matte(0x30343a));
      rotor.position.set(x * 0.9, 0.3, z * 0.9);
      d.add(rotor);
    }
    const eye = kit.glowSprite(STOP, 1.2, 0.9);
    eye.position.set(0, -0.3, 0.6);
    d.add(eye);
    const y0 = 5 + rand() * 6;
    const ph = rand() * 6;
    d.position.y = y0;
    g.add(d);
    p.animated.push((time) => {
      d.position.y = y0 + 0.6 * Math.sin(time * 1.3 + ph);
      d.rotation.y = 0.4 * Math.sin(time * 0.5 + ph);
    });
    return g;
  };
  const cones: kit.Prop = (rand) => {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1, 10), kit.matte(ROBOT, { emissive: 0x401000 }));
      c.position.set((rand() - 0.5) * 5, 0.5, (rand() - 0.5) * 5);
      g.add(c);
    }
    return g;
  };
  const slips: kit.Prop = (rand) => {
    const g = new THREE.Group();
    for (let k = 0; k < 14; k++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), paper());
      s.rotation.set(-Math.PI / 2 + (rand() - 0.5) * 0.4, 0, rand() * 6);
      s.position.set((rand() - 0.5) * 5, 0.05 + k * 0.03, (rand() - 0.5) * 5);
      g.add(s);
    }
    g.add(slab(1.2, 0.8, 0.9, cardboard(), (rand() - 0.5) * 2, 0.4, (rand() - 0.5) * 2));
    return g;
  };
  const leavers: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const l = leaver(1.1 + rand() * 0.2, rand);
      l.position.set((rand() - 0.5) * 4, 0, (rand() - 0.5) * 4);
      l.rotation.y = rand() * 6;
      g.add(l);
    }
    return g;
  };
  const lamp: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const h = 8 + rand() * 3;
    g.add(pole(h, 0.18, steel()), slab(2.4, 0.2, 0.5, steel(), 1, h, 0));
    const l = kit.glowSprite(SODIUM, 7, 0.55);
    l.position.set(2, h - 0.3, 0);
    const pool = kit.lightPool(SODIUM, 6, 0.25);
    pool.position.set(2, 0.06, 0);
    g.add(l, pool);
    return g;
  };
  const forklift: kit.Prop = (rand) => {
    const g = new THREE.Group();
    g.add(slab(1.8, 1.2, 2.6, yellow(), 0, 1, 0), slab(1.6, 1.4, 0.2, dark(), 0, 2.3, -0.6));
    g.add(slab(0.15, 3.4, 0.15, dark(), -0.6, 1.7, 1.4), slab(0.15, 3.4, 0.15, dark(), 0.6, 1.7, 1.4));
    const fork = new THREE.Group();
    fork.add(slab(0.2, 0.1, 1.4, steel(), -0.5, 0, 0.7), slab(0.2, 0.1, 1.4, steel(), 0.5, 0, 0.7), slab(1.4, 1.2, 1.2, cardboard(), 0, 0.65, 0.8));
    fork.position.set(0, 0.4, 1.5);
    const light = beacon(p, SODIUM, 1.6);
    light.position.set(0, 3.2, -0.6);
    g.add(fork, light);
    for (const [x, z] of [[-0.95, -0.8], [0.95, -0.8], [-0.95, 0.9], [0.95, 0.9]]) {
      const w = pole(0.3, 0.45, dark());
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.45, z);
      g.add(w);
    }
    const ph = rand() * 6;
    p.animated.push((time) => (fork.position.y = 0.4 + 1.6 * (0.5 + 0.5 * Math.sin(time * 0.8 + ph))));
    return g;
  };
  const tank: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const h = 6 + rand() * 6;
    g.add(pole(h, 2.2, kit.matte(0xb0b4ba)), pole(0.6, 2.3, yellow(), h * 0.6));
    const top = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), kit.matte(0xb0b4ba));
    top.position.y = h;
    const light = beacon(p, STOP, 2.6);
    light.position.y = h + 2.6;
    g.add(top, light);
    return g;
  };
  /** A mental rotation figure on a post, turning. */
  const shape: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const h = 3 + rand() * 4;
    const sh = rotationShape(rand() < 0.5 ? SCREEN : GOLD, 0.8 + rand() * 0.4);
    sh.position.y = h + 2;
    const ph = rand() * 6;
    p.animated.push((time) => sh.rotation.set(time * 0.6 + ph, time * 0.8 + ph, 0));
    g.add(pole(h, 0.15, steel()), sh);
    return g;
  };
  /** A shard of glass standing up, a colour thrown off it. */
  const shard: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const h = 3 + rand() * 5;
    const glassM = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 1.4, h, 3), new THREE.MeshPhongMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.5, specular: 0xffffff, shininess: 120 }));
    glassM.position.y = h / 2;
    glassM.rotation.z = (rand() - 0.5) * 0.3;
    const RAIN = [0xff3a3a, 0xffe03a, 0x5aff6a, 0x3ac8ff, 0xc05aff];
    const lit = kit.glowSprite(RAIN[Math.floor(rand() * RAIN.length)], 4, 0.4);
    lit.position.y = h * 0.6;
    g.add(glassM, lit);
    return g;
  };
  return { crates, barrels, arm, bot, screen, rack, desk, drone, cones, slips, leavers, lamp, forklift, tank, shape, shard };
}

/** What the screens say. */

// The LEDs on the racks blink from one callback, however many racks there are.
const LED = [new THREE.MeshBasicMaterial({ color: GO }), new THREE.MeshBasicMaterial({ color: STOP }), new THREE.MeshBasicMaterial({ color: SCREEN })];
const ledOn = new WeakSet<kit.Animated>();
function blinkLeds(animated: kit.Animated): void {
  if (ledOn.has(animated)) return;
  ledOn.add(animated);
  const on = LED.map((m) => m.color.getHex());
  animated.push((time) => LED.forEach((m, k) => m.color.setHex(Math.sin(time * (4 + k * 1.9) + k * 2) > 0 ? on[k] : 0x0a0c10)));
}

// Scenery.

/** How much room each landmark wants kept clear round it, in metres. */
const ROOM: Partial<Record<string, number>> = { primateKing: 44, heirStatue: 30, overlord: 30, greatPrism: 30, cyberSurgeon: 30, serverFarm: 34, crackOfDoom: 40, karmaDino: 26 };

/**
 * Off-road scenery by the stretch of the lap it's beside: crates, barrels,
 * robot arms, robots, screens, racks, drones and lamps. The roadside fill;
 * each stretch's own dressing is its `factoryField`.
 */
export function factoryFeature(animated: kit.Animated, track?: Track): Feature {
  const sectionAt = track ? kit.sectionNamer(track) : () => '';
  const P = props(pulse(animated));
  const general: [number, kit.Prop][] = [
    [2, P.crates],
    [1.4, P.barrels],
    [1.2, P.lamp],
    [1, P.tank],
    [0.8, P.cones],
  ];
  const bySection: Record<string, [number, kit.Prop][]> = {
    'Join the Last Migration': [[3, P.leavers], [2, P.screen]],
    'Your New Best Mate': [[4, P.arm], [2, P.bot]],
    'King of a Bald Primate': [[5, P.arm], [1, P.bot]],
    'Not Worthy': [[4, P.leavers], [1, P.screen]],
    'Mental Rotation': [[4, P.screen], [3, P.shape]],
    'Super-Organism': [[4, P.bot], [2, P.arm]],
    'Bending Light Through Prisms': [[4, P.shard], [2, P.screen]],
    'Cyber-Surgeon': [[4, P.bot], [2, P.rack]],
    'The Neural Network': [[6, P.rack], [1, P.drone]],
    'Prepare for Mutation': [[4, P.bot], [3, P.forklift]],
    'The Crack of Doom': [[3, P.barrels], [3, P.cones]],
    'Death Kiss': [[4, P.bot], [2, P.screen]],
    'Inside a Simulation': [[3, P.shape], [2, P.leavers]],
  };

  const noSite = {} as kit.Site;
  const kept = track ? track.def.landmarks.filter((l) => ROOM[l.kind] !== undefined).map((l) => ({ ...kit.offRoad(track.main, l.s * track.main.scale, l.lateral ?? 0), r: ROOM[l.kind]! })) : [];
  return (x, z, rand) => {
    if (kept.some((q) => Math.hypot(x - q.x, z - q.z) < q.r)) return new THREE.Group();
    const obj = kit.weighted(rand, [...general, ...(bySection[sectionAt(x, z)] ?? [])])(rand, noSite);
    obj.position.set(x, 0, z);
    obj.rotation.y = rand() * Math.PI * 2;
    return obj;
  };
}

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
  /** Where the landmarks stand, and how much room each wants. */
  stands: { x: number; z: number; r: number }[];
}

const along = (f: Field, frac: number): number => f.from + (f.to - f.from) * frac;

function roomy(track: Track, ribbon: Ribbon, s: number, away: number): 1 | -1 {
  const room = (side: 1 | -1) => {
    const at = kit.beside(ribbon, s, side, away);
    return Math.max(Math.abs(at.x), Math.abs(at.z)) > track.def.bounds - 40 ? -1 : kit.clearance(track, at.x, at.z);
  };
  return room(1) >= room(-1) ? 1 : -1;
}

/** Stands a mid-ground set piece `away` metres off the road, `frac` along the field, on the side with room, facing the karts. */
function midground(f: Field, piece: THREE.Object3D, frac: number, away: number, radius: number): THREE.Object3D {
  const s = along(f, frac);
  const first = roomy(f.track, f.ribbon, s, away);
  let lateral = first * (f.ribbon.halfWidthAtS(s) + away);
  search: for (const extra of [0, 14, 28]) {
    for (const side of [first, first === 1 ? -1 : 1] as const) {
      const at = kit.beside(f.ribbon, s, side, away + extra);
      if (Math.max(Math.abs(at.x), Math.abs(at.z)) > f.track.def.bounds - 30 || kit.clearance(f.track, at.x, at.z) < radius) continue;
      if (f.stands.some((q) => Math.hypot(at.x - q.x, at.z - q.z) < q.r + radius)) continue;
      lateral = side * (f.ribbon.halfWidthAtS(s) + away + extra);
      break search;
    }
  }
  kit.standBeside(piece, f.ribbon, s, lateral);
  f.g.add(piece);
  return piece;
}

/** A banner of the words across the road `frac` of the way along the field. */
function words(f: Field, frac: number, lines: string[], color = '#ffd25a', glow = SAFETY): void {
  f.g.add(kit.roadBanner(f.ribbon, along(f, frac), lines, { style: 'neon', bg: '#0a0c10', fg: color, glow: color, glowColor: glow, lift: 7, post: steel() }, f.animated));
}

/** A crane gantry across the road `frac` of the way along the field: yellow legs, a beam with beacons, a crate swinging from its hook on the beat. Where a banner of words would hang, the machines' own work instead. */
function gantry(f: Field, frac: number, load: number = SAFETY): void {
  const s = along(f, frac);
  const fr = kit.frameAt(f.ribbon, s);
  const hw = f.ribbon.halfWidthAtS(s) + 2.5;
  const H = 9;
  const g = new THREE.Group();
  for (const side of [-1, 1]) g.add(slab(1.2, H, 1.2, yellow(), side * hw, H / 2, 0));
  g.add(slab(2 * hw + 2, 1.4, 1.6, kit.matte(0x3a3e46), 0, H + 0.7, 0));
  for (let k = 0; k < 8; k++) g.add(slab(1.4, 0.12, 1.65, k % 2 ? yellow() : dark(), -hw + (k + 0.5) * (2 * hw / 8), H + 1.45, 0));
  for (const side of [-1, 1]) {
    const b = beacon(f.p, side < 0 ? STOP : SODIUM, 2.6);
    b.position.set(side * (hw - 0.5), H + 2, 0);
    g.add(b);
  }
  // The hoist and its load, swinging gently across the road.
  const hoist = new THREE.Group();
  hoist.position.set(0, H, 0);
  const cable = pole(3, 0.06, steel());
  cable.position.y = -3;
  const crate = slab(2.2, 1.6, 1.6, kit.matte(load), 0, -3.9, 0);
  hoist.add(cable, crate);
  g.add(hoist);
  const phase = s * 0.13;
  f.animated.push((time) => {
    hoist.rotation.z = Math.sin(time * 1.3 + phase) * 0.12;
    hoist.position.x = Math.sin(time * 0.4 + phase) * hw * 0.5;
  });
  g.position.set(fr.x, Math.max(0, fr.y), fr.z);
  g.rotation.y = fr.heading;
  f.g.add(g);
}

/** Props strewn either side of the field, in the band 3 to 20 m off the road. */
function strew(f: Field, kinds: [number, kit.Prop][], spacing = 14, o: Partial<kit.ScatterOptions> = {}): void {
  const clear = kinds.map(([w, prop]): [number, kit.Prop] => [w, (rand, site) => (f.stands.some((q) => Math.hypot(site.x - q.x, site.z - q.z) < q.r) ? new THREE.Group() : prop(rand, site))]);
  f.g.add(kit.scatter({ track: f.track, ribbon: f.ribbon, from: f.from, to: f.to, spacing: spacing * 0.75, band: [3.5, 20], scale: [1, 1.6], kinds: clear, seed: f.seed, ...o }));
}

const BOLT = once(() => new THREE.CylinderGeometry(0.18, 0.18, 0.5, 6));
const PLATE = once(() => new THREE.BoxGeometry(1.4, 0.08, 1));
const BOXLET = once(() => new THREE.BoxGeometry(0.9, 0.9, 0.9));
const PAPER = once(() => new THREE.PlaneGeometry(0.5, 0.7));
/** The floor underfoot, four layers in one draw call each: nuts and bolts, steel offcuts, boxes, and dropped paper. */
function floor(f: Field, density = 1, slips = false): void {
  const base = { track: f.track, ribbon: f.ribbon, from: f.from, to: f.to };
  f.g.add(
    kit.scatterInstanced({ ...base, spacing: 1.4 / density, band: [2.5, 24], geometry: BOLT(), material: kit.matte(0xffffff), colors: [0x8a9098, 0x5a6068, 0xb0b4ba, SAFETY], lift: 0.2, tilt: 1.5, scale: [0.8, 1.6], seed: f.seed + 3 }),
    kit.scatterInstanced({ ...base, spacing: 3 / density, band: [2.5, 18], geometry: PLATE(), material: kit.matte(0xffffff), colors: [0x5a6068, 0x7a8088, 0x3a3e44], lift: 0.05, scale: [0.9, 2], seed: f.seed + 5 }),
    kit.scatterInstanced({ ...base, spacing: 5 / density, band: [3, 16], geometry: BOXLET(), material: kit.matte(0xffffff), colors: [0xb08850, 0xc09a60, 0x9a7440], lift: 0.45, scale: [0.9, 1.8], seed: f.seed + 7 }),
    kit.scatterInstanced({ ...base, spacing: (slips ? 0.9 : 4) / density, band: [2.5, 22], geometry: PAPER(), material: kit.matte(0xffffff, { double: true }), colors: slips ? [PINK, 0xffb0d0, 0xf0f0f0] : [0xf0f0f0, PINK], lift: 0.04, tilt: 0.3, seed: f.seed + 9 }),
  );
}

/** A line of the people let go, standing along the road with their boxes. */
function queue(f: Field, side: 'left' | 'right', from: number, to: number, near = 8): void {
  f.g.add(kit.crowd({ track: f.track, ribbon: f.ribbon, from, to, side, rows: 2, spacing: 2.2, band: [near, near + 0.5], motion: 'sway', beat: music, clothes: [0x6a6e78, 0x5a5e68, 0x8a8e98, 0x4a4e58], skin: 0x8a8e98, height: 1.8, lights: { color: SCREEN, every: 4, size: 0.9 }, seed: f.seed + (side === 'left' ? 1 : 2) }, f.animated).group);
}

/** A row of robots along the road, working to the beat. */
function robotRow(f: Field, side: 'left' | 'right', from: number, to: number, near = 7): void {
  f.g.add(kit.crowd({ track: f.track, ribbon: f.ribbon, from, to, side, rows: 1, spacing: 3, band: [near, near + 0.4], motion: 'jump', beat: music, clothes: [0xe4e6ea, 0xd0d4da], skin: 0x22252a, height: 2.4, lights: { color: STOP, every: 2, size: 0.8 }, seed: f.seed + (side === 'left' ? 3 : 4) }, f.animated).group);
}

/** A giant screen on two legs, its glyph lit: a mid-ground set piece, pulsing on the beat. */
function giantScreen(f: Field, glyph: Glyph, w = 22, color = SCREEN): THREE.Object3D {
  const body = new THREE.Group();
  const h = w * 0.6;
  const legs = 6;
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  const face = kit.signPanel(w, glyphFace(glyph, hex), { h, depth: 1, frame: dark() });
  face.position.y = legs + h / 2;
  body.add(face, pole(legs, 0.6, steel()).translateX(-w * 0.3), pole(legs, 0.6, steel()).translateX(w * 0.3));
  return kit.setPiece({ body, base: 'plinth', baseColor: 0x2a2e34, baseWidth: w * 0.9, glow: { color, size: w * 0.9, y: legs + h / 2, opacity: 0.12 }, beat: music }, f.animated);
}

/** A giant robot, a screen for a face, standing watch. */
function giantRobot(f: Field): THREE.Object3D {
  const body = robot(f.p, 7, seededRandom(f.seed));
  return kit.setPiece({ body, base: 'plinth', baseColor: 0x2a2e34, glow: { color: SCREEN, size: 22, y: 18, opacity: 0.12 }, breathe: 0.01, beat: music }, f.animated);
}

/** A cooling tower breathing steam. */
function coolingTower(f: Field, s: number, away: number): void {
  const side = roomy(f.track, f.ribbon, s, away);
  const at = kit.beside(f.ribbon, s, side, away);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(7, 10, 26, 20, 1, true), kit.matte(0x9a9ea4, { double: true }));
  tower.position.set(at.x, 13, at.z);
  const steam = kit.smokeColumn({ height: 60, width: 9, under: 0x8a8e94, color: 0xd8dce0 }, f.animated);
  steam.position.set(at.x, 24, at.z);
  f.g.add(tower, steam);
}

/** A chimney with smoke. */
function chimney(f: Field, s: number, away: number): void {
  const side = roomy(f.track, f.ribbon, s, away);
  const at = kit.beside(f.ribbon, s, side, away);
  const c = pole(34, 2.4, kit.matte(0x7a3a2a));
  c.position.set(at.x, 17, at.z);
  const band = pole(1.2, 2.5, yellow(), 30);
  band.position.set(at.x, 30.6, at.z);
  const smoke = kit.smokeColumn({ height: 70, width: 6, under: 0x4a4a4a, color: 0x5a5a5e }, f.animated);
  smoke.position.set(at.x, 34, at.z);
  f.g.add(c, band, smoke);
}

const FIELDS: Record<string, (f: Field) => void> = {
  // Join the last migration: everyone walking in through the gate with their things, birds going over the same way.
  'Join the Last Migration'(f) {
    strew(f, [[3, f.P.leavers], [2, f.P.crates], [2, f.P.lamp], [1, f.P.screen]], 12);
    floor(f);
    queue(f, 'left', f.from, f.to, 9);
    midground(f, giantScreen(f, 'face', 22, SAFETY), 0.5, 36, 15);
    const birds = kit.flock({ count: 24, radius: 50, height: 40, color: 0x1a1c20, size: 1.4 }, f.animated);
    const at = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    birds.position.set(at.x, 0, at.z);
    f.g.add(birds);
  },
  // Your new best mate: the conveyor up under the presses, robots either side waving you on.
  'Your New Best Mate'(f) {
    strew(f, [[4, f.P.arm], [2, f.P.forklift], [2, f.P.bot], [1, f.P.barrels]], 13);
    floor(f);
    robotRow(f, 'left', along(f, 0.3), along(f, 0.85), 7);
    robotRow(f, 'right', along(f, 0.3), along(f, 0.85), 7);
    chimney(f, along(f, 0.4), 50);
    const sparks = kit.motes({ count: 140, radius: 40, height: 16, color: 0xffd080, drift: 'rise', speed: 2.4, size: 0.4, seed: f.seed }, f.animated);
    const at = kit.offRoad(f.ribbon, along(f, 0.6), 0);
    sparks.position.set(at.x, 0, at.z);
    f.g.add(sparks);
  },
  // King of a bald primate: round his throne, gold everywhere, his attendants working.
  'King of a Bald Primate'(f) {
    strew(f, [[4, f.P.arm], [2, f.P.bot], [2, f.P.barrels], [1, f.P.tank]], 13, { side: 'right' });
    strew(f, [[3, f.P.crates], [2, f.P.lamp], [1, f.P.cones]], 16, { side: 'left', band: [3.5, 10] });
    floor(f);
    gantry(f, 0.8, GOLD);
    const dust = kit.motes({ count: 120, radius: 40, height: 20, color: GOLD, drift: 'float', size: 0.45, seed: f.seed }, f.animated);
    const at = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    dust.position.set(at.x, 0, at.z);
    f.g.add(dust);
  },
  // Not worthy: the chicane past the heir, the figures kneeling along it.
  'Not Worthy'(f) {
    strew(f, [[4, f.P.leavers], [2, f.P.screen], [1, f.P.lamp]], 10);
    floor(f, 1, true);
    gantry(f, 0.3);
    const dust = kit.motes({ count: 90, radius: 30, height: 10, color: 0xffe8b0, drift: 'float', size: 0.3, seed: f.seed }, f.animated);
    const at = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    dust.position.set(at.x, 0, at.z);
    f.g.add(dust);
  },
  // Mental rotation for the overlord: screens of turning shapes, drones, a giant robot keeping count.
  'Mental Rotation'(f) {
    strew(f, [[4, f.P.screen], [2, f.P.drone], [2, f.P.shape], [1, f.P.rack]], 11);
    floor(f);
    words(f, 0.12, ['MENTAL ROTATION'], '#9aeaff', SCREEN);
    gantry(f, 0.9, SCREEN);
    midground(f, giantRobot(f), 0.72, 36, 14);
  },
  // The super-organism: up on the deck, robots below working as one, cranes and chimneys.
  'Super-Organism'(f) {
    strew(f, [[3, f.P.bot], [3, f.P.arm], [2, f.P.tank], [1, f.P.crates]], 16, { band: [6, 26], clear: 6 });
    floor(f, 0.7);
    chimney(f, along(f, 0.3), 44);
    coolingTower(f, along(f, 0.7), 60);
    const mid = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    const swarmed = kit.swarm({ count: 160, radius: 50, height: 20, color: ROBOT, size: 0.7, speed: 0.12, seed: f.seed }, f.animated);
    swarmed.position.set(mid.x, 14, mid.z);
    f.g.add(swarmed);
  },
  // Bending light through prisms: off the deck past the great prism, colours thrown across the floor.
  'Bending Light Through Prisms'(f) {
    strew(f, [[3, f.P.shard], [3, f.P.screen], [2, f.P.drone], [1, f.P.lamp]], 13);
    floor(f);
    gantry(f, 0.75, 0xc8a8ff);
    const light = kit.motes({ count: 200, radius: 40, height: 20, color: 0xc8a8ff, drift: 'swirl', speed: 1.4, size: 0.5, seed: f.seed }, f.animated);
    const at = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    light.position.set(at.x, 0, at.z);
    f.g.add(light);
  },
  // The cyber-surgeon and the digital cleanse: the theatre, robots in white, the code raining.
  'Cyber-Surgeon'(f) {
    strew(f, [[4, f.P.bot], [3, f.P.screen], [2, f.P.rack], [1, f.P.lamp]], 12);
    floor(f);
    gantry(f, 0.65, 0xf0f4f8);
    const code = kit.motes({ count: 260, radius: 40, height: 22, color: GO, drift: 'fall', speed: 4, size: 0.45, seed: f.seed }, f.animated);
    const at = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    code.position.set(at.x, 0, at.z);
    f.g.add(code);
  },
  // The neural network at work: racks either side, its nodes firing overhead.
  'The Neural Network'(f) {
    strew(f, [[6, f.P.rack], [1, f.P.drone], [1, f.P.tank]], 9);
    floor(f);
    gantry(f, 0.4, 0x2a6aaa);
    coolingTower(f, along(f, 0.5), 46);
  },
  // Prepare for mutation: the first corner of the U, robots half-changed into something else, green motes.
  'Prepare for Mutation'(f) {
    strew(f, [[4, f.P.bot], [3, f.P.forklift], [2, f.P.arm], [1, f.P.tank]], 13);
    floor(f);
    words(f, 0.2, ['PREPARE FOR', 'MUTATION'], '#c8ff6a', 0x9aff3a);
    robotRow(f, 'right', along(f, 0.25), along(f, 0.8), 8);
    const ooze = kit.motes({ count: 160, radius: 40, height: 14, color: 0x9aff3a, drift: 'rise', speed: 1.2, size: 0.5, seed: f.seed }, f.animated);
    const at = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    ooze.position.set(at.x, 0, at.z);
    f.g.add(ooze);
  },
  // The crack of doom: along the bottom of the U, the floor torn, embers in the air.
  'The Crack of Doom'(f) {
    strew(f, [[3, f.P.barrels], [3, f.P.cones], [2, f.P.tank], [1, f.P.lamp]], 13);
    floor(f);
    gantry(f, 0.75, 0xaa2a2a);
    const embers = kit.motes({ count: 200, radius: 50, height: 24, color: 0xffa040, drift: 'rise', speed: 3, size: 0.45, seed: f.seed }, f.animated);
    const at = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    embers.position.set(at.x, 0, at.z);
    f.g.add(embers);
  },
  // Death kiss: the last corner, a giant robot puckering a red glow, red light everywhere.
  'Death Kiss'(f) {
    strew(f, [[4, f.P.bot], [2, f.P.screen], [2, f.P.forklift], [1, f.P.lamp]], 13);
    floor(f);
    midground(f, giantRobot(f), 0.6, 34, 14);
  },
  // Inside a simulation: the straight home, the grid showing through, the gate ahead.
  'Inside a Simulation'(f) {
    strew(f, [[3, f.P.shape], [2, f.P.leavers], [2, f.P.lamp], [1, f.P.screen]], 12);
    floor(f, 1, true);
    gantry(f, 0.75, GO);
    queue(f, 'right', f.from, f.to, 9);
  },
};

/** The sections a `factoryField` can start in. */
export const FIELD_SECTIONS = Object.keys(FIELDS);

/**
 * One stretch of the lap dressed in layers: props strewn in the
 * foreground, the floor's litter, a set piece in the mid-ground, sparks,
 * steam or slips in the air, and words over the road. Which stretch it is
 * goes by the section at `s`.
 */
export function factoryField(track: Track, ribbon: Ribbon, s: number, to: number, section: string, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const recipe = FIELDS[section];
  if (!recipe) return g;
  const p = pulse(animated);
  const stands = track.def.landmarks.filter((l) => ROOM[l.kind] !== undefined).map((l) => ({ ...kit.offRoad(track.main, l.s * track.main.scale, l.lateral ?? 0), r: ROOM[l.kind]! }));
  recipe({ track, ribbon, from: s, to, animated, g, p, P: props(p), seed: Math.round(s) + 13, stands });
  return g;
}

/** The skyline: factory blocks and chimneys round the world, windows lit sodium, red beacons blinking. */
export function factorySkyline(track: Track, animated: kit.Animated): THREE.Group {
  return kit.skyline({ track, shapes: [[4, 'block'], [3, 'stack'], [2, 'tower'], [1, 'dome']], color: 0x2a2a30, windows: SODIUM, lit: 0.45, beacons: { color: STOP, every: 2 }, count: 60, height: [40, 140], width: [20, 60], gap: 24, depth: 200 }, animated);
}

// Landmarks.

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
  g.rotation.y = at.heading + (lateral < 0 ? -Math.PI / 2 : Math.PI / 2);
  return g;
}

/** The start: the gate everyone migrates through, a giant clock on its lintel ticking on the beat, card racks either side, the belt rolling in, birds going over. */
export function migrationGate(ribbon: Ribbon, s: number, animated: kit.Animated): THREE.Group {
  rollBelt(animated);
  const g = new THREE.Group();
  const p = pulse(animated);
  const hw = ribbon.halfWidthAtS(s) + 3;
  const H = 13;
  for (const side of [-1, 1]) {
    g.add(slab(4, H + 5, 4, kit.matte(0x4a4e56), side * (hw + 2), (H + 5) / 2, 0));
    g.add(slab(4.2, 1.2, 4.2, yellow(), side * (hw + 2), 3, 0), slab(4.2, 1.2, 4.2, yellow(), side * (hw + 2), 7, 0));
    // The card rack: a grid of slots, every one a card.
    const rack = slab(3, 5, 0.4, dark(), side * (hw - 1), 3.5, 2.2);
    g.add(rack);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) g.add(slab(0.7, 0.9, 0.1, kit.matte(r === 1 && c === 1 ? PINK : 0xf0e8d0), side * (hw - 1) - 0.9 + c * 0.9, 1.7 + r * 1.2, 2.45));
    const light = beacon(p, SODIUM, 5);
    light.position.set(side * (hw + 2), H + 6, 0);
    g.add(light);
  }
  g.add(slab(2 * hw + 8, 4, 3, kit.matte(0x3a3e46), 0, H + 3, 0));
  const sign = kit.signPanel(2 * hw - 10, kit.textFace(['AUTOMATION'], { style: 'neon', bg: '#0a0c10', fg: '#ffd25a', glow: '#ffc21a' }), { h: 3.4, depth: 0.3, frame: dark() });
  sign.position.set(0, H + 3, -1.8);
  g.add(sign);
  // The clock: a white face, a ring, two hands; the long one ticks round a beat at a time.
  const clock = new THREE.Group();
  clock.position.set(0, H + 10, 0);
  const face = new THREE.Mesh(new THREE.CircleGeometry(5, 40), kit.lit(0xf4f0e4));
  face.rotation.y = Math.PI;
  face.position.z = -0.6;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.5, 8, 40), kit.matte(0x22252a));
  const back = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 1, 40), dark());
  back.rotation.x = Math.PI / 2;
  clock.add(back, face, rim);
  for (let k = 0; k < 12; k++) {
    const tick = slab(0.3, k % 3 === 0 ? 1.2 : 0.6, 0.1, dark());
    tick.position.set(Math.sin((k / 12) * Math.PI * 2) * 4.3, Math.cos((k / 12) * Math.PI * 2) * 4.3, -0.65);
    tick.rotation.z = -(k / 12) * Math.PI * 2;
    clock.add(tick);
  }
  const long = new THREE.Group();
  long.add(slab(0.35, 4, 0.1, kit.lit(STOP), 0, 2, 0));
  long.position.z = -0.75;
  const short = new THREE.Group();
  short.add(slab(0.5, 2.6, 0.1, dark(), 0, 1.3, 0));
  short.position.z = -0.7;
  clock.add(long, short);
  const glow = halo(p, 0xfff0d0, 16, 0.3);
  glow.position.set(0, 0, -1);
  clock.add(glow);
  g.add(clock, pole(4, 0.6, steel(), H + 5));
  // The migration: a flock going over the gate, the same way as everyone.
  const birds = kit.flock({ count: 18, radius: 30, height: 34, color: 0x1a1c20, size: 1.4 }, animated);
  g.add(birds);
  animated.push((time) => {
    // A tick a beat: sixty to go round, snapping on each.
    const beats = (time * BPM) / 60;
    const tick = Math.floor(beats) + Math.min(1, (beats % 1) * 8);
    long.rotation.z = -(tick / 60) * Math.PI * 2;
    short.rotation.z = -(tick / 720) * Math.PI * 2 - 1;
  });
  return atRoad(g, ribbon, s);
}

/** King of a bald primate: a giant ape, bald and crowned, on a throne in the middle of the hairpin, robot arms attending him on the beat. */
export function primateKing(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(30, 31, 0.4, 40), kit.matte(0x4a3a2a));
  pad.position.y = 0.2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(27, 28.5, 48), new THREE.MeshBasicMaterial({ color: GOLD, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.45;
  g.add(pad, ring);
  // The throne: steps, a seat and a tall back, gilt.
  const gilt = kit.matte(GOLD, { emissive: 0x3a2400 });
  g.add(slab(20, 1.5, 14, dark(), 0, 0.75, 0), slab(16, 1.5, 11, dark(), 0, 2.2, -1), slab(12, 3, 8, gilt, 0, 4.4, -2), slab(12, 18, 1.6, gilt, 0, 12, -6));
  // The ape: a hulking grey-brown body, long arms, a bald head and a heavy brow.
  const fur = kit.matte(0x5a4a3e, { emissive: 0x140c08 });
  const skin = kit.matte(0xb08a78, { emissive: 0x2a1810 });
  const ape = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(4, 5, 6, 14), fur);
  body.position.set(0, 10.5, -2);
  const head = new THREE.Mesh(BALL(), skin);
  head.scale.set(3, 3.2, 3);
  head.position.set(0, 17.6, -1.2);
  const brow = slab(5.6, 0.9, 1.6, skin, 0, 18.4, 1.3);
  const muzzle = new THREE.Mesh(BALL(), kit.matte(0x8a6a5a));
  muzzle.scale.set(1.8, 1.3, 1.4);
  muzzle.position.set(0, 16.4, 1.4);
  ape.add(body, head, brow, muzzle);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(1.3, 7, 4, 10), fur);
    arm.position.set(side * 5.6, 9.5, 0);
    arm.rotation.x = 0.5;
    const eye = kit.glowSprite(SODIUM, 1.4, 0.9);
    eye.position.set(side * 1.2, 17.8, 2.2);
    ape.add(arm, eye);
  }
  // The crown on his bald head.
  const crown = new THREE.Group();
  crown.add(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 1.4, 12, 1, true), kit.matte(GOLD, { emissive: 0x4a3000, double: true })));
  for (let k = 0; k < 6; k++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 5), gilt);
    const a = (k / 6) * Math.PI * 2;
    spike.position.set(Math.sin(a) * 2.4, 1.4, Math.cos(a) * 2.4);
    crown.add(spike);
  }
  crown.position.set(0, 20.6, -1.2);
  ape.add(crown);
  g.add(ape);
  // His robot attendants, working on the beat.
  for (let k = 0; k < 4; k++) {
    const a = -1.1 + (k / 3) * 2.2;
    const arm = robotArm(p, 3.2, k * 0.5, false);
    arm.position.set(Math.sin(a) * 16, 0.4, Math.cos(a) * 16 - 2);
    arm.rotation.y = a + Math.PI;
    g.add(arm);
  }
  const glow = halo(p, GOLD, 40, 0.2);
  glow.position.y = 14;
  const crownGlow = halo(p, GOLD, 10, 0.5);
  crownGlow.position.set(0, 21, -1.2);
  g.add(glow, crownGlow);
  const plaque = kit.signPanel(14, glyphFace('face', '#ffd25a'), { h: 4.5, depth: 0.3, frame: dark() });
  plaque.position.set(0, 4, 26);
  g.add(plaque, pole(2, 0.2, steel()).translateZ(26));
  animated.push((time) => {
    ape.rotation.y = 0.25 * Math.sin(time * 0.4);
    head.rotation.z = 0.08 * music.sway(time, 4);
    crown.rotation.y = time * 0.3;
  });
  g.scale.setScalar(1.25);
  const at = kit.offRoad(ribbon, s, lateral);
  g.position.set(at.x, 0, at.z);
  return g;
}

/** Not worthy of the heir's glory: the heir, a gilded child of the machine on a tall plinth under a halo, rows of figures kneeling to it. */
export function heirStatue(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const gilt = kit.matte(GOLD, { emissive: 0x4a3000 });
  g.add(slab(30, 0.4, 24, kit.matte(0x3a3e46), 0, 0.2, 0), slab(8, 3, 8, dark(), 0, 1.9, -4), slab(6, 6, 6, kit.matte(0xd8d4c8), 0, 6.4, -4));
  const heir = robot(p, 3.4, seededRandom(9301));
  heir.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.material === white() || m.material === steel() || m.material === dark())) m.material = gilt;
  });
  heir.position.set(0, 9.4, -4);
  g.add(heir);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.35, 8, 32), kit.lit(GOLD));
  ring.position.set(0, 22, -4);
  g.add(ring);
  const glow = halo(p, GOLD, 30, 0.3);
  glow.position.set(0, 16, -4);
  g.add(glow, kit.lightPool(GOLD, 16, 0.3));
  // The kneeling: grey figures in rows, bowed low before it.
  const rand = seededRandom(9302);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    const l = leaver(1.4, rand);
    l.rotation.set(0.9, Math.PI, 0);
    l.position.set(-11 + c * 4.4, -0.3, 4 + r * 3.4);
    g.add(l);
  }
  const plaque = kit.signPanel(12, glyphFace('bars', '#ffd25a'), { h: 3, depth: 0.3, frame: dark() });
  plaque.position.set(0, 3, 0.2);
  g.add(plaque);
  animated.push((time) => {
    heir.rotation.y = 0.4 * Math.sin(time * 0.3);
    ring.rotation.x = Math.PI / 2 + 0.2 * Math.sin(time);
    ring.scale.setScalar(1 + 0.08 * music.kick(time));
  });
  g.scale.setScalar(1.2);
  return offRoadFacing(g, ribbon, s, lateral);
}

/** Mental rotation: a wall of screens down the stretch on both sides, a turning block shape over each, the test set for the overlord. */
export function screenWall(ribbon: Ribbon, s: number, to: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const shown: Glyph[] = ['cube', 'cube', 'wave', 'cube', 'grid'];
  const faces: THREE.MeshBasicMaterial[] = [];
  let k = 0;
  for (let d = s; d < to; d += 20, k++) {
    const f = kit.frameAt(ribbon, d);
    const hw = ribbon.halfWidthAtS(d);
    for (const side of [-1, 1]) {
      const at = kit.offRoad(ribbon, d, side * (hw + 9));
      const panel = kit.signPanel(9, screenFace(shown[(k + (side > 0 ? 2 : 0)) % shown.length], side > 0 ? '#ffd25a' : '#9aeaff'), { h: 5.4, depth: 0.5, frame: dark() });
      panel.position.set(at.x, f.y + 6.5, at.z);
      panel.rotation.y = f.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2) + side * 0.35;
      panel.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (m && m.map && !faces.includes(m)) faces.push(m);
      });
      const post = pole(f.y + 4, 0.25, steel());
      post.position.set(at.x, 0, at.z);
      const gl = halo(p, SCREEN, 12, 0.18);
      gl.position.copy(panel.position);
      // On top of each, the shape it's asking you to turn in your head, turning.
      const sh = rotationShape(side > 0 ? GOLD : SCREEN, 0.9);
      sh.position.set(at.x, f.y + 12, at.z);
      g.add(panel, post, gl, sh);
      animated.push((time) => sh.rotation.set(time * 0.5 + d, time * 0.7 + side, 0));
    }
  }
  kit.buzz(faces, animated, 0, 0.6);
  return g;
}

/** The overhead assembly deck: gantries over the road along the deck, boxes riding a conveyor overhead, a robot arm on each, working. */
export function assemblyDeck(ribbon: Ribbon, s: number, to: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const boxes: { obj: THREE.Object3D; d: number }[] = [];
  for (let d = s; d < to; d += 36) {
    const f = kit.frameAt(ribbon, d);
    const hw = ribbon.halfWidthAtS(d) + 1;
    const gantry = new THREE.Group();
    gantry.add(slab(0.8, 9, 0.8, yellow(), -hw, 4.5, 0), slab(0.8, 9, 0.8, yellow(), hw, 4.5, 0), slab(2 * hw + 0.8, 0.8, 1, yellow(), 0, 9, 0));
    const armL = robotArm(p, 0.9, d * 0.01);
    armL.position.set(-hw + 1.2, 0, 1.5);
    const armR = robotArm(p, 0.9, d * 0.01 + 0.5);
    armR.position.set(hw - 1.2, 0, 1.5);
    armR.rotation.y = Math.PI;
    const lamp = beacon(p, SODIUM, 3);
    lamp.position.set(0, 10, 0);
    gantry.add(armL, armR, lamp);
    gantry.position.set(f.x, f.y, f.z);
    gantry.rotation.y = f.heading;
    g.add(gantry);
  }
  // The overhead line: a rail along the deck's right edge with boxes riding it the way you're going.
  const len = to - s;
  for (let k = 0; k < Math.floor(len / 12); k++) {
    const b = slab(1.6, 1.6, 1.6, cardboard());
    boxes.push({ obj: b, d: k * 12 });
    g.add(b);
  }
  for (let d = s; d < to; d += 8) {
    const f = kit.frameAt(ribbon, d);
    const at = kit.offRoad(ribbon, d, ribbon.halfWidthAtS(d) + 3);
    const rail = slab(0.4, 0.4, 8.2, steel());
    rail.position.set(at.x, f.y + 12, at.z);
    rail.rotation.y = f.heading;
    g.add(rail);
  }
  animated.push((time) => {
    for (const b of boxes) {
      const d = s + ((b.d + time * 6) % len);
      const f = kit.frameAt(ribbon, d);
      const at = kit.offRoad(ribbon, d, ribbon.halfWidthAtS(d) + 3);
      b.obj.position.set(at.x, f.y + 11, at.z);
      b.obj.rotation.y = f.heading;
    }
  });
  return g;
}

/** The overlord: a black monolith with a single eye, scanning the road, the shapes it sets for the mental rotation turning round its foot. */
export function overlord(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  g.add(slab(10, 34, 4, kit.matte(0x0e1014, { emissive: 0x04060a }), 0, 17, 0));
  const eye = new THREE.Group();
  const ball = new THREE.Mesh(BALL(), kit.lit(STOP));
  ball.scale.setScalar(2.4);
  eye.add(ball, new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.4, 8, 30), kit.matte(0x30343a)));
  eye.position.set(0, 26, 2.3);
  const glow = halo(p, STOP, 26, 0.35);
  glow.position.set(0, 26, 3);
  g.add(eye, glow);
  // The scanning beam: a red cone sweeping the road.
  const beam = new THREE.Mesh(new THREE.ConeGeometry(14, 40, 24, 1, true), new THREE.MeshBasicMaterial({ color: STOP, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.rotation.x = -Math.PI / 2 - 0.35;
  const pivot = new THREE.Group();
  pivot.position.set(0, 26, 2.3);
  beam.position.set(0, -6, 20);
  pivot.add(beam);
  g.add(pivot);
  // The test: block shapes round its foot, the same shape turned every way, turning.
  const shapes: THREE.Object3D[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const sh = rotationShape(k % 2 ? SCREEN : GOLD, 1.4);
    sh.position.set(Math.sin(a) * 12, 5, Math.cos(a) * 12);
    shapes.push(sh);
    g.add(sh);
  }
  g.add(kit.lightPool(STOP, 20, 0.3));
  const plaque = kit.signPanel(12, glyphFace('face', '#ff8a8a'), { h: 3, depth: 0.3, frame: dark() });
  plaque.position.set(0, 36, 0);
  g.add(plaque);
  animated.push((time) => {
    pivot.rotation.y = 0.7 * Math.sin(time * 0.6);
    eye.rotation.y = pivot.rotation.y;
    ball.scale.setScalar(2.2 + 0.4 * music.kick(time));
    shapes.forEach((sh, k) => sh.rotation.set(time * 0.5 + k, time * 0.7 + k * 2, 0));
  });
  g.scale.setScalar(1.1);
  return offRoadFacing(g, ribbon, s, lateral);
}

/** A mental rotation figure: cubes joined in a bent arm, as on the test, its edges lit. Built round its middle. */
export function rotationShape(color: number, cube: number): THREE.Group {
  const g = new THREE.Group();
  const cells: [number, number, number][] = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [2, 2, 0], [2, 2, 1], [2, 2, 2]];
  const mat = kit.matte(0xe8ecf0, { emissive: 0x202428 });
  const edges = new THREE.LineBasicMaterial({ color });
  const box = new THREE.BoxGeometry(cube, cube, cube);
  const lines = new THREE.EdgesGeometry(box);
  for (const [x, y, z] of cells) {
    const m = new THREE.Mesh(box, mat);
    m.position.set((x - 1) * cube, (y - 1) * cube, (z - 1) * cube);
    const e = new THREE.LineSegments(lines, edges);
    e.position.copy(m.position);
    g.add(m, e);
  }
  return g;
}

/** Bending light through prisms: a great glass prism on a plinth, a white beam into it and a fan of colours out, turning slowly. */
export function greatPrism(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  g.add(slab(18, 2, 18, dark(), 0, 1, 0));
  const turn = new THREE.Group();
  turn.position.y = 2;
  const glassGeo = new THREE.CylinderGeometry(8, 8, 16, 3);
  const prism = new THREE.Mesh(glassGeo, new THREE.MeshPhongMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.45, specular: 0xffffff, shininess: 120, side: THREE.DoubleSide }));
  prism.position.y = 8;
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(glassGeo), new THREE.LineBasicMaterial({ color: 0xffffff }));
  edge.position.y = 8;
  turn.add(prism, edge);
  const ray = (color: number, w: number, len: number, opacity: number) => new THREE.Mesh(new THREE.PlaneGeometry(len, w), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  // The white beam in.
  const beam = ray(0xffffff, 1.2, 40, 0.7);
  beam.position.set(-24, 8, 0);
  turn.add(beam);
  // The fan of colours out.
  [0xff3a3a, 0xff9a2a, 0xffe03a, 0x5aff6a, 0x3ac8ff, 0x6a5aff, 0xc05aff].forEach((c, k) => {
    const r = ray(c, 1.4, 50, 0.55);
    const fan = new THREE.Group();
    fan.position.set(3, 8, 0);
    fan.rotation.y = -0.15 + k * 0.05;
    r.position.x = 25;
    fan.add(r);
    turn.add(fan);
  });
  g.add(turn);
  const glow = halo(p, 0xffffff, 30, 0.25);
  glow.position.y = 10;
  g.add(glow, kit.motes({ count: 120, radius: 30, height: 18, color: 0xe8f4ff, drift: 'float', size: 0.45, seed: 9701 }, animated));
  animated.push((time) => (turn.rotation.y = time * 0.15));
  const at = kit.offRoad(ribbon, s, lateral);
  g.position.set(at.x, 0, at.z);
  return g;
}

/** The cyber-surgeon: an operating theatre open to the road, a patient on the table under the lamp, a many-armed surgical robot working over them, the code on its screens. */
export function cyberSurgeon(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  g.add(slab(30, 0.4, 22, kit.matte(0xd8e8e4, { emissive: 0x18282a }), 0, 0.2, 0), slab(30, 12, 0.5, kit.matte(0x9ab8b4), 0, 6, -11));
  // The table and the patient on it.
  g.add(slab(4, 3, 10, steel(), 0, 1.9, 0), slab(4.4, 0.4, 10.4, white(), 0, 3.6, 0));
  const patient = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 5.4, 4, 10), person());
  body.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(BALL(), person());
  head.scale.setScalar(1);
  head.position.z = -4;
  patient.add(body, head);
  patient.position.set(0, 4.8, 0.4);
  g.add(patient);
  // The robot: a column, a ring overhead, six arms hanging off it, working on the beat.
  g.add(pole(14, 0.6, white()).translateX(-9), slab(9, 0.8, 0.8, white(), -4.5, 14, 0));
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(4, 0.5, 8, 30), white());
  ringM.rotation.x = Math.PI / 2;
  ringM.position.y = 13.5;
  g.add(ringM);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const arm = robotArm(p, 1.1, k * 0.33);
    arm.rotation.x = Math.PI;
    arm.position.set(Math.sin(a) * 4, 13.2, Math.cos(a) * 4);
    g.add(arm);
  }
  // The theatre lamp.
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.4, 1, 20), white());
  lamp.position.set(0, 17, 0);
  const lit = halo(p, 0xe8fff8, 26, 0.4);
  lit.position.set(0, 15, 0);
  const pool = kit.lightPool(0xe8fff8, 10, 0.4);
  pool.position.y = 0.45;
  g.add(lamp, lit, pool);
  // Its screens: the heartbeat, the code it writes you in, the trace.
  const screens: [string[] | Glyph, number][] = [['pulse', GO], [['JAVASCRIPT', 'PERSON'], SCREEN], ['wave', GO]];
  screens.forEach(([w, c], k) => {
    const hex = `#${c.toString(16).padStart(6, '0')}`;
    const face = typeof w === 'string' ? glyphFace(w, hex) : kit.textFace(w, { style: 'neon', bg: '#04120a', fg: hex, glow: hex });
    const sc = kit.signPanel(8, face, { h: 4.8, depth: 0.3, frame: dark() });
    sc.position.set(-10 + k * 10, 8, -10.4);
    sc.rotation.y = Math.PI;
    g.add(sc);
  });
  g.add(kit.motes({ count: 140, radius: 12, height: 14, color: GO, drift: 'fall', speed: 3, size: 0.4, seed: 9802 }, animated));
  return offRoadFacing(g, ribbon, s, lateral);
}

/** The neural network at work: a block of racks under a roof, fans turning, lights blinking, and the network itself over it, firing. */
export function serverFarm(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const P = props(p);
  g.add(slab(36, 0.4, 24, kit.matte(0x30343a), 0, 0.2, 0));
  const rand = seededRandom(9501);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
    const rk = P.rack(rand, {} as kit.Site);
    rk.position.set(-15 + c * 5, 0.4, -9 + r * 6);
    g.add(rk);
  }
  // The fans on the roof.
  const fans: THREE.Object3D[] = [];
  for (const x of [-10, 0, 10]) {
    const housing = pole(1.4, 3, dark(), 12);
    housing.position.x = x;
    const fan = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const blade = slab(5.4, 0.1, 0.8, steel());
      blade.rotation.y = (k / 4) * Math.PI;
      fan.add(blade);
    }
    fan.position.set(x, 13.6, 0);
    fans.push(fan);
    g.add(housing, fan);
  }
  for (const [x, z] of [[-17, -11], [17, -11], [-17, 11], [17, 11]]) g.add(pole(12, 0.4, steel()).translateX(x).translateZ(z));
  g.add(slab(36, 0.6, 24, kit.matte(0x4a4e56), 0, 12, 0));
  const steam = kit.smokeColumn({ height: 40, width: 6, under: 0x8a8e94, color: 0xd8dce0 }, animated);
  steam.position.set(0, 14, 0);
  g.add(steam);
  const glow = halo(p, GO, 40, 0.16);
  glow.position.y = 6;
  g.add(glow);
  // The neural network over it: layers of nodes joined by threads, firing layer by layer on the beat.
  const layers = [4, 6, 6, 3];
  const nodes: THREE.Sprite[][] = [];
  const thread = new THREE.LineBasicMaterial({ color: GO, transparent: true, opacity: 0.35 });
  layers.forEach((n, l) => {
    nodes.push([]);
    for (let k = 0; k < n; k++) {
      const node = kit.glowSprite(GO, 2.4, 0.4);
      node.position.set(-15 + l * 10, 22 + (k - (n - 1) / 2) * 4, 0);
      nodes[l].push(node);
      g.add(node);
      if (l > 0) for (const prev of nodes[l - 1]) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([prev.position, node.position]), thread));
    }
  });
  animated.push((time) => {
    fans.forEach((f, k) => (f.rotation.y = time * (6 + k)));
    const on = music.count(time, 4);
    nodes.forEach((layer, l) => layer.forEach((n, k) => (n.material.opacity = l === on ? 0.95 : 0.25 + 0.1 * Math.sin(time * 3 + k))));
  });
  return offRoadFacing(g, ribbon, s, lateral);
}

/** The crack of doom: a long fissure torn in the floor outside the U, glowing from deep down and throbbing on the beat, smoke and embers rising out of it. */
export function crackOfDoom(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const rand = seededRandom(9901);
  const glowMats: THREE.MeshBasicMaterial[] = [];
  // The crack: a jagged chain of glowing slots, its lips heaved up either side.
  let x = -30;
  let z = 0;
  while (x < 30) {
    const len = 4 + rand() * 5;
    const a = (rand() - 0.5) * 0.9;
    const w = 1.2 + rand() * 2.4;
    const m = new THREE.MeshBasicMaterial({ color: 0xff5a1a });
    glowMats.push(m);
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(len, w), m);
    slot.rotation.set(-Math.PI / 2, 0, a);
    slot.position.set(x + len / 2, 0.08, z);
    g.add(slot);
    for (const side of [-1, 1]) {
      const lip = slab(len, 0.8 + rand() * 1.6, 1.4, kit.matte(0x5a5e64), x + len / 2, 0.4, z + side * (w / 2 + 0.6));
      lip.rotation.set(side * 0.3, -a, 0);
      g.add(lip);
    }
    x += len * Math.cos(a);
    z += len * Math.sin(a) * 0.6;
  }
  const glow = halo(p, 0xff5a1a, 60, 0.35);
  glow.position.y = 4;
  g.add(glow, kit.lightPool(0xff5a1a, 34, 0.4));
  for (const sx of [-18, 2, 20]) {
    const smoke = kit.smokeColumn({ height: 50, width: 6, under: 0xff5a1a, color: 0x2a2224 }, animated, sx);
    smoke.position.set(sx, 0, 0);
    g.add(smoke);
  }
  g.add(kit.motes({ count: 220, radius: 30, height: 30, color: 0xffa040, drift: 'rise', speed: 4, size: 0.5, seed: 9902 }, animated));
  const sign = kit.signPanel(18, glyphFace('pulse', '#ffb08a'), { h: 3.6, depth: 0.3, frame: dark() });
  sign.position.set(0, 9, -10);
  g.add(sign, pole(7, 0.3, steel()).translateZ(-10).translateX(-6), pole(7, 0.3, steel()).translateZ(-10).translateX(6));
  animated.push((time) => {
    const k = music.kick(time, 0, 4);
    for (const m of glowMats) m.color.setRGB(1, 0.25 + 0.3 * k, 0.05);
  });
  return offRoadFacing(g, ribbon, s, lateral);
}

/** The dinosaur inside a simulation: a dinosaur drawn in green wireframe inside a cube of grid lines, walking on the spot on the beat, the grid scrolling under it. */
export function karmaDino(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const wire = new THREE.MeshBasicMaterial({ color: GO, wireframe: true });
  const solid = new THREE.MeshBasicMaterial({ color: 0x0a2a14, transparent: true, opacity: 0.5, depthWrite: false });
  const part = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0) => {
    const o = new THREE.Group();
    o.add(new THREE.Mesh(geo, solid), new THREE.Mesh(geo, wire));
    o.position.set(x, y, z);
    o.rotation.x = rx;
    return o;
  };
  const dino = new THREE.Group();
  dino.add(part(new THREE.SphereGeometry(1, 10, 8).scale(4, 3.4, 7), 0, 9, 0));
  dino.add(part(new THREE.CylinderGeometry(1.2, 2, 7, 8), 0, 13, 6, 0.9));
  dino.add(part(new THREE.BoxGeometry(3, 2.6, 5, 2, 2, 2), 0, 16, 9));
  dino.add(part(new THREE.ConeGeometry(2.4, 12, 8), 0, 8, -10, -Math.PI / 2 - 0.25));
  const legs: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const leg = part(new THREE.CylinderGeometry(1, 1.4, 7, 8), side * 2.4, 3.6, -1);
    legs.push(leg);
    dino.add(leg, part(new THREE.CylinderGeometry(0.4, 0.5, 3, 6), side * 3, 10, 5, 1.2));
  }
  g.add(dino);
  // The simulation: a cube of grid lines round it, and a grid on the floor.
  const cube = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(30, 22, 30)), new THREE.LineBasicMaterial({ color: GO }));
  cube.position.y = 11;
  const grid = new THREE.GridHelper(30, 15, GO, 0x2a8a3a);
  grid.position.y = 0.1;
  g.add(cube, grid);
  const glow = halo(p, GO, 40, 0.18);
  glow.position.y = 11;
  g.add(glow);
  const sign = kit.signPanel(16, glyphFace('grid', '#a8ffb0'), { h: 3.4, depth: 0.3, frame: dark() });
  sign.position.set(0, 24, 15);
  g.add(sign);
  animated.push((time) => {
    const step = music.sway(time, 2);
    legs[0].rotation.x = 0.4 * step;
    legs[1].rotation.x = -0.4 * step;
    dino.position.y = 0.3 * Math.abs(step);
    dino.rotation.y = 0.3 * Math.sin(time * 0.2);
    cube.rotation.y = 0.05 * Math.sin(time * 0.3);
  });
  return offRoadFacing(g, ribbon, s, lateral);
}

// The hazard.

/**
 * The presses: a yellow gantry over the road, its hydraulic heads side by
 * side, each slamming down on its own beat; a warning lamp over each lane
 * goes amber the half beat before its head comes down and green while it's
 * up and safe; the belt under each head lit red while it's down.
 */
export function pressParts(obj: THREE.Object3D): THREE.Object3D[] {
  const frame = new THREE.Group();
  frame.add(slab(1, 12, 1.6, yellow()), slab(1, 12, 1.6, yellow()), slab(1, 1.6, 2, yellow()));
  const heads = new THREE.Group();
  const lamps = new THREE.Group();
  const marks = new THREE.Group();
  for (let k = 0; k < PRESS_LANES; k++) {
    const head = new THREE.Group();
    head.add(slab(1, 1, 1, steel()));
    head.add(slab(1, 0.25, 1, yellow()));
    head.add(slab(0.6, 1, 0.6, kit.matte(0xb0b4ba)));
    heads.add(head);
    const lamp = new THREE.Mesh(BALL(), new THREE.MeshBasicMaterial({ color: GO }));
    lamps.add(lamp);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: STOP, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.14;
    marks.add(mark);
  }
  const parts = [frame, heads, lamps, marks];
  for (const o of parts) obj.add(o);
  return parts;
}

export function posePress(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [frame, heads, lamps, marks] = parts;
  obj.position.set(p.ax, p.ground, p.az);
  obj.rotation.y = p.heading;
  const reach = p.radius;
  const lane = (2 * reach) / PRESS_LANES;
  const top = 9;
  // The gantry: two legs past the edges and a beam across, sized to the road.
  const [legL, legR, beam] = frame.children as THREE.Mesh[];
  legL.scale.set(1, top + 2, 1.6);
  legL.position.set(reach + 1.2, (top + 2) / 2, 0);
  legR.scale.set(1, top + 2, 1.6);
  legR.position.set(-reach - 1.2, (top + 2) / 2, 0);
  beam.scale.set(2 * reach + 3.4, 1.6, 2 * PRESS_DEPTH);
  beam.position.set(0, top + 1.2, 0);
  const beat = p.phase * 4;
  heads.children.forEach((h, k) => {
    const x = -pressLane(k, reach);
    const down = pressDown(beat, k);
    const bottom = 0.25 + (1 - down) * (top - 3.4);
    const [block, stripe, ram] = (h as THREE.Group).children as THREE.Mesh[];
    block.scale.set(lane - 0.6, 1.6, 2 * PRESS_DEPTH);
    block.position.set(x, bottom + 0.8, 0);
    stripe.scale.set(lane - 0.5, 0.3, 2 * PRESS_DEPTH + 0.1);
    stripe.position.set(x, bottom + 0.15, 0);
    const ramLen = top - (bottom + 1.6);
    ram.scale.set(0.7, Math.max(0.1, ramLen), 0.7);
    ram.position.set(x, bottom + 1.6 + ramLen / 2, 0);
    const lamp = lamps.children[k] as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
    lamp.scale.setScalar(0.45);
    lamp.position.set(x, top + 2.4, -PRESS_DEPTH);
    lamp.material.color.setHex(down > 0.05 ? STOP : pressDared(beat, k) ? (Math.floor(elapsed * 16) % 2 ? SAFETY : 0x3a2a00) : GO);
    const mark = marks.children[k] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    mark.scale.set(lane - 0.4, 2 * PRESS_DEPTH + 1, 1);
    mark.position.x = x;
    mark.material.color.setHex(pressDared(beat, k) ? SAFETY : STOP);
    mark.material.opacity = down > 0.05 ? 0.5 * down : pressDared(beat, k) ? 0.35 : 0;
  });
}
