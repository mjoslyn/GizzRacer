import * as THREE from 'three';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import * as tex from './textures';

/**
 * Scenery and landmarks for the Nonagon Infinity Cup's worlds: the robot
 * factory where the line stops (Robot Stop), the operating theatre whose
 * beams meet on one point (Gamma Knife), the dry lake the vultures circle
 * (People-Vultures) and the pedalboard the size of a city (Wah Wah).
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type Animated = ((time: number) => void)[];

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const additive = (map: THREE.Texture, color: number) => new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false });
const glowing = (color: number, intensity = 0.7) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: intensity, flatShading: true });
const metal = (color: number, shininess = 80) => new THREE.MeshPhongMaterial({ color, shininess, specular: 0xffffff, flatShading: true });

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

/**
 * A robot: a boxy body on two legs, a domed head with two eyes and an
 * antenna, two arms. `scale` 1 is kart-sized. Returns the parts that move.
 */
export function robotFigure(scale: number, body: THREE.Material, eye: THREE.Material): { group: THREE.Group; legs: THREE.Object3D[]; arms: THREE.Object3D[]; head: THREE.Object3D; eyes: THREE.Mesh[] } {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.1), body);
  torso.position.y = 1.9;
  const head = new THREE.Group();
  head.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1), body));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), body);
  dome.position.y = 0.45;
  head.add(dome);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), body);
  mast.position.y = 1.2;
  head.add(mast);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), eye);
  bulb.position.y = 1.55;
  head.add(bulb);
  const eyes: THREE.Mesh[] = [bulb];
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.1), eye);
    e.position.set(side * 0.28, 0.08, 0.52);
    head.add(e);
    eyes.push(e);
  }
  head.position.y = 3.2;
  const legs: THREE.Object3D[] = [];
  const arms: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.5), body);
    shin.position.y = -0.55;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.8), body);
    foot.position.set(0, -1.1, 0.15);
    leg.add(shin, foot);
    leg.position.set(side * 0.5, 1.1, 0);
    g.add(leg);
    legs.push(leg);
    const arm = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.3, 0.3), body);
    upper.position.y = -0.65;
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.4, 4), body);
    claw.position.y = -1.4;
    arm.add(upper, claw);
    arm.position.set(side * 1.05, 2.5, 0);
    g.add(arm);
    arms.push(arm);
  }
  g.add(torso, head);
  g.scale.setScalar(scale);
  return { group: g, legs, arms, head, eyes };
}

/** A vulture: a hunched black body, a bare pink head on a long neck, a hooked beak, two wings that flap. */
export function vultureFigure(scale: number): { group: THREE.Group; wings: THREE.Object3D[]; neck: THREE.Object3D } {
  const g = new THREE.Group();
  const feather = lambert(0x1a1416, { flatShading: true });
  const ruff = lambert(0xe8e0d0, { flatShading: true });
  const skin = lambert(0xe06a5a, { flatShading: true });
  const beakMat = lambert(0xe0c060, { flatShading: true });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), feather);
  body.scale.set(1, 0.8, 1.5);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.22, 6, 12), ruff);
  collar.position.set(0, 0.3, 1.1);
  collar.rotation.x = Math.PI / 2;
  const neck = new THREE.Group();
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 6), skin);
  stalk.position.y = 0.5;
  stalk.rotation.x = -0.4;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), skin);
  head.position.set(0, 1.05, 0.3);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 5), beakMat);
  beak.rotation.x = Math.PI / 2 + 0.5;
  beak.position.set(0, 0.95, 0.75);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), eyeMat);
    e.position.set(side * 0.22, 1.12, 0.5);
    neck.add(e);
  }
  neck.add(stalk, head, beak);
  neck.position.set(0, 0.3, 1.2);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 4), feather);
  tail.rotation.x = -Math.PI / 2 - 0.3;
  tail.position.set(0, 0.1, -1.6);
  const wings: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Group();
    const inner = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 1.2), feather);
    inner.position.x = side * 1.1;
    const outer = new THREE.Mesh(new THREE.BoxGeometry(2, 0.14, 0.9), feather);
    outer.position.set(side * 3.1, 0, -0.1);
    // Splayed primaries at the tip.
    for (let k = 0; k < 4; k++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.18), feather);
      f.position.set(side * (4.3 + k * 0.1), 0, -0.5 + k * 0.3);
      f.rotation.y = side * (0.2 - k * 0.15);
      outer.add(f);
    }
    w.add(inner, outer);
    w.position.set(side * 0.5, 0.4, 0.2);
    g.add(w);
    wings.push(w);
  }
  g.add(body, collar, neck, tail);
  g.scale.setScalar(scale);
  return { group: g, wings, neck };
}

