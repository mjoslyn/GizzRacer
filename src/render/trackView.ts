import * as THREE from 'three';
import { seededRandom } from '../core/math';
import type { RoadSurface } from '../tracks/builder';
import { nearestOnSpline, pointAt } from '../tracks/spline';
import { inPit, type Ribbon, type Track } from '../tracks/track';
import * as tex from './textures';

const CURB_WIDTH = 1.2;
/** Meters of road per texture repeat along the track. */
const ROAD_TILE = 14;
const SAND_TILE = 18;
/** Draw roads a hair above their physical height to stay clear of the ground. */
const ROAD_LIFT = 0.03;

export interface TrackView {
  group: THREE.Group;
  update(time: number, cameraPos: THREE.Vector3): void;
}

interface Materials {
  road: Record<RoadSurface, THREE.Material>;
  curb: THREE.Material;
  strata: THREE.Material;
  diamond: THREE.MeshLambertMaterial;
  mud: THREE.Material;
  bone: THREE.Material;
  cactus: THREE.Material;
}

function materials(): Materials {
  const lambert = (map: THREE.Texture, extra: THREE.MeshLambertMaterialParameters = {}) =>
    new THREE.MeshLambertMaterial({ map, ...extra });
  const sand = tex.sandTexture();
  return {
    road: {
      asphalt: lambert(tex.asphaltTexture()),
      salt: lambert(tex.saltTexture()),
      rock: lambert(tex.dirtTexture()),
      sand: lambert(sand),
    },
    curb: lambert(tex.curbTexture()),
    strata: lambert(tex.strataTexture(), { side: THREE.DoubleSide }),
    diamond: lambert(tex.diamondTexture(), { side: THREE.DoubleSide }),
    mud: lambert(tex.mudTexture()),
    bone: new THREE.MeshPhongMaterial({ map: tex.boneTexture(), shininess: 30, specular: 0x333322 }),
    cactus: lambert(tex.cactusTexture()),
  };
}

