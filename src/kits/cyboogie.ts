import { KART_RADIUS, spinOut } from '../physics/kart';
import { HOP_WINDOW, launch } from '../items/hazardBase';
import type { Kit } from './kit';

/**
 * Cyboogie's kit (kits/kit.ts): its hazard, its theme's generator palette,
 * and the kinds and themes it adds; its look is in cyboogie.view.ts, its
 * layout in tracks/cyboogie.ts and its world in render/cyboogie.ts.
 */

declare module '../tracks/track' {
  interface KitHazards {
    /**
     * Cyboogie: pistons under the graphene lattice punching up through the road
     * on the boogie's beat, PISTON_LANES to a row across it (`at` lists each
     * piston's row, in lane order from the left), the four in a row one after
     * another like an arpeggio; caught as one punches up, you're thrown and
     * spun; driven into one standing at the top of its stroke, spun; hopped
     * onto it there, you ride it, a boost.
     */
    pistons: { kit: 'cyboogie'; def: { kind: 'pistons'; at: number[]; period: number } };
  }
  interface KitLandmarks {
    cyboogieGate: 'cyboogie';
    cyborgHead: 'cyboogie';
    cyborgHeart: 'cyboogie';
    fishHook: 'cyboogie';
    binaryBrook: 'cyboogie';
    hanTyumi: 'cyboogie';
    debugLane: 'cyboogie';
  }
  interface KitThemes {
    cyborg: 'cyboogie';
  }
}

declare module '../tracks/builder' {
  interface KitRoadSurfaces {
    /** Cyboogie's road: graphene lattice over the cyborg's pistons and pumps. */
    graphene: 'cyboogie';
  }
}

/**
 * Cyboogie's pistons: "pistons and pumps under graphene lattice". Rows of
 * PISTON_LANES pistons across the road, flush in the graphene, that punch up
 * through it one after another on the four beats of the boogie's bar, left to
 * right down one row and right to left down the next, like the song's
 * arpeggio, each row a beat behind the one before. Each piston hisses and its
 * ring glows red (the warning, harmless), punches up (caught over it, you're
 * thrown and spun), stands at the top of its stroke a while (a chrome column:
 * driven into, you're spun; hopped onto, you ride it, up and on with a
 * boost), and drops back flush.
 */
/** Pistons to a row, across the road. */
export const PISTON_LANES = 4;
export const PISTON_STAGES = { top: 0.07, drop: 0.42, down: 0.52, warn: 0.8 } as const;
export const PISTON_RADIUS = 2.6;
/** How high a piston stands at the top of its stroke. */
export const PISTON_LIFT = 1.6;
/** Caught as it punches up: thrown up this fast (m/s), spun this long, and this much of your speed kept. */
export const PISTON_THROW = 8;
export const PISTON_SPIN = 1.0;
export const PISTON_SLOW = 0.55;
/** Driven into one standing at the top of its stroke: spun this long, this much of your speed kept. */
export const PISTON_BUMP = 0.8;
export const PISTON_BUMP_SLOW = 0.6;
/** Hopped onto at the top of its stroke: ridden up this fast (m/s), and a boost this long. */
export const PISTON_RIDE = 11;
export const PISTON_BOOST = 0.9;

/** The beat of the bar (0 to PISTON_LANES - 1) the piston in lane `lane` of row `row` punches up on: an arpeggio up one row and down the next, each row a beat behind. */
export function pistonBeat(row: number, lane: number, lanes: number): number {
  const step = row % 2 ? lanes - 1 - lane : lane;
  return (step + row) % lanes;
}

/** Where a piston is in its stroke at race time `t`, 0 to 1: 0 as it punches up. */
export function pistonPhase(t: number, period: number, beat: number, lanes: number): number {
  const tt = (t + 10) / period - beat / lanes;
  return tt - Math.floor(tt);
}

/** How far up a piston stands at stroke stage `u`, 0 (flush) to 1 (the top of its stroke). */
export function pistonLift(u: number): number {
  const P = PISTON_STAGES;
  if (u < P.top) return Math.sin(((u / P.top) * Math.PI) / 2);
  if (u < P.drop) return 1;
  if (u < P.down) return 1 - (u - P.drop) / (P.down - P.drop);
  return 0;
}

