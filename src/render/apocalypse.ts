import * as THREE from 'three';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import * as tex from './textures';

/**
 * Scenery and landmarks for the Apocalypse Cup's newer worlds: the burning
 * Mars colony (Mars for the Rich), the storm plains (Supercell) and the void
 * (The Lord of Lightning), plus the storm's rain and lightning.
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

/** A flickering fire sprite on `parent`. */
function fire(parent: THREE.Object3D, animated: Animated, map: THREE.Texture, y: number, size: number, ph: number): THREE.Sprite {
  const s = new THREE.Sprite(additive(map, 0xff7a20));
  s.position.y = y;
  parent.add(s);
  animated.push((time) => s.scale.set(size * (0.85 + Math.sin(time * 11 + ph) * 0.15), size * (1.4 + Math.sin(time * 17 + ph) * 0.25), 1));
  return s;
}

/** Mars for the Rich: the colony, overrun and burning. Domes, habs, a crashed rocket, wrecked rovers, dishes, solar arrays, hoodoos, craters. */
export function colonyFeature(rockMat: THREE.Material, animated: Animated): Feature {
  const steel = new THREE.MeshLambertMaterial({ map: tex.corrugatedTexture() });
  const white = lambert(0xe8e4e0);
  const dark = lambert(0x2a2a30, { flatShading: true });
  const glass = new THREE.MeshPhongMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.32, shininess: 120, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false });
  const panel = new THREE.MeshPhongMaterial({ color: 0x1a2a6a, shininess: 100, specular: 0x8aa8ff });
  const lit = new THREE.MeshBasicMaterial({ color: 0xffc860 });
  const red = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const flame = tex.glowTexture('rgba(255,200,90,1)', 'rgba(255,50,0,0)');
  const smokeMat = lambert(0x3a2420, { transparent: true, opacity: 0.6 });
  const dome: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 5 + rand() * 4;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.4, 1.2, 20), steel);
    ring.position.y = 0.6;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    shell.position.y = 1.2;
    // Green inside: the hydroponics, still growing.
    const crop = new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0x3a8a3a));
    crop.scale.y = 0.4;
    crop.position.y = 1.2;
    t.add(ring, shell, crop);
    // Ribs over the glass.
    for (let k = 0; k < 4; k++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 4, 24, Math.PI), white);
      rib.position.y = 1.2;
      rib.rotation.y = (k / 4) * Math.PI;
      t.add(rib);
    }
    if (rand() < 0.4) fire(t, animated, flame, r * 0.8, 4, rand() * 6).position.x = r * 0.4;
    return place(t, x, z, rand);
  };
  const hab: Feature = (x, z, rand) => {
    // A hab module on legs, windows lit, an antenna and a beacon blinking.
    const t = new THREE.Group();
    const len = 6 + rand() * 4;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, len, 14), steel);
    body.rotation.z = Math.PI / 2;
    body.position.y = 2.6;
    t.add(body);
    for (const end of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), white);
      cap.rotation.z = (-end * Math.PI) / 2;
      cap.position.set((end * len) / 2, 2.6, 0);
      t.add(cap);
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 5), dark);
        leg.position.set(end * len * 0.35, 0.7, side * 1.1);
        t.add(leg);
      }
    }
    for (let k = 0; k < 3; k++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), lit);
      w.position.set((k - 1) * len * 0.25, 3, 1.62);
      t.add(w);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 4), dark);
    mast.position.set(len * 0.3, 5.5, 0);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), red);
    beacon.position.set(len * 0.3, 7, 0);
    t.add(mast, beacon);
    const ph = rand() * 6;
    animated.push((time) => (beacon.visible = Math.sin(time * 4 + ph) > 0));
    return place(t, x, z, rand);
  };
  const rocket: Feature = (x, z, rand) => {
    // A crashed rocket, nose buried, fins in the air, still smoking.
    const t = new THREE.Group();
    const r = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 12, 14), white);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4, 14), lambert(0xd83a2a));
    nose.position.y = -8;
    nose.rotation.x = Math.PI;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 1, 14), dark);
    band.position.y = 2;
    r.add(body, nose, band);
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 2.2), lambert(0xd83a2a));
      const a = (k / 4) * Math.PI * 2;
      fin.position.set(Math.cos(a) * 1.9, 5.2, Math.sin(a) * 1.9);
      fin.rotation.y = -a;
      r.add(fin);
    }
    r.rotation.z = 0.5 + rand() * 0.3;
    r.position.y = 4.5;
    t.add(r);
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), smokeMat);
    smoke.scale.set(1.4, 2.4, 1.4);
    smoke.position.set(-2, 9, 0);
    t.add(smoke);
    fire(t, animated, flame, 1, 5, rand() * 6);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(4, 0.8, 5, 16), rockMat);
    rim.rotation.x = Math.PI / 2;
    t.add(rim);
    return place(t, x, z, rand);
  };
  const rover: Feature = (x, z, rand) => {
    // A six-wheeled rover on its side, its mast bent.
    const t = new THREE.Group();
    const v = new THREE.Group();
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 3.4), white);
    chassis.position.y = 1.2;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 2.4), panel);
    deck.position.y = 1.65;
    v.add(chassis, deck);
    for (const side of [-1, 1]) for (const k of [-1, 0, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10), dark);
      w.rotation.z = Math.PI / 2;
      w.position.set(side * 1.4, 0.5, k * 1.3);
      v.add(w);
    }
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2, 0.15), dark);
    mast.position.set(0.6, 2.6, 1.2);
    mast.rotation.x = 0.6;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.4), white);
    head.position.set(0.6, 3.4, 1.8);
    v.add(mast, head);
    if (rand() < 0.5) v.rotation.z = Math.PI / 2 - 0.2;
    t.add(v);
    return place(t, x, z, rand);
  };
  const dish: Feature = (x, z, rand) => {
    // A comms dish, still turning, searching for Earth.
    const t = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 5, 8), dark);
    post.position.y = 2.5;
    const head = new THREE.Group();
    head.position.y = 5.2;
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(3, 18, 8, 0, Math.PI * 2, 0, Math.PI / 3), white);
    bowl.material = new THREE.MeshLambertMaterial({ color: 0xe8e4e0, side: THREE.DoubleSide });
    bowl.rotation.x = Math.PI / 2 + 0.5;
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 4), dark);
    horn.rotation.x = Math.PI / 2 + 0.5;
    horn.position.set(0, 0.6, 1.1);
    head.add(bowl, horn);
    t.add(post, head);
    const ph = rand() * 6;
    animated.push((time) => (head.rotation.y = time * 0.2 + ph));
    return place(t, x, z, rand);
  };
  const solar: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 4), dark);
      leg.position.set(k * 2.4, 0.7, 0);
      const p = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 1.6), panel);
      p.position.set(k * 2.4, 1.5, 0);
      // One or two knocked flat.
      p.rotation.x = rand() < 0.2 ? 1.2 : -0.6;
      t.add(leg, p);
    }
    return place(t, x, z, rand);
  };
  const hoodoo: Feature = (x, z, rand) => {
    // A wind-carved rock spire, a cap balanced on top.
    const t = new THREE.Group();
    const h = 5 + rand() * 8;
    let y = 0;
    for (let k = 0; y < h; k++) {
      const s = 1.8 - k * 0.15 + rand() * 0.6;
      const b = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
      b.scale.y = 0.8;
      b.position.set((rand() - 0.5) * 0.5, y + s * 0.6, (rand() - 0.5) * 0.5);
      t.add(b);
      y += s * 1.1;
    }
    const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4, 0), rockMat);
    cap.scale.y = 0.5;
    cap.position.y = y + 0.6;
    t.add(cap);
    return place(t, x, z, rand);
  };
  const crater: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 3 + rand() * 5;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.18, 5, 20), rockMat);
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = 0.5;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(r, 20), lambert(0x4a1a10));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.04;
    t.add(rim, floor);
    if (rand() < 0.3) fire(t, animated, flame, 0.8, 3, rand() * 6);
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[1.4, dome], [1.6, hab], [0.6, rocket], [1.2, rover], [1, dish], [1.2, solar], [2, hoodoo], [1.6, crater]])(x, z, rand);
}

