import { afterEach, describe, expect, it, vi } from 'vitest';
import { RULES_WAIT } from '../src/core/skills';
import { StoryScreen, practiceRulesCard, storyCard } from '../src/ui/storyScreen';
import { ACTS, BOON_CHOICES, CLEAR_PLACE, SKILL_STAGE, STAGES_PER_ACT, START_LIVES, StoryRun } from '../src/core/story';
import { kartParams, RACERS } from '../src/physics/racers';
import { TRACK_LIST } from '../src/tracks/index';
import { generateTrack } from '../src/tracks/generator';

/** Clears every stage, taking the first boon offered. */
function clearAll(run: StoryRun, each: (run: StoryRun) => void = () => {}): string {
  let out = '';
  while (!run.finished) {
    each(run);
    out = run.record(true);
    if (run.offer.length) run.take(run.offer[0]);
  }
  return out;
}

describe('story run', () => {
  it('runs every chapter: two races, the skill game, then the boss', () => {
    const run = new StoryRun(7);
    const seen: string[] = [];
    clearAll(run, (r) => seen.push(`${r.race.act}:${r.race.kind}`));
    expect(seen).toHaveLength(ACTS.length * STAGES_PER_ACT);
    for (let a = 0; a < ACTS.length; a++) expect(seen.slice(a * STAGES_PER_ACT, (a + 1) * STAGES_PER_ACT)).toEqual([`${a}:race`, `${a}:race`, `${a}:skill`, `${a}:boss`]);
    expect(SKILL_STAGE).toBe(2);
  });

  it('wins after the last boss', () => {
    expect(clearAll(new StoryRun(1))).toBe('won');
  });

  it('plays a different skill game in each chapter', () => {
    for (let seed = 1; seed < 40; seed++) {
      const run = new StoryRun(seed);
      expect(new Set(run.skills).size).toBe(ACTS.length);
    }
  });

  it('every boss and launch track is a real track', () => {
    for (const a of ACTS) {
      expect(TRACK_LIST.some((t) => t.id === a.boss.trackId)).toBe(true);
      for (const id of a.launchTracks) expect(TRACK_LIST.some((t) => t.id === id)).toBe(true);
    }
  });

  it('clears a race in the top places, and a boss duel only ahead of the boss', () => {
    const run = new StoryRun(3);
    expect(run.passes(CLEAR_PLACE, null)).toBe(true);
    expect(run.passes(CLEAR_PLACE + 1, null)).toBe(false);
    expect(run.passes(2, 1)).toBe(false);
    expect(run.passes(1, 2)).toBe(true);
  });

  it('starts with one life: a miss ends the run', () => {
    const run = new StoryRun(5);
    expect(START_LIVES).toBe(1);
    expect(run.record(false)).toBe('over');
    expect(run.finished).toBe(true);
  });

  it('a spare life from Planet B restarts the same stage, the same track and game', () => {
    const run = new StoryRun(8);
    run.record(true);
    run.offer = ['planetB'];
    run.take('planetB');
    expect(run.lives).toBe(START_LIVES + 1);
    expect(run.boons).toEqual([]);
    const before = run.race;
    expect(run.record(false)).toBe('failed');
    expect(run.lives).toBe(START_LIVES);
    expect(run.race).toEqual(before);
    expect(run.record(false)).toBe('over');
  });

  it('a restarted chapter opener skips its card', () => {
    const run = new StoryRun(6);
    run.lives = 2;
    expect(run.actStart).toBe(true);
    run.record(false);
    expect(run.actStart).toBe(false);
  });

  it('offers three different boons after a clear, and takes only one of them', () => {
    const run = new StoryRun(11);
    expect(run.record(true)).toBe('cleared');
    expect(run.offer).toHaveLength(BOON_CHOICES);
    expect(new Set(run.offer).size).toBe(BOON_CHOICES);
    const pick = run.offer.find((b) => b !== 'planetB')!;
    run.take(pick);
    expect(run.boons).toEqual([pick]);
    expect(run.offer).toEqual([]);
    run.take(pick);
    expect(run.boons).toEqual([pick]);
  });

  it('stacks stat boons on the kart', () => {
    const run = new StoryRun(2);
    const base = kartParams(RACERS[0].stats, '150cc');
    run.boons.push('mindFuzz', 'mindFuzz', 'rattlesnake');
    const p = { ...base };
    run.applyBoons(p);
    expect(p.topSpeed).toBeCloseTo(base.topSpeed * 1.03 ** 2);
    expect(p.accel).toBeCloseTo(base.accel * 1.15);
    expect(p.mass).toBe(base.mass);
  });

  it('the latest item boon wins', () => {
    const run = new StoryRun(2);
    run.boons.push('figWasps', 'gammaKnife');
    expect(run.favour).toBe('keytarLaser');
  });

  it('never races the player against their own racer as the boss', () => {
    const run = new StoryRun(4);
    for (let act = 0; act < ACTS.length; act++) {
      run.cleared = act * STAGES_PER_ACT + STAGES_PER_ACT - 1;
      // The model the boss drives against anyone else, then picked by the player.
      const own = RACERS.find((r) => r.id === run.bossRacer(RACERS.find((x) => x.id === 'arlo')!).id)!;
      expect(run.bossRacer(own).id).not.toBe(own.id);
      expect(run.bossRacer(own).name).toBe(ACTS[act].boss.name);
    }
  });

  it("the chapter bosses are the new boss racers, and beating one unlocks it", () => {
    expect(ACTS.map((a) => a.boss.racerId)).toEqual(['altered-beast', 'balrog', 'cyborg-gourmand']);
    const run = new StoryRun(10);
    const got: string[] = [];
    run.unlock = (id) => (got.push(id), true);
    clearAll(run);
    expect(got).toEqual(['altered-beast', 'balrog', 'cyborg-gourmand']);
    expect(run.beaten.every((b) => b.fresh)).toBe(true);
  });

  it('builds every generated story track', () => {
    clearAll(new StoryRun(9), (r) => {
      const g = r.race.gen;
      if (g) expect(generateTrack(g).name).toBeTruthy();
    });
  });
});

