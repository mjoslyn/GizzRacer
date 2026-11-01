import { buildMuckraker } from './muckraker';
import type { TrackDef } from './track';

/** The Wheel (the Gumboot Soup Cup): a placeholder on Muckraker's layout until its own lap is laid. */
export function buildTheWheel(): TrackDef {
  const base = buildMuckraker();
  return {
    ...base,
    id: 'the-wheel',
    name: 'The Wheel',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'groove' })) },
    theme: 'wheel',
    music: { lap: 'the-wheel', finalLap: 'the-wheel-final-lap' },
  };
}
