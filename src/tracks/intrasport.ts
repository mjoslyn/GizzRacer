import { buildElbow } from './elbow';
import type { TrackDef } from './track';

/** Intrasport (the K.G. Cup): a placeholder on Elbow's layout until its own lap is laid. */
export function buildIntrasport(): TrackDef {
  const base = buildElbow();
  return { ...base, id: 'intrasport', name: 'Intrasport', music: { lap: 'intrasport', finalLap: 'intrasport-final-lap' } };
}
