import type { InputFrame } from '../core/input';
import { clamp, moveToward, wrapAngle } from '../core/math';
import type { KartParams } from './racers';

export type SurfaceType = 'road' | 'offroad' | 'boost';

export interface WallHit {
  nx: number; // push-out normal
  nz: number;
  depth: number;
}

/** What the kart controller needs to know about the world. */
export interface DriveEnv {
  surfaceAt(x: number, z: number): SurfaceType;
  groundHeight(x: number, z: number): number;
  collide(x: number, z: number, radius: number): WallHit | null;
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
}

export interface StepEvents {
  hopped: boolean;
  landed: number; // impact speed, 0 if no landing
  driftStarted: boolean;
  boostTier: number; // 0 none, 1..3 drift tier released this tick
  wallHit: number; // 0..1 severity
}

export const KART_RADIUS = 1;
export const GRAVITY = 30;
export const HOP_VELOCITY = 4.5;
export const OFFROAD_SPEED_MUL = 0.6;
export const BOOST_SPEED_MUL = 1.35;
export const BOOST_ACCEL = 30;
export const PAD_BOOST_TIME = 1;
export const DRIFT_MIN_SPEED = 10;
/** Charge thresholds (s) and boost durations (s) for blue, orange, purple sparks. */
export const DRIFT_TIERS = [0.7, 1.4, 2.2] as const;
export const DRIFT_BOOSTS = [0.5, 1, 1.5] as const;

const STEER_RESPONSE = 8;
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

/** Advances one kart by dt, mutating `s`. */
export function stepKart(s: KartState, input: InputFrame, p: KartParams, env: DriveEnv, dt: number): StepEvents {
  const ev: StepEvents = { hopped: false, landed: 0, driftStarted: false, boostTier: 0, wallHit: 0 };
  const steerIn = clamp(input.steer, -1, 1);
  s.steer = moveToward(s.steer, steerIn, STEER_RESPONSE * dt);

  s.surface = env.surfaceAt(s.x, s.z);
  if (s.grounded && s.surface === 'boost') s.boostTime = Math.max(s.boostTime, PAD_BOOST_TIME);

  // Hop and drift.
  if (input.driftPressed && s.grounded) {
    s.vy = HOP_VELOCITY;
    s.grounded = false;
    s.driftArmed = true;
    ev.hopped = true;
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

  if (s.grounded) {
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
    yawRate = s.driftDir * p.driftTurnRate * (0.75 + 0.55 * steerIn * s.driftDir);
  } else {
    const lowSpeed = clamp(Math.abs(s.speed) / TURN_FULL_SPEED, 0, 1);
    const highSpeedDamp = 1 - 0.25 * clamp(Math.abs(s.speed) / p.topSpeed, 0, 1);
    yawRate = s.steer * p.turnRate * lowSpeed * highSpeedDamp * (s.speed < 0 ? -1 : 1);
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

  // Vertical.
  const ground = env.groundHeight(s.x, s.z);
  if (s.grounded && s.y > ground + 0.05) s.grounded = false;
  if (!s.grounded) {
    s.vy -= GRAVITY * dt;
    s.y += s.vy * dt;
    if (s.y <= ground) {
      ev.landed = Math.max(0.01, -s.vy);
      s.y = ground;
      s.vy = 0;
      s.grounded = true;
    }
  } else {
    s.y = ground;
  }

  // Walls.
  const hit = env.collide(s.x, s.z, KART_RADIUS);
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

/** Adds an external velocity impulse, scaled down by the kart's mass. */
export function applyImpulse(s: KartState, p: KartParams, ix: number, iz: number): void {
  s.extX += ix / p.mass;
  s.extZ += iz / p.mass;
}
