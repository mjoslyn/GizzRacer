import * as THREE from 'three';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import * as tex from './textures';

/**
 * Scenery and landmarks for the Infest the Rats' Nest Cup's worlds: the
 * burning Earth with no planet B (Planet B), the rich's colony under glass
 * on Mars (Mars for the Rich), the ship falling at the sun (Perihelion) and
 * the pit down into Hell (Hell).
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type Animated = ((time: number) => void)[];

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const additive = (map: THREE.Texture, color: number) => new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false });
const glowing = (color: number, intensity = 0.7) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: intensity, flatShading: true });
const metal = (color: number, shininess = 80) => new THREE.MeshPhongMaterial({ color, shininess, specular: 0xffffff, flatShading: true });

/** Made once and shared: the fire and smoke textures go on hundreds of sprites. */
function once<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
}
const flameTex = once(tex.flameTexture);
const smokeTex = once(tex.dustTexture);
const glowTex = once(() => tex.glowTexture());

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

/** A sign over the road, facing the karts coming. */
function sign(g: THREE.Group, text: string, bg: string, fg: string, width: number, y: number): void {
  const map = tex.billboardTexture(text, bg, fg);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.25), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
  m.position.y = y;
  m.rotation.y = Math.PI;
  g.add(m);
}

/** Smoke rising off a point `h` up: a column of puffs that grow and fade, re-used round the cup. */
function smokeColumn(g: THREE.Object3D, h: number, color: number, animated: Animated, rand: () => number, size = 1, rate = 0.25): void {
  const smoke = smokeTex();
  const puffs: THREE.Sprite[] = [];
  for (let k = 0; k < 5; k++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, color, transparent: true, opacity: 0.6, depthWrite: false }));
    s.userData.k = k;
    g.add(s);
    puffs.push(s);
  }
  const ph = rand() * 6;
  animated.push((time) => {
    for (const s of puffs) {
      const k = s.userData.k as number;
      const u = ((time * rate + k * 0.2 + ph) % 1 + 1) % 1;
      s.position.set(Math.sin(time * 0.5 + k) * u * 3 * size, h + u * 14 * size, Math.cos(time * 0.4 + k) * u * 3 * size);
      s.scale.setScalar((2 + u * 8) * size);
      s.material.opacity = 0.6 * (1 - u);
    }
  });
}

/** Flames licking up from a point: a few additive sprites flickering. */
function fire(g: THREE.Object3D, y: number, size: number, animated: Animated, rand: () => number): THREE.Sprite[] {
  const flame = flameTex();
  const out: THREE.Sprite[] = [];
  for (let k = 0; k < 3; k++) {
    const f = new THREE.Sprite(additive(flame, k ? 0xff7a20 : 0xffc040));
    f.scale.set(size * (1 - k * 0.2), size * 1.6, 1);
    f.position.set((k - 1) * size * 0.25, y + size * 0.6, 0);
    f.userData.k = k;
    g.add(f);
    out.push(f);
  }
  const ph = rand() * 6;
  animated.push((time) => {
    for (const f of out) {
      const k = f.userData.k as number;
      const w = Math.sin(time * (9 + k * 3) + ph + k);
      f.scale.y = size * (1.5 + w * 0.3);
      f.position.y = y + f.scale.y * 0.4;
    }
  });
  return out;
}

/** A rat: a long furry body, a pointed snout, round ears, red eyes, four little legs and a long bare tail. `scale` 1 is about kart-length. Returns the parts that move. */
export function ratFigure(scale: number, fur: THREE.Material, eye: THREE.Material): { group: THREE.Group; tail: THREE.Object3D[]; legs: THREE.Object3D[]; head: THREE.Object3D } {
  const g = new THREE.Group();
  const skin = lambert(0xd89a90, { flatShading: true });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), fur);
  body.scale.set(0.85, 0.75, 1.5);
  body.position.y = 0.45;
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 8), fur);
  skull.rotation.x = Math.PI / 2;
  skull.position.z = 0.3;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), skin);
  nose.position.z = 0.7;
  head.add(skull, nose);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), skin);
    ear.scale.set(1, 1, 0.3);
    ear.position.set(side * 0.2, 0.22, 0.05);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), eye);
    e.position.set(side * 0.14, 0.1, 0.35);
    head.add(ear, e);
  }
  head.position.set(0, 0.55, 0.65);
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.3, 0.4], [0.3, 0.4], [-0.3, -0.4], [0.3, -0.4]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.16), skin);
    leg.position.set(x, 0.15, z);
    g.add(leg);
    legs.push(leg);
  }
  // The tail, in links that can wave.
  const tail: THREE.Object3D[] = [];
  let parent: THREE.Object3D = g;
  let z = -0.7;
  for (let k = 0; k < 4; k++) {
    const link = new THREE.Group();
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.035 - k * 0.006, 0.05 - k * 0.006, 0.4, 5), skin);
    seg.rotation.x = Math.PI / 2;
    seg.position.z = -0.2;
    link.add(seg);
    link.position.set(0, k ? 0 : 0.4, k ? -0.4 : z);
    parent.add(link);
    tail.push(link);
    parent = link;
    z = -0.4;
  }
  g.add(body, head);
  g.scale.setScalar(scale);
  return { group: g, tail, legs, head };
}

