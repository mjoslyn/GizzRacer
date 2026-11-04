import type * as THREE from 'three';
import { nearestOnSpline, pointAt } from '../../tracks/spline';
import { inPit, type Ribbon, type Track } from '../../tracks/track';

/**
 * Where things go beside the road: a point on a ribbon and its heading, a
 * point off to one side, how far a point is from any road or pit, which
 * stretch of the lap it's beside, and turning a thing to face the road or
 * the karts coming at it. Distances along a ribbon (`s`) are spline metres
 * (a landmark's `lm.s * ribbon.scale`, as a LandmarkSite gives it).
 */

/** The ribbon at `s`: where it is, how high, and which way it runs (`heading` is a rotation.y that turns +z along it). */
export function frameAt(ribbon: Ribbon, s: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x, z: p.z, y: ribbon.heightAt(wrap(ribbon, s)), heading: Math.atan2(p.tx, p.tz), tx: p.tx, tz: p.tz };
}

/** The point `lateral` metres off the ribbon's centre line at `s` (right of travel is positive), and the road's heading there. */
export function offRoad(ribbon: Ribbon, s: number, lateral: number) {
  const p = pointAt(ribbon.spline, s);
  return { x: p.x - p.tz * lateral, z: p.z + p.tx * lateral, heading: Math.atan2(p.tx, p.tz) };
}

/** The point `gap` metres beyond the road's edge at `s`, on `side` (1 right, -1 left). */
export function beside(ribbon: Ribbon, s: number, side: 1 | -1, gap: number) {
  return offRoad(ribbon, s, side * (ribbon.halfWidthAtS(s) + gap));
}

/** `s` brought into the ribbon's length (a closed ribbon wraps round). */
export function wrap(ribbon: Ribbon, s: number): number {
  const L = ribbon.spline.length;
  return ribbon.spline.closed ? ((s % L) + L) % L : Math.min(Math.max(s, 0), L);
}

/** How far a point is from the edge of the nearest road of the track (negative: on one). */
export function clearance(track: Track, x: number, z: number): number {
  let best = Infinity;
  for (const r of [track.main, ...track.branches]) {
    const hit = nearestOnSpline(r.spline, x, z);
    best = Math.min(best, hit.distance - r.halfWidthAt(hit));
  }
  return best;
}

/** Whether a point is in (or within `margin` of) one of the track's pits: water, lava, a drop. */
export function inPits(track: Track, x: number, z: number, margin = 6): boolean {
  return track.def.pits.some((p) => inPit({ ...p, halfWidth: p.halfWidth + margin, halfLength: p.halfLength + margin }, x, z));
}

/** Whether a prop of radius `r` at a point stands clear of every road and pit. */
export function standsClear(track: Track, x: number, z: number, r = 1): boolean {
  return clearance(track, x, z) > r && !inPits(track, x, z, r);
}

/**
 * Whether another stretch of road than the ribbon's own round `s` (beyond
 * 80 m either way along it) passes within `r` of a point: where the lap
 * doubles back or crosses over, a set piece sized for one stretch would
 * stand on the other.
 */
export function nearOtherStretch(track: Track, ribbon: Ribbon, s: number, x: number, z: number, r: number): boolean {
  for (const other of [track.main, ...track.branches]) {
    const sp = other.spline;
    for (let i = 0; i < sp.count; i += 2) {
      if (other === ribbon) {
        const along = Math.abs(sp.dist[i] - s);
        if (Math.min(along, sp.length - along) < 80) continue;
      }
      if (Math.hypot(sp.px[i] - x, sp.pz[i] - z) < r) return true;
    }
  }
  return false;
}

/** The name of the main road's section nearest a point: dress scenery by the stretch of the lap it's beside. */
export function sectionNamer(track: Track): (x: number, z: number) => string {
  return (x, z) => {
    const hit = nearestOnSpline(track.spline, x, z);
    return track.main.def.sections[track.main.sectionIndex[hit.index]]?.name ?? '';
  };
}

/** Where a named section of a ribbon runs, in spline metres, from where it starts to where it ends (a name kept across a deck is one stretch), or undefined if it has none by that name. */
export function stretch(ribbon: Ribbon, name: string): { from: number; to: number } | undefined {
  const parts = ribbon.def.sections.filter((x) => x.name === name);
  return parts.length ? { from: parts[0].from * ribbon.scale, to: parts[parts.length - 1].to * ribbon.scale } : undefined;
}

/** Turns `obj` about y so its +z faces the point x, z. */
export function faceToward(obj: THREE.Object3D, x: number, z: number): THREE.Object3D {
  obj.rotation.y = Math.atan2(x - obj.position.x, z - obj.position.z);
  return obj;
}

/**
 * Turns `obj` (already placed) so its +z faces the road `back` metres
 * before `s`: the karts see its face as they come round to it, the way the
 * Grim Reaper's MC and Gaia's face are turned.
 */
export function faceOncoming(obj: THREE.Object3D, ribbon: Ribbon, s: number, back = 90): THREE.Object3D {
  const p = pointAt(ribbon.spline, wrap(ribbon, s - back));
  return faceToward(obj, p.x, p.z);
}
