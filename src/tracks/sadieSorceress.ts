import { buildMuckraker } from './muckraker';
import type { TrackDef } from './track';

/** Sadie Sorceress (the All Stars Cup #2): a placeholder on Muckraker's layout until its own lap is laid. */
export function buildSadieSorceress(): TrackDef {
  const base = buildMuckraker();
  return {
    ...base,
    id: 'sadie-sorceress',
    name: 'Sadie Sorceress',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'rink' })) },
    theme: 'sorceress',
    music: { lap: 'sadie-sorceress', finalLap: 'sadie-sorceress-final-lap' },
  };
}
