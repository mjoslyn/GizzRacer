import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTS, StoryRun } from '../src/core/story';
import { SUITES, SuiteRun, runStages, suiteMusic, type Suite } from '../src/core/suites';
import { LiveRadio } from '../src/audio/radio';
import type { LiveRecording, MusicPlayer } from '../src/audio/music';
import { RACERS } from '../src/physics/racers';
import { TRACK_LIST } from '../src/tracks/index';
import { generateTrack, type GenParams } from '../src/tracks/generator';
import { storyCard, storyPickCard } from '../src/ui/storyScreen';

/** The shared contract (scratchpad suites/CONTRACT.md): id, name, boss racer, and each stage as kind:song[:track]. */
const CONTRACT: [string, string, string, string[]][] = [
  ['mind-fuzz', 'The Mind Fuzz Suite', 'mind-voice', ["R:I'm in Your Mind:im-in-your-mind", "R:I'm Not in Your Mind:im-not-in-your-mind", 'R:Cellophane:cellophane', "B:I'm in Your Mind Fuzz:im-in-your-mind-fuzz"]],
  ['nonagon-infinity', 'Nonagon Infinity', 'people-vulture', ['R:Robot Stop:robot-stop', 'R:Big Fig Wasp', 'R:Gamma Knife:gamma-knife', 'B:People-Vultures:people-vultures']],
  ['altered-beast', 'The Tale of the Altered Beast', 'altered-beast', ['C:A New World', 'R:Altered Beast I:altered-beast-i', 'R:Altered Beast II:altered-beast-ii', 'R:Altered Beast III:altered-beast-iii', 'B:Altered Beast IV:altered-beast-iv', 'C:Life / Death']],
  ['lord-of-lightning', 'The Lord of Lightning vs. Balrog', 'balrog', ['C:Some Context', 'C:The Reticent Raconteur', 'R:The Lord of Lightning', 'B:The Balrog', 'C:The Floating Fire', 'C:The Acrid Corpse']],
  ['han-tyumi', 'Han-Tyumi and the Murder of the Universe', 'munt-machine', ['C:Welcome to an Altered Future', 'R:Digital Black', 'R:Han-Tyumi, the Confused Cyborg', 'C:Soy-Protein Munt Machine', 'R:Vomit Coffin', 'B:Murder of the Universe']],
  ['polygondwanaland', 'Polygondwanaland', 'castle-king', ['R:Crumbling Castle:crumbling-castle', 'R:Polygondwanaland', 'B:The Castle in the Air:castle-in-the-air']],
  ['infest-the-rats-nest', "Infest the Rats' Nest", 'the-devil', ['R:Planet B:planet-b', 'R:Mars for the Rich:mars-for-the-rich', 'R:Organ Farmer', 'R:Self-Immolate', 'B:Hell:hell']],
  ['petrodragonic-apocalypse', 'PetroDragonic Apocalypse', 'coven-mother', ['R:Motor Spirit:infinite-loop-speedway', 'R:Supercell:supercell', 'R:Converge', 'B:Witchcraft']],
];

/** Plays a run through, every stage passed and the first boon taken; the stages as seen. */
function clearAll(run: StoryRun): { kind: string; outcome: string }[] {
  const seen: { kind: string; outcome: string }[] = [];
  while (!run.finished) {
    const kind = run.race.kind;
    const outcome = run.record(true);
    seen.push({ kind, outcome });
    if (run.offer.length) run.take(run.offer[0]);
  }
  return seen;
}

const at = (suite: Suite, n: number) => {
  const run = new SuiteRun(77, suite);
  run.cleared = n;
  return run.race;
};

