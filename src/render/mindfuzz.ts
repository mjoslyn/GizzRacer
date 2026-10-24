import * as THREE from 'three';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import * as tex from './textures';

/**
 * Scenery and landmarks for the Mind Fuzz Cup's worlds, after the suite
 * that opens I'm in Your Mind Fuzz: inside a mind, all brain and eyes (I'm
 * in Your Mind), out of it into black and white nothing (I'm Not in Your
 * Mind), a world wrapped in coloured cellophane (Cellophane), and a world
 * gone to fuzz and static under the album's swirl (I'm in Your Mind Fuzz).
 */

export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;
type Animated = ((time: number) => void)[];

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const additive = (map: THREE.Texture, color: number) => new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false });
const glowing = (color: number, intensity = 0.7) => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: intensity, flatShading: true });
const glossy = (color: number, shininess = 90) => new THREE.MeshPhongMaterial({ color, shininess, specular: 0xffffff });
/** Coloured cellophane: see-through, shining, both sides. */
const film = (color: string | number, opacity = 0.45) =>
  new THREE.MeshPhongMaterial({ color, transparent: true, opacity, shininess: 160, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false });

/** Made once and shared: the textures go on hundreds of meshes. */
function once<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
}
const glowTex = once(() => tex.glowTexture());
const irisTex = once(tex.irisTexture);
const fuzzTex = once(tex.fuzzRoadTexture);
const spiralTex = once(tex.opSpiralTexture);

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

function seeded(seed: number): () => number {
  let k = seed;
  return () => (k = (k * 16807) % 2147483647) / 2147483647;
}

/**
 * An eye: the white ball, an iris looking out along +z, and two lids that
 * close over it. `open` 0..1 sets how far the lids are drawn back. `r` is
 * the ball's radius.
 */
