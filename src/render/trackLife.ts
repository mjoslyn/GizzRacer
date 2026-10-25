import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { FIELD_SIZE } from '../physics/racers';
import { nearestOnSpline } from '../tracks/spline';
import { inPit, type Track } from '../tracks/track';
import * as tex from './textures';
import type { DecorKind, Theme } from './themes';
import { CURB_WIDTH, buildStand, detailStyle } from './trackDetail';
import { densityScale } from './detail';

/**
 * Life and detail laid over every track (hand-built and generated):
 *
 * - Name boards at the start of each section, so the places a track is
 *   made of (Salt Flat Straight, The Coil, Mist Hollow) read as you reach
 *   them.
 * - The grid painted on the road, and the track's name painted across it
 *   past the line.
 * - Small stands of spectators at the sharpest bends.
 * - Flocks of each world's creatures circling the infield, scattering when
 *   a kart comes near.
 * - Motes in the air round the camera: dust, pollen, snow, embers, sparks,
 *   spores, bubbles, stars, in each world's colours.
 *
 * Purely visual; nothing here collides.
 */
export interface Life {
  group: THREE.Group;
  update(time: number, cam: THREE.Vector3): void;
}

type Creature = 'bird' | 'vulture' | 'gull' | 'bat' | 'moth' | 'orb';

interface LifeSpec {
  /** What circles the infield: the creature, its colour, how many, how high, and how big. */
  flock?: { kind: Creature; color: number; count: number; height: number; size: number; glow?: boolean };
  /** What drifts through the air: colour, how many, how big, how it moves. */
  motes?: { color: number; count: number; size: number; drift: 'fall' | 'rise' | 'float' | 'blow'; glow?: boolean };
}

