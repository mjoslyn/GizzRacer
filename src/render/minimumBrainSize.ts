import * as THREE from 'three';
import { seededRandom } from '../core/math';
import type { HazardPose } from '../items/hazards';
import { MOB_SLOTS, MOB_STAGES, mobIn, mobRow } from '../kits/minimumBrainSize';
import type { Ribbon, Track } from '../tracks/track';
import * as kit from './scenery';
/**
 * Minimum Brain Size's world (K.G., 2020): the inside of an online echo
 * chamber that shrinks a mind. A lonely bedroom lit by a monitor at night,
 * and the road diving into the screen and down an ever-narrowing feed, in a
 * dark, sickly, claustrophobic world of glowing screens, comment walls,
 * pop-up windows, flies like notification badges and a faceless mob of grey
 * avatars. Its textures (the road a scrolling feed of cards, ground the
 * black of a monitor off, the cut's walls a wet membrane, the barrier a
 * wall of comments), its scenery, its landmarks and its hazard's look (the
 * mob closing ranks across the road, the one gap lit).
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type RGB = [number, number, number];


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

/** Monitor blue-white, sick green, notification red, a troll's orange. */
const GLOW = 0x7ae8ff;
const SICK = 0xa8ff8a;
const RED = 0xff2a3a;
const AMBER = 0xffb45a;


/**
 * The road: a scrolling feed. Cards stacked down it, each a pale panel with
 * a grey avatar, two lines of text and now and then a red notification; it
 * reads lighter than the black ground and its cards keep the speed in
 * view. The texture spans half the road and mirrors across it.
 */
export function feedRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const grain = fbm(S, 16, 3, 7301);
  paint(ctx, S, S, (_x, _y, i) => shade([64, 74, 96], 0.9 + 0.2 * grain[i]));
  const rand = seededRandom(7302);
  const CARD = 64;
  for (let y = 0; y < S; y += CARD) {
    ctx.fillStyle = 'rgb(112,128,158)';
    ctx.fillRect(10, y + 5, S - 20, CARD - 10);
    ctx.fillStyle = 'rgb(150,168,196)';
    ctx.fillRect(10, y + 5, S - 20, 3);
    // The avatar: a grey disc with nobody in it.
    ctx.fillStyle = 'rgb(58,64,80)';
    ctx.beginPath();
    ctx.arc(36, y + 26, 11, 0, Math.PI * 2);
    ctx.fill();
    // Lines of text.
    ctx.fillStyle = 'rgb(70,80,104)';
    ctx.fillRect(58, y + 18, 40 + rand() * 80, 6);
    ctx.fillRect(58, y + 32, 70 + rand() * 100, 6);
    if (rand() < 0.4) {
      ctx.fillStyle = 'rgb(255,60,76)';
      ctx.beginPath();
      ctx.arc(S - 26, y + 18, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // The middle of the road, a pale line.
  ctx.fillStyle = 'rgba(220,240,255,0.7)';
  for (let y = 0; y < S; y += 32) {
    ctx.fillRect(S - 3, y + 6, 3, 18);
    ctx.fillRect(0, y + 6, 3, 18);
  }
  return finish(c);
}

/** The ground: the black of a monitor switched off, a faint grid of pixels, a few dead ones glowing. */
export function staticGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 7311);
  paint(ctx, S, S, (_x, _y, i) => shade([18, 22, 34], 0.7 + n[i] * 0.7));
  ctx.fillStyle = 'rgba(70,96,130,0.28)';
  for (let k = 0; k < S; k += 32) {
    ctx.fillRect(k, 0, 1, S);
    ctx.fillRect(0, k, S, 1);
  }
  const rand = seededRandom(7312);
  for (let k = 0; k < 2600; k++) {
    const r = rand();
    ctx.fillStyle = r < 0.7 ? 'rgba(8,10,16,0.6)' : r < 0.95 ? 'rgba(90,120,160,0.35)' : r < 0.985 ? 'rgba(122,232,255,0.6)' : 'rgba(255,42,58,0.6)';
    ctx.fillRect(rand() * S, rand() * S, 2, 2);
  }
  return finish(c);
}

/** The cut's walls and the world's edge: a wet membrane, red-grey, veined, the inside of something. */
export function membraneTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 5, 7321);
  const v = fbm(S, 12, 3, 7322);
  paint(ctx, S, S, (_x, _y, i) => {
    const vein = Math.abs(v[i] - 0.5) < 0.035 ? 1 : 0;
    const base = mix([74, 26, 38], [128, 52, 62], n[i]);
    return vein ? mix(base, [190, 70, 80], 0.8) : shade(base, 0.8 + 0.35 * n[i]);
  });
  const rand = seededRandom(7323);
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = 'rgba(255,170,170,0.35)';
    ctx.fillRect(rand() * S, rand() * S, 2 + rand() * 3, 1);
  }
  return finish(c);
}

