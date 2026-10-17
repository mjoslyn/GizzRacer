import { describe, expect, it } from 'vitest';
import { nameProblem } from '../src/net/nameFilter';

/** The test spells blocked words in ROT13 too, like the filter. */
const r = (s: string) => s.replace(/[a-z]/gi, (c) => {
  const base = c <= 'Z' ? 65 : 97;
  return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
});

describe('name filter', () => {
  it('accepts ordinary names, including ones with rude words hiding inside', () => {
    for (const n of ['Lizard Ace', 'Monk Bot', 'Classic Carl', 'Analog Andy', 'Grape Ape', 'Scunthorpe', 'Assassin 99', 'Peacock', 'Titan', 'Dickens', 'Glass Cannon', 'Torpedo Ted', 'Thorny Rose', 'Swanky', 'Prickly Pear', 'Hancock', 'Mass Effect', 'Kart_88', 'Zoe', 'Ēmile']) {
      expect(nameProblem(n), n).toBeNull();
    }
  });

  it('rejects the wrong shape', () => {
    expect(nameProblem('ab')).toBe('shape');
    expect(nameProblem('a'.repeat(17))).toBe('shape');
    expect(nameProblem('bad.name')).toBe('shape');
  });

  it('blocks slurs and profanity, however they are dressed up', () => {
    const blocked = [
      r('shpx'), // plain
      r('SHPX lbh'), // caps and a second word
      r('shhhhpx'), // stretched
      r('s h p x'), // spaced out
      '5' + r('u') + '1' + r('g'), // leetspeak
      'Big' + r('Nff') + 'Racer', // camelCase whole word
      r('ovt nff'), // whole word
      'Xx' + r('anmv') + 'xX', // anywhere in the name
      r('Shpx') + 'Face',
      'Rider 1488',
    ];
    for (const n of blocked) expect(nameProblem(n), n).toBe('blocked');
  });
});
