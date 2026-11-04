import { spinOut, KART_RADIUS } from '../physics/kart';
import type { Kit } from './kit';

/**
 * Minimum Brain Size's kit (kits/kit.ts): its hazard, its theme's generator palette,
 * and the kinds and themes it adds; its look is in minimumBrainSize.view.ts, its
 * layout in tracks/minimumBrainSize.ts and its world in render/minimumBrainSize.ts.
 */

declare module '../tracks/track' {
  interface KitHazards {
    /** Minimum Brain Size: the mob, faceless grey avatars shoulder to shoulder across the road, closing in from both edges and leaving one gap that moves; into the pile-on, spun and dragged; through the gap as it closes, out of the echo, a boost. */
    mobs: { kit: 'minimum-brain-size'; def: { kind: 'mobs'; at: number[]; period: number } };
  }
  interface KitLandmarks {
    echoGate: 'minimum-brain-size';
    bedroom: 'minimum-brain-size';
    spiderCrow: 'minimum-brain-size';
    commentWall: 'minimum-brain-size';
    flyCloud: 'minimum-brain-size';
    biccyHeap: 'minimum-brain-size';
    brainBall: 'minimum-brain-size';
    tearEye: 'minimum-brain-size';
    broAvatar: 'minimum-brain-size';
    deckFeed: 'minimum-brain-size';
    /** A stretch of the lap dressed in layers: props, set piece, air and the song's words (by the section it starts in). */
    feedField: 'minimum-brain-size';
    /** The ring of lit towers standing round the world. */
    echoSkyline: 'minimum-brain-size';
  }
  interface KitThemes {
    echochamber: 'minimum-brain-size';
  }
}

declare module '../tracks/builder' {
  interface KitRoadSurfaces {
    /** Minimum Brain Size's road: an endless scrolling feed. */
    feed: 'minimum-brain-size';
  }
}

/**
 * Minimum Brain Size's mob, "parasitic mob, faceless undertow": faceless
 * grey avatars closing in from both edges of the road to stand shoulder to
 * shoulder across it, MOB_SLOTS to a row, all but one: the gap where one
 * of them isn't, a different slot each time. The row gathers in on the
 * undertow, holds closed, and washes back out to the edges. Into one,
 * piled on: spun, and dragged back. Through the gap while the row is
 * closed, out of the echo chamber: a boost.
 */
export const MOB_SLOTS = 6;
export const MOB_STAGES = { closed: 0.34, open: 0.78 } as const;
export const MOB_RADIUS = 1.45;
/** How far past each edge they come in from and go back out to. */
export const MOB_OUT = 4;
export const MOB_SPIN = 1.0;
export const MOB_SLOW = 0.55;
export const MOB_BOOST = 1.0;
/** Each station down the stretch closes this share of a period after the one before. */
export const MOB_LAG = 0.27;

/** Where the row of station `i` is at race time `t`: its cycle stage (0 to 1), which cycle, and the slot left open. */
export function mobPhase(t: number, period: number, i: number): { u: number; cycle: number; gap: number } {
  const tt = (t + 10) / period - i * MOB_LAG;
  const cycle = Math.floor(tt);
  return { u: tt - cycle, cycle, gap: 1 + ((cycle * 2 + i) % (MOB_SLOTS - 2)) };
}

/** How far in toward their places the row has come at stage `u`: 0 out at the edges, 1 standing shoulder to shoulder. */
export function mobIn(u: number): number {
  const S = MOB_STAGES;
  const f = u < S.closed ? u / S.closed : u < S.open ? 1 : 1 - (u - S.open) / (1 - S.open);
  return f * f * (3 - 2 * f);
}

/** The lateral of slot `k` across a road `reach` wide either side. */
export function mobSlot(k: number, reach: number): number {
  return -reach + ((k + 0.5) * 2 * reach) / MOB_SLOTS;
}

