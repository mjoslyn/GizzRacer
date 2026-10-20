import { describe, expect, it } from 'vitest';
import { PHYSICS_DT } from '../src/core/loop';
import { BOULDER_STAGES, GATE_BOOST, GRAVITY_ASSIST, HOLE_CORE, HOP_BOOST, HazardSystem, JET_STAGES, RAMP_LAUNCH, RAM_BOOST, TORNADO_LIFT, DEVIL_LIFT, type HazardPose } from '../src/items/hazards';
import { createKartState, type KartState } from '../src/physics/kart';
import { TRACK_LIST } from '../src/tracks/index';
import { Track } from '../src/tracks/track';

/** A hazard system on the track with this id. */
function hazards(id: string): HazardSystem {
  return new HazardSystem(new Track(TRACK_LIST.find((t) => t.id === id)!.build()));
}

/** Steps race time until hazard `kind` is in a stage `ok` likes, and returns that pose. */
function when(h: HazardSystem, kind: HazardPose['kind'], ok: (p: HazardPose) => boolean): HazardPose {
  for (let t = 0; t < 60; t += 0.02) {
    h.update(t);
    const p = h.poses.find((q) => q.kind === kind && ok(q));
    if (p) return p;
  }
  throw new Error(`no ${kind} in that stage`);
}

/** A kart sitting right on a hazard, `dx` metres off it. */
function kartAt(p: HazardPose, dx = 0): KartState {
  const s = createKartState(p.x + dx, p.z, p.heading);
  s.y = s.groundY = p.ground;
  return s;
}

const landed = (q: HazardPose) => q.phase > BOULDER_STAGES.land + 0.05 && q.phase < BOULDER_STAGES.crumble - 0.05;

describe('hazards that help when used well', () => {
  it.each([
    ['volcano-fortress', 'lavaBombs'],
    ['hell-on-mars', 'meteors'],
    ['deadstick-drop', 'gliders'],
  ] as const)('%s: a %s that has come down is a ramp, hopped onto, and solid driven into', (id, kind) => {
    const h = hazards(id);
    const p = when(h, kind, landed);
    const driven = kartAt(p, 0.4);
    h.collide([driven], PHYSICS_DT);
    expect(driven.spinTime).toBeGreaterThan(0);
    const hopped = kartAt(p, 0.4);
    hopped.hopAge = 0.1;
    expect(h.collide([hopped], PHYSICS_DT)[0]).toMatchObject({ by: kind, good: true });
    expect(hopped.vy).toBe(RAMP_LAUNCH);
    expect(hopped.trickWindow).toBeGreaterThan(0);
    expect(hopped.spinTime).toBe(0);
  });

  it.each([
    ['polygondwanaland-jungle', 'rollers', () => true],
    ['ice-v-glacier', 'iceBlocks', () => true],
    ['supercell', 'hail', landed],
    ['petrodragonic-apocalypse', 'oilBombs', landed],
    ['rattlesnake-run', 'boulders', landed],
    ['rattlesnake-run', 'tumbleweeds', () => true],
  ] as const)('%s: a %s rammed on a boost gives way and the boost runs on', (id, kind, ok) => {
    const h = hazards(id);
    const p = when(h, kind, ok);
    const s = kartAt(p);
    s.boostTime = 0.5;
    expect(h.collide([s], PHYSICS_DT)[0]).toMatchObject({ by: kind, good: true });
    expect(s.boostTime).toBeCloseTo(0.5 + RAM_BOOST);
    expect(s.spinTime).toBe(0);
  });

  it.each([
    ['rattlesnake-run', 'snakes'],
    ['fishies-lagoon', 'fish'],
  ] as const)('%s: a %s hopped is a boost, and a hit when not', (id, kind) => {
    const h = hazards(id);
    const p = when(h, kind, (q) => q.active);
    const plain = kartAt(p);
    expect(h.collide([plain], PHYSICS_DT)[0]).toMatchObject({ by: kind });
    expect(plain.spinTime).toBeGreaterThan(0);
    const hopped = kartAt(p);
    hopped.hopAge = 0.1;
    expect(h.collide([hopped], PHYSICS_DT)[0]).toMatchObject({ by: kind, good: true });
    expect(hopped.boostTime).toBeCloseTo(HOP_BOOST);
  });

  it.each([
    ['cyboogie-city', 'lasers'],
    ['volcano-fortress', 'flameJets'],
  ] as const)('%s: slipping through %s while they warm up is a boost; once they fire, a hit', (id, kind) => {
    const h = hazards(id);
    const warming = when(h, kind, (q) => q.phase > JET_STAGES.sputter + 0.02 && q.phase < JET_STAGES.fire - 0.02);
    const s = kartAt(warming);
    expect(h.collide([s], PHYSICS_DT)[0]).toMatchObject({ by: kind, good: true });
    expect(s.boostTime).toBeCloseTo(GATE_BOOST);
    const firing = when(h, kind, (q) => q.active);
    const burnt = kartAt(firing);
    expect(h.collide([burnt], PHYSICS_DT)[0]).toEqual({ kart: burnt, by: kind });
  });

  it.each([
    ['rattlesnake-run', 'dustDevils', DEVIL_LIFT],
    ['supercell', 'tornadoes', TORNADO_LIFT],
  ] as const)('%s: hop in a %s and it throws you up for a trick', (id, kind, lift) => {
    const h = hazards(id);
    const p = when(h, kind, () => true);
    const s = kartAt(p, 1);
    s.hopAge = 0.1;
    expect(h.collide([s], PHYSICS_DT)[0]).toMatchObject({ by: kind, good: true });
    expect(s.vy).toBe(lift);
    expect(s.trickWindow).toBeGreaterThan(0);
  });

  it('drifting through a butterfly swarm charges the sparks faster', () => {
    const h = hazards('butterfly-skyway');
    const p = when(h, 'butterflies', () => true);
    const drifting = kartAt(p, 1);
    drifting.driftDir = 1;
    const straight = kartAt(p, 1);
    h.collide([drifting, straight], PHYSICS_DT);
    expect(drifting.driftCharge).toBeGreaterThan(straight.driftCharge);
  });

  it('skimming a black hole on a boost is a gravity assist: the boost runs on while you are in its pull', () => {
    const h = hazards('murder-of-the-universe');
    const p = when(h, 'blackHoles', () => true);
    const s = kartAt(p, HOLE_CORE + 3);
    s.boostTime = 0.5;
    for (let i = 0; i < 30; i++) h.collide([s], PHYSICS_DT);
    expect(s.boostTime).toBeCloseTo(0.5 + 30 * PHYSICS_DT * GRAVITY_ASSIST);
    expect(s.spinTime).toBe(0);
  });
});
