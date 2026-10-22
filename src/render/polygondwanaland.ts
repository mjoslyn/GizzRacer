import * as THREE from 'three';
import { pointAt } from '../tracks/spline';
import type { Ribbon } from '../tracks/track';
import * as tex from './textures';

/**
 * Scenery and landmarks for the Polygondwanaland Cup's worlds: the castle
 * falling down in its lava moat (Crumbling Castle), the castle on the
 * clouds (The Castle in the Air), the inside of a living cell (Inner Cell)
 * and the world in four colours (Tetrachromacy).
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

/** A sign over the road, facing the karts coming. */
function sign(g: THREE.Group, text: string, bg: string, fg: string, width: number, y: number): void {
  const map = tex.billboardTexture(text, bg, fg);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.25), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
  m.position.y = y;
  m.rotation.y = Math.PI;
  g.add(m);
}

/** A round castle tower: a stone drum, a ring of merlons on top (some fallen), and a pointed roof if it still has one. */
function tower(stone: THREE.Material, roof: THREE.Material | null, radius: number, height: number, rand: () => number, broken = 0): THREE.Group {
  const g = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.08, height, 12), stone);
  drum.position.y = height / 2;
  g.add(drum);
  const merlons = 10;
  for (let k = 0; k < merlons; k++) {
    if (rand() < broken) continue;
    const a = (k / merlons) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.4, radius * 0.45, radius * 0.3), stone);
    m.position.set(Math.cos(a) * radius * 0.92, height + radius * 0.22, Math.sin(a) * radius * 0.92);
    m.rotation.y = -a;
    g.add(m);
  }
  if (roof) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius * 1.15, radius * 2.4, 12), roof);
    cone.position.y = height + radius * 1.2;
    g.add(cone);
  }
  return g;
}

/** A flame on a stick: two glows, flickering. */
function flame(glow: THREE.Texture, animated: Animated, size = 1.6): THREE.Group {
  const g = new THREE.Group();
  const outer = new THREE.Sprite(additive(glow, 0xff6a20));
  const inner = new THREE.Sprite(additive(glow, 0xffd080));
  outer.scale.setScalar(size * 1.6);
  inner.scale.setScalar(size * 0.8);
  g.add(outer, inner);
  const ph = Math.random() * 6;
  animated.push((time) => {
    const f = 0.85 + Math.sin(time * 17 + ph) * 0.1 + Math.sin(time * 29 + ph * 2) * 0.08;
    outer.scale.setScalar(size * 1.6 * f);
    inner.position.y = Math.sin(time * 11 + ph) * 0.08;
  });
  return g;
}

