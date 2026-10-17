import type { KartState } from '../physics/kart';

/**
 * Kart state on the wire (docs/MULTIPLAYER.md 7.3): a flat array of the
 * fields others need to show a kart and to run items against it.
 */
const FIELDS = ['x', 'y', 'z', 'heading', 'speed', 'vy', 'slip', 'steer', 'driftDir', 'driftCharge', 'boostTime', 'spinTime', 'spinAngle', 'wobbleTime', 'slowTime', 'groundY'] as const;

/** Rounded to keep messages small: centimetres and milliradians are plenty. */
export function packKart(s: KartState): number[] {
  const out = FIELDS.map((f) => Math.round((s[f] as number) * 1000) / 1000);
  out.push(s.grounded ? 1 : 0);
  return out;
}

export function unpackKart(a: readonly number[], s: KartState): void {
  FIELDS.forEach((f, i) => ((s[f] as number) = a[i]));
  s.grounded = a[FIELDS.length] === 1;
}

/** Linear blend of two packed states (angles take the short way round). */
export function lerpPacked(a: readonly number[], b: readonly number[], t: number, out: number[]): number[] {
  for (let i = 0; i < a.length; i++) {
    let d = b[i] - a[i];
    if ((i === 3 || i === 12) && Math.abs(d) > Math.PI) d -= Math.sign(d) * Math.PI * 2;
    out[i] = a[i] + d * t;
  }
  // Discrete fields don't blend.
  out[8] = b[8];
  out[a.length - 1] = b[a.length - 1];
  return out;
}
