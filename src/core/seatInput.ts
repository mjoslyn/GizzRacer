import { clamp } from './math';
import type { InputFrame } from './inputFrame';

/**
 * Party mode (several players on one screen): where each seat's driving
 * comes from. A half of the keyboard, one gamepad, or a phone (a pad page
 * that sends what's held through the room server).
 */
export type KeySide = 'left' | 'right';
export type SeatSource = { kind: 'keys'; side: KeySide } | { kind: 'pad'; index: number } | { kind: 'remote'; id: string };

/** The two halves of the keyboard: WASD with Shift and E on the left, the arrows with Right Shift and Enter on the right. */
export const SEAT_KEYS: Record<KeySide, { up: string[]; brake: string[]; left: string[]; right: string[]; drift: string[]; item: string[]; lookBack: string[] }> = {
  left: { up: ['KeyW'], brake: ['KeyS'], left: ['KeyA'], right: ['KeyD'], drift: ['ShiftLeft', 'Space'], item: ['KeyE'], lookBack: ['KeyQ'] },
  right: { up: ['ArrowUp'], brake: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], drift: ['ShiftRight', 'Slash', 'Numpad0'], item: ['Enter', 'Period', 'NumpadEnter'], lookBack: ['ControlRight', 'Comma'] },
};

/** What a seat's keyboard half calls its keys, for the join screen. */
export const SEAT_KEY_NAMES: Record<KeySide, string> = { left: 'WASD · Shift hop · E item', right: 'Arrows · Right Shift hop · Enter item' };

/** Standard gamepad mapping indices (as core/input.ts). */
export const PAD = { a: 0, b: 1, y: 3, l1: 4, r1: 5, l2: 6, r2: 7, start: 9, dUp: 12, dDown: 13, dLeft: 14, dRight: 15 } as const;
const STICK_DEADZONE = 0.15;
const PITCH_DEADZONE = 0.45;

/** Keys held, and pressed since the last tick (so a tap between ticks still counts), shared by every keyboard seat. */
export class Keyboard {
  readonly down = new Set<string>();
  private readonly latched = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.latched.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  held(codes: readonly string[]): boolean {
    return codes.some((c) => this.down.has(c) || this.latched.has(c));
  }

  /** After every seat has sampled a tick. */
  endTick(): void {
    this.latched.clear();
  }
}

/** A phone's buttons as it last sent them, and the presses since the last tick. */
export interface RemotePad {
  steer: number;
  pitch: number;
  brake: boolean;
  drift: boolean;
  item: boolean;
  lookBack: boolean;
  /** Pressed since the last tick, so a tap shorter than a tick still lands. */
  driftTap: boolean;
  itemTap: boolean;
}

export function remotePad(): RemotePad {
  return { steer: 0, pitch: 0, brake: false, drift: false, item: false, lookBack: false, driftTap: false, itemTap: false };
}

/** What one tick of a seat's controls says, before it becomes an InputFrame. */
interface Raw {
  steer: number;
  brake: number;
  pitch: number;
  drift: boolean;
  item: boolean;
  lookBack: boolean;
  /** Up is held (keyboard): the item on the road, a climb with the glider open. */
  up: boolean;
}

/**
 * One seat's controls as InputFrames, as InputManager does for the solo
 * player: the kart accelerates by itself, up fires the item on the road and
 * climbs with the glider open.
 */
export class SeatInput {
  gliding = false;
  private upInAir = false;
  private prevDrift = false;
  private prevItem = false;
  private prevStart = false;

  constructor(
    readonly source: SeatSource,
    private readonly keys: Keyboard,
    private readonly remote: () => RemotePad | null = () => null,
    private readonly pads: () => readonly (Gamepad | null)[] = connectedPads,
  ) {}

  sample(): InputFrame {
    const r = this.raw();
    if (!r.up) this.upInAir = false;
    else if (this.gliding) this.upInAir = true;
    const pitch = r.pitch + (this.gliding && r.up ? 1 : 0);
    const item = r.item || (!this.gliding && r.up && !this.upInAir);
    const frame: InputFrame = {
      throttle: r.brake > 0 ? 0 : 1,
      brake: clamp(r.brake, 0, 1),
      steer: clamp(r.steer, -1, 1),
      pitch: clamp(pitch, -1, 1),
      drift: r.drift,
      driftPressed: r.drift && !this.prevDrift,
      item,
      itemPressed: item && !this.prevItem,
      lookBack: r.lookBack,
    };
    this.prevDrift = r.drift;
    this.prevItem = item;
    return frame;
  }

