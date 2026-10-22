import { describe, expect, it } from 'vitest';
import { CHAIN_MAX, CHAIN_WINDOW, STYLE_POINTS, StyleMeter, driftMove } from '../src/core/style';

describe('style meter', () => {
  it('scores moves, and chains the ones that come quickly', () => {
    const m = new StyleMeter();
    expect(m.add('drift1')).toMatchObject({ points: STYLE_POINTS.drift1, chain: 1 });
    m.tick(1);
    expect(m.add('trick')).toMatchObject({ points: STYLE_POINTS.trick * 2, chain: 2, text: 'TRICK' });
    m.tick(CHAIN_WINDOW + 0.1);
    expect(m.chain).toBe(0);
    expect(m.add('slipstream')).toMatchObject({ points: STYLE_POINTS.slipstream, chain: 1 });
    expect(m.score).toBe(STYLE_POINTS.drift1 + STYLE_POINTS.trick * 2 + STYLE_POINTS.slipstream);
    expect(m.bestChain).toBe(2);
  });

  it('tricks and slipstreams score quietly: no pop for the HUD', () => {
    const m = new StyleMeter();
    m.add('trick', 2);
    m.add('slipstream');
    expect(m.last).toBeNull();
    expect(m.score).toBe(STYLE_POINTS.trick + 50 + STYLE_POINTS.slipstream * 2);
    m.add('drift2');
    expect(m.last?.move).toBe('drift2');
  });

  it('caps the chain', () => {
    const m = new StyleMeter();
    for (let i = 0; i < 10; i++) m.add('drift2');
    expect(m.chain).toBe(CHAIN_MAX);
    expect(m.last?.points).toBe(STYLE_POINTS.drift2 * CHAIN_MAX);
  });

  it('a trick streak is worth more, and says so', () => {
    const m = new StyleMeter();
    const e = m.add('trick', 3);
    expect(e.text).toBe('TRICK x3');
    expect(e.points).toBe(STYLE_POINTS.trick + 100);
  });

  it('names the drift tiers', () => {
    expect(driftMove(1)).toBe('drift1');
    expect(driftMove(3)).toBe('drift3');
    expect(driftMove(4)).toBe('drift4');
  });

  it('sums up the race in one line', () => {
    const m = new StyleMeter();
    expect(m.summary()).toBe('Style 0');
    m.add('drift3');
    m.add('trick');
    m.add('hit');
    m.add('shortcut');
    const s = m.summary();
    expect(s).toContain('1 drift');
    expect(s).toContain('1 trick');
    expect(s).toContain('1 item play');
    expect(s).toContain('1 shortcut');
    expect(s).toContain('best chain x4');
  });
});
