import { spinOut, KART_RADIUS } from '../physics/kart';
import type { Kit } from './kit';

/**
 * Automation's kit (kits/kit.ts): its hazard, its theme's generator palette,
 * and the kinds and themes it adds; its look is in automation.view.ts, its
 * layout in tracks/automation.ts and its world in render/automation.ts.
 */

declare module '../tracks/track' {
  interface KitHazards {
    /** Automation: the presses, gantries across the production line stamping its lanes in turn on the beat, two down at a time; under a head as it slams, stamped; through a lane in the half beat before its head comes down, beating the machine, a boost. */
    presses: { kit: 'automation'; def: { kind: 'presses'; at: number[]; period: number } };
  }
  interface KitLandmarks {
    timeClock: 'automation';
    robotArms: 'automation';
    emptyOffice: 'automation';
    screenWall: 'automation';
    assemblyDeck: 'automation';
    algorithm: 'automation';
    pinkSlips: 'automation';
    serverFarm: 'automation';
    lightsOut: 'automation';
    /** A stretch of the lap dressed in layers: props, set piece, air and words (by the section it starts in). */
    factoryField: 'automation';
    /** The ring of chimneys and lit factory blocks standing round the world. */
    factorySkyline: 'automation';
  }
  interface KitThemes {
    automated: 'automation';
  }
}

declare module '../tracks/builder' {
  interface KitRoadSurfaces {
    /** Automation's road: a conveyor belt, rubber over rollers, chevrons pointing the way. */
    conveyor: 'automation';
  }
}

/**
 * Automation's presses: a gantry across the road carrying PRESS_LANES
 * hydraulic heads side by side. Each head stamps once a bar, on its own
 * beat (PRESS_ORDER: the lane that comes down on beats one to four), and
 * stays down for two beats, so two lanes are always shut and the two open
 * ones move across the road beat by beat, the way a machine works: by the
 * clock. Under a head as it's down, stamped: spun and slowed. Through a lane
 * in the half beat before its head comes down, beating the machine: a boost.
 */
/** The song's tempo: the presses and the whole world move on it. */
export const BPM = 120;
export const PRESS_LANES = 4;
/** The lane whose head comes down on each beat of the bar. */
export const PRESS_ORDER = [0, 2, 1, 3] as const;
/** A head's stroke, in beats from its stamp: slammed down by SLAM, held to LIFT, back up by UP. */
export const PRESS_STROKE = { slam: 0.12, lift: 1.2, up: 1.5 } as const;
/** How far down a head has to be to stamp a kart under it. */
export const PRESS_HIT = 0.6;
/** The half beat before a head comes down: through its lane then, a boost. */
export const PRESS_DARE = 0.5;
/** Each station down the line stamps this share of a bar after the one before. */
export const PRESS_LAG = 0.25;
/** How long a head is along the road, either side of the gantry's line. */
export const PRESS_DEPTH = 1.8;
export const PRESS_SPIN = 1.0;
export const PRESS_SLOW = 0.5;
export const PRESS_BOOST = 1.0;

/** Where station `i` is in its bar at race time `t`: the beat, 0 to 4. */
export function pressBeat(t: number, period: number, i: number): number {
  const tt = (t + 10) / period - i * PRESS_LAG;
  return (tt - Math.floor(tt)) * 4;
}

/** How far down lane `k`'s head is at beat `beat`: 0 up, 1 down on the belt. */
export function pressDown(beat: number, k: number): number {
  const local = (((beat - PRESS_ORDER.indexOf(k as 0 | 1 | 2 | 3)) % 4) + 4) % 4;
  const S = PRESS_STROKE;
  if (local < S.slam) return local / S.slam;
  if (local < S.lift) return 1;
  if (local < S.up) return 1 - (local - S.lift) / (S.up - S.lift);
  return 0;
}

/** Whether lane `k`'s head is about to come down: the half beat before its stamp, when going under it is daring. */
export function pressDared(beat: number, k: number): boolean {
  const local = (((beat - PRESS_ORDER.indexOf(k as 0 | 1 | 2 | 3)) % 4) + 4) % 4;
  return local >= 4 - PRESS_DARE;
}

