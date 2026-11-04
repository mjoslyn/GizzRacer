import { describe, expect, it } from 'vitest';
import { KITS, KIT_HAZARDS, KIT_THEMES } from '../src/kits/index';
import { KIT_HAZARD_VIEWS, KIT_VIEWS, KIT_WORLDS } from '../src/kits/views';
import { HazardSystem } from '../src/items/hazards';
import { createKartState } from '../src/physics/kart';
import { detailStyle } from '../src/render/trackDetail';
import { themeOf, type ThemeId } from '../src/render/themes';
import { GEN_THEME_NAMES, generateTrack } from '../src/tracks/generator';
import { Track } from '../src/tracks/track';

/**
 * Every track kit (src/kits) registers consistently. The compiler checks the
 * rest (kits/index.ts and kits/view.ts): that a kit that declares kinds is
 * listed, that none takes a kind the game already has, and that each view
 * has a world for each of its kit's themes, a material for each surface, a
 * builder for each landmark kind and a look for each hazard.
 */
describe('track kits', () => {
  it('each listed kit has its view, and each view a listed kit', () => {
    const ids = KITS.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(KIT_VIEWS.map((v) => v.id).sort()).toEqual([...ids].sort());
  });

  it('no two kits add the same hazard, theme or look', () => {
    const count = (lists: string[][]) => {
      const all = lists.flat();
      expect(new Set(all).size).toBe(all.length);
    };
    count(KITS.map((k) => Object.keys(k.hazards)));
    count(KITS.map((k) => Object.keys(k.themes)));
    for (const part of ['themes', 'decors', 'roads', 'landmarks', 'hazards'] as const) count(KIT_VIEWS.map((v) => Object.keys(v[part])));
  });

  it('every kit hazard has its pose, collide, generator, callouts, sound and look', () => {
    expect(KIT_HAZARDS.size).toBeGreaterThan(0);
    for (const [kind, h] of KIT_HAZARDS) {
      expect(h.kind).toBe(kind);
      expect(typeof h.pose).toBe('function');
      expect(typeof h.collide).toBe('function');
      expect(typeof h.sound).toBe('function');
      expect(h.callouts.hit.length).toBeGreaterThan(0);
      expect(h.callouts.bonus.length).toBeGreaterThan(0);
      expect(h.generate({ from: 100, to: 300, count: 2, at: (n) => Array.from({ length: n }, (_, i) => 100 + (200 * (i + 0.5)) / n) }).kind).toBe(kind);
      const view = KIT_HAZARD_VIEWS.get(kind);
      expect(view, kind).toBeDefined();
      expect(typeof view!.parts).toBe('function');
      expect(typeof view!.pose).toBe('function');
    }
  });

  it('every kit theme has its world, scenery, generator name and palette', () => {
    for (const kit of KITS) {
      for (const theme of Object.keys(kit.themes) as ThemeId[]) {
        expect(KIT_WORLDS.has(theme), theme).toBe(true);
        const world = themeOf(theme);
        expect(() => detailStyle(world.decor)).not.toThrow();
        expect(GEN_THEME_NAMES[theme]).toBe(KIT_THEMES.get(theme)!.name);
      }
    }
  });

  it("a generated track in each kit theme poses and hits with its kit's hazards", () => {
    for (const kit of KITS) {
      for (const theme of Object.keys(kit.themes) as ThemeId[]) {
        const def = generateTrack({ seed: 7, theme, complexity: 5, length: 'short' });
        const hazards = new HazardSystem(new Track(def));
        const kart = createKartState();
        for (let t = 0; t < 12; t += 0.25) {
          hazards.update(t);
          for (const p of hazards.poses) {
            Object.assign(kart, { x: p.x, z: p.z, y: p.ground });
            hazards.collide([kart], 0.25);
          }
          hazards.obstacles([]);
        }
        for (const p of hazards.poses) expect(Number.isFinite(p.x + p.z + p.y), `${theme} ${p.kind}`).toBe(true);
      }
    }
  });
});
