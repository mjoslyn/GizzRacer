import { Server, getServerByName, type Connection, type WSMessage } from 'partyserver';
import { seededRandom } from '../src/core/math';
import { ROOM_MAX, isRoomCode, type ClientMsg, type GridSlot, type RoomMember, type RoomSettings, type RoomStart, type RoomState, type ServerMsg } from '../src/net/protocol';
import { RoomRace } from '../src/net/roomRace';
import { ENGINE_CLASSES, FIELD_SIZE, RACERS, pickRivals } from '../src/physics/racers';
import { TRACK_LIST } from '../src/tracks/index';

/** Countdown to GO after the host presses start, in ms: time for every client to load the track. */
const START_DELAY = 6000;
/** An empty room is forgotten after this long. */
const EMPTY_TTL = 10 * 60 * 1000;
const STEP = 1 / 60;
/** Snapshot every this many steps: 15 a second. */
const SNAP_EVERY = 4;

interface Member {
  name: string;
  racerId: string;
  ready: boolean;
  joined: number;
  ping: number;
}

/** Everything the room keeps; saved on every change so it survives hibernation. */
interface Saved {
  hostId: string;
  settings: RoomSettings;
  phase: RoomState['phase'];
  start: RoomStart | null;
  pause: { playerId: string; name: string; at: number } | null;
  results: RoomState['results'];
  members: Record<string, Member>;
  races: number;
}

/** What a connection is, once it has said hello. */
interface ConnState {
  playerId: string;
}

/**
 * A room (docs/MULTIPLAYER.md section 6), named by its 4-letter code: the
 * lobby (members, racers, ready, host settings) and the start of each race.
 */
export class Room extends Server<Env> {
  static options = { hibernate: true };
  private saved: Saved | null = null;
  /** The race being run, while racing (kept in memory only: the loop keeps the room awake). */
  private race: RoomRace | null = null;
  private loop: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private acc = 0;
  private steps = 0;

  async onStart(): Promise<void> {
    this.saved = (await this.ctx.storage.get<Saved>('room')) ?? null;
    const room = this.saved;
    // The race lives in memory only: after a restart (a deploy, say) it's gone, so the room is back in its lobby.
    if (room?.phase === 'racing') {
      room.phase = 'lobby';
      room.pause = null;
      for (const m of Object.values(room.members)) m.ready = false;
      await this.ctx.storage.put('room', room);
    }
  }

