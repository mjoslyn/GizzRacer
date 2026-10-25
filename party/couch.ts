import { Server, type Connection, type WSMessage } from 'partyserver';
import { cleanPadId, type CouchClientMsg, type CouchServerMsg, type PadState } from '../src/net/couchProtocol';
import { isRoomCode } from '../src/net/protocol';

/** What a connection is, once it has said hello. */
interface ConnState {
  role: 'tv' | 'pad';
  id: string;
}

/**
 * Party mode's phones (docs/MULTIPLAYER.md section 12), one instance per
 * code: passes each phone's buttons to the TV, and the TV's word on each
 * seat back to its phone. It keeps nothing: the TV holds the seats.
 */
export class Couch extends Server<Env> {
  static options = { hibernate: true };

  onMessage(conn: Connection<ConnState>, raw: WSMessage): void {
    let msg: CouchClientMsg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer)) as CouchClientMsg;
    } catch {
      return;
    }
    if (msg.t === 'hello') {
      if (!isRoomCode(this.name)) return conn.close(1008, 'Not a code');
      if (msg.role === 'tv') {
        conn.setState({ role: 'tv', id: '' });
        // Phones already here say hello again to the new TV.
        for (const c of this.pads()) send(c, { t: 'hastv' });
        return;
      }
      const id = cleanPadId(msg.id, 40);
      if (!id) return;
      conn.setState({ role: 'pad', id });
      send(conn, this.tvs().length ? { t: 'hastv' } : { t: 'notv' });
      return this.toTv({ t: 'pad', id, name: cleanPadId(msg.name, 16) });
    }
    const me = conn.state;
    if (!me) return;
    if (me.role === 'pad') {
      if (msg.t === 'in' && validState(msg.s)) this.toTv({ t: 'in', id: me.id, s: msg.s });
      else if (msg.t === 'act' && typeof msg.a === 'string') this.toTv({ t: 'act', id: me.id, a: msg.a });
      return;
    }
    if (msg.t === 'to') {
      for (const c of this.pads()) if (c.state?.id === msg.id) send(c, { t: 'tv', m: msg.m });
    }
  }

  onClose(conn: Connection<ConnState>): void {
    const me = conn.state;
    if (me?.role === 'pad') {
      // Still here from another tab: not gone.
      if (!this.pads().some((c) => c !== conn && c.state?.id === me.id)) this.toTv({ t: 'gone', id: me.id });
    } else if (me?.role === 'tv' && !this.tvs().some((c) => c !== conn)) {
      for (const c of this.pads()) send(c, { t: 'notv' });
    }
  }

  private tvs(): Connection<ConnState>[] {
    return [...this.getConnections<ConnState>()].filter((c) => c.state?.role === 'tv');
  }

  private pads(): Connection<ConnState>[] {
    return [...this.getConnections<ConnState>()].filter((c) => c.state?.role === 'pad');
  }

  private toTv(msg: CouchServerMsg): void {
    const text = JSON.stringify(msg);
    for (const c of this.tvs()) c.send(text);
  }
}

function send(conn: Connection, msg: CouchServerMsg): void {
  conn.send(JSON.stringify(msg));
}

function validState(s: unknown): s is PadState {
  return Array.isArray(s) && s.length === 4 && s.every((v) => typeof v === 'number' && Number.isFinite(v));
}
