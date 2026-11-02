import { buildMuckraker } from './muckraker';
import type { TrackDef } from './track';

/** Gaia (the All Stars Cup #1): a placeholder on Muckraker's layout until its own lap is laid. */
export function buildGaia(): TrackDef {
  const base = buildMuckraker();
  return {
    ...base,
    id: 'gaia',
    name: 'Gaia',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'earth' })) },
    theme: 'gaia',
    music: { lap: 'gaia', finalLap: 'gaia-final-lap' },
  };
}
