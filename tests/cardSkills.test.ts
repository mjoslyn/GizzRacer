import suitesJson from '../public/music/suites.json';
import { describe, expect, it } from 'vitest';
import {
  CARD_GAME_DEFAULT,
  CARD_GAME_LEFT_MIN,
  CARD_GAME_MAX,
  CARD_GAME_MIN,
  EMBER_LANES,
  FIRE_TIME,
  HIDE_TIME,
  HIDE_X,
  HideSim,
  EmberSim,
  FIRE_X,
  FireSim,
  MUNT_CLAW,
  MUNT_PARTS,
  MUNT_TIME,
  MirrorSim,
  MuntSim,
  OvertureSim,
  SatSim,
  ShadowSim,
  cardGameLeft,
  cardGameSeconds,
  cardPlan,
  beamEnters,
  beamLead,
  lyricIndex,
  makeHide,
  makeEmbers,
  makeFire,
  makeMirror,
  makeMunt,
  makeOverture,
  makeSats,
  makeShadow,
  muntPossible,
  shareOf,
  mirrorFinal,
  overtureJudge,
  shadowAt,
  sharePasses,
  songSeconds,
  type CardSim,
} from '../src/core/cardSkills';
import { CARD_SKILLS, CHAPTER_SKILLS, RULES_WAIT, SKILLS, SKILL_KINDS, skillRules } from '../src/core/skills';
import { briefed, type Lyrics } from '../src/ui/skillScreen';
import type { MiniGame } from '../src/ui/skills/kit';
import { SUITES } from '../src/core/suites';

