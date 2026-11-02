import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { DOZE_DEPTH, DOZE_STAGES, type HazardPose } from '../items/hazards';
import type { PitDef } from '../tracks/builder';
import { HUB_X, HUB_Z, RIM, SPOKE } from '../tracks/theWheel';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import { glowTexture } from './textures';

/**
 * The Wheel's world, the Gumboot Soup Cup's last: the wheel that steers us
 * into our future, and falling asleep at it. Dusk going into night in a
 * somber jazz light, the road a record's black groove laid in the shape of
 * a ship's helm across a dark moor, and the future glowing on the horizon.
 * Its textures (the groove, the moor, the dusk stone of the cut and the
 * world's edge, the ship's rail along the road), its scenery (old iron
 * street lamps, cypresses, records half sunk in the heather, ship's wheels
 * run aground, armchairs left out with their standard lamps still lit,
 * stopped grandfather clocks, little knots of pilgrims with lanterns), its
 * landmarks (the wheel turning over the start line, the helm's handles
 * out past the rim, the great wheel turning on the horizon against the
 * glow of the future, the pilgrims climbing to the summit, the idealistic
 * reaper waiting on it, the crevasse on the steeper path) and its hazard's
 * look (the waves of sleep and their rumble strips).
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

/** The dusk's amber, the lamplight, and the lilac of sleep. */
const AMBER_HEX = 0xffb060;
const LILAC_HEX = 0xb8a0ff;

/**
 * The road: a record's groove, black vinyl. The texture spans half the
 * road (its u across, its v along): fine grooves running along the road,
 * each wiggling with the music cut into it, louder in some stretches than
 * others; a smooth band of land down the edge of it (the road's edges and
 * its middle), as between the tracks on a record; a sheen of the dusk
 * across the grooves, with a faint rainbow in it; dust and a scratch.
 */
export function grooveRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const loud = fbm(S, 4, 3, 6101);
  const fine = fbm(S, 32, 2, 6102);
  paint(ctx, S, S, (x, y, i) => {
    const u = x / S;
    const black: RGB = [13, 12, 17];
    // The land: smooth and glossy, no groove in it.
    const land = Math.min(u, 1 - u);
    if (land < 0.05) return mix(black, [44, 40, 52], 0.35 + 0.25 * Math.sin(y * 0.05 + fine[i] * 2));
    // The groove: a ridge every few texels, wiggling with how loud the music is here.
    const amp = 0.4 + 2.6 * loud[(y * S + ((x * 13) % S)) % (S * S)];
    const phase = (x + amp * Math.sin(y * 0.55 + x * 0.21)) / 3.2;
    const ridge = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
    // The sheen: a broad soft band of the dusk across the grooves, a rainbow at its edge.
    const sheen = Math.exp(-(((u - 0.36) / 0.11) ** 2));
    const rainbow: RGB = [120 + 80 * Math.sin(u * 40), 90 + 70 * Math.sin(u * 40 + 2.1), 140 + 90 * Math.sin(u * 40 + 4.2)];
    const lit = mix([30, 27, 38], mix([92, 84, 104], rainbow, 0.25), sheen);
    return mix(black, lit, ridge * (0.45 + 0.55 * sheen) * (0.85 + fine[i] * 0.3));
  });
  const rand = seededRandom(6103);
  // Dust on the record.
  for (let k = 0; k < 160; k++) {
    ctx.fillStyle = rand() < 0.7 ? 'rgba(220,214,230,0.5)' : 'rgba(255,220,170,0.6)';
    ctx.fillRect(rand() * S, rand() * S, 1, 1);
  }
  // A fine scratch across a few grooves.
  ctx.strokeStyle = 'rgba(200,190,215,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(S * 0.18, S * 0.62);
  ctx.quadraticCurveTo(S * 0.42, S * 0.55, S * 0.66, S * 0.7);
  ctx.stroke();
  return finish(c);
}

/** The ground: a moor at dusk, peat and heather and dark grass, the heather's flowers gone grey-mauve in the failing light. */
export function heathTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 5, 6111);
  const patch = fbm(S, 4, 3, 6112);
  paint(ctx, S, S, (_x, _y, i) => {
    const peat: RGB = [26, 20, 24];
    const heather: RGB = [64, 40, 58];
    const grass: RGB = [44, 50, 44];
    const base = patch[i] > 0.55 ? mix(heather, grass, Math.min(1, (patch[i] - 0.55) * 5)) : mix(peat, heather, patch[i] / 0.55);
    return shade(base, 0.75 + n[i] * 0.5);
  });
  const rand = seededRandom(6113);
  for (let k = 0; k < 7000; k++) {
    const r = rand();
    ctx.fillStyle = r < 0.35 ? 'rgba(150,104,150,0.45)' : r < 0.7 ? 'rgba(96,110,86,0.4)' : 'rgba(10,8,12,0.5)';
    ctx.fillRect(rand() * S, rand() * S, 1.5, r < 0.35 ? 1.5 : 3);
  }
  return finish(c);
}

