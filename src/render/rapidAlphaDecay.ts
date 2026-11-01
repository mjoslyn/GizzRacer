import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { ALPHA_COUNT, ALPHA_RADIUS, ALPHA_STAGES, alphaAcross, type HazardPose } from '../items/hazards';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import { glowTexture } from './textures';

/**
 * Rapid Alpha Decay's world, the last of the Alien Metal Cup: where the
 * metal ends, burnt down to energy in a reactor's core under the cup's one
 * night of alien stars. A containment floor of black concrete lit green by
 * what has leaked, walls of lead bricks, cooling towers steaming, spent
 * fuel glowing blue in its pool, casks of waste, static arcing between
 * pylons, and the nucleus at the heart of it all, pulsing green, its
 * electrons whirling round it. Its textures (the lead road, the floor, the
 * lead bricks, the hazard stripes along the road), its scenery, its
 * landmarks (the reactor's lead doors, the nucleus) and its hazard's look
 * (the alpha particles fired out of the nucleus, and the static wave in
 * their wake).
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type Animated = ((time: number) => void)[];
type RGB = [number, number, number];

/** The cup's palette: black steel, molten orange, cold electric blue, a sick radiation green. */
const GREEN = 0x7aff4a;
const BLUE = 0x4ab8ff;
const ORANGE = 0xff7a1a;

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const additive = (color: number, opacity = 1) => new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity });

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

/** Draws `fn` at (x, y) and again a tile over each way, so what it draws wraps. */
function wrapped(S: number, x: number, y: number, fn: (x: number, y: number) => void): void {
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(x + ox, y + oy);
}