/** Planet B: smokestacks belching, burned-out cars, dead trees, rubbish heaps, oil drums on fire, gutted tenements. */
export function blightFeature(rockMat: THREE.Material, animated: Animated): Feature {
  const brick = new THREE.MeshLambertMaterial({ map: tex.tenementTexture(), flatShading: true });
  const rust = new THREE.MeshLambertMaterial({ map: tex.rustTexture(), flatShading: true });
  const charred = lambert(0x1a1614, { flatShading: true });
  const dead = lambert(0x2a221c, { flatShading: true });
  const drumMat = lambert(0x2a4a6a, { flatShading: true });
  const window = glowing(0xff8a30, 0.9);
  const stack: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 18 + rand() * 20;
    const r = 1.8 + rand() * 1.4;
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r, h, 10), brick);
    chimney.position.y = h / 2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 1, 10), rust);
    band.position.y = h - 1.5;
    t.add(chimney, band);
    smokeColumn(t, h, rand() < 0.5 ? 0x3a3630 : 0x5a5a3a, animated, rand, 1.4, 0.18);
    return place(t, x, z, rand);
  };
  const car: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 4.2), rand() < 0.5 ? rust : charred);
    body.position.y = 0.7;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 2), charred);
    cab.position.set(0, 1.45, -0.2);
    t.add(body, cab);
    for (const [wx, wz] of [[-1, 1.3], [1, 1.3], [-1, -1.3], [1, -1.3]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 8), charred);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.3, wz);
      t.add(w);
    }
    t.rotation.z = (rand() - 0.5) * 0.3;
    if (rand() < 0.4) fire(t, 1.6, 1.6, animated, rand);
    return place(t, x, z, rand);
  };
  const tree: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 5 + rand() * 6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.55, h, 7), dead);
    trunk.position.y = h / 2;
    t.add(trunk);
    for (let k = 0; k < 4; k++) {
      const l = 1.5 + rand() * 3;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.18, l, 5), dead);
      br.position.y = h * (0.5 + rand() * 0.45);
      br.rotation.set((rand() - 0.5) * 1.6, rand() * 6, 0.6 + rand() * 0.6);
      br.translateY(l / 2);
      t.add(br);
    }
    return place(t, x, z, rand);
  };
  const heap: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const colours = [0x5a5048, 0x3a5a7a, 0x8a3a2a, 0x6a6a5a, 0x2a2420];
    for (let k = 0; k < 8; k++) {
      const s = 0.6 + rand() * 1.4;
      const m = new THREE.Mesh(k < 3 ? new THREE.DodecahedronGeometry(s, 0) : new THREE.BoxGeometry(s, s * 0.6, s * 1.2), k < 3 ? rockMat : lambert(colours[k % 5], { flatShading: true }));
      m.position.set((rand() - 0.5) * 4, s * 0.4 + (k > 5 ? 1 : 0), (rand() - 0.5) * 4);
      m.rotation.set(rand(), rand() * 3, rand());
      t.add(m);
    }
    return place(t, x, z, rand);
  };
  const drum: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 10), rand() < 0.5 ? drumMat : rust);
    d.position.y = 0.7;
    t.add(d);
    fire(t, 1.3, 1.4, animated, rand);
    smokeColumn(t, 2.5, 0x2a2622, animated, rand, 0.5, 0.35);
    return place(t, x, z, rand);
  };
  const tenement: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 8 + rand() * 6;
    const h = 10 + rand() * 14;
    const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, 7), brick);
    block.position.y = h / 2;
    t.add(block);
    // A few windows still burning.
    for (let k = 0; k < 4; k++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.4), window);
      win.position.set((rand() - 0.5) * (w - 2), 2 + rand() * (h - 4), 3.51);
      t.add(win);
    }
    if (rand() < 0.5) smokeColumn(t, h, 0x2a2420, animated, rand, 1.2, 0.2);
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[1.6, stack], [1.4, car], [1.4, tree], [1.2, heap], [1, drum], [1.2, tenement]])(x, z, rand);
}

