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
   * An airlock's opening: half the width between its two doors, centred on
   * the pose. Cellophane: how far each sheet is from the pose, signed (the
   * first sheet is at -gap, the second at +gap). 0 for the rest.
   */
  gap: number;
  /** A row of arrows: the lane with no arrow in it, 0 (leftmost) to 3. -1 for the rest. */
  lane: number;
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
 * - a robot stopped dead in the road is a ramp, hopped onto
 * - the gamma knife's crosshair, slipped through as it closes, is a boost
 * - hop as a vulture swoops and it carries you: up, and on with a boost
 * - a wah pedal stamped flat is a springboard, hopped onto: up high, with a boost
 * - hop into a bank of smog and its heat carries you up; blast through it on a boost and the boost runs on
 * - an airlock's slit, slipped through while the doors are shut to it, is a boost
 * - drive under a solar flare while it arches high over the road and its wind is a boost
 * - hopped, a swarm of rats is cleared for a boost; rammed on a boost they scatter and the boost runs on
 * - the half of the road an eye's arrow points to, as it reads your mind, is a boost
 * - the lane of a row of arrows that has no arrow in it, while the rest are lit, is a boost
 * - where two sheets of cellophane line up as they slide past each other, a boost
 * - a patch of fuzz driven through while its needle is in the gold is a boost
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
const RAMMABLE = new Set<HazardKind>(['stones', 'rollers', 'iceBlocks', 'hail', 'oilBombs', 'boulders', 'tumbleweeds', 'crystals', 'rats']);
const HOPPABLE = new Set<HazardKind>(['waves', 'snakes', 'fish', 'goblins', 'jaws', 'rats']);
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
/**
 * Robot cycle: marching in from one edge, stopped dead in the middle of the
 * road (a block, and a ramp if you hop onto it), marching off the other side.
 */
export const ROBOT_STAGES = { stop: 0.38, go: 0.72 } as const;
export const ROBOT_RADIUS = 1.5;
export const ROBOT_SPIN = 1.0;
/** Gamma knife cycle: the beams converge (a crosshair closing, the warning) and then the burst at the focus. */
export const GAMMA_STAGES = { aim: 0.12, fire: 0.6, done: 0.74 } as const;
/** The crosshair is nearly closed from here: slip through it then and the knife misses, a boost. */
export const GAMMA_EDGE = 0.46;
export const GAMMA_RADIUS = 2.4;
export const GAMMA_BOOST = 0.8;
export const GAMMA_SPIN = 1.1;
/** Vulture cycle: circling high (its shadow on the road), the dive, the swoop low along the road, the climb away. */
export const VULTURE_STAGES = { dive: 0.55, swoop: 0.68, climb: 0.82 } as const;
export const VULTURE_RADIUS = 1.8;
/** How high it circles, and how far along the road its swoop runs. */
export const VULTURE_HEIGHT = 16;
export const VULTURE_RUN = 14;
export const VULTURE_SPIN = 1.0;
/** Hop as it swoops and it carries you: thrown up this fast (m/s), with a boost this long. */
export const VULTURE_LIFT = 10;
export const VULTURE_BOOST = 0.8;
/** Wah pedal cycle: toe up (harmless), the stamp, sitting stamped flat (a springboard, hopped onto), rocking back up. */
export const WAH_STAGES = { stamp: 0.5, down: 0.58, rise: 0.85 } as const;
export const WAH_RADIUS = 2.6;
/** How high the toe of the pedal rocks up. */
export const WAH_LIFT = 3.2;
/** Caught under the stamp: spun out and this much of your speed kept. */
export const WAH_SLOW = 0.5;
export const WAH_SPIN = 1.1;
/** Hopped onto stamped flat: a springboard, this fast up (m/s), and a boost this long. */
export const WAH_SPRING = 12;
export const WAH_BOOST = 0.7;
/** Smog cycle: gathering at the stack on one edge (the warning), rolling across the road, thinning away. */
export const SMOG_STAGES = { roll: 0.4, clear: 0.75 } as const;
export const SMOG_RADIUS = 4;
/** Choked in it: this much of your speed kept. */
export const SMOG_SLOW = 0.55;
/** Hop into it and its heat throws you up this fast (m/s), with a trick window. */
export const SMOG_LIFT = 9;
/** Airlock cycle: open, the doors sliding in from both edges, shut to a slit, sliding back open. */
export const AIRLOCK_STAGES = { close: 0.35, shut: 0.55, open: 0.75 } as const;
/** Half the width of the slit left between the doors when they are shut, and how thick the doors are along the road. */
export const AIRLOCK_SLIT = 2.8;
export const AIRLOCK_DEPTH = 0.8;
/** Slipped through the slit while it's shut: a boost this long. Caught by a door: spun out, this much of your speed kept. */
export const AIRLOCK_BOOST = 0.8;
export const AIRLOCK_SPIN = 1.0;
export const AIRLOCK_SLOW = 0.6;
/**
 * Solar flare cycle: quiet, the footpoints glowing at both edges (the
 * warning), a low loop of plasma boiling across the road (it burns), lifting
 * into an arch high over it (drive under for a boost), then crashing back
 * down and splashing across the road (it burns again).
 */
