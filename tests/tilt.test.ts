import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { InputManager } from '../src/core/input';

type Listener = (e: { beta: number | null; gamma: number | null }) => void;
let listener: Listener = () => {};
let TiltSteering: typeof import('../src/ui/tilt').TiltSteering;

const D = Math.PI / 180;
/** The browser's beta and gamma (ZXY, gamma in [-90, 90)) for a phone in landscape, tipped back `tip` from upright and turned like a wheel by `wheel`. */
function reading(tip: number, wheel: number, side: 1 | -1): { beta: number; gamma: number } {
  // The way up in the phone's axes: screen up is its right side (+x) at 90, its left at 270.
  const t = tip * D;
  const w = wheel * D;
  const ux = side * Math.cos(t) * Math.cos(w);
  const uy = -side * Math.cos(t) * Math.sin(w);
  const uz = Math.sin(t);
  let beta = Math.asin(uy);
  if (uz < 0) beta = (beta < 0 ? -Math.PI : Math.PI) - beta;
  const gamma = Math.atan2(-ux / Math.cos(beta), uz / Math.cos(beta));
  return { beta: beta / D, gamma: gamma / D };
}

beforeAll(async () => {
  vi.stubGlobal('window', { addEventListener: (_: string, f: Listener) => (listener = f), DeviceOrientationEvent: class {} });
  vi.stubGlobal('DeviceOrientationEvent', class {});
  vi.stubGlobal('navigator', { maxTouchPoints: 5 });
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.stubGlobal('screen', { orientation: { angle: 90 } });
  ({ TiltSteering } = await import('../src/ui/tilt'));
});

describe('tilt steering', () => {
  it('steers the same way whichever side of upright the phone is held', async () => {
    for (const side of [1, -1] as const) {
      (globalThis as unknown as { screen: { orientation: { angle: number } } }).screen.orientation.angle = side === 1 ? 90 : 270;
      const steers: number[] = [];
      for (const tip of [30, 4, -4, -20]) {
        const input = { touch: { tilt: 0, tiltPitch: 0 } } as unknown as InputManager;
        const tilt = new TiltSteering(input, () => 30);
        listener(reading(tip, 0, side));
        expect(await tilt.start()).toBe(true);
        listener(reading(tip, 0, side));
        listener(reading(tip, 15, side));
        steers.push(input.touch.tilt);
        // Tipping back from there climbs, smoothly through upright.
        listener(reading(tip + 15, 0, side));
        expect(input.touch.tiltPitch).toBeLessThan(0);
      }
      expect(steers.every((s) => Math.abs(s - steers[0]) < 0.02 && Math.abs(s) > 0.3)).toBe(true);
    }
  });
});
