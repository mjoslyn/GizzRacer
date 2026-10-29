import { describe, expect, it } from 'vitest';
import { HUMP_HEIGHT, HUMP_RAMP, PAD_HALF_WIDTH, SLALOM_STEP, humpKeys, planEnrichment } from '../src/tracks/enrich';
import { RAW_TRACK_LIST, TRACK_LIST } from '../src/tracks/index';
import { Ribbon, Track } from '../src/tracks/track';

describe('layout extras', () => {
  it('give nearly every track a hump, an apex pad or a slalom, never on top of each other', () => {
    let humps = 0;
    let pads = 0;
    let slaloms = 0;
    let touched = 0;
    for (const t of RAW_TRACK_LIST) {
      const p = planEnrichment(t.build());
      humps += p.humps.length;
      pads += p.pads.length;
      if (p.slalom !== null) slaloms++;
      if (p.humps.length || p.pads.length) touched++;
      // A slalom only stands in for a hump.
      if (p.slalom !== null) expect(p.humps).toHaveLength(0);
      for (const a of p.humps) for (const pad of p.pads) expect(Math.abs(pad.s - a - HUMP_RAMP) > HUMP_RAMP + 10).toBe(true);
    }
    expect(touched).toBeGreaterThanOrEqual(22);
    expect(humps).toBeGreaterThanOrEqual(10);
    // A slalom stands in where no hump fits; since the tangled relays nearly every track takes a hump.
    expect(slaloms).toBeGreaterThanOrEqual(1);
    expect(pads).toBeGreaterThanOrEqual(30);
  });

  it('keeps clear of junctions, jumps, item rows, pads, landmarks and the grid', () => {
    for (const t of RAW_TRACK_LIST) {
      const def = t.build();
      const p = planEnrichment(def);
      const spots = [...p.humps.map((a) => [a, a + 2 * HUMP_RAMP]), ...p.pads.map((x) => [x.s, x.s + x.length])];
      for (const [from, to] of spots) {
        expect(from).toBeGreaterThan(30);
        expect(to).toBeLessThan(def.main.length - 60);
        for (const b of def.branches) {
          expect(to < b.mainFrom - 20 || from > b.mainFrom + 20).toBe(true);
          expect(to < b.mainTo - 20 || from > b.mainTo + 20).toBe(true);
        }
        for (const [a, b] of def.main.gaps) expect(to < a - 20 || from > b + 20).toBe(true);
        for (const row of def.itemBoxes) if (row.ribbon === undefined || row.ribbon < 0) expect(to < row.s - 20 || from > row.s + 20).toBe(true);
        for (const pad of def.boostPads) expect(to < pad.s - 15 || from > pad.s + pad.length + 15).toBe(true);
      }
    }
  });

  it('a hump rides the road: a sharp crest HUMP_HEIGHT over the road, back down to it either side', () => {
    const base = (s: number) => 2 + s * 0.01;
    const keys = humpKeys(100, base);
    const r = new Ribbon({ points: [[0, 0], [0, 400]], closed: false, length: 400, sections: [{ name: 'a', from: 0, to: 400, halfWidth: 8 }], elevation: [[0, base(0)], ...keys, [400, base(400)]], gaps: [] });
    expect(r.heightAtBuilder(100)).toBeCloseTo(base(100), 5);
    expect(r.heightAtBuilder(100 + HUMP_RAMP)).toBeCloseTo(base(120) + HUMP_HEIGHT, 5);
    expect(r.heightAtBuilder(100 + 2 * HUMP_RAMP)).toBeCloseTo(base(140), 5);
    // Steep up to the crest, then a drop: the lip is what launches a kart.
    expect(r.heightAtBuilder(118) - r.heightAtBuilder(116)).toBeGreaterThan(0.2);
    expect(r.heightAtBuilder(122)).toBeLessThan(r.heightAtBuilder(120));
  });

  it('an apex pad sits inside the bend, on the road; a slalom staggers across it', () => {
    for (const t of RAW_TRACK_LIST) {
      const def = t.build();
      const { pads, slalom } = planEnrichment(def);
      const r = new Ribbon(def.main);
      const slalomPads = slalom === null ? [] : pads.filter((p) => p.s >= slalom - 1 && p.s <= slalom + 2 * SLALOM_STEP + 1);
      if (slalom !== null) {
        expect(slalomPads).toHaveLength(3);
        expect(Math.sign(slalomPads[0].lateral)).toBe(-Math.sign(slalomPads[1].lateral));
        expect(Math.sign(slalomPads[2].lateral)).toBe(Math.sign(slalomPads[0].lateral));
      }
      for (const pad of pads) {
        const sp = r.spline;
        const target = (pad.s + pad.length / 2) * r.scale;
        let i = 0;
        while (i < sp.count - 1 && sp.dist[i] < target) i++;
        expect(Math.abs(pad.lateral) + PAD_HALF_WIDTH).toBeLessThan(r.halfWidth[i]);
        // Inside: the lateral is opposite in sign to the curvature (a left turn has its inside on the left).
        if (!slalomPads.includes(pad)) expect(Math.sign(pad.lateral)).toBe(-Math.sign(r.curvature[i]));
      }
    }
  });

  it('the picker list carries the extras, and every track still builds and locates', () => {
    for (const [k, t] of TRACK_LIST.entries()) {
      const raw = RAW_TRACK_LIST[k].build();
      const def = t.build();
      const p = planEnrichment(raw);
      expect(def.boostPads.length).toBe(raw.boostPads.length + p.pads.length);
      expect(def.main.elevation.length).toBeGreaterThanOrEqual(raw.main.elevation.length);
      const track = new Track(def);
      const pose = track.respawnPose(10);
      expect(track.locate(pose.x, pose.z, pose.y).onRoad).toBe(true);
      for (const a of p.humps) {
        const r = track.main;
        // The crest stands HUMP_HEIGHT over the road either side of it.
        expect(r.heightAtBuilder(a + HUMP_RAMP) - (r.heightAtBuilder(a) + r.heightAtBuilder(a + 2 * HUMP_RAMP)) / 2).toBeGreaterThan(HUMP_HEIGHT - 0.3);
      }
    }
  });
});
