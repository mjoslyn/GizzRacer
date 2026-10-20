import * as THREE from 'three';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import * as tex from './textures';

/**
 * Scenery and landmarks for the Phantom Island Cup's worlds: the island in
 * the mist (Phantom Island), the cliff-top airfield (Deadstick Drop), the
 * forest that is awake (Panpsych Grove) and the black sea at night (Sea of
 * Doubt).
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type Animated = ((time: number) => void)[];

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const additive = (map: THREE.Texture, color: number) => new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false });

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

/** A pair of eyes, white with dark pupils, on `parent` at `y`, `gap` apart and facing +z. Returns the pupils, to look about with. */
function eyes(parent: THREE.Object3D, y: number, z: number, gap: number, size: number, white: THREE.Material, dark: THREE.Material): THREE.Mesh[] {
  const pupils: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), white);
    ball.position.set((side * gap) / 2, y, z);
    ball.scale.z = 0.5;
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(size * 0.45, 10, 6), dark);
    pupil.position.z = size * 0.9;
    ball.add(pupil);
    parent.add(ball);
    pupils.push(pupil);
  }
  return pupils;
}

/** Pupils glancing about on their own clock, and a blink now and then (the eyeballs squash flat). */
function glance(pupils: THREE.Mesh[], animated: Animated, ph: number, size: number): void {
  animated.push((time) => {
    const lx = Math.sin(time * 0.7 + ph) * size * 0.35;
    const ly = Math.sin(time * 0.43 + ph * 2) * size * 0.2;
    const blink = ((time + ph) % 6) / 6 > 0.97;
    for (const p of pupils) {
      p.position.x = lx;
      p.position.y = ly;
      p.parent!.scale.y = blink ? 0.1 : 1;
    }
  });
}

