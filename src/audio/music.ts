/**
 * Seamless looping music from pre-rendered MP3s (tools/render-soundtrack.mjs).
 * Each file holds exactly one loop; MP3 encoders pad the front with a little
 * silence, so the loop start is found on decode and the loop length comes
 * from the manifest.
 */

/**
 * A file in public/music: a track's theme (its id) or final-lap cut
 * (`<track>-final-lap`), which is what races play, or the title and podium
 * music. The remixes (`<track>-remix`, `<track>-remix-final-lap`) are there
 * but nothing plays them. Which exist is in manifest.json.
 */
export type MusicCue = string;

/** Tempo of each classic song in seqbaby (seqbaby-seed people.mjs), for beat-synced visuals; the rest come from the manifest. */
const BPM: Record<string, number> = {
  title: 126,
  'infinite-loop-speedway': 164,
  'rattlesnake-run': 148,
  'rattlesnake-run-final-lap': 156,
  'volcano-fortress': 176,
  'polygondwanaland-jungle': 132,
  'fishies-lagoon': 120,
  'ice-v-glacier': 140,
  'cyboogie-city': 112,
  'butterfly-skyway': 128,
  'butterfly-skyway-final-lap': 136,
  podium: 96,
  'petrodragonic-apocalypse': 188,
  'petrodragonic-apocalypse-final-lap': 204,
  'hell-on-mars': 200,
  'hell-on-mars-final-lap': 212,
  supercell: 172,
  'supercell-final-lap': 184,
  'murder-of-the-universe': 150,
  'murder-of-the-universe-final-lap': 160,
  'phantom-island': 130,
  'phantom-island-final-lap': 138,
  'deadstick-drop': 160,
  'deadstick-drop-final-lap': 170,
  'panpsych-grove': 122,
  'panpsych-grove-final-lap': 130,
  'sea-of-doubt': 150,
  'sea-of-doubt-final-lap': 160,
  'magenta-mountain': 124,
  'magenta-mountain-final-lap': 132,
  'kepler-22b': 96,
  'kepler-22b-final-lap': 102,
  'goblin-garden': 118,
  'goblin-garden-final-lap': 126,
  'predator-x': 192,
  'predator-x-final-lap': 204,
};

interface ManifestEntry {
  /** Absent for a recording, which loops whole. */
  loopSamples?: number;
  sampleRate?: number;
  bpm?: number;
}

interface Loop {
  bpm: number;
  buffer: AudioBuffer;
  start: number; // seconds
  end: number;
}

interface Playing {
  cue: MusicCue;
  bpm: number;
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** Context time the loop's first beat played, and the loop length. */
  startedAt: number;
  length: number;
}

const BASE = 'music/';
const FADE = 0.6;
/** Largest encoder delay to look for at the head of a file, in samples. */
const MAX_LEAD_IN = 4000;

