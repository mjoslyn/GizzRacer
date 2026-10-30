import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { PILL_STAGES, pillAcross, type HazardPose } from '../items/hazards';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import * as tex from './textures';

/**
 * The world of Head On/Pill (the Float Along – Fill Your Lungs Cup's
 * first): a mind coming apart in a sixties room. Its paisley road and dyed
 * ground, the flocked wallpaper of its walls, the room's things grown far
 * too big for it (lava lamps, a sitar, records, incense, pills, eyes that
 * aren't in anyone, pond scum), and its landmarks: the sitar's neck arching
 * over the road, the black cup steaming in the infield, the narrator's legs
 * lying across the land, and the giant capsule the Wrong Pill runs through.
 * The pills tumbling across the road are drawn here too.
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type Animated = ((time: number) => void)[];
type RGB = [number, number, number];

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const additive = (map: THREE.Texture, color: number) => new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false });
const glowing = (color: number, intensity = 0.8) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: intensity });
const glossy = (color: number, shininess = 90) => new THREE.MeshPhongMaterial({ color, shininess, specular: 0xffffff });

/** Made once and shared: the textures go on hundreds of meshes. */
function once<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
}
const glowTex = once(() => tex.glowTexture());

/** The trip's colours: dye orange, hot pink, violet, teal, gold, and the plum they swim in. */
const DYE: RGB[] = [
  [255, 120, 30],
  [240, 50, 140],
  [140, 60, 220],
  [30, 190, 180],
  [255, 200, 60],
];
const PLUM: RGB = [46, 14, 58];
const css = ([r, g, b]: RGB, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // Clamped to what the renderer can do.
  t.anisotropy = 16;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Draws `draw` at (x, y) and again wherever it would cross the tile's edge, so the tile wraps. */
function wrapped(size: number, x: number, y: number, reach: number, draw: (x: number, y: number) => void): void {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      const px = x + ox;
      const py = y + oy;
      if (px > -reach && px < size + reach && py > -reach && py < size + reach) draw(px, py);
    }
  }
}

