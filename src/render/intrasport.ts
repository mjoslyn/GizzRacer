import * as THREE from 'three';
import { seededRandom } from '../core/math';
import type { HazardPose } from '../items/hazards';
import { NEEDLE_BPM, NEEDLE_STITCHES, needleDown, stitchLateral, stitchOpen } from '../kits/intrasport';
import type { Ribbon, Track } from '../tracks/track';
import * as kit from './scenery';

/**
 * Intrasport's world (K.G., 2020): a night stadium inside the head, turned
 * into a rave. The road is the running track, red rubber and white lanes;
 * the ground is the infield's turf under the floodlights, strewn with
 * confetti and glowsticks; the walls are the stands; the barrier is the
 * LED boards round the pitch. Speakers, lasers and floodlights everywhere,
 * all of it pumping on the song's four on the floor (NEEDLE_BPM), and the
 * song's images set up along the lap in its order: the static shattered,
 * the speakers' rhythm, the balls set to collide, the hands disappearing,
 * the tear, the floating deck and its bird's eye view, the thoughts
 * perishing, the hand on the gun (a starter's pistol), the face splashing
 * in the sky, the boxing ring of the dreams about killing, the needle and
 * its spools of thread, the runner, the head with its hair liquifying and
 * its tastebuds alight, the march of evolution, the feeling on the floor
 * under its mirror ball, and the hand held up: don't do it. On the final
 * lap the stadium lets off fireworks.
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;

const once = kit.once;

/** Rave colours: hot magenta, laser cyan, acid yellow, UV violet, and the track's red. */
const MAGENTA = 0xff3aa8;
const CYAN = 0x3af0ff;
const ACID = 0xd8ff3a;
const VIOLET = 0x9a5aff;
const FLOOD = 0xfff4d8;
const RAVE = [MAGENTA, CYAN, ACID, VIOLET] as const;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

// The world pumps on the song's tempo.
const music = kit.beat(NEEDLE_BPM);

function finish(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = kit.canvasTexture(c, repeat);
  t.anisotropy = 8;
  return t;
}

/** Fills the canvas pixel by pixel. */
function paint(ctx: CanvasRenderingContext2D, w: number, h: number, fn: (x: number, y: number) => [number, number, number]): void {
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * The road: a running track. Red rubber, grainy, three white lane lines on
 * each half, a start's stagger marks now and then and the lane numbers; it
 * reads warm and light on the dark turf. The texture spans half the road
 * and mirrors across it.
 */
export function tartanRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = kit.canvas(S);
  const rand = seededRandom(9101);
  paint(ctx, S, S, () => {
    const n = 0.88 + rand() * 0.24;
    return [206 * n, 74 * n, 52 * n];
  });
  // Lane lines: white, crisp.
  ctx.fillStyle = 'rgba(250,246,240,0.95)';
  for (const x of [0, S / 3, (2 * S) / 3]) ctx.fillRect(x, 0, 4, S);
  ctx.fillRect(S - 4, 0, 4, S);
  // Stagger marks and lane numbers.
  ctx.font = "900 26px 'Arial Black', Impact, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let k = 0; k < 3; k++) {
    const x = (k + 0.5) * (S / 3);
    ctx.fillRect(x - 30, 40 + k * 60, 60, 4);
    ctx.save();
    ctx.translate(x, 80 + k * 60);
    ctx.fillStyle = 'rgba(250,246,240,0.6)';
    ctx.fillText(String(k + 1), 0, 0);
    ctx.restore();
  }
  return finish(c);
}

/** The ground: the infield's turf at night, mown in stripes, faint white field lines, confetti and glowstick ends trodden into it. */
export function turfGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = kit.canvas(S);
  const rand = seededRandom(9111);
  paint(ctx, S, S, (_x, y) => {
    const stripe = Math.floor(y / 64) % 2 ? 1.12 : 0.9;
    const n = (0.85 + rand() * 0.3) * stripe;
    return [22 * n, 58 * n, 34 * n];
  });
  ctx.fillStyle = 'rgba(220,240,220,0.22)';
  ctx.fillRect(0, 254, S, 3);
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(220,240,220,0.18)';
  ctx.lineWidth = 3;
  ctx.arc(S / 2, S / 2, 90, 0, Math.PI * 2);
  ctx.stroke();
  const colors = ['rgba(255,58,168,0.8)', 'rgba(58,240,255,0.8)', 'rgba(216,255,58,0.8)', 'rgba(154,90,255,0.8)', 'rgba(255,255,255,0.6)'];
  for (let k = 0; k < 900; k++) {
    ctx.fillStyle = colors[k % colors.length];
    ctx.save();
    ctx.translate(rand() * S, rand() * S);
    ctx.rotate(rand() * Math.PI);
    ctx.fillRect(0, 0, 2 + rand() * 4, 1.5);
    ctx.restore();
  }
  return finish(c);
}

/** The walls and the world's edge: the stands, tier on tier of seats in the team colours, concrete between. */
export function standTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = kit.canvas(S);
  ctx.fillStyle = '#26222c';
  ctx.fillRect(0, 0, S, S);
  const rand = seededRandom(9121);
  const seats = ['#4a2a8a', '#2a4ab0', '#8a1a5a', '#3a3a4a'];
  for (let y = 0; y < S; y += 16) {
    ctx.fillStyle = '#3a3640';
    ctx.fillRect(0, y + 12, S, 4);
    for (let x = 0; x < S; x += 8) {
      ctx.fillStyle = seats[Math.floor((x + y * 3) / 64) % seats.length];
      if (rand() < 0.08) ctx.fillStyle = rand() < 0.5 ? '#ff3aa8' : '#3af0ff';
      ctx.fillRect(x + 1, y + 2, 6, 9);
    }
  }
  return finish(c);
}

/** The barrier: the LED boards round the pitch, black, the song's colours crawling along them in chevrons. */
export function ledBoardTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 64;
  const [c, ctx] = kit.canvas(W, H);
  ctx.fillStyle = '#05040a';
  ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 16; k++) {
    const color = hex(RAVE[Math.floor(k / 4) % RAVE.length]);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    const x = 6 + k * 32;
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x + 14, 10);
    ctx.lineTo(x + 26, H / 2);
    ctx.lineTo(x + 14, H - 10);
    ctx.lineTo(x, H - 10);
    ctx.lineTo(x + 12, H / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  // The LEDs' grid.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = 0; x < W; x += 4) ctx.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  ctx.fillStyle = '#ff3aa8';
  ctx.fillRect(0, 0, W, 3);
  return finish(c);
}

/** Static: snow, a TV with no signal, tiled. Scrolled at random each frame, it seethes. */
const staticTexture = once(() => {
  const S = 128;
  const [c, ctx] = kit.canvas(S);
  const rand = seededRandom(9131);
  paint(ctx, S, S, () => {
    const v = 40 + rand() * 215;
    return [v, v, v * 1.05];
  });
  return finish(c);
});

// Shared parts.
const metal = once(() => kit.matte(0x2a2a34));
const black = once(() => kit.matte(0x111116));
const white = once(() => kit.matte(0xf0f0f4));
const skin = once(() => kit.matte(0xe0a888, { emissive: 0x301810 }));
const chrome = once(() => new THREE.MeshPhongMaterial({ color: 0xc8ccd8, specular: 0xffffff, shininess: 120 }));

const CYL = once(() => new THREE.CylinderGeometry(1, 1, 1, 10));
const BOX = once(() => new THREE.BoxGeometry(1, 1, 1));
const BALL = once(() => new THREE.SphereGeometry(1, 14, 10));
const CONE = once(() => new THREE.ConeGeometry(1, 1, 10));

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

/** A material of its own (not shared), for things that change colour or fade. */
const own = (color: number, opacity = 1, additive = false) =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1 || additive, opacity, depthWrite: !additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });

/** Everything that pumps on the kick in one place: glows, speaker cones and the colour-cycling lights, from one callback. */
interface Pulse {
  animated: kit.Animated;
  halos: THREE.Sprite[];
  cones: THREE.Object3D[];
  cyclers: { mat: THREE.MeshBasicMaterial; offset: number }[];
  lasers: { obj: THREE.Object3D; phase: number; reach: number }[];
}

function pulse(animated: kit.Animated): Pulse {
  const p: Pulse = { animated, halos: [], cones: [], cyclers: [], lasers: [] };
  const colors = RAVE.map((c) => new THREE.Color(c));
  animated.push((time) => {
    const k = music.kick(time, 0, 6);
    for (const h of p.halos) h.material.opacity = (h.userData.base as number) * (0.55 + 0.45 * k);
    for (const c of p.cones) c.scale.z = 1 + 0.6 * k;
    const bar = Math.floor((time * NEEDLE_BPM) / 60);
    for (const cy of p.cyclers) cy.mat.color.copy(colors[(bar + cy.offset) % colors.length]);
    for (const l of p.lasers) {
      l.obj.rotation.z = Math.sin(time * 0.9 + l.phase) * l.reach;
      l.obj.rotation.x = Math.cos(time * 0.6 + l.phase * 1.7) * l.reach * 0.6;
    }
  });
  return p;
}

