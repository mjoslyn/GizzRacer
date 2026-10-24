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
  skillRules,
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
  suiteMoveRules,
  sheetAt,
  sheetOverlap,
  CASTLE_SPEEDUP,
  FISH_ROUNDS,
  ROBOT_PUSH,
  ROBOT_STILL,
  castleDrop,
  castleSlide,
  fishJudge,
  makeCastle,
  makeFishing,
  makeRobot,
  makeSnake,
  placeMouse,
  snakeReverse,
  snakeStart,
  snakeStep,
  SNAKE_DIRS,
  SNAKE_SPEEDUP,
  type Cell,
  robotMood,
  robotStep,
  type SkillKind,
  type SuiteMove,
} from '../core/skills';
import { seededRandom } from '../core/math';

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

/**
 * Story mode's skill games, drawn on a canvas over the game: Play the
 * Riff, Nonagon Infinity, the Flying Microtonal Banana, Horology, the
 * Mind Fuzz Suite, Rattlesnake, Robot Stop, Fishing for Fishies and
 * Crumbling Castle. Keys, mouse or touch. (The Deadstick Landing is flown
 * on a track, in game.ts.)
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
      this.game?.tap((e.clientX - st.x) / st.size, (e.clientY - st.y) / st.size, e.clientX, e.clientY);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) this.canvas.addEventListener(type, () => this.game?.release?.());
    window.addEventListener('keyup', (e) => this.game?.keyUp?.(e.code));
    // A key held as the window loses focus never comes up: let it go.
    window.addEventListener('blur', () => this.game?.release?.());
  }

  get visible(): boolean {
    return this.game !== null;
  }

  start(kind: SkillKind, seed: number, level: number): void {
    this.stop();
    const s = this.synth;
    const Game = GAMES[kind];
    if (!Game) return;
    // The suite has a card before each movement; every other game one before it starts.
    this.game = kind === 'mindfuzz' ? new Game(s, seed, level) : new Briefed(SKILLS[kind].name, skillRules(kind, level), () => new Game(s, seed, level));
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
    if (this.game!.carded && !res) return;
    g.textAlign = 'center';
    g.fillStyle = GOLD;
    // Sized to the screen's height too: a phone held sideways is short.
    g.font = `italic bold ${Math.min(34, w / 16, h / 14)}px Verdana, sans-serif`;
    g.fillText(this.title.toUpperCase(), w / 2, st.y - Math.min(44, h * 0.09));
    g.fillStyle = CREAM;
    g.font = `${Math.min(15, w / 32)}px Verdana, sans-serif`;
    g.fillText(res ? res.note : this.statusText || this.howTo, w / 2, st.y - 16);
    g.font = `${Math.min(14, w / 34)}px Verdana, sans-serif`;
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
    // Warmer the closer it's tuned: red far out, through orange, to banana yellow near the drone. It settles to yellow
    // well before the string is in tune, so it says you're close, never when to lock it in.
    const hue = 52 * Math.max(0, 1 - Math.abs(this.cents) / 200);
    g.strokeStyle = `hsl(${hue}, 100%, 60%)`;
    g.lineWidth = s.size * 0.05;
    g.beginPath();
    g.ellipse(cx, cy, s.size * 0.24 + wob, s.size * 0.24 - wob, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = `hsla(${hue}, 100%, 60%, 0.15)`;
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

/** The Continue button of the rules card last drawn, in pixels: x, y, width, height. */
let continueBox = [0, 0, 0, 0];