const LIFE: Record<DecorKind, LifeSpec> = {
  desert: { flock: { kind: 'vulture', color: 0x2a1a14, count: 7, height: 26, size: 1.6 }, motes: { color: 0xf4e4c8, count: 260, size: 0.55, drift: 'blow' } },
  meadow: { flock: { kind: 'bird', color: 0x3a3a48, count: 14, height: 18, size: 0.8 }, motes: { color: 0xfff0a0, count: 320, size: 0.4, drift: 'float' } },
  volcanic: { flock: { kind: 'bat', color: 0x1a0a0a, count: 12, height: 20, size: 1 }, motes: { color: 0xff8a30, count: 360, size: 0.45, drift: 'rise', glow: true } },
  jungle: { flock: { kind: 'bird', color: 0xff5a4a, count: 12, height: 22, size: 0.9 }, motes: { color: 0x9aff6a, count: 300, size: 0.5, drift: 'fall' } },
  lagoon: { flock: { kind: 'gull', color: 0xf4f4f0, count: 12, height: 20, size: 1.1 }, motes: { color: 0xffffff, count: 180, size: 0.35, drift: 'blow' } },
  glacier: { flock: { kind: 'gull', color: 0xe8f4ff, count: 8, height: 24, size: 1.1 }, motes: { color: 0xffffff, count: 520, size: 0.5, drift: 'fall' } },
  city: { flock: { kind: 'orb', color: 0xff3ad8, count: 10, height: 24, size: 0.6, glow: true }, motes: { color: 0xff6ae0, count: 200, size: 0.35, drift: 'float', glow: true } },
  sky: { flock: { kind: 'orb', color: 0xffe8a0, count: 12, height: 10, size: 0.7, glow: true }, motes: { color: 0xffffff, count: 320, size: 0.4, drift: 'float', glow: true } },
  wasteland: { flock: { kind: 'vulture', color: 0x1a0a08, count: 8, height: 24, size: 1.7 }, motes: { color: 0xff5a1a, count: 340, size: 0.45, drift: 'rise', glow: true } },
  colony: { motes: { color: 0xc07040, count: 360, size: 0.6, drift: 'blow' } },
  plains: { flock: { kind: 'bird', color: 0x2a2a30, count: 16, height: 16, size: 0.8 }, motes: { color: 0xd8d0b0, count: 300, size: 0.5, drift: 'blow' } },
  cosmos: { motes: { color: 0xd8c0ff, count: 400, size: 0.5, drift: 'float', glow: true } },
  isle: { flock: { kind: 'orb', color: 0x7affe0, count: 10, height: 8, size: 0.5, glow: true }, motes: { color: 0xa0c8c0, count: 260, size: 0.9, drift: 'float' } },
  airstrip: { flock: { kind: 'gull', color: 0xf4f4f0, count: 10, height: 30, size: 1.1 }, motes: { color: 0xffffff, count: 160, size: 0.35, drift: 'blow' } },
  grove: { flock: { kind: 'orb', color: 0xfff09a, count: 16, height: 5, size: 0.3, glow: true }, motes: { color: 0xc0ff8a, count: 320, size: 0.45, drift: 'fall' } },
  sea: { flock: { kind: 'gull', color: 0xd8d8d0, count: 10, height: 22, size: 1.1 }, motes: { color: 0xc0d0d8, count: 240, size: 0.9, drift: 'blow' } },
  peaks: { flock: { kind: 'bird', color: 0xff5ad0, count: 10, height: 26, size: 0.9 }, motes: { color: 0xffd0f0, count: 420, size: 0.5, drift: 'fall' } },
  alienSea: { flock: { kind: 'orb', color: 0x7affe0, count: 12, height: 14, size: 0.6, glow: true }, motes: { color: 0x9affe8, count: 300, size: 0.5, drift: 'rise' } },
  garden: { flock: { kind: 'moth', color: 0xffe45a, count: 14, height: 6, size: 0.5 }, motes: { color: 0xffffff, count: 300, size: 0.4, drift: 'float' } },
  shore: { flock: { kind: 'gull', color: 0xe8e0d0, count: 10, height: 22, size: 1.2 }, motes: { color: 0xd8d0c0, count: 220, size: 0.6, drift: 'blow' } },
  ruins: { flock: { kind: 'bat', color: 0x1a1416, count: 14, height: 18, size: 1 }, motes: { color: 0xd0c0a0, count: 300, size: 0.5, drift: 'float' } },
  clouds: { flock: { kind: 'bird', color: 0xffffff, count: 12, height: 12, size: 1 }, motes: { color: 0xffffff, count: 280, size: 0.8, drift: 'float' } },
  cytoplasm: { flock: { kind: 'orb', color: 0xff8ac0, count: 12, height: 12, size: 0.8, glow: true }, motes: { color: 0xffd0e8, count: 360, size: 0.6, drift: 'rise' } },
  spectrum: { flock: { kind: 'orb', color: 0xd040ff, count: 12, height: 16, size: 0.6, glow: true }, motes: { color: 0xe0c0ff, count: 320, size: 0.45, drift: 'float', glow: true } },
  foundry: { motes: { color: 0xffa040, count: 380, size: 0.4, drift: 'rise', glow: true } },
  theatre: { motes: { color: 0x80ffb0, count: 260, size: 0.4, drift: 'float', glow: true } },
  boneyard: { flock: { kind: 'vulture', color: 0x1a0e08, count: 9, height: 28, size: 1.8 }, motes: { color: 0xe8d8b0, count: 300, size: 0.55, drift: 'blow' } },
  pedalboard: { flock: { kind: 'orb', color: 0xff80d0, count: 10, height: 18, size: 0.6, glow: true }, motes: { color: 0xffd040, count: 260, size: 0.4, drift: 'float', glow: true } },
  blight: { flock: { kind: 'bat', color: 0x1a1614, count: 10, height: 22, size: 0.9 }, motes: { color: 0x9a9080, count: 420, size: 0.55, drift: 'fall' } },
  domes: { motes: { color: 0xd8865a, count: 300, size: 0.5, drift: 'blow' } },
  corona: { flock: { kind: 'orb', color: 0xffe080, count: 12, height: 20, size: 0.7, glow: true }, motes: { color: 0xffc050, count: 400, size: 0.45, drift: 'rise', glow: true } },
  pit: { flock: { kind: 'bat', color: 0x0a0202, count: 14, height: 20, size: 1.1 }, motes: { color: 0xff6a20, count: 420, size: 0.45, drift: 'rise', glow: true } },
  neurons: { flock: { kind: 'orb', color: 0x80f0ff, count: 14, height: 16, size: 0.6, glow: true }, motes: { color: 0xff90d8, count: 340, size: 0.4, drift: 'float', glow: true } },
  opart: { flock: { kind: 'bird', color: 0x101014, count: 12, height: 20, size: 0.9 }, motes: { color: 0xffffff, count: 260, size: 0.45, drift: 'blow' } },
  panes: { flock: { kind: 'moth', color: 0xffd020, count: 12, height: 14, size: 0.8 }, motes: { color: 0xfff0ff, count: 300, size: 0.4, drift: 'float', glow: true } },
  static: { flock: { kind: 'orb', color: 0x80ff90, count: 12, height: 18, size: 0.7, glow: true }, motes: { color: 0xc080ff, count: 460, size: 0.45, drift: 'float', glow: true } },
};