/** A glow that pumps on the kick. */
function halo(p: Pulse, color: number, size: number, opacity = 0.3): THREE.Sprite {
  const s = kit.glowSprite(color, size, opacity);
  s.userData.base = opacity;
  p.halos.push(s);
  return s;
}

/** A laser: a thin beam of light from its foot, sweeping. */
function laser(p: Pulse, color: number, length: number, phase: number, reach = 0.7): THREE.Group {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(CYL(), own(color, 0.55, true));
  beam.scale.set(0.12, length, 0.12);
  beam.position.y = length / 2;
  g.add(beam);
  p.lasers.push({ obj: g, phase, reach });
  return g;
}

/** A speaker cabinet `h` tall: black box, two cones that pump on the kick, a lit rim. */
function speaker(p: Pulse, h: number, rim = MAGENTA): THREE.Group {
  const g = new THREE.Group();
  const w = h * 0.6;
  g.add(slab(w, h, w * 0.8, black(), 0, h / 2, 0));
  g.add(slab(w * 0.92, h * 0.94, 0.05, kit.matte(0x2a2236, { emissive: 0x140a1c }), 0, h / 2, w * 0.4));
  for (const [y, r] of [[h * 0.7, w * 0.3], [h * 0.3, w * 0.38]] as const) {
    const cone = new THREE.Mesh(CONE(), metal());
    cone.scale.set(r, r * 0.6, r);
    cone.rotation.x = -Math.PI / 2;
    const holder = new THREE.Group();
    holder.position.set(0, y, w * 0.4);
    holder.add(cone);
    p.cones.push(holder);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.12, 6, 20), kit.lit(rim));
    ring.position.set(0, y, w * 0.41);
    g.add(holder, ring);
  }
  return g;
}

/** A floodlight on its mast: a bank of lamps at the top, glowing. */
function floodlight(p: Pulse, h: number): THREE.Group {
  const g = new THREE.Group();
  g.add(pole(h, 0.35, metal()));
  const bank = slab(5, 3, 0.6, metal(), 0, h + 1, 0);
  bank.rotation.x = 0.3;
  g.add(bank);
  for (let k = 0; k < 6; k++) g.add(slab(1.3, 1, 0.2, kit.lit(FLOOD), -1.7 + (k % 3) * 1.7, h + 0.4 + Math.floor(k / 3) * 1.3, 0.35));
  const glow = halo(p, FLOOD, 14, 0.35);
  glow.position.set(0, h + 1, 1);
  g.add(glow);
  return g;
}

/** A figure: a body and a head, in the colour given. */
function figure(color: number, size = 1): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 2, 8), kit.matte(color));
  body.position.y = 1;
  const head = new THREE.Mesh(BALL(), skin());
  head.scale.setScalar(0.38);
  head.position.y = 2;
  g.add(body, head);
  g.scale.setScalar(size);
  return g;
}

/** A giant hand, palm up and fingers spread, `size` tall, in `mat`. */
function hand(mat: THREE.Material, size: number): THREE.Group {
  const g = new THREE.Group();
  g.add(slab(size * 0.5, size * 0.5, size * 0.16, mat, 0, size * 0.42, 0));
  g.add(slab(size * 0.34, size * 0.3, size * 0.18, mat, 0, size * 0.1, 0));
  [-0.18, -0.06, 0.06, 0.18].forEach((x, k) => {
    const len = size * (k === 0 || k === 3 ? 0.3 : 0.38);
    const f = slab(size * 0.1, len, size * 0.12, mat, x * size, size * 0.67 + len / 2, 0);
    f.rotation.z = -x * 0.8;
    g.add(f);
  });
  const thumb = slab(size * 0.1, size * 0.26, size * 0.12, mat, -size * 0.3, size * 0.45, 0);
  thumb.rotation.z = 0.8;
  g.add(thumb);
  return g;
}

/** Thread spool: a drum of coloured thread between two wooden flanges. */
function spool(color: number, r: number): THREE.Group {
  const g = new THREE.Group();
  const wood = kit.matte(0xc89a5a);
  const drum = pole(r * 1.6, r * 0.7, kit.matte(color, { emissive: color & 0x3f3f3f }));
  drum.position.y = r * 0.95;
  const top = pole(r * 0.15, r, wood, r * 1.75);
  const bottom = pole(r * 0.15, r, wood, 0);
  g.add(drum, top, bottom);
  return g;
}

const hot = (rand: () => number) => RAVE[Math.floor(rand() * RAVE.length)];

/** The roadside props, built for one place's pulse. Each is built at the origin, facing +z, its foot on the ground. */
function props(p: Pulse) {
  const speakerProp: kit.Prop = (rand) => {
    const g = speaker(p, 3 + rand() * 3, hot(rand));
    if (rand() < 0.4) {
      const top = speaker(p, 2 + rand() * 1.5, hot(rand));
      top.position.y = g.children[0].scale.y;
      g.add(top);
    }
    return g;
  };
  const flood: kit.Prop = (rand) => floodlight(p, 10 + rand() * 8);
  const laserRig: kit.Prop = (rand) => {
    const g = new THREE.Group();
    g.add(slab(1.4, 1, 1.4, black(), 0, 0.5, 0));
    const c = hot(rand);
    const l = laser(p, c, 40 + rand() * 30, rand() * 6);
    l.position.y = 1;
    const glow = halo(p, c, 4, 0.6);
    glow.position.y = 1.2;
    g.add(l, glow);
    return g;
  };
  const glowsticks: kit.Prop = (rand) => {
    const g = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const st = pole(0.9, 0.06, kit.lit(hot(rand)));
      st.position.set((rand() - 0.5) * 1.6, 0.05, (rand() - 0.5) * 1.6);
      st.rotation.set(Math.PI / 2 - 0.2, rand() * 6, rand() - 0.5);
      g.add(st);
    }
    return g;
  };
  const hurdle: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const w = 2.4 + rand() * 0.8;
    g.add(pole(1, 0.06, white()).translateX(-w / 2), pole(1, 0.06, white()).translateX(w / 2));
    for (let k = 0; k < 4; k++) g.add(slab(w / 4, 0.25, 0.08, k % 2 ? white() : black(), -w / 2 + (k + 0.5) * (w / 4), 1, 0));
    if (rand() < 0.3) g.rotation.z = 1.4; // knocked over
    return g;
  };
  const cones: kit.Prop = (rand) => {
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const c = new THREE.Mesh(CONE(), kit.matte(0xff7a1a, { emissive: 0x401800 }));
      c.scale.set(0.4, 0.9, 0.4);
      c.position.set(k * 1.2 - 1.2, 0.45, (rand() - 0.5) * 0.8);
      g.add(c);
    }
    return g;
  };
  const ball: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const r = 0.5 + rand() * 1.2;
    const b = new THREE.Mesh(BALL(), rand() < 0.5 ? kit.matte(0xe86a1a, { emissive: 0x301000 }) : white());
    b.scale.setScalar(r);
    b.position.y = r;
    g.add(b);
    return g;
  };
  const tv: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const w = 2 + rand() * 2.5;
    g.add(slab(w * 1.1, w * 0.85, w * 0.7, black(), 0, w * 0.43, 0));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, w * 0.66), new THREE.MeshBasicMaterial({ map: staticTexture() }));
    face.position.set(0, w * 0.43, w * 0.36);
    g.add(face);
    // An aerial on top, bent.
    const aerial = pole(w * 0.6, 0.03, metal(), w * 0.85);
    aerial.rotation.z = (rand() - 0.5) * 0.8;
    g.add(aerial);
    return g;
  };
  const dancers: kit.Prop = (rand) => {
    const g = new THREE.Group();
    const n = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const f = figure(hot(rand), 0.9 + rand() * 0.2);
      f.position.set((rand() - 0.5) * 3, 0, (rand() - 0.5) * 3);
      f.rotation.y = rand() * 6;
      const holder = new THREE.Group();
      holder.add(f);
      const ph = rand();
      p.animated.push((time) => (holder.position.y = 0.35 * music.pulse(time, ph)));
      g.add(holder);
    }
    return g;
  };
  const bubble: kit.Prop = (rand) => {
    // A thought, wilting: a cloud of puffs dimming, its tail of dots down to the ground.
    const g = new THREE.Group();
    const mat = own(0xe8e0ff, 0.6);
    const top = 6 + rand() * 4;
    for (let k = 0; k < 5; k++) {
      const b = new THREE.Mesh(BALL(), mat);
      b.scale.setScalar(1 + rand() * 0.8);
      b.position.set((k - 2) * 1.2, top + Math.sin(k * 2) * 0.6, 0);
      g.add(b);
    }
    for (let k = 0; k < 3; k++) {
      const d = new THREE.Mesh(BALL(), mat);
      d.scale.setScalar(0.4 - k * 0.1);
      d.position.set(-1 - k * 0.5, top - 2 - k * 1.4, 0);
      g.add(d);
    }
    g.add(pole(top - 3, 0.05, metal()));
    const ph = rand() * 6;
    p.animated.push((time) => (mat.opacity = 0.2 + 0.45 * (0.5 + 0.5 * Math.sin(time * 0.7 + ph))));
    return g;
  };
  const spoolProp: kit.Prop = (rand) => spool(hot(rand), 0.6 + rand() * 0.8);
  const drip: kit.Prop = (rand) => {
    // A lava lamp, waist high: wax blobs rising and falling in it.
    const g = new THREE.Group();
    const h = 2 + rand() * 2;
    const c = hot(rand);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * h * 0.3, 0.5 * h * 0.3, h, 10, 1, true), own(c, 0.35, true));
    glass.position.y = h / 2 + 0.4;
    g.add(slab(h * 0.35, 0.4, h * 0.35, metal(), 0, 0.2, 0), glass);
    const blob = new THREE.Mesh(BALL(), kit.lit(c));
    blob.scale.setScalar(h * 0.09);
    g.add(blob);
    const ph = rand() * 6;
    p.animated.push((time) => (blob.position.y = 0.6 + h * (0.5 + 0.4 * Math.sin(time * 0.6 + ph))));
    return g;
  };
  const brazier: kit.Prop = (rand) => kit.torch(p.animated, rand() * 9, { kind: 'basket', height: 1.6, colors: { outer: 0xff3a8a, mid: 0xff6a2a, core: 0xfff0a0 } });
  return { speakerProp, flood, laserRig, glowsticks, hurdle, cones, ball, tv, dancers, bubble, spoolProp, drip, brazier };
}

