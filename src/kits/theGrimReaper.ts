import { KART_RADIUS, spinOut } from '../physics/kart';
import type { Kit } from './kit';

/**
 * The Grim Reaper's kit (kits/kit.ts): its hazard, its theme's generator palette,
 * and the kinds and themes it adds; its look is in theGrimReaper.view.ts, its
 * layout in tracks/theGrimReaper.ts and its world in render/theGrimReaper.ts.
 */

declare module '../tracks/track' {
  interface KitHazards {
    /** The Grim Reaper: packs of hellhounds bursting out of a den in one wall of their pit and running right across the road into the other's, nose to tail, their scent stitched across the road first; caught by one, bitten; through the gap just behind the pack, a boost. */
    hellhounds: { kit: 'the-grim-reaper'; def: { kind: 'hellhounds'; at: number[]; period: number } };
  }
  interface KitLandmarks {
    scytheGate: 'the-grim-reaper';
    chimneys: 'the-grim-reaper';
    keeperGate: 'the-grim-reaper';
    reaperMC: 'the-grim-reaper';
    wickedSun: 'the-grim-reaper';
    chequeBank: 'the-grim-reaper';
    fortress: 'the-grim-reaper';
    bodyBags: 'the-grim-reaper';
    homestead: 'the-grim-reaper';
    openGrave: 'the-grim-reaper';
  }
  interface KitThemes {
    grimreaper: 'the-grim-reaper';
  }
}

declare module '../tracks/builder' {
  interface KitRoadSurfaces {
    /** The Grim Reaper's road: cinders, ash and scorched dirt. */
    cinder: 'the-grim-reaper';
  }
}

/**
 * The Grim Reaper's hellhounds, "sniffing out stitches for the snitches": a
 * pack of three bursting out of a den in one wall of their pit and running
 * right across the road into the den in the other, nose to tail, noses down
 * on the scent. Their scent line is stitched across the road first, a seam
 * of red stitches glowing brighter and brighter from the side they'll come
 * from (the warning), while their eyes burn in the dark of the den and the
 * lead hound's nose pokes out sniffing; then the run, each hound weaving a
 * little along the road as it sniffs, and the next time round they come
 * back the other way. Caught by one, bitten and spun. Slipped through the
 * gap just behind the last of the pack as it crosses, a boost.
 */
export const HOUND_STAGES = { run: 0.42, gone: 0.82 } as const;
export const HOUND_COUNT = 3;
/** Nose to nose along their line, and each one's body: the head this far ahead of its middle, the tail this far behind, this thick. */
export const HOUND_SPACING = 3.6;
export const HOUND_HEAD = 1.3;
export const HOUND_TAIL = 1.3;
export const HOUND_RADIUS = 0.75;
/** The dens are this far out past the road's edge: where the pack waits and where it runs to. */
export const HOUND_OUT = 2;
/** How far each hound weaves along the road as it sniffs, either way. */
export const HOUND_SNIFF = 0.6;
/** The gap behind the pack: this far back behind the last one's tail, this far either side of its line. */
export const HOUND_GAP = 7;
export const HOUND_GAP_DEPTH = 2.6;
export const HOUND_SPIN = 1.1;
export const HOUND_BOOST = 1.0;
/** Each pack down the pit runs this share of a period after the one before, so a fast kart through the gap behind one meets the next as it opens. */
export const HOUND_LAG = 0.3;

/** Where pack `i` of a stretch is in its cycle at race time `t` (0 to 1), and which way it runs this time (1 to the right). */
export function houndPhase(t: number, period: number, i: number): { u: number; side: number } {
  const tt = (t + 10) / period - i * HOUND_LAG;
  const cycle = Math.floor(tt);
  return { u: tt - cycle, side: (cycle + i) % 2 === 0 ? 1 : -1 };
}

/**
 * Where each hound of a pack is at cycle stage `u`, in the road's frame at
 * its station: `lateral` (to the right), `along` the road, and whether it's
 * out of its den (`out`). `side` is the way they run; the road is `reach`
 * wide either side of its centre. The lead is first.
 */
export function houndPack(u: number, side: number, reach: number): { lateral: number; along: number; out: boolean }[] {
  const H = HOUND_STAGES;
  const den = reach + HOUND_OUT;
  const back = (HOUND_COUNT - 1) * HOUND_SPACING;
  // The lead runs from its den until the last of them is in the far one.
  const f = u < H.run ? 0 : u >= H.gone ? 1 : (u - H.run) / (H.gone - H.run);
  const lead = -den + (2 * den + back) * f;
  return Array.from({ length: HOUND_COUNT }, (_, k) => {
    const l = lead - k * HOUND_SPACING;
    const out = u >= H.run && u < H.gone && l > -den && l < den;
    const lateral = side * Math.max(-den, Math.min(den, l));
    return { lateral, along: out ? HOUND_SNIFF * Math.sin(f * Math.PI * 7 + k * 1.9) : 0, out };
  });
}

