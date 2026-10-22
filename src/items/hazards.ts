import { KART_RADIUS, TRICK_WINDOW, spinOut, type KartState } from '../physics/kart';
import { pointAt } from '../tracks/spline';
import type { HazardDef, Track } from '../tracks/track';

export type HazardKind = HazardDef['kind'];

/** Where one hazard is at a moment of race time. Recomputed every tick. */
export interface HazardPose {
  kind: HazardKind;
  x: number;
  y: number;
  z: number;
  /** Facing (physics convention) for snakes and tumbleweeds; road heading otherwise. */
  heading: number;
  radius: number;
  /** Road height under the hazard. */
  ground: number;
  /** Road centerline point it sits across from (vine anchors). */
  ax: number;
  az: number;
  /** Velocity over the last update, m/s. */
  vx: number;
  vz: number;
  /** Can hit karts right now. */
  active: boolean;
  /** Which way across the road it goes, 1 (to the right) or -1: a gust's direction. 0 when it doesn't matter. */
  side: number;
  /**
   * Kind-specific: boulder cycle stage (0..1), tumbleweed bounce height,
   * snake slither phase, dust devil spin.
   */
  phase: number;
}

export const SNAKE_SPIN = 0.9;
export const BOULDER_SPIN = 1.1;
export const JET_SPIN = 1.0;
export const VINE_SPIN = 1.0;
export const ROLLER_SPIN = 1.0;
export const FISH_SPIN = 0.9;
export const ICE_BLOCK_SPIN = 1.0;
export const LASER_SPIN = 1.0;
/** Share of a fish's period spent in the air, crossing the road. */
export const FISH_AIR = 0.42;
const FISH_RADIUS = 1.0;
/** How high a fish arcs over the road's middle. */
const FISH_HEIGHT = 2.4;
const ICE_BLOCK_RADIUS = 1.6;
const BUTTERFLY_RADIUS = 5;
/** Sideways shove inside a butterfly swarm, m/s^2: gentler than a dust devil, but there's no ground to land on. */
export const BUTTERFLY_PUSH = 12;
/** Flame jet cycle: quiet, then sputtering (harmless), then full fire. */
export const JET_STAGES = { sputter: 0.45, fire: 0.62 } as const;
const VINE_RADIUS = 1.3;
const ROLLER_RADIUS = 1.5;
/** How far along the road a flame jet's sheet of fire reaches. */
const JET_DEPTH = 1.3;
export const TUMBLEWEED_SLOW = 0.55;
/** Sideways acceleration inside a dust devil, m/s^2. */
export const DEVIL_PUSH = 34;
const SNAKE_RADIUS = 0.7;
const SNAKE_LENGTH = 3.2;
const DEVIL_RADIUS = 4;
const TUMBLEWEED_RADIUS = 0.9;
const TUMBLEWEED_SPEED = 7;
const BOULDER_RADIUS = 1.7;
const BOULDER_DROP = 24;
const HIT_COOLDOWN = 1;
/** Sideways acceleration inside a tornado, m/s^2: a dust devil grown up. */
export const TORNADO_PUSH = 40;
const TORNADO_RADIUS = 6;
/** Pull round and into a black hole, m/s^2. */
export const HOLE_PUSH = 30;
const HOLE_RADIUS = 7;
/** Touch a black hole's core and it spins you out. */
export const HOLE_CORE = 1.6;
export const HOLE_SPIN = 1.1;
const LIGHTNING_RADIUS = 2.6;
/** Sideways shove inside a cluster of ghost lights, m/s^2: a cold draught, gentler than a dust devil. */
export const WISP_PUSH = 18;
const WISP_RADIUS = 4.5;
const STONE_RADIUS = 1.5;
export const STONE_SPIN = 1.0;
export const GLIDER_SPIN = 1.1;
export const WAVE_SPIN = 1.0;
/*
 * Hazards that help when used well (a 'good' hit, the race's 'bonus' event):
 * - a ghost light's core carries you on a boost
 * - something that has come down (a crashed plane, a lava bomb, a meteor) is a ramp, hopped onto
 * - rammed on a boost, a stone, boulder, ice block, hailstone, tumbleweed or
 *   glob of burning oil gives way and the boost runs on
 * - hopped, a snake is cleared, a leaping fish caught and a wave surfed, each for a boost
 * - a laser gate or flame jet slipped through while it's warming up is a boost
 * - hop in a dust devil or a tornado and it throws you up for a trick
 * - drifting through a butterfly swarm charges the sparks faster
 * - skimming a black hole's pull on a boost is a gravity assist
 * - a geyser erupting under a kart that hopped onto it is ridden up high, with a boost
 * - hop as Predator X snaps and you're over its jaws, on a boost
 * - a crusher slamming down just behind you throws you on in its shockwave, a boost
 * - hop as a gust blows and you catch the wind, a boost instead of a shove
 * - hop onto a vesicle and it bounces you up high, for a trick
 * - a prism beam in the fourth colour is a boost to drive through
 */
