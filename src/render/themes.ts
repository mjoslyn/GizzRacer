import * as THREE from 'three';
import * as tex from './textures';
import { DESERT_SKY, type SkyColors } from './textures';

export type ThemeId = 'desert' | 'speedway' | 'volcano' | 'jungle';
export type DecorKind = 'desert' | 'meadow' | 'volcanic' | 'jungle';

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
  distant: { shape: 'mesa' | 'hill' | 'volcano' | 'mountain'; color: number };
  /** Heat haze strength on the straights, 0..1 (render/postfx.ts). */
  haze: number;
  /** The sky turns a full circle of hue over a 3-lap race. */
  skyCycle: boolean;
  /** Dust kicked up off-road and on loose surfaces. */
  dust: number;
  /** Low trackside barriers; `crawl` scrolls the texture along the road. */
  barrier: { map: () => THREE.Texture; crawl: boolean };
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
    skyCycle: false,
    dust: 0xc0b48a,
    barrier: { map: tex.woodTexture, crawl: false },
  },
};
