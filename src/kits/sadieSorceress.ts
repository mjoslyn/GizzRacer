import { KART_RADIUS, spinOut } from '../physics/kart';
import type { Kit } from './kit';

/**
 * Sadie Sorceress's kit (kits/kit.ts): its hazard, its theme's generator palette,
 * and the kinds and themes it adds; its look is in sadieSorceress.view.ts, its
 * layout in tracks/sadieSorceress.ts and its world in render/sadieSorceress.ts.
 */

declare module '../tracks/track' {
  interface KitHazards {
    /** Sadie Sorceress: Sadie on her broomstick, circling high off one edge cackling, then swooping down across the road at kart height on a slant and up and away the other side, a trail of sparks behind her; caught by her broomstick, snapped and spun; in her slipstream just behind her, a boost. */
    brooms: { kit: 'sadie-sorceress'; def: { kind: 'brooms'; at: number[]; period: number } };
  }
  interface KitLandmarks {
    rinkGate: 'sadie-sorceress';
    sadieColossus: 'sadie-sorceress';
    quidditchHoops: 'sadie-sorceress';
    masquerade: 'sadie-sorceress';
    flightPath: 'sadie-sorceress';
    poisonGarden: 'sadie-sorceress';
    grannyCottage: 'sadie-sorceress';
    pitchforkMob: 'sadie-sorceress';
    duckingStool: 'sadie-sorceress';
    bigTop: 'sadie-sorceress';
    poisonPool: 'sadie-sorceress';
  }
  interface KitThemes {
    sorceress: 'sadie-sorceress';
  }
}

declare module '../tracks/builder' {
  interface KitRoadSurfaces {
    /** Sadie Sorceress's road: an 80s roller rink floor. */
    rink: 'sadie-sorceress';
  }
}

/**
 * Sadie Sorceress's broomstick, "snapping necks with her broomstick getting
 * tortuous": Sadie circling high over one side of the road, cackling (the
 * warning: that's the side she'll come from), then swooping down out of the
 * sky across the road at kart height on a slant, a trail of sparks in her
 * slipstream, and up and away the other side, where she circles again until
 * she comes back the other way. Caught by her broomstick, snapped and spun.
 * Tucked into her slipstream just behind her as she crosses, a boost.
 */
export const BROOM_STAGES = { dive: 0.52, away: 0.8 } as const;
/** She starts her swoop this far out past the road's edge, this high, and skims across it this high. */
export const BROOM_OUT = 11;
export const BROOM_HIGH = 12;
export const BROOM_LOW = 1.1;
/** She circles this wide while she waits. */
export const BROOM_CIRCLE = 6;
/** How far along the road her swoop slants, from one side to the other. */
export const BROOM_SLANT = 8;
/** The broomstick from her: its tip this far ahead, its bristles this far behind, this thick either side. */
export const BROOM_HEAD = 2.1;
export const BROOM_TAIL = 1.7;
export const BROOM_RADIUS = 0.8;
/** Her slipstream: this far back behind the bristles, this wide either side of her line. */
export const BROOM_WAKE = 10;
export const BROOM_WAKE_WIDTH = 2.6;
export const BROOM_SPIN = 1.1;
export const BROOM_BOOST = 1.0;
/** Each station down the stretch swoops this share of a period after the one before, so a fast kart in one slipstream meets the next. */
export const BROOM_LAG = 0.3;

/** Where Sadie of station `i` is in her cycle at race time `t` (0 to 1), which cycle it is, and which way she crosses this time (1 to the right). */
export function broomPhase(t: number, period: number, i: number): { u: number; cycle: number; side: number } {
  const tt = (t + 10) / period - i * BROOM_LAG;
  const cycle = Math.floor(tt);
  return { u: tt - cycle, cycle, side: (cycle + i) % 2 === 0 ? 1 : -1 };
}

/** Her height over the road at `lateral`: skimming across it, climbing steeply out past its edges. */
export function broomHeight(lateral: number, reach: number): number {
  const out = Math.max(0, Math.abs(lateral) - reach - 1) / (BROOM_OUT - 1);
  return BROOM_LOW + (BROOM_HIGH - BROOM_LOW) * Math.min(1, out) ** 2;
}

/**
 * Where Sadie is at cycle stage `u` crossing toward `side`, in the road's
 * frame at her station: `along` the road, `lateral` (to the right), `height`
 * over the road, and whether she's swooping (`swoop`, and how far across, `f`
 * from 0 to 1). The road is `reach` wide either side of its centre. Before
 * her dive she circles high off the edge she'll come from; after it, off the
 * edge she went to, until the next.
 */