export const FLARE_STAGES = { glow: 0.25, erupt: 0.4, lift: 0.55, arch: 0.6, fall: 0.8, land: 0.86, done: 0.92 } as const;
/** How high the flare arches, how low it boils across the road, and the height under which it burns. */
export const FLARE_HEIGHT = 8;
export const FLARE_LOW = 1.5;
export const FLARE_CLEAR = 3;
export const FLARE_BOOST = 0.9;
export const FLARE_SPIN = 1.1;
/** Rat swarm cycle: eyes in the hole at one edge (the warning), the swarm pouring across, gone. */
export const RAT_STAGES = { pour: 0.4, gone: 0.8 } as const;
/** The swarm is a stream this long across the road, this thick along it. */
export const RAT_LENGTH = 7;
export const RAT_RADIUS = 1.1;
export const RAT_SPIN = 1.0;
/**
 * Eye cycle: shut, opening over the road, an arrow flashing in it (the
 * warning: it points to the half of the road that's safe), then it reads
 * your mind and blasts the other half.
 */
export const EYE_STAGES = { open: 0.22, show: 0.34, read: 0.62, done: 0.76 } as const;
/** How far along the road the blast reaches either side of the eye, and how high the eye floats. */
export const EYE_DEPTH = 1.6;
export const EYE_HEIGHT = 4.6;
/** On the half the arrow points to as it reads: a boost this long. On the other half: spun out. */
export const EYE_BOOST = 0.8;
export const EYE_SPIN = 1.0;
/** Arrow row cycle: dark, three of the four arrows flickering on (the warning), lit (they zap), dark again. */
export const ARROW_STAGES = { show: 0.3, lit: 0.48, off: 0.76 } as const;
/** The row has four lanes across the road; it's this thick along it. */
export const ARROW_LANES = 4;
export const ARROW_DEPTH = 1;
/** Through the lane with no arrow while the rest are lit: a boost this long. Zapped: spun out, this much of your speed kept. */
export const ARROW_BOOST = 0.8;
export const ARROW_SPIN = 1.0;
export const ARROW_SLOW = 0.7;
/** Cellophane cycle: rolled at both edges (the warning), the two sheets sliding past each other right across the road, gone. */
export const SHEET_STAGES = { slide: 0.2, gone: 0.85 } as const;
/** Each sheet is this wide across the road (half of it), this thick along it. */
export const SHEET_HALF = 3;
export const SHEET_DEPTH = 0.7;
/** Wrapped in one sheet: this much of your speed kept. Through where they overlap: a boost this long. */
export const SHEET_SLOW = 0.5;
export const SHEET_BOOST = 0.9;
/**
 * Fuzz patch cycle: the needle rising (harmless), in the gold (a boost to
 * drive through), into the red (it clips: you're spun out), dying away.
 */
