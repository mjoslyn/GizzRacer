import * as THREE from 'three';
import { clamp, damp, lerpAngle } from '../core/math';
import type { KartState } from '../physics/kart';

/** Where the camera sits: metres behind and above the kart, how far up the road it looks and at what height, and its field of view. */
export interface CameraPlacement {
  distance: number;
  height: number;
  lookAhead: number;
  lookHeight: number;
  fov: number;
}

// Close over the driver's shoulder and a little above, wide: the kart big in the lower middle of the screen.
export const DEFAULT_PLACEMENT: CameraPlacement = { distance: 2.75, height: 3.2, lookAhead: 6, lookHeight: -0.5, fov: 78 };

/** How far further back and up (m) the camera draws while the kart glides. */
const GLIDE_BACK = 4;
const GLIDE_UP = 1.8;

/** Third-person camera that trails the kart's travel direction (not its drift yaw). */
export class ChaseCamera {
  private yaw = 0;
  private readonly pos = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private initialized = false;
  private shake = 0;
  /** Extra field of view (degrees) from a boost kicking in, easing back out. */
  private punch = 0;
  /** 0..1, eased: how far the camera has drawn back and up to see past an open glider. */
  private glide = 0;

  placement: CameraPlacement = { ...DEFAULT_PLACEMENT };

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  snap(): void {
    this.initialized = false;
  }

  bump(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  /** A kick of field of view (degrees): the rush of a boost kicking in. */
  kick(degrees: number): void {
    this.punch = Math.max(this.punch, degrees);
  }

  update(s: KartState, topSpeed: number, lookBack: boolean, dt: number): void {
    if (!this.initialized) {
      this.yaw = s.heading;
    } else {
      this.yaw = lerpAngle(this.yaw, s.heading, damp(5, dt));
    }
    const yaw = lookBack ? this.yaw + Math.PI : this.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const speedRatio = clamp(Math.abs(s.speed) / topSpeed, 0, 1.5);
    const pl = this.placement;
    // With the glider open, back and up over the canopy, looking down past it at the kart.
    this.glide += ((s.glideTime > 0 ? 1 : 0) - this.glide) * damp(3, dt);
    const dist = pl.distance + speedRatio * 0.3 + GLIDE_BACK * this.glide;

    const desired = new THREE.Vector3(s.x - fx * dist, s.y + pl.height + GLIDE_UP * this.glide, s.z - fz * dist);
    if (!this.initialized) {
      this.pos.copy(desired);
      this.initialized = true;
    } else {
      // Exactly its distance behind, however fast: easing the position made it trail further back the faster you went.
      // The yaw is what's smoothed (above); height eases so bumps and landings don't jolt.
      this.pos.x = desired.x;
      this.pos.z = desired.z;
      this.pos.y += (desired.y - this.pos.y) * damp(8, dt);
    }
    this.target.set(s.x + fx * pl.lookAhead, s.y + pl.lookHeight, s.z + fz * pl.lookAhead);

    this.shake = Math.max(0, this.shake - dt * 3);
    const jitter = this.shake * 0.15;
    this.camera.position.set(
      this.pos.x + (Math.random() - 0.5) * jitter,
      this.pos.y + (Math.random() - 0.5) * jitter,
      this.pos.z + (Math.random() - 0.5) * jitter,
    );
    this.camera.lookAt(this.target);

    this.punch = Math.max(0, this.punch - dt * 14);
    const fov = pl.fov + speedRatio * 10 + (s.boostTime > 0 ? 8 : 0);
    // The kick lands at once and eases out; the rest follows speed smoothly.
    this.camera.fov += (fov - this.camera.fov) * damp(4, dt);
    this.camera.fov += (fov + this.punch - this.camera.fov) * (this.punch > 0 ? damp(18, dt) : 0);
    this.camera.updateProjectionMatrix();
  }
}
