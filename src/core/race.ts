import { AUTOPILOT_SKILL, CpuDriver, type CpuSkill } from '../ai/cpuDriver';
import { NEUTRAL_INPUT, type InputFrame } from './input';
import { wrapAngle } from './math';
import { KART_RADIUS, copyKartState, createKartState, respawnKart, stepKart, type KartState, type StepEvents } from '../physics/kart';
import { kartParams, type EngineClass, type KartParams, type RacerDef } from '../physics/racers';
import { LapTracker } from '../tracks/laps';
import type { Track } from '../tracks/track';

/** Seconds below ground before a fallen kart is put back on the track (spec section 4). */
export const RESPAWN_DELAY = 1.5;
export const COUNTDOWN = 3;
/** Trailing CPUs get up to this much extra top speed (spec section 8). */
export const RUBBER_BAND_MAX = 0.08;
/** Meters behind the leader at which rubber-banding is fully on. */
const RUBBER_BAND_RANGE = 250;
const FALL_DEPTH = -2;
const BUMP_RESTITUTION = 0.4;
const BUMP_MIN = 2;

export class RaceKart {
  readonly state: KartState;
  /** Previous tick's state, for render interpolation. */
  readonly prev: KartState;
  baseParams: KartParams;
  params: KartParams;
  laps: LapTracker;
  /** Arc length on the main centerline, 0..track length. */
  progressS = 0;
  /** Continuous distance raced, negative before the start line; ranks karts. */
  distance = 0;
  position = 0;
  section = '';
  lapTimes: number[] = [];
  lapStart = 0;
  finishTime: number | null = null;
  fallTime = 0;
  respawned = false;
  /** CPU brain, or null while a human drives. A finished human gets one. */
  driver: CpuDriver | null;

  constructor(
    public racer: RacerDef,
    public engine: EngineClass,
    track: Track,
    slot: number,
    cpu: CpuSkill | null,
  ) {
    this.baseParams = kartParams(racer.stats, engine);
    this.params = { ...this.baseParams };
    const pose = track.startSlot(slot);
    this.state = createKartState(pose.x, pose.z, pose.heading);
    this.state.y = this.state.groundY = pose.y;
    this.prev = copyKartState(this.state, createKartState());
    this.laps = new LapTracker(track.length, track.def.checkpoints);
    const loc = track.locate(pose.x, pose.z, pose.y);
    this.progressS = loc.progress;
    this.distance = loc.progress > track.length / 2 ? loc.progress - track.length : loc.progress;
    this.driver = cpu ? new CpuDriver(cpu, slot * 7919 + 13) : null;
  }

  get isCpu(): boolean {
    return this.driver !== null;
  }

  setRacer(racer: RacerDef, engine: EngineClass): void {
    this.racer = racer;
    this.engine = engine;
    this.baseParams = kartParams(racer.stats, engine);
    this.params = { ...this.baseParams };
  }
}

/** Owns simulation for one race: karts, countdown, laps, positions, falls and bumps. */
export class Race {
  /** Seconds since the green light; negative during the countdown. */
  time = -COUNTDOWN;
  readonly karts: RaceKart[] = [];
  /** Finish order. */
  readonly results: RaceKart[] = [];

  constructor(readonly track: Track) {}

  addKart(racer: RacerDef, engine: EngineClass, cpu: CpuSkill | null): RaceKart {
    const kart = new RaceKart(racer, engine, this.track, this.karts.length, cpu);
    this.karts.push(kart);
    this.rank();
    return kart;
  }

  get started(): boolean {
    return this.time >= 0;
  }

  get finished(): boolean {
    return this.results.length === this.karts.length;
  }

  /** `humanInputs[i]` drives kart i when it has no CPU driver. */
  step(dt: number, humanInputs: readonly (InputFrame | undefined)[]): StepEvents[] {
    this.time += dt;
    this.rubberBand();
    const states = this.karts.map((k) => k.state);
    const events = this.karts.map((kart, i) => {
      copyKartState(kart.state, kart.prev);
      kart.respawned = false;
      let input = (kart.driver ? kart.driver.drive(kart.state, kart.params, kart.progressS, this.track, states, dt) : humanInputs[i]) ?? NEUTRAL_INPUT;
      // Hold everyone on the grid until the lights go green.
      if (!this.started) input = { ...NEUTRAL_INPUT, drift: input.drift, driftPressed: input.driftPressed };
      const ev = stepKart(kart.state, input, kart.params, this.track, dt);
      this.updateFall(kart, dt);
      this.updateLaps(kart);
      return ev;
    });
    this.bumps();
    this.rank();
    return events;
  }

