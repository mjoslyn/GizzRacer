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

/** Loudness windows (s), and the gate under the mean (dB) that leaves out the quiet bits (a pause, the talk). */
const LOUD_WINDOW = 0.4;
const LOUD_GATE = 10;

/**
 * How loud `samples` (mono, at `rate`) are from `from` seconds on, in dB of
 * full scale: the mean power of its 0.4 s windows, leaving out any more than
 * 10 dB under the mean, so the gaps and the talk don't pull it down (a
 * gated loudness, in the manner of broadcast loudness meters). -Infinity
 * for silence.
 */
export function loudness(samples: Float32Array, rate: number, from = 0): number {
  const per = Math.max(1, Math.round(rate * LOUD_WINDOW));
  const powers: number[] = [];
  for (let s = Math.floor(from * rate); s + per <= samples.length; s += per) {
    let e = 0;
    for (let i = s; i < s + per; i++) e += samples[i] * samples[i];
    powers.push(e / per);
  }
  if (!powers.length) return -Infinity;
  const mean = powers.reduce((a, b) => a + b, 0) / powers.length;
  if (mean <= 0) return -Infinity;
  const gate = mean * 10 ** (-LOUD_GATE / 10);
  const kept = powers.filter((p) => p >= gate);
  return 10 * Math.log10(kept.reduce((a, b) => a + b, 0) / kept.length);
}

/**
 * The loudness (dB, as `loudness` measures it) a live recording is brought
 * to: the game's own remixes, measured at -16 to -12 with a median of
 * -14.4. Taped shows come in from about -13 to -25, mostly near -19.
 */
export const TARGET_LOUDNESS = -14.5;
/** The most a recording is turned up or down (dB): a near-silent one isn't blown up into hiss. */
const GAIN_MIN = -6;
const GAIN_MAX = 14;

/** The gain (dB) that brings a recording of `measured` loudness to TARGET_LOUDNESS, to the half dB. */
export function gainFor(measured: number): number {
  if (!Number.isFinite(measured)) return 0;
  return Math.round(Math.min(GAIN_MAX, Math.max(GAIN_MIN, TARGET_LOUDNESS - measured)) * 2) / 2;
}

/** A live recording's opening, read: where its music starts (s) and the gain (dB) that evens it with the rest of the music. */
export function readOpening(samples: Float32Array, rate: number): { start: number; gain: number } {
  const start = musicStart(samples, rate);
  return { start, gain: gainFor(loudness(samples, rate, start)) };
}
