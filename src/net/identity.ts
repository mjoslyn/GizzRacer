import { nameMessage, nameProblem } from './nameFilter';

/**
 * Guest identity (docs/MULTIPLAYER.md section 3): a random player id and
 * secret token kept in this browser, plus a display name once chosen.
 */
export interface Identity {
  playerId: string;
  token: string;
  name: string | null;
}

const KEY = 'gizzracer.identity';

export function identity(): Identity {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Identity | null;
    if (saved?.playerId && saved.token) return saved;
  } catch {
    // Fall through to a fresh identity.
  }
  const fresh: Identity = { playerId: crypto.randomUUID(), token: crypto.randomUUID(), name: null };
  store(fresh);
  return fresh;
}

function store(id: Identity): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(id));
  } catch {
    // Storage blocked: the identity lasts for this page only.
  }
}

/** Claims or renames this browser's identity on the server. Returns the cleaned name, or throws with the reason. */
export async function setName(name: string): Promise<string> {
  const id = identity();
  const problem = nameProblem(name.trim().replace(/\s+/g, ' '));
  if (problem) throw new Error(nameMessage(problem));
  const res = await fetch(`${PARTY_BASE}/players/global`, { method: 'POST', body: JSON.stringify({ playerId: id.playerId, token: id.token, name }) });
  const body = (await res.json().catch(() => ({}))) as { name?: string; error?: string };
  if (!res.ok || !body.name) throw new Error(body.error ?? `server said ${res.status}`);
  store({ ...id, name: body.name });
  return body.name;
}

/** The PartyKit routes live on the same origin as the game (vite proxies them in dev). */
export const PARTY_BASE = '/parties';
