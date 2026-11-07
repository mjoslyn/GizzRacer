import { seededRandom } from './math';
import type { LiveRecording } from '../audio/music';
import type { RacerDef } from '../physics/racers';
import { GEN_COMPLEXITY_MAX, type GenParams, type GenTheme } from '../tracks/generator';
import type { SkillKind } from './skills';
import { BOSS_ALT, BOSS_STAND_INS, STORY_TWISTS, StoryRun, bossRacer, type StoryAct, type StoryStage } from './story';

/**
 * Story mode's suites: the band's song cycles, each a run of its own, one
 * stage a song in the order the band play them (the shared contract,
 * scratchpad suites/CONTRACT.md). A song is a race (R) on its own
 * hand-built track, or on a generated one named from its lyrics; a card
 * (C) with its spoken words, while its live recording plays; or the boss
 * duel (B) against the suite's boss racer, which beating unlocks. A skill
 * game, where one fits the suite, comes just before the boss.
 */

export type SuiteStageKind = 'R' | 'C' | 'B';

/** A generated track for a song with no hand-built one: its world, and its name and section names from the lyrics. */
export interface SuiteGen {
  theme: GenTheme;
  name: string;
  places: readonly string[];
}

export interface SuiteStage {
  kind: SuiteStageKind;
  /** The song's title, exactly as suites.json keys it. */
  song: string;
  /** The song's own hand-built track. */
  trackId?: string;
  /** Else a generated one. */
  gen?: SuiteGen;
  /** A card's words: the song's spoken lines, one a line. */
  words?: readonly string[];
}

export interface SuiteBoss {
  /** The boss racer (RACERS, `boss: '<suite id>'`), unlocked by beating it. */
  racerId: string;
  name: string;
  /** Said on the boss's card. */
  taunt: string;
}

export interface Suite {
  id: string;
  name: string;
  album: string;
  year: number;
  /** The run's opening card. */
  intro: string;
  /** The won card's words, before the unlock. */
  ending: string;
  boss: SuiteBoss;
  /** The suite's skill game, played just before the boss; none where nothing fits. */
  skill: SkillKind | null;
  stages: readonly SuiteStage[];
}

const MOTU = { album: 'Murder of the Universe', year: 2017 };

