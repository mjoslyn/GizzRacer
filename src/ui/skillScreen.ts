import {
  BANANA_COARSE,
  BANANA_DRONE,
  BANANA_FINE,
  BANANA_NEED,
  BANANA_ROUNDS,
  BANANA_TIME,
  HOROLOGY_ROUNDS,
  NONAGON_FIRST,
  NONAGON_SIDES,
  RIFF_LANES,
  RIFF_OK,
  SKILLS,
  bananaHz,
  horologyHit,
  makeBanana,
  makeHorology,
  makeNonagon,
  makeRiff,
  riffJudge,
  riffPasses,
  type SkillKind,
} from '../core/skills';

/** How a skill game ended: passed or not, and a line saying how it went. */
export interface SkillResult {
  passed: boolean;
  note: string;
}

/** The box a game draws in, and the line under its title. */
interface Stage {
  g: CanvasRenderingContext2D;
  x: number;
  y: number;
  size: number;
  status: (text: string) => void;
}

interface MiniGame {
  update(t: number, dt: number): void;
  draw(s: Stage, t: number): void;
  key(code: string, repeat: boolean): void;
  /** A tap, in the stage's own 0..1 square. */
  tap(u: number, v: number): void;
  result: SkillResult | null;
  stop?(): void;
}

const GOLD = '#ffd23a';
const INK = '#3a0f45';
const CREAM = '#fff6d0';
const LANE_COLORS = ['#ff5ad0', '#3ad8ff', '#9ad83a', '#ff9a1f'];

/** Little synth voices for the games, on the music's audio context. */
class Synth {
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

/**
 * Story mode's skill games, drawn on a canvas over the game: Play the
 * Riff, Nonagon Infinity, the Flying Microtonal Banana and Horology. Keys,
 * mouse or touch. (The Deadstick Landing is flown on a track, in game.ts.)
 */
export class SkillScreen {
  onDone: (r: SkillResult) => void = () => {};
  private readonly el = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly synth: Synth;
  private game: MiniGame | null = null;
  private title = '';
  private howTo = '';
  private statusText = '';
  /** Seconds since the game began, by the clock (a slow frame never slows the riff). */
  private t = 0;
  private started = 0;
  private last = 0;
  private frame = 0;
  /** When the result came in, to show it a while before handing back. */
  private endedAt = -1;

  constructor(parent: HTMLElement, context: () => AudioContext | null, volume: () => number) {
    this.synth = new Synth(context, volume);
    this.el.className = 'skill';
    this.el.appendChild(this.canvas);
    parent.appendChild(this.el);
    this.canvas.addEventListener('pointerdown', (e) => {
      const st = this.stage();
      this.game?.tap((e.clientX - st.x) / st.size, (e.clientY - st.y) / st.size);
    });
  }

  get visible(): boolean {
    return this.game !== null;
  }

