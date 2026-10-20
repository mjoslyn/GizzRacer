import * as THREE from 'three';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import * as tex from './textures';

/**
 * Scenery and landmarks for the Omnium Gatherum Cup's worlds: the glowing
 * mountain (Magenta Mountain), the ocean planet (Kepler-22b), the garden
 * seen from a goblin's height (Goblin Garden) and the primeval coast where
 * the pliosaur hunts (Predator X).
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type Animated = ((time: number) => void)[];

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const additive = (map: THREE.Texture, color: number) => new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false });
const glowing = (color: number, intensity = 0.7) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: intensity, flatShading: true });

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

/** A cluster of long crystal points, glowing. */
function crystalCluster(mats: THREE.Material[], rand: () => number, size: number): THREE.Group {
  const t = new THREE.Group();
  const n = 3 + Math.floor(rand() * 5);
  for (let k = 0; k < n; k++) {
    const h = size * (0.6 + rand());
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mats[k % mats.length]);
    c.scale.set(h * 0.22, h, h * 0.22);
    c.position.set((rand() - 0.5) * size, h * 0.6, (rand() - 0.5) * size);
    c.rotation.set((rand() - 0.5) * 0.7, rand() * 3, (rand() - 0.5) * 0.7);
    t.add(c);
  }
  return t;
}

/** Magenta Mountain: crystal clusters, pines under pink snow, glowing orbs drifting, magenta boulders. */
export function peaksFeature(rockMat: THREE.Material, animated: Animated): Feature {
  const crystalMats = [glowing(0xff4ad0, 0.6), glowing(0xc040ff, 0.6), glowing(0xffa0f0, 0.5)];
  const pine = lambert(0x3a2a5a, { flatShading: true });
  const snow = lambert(0xffd8f4, { flatShading: true });
  const bark = lambert(0x4a2a3a);
  const glow = tex.glowTexture();
  const crystals: Feature = (x, z, rand) => place(crystalCluster(crystalMats, rand, 2 + rand() * 4), x, z, rand);
  const pines: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 5 + rand() * 6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, h * 0.3, 6), bark);
    trunk.position.y = h * 0.15;
    t.add(trunk);
    for (let k = 0; k < 3; k++) {
      const tier = new THREE.Mesh(new THREE.ConeGeometry(h * (0.32 - k * 0.07), h * 0.4, 8), k === 2 ? snow : pine);
      tier.position.y = h * (0.35 + k * 0.22);
      t.add(tier);
    }
    return place(t, x, z, rand);
  };
  const orbs: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const sprites: THREE.Sprite[] = [];
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Sprite(additive(glow, k % 2 ? 0xff6ad8 : 0xb070ff));
      s.scale.setScalar(1.5 + rand() * 1.5);
      t.add(s);
      sprites.push(s);
    }
    const ph = rand() * 6;
    animated.push((time) => sprites.forEach((s, k) => s.position.set(Math.sin(time * 0.3 + k * 1.7 + ph) * 4, 3 + Math.sin(time * 0.7 + k + ph) * 1.5 + k, Math.cos(time * 0.25 + k * 2 + ph) * 4)));
    t.position.set(x, 0, z);
    return t;
  };
  const boulder: Feature = (x, z, rand) => {
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(2 + rand() * 3, 0), rockMat);
    b.scale.y = 0.7;
    b.position.y = 1;
    const t = new THREE.Group();
    t.add(b);
    if (rand() < 0.5) {
      const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 0), snow);
      cap.scale.set(1.2, 0.4, 1.2);
      cap.position.y = 2.6;
      t.add(cap);
    }
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[2, crystals], [3, pines], [1, orbs], [1, boulder]])(x, z, rand);
}

