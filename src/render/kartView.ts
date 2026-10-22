import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import type { KartState } from '../physics/kart';
import { driftTier } from '../physics/kart';
import type { RacerDef } from '../physics/racers';
import { buildKartModel, buildWooCannon, type WooCannonModel } from './racerModels';
import { NonagonGate } from './nonagonGate';
import { blobShadowTexture, glowTexture } from './textures';

const SPARK_COLORS = [0xfff2a8, 0x3fa9ff, 0xff8a1f, 0xc04bff, 0xffffff];
/** The most the drawn nose may point off the direction of travel (rad): sideways enough to read as a drift, never a right angle. */
const NOSE_MAX = 0.6;
const SPARK_POOL = 48;
const SPARK_LIFE = 0.28;
const DUST_POOL = 28;
const DUST_LIFE = 0.75;
const HIT_TIME = 0.35;
const TRICK_TIME = 0.55;
/** Below this height a kart has gone over the edge: it dissolves until the gate brings it back. */
const STAR_COLORS = [0xff5a7a, 0xffa64a, 0xffe45a, 0x6aef7a, 0x4ad0ff, 0xc86aff];
const TAU = Math.PI * 2;
const SKID_MARKS = 160;
const SKID_LIFE = 5;

/** A trick's pose at progress u (0..1, eased): body pitch, yaw, roll (radians) and lift (m). `dir` is ±1, picked per trick. */
type TrickMove = (u: number, dir: number) => [number, number, number, number];

/** Every racer has their own trick. */
const TRICKS: Record<string, TrickMove> = {
  // A corkscrew: a roll and a turn at once.
  'lizard-warlock': (u, d) => [0, d * u * TAU, d * u * TAU, Math.sin(u * Math.PI) * 0.8],
  // Heavy machinery: a slow tabletop, flat out sideways and back.
  'cyborg-gourmand': (u, d) => [0, d * Math.sin(u * Math.PI) * 0.9, d * Math.sin(u * Math.PI) * 1.3, Math.sin(u * Math.PI) * 0.5],
  // A barrel roll.
  'gila-rider': (u, d) => [0, 0, d * u * TAU, Math.sin(u * Math.PI) * 0.6],
  // Two barrel rolls, the broom way.
  'swamp-witch': (u, d) => [0, 0, d * u * TAU * 2, Math.sin(u * Math.PI) * 0.9],
  // Levitates and turns twice, serenely.
  'microtonal-monk': (u, d) => [0, d * u * TAU * 2, 0, Math.sin(u * Math.PI) * 1.6],
  // A backflip; the heaviest kart barely makes it round.
  'fuzz-golem': (u) => [-u * TAU, 0, 0, Math.sin(u * Math.PI) * 0.9],
  // A flat spin, wings fluttering (a quick wobble on top).
  'neon-moth': (u, d) => [Math.sin(u * Math.PI * 6) * 0.15, d * u * TAU, Math.sin(u * Math.PI * 6) * 0.2, Math.sin(u * Math.PI) * 0.7],
  // A front flip.
  'cosmic-coyote': (u) => [u * TAU, 0, 0, Math.sin(u * Math.PI) * 0.9],
  // A wheelie spin: the hoop rears up and pirouettes on its edge.
  'mantis-shredder': (u, d) => [-Math.sin(u * Math.PI) * 0.6, d * u * TAU, 0, Math.sin(u * Math.PI) * 1.0],
  // A drum roll: one slow turn bounced out in triplets.
  'gator-drummer': (u, d) => [0, d * u * TAU, 0, Math.abs(Math.sin(u * Math.PI * 3)) * 0.6],
  // A spinning top: three turns with a wobble that dies away.
  'mushroom-sage': (u, d) => {
    const wob = Math.sin(u * Math.PI) * 0.25;
    return [Math.sin(u * TAU * 3) * wob, d * u * TAU * 3, Math.cos(u * TAU * 3) * wob, Math.sin(u * Math.PI) * 1.4];
  },
  // A twisting backflip, arms everywhere.
  'octo-organist': (u, d) => [-u * TAU, 0, d * u * TAU, Math.sin(u * Math.PI) * 1.0],
  // Chasing its tail: two quick turns with a happy bounce.
  'arlo': (u, d) => [0, d * u * TAU * 2, 0, Math.abs(Math.sin(u * Math.PI * 2)) * 0.8],
  // The band. A stage dive, all the way round.
  'stu-mackenzie': (u, d) => [-u * TAU, d * u * TAU, 0, Math.sin(u * Math.PI) * 1.1],
  // A harmonica blast that spins him like a top.
  'ambrose-kenny-smith': (u, d) => [0, d * u * TAU * 2, Math.sin(u * Math.PI * 4) * 0.2, Math.sin(u * Math.PI) * 0.9],
  // Stomping on the pedal: a hop and a heel-kick roll.
  'cook-craig': (u, d) => [0, 0, d * u * TAU, Math.sin(u * Math.PI) * 0.8],
  // A synth sweep: a slow flat spin with a wobble.
  'joey-walker': (u, d) => [Math.sin(u * Math.PI * 3) * 0.15, d * u * TAU, 0, Math.sin(u * Math.PI) * 0.8],
  // The heaviest cab on the grid: a solid backflip.
  'lucas-harwood': (u) => [-u * TAU, 0, 0, Math.sin(u * Math.PI) * 0.9],
  // A light show: a backflip with two spins in it, beams everywhere.
  'jason-galea': (u, d) => [-u * TAU, d * u * TAU * 2, 0, Math.sin(u * Math.PI) * 1.1],
  // A drum roll: a front flip bounced on the rimshots.
  'michael-cavanagh': (u) => [u * TAU, 0, 0, Math.sin(u * Math.PI) * 0.9 + Math.abs(Math.sin(u * Math.PI * 4)) * 0.15],
};
const DEFAULT_TRICK: TrickMove = TRICKS['gila-rider'];

