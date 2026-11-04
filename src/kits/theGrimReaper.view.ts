import * as tex from '../render/textures';
import { adobeTexture, bodyBags, chequeBank, chimneys, cinderRoadTexture, fortress, homestead, houndParts, keeperGate, openGrave, poseHounds, reaperMC, reapingFeature, scorchedGroundTexture, scytheGate, waveformRailTexture, wickedSun } from '../render/theGrimReaper';
import type { KitView } from './view';

/** The Grim Reaper's look (kits/view.ts): the world, scenery, road, landmarks and hazard of its kit (theGrimReaper.ts), built in render/theGrimReaper.ts. */

declare module '../render/themes' {
  interface KitDecors {
    reaping: 'the-grim-reaper';
  }
}

export const view: KitView<'the-grim-reaper'> = {
  id: 'the-grim-reaper',
  themes: {
    // The Grim Reaper: collection night on a dead frontier, the sun gone down dark blood red behind black cloud, the only warmth in a cold, ashen world; near black overhead, a few stars, fog lying low. Pale ash ground, a road of black cinders with its gold lines.
    grimreaper: {
      sky: { zenith: '#030306', high: '#0e0a12', low: '#2a0a0c', horizon: '#6a120c', below: '#1e0808', ground: '#0c0808', cloud: '14,10,12', clouds: 26, stars: { count: 30, color: '#c8c0c0' } },
      fog: { color: 0x241a1e, near: 110, far: 620 },
      hemi: { sky: 0x9098b0, ground: 0x2a2020, intensity: 1.35 },
      sun: { color: 0xc04a38, intensity: 1.5 },
      ground: scorchedGroundTexture,
      groundTile: 22,
      // Walls are the pit's and the world's edge: charred rock, old blood run down it.
      cliff: adobeTexture,
      decor: 'reaping',
      distant: { shape: 'mesa', color: 0x050304 },
      haze: 0,
      duotone: [0x020102, 0x7a0a08, 0xd8c8b0],
      skyCycle: false,
      dust: 0x4a4246,
      // A black rail with a cut-up sample's waveform along it in gold, playing past.
      barrier: { map: waveformRailTexture, crawl: true },
      // The black cinder road in the dark, on the pale ash: lit a little by its own texture, a gold line down each edge.
      roadGlow: 0.06,
      edgeLine: 0xe8a830,
      edgeWidth: 0.5,
    },
  },
  decors: {
    reaping: {
      rock: () => tex.stoneTexture([46, 40, 40], [110, 102, 98]),
      // The frontier, dressed by which stretch of the reaper's round it's beside.
      feature: (animated, track) => reapingFeature(animated, track),
      // The Grim Reaper: torches guttering on charred posts along the road; dead grass grey on the ash.
      detail: {
        edge: { kind: 'torch', height: 1.8, spacing: 15, color: 0x1e1818, stripe: 0x4a0a08 },
        light: 0xff4a18,
        cover: { shape: 'tuft', colors: [0x6a6258, 0x4a4440, 0x3a3430, 0x8a8070], count: 1300 },
        boards: { words: ['THE GRIM REAPER', 'ROTTING FLESH ODOROUS', 'HE CAME TO COLLECT', 'STITCHES FOR SNITCHES', 'TIME IS PRICELESS', 'REPENT'], bg: ['#050304', '#1a0404'], fg: '#c01a10' },
        crowd: false,
      },
      // Vultures and crows wheeling black over the reaper's round, and ash falling.
      life: { flock: { kind: 'vulture', color: 0x050404, count: 22, height: 26, size: 1.4 }, motes: { color: 0x8a8484, count: 420, size: 0.3, drift: 'fall' } },
    },
  },
  roads: {
    // The Grim Reaper's: black cinders and ash, a gold line down the middle.
    cinder: ({ bumpy }) => bumpy(cinderRoadTexture(), 0.06),
  },
  landmarks: {
    scytheGate: ({ ribbon, s, animated }) => scytheGate(ribbon, s, animated),
    chimneys: ({ ribbon, s, lm, animated }) => chimneys(ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, animated),
    keeperGate: ({ ribbon, s, animated }) => keeperGate(ribbon, s, animated),
    reaperMC: ({ ribbon, s, lm, animated }) => reaperMC(ribbon, s, lm.lateral ?? 0, animated),
    wickedSun: ({ ribbon, s, animated }) => wickedSun(ribbon, s, animated),
    chequeBank: ({ ribbon, s, lm, animated }) => chequeBank(ribbon, s, lm.lateral ?? 0, animated),
    fortress: ({ ribbon, s, lm, animated }) => fortress(ribbon, s, (lm.to ?? lm.s + 80) * ribbon.scale, animated),
    bodyBags: ({ ribbon, s, lm, animated }) => bodyBags(ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, animated),
    homestead: ({ ribbon, s, lm, animated }) => homestead(ribbon, s, lm.lateral ?? 0, animated),
    openGrave: ({ track, ribbon, s, animated }) => openGrave(ribbon, s, track.def.pits, animated),
  },
  hazards: {
    hellhounds: {
      // A pack of hellhounds, their dens in the pit's walls, and the stitches across the road they sniff out.
      parts: (obj) => houndParts(obj),
      pose: (obj, parts, p, elapsed) => poseHounds(obj, parts, p, elapsed),
    },
  },
};
