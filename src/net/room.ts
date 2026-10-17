import PartySocket from 'partysocket';
import { identity } from './identity';
import type { ClientMsg, RoomStart, RoomState, ServerMsg } from './protocol';

const PING_EVERY = 2000;

/**
 * One connection to a room party (docs/MULTIPLAYER.md section 6): says
 * hello on every (re)connect, keeps the lobby state, and estimates the
 * server clock from ping round trips.
 */
export class RoomClient {
  state: RoomState | null = null;
  /** Server clock minus ours, ms, from the best (lowest) round trip so far. */
  offset = 0;
  rtt = 0;
  onState: (s: RoomState) => void = () => {};
  onError: (message: string, fatal: boolean) => void = () => {};
  /** Fires once per race the room starts. */
  onStart: (start: RoomStart) => void = () => {};
  private readonly socket: PartySocket;
  private bestRtt = Infinity;
  private lastRace = 0;
  private timer = 0;
  private closed = false;

  constructor(
    readonly code: string,
    private create: boolean,
    private racerId: string,
  ) {
    this.socket = new PartySocket({ host: location.host, party: 'room', room: code });
    this.socket.addEventListener('open', () => this.hello());
    this.socket.addEventListener('message', (e: MessageEvent) => this.receive(e.data as string));
    this.timer = window.setInterval(() => this.ping(), PING_EVERY);
  }

  /** The room's clock, for starting races together. */
  serverNow(): number {
    return Date.now() + this.offset;
  }

  send(msg: ClientMsg): void {
    if (msg.t === 'racer') this.racerId = msg.racerId;
    this.socket.send(JSON.stringify(msg));
  }

  close(): void {
    this.closed = true;
    clearInterval(this.timer);
    this.socket.close();
  }

  private hello(): void {
    const id = identity();
    this.send({ t: 'hello', playerId: id.playerId, token: id.token, create: this.create, racerId: this.racerId });
    this.ping();
  }

  private ping(): void {
    if (this.socket.readyState === WebSocket.OPEN) this.send({ t: 'ping', at: Date.now(), rtt: this.rtt });
  }

  private receive(data: string): void {
    let msg: ServerMsg;
    try {
      msg = JSON.parse(data) as ServerMsg;
    } catch {
      return;
    }
    if (msg.t === 'pong') {
      const now = Date.now();
      this.rtt = now - msg.at;
      // The round trip with the least delay gives the truest offset.
      if (this.rtt <= this.bestRtt) {
        this.bestRtt = this.rtt;
        this.offset = msg.server - (msg.at + this.rtt / 2);
      }
    } else if (msg.t === 'error') {
      if (msg.fatal) this.close();
      this.onError(msg.error, msg.fatal);
    } else if (msg.t === 'state') {
      // Once in, reconnects rejoin rather than create.
      this.create = false;
      this.state = msg.state;
      this.onState(msg.state);
      const start = msg.state.start;
      if (start && msg.state.phase === 'racing' && start.race !== this.lastRace && !this.closed) {
        this.lastRace = start.race;
        // Don't jump into a race that started long ago (e.g. on rejoin).
        if (this.serverNow() < start.at + 2000) this.onStart(start);
      }
    }
  }
}
