import { dailyLabel, dailyParams } from '../core/daily';
import { cupTrophies, progress, raceKey, unlocks, type Unlocks } from '../core/progress';
import type { SavedTrack } from '../core/savedTracks';
import { formatTime } from './hud';
import { ENGINE_CLASSES, RACERS, type EngineClass, type RacerDef } from '../physics/racers';
import { GEN_COMPLEXITY_MAX, GEN_LENGTHS, GEN_THEMES, GEN_THEME_NAMES, trackName, type GenParams } from '../tracks/generator';
import { CUPS, RANDOM_CUP_ID, RANDOM_CUP_NAME, TRACK_LIST, randomCupTracks } from '../tracks/index';

export type RaceMode = 'grandPrix' | 'single' | 'timeTrial' | 'generator' | 'online';

export const MODE_NAMES: Record<RaceMode, string> = {
  grandPrix: 'Grand Prix',
  single: 'Single Race',
  timeTrial: 'Time Trial',
  generator: 'Track Generator',
  online: 'Online',
};
const MODES = Object.keys(MODE_NAMES) as RaceMode[];

/** The generator's pick: the daily track (slot DAILY_SLOT), a new track from the dials (slot -1) or a saved one. */
export interface GenChoice {
  slot: number;
  params: GenParams;
}

export const DAILY_SLOT = -2;

export interface MenuChoice {
  mode: RaceMode;
  track: number;
  /** The Grand Prix cup: an index into CUPS, or CUPS.length for the Random Cup. */
  cup: number;
  /** The Random Cup's tracks, drawn each time the picker lands on it. */
  randomTracks: number[];
  gen: GenChoice;
  racer: RacerDef;
  engine: EngineClass;
  /** Mirror mode: the track flipped left for right (unlocked by gold in every cup). */
  mirror: boolean;
}

export type MenuRow = 'mode' | 'track' | 'gen' | 'theme' | 'complexity' | 'length' | 'racer' | 'engine' | 'mirror';
const TROPHY_GLYPH = { gold: '&#9733;', silver: '&#9733;', bronze: '&#9733;' } as const;
const STAT_NAMES = ['speed', 'accel', 'weight', 'handling'] as const;
const LENGTH_NAMES = { short: 'Short', medium: 'Medium', long: 'Long' };

export const newSeed = () => Math.floor(Math.random() * 1e9);

/** The cup a Grand Prix choice is for: one of CUPS, or the Random Cup and its draw. */
export function chosenCup(c: MenuChoice): { id: string; name: string; tracks: number[] } {
  return c.cup < CUPS.length ? CUPS[c.cup] : { id: RANDOM_CUP_ID, name: RANDOM_CUP_NAME, tracks: c.randomTracks };
}

/** The classes the picker offers: 200cc once it's unlocked. */
export function availableClasses(u: Unlocks = unlocks(progress())): EngineClass[] {
  return ENGINE_CLASSES.filter((e) => e !== '200cc' || u.class200);
}

/** Mode, track, racer and class picker (and the track generator's dials). Keyboard, gamepad-ish arrows, mouse and touch. */
export class Menu {
  private readonly el = document.createElement('div');
  private row = 0;
  choice: MenuChoice;

