import { describe, expect, it } from 'vitest';
import { TRACK_SONGS } from '../src/audio/songs';
import { CUPS, TRACK_LIST } from '../src/tracks/index';

const IDS = ['straws-in-the-wind', 'cyboogie', 'the-grim-reaper', 'gaia'];

describe('the All Stars Cup #1', () => {
  it('is four favourites from four albums, the last cup, after the Alien Metal Cup', () => {
    const at = CUPS.findIndex((c) => c.id === 'all-stars-1');
    expect(at).toBe(CUPS.length - 1);
    expect(CUPS[at].name).toBe('All Stars Cup #1');
    expect(CUPS[at - 1].id).toBe('alien-metal');
    expect(CUPS[at].tracks.map((i) => TRACK_LIST[i].id)).toEqual(IDS);
    expect(IDS.map((id) => [TRACK_SONGS[id].title, TRACK_SONGS[id].album, TRACK_SONGS[id].year])).toEqual([
      ['Straws in the Wind', 'K.G.', 2020],
      ['Cyboogie', 'Fishing for Fishies', 2019],
      ['The Grim Reaper', 'Omnium Gatherum', 2022],
      ['Gaia', 'Omnium Gatherum', 2022],
    ]);
  });
});