export const FUZZ_STAGES = { gold: 0.34, red: 0.54, fade: 0.74 } as const;
export const FUZZ_RADIUS = 3.2;
export const FUZZ_GOLD_BOOST = 0.9;
export const FUZZ_SPIN = 1.1;
export const FUZZ_SLOW = 0.7;

/** Where a patch of fuzz's needle stands at cycle stage `u`: 0 at rest, the gold band from 0.55 to 0.8, the red above. */
export function fuzzLevel(u: number): number {
  const F = FUZZ_STAGES;
  if (u < F.gold) return 0.55 * (u / F.gold);
  if (u < F.red) return 0.55 + (0.25 * (u - F.gold)) / (F.red - F.gold);
  if (u < F.fade) return 0.8 + 0.2 * Math.sin((Math.PI * (u - F.red)) / (F.fade - F.red));
  return 0.8 * (1 - (u - F.fade) / (1 - F.fade));
}

/** How high a solar flare's arch stands over the road at cycle stage `u`. */
export function flareHeight(u: number): number {
  const F = FLARE_STAGES;
  if (u < F.erupt || u >= F.done) return 0;
  if (u < F.lift) return FLARE_LOW;
  if (u < F.arch) return FLARE_LOW + ((FLARE_HEIGHT - FLARE_LOW) * (u - F.lift)) / (F.arch - F.lift);
  if (u < F.fall) return FLARE_HEIGHT;
  if (u < F.land) return FLARE_HEIGHT * (1 - ((u - F.fall) / (F.land - F.fall)) ** 2);
  return 0;
}

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
  robots: ROBOT_SPIN,
  gammaRays: GAMMA_SPIN,
  vultures: VULTURE_SPIN,
  wahs: WAH_SPIN,
  smog: 0,
  airlocks: AIRLOCK_SPIN,
  flares: FLARE_SPIN,
  rats: RAT_SPIN,
  eyes: EYE_SPIN,
  arrows: ARROW_SPIN,
  sheets: 0,
  fuzz: FUZZ_SPIN,
};

