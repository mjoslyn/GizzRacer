import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { HAMMER_FACE, HAMMER_HANG, HAMMER_PERIOD, HAMMER_SPARKS, HAMMER_STAGES, type HazardPose } from '../items/hazards';
import { nearestOnSpline, pointAt } from '../tracks/spline';
import type { Ribbon, Track } from '../tracks/track';
import { glowTexture } from './textures';

/**
 * Alien Metal's world, the first of the Alien Metal Cup's: the astral
 * blacksmith's forge, floating among the stars, where the metal is forged
 * out of the elements. A floor of black iron scale, cracks glowing in it;
 * anvils, ingots and lumps of the alien metal itself; furnaces for the
 * fire, quench tanks steaming and globes of water for the water, clouds
 * and ice; the Möbius strip the lap runs the edge of, turning over the
 * forge; and the blacksmith himself, huge in the stars, hammering on the
 * beat. Its textures (the forged plates of the road, the iron floor, the
 * forge's walls tinted with the colours steel turns in the heat, the
 * rail), its scenery, its landmarks (the anvil over the start, the strip,
 * the blacksmith) and its hazard's look (his hammer coming down, and the
 * sparks off it).
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type Animated = ((time: number) => void)[];
type RGB = [number, number, number];

/** The album's tempo: everything here that keeps time keeps it at 143 beats a minute. */
const BPM = 143;

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
 * The colours steel goes as it's heated, the temper colours, from cool to
 * hot: straw, bronze, purple, and blue. `t` from 0 to 1 runs through them.
 */
function temper(t: number): RGB {
  const stops: RGB[] = [[214, 186, 112], [176, 112, 58], [118, 62, 132], [52, 86, 176], [96, 150, 200]];
  const q = Math.max(0, Math.min(0.999, t)) * (stops.length - 1);
  const k = Math.floor(q);
  return mix(stops[k], stops[k + 1], q - k);
}

/** Where the plates of the road meet, along the tile (in pixels of a 256 tile): across it twice. */
const SEAMS = [0, 128];
/** How far either side of a seam it glows, in pixels. */
const SEAM_GLOW = 5;

/**
 * The road: forged steel plates laid on the astral blacksmith's anvil, end
 * to end (the texture spans half the road, its v running along it), dark
 * and pocked all over with the hammer's peen marks, the colours of the
 * heat tempered into them near the seams, and the seams themselves still
 * glowing (anvilGlowTexture lights them).
 */
