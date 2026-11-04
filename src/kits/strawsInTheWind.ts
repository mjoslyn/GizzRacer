import { KART_RADIUS, spinOut } from '../physics/kart';
import type { Kit } from './kit';

/**
 * Straws in the Wind's kit (kits/kit.ts): its hazard, its theme's generator palette,
 * and the kinds and themes it adds; its look is in strawsInTheWind.view.ts, its
 * layout in tracks/strawsInTheWind.ts and its world in render/strawsInTheWind.ts.
 */

declare module '../tracks/track' {
  interface KitHazards {
    /** Straws in the Wind: gantries of mortal traffic lights over the road, changing on the waltz's three beats, green, amber, red, one after another down the stretch; through on green, a boost; caught on red, stopped dead. */
    trafficLights: { kit: 'straws-in-the-wind'; def: { kind: 'trafficLights'; at: number[]; period: number } };
  }
  interface KitLandmarks {
    strawsGate: 'straws-in-the-wind';
    trashTornado: 'straws-in-the-wind';
    cheshireGrin: 'straws-in-the-wind';
    hellsKitchen: 'straws-in-the-wind';
    forgottenPier: 'straws-in-the-wind';
    shortStraw: 'straws-in-the-wind';
  }
  interface KitThemes {
    windmill: 'straws-in-the-wind';
  }
}

declare module '../tracks/builder' {
  interface KitRoadSurfaces {
    /** Straws in the Wind's road: a farm track through the flower fields, straw blown across it. */
    farmtrack: 'straws-in-the-wind';
  }
}

/**
 * Straws in the Wind's mortal traffic lights: "mortal traffic lights
 * signalling when to stay or go". A gantry of lights over the road, swaying
 * in the gale, changing on the waltz's three beats: green on the one (go),
 * amber on the two, red on the three (stay). Down a stretch each gantry
 * changes a little after the one before, so a green wave rolls down the
 * road at about a fast kart's pace. Under one while it shows green, a
 * boost; caught under one on red, you're stopped dead: spun round, most of
 * your speed gone. Amber does nothing but warn.
 */
export const LIGHT_STAGES = { amber: 1 / 3, red: 2 / 3 } as const;
/** How far along the road a gantry's stop line reaches either side of it. */
export const LIGHT_DEPTH = 2.4;
/** Each gantry down a stretch changes this share of a bar after the one before. */
export const LIGHT_LAG = 0.21;
/** Through on green: a boost this long. */
export const LIGHT_GO = 0.9;
/** Caught on red: spun this long, keeping this share of your speed. */
export const LIGHT_SPIN = 0.8;
export const LIGHT_SLOW = 0.3;

/** Where gantry `i` of a stretch of traffic lights is in its bar at race time `t`, 0 to 1. */
export function lightPhase(t: number, period: number, i: number): number {
  const tt = (t + 10) / period - i * LIGHT_LAG;
  return tt - Math.floor(tt);
}

/** Which light a gantry shows at bar stage `u`: 0 green, 1 amber, 2 red. */
export function lightColour(u: number): 0 | 1 | 2 {
  return u < LIGHT_STAGES.amber ? 0 : u < LIGHT_STAGES.red ? 1 : 2;
}

export const kit: Kit<'straws-in-the-wind'> = {
  id: 'straws-in-the-wind',
  hazards: {
    trafficLights: {
      kind: 'trafficLights',
      sheet: true,
      pose(p, def, i, t, world) {
        // A gantry of lights over the road, changing on the waltz's beats a little after the one before it.
        const at = def.at[i];
        const u = lightPhase(t, def.period, i);
        world.place(p, at, 0, 0);
        p.radius = world.halfWidth(at);
        p.lane = lightColour(u);
        p.active = p.lane === 2;
        // How far through its beat the light is, 0 to 1.
        p.gap = (u * 3) % 1;
        // The gale rocks each gantry its own way.
        p.side = i % 2 ? -1 : 1;
        p.phase = u;
      },
      /**
       * A mortal traffic light: under it on green, go, a boost; caught under it
       * on red, stay: stopped dead, spun round, most of your speed gone. Amber
       * only warns.
       */
      collide(hit, p, s, world) {
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const along = (s.x - p.x) * fx + (s.z - p.z) * fz;
        const lat = (s.x - p.x) * -fz + (s.z - p.z) * fx;
        if (Math.abs(along) > LIGHT_DEPTH + KART_RADIUS || Math.abs(lat) > p.radius + KART_RADIUS) return;
        if (p.lane === 0) {
          world.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, LIGHT_GO)));
          return;
        }
        if (!p.active || world.cooling(s)) return;
        world.cool(s);
        if (!spinOut(s, LIGHT_SPIN)) return;
        s.speed *= LIGHT_SLOW;
        hit.push({ kart: s, by: p.kind });
      },
      // Gantries of traffic lights down the stretch, changing on the waltz one after another.
      generate: ({ at, count }) => ({ kind: 'trafficLights', at: at(count), period: 2.4 }),
      callouts: { hit: 'RED: STAY!', bonus: 'GREEN: GO!' },
      sound(v) {
        // Caught on a red light: brakes squealing, the gale gusting, and the crossing's flat beeps telling you to stay, three of them, one a beat.
        v.tone(1900, 0.45, 'sawtooth', 0.05, 1100);
        v.whoosh(0.7, 600, 2600, 0.2);
        [0, 1, 2].forEach((k) => v.tone(880, 0.12, 'square', 0.06, undefined, 0.3 + k * 0.26));
      },
    },
  },
  themes: {
    windmill: {
      name: 'Straws in the Wind',
      palette: {
        surface: 'farmtrack',
        deck: 'farmtrack',
        alt: 'gravel',
        hazards: ['trafficLights'],
        start: 'strawsGate',
        landmarks: ['trashTornado', 'cheshireGrin'],
        tallWalls: 6,
        places: ['Straw', 'Black Heart', 'Brim', 'Cheshire', 'Pandemonium', 'Allegro', 'Expendable', "Hell's Kitchen", 'Omen', 'Forgotten Pier'],
        music: { lap: 'straws-in-the-wind', finalLap: 'straws-in-the-wind-final-lap' },
      },
    },
  },
};