/** A wah pedal: a wedge of a base, a treadle hinged at the heel that rocks, a rubber pad and a name on the side. */
export function wahPedalFigure(scale: number, animated: Animated, rock?: (time: number) => number): { group: THREE.Group; treadle: THREE.Group } {
  const g = new THREE.Group();
  const chrome = metal(0xc8ccd0, 120);
  const black = lambert(0x34343a, { flatShading: true });
  const rubber = lambert(0x5a5a62);
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 5), chrome);
  base.position.set(0, 0.4, 0);
  const treadle = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.3, 4.6), black);
  plate.position.set(0, 0.15, 2.3);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 4), rubber);
  pad.position.set(0, 0.35, 2.3);
  // Ridges on the pad.
  for (let k = 0; k < 7; k++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.12), lambert(0x1a1a1c));
    r.position.set(0, 0.44, 0.6 + k * 0.55);
    treadle.add(r);
  }
  treadle.add(plate, pad);
  // Hinged at the heel (the back of the base), the toe rocking up and down.
  treadle.position.set(0, 0.8, -2.3);
  const map = tex.billboardTexture('WAH', '#1a1a1c', '#e0e0e0');
  const label = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
  label.position.set(1.21, 0.4, 0);
  label.rotation.y = Math.PI / 2;
  g.add(base, treadle, label);
  g.scale.setScalar(scale);
  if (rock) animated.push((time) => (treadle.rotation.x = -rock(time)));
  return { group: g, treadle };
}

/** Robot Stop: smokestacks puffing, robot arms swinging, vats of molten metal, stacked crates, robots standing about stopped. */
export function foundryFeature(rockMat: THREE.Material, animated: Animated): Feature {
  const steel = new THREE.MeshLambertMaterial({ map: tex.steelWallTexture(), flatShading: true });
  const dark = metal(0x3a3e46, 40);
  const orange = lambert(0xe07020, { flatShading: true });
  const melt = new THREE.MeshBasicMaterial({ map: tex.lavaTexture() });
  const glow = tex.glowTexture();
  const smoke = tex.dustTexture();
  const robotBody = metal(0x8a9098, 60);
  const robotEye = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  const stack: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 14 + rand() * 16;
    const r = 1.6 + rand() * 1.4;
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, h, 10), steel);
    chimney.position.y = h / 2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 1.2, 10), orange);
    band.position.y = h - 2;
    t.add(chimney, band);
    const puffs: THREE.Sprite[] = [];
    for (let k = 0; k < 5; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, color: 0x6a6a70, transparent: true, opacity: 0.5, depthWrite: false }));
      s.userData.k = k;
      t.add(s);
      puffs.push(s);
    }
    const ph = rand() * 6;
    animated.push((time) => {
      for (const s of puffs) {
        const k = s.userData.k as number;
        const u = ((time * 0.25 + k * 0.2 + ph) % 1 + 1) % 1;
        s.position.set(Math.sin(time * 0.5 + k) * u * 3, h + u * 12, Math.cos(time * 0.4 + k) * u * 3);
        s.scale.setScalar(2 + u * 7);
        s.material.opacity = 0.5 * (1 - u);
      }
    });
    return place(t, x, z, rand);
  };
  const arm: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 1.2, 10), dark);
    plinth.position.y = 0.6;
    const shoulder = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.9, 6, 0.9), orange);
    upper.position.y = 3;
    const elbow = new THREE.Group();
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5, 0.7), orange);
    fore.position.y = 2.5;
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 4), dark);
    claw.position.y = 5.5;
    elbow.add(fore, claw);
    elbow.position.y = 6;
    shoulder.add(upper, elbow);
    shoulder.position.y = 1.2;
    t.add(plinth, shoulder);
    const ph = rand() * 6;
    animated.push((time) => {
      shoulder.rotation.y = Math.sin(time * 0.6 + ph) * 1.2;
      shoulder.rotation.z = 0.4 + Math.sin(time * 0.9 + ph) * 0.3;
      elbow.rotation.z = -0.9 + Math.sin(time * 1.3 + ph) * 0.5;
    });
    return place(t, x, z, rand);
  };
  const vat: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 2.5 + rand() * 2;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 3.5, 12, 1, true), steel);
    drum.position.y = 1.75;
    (drum.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
    const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 12), melt);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 3.4;
    const halo = new THREE.Sprite(additive(glow, 0xff8020));
    halo.scale.setScalar(r * 3);
    halo.position.y = 4;
    t.add(drum, top, halo);
    const ph = rand() * 6;
    animated.push((time) => halo.scale.setScalar(r * (2.8 + Math.sin(time * 9 + ph) * 0.3)));
    return place(t, x, z, rand);
  };
  const crates: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 3 + Math.floor(rand() * 5);
    for (let k = 0; k < n; k++) {
      const s = 1.4 + rand() * 1.2;
      const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), rand() < 0.3 ? orange : steel);
      c.position.set((rand() - 0.5) * 4, s / 2 + (k > 3 ? s : 0), (rand() - 0.5) * 4);
      c.rotation.y = rand() * 0.6;
      t.add(c);
    }
    return place(t, x, z, rand);
  };
  const stopped: Feature = (x, z, rand) => {
    const r = robotFigure(1 + rand() * 0.6, robotBody, robotEye);
    // Frozen mid-stride, as the song says: one leg forward, an arm up.
    r.legs[0].rotation.x = 0.5;
    r.legs[1].rotation.x = -0.4;
    r.arms[1].rotation.x = -2.2;
    const ph = rand() * 6;
    animated.push((time) => r.eyes.forEach((e) => ((e.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(time * 3 + ph) > 0.6 ? 0xff3020 : 0x4a0a08))));
    return place(r.group, x, z, rand);
  };
  const scrap: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = 0.8 + rand() * 1.4;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
      m.position.set((rand() - 0.5) * 3, s * 0.5, (rand() - 0.5) * 3);
      t.add(m);
    }
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[1.5, stack], [1.5, arm], [1.2, vat], [2, crates], [1.5, stopped], [1, scrap]])(x, z, rand);
}

