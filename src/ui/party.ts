import { MAX_SEATS, PAD, SEAT_COLORS, SEAT_KEYS, SEAT_KEY_NAMES, connectedPads, sameSource, sourceName, type KeySide, type SeatSource } from '../core/seatInput';
import { CPU_DIFFICULTIES, type CpuDifficulty } from '../ai/cpuDriver';
import { progress, unlocks } from '../core/progress';
import { SOUNDTRACKS, SOUNDTRACK_NAMES, settings as gameSettings, updateSettings } from '../core/settings';
import { RACERS, type EngineClass, type RacerDef } from '../physics/racers';
import { CUPS, RANDOM_CUP_ID, RANDOM_CUP_NAME, TRACK_LIST, randomCupTracks } from '../tracks/index';
import { availableClasses } from './menu';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** One player who has joined: what they drive with, who they race as, and whether they're set. */
export interface PartySeat {
  source: SeatSource;
  racer: RacerDef;
  ready: boolean;
  /** A phone's player name, if it gave one. */
  name?: string;
  /** A remote seat that's a controller on the laptop, sent on to a cast, not a phone. */
  controller?: boolean;
}

/** What P1 sets for everyone: the cup raced as a Grand Prix, its speed, and how hard the CPUs drive. */
export interface PartySettings {
  /** An index into CUPS, or CUPS.length for the Random Cup (once unlocked). */
  cup: number;
  randomTracks: number[];
  engine: EngineClass;
  cpus: CpuDifficulty;
}

/** P1's rows on the join screen: their racer, then the settings (the music is Settings > Soundtrack, for everyone). */
export const P1_ROWS = ['racer', 'cup', 'engine', 'cpus', 'sound'] as const;
export type P1Row = (typeof P1_ROWS)[number];
const CPU_NAMES: Record<CpuDifficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

/** The cup P1 has picked: one of CUPS, or the Random Cup's draw. */
export function partyCup(s: PartySettings): { id: string; name: string; tracks: number[] } {
  return s.cup < CUPS.length ? CUPS[s.cup] : { id: RANDOM_CUP_ID, name: RANDOM_CUP_NAME, tracks: s.randomTracks };
}

/** The settings as P1's phone shows them. */
export function settingsText(s: PartySettings): { cup: string; engine: string; cpus: string; sound: string } {
  return { cup: partyCup(s).name, engine: s.engine, cpus: CPU_NAMES[s.cpus], sound: SOUNDTRACK_NAMES[gameSettings().soundtrack] };
}

/** Seconds from everyone ready to the race. */
const START_WAIT = 2;
/** A stick pushed this far is a press left or right. */
const STICK_PRESS = 0.6;

/**
 * Party mode's join screen: up to four players on one screen. Each joins
 * with their own controls (a half of the keyboard, a gamepad, or a phone),
 * picks a racer with left and right, and readies up. P1 also picks the cup
 * (raced as a Grand Prix), the speed and the CPUs for everyone. Once
 * everyone is ready the cup starts.
 */
export class PartyScreen {
  seats: PartySeat[] = [];
  onStart: (seats: PartySeat[]) => void = () => {};
  /** P1 changed a setting (the game shows the cup's first track behind the screen). */
  onSettings: (s: PartySettings) => void = () => {};
  settings: PartySettings;
  /** The row P1's keys or controller are on. */
  private p1Row = 0;
  onBack: () => void = () => {};
  /** The Cast button: shown where the browser can cast a page (Chrome); `casting` while it is. */
  onCast: (() => void) | null = null;
  casting = false;
  /** The phones' corner: how to join from one (the room code, the link), set by the game once a room is open. */
  phoneInfo = '';
  private readonly el = document.createElement('div');
  /** Each gamepad's buttons and stick last frame, for presses. */
  private readonly padWas = new Map<number, { buttons: boolean[]; stick: number; stickY: number }>();
  private startAt: number | null = null;
  private lastHtml = '';
  /** What the side column was last scaled for (its html, the screen's height, the TV scale). */
  private lastFit = '';

