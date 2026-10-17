import { clamp } from './math';

/**
 * One tick of player intent. Pure data so it can be recorded, replayed,
 * or sent over the network independently of simulation state.
 */
export interface InputFrame {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (left) .. 1 (right)
  drift: boolean;
  driftPressed: boolean; // rising edge this tick
  item: boolean;
  itemPressed: boolean;
  lookBack: boolean;
}

export const NEUTRAL_INPUT: Readonly<InputFrame> = {
  throttle: 0,
  brake: 0,
  steer: 0,
  drift: false,
  driftPressed: false,
  item: false,
  itemPressed: false,
  lookBack: false,
};

const KEYS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  drift: ['ShiftLeft', 'ShiftRight', 'Space'],
  item: ['KeyE'],
  lookBack: ['KeyQ'],
  pause: ['Escape'],
} as const;

// Standard gamepad mapping indices.
const PAD = { a: 0, b: 1, y: 3, l1: 4, r1: 5, l2: 6, r2: 7, start: 9, dLeft: 14, dRight: 15 } as const;
const STICK_DEADZONE = 0.15;

const PREVENT_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/**
 * Reads keyboard and the first standard gamepad into InputFrames.
 * With auto-accelerate on, throttle is always full unless braking.
 */
export class InputManager {
  autoAccelerate = true;
  private readonly down = new Set<string>();
  /** Keys pressed since the last sample, so sub-tick taps aren't lost. */
  private readonly latched = new Set<string>();
  private prevDrift = false;
  private prevItem = false;
  private prevPadStart = false;
  private pauseRequested = false;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.latched.add(e.code);
      if ((KEYS.pause as readonly string[]).includes(e.code)) this.pauseRequested = true;
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  /** Samples input for one physics tick. */
  sample(): InputFrame {
    const key = (codes: readonly string[]) => codes.some((c) => this.down.has(c) || this.latched.has(c));
    let throttle = key(KEYS.throttle) ? 1 : 0;
    let brake = key(KEYS.brake) ? 1 : 0;
    let steer = (key(KEYS.right) ? 1 : 0) - (key(KEYS.left) ? 1 : 0);
    let drift = key(KEYS.drift);
    let item = key(KEYS.item);
    let lookBack = key(KEYS.lookBack);

    const pad = this.gamepad();
    if (pad) {
      const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
      const val = (i: number) => pad.buttons[i]?.value ?? 0;
      throttle = Math.max(throttle, btn(PAD.a) ? 1 : 0, val(PAD.r2));
      brake = Math.max(brake, btn(PAD.b) ? 1 : 0, val(PAD.l2));
      const x = pad.axes[0] ?? 0;
      if (Math.abs(x) > STICK_DEADZONE) {
        steer += Math.sign(x) * ((Math.abs(x) - STICK_DEADZONE) / (1 - STICK_DEADZONE));
      }
      steer += (btn(PAD.dRight) ? 1 : 0) - (btn(PAD.dLeft) ? 1 : 0);
      drift ||= btn(PAD.r1);
      item ||= btn(PAD.l1);
      lookBack ||= btn(PAD.y);
    }

    if (this.autoAccelerate) throttle = brake > 0 ? 0 : 1;

    const frame: InputFrame = {
      throttle: clamp(throttle, 0, 1),
      brake: clamp(brake, 0, 1),
      steer: clamp(steer, -1, 1),
      drift,
      driftPressed: drift && !this.prevDrift,
      item,
      itemPressed: item && !this.prevItem,
      lookBack,
    };
    this.prevDrift = drift;
    this.prevItem = item;
    this.latched.clear();
    return frame;
  }

  /** True once per Esc / Start press. Polled per render frame so it works while paused. */
  consumePause(): boolean {
    const pad = this.gamepad();
    const start = pad?.buttons[PAD.start]?.pressed ?? false;
    const padEdge = start && !this.prevPadStart;
    this.prevPadStart = start;
    const requested = this.pauseRequested || padEdge;
    this.pauseRequested = false;
    return requested;
  }

  private gamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    for (const pad of navigator.getGamepads()) {
      if (pad?.connected) return pad;
    }
    return null;
  }
}
