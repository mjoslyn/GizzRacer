import type { LiveRecording, MusicCue, MusicPlayer } from './music';

/**
 * The live soundtrack (Settings > Soundtrack), from the band's shows on the
 * Internet Archive's Live Music Archive:
 *
 * - matching song: each race plays a live recording of its track's song,
 *   picked at random (public/music/bootlegs.json), looping;
 * - full show: a whole show plays through in order, song after song, and
 *   keeps playing across races and menus; when it ends another starts
 *   (public/music/shows.json, its set list read from archive.org when it's
 *   picked).
 *
 * Both written by tools/bootlegs.mjs. Nothing is rehosted: the audio
 * streams from archive.org, and anything that won't plays the game's own
 * music instead. The mini player (ui/miniPlayer.ts) and the settings screen
 * drive it.
 */
export type LiveMode = 'song' | 'show';

export interface Show {
  id: string;
  date: string;
  venue: string;
}

export interface Playing {
  rec: LiveRecording;
  /** The song's title. */
  title: string;
  mode: LiveMode;
  /** Full show: the set and where in it. */
  set?: { show: Show; songs: LiveRecording[]; titles: string[]; index: number };
}

const BASE = 'music/';

export class LiveRadio {
  private bootlegs: Promise<Record<string, LiveRecording[]>> | null = null;
  private shows: Promise<Show[]> | null = null;
  private now: Playing | null = null;
  /** Matching song: the recordings played, to step back through. */
  private history: LiveRecording[] = [];
  private fallback: readonly MusicCue[] = [];
  private readonly listeners = new Set<() => void>();
  /** Bumped by every new request, so an answer that comes back late is dropped. */
  private ticket = 0;

  constructor(
    private readonly music: MusicPlayer,
    private readonly rand: () => number = Math.random,
  ) {}

  /** What's playing (or about to), for the mini player and the HUD. */
  get playing(): Playing | null {
    return this.now;
  }

  /** Runs on every change of what's playing. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  /** Lets go: the game's own music takes over (the caller plays it). */
  stop(): void {
    this.ticket++;
    this.now = null;
    this.changed();
  }

  /**
   * Matching song: a live recording of `song`, at random, looping for the
   * race; `fallback` plays when there's none or it won't stream. Resolves
   * to false when there was none to play.
   */
  async playSong(song: string, fallback: readonly MusicCue[]): Promise<boolean> {
    const t = ++this.ticket;
    this.fallback = fallback;
    const all = await this.loadBootlegs();
    if (t !== this.ticket) return true;
    const list = all[song] ?? [];
    if (!list.length) {
      this.now = null;
      this.changed();
      return false;
    }
    const last = this.now?.mode === 'song' && this.now.title === song ? this.now.rec : null;
    // Not the one just played, when there's a choice.
    const pool = list.length > 1 && last ? list.filter((r) => r.file !== last.file || r.id !== last.id) : list;
    this.startSong(song, pool[Math.floor(this.rand() * pool.length)]);
    return true;
  }

  private startSong(title: string, rec: LiveRecording): void {
    if (this.now?.mode === 'song') this.history.push(this.now.rec);
    this.now = { rec, title, mode: 'song' };
    this.music.playLive(rec, this.fallback);
    this.changed();
  }

  /**
   * Full show: keeps the show playing if one is (across races and menus),
   * else starts one at random from its first song.
   */
  async ensureShow(fallback: readonly MusicCue[]): Promise<void> {
    this.fallback = fallback;
    if (this.now?.mode === 'show') return;
    await this.newShow();
  }

  /** Full show: another show, picked at random, from its first song. */
  async newShow(): Promise<void> {
    const t = ++this.ticket;
    const shows = await this.loadShows();
    for (let tries = 0; tries < 4 && shows.length; tries++) {
      const show = shows[Math.floor(this.rand() * shows.length)];
      const set = await setList(show).catch(() => null);
      if (t !== this.ticket) return;
      if (!set?.songs.length) continue;
      this.playSet({ show, ...set, index: 0 });
      return;
    }
    // Nothing to stream: the game's music.
    this.now = null;
    this.music.play(this.fallback);
    this.changed();
  }

