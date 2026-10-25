// The phone controller for Party mode (pad.html): joins the TV's code and sends what's held. No game runs here.
import PartySocket from 'partysocket';
import { InputManager } from './core/input';
import { HELD, TAP, type CouchClientMsg, type CouchServerMsg, type PadAction, type PadRow, type PadState, type SeatInfo } from './net/couchProtocol';
import { isRoomCode } from './net/protocol';
import { TiltSteering } from './ui/tilt';

const ID_KEY = 'gizzracer.pad.id';
const NAME_KEY = 'gizzracer.pad.name';
const TILT_KEY = 'gizzracer.pad.tilt';
const TILT_LEVEL_KEY = 'gizzracer.pad.tiltLevel';
/**
 * How much the phone turns for full lock. Steering a TV across the room
 * wants a calmer wheel than the phone's own game: wider than Settings'
 * ranges, and a curve that keeps small tilts small.
 */
const TILT_LEVELS = [
  { name: 'Gentle', range: 40 },
  { name: 'Medium', range: 30 },
  { name: 'Sharp', range: 22 },
] as const;
/** Small tilts count for less: the steer goes as the tilt to this power. */
const TILT_CURVE = 1.6;
/** How much of the way to the phone's tilt the steering goes each send (smooths a shaky hand). */
const TILT_SMOOTH = 0.45;
/** How often (ms) what's held goes to the TV; sooner on a press. */
const SEND_EVERY = 33;
/** Sent again this often (ms) even unchanged, so a reconnect or a lost message can't leave a button stuck. */
const RESEND = 500;
/** A drag this far (as a share of the screen's width) is full lock. */
const DRAG_LOCK = 0.14;
/** A drag this far up or down (as a share of the height) is a full climb or dive with the glider open. */
const DRAG_PITCH = 0.22;

const root = document.getElementById('pad')!;

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: it's asked again next time.
  }
}

const id =
  load(ID_KEY) ??
  (() => {
    const fresh = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).slice(0, 36);
    save(ID_KEY, fresh);
    return fresh;
  })();
let name = load(NAME_KEY) ?? '';
let tiltOn = load(TILT_KEY) === '1';
let tiltLevel = Math.max(0, Math.min(TILT_LEVELS.length - 1, Number(load(TILT_LEVEL_KEY) ?? 0) || 0));
/** The tilt's steer, curved and smoothed. */
let tiltSteer = 0;
let code = (new URLSearchParams(location.search).get('c') ?? '').toUpperCase();
let socket: PartySocket | null = null;
let hasTv = false;
let seat: SeatInfo | null = null;
let status = '';

// Tilt writes into an InputManager's touch state, as it does in the game.
const input = new InputManager();
const tilt = new TiltSteering(input, () => TILT_LEVELS[tiltLevel].range);

/** What's held: buttons, the drag's steer and pitch, and taps not yet sent. */
const held = new Set<keyof typeof HELD>();
let taps = 0;
const drag = { id: -1, x: 0, y: 0, steer: 0, pitch: 0 };
let lastSent = '';
let lastSentAt = 0;

function send(msg: CouchClientMsg): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function connect(): void {
  socket?.close();
  hasTv = false;
  seat = null;
  status = 'Connecting...';
  const s = (socket = new PartySocket({ host: location.host, party: 'couch', room: code }));
  s.addEventListener('open', () => {
    status = '';
    send({ t: 'hello', role: 'pad', id, name });
    render();
  });
  s.addEventListener('close', () => {
    if (socket !== s) return;
    status = 'Connection lost: trying again...';
    render();
  });
  s.addEventListener('message', (e: MessageEvent) => receive(e.data as string));
  render();
}

function leave(): void {
  socket?.close();
  socket = null;
  seat = null;
  hasTv = false;
  status = '';
  history.replaceState(null, '', location.pathname);
  render();
}

