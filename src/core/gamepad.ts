/**
 * Gamepads (wired or Bluetooth: Switch Pro, 8BitDo, Xbox, PlayStation,
 * generic) read by the buttons' place on the pad rather than their
 * numbers, and laid out as Mario Kart 8 Deluxe has a Switch controller,
 * named with Nintendo's letters by place (bottom B, right A, left Y, top
 * X). The D-pad, the four face buttons, L/R, ZL/ZR, Plus and Minus are
 * enough for every screen and the race (an 8BitDo SN30 Pro or a Zero 2
 * plays it all); a stick is used where there is one.
 *
 * Race: D-pad (or left stick) steers; A (right) accelerates, as does Y
 * (left), though the kart accelerates by itself (auto-accelerate is the
 * game's only throttle, so holding it changes nothing yet); B (bottom)
 * brakes and reverses; R and ZR hop and drift; L and ZL fire the item; X
 * (top) and Minus look back; Plus pauses. Up and down climb and dive with
 * the glider open.
 *
 * Menus, Nintendo's way: D-pad (or left stick) moves, A (right) confirms,
 * B (bottom) goes back, Plus opens and closes the pause menu.
 */

/** A control by its place on the pad. */
export type PadButton = 'bottom' | 'right' | 'left' | 'top' | 'l1' | 'r1' | 'l2' | 'r2' | 'select' | 'start' | 'up' | 'down' | 'dleft' | 'dright';
export const PAD_BUTTONS: readonly PadButton[] = ['bottom', 'right', 'left', 'top', 'l1', 'r1', 'l2', 'r2', 'select', 'start', 'up', 'down', 'dleft', 'dright'];

/** How the pad names its buttons: Nintendo's letters (every pad but an Xbox one) or Xbox's. */
export type PadFamily = 'xbox' | 'nintendo';

/** One pad this moment, by place: each button 0..1, the left stick, the D-pad (buttons, a hat or the axes). */
export interface PadState {
  index: number;
  id: string;
  family: PadFamily;
  /** The browser knows the pad's layout (`mapping === 'standard'`). */
  standard: boolean;
  buttons: Record<PadButton, number>;
  /** The left stick, -1..1 (up is negative), raw: the D-pad of a pad that reports it on axes 0/1 (the Zero 2) shows here too. */
  stickX: number;
  stickY: number;
}

type Layout = Partial<Record<PadButton, number>>;

/** The W3C standard mapping by place: 0 bottom, 1 right, 2 left, 3 top, 4/5 L/R, 6/7 ZL/ZR, 8 Minus, 9 Plus, 12 to 15 the D-pad (X-input, and what Chrome makes of most Bluetooth pads, Switch Pro and 8BitDo included). */
const STANDARD: Layout = { bottom: 0, right: 1, left: 2, top: 3, l1: 4, r1: 5, l2: 6, r2: 7, select: 8, start: 9, up: 12, down: 13, dleft: 14, dright: 15 };
/**
 * An 8BitDo in D-input (or its Android mode) without a standard mapping:
 * B1 bottom (B), B0 right (A), B4 left (Y), B3 top (X), L B6, R B7, ZL B8,
 * ZR B9, Minus B10, Plus B11; the D-pad as a hat (axis 9) or on axes 0
 * and 1 (the Zero 2).
 */
const EIGHTBITDO_DINPUT: Layout = { bottom: 1, right: 0, left: 4, top: 3, l1: 6, r1: 7, l2: 8, r2: 9, select: 10, start: 11 };
/**
 * Anything else with no standard mapping: buttons numbered by place as the
 * standard has them (which is how a Switch Pro, or an 8BitDo in Switch
 * mode, reports in D-input: B, A, Y, X, L, R, ZL, ZR, Minus, Plus), and the
 * D-pad from buttons 12 to 15, the hat on axis 9, or axes 0 and 1.
 */
const GENERIC: Layout = STANDARD;

const ID_8BITDO = /8bitdo|2dc8/i;
const ID_XBOX = /xbox|xinput/i;

