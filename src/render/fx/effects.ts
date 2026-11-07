import type { ItemKind } from '../../items/items';
import type { FxSystem } from './fxSystem';
import { TILE } from './particles';

/**
 * The bursts: what each item and each knock throws about, as recipes over
 * the pooled particles (fx/fxSystem.ts). Counts are scaled by the detail
 * level (`fx.n`); positions are world metres, `ground` the road's height
 * there (debris lands and bounces on it).
 */

const TAU = Math.PI * 2;
const rnd = Math.random;
const spread = (k: number) => (rnd() - 0.5) * 2 * k;

/** Each item's colour, for its glow, its trail and what it leaves on whoever it hits. */
export const ITEM_COLOR: Record<ItemKind, number> = {
  fuzzPedal: 0xff4fd8,
  microtonalMine: 0xffe040,
  feedbackWave: 0x5affd0,
  riffMissile: 0xffb020,
  tempoShift: 0xffd890,
  wooCannon: 0xff7a40,
  fluteFlurry: 0xb0ffe8,
  drumRoll: 0xffb040,
  bassDrop: 0x9a40ff,
  patchCable: 0xe0e8ff,
  harmonicaWail: 0x80c0ff,
  keytarLaser: 0xff2ad0,
  gizzardWave: 0x30ff90,
  drippingTap: 0x60c8ff,
  rattle: 0xb4ff3a,
};

/** A quick bloom of light. */
export function flash(fx: FxSystem, x: number, y: number, z: number, size: number, color: number, life = 0.2): void {
  fx.add.spawn(TILE.glow).at(x, y, z).life(life).size(size * 0.6, 0.8).color(0xffffff, color).fade(0, 0);
  fx.add.spawn(TILE.flare).at(x, y, z).life(life * 0.8).size(size * 1.1, 0.4).color(color).spin(rnd() * TAU).fade(0, 0.1);
}

/** Sparks that streak out and fall, bouncing off the road. `dx, dz` leans them one way (0 for all round). */
export function sparks(fx: FxSystem, x: number, y: number, z: number, count: number, color: number, speed: number, ground: number, dx = 0, dz = 0, hot = 0xffffff): void {
  const n = fx.n(count);
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU;
    const sp = speed * (0.4 + rnd() * 0.8);
    fx.add
      .spawn(TILE.glow)
      .at(x, y, z)
      .vel(Math.cos(a) * sp + dx * speed, 1.5 + rnd() * speed * 0.5, Math.sin(a) * sp + dz * speed)
      .life(0.25 + rnd() * 0.3)
      .size(0.16 + rnd() * 0.1, -0.5)
      .color(hot, color)
      .physics(16, 1.5)
      .floor(ground + 0.05, 0.45)
      .stretch(0.035)
      .fade(0, 0.5);
  }
}

/** Puffs of smoke or dust, rising and spreading as they fade. */
export function smoke(fx: FxSystem, x: number, y: number, z: number, count: number, color: number, size: number, rise = 1.2, reach = 2, life = 0.9, alpha = 0.6): void {
  const n = fx.n(count);
  for (let i = 0; i < n; i++) {
    fx.alpha
      .spawn(TILE.puff)
      .at(x + spread(size * 0.3), y + rnd() * size * 0.3, z + spread(size * 0.3))
      .vel(spread(reach), rise * (0.5 + rnd()), spread(reach))
      .life(life * (0.7 + rnd() * 0.6))
      .size(size * (0.6 + rnd() * 0.5), 1.4)
      .color(color, color, alpha)
      .physics(0, 1.8)
      .spin(rnd() * TAU, spread(1.2))
      .fade(0.05, 0.2);
  }
}

