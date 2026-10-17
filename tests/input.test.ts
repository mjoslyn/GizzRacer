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
