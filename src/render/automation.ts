import * as THREE from 'three';
import { seededRandom } from '../core/math';
import type { HazardPose } from '../items/hazards';
import { BPM, PRESS_DEPTH, PRESS_LANES, pressDared, pressDown, pressLane } from '../kits/automation';
import type { Ribbon, Track } from '../tracks/track';
import * as kit from './scenery';

/**
 * Automation's world (K.G., 2020): a factory where the machines have taken
 * the work and run on by themselves, at dusk under its own smog. The road is
 * a conveyor belt, rolling; the factory floor is concrete painted with
 * safety lines; the walls are hazard stripes. Robot arms weld in their
 * cells, presses stamp on the beat, screens watch the empty desks, drones
 * and forklifts drive themselves, and the last few people stand outside
 * with their things in boxes. Its textures, scenery, landmarks and its
 * hazard's look (the presses stamping their lanes in turn).
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

/** A screen's face: the words lit on dark glass. */
const screenFace = (lines: string[], color = '#9aeaff', glow = '#5ad8ff') => kit.textFace(lines, { style: 'neon', bg: '#04121a', fg: color, glow });
/** A notice: dark letters on a white board, a yellow rule. */
const notice = (lines: string[]) => kit.textFace(lines, { style: 'board', bg: '#f0f0ea', fg: '#1a1c20', rule: '#ffc21a' });

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
    const words = SCREENS[Math.floor(rand() * SCREENS.length)];
    const face = kit.signPanel(w, screenFace(words), { h, depth: 0.4, frame: dark() });
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
    const mon = kit.signPanel(1.6, screenFace([rand() < 0.5 ? 'IDLE' : 'NO USER']), { h: 1, depth: 0.1, frame: dark() });
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
  return { crates, barrels, arm, bot, screen, rack, desk, drone, cones, slips, leavers, lamp, forklift, tank };
}

/** What the screens say. */
const SCREENS: string[][] = [['EFFICIENCY', '100%'], ['NO BREAKS'], ['UPTIME', '24/7'], ['HUMAN', 'NOT FOUND'], ['SHIFT', 'NEVER ENDS'], ['OPTIMISED'], ['TASK', 'COMPLETE'], ['RUNNING']];

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
const ROOM: Partial<Record<string, number>> = { robotArms: 44, emptyOffice: 30, algorithm: 30, pinkSlips: 28, serverFarm: 34, lightsOut: 36 };

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
    'Clocking In': [[3, P.leavers], [2, P.screen]],
    'The Production Line': [[4, P.arm], [2, P.forklift]],
    'Arms That Never Tire': [[5, P.arm], [1, P.bot]],
    'Nobody at the Desk': [[5, P.desk], [1, P.screen]],
    'Screens Watching Screens': [[5, P.screen], [1, P.drone]],
    'Machines Building Machines': [[4, P.bot], [2, P.arm]],
    'The Algorithm Decides': [[3, P.screen], [3, P.rack]],
    'Pink Slips': [[5, P.slips], [3, P.leavers]],
    'The Server Farm': [[6, P.rack], [1, P.drone]],
    'Lights-Out Factory': [[4, P.bot], [3, P.forklift]],
    'Clocking Out': [[4, P.leavers], [2, P.slips]],
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

/** A giant screen on two legs, its words lit: a mid-ground set piece, pulsing on the beat. */
function giantScreen(f: Field, lines: string[], w = 22, color = SCREEN): THREE.Object3D {
  const body = new THREE.Group();
  const h = w * 0.6;
  const legs = 6;
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  const face = kit.signPanel(w, kit.textFace(lines, { style: 'neon', bg: '#04121a', fg: hex, glow: hex }), { h, depth: 1, frame: dark() });
  face.position.y = legs + h / 2;
  body.add(face, pole(legs, 0.6, steel()).translateX(-w * 0.3), pole(legs, 0.6, steel()).translateX(w * 0.3));
  return kit.setPiece({ body, base: 'plinth', baseColor: 0x2a2e34, baseWidth: w * 0.9, glow: { color, size: w * 0.9, y: legs + h / 2, opacity: 0.12 }, beat: music }, f.animated);
}

