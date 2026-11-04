import type { KitRoadSurfaces } from '../tracks/builder';
import type { CoreHazardKind, CoreLandmarkKind, CoreTheme, KitHazards, KitLandmarks, KitThemes } from '../tracks/track';
import type { CoreRoadSurface } from '../tracks/builder';
import type { AnyKit, KitHazard, KitTheme } from './kit';
import * as LIST from './list';

/**
 * The track kits (kits/kit.ts), as the systems look them up. The kits
 * themselves are listed, one line each, in kits/list.ts.
 */
export const KITS: readonly AnyKit[] = Object.values(LIST);

/** Every kit hazard, by kind. */
export const KIT_HAZARDS: ReadonlyMap<string, KitHazard> = new Map(KITS.flatMap((k) => Object.values(k.hazards).map((h) => [h.kind, h] as const)));
/** Every kit theme's name and generator palette, by theme id. */
export const KIT_THEMES: ReadonlyMap<string, KitTheme> = new Map(KITS.flatMap((k) => Object.entries(k.themes)));

// What the compiler checks of the kits, so a mistake fails the build rather than a race:
type Registered = (typeof LIST)[keyof typeof LIST]['id'];
type Declared = KitThemes[keyof KitThemes] | KitLandmarks[keyof KitLandmarks] | KitRoadSurfaces[keyof KitRoadSurfaces] | Extract<KitHazards[keyof KitHazards], { kit: string }>['kit'];
/** A kit that declared kinds or themes is listed in kits/list.ts. */
export const everyKitListed: [Exclude<Declared, Registered>] extends [never] ? true : Exclude<Declared, Registered> = true;
/** No kit takes a kind or theme the game already has. */
export const noKitShadowsTheCore: [(keyof KitHazards & CoreHazardKind) | (keyof KitLandmarks & CoreLandmarkKind) | (keyof KitThemes & CoreTheme) | (keyof KitRoadSurfaces & CoreRoadSurface)] extends [never] ? true : 'clash' = true;
/** Each KitHazards entry's def is of its own kind. */
export const hazardDefsMatch: { [K in keyof KitHazards]: KitHazards[K] extends { def: { kind: K } } ? never : K }[keyof KitHazards] extends never ? true : 'mismatch' = true;