/** A ring flat on the ground that races out to `radius` and fades: a shockwave. */
export function shockRing(fx: FxSystem, x: number, y: number, z: number, radius: number, color: number, life = 0.45, from = 0.15, alpha = 0.75): void {
  const start = Math.max(0.3, radius * 2 * from);
  // The wide ones are fainter: a ring round the whole road shouldn't white out the screen.
  const a = alpha * Math.min(1, 6 / Math.max(6, radius));
  fx.add.spawn(TILE.ring).at(x, y + 0.12, z).life(life).size(start, (radius * 2) / start - 1).color(color, color, a).flat().fade(0, 0.2);
}

/** Bits of something that fly, tumble, land and bounce, and fade where they lie. */
export function debris(fx: FxSystem, tile: number, x: number, y: number, z: number, count: number, color: number, speed: number, ground: number, size = 0.35, alt = color): void {
  const n = fx.n(count);
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU;
    const sp = speed * (0.35 + rnd() * 0.75);
    fx.alpha
      .spawn(tile)
      .at(x + spread(0.3), y, z + spread(0.3))
      .vel(Math.cos(a) * sp, speed * (0.5 + rnd() * 0.7), Math.sin(a) * sp)
      .life(1.1 + rnd() * 0.7)
      .size(size * (0.6 + rnd() * 0.7))
      .color(i % 2 ? alt : color)
      .physics(20, 0.4)
      .floor(ground + 0.08, 0.4)
      .spin(rnd() * TAU, spread(16))
      .fade(0, 0.7);
  }
}

/** Rising glints that drift and go out: embers, sparkles. */
export function embers(fx: FxSystem, tile: number, x: number, y: number, z: number, count: number, color: number, to: number, reach: number, size = 0.3, life = 1): void {
  const n = fx.n(count);
  for (let i = 0; i < n; i++) {
    fx.add
      .spawn(tile)
      .at(x + spread(reach), y + rnd(), z + spread(reach))
      .vel(spread(1.5), 1.5 + rnd() * 2.5, spread(1.5))
      .life(life * (0.6 + rnd() * 0.6))
      .size(size * (0.6 + rnd() * 0.6), -0.4)
      .color(color, to)
      .physics(-1, 1)
      .spin(rnd() * TAU, spread(4))
      .fade(0.05, 0.4);
  }
}

/** Dust thrown out round a point on the ground, low and wide: a landing, a stamp. */
export function dustRing(fx: FxSystem, x: number, y: number, z: number, count: number, color: number, speed: number, size = 1): void {
  const n = fx.n(count);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd() * 0.4;
    const sp = speed * (0.7 + rnd() * 0.5);
    fx.alpha
      .spawn(TILE.puff)
      .at(x + Math.cos(a) * 0.6, y + 0.25, z + Math.sin(a) * 0.6)
      .vel(Math.cos(a) * sp, 0.6 + rnd() * 0.8, Math.sin(a) * sp)
      .life(0.55 + rnd() * 0.35)
      .size(size * (0.7 + rnd() * 0.4), 1.6)
      .color(color, color, 0.7)
      .physics(0, 3.2)
      .spin(rnd() * TAU, spread(1))
      .fade(0.04, 0.2);
  }
}

/** A dark mark left on the road where something went off, fading slowly. */
export function scorch(fx: FxSystem, x: number, y: number, z: number, size: number, life = 2.5): void {
  fx.alpha.spawn(TILE.shadow).at(x, y + 0.06, z).life(life).size(size, 0.15).color(0x000000, 0x000000, 0.55).spin(rnd() * TAU).flat().fade(0.05, 0.5);
}

