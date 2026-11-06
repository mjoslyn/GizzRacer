import { spinOut, KART_RADIUS } from '../physics/kart';
import type { Kit } from './kit';

/**
 * Intrasport's kit (kits/kit.ts): its hazard, its theme's generator palette,
 * and the kinds and themes it adds; its look is in intrasport.view.ts, its
 * layout in tracks/intrasport.ts and its world in render/intrasport.ts.
 */

declare module '../tracks/track' {
  interface KitHazards {
    /** Intrasport: the needle sewing dreams, a giant sewing-machine needle on a gantry over the road, stabbing down on every beat of the four on the floor and stepping one stitch across the road between beats; stitched to the road, spun; through the stitch it has just pulled out of, a boost. */
    needles: { kit: 'intrasport'; def: { kind: 'needles'; at: number[]; bpm: number } };
  }
  interface KitLandmarks {
    /** The start: a stadium gate, its scoreboard reading INTRASPORT, floodlights and lasers. */
    stadiumGate: 'intrasport';
    /** Shattered Static: a wall of screens full of snow, cracked across. */
    staticWall: 'intrasport';
    /** Collision Course: two giant balls swinging into each other on the beat. */
    ballCollision: 'intrasport';
    /** Silenced by the Noise: the stacks of speakers in the loop, cones pumping. */
    speakerStack: 'intrasport';
    /** Vanishing Hands: giant hands raised out of the floor, fading in and out. */
    raveHands: 'intrasport';
    /** A Tear Dissolving: a giant tear hanging in the air, coming apart into drops. */
    tearDrop: 'intrasport';
    /** The floating deck's lights, from Evaporating to Shedding Skin. */
    floatDeck: 'intrasport';
    /** Gun in Hand: the starter's pistol, held up, smoke puffing on the beat. */
    starterPistol: 'intrasport';
    /** Face Splashing in the Sky: a giant face of light over the ramp, splashing. */
    skyFace: 'intrasport';
    /** Feeling on the Floor: a lit dance floor and the mirror ball over it. */
    mirrorFloor: 'intrasport';
    /** Dreams of Violence: a boxing ring, two fighters trading blows on the beat. */
    boxingRing: 'intrasport';
    /** Needle Sewing Dreams: a tower of thread spools, spinning. */
    spoolTower: 'intrasport';
    /** Liquefying Hair, Taste Buds Igniting: a giant head, its hair running off it, its tongue alight. */
    meltingHead: 'intrasport';
    /** Relative Evolution: the march of progress, from crawling to running. */
    evolutionMarch: 'intrasport';
    /** Stop: a giant hand held up, STOP. */
    stopHand: 'intrasport';
    /** A stretch of the lap dressed in layers: props, set piece, air and the song's words (by the section it starts in). */
    raveField: 'intrasport';
    /** The stadium's stands and floodlight towers round the world. */
    stadiumSkyline: 'intrasport';
  }
  interface KitThemes {
    stadiumrave: 'intrasport';
  }
}

declare module '../tracks/builder' {
  interface KitRoadSurfaces {
    /** Intrasport's road: a running track, red rubber with its white lanes. */
    tartan: 'intrasport';
  }
}

/**
 * The needle sewing dreams: a giant sewing-machine needle hung from a
 * gantry over the road, its thread trailing. On every beat (the song's four
 * on the floor) it stabs down into the road at a stitch, holds there for
 * NEEDLE_DOWN of the beat, pulls out and slides one stitch across while
 * it's up; back and forth across the road, NEEDLE_STITCHES of them, each
 * gantry a beat behind the one before so the seams run in a wave. Stitched
 * to the road by it: spun and slowed. Through the stitch it has just pulled
 * out of, the hole still open behind the needle: threaded, a boost.
 */
/** The needles' tempo: the song's four on the floor, which the whole world pumps to too. */
export const NEEDLE_BPM = 125;
export const NEEDLE_STITCHES = 6;
/** The share of each beat the needle is down in the road. */
export const NEEDLE_DOWN = 0.36;
/** Just after it pulls out, for this share of the beat, the stitch is open to thread. */
export const NEEDLE_THREAD = 0.3;
/** The needle's point, this thick. */
export const NEEDLE_RADIUS = 1.2;
/** How high the point rides between stitches. */
export const NEEDLE_LIFT = 4.5;
export const NEEDLE_SPIN = 1.0;
export const NEEDLE_SLOW = 0.6;
export const NEEDLE_BOOST = 0.9;
/** How far through the open stitch counts as threading it. */
export const THREAD_REACH = 1.6;

/** Where the needle of gantry `i` is at race time `t`: which beat (`n`, the stitch it went down into) and how far through it (`u`, 0 as it stabs down). */
export function needleBeat(t: number, bpm: number, i: number): { n: number; u: number } {
  const tt = ((t + 10) * bpm) / 60 - i;
  const n = Math.floor(tt);
  return { n, u: tt - n };
}

/** The stitch the needle goes down into on beat `n`: back and forth across the road, 0 (the left edge) to NEEDLE_STITCHES - 1. */
export function stitchOf(n: number): number {
  const span = 2 * (NEEDLE_STITCHES - 1);
  const k = ((n % span) + span) % span;
  return k < NEEDLE_STITCHES ? k : span - k;
}

