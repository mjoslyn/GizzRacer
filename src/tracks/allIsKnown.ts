import { buildElbow } from './elbow';
import type { TrackDef } from './track';

/** All Is Known (the Gumboot Soup Cup): a placeholder on Elbow's layout until its own lap is laid. */
export function buildAllIsKnown(): TrackDef {
  const base = buildElbow();
  return {
    ...base,
    id: 'all-is-known',
    name: 'All Is Known',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'circuit' })) },
    theme: 'network',
    music: { lap: 'all-is-known', finalLap: 'all-is-known-final-lap' },
  };
}