function receive(data: string): void {
  let msg: CouchServerMsg;
  try {
    msg = JSON.parse(data) as CouchServerMsg;
  } catch {
    return;
  }
  if (msg.t === 'notv') {
    hasTv = false;
  } else if (msg.t === 'hastv') {
    // A TV opened the code (or came back): say hello to it.
    if (!hasTv) send({ t: 'hello', role: 'pad', id, name });
    hasTv = true;
  } else if (msg.t === 'tv') {
    hasTv = true;
    const m = msg.m;
    if (m.t === 'buzz') {
      navigator.vibrate?.(m.ms);
      return;
    }
    // A race starting: straight ahead is however the phone's held now.
    if (m.phase === 'race' && seat?.phase !== 'race') tilt.recenter();
    seat = m;
    if (m.phase !== 'race') {
      held.clear();
      drag.id = -1;
      drag.steer = drag.pitch = 0;
    }
  }
  render();
}

function act(a: PadAction, row?: PadRow): void {
  send({ t: 'act', a, row });
}

/** What's held, packed for the TV. */
function padState(): PadState {
  let flags = 0;
  for (const h of held) flags |= HELD[h];
  const t = tiltOn && tilt.running ? input.touch.tilt : 0;
  tiltSteer += (Math.sign(t) * Math.abs(t) ** TILT_CURVE - tiltSteer) * TILT_SMOOTH;
  const steer = tiltSteer + drag.steer;
  const pitch = tiltOn && tilt.running ? input.touch.tiltPitch + drag.pitch : drag.pitch;
  const r = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100;
  return [r(steer), r(pitch), flags, taps];
}

/** Sends what's held when it changes (or a press is waiting), and now and then anyway. */
function pump(force = false): void {
  if (seat?.phase !== 'race') return;
  const s = padState();
  const text = JSON.stringify(s);
  const now = performance.now();
  if (!force && text === lastSent && now - lastSentAt < RESEND) return;
  send({ t: 'in', s });
  lastSent = text;
  lastSentAt = now;
  taps = 0;
}
setInterval(() => pump(), SEND_EVERY);

