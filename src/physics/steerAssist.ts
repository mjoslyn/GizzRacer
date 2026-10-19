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
 * The player can always steer through it.
 */

/** Seconds ahead it looks for the edge. */
const LOOK_AHEAD = 0.45;
/** Metres in from the edge it starts to steer back. */
const EDGE_MARGIN = 1.5;
/** Metres past that margin for its full correction. */
const EDGE_RAMP = 2.5;
/** Its strongest correction at an open edge, and at a wall. */
const OPEN_PUSH = 0.8;
const WALL_PUSH = 0.35;
/** Straightening: how far out of line (rad) it helps with, how hard, and how much at most (as turning, after the stick's response curve). */
const ALIGN_RANGE = 0.35;
const ALIGN_GAIN = 1.5;
const ALIGN_MAX = 0.3;
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

export function assistSteer(input: InputFrame, s: KartState, env: AssistEnv): InputFrame {
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
  const ahead = road.lateral + sideways * LOOK_AHEAD;
  const over = Math.abs(ahead) - (road.halfWidth - EDGE_MARGIN);
  if (over > 0 && Math.sign(sideways) === Math.sign(road.lateral || ahead) && !roadBeyond(s, vx, vz, tx, tz, ahead, road, env)) {
    steer -= Math.sign(ahead) * clamp(over / EDGE_RAMP, 0, 1) * (road.walled ? WALL_PUSH : OPEN_PUSH);
  }

  // Stick let go, not drifting: ease the nose back in line with the road.
  if (Math.abs(input.steer) < STEER_DEADZONE && s.driftDir === 0) {
    const err = wrapAngle(s.heading - Math.atan2(tx, tz));
    if (Math.abs(err) < ALIGN_RANGE) {
      const straight = 1 - clamp(Math.abs(road.curvature) / ALIGN_BEND, 0, 1);
      // Undo the stick's response curve (stepKart), so small corrections still turn.
      const turn = clamp(err * ALIGN_GAIN, -ALIGN_MAX, ALIGN_MAX) * straight;
      steer += Math.sign(turn) * Math.abs(turn) ** (1 / STEER_EXPO);
    }
  }
  steer = clamp(steer, -1, 1);
  return steer === input.steer ? input : { ...input, steer };
}

/** Is there more road just past this one's edge where the kart's heading: a branch to take, not an edge to save it from? */
function roadBeyond(s: KartState, vx: number, vz: number, tx: number, tz: number, ahead: number, road: RoadFrame, env: AssistEnv): boolean {
  const side = Math.sign(ahead);
  const out = side * (road.halfWidth + BEYOND) - ahead;
  const x = s.x + vx * LOOK_AHEAD - tz * out;
  const z = s.z + vz * LOOK_AHEAD + tx * out;
  return env.locate(x, z, s.y, s.trackHint).onRoad;
}