/** The radiation trefoil: three blades round a hub, in `color`, centred at (x, y), `r` across to the blades' ends. */
function trefoil(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, turn = 0): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  for (let k = 0; k < 3; k++) {
    const a = turn - Math.PI / 2 + (k * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.arc(x, y, r, a - Math.PI / 6, a + Math.PI / 6);
    ctx.arc(x, y, r * 0.3, a + Math.PI / 6, a - Math.PI / 6, true);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * The road: lead shielding, plates of it laid end to end, dull blue-grey
 * and soft, dented and bloomed white where it has oxidised, a seam across
 * where each meets the next with a row of rivets along it (the texture
 * spans half the road, its v running along it), and a thread of green
 * glowing in the seams where the energy leaks through.
 */
export function leadRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 5201);
  const bloom = fbm(S, 4, 4, 5202);
  paint(ctx, S, S, (x, y, i) => {
    const base = mix([78, 84, 94], [118, 124, 134], n[i]);
    // Oxidised: a white bloom in patches.
    const oxide = bloom[i] > 0.6 ? mix(base, [170, 176, 178], Math.min(0.5, (bloom[i] - 0.6) * 2.2)) : base;
    // Hammered soft: a faint dimpling.
    const dent = 0.94 + 0.06 * Math.sin(x * 0.21 + n[i] * 9) * Math.sin(y * 0.17 + n[i] * 7);
    return shade(oxide, dent);
  });
  const rand = seededRandom(5203);
  // The seams across the road, twice along the tile, a green thread glowing in them.
  for (const y0 of [S * 0.25, S * 0.75]) {
    ctx.fillStyle = 'rgba(20,22,26,0.9)';
    ctx.fillRect(0, y0 - 2, S, 4);
    ctx.fillStyle = 'rgba(122,255,74,0.55)';
    ctx.fillRect(0, y0 - 0.5, S, 1);
    for (let x = 8; x < S; x += 16) {
      ctx.fillStyle = 'rgba(40,44,50,0.95)';
      ctx.beginPath();
      ctx.arc(x, y0 - 7, 3, 0, Math.PI * 2);
      ctx.arc(x, y0 + 7, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,206,214,0.7)';
      ctx.beginPath();
      ctx.arc(x - 0.8, y0 - 7.8, 1.1, 0, Math.PI * 2);
      ctx.arc(x - 0.8, y0 + 6.2, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // A seam down the middle of the road (the tile's outer edge) where the plates meet side to side.
  ctx.fillStyle = 'rgba(24,26,30,0.85)';
  ctx.fillRect(S - 3, 0, 3, S);
  // Gouges and scuffs, along the road.
  ctx.strokeStyle = 'rgba(40,42,48,0.5)';
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 26; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const len = 6 + rand() * 20;
    wrapped(S, x, y, (px, py) => {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + (rand() - 0.5) * 4, py + len);
      ctx.stroke();
    });
  }
  return finish(c);
}

/**
 * The ground: the containment floor, black concrete in slabs, stained and
 * scorched, its joints dark, and puddles and drips of something that
 * glows a sick green where it has leaked.
 */
export function reactorFloorTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 5, 5211);
  const stain = fbm(S, 3, 3, 5212);
  paint(ctx, S, S, (x, y, i) => {
    const slab = mix([26, 30, 30], [52, 56, 54], n[i]);
    const dark = stain[i] > 0.58 ? mix(slab, [12, 14, 14], Math.min(1, (stain[i] - 0.58) * 3)) : slab;
    // The slabs' joints.
    const joint = x % 128 < 2 || y % 128 < 2;
    return joint ? [10, 12, 12] : dark;
  });
  const rand = seededRandom(5213);
  // The leaks: glowing green pools, a darker rim round each, and drips running off them.
  for (let k = 0; k < 16; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 4 + rand() * 14;
    wrapped(S, x, y, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r * 1.6);
      g.addColorStop(0, 'rgba(170,255,110,0.95)');
      g.addColorStop(0.5, 'rgba(90,220,60,0.7)');
      g.addColorStop(0.75, 'rgba(20,60,20,0.6)');
      g.addColorStop(1, 'rgba(20,60,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(px, py, r * 1.6, r * 1.1, k, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // Scorch rings where something hot stood.
  ctx.lineWidth = 3;
  for (let k = 0; k < 8; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 10 + rand() * 20;
    wrapped(S, x, y, (px, py) => {
      ctx.strokeStyle = 'rgba(6,6,6,0.45)';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.stroke();
    });
  }
  return finish(c);
}

/** The walls: lead bricks, stacked and staggered, dull grey, each a little dented, the joints dark. */
export function leadBrickTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 5221);
  const bw = 64;
  const bh = 32;
  paint(ctx, S, S, (x, y, i) => {
    const row = Math.floor(y / bh);
    const bx = (x + (row % 2) * (bw / 2)) % bw;
    const by = y % bh;
    const brick = (row * 7 + Math.floor((x + (row % 2) * (bw / 2)) / bw) * 3) % 5;
    const base = mix([70, 76, 84], [112, 118, 126], n[i] * 0.7 + brick * 0.06);
    if (bx < 2 || by < 2) return [22, 24, 28];
    // Bevelled: lighter along the top edge, darker along the bottom.
    const bevel = by < 5 ? 1.12 : by > bh - 5 ? 0.82 : 1;
    return shade(base, bevel);
  });
  return finish(c);
}

/** The barrier: yellow and black hazard stripes, a radiation trefoil now and then. */
export function hazardBandTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#f0c010';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#141414';
  for (let x = -H; x < W + H; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + 16, H);
    ctx.lineTo(x + 16 + H, 0);
    ctx.lineTo(x + H, 0);
    ctx.closePath();
    ctx.fill();
  }
  // A plate in the middle with the trefoil on it.
  ctx.fillStyle = '#f0c010';
  ctx.fillRect(W / 2 - 30, 4, 60, H - 8);
  ctx.strokeStyle = '#141414';
  ctx.lineWidth = 3;
  ctx.strokeRect(W / 2 - 30, 4, 60, H - 8);
  trefoil(ctx, W / 2, H / 2, 24, '#141414');
  return finish(c);
}

/** A warning sign's face: the trefoil, black on yellow, in a black-edged triangle-cornered plate. */
const signTexture = once(() => {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#f0c010';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#141414';
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, S - 20, S - 20);
  trefoil(ctx, S / 2, S / 2, S * 0.38, '#141414');
  return finish(c, false);
});

