import * as THREE from 'three';
import { seededRandom } from '../../core/math';
import { glowMap, jitter, type Animated } from './base';
import type { Beat } from './beat';
import { beat as makeBeat } from './beat';
import { scatterSites, type StretchOptions } from './scatter';

/**
 * A crowd along the roadside: figures in rows facing the road, bobbing,
 * swaying, jumping or waving on the beat, the way Sadie Sorceress's mob
 * shakes its forks on the kick. Bodies, heads and arms are three
 * InstancedMeshes, whatever the size of the crowd, and what they hold up
 * (torches, lighters, phones) one Points cloud.
 */

export interface CrowdOptions extends Omit<StretchOptions, 'spacing' | 'turn'> {
  /** Metres between figures along a row (default 1.6). */
  spacing?: number;
  /** Rows deep (default 2), this far apart (default 1.3). */
  rows?: number;
  rowGap?: number;
  /** What they wear, jittered figure by figure; their skin. */
  clothes?: readonly number[];
  skin?: number;
  /** How tall (default 1.8), varied ±10%. */
  height?: number;
  /** How they move: bob (up and down on the kick), sway (side to side over two beats), jump, wave (arms up and swinging). */
  motion?: 'bob' | 'sway' | 'jump' | 'wave';
  /** The beat they move to (default 120 bpm), and how much (default 1). */
  beat?: Beat;
  amount?: number;
  /** Lights held up: one figure in `every` holds one, in this colour (torches, lighters, phones). */
  lights?: { color: number; every?: number; size?: number };
}

export interface Crowd {
  group: THREE.Group;
  /** How many figures stand in it. */
  count: number;
}

/** A crowd lining a stretch of road. */
export function crowd(o: CrowdOptions, animated: Animated): Crowd {
  const group = new THREE.Group();
  const rows = o.rows ?? 2;
  const gap = o.rowGap ?? 1.3;
  const [near] = o.band ?? [2.5, 2.5];
  const height = o.height ?? 1.8;
  const b = o.beat ?? makeBeat(120);
  const amount = o.amount ?? 1;
  const motion = o.motion ?? 'bob';
  const rand = seededRandom((o.seed ?? 77) + 3);
  type Figure = { x: number; z: number; yaw: number; h: number; ph: number };
  const figures: Figure[] = [];
  for (let r = 0; r < rows; r++) {
    const row = scatterSites({ ...o, spacing: o.spacing ?? 1.6, band: [near + r * gap, near + r * gap + 0.4], scale: [0.9, 1.1], seed: (o.seed ?? 77) + r * 13 });
    for (const site of row) figures.push({ x: site.x, z: site.z, yaw: site.facing + (rand() - 0.5) * 0.5, h: height * site.scale, ph: rand() * 0.25 });
  }
  const n = Math.max(1, figures.length);
  const bodyGeo = new THREE.CylinderGeometry(0.22, 0.3, 1, 7);
  bodyGeo.translate(0, 0.5, 0);
  const headGeo = new THREE.SphereGeometry(0.15, 8, 6);
  const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.6, 4);
  armGeo.translate(0, 0.3, 0);
  const clothMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const skinMat = new THREE.MeshLambertMaterial({ color: o.skin ?? 0xc89070 });
  const bodies = new THREE.InstancedMesh(bodyGeo, clothMat, n);
  const heads = new THREE.InstancedMesh(headGeo, skinMat, n);
  const arms = new THREE.InstancedMesh(armGeo, clothMat, n * 2);
  const clothes = o.clothes ?? [0x4a3a2a, 0x3a3a44, 0x5a4a3a, 0x2a3a2a, 0x6a2a20];
  const c = new THREE.Color();
  figures.forEach((_, i) => {
    jitter(clothes[Math.floor(rand() * clothes.length)], rand, 0.12, c);
    bodies.setColorAt(i, c);
    arms.setColorAt(i * 2, c);
    arms.setColorAt(i * 2 + 1, c);
  });
  bodies.count = heads.count = figures.length;
  arms.count = figures.length * 2;
  group.add(bodies, heads, arms);
  // What they hold up.
  const every = o.lights?.every ?? 4;
  const holders = o.lights ? figures.map((_, i) => i).filter((i) => i % every === 0) : [];
  const lightPos = new Float32Array(Math.max(1, holders.length) * 3);
  const lightGeo = new THREE.BufferGeometry();
  lightGeo.setAttribute('position', new THREE.BufferAttribute(lightPos, 3));
  if (o.lights && holders.length) {
    const pts = new THREE.Points(lightGeo, new THREE.PointsMaterial({ map: glowMap(), color: o.lights.color, size: o.lights.size ?? 0.9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false;
    group.add(pts);
  }
  const holds = new Set(holders);
  const m = new THREE.Matrix4();
  const part = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const hand = new THREE.Vector3();
  const place = (time: number) => {
    let li = 0;
    figures.forEach((f, i) => {
      const k = b.kick(time, f.ph);
      const sw = b.sway(time, 2, f.ph);
      const lift = motion === 'jump' ? 0.35 * k * amount * f.h : motion === 'bob' ? 0.08 * k * amount * f.h : 0;
      const lean = motion === 'sway' ? 0.12 * sw * amount : 0;
      m.makeRotationY(f.yaw).setPosition(f.x, lift, f.z);
      if (lean) m.multiply(tmp.makeRotationZ(lean));
      bodies.setMatrixAt(i, part.copy(m).multiply(tmp.makeScale(1, f.h * 0.72, 1)));
      heads.setMatrixAt(i, part.copy(m).multiply(tmp.makeTranslation(0, f.h * 0.82, 0)));
      // Arms: down at their sides, or up (waving, or holding a light) and swinging.
      const up = motion === 'wave' || holds.has(i);
      for (const side of [-1, 1]) {
        // rotation z θ turns the arm's tip (0, 1) to (-sin θ, cos θ): up and out is -side·a, down and out π + side·a.
        const angle = up ? -side * (0.3 + (motion === 'wave' ? 0.35 * (1 + side * sw) : 0.1 * sw) * amount) : Math.PI + side * (0.12 + (motion === 'bob' ? 0.3 * k * amount : 0));
        part.copy(m).multiply(tmp.makeTranslation(side * 0.28, f.h * 0.68, 0)).multiply(tmp.makeRotationZ(angle));
        arms.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), part);
        if (side > 0 && holds.has(i)) {
          hand.set(0, 0.65, 0).applyMatrix4(part);
          lightPos.set([hand.x, hand.y, hand.z], li * 3);
          li++;
        }
      }
    });
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = arms.instanceMatrix.needsUpdate = true;
    lightGeo.attributes.position.needsUpdate = true;
  };
  place(0);
  // The crowd spans a stretch: bound it where it stands, not where its unit mesh is.
  for (const mesh of [bodies, heads, arms]) mesh.computeBoundingSphere();
  animated.push(place);
  return { group, count: figures.length };
}
