export type Vec2 = readonly [number, number];

/** A centerline sampled at roughly even spacing. Coordinates are (x, z). */
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
  closed: boolean;
}

export interface SplineHit {
  index: number; // sample at the start of the nearest segment
  t: number; // 0..1 along that segment
  s: number; // arc length, 0..length
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

/**
 * Builds a uniform Catmull-Rom spline through `ctrl`, resampled every
 * `spacing` meters. Closed splines wrap; open ones end at the last point.
 */
export function buildSpline(ctrl: readonly Vec2[], spacing = 2, closed = true): TrackSpline {
  const n = ctrl.length;
  const at = (i: number): Vec2 => (closed ? ctrl[(i + n) % n] : ctrl[Math.min(Math.max(i, 0), n - 1)]);
  const dense: [number, number][] = [];
  const sub = 16;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let j = 0; j < sub; j++) {
      const t = j / sub;
      dense.push([catmullRom(p0[0], p1[0], p2[0], p3[0], t), catmullRom(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  if (!closed) dense.push([ctrl[n - 1][0], ctrl[n - 1][1]]);

  // Cumulative length of the dense polyline.
  const dn = dense.length;
  const edges = closed ? dn : dn - 1;
  const dd = new Float64Array(edges + 1);
  for (let i = 0; i < edges; i++) {
    const a = dense[i];
    const b = dense[(i + 1) % dn];
    dd[i + 1] = dd[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const length = dd[edges];
  const intervals = Math.max(8, Math.round(length / spacing));
  const count = closed ? intervals : intervals + 1;

  const px = new Float64Array(count);
  const pz = new Float64Array(count);
  const dist = new Float64Array(count);
  let k = 0;
  for (let i = 0; i < count; i++) {
    const target = (i / intervals) * length;
    while (k < edges - 1 && dd[k + 1] < target) k++;
    const a = dense[k];
    const b = dense[(k + 1) % dn];
    const t = Math.min(1, (target - dd[k]) / (dd[k + 1] - dd[k] || 1));
    px[i] = a[0] + (b[0] - a[0]) * t;
    pz[i] = a[1] + (b[1] - a[1]) * t;
    dist[i] = target;
  }

  const tx = new Float64Array(count);
  const tz = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const prev = closed ? (i - 1 + count) % count : Math.max(i - 1, 0);
    const next = closed ? (i + 1) % count : Math.min(i + 1, count - 1);
    const dx = px[next] - px[prev];
    const dz = pz[next] - pz[prev];
    const len = Math.hypot(dx, dz) || 1;
    tx[i] = dx / len;
    tz[i] = dz / len;
  }

  return { px, pz, tx, tz, dist, length, count, closed };
}

/** Closed-loop convenience wrapper. */
export function buildClosedSpline(ctrl: readonly Vec2[], spacing = 2): TrackSpline {
  return buildSpline(ctrl, spacing, true);
}

const segmentCount = (sp: TrackSpline) => (sp.closed ? sp.count : sp.count - 1);

/**
 * Nearest point on the sampled centerline. With a `hint` sample index only
 * samples within `window` of it are searched, which keeps per-kart lookups
 * cheap and stops them jumping to a nearby but unrelated stretch of road.
 */
export function nearestOnSpline(sp: TrackSpline, x: number, z: number, hint = -1, window = 40): SplineHit {
  const segs = segmentCount(sp);
  let best = 0;
  let bestD = Infinity;
  const consider = (i: number) => {
    const seg = projectSegment(sp, i, x, z);
    if (seg.d2 < bestD) {
      bestD = seg.d2;
      best = i;
    }
  };
  if (hint >= 0 && segs > window * 2) {
    for (let o = -window; o <= window; o++) {
      let i = hint + o;
      if (sp.closed) i = (i + segs) % segs;
      else if (i < 0 || i >= segs) continue;
      consider(i);
    }
  } else {
    for (let i = 0; i < segs; i++) consider(i);
  }

  const seg = projectSegment(sp, best, x, z);
  const i = best;
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
  if (sp.closed && s >= sp.length) s -= sp.length;

  return { index: i, t: seg.t, s, lateral, distance: Math.sqrt(seg.d2), tx: ux, tz: uz };
}

function projectSegment(sp: TrackSpline, i: number, x: number, z: number) {
  const j = (i + 1) % sp.count;
  const ax = sp.px[i];
  const az = sp.pz[i];
  const bx = sp.px[j] - ax;
  const bz = sp.pz[j] - az;
  const len2 = bx * bx + bz * bz || 1;
  const t = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) / len2));
  const cx = ax + bx * t;
  const cz = az + bz * t;
  return { t, cx, cz, d2: (x - cx) ** 2 + (z - cz) ** 2 };
}

/** Sample index whose segment contains arc length s. */
export function indexAt(sp: TrackSpline, s: number): number {
  let lo = 0;
  let hi = sp.count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sp.dist[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  return sp.closed ? lo : Math.min(lo, sp.count - 2);
}

/** Point and tangent at arc length s (wraps on closed splines, clamps on open). */
export function pointAt(sp: TrackSpline, s: number): { x: number; z: number; tx: number; tz: number } {
  s = sp.closed ? ((s % sp.length) + sp.length) % sp.length : Math.min(Math.max(s, 0), sp.length);
  const i = indexAt(sp, s);
  const j = (i + 1) % sp.count;
  const segLen = j === 0 ? sp.length - sp.dist[i] : sp.dist[j] - sp.dist[i];
  const t = Math.min(1, (s - sp.dist[i]) / (segLen || 1));
  return {
    x: sp.px[i] + (sp.px[j] - sp.px[i]) * t,
    z: sp.pz[i] + (sp.pz[j] - sp.pz[i]) * t,
    tx: sp.tx[i] + (sp.tx[j] - sp.tx[i]) * t,
    tz: sp.tz[i] + (sp.tz[j] - sp.tz[i]) * t,
  };
}
