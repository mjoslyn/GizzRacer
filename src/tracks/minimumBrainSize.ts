import { buildElbow } from './elbow';
import type { TrackDef } from './track';

/** Minimum Brain Size (a test track, in no cup yet): a placeholder on Elbow's layout until its own lap is laid. */
export function buildMinimumBrainSize(): TrackDef {
  const base = buildElbow();
  return {
    ...base,
    id: 'minimum-brain-size',
    name: 'Minimum Brain Size',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'feed' })) },
    theme: 'echochamber',
    music: { lap: 'minimum-brain-size', finalLap: 'minimum-brain-size-final-lap' },
  };
}