/** Mars for the Rich: little glass domes with a tower inside, white spires with gold tops, landing pads, mirrors, red hoodoos, and the undercity's vents steaming up through the dust. */
export function domesFeature(rockMat: THREE.Material, animated: Animated): Feature {
  const white = metal(0xf0ece4, 90);
  const gold = metal(0xe0b040, 140);
  const glass = new THREE.MeshPhongMaterial({ color: 0xc8e8f8, emissive: 0x203040, transparent: true, opacity: 0.35, shininess: 160, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false });
  const lit = glowing(0xfff0c0, 0.8);
  const pipe = metal(0x5a5048, 30);
  const glow = glowTex();
  const dome: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 5 + rand() * 6;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.35, 6, 32), gold);
    ring.rotation.x = Math.PI / 2;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.12, r * 0.2, r * 0.8, 8), white);
    tower.position.y = r * 0.4;
    const top = new THREE.Mesh(new THREE.ConeGeometry(r * 0.14, r * 0.25, 8), gold);
    top.position.y = r * 0.92;
    t.add(tower, top, shell, ring);
    return place(t, x, z, rand);
  };
  const spire: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 16 + rand() * 22;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2, h, 8), white);
    shaft.position.y = h / 2;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.3, 5, 8), gold);
    cap.position.y = h + 2.5;
    t.add(shaft, cap);
    for (let k = 0; k < 3; k++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.5 - k * 0.15, 1.5 - k * 0.15, 0.6, 8), lit);
      band.position.y = h * (0.35 + k * 0.2);
      t.add(band);
    }
    const beacon = new THREE.Sprite(additive(glow, 0xffe0a0));
    beacon.scale.setScalar(3);
    beacon.position.y = h + 5.5;
    t.add(beacon);
    const ph = rand() * 6;
    animated.push((time) => (beacon.material.opacity = Math.sin(time * 2 + ph) > 0.4 ? 1 : 0.2));
    return place(t, x, z, rand);
  };
  const pad: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 0.6, 16), white);
    deck.position.y = 0.3;
    const mark = new THREE.Mesh(new THREE.RingGeometry(2.5, 3, 24), new THREE.MeshBasicMaterial({ color: 0xe0b040, side: THREE.DoubleSide }));
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.62;
    const rocket = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 9, 10), white);
    rocket.position.y = 5.1;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.4, 10), gold);
    nose.position.y = 10.8;
    t.add(deck, mark, rocket, nose);
    for (let k = 0; k < 3; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2, 1.4), gold);
      const a = (k / 3) * Math.PI * 2;
      fin.position.set(Math.cos(a) * 1, 1.6, Math.sin(a) * 1);
      fin.rotation.y = -a;
      t.add(fin);
    }
    return place(t, x, z, rand);
  };
  const mirror: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 3, 6), pipe);
    post.position.y = 1.5;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 2.6), new THREE.MeshPhongMaterial({ color: 0xa8d0f0, shininess: 200, specular: 0xffffff, emissive: 0x102030 }));
    panel.position.y = 3;
    panel.rotation.x = -0.6;
    t.add(post, panel);
    const ph = rand() * 6;
    animated.push((time) => (panel.rotation.z = Math.sin(time * 0.1 + ph) * 0.3));
    return place(t, x, z, rand);
  };
  const hoodoo: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 4 + rand() * 7;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.8 + rand(), 1.6 + rand(), h, 7), rockMat);
    col.position.y = h / 2;
    const capRock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6 + rand(), 0), rockMat);
    capRock.position.y = h + 0.6;
    t.add(col, capRock);
    return place(t, x, z, rand);
  };
  const vent: Feature = (x, z, rand) => {
    // The undercity breathing up through a grille in the dust: where the poor are kept.
    const t = new THREE.Group();
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 2.5, 8), pipe);
    stack.position.y = 1.25;
    const grille = new THREE.Mesh(new THREE.CircleGeometry(2.6, 12), new THREE.MeshBasicMaterial({ color: 0x1a0a06 }));
    grille.rotation.x = -Math.PI / 2;
    grille.position.y = 0.05;
    const below = new THREE.Sprite(additive(glow, 0xff7a30));
    below.scale.setScalar(4);
    below.position.y = 0.3;
    t.add(grille, below, stack);
    smokeColumn(t, 2.5, 0xd8c8b8, animated, rand, 0.6, 0.3);
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[1.6, dome], [1.6, spire], [0.7, pad], [1, mirror], [1.6, hoodoo], [1.2, vent]])(x, z, rand);
}

