/**
 * The King Gizzard & the Lizard Wizard song each track is themed on. A race
 * plays the video game remix of it; the track's classic seqbaby theme is
 * only a fallback for a remix that isn't there.
 */
export interface TrackSong {
  title: string;
  album: string;
  year: number;
  /** A second song the track is (the Altered Beast Cup's each run an Altered Beast into its Alter Me): Track song plays either. */
  also?: string;
}

/** A track's song or songs, as the credits name them. */
export function songTitles(song: TrackSong): string {
  return song.also ? `${song.title} / ${song.also}` : song.title;
}

const IDPLML = { album: 'Ice, Death, Planets, Lungs, Mushrooms and Lava', year: 2022 };
const PDA = { album: 'PetroDragonic Apocalypse', year: 2023 };
const FMB = { album: 'Flying Microtonal Banana', year: 2017 };
const TBB = { album: '12 Bar Bruise', year: 2012 };
const TSC = { album: 'The Silver Cord', year: 2023 };
const FAFYL = { album: 'Float Along – Fill Your Lungs', year: 2013 };
const MOTU = { album: 'Murder of the Universe', year: 2017 };

export const TRACK_SONGS: Record<string, TrackSong> = {
  'robot-stop': { title: 'Robot Stop', album: 'Nonagon Infinity', year: 2016 },
  'gamma-knife': { title: 'Gamma Knife', album: 'Nonagon Infinity', year: 2016 },
  'people-vultures': { title: 'People-Vultures', album: 'Nonagon Infinity', year: 2016 },
  'wah-wah': { title: 'Wah Wah', album: 'Nonagon Infinity', year: 2016 },
  'rattlesnake-run': { title: 'Rattlesnake', ...FMB },
  'fishies-lagoon': { title: 'Open Water', ...FMB },
  'butterfly-skyway': { title: 'Sleep Drifter', ...FMB },
  'cyboogie-city': { title: 'Doom City', ...FMB },
  'crumbling-castle': { title: 'Crumbling Castle', album: 'Polygondwanaland', year: 2017 },
  'castle-in-the-air': { title: 'The Castle in the Air', album: 'Polygondwanaland', year: 2017 },
  'inner-cell': { title: 'Inner Cell', album: 'Polygondwanaland', year: 2017 },
  tetrachromacy: { title: 'Tetrachromacy', album: 'Polygondwanaland', year: 2017 },
  'planet-b': { title: 'Planet B', album: "Infest the Rats' Nest", year: 2019 },
  'mars-for-the-rich': { title: 'Mars for the Rich', album: "Infest the Rats' Nest", year: 2019 },
  perihelion: { title: 'Perihelion', album: "Infest the Rats' Nest", year: 2019 },
  hell: { title: 'Hell', album: "Infest the Rats' Nest", year: 2019 },
  'magenta-mountain': { title: 'Magenta Mountain', album: 'Omnium Gatherum', year: 2022 },
  'kepler-22b': { title: 'Kepler-22b', album: 'Omnium Gatherum', year: 2022 },
  'goblin-garden': { title: 'The Garden Goblin', album: 'Omnium Gatherum', year: 2022 },
  'predator-x': { title: 'Predator X', album: 'Omnium Gatherum', year: 2022 },
  'ice-v-glacier': { title: 'Ice V', ...IDPLML },
  'volcano-fortress': { title: 'Magma', ...IDPLML },
  'polygondwanaland-jungle': { title: 'Iron Lung', ...IDPLML },
  'murder-of-the-universe': { title: 'Gliese 710', ...IDPLML },
  'infinite-loop-speedway': { title: 'Motor Spirit', ...PDA },
  supercell: { title: 'Supercell', ...PDA },
  'petrodragonic-apocalypse': { title: 'Dragon', ...PDA },
  'hell-on-mars': { title: 'Flamethrower', ...PDA },
  'phantom-island': { title: 'Phantom Island', album: 'Phantom Island', year: 2025 },
  'deadstick-drop': { title: 'Deadstick', album: 'Phantom Island', year: 2025 },
  'panpsych-grove': { title: 'Panpsych', album: 'Phantom Island', year: 2025 },
  'sea-of-doubt': { title: 'Sea of Doubt', album: 'Phantom Island', year: 2025 },
  'im-in-your-mind': { title: "I'm in Your Mind", album: "I'm in Your Mind Fuzz", year: 2014 },
  'im-not-in-your-mind': { title: "I'm Not in Your Mind", album: "I'm in Your Mind Fuzz", year: 2014 },
  cellophane: { title: 'Cellophane', album: "I'm in Your Mind Fuzz", year: 2014 },
  'im-in-your-mind-fuzz': { title: "I'm in Your Mind Fuzz", album: "I'm in Your Mind Fuzz", year: 2014 },
  elbow: { title: 'Elbow', ...TBB },
  muckraker: { title: 'Muckraker', ...TBB },
  'cut-throat-boogie': { title: 'Cut Throat Boogie', ...TBB },
  'sea-of-trees': { title: 'Sea of Trees', ...TBB },
  theia: { title: 'Theia', ...TSC },
  set: { title: 'Set', ...TSC },
  'chang-e': { title: "Chang'e", ...TSC },
  gilgamesh: { title: 'Gilgamesh', ...TSC },
  'head-on-pill': { title: 'Head On/Pill', ...FAFYL },
  'god-is-calling': { title: 'God Is Calling Me Back Home', ...FAFYL },
  'mend-the-past': { title: 'Let Me Mend the Past', ...FAFYL },
  'float-along': { title: 'Float Along – Fill Your Lungs', ...FAFYL },
  'altered-beast-i': { title: 'Altered Beast I', ...MOTU, also: 'Alter Me I' },
  'altered-beast-ii': { title: 'Altered Beast II', ...MOTU, also: 'Alter Me II' },
  'altered-beast-iii': { title: 'Altered Beast III', ...MOTU, also: 'Alter Me III' },
  'altered-beast-iv': { title: 'Altered Beast IV', ...MOTU },
};

