import { describe, expect, it } from 'vitest';
import { Keyboard, SeatInput, remotePad } from '../src/core/seatInput';
import { seatPan, splitFov, splitRects } from '../src/render/split';

const press = (target: EventTarget, code: string, type = 'keydown') => {
  const e = new Event(type) as Event & { code: string; repeat: boolean };
  e.code = code;
  e.repeat = false;
  target.dispatchEvent(e);
};

describe('split screen', () => {
  it('one player has the whole screen, two sit side by side, three and four take quarters', () => {
    expect(splitRects(1, 1280, 720)).toEqual([{ x: 0, y: 0, w: 1280, h: 720 }]);
    expect(splitRects(2, 1280, 720)).toEqual([
      { x: 0, y: 0, w: 640, h: 720 },
      { x: 640, y: 0, w: 640, h: 720 },
    ]);
    expect(splitRects(3, 1280, 720)).toHaveLength(3);
    const four = splitRects(4, 1281, 721);
    // The parts cover the screen exactly, odd sizes too.
    expect(four.reduce((a, r) => a + r.w * r.h, 0)).toBe(1281 * 721);
    expect(four[3]).toEqual({ x: 640, y: 360, w: 641, h: 361 });
  });

  it('a wide, short view narrows its field of view to see as far to the sides as the full screen; a narrow one keeps it', () => {
    expect(splitFov(78, 16 / 9)).toBeCloseTo(78);
    expect(splitFov(78, 8 / 9)).toBe(78);
    const wide = splitFov(78, 32 / 9);
    const side = (fov: number, aspect: number) => Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
    expect(side(wide, 32 / 9)).toBeCloseTo(side(78, 16 / 9));
  });

  it("each player's sounds lean to their side; alone, they're centred", () => {
    expect(seatPan(0, 1)).toBe(0);
    expect(seatPan(0, 2)).toBeLessThan(0);
    expect(seatPan(1, 2)).toBeGreaterThan(0);
    expect([0, 1, 2, 3].map((i) => Math.sign(seatPan(i, 4)))).toEqual([-1, 1, -1, 1]);
  });
});

describe('party seats', () => {
  it('the two halves of the keyboard drive two karts apart', () => {
    const target = new EventTarget();
    const keys = new Keyboard(target as unknown as Window);
    const left = new SeatInput({ kind: 'keys', side: 'left' }, keys);
    const right = new SeatInput({ kind: 'keys', side: 'right' }, keys);
    press(target, 'KeyA');
    press(target, 'ShiftRight');
    const l = left.sample();
    const r = right.sample();
    keys.endTick();
    expect(l.steer).toBe(-1);
    expect(l.drift).toBe(false);
    expect(r.steer).toBe(0);
    expect(r.driftPressed).toBe(true);
    expect(right.sample().driftPressed).toBe(false);
  });

  it("a tap between ticks still lands: a key pressed and let go before the sample, or a phone's tap", () => {
    const target = new EventTarget();
    const keys = new Keyboard(target as unknown as Window);
    const left = new SeatInput({ kind: 'keys', side: 'left' }, keys);
    press(target, 'KeyE');
    press(target, 'KeyE', 'keyup');
    expect(left.sample().itemPressed).toBe(true);
    keys.endTick();
    expect(left.sample().item).toBe(false);

    const pad = remotePad();
    const phone = new SeatInput({ kind: 'remote', id: 'x' }, keys, () => pad);
    pad.driftTap = true;
    expect(phone.sample().driftPressed).toBe(true);
    expect(phone.sample().drift).toBe(false);
    pad.steer = 0.5;
    pad.brake = true;
    const held = phone.sample();
    expect(held.steer).toBe(0.5);
    expect(held.throttle).toBe(0);
  });

  it('a gamepad drives by its own index', () => {
    const keys = new Keyboard(new EventTarget() as unknown as Window);
    const button = (pressed: boolean) => ({ pressed, value: pressed ? 1 : 0, touched: pressed });
    const pad = { connected: true, axes: [0.8, 0], buttons: Array.from({ length: 16 }, (_, i) => button(i === 5)) } as unknown as Gamepad;
    const seat = new SeatInput({ kind: 'pad', index: 1 }, keys, () => null, () => [null, pad]);
    const f = seat.sample();
    expect(f.steer).toBeGreaterThan(0.7);
    expect(f.driftPressed).toBe(true);
    const other = new SeatInput({ kind: 'pad', index: 0 }, keys, () => null, () => [null, pad]);
    expect(other.sample().steer).toBe(0);
  });
});