export function anvilRoadTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 8, 4, 5101);
  const sheen = fbm(S, 3, 2, 5102);
  paint(ctx, S, S, (x, y, i) => {
    const steel = mix([40, 42, 50], [78, 80, 92], n[i]);
    // Nearer a seam, the heat's colours tempered into the steel.
    const d = Math.min(...SEAMS.map((s0) => Math.min(Math.abs(y - s0), S - Math.abs(y - s0))));
    const heat = Math.max(0, 1 - d / 22);
    const tinted = heat > 0 ? mix(steel, temper(0.25 + 0.7 * (1 - heat) + sheen[i] * 0.2), heat * 0.55) : steel;
    // The plates' long edges: darker toward the road's edge and its middle.
    const u = x / S;
    const edge = Math.min(u, 1 - u);
    return shade(tinted, edge < 0.04 ? 0.7 : 0.9 + sheen[i] * 0.2);
  });
  const rand = seededRandom(5103);
  // The hammer's peen marks: shallow dimples, a dark pool and a bright lip on the side the light catches.
  for (let k = 0; k < 420; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = 2 + rand() * 5;
    wrapped(S, x, y, (px, py) => {
      const g = ctx.createRadialGradient(px - r * 0.2, py - r * 0.2, 0, px, py, r);
      g.addColorStop(0, 'rgba(10,10,16,0.35)');
      g.addColorStop(0.7, 'rgba(20,20,28,0.15)');
      g.addColorStop(0.92, 'rgba(170,176,196,0.28)');
      g.addColorStop(1, 'rgba(170,176,196,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // The seams: a dark gap with the hot metal showing in it.
  for (const y0 of SEAMS) {
    for (const y of [y0, y0 + S]) {
      ctx.fillStyle = 'rgba(12,8,8,0.9)';
      ctx.fillRect(0, y - 2.5, S, 5);
      ctx.fillStyle = 'rgba(255,150,60,0.95)';
      ctx.fillRect(0, y - 1, S, 2);
    }
  }
  // Rivets along the plates' long edges.
  for (let y = 16; y < S; y += 32) {
    for (const x of [6, S - 6]) {
      ctx.fillStyle = 'rgba(16,16,22,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(150,154,170,0.8)';
      ctx.beginPath();
      ctx.arc(x - 0.8, y - 0.8, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish(c);
}

/** The road's glow: the seams between the plates, molten, the heat fading off either side of them. Black elsewhere. */
export function anvilGlowTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  for (const y0 of SEAMS) {
    for (const y of [y0, y0 + S]) {
      const g = ctx.createLinearGradient(0, y - SEAM_GLOW, 0, y + SEAM_GLOW);
      g.addColorStop(0, 'rgba(120,30,0,0)');
      g.addColorStop(0.4, 'rgba(255,110,30,1)');
      g.addColorStop(0.5, 'rgba(255,220,140,1)');
      g.addColorStop(0.6, 'rgba(255,110,30,1)');
      g.addColorStop(1, 'rgba(120,30,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y - SEAM_GLOW, S, SEAM_GLOW * 2);
    }
  }
  return finish(c);
}

/**
 * The ground: the forge's floor, black iron scale flaking in plates, the
 * cracks between them glowing with the heat under it, cinders, and the
 * glitter of stardust settled on it.
 */
export function forgeFloorTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 5, 5111);
  const flake = fbm(S, 12, 3, 5112);
  const rust = fbm(S, 3, 3, 5113);
  paint(ctx, S, S, (_x, _y, i) => {
    const scale = mix([20, 20, 28], [52, 50, 60], n[i]);
    const flaked = flake[i] > 0.58 ? shade(scale, 1.25) : scale;
    // Patches where it's gone violet with the heat, others rust-brown.
    return rust[i] > 0.64 ? mix(flaked, [70, 40, 80], (rust[i] - 0.64) * 2.5) : rust[i] < 0.3 ? mix(flaked, [70, 40, 26], (0.3 - rust[i]) * 2) : flaked;
  });
  const rand = seededRandom(5114);
  // Cracks glowing with the heat under the floor: a soft halo, then the line.
  for (let k = 0; k < 22; k++) {
    let x = rand() * S;
    let y = rand() * S;
    let a = rand() * Math.PI * 2;
    const pts: [number, number][] = [[x, y]];
    for (let j = 0; j < 6; j++) {
      a += (rand() - 0.5) * 1.2;
      x += Math.cos(a) * (10 + rand() * 18);
      y += Math.sin(a) * (10 + rand() * 18);
      pts.push([x, y]);
    }
    for (const [w, col] of [[4, 'rgba(255,90,20,0.12)'], [1.2, 'rgba(230,110,40,0.75)']] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      for (const ox of [-S, 0, S]) {
        for (const oy of [-S, 0, S]) {
          ctx.beginPath();
          pts.forEach(([px, py], j) => (j ? ctx.lineTo(px + ox, py + oy) : ctx.moveTo(px + ox, py + oy)));
          ctx.stroke();
        }
      }
    }
  }
  // Cinders and stardust.
  for (let k = 0; k < 900; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const star = rand() < 0.45;
    const col: RGB = star ? mix([160, 210, 255], [240, 250, 255], rand()) : mix([12, 10, 14], [60, 30, 22], rand());
    const r = star ? 0.6 + rand() * 0.9 : 1 + rand() * 2.5;
    wrapped(S, x, y, (px, py) => {
      ctx.fillStyle = css(col, star ? 0.9 : 0.8);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  return finish(c);
}

/**
 * The forge's walls (the sunk way into it, and the world's edge): iron
 * plates riveted together, the colours of the heat tempered into them in
 * bands, straw and bronze and purple and blue, soot over them.
 */
export function forgeWallTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const n = fbm(S, 6, 4, 5121);
  const band = fbm(S, 2, 2, 5122);
  paint(ctx, S, S, (x, y, i) => {
    const v = y / S;
    const t = (v * 1.6 + band[i] * 0.8 + 0.1) % 1;
    const iron = mix([46, 46, 54], [84, 84, 96], n[i]);
    const tinted = mix(iron, temper(t), 0.45 + n[i] * 0.2);
    // Plate edges: every 64 down, every 128 along, offset course by course.
    const course = Math.floor(y / 64);
    const px = (x + (course % 2) * 64) % 128;
    const seam = y % 64 < 2 || px < 2;
    return seam ? shade(iron, 0.35) : shade(tinted, 0.8 + 0.2 * Math.sin((x / S) * Math.PI * 4 + n[i] * 3));
  });
  // Rivets along every plate's edges.
  for (let y = 0; y < S; y += 64) {
    for (let x = 8; x < S; x += 16) {
      for (const yy of [y + 6, y + 58]) {
        ctx.fillStyle = 'rgba(20,20,26,0.9)';
        ctx.beginPath();
        ctx.arc(x, yy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(190,190,210,0.7)';
        ctx.beginPath();
        ctx.arc(x - 0.7, yy - 0.7, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Soot, in streaks rising from the floor.
  const rand = seededRandom(5123);
  for (let k = 0; k < 18; k++) {
    const x = rand() * S;
    const g = ctx.createLinearGradient(0, S, 0, S * (0.3 + rand() * 0.4));
    g.addColorStop(0, 'rgba(8,6,8,0.55)');
    g.addColorStop(1, 'rgba(8,6,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 6 + rand() * 16, S);
  }
  return finish(c);
}

/** The barrier: a forged iron rail, rivets along it, and its top edge still hot from the forge. */
export function forgeRailTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  const n = fbm(W, 8, 3, 5131);
  paint(ctx, W, H, (_x, y, i) => {
    const v = y / H;
    const iron = mix([30, 30, 38], [70, 70, 82], n[i]);
    // The top edge, hot: orange going to white along the very top.
    if (v < 0.14) return mix([255, 236, 190], [255, 110, 30], v / 0.14);
    if (v < 0.3) return mix([255, 110, 30], iron, (v - 0.14) / 0.16);
    return shade(iron, 0.75 + 0.25 * Math.sin(v * Math.PI));
  });
  for (let x = 16; x < W; x += 32) {
    ctx.fillStyle = 'rgba(14,14,18,0.95)';
    ctx.beginPath();
    ctx.arc(x, H * 0.62, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(170,170,190,0.8)';
    ctx.beginPath();
    ctx.arc(x - 1, H * 0.62 - 1, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}

const glowTex = once(() => glowTexture());
/** The strip's own colours, along it: the metal glowing from forge orange through white heat to the cold blue of the stars. */
const STRIP_HOT = new THREE.Color(0xff6a1a);
const STRIP_COLD = new THREE.Color(0x5ac8ff);

/** Where the ribbon is at `s`, and its heading. */
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

/** A glowing sprite, additive, `size` across. */
function glow(color: number, size: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

/** An anvil, `len` long from heel to the horn's tip, its face at height `h`: the waist, the face, the horn, a stepped foot. Its horn points down +z. */
function anvilShape(len: number, h: number, steel: THREE.Material, hot?: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const w = len * 0.28;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(w * 1.5, h * 0.22, len * 0.55), steel);
  foot.position.y = h * 0.11;
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.4, w * 0.6, h * 0.5, 4), steel);
  waist.rotation.y = Math.PI / 4;
  waist.scale.z = 1.6;
  waist.position.y = h * 0.47;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.3, len * 0.62), steel);
  body.position.set(0, h * 0.85, -len * 0.12);
  // The horn: a cone along +z off the front of the face, hot toward its tip when there's heat to show.
  const horn = new THREE.Mesh(new THREE.ConeGeometry(w * 0.48, len * 0.42, 14), hot ?? steel);
  horn.rotation.x = Math.PI / 2;
  horn.position.set(0, h * 0.9, len * 0.38);
  g.add(foot, waist, body, horn);
  return g;
}

/** The elements the metal is forged out of, by which stretch of the chant a place is nearest. */
type Element = 'water' | 'fire' | 'clouds' | 'ice' | 'forge';

/** Which element's ground a place on the forge floor is: the chant's water and fire beside their zones, clouds and ice by theirs, the forge's own elsewhere. */
export function forgeElements(track: Track): (x: number, z: number) => Element {
  const names = track.def.main.sections;
  return (x, z) => {
    const hit = nearestOnSpline(track.spline, x, z);
    const sec = names[track.main.sectionIndex[hit.index]];
    if (hit.distance > 70) return 'forge';
    if (sec.name === 'Water') return 'water';
    if (sec.name === 'Fire') return 'fire';
    if (sec.name === 'Clouds and Ice') return hit.s < track.mainS((sec.from + sec.to) / 2) ? 'clouds' : 'ice';
    return 'forge';
  };
}

/**
 * The forge floor's scenery, by element. The forge's own: anvils with
 * metal glowing on them, ingots stacked, lumps of the alien metal itself
 * fallen out of the stars (dark, the colours of oil on it, veins of cold
 * light). Water: quench tanks steaming, globes of water floating. Fire:
 * furnaces roaring, braziers. Clouds, low and drifting; ice, in crystals.
 */
export function forgeFeature(animated: Animated, element: (x: number, z: number) => Element = () => 'forge'): Feature {
  const iron = lambert(0x2a2c36, { flatShading: true });
  const ironDark = lambert(0x16161c, { flatShading: true });
  const hot = new THREE.MeshBasicMaterial({ color: 0xff7a24 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffd8a0 });
  const alien = new THREE.MeshPhongMaterial({ color: 0x1a1a2a, emissive: 0x0a1630, shininess: 120, specular: 0x9a7aff, flatShading: true });
  const vein = new THREE.MeshBasicMaterial({ color: 0x6ae8ff });
  const brick = lambert(0x4a2a24, { flatShading: true });
  const water = new THREE.MeshPhongMaterial({ color: 0x2a7aba, emissive: 0x0a2440, shininess: 140, specular: 0xffffff, transparent: true, opacity: 0.7 });
  const cloud = lambert(0xc8c4e8, { flatShading: true, emissive: 0x1a1830 });
  const ice = new THREE.MeshPhongMaterial({ color: 0xa8e0ff, emissive: 0x1a4a7a, shininess: 160, specular: 0xffffff, transparent: true, opacity: 0.8, flatShading: true });
  const steam = new THREE.SpriteMaterial({ map: glowTex(), color: 0xd8e0f0, transparent: true, opacity: 0.25, depthWrite: false });

  const anvil: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const len = 2.6 + rand() * 2;
    t.add(anvilShape(len, len * 0.55, iron));
    // A bar of the metal on it, white-hot or cooling to orange.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len * 0.12, len * 0.08, len * 0.5), rand() < 0.5 ? hot : white);
    bar.position.y = len * 0.55 * 1.02;
    bar.rotation.y = (rand() - 0.5) * 0.6;
    t.add(bar);
    const g = glow(0xff7a2a, len * 1.4, 0.5);
    g.position.y = len * 0.6;
    t.add(g);
    return place(t, x, z, rand);
  };
  const ingots: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.42, 0.6, 0.4, 4);
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 4 - row; k++) {
        const bar = new THREE.Mesh(geo, rand() < 0.15 ? hot : row % 2 ? iron : ironDark);
        bar.rotation.y = Math.PI / 4;
        bar.scale.set(1, 1, 3);
        bar.position.set((k - (3 - row) / 2) * 1.0, 0.2 + row * 0.42, 0);
        if (row % 2) bar.rotation.y += Math.PI / 2;
        t.add(bar);
      }
    }
    t.scale.setScalar(0.9 + rand() * 0.8);
    return place(t, x, z, rand);
  };
  // A lump of the alien metal, fallen out of the stars: dark, an oily sheen on it, veins of cold light running through.
  const lump: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 1.5 + rand() * 3;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), alien);
    rock.scale.set(1, 0.7 + rand() * 0.5, 1.1);
    rock.position.y = r * 0.5;
    rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    t.add(rock);
    for (let k = 0; k < 4; k++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.12, r * 0.9, 0.12), vein);
      const a = rand() * Math.PI * 2;
      v.position.set(Math.cos(a) * r * 0.8, r * 0.55, Math.sin(a) * r * 0.8);
      v.rotation.set(rand() - 0.5, a, rand() - 0.5);
      t.add(v);
    }
    const g = glow(0x5ad8ff, r * 3, 0.35);
    g.position.y = r * 0.7;
    t.add(g);
    const ph = rand() * 10;
    animated.push((time) => (g.material.opacity = 0.25 + 0.15 * Math.sin(time * 1.3 + ph)));
    return place(t, x, z, rand);
  };
  // A quench tank: an iron tub of water, steam rising off it where the metal went in.
  const tank: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 2 + rand() * 2;
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, 1.6, 16, 1, true), lambert(0x2a2c36, { side: THREE.DoubleSide }));
    tub.position.y = 0.8;
    const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.97, 16), water);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 1.4;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 6, 20), iron);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.6;
    t.add(tub, top, rim);
    const puffs: THREE.Sprite[] = [];
    for (let k = 0; k < 4; k++) {
      const p = new THREE.Sprite(steam);
      t.add(p);
      puffs.push(p);
    }
    const ph = rand() * 10;
    animated.push((time) =>
      puffs.forEach((p, k) => {
        const u = (time * 0.18 + ph + k / 4) % 1;
        p.position.set(Math.sin(u * 4 + k) * r * 0.4, 1.6 + u * 9, Math.cos(u * 3 + k) * r * 0.3);
        p.scale.setScalar(r * (0.8 + u * 2.2));
      }),
    );
    return place(t, x, z, rand);
  };
  // A globe of water floating over the floor, wobbling as it turns.
  const globe: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 1.5 + rand() * 2.5;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), water);
    const h = r + 2 + rand() * 6;
    t.add(ball);
    const ph = rand() * 10;
    animated.push((time) => {
      ball.position.y = h + Math.sin(time * 0.8 + ph) * 0.8;
      const w = 1 + 0.06 * Math.sin(time * 2.3 + ph);
      ball.scale.set(w, 1 / w, w);
    });
    return place(t, x, z, rand);
  };
  // A furnace: a squat brick hearth, an iron hood, its mouth roaring.
  const furnace: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 2.5 + rand() * 1.5;
    const hearth = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, r * 1.2, 10), brick);
    hearth.position.y = r * 0.6;
    const hood = new THREE.Mesh(new THREE.ConeGeometry(r * 0.85, r * 1.1, 10), iron);
    hood.position.y = r * 1.75;
    const flue = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.25, r * 2, 8), ironDark);
    flue.position.y = r * 2.9;
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(r * 0.42, 12, 0, Math.PI), hot);
    mouth.position.set(0, r * 0.35, r * 0.96);
    t.add(hearth, hood, flue, mouth);
    const flames: THREE.Sprite[] = [];
    for (let k = 0; k < 3; k++) {
      const f = glow(k ? 0xff5a10 : 0xffb040, r * 1.5);
      f.position.set(0, r * 0.5, r * 1.1);
      t.add(f);
      flames.push(f);
    }
    const ph = rand() * 10;
    animated.push((time) =>
      flames.forEach((f, k) => {
        const w = 0.7 + 0.3 * Math.abs(Math.sin(time * (5 + k * 1.7) + ph + k));
        f.scale.setScalar(r * 1.6 * w);
        f.position.y = r * (0.5 + 0.2 * k * w);
      }),
    );
    return place(t, x, z, rand);
  };
  // A brazier: an iron bowl on three legs, fire in it.
  const brazier: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 1.6 + rand();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, h + 0.3, 5), ironDark);
      leg.position.set(Math.cos(a) * 0.6, h / 2, Math.sin(a) * 0.6);
      leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
      t.add(leg);
    }
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lambert(0x2a2c36, { side: THREE.DoubleSide }));
    bowl.position.y = h + 0.6;
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12), hot);
    coals.rotation.x = -Math.PI / 2;
    coals.position.y = h + 0.5;
    const fire = glow(0xff7a20, 3.2);
    fire.position.y = h + 1.4;
    t.add(bowl, coals, fire);
    const ph = rand() * 10;
    animated.push((time) => fire.scale.setScalar(2.6 + Math.abs(Math.sin(time * 6 + ph)) * 1.2));
    return place(t, x, z, rand);
  };
  // A cloud come down to the floor, drifting.
  const cloudBank: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 4 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const r = 2 + rand() * 3;
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cloud);
      puff.position.set((k - n / 2) * 2.4 + rand(), 3 + rand() * 2, (rand() - 0.5) * 3);
      puff.scale.y = 0.6;
      t.add(puff);
    }
    const ph = rand() * 10;
    const y0 = 2 + rand() * 6;
    animated.push((time) => {
      t.position.y = y0 + Math.sin(time * 0.3 + ph) * 1.2;
    });
    place(t, x, z, rand);
    t.position.y = y0;
    return t;
  };
  // Ice: a cluster of crystals, cold light in them.
  const crystals: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 3 + Math.floor(rand() * 5);
    for (let k = 0; k < n; k++) {
      const h = 2 + rand() * 6;
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), ice);
      c.scale.set(0.5 + rand() * 0.6, h, 0.5 + rand() * 0.6);
      c.position.set((rand() - 0.5) * 3, h * 0.6, (rand() - 0.5) * 3);
      c.rotation.set((rand() - 0.5) * 0.7, rand() * 3, (rand() - 0.5) * 0.7);
      t.add(c);
    }
    const g = glow(0x8ad8ff, 7, 0.3);
    g.position.y = 3;
    t.add(g);
    return place(t, x, z, rand);
  };
  const forge: [number, Feature][] = [
    [3, anvil],
    [2, ingots],
    [3, lump],
    [1, furnace],
    [1, tank],
  ];
  return (x, z, rand) => {
    switch (element(x, z)) {
      case 'water':
        return pick(rand, [[3, tank], [3, globe], [1, lump]])(x, z, rand);
      case 'fire':
        return pick(rand, [[3, furnace], [3, brazier], [1, anvil]])(x, z, rand);
      case 'clouds':
        return pick(rand, [[4, cloudBank], [1, globe]])(x, z, rand);
      case 'ice':
        return pick(rand, [[4, crystals], [1, cloudBank]])(x, z, rand);
      default:
        return pick(rand, forge)(x, z, rand);
    }
  };
}

