import type { Theme } from '../render/themes';
import type { AnyKitView, KitDecor, KitHazardView, LandmarkBuilder, RoadMaterial } from './view';

/**
 * The track kits' looks (kits/view.ts), as the render systems look them up:
 * every `src/kits/<track>.view.ts`, found by its name and loaded with the
 * game (as the render modules always were); tests/kits.test.ts checks each
 * belongs to a listed kit.
 */
export const KIT_VIEWS: readonly AnyKitView[] = Object.values(import.meta.glob<AnyKitView>('./*.view.ts', { eager: true, import: 'view' }));

const gather = <T>(pick: (v: AnyKitView) => { readonly [k: string]: T | undefined }): ReadonlyMap<string, T> =>
  new Map(KIT_VIEWS.flatMap((v) => Object.entries(pick(v)).filter((e): e is [string, T] => e[1] !== undefined)));

/** The kits' worlds, by theme id. */
export const KIT_WORLDS: ReadonlyMap<string, Theme> = gather((v) => v.themes);
/** Their scenery, by decor kind. */
export const KIT_DECORS: ReadonlyMap<string, KitDecor> = gather((v) => v.decors);
/** Their road materials, by surface. */
export const KIT_ROADS: ReadonlyMap<string, RoadMaterial> = gather((v) => v.roads);
/** Their landmark builders, by kind. */
export const KIT_LANDMARKS: ReadonlyMap<string, LandmarkBuilder> = gather((v) => v.landmarks);
/** Their hazards' looks, by kind. */
export const KIT_HAZARD_VIEWS: ReadonlyMap<string, KitHazardView> = gather((v) => v.hazards);
