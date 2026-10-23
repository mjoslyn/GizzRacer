import { describe, expect, it } from 'vitest';
import { TARGET_LOUDNESS, gainFor, loudness, musicStart, readOpening } from '../src/audio/talk';

const RATE = 8000;

/** `seconds` of a voice: a 220 Hz buzz, a few syllables a second with pauses between. Little low end. */
function talk(seconds: number, level = 0.3): Float32Array {
  const out = new Float32Array(seconds * RATE);
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const syllable = Math.max(0, Math.sin(2 * Math.PI * 3.5 * t)) * (Math.sin(2 * Math.PI * 0.4 * t) > -0.3 ? 1 : 0);
    out[i] = level * syllable * Math.sin(2 * Math.PI * 220 * t);
  }
  return out;
}

/** `seconds` of a band: a 55 Hz bass held under kicks on the beat and a 440 Hz guitar. */
function band(seconds: number, level = 0.5): Float32Array {
  const out = new Float32Array(seconds * RATE);
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const beat = t % 0.5;
    const kick = Math.exp(-beat * 20) * Math.sin(2 * Math.PI * 60 * beat);
    out[i] = level * (0.6 * Math.sin(2 * Math.PI * 55 * t) + 0.5 * kick + 0.3 * Math.sin(2 * Math.PI * 440 * t));
  }
  return out;
}

const join = (...parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

describe('skipping the band talk', () => {
  it('starts just before the band, past the talk', () => {
    const start = musicStart(join(talk(20), band(40)), RATE);
    expect(start).toBeGreaterThan(17);
    expect(start).toBeLessThanOrEqual(20);
  });

  it('plays from the top when the band starts at once, or builds from a quiet intro', () => {
    expect(musicStart(band(60), RATE)).toBe(0);
    // A quiet intro of the song itself: the low end rises, but not the jump talk-then-band makes.
    expect(musicStart(join(band(15, 0.3), band(45, 0.5)), RATE)).toBe(0);
  });

  it('plays from the top when it never finds the band (all talk), or the opening is too short to tell', () => {
    expect(musicStart(talk(60), RATE)).toBe(0);
    expect(musicStart(band(2), RATE)).toBe(0);
    expect(musicStart(new Float32Array(RATE * 30), RATE)).toBe(0);
  });

  it('keeps a count-in just before the downbeat', () => {
    const hits = band(1, 0.6);
    const start = musicStart(join(talk(20), hits, talk(1.5), band(40)), RATE);
    // The count-in's hits at 20 s, not the band at 22.5.
    expect(start).toBeLessThan(20);
    expect(start).toBeGreaterThan(17);
  });

  it('measures loudness past the gaps, and evens a quiet tape up to the remixes, within limits', () => {
    const loud = band(30, 0.5);
    const quiet = band(30, 0.1);
    // A fifth of the level is 14 dB down.
    expect(loudness(loud, RATE) - loudness(quiet, RATE)).toBeCloseTo(20 * Math.log10(5), 0);
    // Gaps don't pull it down.
    expect(loudness(join(loud, new Float32Array(RATE * 20)), RATE)).toBeCloseTo(loudness(loud, RATE), 0);
    expect(gainFor(TARGET_LOUDNESS - 5)).toBe(5);
    expect(gainFor(TARGET_LOUDNESS + 2)).toBe(-2);
    expect(gainFor(-80)).toBe(14);
    expect(gainFor(-Infinity)).toBe(0);
    // Read from where the music starts: the talk doesn't count.
    const opening = readOpening(join(talk(20, 0.05), quiet), RATE);
    expect(opening.start).toBeGreaterThan(15);
    expect(opening.gain).toBe(gainFor(loudness(quiet, RATE)));
  });
});
