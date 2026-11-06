import { ballCollision, boxingRing, evolutionMarch, floatDeck, ledBoardTexture, meltingHead, mirrorFloor, needleParts, poseNeedle, raveFeature, raveField, raveHands, skyFace, speakerStack, spoolTower, stadiumGate, stadiumSkyline, standTexture, starterPistol, staticWall, stopHand, tartanRoadTexture, tearDrop, turfGroundTexture } from '../render/intrasport';
import * as tex from '../render/textures';
import type { Ribbon } from '../tracks/track';
import type { KitView } from './view';

/** Intrasport's look (kits/view.ts): the world, scenery, road, landmarks and hazard of its kit (intrasport.ts), built in render/intrasport.ts. */

declare module '../render/themes' {
  interface KitDecors {
    raveworld: 'intrasport';
  }
}

/** The name of the section of `ribbon` at `s` metres. */
const sectionAt = (ribbon: Ribbon, s: number): string => ribbon.def.sections.find((q) => s >= q.from * ribbon.scale - 1e-6 && s <= q.to * ribbon.scale + 1e-6)?.name ?? '';

export const view: KitView<'intrasport'> = {
  id: 'intrasport',
  themes: {
    // Intrasport: a stadium at night turned rave, the floodlights on, the sky violet over the stands, lasers through the haze.
    stadiumrave: {
      sky: { zenith: '#06030e', high: '#140a2a', low: '#3a1450', horizon: '#8a2a7a', below: '#1a0a24', ground: '#0a1a10', cloud: '90,40,110', clouds: 18, stars: { count: 80, color: '#ffd8f8' }, moon: '#fff0fa' },
      fog: { color: 0x1c0e2a, near: 130, far: 680 },
      hemi: { sky: 0xd8b8ff, ground: 0x2a4a30, intensity: 1.7 },
      sun: { color: 0xfff0e0, intensity: 1.6 },
      // A night world: the floodlights are the light, the sun's flare only a glint.
      sunFlare: 0.12,
      ground: turfGroundTexture,
      groundTile: 22,
      // The walls of the tunnel and the world's edge: the stands.
      cliff: standTexture,
      decor: 'raveworld',
      distant: { shape: 'city', color: 0x120a1c },
      haze: 0,
      duotone: [0x0a0418, 0xff3aa8, 0xfff0fa],
      skyCycle: false,
      dust: 0xd8a8ff,
      // The LED boards round the pitch, the word crawling along them.
      barrier: { map: ledBoardTexture, crawl: true },
      // The red track lit a little by its own glow, a white line down each edge like the track's kerb.
      roadGlow: 0.14,
      edgeLine: 0xf8f4ff,
      edgeWidth: 0.45,
      murk: 0x1a0a2a,
    },
  },
  decors: {
    raveworld: {
      rock: () => tex.stoneTexture([40, 34, 48], [90, 80, 104]),
      rocks: 24,
      features: 180,
      // The stadium gone rave: speakers, floodlights, lasers, dancers and the song's things by the stretch it's beside.
      feature: (animated, track) => raveFeature(animated, track),
      // Intrasport: floodlit posts down the track, confetti and turf for ground cover, boards of the song.
      detail: {
        edge: { kind: 'lamp', height: 3.2, spacing: 22, color: 0x1a1824, stripe: 0xff3aa8 },
        light: 0xfff0fa,
        cover: { shape: 'tuft', colors: [0x1a4a2a, 0x2a6a3a, 0xff3aa8, 0x3af0ff, 0xd8ff3a], count: 900 },
        boards: { words: [], bg: ['#08060e', '#140a24'], fg: '#ff3aa8' },
        crowd: true,
      },
      // Glowing orbs of light over the floor, and confetti drifting down.
      life: { flock: { kind: 'orb', color: 0x3af0ff, count: 12, height: 22, size: 0.6, glow: true }, motes: { color: 0xff8ad8, count: 320, size: 0.35, drift: 'fall', glow: true } },
    },
  },
  roads: {
    // Intrasport's: a running track of red rubber and white lanes.
    tartan: ({ bumpy }) => bumpy(tartanRoadTexture(), 0.03),
  },
  landmarks: {
    stadiumGate: ({ ribbon, s, animated }) => stadiumGate(ribbon, s, animated),
    stadiumSkyline: ({ track, animated }) => stadiumSkyline(track, animated),
    raveField: ({ track, ribbon, s, lm, animated }) => raveField(track, ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, sectionAt(ribbon, s), animated),
    staticWall: ({ ribbon, s, lm, animated }) => staticWall(ribbon, s, lm.lateral ?? 30, animated),
    ballCollision: ({ ribbon, s, lm, animated }) => ballCollision(ribbon, s, lm.lateral ?? 30, animated),
    speakerStack: ({ ribbon, s, lm, animated }) => speakerStack(ribbon, s, lm.lateral ?? 30, animated),
    raveHands: ({ ribbon, s, lm, animated }) => raveHands(ribbon, s, lm.lateral ?? 30, animated),
    tearDrop: ({ ribbon, s, lm, animated }) => tearDrop(ribbon, s, lm.lateral ?? 30, animated),
    floatDeck: ({ ribbon, s, lm, animated }) => floatDeck(ribbon, s, (lm.to ?? lm.s + 100) * ribbon.scale, animated),
    starterPistol: ({ ribbon, s, lm, animated }) => starterPistol(ribbon, s, lm.lateral ?? 30, animated),
    skyFace: ({ ribbon, s, lm, animated }) => skyFace(ribbon, s, lm.lateral ?? 0, animated),
    mirrorFloor: ({ ribbon, s, lm, animated }) => mirrorFloor(ribbon, s, lm.lateral ?? 30, animated),
    boxingRing: ({ ribbon, s, lm, animated }) => boxingRing(ribbon, s, lm.lateral ?? 30, animated),
    spoolTower: ({ ribbon, s, lm, animated }) => spoolTower(ribbon, s, lm.lateral ?? 30, animated),
    meltingHead: ({ ribbon, s, lm, animated }) => meltingHead(ribbon, s, lm.lateral ?? 30, animated),
    evolutionMarch: ({ ribbon, s, lm, animated }) => evolutionMarch(ribbon, s, lm.lateral ?? 30, animated),
    stopHand: ({ ribbon, s, lm, animated }) => stopHand(ribbon, s, lm.lateral ?? 30, animated),
  },
  hazards: {
    needles: {
      // The giant needle on its gantry, stabbing down on the beat and stepping across the road, the stitch it pulled out of lit.
      parts: (obj) => needleParts(obj),
      pose: (obj, parts, p, elapsed) => poseNeedle(obj, parts, p, elapsed),
    },
  },
};
