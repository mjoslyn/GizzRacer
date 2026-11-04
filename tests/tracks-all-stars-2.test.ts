import { describe, expect, it } from 'vitest';
import { TRACK_SONGS } from '../src/audio/songs';
import { CUPS, TRACK_LIST } from '../src/tracks/index';

const IDS = ['hot-wax', 'sadie-sorceress', 'empty', 'billabong-valley'];

describe('the All Stars Cup #2', () => {
  it('is four more favourites, the last cup, after the All Stars Cup #1', () => {
    const at = CUPS.findIndex((c) => c.id === 'all-stars-2');
    expect(at).toBe(CUPS.length - 1);
    expect(CUPS[at].name).toBe('All Stars Cup #2');
    expect(CUPS[at - 1].id).toBe('all-stars-1');
    expect(CUPS[at].tracks.map((i) => TRACK_LIST[i].id)).toEqual(IDS);
    expect(IDS.map((id) => [TRACK_SONGS[id].title, TRACK_SONGS[id].album, TRACK_SONGS[id].year])).toEqual([
      ['Hot Wax', 'Oddments', 2014],
      ['Sadie Sorceress', 'Omnium Gatherum', 2022],
      ['Empty', "I'm in Your Mind Fuzz", 2014],
      ['Billabong Valley', 'Flying Microtonal Banana', 2017],
    ]);
  });
});
