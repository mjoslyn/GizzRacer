import { lerp, lerpAngle } from './math';
import type { KartState } from '../physics/kart';

/** Samples per second of race time; playback interpolates between them. */
export const GHOST_HZ = 15;
/** Floats per sample: x, y, z, heading, slip, steer. */
const STRIDE = 6;

/** A recorded run: who drove it and where they were, sampled from the green light. */
export interface GhostRun {
  racerId: string;
  total: number;
  samples: Float32Array;
}

/** Records the player's kart from the green light, one sample per 1/GHOST_HZ s of race time. */
export class GhostRecorder {
  private readonly data: number[] = [];

  /** Call every physics tick with the race clock. */
  record(time: number, s: KartState): void {
    if (time < 0) return;
    // Fill every sample slot up to now; a tick can't skip one at 60 Hz, but be safe.
    while (this.data.length / STRIDE <= time * GHOST_HZ) {
      this.data.push(s.x, s.y, s.z, s.heading, s.slip, s.steer);
    }
  }

  finish(racerId: string, total: number): GhostRun {
    return { racerId, total, samples: Float32Array.from(this.data) };
  }
}

/** Where a ghost was at race time `t`; it waits at the finish once its run is over. */
export function ghostPose(run: GhostRun, t: number, out: KartState): void {
  const n = run.samples.length / STRIDE;
  const f = Math.max(0, Math.min(n - 1, t * GHOST_HZ));
  const i = Math.min(n - 2, Math.floor(f));
  const k = Math.max(0, f - i);
  const a = Math.max(0, i) * STRIDE;
  const b = Math.min(n - 1, i + 1) * STRIDE;
  const d = run.samples;
  out.x = lerp(d[a], d[b], k);
  out.y = lerp(d[a + 1], d[b + 1], k);
  out.z = lerp(d[a + 2], d[b + 2], k);
  out.heading = lerpAngle(d[a + 3], d[b + 3], k);
  out.slip = lerp(d[a + 4], d[b + 4], k);
  out.steer = lerp(d[a + 5], d[b + 5], k);
  // Speed from the sampled motion, for wheel spin.
  const dt = 1 / GHOST_HZ;
  out.speed = Math.hypot(d[b] - d[a], d[b + 2] - d[a + 2]) / dt;
  out.groundY = out.y;
  out.grounded = true;
}

/** Compact text form for localStorage: JSON header plus base64 float32 samples. */
export function encodeGhost(run: GhostRun): string {
  const bytes = new Uint8Array(run.samples.buffer, run.samples.byteOffset, run.samples.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return JSON.stringify({ v: 1, racerId: run.racerId, total: run.total, hz: GHOST_HZ, data: btoa(bin) });
}

export function decodeGhost(text: string): GhostRun | null {
  try {
    const o = JSON.parse(text) as { v: number; racerId: string; total: number; hz: number; data: string };
    if (o.v !== 1 || o.hz !== GHOST_HZ) return null;
    const bin = atob(o.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { racerId: o.racerId, total: o.total, samples: new Float32Array(bytes.buffer) };
  } catch {
    return null;
  }
}
