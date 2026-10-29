import * as THREE from 'three';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import * as tex from './textures';

/**
 * Scenery and landmarks for the Silver Cord Cup's worlds, after the 2023
 * album about the soul's cord to the body and the old gods: the young Earth
 * cooling under a honeyed sky, the planet Theia coming on to hit it (Theia);
 * the red land at the edge of day and night, obelisks and the god's
 * statues (Set); the Moon, Chang'e's palace amongst the stars, the white
 * rabbit beside her (Chang'e); and Uruk and the road out of it, the dry
 * swamp, the scorpions and the trees of gemstones (Gilgamesh).
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
const crustTex = once(tex.crustWallTexture);
const templeTex = once(tex.templeWallTexture);
const marbleTex = once(tex.cloudMarbleTexture);
const glazedTex = once(tex.glazedBrickTexture);

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

/** A glowing thread hung from `a` to `b`, sagging `sag` metres in the middle: the silver cord. */
function cordBetween(a: THREE.Vector3, b: THREE.Vector3, sag: number, radius: number, mat: THREE.Material): THREE.Mesh {
  const mid = a.clone().lerp(b, 0.5);
  mid.y -= sag;
  const curve = new THREE.CatmullRomCurve3([a, a.clone().lerp(mid, 0.5).setY((a.y + mid.y) / 2 - sag * 0.15), mid, b.clone().lerp(mid, 0.5).setY((b.y + mid.y) / 2 - sag * 0.15), b]);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 40, radius, 8, false), mat);
}

/**
 * The Set animal: a long curved snout, tall squared-off ears and a forked
 * tail, sitting up like a jackal. Sits at the origin, `h` tall.
 */
function setAnimal(h: number, body: THREE.Material, eyeSun: THREE.Material, eyeMoon: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const k = h / 10;
  const haunch = new THREE.Mesh(new THREE.SphereGeometry(2.2 * k, 12, 10), body);
  haunch.scale.set(1, 0.8, 1.3);
  haunch.position.set(0, 2 * k, -0.8 * k);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(1.1 * k, 1.6 * k, 5 * k, 10), body);
  chest.position.set(0, 4.6 * k, 0.6 * k);
  chest.rotation.x = 0.25;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.7 * k, 1 * k, 2.4 * k, 10), body);
  neck.position.set(0, 7.6 * k, 1.2 * k);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1 * k, 12, 10), body);
  head.position.set(0, 8.8 * k, 1.4 * k);
  // The long down-curved snout.
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * k, 0.6 * k, 2.6 * k, 8), body);
  snout.rotation.x = Math.PI / 2 + 0.35;
  snout.position.set(0, 8.4 * k, 2.9 * k);
  g.add(haunch, chest, neck, head, snout);
  // The squared ears: tall, flat-topped.
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.45 * k, 2.2 * k, 0.7 * k), body);
    ear.position.set(side * 0.55 * k, 10.2 * k, 1 * k);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.9 * k, 0.35 * k, 0.8 * k), body);
    top.position.set(side * 0.55 * k, 11.3 * k, 1 * k);
    g.add(ear, top);
    // His right eye the sun, his left the moon.
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22 * k, 8, 6), side > 0 ? eyeMoon : eyeSun);
    eye.position.set(side * 0.62 * k, 9 * k, 2 * k);
    g.add(eye);
  }
  // Forelegs, and the stiff forked tail.
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * k, 0.5 * k, 4 * k, 8), body);
    leg.position.set(side * 0.9 * k, 2 * k, 1.6 * k);
    g.add(leg);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * k, 0.35 * k, 4 * k, 8), body);
  tail.position.set(0, 3.4 * k, -3.2 * k);
  tail.rotation.x = -0.5;
  g.add(tail);
  for (const side of [-1, 1]) {
    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * k, 0.2 * k, 1.4 * k, 6), body);
    fork.position.set(side * 0.35 * k, 5.4 * k, -4.3 * k);
    fork.rotation.z = side * 0.5;
    g.add(fork);
  }
  return g;
}

