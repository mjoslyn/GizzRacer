import { describe, expect, it } from 'vitest';
import { TRACK_SONGS } from '../src/audio/songs';
import { CUPS, TRACK_LIST } from '../src/tracks/index';

const IDS = ['head-on-pill', 'god-is-calling', 'mend-the-past', 'float-along'];

describe('the Float Along – Fill Your Lungs Cup', () => {
  it('is the album, in album order, between the 12 Bar Bruise and Mind Fuzz Cups', () => {
    const at = CUPS.findIndex((c) => c.id === 'float-along-fill-your-lungs');
    expect(CUPS[at - 1].id).toBe('twelve-bar-bruise');
    expect(CUPS[at + 1].id).toBe('mind-fuzz');
    expect(CUPS[at].tracks.map((i) => TRACK_LIST[i].id)).toEqual(IDS);
    for (const id of IDS) expect(TRACK_SONGS[id].album).toBe('Float Along – Fill Your Lungs');
  });
});