export const kit: Kit<'the-grim-reaper'> = {
  id: 'the-grim-reaper',
  hazards: {
    hellhounds: {
      kind: 'hellhounds',
      pose(p, def, i, t, world) {
        // A pack of hellhounds waiting in the den in one wall, then running right across the road into the other's, the scent stitched across first.
        const at = def.at[i];
        const { u, side } = houndPhase(t, def.period, i);
        const reach = world.halfWidth(at);
        const pack = houndPack(u, side, reach);
        // The pose is the lead hound's, the pack following it along its line; ax, az is the road's centre at the station, its frame.
        world.place(p, at, 0, 0);
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        p.x = p.ax - fz * pack[0].lateral + fx * pack[0].along;
        p.z = p.az + fx * pack[0].lateral + fz * pack[0].along;
        p.radius = HOUND_RADIUS;
        p.side = side;
        p.gap = reach;
        p.active = pack.some((h) => h.out);
        // Running: the gap behind the pack is open.
        p.lane = u >= HOUND_STAGES.run && u < HOUND_STAGES.gone ? 1 : 0;
        p.phase = u;
      },
      /**
       * A pack of hellhounds crossing their pit: caught by one, head to tail,
       * bitten and spun; slipped through the gap just behind the last of them as
       * it crosses, a boost.
       */
      collide(hit, p, s, world) {
        if (p.lane !== 1) return;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        // In the road's frame at the station: a lateral to the right is (-cos h, sin h).
        const along = (s.x - p.ax) * fx + (s.z - p.az) * fz;
        const lat = (s.x - p.ax) * -fz + (s.z - p.az) * fx;
        const pack = houndPack(p.phase, p.side, p.gap);
        for (const h of pack) {
          if (!h.out) continue;
          // Its body: a segment across the road, tail to head the way the pack runs.
          const mid = h.lateral + p.side * ((HOUND_HEAD - HOUND_TAIL) / 2);
          const d = Math.hypot(Math.max(0, Math.abs(lat - mid) - (HOUND_HEAD + HOUND_TAIL) / 2), along - h.along);
          if (d > HOUND_RADIUS + KART_RADIUS) continue;
          if (world.cooling(s)) return;
          world.cool(s);
          if (spinOut(s, HOUND_SPIN)) hit.push({ kart: s, by: p.kind });
          return;
        }
        // The gap behind the last of them: the road it has this moment crossed.
        const last = pack[pack.length - 1];
        if (!last.out) return;
        const behind = p.side * (last.lateral - lat) - HOUND_TAIL - HOUND_RADIUS;
        if (behind < 0 || behind > HOUND_GAP || Math.abs(along - last.along) > HOUND_GAP_DEPTH || Math.abs(lat) > p.gap + 1 || s.speed < 8 || world.cooling(s)) return;
        world.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, HOUND_BOOST)));
      },
      threats(out, p, def) {
        // From just before they burst out until they're in the far den: each hound out of its den, head to tail, and where the next will be.
        if (p.phase < HOUND_STAGES.run - 0.06 || p.phase >= HOUND_STAGES.gone) return;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const speed = (2 * (p.gap + HOUND_OUT) + (HOUND_COUNT - 1) * HOUND_SPACING) / ((HOUND_STAGES.gone - HOUND_STAGES.run) * def.period);
        for (const h of houndPack(Math.max(p.phase, HOUND_STAGES.run), p.side, p.gap)) {
          if (!h.out && p.phase >= HOUND_STAGES.run) continue;
          out.push({ x: p.ax - fz * h.lateral + fx * h.along, z: p.az + fx * h.lateral + fz * h.along, r: 1.6, vx: -fz * p.side * speed, vz: fx * p.side * speed });
        }
      },
      // Packs of hellhounds crossing the stretch one after another, the way back the next time.
      generate: ({ at, count }) => ({ kind: 'hellhounds', at: at(count), period: 4.4 }),
      callouts: { hit: 'STITCHED UP!', bonus: 'FASTER THAN A CHEETAH!' },
      sound(v) {
        // Bitten by a hellhound: a snarl, two barks, the snap of its jaws, and a growl rolling on under them.
        v.tone(98, 0.6, 'sawtooth', 0.1, 62, 0, true);
        v.hit(0.12, 900, 0.45);
        v.tone(440, 0.09, 'square', 0.08, 250, 0.1);
        v.tone(400, 0.11, 'square', 0.08, 220, 0.26);
        v.whoosh(0.3, 1800, 500, 0.12);
      },
    },
  },
  themes: {
    grimreaper: {
      name: 'The Grim Reaper',
      palette: {
        surface: 'cinder',
        deck: 'cinder',
        alt: 'sand',
        hazards: ['hellhounds'],
        start: 'scytheGate',
        landmarks: ['scytheGate', 'reaperMC', 'chequeBank'],
        tallWalls: 6,
        places: ['Chimney', 'Gate Keeper', 'Cheetah', 'Point Blank', 'Hurricane', 'Scraps', 'Cactus', 'Hatchet', 'Hellhound', 'Cheque', 'Silhouette', 'Fortress', 'Homestead'],
        music: { lap: 'the-grim-reaper', finalLap: 'the-grim-reaper-final-lap' },
      },
    },
  },
};
