import { buildElbow } from './elbow';
import type { TrackDef } from './track';

/** Altered Beast III (the Altered Beast Cup): a placeholder on Elbow's layout until its own lap is laid. */
export function buildAlteredBeastIII(): TrackDef {
  const base = buildElbow();
  return {
    ...base,
    id: 'altered-beast-iii',
    name: 'Altered Beast III',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'fur' })) },
    theme: 'altered',
    music: { lap: 'altered-beast-iii', finalLap: 'altered-beast-iii-final-lap' },
  };
}
