import { CPU_SKILL, CpuDriver } from '../ai/cpuDriver';
import { Race, type RaceKart } from '../core/race';
import { FUZZ_BOOST, ITEM_KINDS, MINE_WOBBLE, MISSILE_SPIN, TEMPO_SLOW, WAVE_SPIN, type ItemKind } from '../items/items';
import { RACERS } from '../physics/racers';
import { TRACK_LIST } from '../tracks/index';
import { Track } from '../tracks/track';
import type { Effect, RaceResult, RoomStart, Snap } from './protocol';
import { packKart } from './wire';

/** Humans still out this long after the first finisher are placed where they are. */
export const FINISH_GRACE = 30;

const HIT_EFFECTS: Partial<Record<ItemKind, Omit<Effect, 'by'>>> = {
  feedbackWave: { k: 'spin', t: WAVE_SPIN },
  riffMissile: { k: 'spin', t: MISSILE_SPIN },
  microtonalMine: { k: 'wobble', t: MINE_WOBBLE },
  tempoShift: { k: 'slow', t: TEMPO_SLOW },
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The room's side of an online race (docs/MULTIPLAYER.md 7.1): runs the
 * race with the shared simulation. CPUs drive here; human karts are remote,
 * placed where their players report them. Item boxes, item use and every
 * item hit happen here, and the hits on humans go back to them as effects.
 */
export class RoomRace {
  readonly race: Race;
  private readonly players = new Map<string, RaceKart>();
  private firstFinish: number | null = null;

  constructor(readonly start: RoomStart, now: number) {
    const s = start.settings;
    this.race = new Race(new Track(TRACK_LIST[s.track].build()), start.seed, true);
    start.grid.forEach((slot, i) => {
      const racer = RACERS.find((r) => r.id === slot.racerId) ?? RACERS[i % RACERS.length];
      const kart = this.race.addKart(racer, s.engine, slot.playerId ? null : CPU_SKILL[s.engine]);
      if (slot.playerId) {
        kart.remote = true;
        this.players.set(slot.playerId, kart);
      }
    });
    this.race.time = -(start.at - now) / 1000;
  }

  report(playerId: string, packed: number[]): void {
    const k = this.players.get(playerId);
    if (!k || !Array.isArray(packed) || packed.length < 17 || !packed.every(Number.isFinite)) return;
    // Reporting again after a dropped connection: they're still racing, so the kart is theirs.
    if (!k.remote) this.rejoin(playerId);
    k.feed(packed);
  }

  useItem(playerId: string): void {
    const k = this.players.get(playerId);
    if (k) k.pendingUse = true;
  }

  /** A player left: a CPU takes their kart from where it was. */
  drop(playerId: string): void {
    const k = this.players.get(playerId);
    if (!k || !k.remote) return;
    k.remote = false;
    if (k.finishTime === null) k.driver = new CpuDriver(CPU_SKILL[k.engine], 77);
  }

  /** A player came back: their kart is theirs again. */
  rejoin(playerId: string): void {
    const k = this.players.get(playerId);
    if (!k) return;
    k.remote = true;
    k.driver = null;
  }

  /** One fixed step. Returns effects for each human hit (or boosted) this step. */
  step(dt: number): Map<string, Effect[]> {
    this.race.step(dt, []);
    const out = new Map<string, Effect[]>();
    const add = (k: RaceKart, e: Effect) => {
      for (const [id, kart] of this.players) {
        if (kart !== k || !kart.remote) continue;
        out.set(id, [...(out.get(id) ?? []), e]);
      }
    };
    for (const e of this.race.events) {
      const k = e.kart as RaceKart;
      if (e.type === 'use' && e.item === 'fuzzPedal') add(k, { k: 'boost', t: FUZZ_BOOST, by: e.item });
      if (e.type === 'hit' && e.by in HIT_EFFECTS) add(k, { ...HIT_EFFECTS[e.by as ItemKind]!, by: e.by });
    }
    if (this.firstFinish === null && this.race.results.length) this.firstFinish = this.race.time;
    return out;
  }

  snapshot(): Snap {
    const { race } = this;
    const items = race.items;
    return {
      t: r2(race.time),
      k: race.karts.map((k) => packKart(k.state)),
      it: race.karts.map((k) => [k.item ? ITEM_KINDS.indexOf(k.item) : -1, r2(k.rolling)]),
      pos: race.karts.map((k) => k.position),
      lap: race.karts.map((k) => k.laps.lap),
      fin: race.karts.map((k) => (k.finishTime === null ? null : r2(k.finishTime))),
      box: items.boxes.map((b) => r2(b.respawn)),
      mines: items.mines.map((m) => [r2(m.x), r2(m.y), r2(m.z)]),
      mis: items.missiles.map((m) => [r2(m.x), r2(m.y), r2(m.z), r2(m.heading)]),
      waves: items.waves.map((w) => [r2(w.x), r2(w.y), r2(w.z), r2(w.age)]),
    };
  }

  /** Every human has finished, or the grace period after the first finisher is over. */
  get done(): boolean {
    const humans = [...this.players.values()];
    if (humans.every((k) => k.finishTime !== null)) return true;
    return this.firstFinish !== null && this.race.time - this.firstFinish > FINISH_GRACE;
  }

  /** Finishing order: finishers by time, then everyone else by where they are. */
  results(): RaceResult[] {
    const ids = new Map([...this.players].map(([id, k]) => [k, id]));
    return [...this.race.karts]
      .sort((a, b) => a.position - b.position)
      .map((k) => ({ racerId: k.racer.id, playerId: ids.get(k) ?? null, time: k.finishTime }));
  }
}
