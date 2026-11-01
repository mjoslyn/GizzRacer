import { buildElbow } from './elbow';
import type { TrackDef } from './track';

/** Level 5 (the Alien Metal Cup): a placeholder on Elbow's layout until its own lap is laid. */
export function buildLevel5(): TrackDef {
  const base = buildElbow();
  return {
    ...base,
    id: 'level-5',
    name: 'Level 5',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'lane' })) },
    theme: 'autonomy',
    music: { lap: 'level-5', finalLap: 'level-5-final-lap' },
  };
}
