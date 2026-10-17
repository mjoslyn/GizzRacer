/** Phones and tablets: a coarse pointer, or touch with no hover. */
const COARSE =
  typeof matchMedia !== 'undefined' &&
  (matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches));

/** iOS reports the new size a beat after a rotation; look again at these delays (ms). */
const SETTLE_CHECKS = [0, 120, 350, 800];

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
}

/** iPhone Safari has no element fullscreen; a home-screen web app runs full screen instead. */
export const IOS_BROWSER =
  typeof navigator !== 'undefined' &&
  /iPhone|iPod/.test(navigator.userAgent) &&
  !(navigator as Navigator & { standalone?: boolean }).standalone &&
  !matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;

/**
 * Mobile screen handling: fullscreen and a landscape lock on the first
 * tap where the browser allows it, and a "turn your phone" card whenever
 * a phone is held upright.
 */
export class ScreenFit {
  private isPortrait = false;
  private timers: number[] = [];

  /** `onChange` runs whenever the screen settles on a new size or orientation. */
  constructor(
    parent: HTMLElement,
    private readonly onChange: () => void = () => {},
  ) {
    const el = document.createElement('div');
    el.className = 'rotate';
    el.innerHTML = `
      <div class="rotate-phone"><div class="rotate-screen"></div></div>
      <div class="rotate-text hud-big">TURN YOUR PHONE SIDEWAYS</div>
      <div class="rotate-hint">Already sideways? Turn off rotation lock${IOS_BROWSER ? ' in Control Center' : ''}.</div>
      ${IOS_BROWSER ? '<div class="rotate-hint">For full screen: Share &rarr; Add to Home Screen</div>' : ''}`;
    parent.appendChild(el);
    if (COARSE) document.body.classList.add('coarse');
    if (IOS_BROWSER) document.body.classList.add('ios-browser');

    // Every signal a phone might give for a rotation, each followed by re-checks
    // while the browser settles.
    const settle = () => {
      for (const t of this.timers) clearTimeout(t);
      this.timers = SETTLE_CHECKS.map((ms) => window.setTimeout(() => this.update(), ms));
    };
    window.addEventListener('resize', settle);
    window.addEventListener('orientationchange', settle);
    screen.orientation?.addEventListener?.('change', settle);
    window.visualViewport?.addEventListener('resize', settle);
    document.addEventListener('visibilitychange', settle);
    this.update();
  }

  /** A phone held upright. */
  get portrait(): boolean {
    return COARSE && this.isPortrait;
  }

  /** The viewport the game actually has, which is what decides the layout. */
  viewport(): { width: number; height: number } {
    const el = document.documentElement;
    return { width: el.clientWidth || window.innerWidth, height: el.clientHeight || window.innerHeight };
  }

  private update(): void {
    const { width, height } = this.viewport();
    // The viewport's shape is the truth for layout; the orientation APIs only
    // break a tie (a square-ish viewport while the browser is mid-rotation).
    let portrait = height > width * 1.05;
    if (Math.abs(height - width) <= width * 0.05) {
      const type = screen.orientation?.type;
      const legacy = (window as Window & { orientation?: number }).orientation;
      if (type) portrait = type.startsWith('portrait');
      else if (typeof legacy === 'number') portrait = legacy === 0 || legacy === 180;
    }
    this.isPortrait = portrait;
    document.body.classList.toggle('portrait', portrait);
    this.onChange();
  }

  /** Call from inside a touch handler: browsers only allow fullscreen from a user gesture. */
  enter(): void {
    if (!COARSE) return;
    const doc = document as FullscreenDocument;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) return;
    const root = document.documentElement as FullscreenElement;
    const request = root.requestFullscreen
      ? () => root.requestFullscreen({ navigationUI: 'hide' })
      : root.webkitRequestFullscreen
        ? () => root.webkitRequestFullscreen!()
        : null;
    if (!request) return;
    Promise.resolve()
      .then(request)
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => {
        // Not allowed here (iOS, desktop emulation, already exiting): the rotate card covers it.
      });
  }
}
