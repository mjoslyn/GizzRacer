import { describe, expect, it } from 'vitest';
import { NAV_REPEAT_DELAY, NAV_REPEAT_EVERY, PadNav, PadTracker, glyph, padFamily, padRace, readHat, readPad, type NavEvent } from '../src/core/gamepad';
import { InputManager } from '../src/core/input';
import { Keyboard, SeatInput } from '../src/core/seatInput';
import { pickNext, spell } from '../src/ui/padNav';

/** A fake Gamepad: `held` lists button indices held (or [index, value] for a trigger's travel). */
function fakePad(o: { index?: number; id?: string; mapping?: string; held?: (number | [number, number])[]; axes?: number[]; buttons?: number; connected?: boolean } = {}): Gamepad {
  const n = o.buttons ?? 17;
  const values = new Map<number, number>();
  for (const h of o.held ?? []) {
    if (Array.isArray(h)) values.set(h[0], h[1]);
    else values.set(h, 1);
  }
  return {
    index: o.index ?? 0,
    id: o.id ?? 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
    mapping: o.mapping ?? 'standard',
    connected: o.connected ?? true,
    axes: o.axes ?? [0, 0, 0, 0],
    buttons: Array.from({ length: n }, (_, i) => {
      const v = values.get(i) ?? 0;
      return { pressed: v > 0.1, value: v, touched: v > 0 };
    }),
    timestamp: 0,
    hapticActuators: [],
    vibrationActuator: null,
  } as unknown as Gamepad;
}

const SN30_DINPUT = '8BitDo SN30 Pro (Vendor: 2dc8 Product: 6101)';
const ZERO2 = '8BitDo Zero 2 gamepad (Vendor: 2dc8 Product: 9018)';
/** Chrome's D-input hat on axis 9: up is -1, right -3/7, down 1/7, left 5/7; it rests at 9/7. */
const HAT = { up: -1, right: -3 / 7, down: 1 / 7, left: 5 / 7, rest: 9 / 7 };
const hatAxes = (v: number) => [0, 0, 0, 0, 0, 0, 0, 0, 0, v];