/** An item box breaking: prism glass everywhere, a flash and a ring of light; a double box in gold. */
export function boxBreak(fx: FxSystem, x: number, y: number, z: number, double: boolean): void {
  const glass = double ? [0xffe080, 0xfff4c0, 0xffc840] : [0xff8af0, 0x8af0ff, 0xfff08a, 0xffffff];
  flash(fx, x, y, z, double ? 4.5 : 3.5, double ? 0xffd040 : 0xff9af8, 0.22);
  const n = fx.n(double ? 14 : 10);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd() * 0.5;
    const sp = 4 + rnd() * 4;
    fx.alpha
      .spawn(TILE.shard)
      .at(x, y, z)
      .vel(Math.cos(a) * sp, 3 + rnd() * 4, Math.sin(a) * sp)
      .life(0.9 + rnd() * 0.5)
      .size(0.28 + rnd() * 0.25)
      .color(glass[i % glass.length], glass[i % glass.length], 0.85)
      .physics(18, 0.5)
      .floor(y - 1.05, 0.45)
      .spin(rnd() * TAU, spread(18))
      .fade(0, 0.6);
  }
  embers(fx, TILE.star, x, y, z, double ? 8 : 5, double ? 0xffe080 : 0xffffff, double ? 0xff9020 : 0xb080ff, 0.8, 0.45, 0.7);
  shockRing(fx, x, y - 1.0, z, 3, double ? 0xffc040 : 0xd080ff, 0.35);
}

/** The Microtonal Banana squashed: peel flying, a sweet puff, and its notes bent out of tune going up. */
export function bananaSplat(fx: FxSystem, x: number, y: number, z: number): void {
  flash(fx, x, y + 0.5, z, 2.5, 0xffe040, 0.16);
  debris(fx, TILE.peel, x, y + 0.5, z, 6, 0xffe040, 5, y, 0.5, 0xe8c020);
  smoke(fx, x, y + 0.4, z, 4, 0xfff0b0, 1.3, 1.4, 1.6, 0.7, 0.55);
  embers(fx, TILE.note, x, y + 0.6, z, 4, 0xfff0a0, 0xffa020, 0.6, 0.5, 1.1);
  shockRing(fx, x, y, z, 2.6, 0xffe040, 0.4);
}

/** A banana gone without a hit (pushed off the end of the road's twelve): a soft pop. */
export function bananaPop(fx: FxSystem, x: number, y: number, z: number): void {
  smoke(fx, x, y + 0.4, z, 3, 0xfff0b0, 0.9, 1, 1, 0.5, 0.45);
  embers(fx, TILE.star, x, y + 0.4, z, 3, 0xffe040, 0xffffff, 0.3, 0.3, 0.6);
}

/** The Big Fig Wasp striking: a hot flash, sparks, cogs and shards of its shell, black smoke. */
export function waspStrike(fx: FxSystem, x: number, y: number, z: number, ground: number): void {
  flash(fx, x, y, z, 4, 0xffa020, 0.22);
  sparks(fx, x, y, z, 18, 0xffb020, 9, ground);
  debris(fx, TILE.cog, x, y, z, 6, 0x6a5a40, 6, ground, 0.32, 0xffc820);
  debris(fx, TILE.shard, x, y, z, 5, 0x1a1018, 6, ground, 0.3, 0xffc820);
  smoke(fx, x, y, z, 5, 0x3a3030, 1.4, 1.6, 2, 1, 0.65);
  shockRing(fx, x, ground, z, 3.5, 0xffa020, 0.35);
}

/** A wasp out of fuel: it sputters, sheds a cog or two and pops. */
export function waspFizzle(fx: FxSystem, x: number, y: number, z: number, ground: number): void {
  smoke(fx, x, y, z, 4, 0x6a6a6a, 1, 1, 1.2, 0.9, 0.5);
  sparks(fx, x, y, z, 6, 0xffb020, 4, ground);
  debris(fx, TILE.cog, x, y, z, 3, 0x6a5a40, 3, ground, 0.26, 0xffc820);
}

/** A trailing item taking a hit: it shatters behind the kart with a clang of light, in bits of whatever `kind` came apart. */
export function shieldBreak(fx: FxSystem, x: number, y: number, z: number, ground: number, kind: ItemKind): void {
  flash(fx, x, y, z, 3, 0xe0f0ff, 0.2);
  shockRing(fx, x, ground, z, 2.4, 0xc0e0ff, 0.3);
  itemBits(fx, kind, x, y, z, 5, 5, ground);
  sparks(fx, x, y, z, 10, 0xc0e0ff, 6, ground);
}

