/** A viewport on the screen, in CSS pixels from the top left. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Party mode's split screen: one player has the whole screen, two sit
 * side by side, three and four take a quarter each (with three, the last
 * quarter is left to the map).
 */
export function splitRects(seats: number, width: number, height: number): Rect[] {
  if (seats <= 1) return [{ x: 0, y: 0, w: width, h: height }];
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  if (seats === 2) return [{ x: 0, y: 0, w: halfW, h: height }, { x: halfW, y: 0, w: width - halfW, h: height }];
  const quads = [
    { x: 0, y: 0, w: halfW, h: halfH },
    { x: halfW, y: 0, w: width - halfW, h: halfH },
    { x: 0, y: halfH, w: halfW, h: height - halfH },
    { x: halfW, y: halfH, w: width - halfW, h: height - halfH },
  ];
  return quads.slice(0, seats);
}

/** The screen shape the chase camera's field of view is set for. */
const REF_ASPECT = 16 / 9;

/**
 * The vertical field of view for a viewport this shape: a wide, short one
 * sees as far to the sides as a full screen does, rather than a fisheye's
 * worth more. Narrower ones (two side by side) keep the full screen's.
 */
export function splitFov(baseFov: number, aspect: number): number {
  if (aspect <= REF_ASPECT) return baseFov;
  const half = (baseFov * Math.PI) / 360;
  return (Math.atan(Math.tan(half) * (REF_ASPECT / aspect)) * 360) / Math.PI;
}

/** Which way a seat's sounds lean (-1 left .. 1 right): by its side of the screen, a little, so players can tell whose is whose. */
export function seatPan(seat: number, seats: number): number {
  if (seats <= 1) return 0;
  if (seats === 2) return seat === 0 ? -0.35 : 0.35;
  return seat % 2 === 0 ? -0.35 : 0.35;
}