export function eyeFigure(r: number): { group: THREE.Group; open: (k: number) => void } {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), glossy(0xf8f2f0, 120));
  // The iris: a cap of the ball round +z, its texture's top row the pupil.
  const iris = new THREE.Mesh(new THREE.SphereGeometry(r * 1.01, 24, 8, 0, Math.PI * 2, 0, 0.62), new THREE.MeshPhongMaterial({ map: irisTex(), shininess: 140, specular: 0xffffff }));
  iris.rotation.x = Math.PI / 2;
  g.add(ball, iris);
  const lidMat = new THREE.MeshPhongMaterial({ color: 0xd87aa0, shininess: 40, flatShading: true, side: THREE.DoubleSide });
  const lids = [1, -1].map((side) => {
    // The upper lid is the top half of a shell, the lower lid the bottom half; each hinges about the x axis.
    const lid = new THREE.Mesh(new THREE.SphereGeometry(r * 1.06, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
    lid.rotation.x = side > 0 ? 0 : Math.PI;
    const pivot = new THREE.Group();
    pivot.add(lid);
    g.add(pivot);
    return { pivot, side };
  });
  // Shut, both lids lean 45 degrees forward and meet across the front; open, they roll back past the top and bottom.
  const open = (k: number) => {
    for (const { pivot, side } of lids) pivot.rotation.x = side * (Math.PI / 4 - k * ((7 * Math.PI) / 12));
  };
  open(1);
  return { group: g, open };
}

/** I'm in Your Mind: eyes on stalks, neurons firing, mounds of brain, floating eyes and spotted mushrooms. */
export function neuronsFeature(animated: Animated): Feature {
  const flesh = new THREE.MeshPhongMaterial({ map: tex.neuralTexture(), shininess: 50, specular: 0x6a3a5a, flatShading: true });
  const stalkMat = lambert(0xc05a8a, { flatShading: true });
  const cell = glowing(0xff70c0, 0.6);
  const dendrite = glowing(0xb070ff, 0.5);
  const cap = glossy(0xff3a8a, 60);
  const spot = lambert(0xfff0f8);
  const glow = glowTex();
  const stalk: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 6 + rand() * 8;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.8, h, 8), stalkMat);
    neck.position.y = h / 2;
    const eye = eyeFigure(1.4 + rand() * 0.8);
    eye.group.position.y = h + 1;
    t.add(neck, eye.group);
    const ph = rand() * 10;
    animated.push((time) => {
      eye.group.rotation.y = Math.sin(time * 0.4 + ph) * 1.2;
      eye.group.rotation.x = Math.sin(time * 0.3 + ph * 2) * 0.3;
      // A blink now and then.
      const b = (time * 0.25 + ph) % 1;
      eye.open(b < 0.04 ? Math.abs(b - 0.02) / 0.02 : 1);
    });
    return place(t, x, z, rand);
  };
  const neuron: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const y = 2 + rand() * 6;
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + rand() * 0.6, 1), cell);
    body.position.y = y;
    t.add(body);
    for (let k = 0; k < 6; k++) {
      const len = 3 + rand() * 5;
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.22, len, 5), dendrite);
      d.position.y = y;
      d.rotation.set((rand() - 0.5) * 3, rand() * 6, (rand() - 0.5) * 3);
      d.translateY(len / 2);
      t.add(d);
    }
    // An axon down to the ground, with a spark running along it.
    const axon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, y, 5), dendrite);
    axon.position.y = y / 2;
    t.add(axon);
    const spark = new THREE.Sprite(additive(glow, 0x80f0ff));
    spark.scale.setScalar(1.6);
    t.add(spark);
    const ph = rand() * 3;
    animated.push((time) => {
      const u = (time * 0.8 + ph) % 1;
      spark.position.y = y * (1 - u);
      spark.material.opacity = Math.sin(u * Math.PI);
    });
    return place(t, x, z, rand);
  };
  const mound: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 3 + rand() * 5;
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), flesh);
    m.scale.y = 0.6 + rand() * 0.4;
    t.add(m);
    return place(t, x, z, rand);
  };
  const floater: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const eye = eyeFigure(1 + rand() * 1.4);
    const y = 5 + rand() * 10;
    eye.group.position.y = y;
    const halo = new THREE.Sprite(additive(glow, 0xff90e0));
    halo.scale.setScalar(6);
    halo.position.y = y;
    t.add(eye.group, halo);
    const ph = rand() * 10;
    animated.push((time) => {
      eye.group.position.y = y + Math.sin(time * 0.9 + ph) * 1.2;
      halo.position.y = eye.group.position.y;
      eye.group.rotation.y = time * 0.3 + ph;
    });
    return place(t, x, z, rand);
  };
  const mushroom: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 2 + rand() * 4;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, h, 8), lambert(0xfff0e8));
    stem.position.y = h / 2;
    const r = 1.5 + rand() * 2;
    const top = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), cap);
    top.position.y = h;
    t.add(stem, top);
    for (let k = 0; k < 6; k++) {
      const a = rand() * Math.PI * 2;
      const e = 0.3 + rand() * 0.9;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(r * 0.12, 6, 4), spot);
      dot.position.set(Math.cos(a) * Math.sin(e) * r, h + Math.cos(e) * r, Math.sin(a) * Math.sin(e) * r);
      t.add(dot);
    }
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[1.6, stalk], [1.4, neuron], [1.2, mound], [1, floater], [1, mushroom]])(x, z, rand);
}

/** A flat arrow, pointing along +y in its own plane: a shaft and a head. */
function arrowShape(len: number, width: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = width / 2;
  const head = len * 0.45;
  s.moveTo(-hw * 0.45, -len / 2);
  s.lineTo(hw * 0.45, -len / 2);
  s.lineTo(hw * 0.45, len / 2 - head);
  s.lineTo(hw, len / 2 - head);
  s.lineTo(0, len / 2);
  s.lineTo(-hw, len / 2 - head);
  s.lineTo(-hw * 0.45, len / 2 - head);
  s.closePath();
  return s;
}