/** Static, for the wave in an alpha burst's wake: snow and bright torn lines, on black, to be drawn added. */
const staticTexture = once(() => {
  const W = 256;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  const rand = seededRandom(5231);
  paint(ctx, W, H, () => {
    const v = rand() ** 2.2 * 255;
    return [v * 0.6, v, v * 0.8];
  });
  for (let k = 0; k < 10; k++) {
    const y = rand() * H;
    ctx.fillStyle = `rgba(190,255,220,${0.4 + rand() * 0.5})`;
    ctx.fillRect(0, y, W, 1 + rand() * 2);
  }
  // Fading out at its top and bottom edges.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.25, 'rgba(0,0,0,0)');
  g.addColorStop(0.8, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return finish(c);
});

const glowTex = once(() => glowTexture());

/** Where the ribbon is at `s`, and its heading. */
function frameAt(ribbon: Ribbon, s: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x, z: p.z, y: ribbon.heightAt(s), heading: Math.atan2(p.tx, p.tz) };
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

/** A jagged bolt of static between two points, redrawn each time it's called. */
function arc(line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3, jag: number, rand: () => number): void {
  const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1);
    const w = k === 0 || k === n - 1 ? 0 : jag;
    pos.setXYZ(k, a.x + (b.x - a.x) * u + (rand() - 0.5) * w, a.y + (b.y - a.y) * u + (rand() - 0.5) * w, a.z + (b.z - a.z) * u + (rand() - 0.5) * w);
  }
  pos.needsUpdate = true;
}

function boltLine(points: number, color: number): THREE.Line {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(points * 3).fill(0), 3));
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
}

/**
 * The reactor's floor, all round the core: cooling towers steaming,
 * spent fuel glowing blue down in its pool, casks of lead stacked with
 * the trefoil on their lids, pylons with static arcing between them,
 * control rods standing out of the floor with their tips glowing green,
 * pipes, and warning signs.
 */