/** The barrier: a wall of comments, dark cards with grey avatars and lines of text, a cyan edge, red notifications. */
export function commentRailTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#10141f';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#7ae8ff';
  ctx.fillRect(0, 0, W, 5);
  ctx.fillStyle = 'rgba(160,240,255,0.8)';
  ctx.fillRect(0, 1, W, 1);
  const rand = seededRandom(7331);
  for (let k = 0; k < 4; k++) {
    const x = k * 64 + 3;
    ctx.fillStyle = k % 2 ? '#26324a' : '#1c2740';
    ctx.fillRect(x, 10, 58, 46);
    ctx.fillStyle = '#6a768e';
    ctx.beginPath();
    ctx.arc(x + 11, 24, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8c9ab4';
    ctx.fillRect(x + 22, 20, 14 + rand() * 18, 3);
    ctx.fillRect(x + 6, 36, 30 + rand() * 20, 3);
    ctx.fillRect(x + 6, 44, 20 + rand() * 24, 3);
    if (rand() < 0.5) {
      ctx.fillStyle = '#ff2a3a';
      ctx.beginPath();
      ctx.arc(x + 52, 14, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish(c);
}

// Shared parts. The song's tempo is 150 beats a minute; the whole world pulses on it.
const music = kit.beat(150);

const metal = once(() => kit.matte(0x22262e));
const plastic = once(() => kit.matte(0xc8ccd6));
const avatarGrey = once(() => kit.matte(0xaab2c4, { emissive: 0x2a3244 }));
const avatarDark = once(() => kit.matte(0x4a5062));
const flesh = once(() => kit.matte(0xd8909a, { emissive: 0x401820 }));
const crowMat = once(() => kit.matte(0x07080a));
const biscuit = once(() => kit.matte(0xc08a48, { emissive: 0x201004 }));
const canMat = once(() => kit.matte(0x2ad0a0, { emissive: 0x083828 }));
const cableMat = once(() => kit.matte(0x14161c));
const glass = once(() => new THREE.MeshPhongMaterial({ color: 0x8a94a8, specular: 0xffffff, shininess: 90 }));

const CYL = once(() => new THREE.CylinderGeometry(1, 1, 1, 8));
const BOX = once(() => new THREE.BoxGeometry(1, 1, 1));
const BALL = once(() => new THREE.SphereGeometry(1, 10, 7));
const BODY = once(() => new THREE.CapsuleGeometry(0.42, 0.9, 2, 8));
const HEAD = once(() => new THREE.SphereGeometry(0.4, 9, 6));
const BADGE = once(() => new THREE.SphereGeometry(0.22, 8, 6));

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

/** A canvas label: lines of text on a panel, for windows, plaques and screens. */
const label = (() => {
  const made = new Map<string, THREE.CanvasTexture>();
  return (lines: string[], fg = '#bfe8ff', bg = '#0a1020', title?: string): THREE.CanvasTexture => {
    const key = `${lines.join('|')}|${fg}|${bg}|${title ?? ''}`;
    let t = made.get(key);
    if (t) return t;
    const W = 512;
    const H = 256;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    let top = 0;
    if (title !== undefined) {
      ctx.fillStyle = '#26324a';
      ctx.fillRect(0, 0, W, 44);
      ['#ff5a5a', '#ffd25a', '#5aff8a'].forEach((col, k) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(24 + k * 26, 22, 8, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#9ab0d0';
      ctx.font = '22px Arial, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, 110, 23);
      // The close button.
      ctx.fillStyle = '#ff2a3a';
      ctx.fillRect(W - 44, 6, 34, 32);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.fillText('X', W - 35, 23);
      top = 44;
    }
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = lines.length === 1 ? 74 : lines.length === 2 ? 58 : 44;
    ctx.font = `900 ${size}px 'Arial Black', Impact, sans-serif`;
    lines.forEach((line, k) => {
      const w = ctx.measureText(line).width;
      ctx.save();
      ctx.translate(W / 2, top + (H - top) / 2 + (k - (lines.length - 1) / 2) * size * 1.1);
      if (w > W - 50) ctx.scale((W - 50) / w, 1);
      ctx.shadowColor = fg;
      ctx.shadowBlur = 16;
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
    t = finish(c, false);
    made.set(key, t);
    return t;
  };
})();

/** A panel `w` wide (half as high) showing `map`, unlit, facing both ways. */
function panel(w: number, map: THREE.Texture, h = w / 2): THREE.Group {
  return kit.signPanel(w, map, { h, depth: 0.16, frame: metal() });
}

/** A faceless grey avatar: a body, a head with nothing in it, a notification badge over the shoulder. */
function avatar(size = 1, badge = false): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(BODY(), avatarGrey());
  body.position.y = 1.0;
  const head = new THREE.Mesh(HEAD(), avatarGrey());
  head.position.y = 2.0;
  g.add(body, head);
  if (badge) {
    const b = new THREE.Mesh(BADGE(), kit.lit(RED));
    b.position.set(0.4, 2.35, 0);
    g.add(b);
  }
  g.scale.setScalar(size);
  return g;
}

/** A brain, lumpy, pink-grey and tiny, `r` across. */
function brain(r: number): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(r, 2);
  const pos = geo.attributes.position;
  const rand = seededRandom(7531);
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const bump = 1 + 0.12 * Math.sin(v.x * 3.1) * Math.sin(v.y * 2.7 + v.z) + 0.04 * (rand() - 0.5);
    v.multiplyScalar(bump);
    v.x *= 1.15;
    v.y *= 0.8;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, flesh()));
  return g;
}

/** Everything that glows on the beat in one place: halos, badges and eyes, each given its phase, one callback between them. */
interface Pulse {
  animated: kit.Animated;
  halos: THREE.Sprite[];
  badges: THREE.Object3D[];
  eyes: { lid: THREE.Object3D; phase: number }[];
}

function pulse(animated: kit.Animated): Pulse {
  const p: Pulse = { animated, halos: [], badges: [], eyes: [] };
  animated.push((time) => {
    const k = music.kick(time, 0, 5);
    for (const h of p.halos) h.material.opacity = (h.userData.base as number) * (0.7 + 0.3 * k);
    p.badges.forEach((b, n) => b.scale.setScalar(1 + 0.2 * music.kick(time, (n % 4) * 0.25, 6)));
    for (const e of p.eyes) e.lid.scale.y = 1 - 0.92 * Math.max(0, Math.sin(time * 0.9 + e.phase * 6)) ** 40;
  });
  return p;
}

/** A glow that pulses with the pulse's beat. */
function halo(p: Pulse, color: number, size: number, opacity = 0.3): THREE.Sprite {
  const s = kit.glowSprite(color, size, opacity);
  s.userData.base = opacity;
  p.halos.push(s);
  return s;
}

// The LEDs on the racks blink from one callback, however many racks there are.
const LED = [new THREE.MeshBasicMaterial({ color: SICK }), new THREE.MeshBasicMaterial({ color: RED }), new THREE.MeshBasicMaterial({ color: GLOW })];
const ledOn = new WeakSet<kit.Animated>();
function blinkLeds(animated: kit.Animated): void {
  if (ledOn.has(animated)) return;
  ledOn.add(animated);
  const on = LED.map((m) => m.color.getHex());
  animated.push((time) =>
    LED.forEach((m, k) => m.color.setHex(Math.sin(time * (3 + k * 1.7) + k * 2) > 0.1 ? on[k] : 0x0a0c10)),
  );
}

const SAYS = ['SO LONELY', 'NO ONE REPLIES', 'LOG IN', 'SCROLL', 'LIKE', 'REFRESH', 'RIDDLE ME THIS', 'DID YOU EVER GROW?'];
const POPUPS = ['YOU WON!', 'HOT SINGLES', 'CLICK HERE', 'DOWNLOAD', 'VIRUS!', 'WAKE UP', 'JOIN US'];
const BUBBLES = ['PATHETIC', 'HIMPATHETIC BRO', 'RATIO', 'NOBODY ASKED', 'THIS.', 'SAME', 'LOL', 'WAKE UP'];
const hot = (rand: () => number) => rand() < 0.2;

/** The roadside props, built for one place's pulse. Each is built at the origin, facing +z, its foot on the ground. */
function props(p: Pulse) {
  const monitor: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const w = 4 + rand() * 5;
    const h = w * 0.62;
    const post = 3 + rand() * 4;
    const red = hot(rand);
    const face = kit.signPanel(w, kit.textFace([SAYS[Math.floor(rand() * SAYS.length)]], { style: 'neon', bg: '#050c16', fg: red ? '#ff8a8a' : '#bfe8ff', glow: red ? '#ff2a3a' : '#7ae8ff' }), { h, depth: 0.5, frame: metal() });
    face.position.y = post + h / 2;
    face.rotation.x = -0.1;
    const lit = halo(p, red ? RED : GLOW, w * 1.7, 0.26);
    lit.position.y = post + h / 2;
    g.add(pole(post, 0.3, metal()), face, lit);
    return g;
  };
  const popup: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const w = 5 + rand() * 4;
    const win = panel(w, label([POPUPS[Math.floor(rand() * POPUPS.length)]], rand() < 0.5 ? '#ffd25a' : '#ff8a8a', '#101826', 'ad.exe'));
    win.position.y = 5 + rand() * 7;
    win.rotation.set((rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.25);
    g.add(win, pole(win.position.y - 1, 0.12, metal()));
    return g;
  };
  const bubble: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const w = 4 + rand() * 3;
    const face = kit.textFace([BUBBLES[Math.floor(rand() * BUBBLES.length)]], { style: 'board', bg: '#e8ecf4', fg: '#1a2030', rule: '#7ae8ff' });
    const sign = kit.signPanel(w, face, { h: w * 0.5, depth: 0.3, frame: kit.matte(0xc8d0e0) });
    sign.position.y = 4 + rand() * 4;
    sign.rotation.z = (rand() - 0.5) * 0.2;
    g.add(pole(sign.position.y, 0.1, metal()), sign);
    return g;
  };
  const cluster: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const n = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const a = avatar(1.1 + rand() * 0.3, rand() < 0.35);
      a.position.set((rand() - 0.5) * 7, 0, (rand() - 0.5) * 7);
      a.rotation.y = rand() * 6;
      g.add(a);
    }
    return g;
  };
  const lone: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const a = avatar(1.6, true);
    a.rotation.y = rand() * 6;
    const lit = halo(p, GLOW, 9, 0.3);
    lit.position.y = 2.6;
    g.add(a, lit);
    return g;
  };
  const badges: kit.Prop = (rand) => {
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const b = new THREE.Mesh(BALL(), kit.lit(RED));
      b.scale.setScalar(0.7 + rand() * 0.4);
      b.position.set((rand() - 0.5) * 6, 4 + rand() * 9, (rand() - 0.5) * 6);
      p.badges.push(b);
      g.add(b);
    }
    const lit = halo(p, RED, 9, 0.3);
    lit.position.y = 8;
    g.add(lit);
    return g;
  };
  const rack: kit.Prop = (rand) => {
    blinkLeds(p.animated);
    const g = new THREE.Group();
    const h = 6 + rand() * 8;
    g.add(slab(3.2, h, 2.4, metal(), 0, h / 2, 0));
    for (let k = 0; k < 8; k++) {
      const led = new THREE.Mesh(BOX(), LED[k % 3]);
      led.scale.set(0.35, 0.35, 0.2);
      led.position.set(-1 + (k % 2) * 2, 1 + (k / 8) * (h - 2), 1.25);
      g.add(led);
    }
    return g;
  };
  const keys: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const n = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const x = (rand() - 0.5) * 7;
      const z = (rand() - 0.5) * 7;
      const yaw = rand() * 6;
      const key = slab(3.2, 1.8, 3.2, plastic(), x, 0.9, z);
      key.rotation.y = yaw;
      const top = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: kit.textFace([String.fromCharCode(65 + Math.floor(rand() * 8))], { style: 'board', bg: '#e8ecf4', fg: '#22262e', rule: false, width: 128, height: 128 }) }));
      top.rotation.set(-Math.PI / 2, 0, -yaw);
      top.position.set(x, 1.82, z);
      g.add(key, top);
    }
    return g;
  };
  const litter: kit.Prop = (rand) => {
    const g = new THREE.Group();
    for (let k = 0; k < 7; k++) {
      const can = rand() < 0.5;
      const m = can ? slab(0.9, 1.5, 0.9, canMat()) : slab(1.8, 0.18, 1.8, biscuit());
      m.position.set((rand() - 0.5) * 7, can ? 0.75 : 0.1 + (k % 3) * 0.2, (rand() - 0.5) * 7);
      m.rotation.y = rand() * 3;
      g.add(m);
    }
    return g;
  };
  const cables: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const c = new THREE.Mesh(new THREE.TorusGeometry(2 + rand() * 2, 0.25, 6, 18, Math.PI * (1 + rand())), cableMat());
    c.rotation.x = Math.PI / 2;
    c.position.y = 0.25;
    g.add(c);
    return g;
  };
  /** A stalk with an eyeball on it, looking at the road, its lid dropping now and then. */
  const eye: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const h = 3 + rand() * 5;
    const r = 1.4 + rand() * 1.1;
    const ball = new THREE.Mesh(BALL(), kit.matte(0xe4e8ec, { emissive: 0x303a44 }));
    ball.scale.setScalar(r);
    ball.position.y = h + r;
    const iris = new THREE.Mesh(new THREE.CircleGeometry(r * 0.5, 16), kit.lit(0x5a9ab0));
    iris.position.set(0, h + r, r * 0.97);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(r * 0.22, 12), kit.lit(0x04060a));
    pupil.position.set(0, h + r, r * 0.98 + 0.02);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(r * 1.06, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), kit.matte(0x8a3a48));
    lid.position.y = h + r;
    p.eyes.push({ lid, phase: rand() });
    g.add(pole(h, 0.25, flesh()), ball, iris, pupil, lid);
    return g;
  };
  /** A hunched figure over a glowing laptop. */
  const hood: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const a = avatar(1.5);
    a.rotation.x = 0.3;
    a.position.z = 0.6;
    const screen = panel(2.6, label([SAYS[Math.floor(rand() * 3)]], '#bfe8ff', '#06101c'), 1.6);
    screen.position.set(0, 1.5, -1.6);
    screen.rotation.x = -0.3;
    const lit = halo(p, GLOW, 8, 0.3);
    lit.position.set(0, 1.8, -1.8);
    g.add(a, screen, lit);
    return g;
  };
  /** The mute button: a speaker crossed out. */
  const mute: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const s = 1.4 + rand() * 0.8;
    const box = slab(1.2 * s, 1.6 * s, 0.8 * s, metal(), 0, 4 * s, 0);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * s, 1.5 * s, 1.6 * s, 10, 1, true), kit.matte(0x30343e, { double: true }));
    cone.rotation.x = Math.PI / 2;
    cone.position.set(0, 4 * s, 1.1 * s);
    const bar = slab(0.3 * s, 5.2 * s, 0.3 * s, kit.lit(RED), 0, 4 * s, 1.5 * s);
    bar.rotation.z = Math.PI / 4;
    g.add(pole(3.2 * s, 0.2 * s, metal()), box, cone, bar);
    return g;
  };
  /** A mast with a red beacon blinking on it. */
  const mast: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const h = 14 + rand() * 12;
    const beacon = halo(p, RED, 4, 0.9);
    beacon.position.y = h + 0.6;
    g.add(pole(h, 0.35, metal()), slab(3, 0.3, 0.3, metal(), 0, h - 2, 0), beacon);
    return g;
  };
  /** A screen standing up out of the ground, tall enough to be seen from a deck. */
  const tall: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const w = 6 + rand() * 5;
    const h = w * 1.5;
    const post = 14 + rand() * 18;
    const face = kit.signPanel(w, kit.textFace([SAYS[Math.floor(rand() * SAYS.length)]], { style: 'neon', bg: '#050c16', fg: '#bfe8ff', glow: '#7ae8ff', width: 256, height: 384 }), { h, depth: 0.6, frame: metal() });
    face.position.y = post + h / 2;
    const lit = halo(p, GLOW, w * 2, 0.26);
    lit.position.y = post + h / 2;
    g.add(pole(post, 0.5, metal()), face, lit);
    return g;
  };
  /** A pool of tears. */
  const puddle: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CircleGeometry(2 + rand() * 3, 20), new THREE.MeshBasicMaterial({ color: 0x4a9ac8, transparent: true, opacity: 0.5, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.08;
    const drop = new THREE.Mesh(BALL(), new THREE.MeshPhongMaterial({ color: 0x9adaff, transparent: true, opacity: 0.8, specular: 0xffffff, shininess: 120 }));
    drop.scale.set(0.8, 1.2, 0.8);
    drop.position.y = 0.9;
    g.add(m, drop);
    return g;
  };
  /** A mirror ball to stand on. */
  const orb: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const r = 1.6 + rand() * 1.6;
    const b = new THREE.Mesh(BALL(), glass());
    b.scale.setScalar(r);
    b.position.y = r;
    g.add(b);
    if (rand() < 0.5) {
      const m = brain(r * 0.35);
      m.position.y = r * 2 + r * 0.3;
      g.add(m);
    }
    return g;
  };
  /** A stack of biscuits and the cans round it. */
  const biccys: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const n = 4 + Math.floor(rand() * 5);
    for (let k = 0; k < n; k++) {
      const d = slab(2.6 - k * 0.12, 0.7, 2.6 - k * 0.12, biscuit(), (rand() - 0.5) * 0.5, 0.4 + k * 0.7, (rand() - 0.5) * 0.5);
      d.rotation.y = rand() * 3;
      g.add(d);
    }
    for (let k = 0; k < 4; k++) {
      const can = slab(0.9, 1.6, 0.9, canMat(), (rand() - 0.5) * 8, 0.8, (rand() - 0.5) * 8);
      can.rotation.y = rand() * 3;
      g.add(can);
    }
    return g;
  };
  /** A lantern on a pole, steady. */
  const lantern: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const l = kit.lamp(p.animated, rand() * 9, { color: rand() < 0.5 ? AMBER : GLOW, cord: 0, size: 0.8, shape: 'ball', halo: 8 });
    l.position.y = 5.2;
    g.add(pole(5, 0.12, metal()), l);
    return g;
  };
  return { monitor, popup, bubble, cluster, lone, badges, rack, keys, litter, cables, eye, hood, mute, mast, tall, puddle, orb, biccys, lantern };
}

