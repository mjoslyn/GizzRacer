import * as THREE from 'three';
import { glowTexture } from '../textures';

/**
 * The scenery toolkit's basics, the helpers every world module had its own
 * copy of: shared materials, glow and smoke sprites, a weighted pick,
 * colour jitter and canvases to paint on.
 */

/** Per-frame updates: anything that moves pushes one (a KitView's `animated`). */
export type Animated = ((time: number) => void)[];
export type Rand = () => number;

/** Made once and shared: textures and materials go on hundreds of meshes. */
export function once<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
}

const lamberts = new Map<string, THREE.MeshLambertMaterial>();
const basics = new Map<string, THREE.MeshBasicMaterial>();

/**
 * A lit material in `color`, made once per colour and options and shared by
 * everything that asks for it (`flat` for faceted shading, `double` for
 * thin cloth and leaves, `emissive` to lift it a little in a dark world).
 * Don't animate a shared material's colour: make your own for that.
 */
export function matte(color: number, o: { flat?: boolean; double?: boolean; emissive?: number } = {}): THREE.MeshLambertMaterial {
  const key = `${color}|${o.flat ? 1 : 0}|${o.double ? 1 : 0}|${o.emissive ?? 0}`;
  let m = lamberts.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: !!o.flat, side: o.double ? THREE.DoubleSide : THREE.FrontSide, emissive: o.emissive ?? 0 });
    lamberts.set(key, m);
  }
  return m;
}

/** An unlit material in `color`, shared: windows, neon tubes, molten things, anything that glows in the dark. */
export function lit(color: number, fog = true): THREE.MeshBasicMaterial {
  const key = `${color}|${fog ? 1 : 0}`;
  let m = basics.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, fog });
    basics.set(key, m);
  }
  return m;
}

/** Shared materials for a palette of colours, to pick from for variety. */
export function palette(colors: readonly number[], o: { flat?: boolean; double?: boolean } = {}): THREE.MeshLambertMaterial[] {
  return colors.map((c) => matte(c, o));
}

/** The soft white disc every glow, flame and puff is drawn with. */
export const glowMap = once(() => glowTexture());

/** A glow: an additive sprite `size` across (halos, flames, lamps, eyes in the dark). Its own material, so its opacity can be animated. */
export function glowSprite(color: number, size: number, opacity = 1, fog = true): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog }));
  s.scale.setScalar(size);
  return s;
}

/** A puff of smoke or mist: a soft sprite, not additive, so it can darken what's behind it. */
export function smokeSprite(color: number, size: number, opacity = 0.6): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap(), color, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size);
  return s;
}

/** Picks one of `kinds` by weight. */
export function weighted<T>(rand: Rand, kinds: readonly (readonly [number, T])[]): T {
  const total = kinds.reduce((s, [w]) => s + w, 0);
  let r = rand() * total;
  for (const [w, k] of kinds) if ((r -= w) <= 0) return k;
  return kinds[kinds.length - 1][1];
}

/** A number in [min, max). */
export const range = (rand: Rand, [min, max]: readonly [number, number]): number => min + rand() * (max - min);

/** `hex` nudged in hue and lightness by up to `amount` (0 to 1), for a crowd's shirts or a field of flowers. */
export function jitter(hex: number, rand: Rand, amount = 0.08, out = new THREE.Color()): THREE.Color {
  out.setHex(hex);
  out.offsetHSL((rand() - 0.5) * amount * 0.5, (rand() - 0.5) * amount, (rand() - 0.5) * amount * 2);
  return out;
}

/** A canvas `w` by `h` to paint a texture on. */
export function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** A painted canvas as a texture, in sRGB; `repeat` to tile it. */
export function canvasTexture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