/** Perihelion: spicules of plasma jetting up, little magnetic loops, sunspots, tumbling pieces of hull, and heat shimmering off it all. */
export function coronaFeature(animated: Animated): Feature {
  const glow = glowTex();
  const hull = new THREE.MeshLambertMaterial({ map: tex.heatShieldTexture(), flatShading: true });
  const plasma = new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const spicule: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 10 + rand() * 25;
    const jet = new THREE.Mesh(new THREE.ConeGeometry(1.2 + rand(), h, 8, 1, true), plasma);
    jet.position.y = h / 2;
    const foot = new THREE.Sprite(additive(glow, 0xffd060));
    foot.scale.setScalar(6);
    foot.position.y = 0.5;
    t.add(jet, foot);
    const ph = rand() * 6;
    animated.push((time) => {
      const k = 0.6 + 0.4 * Math.abs(Math.sin(time * 0.7 + ph));
      jet.scale.y = k;
      jet.position.y = (h * k) / 2;
    });
    t.position.set(x, 0, z);
    return t;
  };
  const loop: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 4 + rand() * 6;
    const n = 12;
    const dots: THREE.Sprite[] = [];
    for (let k = 0; k <= n; k++) {
      const s = new THREE.Sprite(additive(glow, k % 2 ? 0xff8a20 : 0xffd060));
      const a = (k / n) * Math.PI;
      s.position.set(Math.cos(a) * r, Math.sin(a) * r * 1.3, 0);
      s.scale.setScalar(2.5);
      s.userData.k = k;
      t.add(s);
      dots.push(s);
    }
    const ph = rand() * 6;
    animated.push((time) => {
      for (const s of dots) s.material.opacity = 0.5 + 0.5 * Math.sin(time * 4 - (s.userData.k as number) * 0.6 + ph);
    });
    return place(t, x, z, rand);
  };
  const spot: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 3 + rand() * 5;
    const umbra = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ color: 0x2a0800 }));
    umbra.rotation.x = -Math.PI / 2;
    umbra.position.y = 0.06;
    const penumbra = new THREE.Mesh(new THREE.RingGeometry(r, r * 1.6, 24), new THREE.MeshBasicMaterial({ color: 0x8a2a04, transparent: true, opacity: 0.8 }));
    penumbra.rotation.x = -Math.PI / 2;
    penumbra.position.y = 0.05;
    t.add(umbra, penumbra);
    t.position.set(x, 0, z);
    return t;
  };
  const debris: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(2 + rand() * 4, 0.3, 1.5 + rand() * 3), hull);
    const o = new THREE.Group();
    o.add(plate);
    const y = 5 + rand() * 15;
    o.position.y = y;
    const ember = new THREE.Sprite(additive(glow, 0xff6a10));
    ember.scale.setScalar(4);
    o.add(ember);
    t.add(o);
    const ph = rand() * 6;
    animated.push((time) => {
      o.rotation.set(time * 0.5 + ph, time * 0.3 + ph, time * 0.2);
      o.position.y = y + Math.sin(time * 0.6 + ph) * 2;
    });
    t.position.set(x, 0, z);
    return t;
  };
  const shimmer: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const s = new THREE.Sprite(additive(glow, 0xfff0b0));
    s.scale.setScalar(10 + rand() * 10);
    s.position.y = 2;
    t.add(s);
    const ph = rand() * 6;
    animated.push((time) => (s.material.opacity = 0.2 + 0.2 * Math.sin(time * 1.3 + ph)));
    t.position.set(x, 0, z);
    return t;
  };
  return (x, z, rand) => pick(rand, [[2, spicule], [1.4, loop], [1, spot], [1.4, debris], [0.8, shimmer]])(x, z, rand);
}

/** Hell: pools of lava, spires of black rock, cages hanging from gibbets, piles of skulls, fire pits, and rats. */
export function pitFeature(rockMat: THREE.Material, animated: Animated): Feature {
  const lava = new THREE.MeshBasicMaterial({ map: tex.lavaTexture() });
  const iron = metal(0x2a2224, 40);
  const bone = new THREE.MeshPhongMaterial({ map: tex.boneTexture(), shininess: 30, specular: 0x333322 });
  const fur = new THREE.MeshLambertMaterial({ map: tex.furTexture() });
  const eye = new THREE.MeshBasicMaterial({ color: 0xff2010 });
  const glow = glowTex();
  const pool: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 3 + rand() * 5;
    const p = new THREE.Mesh(new THREE.CircleGeometry(r, 18), lava);
    p.rotation.x = -Math.PI / 2;
    p.position.y = 0.08;
    const halo = new THREE.Sprite(additive(glow, 0xff6010));
    halo.scale.setScalar(r * 2.6);
    halo.position.y = 1;
    t.add(p, halo);
    const ph = rand() * 6;
    animated.push((time) => (halo.material.opacity = 0.6 + 0.3 * Math.sin(time * 3 + ph)));
    t.position.set(x, 0, z);
    return t;
  };
  const spire: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 10 + rand() * 22;
    const s = new THREE.Mesh(new THREE.ConeGeometry(2 + rand() * 2, h, 6), rockMat);
    s.position.y = h / 2;
    s.rotation.z = (rand() - 0.5) * 0.3;
    t.add(s);
    return place(t, x, z, rand);
  };
  const gibbet: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9, 0.4), iron);
    post.position.y = 4.5;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 0.3), iron);
    arm.position.set(1.5, 8.8, 0);
    const cage = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 4), iron);
      const a = (k / 6) * Math.PI * 2;
      bar.position.set(Math.cos(a) * 0.7, -1.6, Math.sin(a) * 0.7);
      cage.add(bar);
    }
    const sk = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), bone);
    sk.position.y = -2.4;
    cage.add(sk);
    cage.position.set(3, 8.7, 0);
    t.add(post, arm, cage);
    const ph = rand() * 6;
    animated.push((time) => (cage.rotation.z = Math.sin(time * 0.9 + ph) * 0.15));
    return place(t, x, z, rand);
  };
  const skulls: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 7; k++) {
      const s = 0.5 + rand() * 0.4;
      const sk = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), bone);
      sk.position.set((rand() - 0.5) * 2.4, s + (k > 4 ? s * 1.4 : 0), (rand() - 0.5) * 2.4);
      t.add(sk);
    }
    return place(t, x, z, rand);
  };
  const brazier: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.5, 1, 10), iron);
    bowl.position.y = 2.5;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 2, 6), iron);
    leg.position.y = 1;
    t.add(bowl, leg);
    fire(t, 2.8, 2.4, animated, rand);
    return place(t, x, z, rand);
  };
  const rat: Feature = (x, z, rand) => {
    const r = ratFigure(1.2 + rand() * 0.8, fur, eye);
    const ph = rand() * 6;
    animated.push((time) => {
      // Sniffing about.
      r.head.rotation.y = Math.sin(time * 2 + ph) * 0.5;
      r.head.rotation.x = Math.max(0, Math.sin(time * 3 + ph)) * -0.4;
      r.tail.forEach((l, k) => (l.rotation.y = Math.sin(time * 3 + ph + k) * 0.3));
    });
    return place(r.group, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[1.4, pool], [1.6, spire], [0.8, gibbet], [1.2, skulls], [1.2, brazier], [1.4, rat]])(x, z, rand);
}

