import { CUPS, RETIRED_CUPS } from '../tracks/index';
import type { EngineClass } from '../physics/racers';

/**
 * What the player has done, kept in this browser: a trophy per cup and
 * class, the fastest cup per cup and class, the best full-race time per
 * track and class, the best style score
 * per track, and which shortcuts they've found. Unlocks fall out of it.
 */
export type Trophy = 'gold' | 'silver' | 'bronze';

export interface CupResult {
  trophy: Trophy | null;
  /** Finishing place in the cup, 1-based. */
  place: number;
  points: number;
  /** All four races of the cup added up (ms). */
  timeMs: number;
  /** Won every race of the cup. */
  sweep: boolean;
  at: number;
}

export interface RaceRecord {
  ms: number;
  at: number;
}

export interface Progress {
  /** By cup id, class and mirror: `nonagon-infinity.100cc`, `nonagon-infinity.100cc.mirror`. */
  cups: Record<string, CupResult>;
  /** Fastest cup (its races added up, any finish) by cup id, class and mirror. */
  cupTimes: Record<string, RaceRecord>;
  /** Best full-race time by track id, class and mirror. */
  races: Record<string, RaceRecord>;
  /** Best style score by track id and class. */
  style: Record<string, number>;
  /** Shortcuts found, as `trackId:section`. */
  shortcuts: string[];
}

export interface Unlocks {
  /** The Random Cup: any trophy. */
  randomCup: boolean;
  /** 200cc: a gold at 150cc in one of the album cups. */
  class200: boolean;
  /** Mirror mode: gold in every album cup, at any class. */
  mirror: boolean;
}

export const EMPTY_PROGRESS: Progress = { cups: {}, cupTimes: {}, races: {}, style: {}, shortcuts: [] };

const KEY = 'gizzracer.progress';
const TROPHY_FOR_PLACE: Record<number, Trophy> = { 1: 'gold', 2: 'silver', 3: 'bronze' };
const TROPHY_RANK: Record<Trophy, number> = { bronze: 1, silver: 2, gold: 3 };

/** A record's key: what it was set on. */
export function cupKey(cupId: string, engine: EngineClass, mirror = false): string {
  return `${cupId}.${engine}${mirror ? '.mirror' : ''}`;
}

export function raceKey(trackId: string, engine: EngineClass, mirror = false): string {
  return `${trackId}.${engine}${mirror ? '.mirror' : ''}`;
}

export function trophyFor(place: number): Trophy | null {
  return TROPHY_FOR_PLACE[place] ?? null;
}

/** Whether `a` beats `b`: a better trophy, else more points, else a quicker cup. */
export function betterCup(a: CupResult, b: CupResult | undefined): boolean {
  if (!b) return true;
  const ra = a.trophy ? TROPHY_RANK[a.trophy] : 0;
  const rb = b.trophy ? TROPHY_RANK[b.trophy] : 0;
  if (ra !== rb) return ra > rb;
  if (a.sweep !== b.sweep) return a.sweep;
  if (a.points !== b.points) return a.points > b.points;
  return a.timeMs < b.timeMs;
}

const UNLOCK_KEY = 'gizzracer.unlockAll';

/**
 * What ?unlock in the address asks for: everything unlocked (?unlock, or
 * ?unlock=on), locked back to the trophies (?unlock=off or =0), or nothing.
 */
export function unlockParam(search: string): boolean | null {
  const v = new URLSearchParams(search).get('unlock');
  if (v === null) return null;
  return !['off', '0', 'false', 'no'].includes(v.toLowerCase());
}

/** Everything unlocked by ?unlock: kept in this browser until ?unlock=off. Trophies and records are left alone. */
let unlockAll: boolean | null = null;
function unlockedAll(): boolean {
  if (unlockAll !== null) return unlockAll;
  unlockAll = false;
  try {
    const asked = typeof location === 'undefined' ? null : unlockParam(location.search);
    if (asked !== null) localStorage.setItem(UNLOCK_KEY, asked ? '1' : '0');
    unlockAll = asked ?? localStorage.getItem(UNLOCK_KEY) === '1';
  } catch {
    // No storage (or no page, in tests): only what was earned.
  }
  return unlockAll;
}

/** What this progress has unlocked, or everything with ?unlock. */
export function unlocks(p: Progress): Unlocks {
  if (unlockedAll()) return { randomCup: true, class200: true, mirror: true };
  const albumCups = CUPS.map((c) => c.id);
  const results = Object.entries(p.cups);
  const randomCup = results.some(([, r]) => r.trophy !== null);
  const class200 = results.some(([key, r]) => r.trophy === 'gold' && key.endsWith('.150cc') && albumCups.includes(key.split('.')[0]));
  const mirror = albumCups.every((id) => results.some(([key, r]) => r.trophy === 'gold' && key.startsWith(`${id}.`) && !key.endsWith('.mirror')));
  return { randomCup, class200, mirror };
}

