import { CPU_SKILL, CpuDriver } from '../ai/cpuDriver';
import { Race, type RaceKart } from '../core/race';
import { BASS_SLOW, CABLE_TIME, CANNON_TIME, DRUM_TIME, FLUTE_WOBBLE, FUZZ_BOOST, HARMONICA_WOBBLE, ITEM_KINDS, LASER_SPIN, MINE_WOBBLE, MISSILE_SPIN, SURGE_SPIN, WAVE_SPIN, tempoSlowFor, type ItemKind } from '../items/items';
import { RACERS } from '../physics/racers';
import { TRACK_LIST } from '../tracks/index';
import { Track } from '../tracks/track';
import type { Effect, RaceResult, RoomStart, Snap } from './protocol';
import { packKart } from './wire';

/** Humans still out this long after the first finisher are placed where they are. */
export const FINISH_GRACE = 30;

/** Tempo Shift's length depends on the victim's place, so it's worked out per hit (below). */
const HIT_EFFECTS: Partial<Record<ItemKind, Omit<Effect, 'by'>>> = {
  feedbackWave: { k: 'spin', t: WAVE_SPIN },
  riffMissile: { k: 'spin', t: MISSILE_SPIN },
  microtonalMine: { k: 'wobble', t: MINE_WOBBLE },
  fluteFlurry: { k: 'wobble', t: FLUTE_WOBBLE },
  keytarLaser: { k: 'spin', t: LASER_SPIN },
  bassDrop: { k: 'slow', t: BASS_SLOW },
  patchCable: { k: 'slow', t: CABLE_TIME },
  harmonicaWail: { k: 'push', t: HARMONICA_WOBBLE },
  // The leader's own screen decides whether they rode over it.
  gizzardWave: { k: 'surge', t: SURGE_SPIN },
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
    const karts = this.race.karts;
    for (const e of this.race.events) {
      const k = e.kart as RaceKart;
      if (e.type === 'use' && e.item === 'fuzzPedal') add(k, { k: 'boost', t: FUZZ_BOOST, by: e.item });
      // Items that boost their user: the room set the boost on the kart as it last heard it.
      if (e.type === 'use' && (e.item === 'patchCable' || e.item === 'harmonicaWail')) add(k, { k: 'boost', t: k.state.boostTime, by: e.item });
      // The player's own client flies their cannon, and rolls their drum.
      if (e.type === 'use' && e.item === 'wooCannon') add(k, { k: 'cannon', t: CANNON_TIME, by: e.item });
      if (e.type === 'use' && e.item === 'drumRoll') add(k, { k: 'ram', t: DRUM_TIME, by: e.item });
      if (e.type !== 'hit') continue;
      const f = e.from ? karts.indexOf(e.from as RaceKart) : -1;
      const from = f >= 0 ? { f } : {};
      if (e.by in HIT_EFFECTS) add(k, { ...HIT_EFFECTS[e.by as ItemKind]!, by: e.by, ...from, ...(e.push ? { x: e.push[0], z: e.push[1] } : {}) });
      if (e.by === 'tempoShift') add(k, { k: 'slow', t: tempoSlowFor(k.position, karts.length), by: e.by, ...from });
    }
    if (this.firstFinish === null && this.race.results.length) this.firstFinish = this.race.time;
    return out;
  }

  snapshot(): Snap {
    const { race } = this;
    const index = (k: unknown) => (k ? race.karts.indexOf(k as RaceKart) : -1);
    const items = race.items;
    return {
      t: r2(race.time),
      k: race.karts.map((k) => packKart(k.state)),
      it: race.karts.map((k) => [k.item ? ITEM_KINDS.indexOf(k.item) : -1, r2(k.rolling), k.spare ? ITEM_KINDS.indexOf(k.spare) : -1]),
      pos: race.karts.map((k) => k.position),
      lap: race.karts.map((k) => k.laps.lap),
      fin: race.karts.map((k) => (k.finishTime === null ? null : r2(k.finishTime))),
      box: items.boxes.map((b) => r2(b.respawn)),
      mines: items.mines.map((m) => [r2(m.x), r2(m.y), r2(m.z)]),
      mis: items.missiles.map((m) => [r2(m.x), r2(m.y), r2(m.z), r2(m.heading)]),
      waves: items.waves.map((w) => [r2(w.x), r2(w.y), r2(w.z), r2(w.age)]),
      fx: items.bursts.map((b) => [ITEM_KINDS.indexOf(b.kind), r2(b.x), r2(b.y), r2(b.z), r2(b.heading), r2(b.age), r2(b.life), r2(b.len), index(b.from), index(b.to)]),
      sg: items.surge ? [r2(items.surge.x), r2(items.surge.y), r2(items.surge.z), r2(items.surge.heading), index(items.surge.target)] : null,
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