/** Planet B's gate: a smokestack either side, belching, a rusted girder across, and a sign that says what the song says. */
export function smogGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const brick = new THREE.MeshLambertMaterial({ map: tex.tenementTexture(), flatShading: true });
  const rust = new THREE.MeshLambertMaterial({ map: tex.rustTexture(), flatShading: true });
  const glow = glowTex();
  const rand = (() => {
    let k = 7;
    return () => ((k = (k * 16807) % 2147483647) / 2147483647);
  })();
  for (const side of [-1, 1]) {
    const stack = new THREE.Group();
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 20, 10), brick);
    chimney.position.y = 10;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 1, 10), rust);
    band.position.y = 18.5;
    stack.add(chimney, band);
    smokeColumn(stack, 20, 0x4a4436, animated, rand, 1.4, 0.2);
    const lamp = new THREE.Sprite(additive(glow, 0xff3010));
    lamp.scale.setScalar(2.5);
    lamp.position.y = 20.5;
    stack.add(lamp);
    animated.push((time) => (lamp.material.opacity = Math.sin(time * 2 + side) > 0 ? 1 : 0.1));
    stack.position.x = side * (hw + 2.2);
    g.add(stack);
  }
  const girder = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 4, 1.8, 1.6), rust);
  girder.position.y = 12;
  g.add(girder);
  sign(g, 'NO PLANET B', '#2a2420', '#e8c070', hw * 1.2, 9.4);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The Earth in the infield, used up and burning: a great cracked globe on a heap of rubble, fires across it, smoke rising off it. */
export function burningEarth(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pointAt(ribbon.spline, s);
  const R = 30;
  const map = tex.burntEarthTexture();
  const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.35 }));
  globe.position.y = R + 6;
  globe.rotation.z = 0.4;
  g.add(globe);
  const rubble = new THREE.MeshLambertMaterial({ map: tex.stoneTexture([40, 36, 32], [96, 88, 76]), flatShading: true });
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(5 + (k % 4) * 2, 0), rubble);
    r.position.set(Math.cos(a) * R * 0.6, 3, Math.sin(a) * R * 0.6);
    g.add(r);
  }
  const rand = (() => {
    let k = 11;
    return () => ((k = (k * 16807) % 2147483647) / 2147483647);
  })();
  // Fires burning on its face, and smoke going up off the top.
  const fires = new THREE.Group();
  for (let k = 0; k < 10; k++) {
    const holder = new THREE.Group();
    const a = (k / 10) * Math.PI * 2;
    const lat = (rand() - 0.5) * 1.6;
    holder.position.set(Math.cos(a) * Math.cos(lat) * R, Math.sin(lat) * R, Math.sin(a) * Math.cos(lat) * R);
    fire(holder, 0, 5 + rand() * 4, animated, rand);
    fires.add(holder);
  }
  fires.position.copy(globe.position);
  g.add(fires);
  for (let k = 0; k < 3; k++) {
    const col = new THREE.Group();
    col.position.set((k - 1) * 12, R * 1.8, (rand() - 0.5) * 10);
    smokeColumn(col, 0, 0x2a2420, animated, rand, 4, 0.08);
    g.add(col);
  }
  const halo = new THREE.Sprite(additive(glowTex(), 0xff6a20));
  halo.scale.setScalar(R * 3.4);
  halo.position.copy(globe.position);
  g.add(halo);
  animated.push((time) => {
    globe.rotation.y = time * 0.05;
    fires.rotation.y = time * 0.05;
    halo.material.opacity = 0.35 + 0.1 * Math.sin(time * 1.3);
  });
  g.position.set(p.x - p.tz * lateral, 0, p.z + p.tx * lateral);
  return g;
}

