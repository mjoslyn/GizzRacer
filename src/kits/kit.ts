import type { HazardKind, HazardPose } from '../items/hazards';
import type { KartState } from '../physics/kart';
import type { KitRoadSurfaces } from '../tracks/builder';
import type { Palette } from '../tracks/generator';
import type { HazardDef, KitHazards, KitLandmarks, KitThemes } from '../tracks/track';

/**
 * A track kit: everything one track adds to the game, in its own files, so
 * that building a track doesn't edit the shared systems (docs/DEVELOPMENT.md,
 * "Track kits"). A kit is two files:
 *
 * - `src/kits/<track>.ts`, this half: what the race needs, no three.js (the
 *   PartyKit server runs it too). Its new kinds and themes, declared into
 *   the shared types by declaration merging (KitHazards, KitLandmarks and
 *   KitThemes in tracks/track.ts, KitRoadSurfaces in tracks/builder.ts);
 *   its hazards (where they are at a moment of race time, what they do to a
 *   kart, what the CPUs steer round, their callouts and sound, and how the
 *   generator lays them); and its themes' generator palettes.
 * - `src/kits/<track>.view.ts`, the look (kits/view.ts): its worlds, scenery,
 *   road materials, landmarks, and its hazards' parts and poses.
 *
 * The kit is registered by one line in `src/kits/list.ts`; its view is
 * found by its file name. The systems (HazardSystem, the generator, game.ts,
 * sfx.ts, themes, trackView, trackDetail, trackLife, itemViews) ask the
 * registry for whatever they don't handle themselves.
 */
export interface Kit<Id extends string = string> {
  /** The kit's id: its track's id. The value its entries in KitHazards, KitLandmarks, KitThemes and KitRoadSurfaces carry. */
  id: Id;
  /** Its hazards, by kind: every one it declared in KitHazards. */
  hazards: { [K in OwnedHazard<Id>]: KitHazard<K> };
  /** Its themes, by id: every one it declared in KitThemes. */
  themes: { [T in Owned<KitThemes, Id>]: KitTheme };
}

/** The keys of a kit registry interface (KitThemes, KitLandmarks, ...) that kit `Id` declared. */
export type Owned<I, Id extends string> = { [K in Extract<keyof I, string>]: I[K] extends Id ? K : never }[Extract<keyof I, string>];
/** The hazard kinds kit `Id` declared in KitHazards. */
export type OwnedHazard<Id extends string> = { [K in Extract<keyof KitHazards, string>]: KitHazards[K] extends { kit: Id } ? K : never }[Extract<keyof KitHazards, string>];

/** The kinds kits add. */
export type KitHazardKind = Extract<keyof KitHazards, string>;
export type KitLandmarkKind = Extract<keyof KitLandmarks, string>;
export type KitThemeId = Extract<keyof KitThemes, string>;
export type KitRoadSurface = Extract<keyof KitRoadSurfaces, string>;

/** A kit's theme, as the generator knows it (its world is in the view). */
export interface KitTheme {
  /** Its name in the track generator's theme picker. */
  name: string;
  /** How the generator builds a track in it: its surfaces, hazards, landmarks, section names and music. */
  palette: Palette;
}

/** What the HazardSystem reports for a kart a hazard got: hit (spun or slowed), or `good`, rewarded for playing it right. */
export interface HazardHit {
  kart: KartState;
  by: HazardKind;
  good?: boolean;
  /** An open present: an item too. */
  gift?: boolean;
  /** Bailed up: robbed of the item in hand. */
  robbed?: boolean;
}

/** A circle the CPUs steer round, and how it's moving. */
export interface Threat {
  x: number;
  z: number;
  r: number;
  vx: number;
  vz: number;
}