const DT = 1 / 60;
const SEEDS = [1, 7, 42, 1234, 99991];
/** Skill Games' own length (undefined), and what's left of songs in story mode: from the shortest a game runs to the longest. */
const LENGTHS = [undefined, CARD_GAME_LEFT_MIN, 30, 68, 150, CARD_GAME_MAX];

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
  /** A careful player: down a little before each beam reaches the hiding place, up a little after; up the rest of the time. */
  const careful = (s: HideSim): void => {
    s.holding = s.game.beams.some((b) => s.t > b.at - 0.22 && s.t < b.at + b.dur + 0.15);
  };

  it('the beams come from both sides, more of them and quicker as the song goes on, each with a warning and a run under that fits in your air', () => {
    const g = makeHide(5, 1, 200);
    expect(new Set(g.beams.map((b) => b.from)).size).toBe(2);
    expect(new Set(g.beams.map((b) => b.kind)).size).toBe(2);
    const half = g.beams.filter((b) => b.at < 100).length;
    expect(g.beams.length - half).toBeGreaterThan(half);
    expect(g.beams[g.beams.length - 1].speed).toBeGreaterThan(g.beams[0].speed);
    // On the stage well before it reaches you, its warning before that.
    for (const b of g.beams) {
      expect(b.at - beamEnters(b)).toBeGreaterThan(0.7);
      expect(beamLead(b, beamEnters(b))).toBeCloseTo(b.from < 0 ? 0 : 1);
      expect(beamLead(b, b.at)).toBeCloseTo(HIDE_X);
    }
    for (let i = 1; i < g.beams.length; i++) expect(g.beams[i].at).toBeGreaterThan(g.beams[i - 1].at + g.beams[i - 1].dur);
  });

  it('ducking every beam and coming up for the flares to the end passes; never ducking, or staying down, does not', () => {
    for (const length of LENGTHS)
      for (const level of [0, 1, 2])
        for (const seed of SEEDS) {
          const g = makeHide(seed, level, length);
          expect(g.flares.length).toBeGreaterThan(length && length < 30 ? 0 : 3);
          let gasped = false;
          const sim = new HideSim(g);
          const good = run(sim, (s) => {
            careful(s);
            gasped ||= s.gasp > 0;
          });
          expect(good.passed, `seed ${seed} level ${level} length ${length}: ${sim.result?.note}`).toBe(true);
          expect(sim.seen).toBe(0);
          expect(gasped, 'never out of air').toBe(false);
          lasts('raconteur', level, length, good.seconds);
          expect(run(new HideSim(g), () => {}).passed).toBe(false);
          expect(
            run(new HideSim(g), (s) => {
              s.holding = true;
            }).passed,
          ).toBe(false);
        }
  });

  it('out of air under the mud, you come up gasping and stay up a while', () => {
    const g = makeHide(3, 1);
    const sim = new HideSim({ ...g, beams: [], flares: [] });
    sim.holding = true;
    for (let t = 0; t < g.air + 0.1; t += DT) sim.update(DT);
    expect(sim.under).toBe(false);
    expect(sim.gasp).toBeGreaterThan(0);
    expect(sim.sounds.some((x) => x.s === 'gasp')).toBe(true);
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

describe('card games: a share of what they offered, however long the song', () => {
  const LONG = [CARD_GAME_LEFT_MIN, 30, 68, 150, CARD_GAME_MAX];

  it('every rules card says the target as a percentage, at every length', () => {
    for (const k of CARD_SKILLS)
      for (const len of [undefined, ...LONG])
        for (let level = 0; level < 3; level++) expect(skillRules(k, level, len), `${k} ${len}`).toMatch(/\d+%/);
  });

  it('each target is its share of what the game offers, the same share at every length', () => {
    for (const len of LONG)
      for (let level = 0; level < 3; level++) {
        const sh = makeShadow(1, level, len);
        expect(sh.need).toBeCloseTo(sh.share * len);
        const fire = makeFire(1, level, len);
        expect(fire.need).toBe(shareOf(fire.wires.length, fire.share));
        const em = makeEmbers(1, level, len);
        expect(em.need).toBe(shareOf(em.total, em.share));
        const m = makeMunt(1, level, len);
        expect(m.possible).toBe(muntPossible(m.belt, m.speed, len));
        expect(m.machines).toBe(shareOf(m.possible, m.share));
        for (const g of [sh, fire, em, m, makeSats(1, level, len), makeMirror(1, level, len), makeHide(1, level, len)])
          expect(g.share, `level ${level} length ${len}`).toBe((makeAt(g, level) as { share: number }).share);
      }
    // The same game at its Skill Games length, for the share to match.
    function makeAt(g: object, level: number): object {
      if ('waves' in g) return makeShadow(2, level);
      if ('bolts' in g) return makeFire(2, level);
      if ('items' in g) return makeEmbers(2, level);
      if ('belt' in g) return makeMunt(2, level);
      if ('starts' in g) return makeSats(2, level);
      if ('figures' in g) return makeMirror(2, level);
      return makeHide(2, level);
    }
  });

  it('at their Skill Games lengths the targets are about the old counts', () => {
    // Old: the fire's 3, 3 and 2 strikes; the quagmire's 4, 3 and 3 sightings; the munt machine's 3, 3 and 2 wrong parts.
    expect([0, 1, 2].map((l) => makeFire(1, l, FIRE_TIME).sparks)).toEqual([3, 3, 2]);
    expect([0, 1, 2].map((l) => makeMunt(1, l, MUNT_TIME).strikes)).toEqual([3, 3, 2]);
    for (let l = 0; l < 3; l++) {
      const lives = [1, 7, 42, 1234, 99991].map((seed) => makeHide(seed, l, HIDE_TIME).lives);
      for (const n of lives) expect(Math.abs(n - [4, 3, 3][l]), `level ${l}`).toBeLessThanOrEqual(1);
      // Two or three machines in the munt machine's 36 s, as before.
      for (const seed of [1, 7, 42]) expect(makeMunt(seed, l, MUNT_TIME).machines).toBeGreaterThanOrEqual(2);
      for (const seed of [1, 7, 42]) expect(makeMunt(seed, l, MUNT_TIME).machines).toBeLessThanOrEqual(3);
    }
    // The satellites: the old three of four (four of five) kept lit, as a share of the sky.
    expect([0, 1, 2].map((l) => makeSats(1, l).share)).toEqual([3 / 4, 4 / 5, 4 / 5]);
  });

  it('the rules that end a game early scale with its length too', () => {
    for (let level = 0; level < 3; level++) {
      const short = { fire: makeFire(3, level, 30), hide: makeHide(3, level, 30), munt: makeMunt(3, level, 30) };
      const long = { fire: makeFire(3, level, 240), hide: makeHide(3, level, 240), munt: makeMunt(3, level, 240) };
      expect(Math.abs(long.fire.sparks / long.fire.bolts.length - short.fire.sparks / short.fire.bolts.length)).toBeLessThan(0.1);
      expect(Math.abs(long.hide.lives / long.hide.beams.length - short.hide.lives / short.hide.beams.length)).toBeLessThan(0.1);
      expect(long.munt.strikes).toBeGreaterThanOrEqual(6 * short.munt.strikes);
    }
  });

  it('a player who does just the share passes and one just short fails, at 15 s and at 240', () => {
    for (const len of [CARD_GAME_LEFT_MIN, CARD_GAME_MAX])
      for (let level = 0; level < 3; level++) {
        // A new world: with the shadow until enough of the time is spent in it, then out in the open.
        const shadow = (extra: number) =>
          run(new ShadowSim(makeShadow(4, level, len)), (s) => {
            const d = s.shadow - s.x;
            s.dir = s.inside < s.game.need + extra ? (Math.abs(d) < 0.01 ? 0 : Math.sign(d)) : s.x < 0.5 ? -1 : 1;
          });
        expect(shadow(0.3).passed, `shadow ${len} ${level}`).toBe(true);
        expect(shadow(-1).passed, `shadow ${len} ${level}`).toBe(false);
        // The munt machine: every part grabbed until enough machines are built, then the claw left be.
        const munt = (stop: number) => {
          const g = makeMunt(4, level, len);
          return run(new MuntSim(g), (s) => {
            const i = s.under;
            if (s.built < stop && i !== null && g.belt[i] === s.needed && Math.abs(s.xOf(i) - MUNT_CLAW) < 0.03) s.grab();
          });
        };
        const need = makeMunt(4, level, len).machines;
        expect(munt(need).passed, `munt ${len} ${level}`).toBe(true);
        expect(munt(need - 1).passed, `munt ${len} ${level}`).toBe(false);
      }
  });

  it('the satellites: the sky lit long enough passes, two lost early fail, lost late are forgiven', () => {
    // (A satellite left alone takes most of 15 s to go black, so only the longer songs can lose one early.)
    for (const len of [68, 150, CARD_GAME_MAX]) {
      const g = makeSats(5, 0, len);
      // Every one kept lit but the first, let go at `drop` of the way through.
      const play = (drop: number, also = false) =>
        run(new SatSim(g), (s) => {
          for (let i = 0; i < s.light.length; i++) {
            const gone = (i === 0 && s.t > drop * len) || (also && i === 1 && s.t > drop * len);
            if (!gone && s.light[i] < 0.5) s.charge(i);
          }
        });
      expect(play(1.1).passed, `${len}: all lit`).toBe(true);
      expect(play(0, true).passed, `${len}: two of four gone at the start`).toBe(false);
      expect(play(0.6, true).passed, `${len}: two of four gone late`).toBe(true);
    }
  });
});

describe('card games: the rules card and the song', () => {
  it("the length if the game starts now: what's left of its song, never under the least", () => {
    expect(cardGameLeft(68, 68, null)).toBe(68);
    expect(cardGameLeft(68, 68, 0)).toBe(68);
    expect(cardGameLeft(68, 68, 0.5)).toBe(34);
    expect(cardGameLeft(68, 68, 0.95)).toBe(CARD_GAME_LEFT_MIN);
    // Skill Games: a short song still plays its game the default length, less what's been heard.
    expect(cardGameLeft(CARD_GAME_DEFAULT, 30, 10 / 30)).toBe(CARD_GAME_DEFAULT - 10);
    expect(cardGameLeft(CARD_GAME_DEFAULT, null, 0.5)).toBe(CARD_GAME_DEFAULT);
  });

  /** A song playing, `heard` seconds in already, `music` long; and the game made, with its length. */
  function card(heard: number, music: number) {
    let clock = 0;
    const song = () => (heard + clock) / music;
    const lyrics: Lyrics = { lines: ['a', 'b'], song, length: music - heard, left: () => cardGameLeft(music, music, song()) };
    const made: (number | undefined)[] = [];
    const game: MiniGame = { result: null, update: () => {}, draw: () => {}, key: () => {}, tap: () => {} };
    const b = briefed('newworld', 1, lyrics, (length) => {
      made.push(length);
      return game;
    });
    const step = (seconds: number) => {
      for (let i = 0; i < Math.round(seconds * 60); i++) {
        clock += 1 / 60;
        b.update(clock, 1 / 60);
      }
    };
    return { b, made, step, rules: () => skillRules('newworld', 1, lyrics.left!()) };
  }

  it('waits at most RULES_WAIT seconds, then starts by itself', () => {
    expect(RULES_WAIT).toBe(10);
    const c = card(20, 120);
    c.step(RULES_WAIT - 0.5);
    expect(c.b.game).toBeNull();
    expect(c.b.carded).toBe(true);
    c.step(0.6);
    expect(c.b.game).not.toBeNull();
    expect(c.made).toHaveLength(1);
  });

  it('a press still starts it sooner', () => {
    const c = card(0, 90);
    c.step(2);
    c.b.key('Enter', false);
    expect(c.made).toHaveLength(1);
    c.step(RULES_WAIT);
    expect(c.made).toHaveLength(1);
  });

  it("the game's length is measured from when it starts, so it still ends with its song", () => {
    for (const [heard, music] of [
      [0, 68],
      [30, 150],
      [0, CARD_GAME_MAX],
    ]) {
      const waited = card(heard, music);
      waited.step(RULES_WAIT + 0.1);
      expect(waited.made[0]!, `${heard} into ${music}`).toBeCloseTo(music - heard - RULES_WAIT, 0);
      const quick = card(heard, music);
      quick.step(3);
      quick.b.key('Space', false);
      expect(quick.made[0]!).toBeCloseTo(music - heard - 3, 0);
    }
    // Late in a song, it still runs the least a game runs.
    const late = card(60, 68);
    late.step(RULES_WAIT + 0.1);
    expect(late.made[0]).toBe(CARD_GAME_LEFT_MIN);
  });

  it("the rules card says the length the game would have if it started now", () => {
    const c = card(0, 68);
    expect(c.rules()).toContain('of the 68 seconds');
    c.step(5);
    expect(c.rules()).toContain('of the 63 seconds');
  });
});