export function trackLife(track: Track, theme: Theme, animated: ((time: number) => void)[]): Life {
  const group = new THREE.Group();
  const updates: ((time: number, cam: THREE.Vector3) => void)[] = [];
  const abyss = !!track.def.abyss;
  const ribbons = [track.main, ...track.branches];
  const clear = (x: number, z: number, margin: number) =>
    ribbons.every((r) => {
      const hit = nearestOnSpline(r.spline, x, z);
      return hit.distance > r.halfWidth[hit.index] + margin;
    }) && track.def.pits.every((p) => !inPit({ ...p, halfWidth: p.halfWidth + 2, halfLength: p.halfLength + 2 }, x, z));
  const style = detailStyle(theme.decor);
  const spec = LIFE[theme.decor];

  group.add(sectionSigns(track, style.boards, clear));
  group.add(gridPaint(track));
  if (!abyss && style.crowd) group.add(cornerStands(track, theme, clear, animated));
  if (spec.flock) {
    const f = flock(track, spec.flock, clear);
    group.add(f.group);
    updates.push(f.update);
  }
  if (spec.motes) {
    const m = motes(spec.motes);
    group.add(m.group);
    updates.push(m.update);
  }
  return {
    group,
    update(time, cam) {
      for (const u of updates) u(time, cam);
    },
  };
}

// ---- Section name boards ---------------------------------------------------------

/** A board on a post at the start of every named section of the main road, facing the karts coming at it. */
function sectionSigns(track: Track, boards: { bg: string[]; fg: string }, clear: (x: number, z: number, m: number) => boolean): THREE.Group {
  const g = new THREE.Group();
  const r = track.main;
  const sp = r.spline;
  const post = new THREE.MeshLambertMaterial({ color: 0x3a3a40 });
  const back = new THREE.MeshLambertMaterial({ color: 0x1a1420 });
  let last = '';
  let k = 0;
  for (const sec of r.def.sections) {
    const name = sec.name.trim();
    if (!name || name === last || sec.from < 20) {
      last = name;
      continue;
    }
    last = name;
    // A little way into the section, so the board stands where the section does.
    const s = (sec.from + 8) * r.scale;
    if (r.inGap(s) || r.inGap(s + 6) || r.inGap(s - 6)) continue;
    const i = Math.min(sp.count - 1, Math.round((s / sp.length) * (sp.closed ? sp.count : sp.count - 1)));
    if (r.wallHeight[i] > 0.5) continue;
    const deck = !!r.def.sections[r.sectionIndex[i]]?.bridge;
    let placed = false;
    for (const side of [1, -1]) {
      const lat = side * (r.halfWidth[i] + (deck ? 0.6 : CURB_WIDTH + 1.4));
      const x = sp.px[i] - sp.tz[i] * lat;
      const z = sp.pz[i] + sp.tx[i] * lat;
      if (!deck && !clear(x, z, 0.8)) continue;
      const y = r.heightAt(s);
      const sign = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.7, 6), post);
      pole.position.y = 1.35;
      sign.add(pole);
      const map = tex.signTexture(name, boards.bg[k % Math.max(1, boards.bg.length)] ?? '#ffd23a', boards.fg || '#ffffff');
      const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.05, 0.12), [back, back, back, back, new THREE.MeshBasicMaterial({ map }), back]);
      board.position.y = 2.75;
      sign.add(board);
      sign.position.set(x, y, z);
      // Face back down the road, turned a little in toward it.
      sign.rotation.y = Math.atan2(sp.tx[i], sp.tz[i]) + Math.PI - side * 0.4;
      g.add(sign);
      placed = true;
      break;
    }
    if (placed) k++;
  }
  return g;
}

// ---- The grid -------------------------------------------------------------------

