import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BOSS_SUITES, FIELD_SIZE, RACERS, bossLockNote, pickRivals } from '../src/physics/racers';
import { ACTS, BOSS_ALT, BOSS_STAND_INS } from '../src/core/story';
import { ALBUM_FACE } from '../src/core/suites';

/**
 * The story bosses: nine racers, the suites' eight and Han-Tyumi at the end
 * of the Murder of the Universe album run, each locked until beaten in story
 * mode, kept out of every draw and picker until then, each with a model of
 * its own and bigger than the roster.
 */

const BOSSES: [id: string, suite: string, name: string][] = [
  ['mind-voice', 'mind-fuzz', 'The Voice in Your Mind'],
  ['people-vulture', 'nonagon-infinity', 'The People-Vulture'],
  ['altered-beast', 'altered-beast', 'The Altered Beast'],
  ['balrog', 'lord-of-lightning', 'The Balrog'],
  ['munt-machine', 'han-tyumi', 'The Soy-Protein Munt Machine'],
  ['fourth-colour', 'polygondwanaland', 'The Fourth Colour'],
  ['rat-king', 'infest-the-rats-nest', 'The Rat King'],
  ['coven-mother', 'petrodragonic-apocalypse', 'The Mother of the Coven'],
  ['cyborg-gourmand', 'motu', 'Han-Tyumi'],
];
const bosses = RACERS.filter((r) => r.boss);
const roster = RACERS.filter((r) => !r.boss);

/** A browser's storage, in memory, kept across fresh imports of the progress module. */
function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  } as Storage;
}
const g = globalThis as { localStorage?: Storage; location?: { search: string } };
/** The progress module as a new page load sees it: what's in storage, and the address's ?unlock. */
async function freshProgress(search = '') {
  g.location = { search };
  vi.resetModules();
  return import('../src/core/progress');
}

describe('boss racers', () => {
  it("are the contract's nine, each a story's boss, after the roster", () => {
    expect(bosses.map((r) => [r.id, r.boss, r.name])).toEqual(BOSSES);
    for (const [, suite] of BOSSES) expect(BOSS_SUITES[suite]).toBeTruthy();
    expect(roster).toHaveLength(23);
    // The roster first, so its seeded draws only change when a racer leaves it.
    expect(RACERS.slice(0, roster.length)).toEqual(roster);
    expect(bossLockNote(bosses[0])).toBe('Beat The Mind Fuzz Suite to unlock');
    expect(bossLockNote(RACERS.find((r) => r.id === 'cyborg-gourmand')!)).toBe('Beat Murder of the Universe to unlock');
    expect(bossLockNote(roster[0])).toBe('');
  });

  it("have stats in the roster's range: a duel is won on the story's CPU pace, not the numbers", () => {
    const totals = roster.map((r) => Object.values(r.stats).reduce((a, b) => a + b, 0));
    for (const r of bosses) {
      const s = Object.values(r.stats);
      for (const v of s) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(5);
      }
      const total = s.reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThanOrEqual(Math.min(...totals));
      expect(total).toBeLessThanOrEqual(Math.max(...totals));
      expect(r.bio.length).toBeGreaterThan(30);
    }
  });

  it('stay out of the CPU draw unless let in', () => {
    for (let seed = 1; seed < 200; seed++) {
      const grid = pickRivals(new Set(), FIELD_SIZE, seed);
      expect(grid).toHaveLength(FIELD_SIZE);
      expect(grid.some((r) => r.boss)).toBe(false);
    }
    // Let one in and it turns up; the others still don't.
    const seen = new Set<string>();
    for (let seed = 1; seed < 200; seed++) for (const r of pickRivals(new Set(), FIELD_SIZE, seed, (b) => b.id === 'balrog')) if (r.boss) seen.add(r.id);
    expect([...seen]).toEqual(['balrog']);
  });
});

describe("Han-Tyumi, the album run's boss", () => {
  it("is Chapter III's boss, the album run's face, and no one's stand-in", () => {
    expect(ACTS[2].boss).toMatchObject({ racerId: 'cyborg-gourmand', name: 'Han-Tyumi' });
    expect(ALBUM_FACE).toBe('cyborg-gourmand');
    // A locked boss never turns up as the kart another boss drives.
    for (const id of [...Object.values(BOSS_STAND_INS), BOSS_ALT, ...ACTS.map((a) => a.boss.altRacerId)]) expect(RACERS.find((r) => r.id === id)?.boss, id).toBeUndefined();
  });
});