/** Supercell: prairie in a storm. Wrecked farmhouses, silos, spinning windpumps, leaning poles, hay bales, bent trees, scattered roofing. */
export function plainsFeature(animated: Animated): Feature {
  const wood = new THREE.MeshLambertMaterial({ map: tex.woodTexture() });
  const barnRed = lambert(0x7a2a1e);
  const tin = new THREE.MeshLambertMaterial({ map: tex.corrugatedTexture(), side: THREE.DoubleSide });
  const silo = lambert(0xa8acae);
  const hay = lambert(0xc8a85a);
  const bark = lambert(0x3a2c20);
  const leaf = lambert(0x2e4a2a, { flatShading: true });
  const steel = lambert(0x5a5e60, { flatShading: true });
  const wire = new THREE.LineBasicMaterial({ color: 0x1a1a1a });
  const house: Feature = (x, z, rand) => {
    // A farmhouse with its roof half torn away, boards hanging.
    const t = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(6, 3.6, 5), rand() < 0.5 ? barnRed : wood);
    walls.position.y = 1.8;
    t.add(walls);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 5.6), tin);
    roof.position.set(-1.4, 4.4, 0);
    roof.rotation.z = 0.6;
    const torn = roof.clone();
    torn.position.set(2.6, 4.9, 0.6);
    torn.rotation.set(0.3, 0.4, -1.1);
    t.add(roof, torn);
    for (let k = 0; k < 4; k++) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.4), wood);
      board.position.set(3.1, 2 + rand(), -1.5 + k);
      board.rotation.x = (rand() - 0.5) * 1.2;
      t.add(board);
    }
    return place(t, x, z, rand);
  };
  const grainSilo: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const h = 9 + rand() * 6;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, h, 16), silo);
      s.position.set(k * 4.4, h / 2, 0);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.6, 16), silo);
      cap.position.set(k * 4.4, h + 0.8, 0);
      t.add(s, cap);
    }
    return place(t, x, z, rand);
  };
  const windpump: Feature = (x, z, rand) => {
    // A windpump on a lattice tower, its fan spinning flat out in the gale.
    const t = new THREE.Group();
    const h = 8 + rand() * 3;
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, h, 4), steel);
      leg.position.set(lx * 0.8, h / 2, lz * 0.8);
      leg.rotation.set(-lz * 0.08, 0, lx * 0.08);
      t.add(leg);
    }
    const fan = new THREE.Group();
    fan.position.set(0, h + 0.4, 0.6);
    for (let k = 0; k < 12; k++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.8, 0.04), steel);
      blade.position.y = 1.1;
      const arm = new THREE.Group();
      arm.rotation.z = (k / 12) * Math.PI * 2;
      arm.add(blade);
      fan.add(arm);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 2.2), steel);
    tail.position.set(0, h + 0.4, -1.4);
    t.add(fan, tail);
    const rate = 8 + rand() * 6;
    animated.push((time) => (fan.rotation.z = time * rate));
    return place(t, x, z, rand);
  };
  const poles: Feature = (x, z, rand) => {
    // A run of telephone poles, leaning further each one, the wire sagging between.
    const t = new THREE.Group();
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < 3; k++) {
      const p = new THREE.Group();
      p.position.x = k * 12;
      p.rotation.z = -k * 0.18 - rand() * 0.1;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 8, 6), bark);
      pole.position.y = 4;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2), bark);
      bar.position.y = 7.4;
      p.add(pole, bar);
      t.add(p);
      p.updateMatrix();
      pts.push(new THREE.Vector3(0, 7.5, 0).applyMatrix4(p.matrix));
    }
    const curve: THREE.Vector3[] = [];
    for (let k = 0; k < pts.length - 1; k++) {
      for (let u = 0; u <= 1; u += 0.125) {
        const a = pts[k].clone().lerp(pts[k + 1], u);
        a.y -= Math.sin(u * Math.PI) * 1.2;
        curve.push(a);
      }
    }
    t.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve), wire));
    return place(t, x, z, rand);
  };
  const bales: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 2 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 14), hay);
      b.rotation.z = Math.PI / 2;
      b.rotation.y = rand() * 3;
      b.position.set((rand() - 0.5) * 6, 0.9, (rand() - 0.5) * 6);
      t.add(b);
    }
    return place(t, x, z, rand);
  };
  const tree: Feature = (x, z, rand) => {
    // A tree bent hard over in the wind, its crown streaming one way.
    const t = new THREE.Group();
    const h = 4 + rand() * 4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, h, 6), bark);
    trunk.position.set(0.4, h / 2, 0);
    trunk.rotation.z = -0.25;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2, 0), leaf);
    crown.scale.set(1.8, 0.8, 1);
    crown.position.set(1.8, h, 0);
    t.add(trunk, crown);
    const ph = rand() * 6;
    animated.push((time) => (crown.rotation.z = Math.sin(time * 5 + ph) * 0.08 - 0.15));
    t.position.set(x, 0, z);
    // Every tree bends the same way: the wind has a direction.
    t.rotation.y = 0.7 + (rand() - 0.5) * 0.3;
    return t;
  };
  const roofing: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), tin);
      sheet.position.set((rand() - 0.5) * 8, 0.1 + rand() * 0.6, (rand() - 0.5) * 8);
      sheet.rotation.set(-Math.PI / 2 + (rand() - 0.5) * 0.8, rand() * 3, (rand() - 0.5) * 0.6);
      t.add(sheet);
    }
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[1, house], [0.8, grainSilo], [1.2, windpump], [1.2, poles], [1.6, bales], [3, tree], [1.2, roofing]])(x, z, rand);
}

