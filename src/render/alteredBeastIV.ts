import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { VOID_RADIUS, VOID_STAGES, voidRadius, type HazardPose } from '../items/hazards';
import type { PitDef } from '../tracks/builder';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import { glowTexture } from './textures';

/**
 * Altered Beast IV's world, the end of The Tale of the Altered Beast:
 * inside the beast that feels nothing. A canyon opened up in its chest, the
 * ribs arching over it, and hollowness all around: ash and bone under a
 * numb grey sky, the colour drained out of everything but the red of the
 * canyon's walls, dead trees so crooked and curled, the bones of the small
 * creatures it killed for sport, and holes in the ground where there's
 * nothing at all. Its textures (the bone road, the ash, the canyon's walls
 * of sinew, the vertebrae along the road), its scenery, its landmarks (the
 * ribcage, the cul-de-sac's sign, the hellmouth) and its hazard's look (the
 * hollows yawning open in the road).
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

/** Draws `fn` at (x, y) and again a tile over each way, so what it draws wraps. */
function wrapped(S: number, x: number, y: number, fn: (x: number, y: number) => void): void {
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(x + ox, y + oy);
}

/**
 * The road: bone, bleached and hollow. Ivory plates laid end to end, a
 * suture zigzagging across where each meets the next (the texture spans
 * half the road, its v running along it), the grain of the bone running
 * along them, pitted with the pores of its marrow, and hairline cracks.
 */