/** Kepler-22b: towers of glowing kelp, coral fans, jellyfish floating over the shallows, spiral shells. */
export function alienSeaFeature(animated: Animated): Feature {
  const kelp = glowing(0x4affc8, 0.45);
  const coral = [glowing(0xff6ab0, 0.3), glowing(0xb06aff, 0.3), glowing(0xffb04a, 0.3)];
  const jelly = new THREE.MeshLambertMaterial({ color: 0xc8a0ff, emissive: 0x8a4aff, emissiveIntensity: 0.6, transparent: true, opacity: 0.7 });
  const shell = lambert(0xf0d8c0, { flatShading: true });
  const kelpTower: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 3 + Math.floor(rand() * 4);
    const stalks: THREE.Mesh[] = [];
    for (let k = 0; k < n; k++) {
      const h = 6 + rand() * 10;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, h, 5), kelp);
      st.position.set((rand() - 0.5) * 3, h / 2, (rand() - 0.5) * 3);
      t.add(st);
      stalks.push(st);
    }
    const ph = rand() * 6;
    animated.push((time) => stalks.forEach((st, k) => (st.rotation.z = Math.sin(time * 0.8 + k + ph) * 0.12)));
    return place(t, x, z, rand);
  };
  const fan: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const f = new THREE.Mesh(new THREE.CircleGeometry(1.5 + rand() * 2, 10, 0, Math.PI), coral[k % coral.length]);
      (f.material as THREE.Material).side = THREE.DoubleSide;
      f.position.set((rand() - 0.5) * 3, 0.2, (rand() - 0.5) * 3);
      f.rotation.y = rand() * 3;
      t.add(f);
    }
    return place(t, x, z, rand);
  };
  const jellies: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const bells: THREE.Mesh[] = [];
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1 + rand(), 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), jelly);
      t.add(b);
      bells.push(b);
    }
    const ph = rand() * 6;
    animated.push((time) =>
      bells.forEach((b, k) => {
        b.position.set(Math.sin(time * 0.2 + k * 2 + ph) * 3, 4 + k * 2 + Math.sin(time * 1.4 + k + ph) * 0.8, Math.cos(time * 0.2 + k * 2 + ph) * 3);
        b.scale.y = 1 + Math.sin(time * 3 + k + ph) * 0.2;
      }),
    );
    t.position.set(x, 0, z);
    return t;
  };
  const spiral: Feature = (x, z, rand) => {
    const s = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2 + rand(), 0.5, 40, 8, 1, 3), shell);
    s.position.y = 1.2;
    const t = new THREE.Group();
    t.add(s);
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[3, kelpTower], [2, fan], [1.2, jellies], [0.8, spiral]])(x, z, rand);
}

/** A garden goblin statue: pointed red hat, a beard, a little round body. */
export function goblinFigure(scale: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 10), lambert(0x3a7a3a));
  body.scale.y = 1.2;
  body.position.y = 0.9;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), lambert(0x9ac87a));
  head.position.y = 2.1;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 12), lambert(0xd8302a));
  hat.position.y = 3.1;
  hat.rotation.z = 0.2;
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 10), lambert(0xf4f0e8));
  beard.position.set(0, 1.6, 0.35);
  beard.rotation.x = Math.PI;
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
    eye.position.set(side * 0.2, 2.2, 0.5);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.6, 6), lambert(0x9ac87a));
    ear.position.set(side * 0.6, 2.2, 0);
    ear.rotation.z = -side * 1.2;
    g.add(eye, ear);
  }
  g.add(body, head, hat, beard);
  g.scale.setScalar(scale);
  return g;
}

