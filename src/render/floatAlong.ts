import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { pointAt } from '../tracks/spline';
import type { PitDef } from '../tracks/builder';
import type { Ribbon } from '../tracks/track';
import { billboardTexture, glowTexture } from './textures';

/**
 * Float Along's world, after the Float Along – Fill Your Lungs album's
 * closer: the barn in the country of a morning, Stu's old Ford outside it
 * with its headlights left on and its chime going in 5/4; golden paddocks,
 * a farm dam, ghost gums, round bales, sheep and a windmill under a soft
 * blue sky; and the face he sees everywhere, in the clouds, in the folded
 * paper and the coffee mug. Its textures (the gravel road, the paddock, the
 * dam's earth banks, the post-and-rail fence), its scenery and its
 * landmarks.
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type Animated = ((time: number) => void)[];
type RGB = [number, number, number];

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const additive = (map: THREE.Texture, color: number) => new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false });

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
const css = ([r, g, b]: RGB) => `rgb(${r | 0},${g | 0},${b | 0})`;

/**
 * The road: a country road of pale crushed gravel, a wheel track worn
 * smooth and darker down each half of it (the texture spans half the road,
 * its v running along it), loose stones heaped on the crown and at the
 * edges, where the weeds come up.
 */
export function gravelTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 2101);
  const weeds = fbm(S, 8, 3, 2102);
  paint(ctx, S, S, (x, _y, i) => {
    const u = x / S;
    const rut = Math.abs(u - 0.5);
    const base = mix([170, 156, 126], [210, 198, 168], n[i]);
    const crown = Math.min(u, 1 - u);
    if (crown < 0.05 && weeds[i] > 0.6 + crown * 4) return mix([138, 128, 70], [176, 162, 96], n[i]);
    if (rut < 0.15) return shade(mix(base, [156, 142, 116], 0.55), 0.9 + n[i] * 0.06 + (rut / 0.15) * 0.04);
    return base;
  });
  const rand = seededRandom(2103);
  for (let k = 0; k < 1500; k++) {
    const u = rand();
    const rut = Math.abs(u - 0.5);
    // Few stones in the wheel track, more heaped on the crown.
    if (rut < 0.15 && rand() < 0.8) continue;
    const x = u * S;
    const y = rand() * S;
    const r = 0.8 + rand() * (Math.min(u, 1 - u) < 0.12 ? 2.4 : 1.6);
    const tone = rand();
    const col: RGB = tone < 0.5 ? mix([120, 112, 100], [228, 222, 206], rand()) : tone < 0.8 ? mix([160, 120, 76], [214, 176, 120], rand()) : [96, 90, 84];
    const ry = r * (0.6 + rand() * 0.4);
    const rot = rand() * Math.PI;
    // Drawn again a tile over each way, so it wraps.
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        ctx.fillStyle = css(col);
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, r, ry, rot, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x + ox - r * 0.4, y + oy - r * 0.4, r * 0.5, r * 0.4);
      }
    }
  }
  // A few weeds up the crown.
  ctx.strokeStyle = 'rgba(120,130,50,0.8)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 40; k++) {
    const x = (rand() - 0.5) * 0.08 * S;
    const y = rand() * S;
    for (let b = 0; b < 4; b++) {
      const dx = (rand() - 0.5) * 6;
      const dy = -3 - rand() * 4;
      for (const ox of [0, S]) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y);
        ctx.lineTo(x + ox + dx, y + dy);
        ctx.stroke();
      }
    }
  }
  return finish(c);
}

