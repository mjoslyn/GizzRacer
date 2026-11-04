import { KART_RADIUS, wobble } from '../physics/kart';
import type { Kit } from './kit';

/**
 * Empty's kit (kits/kit.ts): its hazard, its theme's generator palette,
 * and the kinds and themes it adds; its look is in empty.view.ts, its
 * layout in tracks/empty.ts and its world in render/empty.ts.
 */

declare module '../tracks/track' {
  interface KitHazards {
    /** Empty: figures wandering lazily across the road in three-four, WANDER_COUNT to a row (`at` lists each one's row), all empty but the one you're with; through an empty one, emptied; through the one you're with, a boost. */
    wanderers: { kit: 'empty'; def: { kind: 'wanderers'; at: number[]; period: number } };
  }
  interface KitLandmarks {
    metronome: 'empty';
    emptyStage: 'empty';
    shotClock: 'empty';
    companion: 'empty';
    setInStone: 'empty';
  }
  interface KitThemes {
    emptiness: 'empty';
  }
}

declare module '../tracks/builder' {
  interface KitRoadSurfaces {
    /** Empty's road: pale, worn, nothing left in it. */
    pale: 'empty';
  }
}

/**
 * Empty's wanderers: "I'm wandering around so lazily". Rows of figures
 * drifting across the road in three-four, WANDER_COUNT to a row, spread
 * evenly across it: on the one of each bar they take a step, on the two
 * and three they sway where they stand, and they come out of nothing at
 * one edge and fade to nothing at the other, the next wandering on behind
 * them. All of them empty but one: coats and hats with nobody in them,
 * pale as the morning, and in each row one who isn't, the one you're
 * with, warm. Driven into an empty one you go right through it and it
 * empties you: the colour drains out of everything, your speed bleeds
 * away and the wheel wobbles. Through the one you're with, you don't feel
 * empty: a boost.
 */
export const WANDER_COUNT = 3;
/** Bars of the waltz a wanderer takes to cross: a step on the one of each. */
export const WANDER_BARS = 8;
/** How far past each edge of the road a wanderer comes out of nothing and fades back into it. */
export const WANDER_OUT = 3;
export const WANDER_RADIUS = 1.3;
/** Each row down a stretch is this share of a crossing behind the one before. */
export const WANDER_LAG = 0.29;
/** Emptied: you keep this share of your speed, and the wheel wobbles this long. */
export const WANDER_SLOW = 0.55;
export const WANDER_WOBBLE = 0.9;
/** Through the one you're with: a boost this long. */
export const WANDER_WARM = 1.0;

/** Where wanderer `k` of row `row` is in its crossing at race time `t`, 0 to 1. */
export function wanderPhase(t: number, period: number, row: number, k: number): number {
  const tt = (t + 10) / period + k / WANDER_COUNT - row * WANDER_LAG;
  return tt - Math.floor(tt);
}

/** How far across a wanderer has come at crossing stage `u`, 0 to 1: a step on the one of each bar, standing on the two and three. */
export function wanderStep(u: number): number {
  const q = u * WANDER_BARS;
  const bar = Math.floor(q);
  const f = Math.min(1, (q - bar) * 3);
  return (bar + f * f * (3 - 2 * f)) / WANDER_BARS;
}

/** Whether wanderer `k` of row `row` is the one you're with. */
export function wanderYou(row: number, k: number): boolean {
  return k === row % WANDER_COUNT;
}

export const kit: Kit<'empty'> = {
  id: 'empty',
  hazards: {
    wanderers: {
      kind: 'wanderers',
      pose(p, def, i, t, world) {
        // A wanderer drifting across the road in three-four with the rest of its row, out of nothing at one edge and into nothing at the other; alternate rows the other way.
        const at = def.at[i];
        const row = Math.floor(i / WANDER_COUNT);
        const k = i % WANDER_COUNT;
        const u = wanderPhase(t, def.period, row, k);
        const reach = world.halfWidth(at) + WANDER_OUT;
        const dir = row % 2 ? -1 : 1;
        const lat = dir * (-reach + 2 * reach * wanderStep(u));
        world.place(p, at, lat, 0);
        p.radius = WANDER_RADIUS;
        p.side = dir;
        p.lane = wanderYou(row, k) ? 1 : 0;
        p.gap = Math.min(1, Math.max(0, (reach - Math.abs(lat)) / WANDER_OUT));
        p.active = p.gap > 0.5;
        p.phase = u;
      },
      /**
       * A wanderer: driven into an empty one, you go right through it and it
       * empties you, slowed, the wheel wobbling; through the one you're with,
       * you don't feel empty, a boost.
       */
      collide(hit, p, s, world) {
        if (!p.active || Math.hypot(s.x - p.x, s.z - p.z) > p.radius + KART_RADIUS || Math.abs(s.y - p.ground) > 2.5) return;
        if (p.lane === 1) {
          world.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, WANDER_WARM)));
          return;
        }
        if (world.cooling(s)) return;
        world.cool(s);
        if (!wobble(s, WANDER_WOBBLE)) return;
        s.speed *= WANDER_SLOW;
        hit.push({ kart: s, by: p.kind });
      },
      threats(out, p) {
        // An empty one, drifting across: steer round it (the one you're with is there to drive through).
        if (!p.active || p.lane === 1) return;
        out.push({ x: p.x, z: p.z, r: p.radius + 0.4, vx: p.vx, vz: p.vz });
      },
      // Rows of wanderers drifting across the stretch, three to a row.
      generate: ({ at, count }) => ({ kind: 'wanderers', at: at(count).flatMap((s) => [s, s, s]), period: 12 }),
      callouts: { hit: 'FEELING SO EMPTY!', bonus: "I DON'T FEEL EMPTY!" },
      sound(v) {
        // Emptied by a wanderer: a hollow sigh sliding down an octave, and the song's mechanical clicks, three to a bar, under it.
        v.tone(392, 0.9, 'sine', 0.09, 196);
        v.tone(294, 0.9, 'triangle', 0.05, 147, 0.05);
        [0, 1, 2].forEach((k) => v.tone(2600, 0.02, 'square', k === 0 ? 0.06 : 0.035, undefined, 0.2 + k * 0.25));
        v.whoosh(0.8, 900, 250, 0.1);
      },
      // Emptied: the colour drains out of everything, and comes back.
      screen: { drain: 0.9 },
    },
  },
  themes: {
    emptiness: {
      name: 'Empty',
      palette: {
        surface: 'pale',
        deck: 'pale',
        alt: 'gravel',
        hazards: ['wanderers'],
        start: 'metronome',
        landmarks: ['metronome', 'shotClock'],
        tallWalls: 6,
        places: ['Empty', 'Nothing Deep', 'Used to Be', 'Life Is Death', 'Lazy', 'Unset Stone', 'Level', 'Who?', 'Waltz'],
        music: { lap: 'empty', finalLap: 'empty-final-lap' },
      },
    },
  },
};