/**
 * The anvil over the start (and over the way down into the forge): an
 * anvil the size of a building standing beside the road, its horn reaching
 * right out over it, red-hot toward the tip, sparks dropping off it onto
 * the karts passing under.
 */
export function anvilGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const steel = new THREE.MeshPhongMaterial({ color: 0x3a3c4a, emissive: 0x0c0c14, shininess: 70, specular: 0x9a9ab0, flatShading: true });
  const H = 13;
  // The anvil beside the road: its stepped foot, the waist, the body with the face on top and the heel behind.
  const x0 = -(hw + 10);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 13), steel);
  foot.position.set(x0, 1.5, 0);
  const waist = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 7), steel);
  waist.position.set(x0, 6, 0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(18, 5, 10), steel);
  body.position.set(x0, H, 0);
  const heel = new THREE.Mesh(new THREE.BoxGeometry(5, 3.4, 8), steel);
  heel.position.set(x0 - 11, H + 0.8, 0);
  const face = new THREE.Mesh(new THREE.BoxGeometry(23, 0.4, 10.2), lambert(0x9a9cae));
  face.position.set(x0 - 2.5, H + 2.7, 0);
  g.add(foot, waist, body, heel, face);
  // The horn, out across the road: steel at its root, red-hot toward the tip, in rings.
  const len = -x0 - 9 + hw + 6;
  const horn = new THREE.Group();
  const rings = 10;
  for (let k = 0; k < rings; k++) {
    const u0 = k / rings;
    const u1 = (k + 1) / rings;
    const heat = new THREE.Color(0x5a2a1a).lerp(new THREE.Color(0xffa040), Math.max(0, (u0 - 0.35) / 0.65));
    const mat = u0 > 0.3 ? new THREE.MeshBasicMaterial({ color: heat }) : steel;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(3.6 * (1 - u1) + 0.1, 3.6 * (1 - u0) + 0.1, len / rings + 0.02, 16), mat);
    seg.position.y = ((u0 + u1) / 2) * len;
    horn.add(seg);
  }
  horn.rotation.z = -Math.PI / 2;
  horn.position.set(x0 + 9, H + 0.5, 0);
  g.add(horn);
  const tipGlow = glow(0xff7a2a, 14, 0.85);
  tipGlow.position.set(hw + 4, H + 0.5, 0);
  g.add(tipGlow);
  // Sparks dropping off the hot horn onto the road.
  const sparks: THREE.Sprite[] = [];
  for (let k = 0; k < 16; k++) {
    const sp = glow(0xffc070, 0.9);
    g.add(sp);
    sparks.push(sp);
  }
  animated.push((time) => {
    tipGlow.material.opacity = 0.7 + 0.25 * Math.sin((time * BPM * Math.PI) / 60);
    sparks.forEach((sp, k) => {
      const u = (time * 0.6 + k / sparks.length) % 1;
      const x = hw + 3 - ((k * 7) % 16) * ((hw + 1) / 8);
      sp.position.set(x, H - 1 - u * u * (H - 1), Math.sin(k * 3.1) * 2);
      sp.material.opacity = 1 - u * 0.8;
    });
  });
  g.position.set(f.x, Math.max(0, f.y), f.z);
  g.rotation.y = f.heading;
  return g;
}

