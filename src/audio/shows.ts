import type { Show } from './radio';

/**
 * The shows a Live set can play (Settings > Soundtrack: Live set, and the
 * picker's Sound rows): public/music/shows.json, oldest first, loaded once at
 * startup (game.ts), and picked by id (settings().liveShow; null is the
 * newest). Pure, apart from holding the list.
 */
let list: readonly Show[] = [];
const listeners = new Set<() => void>();

export function setShows(shows: readonly Show[]): void {
  list = shows;
  for (const fn of listeners) fn();
}

export function shows(): readonly Show[] {
  return list;
}

/** Runs when the list arrives. */
export function onShows(fn: () => void): void {
  listeners.add(fn);
}

/** Where `id` is in `all`: the newest for null or an id that isn't there; -1 for an empty list. */
export function showIndex(all: readonly Show[], id: string | null): number {
  const i = id === null ? -1 : all.findIndex((s) => s.id === id);
  return i >= 0 ? i : all.length - 1;
}

/** The show `id` stands for: itself, or the newest. */
export function chosenShow(all: readonly Show[], id: string | null): Show | null {
  return all[showIndex(all, id)] ?? null;
}

/** The show `dir` steps from `id`, round the ends. */
export function stepShow(all: readonly Show[], id: string | null, dir: number): string | null {
  if (!all.length) return id;
  const i = showIndex(all, id);
  return all[(i + dir + all.length) % all.length].id;
}

/** The first show of the year `dir` years on from `id`'s (the years there are shows from), round the ends. */
export function stepYear(all: readonly Show[], id: string | null, dir: number): string | null {
  if (!all.length) return id;
  const years = [...new Set(all.map((s) => s.date.slice(0, 4)))];
  const at = years.indexOf(all[showIndex(all, id)].date.slice(0, 4));
  const year = years[(at + dir + years.length) % years.length];
  return all.find((s) => s.date.startsWith(year))!.id;
}

/** A show at random, not `id`. */
export function randomShow(all: readonly Show[], id: string | null, rand = Math.random): string | null {
  if (all.length < 2) return all[0]?.id ?? id;
  const i = showIndex(all, id);
  const j = (i + 1 + Math.floor(rand() * (all.length - 1))) % all.length;
  return all[j].id;
}

/** How a show reads in a list: where, then when. */
export function showLabel(s: Show): string {
  return `${s.venue || 'Somewhere'}, ${s.date}`;
}
