/**
 * What the trackside knows about the race: the final lap lights everything
 * up (set by trackView.update). Its own module so a track's render module
 * can read it without importing the shared render systems (kits/view.ts).
 */
export const atmosphere = { finalLap: 0 };
