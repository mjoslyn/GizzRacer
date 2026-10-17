import type { InputFrame } from './input';
import { copyKartState, createKartState, respawnKart, stepKart, type KartState, type StepEvents } from '../physics/kart';
import { kartParams, type EngineClass, type KartParams, type RacerDef } from '../physics/racers';
import { LapTracker } from '../tracks/laps';
import type { Track } from '../tracks/track';

/** Seconds below ground before a fallen kart is put back on the track (spec section 4). */
export const RESPAWN_DELAY = 1.5;
const FALL_DEPTH = -2;

export class RaceKart {
  readonly state: KartState;
  /** Previous tick's state, for render interpolation. */
  readonly prev: KartState;
  params: KartParams;
  laps: LapTracker;
  progressS = 0;
  section = '';
  lapTimes: number[] = [];
  lapStart = 0;
  finishTime: number | null = null;
  fallTime = 0;
  respawned = false;

  constructor(
    public racer: RacerDef,
    public engine: EngineClass,
    track: Track,
    slot: number,
  ) {
    this.params = kartParams(racer.stats, engine);
    const pose = track.startSlot(slot);
    this.state = createKartState(pose.x, pose.z, pose.heading);
    this.state.y = this.state.groundY = pose.y;
    this.prev = copyKartState(this.state, createKartState());
    this.laps = new LapTracker(track.length, track.def.checkpoints);
  }

  setRacer(racer: RacerDef, engine: EngineClass): void {
    this.racer = racer;
    this.engine = engine;
    this.params = kartParams(racer.stats, engine);
  }
}

/** Owns simulation for one race: karts, laps, falls and respawns. */
export class Race {
  time = 0;
  readonly karts: RaceKart[] = [];

  constructor(readonly track: Track) {}

  addKart(racer: RacerDef, engine: EngineClass): RaceKart {
    const kart = new RaceKart(racer, engine, this.track, this.karts.length);
    this.karts.push(kart);
    return kart;
  }

  get finished(): boolean {
    return this.karts.every((k) => k.finishTime !== null);
  }

  step(dt: number, inputs: readonly InputFrame[]): StepEvents[] {
    this.time += dt;
    return this.karts.map((kart, i) => {
      copyKartState(kart.state, kart.prev);
      kart.respawned = false;
      const events = stepKart(kart.state, inputs[i], kart.params, this.track, dt);
      this.updateFall(kart, dt);
      this.updateLaps(kart);
      return events;
    });
  }

  private updateFall(kart: RaceKart, dt: number): void {
    if (kart.state.y > FALL_DEPTH) {
      kart.fallTime = 0;
      return;
    }
    kart.fallTime += dt;
    if (kart.fallTime < RESPAWN_DELAY) return;
    const cp = kart.laps.lastCheckpoint;
    const s = cp < 0 ? 2 : this.track.def.checkpoints[cp] * this.track.length + 2;
    const pose = this.track.respawnPose(s);
    respawnKart(kart.state, pose.x, pose.y, pose.z, pose.heading);
    copyKartState(kart.state, kart.prev);
    kart.fallTime = 0;
    kart.respawned = true;
  }

  private updateLaps(kart: RaceKart): void {
    const s = kart.state;
    const loc = this.track.locate(s.x, s.z, s.y, s.trackHint);
    kart.progressS = loc.progress;
    kart.section = loc.section;
    if (kart.finishTime !== null) return;
    if (kart.laps.update(loc.progress)) {
      kart.lapTimes.push(this.time - kart.lapStart);
      kart.lapStart = this.time;
      if (kart.laps.lap >= this.track.def.laps) kart.finishTime = this.time;
    }
  }
}
