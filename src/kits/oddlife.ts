import { spinOut, KART_RADIUS } from '../physics/kart';
import type { Kit } from './kit';

/**
 * Oddlife's kit (kits/kit.ts): its hazard, its theme's generator palette,
 * and the kinds and themes it adds; its look is in oddlife.view.ts, its
 * layout in tracks/oddlife.ts and its world in render/oddlife.ts.
 */

declare module '../tracks/track' {
  interface KitHazards {
    /** Oddlife: "another promoter hanging in your hair, another backstage green room to prepare". A row of backstage doors rises out of the road; some stay shut, a promoter in each one, and some swing open on a green room. Into a promoter, caught and spun; through an open door, a boost. */
    backstageDoors: { kit: 'oddlife'; def: { kind: 'backstageDoors'; at: number[]; period: number } };
  }
  interface KitLandmarks {
    stageGate: 'oddlife';
    tourBus: 'oddlife';
    headbanger: 'oddlife';
    sugarplumFairy: 'oddlife';
    deckLights: 'oddlife';
    voyager: 'oddlife';
    hydra: 'oddlife';
    anthropoids: 'oddlife';
    motel: 'oddlife';
    tourPoster: 'oddlife';
    /** A stretch of the lap dressed in layers: props, set piece, air and the song's words (by the section it starts in). */
    tourField: 'oddlife';
    /** The middle of nowhere round the world: hills, silos, water towers and radio masts. */
    outbackSkyline: 'oddlife';
  }
  interface KitThemes {
    oddlife: 'oddlife';
  }
}

declare module '../tracks/builder' {
  interface KitRoadSurfaces {
    /** Oddlife's road: the tour's highway, bitumen at night, its lines painted bright. */
    tourRoad: 'oddlife';
  }
}

/**
 * Oddlife's tempo, the beat the world's lights, crowds and speakers move to
 * (render/oddlife.ts): 108 beats a minute is a machine estimate of the album
 * cut (AcousticBrainz). Set it to the remix's measured tempo once it's
 * transcribed.
 */
export const ODDLIFE_BPM = 108;

/**
 * The backstage doors, "another promoter hanging in your hair, another
 * backstage green room to prepare": DOOR_SLOTS doors rise out of the road
 * across it, stand, and sink back. As they stand, DOOR_OPEN of them swing
 * open on a green room (a different few every time) and the rest stay shut
 * with a promoter in the doorway. Into a promoter: caught, spun, slowed.
 * Through an open door: a boost.
 */
export const DOOR_SLOTS = 6;
export const DOOR_OPEN = 3;
/** The cycle: rising out of the road until `risen`, the open ones swinging open until `opened`, all sinking back from `sink`. */
export const DOOR_STAGES = { risen: 0.24, opened: 0.36, sink: 0.8 } as const;
export const DOOR_RADIUS = 1.3;
export const DOOR_SPIN = 1.0;
export const DOOR_SLOW = 0.6;
export const DOOR_BOOST = 1.0;
/** Each station down the stretch rises this share of a period after the one before. */
export const DOOR_LAG = 0.3;

/** Which doors swing open in cycle `cycle` at station `i`: a bit mask of DOOR_OPEN slots, never the same mask twice running. */
export function openMask(cycle: number, i: number): number {
  // The ways of choosing 3 of 6, walked in a scrambled order.
  const masks: number[] = [];
  for (let m = 0; m < 1 << DOOR_SLOTS; m++) {
    let n = 0;
    for (let k = 0; k < DOOR_SLOTS; k++) if (m & (1 << k)) n++;
    if (n === DOOR_OPEN) masks.push(m);
  }
  const at = (((cycle * 7 + i * 5) % masks.length) + masks.length) % masks.length;
  return masks[at];
}

/** Whether door `k` opens in `mask`. */
export const opens = (mask: number, k: number): boolean => (mask & (1 << k)) !== 0;

/** Where the row of station `i` is at race time `t`: its cycle stage (0 to 1), which cycle, and which doors open. */
export function doorPhase(t: number, period: number, i: number): { u: number; cycle: number; open: number } {
  const tt = (t + 10) / period - i * DOOR_LAG;
  const cycle = Math.floor(tt);
  return { u: tt - cycle, cycle, open: openMask(cycle, i) };
}

/** How far out of the road the row stands at stage `u`: 0 under it, 1 standing. */
export function doorRisen(u: number): number {
  const S = DOOR_STAGES;
  const f = u < S.risen ? u / S.risen : u < S.sink ? 1 : 1 - (u - S.sink) / (1 - S.sink);
  return f * f * (3 - 2 * f);
}