export function boneRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 4101);
  const grain = fbm(S, 4, 3, 4102);
  paint(ctx, S, S, (x, y, i) => {
    const u = x / S;
    // The grain: fine streaks along the bone, wavering.
    const streak = 0.5 + 0.5 * Math.sin((u * 46 + grain[i] * 5) * Math.PI);
    const base = mix([196, 184, 156], [236, 228, 206], n[i]);
    // Worn paler down the middle of each half, yellower and darker toward its edges.
    const edge = Math.min(u, 1 - u);
    const worn = edge < 0.12 ? mix(base, [176, 158, 120], (0.12 - edge) * 4) : base;
    return shade(worn, 0.92 + streak * 0.06 + (y % 128 < 1 ? -0.04 : 0));
  });
  const rand = seededRandom(4103);
  // The marrow's pores: tiny dark pits, each in a pale ring.
  for (let k = 0; k < 340; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 0.5 + rand() * 1.2;
    wrapped(S, x, y, (px, py) => {
      ctx.fillStyle = 'rgba(250,244,228,0.5)';
      ctx.beginPath();
      ctx.ellipse(px, py, r * 2.2, r * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = css(mix([120, 104, 80], [90, 74, 56], rand()), 0.8);
      ctx.beginPath();
      ctx.ellipse(px, py, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // The suture where one plate meets the next: a zigzag right across, twice along the tile.
  ctx.strokeStyle = 'rgba(92,74,52,0.85)';
  ctx.lineWidth = 1.6;
  for (const y0 of [S * 0.25, S * 0.75]) {
    ctx.beginPath();
    let y = y0;
    ctx.moveTo(-2, y);
    for (let x = 0; x <= S + 4; x += 4 + rand() * 4) {
      y = y0 + (rand() - 0.5) * 12;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Hairline cracks, running with the grain.
  ctx.strokeStyle = 'rgba(110,92,70,0.55)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 14; k++) {
    let x = rand() * S;
    let y = rand() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (rand() - 0.5) * 8;
      y += 6 + rand() * 10;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(c);
}

/** The ground: ash, grey and dead, crazed with cracks, strewn with chips of bone and darker where something burnt. */
export function ashTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 5, 4111);
  const burnt = fbm(S, 3, 3, 4112);
  paint(ctx, S, S, (_x, _y, i) => {
    const ash = mix([88, 84, 86], [132, 126, 124], n[i]);
    return burnt[i] > 0.62 ? mix(ash, [46, 40, 42], Math.min(1, (burnt[i] - 0.62) * 4)) : ash;
  });
  const rand = seededRandom(4113);
  // Cracks: a crazed net of dark lines.
  ctx.strokeStyle = 'rgba(30,26,28,0.6)';
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 70; k++) {
    let x = rand() * S;
    let y = rand() * S;
    let a = rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      a += (rand() - 0.5) * 1.4;
      x += Math.cos(a) * (8 + rand() * 14);
      y += Math.sin(a) * (8 + rand() * 14);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Chips of bone.
  for (let k = 0; k < 700; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const w = 1 + rand() * 3;
    const rot = rand() * Math.PI;
    const col = mix([180, 170, 150], [230, 222, 204], rand());
    wrapped(S, x, y, (px, py) => {
      ctx.fillStyle = css(col, 0.85);
      ctx.beginPath();
      ctx.ellipse(px, py, w, w * 0.4, rot, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  return finish(c);
}

/**
 * The canyon in the chest's walls (and the world's edge, and the
 * hellmouth's): red sinew laid down in bands like rock, pale bands of
 * gristle between, long strands of tendon running through it.
 */
export function sinewTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 4, 4121);
  const band = fbm(S, 2, 2, 4122);
  paint(ctx, S, S, (x, y, i) => {
    const v = y / S;
    const layer = Math.sin((v * 7 + band[i] * 1.8) * Math.PI);
    // Fibres: fine streaks running along the wall.
    const fibre = 0.9 + 0.1 * Math.sin(y * 1.7 + n[i] * 12 + Math.sin(x * 0.05) * 2);
    const flesh = mix([92, 22, 28], [150, 46, 44], n[i]);
    const gristle = mix([196, 160, 150], [226, 200, 188], n[i]);
    return shade(layer > 0.72 ? mix(flesh, gristle, (layer - 0.72) * 3) : flesh, fibre * (0.82 + layer * 0.1));
  });
  const rand = seededRandom(4123);
  // Tendons: pale strands running along it, a little slack.
  ctx.lineWidth = 2;
  for (let k = 0; k < 10; k++) {
    const y0 = rand() * S;
    ctx.strokeStyle = css(mix([210, 190, 176], [240, 226, 214], rand()), 0.55);
    ctx.beginPath();
    for (let x = -4; x <= S + 4; x += 8) {
      const y = y0 + Math.sin((x / S) * Math.PI * 2 + k) * 6;
      if (x < 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(c);
}

/** The barrier: a spine laid along the road, vertebra after vertebra, a dark disc between each. */
export function vertebraeTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  const n = fbm(W, 8, 3, 4131);
  paint(ctx, W, H, (x, y, i) => {
    const u = (x % 64) / 64;
    const v = y / H;
    // Each vertebra's body: rounded, swelling at the ends, a disc of gristle between.
    const disc = u < 0.08 || u > 0.92;
    const round = Math.sin(Math.PI * Math.min(1, Math.max(0, (v - 0.1) / 0.8)));
    const bone = mix([168, 154, 128], [228, 218, 196], n[i]);
    if (disc) return shade(mix([120, 70, 70], [150, 96, 90], n[i]), 0.7 + 0.3 * round);
    const waist = 1 - 0.18 * Math.sin(Math.PI * u);
    return shade(bone, 0.55 + 0.45 * round * waist);
  });
  return finish(c);
}

const boneMat = once(() => lambert(0xe6dcc6));
const glowTex = once(() => glowTexture());

/** Where the ribbon is at `s`, and its heading. */
function frameAt(ribbon: Ribbon, s: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x, z: p.z, y: ribbon.heightAt(s), heading: Math.atan2(p.tx, p.tz), tx: p.tx, tz: p.tz };
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

/** A bone along a curve through `points`, `r` thick, knobbed at both ends. */
function bone(points: THREE.Vector3[], r: number, mat: THREE.Material = boneMat()): THREE.Group {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(points);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 6), r, 7, false), mat));
  for (const end of [points[0], points[points.length - 1]]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(r * 1.35, 8, 6), mat);
    knob.position.copy(end);
    g.add(knob);
  }
  return g;
}

/** A rib from the ground at (x, 0, 0) arching up and in to (x0, h, 0), as a rib curves from the spine round to the sternum. */
function ribCurve(x: number, x0: number, h: number, lean: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * (Math.PI / 2);
    pts.push(new THREE.Vector3(x0 + (x - x0) * Math.cos(a), h * Math.sin(a) ** 0.85, lean * Math.sin(a)));
  }
  return pts;
}

/**
 * The beast's world, hollow: great ribs standing out of the ash where a
 * carcass rotted away, a spine of vertebrae half buried, dead trees so
 * crooked and curled, the skulls of the small creatures it killed for
 * sport, horns curling out of the ground, and holes in the ground with
 * nothing in them, a faint mist rising out of the dark.
 */
export function hollowFeature(animated: Animated): Feature {
  const bones = boneMat();
  const old = lambert(0xbcae94);
  const dead = lambert(0x3a3236, { flatShading: true });
  const deadPale = lambert(0x6a6062, { flatShading: true });
  const black = new THREE.MeshBasicMaterial({ color: 0x050306 });
  const horn = lambert(0x4a3e38, { flatShading: true });
  const socket = lambert(0x1a1416);
  const ash = lambert(0x5a5456);
  const carcass: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 4 + Math.floor(rand() * 4);
    const h = 5 + rand() * 6;
    const w = 3 + rand() * 3;
    for (let k = 0; k < n; k++) {
      const s = 1 - Math.abs(k - (n - 1) / 2) / n;
      for (const side of [-1, 1]) {
        const rib = bone(ribCurve(side * w * (0.6 + s * 0.5), side * 0.6, h * (0.5 + s * 0.5), 1.2), 0.22, rand() < 0.5 ? bones : old);
        rib.position.z = k * 1.9;
        // Some fallen in.
        rib.rotation.z = side * (rand() < 0.25 ? 0.5 : 0) + (rand() - 0.5) * 0.12;
        t.add(rib);
      }
    }
    // The spine they hang from, half buried.
    const spine = bone([new THREE.Vector3(0, 0.3, -2), new THREE.Vector3(0, 0.6, n), new THREE.Vector3(0, 0.2, n * 2 + 1)], 0.35, old);
    t.add(spine);
    return place(t, x, z, rand);
  };
  const vertebrae: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 5 + Math.floor(rand() * 6);
    let px = 0;
    let pz = 0;
    let a = 0;
    for (let k = 0; k < n; k++) {
      const v = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.9, 10), bones);
      body.rotation.x = Math.PI / 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.6, 5), old);
      spike.position.set(0, 0.9, -0.2);
      spike.rotation.x = -0.4;
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.4, 5), old);
        wing.position.set(side * 0.9, 0.2, 0);
        wing.rotation.z = (side * Math.PI) / 2;
        v.add(wing);
      }
      v.add(body, spike);
      v.position.set(px, 0.45, pz);
      v.rotation.y = a;
      t.add(v);
      a += (rand() - 0.5) * 0.4;
      px += Math.sin(a) * 1.15;
      pz += Math.cos(a) * 1.15;
    }
    return place(t, x, z, rand);
  };
  // So crooked and curled: a dead tree, its trunk twisting, its branches curling into spirals.
  const crooked: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const mat = rand() < 0.7 ? dead : deadPale;
    const pts: THREE.Vector3[] = [];
    let px = 0;
    let pz = 0;
    const h = 7 + rand() * 7;
    for (let k = 0; k <= 6; k++) {
      pts.push(new THREE.Vector3(px, (k / 6) * h, pz));
      px += (rand() - 0.5) * 1.6;
      pz += (rand() - 0.5) * 1.6;
    }
    t.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.45, 6, false), mat));
    const limbs = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < limbs; k++) {
      const from = pts[3 + Math.floor(rand() * 4)];
      const a0 = rand() * Math.PI * 2;
      const dir = rand() < 0.5 ? 1 : -1;
      const len = 2.5 + rand() * 3;
      const curl: THREE.Vector3[] = [];
      // Out from the trunk, then curling round on itself, tighter and tighter.
      for (let j = 0; j <= 14; j++) {
        const u = j / 14;
        const r = len * (1 - u * 0.8);
        const a = a0 + dir * u * Math.PI * 2.2;
        curl.push(new THREE.Vector3(from.x + Math.cos(a0) * len * u * 0.6 + Math.cos(a) * r * u, from.y + u * 2.5 + Math.sin(u * Math.PI) * 1.2, from.z + Math.sin(a0) * len * u * 0.6 + Math.sin(a) * r * u));
      }
      t.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curl), 28, 0.16, 5, false), mat));
    }
    return place(t, x, z, rand);
  };
  // The skull of a small creature it wounded and watched: horned, eyes empty.
  const skull: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), bones);
    head.scale.set(1, 0.8, 1.3);
    head.position.y = 0.7;
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 1.4, 9), bones);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.5, 1.3);
    t.add(head, snout);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), socket);
      eye.position.set(side * 0.45, 0.85, 0.95);
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.8, 6), horn);
      h.position.set(side * 0.7, 1.5, -0.2);
      h.rotation.set(-0.5, 0, -side * 0.7);
      t.add(eye, h);
    }
    t.scale.setScalar(0.8 + rand() * 1.4);
    return place(t, x, z, rand);
  };
  // A horn curling up out of the ash, as tall as a house.
  const curledHorn: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const pts: THREE.Vector3[] = [];
    const R = 3 + rand() * 2;
    for (let k = 0; k <= 20; k++) {
      const u = k / 20;
      const a = u * Math.PI * 1.6;
      pts.push(new THREE.Vector3(Math.sin(a) * R * (1 - u * 0.5) * 0.9, (1 - Math.cos(a)) * R * (1 - u * 0.4) + u * 2, u * 2.4));
    }
    // A tapering horn: segments thinning toward the tip.
    for (let k = 0; k < pts.length - 1; k++) {
      const r = 0.9 * (1 - k / pts.length) + 0.08;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, pts[k].distanceTo(pts[k + 1]) + 0.05, 7), horn);
      seg.position.copy(pts[k]).add(pts[k + 1]).multiplyScalar(0.5);
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pts[k + 1].clone().sub(pts[k]).normalize());
      t.add(seg);
    }
    return place(t, x, z, rand);
  };
  // A hole in the ground with nothing in it: a mound of ash round its lip, and a faint mist rising out of the dark.
  const hole: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 2.5 + rand() * 3.5;
    const pit = new THREE.Mesh(new THREE.CircleGeometry(r, 20), black);
    pit.rotation.x = -Math.PI / 2;
    pit.position.y = 0.08;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r + 0.3, 0.6, 5, 20), ash);
    lip.rotation.x = Math.PI / 2;
    lip.scale.z = 0.5;
    t.add(pit, lip);
    const mist: THREE.Sprite[] = [];
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x5a4a6a, transparent: true, opacity: 0.2, depthWrite: false }));
      s.scale.setScalar(r * 1.6);
      t.add(s);
      mist.push(s);
    }
    const ph = rand() * 10;
    animated.push((time) =>
      mist.forEach((s, k) => {
        const u = (time * 0.12 + ph + k / 3) % 1;
        s.position.set(Math.sin(u * 5 + k) * 0.6, 0.5 + u * 7, 0);
        s.material.opacity = 0.22 * Math.sin(Math.PI * u);
      }),
    );
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [3, carcass],
      [2, vertebrae],
      [5, crooked],
      [2, skull],
      [1.2, curledHorn],
      [2, hole],
    ])(x, z, rand);
}