  constructor(
    parent: HTMLElement,
    initial: MenuChoice,
    private readonly onChange: (c: MenuChoice, row: MenuRow) => void,
    private readonly onStart: (c: MenuChoice) => void,
    /** The generator's saved tracks. */
    private readonly saved: () => SavedTrack[],
    /** Forgets a saved track. */
    private readonly onDelete: (t: SavedTrack) => void,
  ) {
    this.choice = { ...initial };
    this.el.className = 'menu';
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-row], [data-start], [data-delete], [data-random], [data-random-track]');
      if (!t) return;
      if (t.dataset.start !== undefined) {
        this.onStart(this.choice);
        return;
      }
      if (t.dataset.delete !== undefined) {
        this.deleteSaved();
        return;
      }
      if (t.dataset.random !== undefined) {
        this.randomRacer();
        return;
      }
      if (t.dataset.randomTrack !== undefined) {
        this.randomTrack();
        return;
      }
      this.row = this.rows().indexOf(t.dataset.row as MenuRow);
      if (t.dataset.dir) this.change(Number(t.dataset.dir));
      else this.render();
    });
    this.render();
  }

  /** The row being used: the game shows the racer gallery while it's 'racer'. */
  get activeRow(): MenuRow {
    return this.rows()[this.row];
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
    if (code === 'ArrowUp' || code === 'KeyW') this.moveRow(-1);
    else if (code === 'ArrowDown' || code === 'KeyS') this.moveRow(1);
    else if (code === 'ArrowLeft' || code === 'KeyA') return this.change(-1), true;
    else if (code === 'ArrowRight' || code === 'KeyD') return this.change(1), true;
    else if (code === 'Enter' || code === 'Space') return this.onStart(this.choice), true;
    else if (code === 'KeyR' && this.choice.mode !== 'online') return this.randomRacer(), true;
    else if (code === 'KeyT' && this.choice.mode === 'single') return this.randomTrack(), true;
    else return false;
    this.render();
    return true;
  }

  /** The rows this mode shows. Online picks its track in the room; a Grand Prix's track row picks the cup; Mirror once it's unlocked. */
  private rows(): MenuRow[] {
    const m = this.choice.mode;
    const mirror: MenuRow[] = unlocks(progress()).mirror && (m === 'grandPrix' || m === 'single') ? ['mirror'] : [];
    if (m === 'generator') return ['mode', 'gen', 'theme', 'complexity', 'length', 'racer', 'engine'];
    if (m === 'online') return ['mode', 'racer', 'engine'];
    return ['mode', 'track', 'racer', 'engine', ...mirror];
  }

  /** Picks a track at random for a Single Race (the track row's dice, or T). */
  randomTrack(): void {
    const others = TRACK_LIST.map((_, i) => i).filter((i) => i !== this.choice.track);
    this.choice.track = others[Math.floor(Math.random() * others.length)];
    this.row = this.rows().indexOf('track');
    this.render();
    this.onChange(this.choice, 'track');
  }

  /** Picks a racer at random (the racer row's dice, or R). */
  randomRacer(): void {
    const others = RACERS.filter((r) => r !== this.choice.racer);
    this.choice.racer = others[Math.floor(Math.random() * others.length)];
    this.row = this.rows().indexOf('racer');
    this.render();
    this.onChange(this.choice, 'racer');
  }

  private moveRow(dir: number): void {
    const n = this.rows().length;
    this.row = (this.row + dir + n) % n;
  }

  /** Points the generator at a saved track (after saving one, say). */
  selectSaved(slot: number): void {
    const t = this.saved()[slot];
    if (!t) return;
    this.choice.gen = { slot, params: { seed: t.seed, theme: t.theme, complexity: t.complexity, length: t.length } };
    this.render();
  }

  private deleteSaved(): void {
    const g = this.choice.gen;
    const t = this.saved()[g.slot];
    if (!t) return;
    this.onDelete(t);
    // The track's still here to race, just not saved.
    this.choice.gen = { slot: -1, params: { ...g.params } };
    this.render();
    this.onChange(this.choice, 'gen');
  }

  private change(dir: number): void {
    const c = this.choice;
    const row = this.rows()[this.row];
    const step = <T>(list: readonly T[], v: T) => list[(list.indexOf(v) + dir + list.length) % list.length];
    const g = c.gen;
    // Turning a dial on a saved track starts a new one from it.
    const dial = (change: () => void) => {
      change();
      g.slot = -1;
    };
    if (row === 'mode') {
      c.mode = step(MODES, c.mode);
      this.row = 0;
    } else if (row === 'track' && c.mode === 'grandPrix') {
      // The cups, then the Random Cup (once a trophy has unlocked it), which draws four new tracks every time you land on it.
      const n = CUPS.length + (unlocks(progress()).randomCup ? 1 : 0);
      c.cup = (c.cup + dir + n) % n;
      if (c.cup === CUPS.length) c.randomTracks = randomCupTracks();
    } else if (row === 'gen') {
      // The daily, New, then each saved track; landing on New rolls a fresh one.
      const saved = this.saved();
      const first = DAILY_SLOT;
      const n = saved.length - first;
      g.slot = ((g.slot - first + dir + n) % n) + first;
      if (g.slot === DAILY_SLOT) g.params = dailyParams();
      else if (g.slot < 0) g.params = { ...g.params, seed: newSeed() };
      else {
        const t = saved[g.slot];
        g.params = { seed: t.seed, theme: t.theme, complexity: t.complexity, length: t.length };
      }
    } else if (row === 'mirror') c.mirror = !c.mirror; else if (row === 'theme') dial(() => (g.params = { ...g.params, theme: step(GEN_THEMES, g.params.theme) }));
    else if (row === 'complexity') dial(() => (g.params = { ...g.params, complexity: Math.min(GEN_COMPLEXITY_MAX, Math.max(1, g.params.complexity + dir)) }));
    else if (row === 'length') dial(() => (g.params = { ...g.params, length: step(GEN_LENGTHS, g.params.length) }));
    else if (row === 'track') c.track = (c.track + dir + TRACK_LIST.length) % TRACK_LIST.length;
    else if (row === 'racer') c.racer = step(RACERS, c.racer);
    else c.engine = step(availableClasses(), c.engine);
    this.render();
    this.onChange(this.choice, row);
  }

  private render(): void {
    const c = this.choice;
    const color = `#${c.racer.color.toString(16).padStart(6, '0')}`;
    const stats = STAT_NAMES.map(
      (k) => `<div class="menu-stat"><span>${k}</span><i style="width:${c.racer.stats[k] * 20}%;background:${color}"></i></div>`,
    ).join('');
    const rows = this.rows();
    const line = (row: MenuRow, label: string, value: string, extra = '', small = false) => `
      <div class="menu-row${rows[this.row] === row ? ' on' : ''}${small ? ' small' : ''}" data-row="${row}">
        <div class="menu-label">${label}</div>
        <button class="menu-arrow" data-row="${row}" data-dir="-1">&#9664;</button>
        <div class="menu-value hud-big">${value}</div>
        <button class="menu-arrow" data-row="${row}" data-dir="1">&#9654;</button>
        ${extra}
      </div>`;
    this.el.innerHTML = `
      <div class="menu-panel">
        <div class="menu-title hud-big">CHOOSE YOUR RACE</div>
        ${line('mode', 'Mode', MODE_NAMES[c.mode])}
        ${
          c.mode === 'grandPrix'
            ? line('track', 'Cup', chosenCup(c).name, `<div class="menu-cup-tracks">${chosenCup(c).tracks.map((t) => TRACK_LIST[t].name).join(' &middot; ')}</div>${this.trophyLine()}`)
            : c.mode === 'online'
              ? `<div class="menu-row menu-cup"><div class="menu-label">Rooms</div><div class="menu-value">Race friends with a room code</div></div>`
              : c.mode === 'generator'
                ? this.generatorRows(line)
                : line('track', 'Track', TRACK_LIST[c.track].name, `${this.bestLine(TRACK_LIST[c.track].id)}${c.mode === 'single' ? '<button class="menu-random" data-random-track title="Random track (T)">&#9860; random track</button>' : ''}`)
        }
        ${line('racer', 'Racer', c.racer.name, `<div class="menu-stats">${stats}</div><div class="menu-bio">${c.racer.bio}</div><button class="menu-random" data-random title="Random racer (R)">&#9860; random</button>`)}
        ${line('engine', 'Class', c.engine, this.unlockLine())}
        ${rows.includes('mirror') ? line('mirror', 'Mirror', c.mirror ? 'ON' : 'OFF', '', true) : ''}
        <button class="menu-start hud-big" data-start>${c.mode === 'online' ? 'ROOMS' : 'RACE!'}</button>
        <div class="menu-hint">&uarr;&darr; choose &middot; &larr;&rarr; change &middot; Enter race</div>
      </div>`;
  }

  /** The trophies won on the chosen cup, by class, or what's left to win. */
  private trophyLine(): string {
    const c = this.choice;
    const won = cupTrophies(progress(), chosenCup(c).id, c.mirror)
      .filter((t) => t.result.trophy)
      .sort((a, b) => ENGINE_CLASSES.indexOf(a.engine as EngineClass) - ENGINE_CLASSES.indexOf(b.engine as EngineClass));
    if (!won.length) return `<div class="menu-cup-tracks menu-trophies">No trophy yet${c.mirror ? ' in Mirror' : ''}: finish in the top three</div>`;
    const badges = won.map((t) => `<span class="menu-trophy ${t.result.trophy}" title="${t.result.trophy} at ${t.engine}${t.result.sweep ? ', every race won' : ''}">${TROPHY_GLYPH[t.result.trophy!]} ${t.engine}${t.result.sweep ? ' &#10038;' : ''}</span>`);
    return `<div class="menu-cup-tracks menu-trophies">${badges.join(' ')}</div>`;
  }

  /** This browser's best full race on the track at this class. */
  private bestLine(trackId: string): string {
    const c = this.choice;
    const best = progress().races[raceKey(trackId, c.engine, c.mirror)];
    return `<div class="menu-cup-tracks">${best ? `Your best race: ${formatTime(best.ms / 1000)}` : 'No race time yet'}${c.mirror ? ' (Mirror)' : ''}</div>`;
  }

  /** What the next trophies unlock, until they have. */
  private unlockLine(): string {
    const u = unlocks(progress());
    const todo: string[] = [];
    if (!u.randomCup) todo.push('a trophy unlocks the Random Cup');
    if (!u.class200) todo.push('gold at 150cc unlocks 200cc');
    if (!u.mirror) todo.push('gold in every cup unlocks Mirror');
    return todo.length ? `<div class="menu-cup-tracks menu-unlocks">${todo.join(' &middot; ')}</div>` : '';
  }

  private generatorRows(line: (row: MenuRow, label: string, value: string, extra?: string, small?: boolean) => string): string {
    const g = this.choice.gen;
    const saved = this.saved();
    const t = saved[g.slot];
    const daily = g.slot === DAILY_SLOT;
    const name = t ? esc(t.name) : daily ? `${esc(trackName(g.params))} <small class="menu-new">DAILY</small>` : `${esc(trackName(g.params))} <small class="menu-new">NEW</small>`;
    const extra = t
      ? `<div class="menu-cup-tracks">Saved track ${g.slot + 1} of ${saved.length} <button class="menu-delete" data-delete>Delete</button></div>`
      : daily
        ? `<div class="menu-cup-tracks">Today's track, ${dailyLabel()}: the same for everyone, with its own leaderboard</div>`
        : `<div class="menu-cup-tracks">${saved.length ? `&#9664;&#9654; the daily, your ${saved.length} saved track${saved.length > 1 ? 's' : ''}; back here rolls a new one` : '&#9664;&#9654; the daily, or roll another'}</div>`;
    const dots = Array.from({ length: GEN_COMPLEXITY_MAX }, (_, i) => (i < g.params.complexity ? '&#9679;' : '&#9675;')).join('');
    // The daily's dials are the day's: turning one makes it a track of your own.
    return (
      line('gen', 'Track', name, extra) +
      line('theme', 'Theme', GEN_THEME_NAMES[g.params.theme], '', true) +
      line('complexity', 'Twists', dots, '', true) +
      line('length', 'Length', LENGTH_NAMES[g.params.length], '', true)
    );
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