export function broomCourse(u: number, side: number, reach: number): { along: number; lateral: number; height: number; swoop: boolean; f: number } {
  const S = BROOM_STAGES;
  const R = reach + BROOM_OUT;
  const c = BROOM_CIRCLE;
  const a0 = -BROOM_SLANT / 2;
  if (u >= S.dive && u < S.away) {
    const f = (u - S.dive) / (S.away - S.dive);
    const lateral = side * (-R + 2 * R * f);
    return { along: a0 + BROOM_SLANT * f, lateral, height: broomHeight(lateral, reach), swoop: true, f };
  }
  // Circling: from where the last swoop came out (the far end of its slant) twice round, to where this one sets off.
  const span = 1 - S.away + S.dive;
  const v = u < S.dive ? (u + 1 - S.away) / span : (u - S.away) / span;
  // The edge she circles off: before the dive, the one she'll come from; after it, the one she went to.
  const edge = u < S.dive ? -side : side;
  const psi = 4 * Math.PI * v;
  const from = -a0;
  const to = a0;
  return {
    along: from + (to - from) * v + c * Math.sin(psi),
    lateral: edge * (R + c - c * Math.cos(psi)),
    height: BROOM_HIGH + 2 * Math.sin(Math.PI * v),
    swoop: false,
    f: u < S.dive ? 0 : 1,
  };
}

export const kit: Kit<'sadie-sorceress'> = {
  id: 'sadie-sorceress',
  hazards: {
    brooms: {
      kind: 'brooms',
      pose(p, def, i, t, world) {
        // Sadie circling high off one edge, then swooping down across the road on her broomstick and up and away off the other.
        const at = def.at[i];
        const { u, side } = broomPhase(t, def.period, i);
        const reach = world.halfWidth(at);
        const c = broomCourse(u, side, reach);
        // Which way she's flying: where she'll be a moment from now, in the road's frame.
        const next = broomPhase(t + 0.02, def.period, i);
        const d = broomCourse(next.u, next.side, reach);
        world.place(p, at + c.along, c.lateral, c.height);
        // Her heading: the road's, turned toward the way she's flying (a lateral to the right is a turn to the right, -h).
        p.heading -= Math.atan2(d.lateral - c.lateral, d.along - c.along);
        p.radius = BROOM_RADIUS;
        p.side = side;
        p.gap = c.lateral;
        // Down skimming the road: snapping distance.
        p.active = c.swoop && c.height < 2.6;
        // Her slipstream, over the road behind her, while she swoops.
        p.lane = c.swoop ? 1 : 0;
        p.phase = u;
      },
      /**
       * Sadie swooping across the road on her broomstick: caught by it, tip to
       * bristles, as she skims across, snapped and spun; tucked into her
       * slipstream just behind the bristles as she crosses, a boost.
       */
      collide(hit, p, s, world) {
        if (p.lane !== 1) return;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const along = (s.x - p.x) * fx + (s.z - p.z) * fz;
        const across = Math.abs((s.x - p.x) * -fz + (s.z - p.z) * fx);
        if (p.active && along >= -BROOM_TAIL - BROOM_RADIUS - KART_RADIUS && along <= BROOM_HEAD + BROOM_RADIUS + KART_RADIUS) {
          const d = Math.hypot(Math.max(0, Math.abs(along - (BROOM_HEAD - BROOM_TAIL) / 2) - (BROOM_HEAD + BROOM_TAIL) / 2), across);
          if (d <= BROOM_RADIUS + KART_RADIUS) {
            if (world.cooling(s)) return;
            world.cool(s);
            if (spinOut(s, BROOM_SPIN)) hit.push({ kart: s, by: p.kind });
            return;
          }
        }
        // Her slipstream: behind the bristles, along her line, while she's down skimming the road.
        if (p.y - p.ground > 3) return;
        const behind = -along - BROOM_TAIL - BROOM_RADIUS;
        if (behind < 0 || behind > BROOM_WAKE || across > BROOM_WAKE_WIDTH || s.speed < 8 || world.cooling(s)) return;
        world.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, BROOM_BOOST)));
      },
      threats(out, p) {
        // Sadie skimming across the road, broomstick tip to bristles.
        if (!p.active) return;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        for (const d of [BROOM_HEAD, 0, -BROOM_TAIL]) out.push({ x: p.x + fx * d, z: p.z + fz * d, r: 1.4, vx: p.vx, vz: p.vz });
      },
      // Sadie swooping across the stretch at one station after another, the other way each time.
      generate: ({ at, count }) => ({ kind: 'brooms', at: at(count), period: 4.6 }),
      callouts: { hit: 'NECK SNAPPED!', bonus: 'MORE FLY THAN QUIDDITCH!' },
      sound(v) {
        // Snapped by Sadie's broomstick: the whoosh of her coming down past you, the crack of the broom, and her cackle, a witch's laugh tumbling down in four notes.
        v.whoosh(0.4, 600, 3200, 0.22);
        v.hit(0.08, 2400, 0.5);
        [1175, 988, 1175, 880].forEach((f, k) => v.tone(f, 0.08, 'square', 0.05, f * 0.8, 0.12 + k * 0.09));
      },
    },
  },
  themes: {
    sorceress: {
      name: 'Sadie Sorceress',
      palette: {
        surface: 'rink',
        deck: 'rink',
        hazards: ['brooms'],
        start: 'rinkGate',
        landmarks: ['rinkGate', 'quidditchHoops'],
        tallWalls: 6,
        places: ['Witch', 'Quidditch', 'Tinnie', 'Rink', 'Masquerade', 'Cauldron', 'Handbag', 'Knapsack', 'Cardigan', 'Nightshade', 'Oleander', 'Buttercup', 'Broomstick', 'Pitchfork', 'Circus'],
        music: { lap: 'sadie-sorceress', finalLap: 'sadie-sorceress-final-lap' },
      },
    },
  },
};
