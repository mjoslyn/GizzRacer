import { clamp, seededRandom } from '../core/math';
import { TrackBuilder, dubins, offsetPose, type Pose, type RoadSurface, type SectionProps } from './builder';
import { Track, type HazardDef, type Landmark, type TrackDef } from './track';

/**
 * Generated tracks: a seeded loop built from themed corner modules. The
 * same seed and dials always build the same track, so a saved track is
 * just its seed, dials and name.
 */

export type GenTheme = TrackDef['theme'];
export const GEN_THEMES: readonly GenTheme[] = ['desert', 'speedway', 'volcano', 'jungle', 'lagoon', 'glacier', 'neon', 'dream'];
export const GEN_THEME_NAMES: Record<GenTheme, string> = {
  desert: 'Desert',
  speedway: 'Speedway',
  volcano: 'Volcano',
  jungle: 'Jungle',
  lagoon: 'Lagoon',
  glacier: 'Glacier',
  neon: 'Neon City',
  dream: 'Sky',
};
export type GenLength = 'short' | 'medium' | 'long';
export const GEN_LENGTHS: readonly GenLength[] = ['short', 'medium', 'long'];
export const GEN_COMPLEXITY_MAX = 5;

export interface GenParams {
  seed: number;
  theme: GenTheme;
  /** 1 (wide, sweeping, forgiving) .. 5 (narrow, twisty, hazards everywhere). */
  complexity: number;
  length: GenLength;
}

/** Rough lap lengths, metres. */
const LENGTH_M: Record<GenLength, number> = { short: 950, medium: 1350, long: 1800 };
const FINISH = 50;
const MAX_ATTEMPTS = 60;

type HazardKind = HazardDef['kind'];

interface Palette {
  surface: RoadSurface;
  /** Bridges and jump approaches. */
  deck: RoadSurface;
  /** Other surfaces some sections take instead (ice on the glacier). */
  alt?: RoadSurface;
  liquid?: 'water' | 'lava';
  hazards: HazardKind[];
  start: Landmark['kind'];
  landmarks: Landmark['kind'][];
  /** Walls on enclosed sections (the city's alleys are tall). */
  tallWalls: number;
  /** Words for section names. */
  places: string[];
  music: { lap: string; finalLap?: string };
}

const PALETTES: Record<GenTheme, Palette> = {
  desert: {
    surface: 'sand',
    deck: 'rock',
    alt: 'salt',
    hazards: ['snakes', 'tumbleweeds', 'dustDevils', 'boulders'],
    start: 'skeletonArch',
    landmarks: [],
    tallWalls: 6,
    places: ['Salt', 'Mesa', 'Gila', 'Sidewinder', 'Canyon', 'Dune', 'Rattle', 'Coyote', 'Arroyo'],
    music: { lap: 'rattlesnake-run', finalLap: 'rattlesnake-run-final-lap' },
  },
  speedway: {
    surface: 'asphalt',
    deck: 'asphalt',
    hazards: ['tumbleweeds'],
    start: 'gantry',
    landmarks: [],
    tallWalls: 1.2,
    places: ['Mobius', 'Meadow', 'Loop', 'Infinity', 'Clover', 'Hilltop', 'Paddock'],
    music: { lap: 'infinite-loop-speedway' },
  },
  volcano: {
    surface: 'asphalt',
    deck: 'rock',
    alt: 'rock',
    liquid: 'lava',
    hazards: ['lavaBombs', 'flameJets'],
    start: 'gantry',
    landmarks: ['fortressGate'],
    tallWalls: 7,
    places: ['Ash', 'Magma', 'Caldera', 'Basalt', 'Cinder', 'Obsidian', 'Ember'],
    music: { lap: 'volcano-fortress' },
  },
  jungle: {
    surface: 'sand',
    deck: 'rock',
    alt: 'rock',
    liquid: 'water',
    hazards: ['vines', 'rollers'],
    start: 'gantry',
    landmarks: ['templeGate', 'waterfall'],
    tallWalls: 5,
    places: ['Canopy', 'Vine', 'Polygon', 'Fern', 'Temple', 'Mossy', 'Liana'],
    music: { lap: 'polygondwanaland-jungle' },
  },
  lagoon: {
    surface: 'sand',
    deck: 'boards',
    liquid: 'water',
    hazards: ['fish'],
    start: 'gantry',
    landmarks: ['lighthouse'],
    tallWalls: 1.2,
    places: ['Reef', 'Coral', 'Palm', 'Shoal', 'Fishies', 'Lagoon', 'Driftwood'],
    music: { lap: 'fishies-lagoon' },
  },
  glacier: {
    surface: 'asphalt',
    deck: 'rock',
    alt: 'ice',
    liquid: 'water',
    hazards: ['iceBlocks'],
    start: 'iceArch',
    landmarks: ['iceArch'],
    tallWalls: 3,
    places: ['Ice V', 'Frost', 'Crevasse', 'Icicle', 'Glacier', 'Permafrost', 'Snowdrift'],
    music: { lap: 'ice-v-glacier' },
  },
  neon: {
    surface: 'neon',
    deck: 'neon',
    hazards: ['lasers'],
    start: 'neonArch',
    landmarks: ['neonArch'],
    tallWalls: 6,
    places: ['Cyboogie', 'Han-Tyumi', 'Neon', 'Chrome', 'Synth', 'Circuit', 'Midnight'],
    music: { lap: 'cyboogie-city' },
  },
  dream: {
    surface: 'rainbow',
    deck: 'rainbow',
    hazards: ['butterflies'],
    start: 'rainbowArch',
    landmarks: ['rainbowArch'],
    tallWalls: 1.2,
    places: ['Butterfly', 'Cloud', 'Chrysalis', 'Starlight', 'Pastel', 'Daydream', 'Halo'],
    music: { lap: 'butterfly-skyway', finalLap: 'butterfly-skyway-final-lap' },
  },
};

