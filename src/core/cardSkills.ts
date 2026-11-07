import { clamp, seededRandom } from './math';

/**
 * The card games: one for each of the story suites' spoken-song cards
 * (core/suites.ts), made from that song's words. In story mode a card with
 * a song long enough is played as its game, the song's words beside it,
 * for the length of its live recording (`length`, seconds): it builds over
 * that time and is judged over all of it, a clear a boon and a miss a life.
 * In Skill Games each has a fixed length of its own (the makers' default).
 * Each is a small simulation kept pure, so it can be played through in a
 * test: the screen (ui/skills/*.ts) feeds it time and the player's input,
 * draws it, and plays the sounds it asks for. `level` is 0..2.
 */

/** How a game ended: passed or not, and a line saying how it went. */
export interface CardOutcome {
  passed: boolean;
  note: string;
}

/** A sound a game asks for (the screen picks the voice), with a number where it matters (a lane, a note). */
export interface CardSound {
  s: string;
  n?: number;
}

/** What every card game's simulation has. */
export interface CardSim {
  result: CardOutcome | null;
  /** Sounds asked for since the screen last took them. */
  sounds: CardSound[];
  update(dt: number): void;
}

const lv = <T>(list: readonly T[], level: number): T => list[clamp(Math.round(level), 0, list.length - 1)];
const TAU = Math.PI * 2;

// ---- How long a card's game runs in story mode ----

/** A card's song shorter than this (seconds of music) is too short for a game: a plain lyric card instead. */
export const CARD_GAME_MIN = 45;
/** The longest a card's game runs, however long its song. */
export const CARD_GAME_MAX = 240;
/** A card with no recording of its own (it holds the one before, or the remix) plays its game this long. */
export const CARD_GAME_DEFAULT = 45;
/** The shortest a card's game runs when it starts late in its song (what's left of it is less). */
export const CARD_GAME_LEFT_MIN = 15;

/** A card's recording's length of music: from where it starts to where it stops (or the file's end). */
export function songSeconds(rec: { seconds: number; start?: number | null; end?: number | null }): number {
  return Math.max(0, (rec.end ?? rec.seconds) - (rec.start ?? 0));
}

/**
 * How a card with a game is played, by its recording (null: none of its
 * own): its game, for its song's length (capped at CARD_GAME_MAX), or the
 * default length with no song; or, its song too short for a game, a plain
 * lyric card for the song's length.
 */
export function cardPlan(rec: { seconds: number; start?: number | null; end?: number | null } | null | undefined): { game: boolean; length: number } {
  if (!rec) return { game: true, length: CARD_GAME_DEFAULT };
  const music = songSeconds(rec);
  if (music < CARD_GAME_MIN) return { game: false, length: music };
  return { game: true, length: Math.min(CARD_GAME_MAX, music) };
}

/**
 * A card game's length if it starts now: its full length (`full`), less
 * what's been heard of its song (`heard`, 0..1 of its `music` seconds; null:
 * not playing, so the full length), at least CARD_GAME_LEFT_MIN. Asked as
 * the game starts, past its rules card, so the time spent reading comes off
 * and the game still ends with its song.
 */
export function cardGameLeft(full: number, music: number | null, heard: number | null): number {
  if (heard == null || !music) return full;
  return Math.max(CARD_GAME_LEFT_MIN, Math.min(full, full - clamp(heard, 0, 1) * music));
}

// ---- Shares: every game passes on a share of what it offered ----

/** A share as the cards and the HUD say it: 60%. */
export const pct = (share: number): string => `${Math.round(share * 100)}%`;

/** How many of `n` a share asks for: at least one. */
export const shareOf = (n: number, share: number): number => Math.max(1, Math.ceil(n * share - 1e-9));

// ---- A New World: hide in the bear's shadow ----

/** Seconds the shadow walks the meadow in Skill Games. */
export const SHADOW_TIME = 32;
/** Seconds the dust takes to settle at the start. */
export const SHADOW_DUST = 2;

export interface ShadowGame {
  /** The shadow's width at the start, a share of the meadow; it narrows to SHADOW_NARROW of that. */
  width: number;
  /** Share of the game to spend in the shadow, and so the seconds in it to pass, out of `length`. */
  share: number;
  need: number;
  length: number;
  /** How fast you move, meadow widths a second (always faster than the shadow). */
  speed: number;
  /** The bear's wander: sines added up. */
  waves: { a: number; f: number; p: number }[];
}

export const SHADOW_NARROW = 0.75;

export function makeShadow(seed: number, level: number, length = SHADOW_TIME): ShadowGame {
  const rand = seededRandom(seed);
  const k = lv([0.8, 1, 1.15], level);
  const waves = [
    [0.2, 0.1],
    [0.11, 0.2],
    [0.06, 0.36],
  ].map(([a, f]) => ({ a, f: f * k * (0.85 + rand() * 0.3), p: rand() }));
  const share = lv([0.5, 0.56, 0.62], level);
  return { width: lv([0.26, 0.22, 0.19], level), share, need: length * share, length, speed: 0.7, waves };
}

/** The bear's clock: it wanders faster as the song goes on, from 0.85 of its pace to 1.2. */
const shadowClock = (g: ShadowGame, t: number): number => 0.85 * t + (0.35 * t * t) / (2 * g.length);

/** Where the shadow's middle is (0..1 across the meadow) at `t` seconds. */
export function shadowAt(g: ShadowGame, t: number): number {
  const c = shadowClock(g, t);
  return 0.5 + g.waves.reduce((sum, w) => sum + w.a * Math.sin(TAU * (w.f * c + w.p)), 0);
}

/** The shadow's width at `t`: narrowing as the day goes. */
export function shadowWidth(g: ShadowGame, t: number): number {
  return g.width * (1 - (1 - SHADOW_NARROW) * clamp(t / g.length, 0, 1));
}