describe('story suites', () => {
  it('are the contract suites, in its order, with its stages, songs, tracks and boss racers', () => {
    expect(SUITES.map((s) => [s.id, s.name, s.boss.racerId, s.stages.map((st) => [st.kind, st.song, st.trackId].filter(Boolean).join(':'))])).toEqual(CONTRACT);
  });

  it('the pick has the eight suites in order, then the album run', () => {
    expect(storyPickCard().opts.map((o) => o.id)).toEqual([...CONTRACT.map((c) => c[0]), 'motu']);
  });

  it('every hand-built stage track is a real track', () => {
    for (const s of SUITES) for (const st of s.stages) if (st.trackId) expect(TRACK_LIST.some((t) => t.id === st.trackId), st.trackId).toBe(true);
  });

  it('every other race and boss builds a generated track named from the song, medium length and twistier as the suite goes', () => {
    for (const s of SUITES) {
      const plan = runStages(s);
      plan.forEach((st, n) => {
        if (st.kind !== 'R' && st.kind !== 'B') return;
        const r = at(s, n);
        expect(r.song).toBe(st.song);
        if (st.trackId) {
          expect(r.gen).toBeNull();
          expect(r.trackId).toBe(st.trackId);
          return;
        }
        const g = r.gen!;
        expect(g, st.song).toBeTruthy();
        expect(g.length).toBe('medium');
        expect(g.complexity).toBeGreaterThanOrEqual(3);
        const def = generateTrack(g);
        expect(def.name).toBe(st.gen!.name);
        // Every section of the main road but the finish is named after a place from the song.
        const names = def.main.sections.map((sec) => sec.name);
        expect(names.length).toBeGreaterThan(0);
        for (const name of names.filter((n) => !n.startsWith('Finish'))) expect(st.gen!.places.some((p) => name.startsWith(p)), `${st.song}: ${name}`).toBe(true);
      });
    }
  });

  it('a given name and places change nothing that gets built', () => {
    const p: GenParams = { seed: 4242, theme: 'storm', complexity: 4, length: 'medium' };
    const plain = generateTrack(p);
    const named = generateTrack({ ...p, name: 'The Electric Snare', places: ['Golden Wire'] });
    expect(named.main.length).toBeCloseTo(plain.main.length, 6);
    expect(named.checkpoints).toEqual(plain.checkpoints);
    expect(named.main.sections.map((s) => s.from)).toEqual(plain.main.sections.map((s) => s.from));
    expect(named.name).toBe('The Electric Snare');
    expect(plain.name).not.toBe('The Electric Snare');
  });

  it('cards have the song words on them', () => {
    for (const s of SUITES)
      for (const st of s.stages.filter((x) => x.kind === 'C')) {
        expect(st.words?.length, st.song).toBeGreaterThan(0);
        for (const line of st.words!) expect(line.trim().length).toBeGreaterThan(0);
      }
    const beast = SUITES.find((s) => s.id === 'altered-beast')!;
    const run = new SuiteRun(1, beast);
    const card = storyCard(run, 'card', RACERS[0]);
    expect(card.title).toBe('A New World');
    expect(card.verse).toEqual(beast.stages[0].words);
  });

  it('plays one stage a song in order, the skill game just before the boss; cards give no boon', () => {
    for (const s of SUITES) {
      const run = new SuiteRun(5, s);
      const seen = clearAll(run);
      const want = s.stages.flatMap((st) => (st.kind === 'B' && s.skill ? ['skill', 'boss'] : [st.kind === 'C' ? 'card' : st.kind === 'B' ? 'boss' : 'race']));
      expect(seen.map((x) => x.kind)).toEqual(want);
      for (const x of seen) if (x.kind === 'card') expect(x.outcome === 'next' || x.outcome === 'won').toBe(true);
      expect(seen[seen.length - 1].outcome).toBe('won');
    }
  });

  it('keeps the skill games asked for', () => {
    const skill = Object.fromEntries(SUITES.map((s) => [s.id, s.skill]));
    expect(skill['mind-fuzz']).toBe('mindfuzz');
    expect(['nonagon', 'robot']).toContain(skill['nonagon-infinity']);
    expect(skill.polygondwanaland).toBe('castle');
  });

  it('beating the boss unlocks its racer, and the end card says so', () => {
    for (const s of SUITES) {
      const unlock = vi.fn(() => true);
      const run = new SuiteRun(9, s, unlock);
      clearAll(run);
      expect(unlock).toHaveBeenCalledTimes(1);
      expect(unlock).toHaveBeenCalledWith(s.boss.racerId);
      expect(storyCard(run, 'won', RACERS[0]).body).toContain(`${s.boss.name} is unlocked`);
    }
  });

  it('a lost boss duel unlocks nothing', () => {
    const s = SUITES[0];
    const unlock = vi.fn(() => true);
    const run = new SuiteRun(9, s, unlock);
    run.cleared = runStages(s).length - 1;
    expect(run.race.boss).toBe(true);
    expect(run.record(false)).toBe('over');
    expect(unlock).not.toHaveBeenCalled();
  });

  it("the boss drives its own racer, or a stand-in, never the player's own model", () => {
    for (const s of SUITES) {
      const run = new SuiteRun(3, s);
      run.cleared = runStages(s).length - 1;
      const boss = run.bossRacer(RACERS[0]);
      expect(boss.name).toBe(s.boss.name);
      const same = RACERS.find((r) => r.id === boss.id)!;
      expect(run.bossRacer(same).id).not.toBe(same.id);
    }
  });

  it('leaves the album run as it was', () => {
    expect(new StoryRun(1).total).toBe(ACTS.length * 4);
    expect(new StoryRun(1).id).toBe('motu');
    expect(clearAll(new StoryRun(1)).every((x) => x.kind !== 'card' && x.outcome !== 'next')).toBe(true);
  });
});

describe('story suite music', () => {
  const rec: LiveRecording = { id: 'kglw2017-11-16', file: 'kglw-d1t03.mp3', date: '2017-11-16', venue: 'Somewhere', seconds: 300, start: 4, end: 290 };

  afterEach(() => vi.unstubAllGlobals());

  it("plays the suite's entry, else holds the live recording playing, else falls back", () => {
    expect(suiteMusic(rec, false)).toBe('entry');
    expect(suiteMusic(rec, true)).toBe('entry');
    expect(suiteMusic(null, true)).toBe('hold');
    expect(suiteMusic(null, false)).toBe('fallback');
  });

  it("finds a stage's recording in suites.json, and none for a song without one or offline", async () => {
    const played: unknown[] = [];
    const music = { playLive: (r: LiveRecording, _f: unknown, o: unknown) => played.push([r, o]) } as unknown as MusicPlayer;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ 'altered-beast': { 'A New World': rec } }) })));
    const radio = new LiveRadio(music);
    expect(await radio.suiteRecording('altered-beast', 'A New World')).toEqual(rec);
    expect(await radio.suiteRecording('altered-beast', 'Life / Death')).toBeNull();
    expect(await radio.suiteRecording('mind-fuzz', 'Cellophane')).toBeNull();
    radio.playRecording(rec, 'A New World', ['title-remix']);
    expect(radio.playing?.title).toBe('A New World');
    expect(played).toEqual([[rec, undefined]]);

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    expect(await new LiveRadio(music).suiteRecording('altered-beast', 'A New World')).toBeNull();
  });
});
