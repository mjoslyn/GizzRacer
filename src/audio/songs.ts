/**
 * The King Gizzard & the Lizard Wizard song each track is themed on. A race
 * plays the video game remix of it; the track's classic seqbaby theme is
 * only a fallback for a remix that isn't there.
 */
export interface TrackSong {
  title: string;
  album: string;
  year: number;
}

export const TRACK_SONGS: Record<string, TrackSong> = {
  'infinite-loop-speedway': { title: 'Mr. Beat', album: 'Nonagon Infinity', year: 2016 },
  'rattlesnake-run': { title: 'Rattlesnake', album: 'Flying Microtonal Banana', year: 2017 },
  'volcano-fortress': { title: 'Magma', album: 'Ice, Death, Planets, Lungs, Mushrooms and Lava', year: 2022 },
  'polygondwanaland-jungle': { title: 'Polygondwanaland', album: 'Polygondwanaland', year: 2017 },
  'fishies-lagoon': { title: 'Fishing for Fishies', album: 'Fishing for Fishies', year: 2019 },
  'ice-v-glacier': { title: 'Ice V', album: 'Ice, Death, Planets, Lungs, Mushrooms and Lava', year: 2022 },
  'cyboogie-city': { title: 'Cyboogie', album: 'Fishing for Fishies', year: 2019 },
  'butterfly-skyway': { title: 'Catching Smoke', album: 'Butterfly 3000', year: 2021 },
  'hell-on-mars': { title: 'Mars for the Rich', album: "Infest the Rats' Nest", year: 2019 },
  supercell: { title: 'Supercell', album: 'PetroDragonic Apocalypse', year: 2023 },
  'murder-of-the-universe': { title: 'The Lord of Lightning', album: 'Murder of the Universe', year: 2017 },
  'petrodragonic-apocalypse': { title: 'Dragon', album: 'PetroDragonic Apocalypse', year: 2023 },
  'phantom-island': { title: 'Phantom Island', album: 'Phantom Island', year: 2025 },
  'deadstick-drop': { title: 'Deadstick', album: 'Phantom Island', year: 2025 },
  'panpsych-grove': { title: 'Panpsych', album: 'Phantom Island', year: 2025 },
  'sea-of-doubt': { title: 'Sea of Doubt', album: 'Phantom Island', year: 2025 },
  'magenta-mountain': { title: 'Magenta Mountain', album: 'Omnium Gatherum', year: 2022 },
  'kepler-22b': { title: 'Kepler-22b', album: 'Omnium Gatherum', year: 2022 },
  'goblin-garden': { title: 'The Garden Goblin', album: 'Omnium Gatherum', year: 2022 },
  'predator-x': { title: 'Predator X', album: 'Omnium Gatherum', year: 2022 },
  'crumbling-castle': { title: 'Crumbling Castle', album: 'Polygondwanaland', year: 2017 },
  'castle-in-the-air': { title: 'The Castle in the Air', album: 'Polygondwanaland', year: 2017 },
  'inner-cell': { title: 'Inner Cell', album: 'Polygondwanaland', year: 2017 },
  tetrachromacy: { title: 'Tetrachromacy', album: 'Polygondwanaland', year: 2017 },
  'robot-stop': { title: 'Robot Stop', album: 'Nonagon Infinity', year: 2016 },
  'gamma-knife': { title: 'Gamma Knife', album: 'Nonagon Infinity', year: 2016 },
  'people-vultures': { title: 'People-Vultures', album: 'Nonagon Infinity', year: 2016 },
  'wah-wah': { title: 'Wah Wah', album: 'Nonagon Infinity', year: 2016 },
  'planet-b': { title: 'Planet B', album: "Infest the Rats' Nest", year: 2019 },
  'mars-for-the-rich': { title: 'Mars for the Rich', album: "Infest the Rats' Nest", year: 2019 },
  perihelion: { title: 'Perihelion', album: "Infest the Rats' Nest", year: 2019 },
  hell: { title: 'Hell', album: "Infest the Rats' Nest", year: 2019 },
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
  'polygondwanaland-jungle': { recording: 'Polygondwanaland', release: 'Polygondwanaland (2017), the album master' },
  'infinite-loop-speedway': { recording: 'Mr. Beat', release: "Live In London '19" },
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
const MOTU = { album: 'Murder of the Universe', year: 2017 };
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