/** The Garden Goblin: flowers taller than a house, toadstools, flower pots, a watering can, goblins standing about, snails. */
export function gardenFeature(animated: Animated): Feature {
  const stem = lambert(0x3a8a2a);
  const petals = [0xff5a7a, 0xffd23a, 0xffffff, 0xb07aff, 0xff8a2a].map((c) => lambert(c, { side: THREE.DoubleSide }));
  const centre = lambert(0xffb020);
  const capRed = lambert(0xd8302a);
  const spots = lambert(0xffffff);
  const stalk = lambert(0xf0e8d0);
  const terracotta = lambert(0xc0603a);
  const tin = lambert(0x6a8aa0, { flatShading: true });
  const snailShell = lambert(0xb07a3a, { flatShading: true });
  const flower: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 7 + rand() * 9;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, h, 6), stem);
    st.position.y = h / 2;
    const head = new THREE.Group();
    head.position.y = h;
    head.rotation.x = 0.4;
    const mat = petals[Math.floor(rand() * petals.length)];
    for (let k = 0; k < 8; k++) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(1.4, 8), mat);
      p.scale.set(0.5, 1, 1);
      p.position.set(Math.cos((k / 8) * Math.PI * 2) * 1.5, Math.sin((k / 8) * Math.PI * 2) * 1.5, 0);
      p.rotation.z = (k / 8) * Math.PI * 2 - Math.PI / 2;
      head.add(p);
    }
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), centre);
    c.scale.z = 0.5;
    head.add(c);
    t.add(st, head);
    const ph = rand() * 6;
    animated.push((time) => (head.rotation.z = Math.sin(time * 0.6 + ph) * 0.1));
    return place(t, x, z, rand);
  };
  const toadstool: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 3 + rand() * 4;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, h, 10), stalk);
    s.position.y = h / 2;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(h * 0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), capRed);
    cap.position.y = h;
    t.add(s, cap);
    for (let k = 0; k < 6; k++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.22 * h * 0.3, 6, 4), spots);
      const a = k * 1.1;
      d.position.set(Math.cos(a) * h * 0.35, h + h * 0.35, Math.sin(a) * h * 0.35);
      t.add(d);
    }
    return place(t, x, z, rand);
  };
  const pot: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(3, 2.2, 4, 14, 1, true), terracotta);
    (p.material as THREE.Material).side = THREE.DoubleSide;
    p.position.y = 2;
    p.rotation.z = rand() < 0.3 ? Math.PI / 2 : 0;
    if (p.rotation.z) p.position.y = 2.6;
    t.add(p);
    return place(t, x, z, rand);
  };
  const can: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 5, 16), tin);
    body.position.y = 2.5;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 7, 8), tin);
    spout.position.set(4, 4, 0);
    spout.rotation.z = -1;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(2, 0.3, 6, 16, Math.PI), tin);
    handle.position.y = 5;
    t.add(body, spout, handle);
    return place(t, x, z, rand);
  };
  const goblin: Feature = (x, z, rand) => place(goblinFigure(1.4 + rand()), x, z, rand);
  const snail: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.55, 8, 16), snailShell);
    shell.position.y = 1.3;
    const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 2.2, 4, 8), lambert(0xa0b080));
    foot.rotation.z = Math.PI / 2;
    foot.position.y = 0.4;
    t.add(shell, foot);
    const ph = rand() * 6;
    animated.push((time) => (t.position.x = x + Math.sin(time * 0.05 + ph) * 3));
    t.position.set(x, 0, z);
    t.rotation.y = rand() * 6;
    return t;
  };
  return (x, z, rand) => pick(rand, [[4, flower], [2, toadstool], [1, pot], [0.4, can], [1, goblin], [0.6, snail]])(x, z, rand);
}

