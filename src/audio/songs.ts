/** The King Gizzard & the Lizard Wizard song each track is themed on. A race plays the track's own seqbaby theme. */
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

/** What a race plays: the track's theme, and on the final lap its faster cut, or the theme again for a track without one. */
export function raceCue(music: { lap: string; finalLap?: string }, finalLap: boolean): string {
  return finalLap ? (music.finalLap ?? music.lap) : music.lap;
}