/** A reward can't pay out again to the same kart for this long. */
export const REWARD_COOLDOWN = 1.5;
/** Touch a ghost light's core and it carries you: a boost this long. */
export const WISP_CORE = 1.4;
export const WISP_BOOST = 0.9;
/** What has come down is a ramp, hopped onto: it throws you up at this speed (m/s), with a trick window. */
export const RAMP_LAUNCH = 9;
/** Rammed on a boost, the boost runs on this much longer. */
export const RAM_BOOST = 0.6;
/** A hop this recent (or being in the air) counts as hopping a hazard. */
export const HOP_WINDOW = 0.35;
/** Hopped: a snake cleared or a fish caught is a boost this long; a wave surfed, longer. */
export const HOP_BOOST = 0.7;
export const WAVE_SURF = 1.1;
/** A gate slipped through as it warms up: a boost this long. */
export const GATE_BOOST = 0.7;
/** A hop this recent in a dust devil or tornado gets you thrown up, this fast (m/s). */
export const UPDRAFT_HOP = 0.3;
export const DEVIL_LIFT = 9;
export const TORNADO_LIFT = 12;
/** Drift charge gained per second in a butterfly swarm, on top of the drift's own. */
export const WING_CHARGE = 1;
/** Boost seconds gained per second skimming a black hole's pull on a boost. */
export const GRAVITY_ASSIST = 0.8;
const RAMPS = new Set<HazardKind>(['gliders', 'lavaBombs', 'meteors']);
const RAMMABLE = new Set<HazardKind>(['stones', 'rollers', 'iceBlocks', 'hail', 'oilBombs', 'boulders', 'tumbleweeds', 'crystals']);
const HOPPABLE = new Set<HazardKind>(['waves', 'snakes', 'fish', 'goblins', 'jaws']);
/** A geyser erupts for this share of its cycle, after its warning. */
export const GEYSER_ERUPT = 0.18;
const GEYSER_RADIUS = 2.8;
/** An eruption throws a kart up this fast (m/s), and slows it; hopped onto, it's ridden higher, with a boost. */
export const GEYSER_THROW = 9;
export const GEYSER_RIDE = 14;
export const GEYSER_SLOW = 0.5;
const GOBLIN_RADIUS = 0.9;
/** Predator X lunges over this share of its cycle, and its jaws reach this far. */
export const JAWS_LUNGE = 0.08;
const JAWS_RADIUS = 3.2;
const CRYSTAL_RADIUS = 1.4;
/**
 * Crusher cycle: hanging high (shaking loose from the warning on), the
 * slam, sitting on the road as a block, and hauling back up.
 */
export const CRUSHER_STAGES = { shake: 0.3, slam: 0.46, landed: 0.52, rise: 0.78 } as const;
export const CRUSHER_RADIUS = 2.4;
/** How high a crusher hangs over the road. */
export const CRUSHER_HANG = 7;
/** Caught under it: spun out and this much of your speed kept. */
export const CRUSHER_SLOW = 0.4;
export const CRUSHER_SPIN = 1.2;
/** Its shockwave reaches this far past the block, and throws a kart ahead of it on for a boost this long. */
export const SHOCKWAVE_REACH = 3.5;
export const SHOCKWAVE_BOOST = 0.8;
/** A gust gathers (a warning) and then blows over these shares of its cycle. */
export const GUST_STAGES = { gather: 0.5, blow: 0.68 } as const;
/** How hard a gust shoves a kart across the road, m/s (it dies away like a bump). */
export const GUST_SHOVE = 15;
/** Hop as it blows and you catch the wind: a boost this long. */
export const GUST_BOOST = 0.8;
const VESICLE_RADIUS = 1.7;
/** Driven into, a vesicle bounces you back, keeping this much of your speed; hopped onto, it bounces you this high (m/s). */
export const VESICLE_SLOW = 0.55;
export const VESICLE_BOUNCE = 11;
/** A prism beam's four colours each get a quarter of its cycle, lit over this stretch of the quarter. */
export const PRISM_LIT = [0.35, 0.7] as const;
/** The fourth colour is the last quarter's: drive through it lit for a boost this long. */
export const PRISM_BOOST = 0.9;
export const PRISM_SPIN = 1.0;
const WARMING = new Set<HazardKind>(['lasers', 'flameJets']);