/** Textured visuals for a spline track, in a sharp early-2000s console style. */
export function buildTrackView(track: Track): TrackView {
  const group = new THREE.Group();
  const mats = materials();

  group.add(sky());
  group.add(ground(track));
  for (const pit of track.def.pits) group.add(pitMesh(pit, mats));
  for (const ribbon of [track.main, ...track.branches]) group.add(ribbonMeshes(ribbon, mats));

  const padTexture = tex.chevronTexture();
  for (const pad of track.def.boostPads) {
    const p = pointAt(track.spline, track.mainS(pad.s + pad.length / 2));
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pad.halfWidth * 2, pad.length),
      new THREE.MeshBasicMaterial({ map: padTexture, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.atan2(p.tx, p.tz) + Math.PI;
    mesh.position.set(p.x - p.tz * pad.lateral, track.main.heightAt(track.mainS(pad.s)) + 0.06, p.z + p.tx * pad.lateral);
    mesh.renderOrder = 1;
    group.add(mesh);
  }

  group.add(startLine(track));
  for (const lm of track.def.landmarks) {
    const ribbon = track.ribbon(lm.ribbon);
    const s = lm.s * ribbon.scale;
    if (lm.kind === 'skeletonArch') group.add(skeletonArch(ribbon, s, mats));
    if (lm.kind === 'fangs') group.add(snakeMouth(ribbon, s, mats));
  }
  group.add(boundaryCliffs(track.def.bounds, mats));
  group.add(decor(track, mats));
  group.add(distantMesas());

  const skyMesh = group.children[0];
  return {
    group,
    update(time: number, cameraPos: THREE.Vector3) {
      padTexture.offset.y = -time * 2;
      // Barrier diamonds crawl along like scales.
      if (mats.diamond.map) mats.diamond.map.offset.x = -time * 0.15;
      skyMesh.position.copy(cameraPos);
    },
  };
}

function sky(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 48, 24),
    new THREE.MeshBasicMaterial({ map: tex.skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  mesh.renderOrder = -1;
  return mesh;
}

/** Desert floor with holes cut for pits. */
function ground(track: Track): THREE.Mesh {
  const E = 1400;
  const shape = new THREE.Shape([
    new THREE.Vector2(-E, -E),
    new THREE.Vector2(E, -E),
    new THREE.Vector2(E, E),
    new THREE.Vector2(-E, E),
  ]);
  for (const p of track.def.pits) {
    // Shape space is (x, -z) because the mesh is rotated onto the XZ plane.
    const hole = pitCorners(p).map(([x, z]) => new THREE.Vector2(x, -z));
    shape.holes.push(new THREE.Path(hole));
  }
  const geo = new THREE.ShapeGeometry(shape);
  const map = tex.sandTexture();
  map.repeat.set(1 / SAND_TILE, 1 / SAND_TILE);
  // Pushed back in depth so roads lying at ground level never z-fight it.
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function pitCorners(p: { x: number; z: number; heading: number; halfLength: number; halfWidth: number }): [number, number][] {
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const rx = -fz;
  const rz = fx;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => [p.x + fx * a * p.halfLength + rx * b * p.halfWidth, p.z + fz * a * p.halfLength + rz * b * p.halfWidth]);
}

function pitMesh(p: Parameters<typeof pitCorners>[0] & { depth: number }, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const corners = pitCorners(p);
  const floorGeo = new THREE.BufferGeometry();
  const floor = corners.map(([x, z]) => [x, -p.depth, z]).flat();
  floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(floor, 3));
  floorGeo.setAttribute('uv', new THREE.Float32BufferAttribute(corners.map(([x, z]) => [x / 12, z / 12]).flat(), 2));
  floorGeo.setIndex([0, 2, 1, 0, 3, 2]);
  floorGeo.computeVertexNormals();
  g.add(new THREE.Mesh(floorGeo, mats.mud));

  const pos: number[] = [];
  const uv: number[] = [];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corners[k];
    const [bx, bz] = corners[(k + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az) / 10;
    const v = p.depth / 10;
    pos.push(ax, 0, az, bx, 0, bz, ax, -p.depth, az, ax, -p.depth, az, bx, 0, bz, bx, -p.depth, bz);
    uv.push(0, v, len, v, 0, 0, 0, 0, len, v, len, 0);
  }
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  wallGeo.computeVertexNormals();
  g.add(new THREE.Mesh(wallGeo, mats.strata));
  return g;
}

/** Builds road, curbs, walls, ramp skirts and lip faces for one ribbon. */
function ribbonMeshes(ribbon: Ribbon, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const sp = ribbon.spline;
  const segs = sp.closed ? sp.count : sp.count - 1;
  const rand = seededRandom(sp.count);

  const road = new Map<RoadSurface, GeoBuilder>();
  const curbs = new GeoBuilder();
  const tallWalls = new GeoBuilder();
  const lowWalls = new GeoBuilder();
  const skirts = new GeoBuilder();

  const y = (i: number) => ribbon.heightAt(sp.dist[i]) + ROAD_LIFT;
  const edge = (i: number, lat: number, h: number): V3 => [sp.px[i] - sp.tz[i] * lat, h, sp.pz[i] + sp.tx[i] * lat];
  const jag = Float32Array.from({ length: sp.count }, () => rand() * 1.4);

  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % sp.count;
    const sMid = (sp.dist[i] + (j === 0 ? sp.length : sp.dist[j])) / 2;
    const prevGap = ribbon.inGap(sp.dist[i] - 0.01);
    const gap = ribbon.inGap(sMid);
    const hwi = ribbon.halfWidth[i];
    const hwj = ribbon.halfWidth[j];
    const yi = y(i);
    const yj = y(j);
    const v0 = sp.dist[i] / ROAD_TILE;
    const v1 = (j === 0 ? sp.length : sp.dist[j]) / ROAD_TILE;

    if (gap) {
      // Lip face where the road ends over a pit.
      if (!prevGap) skirts.quad(edge(i, -hwi, yi), edge(i, hwi, yi), edge(i, -hwi, -14), edge(i, hwi, -14), [0, 1], [0, 1.6]);
      continue;
    }
    if (ribbon.inGap(sp.dist[i] - 1.5)) {
      // Landing face rising out of the pit.
      skirts.quad(edge(i, hwi, yi), edge(i, -hwi, yi), edge(i, hwi, -14), edge(i, -hwi, -14), [0, 1], [0, 1.6]);
    }

    const surface = ribbon.surfaceAt(i);
    if (!road.has(surface)) road.set(surface, new GeoBuilder());
    const rb = road.get(surface)!;
    const uScale = surface === 'salt' ? 13 / ROAD_TILE : 1;
    rb.quad(edge(i, -hwi, yi), edge(j, -hwj, yj), edge(i, hwi, yi), edge(j, hwj, yj), [-uScale, uScale], [v0, v1], true);

    const wall = ribbon.wallHeight[i];
    if (wall === 0) {
      for (const side of [-1, 1]) {
        const a0 = edge(i, side * hwi, yi + 0.04);
        const a1 = edge(j, side * hwj, yj + 0.04);
        const b0 = edge(i, side * (hwi + CURB_WIDTH), yi + 0.04);
        const b1 = edge(j, side * (hwj + CURB_WIDTH), yj + 0.04);
        const cv0 = sp.dist[i] / 4;
        const cv1 = (j === 0 ? sp.length : sp.dist[j]) / 4;
        if (side < 0) curbs.quad(b0, b1, a0, a1, [0, 1], [cv0, cv1], true);
        else curbs.quad(a0, a1, b0, b1, [1, 0], [cv0, cv1], true);
      }
    } else {
      const tall = wall >= 4;
      const target = tall ? tallWalls : lowWalls;
      for (const side of [-1, 1]) {
        const off = (k: number, hw: number) => side * (hw + 0.3 + (tall ? jag[k] : 0));
        const vScale = tall ? 10 : 1;
        const u0 = sp.dist[i] / (tall ? 10 : 2.4);
        const u1 = (j === 0 ? sp.length : sp.dist[j]) / (tall ? 10 : 2.4);
        target.quad(
          edge(i, off(i, hwi), yi + wall),
          edge(j, off(j, hwj), yj + wall),
          edge(i, off(i, hwi), yi - 0.1),
          edge(j, off(j, hwj), yj - 0.1),
          [u0, u1],
          [wall / vScale, 0],
          false,
          true,
        );
      }
    }

    if (yi > 0.05 || yj > 0.05) {
      for (const side of [-1, 1]) {
        const lat = side * (wall === 0 ? hwi + CURB_WIDTH : hwi + 0.3);
        const latj = side * (wall === 0 ? hwj + CURB_WIDTH : hwj + 0.3);
        skirts.quad(edge(i, lat, yi), edge(j, latj, yj), edge(i, lat, -14), edge(j, latj, -14), [sp.dist[i] / 10, sp.dist[j] / 10], [1.6, 0], false, true);
      }
    }
  }

  for (const [surface, b] of road) g.add(b.mesh(mats.road[surface]));
  g.add(curbs.mesh(mats.curb));
  g.add(tallWalls.mesh(mats.strata));
  g.add(lowWalls.mesh(mats.diamond));
  g.add(skirts.mesh(mats.strata));
  return g;
}

