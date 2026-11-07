/** What every skill game on a card shares: its stage, its shape, its synth voices, its colours (ui/skillScreen.ts runs them). */

import type { CardSim, CardSound } from '../../core/cardSkills';
/** How a skill game ended: passed or not, and a line saying how it went. */
export interface SkillResult {
  passed: boolean;
  note: string;
}

/** The box a game draws in, and the line under its title. */
export interface Stage {
  g: CanvasRenderingContext2D;
  x: number;
  y: number;
  size: number;
  status: (text: string) => void;
}

export interface MiniGame {
  update(t: number, dt: number): void;
  draw(s: Stage, t: number): void;
  key(code: string, repeat: boolean): void;
  /** A key let go (for a key held down). */
  keyUp?(code: string): void;
  /** A tap, in the stage's own 0..1 square (and in pixels, for a card over the whole screen). */
  tap(u: number, v: number, px: number, py: number): void;
  /** The finger or button lifted (for a button held down to repeat). */
  release?(): void;
  result: SkillResult | null;
  /** A rules card is up over the whole screen: the title and the lines round the stage stay off it. */
  readonly carded?: boolean;
  stop?(): void;
}

export const GOLD = '#ffd23a';
export const INK = '#3a0f45';
export const CREAM = '#fff6d0';
export const LANE_COLORS = ['#ff5ad0', '#3ad8ff', '#9ad83a', '#ff9a1f'];

/** Little synth voices for the games, on the music's audio context. */
export class Synth {
  constructor(
    private readonly context: () => AudioContext | null,
    private readonly volume: () => number,
  ) {}

  /** A plucked note. */
  note(freq: number, dur = 0.25, type: OscillatorType = 'sawtooth', level = 0.12): void {
    const ctx = this.context();
    const v = this.volume();
    if (!ctx || v <= 0) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, t);
    filter.frequency.exponentialRampToValueAtTime(600, t + dur);
    gain.gain.setValueAtTime(level * v, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** A kick drum, for keeping time. */
  kick(level = 0.5): void {
    const ctx = this.context();
    const v = this.volume();
    if (!ctx || v <= 0) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    gain.gain.setValueAtTime(level * v, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  /** A rattle: a short burst of hiss. */
  rattle(level = 0.18): void {
    const ctx = this.context();
    const v = this.volume();
    if (!ctx || v <= 0) return;
    const t = ctx.currentTime;
    const len = Math.round(ctx.sampleRate * 0.12);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Three quick clicks of hiss, as the tail's rings knock.
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - ((i / len) * 3) % 1) ** 2;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = 3000;
    gain.gain.value = level * v;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t);
  }

  /** A dull miss. */
  thud(): void {
    this.note(70, 0.18, 'square', 0.1);
  }

  /** A held tone whose pitch can be moved; returns its controls. */
  hold(freq: number, level = 0.1): { set(freq: number): void; stop(): void } {
    const ctx = this.context();
    const v = this.volume();
    if (!ctx || v <= 0) return { set: () => {}, stop: () => {} };
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(level * v, ctx.currentTime + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    return {
      set: (f) => osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.01),
      stop: () => {
        gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
        osc.stop(ctx.currentTime + 0.3);
      },
    };
  }
}

export function panel(s: Stage): void {
  const g = s.g;
  g.fillStyle = 'rgba(48, 10, 64, 0.9)';
  g.fillRect(s.x, s.y, s.size, s.size);
  g.strokeStyle = GOLD;
  g.lineWidth = 3;
  g.strokeRect(s.x, s.y, s.size, s.size);
}

/**
 * A card game's screen over its simulation (core/cardSkills.ts): the
 * simulation runs on the screen's time, and the sounds it asks for are
 * played here. Giving up (the screen's Escape) sets the result over it.
 */
export abstract class SimGame<S extends CardSim> implements MiniGame {
  private given: SkillResult | null = null;

  constructor(
    protected readonly synth: Synth,
    protected readonly sim: S,
  ) {}

  get result(): SkillResult | null {
    return this.given ?? this.sim.result;
  }

  set result(r: SkillResult | null) {
    this.given = r;
  }

  update(_t: number, dt: number): void {
    this.sim.update(dt);
    for (const x of this.sim.sounds.splice(0)) this.sound(x);
  }

  protected abstract sound(x: CardSound): void;
  abstract draw(s: Stage, t: number): void;
  abstract key(code: string, repeat: boolean): void;
  abstract tap(u: number, v: number, px: number, py: number): void;
}

/** A line of text on the stage, `size` a share of it. */
export function say(s: Stage, text: string, u: number, v: number, size: number, color = CREAM, align: CanvasTextAlign = 'center', bold = true): void {
  const g = s.g;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.font = `${bold ? 'bold ' : ''}${Math.max(11, s.size * size)}px Verdana, sans-serif`;
  g.fillStyle = color;
  g.fillText(text, s.x + u * s.size, s.y + v * s.size);
  g.textBaseline = 'alphabetic';
}

/** A row of round marks: gold for a round won, red for one lost, faint for one to come. */
export function marks(s: Stage, list: readonly boolean[], of: number, u: number, v: number): void {
  const g = s.g;
  for (let i = 0; i < of; i++) {
    const m = list[i];
    g.fillStyle = m === undefined ? 'rgba(255,255,255,0.25)' : m ? GOLD : '#ff5a5a';
    g.beginPath();
    g.arc(s.x + s.size * (u + (i - (of - 1) / 2) * 0.06), s.y + s.size * v, s.size * 0.02, 0, Math.PI * 2);
    g.fill();
  }
}

/** Clips drawing to the stage's panel (call g.restore() after). */
export function clipStage(s: Stage): void {
  s.g.save();
  s.g.beginPath();
  s.g.rect(s.x + 3, s.y + 3, s.size - 6, s.size - 6);
  s.g.clip();
}
