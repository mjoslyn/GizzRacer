import type { CpuDifficulty } from '../ai/cpuDriver';

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
  /** The Rattlesnake video's tape-and-duotone look (render/postfx.ts): full, toned down, or off. */
  videoLook: VideoLook;
  /** The player picked a video look themselves; until then it follows the default. */
  videoLookChosen: boolean;
  /** Smart steering (physics/steerAssist.ts): steers back in from edges and straightens up out of turns. */
  smartSteering: boolean;
  /** The HUD's next-turn indicator: which way the next bend goes, how sharp, and how far off. */
  turnIndicator: boolean;
  /** How hard the CPUs race, offline (ai/cpuDriver.ts `withDifficulty`). */
  cpuDifficulty: CpuDifficulty;
  /**
   * The music (audio/radio.ts): the game's remixes; a live recording of each
   * race's song, streamed from the Internet Archive; or a whole live show
   * playing through, kept going across races.
   */
  soundtrack: Soundtrack;
  /** Graphics detail (render/detail.ts): sun shadows, bump-mapped roads, denser scenery and full resolution, or the flat look at fewer pixels. */
  detail: 'high' | 'medium' | 'low';
  /** The player picked a detail level themselves; until then phones get Low and everything else High. */
  detailChosen: boolean;
}

export type VideoLook = 'full' | 'light' | 'off';
export type Soundtrack = 'remix' | 'song' | 'show';
export const SOUNDTRACKS: readonly Soundtrack[] = ['remix', 'song', 'show'];
export const VIDEO_LOOKS: readonly VideoLook[] = ['full', 'light', 'off'];

export const DEFAULT_SETTINGS: Settings = { music: 0.6, sfx: 1, tilt: false, tiltRange: 24, tiltInvert: false, autoAccelerate: true, steeringChosen: false, videoLook: 'light', videoLookChosen: false, smartSteering: true, turnIndicator: true, cpuDifficulty: 'normal', soundtrack: 'remix', detail: 'high', detailChosen: false };

/** A phone or tablet: Low detail unless the player says otherwise. */
function coarseDevice(): boolean {
  try {
    return typeof matchMedia !== 'undefined' && (matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches));
  } catch {
    return false;
  }
}
export const TILT_RANGES = [16, 24, 34] as const;

const KEY = 'gizzracer.settings';
let current: Settings = load();
const listeners: ((s: Settings) => void)[] = [];

function load(): Settings {
  try {
    const s = { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
    // Saved before the player chose one (with an older default): the current default.
    if (!s.videoLookChosen) s.videoLook = DEFAULT_SETTINGS.videoLook;
    if (!s.detailChosen) s.detail = coarseDevice() ? 'low' : 'high';
    if (!SOUNDTRACKS.includes(s.soundtrack)) s.soundtrack = 'remix';
    return s;
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
