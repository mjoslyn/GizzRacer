import { buildElbow } from './elbow';
import type { TrackDef } from './track';

/** Empty (the All Stars Cup #2): a placeholder on Elbow's layout until its own lap is laid. */
export function buildEmpty(): TrackDef {
  const base = buildElbow();
  return {
    ...base,
    id: 'empty',
    name: 'Empty',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'pale' })) },
    theme: 'emptiness',
    music: { lap: 'empty', finalLap: 'empty-final-lap' },
  };
}
