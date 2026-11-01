import { buildMuckraker } from './muckraker';
import type { TrackDef } from './track';

/** The Great Chain of Being (the Gumboot Soup Cup): a placeholder on Muckraker's layout until its own lap is laid. */
export function buildGreatChainOfBeing(): TrackDef {
  const base = buildMuckraker();
  return {
    ...base,
    id: 'great-chain-of-being',
    name: 'The Great Chain of Being',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'strata' })) },
    theme: 'scala',
    music: { lap: 'great-chain-of-being', finalLap: 'great-chain-of-being-final-lap' },
  };
}
