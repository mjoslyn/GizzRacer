import { buildElbow } from './elbow';
import type { TrackDef } from './track';

/** Straws in the Wind (the All Stars Cup #1): a placeholder on Elbow's layout until its own lap is laid. */
export function buildStrawsInTheWind(): TrackDef {
  const base = buildElbow();
  return {
    ...base,
    id: 'straws-in-the-wind',
    name: 'Straws in the Wind',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'farmtrack' })) },
    theme: 'windmill',
    music: { lap: 'straws-in-the-wind', finalLap: 'straws-in-the-wind-final-lap' },
  };
}
