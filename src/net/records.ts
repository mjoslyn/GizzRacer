import { PHYSICS_VERSION } from '../physics/kart';
import type { EngineClass } from '../physics/racers';
import { PARTY_BASE, identity } from './identity';
import { cupTimeBoardName, recordBoardName, type CupRecordSubmission, type RaceRecordSubmission, type RecordSubmission } from './recordCheck';

export interface RecordEntry {
  playerId: string;
  name: string;
  racerId: string;
  /** A cup's points; 0 on a race board. */
  points: number;
  /** The race's time, or the cup's four races added up (ms). */
  timeMs: number;
  /** A race's style score; a cup's places. */
  detail: number | number[];
}

export interface RecordBoard {
  board: string;
  kind: 'race' | 'cup' | 'cuptime';
  top: RecordEntry[];
  me: (RecordEntry & { rank: number }) | null;
  entries: number;
}

export interface RecordResult {
  best: boolean;
  rank: number;
}

const boardUrl = (name: string) => `${PARTY_BASE}/records/${name}`;

/** The board a race on this track and class posts to. */
export function raceBoard(trackId: string, engine: EngineClass, mirror: boolean): string {
  return recordBoardName({ kind: 'race', trackId, engine, mirror } as RaceRecordSubmission);
}

/** The board a cup at this class posts to. */
export function cupBoard(cupId: string, engine: EngineClass, mirror: boolean): string {
  return recordBoardName({ kind: 'cup', cupId, engine, mirror } as CupRecordSubmission);
}

/** The board of a cup's fastest runs at this class; null for the Random Cup, whose tracks change. */
export function cupTimeBoard(cupId: string, engine: EngineClass, mirror: boolean): string | null {
  return cupTimeBoardName({ kind: 'cup', cupId, engine, mirror } as CupRecordSubmission);
}

export async function fetchRecords(board: string): Promise<RecordBoard> {
  const res = await fetch(`${boardUrl(board)}?player=${identity().playerId}`);
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return (await res.json()) as RecordBoard;
}

/**
 * Posts a finished race or cup. The server keeps it only if it's this
 * player's best on that board. `fastest` posts a cup to its fastest-time
 * board instead of its points board.
 */
export async function postRecord(sub: Omit<RaceRecordSubmission, 'physicsVersion'> | Omit<CupRecordSubmission, 'physicsVersion'>, fastest = false): Promise<RecordResult> {
  const id = identity();
  const record = { ...sub, physicsVersion: PHYSICS_VERSION } as RecordSubmission;
  const board = fastest && record.kind === 'cup' ? cupTimeBoardName(record) : recordBoardName(record);
  if (!board) throw new Error('no fastest board for this cup');
  const res = await fetch(boardUrl(board), { method: 'POST', body: JSON.stringify({ playerId: id.playerId, token: id.token, record }) });
  const body = (await res.json().catch(() => ({}))) as RecordResult & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `upload ${res.status}`);
  return body;
}