describe('unlocking a boss', () => {
  afterEach(() => {
    delete g.localStorage;
    delete g.location;
    vi.resetModules();
  });

  it('beatBoss unlocks it, once, and it stays unlocked on the next visit', async () => {
    g.localStorage = fakeStorage();
    let p = await freshProgress();
    expect(p.bossUnlocked('lizard-warlock')).toBe(true);
    expect(bosses.every((r) => !p.bossUnlocked(r.id))).toBe(true);
    expect(p.playableRacers()).toEqual(roster);
    expect(p.beatBoss('balrog')).toBe(true);
    expect(p.beatBoss('balrog')).toBe(false);
    expect(p.beatBoss('lizard-warlock')).toBe(false);
    expect(p.beatBoss('nobody')).toBe(false);
    expect(p.bossUnlocked('balrog')).toBe(true);
    expect(p.bossUnlocked('rat-king')).toBe(false);
    // A new page load: it's still there, and pickable.
    p = await freshProgress();
    expect(p.progress().bosses).toEqual(['balrog']);
    expect(p.bossUnlocked('balrog')).toBe(true);
    expect(p.playableRacers().map((r) => r.id)).toEqual([...roster.map((r) => r.id), 'balrog']);
    // A reset locks it again.
    p.resetProgress();
    expect(p.bossUnlocked('balrog')).toBe(false);
  });

  it('?unlock unlocks every boss without recording one, and ?unlock=off locks them back', async () => {
    g.localStorage = fakeStorage();
    let p = await freshProgress('?unlock');
    expect(bosses.every((r) => p.bossUnlocked(r.id))).toBe(true);
    expect(p.playableRacers()).toEqual([...RACERS]);
    expect(p.progress().bosses).toEqual([]);
    // Kept in this browser for the next visit, until ?unlock=off.
    p = await freshProgress();
    expect(p.bossUnlocked('coven-mother')).toBe(true);
    p = await freshProgress('?unlock=off');
    expect(p.bossUnlocked('coven-mother')).toBe(false);
  });

  it('a boss since replaced stays beaten as the one that replaced it', async () => {
    g.localStorage = fakeStorage();
    g.localStorage.setItem('gizzracer.progress', JSON.stringify({ bosses: ['the-devil', 'balrog', 'castle-king', 'rat-king'] }));
    const p = await freshProgress();
    expect(p.progress().bosses).toEqual(['rat-king', 'balrog', 'fourth-colour']);
    expect(p.bossUnlocked('rat-king')).toBe(true);
    expect(p.bossUnlocked('fourth-colour')).toBe(true);
    expect(RACERS.some((r) => r.id === 'the-devil' || r.id === 'castle-king')).toBe(false);
  });

  it('with no storage, a boss beaten stays unlocked for the visit', async () => {
    const p = await freshProgress();
    expect(p.bossUnlocked('mind-voice')).toBe(false);
    expect(p.beatBoss('mind-voice')).toBe(true);
    expect(p.bossUnlocked('mind-voice')).toBe(true);
  });
});

describe('boss models', () => {
  // Tests run without a DOM: a canvas that takes the textures' painting and does nothing with it.
  beforeAll(() => {
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get: (target, key) => {
        if (key in target) return target[key];
        if (key === 'measureText') return (text: string) => ({ width: text.length * 30 });
        if (key === 'createRadialGradient' || key === 'createLinearGradient' || key === 'createPattern') return () => ({ addColorStop() {} });
        if (key === 'createImageData' || key === 'getImageData') return (...a: number[]) => ({ data: new Uint8ClampedArray(Math.max(1, (a[a.length - 2] ?? 1) * (a[a.length - 1] ?? 1)) * 4) });
        return () => {};
      },
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    });
    (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  });

  /** The solid parts: its meshes, not the glows round them. */
  const meshes = (o: THREE.Object3D) => {
    const out: THREE.Mesh[] = [];
    o.updateMatrixWorld(true);
    o.traverse((m) => m instanceof THREE.Mesh && out.push(m));
    return out;
  };
  const size = (o: THREE.Object3D) => {
    const box = new THREE.Box3();
    for (const m of meshes(o)) box.expandByObject(m);
    return box.getSize(new THREE.Vector3());
  };

  it('every racer, boss or not, has a model of its own and a kart view', async () => {
    const { buildKartModel, hasKartModel } = await import('../src/render/racerModels');
    const { KartView } = await import('../src/render/kartView');
    for (const r of RACERS) {
      expect(hasKartModel(r.id), r.id).toBe(true);
      const m = buildKartModel(r);
      expect(meshes(m.body).length, r.id).toBeGreaterThan(20);
      // Something to carry it: wheels on the road, a hover, legs or a slither.
      expect(m.wheels.length > 0 || !!m.hover || (m.legs?.length ?? 0) > 0 || (m.segments?.length ?? 0) > 0, r.id).toBe(true);
      expect(m.exhausts.length, r.id).toBeGreaterThan(0);
      if (r.boss) expect(m.head, r.id).toBeTruthy();
      expect(() => new KartView(r), r.id).not.toThrow();
    }
  });

  it('the bosses stand taller than the roster, and low enough to see the road past', async () => {
    const { buildKartModel } = await import('../src/render/racerModels');
    const median = (xs: number[]) => xs.sort((a, b) => a - b)[xs.length >> 1];
    const sizes = roster.map((r) => size(buildKartModel(r).body));
    const height = median(sizes.map((s) => s.y));
    const bulk = median(sizes.map((s) => s.x * s.y * s.z));
    for (const r of bosses) {
      const s = size(buildKartModel(r).body);
      expect(s.y, r.id).toBeGreaterThan(height * 1.1);
      expect(s.x * s.y * s.z, r.id).toBeGreaterThan(bulk);
      // But not so tall the chase camera loses the road over it, nor wider than a lane or two.
      expect(s.y, r.id).toBeLessThan(3.5);
      expect(s.x, r.id).toBeLessThan(6);
    }
  });

  it('a locked boss goes to a silhouette in the gallery and back', async () => {
    const { KartView } = await import('../src/render/kartView');
    const view = new KartView(bosses[0]);
    const lit = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();
    view.root.traverse((o) => o instanceof THREE.Mesh && lit.set(o, o.material));
    view.silhouette(true);
    const dark = new Set<THREE.Material>();
    view.root.traverse((o) => o instanceof THREE.Mesh && o.visible && dark.add(o.material as THREE.Material));
    expect(dark.size).toBeLessThanOrEqual(2);
    view.silhouette(false);
    view.root.traverse((o) => o instanceof THREE.Mesh && expect(o.material).toBe(lit.get(o)));
  });
});