/** Bits of an item breaking: peel for a banana, cogs for a wasp, horn for a rattle. */
function itemBits(fx: FxSystem, kind: ItemKind, x: number, y: number, z: number, count: number, speed: number, ground: number): void {
  if (kind === 'riffMissile') debris(fx, TILE.cog, x, y, z, count, 0x6a5a40, speed, ground, 0.28, 0xffc820);
  else if (kind === 'rattle') debris(fx, TILE.chunk, x, y, z, count, RATTLE_HORN, speed, ground, 0.3, RATTLE_TAN);
  else debris(fx, TILE.peel, x, y, z, count, 0xffe040, speed, ground, 0.42, 0xe8c020);
}

/** The Rattlesnake's horn, in its two shades, and its glow. */
const RATTLE_HORN = 0xf4e2b0;
const RATTLE_TAN = 0xc89a58;
const RATTLE_GLOW = 0xb4ff3a;

/** A Rattlesnake thrown: a lime flash where it leaves the hand, a kick of dust and a shake of light. */
export function rattleThrow(fx: FxSystem, x: number, y: number, z: number, ground: number, heading: number): void {
  flash(fx, x, y + 0.5, z, 2.2, RATTLE_GLOW, 0.16);
  dustRing(fx, x, ground, z, 5, 0xd8c8a0, 3, 0.7);
  sparks(fx, x, y + 0.4, z, 6, RATTLE_GLOW, 4, ground, Math.sin(heading) * 0.6, Math.cos(heading) * 0.6);
}

/** A Rattlesnake coming off a wall: a spray of sparks out along its new way, a puff of grit off the wall and a little ring. */
export function rattleBounce(fx: FxSystem, x: number, y: number, z: number, ground: number, heading: number): void {
  const dx = Math.sin(heading);
  const dz = Math.cos(heading);
  flash(fx, x, y + 0.5, z, 1.6, 0xffffff, 0.1);
  sparks(fx, x, y + 0.5, z, 12, RATTLE_GLOW, 7, ground, dx * 0.5, dz * 0.5, 0xffffe0);
  smoke(fx, x, y + 0.4, z, 2, 0xb8a888, 0.7, 0.8, 1.2, 0.5, 0.5);
  fx.add.spawn(TILE.ring).at(x, y + 0.6, z).life(0.18).size(0.6, 2.5).color(0xffffff, RATTLE_GLOW, 0.9).fade(0, 0.3);
}

/**
 * A Rattlesnake breaking on a kart: the segments burst apart and bounce
 * down the road, a crack of lime light with a star burst round it, venom
 * spat in drops and a ring.
 */
export function rattleBreak(fx: FxSystem, x: number, y: number, z: number, ground: number): void {
  flash(fx, x, y + 0.6, z, 3.6, RATTLE_GLOW, 0.22);
  itemBits(fx, 'rattle', x, y + 0.6, z, 8, 6, ground);
  const n = fx.n(8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    fx.add.spawn(TILE.star).at(x, y + 0.7, z).vel(Math.cos(a) * 7, 2 + rnd() * 2, Math.sin(a) * 7).life(0.4).size(0.5, -0.6).color(0xffffff, RATTLE_GLOW).physics(4, 3).spin(a, spread(8));
  }
  const m = fx.n(6);
  for (let i = 0; i < m; i++) {
    fx.add.spawn(TILE.drop).at(x, y + 0.8, z).vel(spread(4), 3 + rnd() * 3, spread(4)).life(0.6 + rnd() * 0.3).size(0.3).color(0xd8ff80, 0x60a010).physics(18, 0.3).floor(ground + 0.05, 0.2);
  }
  shockRing(fx, x, ground, z, 3, RATTLE_GLOW, 0.35);
  smoke(fx, x, y + 0.4, z, 3, 0xc8b898, 1, 1.2, 1.5, 0.7, 0.5);
}