/** Which way the pad names its buttons, from its id: Xbox letters only on a pad that says it's an Xbox (or X-input) one and isn't an 8BitDo. */
export function padFamily(id: string): PadFamily {
  return ID_XBOX.test(id) && !ID_8BITDO.test(id) ? 'xbox' : 'nintendo';
}

function layoutFor(pad: Gamepad): Layout {
  if (pad.mapping === 'standard') return STANDARD;
  return ID_8BITDO.test(pad.id) ? EIGHTBITDO_DINPUT : GENERIC;
}

/**
 * A D-input hat on one axis: eight directions in steps of 2/7 from -1 (up)
 * clockwise to 1 (up-left); anything else (Chrome rests it at 9/7, some at
 * 0) is centred. Returns [x, y] with y down.
 */
export function readHat(v: number | undefined): [number, number] {
  if (v === undefined || !Number.isFinite(v) || Math.abs(v) > 1.05) return [0, 0];
  const step = ((v + 1) * 7) / 2;
  const i = Math.round(step);
  // Only the eight steps are directions: 0 (between two) is the rest.
  if (Math.abs(step - i) > 0.2 || i < 0 || i > 7) return [0, 0];
  const dirs: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  return dirs[i];
}

/** A pad's state by place, or null for an empty slot or one gone. */
export function readPad(pad: Gamepad | null | undefined): PadState | null {
  if (!pad || pad.connected === false) return null;
  const layout = layoutFor(pad);
  const value = (i: number | undefined) => {
    const b = i === undefined ? undefined : pad.buttons[i];
    if (!b) return 0;
    // A digital button held may say value 0; a trigger gives its travel.
    return b.pressed && !(b.value > 0) ? 1 : b.value || 0;
  };
  const buttons = {} as Record<PadButton, number>;
  for (const name of PAD_BUTTONS) buttons[name] = clamp01(value(layout[name]));
  const stickX = pad.axes[0] ?? 0;
  const stickY = pad.axes[1] ?? 0;
  if (pad.mapping !== 'standard') {
    // The hat, where the browser puts one (Chrome, D-input), on top of any D-pad buttons.
    const [hx, hy] = readHat(pad.axes[9]);
    if (hx > 0) buttons.dright = 1;
    if (hx < 0) buttons.dleft = 1;
    if (hy > 0) buttons.down = 1;
    if (hy < 0) buttons.up = 1;
  }
  return { index: pad.index, id: pad.id ?? '', family: padFamily(pad.id ?? ''), standard: pad.mapping === 'standard', buttons, stickX, stickY };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** A button counts as held from half way (triggers included). */
export const PRESS = 0.5;
export const held = (s: PadState, b: PadButton): boolean => s.buttons[b] >= PRESS;

/** The race stick's dead zone, and the glider's (steering wanders off the horizontal). */
export const STICK_DEADZONE = 0.15;
export const PITCH_DEADZONE = 0.45;

/** What one pad says for one race tick, before it becomes an InputFrame. */
export interface PadRace {
  steer: number;
  pitch: number;
  brake: number;
  /** A (or Y) held: accelerate. The kart accelerates by itself, so it's no different yet. */
  accelerate: boolean;
  drift: boolean;
  item: boolean;
  lookBack: boolean;
  pause: boolean;
}

const shape = (v: number, dz: number) => (Math.abs(v) > dz ? Math.sign(v) * ((Math.abs(v) - dz) / (1 - dz)) : 0);

/** The race map, Mario Kart 8 Deluxe's (see the top of this file). */
export function padRace(s: PadState): PadRace {
  const steer = (held(s, 'dright') ? 1 : 0) - (held(s, 'dleft') ? 1 : 0) + shape(s.stickX, STICK_DEADZONE);
  // The stick's up is negative.
  const pitch = (held(s, 'up') ? 1 : 0) - (held(s, 'down') ? 1 : 0) - shape(s.stickY, PITCH_DEADZONE);
  return {
    steer: Math.max(-1, Math.min(1, steer)),
    pitch: Math.max(-1, Math.min(1, pitch)),
    brake: held(s, 'bottom') ? 1 : 0,
    accelerate: held(s, 'right') || held(s, 'left'),
    drift: held(s, 'r1') || held(s, 'r2'),
    item: held(s, 'l1') || held(s, 'l2'),
    lookBack: held(s, 'top') || held(s, 'select'),
    pause: held(s, 'start'),
  };
}

/** Anything on the pad in use: a button, the stick past half, the D-pad. */
export function padActive(s: PadState): boolean {
  if (Math.abs(s.stickX) > 0.5 || Math.abs(s.stickY) > 0.5) return true;
  return PAD_BUTTONS.some((b) => held(s, b));
}

/** The gamepads by index, as the browser numbers them (gaps where one was unplugged). */
export function navigatorPads(): readonly (Gamepad | null)[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  try {
    return Array.from(navigator.getGamepads());
  } catch {
    return [];
  }
}

/**
 * The pad the solo player is using: the last one anything was pressed on,
 * at whatever index (a Bluetooth pad often isn't 0, and gaps are left where
 * one was unplugged); until something is pressed, the first one there.
 */
export class PadTracker {
  /** Index of the pad last used, or -1. */
  active = -1;

  constructor(private readonly source: () => readonly (Gamepad | null)[] = navigatorPads) {}

  /** Every pad there now, read by place. */
  all(): PadState[] {
    const out: PadState[] = [];
    this.source().forEach((p, i) => {
      const s = readPad(p);
      if (s) out.push({ ...s, index: p?.index ?? i });
    });
    return out;
  }

  /** The pad in use now (switching to any other that has something pressed), or null with none. */
  current(): PadState | null {
    const pads = this.all();
    if (!pads.length) {
      this.active = -1;
      return null;
    }
    const busy = pads.find((p) => p.index !== this.active && padActive(p));
    if (busy) this.active = busy.index;
    let s = pads.find((p) => p.index === this.active);
    if (!s) {
      s = pads[0];
      this.active = s.index;
    }
    return s;
  }
}

/** A menu control: a direction or a button. */
export type NavControl = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'start' | 'select' | 'top' | 'leftFace' | 'l1' | 'r1';
export interface NavEvent {
  control: NavControl;
  /** press: just went down; repeat: still held (directions only); release: let go. */
  kind: 'press' | 'repeat' | 'release';
}

/** The stick counts as a direction in menus past this, and lets go under the lower figure. */
export const NAV_DEADZONE = 0.5;
const NAV_RELEASE = 0.35;
/** Held, a direction repeats after this long, then this often (seconds). */
export const NAV_REPEAT_DELAY = 0.4;
export const NAV_REPEAT_EVERY = 0.1;

const NAV_BUTTONS: [NavControl, PadButton][] = [
  // Nintendo's way: A (right) confirms, B (bottom) goes back.
  ['confirm', 'right'],
  ['back', 'bottom'],
  ['start', 'start'],
  ['select', 'select'],
  ['top', 'top'],
  ['leftFace', 'left'],
  ['l1', 'l1'],
  ['r1', 'r1'],
];

/**
 * A pad as menu presses: the D-pad and stick as four directions (a dead
 * zone on the stick, repeating while held), the buttons as presses and
 * releases. Call `update` every frame, racing or not, so a button held
 * across a change of screen isn't taken for a new press.
 */
export class PadNav {
  private readonly down = new Map<NavControl, number>();
  private stick: { x: number; y: number } = { x: 0, y: 0 };
  private index = -1;

  update(s: PadState | null, now: number): NavEvent[] {
    const out: NavEvent[] = [];
    if (!s || s.index !== this.index) {
      for (const c of this.down.keys()) out.push({ control: c, kind: 'release' });
      this.down.clear();
      this.stick = { x: 0, y: 0 };
      this.index = s?.index ?? -1;
      // A pad newly in use: what it holds now is a press.
      if (!s) return out;
    }
    // The stick, with a dead zone and a little hysteresis so it doesn't chatter at the edge.
    const axis = (v: number, was: number) => (Math.abs(v) > NAV_DEADZONE ? Math.sign(v) : was !== 0 && Math.sign(v) === was && Math.abs(v) > NAV_RELEASE ? was : 0);
    // The one direction it points most along.
    const ax = Math.abs(s.stickX) >= Math.abs(s.stickY) ? axis(s.stickX, this.stick.x) : 0;
    const ay = Math.abs(s.stickY) > Math.abs(s.stickX) ? axis(s.stickY, this.stick.y) : 0;
    this.stick = { x: ax, y: ay };
    const want = new Set<NavControl>();
    if (held(s, 'up') || ay < 0) want.add('up');
    if (held(s, 'down') || ay > 0) want.add('down');
    if (held(s, 'dleft') || ax < 0) want.add('left');
    if (held(s, 'dright') || ax > 0) want.add('right');
    for (const [c, b] of NAV_BUTTONS) if (held(s, b)) want.add(c);
    for (const [c, since] of [...this.down]) {
      if (want.has(c)) {
        if (!isDirection(c)) continue;
        // Held: the first repeat after the delay, then steadily.
        if (now - since >= NAV_REPEAT_DELAY) {
          out.push({ control: c, kind: 'repeat' });
          this.down.set(c, now - NAV_REPEAT_DELAY + NAV_REPEAT_EVERY);
        }
      } else {
        this.down.delete(c);
        out.push({ control: c, kind: 'release' });
      }
    }
    for (const c of want) {
      if (this.down.has(c)) continue;
      this.down.set(c, now);
      out.push({ control: c, kind: 'press' });
    }
    return out;
  }
}

export function isDirection(c: NavControl): c is 'up' | 'down' | 'left' | 'right' {
  return c === 'up' || c === 'down' || c === 'left' || c === 'right';
}

/** The key a menu press stands for, where a screen already reads keys (the picker, story cards, skill games). */
export const NAV_KEYS: Partial<Record<NavControl, string>> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  confirm: 'Enter',
  back: 'Backspace',
  start: 'Enter',
  // The picker's dice: a random racer, a random track.
  top: 'KeyR',
  leftFace: 'KeyT',
};

