import { anthropoids, cuttingTexture, deckLights, doorParts, headbanger, hydra, motel, oddFeature, outbackSkyline, poseDoors, redDirtTexture, roadCaseTexture, stageGate, sugarplumFairy, tourBus, tourField, tourPoster, tourRoadTexture, voyager } from '../render/oddlife';
import type { Ribbon } from '../tracks/track';
import type { KitView } from './view';

/** Oddlife's look (kits/view.ts): the world, scenery, road, landmarks and hazard of its kit (oddlife.ts), built in render/oddlife.ts. */

declare module '../render/themes' {
  interface KitDecors {
    tourworld: 'oddlife';
  }
}

/** The name of the section of `ribbon` at `s` metres. */
const sectionAt = (ribbon: Ribbon, s: number): string => ribbon.def.sections.find((q) => s >= q.from * ribbon.scale - 1e-6 && s <= q.to * ribbon.scale + 1e-6)?.name ?? '';

export const view: KitView<'oddlife'> = {
  id: 'oddlife',
  themes: {
    // Oddlife: on tour at night in the middle of nowhere, red dirt under an indigo sky, the stage lights pink, teal and gold.
    oddlife: {
      sky: { zenith: '#0a0620', high: '#1c1040', low: '#4a2060', horizon: '#ff6a8a', below: '#2a1020', ground: '#2a1018', cloud: '120,70,140', clouds: 20, stars: { count: 160, color: '#fff4e0' }, moon: '#fff4d8' },
      fog: { color: 0x3a1a3a, near: 130, far: 680 },
      hemi: { sky: 0xd8b0ff, ground: 0x5a2a2a, intensity: 1.6 },
      sun: { color: 0xffc8a0, intensity: 1.6 },
      // A night world: the sun's lens flare is a faint glint.
      sunFlare: 0.12,
      ground: redDirtTexture,
      groundTile: 18,
      // Walls of the cut and the world's edge: a red rock road cutting.
      cliff: cuttingTexture,
      decor: 'tourworld',
      distant: { shape: 'hill', color: 0x2a1028 },
      haze: 0.2,
      duotone: [0x0c0418, 0xff4fa8, 0xfff0a0],
      skyCycle: false,
      dust: 0xb07070,
      // Road cases end to end.
      barrier: { map: roadCaseTexture, crawl: false },
      // A night world: the bitumen lit a little by the stage lights, a gold line down each edge.
      roadGlow: 0.14,
      edgeLine: 0xffd23a,
      edgeWidth: 0.5,
      murk: 0x2a1020,
    },
  },
  decors: {
    tourworld: {
      rock: cuttingTexture,
      rocks: 80,
      features: 120,
      // The tour by the road: amp stacks, road cases, light towers, road signs, cones, scrub, vans and couches, by the stretch.
      feature: (animated, track) => oddFeature(animated, track),
      // Oddlife: stage lights on poles along the road, red stones for ground cover, boards of the song.
      detail: {
        edge: { kind: 'lamp', height: 3, spacing: 22, color: 0x18161e, stripe: 0xff4fa8 },
        light: 0xff4fa8,
        cover: { shape: 'pebble', colors: [0x6a2a32, 0x8a4038, 0x4a1a28, 0x4a6a3a], count: 1100 },
        boards: { words: [], bg: ['#1a0a24', '#3a1040'], fg: '#ffd23a' },
        crowd: true,
      },
      // Bats under the stars, and dust and confetti in the stage light.
      life: { flock: { kind: 'bat', color: 0x0a0610, count: 12, height: 22, size: 1 }, motes: { color: 0xffc8e8, count: 300, size: 0.4, drift: 'float', glow: true } },
    },
  },
  roads: {
    // Oddlife's: the tour's highway.
    tourRoad: ({ bumpy }) => bumpy(tourRoadTexture(), 0.04),
  },
  landmarks: {
    stageGate: ({ ribbon, s, animated }) => stageGate(ribbon, s, animated),
    outbackSkyline: ({ track, animated }) => outbackSkyline(track, animated),
    tourField: ({ track, ribbon, s, lm, animated }) => tourField(track, ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, sectionAt(ribbon, s), animated),
    tourBus: ({ ribbon, s, lm, animated }) => tourBus(ribbon, s, lm.lateral ?? 0, animated),
    headbanger: ({ ribbon, s, lm, animated }) => headbanger(ribbon, s, lm.lateral ?? 0, animated),
    sugarplumFairy: ({ ribbon, s, lm, animated }) => sugarplumFairy(ribbon, s, lm.lateral ?? 0, animated),
    deckLights: ({ ribbon, s, lm, animated }) => deckLights(ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, animated),
    voyager: ({ ribbon, s, lm, animated }) => voyager(ribbon, s, lm.lateral ?? 0, animated),
    hydra: ({ ribbon, s, lm, animated }) => hydra(ribbon, s, lm.lateral ?? 0, animated),
    anthropoids: ({ ribbon, s, lm, animated }) => anthropoids(ribbon, s, lm.lateral ?? 0, animated),
    motel: ({ ribbon, s, lm, animated }) => motel(ribbon, s, lm.lateral ?? 0, animated),
    tourPoster: ({ ribbon, s, lm, animated }) => tourPoster(ribbon, s, lm.lateral ?? 0, animated),
  },
  hazards: {
    backstageDoors: {
      // The backstage doors risen across the road, promoters in the shut ones, green rooms glowing through the open ones.
      parts: (obj) => doorParts(obj),
      pose: (obj, parts, p, elapsed) => poseDoors(obj, parts, p, elapsed),
    },
  },
};
