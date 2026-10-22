import { NEUTRAL_INPUT, type InputFrame } from '../core/inputFrame';
import { clamp, moveToward, wrapAngle } from '../core/math';
import type { KartParams } from './racers';

export type SurfaceType = 'road' | 'offroad' | 'boost' | 'ice' | 'oil';

export interface WallHit {
  nx: number; // push-out normal
  nz: number;
  depth: number;
  /** A bar across a shut shortcut: it stops a kart dead rather than turning it along itself (there's a road past its end). */
  bar?: boolean;
}

export interface GroundInfo {
  height: number;
  surface: SurfaceType;
  /** Gravity here as a share of the usual (a low-gravity stretch); 1 when absent. */
  gravity?: number;
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
  wobbleTime: number; // seconds of wobbly steering left (Microtonal Banana)
  slowTime: number; // seconds of reduced top speed left (Horology)
  invulnTime: number; // seconds of immunity left after being hit
  cannonTime: number; // seconds of Woo Cannon flight left: the race flies the kart, not stepKart
  ramTime: number; // seconds of Road Train left: immune, a little faster, spins out whoever it touches
  trickStreak: number; // tricks landed back to back
  trickChain: number; // seconds left to land the next trick and keep the streak
  wallTime: number; // seconds since a wall impact still counted as the same one
  wallAlign: number; // seconds left of the wall turning the nose along itself after a hit
  wallTx: number; // the direction along the wall the nose is being turned to
  wallTz: number;
  lap: number; // the lap it's on, 1 first: some roads are only there on some laps (set by the race)
  lastLap: boolean; // on the last lap of a race of more than one
}

export interface StepEvents {
  hopped: boolean;
  landed: number; // impact speed, 0 if no landing
  driftStarted: boolean;
  boostTier: number; // 0 none, 1..3 drift tier released this tick
  wallHit: number; // 0..1 severity
  launched: boolean; // left a ledge or ramp lip
  trick: boolean; // landed a trick
  trickStreak: number; // its place in a streak of back-to-back tricks, 1 for a lone one
}

/**
 * Bump whenever kart physics, racer stats or a track layout change lap
 * times: online leaderboards and ghosts are kept per version.
 */
export const PHYSICS_VERSION = 18;
export const KART_RADIUS = 1;
export const GRAVITY = 30;
export const HOP_VELOCITY = 4.5;
export const OFFROAD_SPEED_MUL = 0.6;
export const BOOST_SPEED_MUL = 1.35;
export const BOOST_ACCEL = 30;
export const PAD_BOOST_TIME = 1;
export const DRIFT_MIN_SPEED = 10;
/**
 * Charge thresholds (s) and boost durations (s) for blue, orange, purple
 * and rainbow sparks. Rainbow is the expert's edge: a purple held on
 * through the rest of the corner, for the longest boost in the game.
 */
export const DRIFT_TIERS = [0.15, 0.3, 0.475, 0.8] as const;
export const DRIFT_BOOSTS = [0.5, 1, 1.5, 2.1] as const;
/** Top speed multiplier while slowed by Horology. */
export const SLOW_MUL = 0.6;
const SPIN_DECEL = 22;
const SPIN_RATE = 14; // rad/s of visual spin
const WOBBLE_FREQ = 15; // rad/s
const WOBBLE_DEPTH = 0.85;
export const TRICK_WINDOW = 0.3;
export const TRICK_BOOST = 0.7;
/** Land the next trick within this many seconds to keep a streak going; each trick in it boosts longer, up to the cap. */
export const TRICK_CHAIN = 3;
export const TRICK_STREAK_BONUS = 0.4;
export const TRICK_STREAK_MAX = 4;
/** Top speed multiplier while in a Road Train. */
export const RAM_SPEED_MUL = 1.1;

/** Steering ramps in gradually (fine taps) and recenters quickly. */
const STEER_IN_RATE = 3.5;
const STEER_OUT_RATE = 10;
/** Response curve exponent: small inputs turn gently, full lock is unchanged. */
export const STEER_EXPO = 1.6;
/** A drop bigger than this under the kart counts as leaving a ledge. */
const LEDGE_DROP = 0.3;
const MAX_GROUND_VY = 20;
/**
 * Over a crest, a kart whose road drops away faster than gravity can pull
 * it down by more than this (m/s) leaves the road with the climb it had:
 * airtime, and a trick window like a ramp lip.
 */