/** Phantom Island: ruined arches, dead trees hung with lanterns, wrecks with ghost sails, standing stones, ghost lights and banks of mist. */
export function isleFeature(rockMat: THREE.Material, animated: Animated): Feature {
  const stone = new THREE.MeshLambertMaterial({ map: tex.stoneTexture([70, 74, 92], [140, 146, 170]), flatShading: true });
  const bark = lambert(0x3a3440, { flatShading: true });
  const hull = new THREE.MeshLambertMaterial({ map: tex.woodTexture(), color: 0x6a6a7a });
  const glow = tex.glowTexture();
  const lanternMat = lambert(0x2a2a30);
  const sailMat = new THREE.MeshBasicMaterial({ color: 0xbff8ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const mist = tex.glowTexture('rgba(220,230,255,0.55)', 'rgba(200,210,255,0)');
  const arch: Feature = (x, z, rand) => {
    // A ruined arch: two pillars, the lintel fallen off one of them.
    const t = new THREE.Group();
    const h = 6 + rand() * 4;
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, h * (side > 0 ? 1 : 0.7), 1.4), stone);
      pillar.position.set(side * 3, (h * (side > 0 ? 1 : 0.7)) / 2, 0);
      t.add(pillar);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1, 1.6), stone);
    lintel.position.set(0.4, h * 0.85, 0);
    lintel.rotation.z = -0.32;
    const fallen = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.2), stone);
    fallen.position.set(-4.4, 0.5, 1.6);
    fallen.rotation.y = 0.7;
    t.add(lintel, fallen);
    return place(t, x, z, rand);
  };
  const lanternTree: Feature = (x, z, rand) => {
    // A bare, twisted tree, a lantern swinging from one branch.
    const t = new THREE.Group();
    const h = 5 + rand() * 4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.5, h, 7), bark);
    trunk.position.y = h / 2;
    trunk.rotation.z = (rand() - 0.5) * 0.3;
    t.add(trunk);
    for (let k = 0; k < 4; k++) {
      const len = 1.6 + rand() * 2;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, len, 5), bark);
      branch.position.set(0, h * (0.55 + k * 0.12), 0);
      branch.rotation.set((rand() - 0.5) * 0.6, k * 1.7, 0.9 + rand() * 0.5);
      branch.translateY(len / 2);
      t.add(branch);
    }
    const pivot = new THREE.Group();
    pivot.position.set(1.4, h * 0.7, 0);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.4), lanternMat);
    lamp.position.y = -1.1;
    const light = new THREE.Sprite(additive(glow, 0x7affe0));
    light.position.y = -1.1;
    light.scale.setScalar(2.2);
    pivot.add(lamp, light);
    t.add(pivot);
    const ph = rand() * 6;
    animated.push((time) => {
      pivot.rotation.z = Math.sin(time * 1.6 + ph) * 0.25;
      light.scale.setScalar(2 + Math.sin(time * 7 + ph) * 0.3);
    });
    return place(t, x, z, rand);
  };
  const wreck: Feature = (x, z, rand) => {
    // A wreck sunk in the sand, its mast still up and a sail of light that comes and goes.
    const t = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.4, 10, 10, 1, true, 0, Math.PI), hull);
    body.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.25);
    body.position.y = 0.8;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 9, 6), hull);
    mast.position.set(0.5, 5, 0);
    mast.rotation.z = 0.2;
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), sailMat.clone());
    sail.position.set(0.9, 5.5, 0.4);
    sail.rotation.set(0, 0.3, 0.2);
    t.add(body, mast, sail);
    const ph = rand() * 6;
    const m = sail.material as THREE.MeshBasicMaterial;
    animated.push((time) => (m.opacity = 0.08 + 0.32 * Math.max(0, Math.sin(time * 0.5 + ph))));
    return place(t, x, z, rand);
  };
  const stones: Feature = (x, z, rand) => {
    // A ring of standing stones leaning every which way.
    const t = new THREE.Group();
    const n = 4 + Math.floor(rand() * 4);
    const r = 3 + rand() * 3;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const h = 2.5 + rand() * 3;
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.9 + rand() * 0.6, h, 0.6), rockMat);
      st.position.set(Math.cos(a) * r, h / 2 - 0.2, Math.sin(a) * r);
      st.rotation.set((rand() - 0.5) * 0.3, -a, (rand() - 0.5) * 0.3);
      t.add(st);
    }
    return place(t, x, z, rand);
  };
  const lights: Feature = (x, z, rand) => {
    // Ghost lights, bobbing low over the shore.
    const t = new THREE.Group();
    const n = 3 + Math.floor(rand() * 4);
    const ph = rand() * 6;
    const sprites: THREE.Sprite[] = [];
    for (let k = 0; k < n; k++) {
      const s = new THREE.Sprite(additive(glow, k % 2 ? 0x7affe0 : 0xc8a0ff));
      s.scale.setScalar(1.2 + rand());
      t.add(s);
      sprites.push(s);
    }
    animated.push((time) => {
      sprites.forEach((s, k) => {
        const a = time * 0.4 + ph + k * 1.9;
        s.position.set(Math.cos(a) * (2 + k * 0.4), 1.5 + Math.sin(time * 1.3 + k) * 0.6, Math.sin(a * 1.3) * 2.5);
      });
    });
    return place(t, x, z, rand);
  };
  const bank: Feature = (x, z, rand) => {
    // A bank of mist lying on the ground, drifting.
    const t = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mist, color: 0xd8e0ff, transparent: true, opacity: 0.55, depthWrite: false }));
      s.scale.set(16 + rand() * 10, 4 + rand() * 2, 1);
      s.position.set((rand() - 0.5) * 12, 1.5 + rand(), (rand() - 0.5) * 12);
      t.add(s);
    }
    const ph = rand() * 6;
    animated.push((time) => (t.position.x = x + Math.sin(time * 0.1 + ph) * 4));
    t.position.set(x, 0, z);
    return t;
  };
  return (x, z, rand) => pick(rand, [[1, arch], [2, lanternTree], [0.8, wreck], [1.2, stones], [1.4, lights], [1.6, bank]])(x, z, rand);
}

