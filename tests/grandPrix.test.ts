import { describe, expect, it } from 'vitest';
import { GP_POINTS, GrandPrix } from '../src/core/grandPrix';
import { FIELD_SIZE, RACERS } from '../src/physics/racers';

describe('grand prix', () => {
  const grid = RACERS.slice(0, FIELD_SIZE);

  it('keeps the same twelve racers for every race of the cup', () => {
    const gp = new GrandPrix(grid, [0, 1, 2, 3]);
    expect(grid.length).toBe(12);
    const field = new Set(grid);
    while (!gp.finished) {
      const g = gp.grid();
      expect(g.length).toBe(12);
      expect(new Set(g)).toEqual(field);
      gp.record([...g].reverse());
    }
  });

  it('runs every track in order, then finishes', () => {
    const gp = new GrandPrix(grid, [0, 1, 2, 3]);
    const seen: number[] = [];
    while (!gp.finished) {
      seen.push(gp.trackIndex);
      gp.record(grid);
    }
    expect(seen).toEqual([0, 1, 2, 3]);
  });

  it('scores 15, 12, 10, 8, 6, 4, 2, 1 by place', () => {
    const gp = new GrandPrix(grid, [0, 1]);
    gp.record(grid);
    expect(gp.entries.map((e) => e.points)).toEqual(GP_POINTS.slice(0, FIELD_SIZE));
    expect(gp.entries.map((e) => e.gained)).toEqual(GP_POINTS.slice(0, FIELD_SIZE));
  });

  it('ranks by points, breaking ties on the latest race', () => {
    const gp = new GrandPrix(grid, [0, 1]);
    const [a, b] = grid;
    gp.record([a, b, ...grid.slice(2)]);
    gp.record([b, a, ...grid.slice(2)]);
    // 27 each; b won the latest race.
    expect(gp.standings()[0].racer).toBe(b);
    expect(gp.standings()[0].points).toBe(gp.standings()[1].points);
  });

  it('starts the leader at the back after the first race', () => {
    const gp = new GrandPrix(grid, [0, 1]);
    expect(gp.grid()).toEqual(grid);
    gp.record(grid);
    const next = gp.grid();
    expect(next[next.length - 1]).toBe(grid[0]);
    expect(next[0]).toBe(grid[grid.length - 1]);
  });
});

describe('Random Cup', () => {
  it('draws four different premade tracks, a new four each time', async () => {
    const { RANDOM_CUP_NAME, TRACK_LIST, randomCupTracks } = await import('../src/tracks/index');
    const { chosenCup } = await import('../src/ui/menu');
    const draws = Array.from({ length: 30 }, () => randomCupTracks());
    for (const d of draws) {
      expect(d).toHaveLength(4);
      expect(new Set(d).size).toBe(4);
      for (const t of d) expect(TRACK_LIST[t]).toBeDefined();
    }
    expect(new Set(draws.map((d) => d.join())).size).toBeGreaterThan(20);
    // Past the last of the cups, the picker's choice is the Random Cup with its draw.
    const { CUPS } = await import('../src/tracks/index');
    const cup = chosenCup({ cup: CUPS.length, randomTracks: draws[0] } as Parameters<typeof chosenCup>[0]);
    expect(cup).toEqual({ name: RANDOM_CUP_NAME, tracks: draws[0] });
    expect(chosenCup({ cup: 0, randomTracks: draws[0] } as Parameters<typeof chosenCup>[0])).toBe(CUPS[0]);
  });
});
