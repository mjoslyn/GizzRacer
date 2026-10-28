import * as THREE from 'three';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import * as tex from './textures';

/**
 * Scenery and landmarks for the 12 Bar Bruise Cup's worlds, after the
 * band's first album: the band room on a Saturday night, the Bended Elbow
 * lit up over it (Elbow); Anglesea's wetlands and golf course in the rain,
 * the power station's chimney over them (Muckraker); a seventies house
 * party in a backyard, all night (Cut Throat Boogie); and a sea of trees
 * grown over old lava at the foot of a snow-capped mountain (Sea of Trees).
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type Animated = ((time: number) => void)[];

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const additive = (map: THREE.Texture, color: number) => new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false });
const glowing = (color: number, intensity = 0.8) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: intensity, flatShading: true });
const glossy = (color: number, shininess = 90) => new THREE.MeshPhongMaterial({ color, shininess, specular: 0xffffff });

/** Made once and shared: the textures go on hundreds of meshes. */
function once<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
}
const glowTex = once(() => tex.glowTexture());
const posterTex = once(tex.posterWallTexture);
const speakerTex = once(tex.speakerWallTexture);
const lavaTex = once(tex.lavaRockTexture);

function seeded(seed: number): () => number {
  let k = seed;
  return () => (k = (k * 16807) % 2147483647) / 2147483647;
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

/** A sign over the road, facing the karts coming. */
function sign(g: THREE.Group, text: string, bg: string, fg: string, width: number, y: number): void {
  const map = tex.billboardTexture(text, bg, fg);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.25), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
  m.position.y = y;
  m.rotation.y = Math.PI;
  g.add(m);
}

/** Two posts either side of the road at `s`, `h` tall: a gate's frame. */
function posts(g: THREE.Group, hw: number, h: number, mat: THREE.Material, r = 0.7): void {
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, h, 10), mat);
    post.position.set(side * (hw + r), h / 2, 0);
    g.add(post);
  }
}

/**
 * An arm bent at the elbow: an upper arm up from the shoulder, a forearm
 * from the elbow and a fist. `bend(k)` sets the elbow, 0 straight and 1
 * bent right back. Stands on its shoulder at the origin; `len` is each half.
 */
export function armFigure(len: number, skin: THREE.Material, sleeve: THREE.Material): { group: THREE.Group; bend: (k: number) => void } {
  const g = new THREE.Group();
  const r = len * 0.16;
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 1.1, len, 14), sleeve);
  upper.position.y = len / 2;
  const elbow = new THREE.Group();
  elbow.position.y = len;
  const joint = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 14, 10), skin);
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.9, len, 14), skin);
  fore.position.y = len / 2;
  const fist = new THREE.Mesh(new THREE.SphereGeometry(r * 1.4, 14, 10), skin);
  fist.scale.set(1, 1.1, 0.9);
  fist.position.y = len + r * 0.8;
  elbow.add(joint, fore, fist);
  g.add(upper, elbow);
  const bend = (k: number) => (elbow.rotation.z = k * 2.6);
  bend(0.5);
  return { group: g, bend };
}

