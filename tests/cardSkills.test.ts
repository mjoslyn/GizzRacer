import suitesJson from '../public/music/suites.json';
import { describe, expect, it } from 'vitest';
import {
  CARD_GAME_DEFAULT,
  CARD_GAME_MAX,
  CARD_GAME_MIN,
  ECHO_MAX,
  EMBER_LANES,
  EchoSim,
  EmberSim,
  FIRE_X,
  FireSim,
  MUNT_CLAW,
  MUNT_PARTS,
  MirrorSim,
  MuntSim,
  OvertureSim,
  SatSim,
  ShadowSim,
  cardGameSeconds,
  cardPlan,
  echoJudge,
  echoOffsets,
  lyricIndex,
  makeEcho,
  makeEmbers,
  makeFire,
  makeMirror,
  makeMunt,
  makeOverture,
  makeSats,
  makeShadow,
  mirrorFinal,
  overtureJudge,
  shadowAt,
  sharePasses,
  songSeconds,
  type CardSim,
} from '../src/core/cardSkills';
import { CARD_SKILLS, CHAPTER_SKILLS, SKILLS, SKILL_KINDS, skillRules } from '../src/core/skills';
import { SUITES } from '../src/core/suites';

const DT = 1 / 60;
const SEEDS = [1, 7, 42, 1234, 99991];
/** Skill Games' own length (undefined), and songs' lengths in story mode. */
const LENGTHS = [undefined, 48, 68, 150, CARD_GAME_MAX];

/** Runs a game at 60 fps, `play` acting each frame, until it ends (or `max` seconds): its result and how long it took. */
function run<S extends CardSim>(sim: S, play: (sim: S, t: number) => void, max = 400): { passed: boolean; seconds: number } {
  let t = 0;
  while (!sim.result && t < max) {
    play(sim, t);
    sim.update(DT);
    t += DT;
  }
  expect(sim.result, 'the game ends').not.toBeNull();
  return { passed: sim.result!.passed, seconds: t };
}

/** A game played well lasts its length: the song's, or its own in Skill Games. */
function lasts(kind: string, level: number, length: number | undefined, seconds: number): void {
  expect(Math.abs(seconds - cardGameSeconds(kind, level, length)), `${kind} at ${length ?? 'its own length'}`).toBeLessThan(2.5);
}

describe('card games: how long they run', () => {
  it("a card's song: its music from start to end, or the file's end", () => {
    expect(songSeconds({ seconds: 32, start: 3, end: 26.5 })).toBe(23.5);
    expect(songSeconds({ seconds: 68 })).toBe(68);
    expect(songSeconds({ seconds: 51, start: 2.5, end: null })).toBe(48.5);
  });

  it('a song long enough gets its game for its length, capped; too short, a plain lyric card; none, the default', () => {
    expect(cardPlan(null)).toEqual({ game: true, length: CARD_GAME_DEFAULT });
    expect(cardPlan({ seconds: 32, start: 3, end: 26.5 })).toEqual({ game: false, length: 23.5 });
    expect(cardPlan({ seconds: CARD_GAME_MIN - 1 }).game).toBe(false);
    expect(cardPlan({ seconds: CARD_GAME_MIN })).toEqual({ game: true, length: CARD_GAME_MIN });
    expect(cardPlan({ seconds: 68 })).toEqual({ game: true, length: 68 });
    expect(cardPlan({ seconds: 600, start: 10 })).toEqual({ game: true, length: CARD_GAME_MAX });
  });

  it("by suites.json: Some Context and Soy-Protein Munt Machine are too short for a game, the rest get theirs", () => {
    const json = suitesJson as unknown as Record<string, Record<string, { seconds: number; start?: number; end?: number | null }>>;
    const plans = Object.fromEntries(SUITES.flatMap((s) => s.stages.filter((st) => st.kind === 'C').map((st) => [st.song, cardPlan(json[s.id]?.[st.song])])));
    expect(plans['Some Context'].game).toBe(false);
    expect(plans['Soy-Protein Munt Machine'].game).toBe(false);
    for (const song of ['A New World', 'The Reticent Raconteur', 'Welcome to an Altered Future']) {
      expect(plans[song].game, song).toBe(true);
      expect(plans[song].length).toBeGreaterThanOrEqual(CARD_GAME_MIN);
    }
    // No recording of their own: the default length.
    for (const song of ['Life / Death', 'The Floating Fire', 'The Acrid Corpse']) expect(plans[song]).toEqual({ game: true, length: CARD_GAME_DEFAULT });
  });

  it('the words go by across the game, or with the song when it plays', () => {
    expect(lyricIndex(6, 0, 60, null)).toBe(0);
    expect(lyricIndex(6, 30, 60, null)).toBe(3);
    expect(lyricIndex(6, 90, 60, null)).toBe(5);
    expect(lyricIndex(6, 0, 60, 0.99)).toBe(5);
    expect(lyricIndex(6, 50, 60, 0.1)).toBe(0);
    expect(lyricIndex(0, 5, 60, null)).toBe(-1);
  });

  it('every game takes a length, and its rules say so', () => {
    for (const k of CARD_SKILLS) {
      for (const len of [50, 200]) expect(Math.abs(cardGameSeconds(k, 1, len) - len), k).toBeLessThan(2.5);
      expect(skillRules(k, 1, 200)).not.toBe(skillRules(k, 1));
    }
  });
});

