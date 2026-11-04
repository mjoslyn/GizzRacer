import * as tex from '../render/textures';
import { boardConcreteTexture, companion, dewGroundTexture, emptyFeature, emptyStage, metronome, paleRoadTexture, picketTexture as whitePicketTexture, poseWanderer, setInStone, shotClock, wandererParts } from '../render/empty';
import type { KitView } from './view';

/** Empty's look (kits/view.ts): the world, scenery, road, landmarks and hazard of its kit (empty.ts), built in render/empty.ts. */

declare module '../render/themes' {
  interface KitDecors {
    emptyTown: 'empty';
  }
}

export const view: KitView<'empty'> = {
  id: 'empty',
  themes: {
    // Empty: an empty town on a pale plain at dawn, nobody about; a milky, faded sky, pale peach low down where the sun is coming up cold, a white moon still out; mist over everything; the plain grey-green with dew, the road pale old concrete with a slate kerb down each edge.
    emptiness: {
      sky: { zenith: '#8c9eb2', high: '#b4c0cc', low: '#e2d8cc', horizon: '#f6e4cc', below: '#d6d0c6', ground: '#7c8a80', cloud: '238,234,228', clouds: 14, moon: '#f6f4f0' },
      fog: { color: 0xdcd8d2, near: 100, far: 560 },
      hemi: { sky: 0xeef2f6, ground: 0x66706a, intensity: 1.45 },
      sun: { color: 0xfff0dc, intensity: 1.55 },
      ground: dewGroundTexture,
      groundTile: 18,
      // Walls are the cut's and the world's edge: board-marked concrete, pale and stained.
      cliff: boardConcreteTexture,
      decor: 'emptyTown',
      // An empty city on the horizon, pale in the mist.
      distant: { shape: 'city', color: 0xa4aab2 },
      haze: 0,
      duotone: [0x2a2e38, 0x9aa4ae, 0xf6ece0],
      skyCycle: false,
      dust: 0xc8c6c0,
      barrier: { map: whitePicketTexture, crawl: false },
      // A pale road on the grey-green plain, its slate kerb drawn on down each edge so the way reads far ahead in the mist.
      edgeLine: 0x4a5464,
      edgeWidth: 0.45,
      murk: 0x9a968e,
    },
  },
  decors: {
    emptyTown: {
      rock: () => tex.stoneTexture([150, 150, 146], [214, 212, 206]),
      rocks: 30,
      features: 230,
      feature: (animated) => emptyFeature(animated),
      // Empty: old street lamps along the empty town's road, still lit in the dawn for nobody; pale grass and straw in the verge.
      detail: {
        edge: { kind: 'lamp', height: 4.4, spacing: 24, color: 0x5e626a, stripe: 0xdcd8d0 },
        light: 0xfff0d8,
        cover: { shape: 'tuft', colors: [0x8a9480, 0xa8a890, 0x6a7a6a, 0xc8c4b0], count: 1300 },
        boards: { words: ['EMPTY', 'FEELING SO EMPTY', 'WHO?', 'NEVER SET IN STONE', '3/4', "I'M IN YOUR MIND FUZZ"], bg: ['#ece8e0', '#c8ccd2'], fg: '#4a525e' },
        crowd: false,
      },
      // A few birds over the empty town, and pale dust hanging in the dawn light.
      life: { flock: { kind: 'bird', color: 0x4a4e56, count: 6, height: 20, size: 0.8 }, motes: { color: 0xf4f0e8, count: 220, size: 0.35, drift: 'float' } },
    },
  },
  roads: {
    // Empty's: pale old concrete slabs, a slate kerb down each edge.
    pale: ({ bumpy }) => bumpy(paleRoadTexture(), 0.05),
  },
  landmarks: {
    metronome: ({ ribbon, s, animated }) => metronome(ribbon, s, animated),
    emptyStage: ({ ribbon, s, lm, animated }) => emptyStage(ribbon, s, lm.lateral ?? 45, animated),
    shotClock: ({ track, ribbon, s, animated }) => shotClock(ribbon, s, track.def.pits, animated),
    companion: ({ ribbon, s, lm, animated }) => companion(ribbon, s, lm.lateral ?? -45, animated),
    setInStone: ({ track, ribbon, s, animated }) => setInStone(ribbon, s, track.def.pits, animated),
  },
  hazards: {
    wanderers: {
      // A coat and hat wandering with nobody in them, or the one you're with.
      parts: (obj, pose) => wandererParts(obj, pose.lane === 1),
      pose: (obj, parts, p) => poseWanderer(obj, parts, p),
    },
  },
};
