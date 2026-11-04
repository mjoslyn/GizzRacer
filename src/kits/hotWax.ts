import { KART_RADIUS, wobble } from '../physics/kart';
import type { Kit } from './kit';

/**
 * Hot Wax's kit (kits/kit.ts): its hazard, its theme's generator palette,
 * and the kinds and themes it adds; its look is in hotWax.view.ts, its
 * layout in tracks/hotWax.ts and its world in render/hotWax.ts.
 */

declare module '../tracks/track' {
  interface KitHazards {
    /** Hot Wax: tongues of hot wax creeping out across the road from one edge, one after another down a stretch, setting as they cool; caught in one while it's molten, it grabs you; over it once it has set hard, a slick that slings you on. */
    waxFlows: { kit: 'hot-wax'; def: { kind: 'waxFlows'; at: number[]; period: number } };
  }
  interface KitLandmarks {
    waxDoor: 'hot-wax';
    floorJoists: 'hot-wax';
    rugHill: 'hot-wax';
    windowSill: 'hot-wax';
    giantCandle: 'hot-wax';
    lavaLamp: 'hot-wax';
    waxJungle: 'hot-wax';
    armchair: 'hot-wax';
    giantFeet: 'hot-wax';
    kitchenSink: 'hot-wax';
    spiltDrink: 'hot-wax';
    lordShrine: 'hot-wax';
    glassHead: 'hot-wax';
    waxMaze: 'hot-wax';
    giantLeaves: 'hot-wax';
    giantBed: 'hot-wax';
    giantLeg: 'hot-wax';
    springKing: 'hot-wax';
    learningHow: 'hot-wax';
  }
  interface KitThemes {
    hotwax: 'hot-wax';
  }
}

declare module '../tracks/builder' {
  interface KitRoadSurfaces {
    /** Hot Wax's road: a slick of cooling wax, molten at the edges. */
    wax: 'hot-wax';
  }
}

/**
 * Hot Wax: "hot wax comin' under the door". Tongues of hot wax creeping out
 * across the road from under the cupboards at one edge. Each wells up at
 * the edge first, glowing (the warning, harmless), then creeps right across
 * the road, molten, lies there a while, and cools: a skin forms over it,
 * its glow dies to a pale cream and it sets hard, and at last it cracks up
 * and crumbles away. The next one comes from the other edge. Down a
 * stretch each tongue comes out a little after the one before, so the
 * moment the wax sets rolls down the road at about a fast kart's pace.
 * Caught in it while it's molten, it grabs you: you're slowed hard and the
 * wheel wobbles. Over it once it has set hard, it's a slick that slings
 * you on, a boost. While it's still creeping across, the far side of the
 * road is clear.
 */
export const WAX_STAGES = { creep: 0.1, across: 0.38, cool: 0.58, set: 0.66, crack: 0.92 } as const;
/** How far along the road a tongue reaches either side of its middle. */
export const WAX_DEPTH = 5;
/** Each tongue down a stretch comes out this share of a period after the one before. */
export const WAX_LAG = 0.25;
/** Grabbed by molten wax: you keep this share of your speed, and the wheel wobbles this long. */
export const WAX_SLOW = 0.45;
export const WAX_STICK = 1.0;
/** Over it set hard: a boost this long. */
export const WAX_SLICK = 0.9;

/** Where tongue `i` of a stretch is in its cycle at race time `t` (0 to 1), and the edge it comes from this time (1: from the right). */
export function waxPhase(t: number, period: number, i: number): { u: number; side: number } {
  const tt = (t + 10) / period - i * WAX_LAG;
  const cycle = Math.floor(tt);
  return { u: tt - cycle, side: (cycle + i) % 2 === 0 ? 1 : -1 };
}

/** How far across the road a tongue has crept at cycle stage `u`, 0 (still at its edge) to 1 (right across), and how it shrinks back as it crumbles. */
export function waxReach(u: number): number {
  const W = WAX_STAGES;
  if (u < W.creep) return 0;
  if (u < W.across) {
    const k = (u - W.creep) / (W.across - W.creep);
    return k * (2 - k);
  }
  return u < W.crack ? 1 : 1 - (u - W.crack) / (1 - W.crack);
}