  /** True once per Start press on this seat's gamepad. */
  consumePause(): boolean {
    if (this.source.kind !== 'pad') return false;
    const start = this.pads()[this.source.index]?.buttons[PAD.start]?.pressed ?? false;
    const edge = start && !this.prevStart;
    this.prevStart = start;
    return edge;
  }

  private raw(): Raw {
    const s = this.source;
    if (s.kind === 'keys') {
      const k = SEAT_KEYS[s.side];
      const held = (codes: string[]) => this.keys.held(codes);
      const brake = held(k.brake);
      return {
        steer: (held(k.right) ? 1 : 0) - (held(k.left) ? 1 : 0),
        brake: brake ? 1 : 0,
        pitch: brake ? -1 : 0,
        drift: held(k.drift),
        item: held(k.item),
        lookBack: held(k.lookBack),
        up: held(k.up),
      };
    }
    if (s.kind === 'remote') {
      const p = this.remote();
      if (!p) return { steer: 0, brake: 0, pitch: 0, drift: false, item: false, lookBack: false, up: false };
      // A tap shorter than a tick is held for this one: the edge is seen, then let go.
      const raw = { steer: p.steer, brake: p.brake ? 1 : 0, pitch: p.pitch, drift: p.drift || p.driftTap, item: p.item || p.itemTap, lookBack: p.lookBack, up: false };
      p.driftTap = false;
      p.itemTap = false;
      return raw;
    }
    const pad = this.pads()[s.index];
    if (!pad) return { steer: 0, brake: 0, pitch: 0, drift: false, item: false, lookBack: false, up: false };
    const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
    const val = (i: number) => pad.buttons[i]?.value ?? 0;
    let steer = (btn(PAD.dRight) ? 1 : 0) - (btn(PAD.dLeft) ? 1 : 0);
    const x = pad.axes[0] ?? 0;
    if (Math.abs(x) > STICK_DEADZONE) steer += Math.sign(x) * ((Math.abs(x) - STICK_DEADZONE) / (1 - STICK_DEADZONE));
    // The stick's up is negative.
    const y = pad.axes[1] ?? 0;
    let pitch = (btn(PAD.dUp) ? 1 : 0) - (btn(PAD.dDown) ? 1 : 0);
    if (Math.abs(y) > PITCH_DEADZONE) pitch -= Math.sign(y) * ((Math.abs(y) - PITCH_DEADZONE) / (1 - PITCH_DEADZONE));
    return {
      steer,
      brake: Math.max(btn(PAD.b) ? 1 : 0, val(PAD.l2)),
      pitch,
      drift: btn(PAD.r1) || btn(PAD.a),
      item: btn(PAD.l1),
      lookBack: btn(PAD.y),
      up: false,
    };
  }
}

/** The gamepads by index, as the browser numbers them (gaps where one was unplugged). */
export function connectedPads(): readonly (Gamepad | null)[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  return navigator.getGamepads();
}

/** Seat labels and colours: P1 to P4. */
export const SEAT_COLORS = ['#ff4d6a', '#3fa9ff', '#ffd23a', '#5ce07a'] as const;
export const MAX_SEATS = 4;

/** What a seat's source is called on the join screen. */
export function sourceName(s: SeatSource): string {
  if (s.kind === 'keys') return s.side === 'left' ? 'Keyboard (WASD)' : 'Keyboard (arrows)';
  if (s.kind === 'pad') return `Controller ${s.index + 1}`;
  return 'Phone';
}

export function sameSource(a: SeatSource, b: SeatSource): boolean {
  if (a.kind === 'keys' && b.kind === 'keys') return a.side === b.side;
  if (a.kind === 'pad' && b.kind === 'pad') return a.index === b.index;
  if (a.kind === 'remote' && b.kind === 'remote') return a.id === b.id;
  return false;
}
