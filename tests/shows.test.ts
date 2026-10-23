import { describe, expect, it } from 'vitest';
import { chosenShow, randomShow, showIndex, showLabel, stepShow, stepYear } from '../src/audio/shows';
import type { Show } from '../src/audio/radio';

const S = (id: string, date: string): Show => ({ id, date, venue: `v-${id}` });
const ALL = [S('a', '2014-01-01'), S('b', '2014-05-01'), S('c', '2016-02-02'), S('d', '2019-03-03'), S('e', '2019-09-09')];

describe('live set picking', () => {
  it('null, or a show not on the list, is the newest', () => {
    expect(showIndex(ALL, null)).toBe(4);
    expect(showIndex(ALL, 'zz')).toBe(4);
    expect(chosenShow(ALL, 'b')?.id).toBe('b');
    expect(chosenShow([], null)).toBe(null);
  });

  it('steps through shows and years, round the ends', () => {
    expect(stepShow(ALL, 'a', -1)).toBe('e');
    expect(stepShow(ALL, 'e', 1)).toBe('a');
    expect(stepShow(ALL, 'b', 1)).toBe('c');
    // By year: to the first show of the next year there are shows from.
    expect(stepYear(ALL, 'b', 1)).toBe('c');
    expect(stepYear(ALL, 'c', 1)).toBe('d');
    expect(stepYear(ALL, 'e', 1)).toBe('a');
    expect(stepYear(ALL, 'a', -1)).toBe('d');
  });

  it('a random show is never the one playing', () => {
    for (const r of [0, 0.3, 0.99]) expect(randomShow(ALL, 'c', () => r)).not.toBe('c');
    expect(showLabel(ALL[0])).toBe('v-a, 2014-01-01');
  });
});