  async onMessage(conn: Connection<ConnState>, raw: WSMessage): Promise<void> {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer)) as ClientMsg;
    } catch {
      return;
    }
    if (msg.t === 'hello') return this.hello(conn, msg);
    const room = this.saved;
    const me = conn.state?.playerId;
    if (!room || !me || !room.members[me]) return;
    const member = room.members[me];
    switch (msg.t) {
      case 'kart':
        this.race?.report(me, msg.s);
        return;
      case 'item':
        this.race?.useItem(me);
        return;
      case 'quit':
        this.race?.drop(me);
        return;
      case 'ping':
        send(conn, { t: 'pong', at: msg.at, server: Date.now() });
        if (Number.isFinite(msg.rtt) && Math.abs(member.ping - msg.rtt) > 15) {
          member.ping = Math.round(msg.rtt);
          await this.changed();
        }
        return;
      case 'racer':
        if (!RACERS.some((r) => r.id === msg.racerId)) return;
        if (Object.entries(room.members).some(([id, m]) => id !== me && m.racerId === msg.racerId)) return send(conn, err('Someone already picked that racer'));
        member.racerId = msg.racerId;
        member.ready = false;
        break;
      case 'ready':
        member.ready = !!msg.ready;
        break;
      case 'settings': {
        if (me !== room.hostId) return;
        const s = msg.settings;
        if (s.track !== undefined && Number.isInteger(s.track) && s.track >= 0 && s.track < TRACK_LIST.length) room.settings.track = s.track;
        if (s.engine !== undefined && ENGINE_CLASSES.includes(s.engine)) room.settings.engine = s.engine;
        for (const m of Object.values(room.members)) m.ready = false;
        break;
      }
      case 'start': {
        if (me !== room.hostId || room.phase !== 'lobby') return;
        const waiting = Object.entries(room.members).filter(([id, m]) => id !== room.hostId && !m.ready);
        if (waiting.length) return send(conn, err(`Waiting for ${waiting.map(([, m]) => m.name).join(', ')}`));
        room.races++;
        room.phase = 'racing';
        room.start = { race: room.races, at: Date.now() + START_DELAY, seed: Math.floor(Math.random() * 1e9), grid: grid(room), settings: { ...room.settings } };
        room.results = null;
        this.beginRace(room.start);
        break;
      }
      case 'pause':
        if (room.phase !== 'racing') return;
        if (msg.paused && !room.pause) room.pause = { playerId: me, name: member.name, at: Date.now() };
        else if (!msg.paused && room.pause) this.unpause(room);
        else return;
        break;
      case 'lobby':
        // The host brings everyone back to the lobby after a race.
        if (me !== room.hostId) return;
        room.phase = 'lobby';
        room.pause = null;
        this.endRace();
        for (const m of Object.values(room.members)) m.ready = false;
        break;
      default:
        return;
    }
    await this.changed();
  }

  private async hello(conn: Connection<ConnState>, msg: Extract<ClientMsg, { t: 'hello' }>): Promise<void> {
    if (!isRoomCode(this.name)) return send(conn, err('Not a room code', true));
    const players = await getServerByName(this.env.Players, 'global');
    const name = await players.verify(msg.playerId, msg.token);
    if (!name) return send(conn, err('Set your name first', true));

    let room = this.saved;
    const occupied = !!room && Object.keys(room.members).length > 0;
    if (!room) {
      // An unknown code only opens for whoever is creating it.
      if (!msg.create) return send(conn, err('No room with that code', true));
      room = this.saved = {
        hostId: msg.playerId,
        settings: { track: 1, engine: '100cc' },
        phase: 'lobby',
        start: null,
        pause: null,
        results: null,
        members: {},
        races: 0,
      };
    } else if (msg.create && occupied && !room.members[msg.playerId]) {
      return send(conn, err('Code taken', true));
    } else if (!occupied) {
      // Back into a room that emptied a moment ago: the first one in hosts.
      room.hostId = msg.playerId;
      room.phase = 'lobby';
    }
    if (!room.members[msg.playerId] && Object.keys(room.members).length >= ROOM_MAX) return send(conn, err('Room is full', true));

    conn.setState({ playerId: msg.playerId });
    const taken = new Set(Object.entries(room.members).filter(([id]) => id !== msg.playerId).map(([, m]) => m.racerId));
    const existing = room.members[msg.playerId];
    const wanted = existing?.racerId ?? msg.racerId;
    room.members[msg.playerId] = {
      name,
      racerId: !taken.has(wanted) && RACERS.some((r) => r.id === wanted) ? wanted : (RACERS.find((r) => !taken.has(r.id))?.id ?? RACERS[0].id),
      ready: existing?.ready ?? false,
      joined: existing?.joined ?? Date.now(),
      ping: existing?.ping ?? 0,
    };
    await this.ctx.storage.deleteAlarm();
    await this.changed();
  }

  async onClose(conn: Connection<ConnState>): Promise<void> {
    const room = this.saved;
    const me = conn.state?.playerId;
    if (!room || !me) return;
    // The same player may still be connected from another tab.
    const still = [...this.getConnections<ConnState>()].some((c) => c !== conn && c.state?.playerId === me);
    if (still) return;
    delete room.members[me];
    // A CPU takes over their kart (it hands back if they're still racing and report in).
    this.race?.drop(me);
    // Nobody's left holding the race up.
    if (room.pause?.playerId === me) this.unpause(room);
    const left = Object.entries(room.members).sort((a, b) => a[1].joined - b[1].joined);
    if (left.length === 0) {
      this.endRace();
      await this.ctx.storage.setAlarm(Date.now() + EMPTY_TTL);
    } else if (room.hostId === me) {
      room.hostId = left[0][0];
    }
    await this.changed();
  }

  async onAlarm(): Promise<void> {
    if ([...this.getConnections()].length > 0) return;
    this.saved = null;
    await this.ctx.storage.deleteAll();
  }

  private beginRace(start: RoomStart): void {
    this.endRace();
    this.race = new RoomRace(start, Date.now());
    this.lastTick = Date.now();
    this.acc = 0;
    this.steps = 0;
    this.loop = setInterval(() => void this.tick(), 1000 / 120);
  }

  private endRace(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    this.race = null;
  }

  /** Fixed 60 Hz steps from real time; snapshots to everyone, effects to whoever was hit. */
  private async tick(): Promise<void> {
    const race = this.race;
    const room = this.saved;
    if (!race || !room) return;
    const now = Date.now();
    const elapsed = Math.min(0.25, (now - this.lastTick) / 1000);
    this.lastTick = now;
    // Paused for everyone: the room's race stands still too.
    if (room.pause) return;
    this.acc += elapsed;
    const conns = [...this.getConnections<ConnState>()];
    while (this.acc >= STEP) {
      this.acc -= STEP;
      const fx = race.step(STEP);
      for (const [playerId, effects] of fx) {
        for (const c of conns) if (c.state?.playerId === playerId) send(c, { t: 'fx', fx: effects });
      }
      if (++this.steps % SNAP_EVERY === 0) this.broadcast(JSON.stringify({ t: 'snap', snap: race.snapshot() } satisfies ServerMsg));
    }
    if (race.done && !room.results) {
      room.results = race.results();
      await this.changed();
    }
  }

  /** Resumes, moving GO back by the pause so the race clock skips it. */
  private unpause(room: Saved): void {
    if (room.pause && room.start) room.start.at += Date.now() - room.pause.at;
    room.pause = null;
  }

  /** Saves the room and sends everyone the new state. */
  private async changed(): Promise<void> {
    const room = this.saved;
    if (!room) return;
    await this.ctx.storage.put('room', room);
    const members: RoomMember[] = Object.entries(room.members)
      .sort((a, b) => a[1].joined - b[1].joined)
      .map(([playerId, m]) => ({ playerId, name: m.name, racerId: m.racerId, ready: m.ready || playerId === room.hostId, host: playerId === room.hostId, ping: m.ping }));
    const pause = room.pause ? { playerId: room.pause.playerId, name: room.pause.name } : null;
    const state: RoomState = { code: this.name, phase: room.phase, pause, settings: room.settings, members, start: room.start, results: room.results ?? null };
    this.broadcast(JSON.stringify({ t: 'state', state } satisfies ServerMsg));
  }
}

/** Humans keep their racers; CPUs drawn from the rest fill the field; the order is shuffled per race. */
function grid(room: Saved): GridSlot[] {
  const humans = Object.entries(room.members).map(([playerId, m]) => ({ racerId: m.racerId, playerId }));
  const taken = new Set(humans.map((h) => h.racerId));
  const cpus = pickRivals(taken, FIELD_SIZE - humans.length, room.races * 104729 + 17);
  const slots: GridSlot[] = [...humans, ...cpus.map((r) => ({ racerId: r.id, playerId: null }))];
  const rand = seededRandom(room.races * 7919 + humans.length);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

function send(conn: Connection, msg: ServerMsg): void {
  conn.send(JSON.stringify(msg));
}

function err(error: string, fatal = false): ServerMsg {
  return { t: 'error', error, fatal };
}
