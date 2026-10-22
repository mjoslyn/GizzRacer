import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT, type InputFrame } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { wrapAngle } from '../src/core/math';
import { createKartState, stepKart, type KartState } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { assistSteer } from '../src/physics/steerAssist';
import { TRACK_LIST } from '../src/tracks/index';
import { Track } from '../src/tracks/track';
import { TEST_TRACK } from '../src/tracks/testTrack';

const params = kartParams(RACERS[0].stats, '150cc');
// The test loop's first straight runs up +z with open edges, 9 m either side.
const track = new Track(TEST_TRACK);

function drive(s: KartState, steer: number, assist: boolean, seconds: number, t = track): { maxLateral: number; offRoad: boolean } {
  let maxLateral = 0;
  let offRoad = false;
  const frame: InputFrame = { ...NEUTRAL_INPUT, throttle: 1, steer };
  for (let k = 0; k < seconds / PHYSICS_DT; k++) {
    stepKart(s, assist ? assistSteer(frame, s, t) : frame, params, t, PHYSICS_DT);
    const road = t.roadFrame(s);
    if (!road) offRoad = true;
    else maxLateral = Math.max(maxLateral, Math.abs(road.lateral));
  }
  return { maxLateral, offRoad };
}

function onStraight(heading: number): KartState {
  const s = createKartState(0, -50, heading);
  s.speed = params.topSpeed;
  return s;
}

describe('smart steering', () => {
  it('catches a kart drifting toward an open edge with the stick let go', () => {
    expect(drive(onStraight(0.25), 0, false, 1.6).offRoad).toBe(true);
    const saved = drive(onStraight(0.25), 0, true, 1.6);
    expect(saved.offRoad).toBe(false);
  });

  it('lets a stick held toward an open edge leave the road: the correction fades with the stick, gone at full lock', () => {
    // Heading 0.25 rad left of the road at top speed: full lock left goes off, half lock is held longer than no lock.
    expect(drive(onStraight(0.25), -1, true, 1.6).offRoad).toBe(true);
    const half = drive(onStraight(0.25), -0.5, true, 1.6);
    const none = drive(onStraight(0.25), 0, true, 1.6);
    expect(half.maxLateral).toBeGreaterThan(none.maxLateral);
  });

  it('straightens the nose up with the road when the stick is let go', () => {
    const s = onStraight(0.2);
    drive(s, 0, true, 1.2);
    const road = track.roadFrame(s)!;
    expect(Math.abs(wrapAngle(s.heading - Math.atan2(road.tx, road.tz)))).toBeLessThan(0.03);
    // Without it the kart just carries on at its angle.
    const raw = onStraight(0.2);
    drive(raw, 0, false, 0.3);
    expect(Math.abs(wrapAngle(raw.heading))).toBeCloseTo(0.2, 2);
  });

  it('never takes the wheel: steering hard off the road still gets there', () => {
    expect(drive(onStraight(0), -1, true, 2).offRoad).toBe(true);
    expect(drive(onStraight(0), 1, true, 2).offRoad).toBe(true);
  });

  it('leaves a kart driving straight down the middle alone', () => {
    const s = onStraight(0);
    const road = track.roadFrame(s)!;
    s.heading = Math.atan2(road.tx, road.tz);
    const frame: InputFrame = { ...NEUTRAL_INPUT, throttle: 1 };
    expect(Math.abs(assistSteer(frame, s, track).steer)).toBeLessThan(0.02);
  });

  it("doesn't fight a shortcut peeling off the road", () => {
    // Every branch start: from the main road's edge, heading into the branch, there's road beyond.
    let checked = 0;
    for (const t of TRACK_LIST) {
      const tr = new Track(t.build());
      for (const b of tr.branches) {
        const sp = b.spline;
        // A few metres into the branch, still beside the main road.
        const i = Math.min(sp.count - 1, 3);
        const s = createKartState(sp.px[i], sp.pz[i], Math.atan2(sp.tx[i], sp.tz[i]));
        s.y = b.heightAt(sp.dist[i]);
        s.speed = params.topSpeed;
        const frame: InputFrame = { ...NEUTRAL_INPUT, throttle: 1, steer: 0.5 };
        const out = assistSteer(frame, s, tr);
        // Any nudge is small: the edge guard stays out of it.
        expect(Math.abs(out.steer - frame.steer), `${t.name}`).toBeLessThanOrEqual(0.31);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });
});