/** Crumbling Castle: broken towers, a stretch of wall half fallen, rubble, braziers, lava pools, and stones dropping off the battlements. */
export function ruinsFeature(rockMat: THREE.Material, animated: Animated): Feature {
  const stone = new THREE.MeshLambertMaterial({ map: tex.castleWallTexture(), flatShading: true });
  const roof = lambert(0x5a1a1a, { flatShading: true });
  const iron = lambert(0x2a2a2e);
  const lava = new THREE.MeshBasicMaterial({ map: tex.lavaTexture() });
  const glow = tex.glowTexture();
  const banner = lambert(0x8a1a1a, { side: THREE.DoubleSide });
  const ruinedTower: Feature = (x, z, rand) => {
    const t = tower(stone, rand() < 0.3 ? roof : null, 3 + rand() * 2.5, 10 + rand() * 14, rand, 0.45);
    // A stone works loose from the top, falls, and is back up there the next time round.
    const top = (t.children[0] as THREE.Mesh).position.y * 2;
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.9), stone);
    t.add(block);
    const ph = rand() * 6;
    const out = 3.6 + rand() * 2;
    animated.push((time) => {
      const u = ((time * 0.18 + ph) % 1 + 1) % 1;
      const fall = Math.max(0, u - 0.6) / 0.4;
      block.position.set(out, top * (1 - fall * fall), 0);
      block.rotation.set(fall * 6, fall * 3, 0);
      block.visible = block.position.y > 0;
    });
    if (rand() < 0.5) {
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3), banner);
      flag.position.set(0, top * 0.75, 3.2);
      t.add(flag);
      animated.push((time) => (flag.rotation.y = Math.sin(time * 2 + ph) * 0.25));
    }
    return place(t, x, z, rand);
  };
  const wall: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 5 + Math.floor(rand() * 5);
    for (let k = 0; k < n; k++) {
      // Crumbled down toward one end.
      const h = 6 * (1 - k / n) * (0.6 + rand() * 0.4) + 1;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(2.4, h, 1.6), stone);
      seg.position.set(k * 2.4, h / 2, 0);
      t.add(seg);
    }
    for (let k = 0; k < 5; k++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + rand() * 0.7, 0), rockMat);
      r.position.set(n * 2.4 + rand() * 4, 0.3, (rand() - 0.5) * 4);
      t.add(r);
    }
    return place(t, x, z, rand);
  };
  const brazier: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 3, 6), iron);
    post.position.y = 1.5;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.4, 0.6, 8), iron);
    bowl.position.y = 3.2;
    const f = flame(glow, animated, 1.8);
    f.position.y = 3.9;
    t.add(post, bowl, f);
    return place(t, x, z, rand);
  };
  const pool: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CircleGeometry(3 + rand() * 4, 16), lava);
    p.rotation.x = -Math.PI / 2;
    p.position.y = 0.05;
    const heat = new THREE.Sprite(additive(glow, 0xff5010));
    heat.scale.setScalar(9);
    heat.position.y = 1.2;
    t.add(p, heat);
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[2.5, ruinedTower], [2, wall], [1, brazier], [1, pool]])(x, z, rand);
}

/** The Castle in the Air: little floating islands with turrets, puffs of cloud, kites and pennants. */
export function cloudsFeature(animated: Animated): Feature {
  const stone = lambert(0xf0e8dc, { flatShading: true });
  const roof = lambert(0x3a6ad8, { flatShading: true });
  const earth = lambert(0x8a6a4a, { flatShading: true });
  const grass = lambert(0x6ac04a, { flatShading: true });
  const puff = tex.glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  const pennant = lambert(0xffc040, { side: THREE.DoubleSide });
  const island: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const r = 4 + rand() * 5;
    const rock = new THREE.Mesh(new THREE.ConeGeometry(r, r * 2, 7), earth);
    rock.rotation.x = Math.PI;
    rock.position.y = -r;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.6, 7), grass);
    t.add(rock, top);
    if (rand() < 0.7) {
      const turret = tower(stone, roof, 1.2 + rand(), 4 + rand() * 6, rand);
      t.add(turret);
    }
    const ph = rand() * 6;
    // Bobbing about whatever height the scenery put it at.
    let base: number | null = null;
    animated.push((time) => {
      base ??= t.position.y;
      t.position.y = base + Math.sin(time * 0.4 + ph) * 0.8;
    });
    t.position.set(x, 0, z);
    return t;
  };
  const cloud: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 4 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
      s.scale.setScalar(6 + rand() * 8);
      s.position.set((rand() - 0.5) * 12, (rand() - 0.5) * 3, (rand() - 0.5) * 6);
      t.add(s);
    }
    const ph = rand() * 6;
    animated.push((time) => (t.position.x = x + Math.sin(time * 0.05 + ph) * 6));
    t.position.set(x, 0, z);
    return t;
  };
  const kite: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const k = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), pennant);
    k.rotation.z = Math.PI / 4;
    t.add(k);
    const ph = rand() * 6;
    animated.push((time) => {
      k.position.set(Math.sin(time * 0.7 + ph) * 3, Math.sin(time * 1.3 + ph) * 1.5, 0);
      k.rotation.y = Math.sin(time + ph) * 0.6;
    });
    t.position.set(x, 0, z);
    return t;
  };
  return (x, z, rand) => pick(rand, [[3, island], [3, cloud], [0.8, kite]])(x, z, rand);
}

