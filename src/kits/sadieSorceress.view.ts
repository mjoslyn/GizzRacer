import * as tex from '../render/textures';
import { bigTop, broomParts, cryptWallTexture, duckingStool, flightPath, grannyCottage, hexGroundTexture, masquerade, pitchforkMob, poisonGarden, poisonPool, poseBroom, quidditchHoops, rinkGate, rinkRailTexture, rinkRoadTexture, sadieColossus, sorceryFeature } from '../render/sadieSorceress';
import type { KitView } from './view';

/** Sadie Sorceress's look (kits/view.ts): the world, scenery, road, landmarks and hazard of its kit (sadieSorceress.ts), built in render/sadieSorceress.ts. */

declare module '../render/themes' {
  interface KitDecors {
    sorcery: 'sadie-sorceress';
  }
}

export const view: KitView<'sadie-sorceress'> = {
  id: 'sadie-sorceress',
  themes: {
    // Sadie Sorceress: Sadie's night out, 80s roller disco and witchcraft; a violet night, the town's neon glowing pink low down, a sickly moon over it, stars; dark heath, and the road a pale maple roller rink floor lit by its own neon, a pink line down each edge.
    sorceress: {
      sky: { zenith: '#07030f', high: '#1c0a30', low: '#4a1450', horizon: '#c02a7a', below: '#2a0c30', ground: '#0e0814', cloud: '60,30,70', clouds: 18, stars: { count: 160, color: '#f0e0ff' }, moon: '#d8ff9a' },
      fog: { color: 0x2a1236, near: 140, far: 760 },
      hemi: { sky: 0xb8a0e0, ground: 0x302040, intensity: 1.5 },
      sun: { color: 0xd8c8ff, intensity: 1.6 },
      ground: hexGroundTexture,
      groundTile: 18,
      // Walls are crypt brick, violet-black, moss down them: the masquerade's cut and the world's edge.
      cliff: cryptWallTexture,
      decor: 'sorcery',
      distant: { shape: 'hill', color: 0x120818 },
      haze: 0,
      duotone: [0x08020e, 0xff2a9a, 0xb8ff5a],
      skyCycle: false,
      dust: 0x6a5a7a,
      // A roller rink's padded rail, its chase lights running along it.
      barrier: { map: rinkRailTexture, crawl: true },
      // A dark world: the pale rink floor lit by its own neon, a hot pink line down each edge.
      roadGlow: 0.14,
      edgeLine: 0xff3aa8,
      edgeWidth: 0.5,
      // The ducking pond: black-green, poisoned.
      murk: 0x0e2414,
    },
  },
  decors: {
    sorcery: {
      rock: () => tex.stoneTexture([40, 32, 48], [96, 84, 104]),
      rocks: 30,
      features: 230,
      // Sadie's town by night, by the stretch of the pentagram it's beside.
      feature: (animated, track) => sorceryFeature(animated, track),
      // Sadie Sorceress: crooked lamp posts with witch-hat shades along the rink road, lit violet-pink; dead heath and poison moss; boards of the song.
      detail: {
        edge: { kind: 'lamp', height: 4.2, spacing: 20, color: 0x1a1020, stripe: 0xff2a9a },
        light: 0xff5ac0,
        cover: { shape: 'tuft', colors: [0x3a2a44, 0x4a3a54, 0x2a4a24, 0x5a7a2a, 0x8aff2a], count: 1400 },
        boards: { words: ['SADIE SORCERESS', 'WILD LIKE A WITCH', 'MORE FLY THAN QUIDDITCH', 'HELLO LOVE', 'ROLLER DISCO', 'OMNIUM GATHERUM'], bg: ['#0a0612', '#2a0a2a'], fg: '#ff3aa8' },
        crowd: false,
      },
      // Bats round Sadie's town, and sparks off her broomstick drifting down, pink and green.
      life: { flock: { kind: 'bat', color: 0x0a060e, count: 16, height: 22, size: 1 }, motes: { color: 0xff6ac8, count: 340, size: 0.35, drift: 'fall', glow: true } },
    },
  },
  roads: {
    // Sadie Sorceress's: an 80s roller rink's maple floor, its lines in neon.
    rink: ({ bumpy }) => bumpy(rinkRoadTexture(), 0.04),
  },
  landmarks: {
    rinkGate: ({ ribbon, s, animated }) => rinkGate(ribbon, s, animated),
    sadieColossus: ({ ribbon, s, lm, animated }) => sadieColossus(ribbon, s, lm.lateral ?? 0, animated),
    quidditchHoops: ({ ribbon, s, animated }) => quidditchHoops(ribbon, s, animated),
    masquerade: ({ ribbon, s, lm, animated }) => masquerade(ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, animated),
    flightPath: ({ ribbon, s, lm, animated }) => flightPath(ribbon, s, (lm.to ?? lm.s + 200) * ribbon.scale, animated),
    poisonGarden: ({ ribbon, s, lm, animated }) => poisonGarden(ribbon, s, (lm.to ?? lm.s + 80) * ribbon.scale, animated),
    grannyCottage: ({ ribbon, s, lm, animated }) => grannyCottage(ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, animated),
    pitchforkMob: ({ ribbon, s, lm, animated }) => pitchforkMob(ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, animated),
    duckingStool: ({ track, ribbon, s, animated }) => duckingStool(ribbon, s, track.def.pits, animated),
    bigTop: ({ ribbon, s, lm, animated }) => bigTop(ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, animated),
    poisonPool: ({ track, ribbon, s, animated }) => poisonPool(ribbon, s, track.def.pits, animated),
  },
  hazards: {
    brooms: {
      // Sadie on her broomstick, her shadow on the road, the trail of sparks in her slipstream, and her line across the road before she swoops.
      parts: (obj) => broomParts(obj),
      pose: (obj, parts, p, elapsed) => poseBroom(obj, parts, p, elapsed),
    },
  },
};
