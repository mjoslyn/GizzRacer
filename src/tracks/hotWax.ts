import { buildElbow } from './elbow';
import type { TrackDef } from './track';

/** Hot Wax (the All Stars Cup #2): a placeholder on Elbow's layout until its own lap is laid. */
export function buildHotWax(): TrackDef {
  const base = buildElbow();
  return {
    ...base,
    id: 'hot-wax',
    name: 'Hot Wax',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'wax' })) },
    theme: 'hotwax',
    music: { lap: 'hot-wax', finalLap: 'hot-wax-final-lap' },
  };
}