/** Whether a tap (in pixels) is on the rules card's Continue. */
function onContinue(px: number, py: number): boolean {
  const [x, y, w, h] = continueBox;
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

/**
 * A card over the whole screen, not just the stage, so a phone held
 * sideways still gets big type: a small line, a heading, exactly what to
 * do, and Continue.
 */
function rulesCard(s: Stage, kicker: string, heading: string, text: string): void {
  const g = s.g;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mw = Math.min(vw - 24, 680);
  const mh = Math.min(vh - 24, 620);
  const mx = (vw - mw) / 2;
  const my = (vh - mh) / 2;
  // The card's scale: its shorter side, as the stage's size is for a game.
  const u = Math.min(mw, mh * 1.15);
  g.fillStyle = 'rgba(20, 0, 30, 0.96)';
  g.fillRect(mx, my, mw, mh);
  g.strokeStyle = GOLD;
  g.lineWidth = 3;
  g.strokeRect(mx, my, mw, mh);
  const cx = vw / 2;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = CREAM;
  const kickerSize = Math.max(11, u * 0.028);
  g.font = `${kickerSize}px Verdana, sans-serif`;
  g.fillText(kicker, cx, my + kickerSize * 2);
  const headSize = Math.max(18, u * 0.055);
  g.fillStyle = GOLD;
  g.font = `italic bold ${headSize}px Verdana, sans-serif`;
  const headY = my + kickerSize * 2 + headSize * 1.4;
  g.fillText(heading.toUpperCase(), cx, headY);
  // Continue along the bottom.
  const bh = Math.max(40, u * 0.09);
  const bw = Math.min(mw * 0.6, Math.max(180, u * 0.4));
  continueBox = [cx - bw / 2, my + mh - bh - Math.max(12, u * 0.035), bw, bh];
  // The rules, as big as fit between the heading and Continue, and never small.
  let size = Math.min(32, Math.max(u * 0.06, 20));
  let lines: string[] = [];
  let top = headY;
  for (; size > 14; size *= 0.95) {
    g.font = `${size}px Verdana, sans-serif`;
    lines = wrap(g, text, mw - Math.max(24, u * 0.08));
    top = headY + size * 1.7;
    if (top + (lines.length - 1) * size * 1.4 + size * 0.6 <= continueBox[1]) break;
  }
  g.fillStyle = CREAM;
  lines.forEach((line, i) => g.fillText(line, cx, top + i * size * 1.4));
  const [bx, by] = continueBox;
  g.fillStyle = 'rgba(255, 210, 58, 0.9)';
  g.fillRect(bx, by, bw, bh);
  g.fillStyle = INK;
  g.font = `bold ${Math.max(16, bh * 0.45)}px Verdana, sans-serif`;
  g.textBaseline = 'middle';
  g.fillText('CONTINUE', cx, by + bh / 2);
  g.textBaseline = 'alphabetic';
}

/**
 * A game behind its rules card: the rules until Continue (Enter, Space, or
 * a tap on it), then the game, made then so its clock and its sound start
 * from Continue.
 */
class Briefed implements MiniGame {
  private inner: MiniGame | null = null;
  /** A result before the game began: given up on the card. */
  private early: SkillResult | null = null;
  private now = 0;
  private t0 = 0;

  constructor(
    private readonly heading: string,
    private readonly rules: string,
    private readonly make: () => MiniGame,
  ) {}

  get result(): SkillResult | null {
    return this.inner ? this.inner.result : this.early;
  }

  get carded(): boolean {
    return !this.inner;
  }

  set result(r: SkillResult | null) {
    if (this.inner) this.inner.result = r;
    else this.early = r;
  }

  update(t: number, dt: number): void {
    this.now = t;
    this.inner?.update(t - this.t0, dt);
  }

  draw(s: Stage, t: number): void {
    if (this.inner) return this.inner.draw(s, t - this.t0);
    panel(s);
    rulesCard(s, 'HOW TO PLAY', this.heading, this.rules);
    s.status('Read how it goes, then Continue');
  }

  key(code: string, repeat: boolean): void {
    if (this.inner) this.inner.key(code, repeat);
    else if (!repeat && (code === 'Enter' || code === 'Space')) this.go();
  }

  keyUp(code: string): void {
    this.inner?.keyUp?.(code);
  }

  tap(u: number, v: number, px: number, py: number): void {
    if (this.inner) this.inner.tap(u, v, px, py);
    else if (onContinue(px, py)) this.go();
  }

  release(): void {
    this.inner?.release?.();
  }

  stop(): void {
    this.inner?.stop?.();
  }

  private go(): void {
    this.t0 = this.now;
    this.inner = this.make();
  }
}

/** Breaks `text` into lines no wider than `width` in the context's font. */
function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * I'm In Your Mind Fuzz's opening suite, four songs run together, as four
 * short movements: read the arrow in the eye, find the one not there, line
 * up the cellophane, ride the fuzz. Pass SUITE_NEED of them.
 */
class SuiteGame implements MiniGame {
  result: SkillResult | null = null;
  private readonly game;
  private move = 0;
  /** Each movement: its card saying what to do (until Continue), the play, then how it went. */
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

  get carded(): boolean {
    return this.phase === 'title';
  }

  private get now(): SuiteMove {
    return SUITE_MOVES[this.move];
  }

  update(_t: number, dt: number): void {
    this.clock += dt;
    if (this.mark && (this.mark.for -= dt) <= 0) this.mark = null;
    if (this.phase === 'title') return;
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
    if (repeat) return;
    if (this.phase === 'title' && (code === 'Enter' || code === 'Space')) return this.begin();
    if (this.phase !== 'play') return;
    if (this.now === 'fuzz' || this.now === 'cellophane') {
      if (code === 'Space' || code === 'Enter' || code === 'ArrowUp' || code === 'KeyW') this.press(-1);
      return;
    }
    const a = SUITE_KEYS[code];
    if (a !== undefined) this.press(a);
  }

  tap(u: number, v: number, px: number, py: number): void {
    if (this.phase === 'title') {
      if (onContinue(px, py)) this.begin();
      return;
    }
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
      this.drawCard(s, move);
      s.status(`Movement ${this.move + 1} of ${SUITE_MOVES.length}`);
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

  /** A movement's card: its song, exactly what to do, and Continue to start it. */
  private drawCard(s: Stage, move: SuiteMove): void {
    rulesCard(s, `MOVEMENT ${this.move + 1} OF ${SUITE_MOVES.length}`, SUITE_NAMES[move].song, suiteMoveRules(this.game, move));
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

// ---- Rattlesnake ----

/** Arrow keys and WASD to SNAKE_DIRS: right, down, left, up. */
const SNAKE_KEYS: Record<string, number> = { ArrowRight: 0, KeyD: 0, ArrowDown: 1, KeyS: 1, ArrowLeft: 2, KeyA: 2, ArrowUp: 3, KeyW: 3 };

/** The classic snake game, as a rattlesnake eating mice. */
class SnakeGame implements MiniGame {
  result: SkillResult | null = null;
  private readonly game;
  private readonly rand;
  private body: Cell[];
  private mouse: Cell | null;
  private dir = 0;
  /** Turns pressed and not yet made: two, so a quick double turn isn't lost between moves. */
  private readonly turns: number[] = [];
  private step: number;
  private clock = -0.8;
  private eaten = 0;

  constructor(
    private readonly synth: Synth,
    seed: number,
    level: number,
  ) {
    this.game = makeSnake(seed, level);
    this.rand = seededRandom(seed);
    this.body = snakeStart(this.game.grid);
    this.mouse = placeMouse(this.body, this.game.grid, this.rand());
    this.step = this.game.step;
  }

  update(_t: number, dt: number): void {
    this.clock += dt;
    while (this.clock >= this.step && !this.result) {
      this.clock -= this.step;
      this.move();
    }
  }

  private move(): void {
    const next = this.turns.shift();
    if (next !== undefined) this.dir = next;
    const out = snakeStep(this.body, this.dir, this.mouse, this.game.grid);
    if (out.crash) {
      this.synth.thud();
      this.result = { passed: false, note: `${out.crash === 'wall' ? 'Hit the wall' : 'Bit your own rattle'} with ${this.eaten} of ${this.game.need} mice eaten` };
      return;
    }
    this.body = out.body;
    if (!out.ate) return;
    this.eaten++;
    this.synth.rattle();
    this.synth.note(440 + this.eaten * 40, 0.12, 'triangle', 0.12);
    this.step *= SNAKE_SPEEDUP;
    this.mouse = placeMouse(this.body, this.game.grid, this.rand());
    if (this.eaten >= this.game.need || !this.mouse) this.result = { passed: true, note: `${this.eaten} mice eaten, ${this.body.length} long` };
  }

  key(code: string): void {
    const d = SNAKE_KEYS[code];
    if (d !== undefined) this.turn(d);
  }

  /** A tap turns toward its side of the head: up or down when heading across, left or right when heading up or down. */
  tap(u: number, v: number): void {
    const n = this.game.grid;
    const [hx, hy] = this.body[0];
    const heading = this.turns[this.turns.length - 1] ?? this.dir;
    if (heading % 2 === 0) this.turn(v * n < hy + 0.5 ? 3 : 1);
    else this.turn(u * n < hx + 0.5 ? 2 : 0);
  }

  private turn(d: number): void {
    const heading = this.turns[this.turns.length - 1] ?? this.dir;
    if (d === heading || snakeReverse(heading, d) || this.turns.length >= 2) return;
    this.turns.push(d);
  }

  draw(s: Stage, t: number): void {
    panel(s);
    const g = s.g;
    const n = this.game.grid;
    const c = (s.size - 8) / n;
    const at = (x: number) => s.x + 4 + x * c;
    const atY = (y: number) => s.y + 4 + y * c;
    // A sandy checkerboard, the desert floor.
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        g.fillStyle = (x + y) % 2 ? 'rgba(200, 160, 64, 0.12)' : 'rgba(200, 160, 64, 0.06)';
        g.fillRect(at(x), atY(y), c, c);
      }
    if (this.mouse) {
      const [mx, my] = this.mouse;
      const wig = Math.sin(t * 12) * c * 0.05;
      g.fillStyle = '#c8c0c8';
      g.beginPath();
      g.ellipse(at(mx) + c / 2 + wig, atY(my) + c / 2, c * 0.32, c * 0.22, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff9ab0';
      g.beginPath();
      g.arc(at(mx) + c * 0.3 + wig, atY(my) + c * 0.3, c * 0.1, 0, Math.PI * 2);
      g.fill();
    }
    // The snake, banded gold and brown, its rattle on the tail shaking.
    this.body.forEach(([x, y], i) => {
      const tail = i === this.body.length - 1 && i > 0;
      const pad = tail ? c * 0.22 : i === 0 ? c * 0.04 : c * 0.1;
      g.fillStyle = tail ? '#e8d8a0' : i === 0 ? '#8a6a30' : i % 4 < 2 ? '#c8a040' : '#6a4a20';
      const shake = tail ? Math.sin(t * 60) * c * 0.06 : 0;
      g.fillRect(at(x) + pad + shake, atY(y) + pad, c - pad * 2, c - pad * 2);
    });
    const [hx, hy] = this.body[0];
    const [dx, dy] = SNAKE_DIRS[this.dir];
    g.fillStyle = GOLD;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.arc(at(hx) + c / 2 + dx * c * 0.2 - dy * side * c * 0.2, atY(hy) + c / 2 + dy * c * 0.2 + dx * side * c * 0.2, c * 0.08, 0, Math.PI * 2);
      g.fill();
    }
    s.status(this.clock < 0 && this.eaten === 0 ? 'Ready...' : `${this.eaten} of ${this.game.need} mice`);
  }
}

// ---- Robot Stop ----

class RobotGame implements MiniGame {
  result: SkillResult | null = null;
  private readonly game;
  private pos = 0;
  private v = 0;
  private holding = false;
  private caught = 0;
  /** The watching spell the last catch was in, so a spell catches once. */
  private caughtIn = -1;
  /** A catch's flash. */
  private flash = 0;
  private lastMood = '';

  constructor(
    private readonly synth: Synth,
    seed: number,
    level: number,
  ) {
    this.game = makeRobot(seed, level);
  }

  update(t: number, dt: number): void {
    this.flash = Math.max(0, this.flash - dt * 2);
    const m = robotMood(this.game, t);
    if (m.mood !== this.lastMood) {
      this.lastMood = m.mood;
      if (m.mood === 'turning' || m.mood === 'twitch') this.synth.note(520, 0.15, 'square', 0.06);
      else if (m.mood === 'watching') this.synth.note(880, 0.25, 'square', 0.08);
    }
    // Caught, you stand frozen until it looks away again.
    const frozen = m.mood === 'watching' && this.caughtIn === m.index;
    const next = robotStep(this.pos, this.v, this.holding && !frozen, dt);
    this.pos = next.pos;
    this.v = frozen ? 0 : next.v;
    if (m.mood === 'watching' && this.v > ROBOT_STILL && this.caughtIn !== m.index) {
      this.caughtIn = m.index;
      this.caught++;
      this.flash = 1;
      this.pos = Math.max(0, this.pos - ROBOT_PUSH);
      this.v = 0;
      this.synth.thud();
      if (this.caught >= this.game.catches) this.result = { passed: false, note: `Caught ${this.caught} times, ${Math.round(this.pos * 100)}% of the way` };
    }
    if (this.pos >= 1) this.result = { passed: true, note: `Reached the robot in ${t.toFixed(1)}s${this.caught ? `, caught ${this.caught}` : ', never caught'}` };
    else if (t > this.game.time && !this.result) this.result = { passed: false, note: `Out of time, ${Math.round(this.pos * 100)}% of the way` };
  }

  key(code: string): void {
    if (code === 'Space' || code === 'Enter' || code === 'ArrowUp' || code === 'KeyW') this.holding = true;
  }

  keyUp(code: string): void {
    if (code === 'Space' || code === 'Enter' || code === 'ArrowUp' || code === 'KeyW') this.holding = false;
  }

  tap(): void {
    this.holding = true;
  }

  release(): void {
    this.holding = false;
  }

  draw(s: Stage, t: number): void {
    panel(s);
    const g = s.g;
    const m = robotMood(this.game, t);
    // The robot at the far end, up top; the player creeping up from the bottom.
    const rx = s.x + s.size / 2;
    const ry = s.y + s.size * 0.2;
    // How far round it's facing: 0 its back to you, 1 looking right at you.
    const face = m.mood === 'away' ? 0 : m.mood === 'watching' ? 1 : Math.min(1, m.into / this.game.warn) * (m.mood === 'twitch' ? Math.sin((m.into / this.game.warn) * Math.PI) * 0.6 : 1);
    g.fillStyle = '#9aa4b0';
    g.fillRect(rx - s.size * 0.08, ry - s.size * 0.02, s.size * 0.16, s.size * 0.14);
    const hw = s.size * 0.1 * (0.4 + 0.6 * Math.abs(Math.cos((face * Math.PI) / 2) * 2 - 1));
    g.fillStyle = '#c8d0d8';
    g.fillRect(rx - hw / 2, ry - s.size * 0.12, hw, s.size * 0.09);
    if (face > 0.5) {
      // Its eyes: red and watching.
      g.fillStyle = face >= 1 ? '#ff3a3a' : '#ff9a3a';
      for (const d of [-1, 1]) {
        g.beginPath();
        g.arc(rx + d * hw * 0.22, ry - s.size * 0.08, s.size * 0.014, 0, Math.PI * 2);
        g.fill();
      }
    }
    // The light over its head: green while it's away, amber turning, red watching.
    g.fillStyle = m.mood === 'away' ? '#3ad86a' : m.mood === 'watching' ? '#ff3a3a' : '#ffb03a';
    g.beginPath();
    g.arc(rx, ry - s.size * 0.15, s.size * 0.02, 0, Math.PI * 2);
    g.fill();
    // The floor between, and the player on it.
    const top = s.y + s.size * 0.34;
    const bottom = s.y + s.size * 0.84;
    g.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    g.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const y = bottom - (bottom - top) * (i / 10);
      g.beginPath();
      g.moveTo(s.x + s.size * 0.3, y);
      g.lineTo(s.x + s.size * 0.7, y);
      g.stroke();
    }
    const py = bottom - (bottom - top) * this.pos;
    const bob = this.v > ROBOT_STILL ? Math.sin(t * 20) * s.size * 0.006 : 0;
    g.fillStyle = this.flash > 0 ? '#ff5a5a' : '#ff5ad0';
    g.beginPath();
    g.arc(rx, py - s.size * 0.03 + bob, s.size * 0.03, 0, Math.PI * 2);
    g.fill();
    g.fillRect(rx - s.size * 0.025, py - s.size * 0.005 + bob, s.size * 0.05, s.size * 0.05);
    for (let i = 0; i < this.game.catches; i++) {
      g.fillStyle = i < this.caught ? '#ff5a5a' : 'rgba(255,255,255,0.2)';
      g.beginPath();
      g.arc(s.x + s.size * (0.07 + i * 0.06), s.y + s.size * 0.06, s.size * 0.02, 0, Math.PI * 2);
      g.fill();
    }
    g.textAlign = 'center';
    g.font = `bold ${s.size * 0.06}px Verdana, sans-serif`;
    g.fillStyle = m.mood === 'away' ? '#3ad86a' : m.mood === 'watching' ? '#ff3a3a' : '#ffb03a';
    g.fillText(m.mood === 'away' ? 'ROBOT GO' : 'ROBOT STOP', s.x + s.size / 2, s.y + s.size * 0.97);
    s.status(`${Math.round(this.pos * 100)}% of the way · ${Math.max(0, Math.ceil(this.game.time - t))}s left`);
  }
}

// ---- Fishing for Fishies ----

class FishingGame implements MiniGame {
  result: SkillResult | null = null;
  private readonly game;
  private round = 0;
  private clock = 0;
  private press: number | null = null;
  private hooked = 0;
  private readonly marks: boolean[] = [];
  /** How the round went, shown a moment before the next. */
  private outcome: 'hooked' | 'spooked' | 'away' | null = null;
  private pause = 0;
  private heard = -1;
  private bit = false;

  constructor(
    private readonly synth: Synth,
    seed: number,
    level: number,
  ) {
    this.game = makeFishing(seed, level);
  }

  update(_t: number, dt: number): void {
    if (this.pause > 0) {
      if ((this.pause -= dt) <= 0) this.next();
      return;
    }
    this.clock += dt;
    const r = this.game.rounds[this.round];
    const n = r.nibbles.filter((x) => x <= this.clock).length;
    if (n > this.heard) {
      if (this.heard >= 0) this.synth.note(1200, 0.06, 'sine', 0.1);
      this.heard = n;
    }
    if (!this.bit && this.clock >= r.bite) {
      this.bit = true;
      this.synth.note(140, 0.3, 'sine', 0.2);
    }
    const out = fishJudge(r, this.game.window, this.press, this.clock);
    if (out) this.end(out);
  }

  key(code: string, repeat: boolean): void {
    if (!repeat && (code === 'Space' || code === 'Enter')) this.strike();
  }

  tap(): void {
    this.strike();
  }

  private strike(): void {
    if (this.pause > 0 || this.press !== null) return;
    this.press = this.clock;
  }

  private end(out: 'hooked' | 'spooked' | 'away'): void {
    this.outcome = out;
    const ok = out === 'hooked';
    this.marks.push(ok);
    if (ok) this.hooked++;
    this.synth.note(ok ? 784 : 110, 0.3, 'triangle', 0.15);
    this.pause = 1.2;
  }

  private next(): void {
    const left = FISH_ROUNDS - this.marks.length;
    // Over when it's decided either way.
    if (this.hooked >= this.game.need || this.hooked + left < this.game.need || left === 0) {
      this.result = { passed: this.hooked >= this.game.need, note: `${this.hooked} of ${this.marks.length} fish hooked (needed ${this.game.need})` };
      return;
    }
    this.round++;
    this.clock = 0;
    this.press = null;
    this.outcome = null;
    this.heard = -1;
    this.bit = false;
  }

  draw(s: Stage, t: number): void {
    panel(s);
    const g = s.g;
    const water = s.y + s.size * 0.45;
    const r = this.game.rounds[this.round];
    // How far under the bobber is: a nibble's quick dip, or right under on the bite.
    let dip = 0;
    for (const n of r.nibbles) {
      const d = this.clock - n;
      if (d >= 0 && d < 0.3) dip = Math.max(dip, Math.sin((d / 0.3) * Math.PI) * this.game.nibbleDepth);
    }
    if (this.clock >= r.bite && this.outcome !== 'spooked') dip = this.outcome === 'hooked' ? -0.8 : 1;
    if (this.outcome === 'away') dip = 0;
    const bx = s.x + s.size / 2;
    const bob = Math.sin(t * 2.4) * s.size * 0.006;
    const by = water + bob + dip * s.size * 0.06;
    // The line, up from the bobber to the rod's tip.
    g.strokeStyle = 'rgba(255, 246, 208, 0.6)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(bx, by - s.size * 0.03);
    g.lineTo(s.x + s.size * 0.85, s.y + s.size * 0.08);
    g.stroke();
    g.strokeStyle = '#8a5a30';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(s.x + s.size * 0.85, s.y + s.size * 0.08);
    g.lineTo(s.x + s.size * 0.98, s.y + s.size * 0.4);
    g.stroke();
    // The bobber: red over white, the water drawn back over what's under.
    const br = s.size * 0.03;
    g.fillStyle = '#ff3a3a';
    g.beginPath();
    g.arc(bx, by, br, Math.PI, 0);
    g.fill();
    g.fillStyle = '#fff6d0';
    g.beginPath();
    g.arc(bx, by, br, 0, Math.PI);
    g.fill();
    // Ripples off a nibble or the bite.
    const since = Math.min(...[...r.nibbles, r.bite].map((n) => (this.clock >= n ? this.clock - n : Infinity)));
    if (since < 0.8) {
      g.strokeStyle = `rgba(255, 255, 255, ${0.6 * (1 - since / 0.8)})`;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(bx, water, s.size * (0.04 + since * 0.15), s.size * (0.01 + since * 0.03), 0, 0, Math.PI * 2);
      g.stroke();
    }
    // A fish under the water, circling the bait; hauled up flapping once it's hooked.
    const hooked = this.outcome === 'hooked';
    const fx = hooked ? bx : bx + Math.cos(t * 1.3) * s.size * 0.18;
    const fy = hooked ? by + s.size * 0.06 : water + s.size * 0.25 + Math.sin(t * 1.3) * s.size * 0.05;
    const fish = () => {
      g.fillStyle = hooked ? GOLD : '#ff9a1f';
      g.beginPath();
      g.ellipse(fx, fy, s.size * 0.05, s.size * 0.022, hooked ? Math.PI / 2 + Math.sin(t * 20) * 0.3 : 0, 0, Math.PI * 2);
      g.fill();
    };
    if (!hooked) fish();
    // The water over all that's under it: the bobber pulled under shows through, dimmed.
    g.fillStyle = 'rgba(40, 110, 190, 0.6)';
    g.fillRect(s.x + 3, water, s.size - 6, s.size * 0.55 - 3);
    if (hooked) fish();
    for (let i = 0; i < FISH_ROUNDS; i++) {
      const m = this.marks[i];
      g.fillStyle = m === undefined ? 'rgba(255,255,255,0.2)' : m ? GOLD : '#ff5a5a';
      g.beginPath();
      g.arc(s.x + s.size * (0.07 + i * 0.06), s.y + s.size * 0.06, s.size * 0.02, 0, Math.PI * 2);
      g.fill();
    }
    if (this.outcome) {
      g.textAlign = 'center';
      g.fillStyle = this.outcome === 'hooked' ? GOLD : '#ff5a5a';
      g.font = `bold ${s.size * 0.06}px Verdana, sans-serif`;
      g.fillText(this.outcome === 'hooked' ? 'HOOKED!' : this.outcome === 'spooked' ? 'TOO SOON: SPOOKED' : 'IT GOT AWAY', s.x + s.size / 2, s.y + s.size * 0.28);
    }
    s.status(`Fish ${Math.min(this.round + 1, FISH_ROUNDS)} of ${FISH_ROUNDS} · ${this.hooked} hooked`);
  }
}

// ---- Crumbling Castle ----

const CASTLE_STONES = ['#b8a890', '#a89878', '#c8b8a0', '#988868'];

class CastleGame implements MiniGame {
  result: SkillResult | null = null;
  private readonly game;
  /** The floors laid, bottom up; the ground floor is the first stone, square. */
  private readonly tower: { x: number; w: number }[] = [];
  /** Seconds the stone in play has been sliding, and its speed. */
  private clock = 0;
  private speed: number;
  /** Bits crumbling off, falling. */
  private readonly debris: { x: number; w: number; floor: number; t: number }[] = [];
  private square = 0;
  private pause = 0;

  constructor(
    private readonly synth: Synth,
    seed: number,
    level: number,
  ) {
    this.game = makeCastle(seed, level);
    this.tower.push({ x: (1 - this.game.width) / 2, w: this.game.width });
    this.speed = this.game.speed;
  }

  private get top(): { x: number; w: number } {
    return this.tower[this.tower.length - 1];
  }

  /** The stone in play's left edge. */
  private get sliding(): number {
    return castleSlide(this.clock, this.speed, this.top.w, this.game.phases[this.tower.length - 1] ?? 0);
  }

  update(_t: number, dt: number): void {
    for (const d of this.debris) d.t += dt;
    this.square = Math.max(0, this.square - dt * 2);
    if (this.pause > 0) {
      this.pause -= dt;
      return;
    }
    this.clock += dt;
  }

  key(code: string, repeat: boolean): void {
    if (!repeat && (code === 'Space' || code === 'Enter')) this.drop();
  }

  tap(): void {
    this.drop();
  }

  private drop(): void {
    if (this.pause > 0 || this.result) return;
    const below = this.top;
    const x = this.sliding;
    const laid = castleDrop(below, x);
    const floor = this.tower.length;
    // What hung over crumbles off, left or right.
    if (!laid.square) {
      if (x < below.x) this.debris.push({ x, w: Math.min(below.w, below.x - x), floor, t: 0 });
      if (x + below.w > below.x + below.w) this.debris.push({ x: Math.max(x, below.x + below.w), w: Math.min(below.w, x - below.x), floor, t: 0 });
    }
    if (laid.w <= 0.005) {
      this.synth.thud();
      this.result = { passed: false, note: `The castle crumbled at ${floor - 1} of ${this.game.floors} floors` };
      return;
    }
    this.tower.push({ x: laid.x, w: laid.w });
    if (laid.square) this.square = 1;
    this.synth.note(laid.square ? 660 + floor * 30 : 196 + floor * 12, 0.25, laid.square ? 'triangle' : 'square', 0.12);
    if (floor >= this.game.floors) {
      this.result = { passed: true, note: `All ${this.game.floors} floors up, ${Math.round((laid.w / this.game.width) * 100)}% of the first stone's width left` };
      return;
    }
    this.clock = 0;
    this.speed *= CASTLE_SPEEDUP;
    this.pause = 0.25;
  }

  draw(s: Stage): void {
    panel(s);
    const g = s.g;
    const fh = s.size * 0.07;
    const ground = s.y + s.size * 0.92;
    // The view climbs with the tower, keeping the top few floors and the stone in play in sight.
    const floorsUp = this.tower.length;
    const lift = Math.max(0, floorsUp - 8) * fh;
    const yOf = (floor: number) => ground - (floor + 1) * fh + lift;
    const xOf = (x: number) => s.x + 8 + x * (s.size - 16);
    const wOf = (w: number) => w * (s.size - 16);
    g.save();
    g.beginPath();
    g.rect(s.x + 3, s.y + 3, s.size - 6, s.size - 6);
    g.clip();
    g.fillStyle = 'rgba(80, 140, 60, 0.5)';
    g.fillRect(s.x, ground + lift, s.size, s.size);
    this.tower.forEach((f, i) => {
      g.fillStyle = CASTLE_STONES[i % CASTLE_STONES.length];
      g.fillRect(xOf(f.x), yOf(i), wOf(f.w), fh - 2);
      // Battlements on the top floor.
      if (i === this.tower.length - 1 && this.result?.passed) {
        for (let b = 0; b < 5; b += 2) g.fillRect(xOf(f.x) + (wOf(f.w) / 5) * b, yOf(i) - fh * 0.4, wOf(f.w) / 5, fh * 0.4);
      }
    });
    if (this.square > 0) {
      g.strokeStyle = `rgba(255, 210, 58, ${this.square})`;
      g.lineWidth = 3;
      const f = this.top;
      g.strokeRect(xOf(f.x), yOf(this.tower.length - 1), wOf(f.w), fh - 2);
    }
    for (const d of this.debris) {
      if (d.t > 1.5) continue;
      g.globalAlpha = 1 - d.t / 1.5;
      g.fillStyle = CASTLE_STONES[d.floor % CASTLE_STONES.length];
      g.fillRect(xOf(d.x) + (d.x < 0.5 ? -1 : 1) * d.t * 30, yOf(d.floor) + 0.5 * 900 * d.t * d.t, wOf(d.w), fh - 2);
      g.globalAlpha = 1;
    }
    if (!this.result) {
      g.fillStyle = CASTLE_STONES[floorsUp % CASTLE_STONES.length];
      g.globalAlpha = this.pause > 0 ? 0.4 : 1;
      g.fillRect(xOf(this.sliding), yOf(floorsUp), wOf(this.top.w), fh - 2);
      g.globalAlpha = 1;
    }
    g.restore();
    s.status(`Floor ${Math.min(floorsUp, this.game.floors)} of ${this.game.floors}`);
  }
}

/** Each card game, by its kind (the Deadstick Landing is flown on a track instead). */
const GAMES: Partial<Record<SkillKind, new (synth: Synth, seed: number, level: number) => MiniGame>> = {
  riff: RiffGame,
  nonagon: NonagonGame,
  banana: BananaGame,
  horology: HorologyGame,
  mindfuzz: SuiteGame,
  rattlesnake: SnakeGame,
  robot: RobotGame,
  fishies: FishingGame,
  castle: CastleGame,
};