export const SUITES: readonly Suite[] = [
  {
    id: 'mind-fuzz',
    name: 'The Mind Fuzz Suite',
    album: "I'm in Your Mind Fuzz",
    year: 2014,
    intro: 'Four songs run together into one: into the mind, out of it, through the cellophane and into the fuzz. Something is in there with you, and it wants the wheel.',
    ending: 'The fuzz clears and the voice goes quiet. It is out of your mind, and now it drives for you.',
    boss: { racerId: 'mind-voice', name: 'The Voice in Your Mind', taunt: "I'm in your mind fuzz. Beat me to the line, and I'll get out of it." },
    skill: 'mindfuzz',
    stages: [
      { kind: 'R', song: "I'm in Your Mind", trackId: 'im-in-your-mind' },
      { kind: 'R', song: "I'm Not in Your Mind", trackId: 'im-not-in-your-mind' },
      { kind: 'R', song: 'Cellophane', trackId: 'cellophane' },
      { kind: 'B', song: "I'm in Your Mind Fuzz", trackId: 'im-in-your-mind-fuzz' },
    ],
  },
  {
    id: 'nonagon-infinity',
    name: 'Nonagon Infinity',
    album: 'Nonagon Infinity',
    year: 2016,
    intro: 'The album that never ends. Robot Stop opens the door, the Big Fig Wasp is buzzing in the trees, the Gamma Knife cuts, and the People-Vultures circle overhead.',
    ending: 'The vulture drops away, and the loop comes round: Nonagon Infinity opens the door again.',
    boss: { racerId: 'people-vulture', name: 'The People-Vulture', taunt: 'People-vultures, circling. Outrun this one and the loop lets you go.' },
    skill: 'nonagon',
    stages: [
      { kind: 'R', song: 'Robot Stop', trackId: 'robot-stop' },
      // Its lyrics came back empty: named from the song's own images, the wasp, the fig and the nest.
      { kind: 'R', song: 'Big Fig Wasp', gen: { theme: 'grove', name: 'The Big Fig Wasp Nest', places: ['Fig Tree', 'Wasp Nest', 'Big Fig', 'Paper Nest', 'Stinger', 'Swarm', 'Fig Bough', 'Buzzing Hive'] } },
      { kind: 'R', song: 'Gamma Knife', trackId: 'gamma-knife' },
      { kind: 'B', song: 'People-Vultures', trackId: 'people-vultures' },
    ],
  },
  {
    id: 'altered-beast',
    name: 'The Tale of the Altered Beast',
    ...MOTU,
    intro: 'After the cataclysm, a new world, and in it a beast that promises you everything if you will only let it in. Altered beast, alter me.',
    ending: 'The beast is beaten, and it was you all along. Altered, you drive on into the new world.',
    boss: { racerId: 'altered-beast', name: 'The Altered Beast', taunt: 'Alter me, it says. Beat it to the line, or become it.' },
    skill: null,
    stages: [
      {
        kind: 'C',
        song: 'A New World',
        words: [
          'As soon as the dust settles you can see',
          'A new world in place of where the old one had been',
          'And as your eyes accommodate, there appears by the meadow',
          'A brute like a bear with a long dark shadow',
          'And you violently shake over what you have seen',
          'As you remembered the tale of the Altered Beast',
        ],
      },
      { kind: 'R', song: 'Altered Beast I', trackId: 'altered-beast-i' },
      { kind: 'R', song: 'Altered Beast II', trackId: 'altered-beast-ii' },
      { kind: 'R', song: 'Altered Beast III', trackId: 'altered-beast-iii' },
      { kind: 'B', song: 'Altered Beast IV', trackId: 'altered-beast-iv' },
      {
        kind: 'C',
        song: 'Life / Death',
        words: [
          'Are you you? Are you me?',
          'Or someone in between?',
          'You lost track inside the labyrinthine',
          'In life you have taken much more than your worth',
          "Now it's your turn to give back to the earth",
        ],
      },
    ],
  },
  {
    id: 'lord-of-lightning',
    name: 'The Lord of Lightning vs. Balrog',
    ...MOTU,
    intro: 'A teller who hid in the quagmire and saw it all tells of two powers at war over a burning world: the Lord of Lightning, and the Balrog his lightning made.',
    ending: 'The Balrog smoulders, and the Lord of Lightning is gone into the moonless night. You are the last one on the road.',
    boss: { racerId: 'balrog', name: 'The Balrog', taunt: 'The Balrog fears not the lightning lord. Does it fear you? One on one, through the fire.' },
    skill: 'horology',
    stages: [
      { kind: 'C', song: 'Some Context', words: ['(Instrumental)'] },
      {
        kind: 'C',
        song: 'The Reticent Raconteur',
        words: [
          "There is a secret I've been keeping, a story true and genuine",
          'And I have not the candid heart to keep its burden clandestine',
          'I saw death become of light and life become of fire',
          'I saw it from my hiding place within the quagmire',
          'I bringeth forth the drama, unabridged and unignored',
          'The battle of the Balrog and the mighty lightning lord',
        ],
      },
      { kind: 'R', song: 'The Lord of Lightning', gen: { theme: 'storm', name: 'The Electric Snare', places: ['Floating Fire', 'Golden Wire', 'Silver Trails', 'Flashing Spire', 'Citrine Fleece', 'Crooked Look', 'Carnival of Paint', 'Strong Finger'] } },
      { kind: 'B', song: 'The Balrog', gen: { theme: 'volcano', name: 'The Massive Rift', places: ['Atom Split', 'Massive Rift', 'Burnt Path', 'Lapis Hot', 'Great Pot', 'Blazing Zealot', 'Murmurings', 'Overlord'] } },
      {
        kind: 'C',
        song: 'The Floating Fire',
        words: [
          'And thus revenge was fruitless for one who had been turned',
          'And we are reminded who lords over this altered world',
          'Lord of lightning safe he',
          'Pulls a golden stake',
          'Launches into space and',
          'Mutters to the beast one word:',
          'Lightning!',
        ],
      },
      {
        kind: 'C',
        song: 'The Acrid Corpse',
        words: [
          'And as the acrid Balrog corpse smoulders just like it began',
          'Its crimson-orange light melts into the setting sun',
          'And leaving us not without a final clap of light',
          'The Lightning Lord escapes as day fades into moonless night',
        ],
      },
    ],
  },
  {
    id: 'han-tyumi',
    name: 'Han-Tyumi and the Murder of the Universe',
    ...MOTU,
    intro: 'An altered future. Han-Tyumi, the confused cyborg, wants the two human things no cyborg can do, and builds a machine to get them. It will not stop growing.',
    ending: 'The machine is beaten to the line. The universe is still here, for now, and the Munt Machine is yours to drive.',
    boss: { racerId: 'munt-machine', name: 'The Soy-Protein Munt Machine', taunt: 'Born from a test tube, into a vat. It grows, and the universe is next. Beat it to the line.' },
    skill: 'robot',
    stages: [
      {
        kind: 'C',
        song: 'Welcome to an Altered Future',
        words: ['Impertinent and ignorant.', 'Deathless and restless.', 'Cold contrite cowards.', 'Digitised satellite.', 'Augmented entities.', 'Unremembered God.', 'The world fades to black.', 'Digital black.', 'Welcome to an altered future.'],
      },
      { kind: 'R', song: 'Digital Black', gen: { theme: 'smog', name: 'Roaring Silence', places: ['Whiteness to Grey', 'Cimmerian', 'Brittle Egg', 'Last Human', 'Colossal Confusion', 'Black Wave', 'Caliginous', 'Illusion'] } },
      { kind: 'R', song: 'Han-Tyumi, the Confused Cyborg', gen: { theme: 'neon', name: 'The Virtual Rainbow', places: ['Bodhi Tree', 'Pseudo-Mind', 'Virtual Rainbow', 'Quasi-Synapse', 'Dense and Black', 'Primordial', 'Clamber', 'Noble Death'] } },
      {
        kind: 'C',
        song: 'Soy-Protein Munt Machine',
        words: ['So I built a machine.', 'A human machine.', 'I made it with steel.', 'And soy-protein.', 'Born from a test tube.', 'And into a vat.', 'To live and to heave.', 'And to die just like that.'],
      },
      { kind: 'R', song: 'Vomit Coffin', gen: { theme: 'factory', name: 'One with Machine', places: ['Queasy Green', 'Rotten Scoff', 'Thankless Swine', 'Magic I Conjure', 'Spew Coat', 'No Name', 'Berserk', 'Frankenstein'] } },
      { kind: 'B', song: 'Murder of the Universe', gen: { theme: 'void', name: 'The Vomit-Verse', places: ["Saturn's Rings", "Jupiter's Storms", 'Kuiper Belt', 'Milky Way', 'Ancient Geyser', 'Unfurling Rainbow', 'Critical Density', 'Singularity'] } },
    ],
  },
  {
    id: 'polygondwanaland',
    name: 'Polygondwanaland',
    album: 'Polygondwanaland',
    year: 2017,
    intro: 'Goodbye, kinsman: off to a land grand and never been seen by man, past the crumbling castle, down the river and up to the castle in the air.',
    ending: 'You got there. The King of the Castle in the Air hands over the keys, and the clouds close behind you.',
    boss: { racerId: 'castle-king', name: 'The King of the Castle in the Air', taunt: 'He looks down from above the clouds. Race him round his castle, with nothing below but air.' },
    skill: 'castle',
    stages: [
      { kind: 'R', song: 'Crumbling Castle', trackId: 'crumbling-castle' },
      { kind: 'R', song: 'Polygondwanaland', gen: { theme: 'jungle', name: 'Follow Where the River Runs', places: ['Goodbye Kinsman', 'Veil of a Dream', 'Exit Snow', 'Rain Drops', 'Sand and Mountain', 'Hidden Hand', 'Fasten Seatbelts', 'Gondwana'] } },
      { kind: 'B', song: 'The Castle in the Air', trackId: 'castle-in-the-air' },
    ],
  },
  {
    id: 'infest-the-rats-nest',
    name: "Infest the Rats' Nest",
    album: "Infest the Rats' Nest",
    year: 2019,
    intro: 'There is no Planet B. The rich have gone to Mars, the rest farm what is left, Venus burns, and at the bottom of it all is Hell.',
    ending: 'The Devil is beaten in his own place. Up you climb, out of the rats’ nest, with him in the passenger seat.',
    boss: { racerId: 'the-devil', name: 'The Devil', taunt: 'The Devil waits at the bottom. Beat him at his own game, on his own road.' },
    skill: 'rattlesnake',
    stages: [
      { kind: 'R', song: 'Planet B', trackId: 'planet-b' },
      { kind: 'R', song: 'Mars for the Rich', trackId: 'mars-for-the-rich' },
      { kind: 'R', song: 'Organ Farmer', gen: { theme: 'dome', name: 'Farm Colossal', places: ['Careful Precision', 'Citadel', 'Human Laboratory', 'Meadow', 'Fossil Fields', 'Delicatessen', 'Counting Coins', 'Wiretap'] } },
      { kind: 'R', song: 'Self-Immolate', gen: { theme: 'solar', name: 'Venusian Mal-de-Mer', places: ['Molten Lava', 'Volcano', 'Tornado', 'Leaf upon Air', 'Airostat', 'Venusian', 'Nirvana', 'Bird in a Cage'] } },
      { kind: 'B', song: 'Hell', trackId: 'hell' },
    ],
  },
  {
    id: 'petrodragonic-apocalypse',
    name: 'PetroDragonic Apocalypse',
    album: 'PetroDragonic Apocalypse',
    year: 2023,
    intro: 'Motor spirit fuels the end of the world. A supercell rises, the storms converge, and in the fields once green and gold a coven gathers to call something down.',
    ending: 'The spell is broken and the storm passes. The Mother of the Coven bows, and her broom is yours.',
    boss: { racerId: 'coven-mother', name: 'The Mother of the Coven', taunt: 'She has laid the altar and blessed the circle. Break her spell before the moon wanes.' },
    skill: 'riff',
    stages: [
      { kind: 'R', song: 'Motor Spirit', trackId: 'infinite-loop-speedway' },
      { kind: 'R', song: 'Supercell', trackId: 'supercell' },
      { kind: 'R', song: 'Converge', gen: { theme: 'petro', name: 'The Last Frontier', places: ['Twisted Pillars', 'Grey Snakes', 'Celestial Perch', 'Storm Surge', 'Gale Force', 'Green Glade', 'Flying Kites', "Bird's Eye View"] } },
      { kind: 'B', song: 'Witchcraft', gen: { theme: 'phantom', name: 'The Ragged Coven', places: ['Sable Morn', 'Waning Moon', 'Ragged Coven', 'Charged Crystals', 'The Circle', 'Timbers of Oak', 'Candle', 'Lizard and Bat'] } },
    ],
  },
];

