import { describe, expect, it } from 'vitest';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { NEUTRAL_INPUT, type InputFrame } from '../src/core/input';
import { PHYSICS_DT } from '../src/core/loop';
import { Race } from '../src/core/race';
import { GLIDE_CLIMB, GLIDE_DIVE_TOP, GLIDE_SINK, GLIDE_STALL, GLIDE_TIME, LAUNCH_SPEED, LAUNCH_VY, TRICK_BOOST, createKartState, stepKart, type DriveEnv, type KartState, type StepEvents } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { LAUNCHER_LENGTH, launchersFor, planEnrichment } from '../src/tracks/enrich';
import { generateTrack } from '../src/tracks/generator';
import { RAW_TRACK_LIST, TRACK_LIST } from '../src/tracks/index';
import { pointAt } from '../src/tracks/spline';
import { Ribbon, Track } from '../src/tracks/track';

const params = kartParams(RACERS[0].stats, '150cc');
const GAS: InputFrame = { ...NEUTRAL_INPUT, throttle: 1 };

/** Flat ground with a launcher from z 0 to 6, or a plain pad there if `launch` is false. */
function launcherEnv(launch = true): DriveEnv {
  return {
    probe: (s) => ({ height: 0, surface: launch && s.z >= 0 && s.z < 6 ? 'launch' : 'road' }),
    collide: () => null,
  };
}

/** Gas, and a hop the moment the kart is thrown up off a launcher: a trick, which opens the glider. */
function tricking(over: (s: KartState) => Partial<InputFrame> = () => ({})): (s: KartState) => InputFrame {
  let done = false;
  return (s) => {
    const press = !done && s.launcher && s.trickWindow > 0;
    if (press) done = true;
    return { ...GAS, drift: press, driftPressed: press, ...over(s) };
  };
}

/** Drives a kart at top speed from 20 m short of the launcher until it lands (or `seconds` run out); it tricks off it unless told otherwise. */
function fly(launch = true, inp: (s: KartState) => InputFrame = tricking(), seconds = 6) {
  const s = createKartState(0, -20, 0);
  s.speed = params.topSpeed;
  const env = launcherEnv(launch);
  const events: StepEvents[] = [];
  let launchedAt = -1;
  let landedAt = -1;
  let maxSink = 0;
  let wasGliding = false;
  for (let t = 0; t < seconds; t += PHYSICS_DT) {
    const ev = stepKart(s, inp(s), params, env, PHYSICS_DT);
    events.push(ev);
    if (ev.glided) launchedAt = s.z;
    if (s.glideTime > 0) {
      wasGliding = true;
      maxSink = Math.max(maxSink, -s.vy);
    }
    if (wasGliding && s.grounded && landedAt < 0) landedAt = s.z;
  }
  return { s, events, launchedAt, landedAt, maxSink };
}