/** A boteh, paisley's teardrop with its tip curled over, `r` the round of it, turned `a`: outlined, filled in rings, dotted round. */
function boteh(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, colours: RGB[], ink: string): void {
  const drop = (k: number) => {
    const q = r * k;
    ctx.beginPath();
    ctx.moveTo(0, q);
    ctx.bezierCurveTo(-1.45 * q, q, -1.35 * q, -1.05 * q, -0.15 * q, -1.3 * q);
    ctx.bezierCurveTo(0.55 * q, -1.45 * q, 0.95 * q, -1.85 * q, 0.7 * q, -2.35 * q);
    ctx.bezierCurveTo(1.55 * q, -1.75 * q, 1.45 * q, -0.25 * q, 1.0 * q, 0.35 * q);
    ctx.bezierCurveTo(0.75 * q, 0.8 * q, 0.4 * q, q, 0, q);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.lineJoin = 'round';
  // Rings, outside in, each outlined dark.
  [1, 0.72, 0.46].forEach((k, i) => {
    drop(k);
    ctx.fillStyle = css(colours[i % colours.length]);
    ctx.fill();
    ctx.lineWidth = r * 0.09;
    ctx.strokeStyle = ink;
    ctx.stroke();
  });
  // An eye in the round of it.
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = css(colours[3 % colours.length]);
  ctx.fill();
  ctx.stroke();
  // Dots round the outside.
  ctx.fillStyle = css(colours[0]);
  for (let k = 0; k < 14; k++) {
    const t = (k / 14) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(t) * r * 1.32, Math.sin(t) * r * 1.2 - r * 0.15, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Head On/Pill's road: paisley, teardrops curling in rows on dark plum, the dye bleeding. */
export function paisleyRoadTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * Math.PI * 2;
      const v = (y / S) * Math.PI * 2;
      // Dye bleeding through the cloth: slow swirls of violet in the plum.
      const w = 0.5 + 0.25 * Math.sin(u * 2 + Math.sin(v * 3) * 1.5) + 0.25 * Math.sin(v * 2 + Math.cos(u * 3) * 1.2);
      const col = mixRGB(PLUM, [96, 30, 104], w);
      const i = (y * S + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const rand = seededRandom(4201);
  const ink = 'rgba(20,6,26,0.9)';
  // Three rows of three, each row facing the other way, the colours turning round.
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = ((col + (row % 2) * 0.5) / 3) * S + S / 6;
      const y = (row / 3) * S + S / 6;
      const k = row * 3 + col;
      const colours = [DYE[k % 5], DYE[(k + 2) % 5], DYE[(k + 4) % 5], DYE[(k + 1) % 5]];
      const a = (row % 2 ? Math.PI : 0) + (rand() - 0.5) * 0.5;
      wrapped(S, x, y, 90, (px, py) => boteh(ctx, px, py, 26, a, colours, ink));
    }
  }
  // Little flowers and dots in between.
  for (let k = 0; k < 40; k++) {
    const x = rand() * S;
    const y = rand() * S;
    const col = DYE[k % 5];
    wrapped(S, x, y, 12, (px, py) => {
      for (let p = 0; p < 5; p++) {
        const t = (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(px + Math.cos(t) * 5, py + Math.sin(t) * 5, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = css(col, 0.9);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(px, py, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = css(DYE[4]);
      ctx.fill();
    });
  }
  // Worn: darker where the karts run.
  const g = ctx.createLinearGradient(0, 0, S, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.25)');
  g.addColorStop(0.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return finish(c);
}

/** The ground: liquid light, dye swirling in oil as it does on a light show's projector, in the trip's colours. */
export function dyeGroundTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, ctx] = canvas(S);
  const img = ctx.createImageData(S, S);
  const palette: RGB[] = [
    [70, 16, 70],
    [150, 34, 110],
    [210, 90, 50],
    [40, 110, 120],
    [90, 40, 150],
  ];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * Math.PI * 2;
      const v = (y / S) * Math.PI * 2;
      // Warped twice over, so the bands swirl like oil.
      const wu = u + 0.9 * Math.sin(v * 2 + 0.6 * Math.sin(u * 3));
      const wv = v + 0.9 * Math.sin(u * 2 + 0.6 * Math.cos(v * 2));
      const f = 0.5 + 0.3 * Math.sin(wu * 2 + wv) + 0.2 * Math.sin(wv * 3 - wu);
      const band = (((f * 3.2) % 1) + 1) % 1;
      const k = Math.floor(f * 3.2 * 1.0) % palette.length;
      const col = mixRGB(palette[(k + palette.length) % palette.length], palette[(k + 1 + palette.length) % palette.length], band * band * (3 - 2 * band));
      // A dark seam between the bands.
      const seam = Math.min(1, Math.abs(band - 0.5) * 9);
      const shade = 0.45 + 0.4 * seam;
      const i = (y * S + x) * 4;
      img.data[i] = col[0] * shade;
      img.data[i + 1] = col[1] * shade;
      img.data[i + 2] = col[2] * shade;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c);
}

/** The walls: sixties flocked wallpaper, mustard and orange stripes, a column of circles down each, gone brown at the skirting. */
export function wallpaperTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S);
  const stripes: RGB[] = [
    [196, 120, 30],
    [120, 50, 30],
    [214, 160, 50],
    [90, 30, 60],
  ];
  const w = S / 4;
  stripes.forEach((col, k) => {
    ctx.fillStyle = css(col);
    ctx.fillRect(k * w, 0, w, S);
  });
  for (let k = 0; k < 4; k++) {
    for (let j = 0; j < 4; j++) {
      const x = k * w + w / 2;
      const y = j * w + w / 2 + (k % 2) * (w / 2);
      wrapped(S, x, y, w, (px, py) => {
        for (const [r, col] of [
          [w * 0.42, stripes[(k + 2) % 4]],
          [w * 0.3, [250, 230, 190] as RGB],
          [w * 0.17, stripes[(k + 1) % 4]],
        ] as [number, RGB][]) {
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fillStyle = css(col);
          ctx.fill();
        }
      });
    }
  }
  // Flocked: a fine velvet grain over it all.
  const rand = seededRandom(4202);
  for (let k = 0; k < 2400; k++) {
    ctx.fillStyle = `rgba(${rand() > 0.5 ? '255,240,200' : '30,10,20'},${0.05 + rand() * 0.08})`;
    ctx.fillRect(rand() * S, rand() * S, 1.5, 1.5);
  }
  return finish(c);
}

const wallTex = once(wallpaperTexture);

/** A capsule `len` long (its ends' rounds included) and `r` round, along x, its two halves in their own materials. */
function capsule(len: number, r: number, a: THREE.Material, b: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const half = len / 2 - r;
  for (const [side, mat] of [
    [-1, a],
    [1, b],
  ] as [number, THREE.Material][]) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, half, 20, 1, true), mat);
    body.rotation.z = Math.PI / 2;
    body.position.x = (side * half) / 2;
    const end = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    end.rotation.z = -side * (Math.PI / 2);
    end.position.x = side * half;
    g.add(body, end);
  }
  // The seam where the halves join.
  const seam = new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, r * 0.05, 6, 24), lambert(0xf0e8d8));
  seam.rotation.y = Math.PI / 2;
  g.add(seam);
  return g;
}