/** The cut's walls and the world's edge: dark dusk stone in courses, plum-grey, its mortar black, moss low down. */
export function duskStoneTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 6121);
  paint(ctx, S, S, (_x, y, i) => shade(mix([50, 44, 56], [92, 82, 96], n[i]), 0.85 + 0.15 * (y / S)));
  const rand = seededRandom(6122);
  const course = 32;
  ctx.strokeStyle = 'rgba(12,10,14,0.9)';
  ctx.lineWidth = 2;
  for (let y = 0; y <= S; y += course) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(S, y);
    ctx.stroke();
    let x = (y / course) % 2 ? -rand() * 40 : 0;
    while (x < S) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + course);
      ctx.stroke();
      ctx.fillStyle = `rgba(${rand() < 0.5 ? '20,16,24' : '120,108,124'},${0.1 + rand() * 0.12})`;
      const w = 40 + rand() * 50;
      ctx.fillRect(x + 2, y + 2, w - 4, course - 4);
      x += w;
    }
  }
  // Moss low on the wall.
  for (let k = 0; k < 900; k++) {
    const y = S - Math.abs(rand() - rand()) * S * 0.6;
    ctx.fillStyle = `rgba(70,86,60,${0.15 + rand() * 0.3})`;
    ctx.fillRect(rand() * S, y, 2, 2);
  }
  return finish(c);
}

/** The barrier: a ship's rail, varnished teak planks, a brass band along the top and brass studs. */
export function railTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  const n = fbm(W, 8, 3, 6131);
  paint(ctx, W, H, (x, y, i) => {
    const grain = 0.85 + 0.15 * Math.sin(y * 1.7 + n[i] * 9 + x * 0.04);
    return shade(mix([96, 54, 28], [150, 92, 50], n[i]), grain * (0.75 + 0.25 * (1 - y / H)));
  });
  ctx.fillStyle = 'rgba(20,10,6,0.8)';
  for (const y of [H * 0.38, H * 0.7]) ctx.fillRect(0, y, W, 1.5);
  ctx.fillStyle = css([206, 166, 84]);
  ctx.fillRect(0, 0, W, H * 0.14);
  ctx.fillStyle = css([255, 226, 150], 0.8);
  ctx.fillRect(0, H * 0.03, W, 1.5);
  for (const x of [W * 0.25, W * 0.75]) {
    ctx.fillStyle = css([220, 180, 96]);
    ctx.beginPath();
    ctx.arc(x, H * 0.55, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

const glowTex = once(() => glowTexture());
const wood = once(() => lambert(0x5a2e1a));
const teak = once(() => lambert(0x8a5630));
const brass = once(() => new THREE.MeshPhongMaterial({ color: 0xc8a050, specular: 0xffe0a0, shininess: 60 }));
const iron = once(() => lambert(0x1e1a22));
const vinyl = once(() => new THREE.MeshPhongMaterial({ color: 0x0c0b10, specular: 0x6a6080, shininess: 90 }));
const robe = once(() => lambert(0x16121c));
const lampGlass = once(() => new THREE.MeshBasicMaterial({ color: 0xffd090 }));

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

/** A face of words on a sign: amber on a dusk violet, an amber rule round it. */
const signFace = (() => {
  const made = new Map<string, THREE.CanvasTexture>();
  return (lines: string[], bg = '#1a1028', fg = '#ffc070'): THREE.CanvasTexture => {
    const key = `${lines.join('|')}|${bg}|${fg}`;
    let t = made.get(key);
    if (t) return t;
    const W = 512;
    const H = 256;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = lines.length === 1 ? 92 : lines.length === 2 ? 66 : 50;
    ctx.font = `italic bold ${size}px Georgia, serif`;
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

/** A sign panel `w` wide (half as high) with `map` on its face toward -z (toward whoever's coming) and on its back. */
function signPanel(w: number, map: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, w / 2);
  const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map }));
  front.rotation.y = Math.PI;
  front.position.z = -0.12;
  const rear = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map }));
  rear.position.z = 0.12;
  const board = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, w / 2 + 0.3, 0.2), wood());
  g.add(board, front, rear);
  return g;
}

