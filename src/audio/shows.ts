import type { Show } from './radio';

/**
 * The shows a Full set can play (Settings > Soundtrack: Full set, and the
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

const escape = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A dropdown of every show, newest year first, each year's shows in date order, `id`'s selected. */
export function showSelect(all: readonly Show[], id: string | null, cls: string): string {
  const at = chosenShow(all, id);
  const years = new Map<string, Show[]>();
  for (const s of all) {
    const y = s.date.slice(0, 4);
    if (!years.has(y)) years.set(y, []);
    years.get(y)!.push(s);
  }
  const groups = [...years.entries()]
    .reverse()
    .map(([y, list]) => `<optgroup label="${y}">${list.map((s) => `<option value="${escape(s.id)}"${s === at ? ' selected' : ''}>${escape(showLabel(s))}</option>`).join('')}</optgroup>`)
    .join('');
  return `<select class="${cls}" aria-label="Full set: which show">${groups}</select>`;
}