/** Throws a grounded kart up at `vy` with a trick window. */
function launch(s: KartState, vy: number): void {
  s.grounded = false;
  s.vy = Math.max(s.vy, vy);
  s.trickWindow = TRICK_WINDOW;
}
const SWIRL_PUSH: Partial<Record<HazardKind, number>> = { dustDevils: DEVIL_PUSH, butterflies: BUTTERFLY_PUSH, tornadoes: TORNADO_PUSH, blackHoles: HOLE_PUSH, wisps: WISP_PUSH };
/** A bolt strikes for this share of the cycle after its warning ring closes. */
export const LIGHTNING_STRIKE = 0.12;
const SPIN: Record<Exclude<HazardKind, 'dustDevils' | 'tumbleweeds' | 'butterflies' | 'tornadoes' | 'wisps'>, number> = {
  snakes: SNAKE_SPIN,
  fish: FISH_SPIN,
  iceBlocks: ICE_BLOCK_SPIN,
  lasers: LASER_SPIN,
  boulders: BOULDER_SPIN,
  lavaBombs: BOULDER_SPIN,
  flameJets: JET_SPIN,
  dragonFire: JET_SPIN,
  oilBombs: BOULDER_SPIN,
  meteors: BOULDER_SPIN,
  hail: BOULDER_SPIN,
  lightning: JET_SPIN,
  blackHoles: HOLE_SPIN,
  vines: VINE_SPIN,
  rollers: ROLLER_SPIN,
  stones: STONE_SPIN,
  gliders: GLIDER_SPIN,
  waves: WAVE_SPIN,
  crystals: ROLLER_SPIN,
  goblins: SNAKE_SPIN,
  jaws: SNAKE_SPIN,
  geysers: JET_SPIN,
  crushers: CRUSHER_SPIN,
  vesicles: ROLLER_SPIN,
  prisms: PRISM_SPIN,
  gusts: 0,
};

/** Kinds that fill the whole road across, on a rhythm: nothing to steer round, only to time. */
export function isSheet(kind: HazardKind): boolean {
  return kind === 'flameJets' || kind === 'dragonFire' || kind === 'lasers' || kind === 'waves' || kind === 'gusts' || kind === 'prisms';
}

/** Which of a prism beam's four colours it is showing at cycle stage `u` (3 is the fourth colour), and whether it is lit. */
export function prismColour(u: number): { colour: number; lit: boolean } {
  const q = u * 4;
  const colour = Math.min(3, Math.floor(q));
  const w = q - colour;
  return { colour, lit: w >= PRISM_LIT[0] && w < PRISM_LIT[1] };
}

/** Kinds that swirl a kart round rather than hitting it. */
function isSwirl(kind: HazardKind): kind is 'dustDevils' | 'butterflies' | 'tornadoes' | 'wisps' {
  return kind === 'dustDevils' || kind === 'butterflies' || kind === 'tornadoes' || kind === 'wisps';
}

/** Kinds that drop from the sky and sit where they land, solid. */
export function isFalling(kind: HazardKind): boolean {
  return kind === 'boulders' || kind === 'lavaBombs' || kind === 'oilBombs' || kind === 'meteors' || kind === 'hail' || kind === 'gliders';
}

/** Boulder cycle stages, as fractions of the period. */
export const BOULDER_STAGES = { fall: 0.3, land: 0.4, crumble: 0.85 } as const;

/**
 * Track hazards (spec section 7). Every hazard's position is a pure
 * function of race time so they replay identically and can be synced over
 * the network by time alone; only per-kart hit cooldowns are state.
 */
export class HazardSystem {
  readonly poses: HazardPose[] = [];
  private readonly slots: { def: HazardDef; index: number }[] = [];
  private readonly cooldown = new Map<KartState, number>();
  /** Per kart: a hazard used well can't pay out again for this long. */
  private readonly rewarded = new Map<KartState, number>();
  private lastT = 0;

