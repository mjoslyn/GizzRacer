/**
 * The graphics detail level (Settings > Detail): High draws sun shadows,
 * bump-mapped roads and denser scenery; Low is the old flat look for
 * phones and slower machines. Read where things are built and drawn.
 */
export type Detail = 'high' | 'low';

let current: Detail = 'high';

export function graphicsDetail(): Detail {
  return current;
}

export function setGraphicsDetail(d: Detail): void {
  current = d;
}

/** How much more scenery, ground cover and motes High puts down. */
export function densityScale(): number {
  return current === 'high' ? 1.5 : 1;
}