/**
 * The roadside fill: speakers, floodlights, laser rigs, hurdles and cones
 * and balls, screens of static, dancers, thoughts wilting, spools and lava
 * lamps, by the stretch of the lap it's beside. Each stretch's own
 * dressing is its `raveField`.
 */
export function raveFeature(animated: kit.Animated, track?: Track): Feature {
  const sectionAt = track ? kit.sectionNamer(track) : () => '';
  const P = props(pulse(animated));
  const general: [number, kit.Prop][] = [
    [2, P.speakerProp],
    [1, P.flood],
    [1.2, P.glowsticks],
    [1, P.cones],
    [0.8, P.ball],
    [0.6, P.laserRig],
  ];
  const bySection: Record<string, [number, kit.Prop][]> = {
    'Shatter the Static': [[5, P.tv]],
    'Find the Rhythm': [[6, P.speakerProp]],
    'Set Course to Collide': [[4, P.ball]],
    'My Hands Are Disappearing': [[4, P.dancers]],
    'Perish to My Thoughts': [[5, P.bubble]],
    'Sleeping with a Needle': [[5, P.spoolProp]],
    'My Hair Is Liquifying': [[5, P.drip]],
    'My Tastebuds Are Igniting': [[4, P.brazier]],
    "It's True I Am Evolving": [[4, P.hurdle]],
    "The Feeling's on the Floor": [[5, P.dancers]],
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

/** How much room each landmark wants kept clear round it, in metres. */
const ROOM: Partial<Record<string, number>> = {
  staticWall: 22,
  ballCollision: 26,
  speakerStack: 22,
  raveHands: 26,
  tearDrop: 20,
  starterPistol: 22,
  mirrorFloor: 28,
  boxingRing: 24,
  spoolTower: 20,
  meltingHead: 26,
  evolutionMarch: 26,
  stopHand: 20,
};

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
  /** Where the landmarks stand, and how much room each wants: props and set pieces keep clear of them. */
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
  let lateral = first * (f.ribbon.halfWidthAtS(s) + away);
  search: for (const extra of [0, 14, 28, 42]) {
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
function words(f: Field, frac: number, lines: string[], color = MAGENTA): void {
  const c = hex(color);
  f.g.add(kit.roadBanner(f.ribbon, along(f, frac), lines, { style: 'neon', bg: '#08060e', fg: '#fff4fa', glow: c, glowColor: color, lift: 7, post: metal() }, f.animated));
}

/** A truss across the road `frac` of the way along the field, a mirror ball turning under it and lamps either side pumping on the beat: where a banner of words would hang, the rave's own lights. */
function mirrorTruss(f: Field, frac: number, color = MAGENTA): void {
  const s = along(f, frac);
  const fr = kit.frameAt(f.ribbon, s);
  const hw = f.ribbon.halfWidthAtS(s) + 2;
  const H = 8.5;
  const g = new THREE.Group();
  for (const side of [-1, 1]) g.add(pole(H, 0.3, metal()).translateX(side * hw));
  g.add(slab(2 * hw + 1, 0.6, 0.6, metal(), 0, H, 0));
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), kit.matte(0xe8e8f0, { flat: true, emissive: 0x303040 }));
  ball.position.y = H - 2.2;
  g.add(pole(1, 0.04, metal(), H - 1), ball);
  const lamps: THREE.Sprite[] = [];
  for (const side of [-1, 1]) {
    const lamp = kit.glowSprite(side < 0 ? color : CYAN, 3, 0.8);
    lamp.position.set(side * (hw - 1.5), H - 0.6, 0.4);
    lamps.push(lamp);
    g.add(lamp);
  }
  const phase = s * 0.07;
  f.animated.push((time) => {
    ball.rotation.y = time * 0.8 + phase;
    const k = music.kick(time);
    lamps.forEach((l) => l.scale.setScalar(3 * (0.7 + 0.5 * k)));
  });
  g.position.set(fr.x, fr.y, fr.z);
  g.rotation.y = fr.heading;
  f.g.add(g);
}

/** Props strewn either side of the field, in the band 3 to 20 m off the road. */
function strew(f: Field, kinds: [number, kit.Prop][], spacing = 14, o: Partial<kit.ScatterOptions> = {}): void {
  const clear = kinds.map(([w, prop]): [number, kit.Prop] => [w, (rand, site) => (f.stands.some((q) => Math.hypot(site.x - q.x, site.z - q.z) < q.r) ? new THREE.Group() : prop(rand, site))]);
  f.g.add(kit.scatter({ track: f.track, ribbon: f.ribbon, from: f.from, to: f.to, spacing: spacing * 0.75, band: [3.5, 20], scale: [1.2, 2], kinds: clear, seed: f.seed, ...o }));
}

const CONFETTI = once(() => new THREE.BoxGeometry(0.5, 0.04, 0.3));
const STICK = once(() => new THREE.CylinderGeometry(0.06, 0.06, 0.9, 5));
const CUP = once(() => new THREE.CylinderGeometry(0.3, 0.22, 0.6, 7));
const TUFT = once(() => new THREE.ConeGeometry(0.22, 0.8, 4));
/** The ground underfoot, four layers in one draw call each: confetti, glowsticks, cups, and long grass at the turf's edge. */
function litter(f: Field, density = 1): void {
  const base = { track: f.track, ribbon: f.ribbon, from: f.from, to: f.to };
  f.g.add(
    kit.scatterInstanced({ ...base, spacing: 1.1 / density, band: [2.5, 26], geometry: CONFETTI(), material: kit.lit(0xffffff), colors: [MAGENTA, CYAN, ACID, VIOLET, 0xffffff], lift: 0.05, scale: [0.8, 1.6], seed: f.seed + 3 }),
    kit.scatterInstanced({ ...base, spacing: 3 / density, band: [2.5, 18], geometry: STICK(), material: kit.lit(0xffffff), colors: [ACID, MAGENTA, CYAN], lift: 0.08, tilt: 1.5, seed: f.seed + 5 }),
    kit.scatterInstanced({ ...base, spacing: 4 / density, band: [2.5, 16], geometry: CUP(), material: kit.matte(0xffffff), colors: [0xd8202a, 0xf0f0f0, 0x2a6ad8], lift: 0.3, tilt: 0.4, seed: f.seed + 7 }),
    kit.scatterInstanced({ ...base, spacing: 1.6 / density, band: [2.5, 24], geometry: TUFT(), material: kit.matte(0xffffff), colors: [0x2a6a3a, 0x3a8a4a, 0x1a4a2a], lift: 0.4, stretchY: [0.6, 1.6], seed: f.seed + 9 }),
  );
}

/** A crowd of ravers along the road, jumping on the beat, glowsticks up. */
function ravers(f: Field, side: 'left' | 'right', from: number, to: number, motion: 'bob' | 'sway' | 'jump' | 'wave', near = 7, rows = 2): void {
  f.g.add(kit.crowd({ track: f.track, ribbon: f.ribbon, from, to, side, rows, spacing: 1.8, band: [near, near + 0.4], motion, beat: music, clothes: [0x2a1a4a, 0x4a1a3a, 0x1a2a4a, 0x3a3a3a, 0xe8e8e8], skin: 0xd8a888, height: 1.8, lights: { color: RAVE[(f.seed + (side === 'left' ? 0 : 1)) % RAVE.length], every: 2, size: 1 }, seed: f.seed + (side === 'left' ? 1 : 2) }, f.animated).group);
}

/** Motes over the field at `frac`: confetti, drops or sparks. */
function air(f: Field, frac: number, color: number, drift: 'fall' | 'rise' | 'float' | 'swirl', count = 160, radius = 40, height = 24, y = 0): void {
  const m = kit.motes({ count, radius, height, color, drift, size: 0.5, glow: true, seed: f.seed + Math.round(frac * 100) }, f.animated);
  const at = kit.offRoad(f.ribbon, along(f, frac), 0);
  m.position.set(at.x, y, at.z);
  f.g.add(m);
}

/** What the VJ puts on a screen: an equaliser, rings going out, an eye, a tear, a hand held up. */
type Visual = 'eq' | 'rings' | 'eye' | 'tear' | 'hand';
const visuals = new Map<string, THREE.CanvasTexture>();
/** A screen's face with no words on it: `visual` in glowing colour on black, made once per look. */
function visualFace(visual: Visual, color: number): THREE.CanvasTexture {
  const key = `${visual}|${color}`;
  const made = visuals.get(key);
  if (made) return made;
  const W = 512;
  const H = 256;
  const [c, ctx] = kit.canvas(W, H);
  ctx.fillStyle = '#06040c';
  ctx.fillRect(0, 0, W, H);
  const col = hex(color);
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  const cx = W / 2;
  const cy = H / 2;
  ctx.beginPath();
  if (visual === 'eq') {
    for (let k = 0; k < 12; k++) {
      const v = 0.25 + 0.7 * Math.abs(Math.sin(k * 1.7 + 0.4));
      ctx.fillRect(28 + k * 39, H - 24 - v * 190, 26, v * 190);
    }
  } else if (visual === 'rings') {
    for (const r of [24, 56, 88, 118]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (visual === 'eye') {
    ctx.ellipse(cx, cy, 170, 80, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 44, 0, Math.PI * 2);
    ctx.fill();
  } else if (visual === 'tear') {
    ctx.moveTo(cx, 26);
    ctx.bezierCurveTo(cx + 40, 110, cx + 70, 150, cx, H - 26);
    ctx.bezierCurveTo(cx - 70, 150, cx - 40, 110, cx, 26);
    ctx.fill();
  } else {
    // A hand held up: a palm and four fingers and a thumb.
    ctx.fillRect(cx - 50, cy - 10, 100, 100);
    for (let k = 0; k < 4; k++) ctx.fillRect(cx - 50 + k * 27, cy - 100, 20, 95);
    ctx.save();
    ctx.translate(cx + 50, cy + 30);
    ctx.rotate(-0.7);
    ctx.fillRect(0, -12, 70, 24);
    ctx.restore();
  }
  const t = kit.canvasTexture(c, false);
  visuals.set(key, t);
  return t;
}

/** A giant screen on two legs, the VJ's visual lit: a mid-ground set piece, pumping on the beat. */
function jumbotron(f: Field, visual: Visual, w = 22, color = MAGENTA): THREE.Object3D {
  const body = new THREE.Group();
  const h = w * 0.55;
  const legs = 6;
  const face = kit.signPanel(w, visualFace(visual, color), { h, depth: 1, frame: metal() });
  face.position.y = legs + h / 2;
  body.add(face, pole(legs, 0.5, metal()).translateX(-w * 0.3), pole(legs, 0.5, metal()).translateX(w * 0.3));
  return kit.setPiece({ body, base: 'plinth', baseColor: 0x1a1824, baseWidth: w * 0.9, glow: { color, size: w * 0.9, y: legs + h / 2, opacity: 0.14 }, beat: music }, f.animated);
}

/** A tower of speakers with a laser on top. */
function noiseTower(f: Field, color: number): THREE.Object3D {
  const body = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    for (const x of [-3, 3]) {
      const sp = speaker(f.p, 5, color);
      sp.position.set(x, k * 5, 0);
      body.add(sp);
    }
  }
  const l = laser(f.p, color, 60, f.seed * 0.1);
  l.position.y = 15;
  body.add(l);
  return kit.setPiece({ body, base: 'plinth', baseColor: 0x1a1824, glow: { color, size: 24, y: 9, opacity: 0.16 }, beat: music }, f.animated);
}

/** A cloud of vapour: the floating stretch's, white sprites drifting up. */
function vapour(f: Field, frac: number, y: number): void {
  const at = kit.offRoad(f.ribbon, along(f, frac), 0);
  const g = new THREE.Group();
  const rand = seededRandom(f.seed + Math.round(frac * 1000));
  const puffs: { s: THREE.Sprite; ph: number; x: number; z: number }[] = [];
  for (let k = 0; k < 14; k++) {
    const s = kit.smokeSprite(k % 3 ? 0xe8e0ff : 0xffb0e0, 12 + rand() * 12, 0.25);
    const x = (rand() - 0.5) * 60;
    const z = (rand() - 0.5) * 60;
    puffs.push({ s, ph: rand() * 20, x, z });
    g.add(s);
  }
  f.animated.push((time) => {
    for (const q of puffs) {
      const u = ((time * 0.05 + q.ph) % 1 + 1) % 1;
      q.s.position.set(q.x, y + u * 30, q.z);
      q.s.material.opacity = 0.3 * Math.sin(Math.PI * u);
    }
  });
  g.position.set(at.x, 0, at.z);
  f.g.add(g);
}

/** A ring of giant cones of light from the ground, sweeping the sky: searchlights. */
function searchlights(f: Field, frac: number, away: number, color: number): void {
  const s = along(f, frac);
  for (const side of [-1, 1] as const) {
    const at = kit.beside(f.ribbon, s, side, away);
    if (kit.clearance(f.track, at.x, at.z) < 4) continue;
    const g = new THREE.Group();
    g.add(slab(2, 1.2, 2, metal(), 0, 0.6, 0));
    const l = laser(f.p, color, 90, side + f.seed);
    l.position.y = 1.2;
    (l.children[0] as THREE.Mesh).scale.set(0.6, 90, 0.6);
    g.add(l);
    g.position.set(at.x, 0, at.z);
    f.g.add(g);
  }
}

/** A giant thought bubble wilting on its stalk: perish to my thoughts. */
function wiltingThought(f: Field): THREE.Object3D {
  const body = new THREE.Group();
  const mat = own(0xe8e0ff, 0.7);
  for (let k = 0; k < 7; k++) {
    const b = new THREE.Mesh(BALL(), mat);
    b.scale.setScalar(3 + (k % 3));
    b.position.set((k - 3) * 3.2, 20 + Math.sin(k * 1.7) * 2, 0);
    body.add(b);
  }
  const stalk = pole(16, 0.4, metal());
  body.add(stalk);
  f.animated.push((time) => {
    body.rotation.z = 0.25 * Math.sin(time * 0.4) - 0.15;
    mat.opacity = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(time * 0.5));
  });
  return kit.setPiece({ body, base: 'ring', baseColor: 0x2a2440, baseWidth: 24, glow: { color: VIOLET, size: 30, y: 20, opacity: 0.14 }, beat: music }, f.animated);
}

/** A giant needle standing in the turf with its thread looping off to a spool. */
function giantNeedle(f: Field): THREE.Object3D {
  const body = new THREE.Group();
  const shaft = pole(26, 0.7, chrome(), 2);
  const tip = new THREE.Mesh(CONE(), chrome());
  tip.scale.set(0.7, 3, 0.7);
  tip.rotation.x = Math.PI;
  tip.position.y = 1.5;
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.25, 6, 14), chrome());
  eye.position.y = 26;
  const thread = new THREE.Mesh(new THREE.TorusGeometry(10, 0.2, 5, 40, Math.PI), kit.lit(MAGENTA));
  thread.position.set(10, 26, 0);
  const sp = spool(MAGENTA, 3);
  sp.position.set(20, 0, 0);
  body.add(shaft, tip, eye, thread, sp);
  body.rotation.z = 0.15;
  return kit.setPiece({ body, base: 'mound', baseColor: 0x1a3a22, glow: { color: MAGENTA, size: 24, y: 18, opacity: 0.12 }, bob: 0.6, period: 60 / NEEDLE_BPM, beat: music }, f.animated);
}

