import { buildMuckraker } from './muckraker';
import type { TrackDef } from './track';

/** Rapid Alpha Decay (the Alien Metal Cup): a placeholder on Muckraker's layout until its own lap is laid. */
export function buildRapidAlphaDecay(): TrackDef {
  const base = buildMuckraker();
  return {
    ...base,
    id: 'rapid-alpha-decay',
    name: 'Rapid Alpha Decay',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'lead' })) },
    theme: 'reactor',
    music: { lap: 'rapid-alpha-decay', finalLap: 'rapid-alpha-decay-final-lap' },
  };
}