const NAME_ADJECTIVES = ['Microtonal', 'Polygon', 'Infinite', 'Nonagon', 'Fuzz', 'Quarter-Tone', 'Psychedelic', 'Altered', 'Cosmic', 'Crumbling', 'Sleepy', 'Plastic', 'Gumboot', 'Robot', 'Hypertension'];
const NAME_KINDS = ['Run', 'Loop', 'Circuit', 'Raceway', 'Speedway', 'Rally', 'Ring', 'Gauntlet', 'Drift', 'Dash', 'Boogie'];

/** A name for a generated track, from its seed and theme. */
export function trackName(p: Pick<GenParams, 'seed' | 'theme'>): string {
  const rand = seededRandom(p.seed * 31 + 7);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  return `${pick(NAME_ADJECTIVES)} ${pick(PALETTES[p.theme].places)} ${pick(NAME_KINDS)}`;
}

export function trackId(p: GenParams): string {
  return `gen-${p.theme}-${p.complexity}-${p.length}-${p.seed}`;
}

/** How the last generation went (tests and tuning). */
export const generatorStats = { attempts: 0, fallbacks: 0, rejects: { closure: 0, overlap: 0 } };

/** Builds the track for these dials; a layout that fails its checks is re-rolled from the same seed. */
export function generateTrack(p: GenParams): TrackDef {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const def = attemptTrack(p, attempt);
    generatorStats.attempts = attempt + 1;
    if (def && isPlayable(def)) return def;
    if (def) generatorStats.rejects.overlap++;
  }
  generatorStats.fallbacks++;
  // Every attempt failed (it shouldn't): the plainest loop for these dials.
  return attemptTrack({ ...p, complexity: 1 }, 0, true)!;
}

/** Road that doesn't cross itself (overpasses aside) and checkpoints on solid road. */
export function isPlayable(def: TrackDef): boolean {
  const track = new Track(def);
  if (selfGap(track) < 5) return false;
  return def.checkpoints.every((cp) => {
    const pose = track.respawnPose(cp * track.length + 2);
    return track.locate(pose.x, pose.z, pose.y).onRoad;
  });
}

/** Closest the road comes to itself, edge to edge, away from where it's the same stretch. */
export function selfGap(track: Track): number {
  const sp = track.spline;
  let min = Infinity;
  for (let i = 0; i < sp.count; i += 2) {
    for (let j = i + 2; j < sp.count; j += 2) {
      const along = Math.abs(sp.dist[i] - sp.dist[j]);
      if (Math.min(along, sp.length - along) < 120) continue;
      if (Math.abs(track.main.heightAt(sp.dist[i]) - track.main.heightAt(sp.dist[j])) > 6) continue;
      const gap = Math.hypot(sp.px[i] - sp.px[j], sp.pz[i] - sp.pz[j]) - track.main.halfWidth[i] - track.main.halfWidth[j];
      if (gap < min) min = gap;
    }
  }
  return min;
}

