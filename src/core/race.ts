import { AUTOPILOT_SKILL, CpuDriver, type CpuSkill, type Obstacle } from '../ai/cpuDriver';
import { HazardSystem } from '../items/hazards';
import { assistSteer } from '../physics/steerAssist';
import { CANNON_FAR, CANNON_FAR_BOOST, CANNON_FAR_FROM, CANNON_MIN_TIME, CANNON_PAST_MAX, CANNON_PAST_MIN, CANNON_SPEED_MUL, CANNON_SPIN, CANNON_TIME, ItemSystem, SIGNATURE_ITEMS, type ItemEvent, type ItemHolder, type ItemKind } from '../items/items';
import { NEUTRAL_INPUT, type InputFrame } from './inputFrame';
import { seededRandom } from './math';
import { unpackKart } from '../net/wire';
import { KART_RADIUS, copyKartState, createKartState, respawnKart, spinOut, stepKart, type KartState, type StepEvents } from '../physics/kart';
import { kartParams, type EngineClass, type KartParams, type RacerDef } from '../physics/racers';
import { LapTracker } from '../tracks/laps';
import { pointAt } from '../tracks/spline';
import type { Track } from '../tracks/track';

/** Seconds below ground before a fallen kart is put back on the track (spec section 4). */
export const RESPAWN_DELAY = 1;
/** Metres below the last road under a kart, off the road, that count as having fallen off it. */
const HIGH_FALL = 5;
/** Back on the road rolling at this fraction of top speed, with a little boost and a moment of immunity. */
const RESPAWN_SPEED = 0.5;
const RESPAWN_BOOST = 0.6;
const RESPAWN_IMMUNE = 1.5;
export const COUNTDOWN = 3;
/** Trailing CPUs get up to this much extra top speed (spec section 8). */
export const RUBBER_BAND_MAX = 0.08;
/** Meters behind the leader at which rubber-banding is fully on. */
const RUBBER_BAND_RANGE = 250;
const FALL_DEPTH = -2;
const BUMP_RESTITUTION = 0.4;
const BUMP_MIN = 2;
/** A Woo Cannon flies this high over the road, and closes in on the centreline at this rate (1/s). */
const CANNON_LIFT = 1;
const CANNON_CENTRE = 3;
/** Speed and boost a kart comes out of the cannon with. */
const CANNON_EXIT_BOOST = 0.6;

/**
 * Rocket start: hop in the last half second before GO for a boost off the
 * line. Hop earlier than that (after the 3) and the engine bogs: the kart
 * sits for a moment after GO.
 */
export const ROCKET_WINDOW = 0.5;
const EARLY_FROM = -2;
export const ROCKET_BOOST = 1;
export const STALL_TIME = 0.7;
/** CPUs get a rocket start this often, by skill. */
const CPU_ROCKET = 0.85;
/**
 * Slipstream: tuck in behind a kart (within the range, nearly in line) at
 * speed and a draft charges; full, it fires a boost.
 */
export const DRAFT_CHARGE = 1.1;
const DRAFT_MIN = 3;
const DRAFT_MAX = 22;
const DRAFT_LATERAL = 2.4;
const DRAFT_MIN_SPEED = 0.6;
export const DRAFT_BOOST = 0.9;
/** A Road Train moves for nobody much and spins out whoever it touches. */
const RAM_MASS = 4;
export const RAM_SPIN = 1;
/** CPUs trick off ramp lips this often, by skill. */
const CPU_TRICK = 0.9;

const NO_EVENTS: StepEvents = { hopped: false, landed: 0, driftStarted: false, boostTier: 0, wallHit: 0, launched: false, trick: false, trickStreak: 0 };