/** An arrow in the round, pointing along +y: for gates, scenery and the hazard's rows. */
export function arrowGeometry(len: number, width: number, depth: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(arrowShape(len, width), { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** I'm Not in Your Mind: spinning spirals, floating arrows, empty frames, checkered cubes and zigzag pillars, all black and white. */
export function opartFeature(animated: Animated): Feature {
  const white = lambert(0xf4f4f0);
  const black = lambert(0x121216);
  const pink = glowing(0xff2a6a, 0.5);
  const spiral = new THREE.MeshBasicMaterial({ map: spiralTex(), side: THREE.DoubleSide });
  const zig = new THREE.MeshLambertMaterial({ map: tex.opartWallTexture() });
  const checks = new THREE.MeshLambertMaterial({ map: tex.opartTexture() });
  const disc: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 3 + rand() * 4;
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 40), spiral);
    d.position.y = r + 1 + rand() * 4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, d.position.y, 6), black);
    pole.position.y = d.position.y / 2;
    t.add(d, pole);
    const dir = rand() < 0.5 ? 1 : -1;
    animated.push((time) => (d.rotation.z = time * 1.4 * dir));
    return place(t, x, z, rand);
  };
  const arrow: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const len = 4 + rand() * 5;
    const a = new THREE.Mesh(arrowGeometry(len, len * 0.6, 0.6), rand() < 0.25 ? pink : rand() < 0.5 ? white : black);
    const y = 3 + rand() * 9;
    a.position.y = y;
    a.rotation.z = Math.floor(rand() * 4) * (Math.PI / 2);
    t.add(a);
    const ph = rand() * 10;
    animated.push((time) => {
      a.position.y = y + Math.sin(time + ph) * 0.8;
      a.rotation.y = Math.sin(time * 0.5 + ph) * 0.6;
    });
    return place(t, x, z, rand);
  };
  const frame: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 3 + rand() * 4;
    const h = w * (1 + rand() * 0.6);
    const bar = (bw: number, bh: number, px: number, py: number, m: THREE.Material) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.4), m);
      b.position.set(px, py, 0);
      t.add(b);
    };
    // A frame with nothing in it.
    bar(w, 0.5, 0, h, white);
    bar(w, 0.5, 0, 0.25, white);
    bar(0.5, h, -w / 2, h / 2, black);
    bar(0.5, h, w / 2, h / 2, black);
    return place(t, x, z, rand);
  };
  const cube: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const s = 2 + rand() * 3;
    const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), checks);
    const y = s + rand() * 4;
    c.position.y = y;
    t.add(c);
    const ph = rand() * 10;
    animated.push((time) => c.rotation.set(time * 0.3 + ph, time * 0.5, 0));
    return place(t, x, z, rand);
  };
  const pillar: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 6 + rand() * 14;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, h, 12), zig);
    p.position.y = h / 2;
    t.add(p);
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[1.4, disc], [1.6, arrow], [1, frame], [1, cube], [1.2, pillar]])(x, z, rand);
}