describe('story mode generated tracks', () => {
  it('start at twists 4 and climb to the most, all medium length', () => {
    const run = new StoryRun(4242);
    const got: string[] = [];
    while (!run.finished) {
      const st = run.race;
      if (st.gen) got.push(`${st.act}:${st.gen.complexity}:${st.gen.length}`);
      run.record(true);
      if (run.offer.length) run.take(run.offer[0]);
    }
    expect(got).toEqual(['0:4:medium', '0:5:medium', '1:5:medium', '1:5:medium', '2:5:medium', '2:5:medium']);
  });
});

describe("a skill game's card before it", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Enough of a DOM for the story screen: an element whose markup can be read back. */
  function screen() {
    const el = { className: '', innerHTML: '', classList: { toggle: () => {} }, addEventListener: () => {} };
    vi.stubGlobal('document', { createElement: () => el, body: { appendChild: () => {} } });
    const sc = new StoryScreen({ appendChild: () => {} } as unknown as HTMLElement);
    const picked: string[] = [];
    sc.onPick = (id) => picked.push(id);
    return { sc, el, picked, step: (s: number) => Array.from({ length: Math.round(s * 60) }, () => sc.step(1 / 60)) };
  }

  it('counts down on the card and starts the game by itself after RULES_WAIT seconds', () => {
    const run = new StoryRun(3);
    while (run.race.kind !== 'skill') {
      run.record(true);
      if (run.offer.length) run.take(run.offer[0]);
    }
    const card = storyCard(run, 'skill', RACERS[0]);
    expect(card.auto).toBe(RULES_WAIT);
    const { sc, el, picked, step } = screen();
    sc.show(card);
    expect(el.innerHTML).toContain(`starts by itself in ${RULES_WAIT} s`);
    step(4);
    expect(el.innerHTML).toContain(`starts by itself in ${RULES_WAIT - 4} s`);
    expect(picked).toEqual([]);
    step(RULES_WAIT - 4 + 0.1);
    expect(picked).toEqual(['go']);
    step(5);
    expect(picked).toEqual(['go']);
  });

  it("Skill Games' card before the Deadstick Landing too; a press still goes sooner", () => {
    const card = practiceRulesCard('deadstick', 'Easy', 0);
    expect(card.auto).toBe(RULES_WAIT);
    const { sc, picked, step } = screen();
    sc.show(card);
    step(2);
    expect(sc.key('Enter')).toBe(true);
    expect(picked).toEqual(['play']);
  });

  it('cards that are not before a game wait for a press', () => {
    const run = new StoryRun(3);
    for (const phase of ['chapter', 'boss', 'boon'] as const) expect(storyCard(run, phase, RACERS[0]).auto, phase).toBeUndefined();
    const { sc, picked, step } = screen();
    sc.show(storyCard(run, 'chapter', RACERS[0]));
    step(RULES_WAIT * 3);
    expect(picked).toEqual([]);
  });
});
