import * as tex from '../render/textures';
import { bedroom, biccyHeap, brainBall, broAvatar, commentRailTexture, commentWall, deckFeed, echoFeature, echoGate, echoSkyline, feedField, feedRoadTexture, flyCloud, membraneTexture, mobParts, poseMob, spiderCrow, staticGroundTexture, tearEye } from '../render/minimumBrainSize';
import type { Ribbon } from '../tracks/track';
import type { KitView } from './view';

/** Minimum Brain Size's look (kits/view.ts): the world, scenery, road, landmarks and hazard of its kit (minimumBrainSize.ts), built in render/minimumBrainSize.ts. */

declare module '../render/themes' {
  interface KitDecors {
    echoworld: 'minimum-brain-size';
  }
}

/** The name of the section of `ribbon` at `s` metres. */
const sectionAt = (ribbon: Ribbon, s: number): string => ribbon.def.sections.find((q) => s >= q.from * ribbon.scale - 1e-6 && s <= q.to * ribbon.scale + 1e-6)?.name ?? '';

export const view: KitView<'minimum-brain-size'> = {
  id: 'minimum-brain-size',
  themes: {
    // Minimum Brain Size: the inside of an echo chamber at night, a monitor's glow in the dark, sickly and close.
    echochamber: {
      sky: { zenith: '#04060c', high: '#0c1622', low: '#1c3a3e', horizon: '#4a7a6a', below: '#0c1820', ground: '#080c14', cloud: '40,70,70', clouds: 22, stars: { count: 90, color: '#cfeaff' }, moon: '#e8fff0' },
      fog: { color: 0x12242a, near: 110, far: 640 },
      hemi: { sky: 0x8ab8c8, ground: 0x2a3040, intensity: 1.5 },
      sun: { color: 0xbfe8ff, intensity: 1.5 },
      // A night world: the sun's lens flare, a screen-wide yellow wash from the hub, is a faint glint.
      sunFlare: 0.12,
      ground: staticGroundTexture,
      groundTile: 20,
      // Walls of the cut and the world's edge: a wet membrane, the inside of something.
      cliff: membraneTexture,
      decor: 'echoworld',
      distant: { shape: 'city', color: 0x0a1218 },
      haze: 0,
      duotone: [0x02060c, 0x2a9ac0, 0xd8fff0],
      skyCycle: false,
      dust: 0x6a8a90,
      // A wall of comments.
      barrier: { map: commentRailTexture, crawl: true },
      // A dark world: the pale feed lit a little by its own glow, a cyan line down each edge.
      roadGlow: 0.16,
      edgeLine: 0x7ae8ff,
      edgeWidth: 0.5,
      murk: 0x0e2a30,
    },
  },
  decors: {
    echoworld: {
      rock: () => tex.stoneTexture([40, 30, 40], [110, 70, 80]),
      rocks: 30,
      features: 130,
      // The echo chamber: screens, pop-ups, avatars and litter by the stretch of the feed it's beside.
      feature: (animated, track) => echoFeature(animated, track),
      // Minimum Brain Size: monitor-lit posts along the feed, dead pixels for ground cover, boards of the song.
      detail: {
        edge: { kind: 'lamp', height: 3.4, spacing: 24, color: 0x1a2030, stripe: 0x7ae8ff },
        light: 0x7ae8ff,
        cover: { shape: 'tuft', colors: [0x1a2434, 0x2a3a50, 0x3a5a6a, 0x7ae8ff, 0xff2a3a], count: 900 },
        boards: { words: [], bg: ['#06101c', '#101826'], fg: '#7ae8ff' },
        crowd: false,
      },
      // Flies round the screens, and dust drifting in the monitor light.
      life: { flock: { kind: 'bird', color: 0x07080a, count: 14, height: 18, size: 0.7 }, motes: { color: 0x9adaff, count: 300, size: 0.3, drift: 'fall', glow: true } },
    },
  },
  roads: {
    // Minimum Brain Size's: a scrolling feed of cards.
    feed: ({ bumpy }) => bumpy(feedRoadTexture(), 0.04),
  },
  landmarks: {
    echoGate: ({ ribbon, s, animated }) => echoGate(ribbon, s, animated),
    echoSkyline: ({ track, animated }) => echoSkyline(track, animated),
    feedField: ({ track, ribbon, s, lm, animated }) => feedField(track, ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, sectionAt(ribbon, s), animated),
    bedroom: ({ ribbon, s, lm, animated }) => bedroom(ribbon, s, lm.lateral ?? 0, animated),
    spiderCrow: ({ ribbon, s, lm, animated }) => spiderCrow(ribbon, s, lm.lateral ?? 0, animated),
    commentWall: ({ ribbon, s, lm, animated }) => commentWall(ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, animated),
    flyCloud: ({ ribbon, s, lm, animated }) => flyCloud(ribbon, s, lm.lateral ?? 0, animated),
    biccyHeap: ({ ribbon, s, lm, animated }) => biccyHeap(ribbon, s, lm.lateral ?? 0, animated),
    brainBall: ({ ribbon, s, lm, animated }) => brainBall(ribbon, s, lm.lateral ?? 0, animated),
    tearEye: ({ ribbon, s, lm, animated }) => tearEye(ribbon, s, lm.lateral ?? 0, animated),
    broAvatar: ({ ribbon, s, lm, animated }) => broAvatar(ribbon, s, lm.lateral ?? 0, animated),
    deckFeed: ({ ribbon, s, lm, animated }) => deckFeed(ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, animated),
  },
  hazards: {
    mobs: {
      // The mob, faceless grey avatars closing ranks across the road, flies over them and the one gap lit.
      parts: (obj) => mobParts(obj),
      pose: (obj, parts, p, elapsed) => poseMob(obj, parts, p, elapsed),
    },
  },
};
