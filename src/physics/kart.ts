import { NEUTRAL_INPUT, type InputFrame } from '../core/inputFrame';
import { clamp, moveToward, wrapAngle } from '../core/math';
import type { KartParams } from './racers';

export type SurfaceType = 'road' | 'offroad' | 'boost';

export interface WallHit {
  nx: number; // push-out normal
  nz: number;
  depth: number;
}

export interface GroundInfo {
  height: number;
  surface: SurfaceType;
}

/** What the kart controller needs to know about the world. */
export interface DriveEnv {
  /** Ground under the kart's current position. May update `s.trackHint`. */
  probe(s: KartState): GroundInfo;
  collide(s: KartState, radius: number): WallHit | null;
}

/**
 * Simulation state for one kart. Heading 0 faces +Z; forward is
 * (sin h, cos h). Positive steer turns right, which decreases heading.
 */
export interface KartState {
  x: number;
  y: number;
  z: number;
  vy: number;
  heading: number;
  speed: number; // signed, along heading
  extX: number; // external velocity (bumps, wind), decays
  extZ: number;
  grounded: boolean;
  surface: SurfaceType;
  steer: number; // smoothed steer, -1..1
  driftDir: -1 | 0 | 1;
  driftArmed: boolean;
  driftCharge: number; // seconds
  boostTime: number; // seconds remaining
  slip: number; // visual yaw offset toward drift inside, radians
  groundY: number; // ground height under the kart last tick
  hopAge: number; // seconds since the last hop
  trickWindow: number; // seconds left to press hop for a trick after leaving a ledge
  trick: boolean; // trick performed, boost on landing
  trackHint: number; // opaque lookup hint owned by the track, -1 = none
  spinTime: number; // seconds of spin-out left: no control, bleeding speed
  spinAngle: number; // visual yaw added by a spin-out, radians
  wobbleTime: number; // seconds of wobbly steering left (Microtonal Mine)
  slowTime: number; // seconds of reduced top speed left (Tempo Shift)
  invulnTime: number; // seconds of immunity left after being hit
}

export interface StepEvents {
  hopped: boolean;
  landed: number; // impact speed, 0 if no landing
  driftStarted: boolean;
  boostTier: number; // 0 none, 1..3 drift tier released this tick
  wallHit: number; // 0..1 severity
  launched: boolean; // left a ledge or ramp lip
  trick: boolean; // landed a trick
}

/**
 * Bump whenever kart physics, racer stats or a track layout change lap
 * times: online leaderboards and ghosts are kept per version.
 */
export const PHYSICS_VERSION = 2;
export const KART_RADIUS = 1;
export const GRAVITY = 30;
export const HOP_VELOCITY = 4.5;
export const OFFROAD_SPEED_MUL = 0.6;
export const BOOST_SPEED_MUL = 1.35;
export const BOOST_ACCEL = 30;
export const PAD_BOOST_TIME = 1;
export const DRIFT_MIN_SPEED = 10;
/** Charge thresholds (s) and boost durations (s) for blue, orange, purple sparks. */
export const DRIFT_TIERS = [0.3, 0.6, 0.95] as const;
export const DRIFT_BOOSTS = [0.5, 1, 1.5] as const;
/** Top speed multiplier while slowed by Tempo Shift. */
export const SLOW_MUL = 0.6;
const SPIN_DECEL = 22;
const SPIN_RATE = 14; // rad/s of visual spin
const WOBBLE_FREQ = 15; // rad/s
const WOBBLE_DEPTH = 0.85;
export const TRICK_WINDOW = 0.3;
export const TRICK_BOOST = 0.7;

