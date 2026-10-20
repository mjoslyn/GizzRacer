import * as THREE from 'three';
import * as tex from './textures';
import { DESERT_SKY, type SkyColors } from './textures';

export type ThemeId = 'desert' | 'speedway' | 'volcano' | 'jungle' | 'lagoon' | 'glacier' | 'neon' | 'dream' | 'petro' | 'mars' | 'storm' | 'void' | 'phantom' | 'airfield' | 'grove' | 'doubt';
export type DecorKind = 'desert' | 'meadow' | 'volcanic' | 'jungle' | 'lagoon' | 'glacier' | 'city' | 'sky' | 'wasteland' | 'colony' | 'plains' | 'cosmos' | 'isle' | 'airstrip' | 'grove' | 'sea';

/** Everything that makes a track's world look like itself. */
export interface Theme {
  sky: SkyColors;
  fog: { color: number; near: number; far: number };
  hemi: { sky: number; ground: number; intensity: number };
  sun: { color: number; intensity: number };
  ground: () => THREE.Texture;
  groundTile: number;
  /** Boundary cliffs and canyon walls. */
  cliff: () => THREE.Texture;
  /** Off-road scenery. */
  decor: DecorKind;
  /** Silhouettes on the horizon. */
  distant: { shape: 'mesa' | 'hill' | 'volcano' | 'mountain' | 'city' | 'cloud' | 'flare' | 'anvil' | 'planet'; color: number };
  /** Heat haze strength on the straights, 0..1 (render/postfx.ts). */
  haze: number;
  /**
   * The Rattlesnake video's posterized duotone in this world's colours
   * (render/postfx.ts): the shadows, the body, and the highlights that burn
   * like a snake's eye.
   */
  duotone: [number, number, number];
  /** The sky turns a full circle of hue over a 3-lap race. */
  skyCycle: boolean;
  /** Dust kicked up off-road and on loose surfaces. */
  dust: number;
  /** Low trackside barriers; `crawl` scrolls the texture along the road. */
  barrier: { map: () => THREE.Texture; crawl: boolean };
  /** Rain sheeting down round the camera, and lightning lighting up the sky. */
  storm?: boolean;
  /** Dark worlds: the road glows this much with its own texture, and its curbs half again, so the way stays readable. */
  roadGlow?: number;
}