/** The right pill's colours (white and gold) and the wrong one's (black and blood red). */
export const RIGHT_PILL: [number, number] = [0xfff6e0, 0xffb020];
export const WRONG_PILL: [number, number] = [0x18101e, 0xd01830];

/** One of the capsules that tumble across the road (hazard `pills`): its own materials, so each shows whether it's the right pill or the wrong one. */
export function pillFigure(radius: number): THREE.Group {
  const g = new THREE.Group();
  const a = new THREE.MeshPhongMaterial({ color: RIGHT_PILL[0], shininess: 120, specular: 0xffffff, emissive: 0x000000 });
  const b = new THREE.MeshPhongMaterial({ color: RIGHT_PILL[1], shininess: 120, specular: 0xffffff, emissive: 0x000000 });
  const tumbler = capsule(radius * 2.2, radius * 0.55, a, b);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffd060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  aura.scale.setScalar(radius * 3.4);
  g.add(tumbler, aura);
  return g;
}

/** Tumbles a pill figure end over end across the road as its pose crosses, in the colours of the right pill or the wrong one. */
export function posePill(fig: THREE.Object3D, p: HazardPose, elapsed: number): void {
  const [tumbler, aura] = fig.children as [THREE.Group, THREE.Sprite];
  fig.visible = p.phase < PILL_STAGES.across;
  fig.rotation.y = p.heading;
  const right = p.lane === 1;
  const [ca, cb] = right ? RIGHT_PILL : WRONG_PILL;
  const halves = tumbler.children.filter((m) => m instanceof THREE.Mesh) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial>[];
  halves[0].material.color.setHex(ca);
  halves[2].material.color.setHex(cb);
  // The right one glows; the wrong one smoulders.
  halves[0].material.emissive.setHex(right ? 0x806030 : 0x000000);
  halves[2].material.emissive.setHex(right ? 0x804000 : 0x300008);
  aura.material.color.setHex(right ? 0xffd060 : 0x8a0820);
  aura.material.opacity = right ? 0.75 + 0.25 * Math.sin(elapsed * 9) : 0.45;
  // End over end the way it's going: two turns crossing the road.
  const r = p.radius * 0.55;
  const half = p.radius * 1.1 - r;
  const turn = pillAcross(Math.min(p.phase, PILL_STAGES.across)) * Math.PI * 2 * p.side;
  tumbler.rotation.z = turn;
  // Resting on whatever end or side is down, and a hop as it goes over.
  tumbler.position.y = r + half * Math.abs(Math.sin(turn)) - (p.y - p.ground);
  aura.position.y = tumbler.position.y;
}

function pick(rand: () => number, kinds: [number, Feature][]): Feature {
  const total = kinds.reduce((s, [w]) => s + w, 0);
  let r = rand() * total;
  for (const [w, f] of kinds) if ((r -= w) <= 0) return f;
  return kinds[kinds.length - 1][1];
}

function place(t: THREE.Object3D, x: number, z: number, rand: () => number): THREE.Object3D {
  t.position.set(x, 0, z);
  t.rotation.y = rand() * Math.PI * 2;
  return t;
}