/** Inner Cell: mitochondria, ribosomes, vesicles bobbing, a Golgi stack, strands of the cytoskeleton. */
export function cytoplasmFeature(animated: Animated): Feature {
  const mito = new THREE.MeshPhongMaterial({ color: 0xff8a5a, emissive: 0x5a1a0a, shininess: 60 });
  const crista = lambert(0xffd0a0);
  const ribo = glowing(0x9affd0, 0.35);
  const vesicle = new THREE.MeshPhongMaterial({ color: 0xffa0d8, emissive: 0x6a1a4a, transparent: true, opacity: 0.55, shininess: 100 });
  const golgi = glowing(0xc05aff, 0.25);
  const strand = glowing(0xffe0f0, 0.3);
  const mitochondrion: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const len = 4 + rand() * 4;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.6, len, 6, 12), mito);
    body.rotation.z = Math.PI / 2;
    body.position.y = 2;
    t.add(body);
    // The folds inside, showing through as ridges.
    for (let k = 0; k < 5; k++) {
      const ridge = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.12, 4, 16), crista);
      ridge.rotation.y = Math.PI / 2;
      ridge.position.set(-len / 2 + (k + 0.5) * (len / 5), 2, 0);
      t.add(ridge);
    }
    const ph = rand() * 6;
    animated.push((time) => (t.rotation.z = Math.sin(time * 0.5 + ph) * 0.08));
    return place(t, x, z, rand);
  };
  const ribosomes: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 9; k++) {
      const r = new THREE.Mesh(new THREE.SphereGeometry(0.35 + rand() * 0.3, 8, 6), ribo);
      r.position.set((rand() - 0.5) * 5, 0.4 + rand() * 3, (rand() - 0.5) * 5);
      t.add(r);
    }
    return place(t, x, z, rand);
  };
  const vesicles: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const bubbles: THREE.Mesh[] = [];
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1 + rand() * 1.5, 16, 12), vesicle);
      t.add(b);
      bubbles.push(b);
    }
    const ph = rand() * 6;
    animated.push((time) => bubbles.forEach((b, k) => b.position.set(Math.sin(time * 0.3 + k * 2 + ph) * 3, 3 + k * 2 + Math.sin(time * 0.9 + k + ph), Math.cos(time * 0.3 + k * 2 + ph) * 3)));
    t.position.set(x, 0, z);
    return t;
  };
  const golgiStack: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const disc = new THREE.Mesh(new THREE.TorusGeometry(3 - k * 0.25, 0.4, 6, 20, Math.PI * 1.2), golgi);
      disc.rotation.x = Math.PI / 2;
      disc.position.y = 0.6 + k * 0.9;
      t.add(disc);
    }
    return place(t, x, z, rand);
  };
  const filament: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 10 + rand() * 12;
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, h, 5), strand);
    f.position.y = h / 2;
    f.rotation.z = (rand() - 0.5) * 0.8;
    t.add(f);
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[2, mitochondrion], [2, ribosomes], [1.5, vesicles], [1, golgiStack], [1, filament]])(x, z, rand);
}

