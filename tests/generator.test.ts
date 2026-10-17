import { describe, expect, it } from 'vitest';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { NEUTRAL_INPUT } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { Race } from '../src/core/race';
import { RACERS } from '../src/physics/racers';
import { GEN_THEMES, generateTrack, isPlayable, trackName, type GenParams } from '../src/tracks/generator';
import { pointAt } from '../src/tracks/spline';
import { Track } from '../src/tracks/track';

describe('track generator', () => {
  it('builds the same track from the same seed and dials', () => {
    const p: GenParams = { seed: 42, theme: 'lagoon', complexity: 3, length: 'medium' };
    expect(JSON.stringify(generateTrack(p))).toBe(JSON.stringify(generateTrack(p)));
    expect(JSON.stringify(generateTrack({ ...p, seed: 43 }))).not.toBe(JSON.stringify(generateTrack(p)));
    expect(trackName(p)).toBe(generateTrack(p).name);
  });

  it('longer dial, longer lap', () => {
    const len = (length: GenParams['length']) => new Track(generateTrack({ seed: 7, theme: 'desert', complexity: 3, length })).length;
    expect(len('short')).toBeLessThan(len('medium'));
    expect(len('medium')).toBeLessThan(len('long'));
  });

  describe.each(GEN_THEMES.flatMap((theme) => [1, 3, 5].map((complexity) => [theme, complexity] as const)))('%s, complexity %i', (theme, complexity) => {
    const def = generateTrack({ seed: 11 + complexity, theme, complexity, length: 'medium' });
    const track = new Track(def);

    it('is a closed loop inside its bounds that never crosses itself', () => {
      expect(isPlayable(def)).toBe(true);
      const sp = track.spline;
      for (let i = 0; i < sp.count; i++) expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
    });

    it('can be lapped by autopilot without falling off', () => {
      const race = new Race(track);
      const kart = race.addKart(RACERS[0], '100cc', null);
      race.time = 0;
      let falls = 0;
      for (let t = 0; t < 200 && kart.laps.lap < 1; t += PHYSICS_DT) {
        const s = kart.state;
        const p = pointAt(track.spline, kart.progressS + 14);
        const err = wrapAngle(Math.atan2(p.x - s.x, p.z - s.z) - s.heading);
        race.step(PHYSICS_DT, [{ ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) }]);
        if (kart.respawned) falls++;
      }
      expect(kart.laps.lap).toBe(1);
      expect(falls).toBe(0);
    });

    it('a full CPU field laps it with items and hazards on', () => {
      const race = new Race(track, 3);
      for (const r of RACERS) race.addKart(r, '150cc', CPU_SKILL['150cc']);
      let falls = 0;
      for (let t = 0; t < 200 && race.karts.some((k) => k.laps.lap < 1); t += PHYSICS_DT) {
        race.step(PHYSICS_DT, []);
        falls += race.karts.filter((k) => k.respawned).length;
      }
      for (const k of race.karts) expect(k.laps.lap, k.racer.name).toBeGreaterThanOrEqual(1);
      expect(falls).toBeLessThanOrEqual(3);
    });
  });
});
