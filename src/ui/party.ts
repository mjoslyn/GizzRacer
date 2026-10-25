import { MAX_SEATS, PAD, SEAT_COLORS, SEAT_KEYS, SEAT_KEY_NAMES, connectedPads, sameSource, sourceName, type KeySide, type SeatSource } from '../core/seatInput';
import { RACERS, type RacerDef } from '../physics/racers';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** One player who has joined: what they drive with, who they race as, and whether they're set. */
export interface PartySeat {
  source: SeatSource;
  racer: RacerDef;
  ready: boolean;
  /** A phone's player name, if it gave one. */
  name?: string;
}

/** Seconds from everyone ready to the race. */
const START_WAIT = 2;
/** A stick pushed this far is a press left or right. */
const STICK_PRESS = 0.6;

/**
 * Party mode's join screen: up to four players on one screen. Each joins
 * with their own controls (a half of the keyboard, a gamepad, or a phone),
 * picks a racer with left and right, and readies up; once everyone is
 * ready the race starts.
 */
export class PartyScreen {
  seats: PartySeat[] = [];
  onStart: (seats: PartySeat[]) => void = () => {};
  onBack: () => void = () => {};
  /** The phones' corner: how to join from one (the room code, the link), set by the game once a room is open. */
  phoneInfo = '';
  private readonly el = document.createElement('div');
  /** Each gamepad's buttons and stick last frame, for presses. */
  private readonly padWas = new Map<number, { buttons: boolean[]; stick: number }>();
  private startAt: number | null = null;
  private lastHtml = '';