/** The Lord of Lightning: things floating in the void. Asteroids, ringed planets, crystals, cyborg heads, watching eyes. */
export function cosmosFeature(rockMat: THREE.Material, animated: Animated): Feature {
  const chrome = new THREE.MeshPhongMaterial({ color: 0xb8bcc8, shininess: 140, specular: 0xffffff });
  const eyeRed = new THREE.MeshBasicMaterial({ color: 0xff2a3a });
  const white = new THREE.MeshPhongMaterial({ color: 0xf4f0ec, shininess: 80 });
  const irisMats = [0x3adcff, 0xb04aff, 0x7aff5a].map((c) => new THREE.MeshBasicMaterial({ color: c }));
  const pupil = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const glow = tex.glowTexture();
  const crystalMats = [0xff5ad0, 0x5affe8, 0xb08aff].map((c) => new THREE.MeshPhongMaterial({ color: c, emissive: c, emissiveIntensity: 0.5, transparent: true, opacity: 0.85, flatShading: true, shininess: 120 }));
  const planetMats = [0x8a4aa0, 0x3a6aa8, 0xa86a3a, 0x4aa88a].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xe8c8ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const spin = (o: THREE.Object3D, rand: () => number) => {
    const ax = (rand() - 0.5) * 0.6;
    const ay = (rand() - 0.5) * 0.6;
    animated.push((time) => o.rotation.set(time * ax, time * ay, 0));
  };
  const asteroid: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 1 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const a = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + rand() * 3, 0), rockMat);
      a.scale.set(1, 0.6 + rand() * 0.5, 0.8 + rand() * 0.4);
      a.position.set((rand() - 0.5) * 10, (rand() - 0.5) * 6, (rand() - 0.5) * 10);
      spin(a, rand);
      t.add(a);
    }
    t.position.set(x, 0, z);
    return t;
  };
  const planet: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 3 + rand() * 5;
    const p = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), planetMats[Math.floor(rand() * planetMats.length)]);
    t.add(p);
    if (rand() < 0.6) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.3, r * 2, 40), ringMat);
      ring.rotation.x = Math.PI / 2 - 0.4;
      t.add(ring);
    }
    t.position.set(x, 0, z);
    spin(p, rand);
    return t;
  };
  const crystal: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const mat = crystalMats[Math.floor(rand() * crystalMats.length)];
    for (let k = 0; k < 3; k++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.8 + rand() * 1.4, 0), mat);
      c.scale.y = 2.2;
      c.position.set((rand() - 0.5) * 3, (rand() - 0.5) * 3, (rand() - 0.5) * 3);
      spin(c, rand);
      t.add(c);
    }
    const s = new THREE.Sprite(additive(glow, (mat.color as THREE.Color).getHex()));
    s.scale.setScalar(8);
    t.add(s);
    t.position.set(x, 0, z);
    return t;
  };
  const cyborg: Feature = (x, z, rand) => {
    // A chrome cyborg head adrift, one eye still glowing red.
    const t = new THREE.Group();
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 12), chrome);
    skull.scale.set(0.9, 1.1, 1);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 2), chrome);
    jaw.position.set(0, -1.6, 0.4);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.3), new THREE.MeshPhongMaterial({ color: 0x1a1a24, shininess: 150 }));
    visor.position.set(0, 0.3, 1.8);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), eyeRed);
    eye.position.set(0.6, 0.3, 1.98);
    const g = new THREE.Sprite(additive(glow, 0xff2a3a));
    g.scale.setScalar(2);
    g.position.copy(eye.position);
    head.add(skull, jaw, visor, eye, g);
    for (let k = 0; k < 3; k++) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), chrome);
      tube.position.set((k - 1) * 0.6, -3, -0.6);
      tube.rotation.x = 0.3 + k * 0.2;
      head.add(tube);
    }
    head.scale.setScalar(1 + rand());
    spin(head, rand);
    t.add(head);
    t.position.set(x, 0, z);
    return t;
  };
  const eyeball: Feature = (x, z, rand) => {
    // An eye, as big as a car, drifting and watching.
    const t = new THREE.Group();
    const r = 2 + rand() * 3;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), white);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(r * 0.45, 20), irisMats[Math.floor(rand() * irisMats.length)]);
    iris.position.z = r * 1.002;
    const pup = new THREE.Mesh(new THREE.CircleGeometry(r * 0.2, 16), pupil);
    pup.position.z = r * 1.004;
    ball.add(iris, pup);
    t.add(ball);
    const ph = rand() * 6;
    animated.push((time) => ball.rotation.set(Math.sin(time * 0.7 + ph) * 0.4, Math.sin(time * 0.5 + ph * 2) * 1.2, 0));
    t.position.set(x, 0, z);
    return t;
  };
  return (x, z, rand) => pick(rand, [[3, asteroid], [1, planet], [1.6, crystal], [0.8, cyborg], [1, eyeball]])(x, z, rand);
}

