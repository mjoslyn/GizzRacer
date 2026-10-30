import { buildElbow } from './elbow';
import type { TrackDef } from './track';

/** Let Me Mend the Past (the Float Along – Fill Your Lungs Cup): a placeholder on Elbow's layout until its own lap is laid. */
export function buildMendThePast(): TrackDef {
  const base = buildElbow();
  return {
    ...base,
    id: 'mend-the-past',
    name: 'Let Me Mend the Past',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'florals' })) },
    theme: 'nan',
    music: { lap: 'mend-the-past', finalLap: 'mend-the-past-final-lap' },
  };
}
