import type * as THREE from 'three';
import type { HazardPose } from '../items/hazards';
import type { KitDecors, Theme } from '../render/themes';
import type { DetailStyle } from '../render/trackDetail';
import type { LifeSpec } from '../render/trackLife';
import type { KitRoadSurfaces } from '../tracks/builder';
import type { KitLandmarks, KitThemes, Landmark, Ribbon, Track } from '../tracks/track';
import type { Owned, OwnedHazard } from './kit';

/**
 * A track kit's look (kits/kit.ts has the other half): `src/kits/<track>.view.ts`
 * exports `view`, a KitView of its kit's id, and is found by its file name
 * (kits/views.ts). The compiler holds it to its kit: a world for each of its
 * themes, a decor for each decor it declared (KitDecors in render/themes.ts,
 * declared in the view file), a material for each road surface, a builder
 * for each landmark kind, and the parts and pose of each hazard.
 *
 * The builders themselves live in `src/render/<track>.ts`, which must not
 * import the shared render systems (trackView, trackDetail, trackLife,
 * itemViews, themes): they import the kits, so that would be a cycle.
 */
export interface KitView<Id extends string = string> {
  id: Id;
  /** Its worlds, by theme id. */
  themes: { [T in Owned<KitThemes, Id>]: Theme };
  /** Its scenery, by decor kind (a theme's `decor`). */
  decors: { [D in Owned<KitDecors, Id>]: KitDecor };
  /** Its road surfaces' materials. */
  roads: { [R in Owned<KitRoadSurfaces, Id>]: RoadMaterial };
  /** Its landmarks' builders, by kind. */
  landmarks: { [L in Owned<KitLandmarks, Id>]: LandmarkBuilder };
  /** Its hazards' looks, by kind. */
  hazards: { [K in OwnedHazard<Id>]: KitHazardView };
}

/** Per-frame updates: anything that moves pushes one. */
export type Animated = ((time: number) => void)[];

/** Where a landmark goes, and what it may need to build itself. */
export interface LandmarkSite {
  track: Track;
  /** The road it's on (`lm.ribbon`). */
  ribbon: Ribbon;
  /** Where along that road, in metres (`lm.s` times the ribbon's scale). */
  s: number;
  lm: Landmark;
  animated: Animated;
}
export type LandmarkBuilder = (site: LandmarkSite) => THREE.Object3D;

/** One piece of scenery at x, z. */
export type Feature = (x: number, z: number, rand: () => number) => THREE.Object3D;

/** A world's off-road scenery and trackside dressing (a theme's `decor`). */
export interface KitDecor {
  /** The rocks' texture. */
  rock: () => THREE.Texture;
  /** How many rocks and how many features are scattered off the road at full detail (220 and 70 when unset). */
  rocks?: number;
  features?: number;
  /** Builds one of its features; `track` for scenery that goes by which stretch of the lap it's beside. */
  feature(animated: Animated, track?: Track): Feature;
  /** Its edge posts, ground cover, boards and crowd (trackDetail.ts). */
  detail: DetailStyle;
  /** What flies over it and drifts through its air (trackLife.ts). */
  life: LifeSpec;
}

/** What trackView lends a road material: the lit materials every road is made from, the bump map following the graphics detail. */
export interface RoadTools {
  lambert(map: THREE.Texture, extra?: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial;
  /** The texture as its own bump map too, at high detail. */
  bumpy(map: THREE.Texture, scale: number, extra?: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial;
}
export type RoadMaterial = (tools: RoadTools) => THREE.Material;

/** A hazard's look: its parts, built once per pose, and posed each frame (the group is already at the pose's x, y, z). */
export interface KitHazardView {
  parts(obj: THREE.Object3D, pose: HazardPose): THREE.Object3D[];
  pose(obj: THREE.Object3D, parts: THREE.Object3D[], p: HazardPose, elapsed: number): void;
}

/** A registered view, whichever it is. */
export interface AnyKitView {
  id: string;
  themes: { readonly [id: string]: Theme | undefined };
  decors: { readonly [kind: string]: KitDecor | undefined };
  roads: { readonly [surface: string]: RoadMaterial | undefined };
  landmarks: { readonly [kind: string]: LandmarkBuilder | undefined };
  hazards: { readonly [kind: string]: KitHazardView | undefined };
}