/** Elbow: amp stacks and kegs out the back of the band room, pub fronts lit up, street lamps, and punks pogoing. */
export function bandroomFeature(animated: Animated): Feature {
  const tolex = lambert(0x18161a);
  const grille = lambert(0x4a4038);
  const brass = glossy(0xd8a840, 60);
  const steel = glossy(0x9aa0a8, 120);
  const brick = new THREE.MeshLambertMaterial({ map: posterTex() });
  const neonPink = glowing(0xff4a8a, 1);
  const neonBlue = glowing(0x40c0ff, 1);
  const window = glowing(0xffd08a, 0.8);
  const glow = glowTex();
  const amps: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const stacks = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < stacks; k++) {
      for (let y = 0; y < 2; y++) {
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 1.2), tolex);
        cab.position.set(k * 2.5, 1.1 + y * 2.2, 0);
        const front = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.9), grille);
        front.position.set(k * 2.5, 1.1 + y * 2.2, 0.61);
        t.add(cab, front);
      }
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.1), tolex);
      head.position.set(k * 2.5, 4.85, 0);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.05), brass);
      plate.position.set(k * 2.5, 4.9, 0.57);
      t.add(head, plate);
    }
    return place(t, x, z, rand);
  };
  const kegs: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const keg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 14), steel);
      keg.position.set((k % 3) * 1.1, 0.6 + Math.floor(k / 3) * 1.2, 0);
      t.add(keg);
    }
    return place(t, x, z, rand);
  };
  const pub: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 14 + rand() * 10;
    const h = 7 + rand() * 6;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, 9), brick);
    body.position.y = h / 2;
    t.add(body);
    for (let k = 0; k < 3; k++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.2, h * 0.3), window);
      win.position.set(-w / 3 + (k * w) / 3, h * 0.35, 4.51);
      t.add(win);
    }
    // A neon sign in the window: pink and blue, flickering.
    const neon = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.35, 0.3), rand() > 0.5 ? neonPink : neonBlue);
    neon.position.set(0, h * 0.78, 4.6);
    t.add(neon);
    const halo = new THREE.Sprite(additive(glow, 0xff70b0));
    halo.scale.set(w * 0.8, 4, 1);
    halo.position.set(0, h * 0.78, 5);
    t.add(halo);
    const ph = rand() * 10;
    animated.push((time) => {
      const flicker = Math.sin(time * 37 + ph) > 0.93 ? 0.2 : 1;
      halo.material.opacity = 0.7 * flicker;
    });
    return place(t, x, z, rand);
  };
  const lamp: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 8, 8), tolex);
    pole.position.y = 4;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), window);
    bulb.position.y = 8.2;
    const halo = new THREE.Sprite(additive(glow, 0xffc080));
    halo.scale.setScalar(5);
    halo.position.y = 8.2;
    t.add(pole, bulb, halo);
    return place(t, x, z, rand);
  };
  // A punk pogoing to the EY EY EY: a body, a head with a mohawk, jumping on the beat.
  const shirts = [0x1a1a1a, 0xd02a2a, 0x2a2a8a, 0xe8e0d0];
  const hairs = [0xff2a8a, 0x40ff60, 0xffe14d, 0x40c0ff];
  const skin = lambert(0xe8b090);
  const punk: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.9, 4, 8), lambert(shirts[Math.floor(rand() * shirts.length)]));
    torso.position.y = 1.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), skin);
    head.position.y = 2.1;
    const hawk = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.6), lambert(hairs[Math.floor(rand() * hairs.length)]));
    hawk.position.y = 2.45;
    body.add(torso, head, hawk);
    t.add(body);
    const ph = rand();
    animated.push((time) => {
      // About 170 beats a minute, every punk on the beat, a few half a beat off.
      const u = (time * 2.8 + (ph > 0.7 ? 0.5 : 0)) % 1;
      body.position.y = 0.8 * Math.sin(Math.PI * u);
    });
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [4, amps],
      [3, kegs],
      [2, pub],
      [3, lamp],
      [5, punk],
    ])(x, z, rand);
}