/** Steering ramps in gradually (fine taps) and recenters quickly. */
const STEER_IN_RATE = 3.5;
const STEER_OUT_RATE = 10;
/** Response curve exponent: small inputs turn gently, full lock is unchanged. */
const STEER_EXPO = 1.6;
/** A drop bigger than this under the kart counts as leaving a ledge. */
const LEDGE_DROP = 0.3;
const MAX_GROUND_VY = 20;
const TURN_FULL_SPEED = 6;
const AIR_STEER = 0.6;
const BRAKE_DECEL = 24;
const COAST_DECEL = 6;
const OVERSPEED_DECEL = 15;
const REVERSE_MAX = 8;
const REVERSE_ACCEL = 10;
const DRIFT_SLIP_ANGLE = 0.45;
const SLIP_RESPONSE = 3;
const EXT_DAMPING = 4;
const WALL_SPEED_LOSS = 0.7;
const WALL_BOUNCE = 4;

export function createKartState(x = 0, z = 0, heading = 0): KartState {
  return {
    x,
    y: 0,
    z,
    vy: 0,
    heading,
    speed: 0,
    extX: 0,
    extZ: 0,
    grounded: true,
    surface: 'road',
    steer: 0,
    driftDir: 0,
    driftArmed: false,
    driftCharge: 0,
    boostTime: 0,
    slip: 0,
    groundY: 0,
    hopAge: 99,
    trickWindow: 0,
    trick: false,
    trackHint: -1,
    spinTime: 0,
    spinAngle: 0,
    wobbleTime: 0,
    slowTime: 0,
    invulnTime: 0,
  };
}

export function copyKartState(from: KartState, to: KartState): KartState {
  return Object.assign(to, from);
}

/** 0 = no sparks yet, 1 blue, 2 orange, 3 purple. */
export function driftTier(charge: number): number {
  let tier = 0;
  for (const t of DRIFT_TIERS) if (charge >= t) tier++;
  return tier;
}

/** Maps steer -1..1 through the response curve. */
export function steerCurve(v: number): number {
  return Math.sign(v) * Math.abs(v) ** STEER_EXPO;
}

/** Recenters at the fast rate before ramping toward a new direction at the slow one. */
function approachSteer(current: number, target: number, dt: number): number {
  if (current !== 0 && Math.sign(target) !== Math.sign(current)) return moveToward(current, 0, STEER_OUT_RATE * dt);
  const rate = Math.abs(target) > Math.abs(current) ? STEER_IN_RATE : STEER_OUT_RATE;
  return moveToward(current, target, rate * dt);
}

