import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT, type InputFrame } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import {
  BOOST_SPEED_MUL,
  DRIFT_BOOSTS,
  DRIFT_TIERS,
  OFFROAD_SPEED_MUL,
  createKartState,
  driftTier,
  stepKart,
  type DriveEnv,
  type KartState,
  type SurfaceType,
} from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';

const params = kartParams(RACERS[0].stats, '100cc');

function flatEnv(surface: SurfaceType = 'road', wallZ = Infinity): DriveEnv {
  return {
    surfaceAt: () => surface,
    groundHeight: () => 0,
    collide: (_x, z, r) => (z > wallZ - r ? { nx: 0, nz: -1, depth: z - (wallZ - r) } : null),
  };
}

const input = (over: Partial<InputFrame>): InputFrame => ({ ...NEUTRAL_INPUT, ...over });

function run(s: KartState, env: DriveEnv, seconds: number, inp: InputFrame | ((t: number) => InputFrame)) {
  const steps = Math.round(seconds / PHYSICS_DT);
  const events = [];
  for (let i = 0; i < steps; i++) {
    const frame = typeof inp === 'function' ? inp(i * PHYSICS_DT) : inp;
    events.push(stepKart(s, frame, params, env, PHYSICS_DT));
  }
  return events;
}

describe('kart longitudinal', () => {
  it('accelerates to top speed and no further', () => {
    const s = createKartState();
    run(s, flatEnv(), 3, input({ throttle: 1 }));
    expect(s.speed).toBeGreaterThan(params.topSpeed * 0.8);
    run(s, flatEnv(), 5, input({ throttle: 1 }));
    expect(s.speed).toBeCloseTo(params.topSpeed, 5);
    expect(s.z).toBeGreaterThan(0);
    expect(Math.abs(s.x)).toBeLessThan(1e-9);
  });

  it('caps speed at 60% off-road', () => {
    const s = createKartState();
    run(s, flatEnv('offroad'), 8, input({ throttle: 1 }));
    expect(s.speed).toBeCloseTo(params.topSpeed * OFFROAD_SPEED_MUL, 5);
  });

  it('bleeds speed down when leaving the road', () => {
    const s = createKartState();
    s.speed = params.topSpeed;
    run(s, flatEnv('offroad'), 0.25, input({ throttle: 1 }));
    expect(s.speed).toBeLessThan(params.topSpeed);
    expect(s.speed).toBeGreaterThan(params.topSpeed * OFFROAD_SPEED_MUL);
  });

  it('brakes then reverses', () => {
    const s = createKartState();
    s.speed = 20;
    run(s, flatEnv(), 0.5, input({ brake: 1 }));
    expect(s.speed).toBeLessThan(10);
    run(s, flatEnv(), 3, input({ brake: 1 }));
    expect(s.speed).toBeLessThan(0);
    expect(s.speed).toBeGreaterThanOrEqual(-8);
  });

  it('coasts to a stop', () => {
    const s = createKartState();
    s.speed = 10;
    run(s, flatEnv(), 3, NEUTRAL_INPUT);
    expect(s.speed).toBe(0);
  });

  it('boost pads exceed top speed', () => {
    const s = createKartState();
    s.speed = params.topSpeed;
    run(s, flatEnv('boost'), 1, input({ throttle: 1 }));
    expect(s.speed).toBeGreaterThan(params.topSpeed * 1.1);
    expect(s.speed).toBeLessThanOrEqual(params.topSpeed * BOOST_SPEED_MUL + 1e-9);
  });

  it('faster stats give higher top speed, higher classes go faster', () => {
    const golem = kartParams(RACERS.find((r) => r.id === 'fuzz-golem')!.stats, '100cc');
    const witch = kartParams(RACERS.find((r) => r.id === 'swamp-witch')!.stats, '100cc');
    expect(golem.topSpeed).toBeGreaterThan(witch.topSpeed);
    expect(kartParams(RACERS[0].stats, '150cc').topSpeed).toBeGreaterThan(params.topSpeed);
    expect(kartParams(RACERS[0].stats, '50cc').topSpeed).toBeLessThan(params.topSpeed);
  });
});

describe('kart steering', () => {
  it('steering right turns toward -x (screen right with +z forward)', () => {
    const s = createKartState();
    s.speed = 20;
    run(s, flatEnv(), 0.5, input({ throttle: 1, steer: 1 }));
    expect(s.heading).toBeLessThan(0);
    expect(s.x).toBeLessThan(0);
  });

  it('does not turn while stationary', () => {
    const s = createKartState();
    run(s, flatEnv(), 0.5, input({ steer: 1 }));
    expect(s.heading).toBe(0);
  });
});

describe('kart drift', () => {
  const driftRight = (holdFor: number) => (t: number) =>
    t < holdFor
      ? input({ throttle: 1, steer: 1, drift: true, driftPressed: t === 0 })
      : input({ throttle: 1 });

  it('hops and lands', () => {
    const s = createKartState();
    s.speed = 20;
    const events = run(s, flatEnv(), 1, driftRight(0.05));
    expect(events[0].hopped).toBe(true);
    expect(events.some((e) => e.landed > 0)).toBe(true);
    expect(s.grounded).toBe(true);
    expect(s.y).toBe(0);
  });

  it('tiers map to spec thresholds', () => {
    expect(driftTier(0.69)).toBe(0);
    expect(driftTier(DRIFT_TIERS[0])).toBe(1);
    expect(driftTier(DRIFT_TIERS[1])).toBe(2);
    expect(driftTier(DRIFT_TIERS[2])).toBe(3);
  });

  it.each([
    [0.4, 0],
    [1.3, 1],
    [2.0, 2],
    [3.0, 3],
  ])('holding a drift for %ss releases tier %i', (hold, tier) => {
    const s = createKartState();
    s.speed = params.topSpeed;
    const events = run(s, flatEnv(), hold + 0.1, driftRight(hold));
    expect(events.some((e) => e.driftStarted)).toBe(true);
    const released = events.find((e) => e.boostTier > 0);
    if (tier === 0) {
      expect(released).toBeUndefined();
    } else {
      expect(released?.boostTier).toBe(tier);
      expect(s.boostTime).toBeGreaterThan(DRIFT_BOOSTS[tier - 1] - 0.15);
    }
  });

  it('needs speed to drift', () => {
    const s = createKartState();
    s.speed = 5;
    const events = run(s, flatEnv(), 0.5, driftRight(0.5));
    expect(events.some((e) => e.driftStarted)).toBe(false);
  });

  it('drifting turns tighter than plain steering', () => {
    const plain = createKartState();
    plain.speed = params.topSpeed;
    run(plain, flatEnv(), 1, input({ throttle: 1, steer: 1 }));
    const drift = createKartState();
    drift.speed = params.topSpeed;
    run(drift, flatEnv(), 1, driftRight(2));
    expect(Math.abs(drift.heading)).toBeGreaterThan(Math.abs(plain.heading));
  });
});

describe('kart walls', () => {
  it('stops at a wall and loses speed', () => {
    const s = createKartState();
    s.speed = 25;
    const events = run(s, flatEnv('road', 10), 1, input({ throttle: 1 }));
    expect(events.some((e) => e.wallHit > 0.9)).toBe(true);
    expect(s.z).toBeLessThanOrEqual(9 + 1e-9);
  });
});