/** Cellophane: coloured panes on frames, ribbons of it waving, wrapped sweets, and clusters of coloured glass. */
export function panesFeature(animated: Animated): Feature {
  const colours = tex.CELLOPHANE_COLOURS;
  const sheets = colours.map((c) => film(c, 0.5));
  const frameMat = lambert(0x1a1a24);
  const pane: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const w = 3 + rand() * 4;
    const h = 4 + rand() * 6;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sheets[Math.floor(rand() * sheets.length)]);
    sheet.position.y = h / 2 + 0.6;
    t.add(sheet);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, h + 1, 0.25), frameMat);
      post.position.set((side * w) / 2, (h + 1) / 2, 0);
      t.add(post);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.25, 0.25, 0.25), frameMat);
    top.position.y = h + 0.85;
    t.add(top);
    const ph = rand() * 10;
    animated.push((time) => (sheet.rotation.y = Math.sin(time * 0.6 + ph) * 0.25));
    return place(t, x, z, rand);
  };
  const ribbon: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 8 + rand() * 8;
    const strips: THREE.Mesh[] = [];
    for (let k = 0; k < 6; k++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.2, h / 6), sheets[(k + Math.floor(rand() * 5)) % sheets.length]);
      s.position.y = (k + 0.5) * (h / 6);
      t.add(s);
      strips.push(s);
    }
    const ph = rand() * 10;
    animated.push((time) => strips.forEach((s, k) => (s.rotation.y = time * 0.8 + ph + k * 0.5)));
    return place(t, x, z, rand);
  };
  const sweet: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 1 + rand() * 1.4;
    const c = Math.floor(rand() * sheets.length);
    const core = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), glossy(new THREE.Color(colours[c]).getHex(), 120));
    const wrap = new THREE.Mesh(new THREE.SphereGeometry(r * 1.15, 16, 12), sheets[(c + 2) % sheets.length]);
    const y = r + 0.5 + rand() * 6;
    t.add(core, wrap);
    for (const side of [-1, 1]) {
      const twist = new THREE.Mesh(new THREE.ConeGeometry(r * 0.9, r * 1.4, 8, 1, true), sheets[(c + 2) % sheets.length]);
      twist.rotation.z = (side * Math.PI) / 2;
      twist.position.x = side * r * 1.6;
      t.add(twist);
    }
    t.children.forEach((m) => (m.position.y += y));
    const ph = rand() * 10;
    animated.push((time) => (t.rotation.x = Math.sin(time * 0.5 + ph) * 0.2));
    return place(t, x, z, rand);
  };
  const cluster: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const h = 2 + rand() * 6;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.8 + rand(), h, 0.8 + rand()), sheets[k % sheets.length]);
      b.position.set((rand() - 0.5) * 3, h / 2, (rand() - 0.5) * 3);
      b.rotation.set((rand() - 0.5) * 0.4, rand() * 3, (rand() - 0.5) * 0.4);
      t.add(b);
    }
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[1.8, pane], [1.2, ribbon], [1.2, sweet], [1, cluster]])(x, z, rand);
}

/** I'm in Your Mind Fuzz: fuzz trees, amp stacks, televisions of static, fuzz creatures and speaker cones thumping. */
export function staticFeature(animated: Animated): Feature {
  const fuzz = new THREE.MeshLambertMaterial({ map: fuzzTex(), color: 0xd0a0ff, flatShading: true });
  const green = new THREE.MeshLambertMaterial({ map: fuzzTex(), color: 0x90ff90, flatShading: true });
  const trunk = lambert(0x2a1a3a, { flatShading: true });
  const amp = new THREE.MeshLambertMaterial({ map: tex.ampTexture() });
  const cabinet = lambert(0x1a1420, { flatShading: true });
  const screenTex = tex.fuzzGroundTexture();
  screenTex.repeat.set(0.3, 0.3);
  const screen = new THREE.MeshBasicMaterial({ map: screenTex });
  animated.push((time) => screenTex.offset.set((time * 7.3) % 1, (time * 11.1) % 1));
  const eye = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x101010 });
  const cone = glossy(0x2a2a2a, 30);
  const glow = glowTex();
  const tree: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 4 + rand() * 6;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, h, 6), trunk);
    tr.position.y = h / 2;
    t.add(tr);
    for (let k = 0; k < 3; k++) {
      const r = 1.4 + rand() * 1.6;
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), k % 2 ? green : fuzz);
      ball.position.set((rand() - 0.5) * 2.5, h + (rand() - 0.3) * 2, (rand() - 0.5) * 2.5);
      t.add(ball);
    }
    return place(t, x, z, rand);
  };
  const stack: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 1.6), amp);
      c.position.y = 1.3 + k * 2.6;
      t.add(c);
    }
    const lamp = new THREE.Sprite(additive(glow, 0x80ff90));
    lamp.scale.setScalar(1.4);
    lamp.position.set(1.1, n * 2.6 + 0.3, 0.8);
    t.add(lamp);
    const ph = rand() * 10;
    animated.push((time) => (lamp.material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(time * 4 + ph))));
    return place(t, x, z, rand);
  };
  const telly: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.8, 2.6), cabinet);
    box.position.y = 1.4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.1), screen);
    face.position.set(0, 1.45, 1.31);
    t.add(box, face);
    t.rotation.z = (rand() - 0.5) * 0.3;
    return place(t, x, z, rand);
  };
  const creature: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 1 + rand() * 1.2;
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), rand() < 0.5 ? fuzz : green);
    body.position.y = r;
    t.add(body);
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(r * 0.28, 8, 6), eye);
      e.position.set(side * r * 0.35, r * 1.25, r * 0.8);
      const p = new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 6, 4), pupil);
      p.position.set(side * r * 0.35, r * 1.25, r * 1.05);
      t.add(e, p);
    }
    const ph = rand() * 10;
    animated.push((time) => {
      body.position.y = r + Math.abs(Math.sin(time * 3 + ph)) * 0.4;
      t.rotation.y = Math.sin(time * 0.4 + ph) * 2;
    });
    t.position.set(x, 0, z);
    return t;
  };
  const speaker: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 1.6 + rand() * 1.4;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(r * 2.4, r * 2.4, r), cabinet);
    cab.position.y = r * 1.2;
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, r * 0.6, 20, 1, true), cone);
    c.rotation.x = -Math.PI / 2;
    c.position.set(0, r * 1.2, r * 0.55);
    t.add(cab, c);
    const ph = rand() * 10;
    animated.push((time) => (c.scale.y = 1 + Math.max(0, Math.sin(time * 9 + ph)) * 0.5));
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[1.6, tree], [1.2, stack], [0.8, telly], [1, creature], [1, speaker]])(x, z, rand);
}