  constructor(
    parent: HTMLElement,
    /** The racer picked in the menu: the first player's to start with. */
    private readonly preferred: () => RacerDef,
    initial: PartySettings,
  ) {
    this.settings = { ...initial };
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
    if (this.casting) return false;
    for (const side of ['left', 'right'] as KeySide[]) {
      const k = SEAT_KEYS[side];
      const src: SeatSource = { kind: 'keys', side };
      const i = this.find(src);
      const ok = k.drift.includes(code) || k.item.includes(code);
      if (i < 0) {
        if (ok) this.join(src);
        else continue;
      } else if (k.left.includes(code)) this.change(i, -1);
      else if (k.right.includes(code)) this.change(i, 1);
      else if (i === 0 && k.up.includes(code)) this.moveRow(-1);
      else if (i === 0 && k.brake.includes(code)) this.moveRow(1);
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
    // Casting, the race is the TV's: nothing joins or starts here.
    if (this.casting) return;
    const pads = connectedPads();
    pads.forEach((pad, index) => {
      if (!pad?.connected) return;
      const buttons = pad.buttons.map((b) => b.pressed);
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      const stick = x > STICK_PRESS ? 1 : x < -STICK_PRESS ? -1 : 0;
      const stickY = y > STICK_PRESS ? 1 : y < -STICK_PRESS ? -1 : 0;
      const was = this.padWas.get(index);
      this.padWas.set(index, { buttons, stick, stickY });
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
      if (dir) this.change(i, dir);
      const row = (pressed(PAD.dDown) ? 1 : 0) - (pressed(PAD.dUp) ? 1 : 0) || (stickY !== was.stickY ? stickY : 0);
      if (row && i === 0) this.moveRow(row);
      if (pressed(PAD.a)) this.toggleReady(i);
      if (pressed(PAD.start)) this.readyAll();
      if (pressed(PAD.b)) this.leave(i);
    });
    this.fit();
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
  joinRemote(id: string, name?: string, controller = false): boolean {
    const src: SeatSource = { kind: 'remote', id };
    const i = this.find(src);
    if (i >= 0) {
      if (name) this.seats[i].name = name;
      return true;
    }
    if (!this.join(src)) return false;
    const seat = this.seats[this.seats.length - 1];
    if (name) seat.name = name;
    seat.controller = controller;
    this.render();
    return true;
  }

  /** A phone's buttons on the join screen: its racer, ready, leave; P1's phone sets a row too (`row`). */
  remoteAction(id: string, act: 'left' | 'right' | 'ready' | 'leave' | 'row', row: P1Row = 'racer'): void {
    const i = this.find({ kind: 'remote', id });
    if (i < 0) return;
    // A controller P1 moving between rows: marked on the screen, as for keys.
    if (act === 'row') {
      if (i === 0) this.p1Row = Math.max(0, P1_ROWS.indexOf(row));
    } else if (act === 'left' || act === 'right') {
      const dir = act === 'left' ? -1 : 1;
      if (row === 'racer' || i !== 0) this.pick(i, dir);
      else this.set(row, dir);
    } else if (act === 'ready') this.toggleReady(i);
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
    if (i === 0) this.p1Row = 0;
  }

  /** Left or right for a seat: P1's on the row they're on, everyone else's racer. */
  private change(i: number, dir: number): void {
    const row = i === 0 ? P1_ROWS[this.p1Row] : 'racer';
    if (row === 'racer') this.pick(i, dir);
    else this.set(row, dir);
  }

  private moveRow(dir: number): void {
    this.p1Row = (this.p1Row + dir + P1_ROWS.length) % P1_ROWS.length;
  }

  /** P1 changes a setting. Settled once everyone's ready: no changing the cup under them. */
  private set(row: Exclude<P1Row, 'racer'>, dir: number): void {
    if (this.seats[0]?.ready) return;
    const s = this.settings;
    const step = <T>(list: readonly T[], v: T) => list[(list.indexOf(v) + dir + list.length) % list.length];
    if (row === 'cup') {
      // The cups, then the Random Cup once a trophy has unlocked it: four new tracks each time it comes round.
      const n = CUPS.length + (unlocks(progress()).randomCup ? 1 : 0);
      s.cup = (s.cup + dir + n) % n;
      if (s.cup === CUPS.length) s.randomTracks = randomCupTracks();
    } else if (row === 'engine') s.engine = step(availableClasses(), s.engine);
    else if (row === 'sound') updateSettings({ soundtrack: step(SOUNDTRACKS, gameSettings().soundtrack) });
    else s.cpus = step(CPU_DIFFICULTIES, s.cpus);
    for (const x of this.seats) x.ready = false;
    this.onSettings({ ...s });
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
    if (b.dataset.party === 'cast') return this.onCast?.();
    if (b.dataset.party === 'go') this.readyAll();
    if (b.dataset.party === 'keys') this.join({ kind: 'keys', side: this.find({ kind: 'keys', side: 'left' }) < 0 ? 'left' : 'right' });
    const setting = b.dataset.set as Exclude<P1Row, 'racer'> | undefined;
    if (setting) this.set(setting, Number(b.dataset.dir));
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
    const st = this.settings;
    const cup = partyCup(st);
    const p1 = this.seats[0];
    // P1's rows are marked when they set them from keys or a controller (a phone has its own screen).
    const on = (row: P1Row) => (p1 && (p1.source.kind !== 'remote' || p1.controller) && P1_ROWS[this.p1Row] === row ? ' on' : '');
    const setting = (row: Exclude<P1Row, 'racer'>, label: string, value: string, extra = '') => `
      <div class="party-set${on(row)}">
        <span class="party-set-label">${label}</span>
        <button class="menu-arrow" data-set="${row}" data-dir="-1">&#9664;</button>
        <span class="party-set-value">${esc(value)}</span>
        <button class="menu-arrow" data-set="${row}" data-dir="1">&#9654;</button>
        ${extra}
      </div>`;
    const settings = `
      <div class="party-settings">
        <div class="party-settings-head">${p1 ? `P1 picks${p1.source.kind === 'remote' && !p1.controller ? ' on their phone' : ': &uarr;&darr; row, &larr;&rarr; change'}` : 'The first to join picks the cup'}</div>
        ${setting('cup', 'Cup', cup.name, `<div class="party-set-tracks">${cup.tracks.map((t) => esc(TRACK_LIST[t].name)).join(' &middot; ')}</div>`)}
        ${setting('engine', 'Speed', st.engine)}
        ${setting('cpus', 'CPUs', CPU_NAMES[st.cpus])}
        ${setting('sound', 'Music', SOUNDTRACK_NAMES[gameSettings().soundtrack])}
      </div>`;
    const cards = Array.from({ length: MAX_SEATS }, (_, i) => {
      const s = this.seats[i];
      const color = SEAT_COLORS[i];
      if (!s) {
        return `<div class="party-seat empty" style="--seat:${color}"><div class="party-p hud-big">P${i + 1}</div><div class="party-join">Scan to join, or press <b>Shift</b>, <b>Right Shift</b> or <b>A</b></div></div>`;
      }
      const how = s.source.kind === 'keys' ? SEAT_KEY_NAMES[s.source.side] : s.source.kind === 'pad' || s.controller ? 'Stick or d-pad · A hop · L item' : 'Tilt or drag to steer';
      return `<div class="party-seat${s.ready ? ' ready' : ''}" style="--seat:${color}">
        <div class="party-p hud-big">P${i + 1}</div>
        <div class="party-src">${esc(s.controller ? `${s.name ?? 'Controller'} (laptop)` : s.name ? `${s.name} · ${sourceName(s.source)}` : sourceName(s.source))}</div>
        <div class="party-racer${i === 0 ? on('racer') : ''}">
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
    if (this.casting) {
      const html = `
        <div class="party-panel">
          <div class="party-title hud-big">PARTY <span class="party-beta">BETA</span></div>
          <div class="party-status">Casting: the race is on the TV. Join with a phone, or press A on a controller paired with this laptop.</div>
          <div class="party-phones">${this.phoneInfo}</div>
          <div class="party-nav"><button data-party="back">&lsaquo; back</button><button data-party="cast">Stop casting</button></div>
        </div>`;
      if (html !== this.lastHtml) this.el.innerHTML = this.lastHtml = html;
      return;
    }
    const html = `
      <div class="party-panel party-main">
        <div class="party-phones">${this.phoneInfo}</div>
        <div class="party-side">
        <div class="party-title hud-big">PARTY <span class="party-beta">BETA</span></div>
        <div class="party-beta-note">Party mode is new: tell us what breaks</div>
        ${settings}
        <div class="party-status">${status}</div>
        <div class="party-seats">${cards}</div>
        <div class="party-nav">
          <button data-party="back">&lsaquo; back</button>
          ${this.seats.length < MAX_SEATS && !this.casting ? '<button data-party="keys">+ keyboard player</button>' : ''}
          ${this.onCast ? `<button data-party="cast">${this.casting ? 'Stop casting' : 'Cast to TV'}</button>` : ''}
          <button class="party-go hud-big" data-party="go"${this.seats.length ? '' : ' disabled'}>RACE!</button>
        </div>
        </div>
      </div>`;
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.el.innerHTML = html;
    this.fit();
  }

  /**
   * Scales the side column (settings, seats, buttons) as big as the TV
   * wants (hud.css --tv, on body.couch) but no bigger than fits the screen:
   * read from across the room, never cut off.
   */
  private fit(): void {
    const side = this.el.querySelector<HTMLElement>('.party-side');
    if (!side || !this.visible) return;
    const tv = parseFloat(getComputedStyle(document.body).getPropertyValue('--tv')) || 1;
    const key = `${this.lastHtml.length}:${innerHeight}:${tv}`;
    if (key === this.lastFit) return;
    this.lastFit = key;
    side.style.zoom = '1';
    const tall = side.getBoundingClientRect().height;
    side.style.zoom = String(Math.max(0.6, Math.min(tv, (innerHeight - 24) / Math.max(1, tall))));
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