type V3 = [number, number, number];

/** Accumulates textured quads into one non-indexed geometry. */
class GeoBuilder {
  private readonly pos: number[] = [];
  private readonly uv: number[] = [];

  /**
   * Quad from a0-a1 (one edge) to b0-b1 (the other). With `uAlong`, u runs
   * a->b and v runs 0->1; otherwise u runs 0->1 along and v across.
   */
  quad(a0: V3, a1: V3, b0: V3, b1: V3, u: [number, number], v: [number, number], acrossU = false, alongU = false): void {
    this.pos.push(...a0, ...a1, ...b0, ...b0, ...a1, ...b1);
    if (acrossU) {
      this.uv.push(u[0], v[0], u[0], v[1], u[1], v[0], u[1], v[0], u[0], v[1], u[1], v[1]);
    } else if (alongU) {
      this.uv.push(u[0], v[0], u[1], v[0], u[0], v[1], u[0], v[1], u[1], v[0], u[1], v[1]);
    } else {
      this.uv.push(u[0], v[0], u[1], v[0], u[0], v[1], u[0], v[1], u[1], v[0], u[1], v[1]);
    }
  }

  mesh(material: THREE.Material): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.computeVertexNormals();
    // Roads are wound inconsistently by side; render both faces.
    (material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
    return new THREE.Mesh(geo, material);
  }
}

