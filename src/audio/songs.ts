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
  'infinite-loop-speedway': { title: 'Robot Stop', album: 'Nonagon Infinity', year: 2016 },
  'rattlesnake-run': { title: 'Rattlesnake', album: 'Flying Microtonal Banana', year: 2017 },
  'volcano-fortress': { title: 'Magma', album: 'Ice, Death, Planets, Lungs, Mushrooms and Lava', year: 2022 },
  'polygondwanaland-jungle': { title: 'Crumbling Castle', album: 'Polygondwanaland', year: 2017 },
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
  'polygondwanaland-jungle': { recording: 'Crumbling Castle', release: 'Polygondwanaland (2017), the album master' },
  'magenta-mountain': { recording: 'Magenta Mountain', release: "Live At Red Rocks '22" },
  'kepler-22b': { recording: 'Kepler-22b', release: "Live at Field of Vision '25, the soundboard mix" },
  'goblin-garden': { recording: 'The Garden Goblin', release: "Live At Red Rocks '22" },
  'predator-x': { recording: 'Predator X', release: "Live At Red Rocks '22" },
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