/** A road sign's face: the No Through Road sign, a black stem with a red bar across its top, and the words under it. */
const noThroughTexture = once(() => {
  const W = 512;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#f2f0ea';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#141214';
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  // The T: up from the bottom of its panel, stopped dead by the red bar.
  ctx.fillStyle = '#141214';
  ctx.fillRect(86, 76, 34, 140);
  ctx.fillStyle = '#c8141a';
  ctx.fillRect(40, 50, 126, 30);
  ctx.fillStyle = '#141214';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('NO', 200, 70);
  ctx.fillText('THROUGH', 200, 128);
  ctx.fillText('ROAD', 200, 186);
  return finish(c, false);
});

/** The other side of the start's sign, for whoever comes the wrong way. */
const culDeSacTexture = once(() => {
  const W = 512;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#141214';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#e8e0d0';
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.fillStyle = '#e8e0d0';
  ctx.font = 'bold 46px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('THE END OF', W / 2, 92);
  ctx.fillText('THE CUL-DE-SAC', W / 2, 160);
  return finish(c, false);
});

/** A streetlamp of a dead-end street, its light guttering. Its foot at the origin; the lamp hangs out over +x. */
function streetlamp(animated: Animated, ph: number): THREE.Group {
  const g = new THREE.Group();
  const steel = lambert(0x2a282c);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 9, 8), steel);
  pole.position.y = 4.5;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 0.16), steel);
  arm.position.set(1.1, 8.9, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 0.5), steel);
  head.position.set(2.2, 8.75, 0);
  const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffd8a0, blending: THREE.AdditiveBlending, depthWrite: false }));
  lamp.position.set(2.2, 8.4, 0);
  lamp.scale.setScalar(3);
  g.add(pole, arm, head, lamp);
  // Mostly on, guttering now and then.
  animated.push((time) => {
    const flick = Math.sin(time * 1.3 + ph) > 0.86 ? 0.25 + 0.75 * Math.abs(Math.sin(time * 41 + ph)) : 1;
    lamp.material.opacity = flick;
  });
  return g;
}