/** A giant runner, mid-stride, legs scissoring: running away. */
function giantRunner(f: Field, color: number): THREE.Object3D {
  const body = new THREE.Group();
  const mat = kit.matte(color, { emissive: color & 0x3f3f3f });
  const torso = slab(3, 7, 2, mat, 0, 13, 0);
  torso.rotation.x = 0.25;
  const head = new THREE.Mesh(BALL(), skin());
  head.scale.setScalar(1.8);
  head.position.set(0, 18.2, 1.2);
  const legs: THREE.Object3D[] = [];
  const arms: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 1, 9.5, 0);
    hip.add(slab(1.2, 9, 1.2, mat, 0, -4.5, 0));
    legs.push(hip);
    const sh = new THREE.Group();
    sh.position.set(side * 2, 15.5, 0.5);
    sh.add(slab(0.9, 6, 0.9, skin(), 0, -3, 0));
    arms.push(sh);
    body.add(hip, sh);
  }
  body.add(torso, head);
  f.animated.push((time) => {
    const a = music.sway(time, 2);
    legs.forEach((l, k) => (l.rotation.x = (k ? 1 : -1) * 0.7 * a));
    arms.forEach((l, k) => (l.rotation.x = (k ? -1 : 1) * 0.9 * a));
  });
  return kit.setPiece({ body, base: 'plinth', baseColor: 0x1a1824, glow: { color, size: 26, y: 12, opacity: 0.12 }, beat: music }, f.animated);
}