/** Predator X: tree ferns and cycads, ammonite shells, sea stacks, pterosaurs wheeling, bones on the sand. */
export function shoreFeature(rockMat: THREE.Material, animated: Animated): Feature {
  const trunk = lambert(0x4a3a2a, { flatShading: true });
  const frond = lambert(0x3a7a2a, { side: THREE.DoubleSide, flatShading: true });
  const shell = lambert(0xd8b890, { flatShading: true });
  const bone = lambert(0xe8dcc0);
  const wing = lambert(0x5a3a2a, { side: THREE.DoubleSide });
  const fern: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 3 + rand() * 5;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, h, 7), trunk);
    tr.position.y = h / 2;
    t.add(tr);
    for (let k = 0; k < 8; k++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.4), frond);
      f.position.y = h;
      f.rotation.set(-1, (k / 8) * Math.PI * 2, 0);
      f.translateY(1.5);
      t.add(f);
    }
    return place(t, x, z, rand);
  };
  const ammonite: Feature = (x, z, rand) => {
    const a = new THREE.Mesh(new THREE.TorusGeometry(1.5 + rand() * 2, 0.7, 8, 24, Math.PI * 1.8), shell);
    a.position.y = 1.5;
    const t = new THREE.Group();
    t.add(a);
    return place(t, x, z, rand);
  };
  const stack: Feature = (x, z, rand) => {
    const h = 8 + rand() * 12;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.5 + rand(), 3 + rand() * 2, h, 7), rockMat);
    col.position.y = h / 2 - 1;
    const t = new THREE.Group();
    t.add(col);
    return place(t, x, z, rand);
  };
  const pterosaurs: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const birds: THREE.Group[] = [];
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Group();
      const l = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2), wing);
      l.position.x = 1.5;
      const r = l.clone();
      r.position.x = -1.5;
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.6, 4), bone);
      beak.rotation.x = Math.PI / 2;
      b.add(l, r, beak);
      t.add(b);
      birds.push(b);
    }
    const ph = rand() * 6;
    animated.push((time) =>
      birds.forEach((b, k) => {
        const a = time * 0.25 + k * 2.1 + ph;
        b.position.set(Math.cos(a) * 14, 18 + k * 3 + Math.sin(time + k) * 2, Math.sin(a) * 14);
        b.rotation.y = -a;
        const flap = Math.sin(time * 4 + k) * 0.5;
        b.children[0].rotation.z = flap;
        b.children[1].rotation.z = -flap;
      }),
    );
    t.position.set(x, 0, z);
    return t;
  };
  const bones: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 6, 12, Math.PI * 0.8), bone);
      rib.position.set(k * 1.1, 0.1, 0);
      rib.rotation.set(0, Math.PI / 2, 0.3);
      t.add(rib);
    }
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[3, fern], [1, ammonite], [1.5, stack], [0.6, pterosaurs], [0.8, bones]])(x, z, rand);
}

/** A sign over the road, facing the karts coming. */
function sign(g: THREE.Group, text: string, bg: string, fg: string, width: number, y: number): void {
  const map = tex.billboardTexture(text, bg, fg);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.25), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
  m.position.y = y;
  m.rotation.y = Math.PI;
  g.add(m);
}

/** Magenta Mountain's gate: two towers of crystal leaning in over the road, pulsing. */
export function crystalGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const mats = [glowing(0xff4ad0, 0.6), glowing(0xc040ff, 0.6)];
  for (const side of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mats[side > 0 ? 0 : 1]);
    c.scale.set(2.2, 9, 2.2);
    c.position.set(side * (hw + 1), 7, 0);
    c.rotation.z = side * 0.25;
    g.add(c);
  }
  sign(g, 'MAGENTA MOUNTAIN', '#8a1a8a', '#ffd0f0', hw * 1.2, 11);
  animated.push((time) => mats.forEach((m, k) => (m.emissiveIntensity = 0.45 + 0.3 * Math.sin(time * 2 + k * Math.PI))));
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The mountain itself, in the middle of the circuit: a magenta cone streaked with pink snow, a crystal crown glowing at the summit. */
export function magentaPeak(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pointAt(ribbon.spline, s);
  const rock = new THREE.MeshLambertMaterial({ map: tex.stoneTexture([130, 40, 120], [220, 110, 200]), flatShading: true });
  const snow = lambert(0xffd8f4, { flatShading: true });
  const peak = new THREE.Mesh(new THREE.ConeGeometry(60, 110, 9), rock);
  peak.position.y = 50;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(24, 40, 9), snow);
  cap.position.y = 92;
  g.add(peak, cap);
  const crown = crystalCluster([glowing(0xff4ad0, 0.9), glowing(0xc040ff, 0.9)], () => 0.5, 10);
  crown.position.y = 108;
  g.add(crown);
  const halo = new THREE.Sprite(additive(tex.glowTexture(), 0xff6ad8));
  halo.scale.setScalar(70);
  halo.position.y = 112;
  g.add(halo);
  animated.push((time) => halo.scale.setScalar(64 + Math.sin(time * 0.8) * 8));
  g.position.set(p.x - p.tz * lateral, -6, p.z + p.tx * lateral);
  return g;
}