/** The album run's id on the story pick (core/story.ts ACTS). */
export const ALBUM_STORY = 'motu';

export function suiteById(id: string): Suite | undefined {
  return SUITES.find((s) => s.id === id);
}

/** How a suite stage's music goes: its own live recording, the one playing held on, or the track's own (song or remix). */
export type SuiteMusic = 'entry' | 'hold' | 'fallback';

/** The suite stage's music: its entry in suites.json when there is one, else hold a live recording already playing, else the track's own. */
export function suiteMusic(entry: LiveRecording | null | undefined, livePlaying: boolean): SuiteMusic {
  if (entry) return 'entry';
  return livePlaying ? 'hold' : 'fallback';
}

/** The CPUs' pace over a suite, from the first stage to the boss. */
const SUITE_PACE: [number, number] = [1.02, 1.045];
/** How hard a suite's skill game is (skills.ts levels 0..2). */
const SUITE_SKILL_LEVEL = 1;

/** A stage as the run plays it: the suite's own, or its skill game. */
type RunStage = SuiteStage | { kind: 'S'; skill: SkillKind };

/** A suite's stages as a run plays them: the skill game (if any) just before the boss. */
export function runStages(suite: Suite): RunStage[] {
  const out: RunStage[] = [];
  for (const st of suite.stages) {
    if (st.kind === 'B' && suite.skill) out.push({ kind: 'S', skill: suite.skill });
    out.push(st);
  }
  return out;
}

