import { NEUTRAL_INPUT, type InputFrame } from '../core/inputFrame';
import { clamp, seededRandom, wrapAngle } from '../core/math';
import { CABLE_RANGE, FLUTE_CONE, FLUTE_RANGE, HARMONICA_CONE, HARMONICA_RANGE, LASER_RANGE, LASER_WIDTH, inCone, type ItemKind } from '../items/items';
import { DRIFT_MIN_SPEED, DRIFT_YAW_BASE, DRIFT_YAW_STEER, driftTier, type KartState } from '../physics/kart';
import type { EngineClass, KartParams } from '../physics/racers';
import { pointAt } from '../tracks/spline';
import type { Ribbon, Track } from '../tracks/track';

/** How well a CPU drives; difficulty follows the engine class (spec section 8). */
export interface CpuSkill {
  /** Fraction of top speed the CPU holds itself to. */
  speedCap: number;
  /** Chance of drifting through a corner that allows it. */
  driftChance: number;
  /** Highest spark tier the CPU will hold a drift for. */
  maxTier: number;
  /** How much the CPU wanders off its line, 0..1. */
  wander: number;
  /** 0..1: how often items are saved for a good moment, and how keenly hazards are dodged. */
  itemIq: number;
}

/** Something on the road to steer around: a hazard or a dropped mine. */
export interface Obstacle {
  x: number;
  z: number;
  r: number;
  vx: number;
  vz: number;
}

export const CPU_SKILL: Record<EngineClass, CpuSkill> = {
  '50cc': { speedCap: 0.9, driftChance: 0.35, maxTier: 1, wander: 1, itemIq: 0.25 },
  '100cc': { speedCap: 0.95, driftChance: 0.65, maxTier: 2, wander: 0.7, itemIq: 0.55 },
  '150cc': { speedCap: 1, driftChance: 0.9, maxTier: 3, wander: 0.45, itemIq: 0.85 },
};

/** Drives a finished player's kart round to the line. */
export const AUTOPILOT_SKILL: CpuSkill = { speedCap: 0.9, driftChance: 0, maxTier: 1, wander: 0.2, itemIq: 0.6 };

const STEER_GAIN = 2.8;
/** Heading change ahead (rad) worth drifting for. */
const DRIFT_TURN = 0.75;
const STUCK_TIME = 1.2;
/** How hard a drifting CPU yaws into its own outward slide (rad/s per m/s of slide). */
const DRIFT_CATCH = 0.25;
/** A CPU that isn't waiting for a good moment fires its item after this long, give or take. */
const ITEM_HOLD_MIN = 1;
const ITEM_HOLD_SPREAD = 4;
/** Even a patient CPU uses its item eventually. */
const ITEM_HOLD_MAX = 9;

/**
 * Follows the main centerline on its own preferred lane, slows for corners
 * it can't hold, drifts for mini-turbos and edges around karts ahead.
 */
export class CpuDriver {
  private readonly rand: () => number;
  private readonly lane: number;
  private readonly phase: number;
  private drifting = false;
  private driftAge = 0;
  private driftDir: -1 | 1 = 1;
  private wantTier = 1;
  private cornerDecided = false;
  private stuck = 0;
  private reversing = 0;
  private itemPlan: { item: ItemKind; smart: boolean; at: number } | null = null;

  constructor(
    readonly skill: CpuSkill,
    seed: number,
  ) {
    this.rand = seededRandom(seed);
    this.lane = (this.rand() - 0.5) * 0.9;
    this.phase = this.rand() * Math.PI * 2;
  }

  /** One roll against a chance, on this driver's own dice (rocket starts, tricks, dodges). */
  roll(chance: number): boolean {
    return this.rand() < chance;
  }

