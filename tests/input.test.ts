import { describe, expect, it } from 'vitest';
import { InputManager } from '../src/core/input';

describe('touch input', () => {
  it('a screen tap is one tick of hop, with no drift held after it', () => {
    const input = new InputManager(new EventTarget() as unknown as Window);
    input.pressHop();
    const tap = input.sample();
    expect(tap.driftPressed).toBe(true);
    const after = input.sample();
    expect(after.drift).toBe(false);
    expect(after.driftPressed).toBe(false);
  });
});

describe('glider pitch', () => {
  const press = (target: EventTarget, code: string, type = 'keydown') => {
    const e = new Event(type) as Event & { code: string; repeat: boolean };
    e.code = code;
    e.repeat = false;
    target.dispatchEvent(e);
  };

  it('up and down pitch the glider; accelerating by hand, up stays the throttle', () => {
    const target = new EventTarget();
    const input = new InputManager(target as unknown as Window);
    press(target, 'ArrowUp');
    expect(input.sample().pitch).toBe(1);
    press(target, 'ArrowUp', 'keyup');
    press(target, 'KeyS');
    const down = input.sample();
    expect(down.pitch).toBe(-1);
    expect(down.brake).toBe(1);
    press(target, 'KeyS', 'keyup');
    input.autoAccelerate = false;
    press(target, 'KeyW');
    const manual = input.sample();
    expect(manual.throttle).toBe(1);
    expect(manual.pitch).toBe(0);
  });

  it('a drag up or down the touch pad pitches it', () => {
    const input = new InputManager(new EventTarget() as unknown as Window);
    input.touch.pitch = 0.8;
    expect(input.sample().pitch).toBeCloseTo(0.8, 5);
  });
});
