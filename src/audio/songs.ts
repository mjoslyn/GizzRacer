/**
 * The King Gizzard & the Lizard Wizard song each track is themed on, and
 * the versions of its music: the classic seqbaby theme, a video game
 * remix of the song, and the band's own recording from the Bootlegger
 * archive (public/music/official/, added once cleared with the band).
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
};

/** Which music plays in a race: the classic themes, the remixes, the band's recordings, or a pick per race. */
export type MusicVersion = 'remix' | 'official' | 'classic' | 'random';
export const MUSIC_VERSIONS: readonly MusicVersion[] = ['remix', 'official', 'classic', 'random'];
export const MUSIC_VERSION_NAMES: Record<MusicVersion, string> = { remix: 'Remix', official: 'Official', classic: 'Classic', random: 'Random' };

const FINAL = '-final-lap';

/**
 * The cues to try for a classic cue in a version, best first; the classic
 * cue itself is always last, so a missing file falls back to it. A final
 * lap without its own remix falls back to the lap remix.
 */
export function versionCues(cue: string, version: Exclude<MusicVersion, 'random'>): string[] {
  const final = cue.endsWith(FINAL);
  const base = final ? cue.slice(0, -FINAL.length) : cue;
  if (version === 'remix') return final ? [`${base}-remix${FINAL}`, `${base}-remix`, cue] : [`${base}-remix`, cue];
  // A recording plays whole, final lap and all.
  if (version === 'official') return [`official/${base}`, cue];
  return [cue];
}