  private playSet(set: NonNullable<Playing['set']>): void {
    const rec = set.songs[set.index];
    this.now = { rec, title: set.titles[set.index], mode: 'show', set };
    this.music.playLive(rec, this.fallback, { onEnded: () => this.next() });
    this.changed();
  }

  /** The next song: on in the set (another show after its last), or another recording of the song. */
  next(): void {
    const now = this.now;
    if (!now) return;
    if (now.set) {
      if (now.set.index + 1 < now.set.songs.length) this.playSet({ ...now.set, index: now.set.index + 1 });
      else void this.newShow();
    } else {
      void this.playSong(now.title, this.fallback);
    }
  }

  /** The song before: back in the set, or the recording played before this one. */
  prev(): void {
    const now = this.now;
    if (!now) return;
    if (now.set) {
      this.playSet({ ...now.set, index: Math.max(0, now.set.index - 1) });
      return;
    }
    const before = this.history.pop();
    if (!before) return;
    this.ticket++;
    this.now = { rec: before, title: now.title, mode: 'song' };
    this.music.playLive(before, this.fallback);
    this.changed();
  }

  togglePause(): void {
    if (this.music.toggleLivePause()) this.changed();
  }

  get paused(): boolean {
    return this.music.livePaused;
  }

  private loadBootlegs(): Promise<Record<string, LiveRecording[]>> {
    this.bootlegs ??= fetchJson<Record<string, LiveRecording[]>>(`${BASE}bootlegs.json`).catch(() => {
      this.bootlegs = null;
      return {};
    });
    return this.bootlegs;
  }

  private loadShows(): Promise<Show[]> {
    this.shows ??= fetchJson<Show[]>(`${BASE}shows.json`).catch(() => {
      this.shows = null;
      return [];
    });
    return this.shows;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return (await r.json()) as T;
}

interface ArchiveFile {
  name: string;
  format?: string;
  title?: string;
  length?: string;
}

/** A show's set, in order, from its MP3s on archive.org. */
export async function setList(show: Show): Promise<{ songs: LiveRecording[]; titles: string[] }> {
  const files = (await fetchJson<{ result?: ArchiveFile[] }>(`https://archive.org/metadata/${encodeURIComponent(show.id)}/files`)).result ?? [];
  return setFromFiles(show, files);
}

/** The set from a show's file list: its MP3s in file order, titled from their tags, else their names, else their place. */
export function setFromFiles(show: Show, files: readonly ArchiveFile[]): { songs: LiveRecording[]; titles: string[] } {
  const mp3s = files.filter((f) => f.format === 'VBR MP3').sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return {
    songs: mp3s.map((f) => ({ id: show.id, file: f.name, date: show.date, venue: show.venue, seconds: seconds(f.length) })),
    titles: mp3s.map((f, i) => {
      const t = cleanTitle(f.title ?? f.name);
      // A file with no title tag and a name that's only a number: just its place in the set.
      return !f.title && !/\s/.test(t) && /\d/.test(t) ? `Track ${i + 1}` : t;
    }),
  };
}

/** A track's title without the segue arrows a taper writes after it, or a file's name without its number and extension. */
export function cleanTitle(t: string): string {
  return (
    t
      .split('/')
      .pop()!
      .replace(/\.mp3$/i, '')
      .replace(/^(?:[a-z]*\d[\w.-]*?[-_. ]+)?(?:d\d+)?t?\d+[-_. ]+/i, '')
      .replace(/\s*-?>+\s*$/, '')
      .trim() || t
  );
}

function seconds(length?: string): number {
  if (!length) return 0;
  if (/^\d+(\.\d+)?$/.test(length)) return Math.round(Number(length));
  return length.split(':').reduce((a, b) => a * 60 + Number(b), 0);
}
