import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import type { KartState } from '../physics/kart';
import { driftTier } from '../physics/kart';
import type { RacerDef } from '../physics/racers';
import { buildKartModel } from './racerModels';
import { blobShadowTexture, glowTexture } from './textures';

const SPARK_COLORS = [0xfff2a8, 0x3fa9ff, 0xff8a1f, 0xc04bff];
const SPARK_POOL = 48;
const SPARK_LIFE = 0.28;

let sharedGlow: THREE.Texture | null = null;
let sharedShadow: THREE.Texture | null = null;

interface Spark {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
}

/** A racer's own kart and character, with body roll, landing bounce, particle sparks, boost flames and a blob shadow. */
export class KartView {
  readonly root = new THREE.Group();
  /** World-space effects (sparks, shadow) that shouldn't inherit kart rotation. */
  readonly fx = new THREE.Group();
  private readonly body: THREE.Group;
  private readonly frontWheels: THREE.Object3D[] = [];
  private readonly wheels: { mesh: THREE.Object3D; radius: number }[] = [];
  private readonly spinners: THREE.Object3D[];
  private readonly sparks: Spark[] = [];
  private readonly flames: { cone: THREE.Mesh; glow: THREE.Sprite }[] = [];
  private readonly shadow: THREE.Mesh;
  private readonly rearTrack: number;
  private readonly rearZ: number;

  private roll = 0;
  private pitch = 0;
  private bounce = 0;
  private bounceVel = 0;
  private lastSpeed = 0;
  private wheelTravel = 0;
  private sparkCursor = 0;
  private sparkAccum = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(racer: RacerDef) {
    sharedGlow ??= glowTexture();
    sharedShadow ??= blobShadowTexture();
    const model = buildKartModel(racer);
    this.body = model.body;
    this.spinners = model.spinners;
    this.rearTrack = model.rearTrack;
    this.rearZ = model.rearZ;

    const rubber = new THREE.MeshPhongMaterial({ color: 0x1c1c1c, shininess: 12, specular: 0x222222 });
    const hubMat = new THREE.MeshPhongMaterial({ color: 0xcfd6e0, shininess: 120, specular: 0xffffff });
    for (const w of model.wheels) {
      const pivot = new THREE.Group();
      pivot.position.set(w.x, w.radius, w.z);
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(w.radius, w.radius, w.width, 18).rotateZ(Math.PI / 2), w.material ?? rubber);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(w.radius * 0.5, w.radius * 0.5, w.width + 0.02, 10).rotateZ(Math.PI / 2), hubMat);
      // A spoke so the spin reads.
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(w.width + 0.03, w.radius * 1.5, 0.06), hubMat);
      spin.add(tire, hub, spoke);
      pivot.add(spin);
      this.root.add(pivot);
      this.wheels.push({ mesh: spin, radius: w.radius });
      if (w.front) this.frontWheels.push(pivot);
    }

    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const flameGeo = new THREE.ConeGeometry(0.22, 1.2, 12).rotateX(-Math.PI / 2).translate(0, 0, -0.6);
    for (const at of model.exhausts) {
      const cone = new THREE.Mesh(flameGeo, flameMat);
      cone.position.copy(at);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sharedGlow, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.copy(at).add(new THREE.Vector3(0, 0, -0.2));
      this.body.add(cone, glow);
      this.flames.push({ cone, glow });
    }
    this.root.add(this.body);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(model.shadow[0], model.shadow[1]).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: sharedShadow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    this.fx.add(this.shadow);

    for (let k = 0; k < SPARK_POOL; k++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sharedGlow, color: SPARK_COLORS[0], blending: THREE.AdditiveBlending, depthWrite: false }));
      sprite.visible = false;
      this.fx.add(sprite);
      this.sparks.push({ sprite, vel: new THREE.Vector3(), life: 0 });
    }
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
    const airPitch = s.grounded ? 0 : clamp(-s.vy * 0.02, -0.25, 0.25);
    this.pitch += (clamp(-accel * 0.006, -0.08, 0.08) + airPitch - this.pitch) * damp(6, frameDt);

    this.bounceVel += (-120 * this.bounce - 10 * this.bounceVel) * frameDt;
    this.bounce += this.bounceVel * frameDt;
    const rumble = s.surface === 'offroad' && s.grounded && Math.abs(s.speed) > 2 ? Math.sin(time * 55) * 0.03 : 0;
    this.body.position.y = this.bounce * 0.08 + rumble;
    this.body.rotation.set(this.pitch, 0, this.roll);

    this.wheelTravel += s.speed * frameDt;
    for (const w of this.wheels) w.mesh.rotation.x = this.wheelTravel / w.radius;
    for (const w of this.frontWheels) w.rotation.y = -s.steer * 0.4;
    for (const sp of this.spinners) sp.rotation.z += frameDt * (6 + Math.abs(s.speed) * 1.2);

    const boosting = s.boostTime > 0;
    for (const f of this.flames) {
      f.cone.visible = f.glow.visible = boosting;
      if (!boosting) continue;
      const k = 0.8 + Math.random() * 0.5;
      f.cone.scale.set(k, k, k * (1 + Math.min(s.boostTime, 1)));
      f.glow.scale.setScalar(1.6 + Math.random() * 0.8);
    }

    // Blob shadow on the ground, fading with height.
    const height = Math.max(0, s.y - s.groundY);
    this.shadow.visible = s.groundY > -3;
    this.shadow.position.set(s.x, s.groundY + 0.03, s.z);
    this.shadow.rotation.y = this.root.rotation.y;
    const shrink = clamp(1 - height * 0.08, 0.4, 1);
    this.shadow.scale.setScalar(shrink);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = shrink;

    this.updateSparks(s, frameDt);
  }

  private updateSparks(s: KartState, dt: number): void {
    const tier = s.driftDir !== 0 && s.grounded ? driftTier(s.driftCharge) : -1;
    if (tier >= 0) {
      this.sparkAccum += dt * (tier === 0 ? 40 : 90);
      while (this.sparkAccum >= 1) {
        this.sparkAccum -= 1;
        this.emitSpark(s, SPARK_COLORS[tier], tier);
      }
    } else {
      this.sparkAccum = 0;
    }
    for (const p of this.sparks) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.vel.y -= 18 * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      const k = p.life / SPARK_LIFE;
      p.sprite.material.opacity = k;
      p.sprite.scale.setScalar(0.25 + 0.45 * k);
    }
  }

  private emitSpark(s: KartState, color: number, tier: number): void {
    const p = this.sparks[this.sparkCursor];
    this.sparkCursor = (this.sparkCursor + 1) % SPARK_POOL;
    const yaw = this.root.rotation.y;
    const side = Math.random() < 0.5 ? -this.rearTrack : this.rearTrack;
    // Rear wheel contact point in world space.
    this.tmp.set(side, 0.1, this.rearZ).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(this.root.position);
    p.sprite.position.copy(this.tmp);
    const back = -(4 + Math.random() * 4);
    const spread = (Math.random() - 0.5) * 5;
    p.vel.set(Math.sin(yaw) * back + Math.cos(yaw) * spread, 2 + Math.random() * (2 + tier), Math.cos(yaw) * back - Math.sin(yaw) * spread);
    p.vel.x += Math.sin(s.heading) * s.speed * 0.6;
    p.vel.z += Math.cos(s.heading) * s.speed * 0.6;
    p.sprite.material.color.setHex(color);
    p.sprite.visible = true;
    p.life = SPARK_LIFE * (0.6 + Math.random() * 0.4);
  }
}