/** The ground: a golden paddock of dry grass at the end of summer, greener where the water lies, bare dirt in the stock tracks. */
export function paddockTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 5, 2111);
  const green = fbm(S, 3, 3, 2112);
  const bare = fbm(S, 4, 3, 2113);
  paint(ctx, S, S, (_x, _y, i) => {
    if (bare[i] > 0.7) return mix([150, 118, 80], [184, 150, 104], n[i]);
    const gold = mix([176, 144, 72], [222, 194, 114], n[i]);
    return green[i] > 0.6 ? mix(gold, [126, 142, 66], Math.min(1, (green[i] - 0.6) * 5)) : gold;
  });
  const rand = seededRandom(2114);
  ctx.lineWidth = 1;
  for (let k = 0; k < 2600; k++) {
    const x = rand() * S;
    const y = rand() * S;
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(240,214,140,0.55)' : 'rgba(120,96,46,0.45)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 5, y - 4 - rand() * 6);
    ctx.stroke();
  }
  return finish(c);
}

/** The dam's banks and the cut beneath them: red clay laid down in bands, roots and stones in it, golden grass along the top. */
export function damBankTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 4, 2121);
  const band = fbm(S, 2, 2, 2122);
  paint(ctx, S, S, (x, y, i) => {
    const v = y / S;
    if (v < 0.1 + n[i] * 0.06) return mix([150, 130, 62], [204, 178, 100], n[i]);
    const layer = Math.sin((v * 9 + band[i] * 1.6) * Math.PI);
    const clay = mix([132, 78, 46], [188, 128, 80], n[i]);
    return shade(layer > 0.55 ? mix(clay, [210, 170, 116], 0.4) : clay, 0.86 + (x % 64 < 2 ? -0.06 : 0) + layer * 0.06);
  });
  const rand = seededRandom(2123);
  ctx.strokeStyle = 'rgba(70,44,26,0.7)';
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 18; k++) {
    let x = rand() * S;
    let y = S * (0.12 + rand() * 0.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (rand() - 0.5) * 14;
      y += 6 + rand() * 10;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = css(mix([110, 100, 92], [180, 170, 160], rand()));
    ctx.beginPath();
    ctx.ellipse(rand() * S, S * (0.2 + rand() * 0.8), 2 + rand() * 4, 2 + rand() * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

/** The barrier: a post-and-rail fence of weathered grey timber. */
export function fenceTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 3, 2131);
  paint(ctx, S, S, (x, y, i) => {
    const v = y / S;
    const post = x % 128 < 18;
    const rail = (v > 0.12 && v < 0.34) || (v > 0.58 && v < 0.8);
    const grain = 0.85 + 0.15 * Math.sin(y * 0.9 + n[i] * 8) * (post ? 0 : 1) + 0.1 * Math.sin(x * 0.7 + n[i] * 6) * (post ? 1 : 0);
    const wood = shade(mix([132, 124, 108], [178, 170, 150], n[i]), grain);
    if (post) return shade(wood, 0.82);
    if (rail) return wood;
    // Between the rails: the paddock behind, in shadow.
    return shade(mix([150, 124, 64], [190, 160, 90], n[i]), 0.7);
  });
  return finish(c);
}

/** Corrugated iron, a little rusted: the barn's roof and walls, and the water tanks. */
const ironTexture = once(() => {
  const S = 128;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 4, 3, 2141);
  paint(ctx, S, S, (x, _y, i) => {
    const ridge = 0.8 + 0.2 * Math.sin((x / S) * Math.PI * 2 * 16);
    const iron = mix([150, 156, 158], [200, 204, 204], n[i]);
    return shade(n[i] > 0.7 ? mix(iron, [150, 90, 50], (n[i] - 0.7) * 2.5) : iron, ridge);
  });
  return finish(c);
});