function startLine(track: Track): THREE.Mesh {
  const hw = track.main.halfWidth[0];
  const p = pointAt(track.spline, 0);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(hw * 2, 2.5),
    new THREE.MeshLambertMaterial({ map: tex.checkerTexture(), polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = Math.atan2(p.tx, p.tz) + Math.PI;
  mesh.position.set(p.x, track.main.heightAt(0) + 0.05, p.z);
  return mesh;
}

function frameAt(ribbon: Ribbon, s: number) {
  const p = pointAt(ribbon.spline, s);
  const tl = Math.hypot(p.tx, p.tz) || 1;
  return { x: p.x, z: p.z, fx: p.tx / tl, fz: p.tz / tl, y: ribbon.heightAt(s), heading: Math.atan2(p.tx, p.tz) };
}

/** Giant bleached snake skeleton arching over the start line. */
function skeletonArch(ribbon: Ribbon, s: number, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const span = ribbon.halfWidth[0] + 4;
  const rise = span * 0.9;
  const vert = new THREE.SphereGeometry(1, 12, 8);
  const rib = new THREE.TorusGeometry(2.6, 0.22, 6, 16, Math.PI * 1.2);
  const count = 23;
  for (let k = 0; k <= count; k++) {
    const a = (k / count) * Math.PI;
    const x = -Math.cos(a) * span;
    const y = Math.sin(a) * rise + 1;
    const v = new THREE.Mesh(vert, mats.bone);
    v.position.set(x, y, 0);
    v.scale.set(1.1, 0.9, 1.3);
    g.add(v);
    if (k > 1 && k < count - 1) {
      const r = new THREE.Mesh(rib, mats.bone);
      r.position.set(x, y, 0);
      r.rotation.set(0, Math.PI / 2, a - Math.PI / 2 + Math.PI * 0.4);
      g.add(r);
    }
  }
  // Skull resting on one end, jaws open toward the road.
  const skull = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), mats.bone);
  skull.scale.set(1.3, 0.8, 1.8);
  skull.position.set(span + 1.5, 2.2, 0);
  g.add(skull);
  for (const side of [-1, 1]) {
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.2, 8), mats.bone);
    fang.rotation.x = Math.PI;
    fang.position.set(span + 1.5 + side * 0.9, 0.9, 2.6);
    g.add(fang);
  }
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Fanged cave mouth swallowing the shortcut. */
function snakeMouth(ribbon: Ribbon, s: number, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidth[0] + 1;
  const head = new THREE.MeshPhongMaterial({ color: 0x5d7a3a, shininess: 50, specular: 0x334422, map: tex.diamondTexture() });
  // Upper jaw slab and snout.
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 6, 3, 10), head);
  jaw.position.set(0, 8, 2);
  g.add(jaw);
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(3, 9, 10), head);
    cheek.position.set(side * (hw + 1.5), 4, 2);
    g.add(cheek);
    const fang = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 10), mats.bone);
    fang.rotation.x = Math.PI;
    fang.position.set(side * hw * 0.55, 4.6, -2.6);
    g.add(fang);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), new THREE.MeshPhongMaterial({ color: 0xffd23a, emissive: 0x664400, shininess: 90 }));
    eye.position.set(side * (hw - 1), 9.8, -1);
    g.add(eye);
  }
  // Cave roof over the next stretch.
  const roofLen = 50;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 2, 2, roofLen), mats.strata);
  roof.position.set(0, 7, 7 + roofLen / 2);
  g.add(roof);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

