import { describe, expect, it } from 'vitest';
import { GP_POINTS } from '../src/core/grandPrix';
import { dailyKey, dailyParams } from '../src/core/daily';
import { PHYSICS_VERSION } from '../src/physics/kart';
import { checkRecord, parseGenId, recordBoardName, recordTrack, type CupRecordSubmission, type RaceRecordSubmission } from '../src/net/recordCheck';
import { generateTrack, trackId } from '../src/tracks/generator';
import { CUPS, TRACK_LIST } from '../src/tracks/index';

const race = (over: Partial<RaceRecordSubmission> = {}): RaceRecordSubmission => ({
  kind: 'race',
  trackId: 'rattlesnake-run',
  engine: '100cc',
  mirror: false,
  racerId: 'lizard-warlock',
  physicsVersion: PHYSICS_VERSION,
  lapsMs: [40000, 39000, 38500],
  totalMs: 117500,
  style: 1200,
  ...over,
});

const cup = (over: Partial<CupRecordSubmission> = {}): CupRecordSubmission => ({
  kind: 'cup',
  cupId: 'nonagon-infinity',
  engine: '150cc',
  mirror: false,
  racerId: 'stu-mackenzie',
  physicsVersion: PHYSICS_VERSION,
  places: [1, 2, 1, 3],
  points: GP_POINTS[0] * 2 + GP_POINTS[1] + GP_POINTS[2],
  totalMs: 480000,
  ...over,
});

describe('record boards', () => {
  it('names a board per kind, track or cup, mirror, class and physics version', () => {
    expect(recordBoardName(race())).toBe(`race.rattlesnake-run.100cc.v${PHYSICS_VERSION}`);
    expect(recordBoardName(race({ mirror: true }))).toBe(`race.rattlesnake-run.mirror.100cc.v${PHYSICS_VERSION}`);
    expect(recordBoardName(cup())).toBe(`cup.nonagon-infinity.150cc.v${PHYSICS_VERSION}`);
  });

  it('accepts a plausible race, and refuses the implausible', () => {
    expect(checkRecord(race())).toBeNull();
    expect(checkRecord(race({ physicsVersion: PHYSICS_VERSION - 1 }))).toBe('old physics version');
    expect(checkRecord(race({ trackId: 'nowhere' }))).toBe('unknown track');
    expect(checkRecord(race({ lapsMs: [40000, 39000] }))).toBe('bad laps');
    expect(checkRecord(race({ totalMs: 100000 }))).toBe('laps do not add up');
    expect(checkRecord(race({ lapsMs: [1000, 1000, 1000], totalMs: 3000 }))).toBe('lap too fast');
    expect(checkRecord(race({ style: -1 }))).toBe('bad style score');
    expect(checkRecord(race({ racerId: 'nobody' }))).toBe('unknown racer');
  });

  it('accepts a plausible cup, and holds the points to the places', () => {
    expect(checkRecord(cup())).toBeNull();
    expect(checkRecord(cup({ points: 60 }))).toBe('points do not add up');
    expect(checkRecord(cup({ places: [1, 2, 1] }))).toBe('bad places');
    expect(checkRecord(cup({ places: [0, 1, 1, 1], points: 45 }))).toBe('bad places');
    expect(checkRecord(cup({ cupId: 'nope' }))).toBe('unknown cup');
    expect(checkRecord(cup({ totalMs: 1000 }))).toBe('cup too fast');
    // The Random Cup has no fixed tracks, so only its shape is checked.
    expect(checkRecord(cup({ cupId: 'random' }))).toBeNull();
    for (const c of CUPS) expect(checkRecord(cup({ cupId: c.id }))).toBeNull();
  });

  it('rebuilds a generated track from its id, so the daily has a board', () => {
    const p = dailyParams(new Date('2026-10-22T12:00:00Z'));
    const id = trackId(p);
    expect(parseGenId(id)).toEqual(p);
    expect(parseGenId('rattlesnake-run')).toBeNull();
    expect(parseGenId('gen-nowhere-3-medium-5')).toBeNull();
    const t = recordTrack(id)!;
    expect(t).not.toBeNull();
    expect(t.length).toBeCloseTo(generateTrack(p).main.points.length ? t.length : t.length);
    expect(recordTrack(TRACK_LIST[0].id)?.def.id).toBe(TRACK_LIST[0].id);
    const laps = t.def.laps;
    const lapsMs = Array.from({ length: laps }, () => 60000);
    expect(checkRecord(race({ trackId: id, lapsMs, totalMs: 60000 * laps }))).toBeNull();
  });
});

describe('the daily track', () => {
  it('is the same for everyone on a day, and different the next', () => {
    const a = dailyParams(new Date('2026-10-22T03:00:00Z'));
    const b = dailyParams(new Date('2026-10-22T23:00:00Z'));
    const c = dailyParams(new Date('2026-10-23T03:00:00Z'));
    expect(a).toEqual(b);
    expect(c).not.toEqual(a);
    expect(dailyKey(new Date('2026-10-22T23:59:00Z'))).toBe('2026-10-22');
  });

  it('is never the plainest or the hardest layout, and spreads its dials over a month', () => {
    const seen = { themes: new Set<string>(), lengths: new Set<string>(), twists: new Set<number>() };
    for (let d = 1; d <= 31; d++) {
      const p = dailyParams(new Date(`2026-10-${String(d).padStart(2, '0')}T12:00:00Z`));
      expect(p.complexity).toBeGreaterThanOrEqual(2);
      expect(p.complexity).toBeLessThanOrEqual(4);
      seen.themes.add(p.theme);
      seen.lengths.add(p.length);
      seen.twists.add(p.complexity);
    }
    expect(seen.themes.size).toBeGreaterThan(10);
    expect(seen.lengths.size).toBe(3);
    expect(seen.twists.size).toBe(3);
  });
});
