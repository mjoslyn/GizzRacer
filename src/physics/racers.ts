import { seededRandom } from '../core/math';

/** Racer stats on a 1..5 scale (spec section 5). */
export interface RacerStats {
  speed: number;
  accel: number;
  weight: number;
  handling: number;
  drift: number;
}

export interface RacerDef {
  id: string;
  name: string;
  stats: RacerStats;
  color: number;
  accent: number;
}

export const RACERS: readonly RacerDef[] = [
  { id: 'lizard-warlock', name: 'Lizard Warlock', stats: { speed: 3, accel: 3, weight: 3, handling: 3, drift: 4 }, color: 0x3fa34d, accent: 0x7a3fbf },
  { id: 'cyborg-gourmand', name: 'Cyborg Gourmand', stats: { speed: 4, accel: 2, weight: 4, handling: 2, drift: 3 }, color: 0x9aa4b1, accent: 0xd1342f },
  { id: 'gila-rider', name: 'Gila Rider', stats: { speed: 3, accel: 5, weight: 2, handling: 3, drift: 3 }, color: 0xe0702a, accent: 0x222222 },
  { id: 'swamp-witch', name: 'Swamp Witch', stats: { speed: 3, accel: 2, weight: 3, handling: 5, drift: 4 }, color: 0x2f6f5e, accent: 0xb7d14a },
  { id: 'microtonal-monk', name: 'Microtonal Monk', stats: { speed: 3, accel: 3, weight: 2, handling: 4, drift: 3 }, color: 0xe3a72f, accent: 0x7b2230 },
  { id: 'fuzz-golem', name: 'Fuzz Golem', stats: { speed: 5, accel: 1, weight: 5, handling: 1, drift: 3 }, color: 0xc23b8c, accent: 0xffcc33 },
  { id: 'neon-moth', name: 'Neon Moth', stats: { speed: 2, accel: 5, weight: 2, handling: 4, drift: 5 }, color: 0x3ad8ff, accent: 0xff5ad0 },
  { id: 'cosmic-coyote', name: 'Cosmic Coyote', stats: { speed: 4, accel: 2, weight: 3, handling: 2, drift: 3 }, color: 0x2a2a6a, accent: 0xff9a1f },
  { id: 'mantis-shredder', name: 'Mantis Shredder', stats: { speed: 3, accel: 4, weight: 2, handling: 3, drift: 4 }, color: 0x9ad83a, accent: 0xff3a6a },
  { id: 'gator-drummer', name: 'Gator Drummer', stats: { speed: 4, accel: 2, weight: 4, handling: 2, drift: 3 }, color: 0xb8202a, accent: 0xf2e6c8 },
  { id: 'mushroom-sage', name: 'Mushroom Sage', stats: { speed: 3, accel: 3, weight: 2, handling: 4, drift: 4 }, color: 0x7a5adf, accent: 0xf4e8d0 },
  { id: 'apricot-poodle', name: 'Poodle', stats: { speed: 3, accel: 4, weight: 2, handling: 4, drift: 3 }, color: 0xd09a62, accent: 0x3a4250 },
  { id: 'octo-organist', name: 'Octo Organist', stats: { speed: 4, accel: 2, weight: 3, handling: 2, drift: 3 }, color: 0xff7aa8, accent: 0x2ad8b0 },
  // The band, with their blessing.
  { id: 'ambrose-kenny-smith', name: 'Amby', stats: { speed: 3, accel: 5, weight: 2, handling: 3, drift: 3 }, color: 0x2a8ad8, accent: 0xff5a3a },
  { id: 'michael-cavanagh', name: 'Cavs', stats: { speed: 4, accel: 2, weight: 3, handling: 2, drift: 3 }, color: 0x1a3a6a, accent: 0xffd23a },
  { id: 'cook-craig', name: 'Cookie', stats: { speed: 3, accel: 2, weight: 3, handling: 5, drift: 4 }, color: 0x3aa04a, accent: 0xffe14d },
  { id: 'jason-galea', name: 'Jason', stats: { speed: 3, accel: 4, weight: 2, handling: 3, drift: 4 }, color: 0x1a1a22, accent: 0x3adcff },
  { id: 'joey-walker', name: 'Joey', stats: { speed: 3, accel: 3, weight: 2, handling: 4, drift: 3 }, color: 0xe85a9a, accent: 0x3adcff },
  { id: 'lucas-harwood', name: 'Lukey', stats: { speed: 4, accel: 2, weight: 4, handling: 2, drift: 3 }, color: 0x8a5a3a, accent: 0xd84a2a },
  { id: 'stu-mackenzie', name: 'Stu', stats: { speed: 3, accel: 3, weight: 3, handling: 3, drift: 4 }, color: 0xf4d23a, accent: 0x7a2a8a },
];

/** Karts in one race: the player (or the room's players) and CPUs drawn from the roster. */
export const FIELD_SIZE = 12;

/** `count` racers not in `taken`, drawn and ordered by `seed`: a seed always draws the same rivals. */
export function pickRivals(taken: ReadonlySet<string>, count: number, seed: number): RacerDef[] {
  const pool = RACERS.filter((r) => !taken.has(r.id));
  const rand = seededRandom(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, count));
}

export type EngineClass = '50cc' | '100cc' | '150cc';
export const ENGINE_CLASSES: readonly EngineClass[] = ['50cc', '100cc', '150cc'];
const CLASS_SPEED: Record<EngineClass, number> = { '50cc': 0.8, '100cc': 1, '150cc': 1.15 };

/** Derived physical tuning for one kart. */
export interface KartParams {
  topSpeed: number; // m/s
  accel: number; // m/s^2 from standstill
  turnRate: number; // rad/s at full steer
  driftTurnRate: number; // rad/s baseline while drifting
  driftChargeRate: number; // charge seconds per real second at neutral steer bias
  mass: number; // relative, for bump knockback
}

export function kartParams(stats: RacerStats, engine: EngineClass): KartParams {
  const m = CLASS_SPEED[engine];
  return {
    // Each stat point is worth about the same lap time, so no stat dominates.
    topSpeed: (30.9 + 0.9 * stats.speed) * m,
    accel: (6 + 3.6 * stats.accel) * m,
    turnRate: 1.45 + 0.34 * stats.handling,
    driftTurnRate: 1.35 + 0.22 * stats.handling,
    driftChargeRate: 0.75 + 0.09 * stats.drift,
    mass: 0.9 + 0.06 * stats.weight,
  };
}
