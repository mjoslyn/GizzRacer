import { clamp } from './math';
import { NEUTRAL_INPUT, type InputFrame } from './inputFrame';
import { PadTracker, padRace } from './gamepad';

export { NEUTRAL_INPUT, type InputFrame };

const KEYS = {
  /** Up: fires the item on the road, climbs with the glider open. */
  up: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  drift: ['ShiftLeft', 'ShiftRight', 'Space', 'TouchHop'],
  item: ['KeyE', 'KeyX', 'TouchItem'],
  lookBack: ['KeyQ'],
  pause: ['Escape'],
} as const;

const PREVENT_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/**
 * Reads keyboard, touch and the gamepad in use (whichever was pressed last,
 * at any index, by the map in core/gamepad.ts) into InputFrames. The kart
 * accelerates by itself: throttle is full unless braking.
 */
export class InputManager {
  /** The player's glider is open (set by the game each tick): up climbs rather than firing the item. */
  gliding = false;
  /** Up has been held since the glider was open: landing with it held is no item press. */
  private upInAir = false;
  /** Written by the on-screen touch controls. */
  readonly touch = { steer: 0, tilt: 0, tiltPitch: 0, pitch: 0, drift: false, brake: false, item: false };
  private readonly down = new Set<string>();
  /** Keys pressed since the last sample, so sub-tick taps aren't lost. */
  private readonly latched = new Set<string>();
  private prevDrift = false;
  private prevItem = false;
  private prevPadStart = false;
  private pauseRequested = false;

  constructor(
    target: Window = window,
    /** The pads, shared with the menus so both follow the one in use. */
    readonly pads: PadTracker = new PadTracker(),
  ) {
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
    let brake = key(KEYS.brake) ? 1 : 0;
    let steer = (key(KEYS.right) ? 1 : 0) - (key(KEYS.left) ? 1 : 0);
    // Up fires the item on the road; with the glider open, up and down (the brake key) climb and dive.
    const up = key(KEYS.up);
    if (!up) this.upInAir = false;
    else if (this.gliding) this.upInAir = true;
    let pitch = (this.gliding && up ? 1 : 0) - (key(KEYS.brake) ? 1 : 0) + this.touch.pitch + this.touch.tiltPitch;
    let drift = key(KEYS.drift);
    let item = key(KEYS.item) || (!this.gliding && up && !this.upInAir);
    let lookBack = key(KEYS.lookBack);

    steer += this.touch.steer + this.touch.tilt;
    drift ||= this.touch.drift;
    brake = Math.max(brake, this.touch.brake ? 1 : 0);
    item ||= this.touch.item;

    const state = this.pads.current();
    if (state) {
      const p = padRace(state);
      brake = Math.max(brake, p.brake);
      steer += p.steer;
      pitch += p.pitch;
      drift ||= p.drift;
      item ||= p.item;
      lookBack ||= p.lookBack;
    }
    const throttle = brake > 0 ? 0 : 1;

    const frame: InputFrame = {
      throttle: clamp(throttle, 0, 1),
      brake: clamp(brake, 0, 1),
      steer: clamp(steer, -1, 1),
      pitch: clamp(pitch, -1, 1),
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

  /** Fires the item as if E were tapped (the touch ITEM button). */
  pressItem(): void {
    this.latched.add('TouchItem');
  }

  /** A hop, as if Space were tapped (a tap on the touch screen): one tick of drift, so no drift follows. */
  pressHop(): void {
    this.latched.add('TouchHop');
  }

  /** Asks for a pause as if Esc were pressed (the touch pause button). */
  requestPause(): void {
    this.pauseRequested = true;
  }

  /** True once per Esc / Start press. Polled per render frame so it works while paused. */
  consumePause(): boolean {
    const state = this.pads.current();
    const start = state ? padRace(state).pause : false;
    const padEdge = start && !this.prevPadStart;
    this.prevPadStart = start;
    const requested = this.pauseRequested || padEdge;
    this.pauseRequested = false;
    return requested;
  }
}
