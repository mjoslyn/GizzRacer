import PartySocket from 'partysocket';
import { Keyboard, PAD, SeatInput, connectedPads } from '../core/seatInput';
import { HELD, TAP, type CouchClientMsg, type CouchServerMsg, type PadAction, type PadRow, type PadState, type SeatInfo } from './couchProtocol';

/** How often (ms) a controller's state goes to the TV, at most; sooner on a press. */
const SEND_EVERY = 33;
/** Sent again this often (ms) even unchanged, so a lost message can't leave a button stuck. */
const RESEND = 500;
/** A stick pushed this far is a press, on the join screen. */
const STICK_PRESS = 0.6;
/** P1's rows on the join screen, as the TV has them (ui/party.ts P1_ROWS). */
const ROWS: readonly PadRow[] = ['racer', 'cup', 'engine', 'cpus', 'sound'];

/**
 * Cast to TV with controllers (docs/MULTIPLAYER.md section 12): while the
 * game runs on the Chromecast, the controllers paired with this laptop
 * can't reach it, so each one, once A is pressed, joins the cast's code as a
 * pad of its own, as a phone does. Its buttons go to the TV; the TV's word
 * on its seat comes back (and a hit rumbles it).
 */
export class CastPads {
  private readonly pads = new Map<number, CastPad>();
  /** Buttons held last frame by controllers not yet joined, for a press of A. */
  private readonly idle = new Map<number, boolean>();
  /** The keyboard's no part of this, but SeatInput wants one. */
  private readonly keys = new Keyboard(new EventTarget() as unknown as Window);

  constructor(
    private readonly code: string,
    /** Stable for this laptop, so a controller rejoins as the same pad. */
    private readonly laptopId: string,
  ) {}

  /** How many controllers are in. */
  get count(): number {
    return this.pads.size;
  }

  /** Every frame while casting (`now` in seconds): controllers join with A, and those in send what's held. */
  tick(now: number): void {
    connectedPads().forEach((pad, index) => {
      const joined = this.pads.get(index);
      if (!pad?.connected) {
        joined?.close();
        this.pads.delete(index);
        return;
      }
      if (joined) {
        if (joined.tick(now)) return;
        // It left (B on the join screen).
        joined.close();
        this.pads.delete(index);
        this.idle.set(index, true);
        return;
      }
      const a = pad.buttons[PAD.a]?.pressed ?? false;
      if (a && this.idle.get(index) === false) this.pads.set(index, new CastPad(this.code, `${this.laptopId}-pad${index}`, index, this.keys));
      this.idle.set(index, a);
    });
  }

  close(): void {
    for (const p of this.pads.values()) p.close();
    this.pads.clear();
    this.idle.clear();
  }
}

/** One controller, joined to the cast as a pad. */
class CastPad {
  private readonly socket: PartySocket;
  private readonly input: SeatInput;
  private info: SeatInfo | null = null;
  private was: boolean[] = [];
  private stick = { x: 0, y: 0 };
  private row = 0;
  private lastSent = '';
  private lastSentAt = 0;
  private taps = 0;
  private left = false;

  constructor(
    code: string,
    private readonly id: string,
    private readonly index: number,
    keys: Keyboard,
  ) {
    this.input = new SeatInput({ kind: 'pad', index }, keys);
    this.socket = new PartySocket({ host: location.host, party: 'couch', room: code });
    this.socket.addEventListener('open', () => this.send({ t: 'hello', role: 'pad', id, name: `Controller ${index + 1}`, controller: true }));
    this.socket.addEventListener('message', (e: MessageEvent) => this.receive(e.data as string));
  }

  close(): void {
    this.socket.close();
  }

