import { describe, expect, it } from 'vitest';
import { GP_POINTS, GrandPrix } from '../src/core/grandPrix';
import { FIELD_SIZE, RACERS } from '../src/physics/racers';

describe('grand prix', () => {
  const grid = RACERS.slice(0, FIELD_SIZE);

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
