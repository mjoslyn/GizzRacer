import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { CPU_SKILL, type CpuSkill } from '../src/ai/cpuDriver';
import { GHOST_OVERRUN, GhostRecorder, encodeGhost } from '../src/core/ghost';
import { PHYSICS_DT } from '../src/core/loop';
import { Race } from '../src/core/race';
import { PHYSICS_VERSION } from '../src/physics/kart';
import { ENGINE_CLASSES, RACERS, type EngineClass, type RacerDef } from '../src/physics/racers';
import { TRACK_LIST } from '../src/tracks/index';
import { Track } from '../src/tracks/track';
import { TRIAL_LAPS, boardName, type RunSubmission } from '../src/net/runCheck';

/**
 * Seeds every Time Trial leaderboard with starter ghosts: CPU-driven runs
 * at three skill levels, posted through the normal (validated) upload, so
 * new players have something to race. Re-run after a PHYSICS_VERSION bump.
 *
 *   npm run seed:ghosts                                  # local wrangler dev
 *   SEED_URL=https://www.gizzracer.com npm run seed:ghosts
 *
 * Bot identities live in tools/.seed-identities.json (not committed), so
 * re-runs post as the same bots.
 */
const BASE = (process.env.SEED_URL ?? 'http://127.0.0.1:8787') + '/parties';
const IDS = 'tools/.seed-identities.json';
const TIERS: CpuSkill[] = [CPU_SKILL['150cc'], CPU_SKILL['100cc'], CPU_SKILL['50cc']];

type Ids = Record<string, { playerId: string; token: string }>;

function drive(trackIndex: number, engine: EngineClass, racer: RacerDef, skill: CpuSkill): RunSubmission {
  const entry = TRACK_LIST[trackIndex];
  const race = new Race(new Track(entry.build()), 1, false, TRIAL_LAPS);
  const kart = race.addKart(racer, engine, skill);
  race.time = 0;
  const rec = new GhostRecorder();
  for (let t = 0; t < 300 && (kart.finishTime === null || race.time - kart.finishTime < GHOST_OVERRUN); t += PHYSICS_DT) {
    race.step(PHYSICS_DT, []);
    rec.record(race.time, kart.state);
  }
  if (kart.finishTime === null) throw new Error(`${racer.id} didn't finish ${entry.id}`);
  const lapsMs = kart.lapTimes.map((l) => Math.round(l * 1000));
  return {
    trackId: entry.id,
    engine,
    racerId: racer.id,
    physicsVersion: PHYSICS_VERSION,
    lapsMs,
    totalMs: lapsMs.reduce((a, b) => a + b, 0),
    ghost: encodeGhost(rec.finish(racer.id, kart.finishTime)),
  };
}

async function post(path: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${BASE}/${path}`, { method: 'POST', body: JSON.stringify(body) });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

it('seeds starter ghosts', async () => {
  let ids: Ids = {};
  try {
    ids = JSON.parse(readFileSync(IDS, 'utf8')) as Ids;
  } catch {
    // First run: make the bots below.
  }
  const bot = async (racer: RacerDef) => {
    const name = `${racer.name.split(' ').pop()} Bot`;
    ids[name] ??= { playerId: crypto.randomUUID(), token: crypto.randomUUID() };
    const r = await post('players/global', { ...ids[name], name });
    if (r.status !== 200) throw new Error(`register ${name}: ${JSON.stringify(r.data)}`);
    return { name, ...ids[name] };
  };
  for (const [ti, entry] of TRACK_LIST.entries()) {
    for (const [ei, engine] of ENGINE_CLASSES.entries()) {
      const line: string[] = [];
      for (const [k, skill] of TIERS.entries()) {
        // Three different racers per board, varying from board to board.
        const racer = RACERS[(ti * 3 + ei + k * 3) % RACERS.length];
        const who = await bot(racer);
        const run = drive(ti, engine, racer, skill);
        const r = await post(`trials/${boardName(entry.id, engine)}`, { playerId: who.playerId, token: who.token, run });
        line.push(r.status === 200 ? `${who.name} ${(run.totalMs / 1000).toFixed(2)}s #${r.data.rank}` : `${who.name} REJECTED ${JSON.stringify(r.data)}`);
      }
      console.log(`${entry.id} ${engine}: ${line.join(' | ')}`);
    }
  }
  writeFileSync(IDS, JSON.stringify(ids, null, 2));
}, 600000);
