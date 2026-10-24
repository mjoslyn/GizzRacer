import { describe, expect, it } from 'vitest';
import { chosenShow, randomShow, showIndex, showLabel, showSelect, stepShow } from '../src/audio/shows';
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

  it('steps through shows, round the ends', () => {
    expect(stepShow(ALL, 'a', -1)).toBe('e');
    expect(stepShow(ALL, 'e', 1)).toBe('a');
    expect(stepShow(ALL, 'b', 1)).toBe('c');
  });

  it('a dropdown by year, newest first, the chosen one selected', () => {
    const html = showSelect(ALL, 'c', 'x');
    expect([...html.matchAll(/optgroup label="(\d+)"/g)].map((m) => m[1])).toEqual(['2019', '2016', '2014']);
    expect(html).toContain('<option value="c" selected>v-c, 2016-02-02</option>');
    expect(html.match(/selected/g)).toHaveLength(1);
  });

  it('a random show is never the one playing', () => {
    for (const r of [0, 0.3, 0.99]) expect(randomShow(ALL, 'c', () => r)).not.toBe('c');
    expect(showLabel(ALL[0])).toBe('v-a, 2014-01-01');
  });
});
