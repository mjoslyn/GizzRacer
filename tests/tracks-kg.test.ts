import { describe, expect, it } from 'vitest';
import { TRACK_SONGS } from '../src/audio/songs';
import { CUPS, TRACK_LIST } from '../src/tracks/index';

const IDS = ['automation', 'minimum-brain-size', 'oddlife', 'intrasport'];

describe('the K.G. Cup', () => {
  it("is four songs from K.G. in album order, between the Infest the Rats' Nest and Omnium Gatherum Cups", () => {
    const at = CUPS.findIndex((c) => c.id === 'kg');
    expect(CUPS[at].name).toBe('K.G. Cup');
    expect(CUPS[at - 1].id).toBe('infest-the-rats-nest');
    expect(CUPS[at + 1].id).toBe('omnium-gatherum');
    expect(CUPS[at].tracks.map((i) => TRACK_LIST[i].id)).toEqual(IDS);
    expect(IDS.map((id) => [TRACK_SONGS[id].title, TRACK_SONGS[id].album, TRACK_SONGS[id].year])).toEqual([
      ['Automation', 'K.G.', 2020],
      ['Minimum Brain Size', 'K.G.', 2020],
      ['Oddlife', 'K.G.', 2020],
      ['Intrasport', 'K.G.', 2020],
    ]);
    for (const i of CUPS[at].tracks) {
      const d = TRACK_LIST[i].build();
      expect(d.music).toEqual({ lap: d.id, finalLap: `${d.id}-final-lap` });
    }
  });
});