  /** Trailing CPUs get a little more top speed; leaders get none. */
  private rubberBand(): void {
    const lead = Math.max(...this.karts.map((k) => k.distance));
    for (const k of this.karts) {
      const behind = k.isCpu && k.finishTime === null ? Math.min(1, Math.max(0, (lead - k.distance) / RUBBER_BAND_RANGE)) : 0;
      k.params.topSpeed = k.baseParams.topSpeed * (1 + RUBBER_BAND_MAX * behind);
    }
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
    const L = this.track.length;
    let delta = loc.progress - kart.progressS;
    if (delta > L / 2) delta -= L;
    else if (delta < -L / 2) delta += L;
    kart.distance += delta;
    kart.progressS = loc.progress;
    kart.section = loc.section;
    if (kart.finishTime !== null || !this.started) return;
    if (kart.laps.update(loc.progress)) {
      kart.lapTimes.push(this.time - kart.lapStart);
      kart.lapStart = this.time;
      if (kart.laps.lap >= this.track.def.laps) {
        kart.finishTime = this.time;
        this.results.push(kart);
        kart.driver ??= new CpuDriver(AUTOPILOT_SKILL, 1);
      }
    }
  }

  /** Karts are discs; heavier ones shove lighter ones further (spec section 4). */
  private bumps(): void {
    const r2 = KART_RADIUS * 2;
    for (let i = 0; i < this.karts.length; i++) {
      for (let j = i + 1; j < this.karts.length; j++) {
        const a = this.karts[i];
        const b = this.karts[j];
        const sa = a.state;
        const sb = b.state;
        if (Math.abs(sa.y - sb.y) > 1.5) continue;
        const dx = sb.x - sa.x;
        const dz = sb.z - sa.z;
        const d = Math.hypot(dx, dz);
        if (d >= r2 || d < 1e-6) continue;
        const nx = dx / d;
        const nz = dz / d;
        const ma = a.params.mass;
        const mb = b.params.mass;
        const overlap = r2 - d;
        sa.x -= nx * overlap * (mb / (ma + mb));
        sa.z -= nz * overlap * (mb / (ma + mb));
        sb.x += nx * overlap * (ma / (ma + mb));
        sb.z += nz * overlap * (ma / (ma + mb));

        const va = velocity(sa);
        const vb = velocity(sb);
        const closing = (va.x - vb.x) * nx + (va.z - vb.z) * nz;
        const j_ = (Math.max(closing, 0) * (1 + BUMP_RESTITUTION) + BUMP_MIN) / (1 / ma + 1 / mb);
        shove(sa, -nx * (j_ / ma), -nz * (j_ / ma));
        shove(sb, nx * (j_ / mb), nz * (j_ / mb));
      }
    }
  }

  /** Positions: finishers in finish order, then everyone else by distance. */
  private rank(): void {
    const order = [...this.results, ...this.karts.filter((k) => k.finishTime === null).sort((a, b) => b.distance - a.distance)];
    order.forEach((k, i) => (k.position = i + 1));
  }
}

function velocity(s: KartState): { x: number; z: number } {
  return { x: Math.sin(s.heading) * s.speed + s.extX, z: Math.cos(s.heading) * s.speed + s.extZ };
}

/** Applies a velocity change: the part along the kart's heading changes its speed, the rest knocks it sideways. */
function shove(s: KartState, dvx: number, dvz: number): void {
  const fx = Math.sin(s.heading);
  const fz = Math.cos(s.heading);
  const along = dvx * fx + dvz * fz;
  s.speed += along * 0.6;
  s.extX += dvx - fx * along * 0.6;
  s.extZ += dvz - fz * along * 0.6;
}

/** Ordinal suffix for positions: 1st, 2nd, 3rd, 4th ... */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

export { wrapAngle };
