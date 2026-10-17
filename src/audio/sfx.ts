import type { HazardKind } from '../items/hazards';
import type { ItemKind } from '../items/items';

/**
 * Synthesized sound effects (spec section 10): no samples, everything is
 * oscillators and filtered noise on the music's AudioContext. The engine
 * is a continuous voice pitched by speed with fuzz on boosts; hazards are
 * panned and faded by distance from the listener.
 */
export class Sfx {
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private engine: Engine | null = null;
  private devil: { src: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode } | null = null;
  private rattleWait = 0;
  muted = false;
  volume = 0.55;

  constructor(private readonly context: () => AudioContext | null) {}

  private get ctx(): AudioContext | null {
    const ctx = this.context();
    if (!ctx) return null;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = this.muted ? 0 : this.volume;
      this.out.connect(ctx.destination);
      this.noise = whiteNoise(ctx);
    }
    return ctx;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.out) this.out.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  }

  /**
   * The player's engine. `level` 0 silences it (menus, pause); speed is
   * a 0..1 fraction of top speed.
   */
  updateEngine(level: number, speed: number, boosting: boolean, drifting: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.engine ??= new Engine(ctx, this.out!);
    this.engine.set(ctx, level, speed, boosting, drifting);
  }

  countdown(go: boolean): void {
    this.tone(go ? 880 : 440, go ? 0.5 : 0.18, 'square', 0.16);
    if (go) this.tone(1320, 0.5, 'square', 0.06);
  }

  hop(): void {
    this.tone(260, 0.08, 'square', 0.06, 520);
  }

  land(intensity: number): void {
    this.hit(0.12, 260, Math.min(0.35, 0.08 + intensity * 0.03));
  }

  wall(intensity: number): void {
    this.hit(0.14, 700, Math.min(0.4, 0.1 + intensity * 0.12));
  }

  /** A drift reached spark tier 1..3. */
  driftTier(tier: number): void {
    const f = [0, 660, 880, 1175][tier];
    this.tone(f, 0.12, 'triangle', 0.12);
    this.tone(f * 2, 0.1, 'sine', 0.05, undefined, 0.03);
  }

  boost(tier: number): void {
    this.whoosh(0.35 + tier * 0.1, 500, 2600, 0.22);
  }

  trick(): void {
    [784, 988, 1319].forEach((f, i) => this.tone(f, 0.09, 'triangle', 0.1, undefined, i * 0.06));
  }

  pickup(): void {
    [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.07, 'triangle', 0.08, undefined, i * 0.045));
  }

  itemReady(): void {
    this.tone(1568, 0.08, 'sine', 0.08);
    this.tone(2093, 0.14, 'sine', 0.08, undefined, 0.07);
  }

  use(item: ItemKind): void {
    switch (item) {
      case 'fuzzPedal':
        // A fuzzed power chord, the boost's own engine fuzz follows.
        [110, 165, 220].forEach((f) => this.tone(f, 0.45, 'sawtooth', 0.07, undefined, 0, true));
        break;
      case 'microtonalMine':
        this.tone(620, 0.35, 'triangle', 0.12, 590);
        this.tone(640, 0.35, 'triangle', 0.1, 600);
        break;
      case 'feedbackWave':
        this.tone(1800, 0.5, 'sine', 0.12, 120);
        this.whoosh(0.5, 2000, 300, 0.12);
        break;
      case 'riffMissile':
        [220, 277, 330, 440].forEach((f, i) => this.tone(f, 0.08, 'sawtooth', 0.07, undefined, i * 0.05, true));
        break;
      case 'tempoShift':
        this.tone(880, 0.7, 'square', 0.08, 220);
        break;
    }
  }

  /** The player got hit, by an item or a hazard. */
  hurt(by: ItemKind | HazardKind): void {
    if (by === 'tumbleweeds') {
      this.hit(0.18, 1200, 0.25);
      return;
    }
    if (by === 'dustDevils') return;
    if (by === 'boulders') this.hit(0.3, 180, 0.5);
    this.tone(700, 0.55, 'sawtooth', 0.09, 140);
    this.tone(720, 0.55, 'sawtooth', 0.07, 150);
  }

  /** The player's item hit someone. */
  scored(): void {
    this.tone(523, 0.1, 'square', 0.08);
    this.tone(784, 0.18, 'square', 0.08, undefined, 0.08);
  }

  lap(final: boolean): void {
    const notes = final ? [659, 784, 988, 1319] : [784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.16, 'square', 0.08, undefined, i * 0.1));
  }

  finish(): void {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i === 5 ? 0.6 : 0.14, 'square', 0.08, undefined, i * 0.12));
  }

  menu(): void {
    this.tone(660, 0.05, 'square', 0.05);
  }

  /**
   * Hazard ambience. `rattle` and `devil` are the nearest snake and dust
   * devil as distance (m) and pan (-1 left .. 1 right), or null.
   */
  hazards(dt: number, rattle: { d: number; pan: number } | null, devil: { d: number; pan: number } | null): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.rattleWait -= dt;
    if (rattle && rattle.d < 35 && this.rattleWait <= 0) {
      this.rattleWait = 0.55;
      this.rattleBurst(ctx, (1 - rattle.d / 35) * 0.35, rattle.pan);
    }
    if (!this.devil) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 500;
      bp.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      src.connect(bp).connect(gain).connect(pan).connect(this.out!);
      src.start();
      this.devil = { src, gain, pan };
    }
    const level = devil && devil.d < 45 ? (1 - devil.d / 45) ** 2 * 0.5 : 0;
    this.devil.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.1);
    this.devil.pan.pan.setTargetAtTime(devil?.pan ?? 0, ctx.currentTime, 0.1);
  }

  private rattleBurst(ctx: AudioContext, level: number, pan: number): void {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3500;
    const gain = ctx.createGain();
    // A fast train of clicks: the rattle.
    gain.gain.setValueAtTime(0, t);
    for (let i = 0; i < 9; i++) {
      gain.gain.setValueAtTime(level, t + i * 0.035);
      gain.gain.setValueAtTime(level * 0.15, t + i * 0.035 + 0.015);
    }
    gain.gain.setValueAtTime(0, t + 0.33);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(hp).connect(gain).connect(p).connect(this.out!);
    src.start(t, Math.random());
    src.stop(t + 0.35);
  }

  private tone(freq: number, dur: number, type: OscillatorType, level: number, slideTo?: number, delay = 0, fuzz = false): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    let node: AudioNode = osc;
    if (fuzz) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = fuzzCurve();
      node = node.connect(shaper);
    }
    node.connect(gain).connect(this.out!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** A low-passed noise thump. */
  private hit(dur: number, cutoff: number, level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp).connect(gain).connect(this.out!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** A band-passed noise sweep. */
  private whoosh(dur: number, from: number, to: number, level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + dur * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(gain).connect(this.out!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }
}

/** Two detuned oscillators through a low-pass, with a fuzz send that opens on boosts. */
class Engine {
  private readonly a: OscillatorNode;
  private readonly b: OscillatorNode;
  private readonly filter: BiquadFilterNode;
  private readonly clean: GainNode;
  private readonly dirty: GainNode;

  constructor(ctx: AudioContext, out: AudioNode) {
    this.a = ctx.createOscillator();
    this.a.type = 'sawtooth';
    this.b = ctx.createOscillator();
    this.b.type = 'square';
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 4;
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    this.a.connect(mix);
    this.b.connect(mix);
    mix.connect(this.filter);
    this.clean = ctx.createGain();
    this.clean.gain.value = 0;
    this.dirty = ctx.createGain();
    this.dirty.gain.value = 0;
    const shaper = ctx.createWaveShaper();
    shaper.curve = fuzzCurve();
    this.filter.connect(this.clean).connect(out);
    this.filter.connect(shaper).connect(this.dirty).connect(out);
    this.a.start();
    this.b.start();
  }

  set(ctx: AudioContext, level: number, speed: number, boosting: boolean, drifting: boolean): void {
    const t = ctx.currentTime;
    const v = Math.max(0, Math.min(1.3, speed));
    // Idle burble up to a howl; drifting revs a little higher.
    const f = 42 + v * 120 + (drifting ? 14 : 0);
    this.a.frequency.setTargetAtTime(f, t, 0.06);
    this.b.frequency.setTargetAtTime(f * 0.501, t, 0.06);
    this.filter.frequency.setTargetAtTime(380 + v * 1500, t, 0.08);
    this.clean.gain.setTargetAtTime(level * (0.05 + v * 0.05), t, 0.08);
    this.dirty.gain.setTargetAtTime(boosting ? level * 0.07 : 0, t, 0.05);
  }
}

let fuzz: Float32Array<ArrayBuffer> | null = null;

/** Hard-ish clipping curve for the fuzz. */
function fuzzCurve(): Float32Array<ArrayBuffer> {
  if (fuzz) return fuzz;
  const n = 1024;
  fuzz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    fuzz[i] = Math.tanh(x * 9) * 0.8;
  }
  return fuzz;
}

function whiteNoise(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