/** Advances one kart by dt, mutating `s`. */
export function stepKart(s: KartState, input: InputFrame, p: KartParams, env: DriveEnv, dt: number): StepEvents {
  const ev: StepEvents = { hopped: false, landed: 0, driftStarted: false, boostTier: 0, wallHit: 0, launched: false, trick: false };
  s.invulnTime = Math.max(0, s.invulnTime - dt);
  s.slowTime = Math.max(0, s.slowTime - dt);
  const spinning = s.spinTime > 0;
  if (spinning) {
    // A spun-out kart is a passenger: no throttle, steer or drift until it stops.
    s.spinTime = Math.max(0, s.spinTime - dt);
    s.spinAngle += SPIN_RATE * dt * Math.min(1, s.spinTime + 0.3);
    if (s.spinTime === 0) s.spinAngle = 0;
    input = NEUTRAL_INPUT;
    s.speed = moveToward(s.speed, 0, SPIN_DECEL * dt);
  }
  let rawSteer = input.steer;
  if (s.wobbleTime > 0) {
    s.wobbleTime = Math.max(0, s.wobbleTime - dt);
    rawSteer += Math.sin(s.wobbleTime * WOBBLE_FREQ) * WOBBLE_DEPTH;
  }
  const steerIn = clamp(rawSteer, -1, 1);
  s.steer = approachSteer(s.steer, steerIn, dt);
  const steer = steerCurve(s.steer);

  // s.surface comes from last tick's probe.
  if (s.grounded && s.surface === 'boost') s.boostTime = Math.max(s.boostTime, PAD_BOOST_TIME);

  // Hop, tricks and drift.
  s.hopAge += dt;
  s.trickWindow = Math.max(0, s.trickWindow - dt);
  if (input.driftPressed && s.grounded) {
    s.vy = Math.max(s.vy, 0) + HOP_VELOCITY;
    s.grounded = false;
    s.driftArmed = true;
    s.hopAge = 0;
    ev.hopped = true;
  } else if (input.driftPressed && s.trickWindow > 0) {
    s.trick = true;
    s.trickWindow = 0;
  }
  if (!input.drift) {
    if (s.driftDir !== 0) ev.boostTier = releaseDrift(s);
    s.driftArmed = false;
  } else if (s.driftArmed && s.driftDir === 0 && Math.abs(steerIn) > 0.3 && s.speed > DRIFT_MIN_SPEED) {
    s.driftDir = steerIn > 0 ? 1 : -1;
    s.driftCharge = 0;
    ev.driftStarted = true;
  }
  if (s.driftDir !== 0 && s.speed < DRIFT_MIN_SPEED * 0.6) {
    s.driftDir = 0;
    s.driftCharge = 0;
    s.driftArmed = false;
  }
  if (s.driftDir !== 0 && s.grounded) {
    // Steering into the drift charges faster than steering out of it.
    s.driftCharge += dt * p.driftChargeRate * (0.75 + 0.25 * steerIn * s.driftDir);
  }

  // Longitudinal speed.
  const boosting = s.boostTime > 0;
  let top = p.topSpeed;
  if (boosting) top *= BOOST_SPEED_MUL;
  else if (s.surface === 'offroad') top *= OFFROAD_SPEED_MUL;
  if (s.slowTime > 0) top *= SLOW_MUL;

  if (s.grounded && !spinning) {
    const drive = boosting ? 1 : input.throttle - input.brake;
    if (drive > 0) {
      const target = top * drive;
      if (s.speed < target) {
        const ratio = clamp(s.speed / p.topSpeed, 0, 1);
        const accel = (boosting ? Math.max(p.accel, BOOST_ACCEL) : p.accel) * (1 - 0.7 * ratio * ratio);
        s.speed = moveToward(s.speed, target, (s.speed < 0 ? BRAKE_DECEL : accel) * dt);
      } else {
        s.speed = moveToward(s.speed, target, OVERSPEED_DECEL * dt);
      }
    } else if (drive < 0) {
      const rate = s.speed > 0 ? BRAKE_DECEL * -drive : REVERSE_ACCEL;
      s.speed = moveToward(s.speed, -REVERSE_MAX * -drive, rate * dt);
    } else {
      s.speed = moveToward(s.speed, 0, (s.surface === 'offroad' ? COAST_DECEL * 2 : COAST_DECEL) * dt);
    }
  }
  s.boostTime = Math.max(0, s.boostTime - dt);

  // Yaw.
  let yawRate: number;
  if (s.driftDir !== 0) {
    yawRate = s.driftDir * p.driftTurnRate * (0.75 + 0.55 * steer * s.driftDir);
  } else {
    const lowSpeed = clamp(Math.abs(s.speed) / TURN_FULL_SPEED, 0, 1);
    const highSpeedDamp = 1 - 0.25 * clamp(Math.abs(s.speed) / p.topSpeed, 0, 1);
    yawRate = steer * p.turnRate * lowSpeed * highSpeedDamp * (s.speed < 0 ? -1 : 1);
  }
  if (!s.grounded) yawRate *= AIR_STEER;
  s.heading = wrapAngle(s.heading - yawRate * dt);
  s.slip = moveToward(s.slip, s.driftDir * DRIFT_SLIP_ANGLE, SLIP_RESPONSE * dt);

  // Translate.
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  s.x += (fx * s.speed + s.extX) * dt;
  s.z += (fz * s.speed + s.extZ) * dt;
  const decay = Math.exp(-EXT_DAMPING * dt);
  s.extX *= decay;
  s.extZ *= decay;

  // Vertical. Grounded karts follow the road and carry its slope as vy,
  // so a ramp lip launches them.
  const ground = env.probe(s);
  s.surface = ground.surface;
  const drop = s.groundY - ground.height;
  s.groundY = ground.height;
  if (s.grounded) {
    if (ground.height < s.y - LEDGE_DROP) {
      s.grounded = false;
    } else {
      s.vy = clamp((ground.height - s.y) / dt, -MAX_GROUND_VY, MAX_GROUND_VY);
      s.y = ground.height;
    }
  }
  if (!s.grounded && drop > 1) {
    // Ground fell away beneath us: a lip. A hop just before it counts as a trick.
    ev.launched = true;
    if (s.hopAge < TRICK_WINDOW) s.trick = true;
    else s.trickWindow = TRICK_WINDOW;
  }
  if (!s.grounded) {
    s.vy -= GRAVITY * dt;
    s.y += s.vy * dt;
    if (s.y <= ground.height) {
      ev.landed = Math.max(0.01, -s.vy);
      s.y = ground.height;
      s.vy = 0;
      s.grounded = true;
      s.trickWindow = 0;
      if (s.trick) {
        s.trick = false;
        s.boostTime = Math.max(s.boostTime, TRICK_BOOST);
        ev.trick = true;
      }
    }
  }

  // Walls.
  const hit = env.collide(s, KART_RADIUS);
  if (hit) {
    s.x += hit.nx * hit.depth;
    s.z += hit.nz * hit.depth;
    const into = -(fx * hit.nx + fz * hit.nz) * Math.sign(s.speed);
    if (into > 0) {
      s.speed *= 1 - WALL_SPEED_LOSS * into;
      ev.wallHit = into;
    }
    const extInto = s.extX * hit.nx + s.extZ * hit.nz;
    if (extInto < 0) {
      s.extX -= 1.5 * extInto * hit.nx;
      s.extZ -= 1.5 * extInto * hit.nz;
    }
    s.extX += hit.nx * WALL_BOUNCE * Math.max(into, 0);
    s.extZ += hit.nz * WALL_BOUNCE * Math.max(into, 0);
  }

  return ev;
}