// Scenery.

/**
 * Off-road scenery by the stretch of the lap it's beside: monitors, racks,
 * pop-up windows, drifting notification badges, keycaps, crowds of
 * avatars, cans and biscuits. The roadside fill; each stretch's own
 * dressing is its `feedField`.
 */
export function echoFeature(animated: kit.Animated, track?: Track): Feature {
  const sectionAt = track ? kit.sectionNamer(track) : () => '';
  const P = props(pulse(animated));
  const general: [number, kit.Prop][] = [
    [2.2, P.monitor],
    [1.3, P.rack],
    [1.4, P.popup],
    [0.9, P.badges],
    [0.8, P.cables],
    [0.8, P.keys],
  ];
  const bySection: Record<string, [number, kit.Prop][]> = {
    'Riddle Me This': [[3, P.monitor], [2, P.keys]],
    'Did You Ever Grow?': [[3, P.lone], [2, P.keys]],
    "Break the Spider's Legs": [[3, P.cables], [2, P.litter]],
    'Sympathetic Crowds': [[6, P.cluster], [2, P.popup]],
    'Dance Like Flies': [[5, P.badges], [2, P.popup]],
    'To All of the People Who Had It Coming': [[4, P.popup], [3, P.cluster]],
    'A Few Biccys Too Many': [[7, P.litter], [1, P.lone]],
    "I'm So Lonely": [[5, P.lone], [2, P.monitor]],
    'Open Their Eyes': [[4, P.eye]],
    'Said the Tear to the Eye': [[3, P.puddle], [2, P.lone]],
    'Pathetic, You’re Weaker Than You Know': [[5, P.cluster], [2, P.bubble]],
    'Parasitic Mob': [[7, P.cluster], [1, P.badges]],
    'Faceless Undertow': [[7, P.cluster], [1, P.cables]],
    'Himpathetic Bro': [[3, P.hood], [3, P.monitor]],
    "You Don't Have a Say Anymore": [[4, P.popup], [3, P.mute]],
    Radicalise: [[5, P.popup], [3, P.badges]],
    'Radicalise to Minimum Brain Size': [[4, P.rack], [3, P.tall]],
    'At the Center of It All': [[5, P.rack]],
    "You Ain't Got the Gall": [[4, P.mast], [2, P.tall]],
    'Pissing on a Flame': [[3, P.tall]],
    'Standing on a Ball': [[3, P.orb], [2, P.keys]],
  };
  const noSite = {} as kit.Site;
  return (x, z, rand) => {
    // The brain's island and the eye's are left clear.
    if (track && Math.hypot(x, z) < 60 && kit.clearance(track, x, z) < 55) return new THREE.Group();
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
  /** Where it runs, in spline metres. */
  from: number;
  to: number;
  animated: kit.Animated;
  g: THREE.Group;
  p: Pulse;
  P: ReturnType<typeof props>;
  seed: number;
  /** The islands the centre's landmarks stand on: nothing is strewn over them (nor over the other landmarks, in `stands`). */
  islands: { x: number; z: number }[];
  /** Where the other landmarks stand, and how much room each wants: a set piece keeps clear of them. */
  stands: { x: number; z: number; r: number }[];
}

/** `frac` of the way along the field, in spline metres. */
const along = (f: Field, frac: number): number => f.from + (f.to - f.from) * frac;

/** Which side of the road at `s` has more room `away` metres off it (and stays inside the walls). */
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
  // The nearest spot, on the roomier side first, that's clear of every road and of the landmarks (the islands, the bedroom, the spider).
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

/** A banner of the song's words across the road `frac` of the way along the field. */
function words(f: Field, frac: number, lines: string[], color = '#bfe8ff', glow = GLOW): void {
  f.g.add(kit.roadBanner(f.ribbon, along(f, frac), lines, { style: 'neon', bg: '#050c16', fg: color, glow: color, glowColor: glow, lift: 7 }, f.animated));
}

/** Props strewn either side of the field, in the band 3 to 18 m off the road. */
function strew(f: Field, kinds: [number, kit.Prop][], spacing = 15, o: Partial<kit.ScatterOptions> = {}): void {
  const offIslands = kinds.map(([w, prop]): [number, kit.Prop] => [w, (rand, site) => (f.islands.some((i) => Math.hypot(site.x - i.x, site.z - i.z) < 32) || f.stands.some((q) => Math.hypot(site.x - q.x, site.z - q.z) < q.r) ? new THREE.Group() : prop(rand, site))]);
  f.g.add(kit.scatter({ track: f.track, ribbon: f.ribbon, from: f.from, to: f.to, spacing: spacing * 0.75, band: [3.5, 20], scale: [1, 1.7], kinds: offIslands, seed: f.seed, ...o }));
}

const SHARD = once(() => new THREE.BoxGeometry(0.5, 1, 0.5));
const CARD = once(() => new THREE.BoxGeometry(1.8, 0.1, 1.2));
const CAN = once(() => new THREE.CylinderGeometry(0.45, 0.45, 1.5, 8));
const KEYCAP = once(() => new THREE.BoxGeometry(1.6, 0.9, 1.6));
/** The ground underfoot, four layers in one draw call each: glowing shards of dead pixels, fallen notification cards, cans, keycaps. */
function pixels(f: Field, density = 1): void {
  const base = { track: f.track, ribbon: f.ribbon, from: f.from, to: f.to };
  f.g.add(
    kit.scatterInstanced({ ...base, spacing: 1.4 / density, band: [2.5, 26], geometry: SHARD(), material: kit.lit(0xffffff), colors: [GLOW, 0x2a6a8a, RED, SICK, 0x1a2434], lift: 0.5, stretchY: [0.4, 4], scale: [0.7, 1.5], seed: f.seed + 3 }),
    kit.scatterInstanced({ ...base, spacing: 3 / density, band: [2.5, 18], geometry: CARD(), material: kit.matte(0xffffff), colors: [0x1c2740, 0x26324a, 0x3a4660, 0x6a768e], lift: 0.06, scale: [0.9, 1.8], seed: f.seed + 5 }),
    kit.scatterInstanced({ ...base, spacing: 4.5 / density, band: [2.5, 16], geometry: CAN(), material: kit.matte(0xffffff, { emissive: 0x0a2018 }), colors: [0x2ad0a0, 0xc08a48, 0x2ad0a0], lift: 0.7, tilt: 0.15, seed: f.seed + 7 }),
    kit.scatterInstanced({ ...base, spacing: 7 / density, band: [3, 16], geometry: KEYCAP(), material: kit.matte(0xffffff), colors: [0xc8ccd6, 0xe4e8f0, 0x9aa0b0], lift: 0.45, scale: [1, 1.8], seed: f.seed + 9 }),
  );
}

/** A crowd of grey faceless figures along the road, phones lit. */
function crowd(f: Field, side: 'left' | 'right', from: number, to: number, motion: 'bob' | 'sway' | 'jump', near = 7, rows = 2): void {
  f.g.add(kit.crowd({ track: f.track, ribbon: f.ribbon, from, to, side, rows, spacing: 1.8, band: [near, near + 0.4], motion, beat: music, clothes: [0x8a92a6, 0x6a7288, 0xaab2c4, 0x555c70], skin: 0xaab2c4, height: 1.9, lights: { color: GLOW, every: 3, size: 1.1 }, seed: f.seed + (side === 'left' ? 1 : 2) }, f.animated).group);
}

/** A swarm of dark flies (some of them notification badges) over the point `lateral` off the road at `s`. */
function flies(f: Field, s: number, lateral: number, count = 90, radius = 14, height = 8, lift = 7): void {
  const at = kit.offRoad(f.ribbon, s, lateral);
  const dark = kit.swarm({ count, radius, height, color: 0x14181e, size: 0.8, speed: 0.12, glow: false, seed: f.seed }, f.animated);
  const red = kit.swarm({ count: Math.ceil(count / 10), radius, height, color: RED, size: 0.7, speed: 0.1, seed: f.seed + 7 }, f.animated);
  for (const o of [dark, red]) {
    o.position.set(at.x, kit.frameAt(f.ribbon, s).y + lift, at.z);
    f.g.add(o);
  }
}

/** A giant screen on two legs, its words lit: a mid-ground set piece, pulsing on the beat. */
function giantScreen(f: Field, lines: string[], w = 20, color = GLOW): THREE.Object3D {
  const body = new THREE.Group();
  const h = w * 0.6;
  const legs = 5;
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  const face = kit.signPanel(w, kit.textFace(lines, { style: 'neon', bg: '#050c16', fg: hex, glow: hex }), { h, depth: 1, frame: metal() });
  face.position.y = legs + h / 2;
  body.add(face, pole(legs, 0.5, metal(), 0).translateX(-w * 0.3), pole(legs, 0.5, metal(), 0).translateX(w * 0.3));
  return kit.setPiece({ body, base: 'plinth', baseColor: 0x1a2234, baseWidth: w * 0.9, glow: { color, size: w * 1.6, y: legs + h / 2, opacity: 0.25 }, beat: music }, f.animated);
}

/** A giant faceless head on a neck: the mob's. */
function giantHead(f: Field): THREE.Object3D {
  const body = new THREE.Group();
  const head = new THREE.Mesh(BALL(), avatarGrey());
  head.scale.set(7, 8.4, 7);
  head.position.y = 17;
  const neck = pole(10, 2.6, avatarGrey());
  const hood = new THREE.Mesh(new THREE.SphereGeometry(7.6, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), avatarDark());
  hood.position.y = 17.6;
  const badge = new THREE.Mesh(BALL(), kit.lit(RED));
  badge.scale.setScalar(2);
  badge.position.set(6.4, 25, 0);
  f.p.badges.push(badge);
  body.add(neck, head, hood, badge);
  return kit.setPiece({ body, base: 'mound', baseColor: 0x1a2030, glow: { color: GLOW, size: 30, y: 16, opacity: 0.22 }, bob: 1.2, period: 5, beat: music }, f.animated);
}

/** A row of big eyes on a gantry, all looking at the road. */
function eyeWall(f: Field): THREE.Object3D {
  const body = new THREE.Group();
  body.add(slab(34, 1, 1, metal(), 0, 15, 0));
  for (const x of [-14, -7, 0, 7, 14]) {
    const eye = props(f.p).eye(seededRandom(Math.round(x * 31 + 7)), {} as kit.Site) as THREE.Group;
    eye.scale.setScalar(2.2);
    eye.position.set(x, 8, 0.5);
    body.add(eye, pole(8, 0.3, metal(), 8).translateX(x));
  }
  return kit.setPiece({ body, base: 'plinth', baseColor: 0x1a2234, baseWidth: 38, glow: { color: 0xe8f4ff, size: 40, y: 26, opacity: 0.22 }, beat: music }, f.animated);
}

/** The mute button, a giant one: a speaker crossed out, throbbing red. */
function giantMute(f: Field): THREE.Object3D {
  const body = new THREE.Group();
  body.add(slab(7, 9, 6, metal(), 0, 6, 0));
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 9, 9, 14, 1, true), kit.matte(0x30343e, { double: true }));
  cone.rotation.x = Math.PI / 2;
  cone.position.set(0, 6, 7);
  const bar = slab(2, 30, 1.4, kit.lit(RED), 0, 12, 10);
  bar.rotation.z = Math.PI / 4;
  body.add(cone, bar);
  return kit.setPiece({ body, base: 'ring', baseColor: 0x30343e, baseWidth: 34, glow: { color: RED, size: 40, y: 14, opacity: 0.25 }, beat: music }, f.animated);
}

