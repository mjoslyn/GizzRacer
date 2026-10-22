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

/** The picker's screens, in order; a mode without a track screen (Online picks it in the room) skips it. */
export type MenuStep = 'mode' | 'track' | 'racer' | 'engine';
const STEP_TITLES: Record<MenuStep, string> = { mode: 'CHOOSE A MODE', track: 'PICK A TRACK', racer: 'PICK A RACER', engine: 'PICK A SPEED' };
const MODE_BLURBS: Record<RaceMode, string> = {
  grandPrix: 'Four races for the cup, points across them, rivals who want it too',
  single: 'One track, a full field, items on',
  timeTrial: 'Alone against the clock, the ghosts and the leaderboard',
  generator: 'A track made on the spot: the daily, your saved ones, or a new roll',
  online: 'Race friends with a room code',
};
const CLASS_BLURBS: Record<EngineClass, string> = {
  '50cc': 'Easy: slow karts, forgiving corners',
  '100cc': 'The standard race',
  '150cc': 'Fast: the real thing',
  '200cc': 'Flat out: faster than the tracks were drawn for',
};

/**
 * Mode, track, racer and class picker (and the track generator's dials),
 * one choice to a screen: mode, then the track or cup, the racer, and the
 * speed with the RACE! button. Keyboard, gamepad-ish arrows, mouse and
 * touch; the crumbs along the top jump between screens.
 */
