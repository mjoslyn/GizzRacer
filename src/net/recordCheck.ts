import { GP_POINTS } from '../core/grandPrix';
import { BOOST_SPEED_MUL, PHYSICS_VERSION } from '../physics/kart';
import { ENGINE_CLASSES, RACERS, kartParams, type EngineClass } from '../physics/racers';
import { generateTrack, GEN_LENGTHS, GEN_THEMES, type GenLength, type GenParams, type GenTheme } from '../tracks/generator';
import { CUPS, RANDOM_CUP_ID, TRACK_LIST } from '../tracks/index';
import { Track } from '../tracks/track';
import { recordId } from './runCheck';

/**
 * Records beyond Time Trial: a full race's time on a track, and a cup's
 * result. One board each per track (or cup), class, mirror and physics
 * version, kept by the `records` party (party/records.ts). The checks here
 * are the cheap kind the Time Trial boards get: the shape, the physics
 * version, and a floor nobody can beat.
 */
export interface RaceRecordSubmission {
  kind: 'race';
  trackId: string;
  engine: EngineClass;
  mirror: boolean;
  racerId: string;
  physicsVersion: number;
  lapsMs: number[];
  totalMs: number;
  /** The race's style score (core/style.ts), for the board's fun column. */
  style: number;
}

export interface CupRecordSubmission {
  kind: 'cup';
  cupId: string;
  engine: EngineClass;
  mirror: boolean;
  racerId: string;
  physicsVersion: number;
  points: number;
  /** The player's four races added up (ms). */
  totalMs: number;
  /** Finishing place in each race, 1-based. */
  places: number[];
}

export type RecordSubmission = RaceRecordSubmission | CupRecordSubmission;

/** A lap can't beat this fraction of (track length at boost speed with the fastest kart). */
const FLOOR_MARGIN = 0.8;
/** Max field size a cup place can be. */
const MAX_PLACE = 12;

/** Board name: `race.{track}.{class}.v{physics}` or `cup.{cup}.{class}.v{physics}`, with `.mirror` after the track for Mirror. */
export function recordBoardName(sub: RecordSubmission, version = PHYSICS_VERSION): string {
  const id = sub.kind === 'race' ? recordId(sub.trackId) : sub.cupId;
  return `${sub.kind}.${id}${sub.mirror ? '.mirror' : ''}.${sub.engine}.v${version}`;
}

/** A generated track's dials from its id (`trackId` in tracks/generator.ts), or null if it isn't one. */
export function parseGenId(id: string): GenParams | null {
  const m = /^gen-([a-z]+)-(\d)-(short|medium|long)-(\d+)$/.exec(id);
  if (!m) return null;
  const theme = m[1] as GenTheme;
  if (!GEN_THEMES.includes(theme) || !GEN_LENGTHS.includes(m[3] as GenLength)) return null;
  return { theme, complexity: Number(m[2]), length: m[3] as GenLength, seed: Number(m[4]) };
}

const tracks = new Map<string, Track | null>();
/** A track by id: one of the list, or a generated one rebuilt from its id. */
export function recordTrack(id: string): Track | null {
  if (tracks.has(id)) return tracks.get(id)!;
  const entry = TRACK_LIST.find((t) => t.id === id);
  const gen = entry ? null : parseGenId(id);
  let track: Track | null = null;
  if (entry) track = new Track(entry.build());
  else if (gen && gen.complexity >= 1 && gen.complexity <= 5) track = new Track(generateTrack(gen));
  tracks.set(id, track);
  return track;
}

/** The fastest a lap of this track can be in this class (ms): the fastest kart on permanent boost, with a margin. */
function lapFloorMs(track: Track, engine: EngineClass): number {
  const fastest = Math.max(...RACERS.map((r) => kartParams(r.stats, engine).topSpeed)) * BOOST_SPEED_MUL;
  return ((FLOOR_MARGIN * track.length) / fastest) * 1000;
}

const isMs = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Why a record is refused, or null if it looks legitimate. */
export function checkRecord(sub: RecordSubmission): string | null {
  if (sub.physicsVersion !== PHYSICS_VERSION) return 'old physics version';
  if (!ENGINE_CLASSES.includes(sub.engine)) return 'unknown class';
  if (!RACERS.some((r) => r.id === sub.racerId)) return 'unknown racer';
  if (typeof sub.mirror !== 'boolean') return 'bad mirror flag';
  if (sub.kind === 'race') {
    const track = recordTrack(sub.trackId);
    if (!track) return 'unknown track';
    const laps = track.def.laps;
    if (!Array.isArray(sub.lapsMs) || sub.lapsMs.length !== laps || !sub.lapsMs.every(isMs)) return 'bad laps';
    const sum = sub.lapsMs.reduce((a, b) => a + b, 0);
    if (!isMs(sub.totalMs) || Math.abs(sum - sub.totalMs) > 5 * laps) return 'laps do not add up';
    const floor = lapFloorMs(track, sub.engine);
    if (sub.lapsMs.some((l) => l < floor)) return 'lap too fast';
    if (typeof sub.style !== 'number' || !Number.isFinite(sub.style) || sub.style < 0 || sub.style > 1e6) return 'bad style score';
    return null;
  }
  if (sub.kind !== 'cup') return 'unknown record kind';
  const cup = CUPS.find((c) => c.id === sub.cupId);
  if (!cup && sub.cupId !== RANDOM_CUP_ID) return 'unknown cup';
  const n = cup ? cup.tracks.length : 4;
  if (!Array.isArray(sub.places) || sub.places.length !== n || !sub.places.every((p) => Number.isInteger(p) && p >= 1 && p <= MAX_PLACE)) return 'bad places';
  const points = sub.places.reduce((a, p) => a + (GP_POINTS[p - 1] ?? 0), 0);
  if (sub.points !== points) return 'points do not add up';
  if (!isMs(sub.totalMs)) return 'bad time';
  if (cup) {
    const floor = cup.tracks.reduce((a, i) => {
      const t = recordTrack(TRACK_LIST[i].id)!;
      return a + lapFloorMs(t, sub.engine) * t.def.laps;
    }, 0);
    if (sub.totalMs < floor) return 'cup too fast';
  }
  return null;
}