/** Mars for the Rich's gate: an airlock arch, white pylons capped in gold, a glass vault over the road, beacons, and the welcome. */
export function domeGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const white = metal(0xf0ece4, 90);
  const gold = metal(0xe0b040, 140);
  const glass = new THREE.MeshPhongMaterial({ color: 0xc8e8f8, emissive: 0x203040, transparent: true, opacity: 0.3, shininess: 160, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false });
  const glow = glowTex();
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(2.6, 12, 4), white);
    pylon.position.set(side * (hw + 1.3), 6, 0);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.9, 3, 4), gold);
    cap.position.set(side * (hw + 1.3), 13.5, 0);
    cap.rotation.y = Math.PI / 4;
    const beacon = new THREE.Sprite(additive(glow, 0xffe0a0));
    beacon.scale.setScalar(3);
    beacon.position.set(side * (hw + 1.3), 15.5, 0);
    g.add(pylon, cap, beacon);
    animated.push((time) => (beacon.material.opacity = 0.5 + 0.5 * Math.sin(time * 2 + side)));
  }
  // The vault: a half cylinder of glass over the road, ribbed in gold.
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(hw + 1, hw + 1, 8, 24, 1, true, -Math.PI / 2, Math.PI), glass);
  vault.rotation.x = Math.PI / 2;
  vault.position.y = 0.5;
  g.add(vault);
  for (const dz of [-4, 0, 4]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(hw + 1, 0.3, 6, 32, Math.PI), gold);
    rib.position.set(0, 0.5, dz);
    g.add(rib);
  }
  sign(g, 'MARS FOR THE RICH', '#f4f0e8', '#c8901a', hw * 1.25, hw + 4);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The colony in the infield: a great glass dome over the rich's white and gold towers, and round its foot the dark grilles of the undercity where the poor are kept. */
export function richDome(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pointAt(ribbon.spline, s);
  const R = 48;
  const white = metal(0xf4f0e8, 90);
  const gold = metal(0xe8b840, 150);
  const lit = glowing(0xfff0c0, 0.9);
  const glass = new THREE.MeshPhongMaterial({ color: 0xd0ecf8, emissive: 0x18303c, transparent: true, opacity: 0.25, shininess: 180, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(R + 2, R + 4, 4, 48), white);
  plinth.position.y = 2;
  g.add(plinth);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 1, 8, 64), gold);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 4;
  g.add(ring);
  // The towers inside.
  const towers: THREE.Mesh[] = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const r = k === 0 ? 0 : R * (0.25 + (k % 3) * 0.17);
    const h = k === 0 ? 40 : 14 + ((k * 7) % 5) * 5;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, h, 8), white);
    t.position.set(Math.cos(a) * r, 4 + h / 2, Math.sin(a) * r);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.6, 6, 8), gold);
    cap.position.y = h / 2 + 3;
    t.add(cap);
    for (let b = 0; b < 3; b++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.8, 8), lit);
      band.position.y = -h / 2 + h * (0.3 + b * 0.2);
      t.add(band);
    }
    g.add(t);
    towers.push(t);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  dome.position.y = 4;
  g.add(dome);
  // Gold struts over the glass.
  for (let k = 0; k < 8; k++) {
    const strut = new THREE.Mesh(new THREE.TorusGeometry(R, 0.4, 6, 40, Math.PI), gold);
    strut.position.y = 4;
    strut.rotation.y = (k / 8) * Math.PI;
    g.add(strut);
  }
  // The undercity: grilles round the plinth's foot, lit from below, steam coming up.
  const glow = glowTex();
  const rand = (() => {
    let k = 13;
    return () => ((k = (k * 16807) % 2147483647) / 2147483647);
  })();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.3;
    const v = new THREE.Group();
    const grille = new THREE.Mesh(new THREE.CircleGeometry(3.5, 12), new THREE.MeshBasicMaterial({ color: 0x140804 }));
    grille.rotation.x = -Math.PI / 2;
    grille.position.y = 0.06;
    const under = new THREE.Sprite(additive(glow, 0xff6a20));
    under.scale.setScalar(6);
    under.position.y = 0.4;
    v.add(grille, under);
    smokeColumn(v, 0.5, 0xc8b8a8, animated, rand, 0.8, 0.25);
    v.position.set(Math.cos(a) * (R + 10), 0, Math.sin(a) * (R + 10));
    g.add(v);
  }
  const beacon = new THREE.Sprite(additive(glow, 0xffe8b0));
  beacon.scale.setScalar(10);
  beacon.position.y = 4 + 40 + 7;
  g.add(beacon);
  animated.push((time) => {
    beacon.material.opacity = Math.sin(time * 1.5) > 0 ? 1 : 0.3;
    lit.emissiveIntensity = 0.7 + 0.2 * Math.sin(time * 0.8);
  });
  g.position.set(p.x - p.tz * lateral, 0, p.z + p.tx * lateral);
  return g;
}

