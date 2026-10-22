import { RACERS, type EngineClass } from '../physics/racers';
import { identity } from '../net/identity';
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

  /**
   * The ghost to race, one only: the picked run, or else the next one up
   * from you, the run just faster than your best (2nd chases 1st). With no
   * time yet, the slowest on the board; if you lead, none (your own best
   * ghost races). Beat one and the next race brings the one after.
   */
  get target(): BoardEntry | null {
    if (this.picked) return this.picked;
    const top = this.board?.top ?? [];
    if (!top.length) return null;
    const me = identity().playerId;
    const best = this.myBest();
    if (best === null) return top[top.length - 1];
    const faster = top.filter((r) => r.playerId !== me && r.totalMs < best);
    return faster[faster.length - 1] ?? null;
  }

  /** Your best on this board in ms: posted, or this browser's local record if faster. */
  private myBest(): number | null {
    const times = [this.board?.me?.totalMs, this.localBest()].filter((t): t is number => typeof t === 'number');
    return times.length ? Math.min(...times) : null;
  }
  private readonly el = document.createElement('div');
  private board: Board | null = null;
  private status = '';
  private key = '';
  private request = 0;

  constructor(
    parent: HTMLElement,
    /** This browser's best time on the showing board (ms), if any. */
    private readonly localBest: () => number | null = () => null,
  ) {
    this.el.className = 'board';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const row = t.closest<HTMLElement>('[data-run]');
      if (row) {
        const entry = this.board?.top.find((r) => r.runId === row.dataset.run) ?? null;
        this.picked = this.picked?.runId === entry?.runId ? null : entry;
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

  private hint(): string {
    const t = this.target;
    if (!this.board?.top.length) return '';
    if (this.picked && t) return `Racing ${escape(t.name)}'s ghost`;
    if (!t) return "You're the fastest here: racing your own best. Pick a run to race it.";
    if (this.myBest() === null) return `Racing ${escape(t.name)}, the slowest here: beat them and the next one up is next. Pick any run to change.`;
    return `Racing ${escape(t.name)}, the next one up from you: beat them and the one after is next. Pick any run to change.`;
  }

  private render(trackName?: string, engine?: EngineClass): void {
    if (trackName) this.title = `${trackName} · ${engine}`;
    const me = identity();
    const color = (id: string) => `#${(RACERS.find((r) => r.id === id)?.color ?? 0xffffff).toString(16).padStart(6, '0')}`;
    const rows = (this.board?.top ?? [])
      .slice(0, ROWS)
      .map(
        (r, i) => `
        <div class="board-row${r.playerId === me.playerId ? ' me' : ''}${this.target?.runId === r.runId ? ' picked' : ''}" data-run="${r.runId}">
          <span class="pos">${i + 1}</span><span class="dot" style="background:${color(r.racerId)}"></span>
          <span class="name">${escape(r.name)}${this.target?.runId === r.runId ? ' <i class="ghost-tag">GHOST</i>' : ''}</span><span class="time">${formatTime(r.totalMs / 1000)}</span>
        </div>`,
      )
      .join('');
    const mine = this.board?.me && this.board.me.rank > ROWS ? `<div class="board-mine">You: #${this.board.me.rank} ${formatTime(this.board.me.totalMs / 1000)}</div>` : '';
    // Whose runs these are: a name is asked for when there's a run to post (ui/namePrompt.ts).
    const name = me.name ? `<div class="board-name"><span>Racing as <b>${escape(me.name)}</b></span></div>` : '';
    this.el.innerHTML = `
      <div class="board-title hud-big">LEADERBOARD</div>
      <div class="board-sub">${this.title}</div>
      ${name}
      ${rows}
      ${mine}
      ${this.status ? `<div class="board-status">${escape(this.status)}</div>` : ''}
      <div class="board-hint">${this.hint()}</div>`;
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
