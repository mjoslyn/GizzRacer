import { KART_RADIUS, spinOut } from '../physics/kart';
import type { Kit } from './kit';

/**
 * Billabong Valley's kit (kits/kit.ts): its hazard, its theme's generator palette,
 * and the kinds and themes it adds; its look is in billabongValley.view.ts, its
 * layout in tracks/billabongValley.ts and its world in render/billabongValley.ts.
 */

declare module '../tracks/track' {
  interface KitHazards {
    /** Billabong Valley: Mad Dog Morgan and his gang riding across the road out of the dark, rifles flashing, never at quite the same moment twice; ridden down, you're robbed of your item and spun; through the dust just behind the last rider, a boost. */
    bushrangers: { kit: 'billabong-valley'; def: { kind: 'bushrangers'; at: number[]; period: number } };
  }
  interface KitLandmarks {
    hideoutGate: 'billabong-valley';
    blackBillabong: 'billabong-valley';
    ropeGums: 'billabong-valley';
    burningCamp: 'billabong-valley';
    troopersCamp: 'billabong-valley';
    wantedPoster: 'billabong-valley';
    trestle: 'billabong-valley';
    stationHomestead: 'billabong-valley';
    redDawn: 'billabong-valley';
    stolenGun: 'billabong-valley';
  }
  interface KitThemes {
    bushranger: 'billabong-valley';
  }
}

declare module '../tracks/builder' {
  interface KitRoadSurfaces {
    /** Billabong Valley's road: a bush track of red dirt. */
    redgum: 'billabong-valley';
  }
}

/**
 * Billabong Valley's bushrangers: Mad Dog Morgan and two of his gang
 * galloping out of the dark bush and right across the road, rifles
 * flashing, and gone into the dark on the other side. He never gave a
 * warning: nothing on the road tells you they're coming, only the riders
 * themselves out in the scrub, and they never come at quite the same
 * moment twice (each time round, the ride starts somewhere in the first
 * GANG_JITTER of the period) nor always from the same side. Ridden down by
 * one, you're bailed up: robbed of the item in your hands and spun.
 * Slipped through the dust just behind the last of them as they cross, a
 * boost.
 */
export const GANG_COUNT = 3;
/** Each ride takes this share of the period, starting somewhere in the first GANG_JITTER of it. */
export const GANG_RIDE = 0.55;
export const GANG_JITTER = 0.35;
/** Out in the scrub this far past the road's edge: where they gallop in from and off to. */
export const GANG_OUT = 18;
/** Horse to horse along their line, and each one staggered this far along the road from Morgan's line (his first). */
export const GANG_SPACING = 3.4;
export const GANG_STAGGER = [0, 1.7, -1.5] as const;
/** A horse and rider: the head this far ahead of its middle, the tail this far behind, this thick. */
export const GANG_HEAD = 1.5;
export const GANG_TAIL = 1.3;
export const GANG_RADIUS = 0.8;
/** The dust behind the last of them: this far back behind its tail, this far either side of its line. */
export const GANG_GAP = 7;
export const GANG_GAP_DEPTH = 2.8;
export const GANG_SPIN = 1.2;
export const GANG_BOOST = 1.0;

