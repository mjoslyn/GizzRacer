import type { InputManager } from '../core/input';
import { settings } from '../core/settings';

const DEADZONE = 2.5;
/** Tipping the phone forward or back pitches the glider: degrees ignored (a wheel turned never quite stays upright), and degrees past them for a full dive or climb. */
const PITCH_DEADZONE = 8;
const PITCH_RANGE = 18;
const DEG = Math.PI / 180;

interface PermissionCapable {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/**
 * Tilt steering for phones held in landscape: turning the phone like a
 * wheel turns the way up round the screen's face, signed by which way the
 * screen is rotated. Steering is relative to how the phone was held at the
 * last recentre (each race start, or the Settings button). Tipping the
 * phone forward or back pitches the glider: forward dives, back climbs.
 *
 * Both come from the way up in the phone's own axes, not straight from
 * the beta and gamma angles: held near upright those flip (beta by 180)
 * as the phone passes vertical, and a recentre caught on the far side
 * steered backwards for the whole race.
 */
export class TiltSteering {
  private neutral: number | null = null;
  /** The forward tilt at the last recentre. */
  private neutralPitch: number | null = null;
  private active = false;
  /** A real reading has arrived (desktops send none, or one with nulls). */
  private sensed = false;

  constructor(
    private readonly input: InputManager,
    /** Degrees of turn for full lock, if not Settings' (the phone controller has its own). */
    private readonly range: (() => number) | null = null,
  ) {
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta !== null) this.sensed = true;
      this.orientation(e);
    });
  }

  /**
   * Whether this device can steer by tilt: a touch device that has sent an
   * orientation reading, or an iPhone/iPad (they only send readings once
   * motion permission is granted, so the permission API is the tell).
   */
  get available(): boolean {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return false;
    const asksPermission = typeof (DeviceOrientationEvent as unknown as PermissionCapable).requestPermission === 'function';
    return this.touchDevice && (this.sensed || asksPermission);
  }

  /** A phone or tablet: steered by the on-screen pad, or by tilt where there's a sensor. */
  get touchDevice(): boolean {
    return navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  }

  /** A permission ask still open: taps while it's up share it rather than asking again. */
  private starting: Promise<boolean> | null = null;

  /**
   * Turns tilt on. Call from a tap (touchend or click: iOS doesn't count a
   * pointerdown): iPhones ask for motion permission until it's granted.
   * Resolves false if the sensor isn't available or permission was refused.
   */
  start(): Promise<boolean> {
    if (this.active) return Promise.resolve(true);
    return (this.starting ??= this.ask().finally(() => (this.starting = null)));
  }

  private async ask(): Promise<boolean> {
    if (!this.available) return false;
    const api = DeviceOrientationEvent as unknown as PermissionCapable;
    if (api.requestPermission) {
      try {
        if ((await api.requestPermission()) !== 'granted') return false;
      } catch {
        // Not from a tap: the next one asks again.
        return false;
      }
    }
    this.active = true;
    this.recenter();
    return true;
  }

  get running(): boolean {
    return this.active;
  }

  stop(): void {
    this.active = false;
    this.input.touch.tilt = this.input.touch.tiltPitch = 0;
  }

  /** The current hold becomes straight ahead. */
  recenter(): void {
    this.neutral = null;
    this.neutralPitch = null;
  }

  private orientation(e: DeviceOrientationEvent): void {
    if (!this.active || e.beta === null || e.gamma === null) return;
    const angle = screen.orientation?.angle ?? Number((window as Window & { orientation?: number }).orientation ?? 0);
    // Landscape only: which end of the phone is "up" flips the sign.
    const side = angle === 90 ? 1 : angle === 270 || angle === -90 ? -1 : 0;
    if (side === 0) {
      this.input.touch.tilt = this.input.touch.tiltPitch = 0;
      return;
    }
    // The way up in the phone's axes (x to its right, y to its top, z out of the screen), from the angles (ZXY order).
    const b = e.beta * DEG;
    const g = e.gamma * DEG;
    const ux = -Math.sin(g) * Math.cos(b);
    const uy = Math.sin(b);
    const uz = Math.cos(g) * Math.cos(b);
    // The wheel: how far up has turned from the screen's top edge (the phone's right side, or its left, by the rotation).
    const wheel = Math.atan2(uy, side * ux) / DEG;
    if (this.neutral === null) this.neutral = wheel;
    let d = wheel - this.neutral;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    const mag = Math.max(0, Math.abs(d) - DEADZONE);
    const s = settings();
    const steer = (Math.sign(d) * mag * side * (s.tiltInvert ? -1 : 1)) / (this.range?.() ?? s.tiltRange);
    this.input.touch.tilt = Math.max(-1, Math.min(1, steer));
    // Tipped back: how far up leans out of the screen, smooth through upright.
    this.input.touch.tiltPitch = this.pitchFrom(Math.asin(Math.max(-1, Math.min(1, uz))) / DEG);
  }

  /** The glider's pitch from the forward tilt: the phone's top edge tipped away dives (-1), towards you climbs (1). */
  private pitchFrom(tip: number): number {
    if (this.neutralPitch === null) this.neutralPitch = tip;
    const forward = tip - this.neutralPitch;
    const mag = Math.max(0, Math.abs(forward) - PITCH_DEADZONE);
    return Math.max(-1, Math.min(1, (-Math.sign(forward) * mag) / PITCH_RANGE));
  }
}
