import { describe, expect, it } from 'vitest';
import { ParticleStore, TILE, fadeAt, makeBuffers } from '../src/render/fx/particles';
import { FX_BUDGET, armBlink, burstCount, easeOut, flashCurve, nudgeFor, ring, thudLevel, tossArc } from '../src/render/fx/envelopes';

/**
 * The effects' pooled particles and the timing curves behind the item and
 * hit animations (render/fx): pure numbers, no GPU.
 */
describe('particle store', () => {
  it('spawns into free slots, moves, and frees particles when their life is up', () => {
    const p = new ParticleStore(8);
    p.spawn(TILE.glow).at(0, 5, 0).vel(2, 0, 0).life(0.5);
    expect(p.count).toBe(1);
    p.step(0.25);
    expect(p.px[0]).toBeCloseTo(0.5);
    expect(p.count).toBe(1);
    p.step(0.3);
    expect(p.count).toBe(0);
  });

  it('falls under gravity and bounces off its floor, losing height each bounce', () => {
    const p = new ParticleStore(4);
    p.spawn(TILE.chunk).at(0, 1, 0).vel(0, 0, 0).life(10).physics(20).floor(0, 0.5);
    let peak = 0;
    let landed = false;
    for (let t = 0; t < 3; t += 1 / 60) {
      p.step(1 / 60);
      expect(p.py[0]).toBeGreaterThanOrEqual(0);
      if (p.py[0] === 0) landed = true;
      if (landed) peak = Math.max(peak, p.py[0]);
    }
    expect(landed).toBe(true);
    expect(peak).toBeLessThan(1);
    // It comes to rest on the floor.
    expect(p.py[0]).toBeCloseTo(0, 2);
  });

  it('caps at its size: a full store takes over a slot rather than growing', () => {
    const p = new ParticleStore(16);
    for (let i = 0; i < 40; i++) p.spawn(TILE.glow).life(5);
    expect(p.count).toBe(16);
    expect(p.stolen).toBe(24);
    const out = makeBuffers(16);
    expect(p.write(out)).toBe(16);
  });

  it('draws a one-frame mark once: written this frame, gone at the next step, even paused', () => {
    const p = new ParticleStore(4);
    const out = makeBuffers(4);
    p.spawn(TILE.ring).at(1, 2, 3).life(0).size(2).flat();
    expect(p.write(out)).toBe(1);
    expect(Array.from(out.offset.slice(0, 3))).toEqual([1, 2, 3]);
    // size, rotation, tile, flat
    expect(out.misc[0]).toBe(2);
    expect(out.misc[2]).toBe(TILE.ring);
    expect(out.misc[3]).toBe(1);
    p.step(0);
    expect(p.write(out)).toBe(0);
  });

  it('a paused frame (dt 0) keeps a burst just where it is', () => {
    const p = new ParticleStore(4);
    p.spawn(TILE.glow).at(0, 0, 0).vel(3, 3, 3).life(1).physics(10);
    p.step(0);
    p.step(0);
    expect(p.count).toBe(1);
    expect(p.px[0]).toBe(0);
  });

  it('writes its colour turning, its size growing and its opacity fading over its life', () => {
    const p = new ParticleStore(2);
    const out = makeBuffers(2);
    p.spawn(TILE.puff).life(1).size(1, 2).color(0xff0000, 0x0000ff, 1).fade(0, 0.5);
    p.step(0.5);
    p.write(out);
    expect(out.color[0]).toBeCloseTo(0.5);
    expect(out.color[2]).toBeCloseTo(0.5);
    expect(out.color[3]).toBeCloseTo(1);
    expect(out.misc[0]).toBeCloseTo(2);
    p.step(0.4);
    p.write(out);
    expect(out.color[3]).toBeLessThan(0.2);
  });

  it('flips spawns in x for mirror mode, positions and velocities both', () => {
    const p = new ParticleStore(2);
    p.flipX = true;
    p.spawn(TILE.glow).at(3, 1, 2).vel(4, 0, 1);
    expect(p.px[0]).toBe(-3);
    expect(p.vx[0]).toBe(-4);
    expect(p.pz[0]).toBe(2);
  });

  it('allocates nothing per frame: stepping and writing reuse their arrays', () => {
    const p = new ParticleStore(64);
    const out = makeBuffers(64);
    const before = out.offset;
    for (let i = 0; i < 64; i++) p.spawn(TILE.glow).life(1).vel(i, 0, 0);
    p.step(1 / 60);
    p.write(out);
    expect(out.offset).toBe(before);
    expect(p.px.length).toBe(64);
  });
});