/** The ball and the flame at its foot: standing on a ball, pissing on a flame. */
function ballAndFlame(f: Field): THREE.Object3D {
  const body = new THREE.Group();
  const ball = new THREE.Mesh(BALL(), glass());
  ball.scale.setScalar(10);
  ball.position.y = 10;
  const mind = brain(2.4);
  mind.position.y = 22.6;
  const fire = kit.fire(f.animated, 1.3, { size: 2, colors: { outer: 0xffb45a, mid: 0xff7a2a, core: 0xfff0c0 } });
  fire.position.set(14, 0, 4);
  body.add(ball, mind, fire);
  return kit.setPiece({ body, base: 'ring', baseColor: 0x1a2234, baseWidth: 36, glow: { color: GLOW, size: 38, y: 18, opacity: 0.22 }, spin: 0.1, beat: music }, f.animated);
}

/** The giant lonely one in the spotlight. */
function giantLone(f: Field): THREE.Object3D {
  const body = avatar(5, true);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(4, 13, 46, 20, 1, true), new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.position.y = 23;
  const top = new THREE.Group();
  top.add(body, beam);
  return kit.setPiece({ body: top, base: 'plinth', baseColor: 0x1a2234, glow: { color: GLOW, size: 26, y: 8, opacity: 0.22 }, breathe: 0.02, beat: music }, f.animated);
}

/** Smoke and embers from a trash fire. */
function bonfire(f: Field, s: number, away: number, size = 4): void {
  const side = roomy(f.track, f.ribbon, s, away);
  const at = kit.beside(f.ribbon, s, side, away);
  const fire = kit.fire(f.animated, s * 0.01, { size, colors: { outer: 0xff3a3a, mid: 0xff2a2a, core: 0xffb090 }, smoke: 0x2a1c1c });
  fire.position.set(at.x, 0, at.z);
  f.g.add(fire);
}

