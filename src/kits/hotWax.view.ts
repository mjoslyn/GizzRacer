import * as THREE from 'three';
import * as tex from '../render/textures';
import { armchair, floorboardTexture, floorJoists, giantBed, giantCandle, giantFeet, giantLeaves, giantLeg, glassHead, kitchenSink, lavaLamp, learningHow, lordShrine, poseWaxFlow, rugHill, spiltDrink, springKing, wallpaperTexture, waxDoor, waxFlowParts, waxGlowTexture, waxJungle, waxMaze, waxRailTexture, waxRoadTexture, waxworksFeature, windowSill } from '../render/hotWax';
import type { KitView } from './view';

/** Hot Wax's look (kits/view.ts): the world, scenery, road, landmarks and hazard of its kit (hotWax.ts), built in render/hotWax.ts. */

declare module '../render/themes' {
  interface KitDecors {
    waxworks: 'hot-wax';
  }
}

export const view: KitView<'hot-wax'> = {
  id: 'hot-wax',
  themes: {
    // Hot Wax: a house at night, the karts tiny in it, lit by candles: the ceiling lost in smoke overhead, the glow of the flames low down, the walls papered in 60s circles; giant dark floorboards with the wax creeping over everything. A pale road of set wax, molten at its edges, an orange line down each.
    hotwax: {
      sky: { zenith: '#0c0408', high: '#26080e', low: '#5e1c14', horizon: '#dc642a', below: '#4a1a0c', ground: '#1a0a06', cloud: '70,34,28', clouds: 14 },
      fog: { color: 0x2e1410, near: 150, far: 780 },
      hemi: { sky: 0xffcc98, ground: 0x5a2a1a, intensity: 1.65 },
      sun: { color: 0xffb478, intensity: 2.2 },
      ground: floorboardTexture,
      groundTile: 22,
      // Walls are the room's, and the sides of the cut under the floor: 60s wallpaper.
      cliff: wallpaperTexture,
      decor: 'waxworks',
      // The furniture of the house, dark shapes far off.
      distant: { shape: 'mesa', color: 0x120604 },
      haze: 0.4,
      duotone: [0x12040a, 0xe0501a, 0xfff0c0],
      skyCycle: false,
      dust: 0x8a5a3a,
      barrier: { map: waxRailTexture, crawl: false },
      // The spilt drink: cherry red.
      murk: 0x6a1420,
      roadGlow: 0.1,
      edgeLine: 0xff8a2a,
      edgeWidth: 0.6,
    },
  },
  decors: {
    waxworks: {
      // Hot Wax: lumps of set wax on the floor.
      rock: () => tex.stoneTexture([196, 150, 104], [250, 226, 190]),
      rocks: 90,
      features: 220,
      // Hot Wax's floor: candles, bottles and drips everywhere, house plants and toy animals round the safari.
      feature: (animated, track) => waxworksFeature(animated, track),
      // Hot Wax: little candles burning along the road, drops of wax spattered on the boards.
      detail: {
        edge: { kind: 'torch', height: 1.6, spacing: 14, color: 0xf0e2c4, stripe: 0xb0201a },
        light: 0xffa040,
        cover: { shape: 'pebble', colors: [0xf0e2c4, 0xf0e2c4, 0xe8601a, 0xb0201a, 0xe0a020, 0x5a1a40], count: 1300 },
        boards: { words: ['HOT WAX', "C'MON GET AROUND", "EVERYBODY'S LEARNING HOW", 'COME ON A SAFARI WITH ME', 'ODDMENTS', 'HOT WAX!'], bg: ['#e0601a', '#5a1a40', '#e0a020', '#6a7a26'], fg: '#fff4dc' },
        crowd: false,
      },
      // Moths round the candles, and sparks rising off the flames.
      life: { flock: { kind: 'moth', color: 0xe8d8b0, count: 18, height: 14, size: 0.9 }, motes: { color: 0xffa040, count: 340, size: 0.35, drift: 'rise', glow: true } },
    },
  },
  roads: {
    // Hot Wax's: a slick of set wax, cream marbled with orange, molten and glowing down its edges.
    wax: () => {
      const map = waxRoadTexture();
      return new THREE.MeshPhongMaterial({ map, emissive: 0xffffff, emissiveMap: waxGlowTexture(), emissiveIntensity: 0.6, shininess: 45, specular: 0x5a4a38 });
    },
  },
  landmarks: {
    waxDoor: ({ ribbon, s, animated }) => waxDoor(ribbon, s, animated),
    floorJoists: ({ track, ribbon, s, lm }) => floorJoists(track, ribbon, s, (lm.to ?? lm.s + 150) * ribbon.scale),
    rugHill: ({ ribbon, s }) => rugHill(ribbon, s),
    windowSill: ({ ribbon, s, lm, animated }) => windowSill(ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, animated),
    giantCandle: ({ ribbon, s, lm, animated }) => giantCandle(ribbon, s, lm.lateral ?? 0, animated),
    lavaLamp: ({ ribbon, s, lm, animated }) => lavaLamp(ribbon, s, lm.lateral ?? 0, animated),
    waxJungle: ({ track, ribbon, s, lm, animated }) => waxJungle(track, ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, animated),
    armchair: ({ ribbon, s, animated }) => armchair(ribbon, s, animated),
    giantFeet: ({ ribbon, s, animated }) => giantFeet(ribbon, s, animated),
    kitchenSink: ({ ribbon, s, lm, animated }) => kitchenSink(ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, animated),
    spiltDrink: ({ track, ribbon, s, animated }) => spiltDrink(ribbon, s, track.def.pits, animated),
    lordShrine: ({ ribbon, s, lm, animated }) => lordShrine(ribbon, s, lm.lateral ?? 0, animated),
    glassHead: ({ ribbon, s, animated }) => glassHead(ribbon, s, animated),
    waxMaze: ({ track, ribbon, s, lm }) => waxMaze(track, ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale),
    giantLeaves: ({ ribbon, s, lm, animated }) => giantLeaves(ribbon, s, (lm.to ?? lm.s + 80) * ribbon.scale, animated),
    giantBed: ({ ribbon, s, animated }) => giantBed(ribbon, s, animated),
    giantLeg: ({ ribbon, s, lm, animated }) => giantLeg(ribbon, s, lm.lateral ?? 0, animated),
    springKing: ({ ribbon, s, lm, animated }) => springKing(ribbon, s, lm.lateral ?? 0, animated),
    learningHow: ({ track, ribbon, s, animated }) => learningHow(ribbon, s, track.def.pits, animated),
  },
  hazards: {
    waxFlows: {
      // A tongue of hot wax creeping across the road, molten, cooling and set.
      parts: (obj) => waxFlowParts(obj),
      pose: (obj, parts, p, elapsed) => poseWaxFlow(obj, parts, p, elapsed),
    },
  },
};
