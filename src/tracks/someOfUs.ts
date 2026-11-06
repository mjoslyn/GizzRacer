import { buildElbow } from './elbow';
import type { TrackDef } from './track';

/** Some of Us (the K.G. Cup): a placeholder on Elbow's layout until its own lap is laid. */
export function buildSomeOfUs(): TrackDef {
  const base = buildElbow();
  return { ...base, id: 'some-of-us', name: 'Some of Us', music: { lap: 'some-of-us', finalLap: 'some-of-us-final-lap' } };
}
