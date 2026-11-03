import { describe, expect, it } from 'vitest';
import { Leveller, TARGET_LOUDNESS, gainFor, musicStart, readOpening, talkTrack } from '../src/audio/talk';

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

  it('tells a talk track by its name', () => {
    for (const t of ['Banter', 'Stage Banter', 'Tuning', 'Crowd', 'Encore Break', 'Soundcheck']) expect(talkTrack(t), t).toBe(true);
    for (const t of ['Rattlesnake', 'Gamma Knife', 'The Dripping Tap', 'Crumbling Castle', 'Organ Farmer']) expect(talkTrack(t), t).toBe(false);
  });

  it('evens a quiet tape up to the remixes, within limits, and reads an opening for where its music starts', () => {
    expect(gainFor(TARGET_LOUDNESS - 5)).toBe(5);
    expect(gainFor(TARGET_LOUDNESS + 2)).toBe(-2);
    expect(gainFor(-80)).toBe(17);
    expect(gainFor(-Infinity)).toBe(0);
    expect(readOpening(join(talk(20, 0.05), band(30, 0.1)), RATE).start).toBeGreaterThan(15);
  });
});

describe('levelling a live recording as it plays', () => {
  /** Feeds `seconds` of blocks at `db` (dB of full scale, as mean square) in 0.2 s ticks; the last gain answered. */
  const feed = (l: Leveller, db: number, seconds: number) => {
    let g = NaN;
    for (let t = 0; t < seconds; t += 0.2) g = l.feed(10 ** (db / 10), 0.2);
    return g;
  };

  it("holds the catalogue's gain until it has heard a few seconds of music", () => {
    const l = new Leveller(5);
    expect(feed(l, -30, 2.4)).toBe(5);
  });

  it('then brings the recording to the target, however quiet or loud the tape', () => {
    expect(feed(new Leveller(0), -24, 60)).toBeCloseTo(TARGET_LOUDNESS + 24, 0);
    expect(feed(new Leveller(12), -14, 60)).toBeCloseTo(TARGET_LOUDNESS + 14, 0);
  });

  it('follows a recording that gets louder, slowly enough not to pump on one loud bar', () => {
    const l = new Leveller(0);
    const quiet = feed(l, -26, 30);
    const oneBar = feed(l, -14, 2);
    expect(quiet - oneBar).toBeLessThanOrEqual(1.5);
    expect(feed(l, -14, 120)).toBeCloseTo(TARGET_LOUDNESS + 14, 0);
  });

  it('leaves out silence (a pause, or a stream it cannot hear) and the quiet between songs', () => {
    const l = new Leveller(3);
    expect(feed(l, -120, 20)).toBe(3);
    const g = feed(l, -20, 30);
    expect(feed(l, -40, 10)).toBe(g);
  });

  it('never turns a recording up or down past the limits', () => {
    expect(feed(new Leveller(0), -55, 30)).toBe(gainFor(-55));
    expect(feed(new Leveller(0), -2, 30)).toBe(gainFor(-2));
  });
});