/**
 * Remixes written from the band's own recordings, by track (`title` is the
 * title and menu music): which recording they were transcribed from, and the
 * release it came from. King Gizzard & the Lizard Wizard let anyone use their
 * Bootlegger releases (kinggizzardandthelizardwizard.com/bootlegger). Shown
 * in the credits.
 */
export const TRANSCRIBED: Record<string, { recording: string; release: string }> = {
  title: { recording: 'Ice V', release: "Live At Red Rocks '22" },
  'rattlesnake-run': { recording: 'Rattlesnake', release: "Live At Red Rocks '22" },
  'crumbling-castle': { recording: 'Crumbling Castle', release: 'Polygondwanaland (2017), the album master' },
  'castle-in-the-air': { recording: 'The Castle in the Air', release: 'Polygondwanaland (2017), the album master' },
  'inner-cell': { recording: 'Inner Cell', release: 'Polygondwanaland (2017), the album master' },
  tetrachromacy: { recording: 'Tetrachromacy', release: 'Polygondwanaland (2017), the album master' },
  'magenta-mountain': { recording: 'Magenta Mountain', release: "Live At Red Rocks '22" },
  'kepler-22b': { recording: 'Kepler-22b', release: "Live at Field of Vision '25, the soundboard mix" },
  'goblin-garden': { recording: 'The Garden Goblin', release: "Live At Red Rocks '22" },
  'predator-x': { recording: 'Predator X', release: "Live At Red Rocks '22" },
  'phantom-island': { recording: 'Phantom Island', release: "Live in New York '25, the soundboard mix" },
  'deadstick-drop': { recording: 'Deadstick', release: "Live in New York '25, the soundboard mix" },
  'panpsych-grove': { recording: 'Panpsych', release: "Live in New York '25, the soundboard mix" },
  'sea-of-doubt': { recording: 'Sea of Doubt', release: "Live in New York '25, the soundboard mix" },
  'robot-stop': { recording: 'Robot Stop', release: "Live In Brussels '19" },
  'gamma-knife': { recording: 'Gamma Knife', release: "Live In Brussels '19" },
  'people-vultures': { recording: 'People-Vultures', release: "Live In Brussels '19" },
  'wah-wah': { recording: 'Wah Wah', release: "Live In Chicago '23" },
  'planet-b': { recording: 'Planet B', release: "Live In London '19" },
  'mars-for-the-rich': { recording: 'Mars for the Rich', release: "Live In Paris '19" },
  perihelion: { recording: 'Perihelion', release: "Live In Milwaukee '19" },
  hell: { recording: 'Hell', release: "Live In Asheville '19" },
  'fishies-lagoon': { recording: 'Open Water', release: "Live in Athens '25, the soundboard mix" },
  'butterfly-skyway': { recording: 'Sleep Drifter', release: "Live in Barcelona '25, the soundboard mix" },
  'cyboogie-city': { recording: 'Doom City', release: "Live in Lisbon '25, the soundboard mix" },
  'polygondwanaland-jungle': { recording: 'Iron Lung', release: "Live at Field of Vision II '26, the soundboard mix" },
  'murder-of-the-universe': { recording: 'Gliese 710', release: "Live at Field of Vision II '26, the soundboard mix" },
  'infinite-loop-speedway': { recording: 'Motor Spirit', release: "Live at Red Rocks '23, the soundboard mix" },
  'hell-on-mars': { recording: 'Flamethrower', release: "Live at Field of Vision '25, the soundboard mix" },
  'im-in-your-mind': { recording: "I'm in Your Mind", release: "Live at The Caverns '23" },
  'im-not-in-your-mind': { recording: "I'm Not in Your Mind", release: "Live at The Caverns '23" },
  cellophane: { recording: 'Cellophane', release: "Live at The Caverns '23" },
  'im-in-your-mind-fuzz': { recording: "I'm in Your Mind Fuzz", release: "Live at The Caverns '23" },
  elbow: { recording: 'Elbow', release: "Live at Red Rocks '24" },
  muckraker: { recording: 'Muckraker', release: "Live from Studio 5 at PBS 106.7FM '13" },
  'cut-throat-boogie': { recording: 'Cut Throat Boogie', release: "Live in Barcelona '25, the soundboard mix" },
  'sea-of-trees': { recording: 'Sea of Trees', release: "Live At Red Rocks '22" },
  theia: { recording: 'Theia', release: "Live in Barcelona '25, the soundboard mix" },
  set: { recording: 'Set', release: "Live in New York City '25 (Rock Night), the soundboard mix" },
  'chang-e': { recording: "Chang'e", release: "Live at Red Rocks '24, the soundboard mix" },
  gilgamesh: { recording: 'Gilgamesh', release: "Live at Field of Vision '25, the soundboard mix" },
  'head-on-pill': { recording: 'Head On/Pill', release: "Live at Field of Vision II '26, the soundboard mix" },
  'god-is-calling': { recording: 'God Is Calling Me Back Home', release: "Live in Bulgaria '25, the soundboard mix" },
  'mend-the-past': { recording: 'Let Me Mend the Past', release: "Live in Lithuania '25, the soundboard mix" },
  'float-along': { recording: 'Float Along – Fill Your Lungs', release: "Live at Field of Vision '25, the soundboard mix" },
  'altered-beast-i': { recording: 'Altered Beast I / Alter Me I', release: "Rockin' in Melbourne '25, the soundboard mix" },
  'altered-beast-ii': { recording: 'Altered Beast II / Alter Me II', release: "Rockin' in Melbourne '25, the soundboard mix" },
  'altered-beast-iii': { recording: 'Altered Beast III / Alter Me III', release: 'Live at The Fillmore, San Francisco, 2017-10-12, an audience recording' },
  'altered-beast-iv': { recording: 'Altered Beast IV', release: "Live at Field of Vision II '26, the soundboard mix" },
};