/** Dust takes the color of the ground; set per track theme. */
let dustColor = 0xd8a878;
export function setDustColor(color: number): void {
  dustColor = color;
}

let sharedGlow: THREE.Texture | null = null;
let sharedShadow: THREE.Texture | null = null;

interface Spark {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
}

/**
 * A racer's own kart and character, with body roll, landing bounce,
 * particle sparks, boost flames and a blob shadow; a jolt on collisions,
 * a barrel roll for tricks, and a Nonagon gate to come back through after
 * a fall.
 */
export class KartView {
  readonly root = new THREE.Group();
  /** Real sun shadows are on (render/detail.ts): the karts cast them and the blob shadow stays off. */
  static realShadows = false;
  /** World-space effects (sparks, shadow) that shouldn't inherit kart rotation. */
  readonly fx = new THREE.Group();
  private readonly body: THREE.Group;
  private readonly frontWheels: THREE.Object3D[] = [];
  private readonly pivots: THREE.Object3D[] = [];
  /** The Woo Cannon shell, built the first time it's needed. */
  private cannon: WooCannonModel | null = null;
  private wasCannon = false;
  private readonly racer: RacerDef;
  private readonly wheels: { mesh: THREE.Object3D; radius: number }[] = [];
  private readonly spinners: THREE.Object3D[];
  private readonly rotors: THREE.Object3D[];
  private readonly hover: { bob: number; pads: THREE.Object3D[] } | null;
  private readonly head: THREE.Object3D | null;
  private readonly treads: { map: THREE.Texture; perMeter: number }[];
  private readonly flappers: THREE.Object3D[];
  private readonly sweepers: THREE.Object3D[];
  private readonly sparks: Spark[] = [];
  private readonly dust: Spark[] = [];
  private dustCursor = 0;
  private dustAccum = 0;
  private readonly flames: { cone: THREE.Mesh; glow: THREE.Sprite }[] = [];
  private readonly shadow: THREE.Mesh;
  private readonly rearTrack: number;
  private readonly rearZ: number;

