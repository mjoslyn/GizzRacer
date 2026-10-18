import * as THREE from 'three';
import { clamp, damp, lerpAngle } from '../core/math';
import type { KartState } from '../physics/kart';

// Mario Kart's angle: low and close behind, the kart big in the lower middle of the screen, looking well up the road.
const DISTANCE = 4.3;
const HEIGHT = 1.75;
const LOOK_AHEAD = 9;
const BASE_FOV = 72;

/** Third-person camera that trails the kart's travel direction (not its drift yaw). */
export class ChaseCamera {
  private yaw = 0;
  private readonly pos = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private initialized = false;
  private shake = 0;
  /** Extra field of view (degrees) from a boost kicking in, easing back out. */
  private punch = 0;

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
    const dist = DISTANCE + speedRatio * 0.6;

    const desired = new THREE.Vector3(s.x - fx * dist, s.y + HEIGHT, s.z - fz * dist);
    if (!this.initialized) {
      this.pos.copy(desired);
      this.initialized = true;
    } else {
      this.pos.lerp(desired, damp(10, dt));
      this.pos.y += (desired.y - this.pos.y) * damp(4, dt);
    }
    this.target.set(s.x + fx * LOOK_AHEAD, s.y + 1.1, s.z + fz * LOOK_AHEAD);

    this.shake = Math.max(0, this.shake - dt * 3);
    const jitter = this.shake * 0.15;
    this.camera.position.set(
      this.pos.x + (Math.random() - 0.5) * jitter,
      this.pos.y + (Math.random() - 0.5) * jitter,
      this.pos.z + (Math.random() - 0.5) * jitter,
    );
    this.camera.lookAt(this.target);

    this.punch = Math.max(0, this.punch - dt * 14);
    const fov = BASE_FOV + speedRatio * 10 + (s.boostTime > 0 ? 8 : 0);
    // The kick lands at once and eases out; the rest follows speed smoothly.
    this.camera.fov += (fov - this.camera.fov) * damp(4, dt);
    this.camera.fov += (fov + this.punch - this.camera.fov) * (this.punch > 0 ? damp(18, dt) : 0);
    this.camera.updateProjectionMatrix();
  }
}