export class ShadowSim implements CardSim {
  result: CardOutcome | null = null;
  sounds: CardSound[] = [];
  t = 0;
  /** Where you are, 0..1 across. */
  x = 0.5;
  /** Seconds spent in the shadow. */
  inside = 0;
  /** Which way you're walking: -1, 0 or 1. */
  dir = 0;
  hidden = false;

  constructor(readonly game: ShadowGame) {}

  get shadow(): number {
    return shadowAt(this.game, this.t);
  }

  get width(): number {
    return shadowWidth(this.game, this.t);
  }

  update(dt: number): void {
    if (this.result) return;
    this.t += dt;
    this.x = clamp(this.x + this.dir * this.game.speed * dt, 0.03, 0.97);
    const was = this.hidden;
    this.hidden = Math.abs(this.x - this.shadow) <= this.width / 2;
    if (this.hidden) this.inside += dt;
    if (this.hidden !== was) this.sounds.push({ s: this.hidden ? 'in' : 'out' });
    const { need, length, share } = this.game;
    const kept = pct(this.inside / length);
    if (this.inside + (length - this.t) < need - 1e-9) this.result = { passed: false, note: `Seen: ${kept} of the time in the shadow, ${pct(share)} needed` };
    else if (this.t >= length) this.result = { passed: this.inside >= need - 1e-9, note: `${kept} of the time in the shadow, ${pct(share)} needed${this.inside >= need - 1e-9 ? ', and the beast never saw you' : ''}` };
  }
}

// ---- Life / Death: are you you, or the copy? ----

/** Seconds of rounds in Skill Games. */
export const MIRROR_TIME = 36;
/** Seconds you're shown lit, before the shuffle. */
export const MIRROR_SHOW = 1.4;
/** Seconds to pick. */
export const MIRROR_PICK = 6;
/** Seconds the answer shows. */
export const MIRROR_REVEAL = 1.1;

export interface MirrorRound {
  /** Where you stand at the start. */
  start: number;
  /** The places swapped, in turn. */
  swaps: [number, number][];
  /** Seconds a swap takes. */
  swapTime: number;
}

export interface MirrorGame {
  /** Figures in the row: you and your copies. */
  figures: number;
  /** More rounds than there's time for: as many as are played count. */
  rounds: MirrorRound[];
  /** Share of the rounds played to get right. */
  share: number;
  length: number;
}

export function makeMirror(seed: number, level: number, length = MIRROR_TIME): MirrorGame {
  const rand = seededRandom(seed);
  const figures = lv([3, 3, 4], level);
  const swaps = lv([3, 4, 5], level);
  const swapTime = lv([0.6, 0.5, 0.42], level);
  // Each round takes 3.4 s at the least: never more than that many.
  const rounds = Array.from({ length: Math.ceil(length / 3.4) + 2 }, (_, i) => ({
    start: Math.floor(rand() * figures),
    // More swaps and quicker as it goes on.
    swaps: Array.from({ length: swaps + Math.min(6, Math.floor(i / 2)) }, (): [number, number] => {
      const a = Math.floor(rand() * figures);
      const b = (a + 1 + Math.floor(rand() * (figures - 1))) % figures;
      return [a, b];
    }),
    swapTime: swapTime * Math.max(0.7, 1 - 0.04 * i),
  }));
  return { figures, rounds, share: lv([0.6, 0.75, 0.8], level), length };
}

/** Where you end up after a round's shuffle. */
export function mirrorFinal(r: Pick<MirrorRound, 'start' | 'swaps'>): number {
  let at = r.start;
  for (const [a, b] of r.swaps) at = at === a ? b : at === b ? a : at;
  return at;
}

/** Whether a share of rounds right passes: at least one played, and enough of them right. */
export function sharePasses(right: number, played: number, share: number): boolean {
  return played > 0 && right >= Math.ceil(played * share - 1e-9);
}

export class MirrorSim implements CardSim {
  result: CardOutcome | null = null;
  sounds: CardSound[] = [];
  /** Seconds since the start. */
  t = 0;
  round = 0;
  phase: 'show' | 'shuffle' | 'pick' | 'reveal' = 'show';
  clock = 0;
  /** The place each figure stands in; figure 0 is you. */
  slots: number[] = [];
  /** Swaps done this round. */
  done = 0;
  cursor = 0;
  /** The place picked this round (null: none, too slow). */
  picked: number | null = null;
  right = 0;
  readonly marks: boolean[] = [];

  constructor(readonly game: MirrorGame) {
    this.begin();
  }

  private begin(): void {
    const n = this.game.figures;
    const start = this.game.rounds[this.round].start;
    this.slots = Array.from({ length: n }, (_, f) => f);
    this.slots[0] = start;
    if (start !== 0) this.slots[start] = 0;
    this.phase = 'show';
    this.clock = 0;
    this.done = 0;
    this.picked = null;
    this.cursor = Math.floor(n / 2);
  }

  /** Where you stand now. */
  get you(): number {
    return this.slots[0];
  }

  /** The swap under way and how far into it (0..1), during the shuffle. */
  get swapping(): { a: number; b: number; p: number } | null {
    if (this.phase !== 'shuffle') return null;
    const r = this.game.rounds[this.round];
    const sw = r.swaps[this.done];
    if (!sw) return null;
    return { a: sw[0], b: sw[1], p: clamp(this.clock / r.swapTime - this.done, 0, 1) };
  }