/** I'm in Your Mind's gate: two columns of brain and a great eye between them, looking down the road at the karts coming. */
export function eyeGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const flesh = new THREE.MeshPhongMaterial({ map: tex.brainWallTexture(), shininess: 40, specular: 0x6a3a5a });
  for (const side of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 14, 12), flesh);
    col.position.set(side * (hw + 1.6), 7, 0);
    g.add(col);
  }
  const lintel = new THREE.Mesh(new THREE.TorusGeometry(hw + 1.6, 1.2, 10, 32, Math.PI), flesh);
  lintel.position.y = 14;
  g.add(lintel);
  const eye = eyeFigure(3.4);
  eye.group.position.y = 14 + hw * 0.55;
  // Looking back down the road at the karts coming.
  eye.group.rotation.y = Math.PI;
  g.add(eye.group);
  const halo = new THREE.Sprite(additive(glowTex(), 0xff80e0));
  halo.scale.setScalar(16);
  halo.position.copy(eye.group.position);
  g.add(halo);
  animated.push((time) => {
    eye.group.rotation.y = Math.PI + Math.sin(time * 0.5) * 0.5;
    eye.group.rotation.x = 0.25 + Math.sin(time * 0.7) * 0.1;
    const b = (time * 0.2) % 1;
    eye.open(b < 0.03 ? Math.abs(b - 0.015) / 0.015 : 1);
  });
  sign(g, "I'M IN YOUR MIND", '#4a0a5a', '#ffe0f4', hw * 1.2, 10.4);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * I'm in Your Mind's landmark: the face off the album's cover, a giant
 * head rising out of the folds, its two great eyes and a third in its
 * brow looking about, the swirl turning behind it.
 */