function frameAt(ribbon: Ribbon, s: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x, z: p.z, y: ribbon.heightAt(s), heading: Math.atan2(p.tx, p.tz) };
}

/** Where a landmark `lateral` metres off the road at `s` stands. */
function offRoad(ribbon: Ribbon, s: number, lateral: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x - p.tz * lateral, z: p.z + p.tx * lateral, heading: Math.atan2(p.tx, p.tz) };
}

/** An eye out of its head: white, an iris of the trip's colours, a black pupil, looking about. Faces +z, `r` round. */
function eyeball(r: number, iris: number): { group: THREE.Group; look: THREE.Group } {
  const group = new THREE.Group();
  const look = new THREE.Group();
  const white = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), glossy(0xfaf4ee, 60));
  const ring = new THREE.Mesh(new THREE.SphereGeometry(r * 1.002, 24, 8, 0, Math.PI * 2, 0, 0.55), glowing(iris, 0.5));
  ring.rotation.x = Math.PI / 2;
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 1.004, 20, 6, 0, Math.PI * 2, 0, 0.26), lambert(0x080408));
  pupil.rotation.x = Math.PI / 2;
  look.add(white, ring, pupil);
  // Red veins down its back.
  const vein = lambert(0xc02030);
  for (let k = 0; k < 5; k++) {
    const v = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, r * 0.02, 4, 16, 0.9), vein);
    v.rotation.set(Math.PI / 2 + 0.3, (k / 5) * Math.PI * 2, 0);
    v.position.z = -r * 0.1;
    look.add(v);
  }
  group.add(look);
  return { group, look };
}

/** A sitar: the gourd, the long neck with its frets and strings, the pegs, a second gourd at the top. Lies along +y from the origin, `len` long. */
function sitarFigure(len: number, wood: THREE.Material, gourdMat: THREE.Material, fret: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const k = len / 20;
  const gourd = new THREE.Mesh(new THREE.SphereGeometry(3.2 * k, 20, 14), gourdMat);
  gourd.scale.set(1, 0.85, 0.75);
  const face = new THREE.Mesh(new THREE.CircleGeometry(2.6 * k, 20), wood);
  face.position.z = 2.3 * k;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(1.1 * k, 15 * k, 0.8 * k), wood);
  neck.position.y = 9.5 * k;
  const top = new THREE.Mesh(new THREE.SphereGeometry(1.5 * k, 14, 10), gourdMat);
  top.position.set(0, 13.5 * k, -1.2 * k);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.0 * k, 3.4 * k, 0.9 * k), wood);
  head.position.y = 18.4 * k;
  g.add(gourd, face, neck, top, head);
  // Curved frets down the neck, and the pegs out of the head and the side of the neck.
  for (let f = 0; f < 18; f++) {
    const fr = new THREE.Mesh(new THREE.TorusGeometry(0.6 * k, 0.06 * k, 4, 10, Math.PI), fret);
    fr.position.set(0, 3.5 * k + f * 0.7 * k, 0.45 * k);
    fr.rotation.x = Math.PI / 2;
    g.add(fr);
  }
  for (let p = 0; p < 7; p++) {
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * k, 0.2 * k, 1.6 * k, 6), fret);
    peg.rotation.z = Math.PI / 2;
    peg.position.set((p % 2 ? 1 : -1) * 0.9 * k, 17.2 * k + p * 0.4 * k, 0);
    g.add(peg);
  }
  const strings = lambert(0xfff0c0, { emissive: 0xffe0a0, emissiveIntensity: 0.6 });
  for (let s = 0; s < 4; s++) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * k, 0.03 * k, 16 * k, 4), strings);
    st.position.set((s - 1.5) * 0.25 * k, 9.5 * k, 0.6 * k);
    g.add(st);
  }
  return g;
}