/** Theia: magma pools glowing through the crust, spires of black glass, steam, spirits drifting, and silver cords rising out of the ground to the sky. */
export function hadeanFeature(animated: Animated): Feature {
  const glass = glossy(0x14121a, 140);
  const crust = new THREE.MeshLambertMaterial({ map: crustTex(), flatShading: true });
  const magma = glowing(0xff7020, 1);
  const silver = new THREE.MeshLambertMaterial({ color: 0xe8f0ff, emissive: 0xc8d8ff, emissiveIntensity: 0.9 });
  const glow = glowTex();
  const pool: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 2 + rand() * 4;
    const melt = new THREE.Mesh(new THREE.CircleGeometry(r, 18), magma);
    melt.rotation.x = -Math.PI / 2;
    melt.position.y = 0.08;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.6, 6, 18), crust);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.2;
    const heat = new THREE.Sprite(additive(glow, 0xff8a30));
    heat.scale.set(r * 3, r * 1.5, 1);
    heat.position.y = 1;
    t.add(melt, rim, heat);
    const ph = rand() * 10;
    animated.push((time) => (heat.material.opacity = 0.6 + 0.3 * Math.sin(time * 1.3 + ph)));
    return place(t, x, z, rand);
  };
  const spire: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const h = 6 + rand() * 14;
      const s = new THREE.Mesh(new THREE.ConeGeometry(1 + rand() * 1.6, h, 5), glass);
      s.position.set((rand() - 0.5) * 4, h / 2, (rand() - 0.5) * 4);
      s.rotation.z = (rand() - 0.5) * 0.3;
      t.add(s);
    }
    return place(t, x, z, rand);
  };
  const vent: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.2, 8, 1, true), crust);
    cone.position.y = 1.1;
    t.add(cone);
    const puffs: THREE.Sprite[] = [];
    for (let k = 0; k < 4; k++) {
      const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xe8d8c8, transparent: true, depthWrite: false }));
      t.add(p);
      puffs.push(p);
    }
    const ph = rand() * 10;
    animated.push((time) =>
      puffs.forEach((p, k) => {
        const u = (time * 0.25 + ph + k / puffs.length) % 1;
        p.position.set(0, 2 + u * 14, 0);
        p.scale.setScalar(2 + u * 8);
        p.material.opacity = 0.5 * (1 - u);
      }),
    );
    return place(t, x, z, rand);
  };
  // "The silver cord, a glowing thread, binds us to the higher divine": a thread out of a stone, up into the sky.
  const thread: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), crust);
    stone.position.y = 0.6;
    const h = 40 + rand() * 30;
    const sway = new THREE.Group();
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, h, 5), silver);
    line.position.y = h / 2;
    sway.add(line);
    const spark = new THREE.Sprite(additive(glow, 0xd8e4ff));
    spark.scale.setScalar(3);
    sway.add(spark);
    t.add(stone, sway);
    const ph = rand() * 10;
    animated.push((time) => {
      sway.rotation.z = Math.sin(time * 0.4 + ph) * 0.06;
      spark.position.y = ((time * 6 + ph * 10) % h) + 1;
    });
    return place(t, x, z, rand);
  };
  // "A throng of spirits fly into that space": a wisp of light, drifting up.
  const spirit: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = new THREE.Sprite(additive(glow, 0xfff0d0));
    w.scale.setScalar(2.5);
    t.add(w);
    const ph = rand() * 10;
    animated.push((time) => {
      const u = (time * 0.05 + ph) % 1;
      w.position.set(Math.sin(time * 0.7 + ph) * 3, 2 + u * 30, Math.cos(time * 0.5 + ph) * 3);
      w.material.opacity = Math.sin(u * Math.PI);
    });
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [4, pool],
      [5, spire],
      [2, vent],
      [2, thread],
      [2, spirit],
    ])(x, z, rand);
}

