import { Server } from 'partyserver';
import { nameMessage, nameProblem } from '../src/net/nameFilter';

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Guest identities (docs/MULTIPLAYER.md section 3): a random player id and
 * secret token made by the client, stored here as a hash, with a display
 * name. One instance, named "global".
 */
export class Players extends Server<Env> {
  onStart(): void {
    this.sql`CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL)`;
  }

  /** POST { playerId, token, name }: claims an id on first use, renames after. */
  async onRequest(req: Request): Promise<Response> {
    if (req.method !== 'POST') return new Response('POST only', { status: 405 });
    const body = (await req.json().catch(() => null)) as { playerId?: unknown; token?: unknown; name?: unknown } | null;
    if (!body || !validId(body.playerId) || !validId(body.token)) return json({ error: 'bad identity' }, 400);
    const raw = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    const problem = nameProblem(raw);
    if (problem) return json({ error: nameMessage(problem) }, 400);
    const name = raw;
    const hash = await hashToken(body.token);
    const [row] = this.sql<{ token_hash: string }>`SELECT token_hash FROM players WHERE id = ${body.playerId}`;
    if (row && row.token_hash !== hash) return json({ error: 'not yours' }, 403);
    if (row) this.sql`UPDATE players SET name = ${name} WHERE id = ${body.playerId}`;
    else this.sql`INSERT INTO players (id, token_hash, name, created_at) VALUES (${body.playerId}, ${hash}, ${name}, ${Date.now()})`;
    return json({ name });
  }

  /** RPC for other parties: the player's name if the token matches, else null. */
  async verify(playerId: string, token: string): Promise<string | null> {
    if (!validId(playerId) || !validId(token)) return null;
    const [row] = this.sql<{ token_hash: string; name: string }>`SELECT token_hash, name FROM players WHERE id = ${playerId}`;
    if (!row || row.token_hash !== (await hashToken(token))) return null;
    // A name the filter has since learned to refuse has to be changed before playing online.
    return nameProblem(row.name) ? null : row.name;
  }
}

/** Ids and tokens are client-made UUIDs. */
function validId(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
