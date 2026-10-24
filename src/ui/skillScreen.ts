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
  SUITE_MOVES,
  SUITE_NAMES,
  SUITE_NEED,
  fuzzStep,
  makeSuite,
  sheetAt,
  sheetOverlap,
  type SkillKind,
  type SuiteMove,
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
  /** The finger or button lifted (for a button held down to repeat). */
  release?(): void;
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
 * Riff, Nonagon Infinity, the Flying Microtonal Banana, Horology and the
 * Mind Fuzz Suite. Keys,
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
    for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) this.canvas.addEventListener(type, () => this.game?.release?.());
  }

  get visible(): boolean {
    return this.game !== null;
  }

  start(kind: SkillKind, seed: number, level: number): void {
    this.stop();
    const s = this.synth;
    this.game =
      kind === 'riff'
        ? new RiffGame(s, seed, level)
        : kind === 'nonagon'
          ? new NonagonGame(s, seed, level)
          : kind === 'banana'
            ? new BananaGame(s, seed, level)
            : kind === 'mindfuzz'
              ? new SuiteGame(s, seed, level)
              : new HorologyGame(s, seed, level);
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
    // Sized to the screen's height too: a phone held sideways is short.
    g.font = `italic bold ${Math.min(34, w / 16, h / 14)}px Verdana, sans-serif`;
    g.fillText(this.title.toUpperCase(), w / 2, st.y - Math.min(44, h * 0.09));
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
/** Seconds a note takes to fall the lane: slow, so there's time to read what's coming. */
const RIFF_FALL = 3.8;

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
    // The catch zone: a note anywhere in this band when its lane is pressed counts (RIFF_OK either side of the line).
    const perSecond = (hitY - s.y) / RIFF_FALL;
    const reach = RIFF_OK * perSecond;
    g.fillStyle = 'rgba(255, 210, 58, 0.16)';
    g.fillRect(s.x + 4, hitY - reach, s.size - 8, reach * 2);
    g.strokeStyle = 'rgba(255, 210, 58, 0.55)';
    g.lineWidth = 1;
    g.strokeRect(s.x + 4, hitY - reach, s.size - 8, reach * 2);
    g.fillStyle = GOLD;
    g.fillRect(s.x + 4, hitY - 2, s.size - 8, 4);
    this.riff.notes.forEach((n, i) => {
      const state = this.hit[i];
      if (state === 'good' || state === 'ok') return;
      const y = hitY - (n.t - t) * perSecond;
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
  /** A button held down: its turn, and the time to its next repeat. */
  private holding = 0;
  private holdT = 0;
  /** The button last pressed, lit for a moment. */
  private lit = -1;
  private litFor = 0;

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
    this.litFor -= dt;
    if (this.pause > 0) {
      if ((this.pause -= dt) <= 0) this.next();
      return;
    }
    // A button held down turns again and again, as a held key does.
    if (this.holding && (this.holdT -= dt) <= 0) {
      this.turn(this.holding);
      this.holdT = 0.07;
    }
    if ((this.roundTime += dt) > BANANA_TIME) this.lock();
  }

  key(code: string): void {
    if (this.pause > 0) return;
    const b = { ArrowDown: 0, ArrowLeft: 1, ArrowRight: 3, ArrowUp: 4, Enter: 2, Space: 2 }[code];
    if (b !== undefined) this.press(b);
  }

  /** The button row along the bottom: coarse down, fine down, lock, fine up, coarse up. Holding one repeats it. */
  tap(u: number, v: number): void {
    if (this.pause > 0 || v < 0.8 || v > 1 || u < 0 || u > 1) return;
    const b = Math.min(4, Math.floor(u * 5));
    this.press(b);
    if (b !== 2) {
      this.holding = BANANA_STEPS[b];
      this.holdT = 0.35;
    }
  }

  release(): void {
    this.holding = 0;
  }

  /** A button (or its key): lit for a moment, and the string turned or locked. */
  private press(b: number): void {
    this.lit = b;
    this.litFor = 0.15;
    if (b === 2) this.lock();
    else this.turn(BANANA_STEPS[b]);
  }

  private turn(step: number): void {
    this.cents = Math.max(-400, Math.min(400, this.cents + step));
    this.string?.set(bananaHz(this.cents));
  }

  private lock(): void {
    this.holding = 0;
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
    // The wobble: the two notes beating, as fast as they're apart (too fast to follow, it just shakes), and as wide as
    // the string is out of tune, so every turn shows. It never says which way.
    const beat = Math.abs(bananaHz(this.cents) - BANANA_DRONE);
    const shown = Math.min(beat, 9);
    const amp = Math.min(1, Math.abs(this.cents) / 200) * s.size * 0.09;
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
      const on = this.lit === i && this.litFor > 0;
      g.fillStyle = on ? 'rgba(255, 210, 58, 0.75)' : i === 2 ? 'rgba(255, 210, 58, 0.35)' : 'rgba(255, 255, 255, 0.1)';
      g.fillRect(x + 6, s.y + s.size * 0.82, bw - 12, s.size * 0.14);
      g.fillStyle = CREAM;
      g.font = `bold ${s.size * (i === 2 ? 0.04 : 0.07)}px Verdana, sans-serif`;
      g.fillText(l, x + bw / 2, s.y + s.size * 0.915);
    });
    s.status(`String ${Math.min(this.round + 1, BANANA_ROUNDS)} of ${BANANA_ROUNDS} · ${Math.max(0, Math.ceil(BANANA_TIME - this.roundTime))}s`);
  }
}