/** Head On/Pill: lava lamps, eyes that aren't in anyone, pills, a sitar fallen over, records, incense and pond scum, all far too big. */
export function headtripFeature(animated: Animated): Feature {
  const glow = glowTex();
  const brass = glossy(0xd8a040, 80);
  const wood = lambert(0x7a3a1a);
  const gourd = glossy(0x9a5a20, 50);
  const fret = glossy(0xe8d090, 120);
  const vinyl = glossy(0x0a0810, 140);
  const scum = glowing(0x60e040, 0.5);
  const lamp: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 8 + rand() * 8;
    const colour = [0xff5a20, 0xff3aa0, 0x40e0c0, 0xb050ff][Math.floor(rand() * 4)];
    const base = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.12, h * 0.2, h * 0.3, 16), brass);
    base.position.y = h * 0.15;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.08, h * 0.15, h * 0.6, 16, 1, true), new THREE.MeshLambertMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.35, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    glass.position.y = h * 0.6;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.05, h * 0.08, h * 0.12, 16), brass);
    cap.position.y = h * 0.96;
    t.add(base, glass, cap);
    // Wax blobs rising and sinking, swelling as they go.
    const wax = glowing(colour, 1);
    const blobs: THREE.Mesh[] = [];
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(h * 0.06, 10, 8), wax);
      t.add(b);
      blobs.push(b);
    }
    const halo = new THREE.Sprite(additive(glow, colour));
    halo.scale.set(h * 0.8, h * 1.0, 1);
    halo.position.y = h * 0.6;
    t.add(halo);
    const ph = rand() * 10;
    animated.push((time) =>
      blobs.forEach((b, k) => {
        const u = 0.5 + 0.5 * Math.sin(time * 0.4 + ph + k * 2.1);
        b.position.y = h * (0.35 + 0.5 * u);
        b.scale.set(1 + 0.4 * Math.sin(time + k), 1.3 - 0.3 * u, 1);
      }),
    );
    return place(t, x, z, rand);
  };
  const eye: Feature = (x, z, rand) => {
    const r = 1.6 + rand() * 2.6;
    const e = eyeball(r, [0x30a0ff, 0x30c060, 0xa060ff, 0xff8a20][Math.floor(rand() * 4)]);
    e.group.position.y = r * 0.8;
    const t = new THREE.Group();
    t.add(e.group);
    const ph = rand() * 10;
    // Looking about, every which way: they can't see.
    animated.push((time) => {
      e.look.rotation.y = Math.sin(time * 0.7 + ph) * 1.2;
      e.look.rotation.x = Math.sin(time * 0.5 + ph * 2) * 0.4;
    });
    return place(t, x, z, rand);
  };
  const pills: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const right = rand() > 0.5;
      const len = 3 + rand() * 4;
      const p = capsule(len, len * 0.24, glossy(right ? RIGHT_PILL[0] : WRONG_PILL[0], 120), glossy(right ? RIGHT_PILL[1] : WRONG_PILL[1], 120));
      if (rand() > 0.6) {
        // Stood on end.
        p.rotation.z = Math.PI / 2;
        p.position.set(k * len * 0.6, len / 2, 0);
      } else {
        p.position.set(k * len * 0.6, len * 0.24, (rand() - 0.5) * len);
        p.rotation.y = rand() * Math.PI;
      }
      t.add(p);
    }
    return place(t, x, z, rand);
  };
  const sitar: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const s = sitarFigure(16 + rand() * 12, wood, gourd, fret);
    // Leaning back against nothing, or fallen over.
    s.rotation.x = rand() > 0.5 ? -0.35 : -Math.PI / 2 + 0.15;
    s.position.y = 2;
    t.add(s);
    return place(t, x, z, rand);
  };
  const record: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 5 + rand() * 5;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 40), vinyl);
    disc.rotation.x = Math.PI / 2;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.32, r * 0.32, 0.34, 24), glowing([0xff5a20, 0xff3aa0, 0xffc030][Math.floor(rand() * 3)], 0.4));
    label.rotation.x = Math.PI / 2;
    const spin = new THREE.Group();
    spin.add(disc, label);
    // Grooves catching the light.
    for (let k = 1; k < 5; k++) {
      const groove = new THREE.Mesh(new THREE.TorusGeometry(r * (0.38 + k * 0.14), 0.03, 3, 40), lambert(0x30283a));
      groove.position.z = 0.16;
      spin.add(groove);
    }
    spin.position.y = r;
    t.add(spin);
    const ph = rand() * 10;
    animated.push((time) => (spin.rotation.z = time * 0.6 + ph));
    return place(t, x, z, rand);
  };
  const incense: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 6 + rand() * 6;
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.8, 12), brass);
    holder.position.y = 0.4;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, h, 5), lambert(0x6a2a1a));
    stick.position.y = h / 2;
    stick.rotation.z = 0.15;
    const ember = new THREE.Sprite(additive(glow, 0xff6a20));
    ember.scale.setScalar(1.2);
    ember.position.set(-0.15 * h * 0.5, h, 0);
    t.add(holder, stick, ember);
    const puffs: THREE.Sprite[] = [];
    for (let k = 0; k < 4; k++) {
      const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xd8c8f0, transparent: true, depthWrite: false }));
      t.add(p);
      puffs.push(p);
    }
    const ph = rand() * 10;
    animated.push((time) =>
      puffs.forEach((p, k) => {
        const u = (time * 0.18 + ph + k / puffs.length) % 1;
        p.position.set(Math.sin(u * 9 + k) * u * 3, h + u * 12, Math.cos(u * 7) * u * 2);
        p.scale.setScalar(1 + u * 5);
        p.material.opacity = 0.4 * (1 - u);
      }),
    );
    return place(t, x, z, rand);
  };
  // It kept growing like pond scum.
  const pond: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 4 + rand() * 6;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 20), scum);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.06;
    t.add(pool);
    const bubbles: THREE.Mesh[] = [];
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.4 + rand() * 0.5, 8, 6), glowing(0x90ff60, 0.8));
      b.position.set((rand() - 0.5) * r, 0, (rand() - 0.5) * r);
      t.add(b);
      bubbles.push(b);
    }
    const ph = rand() * 10;
    animated.push((time) => bubbles.forEach((b, k) => (b.position.y = 0.2 + 0.3 * Math.abs(Math.sin(time * 1.3 + ph + k)))));
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [5, lamp],
      [3, eye],
      [4, pills],
      [2, sitar],
      [2, record],
      [2, incense],
      [2, pond],
    ])(x, z, rand);
}

