import { seededRandom } from './math';
import type { ItemKind } from '../items/items';
import { RACERS, type KartParams, type RacerDef } from '../physics/racers';
import { GEN_COMPLEXITY_MAX, type GenParams, type GenTheme } from '../tracks/generator';
import { CHAPTER_SKILLS, SKILLS, type SkillKind } from './skills';

/**
 * Story mode's album run: Murder of the Universe (2017) as a roguelike run
 * (the pick's last story; the band's suites, core/suites.ts, are the rest). Its three
 * chapters are the acts, each two races on new generated tracks, a skill
 * game (core/skills.ts) and a one-on-one duel with the chapter's boss on a
 * hand-built track. Clear a stage to pick a boon. There is one life: a
 * miss ends the run, unless Planet B has given another, which is spent to
 * restart the stage as it was. Nonagon Infinity never ends, so a lost run
 * is the loop starting over.
 */

export interface StoryBoss {
  /** The hand-built track the chapter ends on. */
  trackId: string;
  /** The boss racer (its own, unlocked by beating it), and a model for when the player is driving that one. */
  racerId: string;
  altRacerId: string;
  name: string;
  /** Said on the chapter's boss card. */
  taunt: string;
}

export interface StoryAct {
  chapter: string;
  title: string;
  /** The chapter card's text. */
  intro: string;
  /** Worlds its generated tracks are drawn from. */
  themes: readonly GenTheme[];
  /** Hand-built tracks in its worlds for the Deadstick Landing (each has a launcher to fly from). */
  launchTracks: readonly string[];
  boss: StoryBoss;
}

export const ACTS: readonly StoryAct[] = [
  {
    chapter: 'Chapter I',
    title: 'The Tale of the Altered Beast',
    intro: 'Nonagon Infinity opens the door. Past it, in the wilds, a voice promises you everything if you will only let it in. It is the Altered Beast, and it wants to wear you.',
    themes: ['jungle', 'carrion', 'goblin'],
    launchTracks: ['goblin-garden', 'people-vultures'],
    boss: { trackId: 'inner-cell', racerId: 'altered-beast', altRacerId: 'fuzz-golem', name: 'The Altered Beast', taunt: 'Alter me, it says. Down here, in the cell, it alters you.' },
  },
  {
    chapter: 'Chapter II',
    title: 'The Lord of Lightning vs Balrog',
    intro: 'Two powers at war over a burning world. The Lord of Lightning splits the sky, the Balrog answers from the fire below, and you are racing across the battlefield.',
    themes: ['storm', 'volcano', 'mars'],
    launchTracks: ['petrodragonic-apocalypse', 'crumbling-castle'],
    boss: { trackId: 'supercell', racerId: 'balrog', altRacerId: 'gator-drummer', name: 'The Balrog', taunt: 'The Lord of Lightning strikes the storm. The Balrog outruns it. Can you, one on one?' },
  },
  {
    chapter: 'Chapter III',
    title: 'Han-Tyumi and the Murder of the Universe',
    intro: 'Han-Tyumi, the confused cyborg, wants the two things no cyborg can have: to die, and to vomit. He has made a way to get both, and it is eating everything there is.',
    themes: ['neon', 'factory', 'void'],
    launchTracks: ['robot-stop', 'gamma-knife', 'tetrachromacy'],
    boss: { trackId: 'murder-of-the-universe', racerId: 'munt-machine', altRacerId: 'octo-organist', name: 'The Soy-Protein Munt Machine', taunt: 'Han-Tyumi built a machine of steel and soy-protein, and it is eating everything. Beat it to the line, or be the last thing the universe sees.' },
  },
];

/** Stages in each act: two races, a skill game, the boss. */
export const STAGES_PER_ACT = 4;
/** Which stage of an act is the skill game. */
export const SKILL_STAGE = 2;
/** A race is cleared by finishing this high or better; a boss duel by beating the boss. */
export const CLEAR_PLACE = 4;
/** One life; Planet B adds more. */
export const START_LIVES = 1;
export const BOON_CHOICES = 3;
/** The first race's twists (generator complexity); each race after adds one, up to the most. */
export const STORY_TWISTS = 4;
/** The CPUs' pace by act, over the difficulty setting's. */
const ACT_PACE = [1.02, 1.03, 1.045];

export type BoonId = 'mindFuzz' | 'rattlesnake' | 'gilaHide' | 'sleepDrifter' | 'microtonal' | 'planetB' | 'nuclearFusion' | 'figWasps' | 'gammaKnife';

export interface Boon {
  name: string;
  text: string;
}

