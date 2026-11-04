import { TRICK_WINDOW, type KartState } from '../physics/kart';

/**
 * What every hazard plays by, the game's own (items/hazards.ts) and the
 * track kits' (src/kits): kept apart from the HazardSystem so a kit can use
 * them without importing it.
 */

/** A kart a hazard hit can't be hit again for this long. */
export const HIT_COOLDOWN = 1;
/** A reward can't pay out again to the same kart for this long. */
export const REWARD_COOLDOWN = 1.5;
/** A hop this recent (or being in the air) counts as hopping a hazard. */
export const HOP_WINDOW = 0.35;

/** Throws a kart up at `vy` (m/s), with a trick window. */
export function launch(s: KartState, vy: number): void {
  s.grounded = false;
  s.vy = Math.max(s.vy, vy);
  s.trickWindow = TRICK_WINDOW;
}
