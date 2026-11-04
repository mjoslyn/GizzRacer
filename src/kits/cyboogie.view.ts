import * as tex from '../render/textures';
import { binaryBrook, brineTankTexture, cyboogieGate, cyborgFeature, cyborgHead, cyborgHeart, cyborgZones, debugLane, fishHook, grapheneGlowTexture, grapheneRoadTexture, hanTyumi, pistonParts, plateTexture, posePiston, synthPanelTexture } from '../render/cyboogie';
import type { KitView } from './view';

/** Cyboogie's look (kits/view.ts): the world, scenery, road, landmarks and hazard of its kit (cyboogie.ts), built in render/cyboogie.ts. */

declare module '../render/themes' {
  interface KitDecors {
    cyborg: 'cyboogie';
  }
}

export const view: KitView<'cyboogie'> = {
  id: 'cyboogie',
  themes: {
    // Cyboogie: inside a cyborg who has lost his humanity, as dark as the video's stage, synth red glowing low all round, chrome and the brine green of his dome; his plating underfoot, the graphene road pale and lit over it, a red line down each edge.
    cyborg: {
      sky: { zenith: '#040206', high: '#14060c', low: '#4a0a16', horizon: '#d8283a', below: '#3a0a12', ground: '#08120f', cloud: '150,30,46', clouds: 7, stars: { count: 160, color: '#ffb0b8' } },
      fog: { color: 0x2a0a12, near: 170, far: 820 },
      hemi: { sky: 0xffd0d8, ground: 0x1a4a3a, intensity: 1.6 },
      sun: { color: 0xfff0f2, intensity: 2.0 },
      ground: plateTexture,
      groundTile: 24,
      // Walls are brine tanks in chrome frames: the cut down his neck, and the world's edge.
      cliff: brineTankTexture,
      decor: 'cyborg',
      distant: { shape: 'hill', color: 0x12060a },
      haze: 0,
      duotone: [0x050208, 0xe8182c, 0xe0f4ec],
      skyCycle: false,
      dust: 0x6a8a80,
      barrier: { map: synthPanelTexture, crawl: false },
      edgeLine: 0xff2a3c,
      edgeWidth: 0.5,
    },
  },
  decors: {
    cyborg: {
      rock: () => tex.stoneTexture([30, 34, 40], [130, 136, 146]),
      rocks: 0,
      features: 180,
      // Cyboogie's: what's inside him, by the part of him the road is passing through.
      feature: (animated, track) => cyborgFeature(animated, track && cyborgZones(track)),
      // Cyboogie: chrome posts with red lamps along the road inside him, his circuitry and brine scattered off it; boards of the song.
      detail: {
        edge: { kind: 'pole', height: 1.8, spacing: 16, color: 0xd0d4dc, stripe: 0xe8182c },
        light: 0xff2a3c,
        cover: { shape: 'pebble', colors: [0x1a2a26, 0x2a4a40, 0x3affa0, 0xc8ccd4], count: 1000 },
        boards: { words: ['CYBOOGIE', 'BOOGIE BOOGIE BOOGIE', 'FISHING FOR FISHIES', 'RUN OVER THE TESTS', 'DE-BUG', 'HAN-TYUMI'], bg: ['#0a0a0e', '#e8182c'], fg: '#f0f0f0' },
        crowd: false,
      },
      // Red lights of his circuitry wheeling over him, and bubbles of brine rising.
      life: { flock: { kind: 'orb', color: 0xff3a4a, count: 14, height: 18, size: 0.6, glow: true }, motes: { color: 0x8affc8, count: 380, size: 0.35, drift: 'rise', glow: true } },
    },
  },
  roads: {
    // Cyboogie's: a graphene lattice over his pistons and pumps, its bonds lit faintly and a red line down the middle.
    graphene: ({ bumpy }) => bumpy(grapheneRoadTexture(), 0.05, { emissive: 0xffffff, emissiveMap: grapheneGlowTexture(), emissiveIntensity: 0.6 }),
  },
  landmarks: {
    cyboogieGate: ({ ribbon, s, animated }) => cyboogieGate(ribbon, s, animated),
    cyborgHead: ({ ribbon, s, lm, animated }) => cyborgHead(ribbon, s, lm.lateral ?? 0, animated),
    cyborgHeart: ({ ribbon, s, lm, animated }) => cyborgHeart(ribbon, s, lm.lateral ?? 0, animated),
    fishHook: ({ ribbon, s, lm, animated }) => fishHook(ribbon, s, lm.lateral ?? 0, animated),
    binaryBrook: ({ ribbon, s, lm, animated }) => binaryBrook(ribbon, s, (lm.to ?? lm.s) * ribbon.scale, animated),
    hanTyumi: ({ ribbon, s, lm, animated }) => hanTyumi(ribbon, s, lm.lateral ?? 0, animated),
    debugLane: ({ track, ribbon, s, animated }) => debugLane(ribbon, s, track.def.pits, animated),
  },
  hazards: {
    pistons: {
      // A piston flush in the road: its red ring, its rod and head, and its steam.
      parts: (obj) => pistonParts(obj),
      pose: (obj, parts, p, elapsed) => posePiston(obj, parts, p, elapsed),
    },
  },
};