/** A turned wooden handle, along +y from its foot, `len` long and about `r` thick: beads and a knob, a brass ferrule at its foot. */
function handleFigure(len: number, r: number): THREE.Group {
  const g = new THREE.Group();
  const profile = [
    [0, 0],
    [0.62, 0],
    [0.66, 0.06],
    [0.5, 0.16],
    [0.82, 0.3],
    [0.56, 0.46],
    [0.92, 0.66],
    [0.6, 0.84],
    [0.78, 0.92],
    [0.4, 1.0],
    [0, 1.02],
  ].map(([a, b]) => new THREE.Vector2(a * r, b * len));
  const turned = new THREE.Mesh(new THREE.LatheGeometry(profile, 14), teak());
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.72, len * 0.06, 14), brass());
  ferrule.position.y = len * 0.03;
  g.add(turned, ferrule);
  return g;
}

/**
 * A ship's helm, `R` to its rim: six spokes through a brass hub (as the
 * lap's three roads cross its hub), the wooden rim with a brass ring inside
 * it, and a turned handle on each spoke out past the rim. In the xy plane,
 * turning about z.
 */
function helmFigure(R: number, mats?: { wood: THREE.Material; brass: THREE.Material }): THREE.Group {
  const g = new THREE.Group();
  const w = mats?.wood ?? wood();
  const b = mats?.brass ?? brass();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.07, 8, 48), w);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.82, R * 0.025, 6, 40), b);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.16, R * 0.16, R * 0.18, 18), b);
  hub.rotation.x = Math.PI / 2;
  const boss = new THREE.Mesh(new THREE.SphereGeometry(R * 0.09, 12, 8), b);
  boss.position.z = R * 0.1;
  g.add(rim, ring, hub, boss);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const spoke = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.035, R * 0.05, R, 8), w);
    bar.position.y = R / 2;
    const handle = mats ? new THREE.Mesh(new THREE.CylinderGeometry(R * 0.05, R * 0.07, R * 0.36, 8), w) : handleFigure(R * 0.38, R * 0.08);
    handle.position.y = mats ? R * 1.2 : R * 1.02;
    spoke.add(bar, handle);
    spoke.rotation.z = a;
    g.add(spoke);
  }
  return g;
}

/** A hooded pilgrim, `h` tall, its foot at the origin, facing +z. Returns the figure and the hand a lantern hangs from. */
function pilgrimFigure(h: number): { group: THREE.Group; hand: THREE.Object3D } {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(h * 0.22, h * 0.82, 9), robe());
  body.position.y = h * 0.41;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(h * 0.12, 10, 8), robe());
  hood.scale.set(1, 1.2, 1.1);
  hood.position.y = h * 0.86;
  // Bowed against the cold.
  hood.rotation.x = 0.4;
  const hand = new THREE.Object3D();
  hand.position.set(h * 0.2, h * 0.5, h * 0.16);
  g.add(body, hood, hand);
  return { group: g, hand };
}

/** A lantern on a short pole: its iron frame and its flame, glowing. Returns it and its glow, to flicker. */
function lanternFigure(size: number): { group: THREE.Group; glow: THREE.Sprite } {
  const g = new THREE.Group();
  const cage = new THREE.Mesh(new THREE.BoxGeometry(size * 0.5, size * 0.7, size * 0.5), iron());
  const pane = new THREE.Mesh(new THREE.BoxGeometry(size * 0.42, size * 0.55, size * 0.42), lampGlass());
  const cap = new THREE.Mesh(new THREE.ConeGeometry(size * 0.38, size * 0.3, 4), iron());
  cap.position.y = size * 0.5;
  cap.rotation.y = Math.PI / 4;
  const glow = sprite(AMBER_HEX, size * 4, 0.75);
  g.add(cage, pane, cap, glow);
  return { group: g, glow };
}

/**
 * The moor at dusk, everyone asleep: old iron street lamps still lit,
 * cypresses black against the sky, records half sunk in the heather,
 * ship's wheels run aground in it, armchairs left out on the moor with
 * their standard lamps still on (minds unpacked, muscles relaxed), tall
 * clocks stopped, and little knots of pilgrims with lanterns, shivering.
 */