export class RaceKart implements ItemHolder {
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
  /** On a road last step, and the height of the last road under it: falling well below that is a fall (off a high deck). */
  onRoad = true;
  roadY = 0;
  /** This step's hardest bump from another kart (impulse, m/s) and the way to it (world), for views. */
  bump = 0;
  bumpX = 0;
  bumpZ = 0;
  item: ItemKind | null = null;
  /** A second item, from a double box: it moves into the slot when the first is used. */
  spare: ItemKind | null = null;
  rolling = 0;
  held = 0;
  /** Rocket start: how this kart got off the line, decided at GO. */
  launch: 'rocket' | 'early' | null = null;
  /** Hopped during the countdown: early (too soon) or rocket (in the window). */
  private startPress: 'rocket' | 'early' | null = null;
  /** Seconds left sitting on the line after a bogged start. */
  stall = 0;
  /** Slipstream charge 0..1, and whether it fired this step. */
  draft = 0;
  drafted = false;
  /** A CPU means to trick off the lip it just left. */
  trickPlan = false;
  /** Metres behind the middle of the field, for the far-behind Woo Cannon. */
  behind = 0;
  /** In the Woo Cannon: the kart it's chasing, and how far past it to fly before letting go. */
  cannonGoal: { target: RaceKart; past: number } | null = null;
  /**
   * Online: this kart is driven somewhere else (another player, or the room's
   * CPU on a client). It isn't simulated here: each step it takes the state
   * last fed to it.
   */
  remote = false;
  /** A player with smart steering on (physics/steerAssist.ts). */
  assist = false;
  /** Online: the remote player pressed their item button. */
  pendingUse = false;
  private incoming: readonly number[] | null = null;
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

  /** Online: the next state for a remote kart (wire.ts packed form). */
  feed(packed: readonly number[]): void {
    this.incoming = packed;
  }

  /** Applies the fed state; true if it jumped (a respawn), so views snap. */
  applyFed(): boolean {
    if (!this.incoming) return false;
    const s = this.state;
    const x0 = s.x;
    const z0 = s.z;
    unpackKart(this.incoming, s);
    this.incoming = null;
    return Math.hypot(s.x - x0, s.z - z0) > 8;
  }

  get finished(): boolean {
    return this.finishTime !== null;
  }

  get isCpu(): boolean {
    return this.driver !== null;
  }

  /** The band member's own item comes up a little more often for them. */
  get signature(): ItemKind | null {
    return SIGNATURE_ITEMS[this.racer.id] ?? null;
  }

  /** A hop on the grid: in the window it's a rocket start, before it the engine bogs. */
  pressStart(time: number): void {
    if (time >= -ROCKET_WINDOW) this.startPress ??= 'rocket';
    else if (time >= EARLY_FROM) this.startPress = 'early';
  }

