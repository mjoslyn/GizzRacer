import { Server, getServerByName } from 'partyserver';
import { checkRecord, recordBoardName, type RecordSubmission } from '../src/net/recordCheck';
import { json } from './players';

/** How many entries a leaderboard request returns. */
const TOP = 50;

interface RecordRow {
  player_id: string;
  name: string;
  racer_id: string;
  points: number;
  time_ms: number;
  detail: string;
  created_at: number;
}

/**
 * One records leaderboard (src/net/recordCheck.ts): a track's fastest full
 * races, or a cup's best results, per class and physics version. Keeps each
 * player's best. A race board ranks by time; a cup board by points, then
 * time.
 *
 *   GET  /parties/records/{board}?player={id}   top entries, plus that player's rank
 *   POST /parties/records/{board}               { playerId, token, record }
 */
export class Records extends Server<Env> {
  onStart(): void {
    this.sql`CREATE TABLE IF NOT EXISTS records (player_id TEXT PRIMARY KEY, name TEXT NOT NULL, racer_id TEXT NOT NULL, points INTEGER NOT NULL, time_ms INTEGER NOT NULL, detail TEXT NOT NULL, created_at INTEGER NOT NULL)`;
    this.sql`CREATE INDEX IF NOT EXISTS records_by_rank ON records (points DESC, time_ms)`;
  }

  private get kind(): 'race' | 'cup' {
    return this.name.startsWith('cup.') ? 'cup' : 'race';
  }

  async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'GET') return json(this.board(url.searchParams.get('player')));
    if (req.method === 'POST') return this.submit(req);
    return json({ error: 'method' }, 405);
  }

  private board(player: string | null) {
    const top = this.sql<RecordRow>`SELECT * FROM records ORDER BY points DESC, time_ms, created_at LIMIT ${TOP}`.map(publicRecord);
    let me = null;
    if (player) {
      const [mine] = this.sql<RecordRow>`SELECT * FROM records WHERE player_id = ${player}`;
      if (mine) me = { ...publicRecord(mine), rank: this.rank(mine) };
    }
    const [{ n }] = this.sql<{ n: number }>`SELECT COUNT(*) AS n FROM records`;
    return { board: this.name, kind: this.kind, top, me, entries: n };
  }

  private rank(r: RecordRow): number {
    const [{ ahead }] = this.sql<{ ahead: number }>`SELECT COUNT(*) AS ahead FROM records WHERE points > ${r.points} OR (points = ${r.points} AND (time_ms < ${r.time_ms} OR (time_ms = ${r.time_ms} AND created_at < ${r.created_at})))`;
    return ahead + 1;
  }

  /** Whether a new result beats the one on the board. */
  private beats(sub: RecordSubmission, old: RecordRow): boolean {
    const points = sub.kind === 'cup' ? sub.points : 0;
    return points > old.points || (points === old.points && sub.totalMs < old.time_ms);
  }

  private async submit(req: Request): Promise<Response> {
    const body = (await req.json().catch(() => null)) as { playerId?: string; token?: string; record?: RecordSubmission } | null;
    const record = body?.record;
    if (!body || !record || typeof body.playerId !== 'string' || typeof body.token !== 'string') return json({ error: 'bad request' }, 400);
    if (recordBoardName(record, record.physicsVersion) !== this.name) return json({ error: 'wrong board' }, 400);
    const players = await getServerByName(this.env.Players, 'global');
    const name = await players.verify(body.playerId, body.token);
    if (!name) return json({ error: 'unknown player' }, 403);
    const problem = checkRecord(record);
    if (problem) return json({ error: problem }, 422);

    const [old] = this.sql<RecordRow>`SELECT * FROM records WHERE player_id = ${body.playerId}`;
    if (old && !this.beats(record, old)) {
      this.sql`UPDATE records SET name = ${name} WHERE player_id = ${body.playerId}`;
      return json({ best: false, rank: this.rank(old) });
    }
    const points = record.kind === 'cup' ? record.points : 0;
    const detail = JSON.stringify(record.kind === 'cup' ? record.places : Math.round(record.style));
    this.sql`INSERT OR REPLACE INTO records (player_id, name, racer_id, points, time_ms, detail, created_at) VALUES (${body.playerId}, ${name}, ${record.racerId}, ${points}, ${Math.round(record.totalMs)}, ${detail}, ${Date.now()})`;
    const [row] = this.sql<RecordRow>`SELECT * FROM records WHERE player_id = ${body.playerId}`;
    return json({ best: true, rank: this.rank(row) });
  }
}

function publicRecord(r: RecordRow) {
  return { playerId: r.player_id, name: r.name, racerId: r.racer_id, points: r.points, timeMs: r.time_ms, detail: JSON.parse(r.detail) as number | number[] };
}
