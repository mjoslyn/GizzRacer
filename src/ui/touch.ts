import type { InputManager } from '../core/input';

/** Pixels of horizontal drag for full steering lock. */
const STEER_RANGE = 70;
/** A touch on the steering side that lets go this quickly, without dragging, is a tap: a hop. */
const TAP_TIME = 220;
const TAP_SLOP = 14;

/**
 * On-screen controls for phones and tablets: drag anywhere on the left
 * half to steer (analog), hold DRIFT or BRAKE on the right, tap ITEM to
 * fire, and tap the screen anywhere else to hop (at a ramp lip, that's a
 * trick). Acceleration is automatic. Shown once the first touch arrives.
 */
export class TouchControls {
  private readonly el = document.createElement('div');
  private readonly knob: HTMLElement;
  private readonly pad: HTMLElement;
  private steerId: number | null = null;
  private steerOrigin = 0;
  /** Where and when the steering touch began, to tell a tap from a drag. */
  private steerStart = { x: 0, y: 0, at: 0, moved: false };
  enabled = false;

  constructor(
    parent: HTMLElement,
    private readonly input: InputManager,
    onPause: () => void,
  ) {
    this.el.className = 'touch';
    this.el.innerHTML = `
      <div class="touch-tap"></div>
      <div class="touch-steer"><div class="touch-pad"><div class="touch-knob"></div></div></div>
      <button class="touch-btn touch-drift" data-act="drift">DRIFT</button>
      <button class="touch-btn touch-brake" data-act="brake">BRAKE</button>
      <button class="touch-btn touch-item" data-act="item">ITEM</button>
      <button class="touch-pause" aria-label="pause">II</button>`;
    parent.appendChild(this.el);
    this.pad = this.el.querySelector('.touch-pad')!;
    this.knob = this.el.querySelector('.touch-knob')!;

    // Anywhere that isn't the steering side or a button: a tap hops, the moment the finger lands.
    this.el.querySelector<HTMLElement>('.touch-tap')!.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.pressHop();
    });

    const zone = this.el.querySelector<HTMLElement>('.touch-steer')!;
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.steerId = e.pointerId;
      this.steerOrigin = e.clientX;
      this.steerStart = { x: e.clientX, y: e.clientY, at: performance.now(), moved: false };
      zone.setPointerCapture(e.pointerId);
      this.pad.style.left = `${e.clientX - 60}px`;
      this.pad.style.top = `${e.clientY - 60}px`;
      this.pad.classList.add('active');
      this.setSteer(0);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.steerId) return;
      this.setSteer((e.clientX - this.steerOrigin) / STEER_RANGE);
      if (Math.hypot(e.clientX - this.steerStart.x, e.clientY - this.steerStart.y) > TAP_SLOP) this.steerStart.moved = true;
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.steerId) return;
      // A quick tap on the steering side hops too.
      if (e.type === 'pointerup' && !this.steerStart.moved && performance.now() - this.steerStart.at < TAP_TIME) this.input.pressHop();
      this.steerId = null;
      this.pad.classList.remove('active');
      this.setSteer(0);
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);

    for (const btn of this.el.querySelectorAll<HTMLElement>('.touch-btn')) {
      const act = btn.dataset.act as 'drift' | 'brake' | 'item';
      const set = (on: boolean) => (e: PointerEvent) => {
        e.preventDefault();
        // A quick tap can start and end inside one physics tick; latch it.
        if (on && act === 'item') this.input.pressItem();
        this.input.touch[act] = on;
        btn.classList.toggle('held', on);
      };
      btn.addEventListener('pointerdown', set(true));
      btn.addEventListener('pointerup', set(false));
      btn.addEventListener('pointercancel', set(false));
      btn.addEventListener('pointerleave', set(false));
    }
    this.el.querySelector('.touch-pause')!.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      onPause();
    });

    // Show the controls once the player actually touches the screen.
    window.addEventListener('touchstart', () => this.enable(), { once: true, passive: true });
  }

  /** With tilt steering on, the drag pad is hidden and off: steering is all in the phone. */
  setTiltMode(on: boolean): void {
    this.el.classList.toggle('tilt-mode', on);
    if (on) {
      this.steerId = null;
      this.pad.classList.remove('active');
      this.setSteer(0);
    }
  }

  enable(): void {
    this.enabled = true;
    document.body.classList.add('touch-mode');
  }

  /** Only visible while racing. */
  setVisible(visible: boolean): void {
    this.el.classList.toggle('show', visible && this.enabled);
    if (!visible) {
      this.input.touch.steer = 0;
      this.input.touch.drift = this.input.touch.brake = this.input.touch.item = false;
    }
  }

  private setSteer(v: number): void {
    const steer = Math.max(-1, Math.min(1, v));
    this.input.touch.steer = steer;
    this.knob.style.transform = `translateX(${steer * 40}px)`;
  }
}