export function slumberFeature(animated: Animated): Feature {
  const lamp: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 5 + rand() * 2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, h, 8), iron());
    pole.position.y = h / 2;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.6, 8), iron());
    foot.position.y = 0.3;
    const { group: head, glow } = lanternFigure(1.1);
    head.position.y = h + 0.4;
    t.add(pole, foot, head);
    const ph = rand() * 10;
    animated.push((time) => (glow.material.opacity = 0.7 + 0.08 * Math.sin(time * 9 + ph) * Math.sin(time * 2.3 + ph)));
    return place(t, x, z, rand);
  };
  const cypressMat = lambert(0x141c18);
  const cypress: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 10 + rand() * 10;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.5, 6), wood());
    trunk.position.y = 0.75;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 10), cypressMat);
    crown.scale.set(1.4 + rand() * 0.5, h / 2, 1.4 + rand() * 0.5);
    crown.position.y = 1 + h / 2;
    t.add(trunk, crown);
    return place(t, x, z, rand);
  };
  const LABELS = [0x8a1a20, 0xe8d8b0, 0x2a4a8a, 0xd8a030];
  const record: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 2.5 + rand() * 4;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.12, 40), vinyl());
    disc.rotation.x = Math.PI / 2;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.33, r * 0.33, 0.14, 24), lambert(LABELS[Math.floor(rand() * LABELS.length)]));
    label.rotation.x = Math.PI / 2;
    const groove = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, 0.03, 4, 40), lambert(0x3a3448));
    t.add(disc, label, groove);
    // Standing on its edge, half sunk, leaning.
    t.position.y = r * (0.35 + rand() * 0.3);
    t.rotation.z = (rand() - 0.5) * 0.5;
    const g = new THREE.Group();
    g.add(t);
    return place(g, x, z, rand);
  };
  const helm: Feature = (x, z, rand) => {
    const t = helmFigure(2 + rand() * 2.5);
    // Run aground in the heather, tilted, half sunk.
    t.rotation.x = -0.3 - rand() * 0.6;
    t.position.y = 1 + rand() * 1.5;
    const g = new THREE.Group();
    g.add(t);
    return place(g, x, z, rand);
  };
  const velvet = lambert(0x5a1a2a);
  const shadeMat = new THREE.MeshLambertMaterial({ color: 0xffd8a0, emissive: 0xc07830, side: THREE.DoubleSide });
  const chair: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.4), velvet);
    seat.position.y = 0.6;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 0.35), velvet);
    back.position.set(0, 1.3, -0.55);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 1.4), velvet);
      arm.position.set(side * 0.8, 1.0, 0);
      t.add(arm);
    }
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), brass());
    stand.position.set(1.6, 1.3, -0.4);
    const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 0.6, 12, 1, true), shadeMat);
    lampShade.position.set(1.6, 2.7, -0.4);
    const glow = sprite(AMBER_HEX, 4, 0.6);
    glow.position.set(1.6, 2.5, -0.4);
    t.add(seat, back, stand, lampShade, glow);
    return place(t, x, z, rand);
  };
  const face = once(() => {
    const S = 128;
    const [c, ctx] = canvas(S);
    ctx.fillStyle = '#e8dcc0';
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a1a10';
    ctx.lineWidth = 3;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(S / 2 + Math.sin(a) * S * 0.4, S / 2 - Math.cos(a) * S * 0.4);
      ctx.lineTo(S / 2 + Math.sin(a) * S * 0.46, S / 2 - Math.cos(a) * S * 0.46);
      ctx.stroke();
    }
    // Stopped at a minute to midnight.
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(S / 2, S / 2);
    ctx.lineTo(S / 2 - 3, S * 0.18);
    ctx.moveTo(S / 2, S / 2);
    ctx.lineTo(S / 2 - 1, S * 0.24);
    ctx.stroke();
    return finish(c, false);
  });
  const clock: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 4 + rand() * 2;
    const caseBox = new THREE.Mesh(new THREE.BoxGeometry(1.1, h, 0.7), wood());
    caseBox.position.y = h / 2;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.9), wood());
    hood.position.y = h + 0.5;
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshLambertMaterial({ map: face() }));
    dial.position.set(0, h + 0.5, 0.46);
    const pendulum = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), brass());
    pendulum.rotation.x = Math.PI / 2;
    pendulum.position.set(0, h * 0.35, 0.36);
    t.add(caseBox, hood, dial, pendulum);
    // Some fallen over.
    if (rand() < 0.25) {
      t.rotation.x = -Math.PI / 2;
      t.position.y = 0.4;
    }
    const g = new THREE.Group();
    g.add(t);
    return place(g, x, z, rand);
  };
  const pilgrims: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 2 + Math.floor(rand() * 3);
    const shivers: THREE.Object3D[] = [];
    const glows: THREE.Sprite[] = [];
    for (let k = 0; k < n; k++) {
      const { group, hand } = pilgrimFigure(1.7 + rand() * 0.3);
      group.position.set(k * 1.3 + (rand() - 0.5), 0, (rand() - 0.5) * 1.2);
      if (k === 0) {
        const { group: lantern, glow } = lanternFigure(0.4);
        lantern.position.y = -0.3;
        hand.add(lantern);
        glows.push(glow);
      }
      t.add(group);
      shivers.push(group);
    }
    const ph = rand() * 10;
    animated.push((time) => {
      shivers.forEach((s, k) => (s.rotation.z = 0.025 * Math.sin(time * 31 + k * 1.7 + ph)));
      glows.forEach((g) => (g.material.opacity = 0.65 + 0.15 * Math.sin(time * 11 + ph)));
    });
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [3, lamp],
      [3.5, cypress],
      [1.6, record],
      [1.2, helm],
      [0.9, chair],
      [1, clock],
      [1.4, pilgrims],
    ])(x, z, rand);
}