/**
 * A suite as a story run: lives, boons and the cards between as the album
 * run has them, one stage a song. Cards give no boon; a boss win unlocks
 * the boss racer (`unlock`, progress.ts's beatBoss).
 */
export class SuiteRun extends StoryRun {
  private readonly plan: RunStage[];

  constructor(
    seed: number,
    readonly suite: Suite,
    unlock?: (racerId: string) => boolean,
  ) {
    super(seed);
    this.plan = runStages(suite);
    if (unlock) this.unlock = unlock;
  }

  override get id(): string {
    return this.suite.id;
  }

  override get total(): number {
    return this.plan.length;
  }

  override get race(): StoryStage {
    const n = Math.min(this.cleared, this.total - 1);
    const st = this.plan[n];
    const seed = (this.seed + n * 7919) % 2147483647;
    const base = { act: 0, index: n, seed, level: SUITE_SKILL_LEVEL };
    if (st.kind === 'S') return { ...base, kind: 'skill', boss: false, gen: null, skill: st.skill };
    const kind = st.kind === 'C' ? 'card' : st.kind === 'B' ? 'boss' : 'race';
    const gen = st.kind !== 'C' && st.gen ? this.suiteGen(n, st.gen) : null;
    return { ...base, kind, boss: kind === 'boss', gen, skill: null, song: st.song, trackId: st.trackId ?? null, words: st.words };
  }

