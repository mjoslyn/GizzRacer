import { glyph, type PadButton, type PadFamily } from '../core/gamepad';

/**
 * Controllers on the screens that are buttons rather than keys (Settings,
 * the pause menu, the online rooms, the name prompt, the buttons between
 * races, the title's buttons): the D-pad moves a highlight from button to
 * button by where they sit, A (the right button) presses the one lit. The
 * screens that already read keys (the picker, story cards, skill games)
 * get the pad's presses as keys instead (game.ts). Also here: which way the
 * player last played (pad, keys, touch), for the hints and glyphs, and the
 * toast when a controller comes or goes.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Dir = 'up' | 'down' | 'left' | 'right';

/**
 * The candidate to move to from `from` in `dir`: the nearest whose middle
 * lies that way, with a step sideways counting double, so the button
 * straight below wins over a nearer one off to the side. -1 if none.
 */
export function pickNext(from: Rect, cands: readonly Rect[], dir: Dir): number {
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  let best = -1;
  let bestScore = Infinity;
  cands.forEach((r, i) => {
    const x = r.x + r.w / 2 - cx;
    const y = r.y + r.h / 2 - cy;
    const along = dir === 'up' ? -y : dir === 'down' ? y : dir === 'left' ? -x : x;
    const across = dir === 'up' || dir === 'down' ? Math.abs(x) : Math.abs(y);
    // Has to be that way, past a pixel or two (a button beside this one isn't "below" it).
    if (along <= 2) return;
    // Beside each other in a row: overlapping edges count as straight across.
    const overlap = dir === 'up' || dir === 'down' ? Math.min(from.x + from.w, r.x + r.w) - Math.max(from.x, r.x) : Math.min(from.y + from.h, r.y + r.h) - Math.max(from.y, r.y);
    const score = along + (overlap > 0 ? 0 : across * 2);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** The letters a text box can be spelt with on a pad, up and down cycling the last one. */
export const PAD_LETTERS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';

/** A text box's value after a D-pad press: up and down change the last letter, right adds one, left takes it off. Null: left on an empty box (move on). */
export function spell(value: string, dir: Dir, max = 32): string | null {
  const at = (c: string) => Math.max(0, PAD_LETTERS.indexOf(c.toUpperCase()));
  if (dir === 'left') return value.length ? value.slice(0, -1) : null;
  if (dir === 'right') return value.length < max ? value + 'A' : value;
  if (!value.length) return dir === 'up' ? 'A' : '9';
  const n = PAD_LETTERS.length;
  const next = PAD_LETTERS[(at(value[value.length - 1]) + (dir === 'up' ? 1 : -1) + n) % n];
  return value.slice(0, -1) + next;
}

const FOCUSABLE = 'button, input, select, [data-pad-focus]';

function visible(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled) return false;
  if (!el.getClientRects().length) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
}

const isText = (el: Element | null): el is HTMLInputElement => el instanceof HTMLInputElement && el.type !== 'checkbox' && el.type !== 'range' && el.type !== 'button';

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/** The highlight moved by the D-pad over a screen's buttons. */
export class FocusNav {
  private current: HTMLElement | null = null;
  private roots: HTMLElement[] = [];
  private lastAt: Rect | null = null;
  /** The highlight shows only while a pad is in use. */
  shown = false;

  /** The screens to move over now (null: none, the highlight goes). Call every frame. */
  setRoots(roots: HTMLElement[] | null): void {
    const next = roots ?? [];
    const same = next.length === this.roots.length && next.every((r, i) => r === this.roots[i]);
    if (!same) {
      this.roots = next;
      this.lastAt = null;
      this.set(null);
    }
    // Re-rendered under it (a value changed): back onto the button where it was.
    if (this.current && !this.current.isConnected) this.set(null, true);
    // With a pad in hand, a button is lit as soon as the screen shows, so the first press moves from it.
    if (this.shown && this.roots.length) this.ensure();
    if (this.current) this.current.classList.toggle('pad-focus', this.shown);
  }

  get active(): boolean {
    return this.roots.length > 0;
  }

  get focused(): HTMLElement | null {
    this.ensure();
    return this.current;
  }

  private candidates(): HTMLElement[] {
    return this.roots.flatMap((r) => [...r.querySelectorAll<HTMLElement>(FOCUSABLE)]).filter(visible);
  }

  /** Something lit: where it was, or a screen's default (marked `.on` or data-pad-default), or the first button. */
  private ensure(): void {
    if (this.current?.isConnected && visible(this.current)) return;
    const c = this.candidates();
    if (!c.length) return this.set(null);
    if (this.lastAt) {
      const at = this.lastAt;
      const d = (r: Rect) => Math.hypot(r.x + r.w / 2 - (at.x + at.w / 2), r.y + r.h / 2 - (at.y + at.h / 2));
      this.set(c.reduce((a, b) => (d(rectOf(b)) < d(rectOf(a)) ? b : a)));
      return;
    }
    this.set(c.find((e) => e.matches('[data-pad-default]')) ?? c[0]);
  }

  private set(el: HTMLElement | null, keepPlace = false): void {
    if (this.current && this.current !== el) {
      this.current.classList.remove('pad-focus');
      if (document.activeElement === this.current) this.current.blur();
    }
    this.current = el;
    if (!keepPlace) this.lastAt = el ? rectOf(el) : this.lastAt;
    if (!el) return;
    this.lastAt = rectOf(el);
    el.classList.toggle('pad-focus', this.shown);
    if (el instanceof HTMLInputElement && isText(el) && this.shown) this.onText?.(el);
    // A text box takes the real focus so a keyboard can type in it too; buttons don't, or Space (the hop) would press them.
    if (el.matches('input')) el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  /** In a text box, B (back) leaves it (downwards) rather than leaving the screen. Returns false outside one. */
  leaveText(): boolean {
    const box = this.current;
    if (!isText(box)) return false;
    this.move('down', true);
    // Nothing below it (the name prompt's box sits beside its buttons): B is the screen's back after all.
    if (this.current !== box) return true;
    box.blur();
    return false;
  }

  /** A D-pad press (`skipEdit`: move on even from a text box). */
  move(dir: Dir, skipEdit = false): void {
    if (!this.current?.isConnected) {
      this.ensure();
      return;
    }
    const el = this.current;
    if (!skipEdit && el instanceof HTMLInputElement && isText(el)) {
      const v = spell(el.value, dir, el.maxLength > 0 ? el.maxLength : 32);
      if (v !== null && (dir !== 'left' || el.value.length)) {
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }
    if (el instanceof HTMLSelectElement && (dir === 'left' || dir === 'right')) {
      const n = el.options.length;
      if (n) {
        el.selectedIndex = (el.selectedIndex + (dir === 'left' ? -1 : 1) + n) % n;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    // A ◀ value ▶ row: left and right press its arrows, the highlight staying on the row.
    if ((dir === 'left' || dir === 'right') && el.dataset.dir !== undefined && el.parentElement) {
      const want = dir === 'left' ? '-1' : '1';
      const arrow = [...el.parentElement.querySelectorAll<HTMLElement>('[data-dir]')].find((b) => b.dataset.dir === want && b.dataset.act === el.dataset.act);
      if (arrow) {
        this.lastAt = rectOf(el);
        arrow.click();
        return;
      }
    }
    const c = this.candidates().filter((e) => e !== el);
    const from = rectOf(el);
    let i = pickNext(from, c.map(rectOf), dir);
    // Off a ◀ ▶ row up or down: onto the row's left arrow, not whichever is nearer.
    if (i >= 0) {
      const to = c[i];
      const pair = to.dataset.dir === '1' ? [...(to.parentElement?.querySelectorAll<HTMLElement>('[data-dir="-1"]') ?? [])].find((b) => b.dataset.act === to.dataset.act) : undefined;
      if (pair && visible(pair)) i = c.indexOf(pair);
      this.set(c[i]);
    }
  }

  /** Called with the text box the highlight lands on, to say how a pad spells (once a box). */
  onText: ((el: HTMLInputElement) => void) | null = null;

  /** A (confirm): presses what's lit (Enter in a text box). Returns false with nothing to press. */
  confirm(): boolean {
    this.ensure();
    const el = this.current;
    if (!el) return false;
    if (el.matches('input, select')) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      return true;
    }
    this.lastAt = rectOf(el);
    el.click();
    return true;
  }
}

/** Which way the player last played. */
export type InputKind = 'keys' | 'touch' | 'pad';

/**
 * The last way of playing, as body classes: `pad-mode` while a pad is in
 * use (`pad-x` for Xbox letters; Nintendo's otherwise), so the hints and glyphs follow it.
 */
export class InputMode {
  kind: InputKind = 'keys';
  family: PadFamily = 'nintendo';
  private readonly listeners: (() => void)[] = [];

  onChange(f: () => void): void {
    this.listeners.push(f);
  }

  set(kind: InputKind, family: PadFamily = this.family): void {
    if (kind === this.kind && family === this.family) return;
    this.kind = kind;
    this.family = family;
    document.body.classList.toggle('pad-mode', kind === 'pad');
    document.body.classList.toggle('pad-x', family === 'xbox');
    for (const f of this.listeners) f();
  }
}

/** A pad button's name, for both families (Nintendo's letters unless the pad is an Xbox one): the body class shows which. */
export function g(b: PadButton | 'dpad'): string {
  const x = glyph('xbox', b);
  const n = glyph('nintendo', b);
  return x === n ? `<b class="glyph">${x}</b>` : `<b class="glyph"><span class="g-x">${x}</span><span class="g-n">${n}</span></b>`;
}

/** Keyboard wording, or the pad's while one is in use. */
export function kbOrPad(kb: string, pad: string): string {
  return `<span class="kb">${kb}</span><span class="gp">${pad}</span>`;
}

let toastEl: HTMLElement | null = null;
let toastTimer = 0;

/** A small note at the top of the screen for a couple of seconds (a controller came or went). */
export function toast(text: string, seconds = 2.5): void {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'pad-toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl?.classList.remove('show'), seconds * 1000);
}

/** A controller's id cut to its name ("Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)" to "Xbox Wireless Controller"). */
export function padName(id: string): string {
  const name = id.replace(/\s*\(.*$/, '').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '').trim();
  return name || 'Controller';
}
