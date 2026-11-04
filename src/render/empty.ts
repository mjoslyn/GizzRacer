import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { WANDER_BARS, type HazardPose } from '../items/hazards';
import type { PitDef } from '../tracks/builder';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import { glowTexture } from './textures';
import { atmosphere } from './trackDetail';

/**
 * Empty's world (the All Stars Cup #2's third): an empty town on a pale
 * plain at dawn, nobody about, the light milky and cold, everything washed
 * nearly white; the one warm thing in it the one you're with. Its textures
 * (the road of pale old concrete slabs, joints across it and a slate kerb
 * down each edge so the way reads on the grey-green plain; the dewy plain;
 * board-marked concrete for the cut and the world's edge; a white picket
 * fence), its scenery (empty weatherboard houses with dark windows, a
 * chair left out on its own, swings swaying with nobody on them, empty
 * benches, bare pale birches, telephone poles, sheets on a line, an empty
 * birdcage, grey flowers), its landmarks (a great metronome over the
 * start, ticking the waltz; the empty stage in the north loop, rows of
 * empty seats and the ghost light left burning; the clock tower shot
 * through the face where the road is shot through; the one you're with,
 * on a bench in the south loop with room beside them, the world in colour
 * round them; the works where it was never set in stone, a blank tablet
 * over the pour) and its hazard's look (the wanderers: coats and hats
 * with nobody in them, and the one who isn't empty). On the final lap the
 * colour comes back into all of it: the houses, the flowers, the windows
 * lit, the clock going again.
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

/** The one warm thing: the colours of the one you're with. */
const WARM_HEX = 0xe0644a;
const GLOW_HEX = 0xffb070;

/**
 * The road: old concrete slabs bleached nearly white, a joint across every
 * few metres and one down the middle, hairline cracks, dew stains and a
 * little grey moss in the joints; down each edge a slate-blue kerb, dark,
 * so the pale way reads against the plain. Spans half the road, mirrored
 * about its middle (u from the middle at 0 to the edge at 1, v along).
 */
export function paleRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 8101);
  const fine = fbm(S, 64, 2, 8102);
  const stain = fbm(S, 4, 3, 8103);
  paint(ctx, S, S, (x, y, i) => {
    const u = x / S;
    // The kerb: slate, its top edge catching the light.
    if (u > 0.9) return u > 0.975 ? shade([120, 128, 140], 0.9 + fine[i] * 0.2) : shade([62, 70, 84], 0.88 + fine[i] * 0.24);
    if (u > 0.885) return [96, 98, 100];
    let col: RGB = mix([214, 210, 200], [236, 232, 222], n[i]);
    if (stain[i] > 0.6) col = mix(col, [192, 196, 198], Math.min(1, (stain[i] - 0.6) * 3));
    col = shade(col, 0.92 + fine[i] * 0.12);
    // Joints: across every quarter, and down the middle.
    const jy = y % 64;
    if (jy < 2 || x < 2) return mix(col, [140, 138, 132], 0.55);
    if ((jy < 4 || x < 4) && fine[i] > 0.6) return [124, 134, 120];
    return col;
  });
  const rand = seededRandom(8104);
  // Hairline cracks.
  ctx.strokeStyle = 'rgba(120,118,112,0.55)';
  ctx.lineWidth = 0.8;
  for (let k = 0; k < 14; k++) {
    let x = rand() * S * 0.85;
    let y = rand() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += (rand() - 0.5) * 22;
      y += (rand() - 0.5) * 22;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let k = 0; k < 500; k++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(170,166,158,0.45)' : 'rgba(250,248,242,0.5)';
    ctx.fillRect(rand() * S * 0.88, rand() * S, 1.2, 1.2);
  }
  const t = finish(c);
  t.wrapS = THREE.MirroredRepeatWrapping;
  return t;
}

/** The plain at dawn: grey-green grass heavy with dew, pale straw in patches, darker clumps, the dew glinting. */
export function dewGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 5, 8111);
  const patch = fbm(S, 4, 3, 8112);
  paint(ctx, S, S, (_x, _y, i) => {
    const grass: RGB = [92, 108, 98];
    const sage: RGB = [118, 130, 114];
    const straw: RGB = [150, 148, 124];
    const base = patch[i] > 0.62 ? mix(sage, straw, Math.min(1, (patch[i] - 0.62) * 3)) : mix(grass, sage, patch[i] / 0.62);
    return shade(base, 0.78 + n[i] * 0.4);
  });
  const rand = seededRandom(8113);
  for (let k = 0; k < 9000; k++) {
    const r = rand();
    ctx.fillStyle = r < 0.45 ? 'rgba(70,86,76,0.5)' : r < 0.8 ? 'rgba(160,168,150,0.4)' : 'rgba(236,240,244,0.55)';
    ctx.fillRect(rand() * S, rand() * S, r < 0.8 ? 1.2 : 1, r < 0.8 ? 3 : 1);
  }
  return finish(c);
}

/** The cut's walls and the world's edge: board-marked concrete, pale, stained where the dew runs down it, moss along the foot. */
export function boardConcreteTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 8121);
  const run = fbm(S, 16, 2, 8122);
  paint(ctx, S, S, (x, y, i) => {
    let col = shade([204, 202, 198], 0.9 + n[i] * 0.16);
    if (y % 32 < 2) col = shade(col, 0.82);
    // Stains running down from the board joints.
    const drip = Math.max(0, run[(x % S) + 0] - 0.55) * 2 * ((y % 32) / 32);
    col = mix(col, [140, 142, 140], Math.min(0.6, drip));
    if (y > S * 0.86) col = mix(col, [96, 110, 90], (y - S * 0.86) / (S * 0.14) * (0.5 + n[i] * 0.5));
    return col;
  });
  return finish(c);
}