/** The lateral of stitch `k` across a road `reach` wide either side (to the right is positive). */
export function stitchLateral(k: number, reach: number): number {
  return -reach + ((k + 0.5) * 2 * reach) / NEEDLE_STITCHES;
}

/** Where the needle's point is across the road at beat `n`, stage `u`: down at its stitch, then sliding over to the next one while it's up. */
export function needleLateral(n: number, u: number, reach: number): number {
  const here = stitchLateral(stitchOf(n), reach);
  if (u < NEEDLE_DOWN) return here;
  const f = (u - NEEDLE_DOWN) / (1 - NEEDLE_DOWN);
  const next = stitchLateral(stitchOf(n + 1), reach);
  return here + (next - here) * f * f * (3 - 2 * f);
}

/** How high the needle's point is over the road at stage `u`: in the road while it's down, up and over between stitches, stabbing on the beat. */
export function needleHeight(u: number): number {
  if (u < NEEDLE_DOWN) return 0;
  const f = (u - NEEDLE_DOWN) / (1 - NEEDLE_DOWN);
  return NEEDLE_LIFT * Math.sin(Math.PI * Math.min(1, f * 1.08));
}

/** Whether the needle is down in the road at stage `u`. */
export const needleDown = (u: number): boolean => u < NEEDLE_DOWN;

/** Whether the stitch just pulled out of is open to thread at stage `u`. */
export const stitchOpen = (u: number): boolean => u >= NEEDLE_DOWN && u < NEEDLE_DOWN + NEEDLE_THREAD;

export const kit: Kit<'intrasport'> = {
  id: 'intrasport',
  hazards: {
    needles: {
      kind: 'needles',
      pose(p, def, i, t, world) {
        // The needle over the road at its gantry, stabbing down on the beat and stepping across between beats.
        const at = def.at[i];
        const { n, u } = needleBeat(t, def.bpm, i);
        const reach = world.halfWidth(at) * 0.8;
        const lateral = needleLateral(n, u, reach);
        world.place(p, at, lateral, needleHeight(u));
        p.radius = NEEDLE_RADIUS;
        // The stitch it last went into, open to thread once it pulls out.
        p.gap = stitchLateral(stitchOf(n), reach);
        p.lane = stitchOf(n);
        p.side = 0;
        p.active = needleDown(u);
        p.phase = u;
      },
      /** Stitched to the road while the needle's down: spun and slowed. Through the stitch it just pulled out of: a boost. */
      collide(hit, p, s, world) {
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const along = (s.x - p.ax) * fx + (s.z - p.az) * fz;
        const lat = (s.x - p.ax) * -fz + (s.z - p.az) * fx;
        if (Math.abs(along) > NEEDLE_RADIUS + KART_RADIUS || Math.abs(s.y - p.ground) > 2.5) return;
        if (p.active) {
          const here = (p.x - p.ax) * -fz + (p.z - p.az) * fx;
          if (Math.abs(lat - here) > NEEDLE_RADIUS + KART_RADIUS) return;
          if (world.cooling(s)) return;
          world.cool(s);
          if (spinOut(s, NEEDLE_SPIN)) {
            s.speed *= NEEDLE_SLOW;
            hit.push({ kart: s, by: p.kind });
          }
          return;
        }
        if (stitchOpen(p.phase) && Math.abs(lat - p.gap) < THREAD_REACH && s.speed >= 8 && !world.cooling(s)) {
          world.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, NEEDLE_BOOST)));
        }
      },
      threats(out, p) {
        // The needle where it is, and where it's about to come down.
        out.push({ x: p.x, z: p.z, r: NEEDLE_RADIUS + 0.6, vx: 0, vz: 0 });
      },
      // A row of gantries along the stretch, a beat apart.
      generate: ({ at, count }) => ({ kind: 'needles', at: at(count), bpm: NEEDLE_BPM }),
      callouts: { hit: 'STITCHED!', bonus: 'THREADED!' },
      sound(v) {
        // Stitched: the needle's thunk into the road, a sewing machine's rattle, and a kick drum.
        v.hit(0.1, 220, 0.55);
        [0, 0.05, 0.1, 0.15].forEach((d) => v.tone(1800, 0.03, 'square', 0.04, 1500, d));
        v.tone(140, 0.18, 'sine', 0.22, 45, 0.02);
      },
    },
  },
  themes: {
    stadiumrave: {
      name: 'Intrasport',
      palette: {
        surface: 'tartan',
        deck: 'tartan',
        hazards: ['needles'],
        start: 'stadiumGate',
        landmarks: ['stadiumGate', 'skyFace'],
        tallWalls: 5,
        places: ['Stadium', 'Tunnel', 'Static', 'Floor', 'Needle', 'Thread', 'Strobe', 'Laser', 'Stand', 'Lane', 'Tear', 'Skin'],
        music: { lap: 'intrasport', finalLap: 'intrasport-final-lap' },
      },
    },
  },
};