  /** At GO: the start this kart gets. CPUs roll for theirs. */
  go(): void {
    const d = this.driver;
    this.launch = d ? (d.roll(CPU_ROCKET * d.skill.itemIq) ? 'rocket' : null) : this.startPress;
    if (this.launch === 'rocket') this.state.boostTime = Math.max(this.state.boostTime, ROCKET_BOOST);
    if (this.launch === 'early') this.stall = STALL_TIME;
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
  readonly items: ItemSystem;
  readonly hazards: HazardSystem;
  /** Item pickups, uses and hits (items and hazards) from the last step. */
  events: ItemEvent[] = [];
  /** Online client: items are run by the room; this race only shows them. */
  remoteItems = false;
  private readonly obstacles: Obstacle[] = [];
  /** Karts knocked aside by a Woo Cannon this step, reported with the item events. */
  private readonly cannonHits: ItemEvent[] = [];
  private readonly cannonRand: () => number;

  constructor(
    readonly track: Track,
    seed = 1,
    items = true,
    /** Laps to the flag; Time Trial runs a single lap. */
    readonly laps = track.def.laps,
  ) {
    this.items = new ItemSystem(track, seed, items);
    this.cannonRand = seededRandom(seed * 7919 + 3);
    this.hazards = new HazardSystem(track);
    this.hazards.update(this.time);
  }

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
    const before = this.time;
    this.time += dt;
    // Lights out: everyone gets the start they earned.
    if (before < 0 && this.time >= 0) for (const k of this.karts) if (!k.remote) k.go();
    this.rubberBand();
    const states = this.karts.map((k) => k.state);
    this.updateObstacles();
    const use = this.karts.map(() => false);
    const events = this.karts.map((kart, i) => {
      copyKartState(kart.state, kart.prev);
      kart.respawned = false;
      if (kart.remote) {
        kart.respawned = kart.applyFed();
        if (kart.respawned) copyKartState(kart.state, kart.prev);
        use[i] = kart.pendingUse && this.started;
        kart.pendingUse = false;
        // Not ours to respawn, but shown falling all the same.
        kart.fallTime = this.overEdge(kart) ? kart.fallTime + dt : 0;
        this.updateLaps(kart);
        return { ...NO_EVENTS };
      }
      if (kart.state.cannonTime > 0) {
        // In the cannon: no driving, no items, it flies itself.
        this.flyCannon(kart, dt);
        this.updateLaps(kart);
        return { ...NO_EVENTS };
      }
      const d = kart.driver;
      let input = (d ? d.drive(kart.state, kart.params, kart.progressS, this.track, states, this.obstacles, dt) : humanInputs[i]) ?? NEUTRAL_INPUT;
      if (!d && kart.assist) input = assistSteer(input, kart.state, this.track);
      if (d && kart.trickPlan && kart.state.trickWindow > 0) input = { ...input, driftPressed: true };
      kart.trickPlan = false;
      if (d) input = this.items.dodge(kart, input, d);
      if (d && kart.item && kart.rolling === 0) {
        use[i] = d.wantsItem(kart.item, kart.held, kart.state, kart.position, kart.progressS, this.track, states);
      } else if (!d) {
        use[i] = input.itemPressed;
      }
      // Hold everyone on the grid until the lights go green.
      if (!this.started) {
        if (input.driftPressed) kart.pressStart(this.time);
        input = { ...NEUTRAL_INPUT, drift: input.drift, driftPressed: input.driftPressed };
        use[i] = false;
      } else if (kart.stall > 0) {
        // Bogged start: the engine catches after a moment.
        kart.stall = Math.max(0, kart.stall - dt);
        input = { ...NEUTRAL_INPUT, steer: input.steer };
      }
      const ev = stepKart(kart.state, input, kart.params, this.track, dt);
      if (d && ev.launched) kart.trickPlan = d.roll(CPU_TRICK * d.skill.itemIq);
      this.updateFall(kart, dt);
      this.updateLaps(kart);
      return ev;
    });
    this.slipstream(dt);
    this.bumps();
    this.rank();
    this.events = this.remoteItems ? [] : this.items.update(dt, this.karts, use);
    this.events.push(...this.cannonHits);
    this.cannonHits.length = 0;
    for (const e of this.events) {
      if (e.type !== 'use') continue;
      (e.kart as RaceKart).driver?.forgetItem();
      if (e.item === 'wooCannon') this.aimCannon(e.kart as RaceKart);
    }
    this.hazards.update(this.time);
    if (this.started) {
      // Hazards hit the karts simulated here; remote ones are hit where they're driven.
      const local = this.karts.filter((k) => !k.remote).map((k) => k.state);
      for (const h of this.hazards.collide(local, dt)) {
        const kart = this.karts.find((k) => k.state === h.kart)!;
        this.events.push(h.good ? { type: 'bonus', kart, by: h.by } : { type: 'hit', kart, by: h.by });
      }
    }
    return events;
  }

  /** Hazards and armed mines, for CPUs to steer around. */
  private updateObstacles(): void {
    this.obstacles.length = 0;
    this.hazards.obstacles(this.obstacles);
    for (const m of this.items.mines) this.obstacles.push({ x: m.x, z: m.z, r: 1.2, vx: 0, vz: 0 });
  }