const FIELDS: Record<string, (f: Field) => void> = {
  // Riddle me this: out of the lonely bedroom, screens and keycaps and cans, the room's glow spilling out over the road.
  'Riddle Me This'(f) {
    strew(f, [[3, f.P.monitor], [2, f.P.keys], [2, f.P.litter], [1, f.P.popup]], 13);
    pixels(f);
    words(f, 0.62, ['DID YOU EVER GROW?']);
    midground(f, giantScreen(f, ['ONLINE', 'ALL NIGHT'], 24), 0.55, 36, 15);
    const dust = kit.motes({ count: 90, radius: 40, height: 16, color: 0x9adaff, drift: 'float', size: 0.35, seed: f.seed }, f.animated);
    const at = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    dust.position.set(at.x, 0, at.z);
    f.g.add(dust);
  },
  // Break the spider's legs just to feed the crow: cables and wreckage, crows wheeling over the gap.
  "Break the Spider's Legs"(f) {
    strew(f, [[3, f.P.cables], [2, f.P.litter], [2, f.P.popup], [2, f.P.monitor]], 13);
    pixels(f);
    words(f, 0.2, ["BREAK THE SPIDER'S LEGS"], '#ff8a8a', RED);
    words(f, 0.8, ['JUST TO FEED THE CROW'], '#ff8a8a', RED);
    const s = along(f, 0.4);
    const at = kit.offRoad(f.ribbon, s, 30);
    const crows = kit.flock({ count: 12, radius: 30, height: 26, color: 0x0a0c10, size: 2 }, f.animated);
    crows.position.set(at.x, 0, at.z);
    f.g.add(crows);
    midground(f, giantScreen(f, ['SO LONELY', 'NO ONE REPLIES'], 20, RED), 0.7, 38, 15);
  },
  // Sympathetic crowds are not well endowed; dance like flies on shit swarming in the clouds.
  'Sympathetic Crowds'(f) {
    strew(f, [[3, f.P.cluster], [2, f.P.badges], [2, f.P.monitor], [1, f.P.popup]], 14, { band: [12, 24] });
    pixels(f);
    crowd(f, 'left', f.from, f.to, 'sway');
    crowd(f, 'right', f.from, f.to, 'bob');
    words(f, 0.08, ['SYMPATHETIC CROWDS', 'ARE NOT WELL ENDOWED']);
    words(f, 0.6, ['DANCE LIKE FLIES']);
    flies(f, along(f, 0.3), 0, 110, 18, 9);
    flies(f, along(f, 0.7), 0, 110, 18, 9);
    midground(f, giantScreen(f, ['LOL', 'PATHETIC'], 22), 0.45, 36, 15);
  },
  // To all of the people who had it coming; a few biccys too many, I'm so lonely.
  'To All of the People Who Had It Coming'(f) {
    strew(f, [[3, f.P.biccys], [3, f.P.lone], [2, f.P.popup], [2, f.P.monitor], [1, f.P.lantern]], 14);
    pixels(f);
    words(f, 0.12, ['THIS IS TO ALL OF THE', 'PEOPLE WHO HAD IT COMING']);
    words(f, 0.55, ['A FEW BICCYS TOO MANY']);
    words(f, 0.9, ["I'M SO LONELY"], '#ffd25a', AMBER);
    midground(f, giantLone(f), 0.78, 38, 15);
    const sparks = kit.motes({ count: 120, radius: 36, height: 24, color: RED, drift: 'rise', speed: 2, size: 0.45, seed: f.seed }, f.animated);
    const at = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    sparks.position.set(at.x, 0, at.z);
    f.g.add(sparks);
  },
  // I'll open their eyes to minimum brain size.
  'Open Their Eyes'(f) {
    strew(f, [[4, f.P.eye], [2, f.P.popup], [2, f.P.monitor], [1, f.P.cables]], 11);
    pixels(f);
    words(f, 0.35, ["I'LL OPEN THEIR EYES", 'TO MINIMUM BRAIN SIZE']);
    midground(f, eyeWall(f), 0.6, 36, 16);
    const glints = kit.motes({ count: 80, radius: 30, height: 14, color: 0xe8f4ff, drift: 'float', size: 0.4, seed: f.seed }, f.animated);
    const at = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    glints.position.set(at.x, 0, at.z);
    f.g.add(glints);
  },
  // Re-enter the uterus and refund all your cells, back-to-front: sunk in the cut, the words hung over the road, cells drifting up out of it.
  'Minimum Brain Size'(f) {
    strew(f, [[3, f.P.tall], [2, f.P.badges], [2, f.P.mast], [1, f.P.popup]], 24, { band: [12, 26], clear: 9 });
    words(f, 0.1, ['MINIMUM BRAIN SIZE'], '#ffd25a', AMBER);
    words(f, 0.4, ['RE-ENTER THE UTERUS']);
    words(f, 0.65, ['REFUND ALL YOUR CELLS'], '#ff8a8a', RED);
    words(f, 0.9, ['DO IT BACK-TO-FRONT']);
    const cells = kit.motes({ count: 220, radius: 46, height: 26, color: 0xff6a7a, drift: 'rise', speed: 1.6, size: 0.55, seed: f.seed }, f.animated);
    const mid = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    cells.position.set(mid.x, -8, mid.z);
    f.g.add(cells);
    const flock = kit.flock({ count: 10, radius: 40, height: 22, color: 0x0a0c10, size: 1.6 }, f.animated);
    flock.position.set(mid.x, 0, mid.z);
    f.g.add(flock);
  },
  // You will not be missed, said the tear to the eye.
  'You Will Not Be Missed'(f) {
    strew(f, [[3, f.P.puddle], [2, f.P.monitor], [2, f.P.popup], [1, f.P.lone]], 14, { band: [6, 20], clear: 9 });
    pixels(f);
    words(f, 0.25, ['"YOU WILL NOT BE MISSED"'], '#9adaff', 0x9adaff);
    words(f, 0.75, ['SAID THE TEAR TO THE EYE'], '#9adaff', 0x9adaff);
    const rain = kit.motes({ count: 200, radius: 40, height: 32, color: 0x9adaff, drift: 'fall', speed: 6, size: 0.5, seed: f.seed }, f.animated);
    const mid = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    rain.position.set(mid.x, 0, mid.z);
    f.g.add(rain);
  },
  // It's pathetic though, you're weaker than you know; parasitic mob, faceless undertow.
  'Pathetic, You’re Weaker Than You Know'(f) {
    strew(f, [[3, f.P.cluster], [3, f.P.bubble], [2, f.P.badges], [1, f.P.popup]], 13, { band: [12, 24] });
    pixels(f);
    crowd(f, 'left', f.from, f.to, 'bob', 8);
    crowd(f, 'right', f.from, f.to, 'jump', 8);
    words(f, 0.1, ['IT’S PATHETIC THOUGH', 'YOU’RE WEAKER THAN YOU KNOW'], '#ff8a8a', RED);
    words(f, 0.5, ['PARASITIC MOB'], '#ff8a8a', RED);
    words(f, 0.9, ['FACELESS UNDERTOW'], '#ff8a8a', RED);
    midground(f, giantHead(f), 0.55, 42, 16);
    for (const frac of [0.25, 0.55, 0.85]) flies(f, along(f, frac), 0, 100, 16, 8, 6);
  },
  // Himpathetic bro.
  'Himpathetic Bro'(f) {
    strew(f, [[3, f.P.hood], [2, f.P.monitor], [2, f.P.keys], [2, f.P.bubble], [1, f.P.badges]], 14);
    pixels(f);
    words(f, 0.3, ['HIMPATHETIC BRO'], '#ffd25a', AMBER);
    words(f, 0.8, ['YOU’RE WEAKER THAN YOU KNOW']);
    midground(f, giantScreen(f, ['NOBODY', 'ASKED'], 20, AMBER), 0.5, 38, 15);
    flies(f, along(f, 0.5), 0, 60, 14, 6, 6);
  },
  // You don't have a say anymore; radicalise.
  "You Don't Have a Say Anymore"(f) {
    strew(f, [[3, f.P.mute], [2, f.P.popup], [2, f.P.mast], [2, f.P.badges], [1, f.P.lantern]], 14);
    pixels(f);
    words(f, 0.12, ["YOU DON'T HAVE", 'A SAY ANYMORE'], '#ff8a8a', RED);
    words(f, 0.78, ['RADICALISE'], '#ff8a8a', RED);
    midground(f, giantMute(f), 0.35, 38, 16);
    bonfire(f, along(f, 0.6), 38, 4.5);
    bonfire(f, along(f, 0.88), 44, 3.5);
    const smoke = kit.smokeColumn({ height: 60, width: 7, under: 0x6a2a1a, color: 0x2a1c1c }, f.animated);
    const at = kit.beside(f.ribbon, along(f, 0.6), roomy(f.track, f.ribbon, along(f, 0.6), 38), 38);
    smoke.position.set(at.x, 0, at.z);
    f.g.add(smoke);
  },
  // The road back over the spiral, high on its deck: screens and masts standing up to meet it, the words hung over it.
  'Radicalise to Minimum Brain Size'(f) {
    strew(f, [[3, f.P.tall], [2, f.P.mast], [2, f.P.rack], [1, f.P.popup]], 18, { band: [8, 30], clear: 6 });
    words(f, 0.12, ['RADICALISE TO', 'MINIMUM BRAIN SIZE'], '#ff8a8a', RED);
    words(f, 0.36, ['AT THE CENTER OF IT ALL'], '#ffd25a', AMBER);
    words(f, 0.6, ["YOU AIN'T GOT THE GALL"], '#ffd25a', AMBER);
    words(f, 0.82, ['PISSING ON A FLAME'], '#ff8a8a', RED);
    midground(f, giantScreen(f, ['AT THE CENTER', 'OF IT ALL'], 26, AMBER), 0.4, 42, 16);
    const mid = kit.offRoad(f.ribbon, along(f, 0.5), 0);
    const motes = kit.motes({ count: 260, radius: 70, height: 36, color: GLOW, drift: 'float', size: 0.5, seed: f.seed }, f.animated);
    motes.position.set(mid.x, 6, mid.z);
    f.g.add(motes);
    const flock = kit.flock({ count: 14, radius: 70, height: 30, color: 0x0a0c10, size: 2 }, f.animated);
    flock.position.set(mid.x, 0, mid.z);
    f.g.add(flock);
  },
  // Standing on a ball.
  'Standing on a Ball'(f) {
    strew(f, [[3, f.P.orb], [2, f.P.monitor], [2, f.P.keys], [1, f.P.badges]], 15);
    pixels(f);
    words(f, 0.35, ['STANDING ON A BALL'], '#ffd25a', AMBER);
    midground(f, ballAndFlame(f), 0.55, 36, 16);
    const glints = kit.motes({ count: 100, radius: 40, height: 18, color: 0xffd090, drift: 'rise', speed: 1.2, size: 0.4, seed: f.seed }, f.animated);
    const at = kit.offRoad(f.ribbon, along(f, 0.55), 0);
    glints.position.set(at.x, 0, at.z);
    f.g.add(glints);
  },
};