/** The screen to show, and a key that changes when it must be rebuilt. */
function view(): { key: string; html: string } {
  if (!socket) {
    return {
      key: `code:${status}`,
      html: `
        <div class="pad-card">
          <div class="pad-logo">GIZZRACER</div>
          <div class="pad-sub">Your phone is the controller: the race is on the big screen</div>
          <label>Code on the TV<input class="pad-code" maxlength="4" autocapitalize="characters" autocomplete="off" value="${esc(code)}" placeholder="ABCD" /></label>
          <label>Your name<input class="pad-name" maxlength="16" autocomplete="nickname" value="${esc(name)}" placeholder="optional" /></label>
          <button class="pad-big" data-do="join">JOIN</button>
          <div class="pad-status">${esc(status)}</div>
        </div>`,
    };
  }
  const head = `<div class="pad-code-tag">${esc(code)} <button data-do="leave">leave</button></div>`;
  if (!hasTv || !seat || seat.phase === 'away' || seat.n === null) {
    const msg = status || (!hasTv ? 'Waiting for the TV: open Party on it, with this code' : seat?.n === null && seat.phase === 'join' ? 'All four seats are taken' : 'Waiting for the TV to open Party...');
    return { key: `wait:${msg}`, html: `<div class="pad-card">${head}<div class="pad-logo">GIZZRACER</div><div class="pad-status">${esc(msg)}</div></div>` };
  }
  const p = `P${seat.n + 1}`;
  const style = `style="--seat:${seat.color}"`;
  if (seat.phase === 'join') {
    // P1 picks the cup, the speed and the CPUs for everyone; the others see what's picked.
    const h = seat.host;
    const row = (r: PadRow, label: string, value: string) => `
      <div class="pad-set"><span class="pad-set-label">${label}</span><button data-act="left" data-row="${r}">&#9664;</button><span>${esc(value)}</span><button data-act="right" data-row="${r}">&#9654;</button></div>`;
    const sets = h ? `<div class="pad-sets">${row('cup', 'Cup', h.cup)}${row('engine', 'Speed', h.engine)}${row('cpus', 'CPUs', h.cpus)}</div>` : '<div class="pad-sub">P1 picks the cup</div>';
    return {
      key: `join:${seat.n}:${seat.racer}:${seat.ready}:${tiltOn}:${tiltLevel}:${JSON.stringify(h)}:${status}`,
      html: `
        <div class="pad-card pad-join${seat.ready ? ' ready' : ''}" ${style}>
          ${head}
          <div class="pad-join-main">
            <div class="pad-p">${p}</div>
            <div class="pad-racer">
              <button data-act="left">&#9664;</button>
              <span>${esc(seat.racer)}</span>
              <button data-act="right">&#9654;</button>
            </div>
            <button class="pad-big" data-act="ready">${seat.ready ? 'READY!' : 'READY?'}</button>
          </div>
          <div class="pad-join-side">
            ${sets}
            <div class="pad-tilts">
              <button class="pad-tilt" data-do="tilt">Steer: ${tiltOn ? 'tilt the phone' : 'drag'}</button>
              ${tiltOn ? `<button class="pad-tilt" data-do="level">Tilt: ${TILT_LEVELS[tiltLevel].name}</button>` : ''}
            </div>
            <div class="pad-status">${esc(status)}</div>
          </div>
        </div>`,
    };
  }
  if (seat.phase === 'results') {
    return { key: `results:${seat.n}`, html: `<div class="pad-card" ${style}>${head}<div class="pad-p">${p}</div><button class="pad-big" data-act="continue">CONTINUE</button></div>` };
  }
  return {
    key: `race:${seat.n}:${tiltOn}`,
    html: `
      <div class="pad-race" ${style}>
        <div class="pad-steer" data-steer><div class="pad-steer-hint">${tiltOn ? 'Tilt to steer<br />(or drag here)' : 'Drag to steer<br />up and down to glide'}</div><div class="pad-steer-dot"></div></div>
        <div class="pad-top"><span class="pad-p">${p}</span><span>${esc(seat.racer)}</span><button data-act="pause">II</button></div>
        <div class="pad-buttons">
          <button class="pad-item" data-hold="item">ITEM</button>
          <button class="pad-hop" data-hold="drift">HOP<br /><small>hold to drift</small></button>
          <button class="pad-brake" data-hold="brake">BRAKE</button>
          <button class="pad-look" data-hold="lookBack">LOOK<br />BACK</button>
        </div>
      </div>`,
  };
}

let lastKey = '';
function render(): void {
  const s = view();
  if (s.key === lastKey) return;
  lastKey = s.key;
  root.innerHTML = s.html;
  document.body.classList.toggle('racing', s.key.startsWith('race:'));
}

/** Full screen, sideways and awake: asked for on a tap (browsers want one). */
async function settle(): Promise<void> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    await (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } }).orientation?.lock?.('landscape');
  } catch {
    // Not allowed here (iPhones): fine as it is.
  }
  try {
    await (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<unknown> } }).wakeLock?.request('screen');
  } catch {
    // No wake lock: the phone may dim mid-race.
  }
}

function join(): void {
  const c = root.querySelector<HTMLInputElement>('.pad-code')?.value.trim().toUpperCase() ?? code;
  name = root.querySelector<HTMLInputElement>('.pad-name')?.value.trim().slice(0, 16) ?? name;
  save(NAME_KEY, name);
  if (!isRoomCode(c)) {
    status = 'That code is four letters, as the TV shows it';
    lastKey = '';
    return render();
  }
  code = c;
  history.replaceState(null, '', `${location.pathname}?c=${code}`);
  void settle();
  connect();
}