  constructor(
    parent: HTMLElement,
    /** The racer picked in the menu: the first player's to start with. */
    private readonly preferred: () => RacerDef,
  ) {
    this.el.className = 'party';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.click(e.target as HTMLElement));
  }

  get visible(): boolean {
    return this.el.classList.contains('show');
  }

  show(visible: boolean): void {
    this.el.classList.toggle('show', visible);
    // Back from a race: everyone readies again for the next.
    if (visible) for (const s of this.seats) s.ready = false;
    this.startAt = null;
    this.render(true);
  }

  /** A key on the join screen: a half of the keyboard joins, picks and readies; Escape goes back. Returns true if used. */
  key(code: string): boolean {
    if (code === 'Escape' || code === 'Backspace') {
      this.onBack();
      return true;
    }
    for (const side of ['left', 'right'] as KeySide[]) {
      const k = SEAT_KEYS[side];
      const src: SeatSource = { kind: 'keys', side };
      const i = this.find(src);
      const ok = k.drift.includes(code) || k.item.includes(code);
      if (i < 0) {
        if (ok) this.join(src);
        else continue;
      } else if (k.left.includes(code)) this.pick(i, -1);
      else if (k.right.includes(code)) this.pick(i, 1);
      else if (ok) this.toggleReady(i);
      else if (k.lookBack.includes(code)) this.leave(i);
      else continue;
      this.render();
      return true;
    }
    return false;
  }

  /** Every frame while showing: the gamepads (A joins and readies, B leaves, left and right pick), and the start. */
  poll(now: number): void {
    const pads = connectedPads();
    pads.forEach((pad, index) => {
      if (!pad?.connected) return;
      const buttons = pad.buttons.map((b) => b.pressed);
      const x = pad.axes[0] ?? 0;
      const stick = x > STICK_PRESS ? 1 : x < -STICK_PRESS ? -1 : 0;
      const was = this.padWas.get(index);
      this.padWas.set(index, { buttons, stick });
      if (!was) return;
      const pressed = (b: number) => buttons[b] && !was.buttons[b];
      const src: SeatSource = { kind: 'pad', index };
      const i = this.find(src);
      if (i < 0) {
        if (pressed(PAD.a) || pressed(PAD.start)) this.join(src);
        else if (pressed(PAD.b) && !this.seats.length) this.onBack();
        return;
      }
      const dir = (pressed(PAD.dRight) ? 1 : 0) - (pressed(PAD.dLeft) ? 1 : 0) || (stick !== was.stick ? stick : 0);
      if (dir) this.pick(i, dir);
      if (pressed(PAD.a)) this.toggleReady(i);
      if (pressed(PAD.start)) this.readyAll();
      if (pressed(PAD.b)) this.leave(i);
    });
    const all = this.seats.length > 0 && this.seats.every((s) => s.ready);
    if (!all) this.startAt = null;
    else if (this.startAt === null) this.startAt = now + START_WAIT;
    else if (now >= this.startAt) {
      this.startAt = null;
      this.onStart(this.seats.map((s) => ({ ...s })));
      return;
    }
    this.render();
  }

  /** A phone joins (or rejoins under the same id). */
  joinRemote(id: string, name?: string): boolean {
    const src: SeatSource = { kind: 'remote', id };
    const i = this.find(src);
    if (i >= 0) {
      if (name) this.seats[i].name = name;
      return true;
    }
    if (!this.join(src)) return false;
    if (name) this.seats[this.seats.length - 1].name = name;
    this.render();
    return true;
  }

  /** A phone's buttons on the join screen. */
  remoteAction(id: string, act: 'left' | 'right' | 'ready' | 'leave'): void {
    const i = this.find({ kind: 'remote', id });
    if (i < 0) return;
    if (act === 'left' || act === 'right') this.pick(i, act === 'left' ? -1 : 1);
    else if (act === 'ready') this.toggleReady(i);
    else this.leave(i);
    this.render();
  }

  /** The seat a phone has, or -1. */
  remoteSeat(id: string): number {
    return this.find({ kind: 'remote', id });
  }

  private find(src: SeatSource): number {
    return this.seats.findIndex((s) => sameSource(s.source, src));
  }

  private join(source: SeatSource): boolean {
    if (this.seats.length >= MAX_SEATS) return false;
    const taken = new Set(this.seats.map((s) => s.racer));
    const first = this.seats.length === 0 ? this.preferred() : RACERS[Math.floor(Math.random() * RACERS.length)];
    const start = RACERS.indexOf(first);
    const racer = RACERS.map((_, i) => RACERS[(start + i) % RACERS.length]).find((r) => !taken.has(r)) ?? first;
    this.seats.push({ source, racer, ready: false });
    this.startAt = null;
    return true;
  }

  private leave(i: number): void {
    this.seats.splice(i, 1);
  }

  /** The next racer no one else has, that way. */
  private pick(i: number, dir: number): void {
    const s = this.seats[i];
    if (s.ready) return;
    const taken = new Set(this.seats.filter((_, j) => j !== i).map((x) => x.racer));
    let at = RACERS.indexOf(s.racer);
    for (let n = 0; n < RACERS.length; n++) {
      at = (at + dir + RACERS.length) % RACERS.length;
      if (!taken.has(RACERS[at])) break;
    }
    s.racer = RACERS[at];
  }

  private toggleReady(i: number): void {
    this.seats[i].ready = !this.seats[i].ready;
  }

  private readyAll(): void {
    for (const s of this.seats) s.ready = true;
  }

  private click(t: HTMLElement): void {
    const b = t.closest<HTMLElement>('[data-seat], [data-party]');
    if (!b) return;
    if (b.dataset.party === 'back') return this.onBack();
    if (b.dataset.party === 'go') this.readyAll();
    if (b.dataset.party === 'keys') this.join({ kind: 'keys', side: this.find({ kind: 'keys', side: 'left' }) < 0 ? 'left' : 'right' });
    const i = Number(b.dataset.seat);
    if (b.dataset.seat !== undefined && this.seats[i]) {
      const act = b.dataset.act;
      if (act === 'prev') this.pick(i, -1);
      else if (act === 'next') this.pick(i, 1);
      else if (act === 'ready') this.toggleReady(i);
      else if (act === 'leave') this.leave(i);
    }
    this.render();
  }

  private render(force = false): void {
    if (!this.visible && !force) return;
    const cards = Array.from({ length: MAX_SEATS }, (_, i) => {
      const s = this.seats[i];
      const color = SEAT_COLORS[i];
      if (!s) {
        return `<div class="party-seat empty" style="--seat:${color}"><div class="party-p hud-big">P${i + 1}</div><div class="party-join">Press <b>Shift</b> (WASD) or <b>Right Shift</b> (arrows), <b>A</b> on a controller, or join from a phone</div></div>`;
      }
      const how = s.source.kind === 'keys' ? SEAT_KEY_NAMES[s.source.side] : s.source.kind === 'pad' ? 'Stick or d-pad · A hop · L item' : 'Tilt or drag to steer';
      return `<div class="party-seat${s.ready ? ' ready' : ''}" style="--seat:${color}">
        <div class="party-p hud-big">P${i + 1}</div>
        <div class="party-src">${esc(s.name ? `${s.name} · ${sourceName(s.source)}` : sourceName(s.source))}</div>
        <div class="party-racer">
          <button class="menu-arrow" data-seat="${i}" data-act="prev">&#9664;</button>
          <span class="party-name"><i style="background:${hex(s.racer.color)}"></i>${esc(s.racer.name)}</span>
          <button class="menu-arrow" data-seat="${i}" data-act="next">&#9654;</button>
        </div>
        <div class="party-how">${esc(how)}</div>
        <button class="party-ready" data-seat="${i}" data-act="ready">${s.ready ? 'READY!' : 'Ready?'}</button>
        <button class="party-leave" data-seat="${i}" data-act="leave" title="Leave">&times;</button>
      </div>`;
    }).join('');
    const all = this.seats.length > 0 && this.seats.every((s) => s.ready);
    const left = this.startAt !== null ? Math.max(0, Math.ceil(this.startAt - performance.now() / 1000)) : null;
    const status = !this.seats.length ? 'Join to race: up to four on this screen' : all ? `Starting${left ? ` in ${left}` : ''}...` : 'Pick a racer, then press hop (or A) when you are ready';
    const html = `
      <div class="party-panel">
        <div class="party-title hud-big">PARTY</div>
        <div class="party-status">${status}</div>
        <div class="party-seats">${cards}</div>
        <div class="party-phones">${this.phoneInfo}</div>
        <div class="party-nav">
          <button data-party="back">&lsaquo; back</button>
          ${this.seats.length < MAX_SEATS ? '<button data-party="keys">+ keyboard player</button>' : ''}
          <button class="party-go hud-big" data-party="go"${this.seats.length ? '' : ' disabled'}>RACE!</button>
        </div>
      </div>`;
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.el.innerHTML = html;
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