/** Tetrachromacy: prisms turning in the air, pillars of light in the four colours, eyes on stalks, glass spikes. */
export function spectrumFeature(animated: Animated): Feature {
  const glass = new THREE.MeshPhongMaterial({ color: 0xe8e8ff, emissive: 0x2a2a5a, transparent: true, opacity: 0.7, shininess: 140, specular: 0xffffff, flatShading: true });
  const colours = tex.TETRA_COLOURS.map((c) => glowing(c, 0.6));
  const beam = tex.glowTexture();
  const white = lambert(0xf4f4ff);
  const black = new THREE.MeshBasicMaterial({ color: 0x050008 });
  const prism: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const s = 1.5 + rand() * 3;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(s, s, s * 2.4, 3), glass);
    p.position.y = 3 + rand() * 6;
    t.add(p);
    const ph = rand() * 6;
    animated.push((time) => {
      p.rotation.set(time * 0.3 + ph, time * 0.5 + ph, 0);
      p.position.y = 4 + Math.sin(time * 0.6 + ph) * 1.5;
    });
    t.position.set(x, 0, z);
    return t;
  };
  const pillar: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const k = Math.floor(rand() * 4);
    const h = 18 + rand() * 20;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, h, 8), colours[k]);
    col.position.y = h / 2;
    const halo = new THREE.Sprite(additive(beam, tex.TETRA_COLOURS[k]));
    halo.scale.set(5, h * 1.1, 1);
    halo.position.y = h / 2;
    t.add(col, halo);
    return place(t, x, z, rand);
  };
  const eye: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const h = 4 + rand() * 6;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, h, 6), white);
    stalk.position.y = h / 2;
    const ball = new THREE.Group();
    ball.position.y = h + 1.2;
    ball.add(new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), white));
    // Four cones in the iris: four rings of colour round the pupil.
    for (let k = 0; k < 4; k++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.15 + k * 0.14, 0.29 + k * 0.14, 20), colours[3 - k]);
      ring.position.z = 1.19 - k * 0.004;
      ball.add(ring);
    }
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), black);
    pupil.position.z = 1.2;
    ball.add(pupil);
    t.add(stalk, ball);
    const ph = rand() * 6;
    animated.push((time) => ball.rotation.set(Math.sin(time * 0.7 + ph) * 0.4, Math.sin(time * 0.4 + ph) * 1.2, 0));
    return place(t, x, z, rand);
  };
  const spikes: Feature = (x, z, rand) => {
    const t = new THREE.Group();
    const n = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const h = 2 + rand() * 5;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.5 + rand() * 0.5, h, 4), colours[k % 4]);
      c.position.set((rand() - 0.5) * 4, h / 2, (rand() - 0.5) * 4);
      c.rotation.set((rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5);
      t.add(c);
    }
    return place(t, x, z, rand);
  };
  return (x, z, rand) => pick(rand, [[2, prism], [1.2, pillar], [1, eye], [2, spikes]])(x, z, rand);
}

/** Crumbling Castle's gatehouse: two towers either side of the road, a lintel across with its portcullis up, braziers, blocks missing. */
export function castleGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1;
  const stone = new THREE.MeshLambertMaterial({ map: tex.castleWallTexture(), flatShading: true });
  const roof = lambert(0x5a1a1a, { flatShading: true });
  const iron = lambert(0x24242a);
  const rand = (() => {
    let k = 3;
    return () => ((k = (k * 9301 + 49297) % 233280) / 233280);
  })();
  for (const side of [-1, 1]) {
    const t = tower(stone, roof, 3.4, 15, rand, 0.25);
    t.position.set(side * (hw + 3.4), 0, 0);
    g.add(t);
    const b = flame(tex.glowTexture(), animated, 1.4);
    b.position.set(side * (hw + 0.2), 7, -3.6);
    g.add(b);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 4, 4, 5), stone);
  lintel.position.y = 12;
  g.add(lintel);
  // The portcullis, hauled up into the lintel, its teeth showing.
  const bars = new THREE.Group();
  for (let k = 0; k <= 10; k++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3, 0.25), iron);
    bar.position.set(-hw + (k / 10) * hw * 2, 0, 0);
    bars.add(bar);
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 4), iron);
    tooth.rotation.x = Math.PI;
    tooth.position.set(-hw + (k / 10) * hw * 2, -1.8, 0);
    bars.add(tooth);
  }
  bars.position.set(0, 9.4, -2.6);
  g.add(bars);
  animated.push((time) => (bars.position.y = 9.4 + Math.max(0, Math.sin(time * 0.9)) * 0.15));
  sign(g, 'CRUMBLING CASTLE', '#2a0a0a', '#ffb060', hw * 1.2, 16.5);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The keep, in the middle of the castle: a great square tower falling apart, chunks dropping into the lava at its foot. */
