import { buildMuckraker } from './muckraker';
import type { TrackDef } from './track';

/** Altered Beast II (the Altered Beast Cup): a placeholder on Muckraker's layout until its own lap is laid. */
export function buildAlteredBeastII(): TrackDef {
  const base = buildMuckraker();
  return {
    ...base,
    id: 'altered-beast-ii',
    name: 'Altered Beast II',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'butcher' })) },
    theme: 'foe',
    music: { lap: 'altered-beast-ii', finalLap: 'altered-beast-ii-final-lap' },
  };
}