  update(dt: number): void {
    if (this.result) return;
    this.t += dt;
    if (this.t >= this.game.length) return this.end();
    this.clock += dt;
    const r = this.game.rounds[this.round];
    if (this.phase === 'show' && this.clock >= MIRROR_SHOW) {
      this.phase = 'shuffle';
      this.clock = 0;
      this.sounds.push({ s: 'swap' });
    } else if (this.phase === 'shuffle') {
      while (this.done < r.swaps.length && this.clock >= (this.done + 1) * r.swapTime) {
        const [a, b] = r.swaps[this.done];
        this.slots = this.slots.map((s) => (s === a ? b : s === b ? a : s));
        this.done++;
        if (this.done < r.swaps.length) this.sounds.push({ s: 'swap' });
      }
      if (this.done >= r.swaps.length) {
        this.phase = 'pick';
        this.clock = 0;
      }
    } else if (this.phase === 'pick' && this.clock >= MIRROR_PICK) this.choose(null);
    else if (this.phase === 'reveal' && this.clock >= MIRROR_REVEAL) {
      if (this.round + 1 >= this.game.rounds.length) return this.end();
      this.round++;
      this.begin();
    }
  }

  move(d: number): void {
    const n = this.game.figures;
    this.cursor = (this.cursor + d + n) % n;
  }

  /** Picks the figure at a place as you (null: out of time). */
  choose(slot: number | null): void {
    if (this.phase !== 'pick' || this.result) return;
    if (slot !== null) this.cursor = slot;
    this.picked = slot;
    const ok = slot === this.you;
    this.marks.push(ok);
    if (ok) this.right++;
    this.sounds.push({ s: ok ? 'good' : 'bad' });
    this.phase = 'reveal';
    this.clock = 0;
  }

  /** The song's over (or the rounds): judged on the rounds played. */
  private end(): void {
    const n = this.marks.length;
    const passed = sharePasses(this.right, n, this.game.share);
    const got = pct(n ? this.right / n : 0);
    this.result = { passed, note: passed ? `You knew yourself ${got} of the time, ${this.right} of ${n}` : `Lost in the labyrinthine: ${got}, ${this.right} of ${n} (${pct(this.game.share)} needed)` };
  }
}

// ---- Some Context: the storm's opening hits ----

/** Hit windows either side of a hit, seconds. */
export const OVERTURE_GOOD = 0.1;
export const OVERTURE_OK = 0.2;
/** Bars of hits in Skill Games, after a bar's count-in. */
export const OVERTURE_BARS = 9;
/** Seconds a ring takes to close in on the cloud. */
export const OVERTURE_APPROACH = 1.5;

export interface OvertureGame {
  bpm: number;
  bars: number;
  /** When each hit comes, seconds from the start of the count-in. */
  hits: number[];
  /** Share of the hits to land (every two strays take one off). */
  need: number;
  length: number;
}

/** `length`: seconds to fill (as many bars as fit); none, Skill Games' OVERTURE_BARS. */
export function makeOverture(seed: number, level: number, length?: number): OvertureGame {
  const rand = seededRandom(seed);
  const bpm = lv([84, 92, 100], level);
  const eighth = 30 / bpm;
  const start = 8 * eighth;
  const bars = length ? Math.max(4, Math.floor((length - start - 2 * eighth) / (8 * eighth))) : OVERTURE_BARS;
  const fill = lv([0.3, 0.36, 0.42], level);
  const hits: number[] = [];
  let last = -Infinity;
  for (let bar = 0; bar < bars; bar++) {
    // The storm builds: busier bar by bar, and busier still over the last two.
    const build = 0.8 + (0.6 * bar) / Math.max(1, bars - 1);
    const f = fill * build + (bar >= bars - 2 ? 0.15 : 0);
    for (let i = 0; i < 8; i++) {
      const t = start + (bar * 8 + i) * eighth;
      const on = i === 0 || rand() < (i % 2 ? f * 0.5 : f);
      // Never two eighths running before the build: each hit reads as its own.
      if (on && (t - last > eighth * 1.5 || bar >= bars - 2)) {
        hits.push(t);
        last = t;
      }
    }
  }
  return { bpm, bars, hits, need: lv([0.6, 0.65, 0.7], level), length: start + bars * 8 * eighth + 2 * eighth };
}

/** How a press lands on a hit: 'good', 'ok', or null for nowhere near. */
export function overtureJudge(hitT: number, pressT: number): 'good' | 'ok' | null {
  const d = Math.abs(hitT - pressT);
  return d <= OVERTURE_GOOD ? 'good' : d <= OVERTURE_OK ? 'ok' : null;
}

export function overturePasses(g: OvertureGame, hits: number, strays: number): boolean {
  return Math.max(0, hits - Math.floor(strays / 2)) >= Math.ceil(g.hits.length * g.need);
}

export class OvertureSim implements CardSim {
  result: CardOutcome | null = null;
  sounds: CardSound[] = [];
  t = 0;
  readonly judged: ('good' | 'ok' | 'miss' | null)[];
  landed = 0;
  strays = 0;
  private beat = -1;

  constructor(readonly game: OvertureGame) {
    this.judged = game.hits.map(() => null);
  }

  update(dt: number): void {
    if (this.result) return;
    this.t += dt;
    const g = this.game;
    const beat = Math.floor((this.t * g.bpm) / 60);
    if (beat !== this.beat && this.t < g.length) {
      this.beat = beat;
      this.sounds.push({ s: 'beat', n: beat % 4 });
    }
    g.hits.forEach((h, i) => {
      if (this.judged[i] === null && this.t > h + OVERTURE_OK) this.judged[i] = 'miss';
    });
    if (this.t > g.length) {
      const n = g.hits.length;
      this.result = { passed: overturePasses(g, this.landed, this.strays), note: `${pct(this.landed / n)} of the hits, ${this.landed} of ${n}${this.strays ? `, ${this.strays} stray` : ''} (${pct(g.need)} needed)` };
    }
  }

