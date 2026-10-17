import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import type { KartState } from '../physics/kart';
import { driftTier } from '../physics/kart';
import type { RacerDef } from '../physics/racers';
import { blobShadowTexture, glowTexture, skyEnvMap } from './textures';

const SPARK_COLORS = [0xfff2a8, 0x3fa9ff, 0xff8a1f, 0xc04bff];
const WHEEL_RADIUS = 0.38;
const SPARK_POOL = 48;
const SPARK_LIFE = 0.28;

let sharedEnv: THREE.CubeTexture | null = null;
let sharedGlow: THREE.Texture | null = null;
let sharedShadow: THREE.Texture | null = null;

interface Spark {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
}

/** Glossy kart with body roll, landing bounce, particle sparks, boost flame and blob shadow. */
export class KartView {
  readonly root = new THREE.Group();
  /** World-space effects (sparks, shadow) that shouldn't inherit kart rotation. */
  readonly fx = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly frontWheels: THREE.Object3D[] = [];
  private readonly wheels: THREE.Mesh[] = [];
  private readonly sparks: Spark[] = [];
  private readonly flame: THREE.Mesh;
  private readonly flameGlow: THREE.Sprite;
  private readonly shadow: THREE.Mesh;
  private readonly paint: THREE.MeshPhongMaterial;
  private readonly accent: THREE.MeshPhongMaterial;

  private roll = 0;
  private pitch = 0;
  private bounce = 0;
  private bounceVel = 0;
  private lastSpeed = 0;
  private wheelSpin = 0;
  private sparkCursor = 0;
  private sparkAccum = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(racer: RacerDef) {
    sharedEnv ??= skyEnvMap();
    sharedGlow ??= glowTexture();
    sharedShadow ??= blobShadowTexture();

    const gloss = (color: number) =>
      new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x666666, envMap: sharedEnv, reflectivity: 0.28, combine: THREE.MixOperation });
    this.paint = gloss(racer.color);
    this.accent = gloss(racer.accent);
    const chrome = new THREE.MeshPhongMaterial({ color: 0xcfd6e0, shininess: 120, specular: 0xffffff, envMap: sharedEnv, reflectivity: 0.7, combine: THREE.MixOperation });
    const rubber = new THREE.MeshPhongMaterial({ color: 0x1c1c1c, shininess: 12, specular: 0x222222 });
    const seatMat = new THREE.MeshPhongMaterial({ color: 0x2a2a2a, shininess: 40 });
    const skin = new THREE.MeshPhongMaterial({ color: 0xd9b48f, shininess: 20 });

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      this.body.add(m);
      return m;
    };
    // Tub, nose cone, side pods, rear wing.
    add(new THREE.BoxGeometry(1.3, 0.32, 2.0), this.paint, 0, 0.45, 0);
    const nose = add(new THREE.CylinderGeometry(0.25, 0.55, 1.0, 12), this.paint, 0, 0.42, 1.35);
    nose.rotation.x = Math.PI / 2;
    nose.scale.set(1.6, 1, 0.55);
    add(new THREE.BoxGeometry(1.7, 0.12, 0.35), this.accent, 0, 0.3, 1.75);
    for (const side of [-1, 1]) {
      const pod = add(new THREE.CapsuleGeometry(0.22, 1.0, 6, 12), this.accent, side * 0.82, 0.42, -0.1);
      pod.rotation.x = Math.PI / 2;
    }
    add(new THREE.BoxGeometry(1.5, 0.08, 0.4), this.accent, 0, 1.0, -1.15);
    for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.45, 0.35), this.accent, side * 0.7, 0.78, -1.15);
    add(new THREE.BoxGeometry(0.8, 0.55, 0.28), seatMat, 0, 0.82, -0.55);
    for (const side of [-1, 1]) {
      const pipe = add(new THREE.CylinderGeometry(0.09, 0.13, 0.6, 10), chrome, side * 0.35, 0.55, -1.25);
      pipe.rotation.x = Math.PI / 2;
    }
    // Driver.
    add(new THREE.CylinderGeometry(0.3, 0.36, 0.7, 12), this.accent, 0, 1.0, -0.25);
    add(new THREE.SphereGeometry(0.3, 16, 12), skin, 0, 1.55, -0.2);
    add(new THREE.SphereGeometry(0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.8), this.paint, 0, 1.56, -0.22);
    const visor = add(new THREE.SphereGeometry(0.31, 16, 8, -0.9, 1.8, 1.1, 0.5), chrome, 0, 1.55, -0.18);
    visor.rotation.y = 0;
    const wheelBar = add(new THREE.TorusGeometry(0.22, 0.04, 8, 18), rubber, 0, 1.0, 0.35);
    wheelBar.rotation.x = -0.9;

    const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.34, 18);
    wheelGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.36, 10);
    hubGeo.rotateZ(Math.PI / 2);
    for (const [x, z, front] of [[-0.82, 0.85, true], [0.82, 0.85, true], [-0.82, -0.85, false], [0.82, -0.85, false]] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(x, WHEEL_RADIUS, z);
      const wheel = new THREE.Mesh(wheelGeo, rubber);
      wheel.add(new THREE.Mesh(hubGeo, chrome));
      pivot.add(wheel);
      this.root.add(pivot);
      this.wheels.push(wheel);
      if (front) this.frontWheels.push(pivot);
    }

    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 1.4, 12).rotateX(-Math.PI / 2).translate(0, 0, -0.7),
      new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.flame.position.set(0, 0.55, -1.5);
    this.body.add(this.flame);
    this.flameGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sharedGlow, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flameGlow.position.set(0, 0.55, -1.7);
    this.flameGlow.scale.setScalar(2.2);
    this.body.add(this.flameGlow);
    this.root.add(this.body);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 3.2).rotateX(-Math.PI / 2),
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

  setRacer(racer: RacerDef): void {
    this.paint.color.setHex(racer.color);
    this.accent.color.setHex(racer.accent);
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

    this.wheelSpin += (s.speed * frameDt) / WHEEL_RADIUS;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    for (const w of this.frontWheels) w.rotation.y = -s.steer * 0.4;

    const boosting = s.boostTime > 0;
    this.flame.visible = this.flameGlow.visible = boosting;
    if (boosting) {
      const f = 0.8 + Math.random() * 0.5;
      this.flame.scale.set(f, f, f * (1 + Math.min(s.boostTime, 1)));
      this.flameGlow.scale.setScalar(1.8 + Math.random() * 0.8);
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
    const side = Math.random() < 0.5 ? -0.82 : 0.82;
    // Rear wheel contact point in world space.
    this.tmp.set(side, 0.1, -0.95).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(this.root.position);
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
