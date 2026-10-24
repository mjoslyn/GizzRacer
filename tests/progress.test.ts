import { beforeEach, describe, expect, it } from 'vitest';
import { betterCup, cupKey, cupTrophies, foundShortcut, progress, raceKey, recordCup, recordRace, recordStyle, resetProgress, trophyFor, unlockParam, unlocks, type CupResult } from '../src/core/progress';
import { CUPS } from '../src/tracks/index';

const cup = (place: number, points = 60, timeMs = 300000, sweep = false) => ({ place, points, timeMs, sweep });

describe('progress', () => {
  beforeEach(() => resetProgress());

  it('starts empty, with nothing unlocked', () => {
    expect(progress()).toEqual({ cups: {}, races: {}, style: {}, shortcuts: [] });
    expect(unlocks(progress())).toEqual({ randomCup: false, class200: false, mirror: false });
  });

  it('gives gold, silver and bronze for the top three', () => {
    expect(trophyFor(1)).toBe('gold');
    expect(trophyFor(2)).toBe('silver');
    expect(trophyFor(3)).toBe('bronze');
    expect(trophyFor(4)).toBeNull();
  });

  it('keeps the better cup result: trophy, then a sweep, then points, then time', () => {
    const r = (t: CupResult['trophy'], sweep = false, points = 50, timeMs = 1000): CupResult => ({ trophy: t, place: 1, points, timeMs, sweep, at: 0 });
    expect(betterCup(r('gold'), undefined)).toBe(true);
    expect(betterCup(r('silver'), r('gold'))).toBe(false);
    expect(betterCup(r('gold'), r('silver'))).toBe(true);
    expect(betterCup(r('gold', true), r('gold'))).toBe(true);
    expect(betterCup(r('gold', false, 60), r('gold', false, 50))).toBe(true);
    expect(betterCup(r('gold', false, 50, 900), r('gold', false, 50, 1000))).toBe(true);
    expect(betterCup(r('gold', false, 50, 1100), r('gold', false, 50, 1000))).toBe(false);
  });

  it('records a cup, and only improves on it', () => {
    const first = recordCup('nonagon', '100cc', false, cup(2, 50));
    expect(first).toMatchObject({ trophy: 'silver', improved: true, unlocked: ['randomCup'] });
    expect(recordCup('nonagon', '100cc', false, cup(3, 40))).toMatchObject({ trophy: 'bronze', improved: false, unlocked: [] });
    expect(recordCup('nonagon', '100cc', false, cup(1, 60))).toMatchObject({ trophy: 'gold', improved: true });
    expect(progress().cups[cupKey('nonagon', '100cc')].trophy).toBe('gold');
    // Mirror is its own record.
    expect(progress().cups[cupKey('nonagon', '100cc', true)]).toBeUndefined();
    expect(cupTrophies(progress(), 'nonagon').map((t) => t.engine)).toEqual(['100cc']);
  });

  it('unlocks 200cc with a gold at 150cc and Mirror with gold in every album cup', () => {
    recordCup('nonagon', '150cc', false, cup(1));
    expect(unlocks(progress())).toMatchObject({ class200: true, mirror: false });
    for (const c of CUPS.slice(1)) recordCup(c.id, '50cc', false, cup(1));
    expect(unlocks(progress()).mirror).toBe(true);
  });

  it('the Random Cup and a mirrored cup count for nothing but the Random Cup unlock', () => {
    recordCup('random', '150cc', false, cup(1));
    expect(unlocks(progress())).toEqual({ randomCup: true, class200: false, mirror: false });
    for (const c of CUPS) recordCup(c.id, '150cc', true, cup(1));
    expect(unlocks(progress()).mirror).toBe(false);
  });

  it('keeps the fastest race time per track, class and mirror', () => {
    expect(recordRace('rattlesnake-run', '100cc', false, 100000)).toEqual({ best: true, prevMs: null });
    expect(recordRace('rattlesnake-run', '100cc', false, 110000)).toEqual({ best: false, prevMs: 100000 });
    expect(recordRace('rattlesnake-run', '100cc', false, 90000)).toEqual({ best: true, prevMs: 100000 });
    expect(recordRace('rattlesnake-run', '100cc', true, 120000)).toEqual({ best: true, prevMs: null });
    expect(progress().races[raceKey('rattlesnake-run', '100cc')].ms).toBe(90000);
  });

  it('keeps the best style score, and a zero never counts', () => {
    expect(recordStyle('rattlesnake-run', '100cc', 0)).toEqual({ best: false, prev: null });
    expect(recordStyle('rattlesnake-run', '100cc', 500)).toEqual({ best: true, prev: null });
    expect(recordStyle('rattlesnake-run', '100cc', 400)).toEqual({ best: false, prev: 500 });
  });

  it('a shortcut is new once', () => {
    expect(foundShortcut('rattlesnake-run', "Snake's Mouth")).toBe(true);
    expect(foundShortcut('rattlesnake-run', "Snake's Mouth")).toBe(false);
    expect(foundShortcut('volcano-fortress', "Snake's Mouth")).toBe(true);
  });
});

describe('the unlock link', () => {
  it('?unlock unlocks everything, ?unlock=off locks it back, and no parameter leaves it be', () => {
    expect(unlockParam('?unlock')).toBe(true);
    expect(unlockParam('?unlock=on')).toBe(true);
    expect(unlockParam('?room=ABCD&unlock=1')).toBe(true);
    expect(unlockParam('?unlock=off')).toBe(false);
    expect(unlockParam('?unlock=0')).toBe(false);
    expect(unlockParam('')).toBe(null);
    expect(unlockParam('?room=ABCD')).toBe(null);
  });
});
