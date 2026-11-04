import * as tex from '../render/textures';
import { blackBillabong, burningCamp, bushFloorTexture, gangParts, hideoutGate, nightbushFeature, poseGang, rangeRockTexture, redDawn, redgumRoadTexture, ropeGums, slabFenceTexture, stationHomestead, stolenGun, trestle, troopersCamp, wantedPoster } from '../render/billabongValley';
import type { KitView } from './view';

/** Billabong Valley's look (kits/view.ts): the world, scenery, road, landmarks and hazard of its kit (billabongValley.ts), built in render/billabongValley.ts. */

declare module '../render/themes' {
  interface KitDecors {
    nightbush: 'billabong-valley';
  }
}

export const view: KitView<'billabong-valley'> = {
  id: 'billabong-valley',
  themes: {
    // Billabong Valley: Mad Dog Morgan's country, a dark, violent bush night in the 1860s going to a blood-red dawn: a crescent moon and stars over the black ranges, the horizon glowing red where the dawn is coming and where the camp is burning, smoke lying through the valley; the dark bush floor, and a pale red dirt road through it.
    bushranger: {
      sky: { zenith: '#03040a', high: '#0a0c18', low: '#2a1014', horizon: '#7a2410', below: '#1e0c0a', ground: '#0c0806', cloud: '30,20,22', clouds: 28, stars: { count: 180, color: '#e8e0d0' }, moon: '#e8dcc0' },
      fog: { color: 0x1e1412, near: 110, far: 640 },
      hemi: { sky: 0x9098c0, ground: 0x3a2418, intensity: 1.45 },
      sun: { color: 0xd06a48, intensity: 1.5 },
      ground: bushFloorTexture,
      groundTile: 18,
      // Walls are the ranges' and the gully's: dark granite, iron-stained.
      cliff: rangeRockTexture,
      decor: 'nightbush',
      // The ranges, old and worn round, black against the glow.
      distant: { shape: 'hill', color: 0x080606 },
      haze: 0,
      duotone: [0x040202, 0x8a1a0a, 0xf0c070],
      skyCycle: false,
      dust: 0x6a4a3a,
      barrier: { map: slabFenceTexture, crawl: false },
      // The billabong, black.
      murk: 0x101820,
      // A dark world: the pale dirt road lit a little by its own texture, a line of pale dust down each edge.
      roadGlow: 0.12,
      edgeLine: 0xf0d0a0,
      edgeWidth: 0.5,
      dawn: true,
    },
  },
  decors: {
    nightbush: {
      rock: () => tex.stoneTexture([52, 46, 42], [118, 104, 94]),
      // Mad Dog Morgan's country, dressed by which stretch of the lap it's beside.
      feature: (animated, track) => nightbushFeature(animated, track),
      // Billabong Valley: bush torches along the track, burning in the dark; dry grass; wanted notices for boards.
      detail: {
        edge: { kind: 'torch', height: 1.6, spacing: 16, color: 0x2a1c14, stripe: 0x4a3020 },
        light: 0xff7a30,
        cover: { shape: 'tuft', colors: [0x4a4a30, 0x6a5a38, 0x3a3a28, 0x8a7448, 0x5a3a28], count: 1500 },
        boards: { words: ['WANTED', 'MAD DOG MORGAN', '£1000 REWARD', 'DEAD OR ALIVE', 'BILLABONG VALLEY', 'BAIL UP!'], bg: ['#2a1e14', '#3a2616'], fg: '#e8d4a8' },
        crowd: false,
      },
      // Flying foxes over the valley, and embers rising from the burning camp into the smoke.
      life: { flock: { kind: 'bat', color: 0x140e0c, count: 16, height: 22, size: 1.1 }, motes: { color: 0xff7a30, count: 340, size: 0.35, drift: 'rise', glow: true } },
    },
  },
  roads: {
    // Billabong Valley's: a bush track of pale red dirt, worn into ruts.
    redgum: ({ bumpy }) => bumpy(redgumRoadTexture(), 0.07),
  },
  landmarks: {
    hideoutGate: ({ ribbon, s, animated }) => hideoutGate(ribbon, s, animated),
    blackBillabong: ({ track, ribbon, s, lm, animated }) => blackBillabong(ribbon, s, (lm.to ?? lm.s + 160) * ribbon.scale, track.def.pits, animated),
    ropeGums: ({ ribbon, s, lm, animated }) => ropeGums(ribbon, s, (lm.to ?? lm.s + 150) * ribbon.scale, animated),
    burningCamp: ({ ribbon, s, lm, animated }) => burningCamp(ribbon, s, lm.lateral ?? -(ribbon.halfWidthAtS(s) + 34), animated),
    troopersCamp: ({ track, ribbon, s, lm, animated }) => troopersCamp(ribbon, s, (lm.to ?? lm.s + 80) * ribbon.scale, track.def.pits, animated),
    wantedPoster: ({ ribbon, s, lm, animated }) => wantedPoster(ribbon, s, lm.lateral, animated),
    trestle: ({ ribbon, s, lm }) => trestle(ribbon, s, (lm.to ?? lm.s + 60) * ribbon.scale),
    stationHomestead: ({ ribbon, s, lm, animated }) => stationHomestead(ribbon, s, lm.lateral, animated),
    redDawn: ({ ribbon, s, animated }) => redDawn(ribbon, s, animated),
    stolenGun: ({ ribbon, s, animated }) => stolenGun(ribbon, s, animated),
  },
  hazards: {
    bushrangers: {
      // Mad Dog Morgan and his gang at the gallop, and the dust they throw up.
      parts: (obj) => gangParts(obj),
      pose: (obj, parts, p, elapsed) => poseGang(obj, parts, p, elapsed),
    },
  },
};