/** How far through a smith's stroke at `time`: the hammer comes down on every second beat. 0 is the strike. */
function strokeAt(time: number): number {
  return ((time * BPM) / 60 / 2) % 1;
}

/**
 * The astral blacksmith, huge in the stars: a giant made of the night,
 * stars glinting all over him, his eyes cold blue, a leather apron lit
 * from below by the metal on his anvil. He holds it with the tongs in one
 * hand and brings the hammer down on it on the beat with the other, and
 * sparks burst off it at every stroke.
 */
export function astralBlacksmith(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const road = frameAt(ribbon, s);
  const night = new THREE.MeshLambertMaterial({ color: 0x141a34, emissive: 0x0a1028 });
  const leather = new THREE.MeshLambertMaterial({ color: 0x3a2214, emissive: 0x2a0e04 });
  const steel = new THREE.MeshLambertMaterial({ color: 0x2a2c3a, emissive: 0x0a0a16 });
  const eye = new THREE.MeshBasicMaterial({ color: 0x8ae8ff, fog: false });
  const hotBar = new THREE.MeshBasicMaterial({ color: 0xffa040, fog: false });
  const S = 12;
  const limb = (r0: number, r1: number, len: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 10), night);
    m.position.y = -len / 2;
    const pivot = new THREE.Group();
    pivot.add(m);
    return pivot;
  };
  // Legs and hips.
  for (const side of [-1, 1]) {
    const leg = limb(1.4 * S, 1.0 * S, 7 * S);
    leg.position.set(side * 1.6 * S, 7 * S, 0);
    leg.rotation.z = side * 0.08;
    g.add(leg);
  }
  const hips = new THREE.Mesh(new THREE.BoxGeometry(5 * S, 2 * S, 2.6 * S), night);
  hips.position.y = 7.4 * S;
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(3.2 * S, 2.4 * S, 5.5 * S, 12), night);
  chest.position.y = 11 * S;
  chest.scale.z = 0.6;
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.5 * S, 16, 12), night);
  head.position.y = 15.2 * S;
  const beard = new THREE.Mesh(new THREE.ConeGeometry(1.3 * S, 3 * S, 10), night);
  beard.rotation.x = Math.PI;
  beard.position.set(0, 13.4 * S, 0.7 * S);
  g.add(hips, chest, head, beard);
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.22 * S, 8, 6), eye);
    e.position.set(side * 0.55 * S, 15.4 * S, 1.35 * S);
    g.add(e);
    const eg = glow(0x8ae8ff, 2.5 * S, 0.8);
    eg.material.fog = false;
    eg.position.copy(e.position);
    g.add(eg);
  }
  // The apron, lit from below.
  const apron = new THREE.Mesh(new THREE.BoxGeometry(4.6 * S, 7 * S, 0.3 * S), leather);
  apron.position.set(0, 8.6 * S, 1.75 * S);
  g.add(apron);
  // His anvil before him at his waist, the bar of metal glowing on it.
  const anvil = anvilShape(8 * S, 4 * S, steel);
  anvil.rotation.y = Math.PI / 2;
  anvil.position.set(0, 4.6 * S, 6 * S);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(3 * S, 0.4 * S, 0.5 * S), hotBar);
  bar.position.set(0.5 * S, 8.8 * S, 6 * S);
  g.add(anvil, bar);
  const heat = glow(0xff7a2a, 16 * S, 0.7);
  heat.material.fog = false;
  heat.position.set(0, 9 * S, 6 * S);
  g.add(heat);
  // The left arm holds the tongs on the bar; the right swings the hammer.
  const left = limb(0.9 * S, 0.7 * S, 6.5 * S);
  left.position.set(-3.4 * S, 13.2 * S, 0);
  left.rotation.set(-1.0, 0, -0.35);
  g.add(left);
  const shoulder = new THREE.Group();
  shoulder.position.set(3.4 * S, 13.2 * S, 0);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.9 * S, 0.7 * S, 6.5 * S, 10), night);
  arm.position.y = -3.25 * S;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * S, 0.22 * S, 4.5 * S, 8), leather);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0, -6.5 * S, 2 * S);
  const hammer = new THREE.Mesh(new THREE.BoxGeometry(1.6 * S, 1.6 * S, 2.6 * S), steel);
  hammer.position.set(0, -6.5 * S, 4.4 * S);
  hammer.rotation.x = Math.PI / 2;
  shoulder.add(arm, handle, hammer);
  g.add(shoulder);
  // Stars all over him, and a haze of nebula round him.
  const rand = seededRandom(5141);
  const stars: THREE.Sprite[] = [];
  for (let k = 0; k < 70; k++) {
    const st = glow(rand() < 0.7 ? 0xe8f4ff : 0x9ad8ff, (0.5 + rand() * 0.9) * S, 0.9);
    st.material.fog = false;
    const y = (1 + rand() * 15) * S;
    const a = rand() * Math.PI * 2;
    const r = (y > 12 * S ? 1.6 : y > 7 * S ? 3 : 1.4) * S;
    st.position.set(Math.cos(a) * r * (y < 7 * S ? 2 : 1), y, Math.sin(a) * r * 0.6 + 0.5 * S);
    g.add(st);
    stars.push(st);
  }
  const haze = glow(0x5a3aaa, 36 * S, 0.22);
  haze.material.fog = false;
  haze.position.y = 9 * S;
  g.add(haze);
  // The burst of sparks at every stroke.
  const burst: THREE.Sprite[] = [];
  for (let k = 0; k < 18; k++) {
    const b = glow(0xffc070, 0.9 * S);
    b.material.fog = false;
    g.add(b);
    burst.push(b);
  }
  animated.push((time) => {
    const u = strokeAt(time);
    // Up slowly over most of the stroke, then down hard onto the bar.
    const raise = u < 0.75 ? Math.sin((u / 0.75) * (Math.PI / 2)) : 1 - ((u - 0.75) / 0.25) ** 2;
    shoulder.rotation.x = -0.4 - raise * 2.2;
    stars.forEach((st, k) => (st.material.opacity = 0.6 + 0.4 * Math.sin(time * 2 + k * 1.7)));
    // After each strike, the sparks fly out off the bar and fall.
    burst.forEach((b, k) => {
      const a = (k / burst.length) * Math.PI * 2;
      const t = u * 1.4;
      b.visible = u < 0.5;
      b.position.set(0.5 * S + Math.cos(a) * t * 12 * S, 8.8 * S + Math.sin(k * 2.1) * t * 8 * S + 4 * S * t - 10 * S * t * t, 6 * S + Math.sin(a) * t * 12 * S);
      b.material.opacity = 1 - u * 2;
    });
    bar.material.color.setHex(u < 0.15 ? 0xffe8c0 : 0xffa040);
    heat.material.opacity = 0.55 + 0.35 * Math.max(0, 1 - u * 4);
  });
  g.position.set(at.x, 0, at.z);
  // Facing the road, his anvil toward it.
  g.rotation.y = Math.atan2(road.x - at.x, road.z - at.z);
  return g;
}