export const BOONS: Record<BoonId, Boon> = {
  mindFuzz: { name: 'Mind Fuzz', text: 'Your mind is fuzzed and the road goes by faster: +3% top speed' },
  rattlesnake: { name: 'Rattlesnake', text: 'Off the line before it strikes: +15% acceleration' },
  gilaHide: { name: "Gila Monster's Hide", text: 'Tough as the Gila: +15% weight, so bumps go your way' },
  sleepDrifter: { name: 'Sleep Drifter', text: 'Drift like you are dreaming it: drift sparks charge 20% faster' },
  microtonal: { name: 'Microtonal Tuning', text: 'Tuned a quarter tone sharper: +8% turning, less skid' },
  planetB: { name: 'Planet B', text: 'There is no Planet B. Here is one anyway: +1 life' },
  nuclearFusion: { name: 'Nuclear Fusion', text: 'Start every race with a Nuclear Fusion in hand' },
  figWasps: { name: 'Big Fig Wasp Nest', text: 'Item boxes lean toward Big Fig Wasps' },
  gammaKnife: { name: 'The Gamma Knife', text: 'Item boxes lean toward the Gamma Knife' },
};
export const BOON_IDS = Object.keys(BOONS) as BoonId[];

/** What the item boons do to item boxes, the latest taken winning. */
const FAVOURS: Partial<Record<BoonId, ItemKind>> = { figWasps: 'riffMissile', gammaKnife: 'keytarLaser' };

export interface StoryStage {
  act: number;
  /** 0-based within the act: two races, the skill game, the boss. */
  index: number;
  /** A suite's card stage ('card') reads a spoken song's words. */
  kind: 'race' | 'skill' | 'boss' | 'card';
  boss: boolean;
  /** The race's generated track, or null. */
  gen: GenParams | null;
  /** The skill game, or null. */
  skill: SkillKind | null;
  /** A suite's card's own game, played with its words on screen (a miss costs a life, as a skill game's does). */
  cardGame?: SkillKind | null;
  /** Seeds the skill game: the same on a retry. */
  seed: number;
  /** How hard the skill game is (0..2); the act's when absent. */
  level?: number;
  /** A suite's stage: its song, its hand-built track (null: generated, or a card), a card's words. */
  song?: string;
  trackId?: string | null;
  words?: readonly string[];
}

/** 'next': passed with no boon to take (a suite's card), straight on. */
export type StoryOutcome = 'cleared' | 'next' | 'failed' | 'over' | 'won';

/**
 * Racer models for the boss racers until they're in RACERS (the boss
 * racers' own workstream adds them): each boss drives one of these, under
 * its own name. Once its own racer is there, that's used.
 */
export const BOSS_STAND_INS: Record<string, string> = {
  'mind-voice': 'fuzz-golem',
  'people-vulture': 'gator-drummer',
  'altered-beast': 'gator-drummer',
  balrog: 'fuzz-golem',
  'munt-machine': 'cyborg-gourmand',
  'castle-king': 'lizard-warlock',
  'the-devil': 'skeleton-dragon',
  'coven-mother': 'swamp-witch',
};
/** The model when the player is driving the boss's own (or its stand-in). */
export const BOSS_ALT = 'octo-organist';

/** The kart a boss drives against `player`: its own racer, else its stand-in, never the player's own model; named as the boss. */
export function bossRacer(racerId: string, name: string, player: RacerDef, standIn = BOSS_STAND_INS[racerId]): RacerDef {
  const own = RACERS.find((r) => r.id === racerId);
  const find = (id: string | undefined) => RACERS.find((r) => r.id === id && r.id !== player.id);
  const base = (own && own.id !== player.id ? own : undefined) ?? find(standIn) ?? find(BOSS_ALT) ?? RACERS.find((r) => r.id !== player.id) ?? RACERS[0];
  return { ...base, name };
}

export class StoryRun {
  lives = START_LIVES;
  readonly boons: BoonId[] = [];
  /** Stages cleared so far: the next stage is this one. */
  cleared = 0;
  /** Tries at the current stage (a retry skips the chapter's card). */
  tries = 0;
  /** Boons to pick from after a clear, until one is taken. */
  offer: BoonId[] = [];
  /** Each chapter's skill game: a different one each, drawn for the run. */
  readonly skills: SkillKind[];
  private readonly rand: () => number;

  constructor(readonly seed: number) {
    this.rand = seededRandom(seed);
    const draw = seededRandom(seed * 31 + 17);
    const pool: SkillKind[] = [...CHAPTER_SKILLS];
    this.skills = ACTS.map(() => pool.splice(Math.floor(draw() * pool.length), 1)[0]);
  }

  /** Which story this is on the pick. */
  get id(): string {
    return 'motu';
  }

  get total(): number {
    return ACTS.length * STAGES_PER_ACT;
  }

  get finished(): boolean {
    return this.cleared >= this.total || this.lives <= 0;
  }

  get race(): StoryStage {
    const n = Math.min(this.cleared, this.total - 1);
    const act = Math.floor(n / STAGES_PER_ACT);
    const index = n % STAGES_PER_ACT;
    const kind = index === STAGES_PER_ACT - 1 ? 'boss' : index === SKILL_STAGE ? 'skill' : 'race';
    const seed = (this.seed + n * 7919) % 2147483647;
    return { act, index, kind, boss: kind === 'boss', gen: kind === 'race' ? this.genParams(act, index) : null, skill: kind === 'skill' ? this.skills[act] : null, seed };
  }