/** Perihelion's gate: the ship's own ribs over the road, its hull plates glowing with the heat, a nameplate across the top. */
export function shipGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const hull = new THREE.MeshLambertMaterial({ map: tex.heatShieldTexture(), flatShading: true });
  const hot = new THREE.MeshBasicMaterial({ color: 0xff8a20 });
  const ribs: THREE.Mesh[] = [];
  for (let k = 0; k < 4; k++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(hw + 1, 0.9, 8, 32, Math.PI), hull);
    rib.position.z = -k * 6;
    g.add(rib);
    // The leading edge of each rib glows with the heat.
    const edge = new THREE.Mesh(new THREE.TorusGeometry(hw + 1.9, 0.18, 6, 32, Math.PI), hot);
    edge.position.z = -k * 6 + 0.6;
    g.add(edge);
    ribs.push(edge);
  }
  const spine = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 20), hull);
  spine.position.set(0, hw + 1.5, -9);
  g.add(spine);
  const glow = new THREE.Sprite(additive(glowTex(), 0xffb040));
  glow.scale.setScalar(hw * 2.4);
  glow.position.set(0, hw, 2);
  g.add(glow);
  animated.push((time) => {
    ribs.forEach((r, k) => ((r.material as THREE.MeshBasicMaterial).color.setHSL(0.07 + 0.03 * Math.sin(time * 2 + k), 1, 0.55)));
    glow.material.opacity = 0.3 + 0.15 * Math.sin(time * 3);
  });
  sign(g, 'PERIHELION', '#1a0a04', '#ffd060', hw * 1.1, hw - 2);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The sun, filling the sky past the edge of the world: a boiling sphere, its corona round it, flares looping off its limb. */
export function theSun(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pointAt(ribbon.spline, s);
  const R = 170;
  const map = tex.solarGroundTexture();
  map.repeat.set(10, 6);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), new THREE.MeshBasicMaterial({ map, color: 0xfff4e0, fog: false }));
  sun.position.y = R * 0.8;
  g.add(sun);
  const glow = glowTex();
  // White hot in the middle against an orange sky, the corona round it.
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff4d0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  core.scale.setScalar(R * 2.6);
  core.position.copy(sun.position);
  g.add(core);
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffc060, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  corona.scale.setScalar(R * 4.4);
  corona.position.copy(sun.position);
  g.add(corona);
  // Flares looping off the limb: arcs of glowing points, each rising and falling on its own clock.
  const loops: { group: THREE.Group; dots: THREE.Sprite[]; ph: number }[] = [];
  for (let k = 0; k < 5; k++) {
    const lg = new THREE.Group();
    const dots: THREE.Sprite[] = [];
    for (let d = 0; d <= 14; d++) {
      const s2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: d % 2 ? 0xff7a10 : 0xffd060, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      s2.scale.setScalar(10);
      s2.userData.a = (d / 14) * Math.PI;
      lg.add(s2);
      dots.push(s2);
    }
    lg.position.copy(sun.position);
    lg.rotation.set(0, (k / 5) * Math.PI * 2, (k / 5) * 1.4 - 0.7);
    g.add(lg);
    loops.push({ group: lg, dots, ph: k * 1.7 });
  }
  animated.push((time) => {
    sun.rotation.y = time * 0.02;
    corona.material.opacity = 0.75 + 0.15 * Math.sin(time * 0.9);
    for (const l of loops) {
      const h = 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(time * 0.4 + l.ph));
      for (const d of l.dots) {
        const a = d.userData.a as number;
        d.position.set(Math.cos(a) * R * 0.35 + R * 0.95, Math.sin(a) * R * h, 0);
      }
    }
  });
  g.position.set(p.x - p.tz * lateral, 0, p.z + p.tx * lateral);
  return g;
}