  start(kind: SkillKind, seed: number, level: number): void {
    this.stop();
    const s = this.synth;
    this.game = kind === 'riff' ? new RiffGame(s, seed, level) : kind === 'nonagon' ? new NonagonGame(s, seed, level) : kind === 'banana' ? new BananaGame(s, seed, level) : new HorologyGame(s, seed, level);
    this.title = SKILLS[kind].name;
    this.howTo = SKILLS[kind].howTo;
    this.t = 0;
    this.endedAt = -1;
    this.el.classList.add('show');
    this.started = this.last = performance.now();
    const tick = (now: number) => {
      if (!this.game) return;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.t = (now - this.started) / 1000;
      this.update(dt);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.game?.stop?.();
    this.game = null;
    this.el.classList.remove('show');
  }

  /** Returns true if the key was used. Escape gives up. */
  key(code: string, repeat: boolean): boolean {
    const g = this.game;
    if (!g) return false;
    if (g.result) return true;
    if (code === 'Escape' && !repeat) {
      g.result = { passed: false, note: 'Gave up' };
      return true;
    }
    g.key(code, repeat);
    return true;
  }

  private update(dt: number): void {
    const g = this.game!;
    if (!g.result) g.update(this.t, dt);
    else if (this.endedAt < 0) this.endedAt = this.t;
    else if (this.t - this.endedAt > 1.4) {
      const r = g.result;
      this.stop();
      this.onDone(r);
      return;
    }
    this.draw();
  }

  /** The square the game plays in, under its title. */
  private stage(): Stage {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const top = Math.min(110, h * 0.18);
    const size = Math.max(160, Math.min(w - 32, h - top - 48, 560));
    return { g: this.canvas.getContext('2d')!, x: (w - size) / 2, y: top, size, status: (text) => (this.statusText = text) };
  }

  private draw(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const st = this.stage();
    const g = st.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(20, 0, 30, 0.72)';
    g.fillRect(0, 0, w, h);
    this.game!.draw(st, this.t);
    const res = this.game!.result;
    g.textAlign = 'center';
    g.fillStyle = GOLD;
    g.font = `italic bold ${Math.min(34, w / 16)}px Verdana, sans-serif`;
    g.fillText(this.title.toUpperCase(), w / 2, st.y - 44);
    g.fillStyle = CREAM;
    g.font = `${Math.min(15, w / 32)}px Verdana, sans-serif`;
    g.fillText(res ? res.note : this.statusText || this.howTo, w / 2, st.y - 16);
    g.font = '12px Verdana, sans-serif';
    g.globalAlpha = 0.7;
    g.fillText(this.howTo + ' · Esc gives up', w / 2, Math.min(h - 14, st.y + st.size + 28));
    g.globalAlpha = 1;
    if (res) {
      g.fillStyle = res.passed ? GOLD : '#ff5a5a';
      g.font = `italic bold ${Math.min(64, w / 9)}px Verdana, sans-serif`;
      g.strokeStyle = INK;
      g.lineWidth = 6;
      const text = res.passed ? 'NAILED IT!' : 'NOT THIS TIME';
      g.strokeText(text, w / 2, st.y + st.size / 2);
      g.fillText(text, w / 2, st.y + st.size / 2);
    }
  }
}

function panel(s: Stage): void {
  const g = s.g;
  g.fillStyle = 'rgba(48, 10, 64, 0.9)';
  g.fillRect(s.x, s.y, s.size, s.size);
  g.strokeStyle = GOLD;
  g.lineWidth = 3;
  g.strokeRect(s.x, s.y, s.size, s.size);
}

// ---- Play the Riff ----

/** Lane pitches: E, G, A and B, an octave and a bit up from the open E. */
const RIFF_HZ = [164.81, 196, 220, 246.94];
const RIFF_KEYS: Record<string, number> = { ArrowLeft: 0, KeyD: 0, ArrowDown: 1, KeyF: 1, ArrowUp: 2, KeyJ: 2, ArrowRight: 3, KeyK: 3 };
const RIFF_ARROWS = ['←', '↓', '↑', '→'];
/** Seconds a note takes to fall the lane. */
const RIFF_FALL = 1.6;

class RiffGame implements MiniGame {
  result: SkillResult | null = null;
  private readonly riff;
  private readonly hit: ('good' | 'ok' | 'miss' | null)[];
  private hits = 0;
  private strays = 0;
  private lastBeat = -1;
  private readonly flash = [0, 0, 0, 0];
  private now = 0;

  constructor(
    private readonly synth: Synth,
    seed: number,
    level: number,
  ) {
    this.riff = makeRiff(seed, level);
    this.hit = this.riff.notes.map(() => null);
  }

  update(t: number, dt: number): void {
    this.now = t;
    const beat = Math.floor((t * this.riff.bpm) / 60);
    if (beat !== this.lastBeat && t < this.riff.length) {
      this.lastBeat = beat;
      this.synth.kick(beat % 4 === 0 ? 0.55 : 0.3);
    }
    this.riff.notes.forEach((n, i) => {
      if (this.hit[i] === null && t > n.t + RIFF_OK) this.hit[i] = 'miss';
    });
    for (let i = 0; i < RIFF_LANES; i++) this.flash[i] = Math.max(0, this.flash[i] - dt * 4);
    if (t > this.riff.length) {
      const n = this.riff.notes.length;
      this.result = { passed: riffPasses(this.riff, this.hits, this.strays), note: `${this.hits} of ${n} notes${this.strays ? `, ${this.strays} stray` : ''} (needed ${Math.ceil(n * this.riff.need)})` };
    }
  }

