/**
 * The graphics detail level (Settings > Detail). High: full resolution, sun
 * shadows from a 2048 map reaching 70 m, bump-mapped roads, half again
 * the scenery. Medium: full resolution, shadows from a 1024 map reaching
 * 50 m, bump-mapped roads, the usual scenery. Low: fewer pixels, no
 * shadows, the flat look, for phones and slower machines. Read where
 * things are built and drawn.
 */
export type Detail = 'high' | 'medium' | 'low';
export const DETAILS: readonly Detail[] = ['low', 'medium', 'high'];
export const DETAIL_NAMES: Record<Detail, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/** What each level draws with. */
export const DETAIL_SPEC: Record<Detail, { pixelRatio: number; shadows: boolean; shadowMap: number; shadowReach: number; grain: boolean; density: number }> = {
  high: { pixelRatio: 2, shadows: true, shadowMap: 2048, shadowReach: 70, grain: true, density: 1.5 },
  medium: { pixelRatio: 2, shadows: true, shadowMap: 1024, shadowReach: 50, grain: true, density: 1 },
  low: { pixelRatio: 1.25, shadows: false, shadowMap: 0, shadowReach: 0, grain: false, density: 1 },
};

let current: Detail = 'high';

export function graphicsDetail(): Detail {
  return current;
}

export function setGraphicsDetail(d: Detail): void {
  current = d;
}

/** How much more scenery, ground cover and motes the level puts down. */
export function densityScale(): number {
  return DETAIL_SPEC[current].density;
}