/** The start: a sitar laid over the road, its gourd one side, its long neck arching over and its pegs down the other, the strings humming. */
export function sitarGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const wood = lambert(0x7a3a1a);
  const gourdMat = glossy(0x9a5a20, 50);
  const fret = glossy(0xe8d090, 120);
  // The neck, an arch from the gourd over the road to the pegs.
  const arch = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-hw - 4, 5, 0),
    new THREE.Vector3(-hw * 0.6, 13, 0),
    new THREE.Vector3(0, 15, 0),
    new THREE.Vector3(hw * 0.6, 13, 0),
    new THREE.Vector3(hw + 3, 6, 0),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(arch, 48, 1.3, 12, false), wood));
  const gourd = new THREE.Mesh(new THREE.SphereGeometry(5.2, 24, 16), gourdMat);
  gourd.scale.set(0.9, 1, 0.8);
  gourd.position.set(-hw - 6, 4.2, 0);
  const face = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24), wood);
  face.position.set(-hw - 6, 4.2, 4.2);
  const face2 = face.clone();
  face2.position.z = -4.2;
  face2.rotation.y = Math.PI;
  const top = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), gourdMat);
  top.position.set(hw * 0.35, 12.6, -1.2);
  g.add(gourd, face, face2, top);
  // The head and its pegs, standing on the far side.
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 6.5, 1.3), wood);
  head.position.set(hw + 3.6, 3.3, 0);
  g.add(head);
  for (let p = 0; p < 7; p++) {
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 2.6, 8), fret);
    peg.rotation.x = Math.PI / 2;
    peg.position.set(hw + 3.6, 1.2 + p * 0.85, (p % 2 ? 1 : -1) * 1.2);
    g.add(peg);
  }
  // Frets along the arch, and the strings over them, glowing as they're played.
  for (let k = 1; k < 18; k++) {
    const u = 0.1 + (k / 18) * 0.78;
    const p = arch.getPointAt(u);
    const tn = arch.getTangentAt(u);
    const fr = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.1, 4, 10, Math.PI), fret);
    fr.position.copy(p);
    fr.lookAt(p.clone().add(tn));
    g.add(fr);
  }
  const lift = (v: THREE.Vector3) => v.clone().add(new THREE.Vector3(0, -1.45, 0));
  const strings = new THREE.CatmullRomCurve3(arch.points.map(lift));
  const stringMat = lambert(0xfff0c0, { emissive: 0xffd080, emissiveIntensity: 0.8 });
  g.add(new THREE.Mesh(new THREE.TubeGeometry(strings, 48, 0.07, 4, false), stringMat));
  const pluck = new THREE.Sprite(additive(glowTex(), 0xffd080));
  pluck.scale.setScalar(4);
  g.add(pluck);
  animated.push((time) => {
    // A glow running up and down the strings, the drone.
    const u = 0.5 + 0.45 * Math.sin(time * 0.9);
    pluck.position.copy(strings.getPointAt(u));
    stringMat.emissiveIntensity = 0.6 + 0.3 * Math.sin(time * 22);
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The cup to his lips, in the infield: a black cup the size of a building on its saucer, the black enemy steaming in it. */
export function blackCup(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const black = glossy(0x0c0a10, 160);
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(38, 30, 3, 48), black);
  saucer.position.y = 1.5;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(37, 1.2, 8, 48), black);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 3;
  // The cup, a lathe of its profile: a foot, swelling out and up to the lip.
  const prof = [
    [0, 0],
    [12, 0],
    [14, 2],
    [17, 10],
    [21, 22],
    [23, 30],
    [22.4, 30.5],
    [20.6, 29],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const cup = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), black);
  cup.position.y = 3;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(9, 2.2, 12, 32, Math.PI * 1.3), black);
  handle.position.set(22, 18, 0);
  handle.rotation.z = -Math.PI * 0.65;
  // A band of paisley round its middle, and the black liquid inside, shining.
  const band = new THREE.Mesh(new THREE.CylinderGeometry(19.6, 17.8, 5, 48, 1, true), new THREE.MeshLambertMaterial({ map: wallTex() }));
  band.position.y = 3 + 15;
  const drink = new THREE.Mesh(new THREE.CircleGeometry(20.6, 40), new THREE.MeshPhongMaterial({ color: 0x050308, shininess: 200, specular: 0x9a60c0 }));
  drink.rotation.x = -Math.PI / 2;
  drink.position.y = 3 + 28;
  g.add(saucer, rim, cup, handle, band, drink);
  const puffs: THREE.Sprite[] = [];
  for (let k = 0; k < 8; k++) {
    const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xd8c0e8, transparent: true, depthWrite: false }));
    g.add(p);
    puffs.push(p);
  }
  animated.push((time) =>
    puffs.forEach((p, k) => {
      const u = (time * 0.12 + k / puffs.length) % 1;
      p.position.set(Math.sin(u * 6 + k * 2) * (6 + u * 10), 32 + u * 40, Math.cos(u * 5 + k) * (4 + u * 8));
      p.scale.setScalar(8 + u * 26);
      p.material.opacity = 0.5 * Math.sin(Math.PI * u);
    }),
  );
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.heading;
  return g;
}