/** A Rattlesnake gone without a hit (run out, or over the edge): a last shake of light. */
export function rattleFizzle(fx: FxSystem, x: number, y: number, z: number, ground: number): void {
  embers(fx, TILE.glow, x, y + 0.5, z, 5, RATTLE_GLOW, 0x407010, 0.4, 0.3, 0.6);
  itemBits(fx, 'rattle', x, y + 0.5, z, 3, 3, ground);
}

/**
 * Someone ran into a trailing item: it bursts against their nose, a white
 * hot impact star in the item's colour, its bits flung forward and up, two
 * rings and a thump of dust: bigger than a shield's clang, so it reads.
 */
export function trailRam(fx: FxSystem, x: number, y: number, z: number, ground: number, kind: ItemKind): void {
  const c = ITEM_COLOR[kind];
  flash(fx, x, y, z, 4.5, c, 0.26);
  fx.add.spawn(TILE.flare).at(x, y, z).life(0.3).size(2.5, 1.2).color(0xffffff, c).spin(rnd() * TAU, 6).fade(0, 0.3);
  itemBits(fx, kind, x, y, z, 9, 7, ground);
  embers(fx, TILE.star, x, y, z, 8, 0xffffff, c, 0.8, 0.5, 0.7);
  sparks(fx, x, y, z, 16, c, 8, ground, 0, 0, 0xffffff);
  shockRing(fx, x, ground, z, 3.5, 0xffffff, 0.3);
  shockRing(fx, x, ground, z, 2.2, c, 0.45);
  dustRing(fx, x, ground, z, 6, 0xd0c0a0, 4, 0.9);
}

/** Nuclear Fusion going off: a white-hot core, two shockwaves out to its reach, sparks flat along the road, embers and a ring of smoke. */
export function fusionBlast(fx: FxSystem, x: number, y: number, z: number, ground: number, reach: number): void {
  flash(fx, x, y + 1, z, 7, 0x5affd0, 0.3);
  shockRing(fx, x, ground, z, reach, 0x5affd0, 0.5, 0.1);
  shockRing(fx, x, ground, z, reach * 0.7, 0xffffff, 0.35, 0.1);
  const n = fx.n(26);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd() * 0.2;
    const sp = 14 + rnd() * 8;
    fx.add.spawn(TILE.glow).at(x, y + 0.6, z).vel(Math.cos(a) * sp, 1 + rnd() * 2, Math.sin(a) * sp).life(0.35 + rnd() * 0.15).size(0.22, -0.4).color(0xffffff, 0x20ffa0).physics(6, 3).floor(ground + 0.05, 0.3).stretch(0.04);
  }
  embers(fx, TILE.glow, x, y + 0.6, z, 10, 0xa0ffd0, 0x108060, reach * 0.4, 0.35, 1.2);
  const m = fx.n(10);
  for (let i = 0; i < m; i++) {
    const a = (i / m) * TAU;
    fx.alpha.spawn(TILE.puff).at(x + Math.cos(a) * 1.5, ground + 0.4, z + Math.sin(a) * 1.5).vel(Math.cos(a) * 9, 0.8, Math.sin(a) * 9).life(0.8).size(1.6, 1.5).color(0x9ad8c0, 0x6a8a7a, 0.5).physics(0, 3).spin(rnd() * TAU, spread(1)).fade(0.03, 0.2);
  }
}

/** A Gamma Knife's beam finding its end: a hot spot, pink sparks and a burn on the road. */
export function laserHit(fx: FxSystem, x: number, y: number, z: number, ground: number): void {
  flash(fx, x, y, z, 2.6, 0xff40e0, 0.18);
  sparks(fx, x, y, z, 14, 0xff2ad0, 7, ground, 0, 0, 0xffe0ff);
  smoke(fx, x, ground + 0.3, z, 2, 0x5a3050, 0.8, 1.5, 0.6, 0.8, 0.4);
  scorch(fx, x, ground, z, 1.4, 1.8);
}

