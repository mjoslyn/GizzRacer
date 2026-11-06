import * as tex from '../render/textures';
import { algorithm, assemblyDeck, claddingTexture, concreteGroundTexture, conveyorRoadTexture, emptyOffice, factoryFeature, factoryField, factorySkyline, hazardRailTexture, lightsOut, pinkSlips, posePress, pressParts, robotArms, screenWall, serverFarm, timeClock } from '../render/automation';
import type { Ribbon } from '../tracks/track';
import type { KitView } from './view';

/** Automation's look (kits/view.ts): the world, scenery, road, landmarks and hazard of its kit (automation.ts), built in render/automation.ts. */

declare module '../render/themes' {
  interface KitDecors {
    assembly: 'automation';
  }
}

/** The name of the section of `ribbon` at `s` metres. */
const sectionAt = (ribbon: Ribbon, s: number): string => ribbon.def.sections.find((q) => s >= q.from * ribbon.scale - 1e-6 && s <= q.to * ribbon.scale + 1e-6)?.name ?? '';

export const view: KitView<'automation'> = {
  id: 'automation',
  themes: {
    // Automation: a factory at dusk under its own smog, sodium lamps coming on, the sky orange over steel.
    automated: {
      sky: { zenith: '#1a2230', high: '#3a4250', low: '#a86a40', horizon: '#e89a50', below: '#3a3030', ground: '#2a2a2e', cloud: '120,100,90', clouds: 30 },
      fog: { color: 0x7a6a60, near: 140, far: 720 },
      hemi: { sky: 0xd8c0a0, ground: 0x3a3a40, intensity: 1.6 },
      sun: { color: 0xffc080, intensity: 1.7 },
      sunFlare: 0.3,
      ground: concreteGroundTexture,
      groundTile: 24,
      // The world's edge: corrugated steel cladding.
      cliff: claddingTexture,
      decor: 'assembly',
      distant: { shape: 'city', color: 0x2a2a30 },
      haze: 0.2,
      duotone: [0x101418, 0xd0803a, 0xfff0d0],
      skyCycle: false,
      dust: 0x9a8a7a,
      // Yellow and black stripes.
      barrier: { map: hazardRailTexture, crawl: false },
      roadGlow: 0.04,
      edgeLine: 0xffc21a,
      edgeWidth: 0.45,
      murk: 0x3a3430,
    },
  },
  decors: {
    assembly: {
      rock: () => tex.stoneTexture([80, 80, 86], [140, 140, 146]),
      rocks: 40,
      features: 130,
      // The factory: crates, barrels, arms, robots, screens and racks by the stretch they're beside.
      feature: (animated, track) => factoryFeature(animated, track),
      // Automation: sodium lamp posts along the belt, nuts and bolts for ground cover, notices.
      detail: {
        edge: { kind: 'lamp', height: 4, spacing: 26, color: 0x3a3e46, stripe: 0xffc21a },
        light: 0xffa040,
        cover: { shape: 'tuft', colors: [0x5a6068, 0x7a8088, 0x3a3e44, 0xffc21a, 0xb08850], count: 900 },
        boards: { words: ['AUTOMATION', 'NO BREAKS', 'SHIFT NEVER ENDS', 'EFFICIENCY 100%', 'NO HUMANS', 'K.G.'], bg: ['#16161a', '#22252a'], fg: '#ffc21a' },
        crowd: false,
      },
      // Drones over the floor, and dust and sparks in the sodium light.
      life: { flock: { kind: 'bird', color: 0x1a1c20, count: 10, height: 22, size: 0.8 }, motes: { color: 0xffc080, count: 260, size: 0.3, drift: 'float', glow: true } },
    },
  },
  roads: {
    // Automation's: a conveyor belt, rolling.
    conveyor: ({ bumpy }) => bumpy(conveyorRoadTexture(), 0.05),
  },
  landmarks: {
    timeClock: ({ ribbon, s, animated }) => timeClock(ribbon, s, animated),
    factorySkyline: ({ track, animated }) => factorySkyline(track, animated),
    factoryField: ({ track, ribbon, s, lm, animated }) => factoryField(track, ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, sectionAt(ribbon, s), animated),
    robotArms: ({ ribbon, s, lm, animated }) => robotArms(ribbon, s, lm.lateral ?? 0, animated),
    emptyOffice: ({ ribbon, s, lm, animated }) => emptyOffice(ribbon, s, lm.lateral ?? 0, animated),
    screenWall: ({ ribbon, s, lm, animated }) => screenWall(ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, animated),
    assemblyDeck: ({ ribbon, s, lm, animated }) => assemblyDeck(ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, animated),
    algorithm: ({ ribbon, s, lm, animated }) => algorithm(ribbon, s, lm.lateral ?? 0, animated),
    pinkSlips: ({ ribbon, s, lm, animated }) => pinkSlips(ribbon, s, lm.lateral ?? 0, animated),
    serverFarm: ({ ribbon, s, lm, animated }) => serverFarm(ribbon, s, lm.lateral ?? 0, animated),
    lightsOut: ({ ribbon, s, lm, animated }) => lightsOut(ribbon, s, lm.lateral ?? 0, animated),
  },
  hazards: {
    presses: {
      // The presses, a yellow gantry with its heads slamming down lane by lane on the beat, a lamp over each lane.
      parts: (obj) => pressParts(obj),
      pose: (obj, parts, p, elapsed) => posePress(obj, parts, p, elapsed),
    },
  },
};
