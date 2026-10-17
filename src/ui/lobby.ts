import { ENGINE_CLASSES, RACERS, type RacerDef } from '../physics/racers';
import { identity, setName } from '../net/identity';
import { isRoomCode, makeRoomCode, type RoomSettings, type RoomStart, type RoomState } from '../net/protocol';
import { RoomClient } from '../net/room';
import { TRACK_LIST } from '../tracks/index';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const racerById = (id: string) => RACERS.find((r) => r.id === id) ?? RACERS[0];

/**
 * Online rooms screen (docs/MULTIPLAYER.md section 6): create a room or
 * join one by code, then the lobby: members, racers, ready, and the host's
 * track and class.
 */
export class LobbyScreen {
  client: RoomClient | null = null;
  /** The room started a race. */
  onStart: (start: RoomStart, client: RoomClient) => void = () => {};
  /** The host changed the track (the attract race behind the lobby follows it). */
  onSettings: (settings: RoomSettings) => void = () => {};
  onBack: () => void = () => {};
  /** Every room update (the game follows pauses from it). */
  onRoomState: (s: RoomState) => void = () => {};
  private readonly el = document.createElement('div');
  private status = '';
  private editingName = false;
  private lastTrack = -1;
  /** The last code tried, kept in the join box (e.g. from a link, while naming yourself). */
  private code = '';
  private lastPanel = '';
  private lastMembers = '';

