import { liveUrl, type LiveRecording, type MusicCue, type MusicPlayer } from './music';
import { readOpening, talkTrack } from './talk';

/**
 * The live soundtrack, from the band's shows on the Internet Archive's Live
 * Music Archive:
 *
 * - Track song (Settings > Soundtrack, and the picker's Sound row): each
 *   race a live recording of its track's song, picked at random
 *   (public/music/bootlegs.json), looping;
 * - a live set (Infinite mode's Music row): a show picked from
 *   public/music/shows.json, its set list read from archive.org, played
 *   from the top song after song, and the next show on the list after it.
 *
 * Every song starts where the band does, past any talk (audio/talk.ts): the
 * catalogue's own `start`, or for a set's songs worked out from the opening
 * of the file, while the song before plays. Tracks that are all talk
 * (banter, tuning, the encore break, a snippet under SHORT seconds) are
 * skipped. Nothing is rehosted: the audio streams from archive.org, and
 * anything that won't plays the game's own music instead. Driven by the
 * mini player (ui/miniPlayer.ts).
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
  /** Playing a show through: the set and where in it. */
  set?: { show: Show; songs: LiveRecording[]; titles: string[]; index: number };
}

const BASE = 'music/';
/** A set's track this short (s) is talk or a snippet, not a song. */
const SHORT = 45;
/** How long (ms) a song waits to know where its music starts before it plays from the top. */
const START_WAIT = 3000;
/** Bytes of a file's opening read to find where the music starts: about a minute and a half. */
const OPENING_BYTES = 2_500_000;

export class LiveRadio {
  private bootlegs: Promise<Record<string, LiveRecording[]>> | null = null;
  private showList: Promise<Show[]> | null = null;
  private now: Playing | null = null;
  /** Track song: the recordings played, to step back through. */
  private history: LiveRecording[] = [];
  private fallback: readonly MusicCue[] = [];
  private readonly listeners = new Set<() => void>();
  /** Where each song's music starts and how loud it is, worked out once. */
  private readonly openings = new Map<string, Promise<Opening | null>>();
  /** Bumped by every new request, so an answer that comes back late is dropped. */
  private ticket = 0;

  constructor(
    private readonly music: MusicPlayer,
    private readonly rand: () => number = Math.random,
    /** Where a recording's music starts (s) and the gain (dB) that evens its level; reads the opening of the file by default. */
    private readonly read: (rec: LiveRecording) => Promise<Opening> = readRecording,
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
    if (this.now?.mode === 'song') this.history.push(this.now.rec);
    this.now = { rec, title: song, mode: 'song' };
    this.music.playLive(rec, this.fallback);
    this.changed();
    return true;
  }

  /** The shows there are to play whole, oldest first. */
  shows(): Promise<Show[]> {
    this.showList ??= fetchJson<Show[]>(`${BASE}shows.json`).catch(() => {
      this.showList = null;
      return [];
    });
    return this.showList;
  }

  /** Plays `show` through from its first song, unless it's already playing (across races and tracks). */
  async ensureShow(show: Show, fallback: readonly MusicCue[]): Promise<void> {
    this.fallback = fallback;
    if (this.now?.mode === 'show' && this.now.set?.show.id === show.id) return;
    await this.playShow(show);
  }

  /** A show from its first song (past any talk), then the next show on the list after its last; another if one won't load. */
  async playShow(show: Show): Promise<void> {
    const t = ++this.ticket;
    let at = show;
    for (let tries = 0; tries < 4; tries++) {
      const set = await setList(at).catch(() => null);
      if (t !== this.ticket) return;
      const first = set?.songs.length ? playable(set, 0, 1) : 0;
      if (set && first < set.songs.length) {
        void this.playSet({ show: at, ...set, index: first });
        return;
      }
      const next = await this.showAfter(at);
      if (t !== this.ticket) return;
      if (!next) break;
      at = next;
    }
    // Nothing to stream: the game's music.
    this.now = null;
    this.music.play(this.fallback);
    this.changed();
  }

