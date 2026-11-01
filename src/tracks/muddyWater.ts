import { buildElbow } from './elbow';
import type { TrackDef } from './track';

/** Muddy Water (the Gumboot Soup Cup): a placeholder on Elbow's layout until its own lap is laid. */
export function buildMuddyWater(): TrackDef {
  const base = buildElbow();
  return {
    ...base,
    id: 'muddy-water',
    name: 'Muddy Water',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'clay' })) },
    theme: 'muddy',
    music: { lap: 'muddy-water', finalLap: 'muddy-water-final-lap' },
  };
}