/** The barrier: a white picket fence along the road, the paint flaking, the grey-green of the plain between the pickets. */
export function picketTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#5e6c62';
  ctx.fillRect(0, 0, W, H);
  const rand = seededRandom(8131);
  for (let x = 0; x < W; x += 16) {
    ctx.fillStyle = '#ece8de';
    ctx.beginPath();
    ctx.moveTo(x + 2, H);
    ctx.lineTo(x + 2, 12);
    ctx.lineTo(x + 7, 3);
    ctx.lineTo(x + 12, 12);
    ctx.lineTo(x + 12, H);
    ctx.fill();
    // Flaking paint.
    ctx.fillStyle = 'rgba(150,146,136,0.7)';
    for (let k = 0; k < 3; k++) ctx.fillRect(x + 3 + rand() * 7, 14 + rand() * 44, 1 + rand() * 3, 2 + rand() * 5);
  }
  ctx.fillStyle = '#d8d4ca';
  ctx.fillRect(0, 22, W, 5);
  ctx.fillRect(0, 48, W, 5);
  return finish(c);
}

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

/** A face of words on a sign: slate on pale. */
const signFace = (() => {
  const made = new Map<string, THREE.CanvasTexture>();
  return (lines: string[], bg = '#ece8e0', fg = '#4a525e'): THREE.CanvasTexture => {
    const key = `${lines.join('|')}|${bg}|${fg}`;
    let t = made.get(key);
    if (t) return t;
    const W = 512;
    const H = 256;
    const [c, ctx] = canvas(W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, W - 32, H - 32);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = lines.length === 1 ? 92 : 62;
    ctx.font = `${size}px Georgia, serif`;
    lines.forEach((line, k) => {
      const w = ctx.measureText(line).width;
      ctx.save();
      ctx.translate(W / 2, H / 2 + (k - (lines.length - 1) / 2) * size * 1.15);
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

/**
 * A colour that comes back on the final lap: the material is pale now and
 * blooms toward `warm` as the last lap goes on. The returned function sets
 * it, each frame.
 */
function bloom(material: THREE.MeshLambertMaterial | THREE.MeshBasicMaterial | THREE.SpriteMaterial, warm: number, amount = 1) {
  const pale: THREE.Color = (material.userData.pale ??= material.color.clone());
  const to = new THREE.Color(warm);
  return () => material.color.copy(pale).lerp(to, atmosphere.finalLap * amount);
}

// Shared materials for the scenery, pale now; each blooms on the final lap.
const PALE_WALLS = [0xdcdedc, 0xdcd6cc, 0xccd4d8, 0xd8cccc];
const WARM_WALLS = [0x8ab4dc, 0xf0d488, 0x9ccca0, 0xf0a8a0];
const walls = once(() => PALE_WALLS.map((c) => lambert(c, { flatShading: true })));
const roofMat = once(() => lambert(0x8a8e96, { flatShading: true }));
const windowMat = once(() => new THREE.MeshLambertMaterial({ color: 0x2a2e38, emissive: 0x000000 }));
const doorMat = once(() => lambert(0x9aa0a8));
const woodMat = once(() => lambert(0xb8b2a8, { flatShading: true }));
const birch = once(() => lambert(0xdcd8d0, { flatShading: true }));
const ironMat = once(() => lambert(0x5e626a, { flatShading: true }));
const sheetMat = once(() => lambert(0xf4f2ee, { side: THREE.DoubleSide }));
const stemMat = once(() => lambert(0x6e7c6e));
const PETALS = [0xe0303a, 0xf0c020, 0x8a4ad0, 0xf07ab0];
const petalMats = once(() => PETALS.map(() => lambert(0xc8c8c4)));

/** Sets every shared scenery colour to the final lap's bloom, each frame. */
function bloomScenery(animated: Animated): void {
  const fns = [
    ...walls().map((m, k) => bloom(m, WARM_WALLS[k])),
    bloom(roofMat(), 0xb0583e),
    bloom(woodMat(), 0xb07a48),
    bloom(doorMat(), 0x3a6a9a),
    ...petalMats().map((m, k) => bloom(m, PETALS[k])),
    bloom(stemMat(), 0x4a9a4a),
  ];
  const win = windowMat();
  animated.push(() => {
    fns.forEach((f) => f());
    // The windows lit, someone home.
    win.emissive.setHex(0xffc878).multiplyScalar(atmosphere.finalLap * 0.9);
  });
}

/** A roof's prism, ridge along x, `w` long over a house `d` deep. */
function roof(w: number, d: number): THREE.BufferGeometry {
  const r = (d + 0.8) / Math.sqrt(3);
  return new THREE.CylinderGeometry(r, r, w + 0.8, 3, 1, false, Math.PI / 2).rotateZ(Math.PI / 2).scale(1, 0.62, 1).translate(0, r * 0.31, 0);
}

/** An empty weatherboard house, its windows dark, nobody home. */
function house(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const w = 8 + rand() * 6;
  const d = 7 + rand() * 4;
  const h = 4.6 + rand() * 2.6;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), walls()[Math.floor(rand() * 4)]);
  body.position.y = h / 2;
  const top = new THREE.Mesh(roof(w, d), roofMat());
  top.position.y = h;
  g.add(body, top);
  for (const side of [-1, 1]) {
    for (const k of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.9), windowMat());
      win.position.set(k * w * 0.27, h * 0.55, side * (d / 2 + 0.02));
      if (side < 0) win.rotation.y = Math.PI;
      g.add(win);
    }
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.8), doorMat());
  door.position.set(0, 1.4, d / 2 + 0.03);
  g.add(door);
  if (rand() < 0.5) {
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2, 0.7), roofMat());
    chimney.position.set(w * 0.3, h + 1.2, 0);
    g.add(chimney);
  }
  return g;
}

