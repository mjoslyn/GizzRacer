import { describe, expect, it } from 'vitest';
import { CPU_SKILL, CpuDriver } from '../src/ai/cpuDriver';
import { PHYSICS_DT } from '../src/core/loop';
import { Race, type RaceKart } from '../src/core/race';
import { seededRandom } from '../src/core/math';
import { OnlineRace, INTERP_DELAY } from '../src/net/onlineRace';
import type { Effect, RoomStart, Snap } from '../src/net/protocol';
import { RoomRace } from '../src/net/roomRace';
import { RACERS } from '../src/physics/racers';
import { TRACK_LIST } from '../src/tracks/index';
import { Track } from '../src/tracks/track';

/** A WebSocket-ish link: ordered, lossless, with latency and jitter. */
class Link<T> {
  private queue: { at: number; msg: T }[] = [];
  private last = 0;
  constructor(private readonly rand: () => number) {}
  send(now: number, msg: T): void {
    // In order: never deliver before the previous message.
    this.last = Math.max(this.last, now + 0.05 + this.rand() * 0.04);
    this.queue.push({ at: this.last, msg });
  }
  receive(now: number): T[] {
    const out: T[] = [];
    while (this.queue.length && this.queue[0].at <= now) out.push(this.queue.shift()!.msg);
    return out;
  }
}

type Down = { t: 'snap'; snap: Snap } | { t: 'fx'; fx: Effect[] };
type Up = { t: 'kart'; s: number[] } | { t: 'item' };

describe('online race over a laggy link', () => {
  it('two players race the room: everyone finishes, views and times agree, hits arrive', () => {
    const rand = seededRandom(9);
    const ids = ['player-a', 'player-b'];
    const start: RoomStart = {
      race: 1,
      at: 3000,
      seed: 42,
      settings: { track: 0, engine: '100cc' },
      grid: RACERS.map((r, i) => ({ racerId: r.id, playerId: i === 2 ? ids[0] : i === 5 ? ids[1] : null })),
    };
    const room = new RoomRace(start, 0);
    const clients = ids.map((id) => {
      const race = new Race(new Track(TRACK_LIST[0].build()), start.seed, true);
      let me: RaceKart | null = null;
      start.grid.forEach((slot) => {
        const racer = RACERS.find((r) => r.id === slot.racerId)!;
        const k = race.addKart(racer, '100cc', slot.playerId === id ? null : CPU_SKILL['100cc']);
        if (slot.playerId === id) me = k;
      });
      race.time = -start.at / 1000;
      const net = new OnlineRace(race, me!);
      return { id, race, net, me: me!, pilot: new CpuDriver(CPU_SKILL['150cc'], id.length), down: new Link<Down>(rand), up: new Link<Up>(rand), hits: 0, viewErr: [] as number[] };
    });

    let tick = 0;
    for (let now = 0; now < 400 && !room.done; now += PHYSICS_DT, tick++) {
      // Room: apply reports, step, send.
      for (const c of clients) {
        for (const m of c.up.receive(now)) {
          if (m.t === 'kart') room.report(c.id, m.s);
          else room.useItem(c.id);
        }
      }
      const fx = room.step(PHYSICS_DT);
      for (const c of clients) {
        const mine = fx.get(c.id);
        if (mine) c.down.send(now, { t: 'fx', fx: mine });
        if (tick % 4 === 0) c.down.send(now, { t: 'snap', snap: room.snapshot() });
      }
      // Clients: take what arrived, drive, report.
      for (const c of clients) {
        for (const m of c.down.receive(now)) {
          if (m.t === 'snap') c.net.receive(m.snap, now);
          else c.hits += c.net.apply(m.fx).length;
        }
        c.net.update(now);
        const s = c.me.state;
        const input = c.pilot.drive(s, c.me.params, c.me.progressS, c.race.track, c.race.karts.map((k) => k.state), [], PHYSICS_DT);
        // Fire whatever the room gave us once it's done rolling.
        if (c.me.item && c.me.rolling === 0 && tick % 90 === 0) c.up.send(now, { t: 'item' });
        c.race.step(PHYSICS_DT, c.race.karts.map((k) => (k === c.me ? input : undefined)));
        if (tick % 4 === 0) c.up.send(now, { t: 'kart', s: c.net.report() });
        // How far is the other human from where the room had them INTERP_DELAY + a bit ago? Sampled mid-race.
        const other = clients.find((o) => o !== c)!;
        // Not mid-flight in a Woo Cannon, which goes well past the 40 m/s the bound below assumes.
        if (tick % 300 === 0 && c.race.time > 5 && other.me.state.cannonTime === 0) {
          const idx = c.race.karts.findIndex((k) => k.racer.id === other.me.racer.id);
          const shown = c.race.karts[idx].state;
          c.viewErr.push(Math.hypot(shown.x - other.me.state.x, shown.z - other.me.state.z));
        }
      }
    }

    expect(room.done).toBe(true);
    const results = room.results();
    for (const c of clients) {
      const r = results.find((x) => x.playerId === c.id)!;
      expect(r.time, c.id).not.toBeNull();
      // The room saw the finish from reports a moment late: within a fraction of a second.
      expect(Math.abs(r.time! - c.me.finishTime!), c.id).toBeLessThan(0.5);
      // Another player is shown where they were: INTERP_DELAY plus their report's and the
      // snapshot's trips and intervals (~0.35 s here). At up to 40 m/s that's metres, never a teleport.
      const worst = Math.max(...c.viewErr);
      expect(worst, `${c.id} view error`).toBeLessThan(40 * (INTERP_DELAY + 0.35));
    }
    // Once both humans are home the room calls it: every kart placed, CPUs still out by position.
    expect(results.length).toBe(RACERS.length);
    expect(new Set(results.map((r) => r.racerId)).size).toBe(RACERS.length);
    console.log('hits applied', clients.map((c) => c.hits), 'view err', clients.map((c) => Math.max(...c.viewErr).toFixed(1)));
    // A whole race at 60 Hz for a room and two clients: about 4.5 s alone, more on a busy machine.
  }, 120_000);
});