/** The row's avatars at stage `u`: each one's lateral (the left half comes in from the left edge, the right half from the right). */
export function mobRow(u: number, gap: number, reach: number): { lateral: number; slot: number }[] {
  const f = mobIn(u);
  const out: { lateral: number; slot: number }[] = [];
  for (let k = 0; k < MOB_SLOTS; k++) {
    if (k === gap) continue;
    const home = mobSlot(k, reach);
    const edge = (k < MOB_SLOTS / 2 ? -1 : 1) * (reach + MOB_OUT);
    out.push({ lateral: edge + (home - edge) * f, slot: k });
  }
  return out;
}

export const kit: Kit<'minimum-brain-size'> = {
  id: 'minimum-brain-size',
  hazards: {
    mobs: {
      kind: 'mobs',
      pose(p, def, i, t, world) {
        // A row of faceless avatars gathering in from both edges to stand shoulder to shoulder, all but one slot, then washing back out.
        const at = def.at[i];
        const { u, gap } = mobPhase(t, def.period, i);
        const reach = world.halfWidth(at);
        world.place(p, at, 0, 0);
        p.radius = reach;
        p.gap = mobSlot(gap, reach);
        p.lane = gap;
        p.side = 0;
        p.active = u >= 0.12 && u < MOB_STAGES.open + 0.08;
        p.phase = u;
      },
      /**
       * Into one of the row, piled on: spun and slowed. Through the one gap
       * while the row stands closed, out of the echo chamber: a boost.
       */
      collide(hit, p, s, world) {
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const along = (s.x - p.x) * fx + (s.z - p.z) * fz;
        const lat = (s.x - p.x) * -fz + (s.z - p.z) * fx;
        if (Math.abs(along) > MOB_RADIUS + KART_RADIUS || Math.abs(s.y - p.ground) > 2.5) return;
        if (p.active) {
          for (const a of mobRow(p.phase, p.lane, p.radius)) {
            if (Math.hypot(along, lat - a.lateral) > MOB_RADIUS + KART_RADIUS) continue;
            if (world.cooling(s)) return;
            world.cool(s);
            if (spinOut(s, MOB_SPIN)) {
              s.speed *= MOB_SLOW;
              hit.push({ kart: s, by: p.kind });
            }
            return;
          }
        }
        // Through the gap while the row stands closed.
        if (p.phase >= MOB_STAGES.closed && p.phase < MOB_STAGES.open && Math.abs(lat - p.gap) < 1.3 && s.speed >= 8 && !world.cooling(s)) {
          world.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, MOB_BOOST)));
        }
      },
      threats(out, p) {
        // The row of avatars, from just before it closes until it has washed back out.
        if (p.phase < 0.12 || p.phase >= MOB_STAGES.open + 0.08) return;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        for (const a of mobRow(Math.max(p.phase, MOB_STAGES.closed - 0.04), p.lane, p.radius)) out.push({ x: p.x - fz * a.lateral, z: p.z + fx * a.lateral, r: MOB_RADIUS + 0.3, vx: 0, vz: 0 });
      },
      // Rows of the mob closing in across the stretch, one after another, a different gap each time.
      generate: ({ at, count }) => ({ kind: 'mobs', at: at(count), period: 4.8 }),
      callouts: { hit: 'PILED ON!', bonus: 'OUT OF THE ECHO!' },
      sound(v) {
        // Piled on by the mob: a dull thud of bodies, a swarm of buzzing flies and a notification ping going sour.
        v.hit(0.14, 180, 0.5);
        v.whoosh(0.5, 900, 300, 0.12);
        [1320, 1100, 740].forEach((f, k) => v.tone(f, 0.07, 'square', 0.045, f * 0.7, 0.12 + k * 0.1));
      },
    },
  },
  themes: {
    echochamber: {
      name: 'Minimum Brain Size',
      palette: {
        surface: 'feed',
        deck: 'feed',
        hazards: ['mobs'],
        start: 'echoGate',
        landmarks: ['echoGate', 'flyCloud', 'broAvatar'],
        tallWalls: 6,
        places: ['Riddle', 'Spider', 'Crow', 'Biccy', 'Feed', 'Echo', 'Troll', 'Mob', 'Undertow', 'Scroll', 'Thread', 'Avatar'],
        music: { lap: 'minimum-brain-size', finalLap: 'minimum-brain-size-final-lap' },
      },
    },
  },
};