/** A wooden chair, `s` times a person's size. */
function chair(s = 1): THREE.Group {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), woodMat());
  seat.position.y = 0.46;
  g.add(seat);
  for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, z < 0 ? 1.0 : 0.46, 0.05), woodMat());
    leg.position.set(x, z < 0 ? 0.5 : 0.23, z);
    g.add(leg);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.04), woodMat());
  back.position.set(0, 0.85, -0.22);
  g.add(back);
  g.scale.setScalar(s);
  return g;
}

/** A park bench, `s` times a person's size: slats, a back, iron ends. */
function bench(s = 1, mat: THREE.Material = woodMat()): THREE.Group {
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 0.12), mat);
    slat.position.set(0, 0.45, -0.15 + k * 0.15);
    g.add(slat);
  }
  for (let k = 0; k < 2; k++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.04), mat);
    slat.position.set(0, 0.62 + k * 0.17, -0.24);
    slat.rotation.x = -0.15;
    g.add(slat);
  }
  for (const x of [-0.8, 0.8]) {
    const end = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.45), ironMat());
    end.position.set(x, 0.22, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.45), ironMat());
    arm.position.set(x, 0.62, 0);
    g.add(end, arm);
  }
  g.scale.setScalar(s);
  return g;
}

/** A bare birch, pale and thin, its branches reaching up. */
function birchTree(h: number, rand: () => number): THREE.Group {
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.3, h, 6), birch());
  trunk.position.y = h / 2;
  trunk.rotation.z = (rand() - 0.5) * 0.12;
  t.add(trunk);
  for (let k = 0; k < 7; k++) {
    const bl = 1.5 + rand() * h * 0.3;
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, bl, 4), birch());
    const a = rand() * Math.PI * 2;
    const y = h * (0.4 + rand() * 0.55);
    br.position.set(Math.cos(a) * bl * 0.3, y + bl * 0.35, Math.sin(a) * bl * 0.3);
    br.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
    t.add(br);
  }
  return t;
}

/**
 * The scenery: an empty town spread thin over the plain at dawn: houses
 * with nobody in them, a chair out on its own, swings swaying empty,
 * benches, bare birches, telephone poles, sheets on a line stirring, an
 * empty birdcage with its door open, grey flowers. On the final lap the
 * colour comes back into all of it and the windows light.
 */
export function emptyFeature(animated: Animated): Feature {
  bloomScenery(animated);
  const swaying: { o: THREE.Object3D; ph: number; amp: number }[] = [];
  animated.push((time) => {
    for (const s of swaying) s.o.rotation.x = Math.sin(time * 1.3 + s.ph) * s.amp;
  });
  const houses: Feature = (x, z, rand) => place(house(rand), x, z, rand);
  const lonelyChair: Feature = (x, z, rand) => place(chair(1.6), x, z, rand);
  const swings: Feature = (x, z, rand) => {
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      for (const k of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.3, 5), ironMat());
        leg.position.set(side * 2, 1.55, k * 0.6);
        leg.rotation.x = -k * 0.2;
        g.add(leg);
      }
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 5), ironMat());
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 3.15;
    g.add(bar);
    for (const sx of [-0.9, 0.9]) {
      const swing = new THREE.Group();
      swing.position.set(sx, 3.15, 0);
      for (const cx of [-0.25, 0.25]) {
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.5, 3), ironMat());
        chain.position.set(cx, -1.25, 0);
        swing.add(chain);
      }
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.25), woodMat());
      seat.position.y = -2.5;
      swing.add(seat);
      g.add(swing);
      swaying.push({ o: swing, ph: rand() * 6, amp: 0.15 + rand() * 0.2 });
    }
    g.scale.setScalar(1.3);
    return place(g, x, z, rand);
  };
  const benches: Feature = (x, z, rand) => place(bench(1.5), x, z, rand);
  const trees: Feature = (x, z, rand) => {
    const g = new THREE.Group();
    const n = rand() < 0.5 ? 1 : 3;
    for (let k = 0; k < n; k++) {
      const t = birchTree(9 + rand() * 9, rand);
      t.position.set((rand() - 0.5) * 5 * (n - 1), 0, (rand() - 0.5) * 5 * (n - 1));
      g.add(t);
    }
    return place(g, x, z, rand);
  };
  const pole: Feature = (x, z, rand) => {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 9, 6), lambert(0x6a625a));
    p.position.y = 4.5;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.14), lambert(0x6a625a));
    arm.position.y = 8.4;
    g.add(p, arm);
    for (const k of [-1, 1]) {
      const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 5), lambert(0xd8d8d0));
      ins.position.set(k * 1, 8.6, 0);
      // A wire sagging off toward nowhere.
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 14, 3), ironMat());
      wire.rotation.x = Math.PI / 2 - 0.1;
      wire.position.set(k * 1, 8.0, 7);
      g.add(ins, wire);
    }
    return place(g, x, z, rand);
  };
  const line: Feature = (x, z, rand) => {
    const g = new THREE.Group();
    for (const k of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 5), woodMat());
      post.position.set(k * 3, 1.2, 0);
      g.add(post);
    }
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 6, 3), ironMat());
    rope.rotation.z = Math.PI / 2;
    rope.position.y = 2.35;
    g.add(rope);
    for (let k = 0; k < 3; k++) {
      const sheet = new THREE.Group();
      sheet.position.set(-2 + k * 2, 2.35, 0);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.5), sheetMat());
      cloth.position.y = -0.75;
      sheet.add(cloth);
      g.add(sheet);
      swaying.push({ o: sheet, ph: rand() * 6 + k, amp: 0.35 });
    }
    return place(g, x, z, rand);
  };
  const cage: Feature = (x, z, rand) => {
    const g = new THREE.Group();
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.25, 1.6, 6), ironMat());
    stand.position.y = 0.8;
    g.add(stand);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      if (k === 0) continue; // the door, open
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 3), ironMat());
      bar.position.set(Math.cos(a) * 0.45, 2.15, Math.sin(a) * 0.45);
      g.add(bar);
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.47, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5e626a, wireframe: true }));
    dome.position.y = 2.7;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 12), ironMat());
    base.position.y = 1.6;
    g.add(dome, base);
    g.scale.setScalar(1.6);
    return place(g, x, z, rand);
  };
  const flowers: Feature = (x, z, rand) => {
    const g = new THREE.Group();
    for (let k = 0; k < 9; k++) {
      const h = 0.5 + rand() * 0.6;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, h, 3), stemMat());
      const px = (rand() - 0.5) * 2.4;
      const pz = (rand() - 0.5) * 2.4;
      stem.position.set(px, h / 2, pz);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), petalMats()[Math.floor(rand() * PETALS.length)]);
      head.position.set(px, h, pz);
      g.add(stem, head);
    }
    g.scale.setScalar(1.6);
    return place(g, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [0.24, houses],
      [0.2, trees],
      [0.07, lonelyChair],
      [0.06, swings],
      [0.08, benches],
      [0.1, pole],
      [0.07, line],
      [0.04, cage],
      [0.14, flowers],
    ])(x, z, rand);
}

