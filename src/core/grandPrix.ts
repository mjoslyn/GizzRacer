import type { RacerDef } from '../physics/racers';

/** Points by finishing place (spec section 9). */
export const GP_POINTS = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

export interface GpEntry {
  racer: RacerDef;
  points: number;
  /** Points scored in the latest race. */
  gained: number;
  /** Place in the latest race, 1-based; 0 before the first. */
  lastPlace: number;
}

/**
 * A cup: the same field races every track in order, scoring points by
 * place. After the first race the grid is the standings reversed, so the
 * leader starts at the back.
 */
export class GrandPrix {
  round = 0;
  readonly entries: GpEntry[];

  constructor(
    /** Racers in grid order for the first race. */
    private readonly firstGrid: readonly RacerDef[],
    readonly tracks: readonly number[],
  ) {
    this.entries = firstGrid.map((racer) => ({ racer, points: 0, gained: 0, lastPlace: 0 }));
  }

  get trackIndex(): number {
    return this.tracks[Math.min(this.round, this.tracks.length - 1)];
  }

  get finished(): boolean {
    return this.round >= this.tracks.length;
  }

  get lastRound(): boolean {
    return this.round === this.tracks.length - 1;
  }

  /** Racers in grid slot order for the current round. */
  grid(): RacerDef[] {
    if (this.round === 0) return [...this.firstGrid];
    return this.standings()
      .reverse()
      .map((e) => e.racer);
  }

  /** Scores a race from its finishing order and moves to the next round. */
  record(order: readonly RacerDef[]): void {
    for (const e of this.entries) {
      const place = order.indexOf(e.racer) + 1;
      e.lastPlace = place || order.length + 1;
      e.gained = place ? (GP_POINTS[place - 1] ?? 0) : 0;
      e.points += e.gained;
    }
    this.round++;
  }

  /** Most points first; ties go to whoever placed better in the latest race. */
  standings(): GpEntry[] {
    return [...this.entries].sort((a, b) => b.points - a.points || a.lastPlace - b.lastPlace);
  }
}
