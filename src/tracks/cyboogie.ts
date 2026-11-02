import { buildMuckraker } from './muckraker';
import type { TrackDef } from './track';

/** Cyboogie (the All Stars Cup #1): a placeholder on Muckraker's layout until its own lap is laid. */
export function buildCyboogie(): TrackDef {
  const base = buildMuckraker();
  return {
    ...base,
    id: 'cyboogie',
    name: 'Cyboogie',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'graphene' })) },
    theme: 'cyborg',
    music: { lap: 'cyboogie', finalLap: 'cyboogie-final-lap' },
  };
}