/** Kinds that fill the whole road across, on a rhythm: nothing to steer round, only to time. */
export function isSheet(kind: HazardKind): boolean {
  return kind === 'flameJets' || kind === 'dragonFire' || kind === 'lasers' || kind === 'waves' || kind === 'gusts' || kind === 'prisms' || kind === 'flares';
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
        this.poses.push({ kind: def.kind, x: 0, y: 0, z: 0, heading: 0, radius: 0, ground: 0, ax: 0, az: 0, vx: 0, vz: 0, active: false, phase: 0, side: 0, gap: 0, lane: -1 });
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
        case 'robots': {
          // Marching in from one edge, stopping dead in the middle of the road, marching off the other side; the next crossing comes back.
          const at = def.at[i];
          const tt = (t + 10) / def.period + i * 0.31;
          const cycle = Math.floor(tt);
          const u = tt - cycle;
          const side = cycle % 2 === 0 ? 1 : -1;
          const hw = this.halfWidth(at) + 1;
          const R = ROBOT_STAGES;
          const stopped = u >= R.stop && u < R.go;
          const walk = u < R.stop ? u / R.stop : u >= R.go ? (u - R.go) / (1 - R.go) : 0;
          // Halfway across while stopped (a little off centre, by the crossing); the rest of the way after.
          const pause = 0.15 * Math.sin(cycle * 1.9 + i);
          const lat = u < R.stop ? side * (hw - (hw + pause * hw) * walk) : stopped ? -side * pause * hw : -side * (pause * hw + (hw - pause * hw) * walk);
          this.place(p, at, lat, 0);
          p.heading = stopped ? p.heading : p.heading + (side * Math.PI) / 2;
          p.radius = ROBOT_RADIUS;
          p.active = true;
          p.side = side;
          p.phase = u;
          break;
        }
        case 'gammaRays': {
          // The beams converge on a point (the crosshair closing: the warning), then the burst at the focus.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.55 * Math.sin(cycle * 2.39 + i * 1.3);
          this.place(p, at, lat, 0);
          p.radius = GAMMA_RADIUS;
          p.active = u >= GAMMA_STAGES.fire && u < GAMMA_STAGES.done;
          p.phase = u;
          break;
        }
        case 'vultures': {
          // Circling high over one spot (its shadow on the road), the dive, a swoop low along the road, and the climb away.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.5 * Math.sin(cycle * 1.97 + i * 2.1);
          const V = VULTURE_STAGES;
          let along = -VULTURE_RUN / 2;
          let lift = VULTURE_HEIGHT;
          if (u >= V.dive && u < V.swoop) {
            const d = (u - V.dive) / (V.swoop - V.dive);
            along = -VULTURE_RUN / 2 - 10 * (1 - d);
            lift = 1.2 + (VULTURE_HEIGHT - 1.2) * (1 - d) ** 2;
          } else if (u >= V.swoop && u < V.climb) {
            along = -VULTURE_RUN / 2 + (VULTURE_RUN * (u - V.swoop)) / (V.climb - V.swoop);
            lift = 1.2;
          } else if (u >= V.climb) {
            const c = (u - V.climb) / (1 - V.climb);
            along = VULTURE_RUN / 2 + 10 * c;
            lift = 1.2 + (VULTURE_HEIGHT - 1.2) * c * c;
          }
          this.place(p, at + along, lat, lift);
          p.radius = VULTURE_RADIUS;
          p.active = u >= V.swoop && u < V.climb;
          p.phase = u;
          break;
        }
        case 'wahs': {
          // A pedal on the road, alternating sides: toe up, the stamp, stamped flat, and rocking back up.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.4 * ((cycle + i) % 2 === 0 ? 1 : -1);
          this.place(p, at, lat, 0);
          p.radius = WAH_RADIUS;
          const W = WAH_STAGES;
          p.active = u >= W.stamp && u < W.rise;
          p.phase = u;
          break;
        }
        case 'smog': {
          // Belched out at one edge (gathering there: the warning), rolling across the road, thinning away; the next comes from the other side.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const side = (cycle + i) % 2 === 0 ? 1 : -1;
          // Just inside the edge, so it can be seen gathering between walls.
          const hw = this.halfWidth(at) - 1;
          const S = SMOG_STAGES;
          const k = u < S.roll ? 0 : u < S.clear ? (u - S.roll) / (S.clear - S.roll) : 1;
          this.place(p, at, side * hw * (1 - 2 * k), 1);
          p.radius = SMOG_RADIUS;
          p.active = u >= S.roll && u < S.clear;
          p.side = side;
          p.phase = u;
          break;
        }
        case 'airlocks': {
          // Two doors sliding in from the edges to a slit, holding it, and sliding back; where they meet moves from one closing to the next.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const hw = this.halfWidth(at);
          const A = AIRLOCK_STAGES;
          const c = hw * 0.45 * Math.sin(cycle * 2.13 + i * 1.7);
          let k = 0;
          if (u >= A.close && u < A.shut) k = (u - A.close) / (A.shut - A.close);
          else if (u >= A.shut && u < A.open) k = 1;
          else if (u >= A.open) k = Math.max(0, 1 - ((u - A.open) / (1 - A.open)) * 1.6);
          // Open, both doors stand back past the road's edges.
          const full = hw + 1 + Math.abs(c);
          this.place(p, at, c, 0);
          p.gap = full + (AIRLOCK_SLIT - full) * k * k * (3 - 2 * k);
          p.radius = hw + 1;
          p.active = k > 0;
          p.phase = u;
          break;
        }
        case 'flares': {
          // The whole road across: a loop of plasma boiling across it, lifting into an arch, crashing down.
          const at = def.at[i];
          this.place(p, at, 0, 0);
          const u = (((t + 10) / def.period + i * 0.37) % 1 + 1) % 1;
          const up = u >= FLARE_STAGES.erupt && u < FLARE_STAGES.done;
          const h = flareHeight(u);
          p.radius = this.halfWidth(at) + 1;
          // Low, it burns; arched high, it's a boost to drive under (collide pays it out).
          p.active = up && h < FLARE_CLEAR;
          p.side = up && h >= FLARE_CLEAR ? 1 : 0;
          p.phase = u;
          break;
        }
        case 'rats': {
          // Eyes in a hole at one edge (the warning), then the swarm pours out and streams right across and off the other side.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const side = (cycle + i) % 2 === 0 ? 1 : -1;
          const hw = this.halfWidth(at) + 2;
          const R = RAT_STAGES;
          const k = u < R.pour ? 0 : u < R.gone ? (u - R.pour) / (R.gone - R.pour) : 1;
          this.place(p, at, side * (hw - k * (2 * hw + RAT_LENGTH)), 0);
          // Heading the way the swarm runs; the stream trails behind the lead rat.
          p.heading += (side * Math.PI) / 2;
          p.radius = RAT_RADIUS;
          p.active = u >= R.pour && u < R.gone;
          p.side = side;
          p.phase = u;
          break;
        }
        case 'eyes': {
          // An eye opening over the road, an arrow in it pointing to one half; then it reads your mind and blasts the other half.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          this.place(p, at, 0, 0);
          p.radius = this.halfWidth(at) + 1;
          // Which half is safe changes from one reading to the next, but not so you can learn it.
          p.side = Math.sin(cycle * 2.71 + i * 1.3) >= 0 ? 1 : -1;
          p.active = u >= EYE_STAGES.read && u < EYE_STAGES.done;
          p.phase = u;
          break;
        }
        case 'arrows': {
          // Four arrows across the road: three flicker on and blaze, one isn't there, a different one each time.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          this.place(p, at, 0, 0);
          p.radius = this.halfWidth(at);
          p.lane = Math.floor((Math.sin(cycle * 12.9898 + i * 78.233) * 43758.5453 % 1 + 1) % 1 * ARROW_LANES);
          p.active = u >= ARROW_STAGES.lit && u < ARROW_STAGES.off;
          p.phase = u;
          break;
        }
        case 'sheets': {
          // Two sheets of cellophane sliding in from opposite edges, past each other, and off; where they cross moves each time.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const hw = this.halfWidth(at);
          const c = hw * 0.4 * Math.sin(cycle * 1.93 + i * 2.3);
          const S = SHEET_STAGES;
          const k = u < S.slide ? 0 : u < S.gone ? (u - S.slide) / (S.gone - S.slide) : 1;
          // Rolled up just past both edges, and off past them again.
          const full = hw + SHEET_HALF + 1 + Math.abs(c);
          this.place(p, at, c, 0);
          p.gap = full * (1 - 2 * k);
          p.radius = hw + 1;
          p.active = u >= S.slide && u < S.gone;
          p.phase = u;
          break;
        }
        case 'fuzz': {
          // A patch of fuzz on the road, alternating sides, its needle rising into the gold and on into the red.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.4 * ((cycle + i) % 2 === 0 ? 1 : -1);
          this.place(p, at, lat, 0);
          p.radius = FUZZ_RADIUS;
          p.active = u >= FUZZ_STAGES.red && u < FUZZ_STAGES.fade;
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
        if (p.kind === 'airlocks') {
          this.airlock(hit, p, s);
          continue;
        }
        if (p.kind === 'eyes') {
          this.eye(hit, p, s);
          continue;
        }
        if (p.kind === 'arrows') {
          this.arrowRow(hit, p, s);
          continue;
        }
        if (p.kind === 'sheets') {
          this.cellophane(hit, p, s);
          continue;
        }
        if (p.kind === 'fuzz' && p.phase >= FUZZ_STAGES.gold && p.phase < FUZZ_STAGES.red) {
          // The needle in the gold: ride the fuzz, a boost.
          if (this.distance(p, s) <= p.radius + KART_RADIUS) this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, FUZZ_GOLD_BOOST)));
          continue;
        }
        if (p.kind === 'gammaRays' && !p.active) {
          // The crosshair nearly closed: slip through it and the knife misses, a boost.
          if (p.phase >= GAMMA_EDGE && p.phase < GAMMA_STAGES.fire && this.distance(p, s) <= p.radius + KART_RADIUS) this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, GAMMA_BOOST)));
          continue;
        }
        if (p.kind === 'flares' && p.side === 1) {
          // Arched high overhead: under it, the solar wind is a boost.
          if (this.distance(p, s) <= p.radius + KART_RADIUS) this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, FLARE_BOOST)));
          continue;
        }
        if (!p.active) continue;
        const d = this.distance(p, s);
        if (d > p.radius + KART_RADIUS) continue;
        if (p.kind === 'robots') {
          // Stopped dead, it is a block to drive round and a ramp to hop onto; marching, it walks straight into you.
          if (p.phase >= ROBOT_STAGES.stop && p.phase < ROBOT_STAGES.go) {
            if (s.hopAge < HOP_WINDOW || !s.grounded) this.reward(hit, s, p.kind, () => launch(s, RAMP_LAUNCH));
            else this.pushOut(p, s);
            continue;
          }
        }
        if (p.kind === 'vultures') {
          // Hop as it swoops and it carries you: up, and on with a boost. Caught flat, it knocks you flying.
          if (s.hopAge < HOP_WINDOW || !s.grounded) {
            this.reward(hit, s, p.kind, () => {
              launch(s, VULTURE_LIFT);
              s.boostTime = Math.max(s.boostTime, VULTURE_BOOST);
            });
            continue;
          }
        }
        if (p.kind === 'wahs') {
          const W = WAH_STAGES;
          if (p.phase >= W.down) {
            // Stamped flat: a springboard, hopped onto; otherwise a pedal to drive round, or up and over as it rocks back.
            if (s.hopAge < HOP_WINDOW || !s.grounded) {
              this.reward(hit, s, p.kind, () => {
                launch(s, WAH_SPRING);
                s.boostTime = Math.max(s.boostTime, WAH_BOOST);
              });
            } else if (p.phase < W.rise) this.pushOut(p, s);
            continue;
          }
          // The stamp: squashed.
          if (this.cooldown.has(s)) continue;
          this.cooldown.set(s, HIT_COOLDOWN);
          if (spinOut(s, WAH_SPIN)) {
            s.speed *= WAH_SLOW;
            hit.push({ kart: s, by: p.kind });
          }
          continue;
        }
        if (p.kind === 'smog') {
          // Hop into it and its heat carries you up; blast through it on a boost and the boost runs on; otherwise it chokes you.
          if (s.hopAge < HOP_WINDOW || !s.grounded) {
            this.reward(hit, s, p.kind, () => launch(s, SMOG_LIFT));
            continue;
          }
          if (s.boostTime > 0) {
            this.reward(hit, s, p.kind, () => (s.boostTime += RAM_BOOST));
            continue;
          }
          if (this.cooldown.has(s)) continue;
          this.cooldown.set(s, HIT_COOLDOWN);
          s.speed *= SMOG_SLOW;
          hit.push({ kart: s, by: p.kind });
          continue;
        }
        if (p.kind === 'fuzz') {
          // Into the red: it clips, and you're spun out.
          if (this.cooldown.has(s)) continue;
          this.cooldown.set(s, HIT_COOLDOWN);
          if (spinOut(s, FUZZ_SPIN)) {
            s.speed *= FUZZ_SLOW;
            hit.push({ kart: s, by: p.kind });
          }
          continue;
        }
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
    for (const [k, p] of this.poses.entries()) {
      if (isSheet(p.kind)) continue; // the whole road: nothing to steer around
      if (p.kind === 'airlocks') {
        // From just before they close until they open: the doors where they will be when shut, so the slit is lined up early.
        if (p.phase < AIRLOCK_STAGES.close - 0.1 || p.phase > AIRLOCK_STAGES.open) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const c = (p.x - p.ax) * -fz + (p.z - p.az) * fx;
        for (const side of [-1, 1]) {
          for (let l = c + side * (AIRLOCK_SLIT + 1.2); Math.abs(l) < p.radius + 1; l += side * 2.4) out.push({ x: p.ax - fz * l, z: p.az + fx * l, r: 1.5, vx: 0, vz: 0 });
        }
        continue;
      }
      if (p.kind === 'eyes') {
        // From the arrow on, the half it doesn't point to.
        if (p.phase < EYE_STAGES.show || p.phase >= EYE_STAGES.done) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        for (let l = 1.2; l < p.radius; l += 2.4) {
          const lat = -p.side * l;
          out.push({ x: p.ax - fz * lat, z: p.az + fx * lat, r: 1.5, vx: 0, vz: 0 });
        }
        continue;
      }
      if (p.kind === 'arrows') {
        // From when they flicker on: the three lanes with arrows in them.
        if (p.phase < ARROW_STAGES.show || p.phase >= ARROW_STAGES.off) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const w = (2 * p.radius) / ARROW_LANES;
        for (let k = 0; k < ARROW_LANES; k++) {
          if (k === p.lane) continue;
          const lat = -p.radius + w * (k + 0.5);
          out.push({ x: p.ax - fz * lat, z: p.az + fx * lat, r: w / 2, vx: 0, vz: 0 });
        }
        continue;
      }
      if (p.kind === 'sheets') {
        // Each sheet where it is, moving across the road.
        if (!p.active) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const { def } = this.slots[k];
        const speed = (2 * (p.radius + SHEET_HALF)) / ((SHEET_STAGES.gone - SHEET_STAGES.slide) * ('period' in def ? def.period : 5));
        for (const side of [-1, 1]) {
          const x = p.x - fz * side * p.gap;
          const z = p.z + fx * side * p.gap;
          // The first sheet runs to the right, the second to the left.
          out.push({ x, z, r: SHEET_HALF, vx: -fz * -side * speed, vz: fx * -side * speed });
        }
        continue;
      }
      const falling = isFalling(p.kind);
      if (p.kind === 'lightning' || p.kind === 'geysers' || p.kind === 'jaws') {
        if (p.phase < BOULDER_STAGES.fall * 0.5 || p.phase > BOULDER_STAGES.land + LIGHTNING_STRIKE) continue;
      } else if (p.kind === 'crushers') {
        // From when it starts shaking loose until it is hauled back up out of the way.
        if (p.phase < CRUSHER_STAGES.shake || p.phase > CRUSHER_STAGES.rise + 0.05) continue;
      } else if (p.kind === 'gammaRays') {
        if (p.phase < GAMMA_STAGES.aim || p.phase > GAMMA_STAGES.done) continue;
      } else if (p.kind === 'wahs') {
        // From just before the stamp until the pedal is back up.
        if (p.phase < WAH_STAGES.stamp - 0.08 || p.phase > WAH_STAGES.rise) continue;
      } else if (falling ? p.phase > BOULDER_STAGES.crumble || p.phase < BOULDER_STAGES.fall * 0.5 : !p.active) continue;
      if (p.kind === 'snakes' || p.kind === 'rats') {
        // The body (or the stream of rats) trails the head: aim to miss its middle.
        const len = p.kind === 'rats' ? RAT_LENGTH : SNAKE_LENGTH;
        const bx = -Math.sin(p.heading) * len * 0.5;
        const bz = -Math.cos(p.heading) * len * 0.5;
        out.push({ x: p.x + bx, z: p.z + bz, r: len * 0.5 + p.radius, vx: p.vx, vz: p.vz });
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

  /**
   * An airlock: caught by either door as it closes (or once it's shut),
   * you're spun out; through the slit while it's shut to one, a boost.
   */
  private airlock(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active) return;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    if (Math.abs((s.x - p.x) * fx + (s.z - p.z) * fz) > AIRLOCK_DEPTH + KART_RADIUS) return;
    const across = Math.abs((s.x - p.x) * -fz + (s.z - p.z) * fx);
    if (across + KART_RADIUS <= p.gap) {
      if (p.phase >= AIRLOCK_STAGES.shut && p.phase < AIRLOCK_STAGES.open) this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, AIRLOCK_BOOST)));
      return;
    }
    // Past the frame at the road's edge there's no door.
    if (Math.abs((s.x - p.ax) * -fz + (s.z - p.az) * fx) > p.radius + KART_RADIUS) return;
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (spinOut(s, AIRLOCK_SPIN)) {
      s.speed *= AIRLOCK_SLOW;
      hit.push({ kart: s, by: p.kind });
    }
  }

  /**
   * An eye reading your mind: on the half of the road its arrow points to,
   * a boost; on the other half, it blasts you.
   */
  private eye(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active) return;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    if (Math.abs((s.x - p.x) * fx + (s.z - p.z) * fz) > EYE_DEPTH + KART_RADIUS) return;
    const lat = (s.x - p.x) * -fz + (s.z - p.z) * fx;
    if (Math.abs(lat) > p.radius + KART_RADIUS) return;
    if (lat * p.side > 0) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, EYE_BOOST)));
      return;
    }
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (spinOut(s, EYE_SPIN)) hit.push({ kart: s, by: p.kind });
  }

  /**
   * A row of four arrows across the road: while they're lit, the three
   * arrows zap you; the lane with no arrow in it is a boost.
   */
  private arrowRow(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active) return;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    if (Math.abs((s.x - p.x) * fx + (s.z - p.z) * fz) > ARROW_DEPTH + KART_RADIUS) return;
    const lat = (s.x - p.x) * -fz + (s.z - p.z) * fx;
    if (Math.abs(lat) > p.radius + KART_RADIUS) return;
    const w = (2 * p.radius) / ARROW_LANES;
    const lane = Math.max(0, Math.min(ARROW_LANES - 1, Math.floor((lat + p.radius) / w)));
    if (lane === p.lane) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, ARROW_BOOST)));
      return;
    }
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (spinOut(s, ARROW_SPIN)) {
      s.speed *= ARROW_SLOW;
      hit.push({ kart: s, by: p.kind });
    }
  }

  /**
   * Two sheets of cellophane: caught in one you're wrapped up and slowed;
   * through where they overlap, lined up, a boost.
   */
  private cellophane(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active) return;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    if (Math.abs((s.x - p.x) * fx + (s.z - p.z) * fz) > SHEET_DEPTH + KART_RADIUS) return;
    const x = (s.x - p.x) * -fz + (s.z - p.z) * fx;
    const g = Math.abs(p.gap);
    if (g < SHEET_HALF && Math.abs(x) <= SHEET_HALF - g) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, SHEET_BOOST)));
      return;
    }
    if (Math.abs(x - g) > SHEET_HALF + KART_RADIUS && Math.abs(x + g) > SHEET_HALF + KART_RADIUS) return;
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    s.speed *= SHEET_SLOW;
    hit.push({ kart: s, by: p.kind });
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
    if (p.kind !== 'snakes' && p.kind !== 'rats') return Math.hypot(s.x - p.x, s.z - p.z);
    const bx = -Math.sin(p.heading);
    const bz = -Math.cos(p.heading);
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const along = Math.max(0, Math.min(p.kind === 'rats' ? RAT_LENGTH : SNAKE_LENGTH, dx * bx + dz * bz));
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