/** Gamma Knife: clusters of isotope crystal, chrome spheres on poles, cones of light, lenses turning in the air, racks of vials. */
export function theatreFeature(animated: Animated): Feature {
  const isotope = new THREE.MeshPhongMaterial({ color: 0x8aff9a, emissive: 0x20a040, shininess: 140, transparent: true, opacity: 0.85, flatShading: true });
  const chrome = metal(0xe0e8f0, 160);
  const dark = metal(0x2a3038, 40);
  const violet = glowing(0xb080ff, 0.6);
  const glass = new THREE.MeshPhongMaterial({ color: 0xd0f0ff, emissive: 0x204050, transparent: true, opacity: 0.5, shininess: 150 });
  const glow = tex.glowTexture();
  const crystals: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const h = 2 + rand() * 5;
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.6 + rand() * 0.5, 0), isotope);
      c.scale.y = h / 1.2;
      c.position.set((rand() - 0.5) * 4, h / 2, (rand() - 0.5) * 4);
      c.rotation.set((rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5);
      t.add(c);
    }
    const halo = new THREE.Sprite(additive(glow, 0x40ff80));
    halo.scale.setScalar(7);
    halo.position.y = 2;
    t.add(halo);
    const ph = rand() * 6;
    animated.push((time) => (halo.material.opacity = 0.5 + Math.sin(time * 2 + ph) * 0.3));
    return place(t, x, z, rand);
  };
  const sphere: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 5 + rand() * 7;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, h, 8), dark);
    pole.position.y = h / 2;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1.5 + rand(), 20, 14), chrome);
    ball.position.y = h + 1.5;
    t.add(pole, ball);
    return place(t, x, z, rand);
  };
  const cone: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 20 + rand() * 20;
    const c = new THREE.Mesh(
      new THREE.ConeGeometry(4, h, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x60ff90, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    c.rotation.x = Math.PI;
    c.position.y = h / 2;
    const spot = new THREE.Sprite(additive(glow, 0xa0ffc0));
    spot.scale.setScalar(5);
    spot.position.y = 0.4;
    t.add(c, spot);
    const ph = rand() * 6;
    animated.push((time) => ((c.material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.08 * Math.abs(Math.sin(time * 1.5 + ph))));
    t.position.set(x, 0, z);
    return t;
  };
  const lens: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 2 + rand() * 3;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.35, 8, 28), chrome);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 28), glass);
    (disc.material as THREE.MeshPhongMaterial).side = THREE.DoubleSide;
    const o = new THREE.Group();
    o.add(ring, disc);
    o.position.y = 5 + rand() * 8;
    t.add(o);
    const ph = rand() * 6;
    animated.push((time) => {
      o.rotation.set(time * 0.4 + ph, time * 0.25 + ph, 0);
      o.position.y = 7 + Math.sin(time * 0.5 + ph) * 2;
    });
    t.position.set(x, 0, z);
    return t;
  };
  const vials: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const rack = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 1.2), dark);
    rack.position.y = 1.2;
    t.add(rack);
    for (let k = 0; k < 5; k++) {
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.4, 8), k % 2 ? isotope : violet);
      v.position.set(-1.6 + k * 0.8, 2.1, 0);
      t.add(v);
    }
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[2, crystals], [1.2, sphere], [1, cone], [1.2, lens], [1, vials]])(x, z, rand);
}