/** How far the open doors have swung open at stage `u`: 0 shut, 1 wide open. */
export function swung(u: number): number {
  const S = DOOR_STAGES;
  if (u < S.risen) return 0;
  if (u >= S.sink) return 1;
  return Math.min(1, (u - S.risen) / (S.opened - S.risen));
}

/** The lateral of door `k` across a road `reach` wide either side. */
export function doorSlot(k: number, reach: number): number {
  return -reach + ((k + 0.5) * 2 * reach) / DOOR_SLOTS;
}

/** Whether the shut doors' promoters stand solid at stage `u`: from the moment the row has risen until it starts to sink. */
export const standing = (u: number): boolean => u >= DOOR_STAGES.risen && u < DOOR_STAGES.sink;
/** Whether the open doors are open, to drive through for a boost. */
export const greenRoom = (u: number): boolean => u >= DOOR_STAGES.opened && u < DOOR_STAGES.sink;

export const kit: Kit<'oddlife'> = {
  id: 'oddlife',
  hazards: {
    backstageDoors: {
      kind: 'backstageDoors',
      pose(p, def, i, t, world) {
        // A row of backstage doors risen out of the road across it; some swing open, the rest hold a promoter.
        const at = def.at[i];
        const { u, open } = doorPhase(t, def.period, i);
        const reach = world.halfWidth(at);
        world.place(p, at, 0, 0);
        p.radius = reach;
        p.lane = open;
        p.gap = 0;
        p.side = 0;
        p.active = standing(u);
        p.phase = u;
      },
      /**
       * Into a shut door's promoter while the row stands: caught, spun and
       * slowed. Through an open door, once it's open: a boost.
       */
      collide(hit, p, s, world) {
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const along = (s.x - p.x) * fx + (s.z - p.z) * fz;
        const lat = (s.x - p.x) * -fz + (s.z - p.z) * fx;
        if (Math.abs(along) > DOOR_RADIUS + KART_RADIUS || Math.abs(s.y - p.ground) > 2.5) return;
        for (let k = 0; k < DOOR_SLOTS; k++) {
          if (Math.abs(lat - doorSlot(k, p.radius)) > DOOR_RADIUS + KART_RADIUS) continue;
          if (!opens(p.lane, k)) {
            if (!p.active || world.cooling(s)) continue;
            world.cool(s);
            if (spinOut(s, DOOR_SPIN)) {
              s.speed *= DOOR_SLOW;
              hit.push({ kart: s, by: p.kind });
            }
            return;
          }
          if (greenRoom(p.phase) && s.speed >= 8 && !world.cooling(s) && Math.abs(lat - doorSlot(k, p.radius)) < DOOR_RADIUS) {
            world.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, DOOR_BOOST)));
            return;
          }
        }
      },
      threats(out, p) {
        // The shut doors, from just before they've risen until they sink.
        if (p.phase < DOOR_STAGES.risen - 0.06 || p.phase >= DOOR_STAGES.sink) return;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        for (let k = 0; k < DOOR_SLOTS; k++) {
          if (opens(p.lane, k)) continue;
          const l = doorSlot(k, p.radius);
          out.push({ x: p.x - fz * l, z: p.z + fx * l, r: DOOR_RADIUS + 0.3, vx: 0, vz: 0 });
        }
      },
      // Rows of backstage doors rising across the stretch, one after another, different ones open each time.
      generate: ({ at, count }) => ({ kind: 'backstageDoors', at: at(count), period: 4.4 }),
      callouts: { hit: 'IN YOUR HAIR!', bonus: 'GREEN ROOM!' },
      sound(v) {
        // Into a promoter: a door slammed, a clipboard's clatter and a sour little "hey!".
        v.hit(0.12, 260, 0.5);
        v.whoosh(0.25, 1800, 600, 0.1);
        v.tone(520, 0.12, 'square', 0.05, 390, 0.08);
        v.tone(330, 0.2, 'triangle', 0.05, 220, 0.2);
      },
    },
  },
  themes: {
    oddlife: {
      name: 'Oddlife',
      palette: {
        surface: 'tourRoad',
        deck: 'tourRoad',
        hazards: ['backstageDoors'],
        start: 'stageGate',
        landmarks: ['stageGate', 'tourBus', 'tourPoster'],
        tallWalls: 4,
        places: ['Tour', 'Bus', 'Stage', 'Green Room', 'Carpark', 'Motel', 'Crossroad', 'Hydra', 'Fairy', 'Voyager', 'Venue', 'Highway'],
        music: { lap: 'oddlife', finalLap: 'oddlife-final-lap' },
      },
    },
  },
};