/** A number from 0 to 1 for ride `k` of station `i`, the same every time it's asked: how late in the period that ride comes, and which way. */
function gangDice(k: number, i: number, salt: number): number {
  const v = Math.sin(k * 12.9898 + i * 78.233 + salt * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Where the gang at station `i` is at race time `t`: `u` through their ride
 * (0 as they set off from the scrub, 1 as the last is gone into it; below 0
 * before it, above 1 after), and which way they ride this time (1 to the
 * right).
 */
export function gangPhase(t: number, period: number, i: number): { u: number; side: number } {
  const tt = (t + 10) / period;
  const k = Math.floor(tt);
  const start = GANG_JITTER * gangDice(k, i, 1);
  const u = (tt - k - start) / GANG_RIDE;
  return { u, side: gangDice(k, i, 2) < 0.5 ? 1 : -1 };
}

/**
 * Where each rider is at ride stage `u`, in the road's frame at its station:
 * `lateral` (to the right), `along` the road, and whether they're on their
 * way across (`out`). `side` is the way they ride; the road is `reach` wide
 * either side of its centre. Morgan is first.
 */
export function gangRiders(u: number, side: number, reach: number): { lateral: number; along: number; out: boolean }[] {
  const edge = reach + GANG_OUT;
  const back = (GANG_COUNT - 1) * GANG_SPACING;
  const f = Math.max(0, Math.min(1, u));
  const lead = -edge + (2 * edge + back) * f;
  return Array.from({ length: GANG_COUNT }, (_, k) => {
    const l = lead - k * GANG_SPACING;
    const out = u >= 0 && u < 1 && l > -edge && l < edge;
    return { lateral: side * Math.max(-edge, Math.min(edge, l)), along: GANG_STAGGER[k], out };
  });
}

export const kit: Kit<'billabong-valley'> = {
  id: 'billabong-valley',
  hazards: {
    bushrangers: {
      kind: 'bushrangers',
      pose(p, def, i, t, world) {
        // Mad Dog Morgan's gang galloping out of the scrub on one side, right across the road, and off into the dark on the other.
        const at = def.at[i];
        const { u, side } = gangPhase(t, def.period, i);
        const reach = world.halfWidth(at);
        const riders = gangRiders(u, side, reach);
        // The pose is Morgan's; ax, az is the road's centre at the station, its frame.
        world.place(p, at, 0, 0);
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        p.x = p.ax - fz * riders[0].lateral + fx * riders[0].along;
        p.z = p.az + fx * riders[0].lateral + fz * riders[0].along;
        p.radius = GANG_RADIUS;
        p.side = side;
        p.gap = reach;
        p.active = riders.some((r) => r.out && Math.abs(r.lateral) < reach + GANG_HEAD);
        // Riding: the dust behind them is there to slip through.
        p.lane = u >= 0 && u < 1 ? 1 : 0;
        p.phase = u;
      },
      /**
       * Mad Dog Morgan's gang riding across: ridden down by a horse, head to
       * tail, you're bailed up, robbed of your item and spun; slipped through
       * the dust just behind the last of them as they cross, a boost.
       */
      collide(hit, p, s, world) {
        if (p.lane !== 1) return;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        // In the road's frame at the station: a lateral to the right is (-cos h, sin h).
        const along = (s.x - p.ax) * fx + (s.z - p.az) * fz;
        const lat = (s.x - p.ax) * -fz + (s.z - p.az) * fx;
        const riders = gangRiders(p.phase, p.side, p.gap);
        for (const r of riders) {
          if (!r.out) continue;
          // A horse: a segment across the road, tail to head the way they ride.
          const mid = r.lateral + p.side * ((GANG_HEAD - GANG_TAIL) / 2);
          const d = Math.hypot(Math.max(0, Math.abs(lat - mid) - (GANG_HEAD + GANG_TAIL) / 2), along - r.along);
          if (d > GANG_RADIUS + KART_RADIUS) continue;
          if (world.cooling(s)) return;
          world.cool(s);
          if (spinOut(s, GANG_SPIN)) hit.push({ kart: s, by: p.kind, robbed: true });
          return;
        }
        // The dust behind the last of them: the road they have this moment crossed.
        const last = riders[riders.length - 1];
        if (!last.out) return;
        const behind = p.side * (last.lateral - lat) - GANG_TAIL - GANG_RADIUS;
        if (behind < 0 || behind > GANG_GAP || Math.abs(along - last.along) > GANG_GAP_DEPTH || Math.abs(lat) > p.gap + 1 || s.speed < 8 || world.cooling(s)) return;
        world.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, GANG_BOOST)));
      },
      threats(out, p, def) {
        // From a moment before they gallop out until the last is gone: each rider on the way across, and where they'll be.
        if (p.phase < -0.08 || p.phase >= 1) return;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const speed = (2 * (p.gap + GANG_OUT) + (GANG_COUNT - 1) * GANG_SPACING) / (GANG_RIDE * def.period);
        for (const r of gangRiders(Math.max(p.phase, 0), p.side, p.gap)) {
          if (!r.out && p.phase >= 0) continue;
          if (Math.abs(r.lateral) > p.gap + 8) continue;
          out.push({ x: p.ax - fz * r.lateral + fx * r.along, z: p.az + fx * r.lateral + fz * r.along, r: 1.8, vx: -fz * p.side * speed, vz: fx * p.side * speed });
        }
      },
      // Mad Dog Morgan's gang riding across the stretch, never at quite the same moment twice.
      generate: ({ at, count }) => ({ kind: 'bushrangers', at: at(count), period: 4.6 }),
      callouts: { hit: 'NEVER GAVE A WARNING!', bonus: 'FASTER THAN A STOLEN GUN!' },
      sound(v) {
        // Ridden down by Mad Dog Morgan's gang: two rifle cracks, hooves thundering past, and a horse screaming as it goes.
        v.hit(0.09, 3200, 0.6);
        v.whoosh(0.18, 4000, 900, 0.18);
        [0.08, 0.17, 0.24, 0.33, 0.4, 0.49].forEach((d, k) => v.tone(70 - k * 3, 0.06, 'triangle', 0.12, 45, d));
        v.tone(620, 0.7, 'sawtooth', 0.04, 380, 0.2);
        v.tone(900, 0.25, 'sine', 0.03, 1300, 0.22);
      },
    },
  },
  themes: {
    bushranger: {
      name: 'Billabong Valley',
      palette: {
        surface: 'redgum',
        deck: 'redgum',
        alt: 'scorched',
        hazards: ['bushrangers'],
        start: 'hideoutGate',
        landmarks: ['wantedPoster', 'burningCamp'],
        tallWalls: 6,
        places: ['Outlaw', 'Stolen Gun', 'Red Gum', 'Billabong', 'Kyeamba', 'Trooper', 'Wanted', 'Bushranger', 'Ranges', 'Mad Dog', 'Morgan', 'Dawn'],
        music: { lap: 'billabong-valley', finalLap: 'billabong-valley-final-lap' },
      },
    },
  },
};
