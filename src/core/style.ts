/**
 * Style: a running score for the moves a race rewards (drift boosts,
 * tricks, slipstreams, hazards used well, items landed or dodged,
 * shortcuts), chained when they come quickly. Pure, so the tests and the
 * results tally share it with the HUD.
 */
export type StyleMove = 'drift1' | 'drift2' | 'drift3' | 'drift4' | 'trick' | 'slipstream' | 'rocket' | 'hazard' | 'hit' | 'dodge' | 'block' | 'shortcut';

export const STYLE_POINTS: Record<StyleMove, number> = {
  drift1: 50,
  drift2: 100,
  drift3: 200,
  drift4: 350,
  trick: 150,
  slipstream: 150,
  rocket: 200,
  hazard: 250,
  hit: 200,
  dodge: 200,
  block: 150,
  shortcut: 250,
};

export const STYLE_NAMES: Record<StyleMove, string> = {
  drift1: 'BLUE DRIFT',
  drift2: 'ORANGE DRIFT',
  drift3: 'PURPLE DRIFT',
  drift4: 'RAINBOW DRIFT',
  trick: 'TRICK',
  slipstream: 'SLIPSTREAM',
  rocket: 'ROCKET START',
  hazard: 'HAZARD PLAY',
  hit: 'DIRECT HIT',
  dodge: 'DODGE',
  block: 'BLOCK',
  shortcut: 'SHORTCUT',
};

/** Land the next move within this long to grow the chain. */
export const CHAIN_WINDOW = 4;
/** The chain multiplies the points up to this. */
export const CHAIN_MAX = 5;
/** Each trick in a streak past the first adds this. */
const TRICK_STREAK_POINTS = 50;

export interface StyleEvent {
  move: StyleMove;
  /** Points it was worth, chain included. */
  points: number;
  chain: number;
  text: string;
}

export class StyleMeter {
  score = 0;
  chain = 0;
  chainLeft = 0;
  bestChain = 0;
  readonly counts: Record<StyleMove, number> = { drift1: 0, drift2: 0, drift3: 0, drift4: 0, trick: 0, slipstream: 0, rocket: 0, hazard: 0, hit: 0, dodge: 0, block: 0, shortcut: 0 };
  /** The last move, for the HUD. */
  last: StyleEvent | null = null;

  /** Lets the chain run out. */
  tick(dt: number): void {
    if (this.chainLeft <= 0) return;
    this.chainLeft = Math.max(0, this.chainLeft - dt);
    if (this.chainLeft === 0) this.chain = 0;
  }

  /** Scores a move; `streak` is a trick's place in its streak. */
  add(move: StyleMove, streak = 1): StyleEvent {
    this.chain = Math.min(CHAIN_MAX, this.chainLeft > 0 ? this.chain + 1 : 1);
    this.chainLeft = CHAIN_WINDOW;
    this.bestChain = Math.max(this.bestChain, this.chain);
    this.counts[move]++;
    const base = STYLE_POINTS[move] + (move === 'trick' ? TRICK_STREAK_POINTS * Math.max(0, streak - 1) : 0);
    const points = base * this.chain;
    this.score += points;
    const text = move === 'trick' && streak > 1 ? `TRICK x${streak}` : STYLE_NAMES[move];
    this.last = { move, points, chain: this.chain, text };
    return this.last;
  }

  get drifts(): number {
    return this.counts.drift1 + this.counts.drift2 + this.counts.drift3 + this.counts.drift4;
  }

  /** One line for the results: the score and what made it. */
  summary(): string {
    const parts: string[] = [];
    if (this.drifts) parts.push(`${this.drifts} drift${this.drifts === 1 ? '' : 's'}`);
    if (this.counts.trick) parts.push(`${this.counts.trick} trick${this.counts.trick === 1 ? '' : 's'}`);
    if (this.counts.slipstream) parts.push(`${this.counts.slipstream} slipstream${this.counts.slipstream === 1 ? '' : 's'}`);
    const items = this.counts.hit + this.counts.dodge + this.counts.block;
    if (items) parts.push(`${items} item play${items === 1 ? '' : 's'}`);
    if (this.counts.hazard) parts.push(`${this.counts.hazard} hazard play${this.counts.hazard === 1 ? '' : 's'}`);
    if (this.counts.shortcut) parts.push(`${this.counts.shortcut} shortcut${this.counts.shortcut === 1 ? '' : 's'}`);
    if (this.bestChain > 1) parts.push(`best chain x${this.bestChain}`);
    return `Style ${this.score.toLocaleString('en-US')}${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
  }
}

/** The drift move for a released spark tier (1..4). */
export function driftMove(tier: number): StyleMove {
  return (['drift1', 'drift1', 'drift2', 'drift3', 'drift4'][tier] ?? 'drift4') as StyleMove;
}