  /**
   * Where a Woo Cannon is headed: the pack (the kart in the middle of the
   * field, or the one just ahead when that's further up), and a varying
   * distance past it.
   */
  aimCannon(kart: RaceKart): void {
    const place = Math.max(1, Math.min(kart.position - 1, Math.ceil(this.karts.length / 2)));
    const target = this.karts.find((k) => k.position === place && k !== kart);
    kart.cannonGoal = target ? { target, past: CANNON_PAST_MIN + this.cannonRand() * (CANNON_PAST_MAX - CANNON_PAST_MIN) } : null;
  }

  /**
   * One step of Woo Cannon flight: on down the main centreline at well over
   * top speed, a metre up, closing in on the middle of the road, ignoring
   * walls, gaps and everything on the ground. It never lets go over a pit:
   * it keeps flying until there's road under it.
   */
  private flyCannon(kart: RaceKart, dt: number): void {
    const s = kart.state;
    const sp = this.track.spline;
    const L = this.track.length;
    const wrap = (v: number) => ((v % L) + L) % L;
    // Faster the further back it is from the kart it's chasing, so the very last catch up as quickly as the nearly there.
    const goal = kart.cannonGoal;
    const gap = goal ? goal.target.distance - kart.distance : 0;
    const far = Math.min(1, Math.max(0, (gap - CANNON_FAR_FROM) / (CANNON_FAR - CANNON_FAR_FROM)));
    const speed = kart.baseParams.topSpeed * (CANNON_SPEED_MUL + CANNON_FAR_BOOST * far);
    const s0 = kart.progressS;
    const s1 = wrap(s0 + speed * dt);
    const p0 = pointAt(sp, s0);
    const p1 = pointAt(sp, s1);
    // Keep the offset from the centreline, shrinking it, and carry it forward.
    const keep = Math.exp(-CANNON_CENTRE * dt);
    s.x = p1.x + (s.x - p0.x) * keep;
    s.z = p1.z + (s.z - p0.z) * keep;
    const road = this.track.main.heightAt(s1);
    // Eased toward its flying height, but never below the road: on a climb it would lag under it, and drop through on letting go.
    s.y = Math.max(road + 0.3, s.y + (road + CANNON_LIFT - s.y) * Math.min(1, dt * 6));
    s.groundY = road;
    s.heading = Math.atan2(p1.tx, p1.tz);
    // The lookup only searches near its hint, so carry the hint along with the flight.
    s.trackHint = Math.min(sp.count - 1, Math.floor((s1 / L) * sp.count));
    Object.assign(s, { speed, vy: 0, extX: 0, extZ: 0, grounded: false, steer: 0, slip: 0, driftDir: 0, driftArmed: false, driftCharge: 0, boostTime: 0, spinTime: 0, spinAngle: 0, wobbleTime: 0, slowTime: 0 });
    s.cannonTime = Math.max(0, s.cannonTime - dt);
    // Caught the pack and gone far enough past it: let go.
    if (goal && CANNON_TIME - s.cannonTime >= CANNON_MIN_TIME && kart.distance >= goal.target.distance + goal.past) s.cannonTime = 0;
    s.invulnTime = Math.max(s.invulnTime, s.cannonTime + 0.8);
    if (s.cannonTime > 0) return;
    const main = this.track.main;
    if (main.inGap(s1) || main.inGap(wrap(s1 + 10)) || main.inGap(wrap(s1 + 20))) {
      s.cannonTime = dt;
      return;
    }
    // Out of the barrel at top speed with a little boost; it drops the last metre onto the road.
    kart.cannonGoal = null;
    s.speed = kart.params.topSpeed;
    s.boostTime = CANNON_EXIT_BOOST;
  }