  constructor(
    parent: HTMLElement,
    /** The racer picked in the menu, used as the first choice in a room. */
    private readonly preferredRacer: () => RacerDef,
  ) {
    this.el.className = 'lobby';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.click(e.target as HTMLElement));
    // Typing a code or name mustn't drive the game.
    this.el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key !== 'Enter') return;
      const t = e.target as HTMLElement;
      if (t.classList.contains('lobby-code')) this.join();
      if (t.classList.contains('lobby-name-input')) void this.saveName();
    });
    this.render();
  }

  get visible(): boolean {
    return this.el.classList.contains('show');
  }

  show(visible: boolean): void {
    this.el.classList.toggle('show', visible);
    if (visible) this.render();
  }

  /** Joins a room straight away, e.g. from a ?room= link. */
  joinCode(code: string): void {
    this.code = code.toUpperCase();
    this.connect(this.code, false);
  }

  leave(): void {
    this.client?.close();
    this.client = null;
    this.lastTrack = -1;
    this.status = '';
    this.render();
  }

  /** After a race: the host brings the room back to the lobby. */
  backToLobby(): void {
    const c = this.client;
    if (c?.state && c.state.members.find((m) => m.host)?.playerId === identity().playerId) c.send({ t: 'lobby' });
    this.render();
  }

  private connect(code: string, create: boolean): void {
    if (!identity().name) {
      this.status = 'Set your name first';
      this.render();
      return;
    }
    this.client?.close();
    const c = new RoomClient(code, create, this.preferredRacer().id);
    this.client = c;
    this.status = create ? `Creating room ${code}...` : `Joining ${code}...`;
    c.onState = (s) => {
      this.status = '';
      this.onRoomState(s);
      if (s.settings.track !== this.lastTrack) {
        this.lastTrack = s.settings.track;
        this.onSettings(s.settings);
      }
      this.render();
    };
    c.onError = (message, fatal) => {
      // A clash on a fresh random code: just try another.
      if (fatal && message === 'Code taken' && create) return this.connect(makeRoomCode(), true);
      if (fatal) this.client = null;
      this.status = message;
      this.render();
    };
    c.onStart = (start) => this.onStart(start, c);
    this.render();
  }

  private join(): void {
    const input = this.el.querySelector<HTMLInputElement>('.lobby-code');
    const code = (input?.value ?? '').trim().toUpperCase();
    if (!isRoomCode(code)) {
      this.status = 'Room codes are 4 letters, like KZRT';
      this.render();
      return;
    }
    this.code = code;
    this.connect(code, false);
  }

  private async saveName(): Promise<void> {
    const input = this.el.querySelector<HTMLInputElement>('.lobby-name-input');
    try {
      await setName(input?.value ?? '');
      this.editingName = false;
      this.status = '';
    } catch (err) {
      this.status = (err as Error).message;
    }
    this.render();
  }

  private click(t: HTMLElement): void {
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    const c = this.client;
    const s = c?.state;
    switch (act) {
      case 'create':
        return this.connect(makeRoomCode(), true);
      case 'join':
        return this.join();
      case 'back':
        this.leave();
        return this.onBack();
      case 'leave':
        return this.leave();
      case 'name':
        this.editingName = true;
        this.render();
        this.el.querySelector<HTMLInputElement>('.lobby-name-input')?.focus();
        return;
      case 'save-name':
        void this.saveName();
        return;
      case 'copy': {
        const url = `${location.origin}${location.pathname}?room=${c?.code}`;
        navigator.clipboard?.writeText(url).then(
          () => ((this.status = 'Link copied'), this.render()),
          () => ((this.status = url), this.render()),
        );
        return;
      }
    }
    if (!c || !s) return;
    const me = s.members.find((m) => m.playerId === identity().playerId);
    const host = me?.host ?? false;
    const dir = Number(t.closest<HTMLElement>('[data-dir]')?.dataset.dir ?? 0);
    if (act === 'racer' && me) {
      // Step to the next racer nobody else has.
      const taken = new Set(s.members.filter((m) => m !== me).map((m) => m.racerId));
      let i = RACERS.findIndex((r) => r.id === me.racerId);
      for (let k = 0; k < RACERS.length; k++) {
        i = (i + dir + RACERS.length) % RACERS.length;
        if (!taken.has(RACERS[i].id)) break;
      }
      c.send({ t: 'racer', racerId: RACERS[i].id });
    } else if (act === 'track' && host) {
      c.send({ t: 'settings', settings: { track: (s.settings.track + dir + TRACK_LIST.length) % TRACK_LIST.length } });
    } else if (act === 'engine' && host) {
      const i = ENGINE_CLASSES.indexOf(s.settings.engine);
      c.send({ t: 'settings', settings: { engine: ENGINE_CLASSES[(i + dir + ENGINE_CLASSES.length) % ENGINE_CLASSES.length] } });
    } else if (act === 'ready' && me) {
      c.send({ t: 'ready', ready: !me.ready });
    } else if (act === 'start' && host) {
      c.send({ t: 'start' });
    }
  }

  private render(): void {
    if (!this.visible) return;
    const id = identity();
    const s = this.client?.state;
    const status = this.status ? `<div class="lobby-status">${esc(this.status)}</div>` : '';
    const nameRow = this.editingName || !id.name
      ? `<div class="lobby-name"><input class="lobby-name-input" maxlength="16" placeholder="your name" value="${esc(id.name ?? '')}" /><button data-act="save-name">Save</button></div>`
      : `<div class="lobby-name"><span>Racing as <b>${esc(id.name)}</b></span><button data-act="name">Change</button></div>`;

    if (!this.client || !s) {
      this.setPanel(`
        <div class="lobby-panel">
          <div class="lobby-title hud-big">ONLINE</div>
          ${nameRow}
          <button class="lobby-big hud-big" data-act="create"${this.client ? ' disabled' : ''}>CREATE ROOM</button>
          <div class="lobby-join">
            <input class="lobby-code" maxlength="4" placeholder="CODE" value="${esc(this.code)}" autocapitalize="characters" autocomplete="off" spellcheck="false" />
            <button data-act="join">JOIN</button>
          </div>
          ${status}
          <button class="lobby-back" data-act="back">&larr; Back</button>
        </div>`);
      return;
    }

    const me = s.members.find((m) => m.playerId === id.playerId);
    const host = me?.host ?? false;
    const members = s.members
      .map((m) => {
        const r = racerById(m.racerId);
        return `<div class="lobby-member${m.playerId === id.playerId ? ' me' : ''}">
          <span class="dot" style="background:${hex(r.color)}"></span>
          <span class="who"><b>${esc(m.name)}</b><small>${r.name}</small></span>
          <span class="tags">${m.host ? '<i class="tag host">HOST</i>' : ''}<i class="tag ${m.ready ? 'ready' : 'waiting'}">${m.ready ? 'READY' : '...'}</i></span>
          <span class="ping">${m.ping ? `${m.ping} ms` : ''}</span>
        </div>`;
      })
      .join('');
    const waiting = s.members.filter((m) => !m.ready).map((m) => m.name);
    const arrows = (act: string, value: string, enabled: boolean) =>
      enabled
        ? `<button class="menu-arrow" data-act="${act}" data-dir="-1">&#9664;</button><div class="lobby-value">${value}</div><button class="menu-arrow" data-act="${act}" data-dir="1">&#9654;</button>`
        : `<span></span><div class="lobby-value">${value}</div><span></span>`;
    const racing = s.phase === 'racing';
    const action = host
      ? `<button class="lobby-big hud-big" data-act="start"${waiting.length || racing ? ' disabled' : ''}>${racing ? 'RACING...' : 'START RACE'}</button>
         ${waiting.length ? `<div class="lobby-hint">Waiting for ${waiting.map(esc).join(', ')}</div>` : ''}`
      : `<button class="lobby-big hud-big${me?.ready ? ' on' : ''}" data-act="ready"${racing ? ' disabled' : ''}>${racing ? 'RACING...' : me?.ready ? 'READY!' : 'READY?'}</button>`;
    this.setPanel(`
      <div class="lobby-panel">
        <div class="lobby-head">
          <div class="lobby-title hud-big">ROOM ${s.code}</div>
          <button data-act="copy">Copy link</button>
        </div>
        <div class="lobby-members"></div>
        <div class="lobby-row"><span class="lobby-label">Racer</span>${arrows('racer', racerById(me?.racerId ?? '').name, true)}</div>
        <div class="lobby-row"><span class="lobby-label">Track</span>${arrows('track', TRACK_LIST[s.settings.track].name, host)}</div>
        <div class="lobby-row"><span class="lobby-label">Class</span>${arrows('engine', s.settings.engine, host)}</div>
        ${action}
        <div class="lobby-note">${s.members.length}/8 racers, CPUs fill the rest. Preview: other players drive as CPUs on your screen until live online racing arrives.</div>
        ${status}
        <button class="lobby-back" data-act="leave">Leave room</button>
      </div>`);
    // Members (with their ping times) update on their own, so buttons aren't swapped mid-tap.
    const list = this.el.querySelector('.lobby-members');
    if (list && members !== this.lastMembers) {
      this.lastMembers = members;
      list.innerHTML = members;
    }
  }

  /** Rebuilds the panel only when it changed, keeping focus and taps intact otherwise. */
  private setPanel(html: string): void {
    if (html === this.lastPanel) return;
    this.lastPanel = html;
    this.lastMembers = '';
    this.el.innerHTML = html;
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