describe('card games: the list', () => {
  it('one for each spoken-song card, after the chapter games, each named, explained and with rules at every level', () => {
    expect(SKILL_KINDS).toEqual([...CHAPTER_SKILLS, ...CARD_SKILLS]);
    expect(CARD_SKILLS).toHaveLength(8);
    for (const k of CARD_SKILLS) {
      expect(SKILLS[k].name.length).toBeGreaterThan(3);
      expect(SKILLS[k].intro.length).toBeGreaterThan(40);
      for (let level = 0; level < 3; level++) expect(skillRules(k, level).length, k).toBeGreaterThan(80);
    }
  });

  it('a share of rounds passes with at least one played', () => {
    expect(sharePasses(0, 0, 0.6)).toBe(false);
    expect(sharePasses(3, 5, 0.6)).toBe(true);
    expect(sharePasses(2, 5, 0.6)).toBe(false);
  });
});

describe('a new world', () => {
  it('walking with the shadow to the end passes; standing still or walking away does not', () => {
    for (const length of LENGTHS)
      for (const level of [0, 1, 2])
        for (const seed of SEEDS) {
          const good = run(new ShadowSim(makeShadow(seed, level, length)), (s) => {
            const d = s.shadow - s.x;
            s.dir = Math.abs(d) < 0.01 ? 0 : Math.sign(d);
          });
          expect(good.passed, `seed ${seed} level ${level} length ${length}`).toBe(true);
          lasts('newworld', level, length, good.seconds);
          expect(run(new ShadowSim(makeShadow(seed, level, length)), (s) => (s.dir = -1)).passed).toBe(false);
        }
  });

  it('the shadow stays on the meadow and never outruns you, however long the song', () => {
    for (const length of [32, 240]) {
      const g = makeShadow(5, 2, length);
      for (let t = 0; t < length; t += 0.05) {
        const x = shadowAt(g, t);
        expect(x).toBeGreaterThan(0.08);
        expect(x).toBeLessThan(0.92);
        expect(Math.abs(shadowAt(g, t + 0.05) - x) / 0.05).toBeLessThan(g.speed);
      }
    }
  });
});

describe('life / death', () => {
  it('follows you through the swaps', () => {
    expect(mirrorFinal({ start: 0, swaps: [[0, 1], [1, 2]] })).toBe(2);
    expect(mirrorFinal({ start: 0, swaps: [[0, 1], [1, 2], [0, 2]] })).toBe(0);
    expect(mirrorFinal({ start: 1, swaps: [[0, 2]] })).toBe(1);
    const g = makeMirror(3, 2, 120);
    for (const r of g.rounds) for (const [a, b] of r.swaps) expect(a).not.toBe(b);
    // Harder as it goes: more swaps, quicker.
    expect(g.rounds[g.rounds.length - 1].swaps.length).toBeGreaterThan(g.rounds[0].swaps.length);
    expect(g.rounds[g.rounds.length - 1].swapTime).toBeLessThan(g.rounds[0].swapTime);
  });

  it('picking yourself to the end passes; picking a copy, or nothing, does not', () => {
    for (const length of LENGTHS)
      for (const seed of SEEDS) {
        const g = makeMirror(seed, 1, length);
        const good = run(new MirrorSim(g), (s) => s.phase === 'pick' && s.clock > 0.5 && s.choose(mirrorFinal(g.rounds[s.round])));
        expect(good.passed).toBe(true);
        lasts('lifedeath', 1, length, good.seconds);
        const wrong = run(new MirrorSim(g), (s) => s.phase === 'pick' && s.choose((mirrorFinal(g.rounds[s.round]) + 1) % g.figures));
        expect(wrong.passed).toBe(false);
        expect(run(new MirrorSim(g), () => {}).passed).toBe(false);
      }
  });

  it('the screen sees you where the game has you', () => {
    const g = makeMirror(11, 2);
    run(new MirrorSim(g), (s) => {
      if (s.phase === 'pick') {
        expect(s.you).toBe(mirrorFinal(g.rounds[s.round]));
        s.choose(s.you);
      }
    });
  });
});