const startFace = once(() => signFace(['EMPTY']));

/**
 * The start: a great metronome of dark walnut standing astride the road,
 * an A of two legs leaning in over it, its scale plate between them, and
 * its arm ticking the waltz over the line, one-two-three, the weight
 * glinting; EMPTY hung under the pivot. The song's mechanical clicks.
 */
export function metronome(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2.5;
  const walnut = lambert(0x4a3226, { flatShading: true });
  const brass = new THREE.MeshPhongMaterial({ color: 0xc8a860, shininess: 80, specular: 0xfff0c0 });
  const TOP = 26;
  for (const side of [-1, 1]) {
    const len = Math.hypot(hw - 2.5, TOP);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(2.6, len, 2.6), walnut);
    leg.position.set(side * (hw + 2.5) * 0.5, TOP / 2, 0);
    leg.rotation.z = side * Math.atan2(hw - 2.5, TOP);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 4), walnut);
    foot.position.set(side * hw, 0.6, 0);
    g.add(leg, foot);
  }
  const cap = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2, 3), walnut);
  cap.position.y = TOP;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * hw * 0.62, 1, 1.6), walnut);
  beam.position.y = 9;
  // The scale plate, cream, its tempo marks.
  const plateTex = (() => {
    const [c, ctx] = canvas(128, 512);
    ctx.fillStyle = '#ece4d0';
    ctx.fillRect(0, 0, 128, 512);
    ctx.fillStyle = '#3a2a20';
    ctx.font = '22px Georgia, serif';
    ctx.textAlign = 'center';
    ['208', '176', '144', '120', '100', '84', '72', '60', '50', '40'].forEach((t, k) => {
      ctx.fillRect(20, 30 + k * 48, 88, 2);
      ctx.fillText(t, 64, 58 + k * 48);
    });
    return finish(c, false);
  })();
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(3, 13), new THREE.MeshLambertMaterial({ map: plateTex }));
  plate.position.set(0, 17, -1.2);
  plate.rotation.y = Math.PI;
  g.add(cap, beam, plate);
  const sign = signPanel(9, startFace(), walnut);
  sign.position.y = 6.2;
  g.add(sign);
  // The arm: a rod up from a pivot on the beam, its weight part way up.
  const arm = new THREE.Group();
  arm.position.set(0, 9.6, -1.6);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 17, 6), brass);
  rod.position.y = 8.5;
  const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 2.2, 4), brass);
  weight.position.y = 11;
  weight.rotation.y = Math.PI / 4;
  const pivot = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), brass);
  arm.add(rod, weight, pivot);
  g.add(arm);
  const flash = sprite(0xfff4e0, 6, 0);
  flash.position.set(0, 26, -1.6);
  g.add(flash);
  animated.push((time) => {
    // Three beats to a bar at 120 to the minute: a swing a beat, the tick at each end, the one brighter.
    const beat = time * 2;
    arm.rotation.z = 0.42 * Math.sin(Math.PI * beat);
    const k = Math.floor(beat) % 3;
    const tick = Math.max(0, 1 - (beat - Math.floor(beat)) * 4);
    flash.material.opacity = tick * (k === 0 ? 0.8 : 0.3);
  });
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * Feeling so empty: an empty stage in the middle of the north loop, an
 * old wooden stage under a proscenium with its curtains drawn back, rows
 * of empty seats facing it, one chair on the boards, and the ghost light,
 * a bare bulb on a stand, left burning for nobody. On the final lap the
 * curtains blush red.
 */
