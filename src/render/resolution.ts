/**
 * Dynamic resolution: watches how long frames take and scales the drawing
 * buffer down when the game starts dropping frames, then back up once
 * there's headroom again. The scale multiplies the Detail level's pixel
 * ratio; CSS keeps the canvas the size of the screen, so fewer pixels just
 * look a little softer.
 */

/** The scales tried in turn, full resolution first. */
export const RESOLUTION_SCALES: readonly number[] = [1, 0.85, 0.72, 0.6, 0.5];
/** Seconds of frames averaged before each judgement. */
const WINDOW = 1;
/** A window this much slower than the display's own frame is dropping frames. */
const SLOW = 1.25;
/** A window this close to the display's frame has room to spare. */
const FAST = 1.08;
/** Good windows in a row before stepping back up; doubles each time a step up had to be undone. */
const RECOVER = 4;
const MAX_RECOVER = 32;
/** Windows after a step up in which slowing down again counts against it. */
const PROBATION = 3;
/** A frame longer than this is a hitch (a track being built, a stalled tab), not the steady cost of drawing. */
const HITCH = 0.1;

export class DynamicResolution {
  private level = 0;
  private sum = 0;
  private frames = 0;
  /** The display's refresh interval: the quickest frames seen lately (a phone saving power may hold to 30 a second). */
  private interval = Infinity;
  private good = 0;
  private recover = RECOVER;
  /** Windows left since a step up: dropping back down within them makes the next one wait longer. */
  private probation = 0;
  /** The lowest level it may drop to: on a TV, blur reads worse than a dropped frame. */
  private floor = RESOLUTION_SCALES.length - 1;

  get scale(): number {
    return RESOLUTION_SCALES[this.level];
  }

  /** Limits how far the resolution may drop (an index into RESOLUTION_SCALES); true if the scale changed to keep to it. */
  limit(level: number): boolean {
    this.floor = Math.max(0, Math.min(RESOLUTION_SCALES.length - 1, level));
    if (this.level <= this.floor) return false;
    this.level = this.floor;
    return true;
  }

  /** Back to full resolution with a clean slate (a new Detail level). */
  reset(): void {
    this.level = 0;
    this.sum = this.frames = this.good = 0;
    this.recover = RECOVER;
    this.probation = 0;
  }

  /** Takes one frame's real seconds; true when the scale has changed. */
  sample(dt: number): boolean {
    if (!(dt > 0) || dt > HITCH) return false;
    // The quickest frame drifts up very slowly (a window dragged to another screen), so a game stuck at half rate still reads as slow.
    this.interval = Math.min(dt, this.interval * 1.0001);
    this.sum += dt;
    this.frames++;
    if (this.sum < WINDOW) return false;
    const ratio = this.sum / this.frames / this.interval;
    this.sum = this.frames = 0;
    if (ratio > SLOW) {
      this.good = 0;
      if (this.probation > 0) this.recover = Math.min(this.recover * 2, MAX_RECOVER);
      this.probation = 0;
      if (this.level >= this.floor) return false;
      this.level++;
      return true;
    }
    if (this.probation > 0) this.probation--;
    if (ratio > FAST || this.level === 0) {
      this.good = 0;
      return false;
    }
    if (++this.good < this.recover) return false;
    this.good = 0;
    this.level--;
    this.probation = PROBATION;
    return true;
  }
}