/** What each of the Banana's buttons turns the string by, cents (the middle one locks it in). */
const BANANA_STEPS = [-BANANA_COARSE, -BANANA_FINE, 0, BANANA_FINE, BANANA_COARSE];

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

// ---- The Mind Fuzz Suite ----

const SUITE_KEYS: Record<string, number> = { ArrowLeft: 0, KeyA: 0, ArrowDown: 1, KeyS: 1, ArrowUp: 2, KeyW: 2, ArrowRight: 3, KeyD: 3 };
const SHEET_WIDTH = 0.36;
/** The arrow pads: how far from the middle (a share of the stage), and how big. */
const PAD_FROM = 0.4;
const PAD_SIZE = 0.15;
/** Each arrow's pad, as a direction from the middle: left, down, up, right. */
const PAD_DIRS: [number, number][] = [
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 0],
];

/**
 * I'm In Your Mind Fuzz's opening suite, four songs run together, as four
 * short movements: read the arrow in the eye, find the one not there, line
 * up the cellophane, ride the fuzz. Pass SUITE_NEED of them.
 */
class SuiteGame implements MiniGame {
  result: SkillResult | null = null;
  private readonly game;
  private move = 0;
  /** Each movement: its title card, the play, then how it went. */
  private phase: 'title' | 'play' | 'done' = 'title';
  private clock = 0;
  private round = 0;
  private hits = 0;
  private readonly passed: boolean[] = [];
  private readonly notes: string[] = [];
  /** I'm In Your Mind: seconds into the round (the arrow shows, then it's gone). */
  private roundTime = 0;
  /** A mark on the last answer: right or wrong, for a moment. */
  private mark: { ok: boolean; for: number } | null = null;
  /** I'm Not In Your Mind: the shown arrows' order round the eye. */
  private order: number[] = [];
  /** I'm In Your Mind Fuzz: the needle, its speed, a tap waiting, and seconds in the band. */
  private level = 0.2;
  private v = 0;
  private tapped = false;
  private held = 0;
  private hum: { set(f: number): void; stop(): void } | null = null;

  constructor(
    private readonly synth: Synth,
    seed: number,
    level: number,
  ) {
    this.game = makeSuite(seed, level);
  }

  private get now(): SuiteMove {
    return SUITE_MOVES[this.move];
  }

