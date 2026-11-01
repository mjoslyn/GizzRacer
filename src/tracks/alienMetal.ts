import { buildElbow } from './elbow';
import type { TrackDef } from './track';

/** Alien Metal (the Alien Metal Cup): a placeholder on Elbow's layout until its own lap is laid. */
export function buildAlienMetal(): TrackDef {
  const base = buildElbow();
  return {
    ...base,
    id: 'alien-metal',
    name: 'Alien Metal',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'anvil' })) },
    theme: 'forge',
    music: { lap: 'alien-metal', finalLap: 'alien-metal-final-lap' },
  };
}
