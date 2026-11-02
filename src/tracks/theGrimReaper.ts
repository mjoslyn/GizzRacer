import { buildElbow } from './elbow';
import type { TrackDef } from './track';

/** The Grim Reaper (the All Stars Cup #1): a placeholder on Elbow's layout until its own lap is laid. */
export function buildTheGrimReaper(): TrackDef {
  const base = buildElbow();
  return {
    ...base,
    id: 'the-grim-reaper',
    name: 'The Grim Reaper',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'cinder' })) },
    theme: 'grimreaper',
    music: { lap: 'the-grim-reaper', finalLap: 'the-grim-reaper-final-lap' },
  };
}
