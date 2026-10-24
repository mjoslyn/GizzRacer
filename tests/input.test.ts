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

  it('up fires the item on the road; with the glider open, up and down climb and dive instead', () => {
    const target = new EventTarget();
    const input = new InputManager(target as unknown as Window);
    press(target, 'ArrowUp');
    const road = input.sample();
    expect(road.itemPressed).toBe(true);
    expect(road.pitch).toBe(0);
    expect(road.throttle).toBe(1);
    press(target, 'ArrowUp', 'keyup');
    input.sample();
    input.gliding = true;
    press(target, 'KeyW');
    const air = input.sample();
    expect(air.pitch).toBe(1);
    expect(air.item).toBe(false);
    press(target, 'KeyW', 'keyup');
    press(target, 'KeyS');
    const down = input.sample();
    expect(down.pitch).toBe(-1);
    expect(down.brake).toBe(1);
    expect(down.throttle).toBe(0);
  });

  it('landing with up still held from the climb fires nothing until up is pressed again', () => {
    const target = new EventTarget();
    const input = new InputManager(target as unknown as Window);
    input.gliding = true;
    press(target, 'ArrowUp');
    expect(input.sample().pitch).toBe(1);
    input.gliding = false;
    expect(input.sample().item).toBe(false);
    press(target, 'ArrowUp', 'keyup');
    input.sample();
    press(target, 'ArrowUp');
    expect(input.sample().itemPressed).toBe(true);
  });

  it('E fires the item, glider or not', () => {
    const target = new EventTarget();
    const input = new InputManager(target as unknown as Window);
    input.gliding = true;
    press(target, 'KeyE');
    expect(input.sample().itemPressed).toBe(true);
  });

  it('a drag up or down the touch pad pitches it', () => {
    const input = new InputManager(new EventTarget() as unknown as Window);
    input.touch.pitch = 0.8;
    expect(input.sample().pitch).toBeCloseTo(0.8, 5);
  });
});