/** A leg in flared paisley trousers, its knee up, a boot on its foot, lying from the hip at the origin along +z. `bend` lifts the knee. */
function legFigure(len: number, cloth: THREE.Material, boot: THREE.Material, skin: THREE.Material): { group: THREE.Group; tap: THREE.Group } {
  const group = new THREE.Group();
  const thigh = new THREE.Mesh(new THREE.CylinderGeometry(len * 0.11, len * 0.13, len * 0.5, 16), cloth);
  thigh.rotation.x = Math.PI / 2 - 0.55;
  thigh.position.set(0, len * 0.13, len * 0.21);
  const knee = new THREE.Mesh(new THREE.SphereGeometry(len * 0.115, 16, 12), cloth);
  knee.position.set(0, len * 0.27, len * 0.42);
  // The shin, down from the knee, flaring out to the boot.
  const shin = new THREE.Mesh(new THREE.CylinderGeometry(len * 0.17, len * 0.1, len * 0.46, 16), cloth);
  shin.rotation.x = 0.55;
  shin.position.set(0, len * 0.15, len * 0.53);
  const tap = new THREE.Group();
  tap.position.set(0, len * 0.03, len * 0.64);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(len * 0.15, len * 0.1, len * 0.3), boot);
  foot.position.set(0, len * 0.04, len * 0.1);
  const heel = new THREE.Mesh(new THREE.BoxGeometry(len * 0.14, len * 0.06, len * 0.08), boot);
  heel.position.set(0, -len * 0.01, -len * 0.02);
  tap.add(foot, heel);
  // Cut off at the hip: they aren't connected to anyone.
  const stump = new THREE.Mesh(new THREE.CircleGeometry(len * 0.13, 16), skin);
  stump.position.set(0, len * 0.04, 0);
  stump.rotation.x = Math.PI / 2 + 0.55;
  stump.rotateY(Math.PI);
  group.add(thigh, knee, shin, tap, stump);
  return { group, tap };
}

