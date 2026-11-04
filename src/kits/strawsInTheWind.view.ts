import * as tex from '../render/textures';
import { boardsTexture as barnBoardsTexture, cheshireGrin, farmTrackTexture, fenceTexture as farmFenceTexture, flowerFieldTexture, forgottenPier, hellsKitchen, poseTrafficLight, shortStraw, strawFeature, strawsGate, trafficLightParts, trashTornado } from '../render/strawsInTheWind';
import type { KitView } from './view';

/** Straws in the Wind's look (kits/view.ts): the world, scenery, road, landmarks and hazard of its kit (strawsInTheWind.ts), built in render/strawsInTheWind.ts. */

declare module '../render/themes' {
  interface KitDecors {
    strawfield: 'straws-in-the-wind';
  }
}

export const view: KitView<'straws-in-the-wind'> = {
  id: 'straws-in-the-wind',
  themes: {
    // Straws in the Wind: a bright summer's day over a field of flowers and windmills, blue sky and fair-weather cumulus, the light warm and clear; the only cloud that matters is the one the tornado hangs from.
    windmill: {
      sky: { zenith: '#1656c8', high: '#3a86ee', low: '#a6d2f6', horizon: '#fff2c8', below: '#cfe2a0', ground: '#5a8a3a', cloud: '255,255,255', clouds: 30 },
      fog: { color: 0xdceaf0, near: 220, far: 1000 },
      hemi: { sky: 0xfff4dc, ground: 0x5a8a3a, intensity: 1.6 },
      sun: { color: 0xfff4d8, intensity: 2.5 },
      ground: flowerFieldTexture,
      groundTile: 18,
      // Walls (the kitchen's cellar, the pier's piles, the world's edge) are weathered barn boards.
      cliff: barnBoardsTexture,
      decor: 'strawfield',
      distant: { shape: 'hill', color: 0x7a9ab0 },
      haze: 0.3,
      duotone: [0x1a1206, 0xd89a2a, 0xfff0a0],
      skyCycle: false,
      dust: 0xe0c890,
      barrier: { map: farmFenceTexture, crawl: false },
    },
  },
  decors: {
    strawfield: {
      rock: () => tex.stoneTexture([130, 118, 100], [200, 190, 170]),
      rocks: 0,
      features: 200,
      feature: (animated) => strawFeature(animated),
      // Straws in the Wind: white-washed fence posts along the farm track, wildflowers and straw in the verge, the media's hoardings never quitting.
      detail: {
        edge: { kind: 'fence', height: 1.2, spacing: 10, color: 0xece6d8, stripe: 0x8a7a64 },
        cover: { shape: 'tuft', colors: [0x4a9a3a, 0x6ab84a, 0xe0bc5c, 0xe8202a, 0xffd21a, 0xffffff, 0x9a4ad8], count: 1900 },
        boards: { words: ['STRAWS IN THE WIND', 'IS IT ALL ENDING?', 'BREAKING NEWS', 'PANDEMONIUM', 'STAY OR GO', 'K.G.'], bg: ['#c8101a', '#f4ead0', '#1a3a8a'], fg: '#ffffff' },
        crowd: true,
      },
      // Crows tossed about over the field, and straw blowing through the air.
      life: { flock: { kind: 'bird', color: 0x1a1a20, count: 14, height: 22, size: 0.9 }, motes: { color: 0xf0cc6a, count: 380, size: 0.5, drift: 'blow' } },
    },
  },
  roads: {
    // Straws in the Wind's: a farm track through the flowers, straw blown across it.
    farmtrack: ({ bumpy }) => bumpy(farmTrackTexture(), 0.07),
  },
  landmarks: {
    strawsGate: ({ ribbon, s, animated }) => strawsGate(ribbon, s, animated),
    trashTornado: ({ ribbon, s, lm, animated }) => trashTornado(ribbon, s, lm.lateral ?? 0, animated),
    cheshireGrin: ({ ribbon, s, animated }) => cheshireGrin(ribbon, s, animated),
    hellsKitchen: ({ ribbon, s, lm, animated }) => hellsKitchen(ribbon, s, (lm.to ?? lm.s) * ribbon.scale, animated),
    forgottenPier: ({ ribbon, s, lm, animated }) => forgottenPier(ribbon, s, (lm.to ?? lm.s) * ribbon.scale, animated),
    shortStraw: ({ ribbon, s, animated }) => shortStraw(ribbon, s, animated),
  },
  hazards: {
    trafficLights: {
      // A gantry of mortal traffic lights over the road, its stop line, and the red curtain when it says stay.
      parts: (obj) => trafficLightParts(obj),
      pose: (obj, parts, p, elapsed) => poseTrafficLight(obj, parts, p, elapsed),
    },
  },
};