/** A light aircraft: fuselage, wings, tail and a propeller (returned, to spin or not). Nose along +z. */
function plane(body: THREE.Material, wing: THREE.Material, prop: THREE.Material, floats = false): { group: THREE.Group; propeller: THREE.Group } {
  const g = new THREE.Group();
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 6, 10), body);
  fuse.rotation.x = Math.PI / 2;
  fuse.position.y = 1.4;
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshPhongMaterial({ color: 0x9ad8ff, shininess: 120 }));
  cockpit.position.set(0, 1.9, 0.9);
  cockpit.scale.set(0.8, 0.6, 1.3);
  const wings = new THREE.Mesh(new THREE.BoxGeometry(9, 0.14, 1.4), wing);
  wings.position.set(0, 1.8, 0.6);
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 0.8), wing);
  tailplane.position.set(0, 1.5, -2.7);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.9), wing);
  fin.position.set(0, 2.1, -2.7);
  g.add(fuse, cockpit, wings, tailplane, fin);
  const propeller = new THREE.Group();
  propeller.position.set(0, 1.4, 3.1);
  for (const r of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.06), prop);
    blade.rotation.z = r;
    propeller.add(blade);
  }
  g.add(propeller);
  if (floats) {
    for (const side of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.2, 4.6, 8), wing);
      f.rotation.x = Math.PI / 2;
      f.position.set(side * 1.4, 0.3, 0.2);
      g.add(f);
    }
  } else {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 10), prop);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 0.9, 0.35, 1);
      g.add(wheel);
    }
  }
  return { group: g, propeller };
}

/** Deadstick Drop: hangars, planes parked and planes on floats, windsocks, a control tower, fuel tanks, and a cardboard plane that didn't make it. */
export function airstripFeature(animated: Animated): Feature {
  const tin = new THREE.MeshLambertMaterial({ map: tex.corrugatedTexture(), side: THREE.DoubleSide });
  const white = lambert(0xf4f4f0);
  const red = lambert(0xd8302a);
  const yellow = lambert(0xffc020);
  const blue = lambert(0x2a5ad0);
  const dark = lambert(0x2a2a30);
  const cardboard = lambert(0xb8885a, { flatShading: true });
  const glass = new THREE.MeshPhongMaterial({ color: 0x6ac8ff, shininess: 120, transparent: true, opacity: 0.6 });
  const steel = lambert(0x8a8e94, { flatShading: true });
  const hangar: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const len = 14 + rand() * 6;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, len, 20, 1, true, -Math.PI / 2, Math.PI), tin);
    roof.rotation.x = Math.PI / 2;
    const back = new THREE.Mesh(new THREE.CircleGeometry(6, 20, 0, Math.PI), white);
    back.position.z = -len / 2;
    back.rotation.z = 0;
    t.add(roof, back);
    // A plane rolled half out of the doors.
    const p = plane(rand() < 0.5 ? red : blue, white, dark);
    p.group.position.z = len / 2 - 1;
    t.add(p.group);
    return place(t, x, z, rand);
  };
  const parked: Feature = (x, z, rand) => {
    const colors = [red, yellow, blue, white];
    const p = plane(colors[Math.floor(rand() * colors.length)], white, dark, rand() < 0.4);
    // Some still idling, most dead still.
    if (rand() < 0.35) {
      const rate = 20 + rand() * 10;
      animated.push((time) => (p.propeller.rotation.z = time * rate));
    }
    return place(p.group, x, z, rand);
  };
  const windsock: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), white);
    pole.position.y = 3;
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.8, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0xff6a1a, side: THREE.DoubleSide }));
    sock.rotation.z = Math.PI / 2;
    sock.position.set(1.4, 5.8, 0);
    const pivot = new THREE.Group();
    pivot.add(sock);
    t.add(pole, pivot);
    const ph = rand() * 6;
    animated.push((time) => {
      pivot.rotation.y = 0.6 + Math.sin(time * 0.7 + ph) * 0.3;
      sock.rotation.x = Math.sin(time * 8 + ph) * 0.08;
    });
    t.position.set(x, 0, z);
    return t;
  };
  const tower: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 10 + rand() * 4;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(2.4, h, 2.4), white);
    shaft.position.y = h / 2;
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.2, 2.2, 8), glass);
    cab.position.y = h + 1.1;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.4, 8), dark);
    lid.position.y = h + 2.4;
    const beacon = new THREE.Sprite(additive(tex.glowTexture(), 0xff3a1a));
    beacon.position.y = h + 3;
    t.add(shaft, cab, lid, beacon);
    animated.push((time) => beacon.scale.setScalar(Math.sin(time * 4) > 0 ? 3 : 0.01));
    return place(t, x, z, rand);
  };
  const tanks: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 6, 14), k % 2 ? steel : white);
      tank.rotation.z = Math.PI / 2;
      tank.position.set(0, 1.6, k * 3.4);
      t.add(tank);
    }
    return place(t, x, z, rand);
  };
  const crashed: Feature = (x, z, rand) => {
    // A cardboard plane nose-down in the grass, a wing snapped off, its propeller stuck.
    const p = plane(cardboard, cardboard, cardboard);
    p.group.rotation.set(0.55, 0, 0.25);
    p.group.position.y = 0.6;
    const t = new THREE.Group();
    t.add(p.group);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 1.3), cardboard);
    wing.position.set(4, 0.2, -2);
    wing.rotation.y = 0.8;
    t.add(wing);
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[0.8, hangar], [2.2, parked], [1.4, windsock], [0.5, tower], [0.8, tanks], [0.9, crashed]])(x, z, rand);
}