const FIELDS: Record<string, (f: Field) => void> = {
  // Don't take it personally, I begin to slide inward: the stadium's mouth, floodlights and speakers, the crowd either side, and down into the tunnel.
  "Don't Take It Personally"(f) {
    strew(f, [[3, f.P.speakerProp], [2, f.P.flood], [2, f.P.glowsticks], [1, f.P.laserRig]], 13);
    litter(f);
    ravers(f, 'left', f.from, f.from + 70, 'jump');
    ravers(f, 'right', f.from, f.from + 70, 'jump');
    words(f, 0.12, ["DON'T TAKE IT PERSONALLY"], MAGENTA);
    midground(f, jumbotron(f, 'eq', 26), 0.3, 40, 16);
    air(f, 0.3, MAGENTA, 'fall', 200, 36, 22);
  },
  // Shatter the static silencing my mind; find the rhythm: screens of snow along the road, then the speakers.
  'Shatter the Static'(f) {
    strew(f, [[4, f.P.tv], [2, f.P.ball], [2, f.P.speakerProp], [1, f.P.cones]], 12);
    litter(f);
    midground(f, jumbotron(f, 'rings', 22, CYAN), 0.3, 40, 15);
    air(f, 0.4, 0xe8f8ff, 'swirl', 160, 34, 18);
  },
  // Set course to collide: round the loop, the balls swinging into each other inside it, speakers keeping the rhythm.
  'Set Course to Collide'(f) {
    strew(f, [[6, f.P.speakerProp], [2, f.P.laserRig], [1, f.P.flood]], 11);
    litter(f);
    ravers(f, 'left', f.from + 10, f.to - 10, 'jump', 6, 3);
    mirrorTruss(f, 0.2);
    midground(f, noiseTower(f, MAGENTA), 0.6, 36, 14);
    searchlights(f, 0.5, 30, VIOLET);
    air(f, 0.5, VIOLET, 'float', 180, 40, 20);
  },
  // My hands are disappearing, dissolving in a tear, I am not needed here: dancers with their hands up, the hands fading, drops falling.
  'My Hands Are Disappearing'(f) {
    strew(f, [[4, f.P.dancers], [2, f.P.glowsticks], [2, f.P.speakerProp], [1, f.P.flood]], 13);
    litter(f);
    ravers(f, 'right', f.from + 10, f.to - 40, 'wave', 7, 2);
    midground(f, jumbotron(f, 'hand', 20, VIOLET), 0.6, 40, 15);
    air(f, 0.85, CYAN, 'fall', 200, 36, 30);
  },
  // Starting to feel something, I think I'm taking off: up the climb, searchlights pointing the way, lights rising.
  "I Think I'm Taking Off"(f) {
    strew(f, [[3, f.P.flood], [2, f.P.laserRig], [2, f.P.speakerProp], [1, f.P.cones]], 13);
    litter(f);
    mirrorTruss(f, 0.2, ACID);
    searchlights(f, 0.6, 24, ACID);
    midground(f, jumbotron(f, 'eye', 20, ACID), 0.5, 40, 15);
    air(f, 0.5, ACID, 'rise', 200, 40, 40);
  },
  // Will I evaporate? Round the top on the floating deck, vapour rising off it, the stadium's lights below.
  'Will I Evaporate?'(f) {
    strew(f, [[3, f.P.flood], [2, f.P.laserRig], [2, f.P.speakerProp]], 18, { band: [10, 30], clear: 6 });
    litter(f, 0.6);
    mirrorTruss(f, 0.3, 0xe8e0ff);
    vapour(f, 0.3, 0);
    vapour(f, 0.75, 0);
    midground(f, wiltingThought(f), 0.6, 44, 16);
    air(f, 0.5, 0xffffff, 'rise', 260, 60, 40);
  },
  // I've got a bird's eye view, I have shed my skin, look at me now: the deck across the middle, high over the roads below.
  "I've Got a Bird's Eye View"(f) {
    strew(f, [[3, f.P.flood], [3, f.P.speakerProp], [2, f.P.laserRig]], 16, { band: [8, 30], clear: 6 });
    searchlights(f, 0.4, 20, CYAN);
    air(f, 0.5, CYAN, 'float', 220, 50, 30, 4);
  },
  // Intra intrasport, perish to my thoughts, my hand is on the gun: the thoughts wilting, the starter's pistol up.
  'Perish to My Thoughts'(f) {
    strew(f, [[3, f.P.bubble], [2, f.P.hurdle], [2, f.P.speakerProp], [1, f.P.flood]], 13);
    litter(f);
    mirrorTruss(f, 0.1, MAGENTA);
    midground(f, wiltingThought(f), 0.3, 40, 16);
    air(f, 0.5, 0xe8e0ff, 'fall', 160, 40, 24);
  },
  // Get to me before my face splashes in the sky; I used to dream: off the ramp under the face, down past the ring, the crowd going off.
  'My Face Splashes in the Sky'(f) {
    strew(f, [[3, f.P.dancers], [2, f.P.speakerProp], [2, f.P.glowsticks], [1, f.P.laserRig]], 12);
    litter(f, 1.2);
    ravers(f, 'left', f.from + 60, f.to - 5, 'jump', 7, 3);
    mirrorTruss(f, 0.05, MAGENTA);
    searchlights(f, 0.2, 26, MAGENTA);
    air(f, 0.3, MAGENTA, 'fall', 220, 36, 34);
    air(f, 0.8, ACID, 'float', 200, 36, 18);
  },
  // Dreams that sew me up like sleeping with a needle: spools of thread, a needle stuck in the turf.
  'Dreams That Sew Me Up'(f) {
    strew(f, [[4, f.P.spoolProp], [2, f.P.speakerProp], [2, f.P.cones], [1, f.P.flood]], 12);
    litter(f);
    words(f, 0.4, ['SLEEPING WITH A NEEDLE'], MAGENTA);
    midground(f, giantNeedle(f), 0.65, 38, 16);
    air(f, 0.5, MAGENTA, 'swirl', 160, 36, 20);
  },
  // I feel a schism in the rhythm, now I'm running: the road splits round the hairpin, the runner inside it.
  'A Schism in the Rhythm'(f) {
    strew(f, [[3, f.P.speakerProp], [2, f.P.laserRig], [2, f.P.hurdle], [1, f.P.flood]], 12);
    litter(f);
    midground(f, giantRunner(f, CYAN), 0.5, 30, 14);
    air(f, 0.5, ACID, 'float', 200, 44, 24);
  },
  // My hair is liquifying, my tastebuds are igniting: lava lamps and braziers, the head melting, sparks rising.
  'My Hair Is Liquifying'(f) {
    strew(f, [[3, f.P.drip], [2, f.P.brazier], [2, f.P.speakerProp], [1, f.P.flood]], 12);
    litter(f);
    mirrorTruss(f, 0.12, VIOLET);
    midground(f, jumbotron(f, 'tear', 18, VIOLET), 0.4, 36, 14);
    air(f, 0.75, 0xff8a3a, 'rise', 220, 40, 30);
  },
  // It's true I am evolving, it's all relative; the feeling's on the floor; don't do it: hurdles, the march, the floor, and the line.
  "It's True I Am Evolving"(f) {
    strew(f, [[3, f.P.hurdle], [2, f.P.cones], [2, f.P.speakerProp], [1, f.P.flood], [1, f.P.ball]], 12);
    litter(f);
    ravers(f, 'right', f.to - 120, f.to - 10, 'jump', 7, 3);
    midground(f, giantRunner(f, ACID), 0.2, 36, 14);
    air(f, 0.8, MAGENTA, 'fall', 220, 40, 30);
  },
};

/** The sections a `raveField` can start in. */
export const FIELD_SECTIONS = Object.keys(FIELDS);

/**
 * One stretch of the lap dressed in layers: props strewn in the foreground,
 * confetti and glowsticks in the turf, a set piece in the mid-ground,
 * confetti, vapour or sparks in the air, and the song's words over the road.
 * Which stretch it is goes by the section at `s`.
 */
export function raveField(track: Track, ribbon: Ribbon, s: number, to: number, section: string, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const recipe = FIELDS[section];
  if (!recipe) return g;
  const p = pulse(animated);
  const stands = track.def.landmarks.filter((l) => ROOM[l.kind] !== undefined).map((l) => ({ ...kit.offRoad(track.main, l.s * track.main.scale, l.lateral ?? 0), r: ROOM[l.kind]! }));
  recipe({ track, ribbon, from: s, to, animated, g, p, P: props(p), seed: Math.round(s) + 17, stands });
  return g;
}

/**
 * The stadium round the world: the stands in a ring, lit floodlight towers
 * among them, lasers sweeping off their tops; and on the final lap, the
 * cup's last, fireworks going up all round.
 */
