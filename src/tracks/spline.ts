export type Vec2 = readonly [number, number];

/** A closed centerline sampled at roughly even spacing. Coordinates are (x, z). */
export interface TrackSpline {
  px: Float64Array;
  pz: Float64Array;
  /** Unit tangent (direction of travel). */
  tx: Float64Array;
  tz: Float64Array;
  /** Arc length at each sample. */
  dist: Float64Array;
  length: number;
  count: number;
}

export interface SplineHit {
  index: number; // sample at the start of the nearest segment
  s: number; // arc length along the track, 0..length
  lateral: number; // signed offset, positive = right of travel direction
  distance: number; // absolute distance from centerline
  tx: number;
  tz: number;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Builds a closed uniform Catmull-Rom spline through `ctrl`, resampled every `spacing` meters. */
export function buildClosedSpline(ctrl: readonly Vec2[], spacing = 2): TrackSpline {
  const n = ctrl.length;
  const dense: [number, number][] = [];
  const sub = 64;
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n];
    const p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % n];
    const p3 = ctrl[(i + 2) % n];
    for (let j = 0; j < sub; j++) {
      const t = j / sub;
      dense.push([catmullRom(p0[0], p1[0], p2[0], p3[0], t), catmullRom(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }

  // Cumulative length of the dense polyline (closed).
  const dd = new Float64Array(dense.length + 1);
  for (let i = 0; i < dense.length; i++) {
    const a = dense[i];
    const b = dense[(i + 1) % dense.length];
    dd[i + 1] = dd[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const length = dd[dense.length];
  const count = Math.max(8, Math.round(length / spacing));

  const px = new Float64Array(count);
  const pz = new Float64Array(count);
  const dist = new Float64Array(count);
  let k = 0;
  for (let i = 0; i < count; i++) {
    const target = (i / count) * length;
    while (dd[k + 1] < target) k++;
    const a = dense[k];
    const b = dense[(k + 1) % dense.length];
    const t = (target - dd[k]) / (dd[k + 1] - dd[k] || 1);
    px[i] = a[0] + (b[0] - a[0]) * t;
    pz[i] = a[1] + (b[1] - a[1]) * t;
    dist[i] = target;
  }

  const tx = new Float64Array(count);
  const tz = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const prev = (i - 1 + count) % count;
    const next = (i + 1) % count;
    const dx = px[next] - px[prev];
    const dz = pz[next] - pz[prev];
    const len = Math.hypot(dx, dz) || 1;
    tx[i] = dx / len;
    tz[i] = dz / len;
  }

  return { px, pz, tx, tz, dist, length, count };
}

/** Nearest point on the sampled centerline. O(n); fine for a few karts at 60 Hz. */
export function nearestOnSpline(sp: TrackSpline, x: number, z: number): SplineHit {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < sp.count; i++) {
    const dx = x - sp.px[i];
    const dz = z - sp.pz[i];
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }

  // Refine by projecting onto whichever adjacent segment is closer.
  const prev = (best - 1 + sp.count) % sp.count;
  const next = (best + 1) % sp.count;
  const segA = projectSegment(sp, prev, best, x, z);
  const segB = projectSegment(sp, best, next, x, z);
  const seg = segA.d2 < segB.d2 ? segA : segB;

  const i = seg.i;
  const j = (i + 1) % sp.count;
  const tx = sp.tx[i] + (sp.tx[j] - sp.tx[i]) * seg.t;
  const tz = sp.tz[i] + (sp.tz[j] - sp.tz[i]) * seg.t;
  const tl = Math.hypot(tx, tz) || 1;
  const ux = tx / tl;
  const uz = tz / tl;
  // Right of travel direction is (-tz, tx).
  const lateral = (x - seg.cx) * -uz + (z - seg.cz) * ux;
  const segLen = j === 0 ? sp.length - sp.dist[i] : sp.dist[j] - sp.dist[i];
  let s = sp.dist[i] + segLen * seg.t;
  if (s >= sp.length) s -= sp.length;

  return { index: i, s, lateral, distance: Math.sqrt(seg.d2), tx: ux, tz: uz };
}

function projectSegment(sp: TrackSpline, i: number, j: number, x: number, z: number) {
  const ax = sp.px[i];
  const az = sp.pz[i];
  const bx = sp.px[j] - ax;
  const bz = sp.pz[j] - az;
  const len2 = bx * bx + bz * bz || 1;
  const t = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) / len2));
  const cx = ax + bx * t;
  const cz = az + bz * t;
  return { i, t, cx, cz, d2: (x - cx) ** 2 + (z - cz) ** 2 };
}

/** Point and tangent at arc length s (wraps). */
export function pointAt(sp: TrackSpline, s: number): { x: number; z: number; tx: number; tz: number } {
  s = ((s % sp.length) + sp.length) % sp.length;
  let lo = 0;
  let hi = sp.count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sp.dist[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  const i = lo;
  const j = (i + 1) % sp.count;
  const segLen = j === 0 ? sp.length - sp.dist[i] : sp.dist[j] - sp.dist[i];
  const t = (s - sp.dist[i]) / (segLen || 1);
  return {
    x: sp.px[i] + (sp.px[j] - sp.px[i]) * t,
    z: sp.pz[i] + (sp.pz[j] - sp.pz[i]) * t,
    tx: sp.tx[i],
    tz: sp.tz[i],
  };
}
