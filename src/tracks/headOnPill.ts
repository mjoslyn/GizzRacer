import { buildElbow } from './elbow';
import type { TrackDef } from './track';

/** Head On/Pill (the Float Along – Fill Your Lungs Cup): a placeholder on Elbow's layout until its own lap is laid. */
export function buildHeadOnPill(): TrackDef {
  const base = buildElbow();
  return {
    ...base,
    id: 'head-on-pill',
    name: 'Head On/Pill',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'paisley' })) },
    theme: 'headon',
    music: { lap: 'head-on-pill', finalLap: 'head-on-pill-final-lap' },
  };
}
