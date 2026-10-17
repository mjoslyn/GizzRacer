import * as THREE from 'three';
import { clamp, damp, lerpAngle } from '../core/math';
import type { KartState } from '../physics/kart';

const DISTANCE = 7.5;
const HEIGHT = 3.2;
const LOOK_AHEAD = 4;
const BASE_FOV = 68;

/** Third-person camera that trails the kart's travel direction (not its drift yaw). */
export class ChaseCamera {
  private yaw = 0;
  private readonly pos = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private initialized = false;
  private shake = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  snap(): void {
    this.initialized = false;
  }

  bump(amount: number): void {
    this.shake = Math.max(this.shake, amount);
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
    const dist = DISTANCE + speedRatio * 1.2;

    const desired = new THREE.Vector3(s.x - fx * dist, s.y + HEIGHT, s.z - fz * dist);
    if (!this.initialized) {
      this.pos.copy(desired);
      this.initialized = true;
    } else {
      this.pos.lerp(desired, damp(10, dt));
      this.pos.y += (desired.y - this.pos.y) * damp(4, dt);
    }
    this.target.set(s.x + fx * LOOK_AHEAD, s.y + 1, s.z + fz * LOOK_AHEAD);

    this.shake = Math.max(0, this.shake - dt * 3);
    const jitter = this.shake * 0.15;
    this.camera.position.set(
      this.pos.x + (Math.random() - 0.5) * jitter,
      this.pos.y + (Math.random() - 0.5) * jitter,
      this.pos.z + (Math.random() - 0.5) * jitter,
    );
    this.camera.lookAt(this.target);

    const fov = BASE_FOV + speedRatio * 10 + (s.boostTime > 0 ? 8 : 0);
    this.camera.fov += (fov - this.camera.fov) * damp(4, dt);
    this.camera.updateProjectionMatrix();
  }
}