  /** Offsets idle motion so a grid of the same racer doesn't bob in step. */
  private readonly phase = Math.random() * Math.PI * 2;
  private roll = 0;
  private pitch = 0;
  private bounce = 0;
  private bounceVel = 0;
  private lastSpeed = 0;
  private wheelTravel = 0;
  private sparkCursor = 0;
  private sparkAccum = 0;
  private readonly tmp = new THREE.Vector3();
  /** Collision jolt: time left and how hard, and which way it came from (world). */
  private hitTime = 0;
  private hitStrength = 0;
  private hitSide = 0;
  /** Trick roll: time since it started (TRICK_TIME = done) and which way it rolls. */
  private trickTime = TRICK_TIME;
  private trickDir = 1;
  private wasTrick = false;
  /** 0 gone .. 1 here: dissolves on a fall, grows back out of the gate. */
  private presence = 1;
  private vanished = false;
  readonly gate = new NonagonGate();
  private readonly trickMove: TrickMove;
  /** Drift lean and shimmy, eased in and out. */
  private driftLean = 0;
  private smokeAccum = 0;
  private wasDrifting = false;
  /** Skid: the nose swung into a slide, and the marks it leaves. */
  private skidYaw = 0;
  /** The yaw the model is drawn at, off its heading: the drift slip and the skid, capped against the direction it's actually travelling (NOSE_MAX). */
  private noseYaw = 0;
  private readonly marks: THREE.InstancedMesh;
  private readonly markAge = new Float32Array(SKID_MARKS).fill(SKID_LIFE);
  private readonly markPose: { x: number; y: number; z: number; yaw: number }[] = [];
  private markCursor = 0;
  private markAccum = 0;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();

