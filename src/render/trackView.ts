import * as THREE from 'three';
import { seededRandom } from '../core/math';
import type { Track } from '../tracks/track';
import { nearestOnSpline, pointAt } from '../tracks/spline';

const SAND = 0xc8763a;
const ASPHALT = 0x3b3f4a;
const LINE = 0xf2e9d8;
const CURB_A = 0xd8452b;
const CURB_B = 0xf4efe6;
const ROCK = 0xa8442a;
const CACTUS = 0x4f7a3a;

export interface TrackView {
  group: THREE.Group;
  update(time: number): void;
}

/** Greybox-plus visuals for a flat spline track. */
export function buildTrackView(track: Track): TrackView {
  const group = new THREE.Group();
  const sp = track.spline;
  const hw = track.def.roadHalfWidth;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(track.def.bounds * 2 + 400, track.def.bounds * 2 + 400),
    new THREE.MeshLambertMaterial({ color: SAND }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  group.add(ribbon(track, -hw, hw, 0.02, () => ASPHALT));
  group.add(ribbon(track, -hw - 1.2, -hw, 0.03, (i) => ((i >> 1) % 2 ? CURB_A : CURB_B)));
  group.add(ribbon(track, hw, hw + 1.2, 0.03, (i) => ((i >> 1) % 2 ? CURB_A : CURB_B)));
  group.add(ribbon(track, -0.25, 0.25, 0.03, (i) => ((i >> 1) % 2 ? LINE : null)));

  group.add(startLine(track));

  const padTexture = chevronTexture();
  for (const pad of track.def.boostPads) {
    const p = pointAt(sp, pad.s + pad.length / 2);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pad.halfWidth * 2, pad.length),
      new THREE.MeshBasicMaterial({ map: padTexture, transparent: true }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.atan2(p.tx, p.tz) + Math.PI;
    mesh.position.set(p.x + -p.tz * pad.lateral, 0.05, p.z + p.tx * pad.lateral);
    group.add(mesh);
  }

  group.add(walls(track.def.bounds));
  group.add(decor(track));

  return {
    group,
    update(time: number) {
      padTexture.offset.y = -time * 2;
    },
  };
}

/** Flat strip between two lateral offsets, one flat color per segment (null = skip). */
function ribbon(track: Track, a: number, b: number, y: number, color: (i: number) => number | null): THREE.Mesh {
  const sp = track.spline;
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < sp.count; i++) {
    const hex = color(i);
    if (hex === null) continue;
    const j = (i + 1) % sp.count;
    const corner = (k: number, off: number) => [sp.px[k] - sp.tz[k] * off, y, sp.pz[k] + sp.tx[k] * off];
    const a0 = corner(i, a);
    const b0 = corner(i, b);
    const a1 = corner(j, a);
    const b1 = corner(j, b);
    pos.push(...a0, ...a1, ...b0, ...b0, ...a1, ...b1);
    c.setHex(hex);
    for (let v = 0; v < 6; v++) col.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function startLine(track: Track): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#f4efe6';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const hw = track.def.roadHalfWidth;
  const p = pointAt(track.spline, 0);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 2), new THREE.MeshBasicMaterial({ map: tex }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = Math.atan2(p.tx, p.tz) + Math.PI;
  mesh.position.set(p.x, 0.04, p.z);
  return mesh;
}

function chevronTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ff7a1a';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#ffe14d';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(8, 44);
  ctx.lineTo(32, 18);
  ctx.lineTo(56, 44);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  return tex;
}

function walls(bounds: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: ROCK });
  const len = bounds * 2;
  for (let k = 0; k < 4; k++) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len + 8, 6, 4), mat);
    const angle = (k * Math.PI) / 2;
    wall.position.set(Math.sin(angle) * (bounds + 2), 3, Math.cos(angle) * (bounds + 2));
    wall.rotation.y = angle;
    g.add(wall);
  }
  return g;
}

/** Rocks and cacti scattered off the road, for speed perception. */
function decor(track: Track): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(7);
  const b = track.def.bounds - 6;
  const clear = track.def.roadHalfWidth + 6;

  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: ROCK, flatShading: true });
  const cactusMat = new THREE.MeshLambertMaterial({ color: CACTUS });
  const trunkGeo = new THREE.CylinderGeometry(0.45, 0.5, 1, 8);

  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 160);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let placed = 0;
  let cacti = 0;
  for (let tries = 0; tries < 2000 && (placed < 160 || cacti < 60); tries++) {
    const x = (rand() * 2 - 1) * b;
    const z = (rand() * 2 - 1) * b;
    if (nearestOnSpline(track.spline, x, z).distance < clear) continue;
    if (placed < 160 && rand() < 0.7) {
      const s = 0.6 + rand() * 2.8;
      e.set(rand() * 3, rand() * 3, rand() * 3);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, s * 0.4, z), q, new THREE.Vector3(s, s * (0.6 + rand() * 0.8), s));
      rocks.setMatrixAt(placed++, m);
    } else if (cacti < 60) {
      g.add(cactus(x, z, 3 + rand() * 4, rand() * Math.PI, trunkGeo, cactusMat));
      cacti++;
    }
  }
  rocks.count = placed;
  rocks.castShadow = true;
  g.add(rocks);
  return g;
}

function cactus(x: number, z: number, h: number, rot: number, geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Group {
  const c = new THREE.Group();
  const trunk = new THREE.Mesh(geo, mat);
  trunk.scale.set(1, h, 1);
  trunk.position.y = h / 2;
  c.add(trunk);
  for (const side of [-1, 1]) {
    const armH = h * 0.35;
    const arm = new THREE.Mesh(geo, mat);
    arm.scale.set(0.7, armH, 0.7);
    arm.position.set(side * 1.1, h * 0.55 + armH / 2, 0);
    c.add(arm);
    const elbow = new THREE.Mesh(geo, mat);
    elbow.scale.set(0.7, 1.1, 0.7);
    elbow.rotation.z = Math.PI / 2;
    elbow.position.set(side * 0.6, h * 0.55, 0);
    c.add(elbow);
  }
  c.position.set(x, 0, z);
  c.rotation.y = rot;
  c.traverse((o) => (o.castShadow = true));
  return c;
}