export function reactorFeature(animated: Animated): Feature {
  const concrete = lambert(0x8a8c88);
  const concreteDark = lambert(0x4a4c4a);
  const lead = lambert(0x5a6068);
  const steel = lambert(0x24282c);
  const rust = lambert(0x6a3a22);
  const sign = new THREE.MeshBasicMaterial({ map: signTexture() });
  const lid = new THREE.MeshLambertMaterial({ color: 0xf0c010 });
  const pool = new THREE.MeshBasicMaterial({ color: 0x2a9cff });
  const rodTip = new THREE.MeshBasicMaterial({ color: GREEN });
  // A cooling tower's waist: a hyperboloid turned on a lathe.
  const towerGeo = (() => {
    const pts: THREE.Vector2[] = [];
    for (let k = 0; k <= 12; k++) {
      const v = k / 12;
      pts.push(new THREE.Vector2(1 - 0.38 * Math.sin(Math.PI * v * 0.82), v * 2.2));
    }
    return new THREE.LatheGeometry(pts, 24);
  })();
  const tower: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 9 + rand() * 6;
    const body = new THREE.Mesh(towerGeo, concrete);
    body.scale.set(r, r, r);
    t.add(body);
    // Steam rising off its lip, lit green from below.
    const top = r * 2.2;
    const steam: THREE.Sprite[] = [];
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xc8d8d0, transparent: true, opacity: 0.35, depthWrite: false }));
      t.add(s);
      steam.push(s);
    }
    const ph = rand() * 10;
    animated.push((time) =>
      steam.forEach((s, k) => {
        const u = (time * 0.07 + ph + k / 4) % 1;
        s.position.set(Math.sin(u * 3 + k) * r * 0.3, top + u * r * 2.4, Math.cos(u * 2 + k) * r * 0.2);
        s.scale.setScalar(r * (1.4 + u * 2));
        s.material.opacity = 0.4 * Math.sin(Math.PI * u);
      }),
    );
    return place(t, x, z, rand);
  };
  // Spent fuel down in its pool, the water lit Cherenkov blue, the assemblies in a grid.
  const fuelPool: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 10 + rand() * 6;
    const d = 7 + rand() * 4;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 1.6, 0.8, d + 1.6), concreteDark);
    rim.position.y = 0.4;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pool);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.82;
    t.add(rim, water);
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 3; j++) {
        const rod = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), steel);
        rod.position.set(((i + 0.5) / 5 - 0.5) * w * 0.8, 0.9, ((j + 0.5) / 3 - 0.5) * d * 0.7);
        t.add(rod);
      }
    }
    const glow = new THREE.Sprite(additive(BLUE, 0.6));
    glow.scale.set(w * 1.6, 6, 1);
    glow.position.y = 2;
    t.add(glow);
    const ph = rand() * 10;
    animated.push((time) => (glow.material.opacity = 0.5 + 0.12 * Math.sin(time * 1.3 + ph)));
    return place(t, x, z, rand);
  };
  // Casks of waste, lead, stacked, the trefoil on their yellow lids.
  const casks: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 2 + Math.floor(rand() * 5);
    const geo = new THREE.CylinderGeometry(1.1, 1.1, 2.4, 14);
    const lidGeo = new THREE.CylinderGeometry(1.12, 1.12, 0.12, 14);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rand();
      const r = n > 1 ? 1.6 : 0;
      const cask = new THREE.Mesh(geo, rand() < 0.8 ? lead : rust);
      cask.position.set(Math.cos(a) * r, 1.2, Math.sin(a) * r);
      const top = new THREE.Mesh(lidGeo, lid);
      top.position.set(cask.position.x, 2.45, cask.position.z);
      t.add(cask, top);
    }
    // One on top, sometimes.
    if (n > 2 && rand() < 0.5) {
      const cask = new THREE.Mesh(geo, lead);
      cask.position.y = 3.6;
      const top = new THREE.Mesh(lidGeo, lid);
      top.position.y = 4.85;
      t.add(cask, top);
    }
    return place(t, x, z, rand);
  };
  // Two pylons, static arcing between their tips.
  const pylons: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 9 + rand() * 5;
    const span = 8 + rand() * 6;
    const tips: THREE.Vector3[] = [];
    for (const side of [-1, 1]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, h, 8), steel);
      mast.position.set(side * span * 0.5, h / 2, 0);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), lambert(0x8a9098, { emissive: 0x204060 }));
      ball.position.set(side * span * 0.5, h + 0.6, 0);
      for (let k = 0; k < 4; k++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9 - k * 0.12, 0.12, 6, 14), concreteDark);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(side * span * 0.5, h * 0.55 + k * 0.9, 0);
        t.add(ring);
      }
      t.add(mast, ball);
      tips.push(ball.position.clone());
    }
    const bolt = boltLine(14, 0xb8f0ff);
    const glow = new THREE.Sprite(additive(BLUE, 0.7));
    glow.scale.setScalar(span * 0.9);
    glow.position.copy(tips[0]).add(tips[1]).multiplyScalar(0.5);
    t.add(bolt, glow);
    const r = seededRandom(Math.floor(rand() * 1e6));
    const ph = rand() * 10;
    animated.push((time) => {
      // Crackling in bursts, on and off.
      const on = Math.sin(time * 3.1 + ph) + Math.sin(time * 7.3 + ph * 2) > 0.2;
      bolt.visible = on;
      glow.visible = on;
      if (on) arc(bolt, tips[0], tips[1], 2.2, r);
    });
    return place(t, x, z, rand);
  };
  // Control rods standing out of the floor, their tips glowing green.
  const rods: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 3 + Math.floor(rand() * 5);
    const tips: THREE.Mesh[] = [];
    for (let k = 0; k < n; k++) {
      const h = 3 + rand() * 7;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, h, 8), steel);
      const px = (rand() - 0.5) * 6;
      const pz = (rand() - 0.5) * 6;
      rod.position.set(px, h / 2, pz);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), rodTip);
      tip.position.set(px, h, pz);
      t.add(rod, tip);
      tips.push(tip);
    }
    const glow = new THREE.Sprite(additive(GREEN, 0.4));
    glow.scale.setScalar(9);
    glow.position.y = 5;
    t.add(glow);
    const ph = rand() * 10;
    animated.push((time) => (glow.material.opacity = 0.3 + 0.15 * Math.sin(time * 2 + ph)));
    return place(t, x, z, rand);
  };
  // A run of fat pipe out of the floor and back into it, a valve wheel on top.
  const pipe: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 3 + rand() * 3;
    const bend = new THREE.Mesh(new THREE.TorusGeometry(r, 0.7, 8, 20, Math.PI), rand() < 0.5 ? steel : lead);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.12, 6, 14), new THREE.MeshLambertMaterial({ color: 0xc02010 }));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.y = r + 1;
    t.add(bend, wheel);
    return place(t, x, z, rand);
  };
  // A warning sign on its post.
  const warning: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), steel);
    post.position.y = 1.5;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), sign);
    face.position.set(0, 3, 0.12);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), steel);
    back.rotation.y = Math.PI;
    back.position.set(0, 3, 0.1);
    t.add(post, face, back);
    return place(t, x, z, rand);
  };
  // A hot spot on the floor: a slick of something glowing, a haze of it hanging over it.
  const leak: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 2 + rand() * 4;
    const slick = new THREE.Mesh(new THREE.CircleGeometry(r, 18), new THREE.MeshBasicMaterial({ color: 0x5ad83a }));
    slick.rotation.x = -Math.PI / 2;
    slick.position.y = 0.05;
    slick.scale.set(1, 0.7 + rand() * 0.6, 1);
    const haze = new THREE.Sprite(additive(GREEN, 0.3));
    haze.scale.set(r * 3, r * 1.4, 1);
    haze.position.y = r * 0.5;
    t.add(slick, haze);
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [0.7, tower],
      [1.2, fuelPool],
      [3, casks],
      [1.6, pylons],
      [2, rods],
      [1.5, pipe],
      [1.2, warning],
      [2, leak],
    ])(x, z, rand);
}