/** Grid boxes painted on each start slot, and the track's name across the road just past the line. */
function gridPaint(track: Track): THREE.Group {
  const g = new THREE.Group();
  const decal = { side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } as const;
  const paint = new THREE.MeshBasicMaterial({ color: 0xf4f4f0, transparent: true, opacity: 0.85, ...decal });
  const w = 2.6;
  const l = 3.4;
  const t = 0.14;
  // One slot's outline: four thin strips round a rectangle, open at the front like a real grid box.
  const outline = new THREE.Group();
  const strip = (x: number, z: number, sx: number, sz: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), paint);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0, z);
    outline.add(m);
  };
  strip(-w / 2, 0, t, l);
  strip(w / 2, 0, t, l);
  strip(0, -l / 2, w, t);
  for (let i = 0; i < FIELD_SIZE; i++) {
    const pose = track.startSlot(i);
    const box = outline.clone();
    box.position.set(pose.x, pose.y + 0.05, pose.z);
    box.rotation.y = pose.heading;
    box.renderOrder = 1;
    g.add(box);
  }
  // The name, read by a kart driving over it, a little past the line.
  const r = track.main;
  const sp = r.spline;
  const s = 14;
  const i = Math.min(sp.count - 1, Math.round((s / sp.length) * sp.count));
  const width = Math.min(r.halfWidth[i] * 1.5, 14);
  const name = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshBasicMaterial({ map: tex.roadTextTexture(track.def.name), transparent: true, opacity: 0.8, ...decal }));
  name.rotation.x = -Math.PI / 2;
  name.rotation.z = Math.atan2(sp.tx[i], sp.tz[i]);
  name.position.set(sp.px[i], r.heightAt(sp.dist[i]) + 0.05, sp.pz[i]);
  name.renderOrder = 1;
  g.add(name);
  return g;
}

// ---- Corner stands ---------------------------------------------------------------

/** Small stands of spectators on the outside of the two sharpest bends. */
function cornerStands(track: Track, theme: Theme, clear: (x: number, z: number, m: number) => boolean, animated: ((time: number) => void)[]): THREE.Group {
  const g = new THREE.Group();
  const r = track.main;
  const sp = r.spline;
  const picks: number[] = [];
  const order = Array.from({ length: sp.count }, (_, i) => i).sort((a, b) => Math.abs(r.curvature[b]) - Math.abs(r.curvature[a]));
  const len = 12;
  const depth = 5;
  for (const i of order) {
    if (picks.length >= 2) break;
    if (Math.abs(r.curvature[i]) < 0.03 || r.wallHeight[i] > 0.5 || r.inGap(sp.dist[i]) || r.heightAt(sp.dist[i]) > 0.5) continue;
    if (sp.dist[i] < 120) continue;
    if (!picks.every((p) => Math.abs(sp.dist[p] - sp.dist[i]) > 200)) continue;
    // Outside of the bend.
    const side = Math.sign(r.curvature[i]);
    const off = r.halfWidth[i] + CURB_WIDTH + 7 + depth / 2;
    const fx = sp.tx[i];
    const fz = sp.tz[i];
    const cx = sp.px[i] - fz * side * off;
    const cz = sp.pz[i] + fx * side * off;
    let ok = true;
    for (const a of [-1, 0, 1]) for (const b of [-1, 1]) ok &&= clear(cx + fx * a * (len / 2) - fz * side * b * (depth / 2), cz + fz * a * (len / 2) + fx * side * b * (depth / 2), 3);
    if (!ok) continue;
    picks.push(i);
    g.add(buildStand(cx, cz, Math.atan2(fx, fz) + (side > 0 ? -Math.PI / 2 : Math.PI / 2), len, depth, theme, animated, 3));
  }
  return g;
}

// ---- Flocks ---------------------------------------------------------------------

/** Two triangles for a pair of wings on a body line; the instance's y scale flaps them. */
function wingGeometry(size: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const b = 0.45 * size;
  const w = 1.1 * size;
  const up = 0.5 * size;
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, b, 0, 0, -b, w, up, 0, 0, 0, -b, 0, 0, b, -w, up, 0], 3));
  g.computeVertexNormals();
  return g;
}