describe('fade and budgets', () => {
  it('fades in over its fade-in and out from its start to nothing at the end', () => {
    expect(fadeAt(0, 0, 0.1, 0.5)).toBe(0);
    expect(fadeAt(0.05, 0.05, 0.1, 0.5)).toBeCloseTo(0.5);
    expect(fadeAt(0.3, 0.3, 0.1, 0.5)).toBe(1);
    expect(fadeAt(1, 1, 0, 0.5)).toBeCloseTo(0);
  });

  it('Low keeps fewer particles and spawns fewer than High, and never none of a burst', () => {
    expect(FX_BUDGET.low.add).toBeLessThan(FX_BUDGET.medium.add);
    expect(FX_BUDGET.medium.add).toBeLessThan(FX_BUDGET.high.add);
    expect(FX_BUDGET.low.alpha).toBeLessThan(FX_BUDGET.high.alpha);
    expect(burstCount(20, FX_BUDGET.low.scale)).toBeLessThan(burstCount(20, FX_BUDGET.high.scale));
    expect(burstCount(1, FX_BUDGET.low.scale)).toBe(1);
    expect(burstCount(0, 1)).toBe(0);
  });
});

describe('timing curves', () => {
  it('a ring starts still, kicks, and rings down', () => {
    expect(ring(0, 20, 4)).toBe(0);
    expect(Math.abs(ring(0.05, 20, 4))).toBeGreaterThan(0.3);
    expect(Math.abs(ring(1.5, 20, 4))).toBeLessThan(0.01);
    expect(ring(-1, 20, 4)).toBe(0);
  });

  it('a flash is sharp in and slow out, and nothing outside its life', () => {
    expect(flashCurve(0)).toBe(0);
    expect(flashCurve(0.15)).toBeCloseTo(1);
    expect(flashCurve(0.6)).toBeGreaterThan(0);
    expect(flashCurve(0.6)).toBeLessThan(flashCurve(0.3));
    expect(flashCurve(1)).toBe(0);
  });

  it('a toss lands where it was thrown to, highest midway', () => {
    expect(tossArc(0, 2)).toEqual([0, 0]);
    const [along, lift] = tossArc(1, 2);
    expect(along).toBeCloseTo(1);
    expect(lift).toBeCloseTo(0);
    expect(tossArc(0.5, 2)[1]).toBeCloseTo(2);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });

  it('an arming banana blinks, faster as it comes, and stops once armed', () => {
    const flips = (left: number) => {
      let n = 0;
      let last = armBlink(left, 0.4, 0);
      for (let t = 0; t < 1; t += 0.001) {
        const on = armBlink(left, 0.4, t);
        if (on !== last) n++;
        last = on;
      }
      return n;
    };
    expect(flips(0.05)).toBeGreaterThan(flips(0.39));
    expect(armBlink(0, 0.4, 0.3)).toBe(false);
  });

  it('a bump thuds and nudges the camera by how hard it was, and a nudge of a kart is nothing', () => {
    expect(thudLevel(2)).toBe(0);
    expect(thudLevel(6)).toBeGreaterThan(0);
    expect(thudLevel(30)).toBe(1);
    expect(nudgeFor(3)).toBe(0);
    expect(nudgeFor(8)).toBeGreaterThan(nudgeFor(5));
    expect(nudgeFor(100)).toBeLessThanOrEqual(0.35);
  });
});
