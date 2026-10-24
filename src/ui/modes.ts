/** The picker's modes, named and described: here so the picker and the manual (manual.ts) say the same. */
export type RaceMode = 'grandPrix' | 'single' | 'timeTrial' | 'generator' | 'infinite' | 'online';

export const MODE_NAMES: Record<RaceMode, string> = {
  grandPrix: 'Grand Prix',
  single: 'Single Race',
  timeTrial: 'Time Trial',
  generator: 'Track Generator',
  infinite: 'Infinite',
  online: 'Online',
};

export const MODE_BLURBS: Record<RaceMode, string> = {
  grandPrix: 'Four races for the cup, points across them, rivals who want it too',
  single: 'One track, a full field, items on',
  timeTrial: 'Alone against the clock, the ghosts and the leaderboard',
  generator: 'A track made on the spot: the daily, your saved ones, or a new roll',
  infinite: 'Laps without end, or a tour of every track: race, or sit back and watch the CPUs to the music',
  online: 'Race friends with a room code',
};
