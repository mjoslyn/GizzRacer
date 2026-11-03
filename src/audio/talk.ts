/**
 * Where the music starts in a live recording: past the band talking to the
 * crowd, tuning up and the cheering, to where they actually play.
 *
 * Music on a live mix has heavy, sustained low end (the kick and the bass
 * under everything); talk and a cheering crowd come and go and have little
 * below a couple of hundred hertz. So: the level of the lows in tenths of a
 * second, against how loud the lows get in what was heard; the music is
 * where they hold up, nearly without a break, for a few seconds. And it's
 * only skipped to when the lows jump there, several times over what came
 * before: a song that builds from a quiet intro (Magma) rises less than
 * that, and is played from the top. Measured on recordings from the
 * Archive: talk then the band jumps 6 to 10 times, a build under 2.
 */

/** The lowpass the lows are read through (Hz). */
const LOW_CUT = 150;
/** Analysis windows (s). */
const WINDOW = 0.1;
/** Music is lows at this share of their loud level (the 90th percentile)... */
const ON = 0.3;
/** ...for this long (s), in at least this share of windows. */
const HOLD = 4;
const HOLD_SHARE = 0.85;
/** The lows must be this many times louder from the start than before it. */
const CONTRAST = 2.5;
/** Start this long (s) before the music, so the first note isn't clipped; and don't bother skipping less than SKIP_MIN. */
const LEAD = 1;
/** How far back (s) from the music a count-in's hits are kept, and how loud (a share of the loud level) a hit must be. */
const COUNT_IN = 3;
const COUNT_IN_LEVEL = 0.6;
const SKIP_MIN = 2;

/** Seconds into `samples` (mono, at `rate`) that the music starts; 0 when it starts at once or can't be told. */
export function musicStart(samples: Float32Array, rate: number): number {
  const per = Math.max(1, Math.round(rate * WINDOW));
  const n = Math.floor(samples.length / per);
  if (n < HOLD / WINDOW + 2) return 0;
  const a = Math.exp((-2 * Math.PI * LOW_CUT) / rate);
  const lows = new Float32Array(n);
  let y = 0;
  for (let w = 0; w < n; w++) {
    let lo = 0;
    for (let i = w * per, end = i + per; i < end; i++) {
      y = a * y + (1 - a) * samples[i];
      lo += y * y;
    }
    lows[w] = Math.sqrt(lo / per);
  }
  const loud = (v: Float32Array) => {
    const sorted = Float32Array.from(v).sort();
    return sorted[Math.floor(sorted.length * 0.9)];
  };
  const lowRef = loud(lows);
  if (lowRef < 1e-4) return 0;
  const hold = Math.round(HOLD / WINDOW);
  let start = -1;
  for (let w = 0; w + hold <= n; w++) {
    let on = 0;
    for (let k = w; k < w + hold; k++) if (lows[k] > ON * lowRef) on++;
    if (on >= HOLD_SHARE * hold && lows[w] > ON * lowRef) {
      start = w;
      break;
    }
  }
  if (start <= 0) return 0;
  const mean = (from: number, to: number) => {
    let sum = 0;
    for (let k = from; k < to; k++) sum += lows[k];
    return sum / Math.max(1, to - from);
  };
  if (mean(start, start + hold) < CONTRAST * mean(0, start)) return 0;
  // Keep a count-in: hits as loud as the band, in the few seconds just before.
  for (let k = start - 1, stop = Math.max(0, start - Math.round(COUNT_IN / WINDOW)); k >= stop; k--) if (lows[k] > COUNT_IN_LEVEL * lowRef) start = k;
  const t = start * WINDOW - LEAD;
  return t < SKIP_MIN ? 0 : Math.round(t * 10) / 10;
}

/** Whether a track of a show is all talk, by its name: band chat, tuning, the crowd, the break before the encore. */
export function talkTrack(title: string): boolean {
  return /\b(banter|tuning|tune ?up|crowd|talk|chat|soundcheck|encore break|silence|intro tape|walk ?on|applause|stage announcement)\b/i.test(title);
}

/** Loudness windows (s), and the gate under the running level (dB) that leaves out the quiet bits (a pause, the talk, the gap between songs). */
const LOUD_WINDOW = 0.4;
const LOUD_GATE = 10;

/**
 * The loudness (dB of full scale, the mean power of 0.4 s windows) a live recording is brought
 * to: 3 dB over the game's own remixes (measured at -16 to -12 with a
 * median of -14.4), since a tape at the remixes' level still sounds smaller
 * than a mastered track. Taped shows come in from about -13 to -25, mostly
 * near -19.
 */
export const TARGET_LOUDNESS = -11.5;
/** The most a recording is turned up or down (dB): a near-silent one isn't blown up into hiss. */
const GAIN_MIN = -6;
const GAIN_MAX = 17;

/** The gain (dB) that brings a recording of `measured` loudness to TARGET_LOUDNESS, to the half dB. */
export function gainFor(measured: number): number {
  if (!Number.isFinite(measured)) return 0;
  return Math.round(Math.min(GAIN_MAX, Math.max(GAIN_MIN, TARGET_LOUDNESS - measured)) * 2) / 2;
}

/** Under this (dB of full scale), a window is silence (a pause, or a stream the page can't hear): it doesn't count. */
const LEVEL_FLOOR = -60;
/** How long the leveller listens (s) before it trusts what it heard over its starting gain. */
const LEVEL_WARMUP = 3;
/** How far back it listens: the time constant (s) of its running level, so a loud bar or a quiet verse doesn't pump the gain. */
const LEVEL_MEMORY = 20;

/**
 * Levels a live recording as it plays, in the page: nothing is measured
 * ahead of time. It starts at a typical tape's gain (`prior`), and once it
 * has heard a few seconds of music, the gain follows the recording's own
 * running level: the level of each 0.4 s window in dB, averaged (over all
 * it has heard at first, then over about the last 20 s), leaving out
 * silence and any window 10 dB under the running level (a pause, the talk,
 * the gap between songs), so every show comes out at TARGET_LOUDNESS
 * whatever its tape and wherever its start is. Feed it each block's mean
 * square (mono, before any gain) and the seconds that block stands for; it
 * answers the gain (dB) to apply now.
 */
export class Leveller {
  private level = NaN;
  private heard = 0;
  private power = 0;
  private span = 0;
  private gain: number;

  constructor(prior: number) {
    this.gain = prior;
  }

  feed(meanSquare: number, seconds: number): number {
    if (!(seconds > 0) || !(meanSquare >= 0)) return this.gain;
    this.power += meanSquare * seconds;
    this.span += seconds;
    if (this.span < LOUD_WINDOW - 1e-9) return this.gain;
    const p = this.power / this.span;
    const span = this.span;
    this.power = 0;
    this.span = 0;
    if (!(p > 10 ** (LEVEL_FLOOR / 10))) return this.gain;
    const db = 10 * Math.log10(p);
    if (Number.isNaN(this.level)) this.level = db;
    else {
      if (this.heard >= LEVEL_WARMUP && db < this.level - LOUD_GATE) return this.gain;
      // The mean of all it has heard at first, then a running mean over LEVEL_MEMORY.
      const k = Math.max(span / (this.heard + span), 1 - Math.exp(-span / LEVEL_MEMORY));
      this.level += (db - this.level) * k;
    }
    this.heard += span;
    if (this.heard >= LEVEL_WARMUP) this.gain = gainFor(this.level);
    return this.gain;
  }
}

/** A live recording's opening, read: where its music starts (s). */
export function readOpening(samples: Float32Array, rate: number): { start: number } {
  return { start: musicStart(samples, rate) };
}