/**
 * The cul-de-sac's sign. Across the start: a gantry of black posts over
 * the road, the No Through Road sign hung from it (the end of the
 * cul-de-sac on its far side), a streetlamp guttering beside it. Off the
 * road (`lateral`), in the middle of the turning circle: the sign on its
 * own post, the lamp, and a dead tree.
 */
export function culDeSac(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const steel = lambert(0x1e1c20);
  const signGeo = new THREE.PlaneGeometry(1, 0.5);
  const face = (w: number, map: THREE.Texture, y: number, z: number, back: boolean) => {
    const m = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({ map }));
    m.scale.setScalar(w);
    m.position.set(0, y, z);
    m.rotation.y = back ? 0 : Math.PI;
    g.add(m);
  };
  if (lateral) {
    const at = offRoad(ribbon, s, lateral);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 8), steel);
    post.position.y = 2.3;
    g.add(post);
    face(4, noThroughTexture(), 4.2, -0.06, false);
    face(4, culDeSacTexture(), 4.2, 0.06, true);
    const lamp = streetlamp(animated, s);
    lamp.position.set(-5, 0, 2);
    g.add(lamp);
    const mat = lambert(0x3a3236, { flatShading: true });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.5, 7, 6), mat);
    trunk.position.set(5, 3.5, 3);
    trunk.rotation.z = 0.2;
    g.add(trunk);
    g.position.set(at.x, 0, at.z);
    // Facing back the way the road came round to it.
    g.rotation.y = at.heading;
    return g;
  }
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const H = 9;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, H, 0.6), steel);
    post.position.set(side * (hw + 0.6), H / 2, 0);
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 2, 0.5, 0.5), steel);
  beam.position.set(0, H, 0);
  g.add(beam);
  face(10, noThroughTexture(), H - 3, -0.3, false);
  face(10, culDeSacTexture(), H - 3, 0.3, true);
  const lamp = streetlamp(animated, s);
  lamp.position.set(hw + 4, 0, 6);
  lamp.rotation.y = Math.PI;
  g.add(lamp);
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The ribcage: this many pairs of ribs, this far apart along the road, and how high they arch over the ground. */
const RIB_PAIRS = 7;
const RIB_SPACING = 7;
const RIB_HEIGHT = 15;