export function stadiumSkyline(track: Track, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  g.add(kit.skyline({ track, shapes: [[5, 'block'], [2, 'tower'], [1, 'stack']], color: 0x16121e, windows: MAGENTA, lit: 0.45, beacons: { color: CYAN, every: 2 }, count: 60, height: [30, 90], width: [30, 60], gap: 20, depth: 140 }, animated));
  const p = pulse(animated);
  const B = track.def.bounds;
  const corners: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]];
  corners.forEach(([cx, cz], k) => {
    const tower = floodlight(p, 50);
    tower.scale.setScalar(1.6);
    tower.position.set(cx * (B + 12), 0, cz * (B + 12));
    kit.faceToward(tower, 0, 0);
    const l = laser(p, RAVE[k % RAVE.length], 260, k * 1.3, 0.5);
    l.position.y = 50;
    tower.add(l);
    g.add(tower);
  });
  // Fireworks: bursts of sparks over the stands, on every bar of the final lap.
  const bursts: { pts: THREE.Points; mat: THREE.PointsMaterial; ph: number }[] = [];
  const rand = seededRandom(9171);
  for (let k = 0; k < 10; k++) {
    const n = 90;
    const dirs = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const b = Math.acos(2 * rand() - 1);
      dirs.set([Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(dirs.slice(), 3));
    geo.userData.dirs = dirs;
    const mat = new THREE.PointsMaterial({ color: RAVE[k % RAVE.length], size: 2.4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    const a = (k / 10) * Math.PI * 2;
    pts.position.set(Math.cos(a) * (B - 20), 70 + rand() * 40, Math.sin(a) * (B - 20));
    pts.frustumCulled = false;
    bursts.push({ pts, mat, ph: rand() * 4 });
    g.add(pts);
  }
  animated.push((time) => {
    const on = kit.finalLap();
    for (const b of bursts) {
      const bars = (time * NEEDLE_BPM) / 60 / 4 + b.ph;
      const u = bars - Math.floor(bars);
      const r = 4 + 36 * Math.sqrt(u);
      const pos = b.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
      const dirs = b.pts.geometry.userData.dirs as Float32Array;
      if (on > 0.01) {
        for (let i = 0; i < pos.count; i++) pos.setXYZ(i, dirs[i * 3] * r, dirs[i * 3 + 1] * r - 12 * u * u, dirs[i * 3 + 2] * r);
        pos.needsUpdate = true;
      }
      b.mat.opacity = on * (1 - u);
    }
  });
  return g;
}

// Landmarks.

/** A landmark group stood at a road point, turned to the road's heading. */
function atRoad(g: THREE.Group, ribbon: Ribbon, s: number): THREE.Group {
  const f = kit.frameAt(ribbon, s);
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A landmark stood `lateral` metres off the road at `s` on the ground, `scale` times its built size, turned to face the karts coming at it. */
function offRoadFacing(g: THREE.Group, ribbon: Ribbon, s: number, lateral: number, scale = 1): THREE.Group {
  g.scale.setScalar(scale);
  kit.standBeside(g, ribbon, s, lateral);
  return g;
}

/** The start: the road runs out of the stadium's gate under its scoreboard, INTRASPORT in lights, floodlight towers either side and lasers off them. */
export function stadiumGate(ribbon: Ribbon, s: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const hw = ribbon.halfWidthAtS(s) + 3;
  const H = 14;
  for (const side of [-1, 1]) {
    g.add(slab(4, H + 8, 4, metal(), side * (hw + 2), (H + 8) / 2, 0));
    const tower = floodlight(p, H + 12);
    tower.position.set(side * (hw + 2), 0, -2);
    g.add(tower);
    const l = laser(p, side < 0 ? MAGENTA : CYAN, 120, side * 2, 0.8);
    l.position.set(side * (hw + 2), H + 8, 0);
    g.add(l);
    const stack = speaker(p, 6, side < 0 ? MAGENTA : CYAN);
    stack.position.set(side * (hw + 7), 0, 2);
    g.add(stack);
  }
  const board = kit.signPanel(2 * hw + 8, kit.textFace(['INTRASPORT'], { style: 'neon', bg: '#06040c', fg: '#fff4fa', glow: hex(MAGENTA), width: 1024, height: 256 }), { h: 7, depth: 1.2, frame: metal() });
  board.position.y = H + 3.5;
  g.add(board);
  // The scoreboard's lights chasing along under it, cycling colour on the beat.
  for (let k = 0; k < 12; k++) {
    const mat = own(RAVE[k % 4]);
    p.cyclers.push({ mat, offset: k });
    g.add(slab(1.4, 0.6, 0.3, mat, -hw - 2 + ((2 * hw + 4) * (k + 0.5)) / 12, H - 0.6, 0.7));
  }
  const glow = halo(p, MAGENTA, 50, 0.25);
  glow.position.y = H + 4;
  g.add(glow);
  return atRoad(g, ribbon, s);
}

/** Shatter the static: a wall of screens full of snow, seething, one cracked across, on a gantry. */
export function staticWall(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const tex = staticTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(2, 2);
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const x = (c - 1.5) * 7;
      const y = 4 + r * 5.5;
      g.add(slab(6.6, 5.2, 3, black(), x, y, -1.5));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 4.4), mat);
      face.position.set(x, y, 0.02);
      g.add(face);
    }
  }
  // The crack: a jagged lit line across the wall.
  const crack = new THREE.Group();
  let x = -14;
  let y = 14;
  const rand = seededRandom(9181);
  while (x < 14) {
    const nx = x + 2 + rand() * 3;
    const ny = y - 1.5 + rand() * 3 - (x > 0 ? 1 : 0);
    const len = Math.hypot(nx - x, ny - y);
    const seg = slab(len, 0.25, 0.2, kit.lit(0xffffff), (x + nx) / 2, (y + ny) / 2, 0.2);
    seg.rotation.z = Math.atan2(ny - y, nx - x);
    crack.add(seg);
    x = nx;
    y = ny;
  }
  g.add(crack);
  const glow = halo(p, 0xe8f8ff, 40, 0.2);
  glow.position.y = 10;
  g.add(glow);
  animated.push((time) => {
    tex.offset.set(Math.floor(time * 30) * 0.37 % 1, Math.floor(time * 30) * 0.61 % 1);
    crack.visible = music.kick(time) > 0.3;
  });
  return offRoadFacing(g, ribbon, s, lateral, 1.4);
}

/** Collision course: two giant balls on ropes from a frame, swinging into each other on every other beat, a flash where they meet. */
export function ballCollision(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const H = 22;
  g.add(slab(1, H, 1, metal(), -12, H / 2, 0), slab(1, H, 1, metal(), 12, H / 2, 0), slab(25, 1, 1, metal(), 0, H, 0));
  const swings: THREE.Group[] = [];
  const balls = [kit.matte(0xe86a1a, { emissive: 0x401800 }), white()];
  [-1, 1].forEach((side, k) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 3.2, H, 0);
    const rope = pole(14, 0.1, metal(), -14);
    const ball = new THREE.Mesh(BALL(), balls[k]);
    ball.scale.setScalar(3.2);
    ball.position.y = -17;
    pivot.add(rope, ball);
    swings.push(pivot);
    g.add(pivot);
  });
  const flash = halo(p, ACID, 16, 0);
  flash.position.y = H - 17;
  g.add(flash);
  animated.push((time) => {
    // Out on the off-beat, together on the beat: a bar of two collisions.
    const k = music.pulse(time / 2);
    const a = 0.75 * (1 - k);
    swings[0].rotation.z = -a;
    swings[1].rotation.z = a;
    flash.material.opacity = 0.9 * music.kick(time / 2, 0, 12);
  });
  return offRoadFacing(g, ribbon, s, lateral, 1.5);
}

/** Find the rhythm: a wall of speakers, three high and five across, cones pumping, a laser off the top. */
export function speakerStack(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    const sp = speaker(p, 6, r === 1 ? CYAN : MAGENTA);
    sp.position.set((c - 2) * 4, r * 6, 0);
    g.add(sp);
  }
  for (const x of [-8, 8]) {
    const l = laser(p, x < 0 ? MAGENTA : ACID, 100, x, 0.9);
    l.position.set(x, 18, 0);
    g.add(l);
  }
  const glow = halo(p, MAGENTA, 46, 0.3);
  glow.position.y = 10;
  g.add(glow);
  return offRoadFacing(g, ribbon, s, lateral, 1.5);
}

/** My hands are disappearing: five giant hands raised out of the turf, each fading away and back in turn. */
export function raveHands(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const mats: THREE.MeshBasicMaterial[] = [];
  for (let k = 0; k < 5; k++) {
    const mat = own(RAVE[k % 4], 0.8);
    mats.push(mat);
    const h = hand(mat, 10 + (k % 2) * 4);
    h.position.set((k - 2) * 8, 0, (k % 2) * 3);
    h.rotation.y = (k - 2) * 0.12;
    g.add(h);
  }
  const glow = halo(p, VIOLET, 40, 0.25);
  glow.position.y = 10;
  g.add(glow);
  animated.push((time) => mats.forEach((m, k) => (m.opacity = 0.08 + 0.85 * Math.max(0, Math.sin(time * 0.8 + k * 1.25)) ** 2)));
  return offRoadFacing(g, ribbon, s, lateral, 1.5);
}

