import { Server, getServerByName } from 'partyserver';
import { boardName, checkRun, type RunSubmission } from '../src/net/runCheck';
import { json } from './players';

/** How many entries a leaderboard request returns. */
const TOP = 50;

interface RunRow {
  player_id: string;
  run_id: string;
  name: string;
  racer_id: string;
  total_ms: number;
  laps_ms: string;
  created_at: number;
}

/**
 * One Time Trial leaderboard (docs/MULTIPLAYER.md 5.3), named
 * `{track}.{engine}.v{physics}`. Keeps each player's best run and its
 * ghost.
 *
 *   GET  /parties/trials/{board}?player={id}   top runs, plus that player's rank
 *   GET  /parties/trials/{board}/ghost/{runId} the run's ghost (encodeGhost text)
 *   POST /parties/trials/{board}               { playerId, token, run }
 */
export class Trials extends Server<Env> {
  onStart(): void {
    this.sql`CREATE TABLE IF NOT EXISTS runs (player_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, name TEXT NOT NULL, racer_id TEXT NOT NULL, total_ms INTEGER NOT NULL, laps_ms TEXT NOT NULL, created_at INTEGER NOT NULL)`;
    this.sql`CREATE INDEX IF NOT EXISTS runs_by_time ON runs (total_ms)`;
    this.sql`CREATE TABLE IF NOT EXISTS ghosts (run_id TEXT PRIMARY KEY, data TEXT NOT NULL)`;
  }

  async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const ghost = url.pathname.match(/\/ghost\/([0-9a-f-]{36})$/i);
    if (req.method === 'GET' && ghost) {
      const [row] = this.sql<{ data: string }>`SELECT data FROM ghosts WHERE run_id = ${ghost[1]}`;
      return row ? new Response(row.data, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } }) : json({ error: 'no such ghost' }, 404);
    }
    if (req.method === 'GET') return json(this.board(url.searchParams.get('player')));
    if (req.method === 'POST') return this.submit(req);
    return json({ error: 'method' }, 405);
  }

  private board(player: string | null) {
    const top = this.sql<RunRow>`SELECT * FROM runs ORDER BY total_ms, created_at LIMIT ${TOP}`.map(publicRun);
    let me = null;
    if (player) {
      const [mine] = this.sql<RunRow>`SELECT * FROM runs WHERE player_id = ${player}`;
      if (mine) me = { ...publicRun(mine), rank: this.rank(mine) };
    }
    const [{ n }] = this.sql<{ n: number }>`SELECT COUNT(*) AS n FROM runs`;
    return { board: this.name, top, me, entries: n };
  }

  private rank(r: RunRow): number {
    const [{ ahead }] = this.sql<{ ahead: number }>`SELECT COUNT(*) AS ahead FROM runs WHERE total_ms < ${r.total_ms} OR (total_ms = ${r.total_ms} AND created_at < ${r.created_at})`;
    return ahead + 1;
  }

  private async submit(req: Request): Promise<Response> {
    const body = (await req.json().catch(() => null)) as { playerId?: string; token?: string; run?: RunSubmission } | null;
    const run = body?.run;
    if (!body || !run || typeof body.playerId !== 'string' || typeof body.token !== 'string') return json({ error: 'bad request' }, 400);
    if (boardName(run.trackId, run.engine, run.physicsVersion) !== this.name) return json({ error: 'wrong board' }, 400);
    const players = await getServerByName(this.env.Players, 'global');
    const name = await players.verify(body.playerId, body.token);
    if (!name) return json({ error: 'unknown player' }, 403);
    const problem = checkRun(run);
    if (problem) return json({ error: problem }, 422);

    const [old] = this.sql<RunRow>`SELECT * FROM runs WHERE player_id = ${body.playerId}`;
    if (old && old.total_ms <= run.totalMs) {
      // Not a personal best: keep the old run, but report where it stands.
      this.sql`UPDATE runs SET name = ${name} WHERE player_id = ${body.playerId}`;
      return json({ best: false, rank: this.rank(old) });
    }
    const runId = crypto.randomUUID();
    const now = Date.now();
    if (old) this.sql`DELETE FROM ghosts WHERE run_id = ${old.run_id}`;
    this.sql`INSERT OR REPLACE INTO runs (player_id, run_id, name, racer_id, total_ms, laps_ms, created_at) VALUES (${body.playerId}, ${runId}, ${name}, ${run.racerId}, ${run.totalMs}, ${JSON.stringify(run.lapsMs)}, ${now})`;
    this.sql`INSERT INTO ghosts (run_id, data) VALUES (${runId}, ${run.ghost})`;
    const [row] = this.sql<RunRow>`SELECT * FROM runs WHERE player_id = ${body.playerId}`;
    return json({ best: true, rank: this.rank(row), runId });
  }
}

function publicRun(r: RunRow) {
  return { runId: r.run_id, playerId: r.player_id, name: r.name, racerId: r.racer_id, totalMs: r.total_ms, lapsMs: JSON.parse(r.laps_ms) as number[] };
}