const FINAL = '-final-lap';

/**
 * The cues to try for a track's classic cue, best first: its remix, then
 * the classic cue itself, so a missing file falls back to it. A final lap
 * without its own remix falls back to the lap remix.
 */
export function remixCues(cue: string): string[] {
  const final = cue.endsWith(FINAL);
  const base = final ? cue.slice(0, -FINAL.length) : cue;
  return final ? [`${base}-remix${FINAL}`, `${base}-remix`, cue] : [`${base}-remix`, cue];
}

/**
 * Story mode's chapters' own songs, from Murder of the Universe (2017), one
 * list a chapter: what a story race plays on Track song, before its track's
 * own song. Only the ones the band play live are any use; a stage takes the
 * first of its chapter's, from its place on, with recordings. Chapter II has
 * only two the band play, so Vomit Coffin (from Chapter III) is its second
 * race's, leaving The Balrog to the duel.
 */
export const STORY_SONGS: readonly (readonly TrackSong[])[] = [
  [
    { title: 'Altered Beast I', ...MOTU },
    { title: 'Alter Me I', ...MOTU },
    { title: 'Altered Beast II', ...MOTU },
    { title: 'Alter Me II', ...MOTU },
    { title: 'Altered Beast III', ...MOTU },
    { title: 'Alter Me III', ...MOTU },
    { title: 'Altered Beast IV', ...MOTU },
  ],
  [
    { title: 'The Lord of Lightning', ...MOTU },
    { title: 'Vomit Coffin', ...MOTU },
    { title: 'The Balrog', ...MOTU },
    { title: 'The Floating Fire', ...MOTU },
    { title: 'The Acrid Corpse', ...MOTU },
  ],
  [
    { title: 'Digital Black', ...MOTU },
    { title: 'Han-Tyumi the Confused Cyborg', ...MOTU },
    { title: 'Soy-Protein Munt Machine', ...MOTU },
    { title: 'Vomit Coffin', ...MOTU },
    { title: 'Murder of the Universe', ...MOTU },
  ],
];

/** Each chapter's boss duel plays its own song first: the Altered Beast's last, the Balrog's, and the album's end. */
export const STORY_BOSS_SONGS: readonly string[] = ['Altered Beast IV', 'The Balrog', 'Murder of the Universe'];

/** The Deadstick Landing plays the game's own remix of Deadstick (Deadstick Drop's), whatever the soundtrack. */
export const DEADSTICK_CUE = 'deadstick-drop';