/** A tear dissolving: a giant tear hanging in the air over its puddle, bobbing, drops falling off it. */
export function tearDrop(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const mat = new THREE.MeshPhongMaterial({ color: 0x8adfff, emissive: 0x104a6a, specular: 0xffffff, shininess: 100, transparent: true, opacity: 0.75 });
  const tear = new THREE.Group();
  const bulb = new THREE.Mesh(BALL(), mat);
  bulb.scale.setScalar(5);
  const top = new THREE.Mesh(CONE(), mat);
  top.scale.set(4.6, 8, 4.6);
  top.position.y = 5.6;
  tear.add(bulb, top);
  tear.position.y = 16;
  g.add(tear);
  const puddle = kit.lightPool(CYAN, 12, 0.4);
  g.add(puddle);
  const drops = kit.motes({ count: 80, radius: 5, height: 14, color: 0x8adfff, drift: 'fall', speed: 5, size: 0.6, glow: true, seed: 9191 }, animated);
  g.add(drops);
  const glow = halo(p, CYAN, 30, 0.3);
  glow.position.y = 16;
  g.add(glow);
  animated.push((time) => {
    tear.position.y = 16 + Math.sin(time * 0.8) * 1.2;
    const k = 1 - 0.12 * (0.5 + 0.5 * Math.sin(time * 0.35));
    tear.scale.setScalar(k);
    mat.opacity = 0.45 + 0.35 * k;
  });
  return offRoadFacing(g, ribbon, s, lateral, 1.7);
}

/** The floating deck: posts down both edges with lights chasing along them, and vapour hanging under it. */
export function floatDeck(ribbon: Ribbon, s: number, to: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const lights: THREE.Sprite[] = [];
  let k = 0;
  for (let d = s; d < to; d += 20, k++) {
    const f = kit.frameAt(ribbon, d);
    const hw = ribbon.halfWidthAtS(d);
    for (const side of [-1, 1]) {
      const at = kit.offRoad(ribbon, d, side * (hw + 0.8));
      const post = pole(4, 0.18, metal());
      post.position.set(at.x, f.y + 2, at.z);
      const l = kit.glowSprite(RAVE[k % 4], 2.4, 0.9);
      l.position.set(at.x, f.y + 4.3, at.z);
      g.add(post, l);
      lights.push(l);
    }
    if (k % 3 === 0 && f.y > 4) {
      const puff = kit.smokeSprite(0xe8e0ff, 20, 0.25);
      puff.position.set(f.x, f.y - 3, f.z);
      g.add(puff);
    }
  }
  animated.push((time) => lights.forEach((l, n) => (l.material.opacity = 0.25 + 0.6 * Math.max(0, Math.sin(time * 6 - Math.floor(n / 2) * 0.7)) * (0.6 + 0.4 * music.kick(time)))));
  return g;
}

/** Gun in hand: a giant hand holding the starter's pistol up, smoke puffing from it on the first beat of every bar. */
export function starterPistol(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const arm = slab(3, 18, 3, skin(), 0, 9, 0);
  const fist = slab(4.4, 4, 4, skin(), 0, 19, 0);
  const grip = slab(2, 5, 3, black(), 0, 21, 1.2);
  grip.rotation.x = -0.3;
  const barrel = slab(2.2, 2.2, 9, metal(), 0, 24, 3.5);
  barrel.rotation.x = -0.9;
  g.add(arm, fist, grip, barrel);
  const smoke = kit.smokeSprite(0xffffff, 8, 0.7);
  const flash = halo(p, ACID, 14, 0);
  const muzzle = new THREE.Vector3(0, 28, 7);
  smoke.position.copy(muzzle);
  flash.position.copy(muzzle);
  g.add(smoke, flash);
  const glow = halo(p, ACID, 30, 0.2);
  glow.position.y = 20;
  g.add(glow);
  animated.push((time) => {
    const u = music.phase(time / 4);
    smoke.scale.setScalar(4 + 18 * u);
    smoke.position.set(0, muzzle.y + 6 * u, muzzle.z + 4 * u);
    smoke.material.opacity = 0.7 * (1 - u);
    flash.material.opacity = Math.exp(-u * 30);
  });
  return offRoadFacing(g, ribbon, s, lateral, 1.7);
}

/** The face splashing in the sky: a giant face of light hung over the ramp, its paint splashing off it on the beat. */
export function skyFace(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const [c, ctx] = kit.canvas(512);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 512, 512);
  const grad = ctx.createRadialGradient(256, 256, 40, 256, 256, 240);
  grad.addColorStop(0, '#ffd0f0');
  grad.addColorStop(0.7, '#ff3aa8');
  grad.addColorStop(1, 'rgba(255,58,168,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(256, 256, 200, 236, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a0830';
  for (const x of [180, 332]) {
    ctx.beginPath();
    ctx.ellipse(x, 210, 34, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#3af0ff';
  for (const x of [180, 332]) {
    ctx.beginPath();
    ctx.arc(x, 210, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#1a0830';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.ellipse(256, 340, 70, 40, 0, 0, Math.PI);
  ctx.stroke();
  const tex = kit.canvasTexture(c, false);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), mat);
  face.position.y = 46;
  // Faces the karts coming up the ramp.
  face.rotation.y = Math.PI;
  g.add(face);
  const splash = kit.swarm({ count: 160, radius: 30, height: 30, color: MAGENTA, size: 1.2, speed: 0.4, seed: 9201 }, animated);
  splash.position.y = 32;
  g.add(splash);
  const splash2 = kit.swarm({ count: 100, radius: 30, height: 30, color: CYAN, size: 1, speed: 0.5, seed: 9202 }, animated);
  splash2.position.y = 32;
  g.add(splash2);
  animated.push((time) => {
    const k = music.kick(time);
    face.scale.setScalar(1 + 0.06 * k);
    mat.opacity = 0.7 + 0.3 * k;
    face.position.y = 46 + Math.sin(time * 0.5) * 2;
  });
  const lift = atRoad(g, ribbon, s);
  if (lateral) lift.translateX(-lateral);
  return lift;
}

/** Feeling on the floor: a dance floor of lit tiles changing colour on the beat, a mirror ball turning over it, dancers on it. */
export function mirrorFloor(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const N = 6;
  const T = 3.6;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const mat = own(RAVE[(i + j) % 4]);
    p.cyclers.push({ mat, offset: (i * 3 + j * 5) % 4 });
    g.add(slab(T - 0.2, 0.3, T - 0.2, mat, (i - (N - 1) / 2) * T, 0.15, (j - (N - 1) / 2) * T));
  }
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 1), chrome());
  ball.position.y = 18;
  g.add(ball, pole(6, 0.08, metal(), 21));
  const spots = new THREE.Group();
  for (let k = 0; k < 10; k++) {
    const sp = kit.glowSprite(RAVE[k % 4], 2.5, 0.8);
    const a = (k / 10) * Math.PI * 2;
    sp.position.set(Math.cos(a) * 9, 4 + (k % 3) * 4, Math.sin(a) * 9);
    spots.add(sp);
  }
  g.add(spots);
  for (let k = 0; k < 7; k++) {
    const f = figure(RAVE[k % 4], 1.1);
    const a = (k / 7) * Math.PI * 2;
    f.position.set(Math.cos(a) * 6, 0.3, Math.sin(a) * 6);
    const holder = new THREE.Group();
    holder.add(f);
    animated.push((time) => (holder.position.y = 0.5 * music.pulse(time, k * 0.13)));
    g.add(holder);
  }
  const glow = halo(p, MAGENTA, 34, 0.25);
  glow.position.y = 6;
  g.add(glow);
  animated.push((time) => {
    ball.rotation.y = time * 0.8;
    spots.rotation.y = time * 0.5;
  });
  return offRoadFacing(g, ribbon, s, lateral, 1.25);
}