/** Hell's gate: two pillars of black rock with horns that curl in over the road, a goat's skull between them, braziers burning. */
export function hellGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const rock = new THREE.MeshLambertMaterial({ map: tex.hellWallTexture(), flatShading: true });
  const horn = new THREE.MeshPhongMaterial({ color: 0x2a1a14, shininess: 40, flatShading: true });
  const bone = new THREE.MeshPhongMaterial({ map: tex.boneTexture(), shininess: 30, specular: 0x333322 });
  const rand = (() => {
    let k = 17;
    return () => ((k = (k * 16807) % 2147483647) / 2147483647);
  })();
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 11, 7), rock);
    pillar.position.set(side * (hw + 1.6), 5.5, 0);
    g.add(pillar);
    // The horn: tapering cones along a curve, up and in over the road.
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(side * (hw + 1.6), 10.5, 0),
      new THREE.Vector3(side * (hw + 1.2), 19, 0),
      new THREE.Vector3(side * hw * 0.3, 17, 0),
    );
    const n = 12;
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      const len = curve.getLength() / n;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.5 * (1 - (u + 0.5 / n) * 0.85), 1.5 * (1 - (u - 0.5 / n) * 0.85), len * 1.15, 8), horn);
      seg.position.copy(curve.getPoint(u));
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangent(u));
      g.add(seg);
    }
    const bowl = new THREE.Group();
    const iron = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.6, 1, 10), metal(0x2a2224, 40));
    bowl.add(iron);
    fire(bowl, 0.4, 3, animated, rand);
    bowl.position.set(side * (hw + 4.5), 2.5, 0);
    g.add(bowl);
  }
  // The goat's skull, hung where the horns meet.
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 10), bone);
  skull.scale.set(1, 1.2, 0.9);
  skull.position.y = 14;
  g.add(skull);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3010 });
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), eyeMat);
    e.position.set(side * 0.7, 14.3, -1.5);
    g.add(e);
    eyes.push(e);
  }
  animated.push((time) => eyeMat.color.setHSL(0.02, 1, 0.35 + 0.2 * Math.abs(Math.sin(time * 2.5))));
  sign(g, 'HELL', '#1a0202', '#ff6a20', hw * 0.9, 9);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The Rats' Nest in the infield: a mountain of rats, a thousand eyes glinting in it, rats swarming round its slopes, and the king of them on top crowned in fire. */
export function ratsNest(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pointAt(ribbon.spline, s);
  const fur = new THREE.MeshLambertMaterial({ map: tex.furTexture(), flatShading: true });
  const H = 36;
  const R = 34;
  const hill = new THREE.Mesh(new THREE.ConeGeometry(R, H, 18, 6), fur);
  hill.position.y = H / 2;
  // Lumps of bodies all over it.
  const pos = hill.geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > H / 2 - 0.1) continue;
    const k = 1 + Math.sin(i * 12.9898) * 0.08;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  hill.geometry.computeVertexNormals();
  g.add(hill);
  // The eyes: points of red all over the heap, blinking.
  const n = 260;
  const eyePos = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const y = Math.pow(((k * 0.618) % 1), 1.3) * H * 0.95;
    const r = (1 - y / H) * R + 0.3;
    const a = k * 2.399;
    eyePos.set([Math.cos(a) * r, y, Math.sin(a) * r], k * 3);
  }
  const eyeGeo = new THREE.BufferGeometry();
  eyeGeo.setAttribute('position', new THREE.BufferAttribute(eyePos, 3));
  const eyeMat = new THREE.PointsMaterial({ color: 0xff2010, size: 1.2, transparent: true, depthWrite: false });
  g.add(new THREE.Points(eyeGeo, eyeMat));
  // Rats running round its slopes.
  const eye = new THREE.MeshBasicMaterial({ color: 0xff2010 });
  const runners: ReturnType<typeof ratFigure>[] = [];
  for (let k = 0; k < 8; k++) {
    const r = ratFigure(3, fur, eye);
    g.add(r.group);
    runners.push(r);
  }
  // The king on top, sitting up, crowned in fire.
  const king = ratFigure(9, fur, eye);
  king.group.rotation.x = -1.1;
  king.group.position.set(0, H - 2, 0);
  g.add(king.group);
  const rand = (() => {
    let k = 19;
    return () => ((k = (k * 16807) % 2147483647) / 2147483647);
  })();
  const crown = new THREE.Group();
  for (let k = 0; k < 5; k++) {
    const holder = new THREE.Group();
    const a = (k / 5) * Math.PI * 2;
    holder.position.set(Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5);
    fire(holder, 0, 4, animated, rand);
    crown.add(holder);
  }
  crown.position.set(0, H + 12, 2);
  g.add(crown);
  const halo = new THREE.Sprite(additive(glowTex(), 0xff3010));
  halo.scale.setScalar(R * 2.2);
  halo.position.y = H * 0.6;
  g.add(halo);
  animated.push((time) => {
    eyeMat.opacity = 0.6 + 0.4 * Math.sin(time * 3);
    runners.forEach((r, k) => {
      const a = time * (0.3 + (k % 3) * 0.08) * (k % 2 ? 1 : -1) + k * 0.8;
      const y = ((k * 0.37) % 1) * H * 0.7 + 1;
      const rr = (1 - y / H) * R + 0.5;
      r.group.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
      r.group.rotation.y = -a + (k % 2 ? 0 : Math.PI);
      r.legs.forEach((l, j) => (l.rotation.x = Math.sin(time * 16 + j * 1.6) * 0.6));
      r.tail.forEach((l, j) => (l.rotation.y = Math.sin(time * 6 + j) * 0.3));
    });
    king.head.rotation.y = Math.sin(time * 0.6) * 0.6;
    halo.material.opacity = 0.35 + 0.15 * Math.sin(time * 1.7);
  });
  g.position.set(p.x - p.tz * lateral, 0, p.z + p.tx * lateral);
  return g;
}