export function castleKeep(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pointAt(ribbon.spline, s);
  const stone = new THREE.MeshLambertMaterial({ map: tex.castleWallTexture(), flatShading: true });
  const roof = lambert(0x5a1a1a, { flatShading: true });
  const rand = (() => {
    let k = 11;
    return () => ((k = (k * 9301 + 49297) % 233280) / 233280);
  })();
  const keep = new THREE.Mesh(new THREE.BoxGeometry(26, 50, 26), stone);
  keep.position.y = 25;
  g.add(keep);
  // A ragged top: blocks at different heights, one corner gone.
  for (let k = 0; k < 16; k++) {
    if (k === 3 || k === 4) continue;
    const a = (k / 16) * Math.PI * 2;
    const h = 2 + rand() * 5;
    const m = new THREE.Mesh(new THREE.BoxGeometry(4, h, 4), stone);
    m.position.set(Math.cos(a) * 12, 50 + h / 2, Math.sin(a) * 12);
    g.add(m);
  }
  for (const [cx, cz] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) {
    const t = tower(stone, cx > 0 && cz > 0 ? null : roof, 5, 38 + rand() * 14, rand, 0.4);
    t.position.set(cx, 0, cz);
    g.add(t);
  }
  // Rubble working loose and falling, again and again.
  const falling: THREE.Mesh[] = [];
  for (let k = 0; k < 6; k++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2 + rand() * 2, 1.5, 2), stone);
    g.add(b);
    falling.push(b);
  }
  animated.push((time) =>
    falling.forEach((b, k) => {
      const u = ((time * 0.15 + k * 0.17) % 1 + 1) % 1;
      const a = k * 1.05;
      b.position.set(Math.cos(a) * 15, 54 - 54 * u * u, Math.sin(a) * 15);
      b.rotation.set(u * 5, u * 3 + k, 0);
    }),
  );
  const moat = new THREE.Mesh(new THREE.RingGeometry(22, 34, 32), new THREE.MeshBasicMaterial({ map: tex.lavaTexture(), side: THREE.DoubleSide }));
  moat.rotation.x = -Math.PI / 2;
  moat.position.y = 0.1;
  g.add(moat);
  const heat = new THREE.Sprite(additive(tex.glowTexture(), 0xff4a10));
  heat.scale.setScalar(80);
  heat.position.y = 8;
  g.add(heat);
  g.position.set(p.x - p.tz * lateral, 0, p.z + p.tx * lateral);
  return g;
}

/** The Castle in the Air's gate: two white towers with blue roofs, a bank of cloud slung between them. */
export function cloudGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1;
  const stone = lambert(0xf0e8dc, { flatShading: true });
  const roof = lambert(0x3a6ad8, { flatShading: true });
  const rand = () => 0.5;
  for (const side of [-1, 1]) {
    const t = tower(stone, roof, 2.6, 13, rand);
    t.position.set(side * (hw + 2.6), -2, 0);
    g.add(t);
  }
  const puff = tex.glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  const puffs: THREE.Sprite[] = [];
  for (let k = 0; k < 9; k++) {
    const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false }));
    p.scale.setScalar(6);
    p.position.set(-hw + (k / 8) * hw * 2, 12 + Math.sin((k / 8) * Math.PI) * 3, 0);
    g.add(p);
    puffs.push(p);
  }
  sign(g, 'THE CASTLE IN THE AIR', '#3a6ad8', '#fff8e0', hw * 1.2, 9.5);
  animated.push((time) => puffs.forEach((p, k) => p.scale.setScalar(6 + Math.sin(time * 1.2 + k) * 0.6)));
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The castle itself, on a floating island of rock in the middle of the circuit: a keep and four towers with blue roofs, pennants flying, clouds round its foot. */
export function airCastle(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pointAt(ribbon.spline, s);
  const stone = lambert(0xf0e8dc, { flatShading: true });
  const roof = lambert(0x3a6ad8, { flatShading: true });
  const earth = lambert(0x8a6a4a, { flatShading: true });
  const grass = lambert(0x6ac04a, { flatShading: true });
  const rand = () => 0.5;
  const rock = new THREE.Mesh(new THREE.ConeGeometry(46, 70, 9), earth);
  rock.rotation.x = Math.PI;
  rock.position.y = -35;
  const lawn = new THREE.Mesh(new THREE.CylinderGeometry(46, 46, 1.5, 9), grass);
  g.add(rock, lawn);
  const keep = tower(stone, roof, 9, 40, rand);
  g.add(keep);
  const flag = lambert(0xffc040, { side: THREE.DoubleSide });
  const flags: THREE.Mesh[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const t = tower(stone, roof, 4.5, 24, rand);
    t.position.set(Math.cos(a) * 24, 0, Math.sin(a) * 24);
    g.add(t);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), flag);
    fl.position.set(Math.cos(a) * 24 + 2, 24 + 4.5 * 2.4 + 2, Math.sin(a) * 24);
    g.add(fl);
    flags.push(fl);
  }
  // A curtain wall between the towers.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const b = a + Math.PI / 2;
    const mx = (Math.cos(a) + Math.cos(b)) * 12;
    const mz = (Math.sin(a) + Math.sin(b)) * 12;
    const w = new THREE.Mesh(new THREE.BoxGeometry(34, 12, 2.5), stone);
    w.position.set(mx, 6, mz);
    w.rotation.y = -Math.atan2(mz, mx) + Math.PI / 2;
    g.add(w);
  }
  const puff = tex.glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    c.scale.setScalar(22);
    c.position.set(Math.cos(a) * 44, -8 + (k % 3) * 3, Math.sin(a) * 44);
    g.add(c);
  }
  animated.push((time) => {
    g.position.y = 18 + Math.sin(time * 0.25) * 2;
    flags.forEach((fl, k) => (fl.rotation.y = Math.sin(time * 3 + k) * 0.4));
  });
  g.position.set(p.x - p.tz * lateral, 18, p.z + p.tx * lateral);
  return g;
}

