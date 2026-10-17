import { decodeGhost, encodeGhost, type GhostRun } from '../core/ghost';
import { PHYSICS_VERSION } from '../physics/kart';
import type { EngineClass } from '../physics/racers';
import { PARTY_BASE, identity } from './identity';
import { boardName, type RunSubmission } from './runCheck';

export interface BoardEntry {
  runId: string;
  playerId: string;
  name: string;
  racerId: string;
  totalMs: number;
  lapsMs: number[];
}

export interface Board {
  board: string;
  top: BoardEntry[];
  me: (BoardEntry & { rank: number }) | null;
  entries: number;
}

export interface UploadResult {
  best: boolean;
  rank: number;
}

const boardUrl = (trackId: string, engine: EngineClass) => `${PARTY_BASE}/trials/${boardName(trackId, engine)}`;

export async function fetchBoard(trackId: string, engine: EngineClass): Promise<Board> {
  const res = await fetch(`${boardUrl(trackId, engine)}?player=${identity().playerId}`);
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return (await res.json()) as Board;
}

export async function fetchGhost(trackId: string, engine: EngineClass, runId: string): Promise<GhostRun> {
  const res = await fetch(`${boardUrl(trackId, engine)}/ghost/${runId}`);
  const run = res.ok ? decodeGhost(await res.text()) : null;
  if (!run) throw new Error('ghost unavailable');
  return run;
}

/** Posts a finished Time Trial. The server keeps it only if it's this player's best. */
export async function uploadRun(trackId: string, engine: EngineClass, lapTimes: number[], ghost: GhostRun): Promise<UploadResult> {
  const id = identity();
  const lapsMs = lapTimes.map((l) => Math.round(l * 1000));
  const run: RunSubmission = {
    trackId,
    engine,
    racerId: ghost.racerId,
    physicsVersion: PHYSICS_VERSION,
    lapsMs,
    totalMs: lapsMs.reduce((a, b) => a + b, 0),
    ghost: encodeGhost(ghost),
  };
  const res = await fetch(boardUrl(trackId, engine), { method: 'POST', body: JSON.stringify({ playerId: id.playerId, token: id.token, run }) });
  const body = (await res.json().catch(() => ({}))) as UploadResult & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `upload ${res.status}`);
  return body;
}
