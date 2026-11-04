import { buildMuckraker } from './muckraker';
import type { TrackDef } from './track';

/** Billabong Valley (the All Stars Cup #2): a placeholder on Muckraker's layout until its own lap is laid. */
export function buildBillabongValley(): TrackDef {
  const base = buildMuckraker();
  return {
    ...base,
    id: 'billabong-valley',
    name: 'Billabong Valley',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'redgum' })) },
    theme: 'bushranger',
    music: { lap: 'billabong-valley', finalLap: 'billabong-valley-final-lap' },
  };
}