/** Muckraker: reeds, rakes stuck in the mud, ants as big as dogs marching, golf flags and white-trunked gums. */
export function wetlandFeature(animated: Animated): Feature {
  const reedMat = lambert(0x8a8a4a, { flatShading: true });
  const headMat = lambert(0x5a3a1a);
  const wood = lambert(0x8a6a40);
  const tine = glossy(0x707878, 80);
  const ant = glossy(0x1a0e0a, 70);
  const pin = lambert(0xf0f0f0);
  const flagMat = lambert(0xe02a2a, { side: THREE.DoubleSide });
  const bark = lambert(0xe0dcd0);
  const leaves = lambert(0x5a7a4a, { flatShading: true });
  const reeds: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 6 + Math.floor(rand() * 8);
    for (let k = 0; k < n; k++) {
      const h = 1.5 + rand() * 2;
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, h, 4), reedMat);
      r.position.set((rand() - 0.5) * 2, h / 2, (rand() - 0.5) * 2);
      r.rotation.set((rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3);
      t.add(r);
      if (rand() > 0.5) {
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 6), headMat);
        top.position.set(r.position.x, h, r.position.z);
        t.add(top);
      }
    }
    return place(t, x, z, rand);
  };
  const rake: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), wood);
    handle.position.y = 1.6;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.12), tine);
    bar.position.y = 3.2;
    t.add(handle, bar);
    for (let k = 0; k < 8; k++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.05), tine);
      p.position.set(-0.65 + (k * 1.3) / 7, 3.4, 0);
      t.add(p);
    }
    t.rotation.z = (rand() - 0.5) * 0.4;
    const g = new THREE.Group();
    g.add(t);
    return place(g, x, z, rand);
  };
  const ants: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const trail = new THREE.Group();
    const n = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const a = new THREE.Group();
      for (const [dz, r] of [[0, 0.35], [0.6, 0.25], [1.1, 0.3]] as const) {
        const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), ant);
        seg.position.set(0, 0.45, dz);
        seg.scale.z = 1.3;
        a.add(seg);
      }
      for (let l = 0; l < 3; l++) {
        for (const side of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4), ant);
          leg.position.set(side * 0.35, 0.3, 0.35 + l * 0.25);
          leg.rotation.z = side * 1.0;
          a.add(leg);
        }
      }
      a.userData.k = k;
      trail.add(a);
    }
    t.add(trail);
    const R = 3 + rand() * 3;
    const ph = rand() * 6;
    animated.push((time) => {
      trail.children.forEach((a, k) => {
        const u = time * 0.25 + ph - k * 0.35;
        a.position.set(Math.cos(u) * R, Math.abs(Math.sin(time * 14 + k)) * 0.05, Math.sin(u) * R);
        a.rotation.y = -u;
      });
    });
    return place(t, x, z, rand);
  };
  const flag: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), pin);
    pole.position.y = 1.5;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), flagMat);
    cloth.position.set(0.5, 2.6, 0);
    t.add(pole, cloth);
    const ph = rand() * 10;
    animated.push((time) => (cloth.rotation.y = Math.sin(time * 3 + ph) * 0.4));
    return place(t, x, z, rand);
  };
  const gum: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 8 + rand() * 8;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, h, 7), bark);
    trunk.position.y = h / 2;
    trunk.rotation.z = (rand() - 0.5) * 0.25;
    t.add(trunk);
    for (let k = 0; k < 3; k++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8 + rand() * 1.5, 0), leaves);
      c.position.set((rand() - 0.5) * 3, h + (rand() - 0.3) * 2, (rand() - 0.5) * 3);
      c.scale.y = 0.6;
      t.add(c);
    }
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [6, reeds],
      [2, rake],
      [3, ants],
      [2, flag],
      [3, gum],
    ])(x, z, rand);
}