/** The sign over the reactor's doors: the trefoil, and the words. */
const doorSignTexture = once(() => {
  const W = 512;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#f0c010';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#141414';
  ctx.lineWidth = 12;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  trefoil(ctx, 112, H / 2, 84, '#141414');
  ctx.fillStyle = '#141414';
  ctx.font = 'bold 50px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('DANGER', 220, H / 2 - 40);
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('RADIATION', 220, H / 2 + 14);
  ctx.fillText('AREA', 220, H / 2 + 54);
  return finish(c, false);
});

/**
 * The reactor's doors, across the road: two great slabs of lead rolled
 * back either side of it on their rails, a frame of concrete over the
 * opening with the radiation sign on it, and amber beacons turning on top.
 */
export function reactorGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const H = 11;
  const concrete = lambert(0x6a6c68);
  const leadMat = new THREE.MeshLambertMaterial({ map: leadBrickTexture() });
  const band = new THREE.MeshLambertMaterial({ map: hazardBandTexture() });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(2.4, H, 3), concrete);
    pillar.position.set(side * (hw + 1.2), H / 2, 0);
    // The door, rolled back alongside the road, thick as a wall.
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, H - 1.5, 12), leadMat);
    door.position.set(side * (hw + 3.6), (H - 1.5) / 2, -4);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.84, 1, 12.04), band);
    stripe.position.set(side * (hw + 3.6), 1.2, -4);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 26), lambert(0x2a2c30));
    rail.position.set(side * (hw + 3.6), 0.15, 0);
    g.add(pillar, door, stripe, rail);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 4.8, 2.4, 3), concrete);
  lintel.position.y = H + 1.2;
  g.add(lintel);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 4.84, 0.8, 3.04), band);
  stripe.position.y = H + 0.2;
  g.add(stripe);
  const signGeo = new THREE.PlaneGeometry(10, 5);
  for (const back of [false, true]) {
    const face = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({ map: doorSignTexture() }));
    face.position.set(0, H + 1.2, back ? 1.52 : -1.52);
    face.rotation.y = back ? 0 : Math.PI;
    g.add(face);
  }
  // Amber beacons, turning.
  const beams: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.6, 10), lambert(0x2a2c30));
    base.position.set(side * (hw - 1), H + 2.7, 0);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa020 }));
    lamp.position.set(side * (hw - 1), H + 3.2, 0);
    const pivot = new THREE.Group();
    pivot.position.copy(lamp.position);
    const beam = new THREE.Sprite(additive(0xffa020, 0.9));
    beam.scale.set(6, 1.4, 1);
    beam.position.x = 2.6;
    pivot.add(beam);
    g.add(base, lamp, pivot);
    beams.push(pivot);
  }
  animated.push((time) => beams.forEach((b, k) => (b.rotation.y = time * 4 + k * Math.PI)));
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The nucleus: how high its middle stands over the road through it, and its size at least. */
const NUCLEUS_HEIGHT = 7.5;
const NUCLEUS_RADIUS = 12;
/** The bore the road runs through it: this much wider than the road either side, this high. */
const BORE_MARGIN = 2;
const BORE_HIGH = 7;

