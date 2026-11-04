import { atmosphere } from '../atmosphere';

/**
 * Moving on the beat. The worlds keep their song's tempo (The Grim Reaper's
 * 80, Sadie's 92, Hot Wax's 150 beats a minute) and drive cones, nods,
 * arms and glows off the race clock with it: the clock the `animated`
 * callbacks are given. `beat(bpm)` bundles the shapes they use.
 */
export interface Beat {
  readonly bpm: number;
  /** 0 to 1 through each beat, the beat itself on 0 (`offset` in beats). */
  phase(time: number, offset?: number): number;
  /** A kick: 1 on the beat, falling away fast (`sharp` larger, faster). */
  kick(time: number, offset?: number, sharp?: number): number;
  /** A smooth pulse, 0 between beats rising to 1 on each. */
  pulse(time: number, offset?: number): number;
  /** A sway, -1 to 1 and back over `beats` beats (2: left on one, right on the next). */
  sway(time: number, beats?: number, offset?: number): number;
  /** Which beat of the bar it is, 0 to `perBar` - 1. */
  count(time: number, perBar?: number): number;
}

export function beat(bpm: number): Beat {
  const rate = bpm / 60;
  const phase = (time: number, offset = 0) => (((time * rate + offset) % 1) + 1) % 1;
  return {
    bpm,
    phase,
    kick: (time, offset = 0, sharp = 7) => Math.exp(-phase(time, offset) * sharp),
    pulse: (time, offset = 0) => 0.5 + 0.5 * Math.cos(phase(time, offset) * Math.PI * 2),
    sway: (time, beats = 2, offset = 0) => Math.sin(((time * rate + offset) / beats) * Math.PI * 2),
    count: (time, perBar = 4) => Math.floor(((time * rate) % perBar + perBar) % perBar),
  };
}

/** How far into the final lap's look the race is, 0 to 1 (set by trackView): burn the fires down, light the place up, drain the colour. */
export const finalLap = (): number => atmosphere.finalLap;
