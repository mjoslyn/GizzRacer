import type { LiveRecording, MusicCue, MusicPlayer } from './music';

/**
 * The live soundtrack (Settings > Soundtrack: Track song, and the picker's
 * Sound row): each race a live recording of its track's song, picked at
 * random from the band's shows on the Internet Archive's Live Music Archive
 * (public/music/bootlegs.json), looping. Each starts where the band does,
 * past any talk, at an even level (the catalogue's `start` and `gain`, from
 * tools/bootleg-starts.mjs). Nothing is rehosted: the audio streams from
 * archive.org, and anything that won't plays the game's own music instead.
 * Driven by the mini player (ui/miniPlayer.ts).
 */
export interface Playing {
  rec: LiveRecording;
  /** The song's title. */
  title: string;
}

const BASE = 'music/';

export class LiveRadio {
  private bootlegs: Promise<Record<string, LiveRecording[]>> | null = null;
  private now: Playing | null = null;
  /** The recordings played, to step back through. */
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
   * A live recording of `song`, at random, looping for the race. `fallback`
   * plays when it won't stream. Resolves to false when the song was never
   * recorded live.
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
    const last = this.now && this.now.title === song ? this.now.rec : null;
    // Not the one just played, when there's a choice.
    const pool = list.length > 1 && last ? list.filter((r) => r.file !== last.file || r.id !== last.id) : list;
    const rec = pool[Math.floor(this.rand() * pool.length)];
    if (this.now) this.history.push(this.now.rec);
    this.now = { rec, title: song };
    this.music.playLive(rec, this.fallback);
    this.changed();
    return true;
  }

  /** Another recording of the song. */
  next(): void {
    if (this.now) void this.playSong(this.now.title, this.fallback);
  }

  /** The recording played before this one. */
  prev(): void {
    const now = this.now;
    if (!now) return;
    const before = this.history.pop();
    if (!before) return;
    this.ticket++;
    this.now = { rec: before, title: now.title };
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
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return (await r.json()) as T;
}