root.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-do], [data-act]');
  if (!t) return;
  if (t.dataset.act) return act(t.dataset.act as PadAction, t.dataset.row as PadRow | undefined);
  const what = t.dataset.do;
  if (what === 'join') join();
  else if (what === 'leave') {
    act('leave');
    leave();
  } else if (what === 'level') {
    tiltLevel = (tiltLevel + 1) % TILT_LEVELS.length;
    save(TILT_LEVEL_KEY, String(tiltLevel));
    render();
  } else if (what === 'tilt') {
    tiltOn = !tiltOn;
    save(TILT_KEY, tiltOn ? '1' : '0');
    if (tiltOn) void tilt.start().then((ok) => {
      if (!ok) {
        tiltOn = false;
        status = 'Tilt is not available on this phone';
      }
      render();
    });
    else tilt.stop();
    render();
  }
});

root.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.target as HTMLElement).matches('input')) join();
});

// The race's controls: buttons held while touched, the drag steering from where the finger went down.
let settled = false;
root.addEventListener('pointerdown', (e) => {
  // Tilt needs a tap to start on iPhones, and full screen and the wake lock a tap too: any tap will do.
  if (tiltOn && !tilt.running) void tilt.start();
  if (socket && !settled) {
    settled = true;
    void settle();
  }
  const t = e.target as HTMLElement;
  const hold = t.closest<HTMLElement>('[data-hold]')?.dataset.hold as keyof typeof HELD | undefined;
  if (hold) {
    e.preventDefault();
    t.closest<HTMLElement>('[data-hold]')!.setPointerCapture(e.pointerId);
    held.add(hold);
    if (hold === 'drift') taps |= TAP.drift;
    if (hold === 'item') taps |= TAP.item;
    pump(true);
    return;
  }
  const zone = t.closest<HTMLElement>('[data-steer]');
  if (zone && drag.id < 0) {
    e.preventDefault();
    zone.setPointerCapture(e.pointerId);
    Object.assign(drag, { id: e.pointerId, x: e.clientX, y: e.clientY, steer: 0, pitch: 0 });
    moveDot(zone, e.clientX, e.clientY);
  }
});

root.addEventListener('pointermove', (e) => {
  if (e.pointerId !== drag.id) return;
  drag.steer = Math.max(-1, Math.min(1, (e.clientX - drag.x) / (innerWidth * DRAG_LOCK)));
  drag.pitch = Math.max(-1, Math.min(1, -(e.clientY - drag.y) / (innerHeight * DRAG_PITCH)));
  const zone = root.querySelector<HTMLElement>('[data-steer]');
  if (zone) moveDot(zone, e.clientX, e.clientY);
});

function release(e: PointerEvent): void {
  if (e.pointerId === drag.id) {
    drag.id = -1;
    drag.steer = drag.pitch = 0;
    root.querySelector<HTMLElement>('.pad-steer-dot')?.classList.remove('on');
    return;
  }
  const hold = (e.target as HTMLElement).closest<HTMLElement>('[data-hold]')?.dataset.hold as keyof typeof HELD | undefined;
  if (hold) {
    held.delete(hold);
    pump(true);
  }
}
root.addEventListener('pointerup', release);
root.addEventListener('pointercancel', release);

/** The dot under the steering finger, so you can see how far you've dragged. */
function moveDot(zone: HTMLElement, x: number, y: number): void {
  const dot = zone.querySelector<HTMLElement>('.pad-steer-dot');
  if (!dot) return;
  const r = zone.getBoundingClientRect();
  dot.style.left = `${x - r.left}px`;
  dot.style.top = `${y - r.top}px`;
  dot.classList.add('on');
}

// Back to the phone after a lock or a switch: awake again, and nothing left held.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    held.clear();
    drag.id = -1;
    drag.steer = drag.pitch = 0;
    pump(true);
  } else if (socket) void settle();
});

// No long-press menus or double-tap zoom on the controls.
document.addEventListener('contextmenu', (e) => e.preventDefault());

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

if (isRoomCode(code)) connect();
else render();