/** What a button is called on a pad of this family, by place. */
const GLYPHS: Record<PadFamily, Record<PadButton | 'dpad' | 'stick', string>> = {
  xbox: { bottom: 'A', right: 'B', left: 'X', top: 'Y', l1: 'LB', r1: 'RB', l2: 'LT', r2: 'RT', select: 'View', start: 'Menu', up: 'Up', down: 'Down', dleft: 'Left', dright: 'Right', dpad: 'D-pad', stick: 'stick' },
  nintendo: { bottom: 'B', right: 'A', left: 'Y', top: 'X', l1: 'L', r1: 'R', l2: 'ZL', r2: 'ZR', select: '−', start: '+', up: 'Up', down: 'Down', dleft: 'Left', dright: 'Right', dpad: 'D-pad', stick: 'stick' },
};

export function glyph(family: PadFamily, b: PadButton | 'dpad' | 'stick'): string {
  return GLYPHS[family][b];
}

/** The race controls in a line or two, as a pad of this family names them. */
export function padControlLines(family: PadFamily): string[] {
  const g = (b: PadButton | 'dpad') => glyph(family, b);
  return [
    `${g('dpad')} (or the stick) steers; ${g('r1')} or ${g('r2')} hops, hold it while turning to drift`,
    `${g('l1')} or ${g('l2')} fires your item, ${g('bottom')} brakes and reverses, ${g('top')} or ${g('select')} looks back (the kart accelerates by itself; ${g('right')} too)`,
    `${g('start')} pauses; in menus ${g('dpad')} moves, ${g('right')} picks, ${g('bottom')} goes back`,
    `Gliding? ${g('dpad')} up climbs, down dives`,
  ];
}