/** People-Vultures: dead trees, ribcages, skulls, vultures perched on posts and the odd carcass, hunched over. */
export function boneyardFeature(rockMat: THREE.Material, animated: Animated): Feature {
  const bone = new THREE.MeshPhongMaterial({ map: tex.boneTexture(), shininess: 30, specular: 0x333322 });
  const wood = lambert(0x4a3a2a, { flatShading: true });
  const hide = lambert(0x6a4a3a, { flatShading: true });
  const tree: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 5 + rand() * 6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, h, 7), wood);
    trunk.position.y = h / 2;
    t.add(trunk);
    for (let k = 0; k < 4; k++) {
      const l = 2 + rand() * 3;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, l, 5), wood);
      br.position.y = h * (0.5 + rand() * 0.45);
      br.rotation.set((rand() - 0.5) * 1.6, rand() * 6, 0.6 + rand() * 0.6);
      br.translateY(l / 2);
      t.add(br);
    }
    return place(t, x, z, rand);
  };
  const ribcage: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 5 + Math.floor(rand() * 4);
    const r = 1.6 + rand() * 1.4;
    for (let k = 0; k < n; k++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(r * (1 - Math.abs(k - n / 2) * 0.08), 0.12, 6, 14, Math.PI), bone);
      rib.position.set(0, 0.2, -n * 0.45 + k * 0.9);
      t.add(rib);
    }
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, n * 0.9 + 1, 6), bone);
    spine.rotation.x = Math.PI / 2;
    spine.position.y = r + 0.2;
    t.add(spine);
    return place(t, x, z, rand);
  };
  const skull: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const s = 1 + rand() * 1.5;
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 10), bone);
    cranium.position.y = s * 0.8;
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(s * 1.2, s * 0.6, s * 1.4), bone);
    jaw.position.set(0, s * 0.35, s * 0.5);
    const dark = new THREE.MeshBasicMaterial({ color: 0x100806 });
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(s * 0.28, 8, 6), dark);
      e.position.set(side * s * 0.4, s * 0.95, s * 0.85);
      t.add(e);
    }
    t.add(cranium, jaw);
    return place(t, x, z, rand);
  };
  const perch: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 3 + rand() * 3;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, h, 6), wood);
    post.position.y = h / 2;
    const v = vultureFigure(0.6 + rand() * 0.3);
    v.group.position.y = h;
    // Hunched, wings folded.
    v.wings[0].rotation.z = 1.3;
    v.wings[1].rotation.z = -1.3;
    t.add(post, v.group);
    const ph = rand() * 6;
    animated.push((time) => {
      v.neck.rotation.y = Math.sin(time * 0.7 + ph) * 0.8;
      v.neck.rotation.x = Math.max(0, Math.sin(time * 1.1 + ph)) * 0.5;
    });
    return place(t, x, z, rand);
  };
  const carcass: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), hide);
    body.scale.set(1, 0.6, 1.8);
    body.position.y = 0.8;
    t.add(body);
    for (let k = 0; k < 3; k++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.1, 6, 12, Math.PI), bone);
      rib.position.set(0, 0.9, -0.8 + k * 0.8);
      t.add(rib);
    }
    const v = vultureFigure(0.55);
    v.group.position.set(0.8, 1.6, 0.4);
    v.group.rotation.y = -0.6;
    v.wings[0].rotation.z = 1.3;
    v.wings[1].rotation.z = -1.3;
    t.add(v.group);
    const ph = rand() * 6;
    animated.push((time) => (v.neck.rotation.x = 0.4 + Math.max(0, Math.sin(time * 2.2 + ph)) * 0.6));
    return place(t, x, z, rand);
  };
  const boulder: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const s = 1.5 + rand() * 2.5;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), rockMat);
    m.scale.y = 0.6;
    m.position.y = s * 0.4;
    t.add(m);
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[2, tree], [1.5, ribcage], [1, skull], [1.5, perch], [0.8, carcass], [1.2, boulder]])(x, z, rand);
}