/** The tower the Tower Spiral climbs round: tall and white, on its own floating rock. */
export function skyTower(ribbon: Ribbon, s: number, lateral: number): THREE.Group {
  const g = new THREE.Group();
  const p = pointAt(ribbon.spline, s);
  const stone = lambert(0xf0e8dc, { flatShading: true });
  const roof = lambert(0x3a6ad8, { flatShading: true });
  const t = tower(stone, roof, 9, 46, () => 0.5);
  t.position.y = -14;
  const rock = new THREE.Mesh(new THREE.ConeGeometry(12, 24, 8), lambert(0x8a6a4a, { flatShading: true }));
  rock.rotation.x = Math.PI;
  rock.position.y = -26;
  g.add(t, rock);
  g.position.set(p.x - p.tz * lateral, 0, p.z + p.tx * lateral);
  return g;
}

/** Inner Cell's gate: a ring of membrane round the road, protein channels studding it, pulsing. */
export function cellGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const membrane = new THREE.MeshPhongMaterial({ color: 0xff6ab0, emissive: 0x8a1a5a, emissiveIntensity: 0.5, shininess: 80 });
  const channel = glowing(0x9affd0, 0.5);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(hw + 1, 1.6, 12, 40, Math.PI), membrane);
  g.add(ring);
  for (let k = 0; k <= 10; k++) {
    const a = (k / 10) * Math.PI;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 4.2, 8), channel);
    c.position.set(Math.cos(a) * (hw + 1), Math.sin(a) * (hw + 1), 0);
    c.rotation.z = a - Math.PI / 2;
    g.add(c);
  }
  sign(g, 'INNER CELL', '#5a1a5a', '#ffd0ec', hw * 1.1, hw - 1.5);
  animated.push((time) => {
    const k = 1 + Math.sin(time * 2.4) * 0.04;
    ring.scale.set(k, k, 1);
    membrane.emissiveIntensity = 0.4 + Math.sin(time * 2.4) * 0.15;
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** The nucleus: a great see-through sphere the Nuclear Pore runs through, the nucleolus dark inside, pores dotted over its skin. */
export function nucleus(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const R = 20;
  const skin = new THREE.Mesh(
    new THREE.SphereGeometry(R, 32, 24),
    new THREE.MeshPhongMaterial({ color: 0xc06aff, emissive: 0x3a0a5a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, shininess: 120 }),
  );
  const nucleolus = new THREE.Mesh(new THREE.SphereGeometry(5, 20, 16), glowing(0x5a1a8a, 0.4));
  nucleolus.position.set(0, -6, 9);
  g.add(skin, nucleolus);
  const pore = glowing(0xffa0e0, 0.5);
  for (let k = 0; k < 24; k++) {
    // Spread over the sphere on a golden spiral.
    const y = 1 - (k + 0.5) / 12;
    if (Math.abs(y) > 1) continue;
    const r = Math.sqrt(1 - y * y);
    const a = k * 2.4;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.3, 6, 12), pore);
    ring.position.set(Math.cos(a) * r * R, y * R, Math.sin(a) * r * R);
    ring.lookAt(0, 0, 0);
    g.add(ring);
  }
  animated.push((time) => {
    skin.rotation.y = time * 0.05;
    nucleolus.position.y = -6 + Math.sin(time * 0.6) * 1.2;
  });
  g.position.set(f.x, f.y + 4, f.z);
  return g;
}