  /** One frame: the buttons for the screen the TV shows. False once it has left. */
  tick(now: number): boolean {
    const pad = connectedPads()[this.index];
    if (!pad) return true;
    const buttons = pad.buttons.map((b) => b.pressed);
    const pressed = (b: number) => buttons[b] && !this.was[b];
    const sx = edge(pad.axes[0] ?? 0, this.stick.x);
    const sy = edge(pad.axes[1] ?? 0, this.stick.y);
    this.stick = { x: sx.now, y: sy.now };
    const across = (pressed(PAD.dRight) ? 1 : 0) - (pressed(PAD.dLeft) ? 1 : 0) || sx.press;
    const down = (pressed(PAD.dDown) ? 1 : 0) - (pressed(PAD.dUp) ? 1 : 0) || sy.press;
    const info = this.info;
    const phase = info?.phase;
    if (phase === 'join') {
      // P1 moves between their racer and the settings; everyone else has only their racer.
      if (down && info?.host) {
        this.row = (this.row + down + ROWS.length) % ROWS.length;
        this.act('row', ROWS[this.row]);
      }
      if (across) this.act(across < 0 ? 'left' : 'right', info?.host ? ROWS[this.row] : 'racer');
      if (pressed(PAD.a)) this.act('ready');
      if (pressed(PAD.b)) {
        this.act('leave');
        this.left = true;
      }
    } else if (phase === 'race') {
      if (info?.paused) {
        if (pressed(PAD.start) || pressed(PAD.a)) this.act('resume');
      } else if (pressed(PAD.start)) this.act('pause');
      this.pump(now);
    } else if (phase === 'results' && (pressed(PAD.a) || pressed(PAD.start))) {
      this.act('continue');
    }
    // The race's own sampling, kept going so a press's edge is never stale.
    if (phase !== 'race') this.input.sample();
    this.was = buttons;
    return !this.left;
  }

  /** What's held, to the TV when it changes, and now and then anyway. */
  private pump(now: number): void {
    const f = this.input.sample();
    if (f.driftPressed) this.taps |= TAP.drift;
    if (f.itemPressed) this.taps |= TAP.item;
    if (this.info?.paused) return;
    const flags = (f.brake > 0 ? HELD.brake : 0) | (f.drift ? HELD.drift : 0) | (f.item ? HELD.item : 0) | (f.lookBack ? HELD.lookBack : 0);
    const r = (v: number) => Math.round(v * 100) / 100;
    const s: PadState = [r(f.steer), r(f.pitch), flags, this.taps];
    const text = JSON.stringify(s);
    const since = (now - this.lastSentAt) * 1000;
    // A press goes at once; a change at most every SEND_EVERY; nothing new, every RESEND.
    if (!this.taps && since < (text === this.lastSent ? RESEND : SEND_EVERY)) return;
    this.send({ t: 'in', s });
    this.lastSent = text;
    this.lastSentAt = now;
    this.taps = 0;
  }

  private act(a: PadAction, row?: PadRow): void {
    this.send({ t: 'act', a, row });
  }

  private send(msg: CouchClientMsg): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
  }

  private receive(data: string): void {
    let msg: CouchServerMsg;
    try {
      msg = JSON.parse(data) as CouchServerMsg;
    } catch {
      return;
    }
    // A TV came (back): say hello again so it seats this controller.
    if (msg.t === 'hastv') this.send({ t: 'hello', role: 'pad', id: this.id, name: `Controller ${this.index + 1}`, controller: true });
    if (msg.t !== 'tv') return;
    const m = msg.m;
    if (m.t === 'buzz') {
      const pad = connectedPads()[this.index] as (Gamepad & { vibrationActuator?: { playEffect?: (type: string, params: object) => Promise<unknown> } }) | null;
      void pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: m.ms, strongMagnitude: 0.6, weakMagnitude: 0.4 })?.catch(() => {});
      return;
    }
    if (m.phase !== 'join') this.row = 0;
    this.info = m;
  }
}

/** A stick axis as a press: the direction it's pushed now, and a press if that's new. */
function edge(v: number, was: number): { now: number; press: number } {
  const now = v > STICK_PRESS ? 1 : v < -STICK_PRESS ? -1 : 0;
  return { now, press: now !== was ? now : 0 };
}
