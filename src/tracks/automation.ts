import { buildElbow } from './elbow';
import type { TrackDef } from './track';

/** Automation (the K.G. Cup): a placeholder on Elbow's layout until its own lap is laid. */
export function buildAutomation(): TrackDef {
  const base = buildElbow();
  return { ...base, id: 'automation', name: 'Automation', music: { lap: 'automation', finalLap: 'automation-final-lap' } };
}