export const THEMES: Record<ThemeId, Theme> = {
  desert: {
    sky: DESERT_SKY,
    fog: { color: 0xe9b88a, near: 180, far: 900 },
    hemi: { sky: 0xa8c8ff, ground: 0xc07a48, intensity: 1.5 },
    sun: { color: 0xfff0d0, intensity: 2.4 },
    ground: tex.sandTexture,
    groundTile: 18,
    cliff: tex.strataTexture,
    decor: 'desert',
    distant: { shape: 'mesa', color: 0xa4502e },
    haze: 1,
    duotone: [0x0a0002, 0xc00410, 0xf0c020],
    skyCycle: true,
    dust: 0xf4e4c8,
    barrier: { map: tex.diamondTexture, crawl: true },
  },
  speedway: {
    sky: { zenith: '#1a4fd8', high: '#3b7cf0', low: '#9cc8ff', horizon: '#e8f4ff', below: '#a8d890', ground: '#4a7a30', cloud: '255,255,255', clouds: 34 },
    fog: { color: 0xcfe6ff, near: 220, far: 1000 },
    hemi: { sky: 0xbfe0ff, ground: 0x4a8a3a, intensity: 1.6 },
    sun: { color: 0xfffaf0, intensity: 2.2 },
    ground: tex.grassTexture,
    groundTile: 14,
    cliff: () => tex.stoneTexture([90, 96, 84], [150, 156, 140]),
    decor: 'meadow',
    distant: { shape: 'hill', color: 0x3f7a3a },
    haze: 0,
    duotone: [0x020a02, 0x18a030, 0xf0f060],
    skyCycle: false,
    dust: 0xd8d0b0,
    barrier: { map: tex.curbTexture, crawl: false },
  },
  volcano: {
    sky: { zenith: '#1a0608', high: '#3c0c0c', low: '#8a2410', horizon: '#ff7a2a', below: '#5a1a10', ground: '#1a0a08', cloud: '70,50,50', clouds: 20 },
    fog: { color: 0x5a2014, near: 120, far: 700 },
    hemi: { sky: 0xff8a50, ground: 0x2a0a08, intensity: 1.3 },
    sun: { color: 0xff9a60, intensity: 2.0 },
    ground: tex.basaltTexture,
    groundTile: 16,
    cliff: () => tex.stoneTexture([30, 24, 26], [80, 64, 60]),
    decor: 'volcanic',
    distant: { shape: 'volcano', color: 0x2a1614 },
    haze: 0.7,
    duotone: [0x0a0200, 0xe04008, 0xffe060],
    skyCycle: false,
    dust: 0x8a7a76,
    barrier: { map: () => tex.stoneTexture([40, 32, 34], [96, 80, 74]), crawl: false },
  },
  jungle: {
    sky: { zenith: '#1a5a7a', high: '#3a8aa0', low: '#a0d0c0', horizon: '#e0f0d8', below: '#6a9a5a', ground: '#2a4a20', cloud: '240,250,245', clouds: 40 },
    fog: { color: 0xa8c8b0, near: 90, far: 600 },
    hemi: { sky: 0xd0f0e0, ground: 0x2a5a20, intensity: 1.5 },
    sun: { color: 0xfff6d8, intensity: 2.0 },
    ground: tex.jungleFloorTexture,
    groundTile: 12,
    cliff: () => tex.stoneTexture([50, 70, 46], [110, 130, 96]),
    decor: 'jungle',
    distant: { shape: 'mountain', color: 0x2e5a3a },
    haze: 0,
    duotone: [0x000a04, 0x0c8040, 0xc8ff40],
    skyCycle: false,
    dust: 0xc0b48a,
    barrier: { map: tex.woodTexture, crawl: false },
  },
  lagoon: {
    sky: { zenith: '#0a6ad8', high: '#2a9af0', low: '#9ae0ff', horizon: '#f0fbff', below: '#7ad8d0', ground: '#3aa8b0', cloud: '255,255,255', clouds: 30 },
    fog: { color: 0xc8f0f4, near: 200, far: 950 },
    hemi: { sky: 0xd0f4ff, ground: 0x4ab0a8, intensity: 1.6 },
    sun: { color: 0xfff6e0, intensity: 2.3 },
    ground: tex.lagoonTexture,
    groundTile: 30,
    cliff: () => tex.stoneTexture([150, 130, 100], [220, 200, 160]),
    decor: 'lagoon',
    distant: { shape: 'hill', color: 0x2f8a5a },
    haze: 0.3,
    duotone: [0x00060a, 0x0890b0, 0xfff0a0],
    skyCycle: false,
    dust: 0xf0e6c8,
    barrier: { map: tex.boardsTexture, crawl: false },
  },
  glacier: {
    sky: { zenith: '#2a4a8a', high: '#5a8ac8', low: '#b8d8f0', horizon: '#f4faff', below: '#d8e8f4', ground: '#c8d8e8', cloud: '240,246,255', clouds: 36 },
    fog: { color: 0xdceaf6, near: 110, far: 650 },
    hemi: { sky: 0xe0f0ff, ground: 0x8aa8c8, intensity: 1.5 },
    sun: { color: 0xf4f8ff, intensity: 2.1 },
    ground: tex.snowTexture,
    groundTile: 16,
    cliff: () => tex.stoneTexture([88, 104, 124], [170, 190, 210]),
    decor: 'glacier',
    distant: { shape: 'mountain', color: 0xdce8f4 },
    haze: 0,
    duotone: [0x00040e, 0x3070d0, 0xe8fbff],
    skyCycle: false,
    dust: 0xffffff,
    barrier: { map: () => tex.stoneTexture([150, 190, 220], [220, 240, 255]), crawl: false },
  },
  neon: {
    sky: { zenith: '#05020e', high: '#140a30', low: '#3a1458', horizon: '#ff4ab8', below: '#1a0a28', ground: '#0c0818', cloud: '120,60,160', clouds: 10 },
    fog: { color: 0x241038, near: 120, far: 700 },
    hemi: { sky: 0x8a6aff, ground: 0x2a0a3a, intensity: 1.2 },
    sun: { color: 0xc8a8ff, intensity: 1.4 },
    ground: tex.neonGridTexture,
    groundTile: 12,
    cliff: () => tex.stoneTexture([30, 24, 44], [70, 60, 96]),
    decor: 'city',
    distant: { shape: 'city', color: 0x1a1030 },
    haze: 0,
    duotone: [0x06000c, 0xd010c0, 0x40fff0],
    skyCycle: false,
    dust: 0x8a7aa8,
    barrier: { map: tex.neonRoadTexture, crawl: true },
  },
  dream: {
    sky: { zenith: '#6a4ad8', high: '#a07af0', low: '#f0b8f0', horizon: '#fff0f8', below: '#e8d0f4', ground: '#d8c0ec', cloud: '255,250,255', clouds: 44 },
    fog: { color: 0xf4dcf4, near: 160, far: 900 },
    hemi: { sky: 0xffe8ff, ground: 0xb8a0e0, intensity: 1.7 },
    sun: { color: 0xfff4f0, intensity: 2.2 },
    ground: tex.cloudSeaTexture,
    groundTile: 60,
    cliff: () => tex.stoneTexture([200, 180, 230], [250, 240, 255]),
    decor: 'sky',
    distant: { shape: 'cloud', color: 0xfff4fc },
    haze: 0,
    duotone: [0x100418, 0xe050b0, 0xfff0a0],
    skyCycle: true,
    dust: 0xffffff,
    barrier: { map: tex.rainbowTexture, crawl: true },
  },
  // Petrodragonic Apocalypse: a black sky choked with smoke over a burning oil field, a blood-red sun low on the horizon.
  petro: {
    sky: { zenith: '#030102', high: '#140405', low: '#3a0a06', horizon: '#c8341a', below: '#1a0604', ground: '#080303', cloud: '40,22,20', clouds: 48 },
    fog: { color: 0x3a120c, near: 110, far: 520 },
    hemi: { sky: 0xff6a3a, ground: 0x3a1a12, intensity: 1.7 },
    sun: { color: 0xff7a4a, intensity: 2.3 },
    ground: tex.oilEarthTexture,
    groundTile: 22,
    cliff: () => tex.stoneTexture([22, 16, 16], [70, 46, 40]),
    decor: 'wasteland',
    distant: { shape: 'flare', color: 0x120808 },
    haze: 0.8,
    duotone: [0x000000, 0xd02008, 0xffa020],
    skyCycle: false,
    dust: 0x2a1c18,
    barrier: { map: tex.rustTexture, crawl: false },
    roadGlow: 0.35,
  },
  // Hell on Mars: a red planet gone wrong, the sky the colour of rust and blood, the colony burning.
  mars: {
    sky: { zenith: '#2a0806', high: '#6a1e10', low: '#b8502c', horizon: '#f0a06a', below: '#8a3a20', ground: '#5a2414', cloud: '200,110,80', clouds: 14 },
    fog: { color: 0xb0583a, near: 120, far: 640 },
    hemi: { sky: 0xffb088, ground: 0x6a2a14, intensity: 1.4 },
    sun: { color: 0xffc890, intensity: 2.1 },
    ground: tex.marsTexture,
    groundTile: 26,
    cliff: () => tex.stoneTexture([110, 44, 24], [190, 96, 60]),
    decor: 'colony',
    distant: { shape: 'mesa', color: 0x7a2a16 },
    haze: 0.6,
    duotone: [0x0a0100, 0xb02810, 0xffc080],
    skyCycle: false,
    dust: 0xd07040,
    barrier: { map: tex.corrugatedTexture, crawl: false },
  },
  // Supercell: flattened prairie under a storm the size of a county, green-black light, rain, the funnel coming.
  storm: {
    sky: { zenith: '#0a0e10', high: '#1a2428', low: '#34443e', horizon: '#9ab08a', below: '#2a3428', ground: '#1a2418', cloud: '60,70,72', clouds: 60 },
    fog: { color: 0x3c4a44, near: 70, far: 520 },
    hemi: { sky: 0xb0c8b8, ground: 0x2a3420, intensity: 1.3 },
    sun: { color: 0xc8d8c8, intensity: 1.2 },
    ground: tex.stormGrassTexture,
    groundTile: 20,
    cliff: () => tex.stoneTexture([50, 56, 54], [110, 118, 112]),
    decor: 'plains',
    distant: { shape: 'anvil', color: 0x1e2628 },
    haze: 0,
    duotone: [0x020600, 0x3a7020, 0xe0ff60],
    skyCycle: false,
    dust: 0x9aa8a8,
    barrier: { map: () => tex.stoneTexture([90, 96, 92], [160, 168, 160]), crawl: false },
    storm: true,
  },
  // Murder of the Universe: a road of starlight over nothing, planets hanging dead, the cyborg's eye watching.
  void: {
    sky: { zenith: '#000003', high: '#05021a', low: '#180640', horizon: '#7a1aa8', below: '#05020e', ground: '#020108', cloud: '90,40,150', clouds: 8 },
    fog: { color: 0x0c0420, near: 160, far: 900 },
    hemi: { sky: 0xb08aff, ground: 0x1a0a3a, intensity: 1.2 },
    sun: { color: 0xd8c8ff, intensity: 1.5 },
    ground: tex.voidTexture,
    groundTile: 140,
    cliff: () => tex.stoneTexture([30, 20, 50], [80, 60, 120]),
    decor: 'cosmos',
    distant: { shape: 'planet', color: 0x2a1a4a },
    haze: 0,
    duotone: [0x04000a, 0x6020c0, 0xf0e0ff],
    skyCycle: false,
    dust: 0xb08aff,
    barrier: { map: tex.cosmicRoadTexture, crawl: true },
  },
  // Phantom Island: an island that isn't always there, at dusk, in a sea mist. Violet sky, teal water, ghost lights.
  phantom: {
    sky: { zenith: '#120a2a', high: '#2e1c5a', low: '#6a4a9a', horizon: '#e0a8c8', below: '#4a5a7a', ground: '#2a3a44', cloud: '200,190,230', clouds: 30 },
    fog: { color: 0x8a90b8, near: 60, far: 520 },
    hemi: { sky: 0xc8b8ff, ground: 0x2a4a52, intensity: 1.45 },
    sun: { color: 0xffd0e0, intensity: 1.6 },
    ground: tex.phantomShoreTexture,
    groundTile: 18,
    cliff: () => tex.stoneTexture([58, 62, 78], [120, 128, 150]),
    decor: 'isle',
    distant: { shape: 'mountain', color: 0x4a4a78 },
    haze: 0,
    duotone: [0x04020e, 0x5a40c0, 0xa0fff0],
    skyCycle: false,
    dust: 0xc8d0e8,
    barrier: { map: () => tex.stoneTexture([80, 84, 100], [150, 156, 178]), crawl: false },
  },
  // Deadstick Drop: a cliff-top airfield on a bright windy day, the sea far below, seaplanes and a stopped propeller.
  airfield: {
    sky: { zenith: '#1a5ad0', high: '#3c86ec', low: '#9ccaf8', horizon: '#f4f8ff', below: '#7aa8c8', ground: '#4a7a3a', cloud: '255,255,255', clouds: 40 },
    fog: { color: 0xd8eaff, near: 200, far: 1000 },
    hemi: { sky: 0xc8e4ff, ground: 0x5a8a3a, intensity: 1.6 },
    sun: { color: 0xfff6e8, intensity: 2.3 },
    ground: tex.turfTexture,
    groundTile: 16,
    cliff: () => tex.stoneTexture([150, 140, 120], [220, 210, 190]),
    decor: 'airstrip',
    distant: { shape: 'hill', color: 0x5a8a5a },
    haze: 0.3,
    duotone: [0x020812, 0x2a7ad8, 0xffe880],
    skyCycle: false,
    dust: 0xe0dcc8,
    barrier: { map: tex.curbTexture, crawl: false },
  },
  // Panpsych Grove: a forest older than anyone, every tree and stone in it awake, light coming through it like amber.
  grove: {
    sky: { zenith: '#2a5a4a', high: '#5a8a5a', low: '#c8c070', horizon: '#ffe0a0', below: '#4a6a3a', ground: '#2a3a1a', cloud: '255,240,200', clouds: 22 },
    fog: { color: 0x9aa868, near: 70, far: 480 },
    hemi: { sky: 0xffe8a8, ground: 0x3a5a2a, intensity: 1.5 },
    sun: { color: 0xffd890, intensity: 2.0 },
    ground: tex.groveFloorTexture,
    groundTile: 16,
    cliff: () => tex.stoneTexture([70, 80, 56], [140, 150, 110]),
    decor: 'grove',
    distant: { shape: 'hill', color: 0x2e4a2a },
    haze: 0.25,
    duotone: [0x040800, 0x3a8a20, 0xffd040],
    skyCycle: true,
    dust: 0xc8b080,
    barrier: { map: tex.woodTexture, crawl: false },
  },
  // Sea of Doubt: the cup's end, a causeway over a black sea at night in a gale, waves breaking over it, lightning.
  doubt: {
    sky: { zenith: '#020408', high: '#0a1420', low: '#1a2a3a', horizon: '#4a6a7a', below: '#0a1418', ground: '#04080a', cloud: '50,60,70', clouds: 56 },
    fog: { color: 0x1a2630, near: 60, far: 460 },
    hemi: { sky: 0x8ab0c8, ground: 0x0a1a20, intensity: 1.25 },
    sun: { color: 0xb8d0e8, intensity: 1.2 },
    ground: tex.nightSeaTexture,
    groundTile: 30,
    cliff: () => tex.stoneTexture([26, 32, 36], [80, 92, 100]),
    decor: 'sea',
    distant: { shape: 'mountain', color: 0x0e161c },
    haze: 0,
    duotone: [0x000206, 0x105a8a, 0xc0f0ff],
    skyCycle: false,
    dust: 0xd8e8f0,
    barrier: { map: () => tex.stoneTexture([60, 66, 70], [130, 140, 146]), crawl: false },
    storm: true,
    roadGlow: 0.3,
  },
};