/** Set: obelisks tipped with gold, the god's statues, palms, dunes, and dust devils twisting off the sand. */
export function deshretFeature(animated: Animated): Feature {
  const stone = lambert(0xd8b080);
  const red = lambert(0xb05a34);
  const gold = glossy(0xe8b030, 80);
  const basalt = lambert(0x2a2428);
  const sun = glowing(0xffc030, 1);
  const moon = glowing(0xe0e8ff, 1);
  const trunk = lambert(0x7a5a38);
  const frond = lambert(0x4a7a30, { side: THREE.DoubleSide, flatShading: true });
  const glow = glowTex();
  const obelisk: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 14 + rand() * 12;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, h, 4), stone);
    shaft.rotation.y = Math.PI / 4;
    shaft.position.y = h / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2, 4), gold);
    tip.rotation.y = Math.PI / 4;
    tip.position.y = h + 1;
    t.add(shaft, tip);
    return place(t, x, z, rand);
  };
  const statue: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 7), stone);
    plinth.position.y = 1;
    const god = setAnimal(8 + rand() * 4, basalt, sun, moon);
    god.position.y = 2;
    t.add(plinth, god);
    return place(t, x, z, rand);
  };
  const palm: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 8 + rand() * 6;
    const lean = (rand() - 0.5) * 0.3;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, h, 6), trunk);
    tr.position.y = h / 2;
    tr.rotation.z = lean;
    t.add(tr);
    for (let k = 0; k < 7; k++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1, 5), frond);
      f.position.set(-Math.sin(lean) * h, h, 0);
      f.rotation.set(-1.0, (k / 7) * Math.PI * 2, 0);
      f.translateY(2.2);
      t.add(f);
    }
    return place(t, x, z, rand);
  };
  const dune: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const d = new THREE.Mesh(new THREE.SphereGeometry(8 + rand() * 10, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), red);
    d.scale.set(1.6, 0.35, 1);
    t.add(d);
    return place(t, x, z, rand);
  };
  // "Tornado bore down and lifted him high": a dust devil twisting up off the sand.
  const devil: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const puffs: THREE.Sprite[] = [];
    for (let k = 0; k < 8; k++) {
      const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xd08050, transparent: true, opacity: 0.4, depthWrite: false }));
      t.add(p);
      puffs.push(p);
    }
    const ph = rand() * 10;
    animated.push((time) =>
      puffs.forEach((p, k) => {
        const y = k * 3;
        const a = time * 4 + k * 0.9 + ph;
        p.position.set(Math.cos(a) * (1 + k * 0.4), y + 1, Math.sin(a) * (1 + k * 0.4));
        p.scale.setScalar(3 + k * 0.8);
      }),
    );
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [4, obelisk],
      [2, statue],
      [4, palm],
      [4, dune],
      [1, devil],
    ])(x, z, rand);
}

/** Chang'e: osmanthus trees in gold flower, red lanterns floating, pavilions, the white rabbit with its pestle, craters. */
export function moonPalaceFeature(animated: Animated): Feature {
  const bark = lambert(0x5a4a40);
  const leaf = lambert(0x2a6a4a, { flatShading: true });
  const blossom = glowing(0xffd060, 0.6);
  const lacquer = lambert(0xb01c24);
  const roofMat = lambert(0x206a5a, { flatShading: true });
  const lantern = glowing(0xff4a30, 0.9);
  const white = lambert(0xf4f4f8);
  const jade = glossy(0x40b080, 100);
  const dust = lambert(0xb0b0bc);
  const marble = new THREE.MeshLambertMaterial({ map: marbleTex() });
  const glow = glowTex();
  const osmanthus: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 6 + rand() * 5;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, h, 7), bark);
    tr.position.y = h / 2;
    t.add(tr);
    for (let k = 0; k < 4; k++) {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + rand() * 1.5, 1), leaf);
      c.position.set((rand() - 0.5) * 3, h + (rand() - 0.3) * 2, (rand() - 0.5) * 3);
      t.add(c);
      for (let f = 0; f < 5; f++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.25, 5, 4), blossom);
        b.position.copy(c.position).add(new THREE.Vector3((rand() - 0.5) * 3, (rand() - 0.5) * 3, (rand() - 0.5) * 3));
        t.add(b);
      }
    }
    return place(t, x, z, rand);
  };
  const lanterns: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 2 + Math.floor(rand() * 4);
    const ls: THREE.Object3D[] = [];
    for (let k = 0; k < n; k++) {
      const l = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), lantern);
      body.scale.y = 1.2;
      const halo = new THREE.Sprite(additive(glow, 0xff6a40));
      halo.scale.setScalar(3);
      l.add(body, halo);
      l.position.set((rand() - 0.5) * 6, 4 + rand() * 8, (rand() - 0.5) * 6);
      t.add(l);
      ls.push(l);
    }
    const ph = rand() * 10;
    const base = ls.map((l) => l.position.y);
    animated.push((time) => ls.forEach((l, k) => (l.position.y = base[k] + Math.sin(time * 0.8 + ph + k) * 0.8)));
    return place(t, x, z, rand);
  };
  const pavilion: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 8), lacquer);
      pillar.position.set(px, 2, pz);
      t.add(pillar);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 5;
    const base = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.6, 5.5), marble);
    base.position.y = 0.2;
    t.add(roof, base);
    return place(t, x, z, rand);
  };
  // "White rabbit beside": the jade rabbit, pounding the elixir in its mortar.
  const rabbit: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), white);
    body.scale.set(0.9, 1.1, 1);
    body.position.y = 1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), white);
    head.position.set(0, 2.2, 0.3);
    t.add(body, head);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 1, 4, 8), white);
      ear.position.set(side * 0.25, 3.1, 0.2);
      ear.rotation.z = side * 0.15;
      t.add(ear);
    }
    const mortar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 0.9, 10), jade);
    mortar.position.set(0, 0.45, 1.6);
    const pestle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2, 6), bark);
    t.add(mortar, pestle);
    const ph = rand() * 10;
    animated.push((time) => pestle.position.set(0, 1.6 + Math.abs(Math.sin(time * 3 + ph)) * 0.8, 1.6));
    return place(t, x, z, rand);
  };
  const crater: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 3 + rand() * 6;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.18, 6, 20), dust);
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = 0.5;
    t.add(rim);
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [4, osmanthus],
      [3, lanterns],
      [2, pavilion],
      [2, rabbit],
      [3, crater],
    ])(x, z, rand);
}