/** A Möbius strip's surface: round at `r`, `w` wide either side, a half twist as it goes round. */
function mobiusGeometry(r: number, w: number, segments = 160, across = 6): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i <= segments; i++) {
    const u = (i / segments) * Math.PI * 2;
    for (let j = 0; j <= across; j++) {
      const v = (j / across - 0.5) * 2 * w;
      const rr = r + v * Math.cos(u / 2);
      pos.push(rr * Math.cos(u), v * Math.sin(u / 2), rr * Math.sin(u));
      // One edge hot, the other cold: round the twist they trade places, for they're the one edge.
      c.copy(STRIP_HOT).lerp(STRIP_COLD, 0.5 - 0.5 * Math.cos(u / 2) * (v / w));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < across; j++) {
      const a = i * (across + 1) + j;
      const b = a + across + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** The strip's edge at `t` (0 to 4π: it takes twice round to come back). */
function mobiusEdge(r: number, w: number, t: number): THREE.Vector3 {
  const rr = r + w * Math.cos(t / 2);
  return new THREE.Vector3(rr * Math.cos(t), w * Math.sin(t / 2), rr * Math.sin(t));
}

/**
 * The Möbius strip, turning slowly over the forge in the middle of the
 * lap, whose edge the lap is: a band of the metal glowing from forge orange
 * to the cold blue of the stars, its one edge a bright line, and a spark
 * running along it, twice round before it's back where it started.
 */
export function mobiusStrip(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const R = 22;
  const Wd = 8;
  const band = new THREE.Mesh(mobiusGeometry(R, Wd), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const edgePts = Array.from({ length: 241 }, (_, k) => mobiusEdge(R, Wd, (k / 240) * Math.PI * 4));
  const edge = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edgePts, true), 480, 0.35, 6, true), new THREE.MeshBasicMaterial({ color: 0xffe0b0 }));
  const strip = new THREE.Group();
  strip.add(band, edge);
  const spark = glow(0xffffff, 5);
  const trail = glow(0xff9a40, 9, 0.6);
  strip.add(spark, trail);
  strip.rotation.x = 0.5;
  strip.position.y = 30;
  g.add(strip);
  const under = glow(0xff7a2a, 60, 0.35);
  under.position.y = 18;
  g.add(under);
  animated.push((time) => {
    strip.rotation.y = time * 0.15;
    const t = (time * 0.5) % (Math.PI * 4);
    spark.position.copy(mobiusEdge(R, Wd, t));
    trail.position.copy(mobiusEdge(R, Wd, t - 0.15));
    strip.position.y = 30 + Math.sin(time * 0.4) * 1.5;
  });
  g.position.set(at.x, 0, at.z);
  return g;
}