/** The sections a `feedField` can start in. */
export const FIELD_SECTIONS = Object.keys(FIELDS);

/**
 * One stretch of the lap dressed in layers: props strewn in the foreground,
 * dead pixels in the ground, a set piece in the mid-ground, flies, tears or
 * embers in the air, and the song's words over the road. Which stretch it is
 * goes by the section at `s`.
 */
export function feedField(track: Track, ribbon: Ribbon, s: number, to: number, section: string, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const recipe = FIELDS[section];
  if (!recipe) return g;
  const p = pulse(animated);
  const islands = track.def.landmarks.filter((l) => l.kind === 'brainBall' || l.kind === 'tearEye').map((l) => kit.offRoad(track.main, l.s * track.main.scale, l.lateral ?? 0));
  const room: Partial<Record<string, number>> = { bedroom: 28, spiderCrow: 40, biccyHeap: 24, brainBall: 34, tearEye: 34, broAvatar: 28, flyCloud: 24 };
  const stands = track.def.landmarks.filter((l) => room[l.kind] !== undefined).map((l) => ({ ...kit.offRoad(track.main, l.s * track.main.scale, l.lateral ?? 0), r: room[l.kind]! }));
  recipe({ track, ribbon, from: s, to, animated, g, p, P: props(p), seed: Math.round(s) + 11, islands, stands });
  return g;
}

/** The skyline: towers lit in the monitor's blue standing round the world, red beacons blinking, and a ring of masts. */
export function echoSkyline(track: Track, animated: kit.Animated): THREE.Group {
  return kit.skyline({ track, shapes: [[4, 'tower'], [2, 'block'], [2, 'spire'], [1, 'stack']], color: 0x0a141c, windows: GLOW, lit: 0.5, beacons: { color: RED, every: 2 }, count: 64, height: [50, 170], width: [16, 46], gap: 24, depth: 200 }, animated);
}

// Landmarks.

/** A landmark group stood at a road point, turned to the road's heading. */
function atRoad(g: THREE.Group, ribbon: Ribbon, s: number): THREE.Group {
  const f = kit.frameAt(ribbon, s);
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A group stood `lateral` metres off the road at `s` on the ground, +z turned to face the road, its back to the far side. */
function offRoadFacing(g: THREE.Group, ribbon: Ribbon, s: number, lateral: number): THREE.Group {
  const at = kit.offRoad(ribbon, s, lateral);
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.heading + (lateral < 0 ? -Math.PI / 2 : Math.PI / 2);
  return g;
}

/** The start: the road runs in through a giant browser window hung between two monitors, RIDDLE ME THIS in its title bar. */
export function echoGate(ribbon: Ribbon, s: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const hw = ribbon.halfWidthAtS(s) + 3;
  const H = 15;
  for (const side of [-1, 1]) {
    g.add(slab(3, H + 4, 3, metal(), side * (hw + 1.5), (H + 4) / 2, 0));
    g.add(slab(0.4, H, 0.4, kit.lit(GLOW), side * (hw - 0.2), H / 2, 0));
    const top = halo(p, GLOW, 10, 0.6);
    top.position.set(side * (hw + 1.5), H + 4.5, 0);
    g.add(top);
  }
  const win = panel(2 * hw + 6, label(['RIDDLE ME THIS.', 'DID YOU EVER GROW?'], '#bfe8ff', '#0a1020', 'www.the-feed.com/riddle-me-this'), 8);
  win.position.y = H + 4;
  g.add(win);
  // The troll's mask in the corner of it: a grin with nobody behind it.
  const grin = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.2, 6, 20, Math.PI), kit.lit(AMBER));
  grin.rotation.z = Math.PI;
  grin.position.set(hw + 4, H + 2, -0.3);
  g.add(grin);
  const glow = halo(p, GLOW, 44, 0.3);
  glow.position.y = H;
  g.add(glow);
  // Notification badges bobbing over the line.
  for (const x of [-hw + 2, hw - 2, 0]) {
    const b = new THREE.Mesh(BALL(), kit.lit(RED));
    b.scale.setScalar(0.8);
    b.position.set(x, H + 9.5, 0);
    p.badges.push(b);
    g.add(b);
  }
  return atRoad(g, ribbon, s);
}

/** The lonely bedroom beside the start: a bed, a desk, a monitor lighting a hunched figure at night, cans and biscuits on the floor, open to the road. */
export function bedroom(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const W = 26;
  const D = 20;
  const wall = kit.matte(0x30303c);
  g.add(slab(W, 0.6, D, kit.matte(0x2a2430), 0, 0.3, 0));
  g.add(slab(W, 10, 0.5, wall, 0, 5.6, -D / 2));
  g.add(slab(0.5, 10, D, kit.matte(0x2a2a36), -W / 2, 5.6, 0));
  // The bed, unmade, with a lump in it.
  g.add(slab(9, 1.6, 5, kit.matte(0x4a4a66), -7, 1.4, -6));
  const lump = new THREE.Mesh(BALL(), kit.matte(0x6a6a8a));
  lump.scale.set(2.9, 1.4, 1.8);
  lump.position.set(-8, 2.7, -6);
  g.add(lump);
  // The desk, the monitor lighting the room, and the one in front of it.
  g.add(slab(9, 0.5, 4, kit.matte(0x3a3026), 6, 3.4, -6.5), slab(8.4, 3.2, 3.4, kit.matte(0x241c14), 6, 1.6, -6.5));
  const mon = panel(6, label(['ONLINE', 'ALL NIGHT'], '#bfe8ff', '#06101c'), 3.6);
  mon.position.set(6, 6, -7.6);
  const lit = halo(p, GLOW, 28, 0.4);
  lit.position.set(6, 5.5, -4);
  g.add(mon, lit);
  const who = avatar(1.8, false);
  who.position.set(6, 0.4, -2.4);
  who.rotation.y = Math.PI;
  g.add(who);
  // Empty cans and biscuit packets on the floor.
  const rand = seededRandom(7401);
  for (let k = 0; k < 18; k++) {
    const can = rand() < 0.6;
    const m = can ? slab(0.9, 1.4, 0.9, canMat()) : slab(1.6, 0.2, 1, biscuit());
    m.position.set(-W / 2 + 3 + rand() * (W - 6), can ? 1.3 : 0.7, -D / 2 + 3 + rand() * (D - 6));
    m.rotation.y = rand() * 3;
    g.add(m);
  }
  // A window onto the feed, the wall's one light, and a sign over the door: the way in.
  const feed = panel(10, label(['LOG IN', 'SCROLL', 'REFRESH'], '#ffd25a', '#06101c', 'the-feed.com'), 6);
  feed.position.set(-W / 2 + 0.4, 7, 2);
  feed.rotation.y = Math.PI / 2;
  g.add(feed);
  animated.push((time) => (lit.material.opacity = 0.34 + 0.08 * Math.sin(time * 9) * Math.sin(time * 2.3)));
  return offRoadFacing(g, ribbon, s, lateral);
}