/** Gilgamesh: date palms and reeds, cedars, trees of gemstones, giant scorpions, and mud-brick houses. */
export function urukFeature(animated: Animated): Feature {
  const trunk = lambert(0x6a5034);
  const frond = lambert(0x5a7a34, { side: THREE.DoubleSide, flatShading: true });
  const reed = lambert(0x9a8a50);
  const cedar = lambert(0x2a4a2a, { flatShading: true });
  const brick = lambert(0xb48a5a);
  const gems = [0x40e0ff, 0xff40a0, 0x60ff80, 0xffd040, 0xa060ff].map((c) => glowing(c, 0.9));
  const shell = glossy(0x2a1a10, 60);
  const glazed = new THREE.MeshLambertMaterial({ map: glazedTex() });
  const glow = glowTex();
  const palm: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 8 + rand() * 6;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, h, 6), trunk);
    tr.position.y = h / 2;
    t.add(tr);
    for (let k = 0; k < 7; k++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1, 5), frond);
      f.position.y = h;
      f.rotation.set(-1.0, (k / 7) * Math.PI * 2, 0);
      f.translateY(2.2);
      t.add(f);
    }
    return place(t, x, z, rand);
  };
  const reeds: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 8 + Math.floor(rand() * 8);
    for (let k = 0; k < n; k++) {
      const h = 1.5 + rand() * 2;
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, h, 4), reed);
      r.position.set((rand() - 0.5) * 3, h / 2, (rand() - 0.5) * 3);
      r.rotation.z = (rand() - 0.5) * 0.4;
      t.add(r);
    }
    return place(t, x, z, rand);
  };
  const cedarTree: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 14 + rand() * 10;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, h * 0.5, 7), trunk);
    tr.position.y = h * 0.25;
    t.add(tr);
    // A cedar's flat tiers.
    for (let k = 0; k < 4; k++) {
      const tier = new THREE.Mesh(new THREE.CylinderGeometry(1 + (3 - k) * 0.8, 1.6 + (3 - k) * 1.1, 1.2, 9), cedar);
      tier.position.y = h * (0.4 + k * 0.15);
      t.add(tier);
    }
    return place(t, x, z, rand);
  };
  // "Gemstone trees": the garden of the gods past the mountain, its fruit precious stones.
  const gemTree: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 5 + rand() * 4;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, h, 6), trunk);
    tr.position.y = h / 2;
    t.add(tr);
    const fruit: THREE.Object3D[] = [];
    for (let k = 0; k < 9; k++) {
      const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.5 + rand() * 0.4, 0), gems[Math.floor(rand() * gems.length)]);
      g.position.set((rand() - 0.5) * 4, h + (rand() - 0.3) * 2.5, (rand() - 0.5) * 4);
      t.add(g);
      fruit.push(g);
    }
    const halo = new THREE.Sprite(additive(glow, 0x80c0ff));
    halo.scale.set(9, 7, 1);
    halo.position.y = h;
    t.add(halo);
    const ph = rand() * 10;
    animated.push((time) => fruit.forEach((g, k) => (g.rotation.y = time * 0.8 + k + ph)));
    return place(t, x, z, rand);
  };
  // "The passing scorpions guarding": a scorpion as big as a car, its tail raised.
  const scorpion: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), shell);
    body.scale.set(1, 0.5, 1.6);
    body.position.y = 0.9;
    t.add(body);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.8, 5), shell);
        leg.position.set(side * 1.4, 0.6, -1 + k * 0.7);
        leg.rotation.z = side * 1.0;
        t.add(leg);
      }
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), shell);
      claw.scale.set(0.7, 0.5, 1.4);
      claw.position.set(side * 0.9, 0.9, 2.8);
      t.add(claw);
    }
    const tail = new THREE.Group();
    tail.position.set(0, 1, -2);
    let link: THREE.Object3D = tail;
    for (let k = 0; k < 5; k++) {
      const seg = new THREE.Group();
      seg.position.y = k ? 0.7 : 0;
      seg.rotation.x = -0.45;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), shell);
      m.position.y = 0.35;
      seg.add(m);
      link.add(seg);
      link = seg;
    }
    const sting = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 6), shell);
    sting.position.y = 0.9;
    link.add(sting);
    t.add(tail);
    const ph = rand() * 10;
    animated.push((time) => (tail.rotation.x = Math.sin(time * 1.5 + ph) * 0.15));
    t.scale.setScalar(1.5 + rand());
    return place(t, x, z, rand);
  };
  const house: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 5 + rand() * 4;
    const h = 3 + rand() * 3;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), rand() > 0.8 ? glazed : brick);
    box.position.y = h / 2;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2), lambert(0x2a1a10));
    door.position.set(0, 1, w * 0.4 + 0.01);
    t.add(box, door);
    return place(t, x, z, rand);
  };
  return (x, z, rand) =>
    pick(rand, [
      [4, palm],
      [4, reeds],
      [2, cedarTree],
      [2, gemTree],
      [2, scorpion],
      [2, house],
    ])(x, z, rand);
}