const CREST_SLACK = 3;
const TURN_FULL_SPEED = 6;
const AIR_STEER = 0.6;
const BRAKE_DECEL = 24;
const COAST_DECEL = 6;
const OVERSPEED_DECEL = 15;
const REVERSE_MAX = 8;
const REVERSE_ACCEL = 10;
/** How far the nose points into a drift (visual yaw): a kart sideways through the corner, the Mario Kart way. */
const DRIFT_SLIP_ANGLE = 0.25;
/**
 * Mario Kart's drift: a steady arc you hold through the corner. With the
 * stick centred it's gentler than full lock gripping; steering in tightens
 * it to about full lock, steering out opens it right up.
 */
export const DRIFT_YAW_BASE = 0.62;
export const DRIFT_YAW_STEER = 0.33;
const SLIP_RESPONSE = 3;
/**
 * How fast a slide dies away (1/s), by direction. Sideways momentum (the
 * skid out wide) lingers, so the kart carries it out of the corner and on
 * past the point where the steering stopped; the share pointing back along
 * the kart (the scrub) is taken up quickly by the engine, so a long drift
 * loses some speed but not a third of it.
 */
const EXT_DAMPING_SIDE = 3;
const EXT_DAMPING_ALONG = 8;
/**
 * The share of each turn's momentum that keeps going the old way, by
 * surface: karts skid wide through every turn, plenty on the road, more on
 * dirt, almost all of it on ice. In a steady turn the skid settles at
 * yaw * slide / EXT_DAMPING_SIDE of the speed, sideways: full lock on the
 * road travels about 12 degrees outside the nose.
 */
const SLIDE: Record<SurfaceType, number> = { road: 0.45, boost: 0.45, offroad: 0.55, ice: 0.8, oil: 0.75 };
/**
 * Drifting, more of the momentum keeps going the old way than when the
 * tires grip: the kart slides out wide of its nose (about 25 degrees in a
 * steady drift), and the harder it's steered into the drift, the further
 * out it slides.
 */
const DRIFT_SLIDE = 0.15;
const DRIFT_HARD_SLIDE = 0.15;
/** The outward lurch as a drift catches: this share of the speed, sideways, the hop's momentum breaking the tires loose. */
const DRIFT_KICK = 0.2;
/**
 * Counter-steering in a drift (steering against it) throws the tail out: an
 * outward push of this share of the speed per second at full opposite lock,
 * on top of the arc opening up, so the kart slides wide and sideways
 * instead of just turning less.
 */
const DRIFT_COUNTER_PUSH = 1.6;
/**
 * Walls: an impact costs speed (a little even glancing, most of it
 * square-on) and bounces the kart back off with some of the speed it hit
 * with; a glancing one also turns the nose along the wall, so the kart
 * glances off instead of grinding along it. Contact after that only scrapes,
 * and a graze barely touches the line.
 */