/** The wheel's sign over the start line. */
const wheelFace = once(() => signFace(['THE WHEEL']));

/**
 * At the wheel: a gantry of dark wood over the start line, a lantern on
 * each post, THE WHEEL on its beam, and over it all a great ship's helm
 * hung facing the karts, turning slowly, steering us into our future.
 */
export function wheelGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const H = 9;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1, H, 1), wood());
    post.position.set(side * (hw + 0.7), H / 2, 0);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.35, 1.08), brass());
    band.position.set(side * (hw + 0.7), H - 1.6, 0);
    const { group: lantern, glow } = lanternFigure(1.2);
    lantern.position.set(side * (hw + 0.7), H - 2.6, -0.9);
    g.add(post, band, lantern);
    const ph = side * 2;
    animated.push((time) => (glow.material.opacity = 0.7 + 0.1 * Math.sin(time * 7 + ph)));
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 2.6, 0.9, 0.9), wood());
  beam.position.y = H;
  const sign = signPanel(10, wheelFace());
  sign.scale.y = 0.5;
  sign.position.y = H - 1.9;
  g.add(beam, sign);
  // The helm, up over the beam, its axle on a brass bracket.
  const R = 6.5;
  const helm = helmFigure(R);
  helm.position.y = H + R * 1.45;
  const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, R * 1.45, 8), brass());
  bracket.position.y = H + (R * 1.45) / 2;
  g.add(bracket, helm);
  animated.push((time) => (helm.rotation.z = time * 0.22 + 0.3 * Math.sin(time * 0.4)));
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * One of the helm's handles, out past its rim: a great turned wooden peg
 * lying in the heather along the spoke the road at `s` runs along, from
 * just past the rim outward, its brass ferrule toward the hub. Shortened
 * where any other road would run through it.
 */
export function helmHandle(ribbon: Ribbon, s: number): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const dx = f.x - HUB_X;
  const dz = f.z - HUB_Z;
  const d = Math.hypot(dx, dz) || 1;
  const ux = dx / d;
  const uz = dz / d;
  // The road meets the rim where the spoke ends: the rim is RIM out to SPOKE's in.
  const rim = (d * RIM) / SPOKE;
  const from = rim + 18;
  const sp = ribbon.spline;
  let len = 30;
  for (let k = 0; k <= 30; k += 1.5) {
    const x = HUB_X + ux * (from + k);
    const z = HUB_Z + uz * (from + k);
    let clear = true;
    for (let i = 0; i < sp.count && clear; i += 2) clear = Math.hypot(sp.px[i] - x, sp.pz[i] - z) > ribbon.halfWidth[i] + 4;
    if (!clear) {
      len = k - 2;
      break;
    }
  }
  if (len < 10) return g;
  const r = 2.6 * (len / 30) ** 0.5;
  const handle = handleFigure(len, r);
  // Lying along the spoke, outward: the figure's +y turned onto the spoke's direction.
  handle.rotation.x = Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(handle);
  holder.position.set(HUB_X + ux * from, r * 0.75, HUB_Z + uz * from);
  holder.rotation.y = Math.atan2(ux, uz);
  g.add(holder);
  return g;
}

/**
 * The great wheel turning in the sky: a ship's helm the size of the
 * horizon, standing far ahead of the road at `s` past the world's edge,
 * its foot sunk below the moor like a setting sun, black against the glow
 * of the future rising behind it, and the future's city lit along the
 * horizon under it. It turns, slowly, steering.
 */
export function greatWheel(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const AHEAD = 640;
  const at = { x: f.x + Math.sin(f.heading) * AHEAD, z: f.z + Math.cos(f.heading) * AHEAD };
  const R = 170;
  const H = 70;
  const black = new THREE.MeshBasicMaterial({ color: 0x120a16, fog: false });
  const dusk = new THREE.MeshBasicMaterial({ color: 0x3a2030, fog: false });
  // The future's glow behind it: a vast soft dawn, amber at its heart and rose at its edge.
  const dawn = sprite(0xff9a50, R * 4.2, 0.85, false);
  dawn.position.set(0, H - 20, -40);
  const rose = sprite(0xd8507a, R * 6, 0.35, false);
  rose.position.set(0, H - 40, -60);
  const helm = helmFigure(R, { wood: black, brass: dusk });
  helm.position.y = H;
  g.add(rose, dawn, helm);
  // The future's city along the horizon under it, its windows lit.
  const rand = seededRandom(6141);
  const tower = new THREE.MeshBasicMaterial({ color: 0x1a1020, fog: false });
  const lit = new THREE.MeshBasicMaterial({ color: 0xffd090, fog: false });
  for (let k = 0; k < 40; k++) {
    const w = 10 + rand() * 18;
    const h = 20 + rand() * 70;
    const x = (rand() - 0.5) * R * 3;
    const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), tower);
    block.position.set(x, h / 2 - 6, 30 + rand() * 60);
    g.add(block);
    for (let j = 0; j < 6; j++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), lit);
      win.position.set(x + (rand() - 0.5) * (w - 3), 4 + rand() * (h - 10), 30 + rand() * 60 + w / 2 + 0.2);
      win.rotation.y = 0;
      g.add(win);
    }
  }
  animated.push((time) => {
    helm.rotation.z = time * 0.04;
    dawn.material.opacity = 0.8 + 0.05 * Math.sin(time * 0.3);
  });
  g.position.set(at.x, 0, at.z);
  // Facing back at the road.
  g.lookAt(f.x, 0, f.z);
  return g;
}