/**
 * The chest's ribs arching over the canyon opened up in it: pair after
 * pair, out of the ground either side, curving up and in to the sternum
 * along the top, strands of sinew hanging off them, and down in the
 * canyon under them a faint red glow where the heart was, and nothing.
 */
export function ribcage(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const bones = boneMat();
  const gristle = lambert(0xc8a8a0);
  const sinew = lambert(0x7a2024);
  const tops: THREE.Vector3[] = [];
  const len = ribbon.spline.length;
  for (let k = 0; k < RIB_PAIRS; k++) {
    const sk = (((s + (k - (RIB_PAIRS - 1) / 2) * RIB_SPACING) % len) + len) % len;
    const f = frameAt(ribbon, sk);
    const base = Math.max(0, f.y);
    const hw = ribbon.halfWidthAtS(sk) + 3;
    // The middle ribs the longest, as a chest swells.
    const swell = 1 - (Math.abs(k - (RIB_PAIRS - 1) / 2) / RIB_PAIRS) * 0.5;
    const h = RIB_HEIGHT * swell;
    const pair = new THREE.Group();
    for (const side of [-1, 1]) {
      const rib = bone(ribCurve(side * (hw + 1.5 * swell), side * 0.8, h, -1.5), 0.42, bones);
      pair.add(rib);
      // A strand of sinew hanging off it.
      const drop = 2 + ((k * 7 + side * 3 + 11) % 5);
      const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, drop, 5), sinew);
      strand.position.set(side * hw * 0.55, h * 0.88 - drop / 2, -1);
      pair.add(strand);
    }
    const cart = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 2.2), gristle);
    cart.position.y = h;
    pair.add(cart);
    pair.position.set(f.x, base, f.z);
    pair.rotation.y = f.heading;
    g.add(pair);
    tops.push(new THREE.Vector3(f.x, base + h + 0.2, f.z));
  }
  // The sternum, along the top.
  const sternum = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tops), 30, 0.7, 8, false), bones);
  sternum.scale.y = 1;
  g.add(sternum);
  // Down in the canyon, where the heart was: a faint red glow, and nothing in it.
  const mid = frameAt(ribbon, s);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x8a1418, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
  glow.position.set(mid.x, mid.y + 4, mid.z);
  glow.scale.setScalar(26);
  g.add(glow);
  animated.push((time) => (glow.material.opacity = 0.45 + 0.08 * Math.sin(time * 0.4)));
  return g;
}

