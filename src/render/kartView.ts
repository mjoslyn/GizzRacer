import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import type { KartState } from '../physics/kart';
import { driftTier } from '../physics/kart';
import type { RacerDef } from '../physics/racers';

const SPARK_COLORS = [0xfff2a8, 0x3fa9ff, 0xff8a1f, 0xc04bff];
const WHEEL_RADIUS = 0.38;

/** Placeholder kart model with body roll, landing bounce, drift sparks and boost flame. */
export class KartView {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly frontWheels: THREE.Object3D[] = [];
  private readonly wheels: THREE.Mesh[] = [];
  private readonly sparks: THREE.Mesh[] = [];
  private readonly sparkMat = new THREE.MeshBasicMaterial({ color: SPARK_COLORS[0], transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly flame: THREE.Mesh;
  private readonly chassisMat: THREE.MeshLambertMaterial;
  private readonly accentMat: THREE.MeshLambertMaterial;

  private roll = 0;
  private pitch = 0;
  private bounce = 0;
  private bounceVel = 0;
  private lastSpeed = 0;
  private wheelSpin = 0;

  constructor(racer: RacerDef) {
    this.chassisMat = new THREE.MeshLambertMaterial({ color: racer.color });
    this.accentMat = new THREE.MeshLambertMaterial({ color: racer.accent });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9b48f });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 2.2), this.chassisMat);
    chassis.position.y = 0.45;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 0.6), this.chassisMat);
    nose.position.set(0, 0.4, 1.3);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.3), dark);
    seat.position.set(0, 0.8, -0.55);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.7, 10), this.accentMat);
    torso.position.set(0, 1.0, -0.25);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), skin);
    head.position.set(0, 1.55, -0.2);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.accentMat);
    helmet.position.copy(head.position);
    const wheelBar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 14), dark);
    wheelBar.position.set(0, 1.0, 0.35);
    wheelBar.rotation.x = -0.9;
    this.body.add(chassis, nose, seat, torso, head, helmet, wheelBar);

    for (const side of [-1, 1]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.6, 8), dark);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(side * 0.35, 0.55, -1.25);
      this.body.add(pipe);
    }

    const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.32, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [x, z, front] of [[-0.8, 0.8, true], [0.8, 0.8, true], [-0.8, -0.8, false], [0.8, -0.8, false]] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(x, WHEEL_RADIUS, z);
      const wheel = new THREE.Mesh(wheelGeo, dark);
      wheel.castShadow = true;
      pivot.add(wheel);
      this.root.add(pivot);
      this.wheels.push(wheel);
      if (front) this.frontWheels.push(pivot);
    }

    const sparkGeo = new THREE.IcosahedronGeometry(0.22, 0);
    for (const x of [-0.8, 0.8]) {
      const spark = new THREE.Mesh(sparkGeo, this.sparkMat);
      spark.position.set(x, 0.15, -1.05);
      spark.visible = false;
      this.root.add(spark);
      this.sparks.push(spark);
    }

    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 1.4, 10).rotateX(-Math.PI / 2).translate(0, 0, -0.7),
      new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.flame.position.set(0, 0.55, -1.5);
    this.flame.visible = false;
    this.body.add(this.flame);

    this.body.traverse((o) => (o.castShadow = true));
    this.root.add(this.body);
  }

  setRacer(racer: RacerDef): void {
    this.chassisMat.color.setHex(racer.color);
    this.accentMat.color.setHex(racer.accent);
  }

  /** Kick the suspension, e.g. on landing. */
  impact(strength: number): void {
    this.bounceVel -= clamp(strength, 0, 12) * 0.6;
  }

  /** `s` is an interpolated render snapshot; `frameDt` is real time since the last frame. */
  update(s: KartState, topSpeed: number, frameDt: number, time: number): void {
    this.root.position.set(s.x, s.y, s.z);
    this.root.rotation.y = s.heading - s.slip;

    const speedRatio = clamp(Math.abs(s.speed) / topSpeed, 0, 1.5);
    const accel = frameDt > 0 ? (s.speed - this.lastSpeed) / frameDt : 0;
    this.lastSpeed = s.speed;

    const targetRoll = s.driftDir !== 0 ? s.driftDir * 0.12 : s.steer * 0.07 * speedRatio;
    this.roll += (targetRoll - this.roll) * damp(10, frameDt);
    this.pitch += (clamp(-accel * 0.006, -0.08, 0.08) - this.pitch) * damp(6, frameDt);

    // Damped spring for bounce.
    this.bounceVel += (-120 * this.bounce - 10 * this.bounceVel) * frameDt;
    this.bounce += this.bounceVel * frameDt;
    const rumble = s.surface === 'offroad' && s.grounded && Math.abs(s.speed) > 2 ? Math.sin(time * 55) * 0.03 : 0;

    this.body.position.y = this.bounce * 0.08 + rumble;
    this.body.rotation.set(this.pitch, 0, this.roll);

    this.wheelSpin += (s.speed * frameDt) / WHEEL_RADIUS;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    for (const w of this.frontWheels) w.rotation.y = -s.steer * 0.4;

    const tier = s.driftDir !== 0 ? driftTier(s.driftCharge) : -1;
    const showSparks = tier >= 0 && s.grounded;
    for (const spark of this.sparks) {
      spark.visible = showSparks;
      const scale = (tier <= 0 ? 0.5 : 0.8 + tier * 0.25) * (0.75 + Math.random() * 0.5);
      spark.scale.setScalar(scale);
      spark.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    }
    if (showSparks) this.sparkMat.color.setHex(SPARK_COLORS[tier]);

    this.flame.visible = s.boostTime > 0;
    if (this.flame.visible) {
      const f = 0.8 + Math.random() * 0.5;
      this.flame.scale.set(f, f, f * (1 + Math.min(s.boostTime, 1)));
    }
  }
}