/**
 * The shivering pilgrims: a procession of hooded figures trudging up the
 * outside of the road from `s` to `to` (spline units), every few with a
 * lantern on a pole, all of them shivering, their lanterns flickering,
 * climbing slowly toward the summit and the reaper.
 */
export function pilgrims(ribbon: Ribbon, s: number, to: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const len = to - s;
  const rand = seededRandom(6151);
  const walkers: { o: THREE.Object3D; d: number; lat: number; ph: number }[] = [];
  const glows: THREE.Sprite[] = [];
  for (let d = 2; d < len; d += 7) {
    const { group, hand } = pilgrimFigure(1.8 + rand() * 0.4);
    if (walkers.length % 3 === 0) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5), wood());
      pole.position.set(0, 0.7, 0.3);
      pole.rotation.x = 0.5;
      const { group: lantern, glow } = lanternFigure(0.5);
      lantern.position.set(0, 1.7, 0.95);
      hand.add(pole, lantern);
      glows.push(glow);
    }
    g.add(group);
    walkers.push({ o: group, d, lat: 2.5 + rand() * 2.5, ph: rand() * 10 });
  }
  const pace = 0.7;
  const pose = (time: number) => {
    for (const w of walkers) {
      const at = s + ((w.d + time * pace) % len);
      const p = offRoad(ribbon, at, ribbon.halfWidthAtS(at) + w.lat);
      w.o.position.set(p.x, ribbon.heightAt(at), p.z);
      w.o.rotation.set(0, p.heading, 0.03 * Math.sin(time * 29 + w.ph));
    }
    glows.forEach((gl, k) => (gl.material.opacity = 0.6 + 0.2 * Math.sin(time * 13 + k * 2.2)));
  };
  pose(0);
  animated.push(pose);
  return g;
}

/**
 * The idealistic reaper, waiting on the summit: a towering hooded figure
 * `lateral` off the road at `s` (well off it, when that's 0), standing as
 * high as the road there, its face nothing but dark and two pale lights, a
 * pale halo behind its hood (it is idealistic), its scythe held out over
 * the road so the blade hangs high over the summit, swaying slowly; a ring
 * of candles at its feet, left by the pilgrims.
 */