/**
 * The astral blacksmith's hammer, the hazard's look: its head, iron, its
 * face glowing from the last stroke, the haft reaching up out of the sky
 * from the hand that swings it; its shadow on the road where it'll come
 * down; where it strikes, the road white-hot; and a shower of sparks. Sits
 * at the hazard's pose, facing along the road.
 */
export function hammerParts(obj: THREE.Object3D): THREE.Object3D[] {
  const R = HAMMER_FACE;
  const steel = new THREE.MeshPhongMaterial({ color: 0x5a5e72, emissive: 0x14141e, shininess: 80, specular: 0xc0c0e0, flatShading: true });
  const head = new THREE.Group();
  const block = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 4.4, 8), steel);
  block.position.y = 2.2;
  const cheek = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.06, R * 1.06, 0.6, 8), steel);
  cheek.position.y = 3.6;
  // A band round its foot, red-hot from the strikes.
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.02, R * 1.02, 0.9, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
  band.position.y = 0.5;
  const face = new THREE.Mesh(new THREE.CircleGeometry(R * 0.98, 8), new THREE.MeshBasicMaterial({ color: 0xff7a2a }));
  face.rotation.x = Math.PI / 2;
  face.position.y = 0.02;
  // The haft, out of the head's top and up into the sky to the hand that swings it.
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 34, 8), lambert(0x3a2418));
  haft.position.set(0, 4 + 16, 0);
  const pivot = new THREE.Group();
  pivot.add(haft);
  pivot.rotation.z = 0.5;
  pivot.position.y = 3.6;
  head.add(block, cheek, face, pivot, band);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(R * 1.15, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  shadow.rotation.x = -Math.PI / 2;
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(R * 1.3, 24), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  scorch.rotation.x = -Math.PI / 2;
  const sparks = new THREE.Group();
  for (let k = 0; k < 48; k++) sparks.add(glow(k % 3 ? 0xffb050 : 0xfff0c0, k % 4 ? 1.3 : 2));
  const flash = glow(0xffd090, HAMMER_SPARKS * 2.6);
  const parts = [head, shadow, scorch, sparks, flash];
  obj.add(...parts);
  return parts;
}

