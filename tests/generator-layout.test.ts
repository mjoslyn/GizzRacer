import { describe, expect, it } from 'vitest';
import { dailyParams } from '../src/core/daily';
import { parseGenId } from '../src/net/recordCheck';
import { GEN_LAYOUT, GEN_LENGTHS, GEN_SHAPES, GEN_THEMES, OVERPASS, generateTrack, generatorStats, trackId, type GenParams, type GenShape } from '../src/tracks/generator';
import { Track, type TrackDef } from '../src/tracks/track';
import { CLASSIC, CLASSIC_HASHES, trackHash } from './generator-classic';

const hash = (p: GenParams) => trackHash(generateTrack(p));

describe('generator layouts: old tracks stay as they were', () => {
  it('builds old params (no layout) byte for byte as the rectangle generator did', () => {
    const want = CLASSIC_HASHES;
    expect(want.length).toBe(CLASSIC.length);
    const got = CLASSIC.map(hash);
    const changed = CLASSIC.filter((_, i) => got[i] !== want[i]).map((p) => `${trackId(p)}`);
    expect(changed).toEqual([]);
  }, 120_000);

  it('layout 1 is the same as no layout', () => {
    for (const p of CLASSIC.slice(0, 12)) expect(hash({ ...p, layout: 1 })).toBe(hash(p));
  });

  it('gives a new layout its own record id, which parses back to the same dials', () => {
    const p: GenParams = { seed: 42, theme: 'lagoon', complexity: 4, length: 'medium' };
    expect(trackId(p)).toBe('gen-lagoon-4-medium-42');
    expect(trackId({ ...p, layout: GEN_LAYOUT })).toBe(`gen-lagoon-4-medium-42-l${GEN_LAYOUT}`);
    expect(parseGenId(trackId(p))).toEqual(p);
    expect(parseGenId(trackId({ ...p, layout: GEN_LAYOUT }))).toEqual({ ...p, layout: GEN_LAYOUT });
    expect(generateTrack({ ...p, layout: GEN_LAYOUT }).id).toBe(trackId({ ...p, layout: GEN_LAYOUT }));
  });

  it('keeps past dailies on the rectangle and moves the daily to the new layout from its cut-over', () => {
    expect(dailyParams(new Date('2026-11-01T12:00:00Z')).layout).toBeUndefined();
    expect(dailyParams(new Date('2026-11-09T12:00:00Z')).layout).toBeUndefined();
    expect(dailyParams(new Date('2026-11-10T12:00:00Z')).layout).toBe(GEN_LAYOUT);
    expect(dailyParams(new Date('2027-03-01T12:00:00Z')).layout).toBe(GEN_LAYOUT);
    // The rest of the day's draw is unchanged by it.
    const { layout: _l, ...dials } = dailyParams(new Date('2026-11-10T12:00:00Z'));
    expect(GEN_THEMES).toContain(dials.theme);
    expect(generateTrack(dailyParams(new Date('2026-11-12T12:00:00Z'))).id).toMatch(new RegExp(`-l${GEN_LAYOUT}$`));
  });
});

/**
 * How much a lap reads as a box, 0 to 1: the share of the lap that runs
 * within 15% of its smallest bounding rectangle's edge, times the share of
 * that rectangle the lap encloses. A box round the edge of the map, the
 * middle empty, scores near 1; an L, a T or a figure of eight much less.
 */
export function boxiness(def: TrackDef): number {
  const pts = def.main.points;
  let best: { area: number; us: number[]; vs: number[] } | null = null;
  for (let deg = 0; deg < 90; deg += 2) {
    const a = (deg * Math.PI) / 180;
    const us = pts.map(([x, z]) => x * Math.cos(a) + z * Math.sin(a));
    const vs = pts.map(([x, z]) => -x * Math.sin(a) + z * Math.cos(a));
    const area = (Math.max(...us) - Math.min(...us)) * (Math.max(...vs) - Math.min(...vs));
    if (!best || area < best.area) best = { area, us, vs };
  }
  const { us, vs } = best!;
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const d = 0.15 * Math.min(u1 - u0, v1 - v0);
  const edge = us.filter((u, i) => Math.min(u - u0, u1 - u, vs[i] - v0, v1 - vs[i]) < d).length / us.length;
  // Enclosed share, on a grid (even-odd, so a figure of eight's two loops both count).
  const N = 60;
  let inside = 0;
  for (let gi = 0; gi < N; gi++) {
    for (let gj = 0; gj < N; gj++) {
      const u = u0 + ((gi + 0.5) * (u1 - u0)) / N;
      const v = v0 + ((gj + 0.5) * (v1 - v0)) / N;
      let odd = false;
      for (let k = 0, m = us.length - 1; k < us.length; m = k++) {
        if (vs[k] > v !== vs[m] > v && u < ((us[m] - us[k]) * (v - vs[k])) / (vs[m] - vs[k]) + us[k]) odd = !odd;
      }
      if (odd) inside++;
    }
  }
  return edge * (inside / (N * N));
}