/** Panpsych Grove: great trees with faces, humming stones that glow, mushrooms that light up, ferns and drifting pollen. Everything is watching. */
export function groveFeature(animated: Animated): Feature {
  const bark = new THREE.MeshLambertMaterial({ map: tex.woodTexture(), color: 0x7a5a3a });
  const leafs = [0x2e6a2a, 0x4a8a30, 0x6a9a2a, 0x8a7a20].map((c) => lambert(c, { flatShading: true }));
  const stone = new THREE.MeshLambertMaterial({ map: tex.stoneTexture([80, 90, 70], [150, 160, 130]), flatShading: true });
  const white = new THREE.MeshBasicMaterial({ color: 0xfff8e0 });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x1a0a04 });
  const glow = tex.glowTexture();
  const caps = [0xff6ad8, 0x6affd8, 0xffd04a].map((c) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.6 }));
  const stem = lambert(0xf0e8d0);
  const fern = lambert(0x3a8a3a, { side: THREE.DoubleSide, flatShading: true });
  const tree: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 9 + rand() * 7;
    const r = 0.9 + rand() * 0.6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 1.3, h, 9), bark);
    trunk.position.y = h / 2;
    t.add(trunk);
    for (let k = 0; k < 4; k++) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + rand() * 2, 0), leafs[Math.floor(rand() * leafs.length)]);
      crown.position.set((rand() - 0.5) * 4, h + rand() * 3, (rand() - 0.5) * 4);
      t.add(crown);
    }
    // Half the trees have a face in the bark: two eyes that look about and blink.
    if (rand() < 0.5) {
      const face = new THREE.Group();
      face.position.set(0, 2.6, r * 1.05);
      const pupils = eyes(face, 0, 0, r * 0.9, r * 0.28, white, pupil);
      t.add(face);
      glance(pupils, animated, rand() * 6, r * 0.28);
    }
    return place(t, x, z, rand);
  };
  const humStone: Feature = (x, z, rand) => {
    // A standing stone with a face, a ring of light round its foot pulsing as it hums.
    const t = new THREE.Group();
    const h = 3 + rand() * 2;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, h, 6), stone);
    st.position.y = h / 2;
    t.add(st);
    const face = new THREE.Group();
    face.position.set(0, h * 0.7, 0.85);
    glance(eyes(face, 0, 0, 0.6, 0.18, white, pupil), animated, rand() * 6, 0.18);
    t.add(face);
    const ring = new THREE.Sprite(additive(glow, 0x9affd0));
    ring.position.y = 0.4;
    t.add(ring);
    const ph = rand() * 6;
    animated.push((time) => ring.scale.set(4 + Math.sin(time * 3 + ph) * 1.2, 1.6, 1));
    return place(t, x, z, rand);
  };
  const shrooms: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 3 + Math.floor(rand() * 5);
    for (let k = 0; k < n; k++) {
      const h = 0.6 + rand() * 1.8;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * h, 0.18 * h, h, 6), stem);
      s.position.set((rand() - 0.5) * 3, h / 2, (rand() - 0.5) * 3);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5 * h, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), caps[k % caps.length]);
      cap.position.set(s.position.x, h, s.position.z);
      t.add(s, cap);
    }
    return place(t, x, z, rand);
  };
  const ferns: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 5 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.6), fern);
      frond.position.set(0, 1, 0);
      frond.rotation.set(-0.6, (k / n) * Math.PI * 2, 0);
      frond.translateY(0.6);
      t.add(frond);
    }
    return place(t, x, z, rand);
  };
  const pollen: Feature = (x, z, rand) => {
    // Motes of light drifting up through a sunbeam.
    const t = new THREE.Group();
    const motes: THREE.Sprite[] = [];
    for (let k = 0; k < 6; k++) {
      const s = new THREE.Sprite(additive(glow, 0xffe890));
      s.scale.setScalar(0.5 + rand() * 0.5);
      t.add(s);
      motes.push(s);
    }
    const ph = rand() * 6;
    animated.push((time) =>
      motes.forEach((s, k) => s.position.set(Math.sin(time * 0.3 + k * 2 + ph) * 3, ((time * 0.6 + k * 1.3 + ph) % 8) + 0.5, Math.cos(time * 0.25 + k + ph) * 3)),
    );
    t.position.set(x, 0, z);
    return t;
  };
  return (x, z, rand) => pick(rand, [[4, tree], [1, humStone], [1.6, shrooms], [1.4, ferns], [1, pollen]])(x, z, rand);
}