/** Wah Wah: stomp boxes with blinking LEDs, speaker stacks that pulse, patch cables, picks spinning in the air, rings of sound. */
export function pedalboardFeature(animated: Animated): Feature {
  const grille = new THREE.MeshLambertMaterial({ map: tex.grilleTexture() });
  const tolex = lambert(0x1a1416, { flatShading: true });
  const chrome = metal(0xc8ccd0, 120);
  const paints = [0xd83a7a, 0x3a8ad8, 0xe0b030, 0x3ab060, 0x8a3ad8].map((c) => metal(c, 70));
  const led = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  const cable = lambert(0x2a2a30);
  const celluloid = metal(0xe8d0a0, 60);
  const glow = tex.glowTexture();
  const stomp: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 2.5 + rand() * 2;
    const h = w * 0.5;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 1.4), paints[Math.floor(rand() * paints.length)]);
    box.position.y = h / 2;
    t.add(box);
    for (let k = 0; k < 3; k++) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.12, w * 0.12, 0.3, 10), tolex);
      knob.position.set(-w * 0.3 + k * w * 0.3, h + 0.15, -w * 0.4);
      t.add(knob);
    }
    const sw = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.1, w * 0.12, 0.35, 10), chrome);
    sw.position.set(0, h + 0.17, w * 0.4);
    const light = new THREE.Mesh(new THREE.SphereGeometry(w * 0.07, 8, 6), led.clone());
    light.position.set(w * 0.35, h + 0.1, w * 0.1);
    t.add(sw, light);
    const ph = rand() * 6;
    const rate = 0.5 + rand() * 2;
    animated.push((time) => (light.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(time * rate + ph) > 0 ? 0xff3020 : 0x3a0a08));
    return place(t, x, z, rand);
  };
  const stack: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 2 + Math.floor(rand() * 3);
    const w = 4 + rand() * 2;
    for (let k = 0; k < n; k++) {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.8, w * 0.6), tolex);
      cab.position.y = w * 0.4 + k * w * 0.82;
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, w * 0.7), grille);
      front.position.set(0, w * 0.4 + k * w * 0.82, w * 0.31);
      t.add(cab, front);
    }
    const ph = rand() * 6;
    animated.push((time) => {
      const beat = Math.max(0, Math.sin(time * 4 + ph)) ** 8;
      t.scale.set(1 + beat * 0.04, 1, 1 + beat * 0.04);
    });
    return place(t, x, z, rand);
  };
  const lead: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 6; k++) pts.push(new THREE.Vector3((k - 3) * 2 + (rand() - 0.5), 0.3 + Math.sin(k * 1.3) * 0.5 + 0.5, Math.sin(k * 0.9 + rand()) * 2));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.18, 6), cable);
    const jack = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.2, 8), chrome);
    jack.position.copy(pts[0]);
    jack.rotation.z = Math.PI / 2;
    t.add(tube, jack);
    return place(t, x, z, rand);
  };
  const plectrum: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, -1.4);
    shape.quadraticCurveTo(1.3, -0.2, 1.1, 0.9);
    shape.quadraticCurveTo(0, 1.6, -1.1, 0.9);
    shape.quadraticCurveTo(-1.3, -0.2, 0, -1.4);
    const p = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }), celluloid);
    const s = 1.5 + rand() * 2;
    p.scale.setScalar(s);
    p.position.y = 4 + rand() * 6;
    t.add(p);
    const ph = rand() * 6;
    animated.push((time) => {
      p.rotation.set(time * 0.6 + ph, time * 0.9 + ph, 0);
      p.position.y = 6 + Math.sin(time * 0.7 + ph) * 1.5;
    });
    t.position.set(x, 0, z);
    return t;
  };
  const wave: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const rings: THREE.Mesh[] = [];
    const colour = [0xd83a7a, 0x3ab0d8, 0xe0b030][Math.floor(rand() * 3)];
    for (let k = 0; k < 3; k++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.15, 6, 32), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      r.rotation.x = Math.PI / 2;
      r.userData.k = k;
      t.add(r);
      rings.push(r);
    }
    const spot = new THREE.Sprite(additive(glow, colour));
    spot.scale.setScalar(3);
    spot.position.y = 0.5;
    t.add(spot);
    const ph = rand() * 6;
    animated.push((time) => {
      for (const r of rings) {
        const u = ((time * 0.5 + (r.userData.k as number) / 3 + ph) % 1 + 1) % 1;
        r.scale.setScalar(1 + u * 8);
        r.position.y = 0.3 + u * 0.5;
        (r.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - u);
      }
    });
    t.position.set(x, 0, z);
    return t;
  };
  return (x, z, rand) => pick(rand, [[2, stomp], [1.5, stack], [1, lead], [1, plectrum], [1.2, wave]])(x, z, rand);
}