  /** The Deadstick Landing's track: one of the chapter's, drawn for the run. */
  get launchTrack(): string {
    const list = this.actDef.launchTracks;
    return list[Math.floor(this.seed / 7) % list.length];
  }

  get actDef(): StoryAct {
    return ACTS[this.race.act];
  }

  /** The next race opens a chapter (its card shows first). */
  get actStart(): boolean {
    return this.race.index === 0 && this.tries === 0;
  }

  get pace(): number {
    return ACT_PACE[this.race.act] ?? 1;
  }

  /** The boss for the player's racer: never the same model as the player's. */
  bossRacer(player: RacerDef): RacerDef {
    const b = this.actDef.boss;
    return bossRacer(b.racerId, b.name, player, BOSS_STAND_INS[b.racerId] ?? b.altRacerId);
  }

  /** The stage as the results and race intro name it. */
  stageLabel(): string {
    const r = this.race;
    return r.boss ? 'Boss' : r.skill ? SKILLS[r.skill].name : `Race ${r.index + 1}`;
  }

  /** Boss racers beaten this run, and whether each was newly unlocked. */
  readonly beaten: { racerId: string; name: string; fresh: boolean }[] = [];
  /** Unlocks a boss racer once beaten (progress.ts's beatBoss): true if newly. */
  unlock: (racerId: string) => boolean = () => false;

  /** Whether a finish clears a race: placed high enough, or on a boss duel, ahead of the boss. */
  passes(place: number, bossPlace: number | null): boolean {
    return bossPlace === null ? place <= CLEAR_PLACE : place < bossPlace;
  }

  /** Scores the stage just played and moves the run on. */
  record(passed: boolean): StoryOutcome {
    if (!passed) {
      this.lives--;
      this.tries++;
      return this.lives <= 0 ? 'over' : 'failed';
    }
    const n = Math.min(this.cleared, this.total - 1);
    if (this.race.boss) this.bossBeaten();
    this.cleared++;
    this.tries = 0;
    if (this.cleared >= this.total) return 'won';
    if (!this.offersBoon(n)) return 'next';
    this.offer = this.drawOffer();
    return 'cleared';
  }

  /** Records the boss just beaten, unlocking its racer. */
  protected bossBeaten(): void {
    const b = this.actDef.boss;
    if (this.beaten.some((x) => x.racerId === b.racerId)) return;
    this.beaten.push({ racerId: b.racerId, name: b.name, fresh: this.unlock(b.racerId) });
  }

  /** Whether clearing stage `n` offers a boon: always, on the album run. */
  protected offersBoon(_n: number): boolean {
    return true;
  }

  take(id: BoonId): void {
    if (!this.offer.includes(id)) return;
    this.offer = [];
    if (id === 'planetB') this.lives++;
    else this.boons.push(id);
  }

  /** How many of a boon the run holds. */
  count(id: BoonId): number {
    return this.boons.filter((b) => b === id).length;
  }

  /** The item boxes' lean for the player, if an item boon is held. */
  get favour(): ItemKind | null {
    for (let i = this.boons.length - 1; i >= 0; i--) {
      const f = FAVOURS[this.boons[i]];
      if (f) return f;
    }
    return null;
  }

  /** The item the player starts each race holding, if any. */
  get startItem(): ItemKind | null {
    return this.count('nuclearFusion') ? 'feedbackWave' : null;
  }

  /** The player's kart with the stat boons on (they stack). */
  applyBoons(p: KartParams): void {
    p.topSpeed *= 1.03 ** this.count('mindFuzz');
    p.accel *= 1.15 ** this.count('rattlesnake');
    p.mass *= 1.15 ** this.count('gilaHide');
    p.driftChargeRate *= 1.2 ** this.count('sleepDrifter');
    const tune = this.count('microtonal');
    p.turnRate *= 1.08 ** tune;
    p.driftTurnRate *= 1.08 ** tune;
    p.slide *= 0.92 ** tune;
  }

  /** Three different boons; the one-off ones (start item) only while not held. */
  private drawOffer(): BoonId[] {
    const pool = BOON_IDS.filter((b) => !(b === 'nuclearFusion' && this.count(b)) && FAVOURS[b] !== this.favour);
    const out: BoonId[] = [];
    while (out.length < BOON_CHOICES && pool.length) out.push(pool.splice(Math.floor(this.rand() * pool.length), 1)[0]);
    return out;
  }

  /**
   * A track in one of the act's worlds, twistier as the run goes on: twists
   * 4 and 5 in Chapter I, 5 after (from the first race no plain square: esses,
   * hairpins, a coaster, a shortcut chord and the hazards thick), all medium
   * length, for more of it to get wrong.
   */
  private genParams(act: number, index: number): GenParams {
    const r = seededRandom(this.seed + act * 7919 + index * 104729);
    const themes = ACTS[act].themes;
    return {
      seed: Math.floor(r() * 1e9),
      theme: themes[Math.floor(r() * themes.length)],
      complexity: Math.min(GEN_COMPLEXITY_MAX, STORY_TWISTS + act + index),
      length: 'medium',
    };
  }
}