/** The face, drawn in the froth on a coffee: two eyes and a smile in the crema. */
const coffeeTexture = once(() => {
  const S = 128;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#3a2214';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#c89a68';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a3420';
  for (const x of [0.38, 0.62]) {
    ctx.beginPath();
    ctx.arc(S * x, S * 0.42, S * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#5a3420';
  ctx.lineWidth = S * 0.04;
  ctx.beginPath();
  ctx.arc(S / 2, S * 0.5, S * 0.17, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  return finish(c, false);
});

const glowTex = once(() => glowTexture());

function frameAt(ribbon: Ribbon, s: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x, z: p.z, y: ribbon.heightAt(s), heading: Math.atan2(p.tx, p.tz) };
}

/** Where a landmark `lateral` metres off the road at `s` stands. */
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

/**
 * The old Ford: a 70s sedan, faded blue, chrome bumpers, its headlights
 * left on. Sits at the origin facing +z, 5 m long. Its lights, to set
 * glowing.
 */
function ford(): { car: THREE.Group; lights: THREE.Sprite[]; beams: THREE.Mesh[] } {
  const car = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color: 0x5a7a96, shininess: 40, specular: 0x6a7a80 });
  const chrome = new THREE.MeshPhongMaterial({ color: 0xd8dce0, shininess: 160, specular: 0xffffff });
  const glass = new THREE.MeshPhongMaterial({ color: 0x2a3a48, shininess: 120, specular: 0xc0d0e0 });
  const tyre = lambert(0x18181a);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 5), paint);
  body.position.y = 0.8;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 2.3), glass);
  cabin.position.set(0, 1.5, -0.4);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.12, 2.1), paint);
  roof.position.set(0, 1.9, -0.45);
  car.add(body, cabin, roof);
  for (const z of [2.55, -2.55]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.22, 0.16), chrome);
    bumper.position.set(0, 0.5, z);
    car.add(bumper);
  }
  for (const [x, z] of [[-0.95, 1.6], [0.95, 1.6], [-0.95, -1.6], [0.95, -1.6]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), tyre);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.42, z);
    car.add(w);
  }
  const lights: THREE.Sprite[] = [];
  const beams: THREE.Mesh[] = [];
  for (const x of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.18, 12), new THREE.MeshBasicMaterial({ color: 0xfff4d0 }));
    lamp.position.set(x, 0.85, 2.51);
    const glow = new THREE.Sprite(additive(glowTex(), 0xffe8b0));
    glow.scale.setScalar(2.2);
    glow.position.set(x, 0.85, 2.7);
    // A beam reaching out in front, the way headlights do on a hazy morning.
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(2.4, 16, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(x, 0.85, 2.5 + 8);
    car.add(lamp, glow, beam);
    lights.push(glow);
    beams.push(beam);
  }
  return { car, lights, beams };
}

/** A beat of the Ford's chime, the song's 5/4: how bright its lights are at `time`, the bar's first beat brightest. */
function chime(time: number): number {
  const beat = time / 0.55;
  const k = Math.floor(beat) % 5;
  const decay = 1 - (beat - Math.floor(beat));
  return 0.55 + (k === 0 ? 0.45 : 0.22) * decay * decay;
}

/** A barn: weathered timber walls, a gable roof of corrugated iron, a big door open. Sits at the origin, its door facing +z. */
function barn(w: number, d: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const boards = lambert(0x7a6a56);
  const iron = new THREE.MeshLambertMaterial({ map: ironTexture() });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boards);
  walls.position.y = h / 2;
  g.add(walls);
  const rise = w * 0.3;
  for (const side of [-1, 1]) {
    const pitch = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(w / 2, rise) + 0.8, 0.2, d + 1.2), iron);
    pitch.position.set((side * w) / 4, h + rise / 2, 0);
    pitch.rotation.z = -side * Math.atan2(rise, w / 2);
    g.add(pitch);
  }
  const gable = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rise)]);
  for (const z of [d / 2 + 0.01, -d / 2 - 0.01]) {
    const tri = new THREE.Mesh(new THREE.ShapeGeometry(gable), new THREE.MeshLambertMaterial({ color: 0x7a6a56, side: THREE.DoubleSide }));
    tri.position.set(0, h, z);
    g.add(tri);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.45, h * 0.8), lambert(0x1a140e));
  door.position.set(0, h * 0.4, d / 2 + 0.02);
  g.add(door);
  return g;
}