/** The colony's airlock gate: two pressure towers, a truss over the road with beacons, a sign, one tower burning. */
export function colonyGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2.5;
  const steel = new THREE.MeshLambertMaterial({ map: tex.corrugatedTexture() });
  const white = lambert(0xe8e4e0);
  const red = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  for (const side of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.4, 11, 14), steel);
    tower.position.set(side * (hw + 1.5), 5.5, 0);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), white);
    cap.position.set(side * (hw + 1.5), 11, 0);
    g.add(tower, cap);
  }
  const truss = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 3, 1.4, 1.4), white);
  truss.position.y = 10;
  g.add(truss);
  const lights: THREE.Mesh[] = [];
  for (let k = -2; k <= 2; k++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), red);
    l.position.set((k / 2) * hw, 9.1, 0.8);
    g.add(l);
    lights.push(l);
  }
  const map = tex.billboardTexture('HELL ON MARS', '#5a1a10', '#ffc020');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(hw * 1.2, hw * 0.3), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
  sign.position.y = 12.2;
  sign.rotation.y = Math.PI; // face the oncoming karts
  g.add(sign);
  const fireMat = additive(tex.glowTexture('rgba(255,200,90,1)', 'rgba(255,50,0,0)'), 0xff6a1a);
  const flames = new THREE.Sprite(fireMat);
  flames.position.set(hw + 1.5, 12.5, 0);
  g.add(flames);
  animated.push((time) => {
    lights.forEach((l, k) => (l.visible = Math.floor(time * 4) % 5 === k));
    flames.scale.set(6 + Math.sin(time * 11) * 0.8, 9 + Math.sin(time * 17) * 1.2, 1);
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Two lightning-rod pylons over the road, electricity arcing between their tips. */
export function rodGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const steel = lambert(0x5a5e60, { flatShading: true });
  const copper = new THREE.MeshPhongMaterial({ color: 0xc8783a, shininess: 100 });
  for (const side of [-1, 1]) {
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 13, 4), steel);
      leg.position.set(side * hw + lx * 0.8, 6.5, lz * 0.8);
      leg.rotation.set(-lz * 0.06, 0, lx * 0.06);
      g.add(leg);
    }
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 4, 6), copper);
    rod.position.set(side * hw, 15, 0);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), copper);
    ball.position.set(side * hw, 13, 0);
    g.add(rod, ball);
  }
  // A windsock streaming off the left pylon.
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0xff6a1a, side: THREE.DoubleSide }));
  sock.rotation.z = Math.PI / 2;
  sock.position.set(-hw - 1.6, 11, 0);
  g.add(sock);
  const arcMat = new THREE.LineBasicMaterial({ color: 0xc8e0ff, transparent: true, blending: THREE.AdditiveBlending });
  const N = 16;
  const pos = new Float32Array(N * 3);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const arc = new THREE.Line(arcGeo, arcMat);
  g.add(arc);
  const glow = new THREE.Sprite(additive(tex.glowTexture(), 0x9ac8ff));
  glow.position.y = 14;
  g.add(glow);
  animated.push((time) => {
    const on = Math.sin(time * 1.3) > -0.2;
    arc.visible = on && Math.random() < 0.8;
    glow.scale.setScalar(on ? 6 + Math.random() * 6 : 0.01);
    sock.rotation.y = Math.sin(time * 6) * 0.2;
    if (!arc.visible) return;
    for (let k = 0; k < N; k++) {
      const u = k / (N - 1);
      const jit = k === 0 || k === N - 1 ? 0 : 1;
      pos[k * 3] = -hw + u * hw * 2;
      pos[k * 3 + 1] = 15.5 - Math.sin(u * Math.PI) * 2 + (Math.random() - 0.5) * 1.6 * jit;
      pos[k * 3 + 2] = (Math.random() - 0.5) * 1.6 * jit;
    }
    arcGeo.attributes.position.needsUpdate = true;
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A chrome ring round the road with a great eye on top, turning to follow the road. */
export function voidEye(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 3;
  const chrome = new THREE.MeshPhongMaterial({ color: 0xb8bcc8, shininess: 140, specular: 0xffffff, emissive: 0x1a0a2a });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(hw + 1, 0.9, 10, 48), chrome);
  ring.position.y = 1;
  g.add(ring);
  const neon = new THREE.Mesh(new THREE.TorusGeometry(hw + 0.1, 0.18, 6, 48), new THREE.MeshBasicMaterial({ color: 0xff3ad8 }));
  neon.position.y = 1;
  g.add(neon);
  const eye = new THREE.Group();
  eye.position.y = hw + 5;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(3.4, 24, 16), new THREE.MeshPhongMaterial({ color: 0xf4f0ec, shininess: 80 }));
  const iris = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ color: 0xff2a3a }));
  iris.position.z = 3.41;
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  pupil.position.z = 3.42;
  ball.add(iris, pupil);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(3.6, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), chrome);
  eye.add(ball, lid);
  g.add(eye);
  const halo = new THREE.Sprite(additive(tex.glowTexture(), 0xb070ff));
  halo.scale.setScalar(18);
  halo.position.y = hw + 5;
  g.add(halo);
  animated.push((time) => {
    // Glancing about, now and then a blink.
    ball.rotation.set(0.25 + Math.sin(time * 0.6) * 0.2, Math.PI + Math.sin(time * 0.43) * 0.6, 0);
    const blink = (time % 5) / 5 > 0.96;
    lid.rotation.x = blink ? Math.PI * 0.55 : 0;
    neon.rotation.z = time * 0.3;
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Rain sheeting down round the camera, and lightning flashing the sky. */
export function stormWeather(sky: THREE.MeshBasicMaterial): { group: THREE.Group; update: (time: number, cam: THREE.Vector3) => void } {
  const N = 1600;
  const W = 120;
  const H = 50;
  const offs = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) {
    offs[k * 3] = Math.random() * W;
    offs[k * 3 + 1] = Math.random() * H;
    offs[k * 3 + 2] = Math.random() * W;
  }
  const pos = new Float32Array(N * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xb8c8d8, transparent: true, opacity: 0.45, depthWrite: false }));
  rain.frustumCulled = false;
  const group = new THREE.Group();
  group.add(rain);
  const wrap = (v: number, span: number) => ((v % span) + span) % span;
  let nextFlash = 4;
  let flashAt = -10;
  return {
    group,
    update(time, cam) {
      for (let k = 0; k < N; k++) {
        // World-anchored streaks: they wrap round the camera instead of riding with it.
        const x = cam.x - W / 2 + wrap(offs[k * 3] - cam.x, W);
        const z = cam.z - W / 2 + wrap(offs[k * 3 + 2] - cam.z, W);
        const y = cam.y - 15 + wrap(offs[k * 3 + 1] - time * 38, H);
        const o = k * 6;
        pos[o] = x;
        pos[o + 1] = y;
        pos[o + 2] = z;
        pos[o + 3] = x + 0.25;
        pos[o + 4] = y + 1.4;
        pos[o + 5] = z + 0.1;
      }
      geo.attributes.position.needsUpdate = true;
      if (time > nextFlash) {
        flashAt = time;
        nextFlash = time + 4 + Math.random() * 7;
      }
      if (time < flashAt) flashAt = -10; // a restarted clock
      const dt = time - flashAt;
      const flash = dt < 0.5 ? (dt < 0.08 || (dt > 0.18 && dt < 0.26) ? 1.6 : 0.3) : 0;
      sky.color.setScalar(1 + flash);
    },
  };
}
