import { describe, expect, it } from 'vitest';
import { TRACK_SONGS } from '../src/audio/songs';
import { CUPS, TRACK_LIST } from '../src/tracks/index';

const IDS = ['muddy-water', 'great-chain-of-being', 'all-is-known', 'the-wheel'];

describe('the Gumboot Soup Cup', () => {
  it("is four of Gumboot Soup's songs in album order, between the Polygondwanaland and Infest the Rats' Nest Cups", () => {
    const at = CUPS.findIndex((c) => c.id === 'gumboot-soup');
    expect(CUPS[at - 1].id).toBe('polygondwanaland');
    expect(CUPS[at + 1].id).toBe('infest-the-rats-nest');
    expect(CUPS[at].tracks.map((i) => TRACK_LIST[i].id)).toEqual(IDS);
    expect(IDS.map((id) => TRACK_SONGS[id].title)).toEqual(['Muddy Water', 'The Great Chain of Being', 'All Is Known', 'The Wheel']);
    for (const id of IDS) expect(TRACK_SONGS[id]).toMatchObject({ album: 'Gumboot Soup', year: 2017 });
  });
});