  drive(s: KartState, p: KartParams, progress: number, track: Track, others: readonly KartState[], obstacles: readonly Obstacle[], dt: number): InputFrame {
    const ribbon = track.main;
    const speed = Math.max(s.speed, 0);

    if (this.reversing > 0) {
      this.reversing -= dt;
      return { ...NEUTRAL_INPUT, brake: 1, steer: this.lane > 0 ? 1 : -1 };
    }
    this.stuck = speed < 1.5 ? this.stuck + dt : 0;
    if (this.stuck > STUCK_TIME) {
      this.stuck = 0;
      this.reversing = 0.8;
    }

    // Aim point: ahead on the centerline, shifted onto this driver's lane.
    const look = 8 + speed * 0.45;
    const hw = ribbon.halfWidthAtS(progress + look);
    let lateral = (this.lane + Math.sin(progress / 70 + this.phase) * 0.3 * this.skill.wander) * hw;
    lateral += avoid(s, others);
    lateral += dodge(s, obstacles, lateral, progress, ribbon, 0.35 + 0.65 * this.skill.itemIq);
    lateral = clamp(lateral, -(hw - 2), hw - 2);
    const aim = pointAt(ribbon.spline, progress + look);
    const tl = Math.hypot(aim.tx, aim.tz) || 1;
    const ax = aim.x - (aim.tz / tl) * lateral;
    const az = aim.z + (aim.tx / tl) * lateral;
    const err = wrapAngle(Math.atan2(ax - s.x, az - s.z) - s.heading);

    const turnAhead = ribbon.turnBetween(progress, progress + 30 + speed * 0.3);
    const curv = ribbon.maxCurvature(progress, progress + 20 + speed * 0.6);

    const input: InputFrame = { ...NEUTRAL_INPUT, throttle: this.skill.speedCap, steer: clamp(-err * STEER_GAIN, -1, 1) };
    this.updateDrift(s, p, input, err, turnAhead, ribbon, progress, dt);

    // Lift or brake for corners the kart can't hold at this speed.
    const capacity = this.drifting ? p.driftTurnRate * (DRIFT_YAW_BASE + DRIFT_YAW_STEER) : p.turnRate * (1 - 0.25 * Math.min(1, speed / p.topSpeed));
    const required = speed * curv;
    if (required > capacity * 1.05) input.throttle = 0;
    if (required > capacity * 1.45 && speed > 12 && !this.drifting) input.brake = 1;
    return input;
  }

  /**
   * Whether to fire the held item this tick. Smart picks wait for a good
   * moment (a straight for the Mind Fuzz, a kart on its tail for a mine,
   * company for the Nuclear Fusion); the rest fire after a random wait.
   */
  wantsItem(item: ItemKind, held: number, s: KartState, position: number, progress: number, track: Track, others: readonly KartState[]): boolean {
    if (this.itemPlan?.item !== item) {
      this.itemPlan = { item, smart: this.rand() < this.skill.itemIq, at: ITEM_HOLD_MIN + this.rand() * ITEM_HOLD_SPREAD };
    }
    const plan = this.itemPlan;
    if (!plan.smart) return held >= plan.at;
    if (held >= ITEM_HOLD_MAX) return true;
    if (held < 0.3) return false;
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    let near = 0;
    let tailing = false;
    for (const o of others) {
      if (o === s) continue;
      const dx = o.x - s.x;
      const dz = o.z - s.z;
      const d = Math.hypot(dx, dz);
      if (d < 6.5) near++;
      const ahead = dx * fx + dz * fz;
      if (ahead < -2 && ahead > -18 && Math.abs(dx * -fz + dz * fx) < 4) tailing = true;
    }
    switch (item) {
      case 'fuzzPedal':
        return s.grounded && s.driftDir === 0 && Math.abs(track.main.turnBetween(progress, progress + 40)) < 0.25;
      case 'microtonalMine':
        return tailing;
      case 'feedbackWave':
        return near > 0;
      case 'riffMissile':
        return position > 1;
      case 'tempoShift':
      case 'wooCannon':
      case 'gizzardWave':
        return true;
      case 'fluteFlurry':
        return others.some((o) => o !== s && inCone(s, o, FLUTE_RANGE, FLUTE_CONE));
      case 'harmonicaWail':
        return others.some((o) => o !== s && inCone(s, o, HARMONICA_RANGE, HARMONICA_CONE));
      case 'keytarLaser':
        return others.some((o) => o !== s && inCone(s, o, LASER_RANGE, 0.5) && Math.abs((o.x - s.x) * fz - (o.z - s.z) * fx) < LASER_WIDTH);
      case 'drumRoll':
        return near > 0 || tailing || others.some((o) => o !== s && inCone(s, o, 12, 0.6));
      case 'bassDrop':
        return position > 1;
      case 'patchCable':
        return position > 1 && others.some((o) => o !== s && inCone(s, o, CABLE_RANGE * 0.8, 0.9));
    }
  }

  /** Call once the held item is gone, so the next one gets a fresh plan. */
  forgetItem(): void {
    this.itemPlan = null;
  }

