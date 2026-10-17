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
  { id: 'lizard-warlock', name: 'Lizard Warlock', stats: { speed: 3, accel: 3, weight: 3, handling: 3, drift: 3 }, color: 0x3fa34d, accent: 0x7a3fbf },
  { id: 'cyborg-gourmand', name: 'Cyborg Gourmand', stats: { speed: 4, accel: 2, weight: 4, handling: 2, drift: 3 }, color: 0x9aa4b1, accent: 0xd1342f },
  { id: 'gila-rider', name: 'Gila Rider', stats: { speed: 3, accel: 5, weight: 2, handling: 3, drift: 3 }, color: 0xe0702a, accent: 0x222222 },
  { id: 'swamp-witch', name: 'Swamp Witch', stats: { speed: 2, accel: 3, weight: 3, handling: 5, drift: 3 }, color: 0x2f6f5e, accent: 0xb7d14a },
  { id: 'microtonal-monk', name: 'Microtonal Monk', stats: { speed: 3, accel: 3, weight: 2, handling: 4, drift: 3 }, color: 0xe3a72f, accent: 0x7b2230 },
  { id: 'fuzz-golem', name: 'Fuzz Golem', stats: { speed: 5, accel: 1, weight: 5, handling: 2, drift: 3 }, color: 0xc23b8c, accent: 0xffcc33 },
];

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
    topSpeed: (22 + 2 * stats.speed) * m,
    accel: (6 + 2.5 * stats.accel) * m,
    turnRate: 1.5 + 0.2 * stats.handling,
    driftTurnRate: 1.35 + 0.12 * stats.handling,
    driftChargeRate: 0.85 + 0.05 * stats.drift,
    mass: 0.8 + 0.1 * stats.weight,
  };
}
