import { clamp, wrapAngle } from '../core/math';
import type { InputFrame } from '../core/inputFrame';
import type { RoadFrame } from '../tracks/track';
import { STEER_EXPO, type KartState } from './kart';

/**
 * Smart steering, after Mario Kart's: a hand on the wheel for the player.
 * It looks a moment ahead and steers back in before the kart runs off an
 * edge (firmly at an open edge or a drop, lightly at a wall), and with the
 * stick let go it eases the nose back in line with the road, so a kart
 * coming out of a turn straightens up instead of carrying on sideways.
 * The player can always steer through it, and a stick held toward an edge
 * is taken as meaning it: the correction fades with the stick and is gone
 * at full lock, so a track without a wall can still be left on purpose.
 */

/** How hard the hand on the wheel is: a level for a keyboard or a stick, and a firmer one for touch, where steering is a thumb on glass. */
export interface AssistLevel {
  /** Seconds ahead it looks for the edge. */
  lookAhead: number;
  /** Metres in from the edge it starts to steer back. */
  edgeMargin: number;
  /** Its strongest correction at an open edge, and at a wall. */
  openPush: number;
  wallPush: number;
  /** Straightening: how far out of line (rad) it helps with, how hard, and how much at most (as turning, after the stick's response curve). */
  alignRange: number;
  alignGain: number;
  alignMax: number;
}

export const ASSIST_NORMAL: AssistLevel = { lookAhead: 0.45, edgeMargin: 1.5, openPush: 0.8, wallPush: 0.35, alignRange: 0.35, alignGain: 1.5, alignMax: 0.3 };
/** On touch: it looks further ahead, steers back sooner and harder, and straightens up more. */
export const ASSIST_TOUCH: AssistLevel = { lookAhead: 0.65, edgeMargin: 2.5, openPush: 1, wallPush: 0.6, alignRange: 0.5, alignGain: 2.2, alignMax: 0.45 };

/** Metres past the margin for its full correction. */
const EDGE_RAMP = 2.5;
/** Straightening fades out on bends this tight (rad/m) and beyond: there the turn is the player's. */
const ALIGN_BEND = 0.02;
/** A stick this far off centre is the player steering. */
const STEER_DEADZONE = 0.12;
const MIN_SPEED = 5;
/** How far past the edge it looks for more road (past the curb). */
const BEYOND = 2.5;

/** Where it steers: the road the kart is on, and whether there's road at a point (a shortcut peeling off, a junction). */
export interface AssistEnv {
  roadFrame(s: KartState): RoadFrame | null;
  locate(x: number, z: number, y: number, hint?: number): { onRoad: boolean };
}

export function assistSteer(input: InputFrame, s: KartState, env: AssistEnv, level: AssistLevel = ASSIST_NORMAL): InputFrame {
  if (!s.grounded || s.spinTime > 0 || s.cannonTime > 0 || s.speed < MIN_SPEED) return input;
  const road = env.roadFrame(s);
  if (!road) return input;
  const tl = Math.hypot(road.tx, road.tz) || 1;
  const tx = road.tx / tl;
  const tz = road.tz / tl;
  // Right of travel is (-tz, tx); positive steer turns right.
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  const vx = fx * s.speed + s.extX;
  const vz = fz * s.speed + s.extZ;
  const sideways = vx * -tz + vz * tx;
  let steer = input.steer;

  // Heading for the edge: steer back in.
  const ahead = road.lateral + sideways * level.lookAhead;
  const over = Math.abs(ahead) - (road.halfWidth - level.edgeMargin);
  if (over > 0 && Math.sign(sideways) === Math.sign(road.lateral || ahead) && !roadBeyond(s, vx, vz, tx, tz, ahead, road, env, level.lookAhead)) {
    // A stick held toward the edge is the player meaning to leave the road (a cut across the grass, a leap off a
    // ledge): the hand on the wheel lets go by as much as the stick says, and at full lock not at all.
    const intent = clamp(Math.sign(ahead) * input.steer, 0, 1);
    steer -= Math.sign(ahead) * clamp(over / EDGE_RAMP, 0, 1) * (road.walled ? level.wallPush : level.openPush) * (1 - intent);
  }

  // Stick let go, not drifting: ease the nose back in line with the road.
  if (Math.abs(input.steer) < STEER_DEADZONE && s.driftDir === 0) {
    const err = wrapAngle(s.heading - Math.atan2(tx, tz));
    if (Math.abs(err) < level.alignRange) {
      const straight = 1 - clamp(Math.abs(road.curvature) / ALIGN_BEND, 0, 1);
      // Undo the stick's response curve (stepKart), so small corrections still turn.
      const turn = clamp(err * level.alignGain, -level.alignMax, level.alignMax) * straight;
      steer += Math.sign(turn) * Math.abs(turn) ** (1 / STEER_EXPO);
    }
  }
  steer = clamp(steer, -1, 1);
  return steer === input.steer ? input : { ...input, steer };
}

/** Is there more road just past this one's edge where the kart's heading: a branch to take, not an edge to save it from? */
function roadBeyond(s: KartState, vx: number, vz: number, tx: number, tz: number, ahead: number, road: RoadFrame, env: AssistEnv, lookAhead: number): boolean {
  const side = Math.sign(ahead);
  const out = side * (road.halfWidth + BEYOND) - ahead;
  const x = s.x + vx * lookAhead - tz * out;
  const z = s.z + vz * lookAhead + tx * out;
  return env.locate(x, z, s.y, s.trackHint).onRoad;
}