/** Kepler-22b's gate: an arch of alien coral with glowing orbs hanging from it. */
export function keplerArch(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const coral = glowing(0xff6ab0, 0.35);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(hw + 1, 1.2, 10, 32, Math.PI), coral);
  g.add(arch);
  const glow = tex.glowTexture();
  const orbs: THREE.Sprite[] = [];
  for (let k = 1; k < 6; k++) {
    const a = (k / 6) * Math.PI;
    const o = new THREE.Sprite(additive(glow, k % 2 ? 0x7affe0 : 0xc06aff));
    o.scale.setScalar(2.4);
    o.position.set(Math.cos(a) * (hw + 1), Math.sin(a) * (hw + 1) - 1.5, 0);
    g.add(o);
    orbs.push(o);
  }
  sign(g, 'KEPLER-22B', '#0a3a5a', '#9affe8', hw * 1.1, hw - 1);
  animated.push((time) => orbs.forEach((o, k) => o.scale.setScalar(2.2 + Math.sin(time * 2 + k) * 0.4)));
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The Goblin Garden's gate: a rose-covered trellis arch, a giant goblin peering round the side of it. */
export function goblinGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const wood = lambert(0xf4f0e8);
  const leaf = lambert(0x3a8a2a, { flatShading: true });
  const rose = lambert(0xff3a6a);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 10, 0.6), wood);
    post.position.set(side * (hw + 0.5), 5, 0);
    g.add(post);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(hw + 0.5, 0.35, 6, 24, Math.PI), wood);
  arch.position.y = 10;
  g.add(arch);
  for (let k = 0; k < 18; k++) {
    const a = (k / 17) * Math.PI;
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), k % 3 ? leaf : rose);
    l.position.set(Math.cos(a) * (hw + 0.5), 10 + Math.sin(a) * (hw + 0.5), (k % 2) * 0.6 - 0.3);
    g.add(l);
  }
  sign(g, 'GOBLIN GARDEN', '#2a7a2a', '#fff4c0', hw * 1.1, 8);
  const peek = goblinFigure(4);
  peek.position.set(hw + 6, 0, -3);
  peek.rotation.y = -0.8;
  g.add(peek);
  animated.push((time) => (peek.rotation.z = Math.sin(time * 0.9) * 0.12));
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Predator X's gate: the skull of a pliosaur reared over the road, jaws open, the teeth longer than a kart. */
export function jawsGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const bone = new THREE.MeshPhongMaterial({ color: 0xe8dcc0, shininess: 20, flatShading: true });
  const dark = new THREE.MeshBasicMaterial({ color: 0x1a0a04 });
  // Upper jaw over the road, lower jaw's two halves the posts either side.
  const upper = new THREE.Group();
  upper.position.y = 11;
  const skull = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 4, 3, 7), bone);
  upper.add(skull);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(3.4, 14, 6), bone);
  snout.rotation.x = Math.PI / 2;
  snout.position.z = -9;
  upper.add(snout);
  for (let k = 0; k < 9; k++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.2, 5), bone);
    tooth.position.set(((k / 8) - 0.5) * (hw * 2 + 2), -2.8, -2.5);
    tooth.rotation.x = Math.PI;
    upper.add(tooth);
  }
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), dark);
    eye.position.set(side * (hw * 0.6), 1, -1);
    upper.add(eye);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(2.2, 10, 3), bone);
    jaw.position.set(side * (hw + 1.5), 5, 0);
    g.add(jaw);
    for (let k = 0; k < 3; k++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.6, 5), bone);
      tooth.position.set(side * (hw + 0.3), 3 + k * 2.6, -1);
      tooth.rotation.z = side * Math.PI / 2;
      g.add(tooth);
    }
  }
  g.add(upper);
  sign(g, 'PREDATOR X', '#3a2a20', '#ffb060', hw * 1.1, 15);
  animated.push((time) => (upper.rotation.x = -0.08 - Math.max(0, Math.sin(time * 0.7)) * 0.12));
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}