function releaseDrift(s: KartState): number {
  const tier = driftTier(s.driftCharge);
  if (tier > 0) s.boostTime = Math.max(s.boostTime, DRIFT_BOOSTS[tier - 1]);
  s.driftDir = 0;
  s.driftCharge = 0;
  return tier;
}

/** Spins a kart out (items, hazards). Returns false if it was immune. */
export function spinOut(s: KartState, duration: number): boolean {
  if (s.invulnTime > 0) return false;
  s.spinTime = duration;
  s.invulnTime = duration + 1;
  s.driftDir = 0;
  s.driftCharge = 0;
  s.driftArmed = false;
  s.boostTime = 0;
  return true;
}

/** Makes steering wobble for `duration` (Microtonal Mine). Returns false if immune. */
export function wobble(s: KartState, duration: number): boolean {
  if (s.invulnTime > 0) return false;
  s.wobbleTime = duration;
  s.invulnTime = 0.6;
  return true;
}

/** Cuts top speed for `duration` (Tempo Shift). Returns false if immune. */
export function slowDown(s: KartState, duration: number): boolean {
  if (s.invulnTime > 0) return false;
  s.slowTime = duration;
  return true;
}

/** Places a kart at rest, e.g. after falling off the track. */
export function respawnKart(s: KartState, x: number, y: number, z: number, heading: number): void {
  const hint = s.trackHint;
  Object.assign(s, createKartState(x, z, heading));
  s.y = y;
  s.groundY = y;
  s.trackHint = hint;
}

/** Adds an external velocity impulse, scaled down by the kart's mass. */
export function applyImpulse(s: KartState, p: KartParams, ix: number, iz: number): void {
  s.extX += ix / p.mass;
  s.extZ += iz / p.mass;
}