  /** Charges each kart's draft while it's tucked in behind another at speed; a full draft fires a boost. */
  private slipstream(dt: number): void {
    for (const k of this.karts) {
      k.drafted = false;
      if (k.remote) continue;
      const s = k.state;
      const fx = Math.sin(s.heading);
      const fz = Math.cos(s.heading);
      let tucked = false;
      if (this.started && s.grounded && s.boostTime === 0 && s.cannonTime === 0 && s.speed > k.baseParams.topSpeed * DRAFT_MIN_SPEED) {
        for (const o of this.karts) {
          if (o === k || Math.abs(o.state.y - s.y) > 2) continue;
          const dx = o.state.x - s.x;
          const dz = o.state.z - s.z;
          const ahead = dx * fx + dz * fz;
          if (ahead > DRAFT_MIN && ahead < DRAFT_MAX && Math.abs(dx * fz - dz * fx) < DRAFT_LATERAL && o.state.speed > s.speed * 0.6) {
            tucked = true;
            break;
          }
        }
      }
      k.draft = tucked ? k.draft + dt / DRAFT_CHARGE : Math.max(0, k.draft - dt * 2);
      if (k.draft >= 1) {
        k.draft = 0;
        k.drafted = true;
        s.boostTime = Math.max(s.boostTime, DRAFT_BOOST);
      }
    }
  }

  /** Trailing CPUs get a little more top speed; leaders get none. */
  private rubberBand(): void {
    const lead = Math.max(...this.karts.map((k) => k.distance));
    for (const k of this.karts) {
      const behind = k.isCpu && k.finishTime === null ? Math.min(1, Math.max(0, (lead - k.distance) / RUBBER_BAND_RANGE)) : 0;
      k.params.topSpeed = k.baseParams.topSpeed * (1 + RUBBER_BAND_MAX * behind);
    }
  }

  /**
   * Gone over an edge. Below ground is only a fall off the road: a road sunk in a cut (or under water) holds you up.
   * Above it, dropping well below the last road you were on (off a coaster deck) is a fall too.
   */
  private overEdge(kart: RaceKart): boolean {
    const offHigh = !kart.onRoad && (kart.state.y < kart.roadY - HIGH_FALL || this.track.underDeck(kart.state));
    return kart.state.y > FALL_DEPTH ? offHigh : !this.onSunkRoad(kart.state);
  }

  private updateFall(kart: RaceKart, dt: number): void {
    if (!this.overEdge(kart)) {
      kart.fallTime = 0;
      return;
    }
    kart.fallTime += dt;
    if (kart.fallTime < RESPAWN_DELAY) return;
    const cp = kart.laps.lastCheckpoint;
    const s = cp < 0 ? 2 : this.track.def.checkpoints[cp] * this.track.length + 2;
    const pose = this.track.respawnPose(s);
    respawnKart(kart.state, pose.x, pose.y, pose.z, pose.heading);
    kart.state.speed = kart.params.topSpeed * RESPAWN_SPEED;
    kart.state.boostTime = RESPAWN_BOOST;
    kart.state.invulnTime = RESPAWN_IMMUNE;
    kart.roadY = pose.y;
    kart.onRoad = true;
    copyKartState(kart.state, kart.prev);
    kart.fallTime = 0;
    kart.respawned = true;
  }

  private onSunkRoad(s: KartState): boolean {
    const loc = this.track.locateKart(s);
    return loc.onRoad && s.y > loc.height - 1.5;
  }

  private updateLaps(kart: RaceKart): void {
    const s = kart.state;
    // The lap it's on decides which roads are there for it.
    s.lap = Math.min(kart.laps.lap + 1, this.laps);
    s.lastLap = this.laps > 1 && s.lap === this.laps;
    const loc = this.track.locateKart(s);
    const L = this.track.length;
    let delta = loc.progress - kart.progressS;
    if (delta > L / 2) delta -= L;
    else if (delta < -L / 2) delta += L;
    kart.distance += delta;
    kart.progressS = loc.progress;
    kart.section = loc.section;
    kart.onRoad = loc.onRoad;
    if (loc.onRoad) kart.roadY = loc.height;
    if (kart.finishTime !== null || !this.started) return;
    if (kart.laps.update(loc.progress)) {
      kart.lapTimes.push(this.time - kart.lapStart);
      kart.lapStart = this.time;
      if (kart.laps.lap >= this.laps) {
        kart.finishTime = this.time;
        this.results.push(kart);
        if (!kart.remote) kart.driver ??= new CpuDriver(AUTOPILOT_SKILL, 1);
      }
    }
  }