/** The Nonagon Infinity breaking on someone: nine-sided shards of green fire, rings and smoke. */
export function surgeBreak(fx: FxSystem, x: number, y: number, z: number, ground: number): void {
  flash(fx, x, y + 1.5, z, 8, 0x30ff90, 0.32);
  shockRing(fx, x, ground, z, 7, 0x30ff90, 0.55, 0.1);
  shockRing(fx, x, ground, z, 4, 0xc0ffd8, 0.4, 0.1);
  const n = fx.n(9);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    fx.add.spawn(TILE.nonagon).at(x, y + 1.5, z).vel(Math.cos(a) * 8, 5 + rnd() * 4, Math.sin(a) * 8).life(0.9).size(0.9, -0.6).color(0xc0ffd8, 0x10a050).physics(12, 0.6).spin(rnd() * TAU, spread(10));
  }
  sparks(fx, x, y + 1, z, 24, 0x30ff90, 10, ground, 0, 0, 0xe0ffe8);
  smoke(fx, x, ground + 0.5, z, 6, 0x406a50, 2, 1.5, 2.5, 1.1, 0.5);
}

/** The Nonagon Infinity ridden over: it rolls on under and comes apart in green sparks. */
export function surgeFade(fx: FxSystem, x: number, y: number, z: number, ground: number): void {
  shockRing(fx, x, ground, z, 4.5, 0x30ff90, 0.5);
  embers(fx, TILE.nonagon, x, y + 1.5, z, 5, 0x80ffc0, 0x108040, 2, 0.6, 0.9);
  embers(fx, TILE.glow, x, y + 1, z, 10, 0x80ffc0, 0x108040, 2.2, 0.3, 0.8);
}

/** The Woo Cannon firing: a cloud of smoke, a muzzle flash and a ring. */
export function cannonBlast(fx: FxSystem, x: number, y: number, z: number, ground: number, heading: number): void {
  const fx_ = Math.sin(heading);
  const fz = Math.cos(heading);
  flash(fx, x, y + 0.8, z, 5, 0xff9a40, 0.25);
  shockRing(fx, x, ground, z, 4, 0xffb060, 0.4);
  sparks(fx, x, y + 0.8, z, 14, 0xff9a40, 8, ground, -fx_ * 0.6, -fz * 0.6);
  smoke(fx, x - fx_ * 1.5, y + 0.6, z - fz * 1.5, 8, 0xd8d0c8, 1.8, 1.5, 3, 1.2, 0.65);
  embers(fx, TILE.star, x, y + 0.8, z, 8, 0xffe060, 0xff4fd8, 1, 0.45, 0.8);
}

/** A kart knocked about (a bump, a ram): sparks at the point of contact, chips of paint and a puff. */
export function contact(fx: FxSystem, x: number, y: number, z: number, ground: number, strength: number, color: number, nx: number, nz: number): void {
  const k = Math.min(1.5, strength);
  flash(fx, x, y, z, 1 + k * 1.4, 0xffe8a0, 0.12);
  // Out sideways from the contact: along the tangent, both ways, and a little back.
  const n = fx.n(Math.round(6 + k * 12));
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const sp = 5 + rnd() * 7 * k;
    fx.add
      .spawn(TILE.glow)
      .at(x, y, z)
      .vel(-nz * side * sp - nx * 2 + spread(2), 1.5 + rnd() * 4, nx * side * sp - nz * 2 + spread(2))
      .life(0.2 + rnd() * 0.25)
      .size(0.14 + rnd() * 0.08, -0.5)
      .color(0xffffff, i % 3 ? 0xffc030 : 0xff7020)
      .physics(18, 1.2)
      .floor(ground + 0.05, 0.4)
      .stretch(0.04);
  }
  if (k > 0.5) debris(fx, TILE.chunk, x, y, z, Math.round(k * 3), color, 3 + k * 2, ground, 0.14);
  smoke(fx, x, y - 0.2, z, Math.round(1 + k * 2), 0xc8c0b8, 0.7 + k * 0.4, 0.8, 1.2, 0.5, 0.45);
}