/** Cut Throat Boogie: lava lamps, mirror balls on poles, fairy lights strung between them, speaker cabinets and balloons. */
export function partyFeature(animated: Animated): Feature {
  const lampBase = glossy(0xc0c0c8, 120);
  const blobs = [0xff3a8a, 0xffa020, 0x40e0ff, 0xa040ff, 0x40ff90];
  const glass = new THREE.MeshPhongMaterial({ color: 0xff8040, transparent: true, opacity: 0.35, shininess: 120, specular: 0xffffff });
  const mirror = new THREE.MeshPhongMaterial({ color: 0xe0e0f0, shininess: 200, specular: 0xffffff, flatShading: true });
  const pole = lambert(0x2a1a10);
  const cab = new THREE.MeshLambertMaterial({ map: speakerTex() });
  const glow = glowTex();
  const lavaLamp: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const s = 1.5 + rand() * 1.5;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * s, 0.6 * s, 0.8 * s, 12), lampBase);
    base.position.y = 0.4 * s;
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.45 * s, 2.2 * s, 12), glass);
    bottle.position.y = 1.9 * s;
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 10, 8), glowing(blobs[Math.floor(rand() * blobs.length)], 1));
    t.add(base, bottle, blob);
    const ph = rand() * 10;
    animated.push((time) => {
      const u = 0.5 + 0.5 * Math.sin(time * 0.4 + ph);
      blob.position.y = (1 + u * 1.7) * s;
      blob.scale.y = 1 + 0.4 * Math.sin(time * 1.3 + ph);
    });
    return place(t, x, z, rand);
  };
  const disco: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 5 + rand() * 3;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, h, 6), pole);
    p.position.y = h / 2;
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), mirror);
    ball.position.y = h + 0.4;
    const halo = new THREE.Sprite(additive(glow, 0xffffff));
    halo.scale.setScalar(3);
    halo.position.y = h + 0.4;
    t.add(p, ball, halo);
    animated.push((time) => {
      ball.rotation.y = time * 1.5;
      halo.material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(time * 6));
    });
    return place(t, x, z, rand);
  };
  const fairy: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const span = 10 + rand() * 8;
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 6), pole);
      p.position.set((side * span) / 2, 2, 0);
      t.add(p);
    }
    const bulbs: THREE.Sprite[] = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      const b = new THREE.Sprite(additive(glow, [0xffd040, 0xff4a8a, 0x40e0ff, 0x40ff90][k % 4]));
      b.scale.setScalar(0.8);
      b.position.set((u - 0.5) * span, 4 - Math.sin(u * Math.PI) * 1.2, 0);
      t.add(b);
      bulbs.push(b);
    }
    const ph = rand() * 10;
    animated.push((time) => bulbs.forEach((b, k) => (b.material.opacity = 0.5 + 0.5 * Math.sin(time * 3 + k + ph))));
    return place(t, x, z, rand);
  };
  const speaker: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 2 + rand() * 2;
    const box = new THREE.Mesh(new THREE.BoxGeometry(h * 0.6, h, h * 0.5), cab);
    box.position.y = h / 2;
    t.add(box);
    const ph = rand() * 10;
    // Thumping on the boogie's shuffle.
    animated.push((time) => box.scale.setScalar(1 + 0.03 * Math.max(0, Math.sin(time * 15 + ph))));
    return place(t, x, z, rand);
  };
  const balloons: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const bunch = new THREE.Group();
    const n = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), glossy(blobs[(k + Math.floor(rand() * 5)) % blobs.length], 80));
      b.scale.y = 1.2;
      b.position.set((rand() - 0.5) * 1.4, 3.5 + rand() * 1.2, (rand() - 0.5) * 1.4);
      bunch.add(b);
    }
    t.add(bunch);
    const ph = rand() * 10;
    animated.push((time) => (bunch.position.y = Math.sin(time * 1.1 + ph) * 0.3));
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [3, lavaLamp],
      [2, disco],
      [3, fairy],
      [3, speaker],
      [2, balloons],
    ])(x, z, rand);
}

