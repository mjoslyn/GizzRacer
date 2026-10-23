import { seededRandom } from './math';
import type { ItemKind } from '../items/items';
import { RACERS, type KartParams, type RacerDef } from '../physics/racers';
import { GEN_COMPLEXITY_MAX, type GenParams, type GenTheme } from '../tracks/generator';

/**
 * Story mode: Murder of the Universe (2017) as a roguelike run. Its three
 * chapters are the acts, each two races on new generated tracks and a
 * boss race on a hand-built one. Clear a race to pick a boon; miss one
 * and the run is over, no second tries. Nonagon Infinity never ends, so a
 * lost run is the loop starting over.
 */

export interface StoryBoss {
  /** The hand-built track the chapter ends on. */
  trackId: string;
  /** The racer model the boss drives, and another for when the player has picked that one. */
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
  boss: StoryBoss;
}

export const ACTS: readonly StoryAct[] = [
  {
    chapter: 'Chapter I',
    title: 'The Tale of the Altered Beast',
    intro: 'Nonagon Infinity opens the door. Past it, in the wilds, a voice promises you everything if you will only let it in. It is the Altered Beast, and it wants to wear you.',
    themes: ['jungle', 'carrion', 'goblin'],
    boss: { trackId: 'inner-cell', racerId: 'gator-drummer', altRacerId: 'fuzz-golem', name: 'The Altered Beast', taunt: 'Alter me, it says. Down here, in the cell, it alters you.' },
  },
  {
    chapter: 'Chapter II',
    title: 'The Lord of Lightning vs Balrog',
    intro: 'Two powers at war over a burning world. The Lord of Lightning splits the sky, the Balrog answers from the fire below, and you are racing across the battlefield.',
    themes: ['storm', 'volcano', 'mars'],
    boss: { trackId: 'supercell', racerId: 'fuzz-golem', altRacerId: 'gator-drummer', name: 'The Balrog', taunt: 'The Lord of Lightning strikes the storm. The Balrog outruns it. Can you?' },
  },
  {
    chapter: 'Chapter III',
    title: 'Han-Tyumi and the Murder of the Universe',
    intro: 'Han-Tyumi, the confused cyborg, wants the two things no cyborg can have: to die, and to vomit. He has made a way to get both, and it is eating everything there is.',
    themes: ['neon', 'factory', 'void'],
    boss: { trackId: 'murder-of-the-universe', racerId: 'cyborg-gourmand', altRacerId: 'octo-organist', name: 'Han-Tyumi', taunt: 'I am Han-Tyumi. Beat me to the line, or be the last thing the universe sees.' },
  },
];

/** Races in each act: the last is the boss. */
export const RACES_PER_ACT = 3;
/** A race is cleared by finishing this high or better; a boss race by beating the boss as well. */
export const CLEAR_PLACE = 4;
export const BOON_CHOICES = 3;
/** The CPUs' pace by act, over the difficulty setting's. */
const ACT_PACE = [1, 1.015, 1.03];

export type BoonId = 'mindFuzz' | 'rattlesnake' | 'gilaHide' | 'sleepDrifter' | 'microtonal' | 'nuclearFusion' | 'figWasps' | 'gammaKnife';

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
  nuclearFusion: { name: 'Nuclear Fusion', text: 'Start every race with a Nuclear Fusion in hand' },
  figWasps: { name: 'Big Fig Wasp Nest', text: 'Item boxes lean toward Big Fig Wasps' },
  gammaKnife: { name: 'The Gamma Knife', text: 'Item boxes lean toward the Gamma Knife' },
};
export const BOON_IDS = Object.keys(BOONS) as BoonId[];

/** What the item boons do to item boxes, the latest taken winning. */
const FAVOURS: Partial<Record<BoonId, ItemKind>> = { figWasps: 'riffMissile', gammaKnife: 'keytarLaser' };

export interface StoryRace {
  act: number;
  /** 0-based within the act; RACES_PER_ACT - 1 is the boss. */
  index: number;
  boss: boolean;
  /** A generated track's dials, or null for the boss's hand-built track. */
  gen: GenParams | null;
}

export type StoryOutcome = 'cleared' | 'over' | 'won';

export class StoryRun {
  readonly boons: BoonId[] = [];
  /** Races cleared so far: the next race is this one. */
  cleared = 0;
  /** The run ended on a missed race. */
  lost = false;
  /** Boons to pick from after a clear, until one is taken. */
  offer: BoonId[] = [];
  private readonly rand: () => number;

  constructor(readonly seed: number) {
    this.rand = seededRandom(seed);
  }

  get total(): number {
    return ACTS.length * RACES_PER_ACT;
  }

  get finished(): boolean {
    return this.cleared >= this.total || this.lost;
  }

  get race(): StoryRace {
    const n = Math.min(this.cleared, this.total - 1);
    const act = Math.floor(n / RACES_PER_ACT);
    const index = n % RACES_PER_ACT;
    const boss = index === RACES_PER_ACT - 1;
    return { act, index, boss, gen: boss ? null : this.genParams(act, index) };
  }

  get actDef(): StoryAct {
    return ACTS[this.race.act];
  }

  /** The next race opens a chapter (its card shows first). */
  get actStart(): boolean {
    return this.race.index === 0;
  }

  get pace(): number {
    return ACT_PACE[this.race.act] ?? 1;
  }

  /** The boss for the player's racer: never the same model as the player's. */
  bossRacer(player: RacerDef): RacerDef {
    const b = this.actDef.boss;
    const id = player.id === b.racerId ? b.altRacerId : b.racerId;
    const base = RACERS.find((r) => r.id === id) ?? RACERS[0];
    return { ...base, name: b.name };
  }

  /** Whether a finish clears the race: placed high enough, and ahead of the boss on a boss race. */
  passes(place: number, bossPlace: number | null): boolean {
    return place <= CLEAR_PLACE && (bossPlace === null || place < bossPlace);
  }

  /** Scores the race just run and moves the run on. */
  record(place: number, bossPlace: number | null): StoryOutcome {
    if (!this.passes(place, bossPlace)) {
      this.lost = true;
      return 'over';
    }
    this.cleared++;
    if (this.cleared >= this.total) return 'won';
    this.offer = this.drawOffer();
    return 'cleared';
  }

  take(id: BoonId): void {
    if (!this.offer.includes(id)) return;
    this.offer = [];
    this.boons.push(id);
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

  /** A short track in one of the act's worlds, twistier as the run goes on. */
  private genParams(act: number, index: number): GenParams {
    const r = seededRandom(this.seed + act * 7919 + index * 104729);
    const themes = ACTS[act].themes;
    return {
      seed: Math.floor(r() * 1e9),
      theme: themes[Math.floor(r() * themes.length)],
      complexity: Math.min(GEN_COMPLEXITY_MAX, 2 + act + index),
      length: 'short',
    };
  }
}