/** Across from his legs: a pair of legs the size of hills lying across the land, knees up, flares on, a foot tapping to the krautrock. */
export function lostLegs(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const cloth = new THREE.MeshLambertMaterial({ map: lostLegsCloth() });
  const boot = glossy(0x2a1810, 90);
  const skin = lambert(0xc84a5a);
  const left = legFigure(70, cloth, boot, skin);
  const right = legFigure(70, cloth, boot, skin);
  left.group.position.x = -10;
  right.group.position.x = 10;
  right.group.rotation.y = -0.12;
  left.group.rotation.y = 0.08;
  g.add(left.group, right.group);
  animated.push((time) => {
    // About 150 beats a minute, the Pill's motorik.
    right.tap.rotation.x = -0.25 * Math.max(0, Math.sin(time * 2.5 * Math.PI));
  });
  g.position.set(at.x, 0, at.z);
  // Lying across from the road, the feet toward it.
  g.rotation.y = at.heading - Math.PI / 2;
  return g;
}

const lostLegsCloth = once(() => {
  const t = paisleyRoadTexture();
  t.repeat.set(3, 3);
  return t;
});

/**
 * The Wrong Pill: the giant capsule the shortcut runs through, half black
 * and half blood red, open at its ends where the road goes in and out,
 * lit inside. `s` is where it begins along the shortcut; it ends as far
 * from the shortcut's other end.
 */
export function pillTube(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const len = ribbon.spline.length - 2 * s;
  const mid = frameAt(ribbon, s + len / 2);
  const r = 14;
  const hole = 10.5;
  const open = Math.asin(hole / r);
  const half = len / 2 - r * Math.cos(open);
  const halves: [THREE.Material, THREE.Material] = [
    new THREE.MeshPhongMaterial({ color: WRONG_PILL[0], shininess: 140, specular: 0xffffff, side: THREE.DoubleSide }),
    new THREE.MeshPhongMaterial({ color: WRONG_PILL[1], shininess: 140, specular: 0xffffff, side: THREE.DoubleSide }),
  ];
  for (const [k, side] of [-1, 1].entries()) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, half, 32, 1, true), halves[k]);
    body.rotation.x = Math.PI / 2;
    body.position.z = (side * half) / 2;
    // The rounded end, open where the road comes through.
    const end = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, open, Math.PI / 2 - open), halves[k]);
    end.rotation.x = side * (Math.PI / 2);
    end.position.z = side * half;
    g.add(body, end);
  }
  const seam = new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, 0.5, 8, 40), lambert(0xf0e8d8));
  g.add(seam);
  // Rings of light inside, chasing through toward the way out.
  const rings: THREE.Mesh[] = [];
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  for (let k = 0; k < 6; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.96, 0.25, 4, 40), ringMat);
    g.add(ring);
    rings.push(ring);
  }
  animated.push((time) =>
    rings.forEach((ring, k) => {
      const u = (time * 0.35 + k / rings.length) % 1;
      ring.position.z = -half + u * 2 * half;
    }),
  );
  g.position.set(mid.x, mid.y + 2.5, mid.z);
  g.rotation.y = mid.heading;
  return g;
}