/** The lateral of lane `k`'s centre across a road `reach` wide either side. */
export function pressLane(k: number, reach: number): number {
  return -reach + ((k + 0.5) * 2 * reach) / PRESS_LANES;
}

/** Which lane a lateral `lat` is in across a road `reach` wide either side (clamped to the road). */
export function laneAt(lat: number, reach: number): number {
  return Math.max(0, Math.min(PRESS_LANES - 1, Math.floor(((lat + reach) / (2 * reach)) * PRESS_LANES)));
}

export const kit: Kit<'automation'> = {
  id: 'automation',
  hazards: {
    presses: {
      kind: 'presses',
      pose(p, def, i, t, world) {
        // A gantry across the road, its heads stamping lane by lane on the beat.
        const at = def.at[i];
        const beat = pressBeat(t, def.period, i);
        const reach = world.halfWidth(at);
        world.place(p, at, 0, 0);
        p.radius = reach;
        p.phase = beat / 4;
        p.lane = -1;
        p.gap = 0;
        p.side = 0;
        p.active = [0, 1, 2, 3].some((k) => pressDown(beat, k) > PRESS_HIT);
      },
      /**
       * Under a head while it's down: stamped, spun and slowed. Through a
       * lane in the half beat before its head comes down: a boost.
       */
      collide(hit, p, s, world) {
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const along = (s.x - p.x) * fx + (s.z - p.z) * fz;
        const lat = (s.x - p.x) * -fz + (s.z - p.z) * fx;
        if (Math.abs(along) > PRESS_DEPTH + KART_RADIUS || Math.abs(s.y - p.ground) > 2.5) return;
        const beat = p.phase * 4;
        const k = laneAt(lat, p.radius);
        if (pressDown(beat, k) > PRESS_HIT) {
          if (world.cooling(s)) return;
          world.cool(s);
          if (spinOut(s, PRESS_SPIN)) {
            s.speed *= PRESS_SLOW;
            hit.push({ kart: s, by: p.kind });
          }
          return;
        }
        if (pressDared(beat, k) && s.speed >= 8 && !world.cooling(s)) {
          world.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, PRESS_BOOST)));
        }
      },
      threats(out, p) {
        // The heads that are down, or coming down within the next half beat or so.
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const beat = p.phase * 4;
        for (let k = 0; k < PRESS_LANES; k++) {
          if ([0, 0.3, 0.6].every((d) => pressDown(beat + d, k) < 0.2)) continue;
          const lat = pressLane(k, p.radius);
          out.push({ x: p.x - fz * lat, z: p.z + fx * lat, r: p.radius / PRESS_LANES + 0.4, vx: 0, vz: 0 });
        }
      },
      // Gantries of presses down the stretch, a bar round, each a beat after the last.
      generate: ({ at, count }) => ({ kind: 'presses', at: at(count), period: 2 }),
      callouts: { hit: 'STAMPED!', bonus: 'BEAT THE MACHINE!' },
      sound(v) {
        // Stamped: the slam of the press, the hiss of its hydraulics and a buzzer.
        v.hit(0.12, 420, 0.65);
        v.whoosh(0.35, 4000, 1200, 0.1);
        v.tone(220, 0.25, 'square', 0.05, 180, 0.08);
      },
    },
  },
  themes: {
    automated: {
      name: 'Automation',
      palette: {
        surface: 'conveyor',
        deck: 'conveyor',
        hazards: ['presses'],
        start: 'timeClock',
        landmarks: ['timeClock', 'robotArms', 'serverFarm'],
        tallWalls: 6,
        places: ['Press', 'Belt', 'Shift', 'Gantry', 'Weld', 'Rack', 'Servo', 'Clock', 'Assembly', 'Line', 'Spindle', 'Relay'],
        music: { lap: 'automation', finalLap: 'automation-final-lap' },
      },
    },
  },
};