/** Sea of Trees: trees in their thousands, tall enough to drive on top of; mossy lava boulders, ferns, and roots. */
export function canopyFeature(animated: Animated): Feature {
  const trunkMat = lambert(0x5a4030);
  const greens = [0x2a5a2a, 0x3a7a34, 0x4a8a3a, 0x2a6a40, 0x5a9040].map((c) => lambert(c, { flatShading: true }));
  const rock = new THREE.MeshLambertMaterial({ map: lavaTex(), flatShading: true });
  const fern = lambert(0x4a9a3a, { side: THREE.DoubleSide, flatShading: true });
  const broadleaf: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 10 + rand() * 10;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, h, 7), trunkMat);
    trunk.position.y = h / 2;
    t.add(trunk);
    const crown = new THREE.Group();
    crown.position.y = h;
    for (let k = 0; k < 4; k++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + rand() * 2.5, 1), greens[Math.floor(rand() * greens.length)]);
      c.position.set((rand() - 0.5) * 4, (rand() - 0.2) * 2.5, (rand() - 0.5) * 4);
      crown.add(c);
    }
    t.add(crown);
    const ph = rand() * 10;
    // The canopy swaying like a swell.
    animated.push((time) => (crown.rotation.z = Math.sin(time * 0.6 + ph) * 0.04));
    return place(t, x, z, rand);
  };
  const conifer: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 12 + rand() * 10;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, h * 0.4, 6), trunkMat);
    trunk.position.y = h * 0.2;
    t.add(trunk);
    const mat = greens[Math.floor(rand() * greens.length)];
    for (let k = 0; k < 4; k++) {
      const r = 3.6 - k * 0.7;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h * 0.3, 8), mat);
      cone.position.y = h * (0.35 + k * 0.17);
      t.add(cone);
    }
    return place(t, x, z, rand);
  };
  const boulder: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 1.5 + rand() * 3;
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), rock);
    b.scale.y = 0.6 + rand() * 0.3;
    b.position.y = r * 0.3;
    t.add(b);
    return place(t, x, z, rand);
  };
  const ferns: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 5 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 2), fern);
      f.position.y = 0.8;
      f.rotation.set(-0.7, (k / n) * Math.PI * 2, 0);
      f.translateY(0.6);
      t.add(f);
    }
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [6, broadleaf],
      [4, conifer],
      [2, boulder],
      [3, ferns],
    ])(x, z, rand);
}

/** Elbow's gate: the Bended Elbow's sign over the road, lit up, a bent arm on top of it flexing. */
export function elbowGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  posts(g, hw, 12, lambert(0x1a1418));
  const bar = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 2.8, 1, 1), lambert(0x1a1418));
  bar.position.y = 12;
  g.add(bar);
  sign(g, 'THE BENDED ELBOW', '#1a0a1a', '#ff4a8a', hw * 1.4, 9.2);
  const arm = armFigure(4, lambert(0xe8b090), lambert(0x1a1a1a));
  arm.group.position.y = 12.5;
  arm.group.rotation.y = Math.PI / 2;
  g.add(arm.group);
  const halo = new THREE.Sprite(additive(glowTex(), 0xff4a8a));
  halo.scale.set(hw * 2, 6, 1);
  halo.position.y = 9.2;
  g.add(halo);
  animated.push((time) => {
    arm.bend(0.35 + 0.35 * Math.abs(Math.sin(time * 1.2)));
    halo.material.opacity = 0.5 + 0.2 * Math.sin(time * 9);
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The big shot: a giant arm off the road, bending its elbow right back and straightening it again. */
export function bentArm(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const arm = armFigure(26, lambert(0xe8b090), lambert(0x2a2a2a));
  // A studded leather sleeve: bands of studs round the upper arm.
  const stud = glossy(0xd0d0d8, 140);
  for (let k = 0; k < 3; k++) {
    for (let a = 0; a < 12; a++) {
      const st = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 6), stud);
      const ang = (a / 12) * Math.PI * 2;
      st.position.set(Math.cos(ang) * 4.4, 8 + k * 6, Math.sin(ang) * 4.4);
      // Pointing straight out of the sleeve.
      st.lookAt(st.position.x * 2, st.position.y, st.position.z * 2);
      st.rotateX(Math.PI / 2);
      arm.group.add(st);
    }
  }
  g.add(arm.group);
  animated.push((time) => arm.bend(0.25 + 0.6 * (0.5 + 0.5 * Math.sin(time * 0.5))));
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.heading;
  return g;
}