export function reaper(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const side = Math.sign(lateral) || -1;
  const off = lateral || -(ribbon.halfWidthAtS(s) + 22);
  const at = offRoad(ribbon, s, off);
  const H = 34;
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        [0, 0],
        [5.6, 0],
        [5.2, 4],
        [5, H * 0.45],
        [4.2, H * 0.72],
        [4.6, H * 0.78],
        [3.4, H * 0.84],
        [0, H * 0.86],
      ].map(([a, b]) => new THREE.Vector2(a, b)),
      16,
    ),
    robe(),
  );
  const hood = new THREE.Mesh(new THREE.SphereGeometry(4.2, 16, 12), robe());
  hood.scale.set(1, 1.25, 1.1);
  hood.position.y = H * 0.9;
  const face = new THREE.Mesh(new THREE.CircleGeometry(2.6, 20), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  face.position.set(0, H * 0.89, 3.9);
  const eyes = [-1, 1].map((k) => {
    const e = sprite(0xd8e0ff, 1.6, 0.9);
    e.position.set(k * 0.9, H * 0.9, 4.2);
    return e;
  });
  // The halo: a thin ring of pale gold behind its hood, and its glow.
  const halo = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.22, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
  halo.position.set(0, H * 0.93, -2.2);
  const haloGlow = sprite(0xffd090, 22, 0.45);
  haloGlow.position.set(0, H * 0.93, -3);
  g.add(body, hood, face, ...eyes, halo, haloGlow);
  // The scythe: its long snath held out toward the road, the blade curving over it high up.
  const scythe = new THREE.Group();
  const snath = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 36, 8), wood());
  snath.position.y = 18;
  const blade = new THREE.Shape();
  blade.moveTo(0, 0);
  blade.quadraticCurveTo(10, 5, 22, -3);
  blade.quadraticCurveTo(11, 1.5, 0, -2.4);
  blade.lineTo(0, 0);
  const steel = new THREE.MeshPhongMaterial({ color: 0xb8b8c8, emissive: 0x282838, specular: 0xffffff, shininess: 80, side: THREE.DoubleSide });
  const edge = new THREE.Mesh(new THREE.ShapeGeometry(blade, 12), steel);
  // The blade off the top of the snath, along the road, curving down.
  edge.position.y = 35;
  scythe.add(snath, edge);
  // Held in its hands, leaning out over the road (its face is toward the road, +z).
  scythe.position.set(0, H * 0.45, 3);
  scythe.rotation.x = LEAN;
  const hands = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), robe());
  hands.position.set(0, H * 0.55, 3.6);
  g.add(scythe, hands);
  // The candles at its feet.
  const flames: THREE.Sprite[] = [];
  const wax = lambert(0xe8dcc0);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.8 + (k % 3) * 0.3, 6), wax);
    c.position.set(Math.cos(a) * 7.5, 0.5, Math.sin(a) * 7.5);
    const fl = sprite(AMBER_HEX, 1.4, 0.8);
    fl.position.set(Math.cos(a) * 7.5, 1.4 + (k % 3) * 0.3, Math.sin(a) * 7.5);
    g.add(c, fl);
    flames.push(fl);
  }
  animated.push((time) => {
    scythe.rotation.x = LEAN + 0.05 * Math.sin(time * 0.5);
    flames.forEach((fl, k) => (fl.material.opacity = 0.7 + 0.2 * Math.sin(time * 12 + k * 1.3)));
    eyes.forEach((e) => (e.material.opacity = 0.6 + 0.3 * Math.max(0, Math.sin(time * 0.6))));
    haloGlow.material.opacity = 0.4 + 0.08 * Math.sin(time * 0.8);
  });
  g.position.set(at.x, Math.max(0, ribbon.heightAt(s) - 3), at.z);
  // Facing the road: on its left (side -1) that's the road's right, a quarter turn back from its heading.
  g.rotation.y = at.heading + side * (Math.PI / 2);
  return g;
}

/** How far the reaper leans its scythe out over the road. */
const LEAN = 0.75;

/** The steeper path's sign: the way the pilgrims don't take. */
const pathFace = once(() => signFace(['THE STEEPER PATH']));

/**
 * The Steeper Path's crevasse: anchor posts at its four corners with a
 * lantern on each, ropes slung between them along both sides (on the
 * final lap there are planks between them; on the others, nothing), the
 * dark of the crevasse below and mist rising out of it, and a sign at its
 * near lip. Stands over the drop `pits` holds by the branch at `s`.
 */
export function steeperPath(ribbon: Ribbon, s: number, pits: readonly PitDef[], animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const pit = pits.reduce((best, p) => (Math.hypot(p.x - f.x, p.z - f.z) < Math.hypot(best.x - f.x, best.z - f.z) ? p : best), pits[0]);
  if (!pit) return g;
  const L = pit.halfLength;
  const W = pit.halfWidth + 0.6;
  const y = Math.max(0, f.y);
  const glows: THREE.Sprite[] = [];
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 3, 6), wood());
      post.position.set(side * W, y + 1.5, end * L);
      const { group: lantern, glow } = lanternFigure(0.6);
      lantern.position.set(side * W, y + 3.3, end * L);
      g.add(post, lantern);
      glows.push(glow);
    }
  }
  // The ropes, sagging between the posts.
  const rope = lambert(0x8a7050);
  for (const side of [-1, 1]) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(side * W, y + 2.6, -L), new THREE.Vector3(side * W, y + 0.6, 0), new THREE.Vector3(side * W, y + 2.6, L));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.07, 4), rope));
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 2 * L), new THREE.MeshBasicMaterial({ color: 0x050308 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -pit.depth + 0.5;
  g.add(floor);
  const mists: THREE.Sprite[] = [];
  for (let k = 0; k < 8; k++) {
    const m = sprite(LILAC_HEX, 8, 0.25);
    m.userData.ph = k / 8;
    mists.push(m);
    g.add(m);
  }
  const sign = signPanel(6, pathFace());
  sign.scale.y = 0.6;
  sign.position.set(-W - 3, y + 3.2, -L - 2);
  const signPost = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, 0.3), wood());
  signPost.position.set(-W - 3, y + 1.4, -L - 2);
  g.add(sign, signPost);
  animated.push((time) => {
    glows.forEach((gl, k) => (gl.material.opacity = 0.6 + 0.2 * Math.sin(time * 10 + k)));
    mists.forEach((m, k) => {
      const u = (time * 0.12 + m.userData.ph) % 1;
      m.position.set(Math.sin(k * 2.1) * W * 0.6, -pit.depth + u * (pit.depth + 3), Math.cos(k * 1.7) * L * 0.7);
      m.material.opacity = 0.3 * Math.sin(u * Math.PI);
    });
  });
  g.position.set(pit.x, 0, pit.z);
  g.rotation.y = pit.heading;
  return g;
}