  override get actDef(): StoryAct {
    const s = this.suite;
    return {
      chapter: s.name,
      title: s.name,
      intro: s.intro,
      themes: [],
      launchTracks: [],
      boss: { trackId: '', racerId: s.boss.racerId, altRacerId: BOSS_STAND_INS[s.boss.racerId] ?? BOSS_ALT, name: s.boss.name, taunt: s.boss.taunt },
    };
  }

  override get actStart(): boolean {
    return this.cleared === 0 && this.tries === 0;
  }

  override get pace(): number {
    const t = this.total > 1 ? Math.min(this.cleared, this.total - 1) / (this.total - 1) : 0;
    return SUITE_PACE[0] + (SUITE_PACE[1] - SUITE_PACE[0]) * t;
  }

  override bossRacer(player: RacerDef): RacerDef {
    return bossRacer(this.suite.boss.racerId, this.suite.boss.name, player);
  }

  override stageLabel(): string {
    const r = this.race;
    return r.song ?? super.stageLabel();
  }

  /** What the run opens with on its first card: how many of each stage. */
  get outline(): string {
    const n = (k: SuiteStageKind) => this.suite.stages.filter((s) => s.kind === k).length;
    const races = n('R');
    const cards = n('C');
    const parts = [`${races} ${races === 1 ? 'race' : 'races'}`];
    if (cards) parts.push(`${cards} spoken ${cards === 1 ? 'song' : 'songs'}`);
    if (this.suite.skill) parts.push('a skill game');
    return `${this.suite.stages.length} songs in order: ${parts.join(', ')}, then the boss one on one`;
  }

  /** No boon for a card, nor once there's nothing left but cards to read. */
  protected override offersBoon(n: number): boolean {
    return this.plan.slice(n + 1).some((s) => s.kind !== 'C') && this.plan[n].kind !== 'C';
  }

  /** A generated stage's track: the song's world and lyric names, twistier as the run goes on, medium length. */
  private suiteGen(n: number, g: SuiteGen): GenParams {
    const r = seededRandom(this.seed + n * 104729 + 7);
    const raced = this.plan.slice(0, n).filter((s) => s.kind === 'R' || s.kind === 'B').length;
    return { seed: Math.floor(r() * 1e9), theme: g.theme, complexity: Math.min(GEN_COMPLEXITY_MAX, STORY_TWISTS + raced), length: 'medium', name: g.name, places: g.places };
  }
}