export function emptyStage(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = offRoad(ribbon, s, lateral);
  const S = 1.7;
  const boards = lambert(0x9a9286, { flatShading: true });
  const curtain = lambert(0xc8b0b0, { flatShading: true });
  const fade = bloom(curtain, 0x9a1a24);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 7), boards);
  floor.position.set(0, 0.6, -4);
  g.add(floor);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1, 7, 1), boards);
    pillar.position.set(side * 6.5, 4.7, -6.8);
    g.add(pillar);
    // The curtain drawn back to the pillar, in folds.
    for (let k = 0; k < 4; k++) {
      const fold = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 6.2, 6), curtain);
      fold.position.set(side * (5.6 - k * 0.45), 4.3, -6.4 + k * 0.1);
      g.add(fold);
    }
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(14, 1.4, 1.2), boards);
  header.position.set(0, 8.4, -6.8);
  const valance = new THREE.Mesh(new THREE.BoxGeometry(12.2, 1, 0.4), curtain);
  valance.position.set(0, 7.4, -6.4);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(13, 7), lambert(0x3a3c44));
  back.position.set(0, 4.7, -7.3);
  g.add(header, valance, back);
  const solo = chair(1.1);
  solo.position.set(-2.4, 1.2, -4.5);
  solo.rotation.y = 0.5;
  g.add(solo);
  // The ghost light.
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), ironMat());
  stand.position.set(1.5, 2.4, -3.4);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 10), ironMat());
  foot.position.set(1.5, 1.25, -3.4);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff4dc }));
  bulb.position.set(1.5, 3.75, -3.4);
  const glow = sprite(0xffe8c0, 5, 0.75);
  glow.position.copy(bulb.position);
  g.add(stand, foot, bulb, glow);
  // Rows of empty seats.
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 9; c++) {
      if ((r * 7 + c * 3) % 11 === 0) continue;
      const seat = chair(1);
      seat.position.set((c - 4) * 1.3, 0, 2 + r * 1.5);
      seat.rotation.y = Math.PI;
      g.add(seat);
    }
  }
  animated.push((time) => {
    fade();
    glow.material.opacity = 0.65 + 0.1 * Math.sin(time * 1.7);
  });
  g.scale.setScalar(S);
  g.position.set(p.x, 0, p.z);
  // Facing back toward the road at `s`.
  g.rotation.y = p.heading + (lateral > 0 ? -Math.PI / 2 : Math.PI / 2);
  return g;
}

/** The clock's face, shot through its head: cream, Roman numerals, its hands stopped, a bullet hole near the top and cracks running out from it. */
const clockFace = once(() => {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#ece6d6';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a3a40';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = '#3a3a40';
  ctx.font = '22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((t, k) => {
    const a = (k / 12) * Math.PI * 2;
    ctx.fillText(t, S / 2 + Math.sin(a) * 100, S / 2 - Math.cos(a) * 100);
  });
  // The hole, and the cracks out of it.
  const hx = S / 2 + 20;
  const hy = S / 2 - 52;
  const rand = seededRandom(8141);
  ctx.strokeStyle = 'rgba(40,40,44,0.85)';
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 14; k++) {
    const a = rand() * Math.PI * 2;
    let x = hx;
    let y = hy;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += Math.cos(a + (rand() - 0.5) * 0.6) * (10 + rand() * 18);
      y += Math.sin(a + (rand() - 0.5) * 0.6) * (10 + rand() * 18);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#0a0a0c';
  ctx.beginPath();
  ctx.arc(hx, hy, 9, 0, Math.PI * 2);
  ctx.fill();
  return finish(c, false);
});