/** Sea of Doubt: sea stacks, wrecks heeled over, bell buoys rolling with a light, and breakers going white. */
export function seaFeature(rockMat: THREE.Material, animated: Animated): Feature {
  const hull = new THREE.MeshLambertMaterial({ map: tex.woodTexture(), color: 0x4a4a52 });
  const buoyRed = lambert(0xc82a20);
  const iron = lambert(0x2a2a30);
  const glow = tex.glowTexture();
  const foam = tex.glowTexture('rgba(230,245,255,0.8)', 'rgba(200,230,255,0)');
  const stack: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 8 + rand() * 14;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.5 + rand(), 3 + rand() * 2, h, 7), rockMat);
    col.position.y = h / 2 - 1;
    col.rotation.y = rand();
    t.add(col);
    if (rand() < 0.5) {
      const top = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4, 0), rockMat);
      top.position.y = h - 0.5;
      t.add(top);
    }
    return place(t, x, z, rand);
  };
  const wreck: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 1.6, 12, 10, 1, true, 0, Math.PI), hull);
    body.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.6);
    body.position.y = 0.4;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 10, 6), hull);
    mast.position.set(1.4, 4.4, 0);
    mast.rotation.z = 0.6;
    t.add(body, mast);
    const ph = rand() * 6;
    animated.push((time) => (t.rotation.x = Math.sin(time * 0.6 + ph) * 0.05));
    return place(t, x, z, rand);
  };
  const buoy: Feature = (x, z, rand) => {
    // A bell buoy rolling in the swell, a red light on its cage.
    const t = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.3, 1.4, 12), buoyRed);
    body.position.y = 0.5;
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 4), iron);
      bar.position.set(a * 0.5, 2.4, b * 0.5);
      t.add(bar);
    }
    const bell = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.6, 10), iron);
    bell.position.y = 2.6;
    const light = new THREE.Sprite(additive(glow, 0xff3a2a));
    light.position.y = 3.9;
    t.add(body, bell, light);
    const ph = rand() * 6;
    animated.push((time) => {
      t.rotation.set(Math.sin(time * 1.1 + ph) * 0.18, 0, Math.sin(time * 0.9 + ph) * 0.18);
      t.position.y = Math.sin(time * 1.3 + ph) * 0.3;
      light.scale.setScalar(Math.sin(time * 2 + ph) > 0.6 ? 3 : 0.01);
    });
    t.position.set(x, 0, z);
    return t;
  };
  const breaker: Feature = (x, z, rand) => {
    // White water breaking over a reef, swelling and falling away.
    const t = new THREE.Group();
    const sprites: THREE.Sprite[] = [];
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: foam, color: 0xe0f0ff, transparent: true, depthWrite: false }));
      s.position.set((k - 1.5) * 4, 0.6, (rand() - 0.5) * 2);
      t.add(s);
      sprites.push(s);
    }
    const ph = rand() * 6;
    animated.push((time) =>
      sprites.forEach((s, k) => {
        const u = Math.max(0, Math.sin(time * 0.9 + ph + k * 0.5));
        s.scale.set(6 + u * 4, 0.5 + u * 3, 1);
      }),
    );
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[2, stack], [0.8, wreck], [1.4, buoy], [2.2, breaker]])(x, z, rand);
}

/** A billboard sign over the road, facing the karts coming. */
function sign(g: THREE.Group, text: string, bg: string, fg: string, width: number, y: number): void {
  const map = tex.billboardTexture(text, bg, fg);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.25), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
  m.position.y = y;
  m.rotation.y = Math.PI;
  g.add(m);
}

