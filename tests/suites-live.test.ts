import { describe, expect, it } from 'vitest';
import { liveUrl, type LiveRecording } from '../src/audio/music';

import suites from '../public/music/suites.json';

/**
 * Story mode's suites and their stages' songs, in order, exactly as the
 * story code names them. A song with no live recording has no entry: its
 * stage plays on the recording before it.
 */
const SUITES: Record<string, string[]> = {
  'mind-fuzz': ["I'm in Your Mind", "I'm Not in Your Mind", 'Cellophane', "I'm in Your Mind Fuzz"],
  'nonagon-infinity': ['Robot Stop', 'Big Fig Wasp', 'Gamma Knife', 'People-Vultures'],
  'altered-beast': ['A New World', 'Altered Beast I', 'Altered Beast II', 'Altered Beast III', 'Altered Beast IV', 'Life / Death'],
  'lord-of-lightning': ['Some Context', 'The Reticent Raconteur', 'The Lord of Lightning', 'The Balrog', 'The Floating Fire', 'The Acrid Corpse'],
  'han-tyumi': ['Welcome to an Altered Future', 'Digital Black', 'Han-Tyumi, the Confused Cyborg', 'Soy-Protein Munt Machine', 'Vomit Coffin', 'Murder of the Universe'],
  polygondwanaland: ['Crumbling Castle', 'Polygondwanaland', 'The Castle in the Air'],
  'infest-the-rats-nest': ['Planet B', 'Mars for the Rich', 'Organ Farmer', 'Self-Immolate', 'Hell'],
  'petrodragonic-apocalypse': ['Motor Spirit', 'Supercell', 'Converge', 'Witchcraft'],
};
/** Never played live, or played only at shows the Archive has none of (Polygondwanaland, Feb-Mar 2018). */
const NO_RECORDING = new Set(['Life / Death', 'The Floating Fire', 'The Acrid Corpse', 'Polygondwanaland']);

type Entry = LiveRecording & { end?: number | null };
const catalogue = suites as unknown as Record<string, Record<string, Entry>>;

describe('suites live recordings', () => {
  it('are the story suites, in order', () => {
    expect(Object.keys(catalogue)).toEqual(Object.keys(SUITES));
  });

  it("are keyed by the suite's song titles, in stage order, one recording a song", () => {
    for (const [suite, songs] of Object.entries(catalogue)) {
      const want = SUITES[suite].filter((t) => !NO_RECORDING.has(t));
      expect(Object.keys(songs), suite).toEqual(want);
    }
  });

  it('are well formed: an Archive file, the show, where the music starts and ends', () => {
    for (const [suite, songs] of Object.entries(catalogue)) {
      for (const [title, r] of Object.entries(songs)) {
        const at = `${suite}: ${title}`;
        expect(typeof r.id, at).toBe('string');
        expect(r.id.length, at).toBeGreaterThan(0);
        expect(r.file, at).toMatch(/\.mp3$/i);
        expect(r.date, at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof r.venue, at).toBe('string');
        expect(r.seconds, at).toBeGreaterThan(0);
        expect(liveUrl(r), at).toMatch(/^https:\/\/archive\.org\/download\/[^/]+\/.+\.mp3$/i);
        expect(typeof r.start, at).toBe('number');
        expect(r.start, at).toBeGreaterThanOrEqual(0);
        // A segue runs to the file's end: end null or absent.
        if (r.end !== null && r.end !== undefined) {
          expect(typeof r.end, at).toBe('number');
          expect(r.start!, at).toBeLessThan(r.end);
          expect(r.end, at).toBeLessThanOrEqual(r.seconds + 1);
        } else {
          expect(r.start!, at).toBeLessThan(r.seconds);
        }
        if (r.then) {
          // An Altered Beast and its Alter Me, the next file of the same show.
          expect(r.then.file, at).toMatch(/\.mp3$/i);
          expect(r.then.file, at).not.toBe(r.file);
          expect(r.then.seconds, at).toBeGreaterThan(0);
          if (r.then.end !== undefined) expect(r.then.end, at).toBeLessThanOrEqual(r.then.seconds + 1);
        }
      }
    }
  });

  it('pair each Altered Beast stage before IV with its Alter Me', () => {
    for (const n of ['I', 'II', 'III']) expect(catalogue['altered-beast'][`Altered Beast ${n}`]?.then, n).toBeDefined();
    expect(catalogue['altered-beast']['Altered Beast IV'].then).toBeUndefined();
  });
});