/** The road shot through: cracks running out over the road from the hole, as in glass. */
const shatterTexture = once(() => {
  const S = 512;
  const [c, ctx] = canvas(S);
  const rand = seededRandom(8151);
  ctx.strokeStyle = 'rgba(30,32,36,0.85)';
  ctx.lineCap = 'round';
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2 + rand() * 0.1;
    let x = S / 2;
    let y = S / 2;
    ctx.lineWidth = 2 + rand() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const len = 140 + rand() * 110;
    for (let d = 0; d < len; d += 20) {
      x += Math.cos(a + (rand() - 0.5) * 0.4) * 20;
      y += Math.sin(a + (rand() - 0.5) * 0.4) * 20;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Rings of cracks round the hole.
  for (const r of [70, 120, 175]) {
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const rr = r + (rand() - 0.5) * 16;
      const x = S / 2 + Math.cos(a) * rr;
      const y = S / 2 + Math.sin(a) * rr;
      if (a === 0 || rand() < 0.25) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const t = finish(c, false);
  return t;
});

/**
 * Life is death, because I shot it through its head: a pale clock tower
 * beside the leap, its face toward the karts coming at it, shot through
 * near the top and its hands stopped at the moment; on the road, cracks
 * running out from the hole like a bullet's in glass. On the final lap
 * the hands go round again.
 */
export function shotClock(ribbon: Ribbon, s: number, pits: readonly PitDef[], animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s);
  const stone = lambert(0xd8d4ca, { flatShading: true });
  const slate = lambert(0x5a6270, { flatShading: true });
  const tower = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(7, 26, 7), stone);
  body.position.y = 13;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.8, 7.6), stone);
  belt.position.y = 18;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(5.6, 9, 4), slate);
  spire.position.y = 30.5;
  spire.rotation.y = Math.PI / 4;
  tower.add(body, belt, spire);
  const faceMat = new THREE.MeshLambertMaterial({ map: clockFace() });
  const hands: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.CircleGeometry(2.9, 32), faceMat);
    face.position.set(0, 22.5, side * 3.52);
    if (side < 0) face.rotation.y = Math.PI;
    tower.add(face);
    const hourH = new THREE.Group();
    const minH = new THREE.Group();
    for (const [h, len, w] of [[hourH, 1.6, 0.22], [minH, 2.4, 0.14]] as const) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.06), lambert(0x1a1a1e));
      bar.position.y = len / 2;
      h.add(bar);
      h.position.set(0, 22.5, side * 3.6);
      if (side < 0) h.rotation.y = Math.PI;
      tower.add(h);
    }
    hands.push(hourH, minH);
  }
  // Beside the road on its left, its faces along the road.
  tower.position.set(hw + 12, 0, 6);
  g.add(tower);
  // The cracks on the road out from the hole.
  const pit = pits.reduce<PitDef | undefined>((best, p) => (Math.hypot(p.x - f.x, p.z - f.z) < (best ? Math.hypot(best.x - f.x, best.z - f.z) : 40) ? p : best), undefined);
  const decals = new THREE.Group();
  if (pit) {
    const d = 2 * (hw + 4);
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(d, d), new THREE.MeshBasicMaterial({ map: shatterTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    crack.rotation.x = -Math.PI / 2;
    crack.renderOrder = 2;
    crack.position.set(pit.x, 0.08, pit.z);
    crack.rotation.z = pit.heading;
    decals.add(crack);
    // Chunks of road thrown up round the hole's edge.
    const rand = seededRandom(8161);
    for (let k = 0; k < 14; k++) {
      const a = rand() * Math.PI * 2;
      const r = pit.halfWidth * (0.9 + rand() * 0.6);
      const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + rand() * 0.5, 0), lambert(0xd0ccc2, { flatShading: true }));
      const lx = Math.cos(a) * r;
      const lz = Math.sin(a) * (pit.halfLength + 3);
      // Only off the road's line, either side.
      if (Math.abs(lx) < hw + 1) continue;
      chunk.position.set(pit.x + Math.cos(pit.heading) * lx + Math.sin(pit.heading) * lz, 0.3, pit.z - Math.sin(pit.heading) * lx + Math.cos(pit.heading) * lz);
      decals.add(chunk);
    }
  }
  const STOP = 0.71;
  animated.push((time) => {
    // Stopped at the moment it was shot; going again on the final lap.
    const run = atmosphere.finalLap;
    const t = STOP + run * time * 0.05;
    for (let k = 0; k < hands.length; k += 2) {
      hands[k].rotation.z = -t * Math.PI * 2;
      hands[k + 1].rotation.z = -t * 12 * Math.PI * 2;
    }
  });
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  const out = new THREE.Group();
  out.add(g, decals);
  return out;
}

/** The colour round the one you're with: green grass and flowers in their colours, feathering out into the pale plain. */
const warmGroundTexture = once(() => {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 8171);
  const edge = fbm(S, 4, 3, 8172);
  paint(
    ctx,
    S,
    S,
    (_x, _y, i) => shade(mix([70, 130, 60], [120, 170, 80], n[i]), 0.85 + n[i] * 0.3),
    (x, y, i) => {
      const r = Math.hypot(x / S - 0.5, y / S - 0.5) * 2;
      return Math.round(255 * (1 - Math.min(1, Math.max(0, (r - 0.55 - (edge[i] - 0.5) * 0.3) / 0.4))));
    },
  );
  const rand = seededRandom(8173);
  const cols = ['#e0303a', '#f0c020', '#8a4ad0', '#f07ab0', '#ffffff', '#ff8030'];
  for (let k = 0; k < 900; k++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * S * 0.36;
    ctx.fillStyle = cols[Math.floor(rand() * cols.length)];
    ctx.beginPath();
    ctx.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 1.5 + rand() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c, false);
});

/**
 * But I don't feel empty when I'm with you: in the middle of the south
 * loop, the one you're with, sitting on a bench, large as a house, in a
 * coat of warm coral and an amber scarf, the only colour on the plain;
 * the place beside them empty, for you, a hand patting it on the one of
 * the waltz. Round the bench the world is in colour, green grass and
 * flowers, a lamp lit warm; on the final lap the colour spreads.
 */
