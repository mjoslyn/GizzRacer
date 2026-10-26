import { dailyLabel, dailyParams } from '../core/daily';
import { cupTrophies, progress, raceKey, unlocks, type Unlocks } from '../core/progress';
import { SONG_END_SOUNDTRACKS, SOUNDTRACKS, SOUNDTRACK_BLURBS, SOUNDTRACK_NAMES, VIDEO_LOOKS, settings, updateSettings } from '../core/settings';
import type { SavedTrack } from '../core/savedTracks';
import { CPU_DIFFICULTIES } from '../ai/cpuDriver';
import { MODE_BLURBS, MODE_NAMES, type RaceMode } from './modes';
import { MODE_ICONS, RANDOM_CUP_ICON } from './modeIcons';
import { chosenShow, onShows, randomShow, showSelect, shows, stepShow } from '../audio/shows';
import { formatTime } from './hud';
import { ENGINE_CLASSES, RACERS, type EngineClass, type RacerDef } from '../physics/racers';
import { GEN_COMPLEXITY_MAX, GEN_LENGTHS, GEN_THEMES, GEN_THEME_NAMES, trackName, type GenParams } from '../tracks/generator';
import { CUPS, RANDOM_CUP_ID, RANDOM_CUP_NAME, TRACK_LIST, randomCupTracks } from '../tracks/index';
import { SKILLS, SKILL_KINDS, type SkillKind } from '../core/skills';

export { MODE_NAMES, type RaceMode } from './modes';
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
  /** Infinite: when to move on to the next track (every track in turn from the one picked), or never. */
  switchEvery: TrackSwitch;
  /** Infinite: the game's tracks, freshly generated ones (as the Track Generator makes), or a mix of both. */
  generative: Generative;
  /** Infinite: the CPUs race and you watch, a visualizer for the music. */
  watch: boolean;
  /** Skill Games: which game, and how hard (0..2, as story mode's chapters). */
  skill: SkillKind;
  skillLevel: number;
}

/** Skill Games' difficulties: each a story chapter's. */
export const SKILL_LEVELS = ['Easy', 'Normal', 'Hard'] as const;
const SKILL_LEVEL_BLURBS = ["As Chapter I plays it: room to learn the game", 'As Chapter II plays it', 'As Chapter III plays it: tight and quick'];

/** Infinite's track switch: never, after so many laps of the leader (or mine), or with each song of a Full set. */
export const TRACK_SWITCHES = ['never', 1, 5, 10, 20, 'song'] as const;
export type TrackSwitch = (typeof TRACK_SWITCHES)[number];
/** Infinite's generative tracks: off (the game's own), on (a new one generated each time), or a mix. */
export const GENERATIVES = ['off', 'on', 'mix'] as const;
export type Generative = (typeof GENERATIVES)[number];
const GENERATIVE_BLURBS: Record<Generative, string> = {
  off: "The game's own tracks",
  on: 'A new track generated each time, as the Track Generator makes them: any world, any shape',
  mix: "The game's own tracks and new generated ones, at random",
};

const VHS_NAMES = { full: 'Full', light: 'Light', off: 'Off' } as const;

/** The modes that can race to the song's end (Settings > Race to): the ones raced to a number of laps against CPUs. */
const SONG_END_MODES: readonly RaceMode[] = ['single', 'grandPrix', 'generator'];

/** Whether this race runs to the song's end: the mode can, the soundtrack has a song that ends, and it's switched on. */
export function racesToSongEnd(mode: RaceMode): boolean {
  const s = settings();
  return s.raceToSongEnd && SONG_END_MODES.includes(mode) && SONG_END_SOUNDTRACKS.includes(s.soundtrack);
}

/** Each song, without a Full set to say when a song ends: every this many laps. */
export const SONG_SWITCH_LAPS = 5;
const SWITCH_NAMES: Record<string, string> = { never: 'Never', 1: 'Every lap', 5: 'Every 5 laps', 10: 'Every 10 laps', 20: 'Every 20 laps', song: 'Each song' };

