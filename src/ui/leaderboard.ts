import { RACERS, type EngineClass } from '../physics/racers';
import { identity, setName } from '../net/identity';
import { fetchBoard, type Board, type BoardEntry } from '../net/trials';
import { formatTime } from './hud';

const ROWS = 10;

/**
 * Online Time Trial leaderboard beside the picker: top runs for the
 * track and class, your rank, your name, and a run to race as a ghost.
 */
export class LeaderboardPanel {
  /** The run picked to race as a ghost, if any. */
  picked: BoardEntry | null = null;
  private readonly el = document.createElement('div');
  private board: Board | null = null;
  private status = '';
  private key = '';
  private editing = false;
  private request = 0;

  constructor(parent: HTMLElement) {
    this.el.className = 'board';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const row = t.closest<HTMLElement>('[data-run]');
      if (row) {
        const entry = this.board?.top.find((r) => r.runId === row.dataset.run) ?? null;
        this.picked = this.picked?.runId === entry?.runId ? null : entry;
        this.render();
      } else if (t.closest('[data-act=name]')) {
        this.editing = true;
        this.render();
        this.el.querySelector<HTMLInputElement>('input')?.focus();
      } else if (t.closest('[data-act=save]')) {
        void this.saveName();
      }
    });
    // Typing a name must not drive the menu or the kart.
    this.el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void this.saveName();
      if (e.key === 'Escape') {
        this.editing = false;
        this.render();
      }
    });
  }

  show(visible: boolean): void {
    this.el.classList.toggle('show', visible);
  }

  /** Loads the board for a track and class (no-op if it's already showing). */
  load(trackId: string, trackName: string, engine: EngineClass, force = false): void {
    const key = `${trackId}.${engine}`;
    if (key === this.key && !force) return;
    if (key !== this.key) this.picked = null;
    this.key = key;
    this.board = null;
    this.status = 'Loading...';
    this.render(trackName, engine);
    const req = ++this.request;
    fetchBoard(trackId, engine)
      .then((b) => {
        if (req !== this.request) return;
        this.board = b;
        this.status = b.entries ? '' : 'No runs yet. Set the first!';
      })
      .catch(() => {
        if (req === this.request) this.status = 'Offline: runs are only saved on this device.';
      })
      .finally(() => req === this.request && this.render(trackName, engine));
  }

  private title = '';

  private async saveName(): Promise<void> {
    const input = this.el.querySelector<HTMLInputElement>('input');
    if (!input) return;
    try {
      await setName(input.value);
      this.editing = false;
      this.status = '';
    } catch (err) {
      this.status = `Name not saved: ${(err as Error).message}`;
    }
    this.render();
  }

  private render(trackName?: string, engine?: EngineClass): void {
    if (trackName) this.title = `${trackName} · ${engine}`;
    const me = identity();
    const color = (id: string) => `#${(RACERS.find((r) => r.id === id)?.color ?? 0xffffff).toString(16).padStart(6, '0')}`;
    const rows = (this.board?.top ?? [])
      .slice(0, ROWS)
      .map(
        (r, i) => `
        <div class="board-row${r.playerId === me.playerId ? ' me' : ''}${this.picked?.runId === r.runId ? ' picked' : ''}" data-run="${r.runId}">
          <span class="pos">${i + 1}</span><span class="dot" style="background:${color(r.racerId)}"></span>
          <span class="name">${escape(r.name)}</span><span class="time">${formatTime(r.totalMs / 1000)}</span>
        </div>`,
      )
      .join('');
    const mine = this.board?.me && this.board.me.rank > ROWS ? `<div class="board-mine">You: #${this.board.me.rank} ${formatTime(this.board.me.totalMs / 1000)}</div>` : '';
    const name = this.editing
      ? `<div class="board-name"><input maxlength="16" placeholder="your name" value="${escape(me.name ?? '')}" /><button data-act="save">Save</button></div>`
      : `<div class="board-name"><span>${me.name ? `Racing as <b>${escape(me.name)}</b>` : 'Set a name to post runs'}</span><button data-act="name">${me.name ? 'Change' : 'Set name'}</button></div>`;
    this.el.innerHTML = `
      <div class="board-title hud-big">LEADERBOARD</div>
      <div class="board-sub">${this.title}</div>
      ${name}
      ${rows}
      ${mine}
      ${this.status ? `<div class="board-status">${escape(this.status)}</div>` : ''}
      <div class="board-hint">${this.board?.top.length ? 'Pick a run to race its ghost' : ''}</div>`;
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