/** Muckraker's gate: two rakes for posts, a rake's head across the top, cobwebs hung off it. */
export function rakeGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const wood = lambert(0x8a6a40);
  const metal = glossy(0x707878, 80);
  posts(g, hw, 13, wood, 0.45);
  const head = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 2, 0.8, 0.8), metal);
  head.position.y = 13;
  g.add(head);
  const n = Math.round(hw * 1.2);
  for (let k = 0; k <= n; k++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), metal);
    t.position.set(-hw - 1 + ((hw * 2 + 2) * k) / n, 11.6, 0);
    g.add(t);
  }
  // Cobwebs: white threads strung between the tines, swaying.
  const web = new THREE.Group();
  const pts: number[] = [];
  const rand = seeded(1701);
  for (let k = 0; k < 24; k++) {
    const x0 = (rand() - 0.5) * hw * 2;
    pts.push(x0, 12.8, 0, x0 + (rand() - 0.5) * 3, 9 + rand() * 2, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  web.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.7 })));
  g.add(web);
  animated.push((time) => (web.rotation.x = Math.sin(time * 0.8) * 0.06));
  sign(g, 'MUCKRAKER', '#3a4a3a', '#f0f0d8', hw * 1.1, 7.4);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Anglesea's power station: a brick hall and its tall chimney, smoke drifting off it into the rain. */
export function powerStation(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const brick = lambert(0x8a5a40);
  const hall = new THREE.Mesh(new THREE.BoxGeometry(70, 26, 34), brick);
  hall.position.y = 13;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(72, 2, 36), lambert(0x4a4a4a));
  roof.position.y = 27;
  g.add(hall, roof);
  for (let k = 0; k < 8; k++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(4, 8), lambert(0x30383c));
    win.position.set(-31 + k * 8.8, 15, 17.05);
    g.add(win);
  }
  const H = 90;
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 5.5, H, 20), lambert(0xc8c0b0));
  stack.position.set(24, H / 2, -6);
  g.add(stack);
  for (let k = 0; k < 2; k++) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.6 + k * 0.1, 3.7 + k * 0.1, 4, 20), lambert(0xc03020));
    band.position.set(24, H - 6 - k * 10, -6);
    g.add(band);
  }
  const smoke: THREE.Sprite[] = [];
  const puff = glowTex();
  for (let k = 0; k < 8; k++) {
    const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: 0xb8bcc0, transparent: true, depthWrite: false }));
    g.add(p);
    smoke.push(p);
  }
  animated.push((time) => {
    smoke.forEach((p, k) => {
      const u = (time * 0.06 + k / smoke.length) % 1;
      p.position.set(24 + u * 40, H + u * 30, -6 + u * 10);
      p.scale.setScalar(8 + u * 30);
      p.material.opacity = 0.6 * (1 - u);
    });
  });
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.heading;
  return g;
}

/** Cut Throat Boogie's gate: a giant harmonica across the road on two speaker stacks, its holes glowing. */
export function harmonicaGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const cab = new THREE.MeshLambertMaterial({ map: speakerTex() });
  for (const side of [-1, 1]) {
    const stack = new THREE.Mesh(new THREE.BoxGeometry(3, 11, 2.4), cab);
    stack.position.set(side * (hw + 1.5), 5.5, 0);
    g.add(stack);
  }
  const W = hw * 2 + 6;
  const plate = glossy(0xd8d8e0, 160);
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, 2.6, 2.2), lambert(0x2a1a10));
  body.position.y = 12.3;
  const top = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.8, 2.4), plate);
  top.position.y = 13.7;
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.8, 2.4), plate);
  bottom.position.y = 10.9;
  g.add(body, top, bottom);
  // The ten holes, facing the karts, lighting up along it as if someone's playing.
  const holes: THREE.Mesh[] = [];
  for (let k = 0; k < 10; k++) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(W / 14, 1.2), new THREE.MeshBasicMaterial({ color: 0x1a0a0a }));
    h.position.set(W / 2 - (W * (k + 0.75)) / 10.5, 12.3, -1.12);
    h.rotation.y = Math.PI;
    g.add(h);
    holes.push(h);
  }
  animated.push((time) => {
    const lit = Math.floor((Math.sin(time * 1.7) * 0.5 + 0.5) * 9.99);
    holes.forEach((h, k) => (h.material as THREE.MeshBasicMaterial).color.setHex(Math.abs(k - lit) <= 1 ? 0xffd040 : 0x1a0a0a));
  });
  sign(g, 'CUT THROAT BOOGIE', '#2a1440', '#ffd040', hw * 1.2, 7);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A mirror ball the size of a house, hung off a crane over the party, turning, throwing spots of light. */
