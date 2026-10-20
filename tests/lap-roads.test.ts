import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { createKartState, stepKart } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
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

  it('every shortcut is there on some laps of a race and not on others, and says what it is when it is not', () => {
    for (const b of def.branches) {
      const open = LAPS.map((l) => branchOpen(b, l));
      expect(open.some(Boolean), b.name).toBe(true);
      expect(open.every(Boolean), b.name).toBe(false);
      expect(b.shut, b.name).toBeDefined();
    }
  });

  it('a kart on an open lap is on the shortcut; on a shut lap the road past the bar (or all of it) is not there', () => {
    def.branches.forEach((b, k) => {
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

  it('a bar across a shortcut stands clear of the main road, and stops a kart driving into it', () => {
    def.branches.forEach((b, k) => {
      if (b.shut?.kind !== 'barrier') return;
      const r = track.branches[k];
      const s = b.shut.at * r.scale;
      const p = pointAt(r.spline, s);
      const hw = r.halfWidthAtS(s) + 1;
      for (const lat of [-hw, 0, hw]) {
        const x = p.x - p.tz * lat;
        const z = p.z + p.tx * lat;
        const main = nearestOnSpline(track.spline, x, z);
        expect(main.distance - track.main.halfWidthAt(main), `${b.name} bar at ${lat.toFixed(1)}`).toBeGreaterThan(1);
      }
      // Flat out down the branch on a lap it's shut: the kart never gets past the bar.
      const shut = LAPS.find((l) => !branchOpen(b, l))!;
      const pr = kartParams(RACERS[0].stats, '150cc');
      const start = pointAt(r.spline, 0);
      const kart = createKartState(start.x, start.z, Math.atan2(start.tx, start.tz));
      Object.assign(kart, shut);
      kart.y = kart.groundY = r.heightAt(0);
      kart.speed = pr.topSpeed;
      let furthest = 0;
      for (let t = 0; t < 6; t += PHYSICS_DT) {
        const hit = nearestOnSpline(r.spline, kart.x, kart.z);
        const ahead = pointAt(r.spline, Math.min(hit.s + 12, r.spline.length));
        const err = wrapAngle(Math.atan2(ahead.x - kart.x, ahead.z - kart.z) - kart.heading);
        stepKart(kart, { ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) }, pr, track, PHYSICS_DT);
        furthest = Math.max(furthest, hit.s);
      }
      expect(furthest, b.name).toBeLessThan(s + 1);
    });
  });
});
