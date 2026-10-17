import * as THREE from 'three';
import { seededRandom } from '../core/math';
import { nearestOnSpline, pointAt } from '../tracks/spline';
import type { PitDef, RoadSurface } from '../tracks/builder';
import { inPit, type Ribbon, type Track } from '../tracks/track';
import * as tex from './textures';
import { THEMES, type Theme } from './themes';

const CURB_WIDTH = 1.2;
/** Meters of road per texture repeat along the track. */
const ROAD_TILE = 14;
/** Draw roads a hair above their physical height to stay clear of the ground. */
const ROAD_LIFT = 0.03;

export interface TrackView {
  group: THREE.Group;
  theme: Theme;
  /** `skyHue` rotates the sky's colors, in radians. */
  update(time: number, cameraPos: THREE.Vector3, skyHue?: number): void;
}

interface Materials {
  road: Record<RoadSurface, THREE.Material>;
  curb: THREE.Material;
  strata: THREE.Material;
  barrier: THREE.MeshLambertMaterial;
  mud: THREE.Material;
  bone: THREE.Material;
  cactus: THREE.Material;
  rock: THREE.Material;
  lava: THREE.MeshBasicMaterial;
  water: THREE.MeshPhongMaterial;
}

function materials(theme: Theme): Materials {
  const lambert = (map: THREE.Texture, extra: THREE.MeshLambertMaterialParameters = {}) =>
    new THREE.MeshLambertMaterial({ map, ...extra });
  const sand = tex.sandTexture();
  const rockMap: Record<Theme['decor'], () => THREE.Texture> = {
    desert: tex.dirtTexture,
    meadow: () => tex.stoneTexture([96, 100, 92], [160, 164, 150]),
    volcanic: tex.basaltTexture,
    jungle: () => tex.stoneTexture([60, 80, 52], [120, 140, 100]),
    lagoon: () => tex.stoneTexture([170, 150, 120], [230, 214, 180]),
    glacier: () => tex.stoneTexture([110, 130, 150], [200, 215, 230]),
    city: () => tex.stoneTexture([40, 34, 56], [90, 80, 110]),
    sky: () => tex.stoneTexture([220, 200, 240], [255, 250, 255]),
  };
  const neon = tex.neonRoadTexture();
  const rainbow = tex.rainbowTexture();
  return {
    road: {
      asphalt: lambert(tex.asphaltTexture()),
      salt: lambert(tex.saltTexture()),
      rock: lambert(tex.dirtTexture()),
      sand: lambert(sand),
      boards: lambert(tex.boardsTexture()),
      ice: new THREE.MeshPhongMaterial({ map: tex.iceTexture(), shininess: 60, specular: 0x4a5a6a }),
      neon: lambert(neon, { emissive: 0xffffff, emissiveMap: neon, emissiveIntensity: 0.7 }),
      rainbow: lambert(rainbow, { emissive: 0xffffff, emissiveMap: rainbow, emissiveIntensity: 0.35 }),
    },
    curb: lambert(tex.curbTexture()),
    strata: lambert(theme.cliff(), { side: THREE.DoubleSide }),
    barrier: lambert(theme.barrier.map(), { side: THREE.DoubleSide }),
    mud: lambert(tex.mudTexture()),
    bone: new THREE.MeshPhongMaterial({ map: tex.boneTexture(), shininess: 30, specular: 0x333322 }),
    cactus: lambert(tex.cactusTexture()),
    rock: new THREE.MeshLambertMaterial({ map: rockMap[theme.decor](), flatShading: true }),
    lava: new THREE.MeshBasicMaterial({ map: tex.lavaTexture(), side: THREE.DoubleSide }),
    water: new THREE.MeshPhongMaterial({ color: 0x2a7a8a, shininess: 120, specular: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  };
}

/** Textured visuals for a spline track, in a sharp early-2000s console style. */
export function buildTrackView(track: Track): TrackView {
  const group = new THREE.Group();
  const theme = THEMES[track.def.theme];
  const mats = materials(theme);

  const abyss = !!track.def.abyss;
  group.add(sky(theme));
  // The sky track floats over a sea of cloud far below; everywhere else has ground, with pits cut in it.
  if (abyss) group.add(cloudSea(theme));
  else {
    group.add(ground(track, theme));
    for (const pit of track.def.pits) group.add(pitMesh(pit, mats));
  }
  for (const ribbon of [track.main, ...track.branches]) group.add(ribbonMeshes(ribbon, mats, abyss));

  const animated: ((time: number) => void)[] = [];
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
    if (lm.kind === 'fortressGate') group.add(fortressGate(ribbon, s, mats));
    if (lm.kind === 'templeGate') group.add(templeGate(ribbon, s, mats));
    if (lm.kind === 'gantry') group.add(gantry(ribbon, s, track.def.name));
    if (lm.kind === 'iceArch') group.add(iceArch(ribbon, s));
    if (lm.kind === 'neonArch') group.add(neonArch(ribbon, s));
    if (lm.kind === 'rainbowArch') group.add(rainbowArch(ribbon, s));
    if (lm.kind === 'lighthouse') {
      const l = lighthouse(ribbon, s);
      group.add(l.group);
      animated.push(l.update);
    }
    if (lm.kind === 'waterfall') {
      const w = waterfall(ribbon, s, mats);
      group.add(w.group);
      animated.push(w.update);
    }
  }
  if (!abyss) group.add(boundaryCliffs(track.def.bounds, mats));
  group.add(decor(track, mats, theme));
  group.add(distant(theme));

  const skyMesh = group.children[0] as THREE.Mesh;
  const skyHue = skyMesh.userData.hue as { value: number };
  return {
    group,
    theme,
    update(time: number, cameraPos: THREE.Vector3, hue = 0) {
      skyHue.value = hue;
      padTexture.offset.y = -time * 2;
      // Desert barrier diamonds crawl along like scales.
      if (theme.barrier.crawl && mats.barrier.map) mats.barrier.map.offset.x = -time * 0.15;
      if (mats.lava.map) mats.lava.map.offset.set(time * 0.02, time * 0.035);
      skyMesh.position.copy(cameraPos);
      for (const a of animated) a(time);
    },
  };
}

function sky(theme: Theme): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ map: tex.skyTexture(theme.sky), side: THREE.BackSide, fog: false, depthWrite: false });
  const hue = { value: 0 };
  // Hue rotation about the grey axis, for the psychedelic sky cycle.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHue = hue;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uHue;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          const vec3 k = vec3(0.57735);
          float c = cos(uHue);
          diffuseColor.rgb = diffuseColor.rgb * c + cross(k, diffuseColor.rgb) * sin(uHue) + k * dot(k, diffuseColor.rgb) * (1.0 - c);
        }`,
      );
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), material);
  mesh.userData.hue = hue;
  mesh.renderOrder = -1;
  return mesh;
}

/** The sky track's floor: a sea of cloud a long way down. */
function cloudSea(theme: Theme): THREE.Mesh {
  const map = theme.ground();
  map.repeat.set(2800 / theme.groundTile, 2800 / theme.groundTile);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2800, 2800), new THREE.MeshBasicMaterial({ map, fog: true }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -70;
  return mesh;
}

/** Desert floor with holes cut for pits. */
function ground(track: Track, theme: Theme): THREE.Mesh {
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
  const map = theme.ground();
  map.repeat.set(1 / theme.groundTile, 1 / theme.groundTile);
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

function pitMesh(p: PitDef, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const corners = pitCorners(p);
  const floorGeo = new THREE.BufferGeometry();
  const floor = corners.map(([x, z]) => [x, -p.depth, z]).flat();
  floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(floor, 3));
  floorGeo.setAttribute('uv', new THREE.Float32BufferAttribute(corners.map(([x, z]) => [x / 12, z / 12]).flat(), 2));
  floorGeo.setIndex([0, 2, 1, 0, 3, 2]);
  floorGeo.computeVertexNormals();
  g.add(new THREE.Mesh(floorGeo, mats.mud));
  if (p.liquid) {
    // A glowing lava or water surface a little below ground level.
    const surface = new THREE.BufferGeometry();
    surface.setAttribute('position', new THREE.Float32BufferAttribute(corners.map(([x, z]) => [x, -2.5, z]).flat(), 3));
    surface.setAttribute('uv', new THREE.Float32BufferAttribute(corners.map(([x, z]) => [x / 10, z / 10]).flat(), 2));
    surface.setIndex([0, 2, 1, 0, 3, 2]);
    surface.computeVertexNormals();
    g.add(new THREE.Mesh(surface, p.liquid === 'lava' ? mats.lava : mats.water));
  }

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
/** `floating`: every stretch is a deck with an underside (the sky track), with no pillars. */
function ribbonMeshes(ribbon: Ribbon, mats: Materials, floating = false): THREE.Group {
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

    const deck = floating || ribbon.def.sections[ribbon.sectionIndex[i]]?.bridge;
    if (deck) {
      // Overpass: a slab with fascia, open underneath for the road below.
      const li = hwi + 0.6;
      const lj = hwj + 0.6;
      skirts.quad(edge(i, -li, yi - DECK_DEPTH), edge(j, -lj, yj - DECK_DEPTH), edge(i, li, yi - DECK_DEPTH), edge(j, lj, yj - DECK_DEPTH), [0, 1], [0, 1], true);
      for (const side of [-1, 1]) {
        skirts.quad(edge(i, side * li, yi + 0.05), edge(j, side * lj, yj + 0.05), edge(i, side * li, yi - DECK_DEPTH), edge(j, side * lj, yj - DECK_DEPTH), [sp.dist[i] / 10, sp.dist[j] / 10], [0.15, 0], false, true);
      }
    } else if (yi > 0.05 || yj > 0.05) {
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
  g.add(lowWalls.mesh(mats.barrier));
  g.add(skirts.mesh(mats.strata));
  if (!floating) g.add(pillars(ribbon, mats));
  return g;
}

const DECK_DEPTH = 1.3;

/** Columns under overpass decks, wherever they won't stand in the road below. */
function pillars(ribbon: Ribbon, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const sp = ribbon.spline;
  const geo = new THREE.CylinderGeometry(0.8, 1, 1, 10);
  let last = -Infinity;
  for (let i = 0; i < sp.count; i++) {
    if (!ribbon.def.sections[ribbon.sectionIndex[i]]?.bridge || sp.dist[i] - last < 14) continue;
    last = sp.dist[i];
    const top = ribbon.heightAt(sp.dist[i]) - DECK_DEPTH;
    for (const side of [-1, 1]) {
      const lat = side * (ribbon.halfWidth[i] - 1.5);
      const x = sp.px[i] - sp.tz[i] * lat;
      const z = sp.pz[i] + sp.tx[i] * lat;
      // Keep clear of any other stretch of this road (the one passing underneath).
      let blocked = false;
      for (let k = 0; k < sp.count && !blocked; k++) {
        const along = Math.abs(sp.dist[k] - sp.dist[i]);
        if (Math.min(along, sp.length - along) < 60) continue;
        blocked = Math.hypot(sp.px[k] - x, sp.pz[k] - z) < ribbon.halfWidth[k] + 3;
      }
      if (blocked) continue;
      const col = new THREE.Mesh(geo, mats.strata);
      col.scale.set(1, top, 1);
      col.position.set(x, top / 2, z);
      g.add(col);
    }
  }
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

/** Basalt gatehouse over the road: two crenellated towers, a lintel with glowing eyes. */
function fortressGate(ribbon: Ribbon, s: number, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const tower = new THREE.BoxGeometry(5, 16, 5);
  const merlon = new THREE.BoxGeometry(1.2, 1.4, 1.2);
  for (const side of [-1, 1]) {
    const t = new THREE.Mesh(tower, mats.strata);
    t.position.set(side * (hw + 2.5), 8, 0);
    g.add(t);
    for (const [mx, mz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) {
      const m = new THREE.Mesh(merlon, mats.strata);
      m.position.set(side * (hw + 2.5) + mx, 16.7, mz);
      g.add(m);
    }
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 10, 3, 4), mats.strata);
  lintel.position.y = 12.5;
  g.add(lintel);
  const glow = tex.glowTexture('rgba(255,200,80,1)', 'rgba(255,60,0,0)');
  for (const side of [-1, 1]) {
    const eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff7020, blending: THREE.AdditiveBlending, depthWrite: false }));
    eye.position.set(side * 2.6, 12.6, 2.2);
    eye.scale.setScalar(3);
    g.add(eye);
  }
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** Stepped stone arch with a big faceted polygon on top. */
function templeGate(ribbon: Ribbon, s: number, mats: Materials): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const w = 5 - k;
      const step = new THREE.Mesh(new THREE.BoxGeometry(w, 3, w), mats.strata);
      step.position.set(side * (hw + 2.5), 1.5 + k * 3, 0);
      g.add(step);
    }
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 8, 2.4, 3.2), mats.strata);
  lintel.position.y = 12.6;
  g.add(lintel);
  const gem = new THREE.Mesh(
    new THREE.IcosahedronGeometry(3, 0),
    new THREE.MeshPhongMaterial({ color: 0x3ad8a0, emissive: 0x0a4a30, shininess: 120, specular: 0xffffff, flatShading: true }),
  );
  gem.position.y = 17;
  g.add(gem);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A cliff beside the road with a falling sheet of water, mist and a pool. */
function waterfall(ribbon: Ribbon, s: number, mats: Materials): { group: THREE.Group; update: (time: number) => void } {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  // Set back from the road and angled to face oncoming karts.
  const falls = new THREE.Group();
  falls.position.set(ribbon.halfWidthAtS(s) + 16, 0, 0);
  falls.rotation.y = -0.7;
  g.add(falls);
  const cliff = new THREE.Mesh(new THREE.BoxGeometry(34, 30, 10), mats.strata);
  cliff.position.set(9, 15, 0);
  cliff.rotation.y = Math.PI / 2;
  const waterTex = tex.waterfallTexture();
  waterTex.repeat.set(1.5, 1);
  const fall = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 29),
    new THREE.MeshBasicMaterial({ map: waterTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  fall.position.set(3.8, 15, 0);
  fall.rotation.y = Math.PI / 2;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(9, 24), mats.water);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.08, 0);
  falls.add(cliff, fall, pool);
  const mist = tex.glowTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
  for (let k = 0; k < 4; k++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: mist, transparent: true, opacity: 0.5, depthWrite: false }));
    m.position.set(1, 2 + k, (k - 1.5) * 3);
    m.scale.setScalar(9);
    falls.add(m);
  }
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return { group: g, update: (time) => (waterTex.offset.y = time * 1.6) };
}

/** Start gantry: two pylons and a banner with the track name between infinity signs. */
function gantry(ribbon: Ribbon, s: number, name: string): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const steel = new THREE.MeshPhongMaterial({ color: 0xd8dde8, shininess: 90, specular: 0xffffff });
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 1.2), steel);
    pylon.position.set(side * hw, 4.5, 0);
    g.add(pylon);
  }
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 1024, 0);
  ['#ff5ad0', '#3ad8ff', '#7affb0', '#ffd23a', '#ff5ad0'].forEach((col, i) => grad.addColorStop(i / 4, col));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 128);
  ctx.font = 'italic 900 78px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#2a0636';
  const label = `\u221E  ${name.toUpperCase()}  \u221E`;
  ctx.strokeText(label, 512, 68);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, 512, 68);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.2, 2.4, 0.4), [steel, steel, steel, steel, new THREE.MeshBasicMaterial({ map }), new THREE.MeshBasicMaterial({ map })]);
  banner.position.y = 8.2;
  g.add(banner);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A striped lighthouse beside the road, its lamp sweeping a beam round. */
function lighthouse(ribbon: Ribbon, s: number): { group: THREE.Group; update: (time: number) => void } {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const tower = new THREE.Group();
  tower.position.set(-(ribbon.halfWidthAtS(s) + 14), 0, 0);
  g.add(tower);
  const bands = 6;
  for (let k = 0; k < bands; k++) {
    const r0 = 3.4 - k * 0.3;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r0 - 0.3, r0, 4, 16), new THREE.MeshLambertMaterial({ color: k % 2 ? 0xf4f0e8 : 0xd8302a }));
    band.position.y = 2 + k * 4;
    tower.add(band);
  }
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 12), new THREE.MeshBasicMaterial({ color: 0xfff4c0 }));
  lamp.position.y = 25.2;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2, 2.4, 12), new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
  roof.position.y = 27.6;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glowTexture('rgba(255,250,210,1)', 'rgba(255,240,180,0)'), blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.y = 25.2;
  glow.scale.setScalar(9);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(4, 60, 16, 1, true).translate(0, -30, 0).rotateZ(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xfff4c8, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  const pivot = new THREE.Group();
  pivot.position.y = 25.2;
  pivot.add(beam);
  tower.add(lamp, roof, glow, pivot);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return { group: g, update: (time) => (pivot.rotation.y = time * 0.9) };
}

/** Two pillars of glacier ice and a lintel, see-through and glinting. */
function iceArch(ribbon: Ribbon, s: number): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 1.5;
  const ice = new THREE.MeshPhongMaterial({ color: 0xbfe6ff, emissive: 0x1a3a5a, shininess: 140, specular: 0xffffff, transparent: true, opacity: 0.8, flatShading: true });
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(2.6 - k * 0.4, 0), ice);
      shard.scale.set(1, 2.4, 1);
      shard.position.set(side * (hw + 2 + k * 0.4), 4.5 + k * 3.6, (k - 1) * 0.6);
      shard.rotation.y = k + side;
      g.add(shard);
    }
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 8, 2.2, 3), ice);
  lintel.position.y = 13;
  g.add(lintel);
  for (let k = -3; k <= 3; k++) {
    const icicle = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.4 + Math.abs(k % 2) * 1.4, 6), ice);
    icicle.rotation.x = Math.PI;
    icicle.position.set((k / 3) * hw, 11.2, 0);
    g.add(icicle);
  }
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A gantry of neon tubes over the road with the city's name in lights. */
function neonArch(ribbon: Ribbon, s: number): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const hw = ribbon.halfWidthAtS(s) + 2;
  const tube = (color: number) => new THREE.MeshBasicMaterial({ color });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1, 10, 1), new THREE.MeshLambertMaterial({ color: 0x1a1428 }));
    post.position.set(side * hw, 5, 0);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 10, 0.3), tube(side < 0 ? 0xff3ad8 : 0x3adcff));
    stripe.position.set(side * hw, 5, 0.6);
    g.add(post, stripe);
  }
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0a0614';
  ctx.fillRect(0, 0, 1024, 128);
  ctx.font = '900 80px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 24;
  ctx.shadowColor = '#ff3ad8';
  ctx.fillStyle = '#ffd0f4';
  ctx.fillText('CYBOOGIE CITY', 512, 68);
  ctx.shadowColor = '#3adcff';
  ctx.strokeStyle = '#8af0ff';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 1008, 112);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1428 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1, 2.6, 0.4), [dark, dark, dark, dark, new THREE.MeshBasicMaterial({ map }), new THREE.MeshBasicMaterial({ map })]);
  sign.position.y = 9;
  g.add(sign);
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.heading;
  return g;
}

/** A rainbow bowed over the road, seven bands. */
function rainbowArch(ribbon: Ribbon, s: number): THREE.Group {
  const g = new THREE.Group();
  const f = frameAt(ribbon, s);
  const r = ribbon.halfWidthAtS(s) + 4;
  const colors = [0xff5a7a, 0xffa64a, 0xffe45a, 0x6aef7a, 0x4ad0ff, 0x7a7aff, 0xc86aff];
  colors.forEach((color, k) => {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r + k * 0.9, 0.45, 8, 40, Math.PI), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    g.add(band);
  });
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

/** Silhouettes on the horizon, washed out by haze: mesas, hills, volcanoes or peaks. */
function distant(theme: Theme): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(5);
  const mat = new THREE.MeshLambertMaterial({ color: theme.distant.color });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, fog: false });
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2 + rand() * 0.2;
    const r = 800 + rand() * 300;
    const h = 40 + rand() * 90;
    const w = 60 + rand() * 140;
    let mesh: THREE.Mesh;
    switch (theme.distant.shape) {
      case 'mesa':
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.8, w, h, 7), mat);
        mesh.position.y = h / 2 - 2;
        break;
      case 'hill':
        mesh = new THREE.Mesh(new THREE.SphereGeometry(w, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
        mesh.scale.y = (h / w) * 0.9;
        break;
      case 'volcano': {
        const vh = h * 2;
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.18, w, vh, 10), mat);
        mesh.position.y = vh / 2 - 2;
        const crater = new THREE.Mesh(new THREE.CircleGeometry(w * 0.16, 12), glowMat);
        crater.rotation.x = -Math.PI / 2;
        crater.position.y = vh / 2 + 0.5;
        mesh.add(crater);
        break;
      }
      case 'mountain':
        mesh = new THREE.Mesh(new THREE.ConeGeometry(w, h * 2.2, 7), mat);
        mesh.position.y = h * 1.1 - 2;
        break;
      case 'city': {
        // A cluster of towers with lit windows.
        mesh = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, h * 2, w * 0.3), mat);
        mesh.position.y = h - 2;
        for (let t = 0; t < 4; t++) {
          const th = h * (0.8 + rand() * 1.8);
          const tower = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, th, w * 0.2), mat);
          tower.position.set((rand() - 0.5) * w, th / 2 - h, (rand() - 0.5) * w * 0.4);
          mesh.add(tower);
        }
        break;
      }
      case 'cloud':
        mesh = new THREE.Mesh(new THREE.SphereGeometry(w * 0.6, 14, 10), mat);
        mesh.scale.set(1.6, 0.6, 1);
        mesh.position.y = (rand() - 0.3) * 120;
        break;
    }
    mesh.position.x = Math.cos(a) * r;
    mesh.position.z = Math.sin(a) * r;
    mesh.rotation.y = rand() * 3;
    g.add(mesh);
  }
  return g;
}

/** Rocks plus the theme's own scenery scattered off the road, for speed perception. */
function decor(track: Track, mats: Materials, theme: Theme): THREE.Group {
  const g = new THREE.Group();
  const rand = seededRandom(7);
  const b = track.def.bounds - 6;
  const ribbons = [track.main, ...track.branches];
  const clear = (x: number, z: number) =>
    ribbons.every((r) => nearestOnSpline(r.spline, x, z).distance > Math.max(...r.halfWidth) + 8) &&
    track.def.pits.every((p) => !inPit({ ...p, halfWidth: p.halfWidth + 6, halfLength: p.halfLength + 6 }, x, z));

  const rockCount = { jungle: 120, city: 0, sky: 0, lagoon: 60, glacier: 140 }[theme.decor as string] ?? 220;
  const featureCount = { jungle: 150, meadow: 110, lagoon: 120, glacier: 160, city: 90, sky: 90 }[theme.decor as string] ?? 70;
  // Sky scenery floats at all heights; city towers need room off the road.
  const floating = theme.decor === 'sky';
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), mats.rock, rockCount);
  const feature = featureBuilder(theme, mats);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let placed = 0;
  let features = 0;
  for (let tries = 0; tries < 4000 && (placed < rockCount || features < featureCount); tries++) {
    const x = (rand() * 2 - 1) * b;
    const z = (rand() * 2 - 1) * b;
    if (!clear(x, z)) continue;
    if (placed < rockCount && rand() < 0.6) {
      const s = 0.6 + rand() * 3.2;
      e.set(rand() * 3, rand() * 3, rand() * 3);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, s * 0.35, z), q, new THREE.Vector3(s, s * (0.5 + rand() * 0.8), s));
      rocks.setMatrixAt(placed++, m);
    } else if (features < featureCount) {
      const obj = feature(x, z, rand);
      if (floating) obj.position.y = -40 + rand() * 70;
      g.add(obj);
      features++;
    }
  }
  rocks.count = placed;
  g.add(rocks);
  return g;
}

/** Builds one piece of a theme's characteristic scenery. */
function featureBuilder(theme: Theme, mats: Materials): (x: number, z: number, rand: () => number) => THREE.Object3D {
  const trunkGeo = new THREE.CylinderGeometry(0.45, 0.55, 1, 10);
  switch (theme.decor) {
    case 'lagoon': {
      const bark = new THREE.MeshLambertMaterial({ color: 0x9a7a52 });
      const frond = new THREE.MeshLambertMaterial({ color: 0x3aa04a, side: THREE.DoubleSide, flatShading: true });
      const frondGeo = new THREE.ConeGeometry(0.7, 4.4, 4, 1, true).rotateX(Math.PI / 2).translate(0, 0, 2.2).scale(1, 0.15, 1);
      const sand = new THREE.MeshLambertMaterial({ color: 0xe8d8a8 });
      return (x, z, rand) => {
        const t = new THREE.Group();
        // A little sand islet with a palm or two leaning out over the water.
        const islet = new THREE.Mesh(new THREE.CylinderGeometry(3 + rand() * 3, 4 + rand() * 3, 0.6, 14), sand);
        islet.position.y = 0.2;
        t.add(islet);
        const palms = rand() < 0.4 ? 2 : 1;
        for (let p = 0; p < palms; p++) t.add(palmTree(rand, trunkGeo, bark, frondGeo, frond, p * 2.2));
        t.position.set(x, 0, z);
        t.rotation.y = rand() * Math.PI * 2;
        return t;
      };
    }
    case 'glacier': {
      const needles = new THREE.MeshLambertMaterial({ color: 0x2a5a48, flatShading: true });
      const snow = new THREE.MeshLambertMaterial({ color: 0xf4f8ff, flatShading: true });
      const ice = new THREE.MeshPhongMaterial({ color: 0xa8dcff, emissive: 0x10283a, shininess: 120, specular: 0xffffff, transparent: true, opacity: 0.85, flatShading: true });
      return (x, z, rand) => {
        const t = new THREE.Group();
        if (rand() < 0.65) {
          // A snowy pine: stacked cones, white-capped.
          const h = 5 + rand() * 6;
          for (let k = 0; k < 3; k++) {
            const r = (1 - k * 0.25) * h * 0.32;
            const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h * 0.45, 7), needles);
            cone.position.y = h * (0.3 + k * 0.22);
            const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.6, h * 0.2, 7), snow);
            cap.position.y = cone.position.y + h * 0.14;
            t.add(cone, cap);
          }
        } else {
          // Ice shards breaking through the snow.
          for (let k = 0; k < 4; k++) {
            const h = 2 + rand() * 7;
            const shard = new THREE.Mesh(new THREE.ConeGeometry(0.5 + rand() * 0.9, h, 5), ice);
            shard.position.set((rand() - 0.5) * 3, h / 2, (rand() - 0.5) * 3);
            shard.rotation.set((rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 0.6);
            t.add(shard);
          }
        }
        t.position.set(x, 0, z);
        return t;
      };
    }
    case 'city': {
      const windows = tex.windowsTexture();
      const roofMat = new THREE.MeshLambertMaterial({ color: 0x120c1c });
      const trims = [0xff3ad8, 0x3adcff, 0xffd23a, 0x7aff9a].map((c) => new THREE.MeshBasicMaterial({ color: c }));
      return (x, z, rand) => {
        const t = new THREE.Group();
        const w = 5 + rand() * 4;
        const d = 5 + rand() * 4;
        const h = 12 + rand() * 50;
        const map = windows.clone();
        map.needsUpdate = true;
        map.repeat.set(w / 8, h / 8);
        const wall = new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.8 });
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [wall, wall, roofMat, roofMat, wall, wall]);
        tower.position.y = h / 2;
        const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.4, d + 0.3), trims[Math.floor(rand() * trims.length)]);
        trim.position.y = h;
        t.add(tower, trim);
        t.position.set(x, 0, z);
        t.rotation.y = Math.floor(rand() * 4) * (Math.PI / 2);
        return t;
      };
    }
    case 'sky': {
      const puff = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x6a5a7a, flatShading: true });
      const crystal = [0xff9ad8, 0x9ad8ff, 0xffe89a, 0xb89aff].map((c) => new THREE.MeshPhongMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, shininess: 120, flatShading: true }));
      const blob = new THREE.IcosahedronGeometry(1, 1);
      return (x, z, rand) => {
        const t = new THREE.Group();
        if (rand() < 0.75) {
          // A cloud: a few overlapping puffs.
          const n = 3 + Math.floor(rand() * 4);
          for (let k = 0; k < n; k++) {
            const p = new THREE.Mesh(blob, puff);
            const r = 2 + rand() * 4;
            p.scale.set(r * 1.3, r * 0.8, r);
            p.position.set((k - n / 2) * 3, rand() * 1.5, (rand() - 0.5) * 3);
            t.add(p);
          }
        } else {
          // A floating crystal, slowly glowing.
          const c = new THREE.Mesh(new THREE.OctahedronGeometry(1.5 + rand() * 2.5, 0), crystal[Math.floor(rand() * crystal.length)]);
          c.scale.y = 1.8;
          c.rotation.y = rand() * 3;
          t.add(c);
        }
        t.position.set(x, 0, z);
        return t;
      };
    }
    case 'desert':
      return (x, z, rand) => cactus(x, z, 3 + rand() * 4, rand() * Math.PI, trunkGeo, mats.cactus);
    case 'meadow': {
      const bark = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
      const leaves = [0x3f8f3a, 0x5aa840, 0x2f7a3a].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
      const blob = new THREE.IcosahedronGeometry(1, 1);
      return (x, z, rand) => {
        const t = new THREE.Group();
        const h = 3 + rand() * 4;
        const trunk = new THREE.Mesh(trunkGeo, bark);
        trunk.scale.set(0.6, h, 0.6);
        trunk.position.y = h / 2;
        t.add(trunk);
        const mat = leaves[Math.floor(rand() * leaves.length)];
        for (let k = 0; k < 3; k++) {
          const crown = new THREE.Mesh(blob, mat);
          const r = 1.6 + rand() * 1.4;
          crown.scale.setScalar(r);
          crown.position.set((rand() - 0.5) * 1.6, h + r * 0.4 + k * 0.6, (rand() - 0.5) * 1.6);
          t.add(crown);
        }
        t.position.set(x, 0, z);
        return t;
      };
    }
    case 'volcanic': {
      const lava = new THREE.MeshBasicMaterial({ color: 0xff5a10 });
      const crust = new THREE.MeshLambertMaterial({ color: 0x1a1214, flatShading: true });
      return (x, z, rand) => {
        const t = new THREE.Group();
        if (rand() < 0.45) {
          // A bubbling lava pool with a dark crust rim.
          const r = 2 + rand() * 4;
          const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 16), lava);
          pool.rotation.x = -Math.PI / 2;
          pool.position.y = 0.06;
          const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.5, 6, 18), crust);
          rim.rotation.x = Math.PI / 2;
          rim.position.y = 0.1;
          t.add(pool, rim);
        } else {
          // Obsidian spikes.
          for (let k = 0; k < 3; k++) {
            const h = 2 + rand() * 6;
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.6 + rand(), h, 5), crust);
            spike.position.set((rand() - 0.5) * 3, h / 2, (rand() - 0.5) * 3);
            spike.rotation.set((rand() - 0.5) * 0.4, rand() * 3, (rand() - 0.5) * 0.4);
            t.add(spike);
          }
        }
        t.position.set(x, 0, z);
        return t;
      };
    }
    case 'jungle': {
      const bark = new THREE.MeshLambertMaterial({ color: 0x7a5a36 });
      const frond = new THREE.MeshLambertMaterial({ color: 0x2f8a3a, side: THREE.DoubleSide, flatShading: true });
      const fern = new THREE.MeshLambertMaterial({ color: 0x4aa040, flatShading: true });
      const frondGeo = new THREE.ConeGeometry(0.7, 4, 4, 1, true).rotateX(Math.PI / 2).translate(0, 0, 2).scale(1, 0.15, 1);
      return (x, z, rand) => {
        const t = new THREE.Group();
        if (rand() < 0.55) {
          // A palm with a leaning, segmented trunk.
          const h = 6 + rand() * 6;
          const lean = (rand() - 0.5) * 0.5;
          const segs = 5;
          let top = new THREE.Vector3();
          for (let k = 0; k < segs; k++) {
            const seg = new THREE.Mesh(trunkGeo, bark);
            const y = (k + 0.5) * (h / segs);
            seg.scale.set(0.5 - k * 0.04, h / segs, 0.5 - k * 0.04);
            seg.position.set(Math.sin(lean * (k / segs)) * k * 0.8, y, 0);
            seg.rotation.z = -lean * (k / segs);
            t.add(seg);
            top = seg.position.clone().setY(h);
          }
          for (let k = 0; k < 7; k++) {
            const f = new THREE.Mesh(frondGeo, frond);
            f.position.copy(top);
            f.rotation.set(0.5 + rand() * 0.3, (k / 7) * Math.PI * 2, 0, 'YXZ');
            t.add(f);
          }
        } else {
          for (let k = 0; k < 5; k++) {
            const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.4, 4), fern);
            leaf.position.set((rand() - 0.5) * 1.5, 1, (rand() - 0.5) * 1.5);
            leaf.rotation.set((rand() - 0.5) * 1.2, rand() * 3, (rand() - 0.5) * 1.2);
            t.add(leaf);
          }
        }
        t.position.set(x, 0, z);
        t.rotation.y = rand() * Math.PI * 2;
        return t;
      };
    }
  }
}

/** A palm with a leaning, segmented trunk and a crown of fronds; `offset` shifts it across its spot. */
function palmTree(
  rand: () => number,
  trunkGeo: THREE.BufferGeometry,
  bark: THREE.Material,
  frondGeo: THREE.BufferGeometry,
  frond: THREE.Material,
  offset = 0,
): THREE.Group {
  const t = new THREE.Group();
  const h = 6 + rand() * 6;
  const lean = (rand() - 0.5) * 0.7;
  const segs = 5;
  let top = new THREE.Vector3();
  for (let k = 0; k < segs; k++) {
    const seg = new THREE.Mesh(trunkGeo, bark);
    seg.scale.set(0.5 - k * 0.04, h / segs, 0.5 - k * 0.04);
    seg.position.set(Math.sin(lean * (k / segs)) * k * 0.8, (k + 0.5) * (h / segs), 0);
    seg.rotation.z = -lean * (k / segs);
    t.add(seg);
    top = seg.position.clone().setY(h);
  }
  for (let k = 0; k < 7; k++) {
    const f = new THREE.Mesh(frondGeo, frond);
    f.position.copy(top);
    f.rotation.set(0.5 + rand() * 0.3, (k / 7) * Math.PI * 2, 0, 'YXZ');
    t.add(f);
  }
  t.position.x = offset;
  t.rotation.y = rand() * Math.PI * 2;
  return t;
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