export function mindFace(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const skin = new THREE.MeshPhongMaterial({ color: 0xe890b8, shininess: 30, flatShading: true });
  const brain = new THREE.MeshPhongMaterial({ map: tex.neuralTexture(), shininess: 50, specular: 0x6a3a5a });
  const R = 26;
  const head = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), skin);
  head.scale.set(1, 1.25, 0.9);
  head.position.y = R * 1.1;
  // The top of the head lifted off, the brain showing.
  const cortex = new THREE.Mesh(new THREE.SphereGeometry(R * 0.96, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.4), brain);
  cortex.scale.copy(head.scale);
  cortex.position.y = head.position.y + R * 0.18;
  g.add(head, cortex);
  const eyes = [-1, 1].map((side) => {
    const e = eyeFigure(R * 0.24);
    e.group.position.set(side * R * 0.38, head.position.y + R * 0.1, R * 0.78);
    g.add(e.group);
    return e;
  });
  const third = eyeFigure(R * 0.14);
  third.group.position.set(0, head.position.y + R * 0.55, R * 0.72);
  g.add(third.group);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(R * 0.25, R * 0.05, 8, 24, Math.PI), lambert(0x6a1040));
  mouth.position.set(0, head.position.y - R * 0.45, R * 0.82);
  mouth.rotation.z = Math.PI;
  g.add(mouth);
  const swirl = new THREE.Mesh(new THREE.CircleGeometry(R * 2.2, 48), new THREE.MeshBasicMaterial({ map: tex.swirlTexture(), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  swirl.position.set(0, head.position.y, -R * 1.2);
  g.add(swirl);
  animated.push((time) => {
    swirl.rotation.z = time * 0.2;
    eyes.forEach((e, k) => {
      e.group.rotation.y = Math.sin(time * 0.35) * 0.6;
      e.group.rotation.x = Math.sin(time * 0.27 + k) * 0.2;
      const b = (time * 0.12) % 1;
      e.open(b < 0.03 ? Math.abs(b - 0.015) / 0.015 : 1);
    });
    third.group.rotation.y = -Math.sin(time * 0.5) * 0.8;
    third.open(0.6 + 0.4 * Math.sin(time * 0.8));
  });
  g.position.set(at.x, 0, at.z);
  // Facing the road.
  g.rotation.y = at.heading + (lateral > 0 ? Math.PI / 2 : -Math.PI / 2);
  return g;
}

/**
 * I'm Not in Your Mind's gate: posts of black and white, and four arrows
 * across the top, up, down, left and right, but for the one that isn't
 * there, which wanders from post to post.
 */
export function arrowGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const zig = new THREE.MeshLambertMaterial({ map: tex.opartWallTexture() });
  const white = glowing(0xf4f4f0, 0.4);
  const pink = glowing(0xff2a6a, 0.8);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(2, 14, 2), zig);
    post.position.set(side * (hw + 1), 7, 0);
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 4, 1.2, 1.6), zig);
  beam.position.y = 14;
  g.add(beam);
  const geo = arrowGeometry(4.5, 3.2, 0.6);
  const arrows = [0, 1, 2, 3].map((k) => {
    const a = new THREE.Mesh(geo, white);
    // Left, down, up, right, as the suite's game reads them; local +x is to the left.
    a.rotation.z = [Math.PI / 2, Math.PI, 0, -Math.PI / 2][k];
    a.position.set(hw * 0.75 - (k * hw * 1.5) / 3, 17.5, 0);
    g.add(a);
    return a;
  });
  animated.push((time) => {
    const missing = Math.floor(time / 1.8) % 4;
    arrows.forEach((a, k) => {
      a.visible = k !== missing;
      a.material = Math.sin(time * 6 + k) > 0.6 ? pink : white;
    });
  });
  sign(g, "I'M NOT IN YOUR MIND", '#101014', '#ff2a6a', hw * 1.2, 10.4);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * I'm Not in Your Mind's landmark: a giant head of black and white checks,
 * the top of it open and nothing inside, arrows wheeling round it and one
 * pointing down into the empty skull.
 */
export function emptyHead(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const checksTex = tex.opartTexture();
  checksTex.repeat.set(6, 4);
  const checks = new THREE.MeshLambertMaterial({ map: checksTex, side: THREE.DoubleSide });
  const R = 26;
  // A head with the top missing: a sphere from the brow down, open above.
  const skull = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.68), checks);
  skull.scale.set(1, 1.2, 0.95);
  skull.position.y = R * 1.15;
  const inside = new THREE.Mesh(new THREE.CircleGeometry(R * Math.sin(Math.PI * 0.32) * 0.98, 40), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }));
  inside.rotation.x = -Math.PI / 2;
  inside.position.y = skull.position.y + R * Math.cos(Math.PI * 0.32) * 1.2 - 1.5;
  g.add(skull, inside);
  const hollow = lambert(0x000000);
  for (const side of [-1, 1]) {
    // Where the eyes would be: holes.
    const e = new THREE.Mesh(new THREE.CircleGeometry(R * 0.15, 24), hollow);
    e.position.set(side * R * 0.36, skull.position.y + R * 0.05, R * 0.9);
    g.add(e);
  }
  const pink = glowing(0xff2a6a, 0.8);
  const white = glowing(0xf4f4f0, 0.5);
  const ring = new THREE.Group();
  ring.position.y = skull.position.y + R * 0.4;
  const geo = arrowGeometry(9, 6, 1.2);
  for (let k = 0; k < 8; k++) {
    const a = new THREE.Mesh(geo, k % 2 ? white : pink);
    const ang = (k / 8) * Math.PI * 2;
    a.position.set(Math.cos(ang) * R * 1.6, 0, Math.sin(ang) * R * 1.6);
    a.rotation.set(0, -ang, Math.PI / 2);
    ring.add(a);
  }
  const down = new THREE.Mesh(arrowGeometry(16, 11, 2), pink);
  down.rotation.z = Math.PI;
  const downY = inside.position.y + 22;
  down.position.y = downY;
  g.add(ring, down);
  animated.push((time) => {
    ring.rotation.y = time * 0.25;
    down.position.y = downY + Math.sin(time * 2) * 3;
    down.rotation.y = time * 0.6;
  });
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.heading + (lateral > 0 ? Math.PI / 2 : -Math.PI / 2);
  return g;
}

