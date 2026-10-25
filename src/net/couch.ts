import PartySocket from 'partysocket';
import type { CouchClientMsg, CouchServerMsg, PadAction, PadRow, PadState, TvToPad } from './couchProtocol';

/**
 * The TV's end of Party mode's phones (docs/MULTIPLAYER.md section 12):
 * one connection to the `couch` party under a code of its own, hearing
 * each phone's hello, buttons and leaving, and answering each one.
 */
export class CouchHost {
  onPad: (id: string, name: string) => void = () => {};
  onInput: (id: string, s: PadState) => void = () => {};
  onAction: (id: string, a: PadAction, row?: PadRow) => void = () => {};
  onGone: (id: string) => void = () => {};
  private readonly socket: PartySocket;

  constructor(readonly code: string) {
    this.socket = new PartySocket({ host: location.host, party: 'couch', room: code });
    this.socket.addEventListener('open', () => this.send({ t: 'hello', role: 'tv' }));
    this.socket.addEventListener('message', (e: MessageEvent) => this.receive(e.data as string));
  }

  /** The address a phone opens to join: the pad page with this code in it. */
  get link(): string {
    return `${location.origin}${location.pathname.replace(/[^/]*$/, '')}pad.html?c=${this.code}`;
  }

  close(): void {
    this.socket.close();
  }

  tell(id: string, m: TvToPad): void {
    this.send({ t: 'to', id, m });
  }

  private send(msg: CouchClientMsg): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
  }

  private receive(data: string): void {
    let msg: CouchServerMsg;
    try {
      msg = JSON.parse(data) as CouchServerMsg;
    } catch {
      return;
    }
    if (msg.t === 'pad') this.onPad(msg.id, msg.name);
    else if (msg.t === 'in') this.onInput(msg.id, msg.s);
    else if (msg.t === 'act') this.onAction(msg.id, msg.a, msg.row);
    else if (msg.t === 'gone') this.onGone(msg.id);
  }
}