export const kit: Kit<'cyboogie'> = {
  id: 'cyboogie',
  hazards: {
    pistons: {
      kind: 'pistons',
      pose(p, def, i, t, world) {
        // A piston in its row across the road, punching up on its beat of the bar.
        const at = def.at[i];
        const lane = i % PISTON_LANES;
        const row = Math.floor(i / PISTON_LANES);
        const hw = world.halfWidth(at);
        const u = pistonPhase(t, def.period, pistonBeat(row, lane, PISTON_LANES), PISTON_LANES);
        const lift = pistonLift(u);
        world.place(p, at, -hw + ((lane + 0.5) * 2 * hw) / PISTON_LANES, lift * PISTON_LIFT);
        p.radius = PISTON_RADIUS;
        p.lane = lane;
        p.gap = lift;
        p.active = u < PISTON_STAGES.drop;
        p.phase = u;
      },
      /**
       * A piston: over it as it punches up, you're thrown and spun; driven into
       * it at the top of its stroke, spun; hopped onto it there (or as it
       * punches up), you ride it: up, and on with a boost.
       */
      collide(hit, p, s, world) {
        if (!p.active || Math.hypot(s.x - p.x, s.z - p.z) > p.radius + KART_RADIUS) return;
        if ((s.hopAge < HOP_WINDOW || !s.grounded) && !world.cooling(s)) {
          world.reward(hit, s, p.kind, () => {
            launch(s, PISTON_RIDE);
            s.boostTime = Math.max(s.boostTime, PISTON_BOOST);
          });
          return;
        }
        const pumping = p.phase < PISTON_STAGES.top;
        if (!pumping) world.pushOut(p, s);
        if (world.cooling(s)) return;
        world.cool(s);
        if (!spinOut(s, pumping ? PISTON_SPIN : PISTON_BUMP)) return;
        if (pumping) launch(s, PISTON_THROW);
        s.speed *= pumping ? PISTON_SLOW : PISTON_BUMP_SLOW;
        hit.push({ kart: s, by: p.kind });
      },
      threats(out, p) {
        // From its hiss until it drops back flush: the piston, punching up or standing.
        if (p.phase >= PISTON_STAGES.drop && p.phase < PISTON_STAGES.warn) return;
        out.push({ x: p.x, z: p.z, r: p.radius + 0.5, vx: 0, vz: 0 });
      },
      // Rows of pistons across the stretch, punching up through it on the boogie's beat, PISTON_LANES to a row.
      generate: ({ at, count }) => ({ kind: 'pistons', at: at(count).flatMap((s) => Array.from({ length: PISTON_LANES }, () => s)), period: 2 }),
      callouts: { hit: 'TERMINAL ERROR!', bonus: 'CYBOOGIE!' },
      sound(v) {
        // A piston punching up under you: the hiss of its steam, the clank of steel, and a vocoder's arpeggio tumbling down an octave, out of time.
        v.whoosh(0.35, 5200, 1400, 0.22);
        v.hit(0.16, 1600, 0.55);
        v.tone(196, 0.12, 'square', 0.06, undefined, 0.02, true);
        [784, 659, 523, 392, 330, 262].forEach((f, k) => v.tone(f, 0.07, 'sawtooth', 0.05, undefined, 0.08 + k * 0.06));
      },
    },
  },
  themes: {
    cyborg: {
      name: 'Cyboogie',
      palette: {
        surface: 'graphene',
        deck: 'graphene',
        alt: 'steel',
        hazards: ['pistons'],
        start: 'cyboogieGate',
        landmarks: ['cyboogieGate', 'hanTyumi'],
        tallWalls: 6,
        places: ['Grey Matter', 'Brine', 'Bouncy Ball', 'Cables', 'De-bug', 'Graphene', 'Palpitations', 'Binary Brook', 'Red-Bellied Trout'],
        music: { lap: 'cyboogie', finalLap: 'cyboogie-final-lap' },
      },
    },
  },
};