/** Cellophane's gate: a frame hung with sheets of coloured cellophane, swaying, the light through them. */
export function filmGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const frame = glossy(0x1a1a24, 80);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 15, 1.2), frame);
    post.position.set(side * (hw + 0.6), 7.5, 0);
    g.add(post);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 2.4, 1, 1.2), frame);
  bar.position.y = 15;
  g.add(bar);
  // Sheets hanging from the bar down to above head height, each its own colour.
  const n = 6;
  const sheets: THREE.Group[] = [];
  for (let k = 0; k < n; k++) {
    const w = (hw * 2) / n;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.98, 5), film(tex.CELLOPHANE_COLOURS[k % 5], 0.55));
    const pivot = new THREE.Group();
    sheet.position.y = -2.5;
    pivot.add(sheet);
    pivot.position.set(hw - w * (k + 0.5), 14.5, 0);
    g.add(pivot);
    sheets.push(pivot);
  }
  animated.push((time) => sheets.forEach((p, k) => (p.rotation.x = Math.sin(time * 1.3 + k * 0.8) * 0.18)));
  sign(g, 'CELLOPHANE', '#30a0ff', '#fff4c0', hw * 1.1, 6.8);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * Cellophane's landmark: a flower taller than anything, every petal a
 * sheet of coloured cellophane, turning slowly on its stem with the light
 * burning white in the middle of it.
 */
export function cellophaneBloom(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const H = 60;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3, H, 12), film(0x30e080, 0.7));
  stem.position.y = H / 2;
  g.add(stem);
  for (const [y, side] of [[18, 1], [32, -1]]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8), film(0x30e080, 0.45));
    leaf.scale.set(1.4, 0.1, 0.6);
    leaf.position.set(side * 11, y, 0);
    leaf.rotation.z = side * 0.4;
    g.add(leaf);
  }
  const head = new THREE.Group();
  head.position.y = H;
  const petals = 10;
  for (let k = 0; k < petals; k++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(14, 18, 10), film(tex.CELLOPHANE_COLOURS[k % 5], 0.42));
    p.scale.set(0.5, 0.08, 1);
    const a = (k / petals) * Math.PI * 2;
    p.position.set(Math.cos(a) * 13, 0, Math.sin(a) * 13);
    p.rotation.y = -a + Math.PI / 2;
    p.rotation.x = 0.35;
    head.add(p);
  }
  // Standing up to face the road, a little tilted.
  head.rotation.x = Math.PI / 2 - 0.3;
  const core = new THREE.Sprite(additive(glowTex(), 0xfff4d0));
  core.scale.setScalar(30);
  head.add(core);
  g.add(head);
  animated.push((time) => {
    head.rotation.z = time * 0.15;
    core.material.opacity = 0.7 + 0.3 * Math.sin(time * 1.5);
  });
  g.scale.setScalar(1.4);
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.heading + (lateral > 0 ? Math.PI / 2 : -Math.PI / 2);
  return g;
}

