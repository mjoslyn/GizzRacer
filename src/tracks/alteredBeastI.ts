import { buildElbow } from './elbow';
import type { TrackDef } from './track';

/** Altered Beast I (the Altered Beast Cup): a placeholder on Elbow's layout until its own lap is laid. */
export function buildAlteredBeastI(): TrackDef {
  const base = buildElbow();
  return {
    ...base,
    id: 'altered-beast-i',
    name: 'Altered Beast I',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'crust' })) },
    theme: 'newworld',
    music: { lap: 'altered-beast-i', finalLap: 'altered-beast-i-final-lap' },
  };
}
