import { RACERS } from '../physics/racers';
import { identity, setName } from '../net/identity';
import { fetchRecords, type RecordBoard } from '../net/records';
import { formatTime } from './hud';

const ROWS = 10;

/**
 * The records leaderboard beside the picker: a track's fastest full races
 * (Single Race and the Track Generator, the daily included), or a cup's
 * best results (Grand Prix), per class. Same look as the Time Trial board.
 */
export class RecordsPanel {
  private readonly el = document.createElement('div');
  private board: RecordBoard | null = null;
  private status = '';
  private key = '';
  private title = '';
  private editing = false;
  private request = 0;

  constructor(parent: HTMLElement) {
    this.el.className = 'board records';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-act=name]')) {
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

  /** Loads a board by name (no-op if it's already showing). */
  load(board: string, title: string, force = false): void {
    if (board === this.key && !force) return;
    this.key = board;
    this.title = title;
    this.board = null;
    this.status = 'Loading...';
    this.render();
    const req = ++this.request;
    fetchRecords(board)
      .then((b) => {
        if (req !== this.request) return;
        this.board = b;
        this.status = b.entries ? '' : board.startsWith('cup.') ? 'No cup results yet. Win it!' : 'No race times yet. Set the first!';
      })
      .catch(() => {
        if (req === this.request) this.status = 'Offline: records are only saved on this device.';
      })
      .finally(() => req === this.request && this.render());
  }

  private async saveName(): Promise<void> {
    const input = this.el.querySelector<HTMLInputElement>('input');
    if (!input) return;
    try {
      await setName(input.value);
      this.editing = false;
      this.status = '';
    } catch (err) {
      this.status = (err as Error).message;
    }
    this.render();
  }

  private render(): void {
    const me = identity();
    const cup = this.board?.kind === 'cup' || this.key.startsWith('cup.');
    const color = (id: string) => `#${(RACERS.find((r) => r.id === id)?.color ?? 0xffffff).toString(16).padStart(6, '0')}`;
    const value = (r: { points: number; timeMs: number; detail: number | number[] }) =>
      cup ? `${r.points} pts <small>${formatTime(r.timeMs / 1000)}</small>` : `${formatTime(r.timeMs / 1000)}${typeof r.detail === 'number' && r.detail > 0 ? ` <small>style ${r.detail.toLocaleString('en-US')}</small>` : ''}`;
    const rows = (this.board?.top ?? [])
      .slice(0, ROWS)
      .map(
        (r, i) => `
        <div class="board-row${r.playerId === me.playerId ? ' me' : ''}">
          <span class="pos">${i + 1}</span><span class="dot" style="background:${color(r.racerId)}"></span>
          <span class="name">${escape(r.name)}</span><span class="time">${value(r)}</span>
        </div>`,
      )
      .join('');
    const mine = this.board?.me && this.board.me.rank > ROWS ? `<div class="board-mine">You: #${this.board.me.rank} ${value(this.board.me)}</div>` : '';
    const name = this.editing
      ? `<div class="board-name"><input maxlength="16" placeholder="your name" value="${escape(me.name ?? '')}" /><button data-act="save">Save</button></div>`
      : `<div class="board-name"><span>${me.name ? `Racing as <b>${escape(me.name)}</b>` : 'Set a name to post times'}</span><button data-act="name">${me.name ? 'Change' : 'Set name'}</button></div>`;
    this.el.innerHTML = `
      <div class="board-title hud-big">${cup ? 'CUP RECORDS' : 'FASTEST RACES'}</div>
      <div class="board-sub">${escape(this.title)}</div>
      ${name}
      ${rows}
      ${mine}
      ${this.status ? `<div class="board-status">${escape(this.status)}</div>` : ''}
      <div class="board-hint">${cup ? 'Most points wins; the quicker cup breaks a tie. Finish every race to post.' : 'A full race, items and all. Your best is kept.'}</div>`;
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