  press(): void {
    if (this.result) return;
    let best = -1;
    let bestD = Infinity;
    this.game.hits.forEach((h, i) => {
      const d = Math.abs(h - this.t);
      if (this.judged[i] === null && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    const j = best >= 0 ? overtureJudge(this.game.hits[best], this.t) : null;
    if (j) {
      this.judged[best] = j;
      this.landed++;
      this.sounds.push({ s: 'hit', n: j === 'good' ? 1 : 0 });
    } else {
      this.strays++;
      this.sounds.push({ s: 'stray' });
    }
  }
}

// ---- The Reticent Raconteur: the hiding place in the quagmire ----

/** Seconds of the battle in Skill Games. */
export const HIDE_TIME = 34;
/** Where you hide, across the quagmire (0..1). */
export const HIDE_X = 0.5;
/** Seconds a sweep's warning shows at its edge before it comes on. */
export const HIDE_WARN = 1.5;
/** Seconds up in the open to fill your lungs from empty. */
export const HIDE_FILL = 1.5;
/** Seconds you're stuck up, gasping, when your air runs out under the mud. */
export const HIDE_GASP = 1;
/** A beam's edges are forgiving: it sees you only this far (seconds) inside its pass. */
export const HIDE_EDGE = 0.08;
/** Seconds before a flare of the battle its ring starts closing. */
export const HIDE_LOOK = 1.6;

/** A beam sweeping across the quagmire: lightning from the lord, or the Balrog's fire. */
export interface HideBeam {
  /** When its leading edge reaches you, and seconds it takes to pass over. */
  at: number;
  dur: number;
  /** The side it comes from: -1 the left, 1 the right. */
  from: -1 | 1;
  kind: 'light' | 'fire';
  /** Widths of the quagmire a second. */
  speed: number;
}

/** A flare of the battle to glimpse: up out of the mud (and not gasping) within `w` seconds of `at`. */
export interface HideFlare {
  at: number;
  w: number;
  kind: 'light' | 'fire';
}

export interface HideGame {
  beams: HideBeam[];
  flares: HideFlare[];
  /** Seconds of air under the mud, from full. */
  air: number;
  /** Times you can be seen: this many and you're found (a share of the beams, so as many for the song's length). */
  lives: number;
  /** Share of the flares to glimpse. */
  share: number;
  length: number;
}

/** Where a beam's leading edge is at `t` (0..1 across; off the stage outside that). */
export function beamLead(b: HideBeam, t: number): number {
  return HIDE_X - b.from * (t - b.at) * b.speed;
}

/** When a beam's leading edge comes onto the stage. */
export function beamEnters(b: HideBeam): number {
  return b.at - HIDE_X / b.speed;
}

/**
 * The battle, as it reaches the hiding place: beams sweep the quagmire one
 * at a time, then two and three close together as the song goes on, quicker
 * and wider; between them the battle flares, to be glimpsed. Every run under
 * the mud a beam asks for fits in your air with some to spare, with time
 * after it to fill your lungs again.
 */
export function makeHide(seed: number, level: number, length = HIDE_TIME): HideGame {
  const rand = seededRandom(seed);
  const air = lv([5, 4.5, 4], level);
  const quick = lv([0.9, 1, 1.1], level);
  const beams: HideBeam[] = [];
  const flares: HideFlare[] = [];
  /** Seconds a careful player ducks before a beam, and stays down after it. */
  const lead = 0.25;
  const lag = 0.2;
  const kind = (): 'light' | 'fire' => (rand() < 0.5 ? 'light' : 'fire');
  // The first comes on after its warning has had time to be seen.
  let t = 4.6;
  for (;;) {
    const p = clamp(t / length, 0, 1);
    const speed = (0.34 + 0.22 * p) * quick;
    const count = rand() < 0.25 + 0.5 * p ? (p > 0.4 && rand() < 0.45 ? 3 : 2) : 1;
    const cluster: HideBeam[] = [];
    const inGaps: HideFlare[] = [];
    let at = t;
    let under = 0;
    let longest = 0;
    for (let i = 0; i < count; i++) {
      const dur = (0.7 + rand() * 0.5) * (1 + 0.3 * p);
      cluster.push({ at, dur, from: rand() < 0.5 ? -1 : 1, kind: kind(), speed });
      under += dur;
      if (i === count - 1) break;
      // Room between two to come up (and maybe glimpse the battle), or so tight you stay down.
      const open = rand() < 0.65;
      const gap = open ? 1 + rand() * 0.4 - 0.25 * p : 0.25 + rand() * 0.15;
      if (open) {
        longest = Math.max(longest, under + lead + lag);
        under = 0;
        if (rand() < 0.75) inGaps.push({ at: at + dur + gap / 2, w: gap / 2, kind: kind() });
      } else under += gap;
      at += dur + gap;
    }
    longest = Math.max(longest, under + lead + lag);
    // Too long under for your air: just the first beam.
    if (longest > air * 0.8) {
      cluster.length = 1;
      inGaps.length = 0;
      longest = cluster[0].dur + lead + lag;
    }
    const last = cluster[cluster.length - 1];
    const end = last.at + last.dur;
    if (end > length - 1.5) break;
    beams.push(...cluster);
    flares.push(...inGaps);
    // The open marsh after: time to fill your lungs, and often a flare to see.
    const rest = Math.max((HIDE_FILL * longest) / air + 0.8, ((3 - 1.4 * p) / quick) * (0.8 + rand() * 0.5));
    if (rand() < 0.8) {
      const fat = end + lag + 0.3 + rand() * Math.max(0, rest - lag - lead - 0.6);
      const w = (0.85 - 0.3 * p) / quick;
      if (fat + w < length - 0.3) flares.push({ at: fat, w, kind: kind() });
    }
    t = end + rest;
  }
  // However short the song, the battle flares at least once, after the last beam (or before the first).
  if (!flares.length) {
    const last = beams[beams.length - 1];
    const at = last ? last.at + last.dur + 0.9 : 2.5;
    flares.push({ at: Math.min(at, length - 1), w: 0.8 / quick, kind: kind() });
  }
  flares.sort((a, b) => a.at - b.at);
  return { beams, flares, air, lives: Math.max(1, Math.round(beams.length * lv([0.44, 0.33, 0.3], level))), share: lv([0.6, 0.7, 0.75], level), length };
}

export class HideSim implements CardSim {
  result: CardOutcome | null = null;
  sounds: CardSound[] = [];
  t = 0;
  /** Down is held. */
  holding = false;
  /** Under the mud now. */
  under = false;
  /** Air left, 0..1. */
  air = 1;
  /** Seconds left gasping (stuck up). */
  gasp = 0;
  /** Times a beam has caught you. */
  seen = 0;
  glimpsed = 0;
  /** Each flare glimpsed, and each beam that saw you. */
  readonly got: boolean[];
  readonly caught: boolean[];
  private warned = 0;

  constructor(readonly game: HideGame) {
    this.got = game.flares.map(() => false);
    this.caught = game.beams.map(() => false);
  }

  /** Flares over and done with (glimpsed or gone). */
  get past(): number {
    return this.game.flares.filter((f, i) => this.got[i] || this.t > f.at + f.w).length;
  }

  update(dt: number): void {
    if (this.result) return;
    const g = this.game;
    this.t += dt;
    const t = this.t;
    this.gasp = Math.max(0, this.gasp - dt);
    const down = this.holding && this.gasp <= 0;
    if (down !== this.under) {
      this.under = down;
      this.sounds.push({ s: down ? 'down' : 'up' });
    }
    if (this.under) {
      this.air -= dt / g.air;
      if (this.air <= 0) {
        this.air = 0;
        this.under = false;
        this.gasp = HIDE_GASP;
        this.sounds.push({ s: 'gasp' });
      }
    } else this.air = Math.min(1, this.air + dt / HIDE_FILL);
    while (this.warned < g.beams.length && t >= beamEnters(g.beams[this.warned]) - HIDE_WARN) this.sounds.push({ s: 'warn', n: g.beams[this.warned++].from });
    if (!this.under)
      g.beams.forEach((b, i) => {
        if (this.caught[i] || t <= b.at + HIDE_EDGE || t >= b.at + b.dur - HIDE_EDGE) return;
        this.caught[i] = true;
        this.seen++;
        this.sounds.push({ s: 'seen', n: this.seen });
      });
    if (this.seen >= g.lives) {
      this.result = { passed: false, note: `Seen from the quagmire ${this.seen} times, and found` };
      return;
    }
    // Gasping, eyes full of mud, you see nothing of the battle.
    if (!this.under && this.gasp <= 0)
      g.flares.forEach((f, i) => {
        if (this.got[i] || Math.abs(t - f.at) > f.w) return;
        this.got[i] = true;
        this.glimpsed++;
        this.sounds.push({ s: 'glimpse', n: this.glimpsed });
      });
    if (t >= g.length) {
      const n = g.flares.length;
      const passed = sharePasses(this.glimpsed, n, g.share);
      this.result = {
        passed,
        note: passed ? `You saw it all from your hiding place: ${pct(this.glimpsed / n)} of the flares glimpsed` : `${pct(n ? this.glimpsed / n : 0)} of the flares glimpsed, ${this.glimpsed} of ${n} (${pct(g.share)} needed)`,
      };
    }
  }
}

// ---- The Floating Fire: through the lightning, catching golden wire ----

/** Where the floating fire flies across, and its size. */
export const FIRE_X = 0.25;
export const FIRE_R = 0.035;
/** Half a bolt's width. */
export const BOLT_W = 0.03;
/** Seconds of flight in Skill Games. */
export const FIRE_TIME = 26;
/** Width units between bolts. */
export const BOLT_GAP = 0.55;
/** Up and down speed, heights a second, and how quickly it gets there. */
export const FIRE_RISE = 0.6;
export const FIRE_EASE = 4;
/** Seconds a strike leaves you flickering, safe. */
export const FIRE_SAFE = 1;

export interface FireGame {
  /** Each bolt: where it strikes (along the sky) and its gap's middle and height. */
  bolts: { x: number; gap: number; size: number }[];
  wires: { x: number; y: number }[];
  /** Widths a second the sky scrolls by. */
  speed: number;
  /** Strikes that put the fire out: a share of the bolts, so as many for the song's length. */
  sparks: number;
  /** Share of the golden wire to catch, and so how many. */
  share: number;
  need: number;
}

export function makeFire(seed: number, level: number, length = FIRE_TIME): FireGame {
  const rand = seededRandom(seed);
  const size = lv([0.38, 0.34, 0.3], level);
  const speed = lv([0.3, 0.34, 0.38], level);
  // As many bolts as the flight has room for: the last one passed as it ends.
  const last = length * speed + FIRE_X - 0.15;
  const n = Math.max(4, Math.floor((last - 1.3) / BOLT_GAP) + 1);
  const bolts: FireGame['bolts'] = [];
  let gap = 0.5;
  for (let i = 0; i < n; i++) {
    // The gaps narrow and swing further as the storm goes on.
    const on = i / Math.max(1, n - 1);
    gap = clamp(gap + (rand() * 2 - 1) * (0.22 + 0.1 * on), 0.28, 0.72);
    bolts.push({ x: 1.3 + i * BOLT_GAP, gap, size: size * (1 - 0.22 * on) });
  }
  const wires: FireGame['wires'] = [];
  bolts.forEach((b, i) => {
    wires.push({ x: b.x, y: b.gap + (rand() - 0.5) * b.size * 0.35 });
    const nb = bolts[i + 1];
    if (nb) wires.push({ x: (b.x + nb.x) / 2, y: clamp((b.gap + nb.gap) / 2 + (rand() * 2 - 1) * 0.22, 0.15, 0.85) });
  });
  const share = lv([0.55, 0.62, 0.68], level);
  return { bolts, wires, speed, sparks: Math.max(1, Math.round(bolts.length * lv([0.23, 0.21, 0.125], level))), share, need: shareOf(wires.length, share) };
}

export class FireSim implements CardSim {
  result: CardOutcome | null = null;
  sounds: CardSound[] = [];
  t = 0;
  y = 0.5;
  vy = 0;
  holding = false;
  sparks: number;
  caught = 0;
  /** Seconds left safe after a strike. */
  safe = 0;
  readonly taken: boolean[];

  constructor(readonly game: FireGame) {
    this.sparks = game.sparks;
    this.taken = game.wires.map(() => false);
  }

  /** How far the sky has scrolled. */
  get scroll(): number {
    return this.t * this.game.speed;
  }

  update(dt: number): void {
    if (this.result) return;
    this.t += dt;
    const target = this.holding ? -FIRE_RISE : FIRE_RISE;
    this.vy += (target - this.vy) * Math.min(1, FIRE_EASE * dt);
    this.y += this.vy * dt;
    if (this.y < FIRE_R || this.y > 1 - FIRE_R) {
      this.y = clamp(this.y, FIRE_R, 1 - FIRE_R);
      this.vy = 0;
    }
    this.safe = Math.max(0, this.safe - dt);
    const s = this.scroll;
    this.game.wires.forEach((w, i) => {
      if (!this.taken[i] && Math.hypot(w.x - s - FIRE_X, w.y - this.y) < 0.06) {
        this.taken[i] = true;
        this.caught++;
        this.sounds.push({ s: 'wire', n: this.caught });
      }
    });
    if (this.safe <= 0) {
      for (const b of this.game.bolts) {
        if (Math.abs(b.x - s - FIRE_X) >= BOLT_W + FIRE_R * 0.6) continue;
        if (Math.abs(this.y - b.gap) <= b.size / 2) continue;
        this.sparks--;
        this.safe = FIRE_SAFE;
        this.sounds.push({ s: 'struck' });
        if (this.sparks <= 0) {
          this.result = { passed: false, note: `Struck down, ${this.caught} golden wire caught` };
          return;
        }
        break;
      }
    }
    const last = this.game.bolts[this.game.bolts.length - 1];
    if (last.x - s < FIRE_X - 0.15) {
      const need = this.game.need;
      const got = pct(this.caught / this.game.wires.length);
      this.result = this.caught >= need ? { passed: true, note: `Through the storm with ${got} of the golden wire` } : { passed: false, note: `${got} of the golden wire caught, ${this.caught} of ${this.game.wires.length} (${pct(this.game.share)} needed)` };
    }
  }
}

// ---- The Acrid Corpse: catch the last light before the sun sets ----

export const EMBER_LANES = 3;
/** Where the jar catches, and where the embers rise from (shares across). */
export const EMBER_CATCH = 0.78;
export const EMBER_FROM = 0.08;
/** Seconds till the sun is down in Skill Games. */
export const EMBER_TIME = 27;
/** The final clap of light is worth this many embers. */
export const EMBER_FINAL = 3;

export interface EmberItem {
  /** When it reaches the jar, seconds. */
  at: number;
  lane: number;
  kind: 'ember' | 'smoke' | 'final';
}

export interface EmberGame {
  items: EmberItem[];
  /** Shares across a second. */
  speed: number;
  /** All the light there is to catch (the embers, and the final clap's EMBER_FINAL), the share of it to catch, and so how much. */
  total: number;
  share: number;
  need: number;
  /** When the sun is down: the end. */
  end: number;
}

export function makeEmbers(seed: number, level: number, length = EMBER_TIME): EmberGame {
  const rand = seededRandom(seed);
  const spacing = lv([1.25, 1.1, 1], level);
  const embers: EmberItem[] = [];
  let t = 2.6;
  // Quicker and quicker as the sun goes down, till the final clap of light.
  while (t < length - 1.8) {
    embers.push({ at: t, lane: Math.floor(rand() * EMBER_LANES), kind: 'ember' });
    t += spacing * (1.1 - 0.3 * (t / length)) * (0.8 + rand() * 0.4);
  }
  const final: EmberItem = { at: Math.max(t, length - 0.8), lane: Math.floor(rand() * EMBER_LANES), kind: 'final' };
  // Smoke where you'd sit, waiting: halfway to the next ember, in the last one's lane.
  const smoke: EmberItem[] = [];
  const want = Math.round((lv([3, 5, 7], level) * embers.length) / 20);
  const order = embers.map((_, i) => i).filter((i) => i > 0 && i < embers.length - 1);
  while (smoke.length < want && order.length) {
    const i = order.splice(Math.floor(rand() * order.length), 1)[0];
    const a = embers[i];
    const b = embers[i + 1];
    if (a.lane !== b.lane && !smoke.some((s) => Math.abs(s.at - a.at) < 2)) smoke.push({ at: (a.at + b.at) / 2, lane: a.lane, kind: 'smoke' });
  }
  const items = [...embers, ...smoke, final].sort((x, y) => x.at - y.at);
  const total = embers.length + EMBER_FINAL;
  const share = lv([0.52, 0.6, 0.65], level);
  return { items, speed: lv([0.32, 0.37, 0.42], level), total, share, need: shareOf(total, share), end: final.at + 0.8 };
}

export class EmberSim implements CardSim {
  result: CardOutcome | null = null;
  sounds: CardSound[] = [];
  t = 0;
  lane = 1;
  /** Light caught: an ember one, the last clap EMBER_FINAL, smoke snuffs one. */
  light = 0;
  /** What came of each item: caught, missed into the sun, or null still coming. */
  readonly fate: ('caught' | 'gone' | null)[];

  constructor(readonly game: EmberGame) {
    this.fate = game.items.map(() => null);
  }

  /** An item's place across at the moment (EMBER_CATCH as it reaches the jar). */
  xOf(it: EmberItem): number {
    return EMBER_CATCH - (it.at - this.t) * this.game.speed;
  }

  update(dt: number): void {
    if (this.result) return;
    this.t += dt;
    this.game.items.forEach((it, i) => {
      if (this.fate[i] !== null || this.t < it.at) return;
      const hit = it.lane === this.lane;
      this.fate[i] = hit ? 'caught' : 'gone';
      if (!hit) return;
      if (it.kind === 'smoke') {
        this.light = Math.max(0, this.light - 1);
        this.sounds.push({ s: 'smoke' });
      } else {
        this.light += it.kind === 'final' ? EMBER_FINAL : 1;
        this.sounds.push({ s: it.kind, n: this.light });
      }
    });
    if (this.t >= this.game.end) {
      const need = this.game.need;
      const got = pct(this.light / this.game.total);
      this.result = this.light >= need ? { passed: true, note: `${got} of the last light caught before the moonless night` } : { passed: false, note: `The sun set on ${got} of the light caught (${pct(this.game.share)} needed)` };
    }
  }

  move(d: number): void {
    this.lane = clamp(this.lane + d, 0, EMBER_LANES - 1);
  }
}

// ---- Welcome to an Altered Future: keep the satellites lit ----

/** Seconds to keep them lit in Skill Games. */
export const SAT_TIME = 30;

export interface SatGame {
  /** Seconds each satellite takes to go from full to black at the start. */
  lives: number[];
  /** How bright each starts. */
  starts: number[];
  /** How much faster everything fades by the end. */
  dark: number;
  /** Share of the sky to keep lit over the game: of every satellite's every second, how much it's lit. */
  share: number;
  length: number;
}

export function makeSats(seed: number, level: number, length = SAT_TIME): SatGame {
  const rand = seededRandom(seed);
  const n = lv([4, 5, 5], level);
  const [lo, hi] = lv<[number, number]>([[8.5, 11.5], [7.5, 10.5], [6.5, 9]], level);
  return {
    lives: Array.from({ length: n }, () => lo + rand() * (hi - lo)),
    starts: Array.from({ length: n }, () => 0.85 + rand() * 0.15),
    dark: lv([1.6, 1.7, 1.8], level),
    // As the old three of four and four of five kept lit all the way, at the least; one lost late costs less than one lost early.
    share: lv([0.75, 0.8, 0.8], level),
    length,
  };
}

export class SatSim implements CardSim {
  result: CardOutcome | null = null;
  sounds: CardSound[] = [];
  t = 0;
  readonly light: number[];
  cursor = 0;
  /** Satellite-seconds lit so far, as a share of all the satellites (so seconds of the whole sky lit). */
  litTime = 0;

  constructor(readonly game: SatGame) {
    this.light = [...game.starts];
  }

  get lit(): number {
    return this.light.filter((l) => l > 0).length;
  }

  /** Share of the sky kept lit so far. */
  get kept(): number {
    return this.t > 0 ? this.litTime / this.t : 1;
  }

  /** How dark the world is, 0..1. */
  get gloom(): number {
    return clamp(this.t / this.game.length, 0, 1);
  }

  update(dt: number): void {
    if (this.result) return;
    this.t += dt;
    const g = this.game;
    const rate = 1 + (g.dark - 1) * this.gloom;
    this.light.forEach((l, i) => {
      if (l <= 0) return;
      const next = l - (rate / g.lives[i]) * dt;
      this.light[i] = Math.max(0, next);
      if (next <= 0) this.sounds.push({ s: 'black', n: i });
    });
    const n = g.lives.length;
    this.litTime += (dt * this.lit) / n;
    // A satellite gone black stays black: the most still to come is the ones lit now, lit to the end.
    const most = this.litTime + (Math.max(0, g.length - this.t) * this.lit) / n;
    if (most < g.share * g.length - 1e-9) this.result = { passed: false, note: `Digital black: the sky ${pct(most / g.length)} lit at the most, ${pct(g.share)} needed` };
    else if (this.t >= g.length) this.result = { passed: true, note: `The sky ${pct(this.litTime / g.length)} lit, ${this.lit} of ${n} satellites still shining in the altered future` };
  }

  move(d: number): void {
    const n = this.light.length;
    this.cursor = (this.cursor + d + n) % n;
  }

  /** Lights a satellite back up to full, if it's not already gone black. */
  charge(i = this.cursor): void {
    if (this.result || i < 0 || i >= this.light.length) return;
    this.cursor = i;
    if (this.light[i] <= 0) {
      this.sounds.push({ s: 'dead' });
      return;
    }
    this.light[i] = 1;
    this.sounds.push({ s: 'charge', n: i });
  }
}

// ---- Soy-Protein Munt Machine: build it in order ----

export const MUNT_PARTS = ['steel', 'soy', 'tube', 'vat'] as const;
export type MuntPart = (typeof MUNT_PARTS)[number];
export const MUNT_NAMES: Record<MuntPart, string> = { steel: 'Steel', soy: 'Soy-protein', tube: 'Test tube', vat: 'Vat' };
/** Where the claw is, how far either side it reaches, and the room between parts on the belt (shares across). */
export const MUNT_CLAW = 0.5;
export const MUNT_REACH = 0.07;
export const MUNT_SPACING = 0.2;
/** Seconds the claw takes to come back up. */
export const MUNT_COOL = 0.35;
/** Seconds of building in Skill Games. */
export const MUNT_TIME = 36;
/** The belt ends this much faster than it starts. */
export const MUNT_RUSH = 0.3;

export interface MuntGame {
  /** The belt's parts, in order. */
  belt: MuntPart[];
  /** Shares across a second, at the start. */
  speed: number;
  /** Machines the belt brings the parts for in the time, every part grabbed as it comes. */
  possible: number;
  /** Share of those to build, and so how many by the end. */
  share: number;
  machines: number;
  /** Wrong parts grabbed that end it: as many for the game's length. */
  strikes: number;
  length: number;
}

export function makeMunt(seed: number, level: number, length = MUNT_TIME): MuntGame {
  const rand = seededRandom(seed);
  const speed = lv([0.24, 0.28, 0.32], level);
  const belt: MuntPart[] = [];
  // Shuffled fours: never long before a part comes round again.
  while (belt.length < (length * speed * (1 + MUNT_RUSH)) / MUNT_SPACING + 12) {
    const four = [...MUNT_PARTS];
    while (four.length) belt.push(four.splice(Math.floor(rand() * four.length), 1)[0]);
  }
  const possible = muntPossible(belt, speed, length);
  const share = lv([0.4, 0.4, 0.5], level);
  return { belt, speed, possible, share, machines: shareOf(possible, share), strikes: Math.max(2, Math.round((lv([3, 3, 2], level) * length) / MUNT_TIME)), length };
}

/** How far a belt at `speed` has run `t` seconds into a game of `length` (it speeds up as it goes). */
export function muntRun(speed: number, t: number, length: number): number {
  return speed * (t + (MUNT_RUSH * t * t) / (2 * length));
}

/** Machines the belt could make: each part the machine needs grabbed as it comes under the claw, before the end. */
export function muntPossible(belt: readonly MuntPart[], speed: number, length: number): number {
  const run = muntRun(speed, length, length);
  let parts = 0;
  let built = 0;
  for (let i = 0; i < belt.length && run - i * MUNT_SPACING >= MUNT_CLAW; i++) {
    if (belt[i] !== MUNT_PARTS[parts]) continue;
    if (++parts < MUNT_PARTS.length) continue;
    parts = 0;
    built++;
  }
  return Math.max(1, built);
}

export class MuntSim implements CardSim {
  result: CardOutcome | null = null;
  sounds: CardSound[] = [];
  t = 0;
  /** Parts fitted to the machine being built. */
  parts = 0;
  built = 0;
  strikes = 0;
  /** Seconds till the claw can grab again. */
  cool = 0;
  readonly taken = new Set<number>();

  constructor(readonly game: MuntGame) {}

  get needed(): MuntPart {
    return MUNT_PARTS[this.parts];
  }

  /** How far the belt has run (it speeds up as the song goes). */
  get run(): number {
    return muntRun(this.game.speed, this.t, this.game.length);
  }

  /** A belt part's place across now. */
  xOf(i: number): number {
    return this.run - i * MUNT_SPACING;
  }

  /** The part under the claw, if any. */
  get under(): number | null {
    const first = Math.max(0, Math.floor((this.run - MUNT_CLAW - MUNT_REACH) / MUNT_SPACING));
    for (let i = first; i < this.game.belt.length; i++) {
      const x = this.xOf(i);
      if (x < MUNT_CLAW - MUNT_REACH) break;
      if (x <= MUNT_CLAW + MUNT_REACH && !this.taken.has(i)) return i;
    }
    return null;
  }

  update(dt: number): void {
    if (this.result) return;
    this.t += dt;
    this.cool = Math.max(0, this.cool - dt);
    const g = this.game;
    if (this.t >= g.length)
      this.result = {
        passed: this.built >= g.machines,
        note: `${this.built} of ${g.possible} machines born from the vat (${pct(this.built / g.possible)}, ${pct(g.share)} needed)${this.strikes ? `, ${this.strikes} wrong part${this.strikes > 1 ? 's' : ''}` : ''}`,
      };
  }

  grab(): void {
    if (this.result || this.cool > 0) return;
    this.cool = MUNT_COOL;
    const i = this.under;
    if (i === null) {
      this.sounds.push({ s: 'empty' });
      return;
    }
    this.taken.add(i);
    if (this.game.belt[i] !== this.needed) {
      this.strikes++;
      this.sounds.push({ s: 'wrong' });
      if (this.strikes >= this.game.strikes) this.result = { passed: false, note: `Wrong part ${this.strikes} times: the machine came out wrong, ${this.built} built` };
      return;
    }
    this.parts++;
    this.sounds.push({ s: 'fit', n: this.parts });
    if (this.parts < MUNT_PARTS.length) return;
    this.parts = 0;
    this.built++;
    this.sounds.push({ s: 'born' });
  }
}

// ---- The words along the side ----

/**
 * Which of a card's `count` lines shows: paced to its song (`song`, 0..1
 * through the recording's music) when that's playing, else spread over the
 * game's `length` seconds (`t` into it), the last line held once it's there.
 */
export function lyricIndex(count: number, t: number, length: number, song: number | null): number {
  if (count <= 0) return -1;
  const p = song ?? t / length;
  return clamp(Math.floor(p * count), 0, count - 1);
}

/** Each card game's length in seconds, as made with `length` (or its Skill Games default). */
export function cardGameSeconds(kind: string, level: number, length?: number): number {
  switch (kind) {
    case 'context':
      return makeOverture(1, level, length).length;
    case 'acrid':
      return makeEmbers(1, level, length).end;
    default:
      return length ?? { newworld: SHADOW_TIME, lifedeath: MIRROR_TIME, raconteur: HIDE_TIME, floatingfire: FIRE_TIME, future: SAT_TIME, munt: MUNT_TIME }[kind] ?? 30;
  }
}