export class MusicPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private manifest: Promise<Record<string, ManifestEntry>> | null = null;
  private readonly loops = new Map<MusicCue, Promise<Loop>>();
  private current: Playing | null = null;
  private wanted: MusicCue | null = null;
  /** What was last asked for (a cue, or a list of them joined), so asking again is a no-op. */
  private wantedKey: string | null = null;
  private muted = false;
  /** Kept well under the sound effects so they cut through. */
  volume = 0.38;
  private duckGain: GainNode | null = null;
  /** Muffles the music under water. */
  private muffle: BiquadFilterNode | null = null;
  private muffled = 0;

  /** Creates the audio context; call from a user gesture (browsers require it). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state !== 'running') {
        void this.ctx.resume();
        this.primeIOS(this.ctx);
      }
      return;
    }
    // iOS: "playback" keeps music audible with the ring/silent switch on (Safari 17+).
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
    this.ctx = new AudioContext();
    this.primeIOS(this.ctx);
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.duckGain = this.ctx.createGain();
    this.muffle = this.ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.master.connect(this.duckGain).connect(this.muffle).connect(this.ctx.destination);
    if (this.wanted) void this.start(this.wanted);
  }

  /** iOS only opens the audio route once a sound starts inside the gesture: a one-sample silent buffer does it. */
  private primeIOS(ctx: AudioContext): void {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
    void ctx.resume();
  }

  /**
   * Where the music is within its beat: 0 on the beat, rising to 1 just
   * before the next. -1 when nothing is playing.
   */
  beatPhase(): number {
    const c = this.current;
    if (!c || !this.ctx) return -1;
    const pos = (((this.ctx.currentTime - c.startedAt) % c.length) + c.length) % c.length;
    const beats = (pos * c.bpm) / 60;
    return beats - Math.floor(beats);
  }

  /**
   * Dips the music under a sound effect: down to `level` quickly, back up
   * over `hold` seconds.
   */
  duck(level: number, hold: number): void {
    if (!this.ctx || !this.duckGain) return;
    const g = this.duckGain.gain;
    const t = this.ctx.currentTime;
    if (g.value < level) return; // already ducked deeper
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(level, t + 0.03);
    g.setTargetAtTime(1, t + 0.03 + hold * 0.4, hold * 0.3);
  }

  /** Under water, 0..1: the music sounds like it's coming from above the surface. */
  setMuffle(amount: number): void {
    if (!this.muffle || !this.ctx || Math.abs(amount - this.muffled) < 0.02) return;
    this.muffled = amount;
    this.muffle.frequency.setTargetAtTime(20000 * Math.pow(500 / 20000, amount), this.ctx.currentTime, 0.08);
  }

  /** The shared AudioContext once unlocked; sound effects play on it too. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  /**
   * Crossfades to `cue`, or to the first of a list that exists; a no-op if
   * it is already playing.
   * Remembered until audio unlocks.
   */
  play(cue: MusicCue | readonly MusicCue[]): void {
    const key = typeof cue === 'string' ? cue : cue.join('|');
    if (this.wantedKey === key) return;
    this.wantedKey = key;
    const list = typeof cue === 'string' ? [cue] : cue;
    void this.available(list).then((found) => {
      if (this.wantedKey !== key || !found) return;
      this.wanted = found;
      if (this.ctx) void this.start(found);
    });
  }

  /** The manifest: which cues exist. Fetched once. */
  private entries(): Promise<Record<string, ManifestEntry>> {
    this.manifest ??= fetch(`${BASE}manifest.json`)
      .then((r) => r.json())
      .catch(() => ({}));
    return this.manifest;
  }

  /** The first of `cues` the manifest lists (the last one if the manifest can't be read). */
  private async available(cues: readonly MusicCue[]): Promise<MusicCue | null> {
    const m = await this.entries();
    return cues.find((c) => c in m) ?? (Object.keys(m).length ? null : cues[cues.length - 1] ?? null);
  }

  /** Whether `cue` exists. */
  async has(cue: MusicCue): Promise<boolean> {
    return cue in (await this.entries());
  }

  stop(): void {
    this.wanted = null;
    this.wantedKey = null;
    this.fadeOut();
  }

  /** Starts decoding a cue ahead of time. */
  preload(cue: MusicCue): void {
    if (this.ctx) void this.loop(cue);
  }

  private async start(cue: MusicCue): Promise<void> {
    let loop: Loop;
    try {
      loop = await this.loop(cue);
    } catch (err) {
      console.warn(`music: could not load ${cue}`, err);
      return;
    }
    // Another cue may have been asked for while this one decoded.
    if (this.wanted !== cue || !this.ctx || !this.master) return;
    this.fadeOut();
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = loop.buffer;
    source.loop = true;
    source.loopStart = loop.start;
    source.loopEnd = loop.end;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE);
    source.connect(gain).connect(this.master);
    source.start(ctx.currentTime, loop.start);
    this.current = { cue, bpm: loop.bpm, source, gain, startedAt: ctx.currentTime, length: loop.end - loop.start };
  }

  private fadeOut(): void {
    if (!this.current || !this.ctx) return;
    const { source, gain } = this.current;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + FADE);
    source.stop(t + FADE + 0.05);
    this.current = null;
  }

  private loop(cue: MusicCue): Promise<Loop> {
    let p = this.loops.get(cue);
    if (!p) {
      p = this.decode(cue);
      this.loops.set(cue, p);
    }
    return p;
  }

  private async decode(cue: MusicCue): Promise<Loop> {
    const [entry, data] = await Promise.all([this.entries().then((m) => m[cue]), fetch(`${BASE}${cue}.mp3`).then((r) => r.arrayBuffer())]);
    const buffer = await this.ctx!.decodeAudioData(data);
    const lead = leadIn(buffer);
    const length = entry?.loopSamples && entry.sampleRate ? entry.loopSamples / entry.sampleRate : buffer.duration - lead / buffer.sampleRate;
    const start = lead / buffer.sampleRate;
    return { bpm: entry?.bpm ?? BPM[cue] ?? 120, buffer, start, end: Math.min(buffer.duration, start + length) };
  }
}

/** Samples of near silence the decoder left before the music starts. */
function leadIn(buffer: AudioBuffer): number {
  const ch = buffer.getChannelData(0);
  const limit = Math.min(MAX_LEAD_IN, ch.length);
  for (let i = 0; i < limit; i++) if (Math.abs(ch[i]) > 0.002) return i;
  return 0;
}