describe('launchers and gliders', () => {
  it('a launcher throws the kart up with a little speed; the glider stays shut without a trick', () => {
    const s = createKartState(0, -20, 0);
    s.speed = params.topSpeed * 0.8;
    const env = launcherEnv();
    let ev: StepEvents | null = null;
    while (!ev?.launched) ev = stepKart(s, GAS, params, env, PHYSICS_DT);
    expect(s.grounded).toBe(false);
    expect(s.vy).toBeGreaterThan(LAUNCH_VY - 1);
    expect(s.speed).toBeGreaterThanOrEqual(params.topSpeed * LAUNCH_SPEED - 1e-9);
    const plain = fly(true, () => GAS);
    expect(plain.events.some((e) => e.glided)).toBe(false);
    expect(plain.maxSink).toBe(0);
    expect(plain.s.grounded).toBe(true);
    expect(plain.s.launcher).toBe(false);
  });

  it('a trick off the launcher opens the glider, after it as well as on it', () => {
    const { events } = fly(true, tricking(), 0.8);
    const i = events.findIndex((e) => e.glided);
    expect(i).toBeGreaterThan(0);
    // A hop just before the launcher counts too.
    let hopped = false;
    const early = fly(true, (k) => {
      const press = !hopped && k.z > -2;
      if (press) hopped = true;
      return { ...GAS, drift: press, driftPressed: press };
    }, 0.8);
    expect(early.events.some((e) => e.glided)).toBe(true);
    // Too late (the trick window long shut): no glider.
    let late = false;
    const tooLate = fly(true, (k) => {
      const press = !late && k.launcher && k.vy < 0;
      if (press) late = true;
      return { ...GAS, drift: press, driftPressed: press };
    }, 3);
    expect(tooLate.events.some((e) => e.glided)).toBe(false);
  });

  it('the glider holds the fall to a slow sink and carries the kart far further than a plain hop off the lip', () => {
    const glide = fly();
    expect(glide.maxSink).toBeLessThanOrEqual(GLIDE_SINK + 1e-6);
    expect(glide.landedAt - glide.launchedAt).toBeGreaterThan(40);
    // Further than the same launch without the trick.
    const s = createKartState(0, -20, 0);
    s.speed = params.topSpeed;
    while (!s.launcher) stepKart(s, GAS, params, launcherEnv(), PHYSICS_DT);
    while (!s.grounded) stepKart(s, GAS, params, launcherEnv(), PHYSICS_DT);
    expect(glide.landedAt).toBeGreaterThan(s.z + 20);
    // The glider folds on landing.
    expect(glide.s.grounded).toBe(true);
    expect(glide.s.glideTime).toBe(0);
  });

  it('braking dives: down sooner', () => {
    const glide = fly();
    const dive = fly(true, tricking((s) => ({ brake: s.glideTime > 0 && s.vy < 0 ? 1 : 0 })));
    expect(dive.maxSink).toBeGreaterThan(GLIDE_SINK * 2);
    expect(dive.landedAt).toBeLessThan(glide.landedAt - 10);
  });

  it('up climbs, trading speed for height until it stalls; down dives and picks speed up', () => {
    // Height and speed a second and a half into the glide, by pitch.
    const at = (pitch: number) => {
      const s = createKartState(0, -20, 0);
      s.speed = params.topSpeed;
      const inp = tricking((k) => ({ pitch: k.glideTime > 0.3 ? pitch : 0 }));
      // High over the road, so nothing lands it.
      const env: DriveEnv = { probe: (k) => ({ height: k.z < 6 ? 0 : -50, surface: k.z >= 0 && k.z < 6 ? 'launch' : 'road' }), collide: () => null };
      let maxVy = -Infinity;
      for (let t = 0; t < 1.8; t += PHYSICS_DT) {
        stepKart(s, inp(s), params, env, PHYSICS_DT);
        if (s.glideTime > 0.6) maxVy = Math.max(maxVy, s.vy);
      }
      return { y: s.y, speed: s.speed, maxVy, gliding: s.glideTime > 0 };
    };
    const level = at(0);
    const up = at(1);
    const down = at(-1);
    expect(level.gliding && up.gliding && down.gliding).toBe(true);
    expect(up.y).toBeGreaterThan(level.y + 1.5);
    expect(up.maxVy).toBeLessThanOrEqual(GLIDE_CLIMB + 1e-6);
    expect(up.speed).toBeLessThan(level.speed);
    expect(up.speed).toBeGreaterThanOrEqual(params.topSpeed * GLIDE_STALL - 1e-6);
    expect(down.y).toBeLessThan(level.y - 3);
    expect(down.speed).toBeGreaterThan(level.speed);
    expect(down.speed).toBeLessThanOrEqual(params.topSpeed * GLIDE_DIVE_TOP + 1e-6);
  });

  it('a stalled glider climbs no more', () => {
    const s = createKartState(0, 0, 0);
    Object.assign(s, { grounded: false, y: 20, groundY: -50, vy: -1, glideTime: 0.5, launcher: true, speed: params.topSpeed * GLIDE_STALL });
    const env: DriveEnv = { probe: () => ({ height: -50, surface: 'road' }), collide: () => null };
    for (let t = 0; t < 0.5; t += PHYSICS_DT) stepKart(s, { ...GAS, pitch: 1 }, params, env, PHYSICS_DT);
    expect(s.vy).toBeLessThan(0);
    expect(s.speed).toBeCloseTo(params.topSpeed * GLIDE_STALL, 5);
  });

  it('the glider folds after GLIDE_TIME, high or not', () => {
    const s = createKartState(0, -20, 0);
    s.speed = params.topSpeed;
    // A launcher on the edge of a long drop: nothing to land on for a long way.
    const env: DriveEnv = { probe: (k) => ({ height: k.z < 6 ? 0 : -200, surface: k.z >= 0 && k.z < 6 ? 'launch' : 'road' }), collide: () => null };
    let open = 0;
    const inp = tricking();
    for (let t = 0; t < 5; t += PHYSICS_DT) {
      stepKart(s, inp(s), params, env, PHYSICS_DT);
      if (s.glideTime > 0) open += PHYSICS_DT;
    }
    expect(open).toBeGreaterThan(GLIDE_TIME - 0.1);
    expect(open).toBeLessThan(GLIDE_TIME + 0.1);
    expect(s.glideTime).toBe(0);
  });

  it('steers in the air with the glider open, where a plain jump barely turns', () => {
    const turn = (launch: boolean) => {
      const s = createKartState(0, -20, 0);
      s.speed = params.topSpeed;
      // Off a kicker without a glider: the same climb, launched by the road.
      const env: DriveEnv = launch ? launcherEnv() : { probe: (k) => ({ height: k.z < 0 ? 0 : k.z < 6 ? k.z * 0.6 : -50, surface: 'road' }), collide: () => null };
      let airTurn = 0;
      const inp = tricking((k) => ({ steer: k.z > 8 ? 1 : 0 }));
      for (let t = 0; t < 2; t += PHYSICS_DT) {
        const h0 = s.heading;
        stepKart(s, inp(s), params, env, PHYSICS_DT);
        if (!s.grounded && s.z > 8) airTurn += Math.abs(h0 - s.heading) / PHYSICS_DT;
      }
      return airTurn;
    };
    expect(turn(true)).toBeGreaterThan(turn(false) * 1.4);
  });

  it('a hop on the launcher is a trick: a boost on landing', () => {
    let hopped = false;
    const s = createKartState(0, -20, 0);
    s.speed = params.topSpeed;
    const env = launcherEnv();
    let trick = false;
    for (let t = 0; t < 6 && !trick; t += PHYSICS_DT) {
      const press = !hopped && s.z > 1;
      if (press) hopped = true;
      trick = stepKart(s, { ...GAS, drift: press, driftPressed: press }, params, env, PHYSICS_DT).trick;
    }
    expect(trick).toBe(true);
    expect(s.boostTime).toBeCloseTo(TRICK_BOOST, 5);
  });

  it('every track gets a launcher, on the lip of each jump and across the road', () => {
    for (const t of RAW_TRACK_LIST) {
      const def = t.build();
      const { launchers } = planEnrichment(def);
      expect(launchers.length, t.id).toBeGreaterThanOrEqual(1);
      const r = new Ribbon(def.main);
      for (const [from] of def.main.gaps) expect(launchers.some((l) => l.s + l.length < from && l.s + l.length > from - 2), t.id).toBe(true);
      for (const l of launchers) {
        expect(l.length).toBe(LAUNCHER_LENGTH);
        expect(l.halfWidth).toBeLessThan(r.halfWidthAtS((l.s + l.length / 2) * r.scale));
        expect(l.halfWidth).toBeGreaterThan(r.halfWidthAtS((l.s + l.length / 2) * r.scale) - 1.5);
      }
    }
    // And they're laid in.
    for (const t of TRACK_LIST) expect(t.build().launchers?.length, t.id).toBeGreaterThanOrEqual(1);
  });

  it('a launcher reads as its own surface on the road, and a boost pad is still a boost pad', () => {
    const track = new Track(TRACK_LIST[1].build());
    const l = track.def.launchers![0];
    const s = track.mainS(l.s + l.length / 2);
    const p = pointAt(track.spline, s);
    expect(track.locate(p.x, p.z, track.main.heightAt(s) + 0.1).surface).toBe('launch');
    const pad = track.def.boostPads[0];
    const ps = track.mainS(pad.s + pad.length / 2);
    const pp = pointAt(track.spline, ps);
    expect(track.locate(pp.x - pp.tz * pad.lateral, pp.z + pp.tx * pad.lateral, track.main.heightAt(ps) + 0.1).surface).toBe('boost');
  });

  it('off every launcher a CPU that tricks glides, one that doesn\'t jumps, and both come down on the road', () => {
    for (const t of TRACK_LIST) {
      const track = new Track(t.build());
      for (const l of track.def.launchers ?? []) {
        for (const engine of ['50cc', '150cc'] as const) {
          for (const trick of [true, false]) {
            const { glided, fell } = cpuOver(track, l.s, engine, trick);
            expect(glided, `${t.id} ${engine} trick ${trick}`).toBe(trick);
            expect(fell, `${t.id} ${engine} trick ${trick}`).toBe(false);
          }
        }
      }
    }
  });

  it('generated tracks get launchers too, and nobody falls off them', () => {
    let launchers = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const def = generateTrack({ seed, theme: 'speedway', complexity: 1 + (seed % 5), length: 'medium' });
      expect(def.launchers).toEqual(launchersFor({ ...def, launchers: undefined }));
      const track = new Track(def);
      for (const l of def.launchers ?? []) {
        launchers++;
        for (const trick of [true, false]) {
          const { glided, fell } = cpuOver(track, l.s, '150cc', trick);
          expect(glided, `seed ${seed}`).toBe(trick);
          expect(fell, `seed ${seed} trick ${trick}`).toBe(false);
        }
      }
    }
    expect(launchers).toBeGreaterThanOrEqual(8);
  });
});

/** A CPU at top speed from 50 m short of a launcher, for six seconds, tricking off it or not: did it glide, and did it fall. */
function cpuOver(track: Track, at: number, engine: '50cc' | '150cc', trick: boolean) {
  const race = new Race(track);
  const k = race.addKart(RACERS[0], engine, CPU_SKILL[engine]);
  while (!race.started) race.step(PHYSICS_DT, []);
  const s0 = track.mainS(at) - 50;
  const p = pointAt(track.spline, s0);
  Object.assign(k.state, { x: p.x, z: p.z, heading: Math.atan2(p.tx, p.tz), speed: k.params.topSpeed, trackHint: -1 });
  k.state.y = k.state.groundY = track.main.heightAt(s0);
  k.progressS = s0;
  k.distance = s0;
  let glided = false;
  let fell = false;
  for (let t = 0; t < 6; t += PHYSICS_DT) {
    race.step(PHYSICS_DT, []);
    // The CPU's own roll of the dice, decided for it.
    k.trickPlan = trick;
    glided ||= k.state.glideTime > 0;
    fell ||= k.fallTime > 0 || k.respawned;
  }
  return { glided, fell };
}