/** What the HazardSystem lends a kit's hazard: the road it's on, and the rules every hazard plays by. */
export interface HazardWorld {
  /** Puts the pose at builder arc length `builderS` on the main road, `lateral` metres right of its centre and `lift` over it: sets x, y, z, ground, ax, az (the centre line there) and heading (the road's). */
  place(p: HazardPose, builderS: number, lateral: number, lift: number): void;
  /** The main road's half-width at builder arc length `builderS`. */
  halfWidth(builderS: number): number;
  /** Whether the kart was hit lately (HIT_COOLDOWN) and can't be again yet. */
  cooling(s: KartState): boolean;
  /** Starts the kart's hit cooldown. */
  cool(s: KartState): void;
  /** Pays the kart for playing it right (`pay` gives the boost), at most once a REWARD_COOLDOWN, and reports it as `good`. */
  reward(hit: HazardHit[], s: KartState, by: HazardKind, pay: () => void): void;
  /** Pushes the kart out of the pose's circle (a solid thing standing on the road). */
  pushOut(p: HazardPose, s: KartState): void;
}

/** The hazard def of kind `K`. */
export type HazardDefOf<K extends HazardKind> = Extract<HazardDef, { kind: K }>;

/** Where on a stretch of generated road a hazard goes (the generator's addHazard). */
export interface HazardStretch {
  /** The stretch, in builder units along the main road. */
  from: number;
  to: number;
  /** 3 on a long stretch, else 2. */
  count: number;
  /** `n` stations spread evenly along it. */
  at(n: number): number[];
}

/** The hit effects on the player's screen game.ts knows; each is set to at least the given level when this hazard hits you. */
export type ScreenEffect = 'swim' | 'crackle' | 'digitise' | 'doze' | 'drain';

/** The waveforms the hit sound can use. */
export type Wave = 'sine' | 'square' | 'triangle' | 'sawtooth';

/** The voices sfx.ts plays a hazard's hit sound with. */
export interface SfxVoice {
  /** A note: `freq` Hz for `dur` s at `level`, sliding to `slideTo`, after `delay` s, through the fuzz. */
  tone(freq: number, dur: number, type: Wave, level: number, slideTo?: number, delay?: number, fuzz?: boolean): void;
  /** A thump of filtered noise. */
  hit(dur: number, cutoff: number, level: number): void;
  /** A sweep of filtered noise from `from` Hz to `to`. */
  whoosh(dur: number, from: number, to: number, level: number): void;
}

/**
 * One kind of hazard. Every hazard's position is a pure function of race
 * time (so it replays identically and syncs over the network by time
 * alone); only the per-kart cooldowns are state, and the HazardSystem keeps
 * those.
 */
export type KitHazard<K extends HazardKind = HazardKind> = KitHazardOf<HazardDefOf<K>>;

/** A hazard of def `D` (KitHazard names it by its kind). */
export interface KitHazardOf<D extends HazardDef> {
  kind: D['kind'];
  /** Fills the whole road across, on a rhythm: nothing to steer round, only to time (the CPUs ignore it; touching is measured along the road). */
  sheet?: boolean;
  /** Sets pose `p` of station `i` of `def` to where it is at race time `t` (velocity is worked out after). */
  pose(p: HazardPose, def: D, i: number, t: number, world: HazardWorld): void;
  /**
   * What the pose does to kart `s` this tick, pushing onto `hit`: a hit
   * (spinOut or wobble, with a cooldown) or a reward for playing it right.
   * Called only for karts within 2.2 m of its height.
   */
  collide(hit: HazardHit[], p: HazardPose, s: KartState, world: HazardWorld, dt: number): void;
  /** The circles the CPUs steer round (default: the pose's circle while it's active; none for a sheet). */
  threats?(out: Threat[], p: HazardPose, def: D): void;
  /** How the track generator lays it along a stretch of road. */
  generate(stretch: HazardStretch): D;
  /** The flash when it hits you, and when you use it well. */
  callouts: { hit: string; bonus: string };
  /** Its hit sound. */
  sound(v: SfxVoice): void;
  /** What its hit does to your screen, if anything. */
  screen?: Partial<Record<ScreenEffect, number>>;
}

/** A registered kit, whichever it is. */
export interface AnyKit {
  id: string;
  hazards: { readonly [K in KitHazardKind]?: KitHazard<K> };
  themes: { readonly [T in KitThemeId]?: KitTheme };
}