/**
 * The hellmouth Hell and Back dives into: jagged teeth of bone round its
 * lip, its walls the beast's own sinew, and down in it a red glow and
 * embers rising. `pits` holds it.
 */
export function hellmouth(ribbon: Ribbon, s: number, pits: readonly PitDef[], animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const pit = pits.reduce((best, p) => (Math.hypot(p.x - f.x, p.z - f.z) < Math.hypot(best.x - f.x, best.z - f.z) ? p : best), pits[0]);
  if (!pit) return g;
  const L = pit.halfLength;
  const W = pit.halfWidth;
  const road = ribbon.halfWidthAtS(s) + 0.5;
  const teeth = lambert(0xe0d4ba, { flatShading: true });
  const rand = seededRandom(4151);
  const tooth = (x: number, z: number, lean: number, across: boolean) => {
    const h = 1.5 + rand() * 3;
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.5 + rand() * 0.5, h, 5), teeth);
    t.position.set(x, h / 2 - 0.2, z);
    if (across) t.rotation.x = lean;
    else t.rotation.z = lean;
    g.add(t);
  };
  // Along the long sides, leaning in over the drop; across the ends, either side of the road.
  for (const side of [-1, 1]) {
    for (let z = -L + 1; z <= L - 1; z += 2.2 + rand() * 1.2) tooth(side * (W + 0.6), z, side * 0.35, false);
    for (let x = road; x <= W; x += 2.2 + rand()) {
      for (const end of [-1, 1]) tooth(side * x, end * (L + 0.6), -end * 0.35, true);
    }
  }
  // The glow from the depths, and embers rising up out of it.
  const depth = pit.depth;
  for (let k = 0; k < 3; k++) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: k ? 0xff5a18 : 0xc01808, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, -depth + 3 + k * 4, (k - 1) * L * 0.5);
    glow.scale.setScalar(W * 2.4);
    g.add(glow);
  }
  const embers: THREE.Sprite[] = [];
  for (let k = 0; k < 24; k++) {
    const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false }));
    e.scale.setScalar(0.6);
    e.userData = { x: (rand() - 0.5) * W * 1.6, z: (rand() - 0.5) * L * 1.8, ph: rand(), speed: 0.08 + rand() * 0.08 };
    g.add(e);
    embers.push(e);
  }
  animated.push((time) =>
    embers.forEach((e) => {
      const u = (time * e.userData.speed + e.userData.ph) % 1;
      e.position.set(e.userData.x + Math.sin(time + e.userData.ph * 9) * 0.8, -depth + u * (depth + 10), e.userData.z);
      e.material.opacity = Math.sin(Math.PI * u);
    }),
  );
  g.position.set(pit.x, 0, pit.z);
  g.rotation.y = pit.heading;
  return g;
}

