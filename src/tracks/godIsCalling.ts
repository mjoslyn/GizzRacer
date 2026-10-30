import { buildMuckraker } from './muckraker';
import type { TrackDef } from './track';

/** God Is Calling Me Back Home (the Float Along – Fill Your Lungs Cup): a placeholder on Muckraker's layout until its own lap is laid. */
export function buildGodIsCalling(): TrackDef {
  const base = buildMuckraker();
  return {
    ...base,
    id: 'god-is-calling',
    name: 'God Is Calling Me Back Home',
    main: { ...base.main, sections: base.main.sections.map((s) => ({ ...s, surface: 'bitumen' })) },
    theme: 'godcall',
    music: { lap: 'god-is-calling', finalLap: 'god-is-calling-final-lap' },
  };
}