/**
 * The barn in the country: ghost gums, round bales, sheep, a windmill
 * turning, corrugated iron water tanks, the odd post-and-rail fence; and
 * where you look again, the face: a folded paper boat, a coffee mug with a
 * smile in its crema.
 */
export function paddockFeature(animated: Animated): Feature {
  const bark = lambert(0xe0d8c8);
  const barkDark = lambert(0x9a8a74);
  const leaves = lambert(0x7a9468, { flatShading: true });
  const hay = lambert(0xd8b860);
  const hayEnd = lambert(0xb89440);
  const wool = lambert(0xece6d8);
  const black = lambert(0x1e1a18);
  const steel = lambert(0x8a8e90);
  const iron = new THREE.MeshLambertMaterial({ map: ironTexture() });
  const paper = lambert(0xf8f6f0, { side: THREE.DoubleSide, flatShading: true });
  const mugMat = new THREE.MeshPhongMaterial({ color: 0xf0ece4, shininess: 80, specular: 0xffffff });
  const coffee = new THREE.MeshLambertMaterial({ map: coffeeTexture() });
  const timber = lambert(0x8a8070);
  const puff = new THREE.IcosahedronGeometry(1, 1);
  const gum: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 10 + rand() * 9;
    const lean = (rand() - 0.5) * 0.25;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, h, 7), rand() < 0.7 ? bark : barkDark);
    trunk.position.y = h / 2;
    trunk.rotation.z = lean;
    t.add(trunk);
    // A ghost gum's crown: clumps of grey-green leaves, sparse, the sky through them.
    for (let k = 0; k < 5; k++) {
      const c = new THREE.Mesh(puff, leaves);
      c.scale.set(2 + rand() * 2, 1.2 + rand(), 2 + rand() * 2);
      c.position.set(-Math.sin(lean) * h + (rand() - 0.5) * 6, h * (0.75 + rand() * 0.35), (rand() - 0.5) * 6);
      t.add(c);
    }
    return place(t, x, z, rand);
  };
  const bale: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = rand() < 0.4 ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.3, 16), hay);
      b.rotation.z = Math.PI / 2;
      b.position.set(0, 0.9, k * 2);
      const end = new THREE.Mesh(new THREE.CircleGeometry(0.88, 16), hayEnd);
      end.rotation.y = Math.PI / 2;
      end.position.set(0.66, 0.9, k * 2);
      t.add(b, end);
    }
    return place(t, x, z, rand);
  };
  const sheep: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 2 + Math.floor(rand() * 4);
    const heads: THREE.Object3D[] = [];
    for (let k = 0; k < n; k++) {
      const s = new THREE.Group();
      const body = new THREE.Mesh(puff, wool);
      body.scale.set(0.55, 0.45, 0.8);
      body.position.y = 0.75;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.4), black);
      head.position.set(0, 0.7, 0.8);
      s.add(body, head);
      for (const [lx, lz] of [[-0.25, 0.4], [0.25, 0.4], [-0.25, -0.4], [0.25, -0.4]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), black);
        leg.position.set(lx, 0.2, lz);
        s.add(leg);
      }
      s.position.set((rand() - 0.5) * 8, 0, (rand() - 0.5) * 8);
      s.rotation.y = rand() * Math.PI * 2;
      t.add(s);
      heads.push(head);
    }
    const ph = rand() * 10;
    // Grazing: heads down, and up now and then.
    animated.push((time) => heads.forEach((h, k) => (h.position.y = 0.45 + 0.25 * Math.max(0, Math.sin(time * 0.7 + ph + k * 1.7)))));
    return place(t, x, z, rand);
  };
  const windmill: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 11;
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, h + 0.4, 5), steel);
      leg.position.set(lx * 0.6, h / 2, lz * 0.6);
      leg.rotation.set(-lz * 0.06, 0, lx * 0.06);
      t.add(leg);
    }
    for (let k = 1; k < 5; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4 - k * 0.2, 0.04, 4, 4), steel);
      ring.rotation.set(Math.PI / 2, 0, Math.PI / 4);
      ring.position.y = (k * h) / 5;
      t.add(ring);
    }
    const head = new THREE.Group();
    head.position.y = h + 0.3;
    const rotor = new THREE.Group();
    rotor.position.z = 0.6;
    for (let k = 0; k < 14; k++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 0.04), iron);
      const a = (k / 14) * Math.PI * 2;
      blade.position.set(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0);
      blade.rotation.set(0.3, 0, a - Math.PI / 2);
      rotor.add(blade);
    }
    const vane = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.1, 2.2), iron);
    vane.position.set(0, 0.2, -1.6);
    head.add(rotor, vane);
    t.add(head);
    const speed = 0.8 + rand() * 0.8;
    animated.push((time) => (rotor.rotation.z = time * speed));
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.6, 18), iron);
    tank.position.set(3.5, 1.3, 1);
    t.add(tank);
    return place(t, x, z, rand);
  };
  const tank: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 2 + rand() * 1.5;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 3, 20), iron);
    body.position.y = 1.5;
    const top = new THREE.Mesh(new THREE.ConeGeometry(r + 0.1, 0.8, 20), steel);
    top.position.y = 3.4;
    t.add(body, top);
    return place(t, x, z, rand);
  };
  const fence: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 4 + Math.floor(rand() * 5);
    for (let k = 0; k < n; k++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.3, 0.2), timber);
      post.position.set(k * 3, 0.65, 0);
      t.add(post);
    }
    for (const y of [0.55, 1.05]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry((n - 1) * 3, 0.12, 0.08), timber);
      rail.position.set(((n - 1) * 3) / 2, y, 0);
      t.add(rail);
    }
    return place(t, x, z, rand);
  };
  // "I saw you in the paper folds": a paper boat as big as a shed, folded and left in the grass.
  const paperBoat: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 1.6, 1.6, 4, 1), paper);
    hull.scale.set(1, 1, 0.45);
    hull.rotation.y = Math.PI / 4;
    hull.position.y = 0.8;
    const sail = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3, 4), paper);
    sail.scale.set(1, 1, 0.3);
    sail.rotation.y = Math.PI / 4;
    sail.position.y = 3;
    t.add(hull, sail);
    t.scale.setScalar(1 + rand());
    return place(t, x, z, rand);
  };
  // "And I saw you in my coffee mug": a mug as big as a tank, the face smiling up out of it.
  const mug: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2, 4, 24, 1, true), mugMat);
    cup.position.y = 2;
    const base = new THREE.Mesh(new THREE.CircleGeometry(2, 24), mugMat);
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.05;
    const top = new THREE.Mesh(new THREE.CircleGeometry(2.1, 24), coffee);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 3.6;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.28, 8, 16, Math.PI * 1.2), mugMat);
    handle.position.set(2.3, 2, 0);
    handle.rotation.z = -Math.PI * 0.6;
    t.add(cup, base, top, handle);
    const steam: THREE.Sprite[] = [];
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
      s.scale.setScalar(2.5);
      t.add(s);
      steam.push(s);
    }
    const ph = rand() * 10;
    animated.push((time) =>
      steam.forEach((s, k) => {
        const u = (time * 0.25 + ph + k / 3) % 1;
        s.position.set(Math.sin(u * 6 + k) * 0.6, 4 + u * 5, 0);
        s.material.opacity = 0.3 * (1 - u);
      }),
    );
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [7, gum],
      [3, bale],
      [3, sheep],
      [1, windmill],
      [1, tank],
      [2, fence],
      [0.6, paperBoat],
      [0.6, mug],
    ])(x, z, rand);
}