describe('some context', () => {
  it('judges a press by how close it lands', () => {
    expect(overtureJudge(2, 2.05)).toBe('good');
    expect(overtureJudge(2, 2.15)).toBe('ok');
    expect(overtureJudge(2, 2.4)).toBeNull();
  });

  it('builds over a long song: busier at the end than the start', () => {
    const g = makeOverture(3, 1, 200);
    const bar = (8 * 30) / g.bpm;
    const third = (g.length - bar) / 3;
    const early = g.hits.filter((h) => h < bar + third).length;
    const late = g.hits.filter((h) => h > g.length - third).length;
    expect(late).toBeGreaterThan(early);
  });

  it('striking each hit passes; nothing, or mashing, does not', () => {
    for (const length of LENGTHS)
      for (const seed of SEEDS) {
        const g = makeOverture(seed, 1, length);
        let next = 0;
        const good = run(new OvertureSim(g), (s) => {
          if (next < g.hits.length && s.t >= g.hits[next] - 0.02) {
            s.press();
            next++;
          }
        });
        expect(good.passed).toBe(true);
        lasts('context', 1, length, good.seconds);
        expect(run(new OvertureSim(g), () => {}).passed).toBe(false);
        let mash = 0;
        expect(run(new OvertureSim(g), (s) => (mash++ % 4 === 0 ? s.press() : undefined)).passed).toBe(false);
      }
  });
});

describe('the reticent raconteur', () => {
  it('the ostinato grows by a note a telling, up to its longest, and an echo counts only in time', () => {
    const g = makeEcho(4, 1);
    expect(echoOffsets(g, 1).length).toBe(echoOffsets(g, 0).length + 1);
    expect(echoOffsets(g, 1).slice(0, -1)).toEqual(echoOffsets(g, 0));
    expect(echoOffsets(g, 40).length).toBe(ECHO_MAX);
    const o = echoOffsets(g, 0);
    expect(echoJudge(o, o.map((x) => x + 3), g.tolerance)).toBe(true);
    expect(echoJudge(o, o.map((x, i) => x + 3 + (i === o.length - 1 ? 0.3 : 0)), g.tolerance)).toBe(false);
    expect(echoJudge(o, o.slice(1), g.tolerance)).toBe(false);
  });

  it('tapping it back to the end passes; tapping evenly, or not at all, does not', () => {
    for (const length of LENGTHS)
      for (const seed of SEEDS) {
        const g = makeEcho(seed, 1, length);
        const good = run(new EchoSim(g), (s) => {
          if (s.phase !== 'echo') return;
          const o = s.offsets;
          const due = s.taps.length ? s.taps[0] + o[s.taps.length] : 0.5;
          if (s.clock >= due) s.tap();
        });
        expect(good.passed).toBe(true);
        lasts('raconteur', 1, length, good.seconds);
        expect(
          run(new EchoSim(g), (s) => {
            if (s.phase === 'echo' && s.clock >= 0.5 + s.taps.length * 0.7) s.tap();
          }).passed,
        ).toBe(false);
        expect(run(new EchoSim(g), () => {}).passed).toBe(false);
      }
  });
});

describe('the floating fire', () => {
  it('flying for the gaps and the wire passes; never rising does not', () => {
    for (const length of LENGTHS)
      for (const level of [0, 1, 2])
        for (const seed of SEEDS) {
          const g = makeFire(seed, level, length);
          const good = run(new FireSim(g), (s) => {
            // Head for whatever's next: a wire not yet caught, or a bolt's gap.
            const ahead = [...g.bolts.map((b) => ({ x: b.x, y: b.gap })), ...g.wires.filter((_, i) => !s.taken[i])]
              .filter((o) => o.x - s.scroll > FIRE_X - 0.02)
              .sort((a, b) => a.x - b.x)[0];
            s.holding = ahead ? s.y > ahead.y + 0.01 : false;
          });
          expect(good.passed, `seed ${seed} level ${level} length ${length}`).toBe(true);
          lasts('floatingfire', level, length, good.seconds);
          expect(run(new FireSim(g), () => {}).passed).toBe(false);
        }
  });

  it('the gaps narrow as the storm goes on', () => {
    const g = makeFire(2, 1, 120);
    expect(g.bolts[g.bolts.length - 1].size).toBeLessThan(g.bolts[0].size);
  });
});

