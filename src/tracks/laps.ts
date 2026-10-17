/**
 * Tracks lap progress from arc-length position. A lap only counts once
 * every checkpoint has been reached in order, so reversing over the
 * line doesn't score.
 */
export class LapTracker {
  lap = 0; // completed laps
  nextCheckpoint = 0;
  lastCheckpoint = -1; // index of the last checkpoint reached, -1 = start line
  private prevS: number | null = null;

  /** @param checkpoints fractions of a lap, ascending, excluding 0 */
  constructor(
    private readonly length: number,
    private readonly checkpoints: readonly number[],
  ) {}

  /** Returns true when a lap was completed this update. */
  update(s: number): boolean {
    const prev = this.prevS;
    this.prevS = s;
    if (prev === null) return false;

    const cps = this.checkpoints;
    if (this.nextCheckpoint < cps.length) {
      const cpS = cps[this.nextCheckpoint] * this.length;
      if (prev < cpS && s >= cpS && s - prev < this.length / 2) {
        this.lastCheckpoint = this.nextCheckpoint;
        this.nextCheckpoint++;
      }
      return false;
    }

    // All checkpoints hit: detect a forward wrap across the start line.
    if (prev - s > this.length / 2) {
      this.lap++;
      this.nextCheckpoint = 0;
      this.lastCheckpoint = -1;
      return true;
    }
    return false;
  }

  /** Continuous race progress in laps, for position sorting. */
  progress(s: number): number {
    return this.lap + s / this.length;
  }
}