export function companion(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = offRoad(ribbon, s, lateral);
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: warmGroundTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  disc.renderOrder = 1;
  g.add(disc);
  const F = 5.6;
  const seat = new THREE.Group();
  seat.scale.setScalar(F);
  seat.add(bench(1.4, lambert(0xa8703c, { flatShading: true })));
  const coat = lambert(WARM_HEX, { flatShading: true });
  const scarf = lambert(0xf0b030, { flatShading: true });
  const skin = lambert(0xe8b898);
  const hair = lambert(0x4a2a1c, { flatShading: true });
  const trousers = lambert(0x4a3a5a, { flatShading: true });
  const body = new THREE.Group();
  body.position.set(0.55, 0.62, -0.02);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.68, 8), coat);
  torso.position.y = 0.34;
  torso.rotation.x = -0.08;
  const sc = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.06, 6, 10), scarf);
  sc.rotation.x = Math.PI / 2;
  sc.position.y = 0.68;
  const head = new THREE.Group();
  head.position.y = 0.86;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin);
  const locks = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), hair);
  locks.rotation.x = -0.35;
  locks.position.set(0, 0.01, -0.02);
  head.add(face, locks);
  body.add(torso, sc, head);
  for (const k of [-1, 1]) {
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 0.45), trousers);
    thigh.position.set(k * 0.1, -0.02, 0.22);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.48, 0.13), trousers);
    shin.position.set(k * 0.1, -0.26, 0.44);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.24), lambert(0x2a2224));
    shoe.position.set(k * 0.1, -0.5, 0.5);
    body.add(thigh, shin, shoe);
  }
  // One arm in the lap; the other out over the empty place beside them, patting it.
  const lapArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.42), coat);
  lapArm.position.set(0.18, 0.18, 0.18);
  body.add(lapArm);
  const reach = new THREE.Group();
  reach.position.set(-0.22, 0.56, 0);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.1), coat);
  upper.position.y = -0.2;
  upper.rotation.z = -0.6;
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), skin);
  hand.position.set(-0.32, -0.42, 0.05);
  reach.add(upper, hand);
  body.add(reach);
  seat.add(body);
  g.add(seat);
  const glow = sprite(GLOW_HEX, 22, 0.35);
  glow.position.y = 3.2 * F * 0.5;
  g.add(glow);
  // A lamp by the bench, lit warm.
  const lamp = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 9, 6), ironMat());
  post.position.y = 4.5;
  const head2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.25, 0.8, 6), ironMat());
  head2.position.y = 9.2;
  const lit = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd090 }));
  lit.position.y = 8.85;
  const lampGlow = sprite(0xffb060, 7, 0.6);
  lampGlow.position.y = 8.85;
  lamp.add(post, head2, lit, lampGlow);
  lamp.scale.setScalar(1.4);
  lamp.position.set(-1.3 * F, 0, -1.5);
  g.add(lamp);
  animated.push((time) => {
    const spread = 1 + 0.6 * atmosphere.finalLap;
    disc.scale.set(60 * spread, 60 * spread, 1);
    // Patting the place beside them on the one of each bar.
    const bar = (time * 2) / 3;
    const u = bar - Math.floor(bar);
    reach.rotation.x = u < 0.33 ? -0.25 * Math.sin((u / 0.33) * Math.PI) : 0;
    head.rotation.y = 0.35 * Math.sin(time * 0.3);
    body.position.y = 0.62 + 0.008 * Math.sin(time * 1.6);
    glow.material.opacity = 0.3 + 0.08 * Math.sin(time * 1.2) + 0.2 * atmosphere.finalLap;
  });
  g.position.set(p.x, 0, p.z);
  // Facing out across the loop toward the road at `s`.
  g.rotation.y = p.heading + (lateral > 0 ? -Math.PI / 2 : Math.PI / 2);
  return g;
}

const worksFace = once(() => signFace(['ROAD WORKS'], '#f0c020', '#1a1a1e'));
const wetFace = once(() => signFace(['WET', 'CONCRETE'], '#ece8e0', '#a01a1a'));

/**
 * Never set it in stone: the works, where the new road is poured straight
 * across and the old one swings out round it: timber formwork down both
 * sides of the pour, stakes and string lines, a cement mixer, a roller,
 * cones, ROAD WORKS and WET CONCRETE boards, and over it all a great
 * tablet of stone with nothing carved in it.
 */
export function setInStone(ribbon: Ribbon, s: number, pits: readonly PitDef[], animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const pit = pits.reduce<PitDef | undefined>((best, p) => (Math.hypot(p.x - f.x, p.z - f.z) < (best ? Math.hypot(best.x - f.x, best.z - f.z) : 60) ? p : best), undefined);
  const L = pit ? pit.halfLength : 30;
  const W = pit ? pit.halfWidth : 8;
  const timber = lambert(0xb08a5a, { flatShading: true });
  for (const side of [-1, 1]) {
    const form = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 2 * L), timber);
    form.position.set(side * (W + 0.3), 0.2, 0);
    g.add(form);
    for (let z = -L; z <= L; z += 6) {
      const stake = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 0.2), timber);
      stake.position.set(side * (W + 0.7), 0.4, z);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1, 8), lambert(0xf06020));
      cone.position.set(side * (W + 2.2), 0.5, z + 3);
      g.add(stake, cone);
    }
  }
  // The blank tablet, standing over the far end of the pour.
  const stone = lambert(0xd8d6d0, { flatShading: true });
  const tablet = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(7, 9, 1.4), stone);
  slab.position.y = 4.5;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 1.4, 20, 1, false, -Math.PI / 2, Math.PI), stone);
  crown.rotation.x = Math.PI / 2;
  crown.rotation.z = Math.PI / 2;
  crown.position.y = 9;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.2, 2.6), stone);
  plinth.position.y = 0.6;
  tablet.add(slab, crown, plinth);
  tablet.position.set(W + 12, 0, L * 0.4);
  tablet.rotation.y = -0.3;
  g.add(tablet);
  // The mixer, its drum turning, and a roller.
  const mixer = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 2.4), lambert(0xd8a820, { flatShading: true }));
  frame.position.y = 0.7;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.1, 1.8, 10), lambert(0xe06020, { flatShading: true }));
  drum.position.set(0, 2.1, 0.2);
  drum.rotation.x = -0.8;
  mixer.add(frame, drum);
  mixer.position.set(-W - 7, 0, -L * 0.5);
  mixer.scale.setScalar(1.6);
  const roller = new THREE.Group();
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.6, 14), lambert(0x6a6e74));
  roll.rotation.z = Math.PI / 2;
  roll.position.y = 1;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2.4), lambert(0xd8a820, { flatShading: true }));
  cab.position.set(0, 1.6, -2.2);
  roller.add(roll, cab);
  roller.position.set(-W - 6, 0, L * 0.45);
  roller.rotation.y = 0.4;
  g.add(mixer, roller);
  const works = signPanel(5, worksFace(), timber);
  works.position.set(-W - 3, 3, -L - 2);
  const wet = signPanel(4, wetFace(), timber);
  wet.position.set(W + 3, 2.6, -L - 2);
  for (const sg of [works, wet]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 0.2), timber);
    leg.position.set(sg.position.x, 1, sg.position.z);
    g.add(sg, leg);
  }
  animated.push((time) => {
    drum.rotation.y = time * 1.2;
  });
  if (pit) {
    g.position.set(pit.x, 0, pit.z);
    g.rotation.y = pit.heading;
  } else {
    g.position.set(f.x, Math.max(0, f.y), f.z);
    g.rotation.y = f.heading;
  }
  return g;
}