/** Tetrachromacy's gate: a great glass prism across the road on two pillars, white light in one side and four colours fanning out of the other. */
export function prismGate(ribbon: Ribbon, s: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const glass = new THREE.MeshPhongMaterial({ color: 0xf0f0ff, emissive: 0x3a3a6a, transparent: true, opacity: 0.75, shininess: 150, specular: 0xffffff, flatShading: true });
  const pillar = new THREE.MeshPhongMaterial({ color: 0x2a2a3a, shininess: 80 });
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 11, 1.6), pillar);
    p.position.set(side * (hw + 0.8), 5.5, 0);
    g.add(p);
  }
  const prism = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, hw * 2 + 4, 3), glass);
  prism.rotation.z = Math.PI / 2;
  prism.position.y = 12.5;
  g.add(prism);
  // Four beams fanning out of the prism toward the karts.
  const beams: THREE.Mesh[] = [];
  tex.TETRA_COLOURS.forEach((c, k) => {
    const b = new THREE.Mesh(
      new THREE.PlaneGeometry(hw * 2, 30),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    b.geometry.translate(0, -15, 0);
    b.position.set(0, 12.5, 0);
    b.rotation.x = -1.15 + k * 0.12;
    g.add(b);
    beams.push(b);
  });
  sign(g, 'TETRACHROMACY', '#1a0a3a', '#e0c0ff', hw * 1.1, 17.5);
  animated.push((time) => beams.forEach((b, k) => ((b.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.08 * Math.sin(time * 2 + k * 1.6))));
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A great eye in the infield, four rings of colour in its iris, looking about: the tetrachromat who sees the fourth colour. */
export function prismEye(ribbon: Ribbon, s: number, lateral: number, animated: Animated): THREE.Group {
  const g = new THREE.Group();
  const p = pointAt(ribbon.spline, s);
  const R = 16;
  const ball = new THREE.Group();
  ball.add(new THREE.Mesh(new THREE.SphereGeometry(R, 40, 30), new THREE.MeshPhongMaterial({ color: 0xf4f0ff, shininess: 120, specular: 0xffffff })));
  const iris = tex.TETRA_COLOURS.map((c) => glowing(c, 0.8));
  for (let k = 0; k < 4; k++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.4 + k * 1.6, 4 + k * 1.6, 48), iris[3 - k]);
    // Sit each ring on the sphere's surface so it curves with it.
    ring.position.z = Math.sqrt(R * R - (3.2 + k * 1.6) ** 2) + 0.05;
    ball.add(ring);
  }
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(2.5, 32), new THREE.MeshBasicMaterial({ color: 0x020004 }));
  pupil.position.z = R + 0.06;
  ball.add(pupil);
  ball.position.y = R + 10;
  g.add(ball);
  const halo = new THREE.Sprite(additive(tex.glowTexture(), 0xb070ff));
  halo.scale.setScalar(R * 4);
  halo.position.y = R + 10;
  g.add(halo);
  animated.push((time) => {
    ball.rotation.set(Math.sin(time * 0.31) * 0.35, Math.sin(time * 0.17) * 1.4, 0);
    // A blink, now and then.
    const blink = ((time % 7) + 7) % 7 < 0.18 ? 0.1 : 1;
    ball.scale.set(1, blink, 1);
  });
  g.position.set(p.x - p.tz * lateral, 0, p.z + p.tx * lateral);
  return g;
}