  constructor(private readonly track: Track) {
    for (const def of track.def.hazards) {
      const n = 'at' in def ? def.at.length : def.count;
      for (let i = 0; i < n; i++) {
        this.slots.push({ def, index: i });
        this.poses.push({ kind: def.kind, x: 0, y: 0, z: 0, heading: 0, radius: 0, ground: 0, ax: 0, az: 0, vx: 0, vz: 0, active: false, phase: 0, side: 0 });
      }
    }
    this.update(0);
  }

  /** Moves every hazard to where it is at race time `t`. */
  update(t: number): void {
    const dt = t - this.lastT;
    this.lastT = t;
    this.slots.forEach(({ def, index: i }, k) => {
      const p = this.poses[k];
      const x0 = p.x;
      const z0 = p.z;
      switch (def.kind) {
        case 'snakes':
        case 'rollers':
        case 'iceBlocks':
        case 'stones':
        case 'crystals':
        case 'goblins':
        case 'vesicles': {
          const s = def.from + ((def.to - def.from) * (i + 0.5)) / def.count;
          const roller = def.kind !== 'snakes';
          const size = def.kind === 'iceBlocks' ? ICE_BLOCK_RADIUS : def.kind === 'stones' ? STONE_RADIUS : def.kind === 'goblins' ? GOBLIN_RADIUS : def.kind === 'crystals' ? CRYSTAL_RADIUS : def.kind === 'vesicles' ? VESICLE_RADIUS : ROLLER_RADIUS;
          const hw = this.halfWidth(s) + (roller ? 1 : 2.5);
          const u = (((t + 10) / def.period + i * 0.37) % 1 + 1) % 1;
          // Triangle wave: edge to edge at a steady pace, then back.
          const lat = hw * (1 - 4 * Math.abs(u - 0.5));
          this.place(p, s, lat, roller ? size : 0);
          const dir = u < 0.5 ? -1 : 1; // lateral direction of travel
          p.heading = p.heading + (dir * Math.PI) / 2;
          p.radius = roller ? size : SNAKE_RADIUS;
          p.active = true;
          // Snakes: slither phase. Rollers: roll angle (distance over radius). Ice slides.
          p.phase = roller ? (lat + hw) / size : t * 9 + i;
          break;
        }
        case 'fish': {
          // Out of the water on one side, over the road, back in on the other; the next leap comes back.
          const tt = (t + 10) / def.period + i * 0.29;
          const cycle = Math.floor(tt);
          const jump = (tt - cycle) / FISH_AIR;
          const s = def.from + ((def.to - def.from) * (i + 0.5)) / def.count + Math.sin(cycle * 1.7 + i) * 6;
          const hw = this.halfWidth(s) + 3;
          const dir = cycle % 2 === 0 ? 1 : -1;
          const air = jump < 1;
          const lat = dir * hw * (air ? 2 * jump - 1 : 1);
          this.place(p, s, lat, air ? 0.5 + FISH_HEIGHT * 4 * jump * (1 - jump) : -2);
          p.heading -= (dir * Math.PI) / 2;
          p.radius = FISH_RADIUS;
          p.active = air;
          p.phase = air ? jump : -1;
          break;
        }
        case 'vines': {
          const at = def.at[i];
          const hw = this.halfWidth(at);
          const swing = Math.sin(((t + 10) / def.period) * Math.PI * 2 + i * 1.9);
          this.place(p, at, hw * 0.85 * swing, 1.1);
          p.radius = VINE_RADIUS;
          p.active = true;
          p.phase = swing;
          break;
        }
        case 'flameJets':
        case 'dragonFire':
        case 'lasers':
        case 'waves': {
          const at = def.at[i];
          this.place(p, at, 0, 0);
          const u = (((t + 10) / def.period + i * 0.31) % 1 + 1) % 1;
          p.radius = this.halfWidth(at) + 1;
          p.active = u >= JET_STAGES.fire;
          p.phase = u;
          break;
        }
        case 'gusts': {
          // Gathering at one edge (the warning), then blowing right across to the other; the next blows back.
          const at = def.at[i];
          this.place(p, at, 0, 0);
          const tt = (t + 10) / def.period + i * 0.31;
          const cycle = Math.floor(tt);
          const u = tt - cycle;
          p.radius = this.halfWidth(at) + 1;
          p.active = u >= GUST_STAGES.blow;
          p.phase = u;
          p.side = cycle % 2 === 0 ? 1 : -1;
          break;
        }
        case 'prisms': {
          const at = def.at[i];
          this.place(p, at, 0, 0);
          const u = (((t + 10) / def.period + i * 0.37) % 1 + 1) % 1;
          const { colour, lit } = prismColour(u);
          p.radius = this.halfWidth(at) + 1;
          // Red, green and blue hurt; the fourth colour is a boost (collide pays it out).
          p.active = lit;
          p.side = colour === 3 ? 1 : 0;
          p.phase = u;
          break;
        }
        case 'crushers': {
          // Masonry hanging over the road, alternating sides, shaking loose, then slamming down and hauling back up.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.42 * ((cycle + i) % 2 === 0 ? 1 : -1);
          const C = CRUSHER_STAGES;
          let lift = CRUSHER_HANG;
          if (u >= C.slam && u < C.landed) lift = CRUSHER_HANG * (1 - ((u - C.slam) / (C.landed - C.slam)) ** 2);
          else if (u >= C.landed && u < C.rise) lift = 0;
          else if (u >= C.rise) lift = CRUSHER_HANG * Math.min(1, (u - C.rise) / (1 - C.rise) * 1.5);
          this.place(p, at, lat, lift);
          p.radius = CRUSHER_RADIUS;
          p.active = u >= C.slam && u < C.rise;
          p.phase = u;
          break;
        }
        case 'dustDevils':
        case 'butterflies':
        case 'tornadoes':
        case 'blackHoles':
        case 'wisps': {
          const s = def.from + (def.to - def.from) * (0.5 + 0.45 * Math.sin(t * 0.11 * (1 + i * 0.4) + i * 2.1));
          const lat = this.halfWidth(s) * 0.7 * Math.sin(t * 0.33 + i * 1.7);
          this.place(p, s, lat, def.kind === 'blackHoles' ? 1.2 : def.kind === 'wisps' ? 1 : 0);
          p.radius = { dustDevils: DEVIL_RADIUS, butterflies: BUTTERFLY_RADIUS, tornadoes: TORNADO_RADIUS, blackHoles: HOLE_RADIUS, wisps: WISP_RADIUS }[def.kind];
          p.active = true;
          p.phase = t * 7;
          break;
        }
        case 'tumbleweeds': {
          const len = def.to - def.from;
          const s = def.to - ((t * TUMBLEWEED_SPEED + (i * len) / def.count) % len);
          const lat = this.halfWidth(s) * 0.6 * Math.sin(t * 0.8 + i * 2.3);
          const bounce = Math.abs(Math.sin(t * 3.4 + i)) * 1.6;
          this.place(p, s, lat, TUMBLEWEED_RADIUS + bounce);
          p.heading += Math.PI; // rolling against the traffic
          p.radius = TUMBLEWEED_RADIUS;
          p.active = true;
          p.phase = bounce;
          break;
        }
        case 'jaws': {
          // A fin circles off one edge of the road (the warning), then the pliosaur lunges over that edge and snaps.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const side = cycle % 2 === 0 ? 1 : -1;
          const hw = this.halfWidth(at);
          const lunge = u >= BOULDER_STAGES.land ? Math.min(1, (u - BOULDER_STAGES.land) / JAWS_LUNGE) : 0;
          // Out in the water while it circles; across the road's edge as it lunges.
          this.place(p, at, side * (hw + 6 - lunge * (6 + hw * 0.45)), 0);
          p.heading -= (side * Math.PI) / 2;
          p.radius = JAWS_RADIUS;
          // Biting once it's halfway over the edge.
          p.active = u >= BOULDER_STAGES.land + JAWS_LUNGE * 0.5 && u < BOULDER_STAGES.land + JAWS_LUNGE * 1.4;
          p.phase = u;
          break;
        }
        case 'geysers': {
          // Bubbling over the warning, then a column of water for a moment.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.5 * Math.sin(cycle * 1.97 + i * 2.1);
          this.place(p, at, lat, 0);
          p.radius = GEYSER_RADIUS;
          p.active = u >= BOULDER_STAGES.land && u < BOULDER_STAGES.land + GEYSER_ERUPT;
          p.phase = u;
          break;
        }
        case 'lightning': {
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.6 * Math.sin(cycle * 2.39 + i * 1.3);
          this.place(p, at, lat, 0);
          p.radius = LIGHTNING_RADIUS;
          // The warning ring closes over the fall; the bolt hits as it lands.
          p.active = u >= BOULDER_STAGES.land && u < BOULDER_STAGES.land + LIGHTNING_STRIKE;
          p.phase = u;
          break;
        }
        case 'boulders':
        case 'lavaBombs':
        case 'oilBombs':
        case 'meteors':
        case 'hail':
        case 'gliders': {
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.55 * Math.sin(cycle * 2.39 + i * 1.3);
          let lift = 0;
          if (u < BOULDER_STAGES.fall) lift = BOULDER_DROP;
          else if (u < BOULDER_STAGES.land) lift = BOULDER_DROP * (1 - ((u - BOULDER_STAGES.fall) / (BOULDER_STAGES.land - BOULDER_STAGES.fall)) ** 2);
          else if (u > BOULDER_STAGES.crumble) lift = -BOULDER_RADIUS * 2 * ((u - BOULDER_STAGES.crumble) / (1 - BOULDER_STAGES.crumble));
          this.place(p, at, lat, BOULDER_RADIUS + lift);
          p.radius = BOULDER_RADIUS;
          // Dangerous from just before it lands until it starts to crumble.
          p.active = u > BOULDER_STAGES.land - 0.02 && u < BOULDER_STAGES.crumble;
          p.phase = u;
          break;
        }
      }
      const fresh = dt > 0 && dt < 0.5;
      p.vx = fresh ? (p.x - x0) / dt : 0;
      p.vz = fresh ? (p.z - z0) / dt : 0;
    });
  }