/** A rumble strip's ribs: bars across the road, cream and ochre, worn. */
const rumbleTexture = once(() => {
  const W = 64;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  for (let y = 0; y < H; y += 8) {
    ctx.fillStyle = (y / 8) % 2 ? '#e8d8a8' : '#c08a30';
    ctx.fillRect(0, y, W, 8);
  }
  const rand = seededRandom(6161);
  for (let k = 0; k < 300; k++) {
    ctx.fillStyle = 'rgba(30,24,20,0.3)';
    ctx.fillRect(rand() * W, rand() * H, 2, 1);
  }
  return finish(c);
});

/** A Z of sleep, drifting up off the haze. */
const zTexture = once(() => {
  const S = 64;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#e8dcff';
  ctx.font = 'italic bold 52px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('z', S / 2, S / 2);
  return finish(c, false);
});

const HAZE_PUFFS = 9;
const ZS = 6;

/**
 * A row of sleep, the hazard's look: the rumble strip across the road (the
 * wake-up line, rattling and lit as the haze lifts off it), the haze of
 * dream lying over it, lilac, gathering and thinning on the sway, and the
 * Zs of sleep drifting up off it.
 */
export function dozeParts(obj: THREE.Object3D): THREE.Object3D[] {
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(1, 2 * DOZE_DEPTH), new THREE.MeshLambertMaterial({ map: rumbleTexture(), emissive: 0xffb040, emissiveIntensity: 0 }));
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 0.07;
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 2 * DOZE_DEPTH + 1.5),
    new THREE.MeshBasicMaterial({ color: AMBER_HEX, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  flash.rotation.x = -Math.PI / 2;
  flash.position.y = 0.12;
  const haze = new THREE.Group();
  for (let k = 0; k < HAZE_PUFFS; k++) {
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: LILAC_HEX, transparent: true, depthWrite: false, opacity: 0 }));
    puff.scale.set(9, 4.5, 1);
    haze.add(puff);
  }
  const zs = new THREE.Group();
  for (let k = 0; k < ZS; k++) {
    const z = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTexture(), transparent: true, depthWrite: false, opacity: 0 }));
    zs.add(z);
  }
  obj.add(strip, flash, haze, zs);
  return [strip, flash, haze, zs];
}

/** Poses a row of sleep's parts (from dozeParts): across the road, the haze as thick as the sway has it, the strip rattling as it lifts. */
export function poseDoze(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [strip, flash, haze, zs] = parts;
  obj.rotation.y = p.heading;
  const w = 2 * p.radius + 1;
  strip.scale.x = w;
  flash.scale.x = w;
  const waking = p.lane === 1;
  const u = waking ? (p.phase - DOZE_STAGES.lift) / (DOZE_STAGES.clear - DOZE_STAGES.lift) : 0;
  // Rattling: the strip shakes and burns amber as the haze lifts off it.
  strip.position.y = 0.07 + (waking ? 0.05 * Math.sin(elapsed * 70) : 0);
  const ribs = (strip as THREE.Mesh).material as THREE.MeshLambertMaterial;
  // Dull and worn while sleep lies over it; bright, and burning, as it wakes you.
  ribs.color.setHex(waking ? 0xffffff : 0x6a5c52);
  ribs.emissiveIntensity = waking ? 0.6 + 0.4 * Math.sin(elapsed * 30) : 0;
  ((flash as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = waking ? 0.35 * (1 - u) * (0.6 + 0.4 * Math.sin(elapsed * 30)) : 0;
  haze.children.forEach((puff, k) => {
    const x = (k / (HAZE_PUFFS - 1) - 0.5) * 2 * p.radius;
    puff.position.set(x, 1.6 + 0.4 * Math.sin(elapsed * 0.9 + k * 1.3), 0.6 * Math.sin(elapsed * 0.7 + k));
    ((puff as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.6 * p.gap;
  });
  zs.children.forEach((z, k) => {
    const v = (elapsed * 0.35 + k / ZS) % 1;
    z.position.set((((k * 0.618) % 1) - 0.5) * 1.6 * p.radius, 2 + v * 5, 0);
    z.scale.setScalar(0.8 + v * 1.4);
    ((z as THREE.Sprite).material as THREE.SpriteMaterial).opacity = p.gap > 0.4 ? Math.sin(v * Math.PI) * p.gap : 0;
  });
}
