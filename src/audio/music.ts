/**
 * Seamless looping music from pre-rendered MP3s (tools/render-soundtrack.mjs).
 * Each file holds exactly one loop; MP3 encoders pad the front with a little
 * silence, so the loop start is found on decode and the loop length comes
 * from the manifest.
 */

export type MusicCue =
  | 'title'
  | 'infinite-loop-speedway'
  | 'rattlesnake-run'
  | 'rattlesnake-run-final-lap'
  | 'volcano-fortress'
  | 'polygondwanaland-jungle'
  | 'podium';

interface ManifestEntry {
  loopSamples: number;
  sampleRate: number;
}

interface Loop {
  buffer: AudioBuffer;
  start: number; // seconds
  end: number;
}

interface Playing {
  cue: MusicCue;
  source: AudioBufferSourceNode;
  gain: GainNode;
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
  private muted = false;
  volume = 0.7;

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
    this.master.connect(this.ctx.destination);
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

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  /** Crossfades to `cue`; a no-op if it is already playing. Remembered until audio unlocks. */
  play(cue: MusicCue): void {
    if (this.wanted === cue) return;
    this.wanted = cue;
    if (this.ctx) void this.start(cue);
  }

  stop(): void {
    this.wanted = null;
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
    this.current = { cue, source, gain };
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
    this.manifest ??= fetch(`${BASE}manifest.json`).then((r) => r.json());
    const [entry, data] = await Promise.all([this.manifest.then((m) => m[cue]), fetch(`${BASE}${cue}.mp3`).then((r) => r.arrayBuffer())]);
    const buffer = await this.ctx!.decodeAudioData(data);
    const lead = leadIn(buffer);
    const length = entry ? entry.loopSamples / entry.sampleRate : buffer.duration - lead / buffer.sampleRate;
    const start = lead / buffer.sampleRate;
    return { buffer, start, end: Math.min(buffer.duration, start + length) };
  }
}

/** Samples of near silence the decoder left before the music starts. */
function leadIn(buffer: AudioBuffer): number {
  const ch = buffer.getChannelData(0);
  const limit = Math.min(MAX_LEAD_IN, ch.length);
  for (let i = 0; i < limit; i++) if (Math.abs(ch[i]) > 0.002) return i;
  return 0;
}