export function mirrorBall(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const steel = lambert(0xffc020);
  const mast = new THREE.Mesh(new THREE.BoxGeometry(3, 70, 3), steel);
  mast.position.y = 35;
  const jib = new THREE.Mesh(new THREE.BoxGeometry(40, 2.4, 2.4), steel);
  jib.position.set(18, 70, 0);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 14, 6), lambert(0x202020));
  cable.position.set(34, 63, 0);
  g.add(mast, jib, cable);
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(12, 3), new THREE.MeshPhongMaterial({ color: 0xe8e8f4, shininess: 250, specular: 0xffffff, flatShading: true }));
  ball.position.set(34, 44, 0);
  g.add(ball);
  const spots: THREE.Sprite[] = [];
  const glow = glowTex();
  const colours = [0xff3a8a, 0xffd040, 0x40e0ff, 0xa040ff, 0xffffff];
  for (let k = 0; k < 16; k++) {
    const sp = new THREE.Sprite(additive(glow, colours[k % colours.length]));
    sp.scale.setScalar(5);
    g.add(sp);
    spots.push(sp);
  }
  animated.push((time) => {
    ball.rotation.y = time * 0.4;
    spots.forEach((sp, k) => {
      const a = time * 0.4 + (k / spots.length) * Math.PI * 2;
      const r = 20 + (k % 3) * 8;
      sp.position.set(34 + Math.cos(a) * r, 44 + Math.sin(a * 1.7 + k) * 18, Math.sin(a) * r);
      sp.material.opacity = 0.5 + 0.5 * Math.sin(time * 5 + k);
    });
  });
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.heading + (lateral > 0 ? Math.PI / 2 : -Math.PI / 2);
  return g;
}

/** Sea of Trees' gate: two great mossy trunks either side of the road, a fallen one across their tops. */
export function trunkGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const bark = lambert(0x5a4030);
  const moss = lambert(0x4a8a3a, { flatShading: true });
  posts(g, hw + 1, 16, bark, 1.6);
  const log = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, hw * 2 + 8, 12), bark);
  log.rotation.z = Math.PI / 2;
  log.position.y = 16.5;
  g.add(log);
  const rand = seeded(1711);
  for (let k = 0; k < 10; k++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + rand(), 0), moss);
    m.position.set((rand() - 0.5) * hw * 2, 17.6, (rand() - 0.5) * 1.4);
    m.scale.y = 0.5;
    g.add(m);
  }
  const leaves = new THREE.Group();
  for (const side of [-1, 1]) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(6, 1), moss);
    crown.position.set(side * (hw + 3), 21, 0);
    leaves.add(crown);
  }
  g.add(leaves);
  animated.push((time) => (leaves.rotation.z = Math.sin(time * 0.5) * 0.02));
  sign(g, 'SEA OF TREES', '#1a3a24', '#f0fff0', hw * 1.1, 11);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The snow-capped mountain the sea of trees grows at the foot of, far off, its cap catching the light. */
export function snowPeak(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const H = 190;
  const R = 230;
  const body = new THREE.Mesh(new THREE.ConeGeometry(R, H, 40, 1, true), lambert(0x4a5a7a, { flatShading: true }));
  body.position.y = H / 2;
  // The cap: the top third, white, its edge ragged.
  const capH = H * 0.32;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(R * 0.32 + 1, capH, 40, 1, true), lambert(0xf4f8ff, { flatShading: true }));
  cap.position.y = H - capH / 2 + 0.5;
  g.add(body, cap);
  // A cloud drifting round the summit.
  const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
  cloud.scale.set(120, 30, 1);
  g.add(cloud);
  animated.push((time) => cloud.position.set(Math.cos(time * 0.03) * 90, H * 0.7, Math.sin(time * 0.03) * 90));
  g.position.set(at.x, -2, at.z);
  return g;
}
