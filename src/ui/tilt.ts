import type { InputManager } from '../core/input';
import { settings } from '../core/settings';

const DEADZONE = 2.5;

interface PermissionCapable {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/**
 * Tilt steering for phones held in landscape: turning the phone like a
 * wheel shows up in the orientation's beta angle, signed by which way the
 * screen is rotated. Steering is relative to how the phone was held at the
 * last recentre (each race start, or the Settings button).
 */
export class TiltSteering {
  private neutral: number | null = null;
  private active = false;
  /** A real reading has arrived (desktops send none, or one with nulls). */
  private sensed = false;

  constructor(private readonly input: InputManager) {
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
    const touch = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
    const asksPermission = typeof (DeviceOrientationEvent as unknown as PermissionCapable).requestPermission === 'function';
    return touch && (this.sensed || asksPermission);
  }

  /**
   * Turns tilt on. Call from a tap: iPhones ask for motion permission once.
   * Resolves false if the sensor isn't available or permission was refused.
   */
  async start(): Promise<boolean> {
    if (!this.available) return false;
    const api = DeviceOrientationEvent as unknown as PermissionCapable;
    if (api.requestPermission) {
      try {
        if ((await api.requestPermission()) !== 'granted') return false;
      } catch {
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
    this.input.touch.tilt = 0;
  }

  /** The current hold becomes straight ahead. */
  recenter(): void {
    this.neutral = null;
  }

  private orientation(e: DeviceOrientationEvent): void {
    if (!this.active || e.beta === null) return;
    const angle = screen.orientation?.angle ?? Number((window as Window & { orientation?: number }).orientation ?? 0);
    // Landscape only: which end of the phone is "up" flips the sign.
    const side = angle === 90 ? 1 : angle === 270 || angle === -90 ? -1 : 0;
    if (side === 0) {
      this.input.touch.tilt = 0;
      return;
    }
    if (this.neutral === null) this.neutral = e.beta;
    let d = e.beta - this.neutral;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    const mag = Math.max(0, Math.abs(d) - DEADZONE);
    const s = settings();
    const steer = (Math.sign(d) * mag * side * (s.tiltInvert ? -1 : 1)) / s.tiltRange;
    this.input.touch.tilt = Math.max(-1, Math.min(1, steer));
  }
}
