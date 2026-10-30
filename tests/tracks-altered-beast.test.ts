import { describe, expect, it } from 'vitest';
import { TRACK_SONGS } from '../src/audio/songs';
import { CUPS, TRACK_LIST } from '../src/tracks/index';

const IDS = ['altered-beast-i', 'altered-beast-ii', 'altered-beast-iii', 'altered-beast-iv'];

describe('the Altered Beast Cup', () => {
  it("is Murder of the Universe's opening suite, each Altered Beast with the Alter Me after it, between the Flying Microtonal Banana and Polygondwanaland Cups", () => {
    const at = CUPS.findIndex((c) => c.id === 'altered-beast');
    expect(CUPS[at - 1].id).toBe('flying-microtonal-banana');
    expect(CUPS[at + 1].id).toBe('polygondwanaland');
    expect(CUPS[at].tracks.map((i) => TRACK_LIST[i].id)).toEqual(IDS);
    expect(IDS.map((id) => [TRACK_SONGS[id].title, TRACK_SONGS[id].also])).toEqual([
      ['Altered Beast I', 'Alter Me I'],
      ['Altered Beast II', 'Alter Me II'],
      ['Altered Beast III', 'Alter Me III'],
      ['Altered Beast IV', undefined],
    ]);
  });
});
