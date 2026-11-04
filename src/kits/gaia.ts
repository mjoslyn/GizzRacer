import { KART_RADIUS, wobble } from '../physics/kart';
import { launch } from '../items/hazardBase';
import type { Kit } from './kit';

/**
 * Gaia's kit (kits/kit.ts): its hazard, its theme's generator palette,
 * and the kinds and themes it adds; its look is in gaia.view.ts, its
 * layout in tracks/gaia.ts and its world in render/gaia.ts.
 */

declare module '../tracks/track' {
  interface KitHazards {
    /** Gaia: her ribs heaving under the road on the riff, all in one breath; rise with one and it throws you on, caught as it falls and you sink with it. */
    breaths: { kit: 'gaia'; def: { kind: 'breaths'; at: number[]; period: number } };
  }
  interface KitLandmarks {
    gaiaHands: 'gaia';
    gaiaFace: 'gaia';
    parasites: 'gaia';
    elements: 'gaia';
    gaiaHeart: 'gaia';
    deadEarth: 'gaia';
    luckyRainbow: 'gaia';
  }
  interface KitThemes {
    gaia: 'gaia';
  }
}

declare module '../tracks/builder' {
  interface KitRoadSurfaces {
    /** Gaia's road: the Earth's own skin, soil and rock. */
    earth: 'gaia';
  }
}

/**
 * Gaia breathes: her ribs, under the skin of the road, heave across it all
 * in one breath on the riff. Each breath she draws in (her ribs swell up
 * into a ridge right across the road, the cracks in it glowing as she
 * starts), holds it, and lets it out: the ridge sinks back down through
 * the road into a trough, her breath blowing dust out of the cracks, and
 * fills again. Over a rib as it rises or while it's held, it throws you
 * on: up, with a boost. Caught as it falls, you sink with it: your speed
 * bleeds into the earth and the wheel wobbles. The ribs are a fast kart's
 * breath apart, so one that meets the first as it rises meets them all so.
 */
export const BREATH_STAGES = { inhale: 0.18, full: 0.5, exhale: 0.6, empty: 0.8 } as const;
/** How high a rib swells over the road, and how deep the trough it sinks to. */
export const BREATH_RISE = 2;
export const BREATH_SINK = 1.2;
/** How far along the road a rib reaches either side of its crest. */
export const BREATH_DEPTH = 4;
/** Thrown on by a rib as it rises: up this fast (m/s), and a boost this long. */
export const BREATH_THROW = 10;
export const BREATH_BOOST = 0.7;
/** Caught as it falls: you keep this share of your speed, and the wheel wobbles this long. */
export const BREATH_SLOW = 0.55;
export const BREATH_WOBBLE = 0.8;

/** Where Gaia's breath is at race time `t`, 0 to 1: every rib breathes together. */
export function breathPhase(t: number, period: number): number {
  const tt = (t + 10) / period;
  return tt - Math.floor(tt);
}

/** How high a rib stands over the road at stage `u` (negative: a trough): flat at rest, swelling as she breathes in, held, sinking right through as she breathes out, and filling again. */
export function breathLift(u: number): number {
  const B = BREATH_STAGES;
  if (u < B.inhale) return 0;
  if (u < B.full) {
    const k = (u - B.inhale) / (B.full - B.inhale);
    return BREATH_RISE * k * k * (3 - 2 * k);
  }
  if (u < B.exhale) return BREATH_RISE;
  if (u < B.empty) {
    const k = (u - B.exhale) / (B.empty - B.exhale);
    return BREATH_RISE - (BREATH_RISE + BREATH_SINK) * Math.sin((Math.PI * k) / 2);
  }
  const k = (u - B.empty) / (1 - B.empty);
  return -BREATH_SINK * (1 - k * k * (3 - 2 * k));
}

export const kit: Kit<'gaia'> = {
  id: 'gaia',
  hazards: {
    breaths: {
      kind: 'breaths',
      sheet: true,
      pose(p, def, i, t, world) {
        // One of Gaia's ribs across the road, heaving with all the others in one breath.
        const at = def.at[i];
        const u = breathPhase(t, def.period);
        world.place(p, at, 0, 0);
        p.radius = world.halfWidth(at);
        p.side = i % 2 ? -1 : 1;
        p.active = u >= BREATH_STAGES.exhale && u < BREATH_STAGES.empty;
        p.lane = u >= BREATH_STAGES.inhale && u < BREATH_STAGES.exhale ? 1 : 0;
        p.gap = breathLift(u);
        p.phase = u;
      },
      /**
       * One of Gaia's ribs: over it as it rises or while it's held, it throws
       * you on, up and with a boost; caught as it falls, you sink with it,
       * slowed, the wheel wobbling.
       */
      collide(hit, p, s, world) {
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const along = (s.x - p.x) * fx + (s.z - p.z) * fz;
        const lat = (s.x - p.x) * -fz + (s.z - p.z) * fx;
        if (Math.abs(along) > BREATH_DEPTH + KART_RADIUS || Math.abs(lat) > p.radius + KART_RADIUS) return;
        if (p.lane === 1) {
          // The rib lifts whoever is on it; the boost is paid once in a while.
          if (s.grounded) launch(s, BREATH_THROW * Math.min(1, 0.5 + p.gap / BREATH_RISE));
          world.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, BREATH_BOOST)));
          return;
        }
        if (!p.active || world.cooling(s)) return;
        world.cool(s);
        if (!wobble(s, BREATH_WOBBLE)) return;
        s.speed *= BREATH_SLOW;
        hit.push({ kart: s, by: p.kind });
      },
      // Gaia's ribs across the stretch, all heaving in one breath.
      generate: ({ at, count }) => ({ kind: 'breaths', at: at(count), period: 2.5 }),
      callouts: { hit: 'GAIA EXHALES!', bonus: 'GAIA BREATHES!' },
      sound(v) {
        // Caught as Gaia breathes out: the ground groaning low as it sinks under you, and her breath rushing out of the earth.
        v.tone(49, 1.0, 'sawtooth', 0.12, 36, 0, true);
        v.tone(62, 0.8, 'triangle', 0.08, 41, 0.05);
        v.hit(0.3, 160, 0.5);
        v.whoosh(0.9, 700, 180, 0.22);
      },
    },
  },
  themes: {
    gaia: {
      name: 'Gaia',
      palette: {
        surface: 'earth',
        deck: 'earth',
        alt: 'scorched',
        liquid: 'oil',
        hazards: ['breaths'],
        start: 'gaiaHands',
        landmarks: ['parasites', 'deadEarth'],
        tallWalls: 6,
        places: ['Gaia', 'Parasite', 'Dirt', 'Carrion', 'Eclipse', 'Downpour', 'Black Wave', 'Bequest', 'No One'],
        music: { lap: 'gaia', finalLap: 'gaia-final-lap' },
      },
    },
  },
};