  update(_t: number, dt: number): void {
    this.clock += dt;
    if (this.mark && (this.mark.for -= dt) <= 0) this.mark = null;
    if (this.phase === 'title') {
      if (this.clock > 1.6) this.begin();
      return;
    }
    if (this.phase === 'done') {
      if (this.clock > 1.1) this.nextMove();
      return;
    }
    this.roundTime += dt;
    const g = this.game;
    if (this.now === 'notMind' && this.roundTime > g.notMind.time) this.answer(false);
    if (this.now === 'mind' && this.roundTime > g.mind.flash + 3) this.answer(false);
    if (this.now === 'fuzz') {
      const next = fuzzStep(this.level, this.v, dt, this.tapped);
      this.tapped = false;
      this.level = next.level;
      this.v = next.v;
      const [lo, hi] = g.fuzz.band;
      if (this.level >= lo && this.level <= hi) this.held += dt;
      this.hum?.set(90 + this.level * 260);
      if (this.held >= g.fuzz.need || this.roundTime >= g.fuzz.time) this.finish(this.held >= g.fuzz.need, `${this.held.toFixed(1)}s in the band`);
    }
  }

  key(code: string, repeat: boolean): void {
    if (repeat || this.phase !== 'play') return;
    if (this.now === 'fuzz' || this.now === 'cellophane') {
      if (code === 'Space' || code === 'Enter' || code === 'ArrowUp' || code === 'KeyW') this.press(-1);
      return;
    }
    const a = SUITE_KEYS[code];
    if (a !== undefined) this.press(a);
  }