/** Robot Stop's gate: two steel pylons, a girder across, hazard lights, a robot's head over the sign, its eyes blinking STOP. */
export function factoryGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const steel = new THREE.MeshLambertMaterial({ map: tex.steelWallTexture(), flatShading: true });
  const orange = lambert(0xe07020, { flatShading: true });
  const eye = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  const glow = tex.glowTexture();
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(2.4, 13, 2.4), steel);
    pylon.position.set(side * (hw + 1.2), 6.5, 0);
    g.add(pylon);
    const lamp = new THREE.Sprite(additive(glow, 0xff9020));
    lamp.scale.setScalar(3);
    lamp.position.set(side * (hw + 1.2), 13.6, 0);
    g.add(lamp);
    animated.push((time) => (lamp.material.opacity = ((time * 1.5 + (side + 1) * 0.25) % 1) < 0.5 ? 1 : 0.15));
  }
  const girder = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 4.8, 2.2, 2.6), orange);
  girder.position.y = 13;
  g.add(girder);
  // Cross-bracing in the girder.
  for (let k = -3; k <= 3; k++) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), steel);
    brace.position.set((k * hw) / 3.2, 13, 1.4);
    brace.rotation.z = k % 2 ? 0.7 : -0.7;
    g.add(brace);
  }
  const head = robotFigure(2.2, steel, eye);
  head.group.position.set(0, 14, 0);
  // Only the head and shoulders above the girder: the body is the girder.
  head.group.children.forEach((c) => (c.visible = c === head.head || c === head.arms[0] || c === head.arms[1]));
  head.head.position.y = 1;
  head.arms.forEach((a) => (a.position.y = 0.6));
  head.arms[1].rotation.x = -Math.PI / 2;
  g.add(head.group);
  animated.push((time) => {
    const stop = Math.sin(time * 2) > 0;
    head.eyes.forEach((e) => (e.material as THREE.MeshBasicMaterial).color.setHex(stop ? 0xff3020 : 0x4a0a08));
    head.head.rotation.y = Math.sin(time * 0.8) * 0.5;
  });
  sign(g, 'ROBOT STOP', '#1a1a1c', '#ff9020', hw * 1.2, 10.4);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A colossal robot standing in the infield, its head turning, one hand raised to say stop, dancing from the waist a little. */
export function robotColossus(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pointAt(ribbon.spline, s);
  const body = metal(0x7a8088, 60);
  const eye = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  const r = robotFigure(9, body, eye);
  r.arms[1].rotation.x = -Math.PI / 2;
  r.arms[1].rotation.z = 0.2;
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.2), body);
  palm.position.y = -1.5;
  r.arms[1].add(palm);
  g.add(r.group);
  const halo = new THREE.Sprite(additive(tex.glowTexture(), 0xff6030));
  halo.scale.setScalar(12);
  halo.position.y = 9 * 3.5;
  g.add(halo);
  animated.push((time) => {
    // Dancing like a robot: a twist from the waist that stops dead between moves.
    const beat = Math.floor(time * 1.5);
    const twist = (beat % 2 === 0 ? 1 : -1) * 0.35;
    r.group.rotation.y = r.group.rotation.y + (twist - r.group.rotation.y) * 0.1;
    r.head.rotation.y = Math.sin(time * 0.5) * 1.2;
    r.arms[0].rotation.x = Math.sin(time * 1.5) > 0 ? 0.6 : -0.6;
    const on = Math.sin(time * 3) > 0.3;
    r.eyes.forEach((e) => (e.material as THREE.MeshBasicMaterial).color.setHex(on ? 0xff3020 : 0x4a0a08));
    halo.material.opacity = on ? 0.9 : 0.2;
  });
  g.position.set(p.x - p.tz * lateral, 0, p.z + p.tx * lateral);
  return g;
}

