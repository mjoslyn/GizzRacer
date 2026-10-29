import { decodeGhost, GHOST_HZ } from '../core/ghost';
import { BOOST_SPEED_MUL, PHYSICS_VERSION } from '../physics/kart';
import { ENGINE_CLASSES, RACERS, kartParams, type EngineClass } from '../physics/racers';
import { TRACK_LIST } from '../tracks/index';
import { LapTracker } from '../tracks/laps';
import { Track } from '../tracks/track';

/** A Time Trial run as uploaded: summary plus the ghost (encodeGhost text). */
export interface RunSubmission {
  trackId: string;
  engine: EngineClass;
  racerId: string;
  physicsVersion: number;
  totalMs: number;
  lapsMs: number[];
  ghost: string;
}

/** A Time Trial run is a single lap from a standing start. */
export const TRIAL_LAPS = 1;

/**
 * Tracks reworked since their boards opened, and how many times: each
 * rework opens fresh boards and records for that track alone, so times set
 * on the old layout don't stand against the new one (a physics version
 * bump does the same for every track at once).
 */
export const TRACK_REVISIONS: Record<string, number> = {
  // Relaid out so no two tracks share a shape (1), and all but Planet B and Hell then as tangled laps in tiers (2).
  'robot-stop': 2,
  'people-vultures': 2,
  'wah-wah': 2,
  'kepler-22b': 2,
  'predator-x': 2,
  'inner-cell': 2,
  'planet-b': 1,
  'mars-for-the-rich': 2,
  'perihelion': 2,
  'hell': 1,
  // Relaid as tangled laps in tiers, crossing over and under themselves.
  'sea-of-trees': 1,
  'im-in-your-mind-fuzz': 1,
  'fishies-lagoon': 1,
  'cyboogie-city': 1,
  'tetrachromacy': 1,
  'magenta-mountain': 1,
  'ice-v-glacier': 1,
  'polygondwanaland-jungle': 1,
  'murder-of-the-universe': 1,
  'supercell': 1,
  'petrodragonic-apocalypse': 1,
  'hell-on-mars': 1,
  'phantom-island': 1,
  'deadstick-drop': 1,
  'panpsych-grove': 1,
  'sea-of-doubt': 1,
  'crumbling-castle': 1,
  'volcano-fortress': 1,
};

/** A track's id for its records: with its revision, once it has one. */
export function recordId(trackId: string): string {
  const rev = TRACK_REVISIONS[trackId];
  return rev ? `${trackId}.r${rev}` : trackId;
}

/** Leaderboard name: one board per track (and revision), class and physics version. */
export function boardName(trackId: string, engine: EngineClass, version = PHYSICS_VERSION): string {
  return `${recordId(trackId)}.${engine}.v${version}`;
}

/** Times a ghost may jump further than physics allows (falls put you back at a checkpoint). */
const MAX_JUMPS = 8;
/** A lap can't beat this fraction of (track length at boost speed with the fastest kart). */
const FLOOR_MARGIN = 0.8;

const tracks = new Map<string, Track>();
function trackById(id: string): Track | null {
  const entry = TRACK_LIST.find((t) => t.id === id);
  if (!entry) return null;
  let t = tracks.get(id);
  if (!t) tracks.set(id, (t = new Track(entry.build())));
  return t;
}

/**
 * Cheap plausibility checks on an uploaded run (docs/MULTIPLAYER.md 5.4).
 * Returns why it was rejected, or null if it looks legitimate.
 */
export function checkRun(run: RunSubmission): string | null {
  if (run.physicsVersion !== PHYSICS_VERSION) return 'old physics version';
  if (!ENGINE_CLASSES.includes(run.engine)) return 'unknown class';
  if (!RACERS.some((r) => r.id === run.racerId)) return 'unknown racer';
  const track = trackById(run.trackId);
  if (!track) return 'unknown track';
  const laps = TRIAL_LAPS;
  if (!Array.isArray(run.lapsMs) || run.lapsMs.length !== laps || run.lapsMs.some((l) => !Number.isFinite(l) || l <= 0)) return 'bad laps';
  const sum = run.lapsMs.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - run.totalMs) > 5 * laps) return 'laps do not add up';

  // Nobody laps faster than the fastest kart on permanent boost.
  const fastest = Math.max(...RACERS.map((r) => kartParams(r.stats, run.engine).topSpeed)) * BOOST_SPEED_MUL;
  const floorMs = ((FLOOR_MARGIN * track.length) / fastest) * 1000;
  if (run.lapsMs.some((l) => l < floorMs)) return 'lap too fast';

  const ghost = decodeGhost(run.ghost);
  if (!ghost || ghost.racerId !== run.racerId) return 'bad ghost';
  const n = ghost.samples.length / 6;
  if (Math.abs(n / GHOST_HZ - run.totalMs / 1000) > 1.5) return 'ghost length does not match time';

  // Replay the path: every checkpoint in order on every lap, at believable speeds.
  const tracker = new LapTracker(track.length, track.def.checkpoints);
  const step = (fastest * 1.25) / GHOST_HZ + 1;
  let hint = -1;
  let jumps = 0;
  const d = ghost.samples;
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    if (i > 0 && Math.hypot(d[o] - d[o - 6], d[o + 2] - d[o - 4]) > step) jumps++;
    const loc = track.locate(d[o], d[o + 2], d[o + 1], hint);
    hint = loc.hint;
    tracker.update(loc.progress);
  }
  if (jumps > MAX_JUMPS) return 'ghost moves too fast';
  if (tracker.lap < laps) return 'ghost does not finish';
  return null;
}