/** Break the spider's legs just to feed the crow: a giant spider with two of its legs snapped off, and the crow perched over the gap. */
export function spiderCrow(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(BALL(), kit.matte(0x2c2c40, { emissive: 0x161630 }));
  body.scale.set(5, 4, 6.5);
  body.position.y = 7;
  const head = new THREE.Mesh(BALL(), kit.matte(0x2c2c40, { emissive: 0x161630 }));
  head.scale.setScalar(2.6);
  head.position.set(0, 7.5, 6);
  g.add(body, head);
  g.add(kit.lightPool(RED, 22, 0.28));
  const eyes: THREE.Sprite[] = [];
  for (const e of [-0.9, 0.9]) {
    const eye = kit.glowSprite(RED, 2, 0.95);
    eye.position.set(e, 8.2, 8.3);
    g.add(eye);
    eyes.push(eye);
  }
  const legMat = kit.matte(0x383850, { emissive: 0x121226 });
  for (let k = 0; k < 8; k++) {
    const side = k < 4 ? -1 : 1;
    const row = k % 4;
    const a = (row - 1.5) * 0.55;
    const snapped = k === 1 || k === 6;
    const up = pole(snapped ? 3 : 8, 0.35, legMat);
    up.position.set(side * (3.5 + (snapped ? 1.2 : 3)), 7 + (snapped ? 0.8 : 3), a * 5);
    up.rotation.z = side * 1.0;
    g.add(up);
    if (!snapped) {
      const low = pole(9, 0.25, legMat);
      low.position.set(side * 11.5, 3.6, a * 5 + a * 2);
      low.rotation.z = -side * 0.45;
      g.add(low);
    } else {
      // The snapped-off leg lying on the ground, for the crow.
      const lying = pole(8, 0.25, legMat);
      lying.position.set(side * 11, 0.4, a * 6 - 4);
      lying.rotation.set(0, 0.8 * side, Math.PI / 2);
      g.add(lying);
    }
  }
  // The crow on a post over it all, a beak on the end of its neck, looking at the road.
  const crow = new THREE.Group();
  const cb = new THREE.Mesh(BALL(), crowMat());
  cb.scale.set(1.4, 1.2, 2.1);
  const ch = new THREE.Mesh(BALL(), crowMat());
  ch.scale.setScalar(0.8);
  ch.position.set(0, 0.9, 1.5);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 5), kit.matte(0xd0a040));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.8, 2.5);
  const wing = slab(0.2, 0.2, 2.6, crowMat(), -1.1, 0.2, -0.2);
  crow.add(cb, ch, beak, wing);
  crow.position.set(14, 12.9, -6);
  const cEye = kit.glowSprite(RED, 0.8, 0.9);
  cEye.position.set(0.3, 1.1, 2);
  crow.add(cEye);
  g.add(pole(12, 0.28, metal()).translateX(14).translateZ(-6), crow);
  const flock = kit.flock({ count: 8, radius: 26, height: 22, color: 0x0a0c10, size: 1.8 }, animated);
  flock.position.set(0, 0, 0);
  g.add(flock);
  animated.push((time) => {
    crow.rotation.x = 0.25 * Math.max(0, Math.sin(time * 1.5)) ** 3;
    crow.rotation.y = 0.2 * Math.sin(time * 0.6);
    eyes.forEach((e, k) => (e.material.opacity = 0.7 + 0.3 * Math.sin(time * 3 + k * 2)));
  });
  g.scale.setScalar(1.25);
  return offRoadFacing(g, ribbon, s, lateral);
}

/** The comment wall: cards of comments standing along both edges from `s` to `to`, glowing, each its own user. */
export function commentWall(ribbon: Ribbon, s: number, to: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const rand = seededRandom(7501);
  const texts = [['LOL', 'PATHETIC'], ['SAME', 'BRO'], ['NOBODY ASKED'], ['WAKE UP'], ['THIS.'], ['RATIO']];
  let k = 0;
  for (let d = s; d < to; d += 16, k++) {
    const f = kit.frameAt(ribbon, d);
    const hw = ribbon.halfWidthAtS(d);
    for (const side of [-1, 1]) {
      const at = kit.offRoad(ribbon, d + side * 2, side * (hw + 7));
      const card = panel(7, label(texts[(k + (side > 0 ? 2 : 0)) % texts.length], '#bfe8ff', '#10182a', `@user${100 + k * 7}`), 4.4);
      card.position.set(at.x, f.y + 4, at.z);
      card.rotation.y = f.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2) + (rand() - 0.5) * 0.3;
      const post = pole(f.y + 4, 0.15, metal());
      post.position.set(at.x, (f.y + 4) / 2, at.z);
      const gl = halo(p, GLOW, 11, 0.22);
      gl.position.copy(card.position);
      g.add(card, post, gl);
    }
  }
  return g;
}

/** Dance like flies, swarming in the clouds: a dark cloud of flies over the road, each a notification badge, wheeling. */
export function flyCloud(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(7511);
  for (let k = 0; k < 6; k++) {
    const c = kit.smokeSprite(0x050608, 36 + rand() * 18, 0.55);
    c.position.set((rand() - 0.5) * 30, 26 + rand() * 8, (rand() - 0.5) * 30);
    g.add(c);
  }
  const dark = kit.swarm({ count: 160, radius: 20, height: 12, color: 0x20242c, size: 1, speed: 0.15, glow: false, seed: 7512 }, animated);
  const red = kit.swarm({ count: 20, radius: 20, height: 12, color: RED, size: 0.9, speed: 0.12, seed: 7513 }, animated);
  dark.position.y = red.position.y = 22;
  g.add(dark, red);
  // A column of them down to the road, so it reads as a thing, not weather.
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(7, 1.5, 24, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0x0a0c10, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  stem.position.y = 12;
  g.add(stem);
  const f = kit.offRoad(ribbon, s, lateral);
  g.position.set(f.x, ribbon.heightAt(s), f.z);
  return g;
}

/** A few biccys too many: a heap of biscuits and empty cans, a lamp over it, in the lonely bedroom's spill. */
export function biccyHeap(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const rand = seededRandom(7521);
  for (let k = 0; k < 14; k++) {
    const layer = Math.floor(k / 4);
    const w = 6.8 - layer * 1.2;
    const b = slab(w, 0.9, w, biscuit(), (rand() - 0.5) * 1.2, 0.5 + layer * 1.0 + (k % 4) * 0.02, (rand() - 0.5) * 1.2);
    b.rotation.y = rand() * 3;
    g.add(b);
    for (let d = 0; d < 3; d++) {
      const dot = slab(0.5, 0.1, 0.5, kit.matte(0x4a2a10), b.position.x + (rand() - 0.5) * w * 0.7, b.position.y + 0.46, b.position.z + (rand() - 0.5) * w * 0.7);
      g.add(dot);
    }
  }
  for (let k = 0; k < 16; k++) {
    const can = slab(1.4, 2.4, 1.4, canMat());
    const a = rand() * Math.PI * 2;
    const r = 6 + rand() * 7;
    can.position.set(Math.cos(a) * r, 1.2, Math.sin(a) * r);
    can.rotation.y = rand() * 3;
    g.add(can);
  }
  const lamp = halo(p, AMBER, 16, 0.5);
  lamp.position.set(5, 9, 4);
  g.add(pole(9, 0.18, metal()).translateX(5).translateZ(4), lamp, kit.lightPool(AMBER, 14, 0.3));
  // Crumbs of light drifting up off it.
  const crumbs = kit.motes({ count: 40, radius: 8, height: 14, color: AMBER, drift: 'rise', speed: 1, size: 0.4, seed: 7522 }, animated);
  g.add(crumbs);
  animated.push((time) => (lamp.userData.base = 0.42 + 0.08 * Math.sin(time * 5)));
  const at = kit.offRoad(ribbon, s, lateral);
  g.position.set(at.x, 0, at.z);
  return g;
}

/**
 * At the center of it all: a tiny brain standing on a ball, on the island
 * the road circles in its cut, a cold light on it from above and a flame
 * guttering at its foot. It ain't got the gall.
 */
export function brainBall(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const island = new THREE.Mesh(new THREE.CylinderGeometry(21, 22, 0.4, 36), kit.matte(0x1a2234, { emissive: 0x0a1020 }));
  island.position.y = 0.2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(18, 19, 48), new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.45;
  g.add(island, ring);
  const ball = new THREE.Mesh(BALL(), glass());
  ball.scale.setScalar(6.5);
  ball.position.y = 6.9;
  g.add(ball);
  const mind = brain(2.4);
  g.add(mind);
  // The cold beam from above on it.
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 14, 40, 24, 1, true), new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.position.y = 22;
  g.add(beam);
  const glow = halo(p, GLOW, 32, 0.38);
  glow.position.y = 12;
  g.add(glow);
  // A flame at its foot, tiny, and the sparks it throws.
  const flame = kit.glowSprite(AMBER, 3.5, 0.9);
  flame.position.set(9, 1.2, 3);
  g.add(flame);
  const sparks = kit.motes({ count: 60, radius: 18, height: 30, color: GLOW, drift: 'swirl', speed: 2, size: 0.4, seed: 7532 }, animated);
  g.add(sparks);
  const plaque = panel(8, label(['AT THE CENTER', 'OF IT ALL'], '#ffd25a', '#0a1020'), 4);
  plaque.position.set(0, 3, -16);
  g.add(plaque);
  animated.push((time) => {
    mind.rotation.y = time * 0.5;
    mind.position.y = 6.9 + 6.5 + 1.7 + 0.15 * Math.sin(time * 2);
    flame.material.opacity = 0.65 + 0.3 * Math.sin(time * 13);
    flame.scale.setScalar(3.2 + 0.6 * Math.sin(time * 9));
    beam.material.opacity = 0.08 + 0.04 * Math.sin(time * 1.5);
    ring.material.opacity = 0.5 + 0.4 * music.pulse(time);
  });
  const at = kit.offRoad(ribbon, s, lateral);
  g.position.set(at.x, 0, at.z);
  return g;
}