/** Gamma Knife's gate: two chrome pillars and a ring over the road, green beams converging from it on one point on the road ahead. */
export function gammaGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const chrome = metal(0xe0e8f0, 160);
  const dark = metal(0x2a3038, 40);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 12, 12), chrome);
    pillar.position.set(side * (hw + 0.9), 6, 0);
    g.add(pillar);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(hw * 0.75, 1.1, 10, 40), dark);
  ring.position.y = 13;
  g.add(ring);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x60ff90, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const beams: THREE.Mesh[] = [];
  const focus = new THREE.Vector3(0, 0.3, -22);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const from = new THREE.Vector3(Math.cos(a) * hw * 0.75, 13 + Math.sin(a) * hw * 0.75 * 0.3, 0);
    const len = from.distanceTo(focus);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.3, len, 5), beamMat);
    b.position.copy(from).lerp(focus, 0.5);
    b.lookAt(focus);
    b.rotateX(Math.PI / 2);
    g.add(b);
    beams.push(b);
  }
  const spot = new THREE.Sprite(additive(tex.glowTexture(), 0xa0ffc0));
  spot.scale.setScalar(6);
  spot.position.copy(focus);
  g.add(spot);
  sign(g, 'GAMMA KNIFE', '#08141a', '#80ffb0', hw * 1.1, 17);
  animated.push((time) => {
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    beamMat.opacity = 0.2 + 0.3 * pulse;
    spot.scale.setScalar(4 + 4 * pulse);
    ring.rotation.z = time * 0.4;
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The collimator: a great tilted ring in the infield, two hundred sources on it, their beams meeting on a point of light that moves. */
export function gammaRing(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pointAt(ribbon.spline, s);
  const R = 34;
  const dark = metal(0x2a3038, 40);
  const chrome = metal(0xe0e8f0, 160);
  const rig = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 3, 12, 64), dark);
  rig.add(ring);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.8, 1.2, 8, 64), chrome);
  rig.add(inner);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x60ff90, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
  const focus = new THREE.Object3D();
  rig.add(focus);
  const beams: THREE.Mesh[] = [];
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.5, R, 5), beamMat);
    b.userData.from = new THREE.Vector3(Math.cos(a) * R * 0.8, 0, Math.sin(a) * R * 0.8);
    rig.add(b);
    beams.push(b);
  }
  const spot = new THREE.Sprite(additive(tex.glowTexture(), 0xa0ffc0));
  spot.scale.setScalar(14);
  rig.add(spot);
  rig.position.y = R + 8;
  rig.rotation.x = 0.35;
  g.add(rig);
  // Three legs holding it up.
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2, R + 10, 8), dark);
    leg.position.set(Math.cos(a) * R * 0.9, (R + 10) / 2, Math.sin(a) * R * 0.9);
    leg.rotation.z = Math.cos(a) * 0.25;
    leg.rotation.x = -Math.sin(a) * 0.25;
    g.add(leg);
  }
  animated.push((time) => {
    rig.rotation.y = time * 0.15;
    // The focus wanders about under the ring; every beam follows it.
    focus.position.set(Math.sin(time * 0.7) * 8, -R * 0.6 + Math.sin(time * 1.1) * 4, Math.cos(time * 0.5) * 8);
    for (const b of beams) {
      const from = b.userData.from as THREE.Vector3;
      const len = from.distanceTo(focus.position);
      b.scale.y = len / R;
      b.position.copy(from).lerp(focus.position, 0.5);
      b.lookAt(rig.localToWorld(focus.position.clone()));
      b.rotateX(Math.PI / 2);
    }
    spot.position.copy(focus.position);
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    beamMat.opacity = 0.15 + 0.2 * pulse;
    spot.scale.setScalar(10 + 8 * pulse);
  });
  g.position.set(p.x - p.tz * lateral, 0, p.z + p.tx * lateral);
  return g;
}

/** People-Vultures' gate: two totem posts with vultures perched on them, a spine for a lintel, a skull in the middle of it. */
export function carrionGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const bone = new THREE.MeshPhongMaterial({ map: tex.boneTexture(), shininess: 30, specular: 0x333322 });
  const wood = lambert(0x4a3a2a, { flatShading: true });
  const birds: ReturnType<typeof vultureFigure>[] = [];
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1, 11, 8), wood);
    post.position.set(side * (hw + 0.8), 5.5, 0);
    g.add(post);
    for (let k = 0; k < 3; k++) {
      const sk = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), bone);
      sk.position.set(side * (hw + 0.8), 2 + k * 3, 0.9);
      g.add(sk);
    }
    const v = vultureFigure(1.1);
    v.group.position.set(side * (hw + 0.8), 11, 0);
    v.group.rotation.y = -side * 0.5;
    v.wings[0].rotation.z = 1.3;
    v.wings[1].rotation.z = -1.3;
    g.add(v.group);
    birds.push(v);
  }
  // The spine across, vertebra by vertebra, a skull hung from the middle.
  const n = 14;
  for (let k = 0; k <= n; k++) {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.7, 8), bone);
    v.rotation.z = Math.PI / 2;
    v.position.set(-hw - 0.8 + (k / n) * (hw * 2 + 1.6), 11.2 + Math.sin((k / n) * Math.PI) * 1.5, 0);
    g.add(v);
  }
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10), bone);
  skull.position.set(0, 10, 0);
  g.add(skull);
  const dark = new THREE.MeshBasicMaterial({ color: 0x100806 });
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), dark);
    e.position.set(side * 0.55, 10.2, -1.2);
    g.add(e);
  }
  animated.push((time) => {
    birds.forEach((v, k) => {
      v.neck.rotation.y = Math.sin(time * 0.6 + k * 2) * 0.9;
      // One of them stretches its wings now and then.
      const stretch = Math.max(0, Math.sin(time * 0.3 + k * 3) - 0.8) * 5;
      v.wings[0].rotation.z = 1.3 - stretch;
      v.wings[1].rotation.z = -1.3 + stretch;
    });
  });
  sign(g, 'PEOPLE-VULTURES', '#2a1408', '#e8c070', hw * 1.25, 14.5);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The carcass in the infield: a great ribcage half sunk in the dust, vultures wheeling over it in a slow spiral. */