  /** The show after `show` on the list, round to the first after the last. */
  private async showAfter(show: Show): Promise<Show | null> {
    const list = await this.shows();
    if (!list.length) return null;
    const i = list.findIndex((s) => s.id === show.id);
    return list[(i + 1) % list.length];
  }

  /** Plays a set's song (shown at once), starting where its music does, at an even level, if that's known within START_WAIT. */
  private async playSet(set: NonNullable<Playing['set']>): Promise<void> {
    const t = ++this.ticket;
    const rec = set.songs[set.index];
    this.now = { rec, title: set.titles[set.index], mode: 'show', set };
    this.changed();
    const opening = await Promise.race([this.openingOf(rec), new Promise<null>((res) => setTimeout(() => res(null), START_WAIT))]);
    if (t !== this.ticket) return;
    this.music.playLive(rec, this.fallback, { start: opening?.start ?? 0, gain: opening?.gain, onEnded: () => this.next() });
    this.prefetch(set, set.index);
  }

  /** Reads the next song's opening while this one plays, so it's ready. */
  private prefetch(set: NonNullable<Playing['set']>, from: number): void {
    const i = playable(set, from + 1, 1);
    if (i < set.songs.length) void this.openingOf(set.songs[i]);
  }

  /** Where a song's music starts and its gain: the catalogue's, else read from its file (once); null when it can't be read. */
  private openingOf(rec: LiveRecording): Promise<Opening | null> {
    if (rec.start !== undefined && rec.gain !== undefined) return Promise.resolve({ start: rec.start, gain: rec.gain });
    const key = `${rec.id}/${rec.file}`;
    let p = this.openings.get(key);
    if (!p) {
      p = this.read(rec).catch(() => null);
      this.openings.set(key, p);
    }
    return p;
  }

  /** The next song: on in the set (the next show after its last), or another recording of the song. */
  next(): void {
    const now = this.now;
    if (!now) return;
    if (now.set) {
      const i = playable(now.set, now.set.index + 1, 1);
      if (i < now.set.songs.length) void this.playSet({ ...now.set, index: i });
      else
        void this.showAfter(now.set.show).then((s) => {
          if (s && this.now === now) void this.playShow(s);
        });
    } else {
      void this.playSong(now.title, this.fallback);
    }
  }

  /** The song before: back in the set, or the recording played before this one. */
  prev(): void {
    const now = this.now;
    if (!now) return;
    if (now.set) {
      const i = playable(now.set, now.set.index - 1, -1);
      void this.playSet({ ...now.set, index: i >= 0 ? i : now.set.index });
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
}

/** The first song of a set from `from` stepping by `dir` that isn't all talk; past either end when there's none. */
export function playable(set: { songs: readonly LiveRecording[]; titles: readonly string[] }, from: number, dir: 1 | -1): number {
  let i = from;
  while (i >= 0 && i < set.songs.length && (talkTrack(set.titles[i]) || (set.songs[i].seconds > 0 && set.songs[i].seconds < SHORT))) i += dir;
  return i;
}

/** Where a recording's music starts (s, past any talk) and the gain (dB) that evens its level. */
export interface Opening {
  start: number;
  gain: number;
}

/** A recording's opening, read from the first OPENING_BYTES of its file (audio/talk.ts); throws when it can't be. */
async function readRecording(rec: LiveRecording): Promise<Opening> {
  const r = await fetch(liveUrl(rec), { headers: { Range: `bytes=0-${OPENING_BYTES - 1}` } });
  if (!r.ok) throw new Error(`${r.status}`);
  const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await r.arrayBuffer());
  const ch = buffer.getChannelData(0);
  if (buffer.numberOfChannels > 1) {
    const right = buffer.getChannelData(1);
    for (let i = 0; i < ch.length; i++) ch[i] = (ch[i] + right[i]) / 2;
  }
  return readOpening(ch, buffer.sampleRate);
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