/** You will not be missed, said the tear to the eye: a giant eye on a stalk on the other island, a tear welling at its corner, falling into a puddle at its foot. */
export function tearEye(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const island = new THREE.Mesh(new THREE.CylinderGeometry(21, 22, 0.4, 36), kit.matte(0x1a2234, { emissive: 0x0a1020 }));
  island.position.y = 0.2;
  g.add(island, pole(16, 2.4, flesh()));
  const eye = new THREE.Group();
  const ball = new THREE.Mesh(BALL(), kit.matte(0xe4e8ec, { emissive: 0x202830 }));
  ball.scale.setScalar(8);
  const iris = new THREE.Mesh(new THREE.CircleGeometry(4.2, 28), kit.lit(0x5a9ab0));
  iris.position.set(0, 0, 7.95);
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(1.8, 20), kit.lit(0x04060a));
  pupil.position.set(0, 0, 7.97);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(8.4, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.38), kit.matte(0x8a3a48));
  eye.add(ball, iris, pupil, lid);
  eye.position.y = 24;
  g.add(eye);
  // The tear: a drop of the glass, falling from the eye's corner into the puddle.
  const drop = new THREE.Mesh(BALL(), new THREE.MeshPhongMaterial({ color: 0x9adaff, transparent: true, opacity: 0.8, specular: 0xffffff, shininess: 120 }));
  g.add(drop);
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(7, 28), new THREE.MeshBasicMaterial({ color: 0x4a9ac8, transparent: true, opacity: 0.55, depthWrite: false }));
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(0, 0.5, 3);
  g.add(puddle);
  const glow = halo(p, 0xe8f4ff, 40, 0.3);
  glow.position.y = 24;
  g.add(glow);
  const plaque = panel(8, label(['YOU WILL NOT', 'BE MISSED'], '#ff8a8a', '#0a1020'), 4);
  plaque.position.set(0, 3, -16);
  g.add(plaque);
  const rain = kit.motes({ count: 60, radius: 14, height: 24, color: 0x9adaff, drift: 'fall', speed: 5, size: 0.5, seed: 7542 }, animated);
  g.add(rain);
  animated.push((time) => {
    const v = (time * 0.35) % 1;
    const fall = v < 0.25 ? 0 : (v - 0.25) / 0.75;
    drop.position.set(5.5, 20 - fall * fall * 19, 6.5 - 3.5 * fall);
    const sz = 0.6 + (v < 0.25 ? v * 2.4 : 0.6);
    drop.scale.set(sz, sz * 1.5, sz);
    puddle.scale.setScalar(0.8 + 0.2 * Math.sin(time * 1.2));
    eye.rotation.y = 0.25 * Math.sin(time * 0.4);
    lid.position.y = 0.4 * Math.max(0, Math.sin(time * 0.5 + 1)) ** 8 * -4;
  });
  const at = kit.offRoad(ribbon, s, lateral);
  g.position.set(at.x, 0, at.z);
  g.rotation.y = Math.PI;
  return g;
}

/** Himpathetic bro: a giant faceless figure hunched in a hoodie over a glowing laptop, alone with it. */
export function broAvatar(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(6, 9, 6, 14), avatarGrey());
  body.position.set(0, 10, 4);
  body.rotation.x = 0.5;
  const head = new THREE.Mesh(BALL(), avatarGrey());
  head.scale.setScalar(5);
  head.position.set(0, 18, -4);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(5.6, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), avatarDark());
  hood.position.set(0, 18.6, -3.4);
  g.add(body, head, hood);
  const laptop = panel(12, label(['HIMPATHETIC', 'BRO'], '#bfe8ff', '#06101c'), 7.5);
  laptop.position.set(0, 12, -16);
  laptop.rotation.x = -0.25;
  g.add(laptop, slab(12, 0.6, 8, metal(), 0, 7.8, -12));
  const lit = halo(p, GLOW, 44, 0.32);
  lit.position.set(0, 14, -14);
  g.add(lit);
  const badge = new THREE.Mesh(BALL(), kit.lit(RED));
  badge.scale.setScalar(1.4);
  badge.position.set(5, 24, -2);
  p.badges.push(badge);
  g.add(badge);
  const dust = kit.motes({ count: 50, radius: 14, height: 18, color: GLOW, drift: 'float', size: 0.4, seed: 7552 }, animated);
  g.add(dust);
  animated.push((time) => {
    lit.userData.base = 0.28 + 0.08 * Math.sin(time * 7) * Math.sin(time * 1.7);
    body.rotation.x = 0.5 + 0.03 * Math.sin(time * 1.1);
  });
  const at = kit.offRoad(ribbon, s, lateral);
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.heading + (lateral > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI;
  return g;
}

/** The long deck back over the spiral: posts down both edges lit like a scrolling feed, pulsing toward you. */
export function deckFeed(ribbon: Ribbon, s: number, to: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const lights: THREE.Sprite[] = [];
  let k = 0;
  for (let d = s; d < to; d += 22, k++) {
    const f = kit.frameAt(ribbon, d);
    const hw = ribbon.halfWidthAtS(d);
    for (const side of [-1, 1]) {
      const at = kit.offRoad(ribbon, d, side * (hw + 0.8));
      const post = pole(4, 0.18, metal());
      post.position.set(at.x, f.y + 2, at.z);
      const l = kit.glowSprite(GLOW, 3.4, 0.9);
      l.position.set(at.x, f.y + 4.2, at.z);
      g.add(post, l);
      lights.push(l);
    }
  }
  animated.push((time) => lights.forEach((l, n) => (l.material.opacity = 0.35 + 0.6 * Math.max(0, Math.sin(time * 6 - Math.floor(n / 2) * 0.7)))));
  return g;
}

// The hazard.

/**
 * The mob: faceless grey avatars gathering in from both edges to stand
 * shoulder to shoulder across the road, flies circling over them, and the
 * one gap lit green on the road, closing and washing back out.
 */
export function mobParts(obj: THREE.Object3D): THREE.Object3D[] {
  const row = new THREE.Group();
  for (let k = 0; k < MOB_SLOTS; k++) row.add(avatar(2.1, k % 2 === 0));
  const gapLight = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3), new THREE.MeshBasicMaterial({ color: SICK, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  gapLight.rotation.x = -Math.PI / 2;
  gapLight.position.y = 0.14;
  const flies = new THREE.Group();
  for (let k = 0; k < 12; k++) {
    const fl = kit.glowSprite(k % 4 === 0 ? RED : 0x15181e, 0.9, 0.9);
    if (k % 4 !== 0) fl.material.blending = THREE.NormalBlending;
    flies.add(fl);
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.1;
  const parts = [row, gapLight, flies, shadow];
  for (const o of parts) obj.add(o);
  return parts;
}

export function poseMob(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [row, gapLight, flies, shadow] = parts;
  obj.position.set(p.ax, p.ground, p.az);
  obj.rotation.y = p.heading;
  const reach = p.radius;
  const u = p.phase;
  const people = mobRow(u, p.lane, reach);
  row.children.forEach((c, k) => {
    const a = c as THREE.Group;
    const here = k < people.length ? people[k] : undefined;
    a.visible = !!here && mobIn(u) > 0.02;
    if (!here) return;
    // In the road's frame, a lateral to the right is local -x.
    a.position.set(-here.lateral, Math.abs(Math.sin(elapsed * 6 + k * 1.3)) * 0.18 * (1 - (u >= MOB_STAGES.closed && u < MOB_STAGES.open ? 1 : 0)), 0);
    a.rotation.y = Math.PI;
  });
  // The gap, lit while the row is closing and closed.
  const lit = u > 0.08 && u < MOB_STAGES.open ? Math.min(1, mobIn(u) * 1.6) : 0;
  gapLight.position.x = -p.gap;
  (gapLight as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material.opacity = lit * (0.45 + 0.25 * Math.sin(elapsed * 12));
  flies.visible = mobIn(u) > 0.05;
  flies.children.forEach((fl, k) => {
    const a = elapsed * (1.5 + (k % 4) * 0.4) + k * 2.1;
    fl.position.set(Math.cos(a) * reach * 0.9 * Math.sin(k + 1), 4.2 + Math.sin(a * 2) * 0.8, Math.sin(a * 1.4) * 2.2);
  });
  shadow.scale.set(2 * reach + 6, 4, 1);
  (shadow as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.28 * mobIn(u);
}
