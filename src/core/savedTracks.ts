import type { GenParams } from '../tracks/generator';

/** A generated track the player kept: its dials and seed rebuild it exactly. */
export interface SavedTrack extends GenParams {
  name: string;
  /** When it was saved (ms), for ordering. */
  saved: number;
}

const KEY = 'gizzracer.tracks';
const MAX_NAME = 32;

const same = (a: GenParams, b: GenParams) => a.seed === b.seed && a.theme === b.theme && a.complexity === b.complexity && a.length === b.length;

export function savedTracks(): SavedTrack[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedTrack[];
    return Array.isArray(list) ? list.filter((t) => t && typeof t.name === 'string' && Number.isFinite(t.seed)) : [];
  } catch {
    return [];
  }
}

/** The saved entry for these dials, if any. */
export function findSaved(p: GenParams): SavedTrack | null {
  return savedTracks().find((t) => same(t, p)) ?? null;
}

/** Saves (or renames) a track; returns its index in the list. */
export function saveTrack(p: GenParams, name: string): number {
  const list = savedTracks();
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || 'Untitled Track';
  const entry: SavedTrack = { seed: p.seed, theme: p.theme, complexity: p.complexity, length: p.length, name: clean, saved: Date.now() };
  const i = list.findIndex((t) => same(t, p));
  if (i >= 0) list[i] = { ...entry, saved: list[i].saved };
  else list.push(entry);
  write(list);
  return i >= 0 ? i : list.length - 1;
}

export function deleteSaved(p: GenParams): void {
  write(savedTracks().filter((t) => !same(t, p)));
}

function write(list: SavedTrack[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage blocked (private mode): nothing kept.
  }
}
