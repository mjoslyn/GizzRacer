import { describe, expect, it } from 'vitest';
import { TRACK_LIST } from '../src/tracks/index';
import { nearestOnSpline, pointAt } from '../src/tracks/spline';
import { Track, branchOpen, type LapContext } from '../src/tracks/track';

const LAPS: LapContext[] = [
  { lap: 1, lastLap: false },
  { lap: 2, lastLap: false },
  { lap: 3, lastLap: true },
];

describe.each(TRACK_LIST.map((t) => [t.name, t.build] as const))('%s: its shortcut comes and goes', (_name, build) => {
  const def = build();
  const track = new Track(def);
  // The shortcuts that are only there on some laps; the rest are plain roads, open on every lap (there are no bars).
  const lapRoads = def.branches.filter((b) => b.openOn);

  it('a shortcut that comes and goes is there on some laps of a race and not on others, and says what it is when it is not', () => {
    for (const b of lapRoads) {
      const open = LAPS.map((l) => branchOpen(b, l));
      expect(open.some(Boolean), b.name).toBe(true);
      expect(open.every(Boolean), b.name).toBe(false);
      expect(b.shut, b.name).toBeDefined();
    }
  });

  it('a shortcut with no lap rule is there on every lap', () => {
    for (const b of def.branches) {
      if (b.openOn) continue;
      expect(b.shut, b.name).toBeUndefined();
      for (const l of LAPS) expect(branchOpen(b, l), b.name).toBe(true);
    }
  });

  it('a kart on an open lap is on the shortcut; on a shut lap the road is not there', () => {
    def.branches.forEach((b, k) => {
      if (!b.openOn) return;
      const r = track.branches[k];
      const mid = pointAt(r.spline, r.spline.length * 0.75);
      const y = r.heightAt(r.spline.length * 0.75) + 0.5;
      const at = (ctx: LapContext) => track.locate(mid.x, mid.z, y, -1, ctx);
      const open = LAPS.find((l) => branchOpen(b, l))!;
      const shut = LAPS.find((l) => !branchOpen(b, l))!;
      expect(at(open).onRoad, `${b.name} open`).toBe(true);
      // Unless the main road happens to be right there, it's ground (or a fall) on the shut lap.
      const main = nearestOnSpline(track.spline, mid.x, mid.z);
      if (main.distance > track.main.halfWidthAt(main) + 2) expect(at(shut).onRoad, `${b.name} shut`).toBe(false);
    });
  });

});
