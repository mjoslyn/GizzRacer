import { buildMuckraker } from './muckraker';
import type { TrackDef } from './track';

/** Kill for the Steel (the Alien Metal Cup): a placeholder on Muckraker's layout until its own lap is laid. */
export function buildKillForTheSteel(): TrackDef {
  const base = buildMuckraker();
  return {
    ...base,
    id: 'kill-for-the-steel',
    name: 'Kill for the Steel',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'ore' })) },
    theme: 'steelwar',
    music: { lap: 'kill-for-the-steel', finalLap: 'kill-for-the-steel-final-lap' },
  };
}