const WALL_SPEED_LOSS = 0.6;
const WALL_MIN_LOSS = 0.2;
const WALL_RESTITUTION = 0.3;
const WALL_BOUNCE = 2.5;
/** Speed lost per second scraping along a wall, square-on. */
const WALL_SCRAPE = 1.5;
/** Seconds after an impact before contact counts as another. */
const WALL_RECOVER = 0.3;
/** A touch shallower than this (cosine of the angle off the wall's normal) is a graze: a little speed and a nudge off, no bounce. */
const WALL_GRAZE = 0.25;
const GRAZE_LOSS = 0.7;
const GRAZE_PUSH = 4;
/** A hit this square-on bounces the kart straight back. */
const WALL_SQUARE = 0.85;
/** A glancing hit turns the nose along the wall and this far (rad) away from it. */
const WALL_GLANCE = 0.06;
/** After a hit the wall turns the nose along itself at this rate (rad/s), for this long times how square the hit was. */
const WALL_ALIGN = 3.5;
const WALL_ALIGN_TIME = 0.7;

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
    cannonTime: 0,
    ramTime: 0,
    trickStreak: 0,
    trickChain: 0,
    wallTime: 0,
    wallAlign: 0,
    wallTx: 0,
    wallTz: 1,
    lap: 1,
    lastLap: false,
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
  const ev: StepEvents = { hopped: false, landed: 0, driftStarted: false, boostTier: 0, wallHit: 0, launched: false, trick: false, trickStreak: 0 };
  // A zero-length step moves nothing; the slopes below divide by dt.
  if (dt <= 0) return ev;
  s.invulnTime = Math.max(0, s.invulnTime - dt);
  s.ramTime = Math.max(0, s.ramTime - dt);
  s.trickChain = Math.max(0, s.trickChain - dt);
  if (s.trickChain === 0) s.trickStreak = 0;
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
    // The kart breaks loose outward (a right drift slides left) before the turn gathers it in.
    const kick = s.speed * DRIFT_KICK * p.slide;
    s.extX += s.driftDir * Math.cos(s.heading) * kick;
    s.extZ -= s.driftDir * Math.sin(s.heading) * kick;
  }
  // Too slow, or off the road: the drift is lost, charge and all.
  if (s.driftDir !== 0 && (s.speed < DRIFT_MIN_SPEED * 0.6 || (s.grounded && s.surface === 'offroad'))) {
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
  if (s.ramTime > 0) top *= RAM_SPEED_MUL;

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
    yawRate = s.driftDir * p.driftTurnRate * (DRIFT_YAW_BASE + DRIFT_YAW_STEER * steer * s.driftDir);
  } else {
    const lowSpeed = clamp(Math.abs(s.speed) / TURN_FULL_SPEED, 0, 1);
    const highSpeedDamp = 1 - 0.25 * clamp(Math.abs(s.speed) / p.topSpeed, 0, 1);
    yawRate = steer * p.turnRate * lowSpeed * highSpeedDamp * (s.speed < 0 ? -1 : 1);
  }
  if (!s.grounded) yawRate *= AIR_STEER;
  const turned = yawRate * dt;
  s.heading = wrapAngle(s.heading - turned);
  s.slip = moveToward(s.slip, s.driftDir * DRIFT_SLIP_ANGLE, SLIP_RESPONSE * dt);

  // Translate.
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  if (s.grounded && turned !== 0) {
    // The kart turns but its momentum doesn't all follow, so it skids wide; a drift slides out further,
    // and a kart with less handling slides out further still (p.slide, from the racer's stat).
    let slide = SLIDE[s.surface];
    if (s.driftDir !== 0) slide += DRIFT_SLIDE + DRIFT_HARD_SLIDE * clamp(steerIn * s.driftDir, 0, 1);
    slide = Math.min(0.98, slide * p.slide);
    s.extX += (Math.sin(s.heading + turned) - fx) * s.speed * slide;
    s.extZ += (Math.cos(s.heading + turned) - fz) * s.speed * slide;
  }
  if (s.grounded && s.driftDir !== 0) {
    // Steering against the drift throws the tail out: an outward push (a right drift slides left) that grows with the opposite lock.
    const counter = clamp(-steerIn * s.driftDir, 0, 1);
    if (counter > 0) {
      const push = s.speed * DRIFT_COUNTER_PUSH * p.slide * counter * dt;
      s.extX += s.driftDir * fz * push;
      s.extZ -= s.driftDir * fx * push;
    }
  }
  s.x += (fx * s.speed + s.extX) * dt;
  s.z += (fz * s.speed + s.extZ) * dt;
  // The skid decays by direction: sideways it lingers, back along the kart it's soon driven out.
  const along = (s.extX * fx + s.extZ * fz) * Math.exp(-EXT_DAMPING_ALONG * dt);
  const side = (s.extX * fz - s.extZ * fx) * Math.exp(-EXT_DAMPING_SIDE * dt);
  s.extX = along * fx + side * fz;
  s.extZ = along * fz - side * fx;

  // Vertical. Grounded karts follow the road and carry its slope as vy,
  // so a ramp lip launches them.
  const ground = env.probe(s);
  s.surface = ground.surface;
  const gravity = GRAVITY * (ground.gravity ?? 1);
  const drop = s.groundY - ground.height;
  s.groundY = ground.height;
  let crest = false;
  if (s.grounded) {
    if (ground.height < s.y - LEDGE_DROP) {
      s.grounded = false;
    } else {
      const vy = clamp((ground.height - s.y) / dt, -MAX_GROUND_VY, MAX_GROUND_VY);
      if (vy < s.vy - gravity * dt - CREST_SLACK) {
        // Off the top of a hill: away into the air, still rising as it was.
        s.grounded = false;
        crest = true;
      } else {
        s.vy = vy;
        s.y = ground.height;
      }
    }
  }
  if (!s.grounded && (drop > 1 || crest)) {
    // Ground fell away beneath us: a lip. A hop just before it counts as a trick.
    ev.launched = true;
    if (s.hopAge < TRICK_WINDOW) s.trick = true;
    else s.trickWindow = TRICK_WINDOW;
  }
  if (!s.grounded) {
    s.vy -= gravity * dt;
    s.y += s.vy * dt;
    if (s.y <= ground.height) {
      ev.landed = Math.max(0.01, -s.vy);
      s.y = ground.height;
      // Land moving with the road (down a slope it falls away): from a standstill the next tick would read as a crest and hop again.
      // Never moving up, though: ground higher than last tick's probe (a curb, a rising road) would read as a launch next tick.
      s.vy = Math.abs(drop) < 2 && dt > 0 ? clamp(-drop / dt, -MAX_GROUND_VY, 0) : 0;
      s.grounded = true;
      s.trickWindow = 0;
      if (s.trick) {
        s.trick = false;
        // Back-to-back tricks boost longer and longer.
        s.trickStreak = Math.min(TRICK_STREAK_MAX, s.trickStreak + 1);
        s.trickChain = TRICK_CHAIN;
        s.boostTime = Math.max(s.boostTime, TRICK_BOOST * (1 + TRICK_STREAK_BONUS * (s.trickStreak - 1)));
        ev.trick = true;
        ev.trickStreak = s.trickStreak;
      }
    }
  }

  // Walls: slow down and bounce off.
  s.wallTime = Math.max(0, s.wallTime - dt);
  const hit = env.collide(s, KART_RADIUS);
  if (hit) {
    s.x += hit.nx * hit.depth;
    s.z += hit.nz * hit.depth;
    const dir = Math.sign(s.speed);
    const into = -(fx * hit.nx + fz * hit.nz) * dir;
    // Whatever was carrying the kart into the wall (a slide, a bump) stops there.
    const extInto = s.extX * hit.nx + s.extZ * hit.nz;
    if (extInto < 0) {
      s.extX -= extInto * hit.nx;
      s.extZ -= extInto * hit.nz;
    }
    if (into > 0 && into < WALL_GRAZE) {
      // A graze: shaved speed and a nudge away, the line kept.
      s.speed *= 1 - GRAZE_LOSS * into;
      s.extX += hit.nx * GRAZE_PUSH * into;
      s.extZ += hit.nz * GRAZE_PUSH * into;
      ev.wallHit = into;
    } else if (into >= WALL_GRAZE && s.wallTime === 0) {
      const vIn = Math.abs(s.speed) * into;
      const out = WALL_BOUNCE + vIn * WALL_RESTITUTION;
      if (into >= WALL_SQUARE) {
        // Square-on: thrown straight back, rolling backwards off the wall.
        s.speed = -dir * out;
      } else {
        s.speed *= 1 - (WALL_MIN_LOSS + (WALL_SPEED_LOSS - WALL_MIN_LOSS) * into);
        s.extX += hit.nx * out;
        s.extZ += hit.nz * out;
        if (dir > 0) {
          // Glancing: the nose turns along the wall and a touch away from it.
          const along = Math.atan2(fx + hit.nx * into, fz + hit.nz * into);
          const away = Math.sign(wrapAngle(Math.atan2(hit.nx, hit.nz) - along)) * WALL_GLANCE;
          s.heading = wrapAngle(along + away);
        }
      }
      s.wallTime = WALL_RECOVER;
      ev.wallHit = into;
      if (!hit.bar) {
        // Which way along the wall to turn: the way the nose already leans, the steering deciding a dead-square hit.
        const lean = fx * -hit.nz + fz * hit.nx;
        const side = Math.abs(lean) > 0.05 ? Math.sign(lean) : steerIn !== 0 ? -Math.sign(steerIn) : 1;
        s.wallTx = -hit.nz * side;
        s.wallTz = hit.nx * side;
        s.wallAlign = WALL_ALIGN_TIME * into;
      }
    } else if (into > 0) {
      s.speed *= 1 - WALL_SCRAPE * into * dt;
    }
  }

  // After a hit the wall turns the nose along itself, so a kart that nosed in comes round to run beside the wall
  // instead of sitting square against it, nosing in again every time the throttle is touched.
  if (s.wallAlign > 0) {
    s.wallAlign = Math.max(0, s.wallAlign - dt);
    const delta = wrapAngle(Math.atan2(s.wallTx, s.wallTz) - s.heading);
    s.heading = wrapAngle(s.heading + clamp(delta, -WALL_ALIGN * dt, WALL_ALIGN * dt));
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

/** Makes steering wobble for `duration` (Microtonal Banana). Returns false if immune. */
export function wobble(s: KartState, duration: number): boolean {
  if (s.invulnTime > 0) return false;
  s.wobbleTime = duration;
  s.invulnTime = 0.6;
  return true;
}

/** Cuts top speed for `duration` (Horology). Returns false if immune. */
export function slowDown(s: KartState, duration: number): boolean {
  if (s.invulnTime > 0) return false;
  s.slowTime = duration;
  return true;
}

/** Places a kart at rest, e.g. after falling off the track. */
export function respawnKart(s: KartState, x: number, y: number, z: number, heading: number): void {
  const { trackHint, lap, lastLap } = s;
  Object.assign(s, createKartState(x, z, heading), { trackHint, lap, lastLap });
  s.y = y;
  s.groundY = y;
}

/** Adds an external velocity impulse, scaled down by the kart's mass. */
export function applyImpulse(s: KartState, p: KartParams, ix: number, iz: number): void {
  s.extX += ix / p.mass;
  s.extZ += iz / p.mass;
}