/** Where the lap passes over itself: pairs of points close on the map, far apart along the road. */
function overpasses(track: Track): { dh: number; deck: boolean }[] {
  const sp = track.spline;
  const out: { dh: number; deck: boolean }[] = [];
  for (let i = 0; i < sp.count; i += 2) {
    for (let j = i + 2; j < sp.count; j += 2) {
      const along = Math.abs(sp.dist[i] - sp.dist[j]);
      if (Math.min(along, sp.length - along) < 120) continue;
      if (Math.hypot(sp.px[i] - sp.px[j], sp.pz[i] - sp.pz[j]) > track.main.halfWidth[i] + track.main.halfWidth[j]) continue;
      const deck = (k: number) => !!track.def.main.sections[track.main.sectionIndex[k]]?.bridge;
      out.push({ dh: Math.abs(track.main.heightAt(sp.dist[i]) - track.main.heightAt(sp.dist[j])), deck: deck(i) || deck(j) });
    }
  }
  return out;
}

/** Twists 4 and 5, medium: story mode's dials. */
const STORY = Array.from({ length: 300 }, (_, i): GenParams => ({ seed: 900_000 + i * 104_723, theme: GEN_THEMES[i % GEN_THEMES.length], complexity: 4 + (i % 2), length: 'medium', layout: GEN_LAYOUT }));
const STORY_BUILT = STORY.map((p) => {
  const def = generateTrack(p);
  return { p, def, shape: generatorStats.shape };
});
/** Above this a lap reads as a box. */
const BOXY = 0.72;

describe('generator layouts: shapes, not boxes', () => {
  it('draws every shape at twists 4 and 5, and never the rectangle', () => {
    const count = new Map<GenShape, number>();
    for (const { shape } of STORY_BUILT) count.set(shape, (count.get(shape) ?? 0) + 1);
    console.log(`shapes at twists 4-5, medium, ${STORY.length} seeds: ${[...count].map(([s, n]) => `${s} ${n}`).join(', ')}`);
    expect(count.get('rectangle') ?? 0).toBe(0);
    for (const shape of GEN_SHAPES.filter((s) => s !== 'rectangle')) expect(count.get(shape) ?? 0, shape).toBeGreaterThanOrEqual(STORY.length * 0.02);
    // No shape crowds the rest out.
    for (const [shape, n] of count) expect(n, shape).toBeLessThan(STORY.length * 0.3);
  });

  it('never falls back on the plain loop', () => {
    const before = generatorStats.fallbacks;
    for (const p of STORY.slice(0, 60)) generateTrack(p);
    for (const length of GEN_LENGTHS) for (let c = 1; c <= 5; c++) for (let k = 0; k < 8; k++) generateTrack({ seed: 31 + k * 7919 + c, theme: GEN_THEMES[(k * 5 + c) % GEN_THEMES.length], complexity: c, length, layout: GEN_LAYOUT });
    expect(generatorStats.fallbacks).toBe(before);
  });

  it('keeps every twists 4 and 5 lap under the box line, which the old rectangle mostly fails', () => {
    const shaped = STORY_BUILT.map(({ p, def }) => ({ p, score: boxiness(def) }));
    for (const { p, score } of shaped) expect(score, trackId(p)).toBeLessThan(BOXY);
    const old = STORY.slice(0, 120).map((p) => boxiness(generateTrack({ ...p, layout: undefined })));
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    console.log(`boxiness at twists 4-5: shapes mean ${mean(shaped.map((s) => s.score)).toFixed(2)}, max ${Math.max(...shaped.map((s) => s.score)).toFixed(2)}; old rectangles mean ${mean(old).toFixed(2)}, ${old.filter((s) => s >= BOXY).length}/${old.length} over the line`);
    expect(old.filter((s) => s >= BOXY).length).toBeGreaterThan(old.length / 2);
    expect(mean(old)).toBeGreaterThan(mean(shaped.map((s) => s.score)) + 0.2);
  }, 120_000);

  it('crosses itself only on a flyover: a deck high over the road below, and every figure of eight has one', () => {
    let eights = 0;
    for (const { p, def, shape } of STORY_BUILT) {
      const over = overpasses(new Track(def));
      for (const o of over) {
        expect(o.deck, trackId(p)).toBe(true);
        expect(o.dh, trackId(p)).toBeGreaterThanOrEqual(OVERPASS);
      }
      if (shape === 'eight') {
        eights++;
        expect(over.length, trackId(p)).toBeGreaterThan(0);
      }
    }
    expect(eights).toBeGreaterThan(0);
  }, 120_000);
});
