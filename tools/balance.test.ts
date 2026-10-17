import { it } from 'vitest';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { PHYSICS_DT } from '../src/core/loop';
import { COUNTDOWN, Race } from '../src/core/race';
import { FIELD_SIZE, RACERS } from '../src/physics/racers';
import { TRACK_LIST } from '../src/tracks/index';
import { Track } from '../src/tracks/track';

/**
 * Balance report: every track, five seeds, 100cc and 150cc, all-CPU fields
 * of FIELD_SIZE drawn round the roster so every racer races about as often.
 * Prints average finishing place, wins and podiums per racer.
 * Run with `npm run balance` (not part of `npm test`).
 */
it('balance', () => {
  const stats = new Map(RACERS.map((r) => [r.id, { sum: 0, wins: 0, podium: 0, n: 0 }]));
  const tracks = TRACK_LIST.map((t) => new Track(t.build()));
  const spreads: number[] = [];
  for (const engine of ['100cc', '150cc'] as const) {
    for (const [ti, track] of tracks.entries()) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const race = new Race(track, seed * 97 + ti);
        // Rotate the field round the roster, and the grid within it, so no racer always starts in front.
        const grid = Array.from({ length: FIELD_SIZE }, (_, i) => RACERS[(i + seed * 3 + ti * 5) % RACERS.length]);
        for (const r of grid) race.addKart(r, engine, CPU_SKILL[engine]);
        for (let t = 0; t < COUNTDOWN + 600 && !race.finished; t += PHYSICS_DT) race.step(PHYSICS_DT, []);
        race.results.forEach((k, i) => {
          const s = stats.get(k.racer.id)!;
          s.sum += i + 1;
          s.n++;
          if (i === 0) s.wins++;
          if (i < 3) s.podium++;
        });
        spreads.push(race.results[race.results.length - 1].finishTime! - race.results[0].finishTime!);
      }
    }
  }
  const rows = [...stats.entries()].sort((a, b) => a[1].sum / a[1].n - b[1].sum / b[1].n);
  console.log(rows.map(([id, s]) => `${id.padEnd(16)} avg ${(s.sum / s.n).toFixed(2)}  wins ${s.wins}  podiums ${s.podium}`).join('\n'));
  console.log('first-to-last gap avg', (spreads.reduce((a, b) => a + b, 0) / spreads.length).toFixed(1), 's');
}, 600000);