/** Poses the hammer (from hammerParts) at stage `p.phase`: raised, coming down, struck and resting, lifting away, the sparks flying. */
export function poseHammer(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void {
  const [head, shadow, scorch, sparks, flash] = parts;
  const H = HAMMER_STAGES;
  const u = p.phase;
  const lift = p.y - p.ground;
  obj.rotation.y = p.heading;
  // The haft leans off toward the road's edge it's swung from.
  head.scale.x = p.side;
  head.rotation.z = lift > 0.1 ? Math.sin(elapsed * 1.3) * 0.03 : 0;
  // The face cools from the last stroke as it hangs, and is struck hot again.
  const face = (head.children[2] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material;
  const since = u >= H.land ? u - H.land : u + 1 - H.land;
  face.color.setHex(since < 0.2 ? 0xffd8a0 : since < 0.45 ? 0xff7a2a : 0x6a2210);
  // Its shadow where it'll come down, darker and tighter the nearer it gets.
  const near = 1 - Math.min(1, lift / HAMMER_HANG);
  shadow.position.y = -lift + 0.08;
  shadow.scale.setScalar(1.7 - near * 0.7);
  (shadow as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.15 + near * 0.55;
  shadow.visible = lift > 0.05;
  // The road white-hot where it struck, cooling.
  const struck = u >= H.land && u < H.sparks + 0.1;
  scorch.visible = struck;
  scorch.position.y = -lift + 0.1;
  (scorch as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = struck ? Math.max(0, 1 - (u - H.land) / (H.sparks + 0.1 - H.land)) : 0;
  // The flash of the strike.
  flash.visible = u >= H.land && u < H.land + 0.05;
  flash.position.y = -lift + 1.5;
  // The sparks: flung out from the strike all round, arcing up and falling, out as far as they reach.
  sparks.visible = p.gap > 0;
  if (sparks.visible) {
    const w = (u - H.land) / (H.sparks - H.land);
    const t = w * (H.sparks - H.land) * HAMMER_PERIOD;
    sparks.position.y = -lift;
    sparks.children.forEach((sp, k) => {
      const a = k * 2.399 + (k % 5) * 0.31;
      const reach = HAMMER_SPARKS * (0.45 + 0.55 * ((k * 37) % 11) / 10);
      const out = reach * Math.sqrt(w);
      const vy = 6 + (k % 7);
      sp.position.set(Math.cos(a) * out, Math.max(0.2, 0.5 + vy * t - 14 * t * t), Math.sin(a) * out);
      (sp as THREE.Sprite).material.opacity = 1 - w * 0.8;
    });
  }
}
