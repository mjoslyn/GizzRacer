import { describe, expect, it } from 'vitest';
import { TRACK_SONGS } from '../src/audio/songs';
import { CUPS, TRACK_LIST } from '../src/tracks/index';

const IDS = ['alien-metal', 'kill-for-the-steel', 'level-5', 'rapid-alpha-decay'];

describe('the Alien Metal Cup', () => {
  it("is four of Alien Metal's songs in album order, the last cup, after the Phantom Island Cup", () => {
    const at = CUPS.findIndex((c) => c.id === 'alien-metal');
    expect(at).toBe(CUPS.length - 1);
    expect(CUPS[at - 1].id).toBe('phantom-island');
    expect(CUPS[at].tracks.map((i) => TRACK_LIST[i].id)).toEqual(IDS);
    for (const id of IDS) expect(TRACK_SONGS[id].album).toBe('Alien Metal');
  });
});