  /**
   * Karts are discs; heavier ones shove lighter ones further (spec section
   * 4). A Woo Cannon moves for nobody and spins out whoever it touches.
   */
  private bumps(): void {
    const r2 = KART_RADIUS * 2;
    for (const k of this.karts) k.bump = 0;
    for (let i = 0; i < this.karts.length; i++) {
      for (let j = i + 1; j < this.karts.length; j++) {
        const a = this.karts[i];
        const b = this.karts[j];
        const sa = a.state;
        const sb = b.state;
        if (Math.abs(sa.y - sb.y) > 1.5) continue;
        // A remote kart's position isn't ours to change: the other kart takes the whole bump.
        if (a.remote && b.remote) continue;
        const ca = sa.cannonTime > 0;
        const cb = sb.cannonTime > 0;
        if (ca && cb) continue;
        const ra = sa.ramTime > 0 && !ca;
        const rb = sb.ramTime > 0 && !cb;
        const dx = sb.x - sa.x;
        const dz = sb.z - sa.z;
        const d = Math.hypot(dx, dz);
        if (d >= r2 || d < 1e-6) continue;
        const nx = dx / d;
        const nz = dz / d;
        // Inverse masses: a remote kart, or a cannon, moves for nobody.
        const ia = a.remote || ca ? 0 : 1 / (a.params.mass * (ra ? RAM_MASS : 1));
        const ib = b.remote || cb ? 0 : 1 / (b.params.mass * (rb ? RAM_MASS : 1));
        const total = ia + ib;
        if (total === 0) continue;
        // Hit by a cannon or a Road Train: spun out, here if it's driven here (a remote kart takes the hit where it's driven).
        const victim = ca && !b.remote ? b : cb && !a.remote ? a : ra && !rb && !b.remote ? b : rb && !ra && !a.remote ? a : null;
        if (victim) {
          const by = ca || cb ? 'wooCannon' : 'drumRoll';
          if (spinOut(victim.state, by === 'wooCannon' ? CANNON_SPIN : RAM_SPIN)) this.cannonHits.push({ type: 'hit', kart: victim, by, from: victim === a ? b : a });
        }
        const overlap = r2 - d;
        sa.x -= nx * overlap * (ia / total);
        sa.z -= nz * overlap * (ia / total);
        sb.x += nx * overlap * (ib / total);
        sb.z += nz * overlap * (ib / total);

        const va = velocity(sa);
        const vb = velocity(sb);
        const closing = (va.x - vb.x) * nx + (va.z - vb.z) * nz;
        const j_ = (Math.max(closing, 0) * (1 + BUMP_RESTITUTION) + BUMP_MIN) / total;
        if (ia) shove(sa, -nx * j_ * ia, -nz * j_ * ia);
        if (ib) shove(sb, nx * j_ * ib, nz * j_ * ib);
        noteBump(a, j_ * Math.max(ia, ib), nx, nz);
        noteBump(b, j_ * Math.max(ia, ib), -nx, -nz);
      }
    }
  }

  /** Positions: finishers in finish order, then everyone else by distance. */
  private rank(): void {
    const order = [...this.results, ...this.karts.filter((k) => k.finishTime === null).sort((a, b) => b.distance - a.distance)];
    order.forEach((k, i) => (k.position = i + 1));
    const middle = order[Math.ceil(order.length / 2) - 1];
    for (const k of order) k.behind = middle && k.finishTime === null ? Math.max(0, middle.distance - k.distance) : 0;
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

/** Keeps a kart's hardest bump of the step, pointing at what it hit. */
function noteBump(k: RaceKart, impulse: number, towardX: number, towardZ: number): void {
  if (impulse <= k.bump) return;
  k.bump = impulse;
  k.bumpX = towardX;
  k.bumpZ = towardZ;
}
