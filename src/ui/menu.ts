import { ENGINE_CLASSES, RACERS, type EngineClass, type RacerDef } from '../physics/racers';
import { TRACK_LIST } from '../tracks/index';

export interface MenuChoice {
  track: number;
  racer: RacerDef;
  engine: EngineClass;
}

type Row = 'track' | 'racer' | 'engine';
const ROWS: Row[] = ['track', 'racer', 'engine'];
const STAT_NAMES = ['speed', 'accel', 'weight', 'handling'] as const;

/** Track, racer and class picker. Keyboard, gamepad-ish arrows, mouse and touch. */
export class Menu {
  private readonly el = document.createElement('div');
  private row = 0;
  choice: MenuChoice;

  constructor(
    parent: HTMLElement,
    initial: MenuChoice,
    private readonly onChange: (c: MenuChoice, row: Row) => void,
    private readonly onStart: (c: MenuChoice) => void,
  ) {
    this.choice = { ...initial };
    this.el.className = 'menu';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-row], [data-start]');
      if (!t) return;
      if (t.dataset.start !== undefined) {
        this.onStart(this.choice);
        return;
      }
      this.row = ROWS.indexOf(t.dataset.row as Row);
      if (t.dataset.dir) this.change(Number(t.dataset.dir));
      else this.render();
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

  /** Returns true if the key was used. */
  key(code: string): boolean {
    if (!this.visible) return false;
    if (code === 'ArrowUp' || code === 'KeyW') this.row = (this.row + ROWS.length - 1) % ROWS.length;
    else if (code === 'ArrowDown' || code === 'KeyS') this.row = (this.row + 1) % ROWS.length;
    else if (code === 'ArrowLeft' || code === 'KeyA') return this.change(-1), true;
    else if (code === 'ArrowRight' || code === 'KeyD') return this.change(1), true;
    else if (code === 'Enter' || code === 'Space') return this.onStart(this.choice), true;
    else return false;
    this.render();
    return true;
  }

  private change(dir: number): void {
    const c = this.choice;
    const row = ROWS[this.row];
    const step = <T>(list: readonly T[], v: T) => list[(list.indexOf(v) + dir + list.length) % list.length];
    if (row === 'track') c.track = (c.track + dir + TRACK_LIST.length) % TRACK_LIST.length;
    else if (row === 'racer') c.racer = step(RACERS, c.racer);
    else c.engine = step(ENGINE_CLASSES, c.engine);
    this.render();
    this.onChange(this.choice, row);
  }

  private render(): void {
    const c = this.choice;
    const color = `#${c.racer.color.toString(16).padStart(6, '0')}`;
    const stats = STAT_NAMES.map(
      (k) => `<div class="menu-stat"><span>${k}</span><i style="width:${c.racer.stats[k] * 20}%;background:${color}"></i></div>`,
    ).join('');
    const line = (row: Row, label: string, value: string, extra = '') => `
      <div class="menu-row${ROWS[this.row] === row ? ' on' : ''}" data-row="${row}">
        <div class="menu-label">${label}</div>
        <button class="menu-arrow" data-row="${row}" data-dir="-1">&#9664;</button>
        <div class="menu-value hud-big">${value}</div>
        <button class="menu-arrow" data-row="${row}" data-dir="1">&#9654;</button>
        ${extra}
      </div>`;
    this.el.innerHTML = `
      <div class="menu-panel">
        <div class="menu-title hud-big">CHOOSE YOUR RACE</div>
        ${line('track', 'Track', TRACK_LIST[c.track].name)}
        ${line('racer', 'Racer', c.racer.name, `<div class="menu-stats">${stats}</div>`)}
        ${line('engine', 'Class', c.engine)}
        <button class="menu-start hud-big" data-start>RACE!</button>
        <div class="menu-hint">&uarr;&darr; choose &middot; &larr;&rarr; change &middot; Enter race</div>
      </div>`;
  }
}
