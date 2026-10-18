import type { MusicVersion } from '../audio/songs';

/** Player settings, kept in this browser (Settings screen: ui/settings.ts). */
export interface Settings {
  /** 0..1 */
  music: number;
  /** 0..1 */
  sfx: number;
  /** Steer by turning the phone like a wheel. */
  tilt: boolean;
  /** Degrees of turn for full steering lock: lower is twitchier. */
  tiltRange: number;
  tiltInvert: boolean;
  autoAccelerate: boolean;
  /** The phone steering question has been answered (asked once, on the first tap past the title). */
  steeringChosen: boolean;
  /** Which version of each track's song plays (audio/songs.ts). */
  musicVersion: MusicVersion;
  /** The Rattlesnake video's tape-and-duotone look (render/postfx.ts): full, toned down, or off. */
  videoLook: VideoLook;
}

export type VideoLook = 'full' | 'light' | 'off';
export const VIDEO_LOOKS: readonly VideoLook[] = ['full', 'light', 'off'];

export const DEFAULT_SETTINGS: Settings = { music: 0.6, sfx: 1, tilt: false, tiltRange: 24, tiltInvert: false, autoAccelerate: true, steeringChosen: false, musicVersion: 'remix', videoLook: 'full' };
export const TILT_RANGES = [16, 24, 34] as const;

const KEY = 'gizzracer.settings';
let current: Settings = load();
const listeners: ((s: Settings) => void)[] = [];

function load(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function settings(): Readonly<Settings> {
  return current;
}

export function updateSettings(change: Partial<Settings>): void {
  current = { ...current, ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage blocked: settings last for this visit.
  }
  for (const l of listeners) l(current);
}

/** Runs now and on every change. */
export function onSettings(listener: (s: Settings) => void): void {
  listeners.push(listener);
  listener(current);
}