/** Dreams of violence: a boxing ring under a spotlight, two fighters trading blows on the beat. */
export function boxingRing(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const W = 12;
  g.add(slab(W, 1.4, W, kit.matte(0x2a2a8a), 0, 0.7, 0));
  for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(pole(4, 0.25, kit.lit(x * z > 0 ? 0xff3a3a : 0x3a6aff), 1.4).translateX((x * W) / 2).translateZ((z * W) / 2));
  for (const y of [2.4, 3.4, 4.4]) {
    for (const [x, z, w, d] of [[0, W / 2, W, 0.1], [0, -W / 2, W, 0.1], [W / 2, 0, 0.1, W], [-W / 2, 0, 0.1, W]] as const) g.add(slab(w, 0.1, d, kit.lit(0xf0f0f0), x, y, z));
  }
  const fighters: THREE.Group[] = [];
  [0xd8202a, 0x2a6ad8].forEach((c, k) => {
    const f = figure(c, 2);
    const glove = new THREE.Mesh(BALL(), kit.matte(c));
    glove.scale.setScalar(0.35);
    glove.position.set(0.3, 1.6, 0.6);
    f.add(glove);
    const holder = new THREE.Group();
    holder.position.set(k ? 2 : -2, 1.4, 0);
    holder.rotation.y = k ? -Math.PI / 2 : Math.PI / 2;
    holder.add(f);
    fighters.push(holder);
    g.add(holder);
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2, 9, 34, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.position.y = 17;
  g.add(beam);
  const glow = halo(p, 0xff3a3a, 26, 0.22);
  glow.position.y = 6;
  g.add(glow);
  animated.push((time) => {
    const a = music.sway(time, 2);
    fighters[0].position.x = -2 + 0.9 * Math.max(0, a);
    fighters[1].position.x = 2 - 0.9 * Math.max(0, -a);
  });
  return offRoadFacing(g, ribbon, s, lateral, 1.9);
}

/** Needle sewing dreams: a tower of giant thread spools, turning, threads running off them. */
export function spoolTower(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const spools: THREE.Group[] = [];
  [MAGENTA, CYAN, ACID].forEach((c, k) => {
    const sp = spool(c, 3.2 - k * 0.5);
    sp.position.y = k * 6.4;
    spools.push(sp);
    g.add(sp);
    const thread = new THREE.Mesh(new THREE.TorusGeometry(8 + k * 2, 0.15, 4, 30, Math.PI * 0.8), kit.lit(c));
    thread.position.set(6, 3 + k * 6.4, 0);
    thread.rotation.z = -0.4;
    g.add(thread);
  });
  const glow = halo(p, MAGENTA, 30, 0.25);
  glow.position.y = 10;
  g.add(glow);
  animated.push((time) => spools.forEach((sp, k) => (sp.rotation.y = time * (0.6 + k * 0.3) * (k % 2 ? -1 : 1))));
  return offRoadFacing(g, ribbon, s, lateral, 2);
}

/** My hair is liquifying, my tastebuds are igniting: a giant head, its hair running off it in long drips, its tongue out and alight. */
export function meltingHead(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const head = new THREE.Mesh(BALL(), skin());
  head.scale.set(8, 10, 8);
  head.position.y = 16;
  g.add(head, pole(8, 3, skin()));
  for (const x of [-3, 3]) {
    const eye = new THREE.Mesh(BALL(), kit.lit(0xffffff));
    eye.scale.set(1.4, 1, 0.6);
    eye.position.set(x, 18, 7.3);
    g.add(eye);
  }
  const drips: { m: THREE.Mesh; ph: number }[] = [];
  const hair = own(VIOLET);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const d = new THREE.Mesh(CYL(), hair);
    d.position.set(Math.cos(a) * 7.2, 0, Math.sin(a) * 7.2 - 0.5);
    g.add(d);
    drips.push({ m: d, ph: k * 0.7 });
  }
  const tongue = slab(4, 0.8, 6, kit.matte(0xe0405a, { emissive: 0x401020 }), 0, 9.5, 8);
  tongue.rotation.x = 0.3;
  g.add(tongue);
  const fire = kit.fire(animated, 0.4, { size: 2.2, colors: { outer: 0xff3a8a, mid: 0xff6a2a, core: 0xfff0a0 } });
  fire.position.set(0, 10, 10);
  g.add(fire);
  const glow = halo(p, VIOLET, 40, 0.22);
  glow.position.y = 16;
  g.add(glow);
  animated.push((time) => {
    for (const d of drips) {
      const len = 4 + 10 * (0.5 + 0.5 * Math.sin(time * 0.6 + d.ph));
      d.m.scale.set(0.7, len, 0.7);
      d.m.position.y = 24 - len / 2;
    }
  });
  return offRoadFacing(g, ribbon, s, lateral, 1.6);
}

/** Relative evolution: the march of progress, six figures from crawling to running, walking on the beat, lit from behind. */
export function evolutionMarch(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const sil = kit.matte(0x14101c);
  const walkers: THREE.Group[] = [];
  for (let k = 0; k < 6; k++) {
    const stoop = 1 - k / 5;
    const f = new THREE.Group();
    const h = 5 + k * 1.4;
    const torso = slab(1.4 + stoop, h * 0.45, 1.2, sil, 0, h * 0.62, 0);
    torso.rotation.x = stoop * 0.9;
    const head = new THREE.Mesh(BALL(), sil);
    head.scale.setScalar(0.9);
    head.position.set(0, h * 0.9 - stoop * 1.8, stoop * 2.2);
    f.add(torso, head, slab(0.6, h * 0.42, 0.6, sil, -0.5, h * 0.21, 0), slab(0.6, h * 0.42, 0.6, sil, 0.5, h * 0.21, 0));
    f.position.x = (k - 2.5) * 6;
    f.rotation.y = Math.PI / 2;
    walkers.push(f);
    g.add(f);
  }
  // The light behind them, a wall of it, cycling colour on the beat.
  const mat = own(ACID, 0.5, true);
  p.cyclers.push({ mat, offset: 0 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(42, 16), mat);
  wall.position.set(0, 8, -3);
  g.add(wall);
  const glow = halo(p, ACID, 40, 0.2);
  glow.position.y = 8;
  g.add(glow);
  animated.push((time) => walkers.forEach((w, k) => (w.position.y = 0.4 * music.pulse(time, k * 0.17))));
  return offRoadFacing(g, ribbon, s, lateral, 1.4);
}

/** Don't do it: a giant hand held up beside the line, the song's last words on the sign over it, throbbing red. */
export function stopHand(ribbon: Ribbon, s: number, lateral: number, animated: kit.Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pulse(animated);
  const palm = hand(kit.matte(0xe0a888, { emissive: 0x402018 }), 18);
  g.add(palm);
  const sign = kit.signPanel(14, kit.textFace(["DON'T", 'DO IT'], { style: 'neon', bg: '#1a0408', fg: '#ffe8e8', glow: '#ff2a3a' }), { h: 7, depth: 0.6, frame: metal() });
  sign.position.y = 26;
  g.add(sign, pole(26, 0.4, metal()).translateX(8));
  const glow = halo(p, 0xff2a3a, 34, 0.3);
  glow.position.y = 18;
  g.add(glow);
  return offRoadFacing(g, ribbon, s, lateral, 1.5);
}

// The hazard.

/**
 * Dreams that sew me up like sleeping with a needle: a gantry over the road, a spool of thread on
 * it, and the giant needle hung under it, stabbing down into the road on
 * the beat and stepping across between beats, its thread trailing to the
 * spool; the stitch it has just pulled out of glows to be threaded.
 */
export function needleParts(obj: THREE.Object3D): THREE.Object3D[] {
  const gantry = new THREE.Group();
  const posts = [pole(12, 0.35, metal()), pole(12, 0.35, metal())];
  const beam = slab(1, 0.8, 1.2, metal(), 0, 12, 0);
  const spoolTop = spool(MAGENTA, 1.4);
  spoolTop.rotation.z = Math.PI / 2;
  spoolTop.position.set(0, 13.4, 0);
  gantry.add(...posts, beam, spoolTop);
  const needle = new THREE.Group();
  const shaft = pole(9, 0.35, chrome(), 0.9);
  const tip = new THREE.Mesh(CONE(), chrome());
  tip.scale.set(0.35, 1.2, 0.35);
  tip.rotation.x = Math.PI;
  tip.position.y = 0.6;
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.1, 6, 12), chrome());
  eye.position.y = 9.6;
  const glow = kit.glowSprite(MAGENTA, 3, 0.6);
  glow.position.y = 0.5;
  needle.add(shaft, tip, eye, glow);
  const thread = new THREE.Mesh(CYL(), kit.lit(MAGENTA));
  const stitch = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.3, 16), new THREE.MeshBasicMaterial({ color: ACID, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  stitch.rotation.x = -Math.PI / 2;
  stitch.position.y = 0.15;
  // The seam sewn across the road: a dash at every stitch.
  const seam = new THREE.Group();
  for (let k = 0; k < NEEDLE_STITCHES; k++) {
    const dash = slab(1.6, 0.06, 0.25, kit.lit(MAGENTA), 0, 0.08, 0);
    seam.add(dash);
  }
  const parts = [gantry, needle, thread, stitch, seam];
  for (const o of parts) obj.add(o);
  return parts;
}

export function poseNeedle(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [gantry, needle, thread, stitch, seam] = parts;
  obj.position.set(p.ax, p.ground, p.az);
  obj.rotation.y = p.heading;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const lat = (p.x - p.ax) * -fz + (p.z - p.az) * fx;
  // The road's reach, from the stitch it went into: stitchLateral(k, reach) = reach * (2(k + 0.5)/N - 1).
  const unit = (2 * (p.lane + 0.5)) / NEEDLE_STITCHES - 1;
  const reach = Math.abs(unit) > 1e-3 ? p.gap / unit : 10;
  const [l, r] = gantry.children as THREE.Object3D[];
  l.position.x = reach + 3;
  r.position.x = -reach - 3;
  const beam = gantry.children[2];
  beam.scale.x = 2 * reach + 6;
  // In the road's frame, a lateral to the right is local -x.
  const y = p.y - p.ground;
  needle.position.set(-lat, y, 0);
  // Stabbing: it shudders as it goes in.
  needle.rotation.z = needleDown(p.phase) ? 0.03 * Math.sin(elapsed * 60) : 0;
  // The thread from the needle's eye up to the spool on the gantry.
  const ex = -lat;
  const ey = y + 9.6;
  const dx = 0 - ex;
  const dy = 13.4 - ey;
  thread.position.set(ex + dx / 2, ey + dy / 2, 0);
  thread.scale.set(0.06, Math.hypot(dx, dy), 0.06);
  thread.rotation.z = -Math.atan2(dx, dy);
  // The stitch just pulled out of, open to thread.
  stitch.position.x = -p.gap;
  (stitch as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>).material.opacity = stitchOpen(p.phase) ? 0.9 : 0.1;
  seam.children.forEach((d, k) => (d.position.x = -stitchLateral(k, reach)));
}