/** A sign over the road, facing the karts coming. */
function sign(g: THREE.Group, text: string, bg: string, fg: string, width: number, y: number, z = 0): void {
  const map = billboardTexture(text, bg, fg);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.25), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
  m.position.set(0, y, z);
  m.rotation.y = Math.PI;
  g.add(m);
}

/**
 * The start: the road runs through an open hay barn, hardwood posts and a
 * gable of corrugated iron over it, round bales stacked inside; the old
 * Ford parked by it with its headlights left on, glowing on the beat of
 * its chime, in 5/4.
 */
export function oldFord(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const post = lambert(0x5a4a38);
  const iron = new THREE.MeshLambertMaterial({ map: ironTexture(), side: THREE.DoubleSide });
  const H = 8;
  for (const side of [-1, 1]) {
    for (const z of [-5, 5]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, H, 0.7), post);
      p.position.set(side * (hw + 1), H / 2, z);
      g.add(p);
    }
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 11), post);
    plate.position.set(side * (hw + 1), H, 0);
    g.add(plate);
  }
  const rise = hw * 0.55;
  for (const side of [-1, 1]) {
    const pitch = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(hw + 2, rise) + 1, 0.2, 12), iron);
    pitch.position.set((side * (hw + 2)) / 2, H + rise / 2, 0);
    pitch.rotation.z = -side * Math.atan2(rise, hw + 2);
    g.add(pitch);
  }
  for (const z of [-5, 5]) {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 2.6, 0.4, 0.4), post);
    tie.position.set(0, H, z);
    g.add(tie);
  }
  sign(g, 'FLOAT ALONG', '#2a5a9a', '#fff6e0', hw * 1.1, H - 1.6, -5.2);
  // Bales stacked against the far side, under the roof.
  const hay = lambert(0xd8b860);
  for (let k = 0; k < 3; k++) {
    for (let j = 0; j < 2 - (k % 2); j++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.3, 14), hay);
      b.rotation.x = Math.PI / 2;
      b.position.set(hw + 3.2 + j * 1.9, 0.9 + (k % 2) * 1.6, -3.5 + k * 3);
      g.add(b);
    }
  }
  // The shed it all belongs to, beside the road on the left, and the Ford parked in front of it, facing the road with its lights on.
  const shed = barn(16, 12, 6);
  shed.position.set(hw + 20, 0, 10);
  shed.rotation.y = -Math.PI / 2;
  g.add(shed);
  const { car, lights, beams } = ford();
  car.position.set(hw + 8, 0, -12);
  car.rotation.y = -Math.PI / 2 - 0.35;
  g.add(car);
  animated.push((time) => {
    const k = chime(time);
    for (const l of lights) l.scale.setScalar(1.6 + 1.6 * k);
    for (const b of beams) (b.material as THREE.MeshBasicMaterial).opacity = 0.06 + 0.1 * k;
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * The face in the sky: a cumulus heaped into someone's face, eyes, nose and
 * a smile, high over the paddocks and looking down on the road, breathing
 * slowly in and out as it drifts.
 */
export function faceCloud(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const rand = seededRandom(Math.round(s));
  const white = lambert(0xffffff, { emissive: 0xc8d4e8, emissiveIntensity: 0.4 });
  const grey = lambert(0x9eaabe, { emissive: 0x6a7890, emissiveIntensity: 0.35 });
  const puff = new THREE.IcosahedronGeometry(1, 2);
  const blob = (x: number, y: number, z: number, r: number, m: THREE.Material) => {
    const b = new THREE.Mesh(puff, m);
    b.position.set(x, y, z);
    b.scale.set(r, r * 0.9, r * 0.8);
    g.add(b);
  };
  const R = 38;
  // The head: a filled oval of puffs, its outline heaped up round it.
  for (let k = 0; k < 26; k++) {
    const a = ((k + rand() * 0.6) / 26) * Math.PI * 2;
    const d = R * (0.92 + rand() * 0.16);
    blob(Math.cos(a) * d, Math.sin(a) * d * 1.2, rand() * 3, 8 + rand() * 7, white);
  }
  for (let k = 0; k < 30; k++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * R * 0.85;
    blob(Math.cos(a) * d, Math.sin(a) * d * 1.2, -2, 9 + rand() * 4, white);
  }
  // Eyes, a nose, and a smile, standing out of it in shadow.
  for (const side of [-1, 1]) blob(side * 14, 12, 9, 6, grey);
  blob(0, 0, 11, 5.5, white);
  for (let k = 0; k < 9; k++) {
    const u = k / 8;
    blob((u - 0.5) * 36, -16 - 8 * Math.sin(Math.PI * u), 9, 4.4, grey);
  }
  const Y = 105;
  // Facing in over the middle of the map, where the road is, and looking down on it.
  g.rotation.set(0.35, Math.atan2(-at.x, -at.z), 0, 'YXZ');
  g.position.set(at.x, Y, at.z);
  const ph = rand() * 10;
  animated.push((time) => {
    // Breathing in and out, slowly, as it floats along.
    const breath = 1 + 0.04 * Math.sin(time * 0.6 + ph);
    g.scale.set(breath, breath, breath);
    g.position.y = Y + 4 * Math.sin(time * 0.15 + ph);
  });
  return g;
}

/**
 * The farm dam Deep Breath dives under: its banks of trodden mud along
 * both sides, reeds growing out of them, and a family of ducks paddling
 * round on the water. `pits` holds the dam; `water` is the height of its
 * surface.
 */
export function farmDam(ribbon: Ribbon, s: number, pits: readonly PitDef[], water: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const pit = pits.reduce((best, p) => (Math.hypot(p.x - f.x, p.z - f.z) < Math.hypot(best.x - f.x, best.z - f.z) ? p : best), pits[0]);
  if (!pit) return g;
  const mud = lambert(0x6a5238);
  const reed = lambert(0x8a8a48);
  const head = lambert(0x5a3a20);
  const rand = seededRandom(2151);
  const L = pit.halfLength;
  // Along the long sides only: the road runs in and out over the short ones.
  for (const side of [-1, 1]) {
    const x = side * (pit.halfWidth + 1.4);
    const bank = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.3, 2 * L), mud);
    bank.position.set(x, 0.05, 0);
    g.add(bank);
    for (let k = 0; k < 9; k++) {
      const clump = new THREE.Group();
      for (let j = 0; j < 7; j++) {
        const h = 1.2 + rand() * 1.4;
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, h, 4), reed);
        r.position.set((rand() - 0.5) * 1.6, h / 2, (rand() - 0.5) * 1.6);
        r.rotation.z = (rand() - 0.5) * 0.3;
        clump.add(r);
        if (j < 2) {
          // A bulrush's brown head.
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.4, 6), head);
          b.position.set(r.position.x, h - 0.1, r.position.z);
          clump.add(b);
        }
      }
      clump.position.set(x + side * (rand() - 0.3), 0, -L + ((k + 0.5) / 9) * 2 * L);
      g.add(clump);
    }
  }
  // Ducks, paddling round.
  const white = lambert(0xf4f0e8);
  const beak = lambert(0xe8a020);
  const ducks: THREE.Group[] = [];
  for (let k = 0; k < 4; k++) {
    const d = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), white);
    body.scale.set(1, 0.7, 1.5);
    const neck = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), white);
    neck.position.set(0, 0.32, 0.4);
    const bill = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), beak);
    bill.rotation.x = Math.PI / 2;
    bill.position.set(0, 0.3, 0.62);
    d.add(body, neck, bill);
    g.add(d);
    ducks.push(d);
  }
  animated.push((time) =>
    ducks.forEach((d, k) => {
      const a = time * 0.12 - k * 0.35;
      d.position.set(Math.cos(a) * (pit.halfWidth - 3), water + 0.1 + Math.sin(time * 2 + k) * 0.04, Math.sin(a) * (L - 4));
      d.rotation.y = -a + Math.PI;
    }),
  );
  g.position.set(pit.x, 0, pit.z);
  g.rotation.y = pit.heading;
  return g;
}
