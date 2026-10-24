/** The picker's modes, named and described: here so the picker and the manual (manual.ts) say the same. */
export type RaceMode = 'grandPrix' | 'story' | 'skills' | 'single' | 'timeTrial' | 'generator' | 'infinite' | 'online';

export const MODE_NAMES: Record<RaceMode, string> = {
  grandPrix: 'Grand Prix',
  story: 'Story',
  skills: 'Skill Games',
  single: 'Single Race',
  timeTrial: 'Time Trial',
  generator: 'Track Generator',
  infinite: 'Infinite',
  online: 'Online',
};

export const MODE_BLURBS: Record<RaceMode, string> = {
  grandPrix: 'Four races for the cup, points across them, rivals who want it too',
  story: 'Murder of the Universe in three chapters: races, skill games and boss duels, a boon for every stage cleared, and one life',
  skills: "Story mode's skill games on their own: play the riff, the nonagon, the banana, the clock, the Mind Fuzz suite or a deadstick landing",
  single: 'One track, a full field, items on',
  timeTrial: 'Alone against the clock, the ghosts and the leaderboard',
  generator: 'A track made on the spot: the daily, your saved ones, or a new roll',
  infinite: 'Laps without end, one track or a new one every few laps, generated if you like: race, or sit back and watch the CPUs to the music',
  online: 'Race friends with a room code',
};