function boundaryCliffs(bounds: number, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const len = bounds * 2 + 40;
  for (let k = 0; k < 4; k++) {
    const geo = new THREE.BoxGeometry(len, 30, 6);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / 30), uv.getY(i) * 1);
    const wall = new THREE.Mesh(geo, mats.strata);
    const angle = (k * Math.PI) / 2;
    wall.position.set(Math.sin(angle) * (bounds + 4), 13, Math.cos(angle) * (bounds + 4));
    wall.rotation.y = angle;
    g.add(wall);
  }
  return g;
}

/** Flat-topped mesas on the horizon, washed out by haze. */
function distantMesas(): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(5);
  const mat = new THREE.MeshLambertMaterial({ color: 0xa4502e });
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2 + rand() * 0.2;
    const r = 800 + rand() * 300;
    const h = 40 + rand() * 90;
    const w = 60 + rand() * 140;
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.8, w, h, 7), mat);
    mesa.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    mesa.rotation.y = rand() * 3;
    g.add(mesa);
  }
  return g;
}

/** Rocks and saguaros scattered off the road, for speed perception. */
function decor(track: Track, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(7);
  const b = track.def.bounds - 6;
  const ribbons = [track.main, ...track.branches];
  const clear = (x: number, z: number) =>
    ribbons.every((r) => nearestOnSpline(r.spline, x, z).distance > Math.max(...r.halfWidth) + 8) &&
    track.def.pits.every((p) => !inPit({ ...p, halfWidth: p.halfWidth + 6, halfLength: p.halfLength + 6 }, x, z));

  const rockMat = new THREE.MeshLambertMaterial({ map: tex.dirtTexture(), flatShading: true });
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), rockMat, 220);
  const trunkGeo = new THREE.CylinderGeometry(0.45, 0.55, 1, 10);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let placed = 0;
  let cacti = 0;
  for (let tries = 0; tries < 3000 && (placed < 220 || cacti < 70); tries++) {
    const x = (rand() * 2 - 1) * b;
    const z = (rand() * 2 - 1) * b;
    if (!clear(x, z)) continue;
    if (placed < 220 && rand() < 0.7) {
      const s = 0.6 + rand() * 3.2;
      e.set(rand() * 3, rand() * 3, rand() * 3);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, s * 0.35, z), q, new THREE.Vector3(s, s * (0.5 + rand() * 0.8), s));
      rocks.setMatrixAt(placed++, m);
    } else if (cacti < 70) {
      g.add(cactus(x, z, 3 + rand() * 4, rand() * Math.PI, trunkGeo, mats.cactus));
      cacti++;
    }
  }
  rocks.count = placed;
  g.add(rocks);
  return g;
}

function cactus(x: number, z: number, h: number, rot: number, geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Group {
  const c = new THREE.Group();
  const trunk = new THREE.Mesh(geo, mat);
  trunk.scale.set(1, h, 1);
  trunk.position.y = h / 2;
  c.add(trunk);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  cap.position.y = h;
  c.add(cap);
  for (const side of [-1, 1]) {
    const armH = h * (0.25 + 0.15 * (side + 1));
    const arm = new THREE.Mesh(geo, mat);
    arm.scale.set(0.7, armH, 0.7);
    arm.position.set(side * 1.1, h * 0.5 + armH / 2, 0);
    c.add(arm);
    const elbow = new THREE.Mesh(geo, mat);
    elbow.scale.set(0.7, 1.1, 0.7);
    elbow.rotation.z = Math.PI / 2;
    elbow.position.set(side * 0.6, h * 0.5, 0);
    c.add(elbow);
  }
  c.position.set(x, 0, z);
  c.rotation.y = rot;
  return c;
}