  /**
   * Hits karts touching an active hazard. Returns the karts that got hit
   * (spun or slowed) and by what; `good` marks a hazard used well, which
   * helps rather than hurts (see the reward rules above).
   */
  collide(karts: readonly KartState[], dt: number): { kart: KartState; by: HazardKind; good?: boolean }[] {
    const hit: { kart: KartState; by: HazardKind; good?: boolean }[] = [];
    for (const map of [this.cooldown, this.rewarded]) {
      for (const [k, v] of map) {
        if (v - dt <= 0) map.delete(k);
        else map.set(k, v - dt);
      }
    }
    for (const s of karts) {
      for (const p of this.poses) {
        if (Math.abs(s.y - p.ground) > 2.2) continue;
        // A gate warming up is a gap to slip through, and a boost for making it.
        if (WARMING.has(p.kind) && !p.active) {
          if (p.phase >= JET_STAGES.sputter && this.distance(p, s) <= p.radius + KART_RADIUS) this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, GATE_BOOST)));
          continue;
        }
        if (p.kind === 'crushers') {
          this.crush(hit, p, s);
          continue;
        }
        if (!p.active) continue;
        const d = this.distance(p, s);
        if (d > p.radius + KART_RADIUS) continue;
        if (isSwirl(p.kind)) {
          this.swirl(p, s, dt);
          if (p.kind === 'wisps' && d < WISP_CORE + KART_RADIUS) {
            // Right through the middle of the ghost lights: they carry you.
            this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, WISP_BOOST)));
          } else if ((p.kind === 'dustDevils' || p.kind === 'tornadoes') && s.hopAge < UPDRAFT_HOP) {
            // Hop in the wind and it throws you up: airtime and a trick.
            this.reward(hit, s, p.kind, () => launch(s, p.kind === 'tornadoes' ? TORNADO_LIFT : DEVIL_LIFT));
          } else if (p.kind === 'butterflies' && s.driftDir !== 0) {
            // Drifting on the wings of the swarm charges the sparks faster.
            s.driftCharge += dt * WING_CHARGE;
            this.reward(hit, s, p.kind, () => {});
          }
          continue;
        }
        // Something that has come down is a ramp to fly off, hopped onto; driven into, it's as solid as a boulder.
        if (RAMPS.has(p.kind) && p.phase >= BOULDER_STAGES.land && s.hopAge < HOP_WINDOW) {
          this.reward(hit, s, p.kind, () => launch(s, RAMP_LAUNCH));
          continue;
        }
        if (p.kind === 'blackHoles') {
          this.swirl(p, s, dt);
          // Skim the edge on a boost: a gravity assist, the boost running on.
          if (s.boostTime > 0 && d > HOLE_CORE + KART_RADIUS) {
            s.boostTime += dt * GRAVITY_ASSIST;
            this.reward(hit, s, p.kind, () => {});
          }
          if (d > HOLE_CORE + KART_RADIUS) continue;
        }
        if (p.kind === 'gusts') {
          // Hop as it blows and you catch the wind; otherwise it shoves you across the road, once a gust.
          if (s.hopAge < HOP_WINDOW || !s.grounded) this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, GUST_BOOST)));
          else if (!this.cooldown.has(s)) {
            this.cooldown.set(s, HIT_COOLDOWN);
            const rx = -Math.cos(p.heading);
            const rz = Math.sin(p.heading);
            s.extX += rx * p.side * GUST_SHOVE;
            s.extZ += rz * p.side * GUST_SHOVE;
            hit.push({ kart: s, by: p.kind });
          }
          continue;
        }
        if (p.kind === 'prisms' && p.side === 1) {
          // The fourth colour: a boost.
          this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, PRISM_BOOST)));
          continue;
        }
        if (p.kind === 'vesicles') {
          // Hopped onto, it bounces you up high; driven into, it bounces you back.
          if (s.hopAge < HOP_WINDOW || !s.grounded) {
            this.reward(hit, s, p.kind, () => launch(s, VESICLE_BOUNCE));
            continue;
          }
          this.pushOut(p, s);
          if (this.cooldown.has(s)) continue;
          this.cooldown.set(s, HIT_COOLDOWN);
          s.speed *= VESICLE_SLOW;
          s.vy = Math.max(s.vy, 3);
          hit.push({ kart: s, by: p.kind });
          continue;
        }
        if (p.kind === 'geysers') {
          // An eruption throws you up whatever you do: hopped onto, you ride it high on a boost; caught, it costs you speed.
          // (Not one it has just thrown: that kart is in the air too.)
          if ((s.hopAge < HOP_WINDOW || !s.grounded) && !this.cooldown.has(s)) {
            this.reward(hit, s, p.kind, () => {
              launch(s, GEYSER_RIDE);
              s.boostTime = Math.max(s.boostTime, HOP_BOOST);
            });
          } else if (!this.cooldown.has(s)) {
            this.cooldown.set(s, HIT_COOLDOWN);
            launch(s, GEYSER_THROW);
            s.speed *= GEYSER_SLOW;
            hit.push({ kart: s, by: p.kind });
          }
          continue;
        }
        // Rammed on a boost it gives way and the boost runs on; hopped as it comes, it's ridden.
        const rammed = RAMMABLE.has(p.kind) && s.boostTime > 0;
        const hopped = HOPPABLE.has(p.kind) && (!s.grounded || s.hopAge < HOP_WINDOW);
        if (rammed || hopped) {
          this.reward(hit, s, p.kind, () => (rammed ? (s.boostTime += RAM_BOOST) : (s.boostTime = Math.max(s.boostTime, p.kind === 'waves' ? WAVE_SURF : HOP_BOOST))));
          continue;
        }
        if (isFalling(p.kind)) this.pushOut(p, s);
        if (this.cooldown.has(s)) continue;
        this.cooldown.set(s, HIT_COOLDOWN);
        if (p.kind === 'tumbleweeds') {
          s.speed *= TUMBLEWEED_SLOW;
          s.vy = Math.max(s.vy, 2.5);
          hit.push({ kart: s, by: p.kind });
        } else if (spinOut(s, SPIN[p.kind])) {
          hit.push({ kart: s, by: p.kind });
        }
      }
    }
    return hit;
  }

  /** Circles for CPU avoidance, including boulders about to land. */
  obstacles(out: { x: number; z: number; r: number; vx: number; vz: number }[]): void {
    for (const p of this.poses) {
      if (isSheet(p.kind)) continue; // the whole road: nothing to steer around
      const falling = isFalling(p.kind);
      if (p.kind === 'lightning' || p.kind === 'geysers' || p.kind === 'jaws') {
        if (p.phase < BOULDER_STAGES.fall * 0.5 || p.phase > BOULDER_STAGES.land + LIGHTNING_STRIKE) continue;
      } else if (p.kind === 'crushers') {
        // From when it starts shaking loose until it is hauled back up out of the way.
        if (p.phase < CRUSHER_STAGES.shake || p.phase > CRUSHER_STAGES.rise + 0.05) continue;
      } else if (falling ? p.phase > BOULDER_STAGES.crumble || p.phase < BOULDER_STAGES.fall * 0.5 : !p.active) continue;
      if (p.kind === 'snakes') {
        // The body trails the head: aim to miss its middle.
        const bx = -Math.sin(p.heading) * SNAKE_LENGTH * 0.5;
        const bz = -Math.cos(p.heading) * SNAKE_LENGTH * 0.5;
        out.push({ x: p.x + bx, z: p.z + bz, r: SNAKE_LENGTH * 0.5 + SNAKE_RADIUS, vx: p.vx, vz: p.vz });
      } else {
        out.push({ x: p.x, z: p.z, r: p.radius, vx: p.vx, vz: p.vz });
      }
    }
  }

  /**
   * A crusher: caught under it as it slams, you're squashed; just ahead of
   * it, its shockwave throws you on; once it's down it's a block to drive round.
   */
  private crush(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active) return;
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    const C = CRUSHER_STAGES;
    const slamming = p.phase >= C.slam && p.phase < C.landed + 0.02;
    if (d <= p.radius + KART_RADIUS) {
      if (!slamming) {
        this.pushOut(p, s);
        return;
      }
      if (this.cooldown.has(s)) return;
      this.cooldown.set(s, HIT_COOLDOWN);
      if (spinOut(s, CRUSHER_SPIN)) {
        s.speed *= CRUSHER_SLOW;
        hit.push({ kart: s, by: p.kind });
      }
      return;
    }
    // The shockwave, as it lands: only for a kart past it, going away.
    const ahead = (s.x - p.x) * Math.sin(p.heading) + (s.z - p.z) * Math.cos(p.heading) > 0;
    if (p.phase >= C.landed - 0.01 && p.phase < C.landed + 0.03 && ahead && d <= p.radius + KART_RADIUS + SHOCKWAVE_REACH) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, SHOCKWAVE_BOOST)));
    }
  }

  /** Pays a kart for using a hazard well, once in a while. */
  private reward(hit: { kart: KartState; by: HazardKind; good?: boolean }[], s: KartState, by: HazardKind, pay: () => void): void {
    if (this.rewarded.has(s)) return;
    this.rewarded.set(s, REWARD_COOLDOWN);
    pay();
    hit.push({ kart: s, by, good: true });
  }

  private place(p: HazardPose, builderS: number, lateral: number, lift: number): void {
    const s = this.track.mainS(builderS);
    const a = pointAt(this.track.spline, s);
    const tl = Math.hypot(a.tx, a.tz) || 1;
    p.x = a.x - (a.tz / tl) * lateral;
    p.z = a.z + (a.tx / tl) * lateral;
    const L = this.track.length;
    p.ground = this.track.main.heightAt(((s % L) + L) % L);
    p.ax = a.x;
    p.az = a.z;
    p.y = p.ground + lift;
    p.heading = Math.atan2(a.tx, a.tz);
  }

  private halfWidth(builderS: number): number {
    return this.track.main.halfWidthAtS(this.track.mainS(builderS));
  }

  /**
   * Snakes are a short segment trailing behind the head; a flame jet is a
   * thin sheet across the road; everything else is a circle.
   */
  private distance(p: HazardPose, s: KartState): number {
    if (isSheet(p.kind)) {
      const fx = Math.sin(p.heading);
      const fz = Math.cos(p.heading);
      const along = Math.abs((s.x - p.x) * fx + (s.z - p.z) * fz);
      const across = Math.abs((s.x - p.x) * -fz + (s.z - p.z) * fx);
      // Inside the sheet counts as touching; the radius is the half-width.
      return along < JET_DEPTH + KART_RADIUS ? across - KART_RADIUS : Infinity;
    }
    if (p.kind !== 'snakes') return Math.hypot(s.x - p.x, s.z - p.z);
    const bx = -Math.sin(p.heading);
    const bz = -Math.cos(p.heading);
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const along = Math.max(0, Math.min(SNAKE_LENGTH, dx * bx + dz * bz));
    return Math.hypot(dx - bx * along, dz - bz * along);
  }

  private swirl(p: HazardPose, s: KartState, dt: number): void {
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    // Mostly around (counterclockwise from above), a little outward; a black hole pulls in instead.
    const push = (SWIRL_PUSH[p.kind] ?? DEVIL_PUSH) * dt;
    const out = p.kind === 'blackHoles' ? -0.45 : 0.5;
    s.extX += ((-dz / d) * 0.85 + (dx / d) * out) * push;
    s.extZ += ((dx / d) * 0.85 + (dz / d) * out) * push;
  }

  private pushOut(p: HazardPose, s: KartState): void {
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const r = p.radius + KART_RADIUS;
    if (d >= r) return;
    s.x = p.x + (dx / d) * r;
    s.z = p.z + (dz / d) * r;
  }
}
