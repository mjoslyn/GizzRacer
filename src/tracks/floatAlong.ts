import { buildMuckraker } from './muckraker';
import type { TrackDef } from './track';

/** Float Along (the Float Along – Fill Your Lungs Cup): a placeholder on Muckraker's layout until its own lap is laid. */
export function buildFloatAlong(): TrackDef {
  const base = buildMuckraker();
  return {
    ...base,
    id: 'float-along',
    name: 'Float Along',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'gravel' })) },
    theme: 'float',
    music: { lap: 'float-along', finalLap: 'float-along-final-lap' },
  };
}