export function carcass(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pointAt(ribbon.spline, s);
  const bone = new THREE.MeshPhongMaterial({ map: tex.boneTexture(), shininess: 30, specular: 0x333322 });
  const n = 11;
  for (let k = 0; k < n; k++) {
    const r = 14 * (1 - Math.abs(k - n / 2) / n * 0.9);
    const rib = new THREE.Mesh(new THREE.TorusGeometry(r, 0.9, 8, 24, Math.PI), bone);
    rib.position.set(0, 0, -n * 2.2 + k * 4.4);
    rib.rotation.z = 0.15;
    g.add(rib);
  }
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, n * 4.4 + 6, 8), bone);
  spine.rotation.x = Math.PI / 2;
  spine.position.y = 13.5;
  g.add(spine);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12), bone);
  skull.position.set(0, 4, n * 2.2 + 8);
  skull.scale.set(1, 0.8, 1.3);
  g.add(skull);
  const birds: ReturnType<typeof vultureFigure>[] = [];
  for (let k = 0; k < 7; k++) {
    const v = vultureFigure(1.6);
    g.add(v.group);
    birds.push(v);
  }
  animated.push((time) => {
    birds.forEach((v, k) => {
      // Each on its own ring of the spiral, gliding, a flap now and then.
      const a = time * (0.25 + k * 0.03) + k * 0.9;
      const r = 20 + k * 6;
      v.group.position.set(Math.cos(a) * r, 22 + k * 4 + Math.sin(time * 0.5 + k) * 2, Math.sin(a) * r);
      v.group.rotation.y = -a - Math.PI / 2;
      v.group.rotation.z = 0.3;
      const flap = Math.max(0, Math.sin(time * 6 + k * 2) - 0.6) * 1.5;
      v.wings[0].rotation.z = -0.15 + flap;
      v.wings[1].rotation.z = 0.15 - flap;
    });
  });
  g.position.set(p.x - p.tz * lateral, 0, p.z + p.tx * lateral);
  g.rotation.y = 0.6;
  return g;
}

/** Wah Wah's gate: a speaker stack either side and an arch of neon over the road, its lights sweeping from heel to toe and back. */
export function wahGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const grille = new THREE.MeshLambertMaterial({ map: tex.grilleTexture() });
  const tolex = lambert(0x1a1416, { flatShading: true });
  const chrome = metal(0xc8ccd0, 120);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 3.5), tolex);
      cab.position.set(side * (hw + 1.5), 2 + k * 4.1, 0);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 3.5), grille);
      front.position.set(side * (hw + 1.5), 2 + k * 4.1, 1.8);
      g.add(cab, front);
    }
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(hw + 1.5, 0.6, 8, 40, Math.PI), chrome);
  arch.position.y = 12.3;
  g.add(arch);
  const lamps: THREE.Sprite[] = [];
  const glow = tex.glowTexture();
  const colours = [0xd83a7a, 0xe0b030, 0x3ab0d8, 0xb040ff];
  for (let k = 0; k <= 12; k++) {
    const a = (k / 12) * Math.PI;
    const l = new THREE.Sprite(additive(glow, colours[k % 4]));
    l.scale.setScalar(3);
    l.position.set(Math.cos(a) * (hw + 1.5), 12.3 + Math.sin(a) * (hw + 1.5), 0);
    l.userData.k = k;
    g.add(l);
    lamps.push(l);
  }
  animated.push((time) => {
    // The sweep: a wah is a resonance moving up and down the band.
    const sweep = (Math.sin(time * 1.6) * 0.5 + 0.5) * 12;
    for (const l of lamps) l.material.opacity = 0.2 + 0.8 * Math.max(0, 1 - Math.abs((l.userData.k as number) - sweep) / 2.5);
  });
  sign(g, 'WAH WAH', '#1a0a2a', '#ffd040', hw, 9);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A colossal wah pedal in the infield, rocking heel to toe, a ring of sound going out every time the toe goes down. */
export function wahPedal(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pointAt(ribbon.spline, s);
  const period = 3.2;
  const pedal = wahPedalFigure(9, animated, (time) => 0.45 * (0.5 + 0.5 * Math.sin((time / period) * Math.PI * 2)));
  g.add(pedal.group);
  const rings: THREE.Mesh[] = [];
  for (let k = 0; k < 3; k++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.6, 6, 48), new THREE.MeshBasicMaterial({ color: 0xd83a7a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    r.rotation.x = Math.PI / 2;
    r.position.y = 1;
    r.userData.k = k;
    g.add(r);
    rings.push(r);
  }
  animated.push((time) => {
    for (const r of rings) {
      const u = ((time / period + (r.userData.k as number) / 3) % 1 + 1) % 1;
      r.scale.setScalar(10 + u * 70);
      (r.material as THREE.MeshBasicMaterial).opacity = 0.4 * (1 - u);
    }
  });
  g.position.set(p.x - p.tz * lateral, 0, p.z + p.tx * lateral);
  g.rotation.y = -0.8;
  return g;
}
