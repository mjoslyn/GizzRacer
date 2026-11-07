import { dailyParams } from '../src/core/daily';
import { GEN_LENGTHS, GEN_THEMES, type GenParams } from '../src/tracks/generator';
import type { TrackDef } from '../src/tracks/track';

/**
 * Old generated tracks (params with no `layout`): players' saved tracks,
 * past dailies and their boards. A fixed spread of them, whose builds must
 * stay byte for byte what they were before the skeleton shapes came in
 * (CLASSIC_HASHES, taken from the rectangle generator before the shapes).
 */
export const CLASSIC: GenParams[] = [
  // Every theme, each twist and length in turn.
  ...GEN_THEMES.flatMap((theme, t) => [0, 1, 2].map((k): GenParams => ({ seed: 31 + t * 977 + k * 104_729, theme, complexity: 1 + ((t + 2 * k) % 5), length: GEN_LENGTHS[(t + k) % 3] }))),
  // And every theme at every twist and length once more.
  ...GEN_THEMES.flatMap((theme, t) => [1, 2, 3, 4, 5].flatMap((complexity) => GEN_LENGTHS.map((length, l): GenParams => ({ seed: 7_000 + t * 131 + complexity * 17 + l * 3, theme, complexity, length })))),
  // Story's dials: twists 4 and 5, medium, big seeds; a suite's given name and places.
  ...[4, 5].flatMap((complexity) => [123_456_789, 987_654_321, 500_000_003, 42].map((seed): GenParams => ({ seed, theme: GEN_THEMES[seed % GEN_THEMES.length], complexity, length: 'medium' }))),
  { seed: 271_828_182, theme: 'cell', complexity: 5, length: 'medium', name: 'Inner Cell', places: ['Golgi', 'Nucleus'] },
  // The dailies from the generator's first weeks.
  ...Array.from({ length: 24 }, (_, d) => dailyParams(new Date(Date.UTC(2026, 9, 15 + d, 12)))),
];

/** A 53-bit hash (cyrb53) of a track's JSON, as hex. */
export function trackHash(def: TrackDef): string {
  const str = JSON.stringify(def);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export { CLASSIC_HASHES } from './fixtures/generator-classic';