/** The best trophy on a cup at any class: for the picker. */
export function cupTrophies(p: Progress, cupId: string, mirror = false): { engine: string; result: CupResult }[] {
  return Object.entries(p.cups)
    .filter(([key]) => key.startsWith(`${cupId}.`) && key.endsWith('.mirror') === mirror)
    .map(([key, result]) => ({ engine: key.split('.')[1], result }));
}

let current: Progress | null = null;

export function progress(): Readonly<Progress> {
  return (current ??= load());
}

function load(): Progress {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Progress> | null;
    if (!raw || typeof raw !== 'object') return structuredClone(EMPTY_PROGRESS);
    return {
      cups: raw.cups && typeof raw.cups === 'object' ? carryOver(raw.cups) : {},
      cupTimes: raw.cupTimes && typeof raw.cupTimes === 'object' ? raw.cupTimes : {},
      races: raw.races && typeof raw.races === 'object' ? raw.races : {},
      style: raw.style && typeof raw.style === 'object' ? raw.style : {},
      shortcuts: Array.isArray(raw.shortcuts) ? raw.shortcuts.filter((s): s is string => typeof s === 'string') : [],
    };
  } catch {
    return structuredClone(EMPTY_PROGRESS);
  }
}

/** Trophies won on a retired cup, moved to the album cup that took its tracks, unless that one has its own. */
export function carryOver(cups: Record<string, CupResult>): Record<string, CupResult> {
  const out: Record<string, CupResult> = {};
  const retired: [string, CupResult][] = [];
  for (const [key, result] of Object.entries(cups)) {
    const [id, ...rest] = key.split('.');
    if (RETIRED_CUPS[id]) retired.push([[RETIRED_CUPS[id], ...rest].join('.'), result]);
    else out[key] = result;
  }
  for (const [key, result] of retired) out[key] ??= result;
  return out;
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Storage blocked (private mode): progress lasts for this visit.
  }
}

/** Forgets everything (tests, and a reset button). */
export function resetProgress(): void {
  current = structuredClone(EMPTY_PROGRESS);
  save();
}

/** Records a finished cup. Returns the trophy and whether it improved on what was there. */
export function recordCup(cupId: string, engine: EngineClass, mirror: boolean, result: Omit<CupResult, 'trophy' | 'at'>): { trophy: Trophy | null; improved: boolean; unlocked: (keyof Unlocks)[] } {
  const p = (current ??= load());
  const before = unlocks(p);
  const key = cupKey(cupId, engine, mirror);
  const entry: CupResult = { ...result, trophy: trophyFor(result.place), at: Date.now() };
  const improved = betterCup(entry, p.cups[key]);
  if (improved) {
    p.cups[key] = entry;
    save();
  }
  const after = unlocks(p);
  const unlocked = (Object.keys(after) as (keyof Unlocks)[]).filter((k) => after[k] && !before[k]);
  return { trophy: entry.trophy, improved, unlocked };
}

/** Records a cup's time, its races added up. Returns whether it's the fastest here and what it beat. */
export function recordCupTime(cupId: string, engine: EngineClass, mirror: boolean, ms: number): { best: boolean; prevMs: number | null } {
  const p = (current ??= load());
  const key = cupKey(cupId, engine, mirror);
  const prev = p.cupTimes[key] ?? null;
  const best = !prev || ms < prev.ms;
  if (best) {
    p.cupTimes[key] = { ms, at: Date.now() };
    save();
  }
  return { best, prevMs: prev?.ms ?? null };
}

/** Records a full race's time. Returns whether it's the best here and what it beat. */
export function recordRace(trackId: string, engine: EngineClass, mirror: boolean, ms: number): { best: boolean; prevMs: number | null } {
  const p = (current ??= load());
  const key = raceKey(trackId, engine, mirror);
  const prev = p.races[key] ?? null;
  const best = !prev || ms < prev.ms;
  if (best) {
    p.races[key] = { ms, at: Date.now() };
    save();
  }
  return { best, prevMs: prev?.ms ?? null };
}

/** Records a race's style score. Returns whether it's the best on this track and class. */
export function recordStyle(trackId: string, engine: EngineClass, score: number): { best: boolean; prev: number | null } {
  const p = (current ??= load());
  const key = raceKey(trackId, engine);
  const prev = p.style[key] ?? null;
  const best = score > 0 && (prev === null || score > prev);
  if (best) {
    p.style[key] = score;
    save();
  }
  return { best, prev };
}

/** Marks a shortcut found; true the first time. */
export function foundShortcut(trackId: string, section: string): boolean {
  const p = (current ??= load());
  const key = `${trackId}:${section}`;
  if (p.shortcuts.includes(key)) return false;
  p.shortcuts.push(key);
  save();
  return true;
}
