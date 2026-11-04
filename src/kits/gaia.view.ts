import * as tex from '../render/textures';
import { blightTexture, breathParts, deadEarth, earthRoadTexture, elements, gaiaFaceLand, gaiaFeature, gaiaHands, gaiaHeart, gaiaZones, luckyRainbow, parasites, poseBreath, rootBarrierTexture, strataTexture as gaiaStrataTexture } from '../render/gaia';
import type { KitView } from './view';

/** Gaia's look (kits/view.ts): the world, scenery, road, landmarks and hazard of its kit (gaia.ts), built in render/gaia.ts. */

declare module '../render/themes' {
  interface KitDecors {
    gaia: 'gaia';
  }
}

export const view: KitView<'gaia'> = {
  id: 'gaia',
  themes: {
    // Gaia: the Earth herself, ancient, vast and indifferent, lying in a blighted land under a storm-dark, bruised sky, black-green overhead and blood-ochre low down where an eclipsed sun glows dim; heavy low cloud, lightning, fog swallowing the distance; her body the hills, her hair dead forest, her veins glowing dull red through the cracked earth.
    gaia: {
      sky: { zenith: '#070c0a', high: '#16221c', low: '#3e3424', horizon: '#8a4a22', below: '#2a1e16', ground: '#120f0c', cloud: '34,40,36', clouds: 34 },
      fog: { color: 0x1c221e, near: 120, far: 640 },
      hemi: { sky: 0x9aa89a, ground: 0x2e2218, intensity: 1.45 },
      sun: { color: 0xd0a070, intensity: 1.5 },
      ground: blightTexture,
      groundTile: 16,
      // Walls are her body's strata: dead topsoil and roots over clay and black rock, a seam of red.
      cliff: gaiaStrataTexture,
      decor: 'gaia',
      // Her body, far off in the fog: the black hills of her knees and her other hand.
      distant: { shape: 'mountain', color: 0x0e120f },
      haze: 0,
      duotone: [0x050806, 0x5a1a10, 0xd8b070],
      skyCycle: false,
      dust: 0x4a4038,
      barrier: { map: rootBarrierTexture, crawl: false },
      // Her stream, black.
      murk: 0x0a1410,
      // A dark world: the road of her skin glows a little with its own light, and a line of bone runs down each edge.
      roadGlow: 0.16,
      edgeLine: 0xece0c4,
      edgeWidth: 0.55,
      dies: true,
    },
  },
  decors: {
    gaia: {
      rock: () => tex.stoneTexture([96, 98, 86], [170, 166, 150]),
      rocks: 70,
      features: 240,
      // Her living land, her hair, her parasites and the dead earth, by the stretch of the lap it's nearest.
      feature: (animated, track) => gaiaFeature(animated, track && gaiaZones(track)),
      // Gaia: fires guttering in iron baskets along her skin, dead grass and thorns by the road, ash.
      detail: {
        edge: { kind: 'torch', height: 1.6, spacing: 16, color: 0x1a1612, stripe: 0x3a2a20 },
        light: 0xff5a24,
        cover: { shape: 'tuft', colors: [0x3a3a2a, 0x4a4430, 0x2a2a20, 0x5a5040, 0x6a2a1a], count: 1600 },
        boards: { words: ['I AM GAIA', 'GIANT BODY PARASITE', 'DIRT IS DECEASED', 'NO ONE SEES', 'GAIA DIES'], bg: ['#0c0a08', '#2a0e0a'], fg: '#d8ccb0' },
        crowd: false,
      },
      // Carrion birds wheeling low over her, and ash falling.
      life: { flock: { kind: 'vulture', color: 0x0e0c0a, count: 12, height: 22, size: 1.5 }, motes: { color: 0x8a8480, count: 300, size: 0.4, drift: 'fall' } },
    },
  },
  roads: {
    // Gaia's: the Earth's own skin, soil and pale stones.
    earth: ({ bumpy }) => bumpy(earthRoadTexture(), 0.07),
  },
  landmarks: {
    gaiaHands: ({ ribbon, s, animated }) => gaiaHands(ribbon, s, animated),
    gaiaFace: ({ track, ribbon, s, lm, animated }) => gaiaFaceLand(track, ribbon, s, lm.lateral ?? 0, animated),
    parasites: ({ track, ribbon, s, lm, animated }) => parasites(track, ribbon, s, (lm.to ?? lm.s + 90) * ribbon.scale, animated),
    elements: ({ track, ribbon, s, lm, animated }) => elements(track, ribbon, s, (lm.to ?? lm.s + 200) * ribbon.scale, animated),
    gaiaHeart: ({ track, ribbon, s, lm, animated }) => gaiaHeart(track, ribbon, s, (lm.to ?? lm.s) * ribbon.scale, animated),
    deadEarth: ({ track, ribbon, s, lm, animated }) => deadEarth(track, ribbon, s, (lm.to ?? lm.s + 90) * ribbon.scale, animated),
    luckyRainbow: ({ ribbon, s, animated }) => luckyRainbow(ribbon, s, animated),
  },
  hazards: {
    breaths: {
      // One of Gaia's ribs: a ridge of her skin across the road, heaving with her breath.
      parts: (obj) => breathParts(obj),
      pose: (obj, parts, p, elapsed) => poseBreath(obj, parts, p, elapsed),
    },
  },
};