/** Theia's gate: two spires of black glass, the silver cord slung between them over the road, glowing, a spark running along it. */
export function cordGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const glass = glossy(0x14121a, 140);
  for (const side of [-1, 1]) {
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2, 22, 5), glass);
    spire.position.set(side * (hw + 1.5), 11, 0);
    g.add(spire);
  }
  const silver = new THREE.MeshLambertMaterial({ color: 0xe8f0ff, emissive: 0xc8d8ff, emissiveIntensity: 1 });
  const cord = cordBetween(new THREE.Vector3(-(hw + 1.5), 17, 0), new THREE.Vector3(hw + 1.5, 17, 0), 4, 0.35, silver);
  g.add(cord);
  sign(g, 'THEIA', '#140a08', '#e8f0ff', hw * 1.1, 8.5);
  const spark = new THREE.Sprite(additive(glowTex(), 0xffffff));
  spark.scale.setScalar(4);
  g.add(spark);
  animated.push((time) => {
    const u = (time * 0.5) % 1;
    const x = -(hw + 1.5) + u * 2 * (hw + 1.5);
    spark.position.set(x, 17 - 4 * Math.sin(u * Math.PI), 0);
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * Theia herself: a planet the size of Mars hung huge over the young Earth,
 * coming on (a ticking clock), turning, debris already streaming off it.
 */
export function theiaPlanet(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const R = 90;
  const map = tex.marsTexture();
  const planet = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), new THREE.MeshLambertMaterial({ map, color: 0xffb070, emissive: 0x3a1408, emissiveIntensity: 0.6 }));
  const halo = new THREE.Sprite(additive(glowTex(), 0xffa050));
  halo.scale.setScalar(R * 3);
  const ring = new THREE.Mesh(new THREE.RingGeometry(R * 1.3, R * 1.9, 64), new THREE.MeshBasicMaterial({ color: 0xffc080, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = Math.PI / 2.4;
  g.add(halo, planet, ring);
  const H = 190;
  animated.push((time) => {
    // Coming on, slowly, and back: each pass a little closer, then gone round again.
    const u = (time / 240) % 1;
    const k = 0.85 + 0.35 * u;
    planet.scale.setScalar(k);
    halo.scale.setScalar(R * 3 * k);
    planet.rotation.y = time * 0.03;
    ring.rotation.z = time * 0.02;
    g.position.y = H - u * 30;
  });
  g.position.set(at.x, H, at.z);
  return g;
}

/** Set's gate: an Egyptian pylon over the road, the god's head on each tower, the sun's disc and the moon's over the lintel. */
export function setGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const wall = new THREE.MeshLambertMaterial({ map: templeTex() });
  for (const side of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 5, 16, 4), wall);
    tower.rotation.y = Math.PI / 4;
    tower.position.set(side * (hw + 3.5), 8, 0);
    const god = setAnimal(5, lambert(0x2a2428), glowing(0xffc030, 1), glowing(0xe0e8ff, 1));
    god.position.set(side * (hw + 3.5), 16, 0);
    god.rotation.y = Math.PI;
    g.add(tower, god);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 6, 2.5, 3), wall);
  lintel.position.y = 13;
  g.add(lintel);
  sign(g, 'SET', '#1a2a6a', '#ffe090', hw * 0.9, 10);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), glowing(0xffc030, 1));
  sun.position.set(-3, 16.5, -1.6);
  sun.rotation.y = Math.PI;
  const moon = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), glowing(0xe0e8ff, 1));
  moon.position.set(3, 16.5, -1.6);
  moon.rotation.y = Math.PI;
  g.add(sun, moon);
  animated.push((time) => {
    const k = 0.5 + 0.5 * Math.sin(time * 0.8);
    (sun.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.5 + k;
    (moon.material as THREE.MeshLambertMaterial).emissiveIntensity = 1.5 - k;
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Set himself, a colossus sat in the desert, his right eye the sun and his left the moon, sand streaming off him. */
export function setColossus(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const sunEye = glowing(0xffc030, 1.2);
  const moonEye = glowing(0xe0e8ff, 1.2);
  const god = setAnimal(70, lambert(0x3a2e30), sunEye, moonEye);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(40, 8, 56), new THREE.MeshLambertMaterial({ map: templeTex() }));
  plinth.position.y = 4;
  god.position.y = 8;
  g.add(plinth, god);
  const sunGlow = new THREE.Sprite(additive(glowTex(), 0xffb030));
  sunGlow.scale.setScalar(18);
  sunGlow.position.set(-4.3, 8 + 63, 14);
  const moonGlow = new THREE.Sprite(additive(glowTex(), 0xd0e0ff));
  moonGlow.scale.setScalar(18);
  moonGlow.position.set(4.3, 8 + 63, 14);
  g.add(sunGlow, moonGlow);
  animated.push((time) => {
    // Day squeezed into night and back: one eye brightens as the other dims.
    const k = 0.5 + 0.5 * Math.sin(time * 0.35);
    sunGlow.material.opacity = 0.3 + 0.7 * k;
    moonGlow.material.opacity = 1 - 0.7 * k;
  });
  g.position.set(at.x, 0, at.z);
  // Facing the road.
  g.rotation.y = at.heading + (lateral > 0 ? -Math.PI / 2 : Math.PI / 2);
  return g;
}

/** Chang'e's gate: a round moon gate of glowing jade over the road, a gold rim, the way through to the Moon. */
export function jadePortal(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const R = hw + 1;
  const jade = new THREE.MeshPhongMaterial({ color: 0x30b080, emissive: 0x108050, emissiveIntensity: 0.6, shininess: 120, specular: 0xd0fff0 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 1.4, 12, 48), jade);
  ring.position.y = R * 0.55;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 1.5, 0.35, 8, 48), glossy(0xe0b040, 80));
  rim.position.y = R * 0.55;
  g.add(ring, rim);
  sign(g, "CHANG'E", '#0a0a2a', '#ffe8a0', hw * 1.0, R * 0.55 + R + 3.5);
  const veil = new THREE.Sprite(additive(glowTex(), 0x60ffb0));
  veil.scale.set(R * 2.2, R * 1.4, 1);
  veil.position.y = R * 0.55;
  g.add(veil);
  animated.push((time) => {
    veil.material.opacity = 0.25 + 0.15 * Math.sin(time * 1.6);
    ring.rotation.z = Math.sin(time * 0.3) * 0.05;
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The palace amongst the stars: tier on tier of red pillars and green roofs on a hill of the Moon, the osmanthus beside it and lanterns rising. */
export function moonPalace(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const hill = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0xb0b0bc));
  hill.scale.y = 0.35;
  g.add(hill);
  const lacquer = lambert(0xb01c24);
  const roof = lambert(0x206a5a, { flatShading: true });
  const gold = glossy(0xe0b040, 80);
  let y = 24;
  for (let k = 0; k < 5; k++) {
    const w = 34 - k * 6;
    const h = 8 - k * 0.6;
    const hall = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.7), lacquer);
    hall.position.y = y + h / 2;
    const eave = new THREE.Mesh(new THREE.ConeGeometry(w * 0.85, 4, 4), roof);
    eave.rotation.y = Math.PI / 4;
    eave.scale.z = 0.7;
    eave.position.y = y + h + 1.6;
    g.add(hall, eave);
    y += h + 3;
  }
  const finial = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 10), gold);
  finial.position.y = y + 1.5;
  g.add(finial);
  const lanterns: THREE.Sprite[] = [];
  for (let k = 0; k < 14; k++) {
    const l = new THREE.Sprite(additive(glowTex(), 0xff6a40));
    l.scale.setScalar(4);
    g.add(l);
    lanterns.push(l);
  }
  animated.push((time) =>
    lanterns.forEach((l, k) => {
      const u = (time * 0.02 + k / lanterns.length) % 1;
      const a = k * 2.4;
      l.position.set(Math.cos(a) * (30 + u * 30), 20 + u * 120, Math.sin(a) * (30 + u * 30));
      l.material.opacity = Math.sin(u * Math.PI);
    }),
  );
  g.position.set(at.x, -2, at.z);
  return g;
}