/** How hot a tongue is at cycle stage `u`: 1 molten, falling through the cooling to 0 once it has set. */
export function waxHeat(u: number): number {
  const W = WAX_STAGES;
  if (u < W.cool) return 1;
  if (u < W.set) return 1 - (u - W.cool) / (W.set - W.cool);
  return 0;
}

export const kit: Kit<'hot-wax'> = {
  id: 'hot-wax',
  hazards: {
    waxFlows: {
      kind: 'waxFlows',
      pose(p, def, i, t, world) {
        // A tongue of hot wax creeping out across the road from one edge, setting as it cools.
        const at = def.at[i];
        const { u, side } = waxPhase(t, def.period, i);
        world.place(p, at, 0, 0);
        p.radius = world.halfWidth(at);
        p.side = side;
        // How far across the road it has crept, 0 to 1.
        p.gap = waxReach(u);
        p.active = u >= WAX_STAGES.creep && u < WAX_STAGES.cool;
        // Set hard: a slick.
        p.lane = u >= WAX_STAGES.set && u < WAX_STAGES.crack ? 1 : 0;
        p.phase = u;
      },
      /**
       * A tongue of hot wax: caught in its molten part, it grabs you, slowed
       * hard, the wheel wobbling; over it once it has set hard, a slick that
       * slings you on, a boost.
       */
      collide(hit, p, s, world) {
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const along = (s.x - p.x) * fx + (s.z - p.z) * fz;
        // A lateral to the right is (-cos h, sin h).
        const lat = (s.x - p.x) * -fz + (s.z - p.z) * fx;
        if (Math.abs(along) > WAX_DEPTH + KART_RADIUS || Math.abs(lat) > p.radius + KART_RADIUS) return;
        if (p.lane === 1) {
          if (s.speed > 6) world.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, WAX_SLICK)));
          return;
        }
        if (!p.active || world.cooling(s)) return;
        // How far across from its edge the kart is, 0 to 1: beyond the tongue's front the road is clear.
        const across = (p.radius - p.side * lat) / (2 * p.radius);
        if (across - KART_RADIUS / (2 * p.radius) > p.gap) return;
        world.cool(s);
        if (!wobble(s, WAX_STICK)) return;
        s.speed *= WAX_SLOW;
        hit.push({ kart: s, by: p.kind });
      },
      threats(out, p, def) {
        // While it creeps across, its molten part, so the CPUs keep to the clear side; once it lies right across there's nothing to steer round.
        if (!p.active || p.gap >= 0.98) return;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const from = p.side * (p.radius + 1);
        const front = from - p.side * (2 * p.radius + 1) * p.gap;
        const mid = (from + front) / 2;
        const speed = (2 * p.radius) / ((WAX_STAGES.across - WAX_STAGES.creep) * def.period);
        out.push({ x: p.ax - fz * mid, z: p.az + fx * mid, r: Math.abs(front - from) / 2 + 1, vx: fz * p.side * speed * 0.5, vz: -fx * p.side * speed * 0.5 });
      },
      // Tongues of hot wax creeping across the stretch one after another, setting as they cool.
      generate: ({ at, count }) => ({ kind: 'waxFlows', at: at(count), period: 4.4 }),
      callouts: { hit: 'HOT WAX!', bonus: "C'MON GET AROUND!" },
      sound(v) {
        // Grabbed by hot wax: a thick, sucking squelch sliding down, the sizzle of it, and the spring reverb punched, a rattling metallic clang.
        v.tone(180, 0.5, 'sawtooth', 0.09, 70, 0, true);
        v.whoosh(0.6, 3200, 900, 0.14);
        v.hit(0.22, 2400, 0.4);
        [1180, 1410, 1630].forEach((f, k) => v.tone(f, 0.45, 'square', 0.025, f * 0.94, 0.02 + k * 0.012));
      },
    },
  },
  themes: {
    hotwax: {
      name: 'Hot Wax',
      palette: {
        surface: 'wax',
        deck: 'wax',
        alt: 'boards',
        liquid: 'lava',
        hazards: ['waxFlows'],
        start: 'waxDoor',
        landmarks: ['armchair', 'glassHead', 'giantBed'],
        tallWalls: 6,
        places: ['Door', 'Floor', 'Sill', 'Safari', 'Seat', 'Sink', 'Drink', 'Maze', 'Leaves'],
        music: { lap: 'hot-wax', finalLap: 'hot-wax-final-lap' },
      },
    },
  },
};