describe('reading a pad by place', () => {
  it('standard mapping: bottom 0, right 1, left 2, top 3, the shoulders, Start, the D-pad buttons', () => {
    const s = readPad(fakePad({ held: [0, 3, 5, 9, 14] }))!;
    expect(s.buttons.bottom).toBe(1);
    expect(s.buttons.top).toBe(1);
    expect(s.buttons.r1).toBe(1);
    expect(s.buttons.start).toBe(1);
    expect(s.buttons.dleft).toBe(1);
    expect(s.buttons.right).toBe(0);
    expect(s.standard).toBe(true);
  });

  it('an 8BitDo in D-input: its own button numbers, the D-pad on the hat', () => {
    // B (bottom) is button 1, A (right) 0, Y (left) 4, X (top) 3, L 6, R 7, Select 10, Start 11.
    const s = readPad(fakePad({ id: SN30_DINPUT, mapping: '', held: [1, 7, 11], axes: hatAxes(HAT.right) }))!;
    expect(s.buttons.bottom).toBe(1);
    expect(s.buttons.r1).toBe(1);
    expect(s.buttons.start).toBe(1);
    expect(s.buttons.right).toBe(0);
    expect(s.buttons.dright).toBe(1);
    expect(s.buttons.up).toBe(0);
    const t = readPad(fakePad({ id: SN30_DINPUT, mapping: '', held: [0, 4, 3, 6, 10], axes: hatAxes(HAT.rest) }))!;
    expect([t.buttons.right, t.buttons.left, t.buttons.top, t.buttons.l1, t.buttons.select]).toEqual([1, 1, 1, 1, 1]);
    expect(t.buttons.dright + t.buttons.dleft + t.buttons.up + t.buttons.down).toBe(0);
  });

  it('the hat: eight directions, rest anywhere off the steps (9/7, or 0)', () => {
    expect(readHat(HAT.up)).toEqual([0, -1]);
    expect(readHat(HAT.down)).toEqual([0, 1]);
    expect(readHat(HAT.left)).toEqual([-1, 0]);
    expect(readHat(-5 / 7)).toEqual([1, -1]);
    expect(readHat(HAT.rest)).toEqual([0, 0]);
    expect(readHat(0)).toEqual([0, 0]);
    expect(readHat(undefined)).toEqual([0, 0]);
  });

  it("Nintendo's letters by place for every pad, Xbox's only for a pad that says Xbox or X-input and isn't an 8BitDo", () => {
    expect(padFamily(SN30_DINPUT)).toBe('nintendo');
    expect(padFamily('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toBe('nintendo');
    expect(padFamily('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c)')).toBe('nintendo');
    expect(padFamily('Generic USB Joystick')).toBe('nintendo');
    expect(padFamily('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toBe('xbox');
    expect(padFamily('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
    expect(padFamily('8BitDo Pro 2 (XInput STANDARD GAMEPAD Vendor: 2dc8)')).toBe('nintendo');
    expect([glyph('nintendo', 'bottom'), glyph('nintendo', 'right'), glyph('nintendo', 'left'), glyph('nintendo', 'top')]).toEqual(['B', 'A', 'Y', 'X']);
    expect([glyph('nintendo', 'l1'), glyph('nintendo', 'r1'), glyph('nintendo', 'l2'), glyph('nintendo', 'r2'), glyph('nintendo', 'select'), glyph('nintendo', 'start')]).toEqual(['L', 'R', 'ZL', 'ZR', '−', '+']);
    expect([glyph('xbox', 'bottom'), glyph('xbox', 'right'), glyph('xbox', 'left'), glyph('xbox', 'top')]).toEqual(['A', 'B', 'X', 'Y']);
  });

  it('an empty slot or a pad gone reads as none', () => {
    expect(readPad(null)).toBeNull();
    expect(readPad(fakePad({ connected: false }))).toBeNull();
  });
});

describe('the race map', () => {
  it("Mario Kart 8 Deluxe's map: D-pad steers, A and Y accelerate, B brakes, R/ZR hop, L/ZL item, X and Minus look back, Plus pauses", () => {
    // Standard positions: 0 B (bottom), 1 A (right), 2 Y (left), 3 X (top), 4/5 L/R, 6/7 ZL/ZR, 8 Minus, 9 Plus.
    const r = (held: number[]) => padRace(readPad(fakePad({ held }))!);
    expect(r([15]).steer).toBe(1);
    expect(r([14]).steer).toBe(-1);
    expect(r([1]).accelerate).toBe(true);
    expect(r([2]).accelerate).toBe(true);
    expect(r([0]).brake).toBe(1);
    expect(r([5]).drift).toBe(true);
    expect(r([7]).drift).toBe(true);
    expect(r([4]).item).toBe(true);
    expect(r([6]).item).toBe(true);
    expect(r([3]).lookBack).toBe(true);
    expect(r([8]).lookBack).toBe(true);
    expect(r([9]).pause).toBe(true);
    // A isn't a hop or an item, nor B a hop.
    expect([r([1]).drift, r([1]).item, r([0]).drift]).toEqual([false, false, false]);
    const idle = r([]);
    expect([idle.steer, idle.brake, idle.accelerate, idle.drift, idle.item]).toEqual([0, 0, false, false, false]);
  });

  it('the same map by place on an 8BitDo in D-input (B1 B, B0 A, B4 Y, B3 X, L B6, R B7, ZL B8, ZR B9, Minus B10, Plus B11)', () => {
    const r = (held: number[]) => padRace(readPad(fakePad({ id: SN30_DINPUT, mapping: '', held, axes: hatAxes(HAT.rest) }))!);
    expect(r([1]).brake).toBe(1);
    expect(r([0]).accelerate).toBe(true);
    expect(r([4]).accelerate).toBe(true);
    expect(r([3]).lookBack).toBe(true);
    expect(r([6]).item).toBe(true);
    expect(r([8]).item).toBe(true);
    expect(r([7]).drift).toBe(true);
    expect(r([9]).drift).toBe(true);
    expect(r([10]).lookBack).toBe(true);
    expect(r([11]).pause).toBe(true);
  });

  it('a Switch Pro (or an 8BitDo in Switch mode) with no standard mapping reads by the same places', () => {
    const r = (held: number[]) => padRace(readPad(fakePad({ id: 'Pro Controller (Vendor: 057e Product: 2009)', mapping: '', held, axes: hatAxes(HAT.down) }))!);
    expect(r([0]).brake).toBe(1);
    expect(r([1]).accelerate).toBe(true);
    expect(r([5]).drift).toBe(true);
    expect(r([4]).item).toBe(true);
    expect(r([]).pitch).toBe(-1);
  });

  it('a stick where there is one: steers past its dead zone; up and down pitch the glider past a wider one', () => {
    const s = (axes: number[]) => padRace(readPad(fakePad({ axes }))!);
    expect(s([0.1, 0]).steer).toBe(0);
    expect(s([1, 0]).steer).toBeCloseTo(1);
    expect(s([-0.575, 0]).steer).toBeCloseTo(-0.5);
    expect(s([0.3, -0.3]).pitch).toBe(0);
    expect(s([0, -1]).pitch).toBeCloseTo(1);
  });

  it("the Zero 2's D-pad on axes 0 and 1 steers and climbs; its R hops and L fires", () => {
    const right = padRace(readPad(fakePad({ id: ZERO2, mapping: '', axes: [1, 0], buttons: 12, held: [7] }))!);
    expect(right.steer).toBe(1);
    expect(right.drift).toBe(true);
    const up = padRace(readPad(fakePad({ id: ZERO2, mapping: '', axes: [0, -1], buttons: 12, held: [6] }))!);
    expect(up.pitch).toBe(1);
    expect(up.item).toBe(true);
  });

  it('InputManager drives from a pad at any index, gaps and all, and follows the one last used', () => {
    let pads: (Gamepad | null)[] = [null, null, fakePad({ index: 2, held: [15] })];
    const input = new InputManager(new EventTarget() as unknown as Window, new PadTracker(() => pads));
    expect(input.sample().steer).toBe(1);
    // A second pad pressed takes over.
    pads = [fakePad({ index: 0, held: [14] }), null, fakePad({ index: 2 })];
    expect(input.sample().steer).toBe(-1);
    // A hop edge (R), and B's brake stops the throttle.
    pads = [fakePad({ index: 0, held: [5, 0] }), null, fakePad({ index: 2 })];
    const f = input.sample();
    expect(f.driftPressed).toBe(true);
    expect(f.brake).toBe(1);
    expect(f.throttle).toBe(0);
  });

  it('hot-plug: a pad connecting mid-race is picked up, and one unplugged is let go', () => {
    let pads: (Gamepad | null)[] = [];
    const input = new InputManager(new EventTarget() as unknown as Window, new PadTracker(() => pads));
    expect(input.sample().steer).toBe(0);
    pads = [null, fakePad({ index: 1, id: SN30_DINPUT, mapping: '', axes: hatAxes(HAT.left) })];
    expect(input.sample().steer).toBe(-1);
    expect(input.pads.active).toBe(1);
    pads = [null, null];
    expect(input.sample().steer).toBe(0);
    expect(input.pads.active).toBe(-1);
  });

  it('Start pauses once per press from whichever pad is in use', () => {
    let pads: (Gamepad | null)[] = [null, fakePad({ index: 1, held: [9] })];
    const input = new InputManager(new EventTarget() as unknown as Window, new PadTracker(() => pads));
    expect(input.consumePause()).toBe(true);
    expect(input.consumePause()).toBe(false);
    pads = [null, fakePad({ index: 1 })];
    expect(input.consumePause()).toBe(false);
    pads = [null, fakePad({ index: 1, held: [9] })];
    expect(input.consumePause()).toBe(true);
  });

  it('a Party seat drives an 8BitDo in D-input by its index', () => {
    const keys = new Keyboard(new EventTarget() as unknown as Window);
    // Its L is button 6, its B button 1.
    const pad = fakePad({ index: 3, id: SN30_DINPUT, mapping: '', held: [6, 1], axes: hatAxes(HAT.right) });
    const seat = new SeatInput({ kind: 'pad', index: 3 }, keys, () => null, () => [null, null, null, pad]);
    const f = seat.sample();
    expect(f.steer).toBe(1);
    expect(f.itemPressed).toBe(true);
    expect(f.brake).toBe(1);
    expect(f.drift).toBe(false);
  });
});

describe('menu navigation from a pad', () => {
  const nav = () => new PadNav();
  const presses = (evs: NavEvent[]) => evs.filter((e) => e.kind !== 'release').map((e) => `${e.control}:${e.kind}`);

  it('a D-pad press is one press; held, it repeats after the delay, then steadily; let go, a release', () => {
    const n = nav();
    const held = readPad(fakePad({ held: [13] }));
    expect(presses(n.update(held, 0))).toEqual(['down:press']);
    expect(presses(n.update(held, 0.2))).toEqual([]);
    expect(presses(n.update(held, NAV_REPEAT_DELAY + 0.01))).toEqual(['down:repeat']);
    expect(presses(n.update(held, NAV_REPEAT_DELAY + 0.05))).toEqual([]);
    expect(presses(n.update(held, NAV_REPEAT_DELAY + NAV_REPEAT_EVERY + 0.02))).toEqual(['down:repeat']);
    expect(n.update(readPad(fakePad()), 1)).toEqual([{ control: 'down', kind: 'release' }]);
  });

  it('the stick has a dead zone, and moves along whichever way it points most', () => {
    const n = nav();
    expect(presses(n.update(readPad(fakePad({ axes: [0.3, 0.2] })), 0))).toEqual([]);
    expect(presses(n.update(readPad(fakePad({ axes: [0.8, 0.3] })), 0.1))).toEqual(['right:press']);
    // Easing back a little (hysteresis) isn't a new press.
    expect(presses(n.update(readPad(fakePad({ axes: [0.45, 0.1] })), 0.2))).toEqual([]);
    expect(n.update(readPad(fakePad({ axes: [0.1, 0] })), 0.3)).toEqual([{ control: 'right', kind: 'release' }]);
    expect(presses(n.update(readPad(fakePad({ axes: [0.2, -0.9] })), 0.4))).toEqual(['up:press']);
  });

  it("Nintendo's way: A (right, 1) confirms, B (bottom, 0) goes back, Plus is Start; buttons never repeat", () => {
    const n = nav();
    expect(presses(n.update(readPad(fakePad({ held: [1] })), 0))).toEqual(['confirm:press']);
    expect(presses(n.update(readPad(fakePad({ held: [1] })), 2))).toEqual([]);
    n.update(readPad(fakePad()), 2.1);
    expect(presses(n.update(readPad(fakePad({ held: [0] })), 2.2))).toEqual(['back:press']);
    n.update(readPad(fakePad()), 2.25);
    expect(presses(n.update(readPad(fakePad({ held: [9] })), 2.3))).toEqual(['start:press']);
  });

  it('by place on an 8BitDo in D-input: A (right, button 0) confirms, B (bottom, button 1) goes back, the hat moves', () => {
    const n = nav();
    const pad = (held: number[], hat = HAT.rest) => readPad(fakePad({ id: SN30_DINPUT, mapping: '', held, axes: hatAxes(hat) }));
    expect(presses(n.update(pad([0]), 0))).toEqual(['confirm:press']);
    n.update(pad([]), 0.1);
    expect(presses(n.update(pad([1]), 0.2))).toEqual(['back:press']);
    n.update(pad([]), 0.3);
    expect(presses(n.update(pad([], HAT.up), 0.4))).toEqual(['up:press']);
  });

  it("a Zero 2's D-pad-only report moves the menus", () => {
    const n = nav();
    expect(presses(n.update(readPad(fakePad({ id: ZERO2, mapping: '', axes: [-1, 0], buttons: 12 })), 0))).toEqual(['left:press']);
  });

  it('a pad unplugged lets go of everything it held; a button held across a change of screen is no new press', () => {
    const n = nav();
    n.update(readPad(fakePad({ held: [1, 12] })), 0);
    expect(n.update(null, 0.1).map((e) => `${e.control}:${e.kind}`).sort()).toEqual(['confirm:release', 'up:release']);
    const m = nav();
    m.update(readPad(fakePad({ held: [0] })), 0);
    // Still held next frame (on a new screen): nothing.
    expect(m.update(readPad(fakePad({ held: [0] })), 0.5)).toEqual([]);
  });

  it('the tracker follows the pad last pressed, at any index, past gaps', () => {
    let pads: (Gamepad | null)[] = [null, fakePad({ index: 1 }), null, fakePad({ index: 3 })];
    const t = new PadTracker(() => pads);
    expect(t.current()?.index).toBe(1);
    pads = [null, fakePad({ index: 1 }), null, fakePad({ index: 3, held: [0] })];
    expect(t.current()?.index).toBe(3);
    pads = [null, fakePad({ index: 1 }), null, fakePad({ index: 3 })];
    expect(t.current()?.index).toBe(3);
    pads = [null, fakePad({ index: 1 })];
    expect(t.current()?.index).toBe(1);
  });
});

describe('the highlight on screens of buttons', () => {
  // Two columns of buttons and one wide one under them.
  const r = (x: number, y: number, w = 100, h = 30) => ({ x, y, w, h });
  const from = r(0, 0);
  const cands = [r(120, 0), r(0, 50), r(120, 50), r(0, 100, 220)];

  it('moves to the nearest button that way, straight across beating nearer ones off to the side', () => {
    expect(pickNext(from, cands, 'right')).toBe(0);
    expect(pickNext(from, cands, 'down')).toBe(1);
    expect(pickNext(r(120, 50), [from, ...cands], 'down')).toBe(4);
    expect(pickNext(from, cands, 'up')).toBe(-1);
    expect(pickNext(from, cands, 'left')).toBe(-1);
  });

  it('spells a name or a room code: up and down change the last letter, right adds one, left takes one off', () => {
    expect(spell('', 'up')).toBe('A');
    expect(spell('A', 'up')).toBe('B');
    expect(spell('AB', 'down')).toBe('AA');
    expect(spell('AA', 'right')).toBe('AAA');
    expect(spell('AAA', 'left')).toBe('AA');
    expect(spell('', 'left')).toBeNull();
    expect(spell('ABCD', 'right', 4)).toBe('ABCD');
    expect(spell('Z', 'up')).toBe('0');
  });
});