  private updateDrift(s: KartState, p: KartParams, input: InputFrame, err: number, turnAhead: number, ribbon: Ribbon, progress: number, dt: number): void {
    if (Math.abs(turnAhead) < 0.3) this.cornerDecided = false;

    if (!this.drifting) {
      const worth = Math.abs(turnAhead) > DRIFT_TURN && s.speed > DRIFT_MIN_SPEED + 4 && s.grounded;
      if (worth && !this.cornerDecided) {
        this.cornerDecided = true;
        if (this.rand() < this.skill.driftChance) {
          this.drifting = true;
          this.driftAge = 0;
          // Positive turn is left, and a left drift is driftDir -1.
          this.driftDir = turnAhead > 0 ? -1 : 1;
          this.wantTier = 1 + Math.floor(this.rand() * this.skill.maxTier);
          input.drift = input.driftPressed = true;
          input.steer = this.driftDir;
        }
      }
      return;
    }

    this.driftAge += dt;
    input.drift = true;
    if (s.driftDir === 0) {
      // Still in the hop: commit to the direction, and give up if it never catches.
      input.steer = this.driftDir;
      if (this.driftAge > 0.5) this.endDrift(input);
      return;
    }

    // Steer within the drift for the yaw the road needs, mapped through the
    // drift's own steer response (see stepKart).
    // A drift slides out wide of the nose (stepKart): yaw harder into it to catch the slide.
    const slide = -s.extX * Math.cos(s.heading) + s.extZ * Math.sin(s.heading);
    const wantYaw = -(s.speed * ribbon.curvatureAt(progress)) - err * 3 - slide * DRIFT_CATCH;
    const dir = s.driftDir;
    input.steer = clamp((dir * ((wantYaw * dir) / p.driftTurnRate - DRIFT_YAW_BASE)) / DRIFT_YAW_STEER, -1, 1);

    const straightening = Math.abs(turnAhead) < 0.35;
    const reversed = wantYaw * dir < -0.4; // the road now bends the other way
    if ((driftTier(s.driftCharge) >= this.wantTier && straightening) || (straightening && this.driftAge > 1.2) || reversed || this.driftAge > 4) {
      this.endDrift(input);
    }
  }

  private endDrift(input: InputFrame): void {
    this.drifting = false;
    input.drift = false;
  }
}

/**
 * Lateral nudge (in lane meters, like `lateral`) around the first obstacle
 * the planned line would hit.
 */
function dodge(s: KartState, obstacles: readonly Obstacle[], lateral: number, progress: number, ribbon: Ribbon, keen: number): number {
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  const span = 6 + Math.max(s.speed, 0) * 1.1;
  const speed = Math.max(s.speed, 5);
  let best: { ahead: number; x: number; z: number; r: number; vx: number; vz: number } | null = null;
  for (const o of obstacles) {
    const ahead0 = (o.x - s.x) * fx + (o.z - s.z) * fz;
    if (ahead0 < -o.r || ahead0 > span) continue;
    // Where it will be when we get there.
    const closing = speed - (o.vx * fx + o.vz * fz);
    const eta = closing > 1 ? Math.max(0, ahead0) / closing : 0;
    const x = o.x + o.vx * eta;
    const z = o.z + o.vz * eta;
    const ahead = (x - s.x) * fx + (z - s.z) * fz;
    if (ahead < 1 || ahead > span) continue;
    if (!best || ahead < best.ahead) best = { ahead, x, z, r: o.r, vx: o.vx, vz: o.vz };
  }
  if (!best) return 0;
  // Where the obstacle sits across the road, in the same terms as `lateral` (positive = right).
  const a = pointAt(ribbon.spline, progress + best.ahead);
  const tl = Math.hypot(a.tx, a.tz) || 1;
  const obsLat = ((best.x - a.x) * -a.tz + (best.z - a.z) * a.tx) / tl;
  const clear = best.r + 2.4;
  const gap = lateral - obsLat;
  if (Math.abs(gap) > clear) return 0;
  const hw = ribbon.halfWidthAtS(progress + best.ahead);
  // Pass behind something crossing the road, else on the side we're already on.
  const latVel = (best.vx * -a.tz + best.vz * a.tx) / tl;
  let dir = Math.abs(latVel) > 1 ? -Math.sign(latVel) : gap >= 0 ? 1 : -1;
  if (obsLat + dir * clear > hw - 1.5) dir = -1;
  else if (obsLat + dir * clear < -(hw - 1.5)) dir = 1;
  return (obsLat + dir * clear - lateral) * keen;
}

/** Lateral nudge away from karts just ahead. */
function avoid(s: KartState, others: readonly KartState[]): number {
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  let nudge = 0;
  for (const o of others) {
    if (o === s) continue;
    const dx = o.x - s.x;
    const dz = o.z - s.z;
    const ahead = dx * fx + dz * fz;
    const side = dx * -fz + dz * fx; // positive = to our right
    if (ahead > 0 && ahead < 12 && Math.abs(side) < 2.6) nudge += side > 0 ? -3 : 3;
  }
  return nudge;
}