/** A giant robot arm on a plinth, swinging on the beat, sparks at its tip. */
function giantArm(f: Field): THREE.Object3D {
  const body = robotArm(f.p, 4, f.seed % 4);
  return kit.setPiece({ body, base: 'plinth', baseColor: 0x2a2e34, baseWidth: 14, glow: { color: ROBOT, size: 26, y: 12, opacity: 0.1 }, beat: music }, f.animated);
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
  // Clocking in: the gate, the last people in the car park with their boxes, a screen at the gate.
  'Clocking In'(f) {
    strew(f, [[3, f.P.leavers], [2, f.P.crates], [2, f.P.lamp], [1, f.P.screen]], 12);
    floor(f);
    queue(f, 'left', f.from, f.to, 9);
    midground(f, giantScreen(f, ['SHIFT', 'STARTS NOW'], 22, SAFETY), 0.5, 36, 15);
  },
  // The production line: arms at work either side of the belt, forklifts with no one in them.
  'The Production Line'(f) {
    strew(f, [[4, f.P.arm], [2, f.P.forklift], [2, f.P.crates], [1, f.P.barrels]], 13);
    floor(f);
    words(f, 0.08, ['THE LINE', 'NEVER STOPS']);
    words(f, 0.92, ['AUTOMATION'], '#ff9a5a', ROBOT);
    robotRow(f, 'left', along(f, 0.3), along(f, 0.85), 7);
    robotRow(f, 'right', along(f, 0.3), along(f, 0.85), 7);
    chimney(f, along(f, 0.4), 50);
    const sparks = kit.motes({ count: 140, radius: 40, height: 16, color: 0xffd080, drift: 'rise', speed: 2.4, size: 0.4, seed: f.seed }, f.animated);
    const at = kit.offRoad(f.ribbon, along(f, 0.6), 0);
    sparks.position.set(at.x, 0, at.z);
    f.g.add(sparks);
  },
  // The robot arms' hairpin: arms all round the outside, sparks.
  'Arms That Never Tire'(f) {
    strew(f, [[4, f.P.arm], [2, f.P.bot], [2, f.P.barrels], [1, f.P.tank]], 13, { side: 'right' });
    strew(f, [[3, f.P.crates], [2, f.P.lamp], [1, f.P.cones]], 16, { side: 'left', band: [3.5, 10] });
    floor(f);
    words(f, 0.2, ['ARMS THAT', 'NEVER TIRE'], '#ff9a5a', ROBOT);
    words(f, 0.8, ['NO BREAKS', 'NO SLEEP'], '#ff9a5a', ROBOT);
    midground(f, giantArm(f), 0.55, 30, 14);
  },
  // Nobody at the desk: the empty office, rows of desks, screens on, chairs pushed back.
  'Nobody at the Desk'(f) {
    strew(f, [[5, f.P.desk], [2, f.P.screen], [1, f.P.crates]], 9);
    floor(f, 1, true);
    words(f, 0.3, ['NOBODY', 'AT THE DESK'], '#9aeaff', SCREEN);
    const dust = kit.motes({ count: 90, radius: 30, height: 10, color: 0xd8dce0, drift: 'float', size: 0.3, seed: f.seed }, f.animated);
    const at = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    dust.position.set(at.x, 0, at.z);
    f.g.add(dust);
  },
  // Screens watching screens: a gallery of screens, drones, a giant one watching.
  'Screens Watching Screens'(f) {
    strew(f, [[4, f.P.screen], [2, f.P.drone], [2, f.P.rack], [1, f.P.lamp]], 11);
    floor(f);
    words(f, 0.12, ['SCREENS', 'WATCHING SCREENS'], '#9aeaff', SCREEN);
    words(f, 0.55, ['WE SEE', 'YOUR OUTPUT'], '#9aeaff', SCREEN);
    words(f, 0.9, ['UPTIME 24/7'], '#9aeaff', SCREEN);
    midground(f, giantScreen(f, ['HUMAN', 'NOT FOUND'], 24, STOP), 0.35, 38, 16);
    midground(f, giantRobot(f), 0.72, 36, 14);
  },
  // Machines building machines: up on the deck, the robots on the factory floor below, cranes and chimneys.
  'Machines Building Machines'(f) {
    strew(f, [[3, f.P.bot], [3, f.P.arm], [2, f.P.tank], [1, f.P.crates]], 16, { band: [6, 26], clear: 6 });
    floor(f, 0.7);
    words(f, 0.15, ['MACHINES', 'BUILDING MACHINES'], '#ff9a5a', ROBOT);
    words(f, 0.85, ['NO HANDS', 'REQUIRED']);
    chimney(f, along(f, 0.3), 44);
    coolingTower(f, along(f, 0.7), 60);
    const mid = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    const flock = kit.flock({ count: 10, radius: 60, height: 34, color: 0x1a1c20, size: 1.6 }, f.animated);
    flock.position.set(mid.x, 0, mid.z);
    f.g.add(flock);
  },
  // The algorithm decides: off the deck past the racks, the screens reading out who goes.
  'The Algorithm Decides'(f) {
    strew(f, [[3, f.P.rack], [3, f.P.screen], [2, f.P.drone], [1, f.P.lamp]], 13);
    floor(f);
    words(f, 0.2, ['THE ALGORITHM', 'DECIDES'], '#9aeaff', SCREEN);
    words(f, 0.75, ['YOUR ROLE', 'IS REDUNDANT'], '#ff8a8a', STOP);
  },
  // Pink slips: the people let go lining the road, slips blowing everywhere.
  'Pink Slips'(f) {
    strew(f, [[4, f.P.slips], [3, f.P.leavers], [2, f.P.crates], [1, f.P.lamp]], 12);
    floor(f, 1, true);
    queue(f, 'left', along(f, 0.1), along(f, 0.9), 9);
    queue(f, 'right', along(f, 0.2), along(f, 0.7), 9);
    words(f, 0.15, ['PINK SLIPS'], '#ffb0d0', PINK);
    words(f, 0.65, ['THANK YOU', 'FOR YOUR SERVICE'], '#ffb0d0', PINK);
    const blow = kit.motes({ count: 260, radius: 40, height: 22, color: PINK, drift: 'swirl', speed: 2, size: 0.6, seed: f.seed }, f.animated);
    const at = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    blow.position.set(at.x, 0, at.z);
    f.g.add(blow);
  },
  // The server farm: rows of racks, cooling towers steaming.
  'The Server Farm'(f) {
    strew(f, [[6, f.P.rack], [2, f.P.tank], [1, f.P.drone]], 9);
    floor(f);
    words(f, 0.4, ['THE SERVER FARM'], '#a8ffb0', GO);
    coolingTower(f, along(f, 0.5), 46);
  },
  // Lights out: the factory with no lights on, nobody needs them; only the robots' eyes and the beacons.
  'Lights-Out Factory'(f) {
    strew(f, [[4, f.P.bot], [3, f.P.forklift], [2, f.P.arm], [1, f.P.tank]], 13);
    floor(f);
    words(f, 0.15, ['LIGHTS OUT'], '#ff8a8a', STOP);
    words(f, 0.6, ['NO ONE', 'NEEDS TO SEE'], '#ff8a8a', STOP);
    robotRow(f, 'right', along(f, 0.25), along(f, 0.6), 8);
    midground(f, giantRobot(f), 0.8, 34, 14);
    const eyes = kit.motes({ count: 120, radius: 50, height: 14, color: STOP, drift: 'float', size: 0.5, seed: f.seed }, f.animated);
    const at = kit.offRoad(f.ribbon, along(f, 0.4), 0);
    eyes.position.set(at.x, 0, at.z);
    f.g.add(eyes);
  },
  // Clocking out: the straight home, the gate ahead, the last of them walking out.
  'Clocking Out'(f) {
    strew(f, [[3, f.P.leavers], [2, f.P.slips], [2, f.P.lamp], [1, f.P.crates]], 12);
    floor(f, 1, true);
    words(f, 0.3, ['CLOCK OUT'], '#ffd25a', SAFETY);
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

/** The start: the factory gate, a giant time clock on its lintel ticking on the beat, card racks either side, the belt rolling in. */
export function timeClock(ribbon: Ribbon, s: number, animated: kit.Animated): THREE.Group {
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
  animated.push((time) => {
    // A tick a beat: sixty to go round, snapping on each.
    const beats = (time * BPM) / 60;
    const tick = Math.floor(beats) + Math.min(1, (beats % 1) * 8);
    long.rotation.z = -(tick / 60) * Math.PI * 2;
    short.rotation.z = -(tick / 720) * Math.PI * 2 - 1;
  });
  return atRoad(g, ribbon, s);
}

/** Arms that never tire: a welding cell inside the hairpin, five giant arms round a car body on a jig, sparks flying, a safety fence round it. */
export function robotArms(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const floorPad = new THREE.Mesh(new THREE.CylinderGeometry(30, 31, 0.4, 40), kit.matte(0x4a4e56));
  floorPad.position.y = 0.2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(27, 28.5, 48), new THREE.MeshBasicMaterial({ color: SAFETY, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.45;
  g.add(floorPad, ring);
  // The thing they're building: a kart's body on a jig, turning a step a bar.
  const jig = new THREE.Group();
  jig.add(slab(10, 1.2, 6, dark(), 0, 1.2, 0));
  const shell = new THREE.Group();
  shell.add(slab(8, 2, 4.4, kit.matte(0xc0c4ca), 0, 3, 0), slab(4, 1.6, 4, kit.matte(0xa0a4aa), -0.5, 4.6, 0));
  jig.add(shell);
  g.add(jig);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const arm = robotArm(p, 3.6, k * 0.37);
    arm.position.set(Math.sin(a) * 15, 0.4, Math.cos(a) * 15);
    arm.rotation.y = a + Math.PI;
    g.add(arm);
  }
  // The fence, posts and mesh.
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    g.add(pole(3, 0.12, yellow()).translateX(Math.sin(a) * 25).translateZ(Math.cos(a) * 25));
  }
  const fence = new THREE.Mesh(new THREE.CylinderGeometry(25, 25, 2.6, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x9aa0aa, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  fence.position.y = 1.5;
  g.add(fence);
  const sparks = kit.motes({ count: 160, radius: 10, height: 12, color: 0xffd080, drift: 'rise', speed: 4, size: 0.45, seed: 9201 }, animated);
  sparks.position.y = 2;
  g.add(sparks);
  const glow = halo(p, 0xffe0a0, 40, 0.22);
  glow.position.y = 6;
  g.add(glow);
  const plaque = kit.signPanel(12, notice(['WELDING CELL', 'NO HUMANS']), { h: 4, depth: 0.3, frame: dark() });
  plaque.position.set(0, 4, 26);
  g.add(plaque, pole(2, 0.2, steel()).translateZ(26));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const b = beacon(p, k % 2 ? SODIUM : ROBOT, 4);
    b.position.set(Math.sin(a) * 25, 3.6, Math.cos(a) * 25);
    g.add(b);
  }
  animated.push((time) => (jig.rotation.y = Math.floor((time * BPM) / 240) * (Math.PI / 4) + Math.min(1, ((time * BPM) / 240) % 1 * 6) * (Math.PI / 4)));
  g.scale.setScalar(1.25);
  const at = kit.offRoad(ribbon, s, lateral);
  g.position.set(at.x, 0, at.z);
  return g;
}

/** Nobody at the desk: an open-plan office with its walls gone, rows of desks with their screens on and their chairs pushed back, a vacuum robot going round. */
export function emptyOffice(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const P = props(p);
  g.add(slab(40, 0.4, 28, kit.matte(0x5a6a7a, { emissive: 0x101820 }), 0, 0.2, 0));
  const rand = seededRandom(9301);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    const d = P.desk(rand, {} as kit.Site);
    d.position.set(-14 + c * 7, 0.4, -8 + r * 8);
    d.rotation.y = Math.PI;
    g.add(d);
  }
  // The ceiling's lights on poles, all on, for nobody.
  for (const x of [-12, 0, 12]) {
    const lamp = slab(8, 0.3, 1.2, kit.lit(0xf0f8ff), x, 9, 0);
    g.add(lamp, pole(9, 0.12, steel()).translateX(x));
    const pool = kit.lightPool(0xe0f0ff, 10, 0.25);
    pool.position.set(x, 0.45, 0);
    g.add(pool);
  }
  const board = kit.signPanel(14, notice(['EMPLOYEE OF', 'THE MONTH: A.I.']), { h: 5, depth: 0.3, frame: dark() });
  board.position.set(0, 6, -13);
  board.rotation.y = Math.PI;
  g.add(board, pole(4, 0.2, steel()).translateZ(-13));
  // The vacuum robot, going round and round.
  const vac = new THREE.Group();
  vac.add(pole(0.4, 1.1, dark()), new THREE.Mesh(BALL(), kit.lit(GO)).translateY(0.5).translateZ(0.8));
  vac.children[1].scale.setScalar(0.18);
  g.add(vac);
  animated.push((time) => {
    const a = time * 0.4;
    vac.position.set(Math.sin(a) * 12, 0.4, 2 + Math.cos(a * 1.3) * 4);
    vac.rotation.y = a + Math.PI / 2;
  });
  g.scale.setScalar(1.2);
  return offRoadFacing(g, ribbon, s, lateral);
}

/** Screens watching screens: a wall of screens down the stretch on both sides, big, each a camera or a graph, scanlines rolling. */
export function screenWall(ribbon: Ribbon, s: number, to: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const texts = SCREENS;
  const faces: THREE.MeshBasicMaterial[] = [];
  let k = 0;
  for (let d = s; d < to; d += 20, k++) {
    const f = kit.frameAt(ribbon, d);
    const hw = ribbon.halfWidthAtS(d);
    for (const side of [-1, 1]) {
      const at = kit.offRoad(ribbon, d, side * (hw + 9));
      const panel = kit.signPanel(9, screenFace(texts[(k + (side > 0 ? 3 : 0)) % texts.length]), { h: 5.4, depth: 0.5, frame: dark() });
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
      // A camera on top of each, watching the road.
      const cam = new THREE.Group();
      cam.add(slab(0.9, 0.7, 1.6, white()), new THREE.Mesh(BALL(), kit.lit(STOP)).translateZ(0.85));
      (cam.children[1] as THREE.Mesh).scale.setScalar(0.22);
      cam.position.set(at.x, f.y + 10, at.z);
      cam.rotation.y = f.heading + side * Math.PI / 2;
      g.add(panel, post, gl, cam);
      animated.push((time) => (cam.rotation.y = f.heading + side * (Math.PI / 2) + 0.5 * Math.sin(time * 0.7 + d)));
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

/** The algorithm decides: a black monolith with a single eye, scanning, a ticker of names going green or red round its foot. */
export function algorithm(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const mono = slab(10, 34, 4, kit.matte(0x0e1014, { emissive: 0x04060a }), 0, 17, 0);
  g.add(mono);
  const eye = new THREE.Group();
  const ball = new THREE.Mesh(BALL(), kit.lit(STOP));
  ball.scale.setScalar(2.4);
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.4, 8, 30), kit.matte(0x30343a));
  eye.add(ball, ringM);
  eye.position.set(0, 26, 2.3);
  const glow = halo(p, STOP, 26, 0.35);
  glow.position.set(0, 26, 3);
  g.add(eye, glow);
  // The scanning beam: a red fan sweeping the road.
  const beam = new THREE.Mesh(new THREE.ConeGeometry(14, 40, 24, 1, true), new THREE.MeshBasicMaterial({ color: STOP, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.rotation.x = -Math.PI / 2 - 0.35;
  beam.position.set(0, 20, 22);
  const pivot = new THREE.Group();
  pivot.position.set(0, 26, 2.3);
  beam.position.set(0, -6, 20);
  pivot.add(beam);
  g.add(pivot);
  // The ticker: panels round the foot, each a verdict.
  const verdicts: [string, string][] = [['KEEP', '#a8ffb0'], ['REPLACE', '#ff8a8a'], ['REPLACE', '#ff8a8a'], ['AUTOMATE', '#ffd25a'], ['REPLACE', '#ff8a8a'], ['OPTIMISE', '#9aeaff']];
  verdicts.forEach(([w, c], k) => {
    const a = (k / verdicts.length) * Math.PI * 2;
    const panel = kit.signPanel(6, kit.textFace([w], { style: 'neon', bg: '#04060a', fg: c, glow: c }), { h: 2.4, depth: 0.2, frame: dark() });
    panel.position.set(Math.sin(a) * 11, 2.4, Math.cos(a) * 11);
    panel.rotation.y = a + Math.PI;
    g.add(panel);
  });
  g.add(kit.lightPool(STOP, 20, 0.3));
  animated.push((time) => {
    pivot.rotation.y = 0.7 * Math.sin(time * 0.6);
    eye.rotation.y = pivot.rotation.y;
    ball.scale.setScalar(2.2 + 0.4 * music.kick(time));
  });
  g.scale.setScalar(1.1);
  return offRoadFacing(g, ribbon, s, lateral);
}

/** Pink slips: a printer the size of a house, spitting slips out on the beat into a storm of them, and the people let go queued at its foot. */
export function pinkSlips(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  g.add(slab(18, 10, 12, kit.matte(0xd8dce0, { emissive: 0x1a1c20 }), 0, 5, 0), slab(14, 1, 6, dark(), 0, 10.5, -1));
  const tray = slab(12, 0.5, 8, kit.matte(0xa0a4aa), 0, 6, 9);
  tray.rotation.x = 0.2;
  g.add(tray);
  const lightP = beacon(p, GO, 2.4);
  lightP.position.set(7, 9, 6.2);
  g.add(lightP);
  // The slip coming out, on every beat.
  const out = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), paper());
  out.rotation.x = -Math.PI / 2 + 0.2;
  g.add(out);
  const storm = kit.motes({ count: 300, radius: 22, height: 30, color: PINK, drift: 'swirl', speed: 3, size: 0.8, seed: 9401 }, animated);
  g.add(storm);
  const rand = seededRandom(9402);
  for (let k = 0; k < 14; k++) {
    const l = leaver(1.6, rand);
    l.position.set(-14 + k * 2.2, 0, 14 + (k % 2) * 1.5);
    l.rotation.y = -Math.PI / 2 + (rand() - 0.5) * 0.6;
    g.add(l);
  }
  // A heap of slips round the tray.
  for (let k = 0; k < 40; k++) {
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.8), paper());
    sl.rotation.set(-Math.PI / 2, 0, rand() * 6);
    sl.position.set((rand() - 0.5) * 16, 0.06 + k * 0.01, 10 + rand() * 6);
    g.add(sl);
  }
  const sign = kit.signPanel(14, notice(['YOUR POSITION', 'HAS BEEN AUTOMATED']), { h: 5, depth: 0.3, frame: dark() });
  sign.position.set(0, 14, 0);
  g.add(sign);
  animated.push((time) => {
    const ph = music.phase(time);
    out.position.set(0, 6.5 - ph * 2, 6 + ph * 5);
    out.visible = ph < 0.8;
  });
  return offRoadFacing(g, ribbon, s, lateral);
}

/** The server farm: a block of racks under a roof, its fans turning, its lights blinking, a cooling tower steaming. */
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
  animated.push((time) => fans.forEach((f, k) => (f.rotation.y = time * (6 + k))));
  return offRoadFacing(g, ribbon, s, lateral);
}

/** The lights-out factory: a dark hall open to the road, robots at work inside with no light on, only their eyes, the beacons and the welding glow. */
export function lightsOut(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const hall = kit.matte(0x1a1c20);
  g.add(slab(44, 0.4, 26, kit.matte(0x14161a), 0, 0.2, 0));
  g.add(slab(44, 16, 0.6, hall, 0, 8, -13), slab(0.6, 16, 26, hall, -22, 8, 0), slab(0.6, 16, 26, hall, 22, 8, 0));
  // The roof's trusses, open: you can see in, though there's no light on.
  for (let k = 0; k < 5; k++) {
    const r = slab(0.6, 0.6, 26, kit.matte(0x3a3e46), -18 + k * 9, 16.2, 0);
    g.add(r, slab(0.5, 4, 0.5, kit.matte(0x3a3e46), -18 + k * 9, 18, -12.5));
  }
  // The only light: the welding glow and the machines' own red, pulsing on the beat.
  const inside = halo(p, STOP, 46, 0.32);
  inside.position.set(0, 8, 0);
  const pool = kit.lightPool(STOP, 22, 0.35);
  pool.position.y = 0.45;
  g.add(inside, pool);
  const rand = seededRandom(9601);
  for (let k = 0; k < 6; k++) {
    const r = robot(p, 2.6, rand);
    r.position.set(-16 + k * 6.4, 0.4, -4 + (k % 2) * 6);
    r.rotation.y = rand() * 0.6 - 0.3;
    g.add(r);
  }
  for (let k = 0; k < 3; k++) {
    const a = robotArm(p, 1.6, k * 0.4);
    a.position.set(-12 + k * 12, 0.4, -9);
    g.add(a);
  }
  for (let k = 0; k < 6; k++) {
    const b = beacon(p, STOP, 3);
    b.position.set(-20 + k * 8, 15, 12);
    g.add(b);
  }
  const sign = kit.signPanel(18, kit.textFace(['LIGHTS OUT'], { style: 'neon', bg: '#060608', fg: '#ff8a8a', glow: '#ff3a2a' }), { h: 4.5, depth: 0.3, frame: dark() });
  sign.position.set(0, 21, 12);
  g.add(sign, pole(5, 0.3, steel(), 16.2).translateZ(12).translateX(-6), pole(5, 0.3, steel(), 16.2).translateZ(12).translateX(6));
  g.scale.setScalar(1.2);
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