/**
 * The nucleus, the core of the reactor: a great cluster of protons (red)
 * and neutrons (grey-blue), pulsing green, the road bored straight through
 * the middle of it (Transcend), and its three electrons whirling round it
 * on their orbits, tilted one to the next, as an atom's drawn.
 */
export function atomNucleus(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const bore = ribbon.halfWidthAtS(s) + BORE_MARGIN;
  const R = Math.max(NUCLEUS_RADIUS, bore + 4);
  const proton = lambert(0xd8402a, { emissive: 0x3a0804 });
  const neutron = lambert(0x8a9cb0, { emissive: 0x0a1018 });
  const nucleons = new THREE.Group();
  const rand = seededRandom(5241);
  const geo = new THREE.SphereGeometry(1, 14, 10);
  // Shells of nucleons, packed, leaving the bore clear.
  for (const [r, n] of [
    [R, Math.round(150 * (R / NUCLEUS_RADIUS) ** 2)],
    [R * 0.66, Math.round(60 * (R / NUCLEUS_RADIUS) ** 2)],
  ] as const) {
    for (let k = 0; k < n; k++) {
      // A Fibonacci sphere, a little jostled.
      const y = 1 - (2 * (k + 0.5)) / n;
      const ring = Math.sqrt(1 - y * y);
      const a = k * 2.39996;
      const p = new THREE.Vector3(Math.cos(a) * ring, y, Math.sin(a) * ring).multiplyScalar(r * (0.95 + rand() * 0.1));
      // In the road's frame x is across it: keep clear of the bore through it.
      if (Math.abs(p.x) < bore + 2 && p.y + NUCLEUS_HEIGHT < BORE_HIGH + 2) continue;
      const ball = new THREE.Mesh(geo, rand() < 0.5 ? proton : neutron);
      ball.position.copy(p);
      ball.scale.setScalar(1.7 + rand() * 0.4);
      nucleons.add(ball);
    }
  }
  nucleons.position.y = NUCLEUS_HEIGHT;
  g.add(nucleons);
  // Its glow, pulsing green: big round it, and brighter in the bore.
  const halo = new THREE.Sprite(additive(GREEN, 0.5));
  halo.scale.setScalar(R * 4.2);
  halo.position.y = NUCLEUS_HEIGHT + 2;
  const core = new THREE.Sprite(additive(0xd0ffb0, 0.5));
  core.scale.set(bore * 2.4, BORE_HIGH * 1.6, 1);
  core.position.y = BORE_HIGH * 0.6;
  g.add(halo, core);
  // Its electrons, whirling round on three orbits.
  const orbits: { ring: THREE.Group; electron: THREE.Object3D; a: number; b: number; speed: number }[] = [];
  const ringMat = new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let k = 0; k < 3; k++) {
    const ring = new THREE.Group();
    const a = R * 2.6;
    const b = R * 1.1;
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j <= 64; j++) pts.push(new THREE.Vector3(Math.cos((j / 64) * Math.PI * 2) * a, Math.sin((j / 64) * Math.PI * 2) * b, 0));
    ring.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 0.18, 5, true), ringMat));
    const electron = new THREE.Group();
    electron.add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), new THREE.MeshBasicMaterial({ color: 0xd8f4ff })));
    const spark = new THREE.Sprite(additive(BLUE, 0.9));
    spark.scale.setScalar(5);
    electron.add(spark);
    ring.add(electron);
    // Tilted one to the next round the vertical, each leaning back to stand up off the ground.
    ring.rotation.set(Math.PI / 2 - 0.5, (k * Math.PI) / 3, 0, 'YXZ');
    ring.position.y = NUCLEUS_HEIGHT + 6;
    g.add(ring);
    orbits.push({ ring, electron, a, b, speed: 1.6 + k * 0.35 });
  }
  animated.push((time) => {
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);
    halo.material.opacity = 0.35 + 0.3 * pulse;
    core.material.opacity = 0.25 + 0.3 * pulse;
    nucleons.scale.setScalar(1 + 0.025 * pulse);
    for (const o of orbits) {
      const t = time * o.speed;
      o.electron.position.set(Math.cos(t) * o.a, Math.sin(t) * o.b, 0);
    }
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

// ---- The alphas ----------------------------------------------------------------------

/**
 * A burst of alpha particles, the hazard's look: a glow at the edge of the
 * road they'll come from (the warning), then the three of them, each two
 * protons and two neutrons bound tight in a glow, streaking across the
 * road with a trail behind; and in their wake the static wave, a curtain
 * of crackling snow right across the road. Adds them to `obj` and returns
 * the parts, for HazardsView to pose each frame.
 */
export function alphaParts(obj: THREE.Object3D): THREE.Object3D[] {
  const proton = new THREE.MeshLambertMaterial({ color: 0xff5a3a, emissive: 0x801808 });
  const neutron = new THREE.MeshLambertMaterial({ color: 0xa8c0d8, emissive: 0x203040 });
  const geo = new THREE.SphereGeometry(0.55, 12, 9);
  // A tetrahedron of four: two of each.
  const corners = [
    [1, 1, 1],
    [-1, -1, 1],
    [-1, 1, -1],
    [1, -1, -1],
  ];
  const parts: THREE.Object3D[] = [];
  const warn = new THREE.Group();
  const port = new THREE.Sprite(additive(GREEN, 0.8));
  port.scale.set(3, 5, 1);
  port.position.y = 2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 2, 24), new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  warn.add(port, ring);
  parts.push(warn);
  for (let k = 0; k < ALPHA_COUNT; k++) {
    const alpha = new THREE.Group();
    const cluster = new THREE.Group();
    corners.forEach(([x, y, z], j) => {
      const ball = new THREE.Mesh(geo, j % 2 ? neutron : proton);
      ball.position.set(x * 0.34, y * 0.34, z * 0.34);
      cluster.add(ball);
    });
    const glow = new THREE.Sprite(additive(ORANGE, 0.9));
    glow.scale.setScalar(ALPHA_RADIUS * 3.4);
    // The trail: a streak of green glow stretched out behind it, across the road.
    const trail = new THREE.Sprite(additive(GREEN, 0.6));
    trail.scale.set(9, 1.1, 1);
    alpha.add(cluster, glow, trail);
    parts.push(alpha);
  }
  const wave = new THREE.Mesh(new THREE.PlaneGeometry(1, 3.4), new THREE.MeshBasicMaterial({ map: staticTexture().clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  (wave.material.map as THREE.Texture).wrapS = THREE.RepeatWrapping;
  parts.push(wave);
  for (const o of parts) obj.add(o);
  return parts;
}

/** Poses a burst's parts (from alphaParts) for its stage. */
export function poseAlphas(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [warn, ...rest] = parts;
  const wave = rest[ALPHA_COUNT] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  const A = ALPHA_STAGES;
  const u = p.phase;
  obj.position.set(p.ax, p.ground, p.az);
  obj.rotation.y = p.heading;
  // A lateral to the right is local -x.
  warn.visible = u < A.fire;
  warn.position.x = -p.side * p.radius;
  if (warn.visible) {
    // Brightening, and flickering faster, as the burst comes.
    const k = u / A.fire;
    const flick = 0.5 + 0.5 * Math.sin(elapsed * (8 + 30 * k));
    ((warn.children[0] as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 0.25 + 0.65 * k * flick;
    warn.scale.setScalar(0.6 + 0.6 * k);
  }
  for (let n = 0; n < ALPHA_COUNT; n++) {
    const alpha = rest[n];
    const a = alphaAcross(u, n, p.radius);
    alpha.visible = a !== null;
    if (a === null) continue;
    alpha.position.set(-p.side * a, 1.2, 0);
    const [cluster, , trail] = alpha.children;
    cluster.rotation.set(elapsed * 9 + n, elapsed * 7, 0);
    // The trail streams back toward where it came from.
    trail.position.x = -p.side * 4.5;
  }
  wave.visible = p.lane === 1;
  if (wave.visible) {
    const k = (u - A.wake) / (A.gone - A.wake);
    wave.scale.set(2 * p.radius, 1, 1);
    wave.position.set(0, 1.7, 0);
    const map = wave.material.map!;
    map.offset.set(Math.floor(elapsed * 30) * 0.37, Math.floor(elapsed * 24) * 0.21);
    map.repeat.set(p.radius / 6, 1);
    wave.material.opacity = (1 - k) * (0.7 + 0.3 * Math.sin(elapsed * 60));
  }
}