/** Uruk's gate: two towers of blue glazed brick, lions striding along them, crenellated, over the road. */
export function urukGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const glazed = new THREE.MeshLambertMaterial({ map: glazedTex() });
  const brick = lambert(0xb48a5a);
  for (const side of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(7, 18, 8), glazed);
    tower.position.set(side * (hw + 3.5), 9, 0);
    g.add(tower);
    for (let k = 0; k < 3; k++) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 8), brick);
      merlon.position.set(side * (hw + 3.5) - 2.4 + k * 2.4, 18.8, 0);
      g.add(merlon);
    }
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(hw, 1.2, 8, 24, Math.PI), glazed);
  arch.position.y = 10;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 2, 3, 8), glazed);
  lintel.position.y = 15;
  g.add(arch, lintel);
  sign(g, 'GILGAMESH', '#1a2a5a', '#ffd890', hw * 1.2, 15);
  const fires: THREE.Sprite[] = [];
  for (const side of [-1, 1]) {
    const fire = new THREE.Sprite(additive(glowTex(), 0xff9030));
    fire.position.set(side * (hw + 3.5), 21, 0);
    g.add(fire);
    fires.push(fire);
  }
  animated.push((time) => fires.forEach((fl, k) => fl.scale.setScalar(4 + Math.sin(time * 9 + k) * 0.8)));
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Uruk's ziggurat: a stepped mountain of brick, a stair up its face, a fire burning at the shrine on top; the storm's lightning behind it. */
export function ziggurat(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const brick = lambert(0xb48a5a);
  const glazed = new THREE.MeshLambertMaterial({ map: glazedTex() });
  let y = 0;
  for (let k = 0; k < 4; k++) {
    const w = 110 - k * 24;
    const h = 16 - k * 2;
    const tier = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), k === 3 ? glazed : brick);
    tier.position.y = y + h / 2;
    g.add(tier);
    y += h;
  }
  const stair = new THREE.Mesh(new THREE.BoxGeometry(10, y * 1.15, 4), lambert(0xc8a070));
  stair.position.set(0, y / 2, 44);
  stair.rotation.x = -0.75;
  g.add(stair);
  const shrine = new THREE.Mesh(new THREE.BoxGeometry(18, 10, 14), glazed);
  shrine.position.y = y + 5;
  g.add(shrine);
  const fire = new THREE.Sprite(additive(glowTex(), 0xff8a30));
  fire.position.y = y + 14;
  g.add(fire);
  animated.push((time) => fire.scale.setScalar(16 + Math.sin(time * 7) * 3 + Math.sin(time * 13) * 2));
  g.position.set(at.x, -1, at.z);
  g.rotation.y = at.heading;
  return g;
}
