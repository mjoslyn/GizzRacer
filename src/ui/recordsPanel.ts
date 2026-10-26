import { RACERS } from '../physics/racers';
import { identity } from '../net/identity';
import { fetchRecords, type RecordBoard } from '../net/records';
import { formatTime } from './hud';

const ROWS = 10;

/**
 * The records leaderboard beside the picker: a track's fastest full races
 * (Single Race and the Track Generator, the daily included), or a cup's
 * best results (Grand Prix), per class. A cup has a second board of its
 * fastest runs, a tab away. Same look as the Time Trial board.
 */
export class RecordsPanel {
  private readonly el = document.createElement('div');
  private board: RecordBoard | null = null;
  private status = '';
  private key = '';
  private title = '';
  private request = 0;
  /** The board picked (a track's, or a cup's points), and the cup's fastest board if it has one. */
  private main = '';
  private fastest: string | null = null;
  /** The cup's fastest board is the one showing; it stays picked from cup to cup. */
  private byTime = false;

  constructor(parent: HTMLElement) {
    this.el.className = 'board records';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (!tab) return;
      this.byTime = tab.dataset.tab === 'time';
      this.fetch();
    });
  }

  show(visible: boolean): void {
    this.el.classList.toggle('show', visible);
  }

  /** Loads a board by name, with a cup's fastest board for its second tab (no-op if it's already showing). */
  load(board: string, title: string, force = false, fastest: string | null = null): void {
    this.main = board;
    this.fastest = fastest;
    this.title = title;
    this.fetch(force);
  }

  private fetch(force = false): void {
    const board = this.byTime && this.fastest ? this.fastest : this.main;
    if (board === this.key && !force) return;
    this.key = board;
    this.board = null;
    this.status = 'Loading...';
    this.render();
    const req = ++this.request;
    fetchRecords(board)
      .then((b) => {
        if (req !== this.request) return;
        this.board = b;
        this.status = b.entries ? '' : board.startsWith('cup.') ? 'No cup results yet. Win it!' : board.startsWith('cuptime.') ? 'No cup times yet. Set the first!' : 'No race times yet. Set the first!';
      })
      .catch(() => {
        if (req === this.request) this.status = 'Offline: records are only saved on this device.';
      })
      .finally(() => req === this.request && this.render());
  }

  private render(): void {
    const me = identity();
    const cup = this.key.startsWith('cup.');
    const cupTime = this.key.startsWith('cuptime.');
    const color = (id: string) => `#${(RACERS.find((r) => r.id === id)?.color ?? 0xffffff).toString(16).padStart(6, '0')}`;
    const value = (r: { points: number; timeMs: number; detail: number | number[] }) =>
      cup ? `${r.points} pts <small>${formatTime(r.timeMs / 1000)}</small>` : cupTime ? `${formatTime(r.timeMs / 1000)} <small>${r.points} pts</small>` : `${formatTime(r.timeMs / 1000)}${typeof r.detail === 'number' && r.detail > 0 ? ` <small>style ${r.detail.toLocaleString('en-US')}</small>` : ''}`;
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
    // Whose records these are: a name is asked for when there's a result to post (ui/namePrompt.ts).
    const name = me.name ? `<div class="board-name"><span>Racing as <b>${escape(me.name)}</b></span></div>` : '';
    const tabs = this.fastest
      ? `<div class="board-tabs"><button tabindex="-1" data-tab="points"${cupTime ? '' : ' class="on"'}>POINTS</button><button tabindex="-1" data-tab="time"${cupTime ? ' class="on"' : ''}>FASTEST</button></div>`
      : '';
    const hint = cup ? 'Most points wins; the quicker cup breaks a tie. Finish every race to post.' : cupTime ? 'The quickest cup, its races added up, wherever you finish. Your best is kept.' : 'A full race, items and all. Your best is kept.';
    this.el.innerHTML = `
      <div class="board-title hud-big">${cup ? 'CUP RECORDS' : cupTime ? 'FASTEST CUPS' : 'FASTEST RACES'}</div>
      ${tabs}
      <div class="board-sub">${escape(this.title)}</div>
      ${name}
      ${rows}
      ${mine}
      ${this.status ? `<div class="board-status">${escape(this.status)}</div>` : ''}
      <div class="board-hint">${hint}</div>`;
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
