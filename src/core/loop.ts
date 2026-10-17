export const PHYSICS_HZ = 60;
export const PHYSICS_DT = 1 / PHYSICS_HZ;
/** Cap on real time consumed per frame so a stalled tab doesn't spiral. */
const MAX_FRAME_TIME = 0.25;

/**
 * Fixed-timestep simulation with interpolated rendering.
 * `step` runs at exactly PHYSICS_HZ; `render` receives alpha in [0, 1)
 * describing how far real time sits between the last two physics states.
 */
export class FixedLoop {
  paused = false;
  private accumulator = 0;
  private lastTime = -1;
  private rafId = 0;

  constructor(
    private readonly step: (dt: number) => void,
    private readonly render: (alpha: number, frameDt: number) => void,
  ) {}

  start(): void {
    this.lastTime = -1;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
  }

  /** Consumes elapsed real seconds and returns the number of physics steps run. */
  advance(elapsed: number): number {
    this.accumulator += Math.min(Math.max(elapsed, 0), MAX_FRAME_TIME);
    let steps = 0;
    while (this.accumulator >= PHYSICS_DT) {
      this.step(PHYSICS_DT);
      this.accumulator -= PHYSICS_DT;
      steps++;
    }
    return steps;
  }

  get alpha(): number {
    return this.accumulator / PHYSICS_DT;
  }

  private readonly frame = (time: number): void => {
    const elapsed = this.lastTime < 0 ? 0 : (time - this.lastTime) / 1000;
    this.lastTime = time;
    if (!this.paused) this.advance(elapsed);
    this.render(this.alpha, elapsed);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