interface Module {
  name: string;
  /** Hazards that fit it: crossing kinds need a straight-ish run. */
  open: boolean;
  props: Partial<SectionProps>;
  build: (b: TrackBuilder, side: number) => void;
}

function attemptTrack(p: GenParams, attempt: number, plain = false): TrackDef | null {
  const rand = seededRandom(p.seed * 7919 + attempt * 104729 + 1);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const between = (a: number, b: number) => a + rand() * (b - a);
  const c = plain ? 1 : clamp(Math.round(p.complexity), 1, GEN_COMPLEXITY_MAX);
  const pal = PALETTES[p.theme];
  const abyss = p.theme === 'dream';
  const halfWidth = 12.6 - c * 0.8;
  const R = 52 - c * 5;
  const wall = abyss || c <= 3 ? 1.2 : 0;
  // Modules wind more at higher complexity, so the skeleton shrinks to keep the lap near its length.
  const per = LENGTH_M[p.length] / (1.02 + 0.033 * c);
  const aspect = 1 + rand() * 0.6;
  const H = per / (2 * (1 + aspect));
  const W = H * aspect;
  const start: Pose = { x: -W / 2 + R + FINISH, z: H / 2, h: Math.PI / 2 };
  const place = () => pick(pal.places);
  const surface = () => (pal.alt && rand() < (pal.alt === 'ice' ? 0.6 : 0.3) ? pal.alt : pal.surface);

  const b = new TrackBuilder(start, `${place()} Straight`, { halfWidth, wallHeight: abyss ? 1.2 : 0, surface: pal.surface });
  const marks: string[] = [];
  const hazards: HazardDef[] = [];
  const itemBoxes: TrackDef['itemBoxes'] = [];
  const boostPads: TrackDef['boostPads'] = [];
  const landmarks: Landmark[] = [{ kind: pal.start, ribbon: -1, s: 0 }];
  let jumps = 0;
  let bridges = 0;
  let lateral = 0;

  // Modules: each leaves the road heading the way it came in.
  const straight = (len: number): Module => ({ name: pick(['Straight', 'Run', 'Dash']), open: true, props: {}, build: (bb) => bb.straight(len) });
  const sBend = (): Module => {
    const a = between(25, 50);
    const r = between(40, 70) - c * 4;
    const dir = lateral > 0 ? -1 : 1;
    return {
      name: 'S-Bends',
      open: true,
      props: {},
      build: (bb) => bb.arc(r, dir * a).arc(r, -dir * a),
    };
  };
  const esses = (tight: boolean): Module => {
    const a = tight ? between(50, 80) : between(35, 60);
    const r = tight ? between(19, 24) : between(26, 40) - c;
    const dir = rand() < 0.5 ? 1 : -1;
    return {
      name: tight ? 'Chicane' : 'Esses',
      open: false,
      props: { wallHeight: tight ? pal.tallWalls : wall, halfWidth: halfWidth - (tight ? 1 : 0) },
      build: (bb) => bb.arc(r, dir * a).arc(r, -2 * dir * a).arc(r, dir * a),
    };
  };
  const hairpins = (): Module => {
    const r = between(20, 25);
    const s = between(12, 24);
    // A switchback: back the way it came, then on again, a few lanes over (toward the skeleton's line).
    const dir = lateral > 0 ? -1 : 1;
    return {
      name: 'Hairpins',
      open: false,
      props: { wallHeight: 1.5, halfWidth: halfWidth - 1 },
      build: (bb) => bb.straight(10).arc(r, dir * 165).straight(s).arc(r, -dir * 165).straight(10),
    };
  };
  const jump = (): Module => ({
    name: pick(['Leap', 'Jump']),
    open: false,
    props: { wallHeight: 1.2, surface: pal.deck },
    build: (bb) => {
      bb.straight(30).elevate(0).rise(20, 3);
      bb.gap(13 + c, 34, pal.liquid);
      bb.elevate(0).straight(25);
    },
  });
  const bridge = (): Module => ({
    name: pick(['Bridge', 'Causeway', 'Crossing']),
    open: true,
    props: { surface: pal.deck, halfWidth: halfWidth - 2, wallHeight: 0 },
    build: (bb) => {
      bb.straight(8).elevate(0).rise(12, 1.5);
      bb.bridge(between(40, 70), 30, pal.liquid);
      bb.elevate(1.5).rise(12, 0);
    },
  });

  /** How far along its heading a module would take the road. */
  const measure = (m: Module): number => {
    const scratch = new TrackBuilder(b.pose, 'scratch', { halfWidth });
    m.build(scratch, 0);
    return (scratch.pose.x - b.pose.x) * Math.sin(b.pose.h) + (scratch.pose.z - b.pose.z) * Math.cos(b.pose.h);
  };

  const chooseModule = (room: number): Module => {
    const options: [number, () => Module][] = [
      [3 - c * 0.4, () => straight(Math.min(room, between(15, 60 - c * 7)))],
      [1.5, sBend],
      [c * 0.5, () => esses(false)],
    ];
    if (c >= 2) options.push([c * 0.4, () => esses(true)]);
    if (c >= 3 && room > 90) options.push([(c - 2) * 0.6, hairpins]);
    if (c >= 2 && jumps < 2 && room > 110) options.push([0.5 + c * 0.15, jump]);
    if (pal.liquid && bridges < 1 && room > 110) options.push([0.6, bridge]);
    if (plain) options.splice(1);
    const total = options.reduce((t, [w]) => t + Math.max(0, w), 0);
    let r = rand() * total;
    for (const [w, make] of options) {
      r -= Math.max(0, w);
      if (r <= 0) return make();
    }
    return options[0][1]();
  };

  // A rectangle of four sides, each filled with modules, corners between them.
  const sides = [W - 2 * R - FINISH, H - 2 * R, W - 2 * R, H - 2 * R];
  for (let side = 0; side < 4; side++) {
    const from = { ...b.pose };
    const fx = Math.sin(from.h);
    const fz = Math.cos(from.h);
    const along = () => (b.pose.x - from.x) * fx + (b.pose.z - from.z) * fz;
    lateral = 0;
    if (side > 0) {
      const mark = `side${side}`;
      b.mark(mark);
      marks.push(mark);
      itemBoxes.push({ s: b.s + 15, count: halfWidth > 10 ? 4 : 3 });
    }
    // The last two sides aim for where the final corner must start, so the loop closes on a plain corner;
    // the others run their length.
    const home = offsetPose(start, -FINISH);
    // The last corner turns from the last side's heading onto the finish line: it starts R back and R across.
    const lastH = home.h - Math.PI / 2;
    const corner = { x: home.x - R * Math.sin(home.h) - R * Math.sin(lastH), z: home.z - R * Math.cos(home.h) - R * Math.cos(lastH) };
    const toCorner = () => (corner.x - b.pose.x) * fx + (corner.z - b.pose.z) * fz;
    const goal = () => (side === 3 ? toCorner() : side === 2 ? toCorner() - R : sides[side] - along());
    let guard = 0;
    while (goal() > 25 && guard++ < 20) {
      const room = goal();
      // Try a few modules for one that fits what's left of the side; otherwise run straight to the end.
      let m: Module | null = null;
      for (let tries = 0; tries < 6 && !m; tries++) {
        const cand = chooseModule(room);
        if (measure(cand) <= room + 4) m = cand;
      }
      m ??= straight(room);
      // The last side keeps to its line: nothing that shifts the road sideways.
      if (side === 3 && (m.name === 'S-Bends' || m.name === 'Hairpins')) m = straight(Math.min(room, 40));
      const s0 = b.s;
      b.section(`${place()} ${m.name}`, { halfWidth, wallHeight: abyss ? 1.2 : 0, surface: surface(), ...m.props });
      const before = { ...b.pose };
      m.build(b, side);
      // Sideways drift, measured: positive is to the left of the side's heading.
      lateral += (b.pose.x - before.x) * Math.cos(from.h) - (b.pose.z - before.z) * Math.sin(from.h);
      const s1 = b.s;
      if (m.open && s1 - s0 > 35) addHazard(s0, s1);
      if (m.name === 'Straight' && s1 - s0 > 40 && boostPads.length < 3 && rand() < 0.5) boostPads.push({ s: s0 + 10, length: 8, lateral: 0, halfWidth: 2.5 });
      if (side === 0 && marks.length === 0 && along() > sides[0] / 2) {
        b.mark('mid');
        marks.push('mid');
      }
      if (m.name === 'Leap' || m.name === 'Jump') jumps++;
      if (m.name === 'Bridge' || m.name === 'Causeway' || m.name === 'Crossing') bridges++;
      if (pal.landmarks.length && landmarks.length < 3 && m.open && rand() < 0.35) landmarks.push({ kind: pick(pal.landmarks), ribbon: -1, s: s0 + 4 });
    }
    // Whatever's left of the side, straight.
    if (goal() > 0.5) b.straight(goal());
    if (side < 3) {
      b.section(`${place()} ${pick(['Bend', 'Turn', 'Corner', 'Sweeper'])}`, { halfWidth, wallHeight: wall, surface: surface() });
      b.arc(R, 90);
    }
  }
  if (!marks.includes('mid')) {
    // A short first side: the checkpoint goes on the first corner's exit instead.
    marks.unshift('side1');
  }
  // Home: the last corner, closed exactly onto the line. A layout that needs a loop to get there is re-rolled.
  const target = offsetPose(start, -FINISH);
  const close = dubins(b.pose, target, R);
  const turned = close.filter(([k]) => k !== 'S').reduce((t, [, len]) => t + len / R, 0);
  if (!plain && turned > Math.PI * 1.15) {
    generatorStats.rejects.closure++;
    return null;
  }
  b.section(`${place()} ${pick(['Bend', 'Hook', 'Sweeper'])}`, { halfWidth, wallHeight: wall, surface: pal.surface });
  b.mark('home');
  marks.push('home');
  b.turnTo(target, R);
  b.section('Finish Straight', { halfWidth, wallHeight: abyss ? 1.2 : 0, surface: pal.surface });
  b.straight(FINISH);
  itemBoxes.unshift({ s: 30, count: halfWidth > 10 ? 4 : 3 });

  const main = b.finish(true);
  let extent = 0;
  for (const [x, z] of main.points) extent = Math.max(extent, Math.abs(x), Math.abs(z));
  const uniqueMarks = [...new Set(marks)];
  return {
    id: trackId(p),
    name: trackName(p),
    main,
    branches: [],
    pits: b.pits,
    boostPads,
    checkpoints: uniqueMarks.map((m) => b.marks[m].s / main.length).sort((a, b2) => a - b2),
    laps: 3,
    bounds: Math.max(420, Math.ceil(extent + 60)),
    landmarks,
    itemBoxes,
    hazards,
    theme: p.theme,
    abyss: abyss || undefined,
    music: pal.music,
  };

  function addHazard(s0: number, s1: number): void {
    if (!pal.hazards.length || hazards.length >= 1 + c || rand() > 0.2 + c * 0.12) return;
    const kind = pick(pal.hazards);
    const from = s0 + 8;
    const to = s1 - 8;
    const at = (n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 0.5)) / n);
    const count = (to - from) > 80 ? 3 : 2;
    switch (kind) {
      case 'snakes':
        hazards.push({ kind, from, to, count, period: 3.5 });
        break;
      case 'rollers':
        hazards.push({ kind, from, to, count: count - 1, period: 7 });
        break;
      case 'fish':
        hazards.push({ kind, from, to, count, period: 3.4 });
        break;
      case 'iceBlocks':
        hazards.push({ kind, from, to, count: count - 1, period: 5 });
        break;
      case 'tumbleweeds':
        hazards.push({ kind, from, to, count });
        break;
      case 'dustDevils':
      case 'butterflies':
        hazards.push({ kind, from, to, count: 1 });
        break;
      case 'boulders':
        hazards.push({ kind, at: at(count - 1), period: 5 });
        break;
      case 'lavaBombs':
        hazards.push({ kind, at: at(count - 1), period: 6 });
        break;
      case 'flameJets':
        hazards.push({ kind, at: at(count), period: 3.2 });
        break;
      case 'lasers':
        hazards.push({ kind, at: at(count), period: 2.6 });
        break;
      case 'vines':
        hazards.push({ kind, at: at(count), period: 3.6 });
        break;
    }
  }
}
