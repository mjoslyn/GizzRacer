import { buildMuckraker } from './muckraker';
import type { TrackDef } from './track';

/** Altered Beast IV (the Altered Beast Cup): a placeholder on Muckraker's layout until its own lap is laid. */
export function buildAlteredBeastIV(): TrackDef {
  const base = buildMuckraker();
  return {
    ...base,
    id: 'altered-beast-iv',
    name: 'Altered Beast IV',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'bone' })) },
    theme: 'hollow',
    music: { lap: 'altered-beast-iv', finalLap: 'altered-beast-iv-final-lap' },
  };
}