  key(code: string, repeat: boolean): void {
    const lane = RIFF_KEYS[code];
    if (lane !== undefined && !repeat) this.press(lane);
  }

  tap(u: number, v: number): void {
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) this.press(Math.min(RIFF_LANES - 1, Math.floor(u * RIFF_LANES)));
  }

  private press(lane: number): void {
    this.flash[lane] = 1;
    let best = -1;
    let bestD = Infinity;
    this.riff.notes.forEach((n, i) => {
      const d = Math.abs(n.t - this.now);
      if (n.lane === lane && this.hit[i] === null && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    const judged = best >= 0 ? riffJudge(this.riff.notes[best].t, this.now) : null;
    if (judged) {
      this.hit[best] = judged;
      this.hits++;
      this.synth.note(RIFF_HZ[lane] * 2, 0.3);
    } else {
      this.strays++;
      this.synth.thud();
    }
  }

  draw(s: Stage, t: number): void {
    panel(s);
    const g = s.g;
    const laneW = s.size / RIFF_LANES;
    const hitY = s.y + s.size * 0.85;
    for (let i = 0; i < RIFF_LANES; i++) {
      const x = s.x + i * laneW;
      g.fillStyle = `rgba(255, 255, 255, ${0.04 + this.flash[i] * 0.25})`;
      g.fillRect(x + 4, s.y + 4, laneW - 8, s.size - 8);
      g.fillStyle = LANE_COLORS[i];
      g.font = `bold ${laneW * 0.3}px Verdana, sans-serif`;
      g.textAlign = 'center';
      g.fillText(RIFF_ARROWS[i], x + laneW / 2, s.y + s.size * 0.96);
    }
    g.fillStyle = GOLD;
    g.fillRect(s.x + 4, hitY - 2, s.size - 8, 4);
    this.riff.notes.forEach((n, i) => {
      const state = this.hit[i];
      if (state === 'good' || state === 'ok') return;
      const y = hitY - ((n.t - t) / RIFF_FALL) * (hitY - s.y);
      if (y < s.y || y > s.y + s.size) return;
      g.globalAlpha = state === 'miss' ? 0.3 : 1;
      g.fillStyle = LANE_COLORS[n.lane];
      g.fillRect(s.x + n.lane * laneW + laneW * 0.15, y - 9, laneW * 0.7, 18);
      g.globalAlpha = 1;
    });
    const first = this.riff.notes[0]?.t ?? 0;
    s.status(t < first ? 'Count in...' : `${this.hits} hit${this.strays ? ` · ${this.strays} stray` : ''}`);
  }
}

// ---- Nonagon Infinity ----

/** A pentatonic climb across the nine sides. */
const NONAGON_HZ = [196, 220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];

class NonagonGame implements MiniGame {
  result: SkillResult | null = null;
  private readonly game;
  private round = NONAGON_FIRST;
  private phase: 'show' | 'input' | 'between' = 'between';
  private clock = -0.6;
  private shown = -1;
  private entered = 0;
  private lit = -1;
  private litFor = 0;
  private cursor = 0;

  constructor(
    private readonly synth: Synth,
    seed: number,
    level: number,
  ) {
    this.game = makeNonagon(seed, level);
  }

  update(_t: number, dt: number): void {
    this.clock += dt;
    this.litFor -= dt;
    if (this.litFor <= 0) this.lit = -1;
    if (this.phase === 'between' && this.clock >= 0) {
      this.phase = 'show';
      this.clock = 0;
      this.shown = -1;
    }
    if (this.phase === 'show') {
      const i = Math.floor(this.clock / this.game.beat);
      if (i !== this.shown && i < this.round) {
        this.shown = i;
        this.light(this.game.seq[i], this.game.beat * 0.8);
      }
      if (this.clock >= this.round * this.game.beat) {
        this.phase = 'input';
        this.entered = 0;
      }
    }
  }

  key(code: string, repeat: boolean): void {
    if (repeat) return;
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (m) return this.press(Number(m[1]) - 1);
    if (code === 'ArrowLeft' || code === 'ArrowUp') this.cursor = (this.cursor + NONAGON_SIDES - 1) % NONAGON_SIDES;
    else if (code === 'ArrowRight' || code === 'ArrowDown') this.cursor = (this.cursor + 1) % NONAGON_SIDES;
    else if (code === 'Enter' || code === 'Space') this.press(this.cursor);
  }

  tap(u: number, v: number): void {
    const dx = u - 0.5;
    const dy = v - 0.5;
    if (Math.hypot(dx, dy) > 0.48) return;
    const a = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    this.press(Math.floor((a / (Math.PI * 2)) * NONAGON_SIDES) % NONAGON_SIDES);
  }

  private light(side: number, dur: number): void {
    this.lit = side;
    this.litFor = dur;
    this.synth.note(NONAGON_HZ[side], dur, 'triangle', 0.18);
  }

  private press(side: number): void {
    if (this.phase !== 'input') return;
    this.cursor = side;
    if (side !== this.game.seq[this.entered]) {
      this.synth.thud();
      this.result = { passed: false, note: `Lost the loop at ${this.round} lights` };
      return;
    }
    this.light(side, 0.25);
    if (++this.entered < this.round) return;
    if (this.round >= this.game.seq.length) {
      this.result = { passed: true, note: `All ${this.round} lights, round and round` };
      return;
    }
    this.round++;
    this.phase = 'between';
    this.clock = -0.7;
  }

  draw(s: Stage): void {
    panel(s);
    const g = s.g;
    const cx = s.x + s.size / 2;
    const cy = s.y + s.size / 2;
    const r = s.size * 0.44;
    for (let i = 0; i < NONAGON_SIDES; i++) {
      const a0 = (i / NONAGON_SIDES) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / NONAGON_SIDES) * Math.PI * 2 - Math.PI / 2;
      const on = this.lit === i;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
      g.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
      g.closePath();
      g.fillStyle = `hsla(${i * 40}, 85%, ${on ? 65 : 30}%, ${on ? 1 : 0.85})`;
      g.fill();
      g.lineWidth = this.phase === 'input' && this.cursor === i ? 5 : 2;
      g.strokeStyle = this.phase === 'input' && this.cursor === i ? GOLD : INK;
      g.stroke();
      const am = (a0 + a1) / 2;
      g.fillStyle = CREAM;
      g.font = `bold ${s.size * 0.05}px Verdana, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(i + 1), cx + Math.cos(am) * r * 0.72, cy + Math.sin(am) * r * 0.72);
      g.textBaseline = 'alphabetic';
    }
    s.status(this.phase === 'input' ? `Your turn: ${this.entered} of ${this.round}` : `Watch: ${this.round} lights (to ${this.game.seq.length})`);
  }
}

// ---- The Flying Microtonal Banana ----

class BananaGame implements MiniGame {
  result: SkillResult | null = null;
  private readonly game;
  private round = 0;
  private cents = 0;
  private roundTime = 0;
  private wins = 0;
  private readonly marks: boolean[] = [];
  /** Seconds left showing how the last string went. */
  private pause = 0;
  private lastOff = 0;
  private drone: { set(f: number): void; stop(): void } | null = null;
  private string: { set(f: number): void; stop(): void } | null = null;

  constructor(
    private readonly synth: Synth,
    seed: number,
    level: number,
  ) {
    this.game = makeBanana(seed, level);
    this.cents = this.game.starts[0];
    this.drone = synth.hold(BANANA_DRONE);
    this.string = synth.hold(bananaHz(this.cents));
  }

  update(_t: number, dt: number): void {
    if (this.pause > 0) {
      if ((this.pause -= dt) <= 0) this.next();
      return;
    }
    if ((this.roundTime += dt) > BANANA_TIME) this.lock();
  }

  key(code: string): void {
    if (this.pause > 0) return;
    const step = code === 'ArrowLeft' ? -BANANA_FINE : code === 'ArrowRight' ? BANANA_FINE : code === 'ArrowDown' ? -BANANA_COARSE : code === 'ArrowUp' ? BANANA_COARSE : 0;
    if (step) this.turn(step);
    else if (code === 'Enter' || code === 'Space') this.lock();
  }

  /** The button row along the bottom: coarse down, fine down, lock, fine up, coarse up. */
  tap(u: number, v: number): void {
    if (this.pause > 0 || v < 0.8 || v > 1 || u < 0 || u > 1) return;
    const b = Math.floor(u * 5);
    if (b === 2) this.lock();
    else this.turn([-BANANA_COARSE, -BANANA_FINE, 0, BANANA_FINE, BANANA_COARSE][b]);
  }

  private turn(step: number): void {
    this.cents = Math.max(-400, Math.min(400, this.cents + step));
    this.string?.set(bananaHz(this.cents));
  }

  private lock(): void {
    const ok = Math.abs(this.cents) <= this.game.tolerance;
    this.lastOff = Math.round(this.cents);
    this.marks.push(ok);
    if (ok) this.wins++;
    this.synth.note(ok ? 660 : 110, 0.3, 'triangle', 0.15);
    this.pause = 1.1;
  }

  private next(): void {
    this.round++;
    if (this.round >= BANANA_ROUNDS) {
      this.stop();
      this.result = { passed: this.wins >= BANANA_NEED, note: `${this.wins} of ${BANANA_ROUNDS} strings in tune (needed ${BANANA_NEED})` };
      return;
    }
    this.cents = this.game.starts[this.round];
    this.roundTime = 0;
    this.string?.set(bananaHz(this.cents));
  }

  stop(): void {
    this.drone?.stop();
    this.string?.stop();
    this.drone = this.string = null;
  }

  draw(s: Stage, t: number): void {
    panel(s);
    const g = s.g;
    const cx = s.x + s.size / 2;
    const cy = s.y + s.size * 0.4;
    // The wobble: the two notes beating, as fast as they're apart (too fast to follow, it just shakes).
    const beat = Math.abs(bananaHz(this.cents) - BANANA_DRONE);
    const shown = Math.min(beat, 9);
    const amp = Math.min(1, beat / 3) * s.size * 0.06;
    const wob = Math.sin(t * Math.PI * 2 * shown) * amp;
    g.strokeStyle = '#ffe14d';
    g.lineWidth = s.size * 0.05;
    g.beginPath();
    g.ellipse(cx, cy, s.size * 0.24 + wob, s.size * 0.24 - wob, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255, 225, 77, 0.15)';
    g.fill();
    g.textAlign = 'center';
    g.fillStyle = CREAM;
    g.font = `bold ${s.size * 0.045}px Verdana, sans-serif`;
    if (this.pause > 0) {
      const ok = this.marks[this.marks.length - 1];
      g.fillText(ok ? 'IN TUNE' : `${Math.abs(this.lastOff)} cents ${this.lastOff > 0 ? 'sharp' : 'flat'}`, cx, cy + 6);
    }
    for (let i = 0; i < BANANA_ROUNDS; i++) {
      const m = this.marks[i];
      g.fillStyle = m === undefined ? 'rgba(255,255,255,0.2)' : m ? '#ffe14d' : '#ff5a5a';
      g.beginPath();
      g.arc(cx + (i - 1) * s.size * 0.08, s.y + s.size * 0.72, s.size * 0.025, 0, Math.PI * 2);
      g.fill();
    }
    const labels = ['«', '‹', 'LOCK', '›', '»'];
    const bw = s.size / 5;
    labels.forEach((l, i) => {
      const x = s.x + i * bw;
      g.fillStyle = i === 2 ? 'rgba(255, 210, 58, 0.35)' : 'rgba(255, 255, 255, 0.1)';
      g.fillRect(x + 6, s.y + s.size * 0.82, bw - 12, s.size * 0.14);
      g.fillStyle = CREAM;
      g.font = `bold ${s.size * (i === 2 ? 0.04 : 0.07)}px Verdana, sans-serif`;
      g.fillText(l, x + bw / 2, s.y + s.size * 0.915);
    });
    s.status(`String ${Math.min(this.round + 1, BANANA_ROUNDS)} of ${BANANA_ROUNDS} · ${Math.max(0, Math.ceil(BANANA_TIME - this.roundTime))}s`);
  }
}

// ---- Horology ----

class HorologyGame implements MiniGame {
  result: SkillResult | null = null;
  private readonly game;
  private round = 0;
  private angle = 0;
  private hits = 0;
  private readonly marks: boolean[] = [];
  private pause = 0.6;
  private lastTick = 0;

  constructor(
    private readonly synth: Synth,
    seed: number,
    level: number,
  ) {
    this.game = makeHorology(seed, level);
  }

  update(_t: number, dt: number): void {
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0 && this.marks.length >= HOROLOGY_ROUNDS) {
        this.result = { passed: this.hits >= this.game.need, note: `${this.hits} of ${HOROLOGY_ROUNDS} on the mark (needed ${this.game.need})` };
      }
      return;
    }
    const r = this.game.rounds[this.round];
    this.angle = (((this.angle + r.speed * dt) % 1) + 1) % 1;
    const tick = Math.floor(this.angle * 12);
    if (tick !== this.lastTick) {
      this.lastTick = tick;
      this.synth.note(tick % 2 ? 1800 : 1400, 0.03, 'square', 0.04);
    }
  }

  key(code: string, repeat: boolean): void {
    if (!repeat && (code === 'Space' || code === 'Enter')) this.stopHand();
  }

  tap(): void {
    this.stopHand();
  }

  private stopHand(): void {
    if (this.pause > 0 || this.round >= HOROLOGY_ROUNDS) return;
    const ok = horologyHit(this.game.rounds[this.round], this.angle);
    this.marks.push(ok);
    if (ok) this.hits++;
    this.synth.note(ok ? 880 : 110, 0.25, 'triangle', 0.15);
    this.pause = 0.8;
    if (this.round < HOROLOGY_ROUNDS - 1) this.round++;
  }

  draw(s: Stage): void {
    panel(s);
    const g = s.g;
    const cx = s.x + s.size / 2;
    const cy = s.y + s.size * 0.48;
    const R = s.size * 0.38;
    const turn = (a: number) => a * Math.PI * 2 - Math.PI / 2;
    g.fillStyle = 'rgba(255, 246, 208, 0.08)';
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();
    const r = this.game.rounds[this.round];
    g.strokeStyle = GOLD;
    g.lineWidth = R * 0.18;
    g.beginPath();
    g.arc(cx, cy, R * 0.85, turn(r.at - r.width / 2), turn(r.at + r.width / 2));
    g.stroke();
    g.strokeStyle = CREAM;
    g.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = turn(i / 12);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95);
      g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      g.stroke();
    }
    const a = turn(this.angle);
    g.strokeStyle = '#ff5ad0';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92);
    g.stroke();
    for (let i = 0; i < HOROLOGY_ROUNDS; i++) {
      const m = this.marks[i];
      g.fillStyle = m === undefined ? 'rgba(255,255,255,0.2)' : m ? GOLD : '#ff5a5a';
      g.beginPath();
      g.arc(cx + (i - 2) * s.size * 0.07, s.y + s.size * 0.93, s.size * 0.022, 0, Math.PI * 2);
      g.fill();
    }
    s.status(`Try ${this.marks.length + (this.pause > 0 ? 0 : 1)} of ${HOROLOGY_ROUNDS} · ${this.hits} on the mark`);
  }
}