/** I'm in Your Mind Fuzz's gate: two stacks of amps and a speaker cab across the top, fuzz growing on them, the lamps green. */
export function fuzzGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const amp = new THREE.MeshLambertMaterial({ map: tex.ampTexture() });
  const fuzz = new THREE.MeshLambertMaterial({ map: fuzzTex(), color: 0xd0a0ff, flatShading: true });
  const lamps: THREE.Sprite[] = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.2, 2.4), amp);
      cab.position.set(side * (hw + 1.8), 1.6 + k * 3.2, 0);
      g.add(cab);
    }
    const tuft = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), fuzz);
    tuft.position.set(side * (hw + 1.8), 14.4, 0);
    g.add(tuft);
    const lamp = new THREE.Sprite(additive(glowTex(), 0x80ff90));
    lamp.scale.setScalar(3);
    lamp.position.set(side * (hw + 1.8), 11, -1.3);
    g.add(lamp);
    lamps.push(lamp);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.4, 3, 2.4), amp);
  top.position.y = 11.3;
  g.add(top);
  animated.push((time) => lamps.forEach((l, k) => (l.material.opacity = Math.sin(time * 8 + k * 2) > 0 ? 1 : 0.2)));
  sign(g, 'MIND FUZZ', '#2a0a3a', '#80ff90', hw * 1.1, 7.6);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/**
 * I'm in Your Mind Fuzz's landmark: a VU meter as tall as a tower, its
 * needle swinging up into the gold and slamming into the red, fuzz heaped
 * round its foot and the album's swirl turning in the sky behind it.
 */
export function fuzzMeter(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const at = offRoad(ribbon, s, lateral);
  const W = 48;
  const H = 30;
  const casing = glossy(0x1a1420, 60);
  const box = new THREE.Mesh(new THREE.BoxGeometry(W + 6, H + 6, 8), casing);
  box.position.y = H / 2 + 12;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex.meterTexture() }));
  face.position.set(0, box.position.y, 4.05);
  g.add(box, face);
  const needle = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, H * 0.85, 0.3), lambert(0x101010));
  bar.position.y = (H * 0.85) / 2;
  needle.add(bar);
  needle.position.set(0, box.position.y - H / 2 + H * 0.05, 4.3);
  g.add(needle);
  const redLight = new THREE.Sprite(additive(glowTex(), 0xff2020));
  redLight.scale.setScalar(10);
  redLight.position.set(W / 2 - 3, box.position.y + H / 2 + 4, 4.5);
  g.add(redLight);
  const fuzz = new THREE.MeshLambertMaterial({ map: fuzzTex(), color: 0xd0a0ff, flatShading: true });
  const green = new THREE.MeshLambertMaterial({ map: fuzzTex(), color: 0x90ff90, flatShading: true });
  const rand = seeded(23);
  for (let k = 0; k < 16; k++) {
    const r = 3 + rand() * 4;
    const tuft = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), k % 3 ? fuzz : green);
    tuft.position.set((rand() - 0.5) * (W + 16), r * 0.7, (rand() - 0.5) * 14);
    g.add(tuft);
  }
  const swirl = new THREE.Mesh(new THREE.CircleGeometry(70, 64), new THREE.MeshBasicMaterial({ map: tex.swirlTexture(), transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  swirl.position.set(0, 80, -60);
  g.add(swirl);
  animated.push((time) => {
    // The needle: rising, into the gold, slamming into the red now and then, back down.
    const u = (time * 0.18) % 1;
    const level = u < 0.6 ? 0.3 + 0.4 * Math.sin(u * 9) ** 2 : u < 0.75 ? 0.95 + Math.sin(time * 40) * 0.03 : 0.5;
    needle.rotation.z = ((50 - 100 * level) * Math.PI) / 180;
    redLight.material.opacity = level > 0.8 ? 1 : 0.1;
    swirl.rotation.z = -time * 0.12;
  });
  g.position.set(at.x, 0, at.z);
  g.rotation.y = at.heading + (lateral > 0 ? Math.PI / 2 : -Math.PI / 2);
  return g;
}