  constructor(racer: RacerDef) {
    sharedGlow ??= glowTexture();
    sharedShadow ??= blobShadowTexture();
    this.racer = racer;
    const model = buildKartModel(racer);
    this.trickMove = TRICKS[racer.id] ?? DEFAULT_TRICK;
    this.body = model.body;
    this.spinners = model.spinners;
    this.rotors = model.rotors ?? [];
    this.hover = model.hover ?? null;
    this.head = model.head ?? null;
    this.treads = model.treads ?? [];
    this.flappers = model.flappers ?? [];
    this.sweepers = model.sweepers ?? [];
    this.rearTrack = model.rearTrack;
    this.rearZ = model.rearZ;

    const rubber = new THREE.MeshPhongMaterial({ color: 0x1c1c1c, shininess: 12, specular: 0x222222 });
    const hubMat = new THREE.MeshPhongMaterial({ color: 0xcfd6e0, shininess: 120, specular: 0xffffff });
    for (const w of model.wheels) {
      const pivot = new THREE.Group();
      pivot.position.set(w.x, w.radius, w.z);
      const spin = new THREE.Group();
      if (w.ring) {
        // A hoop the rider sits inside, with thin spokes to an empty middle.
        const tube = w.width / 2;
        spin.add(new THREE.Mesh(new THREE.TorusGeometry(w.radius - tube, tube, 10, 40).rotateY(Math.PI / 2), w.material ?? rubber));
        spin.add(new THREE.Mesh(new THREE.TorusGeometry(w.radius - tube * 2.2, tube * 0.35, 6, 40).rotateY(Math.PI / 2), hubMat));
      } else {
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(w.radius, w.radius, w.width, 36).rotateZ(Math.PI / 2), w.material ?? rubber);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(w.radius * 0.5, w.radius * 0.5, w.width + 0.02, 20).rotateZ(Math.PI / 2), hubMat);
        // Tread blocks round the tire and a spoke, so the spin reads.
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(w.width + 0.03, w.radius * 1.5, 0.06), hubMat);
        const lug = new THREE.BoxGeometry(w.width * 0.92, 0.035, w.radius * 0.18);
        const lugMat = w.material ?? rubber;
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          const m = new THREE.Mesh(lug, lugMat);
          m.position.set(0, Math.cos(a) * w.radius, Math.sin(a) * w.radius);
          m.rotation.x = -a;
          spin.add(m);
        }
        const nut = new THREE.Mesh(new THREE.CylinderGeometry(w.radius * 0.14, w.radius * 0.14, w.width + 0.06, 6).rotateZ(Math.PI / 2), hubMat);
        spin.add(tire, hub, spoke, nut);
      }
      pivot.add(spin);
      this.root.add(pivot);
      this.pivots.push(pivot);
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
    // The kart casts a sun shadow (drawn only while the renderer's shadow map is on).
    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(model.shadow[0], model.shadow[1]).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: sharedShadow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    this.fx.add(this.shadow, this.gate.group);
    this.marks = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.28, 0.7).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x141018, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
      SKID_MARKS,
    );
    this.marks.frustumCulled = false;
    for (let k = 0; k < SKID_MARKS; k++) {
      this.markPose.push({ x: 0, y: 0, z: 0, yaw: 0 });
      this.marks.setMatrixAt(k, this.m4.makeScale(0, 0, 0));
    }
    this.fx.add(this.marks);

    for (let k = 0; k < SPARK_POOL; k++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sharedGlow, color: SPARK_COLORS[0], blending: THREE.AdditiveBlending, depthWrite: false }));
      sprite.visible = false;
      this.fx.add(sprite);
      this.sparks.push({ sprite, vel: new THREE.Vector3(), life: 0 });
    }
    for (let k = 0; k < DUST_POOL; k++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sharedGlow, color: dustColor, transparent: true, depthWrite: false }));
      sprite.visible = false;
      this.fx.add(sprite);
      this.dust.push({ sprite, vel: new THREE.Vector3(), life: 0 });
    }
  }

  /** Kick the suspension, e.g. on landing; a hard one throws up dust. */
  impact(strength: number): void {
    this.bounceVel -= clamp(strength, 0, 12) * 0.6;
    for (let i = 0; i < Math.min(10, strength); i++) this.emitDust(0, (Math.random() - 0.5) * 7, 1 + Math.random() * 2);
  }

  /**
   * A knock from a wall or another kart. `dirX/dirZ` (world) points from
   * the kart toward what it hit, if known: sparks fly from that side.
   */
  collide(strength: number, dirX = 0, dirZ = 0): void {
    if (strength < this.hitStrength && this.hitTime > HIT_TIME * 0.5) return;
    this.hitTime = HIT_TIME;
    this.hitStrength = Math.min(1.5, strength);
    const yaw = this.root.rotation.y;
    // Which side, in the kart's frame: +1 right, -1 left, 0 dead ahead.
    const right = dirX * -Math.cos(yaw) + dirZ * Math.sin(yaw);
    this.hitSide = Math.abs(right) > 0.3 ? Math.sign(right) : 0;
    const n = Math.round(4 + strength * 8);
    for (let i = 0; i < n; i++) this.emitHitSpark(dirX, dirZ);
  }

  /** Back on the road after a fall: the gate opens just behind the kart and it grows out of it. */
  restore(s: KartState): void {
    this.gate.open(s.x - Math.sin(s.heading) * 1.2, s.groundY, s.z - Math.cos(s.heading) * 1.2, s.heading);
    this.presence = 0;
    this.vanished = false;
  }

  /** `s` is an interpolated render snapshot; `frameDt` is real time since the last frame; `fell` is the race's call that it's gone over an edge. */
  update(s: KartState, topSpeed: number, frameDt: number, time: number, fell = false): void {
    this.root.position.set(s.x, s.y, s.z);
    this.updateSkid(s, topSpeed, frameDt, time);
    this.root.rotation.y = s.heading - this.noseYaw + s.spinAngle;
    // Horology shrinks you a little while it lasts.
    this.body.scale.setScalar(s.slowTime > 0 ? 0.8 : 1);
    this.updatePresence(fell, frameDt, time);
    this.animateCannon(s, frameDt, time);

    const speedRatio = clamp(Math.abs(s.speed) / topSpeed, 0, 1.5);
    const accel = frameDt > 0 ? (s.speed - this.lastSpeed) / frameDt : 0;
    this.lastSpeed = s.speed;

    const wobbleRoll = s.wobbleTime > 0 ? Math.sin(time * 18) * 0.18 : 0;
    const targetRoll = (s.driftDir !== 0 ? s.driftDir * 0.12 : s.steer * 0.07 * speedRatio) + wobbleRoll;
    this.roll += (targetRoll - this.roll) * damp(10, frameDt);
    const airPitch = s.grounded ? 0 : clamp(-s.vy * 0.02, -0.25, 0.25);
    this.pitch += (clamp(-accel * 0.006, -0.08, 0.08) + airPitch - this.pitch) * damp(6, frameDt);

    // The suspension spring in small steps: one long frame (a hitch) would otherwise fling it off.
    for (let left = Math.min(frameDt, 0.25); left > 0; left -= 1 / 120) {
      const h = Math.min(left, 1 / 120);
      this.bounceVel += (-120 * this.bounce - 10 * this.bounceVel) * h;
      this.bounce += this.bounceVel * h;
    }
    // Flyers float over rough ground; they bank harder instead.
    const rumble = !this.hover && s.surface === 'offroad' && s.grounded && Math.abs(s.speed) > 2 ? Math.sin(time * 55) * 0.03 : 0;
    const bob = this.hover ? Math.sin(time * 3.1 + this.phase) * this.hover.bob : 0;
    this.body.position.set(0, this.bounce * 0.08 + rumble + bob, 0);
    this.body.rotation.set(this.pitch, 0, this.roll * (this.hover ? 1.8 : 1));
    this.animateDrift(s, frameDt, time);
    // Skidding: the body heels over toward the outside of the turn.
    this.body.rotation.z += -this.skidYaw * 0.35;
    this.animateHit(frameDt, time);
    this.animateTrick(s, frameDt);

    this.wheelTravel += s.speed * frameDt;
    for (const w of this.wheels) w.mesh.rotation.x = this.wheelTravel / w.radius;
    for (const w of this.frontWheels) w.rotation.y = -s.steer * 0.4;
    for (const sp of this.spinners) sp.rotation.z += frameDt * (6 + Math.abs(s.speed) * 1.2);
    for (const r of this.rotors) r.rotation.y += frameDt * (14 + Math.abs(s.speed) * 0.6);
    for (const t of this.treads) t.map.offset.y = -this.wheelTravel * t.perMeter;
    if (this.hover) {
      const pulse = 1 + Math.sin(time * 9 + this.phase) * 0.12 + speedRatio * 0.25;
      for (const p of this.hover.pads) p.scale.setScalar(pulse);
    }
    // Wings beat lazily at rest and hard under boost.
    const beat = Math.sin(time * (s.boostTime > 0 ? 22 : 7 + speedRatio * 6) + this.phase);
    for (const f of this.flappers) f.rotation.z = (f.userData.side as number) * (0.12 + beat * 0.3);
    // Moving heads sweep their beams, faster under boost.
    for (const w of this.sweepers) w.rotation.y = Math.sin(time * (s.boostTime > 0 ? 4 : 1.4) + (w.userData.phase as number)) * 0.9;
    if (this.head) {
      // Lean into the turn and look along it; tucked back under boost.
      this.head.rotation.set(s.boostTime > 0 ? -0.18 : 0, -s.steer * 0.35 - s.driftDir * 0.15, this.roll * 1.6);
    }

    // The flames point back at the camera: they stand down while a trick plays, so it can be seen, and burn small in the air.
    const boosting = s.boostTime > 0 && this.trickTime >= TRICK_TIME;
    const air = s.grounded ? 1 : 0.5;
    for (const f of this.flames) {
      f.cone.visible = f.glow.visible = boosting;
      if (!boosting) continue;
      const k = (0.8 + Math.random() * 0.5) * air;
      f.cone.scale.set(k, k, k * (1 + Math.min(s.boostTime, 1)));
      f.glow.scale.setScalar((1.6 + Math.random() * 0.8) * air);
    }

    // Blob shadow on the ground, fading with height.
    const height = Math.max(0, s.y - s.groundY);
    this.shadow.visible = !KartView.realShadows && s.groundY > -3 && this.presence > 0.05;
    this.shadow.position.set(s.x, s.groundY + 0.03, s.z);
    this.shadow.rotation.y = this.root.rotation.y;
    const shrink = clamp(1 - height * 0.08, 0.4, 1);
    this.shadow.scale.setScalar(shrink);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = shrink;

    this.updateSparks(s, frameDt);
    this.updateDust(s, speedRatio, frameDt);
  }

  /** In the Woo Cannon: the vehicle is swapped for the shell, which wobbles, spins its fins and trails stars. */
  private animateCannon(s: KartState, dt: number, time: number): void {
    const on = s.cannonTime > 0;
    if (on !== this.wasCannon) {
      if (on && !this.cannon) {
        this.cannon = buildWooCannon(this.racer);
        this.root.add(this.cannon.group);
      }
      // In or out with a pop.
      for (let i = 0; i < 16; i++) this.emitStar(1);
      this.bounceVel += 3;
      this.wasCannon = on;
      this.body.visible = !on;
      for (const p of this.pivots) p.visible = !on;
      if (this.cannon) this.cannon.group.visible = on;
    }
    if (!on || !this.cannon) return;
    const c = this.cannon;
    c.fins.rotation.z += dt * 7;
    c.group.rotation.set(-0.06 + Math.sin(time * 7) * 0.03, 0, Math.sin(time * 9) * 0.06);
    const k = 0.85 + Math.random() * 0.4;
    c.flame.scale.set(k, k, k * 1.3);
    if (Math.random() < dt * 30) this.emitStar(0.4);
  }

  /** Over the edge: shrink away in a puff of stars. Through the gate: grow back, with a little overshoot. */
  private updatePresence(fell: boolean, dt: number, time: number): void {
    this.gate.update(dt, time);
    // Only the race knows a fall from a jump down into a cut or a dive under water, which hold you.
    if (fell && !this.gate.active) {
      if (!this.vanished) {
        this.vanished = true;
        for (let i = 0; i < 14; i++) this.emitStar(0.5);
      }
      this.presence = Math.max(0, this.presence - dt * 5);
    } else if (this.gate.active) {
      const e = this.gate.emerged;
      this.presence = e < 1 ? e * (1 + 0.25 * Math.sin(e * Math.PI)) : 1;
    } else {
      this.presence = Math.min(1, this.presence + dt * 4);
    }
    this.root.visible = this.presence > 0.01;
    this.root.scale.setScalar(Math.max(0.01, this.presence));
  }

  /** A jolt away from the hit: a quick shimmy and a squash on the struck side. */
  private animateHit(dt: number, time: number): void {
    if (this.hitTime <= 0) return;
    this.hitTime = Math.max(0, this.hitTime - dt);
    const k = (this.hitTime / HIT_TIME) * this.hitStrength;
    this.body.rotation.y += Math.sin(time * 70) * 0.09 * k;
    this.body.rotation.z += -this.hitSide * 0.22 * k;
    this.body.position.x = -this.hitSide * 0.15 * k;
    this.body.scale.x *= 1 - 0.12 * k * (this.hitSide !== 0 ? 1 : 0);
    this.body.scale.z *= 1 - 0.12 * k * (this.hitSide === 0 ? 1 : 0);
  }

  /**
   * Drifting: the kart hops into it, leans hard into the turn with a
   * shimmy that quickens as the charge builds, and smokes from the rear.
   */
  private animateDrift(s: KartState, dt: number, time: number): void {
    const drifting = s.driftDir !== 0 && s.grounded;
    if (drifting && !this.wasDrifting) this.bounceVel += 2.5;
    this.wasDrifting = drifting;
    const tier = drifting ? driftTier(s.driftCharge) : 0;
    this.driftLean += ((drifting ? s.driftDir : 0) - this.driftLean) * damp(8, dt);
    const shake = drifting ? Math.sin(time * (34 + tier * 10)) * (0.015 + tier * 0.01) : 0;
    this.body.rotation.z += this.driftLean * 0.1 + shake;
    this.body.rotation.y += this.driftLean * 0.08;
    if (!drifting || Math.abs(s.speed) < 8) {
      this.smokeAccum = 0;
      return;
    }
    // Tire smoke off the outside rear wheel, thicker at higher tiers; a flyer's downwash kicks up the ground instead.
    this.smokeAccum += dt * (14 + tier * 8) * (this.hover ? 0.5 : 1);
    while (this.smokeAccum >= 1) {
      this.smokeAccum -= 1;
      this.emitDust(-s.driftDir * this.rearTrack, (Math.random() - 0.5) * 1.5, 0.4 + Math.random() * 0.6, s, this.hover ? dustColor : 0xeeeeee);
    }
  }

  /** A trick in the air, the racer's own, with a trail of rainbow stars. */
  private animateTrick(s: KartState, dt: number): void {
    if (s.trick && !this.wasTrick && !s.grounded) {
      this.trickTime = 0;
      this.trickDir = Math.random() < 0.5 ? -1 : 1;
      for (let i = 0; i < 10; i++) this.emitStar(1);
    }
    this.wasTrick = s.trick;
    if (this.trickTime >= TRICK_TIME) return;
    this.trickTime = Math.min(TRICK_TIME, this.trickTime + dt);
    const u = this.trickTime / TRICK_TIME;
    const ease = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    const [rx, ry, rz, lift] = this.trickMove(ease, this.trickDir);
    this.body.rotation.x += rx;
    this.body.rotation.y += ry;
    this.body.rotation.z += rz;
    this.body.position.y += lift;
    if (Math.random() < 0.6) this.emitStar(0.6);
  }

  private emitHitSpark(dirX: number, dirZ: number): void {
    const p = this.sparks[this.sparkCursor];
    this.sparkCursor = (this.sparkCursor + 1) % SPARK_POOL;
    const len = Math.hypot(dirX, dirZ);
    const yaw = this.root.rotation.y;
    // Toward what was hit; a wall knock with no direction sparks off the nose.
    const fx = len > 0 ? dirX / len : Math.sin(yaw);
    const fz = len > 0 ? dirZ / len : Math.cos(yaw);
    p.sprite.position.set(this.root.position.x + fx * 1.1, this.root.position.y + 0.5, this.root.position.z + fz * 1.1);
    const sp = 4 + Math.random() * 6;
    p.vel.set(-fz * (Math.random() - 0.5) * 8 + fx * sp * 0.3, 2 + Math.random() * 4, fx * (Math.random() - 0.5) * 8 + fz * sp * 0.3);
    p.sprite.material.color.setHex(Math.random() < 0.5 ? 0xffffff : 0xffd23a);
    p.sprite.visible = true;
    p.life = SPARK_LIFE * (0.8 + Math.random() * 0.6);
  }

  /** A rainbow star off the kart, `force` how far it flies. */
  private emitStar(force: number): void {
    const p = this.sparks[this.sparkCursor];
    this.sparkCursor = (this.sparkCursor + 1) % SPARK_POOL;
    p.sprite.position.copy(this.root.position).add(this.tmp.set((Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5));
    const a = Math.random() * Math.PI * 2;
    const sp = (2 + Math.random() * 4) * force;
    p.vel.set(Math.cos(a) * sp, (3 + Math.random() * 3) * force, Math.sin(a) * sp);
    p.sprite.material.color.setHex(STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)]);
    p.sprite.visible = true;
    p.life = SPARK_LIFE * 2;
  }

  /**
   * Skidding: how fast the kart is sliding sideways (its momentum carrying
   * on through a turn) swings the nose into the slide, smokes the tires when
   * it's big, and leaves marks on the road.
   */
  private updateSkid(s: KartState, topSpeed: number, dt: number, time: number): void {
    const rx = -Math.cos(s.heading);
    const rz = Math.sin(s.heading);
    const side = s.grounded ? s.extX * rx + s.extZ * rz : 0;
    // How hard it's skidding, 0..1: from the slide itself, or from cornering hard at speed.
    const fast = s.grounded && Math.abs(s.speed) > 8 && s.driftDir === 0 && s.spinTime === 0;
    const cornering = fast ? clamp((Math.abs(s.steer) * Math.abs(s.speed) / topSpeed - 0.55) / 0.4, 0, 1) : 0;
    const k = Math.max(cornering, fast ? clamp(Math.abs(side) / 2.5, 0, 1) : 0);
    // The tail steps out: the nose swings into the turn (a right turn turns it further right, like the drift slip),
    // with a shimmy as the tires fight for grip.
    const into = side !== 0 && Math.abs(side) > 0.3 ? Math.sign(side) : -Math.sign(s.steer);
    const target = into * 0.16 * k + Math.sin(time * 38) * 0.02 * k;
    this.skidYaw += (target - this.skidYaw) * damp(12, dt);
    // The nose points into a drift and a skid, but never near a right angle to the way the kart is going:
    // the slide already carries the travel off the heading, so the drawn yaw is capped against that.
    const travel = Math.atan2(side, Math.max(1, Math.abs(s.speed)));
    const want = s.slip - this.skidYaw;
    const room = Math.max(0, NOSE_MAX - Math.abs(travel));
    this.noseYaw = clamp(want, -room, room);
    // Nothing to mark the road with when nothing touches it.
    const skidding = !this.hover && s.grounded && s.surface !== 'offroad' && (k > 0.3 || s.driftDir !== 0) && Math.abs(s.speed) > 8;
    if (skidding) {
      this.markAccum += dt * Math.abs(s.speed) * 0.9;
      while (this.markAccum >= 1) {
        this.markAccum -= 1;
        const yaw = s.heading - this.noseYaw;
        for (const lat of [-this.rearTrack, this.rearTrack]) {
          this.tmp.set(lat, 0, this.rearZ).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
          const m = this.markPose[this.markCursor];
          m.x = s.x + this.tmp.x;
          m.z = s.z + this.tmp.z;
          m.y = s.groundY + 0.04;
          m.yaw = Math.atan2(s.extX + Math.sin(s.heading) * s.speed, s.extZ + Math.cos(s.heading) * s.speed);
          this.markAge[this.markCursor] = 0;
          this.markCursor = (this.markCursor + 1) % SKID_MARKS;
        }
      }
      if (k > 0.55 && Math.random() < dt * 24 * k) this.emitDust(Math.random() < 0.5 ? -this.rearTrack : this.rearTrack, 0, 0.5, s, 0xdddddd);
    } else {
      this.markAccum = 0;
    }
    // Marks fade by shrinking; the oldest are reused.
    for (let k = 0; k < SKID_MARKS; k++) {
      if (this.markAge[k] >= SKID_LIFE) continue;
      this.markAge[k] += dt;
      const m = this.markPose[k];
      const w = Math.max(0, 1 - this.markAge[k] / SKID_LIFE);
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, m.yaw);
      this.m4.compose(this.tmp.set(m.x, m.y, m.z), this.q, new THREE.Vector3(w, 1, 1));
      this.marks.setMatrixAt(k, this.m4);
    }
    this.marks.instanceMatrix.needsUpdate = true;
  }

  /** Dust plumes behind the rear wheels off-road. */
  private updateDust(s: KartState, speedRatio: number, dt: number): void {
    if (s.grounded && s.surface === 'offroad' && Math.abs(s.speed) > 5) {
      this.dustAccum += dt * 26 * speedRatio;
      while (this.dustAccum >= 1) {
        this.dustAccum -= 1;
        this.emitDust(Math.random() < 0.5 ? -this.rearTrack : this.rearTrack, (Math.random() - 0.5) * 2, 0.6 + Math.random(), s);
      }
    } else {
      this.dustAccum = 0;
    }
    for (const p of this.dust) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.vel.multiplyScalar(Math.exp(-1.6 * dt));
      p.sprite.position.addScaledVector(p.vel, dt);
      const k = p.life / DUST_LIFE;
      p.sprite.material.opacity = 0.75 * k;
      p.sprite.scale.setScalar(1.2 + 2.6 * (1 - k));
    }
  }

  /** `s` given, the puff keeps some of the kart's speed so it trails as a plume. */
  private emitDust(lateral: number, spread: number, up: number, s?: KartState, color = dustColor): void {
    const p = this.dust[this.dustCursor];
    this.dustCursor = (this.dustCursor + 1) % DUST_POOL;
    const yaw = this.root.rotation.y;
    this.tmp.set(lateral, 0.3, this.rearZ).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(this.root.position);
    p.sprite.position.copy(this.tmp);
    const back = -(1.5 + Math.random() * 2);
    p.vel.set(Math.sin(yaw) * back + Math.cos(yaw) * spread, up, Math.cos(yaw) * back - Math.sin(yaw) * spread);
    if (s) {
      p.vel.x += Math.sin(s.heading) * s.speed * 0.55;
      p.vel.z += Math.cos(s.heading) * s.speed * 0.55;
    }
    p.sprite.material.color.setHex(color);
    p.sprite.visible = true;
    p.life = DUST_LIFE * (0.7 + Math.random() * 0.3);
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