  tap(u: number, v: number): void {
    if (this.phase !== 'play') return;
    if (this.now === 'fuzz' || this.now === 'cellophane') return this.press(-1);
    // The arrow pads round the edge (drawn in drawPads): which side the tap is toward. The middle, where the
    // arrows show, isn't a pad, so a tap on a shown arrow can't count as the way it happens to sit.
    const dx = u - 0.5;
    const dy = v - 0.5;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < PAD_FROM - PAD_SIZE / 2) return;
    this.press(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 3) : dy > 0 ? 1 : 2);
  }

  stop(): void {
    this.hum?.stop();
    this.hum = null;
  }

  private begin(): void {
    this.phase = 'play';
    this.clock = 0;
    this.round = 0;
    this.hits = 0;
    this.roundTime = 0;
    if (this.now === 'notMind') this.shuffle();
    if (this.now === 'fuzz') {
      this.level = 0.2;
      this.v = 0;
      this.held = 0;
      this.hum = this.synth.hold(110, 0.06);
    }
  }

  private press(arrow: number): void {
    const g = this.game;
    switch (this.now) {
      case 'mind':
        // Not before it's shown.
        if (this.roundTime < 0.35) return;
        return this.answer(arrow === g.mind.arrows[this.round]);
      case 'notMind':
        return this.answer(arrow === g.notMind.missing[this.round]);
      case 'cellophane': {
        const [a, b] = g.cellophane.sheets[this.round];
        const t = this.roundTime;
        return this.answer(sheetOverlap(sheetAt(a, t), sheetAt(b, t), SHEET_WIDTH) >= g.cellophane.overlap);
      }
      case 'fuzz':
        this.tapped = true;
        this.synth.note(220 + this.level * 300, 0.08, 'sawtooth', 0.05);
    }
  }

  /** A round of the arrows or the cellophane answered: on to the next, or the movement's end. */
  private answer(ok: boolean): void {
    const g = this.game;
    if (ok) this.hits++;
    this.mark = { ok, for: 0.45 };
    this.synth.note(ok ? 660 + this.round * 60 : 110, 0.2, 'triangle', 0.15);
    const rounds = this.now === 'mind' ? g.mind.arrows.length : this.now === 'notMind' ? g.notMind.missing.length : g.cellophane.sheets.length;
    const need = this.now === 'mind' ? g.mind.need : this.now === 'notMind' ? g.notMind.need : g.cellophane.need;
    this.round++;
    this.roundTime = 0;
    if (this.round < rounds) {
      if (this.now === 'notMind') this.shuffle();
      return;
    }
    this.finish(this.hits >= need, `${this.hits} of ${rounds}`);
  }

  private finish(ok: boolean, note: string): void {
    this.stop();
    this.passed.push(ok);
    this.notes.push(`${SUITE_NAMES[this.now].song}: ${note}`);
    this.synth.note(ok ? 880 : 98, 0.4, 'triangle', 0.18);
    this.phase = 'done';
    this.clock = 0;
  }

  private nextMove(): void {
    const won = this.passed.filter(Boolean).length;
    const left = SUITE_MOVES.length - this.passed.length;
    // Over when it's decided either way.
    if (won >= SUITE_NEED || won + left < SUITE_NEED || left === 0) {
      this.result = { passed: won >= SUITE_NEED, note: `${won} of ${this.passed.length} movements (needed ${SUITE_NEED})` };
      return;
    }
    this.move++;
    this.phase = 'title';
    this.clock = 0;
  }

  /** The three arrows shown round the eye: every one but the missing, in a new order. */
  private shuffle(): void {
    const missing = this.game.notMind.missing[this.round];
    const rest = [0, 1, 2, 3].filter((a) => a !== missing);
    this.order = rest.sort(() => Math.random() - 0.5);
  }

  draw(s: Stage, t: number): void {
    panel(s);
    const g = s.g;
    const cx = s.x + s.size / 2;
    const cy = s.y + s.size / 2;
    // The fuzz: a slow kaleidoscope of wedges behind everything.
    const spokes = 12;
    for (let i = 0; i < spokes; i++) {
      const a0 = (i / spokes) * Math.PI * 2 + t * 0.3;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, s.size * 0.48, a0, a0 + Math.PI / spokes);
      g.closePath();
      g.fillStyle = `hsla(${(i * 30 + t * 40) % 360}, 80%, 50%, 0.1)`;
      g.fill();
    }
    const move = this.now;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (this.phase === 'title') {
      g.fillStyle = GOLD;
      g.font = `italic bold ${s.size * 0.07}px Verdana, sans-serif`;
      g.fillText(SUITE_NAMES[move].song.toUpperCase(), cx, cy - s.size * 0.04);
      g.fillStyle = CREAM;
      g.font = `${s.size * 0.035}px Verdana, sans-serif`;
      g.fillText(SUITE_NAMES[move].how, cx, cy + s.size * 0.06);
      g.textBaseline = 'alphabetic';
      s.status(`Movement ${this.move + 1} of ${SUITE_MOVES.length}`);
      this.drawMarks(s);
      return;
    }
    const arrowAt = (a: number, x: number, y: number, size: number, color: string) => {
      g.fillStyle = color;
      g.font = `bold ${size}px Verdana, sans-serif`;
      g.fillText(RIFF_ARROWS[a], x, y);
    };
    if (move === 'mind') {
      // The eye: an iris that swirls, the arrow in it for a moment.
      g.strokeStyle = '#ff5ad0';
      g.lineWidth = s.size * 0.02;
      g.beginPath();
      g.ellipse(cx, cy, s.size * 0.36, s.size * 0.2, 0, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = `hsla(${(t * 90) % 360}, 70%, 40%, 0.6)`;
      g.beginPath();
      g.arc(cx, cy, s.size * 0.16, 0, Math.PI * 2);
      g.fill();
      if (this.round < this.game.mind.arrows.length && this.roundTime < this.game.mind.flash) arrowAt(this.game.mind.arrows[this.round], cx, cy, s.size * 0.16, CREAM);
    } else if (move === 'notMind') {
      this.order.forEach((a, i) => {
        const ang = (i / 3) * Math.PI * 2 - Math.PI / 2;
        arrowAt(a, cx + Math.cos(ang) * s.size * 0.15, cy + Math.sin(ang) * s.size * 0.15, s.size * 0.11, LANE_COLORS[a]);
      });
      // Time left to answer, as a shrinking ring inside the pads.
      const left = Math.max(0, 1 - this.roundTime / this.game.notMind.time);
      g.strokeStyle = GOLD;
      g.lineWidth = 6;
      g.beginPath();
      g.arc(cx, cy, s.size * 0.29, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
      g.stroke();
    } else if (move === 'cellophane') {
      const sheets = this.game.cellophane.sheets[Math.min(this.round, this.game.cellophane.sheets.length - 1)];
      const w = SHEET_WIDTH * s.size;
      const h = s.size * 0.4;
      // Two sheets sliding past each other, see-through so the overlap shows.
      ['rgba(255, 90, 208, 0.45)', 'rgba(58, 216, 255, 0.45)'].forEach((color, i) => {
        const x = s.x + sheetAt(sheets[i], this.roundTime) * s.size - w / 2;
        g.fillStyle = color;
        g.fillRect(x, cy - h / 2 + (i ? 12 : -12), w, h);
      });
    } else {
      // The fuzz meter: a tall gauge, the band to hold in gold, the needle.
      const gx = cx - s.size * 0.08;
      const gw = s.size * 0.16;
      const gy = s.y + s.size * 0.12;
      const gh = s.size * 0.72;
      g.fillStyle = 'rgba(255, 255, 255, 0.08)';
      g.fillRect(gx, gy, gw, gh);
      const [lo, hi] = this.game.fuzz.band;
      g.fillStyle = 'rgba(255, 210, 58, 0.45)';
      g.fillRect(gx, gy + gh * (1 - hi), gw, gh * (hi - lo));
      const ny = gy + gh * (1 - this.level);
      g.fillStyle = '#ff5ad0';
      g.fillRect(gx - 14, ny - 4, gw + 28, 8);
      // How long held, against what's needed.
      const share = Math.min(1, this.held / this.game.fuzz.need);
      g.strokeStyle = GOLD;
      g.lineWidth = 8;
      g.beginPath();
      g.arc(cx + s.size * 0.3, cy, s.size * 0.09, -Math.PI / 2, -Math.PI / 2 + share * Math.PI * 2);
      g.stroke();
    }
    if (move === 'mind' || move === 'notMind') this.drawPads(s);
    if (this.mark) {
      g.fillStyle = this.mark.ok ? GOLD : '#ff5a5a';
      g.font = `bold ${s.size * 0.06}px Verdana, sans-serif`;
      g.fillText(this.mark.ok ? 'YES' : 'NO', cx, cy);
    }
    g.textBaseline = 'alphabetic';
    this.drawMarks(s);
    const counts =
      move === 'fuzz'
        ? `${this.held.toFixed(1)}s of ${this.game.fuzz.need}s in the band · ${Math.max(0, Math.ceil(this.game.fuzz.time - this.roundTime))}s left`
        : `${this.hits} right so far`;
    s.status(this.phase === 'done' ? (this.notes[this.notes.length - 1] ?? '') : `${SUITE_NAMES[move].song} · ${counts}`);
  }

  /** The four arrow pads round the edge, to tap (and to see which key is which). */
  private drawPads(s: Stage): void {
    const g = s.g;
    const size = PAD_SIZE * s.size;
    PAD_DIRS.forEach(([dx, dy], a) => {
      const x = s.x + s.size * (0.5 + dx * PAD_FROM);
      const y = s.y + s.size * (0.5 + dy * PAD_FROM);
      g.fillStyle = 'rgba(255, 255, 255, 0.1)';
      g.fillRect(x - size / 2, y - size / 2, size, size);
      g.strokeStyle = LANE_COLORS[a];
      g.lineWidth = 2;
      g.strokeRect(x - size / 2, y - size / 2, size, size);
      g.fillStyle = LANE_COLORS[a];
      g.font = `bold ${size * 0.6}px Verdana, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(RIFF_ARROWS[a], x, y);
    });
    g.textBaseline = 'alphabetic';
  }

  /** The movements so far, in the corner: gold passed, red not, grey to come. */
  private drawMarks(s: Stage): void {
    const g = s.g;
    for (let i = 0; i < SUITE_MOVES.length; i++) {
      const m = this.passed[i];
      g.fillStyle = m === undefined ? (i === this.move ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)') : m ? GOLD : '#ff5a5a';
      g.beginPath();
      // Up in the corner, clear of the arrow pads.
      g.arc(s.x + s.size * (0.07 + i * 0.06), s.y + s.size * 0.06, s.size * 0.02, 0, Math.PI * 2);
      g.fill();
    }
  }
}