export class Menu {
  private readonly el = document.createElement('div');
  private step = 0;
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
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-row], [data-start], [data-next], [data-back], [data-step], [data-pick], [data-delete], [data-random], [data-random-track]');
      if (!t) return;
      if (t.dataset.start !== undefined) return this.onStart(this.choice);
      if (t.dataset.next !== undefined) return this.next();
      if (t.dataset.back !== undefined) return this.back();
      if (t.dataset.step !== undefined) return this.goTo(Number(t.dataset.step));
      if (t.dataset.pick !== undefined) return this.pick(t.dataset.pick);
      if (t.dataset.delete !== undefined) return this.deleteSaved();
      if (t.dataset.random !== undefined) return this.randomRacer();
      if (t.dataset.randomTrack !== undefined) return this.randomTrack();
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

  /** The screen showing. */
  get activeStep(): MenuStep {
    return this.steps()[this.step];
  }

  /** Whether the leaderboard belongs beside this screen: the track's and the speed's, not the mode's or the gallery's. */
  get showsBoard(): boolean {
    const s = this.activeStep;
    return s === 'track' || s === 'engine';
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
    const rows = this.rows();
    const vertical = (dir: number) => (rows.length > 1 ? this.moveRow(dir) : this.change(dir));
    if (code === 'ArrowUp' || code === 'KeyW') vertical(-1);
    else if (code === 'ArrowDown' || code === 'KeyS') vertical(1);
    else if (code === 'ArrowLeft' || code === 'KeyA') return this.change(-1), true;
    else if (code === 'ArrowRight' || code === 'KeyD') return this.change(1), true;
    else if (code === 'Enter' || code === 'Space') return this.next(), true;
    else if (code === 'Backspace' || code === 'Escape') return this.back(), true;
    else if (code === 'KeyR' && this.choice.mode !== 'online') return this.randomRacer(), true;
    else if (code === 'KeyT' && this.choice.mode === 'single') return this.randomTrack(), true;
    else return false;
    this.render();
    return true;
  }

  /** The screens this mode has: Online picks its track in the room. */
  private steps(): MenuStep[] {
    return this.choice.mode === 'online' ? ['mode', 'racer', 'engine'] : ['mode', 'track', 'racer', 'engine'];
  }

  /** The rows on the screen showing: the generator's dials share the track screen, Mirror the speed's once it's unlocked. */
  private rows(): MenuRow[] {
    const m = this.choice.mode;
    switch (this.activeStep) {
      case 'mode':
        return ['mode'];
      case 'track':
        return m === 'generator' ? ['gen', 'theme', 'complexity', 'length'] : ['track'];
      case 'racer':
        return ['racer'];
      default:
        return unlocks(progress()).mirror && (m === 'grandPrix' || m === 'single') ? ['engine', 'mirror'] : ['engine'];
    }
  }

  /** On to the next screen; from the last, the race (or the rooms). */
  private next(): void {
    if (this.step >= this.steps().length - 1) {
      this.onStart(this.choice);
      return;
    }
    this.goTo(this.step + 1);
  }

  private back(): void {
    if (this.step > 0) this.goTo(this.step - 1);
  }

  private goTo(step: number): void {
    const n = this.steps().length;
    this.step = Math.max(0, Math.min(n - 1, step));
    this.row = 0;
    this.render();
    // The game follows the screen: the track shown behind it, the board beside it, the gallery on the racer's.
    this.onChange(this.choice, this.rows()[0]);
  }

  /** A choice from a list screen (`mode:single`, `engine:150cc`). */
  private pick(what: string): void {
    const [row, value] = what.split(':');
    if (row === 'mode') {
      this.choice.mode = value as RaceMode;
      this.step = 0;
    } else if (row === 'engine') this.choice.engine = value as EngineClass;
    this.row = 0;
    this.render();
    this.onChange(this.choice, row as MenuRow);
  }

  /** Picks a track at random for a Single Race (the track row's dice, or T). */
  randomTrack(): void {
    const others = TRACK_LIST.map((_, i) => i).filter((i) => i !== this.choice.track);
    this.choice.track = others[Math.floor(Math.random() * others.length)];
    this.render();
    this.onChange(this.choice, 'track');
  }

  /** Picks a racer at random (the racer row's dice, or R). */
  randomRacer(): void {
    const others = RACERS.filter((r) => r !== this.choice.racer);
    this.choice.racer = others[Math.floor(Math.random() * others.length)];
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
      this.step = 0;
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
    const steps = this.steps();
    const at = this.activeStep;
    const rows = this.rows();
    const line = (row: MenuRow, label: string, value: string, extra = '', small = false) => `
      <div class="menu-row${rows[this.row] === row ? ' on' : ''}${small ? ' small' : ''}" data-row="${row}">
        <div class="menu-label">${label}</div>
        <button class="menu-arrow" data-row="${row}" data-dir="-1">&#9664;</button>
        <div class="menu-value hud-big">${value}</div>
        <button class="menu-arrow" data-row="${row}" data-dir="1">&#9654;</button>
        ${extra}
      </div>`;
    let title = STEP_TITLES[at];
    let body: string;
    if (at === 'mode') {
      body = this.optionList(MODES.map((m) => ({ pick: `mode:${m}`, name: MODE_NAMES[m], blurb: MODE_BLURBS[m], on: m === c.mode })));
    } else if (at === 'track') {
      if (c.mode === 'grandPrix') {
        title = 'PICK A CUP';
        body = line('track', 'Cup', chosenCup(c).name, `<div class="menu-cup-tracks">${chosenCup(c).tracks.map((t) => TRACK_LIST[t].name).join(' &middot; ')}</div>${this.trophyLine()}`);
      } else if (c.mode === 'generator') {
        title = 'BUILD A TRACK';
        body = this.generatorRows(line);
      } else {
        body = line('track', 'Track', `${TRACK_LIST[c.track].name}${c.mode === 'single' ? DICE('data-random-track', 'Random track (T)') : ''}`, `${this.bestLine(TRACK_LIST[c.track].id)}<div class="menu-cup-tracks">${c.track + 1} of ${TRACK_LIST.length}</div>`);
      }
    } else if (at === 'racer') {
      const color = `#${c.racer.color.toString(16).padStart(6, '0')}`;
      const stats = STAT_NAMES.map((k) => `<div class="menu-stat"><span>${k}</span><i style="width:${c.racer.stats[k] * 20}%;background:${color}"></i></div>`).join('');
      body = line('racer', 'Racer', `${c.racer.name}${c.mode === 'online' ? '' : DICE('data-random', 'Random racer (R)')}`, `<div class="menu-stats">${stats}</div><div class="menu-bio">${c.racer.bio}</div>`);
    } else {
      const classes = availableClasses();
      body =
        this.optionList(
          ENGINE_CLASSES.map((e) => ({ pick: `engine:${e}`, name: e, blurb: classes.includes(e) ? CLASS_BLURBS[e] : 'Locked: gold at 150cc in a cup unlocks it', on: e === c.engine, locked: !classes.includes(e) })),
          rows[this.row] === 'engine',
        ) +
        (rows.includes('mirror') ? line('mirror', 'Mirror', c.mirror ? 'ON' : 'OFF', '<div class="menu-cup-tracks">Every track flipped left for right</div>', true) : '') +
        this.unlockLine();
    }
    const last = this.step === steps.length - 1;
    const crumbs = steps
      .map((s, i) => `<button class="menu-crumb${i === this.step ? ' on' : ''}${i > this.step ? ' todo' : ''}" data-step="${i}"><small>${i + 1}</small> ${esc(this.crumb(s))}</button>`)
      .join('<span class="menu-crumb-sep">&rsaquo;</span>');
    this.el.innerHTML = `
      <div class="menu-panel">
        <div class="menu-crumbs">${crumbs}</div>
        <div class="menu-title hud-big">${title}</div>
        ${body}
        <div class="menu-nav">
          <button class="menu-back" data-back${this.step === 0 ? ' disabled' : ''}>&lsaquo; back</button>
          ${last ? `<button class="menu-start hud-big" data-start>${c.mode === 'online' ? 'ROOMS' : 'RACE!'}</button>` : `<button class="menu-start menu-next hud-big" data-next>next &rsaquo;</button>`}
        </div>
        <div class="menu-hint">${at === 'mode' || (at === 'engine' && rows.length === 1) ? '&uarr;&darr; choose' : '&larr;&rarr; change'} &middot; Enter ${last ? (c.mode === 'online' ? 'rooms' : 'race') : 'next'} &middot; Backspace back</div>
      </div>`;
  }

  /** What a crumb says for a screen: the pick made there, or what it's for. */
  private crumb(s: MenuStep): string {
    const c = this.choice;
    if (s === 'mode') return MODE_NAMES[c.mode];
    if (s === 'track') return c.mode === 'grandPrix' ? chosenCup(c).name : c.mode === 'generator' ? (this.saved()[c.gen.slot]?.name ?? (c.gen.slot === DAILY_SLOT ? 'Daily' : 'New track')) : TRACK_LIST[c.track].name;
    if (s === 'racer') return c.racer.name;
    return `${c.engine}${c.mirror && (c.mode === 'grandPrix' || c.mode === 'single') ? ' Mirror' : ''}`;
  }

  /** A screen's choices as a list, the current one lit (and the list's focus marked when the screen has other rows). */
  private optionList(opts: { pick: string; name: string; blurb: string; on: boolean; locked?: boolean }[], focused = true): string {
    return `<div class="menu-opts${focused ? ' on' : ''}" data-row="${opts[0].pick.split(':')[0]}">${opts
      .map((o) => `<button class="menu-opt${o.on ? ' on' : ''}${o.locked ? ' locked' : ''}" data-pick="${o.pick}"${o.locked ? ' disabled' : ''}><span class="menu-opt-name hud-big">${esc(o.name)}</span><span class="menu-opt-blurb">${esc(o.blurb)}</span></button>`)
      .join('')}</div>`;
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
    return `<div class="menu-cup-tracks">${best ? `Your best race: ${formatTime(best.ms / 1000)}` : 'No race time yet'}${c.mirror ? ' (Mirror)' : ''} at ${c.engine}</div>`;
  }

  /** The next thing a trophy unlocks, until everything is. */
  private unlockLine(): string {
    const u = unlocks(progress());
    const next = !u.randomCup ? 'a trophy unlocks the Random Cup' : !u.class200 ? 'gold at 150cc unlocks 200cc' : !u.mirror ? 'gold in every cup unlocks Mirror' : '';
    return next ? `<div class="menu-cup-tracks menu-unlocks">Next: ${next}</div>` : '';
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

/** A dice button inside a row's value: one tap rolls that row. */
function DICE(attr: string, title: string): string {
  return `<button class="menu-dice" ${attr} title="${title}">&#9860;</button>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