/** A wanderer's coat and hat; the one you're with is filled. */
const HAT_Y = 2.75;

/**
 * A wanderer, the hazard's look: a long coat and a hat walking with
 * nobody in them, pale and half see-through, empty sleeves swinging, the
 * hat floating over an empty collar; or the one who isn't empty: the
 * same coat warm coral, a face under the hat, a scarf, a glow round them
 * and a pool of warm light on the road at their feet.
 */
export function wandererParts(obj: THREE.Object3D, you: boolean): THREE.Object3D[] {
  const fig = new THREE.Group();
  const coatMat = you ? new THREE.MeshLambertMaterial({ color: WARM_HEX, transparent: true, flatShading: true }) : new THREE.MeshLambertMaterial({ color: 0x8e98a8, transparent: true, opacity: 0.74, depthWrite: false, flatShading: true });
  const hatMat = you ? new THREE.MeshLambertMaterial({ color: 0x3a2a24, transparent: true }) : new THREE.MeshLambertMaterial({ color: 0x4a525e, transparent: true, opacity: 0.88, depthWrite: false });
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.62, 1.9, 10, 1, !you), coatMat);
  coat.position.y = 1.15;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 6, 12), coatMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 2.12;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 14), hatMat);
  brim.position.y = HAT_Y;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.38, 12), hatMat);
  crown.position.y = HAT_Y + 0.2;
  fig.add(coat, collar, brim, crown);
  const arms: THREE.Object3D[] = [];
  for (const k of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(k * 0.42, 1.95, 0);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.95, 6, 1, !you), coatMat);
    sleeve.position.y = -0.48;
    arm.add(sleeve);
    fig.add(arm);
    arms.push(arm);
  }
  const extra = new THREE.Group();
  if (you) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshLambertMaterial({ color: 0xe8b898, transparent: true }));
    head.position.y = 2.42;
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.09, 6, 12), new THREE.MeshLambertMaterial({ color: 0xf0b030, transparent: true }));
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 2.18;
    fig.add(head, scarf);
    const halo = sprite(GLOW_HEX, 6, 0.55);
    halo.position.y = 1.6;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.4, 20), new THREE.MeshBasicMaterial({ color: 0xffa860, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.07;
    extra.add(halo, pool);
  } else {
    // A faint shadow of nobody.
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), new THREE.MeshBasicMaterial({ color: 0x40464e, transparent: true, opacity: 0.25, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.06;
    extra.add(shadow);
  }
  fig.scale.setScalar(1.45);
  obj.add(fig, extra);
  return [fig, extra, ...arms];
}

/** Poses a wanderer (from wandererParts): facing the way it drifts, stepping on the one and swaying on the two and three, fading at the edges. */
export function poseWanderer(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose): void {
  const [fig, extra, armL, armR] = parts;
  // Facing across the road the way it's going (a lateral to the right is the road's local -x).
  obj.rotation.y = p.heading - (p.side * Math.PI) / 2;
  const q = p.phase * WANDER_BARS;
  const f = q - Math.floor(q);
  const step = f < 1 / 3 ? Math.sin(f * 3 * Math.PI) : 0;
  const sway = f >= 1 / 3 ? Math.sin(((f - 1 / 3) / (2 / 3)) * Math.PI * 2) : 0;
  fig.position.y = 0.12 * step;
  fig.rotation.x = 0.12 * step;
  fig.rotation.z = 0.09 * sway;
  armL.rotation.x = 0.5 * step;
  armR.rotation.x = -0.5 * step;
  const fade = p.gap;
  obj.visible = fade > 0.01;
  const opacity = (m: THREE.Material, full: number) => {
    m.opacity = full * fade;
  };
  fig.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshLambertMaterial;
    m.userData.full ??= m.opacity;
    opacity(m, m.userData.full);
  });
  extra.traverse((o) => {
    if (!(o instanceof THREE.Mesh) && !(o instanceof THREE.Sprite)) return;
    const m = o.material as THREE.Material;
    m.userData.full ??= m.opacity;
    opacity(m, m.userData.full);
  });
}