/** The look of a crack in the road, where a hollow is about to open: black lines splitting out from the middle. */
const crackTexture = once(() => {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rand = seededRandom(4161);
  ctx.strokeStyle = 'rgba(10,6,10,0.95)';
  ctx.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    let x = S / 2;
    let y = S / 2;
    let a = (k / 9) * Math.PI * 2 + rand() * 0.5;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 7; j++) {
      a += (rand() - 0.5) * 0.9;
      x += Math.cos(a) * (10 + rand() * 10);
      y += Math.sin(a) * (10 + rand() * 10);
      ctx.lineWidth = 6 - j * 0.7;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(c, false);
});

/** The inside of a hollow: black at the bottom of it, rings of darkness going down. */
const hollowTexture = once(() => {
  const S = 256;
  const [c, ctx] = canvas(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.55, 'rgba(6,2,8,1)');
  g.addColorStop(0.85, 'rgba(40,14,26,1)');
  g.addColorStop(0.97, 'rgba(90,50,58,1)');
  g.addColorStop(1, 'rgba(90,50,58,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  for (let k = 1; k < 6; k++) {
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, (S / 2) * (0.35 + k * 0.11), 0, Math.PI * 2);
    ctx.stroke();
  }
  return finish(c, false);
});

/**
 * A hollow in the road, the hazard's look: a crack (the warning), then a
 * dark hollow yawning open, a ring of broken bone round its lip, wisps of
 * darkness rising out of it while it's open; its lip glows as it closes,
 * the rim to skirt.
 */
export function hollowParts(obj: THREE.Object3D): THREE.Object3D[] {
  const flat = (map: THREE.Texture, size: number, y: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    return m;
  };
  const crack = flat(crackTexture(), VOID_RADIUS * 2.6, 0.1);
  const hole = flat(hollowTexture(), 2.1, 0.12);
  const lip = new THREE.Group();
  const lipMat = new THREE.MeshLambertMaterial({ color: 0xd8ccb4, emissive: 0xffe8c8, emissiveIntensity: 0, flatShading: true });
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6 + (k % 3) * 0.25, 4), lipMat);
    shard.position.set(Math.cos(a), 0.25, Math.sin(a));
    shard.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    lip.add(shard);
  }
  const wisps = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const w = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x2a1030, transparent: true, opacity: 0.6, depthWrite: false }));
    w.scale.setScalar(2.4);
    wisps.add(w);
  }
  obj.add(crack, hole, lip, wisps);
  return [crack, hole, lip, wisps];
}

/** Poses a hollow's parts (from hollowParts) for its stage. */
export function poseHollow(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [crack, hole, lip, wisps] = parts;
  const V = VOID_STAGES;
  const u = p.phase;
  const r = voidRadius(u);
  obj.rotation.y = p.heading;
  // The crack spreads before it yawns open, and is swallowed as it does.
  crack.visible = u < V.open;
  const spread = Math.min(1, u / V.yawn);
  crack.scale.setScalar(0.3 + 0.7 * spread);
  ((crack as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = u < V.yawn ? 0.3 + 0.6 * spread : 0.9 * (1 - (u - V.yawn) / (V.open - V.yawn));
  hole.visible = lip.visible = r > 0.05;
  hole.scale.setScalar(Math.max(0.01, r));
  lip.scale.set(Math.max(0.01, r), 1, Math.max(0.01, r));
  const closing = u >= V.close && u < V.shut;
  ((lip.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial).emissiveIntensity = closing ? 0.6 + 0.4 * Math.sin(elapsed * 18) : 0;
  wisps.visible = u >= V.yawn && u < V.close;
  wisps.children.forEach((w, k) => {
    const v = (elapsed * 0.6 + k / 4) % 1;
    w.position.set(Math.sin(k * 2.3 + elapsed) * r * 0.4, 0.3 + v * 3.5, Math.cos(k * 1.7 + elapsed) * r * 0.4);
    (w as THREE.Sprite).material.opacity = 0.55 * Math.sin(Math.PI * v);
  });
}