/** A flock of a world's creatures circling the infield, scattering higher and faster when a kart comes near. */
function flock(track: Track, spec: NonNullable<LifeSpec['flock']>, clear: (x: number, z: number, m: number) => boolean): Life {
  const group = new THREE.Group();
  const rand = seededRandom(track.spline.count + 11);
  const b = track.def.bounds - 30;
  // Two or three circles, over clear ground, away from each other.
  const centres: { x: number; z: number; r: number }[] = [];
  for (let tries = 0; tries < 200 && centres.length < 3; tries++) {
    const x = (rand() * 2 - 1) * b;
    const z = (rand() * 2 - 1) * b;
    const radius = 16 + rand() * 16;
    if (!clear(x, z, 6) || !centres.every((c) => Math.hypot(c.x - x, c.z - z) > 120)) continue;
    centres.push({ x, z, r: radius });
  }
  if (!centres.length) return { group, update: () => {} };
  const orb = spec.kind === 'orb';
  const geo = orb ? new THREE.OctahedronGeometry(spec.size, 0) : wingGeometry(spec.size);
  const mat = orb
    ? new THREE.MeshBasicMaterial({ color: spec.color })
    : new THREE.MeshLambertMaterial({ color: spec.color, side: THREE.DoubleSide });
  const n = spec.count * centres.length;
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  group.add(mesh);
  if (orb) {
    // A glow round each orb, in one draw.
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3)), new THREE.PointsMaterial({ map: tex.glowTexture(), color: spec.color, size: spec.size * 7, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.frustumCulled = false;
    group.add(pts);
    mesh.userData.glow = pts;
  }
  const birds = Array.from({ length: n }, (_, k) => {
    const c = centres[k % centres.length];
    return { c, a: rand() * Math.PI * 2, w: (0.25 + rand() * 0.2) * (rand() < 0.5 ? 1 : -1), h: spec.height + (rand() - 0.5) * 6, ph: rand() * 6.3, rr: 0.7 + rand() * 0.6, flap: 5 + rand() * 4 };
  });
  const alarm = centres.map(() => 0);
  let lastTime = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const glowPos = (mesh.userData.glow as THREE.Points | undefined)?.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  return {
    group,
    update(time, cam) {
      const dt = Math.max(0, Math.min(0.1, time - lastTime));
      lastTime = time;
      centres.forEach((c, i) => {
        const near = Math.hypot(cam.x - c.x, cam.z - c.z) < c.r + 24;
        alarm[i] = near ? 1 : Math.max(0, alarm[i] - dt / 3);
      });
      birds.forEach((bd, k) => {
        const al = alarm[k % centres.length];
        const speed = bd.w * (1 + al * 1.8);
        bd.a += speed * dt;
        const rad = bd.c.r * bd.rr * (1 + al * 0.4);
        const x = bd.c.x + Math.cos(bd.a) * rad;
        const z = bd.c.z + Math.sin(bd.a) * rad;
        const y = bd.h + al * 9 + Math.sin(time * 1.3 + bd.ph) * 1.2;
        // Heading along the circle; wings flap faster when alarmed.
        const yaw = Math.atan2(-Math.sin(bd.a) * Math.sign(bd.w), Math.cos(bd.a) * Math.sign(bd.w)) + Math.PI / 2;
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
        const flap = orb ? 1 : Math.sin(time * bd.flap * (1 + al) + bd.ph);
        m4.compose(v.set(x, y, z), q, sc.set(1, orb ? 1 : flap, 1));
        mesh.setMatrixAt(k, m4);
        glowPos?.setXYZ(k, x, y, z);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (glowPos) glowPos.needsUpdate = true;
    },
  };
}

// ---- Motes ----------------------------------------------------------------------

/** Particles in the air round the camera, world-anchored and wrapped, drifting as the world's own do. */
function motes(spec: NonNullable<LifeSpec['motes']>): Life {
  const N = Math.round(spec.count * densityScale());
  const W = 70;
  const H = 28;
  const offs = new Float32Array(N * 3);
  const phase = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    offs[k * 3] = Math.random() * W;
    offs[k * 3 + 1] = Math.random() * H;
    offs[k * 3 + 2] = Math.random() * W;
    phase[k] = Math.random() * 6.3;
  }
  const pos = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: tex.glowTexture(),
    color: spec.color,
    size: spec.size,
    transparent: true,
    opacity: spec.glow ? 0.9 : 0.55,
    blending: spec.glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const group = new THREE.Group();
  group.add(points);
  const wrap = (v: number, span: number) => ((v % span) + span) % span;
  const vy = spec.drift === 'fall' ? -2.2 : spec.drift === 'rise' ? 1.6 : 0.3;
  const vx = spec.drift === 'blow' ? 6 : 0.8;
  return {
    group,
    update(time, cam) {
      for (let k = 0; k < N; k++) {
        const o = k * 3;
        const sway = Math.sin(time * 0.8 + phase[k]) * 1.5;
        pos[o] = cam.x - W / 2 + wrap(offs[o] + time * vx + sway - cam.x, W);
        pos[o + 1] = cam.y - 6 + wrap(offs[o + 1] + time * vy - cam.y, H);
        pos[o + 2] = cam.z - W / 2 + wrap(offs[o + 2] + Math.cos(time * 0.6 + phase[k]) * 1.2 - cam.z, W);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