describe('the acrid corpse', () => {
  it('moving to each ember passes; staying put does not', () => {
    for (const length of LENGTHS)
      for (const level of [0, 1, 2])
        for (const seed of SEEDS) {
          const g = makeEmbers(seed, level, length);
          const good = run(new EmberSim(g), (s) => {
            const next = g.items.find((it, i) => s.fate[i] === null && it.kind !== 'smoke');
            if (next) s.lane = next.lane;
          });
          expect(good.passed, `seed ${seed} level ${level} length ${length}`).toBe(true);
          lasts('acrid', level, length, good.seconds);
          expect(run(new EmberSim(g), () => {}).passed).toBe(false);
        }
  });

  it('smoke lies in wait where an ember was, never on the next one; embers come quicker as the sun sinks', () => {
    const g = makeEmbers(8, 2, 120);
    expect(g.items.some((it) => it.kind === 'smoke')).toBe(true);
    for (const it of g.items) expect(it.lane).toBeLessThan(EMBER_LANES);
    g.items.forEach((it, i) => {
      if (it.kind !== 'smoke') return;
      const next = g.items.slice(i + 1).find((x) => x.kind !== 'smoke')!;
      expect(next.lane).not.toBe(it.lane);
    });
    const embers = g.items.filter((it) => it.kind === 'ember');
    const firstHalf = embers.filter((it) => it.at < g.end / 2).length;
    expect(embers.length - firstHalf).toBeGreaterThan(firstHalf);
  });
});

describe('welcome to an altered future', () => {
  it('keeping them lit passes; leaving them to fade does not', () => {
    for (const length of LENGTHS)
      for (const level of [0, 1, 2])
        for (const seed of SEEDS) {
          const g = makeSats(seed, level, length);
          let wait = 0;
          // About two presses a second: the dimmest still lit, each time.
          const good = run(new SatSim(g), (s) => {
            if ((wait -= DT) > 0) return;
            wait = 0.5;
            let low = -1;
            s.light.forEach((l, i) => {
              if (l > 0 && (low < 0 || l < s.light[low])) low = i;
            });
            s.charge(low);
          });
          expect(good.passed, `seed ${seed} level ${level} length ${length}`).toBe(true);
          lasts('future', level, length, good.seconds);
          expect(run(new SatSim(g), () => {}).passed).toBe(false);
        }
  });

  it('a satellite gone black stays black', () => {
    const sim = new SatSim(makeSats(2, 1));
    sim.light[0] = 0;
    sim.charge(0);
    expect(sim.light[0]).toBe(0);
  });
});

describe('soy-protein munt machine', () => {
  it('grabbing each part in order to the end passes; grabbing whatever comes does not', () => {
    for (const length of LENGTHS)
      for (const level of [0, 1, 2])
        for (const seed of SEEDS) {
          const g = makeMunt(seed, level, length);
          const good = run(new MuntSim(g), (s) => {
            const i = s.under;
            if (i !== null && g.belt[i] === s.needed && Math.abs(s.xOf(i) - MUNT_CLAW) < 0.03) s.grab();
          });
          expect(good.passed, `seed ${seed} level ${level} length ${length}`).toBe(true);
          lasts('munt', level, length, good.seconds);
          expect(run(new MuntSim(g), (s) => s.under !== null && s.grab()).passed).toBe(false);
        }
  });

  it('the belt never goes long without each part, and outlasts the song', () => {
    const g = makeMunt(6, 0, 240);
    for (const p of MUNT_PARTS) {
      const at = g.belt.map((x, i) => (x === p ? i : -1)).filter((i) => i >= 0);
      for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeLessThanOrEqual(7);
    }
    const sim = new MuntSim(g);
    sim.t = g.length;
    expect(sim.xOf(g.belt.length - 1)).toBeLessThan(0);
  });
});
