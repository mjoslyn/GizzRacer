import * as THREE from 'three';
import { glowTexture, portalTexture } from './textures';

/** Seconds the gate takes to open, hold for the kart, and close. */
export const GATE_OPEN = 0.35;
export const GATE_TIME = 1.25;
const RADIUS = 2.6;
const ORBS = 9;

let sharedPortal: THREE.Texture | null = null;
let sharedGlow: THREE.Texture | null = null;

/**
 * Nonagon Infinity opens the door: a nine-sided portal that swirls open
 * on the road, lets a kart back into the race, and spins shut.
 */
export class NonagonGate {
  readonly group = new THREE.Group();
  private readonly outer: THREE.Mesh;
  private readonly inner: THREE.Mesh;
  private readonly swirl: THREE.Mesh;
  private readonly orbs: THREE.Sprite[] = [];
  private readonly glow: THREE.Sprite;
  private time = GATE_TIME;

  constructor() {
    sharedPortal ??= portalTexture();
    sharedGlow ??= glowTexture();
    // A torus with nine segments around its ring is a nonagon.
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23a });
    this.outer = new THREE.Mesh(new THREE.TorusGeometry(RADIUS, 0.2, 6, 9), ringMat);
    this.inner = new THREE.Mesh(new THREE.TorusGeometry(RADIUS * 0.82, 0.1, 5, 9), new THREE.MeshBasicMaterial({ color: 0xff4ad8 }));
    this.swirl = new THREE.Mesh(
      new THREE.CircleGeometry(RADIUS * 0.95, 9),
      new THREE.MeshBasicMaterial({ map: sharedPortal, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sharedGlow, color: 0xc86aff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.glow.scale.setScalar(RADIUS * 4);
    const frame = new THREE.Group();
    frame.add(this.outer, this.inner, this.swirl);
    for (let k = 0; k < ORBS; k++) {
      const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: sharedGlow, color: new THREE.Color().setHSL(k / ORBS, 1, 0.65), blending: THREE.AdditiveBlending, depthWrite: false }));
      orb.scale.setScalar(0.9);
      frame.add(orb);
      this.orbs.push(orb);
    }
    frame.position.y = RADIUS + 0.2;
    this.group.add(frame, this.glow);
    this.glow.position.y = RADIUS;
    this.group.visible = false;
  }

  get active(): boolean {
    return this.time < GATE_TIME;
  }

  /** Opens across the road at a pose (heading in the physics convention). */
  open(x: number, y: number, z: number, heading: number): void {
    this.group.position.set(x, y, z);
    // The ring's face looks along the road.
    this.group.rotation.y = heading;
    this.time = 0;
    this.group.visible = true;
  }

  /** How far the gate has let the kart back in, 0..1. */
  get emerged(): number {
    return Math.min(1, Math.max(0, (this.time - GATE_OPEN * 0.6) / 0.45));
  }

  update(dt: number, elapsed: number): void {
    if (!this.group.visible) return;
    this.time += dt;
    if (this.time >= GATE_TIME) {
      this.group.visible = false;
      return;
    }
    const t = this.time;
    // Opens with a little overshoot, holds, then snaps shut.
    const open = t < GATE_OPEN ? easeOutBack(t / GATE_OPEN) : t > GATE_TIME - 0.3 ? Math.max(0, (GATE_TIME - t) / 0.3) : 1;
    const frame = this.outer.parent!;
    frame.scale.setScalar(Math.max(0.001, open));
    const spin = t * (t > GATE_TIME - 0.3 ? 14 : 3);
    this.outer.rotation.z = spin;
    this.inner.rotation.z = -spin * 1.6;
    this.swirl.rotation.z = -elapsed * 4;
    (this.outer.material as THREE.MeshBasicMaterial).color.setHSL((elapsed * 0.4) % 1, 1, 0.6);
    this.orbs.forEach((orb, k) => {
      const a = (k / ORBS) * Math.PI * 2 + spin;
      orb.position.set(Math.cos(a) * RADIUS, Math.sin(a) * RADIUS, 0);
    });
    this.glow.material.opacity = 0.8 * open;
  }
}

function easeOutBack(x: number): number {
  const c = 1.9;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
}
