import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import type { KartState } from '../physics/kart';
import { driftTier } from '../physics/kart';
import type { RacerDef } from '../physics/racers';
import { buildGlider, buildKartModel, buildWooCannon, type GliderModel, type WooCannonModel } from './racerModels';
import { NonagonGate } from './nonagonGate';
import { blobShadowTexture, glowTexture } from './textures';
import type { ItemKind } from '../items/items';
import type { HazardKind } from '../items/hazards';
import { FxSystem } from './fx/fxSystem';
import { TILE } from './fx/particles';
import { ring } from './fx/envelopes';
import { ITEM_COLOR, cannonBlast, contact, debris, dustRing, embers, flash, shockRing, smoke, sparks } from './fx/effects';

const SPARK_COLORS = [0xfff2a8, 0x3fa9ff, 0xff8a1f, 0xc04bff, 0xffffff];
/** The most the drawn nose may point off the direction of travel (rad): sideways enough to read as a drift, never a right angle. */
const NOSE_MAX = 0.6;
const SPARK_LIFE = 0.28;
const DUST_LIFE = 0.75;
/** How long a hit's whip, tumble and hop take to ring out, and the dizzy swirl outlasts the spin. */
const REACT_TIME = 1.2;
const DIZZY_AFTER = 0.5;
/** Seconds after `used` or `struck` that a boost or a spin-out still counts as theirs. */
const CAUSE_TIME = 0.4;
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
  // A loop-the-loop, waggling its wings at the top like a stunt plane.
  'flying-pig': (u, d) => [-u * TAU, 0, d * Math.sin(u * TAU * 2) * 0.3, Math.sin(u * Math.PI) * 1.3],
  // A wing-over: it banks up, turns right round in the air and drops back down out of it.
  'skeleton-dragon': (u, d) => [-Math.sin(u * Math.PI) * 0.5, d * u * TAU, d * Math.sin(u * TAU) * 0.7, Math.sin(u * Math.PI) * 1.4],
  // A strike: up, three quick turns on the bolt, and down like the lightning.
  'lord-of-lightning': (u, d) => [0, d * u * TAU * 3, Math.sin(u * TAU * 3) * 0.15, Math.sin(u * Math.PI) * 1.2],
  // A strike: it coils, springs up and spins.
  rattlesnake: (u, d) => [Math.sin(u * Math.PI) * 0.4, d * u * TAU * 2, 0, Math.sin(u * Math.PI) * 0.9],
  // The story bosses. The Voice: a hypnotic spin, four slow turns with a swaying wobble.
  'mind-voice': (u, d) => [Math.sin(u * TAU * 2) * 0.2, d * u * TAU * 4, Math.cos(u * TAU * 2) * 0.2, Math.sin(u * Math.PI) * 1.3],
  // The People-Vulture: a swoop, banked right over and round.
  'people-vulture': (u, d) => [-Math.sin(u * Math.PI) * 0.3, d * u * TAU, d * Math.sin(u * Math.PI) * 1.1, Math.sin(u * Math.PI) * 1.2],
  // The Altered Beast: a lumbering pounce, up and slammed down, half a turn and back.
  'altered-beast': (u, d) => [-Math.sin(u * Math.PI) * 0.5, d * Math.sin(u * Math.PI) * Math.PI, 0, Math.sin(u * Math.PI) * 0.8],
  // The Balrog: up out of the rift in a slow backflip.
  balrog: (u) => [-u * TAU, 0, 0, Math.sin(u * Math.PI) * 1.4],
  // The Munt Machine: a heave, the whole vat rocked side to side.
  'munt-machine': (u, d) => [0, 0, d * Math.sin(u * TAU * 2) * 0.5, Math.abs(Math.sin(u * Math.PI * 2)) * 0.7],
  // The castle: it sails a full slow turn, pitching on the swell.
  'castle-king': (u, d) => [Math.sin(u * TAU * 2) * 0.2, d * u * TAU, 0, Math.sin(u * Math.PI) * 1.2],
  // The Devil: a front flip with a twist.
  'the-devil': (u, d) => [u * TAU, d * u * TAU, 0, Math.sin(u * Math.PI) * 1.0],
  // The Mother of the Coven: the cart turns widdershins, three times round the circle.
  'coven-mother': (u, d) => [0, -d * u * TAU * 3, 0, Math.sin(u * Math.PI) * 1.1],
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
/** The one flat black every silhouette shares (KartView.silhouette). */
let silhouetteMat: THREE.MeshBasicMaterial | null = null;
let sharedShadow: THREE.Texture | null = null;

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
  /** The glider a launcher opens, built the first time it's needed, and how far open it is (0..1). */
  private glider: GliderModel | null = null;
  private gliderOpen = 0;
  private readonly racer: RacerDef;
  private readonly wheels: { mesh: THREE.Object3D; radius: number }[] = [];
  private readonly spinners: THREE.Object3D[];
  private readonly rotors: THREE.Object3D[];
  private readonly hover: { bob: number; pads: THREE.Object3D[]; beat?: boolean } | null;
  private readonly head: THREE.Object3D | null;
  private readonly treads: { map: THREE.Texture; perMeter: number }[];
  private readonly flappers: THREE.Object3D[];
  /** Runners: legs swung about their hips, the body snaking with the stride and the tail against it. */
  private readonly legs: THREE.Object3D[];
  private readonly sway: THREE.Object3D | null;
  private readonly tail: THREE.Object3D | null;
  /** Slitherers: a wave down the body's segments, and a rattle shaking. */
  private readonly segments: THREE.Object3D[];
  private readonly rattle: THREE.Object3D | null;
  /** Where in its stride a runner is (radians). */
  private gait = 0;
  private readonly sweepers: THREE.Object3D[];
  /**
   * The race's particles, shared by every kart (set by the game before the
   * karts are built); a kart shown on its own (the gallery, the podium)
   * keeps its own, drawn in `fx`.
   */
  static effects: FxSystem | null = null;
  private readonly particles: FxSystem;
  private readonly ownParticles: boolean;
  private readonly exhausts: THREE.Vector3[];
  /** The driver's head height over the road (m), for what circles it. */
  private readonly headY: number;
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
  /** Drawn as a silhouette (a locked boss). */
  private dark = false;
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
  private readonly unit = new THREE.Vector3();

  /** Last frame's state, to see a hit, a wobble, a slow, a boost or a drift tier arrive. */
  private prevSpin = 0;
  private prevWobble = 0;
  private prevSlow = 0;
  private prevBoost = 0;
  private prevTier = 0;
  /** Seconds since the last spin-out began (REACT_TIME and over: none), and which way it whips. */
  private react = REACT_TIME;
  private reactDir = 1;
  /** Seconds since robbed, and since an item was used (for the pose it strikes). */
  private robbedAge = REACT_TIME;
  private useAge = REACT_TIME;
  private useKind: ItemKind | null = null;
  /** What last hit this kart and when (the race says, `struck`): it colours the spin-out and what circles the head. */
  private cause: ItemKind | HazardKind | null = null;
  private causeAt = -1;
  private now = 0;
  /** What the current boost is from, coloured to match: an item's, a drift's tier, a pad's. */
  private boostColor = 0xffa040;
  private boostFrom: ItemKind | null = null;
  /** Squash and stretch: a spring of its own (+ squashed flat, - stretched long). */
  private squash = 0;
  private squashVel = 0;
  /** Horology's shrink, eased in and out. */
  private shrink = 1;
  /** A tumble while thrown up spinning (rad), unwound on landing. */
  private tumble = 0;
  private flameAccum = 0;
  private lineAccum = 0;
  private trailAccum = 0;

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
    this.legs = model.legs ?? [];
    this.sway = model.sway ?? null;
    this.tail = model.tail ?? null;
    this.segments = model.segments ?? [];
    this.rattle = model.rattle ?? null;
    this.sweepers = model.sweepers ?? [];
    this.rearTrack = model.rearTrack;
    this.rearZ = model.rearZ;
    this.exhausts = model.exhausts.slice(0, 2);
    this.ownParticles = !KartView.effects;
    this.particles = KartView.effects ?? new FxSystem();
    if (this.ownParticles) this.fx.add(this.particles.group);
    let headY = 1.6;
    if (this.head) {
      model.body.updateMatrixWorld(true);
      headY = this.head.getWorldPosition(new THREE.Vector3()).y + 0.45;
    }
    this.headY = headY;

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

  }

  /** The racer as a flat black shape, its glows out: a story boss not yet beaten, in the gallery. Off puts its own materials back. */
  silhouette(on: boolean): void {
    if (on === this.dark) return;
    this.dark = on;
    silhouetteMat ??= new THREE.MeshBasicMaterial({ color: 0x07020c });
    this.root.traverse((o) => {
      if (o instanceof THREE.Sprite) {
        if (on) o.userData.litVisible = o.visible;
        o.visible = on ? false : ((o.userData.litVisible as boolean | undefined) ?? true);
      } else if (o instanceof THREE.Mesh && !this.flames.some((f) => f.cone === o)) {
        if (on) {
          o.userData.litMaterial = o.material;
          o.material = silhouetteMat!;
        } else if (o.userData.litMaterial) o.material = o.userData.litMaterial as THREE.Material;
      }
    });
  }

  /** Kick the suspension, e.g. on landing: it squashes into the road, and a hard one throws up a ring of dust (and a scrape of sparks on the hardest). */
  impact(strength: number): void {
    const k = clamp(strength, 0, 12);
    this.bounceVel -= k * 0.6;
    this.squashVel += k * 0.35;
    const p = this.root.position;
    const ground = p.y;
    dustRing(this.particles, p.x, ground, p.z, Math.min(14, 3 + k), dustColor, 2 + k * 0.5, 0.7 + k * 0.05);
    if (k > 7) {
      shockRing(this.particles, p.x, ground, p.z, 2 + k * 0.15, 0xfff4e0, 0.3);
      sparks(this.particles, p.x, ground + 0.2, p.z, 8, 0xffc040, 5, ground);
    }
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
    // A knock: the kart squashes on the struck side and the paint chips fly.
    this.squashVel += Math.min(1.5, strength) * 1.6;
    const len = Math.hypot(dirX, dirZ);
    const p = this.root.position;
    if (len > 0) {
      const nx = dirX / len;
      const nz = dirZ / len;
      // Each kart of a pair draws half the sparks at the point they met.
      contact(this.particles, p.x + nx * 1.1, p.y + 0.55, p.z + nz * 1.1, p.y, strength * 0.7, this.racer.color, nx, nz);
    } else {
      // A wall knock: sparks off the nose.
      const n = Math.round(4 + strength * 8);
      for (let i = 0; i < n; i++) this.emitHitSpark(0, 0);
    }
  }

  /** The race says what hit this kart (an item or a hazard): the spin-out, wobble or slow it sets off is drawn in its colour. */
  struck(by: ItemKind | HazardKind): void {
    this.cause = by;
    this.causeAt = this.now;
  }

  /** This kart used `item`: the pose it strikes as it goes, and the boost it gives drawn in its colour. */
  used(item: ItemKind): void {
    this.useKind = item;
    this.useAge = 0;
    this.boostFrom = item;
    const fx = this.particles;
    const p = this.root.position;
    const yaw = this.root.rotation.y;
    const fx_ = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const c = ITEM_COLOR[item];
    switch (item) {
      case 'fuzzPedal':
        // Stomped on: a ring of fuzz and a crackle.
        shockRing(fx, p.x, p.y, p.z, 3.2, c, 0.35);
        sparks(fx, p.x, p.y + 0.6, p.z, 12, c, 5, p.y, 0, 0, 0xffd0ff);
        break;
      case 'drippingTap': {
        // The tap turned on: a splash of water off the back.
        const n = fx.n(12);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          fx.alpha.spawn(TILE.drop).at(p.x - fx_ * 1.2, p.y + 1, p.z - fz * 1.2).vel(Math.cos(a) * 3 - fx_ * 2, 3 + Math.random() * 3, Math.sin(a) * 3 - fz * 2).life(0.8).size(0.3).color(0x9ad8ff, 0x60a8ff, 0.85).physics(16).floor(p.y + 0.05, 0).fade(0, 0.5);
        }
        shockRing(fx, p.x, p.y, p.z, 2.6, c, 0.35);
        break;
      }
      case 'tempoShift':
        // A clock face thrown out over the field, hands going backwards.
        fx.add.spawn(TILE.clock).at(p.x, p.y + 0.2, p.z).life(0.8).size(2, 7).color(0xffffff, c, 0.9).spin(0, -6).flat().fade(0, 0.3);
        shockRing(fx, p.x, p.y, p.z, 10, c, 0.6);
        flash(fx, p.x, p.y + 1.2, p.z, 3, c, 0.25);
        break;
      case 'wooCannon':
        cannonBlast(fx, p.x, p.y, p.z, p.y, yaw);
        break;
      case 'bassDrop':
        // The whole rig drops on the beat.
        this.squashVel += 4;
        this.bounceVel -= 4;
        break;
      case 'drumRoll':
        this.bounceVel += 3;
        break;
      case 'gizzardWave':
        flash(fx, p.x, p.y + 1, p.z, 3.5, c, 0.3);
        shockRing(fx, p.x, p.y, p.z, 4, c, 0.4);
        break;
      case 'feedbackWave':
        this.squashVel += 2.5;
        break;
    }
  }

  /** Robbed of the item in hand: it flies up out of the kart and away into the dark, and the driver's head whips round after it. */
  robbed(item: ItemKind | null): void {
    const fx = this.particles;
    const p = this.root.position;
    const c = item ? ITEM_COLOR[item] : 0xffe060;
    const side = Math.random() < 0.5 ? -1 : 1;
    const yaw = this.root.rotation.y;
    const vx = Math.cos(yaw) * side * 5 - Math.sin(yaw) * 3;
    const vz = -Math.sin(yaw) * side * 5 - Math.cos(yaw) * 3;
    fx.add.spawn(TILE.glow).at(p.x, p.y + this.headY, p.z).vel(vx, 9, vz).life(1.1).size(1.3, -0.3).color(0xffffff, c).physics(12);
    fx.add.spawn(TILE.star).at(p.x, p.y + this.headY, p.z).vel(vx, 9, vz).life(1.1).size(0.9, -0.4).color(c).physics(12).spin(0, side * 9);
    embers(fx, TILE.star, p.x, p.y + this.headY, p.z, 6, 0xffe060, c, 0.5, 0.35, 0.7);
    smoke(fx, p.x, p.y + 0.6, p.z, 3, 0xd8c8a8, 1, 1, 1.5, 0.7, 0.5);
    this.robbedAge = 0;
    this.reactDir = side;
  }

  /** Back on the road after a fall: the gate opens just behind the kart and it grows out of it. */
  restore(s: KartState): void {
    this.gate.open(s.x - Math.sin(s.heading) * 1.2, s.groundY, s.z - Math.cos(s.heading) * 1.2, s.heading);
    this.presence = 0;
    this.vanished = false;
  }

  /**
   * A slitherer: a side-to-side wave travelling down the body from the head,
   * its swing growing toward the tail, faster with speed and still (bar a
   * slow ripple) when stopped; each segment turned along the curve it makes.
   * The rattle shakes all the time.
   */
  private animateSlither(s: KartState, frameDt: number, time: number): void {
    const speed = Math.abs(s.speed);
    this.gait += frameDt * (1.2 + Math.min(speed, 30) * 0.35);
    const reach = 0.35 + 0.65 * Math.min(1, speed / 6);
    const WAVE = 4.2;
    for (const seg of this.segments) {
      const z = seg.userData.z as number;
      const amp = (seg.userData.amp as number) * reach;
      seg.position.x = Math.sin(this.gait - z * WAVE) * amp;
      seg.rotation.y = Math.cos(this.gait - z * WAVE) * amp * WAVE * 0.8;
    }
    if (this.rattle) this.rattle.rotation.z = Math.sin(time * 70) * 0.35;
  }

  /**
   * A runner's stride: the legs swing forward and back in diagonal pairs, the
   * one swinging forward lifted clear, at a pace that quickens with speed and
   * stops when it does; the body snakes with the stride and the tail lashes
   * against it. In the air the legs splay and paddle slowly.
   */
  private animateRun(s: KartState, frameDt: number): void {
    const speed = Math.abs(s.speed);
    const reach = s.grounded ? Math.min(1, speed / 4) : 0.4;
    this.gait += frameDt * (s.grounded ? 2 + Math.min(speed, 30) * 0.45 : 3) * Math.sign(s.speed || 1);
    for (const leg of this.legs) {
      const side = leg.userData.side as number;
      const p = this.gait + (leg.userData.phase as number);
      leg.rotation.y = -side * Math.sin(p) * 0.55 * reach;
      // Lifted while it swings forward, planted while it pushes back.
      leg.rotation.z = side * Math.max(0, Math.cos(p)) * 0.35 * reach;
    }
    if (this.sway) this.sway.rotation.y = Math.sin(this.gait) * 0.1 * reach;
    if (this.tail) this.tail.rotation.y = -Math.sin(this.gait - 0.6) * 0.28 * reach;
  }

  /** `s` is an interpolated render snapshot; `frameDt` is real time since the last frame; `fell` is the race's call that it's gone over an edge. */
  update(s: KartState, topSpeed: number, frameDt: number, time: number, fell = false): void {
    this.now = time;
    if (this.ownParticles) this.particles.begin(frameDt);
    this.root.position.set(s.x, s.y, s.z);
    this.updateSkid(s, topSpeed, frameDt, time);
    this.root.rotation.y = s.heading - this.noseYaw + s.spinAngle;
    // Horology shrinks you a little while it lasts; squash and stretch on top.
    this.shrink += ((s.slowTime > 0 ? 0.8 : 1) - this.shrink) * damp(10, frameDt);
    const sq = clamp(this.squash, -0.3, 0.35);
    this.body.scale.set(this.shrink * (1 + sq * 0.5), this.shrink * (1 - sq), this.shrink * (1 + sq * 0.5));
    this.updatePresence(fell, frameDt, time);
    this.animateCannon(s, frameDt, time);
    this.animateGlider(s, frameDt, time);

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
      this.squashVel += (-260 * this.squash - 13 * this.squashVel) * h;
      this.squash += this.squashVel * h;
    }
    // Flyers float over rough ground; they bank harder instead.
    const rumble = !this.hover && s.surface === 'offroad' && s.grounded && Math.abs(s.speed) > 2 ? Math.sin(time * 55) * 0.03 : 0;
    // Wings beat lazily at rest and hard under boost; a bird that holds itself up rises on each downstroke.
    const beat = Math.sin(time * (s.boostTime > 0 ? 22 : 7 + speedRatio * 6) + this.phase);
    const bob = !this.hover ? 0 : this.hover.beat ? -beat * this.hover.bob : Math.sin(time * 3.1 + this.phase) * this.hover.bob;
    this.body.position.set(0, this.bounce * 0.08 + rumble + bob, 0);
    this.body.rotation.set(this.pitch, 0, this.roll * (this.hover ? 1.8 : 1));
    this.animateDrift(s, frameDt, time);
    // Skidding: the body heels over toward the outside of the turn.
    this.body.rotation.z += -this.skidYaw * 0.35;
    this.animateHit(frameDt, time);
    this.animateTrick(s, frameDt);
    this.animateReactions(s, frameDt, time);

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
    for (const f of this.flappers) f.rotation.z = (f.userData.side as number) * (0.12 + beat * 0.3);
    if (this.legs.length) this.animateRun(s, frameDt);
    if (this.segments.length) this.animateSlither(s, frameDt, time);
    // Moving heads sweep their beams, faster under boost.
    for (const w of this.sweepers) w.rotation.y = Math.sin(time * (s.boostTime > 0 ? 4 : 1.4) + (w.userData.phase as number)) * 0.9;
    if (this.head) {
      // Lean into the turn and look along it; tucked back under boost.
      this.head.rotation.set(s.boostTime > 0 ? -0.18 : 0, -s.steer * 0.35 - s.driftDir * 0.15, this.roll * 1.6);
      this.animateHead(s, time);
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
    this.updateBoostFx(s, frameDt);
    this.updateMarks(s, time);
    this.prevSpin = s.spinTime;
    this.prevWobble = s.wobbleTime;
    this.prevSlow = s.slowTime;
    this.prevBoost = s.boostTime;
    if (this.ownParticles) this.particles.end();
  }

  /**
   * A hit arriving: a spin-out (a flash in what hit it, a puff, chips of
   * paint, stars), a wobble, a slow. The body tumbles and hops, the driver's
   * head whips (animateHead), and it squashes; thrown into the air
   * spinning, it tumbles end over end until it lands.
   */
  private animateReactions(s: KartState, dt: number, time: number): void {
    const fx = this.particles;
    const p = this.root.position;
    const recent = this.cause && time - this.causeAt < CAUSE_TIME ? this.cause : null;
    const color = recent && recent in ITEM_COLOR ? ITEM_COLOR[recent as ItemKind] : 0xffffff;
    if (s.spinTime > 0 && this.prevSpin === 0) {
      this.react = 0;
      this.reactDir = Math.random() < 0.5 ? -1 : 1;
      this.squashVel += 3;
      this.bounceVel += 3.5;
      flash(fx, p.x, p.y + 0.9, p.z, 3.4, color, 0.22);
      dustRing(fx, p.x, s.groundY, p.z, 7, 0xe8e0d8, 4, 0.9);
      debris(fx, TILE.chunk, p.x, p.y + 0.8, p.z, 4, this.racer.color, 4, s.groundY, 0.16, this.racer.accent);
      for (let i = 0; i < 8; i++) this.emitStar(0.8);
    }
    if (s.wobbleTime > 0 && this.prevWobble === 0) {
      smoke(fx, p.x, p.y + this.headY, p.z, 2, color === 0xffffff ? 0xfff0c0 : color, 0.7, 0.8, 0.8, 0.5, 0.5);
      this.squashVel += 1.5;
    }
    if (s.slowTime > this.prevSlow + 0.05) {
      flash(fx, p.x, p.y + 1, p.z, 2.6, recent === 'bassDrop' ? 0x9a40ff : recent === 'patchCable' ? 0xc0d0ff : 0xffd890, 0.25);
      this.squashVel += recent === 'bassDrop' ? 4 : 1.5;
    }
    this.react = Math.min(REACT_TIME, this.react + dt);
    this.robbedAge = Math.min(REACT_TIME, this.robbedAge + dt);
    this.useAge = Math.min(REACT_TIME, this.useAge + dt);
    if (this.react < REACT_TIME) {
      // Knocked sideways and back: a roll that rings out, a nod, a little hop.
      const t = this.react;
      this.body.rotation.z += ring(t, 14, 3.5) * 0.45 * this.reactDir;
      this.body.rotation.x += ring(t, 11, 4) * 0.2;
      this.body.position.y += Math.max(0, ring(t, 8, 5)) * 0.35;
    }
    // Thrown up spinning: end over end until it comes down, then it rights itself.
    if (!s.grounded && s.spinTime > 0 && this.trickTime >= TRICK_TIME) this.tumble += dt * 9;
    else if (this.tumble !== 0) {
      const rest = Math.atan2(Math.sin(this.tumble), Math.cos(this.tumble));
      this.tumble = Math.abs(rest) < 0.02 ? 0 : rest * (1 - damp(14, dt));
    }
    this.body.rotation.x += this.tumble;
    // The pose an item's use strikes: a recoil from a shot, a lean into a pull.
    if (this.useAge < 0.6) {
      const t = this.useAge;
      const k = this.useKind;
      if (k === 'keytarLaser' || k === 'riffMissile' || k === 'wooCannon') this.body.rotation.x += -Math.max(0, ring(t, 18, 7)) * 0.18;
      else if (k === 'patchCable') this.body.rotation.x += Math.max(0, ring(t, 10, 5)) * 0.15;
      else if (k === 'microtonalMine') this.body.rotation.z += ring(t, 16, 7) * 0.08;
    }
    // While spinning on the road: tyre smoke.
    if (s.spinTime > 0 && s.grounded && Math.abs(s.speed) > 3 && Math.random() < dt * 20 * fx.scale) this.emitDust(Math.random() < 0.5 ? -this.rearTrack : this.rearTrack, (Math.random() - 0.5) * 3, 0.6, undefined, 0xe8e8e8);
  }

  /**
   * The driver's head: whipped round by a hit and rolling dizzily while the
   * spin lasts, lolling with a wobble, thrown back for a harmonica's wail,
   * nodding along to a flute, and turned after an item as it's robbed.
   */
  private animateHead(s: KartState, time: number): void {
    const h = this.head!;
    if (this.react < REACT_TIME) {
      const t = this.react;
      h.rotation.y += ring(t, 24, 5) * 0.9 * this.reactDir;
      h.rotation.z += ring(t, 18, 4) * 0.35 * this.reactDir;
    }
    const dizzy = s.spinTime > 0 ? 1 : this.react < REACT_TIME ? Math.max(0, 1 - (this.react - 0.4) / DIZZY_AFTER) : 0;
    if (dizzy > 0) {
      h.rotation.z += Math.sin(time * 8) * 0.22 * dizzy;
      h.rotation.x += Math.cos(time * 8) * 0.12 * dizzy;
    }
    if (s.wobbleTime > 0) h.rotation.z += Math.sin(time * 11) * 0.2 * Math.min(1, s.wobbleTime * 2);
    if (this.robbedAge < REACT_TIME) h.rotation.y += Math.max(0, ring(this.robbedAge, 9, 3)) * 0.9 * this.reactDir;
    if (this.useAge < 0.7) {
      if (this.useKind === 'harmonicaWail') h.rotation.x -= Math.sin((this.useAge / 0.7) * Math.PI) * 0.4;
      if (this.useKind === 'fluteFlurry') h.rotation.z += Math.sin(this.useAge * 22) * 0.18 * (1 - this.useAge / 0.7);
    }
  }

  /**
   * What circles a kart while a hit lasts, drawn for the one frame: stars
   * round the head while it's dizzy, notes or motes while it wobbles, a
   * clock face over it while Horology holds it (rings pressing down for
   * Superheavy).
   */
  private updateMarks(s: KartState, time: number): void {
    const fx = this.particles;
    const p = this.root.position;
    const top = p.y + this.headY;
    const dizzy = s.spinTime > 0 || this.react < 0.4 + DIZZY_AFTER;
    if (dizzy && this.presence > 0.5) {
      const fade = s.spinTime > 0 ? 1 : Math.max(0, 1 - (this.react - 0.4) / DIZZY_AFTER);
      for (let k = 0; k < 4; k++) {
        const a = time * 7 + (k * Math.PI) / 2;
        fx.add.spawn(TILE.star).at(p.x + Math.cos(a) * 0.75, top + 0.3 + Math.sin(a * 2) * 0.08, p.z + Math.sin(a) * 0.75).life(0).size(0.45).color(STAR_COLORS[k + 1], STAR_COLORS[k + 1], fade).spin(a * 2);
      }
    }
    const cause = this.cause;
    if (s.wobbleTime > 0) {
      const musical = cause === 'microtonalMine' || cause === 'fluteFlurry' || cause === 'harmonicaWail';
      const c = cause && cause in ITEM_COLOR ? ITEM_COLOR[cause as ItemKind] : 0xfff0a0;
      for (let k = 0; k < 2; k++) {
        const a = -time * 4 + k * Math.PI;
        fx.add.spawn(musical ? TILE.note : TILE.glow).at(p.x + Math.cos(a) * 0.9, top + 0.15 + Math.sin(time * 6 + k) * 0.15, p.z + Math.sin(a) * 0.9).life(0).size(musical ? 0.55 : 0.4).color(c, c, Math.min(1, s.wobbleTime * 2)).spin(Math.sin(time * 5 + k) * 0.5);
      }
    }
    if (s.slowTime > 0) {
      const fade = Math.min(1, s.slowTime * 2);
      if (cause === 'bassDrop') {
        // A weight on it: rings of purple pressing down over the kart.
        for (let k = 0; k < 2; k++) {
          const ph = (time * 1.6 + k * 0.5) % 1;
          fx.add.spawn(TILE.ring).at(p.x, p.y + 2.2 * (1 - ph), p.z).life(0).size(3.4 - ph * 1.2).color(0xc080ff, 0xc080ff, 0.6 * fade * Math.sin(ph * Math.PI)).flat();
        }
      } else if (cause === 'tempoShift') {
        fx.add.spawn(TILE.clock).at(p.x, top + 0.5, p.z).life(0).size(1.1).color(0xffd890, 0xffd890, 0.9 * fade).spin(-time * 3);
      }
    }
  }

  /**
   * A boost: a pulse as it kicks in (a ring on the road, a stretch), flames
   * licking out of the exhausts in its colour, speed lines whipping past,
   * and the item's own trimmings: the Mind Fuzz crackles, the Dripping Tap
   * drips. Drift tiers flare as they're reached.
   */
  private updateBoostFx(s: KartState, dt: number): void {
    const fx = this.particles;
    const p = this.root.position;
    const yaw = this.root.rotation.y;
    const fx_ = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const tier = s.driftDir !== 0 && s.grounded ? driftTier(s.driftCharge) : 0;
    if (tier > this.prevTier && tier > 0) {
      // A tier reached: a flare at each rear wheel.
      for (let side = -1; side <= 1; side += 2) {
        this.unit.set(side * this.rearTrack, 0.3, this.rearZ).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(p);
        fx.add.spawn(TILE.flare).at(this.unit.x, this.unit.y, this.unit.z).life(0.25).size(1.6, 0.5).color(0xffffff, SPARK_COLORS[tier]).spin(Math.random() * 3);
        embers(fx, TILE.star, this.unit.x, this.unit.y, this.unit.z, 3, SPARK_COLORS[tier], SPARK_COLORS[tier], 0.2, 0.3, 0.5);
      }
    }
    const released = this.prevTier;
    this.prevTier = tier;
    if (s.boostTime > this.prevBoost + 0.05) {
      const from = this.boostFrom && this.useAge < CAUSE_TIME ? this.boostFrom : null;
      this.boostColor = from ? ITEM_COLOR[from] : released > 0 && s.driftDir === 0 ? SPARK_COLORS[released] : 0xffa040;
      if (!from) this.boostFrom = null;
      shockRing(fx, p.x, s.groundY, p.z, 2.8, this.boostColor, 0.3);
      this.squashVel -= 2.4;
      for (const e of this.exhausts) {
        this.exhaustAt(e);
        flash(fx, this.unit.x, this.unit.y, this.unit.z, 1.6, this.boostColor, 0.16);
      }
    }
    if (s.boostTime <= 0 || this.trickTime < TRICK_TIME || s.cannonTime > 0 || this.presence < 0.5) {
      this.flameAccum = this.lineAccum = this.trailAccum = 0;
      return;
    }
    const vx = Math.sin(s.heading) * s.speed;
    const vz = Math.cos(s.heading) * s.speed;
    // Flames off each exhaust, hot white to the boost's colour, trailing.
    this.flameAccum += dt * 45 * fx.scale;
    while (this.flameAccum >= 1) {
      this.flameAccum -= 1;
      for (const e of this.exhausts) {
        this.exhaustAt(e);
        fx.add.spawn(TILE.glow).at(this.unit.x, this.unit.y, this.unit.z).vel(vx * 0.75 - fx_ * 5 + (Math.random() - 0.5), (Math.random() - 0.2) * 1.5, vz * 0.75 - fz * 5 + (Math.random() - 0.5)).life(0.16 + Math.random() * 0.08).size(0.55, -0.6).color(0xfff4c0, this.boostColor).fade(0, 0.3);
      }
    }
    // Speed lines: still in the world, so they streak past the camera as the kart tears through them.
    this.lineAccum += dt * 26 * fx.scale;
    while (this.lineAccum >= 1) {
      this.lineAccum -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      const out = 1.4 + Math.random() * 1.8;
      const ahead = Math.random() * 5;
      fx.add.spawn(TILE.streak).at(p.x + fz * side * out + fx_ * ahead, p.y + 0.3 + Math.random() * 2.2, p.z - fx_ * side * out + fz * ahead).life(0.2).size(0.12).color(0xffffff, this.boostColor, 0.55).stretch(0.06).fade(0.03, 0.3);
    }
    const from = this.boostFrom;
    this.trailAccum += dt * 22 * fx.scale;
    while (this.trailAccum >= 1) {
      this.trailAccum -= 1;
      if (from === 'drippingTap') {
        // The tap keeps dripping off the back.
        fx.alpha.spawn(TILE.drop).at(p.x - fx_ * 1.2 + (Math.random() - 0.5), p.y + 0.9, p.z - fz * 1.2 + (Math.random() - 0.5)).vel(vx * 0.5, 0, vz * 0.5).life(0.7).size(0.24).color(0x9ad8ff, 0x60a8ff, 0.8).physics(18, 0.5).floor(s.groundY + 0.04, 0).fade(0, 0.6);
      } else if (from === 'fuzzPedal') {
        // Fuzz crackling over the bodywork.
        const a = Math.random() * Math.PI * 2;
        fx.add.spawn(TILE.flare).at(p.x + Math.cos(a) * 0.9, p.y + 0.5 + Math.random(), p.z + Math.sin(a) * 0.9).vel(vx, 0, vz).life(0.08).size(0.6 + Math.random() * 0.4).color(0xffffff, ITEM_COLOR.fuzzPedal).spin(Math.random() * 3);
      }
    }
  }

  /** An exhaust's place in the world, into `unit`. */
  private exhaustAt(e: THREE.Vector3): void {
    this.unit.copy(e).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.root.rotation.y).multiplyScalar(this.root.scale.x).add(this.root.position);
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

  /** Off a launcher: the glider snaps open over the kart, banks with the steering and flutters, and folds away on landing. */
  private animateGlider(s: KartState, dt: number, time: number): void {
    const open = s.glideTime > 0 && s.cannonTime === 0;
    if (open && !this.glider) {
      this.glider = buildGlider(this.racer);
      this.root.add(this.glider.group);
    }
    if (!this.glider) return;
    if (open && this.gliderOpen === 0) for (let i = 0; i < 10; i++) this.emitStar(0.6);
    this.gliderOpen = open ? Math.min(1, this.gliderOpen + dt * 5) : Math.max(0, this.gliderOpen - dt * 6);
    const g = this.glider;
    g.group.visible = this.gliderOpen > 0;
    if (!g.group.visible) return;
    // Unfurls sideways and up out of the seat.
    const u = this.gliderOpen * this.gliderOpen * (3 - 2 * this.gliderOpen);
    g.group.scale.set(0.15 + 0.85 * u, u, 0.6 + 0.4 * u);
    g.wing.rotation.set(Math.sin(time * 3.3 + this.phase) * 0.04, 0, -s.steer * 0.3 + Math.sin(time * 2.1 + this.phase) * 0.05);
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
    const len = Math.hypot(dirX, dirZ);
    const yaw = this.root.rotation.y;
    // Toward what was hit; a wall knock with no direction sparks off the nose.
    const fx = len > 0 ? dirX / len : Math.sin(yaw);
    const fz = len > 0 ? dirZ / len : Math.cos(yaw);
    const p = this.root.position;
    const sp = 4 + Math.random() * 6;
    this.particles.add
      .spawn(TILE.glow)
      .at(p.x + fx * 1.1, p.y + 0.5, p.z + fz * 1.1)
      .vel(-fz * (Math.random() - 0.5) * 8 + fx * sp * 0.3, 2 + Math.random() * 4, fx * (Math.random() - 0.5) * 8 + fz * sp * 0.3)
      .life(SPARK_LIFE * (0.8 + Math.random() * 0.6))
      .size(0.2, -0.5)
      .color(0xffffff, Math.random() < 0.5 ? 0xffffff : 0xffd23a)
      .physics(18)
      .floor(p.y + 0.05, 0.4)
      .stretch(0.035);
  }

  /** A rainbow star off the kart, `force` how far it flies. */
  private emitStar(force: number): void {
    const a = Math.random() * Math.PI * 2;
    const sp = (2 + Math.random() * 4) * force;
    const c = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    const p = this.root.position;
    this.particles.add
      .spawn(TILE.star)
      .at(p.x + (Math.random() - 0.5) * 1.5, p.y + 0.6 + Math.random(), p.z + (Math.random() - 0.5) * 1.5)
      .vel(Math.cos(a) * sp, (3 + Math.random() * 3) * force, Math.sin(a) * sp)
      .life(SPARK_LIFE * 2)
      .size(0.55, -0.5)
      .color(c)
      .physics(18)
      .spin(a, (Math.random() - 0.5) * 12)
      .fade(0, 0.3);
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
      this.dustAccum += dt * 26 * speedRatio * this.particles.scale;
      while (this.dustAccum >= 1) {
        this.dustAccum -= 1;
        this.emitDust(Math.random() < 0.5 ? -this.rearTrack : this.rearTrack, (Math.random() - 0.5) * 2, 0.6 + Math.random(), s);
      }
    } else {
      this.dustAccum = 0;
    }
  }

  /** `s` given, the puff keeps some of the kart's speed so it trails as a plume. */
  private emitDust(lateral: number, spread: number, up: number, s?: KartState, color = dustColor): void {
    const yaw = this.root.rotation.y;
    this.tmp.set(lateral, 0.3, this.rearZ).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(this.root.position);
    const back = -(1.5 + Math.random() * 2);
    let vx = Math.sin(yaw) * back + Math.cos(yaw) * spread;
    let vz = Math.cos(yaw) * back - Math.sin(yaw) * spread;
    if (s) {
      vx += Math.sin(s.heading) * s.speed * 0.55;
      vz += Math.cos(s.heading) * s.speed * 0.55;
    }
    this.particles.alpha
      .spawn(TILE.puff)
      .at(this.tmp.x, this.tmp.y, this.tmp.z)
      .vel(vx, up, vz)
      .life(DUST_LIFE * (0.7 + Math.random() * 0.3))
      .size(1, 2)
      .color(color, color, 0.5)
      .physics(0, 1.6)
      .spin(Math.random() * 6, (Math.random() - 0.5) * 2)
      .fade(0.04, 0);
  }

  private updateSparks(s: KartState, dt: number): void {
    const tier = s.driftDir !== 0 && s.grounded ? driftTier(s.driftCharge) : -1;
    if (tier >= 0) {
      this.sparkAccum += dt * (tier === 0 ? 40 : 70 + tier * 20) * this.particles.scale;
      while (this.sparkAccum >= 1) {
        this.sparkAccum -= 1;
        this.emitSpark(s, SPARK_COLORS[tier], tier);
      }
    } else {
      this.sparkAccum = 0;
    }
  }

  private emitSpark(s: KartState, color: number, tier: number): void {
    const yaw = this.root.rotation.y;
    const side = Math.random() < 0.5 ? -this.rearTrack : this.rearTrack;
    // Rear wheel contact point in world space.
    this.tmp.set(side, 0.1, this.rearZ).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(this.root.position);
    const back = -(4 + Math.random() * 4);
    const spread = (Math.random() - 0.5) * 5;
    this.particles.add
      .spawn(TILE.glow)
      .at(this.tmp.x, this.tmp.y, this.tmp.z)
      .vel(Math.sin(yaw) * back + Math.cos(yaw) * spread + Math.sin(s.heading) * s.speed * 0.6, 2 + Math.random() * (2 + tier), Math.cos(yaw) * back - Math.sin(yaw) * spread + Math.cos(s.heading) * s.speed * 0.6)
      .life(SPARK_LIFE * (0.6 + Math.random() * 0.4))
      .size(0.16 + tier * 0.04, -0.4)
      .color(0xffffff, color)
      .physics(18)
      .floor(s.groundY + 0.04, 0.5)
      .stretch(0.03);
  }
}