export type MenuRow = 'mode' | 'track' | 'gen' | 'theme' | 'complexity' | 'length' | 'racer' | 'engine' | 'mirror' | 'sound' | 'show' | 'watch' | 'cpus' | 'vhs' | 'switch' | 'generative' | 'skill' | 'level' | 'songEnd';
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
const CPU_NAMES = { easy: 'Easy', normal: 'Normal', hard: 'Hard' } as const;

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
  /** Each racer's picture for the grid (render/portraits.ts), as they arrive. */
  private readonly portraits = new Map<string, string>();

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
    // The show dropdown works on its own: keys in it are the dropdown's, and a pick is the Full set's show.
    this.el.addEventListener('keydown', (e) => (e.target as HTMLElement).matches('select') && e.stopPropagation());
    this.el.addEventListener('change', (e) => {
      const sel = e.target as HTMLSelectElement;
      if (!sel.matches('.menu-show')) return;
      updateSettings({ liveShow: sel.value });
      sel.blur();
      this.render();
    });
    this.el.addEventListener('click', (e) => {
      // A click opening the dropdown mustn't redraw it shut.
      if ((e.target as HTMLElement).matches('select, option')) return;
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-pick], [data-row], [data-start], [data-next], [data-back], [data-step], [data-delete], [data-random], [data-random-track], [data-random-show]');
      if (!t) return;
      if (t.dataset.pick !== undefined) {
        const [row, i] = t.dataset.pick.split(':');
        return this.pick(row as MenuRow, Number(i));
      }
      if (t.dataset.start !== undefined) return this.onStart(this.choice);
      if (t.dataset.next !== undefined) return this.next();
      if (t.dataset.back !== undefined) return this.back();
      if (t.dataset.step !== undefined) return this.goTo(Number(t.dataset.step));
      if (t.dataset.delete !== undefined) return this.deleteSaved();
      if (t.dataset.random !== undefined) return this.randomRacer();
      if (t.dataset.randomTrack !== undefined) return this.randomTrack();
      if (t.dataset.randomShow !== undefined) {
        updateSettings({ liveShow: randomShow(shows(), settings().liveShow) });
        return this.render();
      }
      this.row = this.rows().indexOf(t.dataset.row as MenuRow);
      if (t.dataset.dir) this.change(Number(t.dataset.dir));
      else this.render();
    });
    // Scrolling (it doesn't bubble, so caught on the way down) or a new size: is there still more below?
    this.el.addEventListener('scroll', () => this.markMore(), true);
    window.addEventListener('resize', () => this.markMore());
    this.render();
    // The show list arrives after startup: the Full set rows fill in.
    onShows(() => this.visible && this.render());
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
    // In a grid, up and down go a line at a time; past its top or foot, to the next row if there is one.
    const up = code === 'ArrowUp' || code === 'KeyW';
    const grid = this.el.querySelector(`[data-grid="${this.activeRow}"]`);
    if ((up || code === 'ArrowDown' || code === 'KeyS') && grid) {
      const j = this.gridIndex(this.activeRow) + (up ? -1 : 1) * getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      if (j >= 0 && j < this.gridCount(this.activeRow)) return this.pick(this.activeRow, j, false), true;
      if (rows.length === 1) return true;
    }
    if (code === 'ArrowUp' || code === 'KeyW') vertical(-1);
    else if (code === 'ArrowDown' || code === 'KeyS') vertical(1);
    else if (code === 'ArrowLeft' || code === 'KeyA') return this.change(-1), true;
    else if (code === 'ArrowRight' || code === 'KeyD') return this.change(1), true;
    else if (code === 'Enter' || code === 'Space') return this.next(), true;
    else if (code === 'Backspace' || code === 'Escape') return this.back(), true;
    else if (code === 'KeyR' && this.choice.mode !== 'online') return this.randomRacer(), true;
    else if (code === 'KeyT' && (this.choice.mode === 'single' || this.choice.mode === 'infinite')) return this.randomTrack(), true;
    else return false;
    this.render();
    return true;
  }

  /** The screens this mode has: Online picks its track in the room, Story's are the story's, and a skill game needs a racer only to fly the Deadstick Landing. */
  private steps(): MenuStep[] {
    const m = this.choice.mode;
    if (m === 'skills') return this.choice.skill === 'deadstick' ? ['mode', 'track', 'racer', 'engine'] : ['mode', 'track', 'engine'];
    // Party: straight to the join screen, where each player picks a racer and P1 the cup and speed.
    if (m === 'party') return ['mode'];
    return m === 'online' || m === 'story' ? ['mode', 'racer', 'engine'] : ['mode', 'track', 'racer', 'engine'];
  }

  /** The rows on the screen showing: the generator's dials share the track screen, Mirror the speed's once it's unlocked. */
  private rows(): MenuRow[] {
    const m = this.choice.mode;
    switch (this.activeStep) {
      case 'mode':
        return ['mode'];
      case 'track':
        return m === 'generator' ? ['gen', 'theme', 'complexity', 'length'] : m === 'skills' ? ['skill'] : m === 'infinite' ? (this.choice.generative === 'on' ? ['generative', 'switch'] : ['track', 'generative', 'switch']) : ['track'];
      case 'racer':
        // Watching, there's no racer to pick.
        return m === 'infinite' ? (this.choice.watch ? ['watch'] : ['racer', 'watch']) : ['racer'];
      default: {
        // The sound to race to, last: the same choice as Settings > Soundtrack, and for a Full set, which show.
        const sound: MenuRow[] = settings().soundtrack === 'show' ? ['sound', 'show'] : ['sound'];
        // With a song that ends (Track song, Full set), the race can run until it does.
        if (SONG_END_MODES.includes(m) && SONG_END_SOUNDTRACKS.includes(settings().soundtrack)) sound.push('songEnd');
        // A skill game makes its own sound, but the Deadstick Landing is flown to the soundtrack. There are no CPUs to set.
        if (m === 'skills') return this.choice.skill === 'deadstick' ? ['level', ...sound] : ['level'];
        // How hard the CPUs race, wherever there are CPUs here to race (not Time Trial; online the room decides).
        const cpus: MenuRow[] = m === 'timeTrial' || m === 'online' ? [] : ['cpus'];
        const mirror: MenuRow[] = unlocks(progress()).mirror && (m === 'grandPrix' || m === 'single') ? ['mirror'] : [];
        // The VHS look (Settings > VHS) under the CPUs.
        return ['engine', ...cpus, 'vhs', ...mirror, ...sound];
      }
    }
  }

  /** Starts with the choice as it stands, as RACE! does. */
  start(): void {
    this.onStart(this.choice);
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

  /** Picks a track at random for a Single Race (the track row's dice, or T). */
  randomTrack(): void {
    const others = TRACK_LIST.map((_, i) => i).filter((i) => i !== this.choice.track);
    this.choice.track = others[Math.floor(Math.random() * others.length)];
    this.render();
    this.onChange(this.choice, 'track');
  }

  /** How many tiles a grid row has: the modes, the cups (and the Random Cup once it's unlocked) or tracks, the skill games, the racers. */
  private gridCount(row: MenuRow): number {
    const c = this.choice;
    if (row === 'mode') return MODES.length;
    if (row === 'skill') return SKILL_KINDS.length;
    if (row === 'racer') return RACERS.length;
    if (row === 'track') return c.mode === 'grandPrix' ? CUPS.length + (unlocks(progress()).randomCup ? 1 : 0) : TRACK_LIST.length;
    return 0;
  }

  /** Which tile of a grid row is picked. */
  private gridIndex(row: MenuRow): number {
    const c = this.choice;
    if (row === 'mode') return MODES.indexOf(c.mode);
    if (row === 'skill') return SKILL_KINDS.indexOf(c.skill);
    if (row === 'racer') return RACERS.indexOf(c.racer);
    return c.mode === 'grandPrix' ? c.cup : c.track;
  }

  /** A tile picked, tapped or moved to with the arrows. A tap on the one already picked moves on. */
  private pick(row: MenuRow, i: number, tapped = true): void {
    if (!(i >= 0 && i < this.gridCount(row))) return;
    if (tapped && i === this.gridIndex(row)) return this.next();
    const c = this.choice;
    if (row === 'mode') {
      // Another mode has its own screens: back to the first.
      c.mode = MODES[i];
      this.step = 0;
    } else if (row === 'skill') c.skill = SKILL_KINDS[i];
    else if (row === 'racer') c.racer = RACERS[i];
    else if (c.mode === 'grandPrix') {
      c.cup = i;
      // The Random Cup draws four new tracks every time it's picked.
      if (i === CUPS.length) c.randomTracks = randomCupTracks();
    } else c.track = i;
    this.row = Math.max(0, this.rows().indexOf(row));
    this.render();
    this.revealPicked();
    this.onChange(c, row);
  }

  /** Down a grid past the fold on a phone: the panel follows the picked tile. */
  private revealPicked(): void {
    this.el.querySelector('[data-grid] .on')?.scrollIntoView({ block: 'nearest' });
  }

  /**
   * A row's choices as tiles, the picked one lit: tap one to pick it, tap
   * it again to go on. `groups` puts a heading across the grid before the
   * tile at each index (the tracks, by album).
   */
  private tiles(row: MenuRow, cls: string, items: { label: string; id?: string; img?: string; art?: string; style?: string; badge?: string }[], groups: { at: number; label: string }[] = []): string {
    const on = this.gridIndex(row);
    const html = items.map((t, i) => {
      const group = groups.find((g) => g.at === i);
      return `${group ? `<div class="menu-tiles-group">${esc(group.label)}</div>` : ''}<button class="menu-tile${i === on ? ' on' : ''}" data-pick="${row}:${i}"${t.id ? ` data-tile-id="${t.id}"` : ''}${t.style ? ` style="${t.style}"` : ''} title="${esc(t.label)}">${t.art ?? ''}${t.img ? `<img src="${t.img}" alt="" loading="lazy" onerror="this.remove()" />` : ''}<span>${esc(t.label)}</span>${t.badge ?? ''}</button>`;
    });
    return `<div class="menu-tiles ${cls}" data-grid="${row}">${html.join('')}</div>`;
  }

  /** A racer's picture is ready: into its tile, without redrawing the rest. */
  setPortrait(racerId: string, url: string): void {
    this.portraits.set(racerId, url);
    const tile = this.el.querySelector(`[data-grid="racer"] [data-tile-id="${racerId}"]`);
    if (tile && !tile.querySelector('img')) tile.insertAdjacentHTML('afterbegin', `<img src="${url}" alt="" />`);
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
    } else if (row === 'switch') {
      c.switchEvery = step(TRACK_SWITCHES, c.switchEvery);
    } else if (row === 'generative') {
      c.generative = step(GENERATIVES, c.generative);
      // The track row comes and goes with it: stay on this one.
      this.row = this.rows().indexOf('generative');
    } else if (row === 'skill') {
      c.skill = step(SKILL_KINDS, c.skill);
    } else if (row === 'level') {
      c.skillLevel = (c.skillLevel + dir + SKILL_LEVELS.length) % SKILL_LEVELS.length;
    } else if (row === 'watch') {
      c.watch = !c.watch;
      // The racer row comes and goes with it: stay on this one.
      this.row = this.rows().indexOf('watch');
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
    } else if (row === 'mirror') c.mirror = !c.mirror;
    else if (row === 'sound') updateSettings({ soundtrack: step(SOUNDTRACKS, settings().soundtrack) });
    else if (row === 'songEnd') updateSettings({ raceToSongEnd: !settings().raceToSongEnd });
    else if (row === 'cpus') updateSettings({ cpuDifficulty: step(CPU_DIFFICULTIES, settings().cpuDifficulty) });
    else if (row === 'vhs') updateSettings({ videoLook: step(VIDEO_LOOKS, settings().videoLook), videoLookChosen: true });
    else if (row === 'show') updateSettings({ liveShow: stepShow(shows(), settings().liveShow, dir) });
    else if (row === 'theme') dial(() => (g.params = { ...g.params, theme: step(GEN_THEMES, g.params.theme) }));
    else if (row === 'complexity') dial(() => (g.params = { ...g.params, complexity: Math.min(GEN_COMPLEXITY_MAX, Math.max(1, g.params.complexity + dir)) }));
    else if (row === 'length') dial(() => (g.params = { ...g.params, length: step(GEN_LENGTHS, g.params.length) }));
    else if (row === 'track') c.track = (c.track + dir + TRACK_LIST.length) % TRACK_LIST.length;
    else if (row === 'racer') c.racer = step(RACERS, c.racer);
    else c.engine = step(availableClasses(), c.engine);
    this.render();
    this.revealPicked();
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
    // A grid row: the pick's name (and its dice) over what it is, then every choice as a tile.
    const pickRow = (row: MenuRow, value: string, about: string, grid: string, foot = '') => `
      <div class="menu-row menu-pick${rows[this.row] === row ? ' on' : ''}" data-row="${row}">
        <div class="menu-pick-head"><div class="menu-value hud-big">${value}</div></div>
        ${about}
        ${grid}
        ${foot}
      </div>`;
    // The tracks four to a line, one album to a line, under its name.
    const trackTiles = () =>
      this.tiles(
        'track',
        'menu-tracks menu-shots',
        TRACK_LIST.map((t) => ({ label: t.name, id: t.id, img: preview('tracks', t.id) })),
        CUPS.map((cup) => ({ at: cup.tracks[0], label: cup.name.replace(/ Cup$/, '') })),
      );
    let title = STEP_TITLES[at];
    let body: string;
    if (at === 'mode') {
      body = pickRow('mode', MODE_NAMES[c.mode], `<div class="menu-cup-tracks menu-mode-blurb">${esc(MODE_BLURBS[c.mode])}</div>`, this.tiles('mode', 'menu-modes', MODES.map((m) => ({ label: MODE_NAMES[m], art: MODE_ICONS[m] }))));
    } else if (at === 'track') {
      if (c.mode === 'grandPrix') {
        title = 'PICK A CUP';
        // Each cup its four tracks' previews, two by two; the Random Cup a die.
        const mosaic = (tracks: number[]) => `<span class="menu-tile-mosaic">${tracks.map((t) => `<img src="${preview('tracks', TRACK_LIST[t].id)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" />`).join('')}</span>`;
        const tiles = CUPS.map((cup) => ({ label: cup.name.replace(/ Cup$/, ''), art: mosaic(cup.tracks), badge: this.cupBadge(cup.id) }));
        if (unlocks(progress()).randomCup) tiles.push({ label: 'Random', art: `<span class="menu-tile-icon">${RANDOM_CUP_ICON}</span>`, badge: this.cupBadge(RANDOM_CUP_ID) });
        body = pickRow('track', chosenCup(c).name, `<div class="menu-cup-tracks">${chosenCup(c).tracks.map((t) => TRACK_LIST[t].name).join(' &middot; ')}</div>${this.trophyLine()}`, this.tiles('track', 'menu-cups menu-shots', tiles));
      } else if (c.mode === 'generator') {
        title = 'BUILD A TRACK';
        body = this.generatorRows(line);
      } else if (c.mode === 'skills') {
        title = 'PICK A GAME';
        body = pickRow('skill', esc(SKILLS[c.skill].name), `<div class="menu-cup-tracks menu-mode-blurb">${esc(SKILLS[c.skill].intro)}</div>`, this.tiles('skill', 'menu-skills menu-shots', SKILL_KINDS.map((k) => ({ label: SKILLS[k].name, id: k, img: preview('skills', k) }))));
      } else if (c.mode === 'infinite') {
        const sw = c.switchEvery;
        const how =
          sw === 'never'
            ? 'Laps without end on this one'
            : sw === 'song'
              ? `On to the next track with each song of a Full set (every ${SONG_SWITCH_LAPS} laps without one), every track in turn`
              : `On to the next track every ${sw === 1 ? 'lap' : `${sw} laps`} of the leader, every track in turn`;
        const gen = c.generative;
        body =
          (gen === 'on' ? '' : pickRow('track', `${TRACK_LIST[c.track].name}${DICE('data-random-track', 'Random track (T)')}`, `<div class="menu-cup-tracks">${sw === 'never' ? '' : 'From '}${c.track + 1} of ${TRACK_LIST.length}</div>`, trackTiles())) +
          line('generative', 'Gen tracks', gen.toUpperCase(), `<div class="menu-cup-tracks">${GENERATIVE_BLURBS[gen]}</div>`, true) +
          line('switch', 'Switch tracks', SWITCH_NAMES[String(sw)], `<div class="menu-cup-tracks">${how}</div>`, true);
      } else {
        body = pickRow('track', `${TRACK_LIST[c.track].name}${c.mode === 'single' ? DICE('data-random-track', 'Random track (T)') : ''}`, this.bestLine(TRACK_LIST[c.track].id), trackTiles());
      }
    } else if (at === 'racer') {
      const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
      const stats = STAT_NAMES.map((k) => `<div class="menu-stat"><span>${k}</span><i style="width:${c.racer.stats[k] * 20}%;background:${hex(c.racer.color)}"></i></div>`).join('');
      // Every racer at once, a tile each: its picture once drawn, its colour until then.
      const tiles = this.tiles('racer', 'menu-racers', RACERS.map((r) => ({ label: r.name, id: r.id, img: this.portraits.get(r.id), style: `--racer:${hex(r.color)}` })));
      body =
        (c.mode === 'infinite' && c.watch
          ? ''
          : pickRow('racer', `${c.racer.name}${c.mode === 'online' ? '' : DICE('data-random', 'Random racer (R)')}`, `<div class="menu-stats">${stats}</div>`, tiles, `<div class="menu-bio">${c.racer.bio}</div>`)) +
        (c.mode === 'infinite'
          ? line('watch', 'Drive', c.watch ? 'Watch' : 'Race', `<div class="menu-cup-tracks">${c.watch ? 'The CPUs race, you watch: the camera follows one and moves on now and then; &larr;&rarr; or a tap picks another' : 'You race the CPUs, lap after lap. Or Watch: the CPUs race to the music'}</div>`, true)
          : '');
    } else if (c.mode === 'skills') {
      title = 'PICK A DIFFICULTY';
      body =
        line('level', 'Level', SKILL_LEVELS[c.skillLevel], `<div class="menu-cup-tracks menu-mode-blurb">${esc(SKILL_LEVEL_BLURBS[c.skillLevel])}</div>`) +
        (rows.includes('sound') ? line('sound', 'Sound', esc(SOUNDTRACK_NAMES[settings().soundtrack]), `<div class="menu-cup-tracks">${esc(SOUNDTRACK_BLURBS[settings().soundtrack])}</div>`, true) : '') +
        (rows.includes('show') ? this.showRows(line) : '');
    } else {
      body =
        // An arrow switcher, as the mode and racer are, over the classes unlocked.
        line('engine', 'Speed', c.engine) +
        // The smaller choices together: two to a line on a short screen, so RACE! stays in view.
        '<div class="menu-options">' +
        (rows.includes('cpus') ? line('cpus', 'CPUs', CPU_NAMES[settings().cpuDifficulty], '', true) : '') +
        line('vhs', 'VHS', VHS_NAMES[settings().videoLook], '', true) +
        (rows.includes('mirror') ? line('mirror', 'Mirror', c.mirror ? 'ON' : 'OFF', '<div class="menu-cup-tracks">Every track flipped left for right</div>', true) : '') +
        line('sound', 'Sound', esc(SOUNDTRACK_NAMES[settings().soundtrack]), `<div class="menu-cup-tracks">${esc(SOUNDTRACK_BLURBS[settings().soundtrack])}</div>`, true) +
        (rows.includes('show') ? this.showRows(line) : '') +
        (rows.includes('songEnd') ? this.songEndRow(line) : '') +
        '</div>' +
        this.unlockLine();
    }
    const last = this.step === steps.length - 1;
    const crumbs = steps
      .map((s, i) => `<button class="menu-crumb${i === this.step ? ' on' : ''}${i > this.step ? ' todo' : ''}" data-step="${i}"><small>${i + 1}</small> ${esc(this.crumb(s))}</button>`)
      .join('<span class="menu-crumb-sep">&rsaquo;</span>');
    this.el.dataset.step = at;
    this.el.innerHTML = `
      <div class="menu-panel">
        <div class="menu-crumbs">${crumbs}</div>
        <div class="menu-title hud-big">${title}</div>
        ${body}
        <div class="menu-nav">
          <button class="menu-back" data-back${this.step === 0 ? ' disabled' : ''}>&lsaquo; back</button>
          ${last ? `<button class="menu-start hud-big" data-start>${c.mode === 'online' ? 'ROOMS' : c.mode === 'party' ? 'PLAYERS' : c.mode === 'infinite' && c.watch ? 'WATCH!' : c.mode === 'skills' ? 'PLAY!' : 'RACE!'}</button>` : `<button class="menu-start menu-next hud-big" data-next>next &rsaquo;</button>`}
        </div>
        <div class="menu-hint">${this.gridCount(rows[this.row]) ? '&larr;&rarr;&uarr;&darr; pick' : `&larr;&rarr; change${rows.length > 1 ? ' &middot; &uarr;&darr; row' : ''}`} &middot; Enter ${last ? (c.mode === 'online' ? 'rooms' : c.mode === 'party' ? 'players' : c.mode === 'skills' ? 'play' : 'race') : 'next'} &middot; Backspace back</div>
      </div>`;
    this.markMore();
  }

  /** Marks the panel while there's more of it below the fold, for the hint above RACE!. */
  private markMore(): void {
    const panel = this.el.querySelector<HTMLElement>('.menu-panel');
    if (panel) panel.classList.toggle('more', panel.scrollTop + panel.clientHeight < panel.scrollHeight - 4);
  }

  /** What a crumb says for a screen: the pick made there, or what it's for. */
  private crumb(s: MenuStep): string {
    const c = this.choice;
    if (s === 'mode') return MODE_NAMES[c.mode];
    if (s === 'track' && c.mode === 'infinite' && c.generative === 'on') return 'Generated';
    if (s === 'track' && c.mode === 'infinite' && c.switchEvery !== 'never') return `${TRACK_LIST[c.track].name} +`;
    if (s === 'racer' && c.mode === 'infinite' && c.watch) return 'Watching';
    if (c.mode === 'skills' && s === 'track') return SKILLS[c.skill].name;
    if (c.mode === 'skills' && s === 'engine') return SKILL_LEVELS[c.skillLevel];
    if (s === 'track') return c.mode === 'grandPrix' ? chosenCup(c).name : c.mode === 'generator' ? (this.saved()[c.gen.slot]?.name ?? (c.gen.slot === DAILY_SLOT ? 'Daily' : 'New track')) : TRACK_LIST[c.track].name;
    if (s === 'racer') return c.racer.name;
    return `${c.engine}${c.mirror && (c.mode === 'grandPrix' || c.mode === 'single') ? ' Mirror' : ''}`;
  }


  /** Full set: which show, from a dropdown by year, or the dice. */
  private showRows(line: (row: MenuRow, label: string, value: string, extra?: string, small?: boolean) => string): string {
    const show = chosenShow(shows(), settings().liveShow);
    if (!show) return line('show', 'Show', 'Loading&hellip;', '', true);
    const all = shows();
    return line('show', 'Show', `${showSelect(all, show.id, 'menu-show')}${DICE('data-random-show', 'A show at random')}`, `<div class="menu-cup-tracks">Played whole from the top: ${all.length} shows to pick from</div>`, true);
  }

  /** Race to: the laps, or until the song ends. */
  private songEndRow(line: (row: MenuRow, label: string, value: string, extra?: string, small?: boolean) => string): string {
    const on = settings().raceToSongEnd;
    const what = settings().soundtrack === 'show' ? 'the song playing in the set' : "the track's song";
    const blurb = on ? `Laps without end until ${what} ends: whoever's in front then wins. No race times are kept` : "The track's laps, as ever";
    return line('songEnd', 'Race to', on ? "Song's end" : 'Laps', `<div class="menu-cup-tracks">${blurb}</div>`, true);
  }

  /** A cup tile's best trophy, at any class. */
  private cupBadge(cupId: string): string {
    const rank = { bronze: 1, silver: 2, gold: 3 } as const;
    const best = cupTrophies(progress(), cupId, this.choice.mirror)
      .map((t) => t.result.trophy)
      .filter((t): t is NonNullable<typeof t> => !!t)
      .sort((a, b) => rank[b] - rank[a])[0];
    return best ? `<i class="menu-trophy ${best}">${TROPHY_GLYPH[best]}</i>` : '';
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

/** A preview shot in public/previews (taken by tools/previews.mjs). */
function preview(kind: 'tracks' | 'skills', id: string): string {
  return `previews/${kind}/${id}.jpg`;
}

/** A dice button inside a row's value: one tap rolls that row. */
function DICE(attr: string, title: string): string {
  return `<button class="menu-dice" ${attr} title="${title}">&#9860;</button>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
