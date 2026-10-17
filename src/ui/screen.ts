/** Phones and tablets: anything with a coarse pointer. */
const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

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
  private readonly portraitQuery = typeof matchMedia !== 'undefined' ? matchMedia('(orientation: portrait)') : null;

  constructor(parent: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'rotate';
    el.innerHTML = `
      <div class="rotate-phone"><div class="rotate-screen"></div></div>
      <div class="rotate-text hud-big">TURN YOUR PHONE SIDEWAYS</div>
      ${IOS_BROWSER ? '<div class="rotate-hint">For full screen: Share &rarr; Add to Home Screen</div>' : ''}`;
    parent.appendChild(el);
    if (COARSE) document.body.classList.add('coarse');
    if (IOS_BROWSER) document.body.classList.add('ios-browser');
  }

  /** A phone held upright. */
  get portrait(): boolean {
    return COARSE && !!this.portraitQuery?.matches;
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