/** Phantom Island's gate: two stone towers and a broken arch between them that fades in and out, ghost lights circling it. */
export function phantomArch(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2.5;
  const stone = new THREE.MeshLambertMaterial({ map: tex.stoneTexture([70, 74, 92], [140, 146, 170]), flatShading: true });
  for (const side of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.6, 12, 2.6), stone);
    tower.position.set(side * (hw + 1.3), 6, 0);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.6, 4), stone);
    cap.position.set(side * (hw + 1.3), 13.3, 0);
    cap.rotation.y = Math.PI / 4;
    g.add(tower, cap);
  }
  // The arch is there and then it isn't: half of it is stone, the rest is light.
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(hw + 1.3, 0.8, 8, 32, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xa0fff0, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  arch.position.y = 10;
  const ruin = new THREE.Mesh(new THREE.TorusGeometry(hw + 1.3, 0.9, 8, 12, Math.PI * 0.3), stone);
  ruin.position.y = 10;
  g.add(arch, ruin);
  sign(g, 'PHANTOM ISLAND', '#2e1c5a', '#a0fff0', hw * 1.3, 8.2);
  const glow = tex.glowTexture();
  const lights: THREE.Sprite[] = [];
  for (let k = 0; k < 6; k++) {
    const l = new THREE.Sprite(additive(glow, k % 2 ? 0x7affe0 : 0xc8a0ff));
    l.scale.setScalar(2.2);
    g.add(l);
    lights.push(l);
  }
  const am = arch.material as THREE.MeshBasicMaterial;
  animated.push((time) => {
    am.opacity = 0.15 + 0.55 * (0.5 + 0.5 * Math.sin(time * 0.8));
    lights.forEach((l, k) => {
      const a = time * 0.6 + (k / lights.length) * Math.PI;
      l.position.set(Math.cos(a) * (hw + 1.3), 10 + Math.sin(a) * (hw + 1.3) * 0.9, Math.sin(time + k) * 1.5);
    });
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Deadstick Drop's gate: two control towers and a plane hung between them, its propeller winding down to a stop, then coughing back to life. */
export function runwayGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const white = lambert(0xf4f4f0);
  const red = lambert(0xd8302a);
  const dark = lambert(0x2a2a30);
  for (const side of [-1, 1]) {
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.6, 11, 1.6), side < 0 ? white : red);
    mast.position.set(side * (hw + 0.8), 5.5, 0);
    for (let k = 0; k < 5; k++) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1, 1.7), k % 2 ? red : white);
      band.position.set(side * (hw + 0.8), 1 + k * 2.2, 0);
      g.add(band);
    }
    g.add(mast);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 2, 0.8, 0.8), white);
  bar.position.y = 11;
  g.add(bar);
  const p = plane(red, white, dark);
  p.group.scale.setScalar(1.6);
  p.group.position.y = 11.6;
  // Nose up the road towards the karts.
  p.group.rotation.y = Math.PI;
  g.add(p.group);
  sign(g, 'DEADSTICK DROP', '#1a5ad0', '#ffffff', hw * 1.3, 9.2);
  animated.push((time) => {
    // Twelve seconds round: full revs, a splutter, dead still (deadstick), then it catches again.
    const u = time % 12;
    const rate = u < 6 ? 30 : u < 8 ? 30 * (1 - (u - 6) / 2) : u < 11 ? 0 : 30 * (u - 11);
    p.propeller.rotation.z += rate / 60;
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Panpsych Grove's gate: two great trees leaning in over the road until their crowns meet, a face in each trunk watching you through. */
export function treeGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2.5;
  const bark = new THREE.MeshLambertMaterial({ map: tex.woodTexture(), color: 0x7a5a3a });
  const leaf = lambert(0x3a7a2a, { flatShading: true });
  const white = new THREE.MeshBasicMaterial({ color: 0xfff8e0 });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x1a0a04 });
  for (const side of [-1, 1]) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 16, 10), bark);
    trunk.position.set(side * (hw + 1.5), 8, 0);
    trunk.rotation.z = side * 0.32;
    g.add(trunk);
    const face = new THREE.Group();
    face.position.set(side * (hw + 0.8), 4, -1.3);
    face.rotation.y = Math.PI - side * 0.4;
    glance(eyes(face, 0, 0, 1.4, 0.45, white, pupil), animated, side * 2, 0.45);
    g.add(face);
  }
  for (let k = 0; k < 7; k++) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(4 + (k % 3), 0), leaf);
    crown.position.set((k / 6 - 0.5) * (hw * 2 + 4), 16 + Math.sin(k) * 1.5, (k % 2) * 2 - 1);
    g.add(crown);
  }
  sign(g, 'PANPSYCH GROVE', '#2a5a2a', '#ffe890', hw * 1.2, 11.5);
  const lantern = new THREE.Sprite(additive(tex.glowTexture(), 0xffd060));
  lantern.position.y = 13.5;
  g.add(lantern);
  animated.push((time) => lantern.scale.setScalar(5 + Math.sin(time * 2) * 1));
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Sea of Doubt's gate: the ribs of a wrecked ship arching over the road, a lantern swinging from the keel, the figurehead staring down. */
export function wreckGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const wood = new THREE.MeshLambertMaterial({ map: tex.woodTexture(), color: 0x6a6a72 });
  for (let k = -2; k <= 2; k++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(hw + 1, 0.45, 6, 20, Math.PI), wood);
    rib.position.set(0, 0, k * 3);
    rib.scale.y = 1.35;
    g.add(rib);
  }
  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 15), wood);
  keel.position.y = (hw + 1) * 1.35;
  g.add(keel);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), lambert(0xd8c8a8));
  head.position.set(0, (hw + 1) * 1.35 - 0.6, 8);
  g.add(head);
  sign(g, 'SEA OF DOUBT', '#0a1420', '#c0f0ff', hw * 1.2, (hw + 1) * 1.35 - 3);
  const pivot = new THREE.Group();
  pivot.position.set(0, (hw + 1) * 1.35 - 0.4, -4);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), lambert(0x2a2a30));
  lamp.position.y = -2;
  const light = new THREE.Sprite(additive(tex.glowTexture(), 0xffb050));
  light.position.y = -2;
  light.scale.setScalar(4);
  pivot.add(lamp, light);
  g.add(pivot);
  animated.push((time) => {
    pivot.rotation.x = Math.sin(time * 1.4) * 0.35;
    light.scale.setScalar(3.6 + Math.sin(time * 9) * 0.4);
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * The World Tree, in the middle of Panpsych Grove's Root Knot: a trunk as
 * wide as a house with the road wound round it, roots spreading out over
 * the ground, a crown over the whole knot, and a face in the bark with eyes
 * that follow the karts round.
 */
export function worldTree(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pointAt(ribbon.spline, s);
  const bark = new THREE.MeshLambertMaterial({ map: tex.woodTexture(), color: 0x6a4a2e });
  const leafs = [0x2e6a2a, 0x3e7a2a, 0x5a8a30].map((c) => lambert(c, { flatShading: true }));
  const white = new THREE.MeshBasicMaterial({ color: 0xfff8e0 });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x1a0a04 });
  const R = 9;
  const H = 46;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.75, R * 1.15, H, 16), bark);
  trunk.position.y = H / 2;
  g.add(trunk);
  // Roots buttressing the trunk out across the floor of the knot.
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.8, 9, 6), bark);
    root.position.set(Math.cos(a) * (R + 2.5), 2, Math.sin(a) * (R + 2.5));
    root.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
    g.add(root);
  }
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(12 + (k % 3) * 3, 0), leafs[k % leafs.length]);
    crown.position.set(Math.cos(a) * 18, H + 4 + (k % 2) * 6, Math.sin(a) * 18);
    g.add(crown);
  }
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(18, 0), leafs[0]);
  top.position.y = H + 14;
  g.add(top);
  // The face turns to keep watching whoever is going round it.
  const face = new THREE.Group();
  face.position.y = 7;
  const look = new THREE.Group();
  look.position.z = R * 0.95;
  glance(eyes(look, 0, 0, 3.4, 1.1, white, pupil), animated, 1.3, 1.1);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.3, 6, 12, Math.PI), pupil);
  mouth.position.set(0, -2.4, 0.2);
  mouth.rotation.z = Math.PI;
  look.add(mouth);
  face.add(look);
  g.add(face);
  animated.push((time) => (face.rotation.y = time * 0.5));
  const glow = new THREE.Sprite(additive(tex.glowTexture(), 0xffe890));
  glow.scale.setScalar(30);
  glow.position.y = H;
  g.add(glow);
  g.position.set(p.x - p.tz * lateral, ribbon.heightAt(s) - 1, p.z + p.tx * lateral);
  return g;
}
