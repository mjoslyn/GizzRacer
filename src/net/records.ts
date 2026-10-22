import { PHYSICS_VERSION } from '../physics/kart';
import type { EngineClass } from '../physics/racers';
import { PARTY_BASE, identity } from './identity';
import { recordBoardName, type CupRecordSubmission, type RaceRecordSubmission, type RecordSubmission } from './recordCheck';

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
  kind: 'race' | 'cup';
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

export async function fetchRecords(board: string): Promise<RecordBoard> {
  const res = await fetch(`${boardUrl(board)}?player=${identity().playerId}`);
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return (await res.json()) as RecordBoard;
}

/** Posts a finished race or cup. The server keeps it only if it's this player's best on that board. */
export async function postRecord(sub: Omit<RaceRecordSubmission, 'physicsVersion'> | Omit<CupRecordSubmission, 'physicsVersion'>): Promise<RecordResult> {
  const id = identity();
  const record = { ...sub, physicsVersion: PHYSICS_VERSION } as RecordSubmission;
  const res = await fetch(boardUrl(recordBoardName(record)), { method: 'POST', body: JSON.stringify({ playerId: id.playerId, token: id.token, record }) });
  const body = (await res.json().catch(() => ({}))) as RecordResult & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `upload ${res.status}`);
  return body;
}
